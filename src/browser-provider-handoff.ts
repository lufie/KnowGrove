import type { AIPropertySettings, AIProviderId } from "./types";

export interface BrowserProviderRunResult {
  output: string;
  providerId: AIProviderId;
  handoffCount: number;
}

interface BrowserProviderHandoffOptions {
  requestedProvider: AIProviderId;
  getSettings(): AIPropertySettings;
  execute(settings: AIPropertySettings, signal: AbortSignal, attempt: number): Promise<string>;
  signal?: AbortSignal;
  pollIntervalMilliseconds?: number;
  maxHandoffs?: number;
  scheduleInterval?: (callback: () => void, milliseconds: number) => unknown;
  clearScheduledInterval?: (handle: unknown) => void;
}

export function snapshotBrowserProviderSettings(settings: AIPropertySettings): AIPropertySettings {
  return { ...settings };
}

export function browserProviderConfigurationKey(settings: AIPropertySettings): string {
  return JSON.stringify({
    provider: settings.provider,
    model: settings.model,
    executablePath: settings.executablePath,
    endpoint: settings.endpoint,
    timeoutSeconds: settings.timeoutSeconds,
  });
}

function abortError(): Error {
  const error = new Error("任务已由用户取消");
  error.name = "AbortError";
  return error;
}

/**
 * Keeps a capture task bound to the live model configuration. A settings change
 * stops only the in-flight provider process and hands the same prompt to the new
 * configuration. User cancellation still stops the whole task immediately.
 */
export async function runBrowserProviderWithHandoff(
  options: BrowserProviderHandoffOptions,
): Promise<BrowserProviderRunResult> {
  const pollInterval = Math.max(25, options.pollIntervalMilliseconds ?? 250);
  const maxHandoffs = Math.max(1, options.maxHandoffs ?? 3);
  const scheduleInterval = options.scheduleInterval
    ?? ((callback: () => void, milliseconds: number) => window.setInterval(callback, milliseconds));
  const clearScheduledInterval = options.clearScheduledInterval
    ?? ((handle: unknown) => window.clearInterval(handle as number));
  let settings = snapshotBrowserProviderSettings(options.getSettings());
  if (!settings.provider) settings.provider = options.requestedProvider;
  let handoffCount = settings.provider === options.requestedProvider ? 0 : 1;

  for (let attempt = 0; attempt <= maxHandoffs; attempt += 1) {
    if (options.signal?.aborted) throw abortError();
    const attemptSettings = snapshotBrowserProviderSettings(settings);
    const attemptKey = browserProviderConfigurationKey(attemptSettings);
    const controller = new AbortController();
    let configurationChanged = false;
    let latestSettings = attemptSettings;
    const abortFromParent = (): void => controller.abort();
    options.signal?.addEventListener("abort", abortFromParent, { once: true });
    const timer = scheduleInterval(() => {
      const current = snapshotBrowserProviderSettings(options.getSettings());
      if (browserProviderConfigurationKey(current) === attemptKey) return;
      latestSettings = current;
      configurationChanged = true;
      controller.abort();
    }, pollInterval);

    try {
      const output = await options.execute(attemptSettings, controller.signal, attempt);
      return {
        output,
        providerId: attemptSettings.provider,
        handoffCount,
      };
    } catch (error) {
      if (options.signal?.aborted) throw abortError();
      const current = configurationChanged
        ? latestSettings
        : snapshotBrowserProviderSettings(options.getSettings());
      const hasNewConfiguration = browserProviderConfigurationKey(current) !== attemptKey;
      if (!hasNewConfiguration) throw error;
      if (handoffCount >= maxHandoffs) {
        throw new Error(`处理期间模型配置切换超过 ${maxHandoffs} 次，任务已停止，请重新处理`);
      }
      settings = current;
      handoffCount += 1;
    } finally {
      clearScheduledInterval(timer);
      options.signal?.removeEventListener("abort", abortFromParent);
    }
  }

  throw new Error("模型配置接力未完成，请重新处理");
}
