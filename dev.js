import { basename, join, relative } from "node:path";

import pDebounce from "p-debounce";

import install from "./install.js";
import createServer from "./server.js";
import createWatcher from "./watcher.js";
import { types, lint, checkDocs } from "./build.js";
import {
  getCommandConsole,
  getFileExtension,
  readJson,
  resolveFiles,
} from "./utils.js";

const console = getCommandConsole("dev");

const watchSources = (watcher, options, checkJsdoc, log) =>
  watcher.add(
    options.files,
    async (event, file) => {
      if (event !== "change") return;

      const files = [join(options.cwd, file)];

      if (options.lint) {
        const results = await lint(options.cwd, files, options);
        if (results) log(`ESLint Error:${results}`);
      }

      if (!checkJsdoc) return;

      const results = await checkDocs(options.cwd, files, options);
      if (results) log(`JSDoc Error:\n${results}`);
    },
    { ignore: options.ignore },
  );

const serve = async (options, { server, watcher, log }) => {
  // Buffered: installs and builds write many files at once
  const changedFiles = new Set();
  const flushReload = pDebounce(async () => {
    const [file] = changedFiles;
    if (changedFiles.size > 1) {
      console.info(`${changedFiles.size} files changed. Reloading.`);
    } else if (file) {
      console.info(`File changed: "${file}". Reloading.`);
    } else {
      console.info("Reloading.");
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

  const onDependencyChange = pDebounce(async () => {
    watchLinkedFiles(await install(options));
    if (options.server.hmr) await reload();
  }, 500);

  // Install on manifest change
  watcher.add(["package.json", "package-lock.json"], async (event, file) => {
    if (event !== "change") return;

    await onDependencyChange();

    if (file !== "package.json") return;

    const results = await lint(options.cwd, [join(options.cwd, file)], options);
    if (results) log(`ESLint Error:${results}`);
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
        `Config changed: "${relative(options.cwd, options.configFile)}". Restart to apply.`,
      );
    });
  }

  if (options.server.watch) {
    watcher.add(options.server.watch, (event, file) => {
      if (event !== "change") return;

      const extension = getFileExtension(file);
      if (extension === ".css") {
        console.info(`File changed: "${file}". Injecting.`);
        server.send("css", file);
      } else if (options.server.hmr && extension === ".js") {
        console.info(`File changed: "${file}". Hot reloading.`);
        server.send("hmr", file);
      } else {
        reload(file);
      }
    });
  }

  try {
    watchLinkedFiles(await install(options));

    if (options.ts) {
      await types(options.cwd, null, options, (results) => {
        if (results) log(`TypeScript Error:\n${results}`);
      });
    }
  } catch (error) {
    console.error(error);
  }
};

const dev = async (options = {}) => {
  const checkJsdoc = options.docs && !options.ts;

  const watcher = createWatcher(options.cwd, {
    onError: (error) =>
      console.error(
        error.code === "ENOSPC"
          ? `File watching limit reached. Increase "fs.inotify.max_user_watches". ${error.message}`
          : error,
      ),
  });
  const server = options.serve ? await createServer(options) : null;

  const linting = options.lint && lint(options.cwd, options.files, options);
  if (checkJsdoc) {
    void (async () => {
      const files = await resolveFiles(options.cwd, options);
      return checkDocs(options.cwd, files, options);
    })();
  }

  const log = (message) => server?.send("console:log", `[snowdev] ${message}`);

  if (options.lint || checkJsdoc) {
    watchSources(watcher, options, checkJsdoc, log);
  }

  if (server) {
    await serve(options, { server, watcher, log });
  } else if (options.ts) {
    await types(options.cwd, null, options, true);
  }

  await linting;
};

export default dev;
