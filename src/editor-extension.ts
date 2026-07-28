import { StateEffect, type Range } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { setIcon } from "obsidian";
import type KnowGrovePlugin from "./main";
import { MarkdownView } from "obsidian";
import {
  KNOWGROVE_BLOCK_DRAG_MIME,
  type BlockDragPayload,
} from "./block-drag";
import { locateReferenceSelection } from "./reference-repair";

const refreshCommentDecorationsEffect = StateEffect.define<void>();

function markdownViewForEditor(plugin: KnowGrovePlugin, editorView: EditorView): MarkdownView | null {
  for (const leaf of plugin.app.workspace.getLeavesOfType("markdown")) {
    if (leaf.view instanceof MarkdownView && leaf.view.file && leaf.view.containerEl.contains(editorView.dom)) {
      return leaf.view;
    }
  }
  return null;
}

class CommentPinWidget extends WidgetType {
  constructor(
    private readonly plugin: KnowGrovePlugin,
    private readonly blockId: string,
  ) {
    super();
  }

  eq(other: CommentPinWidget): boolean {
    return other.blockId === this.blockId;
  }

  toDOM(): HTMLElement {
    const records = this.plugin.getReferencesForBlock(this.blockId);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "knowgrove-editor-pin";
    button.setAttribute("aria-label", `查看 ${records.length} 条评论`);
    button.dataset.blockId = this.blockId;
    setIcon(button, "message-circle");

    const badge = button.createSpan({
      cls: "knowgrove-editor-pin-count",
      text: records.length.toString(),
    });
    badge.setAttribute("aria-hidden", "true");

    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void this.plugin.openCommentsForBlock(this.blockId);
    });
    return button;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

function buildDecorations(view: EditorView, plugin: KnowGrovePlugin): DecorationSet {
  if (!plugin.settings.enableComments) return Decoration.none;
  const ranges: Array<Range<Decoration>> = [];
  const content = view.state.doc.toString();
  const sourcePath = markdownViewForEditor(plugin, view)?.file?.path;
  if (sourcePath) {
    const groupedSelections = new Map<string, { start: number; end: number; ids: string[] }>();
    for (const record of plugin.getReferencesForSource(sourcePath)) {
      const match = locateReferenceSelection(content, record);
      if (!match || match === "ambiguous" || match.start === match.end) continue;
      const key = `${match.start}:${match.end}`;
      const existing = groupedSelections.get(key);
      if (existing) existing.ids.push(record.id);
      else groupedSelections.set(key, { start: match.start, end: match.end, ids: [record.id] });
    }
    for (const selection of groupedSelections.values()) {
      if (selection.start < 0 || selection.end > content.length || selection.start >= selection.end) continue;
      ranges.push(Decoration.mark({
        class: "knowgrove-commented-text",
        attributes: { "data-comment-ids": selection.ids.join(",") },
      }).range(selection.start, selection.end));
    }
  }

  const pattern = /\^([a-z0-9-]+)/gi;
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    for (const match of text.matchAll(pattern)) {
      const blockId = match[1];
      if (!blockId || match.index === undefined || !plugin.getReferencesForBlock(blockId).length) continue;
      const position = from + match.index + match[0].length;
      ranges.push(Decoration.widget({
        widget: new CommentPinWidget(plugin, blockId),
        side: 1,
      }).range(position));
    }
  }
  ranges.sort((left, right) => left.from - right.from
    || left.value.startSide - right.value.startSide
    || left.to - right.to);
  return Decoration.set(ranges);
}

export function refreshCommentEditorDecorations(view: EditorView): void {
  view.dispatch({ effects: refreshCommentDecorationsEffect.of() });
}

export function createCommentEditorExtension(plugin: KnowGrovePlugin) {
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet;

    constructor(private readonly view: EditorView) {
      this.decorations = buildDecorations(view, plugin);
    }

    update(update: ViewUpdate): void {
      const forced = update.transactions.some((transaction) =>
        transaction.effects.some((effect) => effect.is(refreshCommentDecorationsEffect)));
      if (forced || update.docChanged || update.viewportChanged || update.focusChanged || update.selectionSet) {
        this.decorations = buildDecorations(update.view, plugin);
      }
    }
  }, {
    decorations: (instance) => instance.decorations,
  });
}

export function createBlockDragEditorExtension(plugin: KnowGrovePlugin) {
  return EditorView.domEventHandlers({
    dragstart(event, editorView): boolean {
      if (!plugin.settings.enableBlockDragReferences || !event.dataTransfer) return false;
      const selection = editorView.state.selection.main;
      if (selection.empty) return false;
      const markdownView = markdownViewForEditor(plugin, editorView);
      if (!markdownView?.file) return false;
      const payload = plugin.prepareBlockDrag(
        markdownView.file.path,
        editorView.state.doc.toString(),
        selection.from,
        selection.to,
      );
      if (!payload) return false;
      plugin.setActiveBlockDrag(payload);
      event.dataTransfer.setData(KNOWGROVE_BLOCK_DRAG_MIME, payload.token);
      event.dataTransfer.effectAllowed = "copy";
      return false;
    },
    dragover(event, editorView): boolean {
      const payload = plugin.getActiveBlockDrag();
      const target = markdownViewForEditor(plugin, editorView);
      if (!payload || !target?.file || payload.sourcePath === target.file.path) return false;
      if (!Array.from(event.dataTransfer?.types ?? []).includes(KNOWGROVE_BLOCK_DRAG_MIME)) return false;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      return true;
    },
    drop(event, editorView): boolean {
      const payload: BlockDragPayload | undefined = plugin.getActiveBlockDrag();
      const target = markdownViewForEditor(plugin, editorView);
      const token = event.dataTransfer?.getData(KNOWGROVE_BLOCK_DRAG_MIME);
      if (!payload || !target?.file || !token || token !== payload.token || payload.sourcePath === target.file.path) return false;
      event.preventDefault();
      event.stopPropagation();
      const dropOffset = editorView.posAtCoords({ x: event.clientX, y: event.clientY })
        ?? editorView.state.selection.main.head;
      plugin.clearActiveBlockDrag();
      void plugin.insertDraggedBlockReference(payload, target, dropOffset);
      return true;
    },
    dragend(): boolean {
      plugin.clearActiveBlockDrag();
      return false;
    },
  });
}
