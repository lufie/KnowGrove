import assert from "node:assert/strict";
import test from "node:test";
import {
  extractVaultReferenceTargets,
  isAttachmentCleanupExcludedPath,
  isAttachmentReferenceSource,
  isManagedAttachmentPath,
  selectPreviouslyReferencedOrphanPaths,
} from "../src/attachment-cleanup-core";
import { createDefaultSettings } from "../src/types";

test("attachment cleanup is enabled by default but never implies automatic deletion", () => {
  const settings = createDefaultSettings();
  assert.equal(settings.enableAttachmentCleanup, true);
  assert.equal(settings.lastAttachmentCleanupScanAt, 0);
});

test("attachment cleanup only manages a conservative attachment allowlist", () => {
  for (const path of ["assets/photo.PNG", "audio/interview.m4a", "docs/report.pdf", "video/demo.mp4", "slides/talk.pptx"]) {
    assert.equal(isManagedAttachmentPath(path), true, path);
  }
  for (const path of ["note.md", "board.canvas", "database.base", "runtime/manifest.json", "archive.zip", "script.ts"]) {
    assert.equal(isManagedAttachmentPath(path), false, path);
  }
  assert.equal(isAttachmentReferenceSource("note.md"), true);
  assert.equal(isAttachmentReferenceSource("board.canvas"), true);
  assert.equal(isAttachmentReferenceSource("database.base"), true);
  assert.equal(isAttachmentCleanupExcludedPath("Home/🕹️skills/demo/assets/icon.png"), true);
  assert.equal(isAttachmentCleanupExcludedPath("project/node_modules/package/logo.svg"), true);
  assert.equal(isAttachmentCleanupExcludedPath("Home/资料/assets/icon.png"), false);
});

test("extracts Obsidian, Markdown and HTML attachment targets without remote links", () => {
  const content = [
    "![[assets/photo.png|封面]]",
    "[[docs/report.pdf#page=2]]",
    "![录音](<audio/interview 01.m4a>)",
    '<audio src="media/talk.mp3"></audio>',
    "![远程](https://example.com/remote.png)",
    "[邮件](mailto:test@example.com)",
  ].join("\n");
  assert.deepEqual(extractVaultReferenceTargets(content), [
    "assets/photo.png",
    "docs/report.pdf",
    "audio/interview 01.m4a",
    "media/talk.mp3",
  ]);
});

test("extracts file nodes and embedded text links from Canvas", () => {
  const canvas = JSON.stringify({
    nodes: [
      { id: "1", type: "file", file: "assets/diagram.svg" },
      { id: "2", type: "text", text: "资料：![[docs/source.pdf]]" },
    ],
    edges: [],
  });
  assert.deepEqual(extractVaultReferenceTargets(canvas, "canvas"), [
    "assets/diagram.svg",
    "docs/source.pdf",
  ]);
});

test("orphan scan only reports attachments that were referenced before", () => {
  const now = 10_000_000;
  const attachments = ["assets/used.png", "assets/lost.pdf", "assets/never-used.png", "assets/new.m4a"];
  const referenced = new Set(["assets/used.png"]);
  const previouslyReferenced = new Set(["assets/used.png", "assets/lost.pdf", "assets/new.m4a"]);
  const createdAt = new Map([
    ["assets/used.png", 0],
    ["assets/lost.pdf", 0],
    ["assets/never-used.png", 0],
    ["assets/new.m4a", now - 30_000],
  ]);
  assert.deepEqual(
    selectPreviouslyReferencedOrphanPaths(attachments, referenced, previouslyReferenced, createdAt, now, 60_000),
    ["assets/lost.pdf"],
  );
  assert.deepEqual(
    selectPreviouslyReferencedOrphanPaths(attachments, referenced, previouslyReferenced, createdAt, now, 0),
    ["assets/lost.pdf", "assets/new.m4a"],
  );
});
