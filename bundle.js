import { join } from "node:path";
import { fileURLToPath } from "node:url";

import console from "console-ansi";
import { rollup } from "rollup";
import resolve from "@rollup/plugin-node-resolve";
import cjs from "@rollup/plugin-commonjs";
import nodePolyfills from "rollup-plugin-polyfill-node";
import json from "@rollup/plugin-json";
import replace from "@rollup/plugin-replace";

import cjsNamedExports from "./utils/cjs-named-exports-plugin.js";
import noOpPlugin from "./utils/no-op-plugin.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

let transpiler;
let minifier;

const bundle = async (options = {}) => {
  const label = `bundle`;
  console.time(label);

  let minify = options.minify;
  minify ??= options.NODE_ENV === "production";

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

  let bundle;
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
      // TODO: make plugins more configurable
      plugins: [
        resolve({ modulePaths: [join(__dirname, "node_modules")] }),
        cjs(),
        cjsNamedExports(),
        nodePolyfills({ include: options.resolve.include }), // Transform all files
        replace({
          "process.env.NODE_ENV": JSON.stringify(options.NODE_ENV),
          preventAssignment: true,
        }),
        json({ compact: minify }),
        transpiler,
        minifier,
        noOpPlugin({ ids: ["inspector"] }),
      ],
      ...options.rollup.input,
    });

    await bundle.write({
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
    return;
  }

  console.timeEnd(label);
};
bundle.description = `Bundle dependencies for development or production.`;

export default bundle;
