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
import { normalizeNoteLifecycleStatus } from "./note-lifecycle";

const INTERNAL_FRONTMATTER_KEYS = new Set(["position"]);
const SPECIAL_PROPERTY_KEYS = new Set(["aliases", "cssclasses", "tags"]);
const RETIRED_PROPERTY_KEYS = new Set(["文件名", "标题", "title", "capture_id", "KnowGrove采集状态"]);
const SYSTEM_FILE_NAMES = new Set(["AGENTS.md", "DESIGN.md", "SKILL.md"]);
const SYSTEM_PATH_SEGMENTS = new Set([".git", "node_modules"]);
const SYSTEM_DIMENSION_IDS = new Set([
  "type",
  "status",
  "creation-date",
  "content-type",
  "reading-status",
  "domain",
  "topic",
  "source-url",
  "author",
  "published-date",
  "project",
  "source-note",
  "related-notes",
  "destination",
]);
export const PROPERTY_BASE_MANAGED_MARKER = "# KnowGrove managed property Base";
export const PROPERTY_RULE_SCHEMA_VERSION = 11;

export function needsPendingPropertyReviewStorageMigration(value: unknown): boolean {
  return value === null || typeof value !== "object" || Array.isArray(value);
}

export const CANONICAL_PROPERTY_ORDER = [
  "类型", "状态", "领域", "主题", "创建时间", "内容类型", "发布时间", "来源链接", "作者", "阅读状态",
  "所属项目", "来源笔记", "关联笔记", "沉淀去向",
] as const;

const LEGACY_CONTENT_TYPE_VALUES = new Map([
  ["公众号文章", "网页文章"],
  ["邮件简报", "邮件"],
  ["语音", "音频"],
]);

const LEGACY_DOMAIN_VALUES = new Map([
  ["工作", "职业与工作"],
  ["职业发展", "职业与工作/职业发展"],
  ["个人成长", "个人成长与生活"],
  ["生活", "个人成长与生活"],
  ["个人成长/生活", "个人成长与生活"],
  ["🎲投资", "投资"],
  ["职业与工作/求职与面试", "职业与工作/职业发展"],
  ["AI产品/智能体", "AI产品/AI应用与智能体"],
  ["AI产品/大模型应用", "AI产品/AI应用与智能体"],
]);

interface PropertyFlowRule {
  viewName: string;
  types: readonly string[];
  statuses?: readonly string[];
}

export interface PropertyAuditOptions {
  reading?: {
    propertyName: string;
    readingValue: string;
    finishedValue: string;
  };
}

export const PROPERTY_FLOW_RULES = {
  input: {
    viewName: "📥 输入队列",
    types: ["输入资料"],
    statuses: ["待处理", "进行中"],
  },
  knowledge: {
    viewName: "🌱 知识生长",
    types: ["随手笔记", "知识笔记", "复盘"],
  },
  project: {
    viewName: "🚧 项目推进",
    types: ["项目笔记"],
    statuses: ["待处理", "进行中"],
  },
  action: {
    viewName: "✅ 行动推进",
    types: ["行动"],
    statuses: ["待处理", "进行中"],
  },
  output: {
    viewName: "✍️ 内容输出",
    types: ["内容输出"],
    statuses: ["待处理", "进行中"],
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
  canonicalDimensions?: PropertyDimensionConfig[],
): PropertyDimensionConfig[] {
  const creationProperty = creationDateProperty.trim() || "创建时间";
  const normalizedDimensions = dimensions.map((dimension) => {
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
      normalized.required = true;
      normalized.requiredForTypes = [];
      normalized.valueType = "date";
      normalized.aiManaged = false;
      normalized.enumMode = "open";
      normalized.description = "普通笔记首次进入知识库的日期，格式为 YYYY-MM-DD。";
    }
    return normalized;
  });
  if (!canonicalDimensions) return normalizedDimensions;

  const retiredNames = new Set(["文件名", "标题"]);
  const retiredIds = new Set(["file-name"]);
  const retained = normalizedDimensions.filter((dimension) => (
    !retiredIds.has(dimension.id)
    && !retiredNames.has(dimension.name)
    && dimension.origin !== "inferred"
  ));
  const claimed = new Set<PropertyDimensionConfig>();
  const canonical = canonicalDimensions.map((template) => {
    const saved = retained.find((dimension) => (
      dimension.id === template.id
      || dimension.name === template.name
      || template.aliases.includes(dimension.name)
      || dimension.aliases.includes(template.name)
    ));
    if (saved) claimed.add(saved);
    const preserveAllowedValues = ![
      "author", "source-url", "creation-date", "published-date", "status", "content-type", "domain",
      "project", "source-note", "related-notes", "destination",
    ].includes(template.id);
    const allowedValues = preserveAllowedValues
      ? Array.from(new Set([...(template.allowedValues ?? []), ...(saved?.allowedValues ?? [])]))
      : [...template.allowedValues];
    return {
      ...cloneValue(saved ?? {}),
      ...cloneValue(template),
      allowedValues,
      requiredForTypes: [...(template.requiredForTypes ?? [])],
    };
  });
  const userDimensions = retained.filter((dimension) => !claimed.has(dimension) && dimension.origin === "user");
  return [...canonical, ...userDimensions];
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
  if (normalized.split("/").some((part) => part.startsWith(".") || SYSTEM_PATH_SEGMENTS.has(part))) return false;

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
    if (SPECIAL_PROPERTY_KEYS.has(property.name) || RETIRED_PROPERTY_KEYS.has(property.name)) continue;
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
  rule: NonNullable<PropertyAuditOptions["reading"]>,
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
    if (current === "未读") {
      return {
        issues: [issue(
          snapshot,
          dimension,
          "invalid-value",
          "未读状态将改为缺省属性，避免为每篇笔记写入冗余值",
          true,
          current,
          undefined,
        )],
        operations: [{
          kind: "delete",
          property: propertyName,
          before: current,
          reason: "未读由阅读状态缺省表示",
        }],
      };
    }
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
  const mergeSetOperation = (after: unknown, reason: string): void => {
    const existing = [...operations].reverse()
      .find((operation) => operation.kind === "set" && operation.property === dimension.name);
    if (existing) {
      existing.after = cloneValue(after);
      existing.reason = `${existing.reason}；${reason}`;
      return;
    }
    operations.push({ kind: "set", property: dimension.name, before: cloneValue(value), after: cloneValue(after), reason });
  };

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

  if (dimension.name === "状态" && typeof normalizedValue === "string") {
    const lifecycleStatus = normalizeNoteLifecycleStatus(normalizedValue);
    if (lifecycleStatus && lifecycleStatus !== normalizedValue.trim()) {
      issues.push(issue(
        snapshot,
        dimension,
        "invalid-value",
        `历史状态“${normalizedValue}”将统一为“${lifecycleStatus}”`,
        true,
        normalizedValue,
        lifecycleStatus,
      ));
      const existingTypeRepair = [...operations].reverse()
        .find((operation) => operation.kind === "set" && operation.property === dimension.name);
      if (existingTypeRepair) {
        existingTypeRepair.after = lifecycleStatus;
        existingTypeRepair.reason = "统一为单值并迁移四态生命周期";
      } else {
        operations.push({
          kind: "set",
          property: dimension.name,
          before: cloneValue(value),
          after: lifecycleStatus,
          reason: "统一为四态生命周期",
        });
      }
      normalizedValue = lifecycleStatus;
    }
  }

  if (dimension.name === "内容类型" && typeof normalizedValue === "string") {
    const replacement = LEGACY_CONTENT_TYPE_VALUES.get(normalizedValue.trim());
    if (replacement) {
      issues.push(issue(snapshot, dimension, "invalid-value", `历史内容类型“${normalizedValue}”将统一为“${replacement}”`, true, normalizedValue, replacement));
      mergeSetOperation(replacement, "统一内容类型别名");
      normalizedValue = replacement;
    }
  }

  if (dimension.name === "领域" && Array.isArray(normalizedValue)) {
    const mapped = Array.from(new Set((normalizedValue as unknown[]).map((item) => (
      typeof item === "string" ? LEGACY_DOMAIN_VALUES.get(item.trim()) ?? item.trim() : item
    ))));
    if (!valuesEqual(mapped, normalizedValue)) {
      issues.push(issue(snapshot, dimension, "invalid-value", "历史领域已映射到当前领域树", true, normalizedValue, mapped));
      mergeSetOperation(mapped, "迁移历史领域路径");
      normalizedValue = mapped;
    }
  }

  if (dimension.name === "主题" && Array.isArray(normalizedValue)) {
    const plain = Array.from(new Set((normalizedValue as unknown[]).map((item) => (
      typeof item === "string" ? item.trim().replace(/^\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/, "$1") : item
    ))));
    if (!valuesEqual(plain, normalizedValue)) {
      issues.push(issue(snapshot, dimension, "invalid-value", "主题使用纯文本概念，不使用 Wikilink 包装", true, normalizedValue, plain));
      mergeSetOperation(plain, "统一主题为纯文本");
      normalizedValue = plain;
    }
    if (plain.length > 3) {
      issues.push(issue(snapshot, dimension, "invalid-value", "主题最多保留 3 个，需要结合正文人工确认主概念", false, plain));
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
        : validation.operations[validation.operations.length - 1]?.after ?? value;
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
  if (!required && (value === null || value === "" || (Array.isArray(value) && value.length === 0))) {
    issues.push(issue(snapshot, dimension, "invalid-value", "可选属性没有有效值，应省略该字段", true, value, undefined));
    operations.push({ kind: "delete", property: dimension.name, before: cloneValue(value), reason: "删除空的可选属性" });
    return { issues, operations };
  }
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
  options?: PropertyAuditOptions,
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
    for (const property of RETIRED_PROPERTY_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(frontmatter, property)) continue;
      const dimension: PropertyDimensionConfig = {
        id: `retired-${property}`,
        name: property,
        description: "普通笔记已停用的重复或机器属性。",
        aliases: [],
        valueType: "text",
        required: false,
        allowedValues: [],
        fillStrategy: "none",
        defaultValue: "",
      };
      fileIssues.push(issue(
        snapshot,
        dimension,
        "retired-property",
        `“${property}”已停用，确认后将从 Frontmatter 删除`,
        true,
        frontmatter[property],
      ));
      operations.push({
        kind: "delete",
        property,
        before: cloneValue(frontmatter[property]),
        reason: "删除普通笔记的已停用属性",
      });
    }
    for (const dimension of settings.dimensions) {
      const required = dimension.required
        || (noteType !== null && (dimension.requiredForTypes ?? []).includes(noteType));
      const result = auditDimension(snapshot, dimension, required);
      fileIssues.push(...result.issues);
      operations.push(...result.operations);
    }
    if (options?.reading) {
      const reading = auditReadingStatus(snapshot, options.reading);
      fileIssues.push(...reading.issues);
      operations.push(...reading.operations);
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
  if (operation.kind === "delete") {
    return Object.prototype.hasOwnProperty.call(frontmatter, operation.property)
      && valuesEqual(frontmatter[operation.property], operation.before);
  }
  if (operation.kind === "rename") {
    return operation.alias !== undefined
      && !Object.prototype.hasOwnProperty.call(frontmatter, operation.property)
      && valuesEqual(frontmatter[operation.alias], operation.before);
  }
  if (operation.before === undefined) return !Object.prototype.hasOwnProperty.call(frontmatter, operation.property);
  return valuesEqual(frontmatter[operation.property], operation.before);
}

export function applyOperation(frontmatter: Record<string, unknown>, operation: PropertyChangeOperation): void {
  if (operation.kind === "delete") {
    delete frontmatter[operation.property];
    return;
  }
  frontmatter[operation.property] = cloneValue(operation.after);
  if (operation.kind === "rename" && operation.alias) delete frontmatter[operation.alias];
}

export function reorderCanonicalFrontmatter(frontmatter: Record<string, unknown>): void {
  const snapshot = Object.entries(frontmatter);
  const canonical = new Set<string>(CANONICAL_PROPERTY_ORDER);
  for (const key of Object.keys(frontmatter)) delete frontmatter[key];
  for (const key of CANONICAL_PROPERTY_ORDER) {
    const item = snapshot.find(([name]) => name === key);
    if (item) frontmatter[item[0]] = item[1];
  }
  for (const [key, value] of snapshot) {
    if (!canonical.has(key)) frontmatter[key] = value;
  }
}

export function initializeTrackedNoteFrontmatter(
  frontmatter: Record<string, unknown>,
  _basename: string,
  settings: PropertySystemSettings,
  _readingProperty: string,
  _readingValue: string,
  createdDate: string,
  deferredProperties: ReadonlySet<string> = new Set<string>(),
): boolean {
  const hasOwn = (property: string) => Object.prototype.hasOwnProperty.call(frontmatter, property);
  if (!settings.initializeTrackedNotes) return false;

  const creationDateProperty = settings.creationDateProperty.trim() || "创建时间";
  const requiredValues: Array<[string, unknown]> = [
    ["类型", settings.trackedNoteType],
    ["状态", settings.trackedNoteStatus],
    [creationDateProperty, createdDate],
  ];
  const additions = new Map<string, unknown>();
  for (const [property, value] of requiredValues) {
    if (deferredProperties.has(property)) continue;
    if (!hasOwn(property) && !additions.has(property)) additions.set(property, cloneValue(value));
  }

  if (!additions.size) return false;
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

function baseNoteProperty(name: string): string {
  return `note[${JSON.stringify(name)}]`;
}

function baseList(values: readonly string[]): string {
  return JSON.stringify(values);
}

function baseDimensionValidation(dimension: PropertyDimensionConfig): string {
  const property = baseNoteProperty(dimension.name);
  const checks: string[] = [];
  if (dimension.valueType === "multi") checks.push(`${property}.isType("list")`);
  else checks.push(`!${property}.isType("list")`);
  if (dimension.valueType === "checkbox") checks.push(`${property}.isType("boolean")`);
  if (dimension.valueType === "date") {
    checks.push(`(${property}.isType("date") || (${property}.isType("string") && /^\\d{4}-\\d{2}-\\d{2}(?:[T ].*)?$/.matches(${property})))`);
  }
  if (dimension.enumMode === "closed" && dimension.allowedValues.length) {
    const allowed = baseList(dimension.allowedValues);
    checks.push(dimension.valueType === "multi"
      ? `${property}.filter(!${allowed}.contains(value)).isEmpty()`
      : `${allowed}.contains(${property})`);
  }
  if (dimension.name === "领域") checks.push(`${property}.length >= 1`, `${property}.length <= 2`);
  if (dimension.name === "主题") {
    checks.push(
      `${property}.length >= 1`,
      `${property}.length <= 3`,
      `${property}.filter(/^\\[\\[.*\\]\\]$/.matches(value.toString())).isEmpty()`,
    );
  }
  return checks.length ? checks.join(" && ") : "true";
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

export function buildPropertyBase(settings: PropertySystemSettings, _audit?: PropertyAudit): string {
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
    const validProperty = baseDimensionValidation(dimension);
    if (dimension.required) {
      complianceParts.push(`(${hasProperty} && ${validProperty})`);
      continue;
    }
    const requiredForTypes = Array.from(new Set(dimension.requiredForTypes ?? []));
    if (requiredForTypes.length) {
      const doesNotApply = requiredForTypes
        .map((type) => `类型 != "${formulaString(type)}"`)
        .join(" && ");
      complianceParts.push(`((${doesNotApply}) || (${hasProperty} && ${validProperty}))`);
      continue;
    }
    complianceParts.push(`(!${hasProperty} || (${validProperty}))`);
  }
  if (!settings.dimensions.some((dimension) => dimension.name === creationDateProperty)) {
    complianceParts.push(`file.hasProperty("${formulaString(creationDateProperty)}")`);
  }
  for (const dimension of settings.dimensions) {
    for (const alias of dimension.aliases) {
      complianceParts.push(`!file.hasProperty("${formulaString(alias)}")`);
    }
  }
  for (const property of RETIRED_PROPERTY_KEYS) {
    complianceParts.push(`!file.hasProperty("${formulaString(property)}")`);
  }
  const ruleComplianceTest = complianceParts.length ? complianceParts.join(" && ") : "true";
  const complianceTest = ruleComplianceTest;

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

  const standardOrder = [
    "file.name", "类型", "状态", "领域", "主题", creationDateProperty, "内容类型", "发布时间", "来源链接",
    "作者", "阅读状态", "所属项目", "来源笔记", "关联笔记", "沉淀去向", "formula.更新日期",
  ];
  const views: PropertyBaseViewDefinition[] = [
    {
      name: "⚠️ 属性待确认",
      filterLines: [quotedFilter('formula.property_compliance == "待规范"')],
      order: auditOrder,
    },
    ...["待处理", "进行中", "已完成", "已归档"].map((status): PropertyBaseViewDefinition => ({
      name: status,
      filterLines: [quotedFilter(`状态 == "${status}"`)],
      groupBy: "类型",
      order: standardOrder,
    })),
  ];
  for (const view of views) appendPropertyBaseView(lines, view);
  return `${lines.join("\n")}\n`;
}
