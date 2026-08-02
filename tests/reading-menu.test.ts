import assert from "node:assert/strict";
import test from "node:test";
import { READING_AI_PARSE_MENU_ITEM } from "../src/reading-menu";

test("reading list more menu exposes a concise AI parse action", () => {
  assert.deepEqual(READING_AI_PARSE_MENU_ITEM, {
    label: "AI 解析",
    icon: "wand-sparkles",
  });
});
