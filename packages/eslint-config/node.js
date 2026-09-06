import globals from "globals";
import { config as baseConfig } from "./base.js";

export default [
  ...baseConfig,
  { languageOptions: { globals: globals.node } },
];
