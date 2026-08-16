import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultSettings } from "../src/types";
import {
  calculateHeadingIndentation,
  findActiveHeadingIndex,
  shouldDisplayDocumentAnchors,
  type HeadingAnchorItem,
} from "../src/document-anchor-navigator";

test("document anchor navigator is enabled by default", () => {
  assert.equal(createDefaultSettings().enableDocumentAnchors, true);
});

test("shouldDisplayDocumentAnchors requires at least 2 headings to avoid visual clutter", () => {
  assert.equal(shouldDisplayDocumentAnchors(undefined), false);
  assert.equal(shouldDisplayDocumentAnchors([]), false);
  assert.equal(
    shouldDisplayDocumentAnchors([{ level: 1, heading: "唯一的标题", line: 0 }]),
    false,
  );
  assert.equal(
    shouldDisplayDocumentAnchors([
      { level: 1, heading: "第一章", line: 0 },
      { level: 2, heading: "1.1 节", line: 10 },
    ]),
    true,
  );
});

test("calculateHeadingIndentation computes stepped indent and width based on minLevel", () => {
  // Document starts at H1 (minLevel = 1)
  const h1 = calculateHeadingIndentation(1, 1);
  assert.equal(h1.indentPx, 0);
  assert.equal(h1.widthPx, 12);

  const h2 = calculateHeadingIndentation(2, 1);
  assert.equal(h2.indentPx, 3);
  assert.equal(h2.widthPx, 10);

  const h3 = calculateHeadingIndentation(3, 1);
  assert.equal(h3.indentPx, 6);
  assert.equal(h3.widthPx, 8);

  const h4 = calculateHeadingIndentation(4, 1);
  assert.equal(h4.indentPx, 9);
  assert.equal(h4.widthPx, 6);

  // Document starts at H2 (minLevel = 2, H2 is treated as top level)
  const relH2 = calculateHeadingIndentation(2, 2);
  assert.equal(relH2.indentPx, 0);
  assert.equal(relH2.widthPx, 12);

  const relH3 = calculateHeadingIndentation(3, 2);
  assert.equal(relH3.indentPx, 3);
  assert.equal(relH3.widthPx, 10);
});

test("findActiveHeadingIndex tracks scroll position and highlights the correct section", () => {
  const headings: HeadingAnchorItem[] = [
    { level: 1, heading: "导言", line: 0 },
    { level: 2, heading: "背景", line: 20 },
    { level: 2, heading: "核心设计", line: 50 },
    { level: 3, heading: "细节实现", line: 80 },
    { level: 2, heading: "总结", line: 120 },
  ];

  // At top of document
  assert.equal(findActiveHeadingIndex(headings, 0), 0);
  assert.equal(findActiveHeadingIndex(headings, 10), 0);

  // Scrolled past background heading (line 20)
  assert.equal(findActiveHeadingIndex(headings, 25), 1);
  assert.equal(findActiveHeadingIndex(headings, 45), 1);

  // Scrolled into core design (line 50)
  assert.equal(findActiveHeadingIndex(headings, 55), 2);

  // Scrolled into detail implementation (line 80)
  assert.equal(findActiveHeadingIndex(headings, 90), 3);

  // Scrolled to end of document (line 150)
  assert.equal(findActiveHeadingIndex(headings, 150), 4);
});
