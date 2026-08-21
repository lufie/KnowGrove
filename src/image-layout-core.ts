export type ImageAlignment = "left" | "center" | "right";
export type ImageSyntaxKind = "wiki" | "markdown";

export interface ImageOccurrence {
  kind: ImageSyntaxKind;
  from: number;
  to: number;
  unitFrom: number;
  unitTo: number;
  raw: string;
  unitRaw: string;
  target: string;
  alignment?: ImageAlignment;
  width?: number;
  height?: number;
}

export interface ImageSyntaxUpdate {
  alignment?: ImageAlignment;
  width?: number;
  height?: number;
  reset?: boolean;
}

export interface TextChange {
  from: number;
  to: number;
  insert: string;
}

const ALIGNMENTS = new Set<ImageAlignment>(["left", "center", "right"]);
const SIZE_TOKEN = /^\d+(?:x\d+)?$/i;
const META_PREFIX = "<!-- knowgrove:image";

function isEscaped(text: string, index: number): boolean {
  let slashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === "\\"; i -= 1) slashes += 1;
  return slashes % 2 === 1;
}

function stripLegacyAlignment(target: string): { target: string; alignment?: ImageAlignment } {
  const match = target.match(/#(left|center|right)$/i);
  if (!match) return { target };
  const alignment = match[1]?.toLowerCase() as ImageAlignment;
  return { target: target.slice(0, Math.max(0, target.length - match[0].length)), alignment };
}

function parseSize(value: string): { width?: number; height?: number } {
  const token = value.trim();
  if (!SIZE_TOKEN.test(token)) return {};
  const [widthRaw, heightRaw] = token.toLowerCase().split("x");
  const width = Number.parseInt(widthRaw ?? "", 10);
  const height = heightRaw !== undefined ? Number.parseInt(heightRaw, 10) : undefined;
  return {
    width: typeof width === "number" && Number.isFinite(width) && width > 0 ? width : undefined,
    height: typeof height === "number" && Number.isFinite(height) && height > 0 ? height : undefined,
  };
}

function parseMetadataAfter(content: string, imageTo: number): { unitTo: number; alignment?: ImageAlignment } {
  let cursor = imageTo;
  while (cursor < content.length && (content[cursor] === " " || content[cursor] === "\t")) cursor += 1;
  if (!content.startsWith(META_PREFIX, cursor)) return { unitTo: imageTo };
  const end = content.indexOf("-->", cursor + META_PREFIX.length);
  if (end < 0) return { unitTo: imageTo };
  const raw = content.slice(cursor, end + 3);
  const match = raw.match(/\balign=(left|center|right)\b/i);
  return {
    unitTo: end + 3,
    alignment: match?.[1]?.toLowerCase() as ImageAlignment | undefined,
  };
}

function parseWikiImages(content: string): ImageOccurrence[] {
  const results: ImageOccurrence[] = [];
  const regex = /!\[\[([^\]\n]+)\]\]/g;
  for (const match of content.matchAll(regex)) {
    if (match.index === undefined) continue;
    const raw = match[0];
    const inner = match[1] ?? "";
    const parts = inner.split("|");
    const targetPart = parts.shift() ?? "";
    const legacy = stripLegacyAlignment(targetPart);
    let alignment = legacy.alignment;
    let width: number | undefined;
    let height: number | undefined;
    for (const rawPart of parts) {
      const part = rawPart.trim();
      const lower = part.toLowerCase();
      if (ALIGNMENTS.has(lower as ImageAlignment)) {
        alignment = lower as ImageAlignment;
        continue;
      }
      const size = parseSize(part);
      if (size.width) {
        width = size.width;
        height = size.height;
      }
    }
    const from = match.index;
    const to = from + raw.length;
    const metadata = parseMetadataAfter(content, to);
    results.push({
      kind: "wiki",
      from,
      to,
      unitFrom: from,
      unitTo: metadata.unitTo,
      raw,
      unitRaw: content.slice(from, metadata.unitTo),
      target: legacy.target,
      alignment: metadata.alignment ?? alignment,
      width,
      height,
    });
  }
  return results;
}

function findMarkdownImageEnd(content: string, start: number): number {
  const altEndStart = start + 2;
  let altEnd = -1;
  for (let i = altEndStart; i < content.length; i += 1) {
    if (content[i] === "\n") return -1;
    if (content[i] === "]" && !isEscaped(content, i)) {
      altEnd = i;
      break;
    }
  }
  if (altEnd < 0 || content[altEnd + 1] !== "(") return -1;
  let depth = 1;
  let inAngle = false;
  for (let i = altEnd + 2; i < content.length; i += 1) {
    const ch = content[i];
    if (ch === "\n") return -1;
    if (ch === "<" && !isEscaped(content, i)) inAngle = true;
    else if (ch === ">" && inAngle && !isEscaped(content, i)) inAngle = false;
    else if (!inAngle && ch === "(" && !isEscaped(content, i)) depth += 1;
    else if (!inAngle && ch === ")" && !isEscaped(content, i)) {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

function markdownTarget(raw: string): string {
  const altEnd = raw.indexOf("](");
  if (altEnd < 0) return "";
  const inside = raw.slice(altEnd + 2, -1).trim();
  if (!inside) return "";
  if (inside.startsWith("<")) {
    const close = inside.indexOf(">");
    return close >= 0 ? inside.slice(1, close) : inside.slice(1);
  }
  let escaped = false;
  for (let i = 0; i < inside.length; i += 1) {
    const ch = inside[i];
    if (!ch) continue;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (/\s/.test(ch)) return inside.slice(0, i);
  }
  return inside;
}

function parseMarkdownImages(content: string): ImageOccurrence[] {
  const results: ImageOccurrence[] = [];
  for (let cursor = 0; cursor < content.length - 3; cursor += 1) {
    if (content[cursor] !== "!" || content[cursor + 1] !== "[") continue;
    if (content[cursor + 2] === "[") continue;
    const end = findMarkdownImageEnd(content, cursor);
    if (end < 0) continue;
    const raw = content.slice(cursor, end);
    const altEnd = raw.indexOf("](");
    const alt = altEnd >= 0 ? raw.slice(2, altEnd) : "";
    const altParts = alt.split("|");
    let alignment: ImageAlignment | undefined;
    let width: number | undefined;
    let height: number | undefined;
    for (const rawPart of altParts.slice(1)) {
      const part = rawPart.trim().toLowerCase();
      if (ALIGNMENTS.has(part as ImageAlignment)) {
        alignment = part as ImageAlignment;
        continue;
      }
      const size = parseSize(part);
      if (size.width) {
        width = size.width;
        height = size.height;
      }
    }
    const targetLegacy = stripLegacyAlignment(markdownTarget(raw));
    alignment = targetLegacy.alignment ?? alignment;
    const metadata = parseMetadataAfter(content, end);
    results.push({
      kind: "markdown",
      from: cursor,
      to: end,
      unitFrom: cursor,
      unitTo: metadata.unitTo,
      raw,
      unitRaw: content.slice(cursor, metadata.unitTo),
      target: targetLegacy.target,
      alignment: metadata.alignment ?? alignment,
      width,
      height,
    });
    cursor = end - 1;
  }
  return results;
}

export function parseImageOccurrences(content: string): ImageOccurrence[] {
  return [...parseWikiImages(content), ...parseMarkdownImages(content)]
    .sort((left, right) => left.from - right.from || left.to - right.to);
}

function normalizeTargetForComparison(value: string): string {
  let normalized = value.trim().replace(/\\/g, "/");
  try {
    normalized = decodeURIComponent(normalized);
  } catch {
    // Keep undecoded form.
  }
  normalized = normalized.replace(/^app:\/\/local\//i, "");
  normalized = normalized.split("?")[0] ?? normalized;
  normalized = normalized.split("#")[0] ?? normalized;
  return normalized.toLowerCase();
}

function targetMatches(occurrence: ImageOccurrence, sourceHint: string): boolean {
  const a = normalizeTargetForComparison(occurrence.target);
  const b = normalizeTargetForComparison(sourceHint);
  if (!a || !b) return true;
  if (a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`)) return true;
  const aName = a.split("/").pop();
  const bName = b.split("/").pop();
  return Boolean(aName && bName && aName === bName);
}

export function findImageOccurrence(
  content: string,
  hintOffset: number,
  sourceHint = "",
): ImageOccurrence | null {
  const candidates = parseImageOccurrences(content);
  if (!candidates.length) return null;
  const matching = sourceHint ? candidates.filter((candidate) => targetMatches(candidate, sourceHint)) : candidates;
  const pool = matching.length ? matching : candidates;
  let best: ImageOccurrence | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of pool) {
    const distance = hintOffset < candidate.from
      ? candidate.from - hintOffset
      : hintOffset > candidate.to
        ? hintOffset - candidate.to
        : 0;
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

function metadata(alignment?: ImageAlignment): string {
  return alignment ? ` <!-- knowgrove:image align=${alignment} -->` : "";
}

function cleanMarkdownAlt(alt: string): string {
  const parts = alt.split("|");
  const retained = [parts[0] ?? ""];
  for (const rawPart of parts.slice(1)) {
    const part = rawPart.trim().toLowerCase();
    if (ALIGNMENTS.has(part as ImageAlignment) || SIZE_TOKEN.test(part)) continue;
    retained.push(rawPart);
  }
  return retained.join("|");
}

function stripAlignmentFragmentFromMarkdownRaw(raw: string): string {
  const marker = raw.indexOf("](");
  if (marker < 0) return raw;
  const prefix = raw.slice(0, marker + 2);
  const inside = raw.slice(marker + 2, -1);
  const replaced = inside.replace(/#(?:left|center|right)(?=(?:\s+["'(]|\s*$))/i, "");
  return `${prefix}${replaced})`;
}

export function updateImageSyntax(occurrence: ImageOccurrence, update: ImageSyntaxUpdate): string {
  if (occurrence.kind === "wiki") {
    const inner = occurrence.raw.slice(3, -2);
    const parts = inner.split("|");
    const base = stripLegacyAlignment(parts.shift() ?? occurrence.target).target;
    const retained = parts.filter((part) => {
      const normalized = part.trim().toLowerCase();
      return !ALIGNMENTS.has(normalized as ImageAlignment) && !SIZE_TOKEN.test(normalized);
    });
    const nextParts = [base, ...retained];
    if (!update.reset && update.width) {
      nextParts.push(update.height ? `${Math.round(update.width)}x${Math.round(update.height)}` : `${Math.round(update.width)}`);
    } else if (!update.reset && occurrence.width) {
      nextParts.push(occurrence.height ? `${occurrence.width}x${occurrence.height}` : `${occurrence.width}`);
    }
    const alignment = update.reset ? undefined : (update.alignment ?? occurrence.alignment);
    return `![[${nextParts.join("|")}]]${metadata(alignment)}`;
  }

  const marker = occurrence.raw.indexOf("](");
  if (marker < 0) return occurrence.unitRaw;
  const currentAlt = occurrence.raw.slice(2, marker);
  const cleanAlt = cleanMarkdownAlt(currentAlt);
  const rawWithoutLegacyFragment = stripAlignmentFragmentFromMarkdownRaw(occurrence.raw);
  const currentMarker = rawWithoutLegacyFragment.indexOf("](");
  const destination = rawWithoutLegacyFragment.slice(currentMarker + 2, -1);
  let nextAlt = cleanAlt;
  if (!update.reset && update.width) {
    nextAlt = `${cleanAlt}|${Math.round(update.width)}${update.height ? `x${Math.round(update.height)}` : ""}`;
  } else if (!update.reset && occurrence.width) {
    nextAlt = `${cleanAlt}|${occurrence.width}${occurrence.height ? `x${occurrence.height}` : ""}`;
  }
  const alignment = update.reset ? undefined : (update.alignment ?? occurrence.alignment);
  return `![${nextAlt}](${destination})${metadata(alignment)}`;
}

function lineBounds(content: string, offset: number): { from: number; to: number; text: string } {
  const safe = Math.max(0, Math.min(offset, content.length));
  const from = content.lastIndexOf("\n", Math.max(0, safe - 1)) + 1;
  const newline = content.indexOf("\n", safe);
  const to = newline < 0 ? content.length : newline;
  return { from, to, text: content.slice(from, to) };
}

export function frontmatterEndOffset(content: string): number {
  if (!content.startsWith("---\n") && content !== "---") return 0;
  const close = content.indexOf("\n---", 3);
  if (close < 0) return 0;
  const after = close + 4;
  return content[after] === "\n" ? after + 1 : after;
}

export function isOffsetInsideFencedCode(content: string, offset: number): boolean {
  const safe = Math.max(0, Math.min(offset, content.length));
  const prefix = content.slice(0, safe);
  const lines = prefix.split("\n");
  let fence: { char: "`" | "~"; length: number } | null = null;
  for (const line of lines) {
    const match = line.match(/^\s*(`{3,}|~{3,})/);
    if (!match) continue;
    const token = match[1] ?? "";
    const char = token[0] as "`" | "~";
    if (!fence) {
      fence = { char, length: token.length };
    } else if (fence.char === char && token.length >= fence.length) {
      fence = null;
    }
  }
  return fence !== null;
}

function sourceRemovalRange(content: string, occurrence: ImageOccurrence): { from: number; to: number } {
  const line = lineBounds(content, occurrence.unitFrom);
  const before = content.slice(line.from, occurrence.unitFrom);
  const after = content.slice(occurrence.unitTo, line.to);
  if (!before.trim() && !after.trim()) {
    if (line.to < content.length) return { from: line.from, to: line.to + 1 };
    if (line.from > 0) return { from: line.from - 1, to: line.to };
    return { from: line.from, to: line.to };
  }
  let from = occurrence.unitFrom;
  let to = occurrence.unitTo;
  if (to < line.to && /[ \t]/.test(content[to] ?? "")) {
    while (to < line.to && /[ \t]/.test(content[to] ?? "")) to += 1;
  } else if (from > line.from && /[ \t]/.test(content[from - 1] ?? "")) {
    while (from > line.from && /[ \t]/.test(content[from - 1] ?? "")) from -= 1;
  }
  return { from, to };
}

export function buildImageMoveChanges(
  content: string,
  source: ImageOccurrence,
  targetOffset: number,
  placement: "line-before" | "line-after" | "image-before" | "image-after",
  targetImage?: ImageOccurrence | null,
): TextChange[] | null {
  const minimum = frontmatterEndOffset(content);
  if (targetOffset < minimum || isOffsetInsideFencedCode(content, targetOffset)) return null;
  const removal = sourceRemovalRange(content, source);
  const sourceText = source.unitRaw.trim();
  let insertAt = targetOffset;
  let insert = sourceText;

  if ((placement === "image-before" || placement === "image-after") && targetImage) {
    if (targetImage.unitFrom >= removal.from && targetImage.unitTo <= removal.to) return null;
    insertAt = placement === "image-before" ? targetImage.unitFrom : targetImage.unitTo;
    insert = placement === "image-before" ? `${sourceText} ` : ` ${sourceText}`;
  } else {
    const line = lineBounds(content, targetOffset);
    insertAt = placement === "line-before" ? line.from : line.to;
    insert = placement === "line-before" ? `${sourceText}\n` : `\n${sourceText}`;
  }

  if (insertAt >= removal.from && insertAt <= removal.to) return null;
  const changes: TextChange[] = [
    { from: removal.from, to: removal.to, insert: "" },
    { from: insertAt, to: insertAt, insert },
  ];
  return changes.sort((left, right) => left.from - right.from || left.to - right.to);
}

export function applyTextChanges(content: string, changes: TextChange[]): string {
  let result = content;
  for (const change of [...changes].sort((left, right) => right.from - left.from || right.to - left.to)) {
    result = result.slice(0, change.from) + change.insert + result.slice(change.to);
  }
  return result;
}

export function clampResize(
  width: number,
  height: number,
  maxWidth: number,
  minWidth = 60,
  minHeight = 40,
): { width: number; height: number } {
  const safeMax = Math.max(minWidth, maxWidth);
  const nextWidth = Math.max(minWidth, Math.min(Math.round(width), safeMax));
  const nextHeight = Math.max(minHeight, Math.round(height));
  return { width: nextWidth, height: nextHeight };
}
