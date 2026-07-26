import { ButtonComponent, Modal, Notice, setIcon } from "obsidian";
import type KnowGrovePlugin from "./main";
import type { ResearchSourceDecision } from "./research-sources";
import type { KnowledgeThemeDocument } from "./types";

export class ResearchSourceScreeningModal extends Modal {
  constructor(
    private readonly plugin: KnowGrovePlugin,
    private readonly decisions: ResearchSourceDecision[],
    private readonly documents: KnowledgeThemeDocument[],
    private readonly onApply: () => Promise<void>,
  ) {
    super(plugin.app);
  }

  onOpen(): void {
    this.modalEl.addClass("knowgrove-modal", "knowgrove-source-screening-modal");
    this.titleEl.setText("确认 AI 资料筛选");
    const related = this.decisions.filter((item) => item.decision === "相关");
    const rejected = this.decisions.filter((item) => item.decision === "不相关");
    this.contentEl.createEl("p", {
      cls: "setting-item-description",
      text: `AI 判断 ${related.length} 篇相关、${rejected.length} 篇不相关。应用后，相关资料会建立课题关系；不相关资料会从当前课题候选区隐藏。`,
    });
    const byPath = new Map(this.documents.map((document) => [document.path, document]));
    this.renderGroup("相关资料", related, "circle-check-big", byPath);
    this.renderGroup("不相关资料", rejected, "circle-x", byPath);
    const footer = this.contentEl.createDiv("modal-button-container");
    new ButtonComponent(footer).setButtonText("取消").onClick(() => this.close());
    new ButtonComponent(footer).setCta().setButtonText("应用筛选结果").onClick(async () => {
      try {
        await this.onApply();
        this.close();
      } catch (error) {
        console.error("KnowGrove: failed to apply source screening", error);
        new Notice(`应用筛选失败：${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  private renderGroup(
    title: string,
    decisions: ResearchSourceDecision[],
    iconName: string,
    byPath: Map<string, KnowledgeThemeDocument>,
  ): void {
    const section = this.contentEl.createDiv("knowgrove-source-screening-group");
    const heading = section.createDiv("knowgrove-source-screening-heading");
    const icon = heading.createSpan();
    setIcon(icon, iconName);
    heading.createSpan({ text: `${title} · ${decisions.length}` });
    const list = section.createDiv("knowgrove-source-screening-list");
    for (const decision of decisions) {
      const row = list.createDiv("knowgrove-source-screening-row");
      row.createDiv({
        cls: "knowgrove-source-screening-title",
        text: byPath.get(decision.path)?.basename ?? decision.path,
      });
      if (decision.reason) row.createDiv({ cls: "knowgrove-source-screening-reason", text: decision.reason });
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
