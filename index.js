import { promises as fs, constants } from "node:fs";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import deepmerge from "deepmerge";
import semver from "semver";
import browserslistToEsbuild from "browserslist-to-esbuild";

import npm from "./npm.js";
import {
  console,
  FILES_GLOB,
  NAME,
  VERSION,
  CORE_JS_SEMVER,
  isTypeScriptProject,
  allKeyed,
  readJson,
  writeJson,
} from "./utils.js";

const require = createRequire(import.meta.url);
const __dirname = fileURLToPath(new URL(".", import.meta.url));

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
  workspace: undefined,
  serve: true,
  lint: true,
  analyse: true,
  format: true,
  types: true,
  docs: undefined,
  docsFormat: undefined,
  docsStart: "<!-- api-start -->",
  docsEnd: "<!-- api-end -->",
  commitAndTagVersion: true,
  pkgFix: true,
  cache: true,

  /** @type {import("console-ansi").ConsoleAnsi} */
  console: { level: "log" },

  // Server
  /** @type {import("./server.js").ServerOptions} */
  server: {
    host: undefined,
    port: 3000,
    https: true,
    http2: true,
    open: true,
    single: true,
    crossOriginIsolation: false,
    headers: {},
    hmr: false,
    watch: [
      "*.{html,css,js,mjs}",
      "src/**/*.{js,mjs}",
      // TypeScript "outDir"
      "lib/**/*.js",
      "examples/**",
      "web_modules/**",
    ],
  },

  // Formatter and linter
  // TODO: lint and format config in code editor? Do I need config in package.json instead?
  // Merged with "prettier.config.js" and appended to "eslint.config.js" on use
  /** @type {import("prettier").RequiredOptions} */
  prettier: {},
  /** @type {import("eslint").Linter.FlatConfig} */
  eslint: [],
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
  transpileExclude:
    /node_modules\/(assert|core-js|@babel\/runtime|es-module-shims)/,
  /** @type {import("@rollup/plugin-babel").RollupBabelInputPluginOptions} */
  babel: {
    exclude: /node_modules\/(assert|core-js|@babel\/runtime)/,
    targets: TARGETS,
    presets: [[require.resolve("@babel/preset-env"), { debug: false }]],
    plugins: [
      [require.resolve("@babel/plugin-transform-runtime")],
      [
        require.resolve("babel-plugin-polyfill-corejs3"),
        { method: "usage-pure", version: coreJsVersion, proposals: true },
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

  // Bundle
  bundler: "rolldown",
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
  rolldown: {
    /** @type {import("rolldown").InputOptions} */
    input: {
      transform: {
        target: browserslistToEsbuild(TARGETS),
      },
      experimental: {
        attachDebugInfo: "none",
        resolveNewUrlToAsset: true,
      },
    },
  },

  // Docs
  typedoc: null,
  jsdoc: null,
  jsdoc2md: null,
};

const defineCommands = (definitions) =>
  Object.fromEntries(
    Object.entries(definitions).map(([name, { description, load }]) => {
      const command = async (options) => (await load()).default(options);
      Object.defineProperty(command, "name", { value: name });
      command.description = description;
      return [name, command];
    }),
  );

export const commands = defineCommands({
  init: {
    description: `Create simple package structure.`,
    load: () => import("./init.js"),
  },
  dev: {
    description: `Start dev server and install ESM dependencies.`,
    load: () => import("./dev.js"),
  },
  build: {
    description: `Lint and Format sources, run TypeScript, update README API.`,
    load: () => import("./build.js"),
  },
  bundle: {
    description: `Bundle dependencies for development or production.`,
    load: () => import("./bundle.js"),
  },
  release: {
    description: `Bump the version, generate changelog release, create a new commit with git tag.`,
    load: () => import("./release.js"),
  },
  deploy: {
    description: `Deploy to gh-pages.`,
    load: () => import("./deploy.js"),
  },
  install: {
    description: `Install ESM dependencies.`,
    load: () => import("./install.js"),
  },
});

export { npm, FILES_GLOB, TARGETS };

const getVersion = async (cwd) => (await npm.run(cwd, "--version")).trim();

const getWorkspace = async (cwd) =>
  (await npm.run(cwd, "query", [":scope.workspace", "--json"]))[0]?.name ??
  false;

export const run = async (fn, options) => {
  const { [fn.name]: commandOptions, ...globalOptions } = options;

  options = deepmerge.all(
    [DEFAULTS_OPTIONS, globalOptions || {}, commandOptions || {}],
    { clone: false },
  );

  Object.assign(console, options.console);

  try {
    await npm.load(options.npmPath);

    options.command = fn.name;
    options.cwd = resolve(options.cwd);
    options.cacheFolder = join(options.cwd, "node_modules", ".cache", NAME);

    await fs.access(options.cwd, constants.R_OK | constants.W_OK);

    Object.assign(
      options,
      await allKeyed({
        npmVersion: options.caller === "cli" && getVersion(options.cwd),
        workspace: options.workspace ?? getWorkspace(options.cwd),
        ts: options.ts ?? isTypeScriptProject(options.cwd),
      }),
    );

    if (options.caller === "cli") {
      console.info(
        `v${VERSION} — npm@${options.npmVersion} ("${options.npmPath || "global"}")`,
      );
    }
    console.info(`${fn.name} in "${options.cwd}"`);

    options.ignore.push(`**/${options.rollup.output.dir}/**`);

    // Set default docs
    options.docs = options.docs ?? (options.ts ? "docs" : "README.md");
    options.docsFormat = options.docsFormat ?? (options.ts ? "html" : "md");

    // Check package.json exists and update versions
    if (options.command === "dev") {
      const packageJsonPath = join(options.cwd, "package.json");
      let packageJson = await readJson(packageJsonPath);
      if (options.updateVersions) {
        const { engines = {}, packageManager } = await readJson(
          join(__dirname, "template", "package.json"),
        );
        const { prerelease, major, minor } = semver.minVersion(VERSION);
        engines[NAME] = prerelease.length
          ? `>=${VERSION}`
          : `>=${major}.${minor}.x`;
        packageJson = deepmerge(packageJson, { engines });

        const [name, version] = packageManager?.split("@", 2) ?? [];
        const [currentName, currentVersion] =
          packageJson.packageManager?.split("@") ?? [];
        if (
          !currentName ||
          (currentName === name &&
            (!semver.valid(currentVersion) ||
              semver.gt(version, currentVersion)))
        ) {
          packageJson.packageManager = packageManager;
        }
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
