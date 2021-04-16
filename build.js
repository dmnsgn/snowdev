import { promises as fs } from "fs";
import { join, extname } from "path";
import { fileURLToPath } from "url";

import console from "console-ansi";

import ts from "typescript";

import prettier from "prettier";
import sortPackageJson from "sort-package-json";

import { ESLint } from "eslint";

import jsdoc from "jsdoc-api";
import jsdoc2md from "jsdoc-to-markdown";
import TypeDoc from "typedoc";
import concatMd from "concat-md";

import { glob, rimraf, escapeRegExp } from "./utils.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const lint = async (cwd, files, options) => {
  console.time(lint.description);

  try {
    options.eslint.parserOptions.babelOptions = {
      cwd,
      ...(options.babel || {}),
      ...(options.eslint.parserOptions.babelOptions || {}),
    };

    const eslint = new ESLint({
      cwd,
      baseConfig: options.eslint,
      resolvePluginsRelativeTo: __dirname,
    });
    const lintResults = await eslint.lintFiles(files);
    const results = (await eslint.loadFormatter("stylish")).format(lintResults);

    if (results) console.error(results);
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
        prettier.format(await fs.readFile(file, "utf-8"), {
          parser: options.ts ? "typescript" : "babel",
          ...((await prettier.resolveConfig(file)) || {}),
          ...(options.prettier || {}),
        }),
        "utf-8"
      );
    } catch (error) {
      console.error(error);
    }
  }

  try {
    const packageJsonFile = join(options.cwd, "package.json");
    await fs.writeFile(
      packageJsonFile,
      sortPackageJson(await fs.readFile(packageJsonFile, "utf-8")),
      "utf-8"
    );
  } catch (error) {
    console.error(error);
  }

  console.timeEnd(format.description);
};
format.description = `build: format sources`;

const docs = async (cwd, files, options) => {
  console.time(docs.description);

  const isFile = !!extname(options.docs);
  const docsFolder = isFile ? ".temp_docs" : options.docs;
  const isMarkdown = options.docsFormat === "md";

  let inlinedDocs;

  if (options.ts) {
    try {
      await rimraf(join(cwd, docsFolder));

      const app = new TypeDoc.Application();
      app.options.addReader(new TypeDoc.TSConfigReader());
      app.options.addReader(new TypeDoc.TypeDocReader());

      app.bootstrap({
        entryPoints: files,
        exclude: options.ignore,
        logger: console,
        ...(isMarkdown
          ? {
              readme: "none",
              plugin: "typedoc-plugin-markdown",
              hideInPageTOC: true,
              hideBreadcrumbs: true,
            }
          : {}),
        ...(options.typedoc || {}),
      });
      const configPath = ts.findConfigFile(
        cwd,
        ts.sys.fileExists,
        "tsconfig.json"
      );
      if (!configPath) {
        app.options.setCompilerOptions(
          files.flat(),
          options.tsconfig.compilerOptions
        );
      }

      const project = app.convert();
      if (project) await app.generateDocs(project, docsFolder);
      await fs.writeFile(join(cwd, docsFolder, ".nojekyll"), "", "utf-8");

      if (isMarkdown && isFile) {
        inlinedDocs = await concatMd.default(join(cwd, docsFolder));
      }
    } catch (error) {
      console.error(error);
    }
  } else {
    if (isMarkdown) {
      inlinedDocs = await jsdoc2md.render({
        files,
        configure: join(__dirname, "jsdoc.json"),
      });
    } else {
      jsdoc.renderSync({ files, destination: join(cwd, docsFolder) });
      if (isFile) {
        console.error("Output html to a file not supported.");
        return;
      }
    }
  }

  if (isFile) {
    await rimraf(join(cwd, docsFolder));

    const filePath = join(cwd, options.docs);
    const formattedDocs = prettier.format(inlinedDocs, {
      parser: isMarkdown ? "markdown" : "html",
      ...((await prettier.resolveConfig(filePath)) || {}),
    });

    if (options.docsStart && options.docsEnd) {
      await fs.writeFile(
        filePath,
        (await fs.readFile(filePath, "utf-8")).replace(
          new RegExp(
            `${escapeRegExp(options.docsStart)}([\\s\\S]*?)${escapeRegExp(
              options.docsEnd
            )}`
          ),
          `${options.docsStart}\n\n${formattedDocs}\n${options.docsEnd}`
        ),
        "utf-8"
      );
    } else {
      await fs.writeFile(filePath, formattedDocs, "utf-8");
    }
  }

  console.timeEnd(docs.description);
};
docs.description = `build: update docs`;

const types = async (cwd, files, options, watch) => {
  console.time(types.description);

  try {
    const configPath = ts.findConfigFile(
      cwd,
      ts.sys.fileExists,
      "tsconfig.json"
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
          function (diagnostic) {
            console.info(diagnostic.file.path);
            const results = `Error ${
              diagnostic.code
            } : ${ts.flattenDiagnosticMessageText(
              diagnostic.messageText,
              formatHost.getNewLine()
            )}`;
            console.error(results);
            if (typeof watch === "function") {
              watch(`${diagnostic.file.path}\n${results}`);
            }
          },
          function (diagnostic) {
            console.info(ts.formatDiagnostic(diagnostic, formatHost));
          }
        )
      );
    } else {
      const config = configPath
        ? ts.readConfigFile(configPath, ts.sys.readFile).config
        : options.tsconfig;

      if (!configPath) config.include = files;

      if (config.compilerOptions.declarationDir) {
        await rimraf(join(cwd, config.compilerOptions.declarationDir));
      }
      if (config.compilerOptions.outDir) {
        await rimraf(join(cwd, config.compilerOptions.outDir));
      }

      const parsedCommandLine = ts.parseJsonConfigFileContent(
        config,
        ts.sys,
        options.cwd
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

      const diagnosticToConsoleMethod = {
        [ts.DiagnosticCategory["Message"]]: "log",
        [ts.DiagnosticCategory["Suggestion"]]: "info",
        [ts.DiagnosticCategory["Warning"]]: "warn",
        [ts.DiagnosticCategory["Error"]]: "error",
      };

      allDiagnostics.forEach((diagnostic) => {
        const { line, character } = diagnostic.file
          ? ts.getLineAndCharacterOfPosition(diagnostic.file, diagnostic.start)
          : { line: 0, character: 0 };

        console[diagnosticToConsoleMethod[diagnostic.category] || "log"](
          `TypeScript\n${diagnostic.file?.fileName} (${line + 1}, ${
            character + 1
          }): ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`
        );
      });

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
  const files = await glob(options.files, {
    cwd,
    ignore: options.ignore,
    absolute: true,
  });

  console.log(`build files:\n- ${files.join("\n- ")}`);

  await Promise.all(
    [
      options.format ? format(cwd, files, options) : 0,
      options.types ? types(cwd, files, options) : 0,
      options.docs ? docs(cwd, files, options) : 0,
    ].filter(Boolean)
  );
  if (options.lint) await lint(cwd, files, options);
};
build.description = `Lint and Format sources, run TypeScript, update README API.`;

export { types, lint };

export default build;
