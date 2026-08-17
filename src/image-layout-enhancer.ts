import { MarkdownView } from "obsidian";
import type KnowGrovePlugin from "./main";

interface CodeMirrorEditorView {
  posAtCoords(coords: { x: number; y: number }): number | null;
  posAtDOM(node: Node): number;
  lineBlockAt(pos: number): { top: number; bottom: number; height: number };
}

interface ImageDragState {
  embedEl: HTMLElement;
  imgEl: HTMLImageElement;
  handleType: "nw" | "ne" | "se" | "sw" | "e" | "w" | "n" | "s";
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
  currentWidth: number;
  currentHeight: number;
  aspectRatio: number;
  handle: HTMLElement;
  badgeEl: HTMLElement;
}

interface ImageReorderDragState {
  embedEl: HTMLElement;
  imgEl: HTMLImageElement;
  sourceLineIndex: number;
  targetLineIndex: number;
  ghostEl: HTMLElement;
  dropIndicator: HTMLElement;
  startX: number;
  startY: number;
}

export class ImageLayoutEnhancer {
  private adornerEl: HTMLElement | null = null;
  private badgeEl: HTMLElement | null = null;
  private currentTarget: { embedEl: HTMLElement; imgEl: HTMLImageElement } | null = null;
  private activeDrag: ImageDragState | null = null;
  private activeReorderDrag: ImageReorderDragState | null = null;
  private hideTimeout: number | null = null;
  private isSelected = false;
  private boundImages = new WeakSet<HTMLImageElement>();
  private observer: MutationObserver | null = null;

  constructor(private readonly plugin: KnowGrovePlugin) {
    this.createRootAdorner();
    this.setupGlobalListeners();
    this.startObserving();
  }

  destroy(): void {
    this.stopObserving();
    this.cleanupActiveDrag();
    this.cleanupReorderDrag();
    this.removeGlobalListeners();
    if (this.adornerEl) {
      this.adornerEl.remove();
      this.adornerEl = null;
    }
    document.querySelectorAll(".knowgrove-image-drop-indicator").forEach((el) => el.remove());
  }

  private createRootAdorner(): void {
    if (this.adornerEl) return;

    this.adornerEl = createDiv({ cls: "knowgrove-image-adorner" });
    this.adornerEl.setAttribute("aria-hidden", "true");

    // Drag anywhere on adorner frame to reorder
    const onAdornerBodyStart = (event: MouseEvent | PointerEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".knowgrove-adorner-handle, .knowgrove-adorner-btn")) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (this.adornerEl && "setPointerCapture" in this.adornerEl && "pointerId" in event && typeof event.pointerId === "number") {
        try {
          this.adornerEl.setPointerCapture(event.pointerId);
        } catch {
          // Best effort
        }
      }

      if (this.currentTarget) {
        this.startReorderDrag(this.currentTarget.embedEl, this.currentTarget.imgEl, event.clientX, event.clientY);
      }
    };

    this.adornerEl.addEventListener("pointerdown", onAdornerBodyStart);
    this.adornerEl.addEventListener("mousedown", onAdornerBodyStart);

    // 8 Handles
    const handleDefs: Array<{ type: "nw" | "ne" | "se" | "sw" | "e" | "w" | "n" | "s"; cls: string }> = [
      { type: "nw", cls: "knowgrove-adorner-handle-nw" },
      { type: "ne", cls: "knowgrove-adorner-handle-ne" },
      { type: "se", cls: "knowgrove-adorner-handle-se" },
      { type: "sw", cls: "knowgrove-adorner-handle-sw" },
      { type: "e", cls: "knowgrove-adorner-handle-e" },
      { type: "w", cls: "knowgrove-adorner-handle-w" },
      { type: "n", cls: "knowgrove-adorner-handle-n" },
      { type: "s", cls: "knowgrove-adorner-handle-s" },
    ];

    for (const h of handleDefs) {
      const handle = createDiv({ cls: `knowgrove-adorner-handle ${h.cls}` });
      handle.dataset.handleType = h.type;

      const onStart = (event: MouseEvent | PointerEvent): void => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        if ("setPointerCapture" in handle && "pointerId" in event && typeof event.pointerId === "number") {
          try {
            handle.setPointerCapture(event.pointerId);
          } catch {
            // Best effort
          }
        }
        this.startAdornerDrag(h.type, event.clientX, event.clientY, handle);
      };

      handle.addEventListener("pointerdown", onStart);
      handle.addEventListener("mousedown", onStart);
      this.adornerEl.appendChild(handle);
    }

    // Floating Toolbar
    const toolbar = createDiv({ cls: "knowgrove-adorner-toolbar" });

    // Align Left
    const btnLeft = toolbar.createEl("button", { cls: "knowgrove-adorner-btn", text: "⫷ 靠左" });
    btnLeft.title = "靠左独占排版（文字上下分布，不环绕）";
    btnLeft.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (this.currentTarget) this.setImageAlignment(this.currentTarget.embedEl, "left");
    });

    // Align Center
    const btnCenter = toolbar.createEl("button", { cls: "knowgrove-adorner-btn", text: "≡ 居中" });
    btnCenter.title = "居中独占排版";
    btnCenter.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (this.currentTarget) this.setImageAlignment(this.currentTarget.embedEl, "center");
    });

    // Align Right
    const btnRight = toolbar.createEl("button", { cls: "knowgrove-adorner-btn", text: "⫸ 靠右" });
    btnRight.title = "靠右独占排版";
    btnRight.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (this.currentTarget) this.setImageAlignment(this.currentTarget.embedEl, "right");
    });

    toolbar.createSpan({ cls: "knowgrove-adorner-sep" });

    // Preset 50%
    const btn50 = toolbar.createEl("button", { cls: "knowgrove-adorner-btn", text: "50%" });
    btn50.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (this.currentTarget) this.applyPresetWidth(this.currentTarget.embedEl, this.currentTarget.imgEl, 0.5);
    });

    // Preset 100%
    const btn100 = toolbar.createEl("button", { cls: "knowgrove-adorner-btn", text: "100%" });
    btn100.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (this.currentTarget) this.applyPresetWidth(this.currentTarget.embedEl, this.currentTarget.imgEl, 1.0);
    });

    // Reset
    const btnReset = toolbar.createEl("button", { cls: "knowgrove-adorner-btn", text: "↺ 还原" });
    btnReset.title = "还原默认尺寸与对齐";
    btnReset.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (this.currentTarget) this.resetImage(this.currentTarget.embedEl, this.currentTarget.imgEl);
    });

    this.adornerEl.appendChild(toolbar);

    // Dimension Badge
    this.badgeEl = createDiv({ cls: "knowgrove-adorner-badge" });
    this.adornerEl.appendChild(this.badgeEl);

    // Cancel hiding when cursor is over adorner
    this.adornerEl.addEventListener("mouseenter", () => this.cancelHideAdorner());
    this.adornerEl.addEventListener("mouseleave", () => this.scheduleHideAdorner());

    document.body.appendChild(this.adornerEl);
  }

  private setupGlobalListeners(): void {
    window.addEventListener("pointerover", (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(".knowgrove-image-adorner")) {
        this.cancelHideAdorner();
        return;
      }
      const embedEl = target.closest<HTMLElement>(".image-embed");
      const imgEl = embedEl?.querySelector<HTMLImageElement>("img");
      if (embedEl && imgEl) {
        this.cancelHideAdorner();
        this.attachAdornerToImage(embedEl, imgEl);
      }
    }, { capture: true, passive: true });

    window.addEventListener("pointerout", (event: PointerEvent) => {
      if (this.activeDrag || this.activeReorderDrag || this.isSelected) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest(".image-embed") || target?.closest(".knowgrove-image-adorner")) {
        this.scheduleHideAdorner();
      }
    }, { capture: true, passive: true });

    window.addEventListener("pointerdown", (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (!target.closest(".knowgrove-image-adorner, .image-embed")) {
        this.isSelected = false;
        this.hideAdorner();
      }
    }, { capture: true, passive: true });

    window.addEventListener("scroll", () => {
      if (this.currentTarget && !this.activeDrag && !this.activeReorderDrag) {
        this.updateAdornerPosition();
      }
    }, { capture: true, passive: true });

    window.addEventListener("resize", () => {
      if (this.currentTarget && !this.activeDrag && !this.activeReorderDrag) {
        this.updateAdornerPosition();
      }
    }, { passive: true });

    // Drag move and end global capture
    window.addEventListener("pointermove", (event: PointerEvent) => {
      if (this.activeDrag) {
        event.preventDefault();
        event.stopPropagation();
        this.onAdornerDragMove(event.clientX, event.clientY, event.shiftKey);
      } else if (this.activeReorderDrag) {
        event.preventDefault();
        event.stopPropagation();
        this.onReorderDragMove(event.clientX, event.clientY);
      }
    }, { passive: false, capture: true });

    window.addEventListener("mousemove", (event: MouseEvent) => {
      if (this.activeDrag) {
        event.preventDefault();
        event.stopPropagation();
        this.onAdornerDragMove(event.clientX, event.clientY, event.shiftKey);
      } else if (this.activeReorderDrag) {
        event.preventDefault();
        event.stopPropagation();
        this.onReorderDragMove(event.clientX, event.clientY);
      }
    }, { capture: true });

    window.addEventListener("pointerup", (event: PointerEvent) => {
      if (this.activeDrag) {
        event.preventDefault();
        event.stopPropagation();
        this.onAdornerDragEnd();
      } else if (this.activeReorderDrag) {
        event.preventDefault();
        event.stopPropagation();
        this.onReorderDragEnd();
      }
    }, { passive: false, capture: true });

    window.addEventListener("mouseup", (event: MouseEvent) => {
      if (this.activeDrag) {
        event.preventDefault();
        event.stopPropagation();
        this.onAdornerDragEnd();
      } else if (this.activeReorderDrag) {
        event.preventDefault();
        event.stopPropagation();
        this.onReorderDragEnd();
      }
    }, { capture: true });

    window.addEventListener("pointercancel", () => {
      if (this.activeDrag) {
        this.onAdornerDragEnd();
      } else if (this.activeReorderDrag) {
        this.onReorderDragEnd();
      }
    }, { passive: false, capture: true });
  }

  private removeGlobalListeners(): void {
    // No-op
  }

  private startObserving(): void {
    this.scanAndEnhanceImages();
    this.observer = new MutationObserver(() => {
      this.scanAndEnhanceImages();
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

  public scanAndEnhanceImages(): void {
    const markdownContainers = document.querySelectorAll(".markdown-source-view, .markdown-preview-view");
    for (let i = 0; i < markdownContainers.length; i += 1) {
      const container = markdownContainers[i];
      if (!container) continue;

      const embeds = container.querySelectorAll<HTMLElement>(".image-embed");
      for (let j = 0; j < embeds.length; j += 1) {
        const embed = embeds[j];
        if (embed) this.enhanceImageEmbed(embed);
      }

      this.detectAndGroupImageRows(container);
    }
  }

  private enhanceImageEmbed(embedEl: HTMLElement): void {
    const img = embedEl.querySelector<HTMLImageElement>("img");
    if (!img) return;

    embedEl.classList.add("knowgrove-enhanced-image-embed");

    // Apply alignment from alt or src if present
    const alt = embedEl.getAttribute("alt") || "";
    const src = embedEl.getAttribute("src") || "";
    if (alt.includes("left") || src.includes("#left")) {
      embedEl.classList.add("knowgrove-align-left");
    } else if (alt.includes("right") || src.includes("#right")) {
      embedEl.classList.add("knowgrove-align-right");
    } else if (alt.includes("center") || src.includes("#center")) {
      embedEl.classList.add("knowgrove-align-center");
    }

    // Apply width attribute if present from markdown parsing
    const imgWidthAttr = img.getAttribute("width");
    if (imgWidthAttr) {
      const w = parseInt(imgWidthAttr, 10);
      if (w > 0) {
        embedEl.classList.add("knowgrove-image-resizing");
        embedEl.style.setProperty("width", `${w}px`, "important");
        embedEl.style.setProperty("max-width", `${w}px`, "important");
        img.style.setProperty("width", `${w}px`, "important");
      }
    }

    img.setAttribute("draggable", "false");

    if (!this.boundImages.has(img)) {
      this.boundImages.add(img);

      const onDirectImageStart = (event: MouseEvent | PointerEvent): void => {
        this.cancelHideAdorner();
        this.attachAdornerToImage(embedEl, img);
        this.isSelected = true;
        this.startReorderDrag(embedEl, img, event.clientX, event.clientY);
      };

      img.addEventListener("pointerdown", onDirectImageStart);
      img.addEventListener("mousedown", onDirectImageStart);
    }
  }

  private attachAdornerToImage(embedEl: HTMLElement, imgEl: HTMLImageElement): void {
    this.currentTarget = { embedEl, imgEl };
    this.createRootAdorner();
    this.updateAdornerPosition();
    if (this.adornerEl) {
      this.adornerEl.classList.add("is-visible");
    }
  }

  private updateAdornerPosition(): void {
    if (!this.adornerEl || !this.currentTarget) return;
    const { imgEl } = this.currentTarget;
    if (!imgEl.isConnected) {
      this.hideAdorner();
      return;
    }

    const rect = imgEl.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      this.hideAdorner();
      return;
    }

    this.adornerEl.style.setProperty("left", `${rect.left}px`);
    this.adornerEl.style.setProperty("top", `${rect.top}px`);
    this.adornerEl.style.setProperty("width", `${rect.width}px`);
    this.adornerEl.style.setProperty("height", `${rect.height}px`);
  }

  private scheduleHideAdorner(): void {
    if (this.hideTimeout !== null) window.clearTimeout(this.hideTimeout);
    this.hideTimeout = window.setTimeout(() => {
      this.hideAdorner();
    }, 280);
  }

  private cancelHideAdorner(): void {
    if (this.hideTimeout !== null) {
      window.clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
  }

  private hideAdorner(): void {
    if (this.activeDrag) return;
    if (this.adornerEl) {
      this.adornerEl.classList.remove("is-visible", "is-resizing");
    }
  }

  public startAdornerDrag(
    handleType: "nw" | "ne" | "se" | "sw" | "e" | "w" | "n" | "s",
    clientX: number,
    clientY: number,
    handle: HTMLElement,
  ): void {
    if (!this.currentTarget || !this.adornerEl) return;
    const { embedEl, imgEl } = this.currentTarget;

    const rect = imgEl.getBoundingClientRect();
    const startWidth = Math.round(rect.width);
    const startHeight = Math.round(rect.height);
    const naturalWidth = imgEl.naturalWidth || startWidth || 300;
    const naturalHeight = imgEl.naturalHeight || startHeight || 200;
    const aspectRatio = naturalWidth / Math.max(1, naturalHeight);

    this.adornerEl.classList.add("is-resizing");
    document.body.classList.add("knowgrove-image-dragging");

    if (this.badgeEl) {
      this.badgeEl.setText(`${startWidth} × ${startHeight} px`);
      this.badgeEl.classList.add("is-visible");
    }

    this.activeDrag = {
      embedEl,
      imgEl,
      handleType,
      startX: clientX,
      startY: clientY,
      startWidth,
      startHeight,
      currentWidth: startWidth,
      currentHeight: startHeight,
      aspectRatio,
      handle,
      badgeEl: this.badgeEl ?? createDiv(),
    };
  }

  private onAdornerDragMove(clientX: number, clientY: number, shiftKey: boolean): void {
    if (!this.activeDrag || !this.adornerEl) return;

    const deltaX = clientX - this.activeDrag.startX;
    let newWidth = this.activeDrag.startWidth;

    if (["se", "ne", "e"].includes(this.activeDrag.handleType)) {
      newWidth = Math.max(60, this.activeDrag.startWidth + deltaX);
    } else if (["sw", "nw", "w"].includes(this.activeDrag.handleType)) {
      newWidth = Math.max(60, this.activeDrag.startWidth - deltaX);
    }

    let newHeight = Math.round(newWidth / this.activeDrag.aspectRatio);

    if (this.activeDrag.handleType === "n" || this.activeDrag.handleType === "s" || shiftKey) {
      const deltaY = clientY - this.activeDrag.startY;
      if (this.activeDrag.handleType.includes("s")) {
        newHeight = Math.max(40, this.activeDrag.startHeight + deltaY);
      } else if (this.activeDrag.handleType.includes("n")) {
        newHeight = Math.max(40, this.activeDrag.startHeight - deltaY);
      }
    }

    this.activeDrag.currentWidth = newWidth;
    this.activeDrag.currentHeight = newHeight;

    // Apply to DOM elements
    this.activeDrag.embedEl.classList.add("knowgrove-image-resizing");
    this.activeDrag.embedEl.style.setProperty("width", `${newWidth}px`, "important");
    this.activeDrag.embedEl.style.setProperty("max-width", `${newWidth}px`, "important");

    this.activeDrag.imgEl.style.setProperty("width", `${newWidth}px`, "important");
    this.activeDrag.imgEl.style.setProperty("height", `${newHeight}px`, "important");

    const wrapper = this.activeDrag.embedEl.querySelector<HTMLElement>(".image-wrapper");
    if (wrapper) {
      wrapper.style.setProperty("width", `${newWidth}px`, "important");
    }

    // Update Adorner overlay size
    this.adornerEl.style.setProperty("width", `${newWidth}px`);
    this.adornerEl.style.setProperty("height", `${newHeight}px`);

    if (this.badgeEl) {
      this.badgeEl.setText(`${newWidth} × ${newHeight} px`);
    }
  }

  private onAdornerDragEnd(): void {
    if (!this.activeDrag) return;
    const { embedEl, currentWidth, currentHeight } = this.activeDrag;

    if (this.adornerEl) {
      this.adornerEl.classList.remove("is-resizing");
    }
    if (this.badgeEl) {
      this.badgeEl.classList.remove("is-visible");
    }
    document.body.classList.remove("knowgrove-image-dragging");

    this.commitImageSizeToMarkdown(embedEl, currentWidth, currentHeight);
    this.cleanupActiveDrag();

    window.setTimeout(() => {
      this.updateAdornerPosition();
    }, 40);
  }

  private cleanupActiveDrag(): void {
    this.activeDrag = null;
  }

  public setImageAlignment(embedEl: HTMLElement, alignment: "left" | "center" | "right"): void {
    embedEl.classList.remove("knowgrove-align-left", "knowgrove-align-center", "knowgrove-align-right");
    embedEl.classList.add(`knowgrove-align-${alignment}`);

    this.updateImageMarkdownSyntax(embedEl, { alignment });
    window.setTimeout(() => this.updateAdornerPosition(), 40);
  }

  private applyPresetWidth(embedEl: HTMLElement, imgEl: HTMLImageElement, ratio: number): void {
    const parentWidth = embedEl.parentElement?.getBoundingClientRect().width || 700;
    const targetWidth = Math.round(parentWidth * ratio);
    const naturalWidth = imgEl.naturalWidth || 300;
    const naturalHeight = imgEl.naturalHeight || 200;
    const targetHeight = Math.round(targetWidth * (naturalHeight / naturalWidth));

    embedEl.classList.add("knowgrove-image-resizing");
    embedEl.style.setProperty("width", `${targetWidth}px`, "important");
    embedEl.style.setProperty("max-width", `${targetWidth}px`, "important");

    imgEl.style.setProperty("width", `${targetWidth}px`, "important");
    imgEl.style.setProperty("height", `${targetHeight}px`, "important");

    const wrapper = embedEl.querySelector<HTMLElement>(".image-wrapper");
    if (wrapper) {
      wrapper.style.setProperty("width", `${targetWidth}px`, "important");
    }

    this.commitImageSizeToMarkdown(embedEl, targetWidth, targetHeight);
    window.setTimeout(() => this.updateAdornerPosition(), 40);
  }

  private resetImage(embedEl: HTMLElement, imgEl: HTMLImageElement): void {
    imgEl.style.removeProperty("width");
    imgEl.style.removeProperty("height");
    embedEl.style.removeProperty("width");
    embedEl.style.removeProperty("max-width");
    embedEl.classList.remove("knowgrove-image-resizing", "knowgrove-align-left", "knowgrove-align-center", "knowgrove-align-right");

    const wrapper = embedEl.querySelector<HTMLElement>(".image-wrapper");
    if (wrapper) {
      wrapper.style.removeProperty("width");
    }

    this.updateImageMarkdownSyntax(embedEl, { reset: true });
    window.setTimeout(() => this.updateAdornerPosition(), 40);
  }

  private commitImageSizeToMarkdown(embedEl: HTMLElement, width: number, height?: number): void {
    this.updateImageMarkdownSyntax(embedEl, { width, height });
  }

  private getFrontmatterEndLine(docText: string): number {
    const lines = docText.split("\n");
    if (lines[0]?.trim() !== "---") return -1;
    for (let i = 1; i < lines.length; i += 1) {
      if (lines[i]?.trim() === "---") return i;
    }
    return -1;
  }

  private startReorderDrag(embedEl: HTMLElement, imgEl: HTMLImageElement, clientX: number, clientY: number): void {
    this.cleanupReorderDrag();

    const view = this.findMarkdownViewForElement(embedEl);
    if (!view) return;

    const src = embedEl.getAttribute("src") || "";
    const filename = src.split("/").pop() || src;
    const cleanFilename = filename.split("#")[0] || filename;

    const docText = view.editor.getValue();
    const lines = docText.split("\n");
    let sourceLineIndex = -1;
    for (let i = 0; i < lines.length; i += 1) {
      if (lines[i]?.includes(cleanFilename)) {
        sourceLineIndex = i;
        break;
      }
    }

    if (sourceLineIndex < 0) return;

    // Create Ghost preview element
    const ghostEl = createDiv({ cls: "knowgrove-image-drag-ghost" });
    const ghostImg = ghostEl.createEl("img");
    ghostImg.src = imgEl.src;
    ghostEl.createSpan({ cls: "knowgrove-ghost-label", text: "移动图片至..." });
    ghostEl.style.setProperty("left", `${clientX + 16}px`);
    ghostEl.style.setProperty("top", `${clientY + 16}px`);
    document.body.appendChild(ghostEl);

    // Create Drop Indicator line
    const dropIndicator = createDiv({ cls: "knowgrove-image-drop-indicator" });
    dropIndicator.createDiv({ cls: "knowgrove-drop-indicator-dot left" });
    dropIndicator.createDiv({ cls: "knowgrove-drop-indicator-dot right" });
    document.body.appendChild(dropIndicator);

    // Hide Adorner during reorder drag
    if (this.adornerEl) {
      this.adornerEl.classList.remove("is-visible");
    }
    embedEl.classList.add("knowgrove-image-being-dragged");
    document.body.classList.add("knowgrove-reorder-dragging");

    this.activeReorderDrag = {
      embedEl,
      imgEl,
      sourceLineIndex,
      targetLineIndex: sourceLineIndex,
      ghostEl,
      dropIndicator,
      startX: clientX,
      startY: clientY,
    };
  }

  private onReorderDragMove(clientX: number, clientY: number): void {
    if (!this.activeReorderDrag) return;

    // Move Ghost preview
    this.activeReorderDrag.ghostEl.style.setProperty("left", `${clientX + 16}px`);
    this.activeReorderDrag.ghostEl.style.setProperty("top", `${clientY + 16}px`);

    const view = this.findMarkdownViewForElement(this.activeReorderDrag.embedEl);
    if (!view) return;

    const editor = view.editor;
    const docText = editor.getValue();
    const lines = docText.split("\n");
    const fmEnd = this.getFrontmatterEndLine(docText);
    const minAllowedLine = fmEnd >= 0 ? fmEnd + 1 : 0;

    const container = view.containerEl;
    const contentEl = container.querySelector<HTMLElement>(".cm-content, .markdown-preview-section") || container;
    const contentRect = contentEl.getBoundingClientRect();

    // Query all visible block elements
    const lineElements = Array.from(contentEl.querySelectorAll<HTMLElement>(".cm-line, p, h1, h2, h3, h4, h5, h6, li, table, pre"));
    if (lineElements.length === 0) return;

    // Find the line element closest to clientY
    let closestEl: HTMLElement | null = null;
    let closestDistance = Infinity;

    for (let i = 0; i < lineElements.length; i += 1) {
      const el = lineElements[i];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (rect.height === 0) continue;

      const midY = rect.top + rect.height / 2;
      const dist = Math.abs(clientY - midY);

      if (dist < closestDistance) {
        closestDistance = dist;
        closestEl = el;
      }
    }

    if (!closestEl) return;

    const targetRect = closestEl.getBoundingClientRect();
    const isEmptyLine = (closestEl.textContent || "").trim() === "";

    let isUpper = false;
    let indicatorY = targetRect.top;

    if (isEmptyLine) {
      // For empty paragraph gap, snap indicator to vertical center
      indicatorY = targetRect.top + targetRect.height / 2;
    } else {
      // For text lines, snap indicator to top or bottom edge based on mouse half
      isUpper = clientY < targetRect.top + targetRect.height / 2;
      indicatorY = isUpper ? targetRect.top : targetRect.bottom;
    }

    // Get exact line index from CodeMirror 6 or fallback to text search
    let targetLine = -1;
    const cmView = (editor as unknown as { cm?: CodeMirrorEditorView }).cm;
    if (cmView && typeof cmView.posAtDOM === "function") {
      try {
        const pos = cmView.posAtDOM(closestEl);
        targetLine = editor.offsetToPos(pos).line;
      } catch {
        targetLine = -1;
      }
    }

    if (targetLine < 0) {
      const targetText = closestEl.textContent?.trim() || "";
      if (targetText) {
        targetLine = lines.findIndex((l) => l.trim().includes(targetText.slice(0, 30)));
      }
    }
    if (targetLine < 0) targetLine = minAllowedLine;

    let targetIdx = isEmptyLine ? targetLine : (isUpper ? targetLine : targetLine + 1);
    if (fmEnd >= 0 && targetIdx <= fmEnd) {
      targetIdx = fmEnd + 1;
    }
    targetIdx = Math.max(minAllowedLine, Math.min(targetIdx, lines.length));

    this.activeReorderDrag.targetLineIndex = targetIdx;

    // Align indicator visually with the line element
    const indicatorLeft = Math.max(contentRect.left, targetRect.left);
    const indicatorWidth = Math.min(contentRect.width, targetRect.width || contentRect.width);

    this.activeReorderDrag.dropIndicator.classList.add("is-active");
    this.activeReorderDrag.dropIndicator.style.setProperty("left", `${indicatorLeft}px`);
    this.activeReorderDrag.dropIndicator.style.setProperty("top", `${indicatorY - 1.5}px`);
    this.activeReorderDrag.dropIndicator.style.setProperty("width", `${indicatorWidth}px`);
  }

  private onReorderDragEnd(): void {
    if (!this.activeReorderDrag) return;

    const { embedEl, sourceLineIndex, targetLineIndex } = this.activeReorderDrag;
    this.cleanupReorderDrag();

    if (sourceLineIndex === targetLineIndex || targetLineIndex === sourceLineIndex + 1 || targetLineIndex < 0) {
      const imgEl = embedEl.querySelector<HTMLImageElement>("img");
      if (imgEl) this.attachAdornerToImage(embedEl, imgEl);
      return;
    }

    const view = this.findMarkdownViewForElement(embedEl);
    if (!view) return;

    const editor = view.editor;
    const docText = editor.getValue();
    const lines = docText.split("\n");

    const sourceLineText = lines[sourceLineIndex];
    if (!sourceLineText) return;

    const fmEnd = this.getFrontmatterEndLine(docText);
    let finalTarget = targetLineIndex;
    if (fmEnd >= 0 && finalTarget <= fmEnd) {
      finalTarget = fmEnd + 1;
    }

    lines.splice(sourceLineIndex, 1);
    const insertIdx = finalTarget > sourceLineIndex ? finalTarget - 1 : finalTarget;
    lines.splice(Math.max(0, Math.min(insertIdx, lines.length)), 0, sourceLineText);

    editor.setValue(lines.join("\n"));

    window.setTimeout(() => {
      this.scanAndEnhanceImages();
      const updatedEmbed = view.containerEl.querySelector<HTMLElement>(`.image-embed[src*="${embedEl.getAttribute("src") || ""}"]`);
      const updatedImg = updatedEmbed?.querySelector<HTMLImageElement>("img");
      if (updatedEmbed && updatedImg) {
        this.attachAdornerToImage(updatedEmbed, updatedImg);
      }
    }, 100);
  }

  private cleanupReorderDrag(): void {
    if (this.activeReorderDrag) {
      this.activeReorderDrag.ghostEl.remove();
      this.activeReorderDrag.dropIndicator.remove();
      this.activeReorderDrag.embedEl.classList.remove("knowgrove-image-being-dragged");
      document.body.classList.remove("knowgrove-reorder-dragging");
      this.activeReorderDrag = null;
    }
  }

  private findMarkdownViewForElement(element: HTMLElement): MarkdownView | null {
    const active = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    if (active && active.containerEl.contains(element)) return active;

    for (const leaf of this.plugin.app.workspace.getLeavesOfType("markdown")) {
      if (leaf.view instanceof MarkdownView && leaf.view.containerEl.contains(element)) {
        return leaf.view;
      }
    }
    return active || (this.plugin.app.workspace.getLeavesOfType("markdown")[0]?.view as MarkdownView) || null;
  }

  private updateImageMarkdownSyntax(
    embedEl: HTMLElement,
    options: { width?: number; height?: number; alignment?: "left" | "center" | "right"; reset?: boolean },
  ): void {
    const targetView = this.findMarkdownViewForElement(embedEl);
    if (!targetView) return;

    const src = embedEl.getAttribute("src") || "";
    if (!src) return;

    const filename = src.split("/").pop() || src;
    const cleanFilename = filename.split("#")[0] || filename;

    const editor = targetView.editor;
    const docText = editor.getValue();
    const lines = docText.split("\n");

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (!line || !line.includes(cleanFilename)) continue;

      // Match wikilink: ![[target|...]]
      const wikiMatch = line.match(/!\[\[([^\]\n]+)\]\]/);
      if (wikiMatch) {
        const full = wikiMatch[0];
        const inner = wikiMatch[1] ?? "";
        const parts = inner.split("|");
        const baseTarget = (parts[0] ?? src).split("#")[0] ?? src;

        let alignTag = "";
        if (options.alignment) {
          alignTag = `#${options.alignment}`;
        } else if (!options.reset && src.includes("#")) {
          const existingAlign = src.match(/#(left|center|right)/)?.[1];
          if (existingAlign) alignTag = `#${existingAlign}`;
        }

        let newLink = `![[${baseTarget}${alignTag}]]`;
        if (!options.reset) {
          const sizePart = options.width
            ? (options.height ? `${options.width}x${options.height}` : `${options.width}`)
            : parts.find((p) => /^\d+(x\d+)?$/.test(p.trim()));

          if (sizePart) {
            newLink = `![[${baseTarget}${alignTag}|${sizePart}]]`;
          }
        }

        const newLine = line.replace(full, newLink);
        if (newLine !== line) {
          editor.setLine(i, newLine);
        }
        return;
      }

      // Match markdown link: ![alt](url)
      const mdMatch = line.match(/!\[([^\]\n]*)\]\(([^)\n]+)\)/);
      if (mdMatch) {
        const full = mdMatch[0];
        const currentAlt = mdMatch[1] ?? "";
        let targetUrl = (mdMatch[2] ?? src).split("#")[0] ?? src;

        if (options.alignment) {
          targetUrl = `${targetUrl}#${options.alignment}`;
        } else if (!options.reset && src.includes("#")) {
          const existingAlign = src.match(/#(left|center|right)/)?.[1];
          if (existingAlign) targetUrl = `${targetUrl}#${existingAlign}`;
        }

        let newLink = `![${currentAlt}](${targetUrl})`;
        if (options.width && !options.reset) {
          const cleanAlt = currentAlt.replace(/\|\d+(x\d+)?/g, "").replace(/\|(left|center|right)/g, "").trim();
          const sizePart = `|${options.width}`;
          newLink = `![${cleanAlt}${sizePart}](${targetUrl})`;
        } else if (options.reset) {
          const cleanAlt = currentAlt.replace(/\|\d+(x\d+)?/g, "").replace(/\|(left|center|right)/g, "").trim();
          newLink = `![${cleanAlt}](${targetUrl})`;
        }

        const newLine = line.replace(full, newLink);
        if (newLine !== line) {
          editor.setLine(i, newLine);
        }
        return;
      }
    }
  }

  private detectAndGroupImageRows(container: Element): void {
    const lines = container.querySelectorAll(".cm-line");
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (!line) continue;
      const images = line.querySelectorAll(".image-embed");
      if (images.length > 1) {
        line.classList.add("knowgrove-image-row", "knowgrove-image-row-equal-height");
      }
    }

    const paragraphs = container.querySelectorAll(".markdown-preview-view p");
    for (let i = 0; i < paragraphs.length; i += 1) {
      const p = paragraphs[i];
      if (!p) continue;
      const images = p.querySelectorAll(".image-embed");
      if (images.length > 1) {
        p.classList.add("knowgrove-image-row", "knowgrove-image-row-equal-height");
      }
    }
  }
}

