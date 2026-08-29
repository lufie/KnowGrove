export interface BlankLineCleanupResult {
  content: string;
  removedBlankLines: number;
  normalizedBlankLines: number;
  changed: boolean;
}

export interface SelectedBlankLineRemovalResult {
  replacement: string;
  removedBlankLines: number;
  changed: boolean;
}

interface LineToken {
  text: string;
  ending: string;
  start: number;
  end: number;
}

type ProtectedMode =
  | { kind: "frontmatter" }
  | { kind: "fence"; marker: "`" | "~"; length: number }
  | { kind: "math" }
  | { kind: "obsidian-comment" }
  | { kind: "html-comment" }
  | { kind: "html-raw"; tag: string };

function tokenizeLines(content: string): LineToken[] {
  const lines: LineToken[] = [];
  const pattern = /([^\r\n]*)(\r\n|\n|\r|$)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    if (!match[0]) break;
    lines.push({
      text: match[1] ?? "",
      ending: match[2] ?? "",
      start: match.index,
      end: match.index + match[0].length,
    });
    if (!match[2]) break;
  }
  return lines;
}

function frontmatterEndIndex(lines: LineToken[]): number {
  const first = lines[0]?.text.replace(/^\uFEFF/, "").trim();
  if (first !== "---") return -1;
  return lines.findIndex((line, index) => index > 0 && /^(?:---|\.\.\.)$/.test(line.text.trim()));
}

function fenceOpening(text: string): { marker: "`" | "~"; length: number } | null {
  const match = /^ {0,3}(`{3,}|~{3,})/.exec(text);
  if (!match?.[1]) return null;
  return { marker: match[1][0] as "`" | "~", length: match[1].length };
}

function isFenceClosing(text: string, mode: Extract<ProtectedMode, { kind: "fence" }>): boolean {
  const escaped = mode.marker === "`" ? "`" : "~";
  return new RegExp(`^ {0,3}${escaped}{${mode.length},}\\s*$`).test(text);
}

function protectedLines(lines: LineToken[]): boolean[] {
  const protectedFlags = Array.from({ length: lines.length }, () => false);
  const yamlEnd = frontmatterEndIndex(lines);
  let mode: ProtectedMode | null = yamlEnd > 0 ? { kind: "frontmatter" } : null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) continue;
    const trimmed = line.text.trim();

    if (mode) {
      protectedFlags[index] = true;
      if (mode.kind === "frontmatter" && index === yamlEnd) mode = null;
      else if (mode.kind === "fence" && isFenceClosing(line.text, mode)) mode = null;
      else if (mode.kind === "math" && trimmed === "$$") mode = null;
      else if (mode.kind === "obsidian-comment" && trimmed === "%%") mode = null;
      else if (mode.kind === "html-comment" && line.text.includes("-->")) mode = null;
      else if (mode.kind === "html-raw" && new RegExp(`</${mode.tag}\\s*>`, "i").test(line.text)) mode = null;
      continue;
    }

    const fence = fenceOpening(line.text);
    if (fence) {
      protectedFlags[index] = true;
      mode = { kind: "fence", ...fence };
      continue;
    }
    if (trimmed === "$$") {
      protectedFlags[index] = true;
      mode = { kind: "math" };
      continue;
    }
    if (trimmed === "%%") {
      protectedFlags[index] = true;
      mode = { kind: "obsidian-comment" };
      continue;
    }
    if (line.text.includes("<!--") && !line.text.includes("-->")) {
      protectedFlags[index] = true;
      mode = { kind: "html-comment" };
      continue;
    }
    const rawHtml = /<(pre|script|style)\b/i.exec(line.text)?.[1]?.toLowerCase();
    if (rawHtml && !new RegExp(`</${rawHtml}\\s*>`, "i").test(line.text)) {
      protectedFlags[index] = true;
      mode = { kind: "html-raw", tag: rawHtml };
    }
  }

  return protectedFlags;
}

function splitUnescapedTableCells(text: string): string[] | null {
  if (/^(?: {4,}|\t)/.test(text)) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  const cells: string[] = [];
  let cell = "";
  let sawPipe = false;
  for (let index = 0; index < trimmed.length; index += 1) {
    const character = trimmed[index];
    if (character === "\\" && index + 1 < trimmed.length) {
      cell += character + trimmed[index + 1];
      index += 1;
      continue;
    }
    if (character === "|") {
      cells.push(cell.trim());
      cell = "";
      sawPipe = true;
      continue;
    }
    cell += character;
  }
  cells.push(cell.trim());

  if (!sawPipe) return null;
  if (trimmed.startsWith("|")) cells.shift();
  if (trimmed.endsWith("|")) cells.pop();
  return cells.length > 0 ? cells : null;
}

function isTableDelimiterCell(cell: string): boolean {
  return /^:?-{3,}:?$/.test(cell.trim());
}

interface StructuralBlankLineInsertion {
  offset: number;
  ending: string;
}

interface TableBoundaryNormalization {
  preservedBlankLines: boolean[];
  insertions: StructuralBlankLineInsertion[];
}

function tableBoundaryNormalization(
  lines: LineToken[],
  protectedFlags: boolean[],
  selectionStart: number,
  selectionEnd: number,
): TableBoundaryNormalization {
  const boundaryFlags = Array.from({ length: lines.length }, () => false);
  const insertions: StructuralBlankLineInsertion[] = [];

  for (let delimiterIndex = 1; delimiterIndex < lines.length; delimiterIndex += 1) {
    if (protectedFlags[delimiterIndex] || protectedFlags[delimiterIndex - 1]) continue;

    const headerCells = splitUnescapedTableCells(lines[delimiterIndex - 1]?.text ?? "");
    const delimiterCells = splitUnescapedTableCells(lines[delimiterIndex]?.text ?? "");
    if (
      !headerCells ||
      !delimiterCells ||
      headerCells.length !== delimiterCells.length ||
      !delimiterCells.every(isTableDelimiterCell)
    ) {
      continue;
    }

    let lastTableRow = delimiterIndex;
    for (let rowIndex = delimiterIndex + 1; rowIndex < lines.length; rowIndex += 1) {
      const row = lines[rowIndex];
      if (!row || protectedFlags[rowIndex] || !row.text.trim()) break;
      if (!splitUnescapedTableCells(row.text)) break;
      lastTableRow = rowIndex;
    }

    const headerIndex = delimiterIndex - 1;
    const header = lines[headerIndex];
    const lastRow = lines[lastTableRow];
    const tableIsFullySelected = Boolean(
      header
      && lastRow
      && header.start >= selectionStart
      && lastRow.end <= selectionEnd,
    );
    if (!tableIsFullySelected) continue;

    const beforeTable = headerIndex - 1;
    const precedingLine = lines[beforeTable];
    if (beforeTable >= 0 && precedingLine && !precedingLine.text.trim()) {
      if (!protectedFlags[beforeTable]) boundaryFlags[beforeTable] = true;
    } else if (beforeTable >= 0 && header) {
      insertions.push({ offset: header.start, ending: header.ending || "\n" });
    }

    const afterTable = lastTableRow + 1;
    const followingLine = lines[afterTable];
    if (afterTable < lines.length && followingLine && !followingLine.text.trim()) {
      if (!protectedFlags[afterTable]) boundaryFlags[afterTable] = true;
    } else if (afterTable < lines.length && followingLine && followingLine.start <= selectionEnd) {
      const lastRowEnding = lastRow?.ending;
      insertions.push({ offset: followingLine.start, ending: lastRowEnding || header?.ending || "\n" });
    }
  }

  return { preservedBlankLines: boundaryFlags, insertions };
}

export function cleanMarkdownBlankLines(content: string): BlankLineCleanupResult {
  const lines = tokenizeLines(content);
  const protectedFlags = protectedLines(lines);
  const output: LineToken[] = [];
  let pendingBlank: LineToken | null = null;
  let seenContent = false;
  let removedBlankLines = 0;
  let normalizedBlankLines = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) continue;

    if (protectedFlags[index]) {
      if (pendingBlank) {
        output.push(pendingBlank);
        pendingBlank = null;
      }
      output.push(line);
      seenContent = true;
      continue;
    }

    if (!line.text.trim()) {
      if (!seenContent) {
        removedBlankLines += 1;
        continue;
      }
      if (pendingBlank) {
        removedBlankLines += 1;
        continue;
      }
      if (line.text) normalizedBlankLines += 1;
      pendingBlank = { text: "", ending: line.ending, start: line.start, end: line.end };
      continue;
    }

    if (pendingBlank) {
      output.push(pendingBlank);
      pendingBlank = null;
    }
    output.push(line);
    seenContent = true;
  }

  if (pendingBlank) removedBlankLines += 1;
  const cleaned = output.map((line) => `${line.text}${line.ending}`).join("");
  return {
    content: cleaned,
    removedBlankLines,
    normalizedBlankLines,
    changed: cleaned !== content,
  };
}

export function removeSelectedMarkdownBlankLines(
  content: string,
  selectionStart: number,
  selectionEnd: number,
): SelectedBlankLineRemovalResult {
  const start = Math.max(0, Math.min(content.length, Math.min(selectionStart, selectionEnd)));
  const end = Math.max(start, Math.min(content.length, Math.max(selectionStart, selectionEnd)));
  if (start === end) {
    return { replacement: content.slice(start, end), removedBlankLines: 0, changed: false };
  }

  const lines = tokenizeLines(content);
  const protectedFlags = protectedLines(lines);
  const tableBoundaries = tableBoundaryNormalization(lines, protectedFlags, start, end);
  const output: string[] = [];
  let cursor = start;
  let removedBlankLines = 0;
  let insertedStructuralBlankLines = 0;

  const insertionByOffset = new Map<number, string>();
  for (const insertion of tableBoundaries.insertions) {
    if (!insertionByOffset.has(insertion.offset)) {
      insertionByOffset.set(insertion.offset, insertion.ending);
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) continue;
    const insertion = insertionByOffset.get(line.start);
    if (insertion && line.start >= cursor && line.start <= end) {
      output.push(content.slice(cursor, line.start), insertion);
      cursor = line.start;
      insertedStructuralBlankLines += 1;
    }
    if (
      protectedFlags[index]
      || tableBoundaries.preservedBlankLines[index]
      || line.text.trim()
    ) continue;
    if (line.start < start || line.end > end) continue;
    output.push(content.slice(cursor, line.start));
    cursor = line.end;
    removedBlankLines += 1;
  }

  output.push(content.slice(cursor, end));
  return {
    replacement: output.join(""),
    removedBlankLines,
    changed: removedBlankLines > 0 || insertedStructuralBlankLines > 0,
  };
}
