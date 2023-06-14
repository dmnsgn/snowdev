import { promises as fs } from "node:fs";
import { extname, join } from "node:path";
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

const DEPENDENCY_OPTION_MAP = {
  [DEPENDENCY_TYPES.ALL]: ["dependencies", "devDependencies"],
  [DEPENDENCY_TYPES.DEV]: ["devDependencies"],
  [DEPENDENCY_TYPES.PROD]: ["dependencies"],
};

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
        DEPENDENCY_SAVE_TYPE_MAP[type].includes(dependency.type)
      );
};

const install = async (options) => {
  let packageJson;
  try {
    packageJson = JSON.parse(
      await fs.readFile(join(options.cwd, "package.json"))
    );
  } catch (error) {
    console.error(`install - error reading package.json\n`, error);
    return;
  }

  // Get install type
  const type = Array.isArray(options.dependencies)
    ? DEPENDENCY_TYPES.CUSTOM
    : options.dependencies;

  // Get cached dependencies
  const dependenciesCacheFile = join(options.cacheFolder, "dependencies.json");
  await fs.mkdir(options.cacheFolder, { recursive: true });

  let cachedVersion = "";
  let cachedType = DEPENDENCY_TYPES.CUSTOM;
  let cachedDependencies = [];
  try {
    ({
      version: cachedVersion,
      type: cachedType,
      dependencies: cachedDependencies,
    } = JSON.parse(await fs.readFile(dependenciesCacheFile, "utf-8")));
  } catch (error) {
    console.info(`install - no dependencies cached.`);
  }

  // Get current dependencies
  const dependencies = await getDependencies(options, type);

  // TODO: handle snowdev.dependencies options manual change?

  const outputDir = join(options.cwd, options.dist);

  // Check if dist folder exists
  if (!(await pathExists(outputDir))) {
    console.info("install - initial installation.");
  } else {
    // Check type or list of dependencies change
    if (type !== cachedType) {
      console.info("install - dependency type changed.");
    } else if (VERSION !== cachedVersion) {
      console.info("install - snowdev version changed.");
    } else if (dependencies.length !== cachedDependencies.length) {
      console.info("install - dependency list changed.");
    } else if (options.command !== "install") {
      const changedDependencies = dependencies.filter(
        ({ spec }) => !cachedDependencies.some(({ spec: s }) => spec === s)
      );

      if (!changedDependencies.length) {
        console.log("install - all dependencies installed.");
        return;
      } else {
        console.log(
          `install - dependencies changed: ${listFormat.format(
            changedDependencies.map((dependency) => dependency.name)
          )}.`
        );
      }
    }
  }

  const installTargets =
    type === DEPENDENCY_TYPES.CUSTOM
      ? options.dependencies
      : (DEPENDENCY_OPTION_MAP[options.dependencies] || [])
          .map((key) => Object.keys(packageJson[key] || {}))
          .flat();

  if (installTargets.length === 0) {
    console.warn(`No ESM dependencies to install. Set "options.dependencies".`);
    return;
  }

  const label = `install`;
  console.time(label);

  console.info(
    `install - ESM dependencies: ${listFormat.format(installTargets)}`
  );

  let input = {};
  let importMap = { imports: {} };

  try {
    console.log(`install - installing (${options.transpiler})...`);

    await fs.rm(outputDir, RF_OPTIONS);

    const resolvedExportsMap = deepmerge(
      Object.fromEntries(
        await Promise.all(
          installTargets.map(async (dependency) => [
            dependency,
            await resolveExports(options, dependency),
          ])
        )
      ),
      options.resolve.overrides
    );

    const filter = createFilter(
      options.resolve.include,
      options.resolve.exclude,
      { resolve: options.cwd }
    );

    // TODO: copy .css/.wasm/package.json
    for (let [dependency, entryPoints] of Object.entries(resolvedExportsMap)) {
      for (let [specifier, entryPoint] of Object.entries(entryPoints)) {
        const isMain = specifier === ".";
        const id = isMain ? dependency : slash(join(dependency, specifier));

        if (!entryPoint) {
          console.error(
            `Unresolved export: "${dependency}" "${specifier}": is "${dependency}" installed or not exporting anything?`
          );
          continue;
        }

        try {
          const depEntryPoint = join(dependency, entryPoint);
          const resolvedExport = join(
            options.cwd,
            "node_modules",
            depEntryPoint
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

    // console.log(resolvedExportsMap);

    if (!Object.values(input).length) {
      console.error(`No input dependency to install.`);
      return;
    }

    // Bundle
    options.rollup.input.input = input;
    options.rollup.output.dir = outputDir;
    await bundle(options);

    // Write import map
    importMap = deepmerge(importMap, options.importMap);
    await fs.writeFile(
      join(outputDir, "import-map.json"),
      JSON.stringify(importMap, null, 2)
    );

    await fs.writeFile(join(outputDir, ".nojekyll"), "", "utf-8");

    // Write cache
    await fs.writeFile(
      dependenciesCacheFile,
      JSON.stringify({ version: VERSION, type, dependencies }),
      "utf-8"
    );

    console.log("install - complete.");
  } catch (error) {
    console.error(error);
  }
  console.timeEnd(label);

  return { input, importMap };
};
install.description = `Install ESM dependencies.`;

export default install;
