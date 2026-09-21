import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import {
  dirname,
  extname,
  isAbsolute,
  join,
  parse,
  relative,
  resolve,
} from "node:path";
import { fileURLToPath } from "node:url";

import console from "console-ansi";
import deepmerge from "deepmerge";
import slash from "slash";
import { createFilter } from "@rollup/pluginutils";

import {
  RF_OPTIONS,
  resolveExports,
  resolveBrowserIgnores,
  pathExists,
  realpathSafe,
  isInside,
  statFiles,
  compareStats,
  VERSION,
  listFormatter,
  arrayDifference,
  dotRelativeToBarePath,
  bareToDotRelativePath,
  pick,
  hashObject,
  readJson,
  writeJson,
} from "./utils.js";

import npm from "./npm.js";
import bundle from "./bundle.js";

const require = createRequire(import.meta.url);
const __dirname = fileURLToPath(new URL(".", import.meta.url));

const DEPENDENCY_TYPES = Object.freeze({
  ALL: "all",
  DEV: "dev",
  PROD: "prod",
  CUSTOM: "custom",
});

const DEPENDENCY_SAVE_TYPE_MAP = {
  [DEPENDENCY_TYPES.ALL]: ["prod", "dev"],
  [DEPENDENCY_TYPES.DEV]: ["dev"],
  [DEPENDENCY_TYPES.PROD]: ["prod"],
  [DEPENDENCY_TYPES.CUSTOM]: [],
};

// realpath catches "npm link"/workspaces, resolved catches git/tarball deps
// re-fetched at the same version
const DEPENDENCY_FIELDS = ["name", "version", "realpath", "resolved"];

const getDependencies = async (options, type, names = []) => {
  const depsSelector =
    type === DEPENDENCY_TYPES.CUSTOM
      ? "*"
      : `*:is(${DEPENDENCY_SAVE_TYPE_MAP[type]
          .map((selector) => `.${selector}`)
          .join(",")})`;

  return JSON.parse(
    await npm.run(options.cwd, "query", [`':scope > ${depsSelector}'`]),
  )
    .map((dependency) => pick(dependency, DEPENDENCY_FIELDS))
    .filter(({ name }) => (names.length ? names.includes(name) : true));
};

const compareDependencies = (a, b) =>
  DEPENDENCY_FIELDS.every((key) => a[key] === b[key]);

// Options affecting the bundled output without any package.json change.
// "dependencies" is diffed separately to report which ones changed.
const OUTPUT_OPTIONS = [
  "resolve",
  "importMap",
  "transpiler",
  "transpileExclude",
  "bundler",
  "targets",
  "NODE_ENV",
  "minify",
  "babel",
  "esbuild",
  "swc",
  "rollup",
  "rolldown",
];

const hashOptions = (options) => hashObject(pick(options, OUTPUT_OPTIONS));

// Bundled files outside node_modules (npm link, "file:" deps, workspaces) have
// no version/resolved to compare so their stats are tracked instead.
const getLinkedFiles = async (options, watchFiles = []) => {
  const nodeModules = await Promise.all(
    [options.cwd, __dirname].map((directory) =>
      realpathSafe(join(directory, "node_modules")),
    ),
  );

  return watchFiles.filter(
    (file) =>
      isAbsolute(file) &&
      nodeModules.every((directory) => !isInside(directory, file)),
  );
};

const getInstallReason = async (
  options,
  cache,
  { outputDir, type, optionsHash, dependencies, dependenciesHardcoded },
) => {
  if (options.force) return "force install";
  if (options.cache === false) return "cache disabled";
  if (!(await pathExists(outputDir))) return "initial installation";
  if (!cache) return "no dependencies cached";
  if (type !== cache.type) return "dependency type changed";
  if (VERSION !== cache.version) return "snowdev version changed";
  // Calling install from CLI will always force install
  if (options.caller === "cli" && options.command === "install") {
    return "from cli";
  }
  if (optionsHash !== cache.options) return "options changed";

  const changedDependencies = [
    ...new Set(
      arrayDifference(
        dependencies,
        cache.dependencies ?? [],
        compareDependencies,
      )
        .map(({ name }) => name)
        .concat(
          arrayDifference(
            dependenciesHardcoded,
            cache.dependenciesHardcoded ?? [],
          ),
        ),
    ),
  ];
  if (changedDependencies.length) {
    return `dependencies changed: ${listFormatter.format(changedDependencies)}`;
  }

  const cachedFiles = cache.files ?? {};
  const files = await statFiles(Object.keys(cachedFiles));
  const changedFiles = Object.keys(cachedFiles).filter(
    (file) => !compareStats(cachedFiles[file], files[file]),
  );
  if (changedFiles.length) {
    return `linked files changed: ${listFormatter.format(changedFiles)}`;
  }

  return null;
};

const install = async (options) => {
  // Check package.json exists
  let currentPackage;
  try {
    currentPackage = await readJson(join(options.cwd, "package.json"));
  } catch (error) {
    console.error(`install - error reading package.json\n`, error);
    return { error };
  }

  // Check dependencies
  try {
    const selectors = ["missing", "invalid", "extraneous"];

    for (let selector of selectors) {
      const results = JSON.parse(
        await npm.run(options.cwd, "query", [`':${selector}'`]),
      );
      if (results.length) {
        console.warn(
          `install - ${selector} dependencies: ${listFormatter.format(results.map(({ pkgid }) => pkgid))}`,
        );
      }
    }
  } catch (error) {
    // This is only a warning. Don't throw if anything unexpected happen.
  }

  // Get install type: an array of custom dependencies or one of DEPENDENCY_TYPES values
  const type = Array.isArray(options.dependencies)
    ? DEPENDENCY_TYPES.CUSTOM
    : options.dependencies;

  // Resolve cache and output paths
  await fs.mkdir(options.cacheFolder, { recursive: true });

  const dependenciesCacheFile = join(options.cacheFolder, "dependencies.json");
  const outputDir = isAbsolute(options.rollup.output.dir)
    ? options.rollup.output.dir
    : join(options.cwd, options.rollup.output.dir);
  const importMapFile = join(outputDir, "import-map.json");

  // Get current dependencies
  const dependencies =
    type === DEPENDENCY_TYPES.CUSTOM && !options.dependencies.length
      ? []
      : await getDependencies(
          options,
          type,
          type === DEPENDENCY_TYPES.CUSTOM ? options.dependencies : [],
        );

  const dependenciesNames = dependencies.map(({ name }) => name);

  const dependenciesHardcoded =
    type === DEPENDENCY_TYPES.CUSTOM
      ? options.dependencies.filter((name) => !dependenciesNames.includes(name))
      : [];

  let cache;
  try {
    cache = await readJson(dependenciesCacheFile);
  } catch {
    cache = null;
  }

  const optionsHash = hashOptions(options);

  const reason = await getInstallReason(options, cache, {
    outputDir,
    type,
    optionsHash,
    dependencies,
    dependenciesHardcoded,
  });

  if (!reason) {
    console.log("install - all dependencies installed.");

    return {
      importMap: deepmerge(await readJson(importMapFile), options.importMap),
      linkedFiles: Object.keys(cache.files ?? {}),
    };
  }

  console.info(`install - ${reason}.`);

  // Remove output to empty it or bundle in it
  try {
    await fs.rm(outputDir, RF_OPTIONS);
    await fs.mkdir(outputDir, { recursive: true });
  } catch (error) {
    console.error(`install - error removing output directory\n`, error);
    return { error };
  }

  const installTargets = dependenciesNames.concat(dependenciesHardcoded);

  if (installTargets.length === 0) {
    await writeJson(dependenciesCacheFile, {
      version: VERSION,
      type,
      options: optionsHash,
      dependencies: [],
      dependenciesHardcoded: [],
      files: {},
    });

    console.warn(`No ESM dependencies to install. Set "options.dependencies".`);
    return { importMap: options.importMap, linkedFiles: [] };
  }

  // Add the current package itself
  if (
    type === DEPENDENCY_TYPES.ALL &&
    currentPackage.name &&
    !dependenciesNames.includes(currentPackage.name)
  ) {
    dependenciesNames.push(currentPackage.name);
  }

  const label = `install`;
  console.time(label);

  console.info(
    `install - ESM dependencies: ${listFormatter.format(installTargets)}`,
  );

  let result;
  let input = {};
  let importMap = { imports: {} };
  let copies = {};
  let linkedFiles = [];

  const filter = createFilter(
    options.resolve.include,
    options.resolve.exclude,
    { resolve: options.cwd },
  );
  const copyFilter = createFilter(
    options.resolve.copy,
    options.resolve.exclude,
    { resolve: options.cwd },
  );

  const packageTargets = dependenciesNames.filter(
    (target) => target !== "snowdev",
  );

  // Harcoded dependency can be:
  // - a package listed in package.json
  // - a relative file path
  // - a package inside a package to be added as target
  // - a file inside a package to be added as target
  // - no relative folder support (use "local-dep-name": "file:./path-to-local-dep" in pacakge.json instead)
  // - no absolute path support (what would the import map be?)
  await Promise.allSettled(
    dependenciesHardcoded.map(async (dependency) => {
      try {
        if (parse(dependency).ext) {
          const isRelative = dependency.startsWith(".");

          const resolvedExport = isRelative
            ? resolve(options.cwd, dependency)
            : require.resolve(dependency, { paths: [options.cwd] });

          if (!filter(resolvedExport)) {
            console.info(`Filtered out export: ${resolvedExport}`);
          } else {
            const id = isRelative
              ? dotRelativeToBarePath(dependency)
              : dependency;

            const isCopiedExport = copyFilter(resolvedExport);

            if (isCopiedExport) {
              copies[resolvedExport] = join(outputDir, id);
            } else {
              // TODO: why not resolvedExport?
              input[id] = dependency;
            }

            importMap.imports[id] = isRelative
              ? dependency
              : bareToDotRelativePath(dependency);
          }
        } else {
          packageTargets.push(dependency);
        }
      } catch (error) {
        console.error(error);
      }
    }),
  );

  try {
    console.log(
      `install - installing (${options.bundler === "rolldown" ? "oxc" : options.transpiler})...`,
    );

    const dependenciesPath = Object.fromEntries(
      packageTargets.map((target) => {
        if (target === currentPackage.name) return [target, options.cwd];

        let dependencyPath = dependencies.find(
          ({ name }) => name === target,
        )?.realpath;

        if (!dependencyPath) {
          const parent = target
            .split("/")
            .slice(0, target.startsWith("@") ? 2 : 1)
            .join("/");
          const parentRealPath = dependencies.find(
            ({ name }) => name === parent,
          )?.realpath;

          if (parentRealPath) {
            dependencyPath = join(
              parentRealPath.slice(0, parentRealPath.lastIndexOf(parent)),
              target,
            );
          }
        }

        return [target, dependencyPath];
      }),
    );

    const resolvedExportsMap = deepmerge(
      Object.fromEntries(
        await Promise.all(
          packageTargets.map(async (dependency) => [
            dependency,
            await resolveExports(options, dependenciesPath[dependency]),
          ]),
        ),
      ),
      options.resolve.overrides,
    );

    // TODO: parallelize
    for (let [dependency, entryPoints] of Object.entries(resolvedExportsMap)) {
      const dependencyPath = dependenciesPath[dependency];
      const isCurrentPackage = dependency === currentPackage.name;

      if (!(await pathExists(dependencyPath))) {
        console.error(`Unresolved dependency: is "${dependency}" installed?`);
        continue;
      }

      for (let [specifier, entryPoint] of Object.entries(entryPoints)) {
        const isMain = specifier === ".";
        const id = isMain ? dependency : slash(join(dependency, specifier));

        if (!entryPoint) {
          console.error(
            `Unresolved export: "${dependency}" "${specifier}": is "${dependency}" installed or not exporting anything?`,
          );
          continue;
        }

        try {
          const resolvedExport = join(dependencyPath, entryPoint);

          if (!filter(resolvedExport)) {
            console.info(`Filtered out export: ${resolvedExport}`);
            continue;
          }

          if (!(await pathExists(resolvedExport))) {
            console.error(`Unknown export: ${resolvedExport}`);
            continue;
          }

          if (isCurrentPackage) {
            const relativeExport = slash(relative(outputDir, resolvedExport));
            importMap.imports[id] = relativeExport.startsWith(".")
              ? relativeExport
              : `./${relativeExport}`;
            continue;
          }

          const isCopiedExport = copyFilter(resolvedExport);

          if (isCopiedExport) {
            copies[resolvedExport] = join(outputDir, id);
          } else {
            input[id] = resolvedExport;
          }
          importMap.imports[id] = bareToDotRelativePath(
            isCopiedExport
              ? id
              : packageTargets.includes(id) || extname(id) !== ".js"
                ? `${id}.js`
                : id,
          );
        } catch (error) {
          console.error(error);
        }
      }
    }

    let noOpIds = [];
    if (options.resolve.browserField) {
      const resolvedBrowserIgnores = Object.fromEntries(
        await Promise.all(
          packageTargets.map(async (dependency) => [
            dependency,
            await resolveBrowserIgnores(options, dependenciesPath[dependency]),
          ]),
        ),
      );

      for (let [dependency, entryPoints] of Object.entries(
        resolvedBrowserIgnores,
      )) {
        const dependencyPath = dependenciesPath[dependency];
        for (let specifier of Object.keys(entryPoints)) {
          try {
            const resolvedIgnore = slash(join(dependencyPath, specifier));

            if (!(await pathExists(resolvedIgnore))) {
              console.warn(`Unresolved browser ignore: "${resolvedIgnore}"`);
              continue;
            }

            noOpIds.push(resolvedIgnore);
          } catch (error) {
            console.error(error);
          }
        }
      }
    }

    // Caveats: this will throw if all dependencies are filtered out/have unknown exports
    if (!Object.values(input).length) {
      throw new Error(`No input dependency to install.`);
    }

    // Bundle
    const bundleOptions = { ...options };
    bundleOptions.rollup = {
      ...options.rollup,
      input: { ...options.rollup.input, input },
      output: {
        ...options.rollup.output,
        entryFileNames: ({ name }) =>
          packageTargets.includes(name) || extname(name) !== ".js"
            ? `${name}.js`
            : name,
      },
    };

    if (noOpIds.length) {
      bundleOptions.rollup = deepmerge(bundleOptions.rollup, {
        pluginsOptions: { noOp: { ids: noOpIds } },
      });
    }

    result = await bundle(bundleOptions);
    linkedFiles = await getLinkedFiles(options, result.watchFiles);

    await Promise.allSettled(
      Object.entries(copies).map(async ([resolvedExport, copyDestination]) => {
        try {
          await fs.mkdir(dirname(copyDestination), { recursive: true });
          await fs.copyFile(resolvedExport, copyDestination);
        } catch (error) {
          console.error(error);
        }
      }),
    );

    if (!result.error) {
      // Write import map
      importMap = deepmerge(importMap, options.importMap);
      await writeJson(importMapFile, importMap);

      if (options.caller === "cli") {
        await fs.writeFile(join(options.cwd, ".nojekyll"), "", "utf-8");
      }

      // Write cache
      await writeJson(dependenciesCacheFile, {
        version: VERSION,
        type,
        options: optionsHash,
        dependencies,
        dependenciesHardcoded,
        files: await statFiles(linkedFiles),
      });

      console.log("install - complete.");
    }
  } catch (error) {
    console.error(error);
    result = { error };
  }
  console.timeEnd(label);

  return { ...result, input, importMap, linkedFiles };
};
install.description = `Install ESM dependencies.`;

export default install;
