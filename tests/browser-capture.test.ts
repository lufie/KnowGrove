import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCaptureFailureNote,
  articleCaptureTitle,
  buildEnhancedCaptureNote,
  buildRawCaptureNote,
  buildWhisperInvocation,
  buildWhisperPcmConversionArgs,
  browserCaptureChunkPrompt,
  browserCapturePrompt,
  browserCaptureSynthesisPrompt,
  classifyBrowserCaptureResource,
  classifyBrowserCaptureUrl,
  captureDatePrefix,
  captureCancellationPlan,
  CAPTURE_FILE_NAME_MAX_BYTES,
  cleanArticleMarkdown,
  detectCaptureErrorShell,
  detectInterruptedCapture,
  detectLinkNoteCandidate,
  detectWhisperImplementation,
  whisperNeedsPcmConversion,
  datedArticleTitle,
  extractJsonObject,
  extractEmbeddedMediaCandidates,
  extractStructuredCaptureTextFromScripts,
  formatTranscriptParagraphs,
  formatYtDlpCaptureError,
  latestLinkNoteScanFiles,
  normalizeBrowserCaptureAIResult,
  normalizeCaptureSessionCookies,
  parseSubtitleText,
  parseWebVtt,
  protectArticleImages,
  restoreArticleImages,
  safeCaptureFileName,
  sameCaptureResourceUrl,
  selectPreferredSubtitleFile,
  selectedCaptureProvider,
  serializeNetscapeCookies,
  selectApplePodcastEpisode,
  splitBrowserCaptureText,
  stripCaptureFrontmatter,
  ytDlpCaptureArgs,
  ytDlpSubtitleArgs,
  extractRootDomain,
  matchDomainSessionCookies,
  parseRawCookieString,
  parseTikTokHtml,
  parseXiguaHtml,
  extractVimeoVideoId,
  extractTencentVideoVid,
} from "../src/browser-capture-core";
import { runBrowserProviderWithHandoff } from "../src/browser-provider-handoff";
import type { AIPropertySettings } from "../src/types";

function providerSettings(
  provider: AIPropertySettings["provider"],
  model = "",
): AIPropertySettings {
  return {
    enabled: true,
    autoEnrichNewNotes: true,
    provider,
    model,
    executablePath: "",
    endpoint: "",
    maxContentCharacters: 40_000,
    timeoutSeconds: 900,
  };
}

test("browser capture hands an in-flight prompt to a newly selected CLI", async () => {
  let current = providerSettings("codex-cli", "gpt-old");
  const attempts: string[] = [];
  const resultPromise = runBrowserProviderWithHandoff({
    requestedProvider: "codex-cli",
    getSettings: () => current,
    pollIntervalMilliseconds: 10,
    scheduleInterval: (callback, milliseconds) => setInterval(callback, milliseconds),
    clearScheduledInterval: (handle) => clearInterval(handle as NodeJS.Timeout),
    execute: async (settings, signal) => {
      attempts.push(`${settings.provider}:${settings.model}`);
      if (settings.provider === "codebuddy-cli") return "new-provider-output";
      return await new Promise<string>((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          const error = new Error("old provider stopped");
          error.name = "AbortError";
          reject(error);
        }, { once: true });
      });
    },
  });
  globalThis.setTimeout(() => {
    current = providerSettings("codebuddy-cli", "buddy-new");
  }, 25);
  const result = await resultPromise;
  assert.deepEqual(attempts, ["codex-cli:gpt-old", "codebuddy-cli:buddy-new"]);
  assert.equal(result.output, "new-provider-output");
  assert.equal(result.providerId, "codebuddy-cli");
  assert.equal(result.handoffCount, 1);
});

test("browser capture does not retry a failed provider when configuration is unchanged", async () => {
  const current = providerSettings("codex-cli", "gpt-same");
  let attempts = 0;
  await assert.rejects(
    runBrowserProviderWithHandoff({
      requestedProvider: "codex-cli",
      getSettings: () => current,
      pollIntervalMilliseconds: 10,
      scheduleInterval: (callback, milliseconds) => setInterval(callback, milliseconds),
      clearScheduledInterval: (handle) => clearInterval(handle as NodeJS.Timeout),
      execute: async () => {
        attempts += 1;
        throw new Error("provider failed");
      },
    }),
    /provider failed/,
  );
  assert.equal(attempts, 1);
});

test("browser capture cancellation wins over provider handoff", async () => {
  const controller = new AbortController();
  let current = providerSettings("codex-cli");
  let attempts = 0;
  const promise = runBrowserProviderWithHandoff({
    requestedProvider: "codex-cli",
    getSettings: () => current,
    signal: controller.signal,
    pollIntervalMilliseconds: 10,
    scheduleInterval: (callback, milliseconds) => setInterval(callback, milliseconds),
    clearScheduledInterval: (handle) => clearInterval(handle as NodeJS.Timeout),
    execute: async (_settings, signal) => {
      attempts += 1;
      return await new Promise<string>((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          const error = new Error("stopped");
          error.name = "AbortError";
          reject(error);
        }, { once: true });
      });
    },
  });
  globalThis.setTimeout(() => {
    current = providerSettings("codebuddy-cli");
    controller.abort();
  }, 25);
  await assert.rejects(promise, (error: unknown) => error instanceof Error && error.name === "AbortError");
  assert.equal(attempts, 1);
});

test("browser capture classifies common video hosts", () => {
  assert.equal(classifyBrowserCaptureUrl("https://www.youtube.com/watch?v=1"), "video");
  assert.equal(classifyBrowserCaptureUrl("https://www.bilibili.com/video/BV1"), "video");
  assert.equal(classifyBrowserCaptureUrl("https://example.com/article"), "article");
  assert.equal(classifyBrowserCaptureUrl("https://cdn.example.com/interview.m4a"), "audio");
  assert.equal(classifyBrowserCaptureUrl("https://podcasts.apple.com/cn/podcast/example/id1"), "audio");
  assert.equal(classifyBrowserCaptureUrl("https://www.instagram.com/reel/example/"), "video");
  assert.equal(classifyBrowserCaptureUrl("https://vimeo.com/56015672"), "video");
  assert.equal(classifyBrowserCaptureUrl("https://weixin.qq.com/sph/example"), "video");
  assert.equal(classifyBrowserCaptureUrl("https://weixin.qq.com/article/example"), "article");
});

test("Apple Podcasts resolves a shared episode or the latest show episode to public audio", () => {
  const results = [
    { wrapperType: "track", kind: "podcast", trackId: 1894113824, trackName: "Top Five Tech" },
    {
      wrapperType: "podcastEpisode",
      kind: "podcast-episode",
      trackId: 1000783300456,
      trackName: "Latest episode",
      episodeUrl: "https://media.example.com/latest.mp3",
    },
    {
      wrapperType: "podcastEpisode",
      kind: "podcast-episode",
      trackId: 1000779262450,
      trackName: "Shared episode",
      episodeUrl: "https://media.example.com/shared.mp3",
    },
  ];
  assert.deepEqual(
    selectApplePodcastEpisode("https://podcasts.apple.com/us/podcast/show/id1894113824", results),
    { title: "Latest episode", mediaUrl: "https://media.example.com/latest.mp3" },
  );
  assert.deepEqual(
    selectApplePodcastEpisode("https://podcasts.apple.com/us/podcast/show/id1894113824?i=1000779262450", results),
    { title: "Shared episode", mediaUrl: "https://media.example.com/shared.mp3" },
  );
  assert.equal(selectApplePodcastEpisode("https://example.com/id1894113824", results), undefined);
});

test("articles with incidental embedded media stay articles while media candidates are inventoried", () => {
  const html = [
    "<article>",
    `<p>${"正文内容".repeat(800)}</p>`,
    '<video controls src="https://cdn.example.com/interview.mp4"></video>',
    '<audio src="/episode.m4a"></audio>',
    "</article>",
  ].join("");
  assert.equal(classifyBrowserCaptureResource("https://example.com/story", { html }), "article");
  assert.deepEqual(extractEmbeddedMediaCandidates(html, "https://example.com/story"), [
    { url: "https://cdn.example.com/interview.mp4", pageType: "video" },
    { url: "https://example.com/episode.m4a", pageType: "audio" },
  ]);
});

test("capture rejects expired login and verification shells", () => {
  assert.equal(detectCaptureErrorShell({ text: "你访问的页面不见了" }), "页面内容不存在或已经失效");
  assert.equal(detectCaptureErrorShell({ title: "安全验证", text: "请完成验证码后继续" }), "页面要求完成人机验证");
  assert.equal(detectCaptureErrorShell({ text: "请先登录后查看这篇内容" }), "页面需要登录后才能读取内容");
  assert.equal(detectCaptureErrorShell({ text: "这是一篇正常文章，讨论产品登录流程。".repeat(500) }), undefined);
});

test("browser session cookies are scoped to the current site and serialized ephemerally", () => {
  const cookies = normalizeCaptureSessionCookies([
    { domain: ".douyin.com", path: "/", name: "sessionid", value: "safe", secure: true, expirationDate: 2_000_000_000 },
    { domain: ".example.com", path: "/", name: "secret", value: "blocked" },
    { domain: ".douyin.com", path: "/", name: "bad", value: "line\nbreak" },
  ], "https://www.douyin.com/video/1");
  assert.equal(cookies.length, 1);
  const serialized = serializeNetscapeCookies(cookies);
  assert.match(serialized, /^# Netscape HTTP Cookie File/);
  assert.match(serialized, /\.douyin\.com\tTRUE\t\/\tTRUE\t2000000000\tsessionid\tsafe/);
  assert.doesNotMatch(serialized, /example|line/);
});

test("extractRootDomain and matchDomainSessionCookies support multiple platforms", () => {
  assert.equal(extractRootDomain("https://www.xiaohongshu.com/explore/123"), "xiaohongshu.com");
  assert.equal(extractRootDomain("https://xhslink.com/m/abc"), "xhslink.com");
  assert.equal(extractRootDomain("https://v.douyin.com/xyz"), "douyin.com");
  assert.equal(extractRootDomain("https://m.ixigua.com/video/789"), "ixigua.com");
  assert.equal(extractRootDomain("https://player.vimeo.com/video/456"), "vimeo.com");
  assert.equal(extractRootDomain("https://v.qq.com/x/cover/cid/vid.html"), "qq.com");

  const sessions = {
    "xiaohongshu.com": {
      domain: "xiaohongshu.com",
      cookies: [{ domain: ".xiaohongshu.com", path: "/", name: "web_session", value: "abc" }],
      updatedAt: 1700000000000,
    },
    "douyin.com": {
      domain: "douyin.com",
      cookies: [{ domain: ".douyin.com", path: "/", name: "passport_csrf_token", value: "def" }],
      userAgent: "CustomUA/1.0",
      updatedAt: 1700000000000,
    },
  };

  const matchedXhs = matchDomainSessionCookies(sessions, "https://www.xiaohongshu.com/discovery/item/666");
  assert.equal(matchedXhs?.cookies.length, 1);
  assert.equal(matchedXhs?.cookies[0]?.name, "web_session");

  const matchedDouyin = matchDomainSessionCookies(sessions, "https://v.douyin.com/test");
  assert.equal(matchedDouyin?.cookies[0]?.name, "passport_csrf_token");
  assert.equal(matchedDouyin?.userAgent, "CustomUA/1.0");

  const matchedUnknown = matchDomainSessionCookies(sessions, "https://example.com");
  assert.equal(matchedUnknown, undefined);
});

test("parseRawCookieString correctly parses Netscape and cookie header formats", () => {
  const headerFormat = "a_cookie=val1; b_cookie=val2; secure; HttpOnly";
  const parsedHeader = parseRawCookieString(headerFormat, "tiktok.com");
  assert.equal(parsedHeader.length, 2);
  assert.equal(parsedHeader[0]?.name, "a_cookie");
  assert.equal(parsedHeader[0]?.value, "val1");
  assert.equal(parsedHeader[0]?.domain, ".tiktok.com");

  const netscapeFormat = [
    "# Netscape HTTP Cookie File",
    ".bilibili.com\tTRUE\t/\tTRUE\t2000000000\tSESSDATA\txyz123",
    ".bilibili.com\tTRUE\t/\tFALSE\t2000000000\tbili_jct\tabc456",
  ].join("\n");
  const parsedNetscape = parseRawCookieString(netscapeFormat, "bilibili.com");
  assert.equal(parsedNetscape.length, 2);
  assert.equal(parsedNetscape[0]?.name, "SESSDATA");
  assert.equal(parsedNetscape[0]?.value, "xyz123");
  assert.equal(parsedNetscape[1]?.name, "bili_jct");
});

test("platform resolvers parse TikTok, Xigua, Vimeo, and Tencent video metadata", () => {
  const mockTikTokHtml = `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">{"__DEFAULT_SCOPE__":{"webapp.video-detail":{"itemInfo":{"itemStruct":{"desc":"TikTok 创意测试视频","author":{"nickname":"创作者A"},"video":{"duration":60,"playAddr":"https://v.tiktok.com/play.mp4"},"music":{"playUrl":"https://v.tiktok.com/music.mp3"}}}}}}</script>`;
  const tikTokMeta = parseTikTokHtml(mockTikTokHtml);
  assert.equal(tikTokMeta?.title, "TikTok 创意测试视频");
  assert.equal(tikTokMeta?.author, "创作者A");
  assert.equal(tikTokMeta?.duration, 60);
  assert.equal(tikTokMeta?.audioUrl, "https://v.tiktok.com/music.mp3");

  const mockXiguaHtml = `<script>window._SSR_DATA = {"data":{"storeState":{"detail":{"videoData":{"result":{"title":"西瓜视频精选纪录片","duration":3600,"media_user":{"screen_name":"纪录片频道"}}}}}}};</script>`;
  const xiguaMeta = parseXiguaHtml(mockXiguaHtml);
  assert.equal(xiguaMeta?.title, "西瓜视频精选纪录片");
  assert.equal(xiguaMeta?.author, "纪录片频道");
  assert.equal(xiguaMeta?.duration, 3600);

  const vimeoId = extractVimeoVideoId("https://vimeo.com/channels/staffpicks/56015672");
  assert.equal(vimeoId, "56015672");

  const tencentVid = extractTencentVideoVid("https://v.qq.com/x/cover/mzc00200l2l82c7/q326831cny0.html");
  assert.equal(tencentVid, "q326831cny0");
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

test("capture cancellation deletes only task-owned notes and attachments", () => {
  assert.deepEqual(captureCancellationPlan({
    createdNotePath: "Home/输入/任务.md",
    createdAttachmentPaths: ["Home/输入/assets/a.png", "Home/输入/assets/a.png", "Home/输入/assets/b.m4a"],
  }), {
    trashPaths: ["Home/输入/assets/a.png", "Home/输入/assets/b.m4a", "Home/输入/任务.md"],
    restoreTarget: false,
  });
  assert.deepEqual(captureCancellationPlan({
    targetPath: "Home/输入/用户原有笔记.md",
    createdAttachmentPaths: ["Home/输入/assets/task.png"],
  }), {
    trashPaths: ["Home/输入/assets/task.png"],
    restoreTarget: true,
  });
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

test("link-note detection sends local video files through the media transcription path", () => {
  const videoSession = [
    "---",
    "video: \"[[Home/📬输入/assets/interview.mov]]\"",
    "---",
    "# Product interview",
    "",
    "![[Home/📬输入/assets/interview.mov]]",
    "",
    "## 视频记录",
  ].join("\n");
  assert.deepEqual(detectLinkNoteCandidate(videoSession, "Product interview"), {
    url: "",
    title: "Product interview",
    pageType: "video",
    mediaPath: "Home/📬输入/assets/interview.mov",
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
  ].join("\n"), "言续收集"), {
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
  assert.deepEqual(buildWhisperPcmConversionArgs("/tmp/voice.m4a", "/tmp/voice.wav"), [
    "-y", "-i", "/tmp/voice.m4a", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", "/tmp/voice.wav",
  ]);
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

test("media analysis prompts follow the output locale while preserving source-language quotations", () => {
  for (const prompt of [
    browserCapturePrompt("audio", "English interview", "We discussed the launch.", "zh-CN"),
    browserCaptureChunkPrompt("video", "English interview", "We discussed the launch.", 1, 2, "zh-CN"),
    browserCaptureSynthesisPrompt("audio", "English interview", [{
      summary: "发布讨论",
      keyPoints: ["时间安排"],
      mode: "multi-speaker",
      bodyMarkdown: "### 发布计划",
    }], "zh-CN"),
  ]) {
    assert.match(prompt, /分析输出语言必须使用简体中文（zh-CN）/);
    assert.match(prompt, /原话.*保持原语言/);
  }
  const englishPrompt = browserCapturePrompt("audio", "中文访谈", "我们讨论了发布计划。", "en");
  assert.match(englishPrompt, /分析输出语言必须使用English（en）/);
  assert.match(englishPrompt, /summary in English/);
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

test("capture file names stay below the cross-platform UTF-8 byte limit", () => {
  const fileName = safeCaptureFileName(`2026-08-15-${"超长中文标题".repeat(40)}.`);
  assert.ok(new TextEncoder().encode(fileName).length <= CAPTURE_FILE_NAME_MAX_BYTES);
  assert.doesNotMatch(fileName, /[. ]$/);
  assert.ok(new TextEncoder().encode(`${fileName} 99.md`).length < 255);
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

test("localized media notes keep the transcript language and localize only analysis structure", () => {
  const raw = buildRawCaptureNote({
    pageType: "video",
    title: "English interview",
    source: "We discussed the launch date and pricing.",
    mediaPath: "Home/Inbox/interview.mp4",
    capturedAt: "2026-08-14T00:00:00.000Z",
    statusProperty: "阅读状态",
    readingStatus: "在看",
    outputLocale: "zh-CN",
  });
  assert.match(raw, /## 原始视频/);
  assert.match(raw, /## 完整逐字稿\n\nWe discussed the launch date and pricing\./);
  const completed = buildEnhancedCaptureNote(raw, "video", {
    summary: "访谈讨论了发布日期和定价。",
    keyPoints: ["需要确认发布日期"],
    mode: "single-speaker",
    bodyMarkdown: "### 发布计划\n\n需要进一步确认时间。",
  }, "zh-CN");
  assert.match(completed, /## 内容摘要\n\n访谈讨论了发布日期和定价。/);
  assert.match(completed, /## 视频正文/);
  assert.match(completed, /## 完整逐字稿\n\nWe discussed the launch date and pricing\./);

  const englishRaw = buildRawCaptureNote({
    pageType: "audio",
    title: "中文访谈",
    source: "我们讨论了发布日期。",
    mediaPath: "Home/Inbox/interview.m4a",
    capturedAt: "2026-08-14T00:00:00.000Z",
    statusProperty: "阅读状态",
    readingStatus: "在看",
    outputLocale: "en",
  });
  const englishCompleted = buildEnhancedCaptureNote(englishRaw, "audio", {
    summary: "The interview covered the launch date.",
    keyPoints: ["Confirm the launch date"],
    mode: "multi-speaker",
    bodyMarkdown: "### Launch plan\n\nThe date needs confirmation.",
  }, "en");
  assert.match(englishCompleted, /## Summary/);
  assert.match(englishCompleted, /## Key points/);
  assert.match(englishCompleted, /## Conversation/);
  assert.match(englishCompleted, /## Full transcript\n\n我们讨论了发布日期。/);
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
  assert.match(failed, /重新打开来源页面后，可以再次点击言续重试/);
  assert.match(failed, /net::ERR_CONNECTION_CLOSED/);
  assert.doesNotMatch(failed, /KnowGrove 正在提取/);
});
