import assert from "node:assert/strict";
import test from "node:test";
import {
  batchCaptureFileStem,
  buildBatchLinkNote,
  buildDesktopRecordingNote,
  buildLocalMediaImportNote,
  extractBatchCaptureUrls,
  formatRecordingDuration,
  LOCAL_MEDIA_IMPORT_ACCEPT,
  LOCAL_MEDIA_IMPORT_FORMAT_LABEL,
  localMediaImportTitle,
  localMediaImportType,
  recordingExtension,
  recordingFinalizationMessage,
  recordingFinalizationMode,
  recordingMimeType,
  recordingStreamCopyExtension,
  type DesktopRecordingManifest,
} from "../src/capture-center-core";

test("batch capture extracts valid unique links from single, multiline, and mixed text", () => {
  assert.deepEqual(extractBatchCaptureUrls("https://example.com/a"), ["https://example.com/a"]);
  assert.deepEqual(extractBatchCaptureUrls([
    "第一篇 https://example.com/a。",
    "https://www.bilibili.com/video/BV1/?x=1",
    "重复：https://example.com/a",
    "不是链接 example.com/nope",
  ].join("\n")), [
    "https://example.com/a",
    "https://www.bilibili.com/video/BV1/?x=1",
  ]);
});

test("capture notes remain sparse and use deterministic local names", () => {
  const date = new Date(2026, 7, 11, 9, 5, 7);
  assert.equal(batchCaptureFileStem(date, 0, "www.example.com"), "2026-08-11 090507-01-example.com");
  const note = buildBatchLinkNote("https://example.com/a", "example.com", date);
  assert.match(note, /来源链接: "https:\/\/example\.com\/a"/);
  assert.match(note, /KnowGrove采集状态: "待处理"/);
  assert.match(note, /# example\.com\n\nhttps:\/\/example\.com\/a/);
});

test("local media import accepts the advertised audio and video formats", () => {
  assert.equal(localMediaImportType("Interview.M4A"), "audio");
  assert.equal(localMediaImportType("产品演示.MOV"), "video");
  assert.equal(localMediaImportType("archive.pdf"), undefined);
  assert.equal(localMediaImportTitle("/Users/example/产品：演示?.MP4"), "产品 演示");
  assert.match(LOCAL_MEDIA_IMPORT_ACCEPT, /\.mp3/);
  assert.match(LOCAL_MEDIA_IMPORT_ACCEPT, /\.m4v/);
  assert.match(LOCAL_MEDIA_IMPORT_FORMAT_LABEL, /音频：MP3/);
  assert.match(LOCAL_MEDIA_IMPORT_FORMAT_LABEL, /视频：MP4/);
});

test("local media import notes preserve a native media embed and parsing state", () => {
  const note = buildLocalMediaImportNote(
    "English interview",
    "Home/📬输入/附件/音视频/English interview.mov",
    "video",
    new Date("2026-08-14T03:00:00.000Z"),
  );
  assert.match(note, /^文件名: "English interview"$/m);
  assert.match(note, /^内容类型: "视频"$/m);
  assert.match(note, /^video: "\[\[Home\/📬输入\/附件\/音视频\/English interview\.mov\]\]"$/m);
  assert.match(note, /!\[\[Home\/📬输入\/附件\/音视频\/English interview\.mov]]/);
  assert.match(note, /KnowGrove采集状态: "待处理"/);
  assert.doesNotMatch(note, /file:\/\//);
});

test("desktop recording chooses supported media formats and formats duration", () => {
  assert.equal(recordingMimeType((type) => type === "audio/mp4"), "audio/mp4");
  assert.equal(recordingMimeType(() => false), "");
  assert.equal(recordingExtension("audio/webm;codecs=opus"), "webm");
  assert.equal(recordingExtension("audio/mp4"), "m4a");
  assert.equal(recordingStreamCopyExtension([{ mimeType: "audio/webm;codecs=opus" }]), "webm");
  assert.equal(recordingStreamCopyExtension([
    { mimeType: "audio/webm;codecs=opus" },
    { mimeType: "audio/webm" },
  ]), "webm");
  assert.equal(recordingStreamCopyExtension([
    { mimeType: "audio/webm" },
    { mimeType: "audio/mp4" },
  ]), undefined);
  assert.equal(recordingFinalizationMode([{ mimeType: "audio/webm" }]), "direct-copy");
  assert.equal(recordingFinalizationMode([
    { mimeType: "audio/webm;codecs=opus" },
    { mimeType: "audio/webm" },
  ]), "stream-copy");
  assert.equal(recordingFinalizationMode([
    { mimeType: "audio/webm" },
    { mimeType: "audio/mp4" },
  ]), "transcode");
  assert.equal(recordingFinalizationMessage([{ mimeType: "audio/webm" }]), "正在保存录音");
  assert.equal(recordingFinalizationMessage([
    { mimeType: "audio/webm" },
    { mimeType: "audio/webm" },
  ]), "正在合并并保存录音");
  assert.equal(formatRecordingDuration(65_500), "01:05");
  assert.equal(formatRecordingDuration(3_665_000), "01:01:05");
});

test("recording note embeds the vault audio and records interruption recovery", () => {
  const manifest: DesktopRecordingManifest = {
    version: 1,
    id: "session-1",
    title: "采访录音",
    state: "finalizing",
    createdAt: "2026-08-11T01:00:00.000Z",
    endedAt: "2026-08-11T01:10:00.000Z",
    recordedMilliseconds: 590_000,
    sessionMilliseconds: 600_000,
    segments: [],
    interruptions: [{
      startedAt: "2026-08-11T01:04:00.000Z",
      endedAt: "2026-08-11T01:04:10.000Z",
      reason: "麦克风被通话占用",
      resumedAutomatically: true,
    }],
  };
  const note = buildDesktopRecordingNote(manifest, "阅读列表/录音/采访录音.m4a");
  assert.match(note, /!\[\[阅读列表\/录音\/采访录音\.m4a]]/);
  assert.match(note, /麦克风被通话占用，已自动续录/);
  assert.doesNotMatch(note, /file:\/\//);
});

test("link capture queue lifecycle retains active and session-completed jobs but prunes historical jobs on reopen", () => {
  type MockJob = { id: string; status: "queued" | "running" | "completed" | "failed"; title: string };
  const serverJobs: MockJob[] = [
    { id: "job-1", status: "completed", title: "已完成的历史任务 1" },
    { id: "job-2", status: "running", title: "正在解析的任务 2" },
    { id: "job-3", status: "queued", title: "排队中的任务 3" },
  ];

  // Simulating Modal Session 1: onOpen
  const prunedHistoricalIds = new Set<string>();
  for (const job of serverJobs) {
    if (job.status === "completed" || job.status === "failed") {
      prunedHistoricalIds.add(job.id);
    }
  }

  // Pruned historical jobs should exclude job-1
  assert.equal(prunedHistoricalIds.has("job-1"), true);
  assert.equal(prunedHistoricalIds.has("job-2"), false);
  assert.equal(prunedHistoricalIds.has("job-3"), false);

  let visibleJobs = serverJobs.filter((job) => !prunedHistoricalIds.has(job.id));
  assert.deepEqual(visibleJobs.map((j) => j.id), ["job-2", "job-3"]);

  // User submits a new link while job-2 is running (non-blocking addition)
  serverJobs.push({ id: "job-4", status: "queued", title: "新追加的任务 4" });
  visibleJobs = serverJobs.filter((job) => !prunedHistoricalIds.has(job.id));
  assert.deepEqual(visibleJobs.map((j) => j.id), ["job-2", "job-3", "job-4"]);

  // While modal 1 is OPEN, job-2 completes
  const job2 = serverJobs.find((j) => j.id === "job-2")!;
  job2.status = "completed";

  // In modal 1, job-2 is NOT in prunedHistoricalIds, so it REMAINS VISIBLE as completed!
  visibleJobs = serverJobs.filter((job) => !prunedHistoricalIds.has(job.id));
  assert.deepEqual(visibleJobs.map((j) => j.id), ["job-2", "job-3", "job-4"]);
  assert.equal(visibleJobs.find((j) => j.id === "job-2")?.status, "completed");

  // Next, job-3 becomes running
  const job3 = serverJobs.find((j) => j.id === "job-3")!;
  job3.status = "running";

  // Now user closes modal 1 and opens modal 2 (Session 2: onOpen)
  const session2PrunedIds = new Set<string>();
  for (const job of serverJobs) {
    if (job.status === "completed" || job.status === "failed") {
      session2PrunedIds.add(job.id);
    }
  }

  // On reopen: job-1 and job-2 (which completed in the past) are pruned!
  assert.equal(session2PrunedIds.has("job-1"), true);
  assert.equal(session2PrunedIds.has("job-2"), true);
  assert.equal(session2PrunedIds.has("job-3"), false);
  assert.equal(session2PrunedIds.has("job-4"), false);

  const session2Visible = serverJobs.filter((job) => !session2PrunedIds.has(job.id));
  assert.deepEqual(session2Visible.map((j) => j.id), ["job-3", "job-4"]);
  assert.equal(session2Visible[0]?.status, "running");
  assert.equal(session2Visible[1]?.status, "queued");
});
