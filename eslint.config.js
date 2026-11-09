import { defineConfig } from "eslint/config";
import globals from "globals";
import babelParser from "@babel/eslint-parser";

import eslintJs from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintPluginJsdoc from "eslint-plugin-jsdoc";
import eslintPluginUnicorn from "eslint-plugin-unicorn";
import eslintPluginSonarjs from "eslint-plugin-sonarjs";
import eslintPluginImportX, {
  createNodeResolver,
  flatConfigs as importXConfigs,
} from "eslint-plugin-import-x";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";

import eslintNodeTest from "eslint-node-test";
import eslintPackageJson from "eslint-package-json";

import eslintPluginHtml from "@html-eslint/eslint-plugin";
import eslintPluginJsInHtml from "eslint-plugin-html";
import eslintCssPropertyOrder, {
  createHtmlProcessor,
} from "eslint-plugin-css-property-order";
import eslintPluginMarkdown from "@eslint/markdown";

import eslintCss from "@eslint/css";

import { FILES_GLOB, getFileExtension } from "./utils.js";

const SCRIPTS = [...FILES_GLOB.javascript, ...FILES_GLOB.typescriptAll];
const SCRIPTS_AND_HTML = [...SCRIPTS, ...FILES_GLOB.html];
const IMPORT_EXTENSIONS = SCRIPTS.map(getFileExtension);

export default defineConfig([
  // Scripts
  {
    files: [...FILES_GLOB.javascript, ...FILES_GLOB.html],
    plugins: { js: eslintJs },
    extends: [eslintJs.configs.recommended],
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: FILES_GLOB.typescriptAll,
  })),
  {
    files: FILES_GLOB.typescriptAll.map((glob) => `src/${glob}`),
    ignores: ["**/*.spec.ts"],
    extends: [tseslint.configs.recommendedTypeCheckedOnly],
    languageOptions: { parserOptions: { projectService: true } },
  },
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
    files: SCRIPTS_AND_HTML,
    plugins: { unicorn: eslintPluginUnicorn },
    extends: [eslintPluginUnicorn.configs.unopinionated],
    rules: {
      "unicorn/import-style": 0,
      "unicorn/no-anonymous-default-export": 0,
      "unicorn/no-array-reduce": 0,
      "unicorn/no-array-reverse": 0,
      "unicorn/no-array-sort": 0,
      "unicorn/no-for-each": 0,
    },
  },
  {
    files: SCRIPTS_AND_HTML,
    extends: [eslintPluginSonarjs.configs.recommended],
    rules: {
      "sonarjs/cognitive-complexity": "warn",
      "sonarjs/todo-tag": "warn",
      "sonarjs/redundant-type-aliases": "warn",
    },
  },
  {
    files: SCRIPTS_AND_HTML,
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
      "import-x/no-cycle": ["warn", { ignoreExternal: true }],
      "import-x/no-relative-packages": "error",
      "import-x/no-self-import": "error",
      "import-x/no-useless-path-segments": "error",

      // Style guide
      "import-x/consistent-type-specifier-style": "error",
      // "import-x/exports-last": "warn",
      "import-x/extensions": ["warn", "ignorePackages"],
      "import-x/first": "error",
      // "import-x/group-exports": "warn",
      "import-x/newline-after-import": ["error", { considerComments: true }],
      "import-x/order": [
        "error",
        {
          groups: [
            "builtin",
            ["external", "internal"],
            ["parent", "sibling", "index"],
            "unknown",
            "object",
            "type",
          ],
          // Allow sub-grouping local imports
          "newlines-between": "always-and-inside-groups",
          sortTypesGroup: true,
          "newlines-between-types": "ignore", // "never" TODO: https://github.com/un-ts/eslint-plugin-import-x/issues/542
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

  // Documentation
  {
    // HTML excluded: https://github.com/BenoitZugmeyer/eslint-plugin-html/issues/359
    files: FILES_GLOB.javascript,
    extends: [eslintPluginJsdoc.configs["flat/recommended-typescript-flavor"]],
  },
  {
    files: FILES_GLOB.typescriptAll,
    extends: [eslintPluginJsdoc.configs["flat/recommended-typescript"]],
    rules: {
      "jsdoc/require-returns": 0,
      "jsdoc/require-param": 0,
      "jsdoc/require-yields": 0,
    },
  },
  {
    // HTML excluded: https://github.com/BenoitZugmeyer/eslint-plugin-html/issues/359
    files: SCRIPTS,
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

  // Test
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

  // JSON
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

  // Markup/Markdown
  {
    files: FILES_GLOB.html,
    plugins: {
      jsInHtml: eslintPluginJsInHtml,
      "css-property-order": eslintCssPropertyOrder,
    },
    extends: [eslintPluginHtml.configs["flat/all"]],
    languageOptions: {
      sourceType: "module",
      globals: globals.browser,
    },
    processor: createHtmlProcessor({ emitSource: true }),
    settings: {
      // eslint-plugin-html defaults + es-module-shims
      "html/javascript-mime-types": [
        String.raw`/^(application|text)\/(x-)?(javascript|babel|ecmascript-6)$/i`,
        "/^module(-shim)?$/i",
      ],
    },
    rules: {
      // Prettier compatibility
      "@html-eslint/attrs-newline": 0,
      "@html-eslint/element-newline": 0,
      "@html-eslint/indent": 0,
      "@html-eslint/no-extra-spacing-text": 0,
      "@html-eslint/no-extra-spacing-tags": [
        "error",
        { enforceBeforeSelfClose: true },
      ],
      "@html-eslint/require-closing-tags": ["error", { selfClosing: "always" }],
      // es-module-shims types
      "@html-eslint/no-invalid-attr-value": [
        "error",
        {
          allow: [
            {
              tag: "script",
              attr: "type",
              valuePattern: "^(module|importmap)-shim$",
            },
          ],
        },
      ],
      // No extra meta
      "@html-eslint/require-meta-description": 0,
      "@html-eslint/require-open-graph-protocol": 0,
    },
  },
  {
    files: FILES_GLOB.markdown,
    plugins: { markdown: eslintPluginMarkdown },
    extends: [eslintPluginMarkdown.configs.recommended],
    rules: {
      // "markdown/no-irregular-whitespace": 0, // https://github.com/eslint/markdown/issues/299
      "markdown/no-missing-label-refs": 0,
    },
  },

  // Styles
  {
    files: SCRIPTS,
    plugins: { "css-property-order": eslintCssPropertyOrder },
    processor: "css-property-order/tagged-template",
  },
  {
    files: FILES_GLOB.css,
    plugins: { css: eslintCss },
    language: "css/css",
    extends: [
      eslintCss.configs.recommended,
      eslintCssPropertyOrder.configs.recommended,
    ],
    rules: {
      "css/use-baseline": 0,
      "css/no-invalid-properties": 0,
    },
  },
]);
