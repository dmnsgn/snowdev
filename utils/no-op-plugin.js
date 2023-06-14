/** @type {import("rollup").PluginImpl} */
export default ({ ids = [] }) => ({
  name: "no-op",
  resolveId(id) {
    if (ids.includes(id)) return id;
  },
  load(id) {
    if (ids.includes(id)) return "export default {}";
  },
});
