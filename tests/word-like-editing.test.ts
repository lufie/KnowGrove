import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultSettings } from "../src/types";
import {
  findFencedCodeBlockRanges,
  isStandaloneMediaBlock,
  wordLikeBackspaceEdit,
  wordLikeDeleteEdit,
  wordLikeEnterEdit,
  wordLikeIndentEdit,
  type WordLikeEdit,
} from "../src/word-like-editing";

function applyEdit(content: string, edit: WordLikeEdit | null): string {
  assert.ok(edit);
  return content.slice(0, edit.from) + edit.insert + content.slice(edit.to);
}

test("word-like live editing is enabled by default", () => {
  assert.equal(createDefaultSettings().enableWordLikeEditing, true);
});

test("recognizes Obsidian and Markdown images as standalone media blocks", () => {
  assert.equal(isStandaloneMediaBlock("![[assets/demo.png]]"), true);
  assert.equal(isStandaloneMediaBlock("![说明](assets/demo.png)"), true);
  assert.equal(isStandaloneMediaBlock("图片 ![[assets/demo.png]]"), false);
});

test("backspace on the blank paragraph below an image removes the complete media block", () => {
  const content = "上文\n![[assets/demo.png]]\n\n下文";
  const position = content.indexOf("\n\n") + 1;
  const edit = wordLikeBackspaceEdit(content, position);
  assert.equal(applyEdit(content, edit), "上文\n\n下文");
});

test("delete on the blank paragraph before an image removes the complete media block", () => {
  const content = "上文\n\n![[assets/demo.png]]\n下文";
  const position = content.indexOf("\n\n") + 1;
  const edit = wordLikeDeleteEdit(content, position);
  assert.equal(applyEdit(content, edit), "上文\n\n下文");
});

test("backspace at formatted content start unwraps headings, quotes and lists", () => {
  const heading = "## 标题";
  assert.equal(applyEdit(heading, wordLikeBackspaceEdit(heading, 3)), "标题");

  const quote = "> 引用";
  assert.equal(applyEdit(quote, wordLikeBackspaceEdit(quote, 2)), "引用");

  const list = "- 列表";
  assert.equal(applyEdit(list, wordLikeBackspaceEdit(list, 2)), "列表");
});

test("enter on an empty heading or quote returns to a normal paragraph", () => {
  assert.equal(applyEdit("### ", wordLikeEnterEdit("### ", 4)), "");
  assert.equal(applyEdit("> ", wordLikeEnterEdit("> ", 2)), "");
});

test("enter at the end of a heading starts a normal paragraph", () => {
  const content = "## 标题";
  const edit = wordLikeEnterEdit(content, content.length);
  assert.equal(applyEdit(content, edit), "## 标题\n");
  assert.equal(edit?.cursor, content.length + 1);
});

test("ordinary paragraphs are left to Obsidian native editing", () => {
  assert.equal(wordLikeBackspaceEdit("普通正文", 2), null);
  assert.equal(wordLikeDeleteEdit("普通正文", 2), null);
  assert.equal(wordLikeEnterEdit("普通正文", 2), null);
});

test("backspace outdents nested unordered lists one level at a time", () => {
  const content = "- 一级\n    - 二级\n        - 三级";
  const position = content.lastIndexOf("三级");
  const once = wordLikeBackspaceEdit(content, position);
  const afterOnce = applyEdit(content, once);
  assert.equal(afterOnce, "- 一级\n    - 二级\n    - 三级");
  assert.equal(once?.cursor, afterOnce.lastIndexOf("三级"));
});

test("enter continues unordered lists at the same indentation", () => {
  const content = "- 一级\n    - 二级";
  const edit = wordLikeEnterEdit(content, content.length);
  assert.equal(applyEdit(content, edit), "- 一级\n    - 二级\n    - ");
});

test("enter continues and renumbers ordered list siblings", () => {
  const content = "1. 第一\n2. 第二\n    1. 子项\n3. 第三";
  const position = content.indexOf("第一") + "第一".length;
  const edit = wordLikeEnterEdit(content, position);
  assert.equal(applyEdit(content, edit), "1. 第一\n2. \n3. 第二\n    1. 子项\n4. 第三");
});

test("enter on empty nested list outdents one level and root empty list exits", () => {
  const nested = "- 一级\n    - ";
  assert.equal(applyEdit(nested, wordLikeEnterEdit(nested, nested.length)), "- 一级\n- ");
  assert.equal(applyEdit("- ", wordLikeEnterEdit("- ", 2)), "");
});

test("tab and shift-tab move a list subtree by one detected indentation level", () => {
  const content = "- 第一\n- 第二\n    - 子项";
  const position = content.indexOf("第二");
  const indented = wordLikeIndentEdit(content, position, "indent");
  const afterIndent = applyEdit(content, indented);
  assert.equal(afterIndent, "- 第一\n    - 第二\n        - 子项");
  const outdented = wordLikeIndentEdit(afterIndent, afterIndent.indexOf("第二"), "outdent");
  assert.equal(applyEdit(afterIndent, outdented), content);
});

test("delete at the end of a list item merges the next sibling without duplicate marker", () => {
  const content = "- 第一\n- 第二";
  const position = content.indexOf("\n");
  assert.equal(applyEdit(content, wordLikeDeleteEdit(content, position)), "- 第一 第二");
});

test("ordered outdent renumbers the destination level without leaving duplicate numbers", () => {
  const content = "1. 一级\n    1. 二级\n2. 后续";
  const position = content.indexOf("二级");
  assert.equal(
    applyEdit(content, wordLikeBackspaceEdit(content, position)),
    "1. 一级\n2. 二级\n3. 后续",
  );
});

test("ordered delete merge closes the numbering gap", () => {
  const content = "1. 第一\n2. 第二\n3. 第三";
  const position = content.indexOf("\n");
  assert.equal(
    applyEdit(content, wordLikeDeleteEdit(content, position)),
    "1. 第一 第二\n2. 第三",
  );
});

test("task lists keep Obsidian native checkbox behavior", () => {
  const content = "- [ ] 待办";
  assert.equal(wordLikeBackspaceEdit(content, content.indexOf("待办")), null);
  assert.equal(wordLikeEnterEdit(content, content.length), null);
  assert.equal(wordLikeIndentEdit(content, content.length, "indent"), null);
});

test("recognizes only complete fenced code blocks with matching fences", () => {
  const content = "前文\n````ts\nconst value = `demo`;\n```\n````\n后文\n~~~py\nprint(1)\n~~~";
  assert.deepEqual(findFencedCodeBlockRanges(content), [
    { from: 3, to: 40 },
    { from: 44, to: content.length },
  ]);
  assert.deepEqual(findFencedCodeBlockRanges("```ts\nconst value = 1;"), []);
});

test("backspace from the blank paragraph below a code block removes the complete block", () => {
  const content = "上文\n```ts\nconst value = 1;\n```\n\n下文";
  const position = content.indexOf("\n\n") + 1;
  assert.equal(applyEdit(content, wordLikeBackspaceEdit(content, position)), "上文\n\n下文");
});

test("delete from the blank paragraph above a code block removes the complete block", () => {
  const content = "上文\n\n~~~py\nprint(1)\n~~~\n下文";
  const position = content.indexOf("\n\n") + 1;
  assert.equal(applyEdit(content, wordLikeDeleteEdit(content, position)), "上文\n\n下文");
});

test("editing inside a fenced code block remains native", () => {
  const content = "```ts\nconst value = 1;\n```";
  const position = content.indexOf("value");
  assert.equal(wordLikeBackspaceEdit(content, position), null);
  assert.equal(wordLikeDeleteEdit(content, position), null);
  assert.equal(wordLikeEnterEdit(content, position), null);
});

test("whole-block deletion collapses blank paragraphs on both sides to one", () => {
  const content = "上文\n\n```ts\nconst value = 1;\n```\n\n下文";
  const below = content.indexOf("```\n\n") + 4;
  assert.equal(applyEdit(content, wordLikeBackspaceEdit(content, below)), "上文\n\n下文");
  const above = content.indexOf("\n\n") + 1;
  assert.equal(applyEdit(content, wordLikeDeleteEdit(content, above)), "上文\n\n下文");
});
