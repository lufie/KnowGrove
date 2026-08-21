const RECENT_DOCUMENT_EXTENSIONS = new Set(["md", "base", "canvas"]);

function fileExtension(path: string): string {
  const fileName = path.split("/").pop() ?? "";
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : "";
}

export function isRecentDocumentPath(path: string): boolean {
  return RECENT_DOCUMENT_EXTENSIONS.has(fileExtension(path));
}

export function selectRecentDocumentPaths(
  history: readonly string[],
  existingPaths: Pick<ReadonlySet<string>, "has">,
  limit = 8,
): string[] {
  if (limit <= 0) return [];
  const selected: string[] = [];
  const seen = new Set<string>();
  for (const path of history) {
    if (seen.has(path) || !existingPaths.has(path) || !isRecentDocumentPath(path)) continue;
    seen.add(path);
    selected.push(path);
    if (selected.length >= limit) break;
  }
  return selected;
}
