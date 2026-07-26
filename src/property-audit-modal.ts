import { Modal, Notice, TFile, setIcon } from "obsidian";
import type KnowGrovePlugin from "./main";
import {
  applyMatrixSuggestion,
  buildPropertyMatrix,
  buildPropertyMatrixAudit,
  parsePropertyDraft,
  type PropertyMatrixCell,
  type PropertyMatrixModel,
} from "./property-matrix";
import type { PropertyAIRepairPreview, PropertyAudit } from "./types";

export class PropertyAuditModal extends Modal {
  private model?: PropertyMatrixModel;
  private aiLoading = false;
  private aiError = "";

  constructor(private readonly plugin: KnowGrovePlugin, private readonly audit: PropertyAudit) {
    super(plugin.app);
  }

  onOpen(): void {
    this.modalEl.addClass("knowgrove-property-matrix-shell");
    const frontmatterByPath = new Map<string, Record<string, unknown>>();
    for (const path of this.audit.nonCompliantPaths) {
      const file = this.plugin.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) continue;
      const cached = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter;
      if (cached) frontmatterByPath.set(path, JSON.parse(JSON.stringify(cached)) as Record<string, unknown>);
    }
    this.model = buildPropertyMatrix(
      this.audit,
      this.plugin.settings.propertySystem.dimensions,
      frontmatterByPath,
    );
    this.render();
  }

  private render(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("knowgrove-property-modal", "knowgrove-property-matrix-modal");
    root.createEl("h2", { text: "属性修正" });
    root.createEl("p", {
      cls: "setting-item-description",
      text: "每行是一篇文章。橙色单元格需要修正，建议值可直接编辑；绿色单元格当前无需修改。最后统一应用一次。",
    });

    const toolbar = root.createDiv("knowgrove-property-matrix-toolbar");
    const legend = toolbar.createDiv("knowgrove-property-matrix-legend");
    this.legendItem(legend, "ok", "无需修正");
    this.legendItem(legend, "needs-fix", "需要修正");
    const aiRequests = this.aiRequests();
    if (aiRequests.size) this.renderAIButton(toolbar, aiRequests);

    if (this.aiError) {
      root.createEl("p", { cls: "knowgrove-property-matrix-error", text: this.aiError });
    }

    const model = this.model;
    if (!model?.rows.length) {
      root.createDiv({ cls: "knowgrove-property-matrix-empty", text: "当前没有待修正文章。" });
    } else {
      this.renderTable(root, model);
    }
    this.renderFooter(root);
  }

  private legendItem(container: HTMLElement, state: "ok" | "needs-fix", label: string): void {
    const item = container.createSpan("knowgrove-property-matrix-legend-item");
    item.dataset.state = state;
    item.createSpan("knowgrove-property-matrix-legend-dot");
    item.createSpan({ text: label });
  }

  private renderAIButton(container: HTMLElement, requests: Map<string, Set<string>>): void {
    const enabled = this.plugin.settings.aiProperties.enabled;
    const button = container.createEl("button", {
      cls: "knowgrove-property-matrix-ai",
      text: this.aiLoading
        ? "正在生成建议…"
        : enabled
          ? `AI 生成建议（${requests.size} 篇）`
          : "设置 AI 后生成建议",
    });
    const icon = button.createSpan();
    setIcon(icon, this.aiLoading ? "loader-circle" : enabled ? "sparkles" : "settings-2");
    button.prepend(icon);
    if (this.aiLoading) icon.addClass("is-loading");
    button.disabled = this.aiLoading;
    button.addEventListener("click", () => {
      if (!enabled) {
        this.plugin.openPropertySettings();
        return;
      }
      void this.generateAISuggestions(requests, button);
    });
  }

  private renderTable(root: HTMLElement, model: PropertyMatrixModel): void {
    const wrapper = root.createDiv("knowgrove-property-matrix-scroll");
    const table = wrapper.createEl("table", { cls: "knowgrove-property-matrix" });
    const head = table.createEl("thead");
    const heading = head.createEl("tr");
    heading.createEl("th", { cls: "knowgrove-property-matrix-title-column", text: "文章" });
    for (const property of model.columns) heading.createEl("th", { text: property });

    const body = table.createEl("tbody");
    for (const row of model.rows) {
      const tr = body.createEl("tr");
      const title = tr.createEl("th", { cls: "knowgrove-property-matrix-title-column" });
      const open = title.createEl("button", {
        cls: "knowgrove-property-matrix-title",
        text: row.title,
        attr: { "aria-label": `打开文章：${row.title}` },
      });
      open.addEventListener("click", () => {
        const file = this.plugin.app.vault.getAbstractFileByPath(row.path);
        if (file instanceof TFile) void this.plugin.app.workspace.getLeaf(false).openFile(file);
      });
      for (const cell of row.cells) {
        const td = tr.createEl("td", {
          cls: "knowgrove-property-matrix-cell",
          attr: {
            "data-state": cell.needsFix ? "needs-fix" : "ok",
            "aria-label": cell.messages.length
              ? `${row.title}，${cell.property}：${cell.messages.join("；")}`
              : `${row.title}，${cell.property}：无需修正`,
          },
        });
        this.renderCellEditor(td, cell);
      }
    }
  }

  private renderCellEditor(container: HTMLElement, cell: PropertyMatrixCell): void {
    if (cell.valueType === "checkbox") {
      const select = container.createEl("select", { cls: "knowgrove-property-matrix-input" });
      select.createEl("option", { value: "", text: "未设置" });
      select.createEl("option", { value: "true", text: "是" });
      select.createEl("option", { value: "false", text: "否" });
      select.value = cell.draftText;
      select.addEventListener("change", () => {
        cell.draftText = select.value;
        this.markCellEdited(container, cell);
        this.refreshApplyButton();
      });
      return;
    }

    if (cell.valueType === "single" && cell.closedEnum && cell.allowedValues.length) {
      const select = container.createEl("select", { cls: "knowgrove-property-matrix-input" });
      select.createEl("option", { value: "", text: "请选择" });
      const options = Array.from(new Set([
        ...cell.allowedValues,
        ...(cell.draftText && !cell.allowedValues.includes(cell.draftText) ? [cell.draftText] : []),
      ]));
      for (const value of options) select.createEl("option", { value, text: value });
      select.value = cell.draftText;
      select.addEventListener("change", () => {
        cell.draftText = select.value;
        this.markCellEdited(container, cell);
        this.refreshApplyButton();
      });
      return;
    }

    const input = container.createEl("input", {
      cls: "knowgrove-property-matrix-input",
      type: cell.valueType === "date" ? "date" : "text",
      value: cell.draftText,
      placeholder: cell.needsFix ? "填写建议值" : "未设置",
    });
    input.addEventListener("input", () => {
      cell.draftText = input.value;
      this.markCellEdited(container, cell);
      this.refreshApplyButton();
    });
  }

  private markCellEdited(container: HTMLElement, cell: PropertyMatrixCell): void {
    const parsed = parsePropertyDraft(cell.valueType, cell.draftText);
    container.toggleClass("is-edited", JSON.stringify(parsed) !== JSON.stringify(cell.currentValue));
  }

  private renderFooter(root: HTMLElement): void {
    const footer = root.createDiv("knowgrove-property-matrix-footer");
    footer.createDiv({
      cls: "knowgrove-property-matrix-change-summary",
      attr: { "data-knowgrove-property-change-summary": "true" },
      text: this.changeSummary(),
    });
    const actions = footer.createDiv("knowgrove-property-matrix-actions");
    const cancel = actions.createEl("button", { text: "取消" });
    cancel.addEventListener("click", () => this.close());
    const apply = actions.createEl("button", {
      cls: "mod-cta",
      attr: { "data-knowgrove-property-apply": "true" },
    });
    apply.addEventListener("click", () => void this.applyChanges(apply));
    this.refreshApplyButton();
  }

  private refreshApplyButton(): void {
    const root = this.contentEl;
    const apply = root.querySelector<HTMLButtonElement>("[data-knowgrove-property-apply]");
    const summary = root.querySelector<HTMLElement>("[data-knowgrove-property-change-summary]");
    const pending = this.pendingAudit();
    if (summary) summary.setText(this.changeSummary(pending));
    if (!apply) return;
    apply.disabled = this.aiLoading || !pending.changes.length;
    apply.setText(pending.changes.length
      ? `应用修改（${pending.automaticFiles} 篇）`
      : "没有需要写入的修改");
  }

  private changeSummary(pending = this.pendingAudit()): string {
    if (!pending.changes.length) return "修改建议后，这里会显示待写入数量。";
    return `将修改 ${pending.automaticFiles} 篇文章，共 ${pending.automaticOperations} 个属性。`;
  }

  private pendingAudit(): PropertyAudit {
    return this.model ? buildPropertyMatrixAudit(this.audit, this.model) : { ...this.audit, changes: [] };
  }

  private aiRequests(): Map<string, Set<string>> {
    const aiNames = new Set(this.plugin.settings.propertySystem.dimensions
      .filter((dimension) => dimension.aiManaged)
      .map((dimension) => dimension.name));
    const requested = new Map<string, Set<string>>();
    for (const issue of this.audit.issues) {
      if (issue.automatic || !aiNames.has(issue.property)) continue;
      const properties = requested.get(issue.path) ?? new Set<string>();
      properties.add(issue.property);
      requested.set(issue.path, properties);
    }
    return requested;
  }

  private async generateAISuggestions(
    requests: Map<string, Set<string>>,
    button: HTMLButtonElement,
  ): Promise<void> {
    this.aiLoading = true;
    this.aiError = "";
    button.disabled = true;
    button.setText("正在生成建议 0 / 0");
    try {
      const previews = await this.plugin.previewAIPropertyAuditBatch(
        requests,
        (completed, total) => button.setText(`正在生成建议 ${completed} / ${total}`),
      );
      for (const [path, preview] of previews) this.applyAIPreview(path, preview);
      if (!previews.size) throw new Error("模型没有返回可用的属性建议");
      new Notice(`AI 已生成 ${previews.size} 篇文章的属性建议，确认或修改后再统一应用`);
    } catch (error) {
      this.aiError = `AI 建议生成失败：${error instanceof Error ? error.message : String(error)}`;
    } finally {
      this.aiLoading = false;
      this.render();
    }
  }

  private applyAIPreview(path: string, preview: PropertyAIRepairPreview): void {
    if (!this.model) return;
    for (const [property, value] of Object.entries(preview.properties)) {
      applyMatrixSuggestion(this.model, path, property, value, true);
    }
  }

  private async applyChanges(button: HTMLButtonElement): Promise<void> {
    const pending = this.pendingAudit();
    if (!pending.changes.length) return;
    button.disabled = true;
    button.setText("正在应用…");
    const succeeded = await this.plugin.executePropertyAudit(pending);
    if (succeeded) this.close();
    else this.refreshApplyButton();
  }

  onClose(): void {
    this.contentEl.empty();
    this.modalEl.removeClass("knowgrove-property-matrix-shell");
  }
}
