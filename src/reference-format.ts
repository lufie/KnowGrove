import type { ReferenceRecord } from "./types";
import { LEGACY_REFERENCE_PREFIX } from "./brand-migration";

export const MANAGED_BLOCK_PREFIX = "knowgrove-ref";
const READABLE_BLOCK_PREFIXES = [MANAGED_BLOCK_PREFIX, LEGACY_REFERENCE_PREFIX] as const;

function managedRange(content: string, id: string): { startIndex: number; endIndex: number; endLength: number } | null {
  for (const prefix of READABLE_BLOCK_PREFIXES) {
    const start = `<!-- ${prefix}:${id}:start -->`;
    const end = `<!-- ${prefix}:${id}:end -->`;
    const startIndex = content.indexOf(start);
    if (startIndex < 0) continue;
    const endIndex = content.indexOf(end, startIndex);
    if (endIndex >= 0) return { startIndex, endIndex, endLength: end.length };
  }
  return null;
}

function quoteLines(text: string): string {
  const normalized = text.trim();
  return normalized ? normalized.split("\n").map((line) => `> ${line}`).join("\n") : "> （暂无评论）";
}

function withoutMarkdownExtension(path: string): string {
  return path.replace(/\.md$/i, "");
}

export function renderManagedReference(record: ReferenceRecord): string {
  const source = withoutMarkdownExtension(record.sourcePath);
  return [
    `<!-- ${MANAGED_BLOCK_PREFIX}:${record.id}:start -->`,
    `> [!quote] 引用自 [[${source}]]`,
    `> ![[${source}#^${record.sourceBlockId}]]`,
    "",
    "> [!note] 评论",
    quoteLines(record.comment),
    "",
    `↩︎ [[${source}#^${record.sourceBlockId}|回到原文]] · 引用 ID：\`${record.id}\``,
    `<!-- ${MANAGED_BLOCK_PREFIX}:${record.id}:end -->`,
  ].join("\n");
}

export function replaceManagedReference(content: string, record: ReferenceRecord): string | null {
  const range = managedRange(content, record.id);
  if (!range) return null;
  return `${content.slice(0, range.startIndex)}${renderManagedReference(record)}${content.slice(range.endIndex + range.endLength)}`;
}

export function removeManagedReference(content: string, id: string): string | null {
  const range = managedRange(content, id);
  if (!range) return null;
  const before = content.slice(0, range.startIndex).replace(/[ \t]+$/gm, "").replace(/\s+$/, "");
  const after = content.slice(range.endIndex + range.endLength).replace(/^\s+/, "");
  if (!before) return after ? `${after}\n` : "";
  return after ? `${before}\n\n${after}\n` : `${before}\n`;
}

function headingPattern(heading: string): RegExp {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^(#{1,6})\\s+${escaped}\\s*#*\\s*$`, "m");
}

export function insertManagedReference(content: string, block: string, heading?: string): string {
  const clean = content.replace(/\s+$/, "");
  if (!heading?.trim()) return `${clean}\n\n${block}\n`;

  const wanted = heading.trim().replace(/^#{1,6}\s+/, "");
  const match = headingPattern(wanted).exec(clean);
  if (!match || match.index === undefined) {
    return `${clean}\n\n## ${wanted}\n\n${block}\n`;
  }

  const matchedHeading = match[1];
  if (!matchedHeading) return `${clean}\n\n${block}\n`;
  const level = matchedHeading.length;
  const sectionStart = match.index + match[0].length;
  const rest = clean.slice(sectionStart);
  const nextHeading = /^#{1,6}\s+.+$/gm;
  let insertion = clean.length;
  for (const candidate of rest.matchAll(nextHeading)) {
    const hashes = /^#+/.exec(candidate[0])?.[0].length ?? 7;
    if (hashes <= level && candidate.index !== undefined) {
      insertion = sectionStart + candidate.index;
      break;
    }
  }

  const before = clean.slice(0, insertion).replace(/\s+$/, "");
  const after = clean.slice(insertion).replace(/^\s+/, "");
  return after ? `${before}\n\n${block}\n\n${after}\n` : `${before}\n\n${block}\n`;
}

export function findManagedReferenceIdNearOffset(content: string, offset: number): string | null {
  const prefixes = READABLE_BLOCK_PREFIXES.join("|");
  const startPattern = new RegExp(`<!-- (?:${prefixes}):([a-zA-Z0-9-]+):start -->`, "g");
  let match: RegExpExecArray | null;
  while ((match = startPattern.exec(content)) !== null) {
    const id = match[1];
    if (!id || match.index > offset) break;
    const range = managedRange(content.slice(match.index), id);
    if (range && match.index + range.endIndex >= offset) return id;
  }
  return null;
}
