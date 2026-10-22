import eslintJs from "@eslint/js";
import { defineConfig } from "eslint/config";
import globals from "globals";
import babelParser from "@babel/eslint-parser";
import tseslint from "typescript-eslint";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import eslintPluginUnicorn from "eslint-plugin-unicorn";
import eslintPluginSonarjs from "eslint-plugin-sonarjs";
import eslintPluginJsdoc from "eslint-plugin-jsdoc";
import eslintPluginImportX, {
  createNodeResolver,
  flatConfigs as importXConfigs,
} from "eslint-plugin-import-x";
import eslintPackageJson from "eslint-package-json";
import eslintPluginHtml from "eslint-plugin-html";
import eslintPluginMarkdown from "@eslint/markdown";
import eslintNodeTest from "eslint-node-test";
import css from "@eslint/css";
import cssPropertyOrder, {
  createHtmlProcessor,
} from "eslint-plugin-css-property-order";

import { FILES_GLOB, getFileExtension } from "./utils.js";

const IMPORT_EXTENSIONS = [
  ...FILES_GLOB.javascript,
  ...FILES_GLOB.typescriptAll,
].map(getFileExtension);

// eslint-disable-next-line unicorn/no-top-level-side-effects
export default defineConfig([
  {
    files: FILES_GLOB.javascript,
    plugins: { js: eslintJs },
    extends: [eslintJs.configs.recommended],
  },
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
    rules: {
      "unicorn/import-style": 0,
      "unicorn/no-anonymous-default-export": 0,
      "unicorn/no-array-reduce": 0,
      "unicorn/no-array-reverse": 0,
      "unicorn/no-array-sort": 0,
      "unicorn/no-for-each": 0,
      "unicorn/number-literal-case": [
        "error",
        { hexadecimalValue: "lowercase" },
      ],
    },
  },
  {
    files: [...FILES_GLOB.javascript, ...FILES_GLOB.typescript],
    ...eslintPluginSonarjs.configs.recommended,
    rules: {
      "sonarjs/cognitive-complexity": "warn",
    },
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
  {
    files: ["**/package.json"],
    plugins: { packageJson: eslintPackageJson },
    extends: [eslintPackageJson.configs.recommended],
    rules: {
      "package-json/prefer-shorthand": 0,
      "package-json/prefer-files-field": 0,
      "package-json/sort-properties": 0,
      "package-json/prefer-exports": 0,
    },
  },
  {
    files: [...FILES_GLOB.javascript, ...FILES_GLOB.typescriptAll],
    plugins: { "import-x": eslintPluginImportX },
    settings: {
      "import-x/extensions": IMPORT_EXTENSIONS,
      "import-x/parsers":
        importXConfigs.typescript.settings["import-x/parsers"],
      "import-x/resolver-next": [
        createNodeResolver({
          extensions: [...IMPORT_EXTENSIONS, ".json"],
          extensionAlias: {
            ".js": [".ts", ".tsx", ".js"],
            ".mjs": [".mts", ".mjs"],
          },
        }),
      ],
    },
    rules: {
      ...importXConfigs.recommended.rules,
      // Helpful warnings
      "import-x/export": "warn",
      "import-x/no-empty-named-blocks": "error",
      "import-x/no-extraneous-dependencies": [
        "error",
        {
          devDependencies: [
            "{example,examples,test,tests,scripts}/**",
            "**/*.config.{js,mjs,ts,mts}",
          ],
        },
      ],
      "import-x/no-mutable-exports": "error",

      // Module systems
      "import-x/no-amd": "error",
      "import-x/no-commonjs": "error",
      "import-x/no-import-module-exports": "error",

      // Performance
      // "import-x/avoid-barrel-files": "error",
      // "import-x/avoid-importing-barrel-files": "error",
      // "import-x/avoid-namespace-import": "error",
      // "import-x/avoid-re-export-all": "error",

      // Static analysis
      "import-x/namespace": ["error", { allowComputed: true }],
      "import-x/no-absolute-path": "error",
      "import-x/no-cycle": ["error", { ignoreExternal: true }],
      "import-x/no-relative-packages": "error",
      "import-x/no-self-import": "error",
      "import-x/no-useless-path-segments": "error",

      // Style guide
      "import-x/consistent-type-specifier-style": "error",
      "import-x/exports-last": "warn",
      "import-x/extensions": ["warn", "ignorePackages"],
      "import-x/first": "error",
      "import-x/group-exports": "warn",
      "import-x/newline-after-import": ["error", { considerComments: true }],
      "import-x/order": [
        "error",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            ["parent", "sibling", "index"],
            "unknown",
            "object",
            "type",
          ],
          // Allow sub-grouping local imports
          "newlines-between": "always-and-inside-groups",
          // named: true,
          // alphabetize: { order: "asc" },
          // warnOnUnassignedImports: "top",
        },
      ],
    },
  },
  {
    files: FILES_GLOB.typescriptAll,
    rules: {
      ...importXConfigs.typescript.rules,
      "import-x/default": 0,
      "import-x/namespace": 0,
      "import-x/no-named-as-default-member": 0,
      "import-x/no-unresolved": 0,
      "import-x/extensions": 0, // ".js" specifiers resolving to ".ts" files are reported as missing ".ts"
    },
  },
  eslintPluginPrettierRecommended,
  {
    files: FILES_GLOB.html,
    plugins: { html: eslintPluginHtml },
    languageOptions: {
      sourceType: "module",
    },
    processor: createHtmlProcessor({ emitSource: true }),
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
  {
    files: [...FILES_GLOB.javascript, ...FILES_GLOB.typescript],
    plugins: { "css-property-order": cssPropertyOrder },
    processor: "css-property-order/tagged-template",
  },
  {
    files: FILES_GLOB.css,
    plugins: { css },
    language: "css/css",
    extends: [css.configs.recommended, cssPropertyOrder.configs.recommended],
    rules: {
      "css/use-baseline": 0,
      "css/no-invalid-properties": 0,
    },
  },
]);
