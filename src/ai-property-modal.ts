import { App, Modal, Setting } from "obsidian";

export class AIPropertyBatchModal extends Modal {
  constructor(
    app: App,
    private readonly noteCount: number,
    private readonly fields: string[],
    private readonly provider: string,
    private readonly onConfirm: () => Promise<void>,
    private readonly mode: "missing" | "repair" = "missing",
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(this.mode === "repair" ? "AI 批量规范语义属性" : "AI 补齐缺失属性");
    this.contentEl.addClass("knowgrove-ai-batch-modal");
    this.contentEl.createEl("p", {
      text: this.mode === "repair"
        ? `将使用 ${this.provider} 分批并发分析 ${this.noteCount} 篇待规范笔记，只处理审计指出的语义字段。确认后才会替换不符合规范的值；开启空行整理时，会在该篇属性处理成功后同时整理正文。`
        : `将使用 ${this.provider} 分批并发分析 ${this.noteCount} 篇笔记。只处理缺失或为空的 AI 管理字段，不覆盖已有属性。`,
    });
    const summary = this.contentEl.createDiv("knowgrove-ai-batch-summary");
    summary.createDiv({ text: `${this.noteCount} 篇笔记` });
    summary.createDiv({ text: this.fields.join(" / ") });
    this.contentEl.createEl("p", {
      cls: "setting-item-description",
      text: this.mode === "repair"
        ? "笔记标题、现有属性和截断后的正文会按小批次发送给所选模型。只会写入本次审计涉及的字段；调用可能产生模型费用，已完成批次会立即保存。"
        : "笔记标题、现有属性和截断后的正文会按小批次发送给所选模型。调用可能产生模型费用；已完成批次会立即保存，失败或中断后再次执行只会处理剩余缺失字段。",
    });
    new Setting(this.contentEl)
      .addButton((button) => button
        .setButtonText("取消")
        .onClick(() => this.close()))
      .addButton((button) => button
        .setCta()
        .setButtonText("开始处理")
        .onClick(async () => {
          button.setDisabled(true).setButtonText("正在启动…");
          this.close();
          await this.onConfirm();
        }));
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
