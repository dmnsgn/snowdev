import { promisify } from "util";

import { exec as execCb } from "child_process";
import globCb from "glob";
import ncpCb from "ncp";
import rimrafCb from "rimraf";

const glob = promisify(globCb);
const exec = promisify(execCb);
const ncp = promisify(ncpCb);
const rimraf = promisify(rimrafCb);

export { glob, exec, ncp, rimraf };
