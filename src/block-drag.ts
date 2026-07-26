export const KNOWGROVE_BLOCK_DRAG_MIME = "application/x-knowgrove-block-reference";

export interface MarkdownBlockRange {
  start: number;
  end: number;
  text: string;
}

export interface BlockDragPayload extends MarkdownBlockRange {
  token: string;
  sourcePath: string;
}

function lineStarts(content: string): number[] {
  const starts = [0];
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === "\n") starts.push(index + 1);
  }
  return starts;
}

function lineIndexAt(starts: number[], offset: number): number {
  let low = 0;
  let high = starts.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const start = starts[middle] ?? 0;
    const next = starts[middle + 1] ?? Number.POSITIVE_INFINITY;
    if (offset < start) high = middle - 1;
    else if (offset >= next) low = middle + 1;
    else return middle;
  }
  return Math.max(0, Math.min(starts.length - 1, low));
}

function lineEnd(content: string, starts: number[], index: number): number {
  const next = starts[index + 1];
  if (next === undefined) return content.length;
  const newline = next - 1;
  return newline > 0 && content[newline - 1] === "\r" ? newline - 1 : newline;
}

function lineText(content: string, starts: number[], index: number): string {
  return content.slice(starts[index] ?? 0, lineEnd(content, starts, index));
}

function isBlank(line: string): boolean {
  return !line.trim();
}

function isFence(line: string): RegExpMatchArray | null {
  return line.match(/^\s{0,3}(`{3,}|~{3,})/);
}

function isStructuralStart(line: string): boolean {
  return /^\s{0,3}(?:#{1,6}\s|>|[-*+]\s|\d+[.)]\s|`{3,}|~{3,}|(?:[-*_]\s*){3,}$)/.test(line);
}

function surroundingFence(lines: string[], lineIndex: number): { start: number; end: number } | null {
  for (let start = lineIndex; start >= 0; start -= 1) {
    const opening = isFence(lines[start] ?? "");
    if (!opening) continue;
    const marker = opening[1]?.[0];
    const minimumLength = opening[1]?.length ?? 3;
    if (!marker) continue;
    const closingPattern = new RegExp(`^\\s{0,3}${marker === "`" ? "`" : "~"}{${minimumLength},}\\s*$`);
    let closedBeforeSelection = false;
    for (let index = start + 1; index < lineIndex; index += 1) {
      if (closingPattern.test(lines[index] ?? "")) {
        closedBeforeSelection = true;
        break;
      }
    }
    if (closedBeforeSelection) continue;
    for (let end = Math.max(start + 1, lineIndex); end < lines.length; end += 1) {
      if (closingPattern.test(lines[end] ?? "")) return { start, end };
    }
    return { start, end: lines.length - 1 };
  }
  return null;
}

/** Resolve the complete Markdown block containing a non-empty editor selection. */
export function findMarkdownBlockRange(
  content: string,
  selectionStart: number,
  selectionEnd: number,
): MarkdownBlockRange | null {
  const startOffset = Math.max(0, Math.min(content.length, Math.min(selectionStart, selectionEnd)));
  const endOffset = Math.max(0, Math.min(content.length, Math.max(selectionStart, selectionEnd)));
  if (startOffset === endOffset || !content.slice(startOffset, endOffset).trim()) return null;

  const starts = lineStarts(content);
  const lines = starts.map((_, index) => lineText(content, starts, index));
  let firstLine = lineIndexAt(starts, startOffset);
  let lastLine = lineIndexAt(starts, Math.max(startOffset, endOffset - 1));
  while (firstLine <= lastLine && isBlank(lines[firstLine] ?? "")) firstLine += 1;
  while (lastLine >= firstLine && isBlank(lines[lastLine] ?? "")) lastLine -= 1;
  if (firstLine > lastLine) return null;

  const fence = surroundingFence(lines, firstLine);
  if (fence && lastLine <= fence.end) {
    firstLine = fence.start;
    lastLine = fence.end;
  } else {
    const selectedLine = lines[firstLine] ?? "";
    if (/^\s{0,3}#{1,6}\s/.test(selectedLine) || /^(?:\s*[-*_]\s*){3,}$/.test(selectedLine)) {
      lastLine = firstLine;
    } else {
      let structuralOwner = firstLine;
      for (let index = firstLine; index >= 0 && !isBlank(lines[index] ?? ""); index -= 1) {
        if (isStructuralStart(lines[index] ?? "")) {
          structuralOwner = index;
          break;
        }
      }
      const ownerLine = lines[structuralOwner] ?? "";
      const complex = /^\s{0,3}(?:>|[-*+]\s|\d+[.)]\s)/.test(ownerLine);
      if (complex) {
        firstLine = structuralOwner;
        while (firstLine > 0 && !isBlank(lines[firstLine - 1] ?? "")
          && /^\s{0,3}(?:>|[-*+]\s|\d+[.)]\s)/.test(lines[firstLine - 1] ?? "")) firstLine -= 1;
        while (lastLine + 1 < lines.length && !isBlank(lines[lastLine + 1] ?? "")
          && !/^\s{0,3}(?:#{1,6}\s|`{3,}|~{3,})/.test(lines[lastLine + 1] ?? "")) lastLine += 1;
      } else {
        while (firstLine > 0 && !isBlank(lines[firstLine - 1] ?? "")
          && !isStructuralStart(lines[firstLine - 1] ?? "")) firstLine -= 1;
        while (lastLine + 1 < lines.length && !isBlank(lines[lastLine + 1] ?? "")
          && !isStructuralStart(lines[lastLine + 1] ?? "")) lastLine += 1;
      }
    }
  }

  const start = starts[firstLine] ?? 0;
  const end = lineEnd(content, starts, lastLine);
  const text = content.slice(start, end);
  return text.trim() ? { start, end, text } : null;
}

export function renderObsidianBlockEmbed(sourcePath: string, blockId: string): string {
  const wikilinkPath = sourcePath.replace(/\.md$/i, "");
  return `![[${wikilinkPath}#^${blockId}]]`;
}

export function parseObsidianBlockEmbedSource(source: string): { linkPath: string; blockId: string } | null {
  const marker = source.lastIndexOf("#^");
  if (marker <= 0) return null;
  const linkPath = source.slice(0, marker).trim();
  const blockId = source.slice(marker + 2).trim();
  return linkPath && /^[a-zA-Z0-9-]+$/.test(blockId) ? { linkPath, blockId } : null;
}

export function stripOwnBlockAnchor(markdown: string, blockId: string): string {
  const escaped = blockId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return markdown
    .replace(new RegExp(`(?:[ \\t]+|\\r?\\n)\\^${escaped}[ \\t]*$`), "")
    .trim();
}

/** Keep the embed as its own Markdown block at the exact drop offset. */
export function formatBlockEmbedInsertion(content: string, offset: number, embed: string): string {
  const safeOffset = Math.max(0, Math.min(content.length, offset));
  const before = content.slice(0, safeOffset);
  const after = content.slice(safeOffset);
  const prefix = !before ? "" : before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const suffix = !after ? "" : after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
  return `${prefix}${embed}${suffix}`;
}
