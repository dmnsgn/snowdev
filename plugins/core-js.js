import { createHash } from "node:crypto";
import { promises as fs, readFileSync } from "node:fs";
import { findPackageJSON } from "node:module";
import { dirname, join } from "node:path";

import { parseAsync, transformFromAstAsync } from "@babel/core";
import { createFilter } from "@rollup/pluginutils";
import polyfillCoreJs from "babel-plugin-polyfill-corejs3";
import { MagicString } from "magic-string";

import {
  console,
  FILES_GLOB,
  isCommonJsFile,
  isScriptFile,
  listFormatter,
  stripQuery,
} from "../utils.js";

const CORE_JS_SOURCE = /^core-js(?:\/|$)/;
const CORE_JS_MODULE = /^core-js\/modules\/(.+)\.js$/;
const COMMONJS_KEYWORDS = /\b(?:require|module|exports)\b/;

const isTypeScriptFile = createFilter(FILES_GLOB.typescriptAll, null, {
  resolve: false,
});
const isReactFile = createFilter(FILES_GLOB.react, null, { resolve: false });
const isEsmFile = createFilter(FILES_GLOB.esm, null, { resolve: false });

// Babel can't enable both: "jsx" breaks `<T>value` casts in ".ts" files
const getParserPlugins = (filename) => {
  if (!isTypeScriptFile(filename)) return ["jsx"];
  return isReactFile(filename) ? ["typescript", "jsx"] : ["typescript"];
};

// Scripts without CommonJS keywords are ES modules without imports or exports:
// a require() would reach the output unconverted
const isCommonJs = (filename, code, sourceType) =>
  isCommonJsFile(filename) ||
  (sourceType === "script" &&
    !isEsmFile(filename) &&
    COMMONJS_KEYWORDS.test(code));

const getSource = (node) =>
  node.type === "ImportDeclaration"
    ? node.source.value
    : node.expression?.callee?.name === "require" &&
      node.expression.arguments[0]?.value;

// Module names of the polyfills Babel injected, read from the AST: generating code is slow on large files and breaks their source maps
const getInjectedPolyfills = (program) =>
  program.body.flatMap((node) => {
    const name = CORE_JS_MODULE.exec(getSource(node))?.[1];
    return name ? [name] : [];
  });

// Ranges of the core-js imports Babel replaced: entry points with "entry-global"
const getReplacedImports = (program, transformedProgram) => {
  const kept = new Set(transformedProgram.body.map(({ start }) => start));
  return program.body
    .filter(
      (node) => CORE_JS_SOURCE.test(getSource(node)) && !kept.has(node.start),
    )
    .map(({ start, end }) => [start, end]);
};

// The project's core-js, or snowdev's own
const findCoreJs = (cwd) => {
  try {
    return findPackageJSON("core-js", join(cwd, "package.json"));
  } catch {
    return findPackageJSON("core-js", import.meta.url);
  }
};

// TODO: core-js v4
// const coreJs = async ({ method, targets, exclude }) =>
//   (await import("@core-js/unplugin/rolldown")).default({ // "@core-js/unplugin/rollup"
//     method,
//     targets,
//     exclude,
//   });

/**
 * Import the core-js modules each file uses and its targets lack.
 *
 * @param {object} options
 * @param {string} options.cwd
 * @param {"usage-global" | "entry-global"} [options.method="usage-global"]
 *   Import the polyfills each file uses, or expand core-js entry imports to the
 *   polyfills the targets lack.
 * @param {string | string[]} options.targets
 * @param {string[]} [options.exclude] Core-js modules or features never
 *   imported.
 * @param {string | false} [options.cacheFolder]
 * @param {boolean} [options.debug] List the polyfills of each bundle.
 * @returns {import("rolldown").Plugin}
 */
const coreJs = ({
  cwd,
  method = "usage-global",
  targets,
  exclude = [],
  cacheFolder,
  debug,
}) => {
  const packageJsonPath = findCoreJs(cwd);
  const { version } = JSON.parse(readFileSync(packageJsonPath, "utf8"));

  const parseOptions = {
    babelrc: false,
    configFile: false,
    // CommonJS modules get require() calls
    sourceType: "unambiguous",
  };
  const babelOptions = {
    ...parseOptions,
    inputSourceMap: false,
    code: false,
    ast: true,
    targets,
    browserslistConfigFile: false,
    plugins: [[polyfillCoreJs, { method, version, exclude }]],
  };

  const scan = async (code, filename) => {
    const ast = await parseAsync(code, {
      ...parseOptions,
      parserOpts: { plugins: getParserPlugins(filename) },
      filename,
    });
    const { ast: transformed } = await transformFromAstAsync(ast, code, {
      ...babelOptions,
      filename,
    });
    return {
      polyfills: getInjectedPolyfills(transformed.program),
      replaced: getReplacedImports(ast.program, transformed.program),
      sourceType: transformed.program.sourceType,
    };
  };

  // Babel parses ~1MB/s: large prebuilt files would cost the same scan on every build
  const cachedScan = async (code, filename) => {
    const hash = createHash("sha256")
      .update(
        JSON.stringify([
          version,
          method,
          targets,
          exclude,
          getParserPlugins(filename),
        ]),
      )
      .update(code)
      .digest("hex");
    const file = join(cacheFolder, `${hash}.json`);
    try {
      return JSON.parse(await fs.readFile(file, "utf8"));
    } catch {
      const result = await scan(code, filename);
      await fs.mkdir(cacheFolder, { recursive: true });
      await fs.writeFile(file, JSON.stringify(result));
      return result;
    }
  };

  // Resolved from the project: importers outside of it would find another core-js, or none
  const getSpecifier = (name) =>
    JSON.stringify(join(dirname(packageJsonPath), "modules", `${name}.js`));

  // Kept across watch rebuilds: unchanged modules aren't transformed again
  const modulePolyfills = new Map();

  return {
    name: "core-js",
    transform: {
      // Virtual modules and core-js itself excluded
      filter: { id: { exclude: [/^\0/, /[\\/]core-js[\\/]/] } },
      async handler(code, id) {
        // Ids can have a query: globs can't match them
        const filename = stripQuery(id);
        if (!isScriptFile(filename)) return null;

        const { polyfills, replaced, sourceType } = await (
          cacheFolder ? cachedScan : scan
        )(code, filename);
        modulePolyfills.set(id, polyfills);
        if (!polyfills.length && !replaced.length) return null;

        const isModule = !isCommonJs(filename, code, sourceType);
        const statements = polyfills
          .map(getSpecifier)
          .map((specifier) =>
            isModule ? `import ${specifier};` : `require(${specifier});`,
          )
          .join("");

        // Hoisted imports run before the module body: appending them keeps every position, and the existing source map
        if (isModule && !replaced.length) {
          return { code: `${code}\n${statements}`, map: null };
        }

        const magicString = new MagicString(code);
        for (const [start, end] of replaced) magicString.remove(start, end);
        if (isModule) magicString.append(`\n${statements}`);
        else magicString.prepend(`${statements}\n`);
        return {
          code: magicString.toString(),
          map: magicString.generateMap({ hires: "boundary" }),
        };
      },
    },
    buildEnd() {
      if (!debug) return;
      const names = Array.from(
        new Set(
          Array.from(this.getModuleIds()).flatMap(
            (id) => modulePolyfills.get(id) ?? [],
          ),
        ),
      ).sort((a, b) => a.localeCompare(b));
      console.info(
        `core-js polyfills (${names.length}): ${listFormatter.format(names)}`,
      );
    },
  };
};

export default coreJs;
