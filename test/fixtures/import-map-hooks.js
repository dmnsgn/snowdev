import { readFileSync, realpathSync } from "node:fs";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";

const { IMPORT_MAP_PATH } = process.env;
const { imports } = JSON.parse(readFileSync(IMPORT_MAP_PATH, "utf8"));
// Short-circuited URLs skip the realpath of Node.js resolution, loading a file
// twice if the temporary folder is a symlink, as on macOS
const baseUrl = pathToFileURL(realpathSync(IMPORT_MAP_PATH));

registerHooks({
  resolve(specifier, context, nextResolve) {
    return specifier in imports
      ? { url: new URL(imports[specifier], baseUrl).href, shortCircuit: true }
      : nextResolve(specifier, context);
  },
});
