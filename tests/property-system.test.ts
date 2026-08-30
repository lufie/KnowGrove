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
  needsPendingPropertyReviewStorageMigration,
  normalizePropertyDimensions,
  operationStillApplies,
  shouldInitializeTrackedNote,
} from "../src/property-system";
import { createDefaultSettings, type PropertyNoteSnapshot } from "../src/types";

function system() {
  return createDefaultSettings().propertySystem;
}

test("property check leaves blank-line cleanup off by default", () => {
  const settings = createDefaultSettings();
  assert.equal(settings.cleanupBlankLinesWithPropertyCheck, false);
  assert.equal(settings.recentFileMode, "opened");
  assert.equal(settings.recentFileLimit, 8);
  assert.equal(settings.enableTopicIndex, true);
});

test("new-content automation uses one shared default across capture and property processing", () => {
  const settings = createDefaultSettings();
  assert.equal(settings.browserCapture.autoProcessLinkNotes, settings.autoMarkNewNotes);
  assert.equal(settings.aiProperties.autoEnrichNewNotes, settings.autoMarkNewNotes);
  assert.equal(settings.propertySystem.initializeTrackedNotes, settings.autoMarkNewNotes);
  assert.equal("focusPropertyEnabled" in settings, false);
  assert.equal("focusPropertyName" in settings, false);
});

test("missing or invalid pending property review storage is persisted during upgrade", () => {
  assert.equal(needsPendingPropertyReviewStorageMigration(undefined), true);
  assert.equal(needsPendingPropertyReviewStorageMigration(null), true);
  assert.equal(needsPendingPropertyReviewStorageMigration([]), true);
  assert.equal(needsPendingPropertyReviewStorageMigration("invalid"), true);
  assert.equal(needsPendingPropertyReviewStorageMigration({}), false);
  assert.equal(needsPendingPropertyReviewStorageMigration({ "Home/Note.md": { properties: {} } }), false);
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
    note("Home/Input.md", "输入资料", "待处理"),
    note("Home/Read.md", "输入资料", "待处理"),
    note("Home/Archived input.md", "输入资料", "已归档"),
    note("Home/Knowledge.md", "知识笔记", "已完成"),
    note("Home/Review.md", "复盘", "已归档"),
    note("Home/Project.md", "项目笔记", "进行中"),
    note("Home/Completed project.md", "项目笔记", "已完成"),
    note("Home/Action.md", "行动", "待处理"),
    note("Home/Output.md", "内容输出", "进行中"),
    note("Home/Archived output.md", "内容输出", "已归档"),
    note("Home/Excluded/Hidden.md", "行动", "待处理"),
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

test("inventory keeps canonical properties singular while discovering noncanonical fields", () => {
  const settings = system();
  const snapshots: PropertyNoteSnapshot[] = Array.from({ length: 10 }, (_, index) => ({
    path: `Home/Note ${index}.md`,
    basename: `Note ${index}`,
    frontmatter: {
      类型: "输入资料",
      状态: "待处理",
      领域: ["AI产品"],
      主题: [],
      内容类型: index % 2 ? "网页文章" : "文档",
      自定义来源: index % 2 ? "内部" : "外部",
    },
  }));
  const analysis = analyzePropertyInventory(snapshots, settings);
  const suggestion = analysis.suggestedDimensions.find((item) => item.name === "自定义来源");
  assert.equal(analysis.governedFiles, 10);
  assert.equal(suggestion?.valueType, "single");
  assert.equal(suggestion?.required, false);
  assert.equal(suggestion?.origin, "inferred");
  assert.deepEqual(suggestion?.allowedValues.sort(), ["内部", "外部"]);
  assert.equal(analysis.suggestedDimensions.filter((item) => item.name === "类型").length, 1);
  assert.equal(analysis.suggestedDimensions.filter((item) => item.name === "内容类型").length, 1);
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
  assert.equal(audit.automaticFiles, 0);
  assert.equal(audit.automaticOperations, 0);
  assert.equal(audit.manualIssues, 5);
});

test("retired duplicate and machine properties become guarded delete operations", () => {
  const settings = system();
  const audit = auditPropertySnapshots([{
    path: "Home/输入/新标题.md",
    basename: "新标题",
    frontmatter: {
      文件名: "旧标题",
      标题: "重复标题",
      capture_id: "job-1",
      KnowGrove采集状态: "已完成",
      类型: "知识笔记",
      状态: "已完成",
      领域: ["AI产品"],
      主题: ["知识管理"],
    },
  }], settings);
  const operations = audit.changes[0]?.operations.filter((operation) => operation.kind === "delete") ?? [];
  assert.deepEqual(operations.map((operation) => operation.property).sort(), [
    "KnowGrove采集状态",
    "capture_id",
    "文件名",
    "标题",
  ]);
  assert.ok(audit.issues.filter((issue) => issue.kind === "retired-property").every((issue) => issue.automatic));
});

test("audit migrates one legacy alias but reports alias conflicts", () => {
  const settings = system();
  const snapshots: PropertyNoteSnapshot[] = [
    {
      path: "Home/Legacy.md",
      basename: "Legacy",
      frontmatter: { type: "输入资料", status: "待处理", created: "2026-07-23", domain: "AI产品", topics: "知识管理", source_url: "https://example.com" },
    },
    {
      path: "Home/Conflict.md",
      basename: "Conflict",
      frontmatter: { 类型: "输入资料", 状态: "待处理", 创建时间: "2026-07-23", 来源链接: "https://example.com/a", source_url: "https://example.com/b" },
    },
  ];
  const audit = auditPropertySnapshots(snapshots, settings);
  const legacy = audit.changes.find((change) => change.path.endsWith("Legacy.md"));
  assert.equal(legacy?.operations.filter((operation) => operation.kind === "rename").length, 6);
  assert.ok(audit.issues.some((item) => item.path.endsWith("Conflict.md")
    && item.property === "来源链接"
    && item.kind === "alias-conflict"));
});

test("invalid enums are reported and never automatically overwritten", () => {
  const settings = system();
  const audit = auditPropertySnapshots([{
    path: "Home/Invalid.md",
    basename: "Invalid",
    frontmatter: { 类型: "神奇类型", 状态: "待处理", 创建时间: "2026-08-30", 领域: ["未知领域"] },
  }], settings);
  const invalid = audit.issues.filter((item) => item.kind === "invalid-value");
  assert.equal(invalid.length, 2);
  assert.ok(invalid.every((item) => item.automatic === false));
  assert.equal(audit.automaticFiles, 0);
});

test("historical lifecycle statuses are proposed as deterministic four-state migrations", () => {
  const settings = system();
  const audit = auditPropertySnapshots([
    { path: "Home/Pending.md", basename: "Pending", frontmatter: { 类型: "输入资料", 状态: "待整理", 创建时间: "2026-08-30" } },
    { path: "Home/Growing.md", basename: "Growing", frontmatter: { 类型: "知识笔记", 状态: "生长中" } },
    { path: "Home/Published.md", basename: "Published", frontmatter: { 类型: "内容输出", 状态: "已发布" } },
    { path: "Home/Cancelled.md", basename: "Cancelled", frontmatter: { 类型: "行动", status: "cancelled" } },
    { path: "Home/Unknown.md", basename: "Unknown", frontmatter: { 类型: "知识笔记", 状态: "自定义状态" } },
  ], settings);
  const statusChanges = audit.changes.flatMap((change) => change.operations)
    .filter((operation) => operation.property === "状态")
    .map((operation) => operation.after);
  assert.deepEqual(statusChanges, ["待处理", "进行中", "已完成", "已归档"]);
  assert.ok(audit.issues.some((item) => item.path === "Home/Unknown.md"
    && item.property === "状态"
    && item.automatic === false));
});

test("legacy content types and domains migrate to the adopted V2 vocabulary", () => {
  const audit = auditPropertySnapshots([{
    path: "Home/Legacy vocabulary.md",
    basename: "Legacy vocabulary",
    frontmatter: {
      类型: "输入资料",
      状态: "待处理",
      创建时间: "2026-08-30",
      内容类型: "邮件简报",
      领域: ["工作", "AI产品/智能体"],
      主题: ["[[知识管理]]"],
    },
  }], system());
  const operations = audit.changes[0]?.operations ?? [];
  assert.ok(operations.some((operation) => operation.property === "内容类型" && operation.after === "邮件"));
  assert.ok(operations.some((operation) => operation.property === "领域"
    && JSON.stringify(operation.after) === JSON.stringify(["职业与工作", "AI产品/AI应用与智能体"])));
  assert.ok(operations.some((operation) => operation.property === "主题"
    && JSON.stringify(operation.after) === JSON.stringify(["知识管理"])));
});

test("scalar legacy domains become one guarded canonical operation", () => {
  const audit = auditPropertySnapshots([{
    path: "Home/Scalar domain.md",
    basename: "Scalar domain",
    frontmatter: { 类型: "输入资料", 状态: "待处理", 创建时间: "2026-08-30", 领域: "工作" },
  }], system());
  const operations = audit.changes[0]?.operations.filter((operation) => operation.property === "领域") ?? [];
  assert.equal(operations.length, 1);
  assert.deepEqual(operations[0]?.before, "工作");
  assert.deepEqual(operations[0]?.after, ["职业与工作"]);
  const frontmatter: Record<string, unknown> = { 领域: "工作" };
  assert.equal(operationStillApplies(frontmatter, operations[0]!), true);
  applyOperation(frontmatter, operations[0]!);
  assert.deepEqual(frontmatter.领域, ["职业与工作"]);
});

test("single-item historical status lists become one canonical scalar in one audit", () => {
  const audit = auditPropertySnapshots([{
    path: "Home/ListStatus.md",
    basename: "ListStatus",
    frontmatter: { 类型: "输入资料", 状态: ["待整理"], 创建时间: "2026-08-30" },
  }], system());
  const operations = audit.changes[0]?.operations.filter((operation) => operation.property === "状态") ?? [];
  assert.equal(operations.length, 1);
  assert.deepEqual(operations[0]?.before, ["待整理"]);
  assert.equal(operations[0]?.after, "待处理");
  const frontmatter: Record<string, unknown> = { 状态: ["待整理"] };
  assert.equal(operationStillApplies(frontmatter, operations[0]!), true);
  applyOperation(frontmatter, operations[0]!);
  assert.equal(frontmatter.状态, "待处理");
});

test("user-defined enums stay open when new values appear", () => {
  const settings = system();
  settings.dimensions.push({
    id: "business-line",
    name: "业务线",
    description: "用户维护的业务字段",
    aliases: [],
    valueType: "single",
    required: false,
    origin: "user",
    allowedValues: ["旧项目"],
    fillStrategy: "none",
    defaultValue: "",
  });
  settings.dimensions = normalizePropertyDimensions(settings.dimensions, settings.creationDateProperty);
  const project = settings.dimensions.find((dimension) => dimension.name === "业务线");
  assert.equal(project?.enumMode, "open");
  const audit = auditPropertySnapshots([{
    path: "Home/New project.md",
    basename: "New project",
    frontmatter: {
      类型: "项目笔记",
      状态: "进行中",
      创建时间: "2026-08-30",
      领域: ["AI产品"],
      主题: ["知识管理"],
      业务线: "美团",
    },
  }], settings);
  assert.equal(audit.nonCompliantFiles, 0);
  assert.ok(!audit.issues.some((item) => item.property === "业务线"));
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
      frontmatter: { 类型: "输入资料", 状态: "待处理", 创建时间: "2026-07-23", 领域: ["AI产品"], 主题: ["知识管理"], 阅读状态: "未读" },
    },
    {
      path: "Home/Unknown reading.md",
      basename: "Unknown reading",
      frontmatter: { 类型: "输入资料", 状态: "待处理", 创建时间: "2026-07-23", 领域: ["AI产品"], 主题: ["知识管理"], 阅读状态: "待处理" },
    },
  ], settings, {
    reading: { propertyName: "阅读状态", readingValue: "在看", finishedValue: "已读" },
  });
  const unread = audit.changes.find((change) => change.path === "Home/Unread.md");
  assert.deepEqual(unread?.operations, [{
    kind: "delete",
    property: "阅读状态",
    before: "未读",
    reason: "未读由阅读状态缺省表示",
  }]);
  assert.ok(audit.issues.some((item) => item.path === "Home/Unknown reading.md"
    && item.property === "阅读状态"
    && item.automatic === false));
});

test("empty required semantic properties wait for confirmation instead of being guessed", () => {
  const settings = system();
  const audit = auditPropertySnapshots([{
    path: "Home/Empty lists.md",
    basename: "Empty lists",
    frontmatter: { 类型: "输入资料", 状态: "待处理", 创建时间: "2026-07-19", 领域: null, 主题: null },
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

test("new tracked note without frontmatter receives only deterministic minimal properties", () => {
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
    类型: "输入资料",
    状态: "待处理",
    创建时间: "2026-07-19",
  });
  assert.equal(Object.prototype.hasOwnProperty.call(frontmatter, "阅读状态"), false);
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
    类型: "输入资料",
    状态: "待处理",
    创建时间: "2026-07-19",
  });
  assert.equal(Object.prototype.hasOwnProperty.call(frontmatter, "领域"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(frontmatter, "主题"), false);
});

test("complete imported frontmatter keeps every value and property order", () => {
  const settings = system();
  const frontmatter: Record<string, unknown> = {
    来源链接: "[[网页来源]]",
    文件名: "采集器标题",
    类型: "知识笔记",
    状态: "待处理",
    创建时间: "2026-06-01",
    阅读状态: "已读",
    领域: ["AI产品"],
    主题: ["知识管理"],
    作者: "原作者",
  };
  const before = JSON.stringify(frontmatter);
  assert.equal(initializeTrackedNoteFrontmatter(
    frontmatter, "磁盘文件名", settings, "阅读状态", "在看", "2026-07-19",
  ), false);
  assert.equal(JSON.stringify(frontmatter), before);
  assert.equal(Object.keys(frontmatter)[0], "来源链接");
});

test("new tracked note with only reading status fills missing core properties", () => {
  const settings = system();
  const frontmatter: Record<string, unknown> = { 阅读状态: "在看" };
  initializeTrackedNoteFrontmatter(
    frontmatter, "Only status", settings, "阅读状态", "在看", "2026-07-19",
  );
  assert.equal(frontmatter.阅读状态, "在看");
  assert.equal(frontmatter.类型, "输入资料");
  assert.equal(frontmatter.状态, "待处理");
  assert.equal(Object.prototype.hasOwnProperty.call(frontmatter, "文件名"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(frontmatter, "领域"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(frontmatter, "主题"), false);
});

test("new external input does not create a plugin-owned bookmark property and preserves existing unknown fields", () => {
  const settings = system();
  const frontmatter: Record<string, unknown> = {};
  initializeTrackedNoteFrontmatter(
    frontmatter, "External", settings, "阅读状态", "在看", "2026-07-23",
  );
  assert.equal(Object.prototype.hasOwnProperty.call(frontmatter, "收藏"), false);

  const existing: Record<string, unknown> = { 收藏: true, 重点关注: true };
  initializeTrackedNoteFrontmatter(
    existing, "Existing", settings, "阅读状态", "在看", "2026-07-23",
  );
  assert.equal(existing.收藏, true);
  assert.equal(existing.重点关注, true);
  const audit = auditPropertySnapshots([{
    path: "Home/Existing.md",
    basename: "Existing",
    frontmatter: existing,
  }], settings);
  assert.equal(audit.issues.some((item) => item.property === "收藏" || item.property === "重点关注"), false);
  assert.equal(audit.changes.some((change) => change.operations.some(
    (operation) => operation.property === "收藏" || operation.property === "重点关注",
  )), false);
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
    来源链接: "[[可靠来源]]",
    作者: "采集器作者",
    类型: "知识笔记",
    主题: ["采集主题"],
    阅读状态: "待读",
    状态: "待处理",
    创建时间: "2026-07-19",
  });
  assert.equal(new Set(Object.keys(rewrittenByImporter)).size, Object.keys(rewrittenByImporter).length);
});

test("creation date is derived from the TFile ctime in local calendar time", () => {
  const timestamp = new Date(2026, 6, 19, 23, 30, 0).getTime();
  assert.equal(localDateFromTimestamp(timestamp), "2026-07-19");
});

test("creation date compliance applies to every ordinary note", () => {
  const settings = system();
  const audit = auditPropertySnapshots([
    {
      path: "Home/Input without date.md",
      basename: "Input without date",
      frontmatter: { 类型: "输入资料", 状态: "待处理" },
    },
    {
      path: "Home/Knowledge without date.md",
      basename: "Knowledge without date",
      frontmatter: { 类型: "知识笔记", 状态: "已完成" },
    },
  ], settings);
  assert.deepEqual(audit.compliantPaths, []);
  assert.deepEqual(audit.nonCompliantPaths, ["Home/Input without date.md", "Home/Knowledge without date.md"]);
  assert.ok(audit.issues.some((item) => item.property === "创建时间" && item.path.endsWith("Input without date.md")));
  assert.ok(audit.issues.some((item) => item.property === "创建时间" && item.path.endsWith("Knowledge without date.md")));
});

test("legacy inferred rules collapse into canonical fields without becoming requirements", () => {
  const defaults = system();
  const dimensions = normalizePropertyDimensions([
    ...defaults.dimensions,
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
  ], "创建时间", defaults.dimensions);
  const creation = dimensions.find((dimension) => dimension.name === "创建时间");
  const author = dimensions.find((dimension) => dimension.name === "作者");
  assert.equal(creation?.required, true);
  assert.deepEqual(creation?.requiredForTypes, []);
  assert.equal(creation?.origin, "system");
  assert.equal(author?.required, false);
  assert.equal(author?.origin, "system");
  assert.equal(author?.enumMode, "open");
  assert.deepEqual(author?.allowedValues, []);
  assert.equal(dimensions.filter((dimension) => dimension.name === "作者").length, 1);
  assert.deepEqual(
    dimensions.find((dimension) => dimension.name === "内容类型")?.allowedValues,
    ["网页文章", "研究报告", "视频", "音频", "图片", "PDF", "邮件", "文档"],
  );
});

test("schema migration removes retired and inferred dimensions while preserving explicit user fields", () => {
  const defaults = system();
  const dimensions = normalizePropertyDimensions([
    {
      id: "file-name",
      name: "文件名",
      description: "旧重复标题",
      aliases: ["title"],
      valueType: "text",
      required: true,
      origin: "system",
      allowedValues: [],
      fillStrategy: "file-name",
      defaultValue: "",
    },
    {
      ...defaults.dimensions.find((dimension) => dimension.name === "作者")!,
      enumMode: "closed",
      allowedValues: ["一次性作者 A", "一次性作者 B"],
    },
    {
      id: "generated-purpose",
      name: "用途",
      description: "扫描发现：覆盖 100 篇笔记",
      aliases: [],
      valueType: "single",
      required: false,
      origin: "inferred",
      allowedValues: ["一次性值"],
      fillStrategy: "none",
      defaultValue: "",
    },
    {
      id: "project-code",
      name: "项目代号",
      description: "用户维护的业务字段",
      aliases: [],
      valueType: "text",
      required: false,
      origin: "user",
      allowedValues: [],
      fillStrategy: "none",
      defaultValue: "",
    },
  ], "创建时间", defaults.dimensions);
  assert.equal(dimensions.some((dimension) => dimension.name === "文件名"), false);
  assert.equal(dimensions.some((dimension) => dimension.name === "用途"), false);
  assert.equal(dimensions.some((dimension) => dimension.name === "项目代号"), true);
  assert.deepEqual(dimensions.find((dimension) => dimension.name === "作者")?.allowedValues, []);
  assert.equal(dimensions.find((dimension) => dimension.name === "作者")?.enumMode, "open");
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
      frontmatter: { 类型: "项目笔记", 状态: "进行中", 创建时间: "2026-07-19", 领域: ["职业与工作"], 主题: ["项目管理"] },
    },
    {
      path: "Home/Input.md",
      basename: "Input",
      frontmatter: { 类型: "输入资料", 状态: "待处理", 创建时间: "2026-07-19", 领域: ["职业与工作"], 主题: ["项目管理"] },
    },
  ], settings);
  assert.deepEqual(audit.nonCompliantPaths, ["Home/Project.md"]);
  assert.ok(audit.issues.some((issue) => issue.path === "Home/Project.md" && issue.property === "交付物"));
  assert.ok(!audit.issues.some((issue) => issue.path === "Home/Input.md" && issue.property === "交付物"));
});

test("generated governance views remain formula-driven instead of embedding document paths", () => {
  const settings = system();
  const audit = auditPropertySnapshots([
    {
      path: "Home/Compliant.md",
      basename: "Compliant",
      frontmatter: { 类型: "知识笔记", 状态: "已完成", 创建时间: "2026-08-30" },
    },
    {
      path: "Home/Needs review.md",
      basename: "Needs review",
      frontmatter: {},
    },
  ], settings);
  const base = buildPropertyBase(settings, audit);
  assert.match(base, /name: "⚠️ 属性待确认"/);
  assert.match(base, /formula\.property_compliance == "待规范"/);
  assert.doesNotMatch(base, /Home\/Compliant\.md|Home\/Needs review\.md/);
  assert.ok(base.length < 12_000);
});

test("generated Base exposes one review queue and the unified lifecycle views", () => {
  const settings = system();
  settings.scopeFolder = "Home";
  settings.excludedFolders = ["Home/Skills"];
  const base = buildPropertyBase(settings);
  assert.match(base, /file\.inFolder\("Home"\)/);
  assert.match(base, /!file\.inFolder\("Home\/Skills"\)/);
  assert.match(base, /file\.basename != "AGENTS"/);
  assert.match(base, /file\.basename != "DESIGN"/);
  assert.match(base, /file\.basename != "SKILL"/);
  assert.match(base, /!file\.hasProperty\("文件名"\)/);
  for (const name of [
    "⚠️ 属性待确认",
    "待处理",
    "进行中",
    "已完成",
    "已归档",
  ]) assert.match(base, new RegExp(`name: "${name}"`));
  for (const removed of ["✅ 已符合规范", "📥 输入队列", "🌱 知识生长", "🚧 项目推进", "✅ 行动推进", "✍️ 内容输出"]) {
    assert.doesNotMatch(base, new RegExp(`name: "${removed}"`));
  }
  assert.match(base, /formula\.property_compliance/);
  assert.match(base, /knowgrove_managed:/);
  assert.equal(base.match(/    sort:/g)?.length, 5);
  assert.equal(base.match(/      - property: file\.mtime\n        direction: DESC/g)?.length, 5);
  for (const status of ["待处理", "进行中", "已完成", "已归档"]) {
    assert.match(base, new RegExp(`状态 == "${status}"`));
  }
  for (const retired of ["待整理", "待归类", "待沉淀", "处理失败"]) assert.doesNotMatch(base, new RegExp(`状态 == "${retired}"`));
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

test("generated Base requires creation time for all ordinary notes and keeps exclusions", () => {
  const base = buildPropertyBase(system());
  const compliance = base.split("\n").find((line) => line.startsWith("  property_compliance:")) ?? "";
  assert.match(compliance, /file\.hasProperty\("创建时间"\)/);
  assert.equal(compliance.match(/file\.hasProperty\("创建时间"\)/g)?.length, 1);
  assert.match(compliance, /\["待处理","进行中","已完成","已归档"\]\.contains\(note\["状态"\]\)/);
  assert.match(compliance, /note\["主题"\]\.length <= 3/);
  assert.match(compliance, /!file\.hasProperty\("title"\)/);
  assert.match(compliance, /!file\.hasProperty\("capture_id"\)/);
  for (const folder of [
    "_KnowGrove",
    "Home/🕹️skills",
    "Home/🐘项目/亚马逊经营助手/知识库",
    "Home/🐘项目/亚马逊经营助手/amazon-seller-analyst",
  ]) assert.match(base, new RegExp(`!file\\.inFolder\\("${folder}"\\)`));
  for (const status of ["待处理", "进行中", "已完成", "已归档"]) assert.match(base, new RegExp(`状态 == "${status}"`));
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
  assert.match(compliance, /\(\(类型 != "项目笔记"\) \|\| \(file\.hasProperty\("交付物"\)/);
});
