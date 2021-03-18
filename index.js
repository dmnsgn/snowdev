#!/usr/bin/env node

import { promises as fs, constants } from "fs";
import { resolve } from "path";
import { createRequire } from "module";

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import cosmiconfig from "cosmiconfig";

import init from "./init.js";
import dev from "./dev.js";
import build from "./build.js";
import install from "./install.js";
import { console } from "./utils.js";

const { version, name: NAME } = JSON.parse(
  await fs.readFile(new URL("./package.json", import.meta.url))
);
console.prefix = `[${NAME}]`;

const require = createRequire(import.meta.url);

// Options
const DEFAULTS_OPTIONS = {
  // Inputs
  cwd: process.cwd(),
  username: null,
  files: "{*.+(t|j||mj)s,src/**/*.+(t|j||mj)s}",
  ignore: ["**/node_modules/**", "**/web_modules/**"],
  devDeps: false,
  dependencies: null,

  // Process
  // TODO: add to yargs options
  ts: false,
  lint: true,
  format: true,
  types: true,
  docs: true,
  docsStart: "<!-- api-start -->",
  docsEnd: "<!-- api-end -->",

  // External tools
  browserSync: {
    open: true,
    https: true,
    single: true,
    watch: true,
  },
  // TODO: lint and format config in code editor? Do I need config in package.json instead?
  eslint: {
    parser: require.resolve("@babel/eslint-parser"),
    extends: ["eslint:recommended", require.resolve("eslint-config-prettier")],
    plugins: ["eslint-plugin-prettier"],
    rules: {
      "prettier/prettier": "error",
    },
    parserOptions: {
      ecmaVersion: 2021,
      sourceType: "module",
      ecmaFeatures: {
        experimentalObjectRestSpread: false,
      },
      requireConfigFile: false,
      babelOptions: {},
    },
  },
  tsconfig: {
    compilerOptions: {
      allowJs: true,
      declaration: true,
      declarationDir: "types",
      emitDeclarationOnly: true,
    },
  },
  babel: {
    presets: [
      [
        require.resolve("@babel/preset-env"),
        {
          modules: false,
          corejs: { version: "3.8", proposals: true },
          useBuiltIns: "usage",
          debug: false,
          targets: [`defaults and supports es6-module`],
        },
      ],
    ],
  },
  prettier: null,
  rollup: null,
};

let cosmiconfigOptions = {};
try {
  const result = cosmiconfig.cosmiconfigSync(NAME).search() || {};
  cosmiconfigOptions = result.config || {};
} catch (error) {
  console.error(error);
  process.exit(0);
}

// CLI
const parser = yargs(hideBin(process.argv))
  .demandCommand(1)
  .options({
    cwd: {
      type: "string",
      describe: `Specify the current working directory for all commands.`,
      defaultDescription: `process.cwd()`,
    },
    username: {
      type: "string",
      describe: `Specify a user name for the init command.`,
      defaultDescription: `$ npm whoami`,
    },
    gitHubUsername: {
      type: "string",
      describe: `Specify a GitHub user name for the init command.`,
      defaultDescription: `options.username`,
    },
    files: {
      type: "array",
      describe: `A glob pattern for files to be processed by build command.`,
      defaultDescription: `"**/*.js"`,
    },
    ignore: {
      type: "array",
      describe: `Files to be ignored by build command.`,
      defaultDescription: `["**/node_modules/**", "**/web_modules/**", join(options.cwd, "docs"), join(options.cwd, "lib"),]`,
    },
    devDeps: {
      type: "boolean",
      describe: `Only install devDependencies as web_modules.`,
      defaultDescription: `false. Uses options.dependencies or package.json dependencies.`,
    },
    dependencies: {
      type: "array",
      describe: `Specify list of dependencies to install as web_modules.`,
      defaultDescription: `null. Uses package.json dependencies.`,
    },
    ts: {
      type: "boolean",
      describe: `Use TypeScript for init, dev and build commands (create index.ts, watch files or build files).`,
      defaultDescription: `false`,
    },
  })
  .version(version)
  .help();

parser.wrap(parser.terminalWidth());

const commands = [init, dev, build, install];
commands.forEach((fn) => {
  parser.command(
    fn.name,
    fn.description,
    () => {},
    async (argv) => {
      const options = {
        ...DEFAULTS_OPTIONS,
        ...(cosmiconfigOptions[fn.name] || {}),
        ...argv,
        argv,
      };

      try {
        options.cwd = resolve(options.cwd);
        console.info(`${fn.name} in '${options.cwd}'`);

        await fs.access(options.cwd, constants.R_OK | constants.W_OK);

        fn(options);
      } catch (error) {
        console.error(`Can't access cwd.`);
        console.error(error);
      }
    }
  );
});

parser.parse();
