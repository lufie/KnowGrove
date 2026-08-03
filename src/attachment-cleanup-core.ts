const SOURCE_EXTENSIONS = new Set(["md", "canvas", "base"]);
const ATTACHMENT_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp", "tif", "tiff", "heic", "heif",
  "mp3", "m4a", "wav", "aac", "flac", "ogg", "oga", "opus",
  "mp4", "mov", "mkv", "webm", "m4v", "avi",
  "pdf", "epub", "doc", "docx", "ppt", "pptx", "xls", "xlsx",
]);
const REFERENCE_SOURCE_EXTENSIONS = new Set([".md", ".canvas", ".base"]);

export function normalizeAttachmentExtensions(values: Iterable<string>): string[] {
  const normalized = new Set<string>();
  for (const rawValue of values) {
    for (const rawExtension of rawValue.split(/[\s,，;；]+/)) {
      const trimmed = rawExtension.trim().toLowerCase();
      if (!trimmed) continue;
      const extension = trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
      if (Array.from(REFERENCE_SOURCE_EXTENSIONS).some((sourceExtension) => extension.endsWith(sourceExtension))) continue;
      if (!/^\.[a-z0-9][a-z0-9._+-]*$/i.test(extension)) continue;
      normalized.add(extension);
    }
  }
  return Array.from(normalized).sort((left, right) => left.localeCompare(right, "en"));
}

export function isManagedAttachmentPath(path: string, extraExtensions: Iterable<string> = []): boolean {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  if (ATTACHMENT_EXTENSIONS.has(extension)) return true;
  const normalizedPath = path.toLowerCase();
  return normalizeAttachmentExtensions(extraExtensions).some((candidate) => normalizedPath.endsWith(candidate));
}

export function isAttachmentReferenceSource(path: string): boolean {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return SOURCE_EXTENSIONS.has(extension);
}

export function parentVaultPath(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const separator = normalized.lastIndexOf("/");
  return separator < 0 ? "" : normalized.slice(0, separator);
}

export function attachmentFolderForNote(notePath: string, attachmentFolderPath: string): string {
  const noteFolder = parentVaultPath(notePath);
  const configured = attachmentFolderPath.trim().replace(/\\/g, "/");
  if (!configured || configured === "/") return "";
  if (configured === "." || configured === "./") return noteFolder;
  if (configured.startsWith("./")) {
    const relative = configured.slice(2).replace(/^\/+|\/+$/g, "");
    return [noteFolder, relative].filter(Boolean).join("/");
  }
  return configured.replace(/^\/+|\/+$/g, "");
}

export function isPathInsideVaultFolder(path: string, folder: string): boolean {
  const normalizedPath = path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const normalizedFolder = folder.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  return normalizedFolder
    ? normalizedPath === normalizedFolder || normalizedPath.startsWith(`${normalizedFolder}/`)
    : !normalizedPath.includes("/");
}

export function uniqueAttachmentTargetPath(
  folder: string,
  fileName: string,
  existingPaths: Iterable<string>,
): string {
  const existing = new Set(Array.from(existingPaths, (path) => path.toLocaleLowerCase()));
  const normalizedFolder = folder.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const candidate = [normalizedFolder, fileName].filter(Boolean).join("/");
  if (!existing.has(candidate.toLocaleLowerCase())) return candidate;
  const extensionIndex = fileName.lastIndexOf(".");
  const stem = extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName;
  const extension = extensionIndex > 0 ? fileName.slice(extensionIndex) : "";
  for (let index = 2; index < 10_000; index += 1) {
    const next = [normalizedFolder, `${stem} ${index}${extension}`].filter(Boolean).join("/");
    if (!existing.has(next.toLocaleLowerCase())) return next;
  }
  return [normalizedFolder, `${stem} ${Date.now()}${extension}`].filter(Boolean).join("/");
}

export function isAttachmentCleanupExcludedPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "node_modules" || segment === ".git" || segment === ".obsidian" || segment === ".trash")) return true;
  if (normalized === "Home/🕹️skills" || normalized.startsWith("Home/🕹️skills/")) return true;
  return segments.some((segment) => segment.startsWith("."));
}

export function isAttachmentCleanupExcludedByFolders(path: string, folders: Iterable<string>): boolean {
  const normalizedPath = path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  return Array.from(folders).some((folder) => {
    const normalizedFolder = folder.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    return Boolean(normalizedFolder) && (normalizedPath === normalizedFolder || normalizedPath.startsWith(`${normalizedFolder}/`));
  });
}

export function selectAttachmentReferenceSourcePaths(
  paths: Iterable<string>,
  excludedFolders: Iterable<string>,
): string[] {
  return Array.from(paths).filter((path) => (
    isAttachmentReferenceSource(path)
    && !isAttachmentCleanupExcludedPath(path)
    && !isAttachmentCleanupExcludedByFolders(path, excludedFolders)
  ));
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
  for (const match of content.matchAll(/(?:src|href|poster)\s*=\s*["']([^"']+)["']/gi)) add(match[1] ?? "");
  for (const match of content.matchAll(/srcset\s*=\s*["']([^"']+)["']/gi)) {
    for (const candidate of (match[1] ?? "").split(",")) add(candidate.trim().split(/\s+/, 1)[0] ?? "");
  }
  for (const match of content.matchAll(/^\s*\[[^\]]+\]:\s*(<[^>]+>|\S+)/gm)) add(match[1] ?? "");
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
