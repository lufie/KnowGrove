import type { LocalCommandResult } from "./ai-provider";

// Packaged binaries may spend 15+ seconds unpacking/verifying on a cold start.
// Use one bounded startup allowance for capture and runtime readiness checks.
export const TOOL_PROBE_TIMEOUT_SECONDS = 45;

type CommandRunner = (
  executable: string,
  args: string[],
  input: string,
  timeoutSeconds: number,
  signal?: AbortSignal,
) => Promise<LocalCommandResult>;

function checkCancellation(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error("任务已由用户取消");
  error.name = "AbortError";
  throw error;
}

function launchFailure(error: unknown): string {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (code === "ENOENT") return "程序文件不存在或缺少启动依赖";
  if (code === "EACCES" || code === "EPERM") return "系统拒绝执行，请检查程序权限";
  const message = error instanceof Error ? error.message : String(error);
  if (/运行超过|timed?\s*out|timeout/i.test(message)) {
    return `启动检测超过 ${TOOL_PROBE_TIMEOUT_SECONDS} 秒，程序可能启动缓慢或被系统阻止`;
  }
  return "程序启动失败，请检查运行组件";
}

export async function probeLocalTool(
  run: CommandRunner,
  executable: string,
  args: string[],
  signal?: AbortSignal,
): Promise<void> {
  checkCancellation(signal);
  let result: LocalCommandResult;
  try {
    result = await run(executable, args, "", TOOL_PROBE_TIMEOUT_SECONDS, signal);
  } catch (error) {
    checkCancellation(signal);
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new Error(launchFailure(error));
  }
  checkCancellation(signal);
  if (result.exitCode !== 0) {
    throw new Error(`程序启动后异常退出（退出码 ${result.exitCode}），请检查运行组件`);
  }
}

export async function resolveProbedTool(
  run: CommandRunner,
  candidates: string[],
  label: string,
  args: string[],
  signal?: AbortSignal,
): Promise<string> {
  let failure = "没有配置可用的程序";
  for (const candidate of new Set(candidates.filter(Boolean))) {
    try {
      await probeLocalTool(run, candidate, args, signal);
      return candidate;
    } catch (error) {
      checkCancellation(signal);
      if (error instanceof Error && error.name === "AbortError") throw error;
      failure = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(`${label} 启动检查未通过：${failure}。请在组件设置中检查工具路径或重新配置运行环境。`);
}
