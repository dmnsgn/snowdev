import { join } from "node:path";

import { execCommand } from "./utils.js";

const substringAfterChar = (string, char) =>
  string.substring(string.indexOf(char));

const quotes = ['"', "'"];
const stripQuotes = (s) =>
  quotes.includes(s.charAt(0)) && quotes.includes(s.charAt(s.length - 1))
    ? s.substr(1, s.length - 2)
    : s;

class Npm {
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
      // cli-entry.js
      const { default: Npm } = await import(
        join(this.npmPath, "lib", "npm.js")
      );

      if (this.patch) {
        // Patch init exec as it doesn't return data nor support --json
        // execWorkspaces
        const { default: Init } = await import(
          join(this.npmPath, "lib", "commands", "init.js")
        );
        Init.prototype.exec = async function (args) {
          // npm exec style
          if (args.length) {
            return await this.execCreate(args);
          }

          const data = await this.template();

          if (json) {
            this.npm.outputBuffer(data);
          }
        };
      }

      const npm = new Npm({ npmRoot });

      // Override the config argv
      // npm config will use both process.argv and the provided argv ([...process.argv, ...argv])
      npm.config.argv = [
        ...process.argv.slice(0, 2),
        ...argv.map(stripQuotes),
        ...this.defaultArgv,
      ];

      // Override the config env as npm.config.load() will set "npm_config_" on it but we're running in the same process/env
      npm.config.env = { ...this.processEnv };

      // - npm.load()
      // - npm.config.load()
      // - npm.config.loadCLI()
      // - npm.config set parsedArgv
      // - npm.load set npm.argv
      // - npm exec uses npm.argv
      await npm.load();

      stdout = [];
      let stderr = [];

      Npm.prototype.output = function (...msg) {
        stdout.push(...msg);
      };
      Npm.prototype.outputError = function (...msg) {
        stderr.push(...msg);
      };

      // exit-handler.js
      const exitHandler = () => {
        npm.flushOutput();
        npm.unload();
      };

      // Rethrow error to ensure cleanup (progress bar, logs, ...) before throwing
      try {
        await npm.exec(cmd);
      } catch (error) {
        exitHandler();
        throw error;
      }
      exitHandler();

      if (stderr.length) throw new Error(stderr.join(""));

      stdout = stdout.join("");
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
