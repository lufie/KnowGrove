import assert from "node:assert/strict";
import test from "node:test";
import {
  findMarkdownBlockRange,
  formatBlockEmbedInsertion,
  parseObsidianBlockEmbedSource,
  renderObsidianBlockEmbed,
  stripOwnBlockAnchor,
} from "../src/block-drag";
import { createDefaultSettings } from "../src/types";

test("block reference dragging is enabled by default", () => {
  assert.equal(createDefaultSettings().enableBlockDragReferences, true);
});

test("expands a partial paragraph selection to its complete Markdown block", () => {
  const content = "# 标题\n\n第一行内容\n仍属于同一个段落\n\n下一段";
  const start = content.indexOf("内容");
  const range = findMarkdownBlockRange(content, start, start + 2);
  assert.deepEqual(range, {
    start: content.indexOf("第一行"),
    end: content.indexOf("\n\n下一段"),
    text: "第一行内容\n仍属于同一个段落",
  });
});

test("keeps a heading as its own block even without a following blank line", () => {
  const content = "## 宏观经济\n正文说明";
  const start = content.indexOf("宏观");
  assert.equal(findMarkdownBlockRange(content, start, start + 2)?.text, "## 宏观经济");
});

test("expands a list item selection to the contiguous list block", () => {
  const content = "前言\n\n- 第一项\n  延续说明\n- 第二项\n\n结尾";
  const start = content.indexOf("延续");
  assert.equal(findMarkdownBlockRange(content, start, start + 2)?.text, "- 第一项\n  延续说明\n- 第二项");
});

test("expands code selections to the complete fenced code block", () => {
  const content = "说明\n\n```ts\nconst answer = 42;\n```\n\n结尾";
  const start = content.indexOf("answer");
  assert.equal(findMarkdownBlockRange(content, start, start + 6)?.text, "```ts\nconst answer = 42;\n```");
});

test("renders a native Obsidian block embed without an absolute file URI", () => {
  const embed = renderObsidianBlockEmbed("Home/📬输入/宏观经济.md", "rr-demo");
  assert.equal(embed, "![[Home/📬输入/宏观经济#^rr-demo]]");
  assert.equal(embed.includes("file:///"), false);
});

test("inserts the embed as a standalone Markdown block", () => {
  const content = "上文\n\n下文";
  const offset = content.indexOf("下文");
  const insertion = formatBlockEmbedInsertion(content, offset, "![[源#^block]]");
  assert.equal(content.slice(0, offset) + insertion + content.slice(offset), "上文\n\n![[源#^block]]\n\n下文");
});

test("parses native block embed sources and strips only their own anchor", () => {
  assert.deepEqual(parseObsidianBlockEmbedSource("Home/资料/文章#^rr-demo-1"), {
    linkPath: "Home/资料/文章",
    blockId: "rr-demo-1",
  });
  assert.equal(parseObsidianBlockEmbedSource("Home/资料/文章"), null);
  assert.equal(stripOwnBlockAnchor("正文内容 ^rr-demo-1", "rr-demo-1"), "正文内容");
  assert.equal(stripOwnBlockAnchor("- 第一项\n- 第二项\n^rr-demo-1", "rr-demo-1"), "- 第一项\n- 第二项");
});
