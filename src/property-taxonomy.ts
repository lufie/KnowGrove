import type {
  PropertyDimensionConfig,
  PropertyTaxonomyNode,
  PropertyTaxonomyProposal,
  PropertyTaxonomySettings,
} from "./types";

export interface AITaxonomySample {
  path: string;
  title: string;
  type?: string;
  domains: string[];
  topics: string[];
}

export interface AITaxonomyPromptInput {
  currentDomains: string[];
  observedDomains: Array<{ value: string; count: number }>;
  observedTopics: Array<{ value: string; count: number }>;
  samples: AITaxonomySample[];
}

export const PDSA_STAGES = [
  {
    code: "P",
    title: "捕获与计划",
    description: "刚进入系统，先确认内容角色和下一步。",
    statuses: ["待整理", "待归类", "种子", "构思中", "待办", "选题"],
  },
  {
    code: "D",
    title: "加工与执行",
    description: "正在阅读、提炼、推进或形成草稿。",
    statuses: ["待沉淀", "生长中", "进行中", "提纲", "草稿"],
  },
  {
    code: "S",
    title: "研究与复盘",
    description: "比较证据、提炼命题、识别冲突并形成判断。",
    statuses: ["待复核", "等待中", "待发布", "已复盘"],
  },
  {
    code: "A",
    title: "沉淀与交付",
    description: "已经形成可复用知识、完成行动或正式发布。",
    statuses: ["已沉淀", "常青", "已完成", "已发布"],
  },
] as const;

function cleanName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.trim().replace(/^#+/, "").replace(/[\r\n]/g, " ").slice(0, 40);
  return cleaned || undefined;
}

function normalizeNodes(nodes: unknown, fallback: PropertyTaxonomyNode[] = []): PropertyTaxonomyNode[] {
  if (!Array.isArray(nodes)) return fallback.map((node) => ({ name: node.name, children: [...node.children] }));
  const roots = new Map<string, string[]>();
  for (const raw of nodes) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const source = raw as Record<string, unknown>;
    const name = cleanName(source.name);
    if (!name || name.includes("/")) continue;
    const children = Array.isArray(source.children)
      ? Array.from(new Set(source.children.map(cleanName).filter((item): item is string => Boolean(item) && !item?.includes("/")))).slice(0, 12)
      : [];
    if (!roots.has(name)) roots.set(name, children);
    if (roots.size >= 15) break;
  }
  return Array.from(roots, ([name, children]) => ({ name, children }));
}

export function parseDomainPaths(value: string): PropertyTaxonomyNode[] {
  const roots = new Map<string, string[]>();
  for (const raw of value.split(/\r?\n/)) {
    const parts = raw.split("/").map((part) => cleanName(part)).filter((part): part is string => Boolean(part));
    const root = parts[0];
    if (!root) continue;
    if (!roots.has(root)) roots.set(root, []);
    const child = parts[1];
    if (child) {
      const children = roots.get(root) ?? [];
      if (!children.includes(child) && children.length < 12) children.push(child);
    }
    if (roots.size >= 15) break;
  }
  return Array.from(roots, ([name, children]) => ({ name, children }));
}

export function domainPaths(nodes: PropertyTaxonomyNode[]): string[] {
  return nodes.flatMap((node) => [node.name, ...node.children.map((child) => `${node.name}/${child}`)]);
}

export function normalizePropertyTaxonomy(
  saved: Partial<PropertyTaxonomySettings> | undefined,
  fallbackDomains: string[],
): PropertyTaxonomySettings {
  const fallback = parseDomainPaths(fallbackDomains.join("\n"));
  const domains = normalizeNodes(saved?.domains, fallback);
  const proposalSource = saved?.proposal;
  const proposalDomains = normalizeNodes(proposalSource?.domains);
  const proposal = proposalDomains.length && proposalSource
    ? {
        summary: cleanName(proposalSource.summary) ?? "AI 已根据当前知识库生成分类建议。",
        domains: proposalDomains,
        confidence: typeof proposalSource.confidence === "number"
          ? Math.max(0, Math.min(1, proposalSource.confidence))
          : undefined,
        generatedAt: typeof proposalSource.generatedAt === "string" ? proposalSource.generatedAt : new Date().toISOString(),
      }
    : undefined;
  return {
    version: 1,
    strategy: "four-layer-pdsa",
    source: saved?.source === "ai" || saved?.source === "custom" ? saved.source : "recommended",
    domains: domains.length ? domains : fallback,
    adoptedAt: typeof saved?.adoptedAt === "string" ? saved.adoptedAt : undefined,
    proposal,
  };
}

export function applyTaxonomyToDimensions(
  current: PropertyDimensionConfig[],
  recommended: PropertyDimensionConfig[],
  taxonomy: PropertyTaxonomySettings,
): PropertyDimensionConfig[] {
  const result = current.map((dimension) => ({
    ...dimension,
    aliases: [...dimension.aliases],
    allowedValues: [...dimension.allowedValues],
    requiredForTypes: [...(dimension.requiredForTypes ?? [])],
  }));
  for (const template of recommended) {
    const index = result.findIndex((dimension) => dimension.name === template.name || dimension.id === template.id);
    if (index < 0) {
      result.push({
        ...template,
        aliases: [...template.aliases],
        allowedValues: template.name === "领域" ? domainPaths(taxonomy.domains) : [...template.allowedValues],
        requiredForTypes: [...(template.requiredForTypes ?? [])],
      });
      continue;
    }
    const existing = result[index];
    if (!existing) continue;
    if (["类型", "状态", "领域", "主题"].includes(template.name)) existing.aiManaged = true;
    if (template.name === "类型" || template.name === "状态") existing.allowedValues = [...template.allowedValues];
    if (template.name === "领域") existing.allowedValues = domainPaths(taxonomy.domains);
  }
  return result;
}

export function buildAITaxonomyPrompt(input: AITaxonomyPromptInput): string {
  return [
    "你是 KnowGrove 的个人知识库分类架构师。只分析给定的汇总数据，不调用工具、不搜索网络、不修改文件。",
    "目标：基于用户现有知识内容，提出一套稳定、少维护、最多两级的领域分类树。",
    "这套系统固定采用四层正交结构：领域=长期知识版图；区块=类型/内容类型/项目等横向筛选；属性=主题与精选关联；状态=PDSA 知识循环。你只建议领域树，不重复创造类型、状态或主题字段。",
    "硬性规则：",
    "1. 只返回 JSON，格式为 {\"summary\":\"一句建议\",\"domains\":[{\"name\":\"一级领域\",\"children\":[\"二级领域\"]}],\"confidence\":0到1}。",
    "2. 一级领域建议 5 到 12 个，最多 15 个；最多两级，每个一级领域最多 8 个二级领域。",
    "3. 一级领域必须稳定、互相尽量正交，不能使用工作流状态、文档类型、文件夹名、工具名或单次项目名。",
    "4. 二级领域必须能长期复用；只有内容量或语义重复足够明显时才建立，不为每篇笔记创建分类。",
    "5. 尽量保留已有合理领域，合并近义项；专有概念与细颗粒知识应留给主题，不进入领域树。",
    "6. 不输出空名称、斜杠路径、三级分类或额外字段。",
    `当前领域：${JSON.stringify(input.currentDomains)}`,
    `已观察领域频次：${JSON.stringify(input.observedDomains)}`,
    `高频主题：${JSON.stringify(input.observedTopics)}`,
    `代表性笔记样本：${JSON.stringify(input.samples)}`,
  ].join("\n");
}

function extractJsonObject(raw: string): string {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("模型没有返回可解析的分类方案 JSON");
  return trimmed.slice(start, end + 1);
}

export function parseAITaxonomyResponse(raw: string, now = new Date()): PropertyTaxonomyProposal {
  const parsed = JSON.parse(extractJsonObject(raw)) as Record<string, unknown>;
  const domains = normalizeNodes(parsed.domains);
  if (!domains.length) throw new Error("模型返回中没有有效的领域分类树");
  const summary = typeof parsed.summary === "string" && parsed.summary.trim()
    ? parsed.summary.trim().slice(0, 240)
    : "AI 已根据当前知识库生成领域分类建议。";
  const confidence = typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
    ? Math.max(0, Math.min(1, parsed.confidence))
    : undefined;
  return { summary, domains, confidence, generatedAt: now.toISOString() };
}
