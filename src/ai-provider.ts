import { Platform, requestUrl } from "obsidian";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { StringDecoder } from "node:string_decoder";
import type { AIPropertySettings, AIProviderAvailability, AIProviderId } from "./types";
import {
  FALLBACK_PROVIDER_MODELS,
  buildAntigravityArguments,
  formatCLIProviderError,
  parseCodexModelCache,
  parseCodeBuddyModels,
  parseModelsFromHelp,
  parsePlainModelList,
  parseQoderModels,
} from "./ai-provider-utils";
import {
  mergeExecutablePath,
  resolveLocalExecutable,
} from "./local-cli";

export { automaticAIContentCharacterLimit, providerModelOptions } from "./ai-provider-utils";

export interface LocalCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const MAX_PROVIDER_OUTPUT = 2_000_000;
type CLIProviderId = Extract<AIProviderId,
  "codex-cli" | "claude-cli" | "antigravity-cli" | "qoder-cli" | "kimi-cli" | "minimax-cli" | "glm-cli" | "codebuddy-cli">;

export interface AIProviderDetectionOptions {
  secretStorageAvailable: boolean;
  anthropicApiKey?: string;
  openAICompatibleApiKey?: string;
}

const CLI_EXECUTABLES: Record<CLIProviderId, string[]> = {
  "codex-cli": ["codex"],
  "claude-cli": ["claude"],
  "antigravity-cli": ["agy"],
  "qoder-cli": ["qodercli", "qoderclicn"],
  "kimi-cli": ["kimi"],
  "minimax-cli": ["mmx"],
  "glm-cli": ["zai", "glm"],
  "codebuddy-cli": ["codebuddy"],
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
    "anthropic-api": "Anthropic API",
    "openai-compatible": "OpenAI 兼容接口",
  }[provider];
}

let loginShellPathPromise: Promise<string> | undefined;

async function readLoginShellPath(): Promise<string> {
  if (process.platform === "win32") return "";
  if (!loginShellPathPromise) {
    loginShellPathPromise = (async () => {
      const shell = process.env.SHELL?.trim() || "/bin/zsh";
      const marker = "__KNOWGROVE_LOGIN_PATH__";
      return await new Promise<string>((resolve) => {
        const child = spawn(
          shell,
          ["-ilc", `printf '\\n${marker}%s\\n' "$PATH"`],
          { env: process.env, stdio: ["ignore", "pipe", "ignore"], shell: false },
        );
        let stdout = "";
        const timer = window.setTimeout(() => {
          child.kill("SIGTERM");
          resolve("");
        }, 4_000);
        child.stdout.on("data", (chunk: Buffer) => {
          stdout += chunk.toString("utf8");
          if (stdout.length > 100_000) stdout = stdout.slice(-100_000);
        });
        child.once("error", () => {
          window.clearTimeout(timer);
          resolve("");
        });
        child.once("close", () => {
          window.clearTimeout(timer);
          const line = stdout.split(/\r?\n/).find((entry) => entry.startsWith(marker));
          resolve(line?.slice(marker.length).trim() ?? "");
        });
      });
    })();
  }
  return loginShellPathPromise;
}

function setEnvironmentPath(
  environment: NodeJS.ProcessEnv,
  value: string,
): NodeJS.ProcessEnv {
  const pathKey = Object.keys(environment).find((name) => name.toLowerCase() === "path") ?? "PATH";
  return { ...environment, [pathKey]: value };
}

export async function runLocalCommand(
  executable: string,
  args: string[],
  input: string,
  timeoutSeconds: number,
): Promise<LocalCommandResult> {
  if (!Platform.isDesktopApp) throw new Error("CLI 模型只支持 Obsidian 桌面版");
  const workingDirectory = await mkdtemp(join(tmpdir(), "knowgrove-ai-"));
  const loginShellPath = await readLoginShellPath();
  const resolvedExecutable = await resolveLocalExecutable(executable, { loginShellPath }) ?? executable;
  let environment = setEnvironmentPath(
    process.env,
    mergeExecutablePath(resolvedExecutable, loginShellPath),
  );
  const isWindowsCommandScript = process.platform === "win32" && /\.(?:cmd|bat)$/i.test(resolvedExecutable);
  const spawnExecutable = isWindowsCommandScript
    ? "powershell.exe"
    : resolvedExecutable;
  let spawnArguments = args;
  if (isWindowsCommandScript) {
    environment = {
      ...environment,
      KNOWGROVE_CLI_EXECUTABLE: resolvedExecutable,
      KNOWGROVE_CLI_ARGUMENTS: JSON.stringify(args),
    };
    spawnArguments = [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "$kgArgs = @(ConvertFrom-Json $env:KNOWGROVE_CLI_ARGUMENTS); & $env:KNOWGROVE_CLI_EXECUTABLE @kgArgs; if ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE }",
    ];
  }
  try {
    return await new Promise<LocalCommandResult>((resolve, reject) => {
      const child = spawn(spawnExecutable, spawnArguments, {
        cwd: workingDirectory,
        env: environment,
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
        window.clearTimeout(timer);
        callback();
      };
      const timer = window.setTimeout(() => {
        child.kill("SIGTERM");
        finish(() => reject(new Error(`${executable} 运行超过 ${timeoutSeconds} 秒，已停止`)));
      }, Math.max(5, timeoutSeconds) * 1_000);
      child.once("error", (error) => finish(() => reject(error)));
      child.stdin.on("error", (error: NodeJS.ErrnoException) => {
        if (error.code !== "EPIPE") finish(() => reject(error));
      });
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
  const loginShellPath = await readLoginShellPath();
  const configuredExecutable = configuredPath.trim()
    ? await resolveLocalExecutable(configuredPath, { loginShellPath })
    : undefined;
  const resolvedExecutables = await Promise.all(
    executableNames.map((name) => resolveLocalExecutable(name, { loginShellPath })),
  );
  const candidates = Array.from(new Set([
    configuredExecutable,
    ...resolvedExecutables,
  ].filter((candidate): candidate is string => Boolean(candidate))));
  for (const candidate of candidates) {
    try {
      const result = await runLocalCommand(candidate, ["--version"], "", 5);
      if (result.exitCode !== 0) continue;
      const version = (result.stdout || result.stderr).trim().split(/\r?\n/)[0]?.trim();
      const models = await detectCLIModels(id, candidate);
      const readiness = await detectCLIReadiness(id, candidate);
      return {
        id,
        name: providerName(id),
        available: readiness.available,
        installed: true,
        version,
        executablePath: candidate,
        configuredModel: id === "codex-cli"
          ? await readCodexConfiguredModel()
          : id === "qoder-cli"
            ? await readQoderConfiguredModel()
            : undefined,
        models: models.length ? models : FALLBACK_PROVIDER_MODELS[id],
        supportsModelOverride: true,
        detail: !readiness.available
            ? `${version || "已检测"} · ${candidate}；${readiness.detail}`
            : id === "glm-cli"
              ? `${version || "已检测"} · ${candidate}；使用 zai/glm 兼容 CLI`
            : `${version || "已检测"} · ${candidate}${readiness.detail ? `；${readiness.detail}` : ""}`,
      };
    } catch {
      // Try the next well-known path.
    }
  }
  return {
    id,
    name: providerName(id),
    available: false,
    installed: false,
    detail: `${executableName} 命令未检测到；请在终端确认 ${executableName} --version 后重新检测`,
  };
}

async function detectCLIReadiness(
  id: CLIProviderId,
  executable: string,
): Promise<{ available: boolean; detail?: string }> {
  if (id === "minimax-cli") {
    try {
      const result = await runLocalCommand(
        executable,
        ["auth", "status", "--output", "json", "--non-interactive"],
        "",
        8,
      );
      if (result.exitCode !== 0) {
        return { available: false, detail: "尚未登录 MiniMax CLI" };
      }
      const parsed = JSON.parse(result.stdout) as { method?: unknown; source?: unknown };
      if (typeof parsed.method !== "string" || !parsed.method.trim()) {
        return { available: false, detail: "MiniMax CLI 没有有效认证信息" };
      }
      return { available: true, detail: "认证已就绪" };
    } catch {
      return { available: false, detail: "无法确认 MiniMax CLI 的登录状态" };
    }
  }
  return { available: true };
}

async function detectCLIModels(id: CLIProviderId, executable: string): Promise<string[]> {
  const detected: string[] = [];
  const append = (models: string[]): void => {
    for (const model of models) {
      if (!detected.includes(model)) detected.push(model);
      if (detected.length >= 60) break;
    }
  };
  if (id === "codex-cli") append(await readCodexCachedModels());

  const probes: string[][] = id === "antigravity-cli"
    ? [["models"]]
    : id === "qoder-cli"
      ? [["--list-models"]]
      : id === "kimi-cli"
        ? [["provider", "list", "--json"]]
        : id === "minimax-cli"
          ? [["text", "chat", "--help"]]
          : [["--help"]];

  for (const args of probes) {
    try {
      const result = await runLocalCommand(executable, args, "", 15);
      if (result.exitCode !== 0) continue;
      const output = `${result.stdout}\n${result.stderr}`;
      if (id === "kimi-cli") {
        const parsed = JSON.parse(result.stdout) as {
          models?: Record<string, unknown> | Array<{ id?: unknown; name?: unknown }>;
        };
        const models = Array.isArray(parsed.models)
          ? parsed.models.map((model) => typeof model.id === "string"
            ? model.id
            : typeof model.name === "string" ? model.name : "")
          : Object.keys(parsed.models ?? {});
        append(models.filter(Boolean).slice(0, 60));
      } else if (id === "codebuddy-cli") {
        append(parseCodeBuddyModels(output));
      } else if (id === "qoder-cli") {
        append(parseQoderModels(output));
      } else if (id === "antigravity-cli") {
        append(parsePlainModelList(output));
      } else {
        append(parseModelsFromHelp(output));
      }
    } catch {
      // Keep models found by another safe local source, then use the fallback.
    }
  }
  return detected;
}

async function readCodexConfiguredModel(): Promise<string | undefined> {
  try {
    const content = await readFile(join(homedir(), ".codex", "config.toml"), "utf8");
    return content.match(/^model\s*=\s*["']([^"']+)["']/m)?.[1];
  } catch {
    return undefined;
  }
}

async function readCodexCachedModels(): Promise<string[]> {
  try {
    return parseCodexModelCache(await readFile(join(homedir(), ".codex", "models_cache.json"), "utf8"));
  } catch {
    return [];
  }
}

/** Qoder stores a model label separately from its credentials. Never read auth files. */
async function readQoderConfiguredModel(): Promise<string | undefined> {
  try {
    const content = await readFile(join(homedir(), ".qoder", ".models", "default"), "utf8");
    const parsed = JSON.parse(content) as { key?: unknown };
    return typeof parsed.key === "string" && parsed.key.trim() ? parsed.key.trim() : undefined;
  } catch {
    return undefined;
  }
}

async function requestWithTimeout(
  url: string,
  headers: Record<string, string>,
  timeoutMilliseconds = 4_000,
): Promise<number> {
  let timeoutId: number | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = window.setTimeout(() => reject(new Error("连接超时")), timeoutMilliseconds);
    });
    const response = await Promise.race([
      requestUrl({ url, method: "GET", headers }),
      timeout,
    ]);
    return response.status;
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
  }
}

function modelListEndpoint(endpoint: string, fallback: string): string {
  const base = (endpoint.trim() || fallback).replace(/\/+$/, "");
  if (/\/chat\/completions$/i.test(base)) return base.replace(/\/chat\/completions$/i, "/models");
  if (/\/messages$/i.test(base)) return base.replace(/\/messages$/i, "/models");
  return /\/models$/i.test(base) ? base : `${base}/models`;
}

async function detectAnthropicAPI(
  settings: AIPropertySettings,
  options: AIProviderDetectionOptions,
): Promise<AIProviderAvailability> {
  const base = {
    id: "anthropic-api" as const,
    name: providerName("anthropic-api"),
    installed: false,
  };
  if (!options.secretStorageAvailable) {
    return { ...base, available: false, configured: false, detail: "当前 Obsidian 版本不支持安全密钥存储" };
  }
  if (settings.provider !== "anthropic-api") {
    return { ...base, available: false, configured: false, detail: "尚未选择并配置 Anthropic API" };
  }
  if (!options.anthropicApiKey) {
    return { ...base, available: false, configured: false, detail: "尚未保存 Anthropic API Key" };
  }
  if (!configuredModel(settings)) {
    return { ...base, available: false, configured: false, detail: "尚未选择 Anthropic 模型" };
  }
  try {
    const status = await requestWithTimeout(
      modelListEndpoint(settings.endpoint, "https://api.anthropic.com/v1"),
      {
        "x-api-key": options.anthropicApiKey,
        "anthropic-version": "2023-06-01",
      },
    );
    const available = status >= 200 && status < 300;
    return {
      ...base,
      available,
      configured: true,
      detail: available ? "密钥与 Anthropic 接口连接正常" : `Anthropic 接口返回 HTTP ${status}`,
    };
  } catch (error) {
    return {
      ...base,
      available: false,
      configured: true,
      detail: `Anthropic 接口不可用：${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function detectOpenAICompatibleAPI(
  settings: AIPropertySettings,
  options: AIProviderDetectionOptions,
): Promise<AIProviderAvailability> {
  const base = {
    id: "openai-compatible" as const,
    name: providerName("openai-compatible"),
    installed: false,
  };
  if (settings.provider !== "openai-compatible") {
    return { ...base, available: false, configured: false, detail: "尚未选择并配置 OpenAI 兼容接口" };
  }
  if (!configuredModel(settings)) {
    return { ...base, available: false, configured: false, detail: "尚未选择接口模型" };
  }
  const headers: Record<string, string> = {};
  if (options.openAICompatibleApiKey) {
    headers.Authorization = `Bearer ${options.openAICompatibleApiKey}`;
  }
  try {
    const status = await requestWithTimeout(
      modelListEndpoint(settings.endpoint, "http://127.0.0.1:11434/v1"),
      headers,
    );
    const available = status >= 200 && status < 300;
    return {
      ...base,
      available,
      configured: true,
      detail: available ? "兼容接口连接正常" : `兼容接口返回 HTTP ${status}`,
    };
  } catch (error) {
    return {
      ...base,
      available: false,
      configured: true,
      detail: `兼容接口不可用：${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function detectAIProviders(
  settings: AIPropertySettings,
  options: AIProviderDetectionOptions,
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
    ];
  const anthropic = await detectAnthropicAPI(settings, options);
  const openAICompatible = await detectOpenAICompatibleAPI(settings, options);
  return [
    ...cli,
    anthropic,
    openAICompatible,
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
  const result = await runLocalCommand(executable, args, prompt, settings.timeoutSeconds);
  if (result.exitCode !== 0) throw new Error(result.stderr.trim() || `Codex CLI 退出码 ${result.exitCode}`);
  return extractCodexMessage(result.stdout);
}

async function runClaude(settings: AIPropertySettings, prompt: string, executablePath?: string): Promise<string> {
  const executable = settings.executablePath.trim() || executablePath || "claude";
  const args = ["-p", "--output-format", "json"];
  if (configuredModel(settings)) args.push("--model", configuredModel(settings));
  const result = await runLocalCommand(executable, args, prompt, settings.timeoutSeconds);
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
  const result = await runLocalCommand(executable, args, "", settings.timeoutSeconds);
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
  const result = await runLocalCommand(executable, args, "", settings.timeoutSeconds);
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
  const result = await runLocalCommand(executable, args, "", settings.timeoutSeconds);
  if (result.exitCode !== 0) throw new Error(result.stderr.trim() || `Kimi Code CLI 退出码 ${result.exitCode}`);
  if (!result.stdout.trim()) throw new Error("Kimi Code CLI 没有返回文本结果");
  return result.stdout;
}

async function runMiniMax(settings: AIPropertySettings, prompt: string, executablePath?: string): Promise<string> {
  const executable = settings.executablePath.trim() || executablePath || "mmx";
  const args = ["text", "chat", "--message", prompt];
  if (configuredModel(settings)) args.push("--model", configuredModel(settings));
  const result = await runLocalCommand(executable, args, "", settings.timeoutSeconds);
  if (result.exitCode !== 0) throw new Error(result.stderr.trim() || `MiniMax CLI 退出码 ${result.exitCode}`);
  if (!result.stdout.trim()) throw new Error("MiniMax CLI 没有返回文本结果");
  return result.stdout;
}

async function runGLM(settings: AIPropertySettings, prompt: string, executablePath?: string): Promise<string> {
  const executable = settings.executablePath.trim() || executablePath || "zai";
  const args = configuredModel(settings) ? ["--model", configuredModel(settings), prompt] : [prompt];
  const result = await runLocalCommand(executable, args, "", settings.timeoutSeconds);
  if (result.exitCode !== 0) throw new Error(result.stderr.trim() || `GLM CLI 退出码 ${result.exitCode}`);
  if (!result.stdout.trim()) throw new Error("GLM CLI 没有返回文本结果");
  return result.stdout;
}

async function runCodeBuddy(settings: AIPropertySettings, prompt: string, executablePath?: string): Promise<string> {
  const executable = settings.executablePath.trim() || executablePath || "codebuddy";
  const args = ["--print", "--permission-mode", "plan", "--tools", "", "--max-turns", "1"];
  if (configuredModel(settings)) args.push("--model", configuredModel(settings));
  args.push(prompt);
  const result = await runLocalCommand(executable, args, "", settings.timeoutSeconds);
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
  if (settings.provider === "anthropic-api") return runAnthropic(settings, prompt, apiKey);
  return runOpenAICompatible(settings, prompt, apiKey);
}
