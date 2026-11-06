import { fork } from "node:child_process";
import { dirname, join } from "node:path";

import { console, execCommand, pathExists, realpathSafe } from "./utils.js";

const substringAfterChar = (string, char) =>
  string.slice(Math.max(0, string.indexOf(char)));

const quotes = new Set(['"', "'"]);
const stripQuotes = (s) =>
  quotes.has(s.at(0)) && quotes.has(s.at(-1)) ? s.slice(1, -1) : s;

// npm output masks anything looking like a secret, including UUID path segments.
// `location` is relative to the npm root: an ancestor of cwd in a workspace.
const restoreRealpath = async (cwd, { realpath, location }) => {
  if (!realpath.includes("***")) return realpath;

  for (let directory = cwd; ; directory = dirname(directory)) {
    const path = join(directory, location);
    if (await pathExists(join(path, "package.json"))) return realpathSafe(path);
    if (directory === dirname(directory)) return realpath;
  }
};

class Npm {
  process = null;
  processEnv = null;
  patch = true;
  defaultArgv = ["--progress=false"];

  async load(npmPath) {
    this.npmPath = npmPath;
    // Freeze the initial env as running npm modifies it
    this.processEnv = { ...process.env };
  }

  async run(npmRoot, cmd, argv = []) {
    let stdout;
    const json = argv.includes("--json");

    if (this.npmPath) {
      const child = fork(
        this.npmPath,
        [cmd, ...argv.map(stripQuotes), ...this.defaultArgv],
        { env: this.processEnv, stdio: [null, null, null, "ipc"] },
      );

      stdout = "";
      let stderr = "";

      for await (const chunk of child.stdout) stdout += chunk;
      for await (const chunk of child.stderr) stderr += chunk;

      const exitCode = await new Promise((r) => child.on("close", r));
      if (exitCode !== 0) console.warn(`npm exitCode ${exitCode}`);

      if (stderr) throw new Error(stderr);
    } else {
      stdout = await execCommand(
        `npm ${cmd} ${[...argv, ...this.defaultArgv].join(" ")}`.trimEnd(),
        { cwd: npmRoot, env: this.processEnv },
      );
    }

    // Patch init and query stdout as they contains a string before json
    if (this.patch) {
      if (json && cmd === "init") stdout = substringAfterChar(stdout, "{");
      if (cmd === "query") stdout = substringAfterChar(stdout, "[");
    }

    return json ? JSON.parse(stdout) : stdout;
  }
}

export { Npm, restoreRealpath };

export default new Npm();
