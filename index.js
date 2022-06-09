#!/usr/bin/env node

import { promises as fs, constants } from "fs";
import { join, resolve } from "path";
import { createRequire } from "module";

import console from "console-ansi";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import cosmiconfig from "cosmiconfig";

import init from "./init.js";
import dev from "./dev.js";
import build from "./build.js";
import release from "./release.js";
import deploy from "./deploy.js";
import install from "./install.js";
import { isTypeScriptProject } from "./utils.js";

const { version, name: NAME } = JSON.parse(
  await fs.readFile(new URL("./package.json", import.meta.url))
);
console.prefix = `[${NAME}]`;

const require = createRequire(import.meta.url);

// Options
const DEFAULTS_OPTIONS = {
  // Inputs/meta
  cwd: process.cwd(),
  username: null,
  gitHubUsername: null,
  files: "{*.+(t|j||mj)s,src/**/*.+(t|j||mj)s}",
  ignore: ["**/node_modules/**", "**/web_modules/**"],
  dependencies: "all",

  // Process
  ts: undefined,
  serve: true,
  lint: true,
  format: true,
  types: true,
  docs: undefined,
  docsFormat: undefined,
  docsStart: "<!-- api-start -->",
  docsEnd: "<!-- api-end -->",
  standardVersion: true,

  // External tools
  browsersync: {
    open: true,
    https: true,
    single: true,
    watch: true,
  },
  // TODO: lint and format config in code editor? Do I need config in package.json instead?
  eslint: {
    parser: require.resolve("@babel/eslint-parser"),
    extends: ["eslint:recommended", "plugin:prettier/recommended"],
    plugins: ["eslint-plugin-prettier"],
    rules: {
      "prettier/prettier": "error",
    },
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      requireConfigFile: false,
      babelOptions: {},
    },
    env: {
      es2022: true,
      browser: true,
    },
    overrides: [
      {
        files: ["**/*.ts"],
        parser: require.resolve("@typescript-eslint/parser"),
        extends: [
          "eslint:recommended",
          "plugin:@typescript-eslint/recommended",
          "plugin:prettier/recommended",
        ],
        plugins: ["@typescript-eslint"],
      },
      {
        files: ["test/**/*.js"],
        parser: "esprima",
        env: {
          es2022: true,
          browser: true,
          jest: true,
          jasmine: true,
          node: true,
        },
      },
    ],
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
    exclude: /node_modules\/(assert|core-js|@babel\/runtime)/,
    presets: [
      [
        require.resolve("@babel/preset-env"),
        {
          targets: [`defaults and supports es6-module`],
          bugfixes: true,
          debug: false,
          useBuiltIns: "usage",
          corejs: { version: "3.21", proposals: true },
        },
      ],
    ],
    plugins: [
      [
        require.resolve("@babel/plugin-transform-runtime"),
        { useESModules: true },
      ],
    ],
  },
  prettier: null,
  rollup: null,
  typedoc: null,
  jsdoc: null,
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
      group: "Input/meta options:",
      type: "string",
      describe: `Specify the current working directory for all commands.`,
      defaultDescription: `process.cwd()`,
    },
    username: {
      group: "Input/meta options:",
      type: "string",
      describe: `Specify a user name for the init command.`,
      defaultDescription: `$ npm whoami`,
    },
    gitHubUsername: {
      group: "Input/meta options:",
      type: "string",
      describe: `Specify a GitHub user name for the init command.`,
      defaultDescription: `options.username`,
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
  })
  .wrap(null)
  .version(version)
  .help();

const commands = [init, dev, build, release, deploy, install];
commands.forEach((fn) => {
  parser.command(
    fn.name,
    fn.description,
    () => {},
    async (argv) => {
      const {
        [fn.name]: cosmiconfigCommandOptions,
        ...cosmiconfigGlobalOptions
      } = cosmiconfigOptions || {};

      const options = {
        ...DEFAULTS_OPTIONS,
        ...(cosmiconfigGlobalOptions || {}),
        ...(cosmiconfigCommandOptions || {}),
        ...argv,
        command: fn.name,
        argv,
      };

      try {
        options.cwd = resolve(options.cwd);
        options.cacheFolder = join(options.cwd, "node_modules", ".cache", NAME);
        console.info(`${fn.name} in '${options.cwd}'`);

        await fs.access(options.cwd, constants.R_OK | constants.W_OK);

        // Auto-detect TypeScript project
        options.ts ??= isTypeScriptProject(options.cwd);

        // Set default docs
        options.docs = options.docs ?? (options.ts ? "docs" : "README.md");
        options.docsFormat = options.docsFormat ?? (options.ts ? "html" : "md");

        fn(options);
      } catch (error) {
        console.error(`Can't access cwd.`);
        console.error(error);
      }
    }
  );
});

parser.parse();
