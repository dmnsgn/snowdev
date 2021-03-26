import { promises as fs } from "fs";
import { join } from "path";

import console from "console-ansi";

import { babel } from "@rollup/plugin-babel";
import { install as installDependencies, printStats } from "esinstall";

const DEPENDENCY_OPTION_MAP = {
  all: ["dependencies", "devDependencies"],
  dev: ["devDependencies"],
  dep: ["dependencies"],
};

const install = async (options) => {
  const packageJson = JSON.parse(
    await fs.readFile(join(options.cwd, "package.json"))
  );

  const installTargets = Array.isArray(options.dependencies)
    ? options.dependencies
    : (DEPENDENCY_OPTION_MAP[options.dependencies] || [])
        .map((key) => Object.keys(packageJson[key] || {}))
        .flat();

  if (installTargets.length === 0) {
    console.warn(`No ESM dependencies to install. Set "options.dependency".`);
    return;
  }

  console.info(`ESM dependencies: ${installTargets.join(", ")}`);

  if (options.command !== "install") {
    try {
      const { imports = {} } = JSON.parse(
        await fs.readFile(join(options.cwd, "web_modules", "import-map.json"))
      );
      const installedDependencies = Object.keys(imports).sort();

      if (
        installTargets.length === installedDependencies.length &&
        [...installTargets]
          .sort()
          .every((value, index) => value === installedDependencies[index])
      ) {
        console.log("install - all dependencies installed.");
        return;
      }
    } catch (error) {
      console.info("install - initial installation.");
    }
  }

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
    console.log("install - complete.");
  } catch (error) {
    console.error(error);
  }
};
install.description = `Install ESM dependencies.`;

export default install;
