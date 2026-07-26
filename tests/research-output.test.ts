import assert from "node:assert/strict";
import test from "node:test";
import {
  RESEARCH_OUTPUT_END,
  RESEARCH_OUTPUT_PRESETS,
  RESEARCH_OUTPUT_START,
  batchResearchOutputChunks,
  buildResearchEvidencePrompt,
  buildResearchEvidenceAuditPrompt,
  buildResearchRewritePrompt,
  buildChannelDerivativeNote,
  buildChannelDerivativePrompt,
  buildResearchOutputNote,
  buildResearchOutputPlanPrompt,
  buildResearchOutputPrompt,
  buildResearchOutputState,
  chunkResearchOutputSources,
  findMarkdownSection,
  mergeResearchEvidenceDigests,
  mergeResearchOutput,
  normalizeResearchOutput,
  normalizeResearchOutputState,
  parseResearchEvidenceAuditResponse,
  parseResearchEvidenceResponse,
  parseResearchOutputPlanResponse,
  researchOutputStatePath,
  type ResearchOutputDraft,
  type ResearchOutputPlan,
} from "../src/research-output";

const topic = {
  name: "中国26年经济政策",
  coreQuestion: "政策如何影响增长？",
  parentThemeName: "宏观经济",
  domains: ["投资"],
  workspacePath: "_KnowGrove/课题/宏观经济/中国26年经济政策.md",
};

const draft: ResearchOutputDraft = {
  title: "一文讲清楚宏观政策",
  presetId: "wechat",
  goal: "解释政策变化",
  audience: "普通投资者",
  coreMessage: "政策影响存在时滞",
  language: "中文",
  style: "克制",
  selectedPaths: ["Home/宏观.md", "Home/政策.md"],
};

const plan: ResearchOutputPlan = {
  title: draft.title,
  summary: "从政策工具、传导机制和风险展开。",
  sections: [{
    heading: "政策工具",
    purpose: "说明政策使用了什么工具",
    evidencePaths: ["Home/宏观.md"],
    evidenceStatus: "证据充分",
  }],
  imageIdeas: [{
    title: "政策传导路径",
    purpose: "解释政策如何影响需求",
    format: "流程图",
    prompt: "克制的信息图，展示政策到需求的传导路径",
    evidencePaths: ["Home/宏观.md"],
  }],
  evidence: [{
    path: "Home/宏观.md",
    title: "宏观",
    summary: "政策通过利率影响需求。",
    keyPoints: ["政策存在传导时滞"],
    quotes: ["政策效果不会立即出现"],
  }],
};

test("creation studio exposes all approved publishing and research presets", () => {
  const ids = new Set(RESEARCH_OUTPUT_PRESETS.map((preset) => preset.id));
  for (const id of ["wechat", "xiaohongshu", "medium", "twitter", "reddit", "longform", "research-report", "outline"]) {
    assert.equal(ids.has(id as never), true);
  }
});

test("source chunking and batching keep every selected source instead of silently taking the first twelve", () => {
  const sources = Array.from({ length: 20 }, (_, index) => ({
    path: `Home/${index}.md`,
    title: `资料 ${index}`,
    content: `${index}-`.repeat(2_000),
  }));
  const chunks = chunkResearchOutputSources(sources, 1_000);
  const batches = batchResearchOutputChunks(chunks, 5_000);
  assert.equal(new Set(chunks.map((chunk) => chunk.path)).size, 20);
  assert.equal(batches.flat().length, chunks.length);
  assert.ok(batches.length > 1);
});

test("evidence extraction keeps exact local paths and merges multi-chunk results", () => {
  const chunks = chunkResearchOutputSources([
    { path: "Home/宏观.md", title: "宏观", content: "资料正文".repeat(500) },
  ], 1_000);
  const prompt = buildResearchEvidencePrompt(topic, chunks);
  assert.match(prompt, /不搜索网络/);
  assert.match(prompt, /Home\/宏观\.md/);
  const parsed = parseResearchEvidenceResponse(JSON.stringify({
    evidence: [
      { path: "Home/宏观.md", title: "宏观", summary: "摘要一", keyPoints: ["A"], quotes: ["原文一"] },
      { path: "Home/宏观.md", title: "宏观", summary: "摘要二", keyPoints: ["B"], quotes: ["原文二"] },
      { path: "Home/不存在.md", title: "伪造", summary: "不接受" },
    ],
  }), [{ path: "Home/宏观.md", title: "宏观" }]);
  const merged = mergeResearchEvidenceDigests(parsed);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0]?.keyPoints, ["A", "B"]);
  assert.doesNotMatch(JSON.stringify(merged), /不存在/);
});

test("plan generation is evidence-bound and rejects invented paths", () => {
  const prompt = buildResearchOutputPlanPrompt(topic, plan.evidence, draft);
  assert.match(prompt, /先生成可编辑提纲/);
  assert.match(prompt, /配图建议/);
  const parsed = parseResearchOutputPlanResponse(JSON.stringify({
    title: draft.title,
    summary: "方向摘要",
    sections: [{
      heading: "政策工具",
      purpose: "解释工具",
      evidencePaths: ["Home/宏观.md", "Home/伪造.md"],
      evidenceStatus: "证据充分",
    }],
    imageIdeas: [{
      title: "政策路径",
      purpose: "解释传导",
      format: "流程图",
      prompt: "绘制政策传导路径",
      evidencePaths: ["Home/宏观.md", "Home/伪造.md"],
    }],
  }), ["Home/宏观.md"], plan.evidence, draft.title);
  assert.deepEqual(parsed.sections[0]?.evidencePaths, ["Home/宏观.md"]);
  assert.deepEqual(parsed.imageIdeas[0]?.evidencePaths, ["Home/宏观.md"]);
});

test("research output prompt follows the confirmed outline and preserves evidence boundaries", () => {
  const prompt = buildResearchOutputPrompt(topic, plan, draft);
  assert.match(prompt, /不搜索网络、不虚构事实/);
  assert.match(prompt, /已确认提纲/);
  assert.match(prompt, /\[\[精确来源路径\]\]/);
  assert.match(prompt, /Home\/宏观\.md/);
});

test("research output updates only its managed block", () => {
  const first = mergeResearchOutput("# 课题\n\n人工内容\n", "AI 输出草稿", "第一版");
  assert.match(first, new RegExp(RESEARCH_OUTPUT_START));
  const second = mergeResearchOutput(first, "AI 输出草稿", "第二版");
  assert.match(second, /人工内容/);
  assert.doesNotMatch(second, /第一版/);
  assert.match(second, /第二版/);
  assert.match(second, new RegExp(RESEARCH_OUTPUT_END));
});

test("new creation output is a native editable note with a collapsed image plan", () => {
  const note = buildResearchOutputNote(topic, draft, plan, "正文 [[Home/宏观]]", "2026-07-26");
  assert.match(note, /类型: 内容输出/);
  assert.doesNotMatch(note, /^创作方向:/m);
  assert.doesNotMatch(note, /^来源课题:/m);
  assert.match(note, /> \[!info\]- 创作信息与配图方案/);
  assert.match(note, /> - 来源课题：\[\[_KnowGrove\/课题\/宏观经济\/中国26年经济政策\]\]/);
  assert.match(note, /> - 创作方向：微信公众号/);
  assert.doesNotMatch(note, /file:\/\//);
  assert.equal(normalizeResearchOutput("```markdown\n# 标题\n```"), "# 标题");
});

test("creation state keeps sources and versions in a synchronized sidecar instead of a huge frontmatter list", () => {
  const outputPath = "_KnowGrove/输出/宏观政策输出.md";
  const state = buildResearchOutputState(outputPath, topic.workspacePath, draft, plan, "正文", "2026-07-26T00:00:00.000Z");
  assert.equal(researchOutputStatePath(outputPath), "_KnowGrove/.data/outputs/宏观政策输出.json");
  assert.deepEqual(state.draft.selectedPaths, ["Home/宏观.md", "Home/政策.md"]);
  assert.equal(state.versions[0]?.label, "AI 初稿");
  assert.equal(state.versions[0]?.content, "正文");
  assert.equal(state.version, 2);
  assert.deepEqual(state.generatedImages, []);
});

test("legacy creation state upgrades without losing sources or versions", () => {
  const legacy = {
    version: 1,
    outputPath: "_KnowGrove/输出/旧作品.md",
    topicPath: topic.workspacePath,
    createdAt: "2026-07-26T00:00:00.000Z",
    updatedAt: "2026-07-26T00:00:00.000Z",
    draft,
    plan,
    versions: [{ id: "v1", createdAt: "2026-07-26T00:00:00.000Z", label: "AI 初稿", content: "正文" }],
  };
  const normalized = normalizeResearchOutputState(legacy);
  assert.equal(normalized?.version, 2);
  assert.equal(normalized?.versions[0]?.content, "正文");
  assert.deepEqual(normalized?.generatedImages, []);
});

test("evidence audit accepts only known paths and fixed statuses", () => {
  const prompt = buildResearchEvidenceAuditPrompt("增长将在明年翻倍。", plan.evidence, ["Home/宏观.md"]);
  assert.match(prompt, /不搜索网络/);
  const claims = parseResearchEvidenceAuditResponse(JSON.stringify({
    claims: [
      {
        text: "增长将在明年翻倍。",
        status: "依据不足",
        evidencePaths: ["Home/宏观.md", "Home/伪造.md"],
        reason: "材料没有给出该预测。",
      },
      { text: "无效", status: "模型自信", evidencePaths: [] },
    ],
  }), ["Home/宏观.md"]);
  assert.equal(claims.length, 1);
  assert.deepEqual(claims[0]?.evidencePaths, ["Home/宏观.md"]);
  assert.equal(claims[0]?.status, "依据不足");
});

test("selection rewrite and channel derivative preserve evidence and never request in-place overwrite", () => {
  const rewrite = buildResearchRewritePrompt("政策影响增长。", "补充证据", "保持克制", plan.evidence);
  assert.match(rewrite, /只改写用户选中的内容/);
  assert.match(rewrite, /\[\[精确来源路径\]\]/);
  const derivative = buildChannelDerivativePrompt("原稿 [[Home/宏观]]", draft, "reddit", "Reddit 版", "");
  assert.match(derivative, /另一个渠道/);
  assert.match(derivative, /标题候选、摘要、正文、行动引导、配图简报、发布前检查/);
  const note = buildChannelDerivativeNote(
    "Reddit 版",
    "reddit",
    "_KnowGrove/输出/原稿.md",
    "派生正文",
    "2026-07-26",
  );
  assert.match(note, /> - 派生自：\[\[_KnowGrove\/输出\/原稿\]\]/);
  assert.match(note, /> - 创作方向：Reddit/);
  assert.doesNotMatch(note, /file:\/\//);
});

test("section regeneration finds exactly one Markdown section without touching its neighbors", () => {
  const content = "# 标题\n\n## 背景\n\n背景正文\n\n### 细节\n\n细节正文\n\n## 结论\n\n结论正文\n";
  const section = findMarkdownSection(content, "背景");
  assert.ok(section);
  assert.match(section.content, /### 细节/);
  assert.doesNotMatch(section.content, /## 结论/);
  assert.equal(content.slice(0, section.start), "# 标题\n\n");
});
