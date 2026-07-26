export interface ScrollMetrics {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}

export interface VisibleTextRange {
  to: number;
}

/**
 * Treat a note as reaching its end when the remaining scroll distance is small.
 * The tolerance absorbs fractional pixels, theme padding, and mobile safe areas.
 */
export function isAtReadingEnd(metrics: ScrollMetrics, tolerance = 48): boolean {
  if (metrics.clientHeight <= 0 || metrics.scrollHeight <= 0) return false;
  const remaining = metrics.scrollHeight - metrics.clientHeight - metrics.scrollTop;
  return remaining <= Math.max(0, tolerance);
}

/**
 * CodeMirror adds generous bottom padding in Live Preview, so DOM scroll metrics
 * can say there is space remaining even while the final character is visible.
 * Its visible text ranges are a more reliable signal for editor mode.
 */
export function isDocumentEndVisible(documentLength: number, visibleRanges: readonly VisibleTextRange[]): boolean {
  if (!Number.isFinite(documentLength) || documentLength < 0 || visibleRanges.length === 0) return false;
  return visibleRanges.some((range) => Number.isFinite(range.to) && range.to >= documentLength);
}

export function finishDelayMilliseconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return 3000;
  return Math.round(Math.min(10, Math.max(1, seconds)) * 1000);
}

export function hasRecentEditorActivity(lastEditAt: number | undefined, now = Date.now(), quietMilliseconds = 5000): boolean {
  if (lastEditAt === undefined || !Number.isFinite(lastEditAt)) return false;
  return now - lastEditAt < Math.max(0, quietMilliseconds);
}
