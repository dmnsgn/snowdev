/**
 * Report modules bundlers can't name in their own errors.
 *
 * @returns {import("rolldown").Plugin}
 */
const reportModules = () => ({
  name: "report-modules",
  // Last, for plugins handling these types. rolldown's own errors for them have
  // no module id to empty: raising them here sets it.
  transform: {
    order: "post",
    handler(code, id, meta) {
      if (meta?.moduleType === "css") {
        this.error({ message: "Bundling CSS is not supported", id });
      }
      if (meta?.moduleType === "json") {
        try {
          JSON.parse(code);
        } catch (error) {
          this.error({ message: error.message, id });
        }
      }
      return null;
    },
  },
});

export default reportModules;
