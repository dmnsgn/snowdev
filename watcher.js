import { isAbsolute, relative, resolve } from "node:path";

import chokidar from "chokidar";
import picomatch from "picomatch";
import slash from "slash";

// Directories: pruned from the crawl rather than matched file by file
const IGNORE = ["**/node_modules", "**/.git"];

const isOutside = (cwd, file) => relative(cwd, file).startsWith("..");

/**
 * @callback WatchCallback
 * @param {"change" | "unlink"} event
 * @param {string} file Relative to cwd, or absolute when outside of it.
 */

/**
 * @callback WatchAdd
 * @param {string | string[]} patterns Globs or paths. Prefix with "!" to
 *   exclude.
 * @param {WatchCallback} callback
 * @param {object} [options]
 * @param {string[]} [options.ignore]
 * @returns {function(): void} Unsubscribe.
 */

/**
 * @typedef {object} Watcher
 * @property {WatchAdd} add
 * @property {function(): Promise<void>} close
 */

/**
 * A single watcher on cwd shared by glob subscriptions. Absolute paths outside
 * of cwd are watched individually.
 *
 * @param {string} cwd
 * @param {object} [options]
 * @param {string[]} [options.ignore]
 * @param {function(Error): void} [options.onError]
 * @returns {Watcher}
 */
const createWatcher = (
  cwd,
  { ignore = IGNORE, onError = console.error } = {},
) => {
  const isIgnored = picomatch(ignore, { dot: true });
  const subscriptions = new Set();
  const externals = new Map();
  let closed = false;

  const toFile = (path) =>
    isOutside(cwd, path) ? path : slash(relative(cwd, path));

  // Isolate subscribers: a failing callback can't crash the process
  const run = async (callback, ...args) => {
    try {
      await callback(...args);
    } catch (error) {
      onError(error);
    }
  };

  const notify = (event, path) => {
    const file = toFile(path);
    for (const { match, callback } of subscriptions) {
      if (match(file)) void run(callback, event, file);
    }
  };

  const watcher = chokidar
    .watch(cwd, {
      ignoreInitial: true,
      ignored: (path) =>
        !isOutside(cwd, path) && isIgnored(slash(relative(cwd, path))),
    })
    .on("add", (path) => notify("change", path))
    .on("change", (path) => notify("change", path))
    .on("unlink", (path) => notify("unlink", path))
    .on("error", onError);

  const watchExternal = (file) => {
    const references = externals.get(file) ?? 0;
    if (!references) watcher.add(file);
    externals.set(file, references + 1);

    return () => {
      const remaining = externals.get(file) - 1;
      if (remaining) return externals.set(file, remaining);
      externals.delete(file);
      watcher.unwatch(file);
    };
  };

  const add = (patterns, callback, { ignore = [] } = {}) => {
    if (closed) return () => {};

    const globs = [];
    const negated = [];
    const files = new Set();

    for (const pattern of [patterns].flat()) {
      if (pattern.startsWith("!")) negated.push(pattern.slice(1));
      else if (!isAbsolute(pattern)) globs.push(pattern);
      else if (isOutside(cwd, pattern)) files.add(resolve(pattern));
      else globs.push(slash(relative(cwd, pattern)));
    }

    const matchGlobs = globs.length
      ? picomatch(globs, { dot: true, ignore: [...ignore, ...negated] })
      : null;
    const subscription = {
      // Globs are relative to cwd: "**" would otherwise match external paths
      match: (file) =>
        isAbsolute(file) ? files.has(file) : !!matchGlobs?.(file),
      callback,
    };
    subscriptions.add(subscription);

    const unwatchExternals = [...files].map(watchExternal);

    return () => {
      subscriptions.delete(subscription);
      for (const unwatch of unwatchExternals) unwatch();
    };
  };

  const close = () => {
    closed = true;
    subscriptions.clear();
    externals.clear();
    return watcher.close();
  };

  return { add, close };
};

export default createWatcher;
