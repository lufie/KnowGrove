import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAIBatchPropertyPrompt,
  buildAIPropertyPrompt,
  isEmptyPropertyValue,
  parseAIBatchPropertyResponse,
  parseAIPropertyResponse,
  pendingAIManagedDimensions,
  truncateForAI,
} from "../src/ai-property";
import { createDefaultSettings } from "../src/types";
import {
  automaticAIContentCharacterLimit,
  buildAntigravityArguments,
  formatCLIProviderError,
  providerModelOptions,
} from "../src/ai-provider-utils";

function semanticDimensions() {
  return createDefaultSettings().propertySystem.dimensions.filter((dimension) => dimension.aiManaged);
}

test("AI prompt is fixed, bounded, and excludes secret-like frontmatter", () => {
  const prompt = buildAIPropertyPrompt({
    path: "Home/Inbox/Example.md",
    basename: "Example",
    body: "A".repeat(20_000),
    frontmatter: { 类型: "输入资料", api_key: "must-not-leak", 作者: "Alice" },
    dimensions: semanticDimensions(),
    maxContentCharacters: 4_000,
  });
  assert.match(prompt, /只返回 JSON/);
  assert.match(prompt, /"name":"领域"/);
  assert.match(prompt, /"name":"主题"/);
  assert.match(prompt, /中间内容已由插件截断/);
  assert.doesNotMatch(prompt, /must-not-leak/);
  assert.ok(prompt.length < 8_000);
});

test("AI response obeys allowed values, value types, and field limits", () => {
  const result = parseAIPropertyResponse([
    "```json",
    JSON.stringify({
      properties: {
        领域: ["AI产品", "未知领域", "内容创作"],
        主题: ["知识管理", "Agent记忆", "自动分类", "工作流", "标签治理", "超额主题"],
        未知字段: "忽略",
      },
      confidence: 1.2,
      reason: "正文主要讨论 AI 知识管理。",
    }),
    "```",
  ].join("\n"), semanticDimensions(), { 类型: "输入资料" });
  assert.deepEqual(result.properties, {
    领域: ["AI产品", "内容创作"],
    主题: ["知识管理", "Agent记忆", "自动分类", "工作流", "标签治理"],
  });
  assert.equal(result.confidence, 1);
  assert.equal(result.reason, "正文主要讨论 AI 知识管理。");
});

test("open enums use learned values as suggestions without rejecting new values", () => {
  const dimension = {
    ...semanticDimensions().find((item) => item.name === "主题")!,
    enumMode: "open" as const,
    allowedValues: ["既有主题"],
  };
  const prompt = buildAIPropertyPrompt({
    path: "Home/Open enum.md",
    basename: "Open enum",
    body: "讨论一个全新的知识方向。",
    frontmatter: {},
    dimensions: [dimension],
    maxContentCharacters: 4_000,
  });
  assert.match(prompt, /"enumMode":"open"/);
  assert.match(prompt, /"suggestedValues":\["既有主题"\]/);
  assert.doesNotMatch(prompt, /"allowedValues":\["既有主题"\]/);
  const parsed = parseAIPropertyResponse(
    JSON.stringify({ properties: { 主题: ["全新主题"] } }),
    [dimension],
    {},
  );
  assert.deepEqual(parsed.properties, { 主题: ["全新主题"] });
});

test("AI response never accepts empty semantic values", () => {
  assert.throws(() => parseAIPropertyResponse(
    JSON.stringify({ properties: { 领域: [], 主题: "" } }),
    semanticDimensions(),
    {},
  ), /没有符合当前属性契约/);
});

test("pending AI dimensions preserve existing values unless refresh is explicit", () => {
  const dimensions = semanticDimensions();
  assert.deepEqual(
    pendingAIManagedDimensions(dimensions, { 领域: ["AI产品"] }, false).map((dimension) => dimension.name),
    ["类型", "状态", "主题"],
  );
  assert.deepEqual(
    pendingAIManagedDimensions(dimensions, { 领域: ["AI产品"] }, true).map((dimension) => dimension.name),
    ["类型", "状态", "领域", "主题"],
  );
});

test("empty detection and truncation remain deterministic", () => {
  assert.equal(isEmptyPropertyValue([]), true);
  assert.equal(isEmptyPropertyValue(["AI产品"]), false);
  assert.equal(isEmptyPropertyValue(""), true);
  assert.equal(truncateForAI("short", 4_000), "short");
});

test("batch AI prompt shares the taxonomy and keeps exact note paths", () => {
  const dimensions = semanticDimensions().filter((dimension) => dimension.name === "领域" || dimension.name === "主题");
  const prompt = buildAIBatchPropertyPrompt([
    {
      path: "Home/输入/A.md",
      basename: "A",
      body: "讨论 AI 产品和智能体。",
      frontmatter: { 类型: "输入资料" },
      dimensions,
    },
  ], createDefaultSettings().propertySystem.taxonomy, 3_000);
  assert.match(prompt, /\"items\"/);
  assert.match(prompt, /Home\/输入\/A\.md/);
  assert.match(prompt, /四层分类协议/);
  assert.ok(prompt.length < 8_000);
});

test("batch AI response ignores unknown paths and preserves valid items", () => {
  const dimensions = semanticDimensions().filter((dimension) => dimension.name === "领域" || dimension.name === "主题");
  const items = [
    {
      path: "Home/输入/A.md",
      basename: "A",
      body: "A",
      frontmatter: { 类型: "输入资料" },
      dimensions,
    },
  ];
  const results = parseAIBatchPropertyResponse(JSON.stringify({
    items: [
      { path: "unknown.md", properties: { 主题: ["忽略"] } },
      { path: "Home/输入/A.md", properties: { 领域: ["AI产品"], 主题: ["智能体"] }, confidence: 0.8 },
    ],
  }), items);
  assert.deepEqual(results.get("Home/输入/A.md")?.properties, { 领域: ["AI产品"], 主题: ["智能体"] });
  assert.equal(results.has("unknown.md"), false);
});

test("provider model dropdown keeps detected defaults and exposes safe fallbacks", () => {
  assert.deepEqual(providerModelOptions("qoder-cli", {
    id: "qoder-cli", name: "Qoder CLI", available: true, detail: "ok", configuredModel: "ultimate",
  }), ["ultimate"]);
  assert.deepEqual(providerModelOptions("glm-cli"), ["glm-5.2", "glm-5.1", "glm-5-turbo", "glm-4.5-air"]);
});

test("AI content limit is automatic and conservative for unknown local models", () => {
  assert.equal(automaticAIContentCharacterLimit("codex-cli"), 24_000);
  assert.equal(automaticAIContentCharacterLimit("openai-compatible", "gpt-5.1"), 24_000);
  assert.equal(automaticAIContentCharacterLimit("openai-compatible", "unknown-local-model"), 12_000);
});

test("known CLI authentication and backend errors become actionable", () => {
  assert.match(
    formatCLIProviderError("qoder-cli", "Qoder API error: FORBIDDEN - pricingUrl", "fallback"),
    /套餐/,
  );
  assert.match(
    formatCLIProviderError("antigravity-cli", "Error: Agent execution terminated due to error.", "fallback"),
    /服务地区/,
  );
});

test("Antigravity passes the prompt after print mode instead of stdin", () => {
  assert.deepEqual(
    buildAntigravityArguments("Claude Opus 4.6 (Thinking)", "只返回 JSON"),
    ["--sandbox", "--model", "Claude Opus 4.6 (Thinking)", "--print", "只返回 JSON"],
  );
});
