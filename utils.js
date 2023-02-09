import { promises as fs } from "node:fs";
import { promisify } from "node:util";
import { exec as execCb } from "node:child_process";

import globCb from "glob";
import ncpCb from "ncp";

import ts from "typescript";

const glob = promisify(globCb);
const exec = promisify(execCb);
const ncp = promisify(ncpCb);

const execCommand = async (command, options) => {
  const { stdout, stderr } = await exec(command, options);
  if (stderr) throw new Error(stderr);
  return stdout.trim();
};

const checkUncommitedChanges = async (options) => {
  if (await execCommand(`git status --porcelain`, options)) {
    throw new Error("Commit your changes first");
  }
};

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
}

function isTypeScriptProject(cwd) {
  const configPath = ts.findConfigFile(cwd, ts.sys.fileExists, "tsconfig.json");
  if (!configPath) return false;
  return ts.readConfigFile(configPath, ts.sys.readFile).config?.compilerOptions
    ?.outDir;
}

const pathExists = (path) =>
  fs
    .access(path)
    .then(() => true)
    .catch(() => false);

export {
  glob,
  exec,
  ncp,
  execCommand,
  checkUncommitedChanges,
  escapeRegExp,
  isTypeScriptProject,
  pathExists,
};
