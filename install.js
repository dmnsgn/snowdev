import { promises as fs } from "node:fs";
import { extname, isAbsolute, join, parse, resolve } from "node:path";

import console from "console-ansi";
import deepmerge from "deepmerge";
import slash from "slash";
import { createFilter } from "@rollup/pluginutils";

import {
  RF_OPTIONS,
  resolveExports,
  pathExists,
  VERSION,
  listFormatter,
  arrayDifference,
  dotRelativeToBarePath,
  bareToDotRelativePath,
  pick,
  readJson,
  writeJson,
} from "./utils.js";

import npm from "./npm.js";
import bundle from "./bundle.js";

const DEPENDENCY_TYPES = Object.freeze({
  ALL: "all",
  DEV: "dev",
  PROD: "prod",
  CUSTOM: "custom",
});

const DEPENDENCY_SAVE_TYPE_MAP = {
  [DEPENDENCY_TYPES.ALL]: ["prod", "dev"],
  [DEPENDENCY_TYPES.DEV]: ["dev"],
  [DEPENDENCY_TYPES.PROD]: ["prod"],
  [DEPENDENCY_TYPES.CUSTOM]: [],
};

const getDependencies = async (options, type, names = []) => {
  const depsSelector =
    type === DEPENDENCY_TYPES.CUSTOM
      ? "*"
      : `*:is(${DEPENDENCY_SAVE_TYPE_MAP[type]
          .map((selector) => `.${selector}`)
          .join(",")})`;

  return JSON.parse(
    await npm.run(options.cwd, "query", [`':scope > ${depsSelector}'`]),
  )
    .map((dependency) =>
      pick(dependency, ["name", "version", "dev", "realpath"]),
    )
    .filter(({ name }) => (names.length ? names.includes(name) : true));
};

const compareDependencies = ({ name, version }, { version: v, name: n }) =>
  version === v && name === n;

const install = async (options) => {
  // Check package.json exists
  try {
    await readJson(join(options.cwd, "package.json"));
  } catch (error) {
    console.error(`install - error reading package.json\n`, error);
    return { error };
  }

  // Check invalid dependencies
  try {
    const invalid = JSON.parse(
      await npm.run(options.cwd, "query", [`':invalid'`]),
    );
    if (invalid.length) {
      console.warn(
        `install - invalid dependencies: ${listFormatter.format(invalid.map(({ pkgid }) => pkgid))}`,
      );
    }
  } catch (error) {
    // This is only a warning. Don't throw if anything unexpected happen.
  }

  // Get install type: an array of custom dependencies or one of DEPENDENCY_TYPES values
  const type = Array.isArray(options.dependencies)
    ? DEPENDENCY_TYPES.CUSTOM
    : options.dependencies;

  // Resolve cache and output paths
  await fs.mkdir(options.cacheFolder, { recursive: true });

  const dependenciesCacheFile = join(options.cacheFolder, "dependencies.json");
  const outputDir = isAbsolute(options.rollup.output.dir)
    ? options.rollup.output.dir
    : join(options.cwd, options.rollup.output.dir);
  const importMapFile = join(outputDir, "import-map.json");

  // Get current dependencies
  const dependencies = await getDependencies(
    options,
    type,
    type === DEPENDENCY_TYPES.CUSTOM ? options.dependencies : [],
  );

  const dependenciesNames = dependencies.map(({ name }) => name);

  const dependenciesHardcoded =
    type === DEPENDENCY_TYPES.CUSTOM
      ? options.dependencies.filter((name) => !dependenciesNames.includes(name))
      : [];

  if (options.force) {
    console.info("install - force install.");
  } else if (!(await pathExists(outputDir))) {
    // Check if dist folder exists
    console.info("install - initial installation.");
  } else {
    try {
      // Get cached values
      // TODO: handle options.importMap change
      let cachedVersion = "";
      let cachedType = DEPENDENCY_TYPES.CUSTOM;
      let cachedDependencies = {};
      let cachedDependenciesHardcoded = [];

      ({
        version: cachedVersion,
        type: cachedType,
        dependencies: cachedDependencies,
        dependenciesHardcoded: cachedDependenciesHardcoded,
      } = await readJson(dependenciesCacheFile));

      // Check type or list of dependencies change
      // Calling install from CLI will always force install
      if (type !== cachedType) {
        console.info("install - dependency type changed.");
      } else if (VERSION !== cachedVersion) {
        console.info("install - snowdev version changed.");
      } else if (options.caller === "cli" && options.command === "install") {
        console.info("install - from cli.");
      } else {
        const changedDependencies = arrayDifference(
          dependencies,
          cachedDependencies,
          compareDependencies,
        );
        const changedDependenciesHardcoded = arrayDifference(
          dependenciesHardcoded,
          cachedDependenciesHardcoded,
        );

        if (
          changedDependencies.length + changedDependenciesHardcoded.length ===
          0
        ) {
          console.log("install - all dependencies installed.");

          return {
            importMap: deepmerge(
              await readJson(importMapFile),
              options.importMap,
            ),
          };
        } else {
          console.log(
            `install - dependencies changed: ${listFormatter.format([
              ...new Set(
                changedDependencies
                  .map((dependency) => dependency.name)
                  .concat(changedDependenciesHardcoded),
              ),
            ])}.`,
          );
        }
      }
    } catch (error) {
      console.info(`install - no dependencies cached.`);
    }
  }

  // Remove output to empty it or bundle in it
  try {
    await fs.rm(outputDir, RF_OPTIONS);
    await fs.mkdir(outputDir, { recursive: true });
  } catch (error) {
    console.error(`install - error removing output directory\n`, error);
    return { error };
  }

  const installTargets = dependenciesNames.concat(dependenciesHardcoded);

  if (installTargets.length === 0) {
    await writeJson(dependenciesCacheFile, {
      version: VERSION,
      type,
      dependencies: {},
      dependenciesHardcoded: {},
    });

    console.warn(`No ESM dependencies to install. Set "options.dependencies".`);
    return { importMap: options.importMap };
  }

  const label = `install`;
  console.time(label);

  console.info(
    `install - ESM dependencies: ${listFormatter.format(installTargets)}`,
  );

  let result;
  let input = {};
  let importMap = { imports: {} };

  const filter = createFilter(
    options.resolve.include,
    options.resolve.exclude,
    { resolve: options.cwd },
  );

  const packageTargets = dependenciesNames.filter(
    (target) => target !== "snowdev",
  );

  // Harcoded dependency can be:
  // - a relative file path
  // - a package inside a package to be added as target
  // - no relative folder support (use "local-dep-name": "file:./path-to-local-dep" in pacakge.json instead)
  // - no absolute path support (what would the import map be?)
  await Promise.allSettled(
    dependenciesHardcoded.map(async (dependency) => {
      try {
        if (parse(dependency).ext) {
          const resolvedExport = resolve(options.cwd, dependency);

          if (!filter(resolvedExport)) {
            console.info(`Filtered out export: ${resolvedExport}`);
          } else {
            const id = dotRelativeToBarePath(dependency);
            input[id] = dependency;
            importMap.imports[id] = dependency;
          }
        } else {
          packageTargets.push(dependency);
        }
      } catch (error) {
        console.error(error);
      }
    }),
  );

  try {
    console.log(`install - installing (${options.transpiler})...`);

    const dependenciesPath = Object.fromEntries(
      packageTargets.map((target) => {
        let dependencyPath = dependencies.find(
          ({ name }) => name === target,
        )?.realpath;

        if (!dependencyPath) {
          const parent = target
            .split("/")
            .slice(0, target.startsWith("@") ? 2 : 1)
            .join("/");
          const parentRealPath = dependencies.find(
            ({ name }) => name === parent,
          )?.realpath;

          if (parentRealPath) {
            dependencyPath = join(
              parentRealPath.slice(0, parentRealPath.lastIndexOf(parent)),
              target,
            );
          }
        }

        return [target, dependencyPath];
      }),
    );

    const resolvedExportsMap = deepmerge(
      Object.fromEntries(
        await Promise.all(
          packageTargets.map(async (dependency) => [
            dependency,
            await resolveExports(options, dependenciesPath[dependency]),
          ]),
        ),
      ),
      options.resolve.overrides,
    );

    // TODO: copy .css/.wasm/package.json
    for (let [dependency, entryPoints] of Object.entries(resolvedExportsMap)) {
      const dependencyPath = dependenciesPath[dependency];
      if (!(await pathExists(dependencyPath))) {
        console.error(`Unresolved dependency: is "${dependency}" installed?`);
        continue;
      }

      for (let [specifier, entryPoint] of Object.entries(entryPoints)) {
        const isMain = specifier === ".";
        const id = isMain ? dependency : slash(join(dependency, specifier));

        if (!entryPoint) {
          console.error(
            `Unresolved export: "${dependency}" "${specifier}": is "${dependency}" installed or not exporting anything?`,
          );
          continue;
        }

        try {
          const resolvedExport = join(dependencyPath, entryPoint);

          if (!filter(resolvedExport)) {
            console.info(`Filtered out export: ${resolvedExport}`);
            continue;
          }

          if (!(await pathExists(resolvedExport))) {
            console.error(`Unknown export: ${resolvedExport}`);
            continue;
          }

          input[id] = resolvedExport;
          importMap.imports[id] = bareToDotRelativePath(`${id}.js`);
        } catch (error) {
          console.error(error);
        }
      }
    }

    // Caveats: this will throw if all dependencies are filtered out/have unknown exports
    if (!Object.values(input).length) {
      throw new Error(`No input dependency to install.`);
    }

    // Bundle
    options.rollup.input.input = input;
    options.rollup.output.entryFileNames = ({ name }) =>
      packageTargets.includes(name) || extname(name) !== ".js"
        ? `${name}.js`
        : name;

    result = await bundle(options);

    if (!result.error) {
      // Write import map
      importMap = deepmerge(importMap, options.importMap);
      await writeJson(importMapFile, importMap);

      if (options.caller === "cli") {
        await fs.writeFile(join(options.cwd, ".nojekyll"), "", "utf-8");
      }

      // Write cache
      await writeJson(dependenciesCacheFile, {
        version: VERSION,
        type,
        dependencies,
        dependenciesHardcoded,
      });

      console.log("install - complete.");
    }
  } catch (error) {
    console.error(error);
    result = { error };
  }
  console.timeEnd(label);

  return { ...result, input, importMap };
};
install.description = `Install ESM dependencies.`;

export default install;
