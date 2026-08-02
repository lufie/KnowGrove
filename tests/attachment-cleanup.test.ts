import assert from "node:assert/strict";
import test from "node:test";
import {
  attachmentFolderForNote,
  extractVaultReferenceTargets,
  isAttachmentCleanupExcludedByFolders,
  isAttachmentCleanupExcludedPath,
  isAttachmentReferenceSource,
  isManagedAttachmentPath,
  isPathInsideVaultFolder,
  normalizeAttachmentExtensions,
  parentVaultPath,
  selectPreviouslyReferencedOrphanPaths,
  uniqueAttachmentTargetPath,
} from "../src/attachment-cleanup-core";
import { createDefaultSettings } from "../src/types";

test("attachment cleanup is enabled by default but never implies automatic deletion", () => {
  const settings = createDefaultSettings();
  assert.equal(settings.enableAttachmentCleanup, true);
  assert.equal(settings.lastAttachmentCleanupScanAt, 0);
  assert.deepEqual(settings.attachmentCleanupExcludedFolders, []);
  assert.deepEqual(settings.attachmentCleanupExtraExtensions, []);
  assert.equal(settings.moveAttachmentsWithNote, false);
  assert.equal(settings.autoOrganizeAttachments, false);
  assert.equal(settings.sharedAttachmentHandling, "skip");
});

test("attachment organization follows the Obsidian global attachment location", () => {
  assert.equal(parentVaultPath("Home/Notes/Topic.md"), "Home/Notes");
  assert.equal(attachmentFolderForNote("Home/Notes/Topic.md", "/"), "");
  assert.equal(attachmentFolderForNote("Home/Notes/Topic.md", "./"), "Home/Notes");
  assert.equal(attachmentFolderForNote("Home/Notes/Topic.md", "./assets"), "Home/Notes/assets");
  assert.equal(attachmentFolderForNote("Home/Notes/Topic.md", "Shared/assets"), "Shared/assets");
});

test("attachment organization uses folder boundaries and collision-safe names", () => {
  assert.equal(isPathInsideVaultFolder("Home/Notes/assets/a.png", "Home/Notes"), true);
  assert.equal(isPathInsideVaultFolder("Home/Notebook/a.png", "Home/Note"), false);
  assert.equal(isPathInsideVaultFolder("a.png", ""), true);
  assert.equal(isPathInsideVaultFolder("assets/a.png", ""), false);
  assert.equal(uniqueAttachmentTargetPath("Home/Notes/assets", "image.png", []), "Home/Notes/assets/image.png");
  assert.equal(
    uniqueAttachmentTargetPath("Home/Notes/assets", "image.png", ["home/notes/assets/IMAGE.png", "Home/Notes/assets/image 2.png"]),
    "Home/Notes/assets/image 3.png",
  );
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

test("attachment cleanup accepts safe custom types without treating note sources as attachments", () => {
  assert.deepEqual(
    normalizeAttachmentExtensions([" ZIP, psd ", ".excalidraw.md", ".md", "bad/path"]),
    [".psd", ".zip"],
  );
  assert.equal(isManagedAttachmentPath("archive/source.ZIP", ["zip"]), true);
  assert.equal(isManagedAttachmentPath("design/mockup.psd", [".psd"]), true);
  assert.equal(isManagedAttachmentPath("drawings/idea.excalidraw.md", normalizeAttachmentExtensions([".excalidraw.md"])), false);
  assert.equal(isManagedAttachmentPath("notes/ordinary.md", [".md"]), false);
  assert.equal(isManagedAttachmentPath("boards/roadmap.canvas", ["canvas"]), false);
});

test("attachment cleanup supports dedicated vault-relative folder exclusions", () => {
  const folders = ["Archive/Keep", "/Shared/Assets/"];
  assert.equal(isAttachmentCleanupExcludedByFolders("Archive/Keep/source.pdf", folders), true);
  assert.equal(isAttachmentCleanupExcludedByFolders("Shared/Assets/logo.png", folders), true);
  assert.equal(isAttachmentCleanupExcludedByFolders("Archive/Keepers/source.pdf", folders), false);
  assert.equal(isAttachmentCleanupExcludedByFolders("Home/assets/logo.png", folders), false);
});

test("extracts Obsidian, Markdown and HTML attachment targets without remote links", () => {
  const content = [
    "![[assets/photo.png|封面]]",
    "[[docs/report.pdf#page=2]]",
    "![录音](<audio/interview 01.m4a>)",
    '<audio src="media/talk.mp3"></audio>',
    '<video poster="assets/poster.jpg"><source srcset="media/talk-small.mp4 1x, media/talk-large.mp4 2x"></video>',
    "[资料]: docs/reference.pdf",
    "![远程](https://example.com/remote.png)",
    "[邮件](mailto:test@example.com)",
  ].join("\n");
  assert.deepEqual(extractVaultReferenceTargets(content), [
    "assets/photo.png",
    "docs/report.pdf",
    "audio/interview 01.m4a",
    "media/talk.mp3",
    "assets/poster.jpg",
    "media/talk-small.mp4",
    "media/talk-large.mp4",
    "docs/reference.pdf",
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
