import { applyTextChanges, parseImageOccurrences, type ImageOccurrence, type TextChange } from "./image-layout-core";

export const IMAGE_TEXT_BLOCK_START = "<!-- knowgrove:image-text v=1 -->";
export const IMAGE_TEXT_BLOCK_END = "<!-- /knowgrove:image-text -->";

export interface ImageTextWriteResult {
  content: string;
  replaced: boolean;
}

export interface ImageTextOccurrenceSnapshot {
  reference: string;
  duplicateOrdinal: number;
  duplicateCount: number;
}

export interface ImageTextManagedBlockRange {
  from: number;
  to: number;
  contentFrom: number;
  reference?: string;
  startMarker: ImageTextManagedMarkerRange;
  referenceMarker?: ImageTextManagedMarkerRange;
  endMarker: ImageTextManagedMarkerRange;
}

export interface ImageTextManagedMarkerRange {
  from: number;
  to: number;
}

function lineEnd(content: string, offset: number): number {
  const newline = content.indexOf("\n", offset);
  return newline < 0 ? content.length : newline;
}

function lineStart(content: string, offset: number): number {
  return content.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
}

function stableReferenceHash(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const character of value) {
    hash ^= BigInt(character.codePointAt(0) ?? 0);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(36);
}

function fencedMarkdownRanges(content: string): ImageTextManagedMarkerRange[] {
  const ranges: ImageTextManagedMarkerRange[] = [];
  let active: { from: number; char: "`" | "~"; length: number } | undefined;
  let lineFrom = 0;
  while (lineFrom < content.length) {
    const newline = content.indexOf("\n", lineFrom);
    const lineTo = newline < 0 ? content.length : newline + 1;
    const rawLine = content.slice(lineFrom, newline < 0 ? content.length : newline).replace(/\r$/, "");
    if (!active) {
      const opening = rawLine.match(/^ {0,3}(`{3,}|~{3,})/)?.[1];
      if (opening) {
        active = { from: lineFrom, char: opening[0] as "`" | "~", length: opening.length };
      }
    } else {
      const closing = rawLine.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/)?.[1];
      if (closing && closing[0] === active.char && closing.length >= active.length) {
        ranges.push({ from: active.from, to: lineTo });
        active = undefined;
      }
    }
    lineFrom = lineTo;
  }
  if (active) ranges.push({ from: active.from, to: content.length });
  return ranges;
}

export function imageTextOccurrenceSnapshot(
  content: string,
  occurrence: ImageOccurrence,
): ImageTextOccurrenceSnapshot {
  const duplicates = parseImageOccurrences(content).filter((candidate) => (
    candidate.kind === occurrence.kind
    && candidate.raw === occurrence.raw
    && candidate.target === occurrence.target
  ));
  const duplicateOrdinal = Math.max(0, duplicates.findIndex((candidate) => candidate.from === occurrence.from));
  return {
    reference: occurrence.reference
      ?? `img-${stableReferenceHash(`${occurrence.kind}\u0000${occurrence.raw}\u0000${occurrence.target}\u0000${duplicateOrdinal}`)}`,
    duplicateOrdinal,
    duplicateCount: duplicates.length,
  };
}

export function imageTextOccurrenceReference(content: string, occurrence: ImageOccurrence): string {
  return imageTextOccurrenceSnapshot(content, occurrence).reference;
}

function managedBlockAt(
  content: string,
  cursor: number,
  fencedRanges = fencedMarkdownRanges(content),
): ImageTextManagedBlockRange | null {
  const start = content.slice(cursor).match(/^<!--\s*knowgrove:image-text\s+v=1\s*-->/i);
  if (!start) return null;
  const bodyFrom = cursor + start[0].length;
  const referenceMatch = content.slice(bodyFrom).match(/^(\r?\n)(<!--\s*knowgrove:image-text-ref\s+ref=([a-z0-9-]+)\s*-->)/i);
  const reference = referenceMatch?.[3];
  const referenceMarker = referenceMatch?.[2]
    ? {
        from: bodyFrom + (referenceMatch[1]?.length ?? 0),
        to: bodyFrom + (referenceMatch[1]?.length ?? 0) + referenceMatch[2].length,
      }
    : undefined;
  const endPattern = /^<!--\s*\/knowgrove:image-text\s*-->[ \t]*(?=\r?$)/gmi;
  endPattern.lastIndex = bodyFrom;
  let endMatch: RegExpExecArray | null = null;
  while ((endMatch = endPattern.exec(content))) {
    const endFrom = endMatch.index;
    if (!fencedRanges.some((range) => endFrom >= range.from && endFrom < range.to)) break;
  }
  if (!endMatch) return null;
  const end = endMatch.index;
  let contentFrom = bodyFrom + (referenceMatch?.[0].length ?? 0);
  while (contentFrom < end && /[\r\n]/.test(content[contentFrom] ?? "")) contentFrom += 1;
  return {
    from: cursor,
    to: end + endMatch[0].length,
    contentFrom,
    reference,
    startMarker: { from: cursor, to: cursor + start[0].length },
    referenceMarker,
    endMarker: { from: end, to: end + endMatch[0].length },
  };
}

function existingManagedBlock(
  content: string,
  occurrence: ImageOccurrence,
): ImageTextManagedBlockRange | null {
  const imageLineEnd = lineEnd(content, occurrence.unitTo);
  const imageLineStart = lineStart(content, occurrence.unitFrom);
  const imageCountOnLine = parseImageOccurrences(content).filter((candidate) => (
    candidate.from >= imageLineStart && candidate.to <= imageLineEnd
  )).length;
  const expectedReference = imageTextOccurrenceReference(content, occurrence);
  const fencedRanges = fencedMarkdownRanges(content);
  const adjacentBlocks: ImageTextManagedBlockRange[] = [];
  let cursor = imageLineEnd;
  while (cursor < content.length && /\s/.test(content[cursor] ?? "")) cursor += 1;
  while (cursor < content.length) {
    const block = managedBlockAt(content, cursor, fencedRanges);
    if (!block) break;
    adjacentBlocks.push(block);
    if (block.reference === expectedReference) return block;
    cursor = block.to;
    while (cursor < content.length && /\s/.test(content[cursor] ?? "")) cursor += 1;
  }
  // Migrate pre-anchor candidate blocks only when adjacency is unambiguous.
  if (imageCountOnLine === 1 && adjacentBlocks.length === 1) return adjacentBlocks[0] ?? null;
  return null;
}

export function imageTextManagedBlockRange(
  content: string,
  occurrence: ImageOccurrence,
): ImageTextManagedBlockRange | undefined {
  return existingManagedBlock(content, occurrence) ?? undefined;
}

export function imageTextManagedMarkerRanges(content: string): ImageTextManagedMarkerRange[] {
  const fencedRanges = fencedMarkdownRanges(content);
  const blocks: ImageTextManagedBlockRange[] = [];
  const startPattern = /^<!--\s*knowgrove:image-text\s+v=1\s*-->[ \t]*(?=\r?$)/gmi;
  for (const match of content.matchAll(startPattern)) {
    const from = match.index ?? -1;
    if (from < 0 || fencedRanges.some((range) => from >= range.from && from < range.to)) continue;
    const previous = blocks[blocks.length - 1];
    if (previous && from < previous.to) continue;
    const block = managedBlockAt(content, from, fencedRanges);
    if (block) blocks.push(block);
  }
  const ranges = blocks.flatMap((block) => [
    block.startMarker,
    ...(block.referenceMarker ? [block.referenceMarker] : []),
    block.endMarker,
  ]);
  return ranges.sort((left, right) => left.from - right.from);
}

function attachImageReference(
  content: string,
  occurrence: ImageOccurrence,
  reference: string,
): { content: string; occurrence: ImageOccurrence } {
  if (occurrence.reference === reference) return { content, occurrence };
  const existingMetadata = content.slice(occurrence.to, occurrence.unitTo);
  const metadata = existingMetadata
    ? existingMetadata.replace(/\s*-->$/, ` ref=${reference} -->`)
    : ` <!-- knowgrove:image ref=${reference} -->`;
  const taggedContent = `${content.slice(0, occurrence.to)}${metadata}${content.slice(occurrence.unitTo)}`;
  const taggedOccurrence = parseImageOccurrences(taggedContent).find((candidate) => (
    candidate.from === occurrence.from
    && candidate.raw === occurrence.raw
    && candidate.target === occurrence.target
    && candidate.reference === reference
  ));
  if (!taggedOccurrence) throw new Error("无法为图片建立稳定定位，请重新执行");
  return { content: taggedContent, occurrence: taggedOccurrence };
}

function normalizedResult(markdown: string): string {
  const trimmed = markdown.trim();
  const wrapper = trimmed.match(/^```(?:markdown|md)[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/i);
  const result = (wrapper?.[1] ?? trimmed).trim();
  if (!result) throw new Error("模型没有返回可写入的图片识别结果，请重新转换");
  return result;
}

export function renderImageTextBlock(markdown: string, reference?: string): string {
  const referenceLine = reference ? `<!-- knowgrove:image-text-ref ref=${reference} -->\n` : "";
  return `${IMAGE_TEXT_BLOCK_START}\n${referenceLine}\n${normalizedResult(markdown)}\n\n${IMAGE_TEXT_BLOCK_END}`;
}

export function upsertImageTextBlock(
  content: string,
  occurrence: ImageOccurrence,
  markdown: string,
): ImageTextWriteResult {
  const current = parseImageOccurrences(content).find((candidate) => (
    candidate.from === occurrence.from
    && candidate.raw === occurrence.raw
    && candidate.target === occurrence.target
  ));
  if (!current) throw new Error("图片引用已变化，请重新执行");
  const reference = imageTextOccurrenceReference(content, current);
  const tagged = attachImageReference(content, current, reference);
  const block = renderImageTextBlock(markdown, reference);
  const existing = existingManagedBlock(tagged.content, tagged.occurrence);
  if (existing) {
    return {
      content: `${tagged.content.slice(0, existing.from)}${block}${tagged.content.slice(existing.to)}`,
      replaced: true,
    };
  }
  const insertAt = lineEnd(tagged.content, tagged.occurrence.unitTo);
  return {
    content: `${tagged.content.slice(0, insertAt)}\n\n${block}${tagged.content.slice(insertAt)}`,
    replaced: false,
  };
}

export function isAmbiguousBareImageTarget(target: string, vaultPaths: string[]): boolean {
  const clean = target.split("#", 1)[0]?.split("?", 1)[0]?.trim() ?? "";
  let decoded = clean;
  try { decoded = decodeURIComponent(clean); } catch { /* Keep source form. */ }
  if (!decoded || decoded.includes("/") || decoded.includes("\\")) return false;
  const lower = decoded.toLowerCase();
  return vaultPaths.filter((path) => path.replace(/\\/g, "/").split("/").pop()?.toLowerCase() === lower).length > 1;
}

export function removeAllImageReferences(content: string): { content: string; removed: number } {
  const occurrences = parseImageOccurrences(content);
  if (!occurrences.length) return { content, removed: 0 };
  const changes: TextChange[] = occurrences.map((occurrence) => ({
    from: occurrence.unitFrom,
    to: occurrence.unitTo,
    insert: "",
  }));
  return { content: applyTextChanges(content, changes), removed: occurrences.length };
}

export function removeConfirmedImageReferences(
  confirmedContent: string,
  currentContent: string,
): { content: string; removed: number } {
  if (currentContent !== confirmedContent) {
    throw new Error("笔记在确认后发生变化，为避免误删新内容，请重新确认");
  }
  return removeAllImageReferences(confirmedContent);
}

export function buildImageTextPrompt(): string {
  return [
    "请忠实识别这张图片中的全部可见文字，并直接输出可插入 Obsidian 的 Markdown。",
    "不要翻译，不要补写图片中不存在的内容，不要解释识别过程。",
    "表格必须优先还原为 GitHub Flavored Markdown 表格，并保留表头、单位、正负号、百分号与脚注。",
    "多栏、图表、标题层级或复杂版式请按阅读顺序整理成有层级的 Markdown；无法确认的字符用〔不清晰〕标记。",
    "图片来源：当前待识别图片",
  ].join("\n");
}
