import * as prettierPluginJsdoc from "prettier-plugin-jsdoc";

/**
 * @type {import("prettier").Config}
 * @see https://prettier.io/docs/configuration
 */
const config = {
  plugins: [prettierPluginJsdoc],
  tsdoc: true,
  jsdocAddDefaultToDescription: false,
};

export default config;
