import { join } from "node:path";
import { fileURLToPath } from "node:url";

import commitAndTagVersion from "commit-and-tag-version";
import createAngularPreset from "conventional-changelog-angular";

import npm from "./npm.js";
import build from "./build.js";

import { console, checkUncommitedChanges, exec } from "./utils.js";

const angularPresetPath = fileURLToPath(
  import.meta.resolve("conventional-changelog-angular"),
);

const release = async (options) => {
  try {
    await checkUncommitedChanges(options);

    if (options.pkgFix) await npm.run(options.cwd, "pkg", ["fix"]);

    await build(options);

    if (options.commitAndTagVersion) {
      const { stdout, stderr } = await exec(`git add -A`, { cwd: options.cwd });
      if (stderr) throw new Error(stderr);
      console.log(stdout);

      const { workspace } = options;
      const scope = workspace && workspace.split("/").pop();
      const tagPrefix = workspace ? `${workspace}@v` : "v";
      const { transform } = createAngularPreset().writer;

      await commitAndTagVersion({
        path: options.cwd,
        preset: angularPresetPath,
        infile: join(options.cwd, "CHANGELOG.md"),
        commitAll: true,
        tagPrefix,
        writerOpts: {
          transform: (commit, context) =>
            scope && commit.scope !== scope
              ? undefined
              : transform(commit, context),
        },
        ...(workspace && {
          npmPublishHint: `npm publish --workspace ${workspace}`,
          releaseCommitMessageFormat: `chore(release): ${workspace}@{{currentTag}}`,
        }),
        ...options.commitAndTagVersion,
        ...options.argv,
      });
    }
  } catch (error) {
    console.error(error);
  }
};

export default release;
