import { isBuiltin } from "node:module";

const PROTOCOL = "node:";

/**
 * Resolve `node:` builtins as their unprefixed name, the only one polyfills match.
 *
 * @returns {import("rolldown").Plugin}
 */
const nodeProtocol = () => ({
  name: "node-protocol",
  async resolveId(source, importer, resolveOptions) {
    if (!source.startsWith(PROTOCOL)) return null;

    // Prefix-only builtins ("node:test") would resolve to an npm package
    const name = source.slice(PROTOCOL.length);
    if (!isBuiltin(name)) return null;

    return this.resolve(name, importer, { ...resolveOptions, skipSelf: true });
  },
});

export default nodeProtocol;
