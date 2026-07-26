import { Modal, Notice, Setting } from "obsidian";
import type KnowGrovePlugin from "./main";
import type { KnowledgeThemeSummary, ThemeSynthesisProposal } from "./types";

export class ThemeSynthesisModal extends Modal {
  constructor(
    private readonly plugin: KnowGrovePlugin,
    private readonly theme: KnowledgeThemeSummary,
    private readonly proposal: ThemeSynthesisProposal,
    private readonly onApply: () => Promise<void>,
  ) {
    super(plugin.app);
  }

  onOpen(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("knowgrove-theme-synthesis-modal");
    this.titleEl.setText(`AI 整理主题：${this.theme.name}`);
    root.createEl("p", { text: this.proposal.summary });

    const metrics = root.createDiv("knowgrove-theme-synthesis-metrics");
    this.metric(metrics, String(this.theme.total), "相关资料");
    this.metric(metrics, String(this.proposal.dimensions.length), "研究维度");
    this.metric(metrics, String(this.proposal.propositions.length), "命题候选");
    this.metric(metrics, String(this.proposal.gaps.length), "知识缺口");

    this.renderList(root, "研究维度", this.proposal.dimensions.map((item) => `${item.name}：${item.question}`));
    this.renderList(root, "命题候选", this.proposal.propositions.map((item) => {
      const evidence = item.evidencePaths.length ? ` · ${item.evidencePaths.length} 条资料证据` : "";
      return `${item.title}（${item.status}）${evidence}`;
    }));
    this.renderList(root, "待研究问题", this.proposal.gaps);
    this.renderList(root, "应用与输出", this.proposal.outputs.map((item) => `${item.title}（${item.format}）：${item.angle}`));

    root.createEl("p", {
      cls: "setting-item-description",
      text: "采用后只更新主题文档中的 AI 建议区块，不改动原始资料，也不会覆盖“已确认知识”等人工内容。",
    });
    new Setting(root)
      .addButton((button) => button.setButtonText("取消").onClick(() => this.close()))
      .addButton((button) => button
        .setCta()
        .setButtonText("采用到主题空间")
        .onClick(async () => {
          button.setDisabled(true).setButtonText("正在写入…");
          try {
            await this.onApply();
            this.close();
          } catch (error) {
            button.setDisabled(false).setButtonText("重试写入");
            console.error("KnowGrove: failed to apply theme synthesis", error);
            new Notice(`主题建议写入失败：${error instanceof Error ? error.message : String(error)}`);
          }
        }));
  }

  private metric(container: HTMLElement, value: string, label: string): void {
    const item = container.createDiv("knowgrove-theme-synthesis-metric");
    item.createDiv({ cls: "knowgrove-theme-synthesis-value", text: value });
    item.createDiv({ cls: "knowgrove-theme-synthesis-label", text: label });
  }

  private renderList(container: HTMLElement, title: string, items: string[]): void {
    if (!items.length) return;
    const section = container.createDiv("knowgrove-theme-synthesis-section");
    section.createEl("h3", { text: title });
    const list = section.createEl("ul");
    for (const item of items) list.createEl("li", { text: item });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
