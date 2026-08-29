import { MarkdownView } from "obsidian";
import type KnowGrovePlugin from "./main";
import { translateKnowGroveText } from "./i18n";
import {
  buildImageMoveChanges,
  clampResize,
  findImageOccurrence,
  isOffsetInsideFencedCode,
  parseImageOccurrences,
  updateImageSyntax,
  type ImageAlignment,
  type ImageOccurrence,
  type TextChange,
} from "./image-layout-core";

interface CodeMirrorEditorView {
  posAtCoords(coords: { x: number; y: number }): number | null;
  posAtDOM(node: Node): number;
  dispatch(spec: {
    changes: Array<{ from: number; to?: number; insert?: string }>;
    scrollIntoView?: boolean;
    userEvent?: string;
  }): void;
}

type ResizeHandle = "nw" | "ne" | "se" | "sw" | "e" | "w" | "n" | "s";
type DropPlacement = "line-before" | "line-after" | "image-before" | "image-after";

interface PendingReorderState {
  embedEl: HTMLElement;
  imgEl: HTMLImageElement;
  pointerId: number;
  startX: number;
  startY: number;
}

interface ImageResizeState {
  embedEl: HTMLElement;
  imgEl: HTMLImageElement;
  view: MarkdownView;
  occurrence: ImageOccurrence;
  handleType: ResizeHandle;
  pointerId: number;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
  currentWidth: number;
  currentHeight: number;
  aspectRatio: number;
  maxWidth: number;
  scroller: HTMLElement | null;
  lockedScrollTop: number;
  originalEmbedStyle: string;
  originalImageStyle: string;
  originalWrapperStyle: string | null;
}

interface ImageReorderState {
  embedEl: HTMLElement;
  imgEl: HTMLImageElement;
  view: MarkdownView;
  occurrence: ImageOccurrence;
  pointerId: number;
  ghostEl: HTMLElement;
  dropIndicator: HTMLElement;
  targetOffset: number;
  placement: DropPlacement;
  targetImage: ImageOccurrence | null;
  scroller: HTMLElement | null;
  lockedScrollTop: number;
}

interface DocumentImageCache {
  text: string;
  occurrences: ImageOccurrence[];
}

const DRAG_THRESHOLD_PX = 4;
const MIN_IMAGE_WIDTH = 60;
const MIN_IMAGE_HEIGHT = 40;

export class ImageLayoutEnhancer {
  private readonly ownerDocument: Document;
  private readonly workspaceRoot: HTMLElement;
  private adornerEl: HTMLElement | null = null;
  private badgeEl: HTMLElement | null = null;
  private currentTarget: { embedEl: HTMLElement; imgEl: HTMLImageElement } | null = null;
  private pendingReorder: PendingReorderState | null = null;
  private activeResize: ImageResizeState | null = null;
  private activeReorder: ImageReorderState | null = null;
  private hideTimeout: number | null = null;
  private observer: MutationObserver | null = null;
  private mutationRaf: number | null = null;
  private geometryRaf: number | null = null;
  private interactionRaf: number | null = null;
  private pendingMoveEvent: PointerEvent | null = null;
  private isSelected = false;
  private readonly boundImages = new WeakSet<HTMLImageElement>();
  private readonly imageCache = new WeakMap<MarkdownView, DocumentImageCache>();

  private readonly onPointerOver = (event: PointerEvent): void => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest(".knowgrove-image-adorner")) {
      this.cancelHideAdorner();
      return;
    }
    const embedEl = target.closest<HTMLElement>(".image-embed");
    const imgEl = embedEl?.querySelector<HTMLImageElement>("img");
    if (!embedEl || !imgEl || !this.workspaceRoot.contains(embedEl)) return;
    this.enhanceImageEmbed(embedEl);
    this.cancelHideAdorner();
    this.attachAdornerToImage(embedEl, imgEl);
  };

  private readonly onPointerOut = (event: PointerEvent): void => {
    if (this.activeResize || this.activeReorder || this.pendingReorder || this.isSelected) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest(".image-embed, .knowgrove-image-adorner")) this.scheduleHideAdorner();
  };

  private readonly onWorkspacePointerDown = (event: PointerEvent): void => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (!target.closest(".knowgrove-image-adorner, .image-embed")) {
      this.isSelected = false;
      this.pendingReorder = null;
      this.hideAdorner(true);
    }
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (this.pendingReorder && event.pointerId === this.pendingReorder.pointerId) {
      const deltaX = event.clientX - this.pendingReorder.startX;
      const deltaY = event.clientY - this.pendingReorder.startY;
      if (Math.hypot(deltaX, deltaY) >= DRAG_THRESHOLD_PX) {
        const pending = this.pendingReorder;
        this.pendingReorder = null;
        try {
          this.startReorderDrag(pending.embedEl, pending.imgEl, event);
        } catch (error) {
          this.abortImageReorder(error);
        }
      }
    }

    if (!this.activeResize && !this.activeReorder) return;
    event.preventDefault();
    event.stopPropagation();
    this.pendingMoveEvent = event;
    if (this.interactionRaf !== null) return;
    this.interactionRaf = this.ownerDocument.defaultView?.requestAnimationFrame(() => {
      this.interactionRaf = null;
      const latest = this.pendingMoveEvent;
      this.pendingMoveEvent = null;
      if (!latest) return;
      if (this.activeResize && latest.pointerId === this.activeResize.pointerId) {
        this.onResizeMove(latest.clientX, latest.clientY, latest.shiftKey);
      } else if (this.activeReorder && latest.pointerId === this.activeReorder.pointerId) {
        try {
          this.onReorderMove(latest.clientX, latest.clientY);
        } catch (error) {
          this.abortImageReorder(error);
        }
      }
    }) ?? null;
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (this.pendingReorder?.pointerId === event.pointerId) this.pendingReorder = null;
    if (this.activeResize?.pointerId === event.pointerId) {
      event.preventDefault();
      event.stopPropagation();
      this.finishResize(false);
      return;
    }
    if (this.activeReorder?.pointerId === event.pointerId) {
      event.preventDefault();
      event.stopPropagation();
      this.finishReorder(false);
    }
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (this.pendingReorder?.pointerId === event.pointerId) this.pendingReorder = null;
    if (this.activeResize?.pointerId === event.pointerId) this.finishResize(true);
    if (this.activeReorder?.pointerId === event.pointerId) this.finishReorder(true);
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    if (this.activeResize) {
      event.preventDefault();
      this.finishResize(true);
    } else if (this.activeReorder) {
      event.preventDefault();
      this.finishReorder(true);
    } else if (this.pendingReorder) {
      this.pendingReorder = null;
    }
  };

  private readonly onScrollOrResize = (): void => {
    if (!this.currentTarget || this.activeResize || this.activeReorder) return;
    this.scheduleAdornerGeometryUpdate();
  };

  constructor(private readonly plugin: KnowGrovePlugin) {
    this.workspaceRoot = plugin.app.workspace.containerEl;
    this.ownerDocument = this.workspaceRoot.ownerDocument;
    this.createRootAdorner();
    this.setupGlobalListeners();
    this.startObserving();
  }

  destroy(): void {
    this.stopObserving();
    this.cancelAnimationFrames();
    this.finishResize(true);
    this.finishReorder(true);
    this.pendingReorder = null;
    this.removeGlobalListeners();
    this.cancelHideAdorner();
    this.currentTarget = null;
    this.adornerEl?.remove();
    this.adornerEl = null;
    this.badgeEl = null;
    this.ownerDocument.body.classList.remove("knowgrove-image-dragging", "knowgrove-reorder-dragging");
    this.ownerDocument.querySelectorAll(".knowgrove-image-drop-indicator, .knowgrove-image-drag-ghost")
      .forEach((element) => element.remove());
  }

  private createRootAdorner(): void {
    if (this.adornerEl) return;
    const adorner = this.ownerDocument.body.createDiv({
      cls: "knowgrove-image-adorner",
      attr: { "aria-hidden": "true" },
    });

    const handleDefs: Array<{ type: ResizeHandle; cls: string }> = [
      { type: "nw", cls: "knowgrove-adorner-handle-nw" },
      { type: "ne", cls: "knowgrove-adorner-handle-ne" },
      { type: "se", cls: "knowgrove-adorner-handle-se" },
      { type: "sw", cls: "knowgrove-adorner-handle-sw" },
      { type: "e", cls: "knowgrove-adorner-handle-e" },
      { type: "w", cls: "knowgrove-adorner-handle-w" },
      { type: "n", cls: "knowgrove-adorner-handle-n" },
      { type: "s", cls: "knowgrove-adorner-handle-s" },
    ];
    for (const definition of handleDefs) {
      const handle = adorner.createDiv({ cls: `knowgrove-adorner-handle ${definition.cls}` });
      handle.dataset.handleType = definition.type;
      handle.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        try {
          handle.setPointerCapture(event.pointerId);
        } catch {
          // Pointer capture is best effort across Electron versions.
        }
        this.startResize(definition.type, event, handle);
      });
    }

    const toolbar = adorner.createDiv({ cls: "knowgrove-adorner-toolbar" });
    const createButton = (text: string, title: string, action: () => void): HTMLButtonElement => {
      const button = toolbar.createEl("button", {
        cls: "knowgrove-adorner-btn",
        text,
        attr: { title },
      });
      button.addEventListener("pointerdown", (event) => event.stopPropagation());
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        action();
      });
      return button;
    };

    createButton("⫷ 靠左", "靠左独占排版（文字上下分布，不环绕）", () => this.applyAlignment("left"));
    createButton("≡ 居中", "居中独占排版", () => this.applyAlignment("center"));
    createButton("⫸ 靠右", "靠右独占排版", () => this.applyAlignment("right"));
    toolbar.createSpan({ cls: "knowgrove-adorner-sep" });
    createButton("50%", "设为当前编辑区宽度的 50%", () => this.applyPresetWidth(0.5));
    createButton("100%", "设为当前编辑区最大可用宽度", () => this.applyPresetWidth(1));
    createButton("↺ 还原", "还原默认尺寸与对齐", () => this.resetCurrentImage());
    toolbar.createSpan({ cls: "knowgrove-adorner-sep" });
    createButton(`✦ ${translateKnowGroveText("转文字")}`, translateKnowGroveText("AI 图片转文字"), () => {
      if (!this.currentTarget) return;
      const resolved = this.resolveOccurrence(this.currentTarget.embedEl, this.currentTarget.imgEl);
      if (resolved?.view.file) this.plugin.confirmImageToText(resolved.view.file, resolved.occurrence);
    });
    const badge = adorner.createDiv({ cls: "knowgrove-adorner-badge" });
    this.badgeEl = badge;

    adorner.addEventListener("pointerenter", () => this.cancelHideAdorner());
    adorner.addEventListener("pointerleave", () => this.scheduleHideAdorner());
    this.adornerEl = adorner;
  }

  private setupGlobalListeners(): void {
    this.workspaceRoot.addEventListener("pointerover", this.onPointerOver, { capture: true, passive: true });
    this.workspaceRoot.addEventListener("pointerout", this.onPointerOut, { capture: true, passive: true });
    this.workspaceRoot.addEventListener("pointerdown", this.onWorkspacePointerDown, { capture: true, passive: true });
    this.workspaceRoot.addEventListener("scroll", this.onScrollOrResize, { capture: true, passive: true });
    this.ownerDocument.defaultView?.addEventListener("resize", this.onScrollOrResize, { passive: true });
    this.ownerDocument.defaultView?.addEventListener("pointermove", this.onPointerMove, { capture: true, passive: false });
    this.ownerDocument.defaultView?.addEventListener("pointerup", this.onPointerUp, { capture: true, passive: false });
    this.ownerDocument.defaultView?.addEventListener("pointercancel", this.onPointerCancel, { capture: true, passive: true });
    this.ownerDocument.addEventListener("keydown", this.onKeyDown, { capture: true });
  }

  private removeGlobalListeners(): void {
    this.workspaceRoot.removeEventListener("pointerover", this.onPointerOver, true);
    this.workspaceRoot.removeEventListener("pointerout", this.onPointerOut, true);
    this.workspaceRoot.removeEventListener("pointerdown", this.onWorkspacePointerDown, true);
    this.workspaceRoot.removeEventListener("scroll", this.onScrollOrResize, true);
    this.ownerDocument.defaultView?.removeEventListener("resize", this.onScrollOrResize);
    this.ownerDocument.defaultView?.removeEventListener("pointermove", this.onPointerMove, true);
    this.ownerDocument.defaultView?.removeEventListener("pointerup", this.onPointerUp, true);
    this.ownerDocument.defaultView?.removeEventListener("pointercancel", this.onPointerCancel, true);
    this.ownerDocument.removeEventListener("keydown", this.onKeyDown, true);
  }

  private startObserving(): void {
    this.scanAndEnhanceImages();
    this.observer = new MutationObserver((mutations) => {
      if (this.mutationRaf !== null) return;
      const affected = new Set<Element>();
      for (const mutation of mutations) {
        const target = mutation.target.instanceOf(Element) ? mutation.target : mutation.target.parentElement;
        const container = target?.closest(".markdown-source-view, .markdown-preview-view");
        if (container) affected.add(container);
        for (const node of Array.from(mutation.addedNodes)) {
          if (!node.instanceOf(Element)) continue;
          const ownContainer = node.matches(".markdown-source-view, .markdown-preview-view")
            ? node
            : node.closest(".markdown-source-view, .markdown-preview-view");
          if (ownContainer) affected.add(ownContainer);
          node.querySelectorAll(".markdown-source-view, .markdown-preview-view").forEach((element) => affected.add(element));
        }
      }
      if (!affected.size) return;
      this.mutationRaf = this.ownerDocument.defaultView?.requestAnimationFrame(() => {
        this.mutationRaf = null;
        for (const container of affected) this.scanContainer(container);
      }) ?? null;
    });
    this.observer.observe(this.workspaceRoot, { childList: true, subtree: true });
  }

  private stopObserving(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  public scanAndEnhanceImages(): void {
    this.workspaceRoot.querySelectorAll(".markdown-source-view, .markdown-preview-view")
      .forEach((container) => this.scanContainer(container));
  }

  private scanContainer(container: Element): void {
    container.querySelectorAll<HTMLElement>(".image-embed").forEach((embed) => this.enhanceImageEmbed(embed));
    this.detectAndGroupImageRows(container);
  }

  private enhanceImageEmbed(embedEl: HTMLElement): void {
    const imgEl = embedEl.querySelector<HTMLImageElement>("img");
    if (!imgEl) return;
    embedEl.classList.add("knowgrove-enhanced-image-embed");
    imgEl.setAttribute("draggable", "false");

    const resolved = this.resolveOccurrence(embedEl, imgEl);
    embedEl.classList.remove("knowgrove-align-left", "knowgrove-align-center", "knowgrove-align-right");
    if (resolved?.occurrence.alignment) embedEl.classList.add(`knowgrove-align-${resolved.occurrence.alignment}`);
    const width = resolved?.occurrence.width ?? Number.parseInt(imgEl.getAttribute("width") ?? "", 10);
    const height = resolved?.occurrence.height;
    if (Number.isFinite(width) && width > 0) {
      this.applyImageDimensionsToDom(embedEl, imgEl, width, height);
    }

    if (this.boundImages.has(imgEl)) return;
    this.boundImages.add(imgEl);
    imgEl.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      this.cancelHideAdorner();
      this.attachAdornerToImage(embedEl, imgEl);
      this.isSelected = true;
      event.preventDefault();
      event.stopPropagation();
      this.beginPendingReorder(embedEl, imgEl, event);
    });
  }

  private beginPendingReorder(embedEl: HTMLElement, imgEl: HTMLImageElement, event: PointerEvent): void {
    this.pendingReorder = {
      embedEl,
      imgEl,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
    try {
      (event.currentTarget as Element | null)?.setPointerCapture?.(event.pointerId);
    } catch {
      // Best effort.
    }
  }

  private attachAdornerToImage(embedEl: HTMLElement, imgEl: HTMLImageElement): void {
    this.currentTarget = { embedEl, imgEl };
    this.createRootAdorner();
    this.updateAdornerPosition();
    this.adornerEl?.classList.add("is-visible");
  }

  private scheduleAdornerGeometryUpdate(): void {
    if (this.geometryRaf !== null) return;
    this.geometryRaf = this.ownerDocument.defaultView?.requestAnimationFrame(() => {
      this.geometryRaf = null;
      this.updateAdornerPosition();
    }) ?? null;
  }

  private updateAdornerPosition(): void {
    if (!this.adornerEl || !this.currentTarget) return;
    const { imgEl } = this.currentTarget;
    if (!imgEl.isConnected) {
      this.hideAdorner(true);
      return;
    }
    const rect = imgEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      this.hideAdorner(true);
      return;
    }
    this.adornerEl.style.left = `${rect.left}px`;
    this.adornerEl.style.top = `${rect.top}px`;
    this.adornerEl.style.width = `${rect.width}px`;
    this.adornerEl.style.height = `${rect.height}px`;
  }

  private scheduleHideAdorner(): void {
    this.cancelHideAdorner();
    this.hideTimeout = this.ownerDocument.defaultView?.setTimeout(() => this.hideAdorner(false), 220) ?? null;
  }

  private cancelHideAdorner(): void {
    if (this.hideTimeout !== null) this.ownerDocument.defaultView?.clearTimeout(this.hideTimeout);
    this.hideTimeout = null;
  }

  private hideAdorner(force: boolean): void {
    if (!force && (this.activeResize || this.activeReorder || this.isSelected)) return;
    this.adornerEl?.classList.remove("is-visible", "is-resizing");
    if (force) this.currentTarget = null;
  }

  private startResize(handleType: ResizeHandle, event: PointerEvent, _handle: HTMLElement): void {
    if (!this.currentTarget || !this.adornerEl) return;
    const { embedEl, imgEl } = this.currentTarget;
    const resolved = this.resolveOccurrence(embedEl, imgEl);
    if (!resolved) return;
    const rect = imgEl.getBoundingClientRect();
    const parentWidth = this.availableContentWidth(embedEl);
    const naturalWidth = imgEl.naturalWidth || rect.width || 300;
    const naturalHeight = imgEl.naturalHeight || rect.height || 200;
    const wrapper = embedEl.querySelector<HTMLElement>(".image-wrapper");
    const scroller = this.findScroller(resolved.view);
    const startWidth = Math.round(rect.width);
    const startHeight = Math.round(rect.height);
    this.activeResize = {
      embedEl,
      imgEl,
      view: resolved.view,
      occurrence: resolved.occurrence,
      handleType,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startWidth,
      startHeight,
      currentWidth: startWidth,
      currentHeight: startHeight,
      aspectRatio: naturalWidth / Math.max(1, naturalHeight),
      maxWidth: parentWidth,
      scroller,
      lockedScrollTop: scroller?.scrollTop ?? 0,
      originalEmbedStyle: embedEl.getAttribute("style") ?? "",
      originalImageStyle: imgEl.getAttribute("style") ?? "",
      originalWrapperStyle: wrapper?.getAttribute("style") ?? null,
    };
    scroller?.classList.add("knowgrove-scroll-anchor-lock");
    this.adornerEl.classList.add("is-resizing", "is-visible");
    this.ownerDocument.body.classList.add("knowgrove-image-dragging");
    if (this.badgeEl) {
      this.badgeEl.textContent = `${startWidth} × ${startHeight} px`;
      this.badgeEl.classList.add("is-visible");
    }
  }

  private onResizeMove(clientX: number, clientY: number, freeResize: boolean): void {
    const state = this.activeResize;
    if (!state || !this.adornerEl) return;
    const dx = clientX - state.startX;
    const dy = clientY - state.startY;
    const horizontalSign = state.handleType.includes("w") ? -1 : 1;
    const verticalSign = state.handleType.includes("n") ? -1 : 1;
    const changesWidth = /[ew]/.test(state.handleType);
    const changesHeight = /[ns]/.test(state.handleType);

    let width = state.startWidth;
    let height = state.startHeight;
    if (freeResize) {
      if (changesWidth) width = state.startWidth + horizontalSign * dx;
      if (changesHeight) height = state.startHeight + verticalSign * dy;
    } else if (changesWidth && changesHeight) {
      const candidateWidth = state.startWidth + horizontalSign * dx;
      const candidateHeight = state.startHeight + verticalSign * dy;
      const widthFromHeight = candidateHeight * state.aspectRatio;
      width = Math.abs(candidateWidth - state.startWidth) >= Math.abs(widthFromHeight - state.startWidth)
        ? candidateWidth
        : widthFromHeight;
      height = width / state.aspectRatio;
    } else if (changesWidth) {
      width = state.startWidth + horizontalSign * dx;
      height = width / state.aspectRatio;
    } else {
      height = state.startHeight + verticalSign * dy;
      width = height * state.aspectRatio;
    }

    const clamped = clampResize(width, height, state.maxWidth, MIN_IMAGE_WIDTH, MIN_IMAGE_HEIGHT);
    state.currentWidth = clamped.width;
    state.currentHeight = clamped.height;
    this.applyImageDimensionsToDom(state.embedEl, state.imgEl, clamped.width, clamped.height);
    this.adornerEl.style.width = `${clamped.width}px`;
    this.adornerEl.style.height = `${clamped.height}px`;
    if (this.badgeEl) this.badgeEl.textContent = `${clamped.width} × ${clamped.height} px`;
    this.restoreLockedScroll(state.scroller, state.lockedScrollTop);
  }

  private finishResize(cancelled: boolean): void {
    const state = this.activeResize;
    if (!state) return;
    this.activeResize = null;
    this.ownerDocument.body.classList.remove("knowgrove-image-dragging");
    this.adornerEl?.classList.remove("is-resizing");
    this.badgeEl?.classList.remove("is-visible");

    if (cancelled) {
      this.restoreInlineStyle(state.embedEl, state.originalEmbedStyle);
      this.restoreInlineStyle(state.imgEl, state.originalImageStyle);
      const wrapper = state.embedEl.querySelector<HTMLElement>(".image-wrapper");
      if (wrapper) this.restoreInlineStyle(wrapper, state.originalWrapperStyle ?? "");
      this.unlockScrollerSoon(state.scroller, state.lockedScrollTop);
      this.scheduleAdornerGeometryUpdate();
      return;
    }

    this.commitOccurrenceUpdate(state.view, state.occurrence, {
      width: state.currentWidth,
      height: state.currentHeight,
    }, state.scroller, state.lockedScrollTop);
  }

  private startReorderDrag(embedEl: HTMLElement, imgEl: HTMLImageElement, event: PointerEvent): void {
    const resolved = this.resolveOccurrence(embedEl, imgEl);
    if (!resolved) return;
    const ghostEl = this.ownerDocument.body.createDiv({ cls: "knowgrove-image-drag-ghost" });
    const ghostImg = ghostEl.createEl("img");
    ghostImg.src = imgEl.src;
    ghostEl.createSpan({ cls: "knowgrove-ghost-label", text: "移动图片" });
    ghostEl.style.left = `${event.clientX}px`;
    ghostEl.style.top = `${event.clientY}px`;
    const indicator = this.ownerDocument.body.createDiv({ cls: "knowgrove-image-drop-indicator is-active" });
    for (const side of ["left", "right"]) {
      indicator.createDiv({ cls: `knowgrove-drop-indicator-dot ${side}` });
    }

    const scroller = this.findScroller(resolved.view);
    scroller?.classList.add("knowgrove-scroll-anchor-lock");
    embedEl.classList.add("knowgrove-image-being-dragged");
    this.ownerDocument.body.classList.add("knowgrove-reorder-dragging");
    this.adornerEl?.classList.remove("is-visible");
    this.activeReorder = {
      embedEl,
      imgEl,
      view: resolved.view,
      occurrence: resolved.occurrence,
      pointerId: event.pointerId,
      ghostEl,
      dropIndicator: indicator,
      targetOffset: resolved.occurrence.unitFrom,
      placement: "line-before",
      targetImage: null,
      scroller,
      lockedScrollTop: scroller?.scrollTop ?? 0,
    };
    this.onReorderMove(event.clientX, event.clientY);
  }

  private onReorderMove(clientX: number, clientY: number): void {
    const state = this.activeReorder;
    if (!state) return;
    state.ghostEl.style.left = `${clientX}px`;
    state.ghostEl.style.top = `${clientY}px`;
    const contentEl = state.view.containerEl.querySelector<HTMLElement>(".cm-content")
      ?? state.view.containerEl.querySelector<HTMLElement>(".markdown-preview-section")
      ?? state.view.containerEl;
    const contentRect = contentEl.getBoundingClientRect();
    const indicatorY = Math.max(contentRect.top, Math.min(clientY, contentRect.bottom));
    const indicatorLeft = contentRect.left;
    state.dropIndicator.style.left = `${indicatorLeft}px`;
    state.dropIndicator.style.top = `${indicatorY - 1.5}px`;
    state.dropIndicator.style.width = `${contentRect.width}px`;

    const pointed = this.ownerDocument.elementFromPoint(clientX, clientY) as HTMLElement | null;
    const targetEmbed = pointed?.closest<HTMLElement>(".image-embed");
    if (targetEmbed && targetEmbed !== state.embedEl && state.view.containerEl.contains(targetEmbed)) {
      const targetImg = targetEmbed.querySelector<HTMLImageElement>("img");
      const resolvedTarget = targetImg ? this.resolveOccurrence(targetEmbed, targetImg) : null;
      if (resolvedTarget && resolvedTarget.occurrence.unitFrom !== state.occurrence.unitFrom) {
        const rect = targetEmbed.getBoundingClientRect();
        state.targetImage = resolvedTarget.occurrence;
        state.placement = clientX < rect.left + rect.width / 2 ? "image-before" : "image-after";
        state.targetOffset = state.placement === "image-before"
          ? resolvedTarget.occurrence.unitFrom
          : resolvedTarget.occurrence.unitTo;
        this.restoreLockedScroll(state.scroller, state.lockedScrollTop);
        return;
      }
    }

    const cm = this.codeMirror(state.view);
    const offset = cm?.posAtCoords({ x: clientX, y: clientY });
    if (offset === null || offset === undefined) return;
    const docText = state.view.editor.getValue();
    if (isOffsetInsideFencedCode(docText, offset)) return;
    const position = state.view.editor.offsetToPos(offset);
    const lineText = state.view.editor.getLine(position.line) ?? "";
    const lineStart = state.view.editor.posToOffset({ line: position.line, ch: 0 });
    const lineElement = pointed?.closest<HTMLElement>(".cm-line, p, h1, h2, h3, h4, h5, h6, li, table, pre");
    const lineRect = lineElement?.getBoundingClientRect();
    state.placement = lineRect && clientY >= lineRect.top + lineRect.height / 2 ? "line-after" : "line-before";
    state.targetOffset = state.placement === "line-after" ? lineStart + lineText.length : lineStart;
    state.targetImage = null;
    this.restoreLockedScroll(state.scroller, state.lockedScrollTop);
  }

  private abortImageReorder(error: unknown): void {
    this.pendingReorder = null;
    this.pendingMoveEvent = null;
    this.finishReorder(true);
    console.warn("KnowGrove: cancelled image reorder after an editor coordinate lookup failed", error);
  }

  private finishReorder(cancelled: boolean): void {
    const state = this.activeReorder;
    if (!state) return;
    this.activeReorder = null;
    state.ghostEl.remove();
    state.dropIndicator.remove();
    state.embedEl.classList.remove("knowgrove-image-being-dragged");
    this.ownerDocument.body.classList.remove("knowgrove-reorder-dragging");

    if (cancelled) {
      this.unlockScrollerSoon(state.scroller, state.lockedScrollTop);
      if (state.imgEl.isConnected) this.attachAdornerToImage(state.embedEl, state.imgEl);
      return;
    }

    const docText = state.view.editor.getValue();
    const source = this.reResolveOccurrence(state.view, state.occurrence, state.embedEl, state.imgEl);
    if (!source) {
      this.unlockScrollerSoon(state.scroller, state.lockedScrollTop);
      return;
    }
    let targetImage = state.targetImage;
    if (targetImage) {
      targetImage = findImageOccurrence(docText, targetImage.unitFrom, targetImage.target);
    }
    const changes = buildImageMoveChanges(
      docText,
      source,
      state.targetOffset,
      state.placement,
      targetImage,
    );
    if (!changes) {
      this.unlockScrollerSoon(state.scroller, state.lockedScrollTop);
      if (state.imgEl.isConnected) this.attachAdornerToImage(state.embedEl, state.imgEl);
      return;
    }
    this.dispatchChanges(state.view, changes);
    this.invalidateCache(state.view);
    this.hideAdorner(true);
    this.unlockScrollerSoon(state.scroller, state.lockedScrollTop);
  }

  private applyAlignment(alignment: ImageAlignment): void {
    if (!this.currentTarget) return;
    const resolved = this.resolveOccurrence(this.currentTarget.embedEl, this.currentTarget.imgEl);
    if (!resolved) return;
    const scroller = this.findScroller(resolved.view);
    const scrollTop = scroller?.scrollTop ?? 0;
    this.commitOccurrenceUpdate(resolved.view, resolved.occurrence, { alignment }, scroller, scrollTop);
  }

  private applyPresetWidth(ratio: number): void {
    if (!this.currentTarget) return;
    const { embedEl, imgEl } = this.currentTarget;
    const resolved = this.resolveOccurrence(embedEl, imgEl);
    if (!resolved) return;
    const available = this.availableContentWidth(embedEl);
    const targetWidth = Math.max(MIN_IMAGE_WIDTH, Math.round(available * ratio));
    const naturalWidth = imgEl.naturalWidth || imgEl.getBoundingClientRect().width || 300;
    const naturalHeight = imgEl.naturalHeight || imgEl.getBoundingClientRect().height || 200;
    const targetHeight = Math.max(MIN_IMAGE_HEIGHT, Math.round(targetWidth * (naturalHeight / Math.max(1, naturalWidth))));
    const scroller = this.findScroller(resolved.view);
    const scrollTop = scroller?.scrollTop ?? 0;
    this.applyImageDimensionsToDom(embedEl, imgEl, targetWidth, targetHeight);
    this.commitOccurrenceUpdate(resolved.view, resolved.occurrence, { width: targetWidth, height: targetHeight }, scroller, scrollTop);
  }

  private resetCurrentImage(): void {
    if (!this.currentTarget) return;
    const { embedEl, imgEl } = this.currentTarget;
    const resolved = this.resolveOccurrence(embedEl, imgEl);
    if (!resolved) return;
    const scroller = this.findScroller(resolved.view);
    const scrollTop = scroller?.scrollTop ?? 0;
    this.commitOccurrenceUpdate(resolved.view, resolved.occurrence, { reset: true }, scroller, scrollTop);
  }

  private commitOccurrenceUpdate(
    view: MarkdownView,
    occurrence: ImageOccurrence,
    update: { alignment?: ImageAlignment; width?: number; height?: number; reset?: boolean },
    scroller: HTMLElement | null,
    scrollTop: number,
  ): void {
    const currentText = view.editor.getValue();
    const current = findImageOccurrence(currentText, occurrence.unitFrom, occurrence.target);
    if (!current) {
      this.unlockScrollerSoon(scroller, scrollTop);
      return;
    }
    const replacement = updateImageSyntax(current, update);
    if (replacement === current.unitRaw) {
      this.unlockScrollerSoon(scroller, scrollTop);
      return;
    }
    scroller?.classList.add("knowgrove-scroll-anchor-lock");
    this.dispatchChanges(view, [{ from: current.unitFrom, to: current.unitTo, insert: replacement }]);
    this.invalidateCache(view);
    this.hideAdorner(true);
    this.unlockScrollerSoon(scroller, scrollTop);
  }

  private dispatchChanges(view: MarkdownView, changes: TextChange[]): void {
    const cm = this.codeMirror(view);
    if (cm) {
      cm.dispatch({
        changes: changes.map((change) => ({ from: change.from, to: change.to, insert: change.insert })),
        scrollIntoView: false,
        userEvent: "input.knowgrove-image",
      });
      return;
    }
    for (const change of [...changes].sort((left, right) => right.from - left.from || right.to - left.to)) {
      view.editor.replaceRange(
        change.insert,
        view.editor.offsetToPos(change.from),
        view.editor.offsetToPos(change.to),
      );
    }
  }

  private resolveOccurrence(
    embedEl: HTMLElement,
    imgEl: HTMLImageElement,
  ): { view: MarkdownView; occurrence: ImageOccurrence } | null {
    const view = this.findMarkdownViewForElement(embedEl);
    if (!view) return null;
    const docText = view.editor.getValue();
    const cache = this.documentCache(view, docText);
    const cm = this.codeMirror(view);
    let hintOffset = 0;
    if (cm) {
      try {
        hintOffset = cm.posAtDOM(embedEl);
      } catch {
        try {
          const line = embedEl.closest(".cm-line");
          if (line) hintOffset = cm.posAtDOM(line);
        } catch {
          hintOffset = 0;
        }
      }
    }
    const sourceHint = embedEl.getAttribute("src") || imgEl.getAttribute("src") || imgEl.getAttribute("alt") || "";
    const occurrence = this.findCachedOccurrence(cache.occurrences, hintOffset, sourceHint)
      ?? findImageOccurrence(docText, hintOffset, sourceHint);
    return occurrence ? { view, occurrence } : null;
  }

  private reResolveOccurrence(
    view: MarkdownView,
    previous: ImageOccurrence,
    embedEl: HTMLElement,
    imgEl: HTMLImageElement,
  ): ImageOccurrence | null {
    const current = this.resolveOccurrence(embedEl, imgEl);
    if (current?.view === view) return current.occurrence;
    return findImageOccurrence(view.editor.getValue(), previous.unitFrom, previous.target);
  }

  private documentCache(view: MarkdownView, text: string): DocumentImageCache {
    const existing = this.imageCache.get(view);
    if (existing?.text === text) return existing;
    const next = { text, occurrences: parseImageOccurrences(text) };
    this.imageCache.set(view, next);
    return next;
  }

  private invalidateCache(view: MarkdownView): void {
    this.imageCache.delete(view);
  }

  private findCachedOccurrence(
    occurrences: ImageOccurrence[],
    hintOffset: number,
    sourceHint: string,
  ): ImageOccurrence | null {
    if (!occurrences.length) return null;
    const name = this.normalizedFileName(sourceHint);
    let best: ImageOccurrence | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const occurrence of occurrences) {
      if (name && this.normalizedFileName(occurrence.target) !== name) continue;
      const distance = hintOffset < occurrence.from
        ? occurrence.from - hintOffset
        : hintOffset > occurrence.to
          ? hintOffset - occurrence.to
          : 0;
      if (distance < bestDistance) {
        best = occurrence;
        bestDistance = distance;
      }
    }
    return best;
  }

  private normalizedFileName(value: string): string {
    let normalized = value.replace(/\\/g, "/").split("?")[0]?.split("#")[0] ?? value;
    try {
      normalized = decodeURIComponent(normalized);
    } catch {
      // Keep original text.
    }
    return normalized.split("/").pop()?.toLowerCase() ?? "";
  }

  private findMarkdownViewForElement(element: HTMLElement): MarkdownView | null {
    for (const leaf of this.plugin.app.workspace.getLeavesOfType("markdown")) {
      if (leaf.view instanceof MarkdownView && leaf.view.containerEl.contains(element)) return leaf.view;
    }
    return null;
  }

  private codeMirror(view: MarkdownView): CodeMirrorEditorView | null {
    return ((view.editor as unknown as { cm?: CodeMirrorEditorView }).cm) ?? null;
  }

  private findScroller(view: MarkdownView): HTMLElement | null {
    return view.containerEl.querySelector<HTMLElement>(".cm-scroller")
      ?? view.containerEl.querySelector<HTMLElement>(".markdown-preview-view");
  }

  private availableContentWidth(embedEl: HTMLElement): number {
    const content = embedEl.closest<HTMLElement>(".cm-content, .markdown-preview-section")
      ?? embedEl.parentElement;
    const width = content?.getBoundingClientRect().width ?? 700;
    return Math.max(MIN_IMAGE_WIDTH, Math.floor(width));
  }

  private applyTransientPreview(
    embedEl: HTMLElement,
    imgEl: HTMLImageElement,
    width: number,
    height?: number,
  ): void {
    embedEl.classList.add("knowgrove-image-resizing");
    const widthPx = `${Math.round(width)}px`;
    embedEl.style.setProperty("width", widthPx);
    imgEl.style.setProperty("width", widthPx);
    if (height) imgEl.style.setProperty("height", `${Math.round(height)}px`);
    else imgEl.style.removeProperty("height");
    const wrapper = embedEl.querySelector<HTMLElement>(".image-wrapper");
    if (wrapper) {
      wrapper.style.setProperty("width", widthPx);
    }
  }

  private applyImageDimensionsToDom(
    embedEl: HTMLElement,
    imgEl: HTMLImageElement,
    width: number,
    height?: number,
  ): void {
    embedEl.classList.add("knowgrove-image-resizing");
    embedEl.style.setProperty("width", `${Math.round(width)}px`, "important");
    imgEl.style.setProperty("width", `${Math.round(width)}px`, "important");
    if (height) imgEl.style.setProperty("height", `${Math.round(height)}px`, "important");
    else imgEl.style.removeProperty("height");
    const wrapper = embedEl.querySelector<HTMLElement>(".image-wrapper");
    if (wrapper) {
      wrapper.style.setProperty("width", `${Math.round(width)}px`, "important");
    }
  }

  private restoreInlineStyle(element: HTMLElement, cssText: string): void {
    if (cssText) element.setAttribute("style", cssText);
    else element.removeAttribute("style");
  }

  private restoreLockedScroll(scroller: HTMLElement | null, scrollTop: number): void {
    if (!scroller) return;
    if (Math.abs(scroller.scrollTop - scrollTop) > 0.5) scroller.scrollTop = scrollTop;
  }

  private unlockScrollerSoon(scroller: HTMLElement | null, scrollTop: number): void {
    if (!scroller) return;
    scroller.classList.add("knowgrove-scroll-anchor-lock");
    const win = this.ownerDocument.defaultView;
    if (!win) {
      this.restoreLockedScroll(scroller, scrollTop);
      scroller.classList.remove("knowgrove-scroll-anchor-lock");
      return;
    }
    win.requestAnimationFrame(() => {
      this.restoreLockedScroll(scroller, scrollTop);
      win.requestAnimationFrame(() => {
        this.restoreLockedScroll(scroller, scrollTop);
        scroller.classList.remove("knowgrove-scroll-anchor-lock");
      });
    });
  }

  private detectAndGroupImageRows(container: Element): void {
    const candidates = container.querySelectorAll<HTMLElement>(".cm-line, .markdown-preview-view p");
    for (const candidate of Array.from(candidates)) {
      const images = candidate.querySelectorAll(":scope > .image-embed, :scope > span > .image-embed");
      const hasMultiple = images.length > 1;
      const visibleText = (candidate.textContent ?? "").trim();
      if (hasMultiple && !visibleText) {
        candidate.classList.add("knowgrove-image-row");
        candidate.classList.remove("knowgrove-image-row-equal-height");
      } else {
        candidate.classList.remove("knowgrove-image-row", "knowgrove-image-row-equal-height");
      }
    }
  }

  private cancelAnimationFrames(): void {
    const win = this.ownerDocument.defaultView;
    if (!win) return;
    for (const frame of [this.mutationRaf, this.geometryRaf, this.interactionRaf]) {
      if (frame !== null) win.cancelAnimationFrame(frame);
    }
    this.mutationRaf = null;
    this.geometryRaf = null;
    this.interactionRaf = null;
    this.pendingMoveEvent = null;
  }
}
