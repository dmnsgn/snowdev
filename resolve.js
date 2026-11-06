import { promises as fs } from "node:fs";
import { dirname, extname, join, relative } from "node:path";

import { exports, legacy as legacyExport } from "resolve.exports";
import { sync as resolveSync } from "resolve";
import slash from "slash";

import {
  bareToDotRelativePath,
  console,
  isInside,
  pathExists,
  readJson,
  realpathSafe,
} from "./utils.js";

// Set per import by resolvers. Forwarding "import" would apply it to require()
const IMPORT_CONDITIONS = new Set(["import", "require", "default"]);

const getConditions = ({ NODE_ENV, resolve }) => [
  ...resolve.conditions.filter(
    (condition) => !IMPORT_CONDITIONS.has(condition),
  ),
  resolve.browserField ? "browser" : "node",
  NODE_ENV === "production" ? "production" : "development",
];

// `browser` goes before `main`, not first: a package with an ES `module` entry keeps it.
// Set it in `resolve.mainFields` to change its position.
const getMainFields = ({ resolve: { browserField, mainFields } }) =>
  browserField && !mainFields.includes("browser")
    ? mainFields.flatMap((field) =>
        field === "main" ? ["browser", field] : field,
      )
    : mainFields;

const getRequireMainFields = ({ resolve }) =>
  getMainFields({
    resolve: { ...resolve, mainFields: resolve.requireMainFields },
  });

// Real paths: a symlink can leave the package too.
// Joined to the real folder as a missing file (unbuilt export) isn't resolved.
const isInsidePackage = async (src, target) => {
  const root = await realpathSafe(src);
  return isInside(root, await realpathSafe(join(root, target)));
};

const isObject = (value) =>
  Object.prototype.toString.call(value) === "[object Object]";

// A `false` target ignores the file, which bundlers handle
const remapBrowserEntry = (browser, entry) => {
  const target = browser[entry] ?? browser[entry.slice(2)];
  return typeof target === "string"
    ? bareToDotRelativePath(target.replace(/^\.\//, ""))
    : entry;
};

// Resolves fields in order, defaulting to Node.js behaviour
const resolveLegacyEntry = async (pkg, src, fields) => {
  // Only a string names an entry: an object remaps files
  const browserMap =
    fields.includes("browser") && isObject(pkg.browser) ? pkg.browser : null;

  let entry = legacyExport(pkg, {
    fields: browserMap ? fields.filter((field) => field !== "browser") : fields,
  });
  entry ??= (await pathExists(join(src, "index.js"))) && "./index.js";
  if (entry && ![".js", ".mjs", ".cjs", ".node"].includes(extname(entry))) {
    try {
      entry = bareToDotRelativePath(
        slash(relative(src, resolveSync(entry, { basedir: src }))),
      );
    } catch (error) {
      console.error(error);
    }
  }
  return entry && browserMap ? remapBrowserEntry(browserMap, entry) : entry;
};

// Strings, arrays and conditions export "." only. Folder mappings ("./lib/") were removed from Node.js
const getExportKeys = (exportsField) => {
  const keys = Object.keys(exportsField);
  return keys[0]?.startsWith(".")
    ? keys.filter((key) => key.startsWith(".") && !key.endsWith("/"))
    : ["."];
};

// A pattern `*` matches across "/", which a glob `*` doesn't
const getPatternSubpaths = async (src, key, target) => {
  if (!target?.includes("*")) return [];

  const [prefix, ...suffixes] = target.split("*");
  // Every `*` is replaced by the same subpath
  const suffix = suffixes.map(RegExp.escape).join(String.raw`\1`);
  const matcher = new RegExp(`^${RegExp.escape(prefix)}(.+)${suffix}$`);
  const directory = dirname(`${prefix}_`);
  if (directory !== "." && !(await isInsidePackage(src, directory))) return [];

  const dirents = await Array.fromAsync(
    fs.glob("**", {
      cwd: join(src, directory),
      exclude: ({ name }) => name === "node_modules",
      withFileTypes: true,
    }),
  );

  return dirents
    .filter((dirent) => !dirent.isDirectory())
    .map((dirent) =>
      bareToDotRelativePath(
        slash(relative(src, join(dirent.parentPath, dirent.name))),
      ),
    )
    .map((file) => matcher.exec(file)?.[1])
    .filter(Boolean)
    .map((subpath) => key.replace("*", () => subpath));
};

const listExports = async (options, src) => {
  try {
    const pkg = await readJson(join(src, "package.json"));

    if (!pkg.exports) {
      return {
        ".": await resolveLegacyEntry(pkg, src, getMainFields(options)),
      };
    }

    const exportOptions = {
      browser: options.resolve.browserField,
      conditions: getConditions(options),
    };

    const resolveTarget = (key) => {
      try {
        return exports(pkg, key, exportOptions)?.[0];
      } catch {
        // Blocked by a null target or nothing for these conditions
      }
    };

    const resolvedExports = {};

    for (const key of getExportKeys(pkg.exports)) {
      const keyTarget = resolveTarget(key);
      const subpaths = key.includes("*")
        ? await getPatternSubpaths(src, key, keyTarget)
        : [key];

      // A null target is an explicit exclusion
      if (!keyTarget && pkg.exports[key] !== null) {
        console.warn(`Unresolved export: "${key}" in "${src}"`);
      } else if (keyTarget && !subpaths.length) {
        console.warn(`No file for export pattern: "${key}" in "${src}"`);
      }

      // Expanded subpaths are resolved again: exact keys and null targets take precedence
      for (const subpath of subpaths) {
        const target = resolveTarget(subpath);
        if (target) resolvedExports[subpath] = target;
      }
    }

    return resolvedExports;
  } catch (error) {
    console.error(error);
    return { ".": null };
  }
};

// Package fields are untrusted: a target can't read files outside of its package.
// Only covers what is resolved here: bundlers still follow relative imports in a
// package code and fields of transitive packages. Rejecting these would need a `load`
// hook allowing `node_modules` and the real path of every dependency.
const resolveExports = async (options, src) => {
  const entries = await Promise.all(
    Object.entries(await listExports(options, src)).map(
      async ([subpath, target]) => {
        if (!target || (await isInsidePackage(src, target))) {
          return [subpath, target];
        }
        console.error(
          `Rejected export outside of package: "${subpath}" "${target}" in "${src}"`,
        );
      },
    ),
  );
  return Object.fromEntries(entries.filter(Boolean));
};

export {
  getConditions,
  getMainFields,
  getRequireMainFields,
  isInsidePackage,
  resolveLegacyEntry,
  resolveExports,
};
