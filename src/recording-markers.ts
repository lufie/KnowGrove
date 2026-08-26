export const RECORDING_MARKER_SCHEMA = "knowgrove-markers-v1";

export interface RecordingMarker {
  id: string;
  sequence: number;
  offsetMs: number;
  createdAt: string;
  source: string;
  title: string | null;
  inputIndex: number;
}

export interface ParsedRecordingMarkers {
  markers: RecordingMarker[];
  rawBlock: string;
  diagnostics: string[];
}

export interface TimedTranscriptSegment {
  startMs: number;
  endMs: number;
  text: string;
}

export interface AlignedRecordingMarker extends RecordingMarker {
  segment?: TimedTranscriptSegment;
  match: "contains" | "next" | "last" | "none";
}

const MARKER_BLOCK_PATTERN = new RegExp(
  String.raw`(^|\n)(?:([ \t]*%%[ \t]*\r?\n))?([ \t]*${RECORDING_MARKER_SCHEMA}[ \t]*\r?\n)([^\r\n]+)(\r?\n[ \t]*%%[ \t]*(?=\r?\n|$))?`,
  "g",
);

function finiteInteger(value: unknown, minimum: number): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= minimum
    ? value
    : undefined;
}

function markerString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function parseRecordingMarkers(markdown: string): ParsedRecordingMarkers | undefined {
  MARKER_BLOCK_PATTERN.lastIndex = 0;
  const match = MARKER_BLOCK_PATTERN.exec(markdown);
  if (!match) return undefined;
  const rawBlock = `${match[2] ?? ""}${match[3] ?? ""}${match[4] ?? ""}${match[5] ?? ""}`;
  const diagnostics: string[] = [];
  let payload: unknown;
  try {
    payload = JSON.parse(match[4] ?? "");
  } catch {
    return { markers: [], rawBlock, diagnostics: ["关键时刻 JSON 无法解析"] };
  }
  if (!payload || typeof payload !== "object") {
    return { markers: [], rawBlock, diagnostics: ["关键时刻 JSON 根节点不是对象"] };
  }
  const object = payload as Record<string, unknown>;
  if (object.schema !== RECORDING_MARKER_SCHEMA) {
    return { markers: [], rawBlock, diagnostics: ["关键时刻 schema 不匹配"] };
  }
  if (!Array.isArray(object.markers)) {
    return { markers: [], rawBlock, diagnostics: ["关键时刻 markers 不是数组"] };
  }

  const markers: RecordingMarker[] = [];
  object.markers.forEach((raw, inputIndex) => {
    if (!raw || typeof raw !== "object") {
      diagnostics.push(`第 ${inputIndex + 1} 个关键时刻不是对象`);
      return;
    }
    const value = raw as Record<string, unknown>;
    const id = markerString(value.id);
    const sequence = finiteInteger(value.sequence, 1);
    const offsetMs = finiteInteger(value.offset_ms, 0);
    const createdAt = markerString(value.created_at);
    const source = markerString(value.source);
    const title = value.title === null ? null : typeof value.title === "string" ? value.title : undefined;
    if (!id || sequence === undefined || offsetMs === undefined || !createdAt || !source || title === undefined) {
      diagnostics.push(`第 ${inputIndex + 1} 个关键时刻字段不完整`);
      return;
    }
    markers.push({ id, sequence, offsetMs, createdAt, source, title, inputIndex });
  });
  markers.sort((left, right) => left.sequence - right.sequence || left.inputIndex - right.inputIndex);
  return { markers, rawBlock, diagnostics };
}

export function stripRecordingMarkerBlocks(markdown: string): string {
  MARKER_BLOCK_PATTERN.lastIndex = 0;
  return markdown.replace(MARKER_BLOCK_PATTERN, (_match, prefix: string) => prefix || "");
}

function srtTimestampMilliseconds(value: string): number | undefined {
  const match = value.trim().match(/^(\d{1,3}):(\d{2}):(\d{2})[,.](\d{3})$/);
  if (!match) return undefined;
  return (((Number(match[1]) * 60 + Number(match[2])) * 60 + Number(match[3])) * 1_000) + Number(match[4]);
}

export function parseTimedTranscriptSrt(source: string): TimedTranscriptSegment[] {
  const segments: TimedTranscriptSegment[] = [];
  for (const block of source.replace(/^\uFEFF/, "").split(/\r?\n\s*\r?\n/)) {
    const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    if (timingIndex < 0) continue;
    const [startRaw, endRawWithSettings] = lines[timingIndex]!.split(/\s*-->\s*/, 2);
    const endRaw = endRawWithSettings?.split(/\s+/, 1)[0];
    const startMs = startRaw ? srtTimestampMilliseconds(startRaw) : undefined;
    const endMs = endRaw ? srtTimestampMilliseconds(endRaw) : undefined;
    const text = lines.slice(timingIndex + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (startMs === undefined || endMs === undefined || endMs < startMs || !text) continue;
    segments.push({ startMs, endMs, text });
  }
  return segments.sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs);
}

export function alignRecordingMarkers(
  markers: readonly RecordingMarker[],
  segments: readonly TimedTranscriptSegment[],
): AlignedRecordingMarker[] {
  const orderedSegments = [...segments].sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs);
  return markers.map((marker) => {
    const containing = orderedSegments.find((segment) => (
      segment.startMs <= marker.offsetMs && marker.offsetMs <= segment.endMs
    ));
    if (containing) return { ...marker, segment: containing, match: "contains" };
    const next = orderedSegments.find((segment) => segment.startMs > marker.offsetMs);
    if (next) return { ...marker, segment: next, match: "next" };
    const last = orderedSegments[orderedSegments.length - 1];
    return last
      ? { ...marker, segment: last, match: "last" }
      : { ...marker, match: "none" };
  });
}

export function formatMarkerOffset(offsetMs: number): string {
  const totalSeconds = Math.floor(Math.max(0, offsetMs) / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

export function recordingMarkerHref(offsetMs: number): string {
  return `#knowgrove-marker-${Math.max(0, Math.floor(offsetMs))}`;
}

export function recordingMarkerOffsetFromHref(href: string | null | undefined): number | undefined {
  const match = String(href ?? "").match(/^#knowgrove-marker-(\d+)$/);
  return match ? Number(match[1]) : undefined;
}

function inlineText(value: string): string {
  return value.replace(/[\r\n|]+/g, " ").replace(/\s+/g, " ").trim();
}

export function renderAlignedRecordingMarkers(
  markers: readonly AlignedRecordingMarker[],
  heading = "### 关键时刻",
): string {
  if (!markers.length) return "";
  const lines = [heading, ""];
  for (const marker of markers) {
    const label = inlineText(marker.title ?? "") || `标记 ${marker.sequence}`;
    const excerpt = marker.segment?.text ? ` — ${inlineText(marker.segment.text)}` : "";
    lines.push(`- [${formatMarkerOffset(marker.offsetMs)} · ${label}](${recordingMarkerHref(marker.offsetMs)})${excerpt}`);
    lines.push(`  - id: ${marker.id}; sequence: ${marker.sequence}; offset_ms: ${marker.offsetMs}; created_at: ${marker.createdAt}; source: ${inlineText(marker.source)}`);
  }
  return lines.join("\n");
}

export function recordingMarkerHeading(locale: string): string {
  const normalized = locale.trim().toLowerCase();
  if (normalized === "zh-tw" || normalized === "zh-hk") return "### 關鍵時刻";
  if (normalized.startsWith("zh")) return "### 关键时刻";
  if (normalized.startsWith("ja")) return "### 重要な瞬間";
  if (normalized.startsWith("ko")) return "### 주요 순간";
  if (normalized.startsWith("de")) return "### Wichtige Momente";
  if (normalized.startsWith("fr")) return "### Moments clés";
  if (normalized.startsWith("es")) return "### Momentos clave";
  if (normalized.startsWith("pt")) return "### Momentos importantes";
  if (normalized.startsWith("ru")) return "### Ключевые моменты";
  return "### Key moments";
}

export function appendPreservedRecordingMarkerBlock(markdown: string, rawBlock: string): string {
  if (!rawBlock || markdown.includes(rawBlock)) return markdown;
  return `${markdown.trimEnd()}\n\n${rawBlock}\n`;
}

export function normalizeGeneratedMarkdownPreservingMarkers(markdown: string): string {
  const parsed = parseRecordingMarkers(markdown);
  if (!parsed?.rawBlock) return markdown.replace(/\n{3,}/g, "\n\n");
  const placeholder = "<!-- KNOWGROVE_PRESERVED_MARKERS_V1 -->";
  return markdown.replace(parsed.rawBlock, placeholder)
    .replace(/\n{3,}/g, "\n\n")
    .replace(placeholder, parsed.rawBlock);
}
