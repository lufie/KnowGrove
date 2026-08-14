import { ItemView, Notice, TFile, WorkspaceLeaf, setIcon } from "obsidian";
import type KnowGrovePlugin from "./main";
import { TargetFileSuggest } from "./reference-modals";
import type { CommentSelectionDraft, ReferenceRecord } from "./types";

export const COMMENTS_VIEW_TYPE = "knowgrove-comments-view";

export class CommentsSidebarView extends ItemView {
  private sourcePath?: string;
  private draft?: CommentSelectionDraft;
  private activeRecordId?: string;
  private targetPickerId?: string;
  private deleteConfirmId?: string;
  private targetSuggests: TargetFileSuggest[] = [];

  constructor(leaf: WorkspaceLeaf, private readonly plugin: KnowGrovePlugin) {
    super(leaf);
  }

  getViewType(): string {
    return COMMENTS_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "评论";
  }

  getIcon(): string {
    return "messages-square";
  }

  async onOpen(): Promise<void> {
    this.sourcePath = this.app.workspace.getActiveFile()?.path;
    this.render();
  }

  async onClose(): Promise<void> {
    this.closeTargetSuggests();
  }

  showDraft(draft: CommentSelectionDraft): void {
    this.sourcePath = draft.sourcePath;
    this.draft = draft;
    this.activeRecordId = undefined;
    this.targetPickerId = undefined;
    this.deleteConfirmId = undefined;
    this.render();
  }

  showRecord(record: ReferenceRecord): void {
    this.sourcePath = record.sourcePath;
    this.draft = undefined;
    this.activeRecordId = record.id;
    this.targetPickerId = undefined;
    this.deleteConfirmId = undefined;
    this.render();
  }

  showDocument(sourcePath: string): void {
    this.sourcePath = sourcePath;
    this.draft = undefined;
    this.activeRecordId = undefined;
    this.targetPickerId = undefined;
    this.deleteConfirmId = undefined;
    this.render();
  }

  focusRecord(sourcePath: string, recordId: string): void {
    if (this.draft || (this.sourcePath === sourcePath && this.activeRecordId === recordId)) return;
    const focused = this.contentEl.ownerDocument.activeElement;
    if (focused instanceof HTMLElement
      && this.contentEl.contains(focused)
      && focused.matches("input, textarea, select")) return;
    this.sourcePath = sourcePath;
    this.activeRecordId = recordId;
    this.render();
  }

  refresh(sourcePath?: string): void {
    if (sourcePath) this.sourcePath = sourcePath;
    this.render();
  }

  private render(): void {
    this.closeTargetSuggests();
    const root = this.contentEl;
    root.empty();
    root.addClass("knowgrove-comments-view");

    const source = this.sourcePath
      ? this.app.vault.getAbstractFileByPath(this.sourcePath)
      : this.app.workspace.getActiveFile();
    if (source instanceof TFile) this.sourcePath = source.path;
    const records = this.sourcePath ? this.plugin.getReferencesForSource(this.sourcePath) : [];

    const header = root.createDiv("knowgrove-comments-header");
    const heading = header.createDiv();
    heading.createEl("h2", { text: "评论" });
    heading.createDiv({
      cls: "knowgrove-comments-file",
      text: source instanceof TFile ? source.basename : "未打开文档",
      attr: { title: source instanceof TFile ? source.path : "" },
    });
    header.createSpan({ cls: "knowgrove-comments-count", text: `${records.length}` });

    if (this.draft) this.renderComposer(root, this.draft);

    const list = root.createDiv("knowgrove-sidebar-comments-list");
    if (!records.length) {
      const empty = list.createDiv("knowgrove-comments-empty");
      const icon = empty.createSpan();
      setIcon(icon, "message-circle-dashed");
      empty.createEl("p", { text: this.draft ? "保存后，评论会出现在这里。" : "选中正文后，点击浮动评论图标即可添加。" });
      return;
    }

    for (const record of records) this.renderCommentCard(list, record);
    if (this.activeRecordId) {
      window.requestAnimationFrame(() => {
        list.querySelector<HTMLElement>(`[data-comment-id="${CSS.escape(this.activeRecordId ?? "")}"]`)
          ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
    }
  }

  private renderComposer(container: HTMLElement, draft: CommentSelectionDraft): void {
    const composer = container.createDiv("knowgrove-sidebar-composer");
    const label = composer.createDiv("knowgrove-sidebar-section-label");
    const icon = label.createSpan();
    setIcon(icon, "message-square-plus");
    label.createSpan({ text: "新评论" });
    composer.createEl("blockquote", {
      cls: "knowgrove-sidebar-selection",
      text: this.truncate(draft.selectedText, 220),
    });
    const input = composer.createEl("textarea", {
      cls: "knowgrove-sidebar-comment-input",
      attr: { placeholder: "写下你的判断、疑问或下一步…", "aria-label": "新评论内容" },
    });
    input.rows = 4;
    const actions = composer.createDiv("knowgrove-sidebar-composer-actions");
    const cancel = actions.createEl("button", { text: "取消" });
    cancel.addEventListener("click", () => {
      this.draft = undefined;
      this.render();
    });
    const save = actions.createEl("button", { cls: "mod-cta", text: "添加评论" });
    save.disabled = true;
    input.addEventListener("input", () => {
      save.disabled = !input.value.trim();
    });
    save.addEventListener("click", () => void (async () => {
      if (!input.value.trim()) return;
      save.disabled = true;
      save.setText("保存中…");
      const record = await this.plugin.createCommentFromDraft(draft, input.value.trim());
      if (!record) {
        save.disabled = false;
        save.setText("添加评论");
        return;
      }
      this.draft = undefined;
      this.activeRecordId = record.id;
      this.render();
    })());
    window.setTimeout(() => input.focus(), 50);
  }

  private renderCommentCard(container: HTMLElement, record: ReferenceRecord): void {
    const card = container.createDiv({
      cls: `knowgrove-sidebar-comment-card${this.activeRecordId === record.id ? " is-active" : ""}`,
      attr: { "data-comment-id": record.id },
    });
    const top = card.createDiv("knowgrove-sidebar-comment-top");
    const source = top.createEl("button", {
      cls: "knowgrove-sidebar-source-preview",
      text: this.truncate(record.selectedText, 140),
      attr: { "aria-label": "定位到评论原文" },
    });
    source.addEventListener("click", () => {
      this.activeRecordId = record.id;
      void this.plugin.openReferenceSource(record);
      this.render();
    });
    const remove = top.createEl("button", {
      cls: "clickable-icon knowgrove-sidebar-delete",
      attr: { "aria-label": "删除评论" },
    });
    setIcon(remove, "trash-2");
    remove.addEventListener("click", () => {
      this.deleteConfirmId = record.id;
      this.render();
    });

    const comment = card.createEl("textarea", {
      cls: "knowgrove-sidebar-edit-input",
      text: record.comment,
      attr: { "aria-label": "评论内容" },
    });
    comment.value = record.comment;
    comment.rows = Math.max(2, Math.min(6, record.comment.split("\n").length + 1));
    const saveRow = card.createDiv("knowgrove-sidebar-save-row");
    const save = saveRow.createEl("button", { text: "保存修改" });
    save.disabled = true;
    comment.addEventListener("input", () => {
      save.disabled = !comment.value.trim() || comment.value.trim() === record.comment;
    });
    save.addEventListener("click", () => void (async () => {
      if (!comment.value.trim()) return;
      save.disabled = true;
      await this.plugin.updateReferenceComment(record.id, comment.value.trim());
    })());

    const targetRow = card.createDiv("knowgrove-sidebar-target-row");
    if (record.targetPath) {
      const target = targetRow.createEl("button", {
        cls: "knowgrove-sidebar-target-link",
        attr: { "aria-label": `打开目标文档 ${record.targetPath}` },
      });
      const icon = target.createSpan();
      setIcon(icon, "file-symlink");
      target.createSpan({ text: record.targetPath });
      target.addEventListener("click", () => void this.plugin.openReferenceTarget(record));
    } else {
      const add = targetRow.createEl("button", { cls: "knowgrove-sidebar-add-target" });
      const icon = add.createSpan();
      setIcon(icon, "plus");
      add.createSpan({ text: "添加到文档" });
      add.addEventListener("click", () => {
        this.targetPickerId = this.targetPickerId === record.id ? undefined : record.id;
        this.render();
      });
    }

    if (this.targetPickerId === record.id) this.renderTargetPicker(card, record);
    if (this.deleteConfirmId === record.id) this.renderDeleteConfirmation(card, record);
  }

  private renderTargetPicker(container: HTMLElement, record: ReferenceRecord): void {
    const picker = container.createDiv("knowgrove-sidebar-target-picker");
    picker.createDiv({ cls: "knowgrove-sidebar-section-label", text: "添加到" });
    const input = picker.createEl("input", {
      type: "text",
      attr: { placeholder: "搜索目标文档…", "aria-label": "目标文档" },
    });
    const heading = picker.createEl("select", { attr: { "aria-label": "插入位置" } });
    let selectedFile: TFile | undefined;
    const fillHeadings = (file?: TFile): void => {
      heading.empty();
      heading.createEl("option", { value: "", text: "文档末尾" });
      const preferred = this.plugin.settings.defaultTargetHeading.trim();
      if (preferred) heading.createEl("option", { value: preferred, text: `${preferred}（默认）` });
      if (file) {
        const seen = new Set(preferred ? [preferred] : []);
        for (const item of this.app.metadataCache.getFileCache(file)?.headings ?? []) {
          if (seen.has(item.heading)) continue;
          seen.add(item.heading);
          heading.createEl("option", {
            value: item.heading,
            text: `${"　".repeat(Math.max(0, item.level - 1))}${item.heading}`,
          });
        }
      }
      heading.value = preferred;
      heading.disabled = !file;
    };
    fillHeadings();
    const suggest = new TargetFileSuggest(
      this.app,
      input,
      this.plugin.getReferenceTargetFiles(record.sourcePath),
      (file) => {
        selectedFile = file;
        input.value = file.path;
        fillHeadings(file);
      },
    );
    this.targetSuggests.push(suggest);

    const actions = picker.createDiv("knowgrove-sidebar-target-actions");
    const cancel = actions.createEl("button", { text: "取消" });
    cancel.addEventListener("click", () => {
      this.targetPickerId = undefined;
      this.render();
    });
    const add = actions.createEl("button", { cls: "mod-cta", text: "添加" });
    add.addEventListener("click", () => void (async () => {
      let target = selectedFile;
      if (!target && input.value.trim()) {
        const file = this.app.vault.getAbstractFileByPath(input.value.trim());
        if (file instanceof TFile && file.extension === "md") target = file;
      }
      if (!target) {
        new Notice("请选择一个有效的目标文档");
        return;
      }
      add.disabled = true;
      add.setText("添加中…");
      const succeeded = await this.plugin.attachReferenceTarget(record.id, target, heading.value || undefined);
      if (succeeded) {
        this.targetPickerId = undefined;
        this.render();
      } else {
        add.disabled = false;
        add.setText("添加");
      }
    })());
    window.setTimeout(() => input.focus(), 50);
  }

  private renderDeleteConfirmation(container: HTMLElement, record: ReferenceRecord): void {
    const confirmation = container.createDiv("knowgrove-sidebar-delete-confirm");
    confirmation.createSpan({ text: "删除这条评论？对应下划线也会移除。" });
    const actions = confirmation.createDiv();
    const cancel = actions.createEl("button", { text: "取消" });
    cancel.addEventListener("click", () => {
      this.deleteConfirmId = undefined;
      this.render();
    });
    const remove = actions.createEl("button", { cls: "mod-warning", text: "删除" });
    remove.addEventListener("click", () => void (async () => {
      remove.disabled = true;
      const succeeded = await this.plugin.deleteReference(record.id);
      if (succeeded) {
        this.deleteConfirmId = undefined;
        this.activeRecordId = undefined;
        this.render();
      } else {
        remove.disabled = false;
      }
    })());
  }

  private closeTargetSuggests(): void {
    for (const suggest of this.targetSuggests) suggest.close();
    this.targetSuggests = [];
  }

  private truncate(value: string, maximum: number): string {
    const normalized = value.replace(/\s+/g, " ").trim();
    return normalized.length > maximum ? `${normalized.slice(0, maximum)}…` : normalized;
  }
}
