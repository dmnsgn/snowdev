import { findPackageJSON } from "node:module";
import { dirname, join } from "node:path";

import { isInsidePackage, resolveLegacyEntry } from "../resolve.js";
import {
  getPackageName,
  isBareSpecifier,
  pathExists,
  readJson,
  realpathSafe,
  stripQuery,
} from "../utils.js";

const getRedirect = async (path, { mainFields, requireMainFields }) => {
  const src = dirname(path);
  const pkg = await readJson(path);
  if (pkg.exports) return null;

  const entry = await resolveLegacyEntry(pkg, src, mainFields);
  const requireEntry = await resolveLegacyEntry(pkg, src, requireMainFields);
  if (!entry || !requireEntry) return null;

  const to = join(src, requireEntry);
  const isValid =
    (await pathExists(to)) && (await isInsidePackage(src, requireEntry));
  return isValid ? { from: join(src, entry), to } : null;
};

/**
 * Resolve `require()` of a package to its `requireMainFields` entry instead of
 * its `mainFields` one.
 *
 * @param {object} options
 * @param {string[]} options.mainFields
 * @param {string[]} options.requireMainFields
 * @returns {import("rolldown").Plugin}
 */
const requireMain = (options) => {
  const redirects = new Map();

  const findRedirect = async (source, importer) => {
    try {
      const path = await realpathSafe(findPackageJSON(source, importer));
      if (!redirects.has(path)) {
        redirects.set(path, getRedirect(path, options));
      }
      return await redirects.get(path);
    } catch {
      // Not reachable by Node: bundler specific resolution or virtual module
      return null;
    }
  };

  return {
    name: "require-main",
    async resolveId(source, importer, resolveOptions) {
      // rolldown sets kind, @rollup/plugin-commonjs sets custom
      const isRequire =
        resolveOptions.kind === "require-call" ||
        resolveOptions.custom?.["node-resolve"]?.isRequire;
      if (
        !isRequire ||
        !importer ||
        !isBareSpecifier(source) ||
        getPackageName(source) !== source
      ) {
        return null;
      }

      // Keep what other plugins resolved: polyfills, aliases and externals
      const resolved = await this.resolve(source, importer, {
        ...resolveOptions,
        skipSelf: true,
      });
      if (!resolved || resolved.external) return null;

      const redirect = await findRedirect(source, stripQuery(importer));
      return redirect?.from === resolved.id ? redirect.to : null;
    },
  };
};

export default requireMain;
