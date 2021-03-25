import { promisify } from "util";

import { exec as execCb } from "child_process";
import globCb from "glob";
import ncpCb from "ncp";
import rimrafCb from "rimraf";

const glob = promisify(globCb);
const exec = promisify(execCb);
const ncp = promisify(ncpCb);
const rimraf = promisify(rimrafCb);

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
}

export { glob, exec, ncp, rimraf, escapeRegExp };
