import { decodeTranscriptBody, findTranscriptSection, renderReadableTranscript, restoreTranscriptReadability, transcriptProse, transcriptRegions, type TranscriptReadability } from "./transcript-readability";
import { createHash, randomUUID } from "node:crypto";

type TranscriptSection = NonNullable<ReturnType<typeof findTranscriptSection>>;
export type TranscriptRunOptions = Parameters<typeof restoreTranscriptReadability>[1];

function proseHash(text: string): string { return createHash("sha256").update(text.replace(/\s/gu, "")).digest("hex"); }

export function wrapEmbeddedTranscript(source: string): string {
  const id = randomUUID();
  return `<!-- knowgrove:embedded-transcript:start id=${id} sha256=${proseHash(transcriptProse(source))} -->\n\n${source}\n\n<!-- knowgrove:embedded-transcript:end id=${id} -->`;
}

// Explicit collector-owned bounds: never infer ownership from article headings,
// arbitrary URLs, or prose following a media item. Legacy articles are not guessed.
export function findEmbeddedTranscriptSections(markdown: string): TranscriptSection[] {
  const markers = Array.from(markdown.matchAll(/^<!-- knowgrove:embedded-transcript:(start|end) id=([a-f0-9-]{36})(?: sha256=([a-f0-9]{64}))? -->[\t ]*\r?$/gm));
  const masked = markdown.replace(/^<!-- knowgrove:embedded-transcript:(?:start|end)[^\n]*$/gm, line => " ".repeat(line.length));
  const allowed: { start: number; end: number }[] = [];
  let offset = 0;
  for (const region of transcriptRegions(masked)) {
    if (!region.opaque) allowed.push({ start: offset, end: offset + region.text.length });
    offset += region.text.length;
  }
  const sections: TranscriptSection[] = [];
  let open: typeof markers[number] | undefined;
  const ids = new Set<string>();
  for (const marker of markers) {
    if (!allowed.some(range => marker.index >= range.start && marker.index < range.end)) continue;
    if (marker[1] === "start") {
      if (open || ids.has(marker[2]!) || !marker[3]) throw new Error("内嵌逐字稿范围标记异常，已停止覆盖");
      open = marker;
      ids.add(marker[2]!);
    } else {
      if (!open || marker[2] !== open[2] || marker[3]) throw new Error("内嵌逐字稿范围标记不匹配，已停止覆盖");
      const start = open.index + open[0].length;
      const decoded = decodeTranscriptBody(markdown.slice(start, marker.index));
      if (proseHash(decoded.originalProse ?? transcriptProse(decoded.source)) !== open[3]) throw new Error("内嵌逐字稿原稿校验失败，已停止覆盖");
      sections.push({ start, end: marker.index, ...decoded });
      open = undefined;
    }
  }
  if (open) throw new Error("内嵌逐字稿缺少结束标记，已停止覆盖");
  return sections;
}

export function findRepairableTranscriptSections(markdown: string): TranscriptSection[] {
  const full = findTranscriptSection(markdown);
  return full ? [full] : findEmbeddedTranscriptSections(markdown);
}

export function replaceTranscriptSections(markdown: string, sections: TranscriptSection[], results: TranscriptReadability[], locale: string): string {
  let output = markdown;
  for (let index = sections.length - 1; index >= 0; index--) {
    const section = sections[index]!;
    const result = results[index]!;
    if (!result.processed) continue;
    output = `${output.slice(0, section.start)}\n\n${renderReadableTranscript(result, locale)}\n\n${output.slice(section.end)}`;
  }
  return output;
}

export async function prepareCaptureReadability(
  pageType: "article" | "audio" | "video",
  rawNote: string,
  source: string,
  locale: string,
  options: TranscriptRunOptions,
): Promise<{ aiSource: string; transcript?: TranscriptReadability; articleSource?: string; failed: number }> {
  if (pageType !== "article") {
    const section = findTranscriptSection(rawNote);
    const transcript = await restoreTranscriptReadability(section?.source ?? source, { ...options, originalProse: section?.originalProse });
    return { aiSource: transcriptProse(transcript.text), transcript, failed: transcript.failed };
  }
  const sections = findEmbeddedTranscriptSections(source);
  if (!sections.length) return { aiSource: source, failed: 0 };
  const results: TranscriptReadability[] = [];
  for (let index = 0; index < sections.length; index++) {
    const section = sections[index]!;
    results.push(await restoreTranscriptReadability(section.source, { ...options, originalProse: section.originalProse,
      progress: async (processed, total) => options.progress?.(Math.round((index + processed / Math.max(1, total)) / sections.length * 100), 100),
    }));
  }
  let aiSource = source;
  // Model input retains article structure but excludes embedded backup payloads.
  for (let index = sections.length - 1; index >= 0; index--) {
    const section = sections[index]!;
    aiSource = `${aiSource.slice(0, section.start)}\n\n${transcriptProse(results[index]!.text)}\n\n${aiSource.slice(section.end)}`;
  }
  return { aiSource, articleSource: replaceTranscriptSections(source, sections, results, locale), failed: results.reduce((count, result) => count + result.failed, 0) };
}
