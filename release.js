import { join } from "node:path";
import { createRequire } from "node:module";

import console from "console-ansi";

import standardVersion from "standard-version";

import build from "./build.js";

import { checkUncommitedChanges, exec } from "./utils.js";

const require = createRequire(import.meta.url);

const release = async (options) => {
  try {
    await checkUncommitedChanges(options);

    await build(options);

    if (options.standardVersion) {
      const { stdout, stderr } = await exec(`git add -A`, { cwd: options.cwd });
      if (stderr) throw new Error(stderr);
      console.log(stdout);

      await standardVersion({
        path: options.cwd,
        preset: require.resolve("conventional-changelog-angular"),
        infile: join(options.cwd, "CHANGELOG.md"),
        commitAll: true,
        ...(options.standardVersion || {}),
        ...(options.argv || {}),
      });
    }
  } catch (error) {
    console.error(error);
  }
};
release.description = `Bump the version, generate changelog release, create a new commit with git tag.`;

export default release;
