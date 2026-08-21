import { ItemView, Modal, Notice, WorkspaceLeaf, setIcon } from "obsidian";
import type KnowGrovePlugin from "./main";
import type { BrowserCaptureJob } from "./browser-capture-server";
import {
  extractBatchCaptureUrls,
  formatRecordingDuration,
  LOCAL_MEDIA_IMPORT_ACCEPT,
  LOCAL_MEDIA_IMPORT_FORMAT_LABEL,
  localMediaImportType,
  type DesktopRecordingSnapshot,
  type LocalMediaImportProgress,
} from "./capture-center-core";

export const LEGACY_CAPTURE_CENTER_VIEW_TYPE = "knowgrove-capture-center";
export const LINK_CAPTURE_VIEW_TYPE = "knowgrove-link-capture";
export const DESKTOP_RECORDER_VIEW_TYPE = "knowgrove-desktop-recorder";

export class LinkCaptureModal extends Modal {
  private unsubscribe?: () => void;
  private readonly prunedHistoricalIds = new Set<string>();
  private jobs: BrowserCaptureJob[] = [];
  private queueContainerEl?: HTMLElement;

  constructor(
    private readonly plugin: KnowGrovePlugin,
    private readonly onClosed: () => void,
  ) {
    super(plugin.app);
  }

  onOpen(): void {
    this.modalEl.addClass("knowgrove-capture-modal", "knowgrove-link-capture-modal");
    // Prune jobs that were already finished BEFORE this modal session was opened
    const currentJobs = this.plugin.getCaptureJobs();
    for (const job of currentJobs) {
      if (job.status === "completed" || job.status === "partial" || job.status === "failed") {
        this.prunedHistoricalIds.add(job.id);
      }
    }
    this.plugin.pruneFinishedCaptureJobs(this.prunedHistoricalIds);

    this.render();

    this.unsubscribe = this.plugin.subscribeCaptureJobs((jobs) => {
      this.jobs = jobs;
      this.renderQueue();
    });
  }

  onClose(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.queueContainerEl = undefined;
    this.contentEl.empty();
    this.onClosed();
  }

  private render(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("knowgrove-capture-view", "knowgrove-link-capture-view");

    root.createEl("p", {
      cls: "knowgrove-capture-help",
      text: "每行一个链接，支持单篇或批量添加。点击提交后进入后台排队，单任务串行解析。",
    });

    const textarea = root.createEl("textarea", {
      cls: "knowgrove-batch-link-input",
      attr: {
        rows: "5",
        placeholder: "https://example.com/article\nhttps://www.bilibili.com/video/...",
        "aria-label": "批量链接，每行一个",
      },
    });

    const footer = root.createDiv("knowgrove-batch-link-footer");
    const count = footer.createSpan({ text: "0 个链接" });
    const submit = footer.createEl("button", { cls: "mod-cta", text: "添加到解析队列" });
    submit.disabled = true;

    const updateCount = (): void => {
      const total = extractBatchCaptureUrls(textarea.value).length;
      count.setText(total > 0 ? `已识别 ${total} 个链接` : "0 个链接");
      submit.disabled = total === 0;
    };

    textarea.addEventListener("input", updateCount);

    const handleSubmit = (): void => {
      const raw = textarea.value;
      const urls = extractBatchCaptureUrls(raw);
      if (!urls.length) return;

      // Immediately clear textarea so user can continue entering more links
      textarea.value = "";
      updateCount();
      textarea.focus();

      new Notice(`已添加 ${urls.length} 篇链接至后台解析队列`, 4000);

      void this.plugin.captureBatchLinks(raw).catch((error) => {
        new Notice(`添加链接失败：${error instanceof Error ? error.message : String(error)}`, 7000);
      });
    };

    textarea.addEventListener("keydown", (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        handleSubmit();
      }
    });

    submit.addEventListener("click", () => {
      handleSubmit();
    });

    this.queueContainerEl = root.createDiv("knowgrove-queue-container");
    this.renderQueue();

    window.setTimeout(() => textarea.focus(), 0);
  }

  private renderQueue(): void {
    const container = this.queueContainerEl;
    if (!container) return;
    container.empty();

    // Filter out jobs that finished before this modal session opened
    const visibleJobs = this.jobs.filter((job) => !this.prunedHistoricalIds.has(job.id));
    if (!visibleJobs.length) {
      return;
    }

    const runningJobs = visibleJobs.filter((job) => job.status === "running" || job.status === "cancelling");
    const queuedJobs = visibleJobs.filter((job) => job.status === "queued");
    const finishedJobs = visibleJobs.filter((job) => job.status === "completed" || job.status === "partial" || job.status === "failed");

    const header = container.createDiv("knowgrove-queue-header");
    header.createSpan({ cls: "knowgrove-queue-title", text: "解析队列" });
    const stats = header.createDiv("knowgrove-queue-stats");
    if (runningJobs.length) stats.createSpan({ text: `${runningJobs.length} 进行中` });
    if (queuedJobs.length) stats.createSpan({ text: `${queuedJobs.length} 排队中` });
    if (finishedJobs.length) stats.createSpan({ text: `${finishedJobs.length} 已完成` });

    const list = container.createDiv("knowgrove-queue-list");

    // 1. Running jobs
    for (const job of runningJobs) {
      const item = list.createDiv("knowgrove-queue-item is-running");
      const main = item.createDiv("knowgrove-queue-item-main");
      const left = main.createDiv("knowgrove-queue-item-left");

      const tag = left.createSpan({ cls: "knowgrove-queue-tag tag-running" });
      const tagIcon = tag.createSpan({ cls: "knowgrove-queue-spin" });
      setIcon(tagIcon, "loader-2");
      tag.createSpan({ text: " 解析中" });

      left.createSpan({ cls: "knowgrove-queue-item-title", text: job.title || job.url });

      const right = main.createDiv("knowgrove-queue-item-right");
      right.createSpan({ cls: "knowgrove-queue-percent", text: `${Math.round(job.progress || 0)}%` });

      const cancelBtn = right.createEl("button", { cls: "knowgrove-queue-action-btn", text: "取消" });
      cancelBtn.addEventListener("click", () => {
        cancelBtn.disabled = true;
        void this.plugin.cancelCaptureJob(job.id);
      });

      const bar = item.createDiv("knowgrove-queue-progress-bar");
      const fill = bar.createDiv("knowgrove-queue-progress-fill");
      fill.style.width = `${Math.min(100, Math.max(0, Math.round(job.progress || 0)))}%`;

      const statusEl = item.createDiv("knowgrove-queue-item-status");
      statusEl.createSpan({ text: job.message || job.phaseLabel || "正在解析..." });
    }

    // 2. Queued jobs
    for (let i = 0; i < queuedJobs.length; i += 1) {
      const job = queuedJobs[i]!;
      const item = list.createDiv("knowgrove-queue-item is-queued");
      const main = item.createDiv("knowgrove-queue-item-main");
      const left = main.createDiv("knowgrove-queue-item-left");

      const tag = left.createSpan({ cls: "knowgrove-queue-tag" });
      tag.setText(`排队 #${i + 1}`);

      left.createSpan({ cls: "knowgrove-queue-item-title", text: job.title || job.url });

      const right = main.createDiv("knowgrove-queue-item-right");
      const cancelBtn = right.createEl("button", { cls: "knowgrove-queue-action-btn", text: "取消" });
      cancelBtn.addEventListener("click", () => {
        cancelBtn.disabled = true;
        void this.plugin.cancelCaptureJob(job.id);
      });
    }

    // 3. Finished jobs (in this open session)
    for (const job of finishedJobs) {
      const isFailed = job.status === "failed";
      const item = list.createDiv(`knowgrove-queue-item is-${job.status}`);
      const main = item.createDiv("knowgrove-queue-item-main");
      const left = main.createDiv("knowgrove-queue-item-left");

      const tag = left.createSpan({ cls: `knowgrove-queue-tag ${isFailed ? "tag-failed" : "tag-completed"}` });
      const tagIcon = tag.createSpan();
      setIcon(tagIcon, isFailed ? "alert-circle" : "check");
      tag.createSpan({ text: isFailed ? " 失败" : " 已完成" });

      const displayTitle = job.result?.title || job.title || job.url;
      left.createSpan({ cls: "knowgrove-queue-item-title", text: displayTitle });

      const right = main.createDiv("knowgrove-queue-item-right");
      const filePath = job.result?.relativePath || job.createdNotePath || job.targetPath;
      if (filePath && !isFailed) {
        const openBtn = right.createEl("button", { cls: "knowgrove-queue-action-btn mod-cta", text: "打开笔记" });
        const arrow = openBtn.createSpan("knowgrove-batch-link-result-arrow");
        setIcon(arrow, "arrow-up-right");
        openBtn.addEventListener("click", () => {
          void this.plugin.openVaultFile(filePath);
        });
      }

      if (isFailed && job.error) {
        const statusEl = item.createDiv("knowgrove-queue-item-status");
        statusEl.createSpan({ text: `错误：${job.error}` });
      }
    }
  }
}

export class DesktopRecorderView extends ItemView {
  private unsubscribeRecording?: () => void;
  private recordingSnapshot: DesktopRecordingSnapshot;
  private recordingTitle = "";
  private mediaImportBusy = false;
  private readonly mediaImportResults = new Map<string, LocalMediaImportProgress>();

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
      this.renderMediaImport(container);
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
      this.renderMediaImport(container);
    }
  }

  private renderMediaImport(container: HTMLElement): void {
    const section = container.createDiv("knowgrove-media-import");
    section.createEl("h4", { text: "导入音视频" });
    const input = section.createEl("input", {
      type: "file",
      cls: "knowgrove-media-import-input",
      attr: {
        accept: LOCAL_MEDIA_IMPORT_ACCEPT,
        multiple: "true",
        "aria-label": "选择本地音频或视频",
      },
    });
    const dropZone = section.createDiv({
      cls: `knowgrove-media-drop-zone${this.mediaImportBusy ? " is-busy" : ""}`,
      attr: {
        role: "button",
        tabindex: this.mediaImportBusy ? "-1" : "0",
        "aria-disabled": this.mediaImportBusy ? "true" : "false",
        "aria-label": "拖拽或选择本地音频和视频",
      },
    });
    const icon = dropZone.createSpan("knowgrove-media-drop-icon");
    setIcon(icon, this.mediaImportBusy ? "loader-circle" : "file-up");
    dropZone.createEl("strong", { text: this.mediaImportBusy ? "正在导入…" : "拖拽音频或视频到这里" });
    dropZone.createSpan({ text: "或点击选择文件" });
    section.createEl("p", {
      cls: "knowgrove-capture-help knowgrove-media-format-help",
      text: `支持格式：${LOCAL_MEDIA_IMPORT_FORMAT_LABEL}`,
    });

    const choose = (): void => {
      if (!this.mediaImportBusy) input.click();
    };
    dropZone.addEventListener("click", choose);
    dropZone.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      choose();
    });
    for (const eventName of ["dragenter", "dragover"] as const) {
      dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        if (!this.mediaImportBusy) dropZone.addClass("is-dragover");
      });
    }
    for (const eventName of ["dragleave", "drop"] as const) {
      dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropZone.removeClass("is-dragover");
      });
    }
    dropZone.addEventListener("drop", (event) => {
      if (this.mediaImportBusy) return;
      void this.importMediaFiles(Array.from(event.dataTransfer?.files ?? []));
    });
    input.addEventListener("change", () => {
      const selected = Array.from(input.files ?? []);
      input.value = "";
      void this.importMediaFiles(selected);
    });

    const results = section.createDiv("knowgrove-media-import-results");
    for (const result of this.mediaImportResults.values()) {
      const row = results.createDiv(`knowgrove-media-import-result is-${result.state}`);
      const stateIcon = row.createSpan("knowgrove-media-import-result-icon");
      setIcon(
        stateIcon,
        result.state === "completed"
          ? "circle-check"
          : result.state === "failed"
            ? "circle-alert"
            : result.state === "copying"
              ? "copy"
              : "loader-circle",
      );
      const text = row.createDiv("knowgrove-media-import-result-text");
      text.createEl("strong", { text: result.title });
      text.createSpan({ text: result.message });
      if (result.notePath) {
        const open = row.createEl("button", {
          cls: "clickable-icon",
          attr: { "aria-label": `打开笔记：${result.title}` },
        });
        setIcon(open, "arrow-up-right");
        open.addEventListener("click", () => void this.plugin.openVaultFile(result.notePath!));
      }
    }
  }

  private async importMediaFiles(files: File[]): Promise<void> {
    if (!files.length || this.mediaImportBusy) return;
    const supported = files.filter((file) => localMediaImportType(file.name));
    if (!supported.length) {
      new Notice(`没有可导入的音视频文件。支持格式：${LOCAL_MEDIA_IMPORT_FORMAT_LABEL}`, 8000);
      return;
    }
    this.mediaImportBusy = true;
    this.render();
    try {
      const result = await this.plugin.importLocalMediaFiles(supported, (progress) => {
        this.mediaImportResults.set(progress.id, progress);
        this.render();
      });
      new Notice(
        `已导入 ${result.imported} 个文件并开始后台解析${result.failed ? `，${result.failed} 个失败` : ""}`,
        result.failed ? 8000 : 5000,
      );
    } catch (error) {
      new Notice(`导入失败：${error instanceof Error ? error.message : String(error)}`, 9000);
    } finally {
      this.mediaImportBusy = false;
      this.render();
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
  private position?: { left: number; top: number };

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
    if (this.position) this.placeWithinViewport(this.position.left, this.position.top);
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
      this.position = {
        left: Math.round(bounds.left),
        top: Math.round(bounds.top),
      };
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
    root.setCssProps({
      left: `${safeLeft}px`,
      top: `${safeTop}px`,
      right: "auto",
      bottom: "auto",
    });
  }
}
