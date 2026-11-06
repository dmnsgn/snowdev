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
 * @param {{ mainFields: string[]; requireMainFields: string[] }} options
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
    } else {
      if (options.transpiler === "esbuild") {
        const esbuild = { ...options.esbuild };
        if (options.targets) {
          esbuild.target = browserslistToEsbuild(options.targets);
        }

        transpiler = await (
          await import("rollup-plugin-esbuild")
        ).default({ minify, sourceMap, ...esbuild });
      } else if (options.transpiler === "swc") {
        const { exclude, include, ...swc } = options.swc || {};
        if (options.targets) swc.env = { ...swc.env, targets: options.targets };

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
