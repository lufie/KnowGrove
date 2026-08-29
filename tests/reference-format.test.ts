import assert from "node:assert/strict";
import test from "node:test";
import {
  findManagedReferenceIdNearOffset,
  insertManagedReference,
  removeManagedReference,
  renderManagedReference,
  replaceManagedReference,
} from "../src/reference-format";
import {
  finishDelayMilliseconds,
  hasRecentEditorActivity,
  isAtReadingEnd,
  isDocumentEndVisible,
} from "../src/reading-progress";
import {
  captureReferenceSourceContext,
  hasBlockAnchor,
  repairReferenceAnchor,
} from "../src/reference-repair";
import type { ReferenceRecord } from "../src/types";
import { cleanMarkdownBlankLines, removeSelectedMarkdownBlankLines } from "../src/blank-line-cleanup";

const baseRecord: ReferenceRecord = {
  id: "ref-test-1",
  sourcePath: "阅读列表/测试文章.md",
  sourceBlockId: "rr-source-1",
  selectedText: "一段原文",
  comment: "第一行\n第二行",
  targetPath: "卡片盒/观点.md",
  targetHeading: "引用与评论",
  createdAt: "2026-07-19T00:00:00.000Z",
  updatedAt: "2026-07-19T00:00:00.000Z",
};

test("renders a native block embed, comment, backlink, and stable markers", () => {
  const rendered = renderManagedReference(baseRecord);
  assert.match(rendered, /knowgrove-ref:ref-test-1:start/);
  assert.match(rendered, /!\[\[阅读列表\/测试文章#\^rr-source-1\]\]/);
  assert.match(rendered, /> 第一行\n> 第二行/);
  assert.match(rendered, /\[\[阅读列表\/测试文章#\^rr-source-1\|回到原文\]\]/);
});

test("creates a missing heading and inserts the managed block", () => {
  const result = insertManagedReference("# 卡片\n\n正文", "REFERENCE", "引用与评论");
  assert.equal(result, "# 卡片\n\n正文\n\n## 引用与评论\n\nREFERENCE\n");
});

test("inserts at the end of an existing section before the next peer heading", () => {
  const source = "# 卡片\n\n## 引用与评论\n\n已有内容\n\n### 子标题\n\n子内容\n\n## 下一节\n\n尾部";
  const result = insertManagedReference(source, "REFERENCE", "引用与评论");
  assert.equal(
    result,
    "# 卡片\n\n## 引用与评论\n\n已有内容\n\n### 子标题\n\n子内容\n\nREFERENCE\n\n## 下一节\n\n尾部\n",
  );
});

test("replaces only the matching managed block when a comment changes", () => {
  const first = renderManagedReference(baseRecord);
  const content = `开头\n\n${first}\n\n结尾`;
  const changed = { ...baseRecord, comment: "更新后的评论" };
  const result = replaceManagedReference(content, changed);
  assert.ok(result);
  assert.match(result, /更新后的评论/);
  assert.doesNotMatch(result, /第一行/);
  assert.equal(result.match(/knowgrove-ref:ref-test-1:start/g)?.length, 1);
  assert.match(result, /^开头/);
  assert.match(result, /结尾$/);
});

test("removes only the matching managed block when a comment is deleted", () => {
  const first = renderManagedReference(baseRecord);
  const secondRecord = { ...baseRecord, id: "ref-test-2", comment: "保留的评论" };
  const second = renderManagedReference(secondRecord);
  const content = `开头\n\n${first}\n\n${second}\n\n结尾`;
  const result = removeManagedReference(content, baseRecord.id);
  assert.ok(result);
  assert.doesNotMatch(result, /knowgrove-ref:ref-test-1/);
  assert.match(result, /knowgrove-ref:ref-test-2:start/);
  assert.match(result, /保留的评论/);
  assert.equal(result, `开头\n\n${second}\n\n结尾\n`);
});

test("does not rewrite a target document when the managed comment block is missing", () => {
  assert.equal(removeManagedReference("普通正文\n", "ref-missing"), null);
});

test("finds a managed reference only while the cursor is inside its markers", () => {
  const block = renderManagedReference(baseRecord);
  const content = `前文\n${block}\n后文`;
  assert.equal(findManagedReferenceIdNearOffset(content, content.indexOf("第一行")), "ref-test-1");
  assert.equal(findManagedReferenceIdNearOffset(content, 0), null);
  assert.equal(findManagedReferenceIdNearOffset(content, content.length), null);
});

test("reads and upgrades legacy managed reference markers", () => {
  const legacy = renderManagedReference(baseRecord).replaceAll("knowgrove-ref", "reading-companion-ref");
  assert.equal(findManagedReferenceIdNearOffset(legacy, legacy.indexOf("第一行")), "ref-test-1");
  const upgraded = replaceManagedReference(legacy, { ...baseRecord, comment: "升级后评论" });
  assert.ok(upgraded);
  assert.match(upgraded, /knowgrove-ref:ref-test-1:start/);
  assert.doesNotMatch(upgraded, /reading-companion-ref/);
  assert.match(upgraded, /升级后评论/);
});

test("detects the reading end with a small theme-safe tolerance", () => {
  assert.equal(isAtReadingEnd({ scrollTop: 1452, clientHeight: 500, scrollHeight: 2000 }), true);
  assert.equal(isAtReadingEnd({ scrollTop: 1300, clientHeight: 500, scrollHeight: 2000 }), false);
  assert.equal(isAtReadingEnd({ scrollTop: 0, clientHeight: 700, scrollHeight: 700 }), true);
  assert.equal(isAtReadingEnd({ scrollTop: 0, clientHeight: 0, scrollHeight: 0 }), false);
});

test("detects the document end from CodeMirror visible ranges", () => {
  assert.equal(isDocumentEndVisible(1_000, [{ to: 700 }, { to: 1_000 }]), true);
  assert.equal(isDocumentEndVisible(1_000, [{ to: 999 }]), false);
  assert.equal(isDocumentEndVisible(0, [{ to: 0 }]), true);
  assert.equal(isDocumentEndVisible(1_000, []), false);
});

test("clamps the auto-finish dwell time to a safe range", () => {
  assert.equal(finishDelayMilliseconds(3), 3000);
  assert.equal(finishDelayMilliseconds(0), 1000);
  assert.equal(finishDelayMilliseconds(30), 10000);
  assert.equal(finishDelayMilliseconds(Number.NaN), 3000);
});

test("pauses Live Preview auto-finish after real editor changes", () => {
  assert.equal(hasRecentEditorActivity(98_000, 100_000), true);
  assert.equal(hasRecentEditorActivity(94_000, 100_000), false);
  assert.equal(hasRecentEditorActivity(undefined, 100_000), false);
});

test("repairs a missing inline block anchor from a unique selection", () => {
  const content = "前文\n\n这是一段原文。\n\n后文";
  const result = repairReferenceAnchor(content, {
    sourceBlockId: "rr-repaired",
    selectedText: "这是一段原文。",
  });
  assert.equal(result.status, "repaired");
  assert.equal(result.content, "前文\n\n这是一段原文。 ^rr-repaired\n\n后文");
  assert.equal(hasBlockAnchor(result.content, "rr-repaired"), true);
});

test("repairs the real multi-line list shape with a standalone block anchor", () => {
  const content = [
    "- 好车退出后只能接受更低的均价。",
    "   - 新品牌面临同样的困境：用户默认你是柠檬。",
    "- 下一条",
  ].join("\n");
  const result = repairReferenceAnchor(content, {
    sourceBlockId: "rr-list",
    selectedText: "均价。\n   - 新品牌面临同样的困境：用户默认你是柠檬。",
  });
  assert.equal(result.status, "repaired");
  assert.equal(
    result.content,
    "- 好车退出后只能接受更低的均价。\n   - 新品牌面临同样的困境：用户默认你是柠檬。\n^rr-list\n- 下一条",
  );
});

test("does not duplicate an anchor that is already present", () => {
  const content = "一段原文 ^rr-existing\n";
  const result = repairReferenceAnchor(content, {
    sourceBlockId: "rr-existing",
    selectedText: "一段原文",
  });
  assert.equal(result.status, "present");
  assert.equal(result.content, content);
  assert.equal(result.content.match(/\^rr-existing/g)?.length, 1);
});

test("refuses to guess when the stored selection is ambiguous", () => {
  const content = "重复内容\n\n重复内容";
  const result = repairReferenceAnchor(content, {
    sourceBlockId: "rr-ambiguous",
    selectedText: "重复内容",
  });
  assert.equal(result.status, "selection-ambiguous");
  assert.equal(result.content, content);
});

test("recovers a changed selection from stable surrounding context", () => {
  const before = "这是足够长并且保持不变的前置上下文，用来唯一定位选区：";
  const originalSelection = "旧的原文内容";
  const after = "；这是足够长并且保持不变的后置上下文，用来确认边界。";
  const original = `${before}${originalSelection}${after}`;
  const start = original.indexOf(originalSelection);
  const context = captureReferenceSourceContext(original, { start, end: start + originalSelection.length });
  const changed = `${before}已经被用户改写的新原文${after}`;
  const result = repairReferenceAnchor(changed, {
    sourceBlockId: "rr-context",
    selectedText: originalSelection,
    sourceContextBefore: context.before,
    sourceContextAfter: context.after,
  });
  assert.equal(result.status, "repaired");
  assert.equal(result.match?.strategy, "context");
  assert.match(result.content, /新原文；这是足够长.* \^rr-context$/);
});

test("preserves CRLF line endings while repairing a complex block", () => {
  const content = "- 第一行\r\n  第二行\r\n下一段";
  const result = repairReferenceAnchor(content, {
    sourceBlockId: "rr-crlf",
    selectedText: "第一行\n  第二行",
  });
  assert.equal(result.status, "repaired");
  assert.equal(result.content, "- 第一行\r\n  第二行\r\n^rr-crlf\r\n下一段");
});

test("does not add a second block ID when the located block has a conflicting anchor", () => {
  const content = "一段原文 ^user-anchor\n";
  const result = repairReferenceAnchor(content, {
    sourceBlockId: "rr-missing",
    selectedText: "一段原文",
  });
  assert.equal(result.status, "conflicting-anchor");
  assert.equal(result.content, content);
});

test("keeps a plugin block ID out of the stored source context", () => {
  const selectedText = "被引用的内容";
  const content = `足够长的前文用于稳定定位这段内容：${selectedText}\n^rr-context-clean\n足够长的后文用于稳定定位这段内容。`;
  const start = content.indexOf(selectedText);
  const context = captureReferenceSourceContext(
    content,
    { start, end: start + selectedText.length },
    "rr-context-clean",
  );
  assert.doesNotMatch(context.after, /rr-context-clean/);
  assert.match(context.after, /足够长的后文/);
});

test("normalizes leading, repeated, and trailing blank lines", () => {
  const source = "\n \n第一段\n\n \n\n第二段\n\n\n";
  const result = cleanMarkdownBlankLines(source);
  assert.equal(result.content, "第一段\n\n第二段\n");
  assert.equal(result.removedBlankLines, 6);
  assert.equal(result.changed, true);
  assert.equal(cleanMarkdownBlankLines(result.content).changed, false);
});

test("preserves blank lines in frontmatter and fenced code", () => {
  const source = [
    "---",
    "title: 测试",
    "",
    "",
    "tags: []",
    "---",
    "",
    "",
    "正文",
    "",
    "",
    "```text",
    "第一行",
    "",
    "",
    "第二行",
    "```",
    "",
    "",
    "结尾",
  ].join("\n");
  const result = cleanMarkdownBlankLines(source);
  assert.match(result.content, /title: 测试\n\n\ntags: \[\]/);
  assert.match(result.content, /正文\n\n```text/);
  assert.match(result.content, /第一行\n\n\n第二行/);
  assert.match(result.content, /```\n\n结尾$/);
  assert.equal(result.removedBlankLines, 3);
});

test("preserves CRLF while cleaning and normalizes kept whitespace-only lines", () => {
  const source = "\r\n第一段\r\n \r\n\r\n第二段\r\n\r\n";
  const result = cleanMarkdownBlankLines(source);
  assert.equal(result.content, "第一段\r\n\r\n第二段\r\n");
  assert.equal(result.removedBlankLines, 3);
  assert.equal(result.normalizedBlankLines, 1);
  assert.doesNotMatch(result.content, /(?<!\r)\n/);
});

test("does not rewrite protected math, comments, or raw HTML blocks", () => {
  const source = [
    "正文",
    "",
    "",
    "$$",
    "a = b",
    "",
    "",
    "c = d",
    "$$",
    "%%",
    "注释",
    "",
    "",
    "仍是注释",
    "%%",
    "<pre>",
    "raw",
    "",
    "",
    "text",
    "</pre>",
  ].join("\n");
  const result = cleanMarkdownBlankLines(source);
  assert.match(result.content, /正文\n\n\$\$/);
  assert.match(result.content, /a = b\n\n\nc = d/);
  assert.match(result.content, /注释\n\n\n仍是注释/);
  assert.match(result.content, /raw\n\n\ntext/);
  assert.equal(result.removedBlankLines, 1);
});

test("removes every ordinary blank line fully contained in the selection", () => {
  const source = "选区外前文\n\n第一段\n \n\n第二段\n\n选区外后文";
  const start = source.indexOf("第一段");
  const end = source.indexOf("选区外后文");
  const result = removeSelectedMarkdownBlankLines(source, start, end);
  assert.equal(result.replacement, "第一段\n第二段\n");
  assert.equal(result.removedBlankLines, 3);
  assert.equal(result.changed, true);
  assert.equal(`${source.slice(0, start)}${result.replacement}${source.slice(end)}`, "选区外前文\n\n第一段\n第二段\n选区外后文");
});

test("preserves CRLF and ignores partially selected blank lines", () => {
  const crlf = "第一段\r\n\r\n第二段\r\n";
  const cleaned = removeSelectedMarkdownBlankLines(crlf, 0, crlf.length);
  assert.equal(cleaned.replacement, "第一段\r\n第二段\r\n");
  assert.equal(cleaned.removedBlankLines, 1);

  const partial = "前文\n  \n后文";
  const start = partial.indexOf("  ");
  const unchanged = removeSelectedMarkdownBlankLines(partial, start, start + 2);
  assert.equal(unchanged.replacement, "  ");
  assert.equal(unchanged.changed, false);
});

test("preserves one structural blank line around selected Markdown tables", () => {
  const source = [
    "正文",
    "",
    "",
    "表格说明",
    "",
    "| 名称 | 数量 |",
    "| --- | ---: |",
    "| 苹果 | 2 |",
    "| 香蕉 | 3 |",
    "",
    "后文",
    "",
    "",
    "结尾",
  ].join("\n");
  const result = removeSelectedMarkdownBlankLines(source, 0, source.length);

  assert.equal(
    result.replacement,
    [
      "正文",
      "表格说明",
      "",
      "| 名称 | 数量 |",
      "| --- | ---: |",
      "| 苹果 | 2 |",
      "| 香蕉 | 3 |",
      "",
      "后文",
      "结尾",
    ].join("\n"),
  );
  assert.equal(result.removedBlankLines, 4);
});

test("collapses repeated Markdown table boundary blank lines to one", () => {
  const source = [
    "前文",
    "",
    "",
    "| A | B |",
    "| :---: | --- |",
    "| 1 | 2 |",
    "",
    "",
    "后文",
  ].join("\n");
  const result = removeSelectedMarkdownBlankLines(source, 0, source.length);

  assert.equal(
    result.replacement,
    ["前文", "", "| A | B |", "| :---: | --- |", "| 1 | 2 |", "", "后文"].join("\n"),
  );
  assert.equal(result.removedBlankLines, 2);
});

test("keeps managed image-text comments separated from an empty-header table", () => {
  const source = [
    "原图",
    "",
    "<!-- knowgrove:image-text v=1 -->",
    "<!-- knowgrove:image-text-ref ref=img.001 -->",
    "",
    "|  |  |  |",
    "| --- | --- | --- |",
    "| US$2,008.90 | 191,438 | US$10.49 |",
    "| US$1,775.03 | 179,573 | US$9.88 |",
    "| US$1,666.50 | 178,725 | US$9.32 |",
    "",
    "<!-- /knowgrove:image-text -->",
    "",
    "后文",
  ].join("\n");
  const result = removeSelectedMarkdownBlankLines(source, 0, source.length);

  assert.equal(
    result.replacement,
    [
      "原图",
      "<!-- knowgrove:image-text v=1 -->",
      "<!-- knowgrove:image-text-ref ref=img.001 -->",
      "",
      "|  |  |  |",
      "| --- | --- | --- |",
      "| US$2,008.90 | 191,438 | US$10.49 |",
      "| US$1,775.03 | 179,573 | US$9.88 |",
      "| US$1,666.50 | 178,725 | US$9.32 |",
      "",
      "<!-- /knowgrove:image-text -->",
      "后文",
    ].join("\n"),
  );
  assert.equal(result.removedBlankLines, 2);
});

test("repairs table boundaries removed by an earlier cleanup", () => {
  const source = [
    "## 原文",
    "<!-- knowgrove:image-text v=1 -->",
    "<!-- knowgrove:image-text-ref ref=img-3iphu001c07lo -->",
    "|  |  |  |",
    "|---|---|---|",
    "| US$2,008.90 | 191,438 | US$10.49 |",
    "| US$1,775.03 | 179,573 | US$9.88 |",
    "| US$1,666.50 | 178,725 | US$9.32 |",
    "<!-- /knowgrove:image-text -->",
    "### 出海AI SEO",
  ].join("\n");
  const result = removeSelectedMarkdownBlankLines(source, 0, source.length);

  assert.equal(
    result.replacement,
    [
      "## 原文",
      "<!-- knowgrove:image-text v=1 -->",
      "<!-- knowgrove:image-text-ref ref=img-3iphu001c07lo -->",
      "",
      "|  |  |  |",
      "|---|---|---|",
      "| US$2,008.90 | 191,438 | US$10.49 |",
      "| US$1,775.03 | 179,573 | US$9.88 |",
      "| US$1,666.50 | 178,725 | US$9.32 |",
      "",
      "<!-- /knowgrove:image-text -->",
      "### 出海AI SEO",
    ].join("\n"),
  );
  assert.equal(result.removedBlankLines, 0);
  assert.equal(result.changed, true);
  assert.equal(
    removeSelectedMarkdownBlankLines(result.replacement, 0, result.replacement.length).changed,
    false,
  );
});

test("recognizes Markdown tables without outer pipes and preserves CRLF", () => {
  const source = "前文\r\n\r\n名称 | 数量\r\n--- | ---:\r\n苹果 | 2\r\n\r\n后文\r\n\r\n尾声";
  const result = removeSelectedMarkdownBlankLines(source, 0, source.length);

  assert.equal(
    result.replacement,
    "前文\r\n\r\n名称 | 数量\r\n--- | ---:\r\n苹果 | 2\r\n\r\n后文\r\n尾声",
  );
  assert.equal(result.removedBlankLines, 1);
  assert.doesNotMatch(result.replacement, /(?<!\r)\n/);
});

test("does not preserve blank lines around pipe-like prose", () => {
  const source = "前文\n\n这不是 | 表格\n也没有 | 分隔行\n\n后文";
  const result = removeSelectedMarkdownBlankLines(source, 0, source.length);

  assert.equal(result.replacement, "前文\n这不是 | 表格\n也没有 | 分隔行\n后文");
  assert.equal(result.removedBlankLines, 2);
});

test("does not change an unselected table when the selection ends at its header", () => {
  const source = "前文\n| A | B |\n| --- | --- |\n| 1 | 2 |\n后文";
  const selectionEnd = source.indexOf("| A | B |");
  const result = removeSelectedMarkdownBlankLines(source, 0, selectionEnd);

  assert.equal(result.replacement, "前文\n");
  assert.equal(result.changed, false);
});

test("does not change a preceding table when the selection starts after it", () => {
  const source = "前文\n| A | B |\n| --- | --- |\n| 1 | 2 |\n后文";
  const selectionStart = source.indexOf("后文");
  const result = removeSelectedMarkdownBlankLines(source, selectionStart, source.length);

  assert.equal(result.replacement, "后文");
  assert.equal(result.changed, false);
});

test("does not classify four-space-indented pipe code as a Markdown table", () => {
  const source = [
    "前文",
    "    | A | B |",
    "    | --- | --- |",
    "    | 1 | 2 |",
    "后文",
  ].join("\n");
  const result = removeSelectedMarkdownBlankLines(source, 0, source.length);

  assert.equal(result.replacement, source);
  assert.equal(result.changed, false);
});

test("keeps selected blank lines inside protected Markdown regions", () => {
  const source = [
    "---",
    "title: 测试",
    "",
    "meta: true",
    "---",
    "正文",
    "",
    "```text",
    "第一行",
    "",
    "",
    "第二行",
    "```",
    "",
    "结尾",
  ].join("\n");
  const result = removeSelectedMarkdownBlankLines(source, 0, source.length);
  assert.match(result.replacement, /title: 测试\n\nmeta: true/);
  assert.match(result.replacement, /正文\n```text/);
  assert.match(result.replacement, /第一行\n\n\n第二行/);
  assert.match(result.replacement, /```\n结尾$/);
  assert.equal(result.removedBlankLines, 2);

  const fencedSelectionStart = source.indexOf("第一行");
  const fencedSelectionEnd = source.indexOf("第二行") + "第二行".length;
  assert.equal(
    removeSelectedMarkdownBlankLines(source, fencedSelectionStart, fencedSelectionEnd).changed,
    false,
  );
});

test("does nothing for an empty selection or a selection without removable blank lines", () => {
  const source = "第一段\n第二段";
  assert.deepEqual(removeSelectedMarkdownBlankLines(source, 3, 3), {
    replacement: "",
    removedBlankLines: 0,
    changed: false,
  });
  assert.deepEqual(removeSelectedMarkdownBlankLines(source, 0, source.length), {
    replacement: source,
    removedBlankLines: 0,
    changed: false,
  });
});
