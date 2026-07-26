import test from "node:test";
import assert from "node:assert/strict";
import {
  applyTaxonomyToDimensions,
  buildAITaxonomyPrompt,
  domainPaths,
  parseAITaxonomyResponse,
  parseDomainPaths,
} from "../src/property-taxonomy";
import { createDefaultSettings } from "../src/types";

test("domain paths form a deduplicated hierarchy with at most two levels", () => {
  const domains = parseDomainPaths([
    "AI产品",
    "AI产品/智能体",
    "AI产品/大模型应用",
    "AI产品/智能体/不会成为第三级",
    "投资/资产配置",
    "投资/资产配置",
  ].join("\n"));

  assert.deepEqual(domains, [
    { name: "AI产品", children: ["智能体", "大模型应用"] },
    { name: "投资", children: ["资产配置"] },
  ]);
  assert.deepEqual(domainPaths(domains), [
    "AI产品",
    "AI产品/智能体",
    "AI产品/大模型应用",
    "投资",
    "投资/资产配置",
  ]);
});

test("AI taxonomy response accepts only a bounded two-level tree", () => {
  const proposal = parseAITaxonomyResponse(JSON.stringify({
    summary: "把工具名和临时项目留给主题，只保留长期稳定的领域。",
    domains: [
      { name: "AI产品", children: ["智能体", "大模型应用", "智能体", "无效/三级"] },
      { name: "无效/路径", children: ["忽略"] },
      { name: "内容创作", children: ["产品拆解"] },
    ],
    confidence: 1.4,
  }), new Date("2026-07-19T10:00:00.000Z"));

  assert.deepEqual(proposal.domains, [
    { name: "AI产品", children: ["智能体", "大模型应用"] },
    { name: "内容创作", children: ["产品拆解"] },
  ]);
  assert.equal(proposal.confidence, 1);
  assert.equal(proposal.generatedAt, "2026-07-19T10:00:00.000Z");
});

test("adopting a taxonomy updates semantic contracts but preserves custom dimensions", () => {
  const defaults = createDefaultSettings();
  const custom = {
    id: "author",
    name: "作者",
    aliases: [],
    valueType: "text" as const,
    required: false,
    requiredForTypes: [],
    allowedValues: [],
    maxValues: 1,
    aiManaged: false,
  };
  const taxonomy = {
    version: 1 as const,
    strategy: "four-layer-pdsa" as const,
    source: "ai" as const,
    domains: [{ name: "AI产品", children: ["智能体", "大模型应用"] }],
  };
  const dimensions = applyTaxonomyToDimensions(
    [...defaults.propertySystem.dimensions, custom],
    defaults.propertySystem.dimensions,
    taxonomy,
  );

  assert.ok(dimensions.some((dimension) => dimension.name === "作者" && !dimension.aiManaged));
  assert.equal(dimensions.find((dimension) => dimension.name === "文件名")?.aiManaged, false);
  assert.deepEqual(
    dimensions.filter((dimension) => ["类型", "状态", "领域", "主题"].includes(dimension.name))
      .map((dimension) => [dimension.name, dimension.aiManaged]),
    [["类型", true], ["状态", true], ["领域", true], ["主题", true]],
  );
  assert.deepEqual(
    dimensions.find((dimension) => dimension.name === "领域")?.allowedValues,
    ["AI产品", "AI产品/智能体", "AI产品/大模型应用"],
  );
});

test("taxonomy prompt constrains AI to the four-layer method and domain-only output", () => {
  const prompt = buildAITaxonomyPrompt({
    currentDomains: ["AI产品"],
    observedDomains: [{ value: "AI产品", count: 42 }],
    observedTopics: [{ value: "Agent记忆", count: 12 }],
    samples: [{ path: "Home/输入/示例.md", title: "示例", type: "输入资料", domains: ["AI产品"], topics: ["Agent记忆"] }],
  });

  assert.match(prompt, /四层正交结构/);
  assert.match(prompt, /最多两级/);
  assert.match(prompt, /你只建议领域树/);
  assert.match(prompt, /不重复创造类型、状态或主题字段/);
});
