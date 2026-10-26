import { promises as fs } from "node:fs";
import { isBuiltin } from "node:module";
import { join, extname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";
import {
  brotliCompressSync,
  constants as zlibConstants,
  gzipSync,
} from "node:zlib";

import deepmerge from "deepmerge";
import { valueFormatTableAsText } from "value-format-table";

import {
  console,
  RF_OPTIONS,
  escapeRegExp,
  formatFileList,
  isInside,
  readJson,
  resolveExports,
  resolveFiles,
  timed,
} from "./utils.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const lint = timed(async (cwd, files, options) => {
  try {
    const { ESLint } = await import("eslint");
    const { default: eslintConfig } = await import("./eslint.config.js");
    const baseConfig = [...eslintConfig, ...(options.eslint ?? [])];

    const babelEslint = baseConfig.find(
      ({ languageOptions }) =>
        languageOptions?.parser?.meta?.name === "@babel/eslint-parser",
    );

    if (babelEslint) {
      babelEslint.languageOptions.parserOptions.babelOptions = {
        cwd,
        ...options.babel,
        ...babelEslint.languageOptions.parserOptions.babelOptions,
      };
    }

    const fix = options.eslint?.fix;

    const eslint = new ESLint({
      cwd,
      ignorePatterns: options.ignore,
      baseConfig,
      overrideConfigFile: true,
      fix,
      // concurrency: "auto",
    });
    const lintResults = await eslint.lintFiles(files);
    if (fix) await ESLint.outputFixes(lintResults);
    const results = (await eslint.loadFormatter("stylish")).format(lintResults);

    if (results) console.log(lint.description, results);

    return results;
  } catch (error) {
    console.error(error);
  }
});
lint.description = `build — lint sources`;

// Bare specifiers name packages: not relative, absolute, subpath import, virtual or URL
const isBareSpecifier = (id) => !/^([./#\0]|[a-z]+:)/i.test(id);
const getPackageName = (specifier) =>
  specifier
    .split("/")
    .slice(0, specifier.startsWith("@") ? 2 : 1)
    .join("/");
const stripExtension = (file) =>
  file.slice(0, -extname(file).length || undefined);

// Loaded by their tool, not imported
const CONFIG_FILE = /\.config\.[cm]?[jt]s$/;

// Type only modules (TypeScript types, JSDoc typedefs) are erased before bundling
const hasRuntimeCode = async (file) => {
  const { parseAst } = await import("rolldown/parseAst");
  const lang = extname(file).slice(1).replace(/^[cm]/, "");
  const { body } = parseAst(await fs.readFile(file, "utf8"), { lang }, file);
  return body.some(
    (node) =>
      !node.type.startsWith("TS") &&
      node.importKind !== "type" &&
      node.exportKind !== "type" &&
      // "export {}"
      !(
        node.type === "ExportNamedDeclaration" &&
        !node.declaration &&
        !node.specifiers.length
      ),
  );
};

const formatSize = (bytes) => `${(bytes / 1000).toFixed(2)} kB`;
const measure = (code) => ({
  minified: formatSize(Buffer.byteLength(code)),
  gzip: formatSize(gzipSync(code, { level: 9 }).length),
  brotli: formatSize(
    brotliCompressSync(code, {
      params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 },
    }).length,
  ),
});

// TypeScript entries point to compiled "outDir" files: map them back to sources
const getSourceMapper = async (cwd, options) => {
  if (!options.ts) return (id) => id;

  const { default: ts } = await import("typescript");
  const configPath = ts.findConfigFile(cwd, ts.sys.fileExists, "tsconfig.json");
  const config = configPath
    ? ts.readConfigFile(configPath, ts.sys.readFile).config
    : options.tsconfig;
  const { outDir, rootDir = cwd } = ts.parseJsonConfigFileContent(
    config,
    ts.sys,
    cwd,
  ).options;

  return (id) =>
    outDir && isInside(outDir, id) ? join(rootDir, relative(outDir, id)) : id;
};

const analyse = timed(async (cwd, files, options, { sizes = true } = {}) => {
  let results;
  try {
    const { rolldown } = await import("rolldown");
    const pkg = await readJson(join(cwd, "package.json"));

    // Analysed as published: consumers only reach exports and binaries
    const input = [
      ...Object.values(await resolveExports(options, cwd)),
      ...[pkg.bin ?? []].flatMap((bin) =>
        typeof bin === "string" ? bin : Object.values(bin),
      ),
    ]
      .filter(Boolean)
      .map((entry) => join(cwd, entry));
    if (!input.length) return;

    const createBundle = (inputOptions) =>
      rolldown({
        cwd,
        input,
        platform: "browser",
        logLevel: "silent",
        ...inputOptions,
      });
    // Whole package: chunks shared between entries are counted once
    const bundleSize = async (bundle) => {
      try {
        const { output } = await bundle.generate({ minify: true });
        return measure(
          output
            .filter(({ type }) => type === "chunk")
            .map(({ code }) => code)
            .join("\n"),
        );
      } finally {
        await bundle.close();
      }
    };

    const importedPackages = new Set();
    let moduleIds = [];

    const packageBundle = await createBundle({
      external: (id) => {
        if (isBuiltin(id)) return true;
        if (!isBareSpecifier(id)) return false;
        importedPackages.add(getPackageName(id));
        return true;
      },
      plugins: [
        {
          name: "snowdev-analyse",
          buildEnd() {
            moduleIds = [...this.getModuleIds()];
          },
        },
      ],
    });
    // Rolldown builds the module graph lazily on generate
    const sizesRows = [
      { dependencies: "external", ...(await bundleSize(packageBundle)) },
    ];

    const toSource = await getSourceMapper(cwd, options);
    const reached = new Set(
      moduleIds.map((id) => stripExtension(toSource(id))),
    );

    const unusedDependencies = Object.keys({
      ...pkg.dependencies,
      ...pkg.peerDependencies,
    }).filter((name) => !importedPackages.has(name));
    const unreachedFiles = files.filter(
      (file) => !CONFIG_FILE.test(file) && !reached.has(stripExtension(file)),
    );
    const runtimeFiles = await Promise.all(unreachedFiles.map(hasRuntimeCode));
    const unusedFiles = unreachedFiles
      .filter((_, index) => runtimeFiles[index])
      .map((file) => relative(cwd, file));

    const issues = [
      unusedDependencies.length &&
        `Unused dependencies:${formatFileList(unusedDependencies)}`,
      unusedFiles.length && `Unused files:${formatFileList(unusedFiles)}`,
    ].filter(Boolean);

    if (issues.length) {
      results = issues.join("\n");
      console.warn(`${analyse.description}\n${results}`);
    }

    if (!sizes) return results;

    try {
      sizesRows.push({
        dependencies: "bundled",
        ...(await bundleSize(
          await createBundle({ external: (id) => isBuiltin(id) }),
        )),
      });
    } catch (error) {
      // Dependencies can be unbundlable (native addons, Node.js only code)
      const [summary, firstError] = stripVTControlCharacters(error.message)
        .split("\n")
        .filter((line) => line.trim());
      console.warn(
        `${analyse.description} — sizes with bundled dependencies skipped\n${summary}\n${firstError}`,
      );
    }
    const sizesTable = valueFormatTableAsText(sizesRows, {
      columns: [{}, { align: "right" }, { align: "right" }, { align: "right" }],
    });
    console.info(`${analyse.description} — sizes\n${sizesTable}`);
  } catch (error) {
    console.error(error);
  }

  return results;
});
analyse.description = `build — analyse package`;

const format = timed(async (cwd, files, options) => {
  const prettier = await import("prettier");
  const { default: sortPackageJson } = await import("sort-package-json");
  const { default: prettierConfig } = await import("./prettier.config.js");
  const config = deepmerge(prettierConfig, options.prettier ?? {}, {
    clone: false,
  });

  for (const file of files) {
    try {
      await fs.writeFile(
        file,
        await prettier.format(await fs.readFile(file, "utf8"), {
          parser: options.ts ? "typescript" : "babel",
          ...(await prettier.resolveConfig(file)),
          ...config,
        }),
        "utf8",
      );
    } catch (error) {
      console.error(error);
    }
  }

  try {
    const packageJsonFile = join(cwd, "package.json");
    await fs.writeFile(
      packageJsonFile,
      sortPackageJson(await fs.readFile(packageJsonFile, "utf8")),
      "utf8",
    );
  } catch (error) {
    console.error(error);
  }
});
format.description = `build — format sources`;

const getJsdocConfig = (options) =>
  options.jsdoc || join(__dirname, "jsdoc.json");

const formatJsdocError = (error) => {
  const seen = new Set();
  return error.message
    .split("\n")
    .map((line) => line.replace(/: Expected .*? found\.$/, ""))
    .filter((line) => {
      const key = line.replace(/ in line \d+ /, " ");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join("\n");
};

const checkDocs = timed(async (cwd, files, options) => {
  let results;
  try {
    const { default: jsdoc } = await import("jsdoc-api");
    await jsdoc.explain({ files, configure: getJsdocConfig(options) });
  } catch (error) {
    results = formatJsdocError(error);
    console.error(`${checkDocs.description}\n`, results);
  }

  return results;
});
checkDocs.description = `build — check docs`;

const docs = timed(async (cwd, files, options) => {
  const isFile = !!extname(options.docs);
  const docsFolder = isFile ? ".temp_docs" : options.docs;
  const isMarkdown = options.docsFormat === "md";

  let inlinedDocs;

  if (options.ts) {
    try {
      const { default: ts } = await import("typescript");
      const TypeDoc = await import("typedoc");
      const { default: concatMd } = await import("concat-md");

      await fs.rm(join(cwd, docsFolder), RF_OPTIONS);
      await fs.mkdir(join(cwd, docsFolder), { recursive: true });

      const app = await TypeDoc.Application.bootstrapWithPlugins(
        {
          entryPoints: files,
          exclude: options.ignore,
          logLevel: "Info",
          ...(isMarkdown
            ? {
                readme: "none",
                plugin: ["typedoc-plugin-markdown"],
                hideBreadcrumbs: true,
              }
            : {
                plugin: ["typedoc-material-theme"],
              }),
          ...options.typedoc,
        },
        [
          new TypeDoc.TSConfigReader(),
          new TypeDoc.PackageJsonReader(),
          new TypeDoc.TypeDocReader(),
        ],
      );
      app.logger.info = console.info;
      const configPath = ts.findConfigFile(
        cwd,
        ts.sys.fileExists,
        "tsconfig.json",
      );
      if (!configPath) {
        app.options.setCompilerOptions(
          files.flat(),
          options.tsconfig.compilerOptions,
        );
      }

      // Ignore errors in dependencies
      app.options._compilerOptions.skipLibCheck = true;

      const project = await app.convert();

      if (project) await app.generateDocs(project, docsFolder);
      await fs.writeFile(join(cwd, docsFolder, ".nojekyll"), "", "utf8");

      if (isMarkdown && isFile) {
        inlinedDocs = await concatMd.default(join(cwd, docsFolder));
      }
    } catch (error) {
      console.error(error);
    }
  } else {
    try {
      if (isMarkdown) {
        const { default: jsdoc2md } = await import("jsdoc-to-markdown");
        inlinedDocs = await jsdoc2md.render({
          files,
          configure: getJsdocConfig(options),
          ...options.jsdoc2md,
        });
        // TODO: remove if jsdoc ever properly works with ESM and classes
        inlinedDocs = inlinedDocs.replaceAll("new exports.", "new ");
        if (!isFile) {
          await fs.mkdir(join(cwd, docsFolder), { recursive: true });
          await fs.writeFile(
            join(cwd, docsFolder, "README.md"),
            inlinedDocs,
            "utf8",
          );
          return;
        }
      } else {
        const { default: jsdoc } = await import("jsdoc-api");
        await jsdoc.render({
          files,
          configure: getJsdocConfig(options),
          destination: join(cwd, docsFolder),
        });
        if (isFile) {
          console.error("build — Output html to a file not supported.");
          return;
        }
      }
    } catch (error) {
      console.error(
        error.name === "JSDOC_ERROR" ? formatJsdocError(error) : error,
      );
      return;
    }
  }

  if (!isFile) return;

  await fs.rm(join(cwd, docsFolder), RF_OPTIONS);

  const prettier = await import("prettier");
  const filePath = join(cwd, options.docs);
  const formattedDocs = (
    await prettier.format(inlinedDocs, {
      parser: isMarkdown ? "markdown" : "html",
      ...(await prettier.resolveConfig(filePath)),
    })
  )
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");

  if (options.docsStart && options.docsEnd) {
    await fs.writeFile(
      filePath,
      (await fs.readFile(filePath, "utf8")).replace(
        new RegExp(
          String.raw`${escapeRegExp(options.docsStart)}([\s\S]*?)${escapeRegExp(
            options.docsEnd,
          )}`,
        ),
        `${options.docsStart}\n\n${formattedDocs}\n${options.docsEnd}`,
      ),
      "utf8",
    );
  } else {
    await fs.writeFile(filePath, formattedDocs, "utf8");
  }
});
docs.description = `build — update docs`;

const types = timed(async (cwd, files, options, watch) => {
  try {
    const { default: ts } = await import("typescript");

    const configPath = ts.findConfigFile(
      cwd,
      ts.sys.fileExists,
      "tsconfig.json",
    );

    // Ordered by severity: the most severe category present picks the console method
    const consoleMethods = [
      [ts.DiagnosticCategory.Error, "error"],
      [ts.DiagnosticCategory.Warning, "warn"],
      [ts.DiagnosticCategory.Suggestion, "info"],
      [ts.DiagnosticCategory.Message, "log"],
    ];

    const formatHost = {
      getCanonicalFileName: (path) => path,
      getCurrentDirectory: ts.sys.getCurrentDirectory,
      getNewLine: () => ts.sys.newLine,
    };

    const CODE_FRAME_LINE = /^\s*\u{1B}\[7m/u; // eslint-disable-line no-control-regex

    const reportDiagnostics = (diagnostics) => {
      if (!diagnostics.length) return;

      const sorted = ts.sortAndDeduplicateDiagnostics(diagnostics);
      const [, consoleMethod] = consoleMethods.find(([category]) =>
        sorted.some((diagnostic) => diagnostic.category === category),
      );

      // tsc --pretty without code frames
      const results = ts
        .formatDiagnosticsWithColorAndContext(sorted, formatHost)
        .split(ts.sys.newLine)
        .filter((line) => line.trim() && !CODE_FRAME_LINE.test(line))
        .join("\n");

      console[consoleMethod](`${types.description}\n${results}`);

      if (typeof watch === "function") watch(stripVTControlCharacters(results));
    };

    if (watch) {
      let diagnostics = [];

      const reportWatchStatus = ts.createWatchStatusReporter(
        { ...ts.sys, write: (output) => console.info(output.trimEnd()) },
        true,
      );

      ts.createWatchProgram(
        ts.createWatchCompilerHost(
          configPath,
          { preserveWatchOutput: true },
          ts.sys,
          ts.createEmitAndSemanticDiagnosticsBuilderProgram,
          (diagnostic) => diagnostics.push(diagnostic),
          (diagnostic, newLine, options, errorCount) => {
            if (errorCount !== undefined) {
              reportDiagnostics(diagnostics);
              diagnostics = [];
            }
            reportWatchStatus(diagnostic, newLine, options);
          },
        ),
      );
    } else {
      const config = configPath
        ? ts.readConfigFile(configPath, ts.sys.readFile).config
        : options.tsconfig;

      if (!configPath) config.include = files;

      if (config.compilerOptions.declarationDir) {
        await fs.rm(
          join(cwd, config.compilerOptions.declarationDir),
          RF_OPTIONS,
        );
      }
      if (config.compilerOptions.outDir) {
        await fs.rm(join(cwd, config.compilerOptions.outDir), RF_OPTIONS);
      }

      const parsedCommandLine = ts.parseJsonConfigFileContent(
        config,
        ts.sys,
        cwd,
      );
      const program = ts.createProgram({
        options: parsedCommandLine.options,
        rootNames: parsedCommandLine.fileNames,
        configFileParsingDiagnostics: parsedCommandLine.errors,
      });

      const { diagnostics, emitSkipped } = program.emit();
      const allDiagnostics = ts
        .getPreEmitDiagnostics(program)
        .concat(diagnostics, parsedCommandLine.errors);

      reportDiagnostics(allDiagnostics);

      if (emitSkipped) console.error("build — Emit skipped.");
    }
  } catch (error) {
    console.error(error);
  }
});
types.description = `build — run TypeScript (generate types, watch or compile)`;

const build = async (options) => {
  const cwd = options.cwd;
  const files = await resolveFiles(cwd, options);

  console.log(`build — files:${formatFileList(files)}`);

  if (options.format) await format(cwd, files, options);
  await Promise.all(
    [
      options.types ? types(cwd, files, options) : 0,
      options.docs ? docs(cwd, files, options) : 0,
    ].filter(Boolean),
  );
  if (options.analyse) await analyse(cwd, files, options);
  if (options.lint) await lint(cwd, files, options);
};

export { types, docs, lint, analyse, format, checkDocs };

export default build;
