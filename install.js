import { promises as fs } from "fs";
import { join } from "path";

import { babel } from "@rollup/plugin-babel";
import { install as installDependencies, printStats } from "esinstall";

import { console } from "./utils.js";

const install = async (options) => {
  const packageJson = JSON.parse(
    await fs.readFile(join(options.cwd, "package.json"))
  );

  const installTargets =
    options.dependencies ||
    Object.keys(
      (options.devDeps
        ? packageJson.devDependencies
        : packageJson.dependencies) || {}
    );

  if (installTargets.length === 0) {
    console.warn(
      `No ESM dependencies to install. Add "devDependencies" or "dependencies" to your package (toggle which one using "devDeps"). Restrict the list by specifying "dependencies".`
    );
    return;
  }

  try {
    const { stats } = await installDependencies(installTargets, {
      cwd: options.cwd,
      verbose: true,
      dest: "web_modules",
      treeshake: true,
      polyfillNode: true,
      rollup: {
        plugins: [
          babel({
            cwd: options.cwd,
            babelHelpers: "bundled",
            ...(options.babel || {}),
          }),
        ],
        ...(options.rollup || {}),
      },
    });
    printStats(stats);
  } catch (error) {
    console.error(error);
  }
};
install.description = `Install ESM dependencies.`;

export default install;
