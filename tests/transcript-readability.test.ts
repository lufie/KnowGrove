import assert from "node:assert/strict";
import test from "node:test";
import { findTranscriptSection, renderReadableTranscript, restoreTranscriptReadability, transcriptRegions, validateTranscriptPunctuation } from "../src/transcript-readability";
import { repairTranscriptNote } from "../src/transcript-repair-core";
import { formatTranscriptParagraphs, parseSubtitleText, buildRawCaptureNote, buildEnhancedCaptureNote } from "../src/browser-capture-core";

const raw = "今天我们来谈一个重要的问题为什么录音保存以后还需要整理因为声音只有变成可以阅读的文字以后才能方便检索";
const punctuated = "今天，我们来谈一个重要的问题：为什么录音保存以后还需要整理？因为声音只有变成可以阅读的文字以后，才能方便检索。";
const answer = (text: string) => JSON.stringify({ text });

test("punctuation is insertion-only: original words, repeats and punctuation survive", () => {
  assert.equal(validateTranscriptPunctuation(raw, punctuated), punctuated);
  assert.throws(() => validateTranscriptPunctuation(raw, punctuated.replace("录音", "音频")));
  assert.throws(() => validateTranscriptPunctuation("是的是的今天继续", "是的，今天继续。"));
  assert.throws(() => validateTranscriptPunctuation("这是问题？", "这是问题。"));
});

test("numbers, versions, URLs, email and English word boundaries are protected", () => {
  for (const [a, b] of [["12", "1.2"], ["3.14", "314"], ["super agent", "superagent"], ["super agent", "super,agent"], ["C++ 1.2.3", "C+ 1.2.3"], ["a@example.com", "a@other.com"], ["https://example.com/a", "https://example.com/b"]]) {
    assert.throws(() => validateTranscriptPunctuation(a!, b!));
  }
  assert.equal(validateTranscriptPunctuation("super agent 版本 3.14", "super agent，版本 3.14。"), "super agent，版本 3.14。");
  for (const [source, candidate] of [["C++", "C+ +"], ["C#", "C #"], [".NET", ". NET"]]) assert.throws(() => validateTranscriptPunctuation(source!, candidate!));
});

test("inline code, indented code, inline HTML, math and wiki references are opaque", async () => {
  const protectedText = '运行 `foo bar` 测试\n    const flag = true\n    call(foo)\n词 <code>foo bar</code>\n公式 $x+y$\n链接 [[我的笔记]]\n';
  const result = await restoreTranscriptReadability(protectedText + raw, { run: async prompt => {
    assert.ok(!prompt.includes("foo") && !prompt.includes("我的笔记"));
    return answer(punctuated);
  } });
  assert.ok(result.text.startsWith(protectedText));
  assert.throws(() => validateTranscriptPunctuation('运行 `foo bar` 测试', '运行 `foo, bar` 测试'));
});

test("protected code, metadata, headings, tables and timelines are never sent to punctuation AI", async () => {
  const protectedBlock = '<!-- knowgrove:video-timeline-v1\n{"text":"这里不能修改"}\n-->';
  const source = raw + "\n\n" + protectedBlock + '\n\n%%\nknowgrove-markers-v1\n{"markers":[]}\n%%\n\n~~~text\n## not a section\nsecret code\n~~~';
  const result = await restoreTranscriptReadability(source, { run: async prompt => {
    assert.ok(!prompt.includes("secret code") && !prompt.includes("markers") && !prompt.includes("这里不能修改"));
    return answer(punctuated);
  } });
  assert.ok(result.text.includes(protectedBlock));
  assert.ok(!result.originalProse.includes("markers") && !result.originalProse.includes("secret code"));
  assert.equal(result.failed, 0);
});

test("failed or rewritten model responses preserve original prose and report partial failure", async () => {
  let calls = 0;
  const result = await restoreTranscriptReadability(raw, { run: async () => { calls++; return answer("这是被总结后的内容。"); } });
  assert.equal(result.text, raw); assert.equal(result.failed, 1); assert.equal(calls, 2);
});

test("cancellation stops punctuation without committing model output", async () => {
  const controller = new AbortController();
  await assert.rejects(restoreTranscriptReadability(raw, { signal: controller.signal, run: async () => { controller.abort(); return answer(punctuated); } }), { name: "AbortError" });
});

test("provider failures stop immediately rather than retrying every chunk", async () => {
  let calls = 0;
  await assert.rejects(restoreTranscriptReadability(raw.repeat(100), { run: async () => { calls++; throw Error("service unavailable"); } }), /service unavailable/);
  assert.equal(calls, 1);
});

test("folded backup escapes HTML, verifies its hash and remains unique on retries", async () => {
  const result = await restoreTranscriptReadability(raw, { run: async () => answer(punctuated) });
  const first = "prefix\n\n## 完整逐字稿\n\n" + renderReadableTranscript(result, "zh-CN") + "\n\n## 我的想法\nuser edit\n";
  const section = findTranscriptSection(first)!;
  assert.equal(section.originalProse, raw);
  assert.ok(!section.source.includes("user edit"));
  assert.ok(!section.source.includes("<details>"));
  const second = await restoreTranscriptReadability(section.source, { originalProse: section.originalProse, run: async () => { throw Error("already punctuated"); } });
  assert.equal(second.processed, 0);
  assert.equal(second.originalProse, raw);
  const dangerous = renderReadableTranscript({ ...result, originalProse: "</details><script>alert(1)</script>" }, "en");
  assert.ok(dangerous.includes("&lt;/details&gt;"));
  assert.equal(findTranscriptSection("## Full transcript\n" + dangerous)!.originalProse, "</details><script>alert(1)</script>");
  assert.throws(() => findTranscriptSection(first.replace(raw, raw + "changed")));
});

test("section ranges ignore H2 text inside code and stop at following user sections", () => {
  const note = "## 完整逐字稿\n\n" + raw + "\n\n~~~\n## literal heading\n~~~\n\n## User notes\nprivate thoughts";
  const section = findTranscriptSection(note)!;
  assert.ok(section.source.includes("literal heading"));
  assert.ok(!section.source.includes("private thoughts"));
  assert.equal(note.slice(section.end), "## User notes\nprivate thoughts");
});

test("transcript headings in code, comments and nested details are not section boundaries", () => {
  for (const prefix of ["~~~md\n## 完整逐字稿\nexample\n~~~\n", "<!--\n## 完整逐字稿\n-->\n", "<details>\n<details>\ninner\n</details>\n## 完整逐字稿\nouter\n</details>\n"]) {
    const section = findTranscriptSection(prefix + "## 完整逐字稿\n" + raw + "\n\n## My notes\nprivate")!;
    assert.equal(section.source, raw);
  }
  assert.throws(() => findTranscriptSection("## 完整逐字稿\na\n## 完整逐字稿\nb"), /多个/);
});

test("whitespace cannot promote original inline tokens to Markdown structures", () => {
  for (const [source, candidate] of [["你好 ## 标题", "你好\n\n## 标题"], ["你好 - 项目", "你好\n- 项目"], ["你好 ```code", "你好\n```code"]]) {
    assert.throws(() => validateTranscriptPunctuation(source!, candidate!), /结构/);
  }
});

test("over-limit technical tokens are preserved without unbounded AI input", async () => {
  const token = "https://example.com/" + "a".repeat(5000);
  let calls = 0;
  const result = await restoreTranscriptReadability(raw + "\n" + token + "\n" + raw, { run: async prompt => {
    assert.ok(prompt.length < 3000 && !prompt.includes(token));
    calls++;
    return answer(punctuated);
  } });
  assert.equal(calls, 2);
  assert.ok(result.text.includes(token));
  assert.equal(result.failed, 0);
});

test("manual no-op and pre-commit cancellation do not write or mislabel original text", async () => {
  let writes = 0;
  const short = "## 完整逐字稿\n今天继续";
  const result = await repairTranscriptNote({ read: async () => short, backup: async () => { writes++; }, commit: async () => { writes++; }, run: async () => { throw Error("not called"); } }, "en");
  assert.equal(result.processed, 0);
  assert.equal(writes, 0);
  const controller = new AbortController();
  await assert.rejects(repairTranscriptNote({ read: async () => "## 完整逐字稿\n" + raw, backup: async () => { controller.abort(); }, commit: async () => { writes++; }, run: async () => answer(punctuated) }, "en", controller.signal), { name: "AbortError" });
  assert.equal(writes, 0);
});

test("bare recording protocol payloads remain opaque", () => {
  const regions = transcriptRegions('knowgrove-markers-v1\n{"markers":[]}\n' + raw);
  assert.ok(regions.filter(r => r.prose).every(r => !r.text.includes("markers")));
});

test("formatting never deletes repetition or foreign scripts, or splits an English word", () => {
  for (const source of ["真的？！是的！！", "Hello!!! Why??", "他说。！？下一句", "？！先有标点", "！！！"]) {
    assert.equal(formatTranscriptParagraphs(source).replace(/\s/g, ""), source.replace(/\s/g, ""));
  }
  assert.equal(formatTranscriptParagraphs("是的\n是的\n今天继续"), "是的是的今天继续");
  assert.match(formatTranscriptParagraphs("मैं आज यहाँ हूँ"), /मैं आज यहाँ हूँ/);
  const long = "中".repeat(238) + "super agent " + "文".repeat(100);
  assert.ok(formatTranscriptParagraphs(long).replace(/\n\n/g, " ").includes("super agent"));
  const numeric = "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n2026\n\n";
  assert.equal(parseSubtitleText(numeric, "a.vtt"), "2026");
});

test("manual repair is compare-and-swap, backs up first, and preserves all other note sections", async () => {
  let stored = "---\n状态: 进行中\n---\n\n## 内容摘要\nunchanged\n\n## 完整逐字稿\n\n" + raw + "\n\n## 我的笔记\nuser text";
  const before = stored; let backedUp = "";
  await repairTranscriptNote({ read: async () => stored, backup: async text => { backedUp = text; },
    commit: async (expected, updated) => { assert.equal(stored, expected); stored = updated; }, run: async () => answer(punctuated) }, "zh-CN");
  assert.equal(backedUp, before);
  assert.ok(stored.includes("unchanged") && stored.endsWith("## 我的笔记\nuser text"));
  assert.ok(stored.includes(punctuated) && stored.includes(raw));
});

test("manual concurrent edits, failed restoration and cancellation never overwrite the note", async () => {
  const initial = "## 完整逐字稿\n" + raw;
  let stored = initial; let writes = 0;
  await assert.rejects(repairTranscriptNote({ read: async () => stored, backup: async () => {}, commit: async () => { writes++; },
    run: async () => { stored += "\nuser edit"; return answer(punctuated); } }, "en"), /有新编辑/);
  assert.equal(writes, 0);
});

test("automatic rendering retains the complete long transcript and exactly one protocol block", () => {
  const source = "原话".repeat(125000);
  const rawNote = buildRawCaptureNote({ pageType: "audio", title: "long", source, capturedAt: new Date().toISOString(), statusProperty: "阅读状态", readingStatus: "在看" });
  assert.ok(rawNote.includes(source));
  const result = { text: punctuated, originalProse: raw, processed: 1, failed: 0 };
  const final = buildEnhancedCaptureNote("## 完整逐字稿\n" + raw, "audio", { mode: "single-speaker", summary: "摘要", keyPoints: ["要点"], bodyMarkdown: "正文" }, "zh-CN", false, result);
  assert.equal(findTranscriptSection(final)!.originalProse, raw);
});
