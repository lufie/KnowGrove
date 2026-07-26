import {
  AbstractInputSuggest,
  App,
  ButtonComponent,
  DropdownComponent,
  Modal,
  Notice,
  TFile,
  TextAreaComponent,
  TextComponent,
  setIcon,
} from "obsidian";
import type KnowGrovePlugin from "./main";
import type { ReferenceRecord } from "./types";

export interface ReferenceDraft {
  comment: string;
  targetFile?: TFile;
  targetHeading?: string;
}

export class TargetFileSuggest extends AbstractInputSuggest<TFile> {
  constructor(
    app: App,
    inputEl: HTMLInputElement,
    private readonly files: TFile[],
    private readonly onPick: (file: TFile) => void,
  ) {
    super(app, inputEl);
  }

  getSuggestions(query: string): TFile[] {
    const normalized = query.trim().toLocaleLowerCase();
    const ranked = [...this.files].sort((a, b) => a.path.localeCompare(b.path, "zh-CN"));
    if (!normalized) return ranked.slice(0, 30);
    return ranked
      .filter((file) => `${file.basename} ${file.path}`.toLocaleLowerCase().includes(normalized))
      .slice(0, 30);
  }

  renderSuggestion(file: TFile, el: HTMLElement): void {
    el.addClass("knowgrove-file-suggestion");
    const icon = el.createSpan("knowgrove-suggestion-icon");
    setIcon(icon, "file-text");
    const body = el.createDiv();
    body.createDiv({ cls: "knowgrove-suggestion-title", text: file.basename });
    body.createDiv({ cls: "knowgrove-suggestion-path", text: file.path });
  }

  selectSuggestion(file: TFile): void {
    this.setValue(file.path);
    this.onPick(file);
    this.close();
  }
}

export class ReferenceComposerModal extends Modal {
  private comment = "";
  private targetFile?: TFile;
  private targetText = "";
  private targetHeading = "";
  private headingDropdown?: DropdownComponent;
  private targetSuggest?: TargetFileSuggest;
  private submitButton?: ButtonComponent;

  constructor(
    private readonly plugin: KnowGrovePlugin,
    private readonly sourceFile: TFile,
    private readonly selectedText: string,
    private readonly onSubmit: (draft: ReferenceDraft) => Promise<void>,
  ) {
    super(plugin.app);
  }

  onOpen(): void {
    this.modalEl.addClass("knowgrove-modal");
    this.titleEl.setText("评论并引用选中内容");

    const intro = this.contentEl.createDiv("knowgrove-modal-intro");
    const source = intro.createDiv("knowgrove-source-label");
    const sourceIcon = source.createSpan();
    setIcon(sourceIcon, "file-text");
    source.createSpan({ text: this.sourceFile.basename });
    const preview = intro.createEl("blockquote", { cls: "knowgrove-selection-preview" });
    preview.setText(this.selectedText.length > 360 ? `${this.selectedText.slice(0, 360)}…` : this.selectedText);

    this.contentEl.createEl("label", { cls: "knowgrove-field-label", text: "评论" });
    const comment = new TextAreaComponent(this.contentEl)
      .setPlaceholder("写下你的判断、疑问或下一步…")
      .onChange((value) => {
        this.comment = value;
        this.updateSubmitState();
      });
    comment.inputEl.addClass("knowgrove-comment-input");
    comment.inputEl.rows = 5;

    const targetLabel = this.contentEl.createDiv("knowgrove-field-heading");
    targetLabel.createEl("label", { cls: "knowgrove-field-label", text: "添加到另一篇笔记" });
    targetLabel.createSpan({ text: "可选", cls: "knowgrove-optional" });

    const targetInputWrap = this.contentEl.createDiv("knowgrove-input-with-icon");
    const targetIcon = targetInputWrap.createSpan();
    setIcon(targetIcon, "search");
    const targetInput = new TextComponent(targetInputWrap)
      .setPlaceholder("搜索目标笔记…")
      .onChange((value) => {
        this.targetText = value.trim();
        if (this.targetFile?.path !== this.targetText) {
          this.targetFile = undefined;
          this.refreshHeadingOptions();
        }
      });
    targetInput.inputEl.setAttribute("aria-label", "目标笔记路径");

    const files = this.plugin.getReferenceTargetFiles(this.sourceFile);
    this.targetSuggest = new TargetFileSuggest(this.app, targetInput.inputEl, files, (file) => {
      this.targetFile = file;
      this.targetText = file.path;
      this.refreshHeadingOptions();
    });

    const headingRow = this.contentEl.createDiv("knowgrove-heading-row");
    headingRow.createEl("label", { cls: "knowgrove-field-label", text: "插入位置" });
    this.headingDropdown = new DropdownComponent(headingRow)
      .onChange((value) => {
        this.targetHeading = value;
      });
    this.refreshHeadingOptions();

    const hint = this.contentEl.createDiv("knowgrove-modal-hint");
    const hintIcon = hint.createSpan();
    setIcon(hintIcon, "info");
    hint.createSpan({ text: "目标笔记会插入原生块嵌入；之后修改原文，引用内容会自动更新。" });

    const footer = this.contentEl.createDiv("modal-button-container knowgrove-modal-actions");
    new ButtonComponent(footer).setButtonText("取消").onClick(() => this.close());
    this.submitButton = new ButtonComponent(footer)
      .setButtonText("保存评论")
      .setCta()
      .setIcon("message-square-plus")
      .onClick(() => void this.handleSubmit());
    this.updateSubmitState();

    window.setTimeout(() => comment.inputEl.focus(), 50);
  }

  onClose(): void {
    this.targetSuggest?.close();
    this.contentEl.empty();
  }

  private refreshHeadingOptions(): void {
    if (!this.headingDropdown) return;
    const select = this.headingDropdown.selectEl;
    select.empty();
    this.headingDropdown.addOption("", "文档末尾");

    const defaultHeading = this.plugin.settings.defaultTargetHeading.trim();
    if (defaultHeading) this.headingDropdown.addOption(defaultHeading, `${defaultHeading}（默认）`);

    if (this.targetFile) {
      const headings = this.app.metadataCache.getFileCache(this.targetFile)?.headings ?? [];
      const seen = new Set<string>(defaultHeading ? [defaultHeading] : []);
      for (const heading of headings) {
        if (seen.has(heading.heading)) continue;
        seen.add(heading.heading);
        const prefix = "　".repeat(Math.max(0, heading.level - 1));
        this.headingDropdown.addOption(heading.heading, `${prefix}${heading.heading}`);
      }
    }

    this.targetHeading = defaultHeading;
    this.headingDropdown.setValue(defaultHeading);
    this.headingDropdown.setDisabled(!this.targetText);
  }

  private updateSubmitState(): void {
    this.submitButton?.setDisabled(!this.comment.trim());
  }

  private async handleSubmit(): Promise<void> {
    if (!this.comment.trim()) {
      new Notice("请先写下评论");
      return;
    }

    let target = this.targetFile;
    if (this.targetText && !target) {
      const abstract = this.app.vault.getAbstractFileByPath(this.targetText);
      if (!(abstract instanceof TFile) || abstract.extension !== "md") {
        new Notice("请选择一个有效的 Markdown 目标笔记");
        return;
      }
      target = abstract;
    }
    if (target?.path === this.sourceFile.path) {
      new Notice("目标笔记需要与原文不同");
      return;
    }

    this.submitButton?.setDisabled(true).setButtonText("保存中…");
    try {
      await this.onSubmit({
        comment: this.comment.trim(),
        targetFile: target,
        targetHeading: target ? this.targetHeading : undefined,
      });
      this.close();
    } catch (error) {
      console.error("KnowGrove: failed to create reference", error);
      new Notice("保存失败，请查看开发者控制台");
      this.submitButton?.setDisabled(false).setButtonText("保存评论");
    }
  }
}

export class EditReferenceModal extends Modal {
  private comment: string;

  constructor(
    private readonly plugin: KnowGrovePlugin,
    private readonly record: ReferenceRecord,
  ) {
    super(plugin.app);
    this.comment = record.comment;
  }

  onOpen(): void {
    this.modalEl.addClass("knowgrove-modal", "knowgrove-edit-modal");
    this.titleEl.setText("编辑评论");

    const sourceRow = this.contentEl.createDiv("knowgrove-reference-meta");
    const icon = sourceRow.createSpan();
    setIcon(icon, "quote");
    sourceRow.createSpan({ text: this.record.sourcePath });
    if (this.record.targetPath) {
      const arrow = sourceRow.createSpan({ text: "→", cls: "knowgrove-reference-arrow" });
      arrow.setAttribute("aria-hidden", "true");
      sourceRow.createSpan({ text: this.record.targetPath });
    }

    const preview = this.contentEl.createEl("blockquote", { cls: "knowgrove-selection-preview" });
    preview.setText(this.record.selectedText.length > 360 ? `${this.record.selectedText.slice(0, 360)}…` : this.record.selectedText);

    this.contentEl.createEl("label", { cls: "knowgrove-field-label", text: "评论" });
    const input = new TextAreaComponent(this.contentEl)
      .setValue(this.comment)
      .onChange((value) => {
        this.comment = value;
      });
    input.inputEl.addClass("knowgrove-comment-input");
    input.inputEl.rows = 6;

    const footer = this.contentEl.createDiv("modal-button-container knowgrove-modal-actions");
    new ButtonComponent(footer)
      .setButtonText("打开原文")
      .setIcon("external-link")
      .onClick(async () => {
        await this.plugin.openReferenceSource(this.record);
        this.close();
      });
    new ButtonComponent(footer).setButtonText("取消").onClick(() => this.close());
    new ButtonComponent(footer)
      .setButtonText("保存修改")
      .setCta()
      .onClick(async () => {
        if (!this.comment.trim()) {
          new Notice("评论不能为空");
          return;
        }
        await this.plugin.updateReferenceComment(this.record.id, this.comment.trim());
        this.close();
      });

    window.setTimeout(() => input.inputEl.focus(), 50);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class BlockCommentsModal extends Modal {
  constructor(
    private readonly plugin: KnowGrovePlugin,
    private readonly records: ReferenceRecord[],
  ) {
    super(plugin.app);
  }

  onOpen(): void {
    this.modalEl.addClass("knowgrove-modal", "knowgrove-comments-modal");
    this.titleEl.setText(this.records.length > 1 ? `${this.records.length} 条评论` : "评论");
    const list = this.contentEl.createDiv("knowgrove-comments-list");

    for (const record of this.records) {
      const card = list.createDiv("knowgrove-comment-card");
      card.createDiv({ cls: "knowgrove-comment-text", text: record.comment });
      const meta = card.createDiv("knowgrove-comment-card-meta");
      meta.createSpan({ text: record.targetPath ? `已引用到 ${record.targetPath}` : "仅保存在原文" });
      const edit = meta.createEl("button", {
        cls: "clickable-icon",
        attr: { "aria-label": "编辑评论" },
      });
      setIcon(edit, "pencil");
      edit.addEventListener("click", () => {
        this.close();
        new EditReferenceModal(this.plugin, record).open();
      });
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
