import assert from "node:assert/strict";
import test from "node:test";
import {
  alignRecordingMarkers,
  appendPreservedRecordingMarkerBlock,
  normalizeGeneratedMarkdownPreservingMarkers,
  parseRecordingMarkers,
  parseTimedTranscriptSrt,
  recordingMarkerHref,
  recordingMarkerOffsetFromHref,
  renderAlignedRecordingMarkers,
  stripRecordingMarkerBlocks,
} from "../src/recording-markers";

const markerBlock = [
  "%%",
  "knowgrove-markers-v1",
  '{"markers":[{"created_at":"2026-08-25T01:02:03Z","id":"marker-b","offset_ms":7500,"sequence":2,"source":"shortcut_future","title":"第二处"},{"created_at":"2026-08-25T01:01:00Z","id":"marker-a","offset_ms":2500,"sequence":1,"source":"app","title":null}],"schema":"knowgrove-markers-v1"}',
  "%%",
].join("\n");

test("recording markers remain optional for legacy notes", () => {
  assert.equal(parseRecordingMarkers("# 旧录音\n\n![[voice.m4a]]"), undefined);
  assert.equal(stripRecordingMarkerBlocks("# 旧录音\n\n正文"), "# 旧录音\n\n正文");
});

test("recording markers parse independently from localized headings", () => {
  const parsed = parseRecordingMarkers([
    "## Important moments",
    "",
    "- 00:02 · Moment 1",
    "",
    markerBlock,
  ].join("\n"));
  assert.ok(parsed);
  assert.equal(parsed.rawBlock, markerBlock);
  assert.deepEqual(parsed.markers.map((marker) => ({
    id: marker.id,
    sequence: marker.sequence,
    offsetMs: marker.offsetMs,
    source: marker.source,
    title: marker.title,
  })), [
    { id: "marker-a", sequence: 1, offsetMs: 2500, source: "app", title: null },
    { id: "marker-b", sequence: 2, offsetMs: 7500, source: "shortcut_future", title: "第二处" },
  ]);
  assert.deepEqual(parsed.diagnostics, []);
});

test("empty marker arrays and malformed or unknown schemas degrade safely", () => {
  const empty = parseRecordingMarkers([
    "knowgrove-markers-v1",
    '{"markers":[],"schema":"knowgrove-markers-v1"}',
  ].join("\n"));
  assert.ok(empty);
  assert.deepEqual(empty.markers, []);

  const malformed = parseRecordingMarkers("knowgrove-markers-v1\n{not-json}");
  assert.ok(malformed);
  assert.deepEqual(malformed.markers, []);
  assert.equal(malformed.diagnostics.length, 1);

  const oldSchema = parseRecordingMarkers([
    "knowgrove-markers-v1",
    '{"markers":[],"schema":"knowgrove-markers-v0"}',
  ].join("\n"));
  assert.ok(oldSchema);
  assert.deepEqual(oldSchema.markers, []);
  assert.equal(oldSchema.diagnostics.length, 1);
});

test("SRT timestamps align markers on the final merged audio timeline", () => {
  const segments = parseTimedTranscriptSrt([
    "1",
    "00:00:00,000 --> 00:00:03,000",
    "第一安全片段。",
    "",
    "2",
    "00:00:03,200 --> 00:00:06,000",
    "通话结束后的第二安全片段。",
    "",
    "3",
    "00:00:08,000 --> 00:00:10,000",
    "稍后的内容。",
  ].join("\n"));
  const parsed = parseRecordingMarkers(markerBlock);
  assert.ok(parsed);
  const aligned = alignRecordingMarkers(parsed.markers, segments);
  assert.equal(aligned[0]?.match, "contains");
  assert.equal(aligned[0]?.segment?.text, "第一安全片段。");
  assert.equal(aligned[1]?.match, "next");
  assert.equal(aligned[1]?.segment?.text, "稍后的内容。");
  assert.deepEqual(aligned.map((marker) => marker.offsetMs), [2500, 7500]);
});

test("markers after the final transcript segment use the last segment without changing time", () => {
  const parsed = parseRecordingMarkers([
    "knowgrove-markers-v1",
    '{"markers":[{"created_at":"2026-08-25T01:02:03Z","id":"late","offset_ms":12000,"sequence":1,"source":"live_activity","title":"尾声"}],"schema":"knowgrove-markers-v1"}',
  ].join("\n"));
  assert.ok(parsed);
  const aligned = alignRecordingMarkers(parsed.markers, [{ startMs: 0, endMs: 5000, text: "最后一段" }]);
  assert.equal(aligned[0]?.match, "last");
  assert.equal(aligned[0]?.offsetMs, 12000);
});

test("rendered markers preserve sequence, raw milliseconds and seek targets", () => {
  const parsed = parseRecordingMarkers(markerBlock);
  assert.ok(parsed);
  const rendered = renderAlignedRecordingMarkers(alignRecordingMarkers(parsed.markers, []), "### Key moments");
  assert.match(rendered, /\[00:02 · 标记 1\]\(#knowgrove-marker-2500\)/);
  assert.match(rendered, /sequence: 1; offset_ms: 2500/);
  assert.match(rendered, /source: shortcut_future/);
  assert.ok(rendered.indexOf("marker-a") < rendered.indexOf("marker-b"));
  assert.equal(recordingMarkerHref(2500), "#knowgrove-marker-2500");
  assert.equal(recordingMarkerOffsetFromHref("#knowgrove-marker-2500"), 2500);
  assert.equal(recordingMarkerOffsetFromHref("#other"), undefined);
});

test("original marker blocks survive cleanup and regenerated note writes byte-for-byte", () => {
  const withSpacing = `# 录音\n\n正文\n\n\n${markerBlock}\n`;
  const normalized = normalizeGeneratedMarkdownPreservingMarkers(withSpacing);
  assert.ok(normalized.includes(markerBlock));
  assert.equal(parseRecordingMarkers(normalized)?.rawBlock, markerBlock);

  const appended = appendPreservedRecordingMarkerBlock("# 录音\n\n转录正文", markerBlock);
  assert.ok(appended.includes(markerBlock));
  assert.equal(parseRecordingMarkers(appended)?.rawBlock, markerBlock);
  assert.equal(appendPreservedRecordingMarkerBlock(appended, markerBlock), appended);
});

test("CRLF marker blocks and surrounding Obsidian comments are preserved", () => {
  const crlf = "%%\r\nknowgrove-markers-v1\r\n{\"markers\":[],\"schema\":\"knowgrove-markers-v1\"}\r\n%%";
  const parsed = parseRecordingMarkers(`## 关键时刻\r\n\r\n${crlf}\r\n`);
  assert.ok(parsed);
  assert.equal(parsed.rawBlock, crlf);
  assert.equal(stripRecordingMarkerBlocks(`before\r\n${crlf}\r\nafter`).replace(/\r/g, ""), "before\n\nafter");
});
