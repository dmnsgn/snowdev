import { dirname, resolve } from "node:path";

import { isScriptFile, pathExists } from "../utils.js";

const NEW_URL =
  /new\s+URL\(\s*(["'`])([^"'`$]+)\1\s*,\s*import\.meta\.url\s*\)/g;

/**
 * Emit scripts referenced by URL as chunks: they ship with the package (workers, injected clients).
 *
 * @returns {import("rolldown").Plugin}
 */
const importMetaUrl = () => ({
  name: "snowdev-import-meta-url",
  async transform(code, id) {
    for (const match of code.matchAll(NEW_URL)) {
      const file = resolve(dirname(id), match[2]);
      if (isScriptFile(file) && (await pathExists(file))) {
        this.emitFile({ type: "chunk", id: file });
      }
    }
  },
});

export default importMetaUrl;
