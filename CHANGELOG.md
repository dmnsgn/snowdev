# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

# [1.9.0](https://github.com/dmnsgn/snowdev/compare/v1.8.0...v1.9.0) (2022-03-07)


### Bug Fixes

* move format before types and docs in build command ([0906733](https://github.com/dmnsgn/snowdev/commit/09067330487f218c238e95da1cbc153ca1036757))


### Features

* add deploy to gh-pages ([d909b4a](https://github.com/dmnsgn/snowdev/commit/d909b4aae4800016e3586003b46ed5f6d15205f6))



# [1.8.0](https://github.com/dmnsgn/snowdev/compare/v1.7.0...v1.8.0) (2022-02-23)


### Features

* add jdoc-plugin-intersection ([e08f00f](https://github.com/dmnsgn/snowdev/commit/e08f00fcc0874d519229ed1a7a7f242b36235b38))
* add jsdoc config file path option ([7623cb2](https://github.com/dmnsgn/snowdev/commit/7623cb23d3d1da273f29afaf5779af880d009079))



# [1.7.0](https://github.com/dmnsgn/snowdev/compare/v1.6.2...v1.7.0) (2022-02-09)


### Features

* trim formatted docs trailing whitespace ([c43b749](https://github.com/dmnsgn/snowdev/commit/c43b749f870c284f3812dbce2279bdf3e608c734))



## [1.6.2](https://github.com/dmnsgn/snowdev/compare/v1.6.1...v1.6.2) (2021-11-12)



## [1.6.1](https://github.com/dmnsgn/snowdev/compare/v1.6.0...v1.6.1) (2021-09-10)



# [1.6.0](https://github.com/dmnsgn/snowdev/compare/v1.5.2...v1.6.0) (2021-09-10)


### Features

* add exports field to package.json ([7cc4861](https://github.com/dmnsgn/snowdev/commit/7cc48619b18bb3627a88825420cea037076217b8))



## [1.5.2](https://github.com/dmnsgn/snowdev/compare/v1.5.1...v1.5.2) (2021-04-27)


### Bug Fixes

* output docs to README.md for options.docs as folder and md ([d5f41ea](https://github.com/dmnsgn/snowdev/commit/d5f41ea141361537908ae286204fdf9c36976aa3))
* use ts.createEmitAndSemanticDiagnosticsBuilderProgram in watch mode ([1221c98](https://github.com/dmnsgn/snowdev/commit/1221c98cf6be83f5badd12517348b6dd69c2bcfe))



## [1.5.1](https://github.com/dmnsgn/snowdev/compare/v1.5.0...v1.5.1) (2021-04-14)


### Bug Fixes

* add jsdoc-tsimport-plugin ([0c05388](https://github.com/dmnsgn/snowdev/commit/0c05388a3531f8ab70073068e27f497e73a583c4))



# [1.5.0](https://github.com/dmnsgn/snowdev/compare/v1.4.4...v1.5.0) (2021-04-14)


### Bug Fixes

* ensure diagnostic file before logging its fileName ([36456a3](https://github.com/dmnsgn/snowdev/commit/36456a36a9676817428709c2b1c5c47e9b4cec99))


### Features

* add docsFormat option ([30c09d4](https://github.com/dmnsgn/snowdev/commit/30c09d4294d973af8525939054d5c3d90727ef26))



## [1.4.4](https://github.com/dmnsgn/snowdev/compare/v1.4.3...v1.4.4) (2021-04-08)


### Bug Fixes

* **template:** use es-modules-shims from web_modules instead of cdn ([75f6263](https://github.com/dmnsgn/snowdev/commit/75f6263f5369fce6baf795f3906ba58de113fc29))



## [1.4.3](https://github.com/dmnsgn/snowdev/compare/v1.4.2...v1.4.3) (2021-04-01)


### Bug Fixes

* use string for babel ignore ([7e40921](https://github.com/dmnsgn/snowdev/commit/7e40921598f5454f48362dfe251139deb28b1ec9))



## [1.4.2](https://github.com/dmnsgn/snowdev/compare/v1.4.1...v1.4.2) (2021-03-26)


### Bug Fixes

* add es-module-shims to babel ignore ([cc4b561](https://github.com/dmnsgn/snowdev/commit/cc4b561f861ede77b4c7555f151a12ded5f70c43))
* add web_modules to .npmignore ([495ab7a](https://github.com/dmnsgn/snowdev/commit/495ab7a6d37929df83d134469ce6a00888e70f0e))
* try/catch package.json read in install ([e926670](https://github.com/dmnsgn/snowdev/commit/e926670dbe213a4c297d0e18ba1d17d07c0a488b))



## [1.4.1](https://github.com/dmnsgn/snowdev/compare/v1.4.0...v1.4.1) (2021-03-26)


### Bug Fixes

* use babel runtime ([dd5c907](https://github.com/dmnsgn/snowdev/commit/dd5c9075c6360df0b72ee764b2ff67347e3963f9))



# [1.4.0](https://github.com/dmnsgn/snowdev/compare/v1.3.0...v1.4.0) (2021-03-25)


### Features

* auto-detect TypeScript projects ([95ee936](https://github.com/dmnsgn/snowdev/commit/95ee9362cb70792cee2d9d83d1ec4c8e9012b98b))



# [1.3.0](https://github.com/dmnsgn/snowdev/compare/v1.2.0...v1.3.0) (2021-03-25)


### Features

* default to all for options.dependencies ([42a0ccd](https://github.com/dmnsgn/snowdev/commit/42a0ccd0b8986d8b46a842ee8bbd1c24263faa88))



# [1.2.0](https://github.com/dmnsgn/snowdev/compare/v1.1.0...v1.2.0) (2021-03-25)


### Bug Fixes

* eslint environment ([3e4458c](https://github.com/dmnsgn/snowdev/commit/3e4458c22162c2518f1a748d99c9e94a8bbaba5e))
* split global and per command cosmiconfig options ([f442814](https://github.com/dmnsgn/snowdev/commit/f442814573d494d091a6e7b0525ba0795139bff6))


### Features

* only install new dependencies on dev command ([04ecbc0](https://github.com/dmnsgn/snowdev/commit/04ecbc0dca611abc82a2b1cfc47a3239ac2491cf))
