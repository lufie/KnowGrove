import type {
  KnowledgeDomainSummary,
  KnowledgeResearchTopicSummary,
  KnowledgeThemeDocument,
  KnowledgeThemeSummary,
  PDSAStage,
  PropertyNoteSnapshot,
  PropertySystemSettings,
  ThemeSynthesisProposal,
  ThemePlanningProposal,
} from "./types";
import { isPropertyGovernedPath } from "./property-system";
import { RESEARCH_SOURCES_BLOCK, RESEARCH_SOURCES_HEADING } from "./research-sources";

export const TOPIC_WORKSPACE_ROOT = "_KnowGrove/主题空间";
export const RESEARCH_TOPIC_WORKSPACE_ROOT = "_KnowGrove/课题";
export const TOPIC_BASE_MANAGED_MARKER = "# KnowGrove managed topic Base";
export const TOPIC_SYNTHESIS_START = "<!-- knowgrove:theme-synthesis:start -->";
export const TOPIC_SYNTHESIS_END = "<!-- knowgrove:theme-synthesis:end -->";
export const RESEARCH_TOPIC_ACTIONS_BLOCK = "```knowgrove-research-actions\n```";

const VALID_STAGES = new Set<PDSAStage>(["P", "D", "S", "A"]);

function strings(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return typeof value === "string" ? [value] : [];
}

export function normalizeKnowledgeTopic(value: string): string {
  const trimmed = value.trim();
  const match = /^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/.exec(trimmed);
  if (!match) return trimmed.replace(/^#+/, "").trim();
  const alias = match[2]?.trim();
  const target = (match[1] ?? "").split("#")[0]?.trim() ?? "";
  const basename = target.split("/").pop()?.trim() ?? target;
  return alias || basename;
}

export function normalizeKnowledgeNameKey(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function knowledgeNamesMatch(left: string, right: string): boolean {
  return normalizeKnowledgeNameKey(left) === normalizeKnowledgeNameKey(right);
}

export function renameKnowledgeThemePropertyValues(
  values: string[],
  previousName: string,
  nextName: string,
  previousWorkspacePath: string,
  nextWorkspacePath: string,
): string[] {
  const previousKey = previousName.trim().toLocaleLowerCase();
  const previousTarget = previousWorkspacePath.replace(/\.md$/i, "").toLocaleLowerCase();
  const nextTarget = nextWorkspacePath.replace(/\.md$/i, "");
  const renamed = values.map((value) => {
    const trimmed = value.trim();
    const target = /^\[\[([^\]|#]+)/.exec(trimmed)?.[1]?.replace(/\.md$/i, "").toLocaleLowerCase() ?? "";
    if (normalizeKnowledgeTopic(trimmed).toLocaleLowerCase() !== previousKey && target !== previousTarget) return trimmed;
    return target ? `[[${nextTarget}]]` : nextName;
  }).filter(Boolean);
  const seen = new Set<string>();
  return renamed.filter((value) => {
    const key = normalizeKnowledgeTopic(value).toLocaleLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function renameRawKnowledgeTopicPropertyValues(
  values: string[],
  previousName: string,
  nextName: string,
): string[] {
  const previousKey = normalizeKnowledgeNameKey(previousName);
  const renamed = values.map((value) => {
    const trimmed = value.trim();
    if (normalizeKnowledgeNameKey(normalizeKnowledgeTopic(trimmed)) !== previousKey) return trimmed;
    return /^\[\[/.test(trimmed) ? `[[${nextName}]]` : nextName;
  }).filter(Boolean);
  const seen = new Set<string>();
  return renamed.filter((value) => {
    const key = normalizeKnowledgeNameKey(normalizeKnowledgeTopic(value));
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function removeKnowledgeTopicPropertyValues(
  values: string[],
  topicName: string,
  workspacePath = "",
): string[] {
  const topicKey = normalizeKnowledgeNameKey(topicName);
  const workspaceTarget = workspacePath.replace(/\.md$/i, "").toLocaleLowerCase();
  return values.filter((value) => {
    const trimmed = value.trim();
    const target = /^\[\[([^\]|#]+)/.exec(trimmed)?.[1]?.replace(/\.md$/i, "").toLocaleLowerCase() ?? "";
    return normalizeKnowledgeNameKey(normalizeKnowledgeTopic(trimmed)) !== topicKey
      && (!workspaceTarget || target !== workspaceTarget);
  });
}

export function migrateKnowledgeThemeDomains(
  currentDomains: string[],
  previousThemeDomains: string[],
  nextThemeDomains: string[],
  retainedDomains: string[] = [],
): string[] {
  const previous = new Set(previousThemeDomains.map((value) => value.trim().toLocaleLowerCase()).filter(Boolean));
  const retained = new Set(retainedDomains.map((value) => value.trim().toLocaleLowerCase()).filter(Boolean));
  const next: string[] = [];
  const seen = new Set<string>();
  const append = (value: string): void => {
    const normalized = value.trim();
    const key = normalized.toLocaleLowerCase();
    if (!normalized || seen.has(key)) return;
    seen.add(key);
    next.push(normalized);
  };
  for (const value of currentDomains) {
    const key = value.trim().toLocaleLowerCase();
    if (!previous.has(key) || retained.has(key)) append(value);
  }
  for (const value of nextThemeDomains) append(value);
  return next;
}

function normalizedValues(value: unknown): string[] {
  return Array.from(new Set(strings(value).map(normalizeKnowledgeTopic).filter(Boolean)));
}

export function safeTopicFileName(topic: string): string {
  const substitutions: Record<string, string> = {
    "/": "／", "\\": "＼", ":": "：", "*": "＊", "?": "？", '"': "＂", "<": "＜", ">": "＞", "|": "｜",
  };
  const safe = topic.replace(/[\\/:*?"<>|]/g, (character) => substitutions[character] ?? "-")
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
  return safe || "未命名主题";
}

export function topicWorkspacePaths(topic: string): { notePath: string; basePath: string } {
  const name = safeTopicFileName(topic);
  return {
    notePath: `${TOPIC_WORKSPACE_ROOT}/${name}.md`,
    basePath: `${TOPIC_WORKSPACE_ROOT}/${name}.base`,
  };
}

export function researchTopicWorkspacePaths(theme: string, topic: string): { notePath: string; basePath: string } {
  const themeName = safeTopicFileName(theme);
  const topicName = safeTopicFileName(topic);
  return {
    notePath: `${RESEARCH_TOPIC_WORKSPACE_ROOT}/${themeName}/${topicName}.md`,
    basePath: `${RESEARCH_TOPIC_WORKSPACE_ROOT}/${themeName}/${topicName}.base`,
  };
}

export function inferPDSAStage(type: string, status: string): PDSAStage {
  if (type === "知识循环" || type === "主题空间") return "P";
  if (["知识笔记", "随手笔记", "复盘"].includes(type)) return "S";
  if (type === "内容输出") return "A";
  if (["项目笔记", "行动"].includes(type)) {
    return ["已完成", "已发布", "已复盘", "已归档"].includes(status) ? "A" : "D";
  }
  return "D";
}

interface TopicAccumulator {
  name: string;
  domainCounts: Map<string, number>;
  documents: KnowledgeThemeDocument[];
  workspace?: PropertyNoteSnapshot;
}

function normalizeSourcePath(value: string): string {
  const match = /^\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]$/.exec(value.trim());
  const path = (match?.[1] ?? value).trim().replace(/^\/+/, "");
  return path && !/\.md$/i.test(path) ? `${path}.md` : path;
}

export function buildKnowledgeThemes(
  snapshots: PropertyNoteSnapshot[],
  settings: PropertySystemSettings,
): { themes: KnowledgeThemeSummary[]; documents: KnowledgeThemeDocument[]; unassignedFiles: number } {
  const byPath = new Map(snapshots.map((snapshot) => [snapshot.path, snapshot]));
  const accumulators = new Map<string, TopicAccumulator>();
  const allDocuments: KnowledgeThemeDocument[] = [];
  let unassignedFiles = 0;

  for (const snapshot of snapshots) {
    if (!isPropertyGovernedPath(snapshot.path, settings)) continue;
    const topics = normalizedValues(snapshot.frontmatter?.主题);
    const domains = normalizedValues(snapshot.frontmatter?.领域);
    const type = typeof snapshot.frontmatter?.类型 === "string" ? snapshot.frontmatter.类型.trim() : "";
    const status = typeof snapshot.frontmatter?.状态 === "string" ? snapshot.frontmatter.状态.trim() : "";
    const document: KnowledgeThemeDocument = {
      path: snapshot.path,
      basename: snapshot.basename,
      type,
      status,
      domains,
      topics,
      stage: inferPDSAStage(type, status),
      modifiedAt: snapshot.mtime ?? 0,
    };
    allDocuments.push(document);
    if (!topics.length) {
      unassignedFiles += 1;
      continue;
    }
    for (const topic of topics) {
      const key = topic.toLocaleLowerCase();
      const accumulator = accumulators.get(key) ?? {
        name: topic,
        domainCounts: new Map<string, number>(),
        documents: [],
      };
      accumulator.documents.push(document);
      for (const domain of domains) {
        accumulator.domainCounts.set(domain, (accumulator.domainCounts.get(domain) ?? 0) + 1);
      }
      accumulators.set(key, accumulator);
    }
  }

  for (const snapshot of snapshots) {
    if (snapshot.frontmatter?.knowgrove_topic_workspace !== true) continue;
    const configuredName = typeof snapshot.frontmatter.主题名称 === "string"
      ? snapshot.frontmatter.主题名称.trim()
      : snapshot.basename;
    if (!configuredName) continue;
    const key = configuredName.toLocaleLowerCase();
    const accumulator = accumulators.get(key) ?? {
      name: configuredName,
      domainCounts: new Map<string, number>(),
      documents: [],
    };
    accumulator.workspace = snapshot;
    for (const domain of normalizedValues(snapshot.frontmatter.领域)) {
      accumulator.domainCounts.set(domain, Math.max(1, accumulator.domainCounts.get(domain) ?? 0));
    }
    accumulators.set(key, accumulator);
  }

  const researchTopicsByTheme = new Map<string, KnowledgeResearchTopicSummary[]>();
  for (const snapshot of snapshots) {
    if (snapshot.frontmatter?.knowgrove_research_topic !== true) continue;
    const name = typeof snapshot.frontmatter.课题名称 === "string"
      ? snapshot.frontmatter.课题名称.trim()
      : snapshot.basename;
    const parentThemeName = normalizeKnowledgeTopic(typeof snapshot.frontmatter.上级主题 === "string"
      ? snapshot.frontmatter.上级主题
      : strings(snapshot.frontmatter.主题)[0] ?? "");
    if (!name || !parentThemeName) continue;
    const hasExplicitSources = Object.prototype.hasOwnProperty.call(snapshot.frontmatter, "资料范围");
    const explicitSourcePaths = hasExplicitSources
      ? strings(snapshot.frontmatter.资料范围).map(normalizeSourcePath).filter(Boolean)
      : [];
    const explicitSet = new Set(explicitSourcePaths);
    const inferredDocuments = allDocuments.filter((document) => document.topics.some((topic) => topic === name));
    const documents = (hasExplicitSources
      ? allDocuments.filter((document) => explicitSet.has(document.path))
      : inferredDocuments).sort((left, right) => right.modifiedAt - left.modifiedAt);
    const coreQuestion = typeof snapshot.frontmatter.核心问题 === "string"
      ? snapshot.frontmatter.核心问题.trim()
      : name;
    const domains = normalizedValues(snapshot.frontmatter.领域);
    const persistedCandidatePaths = strings(snapshot.frontmatter.候选资料).map(normalizeSourcePath).filter(Boolean);
    const persistedCandidateSet = new Set(persistedCandidatePaths);
    const rankedCandidates = rankResearchTopicSourceCandidates({
      name,
      coreQuestion,
      parentThemeName,
      domains,
    }, allDocuments);
    const candidateDocuments = Array.from(new Map([
      ...documents,
      ...(persistedCandidatePaths.length
        ? allDocuments.filter((document) => persistedCandidateSet.has(document.path))
        : rankedCandidates),
    ].map((document) => [document.path, document])).values());
    const paths = researchTopicWorkspacePaths(parentThemeName, name);
    const topic: KnowledgeResearchTopicSummary = {
      name,
      coreQuestion,
      parentThemeName,
      domains,
      total: documents.length,
      fixed: true,
      workspaceExists: true,
      workspacePath: snapshot.path,
      basePath: snapshot.path.replace(/\.md$/i, ".base") || paths.basePath,
      explicitSourcePaths,
      documents,
      candidateDocuments,
    };
    const key = parentThemeName.toLocaleLowerCase();
    researchTopicsByTheme.set(key, [...(researchTopicsByTheme.get(key) ?? []), topic]);
  }

  const themes = Array.from(accumulators.values()).map((accumulator): KnowledgeThemeSummary => {
    const paths = topicWorkspacePaths(accumulator.name);
    const workspace = accumulator.workspace ?? byPath.get(paths.notePath);
    const parentName = normalizeKnowledgeTopic(typeof workspace?.frontmatter?.上级主题 === "string"
      ? workspace.frontmatter.上级主题
      : "") || undefined;
    const configuredStage = typeof workspace?.frontmatter?.当前阶段 === "string"
      ? workspace.frontmatter.当前阶段.trim() as PDSAStage
      : undefined;
    const currentStage = configuredStage && VALID_STAGES.has(configuredStage) ? configuredStage : "P";
    const inferredDocuments = [...accumulator.documents].sort((left, right) => right.modifiedAt - left.modifiedAt);
    const hasExplicitSources = Boolean(workspace?.frontmatter)
      && Object.prototype.hasOwnProperty.call(workspace?.frontmatter, "资料范围");
    const explicitSourcePaths = hasExplicitSources
      ? strings(workspace?.frontmatter?.资料范围).map(normalizeSourcePath).filter(Boolean)
      : [];
    const explicitSet = new Set(explicitSourcePaths);
    const documents = hasExplicitSources
      ? allDocuments.filter((document) => explicitSet.has(document.path)).sort((left, right) => right.modifiedAt - left.modifiedAt)
      : inferredDocuments;
    const stageCounts: Record<PDSAStage, number> = { P: workspace ? 1 : 0, D: 0, S: 0, A: 0 };
    for (const document of documents) stageCounts[document.stage] += 1;
    const domains = Array.from(accumulator.domainCounts.entries())
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "zh-CN"))
      .map(([domain]) => domain);
    const realResearchTopics = researchTopicsByTheme.get(accumulator.name.toLocaleLowerCase()) ?? [];
    const realNames = new Set(realResearchTopics.map((topic) => topic.name.toLocaleLowerCase()));
    const legacyResearchTopics = normalizedValues(workspace?.frontmatter?.研究课题)
      .filter((question) => !realNames.has(question.toLocaleLowerCase()))
      .map((question): KnowledgeResearchTopicSummary => {
        const topicPaths = researchTopicWorkspacePaths(accumulator.name, question);
        return {
          name: question,
          coreQuestion: question,
          parentThemeName: accumulator.name,
          domains,
          total: 0,
          fixed: true,
          workspaceExists: false,
          workspacePath: topicPaths.notePath,
          basePath: topicPaths.basePath,
          explicitSourcePaths: [],
          documents: [],
          candidateDocuments: rankResearchTopicSourceCandidates({
            name: question,
            coreQuestion: question,
            parentThemeName: accumulator.name,
            domains,
          }, allDocuments),
        };
      });
    const researchTopics = [...realResearchTopics, ...legacyResearchTopics]
      .sort((left, right) => right.total - left.total || left.name.localeCompare(right.name, "zh-CN"));
    return {
      name: accumulator.name,
      parentName,
      domains,
      total: documents.length,
      stageCounts,
      currentStage,
      fixed: Boolean(workspace),
      workspaceExists: Boolean(workspace),
      workspacePath: paths.notePath,
      basePath: paths.basePath,
      researchQuestions: normalizedValues(workspace?.frontmatter?.研究课题),
      researchTopics,
      explicitSourcePaths,
      documents,
      suggestedDocuments: inferredDocuments.filter((document) => !documents.some((selected) => selected.path === document.path)),
    };
  }).sort((left, right) => Number(right.fixed) - Number(left.fixed) || right.total - left.total || left.name.localeCompare(right.name, "zh-CN"));

  return { themes, documents: allDocuments.sort((left, right) => right.modifiedAt - left.modifiedAt), unassignedFiles };
}

export function buildKnowledgeDomainTree(themes: KnowledgeThemeSummary[]): KnowledgeDomainSummary[] {
  const byDomain = new Map<string, KnowledgeThemeSummary[]>();
  for (const theme of themes.filter((candidate) => candidate.fixed)) {
    const domain = theme.domains[0]?.trim() || "待确认领域";
    byDomain.set(domain, [...(byDomain.get(domain) ?? []), theme]);
  }
  return Array.from(byDomain.entries()).map(([name, domainThemes]) => ({
    name,
    total: new Set(domainThemes.flatMap((theme) => theme.documents.map((document) => document.path))).size,
    themes: domainThemes.sort((left, right) => right.total - left.total || left.name.localeCompare(right.name, "zh-CN")),
  })).sort((left, right) => right.total - left.total || left.name.localeCompare(right.name, "zh-CN"));
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

function pathFilterLines(documents: KnowledgeThemeDocument[]): string[] {
  if (!documents.length) return [yamlSingleQuoted("false")];
  if (documents.length === 1) {
    return [yamlSingleQuoted(`file.path == "${formulaString(documents[0]?.path ?? "")}"`)];
  }
  return [
    "or:",
    ...documents.map((document) => `  - ${yamlSingleQuoted(`file.path == "${formulaString(document.path)}"`)}`),
  ];
}

function appendThemeView(lines: string[], name: string, documents: KnowledgeThemeDocument[]): void {
  lines.push(
    "  - type: table",
    `    name: ${yamlDoubleQuoted(name)}`,
    "    filters:",
    ...pathFilterLines(documents).map((line) => `      ${line}`),
    "    groupBy:",
    "      property: \"类型\"",
    "      direction: ASC",
    "    order:",
    "      - \"file.name\"",
    "      - \"类型\"",
    "      - \"状态\"",
    "      - \"阅读状态\"",
    "      - \"领域\"",
    "      - \"主题\"",
    "      - \"file.mtime\"",
    "    sort:",
    "      - property: file.mtime",
    "        direction: DESC",
  );
}

export function buildKnowledgeThemeBase(theme: KnowledgeThemeSummary): string {
  const lines = [
    "filters:",
    "  and:",
    `    - ${yamlSingleQuoted('file.ext == "md"')}`,
    "formulas:",
    `  knowgrove_topic_base: ${yamlSingleQuoted('"1.2.0"')}`,
    "properties:",
    "  file.name:",
    "    displayName: \"笔记\"",
    "  file.mtime:",
    "    displayName: \"最近修改\"",
    "  \"类型\":",
    "    displayName: \"内容角色\"",
    "  \"状态\":",
    "    displayName: \"状态\"",
    "  \"领域\":",
    "    displayName: \"领域\"",
    "  \"主题\":",
    "    displayName: \"主题\"",
    "views:",
  ];
  appendThemeView(lines, "研究资料", theme.documents);
  appendThemeView(lines, "D · 资料与实践", theme.documents.filter((document) => document.stage === "D"));
  appendThemeView(lines, "S · 研究与沉淀", theme.documents.filter((document) => document.stage === "S"));
  appendThemeView(lines, "A · 应用与输出", theme.documents.filter((document) => document.stage === "A"));
  appendThemeView(lines, "全部相关资料", theme.documents);
  return `${TOPIC_BASE_MANAGED_MARKER}\n${lines.join("\n")}\n`;
}

export function isManagedKnowledgeThemeBase(content: string): boolean {
  if (content.startsWith(TOPIC_BASE_MANAGED_MARKER)) return true;
  if (/^\s*knowgrove_topic_base:\s*/m.test(content)) return true;
  return /name:\s*["']?D · 资料与实践["']?/.test(content)
    && /name:\s*["']?S · 研究与沉淀["']?/.test(content)
    && /name:\s*["']?A · 应用与输出["']?/.test(content)
    && /name:\s*["']?全部相关资料["']?/.test(content);
}

function yamlList(name: string, values: string[]): string[] {
  if (!values.length) return [`${name}: []`];
  return [`${name}:`, ...values.map((value) => `  - ${yamlDoubleQuoted(value)}`)];
}

export function buildKnowledgeThemeNote(theme: KnowledgeThemeSummary, now = new Date()): string {
  const date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
  return [
    "---",
    `文件名: ${yamlDoubleQuoted(theme.name)}`,
    "类型: 主题空间",
    "状态: 进行中",
    ...yamlList("领域", theme.domains.slice(0, 2)),
    `主题名称: ${yamlDoubleQuoted(theme.name)}`,
    ...(theme.parentName ? [`上级主题: ${yamlDoubleQuoted(theme.parentName)}`] : []),
    "固定主题: true",
    ...yamlList("研究课题", theme.researchQuestions),
    "当前阶段: P",
    "循环轮次: 1",
    `创建时间: ${date}`,
    "knowgrove_topic_workspace: true",
    "---",
    "",
    `# ${theme.name}`,
    "",
    "> [!abstract] 主题空间",
    "> 围绕这个主题持续收集证据、研究命题并形成可复用输出。PDSA 阶段由这篇文档承载，原始资料保持在原位置。",
    "",
    "## P · 研究计划",
    "",
    "### 研究目标",
    "",
    "- [ ] 写下这一轮真正想弄明白的问题",
    "",
    "### 研究维度",
    "",
    "- [ ] 使用“AI 整理主题”生成建议，再保留真正需要研究的维度",
    "- 也可以从工作台的主题设置中直接添加自己的研究课题",
    "",
    "### 成功标准",
    "",
    "- [ ] 至少形成一条有证据支持、可用于行动或输出的结论",
    "",
    "## D · 资料与实践",
    "",
    "### 本次研究资料",
    "",
    `![[${theme.basePath}#研究资料]]`,
    "",
    "主题设置中可以选择 1 篇或多篇资料。AI 只分析这里选中的资料，并在结论后保留来源链接。",
    "",
    `![[${theme.basePath}#D · 资料与实践]]`,
    "",
    "阅读资料时，可以使用评论侧栏把关键区块添加到本主题的“已确认知识”或具体命题下。",
    "",
    "## S · 研究与沉淀",
    "",
    "### 已确认知识",
    "",
    "这里由你保留已经认可的子主题、命题、证据和结论。AI 建议不会覆盖这一部分。",
    "",
    TOPIC_SYNTHESIS_START,
    "> [!info] AI 研究建议",
    "> 尚未整理。回到插件工作台，点击主题右侧的 AI 图标生成建议。",
    TOPIC_SYNTHESIS_END,
    "",
    `![[${theme.basePath}#S · 研究与沉淀]]`,
    "",
    "## A · 应用与输出",
    "",
    "### 内部应用",
    "",
    "- 决策、SOP、项目动作或下一轮实验",
    "",
    "### 对外输出",
    "",
    "- 文章、视频、报告或其他可交付内容",
    "",
    `![[${theme.basePath}#A · 应用与输出]]`,
    "",
    "## 下一轮",
    "",
    "当本轮形成结论后，把仍未解决的问题写在这里，作为下一轮 P 的输入。",
    "",
  ].join("\n");
}

export function buildKnowledgeResearchTopicBase(topic: KnowledgeResearchTopicSummary): string {
  const candidates = topic.candidateDocuments.length ? topic.candidateDocuments : topic.documents;
  const themeLike: KnowledgeThemeSummary = {
    name: topic.name,
    domains: topic.domains,
    total: topic.total,
    stageCounts: { P: 1, D: 0, S: 0, A: 0 },
    currentStage: "P",
    fixed: true,
    workspaceExists: topic.workspaceExists,
    workspacePath: topic.workspacePath,
    basePath: topic.basePath,
    researchQuestions: [topic.coreQuestion],
    researchTopics: [],
    explicitSourcePaths: topic.explicitSourcePaths,
    documents: candidates,
    suggestedDocuments: [],
  };
  for (const document of candidates) themeLike.stageCounts[document.stage] += 1;
  const lines = buildKnowledgeThemeBase(themeLike).split("\n");
  const viewsIndex = lines.indexOf("views:");
  if (viewsIndex >= 0) {
    const selectedView: string[] = [];
    appendThemeView(selectedView, "已采用资料", topic.documents);
    lines.splice(viewsIndex + 1, 0, ...selectedView);
  }
  return lines.join("\n").replace(
    'knowgrove_topic_base: \'"1.2.0"\'',
    'knowgrove_research_topic_base: \'"1.2.0"\'',
  ).replace('name: "研究资料"', 'name: "相关候选"');
}

export function buildKnowledgeResearchTopicNote(topic: KnowledgeResearchTopicSummary, now = new Date()): string {
  const date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
  const themePath = topicWorkspacePaths(topic.parentThemeName).notePath.replace(/\.md$/i, "");
  return [
    "---",
    `文件名: ${yamlDoubleQuoted(topic.name)}`,
    "类型: 研究课题",
    "状态: 研究中",
    ...yamlList("领域", topic.domains.slice(0, 2)),
    `课题名称: ${yamlDoubleQuoted(topic.name)}`,
    `核心问题: ${yamlDoubleQuoted(topic.coreQuestion || topic.name)}`,
    `上级主题: ${yamlDoubleQuoted(`[[${themePath}]]`)}`,
    `创建时间: ${date}`,
    "knowgrove_research_topic: true",
    "---",
    "",
    `# ${topic.name}`,
    "",
    `> [!question] 核心问题\n> ${topic.coreQuestion || topic.name}`,
    "",
    `上级主题：[[${themePath}|${topic.parentThemeName}]]`,
    "",
    RESEARCH_TOPIC_ACTIONS_BLOCK,
    "",
    "## 资料摘录",
    "",
    "从左侧资料中选中文字后，使用上方“引用左侧选区”按钮；这里会插入保持同步的原生块引用。",
    "",
    "## 已确认知识",
    "",
    "把阅读中确认的证据、命题和结论沉淀在这里。资料原文保持在原位置，并使用 Wikilink 追溯。",
    "",
    "## 待验证命题",
    "",
    "- [ ] ",
    "",
    "## 输出方向",
    "",
    "- ",
    "",
    RESEARCH_SOURCES_HEADING,
    "",
    "在这里判断资料是否真正属于当前课题。点击标题会在左侧替换打开；标记为不相关后将不再展示。",
    "",
    RESEARCH_SOURCES_BLOCK,
    "",
  ].join("\n");
}

export function ensureResearchTopicActions(content: string): string {
  if (content.includes(RESEARCH_TOPIC_ACTIONS_BLOCK)) return content;
  const firstSection = /^##\s+/m.exec(content);
  const insertion = firstSection?.index ?? content.length;
  const before = content.slice(0, insertion).trimEnd();
  const after = content.slice(insertion).trimStart();
  return `${before}\n\n${RESEARCH_TOPIC_ACTIONS_BLOCK}\n\n${after}${content.endsWith("\n") ? "\n" : ""}`;
}

export interface ThemeSynthesisPromptSource {
  path: string;
  title: string;
  type: string;
  status: string;
  content: string;
}

export function buildThemeSynthesisPrompt(theme: KnowledgeThemeSummary, sources: ThemeSynthesisPromptSource[]): string {
  return [
    "你是 KnowGrove 的主题研究架构师。只分析提供的资料，不调用工具、不搜索网络、不修改文件。",
    `主题：${theme.name}`,
    `领域：${theme.domains.join("、") || "尚未确定"}`,
    `用户设定的研究课题：${theme.researchQuestions.join("；") || "尚未设定，请从资料中建议"}`,
    "目标：把分散资料整理为人类可读的研究结构，而不是生成百科式摘要。",
    "必须严格区分：研究维度=看问题的角度；命题=可被证据支持或反驳的判断；证据=输入资料的精确路径；输出方向=基于已整理知识可形成的成果。",
    "硬性规则：",
    "1. 只返回 JSON，不要 Markdown 或额外解释。",
    "2. 格式为 {\"summary\":\"主题现状\",\"dimensions\":[{\"name\":\"子主题\",\"question\":\"研究问题\"}],\"propositions\":[{\"title\":\"命题\",\"status\":\"待验证|有证据|存在争议\",\"evidencePaths\":[\"原样路径\"]}],\"gaps\":[\"待研究问题\"],\"outputs\":[{\"title\":\"输出标题\",\"format\":\"文章|SOP|决策|报告|项目动作\",\"angle\":\"使用角度\"}]}。",
    "3. evidencePaths 只能使用输入中逐字一致的 path；没有证据的命题必须标为待验证。",
    "4. 最多 8 个研究维度、15 个命题、8 个缺口、6 个输出方向；避免空泛概念和重复表达。",
    "5. 不把模型推断写成事实，不虚构来源、数据、作者或结论。",
    "6. 返回前检查 JSON 语法；字符串中的双引号必须转义，数组元素之间必须有逗号，禁止尾随逗号。",
    `资料：${JSON.stringify(sources)}`,
  ].join("\n");
}

export function buildThemeSynthesisRepairPrompt(raw: string): string {
  return [
    "你是 JSON 修复器。下面是另一个模型返回的主题研究结构，内容可能有 JSON 语法错误。",
    "只修复语法，不增加事实、不补充证据、不改写路径；无法修复的单个条目可以删除。",
    "只返回一个可被 JSON.parse 解析的 JSON 对象，不要 Markdown 代码围栏或解释。",
    "必须保留这些顶层键：summary、dimensions、propositions、gaps、outputs。",
    "字符串内的双引号必须转义，数组元素之间必须有逗号，禁止尾随逗号。",
    `待修复内容：${raw.trim().slice(0, 16_000)}`,
  ].join("\n");
}

export function rankThemeSourceCandidates(
  theme: Pick<KnowledgeThemeSummary, "name" | "domains" | "researchQuestions">,
  candidates: KnowledgeThemeDocument[],
  limit = 120,
): KnowledgeThemeDocument[] {
  const name = theme.name.toLocaleLowerCase();
  const domains = new Set(theme.domains.map((domain) => domain.toLocaleLowerCase()));
  const queryText = `${theme.name} ${theme.researchQuestions.join(" ")}`.toLocaleLowerCase();
  return [...candidates].sort((left, right) => {
    const score = (document: KnowledgeThemeDocument): number => {
      let value = 0;
      if (document.topics.some((topic) => topic.toLocaleLowerCase() === name)) value += 30;
      if (`${document.basename} ${document.topics.join(" ")}`.toLocaleLowerCase().includes(name)) value += 12;
      value += document.domains.filter((domain) => domains.has(domain.toLocaleLowerCase())).length * 6;
      for (const question of theme.researchQuestions) {
        const keywords = question.split(/[\s，。！？、：；,.:;!?（）()]+/).filter((word) => word.length >= 2);
        const text = `${document.basename} ${document.topics.join(" ")} ${document.domains.join(" ")}`;
        value += keywords.filter((keyword) => text.includes(keyword)).length * 2;
      }
      if (queryText.includes(document.basename.toLocaleLowerCase())) value += 3;
      return value;
    };
    return score(right) - score(left) || right.modifiedAt - left.modifiedAt;
  }).slice(0, Math.max(1, limit));
}

export function researchTopicKeywords(value: string): string[] {
  const words = value.toLocaleLowerCase()
    .split(/[\s，。！？、：；,.:;!?（）()【】\[\]“”"'—_/]+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2);
  const compact = value.toLocaleLowerCase().replace(/[\s，。！？、：；,.:;!?（）()【】\[\]“”"'—_/]+/g, "");
  const chunks = compact.length >= 4
    ? Array.from({ length: Math.min(12, compact.length - 1) }, (_, index) => compact.slice(index, index + 2))
    : [];
  return Array.from(new Set([...words, ...chunks]));
}

export function rankResearchTopicSourceCandidates(
  topic: Pick<KnowledgeResearchTopicSummary, "name" | "coreQuestion" | "parentThemeName" | "domains">,
  candidates: KnowledgeThemeDocument[],
  limit = 80,
): KnowledgeThemeDocument[] {
  const topicName = topic.name.toLocaleLowerCase();
  const parentName = topic.parentThemeName.toLocaleLowerCase();
  const domains = new Set(topic.domains.map((domain) => domain.toLocaleLowerCase()));
  const keywords = researchTopicKeywords(`${topic.name} ${topic.coreQuestion}`);
  const scored = candidates.map((document) => {
    const title = document.basename.toLocaleLowerCase();
    const topics = document.topics.map((value) => value.toLocaleLowerCase());
    const text = `${title} ${topics.join(" ")} ${document.domains.join(" ")}`.toLocaleLowerCase();
    let score = 0;
    if (topics.includes(topicName)) score += 60;
    if (title.includes(topicName) || topicName.includes(title)) score += 36;
    if (topics.includes(parentName)) score += 18;
    if (title.includes(parentName)) score += 12;
    score += document.domains.filter((domain) => domains.has(domain.toLocaleLowerCase())).length * 4;
    score += keywords.filter((keyword) => text.includes(keyword)).length * 3;
    return { document, score };
  });
  return scored
    .filter((item) => item.score >= 10)
    .sort((left, right) => right.score - left.score || right.document.modifiedAt - left.document.modifiedAt)
    .slice(0, Math.max(1, limit))
    .map((item) => item.document);
}

export function buildThemePlanningPrompt(
  theme: Pick<KnowledgeThemeSummary, "name" | "domains" | "researchQuestions">,
  candidates: KnowledgeThemeDocument[],
): string {
  const metadata = candidates.map((document) => ({
    path: document.path,
    title: document.basename,
    type: document.type,
    domains: document.domains,
    topics: document.topics,
  }));
  return [
    "你是 KnowGrove 的研究主题规划器。只根据给定的标题和属性判断相关性，不搜索网络、不虚构文档内容。",
    `一级主题：${theme.name}`,
    `领域：${theme.domains.join("、") || "尚未确定"}`,
    `用户已有课题：${theme.researchQuestions.join("；") || "尚未填写"}`,
    "请建议最多 6 个清晰、互不重复的研究课题，并推荐最多 12 篇与课题直接相关的资料。单篇或多篇都可以，不为了凑数而选择。",
    "只返回 JSON：{\"questions\":[\"研究课题\"],\"sources\":[{\"path\":\"输入中的精确路径\",\"reason\":\"一句话相关性理由\"}]}。",
    "path 必须逐字来自候选资料；相关性不足的资料不要返回。返回前检查 JSON 语法。",
    `候选资料：${JSON.stringify(metadata)}`,
  ].join("\n");
}

export function buildResearchTopicPlanningPrompt(
  topic: Pick<KnowledgeResearchTopicSummary, "name" | "coreQuestion" | "parentThemeName" | "domains">,
  candidates: KnowledgeThemeDocument[],
): string {
  const metadata = candidates.map((document) => ({
    path: document.path,
    title: document.basename,
    type: document.type,
    domains: document.domains,
    topics: document.topics,
  }));
  return [
    "你是 KnowGrove 的课题资料发现器。只根据给定的全库标题和属性判断相关性，不搜索网络、不虚构文档内容。",
    `上级主题：${topic.parentThemeName}`,
    `具体课题：${topic.name}`,
    `核心问题：${topic.coreQuestion}`,
    `领域：${topic.domains.join("、") || "尚未确定"}`,
    "目标是找出所有可能对该课题有直接研究价值的资料，而不是只找标题完全相同的文档。最多推荐 12 篇；相关性不足时少选。",
    "只返回 JSON：{\"questions\":[],\"sources\":[{\"path\":\"输入中的精确路径\",\"reason\":\"与课题的具体关系\"}]}。",
    "path 必须逐字来自候选资料；返回前检查 JSON 语法。",
    `全库候选：${JSON.stringify(metadata)}`,
  ].join("\n");
}

export function parseThemePlanningResponse(raw: string, allowedPaths: string[]): ThemePlanningProposal {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(extractJsonObject(raw)) as Record<string, unknown>;
  } catch {
    parsed = {
      questions: jsonStrings(fieldArraySection(raw, "questions", "sources")),
      sources: completeObjectFragments(fieldArraySection(raw, "sources")),
    };
  }
  const allowed = new Set(allowedPaths);
  const questions = Array.from(new Set((Array.isArray(parsed.questions) ? parsed.questions : [])
    .map((value) => cleanText(value, 160))
    .filter((value): value is string => Boolean(value)))).slice(0, 6);
  const sources = (Array.isArray(parsed.sources) ? parsed.sources : []).flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const item = candidate as Record<string, unknown>;
    const path = typeof item.path === "string" && allowed.has(item.path) ? item.path : undefined;
    const reason = cleanText(item.reason, 180);
    return path && reason ? [{ path, reason }] : [];
  }).filter((item, index, array) => array.findIndex((candidate) => candidate.path === item.path) === index).slice(0, 12);
  if (!questions.length && !sources.length) throw new Error("模型没有返回可用的课题或资料建议");
  return { questions, sources };
}

function extractJsonObject(raw: string): string {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  for (let start = 0; start < trimmed.length; start += 1) {
    if (trimmed[start] !== "{") continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < trimmed.length; index += 1) {
      const character = trimmed[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') inString = true;
      else if (character === "{") depth += 1;
      else if (character === "}") {
        depth -= 1;
        if (depth === 0) return trimmed.slice(start, index + 1);
      }
    }
  }
  throw new Error("模型没有返回可解析的 JSON 对象");
}

function cleanText(value: unknown, maximum = 160): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.trim().replace(/[\r\n]+/g, " ").slice(0, maximum);
  return cleaned || undefined;
}

function fieldArraySection(raw: string, key: string, nextKey?: string): string {
  const keyIndex = raw.indexOf(`"${key}"`);
  if (keyIndex < 0) return "";
  const start = raw.indexOf("[", keyIndex);
  if (start < 0) return "";
  const next = nextKey ? raw.indexOf(`"${nextKey}"`, start + 1) : -1;
  return raw.slice(start + 1, next >= 0 ? next : raw.length);
}

function completeObjectFragments(section: string): Record<string, unknown>[] {
  const objects: Record<string, unknown>[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < section.length; index += 1) {
    const character = section[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (character === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        try {
          const parsed = JSON.parse(section.slice(start, index + 1)) as unknown;
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) objects.push(parsed as Record<string, unknown>);
        } catch {
          // Keep the valid complete entries even if one model-generated entry is malformed.
        }
        start = -1;
      }
    }
  }
  return objects;
}

function jsonStrings(section: string): string[] {
  const values: string[] = [];
  for (const match of section.matchAll(/"((?:\\.|[^"\\])*)"/g)) {
    try {
      values.push(JSON.parse(`"${match[1] ?? ""}"`) as string);
    } catch {
      // Ignore an incomplete trailing string from a truncated CLI response.
    }
  }
  return values;
}

function looselyParseThemeSynthesis(raw: string): Record<string, unknown> {
  const summaryMatch = /"summary"\s*:\s*"((?:\\.|[^"\\])*)"/.exec(raw);
  let summary: string | undefined;
  if (summaryMatch?.[1] !== undefined) {
    try {
      summary = JSON.parse(`"${summaryMatch[1]}"`) as string;
    } catch {
      summary = undefined;
    }
  }
  return {
    summary,
    dimensions: completeObjectFragments(fieldArraySection(raw, "dimensions", "propositions")),
    propositions: completeObjectFragments(fieldArraySection(raw, "propositions", "gaps")),
    gaps: jsonStrings(fieldArraySection(raw, "gaps", "outputs")),
    outputs: completeObjectFragments(fieldArraySection(raw, "outputs")),
  };
}

export function parseThemeSynthesisResponse(raw: string, allowedPaths: string[]): ThemeSynthesisProposal {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(extractJsonObject(raw)) as Record<string, unknown>;
    const hasThemeArrays = [parsed.dimensions, parsed.propositions, parsed.gaps, parsed.outputs]
      .some((value) => Array.isArray(value));
    if (!hasThemeArrays) parsed = looselyParseThemeSynthesis(raw);
  } catch (error) {
    parsed = looselyParseThemeSynthesis(raw);
    const recoveredCount = [parsed.dimensions, parsed.propositions, parsed.gaps, parsed.outputs]
      .map((value) => Array.isArray(value) ? value.length : 0)
      .reduce((count, length) => count + length, 0);
    if (!recoveredCount) throw error;
  }
  const allowed = new Set(allowedPaths);
  const dimensions = (Array.isArray(parsed.dimensions) ? parsed.dimensions : []).flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const item = candidate as Record<string, unknown>;
    const name = cleanText(item.name, 60);
    const question = cleanText(item.question, 180);
    return name && question ? [{ name, question }] : [];
  }).slice(0, 8);
  const propositions = (Array.isArray(parsed.propositions) ? parsed.propositions : []).flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const item = candidate as Record<string, unknown>;
    const title = cleanText(item.title, 220);
    if (!title) return [];
    const evidencePaths = Array.from(new Set((Array.isArray(item.evidencePaths) ? item.evidencePaths : [])
      .filter((path): path is string => typeof path === "string" && allowed.has(path)))).slice(0, 8);
    const requestedStatus = cleanText(item.status, 20);
    const status = evidencePaths.length
      ? requestedStatus === "存在争议" ? "存在争议" : "有证据"
      : "待验证";
    return [{ title, status: status as "待验证" | "有证据" | "存在争议", evidencePaths }];
  }).slice(0, 15);
  const gaps = Array.from(new Set((Array.isArray(parsed.gaps) ? parsed.gaps : [])
    .map((value) => cleanText(value, 180)).filter((value): value is string => Boolean(value)))).slice(0, 8);
  const outputs = (Array.isArray(parsed.outputs) ? parsed.outputs : []).flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const item = candidate as Record<string, unknown>;
    const title = cleanText(item.title, 160);
    const format = cleanText(item.format, 30);
    const angle = cleanText(item.angle, 180);
    return title && format && angle ? [{ title, format, angle }] : [];
  }).slice(0, 6);
  const summary = cleanText(parsed.summary, 360) ?? "AI 已根据当前资料生成研究结构建议。";
  if (!dimensions.length && !propositions.length && !gaps.length && !outputs.length) {
    throw new Error("模型返回中没有可用的主题研究结构");
  }
  return { summary, dimensions, propositions, gaps, outputs };
}

function wikiPath(path: string): string {
  return path.replace(/\.md$/i, "");
}

export function renderThemeSynthesis(proposal: ThemeSynthesisProposal): string {
  const lines = [TOPIC_SYNTHESIS_START, "> [!info] AI 研究建议（待确认）", `> ${proposal.summary}`, ""];
  if (proposal.dimensions.length) {
    lines.push("### AI 建议的研究维度", "");
    for (const item of proposal.dimensions) lines.push(`- **${item.name}**：${item.question}`);
    lines.push("");
  }
  if (proposal.propositions.length) {
    lines.push("### 命题候选", "");
    for (const item of proposal.propositions) {
      const evidence = item.evidencePaths.length
        ? ` · 证据：${item.evidencePaths.map((path) => `[[${wikiPath(path)}]]`).join("、")}`
        : "";
      lines.push(`- [ ] ${item.title}（${item.status}）${evidence}`);
    }
    lines.push("");
  }
  if (proposal.gaps.length) {
    lines.push("### 待研究问题", "", ...proposal.gaps.map((gap) => `- [ ] ${gap}`), "");
  }
  if (proposal.outputs.length) {
    lines.push("### 可形成的应用与输出", "");
    for (const item of proposal.outputs) lines.push(`- **${item.title}**（${item.format}）：${item.angle}`);
    lines.push("");
  }
  lines.push(TOPIC_SYNTHESIS_END);
  return lines.join("\n");
}

export function mergeThemeSynthesis(content: string, proposal: ThemeSynthesisProposal): string {
  const block = renderThemeSynthesis(proposal);
  const start = content.indexOf(TOPIC_SYNTHESIS_START);
  const end = content.indexOf(TOPIC_SYNTHESIS_END);
  if (start >= 0 && end >= start) {
    return `${content.slice(0, start)}${block}${content.slice(end + TOPIC_SYNTHESIS_END.length)}`;
  }
  const actHeading = content.indexOf("\n## A · 应用与输出");
  if (actHeading >= 0) return `${content.slice(0, actHeading).trimEnd()}\n\n${block}\n${content.slice(actHeading)}`;
  return `${content.trimEnd()}\n\n## S · 研究与沉淀\n\n${block}\n`;
}

export function ensureThemeDimensionHeadings(content: string, proposal: ThemeSynthesisProposal): string {
  const existing = new Set(
    Array.from(content.matchAll(/^#{2,6}\s+(.+?)\s*$/gm), (match) => match[1]?.trim().toLocaleLowerCase("zh-CN")),
  );
  const additions = proposal.dimensions
    .filter((dimension) => !existing.has(dimension.name.trim().toLocaleLowerCase("zh-CN")))
    .map((dimension) => `### ${dimension.name}\n\n> 研究问题：${dimension.question}\n\n在这里沉淀人工确认的结论、评论引用与证据。`);
  if (!additions.length) return content;

  const marker = content.indexOf(TOPIC_SYNTHESIS_START);
  const insertion = `\n\n${additions.join("\n\n")}\n`;
  if (marker >= 0) return `${content.slice(0, marker).trimEnd()}${insertion}\n${content.slice(marker)}`;

  const actHeading = content.indexOf("\n## A · 应用与输出");
  if (actHeading >= 0) return `${content.slice(0, actHeading).trimEnd()}${insertion}${content.slice(actHeading)}`;
  return `${content.trimEnd()}${insertion}`;
}
