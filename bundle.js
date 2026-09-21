import { join } from "node:path";
import { fileURLToPath } from "node:url";

import console from "console-ansi";
import nodeResolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import polyfillNode from "rollup-plugin-polyfill-node";
import json from "@rollup/plugin-json";
import replace from "@rollup/plugin-replace";
import commonjsNamedExports from "rollup-plugin-commonjs-named-exports";
import noOp from "rollup-plugin-no-op";
import browserslistToEsbuild from "browserslist-to-esbuild";
import deepmerge from "deepmerge";

import { FILES_GLOB, secondsFormatter } from "./utils.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

let bundler;
let bundlerOptions;
let watch;

let transpiler;
let minifier;

const parsePluginOptions = (plugins, options) =>
  Object.entries(plugins)
    .filter(([name]) => {
      if (!options[name]) return true;
      return options[name].enabled ?? true;
    })
    .map(([name, pluginFactory]) => pluginFactory(options[name]));

const groupExtraPlugins = (plugins) =>
  plugins.reduce(
    (groupedPlugins, plugin) => {
      if (plugin.enforce === "pre") groupedPlugins["pre"].push(plugin);
      else if (plugin.enforce === "post") groupedPlugins["post"].push(plugin);
      else groupedPlugins["normal"].push(plugin);
      delete plugin.enforce;
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

const bundle = async (options = {}) => {
  const label = `bundle (${options.bundler})`;
  console.time(label);

  if (options.bundler === "rolldown") {
    ({ rolldown: bundler, watch } = await import("rolldown"));
    bundlerOptions = deepmerge(options.rollup, options.rolldown);
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
        nodeResolve: {
          modulePaths: [join(__dirname, "node_modules")],
          mainFields: options.resolve.mainFields,
          browser: options.resolve.browserField,
        },
        commonjs: { sourceMap, strictRequires: "auto" },
        /** @type {import("rollup-plugin-polyfill-node").NodePolyfillsOptions} */
        polyfillNode: {
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
        noOp: { ids: ["inspector"] },
      },
      bundlerOptions.pluginsOptions,
    );

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
              commonjsNamedExports,
              polyfillNode,
              replace,
              noOp,
            }
          : {
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
      console.info(`bundle: watching...`);

      const watcher = watch({
        ...inputOptions,
        output: outputOptions,
        watch: bundlerOptions.watch,
      });

      watcher.on("event", ({ code, error, result, duration }) => {
        if (code === "ERROR") formatRollupLog(error);
        if (code === "BUNDLE_START") console.info(`${label}: bundling...`);
        if (code === "BUNDLE_END") {
          console.info(
            `${label}: bundled in ${secondsFormatter.format(duration / 1000)}.`,
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

  console.timeEnd(label);

  return result;
};
bundle.description = `Bundle dependencies for development or production.`;

export default bundle;
