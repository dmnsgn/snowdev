import { promises as fs } from "node:fs";
import { dirname, extname, join, parse, relative } from "node:path";
import { promisify } from "node:util";
import { exec as execCb } from "node:child_process";
import deepmerge from "deepmerge";

import console from "console-ansi";
import semver from "semver";
import ts from "typescript";
import { exports, legacy as legacyExport } from "resolve.exports";
import { sync as resolveSync } from "resolve";
import slash from "slash";
import picomatch from "picomatch";
import { glob } from "glob";
import * as cheerio from "cheerio";
import * as acorn from "acorn";
import * as acornWalk from "acorn-walk";
import * as aString from "astring";

import packageJson from "./package.json" with { type: "json" };

const FILES_GLOB = {
  javascript: ["**/*.js", "**/*.mjs"],
  typescript: ["**/*.ts", "**/*.mts"],
  react: ["**/*.jsx", "**/*.tsx"],
  commonjs: ["**/*.cjs", "**/*.cts"],
  assets: ["**/*.json", "**/*.css", "**/*.wasm"],
};
FILES_GLOB.typescriptAll = [...FILES_GLOB.typescript, "**/*.tsx", "**/*.cts"];

const RF_OPTIONS = { recursive: true, force: true };
const exec = promisify(execCb);

const readJson = async (path) =>
  (await import(path, { with: { type: "json" } })).default;

const writeJson = async (path, obj, { merge = false } = {}) =>
  await fs.writeFile(
    path,
    JSON.stringify(
      merge ? deepmerge(await readJson(path), obj) : obj,
      null,
      2,
    ).trim() + "\n",
    "utf-8",
  );

const { version: VERSION, name: NAME, dependencies } = packageJson;

const CORE_JS_SEMVER = semver.minVersion(dependencies["core-js"]);

const listFormatter = new Intl.ListFormat("en");

const secondsFormatter = new Intl.NumberFormat("en", {
  unit: "second",
  style: "unit",
  unitDisplay: "narrow",
});

const sortPaths = (
  paths,
  { separator = "/", prepend = ["index.js"], append = ["types.js"] } = {},
) =>
  paths
    .map((p) => p.split(separator))
    .sort((a, b) => {
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if (!(i in a)) return -1;
        if (!(i in b)) return 1;
        if (prepend.includes(a[i]) || prepend.includes(b[i])) {
          const aIndex = prepend.indexOf(a[i]);
          const bIndex = prepend.indexOf(b[i]);
          if (aIndex === -1) return 1;
          if (bIndex === -1) return -1;
          return Math.sign(aIndex - bIndex);
        }
        if (append.includes(a[i]) || append.includes(b[i])) {
          const aIndex = append.indexOf(a[i]);
          const bIndex = append.indexOf(b[i]);
          if (aIndex === -1) return -1;
          if (bIndex === -1) return 1;
          return Math.sign(aIndex - bIndex);
        }
        if (a[i].toUpperCase() > b[i].toUpperCase()) return 1;
        if (a[i].toUpperCase() < b[i].toUpperCase()) return -1;
        if (a.length < b.length) return -1;
        if (a.length > b.length) return 1;
      }
    })
    .map((p) => p.join(separator));

const execCommand = async (command, options) => {
  const { stdout, stderr } = await exec(command, options);
  if (stderr) throw new Error(stderr);
  return stdout.trim();
};

const checkUncommitedChanges = async (options) => {
  if (await execCommand(`git status --porcelain`, options)) {
    throw new Error("Commit your changes first");
  }
};

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
}

function isTypeScriptProject(cwd) {
  const configPath = ts.findConfigFile(cwd, ts.sys.fileExists, "tsconfig.json");
  if (!configPath) return false;
  return ts.readConfigFile(configPath, ts.sys.readFile).config?.compilerOptions
    ?.outDir;
}

const pathExists = (path) =>
  fs
    .access(path)
    .then(() => true)
    .catch(() => false);

const getFileExtension = (file) => parse(file).ext;

const htmlHotInject = async (options, req) => {
  const html = await fs.readFile(join(options.cwd, req.url), "utf8");
  const $ = cheerio.load(html);

  // Append the hot reload script
  $("head").append(/* html */ `<script type="module">
const baseURI = document.baseURI;
let intervalId = setInterval(() => {
  if (window.___browserSync___?.socket) {
    clearInterval(intervalId);

    console.info("[snowdev] Hot Reload Connected");

    window.___browserSync___.socket.on("hmr", (evt) => {
      const { data } = evt;
      if (data === "Connected") {
        console.info("Hot Reload " + data);
      } else {
        const url = new URL(data, baseURI).href;
        importShim.hotReload(url);
      }
    });
  }
}, 0);
</script>`);

  try {
    // Set shimMode by parsing json or window.esmsOptions options
    const esmsOptionsJSON = $("script[type='esms-options']");
    let hasOptions;
    if (esmsOptionsJSON.length) {
      $("script[type='esms-options']").text(
        JSON.stringify(
          Object.assign(JSON.parse(esmsOptionsJSON.text()), {
            hotReload: true,
          }),
        ),
      );
      hasOptions = true;
    } else {
      $("script").each((_, element) => {
        const ast = acorn.parse($(element).text(), {
          ecmaVersion: "latest",
          sourceType: ["module", "module-shim"].includes(element.attribs.type)
            ? "module"
            : "script",
        });
        acornWalk.full(ast, (node) => {
          if (node.type === "AssignmentExpression") {
            if (
              ["window", "globalThis"].includes(node.left?.object?.name) &&
              node.left?.property?.name === "esmsInitOptions" &&
              node.right?.type === "ObjectExpression"
            ) {
              node.right.properties ||= [];
              node.right.properties.push({
                type: "Property",
                method: false,
                shorthand: false,
                computed: false,
                key: { type: "Identifier", name: "hotReload" },
                value: { type: "Literal", value: "true", raw: '"true"' },
                kind: "init",
              });
              hasOptions = true;
            }
          }
        });
        if (hasOptions) $(element).text(aString.generate(ast));
      });
    }
    if (!hasOptions) {
      $("head").append(
        `<script type="esms-options">{ "hotReload": true }</script>`,
      );
    }
  } catch (error) {
    console.error(error);
  }

  return $.html();
};

const globOptions = { nodir: true };
const picomatchOptions = { capture: true, noglobstar: false };

const getWildcardEntries = async (cwd, key, value) => {
  const directoryName = dirname(value.split("*")[0]);
  const directoryFullPath = join(cwd, directoryName);

  if (!(await pathExists(directoryFullPath))) {
    throw new Error(`Directory "${directoryFullPath}" not found`);
  }

  const valueGlobStar = value.replace("*", "**");
  const files = await glob(valueGlobStar, { cwd, ...globOptions });

  const regex = picomatch.makeRe(valueGlobStar, picomatchOptions);

  return Object.fromEntries(
    files
      .map((name) => {
        const match = regex.exec(name);

        if (match?.[1]) {
          const [matchingPath, matchGroup] = match;
          const normalizedKey = key.replace("*", matchGroup);
          const normalizedFilePath = `./${matchingPath}`;
          return [normalizedKey, normalizedFilePath];
        }
      })
      .filter(Boolean),
  );
};

const resolveEntryPoint = async (cwd, key, value, out = {}) => {
  if (value.includes("*")) {
    try {
      Object.assign(out, await getWildcardEntries(cwd, key, value));
    } catch (error) {
      console.error(
        `Error resolving "${cwd}" export: { "${key}": "${value}" }\n`,
        error,
      );
    }
  } else {
    out[key] = value;
  }
  return out;
};

const resolveExports = async (options, src) => {
  try {
    const pkg = await readJson(join(src, "package.json"));

    // Resolves "module" then "main", defaulting to Node.js behaviour
    if (!pkg.exports) {
      let entry = legacyExport(pkg, { fields: options.resolve.mainFields });
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
      return { ".": entry };
    }

    // Resolve string exports
    if (typeof pkg.exports === "string") return { ".": pkg.exports };

    const resolvedExports = {};

    const exportOptions = {
      browser: options.resolve.browserField,
      conditions: options.resolve.conditions,
    };

    // Resolve array exports (no conditions here)
    if (Array.isArray(pkg.exports)) {
      for (const entryValue of exports(pkg, ".")) {
        await resolveEntryPoint(src, entryValue, entryValue, resolvedExports);
      }
      return resolvedExports;
    }

    // Resolve object of conditions
    if (!Object.keys(pkg.exports)?.[0]?.startsWith(".")) {
      const entryValue = exports(pkg, ".", exportOptions)?.[0];
      return await resolveEntryPoint(src, ".", entryValue);
    }

    // Resolve object of exports
    for (const key of Object.keys(pkg.exports)) {
      if (!key.startsWith(".")) continue;

      try {
        const entryValue = exports(pkg, key, exportOptions)?.[0];
        await resolveEntryPoint(src, key, entryValue, resolvedExports);
      } catch (error) {
        console.error(error);
      }
    }

    return resolvedExports;
  } catch (error) {
    console.error(error);
    return { ".": null };
  }
};

const pick = (obj, keys) =>
  Object.fromEntries(keys.map((key) => [key, obj[key]]));

const filterLeft = (a, b, compareFn) =>
  a.filter((valueA) => !b.some((valueB) => compareFn(valueA, valueB)));

const arrayDifference = (a, b, compareFn = (a, b) => a === b) =>
  filterLeft(a, b, compareFn).concat(filterLeft(b, a, compareFn));

const dotRelativeToBarePath = (p) =>
  p.lastIndexOf("./") !== -1 ? p.substring(p.lastIndexOf("./") + 2) : p;

const bareToDotRelativePath = (p) => `./${p}`;

export {
  FILES_GLOB,
  NAME,
  VERSION,
  CORE_JS_SEMVER,
  RF_OPTIONS,
  listFormatter,
  secondsFormatter,
  readJson,
  writeJson,
  sortPaths,
  exec,
  execCommand,
  checkUncommitedChanges,
  escapeRegExp,
  isTypeScriptProject,
  pathExists,
  getFileExtension,
  htmlHotInject,
  resolveExports,
  pick,
  arrayDifference,
  dotRelativeToBarePath,
  bareToDotRelativePath,
};
