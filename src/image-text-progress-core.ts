import { parseImageOccurrences, type ImageOccurrence } from "./image-layout-core";
import { imageTextOccurrenceReference } from "./image-to-text-core";

export type ImageTextTaskPhase =
  | "preparing"
  | "loading"
  | "calling-model"
  | "validating"
  | "writing"
  | "verifying"
  | "cancelling"
  | "completed"
  | "failed"
  | "cancelled";

export interface ImageTextOccurrenceIdentity {
  raw: string;
  target: string;
  anchorOffset: number;
  reference?: string;
  duplicateOrdinal?: number;
  duplicateCount?: number;
  locateManagedResult?: boolean;
}

export interface ImageTextFailureDetail {
  target: string;
  category: string;
  message: string;
}

export function imageTextFailureCategory(message: string, skipped = false): string {
  if (skipped) return "文档内容已变化";
  if (/不支持|找不到|名称不唯一|损坏|实际格式|超过 15 MB|读取/.test(message)) return "图片不可读取";
  if (/写入|回读|笔记在识别期间/.test(message)) return "写入校验失败";
  if (/模型|API|HTTP|超时|超过 \d+ 秒/.test(message)) return "模型调用失败";
  return "转换失败";
}

export function formatImageTextFailureSummary(failures: ImageTextFailureDetail[], limit = 3): string {
  if (!failures.length) return "";
  const visible = failures.slice(0, Math.max(1, limit)).map((failure) => `${failure.target}（${failure.category}）`);
  const remaining = failures.length - visible.length;
  return `失败项目：${visible.join("、")}${remaining > 0 ? `，另有 ${remaining} 项` : ""}`;
}

function decodedUrl(value: string): URL | undefined {
  try { return new URL(value); } catch { return undefined; }
}

export function imageResourceMatches(renderedSource: string, expectedSource: string): boolean {
  if (!renderedSource || !expectedSource) return false;
  if (renderedSource === expectedSource) return true;
  const rendered = decodedUrl(renderedSource);
  const expected = decodedUrl(expectedSource);
  if (!rendered || !expected) return false;
  try {
    return decodeURIComponent(rendered.pathname) === decodeURIComponent(expected.pathname)
      && rendered.search === expected.search;
  } catch {
    return rendered.pathname === expected.pathname && rendered.search === expected.search;
  }
}

const PHASE_LABELS: Record<ImageTextTaskPhase, string> = {
  preparing: "正在准备图片",
  loading: "正在读取图片",
  "calling-model": "正在调用模型识别",
  validating: "正在校验识别结果",
  writing: "正在写入图片下方",
  verifying: "正在回读验证结果",
  cancelling: "正在安全停止当前图片…",
  completed: "图片转文字已完成",
  failed: "图片转文字失败",
  cancelled: "图片转文字已取消",
};

export function imageTextPhaseLabel(phase: ImageTextTaskPhase): string {
  return PHASE_LABELS[phase];
}

export function imageTextTaskIsActive(phase: ImageTextTaskPhase): boolean {
  return !["completed", "failed", "cancelled"].includes(phase);
}

export function imageTextProgressValue(
  phase: ImageTextTaskPhase,
  completed: number,
  failed: number,
  skipped: number,
): number | undefined {
  return imageTextTaskIsActive(phase) ? undefined : completed + failed + skipped;
}

export function imageTextElapsedSeconds(startedAt: number, now = Date.now()): number {
  return Math.max(0, Math.floor((now - startedAt) / 1_000));
}

export function formatImageTextElapsed(startedAt: number, now = Date.now()): string {
  const seconds = imageTextElapsedSeconds(startedAt, now);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function resolveImageTextOccurrence(
  content: string,
  identity: ImageTextOccurrenceIdentity,
): ImageOccurrence | undefined {
  const matches = parseImageOccurrences(content).filter((candidate) => (
    candidate.raw === identity.raw && candidate.target === identity.target
  ));
  if (identity.duplicateCount !== undefined && identity.duplicateOrdinal !== undefined) {
    if (matches.length !== identity.duplicateCount) return undefined;
    const exact = matches[identity.duplicateOrdinal];
    if (!exact) return undefined;
    if (identity.reference && imageTextOccurrenceReference(content, exact) !== identity.reference) return undefined;
    return exact;
  }
  return matches
    .filter((candidate) => !identity.reference || imageTextOccurrenceReference(content, candidate) === identity.reference)
    .sort((left, right) => (
      Math.abs(left.from - identity.anchorOffset) - Math.abs(right.from - identity.anchorOffset)
    ))[0];
}
