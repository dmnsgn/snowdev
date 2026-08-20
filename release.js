import { join } from "node:path";
import { createRequire } from "node:module";

import console from "console-ansi";

import commitAndTagVersion from "commit-and-tag-version";
import angularWriterOpts from "conventional-changelog-angular/writer-opts.js";

import npm from "./npm.js";
import build from "./build.js";

import { checkUncommitedChanges, exec } from "./utils.js";

const require = createRequire(import.meta.url);

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
      const { transform } = await angularWriterOpts;

      await commitAndTagVersion({
        path: options.cwd,
        preset: require.resolve("conventional-changelog-angular"),
        infile: join(options.cwd, "CHANGELOG.md"),
        commitAll: true,
        writerOpts: {
          transform: (commit, context) =>
            scope && commit.scope !== scope
              ? undefined
              : transform(commit, context),
        },
        ...(workspace && {
          tagPrefix: `${workspace}@v`,
          npmPublishHint: `npm publish --workspace ${workspace}`,
          releaseCommitMessageFormat: `chore(release): ${workspace}@{{currentTag}}`,
        }),
        ...(options.commitAndTagVersion || {}),
        ...(options.argv || {}),
      });
    }
  } catch (error) {
    console.error(error);
  }
};
release.description = `Bump the version, generate changelog release, create a new commit with git tag.`;

export default release;
