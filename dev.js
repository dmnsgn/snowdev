import { join } from "path";
import { create as browserSyncCreate } from "browser-sync";

import install from "./install.js";
import { types, lint } from "./build.js";

const dev = async (options = {}) => {
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
            options
          );
          if (results) {
            bs.sockets.emit("console:log", `[snowdev] ESLint Error:${results}`);
          }
        }
      });
    }

    bs.init(
      {
        server: { baseDir: options.cwd },
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
