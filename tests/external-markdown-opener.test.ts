import assert from "node:assert/strict";
import test from "node:test";
import {
  MARKDOWN_OPENER_BUNDLE_ID,
  buildExternalMarkdownAppleScript,
  buildExternalMarkdownOpenerConfig,
  buildExternalMarkdownProcessorScript,
  externalMarkdownOpenerStartupAction,
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
    enabled: true,
    deleteSourceAfterImport: true,
  }, "/Applications/Editor & Preview.app");
  assert.match(config, /<key>vaultPath<\/key>/);
  assert.match(config, /Notes &amp; Research/);
  assert.match(config, /阅读列表\/&lt;外部&gt;/);
  assert.match(config, /Editor &amp; Preview\.app/);
  assert.match(config, /<key>enabled<\/key>\s*<true\/>/);
  assert.match(config, /<key>deleteSourceAfterImport<\/key>\s*<true\/>/);
});

test("generated Mac opener verifies imports before optionally moving the source to Trash", () => {
  const appleScript = buildExternalMarkdownAppleScript();
  const processor = buildExternalMarkdownProcessorScript();
  assert.match(appleScript, /on open openedItems/);
  assert.match(appleScript, /quoted form of/);
  assert.match(processor, /\/bin\/cp -p/);
  assert.match(processor, /\/usr\/bin\/cmp -s/);
  assert.match(processor, /\/usr\/bin\/shasum -a 256/);
  assert.match(processor, /external-markdown-source-hash/);
  assert.match(processor, /Print :enabled/);
  assert.match(processor, /Print :deleteSourceAfterImport/);
  assert.match(processor, /NSFileManager\.defaultManager\.trashItemAtURLResultingItemURLError/);
  assert.ok(processor.indexOf("/usr/bin/cmp -s") < processor.indexOf("trashItemAtURLResultingItemURLError"));
  assert.match(processor, /obsidian:\/\/open\?path=/);
  assert.doesNotMatch(processor, /\/bin\/mv|\brm\b/);
  assert.equal(MARKDOWN_OPENER_BUNDLE_ID, "app.knowgrove.markdown-opener");
});

test("external Markdown import follows the inbox until configured", () => {
  const settings = createDefaultSettings().desktopCapture;
  assert.equal(settings.externalMarkdownOpenerEnabled, true);
  assert.equal(settings.externalMarkdownOpenerSetupAttempted, false);
  assert.equal(settings.externalMarkdownOpenerWasDefault, false);
  assert.equal(settings.externalMarkdownDeleteSourceAfterImport, true);
  assert.equal(settings.externalMarkdownFolder, "");
});

test("first enable installs a missing Markdown opener exactly once", () => {
  const missing = { supported: true, installed: false, isDefault: false };
  assert.equal(externalMarkdownOpenerStartupAction({
    enabled: true,
    setupAttempted: false,
    wasDefault: false,
    status: missing,
  }), "install");
  assert.equal(externalMarkdownOpenerStartupAction({
    enabled: true,
    setupAttempted: true,
    wasDefault: false,
    status: missing,
  }), "none");
});

test("startup never reclaims a user-selected default application", () => {
  assert.equal(externalMarkdownOpenerStartupAction({
    enabled: true,
    setupAttempted: true,
    wasDefault: false,
    status: { supported: true, installed: true, isDefault: false },
  }), "none");
  assert.equal(externalMarkdownOpenerStartupAction({
    enabled: true,
    setupAttempted: true,
    wasDefault: true,
    status: { supported: true, installed: true, isDefault: true },
  }), "none");
  assert.equal(externalMarkdownOpenerStartupAction({
    enabled: false,
    setupAttempted: false,
    wasDefault: false,
    status: { supported: true, installed: false, isDefault: false },
  }), "none");
  assert.equal(externalMarkdownOpenerStartupAction({
    enabled: true,
    setupAttempted: false,
    wasDefault: false,
    status: { supported: false, installed: false, isDefault: false },
  }), "none");
});

test("a previously verified association is repaired only once after it is lost", () => {
  assert.equal(externalMarkdownOpenerStartupAction({
    enabled: true,
    setupAttempted: true,
    wasDefault: true,
    status: { supported: true, installed: true, isDefault: false },
  }), "install");
  assert.equal(externalMarkdownOpenerStartupAction({
    enabled: true,
    setupAttempted: true,
    wasDefault: false,
    status: { supported: true, installed: true, isDefault: false },
  }), "none");
});
