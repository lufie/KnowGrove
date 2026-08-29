import { App, Modal, Notice, Setting } from "obsidian";
import {
  formatImageTextElapsedLabel,
  formatImageTextTaskCounts,
  translateKnowGroveText,
} from "./i18n";
import {
  formatImageTextElapsed,
  imageTextPhaseLabel,
  imageTextProgressValue,
  imageTextTaskIsActive,
  type ImageTextFailureDetail,
  type ImageTextTaskPhase,
} from "./image-text-progress-core";

export class ImageTextConfirmModal extends Modal {
  constructor(
    app: App,
    private readonly title: string,
    private readonly details: string[],
    private readonly confirmLabel: string,
    private readonly onConfirm: () => Promise<void>,
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("knowgrove-modal", "knowgrove-image-text-modal");
    this.titleEl.setText(this.title);
    const list = this.contentEl.createEl("ul", { cls: "knowgrove-image-text-details" });
    for (const detail of this.details) list.createEl("li", { text: detail });
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText(translateKnowGroveText("取消")).onClick(() => this.close()))
      .addButton((button) => button.setCta().setButtonText(this.confirmLabel).onClick(async () => {
        button.setDisabled(true).setButtonText(translateKnowGroveText("正在启动…"));
        this.close();
        await this.onConfirm();
      }));
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

class ImageTextTaskModal extends Modal {
  constructor(app: App, private readonly renderContent: (titleEl: HTMLElement, contentEl: HTMLElement) => void) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("knowgrove-modal", "knowgrove-image-text-modal");
    this.refresh();
  }

  refresh(): void {
    if (!this.contentEl.isConnected) return;
    this.renderContent(this.titleEl, this.contentEl);
  }

  isShowing(): boolean {
    return this.modalEl.isConnected;
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export interface ImageTextProgressTaskOptions {
  id: string;
  noteName: string;
  imageTarget: string;
  total: number;
  onCancel: () => void;
  onLocate: () => Promise<void>;
}

export interface ImageTextProgressState {
  phase: ImageTextTaskPhase;
  message: string;
  imageTarget: string;
  current: number;
  completed: number;
  failed: number;
  skipped: number;
  failures: ImageTextFailureDetail[];
}

export class ImageTextProgressCenter {
  private rootEl?: HTMLElement;
  private readonly tasks = new Set<ImageTextProgressTask>();

  constructor(private readonly app: App) {}

  createTask(options: ImageTextProgressTaskOptions): ImageTextProgressTask {
    if (!this.rootEl?.isConnected) {
      this.rootEl = this.app.workspace.containerEl.createDiv({
        cls: "knowgrove-image-text-task-stack",
        attr: { "aria-label": translateKnowGroveText("图片转文字后台任务") },
      });
    }
    const task = new ImageTextProgressTask(
      this.app,
      this.rootEl,
      options,
      () => {
        this.tasks.delete(task);
        if (!this.tasks.size) {
          this.rootEl?.remove();
          this.rootEl = undefined;
        }
      },
    );
    this.tasks.add(task);
    task.openDetails();
    return task;
  }

  destroy(): void {
    for (const task of Array.from(this.tasks)) task.dispose(true);
    this.tasks.clear();
    this.rootEl?.remove();
    this.rootEl = undefined;
  }
}

export class ImageTextProgressTask {
  private readonly startedAt = Date.now();
  private readonly modal: ImageTextTaskModal;
  private readonly cardEl: HTMLElement;
  private readonly elapsedEls = new Set<HTMLElement>();
  private timer?: number;
  private disposed = false;
  private state: ImageTextProgressState;

  constructor(
    app: App,
    rootEl: HTMLElement,
    private readonly options: ImageTextProgressTaskOptions,
    private readonly onDispose: () => void,
  ) {
    this.state = {
      phase: "preparing",
      message: imageTextPhaseLabel("preparing"),
      imageTarget: options.imageTarget,
      current: options.total > 0 ? 1 : 0,
      completed: 0,
      failed: 0,
      skipped: 0,
      failures: [],
    };
    this.modal = new ImageTextTaskModal(app, (titleEl, contentEl) => this.renderModal(titleEl, contentEl));
    this.cardEl = rootEl.createDiv({
      cls: "knowgrove-image-text-task-card",
      attr: { "data-task-id": options.id },
    });
    this.timer = window.setInterval(() => this.refreshElapsed(), 1_000);
    this.render();
  }

  update(update: Partial<ImageTextProgressState>): void {
    if (this.disposed) return;
    this.state = { ...this.state, ...update };
    this.render();
  }

  finish(phase: Extract<ImageTextTaskPhase, "completed" | "failed" | "cancelled">, message: string): void {
    if (this.disposed) return;
    this.state = { ...this.state, phase, message };
    window.clearInterval(this.timer);
    this.timer = undefined;
    this.render();
  }

  openDetails(): void {
    if (this.disposed) return;
    if (this.modal.isShowing()) {
      this.modal.refresh();
      this.refreshElapsed();
      return;
    }
    this.modal.open();
    this.refreshElapsed();
  }

  dispose(cancelActive = false): void {
    if (this.disposed) return;
    this.disposed = true;
    if (cancelActive && imageTextTaskIsActive(this.state.phase)) this.options.onCancel();
    window.clearInterval(this.timer);
    this.timer = undefined;
    this.modal.close();
    this.cardEl.remove();
    this.onDispose();
  }

  private requestCancel(): void {
    if (!imageTextTaskIsActive(this.state.phase) || this.state.phase === "cancelling") return;
    this.state = {
      ...this.state,
      phase: "cancelling",
      message: imageTextPhaseLabel("cancelling"),
    };
    this.options.onCancel();
    this.render();
  }

  private render(): void {
    this.elapsedEls.clear();
    this.renderCard();
    this.modal.refresh();
    this.refreshElapsed();
  }

  private renderCard(): void {
    this.cardEl.empty();
    const active = imageTextTaskIsActive(this.state.phase);
    this.cardEl.toggleClass("is-finished", !active);
    this.cardEl.toggleClass("is-failed", this.state.phase === "failed");
    this.cardEl.createDiv({
      cls: "knowgrove-image-text-task-eyebrow",
      text: translateKnowGroveText("图片转文字"),
    });
    const locate = this.cardEl.createEl("button", {
      cls: "knowgrove-image-text-task-locate",
      attr: { type: "button", "aria-label": translateKnowGroveText("定位转换位置") },
    });
    locate.createDiv({ cls: "knowgrove-image-text-task-title", text: this.options.noteName });
    locate.createDiv({ cls: "knowgrove-image-text-task-target", text: this.state.imageTarget });
    locate.addEventListener("click", () => void this.locate());
    this.renderStatus(this.cardEl);
    const actions = this.cardEl.createDiv("knowgrove-image-text-task-actions");
    actions.createEl("button", { text: translateKnowGroveText("详情") })
      .addEventListener("click", () => this.openDetails());
    if (active) {
      const cancel = actions.createEl("button", {
        text: translateKnowGroveText(this.state.phase === "cancelling" ? "正在取消…" : "取消后续处理"),
      });
      cancel.disabled = this.state.phase === "cancelling";
      cancel.addEventListener("click", () => this.requestCancel());
    } else {
      actions.createEl("button", { text: translateKnowGroveText("关闭") })
        .addEventListener("click", () => this.dispose());
    }
  }

  private renderModal(titleEl: HTMLElement, contentEl: HTMLElement): void {
    const active = imageTextTaskIsActive(this.state.phase);
    contentEl.empty();
    titleEl.setText(translateKnowGroveText(active ? "正在转换图片" : "图片转文字已结束"));
    contentEl.createEl("p", { text: this.state.message });
    if (this.state.failures.length) {
      const section = contentEl.createDiv("knowgrove-image-text-failures");
      section.createEl("strong", { text: translateKnowGroveText("失败项目") });
      const list = section.createEl("ul");
      for (const failure of this.state.failures) {
        list.createEl("li", { text: `${failure.target} · ${failure.category}：${failure.message}` });
      }
      section.createEl("p", { text: translateKnowGroveText("修复问题后可再次转换本文，已完成结果会原位更新。") });
    }
    this.renderStatus(contentEl);
    const actions = contentEl.createDiv("knowgrove-rewrite-actions");
    actions.createEl("button", { text: translateKnowGroveText("定位转换位置") })
      .addEventListener("click", () => void this.locate());
    if (active) {
      const cancel = actions.createEl("button", {
        text: translateKnowGroveText(this.state.phase === "cancelling" ? "正在取消…" : "取消后续处理"),
      });
      cancel.disabled = this.state.phase === "cancelling";
      cancel.addEventListener("click", () => this.requestCancel());
      actions.createEl("button", { text: translateKnowGroveText("转到后台") })
        .addEventListener("click", () => this.modal.close());
    } else {
      actions.createEl("button", { text: translateKnowGroveText("关闭") })
        .addEventListener("click", () => this.modal.close());
    }
  }

  private renderStatus(parent: HTMLElement): void {
    parent.createDiv({
      cls: "knowgrove-image-text-task-phase",
      text: translateKnowGroveText(imageTextPhaseLabel(this.state.phase)),
    });
    const elapsed = parent.createSpan({ cls: "knowgrove-image-text-task-elapsed" });
    this.elapsedEls.add(elapsed);
    const progress = parent.createEl("progress", {
      cls: "knowgrove-image-text-progress",
      attr: { max: String(Math.max(1, this.options.total)) },
    });
    const value = imageTextProgressValue(
      this.state.phase,
      this.state.completed,
      this.state.failed,
      this.state.skipped,
    );
    if (value !== undefined) progress.value = value;
    parent.createDiv({
      cls: "setting-item-description knowgrove-image-text-task-counts",
      text: formatImageTextTaskCounts(
        this.state.current,
        this.options.total,
        this.state.completed,
        this.state.skipped,
        this.state.failed,
      ),
    });
  }

  private refreshElapsed(): void {
    if (this.disposed) return;
    const value = formatImageTextElapsedLabel(formatImageTextElapsed(this.startedAt));
    for (const element of this.elapsedEls) element.setText(value);
  }

  private async locate(): Promise<void> {
    if (this.disposed) return;
    try {
      await this.options.onLocate();
    } catch (error) {
      console.error("KnowGrove: failed to locate image-to-text task", error);
      new Notice(translateKnowGroveText("定位失败，请稍后重试"), 6000);
    }
  }
}
