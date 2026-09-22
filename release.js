import { join } from "node:path";
import { fileURLToPath } from "node:url";

import console from "console-ansi";

import commitAndTagVersion from "commit-and-tag-version";
import createAngularPreset from "conventional-changelog-angular";

import npm from "./npm.js";
import build from "./build.js";

import { checkUncommitedChanges, exec, execCommand } from "./utils.js";

const angularPresetPath = fileURLToPath(
  import.meta.resolve("conventional-changelog-angular"),
);

// HACK: commit-and-tag-version >= 13.1.1 always generates the changelog from
// the last stable tag, so every prerelease repeats all entries since that tag.
// https://github.com/absolute-version/commit-and-tag-version/issues/349
const getSinceLastTagWriterOpts = async ({ cwd, tagPrefix, transform }) => {
  let lastTag;
  try {
    lastTag = await execCommand(
      `git describe --tags --abbrev=0 --match "${tagPrefix}*"`,
      { cwd },
    );
  } catch {
    return { transform };
  }

  const hashes = new Set(
    (await execCommand(`git rev-list ${lastTag}..HEAD`, { cwd })).split("\n"),
  );

  return {
    transform: (commit, context) =>
      hashes.has(commit.hash) ? transform(commit, context) : undefined,
    finalizeContext: (context) => ({
      ...context,
      previousTag: lastTag,
      currentTag: `${tagPrefix}${context.version}`,
      linkCompare: true,
    }),
  };
};

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
        writerOpts: await getSinceLastTagWriterOpts({
          cwd: options.cwd,
          tagPrefix,
          transform: (commit, context) =>
            scope && commit.scope !== scope
              ? undefined
              : transform(commit, context),
        }),
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
release.description = `Bump the version, generate changelog release, create a new commit with git tag.`;

export default release;
