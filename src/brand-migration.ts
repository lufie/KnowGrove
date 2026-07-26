export const KNOWGROVE_PLUGIN_ID = "knowgrove";
export const KNOWGROVE_ROOT = "_KnowGrove";

export const LEGACY_PLUGIN_ID = "reading-companion";
export const LEGACY_ROOT = "_Reading Companion";
export const LEGACY_REFERENCE_PREFIX = "reading-companion-ref";
export const LEGACY_RESEARCH_SOURCE_SUFFIX = ".reading-companion-sources.json";
export const LEGACY_READING_VIEW_TYPE = "reading-companion-view";
export const KNOWGROVE_READING_VIEW_TYPE = "knowgrove-view";

const STRING_REPLACEMENTS: ReadonlyArray<readonly [string, string]> = [
  [LEGACY_READING_VIEW_TYPE, KNOWGROVE_READING_VIEW_TYPE],
  [LEGACY_ROOT, KNOWGROVE_ROOT],
  ["reading-companion-ref", "knowgrove-ref"],
  ["reading-companion:", "knowgrove:"],
  ["reading-companion-research-", "knowgrove-research-"],
  ["reading_companion_", "knowgrove_"],
  [LEGACY_RESEARCH_SOURCE_SUFFIX, ".knowgrove-sources.json"],
  ["Reading Companion managed", "KnowGrove managed"],
  ["Reading Companion", "KnowGrove"],
];

export interface BrandMigrationResult<T> {
  value: T;
  changed: boolean;
}

export function migrateLegacyBrandString(value: string): string {
  return STRING_REPLACEMENTS.reduce(
    (next, [legacy, current]) => next.split(legacy).join(current),
    value,
  );
}

export function migrateLegacyBrandValue<T>(value: T): BrandMigrationResult<T> {
  if (typeof value === "string") {
    const migrated = value === LEGACY_ROOT || value.startsWith(`${LEGACY_ROOT}/`)
      ? `${KNOWGROVE_ROOT}${value.slice(LEGACY_ROOT.length)}`
      : value;
    return { value: migrated as T, changed: migrated !== value };
  }
  if (Array.isArray(value)) {
    let changed = false;
    const migrated = value.map((item) => {
      const result = migrateLegacyBrandValue(item);
      changed ||= result.changed;
      return result.value;
    });
    return { value: migrated as T, changed };
  }
  if (value && typeof value === "object") {
    let changed = false;
    const migrated: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const result = migrateLegacyBrandValue(item);
      changed ||= result.changed;
      migrated[key] = result.value;
    }
    return { value: migrated as T, changed };
  }
  return { value, changed: false };
}

export function migrateLegacyManagedContent(content: string): BrandMigrationResult<string> {
  const value = migrateLegacyBrandString(content);
  return { value, changed: value !== content };
}

export function isLegacyResearchSourceStatePath(path: string): boolean {
  return path.endsWith(LEGACY_RESEARCH_SOURCE_SUFFIX);
}

export function migrateLegacyResearchSourceStatePath(path: string): string {
  return path.endsWith(LEGACY_RESEARCH_SOURCE_SUFFIX)
    ? `${path.slice(0, -LEGACY_RESEARCH_SOURCE_SUFFIX.length)}.knowgrove-sources.json`
    : path;
}

export function legacyResearchSourceStatePath(workspacePath: string): string {
  return workspacePath.replace(/\.md$/i, LEGACY_RESEARCH_SOURCE_SUFFIX);
}
