import { join } from "path";

import standardVersion from "standard-version";

import build from "./build.js";

import { console } from "./utils.js";

const release = async (options) => {
  try {
    await build(options);

    if (options.standardVersion) {
      await standardVersion({
        path: options.cwd,
        infile: join(options.cwd, "CHANGELOG.md"),
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
