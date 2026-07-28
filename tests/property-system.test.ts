import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzePropertyInventory,
  applyOperation,
  auditPropertySnapshots,
  buildPropertyBase,
  countPropertyFlowSnapshots,
  initializeTrackedNoteFrontmatter,
  isManagedPropertyBaseContent,
  isPropertyGovernedPath,
  localDateFromTimestamp,
  normalizePropertyDimensions,
  operationStillApplies,
  shouldInitializeTrackedNote,
} from "../src/property-system";
import { createDefaultSettings, type PropertyNoteSnapshot } from "../src/types";

function system() {
  return createDefaultSettings().propertySystem;
}

test("property check leaves blank-line cleanup off by default", () => {
  assert.equal(createDefaultSettings().cleanupBlankLinesWithPropertyCheck, false);
});

test("new-content automation uses one shared default across capture and property processing", () => {
  const settings = createDefaultSettings();
  assert.equal(settings.browserCapture.autoProcessLinkNotes, settings.autoMarkNewNotes);
  assert.equal(settings.aiProperties.autoEnrichNewNotes, settings.autoMarkNewNotes);
  assert.equal(settings.propertySystem.initializeTrackedNotes, settings.autoMarkNewNotes);
});

test("governance scope excludes configured, system, and dependency files", () => {
  const settings = system();
  settings.scopeFolder = "Home";
  settings.excludedFolders = ["Home/Machine Corpus"];
  assert.equal(isPropertyGovernedPath("Home/Notes/Example.md", settings), true);
  assert.equal(isPropertyGovernedPath("Archive/Example.md", settings), false);
  assert.equal(isPropertyGovernedPath("Home/Machine Corpus/Chunk.md", settings), false);
  assert.equal(isPropertyGovernedPath("Home/Project/node_modules/README.md", settings), false);
  assert.equal(isPropertyGovernedPath("Home/Notes/AGENTS.md", settings), false);
  assert.equal(isPropertyGovernedPath("Home/Project/DESIGN.md", settings), false);
});

test("knowledge flow counts reuse lifecycle rules and governance scope", () => {
  const settings = system();
  settings.scopeFolder = "Home";
  settings.excludedFolders = ["Home/Excluded"];
  const note = (path: string, type: string, status: string): PropertyNoteSnapshot => ({
    path,
    basename: path.split("/").pop()?.replace(/\.md$/, "") ?? path,
    frontmatter: { 类型: type, 状态: status },
  });
  const snapshots = [
    note("Home/Input.md", "输入资料", "待整理"),
    note("Home/Read.md", "输入资料", "待沉淀"),
    note("Home/Archived input.md", "输入资料", "已归档"),
    note("Home/Knowledge.md", "知识笔记", "已完成"),
    note("Home/Review.md", "复盘", "已归档"),
    note("Home/Project.md", "项目笔记", "进行中"),
    note("Home/Completed project.md", "项目笔记", "已完成"),
    note("Home/Action.md", "行动", "待办"),
    note("Home/Output.md", "内容输出", "草稿"),
    note("Home/Archived output.md", "内容输出", "已归档"),
    note("Home/Excluded/Hidden.md", "行动", "待办"),
    note("Archive/Outside.md", "知识笔记", "已完成"),
  ];
  assert.deepEqual(countPropertyFlowSnapshots(snapshots, settings), {
    input: 2,
    knowledge: 2,
    project: 1,
    action: 1,
    output: 1,
  });
});

test("inventory suggests repeated existing properties without replacing configured dimensions", () => {
  const settings = system();
  const snapshots: PropertyNoteSnapshot[] = Array.from({ length: 10 }, (_, index) => ({
    path: `Home/Note ${index}.md`,
    basename: `Note ${index}`,
    frontmatter: {
      文件名: `Note ${index}`,
      类型: "输入资料",
      状态: "待整理",
      领域: ["AI产品"],
      主题: [],
      内容类型: index % 2 ? "网页文章" : "研究报告",
    },
  }));
  const analysis = analyzePropertyInventory(snapshots, settings);
  const suggestion = analysis.suggestedDimensions.find((item) => item.name === "内容类型");
  assert.equal(analysis.governedFiles, 10);
  assert.equal(suggestion?.valueType, "single");
  assert.equal(suggestion?.required, false);
  assert.equal(suggestion?.origin, "inferred");
  assert.deepEqual(suggestion?.allowedValues.sort(), ["研究报告", "网页文章"]);
  assert.equal(analysis.suggestedDimensions.filter((item) => item.name === "类型").length, 1);
});

test("audit separates deterministic fixes from semantic decisions", () => {
  const settings = system();
  const snapshots: PropertyNoteSnapshot[] = [{
    path: "Home/Inbox/Example.md",
    basename: "Example",
    frontmatter: {},
  }];
  const audit = auditPropertySnapshots(snapshots, settings);
  assert.equal(audit.nonCompliantFiles, 1);
  assert.deepEqual(audit.compliantPaths, []);
  assert.deepEqual(audit.nonCompliantPaths, ["Home/Inbox/Example.md"]);
  assert.equal(audit.automaticFiles, 1);
  assert.equal(audit.automaticOperations, 1);
  assert.equal(audit.manualIssues, 4);
  assert.deepEqual(
    audit.changes[0]?.operations.map((operation) => operation.property),
    ["文件名"],
  );
});

test("file name property is always synchronized with the Markdown title", () => {
  const settings = system();
  const audit = auditPropertySnapshots([{
    path: "Home/输入/新标题.md",
    basename: "新标题",
    frontmatter: {
      文件名: "旧标题",
      类型: "知识笔记",
      状态: "常青",
      领域: ["AI产品"],
      主题: ["知识管理"],
    },
  }], settings);
  assert.deepEqual(audit.changes[0]?.operations, [{
    kind: "set",
    property: "文件名",
    before: "旧标题",
    after: "新标题",
    reason: "同步 Markdown 文件标题",
  }]);
  assert.ok(audit.issues.some((issue) => issue.property === "文件名"
    && issue.automatic
    && issue.suggestedValue === "新标题"));
});

test("audit migrates one legacy alias but reports alias conflicts", () => {
  const settings = system();
  const snapshots: PropertyNoteSnapshot[] = [
    {
      path: "Home/Legacy.md",
      basename: "Legacy",
      frontmatter: { title: "Legacy", type: "输入资料", status: "待整理", domain: "AI产品", topics: "知识管理" },
    },
    {
      path: "Home/Conflict.md",
      basename: "Conflict",
      frontmatter: { 文件名: "Conflict", title: "Old", 类型: "输入资料", 状态: "待整理", 领域: [], 主题: [] },
    },
  ];
  const audit = auditPropertySnapshots(snapshots, settings);
  const legacy = audit.changes.find((change) => change.path.endsWith("Legacy.md"));
  assert.equal(legacy?.operations.filter((operation) => operation.kind === "rename").length, 5);
  assert.ok(audit.issues.some((item) => item.path.endsWith("Conflict.md") && item.kind === "alias-conflict"));
});

test("invalid enums are reported and never automatically overwritten", () => {
  const settings = system();
  const audit = auditPropertySnapshots([{
    path: "Home/Invalid.md",
    basename: "Invalid",
    frontmatter: { 文件名: "Invalid", 类型: "神奇类型", 状态: "待整理", 领域: ["未知领域"], 主题: [] },
  }], settings);
  const invalid = audit.issues.filter((item) => item.kind === "invalid-value");
  assert.equal(invalid.length, 2);
  assert.ok(invalid.every((item) => item.automatic === false));
  assert.equal(audit.automaticFiles, 0);
});

test("inferred enums stay open when new values appear", () => {
  const settings = system();
  settings.dimensions.push({
    id: "project",
    name: "所属项目",
    description: "扫描发现：覆盖 100 篇笔记",
    aliases: [],
    valueType: "single",
    required: false,
    origin: "inferred",
    allowedValues: ["旧项目"],
    fillStrategy: "none",
    defaultValue: "",
  });
  settings.dimensions = normalizePropertyDimensions(settings.dimensions, settings.creationDateProperty);
  const project = settings.dimensions.find((dimension) => dimension.name === "所属项目");
  assert.equal(project?.enumMode, "open");
  const audit = auditPropertySnapshots([{
    path: "Home/New project.md",
    basename: "New project",
    frontmatter: {
      文件名: "New project",
      类型: "项目笔记",
      状态: "进行中",
      领域: ["AI产品"],
      主题: ["知识管理"],
      所属项目: "美团",
    },
  }], settings);
  assert.equal(audit.nonCompliantFiles, 0);
  assert.ok(!audit.issues.some((item) => item.property === "所属项目"));
});

test("only explicitly closed enums reject newly added values", () => {
  const settings = system();
  settings.dimensions.push({
    id: "priority",
    name: "优先级",
    description: "固定优先级",
    aliases: [],
    valueType: "single",
    required: false,
    origin: "user",
    enumMode: "closed",
    allowedValues: ["高", "中", "低"],
    fillStrategy: "none",
    defaultValue: "",
  });
  const audit = auditPropertySnapshots([{
    path: "Home/Priority.md",
    basename: "Priority",
    frontmatter: {
      文件名: "Priority",
      类型: "项目笔记",
      状态: "进行中",
      领域: ["AI产品"],
      主题: ["知识管理"],
      优先级: "紧急",
    },
  }], settings);
  assert.ok(audit.issues.some((item) => item.property === "优先级" && item.kind === "invalid-value"));
});

test("reading aliases are normalized while unknown reading states remain visible", () => {
  const settings = system();
  const audit = auditPropertySnapshots([
    {
      path: "Home/Unread.md",
      basename: "Unread",
      frontmatter: { 文件名: "Unread", 类型: "输入资料", 状态: "待整理", 创建时间: "2026-07-23", 领域: ["AI产品"], 主题: ["知识管理"], 阅读状态: "未读" },
    },
    {
      path: "Home/Unknown reading.md",
      basename: "Unknown reading",
      frontmatter: { 文件名: "Unknown reading", 类型: "输入资料", 状态: "待整理", 创建时间: "2026-07-23", 领域: ["AI产品"], 主题: ["知识管理"], 阅读状态: "待归类" },
    },
  ], settings, {
    enabled: false,
    propertyName: "收藏",
    reading: { propertyName: "阅读状态", readingValue: "在看", finishedValue: "已读" },
  });
  const unread = audit.changes.find((change) => change.path === "Home/Unread.md");
  assert.deepEqual(unread?.operations, [{
    kind: "set",
    property: "阅读状态",
    before: "未读",
    after: "在看",
    reason: "统一阅读状态别名",
  }]);
  assert.ok(audit.issues.some((item) => item.path === "Home/Unknown reading.md"
    && item.property === "阅读状态"
    && item.automatic === false));
});

test("AI-managed empty list properties wait for semantic generation", () => {
  const settings = system();
  const audit = auditPropertySnapshots([{
    path: "Home/Empty lists.md",
    basename: "Empty lists",
    frontmatter: { 文件名: "Empty lists", 类型: "输入资料", 状态: "待整理", 创建时间: "2026-07-19", 领域: null, 主题: null },
  }], settings);
  assert.equal(audit.manualIssues, 2);
  assert.equal(audit.changes.length, 0);
  assert.ok(audit.issues.every((issue) => issue.automatic === false));
});

test("operations require preview preconditions and preserve unknown fields", () => {
  const frontmatter: Record<string, unknown> = { title: "Example", custom: "keep" };
  const operation = {
    kind: "rename" as const,
    property: "文件名",
    alias: "title",
    before: "Example",
    after: "Example",
    reason: "migrate",
  };
  assert.equal(operationStillApplies(frontmatter, operation), true);
  applyOperation(frontmatter, operation);
  assert.deepEqual(frontmatter, { 文件名: "Example", custom: "keep" });
  assert.equal(operationStillApplies(frontmatter, operation), false);
});

test("new tracked note without frontmatter receives the complete minimal input schema", () => {
  const settings = system();
  const frontmatter: Record<string, unknown> = {};
  const changed = initializeTrackedNoteFrontmatter(
    frontmatter,
    "Imported article",
    settings,
    "阅读状态",
    "在看",
    "2026-07-19",
  );
  assert.equal(changed, true);
  assert.deepEqual(frontmatter, {
    文件名: "Imported article",
    类型: "输入资料",
    状态: "待整理",
    创建时间: "2026-07-19",
    阅读状态: "在看",
    领域: [],
    主题: [],
  });
  assert.equal(Object.keys(frontmatter)[0], "文件名");
});

test("AI-managed fields are deferred instead of receiving empty lists", () => {
  const settings = system();
  const frontmatter: Record<string, unknown> = {};
  const changed = initializeTrackedNoteFrontmatter(
    frontmatter,
    "AI article",
    settings,
    "阅读状态",
    "在看",
    "2026-07-19",
    new Set(["领域", "主题"]),
  );
  assert.equal(changed, true);
  assert.deepEqual(frontmatter, {
    文件名: "AI article",
    类型: "输入资料",
    状态: "待整理",
    创建时间: "2026-07-19",
    阅读状态: "在看",
  });
  assert.equal(Object.prototype.hasOwnProperty.call(frontmatter, "领域"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(frontmatter, "主题"), false);
});

test("complete imported frontmatter keeps every value and only moves 文件名 first", () => {
  const settings = system();
  const frontmatter: Record<string, unknown> = {
    来源链接: "[[网页来源]]",
    文件名: "采集器标题",
    类型: "知识笔记",
    状态: "待沉淀",
    创建时间: "2026-06-01",
    阅读状态: "已读",
    领域: ["AI产品"],
    主题: ["知识管理"],
    作者: "原作者",
  };
  assert.equal(initializeTrackedNoteFrontmatter(
    frontmatter, "磁盘文件名", settings, "阅读状态", "在看", "2026-07-19",
  ), true);
  assert.equal(Object.keys(frontmatter)[0], "文件名");
  assert.deepEqual(frontmatter, {
    文件名: "采集器标题",
    来源链接: "[[网页来源]]",
    类型: "知识笔记",
    状态: "待沉淀",
    创建时间: "2026-06-01",
    阅读状态: "已读",
    领域: ["AI产品"],
    主题: ["知识管理"],
    作者: "原作者",
  });
});

test("new tracked note with only reading status fills missing core properties", () => {
  const settings = system();
  const frontmatter: Record<string, unknown> = { 阅读状态: "在看" };
  initializeTrackedNoteFrontmatter(
    frontmatter, "Only status", settings, "阅读状态", "在看", "2026-07-19",
  );
  assert.equal(frontmatter.阅读状态, "在看");
  assert.equal(frontmatter.文件名, "Only status");
  assert.equal(frontmatter.类型, "输入资料");
  assert.equal(frontmatter.状态, "待整理");
  assert.deepEqual(frontmatter.领域, []);
  assert.deepEqual(frontmatter.主题, []);
});

test("new external input receives an unchecked focus property without overwriting existing values", () => {
  const settings = system();
  const frontmatter: Record<string, unknown> = {};
  initializeTrackedNoteFrontmatter(
    frontmatter, "External", settings, "阅读状态", "在看", "2026-07-23", new Set(), "收藏",
  );
  assert.equal(frontmatter.收藏, false);

  const focused: Record<string, unknown> = { 收藏: true };
  initializeTrackedNoteFrontmatter(
    focused, "Focused", settings, "阅读状态", "在看", "2026-07-23", new Set(), "收藏",
  );
  assert.equal(focused.收藏, true);

  const legacy: Record<string, unknown> = { 重点关注: true };
  initializeTrackedNoteFrontmatter(
    legacy, "Legacy", settings, "阅读状态", "在看", "2026-07-23", new Set(), "收藏",
  );
  assert.equal(legacy.重点关注, true);
  assert.equal(Object.prototype.hasOwnProperty.call(legacy, "收藏"), false);
});

test("property audit adds the focus checkbox only to external input material", () => {
  const settings = system();
  const audit = auditPropertySnapshots([
    {
      path: "Home/External.md",
      basename: "External",
      frontmatter: { 文件名: "External", 类型: "输入资料", 状态: "待整理", 创建时间: "2026-07-23", 领域: ["AI产品"], 主题: ["知识管理"] },
    },
    {
      path: "Home/Authored.md",
      basename: "Authored",
      frontmatter: { 文件名: "Authored", 类型: "知识笔记", 状态: "待沉淀", 领域: ["AI产品"], 主题: ["知识管理"] },
    },
    {
      path: "Home/Focused.md",
      basename: "Focused",
      frontmatter: { 文件名: "Focused", 类型: "输入资料", 状态: "待整理", 创建时间: "2026-07-23", 领域: ["AI产品"], 主题: ["知识管理"], 重点关注: true },
    },
  ], settings, { enabled: true, propertyName: "收藏", aliases: ["重点关注"] });
  const focusChanges = audit.changes.flatMap((change) => change.operations.map((operation) => ({ path: change.path, operation })))
    .filter(({ operation }) => operation.property === "收藏");
  assert.deepEqual(focusChanges.map(({ path }) => path), ["Home/External.md"]);
  assert.equal(focusChanges[0]?.operation.after, false);
});

test("existing custom, empty, and unknown values are never overwritten", () => {
  const settings = system();
  const frontmatter: Record<string, unknown> = {
    文件名: "自定义标题",
    类型: "项目笔记",
    状态: "已完成",
    创建时间: null,
    阅读状态: "已读",
    领域: "自定义领域",
    主题: null,
    tags: ["keep"],
    custom: { nested: true },
  };
  assert.equal(initializeTrackedNoteFrontmatter(
    frontmatter,
    "磁盘文件名",
    settings,
    "阅读状态",
    "在看",
    "2026-07-20",
  ), false);
  assert.deepEqual(frontmatter, {
    文件名: "自定义标题",
    类型: "项目笔记",
    状态: "已完成",
    创建时间: null,
    阅读状态: "已读",
    领域: "自定义领域",
    主题: null,
    tags: ["keep"],
    custom: { nested: true },
  });
});

test("new-note initialization is idempotent across duplicate create handling", () => {
  const settings = system();
  const frontmatter: Record<string, unknown> = {};
  assert.equal(initializeTrackedNoteFrontmatter(
    frontmatter, "Duplicate", settings, "阅读状态", "在看", "2026-07-19",
  ), true);
  const first = JSON.stringify(frontmatter);
  assert.equal(initializeTrackedNoteFrontmatter(
    frontmatter, "Duplicate", settings, "阅读状态", "在看", "2026-07-20",
  ), false);
  assert.equal(JSON.stringify(frontmatter), first);
});

test("new-note gating excludes non-tracked folders and non-Markdown files", () => {
  assert.equal(shouldInitializeTrackedNote("Home/📬输入/A.md", "md", "Home/📬输入", true), true);
  assert.equal(shouldInitializeTrackedNote("Home/知识/A.md", "md", "Home/📬输入", true), false);
  assert.equal(shouldInitializeTrackedNote("Home/📬输入/A.pdf", "pdf", "Home/📬输入", true), false);
  assert.equal(shouldInitializeTrackedNote("Home/📬输入/A.md", "md", "Home/📬输入", false), false);
});

test("late importer frontmatter wins while missing core properties are restored once", () => {
  const settings = system();
  const initiallyEmpty: Record<string, unknown> = {};
  initializeTrackedNoteFrontmatter(
    initiallyEmpty, "Race", settings, "阅读状态", "在看", "2026-07-19",
  );

  const rewrittenByImporter: Record<string, unknown> = {
    来源链接: "[[可靠来源]]",
    作者: "采集器作者",
    类型: "知识笔记",
    主题: ["采集主题"],
    阅读状态: "待读",
  };
  initializeTrackedNoteFrontmatter(
    rewrittenByImporter, "Race", settings, "阅读状态", "在看", "2026-07-19",
  );
  assert.deepEqual(rewrittenByImporter, {
    文件名: "Race",
    来源链接: "[[可靠来源]]",
    作者: "采集器作者",
    类型: "知识笔记",
    主题: ["采集主题"],
    阅读状态: "待读",
    状态: "待整理",
    创建时间: "2026-07-19",
    领域: [],
  });
  assert.equal(new Set(Object.keys(rewrittenByImporter)).size, Object.keys(rewrittenByImporter).length);
});

test("creation date is derived from the TFile ctime in local calendar time", () => {
  const timestamp = new Date(2026, 6, 19, 23, 30, 0).getTime();
  assert.equal(localDateFromTimestamp(timestamp), "2026-07-19");
});

test("creation date compliance applies only to input material", () => {
  const settings = system();
  const audit = auditPropertySnapshots([
    {
      path: "Home/Input without date.md",
      basename: "Input without date",
      frontmatter: { 文件名: "Input without date", 类型: "输入资料", 状态: "待整理", 领域: [], 主题: [] },
    },
    {
      path: "Home/Knowledge without date.md",
      basename: "Knowledge without date",
      frontmatter: { 文件名: "Knowledge without date", 类型: "知识笔记", 状态: "常青", 领域: [], 主题: [] },
    },
  ], settings);
  assert.deepEqual(audit.compliantPaths, ["Home/Knowledge without date.md"]);
  assert.deepEqual(audit.nonCompliantPaths, ["Home/Input without date.md"]);
  assert.ok(audit.issues.some((item) => item.property === "创建时间" && item.path.endsWith("Input without date.md")));
  assert.ok(!audit.issues.some((item) => item.property === "创建时间" && item.path.endsWith("Knowledge without date.md")));
});

test("legacy inferred rules migrate without becoming global requirements", () => {
  const dimensions = normalizePropertyDimensions([
    ...system().dimensions,
    {
      id: "legacy-created-at",
      name: "创建时间",
      description: "扫描发现：覆盖 911 篇笔记",
      aliases: [],
      valueType: "date",
      required: true,
      allowedValues: [],
      fillStrategy: "none",
      defaultValue: "",
    },
    {
      id: "legacy-author",
      name: "作者",
      description: "扫描发现：覆盖 900 篇笔记",
      aliases: [],
      valueType: "text",
      required: true,
      allowedValues: [],
      fillStrategy: "none",
      defaultValue: "",
    },
  ], "创建时间");
  const creation = dimensions.find((dimension) => dimension.name === "创建时间");
  const author = dimensions.find((dimension) => dimension.name === "作者");
  assert.equal(creation?.required, false);
  assert.deepEqual(creation?.requiredForTypes, ["输入资料"]);
  assert.equal(creation?.origin, "system");
  assert.equal(author?.required, false);
  assert.equal(author?.origin, "inferred");
});

test("conditional required dimensions apply only to matching note types", () => {
  const settings = system();
  settings.dimensions.push({
    id: "deliverable",
    name: "交付物",
    description: "项目交付结果",
    aliases: [],
    valueType: "text",
    required: false,
    requiredForTypes: ["项目笔记"],
    origin: "user",
    allowedValues: [],
    fillStrategy: "none",
    defaultValue: "",
  });
  const audit = auditPropertySnapshots([
    {
      path: "Home/Project.md",
      basename: "Project",
      frontmatter: { 文件名: "Project", 类型: "项目笔记", 状态: "进行中", 领域: [], 主题: [] },
    },
    {
      path: "Home/Input.md",
      basename: "Input",
      frontmatter: { 文件名: "Input", 类型: "输入资料", 状态: "待整理", 创建时间: "2026-07-19", 领域: [], 主题: [] },
    },
  ], settings);
  assert.deepEqual(audit.nonCompliantPaths, ["Home/Project.md"]);
  assert.ok(audit.issues.some((issue) => issue.path === "Home/Project.md" && issue.property === "交付物"));
  assert.ok(!audit.issues.some((issue) => issue.path === "Home/Input.md" && issue.property === "交付物"));
});

test("generated governance views use the audited document lists", () => {
  const settings = system();
  const audit = auditPropertySnapshots([
    {
      path: "Home/Compliant.md",
      basename: "Compliant",
      frontmatter: { 文件名: "Compliant", 类型: "知识笔记", 状态: "常青", 领域: [], 主题: [] },
    },
    {
      path: "Home/Needs review.md",
      basename: "Needs review",
      frontmatter: {},
    },
  ], settings);
  const base = buildPropertyBase(settings, audit);
  const compliantView = base.slice(base.indexOf('name: "✅ 已符合规范"'), base.indexOf('name: "⚠️ 待规范"'));
  const nonCompliantView = base.slice(base.indexOf('name: "⚠️ 待规范"'), base.indexOf('name: "📥 输入与收藏"'));
  assert.match(compliantView, /file\.path == "Home\/Compliant\.md"/);
  assert.doesNotMatch(compliantView, /Needs review/);
  assert.match(nonCompliantView, /file\.path == "Home\/Needs review\.md"/);
  assert.doesNotMatch(nonCompliantView, /Compliant\.md/);
  assert.match(base, /property_compliance: 'if\(!\(file\.path == "Home\/Needs review\.md"\), "已规范", "待规范"\)'/);
});

test("generated Base combines property audit and lifecycle workflow views", () => {
  const settings = system();
  settings.scopeFolder = "Home";
  settings.excludedFolders = ["Home/Skills"];
  const base = buildPropertyBase(settings);
  assert.match(base, /file\.inFolder\("Home"\)/);
  assert.match(base, /!file\.inFolder\("Home\/Skills"\)/);
  assert.match(base, /file\.basename != "AGENTS"/);
  assert.match(base, /file\.basename != "DESIGN"/);
  assert.match(base, /file\.basename != "SKILL"/);
  assert.match(base, /file\.hasProperty\("文件名"\)/);
  for (const name of [
    "✅ 已符合规范",
    "⚠️ 待规范",
    "📥 输入与收藏",
    "🌱 知识生长",
    "🚧 项目推进",
    "✅ 行动推进",
    "✍️ 内容输出",
  ]) assert.match(base, new RegExp(`name: "${name}"`));
  for (const removed of ["📖 正在阅读", "🕒 最近更新", "🗂️ 全部工作面"]) {
    assert.doesNotMatch(base, new RegExp(`name: "${removed}"`));
  }
  assert.match(base, /formula\.property_compliance/);
  assert.match(base, /knowgrove_managed:/);
  assert.equal(base.match(/    sort:/g)?.length, 7);
  assert.equal(base.match(/      - property: file\.mtime\n        direction: DESC/g)?.length, 7);
  const inputView = base.slice(base.indexOf('name: "📥 输入与收藏"'), base.indexOf('name: "🌱 知识生长"'));
  assert.match(inputView, /类型 == "输入资料"/);
  for (const status of ["待整理", "待归类", "待沉淀", "处理失败"]) assert.match(inputView, new RegExp(`状态 == "${status}"`));
  assert.doesNotMatch(inputView, /阅读状态 ==/);
  const knowledgeView = base.slice(base.indexOf('name: "🌱 知识生长"'), base.indexOf('name: "🚧 项目推进"'));
  assert.match(knowledgeView, /类型 == "随手笔记"/);
  assert.match(knowledgeView, /类型 == "知识笔记"/);
  assert.match(knowledgeView, /类型 == "复盘"/);
});

test("managed Base detection survives Obsidian stripping YAML comments", () => {
  assert.equal(isManagedPropertyBaseContent([
    "formulas:",
    "  knowgrove_managed: '\"0.4.0\"'",
    "views: []",
  ].join("\n")), true);
  assert.equal(isManagedPropertyBaseContent([
    "formulas:",
    "  property_compliance: 'true'",
    "views:",
    "  - type: table",
    "    name: 工作流看板",
    "  - type: table",
    "    name: 待规范",
  ].join("\n")), true);
  assert.equal(isManagedPropertyBaseContent("views:\n  - type: table\n    name: 我的手工 Base\n"), false);
  assert.equal(isManagedPropertyBaseContent([
    "formulas:",
    "  property_compliance: 'true'",
    "views:",
    "  - type: table",
    "    name: ✅ 已符合规范",
    "  - type: table",
    "    name: ⚠️ 待规范",
  ].join("\n")), true);
});

test("generated Base keeps input-only creation date compliance and all default exclusions", () => {
  const base = buildPropertyBase(system());
  const compliance = base.split("\n").find((line) => line.startsWith("  property_compliance:")) ?? "";
  assert.match(compliance, /\(类型 != "输入资料" \|\| file\.hasProperty\("创建时间"\)\)/);
  assert.equal(compliance.match(/file\.hasProperty\("创建时间"\)/g)?.length, 1);
  for (const folder of [
    "_KnowGrove",
    "Home/🕹️skills",
    "Home/🐘项目/亚马逊经营助手/知识库",
    "Home/🐘项目/亚马逊经营助手/amazon-seller-analyst",
  ]) assert.match(base, new RegExp(`!file\\.inFolder\\("${folder}"\\)`));
  for (const type of ["输入资料", "随手笔记", "知识笔记", "项目笔记", "行动", "复盘", "内容输出"]) {
    assert.match(base, new RegExp(`类型 == "${type}"`));
  }
});

test("generated Base formulas support conditional required dimensions", () => {
  const settings = system();
  settings.dimensions.push({
    id: "deliverable",
    name: "交付物",
    description: "项目交付结果",
    aliases: [],
    valueType: "text",
    required: false,
    requiredForTypes: ["项目笔记"],
    origin: "user",
    allowedValues: [],
    fillStrategy: "none",
    defaultValue: "",
  });
  const base = buildPropertyBase(settings);
  const compliance = base.split("\n").find((line) => line.startsWith("  property_compliance:")) ?? "";
  assert.match(compliance, /\(\(类型 != "项目笔记"\) \|\| file\.hasProperty\("交付物"\)\)/);
});
