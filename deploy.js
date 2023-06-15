import { join } from "node:path";
import { promises as fs } from "node:fs";

import console from "console-ansi";

import install from "./install.js";
import build from "./build.js";

import { checkUncommitedChanges, execCommand } from "./utils.js";

const deploy = async (options = {}) => {
  try {
    await checkUncommitedChanges(options);

    // Keep track of current branch
    const currentBranch = await execCommand(
      `git rev-parse --abbrev-ref HEAD`,
      options
    );
    console.log(`Current branch: ${currentBranch}`);

    // Check gh-pages branches exist of create it
    let ghPagesBranchExist = true;
    try {
      await execCommand(
        `git show-ref --quiet --verify -- "refs/heads/gh-pages"`,
        options
      );
    } catch (error) {
      if (error.code === 1) {
        ghPagesBranchExist = false;
        console.log("Checking out a new gh-pages branch.");
      } else {
        throw new Error(error);
      }
    }
    await execCommand(
      `git checkout --quiet ${ghPagesBranchExist ? "" : "-b"} gh-pages`,
      options
    );
    const ghBranch = await execCommand(
      `git rev-parse --abbrev-ref HEAD`,
      options
    );
    console.log(`Checked out: ${ghBranch}`);

    // Merge current branch into gh-pages branch
    await execCommand(`git merge ${currentBranch} --no-edit`, options);

    // Ignore changes
    const gitIgnorePath = join(options.cwd, ".gitignore");
    const gitIgnore = await fs.readFile(gitIgnorePath, "utf-8");
    // https://github.com/kaelzhang/node-ignore/blob/7cc95d22ea9a647442c06f4383a73e7a439a48d6/index.js#L14
    const REGEX_SPLITALL_CRLF = /\r?\n/g;
    const ignored = gitIgnore
      .split(REGEX_SPLITALL_CRLF)
      ?.filter(
        (ignore) => ![options.rollup.output.dir, "lib"].includes(ignore)
      );
    await fs.writeFile(
      gitIgnorePath,
      ignored?.join("\n") || gitIgnore,
      "utf-8"
    );

    await install(options);
    await build(options);

    // Add changes, commit and push
    await execCommand(`git add -A`, options);
    await execCommand(`git commit -m "chore: deploy to GitHub Pages"`, options);

    if (!options.dryRun) {
      // Push
      await execCommand(`git push origin gh-pages --porcelain`, options);
      // Go back to current branch
      await execCommand(`git checkout ${currentBranch}`, options);
    }
  } catch (error) {
    console.error(error);
  }
};
deploy.description = `Deploy to gh-pages.`;

export default deploy;
