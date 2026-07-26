import assert from "node:assert/strict";
import test from "node:test";
import {
  KNOWGROVE_READING_VIEW_TYPE,
  LEGACY_READING_VIEW_TYPE,
  migrateLegacyBrandString,
  migrateLegacyBrandValue,
  migrateLegacyManagedContent,
  migrateLegacyResearchSourceStatePath,
  legacyResearchSourceStatePath,
} from "../src/brand-migration";

test("migrates the legacy reading sidebar view id", () => {
  assert.equal(migrateLegacyBrandString(LEGACY_READING_VIEW_TYPE), KNOWGROVE_READING_VIEW_TYPE);
});

test("migrates legacy plugin settings without changing unrelated values", () => {
  const original = {
    trackedFolder: "Home/📬输入",
    references: {
      ref1: {
        sourcePath: "Home/原文.md",
        targetPath: "_Reading Companion/课题/宏观经济.md",
        comment: "保留 Reading Companionary 这个无关单词",
      },
    },
    propertySystem: {
      excludedFolders: ["_Reading Companion", "Home/🕹️skills"],
      basePath: "_Reading Companion/属性工作台.base",
    },
  };
  const result = migrateLegacyBrandValue(original);
  assert.equal(result.changed, true);
  assert.deepEqual(result.value.propertySystem.excludedFolders, ["_KnowGrove", "Home/🕹️skills"]);
  assert.equal(result.value.propertySystem.basePath, "_KnowGrove/属性工作台.base");
  assert.equal(result.value.references.ref1.targetPath, "_KnowGrove/课题/宏观经济.md");
  assert.equal(result.value.references.ref1.comment, original.references.ref1.comment);
  assert.equal(original.propertySystem.basePath, "_Reading Companion/属性工作台.base");
});

test("upgrades generated markers, code blocks, links, and sidecar names", () => {
  const legacy = [
    "# Reading Companion managed topic Base",
    "<!-- reading-companion:theme-synthesis:start -->",
    "<!-- reading-companion-ref:ref-1:start -->",
    "```reading-companion-research-sources",
    "```",
    "reading_companion_research_topic: true",
    "[[_Reading Companion/主题空间/宏观经济]]",
    "宏观经济.reading-companion-sources.json",
  ].join("\n");
  const result = migrateLegacyManagedContent(legacy);
  assert.equal(result.changed, true);
  assert.match(result.value, /# KnowGrove managed topic Base/);
  assert.match(result.value, /knowgrove:theme-synthesis:start/);
  assert.match(result.value, /knowgrove-ref:ref-1:start/);
  assert.match(result.value, /```knowgrove-research-sources/);
  assert.match(result.value, /knowgrove_research_topic: true/);
  assert.match(result.value, /\[\[_KnowGrove\/主题空间\/宏观经济\]\]/);
  assert.match(result.value, /宏观经济\.knowgrove-sources\.json/);
  assert.doesNotMatch(result.value, /reading-companion/);
});

test("brand migration is idempotent", () => {
  const current = "_KnowGrove/课题/主题.md\n<!-- knowgrove-ref:ref-1:start -->";
  const once = migrateLegacyBrandString(current);
  const twice = migrateLegacyBrandString(once);
  assert.equal(once, current);
  assert.equal(twice, current);
});

test("renames only legacy research source sidecars", () => {
  assert.equal(
    migrateLegacyResearchSourceStatePath("_KnowGrove/课题/主题.reading-companion-sources.json"),
    "_KnowGrove/课题/主题.knowgrove-sources.json",
  );
  assert.equal(
    migrateLegacyResearchSourceStatePath("_KnowGrove/课题/主题.knowgrove-sources.json"),
    "_KnowGrove/课题/主题.knowgrove-sources.json",
  );
  assert.equal(
    legacyResearchSourceStatePath("_KnowGrove/课题/主题.md"),
    "_KnowGrove/课题/主题.reading-companion-sources.json",
  );
});
