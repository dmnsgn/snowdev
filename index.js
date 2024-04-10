import { promises as fs, constants } from "node:fs";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import console from "console-ansi";
import deepmerge from "deepmerge";
import semver from "semver";
import browserslistToEsbuild from "browserslist-to-esbuild";

import init from "./init.js";
import dev from "./dev.js";
import build from "./build.js";
import bundle from "./bundle.js";
import release from "./release.js";
import deploy from "./deploy.js";
import install from "./install.js";
import npm from "./npm.js";
import {
  NAME,
  VERSION,
  isTypeScriptProject,
  readJson,
  writeJson,
} from "./utils.js";

const require = createRequire(import.meta.url);
const __dirname = fileURLToPath(new URL(".", import.meta.url));

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
  updateVersions: true,
  npmPath: null,

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
  commitAndTagVersion: true,

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
      "plugin:import/recommended",
      "plugin:prettier/recommended",
    ],
    plugins: [
      "eslint-plugin-import",
      "eslint-plugin-prettier",
      "eslint-plugin-jsdoc",
    ],
    rules: {
      "prettier/prettier": "error",
      "jsdoc/require-jsdoc": 0,
      "jsdoc/require-param-description": 0,
      "jsdoc/require-property-description": 0,
      "jsdoc/require-returns-description": 0,
      "jsdoc/tag-lines": 0,
      "jsdoc/no-defaults": 0,
      "import/no-cycle": 1,
      "import/order": [1, { groups: ["builtin", "external", "internal"] }],
      "import/no-named-as-default": 0,
      "import/newline-after-import": 2,
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
      es2024: true,
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
          es2024: true,
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
      module: "esnext",
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
    jsc: {
      // `env` and `jsc.target` cannot be used together
      target: null,
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
    /** @type {import("rollup").InputPluginOption} */
    extraPlugins: [],
    pluginsOptions: {},
    watch: false,
    sourceMap: false,
  },

  // Docs
  typedoc: null,
  jsdoc: null,
};

export const commands = { init, dev, build, bundle, release, deploy, install };

export { npm };

export const run = async (fn, options) => {
  const { [fn.name]: commandOptions, ...globalOptions } = options;

  options = deepmerge.all([
    DEFAULTS_OPTIONS,
    globalOptions || {},
    commandOptions || {},
  ]);

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

    if (options.ts) {
      options.eslint.extends.push(
        "plugin:import/typescript",
        "plugin:jsdoc/recommended-typescript",
      );
      options.eslint.settings["import/resolver"] = {
        typescript: true,
        node: true,
      };
    } else {
      options.eslint.extends.push("plugin:jsdoc/recommended-typescript-flavor");
    }

    await npm.load(options.npmPath);

    // Check package.json exists and update versions
    if (options.command === "dev") {
      const packageJsonPath = join(options.cwd, "package.json");
      let packageJson = await readJson(packageJsonPath);
      if (options.updateVersions) {
        const { engines } = await readJson(
          join(__dirname, "template", "package.json"),
        );
        const { prerelease, major, minor } = semver.minVersion(VERSION);
        engines[NAME] = prerelease.length ? VERSION : `>=${major}.${minor}.x`;
        packageJson = deepmerge(packageJson, { engines });
        await writeJson(packageJsonPath, packageJson);
      }
    }

    // console.debug(options);

    return await fn(options);
  } catch (error) {
    console.error(`Error accessing "cwd" or reading "package.json".`);
    console.error(error);
    return { error };
  }
};
