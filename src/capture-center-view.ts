import { ItemView, Modal, Notice, WorkspaceLeaf, setIcon } from "obsidian";
import type KnowGrovePlugin from "./main";
import {
  extractBatchCaptureUrls,
  formatRecordingDuration,
  type DesktopRecordingSnapshot,
} from "./capture-center-core";

export const LEGACY_CAPTURE_CENTER_VIEW_TYPE = "knowgrove-capture-center";
export const LINK_CAPTURE_VIEW_TYPE = "knowgrove-link-capture";
export const DESKTOP_RECORDER_VIEW_TYPE = "knowgrove-desktop-recorder";

export class LinkCaptureModal extends Modal {
  constructor(
    private readonly plugin: KnowGrovePlugin,
    private readonly onClosed: () => void,
  ) {
    super(plugin.app);
  }

  onOpen(): void {
    this.modalEl.addClass("knowgrove-capture-modal", "knowgrove-link-capture-modal");
    this.render();
  }

  onClose(): void {
    this.contentEl.empty();
    this.onClosed();
  }

  private render(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("knowgrove-capture-view", "knowgrove-link-capture-view");
    root.createEl("p", {
      cls: "knowgrove-capture-help",
      text: "每行一个链接，可一次粘贴多篇。",
    });
    const textarea = root.createEl("textarea", {
      cls: "knowgrove-batch-link-input",
      attr: {
        rows: "12",
        placeholder: "https://example.com/article\nhttps://www.bilibili.com/video/...",
        "aria-label": "批量链接，每行一个",
      },
    });
    const footer = root.createDiv("knowgrove-batch-link-footer");
    const count = footer.createSpan({ text: "0 个链接" });
    const submit = footer.createEl("button", { cls: "mod-cta", text: "保存并解析" });
    const progress = root.createDiv("knowgrove-batch-link-progress");
    const results = root.createDiv("knowgrove-batch-link-results");
    submit.disabled = true;
    const update = (): void => {
      const total = extractBatchCaptureUrls(textarea.value).length;
      count.setText(`${total} 个链接`);
      submit.disabled = total === 0;
    };
    textarea.addEventListener("input", update);
    submit.addEventListener("click", () => {
      const urls = extractBatchCaptureUrls(textarea.value);
      if (!urls.length) return;
      submit.disabled = true;
      textarea.disabled = true;
      results.empty();
      progress.setText(`正在保存 0 / ${urls.length}`);
      void this.plugin.captureBatchLinks(textarea.value, (completed, total, message) => {
        progress.setText(`正在保存 ${completed} / ${total}${message ? ` · ${message}` : ""}`);
      }).then((result) => {
        progress.setText(`已保存 ${result.created} 篇，${result.queued} 篇进入解析队列${result.failed ? `，${result.failed} 篇失败` : ""}`);
        for (const file of result.files) {
          const open = results.createEl("button", {
            cls: "knowgrove-batch-link-result",
            attr: { "aria-label": `打开笔记：${file.basename}` },
          });
          const icon = open.createSpan("knowgrove-batch-link-result-icon");
          setIcon(icon, "file-text");
          open.createSpan({ cls: "knowgrove-batch-link-result-title", text: file.basename });
          const arrow = open.createSpan("knowgrove-batch-link-result-arrow");
          setIcon(arrow, "arrow-up-right");
          open.addEventListener("click", () => void this.plugin.openVaultFile(file.path));
        }
        if (!result.failed) textarea.value = "";
        update();
      }).catch((error) => {
        progress.setText(`保存失败：${error instanceof Error ? error.message : String(error)}`);
      }).finally(() => {
        textarea.disabled = false;
        update();
      });
    });
    window.setTimeout(() => textarea.focus(), 0);
  }
}

export class DesktopRecorderView extends ItemView {
  private unsubscribeRecording?: () => void;
  private recordingSnapshot: DesktopRecordingSnapshot;
  private recordingTitle = "";

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: KnowGrovePlugin,
  ) {
    super(leaf);
    this.recordingSnapshot = plugin.getDesktopRecordingSnapshot();
  }

  getViewType(): string {
    return DESKTOP_RECORDER_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "录音";
  }

  getIcon(): string {
    return "mic";
  }

  async onOpen(): Promise<void> {
    this.unsubscribeRecording = this.plugin.subscribeDesktopRecording((snapshot) => {
      this.recordingSnapshot = snapshot;
      this.render();
    });
    this.render();
    this.plugin.syncRecordingOverlay();
  }

  async onClose(): Promise<void> {
    this.unsubscribeRecording?.();
    this.unsubscribeRecording = undefined;
    this.contentEl.empty();
    this.plugin.syncRecordingOverlay();
  }

  private render(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("knowgrove-capture-view", "knowgrove-desktop-recorder-view");
    this.renderRecording(root);
  }

  private renderRecording(container: HTMLElement): void {
    const snapshot = this.recordingSnapshot;
    const status = container.createDiv(`knowgrove-recorder-card is-${snapshot.state}`);
    const indicator = status.createDiv("knowgrove-recorder-indicator");
    const icon = indicator.createSpan();
    setIcon(icon, snapshot.state === "recording" ? "mic" : snapshot.state === "completed" ? "circle-check" : "audio-lines");
    indicator.createSpan({ text: formatRecordingDuration(snapshot.recordedMilliseconds) });
    status.createEl("strong", { text: snapshot.title || "语音记录" });
    status.createEl("p", { text: snapshot.message });
    if (snapshot.interruptionCount) {
      status.createEl("small", { text: `已安全处理 ${snapshot.interruptionCount} 次中断` });
    }

    if (snapshot.state === "idle") {
      const input = container.createEl("input", {
        type: "text",
        cls: "knowgrove-recorder-title",
        value: this.recordingTitle,
        attr: { placeholder: "录音标题（可不填）", "aria-label": "录音标题" },
      });
      input.addEventListener("input", () => { this.recordingTitle = input.value; });
      const start = container.createEl("button", { cls: "mod-cta knowgrove-recorder-start", text: "开始录音" });
      start.addEventListener("click", () => {
        start.disabled = true;
        void this.plugin.startDesktopRecording(this.recordingTitle).catch((error) => {
          new Notice(`无法开始录音：${error instanceof Error ? error.message : String(error)}`, 8000);
          start.disabled = false;
        });
      });
      container.createEl("p", {
        cls: "knowgrove-capture-help",
        text: "首次使用会请求麦克风权限；中断后可自动续录。",
      });
      return;
    }

    const actions = container.createDiv("knowgrove-recorder-actions");
    if (snapshot.state === "needs-attention") {
      const resume = actions.createEl("button", {
        text: snapshot.recordedMilliseconds > 0 ? "继续录音" : "重新连接麦克风",
      });
      resume.addEventListener("click", () => void this.plugin.resumeDesktopRecording().catch((error) => {
        new Notice(error instanceof Error ? error.message : String(error), 8000);
      }));
    }
    if (snapshot.state !== "requesting"
      && snapshot.state !== "finalizing"
      && snapshot.state !== "completed"
      && (snapshot.state !== "needs-attention" || snapshot.recordedMilliseconds > 0)) {
      const stop = actions.createEl("button", { cls: "mod-warning", text: snapshot.state === "needs-attention" ? "保存已有录音" : "停止并保存" });
      stop.addEventListener("click", () => {
        stop.disabled = true;
        void this.plugin.stopDesktopRecording().catch((error) => {
          new Notice(`保存录音失败：${error instanceof Error ? error.message : String(error)}`, 9000);
          stop.disabled = false;
        });
      });
    }
    if (snapshot.state === "completed") {
      if (snapshot.notePath) {
        const open = actions.createEl("button", { cls: "mod-cta", text: "打开录音笔记" });
        open.addEventListener("click", () => void this.plugin.openVaultFile(snapshot.notePath!));
      }
      const again = actions.createEl("button", { text: "新建录音" });
      again.addEventListener("click", () => void this.plugin.resetDesktopRecording());
    }
  }
}

export class DesktopRecordingOverlay {
  private root?: HTMLElement;
  private unsubscribe?: () => void;
  private durationEl?: HTMLElement;
  private labelEl?: HTMLElement;
  private stopButton?: HTMLButtonElement;
  private dragCleanup?: () => void;

  private static readonly positionKey = "knowgrove-recording-overlay-position";

  constructor(private readonly plugin: KnowGrovePlugin) {}

  show(): void {
    if (this.root) return;
    const document = this.plugin.app.workspace.containerEl.ownerDocument;
    this.root = document.body.createDiv("knowgrove-recording-overlay");
    const status = this.root.createDiv("knowgrove-recording-overlay-status");
    status.createSpan("knowgrove-recording-dot");
    this.durationEl = status.createSpan("knowgrove-recording-overlay-duration");
    this.labelEl = status.createSpan("knowgrove-recording-overlay-label");
    const restore = this.root.createEl("button", {
      cls: "knowgrove-recording-restore",
      attr: { "aria-label": "返回录音页" },
    });
    const restoreIcon = restore.createSpan("knowgrove-recording-restore-icon");
    setIcon(restoreIcon, "panel-left-open");
    restore.createSpan({ text: "返回录音" });
    restore.addEventListener("click", () => void this.plugin.activateDesktopRecorder());
    this.stopButton = this.root.createEl("button", {
      cls: "clickable-icon knowgrove-recording-stop",
      attr: { "aria-label": "停止并保存录音" },
    });
    setIcon(this.stopButton, "square");
    this.stopButton.addEventListener("click", () => void this.plugin.stopDesktopRecording().catch((error) => {
      new Notice(`保存录音失败：${error instanceof Error ? error.message : String(error)}`, 9000);
    }));
    this.installDragBehavior();
    this.unsubscribe = this.plugin.subscribeDesktopRecording((snapshot) => this.render(snapshot));
  }

  hide(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.dragCleanup?.();
    this.dragCleanup = undefined;
    this.root?.remove();
    this.root = undefined;
    this.durationEl = undefined;
    this.labelEl = undefined;
    this.stopButton = undefined;
  }

  private render(snapshot: DesktopRecordingSnapshot): void {
    const root = this.root;
    if (!root) return;
    if (snapshot.state === "idle" || snapshot.state === "completed") {
      this.hide();
      return;
    }
    root.setAttr("data-state", snapshot.state);
    this.durationEl?.setText(formatRecordingDuration(snapshot.recordedMilliseconds));
    this.labelEl?.setText(snapshot.state === "recording" ? "录音中" : snapshot.message);
    if (this.stopButton) {
      this.stopButton.hidden = snapshot.state === "requesting" || snapshot.state === "finalizing";
      this.stopButton.disabled = snapshot.state === "finalizing";
    }
  }

  private installDragBehavior(): void {
    const root = this.root;
    if (!root) return;
    const document = root.ownerDocument;
    const saved = window.localStorage.getItem(DesktopRecordingOverlay.positionKey);
    if (saved) {
      try {
        const position = JSON.parse(saved) as { left?: number; top?: number };
        if (Number.isFinite(position.left) && Number.isFinite(position.top)) {
          this.placeWithinViewport(position.left!, position.top!);
        }
      } catch {
        window.localStorage.removeItem(DesktopRecordingOverlay.positionKey);
      }
    }
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;
    const pointerDown = (event: PointerEvent): void => {
      if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
      const bounds = root.getBoundingClientRect();
      dragging = true;
      offsetX = event.clientX - bounds.left;
      offsetY = event.clientY - bounds.top;
      root.addClass("is-dragging");
      root.setPointerCapture(event.pointerId);
      event.preventDefault();
    };
    const pointerMove = (event: PointerEvent): void => {
      if (!dragging) return;
      this.placeWithinViewport(event.clientX - offsetX, event.clientY - offsetY);
    };
    const pointerUp = (event: PointerEvent): void => {
      if (!dragging) return;
      dragging = false;
      root.removeClass("is-dragging");
      if (root.hasPointerCapture(event.pointerId)) root.releasePointerCapture(event.pointerId);
      const bounds = root.getBoundingClientRect();
      window.localStorage.setItem(DesktopRecordingOverlay.positionKey, JSON.stringify({
        left: Math.round(bounds.left),
        top: Math.round(bounds.top),
      }));
    };
    const resize = (): void => {
      const bounds = root.getBoundingClientRect();
      this.placeWithinViewport(bounds.left, bounds.top);
    };
    root.addEventListener("pointerdown", pointerDown);
    root.addEventListener("pointermove", pointerMove);
    root.addEventListener("pointerup", pointerUp);
    root.addEventListener("pointercancel", pointerUp);
    window.addEventListener("resize", resize);
    this.dragCleanup = () => {
      root.removeEventListener("pointerdown", pointerDown);
      root.removeEventListener("pointermove", pointerMove);
      root.removeEventListener("pointerup", pointerUp);
      root.removeEventListener("pointercancel", pointerUp);
      window.removeEventListener("resize", resize);
    };
  }

  private placeWithinViewport(left: number, top: number): void {
    const root = this.root;
    if (!root) return;
    const gap = 12;
    const width = root.offsetWidth || 320;
    const height = root.offsetHeight || 48;
    const safeLeft = Math.max(gap, Math.min(left, window.innerWidth - width - gap));
    const safeTop = Math.max(gap, Math.min(top, window.innerHeight - height - gap));
    root.style.left = `${safeLeft}px`;
    root.style.top = `${safeTop}px`;
    root.style.right = "auto";
    root.style.bottom = "auto";
  }
}
