import { MarkdownView, Menu } from "obsidian";
import type KnowGrovePlugin from "./main";

interface TableLineRange {
  startLine: number;
  endLine: number;
  lines: string[];
}

interface TableColumnDragState {
  table: HTMLTableElement;
  th: HTMLTableCellElement;
  colIndex: number;
  pointerId: number;
  startX: number;
  startWidths: number[];
  handle: HTMLElement;
  guideEl: HTMLElement;
  scroller: HTMLElement | null;
  lockedScrollTop: number;
}

export class TableResizer {
  private readonly workspaceRoot: HTMLElement;
  private readonly ownerDocument: Document;
  private activeDrag: TableColumnDragState | null = null;
  private observer: MutationObserver | null = null;
  private mutationRaf: number | null = null;
  private dragRaf: number | null = null;
  private pendingPointerX: number | null = null;
  private readonly boundTables = new WeakSet<HTMLTableElement>();

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.activeDrag || event.pointerId !== this.activeDrag.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    this.pendingPointerX = event.clientX;
    if (this.dragRaf !== null) return;
    this.dragRaf = this.ownerDocument.defaultView?.requestAnimationFrame(() => {
      this.dragRaf = null;
      const clientX = this.pendingPointerX;
      this.pendingPointerX = null;
      if (clientX !== null) this.applyColumnDrag(clientX);
    }) ?? null;
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (!this.activeDrag || event.pointerId !== this.activeDrag.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      this.activeDrag.handle.releasePointerCapture(event.pointerId);
    } catch {
      // Best effort across Electron versions.
    }
    this.saveTableColumnWidths(this.activeDrag.table);
    this.cleanupActiveDrag();
  };

  constructor(private readonly plugin: KnowGrovePlugin) {
    this.workspaceRoot = plugin.app.workspace.containerEl;
    this.ownerDocument = this.workspaceRoot.ownerDocument;
    this.setupGlobalListeners();
    this.startObserving();
  }

  destroy(): void {
    this.stopObserving();
    this.cleanupActiveDrag();
    this.removeGlobalListeners();
    this.cancelAnimationFrames();
    this.workspaceRoot.querySelectorAll(".knowgrove-table-col-handle, .knowgrove-table-col-guide")
      .forEach((element) => element.remove());
    this.ownerDocument.querySelectorAll(".knowgrove-table-col-guide").forEach((element) => element.remove());
  }

  private setupGlobalListeners(): void {
    this.ownerDocument.defaultView?.addEventListener("pointermove", this.onPointerMove, { passive: false });
    this.ownerDocument.defaultView?.addEventListener("pointerup", this.onPointerUp, { passive: false });
    this.ownerDocument.defaultView?.addEventListener("pointercancel", this.onPointerUp, { passive: false });
  }

  private removeGlobalListeners(): void {
    this.ownerDocument.defaultView?.removeEventListener("pointermove", this.onPointerMove);
    this.ownerDocument.defaultView?.removeEventListener("pointerup", this.onPointerUp);
    this.ownerDocument.defaultView?.removeEventListener("pointercancel", this.onPointerUp);
  }

  private startObserving(): void {
    this.scanAndBindTables();
    const pendingContainers = new Set<Element>();
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const target = mutation.target.instanceOf(Element) ? mutation.target : mutation.target.parentElement;
        const container = target?.closest(".markdown-source-view, .markdown-preview-view");
        if (container) pendingContainers.add(container);
        for (const node of Array.from(mutation.addedNodes)) {
          if (!node.instanceOf(Element)) continue;
          if (node.matches(".markdown-source-view, .markdown-preview-view")) pendingContainers.add(node);
          const own = node.closest(".markdown-source-view, .markdown-preview-view");
          if (own) pendingContainers.add(own);
          node.querySelectorAll(".markdown-source-view, .markdown-preview-view").forEach((item) => pendingContainers.add(item));
        }
      }
      if (!pendingContainers.size || this.mutationRaf !== null) return;
      this.mutationRaf = this.ownerDocument.defaultView?.requestAnimationFrame(() => {
        this.mutationRaf = null;
        const containers = Array.from(pendingContainers);
        pendingContainers.clear();
        for (const container of containers) this.scanContainer(container);
      }) ?? null;
    });
    this.observer.observe(this.workspaceRoot, { childList: true, subtree: true });
  }

  private stopObserving(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  public scanAndBindTables(): void {
    this.workspaceRoot.querySelectorAll(".markdown-source-view, .markdown-preview-view")
      .forEach((container) => this.scanContainer(container));
  }

  private scanContainer(container: Element): void {
    container.querySelectorAll("table").forEach((table) => {
      if (table.instanceOf(HTMLTableElement)) this.bindTable(table);
    });
  }

  private bindTable(table: HTMLTableElement): void {
    if (table.closest(".x-color-picker-wrapper") || table.classList.contains("x-color-picker-table")) return;
    table.classList.add("knowgrove-resizable-table");
    const ths = Array.from(table.querySelectorAll<HTMLTableCellElement>("thead th, tr:first-child th"));
    if (!ths.length) return;
    ths.forEach((th, index) => this.attachHandleToTh(table, th, index));
    if (this.boundTables.has(table)) return;
    this.boundTables.add(table);
    this.setupTableCellInteractions(table);
  }

  private setupTableCellInteractions(table: HTMLTableElement): void {
    table.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        event.stopPropagation();
      }
    });

    table.addEventListener("contextmenu", (event: MouseEvent) => {
      const cell = (event.target as HTMLElement).closest<HTMLTableCellElement>("th, td");
      const row = cell?.closest<HTMLTableRowElement>("tr");
      if (!cell || !row) return;
      event.preventDefault();
      event.stopPropagation();
      const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>("th, td"));
      const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>("tr"));
      const colIndex = cells.indexOf(cell);
      const rowIndex = rows.indexOf(row);
      const menu = new Menu();
      menu.addItem((item) => item
        .setTitle("🗑️ 删除当前行")
        .setIcon("trash")
        .setDisabled(rows.length <= 2 && rowIndex === 0)
        .onClick(() => this.deleteTableRow(table, rowIndex)));
      menu.addItem((item) => item
        .setTitle("🗑️ 删除当前列")
        .setIcon("trash")
        .setDisabled(cells.length <= 1)
        .onClick(() => this.deleteTableColumn(table, colIndex)));
      menu.addSeparator();
      menu.addItem((item) => item.setTitle("➕ 在上方插入行").setIcon("arrow-up")
        .onClick(() => this.insertTableRow(table, rowIndex, "above")));
      menu.addItem((item) => item.setTitle("➕ 在下方插入行").setIcon("arrow-down")
        .onClick(() => this.insertTableRow(table, rowIndex, "below")));
      menu.addSeparator();
      menu.addItem((item) => item.setTitle("➕ 在左侧插入列").setIcon("arrow-left")
        .onClick(() => this.insertTableColumn(table, colIndex, "left")));
      menu.addItem((item) => item.setTitle("➕ 在右侧插入列").setIcon("arrow-right")
        .onClick(() => this.insertTableColumn(table, colIndex, "right")));
      menu.addSeparator();
      menu.addItem((item) => item.setTitle("🔄 恢复表格自适应列宽").setIcon("rotate-ccw")
        .onClick(() => this.resetTableWidths(table)));
      menu.showAtPosition({ x: event.pageX, y: event.pageY });
    });
  }

  private findMarkdownViewForTable(table: HTMLTableElement): MarkdownView | null {
    for (const leaf of this.plugin.app.workspace.getLeavesOfType("markdown")) {
      if (leaf.view instanceof MarkdownView && leaf.view.containerEl.contains(table)) return leaf.view;
    }
    return null;
  }

  private findTableLineRange(docText: string, table: HTMLTableElement): TableLineRange | null {
    const firstTh = table.querySelector("th");
    const thText = firstTh?.textContent?.trim() || "";
    const allDocLines = docText.split("\n");
    for (let i = 0; i < allDocLines.length; i += 1) {
      const line = allDocLines[i];
      if (!line || !line.trim().startsWith("|")) continue;
      if (thText && !line.includes(thText)) continue;
      const tableLines: string[] = [];
      let cursor = i;
      while (cursor < allDocLines.length && Boolean(allDocLines[cursor]?.trim().startsWith("|"))) {
        tableLines.push(allDocLines[cursor] ?? "");
        cursor += 1;
      }
      if (tableLines.length >= 2) return { startLine: i, endLine: cursor - 1, lines: tableLines };
    }
    return null;
  }

  private replaceTableRange(view: MarkdownView, range: TableLineRange, lines: string[]): void {
    const editor = view.editor;
    const from = { line: range.startLine, ch: 0 };
    const endText = editor.getLine(range.endLine) ?? "";
    const to = { line: range.endLine, ch: endText.length };
    const scroller = view.containerEl.querySelector<HTMLElement>(".cm-scroller");
    const scrollTop = scroller?.scrollTop ?? 0;
    scroller?.classList.add("knowgrove-scroll-anchor-lock");
    editor.replaceRange(lines.join("\n"), from, to);
    const win = this.ownerDocument.defaultView;
    if (scroller && win) {
      win.requestAnimationFrame(() => {
        scroller.scrollTop = scrollTop;
        win.requestAnimationFrame(() => {
          scroller.scrollTop = scrollTop;
          scroller.classList.remove("knowgrove-scroll-anchor-lock");
        });
      });
    } else {
      scroller?.classList.remove("knowgrove-scroll-anchor-lock");
    }
  }

  private deleteTableRow(table: HTMLTableElement, rowIndex: number): void {
    const view = this.findMarkdownViewForTable(table);
    if (!view) return;
    const range = this.findTableLineRange(view.editor.getValue(), table);
    if (!range) return;
    const lines = [...range.lines];
    if (rowIndex === 0) {
      if (lines.length > 2 && lines[2]) {
        lines[0] = lines[2];
        lines.splice(2, 1);
      }
    } else {
      const index = 1 + rowIndex;
      if (index < lines.length) lines.splice(index, 1);
    }
    this.replaceTableRange(view, range, lines);
  }

  private deleteTableColumn(table: HTMLTableElement, colIndex: number): void {
    const view = this.findMarkdownViewForTable(table);
    if (!view) return;
    const range = this.findTableLineRange(view.editor.getValue(), table);
    if (!range) return;
    const lines = range.lines.map((line) => {
      const parts = line.split("|");
      if (parts.length > colIndex + 1) parts.splice(colIndex + 1, 1);
      return parts.join("|");
    });
    this.replaceTableRange(view, range, lines);
  }

  private insertTableRow(table: HTMLTableElement, rowIndex: number, position: "above" | "below"): void {
    const view = this.findMarkdownViewForTable(table);
    if (!view) return;
    const range = this.findTableLineRange(view.editor.getValue(), table);
    if (!range) return;
    const lines = [...range.lines];
    const colCount = Math.max(1, table.querySelectorAll("th").length);
    const blankRow = `| ${Array(colCount).fill(" ").join(" | ")} |`;
    let insertIndex = position === "above" ? Math.max(2, 1 + rowIndex) : 2 + rowIndex;
    if (rowIndex === 0 && position === "above") insertIndex = 2;
    lines.splice(Math.min(insertIndex, lines.length), 0, blankRow);
    this.replaceTableRange(view, range, lines);
  }

  private insertTableColumn(table: HTMLTableElement, colIndex: number, position: "left" | "right"): void {
    const view = this.findMarkdownViewForTable(table);
    if (!view) return;
    const range = this.findTableLineRange(view.editor.getValue(), table);
    if (!range) return;
    const targetIndex = position === "left" ? colIndex + 1 : colIndex + 2;
    const lines = range.lines.map((line, rowIndex) => {
      const parts = line.split("|");
      const fill = rowIndex === 0 ? " 新列 " : rowIndex === 1 ? " --- " : " ";
      parts.splice(targetIndex, 0, fill);
      return parts.join("|");
    });
    this.replaceTableRange(view, range, lines);
  }

  private attachHandleToTh(table: HTMLTableElement, th: HTMLTableCellElement, colIndex: number): void {
    th.classList.add("knowgrove-table-th");
    if (th.querySelector(".knowgrove-table-col-handle")) return;
    const handle = th.createDiv({ cls: "knowgrove-table-col-handle" });
    handle.setAttribute("aria-label", "拖动调整列宽，双击自适应");
    handle.dataset.colIndex = colIndex.toString();
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      try {
        handle.setPointerCapture(event.pointerId);
      } catch {
        // Best effort.
      }
      this.startDragging(table, th, colIndex, event, handle);
    });
    handle.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.resetTableWidths(table);
    });
  }

  private startDragging(
    table: HTMLTableElement,
    th: HTMLTableCellElement,
    colIndex: number,
    event: PointerEvent,
    handle: HTMLElement,
  ): void {
    this.cleanupActiveDrag();
    const ths = Array.from(table.querySelectorAll<HTMLTableCellElement>("thead th, tr:first-child th"));
    const startWidths = ths.map((cell) => Math.round(cell.getBoundingClientRect().width || 100));
    const totalWidth = startWidths.reduce((sum, width) => sum + width, 0);
    table.classList.add("knowgrove-table-fixed-layout");
    table.style.setProperty("width", `${totalWidth}px`, "important");
    table.style.setProperty("min-width", `${totalWidth}px`, "important");
    ths.forEach((cell, index) => this.setCellWidth(cell, startWidths[index] ?? 100));
    const thRect = th.getBoundingClientRect();
    const tableRect = table.getBoundingClientRect();
    const guideEl = this.ownerDocument.body.createDiv({ cls: "knowgrove-table-col-guide" });
    guideEl.style.left = `${thRect.right}px`;
    guideEl.style.top = `${tableRect.top}px`;
    guideEl.style.height = `${tableRect.height}px`;
    const view = this.findMarkdownViewForTable(table);
    const scroller = view?.containerEl.querySelector<HTMLElement>(".cm-scroller") ?? null;
    this.activeDrag = {
      table,
      th,
      colIndex,
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidths,
      handle,
      guideEl,
      scroller,
      lockedScrollTop: scroller?.scrollTop ?? 0,
    };
    scroller?.classList.add("knowgrove-scroll-anchor-lock");
  }

  private applyColumnDrag(clientX: number): void {
    const state = this.activeDrag;
    if (!state) return;
    const deltaX = clientX - state.startX;
    const currentWidths = [...state.startWidths];
    currentWidths[state.colIndex] = Math.max(40, (state.startWidths[state.colIndex] ?? 100) + deltaX);
    const totalWidth = currentWidths.reduce((sum, width) => sum + width, 0);
    state.table.style.setProperty("width", `${totalWidth}px`, "important");
    state.table.style.setProperty("min-width", `${totalWidth}px`, "important");
    const ths = Array.from(state.table.querySelectorAll<HTMLTableCellElement>("thead th, tr:first-child th"));
    ths.forEach((cell, index) => this.setCellWidth(cell, currentWidths[index] ?? 100));
    for (const row of Array.from(state.table.querySelectorAll<HTMLTableRowElement>("tbody tr, tr"))) {
      Array.from(row.querySelectorAll<HTMLTableCellElement>("td"))
        .forEach((cell, index) => this.setCellWidth(cell, currentWidths[index] ?? 100));
    }
    const targetTh = ths[state.colIndex];
    if (targetTh) {
      const thRect = targetTh.getBoundingClientRect();
      const tableRect = state.table.getBoundingClientRect();
      state.guideEl.style.left = `${thRect.right}px`;
      state.guideEl.style.top = `${tableRect.top}px`;
      state.guideEl.style.height = `${tableRect.height}px`;
    }
    if (state.scroller && Math.abs(state.scroller.scrollTop - state.lockedScrollTop) > 0.5) {
      state.scroller.scrollTop = state.lockedScrollTop;
    }
  }

  private setCellWidth(cell: HTMLTableCellElement, width: number): void {
    cell.style.setProperty("width", `${Math.round(width)}px`, "important");
    cell.style.setProperty("min-width", `${Math.round(width)}px`, "important");
    cell.style.setProperty("max-width", `${Math.round(width)}px`, "important");
  }

  private resetTableWidths(table: HTMLTableElement): void {
    table.style.removeProperty("table-layout");
    table.style.removeProperty("width");
    table.style.removeProperty("min-width");
    table.classList.remove("knowgrove-table-fixed-layout");
    table.querySelectorAll<HTMLElement>("th, td").forEach((cell) => {
      cell.style.removeProperty("width");
      cell.style.removeProperty("min-width");
      cell.style.removeProperty("max-width");
    });
    delete table.dataset.knowgroveColWidths;
  }

  private cleanupActiveDrag(): void {
    const state = this.activeDrag;
    if (!state) return;
    state.guideEl.remove();
    if (state.scroller) {
      state.scroller.scrollTop = state.lockedScrollTop;
      state.scroller.classList.remove("knowgrove-scroll-anchor-lock");
    }
    this.activeDrag = null;
  }

  private saveTableColumnWidths(table: HTMLTableElement): void {
    const widths = Array.from(table.querySelectorAll<HTMLTableCellElement>("thead th, tr:first-child th"))
      .map((th) => th.style.width || "auto");
    table.dataset.knowgroveColWidths = widths.join(",");
  }

  private cancelAnimationFrames(): void {
    const win = this.ownerDocument.defaultView;
    if (!win) return;
    if (this.mutationRaf !== null) win.cancelAnimationFrame(this.mutationRaf);
    if (this.dragRaf !== null) win.cancelAnimationFrame(this.dragRaf);
    this.mutationRaf = null;
    this.dragRaf = null;
    this.pendingPointerX = null;
  }
}
