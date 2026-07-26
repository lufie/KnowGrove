import type { KnowledgeResearchTopicSummary } from "./types";
import { safeTopicFileName, topicWorkspacePaths } from "./knowledge-cycle";

export const RESEARCH_OUTPUT_START = "<!-- knowgrove:research-output:start -->";
export const RESEARCH_OUTPUT_END = "<!-- knowgrove:research-output:end -->";
export const RESEARCH_OUTPUT_DATA_ROOT = "_KnowGrove/.data/outputs";

export type ResearchOutputPresetId =
  | "wechat"
  | "xiaohongshu"
  | "medium"
  | "twitter"
  | "reddit"
  | "longform"
  | "research-report"
  | "outline";

export interface ResearchOutputPreset {
  id: ResearchOutputPresetId;
  group: "对外发布" | "研究成果";
  label: string;
  description: string;
  defaultLanguage: "中文" | "英文";
  instruction: string;
}

export const RESEARCH_OUTPUT_PRESETS: ResearchOutputPreset[] = [
  {
    id: "wechat",
    group: "对外发布",
    label: "微信公众号",
    description: "标题候选、导语、层次清晰的长文正文和结尾。",
    defaultLanguage: "中文",
    instruction: "适合微信公众号阅读：有明确主线和小标题，表达自然，不堆砌概念，结尾给读者留下可行动或可讨论的问题。",
  },
  {
    id: "xiaohongshu",
    group: "对外发布",
    label: "小红书",
    description: "标题、封面文字、正文结构、话题与图文卡片建议。",
    defaultLanguage: "中文",
    instruction: "适合小红书：从具体场景或问题切入，信息密度高但不夸张，避免虚构个人经历，给出封面文字和分页卡片思路。",
  },
  {
    id: "medium",
    group: "对外发布",
    label: "Medium",
    description: "适合深度阅读的英文或中文文章。",
    defaultLanguage: "英文",
    instruction: "适合 Medium：提供摘要、清晰章节、连贯论证和克制结论；不要使用营销腔。",
  },
  {
    id: "twitter",
    group: "对外发布",
    label: "X / Twitter",
    description: "开头钩子、单条摘要和连续 Thread。",
    defaultLanguage: "中文",
    instruction: "适合 X / Twitter：先给出单条摘要，再给出编号 Thread；每条独立可读、前后连贯，避免标题党。",
  },
  {
    id: "reddit",
    group: "对外发布",
    label: "Reddit",
    description: "标题、TL;DR、完整正文与讨论问题。",
    defaultLanguage: "英文",
    instruction: "适合 Reddit：直接、坦诚、社区化，先给 TL;DR，说明证据边界，不伪装成用户经历，不做生硬推广。",
  },
  {
    id: "longform",
    group: "对外发布",
    label: "通用长文",
    description: "不绑定平台的完整长文。",
    defaultLanguage: "中文",
    instruction: "生成不绑定平台的完整长文：结构清晰、观点与证据匹配，适合继续人工编辑。",
  },
  {
    id: "research-report",
    group: "研究成果",
    label: "调研报告",
    description: "范围、主要发现、证据、风险与建议。",
    defaultLanguage: "中文",
    instruction: "生成调研报告：包含执行摘要、研究范围、主要发现、证据、冲突或不确定性、结论与建议。",
  },
  {
    id: "outline",
    group: "研究成果",
    label: "内容大纲",
    description: "章节、核心观点、证据与待补充内容。",
    defaultLanguage: "中文",
    instruction: "生成可继续写作的详细大纲：每节说明要回答的问题、核心观点、可用证据和仍需补充的内容。",
  },
];

export interface ResearchOutputSource {
  path: string;
  title: string;
  content: string;
}

export interface ResearchOutputSourceChunk {
  path: string;
  title: string;
  index: number;
  total: number;
  content: string;
}

export interface ResearchEvidenceDigest {
  path: string;
  title: string;
  summary: string;
  keyPoints: string[];
  quotes: string[];
}

export interface ResearchOutputDraft {
  title: string;
  presetId: ResearchOutputPresetId;
  goal: string;
  audience: string;
  coreMessage: string;
  language: "中文" | "英文";
  style: string;
  selectedPaths: string[];
}

export interface ResearchOutputPlanSection {
  heading: string;
  purpose: string;
  evidencePaths: string[];
  evidenceStatus: "证据充分" | "支撑不足" | "存在冲突" | "需要补充资料";
}

export interface ResearchOutputImageIdea {
  title: string;
  purpose: string;
  format: string;
  prompt: string;
  evidencePaths: string[];
}

export interface ResearchOutputPlan {
  title: string;
  summary: string;
  sections: ResearchOutputPlanSection[];
  imageIdeas: ResearchOutputImageIdea[];
  evidence: ResearchEvidenceDigest[];
}

export type ResearchEvidenceAuditStatus = "有依据" | "依据不足" | "存在冲突" | "待人工判断";

export interface ResearchEvidenceAuditClaim {
  text: string;
  status: ResearchEvidenceAuditStatus;
  evidencePaths: string[];
  reason: string;
}

export interface ResearchEvidenceAudit {
  checkedAt: string;
  claims: ResearchEvidenceAuditClaim[];
}

export interface ResearchOutputVersion {
  id: string;
  createdAt: string;
  label: string;
  content: string;
}

export interface ResearchOutputImageAsset {
  ideaTitle: string;
  prompt: string;
  path: string;
  createdAt: string;
}

export interface ResearchOutputState {
  version: 2;
  outputPath: string;
  topicPath: string;
  parentOutputPath?: string;
  createdAt: string;
  updatedAt: string;
  draft: ResearchOutputDraft;
  plan: ResearchOutputPlan;
  audit?: ResearchEvidenceAudit;
  generatedImages: ResearchOutputImageAsset[];
  versions: ResearchOutputVersion[];
}

function cleanText(value: unknown, limit: number): string {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, limit)
    : "";
}

function stringList(value: unknown, limit: number, itemLimit: number): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .map((item) => cleanText(item, itemLimit))
    .filter(Boolean))).slice(0, limit);
}

function extractJsonObject(raw: string): string {
  const normalized = raw.trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  const start = normalized.indexOf("{");
  const end = normalized.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("模型没有返回可解析的 JSON 对象");
  return normalized.slice(start, end + 1);
}

export function normalizeResearchOutputState(value: unknown): ResearchOutputState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Partial<ResearchOutputState> & { version?: number };
  if (typeof raw.outputPath !== "string"
    || typeof raw.topicPath !== "string"
    || !raw.draft
    || !raw.plan) return null;
  const createdAt = typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString();
  const versions = Array.isArray(raw.versions)
    ? raw.versions.flatMap((candidate) => {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
      const item = candidate as Partial<ResearchOutputVersion>;
      if (typeof item.content !== "string") return [];
      return [{
        id: typeof item.id === "string" && item.id ? item.id : `v${Date.now()}`,
        createdAt: typeof item.createdAt === "string" ? item.createdAt : createdAt,
        label: typeof item.label === "string" && item.label ? item.label : "历史版本",
        content: item.content,
      }];
    })
    : [];
  return {
    version: 2,
    outputPath: raw.outputPath,
    topicPath: raw.topicPath,
    parentOutputPath: typeof raw.parentOutputPath === "string" ? raw.parentOutputPath : undefined,
    createdAt,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : createdAt,
    draft: {
      ...raw.draft,
      selectedPaths: Array.isArray(raw.draft.selectedPaths) ? [...raw.draft.selectedPaths] : [],
    },
    plan: raw.plan,
    audit: raw.audit,
    generatedImages: Array.isArray(raw.generatedImages) ? raw.generatedImages : [],
    versions,
  };
}

export function getResearchOutputPreset(id: ResearchOutputPresetId): ResearchOutputPreset {
  return RESEARCH_OUTPUT_PRESETS.find((preset) => preset.id === id) ?? RESEARCH_OUTPUT_PRESETS[0]!;
}

function splitText(content: string, maxCharacters: number): string[] {
  const normalized = content.trim();
  if (!normalized) return [""];
  const chunks: string[] = [];
  let offset = 0;
  while (offset < normalized.length) {
    const upper = Math.min(normalized.length, offset + maxCharacters);
    let end = upper;
    if (upper < normalized.length) {
      const newline = normalized.lastIndexOf("\n", upper);
      if (newline > offset + Math.floor(maxCharacters * 0.55)) end = newline;
    }
    chunks.push(normalized.slice(offset, end).trim());
    offset = end;
    while (normalized[offset] === "\n" || normalized[offset] === "\r") offset += 1;
  }
  return chunks.filter(Boolean);
}

export function chunkResearchOutputSources(
  sources: ResearchOutputSource[],
  maxCharacters = 6_000,
): ResearchOutputSourceChunk[] {
  return sources.flatMap((source) => {
    const chunks = splitText(source.content, Math.max(800, maxCharacters));
    return chunks.map((content, index) => ({
      path: source.path,
      title: source.title,
      index: index + 1,
      total: chunks.length,
      content,
    }));
  });
}

export function batchResearchOutputChunks(
  chunks: ResearchOutputSourceChunk[],
  maxCharacters = 30_000,
): ResearchOutputSourceChunk[][] {
  const batches: ResearchOutputSourceChunk[][] = [];
  let batch: ResearchOutputSourceChunk[] = [];
  let characters = 0;
  for (const chunk of chunks) {
    const size = chunk.content.length + chunk.path.length + chunk.title.length + 100;
    if (batch.length && characters + size > maxCharacters) {
      batches.push(batch);
      batch = [];
      characters = 0;
    }
    batch.push(chunk);
    characters += size;
  }
  if (batch.length) batches.push(batch);
  return batches;
}

export function buildResearchEvidencePrompt(
  topic: Pick<KnowledgeResearchTopicSummary, "name" | "coreQuestion" | "parentThemeName">,
  chunks: ResearchOutputSourceChunk[],
): string {
  return [
    "你是 KnowGrove 的证据提炼器。只处理输入中的本地材料，不搜索网络，不补充输入之外的事实。",
    `上级主题：${topic.parentThemeName}`,
    `研究课题：${topic.name}`,
    `核心问题：${topic.coreQuestion}`,
    "对每个 path 提炼：简短摘要、最多 6 个关键点、最多 3 段值得引用的原文。原文引用必须逐字来自输入。",
    "同一 path 有多个 chunk 时可以分别返回，系统会合并。path 必须逐字来自输入。",
    "只返回 JSON：{\"evidence\":[{\"path\":\"精确路径\",\"title\":\"标题\",\"summary\":\"摘要\",\"keyPoints\":[\"关键点\"],\"quotes\":[\"原文\"]}]}。",
    `材料分块：${JSON.stringify(chunks)}`,
  ].join("\n");
}

export function parseResearchEvidenceResponse(
  raw: string,
  allowedSources: Array<Pick<ResearchOutputSource, "path" | "title">>,
): ResearchEvidenceDigest[] {
  const parsed = JSON.parse(extractJsonObject(raw)) as Record<string, unknown>;
  const allowed = new Map(allowedSources.map((source) => [source.path, source.title]));
  if (!Array.isArray(parsed.evidence)) return [];
  return parsed.evidence.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const item = candidate as Record<string, unknown>;
    const path = typeof item.path === "string" && allowed.has(item.path) ? item.path : "";
    if (!path) return [];
    const summary = cleanText(item.summary, 1_000);
    const keyPoints = stringList(item.keyPoints, 8, 500);
    const quotes = stringList(item.quotes, 4, 500);
    if (!summary && !keyPoints.length && !quotes.length) return [];
    return [{
      path,
      title: cleanText(item.title, 240) || allowed.get(path) || path,
      summary,
      keyPoints,
      quotes,
    }];
  });
}

export function mergeResearchEvidenceDigests(digests: ResearchEvidenceDigest[]): ResearchEvidenceDigest[] {
  const merged = new Map<string, ResearchEvidenceDigest>();
  for (const digest of digests) {
    const current = merged.get(digest.path);
    if (!current) {
      merged.set(digest.path, {
        ...digest,
        keyPoints: [...digest.keyPoints],
        quotes: [...digest.quotes],
      });
      continue;
    }
    current.summary = [current.summary, digest.summary].filter(Boolean).join(" ").slice(0, 2_000);
    current.keyPoints = Array.from(new Set([...current.keyPoints, ...digest.keyPoints])).slice(0, 10);
    current.quotes = Array.from(new Set([...current.quotes, ...digest.quotes])).slice(0, 5);
  }
  return [...merged.values()];
}

export function buildResearchOutputPlanPrompt(
  topic: Pick<KnowledgeResearchTopicSummary, "name" | "coreQuestion" | "parentThemeName" | "domains">,
  evidence: ResearchEvidenceDigest[],
  draft: ResearchOutputDraft,
): string {
  const preset = getResearchOutputPreset(draft.presetId);
  return [
    "你是 KnowGrove 的创作策划编辑。只能依据提供的证据摘要设计作品，不搜索网络、不虚构事实。",
    `上级主题：${topic.parentThemeName}`,
    `研究课题：${topic.name}`,
    `核心问题：${topic.coreQuestion}`,
    `成果模板：${preset.label}`,
    `模板要求：${preset.instruction}`,
    `作品标题：${draft.title}`,
    `创作目标：${draft.goal || topic.coreQuestion}`,
    `目标读者：${draft.audience || "对该主题感兴趣的普通读者"}`,
    `最想表达的观点：${draft.coreMessage || "由材料归纳，不预设结论"}`,
    `输出语言：${draft.language}`,
    `风格补充：${draft.style || "清晰、具体、保留证据边界"}`,
    "先生成可编辑提纲，不生成全文。每一节必须列出用于支撑的精确 evidencePaths，并判断证据状态。",
    "证据状态只能是：证据充分、支撑不足、存在冲突、需要补充资料。",
    "同时提出最多 6 张配图建议。数据图只能引用材料中真实存在的数据；否则只能做概念图、流程图、引用卡片或插图。",
    "只返回 JSON：{\"title\":\"标题\",\"summary\":\"方向摘要\",\"sections\":[{\"heading\":\"章节\",\"purpose\":\"本节要回答什么\",\"evidencePaths\":[\"精确路径\"],\"evidenceStatus\":\"证据充分\"}],\"imageIdeas\":[{\"title\":\"配图名\",\"purpose\":\"用途\",\"format\":\"封面图/流程图/概念图/引用卡片/数据图\",\"prompt\":\"可编辑提示词\",\"evidencePaths\":[\"精确路径\"]}]}。",
    "所有 evidencePaths 必须逐字来自输入；材料不足时明确标记，不要补造。",
    `证据摘要：${JSON.stringify(evidence)}`,
  ].join("\n");
}

export function parseResearchOutputPlanResponse(
  raw: string,
  allowedPaths: string[],
  evidence: ResearchEvidenceDigest[],
  fallbackTitle: string,
): ResearchOutputPlan {
  const parsed = JSON.parse(extractJsonObject(raw)) as Record<string, unknown>;
  const allowed = new Set(allowedPaths);
  const statusValues = new Set<ResearchOutputPlanSection["evidenceStatus"]>([
    "证据充分",
    "支撑不足",
    "存在冲突",
    "需要补充资料",
  ]);
  const sections = (Array.isArray(parsed.sections) ? parsed.sections : []).flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const item = candidate as Record<string, unknown>;
    const heading = cleanText(item.heading, 160);
    const purpose = cleanText(item.purpose, 600);
    if (!heading || !purpose) return [];
    const evidencePaths = stringList(item.evidencePaths, 30, 500).filter((path) => allowed.has(path));
    const requestedStatus = cleanText(item.evidenceStatus, 20) as ResearchOutputPlanSection["evidenceStatus"];
    const evidenceStatus = statusValues.has(requestedStatus)
      ? requestedStatus
      : evidencePaths.length ? "证据充分" : "支撑不足";
    return [{ heading, purpose, evidencePaths, evidenceStatus }];
  }).slice(0, 18);
  if (!sections.length) throw new Error("模型没有返回可用的内容提纲");
  const imageIdeas = (Array.isArray(parsed.imageIdeas) ? parsed.imageIdeas : []).flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const item = candidate as Record<string, unknown>;
    const title = cleanText(item.title, 120);
    const purpose = cleanText(item.purpose, 300);
    const prompt = cleanText(item.prompt, 1_200);
    if (!title || !purpose || !prompt) return [];
    return [{
      title,
      purpose,
      format: cleanText(item.format, 80) || "概念图",
      prompt,
      evidencePaths: stringList(item.evidencePaths, 20, 500).filter((path) => allowed.has(path)),
    }];
  }).slice(0, 6);
  return {
    title: cleanText(parsed.title, 240) || fallbackTitle,
    summary: cleanText(parsed.summary, 1_000),
    sections,
    imageIdeas,
    evidence,
  };
}

export function buildResearchOutputPrompt(
  topic: Pick<KnowledgeResearchTopicSummary, "name" | "coreQuestion" | "parentThemeName" | "domains">,
  plan: ResearchOutputPlan,
  draft: ResearchOutputDraft,
): string {
  const preset = getResearchOutputPreset(draft.presetId);
  return [
    "你是 KnowGrove 的作品编辑器。只能使用提供的本地证据，不搜索网络、不虚构事实、数字、作者、经历或来源。",
    `上级主题：${topic.parentThemeName}`,
    `研究课题：${topic.name}`,
    `核心问题：${topic.coreQuestion}`,
    `成果模板：${preset.label}`,
    `模板要求：${preset.instruction}`,
    `作品标题：${plan.title || draft.title}`,
    `目标读者：${draft.audience || "普通读者"}`,
    `输出语言：${draft.language}`,
    `写作风格：${draft.style || "清晰、具体、保留证据边界"}`,
    "严格按照已确认提纲生成。不要输出 YAML、H1 标题、代码围栏或生成过程说明。",
    "观点后尽量使用 [[精确来源路径]] 标注证据；证据不足的判断必须明确标为待验证；不要写 file:///。",
    "保留材料之间的差异和冲突，不要为了行文顺畅而消除不确定性。",
    `已确认提纲：${JSON.stringify(plan.sections)}`,
    `证据摘要：${JSON.stringify(plan.evidence)}`,
  ].join("\n");
}

export function buildResearchEvidenceAuditPrompt(
  outputChunk: string,
  evidence: ResearchEvidenceDigest[],
  allowedPaths: string[],
): string {
  return [
    "你是 KnowGrove 的证据审查员。逐条检查作品片段里的可验证事实、数字、因果判断和重要结论。",
    "只能依据给出的本地证据摘要，不搜索网络、不补造来源。纯表达、过渡句和明确标注为观点的句子无需列出。",
    "状态只能是：有依据、依据不足、存在冲突、待人工判断。",
    "evidencePaths 必须逐字来自允许路径。reason 用一句话说明判断。",
    "只返回 JSON：{\"claims\":[{\"text\":\"被检查的原句或短句\",\"status\":\"有依据\",\"evidencePaths\":[\"精确路径\"],\"reason\":\"说明\"}]}。",
    `允许路径：${JSON.stringify(allowedPaths)}`,
    `证据摘要：${JSON.stringify(evidence)}`,
    `作品片段：${outputChunk}`,
  ].join("\n");
}

export function parseResearchEvidenceAuditResponse(
  raw: string,
  allowedPaths: string[],
): ResearchEvidenceAuditClaim[] {
  const parsed = JSON.parse(extractJsonObject(raw)) as Record<string, unknown>;
  const allowed = new Set(allowedPaths);
  const statuses = new Set<ResearchEvidenceAuditStatus>(["有依据", "依据不足", "存在冲突", "待人工判断"]);
  if (!Array.isArray(parsed.claims)) return [];
  return parsed.claims.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const item = candidate as Record<string, unknown>;
    const text = cleanText(item.text, 500);
    const status = cleanText(item.status, 20) as ResearchEvidenceAuditStatus;
    if (!text || !statuses.has(status)) return [];
    return [{
      text,
      status,
      evidencePaths: stringList(item.evidencePaths, 20, 500).filter((path) => allowed.has(path)),
      reason: cleanText(item.reason, 500),
    }];
  });
}

export type ResearchRewriteAction = "改写" | "精简" | "扩写" | "改变语气" | "补充证据" | "适配渠道";

export function buildResearchRewritePrompt(
  selection: string,
  action: ResearchRewriteAction,
  instruction: string,
  evidence: ResearchEvidenceDigest[],
  presetId?: ResearchOutputPresetId,
): string {
  const preset = presetId ? getResearchOutputPreset(presetId) : undefined;
  return [
    "你是 KnowGrove 的局部编辑器。只改写用户选中的内容，不输出解释、标题、代码围栏或修改过程。",
    `操作：${action}`,
    `补充要求：${instruction || "保持原意与事实边界"}`,
    ...(preset ? [`目标渠道：${preset.label}`, `渠道要求：${preset.instruction}`] : []),
    "不得虚构事实、数字、经历或来源。需要证据时只能使用给出的本地证据，并用 [[精确来源路径]] 标注。",
    `本地证据：${JSON.stringify(evidence)}`,
    `选中内容：${selection}`,
  ].join("\n");
}

export function buildChannelDerivativePrompt(
  sourceContent: string,
  draft: ResearchOutputDraft,
  targetPresetId: ResearchOutputPresetId,
  title: string,
  extraInstruction: string,
): string {
  const preset = getResearchOutputPreset(targetPresetId);
  return [
    "你是 KnowGrove 的渠道编辑器。把已有作品派生为另一个渠道的完整作品包，不添加原稿中不存在的事实。",
    `目标渠道：${preset.label}`,
    `渠道要求：${preset.instruction}`,
    `作品标题：${title}`,
    `语言：${draft.language}`,
    `额外要求：${extraInstruction || "保持原稿观点与证据边界"}`,
    "输出可直接编辑的 Markdown，并依次包含：标题候选、摘要、正文、行动引导、配图简报、发布前检查。",
    "保留原稿里的 Obsidian wikilink 证据；不要输出 YAML、H1 标题、代码围栏、file:/// 或生成过程。",
    `原稿：${sourceContent}`,
  ].join("\n");
}

export function buildChannelDerivativeNote(
  title: string,
  presetId: ResearchOutputPresetId,
  parentOutputPath: string,
  content: string,
  date: string,
): string {
  const preset = getResearchOutputPreset(presetId);
  return [
    "---",
    `文件名: ${JSON.stringify(title)}`,
    "类型: 内容输出",
    "状态: 草稿",
    `创建时间: ${date}`,
    "---",
    "",
    `# ${title}`,
    "",
    content.trim(),
    "",
    "> [!info]- 创作信息",
    `> - 派生自：[[${parentOutputPath.replace(/\.md$/i, "")}]]`,
    `> - 创作方向：${preset.label}`,
    "",
  ].join("\n");
}

export function normalizeResearchOutput(raw: string): string {
  return raw.trim()
    .replace(/^```(?:markdown|md)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

export interface MarkdownSectionRange {
  start: number;
  end: number;
  content: string;
}

export function findMarkdownSection(content: string, heading: string): MarkdownSectionRange | null {
  const target = heading.trim().replace(/\s+/g, " ").toLocaleLowerCase();
  if (!target) return null;
  const matches = Array.from(content.matchAll(/^(#{1,6})[ \t]+(.+?)[ \t]*$/gm));
  const current = matches.find((match) =>
    match[2]?.trim().replace(/\s+/g, " ").toLocaleLowerCase() === target);
  if (!current || current.index === undefined) return null;
  const level = current[1]?.length ?? 2;
  const next = matches.find((match) =>
    match.index !== undefined
    && match.index > current.index!
    && (match[1]?.length ?? 7) <= level);
  const end = next?.index ?? content.length;
  return {
    start: current.index,
    end,
    content: content.slice(current.index, end).trimEnd(),
  };
}

export function mergeResearchOutput(content: string, heading: string, output: string): string {
  const block = [RESEARCH_OUTPUT_START, output.trim(), RESEARCH_OUTPUT_END].join("\n");
  const start = content.indexOf(RESEARCH_OUTPUT_START);
  const end = content.indexOf(RESEARCH_OUTPUT_END);
  if (start >= 0 && end > start) {
    return `${content.slice(0, start)}${block}${content.slice(end + RESEARCH_OUTPUT_END.length)}`;
  }
  const normalizedHeading = heading.trim() || "AI 输出草稿";
  return `${content.trimEnd()}\n\n## ${normalizedHeading}\n\n${block}\n`;
}

function buildCreationInfoCallout(
  topicPath: string,
  presetLabel: string,
  imageIdeas: ResearchOutputImageIdea[],
): string[] {
  const lines = [
    "> [!info]- 创作信息与配图方案",
    `> - 来源课题：[[${topicPath.replace(/\.md$/i, "")}]]`,
    `> - 创作方向：${presetLabel}`,
  ];
  if (imageIdeas.length) {
    lines.push(">", "> **配图方案**");
    for (const idea of imageIdeas) {
      lines.push(`> - **${idea.title}**（${idea.format}）：${idea.purpose}`);
      lines.push(`>   - 提示词：${idea.prompt}`);
    }
  }
  return ["", ...lines];
}

export function buildResearchOutputNote(
  topic: Pick<KnowledgeResearchTopicSummary, "name" | "parentThemeName" | "domains" | "workspacePath">,
  draft: ResearchOutputDraft,
  plan: ResearchOutputPlan,
  output: string,
  date: string,
): string {
  const quote = (value: string): string => JSON.stringify(value);
  const themePath = topicWorkspacePaths(topic.parentThemeName).notePath.replace(/\.md$/i, "");
  const preset = getResearchOutputPreset(draft.presetId);
  return [
    "---",
    `文件名: ${quote(plan.title || draft.title)}`,
    "类型: 内容输出",
    "状态: 草稿",
    ...(topic.domains.length ? ["领域:", ...topic.domains.slice(0, 2).map((domain) => `  - ${quote(domain)}`)] : []),
    "主题:",
    `  - ${quote(`[[${themePath}]]`)}`,
    `创建时间: ${date}`,
    "---",
    "",
    `# ${plan.title || draft.title}`,
    "",
    output.trim(),
    ...buildCreationInfoCallout(topic.workspacePath, preset.label, plan.imageIdeas),
    "",
  ].join("\n");
}

export function researchOutputStatePath(outputPath: string): string {
  const name = safeTopicFileName(outputPath.replace(/\.md$/i, "").split("/").pop() || "未命名作品");
  return `${RESEARCH_OUTPUT_DATA_ROOT}/${name}.json`;
}

export function buildResearchOutputState(
  outputPath: string,
  topicPath: string,
  draft: ResearchOutputDraft,
  plan: ResearchOutputPlan,
  output: string,
  createdAt: string,
  parentOutputPath?: string,
): ResearchOutputState {
  return {
    version: 2,
    outputPath,
    topicPath,
    parentOutputPath,
    createdAt,
    updatedAt: createdAt,
    draft: {
      ...draft,
      selectedPaths: [...draft.selectedPaths],
    },
    plan,
    generatedImages: [],
    versions: [{
      id: "v1",
      createdAt,
      label: "AI 初稿",
      content: output,
    }],
  };
}
