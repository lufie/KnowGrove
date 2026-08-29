import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCodexImageArguments,
  assertImageBytes,
  createAIImageExecutionPlan,
  detectedImageMediaType,
  isPrivateImageAddress,
  supportsAIImageProvider,
} from "../src/image-provider-core";
import { parseImageOccurrences } from "../src/image-layout-core";
import {
  IMAGE_TEXT_BLOCK_END,
  IMAGE_TEXT_BLOCK_START,
  buildImageTextPrompt,
  imageTextManagedBlockRange,
  imageTextManagedMarkerRanges,
  imageTextOccurrenceReference,
  imageTextOccurrenceSnapshot,
  isAmbiguousBareImageTarget,
  removeConfirmedImageReferences,
  removeAllImageReferences,
  renderImageTextBlock,
  upsertImageTextBlock,
} from "../src/image-to-text-core";

test("ignores image-like syntax in protected Markdown regions", () => {
  const content = [
    "---",
    "cover: '![[yaml.png]]'",
    "---",
    "![[real.png]]",
    "```md",
    "![[code.png]]",
    "```",
    "`![inline](inline.png)`",
    "%% ![[comment.png]] %%",
    "<!-- ![[html-comment.png]] -->",
  ].join("\n");
  assert.deepEqual(parseImageOccurrences(content).map((item) => item.target), ["real.png"]);
});

test("inserts and then replaces one managed image text block", () => {
  const original = "上文\n![[table.png]]\n下文";
  const occurrence = parseImageOccurrences(original)[0]!;
  const first = upsertImageTextBlock(original, occurrence, "| 项目 | 金额 |\n| --- | ---: |\n| 收入 | 10 |\n");
  assert.equal(first.replaced, false);
  assert.match(first.content, new RegExp(IMAGE_TEXT_BLOCK_START));
  assert.match(first.content, /\| 收入 \| 10 \|/);
  assert.match(first.content, /image-text-ref ref=[a-z0-9-]+ -->\n\n\| 项目 \| 金额 \|/);
  assert.match(first.content, /\| 收入 \| 10 \|\n\n<!-- \/knowgrove:image-text -->/);
  const current = parseImageOccurrences(first.content)[0]!;
  const second = upsertImageTextBlock(first.content, current, "更新后的文本");
  assert.equal(second.replaced, true);
  assert.equal(second.content.match(new RegExp(IMAGE_TEXT_BLOCK_START, "g"))?.length, 1);
  assert.equal(second.content.match(new RegExp(IMAGE_TEXT_BLOCK_END, "g"))?.length, 1);
  assert.doesNotMatch(second.content, /收入/);
});

test("rerunning a legacy adjacent managed block restores Live Preview block boundaries", () => {
  const original = "![[table.png]]\n";
  const occurrence = parseImageOccurrences(original)[0]!;
  const reference = imageTextOccurrenceReference(original, occurrence);
  const legacy = [
    `![[table.png]] <!-- knowgrove:image ref=${reference} -->`,
    IMAGE_TEXT_BLOCK_START,
    `<!-- knowgrove:image-text-ref ref=${reference} -->`,
    "|  |  |  |",
    "| --- | --- | --- |",
    "| A | B | C |",
    IMAGE_TEXT_BLOCK_END,
  ].join("\n");
  const current = parseImageOccurrences(legacy)[0]!;
  const migrated = upsertImageTextBlock(legacy, current, "|  |  |  |\n| --- | --- | --- |\n| D | E | F |");
  assert.equal(migrated.replaced, true);
  assert.match(migrated.content, new RegExp(`image-text-ref ref=${reference} -->\\n\\n\\|  \\|  \\|  \\|`));
  assert.match(migrated.content, /\| D \| E \| F \|\n\n<!-- \/knowgrove:image-text -->/);
  assert.doesNotMatch(migrated.content, /\| A \| B \| C \|/);
});

test("managed marker ranges belong only to real image blocks and preserve fenced examples", () => {
  const original = "![[table.png]]\n";
  const occurrence = parseImageOccurrences(original)[0]!;
  const written = upsertImageTextBlock(original, occurrence, [
    "| 列 |",
    "| --- |",
    "| 值 |",
    "",
    "```md",
    IMAGE_TEXT_BLOCK_START,
    "<!-- knowgrove:image-text-ref ref=example -->",
    "代码示例",
    IMAGE_TEXT_BLOCK_END,
    "```",
  ].join("\n")).content;
  const content = [
    written,
    "<!-- 用户自己的注释 -->",
  ].join("\n");
  const markerText = imageTextManagedMarkerRanges(content)
    .map((range) => content.slice(range.from, range.to));
  assert.equal(markerText.length, 3);
  assert.equal(markerText[0], IMAGE_TEXT_BLOCK_START);
  assert.match(markerText[1] ?? "", /^<!-- knowgrove:image-text-ref ref=img-/);
  assert.equal(markerText[2], IMAGE_TEXT_BLOCK_END);
  assert.equal(markerText.includes("<!-- knowgrove:image-text-ref ref=example -->"), false);
  const exampleFrom = content.indexOf("<!-- knowgrove:image-text-ref ref=example -->");
  assert.ok(exampleFrom >= 0);
  assert.equal(
    imageTextManagedMarkerRanges(content).some((range) => exampleFrom >= range.from && exampleFrom < range.to),
    false,
  );
  const retainedAfterImageRemoval = content.replace("![[table.png]]\n", "");
  assert.equal(imageTextManagedMarkerRanges(retainedAfterImageRemoval).length, 3);
  const retainedExampleFrom = retainedAfterImageRemoval.indexOf("<!-- knowgrove:image-text-ref ref=example -->");
  assert.ok(retainedExampleFrom >= 0);
  assert.equal(
    imageTextManagedMarkerRanges(retainedAfterImageRemoval)
      .some((range) => retainedExampleFrom >= range.from && retainedExampleFrom < range.to),
    false,
  );
});

test("same-line images keep independent managed blocks and reruns replace only their own result", () => {
  const original = "![[one.png]] ![[two.png]]\n下文";
  const [firstImage, secondImage] = parseImageOccurrences(original);
  assert.ok(firstImage && secondImage);
  const firstWrite = upsertImageTextBlock(original, firstImage, "第一张结果");
  const currentSecond = parseImageOccurrences(firstWrite.content).find((item) => item.target === "two.png");
  assert.ok(currentSecond);
  const secondWrite = upsertImageTextBlock(firstWrite.content, currentSecond, "第二张结果");
  assert.match(secondWrite.content, /第一张结果/);
  assert.match(secondWrite.content, /第二张结果/);
  assert.equal(secondWrite.content.match(new RegExp(IMAGE_TEXT_BLOCK_START, "g"))?.length, 2);
  assert.equal(secondWrite.content.match(/<!-- knowgrove:image-text-ref ref=/g)?.length, 2);
  const currentFirst = parseImageOccurrences(secondWrite.content).find((item) => item.target === "one.png");
  assert.ok(currentFirst);
  const rerun = upsertImageTextBlock(secondWrite.content, currentFirst, "第一张更新");
  assert.match(rerun.content, /第一张更新/);
  assert.doesNotMatch(rerun.content, /第一张结果/);
  assert.match(rerun.content, /第二张结果/);
  assert.equal(rerun.content.match(new RegExp(IMAGE_TEXT_BLOCK_START, "g"))?.length, 2);
  assert.notEqual(
    imageTextOccurrenceReference(original, firstImage),
    imageTextOccurrenceReference(original, secondImage),
  );
});

test("same-target images on separate lines keep document-wide identities", () => {
  const original = "![[same.png]]\n中间内容\n![[same.png]]";
  const [first, second] = parseImageOccurrences(original);
  assert.ok(first && second);
  assert.notEqual(
    imageTextOccurrenceReference(original, first),
    imageTextOccurrenceReference(original, second),
  );
});

test("stored image anchors survive deletion of an earlier exact duplicate", () => {
  const original = "![[same.png]]\n中间内容\n![[same.png]]";
  const [first, second] = parseImageOccurrences(original);
  assert.ok(first && second);
  const firstWrite = upsertImageTextBlock(original, first, "第一张结果");
  const currentSecond = parseImageOccurrences(firstWrite.content)[1];
  assert.ok(currentSecond);
  const bothWritten = upsertImageTextBlock(firstWrite.content, currentSecond, "第二张旧结果").content;
  const [taggedFirst, taggedSecond] = parseImageOccurrences(bothWritten);
  assert.ok(taggedFirst?.reference && taggedSecond?.reference);
  const withoutFirstImage = bothWritten.replace(taggedFirst.unitRaw, "");
  const remaining = parseImageOccurrences(withoutFirstImage)[0];
  assert.equal(remaining?.reference, taggedSecond.reference);
  assert.ok(remaining);
  const rerun = upsertImageTextBlock(withoutFirstImage, remaining, "第二张新结果");
  assert.equal(rerun.content.match(new RegExp(IMAGE_TEXT_BLOCK_START, "g"))?.length, 2);
  assert.match(rerun.content, /第一张结果/);
  assert.match(rerun.content, /第二张新结果/);
  assert.doesNotMatch(rerun.content, /第二张旧结果/);
});

test("confirmed duplicate snapshots fail safely when duplicate count changes", () => {
  const original = "![[same.png]]\n中间内容\n![[same.png]]";
  const second = parseImageOccurrences(original)[1];
  assert.ok(second);
  assert.deepEqual(imageTextOccurrenceSnapshot(original, second), {
    reference: imageTextOccurrenceReference(original, second),
    duplicateOrdinal: 1,
    duplicateCount: 2,
  });
});

test("bare image links with duplicate Vault names are always treated as ambiguous", () => {
  assert.equal(isAmbiguousBareImageTarget("photo.png", ["photo.png", "assets/photo.png"]), true);
  assert.equal(isAmbiguousBareImageTarget("assets/photo.png", ["photo.png", "assets/photo.png"]), false);
  assert.equal(isAmbiguousBareImageTarget("photo.png", ["assets/photo.png"]), false);
});

test("regenerates content after the user deletes the previous managed body", () => {
  const original = "![[table.png]]\n";
  const occurrence = parseImageOccurrences(original)[0]!;
  const first = upsertImageTextBlock(original, occurrence, "旧识别内容");
  const emptied = first.content.replace("旧识别内容", "");
  const current = parseImageOccurrences(emptied)[0]!;
  const regenerated = upsertImageTextBlock(emptied, current, "本次重新生成的内容");
  assert.equal(regenerated.replaced, true);
  assert.match(regenerated.content, /本次重新生成的内容/);
  assert.doesNotMatch(regenerated.content, /旧识别内容/);
  assert.equal(regenerated.content.match(new RegExp(IMAGE_TEXT_BLOCK_START, "g"))?.length, 1);
});

test("rejects an empty provider result instead of reporting a successful write", () => {
  const original = "![[table.png]]\n";
  const occurrence = parseImageOccurrences(original)[0]!;
  assert.throws(
    () => upsertImageTextBlock(original, occurrence, "```md\n\n```"),
    /没有返回可写入的图片识别结果/,
  );
});

test("preserves genuine model-returned code fences and unwraps only Markdown wrappers", () => {
  const python = renderImageTextBlock("```python\nprint('hello')\n```");
  assert.match(python, /```python\nprint\('hello'\)\n```/);
  const wrapped = renderImageTextBlock("```markdown\n# 标题\n\n正文\n```");
  assert.match(wrapped, /# 标题\n\n正文/);
  assert.equal(wrapped.includes("```markdown"), false);
});

test("model prompts never include a local path or signed remote source URL", () => {
  const prompt = buildImageTextPrompt();
  assert.match(prompt, /当前待识别图片/);
  assert.doesNotMatch(prompt, /https?:|token=|assets\//);
});

test("managed result range starts at generated content instead of the source image", () => {
  const original = "![[chart.png]]\n";
  const occurrence = parseImageOccurrences(original)[0]!;
  const written = upsertImageTextBlock(original, occurrence, "# 识别标题\n\n长结果").content;
  const current = parseImageOccurrences(written)[0]!;
  const range = imageTextManagedBlockRange(written, current);
  assert.ok(range);
  assert.equal(written.slice(range.contentFrom).startsWith("# 识别标题"), true);
  assert.ok(range.contentFrom > current.unitTo);
});

test("managed OCR content never becomes another image task", () => {
  const content = [
    "![[source.png]]",
    IMAGE_TEXT_BLOCK_START,
    "原图中出现的示例：![不要再次处理](example.png)",
    IMAGE_TEXT_BLOCK_END,
    "![[next.jpg]]",
  ].join("\n");
  assert.deepEqual(parseImageOccurrences(content).map((item) => item.target), ["source.png", "next.jpg"]);
});

test("removes actual image references but preserves OCR text and other links", () => {
  const content = [
    "![[one.png]]",
    IMAGE_TEXT_BLOCK_START,
    "识别结果",
    IMAGE_TEXT_BLOCK_END,
    "[普通链接](https://example.com)",
    "![[voice.m4a]]",
    "```md",
    "![示例](fake.png)",
    "```",
    "![二](two.jpg)",
  ].join("\n");
  const result = removeAllImageReferences(content);
  assert.equal(result.removed, 2);
  assert.match(result.content, /识别结果/);
  assert.match(result.content, /普通链接/);
  assert.match(result.content, /voice\.m4a/);
  assert.match(result.content, /fake\.png/);
  assert.doesNotMatch(result.content, /one\.png|two\.jpg/);
});

test("confirmed image removal rejects any document change before destructive edit", () => {
  const confirmed = "![[one.png]]\n原文";
  assert.throws(
    () => removeConfirmedImageReferences(confirmed, `${confirmed}\n![[new.png]]`),
    /确认后发生变化/,
  );
  assert.equal(removeConfirmedImageReferences(confirmed, confirmed).removed, 1);
});

test("validates image bytes instead of trusting a filename or content type", () => {
  const png = new Uint8Array(45);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  png.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
  png.set([0, 0, 0, 1, 0, 0, 0, 1], 16);
  png.set([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44], 33);
  assert.equal(detectedImageMediaType(png.buffer), "image/png");
  assert.doesNotThrow(() => assertImageBytes(png.buffer, "image/png"));
  assert.throws(() => assertImageBytes(new TextEncoder().encode("not an image").buffer, "image/png"), /损坏|不是/);
  assert.throws(() => assertImageBytes(png.buffer, "image/jpeg"), /不一致/);
});

test("only approved multimodal providers accept image input", () => {
  assert.equal(supportsAIImageProvider("codex-cli"), true);
  assert.equal(supportsAIImageProvider("anthropic-api"), true);
  assert.equal(supportsAIImageProvider("openai-compatible"), true);
  assert.equal(supportsAIImageProvider("codebuddy-cli"), false);
});

test("Codex image invocation attaches the exact file before stdin prompt", () => {
  const args = buildCodexImageArguments("gpt-5.4", "/tmp/投资 表格.png");
  assert.deepEqual(args.slice(-4), ["/tmp/投资 表格.png", "--model", "gpt-5.4", "-"]);
  assert.ok(args.includes("--image"));
});

test("image execution plans freeze provider, model, availability and secret at confirmation", () => {
  const settings = {
    enabled: true,
    autoEnrichNewNotes: false,
    provider: "codex-cli" as const,
    model: "",
    executablePath: "",
    endpoint: "",
    maxContentCharacters: 1_000,
    timeoutSeconds: 120,
  };
  const availability = [{
    id: "codex-cli" as const,
    name: "Codex CLI",
    available: true,
    configuredModel: "gpt-frozen",
    models: ["gpt-frozen"],
    detail: "ready",
  }];
  const plan = createAIImageExecutionPlan(settings, availability, "secret-at-confirmation");
  settings.provider = "codex-cli";
  settings.model = "gpt-changed";
  availability[0]!.configuredModel = "gpt-changed";
  availability[0]!.models!.push("gpt-changed");
  assert.equal(plan.settings.model, "gpt-frozen");
  assert.equal(plan.availability[0]?.configuredModel, "gpt-frozen");
  assert.deepEqual(plan.availability[0]?.models, ["gpt-frozen"]);
  assert.equal(plan.apiKey, "secret-at-confirmation");
});

test("remote image checks reject IPv4-mapped private IPv6 addresses", () => {
  assert.equal(isPrivateImageAddress("::ffff:127.0.0.1"), true);
  assert.equal(isPrivateImageAddress("::ffff:7f00:1"), true);
  assert.equal(isPrivateImageAddress("::ffff:a9fe:a9fe"), true);
  assert.equal(isPrivateImageAddress("::ffff:0808:0808"), false);
  assert.equal(isPrivateImageAddress("::"), true);
  assert.equal(isPrivateImageAddress("2001:4860:4860::8888"), false);
  assert.equal(isPrivateImageAddress("ff02::1"), true);
  assert.equal(isPrivateImageAddress("2001:1::4"), true);
  assert.equal(isPrivateImageAddress("2001:1::1"), false);
  assert.equal(isPrivateImageAddress("2001:3::1"), false);
  assert.equal(isPrivateImageAddress("2001:4:112::1"), false);
  assert.equal(isPrivateImageAddress("2001:20::1"), false);
  assert.equal(isPrivateImageAddress("2001:30::1"), false);
});
