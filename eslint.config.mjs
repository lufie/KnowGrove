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
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/prefer-promise-reject-errors": "error",
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
          "Chrome",
          "Edge",
          "Safari",
          "Firefox",
          "Netscape",
          "TikTok",
          "YouTube",
          "Vimeo",
          "Instagram",
        ],
        acronyms: ["AI", "API", "CLI", "URL", "HTTPS", "YAML", "JSON", "PDF", "ID", "GPT", "RED"],
        ignoreWords: ["small", "YYYY-MM-DD", "Cookie", "Cookies", "cookie", "cookies"],
        ignoreRegex: ["^https?://", "^/[^\\s]+", "^_[^\\s]+", "YYYY-MM-DD", "^small$", "^gpt-image-1$"],
      }],
    },
  },
]);
