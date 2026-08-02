import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";

export default defineConfig([
  {
    ignores: [
      "main.js",
      "node_modules/**",
      "tests/**",
      "scripts/**",
      "release/**",
      "runtime-dist/**",
      ".runtime-*/**",
      "cloud/**",
      "言序浏览器一键入库/**",
    ],
  },
  {
    files: ["src/**/*.ts"],
    plugins: { obsidianmd },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { project: "./tsconfig.json" },
    },
    rules: {
      "obsidianmd/no-plugin-as-component": "error",
      "obsidianmd/no-unsupported-api": "error",
      "obsidianmd/settings-tab/no-manual-html-headings": "error",
      "obsidianmd/settings-tab/no-problematic-settings-headings": "error",
    },
  },
]);
