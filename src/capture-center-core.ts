export type DesktopRecordingState =
  | "idle"
  | "requesting"
  | "recording"
  | "interrupted"
  | "resuming"
  | "finalizing"
  | "completed"
  | "needs-attention";

export interface DesktopRecordingSegment {
  index: number;
  relativePath: string;
  startedAt: string;
  endedAt?: string;
  durationMilliseconds: number;
  fileSize: number;
  mimeType: string;
}

export interface DesktopRecordingInterruption {
  startedAt: string;
  endedAt?: string;
  reason: string;
  resumedAutomatically?: boolean;
}

export interface DesktopRecordingManifest {
  version: 1;
  id: string;
  title: string;
  state: DesktopRecordingState;
  createdAt: string;
  endedAt?: string;
  recordedMilliseconds: number;
  sessionMilliseconds: number;
  segments: DesktopRecordingSegment[];
  interruptions: DesktopRecordingInterruption[];
  outputPath?: string;
  notePath?: string;
  lastError?: string;
}

export interface DesktopRecordingSnapshot {
  state: DesktopRecordingState;
  sessionId?: string;
  title: string;
  startedAt?: string;
  recordedMilliseconds: number;
  interruptionCount: number;
  message: string;
  outputPath?: string;
  notePath?: string;
}

export type LocalMediaImportType = "audio" | "video";

export interface LocalMediaImportProgress {
  id: string;
  title: string;
  notePath?: string;
  state: "copying" | "queued" | "completed" | "failed";
  message: string;
}

export const LOCAL_MEDIA_IMPORT_AUDIO_EXTENSIONS = [
  "mp3", "m4a", "wav", "aac", "flac", "ogg", "opus", "webm",
] as const;

export const LOCAL_MEDIA_IMPORT_VIDEO_EXTENSIONS = [
  "mp4", "mov", "mkv", "m4v",
] as const;

export const LOCAL_MEDIA_IMPORT_ACCEPT = [
  ...LOCAL_MEDIA_IMPORT_AUDIO_EXTENSIONS,
  ...LOCAL_MEDIA_IMPORT_VIDEO_EXTENSIONS,
].map((extension) => `.${extension}`).join(",");

export const LOCAL_MEDIA_IMPORT_FORMAT_LABEL = [
  `音频：${LOCAL_MEDIA_IMPORT_AUDIO_EXTENSIONS.map((extension) => extension.toUpperCase()).join("、")}`,
  `视频：${LOCAL_MEDIA_IMPORT_VIDEO_EXTENSIONS.map((extension) => extension.toUpperCase()).join("、")}`,
].join("；");

export function localMediaImportType(fileName: string): LocalMediaImportType | undefined {
  const extension = /\.([^.\\/]+)$/.exec(fileName.trim())?.[1]?.toLowerCase();
  if (!extension) return undefined;
  if ((LOCAL_MEDIA_IMPORT_AUDIO_EXTENSIONS as readonly string[]).includes(extension)) return "audio";
  if ((LOCAL_MEDIA_IMPORT_VIDEO_EXTENSIONS as readonly string[]).includes(extension)) return "video";
  return undefined;
}

export function safeLocalMediaImportFileName(fileName: string): string {
  const leafName = fileName.trim().split(/[\\/]/).at(-1) ?? "";
  const match = /^(.*?)(\.[^.]+)$/.exec(leafName);
  const extension = match?.[2]?.toLowerCase() ?? "";
  const stem = (match?.[1] ?? leafName)
    .normalize("NFKC")
    .replace(/[\u0000-\u001F<>:"/\\|?*]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 160) || "本地媒体";
  return `${stem}${extension}`;
}

export function localMediaImportTitle(fileName: string): string {
  return safeLocalMediaImportFileName(fileName).replace(/\.[^.]+$/, "");
}

export function buildLocalMediaImportNote(
  title: string,
  mediaPath: string,
  mediaType: LocalMediaImportType,
  importedAt: Date,
): string {
  const mediaProperty = mediaType === "video" ? "video" : "audio";
  const contentType = mediaType === "video" ? "视频" : "语音";
  return [
    "---",
    `文件名: ${JSON.stringify(title)}`,
    `内容类型: ${JSON.stringify(contentType)}`,
    `${mediaProperty}: ${JSON.stringify(`[[${mediaPath}]]`)}`,
    `采集时间: ${JSON.stringify(importedAt.toISOString())}`,
    "KnowGrove采集状态: \"待处理\"",
    "---",
    "",
    `# ${title}`,
    "",
    `![[${mediaPath}]]`,
    "",
  ].join("\n");
}

export const RECORDING_RESUME_DELAYS_MS = [0, 150, 300, 500, 800, 1_000, 2_000, 3_000, 5_000, 8_000] as const;

export function extractBatchCaptureUrls(input: string): string[] {
  const matches = input.match(/https?:\/\/[^\s<>"'`]+/gi) ?? [];
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const match of matches) {
    const cleaned = match.replace(/[.,;:!?，。；：！？）】》\]}]+$/g, "");
    try {
      const parsed = new URL(cleaned);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
      const normalized = parsed.toString();
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      urls.push(normalized);
    } catch {
      // Ignore malformed text while retaining all valid links in the same paste.
    }
  }
  return urls;
}

export function recordingMimeType(
  isSupported: (mimeType: string) => boolean,
): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mp4",
  ];
  return candidates.find((candidate) => isSupported(candidate)) ?? "";
}

export function recordingExtension(mimeType: string): "webm" | "m4a" {
  return /mp4|m4a/i.test(mimeType) ? "m4a" : "webm";
}

export function recordingStreamCopyExtension(
  segments: Pick<DesktopRecordingSegment, "mimeType">[],
): "webm" | "m4a" | undefined {
  if (!segments.length) return undefined;
  const extension = recordingExtension(segments[0]!.mimeType);
  return segments.every((segment) => recordingExtension(segment.mimeType) === extension)
    ? extension
    : undefined;
}

export function recordingFinalizationMode(
  segments: Pick<DesktopRecordingSegment, "mimeType">[],
): "direct-copy" | "stream-copy" | "transcode" {
  if (segments.length === 1) return "direct-copy";
  return recordingStreamCopyExtension(segments) ? "stream-copy" : "transcode";
}

export function recordingFinalizationMessage(
  segments: Pick<DesktopRecordingSegment, "mimeType">[],
): string {
  return segments.length > 1 ? "正在合并并保存录音" : "正在保存录音";
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function localRecordingFileStem(date: Date): string {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + ` ${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())} 语音记录`;
}

export function batchCaptureFileStem(date: Date, index: number, hostname: string): string {
  const safeHost = hostname.replace(/^www\./i, "").replace(/[^\p{L}\p{N}._-]+/gu, "-").slice(0, 48) || "链接";
  return `${localRecordingFileStem(date).replace(/ 语音记录$/, "")}-${String(index + 1).padStart(2, "0")}-${safeHost}`;
}

export function formatRecordingDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainder = seconds % 60;
  return hours > 0
    ? `${pad(hours)}:${pad(minutes)}:${pad(remainder)}`
    : `${pad(minutes)}:${pad(remainder)}`;
}

export function buildBatchLinkNote(url: string, title: string, capturedAt: Date): string {
  return [
    "---",
    `来源链接: ${JSON.stringify(url)}`,
    `采集时间: ${JSON.stringify(capturedAt.toISOString())}`,
    "KnowGrove采集状态: \"待处理\"",
    "---",
    "",
    `# ${title}`,
    "",
    url,
    "",
  ].join("\n");
}

export function buildDesktopRecordingNote(
  manifest: DesktopRecordingManifest,
  audioPath: string,
): string {
  const interruptions = manifest.interruptions.length
    ? manifest.interruptions.map((item) => {
      const resumed = item.resumedAutomatically === true
        ? "已自动续录"
        : item.resumedAutomatically === false
          ? "需要手动处理"
          : "等待恢复";
      return `- ${item.startedAt}${item.endedAt ? ` → ${item.endedAt}` : ""}：${item.reason}，${resumed}`;
    })
    : ["- 无"];
  return [
    "---",
    `文件名: ${JSON.stringify(manifest.title)}`,
    "type: voice-session",
    `audio: ${JSON.stringify(`[[${audioPath}]]`)}`,
    "tags: [voice-note]",
    `recording_session_id: ${JSON.stringify(manifest.id)}`,
    `recording_started_at: ${JSON.stringify(manifest.createdAt)}`,
    `recording_ended_at: ${JSON.stringify(manifest.endedAt ?? new Date().toISOString())}`,
    `recording_interruptions: ${manifest.interruptions.length}`,
    "KnowGrove采集状态: \"待处理\"",
    "---",
    "",
    `# ${manifest.title}`,
    "",
    `![[${audioPath}]]`,
    "",
    "## 中断记录",
    "",
    ...interruptions,
    "",
    "## 整理记录",
    "",
  ].join("\n");
}
