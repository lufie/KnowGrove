import { Prec, StateEffect, type EditorSelection, type Range } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import type KnowGrovePlugin from "./main";

export interface WordLikeEdit {
  from: number;
  to: number;
  insert: string;
  cursor: number;
}

interface HiddenMarkerRange {
  from: number;
  to: number;
  side: "open" | "close";
}

const refreshWordLikeEditingEffect = StateEffect.define<void>();

const HEADING_PREFIX = /^(#{1,6})[ \t]+/;
const QUOTE_PREFIX = /^([ \t]*>)[ \t]+/;
const LIST_PREFIX = /^([ \t]*)([-+*]|(\d+)([.)]))([ \t]+)(.*)$/;
const MEDIA_BLOCK = /^\s*(?:!\[\[[^\n]+?\]\]|!\[[^\]]*\]\([^\n)]+\))\s*(?:\^[A-Za-z0-9-]+)?\s*$/;

interface ListLineInfo {
  indent: string;
  marker: string;
  ordered: boolean;
  number: number | null;
  delimiter: "." | ")" | null;
  spacing: string;
  content: string;
  prefix: string;
}

export interface FencedCodeBlockRange {
  from: number;
  to: number;
}

function isLivePreview(view: EditorView): boolean {
  const sourceView = view.dom.closest(".markdown-source-view");
  return Boolean(sourceView?.classList.contains("is-live-preview"));
}

function mergedMarkerRanges(ranges: HiddenMarkerRange[]): HiddenMarkerRange[] {
  const sorted = [...ranges]
    .filter((range) => range.from < range.to)
    .sort((left, right) => left.from - right.from || left.to - right.to);
  const merged: HiddenMarkerRange[] = [];
  for (const range of sorted) {
    const previous = merged.at(-1);
    if (!previous || range.from > previous.to) {
      merged.push({ ...range });
      continue;
    }
    previous.to = Math.max(previous.to, range.to);
  }
  return merged;
}

function hiddenFormattingMarkers(view: EditorView): HiddenMarkerRange[] {
  if (!isLivePreview(view)) return [];
  const ranges: HiddenMarkerRange[] = [];
  syntaxTree(view.state).iterate({
    enter(node) {
      const line = view.state.doc.lineAt(node.from);
      if (isStandaloneMediaBlock(line.text)) return;
      const name = node.type.name;
      let markerLength = 0;
      if (name.includes("formatting-strong")) markerLength = 2;
      else if (name.includes("formatting-em")) markerLength = 1;
      else if (name.includes("formatting-highlight")) markerLength = 2;
      else if (name.includes("formatting-strikethrough")) markerLength = 2;
      else if (name.includes("formatting-code") && name.includes("inline-code")) {
        markerLength = view.state.doc.sliceString(node.from, node.to).match(/^`+/)?.[0].length ?? 1;
      } else if (name === "Escape" || name === "escape" || name.includes("formatting-escape")) {
        markerLength = 1;
      } else if (name.startsWith("formatting-link_formatting-link")) {
        ranges.push({
          from: node.from,
          to: node.to,
          side: name.includes("end") ? "close" : "open",
        });
        return;
      } else if (
        name.includes("formatting-header")
        || name.includes("formatting-heading")
        || name.includes("HeadingMark")
        || name.includes("HeaderMark")
      ) {
        const marker = view.state.doc.sliceString(node.from, node.to).match(/^(#+)[ \t]?$/);
        if (marker) {
          const hashes = marker[1] ?? "";
          const followingSpace = view.state.doc.sliceString(node.to, node.to + 1) === " ";
          const length = marker[0].endsWith(" ") || followingSpace
            ? hashes.length + 1
            : hashes.length;
          ranges.push({ from: node.from, to: Math.min(node.from + length, view.state.doc.length), side: "open" });
        }
        return;
      }

      if (!markerLength) return;
      ranges.push({ from: node.from, to: Math.min(node.from + markerLength, node.to), side: "open" });
      const isEscape = name === "Escape" || name === "escape" || name.includes("formatting-escape");
      if (!isEscape) {
        ranges.push({ from: Math.max(node.from, node.to - markerLength), to: node.to, side: "close" });
      }
    },
  });
  return mergedMarkerRanges(ranges);
}

function markerDecorations(view: EditorView): DecorationSet {
  const ranges: Array<Range<Decoration>> = hiddenFormattingMarkers(view).map((range) =>
    Decoration.replace({
      attributes: { "data-knowgrove-marker-side": range.side },
    }).range(range.from, range.to));
  return Decoration.set(ranges, true);
}

function snapCursorOutsideMarkers(view: EditorView, position: number): number {
  for (const range of hiddenFormattingMarkers(view)) {
    if (position <= range.from || position >= range.to) continue;
    return position - range.from <= range.to - position ? range.from : range.to;
  }
  return position;
}

function parseListLine(text: string): ListLineInfo | null {
  const match = text.match(LIST_PREFIX);
  if (!match) return null;
  const indent = match[1] ?? "";
  const marker = match[2] ?? "-";
  const ordered = Boolean(match[3]);
  const delimiter = ordered ? ((match[4] ?? ".") as "." | ")") : null;
  const spacing = match[5] ?? " ";
  const itemContent = match[6] ?? "";
  if (/^\[[ xX]\](?:[ \t]|$)/.test(itemContent)) return null;
  return {
    indent,
    marker,
    ordered,
    number: ordered ? Number.parseInt(match[3] ?? "1", 10) : null,
    delimiter,
    spacing,
    content: itemContent,
    prefix: `${indent}${marker}${spacing}`,
  };
}

function indentColumns(indent: string, tabSize: number): number {
  let columns = 0;
  for (const character of indent) {
    columns += character === "\t" ? tabSize - (columns % tabSize) : 1;
  }
  return columns;
}

function makeIndent(columns: number, preferTabs: boolean, tabSize: number): string {
  const safeColumns = Math.max(0, columns);
  if (!preferTabs) return " ".repeat(safeColumns);
  return "\t".repeat(Math.floor(safeColumns / tabSize)) + " ".repeat(safeColumns % tabSize);
}

function detectIndentUnit(content: string, tabSize: number): number {
  const levels = new Set<number>();
  for (const line of content.split("\n")) {
    const item = parseListLine(line);
    if (!item) continue;
    const columns = indentColumns(item.indent, tabSize);
    if (columns > 0) levels.add(columns);
  }
  const sorted = [...levels].sort((left, right) => left - right);
  let smallest = sorted[0] ?? tabSize;
  for (let index = 1; index < sorted.length; index += 1) {
    smallest = Math.min(smallest, sorted[index]! - sorted[index - 1]!);
  }
  return Math.max(1, smallest || tabSize);
}

function listBlockBounds(
  content: string,
  line: ReturnType<typeof lineBounds>,
): { from: number; to: number } {
  let from = line.from;
  let to = line.to;
  let cursor = line.from;
  while (cursor > 0) {
    const previous = previousLine(content, cursor);
    if (!previous || !parseListLine(previous.text)) break;
    from = previous.from;
    cursor = previous.from;
  }
  cursor = line.to;
  while (cursor < content.length) {
    const following = nextLine(content, cursor);
    if (!following || !parseListLine(following.text)) break;
    to = following.to;
    cursor = following.to;
  }
  return { from, to };
}

function renumberOrderedLines(lines: string[], tabSize: number): string[] {
  const counters = new Map<number, number>();
  return lines.map((text) => {
    const item = parseListLine(text);
    if (!item) return text;
    const columns = indentColumns(item.indent, tabSize);
    for (const level of [...counters.keys()]) {
      if (level > columns || (!item.ordered && level === columns)) counters.delete(level);
    }
    if (!item.ordered) return text;
    const number = counters.has(columns)
      ? (counters.get(columns) ?? 0) + 1
      : (item.number ?? 1);
    counters.set(columns, number);
    return `${item.indent}${number}${item.delimiter ?? "."}${item.spacing}${item.content}`;
  });
}

function listMarkerAtLevel(
  content: string,
  before: number,
  targetColumns: number,
  item: ListLineInfo,
  tabSize: number,
): string {
  if (!item.ordered) return item.marker;
  let cursor = before;
  while (cursor > 0) {
    const previous = previousLine(content, cursor);
    if (!previous || !previous.text.trim()) break;
    cursor = previous.from;
    const candidate = parseListLine(previous.text);
    if (!candidate) continue;
    const columns = indentColumns(candidate.indent, tabSize);
    if (columns < targetColumns) break;
    if (columns === targetColumns && candidate.ordered) {
      return `${(candidate.number ?? 0) + 1}${item.delimiter ?? "."}`;
    }
  }
  return `1${item.delimiter ?? "."}`;
}

function previousIndentLevel(content: string, before: number, currentColumns: number, tabSize: number): number | null {
  let cursor = before;
  while (cursor > 0) {
    const previous = previousLine(content, cursor);
    if (!previous || !previous.text.trim()) break;
    cursor = previous.from;
    const item = parseListLine(previous.text);
    if (!item) continue;
    const columns = indentColumns(item.indent, tabSize);
    if (columns < currentColumns) return columns;
  }
  return null;
}

function hasPreviousListAtLevel(content: string, before: number, columns: number, tabSize: number): boolean {
  let cursor = before;
  while (cursor > 0) {
    const previous = previousLine(content, cursor);
    if (!previous || !previous.text.trim()) return false;
    cursor = previous.from;
    const item = parseListLine(previous.text);
    if (!item) continue;
    const previousColumns = indentColumns(item.indent, tabSize);
    if (previousColumns < columns) return false;
    if (previousColumns === columns) return true;
  }
  return false;
}

function atomicListMarkerRanges(view: EditorView): Array<{ from: number; to: number }> {
  if (!isLivePreview(view)) return [];
  const ranges: Array<{ from: number; to: number }> = [];
  for (let number = 1; number <= view.state.doc.lines; number += 1) {
    const line = view.state.doc.line(number);
    const item = parseListLine(line.text);
    if (!item) continue;
    const markerFrom = line.from + item.indent.length;
    ranges.push({ from: markerFrom, to: line.from + item.prefix.length });
  }
  return ranges;
}

function snapCursorOutsideListMarkers(view: EditorView, position: number): number {
  for (const range of atomicListMarkerRanges(view)) {
    if (position > range.from && position < range.to) return range.to;
  }
  return position;
}

function lineBounds(content: string, position: number): { from: number; to: number; text: string } {
  const safePosition = Math.max(0, Math.min(position, content.length));
  const from = content.lastIndexOf("\n", Math.max(0, safePosition - 1)) + 1;
  const newline = content.indexOf("\n", safePosition);
  const to = newline === -1 ? content.length : newline;
  return { from, to, text: content.slice(from, to) };
}

function previousLine(content: string, from: number): { from: number; to: number; text: string } | null {
  if (from <= 0) return null;
  const to = from - 1;
  const previousNewline = content.lastIndexOf("\n", Math.max(0, to - 1));
  const lineFrom = previousNewline + 1;
  return { from: lineFrom, to, text: content.slice(lineFrom, to) };
}

function nextLine(content: string, to: number): { from: number; to: number; text: string } | null {
  if (to >= content.length) return null;
  const from = to + 1;
  const newline = content.indexOf("\n", from);
  const lineTo = newline === -1 ? content.length : newline;
  return { from, to: lineTo, text: content.slice(from, lineTo) };
}

export function findFencedCodeBlockRanges(content: string): FencedCodeBlockRange[] {
  const ranges: FencedCodeBlockRange[] = [];
  let line = lineBounds(content, 0);
  while (true) {
    const opening = line.text.match(/^[ \t]*(`{3,}|~{3,})[^\n]*$/);
    if (opening) {
      const fence = opening[1] ?? "```";
      const fenceCharacter = fence[0] ?? "`";
      let cursor = line.to;
      while (cursor < content.length) {
        const candidate = nextLine(content, cursor);
        if (!candidate) break;
        const closing = candidate.text.match(/^[ \t]*(`{3,}|~{3,})[ \t]*$/);
        if (closing) {
          const closingFence = closing[1] ?? "";
          if (closingFence[0] === fenceCharacter && closingFence.length >= fence.length) {
            ranges.push({ from: line.from, to: candidate.to });
            line = candidate;
            break;
          }
        }
        cursor = candidate.to;
      }
    }
    if (line.to >= content.length) break;
    const following = nextLine(content, line.to);
    if (!following) break;
    line = following;
  }
  return ranges;
}

function fencedCodeBlockBeforeBlankLine(content: string, blankLineFrom: number): FencedCodeBlockRange | null {
  return findFencedCodeBlockRanges(content)
    .find((range) => range.to === blankLineFrom - 1) ?? null;
}

function fencedCodeBlockAfterBlankLine(content: string, blankLineTo: number): FencedCodeBlockRange | null {
  return findFencedCodeBlockRanges(content)
    .find((range) => range.from === blankLineTo + 1) ?? null;
}

export function isStandaloneMediaBlock(text: string): boolean {
  return MEDIA_BLOCK.test(text);
}

export function wordLikeIndentEdit(
  content: string,
  position: number,
  direction: "indent" | "outdent",
  tabSize = 4,
): WordLikeEdit | null {
  const line = lineBounds(content, position);
  const item = parseListLine(line.text);
  if (!item) return null;
  const currentColumns = indentColumns(item.indent, tabSize);
  const block = listBlockBounds(content, line);
  const blockText = content.slice(block.from, block.to);
  const blockLines = blockText.split("\n");
  const currentIndex = content.slice(block.from, line.from).split("\n").length - 1;
  const indentUnit = detectIndentUnit(blockText, tabSize);
  let targetColumns: number;
  if (direction === "indent") {
    if (!hasPreviousListAtLevel(content, line.from, currentColumns, tabSize)) return null;
    targetColumns = currentColumns + indentUnit;
  } else {
    if (currentColumns === 0) return null;
    targetColumns = previousIndentLevel(content, line.from, currentColumns, tabSize)
      ?? Math.max(0, currentColumns - indentUnit);
  }

  const delta = targetColumns - currentColumns;
  const preferTabs = item.indent.includes("\t");
  let subtreeLastIndex = currentIndex;
  for (let index = currentIndex + 1; index < blockLines.length; index += 1) {
    const nested = parseListLine(blockLines[index] ?? "");
    if (!nested || indentColumns(nested.indent, tabSize) <= currentColumns) break;
    subtreeLastIndex = index;
  }
  const adjustedLines = blockLines.map((text, index) => {
    if (index < currentIndex || index > subtreeLastIndex) return text;
    const nested = parseListLine(text);
    if (!nested) return text;
    const nestedColumns = indentColumns(nested.indent, tabSize);
    const nextIndent = makeIndent(nestedColumns + delta, preferTabs || nested.indent.includes("\t"), tabSize);
    const marker = index === currentIndex
      ? listMarkerAtLevel(content, line.from, targetColumns, nested, tabSize)
      : nested.marker;
    return `${nextIndent}${marker}${nested.spacing}${nested.content}`;
  });
  const renumberedLines = renumberOrderedLines(adjustedLines, tabSize);
  const adjusted = renumberedLines.join("\n");
  const contentOffset = Math.max(0, position - line.from - item.prefix.length);
  const currentAdjusted = parseListLine(renumberedLines[currentIndex] ?? "");
  const nextPrefixLength = currentAdjusted?.prefix.length ?? item.prefix.length;
  const beforeCurrent = renumberedLines.slice(0, currentIndex)
    .reduce((length, text) => length + text.length + 1, 0);
  return {
    from: block.from,
    to: block.to,
    insert: adjusted,
    cursor: block.from + beforeCurrent + nextPrefixLength + contentOffset,
  };
}

export function wordLikeBackspaceEdit(content: string, position: number, tabSize = 4): WordLikeEdit | null {
  const line = lineBounds(content, position);
  const offset = position - line.from;

  if (!line.text.trim()) {
    const codeBlock = fencedCodeBlockBeforeBlankLine(content, line.from);
    if (codeBlock) {
      const blankBefore = previousLine(content, codeBlock.from);
      const from = blankBefore && !blankBefore.text.trim() ? blankBefore.from : codeBlock.from;
      return { from, to: line.from, insert: "", cursor: from };
    }
    const previous = previousLine(content, line.from);
    if (previous && isStandaloneMediaBlock(previous.text)) {
      return { from: previous.from, to: line.from, insert: "", cursor: previous.from };
    }
  }

  if (isStandaloneMediaBlock(line.text)) {
    return { from: line.from, to: line.to, insert: "", cursor: line.from };
  }

  const list = parseListLine(line.text);
  if (list && offset === list.prefix.length) {
    if (indentColumns(list.indent, tabSize) > 0) {
      return wordLikeIndentEdit(content, position, "outdent", tabSize);
    }
    return { from: line.from, to: line.from + list.prefix.length, insert: "", cursor: line.from };
  }

  for (const prefix of [HEADING_PREFIX, QUOTE_PREFIX]) {
    const match = line.text.match(prefix);
    if (!match || offset !== match[0].length) continue;
    return { from: line.from, to: line.from + match[0].length, insert: "", cursor: line.from };
  }
  return null;
}

export function wordLikeDeleteEdit(content: string, position: number, tabSize = 4): WordLikeEdit | null {
  const line = lineBounds(content, position);
  if (isStandaloneMediaBlock(line.text)) {
    return { from: line.from, to: line.to, insert: "", cursor: line.from };
  }
  if (!line.text.trim()) {
    const codeBlock = fencedCodeBlockAfterBlankLine(content, line.to);
    if (codeBlock) {
      const blankAfter = nextLine(content, codeBlock.to);
      const to = blankAfter && !blankAfter.text.trim()
        ? (blankAfter.to < content.length ? blankAfter.to + 1 : blankAfter.to)
        : (codeBlock.to < content.length ? codeBlock.to + 1 : codeBlock.to);
      return { from: codeBlock.from, to, insert: "", cursor: position };
    }
    const next = nextLine(content, line.to);
    if (next && isStandaloneMediaBlock(next.text)) {
      const to = next.to < content.length ? next.to + 1 : next.to;
      return { from: next.from, to, insert: "", cursor: position };
    }
  }
  const currentItem = parseListLine(line.text);
  const following = nextLine(content, line.to);
  const followingItem = following ? parseListLine(following.text) : null;
  if (position === line.to && currentItem && following && followingItem) {
    const currentColumns = indentColumns(currentItem.indent, tabSize);
    const nextColumns = indentColumns(followingItem.indent, tabSize);
    if (currentColumns === nextColumns && currentItem.ordered === followingItem.ordered) {
      const separator = currentItem.content && followingItem.content ? " " : "";
      const block = listBlockBounds(content, line);
      const lines = content.slice(block.from, block.to).split("\n");
      const currentIndex = content.slice(block.from, line.from).split("\n").length - 1;
      lines[currentIndex] = `${currentItem.prefix}${currentItem.content}${separator}${followingItem.content}`;
      lines.splice(currentIndex + 1, 1);
      const renumbered = renumberOrderedLines(lines, tabSize);
      const beforeCurrent = renumbered.slice(0, currentIndex)
        .reduce((length, text) => length + text.length + 1, 0);
      return {
        from: block.from,
        to: block.to,
        insert: renumbered.join("\n"),
        cursor: block.from + beforeCurrent + currentItem.prefix.length + currentItem.content.length + separator.length,
      };
    }
  }
  return null;
}

export function wordLikeEnterEdit(content: string, position: number, tabSize = 4): WordLikeEdit | null {
  const line = lineBounds(content, position);
  const offset = position - line.from;
  const heading = line.text.match(HEADING_PREFIX);
  if (heading) {
    const headingText = line.text.slice(heading[0].length);
    if (!headingText.trim()) {
      return { from: line.from, to: line.from + heading[0].length, insert: "", cursor: line.from };
    }
    if (offset === line.text.length) {
      return { from: position, to: position, insert: "\n", cursor: position + 1 };
    }
  }

  const quote = line.text.match(QUOTE_PREFIX);
  if (quote && !line.text.slice(quote[0].length).trim()) {
    return { from: line.from, to: line.from + quote[0].length, insert: "", cursor: line.from };
  }

  const item = parseListLine(line.text);
  if (!item || offset < item.prefix.length) return null;
  if (!item.content.trim()) {
    if (indentColumns(item.indent, tabSize) > 0) {
      return wordLikeIndentEdit(content, position, "outdent", tabSize);
    }
    return { from: line.from, to: line.from + item.prefix.length, insert: "", cursor: line.from };
  }

  const before = line.text.slice(item.prefix.length, offset);
  const after = line.text.slice(offset);
  const nextNumber = (item.number ?? 0) + 1;
  const nextMarker = item.ordered ? `${nextNumber}${item.delimiter ?? "."}` : item.marker;
  const newPrefix = `${item.indent}${nextMarker}${item.spacing}`;
  const replacementLines = [`${item.prefix}${before}`, `${newPrefix}${after}`];
  let end = line.to;
  let cursor = line.to;
  let orderedNumber = nextNumber;
  const currentColumns = indentColumns(item.indent, tabSize);
  while (cursor < content.length) {
    const following = nextLine(content, cursor);
    if (!following || !following.text.trim()) break;
    const followingItem = parseListLine(following.text);
    if (!followingItem) break;
    const followingColumns = indentColumns(followingItem.indent, tabSize);
    if (followingColumns < currentColumns) break;
    let followingText = following.text;
    if (item.ordered && followingItem.ordered && followingColumns === currentColumns) {
      orderedNumber += 1;
      followingText = `${followingItem.indent}${orderedNumber}${followingItem.delimiter ?? "."}${followingItem.spacing}${followingItem.content}`;
    }
    replacementLines.push(followingText);
    end = following.to;
    cursor = following.to;
  }
  return {
    from: line.from,
    to: end,
    insert: replacementLines.join("\n"),
    cursor: line.from + item.prefix.length + before.length + 1 + newPrefix.length,
  };
}

function dispatchEdit(view: EditorView, edit: WordLikeEdit, userEvent: string): void {
  view.dispatch({
    changes: { from: edit.from, to: edit.to, insert: edit.insert },
    selection: { anchor: edit.cursor },
    scrollIntoView: true,
    userEvent,
  });
}

function selectedMediaLine(view: EditorView, event: MouseEvent): boolean {
  const target = event.target instanceof Element ? event.target : null;
  if (!target?.closest(".cm-line")) return false;
  if (target.closest(".embed-actions, .image-resize-corner, a, button, audio, video, input, select, textarea")) {
    return false;
  }
  const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
  if (position === null) return false;
  const line = view.state.doc.lineAt(position);
  if (!isStandaloneMediaBlock(line.text)) return false;
  view.dispatch({
    selection: { anchor: line.from, head: line.to },
    scrollIntoView: false,
    userEvent: "select.pointer",
  });
  return true;
}

function selectionIsEmpty(selection: EditorSelection): boolean {
  return selection.ranges.every((range) => range.empty);
}

export function createWordLikeEditingExtension(plugin: KnowGrovePlugin) {
  const markerPlugin = ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    private readonly modeObserver = new MutationObserver(() => {
      this.view.dispatch({ effects: refreshWordLikeEditingEffect.of() });
    });
    private readonly handleMediaPointer = (event: Event): void => {
      if (!(event instanceof MouseEvent)
        || !plugin.settings.enableWordLikeEditing
        || !isLivePreview(this.view)
        || !selectedMediaLine(this.view, event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    constructor(private readonly view: EditorView) {
      this.decorations = markerDecorations(view);
      view.dom.addEventListener("pointerdown", this.handleMediaPointer, { capture: true });
      view.dom.addEventListener("mousedown", this.handleMediaPointer, { capture: true });
      const sourceView = view.dom.closest(".markdown-source-view");
      if (sourceView) this.modeObserver.observe(sourceView, { attributes: true, attributeFilter: ["class"] });
    }

    update(update: ViewUpdate): void {
      if (!plugin.settings.enableWordLikeEditing) {
        this.decorations = Decoration.none;
        return;
      }
      const forced = update.transactions.some((transaction) =>
        transaction.effects.some((effect) => effect.is(refreshWordLikeEditingEffect)));
      if (forced || update.docChanged || update.viewportChanged || update.selectionSet || update.focusChanged) {
        this.decorations = markerDecorations(update.view);
      }
      if (!update.selectionSet || !selectionIsEmpty(update.state.selection)) return;
      const position = update.state.selection.main.head;
      const markerSnapped = snapCursorOutsideMarkers(update.view, position);
      const snapped = snapCursorOutsideListMarkers(update.view, markerSnapped);
      if (snapped === position) return;
      queueMicrotask(() => {
        if (update.view.state.selection.main.head === position) {
          update.view.dispatch({ selection: { anchor: snapped }, scrollIntoView: false });
        }
      });
    }

    destroy(): void {
      this.view.dom.removeEventListener("pointerdown", this.handleMediaPointer, { capture: true });
      this.view.dom.removeEventListener("mousedown", this.handleMediaPointer, { capture: true });
      this.modeObserver.disconnect();
    }
  }, {
    decorations: (instance) => instance.decorations,
  });

  const eventHandlers = EditorView.domEventHandlers({
    keydown(event, view): boolean {
      if (!plugin.settings.enableWordLikeEditing || !isLivePreview(view)) return false;
      const selection = view.state.selection.main;
      if (!selection.empty) return false;
      const content = view.state.doc.toString();
      const position = selection.head;
      const tabSize = view.state.tabSize;
      let edit: WordLikeEdit | null = null;
      let userEvent = "input";
      if (event.key === "Backspace") {
        edit = wordLikeBackspaceEdit(content, position, tabSize);
        userEvent = "delete.backward";
      } else if (event.key === "Delete") {
        edit = wordLikeDeleteEdit(content, position, tabSize);
        userEvent = "delete.forward";
      } else if (event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
        edit = wordLikeEnterEdit(content, position, tabSize);
      } else if (event.key === "Tab" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        edit = wordLikeIndentEdit(content, position, event.shiftKey ? "outdent" : "indent", tabSize);
        userEvent = event.shiftKey ? "input.unindent" : "input.indent";
      }
      if (!edit) return false;
      event.preventDefault();
      event.stopImmediatePropagation();
      dispatchEdit(view, edit, userEvent);
      return true;
    },
  });

  return Prec.high([markerPlugin, eventHandlers]);
}
