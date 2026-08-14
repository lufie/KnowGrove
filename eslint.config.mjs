import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";

const recommendedObsidianRules = Object.fromEntries(
  Object.entries(
    Object.assign({}, ...obsidianmd.configs.recommended.map((config) => config.rules ?? {})),
  ).filter(([ruleName]) => ruleName.startsWith("obsidianmd/")),
);

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
      ...recommendedObsidianRules,
    },
  },
]);
