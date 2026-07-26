import type { AIProviderAvailability, AIProviderId } from "./types";

export const FALLBACK_PROVIDER_MODELS: Partial<Record<AIProviderId, string[]>> = {
  "kimi-cli": ["kimi-code/kimi-for-coding"],
  "glm-cli": ["glm-5.2", "glm-5.1", "glm-5-turbo", "glm-4.5-air"],
  "codebuddy-cli": ["default", "sonnet", "opus"],
};

/** Build a short, duplicate-free list suitable for a settings dropdown. */
export function providerModelOptions(provider: AIProviderId, availability?: AIProviderAvailability): string[] {
  return Array.from(new Set([
    ...(availability?.models ?? FALLBACK_PROVIDER_MODELS[provider] ?? []),
    ...(availability?.configuredModel ? [availability.configuredModel] : []),
  ].filter(Boolean)));
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
    return "Qoder CLI 已启动，但当前 CLI 登录账户没有可用模型权限或套餐。请先在终端完成 Qoder CLI 登录并确认订阅/额度，再点击“测试模型”。";
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
