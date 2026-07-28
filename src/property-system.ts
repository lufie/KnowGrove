import type {
  PropertyAudit,
  PropertyAuditChange,
  PropertyAuditIssue,
  PropertyChangeOperation,
  PropertyDimensionConfig,
  PropertyFillStrategy,
  PropertyFlowCounts,
  PropertyInventoryItem,
  PropertyNoteSnapshot,
  PropertySystemSettings,
  PropertyValueType,
} from "./types";

const INTERNAL_FRONTMATTER_KEYS = new Set(["position"]);
const SPECIAL_PROPERTY_KEYS = new Set(["aliases", "cssclasses", "tags"]);
const SYSTEM_FILE_NAMES = new Set(["AGENTS.md", "DESIGN.md", "SKILL.md"]);
const SYSTEM_PATH_SEGMENTS = new Set([".git", ".obsidian", "node_modules"]);
const SYSTEM_DIMENSION_IDS = new Set(["file-name", "type", "status", "domain", "topic"]);
export const PROPERTY_BASE_MANAGED_MARKER = "# KnowGrove managed property Base";
export const PROPERTY_RULE_SCHEMA_VERSION = 7;
export const LEGACY_FOCUS_PROPERTY_NAMES = ["重点关注"] as const;

interface PropertyFlowRule {
  viewName: string;
  types: readonly string[];
  statuses?: readonly string[];
}

export interface ExternalFocusPropertyRule {
  enabled: boolean;
  propertyName: string;
  aliases?: readonly string[];
  reading?: {
    propertyName: string;
    readingValue: string;
    finishedValue: string;
  };
}

export const PROPERTY_FLOW_RULES = {
  input: {
    viewName: "📥 输入与收藏",
    types: ["输入资料"],
    statuses: ["待整理", "待归类", "待沉淀", "处理失败"],
  },
  knowledge: {
    viewName: "🌱 知识生长",
    types: ["随手笔记", "知识笔记", "复盘"],
  },
  project: {
    viewName: "🚧 项目推进",
    types: ["项目笔记"],
    statuses: ["构思中", "进行中", "等待中"],
  },
  action: {
    viewName: "✅ 行动推进",
    types: ["行动"],
    statuses: ["待办", "进行中", "等待中"],
  },
  output: {
    viewName: "✍️ 内容输出",
    types: ["内容输出"],
    statuses: ["选题", "提纲", "草稿", "待发布", "已发布", "已复盘"],
  },
} as const satisfies Record<keyof PropertyFlowCounts, PropertyFlowRule>;

function normalizePathValue(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function cloneValue<T>(value: T): T {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

export function normalizePropertyDimensions(
  dimensions: PropertyDimensionConfig[],
  creationDateProperty: string,
): PropertyDimensionConfig[] {
  const creationProperty = creationDateProperty.trim() || "创建时间";
  return dimensions.map((dimension) => {
    const inferredOrigin = dimension.origin
      ?? (SYSTEM_DIMENSION_IDS.has(dimension.id)
        ? "system"
        : dimension.description.startsWith("扫描发现：覆盖")
          ? "inferred"
          : "user");
    const normalized: PropertyDimensionConfig = {
      ...cloneValue(dimension),
      origin: inferredOrigin,
      aiManaged: dimension.aiManaged ?? (dimension.id === "domain" || dimension.id === "topic"),
      enumMode: dimension.enumMode
        ?? (inferredOrigin === "system" && dimension.allowedValues.length ? "closed" : "open"),
      requiredForTypes: Array.from(new Set(
        (dimension.requiredForTypes ?? []).map((value) => value.trim()).filter(Boolean),
      )),
    };
    if (normalized.origin === "inferred") normalized.required = false;
    if (normalized.aiManaged && normalized.fillStrategy === "empty-list") normalized.fillStrategy = "none";
    if (normalized.name === creationProperty) {
      normalized.origin = "system";
      normalized.required = false;
      normalized.requiredForTypes = ["输入资料"];
      normalized.valueType = "date";
      normalized.aiManaged = false;
      normalized.enumMode = "open";
      normalized.description = "输入资料进入知识库的日期；只对输入资料必填。";
    }
    return normalized;
  });
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function scalarText(value: unknown): string | null {
  if (typeof value === "string") return value.trim() ? value.trim() : null;
  if (typeof value === "number") return String(value);
  return null;
}

function collectScalarValues(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values.map(scalarText).filter((item): item is string => item !== null);
}

function isDateValue(value: unknown): boolean {
  return value instanceof Date
    || (typeof value === "string" && /^\d{4}-\d{2}-\d{2}(?:[T ][^\s]+)?$/.test(value.trim()));
}

function inferValueType(values: unknown[], uniqueValues: string[]): PropertyValueType {
  if (values.some(Array.isArray)) return "multi";
  if (values.length && values.every((value) => typeof value === "boolean")) return "checkbox";
  if (values.length && values.every(isDateValue)) return "date";
  const ratio = values.length ? uniqueValues.length / values.length : 1;
  return uniqueValues.length > 0 && uniqueValues.length <= 20 && ratio <= 0.35 ? "single" : "text";
}

function makeDimensionId(name: string, existing: Set<string>): string {
  const ascii = name.toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const base = ascii || `property-${Array.from(name).map((char) => char.codePointAt(0)?.toString(36) ?? "").join("-")}`;
  let candidate = base;
  let index = 2;
  while (existing.has(candidate)) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  existing.add(candidate);
  return candidate;
}

function inferredFillStrategy(name: string, valueType: PropertyValueType): PropertyFillStrategy {
  if (name === "文件名") return "file-name";
  if (valueType === "multi") return "empty-list";
  return "none";
}

export function isPropertyGovernedPath(path: string, settings: PropertySystemSettings): boolean {
  const normalized = normalizePathValue(path);
  if (!normalized.toLocaleLowerCase().endsWith(".md")) return false;
  const fileName = normalized.slice(normalized.lastIndexOf("/") + 1);
  if (SYSTEM_FILE_NAMES.has(fileName)) return false;
  if (normalized.split("/").some((part) => SYSTEM_PATH_SEGMENTS.has(part))) return false;

  const scope = normalizePathValue(settings.scopeFolder);
  if (scope && normalized !== `${scope}.md` && !normalized.startsWith(`${scope}/`)) return false;
  for (const folder of settings.excludedFolders) {
    const excluded = normalizePathValue(folder);
    if (excluded && (normalized === `${excluded}.md` || normalized.startsWith(`${excluded}/`))) return false;
  }
  return true;
}

export function shouldInitializeTrackedNote(
  path: string,
  extension: string,
  trackedFolder: string,
  autoMarkNewNotes: boolean,
): boolean {
  if (!autoMarkNewNotes || extension.toLocaleLowerCase() !== "md") return false;
  const normalized = normalizePathValue(path);
  const folder = normalizePathValue(trackedFolder);
  return !folder || normalized.startsWith(`${folder}/`);
}

export function localDateFromTimestamp(timestamp: number, fallback = new Date()): string {
  const date = Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp) : fallback;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function analyzePropertyInventory(
  snapshots: PropertyNoteSnapshot[],
  settings: PropertySystemSettings,
): { inventory: PropertyInventoryItem[]; suggestedDimensions: PropertyDimensionConfig[]; governedFiles: number } {
  const governed = snapshots.filter((snapshot) => isPropertyGovernedPath(snapshot.path, settings));
  const observed = new Map<string, { values: unknown[]; files: number }>();
  for (const snapshot of governed) {
    for (const [name, value] of Object.entries(snapshot.frontmatter ?? {})) {
      if (INTERNAL_FRONTMATTER_KEYS.has(name)) continue;
      const entry = observed.get(name) ?? { values: [], files: 0 };
      entry.files += 1;
      entry.values.push(value);
      observed.set(name, entry);
    }
  }

  const inventory = Array.from(observed.entries()).map(([name, entry]): PropertyInventoryItem => {
    const counts = new Map<string, number>();
    for (const value of entry.values) {
      for (const item of collectScalarValues(value)) counts.set(item, (counts.get(item) ?? 0) + 1);
    }
    const topValues = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"))
      .slice(0, 12)
      .map(([value, count]) => ({ value, count }));
    return {
      name,
      files: entry.files,
      coverage: governed.length ? entry.files / governed.length : 0,
      valueType: inferValueType(entry.values, Array.from(counts.keys())),
      uniqueValues: counts.size,
      topValues,
    };
  }).sort((a, b) => b.files - a.files || a.name.localeCompare(b.name, "zh-CN"));

  const represented = new Set<string>();
  const ids = new Set<string>();
  const suggestedDimensions = settings.dimensions.map((dimension) => {
    ids.add(dimension.id);
    represented.add(dimension.name.toLocaleLowerCase());
    dimension.aliases.forEach((alias) => represented.add(alias.toLocaleLowerCase()));
    return cloneValue(dimension);
  });
  const threshold = Math.max(3, Math.ceil(governed.length * 0.05));
  for (const property of inventory) {
    if (suggestedDimensions.length >= settings.dimensions.length + 8) break;
    if (property.files < threshold || represented.has(property.name.toLocaleLowerCase())) continue;
    if (SPECIAL_PROPERTY_KEYS.has(property.name)) continue;
    suggestedDimensions.push({
      id: makeDimensionId(property.name, ids),
      name: property.name,
      description: `扫描发现：覆盖 ${property.files} 篇笔记`,
      aliases: [],
      valueType: property.valueType,
      required: false,
      requiredForTypes: [],
      origin: "inferred",
      aiManaged: false,
      enumMode: "open",
      allowedValues: property.valueType === "single" && property.uniqueValues <= 20
        ? property.topValues.map((item) => item.value)
        : [],
      fillStrategy: inferredFillStrategy(property.name, property.valueType),
      defaultValue: "",
    });
    represented.add(property.name.toLocaleLowerCase());
  }
  return { inventory, suggestedDimensions, governedFiles: governed.length };
}

export function countPropertyFlowSnapshots(
  snapshots: PropertyNoteSnapshot[],
  settings: PropertySystemSettings,
): PropertyFlowCounts {
  const counts: PropertyFlowCounts = { input: 0, knowledge: 0, project: 0, action: 0, output: 0 };
  const keys = Object.keys(PROPERTY_FLOW_RULES) as Array<keyof PropertyFlowCounts>;
  for (const snapshot of snapshots) {
    if (!isPropertyGovernedPath(snapshot.path, settings)) continue;
    const type = typeof snapshot.frontmatter?.类型 === "string" ? snapshot.frontmatter.类型.trim() : "";
    const status = typeof snapshot.frontmatter?.状态 === "string" ? snapshot.frontmatter.状态.trim() : "";
    for (const key of keys) {
      const rule: PropertyFlowRule = PROPERTY_FLOW_RULES[key];
      if (!rule.types.includes(type)) continue;
      if (rule.statuses && !rule.statuses.includes(status)) continue;
      counts[key] += 1;
    }
  }
  return counts;
}

function issue(
  snapshot: PropertyNoteSnapshot,
  dimension: PropertyDimensionConfig,
  kind: PropertyAuditIssue["kind"],
  message: string,
  automatic: boolean,
  currentValue?: unknown,
  suggestedValue?: unknown,
): PropertyAuditIssue {
  return {
    path: snapshot.path,
    property: dimension.name,
    kind,
    message,
    automatic,
    currentValue: cloneValue(currentValue),
    suggestedValue: cloneValue(suggestedValue),
  };
}

function fillValue(dimension: PropertyDimensionConfig, snapshot: PropertyNoteSnapshot): unknown {
  if (dimension.aiManaged) return undefined;
  if (dimension.fillStrategy === "file-name") return snapshot.basename;
  if (dimension.fillStrategy === "empty-list") return [];
  if (dimension.fillStrategy === "fixed") {
    if (dimension.valueType === "multi") {
      return dimension.defaultValue.split(/[，,\n]/).map((item) => item.trim()).filter(Boolean);
    }
    if (dimension.valueType === "checkbox") return dimension.defaultValue === "true";
    return dimension.defaultValue;
  }
  return undefined;
}

function validateAllowedValues(dimension: PropertyDimensionConfig, value: unknown): string[] {
  if (dimension.enumMode !== "closed"
    || !dimension.allowedValues.length
    || value === undefined
    || value === null) return [];
  const allowed = new Set(dimension.allowedValues);
  return collectScalarValues(value).filter((item) => !allowed.has(item));
}

function auditReadingStatus(
  snapshot: PropertyNoteSnapshot,
  rule: NonNullable<ExternalFocusPropertyRule["reading"]>,
): { issues: PropertyAuditIssue[]; operations: PropertyChangeOperation[] } {
  const propertyName = rule.propertyName.trim();
  if (!propertyName) return { issues: [], operations: [] };
  const frontmatter = snapshot.frontmatter ?? {};
  if (!Object.prototype.hasOwnProperty.call(frontmatter, propertyName)) {
    return { issues: [], operations: [] };
  }

  const readingValue = rule.readingValue.trim();
  const finishedValue = rule.finishedValue.trim();
  const current = scalarText(frontmatter[propertyName]);
  const dimension: PropertyDimensionConfig = {
    id: "knowgrove-reading-status",
    name: propertyName,
    description: "阅读列表使用的阅读进度。",
    aliases: [],
    valueType: "single",
    required: false,
    requiredForTypes: [],
    origin: "system",
    aiManaged: false,
    enumMode: "closed",
    allowedValues: [readingValue, finishedValue].filter(Boolean),
    fillStrategy: "none",
    defaultValue: "",
  };
  if (current === readingValue || current === finishedValue) return { issues: [], operations: [] };

  const aliasTarget = current === "未读"
    ? readingValue
    : current === "已读"
      ? finishedValue
      : "";
  if (current && aliasTarget && current !== aliasTarget) {
    return {
      issues: [issue(
        snapshot,
        dimension,
        "invalid-value",
        `阅读状态“${current}”将统一为配置值“${aliasTarget}”`,
        true,
        current,
        aliasTarget,
      )],
      operations: [{
        kind: "set",
        property: propertyName,
        before: current,
        after: aliasTarget,
        reason: "统一阅读状态别名",
      }],
    };
  }

  return {
    issues: [issue(
      snapshot,
      dimension,
      "invalid-value",
      `阅读状态应为“${readingValue}”或“${finishedValue}”`,
      false,
      frontmatter[propertyName],
    )],
    operations: [],
  };
}

function auditPresentValue(
  snapshot: PropertyNoteSnapshot,
  dimension: PropertyDimensionConfig,
  value: unknown,
): { issues: PropertyAuditIssue[]; operations: PropertyChangeOperation[] } {
  const issues: PropertyAuditIssue[] = [];
  const operations: PropertyChangeOperation[] = [];
  let normalizedValue = value;

  if (dimension.valueType === "multi" && !Array.isArray(value)) {
    const scalar = scalarText(value);
    if (scalar !== null) {
      normalizedValue = [scalar];
      issues.push(issue(snapshot, dimension, "wrong-type", "应为多值列表，当前是单值", true, value, normalizedValue));
      operations.push({ kind: "set", property: dimension.name, before: cloneValue(value), after: normalizedValue, reason: "统一为多值列表" });
    } else {
      issues.push(issue(snapshot, dimension, "wrong-type", "应为多值列表，需要人工检查", false, value));
    }
  } else if (dimension.valueType !== "multi" && Array.isArray(value)) {
    if (value.length === 1) {
      normalizedValue = value[0];
      issues.push(issue(snapshot, dimension, "wrong-type", "应为单值，当前是单项列表", true, value, normalizedValue));
      operations.push({ kind: "set", property: dimension.name, before: cloneValue(value), after: normalizedValue, reason: "统一为单值" });
    } else {
      issues.push(issue(snapshot, dimension, "wrong-type", "应为单值，但当前包含多个值", false, value));
    }
  }

  if (dimension.valueType === "checkbox" && typeof normalizedValue !== "boolean") {
    if (normalizedValue === "true" || normalizedValue === "false") {
      const next = normalizedValue === "true";
      issues.push(issue(snapshot, dimension, "wrong-type", "布尔值使用了文本格式", true, normalizedValue, next));
      operations.push({ kind: "set", property: dimension.name, before: cloneValue(normalizedValue), after: next, reason: "统一为布尔值" });
      normalizedValue = next;
    } else {
      issues.push(issue(snapshot, dimension, "wrong-type", "应为勾选类型，需要人工检查", false, normalizedValue));
    }
  }
  if (dimension.valueType === "date" && !isDateValue(normalizedValue)) {
    issues.push(issue(snapshot, dimension, "wrong-type", "应为日期格式 YYYY-MM-DD", false, normalizedValue));
  }

  const invalidValues = validateAllowedValues(dimension, normalizedValue);
  if (invalidValues.length) {
    issues.push(issue(
      snapshot,
      dimension,
      "invalid-value",
      `包含规范外枚举：${invalidValues.join("、")}`,
      false,
      normalizedValue,
    ));
  }
  return { issues, operations };
}

function auditDimension(
  snapshot: PropertyNoteSnapshot,
  dimension: PropertyDimensionConfig,
  required: boolean,
): { issues: PropertyAuditIssue[]; operations: PropertyChangeOperation[] } {
  const frontmatter = snapshot.frontmatter ?? {};
  const canonicalPresent = Object.prototype.hasOwnProperty.call(frontmatter, dimension.name);
  const aliases = dimension.aliases.filter((alias) => Object.prototype.hasOwnProperty.call(frontmatter, alias));
  const issues: PropertyAuditIssue[] = [];
  const operations: PropertyChangeOperation[] = [];

  if (!canonicalPresent && aliases.length === 1) {
    const alias = aliases[0];
    if (alias) {
      const value = frontmatter[alias];
      const validation = auditPresentValue(snapshot, dimension, value);
      const normalized = dimension.fillStrategy === "file-name"
        ? snapshot.basename
        : validation.operations.at(-1)?.after ?? value;
      issues.push(issue(snapshot, dimension, "legacy-alias", `旧属性“${alias}”可迁移为“${dimension.name}”`, true, value, value));
      if (dimension.fillStrategy === "file-name" && value !== snapshot.basename) {
        issues.push(issue(
          snapshot,
          dimension,
          "invalid-value",
          "文件名属性应与 Markdown 文件标题一致",
          true,
          value,
          snapshot.basename,
        ));
      }
      issues.push(...validation.issues);
      operations.push({
        kind: "rename",
        property: dimension.name,
        alias,
        before: cloneValue(value),
        after: cloneValue(normalized),
        reason: `迁移旧属性 ${alias}`,
      });
      return { issues, operations };
    }
  }

  if (!canonicalPresent) {
    if (aliases.length > 1) {
      issues.push(issue(snapshot, dimension, "alias-conflict", `发现多个旧属性：${aliases.join("、")}`, false));
      return { issues, operations };
    }
    if (!required) return { issues, operations };
    const suggested = fillValue(dimension, snapshot);
    const automatic = suggested !== undefined;
    issues.push(issue(
      snapshot,
      dimension,
      "missing",
      automatic ? "缺少必备属性，可按配置自动补齐" : "缺少必备属性，需要根据内容判断",
      automatic,
      undefined,
      suggested,
    ));
    if (automatic) operations.push({
      kind: "set",
      property: dimension.name,
      before: undefined,
      after: cloneValue(suggested),
      reason: "补齐必备属性",
    });
    return { issues, operations };
  }

  const value = frontmatter[dimension.name];
  if (aliases.length) {
    issues.push(issue(snapshot, dimension, "alias-conflict", `规范属性与旧属性同时存在：${aliases.join("、")}`, false, value));
  }
  if (dimension.fillStrategy === "file-name" && value !== snapshot.basename) {
    issues.push(issue(
      snapshot,
      dimension,
      "invalid-value",
      "文件名属性应与 Markdown 文件标题一致",
      true,
      value,
      snapshot.basename,
    ));
    operations.push({
      kind: "set",
      property: dimension.name,
      before: cloneValue(value),
      after: snapshot.basename,
      reason: "同步 Markdown 文件标题",
    });
    return { issues, operations };
  }
  if (required && (value === null || value === "")) {
    const suggested = fillValue(dimension, snapshot);
    const automatic = suggested !== undefined;
    issues.push(issue(
      snapshot,
      dimension,
      "missing",
      automatic ? "必备属性为空，可按配置自动补齐" : "必备属性为空，需要根据内容判断",
      automatic,
      value,
      suggested,
    ));
    if (automatic) operations.push({
      kind: "set",
      property: dimension.name,
      before: cloneValue(value),
      after: cloneValue(suggested),
      reason: "补齐空的必备属性",
    });
    return { issues, operations };
  }
  const validation = auditPresentValue(snapshot, dimension, value);
  issues.push(...validation.issues);
  operations.push(...validation.operations);
  return { issues, operations };
}

export function auditPropertySnapshots(
  snapshots: PropertyNoteSnapshot[],
  settings: PropertySystemSettings,
  focusRule?: ExternalFocusPropertyRule,
): PropertyAudit {
  const governed = snapshots.filter((snapshot) => isPropertyGovernedPath(snapshot.path, settings));
  const issues: PropertyAuditIssue[] = [];
  const changes: PropertyAuditChange[] = [];
  const compliantPaths: string[] = [];
  const nonCompliantPaths: string[] = [];
  let compliantFiles = 0;

  for (const snapshot of governed) {
    const fileIssues: PropertyAuditIssue[] = [];
    const operations: PropertyChangeOperation[] = [];
    const frontmatter = snapshot.frontmatter ?? {};
    const noteType = scalarText(frontmatter.类型);
    for (const dimension of settings.dimensions) {
      const required = dimension.required
        || (noteType !== null && (dimension.requiredForTypes ?? []).includes(noteType));
      const result = auditDimension(snapshot, dimension, required);
      fileIssues.push(...result.issues);
      operations.push(...result.operations);
    }
    if (focusRule?.reading) {
      const reading = auditReadingStatus(snapshot, focusRule.reading);
      fileIssues.push(...reading.issues);
      operations.push(...reading.operations);
    }
    const focusProperty = focusRule?.propertyName.trim() ?? "";
    const focusAliases = (focusRule?.aliases ?? [])
      .map((alias) => alias.trim())
      .filter(Boolean);
    const hasFocusProperty = [focusProperty, ...focusAliases]
      .some((property) => Object.prototype.hasOwnProperty.call(frontmatter, property));
    if (focusRule?.enabled
      && focusProperty
      && noteType === settings.trackedNoteType
      && !settings.dimensions.some((dimension) => dimension.name === focusProperty)
      && !hasFocusProperty) {
      const focusDimension: PropertyDimensionConfig = {
        id: "knowgrove-external-focus",
        name: focusProperty,
        description: "外部输入资料的收藏开关。",
        aliases: [],
        valueType: "checkbox",
        required: false,
        requiredForTypes: [settings.trackedNoteType],
        allowedValues: [],
        fillStrategy: "fixed",
        defaultValue: "false",
      };
      fileIssues.push(issue(
        snapshot,
        focusDimension,
        "missing",
        "外部输入资料缺少收藏开关，自动补为未选中",
        true,
        undefined,
        false,
      ));
      operations.push({
        kind: "set",
        property: focusProperty,
        before: undefined,
        after: false,
        reason: "为外部输入资料补齐收藏 Checkbox",
      });
    }
    const creationDateProperty = settings.creationDateProperty.trim() || "创建时间";
    if (frontmatter.类型 === "输入资料"
      && !settings.dimensions.some((dimension) => dimension.name === creationDateProperty)) {
      const creationDimension: PropertyDimensionConfig = {
        id: "knowgrove-input-creation-date",
        name: creationDateProperty,
        description: "输入资料进入知识库的日期。",
        aliases: [],
        valueType: "date",
        required: true,
        allowedValues: [],
        fillStrategy: "none",
        defaultValue: "",
      };
      if (!Object.prototype.hasOwnProperty.call(frontmatter, creationDateProperty)
        || frontmatter[creationDateProperty] === null
        || frontmatter[creationDateProperty] === "") {
        fileIssues.push(issue(
          snapshot,
          creationDimension,
          "missing",
          "输入资料缺少进入知识库日期，需要人工确认",
          false,
          frontmatter[creationDateProperty],
        ));
      } else if (!isDateValue(frontmatter[creationDateProperty])) {
        fileIssues.push(issue(
          snapshot,
          creationDimension,
          "wrong-type",
          "输入资料的进入知识库日期应为 YYYY-MM-DD",
          false,
          frontmatter[creationDateProperty],
        ));
      }
    }
    if (!fileIssues.length) {
      compliantFiles += 1;
      compliantPaths.push(snapshot.path);
    } else {
      nonCompliantPaths.push(snapshot.path);
    }
    issues.push(...fileIssues);
    if (operations.length) changes.push({ path: snapshot.path, basename: snapshot.basename, operations });
  }

  return {
    scannedFiles: snapshots.length,
    governedFiles: governed.length,
    excludedFiles: snapshots.length - governed.length,
    compliantFiles,
    nonCompliantFiles: governed.length - compliantFiles,
    compliantPaths,
    nonCompliantPaths,
    automaticFiles: changes.length,
    automaticOperations: changes.reduce((sum, change) => sum + change.operations.length, 0),
    manualIssues: issues.filter((item) => !item.automatic).length,
    issues,
    changes,
    createdAt: new Date().toISOString(),
  };
}

export function operationStillApplies(frontmatter: Record<string, unknown>, operation: PropertyChangeOperation): boolean {
  if (operation.kind === "rename") {
    return operation.alias !== undefined
      && !Object.prototype.hasOwnProperty.call(frontmatter, operation.property)
      && valuesEqual(frontmatter[operation.alias], operation.before);
  }
  if (operation.before === undefined) return !Object.prototype.hasOwnProperty.call(frontmatter, operation.property);
  return valuesEqual(frontmatter[operation.property], operation.before);
}

export function applyOperation(frontmatter: Record<string, unknown>, operation: PropertyChangeOperation): void {
  frontmatter[operation.property] = cloneValue(operation.after);
  if (operation.kind === "rename" && operation.alias) delete frontmatter[operation.alias];
}

export function initializeTrackedNoteFrontmatter(
  frontmatter: Record<string, unknown>,
  basename: string,
  settings: PropertySystemSettings,
  readingProperty: string,
  readingValue: string,
  createdDate: string,
  deferredProperties: ReadonlySet<string> = new Set<string>(),
  focusProperty = "",
): boolean {
  const hasOwn = (property: string) => Object.prototype.hasOwnProperty.call(frontmatter, property);
  if (!settings.initializeTrackedNotes) {
    if (hasOwn(readingProperty)) return false;
    frontmatter[readingProperty] = readingValue;
    return true;
  }

  const creationDateProperty = settings.creationDateProperty.trim() || "创建时间";
  const requiredValues: Array<[string, unknown]> = [
    ["文件名", basename],
    ["类型", settings.trackedNoteType],
    ["状态", settings.trackedNoteStatus],
    [creationDateProperty, createdDate],
    [readingProperty, readingValue],
    ["领域", []],
    ["主题", []],
  ];
  if (focusProperty.trim()) {
    const hasLegacyFocus = focusProperty.trim() === "收藏"
      && LEGACY_FOCUS_PROPERTY_NAMES.some((property) => hasOwn(property));
    if (!hasLegacyFocus) requiredValues.push([focusProperty.trim(), false]);
  }
  const additions = new Map<string, unknown>();
  for (const [property, value] of requiredValues) {
    if (deferredProperties.has(property)) continue;
    if (!hasOwn(property) && !additions.has(property)) additions.set(property, cloneValue(value));
  }

  const originalEntries = Object.entries(frontmatter);
  const fileNameWasFirst = originalEntries[0]?.[0] === "文件名";
  const changed = additions.size > 0 || !fileNameWasFirst;
  if (!changed) return false;

  const fileNameValue = hasOwn("文件名") ? frontmatter.文件名 : additions.get("文件名");
  for (const key of Object.keys(frontmatter)) delete frontmatter[key];
  frontmatter.文件名 = cloneValue(fileNameValue);
  additions.delete("文件名");
  for (const [property, value] of originalEntries) {
    if (property !== "文件名") frontmatter[property] = value;
  }
  for (const [property, value] of additions) frontmatter[property] = value;
  return true;
}

function yamlDoubleQuoted(value: string): string {
  return JSON.stringify(value);
}

function yamlSingleQuoted(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function formulaString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function isManagedPropertyBaseContent(content: string): boolean {
  if (content.startsWith(PROPERTY_BASE_MANAGED_MARKER)) return true;
  if (/^\s*knowgrove_managed:\s*/m.test(content)) return true;
  return /property_compliance:\s*/.test(content)
    && (/name:\s*["']?工作流看板["']?/.test(content) || /name:\s*["']?✅ 已符合规范["']?/.test(content))
    && (/name:\s*["']?待规范["']?/.test(content) || /name:\s*["']?⚠️ 待规范["']?/.test(content));
}

interface PropertyBaseViewDefinition {
  name: string;
  filterLines?: string[];
  groupBy?: string;
  order: string[];
  limit?: number;
}

function quotedFilter(expression: string): string {
  return yamlSingleQuoted(expression);
}

function typeFilterLines(types: readonly string[]): string[] {
  if (types.length === 1) return [quotedFilter(`类型 == "${formulaString(types[0] ?? "")}"`)];
  return [
    "or:",
    ...types.map((type) => `  - ${quotedFilter(`类型 == "${formulaString(type)}"`)}`),
  ];
}

function filePathFilterLines(paths: string[]): string[] {
  if (!paths.length) return [quotedFilter("false")];
  if (paths.length === 1) return [quotedFilter(`file.path == "${formulaString(paths[0] ?? "")}"`)];
  return [
    "or:",
    ...paths.map((path) => `  - ${quotedFilter(`file.path == "${formulaString(path)}"`)}`),
  ];
}

function lifecycleFilterLines(types: readonly string[], statuses?: readonly string[], extra?: string): string[] {
  const typeLines = typeFilterLines(types);
  const clauses: string[][] = [];
  clauses.push(typeLines.length === 1 ? typeLines : ["or:", ...typeLines.slice(1)]);
  if (statuses?.length) {
    clauses.push(statuses.length === 1
      ? [quotedFilter(`状态 == "${formulaString(statuses[0] ?? "")}"`)]
      : [
          "or:",
          ...statuses.map((status) => `  - ${quotedFilter(`状态 == "${formulaString(status)}"`)}`),
        ]);
  }
  if (extra) clauses.push([quotedFilter(extra)]);
  if (clauses.length === 1) return clauses[0] ?? [];
  return [
    "and:",
    ...clauses.flatMap((clause) => clause.length === 1
      ? [`  - ${clause[0]}`]
      : [`  - ${clause[0]}`, ...clause.slice(1).map((line) => `  ${line}`)]),
  ];
}

function appendPropertyBaseView(lines: string[], view: PropertyBaseViewDefinition): void {
  lines.push("  - type: table", `    name: ${yamlDoubleQuoted(view.name)}`);
  if (view.filterLines?.length) {
    lines.push("    filters:", ...view.filterLines.map((line) => `      ${line}`));
  }
  if (view.groupBy) {
    lines.push(
      "    groupBy:",
      `      property: ${yamlDoubleQuoted(view.groupBy)}`,
      "      direction: ASC",
    );
  }
  lines.push("    order:", ...view.order.map((property) => `      - ${yamlDoubleQuoted(property)}`));
  lines.push(
    "    sort:",
    "      - property: file.mtime",
    "        direction: DESC",
  );
  if (view.limit !== undefined) lines.push(`    limit: ${view.limit}`);
}

export function buildPropertyBase(settings: PropertySystemSettings, audit?: PropertyAudit): string {
  const filters = ['file.ext == "md"'];
  const scope = normalizePathValue(settings.scopeFolder);
  if (scope) filters.push(`file.inFolder("${formulaString(scope)}")`);
  for (const folder of settings.excludedFolders) {
    const normalized = normalizePathValue(folder);
    if (normalized) filters.push(`!file.inFolder("${formulaString(normalized)}")`);
  }
  for (const fileName of SYSTEM_FILE_NAMES) {
    const basename = fileName.replace(/\.md$/i, "");
    filters.push(`file.basename != "${formulaString(basename)}"`);
  }

  const creationDateProperty = settings.creationDateProperty.trim() || "创建时间";
  const complianceParts: string[] = [];
  for (const dimension of settings.dimensions) {
    const hasProperty = `file.hasProperty("${formulaString(dimension.name)}")`;
    if (dimension.required) {
      complianceParts.push(hasProperty);
      continue;
    }
    const requiredForTypes = Array.from(new Set(dimension.requiredForTypes ?? []));
    if (requiredForTypes.length) {
      const doesNotApply = requiredForTypes
        .map((type) => `类型 != "${formulaString(type)}"`)
        .join(" && ");
      complianceParts.push(`((${doesNotApply}) || ${hasProperty})`);
    }
  }
  if (!settings.dimensions.some((dimension) => dimension.name === creationDateProperty)) {
    complianceParts.push(
      `(类型 != "输入资料" || file.hasProperty("${formulaString(creationDateProperty)}"))`,
    );
  }
  const ruleComplianceTest = complianceParts.length ? complianceParts.join(" && ") : "true";
  const complianceTest = audit
    ? audit.nonCompliantPaths.length
      ? `!(${audit.nonCompliantPaths
        .map((path) => `file.path == "${formulaString(path)}"`)
        .join(" || ")})`
      : "true"
    : ruleComplianceTest;

  const auditProperties = Array.from(new Set(settings.dimensions.map((dimension) => dimension.name)));
  const auditOrder = [
    "file.name",
    "file.folder",
    "file.mtime",
    ...auditProperties,
    "formula.property_compliance",
  ];
  const propertyDisplayNames = new Map<string, string>();
  for (const dimension of settings.dimensions) propertyDisplayNames.set(dimension.name, dimension.name);
  for (const [property, displayName] of Object.entries({
    文件名: "文件名属性",
    类型: "类型",
    状态: "状态",
    阅读状态: "阅读",
    内容类型: "载体",
    领域: "领域",
    主题: "主题",
    [creationDateProperty]: "进入知识库",
    所属项目: "所属项目",
    截止日期: "截止日期",
    优先级: "优先级",
    交付物: "交付物",
    发布渠道: "发布渠道",
    发布日期: "发布日期",
    来源笔记: "来源",
    关联笔记: "关联笔记",
    沉淀去向: "沉淀去向",
  })) propertyDisplayNames.set(property, displayName);

  const lines = [
    "filters:",
    "  and:",
    ...filters.map((filter) => `    - ${yamlSingleQuoted(filter)}`),
    "formulas:",
    `  knowgrove_managed: ${yamlSingleQuoted('"0.5.0"')}`,
    `  property_compliance: ${yamlSingleQuoted(`if(${complianceTest}, "已规范", "待规范")`)}`,
    `  更新日期: ${yamlSingleQuoted('file.mtime.format("YYYY-MM-DD")')}`,
    `  距今天数: ${yamlSingleQuoted('(now() - file.mtime).days.round(0)')}`,
    "properties:",
    "  file.name:",
    "    displayName: \"笔记\"",
    "  file.folder:",
    "    displayName: \"位置\"",
    "  file.mtime:",
    "    displayName: \"最近修改\"",
  ];
  for (const [property, displayName] of propertyDisplayNames) {
    lines.push(`  ${yamlDoubleQuoted(property)}:`, `    displayName: ${yamlDoubleQuoted(displayName)}`);
  }
  lines.push(
    "  formula.更新日期:",
    "    displayName: \"更新日期\"",
    "  formula.距今天数:",
    "    displayName: \"距今（天）\"",
    "  formula.property_compliance:",
    "    displayName: \"规范状态\"",
    "views:",
  );

  const views: PropertyBaseViewDefinition[] = [
    {
      name: "✅ 已符合规范",
      filterLines: audit
        ? filePathFilterLines(audit.compliantPaths)
        : [quotedFilter('formula.property_compliance == "已规范"')],
      groupBy: "类型",
      order: auditOrder,
    },
    {
      name: "⚠️ 待规范",
      filterLines: audit
        ? filePathFilterLines(audit.nonCompliantPaths)
        : [quotedFilter('formula.property_compliance == "待规范"')],
      order: auditOrder,
    },
    {
      name: PROPERTY_FLOW_RULES.input.viewName,
      filterLines: lifecycleFilterLines(PROPERTY_FLOW_RULES.input.types, PROPERTY_FLOW_RULES.input.statuses),
      groupBy: "状态",
      order: ["file.name", "阅读状态", "状态", "内容类型", "领域", "主题", creationDateProperty, "沉淀去向", "formula.更新日期"],
    },
    {
      name: PROPERTY_FLOW_RULES.knowledge.viewName,
      filterLines: lifecycleFilterLines(PROPERTY_FLOW_RULES.knowledge.types),
      groupBy: "状态",
      order: ["file.name", "类型", "状态", "领域", "主题", "来源笔记", "关联笔记", "formula.更新日期", "formula.距今天数"],
    },
    {
      name: PROPERTY_FLOW_RULES.project.viewName,
      filterLines: lifecycleFilterLines(PROPERTY_FLOW_RULES.project.types, PROPERTY_FLOW_RULES.project.statuses),
      groupBy: "状态",
      order: ["file.name", "状态", "所属项目", "截止日期", "交付物", "领域", "关联笔记", "formula.更新日期"],
    },
    {
      name: PROPERTY_FLOW_RULES.action.viewName,
      filterLines: lifecycleFilterLines(PROPERTY_FLOW_RULES.action.types, PROPERTY_FLOW_RULES.action.statuses),
      groupBy: "状态",
      order: ["file.name", "状态", "优先级", "截止日期", "所属项目", "领域", "formula.更新日期"],
    },
    {
      name: PROPERTY_FLOW_RULES.output.viewName,
      filterLines: lifecycleFilterLines(PROPERTY_FLOW_RULES.output.types, PROPERTY_FLOW_RULES.output.statuses),
      groupBy: "状态",
      order: ["file.name", "状态", "所属项目", "发布渠道", "发布日期", "来源笔记", "领域", "主题", "formula.更新日期"],
    },
  ];
  for (const view of views) appendPropertyBaseView(lines, view);
  return `${lines.join("\n")}\n`;
}
