import { join } from "node:path";
import { fileURLToPath } from "node:url";

import console from "console-ansi";
import { rollup, watch } from "rollup";
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
  const label = `bundle`;
  console.time(label);

  const sourceMap = options.rollup.sourceMap;
  let plugins = options.rollup.input?.plugins;

  if (!plugins) {
    let minify = options.minify;
    minify ??= options.NODE_ENV === "production";

    const pluginsOptions = deepmerge(
      {
        nodeResolve: { modulePaths: [join(__dirname, "node_modules")] },
        commonjs: { sourceMap, strictRequires: "auto" },
        polyfillNode: {
          include: [...FILES_GLOB.javascript, ...FILES_GLOB.commonjs],
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
      options.rollup.pluginsOptions,
    );

    if (options.transpiler === "esbuild") {
      options.esbuild ||= {};
      if (options.targets) {
        options.esbuild.target = browserslistToEsbuild(options.targets);
      }

      transpiler = await (
        await import("rollup-plugin-esbuild")
      ).default({ minify, sourceMap, ...options.esbuild });
    } else if (options.transpiler === "swc") {
      options.swc ||= {};
      if (options.targets) {
        options.swc.env ||= {};
        options.swc.env.targets = options.targets;
      }

      const { exclude, include, ...swc } = options.swc;

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
      options.babel ||= {};
      if (options.targets) {
        options.babel.presets ||= [];
        const presetEnv = options.babel.presets.find(([path]) =>
          path.includes("@babel/preset-env"),
        );
        presetEnv[1] ||= {};
        presetEnv[1].targets ||= [];
        presetEnv[1].targets.push(options.targets);
      }

      transpiler = await (
        await import("@rollup/plugin-babel")
      ).babel({ cwd: options.cwd, babelHelpers: "runtime", ...options.babel });

      if (minify) {
        minifier = await (await import("@rollup/plugin-terser")).default();
      }
    }

    const { pre, normal, post } = groupExtraPlugins(
      options.rollup.extraPlugins.filter(Boolean),
    );

    plugins = [
      ...pre,
      ...parsePluginOptions(
        {
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
      transpiler,
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
      ...options.rollup.input,
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
      ...options.rollup.output,
    };

    if (options.rollup.watch) {
      console.info(`bundle: watching...`);

      const watcher = watch({
        ...inputOptions,
        output: outputOptions,
        watch: options.rollup.watch,
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
      bundle = await rollup(inputOptions);
      result = await bundle.write(outputOptions);

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
