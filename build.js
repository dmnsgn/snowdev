import { promises as fs } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

import console from "console-ansi";

import ts from "typescript";

import * as prettier from "prettier";
import sortPackageJson from "sort-package-json";

import { ESLint } from "eslint";

import jsdoc from "jsdoc-api";
import jsdoc2md from "jsdoc-to-markdown";
import * as TypeDoc from "typedoc";
import concatMd from "concat-md";

import { RF_OPTIONS, escapeRegExp, resolveFiles } from "./utils.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const lint = async (cwd, files, options) => {
  console.time(lint.description);

  try {
    const babelEslint = options.eslint?.find(
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
      baseConfig: options.eslint,
      overrideConfigFile: true,
      fix,
      // concurrency: "auto",
    });
    const lintResults = await eslint.lintFiles(files);
    if (fix) await ESLint.outputFixes(lintResults);
    const results = (await eslint.loadFormatter("stylish")).format(lintResults);

    if (results) console.log(lint.description, results);
    console.timeEnd(lint.description);

    return results;
  } catch (error) {
    console.error(error);
  }
  console.timeEnd(lint.description);
};
lint.description = `build: lint sources`;

const format = async (cwd, files, options) => {
  console.time(format.description);
  for (const file of files) {
    try {
      await fs.writeFile(
        file,
        await prettier.format(await fs.readFile(file, "utf8"), {
          parser: options.ts ? "typescript" : "babel",
          ...(await prettier.resolveConfig(file)),
          ...options.prettier,
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

  console.timeEnd(format.description);
};
format.description = `build: format sources`;

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

const checkDocs = async (cwd, files, options) => {
  console.time(checkDocs.description);

  let results;
  try {
    await jsdoc.explain({ files, configure: getJsdocConfig(options) });
  } catch (error) {
    results = formatJsdocError(error);
    console.error(checkDocs.description, results);
  }

  console.timeEnd(checkDocs.description);

  return results;
};
checkDocs.description = `build: check docs`;

const docs = async (cwd, files, options) => {
  console.time(docs.description);

  const isFile = !!extname(options.docs);
  const docsFolder = isFile ? ".temp_docs" : options.docs;
  const isMarkdown = options.docsFormat === "md";

  let inlinedDocs;

  if (options.ts) {
    try {
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
        await jsdoc.render({
          files,
          configure: getJsdocConfig(options),
          destination: join(cwd, docsFolder),
        });
        if (isFile) {
          console.error("Output html to a file not supported.");
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

  if (isFile) {
    await fs.rm(join(cwd, docsFolder), RF_OPTIONS);

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
  }

  console.timeEnd(docs.description);
};
docs.description = `build: update docs`;

const types = async (cwd, files, options, watch) => {
  console.time(types.description);

  try {
    const diagnosticToConsoleMethod = {
      [ts.DiagnosticCategory["Message"]]: "log",
      [ts.DiagnosticCategory["Suggestion"]]: "info",
      [ts.DiagnosticCategory["Warning"]]: "warn",
      [ts.DiagnosticCategory["Error"]]: "error",
    };

    const logDiagnostic = (diagnostic) => {
      const { line, character } = diagnostic.file
        ? ts.getLineAndCharacterOfPosition(diagnostic.file, diagnostic.start)
        : { line: 0, character: 0 };
      const results = `TypeScript\n${diagnostic.file?.fileName} (${line + 1}, ${
        character + 1
      }): ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`;

      const consoleMethod =
        diagnosticToConsoleMethod[diagnostic.category] || "log";

      console[consoleMethod](results);

      if (typeof watch === "function") {
        watch(`${diagnostic.file.path}\n${results}`);
      }
    };

    const configPath = ts.findConfigFile(
      cwd,
      ts.sys.fileExists,
      "tsconfig.json",
    );

    const formatHost = {
      getCanonicalFileName: (path) => path,
      getCurrentDirectory: ts.sys.getCurrentDirectory,
      getNewLine: () => ts.sys.newLine,
    };

    if (watch) {
      ts.createWatchProgram(
        ts.createWatchCompilerHost(
          configPath,
          {},
          // config.compilerOptions,
          ts.sys,
          ts.createEmitAndSemanticDiagnosticsBuilderProgram,
          logDiagnostic,
          function (diagnostic) {
            console.info(ts.formatDiagnostic(diagnostic, formatHost));
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

      allDiagnostics.forEach(logDiagnostic);

      if (emitSkipped) console.error("Emit skipped.");
    }
  } catch (error) {
    console.error(error);
  }
  console.timeEnd(types.description);
};
types.description = `build: run TypeScript (generate types, watch or compile)`;

const build = async (options) => {
  const cwd = options.cwd;
  const files = await resolveFiles(cwd, options);

  console.log(`build files:\n- ${files.join("\n- ")}`);

  if (options.format) await format(cwd, files, options);
  await Promise.all(
    [
      options.types ? types(cwd, files, options) : 0,
      options.docs ? docs(cwd, files, options) : 0,
    ].filter(Boolean),
  );
  if (options.lint) await lint(cwd, files, options);
};
build.description = `Lint and Format sources, run TypeScript, update README API.`;

export { types, lint, checkDocs };

export default build;
