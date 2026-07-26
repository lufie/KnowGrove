export type ReferenceAnchorRepairStatus =
  | "present"
  | "repaired"
  | "selection-missing"
  | "selection-ambiguous"
  | "context-missing"
  | "context-ambiguous"
  | "conflicting-anchor";

export type ReferenceMatchStrategy = "selection" | "context";

export interface ReferenceSourceLocator {
  sourceBlockId: string;
  selectedText: string;
  sourceContextBefore?: string;
  sourceContextAfter?: string;
}

export interface ReferenceSelectionMatch {
  start: number;
  end: number;
  strategy: ReferenceMatchStrategy;
}

export interface ReferenceAnchorRepairResult {
  content: string;
  status: ReferenceAnchorRepairStatus;
  match?: ReferenceSelectionMatch;
}

export interface ReferenceSourceContext {
  before: string;
  after: string;
}

const CONTEXT_LENGTH = 160;
const MIN_CONTEXT_NEEDLE = 16;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function canonicalize(value: string): { text: string; boundaries: number[] } {
  let text = "";
  const boundaries = [0];
  let offset = 0;
  while (offset < value.length) {
    if (value[offset] === "\r") {
      if (value[offset + 1] === "\n") offset += 2;
      else offset += 1;
      text += "\n";
    } else {
      text += value[offset];
      offset += 1;
    }
    boundaries.push(offset);
  }
  return { text, boundaries };
}

function allIndices(content: string, needle: string): number[] {
  if (!needle) return [];
  const indices: number[] = [];
  let from = 0;
  while (from <= content.length - needle.length) {
    const found = content.indexOf(needle, from);
    if (found < 0) break;
    indices.push(found);
    from = found + Math.max(1, needle.length);
  }
  return indices;
}

function locateBySelection(content: string, selectedText: string): ReferenceSelectionMatch | null | "ambiguous" {
  const canonicalContent = canonicalize(content);
  const canonicalSelection = canonicalize(selectedText.trim()).text;
  if (!canonicalSelection) return null;
  const matches = allIndices(canonicalContent.text, canonicalSelection);
  if (matches.length > 1) return "ambiguous";
  const start = matches[0];
  if (start === undefined) return null;
  return {
    start: canonicalContent.boundaries[start] ?? start,
    end: canonicalContent.boundaries[start + canonicalSelection.length] ?? content.length,
    strategy: "selection",
  };
}

function locateByContext(
  content: string,
  selectedText: string,
  contextBefore?: string,
  contextAfter?: string,
): ReferenceSelectionMatch | null | "ambiguous" {
  if (!contextBefore || !contextAfter) return null;
  const canonicalContent = canonicalize(content);
  const before = canonicalize(contextBefore).text;
  const after = canonicalize(contextAfter).text;
  const beforeNeedle = before.slice(-CONTEXT_LENGTH);
  const afterNeedle = after.slice(0, CONTEXT_LENGTH);
  if (beforeNeedle.length < MIN_CONTEXT_NEEDLE || afterNeedle.length < MIN_CONTEXT_NEEDLE) return null;

  const beforeMatches = allIndices(canonicalContent.text, beforeNeedle);
  const afterMatches = allIndices(canonicalContent.text, afterNeedle);
  const expectedLength = canonicalize(selectedText).text.length;
  const maximumGap = Math.max(2_000, expectedLength * 4 + 512);
  const candidates: Array<{ start: number; end: number }> = [];
  for (const beforeStart of beforeMatches) {
    const start = beforeStart + beforeNeedle.length;
    for (const end of afterMatches) {
      if (end < start || end - start > maximumGap) continue;
      candidates.push({ start, end });
    }
  }
  if (candidates.length > 1) return "ambiguous";
  const candidate = candidates[0];
  if (!candidate) return null;
  return {
    start: canonicalContent.boundaries[candidate.start] ?? candidate.start,
    end: canonicalContent.boundaries[candidate.end] ?? content.length,
    strategy: "context",
  };
}

export function hasBlockAnchor(content: string, blockId: string): boolean {
  const escaped = escapeRegExp(blockId);
  return new RegExp(`(?:^|[ \\t])\\^${escaped}[ \\t]*(?=\\r?$)`, "m").test(content);
}

export function locateReferenceSelection(
  content: string,
  locator: Omit<ReferenceSourceLocator, "sourceBlockId">,
): ReferenceSelectionMatch | null | "ambiguous" {
  const selectionMatch = locateBySelection(content, locator.selectedText);
  if (selectionMatch && selectionMatch !== "ambiguous") return selectionMatch;
  const contextMatch = locateByContext(
    content,
    locator.selectedText,
    locator.sourceContextBefore,
    locator.sourceContextAfter,
  );
  return contextMatch ?? selectionMatch;
}

export function captureReferenceSourceContext(
  content: string,
  match: Pick<ReferenceSelectionMatch, "start" | "end">,
  blockId?: string,
): ReferenceSourceContext {
  let before = content.slice(Math.max(0, match.start - CONTEXT_LENGTH), match.start);
  let after = content.slice(match.end, match.end + CONTEXT_LENGTH);
  if (blockId) {
    const escaped = escapeRegExp(blockId);
    const ownAnchor = new RegExp(`(?:[ \\t]+|\\r?\\n)\\^${escaped}[ \\t]*(?=\\r?$)`, "gm");
    before = before.replace(ownAnchor, "");
    after = after.replace(ownAnchor, "");
  }
  return {
    before,
    after,
  };
}

function lineStart(content: string, offset: number): number {
  return content.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
}

function lineBreakStart(content: string, offset: number): number {
  const newline = content.indexOf("\n", offset);
  if (newline < 0) return content.length;
  return content[newline - 1] === "\r" ? newline - 1 : newline;
}

function lineEndingAt(content: string, offset: number): string {
  if (content.slice(offset, offset + 2) === "\r\n") return "\r\n";
  if (content[offset] === "\n" || content[offset] === "\r") return content[offset] ?? "\n";
  return content.includes("\r\n") ? "\r\n" : "\n";
}

function hasConflictingAnchor(content: string, match: ReferenceSelectionMatch): boolean {
  const endOfLine = lineBreakStart(content, match.end);
  const lineTail = content.slice(match.end, endOfLine);
  if (/\s\^[a-zA-Z0-9-]+\s*$/.test(lineTail)) return true;
  if (endOfLine >= content.length) return false;
  const ending = lineEndingAt(content, endOfLine);
  const nextLineStart = endOfLine + ending.length;
  const nextLineEnd = lineBreakStart(content, nextLineStart);
  return /^\s*\^[a-zA-Z0-9-]+\s*$/.test(content.slice(nextLineStart, nextLineEnd));
}

export function repairReferenceAnchor(
  content: string,
  locator: ReferenceSourceLocator,
): ReferenceAnchorRepairResult {
  if (hasBlockAnchor(content, locator.sourceBlockId)) return { content, status: "present" };

  const selectionMatch = locateBySelection(content, locator.selectedText);
  let match: ReferenceSelectionMatch | null | "ambiguous" = selectionMatch;
  if (!match || match === "ambiguous") {
    if (!locator.sourceContextBefore || !locator.sourceContextAfter) {
      return { content, status: match === "ambiguous" ? "selection-ambiguous" : "selection-missing" };
    }
    const contextMatch = locateByContext(
      content,
      locator.selectedText,
      locator.sourceContextBefore,
      locator.sourceContextAfter,
    );
    if (contextMatch === "ambiguous") return { content, status: "context-ambiguous" };
    if (!contextMatch) {
      return { content, status: match === "ambiguous" ? "selection-ambiguous" : "context-missing" };
    }
    match = contextMatch;
  }

  if (hasConflictingAnchor(content, match)) {
    return { content, status: "conflicting-anchor", match };
  }

  const firstLine = content.slice(lineStart(content, match.start), lineBreakStart(content, match.start)).trimStart();
  const spansMultipleLines = /\r?\n/.test(content.slice(match.start, match.end));
  const complexBlock = spansMultipleLines || /^(?:[-*+]\s|\d+[.)]\s|>|```|~~~)/.test(firstLine);
  const insertionOffset = lineBreakStart(content, match.end);
  const insertion = complexBlock
    ? `${lineEndingAt(content, insertionOffset)}^${locator.sourceBlockId}`
    : ` ^${locator.sourceBlockId}`;
  return {
    content: content.slice(0, insertionOffset) + insertion + content.slice(insertionOffset),
    status: "repaired",
    match,
  };
}
