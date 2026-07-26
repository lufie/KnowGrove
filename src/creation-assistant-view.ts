import { ItemView, Notice, TFile, WorkspaceLeaf, setIcon } from "obsidian";
import type KnowGrovePlugin from "./main";
import {
  getResearchOutputPreset,
  type ResearchOutputImageIdea,
  type ResearchOutputState,
} from "./research-output";

export const CREATION_ASSISTANT_VIEW_TYPE = "knowgrove-creation-assistant";
type CreationTab = "direction" | "outline" | "evidence" | "images" | "versions";

const TABS: Array<{ id: CreationTab; label: string; icon: string }> = [
  { id: "direction", label: "方向", icon: "compass" },
  { id: "outline", label: "提纲", icon: "list-tree" },
  { id: "evidence", label: "证据", icon: "badge-check" },
  { id: "images", label: "配图", icon: "image" },
  { id: "versions", label: "版本", icon: "history" },
];

export class CreationAssistantView extends ItemView {
  private outputPath?: string;
  private state?: ResearchOutputState;
  private tab: CreationTab = "direction";
  private busy = false;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: KnowGrovePlugin) {
    super(leaf);
  }

  getViewType(): string {
    return CREATION_ASSISTANT_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "创作助手";
  }

  getIcon(): string {
    return "wand-sparkles";
  }

  async onOpen(): Promise<void> {
    this.registerEvent(this.app.workspace.on("file-open", (file) => void this.followFile(file)));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => void this.followFile(this.app.workspace.getActiveFile())));
    await this.followFile(this.app.workspace.getActiveFile());
  }

  showOutput(path: string): void {
    this.outputPath = path;
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.state = this.outputPath ? await this.plugin.readResearchOutputState(this.outputPath) ?? undefined : undefined;
    this.render();
  }

  private async followFile(file: TFile | null): Promise<void> {
    if (!file || file.extension !== "md") return;
    const state = await this.plugin.readResearchOutputState(file.path);
    if (!state) return;
    this.outputPath = file.path;
    this.state = state;
    this.render();
  }

  private render(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("knowgrove-creation-assistant");
    if (!this.state) {
      const empty = root.createDiv("knowgrove-creation-empty");
      const icon = empty.createSpan();
      setIcon(icon, "wand-sparkles");
      empty.createEl("h3", { text: "创作助手" });
      empty.createEl("p", { text: "打开一篇由 KnowGrove 生成的作品，或从课题页面点击“创作”。" });
      return;
    }
    const header = root.createDiv("knowgrove-creation-assistant-header");
    const title = header.createDiv();
    title.createEl("h3", { text: this.state.draft.title });
    title.createDiv({
      cls: "knowgrove-creation-assistant-meta",
      text: `${getResearchOutputPreset(this.state.draft.presetId).label} · ${this.state.draft.selectedPaths.length} 份材料`,
    });
    const open = header.createEl("button", { cls: "clickable-icon", attr: { "aria-label": "打开作品" } });
    setIcon(open, "panel-right-open");
    open.addEventListener("click", () => void this.plugin.openVaultFile(this.state!.outputPath));

    const tabs = root.createDiv("knowgrove-creation-tabs");
    for (const item of TABS) {
      const button = tabs.createEl("button", {
        cls: this.tab === item.id ? "is-active" : "",
        attr: { "aria-pressed": String(this.tab === item.id) },
      });
      const icon = button.createSpan();
      setIcon(icon, item.icon);
      button.createSpan({ text: item.label });
      button.addEventListener("click", () => {
        this.tab = item.id;
        this.render();
      });
    }
    const body = root.createDiv("knowgrove-creation-assistant-body");
    if (this.tab === "direction") this.renderDirection(body);
    if (this.tab === "outline") this.renderOutline(body);
    if (this.tab === "evidence") this.renderEvidence(body);
    if (this.tab === "images") this.renderImages(body);
    if (this.tab === "versions") this.renderVersions(body);
  }

  private renderDirection(container: HTMLElement): void {
    const state = this.state!;
    container.createEl("h4", { text: "作品方向" });
    this.labelValue(container, "渠道", getResearchOutputPreset(state.draft.presetId).label);
    this.labelValue(container, "目标", state.draft.goal || "未填写");
    this.labelValue(container, "读者", state.draft.audience || "未填写");
    this.labelValue(container, "核心表达", state.draft.coreMessage || state.plan.summary || "由材料归纳");
    this.labelValue(container, "语言与风格", `${state.draft.language} · ${state.draft.style}`);
    const actions = container.createDiv("knowgrove-creation-primary-actions");
    const derivative = actions.createEl("button", { cls: "mod-cta", text: "生成渠道版本" });
    derivative.addEventListener("click", () => this.plugin.openChannelDerivative(state.outputPath));
    const edit = actions.createEl("button", { text: "回到作品继续编辑" });
    edit.addEventListener("click", () => void this.plugin.openVaultFile(state.outputPath));
  }

  private renderOutline(container: HTMLElement): void {
    const state = this.state!;
    container.createEl("h4", { text: "已确认提纲" });
    container.createEl("p", { cls: "knowgrove-creation-help", text: state.plan.summary });
    for (const [index, section] of state.plan.sections.entries()) {
      const card = container.createDiv("knowgrove-creation-side-card");
      const heading = card.createDiv("knowgrove-creation-side-card-heading");
      heading.createSpan({ text: `${index + 1}. ${section.heading}` });
      heading.createSpan({
        cls: "knowgrove-creation-evidence-status",
        text: section.evidenceStatus,
        attr: { "data-state": section.evidenceStatus },
      });
      card.createEl("p", { text: section.purpose });
      if (section.evidencePaths.length) this.renderPathLinks(card, section.evidencePaths);
      const rewrite = card.createEl("button", { text: "重写本节" });
      rewrite.addEventListener("click", () => void this.plugin.openRegenerateResearchSection(state.outputPath, index));
    }
  }

  private renderEvidence(container: HTMLElement): void {
    const state = this.state!;
    const header = container.createDiv("knowgrove-creation-side-heading");
    header.createEl("h4", { text: "证据审查" });
    const audit = header.createEl("button", { text: this.busy ? "审查中…" : "重新审查" });
    audit.disabled = this.busy;
    audit.addEventListener("click", () => void this.runAudit());
    if (!state.audit) {
      container.createEl("p", {
        cls: "knowgrove-creation-help",
        text: "审查会逐条核对事实、数字和关键判断，不会修改正文。",
      });
      const start = container.createEl("button", { cls: "mod-cta", text: "开始证据审查" });
      start.disabled = this.busy;
      start.addEventListener("click", () => void this.runAudit());
      return;
    }
    const counts = new Map<string, number>();
    for (const claim of state.audit.claims) counts.set(claim.status, (counts.get(claim.status) ?? 0) + 1);
    const summary = container.createDiv("knowgrove-creation-audit-summary");
    for (const status of ["有依据", "依据不足", "存在冲突", "待人工判断"]) {
      summary.createDiv({ text: `${status} ${counts.get(status) ?? 0}` });
    }
    if (!state.audit.claims.length) {
      container.createEl("p", { text: "这次没有发现需要单独列出的可验证主张。" });
      return;
    }
    for (const claim of state.audit.claims) {
      const card = container.createDiv("knowgrove-creation-side-card");
      card.dataset.state = claim.status;
      card.createDiv({ cls: "knowgrove-creation-claim-status", text: claim.status });
      card.createEl("p", { text: claim.text });
      if (claim.reason) card.createDiv({ cls: "knowgrove-creation-help", text: claim.reason });
      if (claim.evidencePaths.length) this.renderPathLinks(card, claim.evidencePaths);
      const locate = card.createEl("button", { text: "定位原句" });
      locate.addEventListener("click", () => void this.plugin.locateResearchClaim(state.outputPath, claim.text));
    }
  }

  private renderImages(container: HTMLElement): void {
    const state = this.state!;
    container.createEl("h4", { text: "配图方案" });
    if (!state.plan.imageIdeas.length) {
      container.createEl("p", { text: "当前提纲没有配图方案，可以重新规划作品后再生成。" });
      return;
    }
    for (const [index, idea] of state.plan.imageIdeas.entries()) this.renderImageIdea(container, idea, index);
    if (state.generatedImages.length) {
      container.createEl("h4", { text: "已生成附件" });
      this.renderPathLinks(container, state.generatedImages.map((image) => image.path));
    }
  }

  private renderImageIdea(container: HTMLElement, idea: ResearchOutputImageIdea, index: number): void {
    const card = container.createDiv("knowgrove-creation-side-card");
    card.createDiv({ cls: "knowgrove-creation-side-card-heading", text: `${idea.title} · ${idea.format}` });
    card.createEl("p", { text: idea.purpose });
    const prompt = card.createEl("textarea", { attr: { "aria-label": `${idea.title}提示词` } });
    prompt.rows = 5;
    prompt.value = idea.prompt;
    prompt.addEventListener("change", () => {
      void this.plugin.updateResearchImagePrompt(this.state!.outputPath, index, prompt.value);
    });
    const actions = card.createDiv("knowgrove-creation-card-actions");
    const generate = actions.createEl("button", { cls: "mod-cta", text: "生成并插入" });
    generate.disabled = this.busy;
    generate.addEventListener("click", () => void this.generateImage(index, prompt.value));
    const copy = actions.createEl("button", { text: "复制提示词" });
    copy.addEventListener("click", () => void navigator.clipboard.writeText(prompt.value)
      .then(() => new Notice("已复制配图提示词")));
  }

  private renderVersions(container: HTMLElement): void {
    const state = this.state!;
    const header = container.createDiv("knowgrove-creation-side-heading");
    header.createEl("h4", { text: "版本记录" });
    const save = header.createEl("button", { text: "保存当前版本" });
    save.addEventListener("click", () => void this.plugin.saveCurrentResearchOutputVersion(state.outputPath, "手动保存")
      .then(() => this.refresh()));
    for (const version of [...state.versions].reverse()) {
      const card = container.createDiv("knowgrove-creation-version");
      const copy = card.createDiv();
      copy.createDiv({ text: version.label });
      copy.createDiv({
        cls: "knowgrove-creation-help",
        text: new Date(version.createdAt).toLocaleString("zh-CN"),
      });
      const compare = card.createEl("button", { text: "对比" });
      compare.addEventListener("click", () => void this.plugin.openResearchOutputVersionPreview(state.outputPath, version.id));
      const restore = card.createEl("button", { text: "恢复" });
      restore.addEventListener("click", () => this.plugin.confirmRestoreResearchOutputVersion(state.outputPath, version.id));
    }
  }

  private labelValue(container: HTMLElement, label: string, value: string): void {
    const row = container.createDiv("knowgrove-creation-label-value");
    row.createSpan({ text: label });
    row.createDiv({ text: value });
  }

  private renderPathLinks(container: HTMLElement, paths: string[]): void {
    const list = container.createDiv("knowgrove-creation-path-links");
    for (const path of paths) {
      const button = list.createEl("button", { text: path.replace(/\.md$/i, "").split("/").pop() || path });
      button.setAttr("title", path);
      button.addEventListener("click", () => void this.plugin.openVaultFile(path));
    }
  }

  private async runAudit(): Promise<void> {
    if (this.busy || !this.state) return;
    this.busy = true;
    this.render();
    try {
      await this.plugin.auditResearchOutput(this.state.outputPath);
      await this.refresh();
    } catch (error) {
      new Notice(`证据审查失败：${error instanceof Error ? error.message : String(error)}`, 8000);
    } finally {
      this.busy = false;
      this.render();
    }
  }

  private async generateImage(index: number, prompt: string): Promise<void> {
    if (this.busy || !this.state) return;
    this.busy = true;
    this.render();
    try {
      await this.plugin.generateAndInsertResearchImage(this.state.outputPath, index, prompt);
      await this.refresh();
    } catch (error) {
      new Notice(`配图生成失败：${error instanceof Error ? error.message : String(error)}`, 8000);
    } finally {
      this.busy = false;
      this.render();
    }
  }
}
