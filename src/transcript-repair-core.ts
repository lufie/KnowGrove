import { findTranscriptSection, renderReadableTranscript, restoreTranscriptReadability, type TranscriptReadability } from "./transcript-readability";

export interface TranscriptRepairHost {
  read(): Promise<string>;
  backup(original: string): Promise<void>;
  commit(original: string, updated: string): Promise<void>;
  run(prompt: string, signal?: AbortSignal): Promise<string>;
}

export async function repairTranscriptNote(
  host: TranscriptRepairHost,
  locale: string,
  signal?: AbortSignal,
  progress?: (processed: number, total: number) => Promise<void>,
): Promise<TranscriptReadability> {
  const original = await host.read();
  const section = findTranscriptSection(original);
  if (!section) throw new Error("当前笔记没有完整逐字稿章节");
  const result = await restoreTranscriptReadability(section.source, { run: (prompt, currentSignal) => host.run(prompt, currentSignal), signal, progress, originalProse: section.originalProse });
  if (signal?.aborted) { const error = new Error("任务已取消"); error.name = "AbortError"; throw error; }
  if (result.failed) throw new Error(`${result.failed} 段未通过原词完整性校验，原笔记没有修改，请重试`);
  if (!result.processed) return result;
  const updated = `${original.slice(0, section.start)}\n\n${renderReadableTranscript(result, locale)}\n\n${original.slice(section.end)}`;
  if (await host.read() !== original) throw new Error("处理期间笔记有新编辑，已停止覆盖，请重试");
  await host.backup(original);
  if (signal?.aborted) { const error = new Error("任务已取消"); error.name = "AbortError"; throw error; }
  await host.commit(original, updated);
  if (await host.read() !== updated) throw new Error("逐字稿写入后回读不一致，请检查笔记与备份");
  return result;
}
