import { promises as fs } from "node:fs";
import { join, parse } from "node:path";
import { promisify } from "node:util";
import { exec as execCb } from "node:child_process";

import ncpCb from "ncp";
import ts from "typescript";
import * as cheerio from "cheerio";
import * as acorn from "acorn";
import * as acornWalk from "acorn-walk";
import * as aString from "astring";

const exec = promisify(execCb);
const ncp = promisify(ncpCb);

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

const HMR_HOOK = await fs.readFile(
  new URL("./hot.js", import.meta.url),
  "utf-8"
);

const htmlHotInject = async (options, req) => {
  const html = await fs.readFile(join(options.cwd, req.url), "utf8");
  const $ = cheerio.load(html);

  // Append the hot script
  $("head").append(`<script type="module">${HMR_HOOK}</script>`);

  try {
    // Set shimMode by parsing json or window.esmsOptions options
    const esmsOptionsJSON = $("script[type='esms-options']");
    let hasOptions;
    if (esmsOptionsJSON.length) {
      $("script[type='esms-options']").text(
        JSON.stringify(
          Object.assign(JSON.parse(esmsOptionsJSON.text()), { shimMode: true })
        )
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
                key: { type: "Identifier", name: "shimMode" },
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
        `<script type="esms-options">{ "shimMode": true }</script>`
      );
    }
  } catch (error) {
    console.error(error);
  }

  return $.html();
};

export {
  exec,
  ncp,
  execCommand,
  checkUncommitedChanges,
  escapeRegExp,
  isTypeScriptProject,
  pathExists,
  getFileExtension,
  htmlHotInject,
};
