import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isKnowGroveUiElement,
  KNOWGROVE_UI_ROOT_SELECTOR,
  knowGroveDisplayName,
  knownEnglishTranslation,
  normalizeKnowGroveLocale,
  translateKnowGroveText,
} from "../src/i18n";

function elementWithClosest(match: string | null): Element {
  return { closest: () => match ? ({ className: match } as unknown as Element) : null } as unknown as Element;
}

test("locale normalization follows Obsidian language variants and falls back to English", () => {
  assert.equal(normalizeKnowGroveLocale("zh"), "zh-CN");
  assert.equal(normalizeKnowGroveLocale("zh-Hant"), "zh-TW");
  assert.equal(normalizeKnowGroveLocale("pt-PT"), "pt-BR");
  assert.equal(normalizeKnowGroveLocale("it"), "en");
});

test("brand name follows Obsidian UI language without changing stable identifiers", () => {
  for (const locale of ["zh-CN", "zh-TW", "zh-HK", "zh_Hans"] as const) {
    assert.equal(knowGroveDisplayName(normalizeKnowGroveLocale(locale)), "言续");
  }
  for (const locale of ["en-US", "ja-JP", "", "invalid"] as const) {
    assert.equal(knowGroveDisplayName(normalizeKnowGroveLocale(locale)), "KnowGrove");
  }
  assert.equal(translateKnowGroveText("言续", "zh-TW"), "言续");
  assert.equal(translateKnowGroveText("言续", "en"), "KnowGrove");
  assert.equal(translateKnowGroveText("连接 KnowGrove 与言序", "zh-CN"), "连接 言续 与言续");
  assert.equal(translateKnowGroveText("连接 言续 与言序", "en"), "连接 KnowGrove 与KnowGrove");
});

test("localized UI uses native labels and English fallback for untranslated details", () => {
  assert.equal(translateKnowGroveText("阅读列表", "ja"), "リーディングリスト");
  assert.equal(translateKnowGroveText("增强功能", "de"), "Erweiterungen");
  assert.equal(
    translateKnowGroveText("默认显示 8 篇，可设置为 3–20 篇。", "fr"),
    "Shows 8 notes by default. Choose between 3 and 20.",
  );
  assert.equal(translateKnowGroveText("14 篇", "es"), "14 notas");
  assert.equal(knownEnglishTranslation("模型选择"), "Model provider");
  assert.equal(translateKnowGroveText("删除选中内容的空行", "en"), "Remove blank lines from selection");
  assert.equal(translateKnowGroveText("删除选中内容的空行", "zh-TW"), "刪除所選內容的空行");
});

test("user content without a catalog entry is never machine-translated", () => {
  assert.equal(translateKnowGroveText("我的金融研究", "en"), "我的金融研究");
});

test("automatic localization recognizes plugin-owned roots and excludes Obsidian content surfaces", () => {
  assert.equal(isKnowGroveUiElement(elementWithClosest("knowgrove-settings")), true);
  assert.equal(isKnowGroveUiElement(elementWithClosest(null)), false);
  assert.match(KNOWGROVE_UI_ROOT_SELECTOR, /\.knowgrove-settings/);
  assert.doesNotMatch(KNOWGROVE_UI_ROOT_SELECTOR, /markdown|workspace|document/);

  const source = readFileSync("src/i18n.ts", "utf8");
  assert.doesNotMatch(source, /localizeKnowGroveElement\(document\.body/);
  assert.match(source, /observer\.observe\(root, \{ subtree: true, childList: true, characterData: true \}\)/);
});

test("every static settings label, description, placeholder, button, and notice has an English baseline", () => {
  const source = readFileSync("src/settings.ts", "utf8");
  const patterns = [
    /\.set(?:Name|Desc|ButtonText|Placeholder|Tooltip)\(\s*"([^"]*[\u4e00-\u9fff][^"]*)"/g,
    /createEl\([^\n]*?text:\s*"([^"]*[\u4e00-\u9fff][^"]*)"/g,
    /new Notice\(\s*"([^"]*[\u4e00-\u9fff][^"]*)"/g,
  ];
  const phrases = new Set<string>();
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) phrases.add(match[1]!);
  }
  const missing = Array.from(phrases).filter((phrase) => !knownEnglishTranslation(phrase));
  assert.deepEqual(missing, []);
});

test("primary workflows use native labels in every supported non-Chinese locale", () => {
  for (const locale of ["ja", "ko", "de", "fr", "es", "pt-BR", "ru"] as const) {
    assert.notEqual(translateKnowGroveText("阅读列表", locale), "阅读列表");
    assert.notEqual(translateKnowGroveText("主题列表", locale), "主题列表");
    assert.notEqual(translateKnowGroveText("知识工作台", locale), "知识工作台");
  }
});
