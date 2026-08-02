import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  knownEnglishTranslation,
  normalizeKnowGroveLocale,
  translateKnowGroveText,
} from "../src/i18n";

test("locale normalization follows Obsidian language variants and falls back to English", () => {
  assert.equal(normalizeKnowGroveLocale("zh"), "zh-CN");
  assert.equal(normalizeKnowGroveLocale("zh-Hant"), "zh-TW");
  assert.equal(normalizeKnowGroveLocale("pt-PT"), "pt-BR");
  assert.equal(normalizeKnowGroveLocale("it"), "en");
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
});

test("user content without a catalog entry is never machine-translated", () => {
  assert.equal(translateKnowGroveText("我的金融研究", "en"), "我的金融研究");
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
