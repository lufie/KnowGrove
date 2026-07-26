import type { PropertyDimensionConfig, PropertyTaxonomySettings } from "./types";
import { PDSA_STAGES } from "./property-taxonomy";

export interface AIPropertyPromptInput {
  path: string;
  basename: string;
  body: string;
  frontmatter: Record<string, unknown>;
  dimensions: PropertyDimensionConfig[];
  maxContentCharacters: number;
  taxonomy?: PropertyTaxonomySettings;
}

export interface AIPropertyGeneration {
  properties: Record<string, unknown>;
  confidence?: number;
  reason?: string;
}

export interface AIBatchPromptItem {
  path: string;
  basename: string;
  body: string;
  frontmatter: Record<string, unknown>;
  dimensions: PropertyDimensionConfig[];
}

const STATUS_BY_TYPE: Record<string, string[]> = {
  输入资料: ["待整理", "待归类", "待沉淀", "已沉淀", "跳过", "处理失败", "已归档"],
  随手笔记: ["种子", "生长中", "常青", "待复核", "已归档"],
  知识笔记: ["种子", "生长中", "常青", "待复核", "已归档"],
  复盘: ["种子", "生长中", "常青", "待复核", "已归档"],
  项目笔记: ["构思中", "进行中", "等待中", "已完成", "已暂停", "已归档"],
  行动: ["待办", "进行中", "等待中", "已完成", "已取消"],
  内容输出: ["选题", "提纲", "草稿", "待发布", "已发布", "已复盘", "已归档"],
};

export function isEmptyPropertyValue(value: unknown): boolean {
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

export function aiManagedDimensions(dimensions: PropertyDimensionConfig[]): PropertyDimensionConfig[] {
  return dimensions.filter((dimension) => dimension.aiManaged);
}

export function pendingAIManagedDimensions(
  dimensions: PropertyDimensionConfig[],
  frontmatter: Record<string, unknown>,
  overwrite: boolean,
): PropertyDimensionConfig[] {
  return aiManagedDimensions(dimensions).filter((dimension) => overwrite || isEmptyPropertyValue(frontmatter[dimension.name]));
}

export function truncateForAI(content: string, maximum: number): string {
  const limit = Math.max(1_000, Math.min(100_000, Math.round(maximum)));
  if (content.length <= limit) return content;
  const headLength = Math.round(limit * 0.72);
  const tailLength = limit - headLength;
  return `${content.slice(0, headLength)}\n\n[中间内容已由插件截断]\n\n${content.slice(-tailLength)}`;
}

function safeFrontmatter(frontmatter: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(frontmatter)) {
    if (/(?:api[-_ ]?key|token|secret|password|密码|密钥)/i.test(name)) continue;
    if (typeof value === "string") result[name] = value.slice(0, 500);
    else if (Array.isArray(value)) result[name] = value.slice(0, 20);
    else if (typeof value === "number" || typeof value === "boolean" || value === null) result[name] = value;
  }
  return result;
}

function dimensionContract(dimension: PropertyDimensionConfig): Record<string, unknown> {
  const closed = dimension.enumMode === "closed";
  return {
    name: dimension.name,
    description: dimension.description,
    valueType: dimension.valueType,
    enumMode: closed ? "closed" : "open",
    allowedValues: closed ? dimension.allowedValues : undefined,
    suggestedValues: !closed && dimension.allowedValues.length ? dimension.allowedValues : undefined,
    rule: dimension.name === "领域"
      ? "最多选择 2 个稳定领域"
      : dimension.name === "主题"
        ? "输出 1 到 5 个可复用概念，不使用文章标题或一次性专有名词"
        : undefined,
  };
}

export function buildAIPropertyPrompt(input: AIPropertyPromptInput): string {
  const contracts = input.dimensions.map(dimensionContract);
  const statusRules = input.dimensions.some((dimension) => dimension.name === "状态")
    ? STATUS_BY_TYPE
    : undefined;
  return [
    "你是 KnowGrove 的属性分类器。只分析给定笔记，不调用工具，不搜索网络，不修改文件。",
    "目标：依据笔记语义，为指定属性生成可直接写入 Obsidian YAML frontmatter 的值。",
    "硬性规则：",
    "1. 只返回 JSON，不要 Markdown、代码围栏或额外解释。",
    "2. 输出格式必须是 {\"properties\":{...},\"confidence\":0到1,\"reason\":\"一句简短依据\"}。",
    "3. 只能输出属性契约中列出的字段；不得虚构作者、来源、链接或未要求的属性。",
    "4. enumMode=closed 且有 allowedValues 时只能从中选择；enumMode=open 的 suggestedValues 仅供参考，允许生成新的合理值。multi 必须是非空字符串数组，single/text/date 必须是非空字符串。",
    "5. 不确定时选择最符合正文主旨的值，不要输出 null、空字符串或空数组。",
    "6. 主题应归一为可复用概念，避免把完整标题、文件名、品牌长句或临时事件直接当主题。",
    statusRules ? `7. 若生成状态，必须遵守类型对应状态：${JSON.stringify(statusRules)}。` : "",
    input.taxonomy
      ? `8. 当前采用四层分类协议。领域树：${JSON.stringify(input.taxonomy.domains)}；PDSA 映射：${JSON.stringify(PDSA_STAGES)}。领域优先选择最具体且语义明确的二级路径，宽泛内容保留在一级领域。`
      : "",
    `文件路径：${input.path}`,
    `文件名：${input.basename}`,
    `现有属性：${JSON.stringify(safeFrontmatter(input.frontmatter))}`,
    `属性契约：${JSON.stringify(contracts)}`,
    "正文开始：",
    truncateForAI(input.body, input.maxContentCharacters),
    "正文结束。",
  ].filter(Boolean).join("\n");
}

export function buildAIBatchPropertyPrompt(
  items: AIBatchPromptItem[],
  taxonomy?: PropertyTaxonomySettings,
  maxContentCharacters = 3_000,
): string {
  const documents = items.map((item) => ({
    path: item.path,
    title: item.basename,
    currentProperties: safeFrontmatter(item.frontmatter),
    contracts: item.dimensions.map(dimensionContract),
    content: truncateForAI(item.body, maxContentCharacters),
  }));
  return [
    "你是 KnowGrove 的批量属性分类器。只分析给定笔记，不调用工具，不搜索网络，不修改文件。",
    "目标：一次为多篇笔记生成可直接写入 Obsidian YAML frontmatter 的缺失属性。",
    "硬性规则：",
    "1. 只返回 JSON，格式必须是 {\"items\":[{\"path\":\"原样路径\",\"properties\":{},\"confidence\":0到1,\"reason\":\"一句简短依据\"}]}。",
    "2. 每个输入 path 最多返回一个 item，path 必须逐字匹配；不要遗漏能判断的笔记。",
    "3. 每个笔记只能输出它自己的 contracts 中列出的字段，不得虚构作者、来源、链接或其他字段。",
    "4. enumMode=closed 且有 allowedValues 时只能从中选择；enumMode=open 的 suggestedValues 仅供参考，允许生成新的合理值。multi 必须是非空字符串数组，single/text/date 必须是非空字符串。",
    "5. 不确定时选择最符合正文主旨的值，不要输出 null、空字符串或空数组；已有非空属性不要重复覆盖。",
    "6. 主题应归一为可复用概念，避免把完整标题、文件名、品牌长句或临时事件直接当主题。",
    taxonomy
      ? `7. 当前采用四层分类协议。领域树：${JSON.stringify(taxonomy.domains)}；PDSA 映射：${JSON.stringify(PDSA_STAGES)}。领域优先选择最具体且语义明确的二级路径，宽泛内容保留在一级领域。`
      : "",
    `输入笔记：${JSON.stringify(documents)}`,
  ].filter(Boolean).join("\n");
}

function extractJsonObject(raw: string): string {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  for (let start = 0; start < trimmed.length; start += 1) {
    if (trimmed[start] !== "{") continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < trimmed.length; index += 1) {
      const char = trimmed[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) return trimmed.slice(start, index + 1);
      }
    }
  }
  throw new Error("模型没有返回可解析的 JSON 对象");
}

function normalizeMulti(value: unknown): string[] | undefined {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[，,\n]/) : [];
  const result = Array.from(new Set(source
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)));
  return result.length ? result : undefined;
}

function normalizeDimensionValue(dimension: PropertyDimensionConfig, value: unknown): unknown {
  let normalized: unknown;
  if (dimension.valueType === "multi") normalized = normalizeMulti(value);
  else if (dimension.valueType === "checkbox") normalized = typeof value === "boolean" ? value : undefined;
  else if (typeof value === "string" && value.trim()) normalized = value.trim();
  else normalized = undefined;
  if (normalized === undefined) return undefined;

  if (dimension.valueType === "date"
    && (typeof normalized !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(normalized))) return undefined;
  if (dimension.enumMode === "closed" && dimension.allowedValues.length) {
    const allowed = new Set(dimension.allowedValues);
    if (Array.isArray(normalized)) {
      const filtered = normalized.filter((item) => typeof item === "string" && allowed.has(item));
      if (!filtered.length) return undefined;
      normalized = filtered;
    } else if (typeof normalized === "string" && !allowed.has(normalized)) return undefined;
  }
  if (dimension.name === "领域" && Array.isArray(normalized)) normalized = normalized.slice(0, 2);
  if (dimension.name === "主题" && Array.isArray(normalized)) normalized = normalized.slice(0, 5);
  return normalized;
}

export function parseAIPropertyResponse(
  raw: string,
  dimensions: PropertyDimensionConfig[],
  currentFrontmatter: Record<string, unknown>,
): AIPropertyGeneration {
  const parsed = JSON.parse(extractJsonObject(raw)) as Record<string, unknown>;
  const source = parsed.properties && typeof parsed.properties === "object" && !Array.isArray(parsed.properties)
    ? parsed.properties as Record<string, unknown>
    : parsed;
  const allowedDimensions = new Map(dimensions.map((dimension) => [dimension.name, dimension]));
  const properties: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(source)) {
    const dimension = allowedDimensions.get(name);
    if (!dimension) continue;
    const normalized = normalizeDimensionValue(dimension, value);
    if (normalized !== undefined) properties[name] = normalized;
  }

  const noteType = typeof properties.类型 === "string"
    ? properties.类型
    : typeof currentFrontmatter.类型 === "string"
      ? currentFrontmatter.类型
      : undefined;
  if (noteType && typeof properties.状态 === "string") {
    const allowedStatuses = STATUS_BY_TYPE[noteType];
    if (allowedStatuses && !allowedStatuses.includes(properties.状态)) delete properties.状态;
  }
  if (!Object.keys(properties).length) throw new Error("模型返回中没有符合当前属性契约的有效值");

  const confidence = typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
    ? Math.max(0, Math.min(1, parsed.confidence))
    : undefined;
  const reason = typeof parsed.reason === "string" ? parsed.reason.trim().slice(0, 240) : undefined;
  return { properties, confidence, reason };
}

export function parseAIBatchPropertyResponse(
  raw: string,
  items: AIBatchPromptItem[],
): Map<string, AIPropertyGeneration> {
  const parsed = JSON.parse(extractJsonObject(raw)) as Record<string, unknown>;
  const source = Array.isArray(parsed.items) ? parsed.items : [];
  const byPath = new Map(items.map((item) => [item.path, item]));
  const results = new Map<string, AIPropertyGeneration>();
  for (const candidate of source) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const entry = candidate as Record<string, unknown>;
    if (typeof entry.path !== "string") continue;
    const item = byPath.get(entry.path);
    if (!item) continue;
    try {
      results.set(item.path, parseAIPropertyResponse(JSON.stringify(entry), item.dimensions, item.frontmatter));
    } catch {
      // A malformed item should not discard valid results for the rest of the batch.
    }
  }
  return results;
}
