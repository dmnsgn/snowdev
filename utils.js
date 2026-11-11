/* eslint-disable unicorn/prefer-await */
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { findPackageJSON } from "node:module";
import { extname, isAbsolute, join, parse, relative } from "node:path";
import { promisify, styleText } from "node:util";
import { exec as execCb } from "node:child_process";

import deepmerge from "deepmerge";

import { createFilter } from "@rollup/pluginutils";
import { getConsole } from "console-ansi";
import semver from "semver";
import * as acorn from "acorn";
import * as acornWalk from "acorn-walk";
import * as aString from "astring";

import packageJson from "./package.json" with { type: "json" };

const FILES_GLOB = {
  javascript: ["**/*.js", "**/*.mjs"],
  typescript: ["**/*.ts", "**/*.mts"],
  declarations: ["**/*.d.ts", "**/*.d.mts", "**/*.d.cts"],
  react: ["**/*.jsx", "**/*.tsx"],
  commonjs: ["**/*.cjs", "**/*.cts"],
  esm: ["**/*.mjs", "**/*.mts"],
  html: ["**/*.html"],
  css: ["**/*.css"],
  markdown: ["**/*.md"],
  config: ["**/*.config.{js,mjs,cjs,ts,mts,cts}"],
};
FILES_GLOB.typescriptAll = [...FILES_GLOB.typescript, "**/*.tsx", "**/*.cts"];
FILES_GLOB.assets = [...FILES_GLOB.css, "**/*.json", "**/*.wasm"];
FILES_GLOB.scripts = [
  ...FILES_GLOB.javascript,
  ...FILES_GLOB.typescript,
  ...FILES_GLOB.react,
  ...FILES_GLOB.commonjs,
];

const isScriptFile = createFilter(FILES_GLOB.scripts, FILES_GLOB.declarations, {
  resolve: false,
});
const isCommonJsFile = createFilter(FILES_GLOB.commonjs, null, {
  resolve: false,
});

// Options replace defaults: concatenating can't reorder or remove values
const overwriteArrays = (_, source) => source;

const RF_OPTIONS = { recursive: true, force: true };
const exec = promisify(execCb);

const readJson = async (path) => JSON.parse(await fs.readFile(path, "utf8"));

const writeJson = async (path, obj, { merge = false } = {}) =>
  await fs.writeFile(
    path,
    JSON.stringify(
      merge ? deepmerge(await readJson(path), obj) : obj,
      null,
      2,
    ).trim() + "\n",
    "utf8",
  );

const { version: VERSION, name: NAME, dependencies } = packageJson;

const console = getConsole({ prefix: `[${NAME}]` });

const CORE_JS_SEMVER = semver.minVersion(dependencies["core-js"]);

const listFormatter = new Intl.ListFormat("en");
const formatFileList = (files) => files.map((file) => `\n- ${file}`).join("");
const formatBold = (text) => styleText("bold", text);

const secondsFormatter = new Intl.NumberFormat("en", {
  unit: "second",
  style: "unit",
  unitDisplay: "narrow",
});

const formatSize = (bytes) => `${(bytes / 1000).toFixed(2)} kB`;

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
          if (aIndex === -1) return 1;
          const bIndex = prepend.indexOf(b[i]);
          return bIndex === -1 ? -1 : Math.sign(aIndex - bIndex);
        }
        if (append.includes(a[i]) || append.includes(b[i])) {
          const aIndex = append.indexOf(a[i]);
          if (aIndex === -1) return -1;
          const bIndex = append.indexOf(b[i]);
          return bIndex === -1 ? 1 : Math.sign(aIndex - bIndex);
        }
        if (a[i].toUpperCase() > b[i].toUpperCase()) return 1;
        if (a[i].toUpperCase() < b[i].toUpperCase()) return -1;
        if (a.length < b.length) return -1;
        if (a.length > b.length) return 1;
      }
    })
    .map((p) => p.join(separator));

const resolveFiles = async (cwd, options) =>
  sortPaths(
    (
      await Array.fromAsync(
        fs.glob(options.files, { cwd, exclude: options.ignore }),
      )
    ).map((file) => join(cwd, file)),
  );

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

const getTaskLabel = (description, cwd, files) =>
  files?.length === 1
    ? `${description}: "${relative(cwd, files[0])}"`
    : description;

const timers = new Set();
const timed = (fn, label) => {
  const wrapped = async (...args) => {
    const name =
      typeof label === "function"
        ? label(...args)
        : (label ?? getTaskLabel(wrapped.description, ...args));
    let key = name;
    let count = 1;
    while (timers.has(key)) key = `${name} (${++count})`;
    timers.add(key);
    console.time(key);
    try {
      return await fn(...args);
    } finally {
      console.timeEnd(key);
      timers.delete(key);
    }
  };
  return wrapped;
};

// TODO: replace with native Promise.allKeyed when available in Node.js
// https://github.com/tc39/proposal-await-dictionary
const allKeyed = async (promises) =>
  Object.fromEntries(
    await Promise.all(
      Object.entries(promises).map(async ([key, value]) => [key, await value]),
    ),
  );

function escapeRegExp(string) {
  return string.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`); // $& means the whole matched string
}

const readTsConfig = async (cwd, fallback) => {
  const { default: ts } = await import("typescript");
  const configPath = ts.findConfigFile(cwd, ts.sys.fileExists, "tsconfig.json");
  const config = configPath
    ? ts.readConfigFile(configPath, ts.sys.readFile).config
    : fallback;
  return { ts, configPath, config };
};

async function isTypeScriptProject(cwd) {
  const { configPath, config } = await readTsConfig(cwd);
  return configPath ? config?.compilerOptions?.outDir : false;
}

const pathExists = (path) =>
  fs
    .access(path)
    .then(() => true)
    .catch(() => false);

const realpathSafe = (path) => fs.realpath(path).catch(() => path);

// Bundlers suffix ids with a query for virtual variants of a module
const stripQuery = (id) => id.split("?", 1)[0];

const isInside = (directory, file) => {
  const path = relative(directory, file);
  return path && !path.startsWith("..") && !isAbsolute(path);
};

// Missing files map to null so they still take part in comparisons
const statFiles = async (files) =>
  Object.fromEntries(
    await Promise.all(
      files.map(async (file) => {
        try {
          const { mtimeMs, size } = await fs.stat(file);
          return [file, { mtimeMs, size }];
        } catch {
          return [file, null];
        }
      }),
    ),
  );

const compareStats = (a, b) => a?.mtimeMs === b?.mtimeMs && a?.size === b?.size;

const getFileExtension = (file) => parse(file).ext;

const stripExtension = (file) =>
  file.slice(0, -extname(file).length || undefined);

const htmlHotInject = async (html) => {
  const cheerio = await import("cheerio");
  const $ = cheerio.load(html);

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
          if (!(
            node.type === "AssignmentExpression" &&
            ["window", "globalThis"].includes(node.left?.object?.name) &&
            node.left?.property?.name === "esmsInitOptions" &&
            node.right?.type === "ObjectExpression"
          )) {
            return;
          }

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

const getExportFilters = ({ cwd, resolve: { include, exclude, copy } }) => ({
  filter: createFilter(include, exclude, { resolve: cwd }),
  copyFilter: createFilter(copy, exclude, { resolve: cwd }),
});

const pick = (obj, keys) =>
  Object.fromEntries(keys.map((key) => [key, obj[key]]));

// RegExp and functions would otherwise serialize to {} / be dropped
const hashObject = (obj) =>
  createHash("sha256")
    .update(
      JSON.stringify(obj, (key, value) =>
        value instanceof RegExp || typeof value === "function"
          ? value.toString()
          : value,
      ),
    )
    .digest("hex");

const filterLeft = (a, b, compareFn) =>
  a.filter((valueA) => b.every((valueB) => !compareFn(valueA, valueB)));

const arrayDifference = (a, b, compareFn = (a, b) => a === b) =>
  filterLeft(a, b, compareFn).concat(filterLeft(b, a, compareFn));

const dotRelativeToBarePath = (p) =>
  p.includes("./") ? p.slice(Math.max(0, p.lastIndexOf("./") + 2)) : p;

const bareToDotRelativePath = (p) => `./${p}`;

// Bare specifiers name packages: not relative, absolute, subpath import, virtual or URL
const isBareSpecifier = (id) => !/^([./#\0]|[a-z]+:)/i.test(id);

const getPackageName = (specifier) =>
  specifier
    .split("/")
    .slice(0, specifier.startsWith("@") ? 2 : 1)
    .join("/");

// Declared to satisfy an imported package's peer requirement
const getPeerDependencies = async (name, cwd) => {
  try {
    const { peerDependencies } = await readJson(
      findPackageJSON(name, join(cwd, "package.json")),
    );
    return Object.keys(peerDependencies ?? {});
  } catch {
    // Not installed: reported by the package manager instead
    return [];
  }
};

export {
  console,
  FILES_GLOB,
  isScriptFile,
  isCommonJsFile,
  NAME,
  VERSION,
  CORE_JS_SEMVER,
  RF_OPTIONS,
  listFormatter,
  formatFileList,
  formatBold,
  secondsFormatter,
  formatSize,
  readJson,
  writeJson,
  sortPaths,
  resolveFiles,
  exec,
  execCommand,
  checkUncommitedChanges,
  timed,
  allKeyed,
  escapeRegExp,
  readTsConfig,
  isTypeScriptProject,
  pathExists,
  realpathSafe,
  isInside,
  stripQuery,
  overwriteArrays,
  getExportFilters,
  statFiles,
  compareStats,
  getFileExtension,
  stripExtension,
  htmlHotInject,
  pick,
  hashObject,
  arrayDifference,
  dotRelativeToBarePath,
  bareToDotRelativePath,
  isBareSpecifier,
  getPackageName,
  getPeerDependencies,
};
