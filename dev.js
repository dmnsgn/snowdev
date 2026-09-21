import { watch } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import http2 from "node:http2";

import console from "console-ansi";
import { create as browserSyncCreate } from "browser-sync";
import pDebounce from "p-debounce";

import install from "./install.js";
import { types, lint } from "./build.js";
import {
  getFileExtension,
  htmlHotInject,
  readJson,
  resolveFiles,
} from "./utils.js";

const dev = async (options = {}) => {
  if (options.lint) await lint(options.cwd, options.files, options);

  if (options.serve) {
    const bs = browserSyncCreate();

    const watchOptions = { ignoreInitial: true };

    let linkedFilesWatcher;
    const watchLinkedFiles = async ({ error, linkedFiles = [] }) => {
      if (error) return;

      await linkedFilesWatcher?.close();
      linkedFilesWatcher = linkedFiles.length
        ? bs.watch(linkedFiles, watchOptions, async (event) => {
            if (["change", "unlink"].includes(event)) {
              await onDependencyChange();
            }
          })
        : null;
    };

    const onDependencyChange = pDebounce(async () => {
      await watchLinkedFiles(await install(options));
      if (options.hmr) bs.sockets.emit("reload");
    }, 500);

    if (options.lint || options.ts) {
      bs.use({
        plugin() {},
        hooks: {
          "client:js": /* js */ `window.___browserSync___.socket.on("console:log", (data) => { console.log(data); });`,
        },
      });

      bs.watch(options.files, async (event, file) => {
        if (event !== "change") return;

        const results = await lint(
          options.cwd,
          [join(options.cwd, file)],
          options,
        );
        if (results) {
          bs.sockets.emit("console:log", `[snowdev] ESLint Error:${results}`);
        }
      });
    }

    // Install on manifest change
    bs.watch(
      ["package.json", "package-lock.json"],
      watchOptions,
      async (event, file) => {
        if (event !== "change") return;

        await onDependencyChange();

        if (file !== "package.json") return;

        const results = await lint(
          options.cwd,
          [join(options.cwd, file)],
          options,
        );
        if (results) {
          bs.sockets.emit("console:log", `[snowdev] ESLint Error:${results}`);
        }
      },
    );

    // Options are resolved once at startup (server options can't hot-apply)
    // so a config change only gets a hint
    if (options.configFile) {
      const readConfig = async () => {
        if (basename(options.configFile) !== "package.json") return null;
        try {
          return JSON.stringify((await readJson(options.configFile)).snowdev);
        } catch {
          // Mid-write or invalid JSON: package.json lint will report it
          return null;
        }
      };
      let config = await readConfig();

      bs.watch(options.configFile, watchOptions, async (event) => {
        if (event !== "change") return;

        // package.json changes for many other reasons: only hint on the key
        if (config !== null) {
          const current = await readConfig();
          if (current === null || current === config) return;
          config = current;
        }

        console.warn(
          `Config changed: "${relative(options.cwd, options.configFile)}". Restart to apply.`,
        );
      });
    }

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
        ...options.browsersync,
        ...options.argv,
      },
      async () => {
        try {
          await watchLinkedFiles(await install(options));

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
  } else {
    if (options.ts) {
      await types(options.cwd, null, options, true);
    } else {
      for (const file of await resolveFiles(options.cwd, options)) {
        (async () => {
          const watcher = watch(file);
          for await (const event of watcher) {
            if (event.eventType === "change") {
              await lint(options.cwd, [file], options);
            }
          }
        })();
      }
    }
  }
};
dev.description = `Start dev server and install ESM dependencies.`;

export default dev;
