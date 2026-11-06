exports.nextTick = typeof process.nextTick;
// Only set on the polyfill: Node.js has its own process when loading the bundle
exports.browser = process.browser;
