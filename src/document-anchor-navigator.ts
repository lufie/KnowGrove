import type {
  App,
  HeadingCache,
  MarkdownView,
} from "obsidian";
import type KnowGrovePlugin from "./main";
import { translateKnowGroveText } from "./i18n";

export interface HeadingAnchorItem {
  level: number;
  heading: string;
  line: number;
}

export function calculateHeadingIndentation(level: number, minLevel: number): {
  indentPx: number;
  widthPx: number;
} {
  const relativeLevel = Math.max(0, level - minLevel);
  const indentPx = Math.min(relativeLevel * 3, 10);
  const widthPx = Math.max(6, 12 - relativeLevel * 2);
  return { indentPx, widthPx };
}

export function shouldDisplayDocumentAnchors(
  headings?: readonly (HeadingCache | HeadingAnchorItem)[],
): boolean {
  if (!headings || headings.length < 2) return false;
  return true;
}

export function findActiveHeadingIndex(
  headings: readonly { line: number }[],
  currentScrollLine: number,
): number {
  if (!headings.length) return -1;
  let activeIndex = 0;
  for (let i = 0; i < headings.length; i += 1) {
    if (headings[i]!.line <= currentScrollLine + 2) {
      activeIndex = i;
    } else {
      break;
    }
  }
  return activeIndex;
}

export function calculateAnchorRailScrollTop(
  clientY: number,
  railTop: number,
  railHeight: number,
  scrollHeight: number,
  clientHeight: number,
): number {
  const maxScrollTop = Math.max(0, scrollHeight - clientHeight);
  if (maxScrollTop === 0 || railHeight <= 0) return 0;

  const pointerRatio = Math.min(1, Math.max(0, (clientY - railTop) / railHeight));
  return Math.round(pointerRatio * maxScrollTop);
}

export function calculateVisibleAnchorScrollTop(
  currentScrollTop: number,
  railTop: number,
  railBottom: number,
  nodeTop: number,
  nodeBottom: number,
  edgePadding = 8,
): number {
  const visibleTop = railTop + edgePadding;
  const visibleBottom = railBottom - edgePadding;

  if (nodeTop < visibleTop) {
    return Math.max(0, currentScrollTop - (visibleTop - nodeTop));
  }
  if (nodeBottom > visibleBottom) {
    return currentScrollTop + (nodeBottom - visibleBottom);
  }
  return currentScrollTop;
}

export function createCrosshairIcon(parent: HTMLElement): SVGSVGElement {
  const svg = createSvg("svg", {
    attr: {
      width: "14",
      height: "14",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    },
    parent,
  });

  createSvg("circle", {
    attr: { cx: "12", cy: "12", r: "10" },
    parent: svg,
  });

  const lines = [
    { x1: "22", y1: "12", x2: "18", y2: "12" },
    { x1: "6", y1: "12", x2: "2", y2: "12" },
    { x1: "12", y1: "6", x2: "12", y2: "2" },
    { x1: "12", y1: "22", x2: "12", y2: "18" },
  ];

  for (const coords of lines) {
    createSvg("line", {
      attr: coords,
      parent: svg,
    });
  }

  return svg;
}

export class DocumentAnchorWidget {
  private containerEl: HTMLElement;
  private railEl: HTMLElement;
  private previewEl: HTMLElement;
  private actionContainerEl: HTMLElement | null = null;
  private locateBtnEl: HTMLElement | null = null;
  private nodes: HTMLElement[] = [];
  private activeIndex = -1;
  private hoveredIndex = -1;
  private scrollTarget: HTMLElement | null = null;
  private scrollListener: (() => void) | null = null;
  private railMouseMoveListener: ((e: MouseEvent) => void) | null = null;
  private railMouseLeaveListener: (() => void) | null = null;
  private railPointerDownListener: ((e: PointerEvent) => void) | null = null;
  private railClickListener: ((e: MouseEvent) => void) | null = null;
  private rafHandle: number | null = null;
  private resizeRafHandle: number | null = null;
  private railResizeObserver: ResizeObserver | null = null;
  private scrollCorrectionRaf: number | null = null;
  private isNavigating = false;
  private navigationTimer: number | null = null;

  constructor(
    private readonly app: App,
    private readonly view: MarkdownView,
    private headings: HeadingAnchorItem[],
  ) {
    const parent = this.view.contentEl;
    this.containerEl = parent.createDiv({ cls: "knowgrove-anchor-container" });
    this.railEl = this.containerEl.createDiv({ cls: "knowgrove-anchor-rail" });
    this.actionContainerEl = this.containerEl.createDiv({ cls: "knowgrove-anchor-actions" });
    this.locateBtnEl = this.actionContainerEl.createEl("button", {
      cls: "knowgrove-anchor-locate-btn",
      attr: {
        type: "button",
        "aria-label": translateKnowGroveText("在文件列表中定位此文档"),
      },
    });
    createCrosshairIcon(this.locateBtnEl);
    this.previewEl = this.containerEl.createDiv({ cls: "knowgrove-anchor-preview" });

    this.render();
    this.attachScrollListener();
    this.attachHoverListeners();
    this.attachLocateListeners();
    this.attachRailResizeObserver();
  }

  updateHeadings(headings: HeadingAnchorItem[]): void {
    this.headings = headings;
    this.render();
    this.updateActiveIndex();
  }

  private render(): void {
    this.railEl.empty();
    this.railEl.scrollTop = 0;
    this.nodes = [];
    this.activeIndex = -1;

    this.actionContainerEl?.toggleClass("is-hidden", !this.headings.length);
    if (!this.headings.length) return;

    const minLevel = Math.min(...this.headings.map((h) => h.level));

    for (let index = 0; index < this.headings.length; index += 1) {
      const item = this.headings[index]!;
      const { indentPx, widthPx } = calculateHeadingIndentation(item.level, minLevel);

      const node = this.railEl.createDiv({ cls: "knowgrove-anchor-node" });
      node.setCssProps({
        "--anchor-indent": `${indentPx}px`,
        "--anchor-width": `${widthPx}px`,
      });

      this.nodes.push(node);
    }

    this.updateActiveIndex();
  }

  private attachLocateListeners(): void {
    if (!this.locateBtnEl) return;

    this.locateBtnEl.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.revealActiveFileInExplorer();
    });

    this.locateBtnEl.addEventListener("mouseenter", () => {
      if (!this.locateBtnEl) return;
      this.previewEl.setText(translateKnowGroveText("在文件列表中定位此文档"));
      const btnRect = this.locateBtnEl.getBoundingClientRect();
      const containerRect = this.containerEl.getBoundingClientRect();
      const topOffset = btnRect.top - containerRect.top + btnRect.height / 2;
      this.previewEl.setCssProps({
        "--tooltip-top": `${Math.round(topOffset)}px`,
      });
      this.previewEl.addClass("is-visible");
    });

    this.locateBtnEl.addEventListener("mouseleave", () => {
      this.previewEl.removeClass("is-visible");
    });
  }

  private findHeadingIndexAtY(clientY: number): number {
    if (!this.nodes.length) return -1;
    const railRect = this.railEl.getBoundingClientRect();
    const relativeY = clientY - railRect.top;

    let closestIndex = 0;
    let minDistance = Infinity;
    for (let i = 0; i < this.nodes.length; i += 1) {
      const node = this.nodes[i]!;
      const nodeRect = node.getBoundingClientRect();
      const nodeCenterY = nodeRect.top + nodeRect.height / 2 - railRect.top;
      const dist = Math.abs(relativeY - nodeCenterY);
      if (dist < minDistance) {
        minDistance = dist;
        closestIndex = i;
      }
    }
    return closestIndex;
  }

  private attachHoverListeners(): void {
    this.detachHoverListeners();

    this.railMouseMoveListener = (event: MouseEvent) => {
      if (!this.nodes.length) return;
      this.scrollRailToPointer(event.clientY);
      const closestIndex = this.findHeadingIndexAtY(event.clientY);
      this.hoveredIndex = closestIndex;
      this.applyMagnification(closestIndex);
    };

    this.railMouseLeaveListener = () => {
      this.hoveredIndex = -1;
      this.resetMagnification();
      this.ensureActiveNodeVisible();
    };

    this.railPointerDownListener = (event: PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      this.scrollRailToPointer(event.clientY);
      const closestIndex = this.findHeadingIndexAtY(event.clientY);
      const targetHeading = this.headings[closestIndex];
      if (targetHeading) {
        this.scrollToHeading(targetHeading, closestIndex);
      }
    };

    this.railClickListener = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const closestIndex = this.findHeadingIndexAtY(event.clientY);
      const targetHeading = this.headings[closestIndex];
      if (targetHeading) {
        this.scrollToHeading(targetHeading, closestIndex);
      }
    };

    this.railEl.addEventListener("mousemove", this.railMouseMoveListener, { passive: true });
    this.railEl.addEventListener("mouseleave", this.railMouseLeaveListener, { passive: true });
    this.railEl.addEventListener("pointerdown", this.railPointerDownListener);
    this.railEl.addEventListener("click", this.railClickListener);
  }

  private scrollRailToPointer(clientY: number): void {
    const railRect = this.railEl.getBoundingClientRect();
    const nextScrollTop = calculateAnchorRailScrollTop(
      clientY,
      railRect.top,
      railRect.height,
      this.railEl.scrollHeight,
      this.railEl.clientHeight,
    );
    if (Math.abs(this.railEl.scrollTop - nextScrollTop) > 0.5) {
      this.railEl.scrollTop = nextScrollTop;
    }
  }

  private ensureActiveNodeVisible(): void {
    if (this.hoveredIndex >= 0 || this.activeIndex < 0) return;
    const node = this.nodes[this.activeIndex];
    if (!node) return;

    if (this.railEl.scrollHeight <= this.railEl.clientHeight) {
      this.railEl.scrollTop = 0;
      return;
    }

    const railRect = this.railEl.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    this.railEl.scrollTop = calculateVisibleAnchorScrollTop(
      this.railEl.scrollTop,
      railRect.top,
      railRect.bottom,
      nodeRect.top,
      nodeRect.bottom,
    );
  }

  private applyMagnification(centerIndex: number): void {
    const minLevel = Math.min(...this.headings.map((h) => h.level));
    const centerNode = this.nodes[centerIndex];
    const centerItem = this.headings[centerIndex];

    if (centerNode && centerItem) {
      this.previewEl.setText(centerItem.heading);
      const nodeRect = centerNode.getBoundingClientRect();
      const containerRect = this.containerEl.getBoundingClientRect();
      const topOffset = nodeRect.top - containerRect.top + nodeRect.height / 2;
      this.previewEl.setCssProps({
        "--tooltip-top": `${Math.round(topOffset)}px`,
      });
      this.previewEl.addClass("is-visible");
    }

    for (let i = 0; i < this.nodes.length; i += 1) {
      const node = this.nodes[i]!;
      const item = this.headings[i]!;
      const { widthPx } = calculateHeadingIndentation(item.level, minLevel);
      const distance = Math.abs(i - centerIndex);

      if (distance === 0) {
        node.addClass("is-hovered");
        node.removeClass("is-neighbor-1", "is-neighbor-2", "is-neighbor-3");
        node.setCssProps({
          "--anchor-width": `${widthPx + 14}px`,
        });
      } else if (distance === 1) {
        node.addClass("is-neighbor-1");
        node.removeClass("is-hovered", "is-neighbor-2", "is-neighbor-3");
        node.setCssProps({
          "--anchor-width": `${widthPx + 9}px`,
        });
      } else if (distance === 2) {
        node.addClass("is-neighbor-2");
        node.removeClass("is-hovered", "is-neighbor-1", "is-neighbor-3");
        node.setCssProps({
          "--anchor-width": `${widthPx + 5}px`,
        });
      } else if (distance === 3) {
        node.addClass("is-neighbor-3");
        node.removeClass("is-hovered", "is-neighbor-1", "is-neighbor-2");
        node.setCssProps({
          "--anchor-width": `${widthPx + 2}px`,
        });
      } else {
        node.removeClass("is-hovered", "is-neighbor-1", "is-neighbor-2", "is-neighbor-3");
        node.setCssProps({
          "--anchor-width": `${widthPx}px`,
        });
      }
    }
  }

  private resetMagnification(): void {
    this.previewEl.removeClass("is-visible");
    const minLevel = Math.min(...this.headings.map((h) => h.level));
    for (let i = 0; i < this.nodes.length; i += 1) {
      const node = this.nodes[i]!;
      const item = this.headings[i]!;
      const { widthPx } = calculateHeadingIndentation(item.level, minLevel);
      node.removeClass("is-hovered", "is-neighbor-1", "is-neighbor-2", "is-neighbor-3");
      node.setCssProps({
        "--anchor-width": `${widthPx}px`,
      });
    }
  }

  private detachHoverListeners(): void {
    if (this.railMouseMoveListener) {
      this.railEl.removeEventListener("mousemove", this.railMouseMoveListener);
      this.railMouseMoveListener = null;
    }
    if (this.railMouseLeaveListener) {
      this.railEl.removeEventListener("mouseleave", this.railMouseLeaveListener);
      this.railMouseLeaveListener = null;
    }
    if (this.railPointerDownListener) {
      this.railEl.removeEventListener("pointerdown", this.railPointerDownListener);
      this.railPointerDownListener = null;
    }
    if (this.railClickListener) {
      this.railEl.removeEventListener("click", this.railClickListener);
      this.railClickListener = null;
    }
  }

  private scrollToHeading(item: HeadingAnchorItem, index: number): void {
    if (this.scrollCorrectionRaf !== null) {
      window.cancelAnimationFrame(this.scrollCorrectionRaf);
      this.scrollCorrectionRaf = null;
    }

    this.isNavigating = true;
    if (this.navigationTimer !== null) {
      window.clearTimeout(this.navigationTimer);
    }
    this.navigationTimer = window.setTimeout(() => {
      this.isNavigating = false;
    }, 250);

    if (this.activeIndex >= 0 && this.nodes[this.activeIndex]) {
      this.nodes[this.activeIndex]?.removeClass("is-active");
    }
    this.activeIndex = index;
    if (this.nodes[index]) {
      this.nodes[index]?.addClass("is-active");
    }

    const targetTopOffsetPx = 65; // Anchors heading at ~3rd line from the top
    const mode = this.view.getMode();

    if (mode === "source") {
      const editor = this.view.editor;
      const cm = (editor as unknown as { cm?: {
        state?: { doc?: { lines: number; line: (n: number) => { from: number } } };
        lineBlockAt?: (pos: number) => { top: number };
        coordsAtPos?: (pos: number) => { top: number } | null;
        scrollDOM?: HTMLElement;
      } })?.cm;

      if (cm?.state?.doc && cm.lineBlockAt && cm.scrollDOM) {
        const doc = cm.state.doc;
        const lineNum = Math.min(Math.max(1, item.line + 1), doc.lines);
        const lineObj = doc.line(lineNum);
        const linePos = lineObj.from;

        // Phase 1: Jump to estimated block top position
        const block = cm.lineBlockAt(linePos);
        const initialScrollTop = Math.max(0, block.top - targetTopOffsetPx);
        cm.scrollDOM.scrollTop = initialScrollTop;
        editor.setCursor({ line: item.line, ch: 0 });

        // Phase 2: Immediate physical visual coordinate correction if already rendered
        if (cm.coordsAtPos) {
          const scrollerRect = cm.scrollDOM.getBoundingClientRect();
          const coords = cm.coordsAtPos(linePos);
          if (coords) {
            const currentOffset = coords.top - scrollerRect.top;
            const delta = currentOffset - targetTopOffsetPx;
            if (Math.abs(delta) > 1) {
              cm.scrollDOM.scrollTop += delta;
            }
          }
        }

        // Phase 3: Multi-frame visual convergence for long-distance jumps across unrendered virtual lines
        let attempts = 0;
        const convergeVisualCoordinate = () => {
          try {
            if (cm?.coordsAtPos && cm.scrollDOM) {
              const scrollerRect = cm.scrollDOM.getBoundingClientRect();
              const coords = cm.coordsAtPos(linePos);
              if (coords) {
                const currentOffset = coords.top - scrollerRect.top;
                const delta = currentOffset - targetTopOffsetPx;
                if (Math.abs(delta) > 1) {
                  cm.scrollDOM.scrollTop += delta;
                  attempts += 1;
                  if (attempts < 3) {
                    this.scrollCorrectionRaf = window.requestAnimationFrame(convergeVisualCoordinate);
                    return;
                  }
                }
              }
            }
          } catch {
            // Ignore layout race
          }
          this.scrollCorrectionRaf = null;
        };

        this.scrollCorrectionRaf = window.requestAnimationFrame(convergeVisualCoordinate);
      } else {
        editor.scrollIntoView(
          { from: { line: item.line, ch: 0 }, to: { line: item.line, ch: 0 } },
          false,
        );
      }
    } else if (mode === "preview") {
      const scroller = this.view.contentEl.querySelector(".markdown-preview-view");
      if (scroller && "scrollTop" in scroller) {
        const scrollerEl = scroller as HTMLElement;
        const previewHeadings = scrollerEl.querySelectorAll("h1, h2, h3, h4, h5, h6");
        let matchedEl: HTMLElement | null = null;
        for (let i = 0; i < previewHeadings.length; i += 1) {
          const el = previewHeadings[i];
          if (el && el.textContent?.trim().includes(item.heading.trim())) {
            matchedEl = el as HTMLElement;
            break;
          }
        }
        if (matchedEl) {
          const scrollerRect = scrollerEl.getBoundingClientRect();
          const headingRect = matchedEl.getBoundingClientRect();
          const targetOffset = headingRect.top - scrollerRect.top + scrollerEl.scrollTop - targetTopOffsetPx;
          scrollerEl.scrollTop = Math.max(0, targetOffset);
        } else {
          this.view.previewMode.applyScroll(item.line);
        }
      }
    }
  }

  private attachScrollListener(): void {
    this.detachScrollListener();
    const scroller = this.view.contentEl.querySelector(".cm-scroller")
      || this.view.contentEl.querySelector(".markdown-preview-view");

    if (scroller && "scrollTop" in scroller) {
      this.scrollTarget = scroller as HTMLElement;
      this.scrollListener = () => {
        if (this.rafHandle !== null) window.cancelAnimationFrame(this.rafHandle);
        this.rafHandle = window.requestAnimationFrame(() => {
          this.rafHandle = null;
          this.updateActiveIndex();
        });
      };
      this.scrollTarget.addEventListener("scroll", this.scrollListener, { passive: true });
      this.updateActiveIndex();
    }
  }

  private attachRailResizeObserver(): void {
    if (typeof ResizeObserver === "undefined") return;
    this.railResizeObserver = new ResizeObserver(() => {
      if (this.resizeRafHandle !== null) window.cancelAnimationFrame(this.resizeRafHandle);
      this.resizeRafHandle = window.requestAnimationFrame(() => {
        this.resizeRafHandle = null;
        this.ensureActiveNodeVisible();
      });
    });
    this.railResizeObserver.observe(this.railEl);
  }

  private detachRailResizeObserver(): void {
    this.railResizeObserver?.disconnect();
    this.railResizeObserver = null;
    if (this.resizeRafHandle !== null) {
      window.cancelAnimationFrame(this.resizeRafHandle);
      this.resizeRafHandle = null;
    }
  }

  private updateActiveIndex(): void {
    if (this.isNavigating) return;
    if (!this.headings.length || !this.nodes.length) return;
    const currentLine = this.getCurrentScrollLine();
    const active = findActiveHeadingIndex(this.headings, currentLine);

    if (active !== this.activeIndex) {
      if (this.activeIndex >= 0 && this.nodes[this.activeIndex]) {
        this.nodes[this.activeIndex]?.removeClass("is-active");
      }
      this.activeIndex = active;
      if (this.activeIndex >= 0 && this.nodes[this.activeIndex]) {
        this.nodes[this.activeIndex]?.addClass("is-active");
      }
      this.ensureActiveNodeVisible();
    }
  }

  private getCurrentScrollLine(): number {
    const cm = (this.view.editor as unknown as { cm?: {
      scrollDOM?: HTMLElement;
      state?: { doc?: { lineAt: (pos: number) => { number: number } } };
      lineBlockAtHeight?: (height: number) => { from: number };
    } })?.cm;

    if (cm?.scrollDOM && cm.state?.doc && cm.lineBlockAtHeight) {
      try {
        const scrollTop = cm.scrollDOM.scrollTop;
        const block = cm.lineBlockAtHeight(scrollTop + 75);
        const line = cm.state.doc.lineAt(block.from);
        return line.number - 1;
      } catch {
        // Fallback to proportional scroll
      }
    }

    if (this.scrollTarget) {
      const { scrollTop, scrollHeight, clientHeight } = this.scrollTarget;
      const maxScroll = Math.max(1, scrollHeight - clientHeight);
      const ratio = Math.min(1, Math.max(0, scrollTop / maxScroll));
      const lastLine = this.headings[this.headings.length - 1]?.line ?? 100;
      return Math.round(ratio * lastLine);
    }
    return 0;
  }

  private detachScrollListener(): void {
    if (this.rafHandle !== null) {
      window.cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
    if (this.scrollTarget && this.scrollListener) {
      this.scrollTarget.removeEventListener("scroll", this.scrollListener);
      this.scrollTarget = null;
      this.scrollListener = null;
    }
  }

  private revealActiveFileInExplorer(): void {
    const file = this.view.file;
    if (!file) return;

    if (this.locateBtnEl) {
      this.locateBtnEl.addClass("is-active");
      window.setTimeout(() => {
        this.locateBtnEl?.removeClass("is-active");
      }, 300);
    }

    const fileExplorers = this.app.workspace.getLeavesOfType("file-explorer");
    if (fileExplorers.length > 0) {
      const feLeaf = fileExplorers[0];
      if (feLeaf) {
        void this.app.workspace.revealLeaf(feLeaf);
        const feView = feLeaf.view as unknown as {
          revealInFolder?: (f: unknown) => void;
          fileItems?: Record<string, { selfEl?: HTMLElement; titleEl?: HTMLElement }>;
        };

        if (typeof feView?.revealInFolder === "function") {
          feView.revealInFolder(file);

          window.setTimeout(() => {
            const item = feView.fileItems?.[file.path];
            const targetEl = item?.selfEl || item?.titleEl;
            if (targetEl) {
              targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
              targetEl.removeClass("knowgrove-file-reveal-pulse");
              void targetEl.offsetWidth;
              targetEl.addClass("knowgrove-file-reveal-pulse");
              window.setTimeout(() => {
                targetEl.removeClass("knowgrove-file-reveal-pulse");
              }, 2000);
            }
          }, 80);
          return;
        }
      }
    }

    const appWithCommands = this.app as unknown as {
      commands?: { executeCommandById?: (id: string) => void };
    };
    appWithCommands.commands?.executeCommandById?.("file-explorer:reveal-active-file");
  }

  destroy(): void {
    this.detachScrollListener();
    this.detachRailResizeObserver();
    this.detachHoverListeners();
    this.containerEl.remove();
    this.nodes = [];
  }
}

export class DocumentAnchorManager {
  private activeWidgets = new Map<MarkdownView, DocumentAnchorWidget>();

  constructor(private readonly plugin: KnowGrovePlugin) {}

  updateView(view: MarkdownView): void {
    if (!this.plugin.settings.enableDocumentAnchors) {
      this.destroyView(view);
      return;
    }

    const file = view.file;
    if (!file || file.extension !== "md") {
      this.destroyView(view);
      return;
    }

    const cache = this.plugin.app.metadataCache.getFileCache(file);
    const rawHeadings = cache?.headings;

    if (!shouldDisplayDocumentAnchors(rawHeadings)) {
      this.destroyView(view);
      return;
    }

    const headings: HeadingAnchorItem[] = (rawHeadings ?? []).map((h) => ({
      level: h.level,
      heading: h.heading,
      line: h.position.start.line,
    }));

    const existing = this.activeWidgets.get(view);
    if (existing) {
      existing.updateHeadings(headings);
    } else {
      const widget = new DocumentAnchorWidget(this.plugin.app, view, headings);
      this.activeWidgets.set(view, widget);
    }
  }

  refreshAll(): void {
    const leaves = this.plugin.app.workspace.getLeavesOfType("markdown");
    const activeViews = new Set<MarkdownView>();

    for (const leaf of leaves) {
      if (leaf.view && leaf.view.getViewType() === "markdown") {
        const markdownView = leaf.view as MarkdownView;
        activeViews.add(markdownView);
        this.updateView(markdownView);
      }
    }

    for (const [view] of this.activeWidgets) {
      if (!activeViews.has(view)) {
        this.destroyView(view);
      }
    }
  }

  destroyView(view: MarkdownView): void {
    const widget = this.activeWidgets.get(view);
    if (widget) {
      widget.destroy();
      this.activeWidgets.delete(view);
    }
  }

  destroyAll(): void {
    for (const [, widget] of this.activeWidgets) {
      widget.destroy();
    }
    this.activeWidgets.clear();
  }
}
