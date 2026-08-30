import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTopicIndexEntries,
  filterTopicIndexEntries,
  flattenTopicIndexEntries,
  includeTopicIndexAncestors,
} from "../src/topic-index";
import type { KnowledgeThemeDocument, KnowledgeThemeSummary } from "../src/types";

const documents: KnowledgeThemeDocument[] = [
  { path: "Home/A.md", basename: "金融入门", type: "输入资料", status: "待处理", domains: ["投资"], topics: ["金融常识", "理财规划"], stage: "P", modifiedAt: 20 },
  { path: "Home/B.md", basename: "预算方法", type: "知识笔记", status: "进行中", domains: ["生活"], topics: ["理财规划"], stage: "D", modifiedAt: 10 },
];

function theme(overrides: Partial<KnowledgeThemeSummary> & Pick<KnowledgeThemeSummary, "name">): KnowledgeThemeSummary {
  return {
    name: overrides.name,
    parentName: overrides.parentName,
    domains: overrides.domains ?? [],
    total: overrides.total ?? 0,
    stageCounts: overrides.stageCounts ?? { P: 0, D: 0, S: 0, A: 0 },
    currentStage: overrides.currentStage ?? "P",
    fixed: overrides.fixed ?? false,
    workspaceExists: overrides.workspaceExists ?? false,
    workspacePath: overrides.workspacePath ?? `_KnowGrove/主题空间/${overrides.name}.md`,
    basePath: overrides.basePath ?? `_KnowGrove/主题空间/${overrides.name}.base`,
    researchQuestions: overrides.researchQuestions ?? [],
    researchTopics: overrides.researchTopics ?? [],
    explicitSourcePaths: overrides.explicitSourcePaths ?? [],
    documents: overrides.documents ?? [],
    suggestedDocuments: overrides.suggestedDocuments ?? [],
  };
}

test("topic index exposes one-note raw properties without the workbench three-note gate", () => {
  const entries = buildTopicIndexEntries([
    theme({ name: "金融常识", domains: ["投资"] }),
    theme({ name: "理财规划", domains: ["投资"], fixed: true }),
  ], documents);
  const finance = entries.find((entry) => entry.name === "金融常识");
  assert.ok(finance);
  assert.equal(finance.fixed, false);
  assert.deepEqual(finance.documents.map((document) => document.path), ["Home/A.md"]);
});

test("topic index uses raw topic properties instead of a formal workspace explicit source range", () => {
  const entries = buildTopicIndexEntries([
    theme({
      name: "金融常识",
      domains: ["投资"],
      fixed: true,
      documents: [documents[1]!],
    }),
  ], documents);
  assert.deepEqual(entries[0]?.documents.map((document) => document.path), ["Home/A.md"]);
});

test("topic index searches names, domains, document titles, and paths without grouping by domain", () => {
  const entries = buildTopicIndexEntries([
    theme({ name: "金融常识", domains: ["投资"] }),
    theme({ name: "理财规划", domains: ["生活"] }),
  ], documents);
  assert.deepEqual(filterTopicIndexEntries(entries, "金融入门").map((entry) => entry.name), ["理财规划", "金融常识"]);
  assert.deepEqual(filterTopicIndexEntries(entries, "投资").map((entry) => entry.name), ["金融常识"]);
  assert.deepEqual(flattenTopicIndexEntries(entries).map(({ entry, depth }) => [entry.name, depth]), [
    ["理财规划", 0],
    ["金融常识", 0],
  ]);
});

test("topic index only nests topics with an explicit parent relationship", () => {
  const entries = buildTopicIndexEntries([
    theme({ name: "投资", fixed: true }),
    theme({ name: "宏观经济", parentName: "投资", fixed: true }),
    theme({ name: "金融常识", domains: ["投资"] }),
  ], documents);
  const depthByName = Object.fromEntries(flattenTopicIndexEntries(entries).map(({ entry, depth }) => [entry.name, depth]));
  assert.deepEqual(depthByName, { 金融常识: 0, 投资: 0, 宏观经济: 1 });
});

test("topic search keeps explicit ancestors visible and cyclic parents stay usable", () => {
  const entries = buildTopicIndexEntries([
    theme({ name: "投资", parentName: "宏观经济", fixed: true }),
    theme({ name: "宏观经济", parentName: "投资", fixed: true }),
    theme({ name: "货币政策", parentName: "宏观经济", fixed: true }),
  ], documents);
  const matches = filterTopicIndexEntries(entries, "货币政策");
  const visible = includeTopicIndexAncestors(matches, entries);
  assert.deepEqual(new Set(visible.map((entry) => entry.name)), new Set(["投资", "宏观经济", "货币政策"]));
  assert.deepEqual(new Set(flattenTopicIndexEntries(entries).map(({ entry }) => entry.name)), new Set([
    "投资",
    "宏观经济",
    "货币政策",
  ]));
});
