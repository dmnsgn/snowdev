# snowdev

[![npm version](https://img.shields.io/npm/v/snowdev)](https://www.npmjs.com/package/snowdev)
[![stability-stable](https://img.shields.io/badge/stability-stable-green.svg)](https://www.npmjs.com/package/snowdev)
[![npm minzipped size](https://img.shields.io/bundlephobia/minzip/snowdev)](https://bundlephobia.com/package/snowdev)
[![dependencies](https://img.shields.io/librariesio/release/npm/snowdev)](https://github.com/dmnsgn/snowdev/blob/main/package.json)
[![types](https://img.shields.io/npm/types/snowdev)](https://github.com/microsoft/TypeScript)
[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-fa6673.svg)](https://conventionalcommits.org)
[![styled with prettier](https://img.shields.io/badge/styled_with-Prettier-f8bc45.svg?logo=prettier)](https://github.com/prettier/prettier)
[![linted with eslint](https://img.shields.io/badge/linted_with-ES_Lint-4B32C3.svg?logo=eslint)](https://github.com/eslint/eslint)
[![license](https://img.shields.io/github/license/dmnsgn/snowdev)](https://github.com/snowdev/snowdev/blob/main/LICENSE)

> Zero configuration, unbundled, opinionated, development and prototyping server for simple ES modules development: types generation, format and linting, dev server and TypeScript support.

[![paypal](https://img.shields.io/badge/donate-paypal-informational?logo=paypal)](https://paypal.me/dmnsgn)
[![coinbase](https://img.shields.io/badge/donate-coinbase-informational?logo=coinbase)](https://commerce.coinbase.com/checkout/56cbdf28-e323-48d8-9c98-7019e72c97f3)
[![twitter](https://img.shields.io/twitter/follow/dmnsgn?style=social)](https://twitter.com/dmnsgn)

## Installation

```bash
npm install -g snowdev
```

## Features

- No configuration needed (but still possible via [cosmiconfig](https://github.com/davidtheclark/cosmiconfig))
- Spiritual successor to [budō](https://github.com/mattdesl/budo/)

### Develop packages

- Initialise a common structure for all your packages
- Optionally use TypeScript with sensible defaults
- Generate TypeScript types automatically (via `JSDoc` for JS only packages or using `src/**.ts` files)
- Generate API documentation automatically (via `JSDoc` for JS only packages and inserted in README or via `typedoc` in a `docs` folder for TypeScript packages)
- Prettier formatter and ESLint linter on build
- Keep package.json keys sorted for consistency

### Write examples

- Simple Browsersync dev server to watch and reload on changes with HMR (Hot Module Replacement) support via `import.meta.hot` similar to [Vite](https://vitejs.dev/guide/api-hmr.html#hmr-api)
- Write examples using standard [ES Modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules) directly with [import-map](https://github.com/WICG/import-maps). See [template/index.html](template/index.html).
- Build examples dependencies using [browserlist](https://github.com/browserslist/browserslist) with targets `defaults and supports es6-module` to publish as GitHub pages with decent browser support.
- Choose which dependencies to convert to ESM (devDependencies, dependencies or hardcoded list)

### Release

- Write commits using the [Conventional Commits Specification](https://www.conventionalcommits.org/en/v1.0.0/)
- Release with StandardVersion to bump the version based on the commits (patch/minor/major = fix/feat/BREAKING CHANGE), generate CHANGELOG release, create a new commit with git tag

## Usage

```bash
# Create folder
mkdir ~/Projects/package-name
cd ~/Projects/package-name

# Generate folder structure (entry: index.js)
npx snowdev init
# ...optionally use a TypeScript structure (entry: src/index.ts)
npx snowdev init --ts
# ...optionally passing your GitHub username if different from `npm whoami`
npx snowdev init --ts --gitHubUsername YourUsername

# Start a dev server and compile dependencies to ESM in web_modules
npx snowdev dev
# ...optionally passing options to browser-sync
npx snowdev dev --port 8080
# ...optionally watching ts files
npx snowdev dev --ts
# ...optionally watching ts files without dev server
npx snowdev dev --ts --no-serve

# Write code and commit all changes
git add -A && git commit -m "feat: add feature"

# Build package:
# - lint and format sources
# - generate documentation and insert it directly in README
# - generate TypeScript types from JSDoc
npx snowdev build
# ...optionally generate documentation in docs folder and compiling ts
# files and types using tsconfig.json
npx snowdev build --ts

# or directly prepare a release
# (build then run "commit-and-tag-version" committing all artefacts eg. docs)
npx snowdev release
# ...optionally passing options to "commit-and-tag-version" like prerelease
# setting a specific package distribution tag for "npm i package@alpha"
npx snowdev release --prerelease alpha
# ...optionally passing options to "commit-and-tag-version" like --dry-run
# to test release without committing to git or updating files
# or --first-release to only generate an initial changelog
npx snowdev release --first-release --dry-run

# and push/publish it
git push --follow-tags origin main && npm publish
```

## API

```bash
$ npx snowdev --help
snowdev

Start dev server and install ESM dependencies.

Commands:
  snowdev init     Create simple package structure.
  snowdev dev      Start dev server and install ESM dependencies.      [default]
  snowdev build    Lint and Format sources, run TypeScript, update README API.
  snowdev bundle   Bundle dependencies for development or production.
  snowdev release  Bump the version, generate changelog release, create a new co
                   mmit with git tag.
  snowdev deploy   Deploy to gh-pages.
  snowdev install  Install ESM dependencies.

Input/meta options:
  --cwd             Specify the current working directory for all commands.
                                               [string] [default: process.cwd()]
  --username        Specify a user name for the init command.
                                      [string] [default: $ npm profile get name]
  --gitHubUsername  Specify a GitHub user name for the init command. Default fro
                    m current npm profile or scraped from profile page.
                                            [string] [default: options.username]
  --authorName      Specify an author name for the init command. Default from cu
                    rrent npm profile or scraped from profile page.
                                  [string] [default: $ npm profile get fullname]
  --name            Specify an package name for the init command. Default to cwd
                     directory name.   [string] [default: basename(options.cwd)]
  --files           A glob pattern for files to be processed by build command. A
                    ll JS and TS files in root or "src/" folder.
                      [string] [default: "{*.+(t|j||mj)s,src/**/*.+(t|j||mj)s}"]
  --ignore          Files to be ignored by build command.
                  [array] [default: ["**/node_modules/**", "**/web_modules/**"]]
  --dependencies    Install all dependencies from package.json, only devDependen
                    cies ("dev"), only dependencies ("prod") or an array of depe
                    ndency as ES module into web_modules.
                         [string] [choices: "all", "dev", "prod"] [default: all]
  --updateVersions  Update package.json engines with current Node.js/npm version
                     from template, and currently used snowdev version.
                                                       [boolean] [default: true]
  --npmPath         Specify a path for the "npm" package. If null, commands will
                     use "npm" from shell.              [string] [default: null]

Commands options:
  --NODE_ENV              Define "process.env.NODE_ENV" and minify dependencies
                          if set to "production".[string] [default: development]
  --ts                    Use TypeScript for init, dev and build commands (creat
                          e index.ts, watch files or build files). Auto-detected
                           if a "tsconfig.json" is detected with a "compilerOpti
                          ons.outDir" set.        [boolean] [default: undefined]
  --serve                 Start Browsersync on dev command.
                                                       [boolean] [default: true]
  --lint                  Lint on build command.       [boolean] [default: true]
  --format                Format on build command.     [boolean] [default: true]
  --types                 Run TypeScript (generate types or compile) on build co
                          mmand or watch on dev command.
                                                       [boolean] [default: true]
  --docs                  Generate documentation (using "JSDoc" or "typedoc") in
                           file (between "options.docsStart" and "options.docsEn
                          d") or directory. Default to "README.md" but "docs" if
                           "options.ts".           [string] [default: undefined]
  --docsFormat            Default to "md" but "html" if "options.ts".
                           [string] [choices: "md", "html"] [default: undefined]
  --commitAndTagVersion   Bump the version, generate changelog release, create a
                           new commit with git tag on release command.
                                                                 [default: true]
  --crossOriginIsolation  Add Cross-Origin-Opener-Policy (COOP) and Cross-Origin
                          -Embedder-Policy (COEP) headers to browsersync. Requir
                          ed for the use of SharedArrayBuffer.
                                                      [boolean] [default: false]
  --http2                 Serve with "node:http2".     [boolean] [default: true]
  --hmr                   Add Hot Module Replacement to browsersync. Requires "e
                          s-module-shims" with "shimMode".
                                                       [boolean] [default: true]

Options:
  --version  Show version number                                       [boolean]
  --help     Show help                                                 [boolean]
```

## License

MIT. See [license file](https://github.com/dmnsgn/snowdev/blob/main/LICENSE.md).
