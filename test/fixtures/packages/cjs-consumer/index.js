const { parse, from } = require("shape-mismatch");
const { join } = require("path");

exports.from = from;
exports.parsed = parse();
exports.joined = join("a", "b");
