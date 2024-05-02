# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

# [2.0.0-alpha.27](https://github.com/dmnsgn/snowdev/compare/v2.0.0-alpha.26...v2.0.0-alpha.27) (2024-05-02)


### Features

* exclude node_modules from rollup CIRCULAR_DEPENDENCY warnings ([b6cb2ca](https://github.com/dmnsgn/snowdev/commit/b6cb2caefe4b32c314e545c777cae35359b8b032))



# [2.0.0-alpha.26](https://github.com/dmnsgn/snowdev/compare/v2.0.0-alpha.25...v2.0.0-alpha.26) (2024-04-11)


### Bug Fixes

* strip quotes for npm argv ([cc9c19e](https://github.com/dmnsgn/snowdev/commit/cc9c19ed18f2b81efd53d4a7227a5dda9432e4a4))



# [2.0.0-alpha.25](https://github.com/dmnsgn/snowdev/compare/v2.0.0-alpha.24...v2.0.0-alpha.25) (2024-04-11)


### Bug Fixes

* use query ":scope" to get dependencies in workspace ([dab3834](https://github.com/dmnsgn/snowdev/commit/dab3834b59df38e1ffd66b494d601359d94f5228))



# [2.0.0-alpha.24](https://github.com/dmnsgn/snowdev/compare/v2.0.0-alpha.23...v2.0.0-alpha.24) (2024-04-10)


### Bug Fixes

* ensure https is set for browser-sync httpModule ([9f58556](https://github.com/dmnsgn/snowdev/commit/9f5855644246b4e951b117e65fd155ff21d03988))
* ensure process.env.NODE_ENV key isn't replaced ([b099591](https://github.com/dmnsgn/snowdev/commit/b099591f23e782259cb8bd927765ee9fb3346c83))
* only update versions for dev command ([c89b397](https://github.com/dmnsgn/snowdev/commit/c89b397c895e8cfb7ba3cdb23a64bb3341132059))


### Features

* add npm + support workspaces dependencies ([fdfa1b8](https://github.com/dmnsgn/snowdev/commit/fdfa1b8075dc94540e1a90ce35055f266bfd7968))
* add path sorting for build command ([5af3733](https://github.com/dmnsgn/snowdev/commit/5af373334a9bc6ac2c5abd6361c9afb9f94108a5))
* add updateVersions ([1bbd051](https://github.com/dmnsgn/snowdev/commit/1bbd051c325ff130946cd44abd1eb856c25de569))
* check invalid dependencies ([0aee75d](https://github.com/dmnsgn/snowdev/commit/0aee75d9334ada87de5313d78d3a85a1e038d3a0))
* handle dependency change when running dev ([d337350](https://github.com/dmnsgn/snowdev/commit/d33735052f0fc552e0d13bb63c872b7780243d90))
* use global searchStrategy for cosmiconfig ([53ec5b5](https://github.com/dmnsgn/snowdev/commit/53ec5b5389d4ecb7724f0c5c5ac4cae811b9151b))



# [2.0.0-alpha.23](https://github.com/dmnsgn/snowdev/compare/v2.0.0-alpha.22...v2.0.0-alpha.23) (2024-01-30)


### Bug Fixes

* empty output directory if no dependency to install ([26c7107](https://github.com/dmnsgn/snowdev/commit/26c710741103715887a5818986fb8dc90a77dca1))
* ensure no duplicates in dependencies changed log ([f9f822a](https://github.com/dmnsgn/snowdev/commit/f9f822a6ee7e03da2e49f4f07cf97caf32132db3))



# [2.0.0-alpha.22](https://github.com/dmnsgn/snowdev/compare/v2.0.0-alpha.21...v2.0.0-alpha.22) (2023-12-05)


### Bug Fixes

* check null entry for legacy exports defined as folders or files without extensions ([29c1eeb](https://github.com/dmnsgn/snowdev/commit/29c1eeb4fca448044020916540d80a6b3bd7ce43))



# [2.0.0-alpha.21](https://github.com/dmnsgn/snowdev/compare/v2.0.0-alpha.20...v2.0.0-alpha.21) (2023-12-05)


### Bug Fixes

* handle legacy exports defined as folders or files without extensions ([d0f2bcd](https://github.com/dmnsgn/snowdev/commit/d0f2bcd45f4f3f2d5ede572ed5e323586464e581))
* hardcode removal of new exports. in jsdoc ([65a6d26](https://github.com/dmnsgn/snowdev/commit/65a6d2689b3afdee7c82351e11d8d95d7b242ec9))


### Features

* add typedoc-material-theme ([93bf01d](https://github.com/dmnsgn/snowdev/commit/93bf01da27d69f7ddbbdcba1db569d4d25ff5eba))



# [2.0.0-alpha.20](https://github.com/dmnsgn/snowdev/compare/v2.0.0-alpha.19...v2.0.0-alpha.20) (2023-11-02)


### Bug Fixes

* create doc folder for ts ([a84b482](https://github.com/dmnsgn/snowdev/commit/a84b482d951fb504eed369fb31d2ca4beacee869))
* exclude snowdev from install ([e189225](https://github.com/dmnsgn/snowdev/commit/e1892252e62321154542f76961abc6dd7cade5ba))
* handle errors in dependencies for typedoc ([bc57c6d](https://github.com/dmnsgn/snowdev/commit/bc57c6d3b30e5b797cd90733fd2a02b8709a3704))
* swc Error: `env` and `jsc.target` cannot be used together ([9b16f21](https://github.com/dmnsgn/snowdev/commit/9b16f217cc6cc6913cd4f08e4a06bffaf002d869))
* use .js for main importMap import path ([98fae28](https://github.com/dmnsgn/snowdev/commit/98fae28610da2fcc39411943c99115a71ada7ac0))



# [2.0.0-alpha.19](https://github.com/dmnsgn/snowdev/compare/v2.0.0-alpha.18...v2.0.0-alpha.19) (2023-09-09)


### Bug Fixes

* add no-named-as-default to eslint import ([8980641](https://github.com/dmnsgn/snowdev/commit/898064109dcd2eec8047f050d3254675a0646f9d))
* hardcoded dependency import map value ([fa3b041](https://github.com/dmnsgn/snowdev/commit/fa3b0414cb849add1248e5ab5096e8b85d2cc968))
* name cli argument ([e8eff7b](https://github.com/dmnsgn/snowdev/commit/e8eff7b3d7488e27c4e5137775a4345590d7a723))
* treat star as globstar in wildcard entries resolution ([a8d69c7](https://github.com/dmnsgn/snowdev/commit/a8d69c734011c5b2100ab7cb9e02e807fe008828))
* update eslint extends/settings rules for TypeScript and typescript-flavor ([0cafba9](https://github.com/dmnsgn/snowdev/commit/0cafba9d52d0e4be48398d4c8e1b8f99c571a01c))


### Features

* add back support for hardcoded dependencies ([db9804b](https://github.com/dmnsgn/snowdev/commit/db9804b346ecd87165e1a31f6518b31073e97fd6))
* add options.name for init command package name ([7ff4949](https://github.com/dmnsgn/snowdev/commit/7ff4949436f5f5186ff8014ceb1b4ef2ff883257))
* allow both filename and subpackage path for hardcoded dependencies ([2e23fb3](https://github.com/dmnsgn/snowdev/commit/2e23fb3e4c33001c1fc5e4e2ecada11abd36617c))
* **template:** update module type + add .nojekyll to npmignore ([93e021b](https://github.com/dmnsgn/snowdev/commit/93e021b2390980fd69f94093883d89a33096fc95))
* update import rules ([6c8e4fe](https://github.com/dmnsgn/snowdev/commit/6c8e4fe011396871c13425bbdc56c6ff1ca3b8cd))



# [2.0.0-alpha.18](https://github.com/dmnsgn/snowdev/compare/v2.0.0-alpha.17...v2.0.0-alpha.18) (2023-08-07)



# [2.0.0-alpha.17](https://github.com/dmnsgn/snowdev/compare/v2.0.0-alpha.16...v2.0.0-alpha.17) (2023-08-04)


### Bug Fixes

* always compare dependencies by spec and name ([57bb25a](https://github.com/dmnsgn/snowdev/commit/57bb25a11777edcae60bbad3f2d96a4afc1f7dc7))


### Features

* move .nojekyll to cwd ([d7905b0](https://github.com/dmnsgn/snowdev/commit/d7905b081478b396589e1c24dbb63b80c40b1fdd))



# [2.0.0-alpha.16](https://github.com/dmnsgn/snowdev/compare/v2.0.0-alpha.15...v2.0.0-alpha.16) (2023-07-27)


### Bug Fixes

* fully compare dependencies and cachedDependencies ([632652e](https://github.com/dmnsgn/snowdev/commit/632652e26e270c9595224f9ec0b245f3b29a92d3))



# [2.0.0-alpha.15](https://github.com/dmnsgn/snowdev/compare/v2.0.0-alpha.14...v2.0.0-alpha.15) (2023-07-27)


### Features

* add jsdoc-export-default-interop ([7960faa](https://github.com/dmnsgn/snowdev/commit/7960faafe730bcbfabcd6111fda750188ee8c568))



# [2.0.0-alpha.14](https://github.com/dmnsgn/snowdev/compare/v2.0.0-alpha.13...v2.0.0-alpha.14) (2023-07-25)


### Features

* add eslint-plugin-import ([97f48df](https://github.com/dmnsgn/snowdev/commit/97f48dff82b08732c241b4b65d4a472f9400c89c))
* add import/no-named-as-default 0 ([d78e62a](https://github.com/dmnsgn/snowdev/commit/d78e62ad11c0005145c105d21cb3eee53ee86203))
* format rollup log ([0c152ba](https://github.com/dmnsgn/snowdev/commit/0c152ba59d16627016a995563e59edbe02fad788))



# [2.0.0-alpha.13](https://github.com/dmnsgn/snowdev/compare/v2.0.0-alpha.12...v2.0.0-alpha.13) (2023-07-20)



# [2.0.0-alpha.12](https://github.com/dmnsgn/snowdev/compare/v2.0.0-alpha.11...v2.0.0-alpha.12) (2023-07-19)


### Bug Fixes

* add max-old-space-size to cli ([cb2a91c](https://github.com/dmnsgn/snowdev/commit/cb2a91cfc30ecb7dcfe7af654eb9b7064061e937))
* sourceMap declaration ([645d730](https://github.com/dmnsgn/snowdev/commit/645d730a1a0e56e6fc098e1b2f3ed8de6e766f48))
* upgrade prettier.format to new syntax ([4241b46](https://github.com/dmnsgn/snowdev/commit/4241b46ae35cc8359a78e1a228a27c24c4a24266))


### Features

* add jsdoc eslint no-defaults ([e146c43](https://github.com/dmnsgn/snowdev/commit/e146c43f66a8679cee9d6afc317755da0dc7cdd0))
* add watch and sourceMap to bundle ([261ee73](https://github.com/dmnsgn/snowdev/commit/261ee73674e0ae7d43accc4becd77cf789f0fe36))



# [2.0.0-alpha.11](https://github.com/dmnsgn/snowdev/compare/v2.0.0-alpha.10...v2.0.0-alpha.11) (2023-06-28)



# [2.0.0-alpha.10](https://github.com/dmnsgn/snowdev/compare/v2.0.0-alpha.9...v2.0.0-alpha.10) (2023-06-27)


### Bug Fixes

* force .js extension for all entries ([616fb05](https://github.com/dmnsgn/snowdev/commit/616fb052c248604f11054f2cc8372189c6054416))



# [2.0.0-alpha.9](https://github.com/dmnsgn/snowdev/compare/v2.0.0-alpha.8...v2.0.0-alpha.9) (2023-06-27)


### Bug Fixes

* double deepmerged options ([4ce4209](https://github.com/dmnsgn/snowdev/commit/4ce4209c8dd4098b99fcd3b8b9108035f4ff43d8))



# [2.0.0-alpha.8](https://github.com/dmnsgn/snowdev/compare/v2.0.0-alpha.7...v2.0.0-alpha.8) (2023-06-27)


### Bug Fixes

* deepmerge all options ([c1510e1](https://github.com/dmnsgn/snowdev/commit/c1510e1ef494615ccad2be5624b47203b906013e))
* handle bundle result error in install ([e4bff55](https://github.com/dmnsgn/snowdev/commit/e4bff55f0902d7906e081780a6e7781c7d523687))


### Features

* add force install + use tree dependency names + check cache only if output folder exists ([554432c](https://github.com/dmnsgn/snowdev/commit/554432cc093f5ca1824c08fe971ea26a753152c5))
* always return values for install command ([4e076b5](https://github.com/dmnsgn/snowdev/commit/4e076b55329e9ae965c2dc45ef8feb0151cdbd00))



# [2.0.0-alpha.7](https://github.com/dmnsgn/snowdev/compare/v2.0.0-alpha.6...v2.0.0-alpha.7) (2023-06-26)


### Features

* add extra plugins enforce property to sort them similarly to Vite and webpack ([407de00](https://github.com/dmnsgn/snowdev/commit/407de00932fad97e9bbb02ef2eb5da8ef41df944))



# [2.0.0-alpha.6](https://github.com/dmnsgn/snowdev/compare/v2.0.0-alpha.5...v2.0.0-alpha.6) (2023-06-23)


### Features

* use rollup.extraPlugins for additional plugins and rollup.input.plugins for overrides + add rollup.pluginsOptions ([deb95d3](https://github.com/dmnsgn/snowdev/commit/deb95d396acc803a8c8d326af1dc35d58e3ec322))



# [2.0.0-alpha.5](https://github.com/dmnsgn/snowdev/compare/v2.0.0-alpha.4...v2.0.0-alpha.5) (2023-06-21)


### Bug Fixes

* order of plugin override ([02643a7](https://github.com/dmnsgn/snowdev/commit/02643a73bcfc7c261bacc3e3ee52e932c5b98bde))



# [2.0.0-alpha.4](https://github.com/dmnsgn/snowdev/compare/v2.0.0-alpha.3...v2.0.0-alpha.4) (2023-06-19)


### Features

* add caller option ([032e72d](https://github.com/dmnsgn/snowdev/commit/032e72dc1b61b058702b94942590d641c5694aaf))
* make rollup plugins configurable ([11c5d0f](https://github.com/dmnsgn/snowdev/commit/11c5d0f8b01be0eb679ea5527063f4886386c74e))



# [2.0.0-alpha.3](https://github.com/dmnsgn/snowdev/compare/v2.0.0-alpha.2...v2.0.0-alpha.3) (2023-06-16)


### Features

* add module to default tsconfig.compilerOptions ([cbee12a](https://github.com/dmnsgn/snowdev/commit/cbee12a0c7643f085ed3f08f7d2c53cdd468b653))
* set entryFileNames only for install command ([fc282b1](https://github.com/dmnsgn/snowdev/commit/fc282b1133e8532cf2b0a6abf6cfb62944281020))



# [2.0.0-alpha.2](https://github.com/dmnsgn/snowdev/compare/v2.0.0-alpha.1...v2.0.0-alpha.2) (2023-06-15)


### Features

* remove options.dist in favour of options.rollup.output.dir ([f004e29](https://github.com/dmnsgn/snowdev/commit/f004e29af1523f754504082c179b1b09fa62b0a0))
* return and await command result in run ([b4f9690](https://github.com/dmnsgn/snowdev/commit/b4f9690e7d3c0c913a49af7c38628e70d5b268c6))



# [2.0.0-alpha.1](https://github.com/dmnsgn/snowdev/compare/v2.0.0-alpha.0...v2.0.0-alpha.1) (2023-06-15)


### Features

* log current version ([3f2d5a4](https://github.com/dmnsgn/snowdev/commit/3f2d5a407d199e8fd6fc2860c482fc0ee1aea68f))



# [2.0.0-alpha.0](https://github.com/dmnsgn/snowdev/compare/v1.15.2...v2.0.0-alpha.0) (2023-06-15)


### Bug Fixes

* add --porcelain to git push command ([d880725](https://github.com/dmnsgn/snowdev/commit/d88072564237a3fbc2356715cf6d8219f60ed22c))
* add missing mts cjs and cts extensions to file regex ([8fe427b](https://github.com/dmnsgn/snowdev/commit/8fe427b7e901176de292b35327489970857b5dd6))
* glob sort files ([4e39f21](https://github.com/dmnsgn/snowdev/commit/4e39f218ed3333ed5c2611058f53b73146615b73))
* handle esm init options on window ([49ebf2a](https://github.com/dmnsgn/snowdev/commit/49ebf2ac63c297fc6caff3f46252031d9e9100d5))
* update babel corejs options ([d01e75a](https://github.com/dmnsgn/snowdev/commit/d01e75a87a56dcca712a2de2cc73557a69b8fc99))


### Features

* add eslint-plugin-jsdoc ([68f744d](https://github.com/dmnsgn/snowdev/commit/68f744daea61cc7b39828eafd938f13be9fecb1a))
* add HMR (Hot Module Replacement) support ([12185a6](https://github.com/dmnsgn/snowdev/commit/12185a63c118a066dcdfdbf9a4824a97777f93c8))
* add http2 support ([e3e2348](https://github.com/dmnsgn/snowdev/commit/e3e234806a19d2596017cb1131a0bb864f535333))
* add node and worker to eslint env + use latest parser version ([6f846f5](https://github.com/dmnsgn/snowdev/commit/6f846f5fddd5b8f79d3911393be1a2f10c21d7bc))
* add options.dist for cold built dependencies ([f2f1b74](https://github.com/dmnsgn/snowdev/commit/f2f1b7477213c666e3738c18eb3d568c9bd61d23))
* add programmatic API + add bundle command using rollup ([a79cace](https://github.com/dmnsgn/snowdev/commit/a79cacece2fff8531b5fd78e764f71e64cd56568))
* add snowdev version to cache ([e84bc1d](https://github.com/dmnsgn/snowdev/commit/e84bc1db7c1cd4f96d45db20331f47f3f10cf697))
* **template:** update tsconfig ([3cabf9b](https://github.com/dmnsgn/snowdev/commit/3cabf9bc37d9011f912f84a561a3a8a4b44d441c))
* use dev as default command ([d3cca92](https://github.com/dmnsgn/snowdev/commit/d3cca92e5a5efa801e3e0ae1709f6584a2010f57))
* wrap yargs to terminal width ([0e2b22b](https://github.com/dmnsgn/snowdev/commit/0e2b22bc294fcb7b26a1bf9ea52d6a9d60476bb3))


### Reverts

* remove yargs strict ([9fc7528](https://github.com/dmnsgn/snowdev/commit/9fc752812e0f7659259bdf4e954915cf30a5615c))


### BREAKING CHANGES

* use swc via rollup



## [1.15.2](https://github.com/dmnsgn/snowdev/compare/v1.15.1...v1.15.2) (2023-02-19)


### Bug Fixes

* typo in deploy's git checkout ([4e130ee](https://github.com/dmnsgn/snowdev/commit/4e130ee76ea510af7d1f57b48cf7a66f7eeeb8f5))



## [1.15.1](https://github.com/dmnsgn/snowdev/compare/v1.15.0...v1.15.1) (2023-02-14)



# [1.15.0](https://github.com/dmnsgn/snowdev/compare/v1.14.0...v1.15.0) (2023-02-10)


### Features

* **template:** update tsconfig to latest ([7813358](https://github.com/dmnsgn/snowdev/commit/78133581d7dc0ba1460386e07457185c6f7fb133))
* use npm user profile for init unless --username is specified ([e10ee07](https://github.com/dmnsgn/snowdev/commit/e10ee07fb4c244ff1940618bf729705ad69e98a5))



# [1.14.0](https://github.com/dmnsgn/snowdev/compare/v1.13.0...v1.14.0) (2023-02-09)


### Features

* add COOP and COEP headers ([cea47a4](https://github.com/dmnsgn/snowdev/commit/cea47a487738069a917bdfb2c417545604af0722))
* **template:** add current year to LICENSE ([92f4ed7](https://github.com/dmnsgn/snowdev/commit/92f4ed7f87085d88f050b1dabd42209be95890dd))
* **template:** add es-module-shims as type module and import-map as importmap-shim ([929fecf](https://github.com/dmnsgn/snowdev/commit/929fecf445a4eeaec6e87dd4745ddc55b2ff5833))
* **template:** add side effect to package.json ([4026b88](https://github.com/dmnsgn/snowdev/commit/4026b88ab72a37c7fb592b05e576c6177c3d2750))
* **template:** bump engine versions to LTS ([ad6350b](https://github.com/dmnsgn/snowdev/commit/ad6350b02abcffe29c82916011e261f42b89a7ad))



# [1.13.0](https://github.com/dmnsgn/snowdev/compare/v1.12.0...v1.13.0) (2022-10-15)


### Features

* **main:** check for uncommited changes before release ([e20a0d9](https://github.com/dmnsgn/snowdev/commit/e20a0d987a2653d2cbbfc48689318ec78a1da80d))



# [1.12.0](https://github.com/dmnsgn/snowdev/compare/v1.11.0...v1.12.0) (2022-09-09)


### Bug Fixes

* add missing fs.access import ([871ed3d](https://github.com/dmnsgn/snowdev/commit/871ed3d7521b70010e14c06aeae174a31395b245))
* check for web_modules on install ([0666e22](https://github.com/dmnsgn/snowdev/commit/0666e2237d31fe5f1fd3c561a9766f2996897625))


### Features

* add ESNext to tsconfig lib ([74a7b4d](https://github.com/dmnsgn/snowdev/commit/74a7b4d958d2dfbeb13ab267b69c90186c0c47d0))
* add lib DOM to tsconfig ([4aa13d8](https://github.com/dmnsgn/snowdev/commit/4aa13d8e703c36ed1421587f48bcbf0798471cd6))



# [1.11.0](https://github.com/dmnsgn/snowdev/compare/v1.10.4...v1.11.0) (2022-06-13)


### Features

* cache dependencies versions from package.json to allow install on change ([224e01c](https://github.com/dmnsgn/snowdev/commit/224e01caea9f2b943358d9e130b6b94dae023eaa))



## [1.10.4](https://github.com/dmnsgn/snowdev/compare/v1.10.3...v1.10.4) (2022-05-20)


### Bug Fixes

* include jsdoc.json file ([43b06da](https://github.com/dmnsgn/snowdev/commit/43b06da6ce4299e60caf7900a8f9a60c4feeb38e))



## [1.10.3](https://github.com/dmnsgn/snowdev/compare/v1.10.2...v1.10.3) (2022-05-05)


### Bug Fixes

* add .nojekyll to web_modules ([2e6528e](https://github.com/dmnsgn/snowdev/commit/2e6528ee856339ebc6b30e78a1944b0d6bf61c2a))



## [1.10.2](https://github.com/dmnsgn/snowdev/compare/v1.10.1...v1.10.2) (2022-04-13)


### Bug Fixes

* deploy push git command ([8241651](https://github.com/dmnsgn/snowdev/commit/82416516be907638bfc9a146e6f0b5bc15542621))



## [1.10.1](https://github.com/dmnsgn/snowdev/compare/v1.10.0...v1.10.1) (2022-04-02)


### Bug Fixes

* remove es-module-shims from babel exclude ([0611355](https://github.com/dmnsgn/snowdev/commit/06113556a115669dc980313793ba149a31b6b569))



# [1.10.0](https://github.com/dmnsgn/snowdev/compare/v1.9.0...v1.10.0) (2022-04-02)


### Bug Fixes

* correct babel exclude regex ([b0a8459](https://github.com/dmnsgn/snowdev/commit/b0a8459dd4b8052d4fba8af883f605200f46f8ed))


### Features

* alias core-js and babel-runtime ([e922343](https://github.com/dmnsgn/snowdev/commit/e922343a263ee9a54566c3fbbeeab4bad7ba4c3a))



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
