import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

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
  ...obsidianmd.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "obsidianmd/ui/sentence-case": ["warn", {
        mode: "loose",
        brands: [
          "KnowGrove",
          "Reading Companion",
          "Obsidian",
          "Markdown",
          "Canvas",
          "Vault",
          "Base",
          "WorkBuddy",
          "CodeBuddy",
          "OpenAI",
          "Claude Code",
          "Kimi Code",
          "MiniMax",
          "GLM",
          "yt-dlp",
          "FFmpeg",
          "Whisper",
          "whisper-cli",
        ],
        acronyms: ["AI", "API", "CLI", "URL", "HTTPS", "YAML", "JSON", "PDF", "ID", "GPT"],
        ignoreWords: ["small", "YYYY-MM-DD"],
        ignoreRegex: ["^https?://", "^/[^\\s]+", "^_[^\\s]+", "YYYY-MM-DD", "^small$", "^gpt-image-1$"],
      }],
    },
  },
]);
