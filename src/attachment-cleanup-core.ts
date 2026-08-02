const SOURCE_EXTENSIONS = new Set(["md", "canvas", "base"]);
const ATTACHMENT_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp", "tif", "tiff", "heic", "heif",
  "mp3", "m4a", "wav", "aac", "flac", "ogg", "oga", "opus",
  "mp4", "mov", "mkv", "webm", "m4v", "avi",
  "pdf", "epub", "doc", "docx", "ppt", "pptx", "xls", "xlsx",
]);

export function isManagedAttachmentPath(path: string): boolean {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return ATTACHMENT_EXTENSIONS.has(extension);
}

export function isAttachmentReferenceSource(path: string): boolean {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return SOURCE_EXTENSIONS.has(extension);
}

export function isAttachmentCleanupExcludedPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "node_modules" || segment === ".git" || segment === ".obsidian" || segment === ".trash")) return true;
  if (normalized === "Home/🕹️skills" || normalized.startsWith("Home/🕹️skills/")) return true;
  return segments.some((segment) => segment.startsWith("."));
}

function normalizeReferenceTarget(rawTarget: string): string | null {
  let target = rawTarget.trim();
  if (!target) return null;
  if (target.startsWith("<") && target.endsWith(">")) target = target.slice(1, -1).trim();
  target = target.replace(/\s+["'][^"']*["']\s*$/, "").trim();
  if (/^(?:https?:|data:|mailto:|tel:|obsidian:|file:|#)/i.test(target)) return null;
  try {
    target = decodeURIComponent(target);
  } catch {
    // Keep malformed but locally resolvable paths unchanged.
  }
  target = target.split("#", 1)[0]?.split("?", 1)[0]?.trim() ?? "";
  return target ? target.replace(/^\.\//, "") : null;
}

export function extractVaultReferenceTargets(content: string, extension = "md"): string[] {
  const targets = new Set<string>();
  const add = (raw: string): void => {
    const normalized = normalizeReferenceTarget(raw);
    if (normalized) targets.add(normalized);
  };

  if (extension.toLowerCase() === "canvas") {
    try {
      const parsed = JSON.parse(content) as { nodes?: Array<{ type?: string; file?: string; text?: string }> };
      for (const node of parsed.nodes ?? []) {
        if (node.type === "file" && typeof node.file === "string") add(node.file);
        if (typeof node.text === "string") {
          for (const target of extractVaultReferenceTargets(node.text, "md")) add(target);
        }
      }
    } catch {
      // Invalid or partially-written Canvas files are handled by the raw link fallback below.
    }
  }

  for (const match of content.matchAll(/!?\[\[([^\]]+)\]\]/g)) {
    add((match[1] ?? "").split("|", 1)[0] ?? "");
  }
  for (const match of content.matchAll(/!?\[[^\]]*\]\((<[^>]+>|[^)]+)\)/g)) add(match[1] ?? "");
  for (const match of content.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)) add(match[1] ?? "");
  return Array.from(targets);
}

export function selectPreviouslyReferencedOrphanPaths(
  attachmentPaths: Iterable<string>,
  referencedPaths: ReadonlySet<string>,
  previouslyReferencedPaths: ReadonlySet<string>,
  createdAtByPath: ReadonlyMap<string, number>,
  now: number,
  gracePeriod: number,
): string[] {
  return Array.from(attachmentPaths)
    .filter((path) => previouslyReferencedPaths.has(path))
    .filter((path) => !referencedPaths.has(path))
    .filter((path) => now - (createdAtByPath.get(path) ?? 0) >= gracePeriod)
    .sort((left, right) => left.localeCompare(right, "zh-CN"));
}
