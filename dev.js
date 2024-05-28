import { join } from "node:path";
import http2 from "node:http2";

import console from "console-ansi";
import { create as browserSyncCreate } from "browser-sync";
import pDebounce from "p-debounce";

import install from "./install.js";
import { types, lint } from "./build.js";
import { getFileExtension, htmlHotInject } from "./utils.js";

const dev = async (options = {}) => {
  if (options.lint) await lint(options.cwd, options.files, options);

  if (options.serve) {
    const bs = browserSyncCreate();

    if (options.lint || options.ts) {
      bs.use({
        plugin() {},
        hooks: {
          "client:js": /* js */ `window.___browserSync___.socket.on("console:log", (data) => { console.log(data); });`,
        },
      });

      bs.watch(options.files, async (event, file) => {
        if (event === "change") {
          const results = await lint(
            options.cwd,
            [join(options.cwd, file)],
            options,
          );
          if (results) {
            bs.sockets.emit("console:log", `[snowdev] ESLint Error:${results}`);
          }
        }
      });
    }

    const watchOptions = { ignoreInitial: true };

    const onDependencyChange = pDebounce(async () => {
      await install(options);
      if (options.hmr) bs.sockets.emit("reload");
    }, 500);

    // Install on package.json change
    bs.watch("package.json", watchOptions, async (event) => {
      if (event === "change") await onDependencyChange();
    });
    // Install on directory change in node_modules
    bs.watch("node_modules/!(.*){,/*/}", watchOptions, async (event) => {
      if (["addDir", "unlinkDir"].includes(event)) await onDependencyChange();
    });

    // HMR
    if (options.hmr) {
      bs.use({
        plugin() {},
        hooks: {
          "client:js": /* js */ `window.___browserSync___.socket.on("reload", () => { location.href = location.href });`,
        },
      });
      bs.watch(
        [
          options.files,
          `${options.rollup.output.dir}/**/*.js`,
          "examples/**/*.js",
          "**/*.{html,css}",
        ],
        watchOptions,
        async (event, file) => {
          if (event === "change") {
            if (getFileExtension(file) === ".js") {
              console.info(`File changed: "${file}"`);
              bs.sockets.emit("hmr", { data: file });
            } else {
              console.info(`File changed: "${file}". Reloading.`);
              bs.sockets.emit("reload");
            }
          }
        },
      );
    }

    if (options.http2) http2.createServer = http2.createSecureServer;

    bs.init(
      {
        server: {
          baseDir: options.cwd,
          middleware: async (req, res, next) => {
            if (options.crossOriginIsolation) {
              res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
              res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
            }

            // HMR
            if (options.hmr && getFileExtension(req.url) === ".html") {
              res.end(await htmlHotInject(options, req));
            } else {
              next();
            }
          },
        },
        httpModule: options.browsersync?.https && options.http2 && "node:http2",
        codeSync: !options.hmr,
        logPrefix: "snowdev:browser-sync",
        ...(options.browsersync || {}),
        ...(options.argv || {}),
      },
      async () => {
        try {
          await install(options);

          if (options.ts) {
            await types(options.cwd, null, options, (results) => {
              if (results) {
                bs.sockets.emit(
                  "console:log",
                  `[snowdev] TypeScript Error:\n${results}`,
                );
              }
            });
          }
        } catch (error) {
          console.error(error);
        }
      },
    );
  } else if (options.ts) {
    await types(options.cwd, null, options, true);
  }
};
dev.description = `Start dev server and install ESM dependencies.`;

export default dev;
