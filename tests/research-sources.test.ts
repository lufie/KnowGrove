import assert from "node:assert/strict";
import test from "node:test";
import {
  buildResearchSourceScreeningPrompt,
  ensureResearchSourceBrowser,
  normalizeResearchSourcePath,
  normalizeResearchSourceState,
  parseResearchSourceScreeningResponse,
  researchSourceStatePath,
} from "../src/research-sources";

test("research candidates live in a sidecar and the interactive browser stays at the note end", () => {
  const original = [
    "---",
    "候选资料:",
    "  - '[[Home/A]]'",
    "---",
    "# 课题",
    "",
    "## 相关资料",
    "",
    "![[_KnowGrove/课题/主题/课题.base#相关候选]]",
    "",
    "### 已采用资料",
    "",
    "![[_KnowGrove/课题/主题/课题.base#已采用资料]]",
    "",
    "## 人工正文",
    "",
    "不能改。",
    "",
  ].join("\n");
  const upgraded = ensureResearchSourceBrowser(original);
  assert.doesNotMatch(upgraded, /## 相关资料/);
  assert.match(upgraded, /## 人工正文\n\n不能改。/);
  assert.ok(upgraded.trimEnd().endsWith("```knowgrove-research-sources\n```"));
  assert.equal(ensureResearchSourceBrowser(upgraded), upgraded);
  assert.equal(researchSourceStatePath("_KnowGrove/课题/主题/课题.md"), "_KnowGrove/课题/主题/课题.knowgrove-sources.json");
  const older = "# 课题\n\n## 研究资料\n\n![[_KnowGrove/课题/主题/课题.base#研究资料]]\n\n## 人工正文\n\n保留。\n";
  const olderUpgraded = ensureResearchSourceBrowser(older);
  assert.doesNotMatch(olderUpgraded, /## 研究资料/);
  assert.match(olderUpgraded, /## 人工正文\n\n保留。/);
});

test("research source state remembers rejected paths without exposing them as candidates", () => {
  const state = normalizeResearchSourceState({
    adopted: ["Home/A.md", "Home/B.md"],
    candidates: ["Home/A.md", "Home/B.md", "Home/A.md"],
    rejected: ["Home/B.md"],
  });
  assert.deepEqual(state.adopted, ["Home/A.md"]);
  assert.deepEqual(state.candidates, ["Home/A.md"]);
  assert.deepEqual(state.rejected, ["Home/B.md"]);
  assert.equal(normalizeResearchSourcePath("[[_KnowGrove/Note|别名]]"), "_KnowGrove/Note.md");
});

test("AI source screening accepts only exact candidate paths and valid decisions", () => {
  const topic = { name: "宏观政策", coreQuestion: "政策如何影响增长？", parentThemeName: "宏观经济", domains: ["投资"] };
  const source = {
    path: "Home/A.md",
    basename: "财政政策",
    type: "输入资料",
    status: "待处理",
    domains: ["投资"],
    topics: ["宏观经济"],
    stage: "P" as const,
    modifiedAt: 1,
    excerpt: "讨论财政支出与增长。",
  };
  const prompt = buildResearchSourceScreeningPrompt(topic, [source]);
  assert.match(prompt, /仅仅同领域、偶然提词、泛泛背景都判为不相关/);
  const decisions = parseResearchSourceScreeningResponse(`\`\`\`json\n${JSON.stringify({
    results: [
      { path: "Home/A.md", decision: "相关", reason: "直接讨论财政政策" },
      { path: "Invented.md", decision: "相关", reason: "不存在" },
      { path: "Home/A.md", decision: "也许", reason: "无效枚举" },
    ],
  })}\n\`\`\``, ["Home/A.md"]);
  assert.deepEqual(decisions, [{ path: "Home/A.md", decision: "相关", reason: "直接讨论财政政策" }]);
});
