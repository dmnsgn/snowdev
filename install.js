import { promises as fs } from "fs";
import { dirname, join } from "path";
import { createRequire } from "module";
import Arborist from "@npmcli/arborist";

import console from "console-ansi";

import { babel } from "@rollup/plugin-babel";
import { install as installDependencies, printStats } from "esinstall";

import { pathExists } from "./utils.js";

const require = createRequire(import.meta.url);

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

  let cachedDependencies = [];
  let cachedType = DEPENDENCY_TYPES.CUSTOM;
  try {
    ({ dependencies: cachedDependencies, type: cachedType } = JSON.parse(
      await fs.readFile(dependenciesCacheFile, "utf-8")
    ));
  } catch (error) {
    console.info(`install - no dependencies cached.`);
  }

  // Get current dependencies
  const dependencies = await getDependencies(options, type);

  // Check if web_modules folder exists
  if (!(await pathExists(join(options.cwd, "web_modules")))) {
    console.info("install - initial installation.");
  } else {
    // Check type or list of dependencies change
    if (type !== cachedType) {
      console.info("install - dependency type changed.");
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

  console.info(
    `install - ESM dependencies: ${listFormat.format(installTargets)}`
  );

  try {
    console.log("install - installing...");
    console.levels.debug = 0;
    const { stats } = await installDependencies(installTargets, {
      cwd: options.cwd,
      verbose: true,
      dest: "web_modules",
      treeshake: true,
      polyfillNode: true,
      logger: console,
      alias: {
        "@babel/runtime": dirname(require.resolve("@babel/runtime/package")),
        "core-js": dirname(require.resolve("core-js")),
      },
      rollup: {
        plugins: [
          babel({
            cwd: options.cwd,
            babelHelpers: "runtime",
            ...(options.babel || {}),
          }),
        ],
        ...(options.rollup || {}),
      },
    });
    printStats(stats);
    delete console.levels.debug;

    await fs.writeFile(
      join(options.cwd, "web_modules", ".nojekyll"),
      "",
      "utf-8"
    );

    // Write cache
    await fs.writeFile(
      dependenciesCacheFile,
      JSON.stringify({ type, dependencies }),
      "utf-8"
    );

    console.log("install - complete.");
  } catch (error) {
    console.error(error);
  }
};
install.description = `Install ESM dependencies.`;

export default install;
