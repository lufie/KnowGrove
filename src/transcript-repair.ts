import { App, Modal, Setting, TFile } from "obsidian";
import type { TranscriptReadability } from "./transcript-readability";
import { currentKnowGroveLocale } from "./i18n";
export { repairTranscriptNote } from "./transcript-repair-core";

export class TranscriptRepairModal extends Modal {
  private readonly controller = new AbortController();
  private started = false;

  constructor(app: App, private readonly file: TFile,
    private readonly repair: (signal: AbortSignal, progress: (processed: number, total: number) => Promise<void>) => Promise<TranscriptReadability>) { super(app); }

  onOpen(): void {
    const zh = currentKnowGroveLocale().startsWith("zh");
    this.titleEl.setText(zh ? "修复逐字稿标点" : "Repair transcript punctuation");
    this.contentEl.createEl("p", { text: this.file.basename });
    this.contentEl.createEl("p", { text: zh ? "使用当前选择的 AI 引擎补充标点与自然段，只处理完整逐字稿，保留原词、摘要、正文、时间轴及原始备份。关闭此窗口可取消。" : "Use the selected AI provider to restore punctuation and paragraphs in the full transcript only. Original words, other sections, timelines and backups are preserved. Close this window to cancel." });
    const status = this.contentEl.createDiv({ text: zh ? "等待开始" : "Ready" });
    new Setting(this.contentEl)
      .addButton(button => button.setButtonText(zh ? "取消" : "Cancel").onClick(() => this.close()))
      .addButton(button => button.setButtonText(zh ? "开始修复" : "Repair").setCta().onClick(async () => {
        if (this.started) return;
        this.started = true;
        button.setDisabled(true);
        status.setText(zh ? "正在检查逐字稿与原始备份…" : "Checking transcript and original backup…");
        try {
          const result = await this.repair(this.controller.signal, async (processed, total) => { status.setText(zh ? `正在补标点：${processed}/${total}` : `Restoring punctuation: ${processed}/${total}`); });
          status.setText(result.processed ? zh ? `修复完成，${result.processed} 段已校验并保存，原始文字保留在折叠备份中。` : `Saved ${result.processed} verified sections. Original text is kept in the folded backup.` : zh ? "未发现需要补标点的段落，笔记未修改。" : "No sections need punctuation. The note was not changed.");
        } catch (error) {
          status.setText(error instanceof Error ? error.message : String(error));
        }
      }));
  }

  onClose(): void { this.controller.abort(); this.contentEl.empty(); }
}
