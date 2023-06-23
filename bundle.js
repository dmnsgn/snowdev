import { join } from "node:path";
import { fileURLToPath } from "node:url";

import console from "console-ansi";
import { rollup } from "rollup";
import nodeResolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import polyfillNode from "rollup-plugin-polyfill-node";
import json from "@rollup/plugin-json";
import replace from "@rollup/plugin-replace";
import deepmerge from "deepmerge";

import commonjsNamedExports from "./utils/commonjs-named-exports-plugin.js";
import noOp from "./utils/no-op-plugin.js";

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

const bundle = async (options = {}) => {
  const label = `bundle`;
  console.time(label);

  let plugins = options.rollup.input?.plugins;

  if (!plugins) {
    let minify = options.minify;
    minify ??= options.NODE_ENV === "production";

    const pluginsOptions = deepmerge(
      {
        nodeResolve: { modulePaths: [join(__dirname, "node_modules")] },
        polyfillNode: { include: options.resolve.include }, // Transform all files
        replace: {
          "process.env.NODE_ENV": JSON.stringify(options.NODE_ENV),
          preventAssignment: true,
        },
        json: { compact: minify },
        noOp: { ids: ["inspector"] },
      },
      options.rollup.pluginsOptions
    );

    if (options.transpiler === "esbuild") {
      transpiler = await (
        await import("rollup-plugin-esbuild")
      ).default({ minify, ...options.esbuild });
    } else if (options.transpiler === "swc") {
      transpiler = await (
        await import("@rollup/plugin-swc")
      ).default({ swc: { cwd: options.cwd, minify, ...options.swc } });
    } else {
      transpiler = await (
        await import("@rollup/plugin-babel")
      ).babel({ cwd: options.cwd, babelHelpers: "runtime", ...options.babel });

      if (minify) {
        minifier = await (await import("@rollup/plugin-terser")).default();
      }
    }

    plugins = [
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
        pluginsOptions
      ),
      transpiler,
      minifier,
      ...options.rollup.extraPlugins,
    ].filter(Boolean); // TODO: sort
  }

  let bundle;
  let result;
  try {
    bundle = await rollup({
      // input,
      onwarn({ code, loc, frame, message }) {
        if (
          ["THIS_IS_UNDEFINED", "EVAL"].includes(code) ||
          (code === "CIRCULAR_DEPENDENCY" &&
            ["polyfill-node", "@babel"].some((lib) => message.includes(lib)))
        ) {
          return;
        }

        console.warn(
          `rollup: ${
            loc ? `${loc.file}(${loc.line},${loc.column}): ` : ""
          }${message}`
        );
        if (frame) globalThis.console.warn(frame);
      },
      ...options.rollup.input,
      plugins,
    });

    result = await bundle.write({
      // dir: outputDir,
      chunkFileNames: "_chunks/[name]-[hash].js",
      manualChunks(id) {
        if (id.includes("core-js/") || id.includes("polyfill-node")) {
          return "polyfills";
        }
      },
      ...options.rollup.output,
    });

    await bundle.close();
  } catch (error) {
    console.error(error);
    if (bundle) await bundle.close();
    result = { error };
  }

  console.timeEnd(label);

  return result;
};
bundle.description = `Bundle dependencies for development or production.`;

export default bundle;
