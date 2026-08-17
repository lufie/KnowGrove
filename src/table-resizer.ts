import { MarkdownView, Menu } from "obsidian";
import type KnowGrovePlugin from "./main";

interface TableColumnDragState {
  table: HTMLTableElement;
  th: HTMLTableCellElement;
  colIndex: number;
  startX: number;
  startWidths: number[];
  handle: HTMLElement;
  guideEl: HTMLElement;
}

export class TableResizer {
  private activeDrag: TableColumnDragState | null = null;
  private pointerMoveListener: ((event: PointerEvent) => void) | null = null;
  private pointerUpListener: ((event: PointerEvent) => void) | null = null;
  private observer: MutationObserver | null = null;
  private boundTables = new WeakSet<HTMLTableElement>();

  constructor(private readonly plugin: KnowGrovePlugin) {
    this.setupGlobalListeners();
    this.startObserving();
  }

  destroy(): void {
    this.stopObserving();
    this.cleanupActiveDrag();
    this.removeGlobalListeners();
    document.querySelectorAll(".knowgrove-table-col-handle, .knowgrove-table-col-guide").forEach((el) => el.remove());
  }

  private setupGlobalListeners(): void {
    this.pointerMoveListener = (event: PointerEvent) => {
      if (!this.activeDrag) return;
      event.preventDefault();
      event.stopPropagation();

      const deltaX = event.clientX - this.activeDrag.startX;
      const initialColWidth = this.activeDrag.startWidths[this.activeDrag.colIndex] ?? 100;
      const newColWidth = Math.max(40, initialColWidth + deltaX);

      // Compute all column widths
      const currentWidths = [...this.activeDrag.startWidths];
      currentWidths[this.activeDrag.colIndex] = newColWidth;

      const totalWidth = currentWidths.reduce((sum, w) => sum + w, 0);

      // Set table layout & width
      this.activeDrag.table.classList.add("knowgrove-table-fixed-layout");
      this.activeDrag.table.style.setProperty("width", `${totalWidth}px`, "important");
      this.activeDrag.table.style.setProperty("min-width", `${totalWidth}px`, "important");

      const ths = Array.from(this.activeDrag.table.querySelectorAll<HTMLTableCellElement>("thead th, tr:first-child th"));
      for (let i = 0; i < ths.length; i += 1) {
        const th = ths[i];
        const w = currentWidths[i] ?? 100;
        if (th) {
          th.style.setProperty("width", `${w}px`, "important");
          th.style.setProperty("min-width", `${w}px`, "important");
          th.style.setProperty("max-width", `${w}px`, "important");
        }
      }

      const rows = Array.from(this.activeDrag.table.querySelectorAll<HTMLTableRowElement>("tbody tr, tr"));
      for (const row of rows) {
        const tds = Array.from(row.querySelectorAll<HTMLTableCellElement>("td"));
        for (let i = 0; i < tds.length; i += 1) {
          const td = tds[i];
          const w = currentWidths[i] ?? 100;
          if (td) {
            td.style.setProperty("width", `${w}px`, "important");
            td.style.setProperty("min-width", `${w}px`, "important");
            td.style.setProperty("max-width", `${w}px`, "important");
          }
        }
      }

      // Update guide position
      const tableRect = this.activeDrag.table.getBoundingClientRect();
      const targetTh = ths[this.activeDrag.colIndex];
      if (targetTh) {
        const thRect = targetTh.getBoundingClientRect();
        this.activeDrag.guideEl.style.setProperty("left", `${thRect.right}px`);
        this.activeDrag.guideEl.style.setProperty("top", `${tableRect.top}px`);
        this.activeDrag.guideEl.style.setProperty("height", `${tableRect.height}px`);
      }
    };

    this.pointerUpListener = (event: PointerEvent) => {
      if (!this.activeDrag) return;
      event.preventDefault();
      event.stopPropagation();
      try {
        this.activeDrag.handle.releasePointerCapture(event.pointerId);
      } catch {
        // Best effort
      }
      this.saveTableColumnWidths(this.activeDrag.table);
      this.cleanupActiveDrag();
    };

    window.addEventListener("pointermove", this.pointerMoveListener, { passive: false });
    window.addEventListener("pointerup", this.pointerUpListener, { passive: false });
    window.addEventListener("pointercancel", this.pointerUpListener, { passive: false });
  }

  private removeGlobalListeners(): void {
    if (this.pointerMoveListener) {
      window.removeEventListener("pointermove", this.pointerMoveListener);
      this.pointerMoveListener = null;
    }
    if (this.pointerUpListener) {
      window.removeEventListener("pointerup", this.pointerUpListener);
      window.removeEventListener("pointercancel", this.pointerUpListener);
      this.pointerUpListener = null;
    }
  }

  private startObserving(): void {
    this.scanAndBindTables();
    this.observer = new MutationObserver(() => {
      this.scanAndBindTables();
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  private stopObserving(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  public scanAndBindTables(): void {
    const markdownContainers = document.querySelectorAll(".markdown-source-view, .markdown-preview-view");
    for (let i = 0; i < markdownContainers.length; i += 1) {
      const container = markdownContainers[i];
      if (!container) continue;
      const tables = container.querySelectorAll("table");
      for (let j = 0; j < tables.length; j += 1) {
        const table = tables[j];
        if (table instanceof HTMLTableElement) {
          this.bindTable(table);
        }
      }
    }
  }

  private bindTable(table: HTMLTableElement): void {
    if (table.closest(".x-color-picker-wrapper") || table.classList.contains("x-color-picker-table")) return;

    table.classList.add("knowgrove-resizable-table");

    const ths = Array.from(table.querySelectorAll<HTMLTableCellElement>("thead th, tr:first-child th"));
    if (!ths.length) return;

    for (let i = 0; i < ths.length; i += 1) {
      const th = ths[i];
      if (!th) continue;
      this.attachHandleToTh(table, th, i);
    }

    if (!this.boundTables.has(table)) {
      this.boundTables.add(table);
      this.setupTableCellInteractions(table);
    }
  }

  private setupTableCellInteractions(table: HTMLTableElement): void {
    // Prevent Enter from inserting newlines that break Markdown tables
    table.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        event.stopPropagation();
      }
    });

    // Context Menu for Word-like table row/col manipulation
    table.addEventListener("contextmenu", (event: MouseEvent) => {
      const cell = (event.target as HTMLElement).closest<HTMLTableCellElement>("th, td");
      if (!cell) return;
      const tr = cell.closest<HTMLTableRowElement>("tr");
      if (!tr) return;

      event.preventDefault();
      event.stopPropagation();

      const cellsInRow = Array.from(tr.querySelectorAll<HTMLTableCellElement>("th, td"));
      const colIndex = cellsInRow.indexOf(cell);

      const allRows = Array.from(table.querySelectorAll<HTMLTableRowElement>("tr"));
      const rowIndex = allRows.indexOf(tr);

      const menu = new Menu();

      menu.addItem((item) => {
        item.setTitle("🗑️ 删除当前行")
          .setIcon("trash")
          .setDisabled(allRows.length <= 2 && rowIndex === 0)
          .onClick(() => this.deleteTableRow(table, rowIndex));
      });

      menu.addItem((item) => {
        item.setTitle("🗑️ 删除当前列")
          .setIcon("trash")
          .setDisabled(cellsInRow.length <= 1)
          .onClick(() => this.deleteTableColumn(table, colIndex));
      });

      menu.addSeparator();

      menu.addItem((item) => {
        item.setTitle("➕ 在上方插入行")
          .setIcon("arrow-up")
          .onClick(() => this.insertTableRow(table, rowIndex, "above"));
      });

      menu.addItem((item) => {
        item.setTitle("➕ 在下方插入行")
          .setIcon("arrow-down")
          .onClick(() => this.insertTableRow(table, rowIndex, "below"));
      });

      menu.addSeparator();

      menu.addItem((item) => {
        item.setTitle("➕ 在左侧插入列")
          .setIcon("arrow-left")
          .onClick(() => this.insertTableColumn(table, colIndex, "left"));
      });

      menu.addItem((item) => {
        item.setTitle("➕ 在右侧插入列")
          .setIcon("arrow-right")
          .onClick(() => this.insertTableColumn(table, colIndex, "right"));
      });

      menu.addSeparator();

      menu.addItem((item) => {
        item.setTitle("🔄 恢复表格自适应列宽")
          .setIcon("rotate-ccw")
          .onClick(() => this.resetTableWidths(table));
      });

      menu.showAtPosition({ x: event.pageX, y: event.pageY });
    });
  }

  private findMarkdownViewForTable(table: HTMLTableElement): MarkdownView | null {
    const active = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    if (active && active.containerEl.contains(table)) return active;

    for (const leaf of this.plugin.app.workspace.getLeavesOfType("markdown")) {
      if (leaf.view instanceof MarkdownView && leaf.view.containerEl.contains(table)) {
        return leaf.view;
      }
    }
    return active || (this.plugin.app.workspace.getLeavesOfType("markdown")[0]?.view as MarkdownView) || null;
  }

  private findTableLineRange(docText: string, table: HTMLTableElement): { startLine: number; endLine: number; lines: string[] } | null {
    const firstTh = table.querySelector("th");
    const thText = firstTh?.textContent?.trim() || "";
    const allDocLines = docText.split("\n");

    for (let i = 0; i < allDocLines.length; i += 1) {
      const line = allDocLines[i];
      if (!line || !line.trim().startsWith("|")) continue;

      if (!thText || line.includes(thText)) {
        // Collect all consecutive table lines
        const tableLines: string[] = [];
        let j = i;
        while (j < allDocLines.length && (allDocLines[j]?.trim().startsWith("|") || false)) {
          tableLines.push(allDocLines[j] ?? "");
          j += 1;
        }

        if (tableLines.length >= 2) {
          return { startLine: i, endLine: j - 1, lines: tableLines };
        }
      }
    }
    return null;
  }

  private deleteTableRow(table: HTMLTableElement, rowIndex: number): void {
    const view = this.findMarkdownViewForTable(table);
    if (!view) return;

    const editor = view.editor;
    const docText = editor.getValue();
    const range = this.findTableLineRange(docText, table);
    if (!range) return;

    const { startLine, lines } = range;
    if (rowIndex === 0) {
      if (lines.length > 2 && lines[2]) {
        // Promote first data row to header
        lines[0] = lines[2];
        lines.splice(2, 1);
      }
    } else {
      const targetLineInTable = 1 + rowIndex;
      if (targetLineInTable < lines.length) {
        lines.splice(targetLineInTable, 1);
      }
    }

    const allDocLines = docText.split("\n");
    allDocLines.splice(startLine, range.endLine - startLine + 1, ...lines);
    editor.setValue(allDocLines.join("\n"));
  }

  private deleteTableColumn(table: HTMLTableElement, colIndex: number): void {
    const view = this.findMarkdownViewForTable(table);
    if (!view) return;

    const editor = view.editor;
    const docText = editor.getValue();
    const range = this.findTableLineRange(docText, table);
    if (!range) return;

    const { startLine, lines } = range;
    const updatedLines = lines.map((line) => {
      const parts = line.split("|");
      if (parts.length > colIndex + 1) {
        parts.splice(colIndex + 1, 1);
      }
      return parts.join("|");
    });

    const allDocLines = docText.split("\n");
    allDocLines.splice(startLine, range.endLine - startLine + 1, ...updatedLines);
    editor.setValue(allDocLines.join("\n"));
  }

  private insertTableRow(table: HTMLTableElement, rowIndex: number, position: "above" | "below"): void {
    const view = this.findMarkdownViewForTable(table);
    if (!view) return;

    const editor = view.editor;
    const docText = editor.getValue();
    const range = this.findTableLineRange(docText, table);
    if (!range) return;

    const { startLine, lines } = range;
    const ths = table.querySelectorAll("th");
    const colCount = Math.max(1, ths.length);
    const blankRow = `| ${Array(colCount).fill(" ").join(" | ")} |`;

    let insertIndex = position === "above" ? Math.max(2, 1 + rowIndex) : 2 + rowIndex;
    if (rowIndex === 0 && position === "above") insertIndex = 2;

    lines.splice(insertIndex, 0, blankRow);

    const allDocLines = docText.split("\n");
    allDocLines.splice(startLine, range.endLine - startLine + 1, ...lines);
    editor.setValue(allDocLines.join("\n"));
  }

  private insertTableColumn(table: HTMLTableElement, colIndex: number, position: "left" | "right"): void {
    const view = this.findMarkdownViewForTable(table);
    if (!view) return;

    const editor = view.editor;
    const docText = editor.getValue();
    const range = this.findTableLineRange(docText, table);
    if (!range) return;

    const { startLine, lines } = range;
    const targetIdx = position === "left" ? colIndex + 1 : colIndex + 2;

    const updatedLines = lines.map((line, idx) => {
      const parts = line.split("|");
      const fill = idx === 0 ? " 新列 " : idx === 1 ? " --- " : " ";
      parts.splice(targetIdx, 0, fill);
      return parts.join("|");
    });

    const allDocLines = docText.split("\n");
    allDocLines.splice(startLine, range.endLine - startLine + 1, ...updatedLines);
    editor.setValue(allDocLines.join("\n"));
  }

  private attachHandleToTh(table: HTMLTableElement, th: HTMLTableCellElement, colIndex: number): void {
    th.classList.add("knowgrove-table-th");

    if (th.querySelector(".knowgrove-table-col-handle")) return;

    const handle = createDiv({ cls: "knowgrove-table-col-handle" });
    handle.setAttribute("aria-label", "拖动调整列宽，双击自适应");
    handle.dataset.colIndex = colIndex.toString();

    // Block CodeMirror selection & image/text dragstart
    const stopEvent = (event: Event): void => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    handle.addEventListener("mousedown", stopEvent);
    handle.addEventListener("dragstart", stopEvent);
    handle.addEventListener("click", stopEvent);

    handle.addEventListener("pointerdown", (event: PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      try {
        handle.setPointerCapture(event.pointerId);
      } catch {
        // Best effort
      }
      this.startDragging(table, th, colIndex, event.clientX, handle);
    });

    handle.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.resetTableWidths(table);
    });

    th.appendChild(handle);
  }

  private startDragging(
    table: HTMLTableElement,
    th: HTMLTableCellElement,
    colIndex: number,
    clientX: number,
    handle: HTMLElement,
  ): void {
    this.cleanupActiveDrag();

    const ths = Array.from(table.querySelectorAll<HTMLTableCellElement>("thead th, tr:first-child th"));
    const startWidths = ths.map((t) => Math.round(t.getBoundingClientRect().width || 100));
    const totalWidth = startWidths.reduce((sum, w) => sum + w, 0);

    table.classList.add("knowgrove-table-fixed-layout");
    table.style.setProperty("width", `${totalWidth}px`, "important");
    table.style.setProperty("min-width", `${totalWidth}px`, "important");

    for (let i = 0; i < ths.length; i += 1) {
      const t = ths[i];
      const w = startWidths[i] ?? 100;
      if (t) {
        t.style.setProperty("width", `${w}px`, "important");
        t.style.setProperty("min-width", `${w}px`, "important");
        t.style.setProperty("max-width", `${w}px`, "important");
      }
    }

    const thRect = th.getBoundingClientRect();
    const tableRect = table.getBoundingClientRect();

    const guideEl = createDiv({ cls: "knowgrove-table-col-guide" });
    guideEl.style.setProperty("left", `${thRect.right}px`);
    guideEl.style.setProperty("top", `${tableRect.top}px`);
    guideEl.style.setProperty("height", `${tableRect.height}px`);
    document.body.appendChild(guideEl);

    this.activeDrag = {
      table,
      th,
      colIndex,
      startX: clientX,
      startWidths,
      handle,
      guideEl,
    };
  }

  private resetTableWidths(table: HTMLTableElement): void {
    table.style.removeProperty("table-layout");
    table.style.removeProperty("width");
    table.style.removeProperty("min-width");
    table.classList.remove("knowgrove-table-fixed-layout");

    const cells = Array.from(table.querySelectorAll<HTMLTableCellElement>("th, td"));
    for (const cell of cells) {
      cell.style.removeProperty("width");
      cell.style.removeProperty("min-width");
      cell.style.removeProperty("max-width");
    }

    delete table.dataset.knowgroveColWidths;
  }

  private cleanupActiveDrag(): void {
    if (this.activeDrag) {
      this.activeDrag.guideEl.remove();
      this.activeDrag = null;
    }
  }

  private saveTableColumnWidths(table: HTMLTableElement): void {
    const ths = Array.from(table.querySelectorAll<HTMLTableCellElement>("thead th, tr:first-child th"));
    const widths = ths.map((th) => th.style.width || "auto");
    table.dataset.knowgroveColWidths = widths.join(",");
  }
}
