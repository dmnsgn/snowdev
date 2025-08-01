import { promises as fs, constants } from "node:fs";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import console from "console-ansi";
import deepmerge from "deepmerge";
import semver from "semver";
import browserslistToEsbuild from "browserslist-to-esbuild";
import eslintJs from "@eslint/js";
import globals from "globals";
import babelParser from "@babel/eslint-parser";
import tseslint from "typescript-eslint";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import eslintPluginJsdoc from "eslint-plugin-jsdoc";

import init from "./init.js";
import dev from "./dev.js";
import build from "./build.js";
import bundle from "./bundle.js";
import release from "./release.js";
import deploy from "./deploy.js";
import install from "./install.js";
import npm from "./npm.js";
import {
  FILES_GLOB,
  NAME,
  VERSION,
  CORE_JS_SEMVER,
  isTypeScriptProject,
  readJson,
  writeJson,
} from "./utils.js";

const require = createRequire(import.meta.url);
const __dirname = fileURLToPath(new URL(".", import.meta.url));

console.prefix = `[${NAME}]`;

// Options
const TARGETS = `defaults and supports es6-module`;
const coreJsVersion = `${CORE_JS_SEMVER.major}.${CORE_JS_SEMVER.minor}`;

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
  npmPath: null, // dirname(require.resolve("npm")),

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
  pkgFix: true,

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
  /** @type {import("eslint").Linter.FlatConfig} */
  eslint: [
    eslintJs.configs.recommended,
    ...tseslint.configs.recommended.map((config) => ({
      ...config,
      files: FILES_GLOB.typescriptAll,
    })),
    {
      files: FILES_GLOB.javascript,
      languageOptions: {
        parser: babelParser,
        parserOptions: {
          ecmaVersion: "latest",
          sourceType: "module",
          requireConfigFile: false,
          babelOptions: {}, // Overwritten with options.babel on lint
        },
        globals: {
          ...globals.browser,
          ...globals.node,
          ...globals.worker,
        },
      },
    },
    {
      files: FILES_GLOB.javascript,
      ...eslintPluginJsdoc.configs["flat/recommended-typescript-flavor"],
    },
    {
      files: FILES_GLOB.typescript,
      ...eslintPluginJsdoc.configs["flat/recommended-typescript"],
    },
    {
      files: [...FILES_GLOB.javascript, ...FILES_GLOB.typescript],
      plugins: { jsdoc: eslintPluginJsdoc },
      rules: {
        "jsdoc/require-jsdoc": 0,
        "jsdoc/require-param-description": 0,
        "jsdoc/require-property-description": 0,
        "jsdoc/require-returns-description": 0,
        "jsdoc/tag-lines": 0,
        "jsdoc/no-defaults": 0,
      },
      settings: { jsdoc: { ignorePrivate: true } },
    },
    {
      files: ["test/**/*.js"],
      languageOptions: {
        // parser: "esprima",
        globals: {
          ...globals.browser,
          ...globals.node,
          ...globals.jest,
          ...globals.jasmine,
        },
      },
    },
    eslintPluginPrettierRecommended,
    // TODO: https://github.com/import-js/eslint-plugin-import/pull/2996
    // {
    //   extends: ["plugin:import/recommended"],
    //   plugins: ["eslint-plugin-import"],
    //   rules: {
    //     "import/no-cycle": 1,
    //     "import/order": [1, { groups: ["builtin", "external", "internal"] }],
    //     "import/no-named-as-default": 0,
    //     "import/newline-after-import": 2,
    //   },
    // },
  ],
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
          corejs: { version: coreJsVersion, proposals: true },
        },
      ],
    ],
    plugins: [
      [
        require.resolve("@babel/plugin-transform-runtime"),
        { corejs: { version: CORE_JS_SEMVER.major, proposals: true } },
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
    /** @type {import("@rollup/pluginutils").FilterPattern} */
    exclude: /node_modules\/(assert|core-js|@babel\/runtime|es-module-shims)/,
    env: {
      targets: TARGETS,
      mode: "entry",
      coreJs: coreJsVersion,
      shippedProposals: true,
      // path: cwd?
      // debug: true,
    },
    jsc: {
      // `env` and `jsc.target` cannot be used together
      target: null,
      parser: {
        importAttributes: true,
      },
    },
  },
  importMap: {},
  resolve: {
    include: [
      ...FILES_GLOB.javascript,
      ...FILES_GLOB.typescript,
      ...FILES_GLOB.commonjs,
      ...FILES_GLOB.react,
      ...FILES_GLOB.assets,
    ],
    exclude: ["**.d.ts"],
    copy: FILES_GLOB.assets,
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
  jsdoc2md: null,
};

export const commands = { init, dev, build, bundle, release, deploy, install };

export { npm, FILES_GLOB };

export const run = async (fn, options) => {
  const { [fn.name]: commandOptions, ...globalOptions } = options;

  options = deepmerge.all(
    [DEFAULTS_OPTIONS, globalOptions || {}, commandOptions || {}],
    { clone: false },
  );

  try {
    await npm.load(options.npmPath);

    if (options.caller === "cli") {
      console.debug(`v${VERSION}`);
      console.debug(
        `Using npm@${(await npm.run(options.cwd, "--version")).trim()} (${options.npmPath || "global"})`,
      );
    }

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

    // if (options.ts) {
    //   options.eslint.extends.push(
    //     "plugin:import/typescript",
    //   );
    //   options.eslint.settings["import/resolver"] = {
    //     typescript: true,
    //     node: true,
    //   };
    // }

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
    console.error(
      `Error accessing "cwd", loading "npm" or reading "package.json".`,
    );
    console.error(error);
    return { error };
  }
};
