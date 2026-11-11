import { join } from "node:path";
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

import coreJs from "./plugins/core-js.js";
import nodeProtocol from "./plugins/node-protocol.js";
import reportModules from "./plugins/report-modules.js";
import requireInjectedImports from "./plugins/require-injected-imports.js";
import requireMain from "./plugins/require-main.js";
import {
  getAliasFields,
  getConditions,
  getMainFields,
  getRequireMainFields,
} from "./resolve.js";
import {
  console,
  FILES_GLOB,
  overwriteArrays,
  realpathSafe,
  secondsFormatter,
  timed,
} from "./utils.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

let bundler;
let bundlerOptions;
let watch;

let transpiler;
let minifier;

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

    const pluginsOptions = deepmerge(
      {
        // Injected polyfill imports would precede a shebang, a syntax error.
        // commonjs-named-exports copies them to modules with a query: "[?]" is
        // a literal one, "?" any character.
        stripShebang: {
          include: FILES_GLOB.scripts.flatMap((glob) => [glob, `${glob}[?]*`]),
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
          include: [...FILES_GLOB.javascript, ...FILES_GLOB.commonjs],
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
              nodeProtocol,
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
              nodeProtocol,
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
          aliasFields: getAliasFields(options),
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
