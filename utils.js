import { promisify } from "util";

import { exec as execCb } from "child_process";
import globCb from "glob";
import ncpCb from "ncp";
import rimrafCb from "rimraf";

import ts from "typescript";

const glob = promisify(globCb);
const exec = promisify(execCb);
const ncp = promisify(ncpCb);
const rimraf = promisify(rimrafCb);

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
}

function isTypeScriptProject(cwd) {
  const configPath = ts.findConfigFile(cwd, ts.sys.fileExists, "tsconfig.json");
  if (!configPath) return false;
  return ts.readConfigFile(configPath, ts.sys.readFile).config?.compilerOptions
    ?.outDir;
}

export { glob, exec, ncp, rimraf, escapeRegExp, isTypeScriptProject };
