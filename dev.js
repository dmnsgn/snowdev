import { basename, join, relative } from "node:path";

import pDebounce from "p-debounce";

import install from "./install.js";
import createServer from "./server.js";
import createWatcher from "./watcher.js";
import bindShortcuts from "./shortcuts.js";
import test from "./test.js";
import build, {
  types,
  docs,
  lint,
  analyse,
  format,
  checkDocs,
} from "./build.js";
import { console, getFileExtension, readJson, resolveFiles } from "./utils.js";

const lintAndLog = async (files, options, log) => {
  const results = await lint(options.cwd, files, options);
  if (results) log(`ESLint Error:${results}`);
};

const checkDocsAndLog = async (files, options, log) => {
  const results = await checkDocs(options.cwd, files, options);
  if (results) log(`JSDoc Error:\n${results}`);
};

const analyseAndLog = async (options, log, analyseOptions) => {
  const files = await resolveFiles(options.cwd, options);
  const results = await analyse(options.cwd, files, options, analyseOptions);
  if (results) log(`Analyse Warning:\n${results}`);
};

const inGroup = (group, shortcuts) =>
  shortcuts.map((shortcut) => ({ ...shortcut, group }));

const getShortcuts = (options, { server, served, log, quit }) => [
  ...(server
    ? inGroup("server", [
        { key: "u", description: "show server urls", action: server.printUrls },
        { key: "o", description: "open in browser", action: server.open },
        {
          key: "r",
          description: "reload browsers",
          action: () => server.send("reload"),
        },
        {
          key: "i",
          description: "reinstall dependencies",
          action: served.reinstall,
        },
      ])
    : []),
  ...inGroup("commands", [
    {
      key: "t",
      description: options.ts ? "update docs" : "generate types and docs",
      action: async () => {
        const files = await resolveFiles(options.cwd, options);
        await Promise.all([
          options.types && !options.ts && types(options.cwd, files, options),
          options.docs && docs(options.cwd, files, options),
        ]);
      },
    },
    {
      key: "a",
      description: "analyse package",
      action: () => analyseAndLog(options, log),
    },
    {
      key: "l",
      description: "lint all",
      action: () => lintAndLog(options.files, options, log),
    },
    {
      key: "f",
      description: "format all",
      action: async () =>
        format(options.cwd, await resolveFiles(options.cwd, options), options),
    },
    { key: "b", description: "build", action: () => build(options) },
    { key: "T", description: "run tests", action: () => test(options) },
  ]),
  ...inGroup("general", [
    {
      key: "c",
      description: "clear console",
      action: () => globalThis.console.clear(),
    },
    { key: "q", description: "quit", action: quit },
  ]),
];

const watchSources = (watcher, options, checkJsdoc, log) =>
  watcher.add(
    options.files,
    async (event, file) => {
      if (event !== "change") return;

      const files = [join(options.cwd, file)];

      if (options.lint) await lintAndLog(files, options, log);
      if (checkJsdoc) await checkDocsAndLog(files, options, log);
    },
    { ignore: options.ignore },
  );

const serve = async (options, { server, watcher, log }) => {
  // Buffered: installs and builds write many files at once
  const changedFiles = new Set();
  const flushReload = pDebounce(async () => {
    const [file] = changedFiles;
    if (changedFiles.size > 1) {
      console.info(`dev — ${changedFiles.size} files changed. Reloading.`);
    } else if (file) {
      console.info(`dev — File changed: "${file}". Reloading.`);
    } else {
      console.info("dev — Reloading.");
    }
    changedFiles.clear();
    server.send("reload");
  }, 100);
  const reload = (file) => {
    if (file) changedFiles.add(file);
    return flushReload();
  };

  let unwatchLinkedFiles;
  const watchLinkedFiles = ({ error, linkedFiles = [] }) => {
    if (error) return;

    unwatchLinkedFiles?.();
    unwatchLinkedFiles = linkedFiles.length
      ? watcher.add(linkedFiles, () => onDependencyChange())
      : null;
  };

  const installDependencies = async (installOptions = options) => {
    try {
      watchLinkedFiles(await install(installOptions));
    } catch (error) {
      console.error(error);
    }
  };
  const updateDependencies = async (installOptions) => {
    await installDependencies(installOptions);
    if (options.server.hmr) await reload();
  };
  const onDependencyChange = pDebounce(() => updateDependencies(), 500);

  // Install on manifest change
  watcher.add(["package.json", "package-lock.json"], async (event, file) => {
    if (event !== "change") return;

    await onDependencyChange();

    if (file !== "package.json") return;

    await lintAndLog([join(options.cwd, file)], options, log);
  });

  // Options are resolved once at startup (server options can't hot-apply)
  // so a config change only gets a hint
  if (options.configFile) {
    const readConfig = async () => {
      if (basename(options.configFile) !== "package.json") return null;
      try {
        return JSON.stringify((await readJson(options.configFile)).snowdev);
      } catch {
        // Mid-write or invalid JSON: package.json lint will report it
        return null;
      }
    };
    let config = await readConfig();

    watcher.add(options.configFile, async (event) => {
      if (event !== "change") return;

      // package.json changes for many other reasons: only hint on the key
      if (config !== null) {
        const current = await readConfig();
        if (current === null || current === config) return;
        config = current;
      }

      console.warn(
        `dev — Config changed: "${relative(options.cwd, options.configFile)}". Restart to apply.`,
      );
    });
  }

  if (options.server.watch) {
    watcher.add(options.server.watch, (event, file) => {
      if (event !== "change") return;

      const extension = getFileExtension(file);
      if (extension === ".css") {
        console.info(`dev — File changed: "${file}". Injecting.`);
        server.send("css", file);
      } else if (options.server.hmr && extension === ".js") {
        console.info(`dev — File changed: "${file}". Hot reloading.`);
        server.send("hmr", file);
      } else {
        reload(file);
      }
    });
  }

  return {
    install: () => installDependencies(),
    reinstall: () => updateDependencies({ ...options, force: true }),
  };
};

const dev = async (options = {}) => {
  const checkJsdoc = options.docs && !options.ts;

  const watcher = createWatcher(options.cwd, {
    onError: (error) =>
      console.error(
        error.code === "ENOSPC"
          ? `dev — File watching limit reached. Increase "fs.inotify.max_user_watches". ${error.message}`
          : error,
      ),
  });
  const server = options.serve ? await createServer(options) : null;

  const log = (message) => server?.send("console:log", `[snowdev] ${message}`);

  if (options.lint || checkJsdoc) {
    watchSources(watcher, options, checkJsdoc, log);
  }

  const served = server && (await serve(options, { server, watcher, log }));

  const unbindShortcuts = bindShortcuts(
    getShortcuts(options, {
      server,
      served,
      log,
      quit: async () => {
        unbindShortcuts();
        await Promise.all([server?.close(), watcher.close()]);
        process.exit();
      },
    }),
  );

  await served?.install();

  const linting = options.lint && lintAndLog(options.files, options, log);
  if (checkJsdoc) {
    void (async () => {
      const files = await resolveFiles(options.cwd, options);
      return checkDocsAndLog(files, options, log);
    })();
  }
  if (options.ts) {
    await types(options.cwd, null, options, (results) => {
      if (results) log(`TypeScript Error:\n${results}`);
    });
  }
  if (options.analyse) await analyseAndLog(options, log, { sizes: false });

  await linting;
};

export default dev;
