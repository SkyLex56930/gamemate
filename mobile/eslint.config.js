const expoConfig = require("eslint-config-expo/flat");
const { defineConfig } = require("eslint/config");

module.exports = defineConfig([
  expoConfig,
  { ignores: [".expo/**", "dist/**", "App.backup-v2.tsx"] },
]);
