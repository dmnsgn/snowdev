import { promises as fs, constants } from "node:fs";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

import console from "console-ansi";
import deepmerge from "deepmerge";
import browserslistToEsbuild from "browserslist-to-esbuild";

import init from "./init.js";
import dev from "./dev.js";
import build from "./build.js";
import bundle from "./bundle.js";
import release from "./release.js";
import deploy from "./deploy.js";
import install from "./install.js";
import { NAME, isTypeScriptProject } from "./utils.js";

const require = createRequire(import.meta.url);

console.prefix = `[${NAME}]`;

// Options
const TARGETS = `defaults and supports es6-module`;
export const DEFAULTS_OPTIONS = {
  // Inputs/meta
  cwd: process.cwd(),
  NODE_ENV: process.env.NODE_ENV || "development",
  username: null,
  gitHubUsername: null,
  authorName: null,
  files: "{*.+(j|t|mj|mt|cj|ct)s,src/**/*.+(j|t|mj|mt|cj|ct)s}",
  ignore: ["**/node_modules/**"],
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

  // Server
  /** @type {import("browser-sync").Options} */
  browsersync: {
    open: true,
    https: true,
    single: true,
    watch: true,
  },
  hmr: false,
  http2: true,
  crossOriginIsolation: false,

  // Formatter and linter
  // TODO: lint and format config in code editor? Do I need config in package.json instead?
  /** @type {import("prettier").RequiredOptions} */
  prettier: null,
  /** @type {import("eslint").Linter.Config} */
  eslint: {
    parser: require.resolve("@babel/eslint-parser"),
    extends: [
      "eslint:recommended",
      "plugin:prettier/recommended",
      "plugin:jsdoc/recommended",
    ],
    plugins: ["eslint-plugin-prettier", "eslint-plugin-jsdoc"],
    rules: {
      "prettier/prettier": "error",
      "jsdoc/require-jsdoc": 0,
      "jsdoc/require-param-description": 0,
      "jsdoc/require-property-description": 0,
      "jsdoc/require-returns-description": 0,
      "jsdoc/tag-lines": 0,
    },
    settings: {
      jsdoc: {
        ignorePrivate: true,
      },
    },
    parserOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      requireConfigFile: false,
      babelOptions: {},
    },
    env: {
      es2022: true,
      browser: true,
      node: true,
      worker: true,
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
  /** @type {import("typescript").TranspileOptions} */
  tsconfig: {
    compilerOptions: {
      allowJs: true,
      declaration: true,
      declarationDir: "types",
      emitDeclarationOnly: true,
      lib: ["ESNext", "DOM"],
    },
  },

  // Transpile
  transpiler: "swc",
  /** @type {import("@rollup/plugin-babel").RollupBabelInputPluginOptions} */
  babel: {
    exclude: /node_modules\/(assert|core-js|@babel\/runtime)/,
    presets: [
      [
        require.resolve("@babel/preset-env"),
        {
          targets: [TARGETS],
          bugfixes: true,
          debug: false,
          useBuiltIns: "usage",
          corejs: { version: "3.30", proposals: true },
        },
      ],
    ],
    plugins: [
      [
        require.resolve("@babel/plugin-transform-runtime"),
        { corejs: { version: 3, proposals: true } },
      ],
    ],
  },
  /** @type {import("esbuild").BuildOptions} */
  esbuild: {
    exclude: [""],
    target: browserslistToEsbuild(TARGETS),
  },
  /** @type {import("@swc/core").Options} */
  swc: {
    env: {
      targets: TARGETS,
      mode: "entry", // "usage" is not working properly
      coreJs: "3.19",
      shippedProposals: true,
    },
  },
  importMap: {},
  resolve: {
    // include: [/\.((j|t|mj|mt|cj|ct)sx?)$/],
    include: ["**.js", "**.ts", "**.mjs", "**.mts", "**.cjs", "**.cts"],
    exclude: ["**.d.ts"],
    conditions: ["module", "import", "default"],
    mainFields: ["module", "jsnext:main", "jsnext", "main"],
    browserField: true,
    overrides: {},
  },
  rollup: {
    /** @type {import("rollup").InputOptions} */
    input: {},
    /** @type {import("rollup").OutputOptions} */
    output: {
      dir: "web_modules",
    },
  },

  // Docs
  typedoc: null,
  jsdoc: null,
};

export const commands = { init, dev, build, bundle, release, deploy, install };

export const run = async (fn, options) => {
  const { [fn.name]: commandOptions, ...globalOptions } = options;

  options = deepmerge(
    DEFAULTS_OPTIONS,
    options,
    globalOptions || {},
    commandOptions || {}
  );

  try {
    options.command = fn.name;
    options.cwd = resolve(options.cwd);
    options.cacheFolder = join(options.cwd, "node_modules", ".cache", NAME);
    console.info(`${fn.name} in '${options.cwd}'`);

    await fs.access(options.cwd, constants.R_OK | constants.W_OK);

    options.ignore.push(`**/${options.rollup.output.dir}/**`);

    // Auto-detect TypeScript project
    options.ts ??= isTypeScriptProject(options.cwd);

    // Set default docs
    options.docs = options.docs ?? (options.ts ? "docs" : "README.md");
    options.docsFormat = options.docsFormat ?? (options.ts ? "html" : "md");

    // console.debug(options);

    fn(options);
  } catch (error) {
    console.error(`Can't access cwd.`);
    console.error(error);
  }
};
