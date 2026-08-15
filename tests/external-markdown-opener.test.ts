import assert from "node:assert/strict";
import test from "node:test";
import {
  MARKDOWN_OPENER_BUNDLE_ID,
  buildExternalMarkdownAppleScript,
  buildExternalMarkdownOpenerConfig,
  buildExternalMarkdownProcessorScript,
  normalizeExternalMarkdownFolder,
} from "../src/external-markdown-opener";
import { createDefaultSettings } from "../src/types";

test("external Markdown import folder stays vault-relative", () => {
  assert.equal(normalizeExternalMarkdownFolder(" /阅读列表/外部文档/ "), "阅读列表/外部文档");
  assert.equal(normalizeExternalMarkdownFolder("Reading\\Imported"), "Reading/Imported");
  assert.throws(() => normalizeExternalMarkdownFolder("阅读列表/../其他"), /不能包含/);
});

test("external Markdown opener configuration preserves paths as escaped plist values", () => {
  const config = buildExternalMarkdownOpenerConfig({
    vaultPath: "/tmp/Notes & Research",
    destinationFolder: "阅读列表/<外部>",
  }, "/Applications/Editor & Preview.app");
  assert.match(config, /<key>vaultPath<\/key>/);
  assert.match(config, /Notes &amp; Research/);
  assert.match(config, /阅读列表\/&lt;外部&gt;/);
  assert.match(config, /Editor &amp; Preview\.app/);
});

test("generated Mac opener copies external Markdown without overwriting its source", () => {
  const appleScript = buildExternalMarkdownAppleScript();
  const processor = buildExternalMarkdownProcessorScript();
  assert.match(appleScript, /on open openedItems/);
  assert.match(appleScript, /quoted form of/);
  assert.match(processor, /\/bin\/cp -p/);
  assert.match(processor, /\/usr\/bin\/cmp -s/);
  assert.match(processor, /\/usr\/bin\/shasum -a 256/);
  assert.match(processor, /external-markdown-source-hash/);
  assert.match(processor, /obsidian:\/\/open\?path=/);
  assert.doesNotMatch(processor, /\/bin\/mv|\brm\b/);
  assert.equal(MARKDOWN_OPENER_BUNDLE_ID, "app.knowgrove.markdown-opener");
});

test("external Markdown import follows the inbox until configured", () => {
  assert.equal(createDefaultSettings().desktopCapture.externalMarkdownFolder, "");
});
