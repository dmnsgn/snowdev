# snowdev

[![npm version](https://img.shields.io/npm/v/snowdev)](https://www.npmjs.com/package/snowdev)
[![stability-stable](https://img.shields.io/badge/stability-stable-green.svg)](https://www.npmjs.com/package/snowdev)
[![npm minzipped size](https://img.shields.io/bundlephobia/minzip/snowdev)](https://www.npmjs.com/package/snowdev)
[![dependencies](https://img.shields.io/david/dmnsgn/snowdev)](https://github.com/dmnsgn/snowdev/blob/master/package.json)
[![types](https://img.shields.io/npm/types/snowdev)](https://github.com/microsoft/TypeScript)
[![styled with prettier](https://img.shields.io/badge/styled_with-Prettier-f8bc45.svg?logo=prettier)](https://github.com/prettier/prettier)
[![linted with eslint](https://img.shields.io/badge/linted_with-ES_Lint-4B32C3.svg?logo=eslint)](https://github.com/eslint/eslint)
[![license](https://img.shields.io/github/license/dmnsgn/snowdev)](https://github.com/snowdev/snowdev/blob/master/LICENSE)

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

- Simple BrowserSync dev server to watch and reload on changes
- Write examples using [ES Modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules) directly with [import-map](https://github.com/WICG/import-maps). See [template/index.html](template/index.html).
- Build examples dependencies using [browserlist](https://github.com/browserslist/browserslist) with targets `defaults and supports es6-module` to publish as GitHub pages with decent browser support.
- Choose which dependencies to convert to ESM (devDependencies, dependencies or hardcoded list)
- Push to a `gh-pages` branch

## Usage

```bash
# Create folder
mkdir ~/Projects/package-name
cd ~/Projects/package-name

# Generate folder structure (entry: index.js)
npx init
# ...optionally use a TypeScript structure (entry: src/index.ts)
npx init --ts

# Start a dev server and compile dependencies to ESM in web_modules
npx dev
# ...optionally watching ts files
npx dev --ts
# ...optionally passing options to browser-sync
npx dev --port 8080

# Build package for release:
# - lint and format sources
# - generate documentation in docs folder (when using --ts) or insert it directly in README
# - generate TypeScript types from either JSDoc or using tsconfig.json (and optionally compiling ts files)
npx build

# Publish to npm
npm publish
```

## API

```bash
$ npx snowdev --help

npx snowdev <command>

Commands:
  snowdev init     Create simple package structure.
  snowdev dev      Start dev server and install ESM dependencies.
  snowdev build    Lint and Format sources, run TypeScript, update README API.
  snowdev install  Install ESM dependencies.

Options:
  --cwd             Specify the current working directory for all commands.                                                                     [string] [default: process.cwd()]
  --username        Specify a user name for the init command.                                                                                    [string] [default: $ npm whoami]
  --gitHubUsername  Specify a GitHub user name for the init command.                                                                         [string] [default: options.username]
  --files           A glob pattern for files to be processed by build command.                                                                       [array] [default: "**/*.js"]
  --ignore          Files to be ignored by build command.    [array] [default: ["**/node_modules/**", "**/web_modules/**", join(options.cwd, "docs"), join(options.cwd, "lib"),]]
  --devDeps         Only install devDependencies as web_modules.                              [boolean] [default: false. Uses options.dependencies or package.json dependencies.]
  --dependencies    Specify list of dependencies to install as web_modules.                                              [array] [default: null. Uses package.json dependencies.]
  --ts              Use TypeScript for init, dev and build commands (create index.ts, watch files or build files).                                     [boolean] [default: false]
  --version         Show version number                                                                                                                                 [boolean]
  --help            Show help
```

## License

MIT. See [license file](https://github.com/dmnsgn/snowdev/blob/master/LICENSE.md).
