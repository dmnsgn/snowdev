import { promisify } from "util";

import { exec as execCb } from "child_process";
import globCb from "glob";
import ncpCb from "ncp";
import rimrafCb from "rimraf";

const glob = promisify(globCb);
const exec = promisify(execCb);
const ncp = promisify(ncpCb);
const rimraf = promisify(rimrafCb);

const proxiedConsole = new Proxy(
  {
    prefix: "",
    theme: {
      log: "\x1b[32m",
      warn: "\x1b[33m",
      info: "\x1b[36m",
      time: "\x1b[36m",
      timeEnd: "\x1b[36m",
      error: "\x1b[31m",
      reset: "\x1b[0m",
    },
  },
  {
    get: (obj, prop) =>
      prop in obj
        ? obj[prop]
        : Object.keys(obj.theme).includes(prop)
        ? (...args) =>
            console[prop](
              ["time", "timeEnd"].includes(prop)
                ? `${obj.theme[prop]} ${obj.prefix} ${args.join(" ")}${
                    obj.theme.reset
                  }`
                : obj.theme[prop],
              obj.prefix,
              ...args,
              obj.theme.reset
            )
        : console[prop],
  }
);

export { proxiedConsole as console, glob, exec, ncp, rimraf };
