import { fork } from "node:child_process";

import console from "console-ansi";

import { execCommand } from "./utils.js";

const substringAfterChar = (string, char) =>
  string.substring(string.indexOf(char));

const quotes = ['"', "'"];
const stripQuotes = (s) =>
  quotes.includes(s.charAt(0)) && quotes.includes(s.charAt(s.length - 1))
    ? s.substr(1, s.length - 2)
    : s;

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

export { Npm };

export default new Npm();
