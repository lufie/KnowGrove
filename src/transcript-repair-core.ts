import { restoreTranscriptReadability, type TranscriptReadability } from "./transcript-readability";
import { findRepairableTranscriptSections, replaceTranscriptSections } from "./transcript-pipeline";

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
  const sections = findRepairableTranscriptSections(original);
  if (!sections.length) throw new Error("当前笔记没有完整逐字稿或内嵌媒体逐字稿章节");
  const results: TranscriptReadability[] = [];
  for (let index = 0; index < sections.length; index++) {
    const section = sections[index]!;
    results.push(await restoreTranscriptReadability(section.source, { run: (prompt, currentSignal) => host.run(prompt, currentSignal), signal,
      progress: async (processed, total) => progress?.(Math.round((index + processed / Math.max(1, total)) / sections.length * 100), 100), originalProse: section.originalProse }));
  }
  const result: TranscriptReadability = { text: results.map(item => item.text).join("\n\n"), originalProse: results.map(item => item.originalProse).join("\n\n"), processed: results.reduce((sum, item) => sum + item.processed, 0), failed: results.reduce((sum, item) => sum + item.failed, 0) };
  if (signal?.aborted) { const error = new Error("任务已取消"); error.name = "AbortError"; throw error; }
  if (result.failed) throw new Error(`${result.failed} 段未通过原词完整性校验，原笔记没有修改，请重试`);
  if (!result.processed) return result;
  const updated = replaceTranscriptSections(original, sections, results, locale);
  if (await host.read() !== original) throw new Error("处理期间笔记有新编辑，已停止覆盖，请重试");
  await host.backup(original);
  if (signal?.aborted) { const error = new Error("任务已取消"); error.name = "AbortError"; throw error; }
  await host.commit(original, updated);
  if (await host.read() !== updated) throw new Error("逐字稿写入后回读不一致，请检查笔记与备份");
  return result;
}
