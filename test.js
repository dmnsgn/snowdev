import { spawn } from "node:child_process";
import { join } from "node:path";

import { console, readJson, timed } from "./utils.js";

const getTestCommand = async (cwd) => {
  try {
    if ((await readJson(join(cwd, "package.json"))).scripts?.test) {
      return "npm test";
    }
  } catch {
    // No readable package.json: fall back to the built-in runner
  }
  return `"${process.execPath}" --test`;
};

/**
 * Run the package "test" script or the Node.js test runner.
 *
 * @param {object} options
 * @returns {Promise<number>} Exit code
 */
const test = timed(async (options) => {
  const command = await getTestCommand(options.cwd);

  // No stdin: the dev shortcuts own it
  const child = spawn(command, {
    cwd: options.cwd,
    shell: true,
    stdio: ["ignore", "inherit", "inherit"],
  });
  const code = await new Promise((resolve, reject) =>
    child.once("error", reject).once("close", resolve),
  );
  if (code) console.error(`test — failed with exit code ${code}`);

  return code;
}, "test — run tests");

export default test;
