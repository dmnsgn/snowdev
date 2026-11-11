import { createHash } from "node:crypto";
import { promises as fs, readFileSync } from "node:fs";
import { findPackageJSON } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import polyfillNode from "rollup-plugin-polyfill-node";
import json from "@rollup/plugin-json";
import replace from "@rollup/plugin-replace";
import commonjsNamedExports from "rollup-plugin-commonjs-named-exports";
import noOp from "rollup-plugin-no-op";
import { stripShebang } from "rollup-plugin-strip-shebang";
import browserslistToEsbuild from "browserslist-to-esbuild";
import deepmerge from "deepmerge";
import { parseAsync, transformFromAstAsync } from "@babel/core";
import polyfillCoreJs from "babel-plugin-polyfill-corejs3";
import { MagicString } from "magic-string";

import {
  getConditions,
  getMainFields,
  getRequireMainFields,
  isInsidePackage,
  resolveLegacyEntry,
} from "./resolve.js";
import {
  console,
  FILES_GLOB,
  getPackageName,
  isBareSpecifier,
  listFormatter,
  overwriteArrays,
  pathExists,
  readJson,
  realpathSafe,
  secondsFormatter,
  stripQuery,
  timed,
} from "./utils.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

let bundler;
let bundlerOptions;
let watch;

let transpiler;
let minifier;

// As written by @rollup/plugin-inject
const INJECTED_IMPORT = /^import \{ (\S+) as (\S+) \} from '(.+)';$/gm;

/**
 * Rewrite imports injected in CommonJS files to `require()` calls.
 *
 * @returns {import("rolldown").Plugin}
 */
const requireInjectedImports = () => ({
  name: "require-injected-imports",
  transform(code, id) {
    // rolldown parses ".cjs" files as scripts: an import is a syntax error
    return /\.c[jt]s$/.test(stripQuery(id))
      ? {
          code: code.replaceAll(
            INJECTED_IMPORT,
            "const { $1: $2 } = require('$3');",
          ),
          map: null,
        }
      : null;
  },
});

/**
 * Report modules bundlers can't name in their own errors.
 *
 * @returns {import("rolldown").Plugin}
 */
const reportModules = () => ({
  name: "report-modules",
  // Last, for plugins handling these types. rolldown's own errors for them have
  // no module id to empty: raising them here sets it.
  transform: {
    order: "post",
    handler(code, id, meta) {
      if (meta?.moduleType === "css") {
        this.error({ message: "Bundling CSS is not supported", id });
      }
      if (meta?.moduleType === "json") {
        try {
          JSON.parse(code);
        } catch (error) {
          this.error({ message: error.message, id });
        }
      }
      return null;
    },
  },
});

const getRedirect = async (path, { mainFields, requireMainFields }) => {
  const src = dirname(path);
  const pkg = await readJson(path);
  if (pkg.exports) return null;

  const entry = await resolveLegacyEntry(pkg, src, mainFields);
  const requireEntry = await resolveLegacyEntry(pkg, src, requireMainFields);
  if (!entry || !requireEntry) return null;

  const to = join(src, requireEntry);
  const isValid =
    (await pathExists(to)) && (await isInsidePackage(src, requireEntry));
  return isValid ? { from: join(src, entry), to } : null;
};

/**
 * Resolve `require()` of a package to its `requireMainFields` entry instead of
 * its `mainFields` one.
 *
 * @param {object} options
 * @param {string[]} options.mainFields
 * @param {string[]} options.requireMainFields
 * @returns {import("rolldown").Plugin}
 */
const requireMain = (options) => {
  const redirects = new Map();

  const findRedirect = async (source, importer) => {
    try {
      const path = await realpathSafe(findPackageJSON(source, importer));
      if (!redirects.has(path)) {
        redirects.set(path, getRedirect(path, options));
      }
      return await redirects.get(path);
    } catch {
      // Not reachable by Node: bundler specific resolution or virtual module
      return null;
    }
  };

  return {
    name: "require-main",
    async resolveId(source, importer, resolveOptions) {
      // rolldown sets kind, @rollup/plugin-commonjs sets custom
      const isRequire =
        resolveOptions.kind === "require-call" ||
        resolveOptions.custom?.["node-resolve"]?.isRequire;
      if (
        !isRequire ||
        !importer ||
        !isBareSpecifier(source) ||
        getPackageName(source) !== source
      ) {
        return null;
      }

      // Keep what other plugins resolved: polyfills, aliases and externals
      const resolved = await this.resolve(source, importer, {
        ...resolveOptions,
        skipSelf: true,
      });
      if (!resolved || resolved.external) return null;

      const redirect = await findRedirect(source, stripQuery(importer));
      return redirect?.from === resolved.id ? redirect.to : null;
    },
  };
};

const CORE_JS_SOURCE = /^core-js(?:\/|$)/;
const CORE_JS_MODULE = /^core-js\/modules\/(.+)\.js$/;
const COMMONJS_KEYWORDS = /\b(?:require|module|exports)\b/;

// Babel can't enable both: "jsx" breaks `<T>value` casts in ".ts" files
const getParserPlugins = (filename) => {
  if (/\.[cm]?ts$/.test(filename)) return ["typescript"];
  if (/\.tsx$/.test(filename)) return ["typescript", "jsx"];
  return ["jsx"];
};

// Scripts without CommonJS keywords are ES modules without imports or exports:
// a require() would reach the output unconverted
const isCommonJs = (filename, code, sourceType) =>
  /\.c[jt]s$/.test(filename) ||
  (sourceType === "script" &&
    !/\.m[jt]s$/.test(filename) &&
    COMMONJS_KEYWORDS.test(code));

const getSource = (node) =>
  node.type === "ImportDeclaration"
    ? node.source.value
    : node.expression?.callee?.name === "require" &&
      node.expression.arguments[0]?.value;

// Module names of the polyfills Babel injected, read from the AST: generating code is slow on large files and breaks their source maps
const getInjectedPolyfills = (program) =>
  program.body.flatMap((node) => {
    const name = CORE_JS_MODULE.exec(getSource(node))?.[1];
    return name ? [name] : [];
  });

// Ranges of the core-js imports Babel replaced: entry points with "entry-global"
const getReplacedImports = (program, transformedProgram) => {
  const kept = new Set(transformedProgram.body.map(({ start }) => start));
  return program.body
    .filter(
      (node) => CORE_JS_SOURCE.test(getSource(node)) && !kept.has(node.start),
    )
    .map(({ start, end }) => [start, end]);
};

// The project's core-js, or snowdev's own
const findCoreJs = (cwd) => {
  try {
    return findPackageJSON("core-js", join(cwd, "package.json"));
  } catch {
    return findPackageJSON("core-js", import.meta.url);
  }
};

// TODO: core-js v4
// const coreJs = async ({ method, targets, exclude }) =>
//   (await import("@core-js/unplugin/rolldown")).default({ // "@core-js/unplugin/rollup"
//     method,
//     targets,
//     exclude,
//   });

/**
 * Import the core-js modules each file uses and its targets lack.
 *
 * @param {object} options
 * @param {string} options.cwd
 * @param {"usage-global" | "entry-global"} [options.method="usage-global"]
 *   Import the polyfills each file uses, or expand core-js entry imports to the
 *   polyfills the targets lack.
 * @param {string | string[]} options.targets
 * @param {string[]} [options.exclude] Core-js modules or features never
 *   imported.
 * @param {string | false} [options.cacheFolder]
 * @param {boolean} [options.debug] List the polyfills of each bundle.
 * @returns {import("rolldown").Plugin}
 */
const coreJs = ({
  cwd,
  method = "usage-global",
  targets,
  exclude = [],
  cacheFolder,
  debug,
}) => {
  const packageJsonPath = findCoreJs(cwd);
  const { version } = JSON.parse(readFileSync(packageJsonPath, "utf8"));

  const parseOptions = {
    babelrc: false,
    configFile: false,
    // CommonJS modules get require() calls
    sourceType: "unambiguous",
  };
  const babelOptions = {
    ...parseOptions,
    inputSourceMap: false,
    code: false,
    ast: true,
    targets,
    browserslistConfigFile: false,
    plugins: [[polyfillCoreJs, { method, version, exclude }]],
  };

  const scan = async (code, id) => {
    const filename = stripQuery(id);
    const ast = await parseAsync(code, {
      ...parseOptions,
      parserOpts: { plugins: getParserPlugins(filename) },
      filename,
    });
    const { ast: transformed } = await transformFromAstAsync(ast, code, {
      ...babelOptions,
      filename,
    });
    return {
      polyfills: getInjectedPolyfills(transformed.program),
      replaced: getReplacedImports(ast.program, transformed.program),
      sourceType: transformed.program.sourceType,
    };
  };

  // Babel parses ~1MB/s: large prebuilt files would cost the same scan on every build
  const cachedScan = async (code, id) => {
    const hash = createHash("sha256")
      .update(
        JSON.stringify([
          version,
          method,
          targets,
          exclude,
          getParserPlugins(stripQuery(id)),
        ]),
      )
      .update(code)
      .digest("hex");
    const file = join(cacheFolder, `${hash}.json`);
    try {
      return JSON.parse(await fs.readFile(file, "utf8"));
    } catch {
      const result = await scan(code, id);
      await fs.mkdir(cacheFolder, { recursive: true });
      await fs.writeFile(file, JSON.stringify(result));
      return result;
    }
  };

  // Resolved from the project: importers outside of it would find another core-js, or none
  const getSpecifier = (name) =>
    JSON.stringify(join(dirname(packageJsonPath), "modules", `${name}.js`));

  // Kept across watch rebuilds: unchanged modules aren't transformed again
  const modulePolyfills = new Map();

  return {
    name: "core-js",
    transform: {
      // Virtual modules and core-js itself excluded
      filter: {
        id: {
          include: /\.[cm]?[jt]sx?(?:$|\?)/,
          exclude: [/^\0/, /[\\/]core-js[\\/]/],
        },
      },
      async handler(code, id) {
        const { polyfills, replaced, sourceType } = await (
          cacheFolder ? cachedScan : scan
        )(code, id);
        modulePolyfills.set(id, polyfills);
        if (!polyfills.length && !replaced.length) return null;

        const isModule = !isCommonJs(stripQuery(id), code, sourceType);
        const statements = polyfills
          .map(getSpecifier)
          .map((specifier) =>
            isModule ? `import ${specifier};` : `require(${specifier});`,
          )
          .join("");

        // Hoisted imports run before the module body: appending them keeps every position, and the existing source map
        if (isModule && !replaced.length) {
          return { code: `${code}\n${statements}`, map: null };
        }

        const magicString = new MagicString(code);
        for (const [start, end] of replaced) magicString.remove(start, end);
        if (isModule) magicString.append(`\n${statements}`);
        else magicString.prepend(`${statements}\n`);
        return {
          code: magicString.toString(),
          map: magicString.generateMap({ hires: "boundary" }),
        };
      },
    },
    buildEnd() {
      if (!debug) return;
      const names = Array.from(
        new Set(
          Array.from(this.getModuleIds()).flatMap(
            (id) => modulePolyfills.get(id) ?? [],
          ),
        ),
      ).sort((a, b) => a.localeCompare(b));
      console.info(
        `core-js polyfills (${names.length}): ${listFormatter.format(names)}`,
      );
    },
  };
};

const parsePluginOptions = (plugins, options) =>
  Object.entries(plugins)
    .filter(([name]) => !options[name] || (options[name].enabled ?? true))
    .map(([name, pluginFactory]) => pluginFactory(options[name]));

const groupExtraPlugins = (plugins) =>
  plugins.reduce(
    (groupedPlugins, plugin) => {
      const { enforce, ...rest } = plugin;
      if (enforce === "pre") groupedPlugins["pre"].push(rest);
      else if (enforce === "post") groupedPlugins["post"].push(rest);
      else groupedPlugins["normal"].push(enforce ? rest : plugin);
      return groupedPlugins;
    },
    { pre: [], normal: [], post: [] },
  );

const formatRollupLog = (
  { name, cause, loc, message, frame },
  level = "error",
) => {
  name = name || cause?.name;
  name = name ? ` ${name}` : "";
  console[level](
    `rollup${name}: ${message}`,
    loc ? `at ${loc.file}(${loc.line},${loc.column}): ` : "",
  );
  if (frame) globalThis.console[level](frame);
};

const label = (options = {}) => `bundle (${options.bundler})`;

// `browser` maps are applied by bundlers, including ignored files:
// https://github.com/defunctzombie/package-browser-field-spec#ignore-a-module
const BROWSER_ALIAS_FIELDS = [["browser"]];

const bundle = timed(async (options = {}) => {
  if (options.bundler === "rolldown") {
    ({ rolldown: bundler, watch } = await import("rolldown"));
    bundlerOptions = deepmerge(options.rollup, options.rolldown, {
      arrayMerge: overwriteArrays,
    });
  } else {
    ({ rollup: bundler, watch } = await import("rollup"));
    bundlerOptions = options.rollup;
  }

  const sourceMap = bundlerOptions.sourceMap;
  let plugins = bundlerOptions.input?.plugins;

  if (!plugins) {
    let minify = options.minify;
    minify ??= options.NODE_ENV === "production";

    const polyfilledFiles = [...FILES_GLOB.javascript, ...FILES_GLOB.commonjs];

    const pluginsOptions = deepmerge(
      {
        // Injected polyfill imports would precede a shebang, a syntax error.
        // commonjs-named-exports copies them to modules with a query.
        stripShebang: {
          include: polyfilledFiles.map((glob) => `${glob}*`),
          sourcemap: sourceMap,
        },
        nodeResolve: {
          rootDir: options.cwd,
          modulePaths: [join(__dirname, "node_modules")],
          mainFields: getMainFields(options),
          browser: options.resolve.browserField,
          exportConditions: getConditions(options),
        },
        commonjs: { sourceMap, strictRequires: "auto" },
        /** @type {import("rollup-plugin-polyfill-node").NodePolyfillsOptions} */
        polyfillNode: {
          baseDir: await realpathSafe(options.cwd),
          include: polyfilledFiles,
          exclude: options.transpileExclude,
        },
        replace: {
          [["process", "env", "NODE_ENV"].join(".")]: JSON.stringify(
            options.NODE_ENV,
          ),
          preventAssignment: true,
        },
        json: { compact: minify },
        requireMain: {
          mainFields: getMainFields(options),
          requireMainFields: getRequireMainFields(options),
        },
        coreJs: {
          enabled: false,
          cwd: options.cwd,
          method: "usage-global",
          targets: options.targets,
          cacheFolder: options.cache && join(options.cacheFolder, "core-js"),
        },
      },
      bundlerOptions.pluginsOptions,
      { arrayMerge: overwriteArrays },
    );
    // Not a default: install sets ids to failed modules
    pluginsOptions.noOp = {
      ...pluginsOptions.noOp,
      ids: ["inspector", ...(pluginsOptions.noOp?.ids ?? [])],
    };

    if (options.bundler === "rolldown") {
      bundlerOptions.output.minify = minify;

      // Syntax lowering only: missing built-ins aren't polyfilled
      bundlerOptions.input = {
        ...bundlerOptions.input,
        transform: {
          target: browserslistToEsbuild(options.targets),
          ...bundlerOptions.input?.transform,
        },
      };
    } else {
      if (options.transpiler === "esbuild") {
        const esbuild = {
          target: browserslistToEsbuild(options.targets),
          ...options.esbuild,
        };

        transpiler = await (
          await import("rollup-plugin-esbuild")
        ).default({ minify, sourceMap, ...esbuild });
      } else if (options.transpiler === "swc") {
        const { exclude, include, ...swc } = options.swc || {};
        swc.env = { targets: options.targets, ...swc.env };

        transpiler = await (
          await import("@rollup/plugin-swc")
        ).default({
          include,
          exclude,
          swc: {
            cwd: options.cwd,
            minify,
            sourceMaps: sourceMap,
            ...swc,
          },
        });
      } else {
        transpiler = await (
          await import("@rollup/plugin-babel")
        ).babel({
          cwd: options.cwd,
          babelHelpers: "runtime",
          targets: options.targets,
          ...options.babel,
        });

        if (minify) {
          minifier = await (await import("@rollup/plugin-terser")).default();
        }
      }
    }

    const { pre, normal, post } = groupExtraPlugins(
      bundlerOptions.extraPlugins.filter(Boolean),
    );

    plugins = [
      ...pre,
      ...parsePluginOptions(
        options.bundler === "rolldown"
          ? {
              reportModules,
              stripShebang,
              requireMain,
              coreJs,
              commonjsNamedExports,
              polyfillNode,
              requireInjectedImports,
              replace,
              noOp,
            }
          : {
              reportModules,
              stripShebang,
              requireMain,
              nodeResolve,
              // Before commonjs: it converts the injected require() calls
              ...(["esbuild", "swc"].includes(options.transpiler) && {
                coreJs,
              }),
              commonjs,
              commonjsNamedExports,
              polyfillNode,
              replace,
              json,
              noOp,
            },
        pluginsOptions,
      ),
      ...normal,
      options.bundler === "rolldown" ? 0 : transpiler,
      ...post,
      minifier,
    ].filter(Boolean);
  }

  let bundle;
  let result;
  try {
    /** @type {import("rollup").InputOptions} */
    const inputOptions = {
      // input,
      onLog(level, log) {
        if (
          [
            "THIS_IS_UNDEFINED",
            "EVAL",
            "MODULE_LEVEL_DIRECTIVE",
            "INVALID_ANNOTATION",
          ].includes(log.code) ||
          (log.code === "CIRCULAR_DEPENDENCY" &&
            ["node_modules", "polyfill-node", "@babel"].some((filter) =>
              log.message.includes(filter),
            ))
        ) {
          return;
        }

        formatRollupLog(log, level);
      },
      ...bundlerOptions.input,
      ...(options.bundler === "rolldown" && {
        cwd: bundlerOptions.input?.cwd ?? options.cwd,
        // Only "neutral" has no conditions or alias fields of its own
        platform:
          bundlerOptions.input?.platform ??
          (options.resolve.browserField ? "browser" : "neutral"),
        resolve: {
          mainFields: getMainFields(options),
          conditionNames: getConditions(options),
          aliasFields: options.resolve.browserField ? BROWSER_ALIAS_FIELDS : [],
          ...bundlerOptions.input?.resolve,
        },
      }),
      plugins,
    };

    /** @type {import("rollup").OutputOptions} */
    const outputOptions = {
      // dir,
      sourcemap: sourceMap,
      chunkFileNames: "_chunks/[name]-[hash].js",
      manualChunks(id) {
        if (id.includes("core-js/") || id.includes("polyfill-node")) {
          return "polyfills";
        }
      },
      ...bundlerOptions.output,
    };

    if (bundlerOptions.watch) {
      console.info(`bundle — watching…`);

      const watcher = watch({
        ...inputOptions,
        output: outputOptions,
        watch: bundlerOptions.watch,
      });

      watcher.on("event", ({ code, error, result, duration }) => {
        if (code === "ERROR") formatRollupLog(error);
        if (code === "BUNDLE_START")
          console.info(`${label(options)} — bundling…`);
        if (code === "BUNDLE_END") {
          console.info(
            `${label(options)} — bundled in ${secondsFormatter.format(duration / 1000)}.`,
          );
        }
        if (result) result.close();
      });
      result = watcher;
    } else {
      bundle = await bundler(inputOptions);
      result = await bundle.write(outputOptions);
      result.watchFiles = await bundle.watchFiles;

      await bundle.close();
    }
  } catch (error) {
    if (options.caller === "cli") console.error(error);
    if (bundle) await bundle.close();
    result = { error };
  }

  return result;
}, label);

export default bundle;
