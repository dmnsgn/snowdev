import { isCommonJsFile, stripQuery } from "../utils.js";

// As written by @rollup/plugin-inject
const INJECTED_IMPORT = /^import \{ (\S+) as (\S+) \} from '(.+)';$/gm;

/**
 * Rewrite imports injected in CommonJS files to `require()` calls.
 *
 * @returns {import("rolldown").Plugin}
 */
const requireInjectedImports = () => ({
  name: "require-injected-imports",
  transform(code, id) {
    // rolldown parses ".cjs" files as scripts: an import is a syntax error
    return isCommonJsFile(stripQuery(id))
      ? {
          code: code.replaceAll(
            INJECTED_IMPORT,
            "const { $1: $2 } = require('$3');",
          ),
          map: null,
        }
      : null;
  },
});

export default requireInjectedImports;
