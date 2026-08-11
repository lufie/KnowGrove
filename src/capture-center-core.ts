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
