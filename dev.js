import { promises as fs, readFileSync } from "node:fs";
import { join } from "node:path";

import console from "console-ansi";
import { create as browserSyncCreate } from "browser-sync";
import * as cheerio from "cheerio";

import install from "./install.js";
import { types, lint } from "./build.js";
import { getFileExtension } from "./utils.js";

const HMR_HOOK = await fs.readFile(
  new URL("./hot.js", import.meta.url),
  "utf-8"
);

const dev = async (options = {}) => {
  if (options.serve) {
    const bs = browserSyncCreate();

    if (options.lint || options.ts) {
      if (options.lint) await lint(options.cwd, options.files, options);

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
            options
          );
          if (results) {
            bs.sockets.emit("console:log", `[snowdev] ESLint Error:${results}`);
          }
        }
      });
    }

    // Install on package.json change
    bs.watch("package.json", async (event) => {
      if (event === "change") {
        await install(options);
      }
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
          "web_modules/**/*.js",
          "examples/**/*.js",
          "**/*.{html,css}",
        ],
        { ignoreInitial: true },
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
        }
      );
    }

    bs.init(
      {
        server: {
          baseDir: options.cwd,
          middleware(req, res, next) {
            if (options.crossOriginIsolation) {
              res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
              res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
            }

            // HMR
            if (options.hmr && getFileExtension(req.url) === ".html") {
              const html = readFileSync(join(options.cwd, req.url), "utf8");
              const $ = cheerio.load(html);
              const esmsOptions = JSON.parse(
                $("script[type='esms-options']").text() || "{}"
              );
              esmsOptions.shimMode = true;
              $("head").append(
                `<script type="esms-options">${JSON.stringify(
                  esmsOptions
                )}</script><script type="module">${HMR_HOOK}</script>`
              );
              res.end($.html());
            } else {
              next();
            }
          },
        },
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
                  `[snowdev] TypeScript Error:\n${results}`
                );
              }
            });
          }
        } catch (error) {
          console.error(error);
        }
      }
    );
  } else if (options.ts) {
    await types(options.cwd, null, options, true);
  }
};
dev.description = `Start dev server and install ESM dependencies.`;

export default dev;
