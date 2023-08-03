#!/usr/bin/env node --max-old-space-size=6144

import console from "console-ansi";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { cosmiconfig } from "cosmiconfig";

import { commands, run } from "./index.js";
import { NAME, VERSION } from "./utils.js";

export const getConfig = async () => {
  let cosmiconfigOptions = {};
  try {
    const result = (await cosmiconfig(NAME).search()) || {};
    cosmiconfigOptions = result.config || {};
  } catch (error) {
    console.error(error);
    process.exit(0);
  }
  return cosmiconfigOptions;
};

// CLI
const parser = yargs(hideBin(process.argv));
parser
  .demandCommand(1)
  .options({
    cwd: {
      group: "Input/meta options:",
      type: "string",
      describe: `Specify the current working directory for all commands.`,
      defaultDescription: `process.cwd()`,
    },
    username: {
      group: "Input/meta options:",
      type: "string",
      describe: `Specify a user name for the init command.`,
      defaultDescription: `$ npm profile get name`,
    },
    gitHubUsername: {
      group: "Input/meta options:",
      type: "string",
      describe: `Specify a GitHub user name for the init command. Default from current npm profile or scraped from profile page.`,
      defaultDescription: `options.username`,
    },
    authorName: {
      group: "Input/meta options:",
      type: "string",
      describe: `Specify an author name for the init command. Default from current npm profile or scraped from profile page.`,
      defaultDescription: `$ npm profile get fullname`,
    },
    files: {
      group: "Input/meta options:",
      type: "string",
      describe: `A glob pattern for files to be processed by build command. All JS and TS files in root or "src/" folder.`,
      defaultDescription: `"{*.+(t|j||mj)s,src/**/*.+(t|j||mj)s}"`,
    },
    ignore: {
      group: "Input/meta options:",
      type: "array",
      describe: `Files to be ignored by build command.`,
      defaultDescription: `["**/node_modules/**", "**/web_modules/**"]`,
    },
    dependencies: {
      group: "Input/meta options:",
      type: "string",
      choices: ["all", "dev", "prod"],
      describe: `Install all dependencies from package.json, only devDependencies ("dev"), only dependencies ("prod") or an array of dependency as ES module into web_modules.`,
      defaultDescription: `all`,
    },

    NODE_ENV: {
      group: "Commands options:",
      type: "string",
      describe: `Define "process.env.NODE_ENV" and minify dependencies if set to "production".`,
      defaultDescription: `development`,
    },
    ts: {
      group: "Commands options:",
      type: "boolean",
      describe: `Use TypeScript for init, dev and build commands (create index.ts, watch files or build files). Auto-detected if a "tsconfig.json" is detected with a "compilerOptions.outDir" set.`,
      defaultDescription: `undefined`,
    },
    serve: {
      group: "Commands options:",
      type: "boolean",
      describe: `Start Browsersync on dev command.`,
      defaultDescription: `true`,
    },
    lint: {
      group: "Commands options:",
      type: "boolean",
      describe: `Lint on build command.`,
      defaultDescription: `true`,
    },
    format: {
      group: "Commands options:",
      type: "boolean",
      describe: `Format on build command.`,
      defaultDescription: `true`,
    },
    types: {
      group: "Commands options:",
      type: "boolean",
      describe: `Run TypeScript (generate types or compile) on build command or watch on dev command.`,
      defaultDescription: `true`,
    },
    docs: {
      group: "Commands options:",
      type: "string",
      describe: `Generate documentation (using "JSDoc" or "typedoc") in file (between "options.docsStart" and "options.docsEnd") or directory. Default to "README.md" but "docs" if "options.ts".`,
      defaultDescription: `undefined`,
    },
    docsFormat: {
      group: "Commands options:",
      type: "string",
      choices: ["md", "html"],
      describe: `Default to "md" but "html" if "options.ts".`,
      defaultDescription: `undefined`,
    },
    standardVersion: {
      group: "Commands options:",
      type: "boolean|Object",
      describe: `Bump the version, generate changelog release, create a new commit with git tag on release command.`,
      defaultDescription: `true`,
    },
    crossOriginIsolation: {
      group: "Commands options:",
      type: "boolean",
      describe: `Add Cross-Origin-Opener-Policy (COOP) and Cross-Origin-Embedder-Policy (COEP) headers to browsersync. Required for the use of SharedArrayBuffer.`,
      defaultDescription: `false`,
    },
    http2: {
      group: "Commands options:",
      type: "boolean",
      describe: `Serve with "node:http2".`,
      defaultDescription: `true`,
    },
    hmr: {
      group: "Commands options:",
      type: "boolean",
      describe: `Add Hot Module Replacement to browsersync. Requires "es-module-shims" with "shimMode".`,
      defaultDescription: `true`,
    },
  })
  .wrap(parser.terminalWidth())
  .version(VERSION)
  .help();

Object.values(commands).forEach((fn) => {
  parser.command(
    fn.name === "dev" ? [fn.name, "$0"] : fn.name,
    fn.description,
    () => {},
    async (argv) => {
      console.debug(`v${VERSION}`);
      await run(fn, { caller: "cli", ...(await getConfig()), ...argv, argv });
    },
  );
});

parser.parse();
