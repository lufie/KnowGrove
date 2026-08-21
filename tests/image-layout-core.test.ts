import assert from "node:assert/strict";
import test from "node:test";
import {
  applyTextChanges,
  buildImageMoveChanges,
  clampResize,
  findImageOccurrence,
  frontmatterEndOffset,
  isOffsetInsideFencedCode,
  parseImageOccurrences,
  updateImageSyntax,
} from "../src/image-layout-core";

test("parses wikilink and markdown images with stable source ranges", () => {
  const content = "前文 ![[assets/a.png|320x200]] 后文\n![示例|240](assets/b (1).png \"标题\")";
  const images = parseImageOccurrences(content);
  assert.equal(images.length, 2);
  assert.equal(images[0]?.target, "assets/a.png");
  assert.equal(images[0]?.width, 320);
  assert.equal(images[0]?.height, 200);
  assert.equal(images[1]?.width, 240);
  assert.equal(content.slice(images[0]?.from, images[0]?.to), "![[assets/a.png|320x200]]");
});

test("finds the operated occurrence when the same filename appears more than once", () => {
  const content = "![[assets/demo.png]]\n中间\n![[assets/demo.png]]";
  const secondHint = content.lastIndexOf("demo.png");
  const occurrence = findImageOccurrence(content, secondHint, "assets/demo.png");
  assert.ok(occurrence);
  assert.equal(occurrence.from, content.lastIndexOf("![["));
});

test("alignment metadata never mutates the image target fragment", () => {
  const content = "![[assets/demo.png]]";
  const occurrence = parseImageOccurrences(content)[0];
  assert.ok(occurrence);
  const updated = updateImageSyntax(occurrence, { alignment: "center" });
  assert.equal(updated, "![[assets/demo.png]] <!-- knowgrove:image align=center -->");
  assert.equal(updated.includes("demo.png#center"), false);
});

test("legacy alignment is read and migrated on the next explicit edit", () => {
  const content = "![[assets/demo.png#right|300]]";
  const occurrence = parseImageOccurrences(content)[0];
  assert.ok(occurrence);
  assert.equal(occurrence.alignment, "right");
  assert.equal(updateImageSyntax(occurrence, { width: 360, height: 240 }), "![[assets/demo.png|360x240]] <!-- knowgrove:image align=right -->");
});

test("reset removes only KnowGrove size and alignment while preserving markdown alt and title", () => {
  const content = "![产品图|320|left](assets/demo.png \"主图标题\") <!-- knowgrove:image align=left -->";
  const occurrence = parseImageOccurrences(content)[0];
  assert.ok(occurrence);
  assert.equal(updateImageSyntax(occurrence, { reset: true }), "![产品图](assets/demo.png \"主图标题\")");
});

test("moving an inline image moves only the image token and keeps surrounding text", () => {
  const content = "第一段\n文字A ![[assets/demo.png]] 文字B\n目标段";
  const source = parseImageOccurrences(content)[0];
  assert.ok(source);
  const target = content.indexOf("目标段");
  const changes = buildImageMoveChanges(content, source, target, "line-before");
  assert.ok(changes);
  const moved = applyTextChanges(content, changes);
  assert.equal(moved, "第一段\n文字A 文字B\n![[assets/demo.png]]\n目标段");
});

test("moving beside another image creates a same-line row in source order", () => {
  const content = "![[a.png]]\n文字\n![[b.png]]";
  const [a, b] = parseImageOccurrences(content);
  assert.ok(a && b);
  const changes = buildImageMoveChanges(content, a, b.unitTo, "image-after", b);
  assert.ok(changes);
  assert.equal(applyTextChanges(content, changes), "文字\n![[b.png]] ![[a.png]]");
});

test("frontmatter and fenced code are invalid image drop targets", () => {
  const content = "---\ntitle: demo\n---\n正文\n```md\n目标\n```\n![[a.png]]";
  const source = parseImageOccurrences(content).at(-1);
  assert.ok(source);
  assert.ok(frontmatterEndOffset(content) > 0);
  assert.equal(buildImageMoveChanges(content, source, content.indexOf("title"), "line-before"), null);
  const codeOffset = content.indexOf("目标");
  assert.equal(isOffsetInsideFencedCode(content, codeOffset), true);
  assert.equal(buildImageMoveChanges(content, source, codeOffset, "line-before"), null);
});

test("resize clamp enforces minimum size and editor maximum width", () => {
  assert.deepEqual(clampResize(10, 5, 500), { width: 60, height: 40 });
  assert.deepEqual(clampResize(900, 600, 480), { width: 480, height: 600 });
});

test("metadata remains attached to its exact image unit during movement", () => {
  const content = "![[a.png|300]] <!-- knowgrove:image align=left -->\n目标";
  const source = parseImageOccurrences(content)[0];
  assert.ok(source);
  const changes = buildImageMoveChanges(content, source, content.indexOf("目标"), "line-after");
  assert.ok(changes);
  assert.equal(applyTextChanges(content, changes), "目标\n![[a.png|300]] <!-- knowgrove:image align=left -->");
});
