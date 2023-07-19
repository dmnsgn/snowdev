import { promises as fs } from "node:fs";
import { extname, isAbsolute, join } from "node:path";
import Arborist from "@npmcli/arborist";

import console from "console-ansi";
import deepmerge from "deepmerge";
import slash from "slash";
import { createFilter } from "@rollup/pluginutils";

import { RF_OPTIONS, resolveExports, pathExists, VERSION } from "./utils.js";

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
};

const listFormat = new Intl.ListFormat("en");

const getDependencies = async (options, type) => {
  const tree = await new Arborist({ path: options.cwd }).loadActual();
  const dependencies = Array.from(tree.edgesOut.values());
  return type === DEPENDENCY_TYPES.CUSTOM
    ? dependencies
    : dependencies.filter((dependency) =>
        DEPENDENCY_SAVE_TYPE_MAP[type].includes(dependency.type),
      );
};

const install = async (options) => {
  // Check package.json exists
  try {
    JSON.parse(await fs.readFile(join(options.cwd, "package.json")));
  } catch (error) {
    console.error(`install - error reading package.json\n`, error);
    return { error };
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
  const dependencies = await getDependencies(options, type);

  if (options.force) {
    console.info("install - force install.");
  } else if (!(await pathExists(outputDir))) {
    // Check if dist folder exists
    console.info("install - initial installation.");
  } else {
    try {
      // Get cached values
      // TODO: handle snowdev.dependencies options manual change?
      // TODO: handle options.importMap change
      let cachedVersion = "";
      let cachedType = DEPENDENCY_TYPES.CUSTOM;
      let cachedDependencies = [];

      ({
        version: cachedVersion,
        type: cachedType,
        dependencies: cachedDependencies,
      } = JSON.parse(await fs.readFile(dependenciesCacheFile, "utf-8")));

      // Check type or list of dependencies change
      // Calling install from CLI will always force install
      if (type !== cachedType) {
        console.info("install - dependency type changed.");
      } else if (VERSION !== cachedVersion) {
        console.info("install - snowdev version changed.");
      } else if (dependencies.length !== cachedDependencies.length) {
        console.info("install - dependency list changed.");
      } else if (options.caller !== "cli") {
        const changedDependencies = dependencies.filter(
          ({ spec }) => !cachedDependencies.some(({ spec: s }) => spec === s),
        );

        if (!changedDependencies.length) {
          console.log("install - all dependencies installed.");

          return {
            importMap: deepmerge(
              JSON.parse(await fs.readFile(importMapFile, "utf-8")),
              options.importMap,
            ),
          };
        } else {
          console.log(
            `install - dependencies changed: ${listFormat.format(
              changedDependencies.map((dependency) => dependency.name),
            )}.`,
          );
        }
      }
    } catch (error) {
      console.info(`install - no dependencies cached.`);
    }
  }

  const dependenciesNames =
    type === DEPENDENCY_TYPES.CUSTOM
      ? options.dependencies
      : dependencies.map(({ name }) => name);

  if (dependenciesNames.length === 0) {
    console.warn(`No ESM dependencies to install. Set "options.dependencies".`);
    return { importMap: options.importMap };
  }

  const label = `install`;
  console.time(label);

  console.info(
    `install - ESM dependencies: ${listFormat.format(dependenciesNames)}`,
  );

  let result;
  let input = {};
  let importMap = { imports: {} };

  try {
    console.log(`install - installing (${options.transpiler})...`);

    await fs.rm(outputDir, RF_OPTIONS);
    await fs.mkdir(outputDir, { recursive: true });

    const resolvedExportsMap = deepmerge(
      Object.fromEntries(
        await Promise.all(
          dependenciesNames.map(async (dependency) => [
            dependency,
            await resolveExports(options, dependency),
          ]),
        ),
      ),
      options.resolve.overrides,
    );

    const filter = createFilter(
      options.resolve.include,
      options.resolve.exclude,
      { resolve: options.cwd },
    );

    // TODO: copy .css/.wasm/package.json
    for (let [dependency, entryPoints] of Object.entries(resolvedExportsMap)) {
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
          const depEntryPoint = join(dependency, entryPoint);
          const resolvedExport = join(
            options.cwd,
            "node_modules",
            depEntryPoint,
          );

          if (!filter(resolvedExport)) {
            console.info(`Filtered out export: ${resolvedExport}`);
            continue;
          }

          if (!(await pathExists(resolvedExport))) {
            console.error(`Unknown export: ${resolvedExport}`);
            continue;
          }

          input[id] = resolvedExport;
          importMap.imports[id] = isMain
            ? `./${dependency}${extname(entryPoint)}`
            : `./${slash(depEntryPoint)}`;
        } catch (error) {
          console.error(error);
        }
      }
    }

    if (!Object.values(input).length) {
      throw new Error(`No input dependency to install.`);
    }

    // Bundle
    options.rollup.input.input = input;
    options.rollup.output.entryFileNames = ({ name }) =>
      dependenciesNames.includes(name) || extname(name) !== ".js"
        ? `${name}.js`
        : name;

    result = await bundle(options);

    if (!result.error) {
      // Write import map
      importMap = deepmerge(importMap, options.importMap);
      await fs.writeFile(importMapFile, JSON.stringify(importMap, null, 2));

      await fs.writeFile(join(outputDir, ".nojekyll"), "", "utf-8");

      // Write cache
      await fs.writeFile(
        dependenciesCacheFile,
        JSON.stringify({ version: VERSION, type, dependencies }),
        "utf-8",
      );

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
