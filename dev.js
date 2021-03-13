import { create as browserSyncCreate } from "browser-sync";

import install from "./install.js";
import { types } from "./build.js";

const dev = (options = {}) => {
  browserSyncCreate().init(
    {
      server: { baseDir: options.cwd },
      ...(options.browserSync || {}),
      ...(options.argv || {}),
    },
    async () => {
      await install(options);

      if (options.ts) {
        await types(options.cwd, null, options, true);
      }
    }
  );
};
dev.description = `Start dev server and install ESM dependencies.`;

export default dev;
