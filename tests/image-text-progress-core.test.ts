import assert from "node:assert/strict";
import test from "node:test";
import {
  formatImageTextElapsed,
  formatImageTextFailureSummary,
  imageResourceMatches,
  imageTextFailureCategory,
  imageTextPhaseLabel,
  imageTextProgressValue,
  imageTextTaskIsActive,
  resolveImageTextOccurrence,
} from "../src/image-text-progress-core";
import { parseImageOccurrences } from "../src/image-layout-core";
import { imageTextOccurrenceReference, imageTextOccurrenceSnapshot, upsertImageTextBlock } from "../src/image-to-text-core";

test("image conversion progress reports real phases without inventing percentages", () => {
  assert.equal(imageTextPhaseLabel("calling-model"), "正在调用模型识别");
  assert.equal(imageTextTaskIsActive("calling-model"), true);
  assert.equal(imageTextTaskIsActive("completed"), false);
  assert.equal(formatImageTextElapsed(1_000, 66_000), "1:05");
  assert.equal(formatImageTextElapsed(1_000, 6_000), "0:05");
  assert.equal(imageTextProgressValue("calling-model", 0, 0, 0), undefined);
  assert.equal(imageTextProgressValue("completed", 1, 0, 0), 1);
});

test("batch failures retain the image, category, and retryable summary", () => {
  const failures = [{ target: "assets/broken.png", category: imageTextFailureCategory("图片文件已损坏"), message: "图片文件已损坏" }];
  assert.equal(failures[0]?.category, "图片不可读取");
  assert.equal(formatImageTextFailureSummary(failures), "失败项目：assets/broken.png（图片不可读取）");
});

test("reading-view location matches rendered resources instead of Markdown alt text", () => {
  assert.equal(imageResourceMatches(
    "app://obsidian.md/vault/assets/chart.png?123",
    "app://obsidian.md/vault/assets/chart.png?123",
  ), true);
  assert.equal(imageResourceMatches(
    "app://obsidian.md/vault/assets/%E5%9B%BE%E8%A1%A8.png?1",
    "app://obsidian.md/vault/assets/图表.png?1",
  ), true);
  assert.equal(imageResourceMatches(
    "app://obsidian.md/vault/assets/other.png",
    "app://obsidian.md/vault/assets/chart.png",
  ), false);
});

test("image conversion location follows the nearest matching image identity", () => {
  const original = ["![[same.png]]", "中间内容", "![[same.png]]"].join("\n");
  const second = parseImageOccurrences(original)[1]!;
  const moved = ["新增标题", original].join("\n");
  const resolved = resolveImageTextOccurrence(moved, {
    raw: second.raw,
    target: second.target,
    anchorOffset: second.from,
  });
  assert.equal(resolved?.target, "same.png");
  assert.ok((resolved?.from ?? 0) > moved.indexOf("中间内容"));
});

test("image conversion location never guesses a changed or deleted image", () => {
  assert.equal(resolveImageTextOccurrence("![[other.png]]", {
    raw: "![[missing.png]]",
    target: "missing.png",
    anchorOffset: 0,
  }), undefined);
});

test("a confirmed image queue does not substitute a reordered duplicate", () => {
  const original = "![[same.png]] ![[same.png]]";
  const first = parseImageOccurrences(original)[0]!;
  const identity = {
    raw: first.raw,
    target: first.target,
    anchorOffset: first.from,
    reference: imageTextOccurrenceReference(original, first),
  };
  const changed = "![[other.png]] ![[same.png]] ![[same.png]]";
  const resolved = resolveImageTextOccurrence(changed, identity);
  assert.equal(resolved?.from, changed.indexOf("![[same.png]]"));
  const reordered = "![[same.png]] ![[other.png]] ![[same.png]]";
  const reorderedResolved = resolveImageTextOccurrence(reordered, {
    ...identity,
    reference: imageTextOccurrenceReference(original, parseImageOccurrences(original)[1]!),
  });
  assert.equal(reorderedResolved?.from, parseImageOccurrences(reordered)[2]?.from);
  assert.equal(reorderedResolved?.target, "same.png");
});

test("a first write cannot redirect a later cross-line duplicate", () => {
  const original = "![[same.png]]\n中间内容\n![[same.png]]";
  const [first, second] = parseImageOccurrences(original);
  assert.ok(first && second);
  const secondIdentity = {
    raw: second.raw,
    target: second.target,
    anchorOffset: second.from,
    ...imageTextOccurrenceSnapshot(original, second),
  };
  const afterFirstWrite = upsertImageTextBlock(original, first, "第一张的识别结果").content;
  const resolved = resolveImageTextOccurrence(afterFirstWrite, secondIdentity);
  assert.ok(resolved);
  assert.ok(resolved.from > afterFirstWrite.indexOf("中间内容"));
});

test("a confirmed queue refuses a newly inserted exact duplicate", () => {
  const original = "![[same.png]]\n中间内容\n![[same.png]]";
  const second = parseImageOccurrences(original)[1];
  assert.ok(second);
  const identity = {
    raw: second.raw,
    target: second.target,
    anchorOffset: second.from,
    ...imageTextOccurrenceSnapshot(original, second),
  };
  assert.equal(resolveImageTextOccurrence(`![[same.png]]\n${original}`, identity), undefined);
});

test("a confirmed single duplicate never falls through to another copy", () => {
  const original = "![[same.png]]\n中间内容\n![[same.png]]";
  const second = parseImageOccurrences(original)[1];
  assert.ok(second);
  const identity = {
    raw: second.raw,
    target: second.target,
    anchorOffset: second.from,
    ...imageTextOccurrenceSnapshot(original, second),
  };
  const afterDeletion = original.slice(0, original.lastIndexOf("![[same.png]]")).trimEnd();
  assert.equal(resolveImageTextOccurrence(afterDeletion, identity), undefined);
});
