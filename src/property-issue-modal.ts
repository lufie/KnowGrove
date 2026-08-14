import { Modal, Notice, Setting, TFile, setIcon } from "obsidian";
import type KnowGrovePlugin from "./main";
import type { PropertyAIRepairPreview, PropertyAudit, PropertyAuditIssue } from "./types";

function displayValue(value: unknown): string {
  if (value === undefined) return "未设置";
  if (Array.isArray(value)) return value.length ? value.map(displayValue).join("、") : "空列表";
  if (typeof value === "object" && value !== null) return JSON.stringify(value);
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  if (typeof value === "symbol") return value.description ?? "";
  return "";
}

function issueKindLabel(issue: PropertyAuditIssue): string {
  if (issue.automatic) return "可自动修复";
  if (issue.kind === "missing") return "需要语义判断";
  if (issue.kind === "invalid-value") return "值不在当前规范";
  if (issue.kind === "wrong-type") return "格式不符合规范";
  if (issue.kind === "legacy-alias") return "旧属性名";
  return "需要确认";
}

function filteredAudit(audit: PropertyAudit, path: string): PropertyAudit {
  const issues = audit.issues.filter((item) => item.path === path);
  const changes = audit.changes.filter((item) => item.path === path);
  return {
    ...audit,
    governedFiles: 1,
    compliantFiles: 0,
    nonCompliantFiles: 1,
    compliantPaths: [],
    nonCompliantPaths: [path],
    automaticFiles: changes.length,
    automaticOperations: changes.reduce((sum, change) => sum + change.operations.length, 0),
    manualIssues: issues.filter((item) => !item.automatic).length,
    issues,
    changes,
  };
}

export class PropertyIssueModal extends Modal {
  private aiPreview?: PropertyAIRepairPreview;
  private aiLoading = false;
  private aiError?: string;

  constructor(
    private readonly plugin: KnowGrovePlugin,
    private readonly audit: PropertyAudit,
    private readonly path: string,
  ) {
    super(plugin.app);
  }

  onOpen(): void {
    this.render();
  }

  private render(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("knowgrove-property-issue-modal");
    const issues = this.audit.issues.filter((item) => item.path === this.path);
    const changes = this.audit.changes.find((item) => item.path === this.path);
    const aiNames = new Set(this.plugin.settings.propertySystem.dimensions
      .filter((dimension) => dimension.aiManaged)
      .map((dimension) => dimension.name));
    const aiProperties = Array.from(new Set(issues
      .filter((issue) => aiNames.has(issue.property))
      .map((issue) => issue.property)));

    root.createEl("h2", { text: "这篇笔记怎么规范" });
    root.createEl("p", { cls: "setting-item-description", text: this.path });
    root.createEl("p", {
      cls: "knowgrove-property-issue-guidance",
      text: "先看每个字段的原因，再选择确定性修复或让 AI 结合正文给出建议。已有值不会被静默覆盖。",
    });

    const list = root.createDiv("knowgrove-property-issue-detail-list");
    if (!issues.length) {
      list.createEl("p", { cls: "setting-item-description", text: "这篇笔记当前没有可显示的问题，请重新检查规范。" });
    }
    for (const issue of issues) this.renderIssue(list, issue, aiNames);

    if (this.aiPreview) this.renderAIPreview(root, aiProperties);
    if (this.aiError) root.createEl("p", { cls: "mod-warning", text: this.aiError });

    const actions = root.createDiv("knowgrove-property-issue-actions");
    const open = actions.createEl("button", { text: "打开这篇笔记" });
    open.addEventListener("click", () => {
      const file = this.plugin.app.vault.getAbstractFileByPath(this.path);
      if (file instanceof TFile) void this.plugin.app.workspace.getLeaf(false).openFile(file);
      this.close();
    });

    if (changes?.operations.length) {
      const fix = actions.createEl("button", { cls: "mod-cta", text: `修复确定性问题（${changes.operations.length} 项）` });
      fix.addEventListener("click", () => void (async () => {
        fix.disabled = true;
        fix.setText("修复中…");
        const succeeded = await this.plugin.executePropertyAudit(filteredAudit(this.audit, this.path));
        if (succeeded) this.close();
        else {
          fix.disabled = false;
          fix.setText(`修复确定性问题（${changes.operations.length} 项）`);
        }
      })());
    }

    if (aiProperties.length && this.plugin.settings.aiProperties.enabled && !this.aiPreview) {
      const ai = actions.createEl("button", { text: this.aiLoading ? "AI 分析中…" : "让 AI 给出修复建议" });
      ai.disabled = this.aiLoading;
      ai.addEventListener("click", () => void this.previewAI(ai, aiProperties));
    } else if (aiProperties.length && !this.plugin.settings.aiProperties.enabled) {
      const configure = actions.createEl("button", { text: "启用 AI 后生成建议" });
      configure.addEventListener("click", () => this.plugin.openPropertySettings());
    }

    new Setting(root)
      .addButton((button) => button.setButtonText("关闭").onClick(() => this.close()));
  }

  private renderIssue(container: HTMLElement, issue: PropertyAuditIssue, aiNames: Set<string>): void {
    const item = container.createDiv("knowgrove-property-issue-detail");
    const heading = item.createDiv("knowgrove-property-issue-detail-heading");
    const icon = heading.createSpan();
    setIcon(icon, issue.automatic ? "wand-sparkles" : aiNames.has(issue.property) ? "sparkles" : "circle-alert");
    heading.createEl("strong", { text: issue.property });
    heading.createSpan({ cls: "knowgrove-property-issue-kind", text: issueKindLabel(issue) });
    item.createDiv({ cls: "knowgrove-property-issue-message", text: issue.message });
    const values = item.createDiv("knowgrove-property-issue-values");
    values.createSpan({ text: `当前：${displayValue(issue.currentValue)}` });
    if (issue.suggestedValue !== undefined) values.createSpan({ text: `建议：${displayValue(issue.suggestedValue)}` });
    item.createDiv({
      cls: "knowgrove-property-issue-solution",
      text: issue.automatic
        ? "插件可以按确定性规则直接修复。"
        : aiNames.has(issue.property)
          ? "AI 可以结合正文重新判断；确认后才会写入。"
          : "这项涉及日期、枚举或自定义规则，需要你确认后处理。",
    });
  }

  private renderAIPreview(root: HTMLElement, properties: string[]): void {
    const section = root.createDiv("knowgrove-property-ai-preview");
    section.createEl("h3", { text: "AI 建议" });
    section.createEl("p", { cls: "setting-item-description", text: "以下值只针对当前问题生成，点击写入后才会修改笔记。" });
    const list = section.createDiv();
    for (const [name, value] of Object.entries(this.aiPreview?.properties ?? {})) {
      list.createDiv({ text: `${name}：${displayValue(value)}` });
    }
    const apply = section.createEl("button", { cls: "mod-cta", text: "写入 AI 建议" });
    apply.addEventListener("click", () => void (async () => {
      apply.disabled = true;
      apply.setText("写入中…");
      try {
        const result = await this.plugin.applyAIPropertyRepair(this.path, properties, this.aiPreview ?? { properties: {}, expected: {} });
        await this.plugin.scanPropertyWorkspace();
        new Notice(result.applied ? `已写入 ${result.applied} 个 AI 属性` : "没有写入新的 AI 属性");
        this.close();
      } catch (error) {
        apply.disabled = false;
        apply.setText("写入 AI 建议");
        new Notice(`AI 建议写入失败：${error instanceof Error ? error.message : String(error)}`);
      }
    })());
  }

  private async previewAI(button: HTMLButtonElement, properties: string[]): Promise<void> {
    this.aiLoading = true;
    button.disabled = true;
    button.setText("AI 分析中…");
    try {
      this.aiPreview = await this.plugin.previewAIPropertyRepair(this.path, properties);
      this.aiError = undefined;
    } catch (error) {
      this.aiError = `AI 建议生成失败：${error instanceof Error ? error.message : String(error)}`;
    } finally {
      this.aiLoading = false;
      this.render();
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
