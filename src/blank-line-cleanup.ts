export interface BlankLineCleanupResult {
  content: string;
  removedBlankLines: number;
  normalizedBlankLines: number;
  changed: boolean;
}

interface LineToken {
  text: string;
  ending: string;
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
    lines.push({ text: match[1] ?? "", ending: match[2] ?? "" });
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
      pendingBlank = { text: "", ending: line.ending };
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
