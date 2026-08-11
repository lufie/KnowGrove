import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCaptureFailureNote,
  articleCaptureTitle,
  buildEnhancedCaptureNote,
  buildRawCaptureNote,
  buildWhisperInvocation,
  classifyBrowserCaptureResource,
  classifyBrowserCaptureUrl,
  captureDatePrefix,
  cleanArticleMarkdown,
  detectInterruptedCapture,
  detectLinkNoteCandidate,
  detectWhisperImplementation,
  whisperNeedsPcmConversion,
  datedArticleTitle,
  extractJsonObject,
  extractStructuredCaptureTextFromScripts,
  formatTranscriptParagraphs,
  formatYtDlpCaptureError,
  latestLinkNoteScanFiles,
  normalizeBrowserCaptureAIResult,
  parseSubtitleText,
  parseWebVtt,
  protectArticleImages,
  restoreArticleImages,
  safeCaptureFileName,
  sameCaptureResourceUrl,
  selectPreferredSubtitleFile,
  selectedCaptureProvider,
  splitBrowserCaptureText,
  stripCaptureFrontmatter,
  ytDlpCaptureArgs,
  ytDlpSubtitleArgs,
} from "../src/browser-capture-core";

test("browser capture classifies common video hosts", () => {
  assert.equal(classifyBrowserCaptureUrl("https://www.youtube.com/watch?v=1"), "video");
  assert.equal(classifyBrowserCaptureUrl("https://www.bilibili.com/video/BV1"), "video");
  assert.equal(classifyBrowserCaptureUrl("https://example.com/article"), "article");
  assert.equal(classifyBrowserCaptureUrl("https://cdn.example.com/interview.m4a"), "audio");
  assert.equal(classifyBrowserCaptureUrl("https://podcasts.apple.com/cn/podcast/example/id1"), "audio");
});

test("generic capture resolves short links and detects media from response metadata", () => {
  assert.equal(classifyBrowserCaptureResource("https://short.example/a1", {
    finalUrl: "https://www.bilibili.com/video/BV1",
    contentType: "text/html; charset=utf-8",
  }), "video");
  assert.equal(classifyBrowserCaptureResource("https://files.example/download", {
    contentType: "audio/mpeg",
  }), "audio");
  assert.equal(classifyBrowserCaptureResource("https://unknown.example/watch/42", {
    contentType: "text/html",
    html: '<meta content="video.other" property="og:type"><meta property="og:video" content="https://cdn.example/a">',
  }), "video");
  assert.equal(classifyBrowserCaptureResource("https://unknown.example/listen/42", {
    contentType: "text/html",
    html: '<audio controls src="https://cdn.example/episode.m4a"></audio>',
  }), "audio");
  assert.equal(classifyBrowserCaptureResource("https://www.doubao.com/thread/example", {
    contentType: "text/html",
    html: '<main data-testid="conversation">AI 对话分享内容</main>',
  }), "article");
});

test("browser-rendered capture can target only a note with the same source URL", () => {
  assert.equal(
    sameCaptureResourceUrl(
      "https://www.doubao.com/thread/example#answer",
      "https://www.doubao.com/thread/example",
    ),
    true,
  );
  assert.equal(
    sameCaptureResourceUrl(
      "https://www.doubao.com/thread/example",
      "https://www.doubao.com/thread/another",
    ),
    false,
  );
});

test("dynamic AI share pages recover question and answer text from embedded router data", () => {
  const source = extractStructuredCaptureTextFromScripts([
    'window._ROUTER_DATA = {"loaderData":{"shareInfo":{"messages":[{"question":"怎么建立知识树？"},{"answer":"先建立领域，再持续归纳主题和课题。"}]}}};window.boot();',
  ]);
  assert.match(source, /怎么建立知识树/);
  assert.match(source, /先建立领域/);
  assert.doesNotMatch(source, /loaderData|shareInfo/);
});

test("Bilibili extraction uses browser headers and bounded retries", () => {
  const args = ytDlpCaptureArgs("https://www.bilibili.com/video/BV1aN3q69E8z");
  assert.ok(args.includes("--ignore-config"));
  assert.ok(args.includes("--extractor-retries"));
  assert.ok(args.includes("Referer:https://www.bilibili.com/"));
  assert.ok(args.includes("Origin:https://www.bilibili.com"));
  assert.ok(args.includes("--user-agent"));
  assert.equal(ytDlpCaptureArgs("https://www.youtube.com/watch?v=1").includes("--user-agent"), false);
});

test("video subtitle lookup requests every real subtitle language but excludes danmaku", () => {
  const args = ytDlpSubtitleArgs(
    "/tmp/source.%(ext)s",
    "https://www.bilibili.com/video/BV1aN3q69E8z",
  );
  assert.equal(args[args.indexOf("--sub-langs") + 1], "all,-danmaku");
  assert.equal(args[args.indexOf("--sub-format") + 1], "vtt/srt/best");
  assert.ok(args.includes("--write-subs"));
  assert.ok(args.includes("--write-auto-subs"));
});

test("subtitle file selection follows language preference without hard-coding availability", () => {
  assert.equal(selectPreferredSubtitleFile([
    "source.en.vtt",
    "source.ai-zh.srt",
    "source.ja.vtt",
  ]), "source.ai-zh.srt");
  assert.equal(selectPreferredSubtitleFile(["source.ja.vtt"]), "source.ja.vtt");
  assert.equal(selectPreferredSubtitleFile(["source.danmaku.xml"]), undefined);
});

test("yt-dlp update warnings do not hide the actionable capture failure", () => {
  const error = formatYtDlpCaptureError([
    "WARNING: Your yt-dlp version (2026.02.21) is older than 90 days!",
    "ERROR: [BiliBili] BV1: Unable to download JSON metadata: HTTP Error 412: Precondition Failed",
  ].join("\n"), "https://www.bilibili.com/video/BV1");
  assert.match(error, /Bilibili/);
  assert.match(error, /HTTP 412/);
  assert.match(error, /自动配置/);
  assert.doesNotMatch(error, /older than 90 days/);
});

test("all capture types inherit the globally configured AI provider", () => {
  assert.equal(selectedCaptureProvider("openai-compatible", "article"), "openai-compatible");
  assert.equal(selectedCaptureProvider("antigravity-cli", "video"), "antigravity-cli");
  assert.equal(selectedCaptureProvider("claude-cli", "audio"), "claude-cli");
});

test("link-note detection accepts one link with a title and rejects substantive notes", () => {
  assert.deepEqual(detectLinkNoteCandidate([
    "---",
    "阅读状态: 在看",
    "自定义属性: 保留",
    "---",
    "# 一篇待处理文章",
    "",
    "来源：https://example.com/article",
  ].join("\n"), "文件名"), {
    url: "https://example.com/article",
    title: "一篇待处理文章",
  });
  assert.equal(detectLinkNoteCandidate([
    "# 已经写过正文",
    "https://example.com/article",
    "这是用户已经写好的完整正文。".repeat(20),
  ].join("\n")), null);
  assert.equal(detectLinkNoteCandidate("https://example.com/a\nhttps://example.com/b"), null);
  assert.equal(detectLinkNoteCandidate([
    "---",
    "KnowGrove采集状态: 已完成",
    "---",
    "https://example.com/article",
  ].join("\n")), null);
});

test("link-note detection accepts a sparse local voice note and rejects completed or substantive audio notes", () => {
  const voiceSession = [
    "---",
    "文件名: 2026-07-31 105448 语音记录",
    "type: voice-session",
    "audio: \"[[2026-07-31 105448 语音记录.m4a]]\"",
    "tags: [voice-note]",
    "---",
    "# 语音记录 2026-07-31 10:54",
    "",
    "![[2026-07-31 105448 语音记录.m4a]]",
    "",
    "## 中断记录",
    "",
    "- 无",
    "",
    "## 整理记录",
  ].join("\n");
  assert.deepEqual(detectLinkNoteCandidate(voiceSession, "2026-07-31 105448 语音记录"), {
    url: "",
    title: "语音记录 2026-07-31 10:54",
    pageType: "audio",
    mediaPath: "2026-07-31 105448 语音记录.m4a",
  });
  assert.equal(detectLinkNoteCandidate(`${voiceSession}\n\n${"这是用户已经整理好的正文。".repeat(20)}`), null);
  assert.equal(detectLinkNoteCandidate(
    voiceSession.replace("---\n# 语音记录", "KnowGrove采集状态: 已完成\n---\n# 语音记录"),
  ), null);
});

test("link-note detection accepts safe desktop webm recording segments", () => {
  const voiceSession = [
    "---",
    "audio: \"[[阅读列表/录音/语音记录.webm]]\"",
    "---",
    "# 语音记录",
    "",
    "![[阅读列表/录音/语音记录.webm]]",
    "",
    "## 整理记录",
  ].join("\n");
  assert.deepEqual(detectLinkNoteCandidate(voiceSession, "语音记录"), {
    url: "",
    title: "语音记录",
    pageType: "audio",
    mediaPath: "阅读列表/录音/语音记录.webm",
  });
});

test("startup link-note scan selects newest Markdown files only inside the configured folder", () => {
  assert.deepEqual(latestLinkNoteScanFiles([
    { path: "Home/📬输入/旧链接.md", mtime: 10 },
    { path: "Home/📬输入/新链接.md", mtime: 30 },
    { path: "Home/其他/不应扫描.md", mtime: 40 },
    { path: "Home/📬输入/附件.png", mtime: 50 },
    { path: "Home/📬输入/中间链接.md", mtime: 20 },
  ], "Home/📬输入", 2), [
    { path: "Home/📬输入/新链接.md", mtime: 30 },
    { path: "Home/📬输入/中间链接.md", mtime: 20 },
  ]);
});

test("KeepRec sparse capture template remains eligible for automatic organization", () => {
  assert.deepEqual(detectLinkNoteCandidate([
    "---",
    "type: keeprec-capture",
    "capture_id: d21bcce0-8fc6-406e-8cda-bc8a0b85fffa",
    "source_type: webpage",
    "source_url: \"https://example.com/story\"",
    "status: inbox",
    "---",
    "",
    "# 稍后整理的文章",
    "",
    "**来源**：示例来源",
    "",
    "[打开原内容](<https://example.com/story>)",
    "",
    "## 整理",
  ].join("\n"), "言序收集"), {
    url: "https://example.com/story",
    title: "稍后整理的文章",
  });
});

test("capture body comparison ignores concurrent property-only changes", () => {
  const original = [
    "---",
    "KnowGrove采集状态: 处理中",
    "---",
    "# 标题",
    "",
    "## 原文",
    "",
    "正文",
  ].join("\n");
  const propertiesChanged = [
    "---",
    "文件名: 标题",
    "KnowGrove采集状态: 处理中",
    "领域:",
    "  - AI",
    "---",
    "# 标题",
    "",
    "## 原文",
    "",
    "正文",
  ].join("\n");
  assert.equal(
    stripCaptureFrontmatter(original),
    stripCaptureFrontmatter(propertiesChanged),
  );
  assert.notEqual(
    stripCaptureFrontmatter(original),
    stripCaptureFrontmatter(`${propertiesChanged}\n用户补写`),
  );
});

test("interrupted raw capture can resume AI organization without downloading the source again", () => {
  const interrupted = detectInterruptedCapture([
    "---",
    "来源: \"https://example.com/story\"",
    "内容类型: \"网页文章\"",
    "KnowGrove采集状态: 处理中",
    "---",
    "",
    "# 已保存的文章",
    "",
    "## 原文",
    "",
    "这是已经安全写入本地的原文内容。".repeat(12),
  ].join("\n"));
  assert.deepEqual(interrupted, {
    url: "https://example.com/story",
    title: "已保存的文章",
    pageType: "article",
    source: "这是已经安全写入本地的原文内容。".repeat(12),
  });
  assert.equal(detectInterruptedCapture([
    "---",
    "来源: \"https://example.com/story\"",
    "KnowGrove采集状态: 已完成",
    "---",
    "## 原文",
    "已有正文".repeat(30),
  ].join("\n")), null);
});

test("video transcription supports both Whisper CLIs", () => {
  assert.equal(detectWhisperImplementation("/opt/homebrew/bin/whisper"), "openai-whisper");
  assert.equal(detectWhisperImplementation("/opt/homebrew/bin/whisper-cli"), "whisper-cpp");
  assert.equal(whisperNeedsPcmConversion("whisper-cpp", "/tmp/voice.m4a"), true);
  assert.equal(whisperNeedsPcmConversion("whisper-cpp", "/tmp/voice.wav"), false);
  assert.equal(whisperNeedsPcmConversion("openai-whisper", "/tmp/voice.m4a"), false);
  assert.deepEqual(buildWhisperInvocation({
    implementation: "openai-whisper",
    audioPath: "/tmp/audio.mp3",
    outputDirectory: "/tmp/output",
    model: "small",
  }), {
    args: [
      "/tmp/audio.mp3",
      "--model",
      "small",
      "--output_format",
      "txt",
      "--output_dir",
      "/tmp/output",
    ],
  });
  assert.deepEqual(buildWhisperInvocation({
    implementation: "whisper-cpp",
    audioPath: "/tmp/audio.mp3",
    outputDirectory: "/tmp/output",
    model: "small",
    cppModelPath: "/models/ggml-small.bin",
  }), {
    args: [
      "-m",
      "/models/ggml-small.bin",
      "-f",
      "/tmp/audio.mp3",
      "-l",
      "auto",
      "-otxt",
      "-of",
      "/tmp/output/transcript",
      "-np",
    ],
    transcriptPath: "/tmp/output/transcript.txt",
  });
});

test("browser capture extracts JSON surrounded by provider text", () => {
  assert.deepEqual(extractJsonObject("结果：```json\n{\"summary\":\"好\"}\n```"), { summary: "好" });
});

test("browser capture normalizes AI output", () => {
  assert.deepEqual(normalizeBrowserCaptureAIResult({
    summary: "摘要",
    key_points: ["一", "二"],
    mode: "multi-speaker",
    body_markdown: "## 对话\n\n正文",
  }, "video"), {
    summary: "摘要",
    keyPoints: ["一", "二"],
    mode: "multi-speaker",
    bodyMarkdown: "### 对话\n\n正文",
  });
});

test("browser capture splits long material and removes VTT metadata", () => {
  assert.equal(splitBrowserCaptureText("a".repeat(20), 10).length, 2);
  assert.equal(parseWebVtt([
    "WEBVTT",
    "",
    "00:00:00.000 --> 00:00:02.000",
    "<c>第一句。</c>",
    "",
    "00:00:02.000 --> 00:00:04.000",
    "第一句。",
    "第二句。",
  ].join("\n")), "第一句。第二句。");
});

test("Bilibili JSON subtitles and Whisper fragments become readable paragraphs", () => {
  assert.equal(parseSubtitleText(JSON.stringify({
    body: [
      { content: "第一句。" },
      { content: "第二句。" },
      { content: "第三句。" },
      { content: "第四句。" },
      { content: "第五句。" },
    ],
  }), "source.ai-zh.json"), "第一句。第二句。第三句。第四句。\n\n第五句。");
  assert.equal(
    formatTranscriptParagraphs("KnowGrove makes\nsubtitle fragments\nread naturally."),
    "KnowGrove makes subtitle fragments read naturally.",
  );
  const punctuationFreeTranscript = formatTranscriptParagraphs("没有标点的转录片段".repeat(80));
  assert.ok(punctuationFreeTranscript.split("\n\n").length > 2);
  assert.ok(punctuationFreeTranscript.split("\n\n").every((paragraph) => paragraph.length <= 280));
});

test("browser capture builds a completed note while retaining source", () => {
  const raw = buildRawCaptureNote({
    pageType: "article",
    title: "测试文章",
    url: "https://example.com",
    source: "原始正文",
    capturedAt: "2026-07-26T00:00:00.000Z",
    statusProperty: "阅读状态",
    readingStatus: "在看",
  });
  const completed = buildEnhancedCaptureNote(raw, "article", {
    summary: "内容摘要",
    keyPoints: ["要点"],
    mode: "article",
    bodyMarkdown: "### 正文\n\n整理内容",
  });
  assert.match(completed, /KnowGrove采集状态: "已完成"/);
  assert.match(completed, /## 原文\n\n原始正文/);
  assert.match(completed, /## 内容摘要\n\n内容摘要/);
  assert.equal(safeCaptureFileName("a/b:c"), "a b c");
});

test("article cleanup removes WeChat preamble, cover art, and footer noise", () => {
  const cleaned = cleanArticleMarkdown([
    "郑佳美",
    "AI科技评论",
    "在小说阅读器读本章",
    "去阅读",
    "![](https://example.com/cover.jpg)",
    "文章导语。",
    "作者丨郑佳美",
    "编辑丨马晓宁",
    "****",
    "![](https://example.com/logo.png)",
    "这是正文第一段，包含足够的信息并且应该被完整保留下来。",
    "",
    "![](https://example.com/body.png)",
    "",
    "这是正文第二段。",
    "",
    "![](https://example.com/promo.png)",
    "**上车，带你看遍全部内容**",
    "无关推广内容",
  ].join("\n"), "测试文章");
  assert.doesNotMatch(cleaned, /郑佳美|编辑丨|cover|logo|promo|上车|无关推广/);
  assert.match(cleaned, /正文第一段/);
  assert.match(cleaned, /body\.png/);
});

test("article image placeholders survive AI rewriting and missing tokens are recovered", () => {
  const protectedArticle = protectArticleImages([
    "第一段",
    "![[Home/📬输入/assets/文章/one.png|图一]]",
    "第二段",
    "![图二](https://example.com/two.png)",
  ].join("\n\n"));
  assert.deepEqual(protectedArticle.images.map((item) => item.token), [
    "{{KNOWGROVE_IMAGE_001}}",
    "{{KNOWGROVE_IMAGE_002}}",
  ]);
  const restored = restoreArticleImages([
    "### 整理正文",
    "",
    "第一段",
    "",
    "{{KNOWGROVE_IMAGE_001}}",
  ].join("\n"), protectedArticle.images);
  assert.match(restored, /!\[\[Home\/📬输入\/assets\/文章\/one\.png\|图一]]/);
  assert.match(restored, /### 正文图片[\s\S]*!\[图二]\(https:\/\/example\.com\/two\.png\)/);
  assert.doesNotMatch(restored, /KNOWGROVE_IMAGE/);
});

test("raw capture synchronizes the file name property with the article title", () => {
  const raw = buildRawCaptureNote({
    pageType: "article",
    title: "文章标题",
    fileName: "文章标题",
    url: "https://example.com",
    source: "正文",
    capturedAt: "2026-07-28T00:00:00.000Z",
    statusProperty: "阅读状态",
    readingStatus: "在看",
  });
  assert.match(raw, /^文件名: "文章标题"$/m);
  assert.match(raw, /^# 文章标题$/m);
});

test("article titles use a sortable local date prefix without duplicating an existing prefix", () => {
  assert.equal(captureDatePrefix("2026/7/8"), "2026-07-08");
  assert.equal(
    datedArticleTitle("文章标题", "2026-07-28"),
    "2026-07-28-文章标题",
  );
  assert.equal(
    datedArticleTitle("2026-07-28-文章标题", "2026-07-28"),
    "2026-07-28-文章标题",
  );
  assert.equal(
    articleCaptureTitle("文章标题", "2026-07-28", false),
    "文章标题",
  );
});

test("audio capture keeps the original media as an Obsidian embed and retains the transcript", () => {
  const raw = buildRawCaptureNote({
    pageType: "audio",
    title: "访谈录音",
    url: "https://cdn.example.com/interview.m4a",
    source: "这是逐字稿。",
    mediaPath: "Home/📬输入/附件/音视频/访谈录音.m4a",
    capturedAt: "2026-07-28T00:00:00.000Z",
    statusProperty: "阅读状态",
    readingStatus: "在看",
  });
  assert.match(raw, /内容类型: "音频"/);
  assert.match(raw, /!\[\[Home\/📬输入\/附件\/音视频\/访谈录音\.m4a]]/);
  const completed = buildEnhancedCaptureNote(raw, "audio", {
    summary: "访谈摘要",
    keyPoints: ["一个要点"],
    mode: "multi-speaker",
    bodyMarkdown: "### 对话\n\n**甲**：内容",
  });
  assert.match(completed, /## 原始音频/);
  assert.match(completed, /!\[\[Home\/📬输入\/附件\/音视频\/访谈录音\.m4a]]/);
  assert.match(completed, /## 对话记录/);
  assert.match(completed, /## 完整逐字稿\n\n这是逐字稿。/);
  assert.doesNotMatch(completed, /file:\/\//);
});

test("local audio capture omits a fake source URL and keeps an Obsidian media reference", () => {
  const raw = buildRawCaptureNote({
    pageType: "audio",
    title: "语音记录",
    source: "这是本地语音逐字稿。",
    mediaPath: "Home/📬输入/assets/语音记录.m4a",
    capturedAt: "2026-07-31T00:00:00.000Z",
    statusProperty: "阅读状态",
    readingStatus: "在看",
  });
  assert.doesNotMatch(raw, /^来源:/m);
  assert.match(raw, /!\[\[Home\/📬输入\/assets\/语音记录\.m4a]]/);
  assert.doesNotMatch(raw, /file:\/\//);
});

test("browser capture failure note leaves a final retryable state", () => {
  const failed = buildCaptureFailureNote({
    pageType: "article",
    title: "登录态页面",
    url: "https://example.com/dashboard",
    capturedAt: "2026-07-27T00:00:00.000Z",
    error: "net::ERR_CONNECTION_CLOSED",
  });
  assert.match(failed, /KnowGrove采集状态: "部分完成"/);
  assert.match(failed, /重新打开来源页面后，可以再次点击言序重试/);
  assert.match(failed, /net::ERR_CONNECTION_CLOSED/);
  assert.doesNotMatch(failed, /KnowGrove 正在提取/);
});
