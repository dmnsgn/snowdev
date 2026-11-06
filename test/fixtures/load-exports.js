import { readFileSync, statSync } from "node:fs";
import { extname } from "node:path";

const { IMPORT_MAP_PATH } = process.env;
const { imports } = JSON.parse(readFileSync(IMPORT_MAP_PATH, "utf8"));
const isCopied = (specifier) =>
  extname(imports[specifier]) === ".css" &&
  statSync(new URL(imports[specifier], `file://${IMPORT_MAP_PATH}`), {
    throwIfNoEntry: false,
  })?.isFile();

const load = async (specifier) => await import(specifier);

const shapeMismatch = await load("shape-mismatch");
const cjsConsumer = await load("cjs-consumer");
const exportsMap = await load("exports-map");
const exportsMapFeature = await load("exports-map/feature");
const cjsNamed = await load("cjs-named");
const cjsFunction = await load("cjs-function");
const cjsEsModule = await load("cjs-esmodule");
const jsnext = await load("jsnext");
const esmConsumer = await load("esm-consumer");
const browserString = await load("browser-string");
const browserObject = await load("browser-object");
const directoryMain = await load("directory-main");
const esmOnly = await load("esm-only");
const patternIndex = await load("pattern-exports");
const patternPub = await load("pattern-exports/lib/pub");
const patternDeep = await load("pattern-exports/lib/nested/deep");
const patternSpecial = await load("pattern-exports/lib/special");
const patternRoot = await load("pattern-root/nested/file.js");
const arrayExports = await load("array-exports");
const assetDark = await load("asset-exports/theme/dark");
const dtsExports = await load("dts-exports");
const conditionExports = await load("condition-exports");
const browserModule = await load("browser-module");
const conditionConsumer = await load("condition-consumer");
const noMainConsumer = await load("no-main-consumer");
const events = await load("events");
const shebang = await load("shebang");
const shebangCjs = await load("shebang-cjs");
const cjsGlobal = await load("cjs-global");
const brokenExports = await load("broken-exports/good");
const brokenTransitive = await load("broken-transitive");
const brokenCjs = await load("broken-cjs");
const dualExports = await load("dual-exports");
const dualConsumer = await load("dual-consumer");
const requireConsumer = await load("require-consumer");
const brokenAssets = await load("broken-assets");
const patternMulti = await load("pattern-multi/icons/a");
const cjsDirname = await load("cjs-dirname");

console.log(
  JSON.stringify({
    shapeMismatch: shapeMismatch.default.from,
    cjsConsumer: { ...cjsConsumer.default },
    instances: globalThis.shapeMismatchInstances,
    exportsMap: exportsMap.from,
    exportsMapFeature: exportsMapFeature.feature,
    cjsNamed: [cjsNamed.a, cjsNamed.b, cjsNamed.default.a],
    cjsFunction: [cjsFunction.default(), cjsFunction.default.extra],
    cjsEsModule: [cjsEsModule.default, cjsEsModule.named],
    jsnext: jsnext.from,
    esmConsumer: esmConsumer.from,
    browserString: browserString.default.from,
    browserObject: browserObject.default.from,
    directoryMain: directoryMain.from,
    esmOnly: [esmOnly.default, esmOnly.named],
    pattern: [
      patternIndex.from,
      patternPub.from,
      patternDeep.from,
      patternSpecial.from,
      patternRoot.from,
    ],
    array: arrayExports.from,
    assets: [
      isCopied("asset-exports"),
      isCopied("asset-exports/theme"),
      assetDark.from,
    ],
    dts: dtsExports.from,
    conditions: [conditionExports.from, conditionConsumer.condition],
    conditionInstances: globalThis.conditionInstances,
    browserModule: [browserModule.from, conditionConsumer.browserModule],
    browserModuleInstances: globalThis.browserModuleInstances,
    noMain: noMainConsumer.from,
    events: events.from,
    shebang: [shebang.from, shebang.nextTick],
    shebangCjs: shebangCjs.from,
    cjsGlobal: [cjsGlobal.nextTick, cjsGlobal.browser],
    brokenExports: brokenExports.from,
    brokenTransitive: [brokenTransitive.from, brokenTransitive.valueType],
    brokenCjs: [brokenCjs.from, brokenCjs.valueType],
    dual: [dualExports.from, dualConsumer.from],
    brokenAssets: [brokenAssets.from, brokenAssets.dataKeys],
    patternMulti: patternMulti.from,
    requireBrowser: requireConsumer.browser,
    requireBrowserMap: requireConsumer.browserMap,
    requireMissingMain: requireConsumer.missingMain,
    cjsDirname: [cjsDirname.dirname, cjsDirname.filename],
    absent: [
      "pattern-exports/lib/private/secret",
      "array-exports/first.js",
      "dts-exports/types",
      "dts-exports/module-types",
      "dts-exports/commonjs-types",
      "broken-exports/bad",
      "pattern-multi/icons/mismatch",
    ].filter((specifier) => specifier in imports),
  }),
);
