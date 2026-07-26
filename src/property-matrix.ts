import type {
  PropertyAudit,
  PropertyChangeOperation,
  PropertyDimensionConfig,
  PropertyValueType,
} from "./types";

export interface PropertyMatrixCell {
  property: string;
  valueType: PropertyValueType;
  allowedValues: string[];
  closedEnum: boolean;
  currentValue?: unknown;
  suggestedValue?: unknown;
  draftText: string;
  needsFix: boolean;
  automatic: boolean;
  messages: string[];
  originalOperation?: PropertyChangeOperation;
  aiSuggested?: boolean;
}

export interface PropertyMatrixRow {
  path: string;
  title: string;
  cells: PropertyMatrixCell[];
}

export interface PropertyMatrixModel {
  columns: string[];
  rows: PropertyMatrixRow[];
}

function cloneValue<T>(value: T): T {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

export function propertyValueToDraft(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.map((item) => String(item)).join("，");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function parsePropertyDraft(valueType: PropertyValueType, draft: string): unknown {
  const trimmed = draft.trim();
  if (!trimmed) return undefined;
  if (valueType === "multi") {
    return Array.from(new Set(trimmed
      .split(/[，,\n]/)
      .map((item) => item.trim())
      .filter(Boolean)));
  }
  if (valueType === "checkbox") {
    if (trimmed === "true") return true;
    if (trimmed === "false") return false;
    return undefined;
  }
  return trimmed;
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/i, "");
}

export function buildPropertyMatrix(
  audit: PropertyAudit,
  dimensions: PropertyDimensionConfig[],
  frontmatterByPath: ReadonlyMap<string, Record<string, unknown>>,
): PropertyMatrixModel {
  const visibleIssues = audit.issues.filter((issue) => issue.property !== "文件名");
  const issueProperties = new Set(visibleIssues.map((issue) => issue.property));
  const configuredOrder = dimensions
    .map((dimension) => dimension.name)
    .filter((name) => issueProperties.has(name));
  const columns = [
    ...configuredOrder,
    ...Array.from(issueProperties)
      .filter((name) => !configuredOrder.includes(name))
      .sort((left, right) => left.localeCompare(right, "zh-CN")),
  ];
  const dimensionByName = new Map(dimensions.map((dimension) => [dimension.name, dimension]));
  const paths = Array.from(new Set([
    ...visibleIssues.map((issue) => issue.path),
  ]));

  const rows = paths.map((path): PropertyMatrixRow => {
    const frontmatter = frontmatterByPath.get(path) ?? {};
    const change = audit.changes.find((item) => item.path === path);
    return {
      path,
      title: change?.basename || basename(path),
      cells: columns.map((property): PropertyMatrixCell => {
        const issues = audit.issues.filter((issue) => issue.path === path && issue.property === property);
        const operation = change?.operations.find((item) => item.property === property);
        const issueCurrent = issues.find((issue) => issue.currentValue !== undefined)?.currentValue;
        const currentValue = Object.prototype.hasOwnProperty.call(frontmatter, property)
          ? frontmatter[property]
          : issueCurrent !== undefined
            ? issueCurrent
            : operation?.before;
        const issueSuggestion = issues.find((issue) => issue.suggestedValue !== undefined)?.suggestedValue;
        const suggestedValue = issueSuggestion !== undefined ? issueSuggestion : operation?.after;
        const dimension = dimensionByName.get(property);
        const draftValue = suggestedValue !== undefined ? suggestedValue : currentValue;
        return {
          property,
          valueType: dimension?.valueType ?? "text",
          allowedValues: [...(dimension?.allowedValues ?? [])],
          closedEnum: dimension?.enumMode === "closed",
          currentValue: cloneValue(currentValue),
          suggestedValue: cloneValue(suggestedValue),
          draftText: propertyValueToDraft(draftValue),
          needsFix: issues.length > 0,
          automatic: issues.length > 0 && issues.every((issue) => issue.automatic),
          messages: issues.map((issue) => issue.message),
          originalOperation: operation ? cloneValue(operation) : undefined,
        };
      }),
    };
  });
  return { columns, rows };
}

export function applyMatrixSuggestion(
  model: PropertyMatrixModel,
  path: string,
  property: string,
  value: unknown,
  aiSuggested = false,
): boolean {
  const row = model.rows.find((item) => item.path === path);
  const cell = row?.cells.find((item) => item.property === property);
  if (!cell) return false;
  cell.suggestedValue = cloneValue(value);
  cell.draftText = propertyValueToDraft(value);
  cell.aiSuggested = aiSuggested;
  return true;
}

export function buildPropertyMatrixAudit(
  original: PropertyAudit,
  model: PropertyMatrixModel,
): PropertyAudit {
  const changes = model.rows.flatMap((row) => {
    const operations: PropertyChangeOperation[] = [];
    for (const cell of row.cells) {
      const after = parsePropertyDraft(cell.valueType, cell.draftText);
      if (after === undefined || valuesEqual(after, cell.currentValue)) continue;
      const originalOperation = cell.originalOperation;
      operations.push({
        kind: originalOperation?.kind ?? "set",
        property: cell.property,
        alias: originalOperation?.alias,
        before: cloneValue(originalOperation?.before ?? cell.currentValue),
        after: cloneValue(after),
        reason: cell.aiSuggested
          ? "应用已确认的 AI 属性建议"
          : cell.needsFix
            ? "应用属性矩阵中的修正"
            : "应用用户在属性矩阵中的编辑",
      });
    }
    return operations.length ? [{
      path: row.path,
      basename: row.title,
      operations,
    }] : [];
  });
  return {
    ...original,
    automaticFiles: changes.length,
    automaticOperations: changes.reduce((sum, change) => sum + change.operations.length, 0),
    changes,
  };
}
