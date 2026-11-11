import { isBuiltin } from "node:module";

const PROTOCOL = "node:";

/**
 * Resolve `node:` builtins by their unprefixed name, the one polyfills match.
 *
 * @returns {import("rolldown").Plugin}
 */
const nodeProtocol = () => ({
  name: "node-protocol",
  async resolveId(source, importer, resolveOptions) {
    if (!source.startsWith(PROTOCOL)) return null;

    // Prefix-only builtins ("node:test") would resolve to an npm package
    const name = source.slice(PROTOCOL.length);
    return isBuiltin(name)
      ? this.resolve(name, importer, { ...resolveOptions, skipSelf: true })
      : null;
  },
});

export default nodeProtocol;
