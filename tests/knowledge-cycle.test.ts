import assert from "node:assert/strict";
import test from "node:test";
import {
  buildKnowledgeThemeBase,
  buildKnowledgeThemeNote,
  buildKnowledgeResearchTopicBase,
  buildKnowledgeResearchTopicNote,
  buildKnowledgeDomainTree,
  buildKnowledgeThemes,
  buildThemePlanningPrompt,
  buildResearchTopicPlanningPrompt,
  buildThemeSynthesisRepairPrompt,
  buildThemeSynthesisPrompt,
  ensureThemeDimensionHeadings,
  ensureResearchTopicActions,
  inferPDSAStage,
  isManagedKnowledgeThemeBase,
  knowledgeNamesMatch,
  mergeThemeSynthesis,
  migrateKnowledgeThemeDomains,
  normalizeKnowledgeTopic,
  parseThemePlanningResponse,
  parseThemeSynthesisResponse,
  rankThemeSourceCandidates,
  rankResearchTopicSourceCandidates,
  renameKnowledgeThemePropertyValues,
  renameRawKnowledgeTopicPropertyValues,
  removeKnowledgeTopicPropertyValues,
  researchTopicWorkspacePaths,
  topicWorkspacePaths,
} from "../src/knowledge-cycle";
import { createDefaultSettings, type PropertyNoteSnapshot } from "../src/types";

test("knowledge names reject duplicates after whitespace, case, and Unicode normalization", () => {
  assert.equal(knowledgeNamesMatch("宏观经济", "  宏观经济  "), true);
  assert.equal(knowledgeNamesMatch("Gemini  Research", "gemini research"), true);
  assert.equal(knowledgeNamesMatch("ＡＩ 研究", "AI 研究"), true);
  assert.equal(knowledgeNamesMatch("货币政策", "宏观经济"), false);
});

test("theme rename updates plain and wikilink property values without touching other themes", () => {
  const renamed = renameKnowledgeThemePropertyValues(
    ["宏观经济", "[[_KnowGrove/主题空间/宏观经济]]", "货币政策"],
    "宏观经济",
    "全球宏观",
    "_KnowGrove/主题空间/宏观经济.md",
    "_KnowGrove/主题空间/全球宏观.md",
  );
  assert.deepEqual(renamed, ["全球宏观", "货币政策"]);
});

test("raw topic rename preserves plain and wikilink representation while deduplicating", () => {
  assert.deepEqual(
    renameRawKnowledgeTopicPropertyValues(["金融常识", "[[金融常识]]", "理财规划"], "金融常识", "金融基础"),
    ["金融基础", "理财规划"],
  );
  assert.deepEqual(
    renameRawKnowledgeTopicPropertyValues(["[[金融常识]]", "理财规划"], "金融常识", "金融基础"),
    ["[[金融基础]]", "理财规划"],
  );
});

test("topic deletion removes plain and managed wikilink values without touching other topics", () => {
  assert.deepEqual(
    removeKnowledgeTopicPropertyValues(
      ["金融常识", "[[金融常识]]", "[[_KnowGrove/主题空间/金融常识]]", "理财规划"],
      "金融常识",
      "_KnowGrove/主题空间/金融常识.md",
    ),
    ["理财规划"],
  );
});

test("theme domain migration preserves unrelated and shared domains", () => {
  assert.deepEqual(
    migrateKnowledgeThemeDomains(["投资", "AI产品", "个人成长"], ["投资", "AI产品"], ["宏观研究"], ["AI产品"]),
    ["AI产品", "个人成长", "宏观研究"],
  );
});

test("knowledge topics normalize wikilinks and aggregate domain and PDSA roles", () => {
  const settings = createDefaultSettings().propertySystem;
  settings.scopeFolder = "Home";
  const workspace = topicWorkspacePaths("Obsidian");
  const snapshots: PropertyNoteSnapshot[] = [
    {
      path: "Home/Input.md",
      basename: "Input",
      mtime: 10,
      frontmatter: { 类型: "输入资料", 状态: "待整理", 领域: ["AI产品"], 主题: ["[[Obsidian]]", "知识管理"] },
    },
    {
      path: "Home/Knowledge.md",
      basename: "Knowledge",
      mtime: 20,
      frontmatter: { 类型: "知识笔记", 状态: "生长中", 领域: ["AI产品"], 主题: ["[[Topics/Obsidian|Obsidian]]"] },
    },
    {
      path: "Home/Output.md",
      basename: "Output",
      mtime: 30,
      frontmatter: { 类型: "内容输出", 状态: "草稿", 领域: ["内容创作"], 主题: ["Obsidian"] },
    },
    { path: "Home/Unassigned.md", basename: "Unassigned", frontmatter: { 类型: "输入资料", 主题: [] } },
    {
      path: workspace.notePath,
      basename: "Obsidian",
      frontmatter: { knowgrove_topic_workspace: true, 当前阶段: "S", 上级主题: "[[Topics/AI产品|AI产品]]" },
    },
  ];
  const result = buildKnowledgeThemes(snapshots, settings);
  const obsidian = result.themes.find((theme) => theme.name === "Obsidian");
  assert.ok(obsidian);
  assert.equal(result.unassignedFiles, 1);
  assert.equal(obsidian.total, 3);
  assert.deepEqual(obsidian.domains, ["AI产品", "内容创作"]);
  assert.deepEqual(obsidian.stageCounts, { P: 1, D: 1, S: 1, A: 1 });
  assert.equal(obsidian.currentStage, "S");
  assert.equal(obsidian.parentName, "AI产品");
  assert.deepEqual(obsidian.documents.map((document) => document.path), ["Home/Output.md", "Home/Knowledge.md", "Home/Input.md"]);
  assert.equal(normalizeKnowledgeTopic("[[Topics/Obsidian|Obsidian]]"), "Obsidian");
});

test("fixed themes can exist without sources and explicit source selection overrides inferred tags", () => {
  const settings = createDefaultSettings().propertySystem;
  settings.scopeFolder = "Home";
  const snapshots: PropertyNoteSnapshot[] = [
    { path: "Home/A.md", basename: "A", mtime: 20, frontmatter: { 类型: "输入资料", 主题: ["研究主题"], 领域: ["AI产品"] } },
    { path: "Home/B.md", basename: "B", mtime: 10, frontmatter: { 类型: "输入资料", 主题: ["研究主题"] } },
    { path: "Home/C.md", basename: "C", mtime: 30, frontmatter: { 类型: "知识笔记", 主题: [] } },
    {
      path: "_KnowGrove/主题空间/研究主题.md",
      basename: "研究主题",
      frontmatter: {
        knowgrove_topic_workspace: true,
        主题名称: "研究主题",
        固定主题: true,
        研究课题: ["怎样形成可追溯结论？"],
        资料范围: ["[[Home/C]]"],
      },
    },
    {
      path: "_KnowGrove/主题空间/空主题.md",
      basename: "空主题",
      frontmatter: { knowgrove_topic_workspace: true, 主题名称: "空主题", 资料范围: [] },
    },
  ];
  const result = buildKnowledgeThemes(snapshots, settings);
  const fixed = result.themes.find((theme) => theme.name === "研究主题");
  const empty = result.themes.find((theme) => theme.name === "空主题");
  assert.ok(fixed);
  assert.equal(fixed.fixed, true);
  assert.deepEqual(fixed.researchQuestions, ["怎样形成可追溯结论？"]);
  assert.deepEqual(fixed.documents.map((document) => document.path), ["Home/C.md"]);
  assert.deepEqual(fixed.suggestedDocuments.map((document) => document.path), ["Home/A.md", "Home/B.md"]);
  assert.ok(empty);
  assert.equal(empty.total, 0);
  assert.equal(result.documents.length, 3);
});

test("knowledge tree groups fixed themes by primary domain and keeps legacy questions virtual", () => {
  const settings = createDefaultSettings().propertySystem;
  settings.scopeFolder = "Home";
  const snapshots: PropertyNoteSnapshot[] = [
    { path: "Home/A.md", basename: "A", mtime: 20, frontmatter: { 类型: "输入资料", 主题: ["主题甲"], 领域: ["AI产品"] } },
    { path: "Home/B.md", basename: "B", mtime: 10, frontmatter: { 类型: "输入资料", 主题: ["主题甲"], 领域: ["AI产品"] } },
    {
      path: "_KnowGrove/主题空间/主题甲.md",
      basename: "主题甲",
      frontmatter: {
        knowgrove_topic_workspace: true,
        主题名称: "主题甲",
        领域: ["AI产品", "个人成长"],
        研究课题: ["真实课题", "旧字符串课题"],
        资料范围: ["[[Home/A]]", "[[Home/B]]"],
      },
    },
    {
      path: "_KnowGrove/课题/主题甲/真实课题.md",
      basename: "真实课题",
      frontmatter: {
        knowgrove_research_topic: true,
        课题名称: "真实课题",
        核心问题: "如何验证真实课题？",
        上级主题: "[[_KnowGrove/主题空间/主题甲]]",
        领域: ["AI产品"],
        资料范围: ["[[Home/B]]"],
      },
    },
  ];
  const result = buildKnowledgeThemes(snapshots, settings);
  const theme = result.themes.find((candidate) => candidate.name === "主题甲");
  assert.ok(theme);
  assert.deepEqual(theme.researchTopics.map((topic) => topic.name).sort(), ["旧字符串课题", "真实课题"]);
  const real = theme.researchTopics.find((topic) => topic.name === "真实课题");
  const legacy = theme.researchTopics.find((topic) => topic.name === "旧字符串课题");
  assert.equal(real?.workspaceExists, true);
  assert.deepEqual(real?.documents.map((document) => document.path), ["Home/B.md"]);
  assert.equal(legacy?.workspaceExists, false);
  const tree = buildKnowledgeDomainTree(result.themes);
  assert.equal(tree[0]?.name, "AI产品");
  assert.equal(tree[0]?.total, 2);
  assert.deepEqual(tree[0]?.themes.map((item) => item.name), ["主题甲"]);
});

test("research topics are real Obsidian notes with rename-safe wikilinks and exact source Base", () => {
  const paths = researchTopicWorkspacePaths("AI/知识管理", "移动端：采集体验");
  assert.equal(paths.notePath, "_KnowGrove/课题/AI／知识管理/移动端：采集体验.md");
  const topic = {
    name: "移动端采集体验",
    coreQuestion: "怎样降低移动端资料进入知识库的摩擦？",
    parentThemeName: "Obsidian",
    domains: ["AI产品"],
    total: 1,
    fixed: true,
    workspaceExists: true,
    workspacePath: "_KnowGrove/课题/Obsidian/移动端采集体验.md",
    basePath: "_KnowGrove/课题/Obsidian/移动端采集体验.base",
    explicitSourcePaths: ["Home/输入.md"],
    documents: [{
      path: "Home/输入.md",
      basename: "输入",
      type: "输入资料",
      status: "待整理",
      domains: ["AI产品"],
      topics: ["Obsidian"],
      stage: "D" as const,
      modifiedAt: 1,
    }],
    candidateDocuments: [{
      path: "Home/输入.md",
      basename: "输入",
      type: "输入资料",
      status: "待整理",
      domains: ["AI产品"],
      topics: ["Obsidian"],
      stage: "D" as const,
      modifiedAt: 1,
    }],
  };
  const note = buildKnowledgeResearchTopicNote(topic, new Date(2026, 6, 21));
  assert.match(note, /上级主题: "\[\[_KnowGrove\/主题空间\/Obsidian\]\]"/);
  assert.doesNotMatch(note, /资料范围:/);
  assert.doesNotMatch(note, /候选资料:/);
  assert.match(note, /knowgrove-research-actions/);
  assert.match(note, /## 资料筛选[\s\S]*knowgrove-research-sources/);
  assert.ok(note.indexOf("## 资料筛选") > note.indexOf("## 输出方向"));
  assert.match(note, /knowgrove_research_topic: true/);
  const base = buildKnowledgeResearchTopicBase(topic);
  assert.match(base, /knowgrove_research_topic_base/);
  assert.match(base, /name: "已采用资料"/);
  assert.match(base, /name: "相关候选"/);
  assert.match(base, /file\.path == "Home\/输入\.md"/);
});

test("theme planning ranks metadata relevance and rejects invented source paths", () => {
  const settings = createDefaultSettings().propertySystem;
  const result = buildKnowledgeThemes([
    { path: "Home/Obsidian.md", basename: "Obsidian工作流", mtime: 1, frontmatter: { 类型: "输入资料", 主题: ["Obsidian"], 领域: ["AI产品"] } },
    { path: "Home/Recent.md", basename: "无关新资料", mtime: 99, frontmatter: { 类型: "输入资料", 主题: ["旅行"], 领域: ["生活"] } },
  ], settings);
  const theme = result.themes.find((item) => item.name === "Obsidian");
  assert.ok(theme);
  const ranked = rankThemeSourceCandidates({ ...theme, researchQuestions: ["怎样构建 Obsidian 工作流？"] }, result.documents);
  assert.equal(ranked[0]?.path, "Home/Obsidian.md");
  const prompt = buildThemePlanningPrompt(theme, ranked);
  assert.match(prompt, /只根据给定的标题和属性判断相关性/);
  const proposal = parseThemePlanningResponse(JSON.stringify({
    questions: ["如何形成稳定工作流？"],
    sources: [
      { path: "Home/Obsidian.md", reason: "标题和主题直接相关" },
      { path: "Invented.md", reason: "不存在" },
    ],
  }), ranked.map((document) => document.path));
  assert.deepEqual(proposal.questions, ["如何形成稳定工作流？"]);
  assert.deepEqual(proposal.sources.map((source) => source.path), ["Home/Obsidian.md"]);
});

test("research topics rank full-vault candidates independently from adopted sources", () => {
  const candidates = [
    { path: "Home/宏观政策.md", basename: "2026 中国宏观政策", type: "输入资料", status: "待整理", domains: ["投资"], topics: ["宏观经济"], stage: "D" as const, modifiedAt: 2 },
    { path: "Home/旅行.md", basename: "夏季旅行", type: "输入资料", status: "待整理", domains: ["生活"], topics: ["旅行"], stage: "D" as const, modifiedAt: 9 },
  ];
  const topic = { name: "中国26年经济政策", coreQuestion: "财政与货币政策如何影响增长？", parentThemeName: "宏观经济", domains: ["投资"] };
  const ranked = rankResearchTopicSourceCandidates(topic, candidates);
  assert.deepEqual(ranked.map((document) => document.path), ["Home/宏观政策.md"]);
  const prompt = buildResearchTopicPlanningPrompt(topic, ranked);
  assert.match(prompt, /给定的全库标题和属性/);
  assert.match(prompt, /上级主题：宏观经济/);
});

test("research action block upgrades existing topic notes without changing their content", () => {
  const original = "# 课题\n\n人工说明\n\n## 研究资料\n\n正文\n";
  const upgraded = ensureResearchTopicActions(original);
  assert.match(upgraded, /人工说明\n\n```knowgrove-research-actions/);
  assert.match(upgraded, /## 研究资料\n\n正文/);
  assert.equal(ensureResearchTopicActions(upgraded), upgraded);
});

test("PDSA inference keeps document role separate from the knowledge cycle", () => {
  assert.equal(inferPDSAStage("输入资料", "待整理"), "D");
  assert.equal(inferPDSAStage("知识笔记", "常青"), "S");
  assert.equal(inferPDSAStage("行动", "进行中"), "D");
  assert.equal(inferPDSAStage("行动", "已完成"), "A");
  assert.equal(inferPDSAStage("内容输出", "草稿"), "A");
});

test("topic Base exposes separate D S A views with exact source paths", () => {
  const settings = createDefaultSettings().propertySystem;
  const theme = buildKnowledgeThemes([{
    path: "Home/Article.md",
    basename: "Article",
    frontmatter: { 类型: "输入资料", 状态: "待整理", 主题: ["知识管理"] },
  }], settings).themes[0];
  assert.ok(theme);
  const base = buildKnowledgeThemeBase(theme);
  assert.match(base, /name: "D · 资料与实践"/);
  assert.match(base, /name: "S · 研究与沉淀"/);
  assert.match(base, /name: "A · 应用与输出"/);
  assert.match(base, /name: "研究资料"/);
  assert.match(base, /file\.path == "Home\/Article\.md"/);
  assert.match(base, /direction: DESC/);
  assert.match(base, /knowgrove_topic_base:/);
  assert.equal(isManagedKnowledgeThemeBase(base.split("\n").slice(1).join("\n")), true);
});

test("topic workspace is human-readable and embeds the generated Base views", () => {
  const settings = createDefaultSettings().propertySystem;
  const theme = buildKnowledgeThemes([{
    path: "Home/Article.md",
    basename: "Article",
    frontmatter: { 类型: "输入资料", 状态: "待整理", 领域: ["AI产品"], 主题: ["知识管理"] },
  }], settings).themes[0];
  assert.ok(theme);
  const note = buildKnowledgeThemeNote(theme, new Date(2026, 6, 20));
  assert.match(note, /knowgrove_topic_workspace: true/);
  assert.match(note, /固定主题: true/);
  assert.doesNotMatch(note, /资料范围:|课题范围:/);
  assert.match(note, /#研究资料\]\]/);
  assert.match(note, /## P · 研究计划/);
  assert.match(note, /## D · 资料与实践/);
  assert.match(note, /## S · 研究与沉淀/);
  assert.match(note, /## A · 应用与输出/);
  assert.match(note, /!\[\[_KnowGrove\/主题空间\/知识管理\.base#D · 资料与实践\]\]/);
});

test("theme synthesis accepts only supplied evidence and preserves human content", () => {
  const raw = JSON.stringify({
    summary: "当前资料主要讨论自动归类与证据沉淀。",
    dimensions: [{ name: "资料路由", question: "如何判断资料属于哪个主题？" }],
    propositions: [
      { title: "高置信度资料可以自动归入主题", status: "有证据", evidencePaths: ["Home/A.md", "Unknown.md"] },
      { title: "机器索引应可重新生成", status: "有证据", evidencePaths: [] },
    ],
    gaps: ["多主题资料如何处理？"],
    outputs: [{ title: "主题路由 SOP", format: "SOP", angle: "形成可复用操作流程" }],
  });
  const proposal = parseThemeSynthesisResponse(raw, ["Home/A.md"]);
  assert.deepEqual(proposal.propositions[0]?.evidencePaths, ["Home/A.md"]);
  assert.equal(proposal.propositions[1]?.status, "待验证");
  const original = `# 主题\n\n## S · 研究与沉淀\n\n### 已确认知识\n\n人工结论不能覆盖。\n\n## A · 应用与输出\n`;
  const merged = mergeThemeSynthesis(original, proposal);
  assert.match(merged, /人工结论不能覆盖/);
  assert.match(merged, /\[\[Home\/A\]\]/);
  assert.match(merged, /主题路由 SOP/);
  assert.equal(mergeThemeSynthesis(merged, proposal), merged);
  const structured = ensureThemeDimensionHeadings(merged, proposal);
  assert.match(structured, /### 资料路由\n\n> 研究问题：如何判断资料属于哪个主题？/);
  assert.match(structured, /人工结论不能覆盖/);
  assert.equal(ensureThemeDimensionHeadings(structured, proposal), structured);
});

test("theme synthesis salvages complete entries from malformed or truncated CLI JSON", () => {
  const malformed = `{"summary":"可恢复","dimensions":[{"name":"路由","question":"如何归类？"} {"name":"证据","question":"如何追踪？"}],"propositions":[{"title":"路径必须真实","status":"有证据","evidencePaths":["Home/A.md"]}],"gaps":["缺少反例"],"outputs":[{"title":"研究 SOP","format":"SOP","angle":"复用流程"},{"title":"未完成"`;
  const proposal = parseThemeSynthesisResponse(malformed, ["Home/A.md"]);
  assert.equal(proposal.summary, "可恢复");
  assert.deepEqual(proposal.dimensions.map((item) => item.name), ["路由", "证据"]);
  assert.deepEqual(proposal.propositions[0]?.evidencePaths, ["Home/A.md"]);
  assert.deepEqual(proposal.gaps, ["缺少反例"]);
  assert.equal(proposal.outputs[0]?.title, "研究 SOP");
});

test("theme synthesis prompt requires evidence-backed human-readable structure", () => {
  const settings = createDefaultSettings().propertySystem;
  const theme = buildKnowledgeThemes([{
    path: "Home/A.md",
    basename: "A",
    frontmatter: { 类型: "输入资料", 主题: ["知识管理"] },
  }], settings).themes[0];
  assert.ok(theme);
  const prompt = buildThemeSynthesisPrompt(theme, [{ path: "Home/A.md", title: "A", type: "输入资料", status: "待整理", content: "正文" }]);
  assert.match(prompt, /研究维度=看问题的角度/);
  assert.match(prompt, /evidencePaths 只能使用输入中逐字一致的 path/);
  assert.match(prompt, /人类可读/);
  assert.match(prompt, /用户设定的研究课题/);
  assert.match(prompt, /返回前检查 JSON 语法/);
  const repairPrompt = buildThemeSynthesisRepairPrompt("```json\n{broken}\n```");
  assert.match(repairPrompt, /只修复语法，不增加事实/);
  assert.match(repairPrompt, /\{broken\}/);
});
