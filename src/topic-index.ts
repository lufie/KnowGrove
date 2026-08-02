import type { KnowledgeThemeDocument, KnowledgeThemeSummary } from "./types";
import { normalizeKnowledgeNameKey } from "./knowledge-cycle";

export interface TopicIndexEntry {
  name: string;
  parentName?: string;
  domains: string[];
  fixed: boolean;
  workspacePath: string;
  documents: KnowledgeThemeDocument[];
}

export interface TopicIndexRow {
  entry: TopicIndexEntry;
  depth: number;
}

export function buildTopicIndexEntries(
  themes: readonly KnowledgeThemeSummary[],
  documents: readonly KnowledgeThemeDocument[],
): TopicIndexEntry[] {
  const documentsByTopic = new Map<string, KnowledgeThemeDocument[]>();
  for (const document of documents) {
    const topicKeys = new Set(document.topics.map(normalizeKnowledgeNameKey).filter(Boolean));
    for (const topicKey of topicKeys) {
      const related = documentsByTopic.get(topicKey);
      if (related) related.push(document);
      else documentsByTopic.set(topicKey, [document]);
    }
  }
  for (const related of documentsByTopic.values()) {
    related.sort((left, right) => right.modifiedAt - left.modifiedAt || left.path.localeCompare(right.path, "zh-CN"));
  }
  return themes
    .map((theme): TopicIndexEntry => {
      const themeKey = normalizeKnowledgeNameKey(theme.name);
      const related = documentsByTopic.get(themeKey) ?? [];
      return {
        name: theme.name,
        parentName: theme.parentName,
        domains: [...theme.domains],
        fixed: theme.fixed,
        workspacePath: theme.workspacePath,
        documents: [...related],
      };
    })
    .filter((entry) => entry.fixed || entry.documents.length > 0)
    .sort((left, right) => right.documents.length - left.documents.length || left.name.localeCompare(right.name, "zh-CN"));
}

export function filterTopicIndexEntries(entries: readonly TopicIndexEntry[], query: string): TopicIndexEntry[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return [...entries];
  return entries.filter((entry) => `${entry.name} ${entry.domains.join(" ")} ${entry.documents
    .map((document) => `${document.basename} ${document.path}`)
    .join(" ")}`.toLocaleLowerCase().includes(normalizedQuery));
}

export function includeTopicIndexAncestors(
  matches: readonly TopicIndexEntry[],
  allEntries: readonly TopicIndexEntry[],
): TopicIndexEntry[] {
  const byName = new Map(allEntries.map((entry) => [normalizeKnowledgeNameKey(entry.name), entry]));
  const included = new Set(matches.map((entry) => normalizeKnowledgeNameKey(entry.name)));
  for (const match of matches) {
    let parentName = match.parentName;
    const visited = new Set<string>();
    while (parentName) {
      const key = normalizeKnowledgeNameKey(parentName);
      if (!key || visited.has(key)) break;
      visited.add(key);
      const parent = byName.get(key);
      if (!parent) break;
      included.add(key);
      parentName = parent.parentName;
    }
  }
  return allEntries.filter((entry) => included.has(normalizeKnowledgeNameKey(entry.name)));
}

export function flattenTopicIndexEntries(entries: readonly TopicIndexEntry[]): TopicIndexRow[] {
  const byName = new Map(entries.map((entry) => [normalizeKnowledgeNameKey(entry.name), entry]));
  const parentByName = new Map<string, string>();
  for (const entry of entries) {
    const key = normalizeKnowledgeNameKey(entry.name);
    const parentKey = normalizeKnowledgeNameKey(entry.parentName ?? "");
    if (parentKey && parentKey !== key && byName.has(parentKey)) parentByName.set(key, parentKey);
  }

  const hasCycle = (start: string): boolean => {
    const visited = new Set<string>();
    let current: string | undefined = start;
    while (current) {
      if (visited.has(current)) return true;
      visited.add(current);
      current = parentByName.get(current);
    }
    return false;
  };
  for (const key of [...parentByName.keys()]) {
    if (hasCycle(key)) parentByName.delete(key);
  }

  const children = new Map<string, TopicIndexEntry[]>();
  for (const entry of entries) {
    const parentKey = parentByName.get(normalizeKnowledgeNameKey(entry.name));
    if (!parentKey) continue;
    children.set(parentKey, [...(children.get(parentKey) ?? []), entry]);
  }
  const rows: TopicIndexRow[] = [];
  const visited = new Set<string>();
  const append = (entry: TopicIndexEntry, depth: number): void => {
    const key = normalizeKnowledgeNameKey(entry.name);
    if (visited.has(key)) return;
    visited.add(key);
    rows.push({ entry, depth });
    for (const child of children.get(key) ?? []) append(child, depth + 1);
  };
  for (const entry of entries) {
    if (!parentByName.has(normalizeKnowledgeNameKey(entry.name))) append(entry, 0);
  }
  for (const entry of entries) append(entry, 0);
  return rows;
}
