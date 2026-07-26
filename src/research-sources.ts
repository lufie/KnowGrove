import type { KnowledgeResearchTopicSummary, KnowledgeThemeDocument } from "./types";

export const RESEARCH_SOURCES_BLOCK = "```knowgrove-research-sources\n```";
export const RESEARCH_SOURCES_HEADING = "## 资料筛选";
export const RESEARCH_SOURCE_STATE_VERSION = 1;

export interface ResearchSourceState {
  version: 1;
  adopted: string[];
  candidates: string[];
  rejected: string[];
  scannedAt?: string;
}

export interface ResearchSourceDecision {
  path: string;
  decision: "相关" | "不相关";
  reason: string;
}

function uniquePaths(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values
    .filter((value): value is string => typeof value === "string")
    .map(normalizeResearchSourcePath)
    .filter((value) => Boolean(value) && /\.md$/i.test(value))));
}

export function normalizeResearchSourcePath(value: string): string {
  const trimmed = value.trim();
  const match = /^\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]$/.exec(trimmed);
  const path = (match?.[1] ?? trimmed).trim().replace(/^\/+/, "");
  return path && !/\.md$/i.test(path) ? `${path}.md` : path;
}

export function researchSourceStatePath(workspacePath: string): string {
  return workspacePath.replace(/\.md$/i, ".knowgrove-sources.json");
}

export function normalizeResearchSourceState(value: unknown): ResearchSourceState {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const rejected = uniquePaths(record.rejected);
  const rejectedSet = new Set(rejected);
  return {
    version: RESEARCH_SOURCE_STATE_VERSION,
    adopted: uniquePaths(record.adopted).filter((path) => !rejectedSet.has(path)),
    candidates: uniquePaths(record.candidates).filter((path) => !rejectedSet.has(path)),
    rejected,
    ...(typeof record.scannedAt === "string" && record.scannedAt.trim()
      ? { scannedAt: record.scannedAt.trim() }
      : {}),
  };
}

export function ensureResearchSourceBrowser(content: string): string {
  const legacySection = /\n## (?:相关资料|研究资料)\s*\n+!\[\[_KnowGrove\/课题\/[^\n]+\.base#(?:相关候选|研究资料)\]\]\s*(?:\n+### 已采用资料\s*\n+!\[\[_KnowGrove\/课题\/[^\n]+\.base#已采用资料\]\]\s*)?(?=\n## |$)/m;
  let next = content.replace(legacySection, "\n");
  if (next.includes(RESEARCH_SOURCES_BLOCK)) return next;
  next = next.trimEnd();
  return `${next}\n\n${RESEARCH_SOURCES_HEADING}\n\n在这里判断资料是否真正属于当前课题。点击标题会在左侧替换打开；标记为不相关后将不再展示。\n\n${RESEARCH_SOURCES_BLOCK}\n`;
}

export function buildResearchSourceScreeningPrompt(
  topic: Pick<KnowledgeResearchTopicSummary, "name" | "coreQuestion" | "parentThemeName" | "domains">,
  sources: Array<KnowledgeThemeDocument & { excerpt: string }>,
): string {
  return [
    "你是 KnowGrove 的课题资料筛选器。只判断输入资料与当前课题是否具有直接研究价值。",
    `上级主题：${topic.parentThemeName}`,
    `课题：${topic.name}`,
    `核心问题：${topic.coreQuestion}`,
    `领域：${topic.domains.join("、") || "未设置"}`,
    "判断标准：相关=能直接提供概念、证据、案例、方法或反例；仅仅同领域、偶然提词、泛泛背景都判为不相关。",
    "只返回 JSON：{\"results\":[{\"path\":\"输入中的精确路径\",\"decision\":\"相关|不相关\",\"reason\":\"一句话理由\"}]}。",
    "必须逐项返回，不得发明路径；reason 不超过 50 字。",
    `资料：${JSON.stringify(sources.map((source) => ({
      path: source.path,
      title: source.basename,
      type: source.type,
      domains: source.domains,
      topics: source.topics,
      excerpt: source.excerpt,
    })))}`,
  ].join("\n");
}

function extractJsonObject(raw: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw)?.[1]?.trim();
  const source = fenced || raw.trim();
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("模型没有返回 JSON 对象");
  return source.slice(start, end + 1);
}

export function parseResearchSourceScreeningResponse(raw: string, allowedPaths: string[]): ResearchSourceDecision[] {
  const parsed = JSON.parse(extractJsonObject(raw)) as Record<string, unknown>;
  const allowed = new Set(allowedPaths);
  const results = Array.isArray(parsed.results) ? parsed.results : [];
  const decisions = new Map<string, ResearchSourceDecision>();
  for (const value of results) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const record = value as Record<string, unknown>;
    const path = typeof record.path === "string" ? record.path.trim() : "";
    const decision = record.decision === "相关" || record.decision === "不相关" ? record.decision : undefined;
    if (!allowed.has(path) || !decision) continue;
    const reason = typeof record.reason === "string" ? record.reason.trim().slice(0, 80) : "";
    decisions.set(path, { path, decision, reason });
  }
  return Array.from(decisions.values());
}
