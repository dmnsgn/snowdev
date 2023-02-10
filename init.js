import { promises as fs } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

import console from "console-ansi";
import replaceInFile from "replace-in-file";
import npmUser from "npm-user";
import camelcase from "camelcase";

import { exec, ncp } from "./utils.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const init = async (options = {}) => {
  const label = `init`;
  console.time(label);

  const packageName = basename(options.cwd);

  // Check for empty directory
  if (
    (await fs.readdir(options.cwd)).filter(
      (file) => ![".DS_Store"].includes(file)
    ).length > 0
  ) {
    console.warn(`Directory not empty. Files will not be overwritten.`);
  }

  // Get npm infos
  let user = { ...options };

  if (!user.username) {
    const { stdout, stderr } = await exec("npm profile get --json");
    if (stderr) console.error(stderr);
    const npmProfile = JSON.parse(stdout);
    user.username ||= npmProfile.name;
    user.authorName ||= npmProfile.fullname || user.username;
    user.gitHubUsername ||= npmProfile.github || user.username;
  } else {
    user.username = user.username.trim();
    try {
      const npmProfile = await npmUser(user.username);
      user.authorName ||= npmProfile.name || user.username;
      user.gitHubUsername ||= npmProfile.github || user.username;
    } catch (error) {
      console.error(error);
    }
  }

  console.info(
    `user: ${user.authorName} (npm: "${user.username}", github: "${user.gitHubUsername}")`
  );

  try {
    // Copy template files
    await ncp(join(__dirname, "template"), options.cwd, {
      clobber: false,
      filter(fileName) {
        return options.ts
          ? !["index.js"].includes(basename(fileName))
          : !["tsconfig.json", "src"].includes(basename(fileName));
      },
    });

    // Rename gitignore otherwise ignored on npm publish
    await fs.rename(
      join(options.cwd, "gitignore"),
      join(options.cwd, ".gitignore")
    );

    // Rewrite package name to folder name
    await replaceInFile({
      files: `${options.cwd}/**/*`,
      ignore: options.ignore,
      from: [
        /packageNameCC/g,
        /packageName/g,
        /gitHubUsername/g,
        /username/g,
        /authorName/g,
        /year/g,
      ],
      to: [
        camelcase(packageName),
        packageName,
        user.gitHubUsername,
        user.username,
        user.authorName,
        new Date().getFullYear(),
      ],
    });

    // Change main entry point
    if (options.ts) {
      const packageJsonFile = join(options.cwd, "package.json");
      const packageJson = JSON.parse(
        await fs.readFile(packageJsonFile, "utf-8")
      );
      packageJson.main = "lib/index.js";
      packageJson.exports = "./lib/index.js";
      await fs.writeFile(
        packageJsonFile,
        JSON.stringify(packageJson, null, 2),
        "utf-8"
      );
    }
  } catch (error) {
    console.error(error);
  }
  console.timeEnd(label);
};
init.description = `Create simple package structure.`;

export default init;
