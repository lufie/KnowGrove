import assert from "node:assert/strict";
import test from "node:test";
import {
  batchCaptureFileStem,
  buildBatchLinkNote,
  buildDesktopRecordingNote,
  extractBatchCaptureUrls,
  formatRecordingDuration,
  recordingExtension,
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
