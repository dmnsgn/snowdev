import eslintJs from "@eslint/js";
import { defineConfig } from "eslint/config";
import globals from "globals";
import babelParser from "@babel/eslint-parser";
import tseslint from "typescript-eslint";
import eslintPluginUnicorn from "eslint-plugin-unicorn";
import eslintPluginJsdoc from "eslint-plugin-jsdoc";
import eslintPluginHtml from "eslint-plugin-html";
import eslintPluginMarkdown from "@eslint/markdown";
import eslintNodeTest from "eslint-node-test";

import { FILES_GLOB } from "./utils.js";

export default defineConfig([
  eslintJs.configs.recommended,
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: FILES_GLOB.typescriptAll,
  })),
  {
    files: FILES_GLOB.javascript,
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        requireConfigFile: false,
        babelOptions: {}, // Overwritten with options.babel on lint
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.worker,
      },
    },
  },
  {
    files: FILES_GLOB.javascript,
    extends: [eslintPluginJsdoc.configs["flat/recommended-typescript-flavor"]],
  },
  {
    files: FILES_GLOB.typescript,
    extends: [eslintPluginJsdoc.configs["flat/recommended-typescript"]],
    rules: {
      "jsdoc/require-returns": 0,
      "jsdoc/require-param": 0,
      "jsdoc/require-yields": 0,
    },
  },
  {
    files: [...FILES_GLOB.javascript, ...FILES_GLOB.typescript],
    plugins: { jsdoc: eslintPluginJsdoc },
    rules: {
      "jsdoc/require-jsdoc": 0,
      "jsdoc/require-param-description": 0,
      "jsdoc/require-property-description": 0,
      "jsdoc/require-returns-description": 0,
      "jsdoc/tag-lines": 0,
      "jsdoc/no-defaults": 0,
    },
    settings: { jsdoc: { ignorePrivate: true } },
  },
  {
    files: [...FILES_GLOB.javascript, ...FILES_GLOB.typescript],
    plugins: { unicorn: eslintPluginUnicorn },
    extends: [eslintPluginUnicorn.configs.unopinionated],
  },
  {
    files: ["test/**/*.js"],
    plugins: { "node-test": eslintNodeTest },
    extends: [eslintNodeTest.configs.recommended],
    languageOptions: {
      // parser: "esprima",
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.jest,
        ...globals.jasmine,
      },
    },
  },
  // eslintPluginPrettierRecommended,
  // TODO: https://github.com/import-js/eslint-plugin-import/pull/3230
  // {
  //   extends: ["plugin:import/recommended"],
  //   plugins: ["eslint-plugin-import"],
  //   rules: {
  //     "import/no-cycle": 1,
  //     "import/order": [1, { groups: ["builtin", "external", "internal"] }],
  //     "import/no-named-as-default": 0,
  //     "import/newline-after-import": 2,
  //   },
  // },
  {
    files: FILES_GLOB.html,
    plugins: { html: eslintPluginHtml },
    languageOptions: {
      sourceType: "module",
    },
  },
  {
    files: FILES_GLOB.markdown,
    plugins: { markdown: eslintPluginMarkdown },
    extends: [eslintPluginMarkdown.configs.recommended],
    rules: {
      "markdown/no-irregular-whitespace": 0, // https://github.com/eslint/markdown/issues/299
      "markdown/no-missing-label-refs": 0,
    },
  },
]);
