import { Platform, requestUrl } from "obsidian";
import type { AIPropertySettings, AIProviderAvailability, AIProviderId } from "./types";
import {
  FALLBACK_PROVIDER_MODELS,
  buildAntigravityArguments,
  formatCLIProviderError,
  providerModelOptions,
} from "./ai-provider-utils";

export { providerModelOptions } from "./ai-provider-utils";

interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const MAX_PROVIDER_OUTPUT = 2_000_000;
type CLIProviderId = Extract<AIProviderId,
  "codex-cli" | "claude-cli" | "antigravity-cli" | "qoder-cli" | "kimi-cli" | "minimax-cli" | "glm-cli" | "codebuddy-cli" | "workbuddy-cli">;

const CLI_EXECUTABLES: Record<CLIProviderId, string[]> = {
  "codex-cli": ["codex"],
  "claude-cli": ["claude"],
  "antigravity-cli": ["agy"],
  "qoder-cli": ["qodercli", "qoderclicn"],
  "kimi-cli": ["kimi"],
  "minimax-cli": ["mmx"],
  "glm-cli": ["zai", "glm"],
  "codebuddy-cli": ["codebuddy"],
  "workbuddy-cli": ["workbuddy"],
};

export function isCLIProvider(provider: AIProviderId): boolean {
  return provider in CLI_EXECUTABLES;
}

function configuredModel(settings: AIPropertySettings): string {
  return settings.model === "__custom__" ? "" : settings.model.trim();
}

export const AI_SECRET_IDS: Record<"anthropic-api" | "openai-compatible", string> = {
  "anthropic-api": "knowgrove-anthropic-key",
  "openai-compatible": "knowgrove-openai-key",
};

export const LEGACY_AI_SECRET_IDS: Record<"anthropic-api" | "openai-compatible", string> = {
  "anthropic-api": "reading-companion-anthropic-key",
  "openai-compatible": "reading-companion-openai-key",
};

export function providerName(provider: AIProviderId): string {
  return {
    "codex-cli": "Codex CLI",
    "claude-cli": "Claude Code CLI",
    "antigravity-cli": "Antigravity CLI",
    "qoder-cli": "Qoder CLI",
    "kimi-cli": "Kimi Code CLI",
    "minimax-cli": "MiniMax CLI",
    "glm-cli": "GLM CLI",
    "codebuddy-cli": "CodeBuddy CLI",
    "workbuddy-cli": "WorkBuddy CLI",
    "anthropic-api": "Anthropic API",
    "openai-compatible": "OpenAI 兼容接口",
  }[provider];
}

async function runCommand(
  executable: string,
  args: string[],
  input: string,
  timeoutSeconds: number,
): Promise<CommandResult> {
  if (!Platform.isDesktopApp) throw new Error("CLI 模型只支持 Obsidian 桌面版");
  const { spawn } = require("node:child_process") as typeof import("node:child_process");
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { mkdtemp, rm } = require("node:fs/promises") as typeof import("node:fs/promises");
  const { join } = require("node:path") as typeof import("node:path");
  const { StringDecoder } = require("node:string_decoder") as typeof import("node:string_decoder");
  const workingDirectory = await mkdtemp(join(tmpdir(), "knowgrove-ai-"));
  const executableDirectory = executable.includes("/") ? executable.slice(0, executable.lastIndexOf("/")) : "";
  const pathEntries = [executableDirectory, "/opt/homebrew/bin", "/usr/local/bin", process.env.PATH]
    .filter(Boolean);
  try {
    return await new Promise<CommandResult>((resolve, reject) => {
      const child = spawn(executable, args, {
        cwd: workingDirectory,
        env: { ...process.env, PATH: Array.from(new Set(pathEntries)).join(":") },
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
      });
      let stdout = "";
      let stderr = "";
      const stdoutDecoder = new StringDecoder("utf8");
      const stderrDecoder = new StringDecoder("utf8");
      let settled = false;
      const finish = (callback: () => void): void => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timer);
        callback();
      };
      const timer = globalThis.setTimeout(() => {
        child.kill("SIGTERM");
        finish(() => reject(new Error(`${executable} 运行超过 ${timeoutSeconds} 秒，已停止`)));
      }, Math.max(5, timeoutSeconds) * 1_000);
      child.once("error", (error) => finish(() => reject(error)));
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += stdoutDecoder.write(chunk);
        if (stdout.length > MAX_PROVIDER_OUTPUT) {
          child.kill("SIGTERM");
          finish(() => reject(new Error("模型输出超过安全上限")));
        }
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += stderrDecoder.write(chunk);
        if (stderr.length > MAX_PROVIDER_OUTPUT) stderr = stderr.slice(-MAX_PROVIDER_OUTPUT);
      });
      child.once("close", (code) => finish(() => {
        stdout += stdoutDecoder.end();
        stderr += stderrDecoder.end();
        resolve({ stdout, stderr, exitCode: code ?? -1 });
      }));
      child.stdin.end(input, "utf8");
    });
  } finally {
    await rm(workingDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function detectExecutable(
  id: CLIProviderId,
  configuredPath: string,
): Promise<AIProviderAvailability> {
  const executableNames = CLI_EXECUTABLES[id];
  const executableName = executableNames[0];
  const { homedir } = require("node:os") as typeof import("node:os");
  const { join } = require("node:path") as typeof import("node:path");
  const candidates = Array.from(new Set([
    configuredPath.trim(),
    ...executableNames.flatMap((name) => [
      `/opt/homebrew/bin/${name}`,
      `/usr/local/bin/${name}`,
      join(homedir(), ".local", "bin", name),
      join(homedir(), ".antigravity", "bin", name),
      name,
    ]),
  ].filter(Boolean)));
  for (const candidate of candidates) {
    try {
      const result = await runCommand(candidate, ["--version"], "", 5);
      if (result.exitCode !== 0) continue;
      const version = (result.stdout || result.stderr).trim().split(/\r?\n/)[0]?.trim();
      const models = await detectCLIModels(id, candidate);
      return {
        id,
        name: providerName(id),
        available: true,
        version,
        executablePath: candidate,
        configuredModel: id === "codex-cli"
          ? await readCodexConfiguredModel()
          : id === "qoder-cli"
            ? await readQoderConfiguredModel()
            : undefined,
        models: models.length ? models : FALLBACK_PROVIDER_MODELS[id],
        supportsModelOverride: !["minimax-cli", "workbuddy-cli"].includes(id),
        detail: id === "workbuddy-cli"
          ? `${version || "已检测"} · ${candidate}；暂未发现稳定的公开非交互文本调用协议，因此不会用于属性生成`
          : id === "glm-cli"
            ? `${version || "已检测"} · ${candidate}；使用 zai/glm 兼容 CLI，建议先测试模型`
          : `${version || "已检测"} · ${candidate}`,
      };
    } catch {
      // Try the next well-known path.
    }
  }
  return {
    id,
    name: providerName(id),
    available: false,
    detail: `${executableName} 命令未检测到`,
  };
}

async function detectCLIModels(id: CLIProviderId, executable: string): Promise<string[]> {
  const args = id === "antigravity-cli"
    ? ["models"]
    : id === "kimi-cli"
        ? ["provider", "list", "--json"]
        : [];
  if (!args.length) return [];
  try {
    const result = await runCommand(executable, args, "", 12);
    if (result.exitCode !== 0) return [];
    if (id === "kimi-cli") {
      const parsed = JSON.parse(result.stdout) as { models?: Record<string, unknown> };
      return Object.keys(parsed.models ?? {}).filter(Boolean).slice(0, 60);
    }
    return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 60);
  } catch {
    return [];
  }
}

async function readCodexConfiguredModel(): Promise<string | undefined> {
  try {
    const { readFile } = require("node:fs/promises") as typeof import("node:fs/promises");
    const { homedir } = require("node:os") as typeof import("node:os");
    const { join } = require("node:path") as typeof import("node:path");
    const content = await readFile(join(homedir(), ".codex", "config.toml"), "utf8");
    return content.match(/^model\s*=\s*["']([^"']+)["']/m)?.[1];
  } catch {
    return undefined;
  }
}

/** Qoder stores a model label separately from its credentials. Never read auth files. */
async function readQoderConfiguredModel(): Promise<string | undefined> {
  try {
    const { readFile } = require("node:fs/promises") as typeof import("node:fs/promises");
    const { homedir } = require("node:os") as typeof import("node:os");
    const { join } = require("node:path") as typeof import("node:path");
    const content = await readFile(join(homedir(), ".qoder", ".models", "default"), "utf8");
    const parsed = JSON.parse(content) as { key?: unknown };
    return typeof parsed.key === "string" && parsed.key.trim() ? parsed.key.trim() : undefined;
  } catch {
    return undefined;
  }
}

export async function detectAIProviders(
  settings: AIPropertySettings,
  secretStorageAvailable: boolean,
): Promise<AIProviderAvailability[]> {
  const cli = Platform.isDesktopApp
    ? await Promise.all([
      detectExecutable("codex-cli", settings.provider === "codex-cli" ? settings.executablePath : ""),
      detectExecutable("claude-cli", settings.provider === "claude-cli" ? settings.executablePath : ""),
      detectExecutable("antigravity-cli", settings.provider === "antigravity-cli" ? settings.executablePath : ""),
      detectExecutable("qoder-cli", settings.provider === "qoder-cli" ? settings.executablePath : ""),
      detectExecutable("kimi-cli", settings.provider === "kimi-cli" ? settings.executablePath : ""),
      detectExecutable("minimax-cli", settings.provider === "minimax-cli" ? settings.executablePath : ""),
      detectExecutable("glm-cli", settings.provider === "glm-cli" ? settings.executablePath : ""),
      detectExecutable("codebuddy-cli", settings.provider === "codebuddy-cli" ? settings.executablePath : ""),
      detectExecutable("workbuddy-cli", settings.provider === "workbuddy-cli" ? settings.executablePath : ""),
    ])
    : [
      { id: "codex-cli" as const, name: providerName("codex-cli"), available: false, detail: "仅桌面版可用" },
      { id: "claude-cli" as const, name: providerName("claude-cli"), available: false, detail: "仅桌面版可用" },
      { id: "antigravity-cli" as const, name: providerName("antigravity-cli"), available: false, detail: "仅桌面版可用" },
      { id: "qoder-cli" as const, name: providerName("qoder-cli"), available: false, detail: "仅桌面版可用" },
      { id: "kimi-cli" as const, name: providerName("kimi-cli"), available: false, detail: "仅桌面版可用" },
      { id: "minimax-cli" as const, name: providerName("minimax-cli"), available: false, detail: "仅桌面版可用" },
      { id: "glm-cli" as const, name: providerName("glm-cli"), available: false, detail: "仅桌面版可用" },
      { id: "codebuddy-cli" as const, name: providerName("codebuddy-cli"), available: false, detail: "仅桌面版可用" },
      { id: "workbuddy-cli" as const, name: providerName("workbuddy-cli"), available: false, detail: "仅桌面版可用" },
    ];
  return [
    ...cli,
    {
      id: "anthropic-api",
      name: providerName("anthropic-api"),
      available: secretStorageAvailable,
      detail: secretStorageAvailable ? "可使用 Obsidian 安全密钥存储" : "需要 Obsidian 1.11.4 或更高版本",
    },
    {
      id: "openai-compatible",
      name: providerName("openai-compatible"),
      available: true,
      detail: "支持 Ollama、LM Studio 和其他 OpenAI 兼容服务",
    },
  ];
}

function extractCodexMessage(stdout: string): string {
  const messages: string[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line) as Record<string, unknown>;
      const item = event.item as Record<string, unknown> | undefined;
      if (event.type === "item.completed" && item?.type === "agent_message" && typeof item.text === "string") {
        messages.push(item.text);
      }
    } catch {
      // Codex JSONL should be structured, but keep a raw fallback below.
    }
  }
  return messages.at(-1) ?? stdout;
}

async function runCodex(settings: AIPropertySettings, prompt: string, executablePath?: string): Promise<string> {
  const executable = settings.executablePath.trim() || executablePath || "codex";
  const args = [
    "exec",
    "--ephemeral",
    "--skip-git-repo-check",
    "--ignore-rules",
    "--sandbox",
    "read-only",
    "--color",
    "never",
    "--json",
  ];
  if (configuredModel(settings)) args.push("--model", configuredModel(settings));
  args.push("-");
  const result = await runCommand(executable, args, prompt, settings.timeoutSeconds);
  if (result.exitCode !== 0) throw new Error(result.stderr.trim() || `Codex CLI 退出码 ${result.exitCode}`);
  return extractCodexMessage(result.stdout);
}

async function runClaude(settings: AIPropertySettings, prompt: string, executablePath?: string): Promise<string> {
  const executable = settings.executablePath.trim() || executablePath || "claude";
  const args = ["-p", "--output-format", "json"];
  if (configuredModel(settings)) args.push("--model", configuredModel(settings));
  const result = await runCommand(executable, args, prompt, settings.timeoutSeconds);
  if (result.exitCode !== 0) throw new Error(result.stderr.trim() || `Claude Code CLI 退出码 ${result.exitCode}`);
  try {
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    if (typeof parsed.result === "string") return parsed.result;
  } catch {
    // Fall through to the raw response for the shared JSON extractor.
  }
  return result.stdout;
}

async function runAntigravity(settings: AIPropertySettings, prompt: string, executablePath?: string): Promise<string> {
  const executable = settings.executablePath.trim() || executablePath || "agy";
  const args = buildAntigravityArguments(configuredModel(settings), prompt);
  const result = await runCommand(executable, args, "", settings.timeoutSeconds);
  if (result.exitCode !== 0) {
    throw new Error(formatCLIProviderError("antigravity-cli", `${result.stderr}\n${result.stdout}`, `Antigravity CLI 退出码 ${result.exitCode}`));
  }
  const output = result.stdout.trim();
  if (!output) throw new Error(formatCLIProviderError("antigravity-cli", result.stderr, "Antigravity CLI 没有返回文本结果"));
  return output;
}

async function runQoder(settings: AIPropertySettings, prompt: string, executablePath?: string): Promise<string> {
  const executable = settings.executablePath.trim() || executablePath || "qodercli";
  const args = ["--print", "--permission-mode", "dont_ask", "--tools", ""];
  if (configuredModel(settings)) args.push("--model", configuredModel(settings));
  args.push(prompt);
  const result = await runCommand(executable, args, "", settings.timeoutSeconds);
  if (result.exitCode !== 0) {
    throw new Error(formatCLIProviderError("qoder-cli", `${result.stderr}\n${result.stdout}`, `Qoder CLI 退出码 ${result.exitCode}`));
  }
  if (!result.stdout.trim()) throw new Error(formatCLIProviderError("qoder-cli", result.stderr, "Qoder CLI 没有返回文本结果；请确认 Qoder CLI 已登录并拥有可用模型权限"));
  return result.stdout;
}

async function runKimi(settings: AIPropertySettings, prompt: string, executablePath?: string): Promise<string> {
  const executable = settings.executablePath.trim() || executablePath || "kimi";
  const args = ["--plan", "--prompt", prompt];
  if (configuredModel(settings)) args.push("--model", configuredModel(settings));
  const result = await runCommand(executable, args, "", settings.timeoutSeconds);
  if (result.exitCode !== 0) throw new Error(result.stderr.trim() || `Kimi Code CLI 退出码 ${result.exitCode}`);
  if (!result.stdout.trim()) throw new Error("Kimi Code CLI 没有返回文本结果");
  return result.stdout;
}

async function runMiniMax(settings: AIPropertySettings, prompt: string, executablePath?: string): Promise<string> {
  const executable = settings.executablePath.trim() || executablePath || "mmx";
  const result = await runCommand(executable, ["text", "chat", "--message", prompt], "", settings.timeoutSeconds);
  if (result.exitCode !== 0) throw new Error(result.stderr.trim() || `MiniMax CLI 退出码 ${result.exitCode}`);
  if (!result.stdout.trim()) throw new Error("MiniMax CLI 没有返回文本结果");
  return result.stdout;
}

async function runGLM(settings: AIPropertySettings, prompt: string, executablePath?: string): Promise<string> {
  const executable = settings.executablePath.trim() || executablePath || "zai";
  const args = configuredModel(settings) ? ["--model", configuredModel(settings), prompt] : [prompt];
  const result = await runCommand(executable, args, "", settings.timeoutSeconds);
  if (result.exitCode !== 0) throw new Error(result.stderr.trim() || `GLM CLI 退出码 ${result.exitCode}`);
  if (!result.stdout.trim()) throw new Error("GLM CLI 没有返回文本结果");
  return result.stdout;
}

async function runCodeBuddy(settings: AIPropertySettings, prompt: string, executablePath?: string): Promise<string> {
  const executable = settings.executablePath.trim() || executablePath || "codebuddy";
  const args = ["--print", "--permission-mode", "plan", "--tools", "", "--max-turns", "1"];
  if (configuredModel(settings)) args.push("--model", configuredModel(settings));
  args.push(prompt);
  const result = await runCommand(executable, args, "", settings.timeoutSeconds);
  if (result.exitCode !== 0) throw new Error(result.stderr.trim() || `CodeBuddy CLI 退出码 ${result.exitCode}`);
  if (!result.stdout.trim()) throw new Error("CodeBuddy CLI 没有返回文本结果");
  return result.stdout;
}

function normalizedEndpoint(value: string, fallback: string): string {
  return (value.trim() || fallback).replace(/\/+$/, "");
}

async function runAnthropic(settings: AIPropertySettings, prompt: string, apiKey?: string): Promise<string> {
  if (!apiKey) throw new Error("尚未保存 Anthropic API Key");
  if (!configuredModel(settings)) throw new Error("请先填写 Anthropic 模型名称");
  const response = await requestUrl({
    url: normalizedEndpoint(settings.endpoint, "https://api.anthropic.com/v1/messages"),
    method: "POST",
    contentType: "application/json",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: configuredModel(settings),
      max_tokens: 1_500,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const blocks = (response.json as { content?: Array<{ type?: string; text?: string }> }).content ?? [];
  const text = blocks.filter((block) => block.type === "text").map((block) => block.text ?? "").join("\n").trim();
  if (!text) throw new Error("Anthropic API 没有返回文本结果");
  return text;
}

async function runOpenAICompatible(settings: AIPropertySettings, prompt: string, apiKey?: string): Promise<string> {
  if (!configuredModel(settings)) throw new Error("请先填写模型名称");
  const base = normalizedEndpoint(settings.endpoint, "http://127.0.0.1:11434/v1");
  const url = base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
  const headers: Record<string, string> = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const response = await requestUrl({
    url,
    method: "POST",
    contentType: "application/json",
    headers,
    body: JSON.stringify({
      model: configuredModel(settings),
      temperature: 0.1,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const content = (response.json as { choices?: Array<{ message?: { content?: string } }> })
    .choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("OpenAI 兼容接口没有返回文本结果");
  return content;
}

export async function runAIProvider(
  settings: AIPropertySettings,
  prompt: string,
  availability: AIProviderAvailability[],
  apiKey?: string,
): Promise<string> {
  const detected = availability.find((provider) => provider.id === settings.provider);
  if (settings.provider === "codex-cli") return runCodex(settings, prompt, detected?.executablePath);
  if (settings.provider === "claude-cli") return runClaude(settings, prompt, detected?.executablePath);
  if (settings.provider === "antigravity-cli") return runAntigravity(settings, prompt, detected?.executablePath);
  if (settings.provider === "qoder-cli") return runQoder(settings, prompt, detected?.executablePath);
  if (settings.provider === "kimi-cli") return runKimi(settings, prompt, detected?.executablePath);
  if (settings.provider === "minimax-cli") return runMiniMax(settings, prompt, detected?.executablePath);
  if (settings.provider === "glm-cli") return runGLM(settings, prompt, detected?.executablePath);
  if (settings.provider === "codebuddy-cli") return runCodeBuddy(settings, prompt, detected?.executablePath);
  if (settings.provider === "workbuddy-cli") {
    throw new Error("WorkBuddy 尚未公开稳定的非交互文本 CLI 调用协议；当前只能检测安装状态，不能安全地用于属性生成");
  }
  if (settings.provider === "anthropic-api") return runAnthropic(settings, prompt, apiKey);
  return runOpenAICompatible(settings, prompt, apiKey);
}
