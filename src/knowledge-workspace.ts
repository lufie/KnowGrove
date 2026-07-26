import type {
  KnowledgeThemeDocument,
  KnowledgeWorkspaceSummary,
  KnowledgeWorkspaceType,
  PropertyNoteSnapshot,
} from "./types";
import { normalizeKnowledgeTopic, researchTopicWorkspacePaths, safeTopicFileName, topicWorkspacePaths } from "./knowledge-cycle";

export const KNOWLEDGE_WORKSPACE_ROOT = "_KnowGrove/工作空间";
export const KNOWLEDGE_WORKSPACE_BASE_MARKER = "# KnowGrove managed workspace Base";

const WORKSPACE_TYPES = new Set<KnowledgeWorkspaceType>(["研究课题", "项目", "生活目标", "例行事项"]);

function strings(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return typeof value === "string" ? [value] : [];
}

function normalizedValues(value: unknown): string[] {
  return Array.from(new Set(strings(value).map(normalizeKnowledgeTopic).filter(Boolean)));
}

function normalizeSourcePath(value: string): string {
  const match = /^\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]$/.exec(value.trim());
  const path = (match?.[1] ?? value).trim().replace(/^\/+/, "");
  return path && !/\.md$/i.test(path) ? `${path}.md` : path;
}

function linkTarget(value: string): string {
  const match = /^\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]$/.exec(value.trim());
  return (match?.[1] ?? "").trim().replace(/\.md$/i, "");
}

function relationMatches(value: string, name: string, workspacePath: string): boolean {
  const target = linkTarget(value);
  if (target && target === workspacePath.replace(/\.md$/i, "")) return true;
  return normalizeKnowledgeTopic(value).toLocaleLowerCase() === name.toLocaleLowerCase();
}

export function knowledgeWorkspacePaths(type: KnowledgeWorkspaceType, name: string): { notePath: string; basePath: string } {
  const safe = safeTopicFileName(name);
  const folder = type === "项目" ? "项目" : type === "研究课题" ? "研究" : "生活";
  return {
    notePath: `${KNOWLEDGE_WORKSPACE_ROOT}/${folder}/${safe}.md`,
    basePath: `${KNOWLEDGE_WORKSPACE_ROOT}/${folder}/${safe}.base`,
  };
}

export function buildKnowledgeWorkspaces(
  snapshots: PropertyNoteSnapshot[],
  documents: KnowledgeThemeDocument[],
): KnowledgeWorkspaceSummary[] {
  const byDocumentPath = new Map(documents.map((document) => [document.path, document]));
  const snapshotByPath = new Map(snapshots.map((snapshot) => [snapshot.path, snapshot]));
  const workspaces: KnowledgeWorkspaceSummary[] = [];

  for (const snapshot of snapshots) {
    const frontmatter = snapshot.frontmatter;
    if (!frontmatter) continue;
    const legacyResearchTopic = frontmatter.knowgrove_research_topic === true;
    const genericWorkspace = frontmatter.knowgrove_workspace === true;
    if (!legacyResearchTopic && !genericWorkspace) continue;

    const requestedType = legacyResearchTopic ? "研究课题" : frontmatter.空间类型;
    if (typeof requestedType !== "string" || !WORKSPACE_TYPES.has(requestedType as KnowledgeWorkspaceType)) continue;
    const type = requestedType as KnowledgeWorkspaceType;
    const name = legacyResearchTopic
      ? (typeof frontmatter.课题名称 === "string" ? frontmatter.课题名称.trim() : snapshot.basename)
      : (typeof frontmatter.空间名称 === "string" ? frontmatter.空间名称.trim() : snapshot.basename);
    if (!name) continue;
    const paths = type === "研究课题"
      ? { notePath: snapshot.path, basePath: snapshot.path.replace(/\.md$/i, ".base") }
      : knowledgeWorkspacePaths(type, name);
    const hasExplicitSources = Object.prototype.hasOwnProperty.call(frontmatter, "资料范围");
    const explicitSourcePaths = hasExplicitSources
      ? strings(frontmatter.资料范围).map(normalizeSourcePath).filter(Boolean)
      : [];
    const relatedPaths = new Set(explicitSourcePaths);
    const relationProperty = type === "项目" ? "所属项目" : type === "研究课题" ? "课题" : "所属空间";
    for (const document of documents) {
      const relationValues = strings(snapshotByPath.get(document.path)?.frontmatter?.[relationProperty]);
      if (relationValues.some((value) => relationMatches(value, name, snapshot.path))) relatedPaths.add(document.path);
    }
    const workspaceDocuments = Array.from(relatedPaths)
      .map((path) => byDocumentPath.get(path))
      .filter((document): document is KnowledgeThemeDocument => Boolean(document))
      .sort((left, right) => right.modifiedAt - left.modifiedAt);
    const parentValue = strings(frontmatter.上级空间)[0] ?? "";
    const parentPath = linkTarget(parentValue);
    workspaces.push({
      name,
      type,
      objective: typeof frontmatter.目标 === "string"
        ? frontmatter.目标.trim()
        : typeof frontmatter.核心问题 === "string" ? frontmatter.核心问题.trim() : name,
      status: typeof frontmatter.状态 === "string" ? frontmatter.状态.trim() : "",
      domains: normalizedValues(frontmatter.领域),
      themes: normalizedValues(frontmatter.主题),
      parentName: parentValue ? normalizeKnowledgeTopic(parentValue) : undefined,
      parentPath: parentPath || undefined,
      repeatRule: typeof frontmatter.重复规则 === "string" ? frontmatter.重复规则.trim() : undefined,
      total: workspaceDocuments.length,
      workspaceExists: true,
      workspacePath: snapshot.path || paths.notePath,
      basePath: snapshot.path.replace(/\.md$/i, ".base") || paths.basePath,
      explicitSourcePaths,
      documents: workspaceDocuments,
    });
  }

  return workspaces.sort((left, right) => left.type.localeCompare(right.type, "zh-CN")
    || left.domains.join("/").localeCompare(right.domains.join("/"), "zh-CN")
    || left.name.localeCompare(right.name, "zh-CN"));
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

function yamlList(name: string, values: string[]): string[] {
  if (!values.length) return [];
  return [`${name}:`, ...values.map((value) => `  - ${yamlDoubleQuoted(value)}`)];
}

function pathFilterLines(documents: KnowledgeThemeDocument[]): string[] {
  if (!documents.length) return [yamlSingleQuoted("false")];
  if (documents.length === 1) return [yamlSingleQuoted(`file.path == "${formulaString(documents[0]?.path ?? "")}"`)];
  return [
    "or:",
    ...documents.map((document) => `  - ${yamlSingleQuoted(`file.path == "${formulaString(document.path)}"`)}`),
  ];
}

function appendView(lines: string[], name: string, documents: KnowledgeThemeDocument[]): void {
  lines.push(
    "  - type: table",
    `    name: ${yamlDoubleQuoted(name)}`,
    "    filters:",
    ...pathFilterLines(documents).map((line) => `      ${line}`),
    "    order:",
    "      - \"file.name\"",
    "      - \"类型\"",
    "      - \"状态\"",
    "      - \"所属项目\"",
    "      - \"所属空间\"",
    "      - \"领域\"",
    "      - \"主题\"",
    "      - \"file.mtime\"",
    "    sort:",
    "      - property: file.mtime",
    "        direction: DESC",
  );
}

export function buildKnowledgeWorkspaceBase(workspace: KnowledgeWorkspaceSummary): string {
  const lines = [
    "filters:",
    "  and:",
    `    - ${yamlSingleQuoted('file.ext == "md"')}`,
    "formulas:",
    `  knowgrove_workspace_base: ${yamlSingleQuoted('"1.0.0"')}`,
    "properties:",
    "  file.name:",
    "    displayName: \"文档\"",
    "  file.mtime:",
    "    displayName: \"最近修改\"",
    "views:",
  ];
  appendView(lines, "全部关联", workspace.documents);
  if (workspace.type === "项目") {
    appendView(lines, "项目资料", workspace.documents.filter((document) => !["行动", "内容输出", "复盘"].includes(document.type)));
    appendView(lines, "行动", workspace.documents.filter((document) => document.type === "行动"));
    appendView(lines, "交付物", workspace.documents.filter((document) => document.type === "内容输出"));
    appendView(lines, "复盘", workspace.documents.filter((document) => document.type === "复盘"));
  } else {
    appendView(lines, "行动", workspace.documents.filter((document) => document.type === "行动"));
    appendView(lines, "日常记录", workspace.documents.filter((document) => ["随手笔记", "复盘"].includes(document.type)));
    appendView(lines, "知识与资料", workspace.documents.filter((document) => ["输入资料", "知识笔记"].includes(document.type)));
  }
  return `${KNOWLEDGE_WORKSPACE_BASE_MARKER}\n${lines.join("\n")}\n`;
}

export function isManagedKnowledgeWorkspaceBase(content: string): boolean {
  return content.startsWith(KNOWLEDGE_WORKSPACE_BASE_MARKER)
    || /^\s*knowgrove_workspace_base:\s*/m.test(content);
}

function workspaceStatus(type: KnowledgeWorkspaceType): string {
  return type === "项目" ? "构思中" : "进行中";
}

export function buildKnowledgeWorkspaceNote(workspace: KnowledgeWorkspaceSummary, now = new Date()): string {
  const date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
  const parentLink = workspace.parentPath ? `[[${workspace.parentPath.replace(/\.md$/i, "")}]]` : "";
  const frontmatter = [
    "---",
    `文件名: ${yamlDoubleQuoted(workspace.name)}`,
    `类型: ${workspace.type === "项目" ? "项目笔记" : "随手笔记"}`,
    `状态: ${workspace.status || workspaceStatus(workspace.type)}`,
    ...yamlList("领域", workspace.domains),
    ...yamlList("主题", workspace.themes.map((theme) => `[[${topicWorkspacePaths(theme).notePath.replace(/\.md$/i, "")}]]`)),
    `空间名称: ${yamlDoubleQuoted(workspace.name)}`,
    `空间类型: ${workspace.type}`,
    `目标: ${yamlDoubleQuoted(workspace.objective || workspace.name)}`,
    ...(parentLink ? [`上级空间: ${yamlDoubleQuoted(parentLink)}`] : []),
    ...(workspace.repeatRule ? [`重复规则: ${yamlDoubleQuoted(workspace.repeatRule)}`] : []),
    `创建时间: ${date}`,
    "knowgrove_workspace: true",
    "---",
    "",
  ];
  if (workspace.type === "项目") {
    return [...frontmatter,
      `# ${workspace.name}`,
      "",
      `> [!goal] 项目目标\n> ${workspace.objective || workspace.name}`,
      ...(parentLink ? ["", `上级项目：${parentLink}`] : []),
      "",
      "## 项目目标",
      "",
      "- 成功标准：",
      "- 边界与约束：",
      "",
      "## 里程碑",
      "",
      "- [ ] ",
      "",
      "## 项目资料",
      "",
      `![[${workspace.basePath}#项目资料]]`,
      "",
      "## 行动",
      "",
      `![[${workspace.basePath}#行动]]`,
      "",
      "## 交付物",
      "",
      `![[${workspace.basePath}#交付物]]`,
      "",
      "## 复盘",
      "",
      `![[${workspace.basePath}#复盘]]`,
      "",
    ].join("\n");
  }
  const routine = workspace.type === "例行事项";
  return [...frontmatter,
    `# ${workspace.name}`,
    "",
    `> [!${routine ? "repeat" : "goal"}] ${workspace.type}\n> ${workspace.objective || workspace.name}`,
    ...(routine && workspace.repeatRule ? [">", `> 重复规则：${workspace.repeatRule}`] : []),
    "",
    "## 当前状态",
    "",
    "- ",
    "",
    routine ? "## 执行规则" : "## 目标与计划",
    "",
    "- [ ] ",
    "",
    "## 关联资料",
    "",
    `![[${workspace.basePath}#知识与资料]]`,
    "",
    "## 行动",
    "",
    `![[${workspace.basePath}#行动]]`,
    "",
    "## 记录",
    "",
    `![[${workspace.basePath}#日常记录]]`,
    "",
    "## 复盘",
    "",
  ].join("\n");
}

export function rankWorkspaceSourceCandidates(
  workspace: Pick<KnowledgeWorkspaceSummary, "name" | "objective" | "domains" | "themes">,
  candidates: KnowledgeThemeDocument[],
  limit = 40,
): KnowledgeThemeDocument[] {
  const name = workspace.name.toLocaleLowerCase();
  const objective = workspace.objective.toLocaleLowerCase();
  const domains = new Set(workspace.domains.map((value) => value.toLocaleLowerCase()));
  const themes = new Set(workspace.themes.map((value) => value.toLocaleLowerCase()));
  return [...candidates].sort((left, right) => {
    const score = (document: KnowledgeThemeDocument): number => {
      const text = `${document.basename} ${document.path} ${document.domains.join(" ")} ${document.topics.join(" ")}`.toLocaleLowerCase();
      let value = text.includes(name) ? 20 : 0;
      value += document.domains.filter((domain) => domains.has(domain.toLocaleLowerCase())).length * 8;
      value += document.topics.filter((topic) => themes.has(topic.toLocaleLowerCase())).length * 10;
      const keywords = `${workspace.name} ${workspace.objective}`.split(/[\s，。！？、：；,.:;!?（）()]+/).filter((word) => word.length >= 2);
      value += keywords.filter((keyword) => text.includes(keyword.toLocaleLowerCase())).length * 2;
      if (objective.includes(document.basename.toLocaleLowerCase())) value += 3;
      return value;
    };
    return score(right) - score(left) || right.modifiedAt - left.modifiedAt;
  }).slice(0, Math.max(1, limit));
}

export function buildWorkspacePlanningPrompt(
  workspace: Pick<KnowledgeWorkspaceSummary, "name" | "type" | "objective" | "domains" | "themes">,
  candidates: KnowledgeThemeDocument[],
): string {
  return [
    "你是 KnowGrove 的工作空间资料路由器。只根据给定标题和属性判断相关性，不搜索网络、不虚构文档内容。",
    `空间类型：${workspace.type}`,
    `空间名称：${workspace.name}`,
    `目标：${workspace.objective}`,
    `领域：${workspace.domains.join("、") || "尚未确定"}`,
    `主题：${workspace.themes.join("、") || "尚未确定"}`,
    "请推荐最多 15 篇与这个工作空间直接相关的资料。项目优先选择能支持目标、行动或交付的资料；生活空间优先选择能支持目标、例行执行或复盘的资料。",
    "只返回 JSON：{\"questions\":[],\"sources\":[{\"path\":\"输入中的精确路径\",\"reason\":\"一句话相关性理由\"}]}。",
    "path 必须逐字来自候选资料；相关性不足时返回空 sources，不为凑数选择。",
    `候选资料：${JSON.stringify(candidates.map((document) => ({ path: document.path, title: document.basename, type: document.type, domains: document.domains, topics: document.topics })))}`,
  ].join("\n");
}

export function researchTopicAsWorkspace(
  name: string,
  parentThemeName: string,
  domains: string[],
): KnowledgeWorkspaceSummary {
  const paths = researchTopicWorkspacePaths(parentThemeName, name);
  return {
    name,
    type: "研究课题",
    objective: name,
    status: "研究中",
    domains,
    themes: [parentThemeName],
    total: 0,
    workspaceExists: false,
    workspacePath: paths.notePath,
    basePath: paths.basePath,
    explicitSourcePaths: [],
    documents: [],
  };
}
