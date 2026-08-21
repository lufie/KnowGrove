import assert from "node:assert/strict";
import test from "node:test";
import { isRecentDocumentPath, selectRecentDocumentPaths } from "../src/recent-files";

test("recent virtual folder keeps documents and preserves open order", () => {
  const history = [
    "Inbox/current.md",
    "Inbox/audio.m4a",
    "_KnowGrove/workbench.base",
    "Inbox/current.md",
    "Board/research.canvas",
    "Inbox/deleted.md",
  ];
  const existing = new Set([
    "Inbox/current.md",
    "Inbox/audio.m4a",
    "_KnowGrove/workbench.base",
    "Board/research.canvas",
  ]);

  assert.deepEqual(selectRecentDocumentPaths(history, existing), [
    "Inbox/current.md",
    "_KnowGrove/workbench.base",
    "Board/research.canvas",
  ]);
});

test("recent virtual folder respects limit and supported extensions", () => {
  assert.equal(isRecentDocumentPath("Inbox/note.MD"), true);
  assert.equal(isRecentDocumentPath("Board/work.base"), true);
  assert.equal(isRecentDocumentPath("Board/map.canvas"), true);
  assert.equal(isRecentDocumentPath("Assets/audio.wav"), false);
  assert.deepEqual(
    selectRecentDocumentPaths(["a.md", "b.md", "c.md"], new Set(["a.md", "b.md", "c.md"]), 2),
    ["a.md", "b.md"],
  );
});

test("recent open history can validate only the requested paths", () => {
  const checked: string[] = [];
  const existing = {
    has(path: string): boolean {
      checked.push(path);
      return path !== "deleted.md";
    },
  };
  assert.deepEqual(
    selectRecentDocumentPaths(["one.md", "deleted.md", "two.md"], existing, 2),
    ["one.md", "two.md"],
  );
  assert.deepEqual(checked, ["one.md", "deleted.md", "two.md"]);
});
