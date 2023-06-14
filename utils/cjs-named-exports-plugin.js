import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import * as cjsModuleLexer from "cjs-module-lexer";
import isValidIdentifier from "is-valid-identifier";

await cjsModuleLexer.init();

// Based on:
// - https://github.com/FredKSchott/snowpack/blob/main/esinstall/src/rollup-plugins/rollup-plugin-wrap-install-targets.ts
// - https://github.com/jspm/rollup-plugin-jspm/blob/main/jspm-rollup.js
const PLUGIN_NAME = "cjs-named-exports";
const SUFFIX = `?${PLUGIN_NAME}`;

const isValidNamedExport = (name) =>
  name !== "default" && name !== "__esModule" && isValidIdentifier(name);

const getCjsNamedExports = (filename, visited = new Set()) => {
  if (visited.has(filename)) return [];

  const isMainEntrypoint = visited.size === 0;
  visited.add(filename);

  try {
    const { exports, reexports } = cjsModuleLexer.parse(
      readFileSync(filename, "utf8")
    );

    const resolvedReexports = reexports.length
      ? reexports
          .map((reexport) =>
            getCjsNamedExports(
              createRequire(filename).resolve(reexport),
              visited
            )
          )
          .flat(Infinity)
          .filter(Boolean)
      : [];

    const resolvedExports = Array.from(
      new Set([...exports, ...resolvedReexports])
    ).filter(isValidNamedExport);

    return isMainEntrypoint && resolvedExports.length === 0
      ? null
      : resolvedExports;
  } catch (error) {
    console.warn(`${PLUGIN_NAME} ${filename}: ${error.message}`);
  }
};

/** @type {import("rollup").PluginImpl} */
export default () => ({
  name: PLUGIN_NAME,
  async resolveId(source, importer, options) {
    if (options.isEntry) {
      const resolution = await this.resolve(source, importer, {
        skipSelf: true,
        ...options,
      });
      if (!resolution || resolution.external) return resolution;

      await this.load(resolution);

      return `${resolution.id}${SUFFIX}`;
    }
    return null;
  },
  load(id) {
    if (id.endsWith(SUFFIX)) {
      const entryId = id.slice(0, -SUFFIX.length);

      const { hasDefaultExport, meta } = this.getModuleInfo(entryId);
      const file = JSON.stringify(entryId);
      let code = `export * from ${file};`;
      if (hasDefaultExport) code += `export { default } from ${file};`;

      if (meta?.commonjs?.isCommonJS) {
        const uniqueNamedExports = getCjsNamedExports(entryId) || [];
        if (uniqueNamedExports.length) {
          code += `export {${uniqueNamedExports.join(",")}} from ${file};`;
        }
      }
      return code;
    }
    return null;
  },
});
