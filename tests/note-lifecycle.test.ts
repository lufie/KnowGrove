import test from "node:test";
import assert from "node:assert/strict";
import {
  isNoteLifecycleStatus,
  normalizeNoteLifecycleStatus,
  NOTE_LIFECYCLE_STATUSES,
} from "../src/note-lifecycle";

test("note lifecycle exposes only four user-facing statuses", () => {
  assert.deepEqual(NOTE_LIFECYCLE_STATUSES, ["待处理", "进行中", "已完成", "已归档"]);
  assert.equal(isNoteLifecycleStatus("待处理"), true);
  assert.equal(isNoteLifecycleStatus("待整理"), false);
});

test("legacy Chinese and English statuses migrate deterministically", () => {
  const cases: Array<[string, string]> = [
    ["待整理", "待处理"], ["种子", "待处理"], ["处理失败", "待处理"],
    ["生长中", "进行中"], ["草稿", "进行中"], ["已暂停", "进行中"],
    ["已沉淀", "已完成"], ["已发布", "已完成"], ["常青", "已完成"],
    ["跳过", "已归档"], ["已取消", "已归档"],
    ["pending", "待处理"], ["PROCESSING", "待处理"],
    ["archived", "已归档"], ["CANCELLED", "已归档"], ["canceled", "已归档"],
  ];
  for (const [legacy, expected] of cases) assert.equal(normalizeNoteLifecycleStatus(legacy), expected, legacy);
  assert.equal(normalizeNoteLifecycleStatus("未知状态"), undefined);
  assert.equal(normalizeNoteLifecycleStatus(""), undefined);
});
