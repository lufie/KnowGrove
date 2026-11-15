import assert from "node:assert/strict";
import test from "node:test";
import { buildEnhancedCaptureNote, buildRawCaptureNote, detectInterruptedCapture } from "../src/browser-capture-core";
import { findEmbeddedTranscriptSections, prepareCaptureReadability, wrapEmbeddedTranscript } from "../src/transcript-pipeline";
import { repairTranscriptNote } from "../src/transcript-repair-core";

const raw = "今天我们来谈一个重要的问题为什么录音保存以后还需要整理因为声音只有变成可以阅读的文字以后才能方便检索";
const readable = "今天，我们来谈一个重要的问题：为什么录音保存以后还需要整理？因为声音只有变成可以阅读的文字以后，才能方便检索。";
const run = async () => JSON.stringify({ text: readable });
const article = "## 文章正文\n\n这段文章保持原样，不需要 AI 改标点。\n\n- 第一项\n- 第二项\n\n";
const embeddedItem = (title = "内嵌视频", url = "https://example.com/video") => `### ${title}\n\n${url}\n\n${wrapEmbeddedTranscript(raw)}\n\n`;
const embedded = () => "## 内嵌媒体\n\n" + embeddedItem();
const organized = { mode: "single-speaker" as const, summary: "摘要", keyPoints: ["要点"], bodyMarkdown: "整理正文" };

test("all media inputs and resumed raw notes use the same automatic punctuation preparation", async () => {
  for (const pageType of ["video", "audio"] as const) {
    const note = buildRawCaptureNote({ pageType, title: "test", source: raw, url: "https://example.com/video", capturedAt: new Date().toISOString(), statusProperty: "状态", readingStatus: "待处理" });
    const result = await prepareCaptureReadability(pageType, note, raw, "zh-CN", { run });
    assert.equal(result.aiSource, readable);
    assert.equal(result.transcript!.originalProse, raw);
    assert.equal(result.failed, 0);
    const final = buildEnhancedCaptureNote(note, pageType, organized, "zh-CN", false, result.transcript);
    assert.ok(final.includes(readable) && final.includes(raw));
  }
});

test("ordinary article content is never sent to punctuation or changed by the shared pipeline", async () => {
  const result = await prepareCaptureReadability("article", "", article, "zh-CN", { run: async () => { throw Error("must not run"); } });
  assert.equal(result.aiSource, article);
  assert.equal(result.articleSource, undefined);
});

test("embedded media is restored automatically while article structure and following sections stay byte-identical", async () => {
  const source = article + embedded() + "## 我的笔记\n\n这是我的手写内容\n";
  const result = await prepareCaptureReadability("article", "", source, "zh-CN", { run: async prompt => {
    assert.ok(!prompt.includes("文章保持原样") && !prompt.includes("手写内容"));
    return run();
  } });
  assert.ok(result.articleSource!.startsWith(article));
  assert.ok(result.articleSource!.endsWith("## 我的笔记\n\n这是我的手写内容\n"));
  assert.ok(result.articleSource!.includes(readable) && result.articleSource!.includes(raw));
  assert.ok(result.aiSource.startsWith(article) && result.aiSource.includes(readable));
  assert.ok(!result.aiSource.includes("<pre") && !result.aiSource.includes("transcript-original"));
  assert.equal(findEmbeddedTranscriptSections(result.articleSource!)[0]!.originalProse, raw);
});

test("embedded readability survives final article assembly and raw-note resumption", async () => {
  const source = article.repeat(3) + embedded();
  const rawNote = buildRawCaptureNote({ pageType: "article", title: "test", source, url: "https://example.com/article", capturedAt: new Date().toISOString(), statusProperty: "状态", readingStatus: "待处理" });
  const resumed = detectInterruptedCapture(rawNote)!;
  assert.ok(resumed.source.includes(raw));
  const result = await prepareCaptureReadability("article", rawNote, resumed.source, "zh-CN", { run });
  const final = buildEnhancedCaptureNote(rawNote, "article", organized, "zh-CN", false, undefined, result.articleSource);
  assert.equal(findEmbeddedTranscriptSections(final)[0]!.originalProse, raw);
});

test("multiple embedded sources retain separate original backups and are idempotent", async () => {
  const source = article + embedded() + embeddedItem("内嵌音频", "https://example.com/audio");
  const first = await prepareCaptureReadability("article", "", source, "zh-CN", { run });
  const sections = findEmbeddedTranscriptSections(first.articleSource!);
  assert.equal(sections.length, 2);
  assert.ok(sections.every(section => section.originalProse === raw));
  const second = await prepareCaptureReadability("article", "", first.articleSource!, "zh-CN", { run: async () => { throw Error("already done"); } });
  assert.equal(second.articleSource, first.articleSource);
  assert.equal((second.articleSource!.match(/transcript-original:start/g) ?? []).length, 2);
});

test("embedded headings inside code are ignored and ambiguous real sections are refused", () => {
  const source = "~~~md\n" + embedded() + "~~~\n\n" + article + embedded();
  assert.equal(findEmbeddedTranscriptSections(source).length, 1);
  const repeated = embedded();
  assert.throws(() => findEmbeddedTranscriptSections(article + repeated + repeated), /标记/);
  assert.equal(findEmbeddedTranscriptSections(article + "## 内嵌媒体\n\n### 失败\n\nhttps://example.com/video\n\n> 暂未完成转录：工具不可用\n").length, 0);
});

test("natural article headings, unmarked legacy items and user prose after owned blocks are never guessed as transcripts", async () => {
  const natural = `## 内嵌媒体\n\n### 文章举例\n\nhttps://example.com\n\n${raw}\n\n# 我的私人笔记\n${raw}\n`;
  assert.equal(findEmbeddedTranscriptSections(natural).length, 0);
  const source = article + embedded() + `# 我的私人笔记\n${raw}\n\n#### 补充想法\n${raw}\n`;
  const result = await prepareCaptureReadability("article", "", source, "zh-CN", { run });
  assert.ok(result.articleSource!.endsWith(`# 我的私人笔记\n${raw}\n\n#### 补充想法\n${raw}\n`));
  const damaged = embedded().replace(raw, raw + "用户编辑");
  assert.throws(() => findEmbeddedTranscriptSections(damaged), /校验失败/);
  assert.throws(() => findEmbeddedTranscriptSections(embedded().replace(/<!-- knowgrove:embedded-transcript:end[^\n]+/, "")), /缺少/);
});

test("embedded multi-source progress is aggregated and monotonic", async () => {
  const progress: number[] = [];
  await prepareCaptureReadability("article", "", article + embedded() + embeddedItem(), "zh-CN", { run, progress: async (processed, total) => { progress.push(processed / total); } });
  assert.deepEqual(progress, [0.5, 1]);
});

test("manual embedded repair backs up once, modifies no article prose, and rejects any partial failure", async () => {
  const initial = article + embedded() + embeddedItem("第二段", "https://example.com/audio");
  let stored = initial; let writes = 0; let backups = 0;
  const host = { read: async () => stored, backup: async (original: string) => { assert.equal(original, initial); backups++; }, commit: async (original: string, updated: string) => { assert.equal(stored, original); writes++; stored = updated; }, run };
  await repairTranscriptNote(host, "zh-CN");
  assert.equal(backups, 1); assert.equal(writes, 1); assert.ok(stored.startsWith(article));
  stored = initial; writes = 0; backups = 0; let calls = 0;
  await assert.rejects(repairTranscriptNote({ ...host, run: async () => ++calls === 1 ? run() : JSON.stringify({ text: "被改写的摘要。" }) }, "zh-CN"), /未通过/);
  assert.equal(stored, initial); assert.equal(writes, 0); assert.equal(backups, 0);
});

test("automatic embedded validation failures retain original text and expose partial status", async () => {
  const result = await prepareCaptureReadability("article", "", article + embedded(), "zh-CN", { run: async () => JSON.stringify({ text: "改写。" }) });
  assert.equal(result.failed, 1);
  assert.ok(result.articleSource!.includes(raw) && result.articleSource!.includes("仍有 1 段"));
});
