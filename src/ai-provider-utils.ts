import type { AIProviderAvailability, AIProviderId } from "./types";

export const FALLBACK_PROVIDER_MODELS: Partial<Record<AIProviderId, string[]>> = {
  "kimi-cli": ["kimi-code/kimi-for-coding"],
  "glm-cli": ["glm-5.2", "glm-5.1", "glm-5-turbo", "glm-4.5-air"],
  "codebuddy-cli": [
    "hy3",
    "glm-5.2",
    "glm-5.1",
    "glm-5v-turbo",
    "minimax-m3",
    "minimax-m2.7",
    "kimi-k3-1",
    "kimi-k2.7",
    "kimi-k2.6",
    "deepseek-v4-pro",
    "deepseek-v4-flash",
  ],
};

/** Build a short, duplicate-free list suitable for a settings dropdown. */
export function providerModelOptions(provider: AIProviderId, availability?: AIProviderAvailability): string[] {
  return Array.from(new Set([
    ...(availability?.models ?? FALLBACK_PROVIDER_MODELS[provider] ?? []),
    ...(availability?.configuredModel ? [availability.configuredModel] : []),
  ].filter(Boolean)));
}

/** Extract CodeBuddy's current model IDs from its own `--help` output. */
export function parseCodeBuddyModels(helpText: string): string[] {
  const supported = helpText.match(/Currently supported:\s*\(([^)]{1,2000})\)/i)?.[1] ?? "";
  return normalizeModelIds(supported.split(","));
}

function normalizeModelIds(values: string[]): string[] {
  return Array.from(new Set(
    values
      .map((model) => model.trim().replace(/^["'`]|["'`),.;:]$/g, ""))
      .filter((model) => /^[a-z0-9][a-z0-9._:/-]{0,127}$/i.test(model))
      .filter((model) => !/^(?:model|models|default|auto|text|json|true|false)$/i.test(model)),
  )).slice(0, 60);
}

/** Parse the authenticated table emitted by Qoder's documented --list-models switch. */
export function parseQoderModels(output: string): string[] {
  return normalizeModelIds(
    output
      .split(/\r?\n/)
      .map((line) => line.trim().split(/\s{2,}|\t/)[0] ?? "")
      .filter((line) => line && !/^MODEL$/i.test(line) && !/^[-=]+$/.test(line)),
  );
}

/** Read Codex's own refreshed cache; hidden or retired entries stay out of the selector. */
export function parseCodexModelCache(json: string): string[] {
  try {
    const parsed = JSON.parse(json) as {
      models?: Array<{ slug?: unknown; visibility?: unknown }>;
    };
    return normalizeModelIds((parsed.models ?? [])
      .filter((model) => model.visibility !== "hide")
      .map((model) => typeof model.slug === "string" ? model.slug : ""));
  } catch {
    return [];
  }
}

/**
 * Extract model IDs only from model-specific help text. This is intentionally
 * conservative so unrelated choice lists such as permission modes never enter
 * the model selector.
 */
export function parseModelsFromHelp(helpText: string): string[] {
  const text = helpText.replace(/\u001b\[[0-9;]*m/g, "");
  const candidates: string[] = [];
  const supported = text.match(/Currently supported:\s*\(([^)]{1,4000})\)/i)?.[1];
  if (supported) candidates.push(...supported.split(","));
  for (const match of text.matchAll(/--model(?:\s+|=)(?:<[^>]+>|[A-Z_-]+)?[^\r\n]*/gi)) {
    const line = match[0];
    for (const value of line.matchAll(/(?:default|example)\s*:\s*([a-z0-9][a-z0-9._:/-]*)/gi)) {
      candidates.push(value[1]!);
    }
    const choices = line.match(/choices?\s*:\s*\(?([^)]+)\)?/i)?.[1];
    if (choices) candidates.push(...choices.split(/[,|]/));
    const aliases = line.match(/aliases?\s*:\s*\(?([^)]+)\)?/i)?.[1];
    if (aliases) candidates.push(...aliases.split(/[,|]/));
  }
  for (const match of text.matchAll(/--model\s+([a-z0-9][a-z0-9._:/-]{1,127})/gi)) {
    candidates.push(match[1]!);
  }
  return normalizeModelIds(candidates);
}

/** Parse plain one-model-per-line output used by CLI model-list commands. */
export function parsePlainModelList(output: string): string[] {
  return normalizeModelIds(output
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[*•✓✔-]\s*/, ""))
    .map((line) => line.split(/\s{2,}|\t/)[0] ?? ""));
}

export function automaticAIContentCharacterLimit(
  provider: AIProviderId,
  configuredModel = "",
  detectedModel = "",
): number {
  const model = `${configuredModel} ${detectedModel}`.toLowerCase();
  if (provider === "openai-compatible") {
    return /\b(gpt-5|claude|gemini|qwen|deepseek|glm-5|llama-4)\b/.test(model)
      ? 24_000
      : 12_000;
  }
  return 24_000;
}

/**
 * Turn known CLI failures into an actionable message without hiding the raw
 * provider message, which remains important for support and diagnostics.
 */
export function formatCLIProviderError(provider: AIProviderId, raw: string, fallback: string): string {
  const detail = raw.trim() || fallback;
  if (provider === "antigravity-cli" && /Agent execution terminated due to error/i.test(detail)) {
    return "Antigravity CLI 已启动，但服务端拒绝了这次非交互调用。请检查 CLI 登录、账户权限和服务地区；若终端日志出现 “User location is not supported”，请改用支持地区的账户/网络，或选择其他模型引擎。";
  }
  if (provider === "qoder-cli" && (/FORBIDDEN/i.test(detail) || /pricingUrl/i.test(detail))) {
    return "Qoder CLI 已启动，但当前 CLI 登录账户没有可用模型权限或套餐。请先在终端完成 Qoder CLI 登录并确认订阅或额度，再重新检测。";
  }
  return detail;
}

/**
 * agy treats the value immediately after --print as prompt content; it does
 * not read the prompt from stdin in print mode. Keep all flags before it.
 */
export function buildAntigravityArguments(model: string, prompt: string): string[] {
  const args = ["--sandbox"];
  if (model.trim()) args.push("--model", model.trim());
  args.push("--print", prompt);
  return args;
}
