import { createInterface } from "node:readline/promises";

import { console } from "./utils.js";

/**
 * @typedef {object} Shortcut
 * @property {string} key
 * @property {string} group
 * @property {string} description
 * @property {function(): unknown} action
 */

/**
 * Bind "key + enter" shortcuts on stdin.
 *
 * @param {Shortcut[]} shortcuts
 * @returns {function(): void} Unbind
 */
const bindShortcuts = (shortcuts) => {
  if (!process.stdin.isTTY) return () => {};

  const allShortcuts = [
    ...shortcuts,
    {
      key: "h",
      group: "general",
      description: "show help",
      action: () => {
        const groups = Object.groupBy(allShortcuts, ({ group }) => group);
        const lines = Object.entries(groups).flatMap(([group, items]) => [
          `  ${group}`,
          ...items.map(
            ({ key, description }) => `    ${key} + enter  ${description}`,
          ),
        ]);
        console.info(`dev — shortcuts:\n${lines.join("\n")}`);
      },
    },
  ];

  const running = new Set();

  // No "output": keeps the terminal in cooked mode so Ctrl+C still sends SIGINT
  const readline = createInterface({ input: process.stdin });
  readline.on("line", async (line) => {
    const key = line.trim();
    const shortcut = allShortcuts.find((shortcut) => shortcut.key === key);
    if (!shortcut) return;

    if (running.has(shortcut)) {
      console.warn(`dev — "${shortcut.description}" already running.`);
      return;
    }
    running.add(shortcut);
    try {
      await shortcut.action();
    } catch (error) {
      console.error(error);
    } finally {
      running.delete(shortcut);
    }
  });

  console.info("dev — press h + enter to show help");

  return () => readline.close();
};

export default bindShortcuts;
