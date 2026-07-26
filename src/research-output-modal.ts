import { ButtonComponent, Modal, Notice, Setting, TextComponent, setIcon } from "obsidian";
import type KnowGrovePlugin from "./main";
import type { KnowledgeResearchTopicSummary, KnowledgeThemeDocument } from "./types";
import {
  RESEARCH_OUTPUT_PRESETS,
  getResearchOutputPreset,
  type ResearchOutputDraft,
  type ResearchOutputPlan,
  type ResearchOutputPresetId,
} from "./research-output";

type ProgressReporter = (message: string) => void;

export class ResearchOutputModal extends Modal {
  private readonly selectedPaths: Set<string>;
  private readonly adoptedPaths: Set<string>;
  private readonly documents: KnowledgeThemeDocument[];
  private query = "";
  private plan?: ResearchOutputPlan;
  private draft: ResearchOutputDraft;
  private busy = false;

  constructor(
    private readonly plugin: KnowGrovePlugin,
    private readonly topic: KnowledgeResearchTopicSummary,
    documents: KnowledgeThemeDocument[],
    adoptedPaths: string[],
    private readonly onPlan: (draft: ResearchOutputDraft, report: ProgressReporter) => Promise<ResearchOutputPlan>,
    private readonly onGenerate: (
      draft: ResearchOutputDraft,
      plan: ResearchOutputPlan,
      report: ProgressReporter,
    ) => Promise<void>,
  ) {
    super(plugin.app);
    this.documents = Array.from(new Map(documents.map((document) => [document.path, document])).values());
    this.adoptedPaths = new Set(adoptedPaths);
    const defaults = adoptedPaths.length ? adoptedPaths : this.documents.map((document) => document.path);
    this.selectedPaths = new Set(defaults);
    this.draft = {
      title: `一文讲清楚：${topic.name}`,
      presetId: "research-report",
      goal: topic.coreQuestion,
      audience: "对这个主题感兴趣、但还没有系统研究的读者",
      coreMessage: "",
      language: "中文",
      style: "清晰、具体、保留证据边界",
      selectedPaths: [...this.selectedPaths],
    };
  }

  onOpen(): void {
    this.modalEl.addClass("knowgrove-modal", "knowgrove-creation-studio-modal");
    this.renderSources();
  }

  private renderHeader(step: 1 | 2 | 3, title: string, description: string): void {
    this.contentEl.empty();
    this.titleEl.setText(title);
    this.contentEl.createEl("p", { cls: "setting-item-description", text: description });
    const steps = this.contentEl.createDiv("knowgrove-creation-steps");
    for (const [index, label] of ["选择材料", "选择方向", "确认提纲"].entries()) {
      const item = steps.createDiv("knowgrove-creation-step");
      item.dataset.state = index + 1 === step ? "current" : index + 1 < step ? "done" : "pending";
      item.createSpan({ cls: "knowgrove-creation-step-index", text: String(index + 1) });
      item.createSpan({ text: label });
    }
  }

  private filteredDocuments(): KnowledgeThemeDocument[] {
    const query = this.query.toLocaleLowerCase();
    if (!query) return this.documents;
    return this.documents.filter((document) => [
      document.basename,
      document.path,
      ...document.domains,
      ...document.topics,
    ].join(" ").toLocaleLowerCase().includes(query));
  }

  private renderSources(): void {
    this.renderHeader(
      1,
      "创建作品",
      "选择这次真正要使用的材料。材料较多时会分批提炼，不会只读取前几篇。",
    );
    const toolbar = this.contentEl.createDiv("knowgrove-creation-source-toolbar");
    const search = toolbar.createDiv("knowgrove-topic-search");
    const searchIcon = search.createSpan();
    setIcon(searchIcon, "search");
    new TextComponent(search)
      .setPlaceholder("搜索标题、路径、领域或主题…")
      .setValue(this.query)
      .onChange((value) => {
        this.query = value.trim();
        renderList();
      });
    const actions = toolbar.createDiv("knowgrove-creation-source-actions");
    const count = this.contentEl.createDiv("knowgrove-creation-selection-count");
    const list = this.contentEl.createDiv("knowgrove-theme-source-list knowgrove-creation-source-list");
    const footer = this.contentEl.createDiv("modal-button-container");
    new ButtonComponent(footer).setButtonText("取消").onClick(() => this.close());
    const next = new ButtonComponent(footer).setCta().setButtonText("继续：选择方向").onClick(() => {
      if (!this.selectedPaths.size) {
        new Notice("请至少选择一篇材料");
        return;
      }
      this.draft.selectedPaths = [...this.selectedPaths];
      this.renderDirection();
    });
    const renderList = (): void => {
      const matches = this.filteredDocuments();
      list.empty();
      count.setText(`已选择 ${this.selectedPaths.size} 篇 · 当前显示 ${matches.length} 篇`);
      next.setDisabled(!this.selectedPaths.size);
      for (const document of matches) {
        const row = list.createEl("label", { cls: "knowgrove-theme-source-row" });
        const checkbox = row.createEl("input", { type: "checkbox" });
        checkbox.checked = this.selectedPaths.has(document.path);
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) this.selectedPaths.add(document.path);
          else this.selectedPaths.delete(document.path);
          count.setText(`已选择 ${this.selectedPaths.size} 篇 · 当前显示 ${matches.length} 篇`);
          next.setDisabled(!this.selectedPaths.size);
        });
        const copy = row.createDiv();
        const title = copy.createDiv("knowgrove-theme-source-title");
        title.createSpan({ text: document.basename });
        if (this.adoptedPaths.has(document.path)) title.createEl("small", { text: "已采用" });
        copy.createDiv({
          cls: "knowgrove-theme-source-path",
          text: `${document.domains.slice(0, 2).join(" · ") || "未分类"} · ${document.path}`,
        });
      }
      if (!matches.length) {
        list.createDiv({ cls: "knowgrove-topic-empty", text: "没有匹配的材料" });
      }
    };
    new ButtonComponent(actions).setButtonText("全选当前结果").onClick(() => {
      for (const document of this.filteredDocuments()) this.selectedPaths.add(document.path);
      renderList();
    });
    if (this.adoptedPaths.size) {
      new ButtonComponent(actions).setButtonText("只选已采用").onClick(() => {
        this.selectedPaths.clear();
        for (const path of this.adoptedPaths) this.selectedPaths.add(path);
        renderList();
      });
    }
    new ButtonComponent(actions).setButtonText("清空").onClick(() => {
      this.selectedPaths.clear();
      renderList();
    });
    renderList();
  }

  private renderDirection(): void {
    this.renderHeader(
      2,
      "选择创作方向",
      "选择一个成果模板，KnowGrove 会根据材料自动生成可编辑提纲。高级要求可以留空。",
    );
    const presetDescription = this.contentEl.createDiv("knowgrove-creation-preset-description");
    let languageDropdown: { setValue(value: string): unknown } | undefined;
    const refreshPreset = (): void => {
      const preset = getResearchOutputPreset(this.draft.presetId);
      presetDescription.setText(`${preset.group} · ${preset.description}`);
    };
    new Setting(this.contentEl).setName("成果模板").addDropdown((dropdown) => {
      for (const preset of RESEARCH_OUTPUT_PRESETS) {
        dropdown.addOption(preset.id, `${preset.group} · ${preset.label}`);
      }
      dropdown.setValue(this.draft.presetId).onChange((value) => {
        this.draft.presetId = value as ResearchOutputPresetId;
        this.draft.language = getResearchOutputPreset(this.draft.presetId).defaultLanguage;
        languageDropdown?.setValue(this.draft.language);
        refreshPreset();
      });
    });
    refreshPreset();
    new Setting(this.contentEl).setName("作品标题").addText((text) => text
      .setValue(this.draft.title)
      .onChange((value) => { this.draft.title = value; }));
    new Setting(this.contentEl).setName("想解决什么问题").addTextArea((text) => {
      text.setValue(this.draft.goal).onChange((value) => { this.draft.goal = value; });
      text.inputEl.rows = 2;
    });
    new Setting(this.contentEl).setName("写给谁看").addText((text) => text
      .setValue(this.draft.audience)
      .onChange((value) => { this.draft.audience = value; }));
    new Setting(this.contentEl).setName("最想表达的观点").setDesc("可以留空，让 AI 从材料中归纳").addTextArea((text) => {
      text.setValue(this.draft.coreMessage).onChange((value) => { this.draft.coreMessage = value; });
      text.inputEl.rows = 2;
    });
    new Setting(this.contentEl).setName("输出语言").addDropdown((dropdown) => {
      languageDropdown = dropdown;
      dropdown
        .addOption("中文", "中文")
        .addOption("英文", "英文")
        .setValue(this.draft.language)
        .onChange((value) => { this.draft.language = value as "中文" | "英文"; });
    });
    new Setting(this.contentEl).setName("风格补充").setDesc("可选").addText((text) => text
      .setValue(this.draft.style)
      .onChange((value) => { this.draft.style = value; }));
    const progress = this.contentEl.createDiv("knowgrove-creation-progress");
    progress.hide();
    const footer = this.contentEl.createDiv("modal-button-container");
    const back = new ButtonComponent(footer).setButtonText("返回选材料").onClick(() => this.renderSources());
    const planButton = new ButtonComponent(footer).setCta().setButtonText("生成并查看提纲").onClick(async () => {
      const title = this.draft.title.trim();
      if (!title) {
        new Notice("请填写作品标题");
        return;
      }
      this.draft.title = title;
      this.draft.selectedPaths = [...this.selectedPaths];
      this.busy = true;
      back.setDisabled(true);
      planButton.setDisabled(true).setButtonText("正在准备…");
      progress.show();
      try {
        this.plan = await this.onPlan(this.draft, (message) => {
          progress.setText(message);
          planButton.setButtonText("正在生成提纲…");
        });
        this.renderPlan();
      } catch (error) {
        console.error("KnowGrove: failed to plan creation output", error);
        progress.setText(`生成提纲失败：${error instanceof Error ? error.message : String(error)}`);
        new Notice("提纲生成失败，请检查模型设置后重试");
      } finally {
        this.busy = false;
        back.setDisabled(false);
        planButton.setDisabled(false).setButtonText("生成并查看提纲");
      }
    });
  }

  private renderPlan(): void {
    if (!this.plan) {
      this.renderDirection();
      return;
    }
    this.renderHeader(
      3,
      "确认内容提纲",
      "先调整章节和证据范围，再生成初稿。初稿会保存为普通 Markdown，不会改动原始材料。",
    );
    if (this.plan.summary) {
      this.contentEl.createDiv({ cls: "knowgrove-creation-plan-summary", text: this.plan.summary });
    }
    new Setting(this.contentEl).setName("作品标题").addText((text) => text
      .setValue(this.plan?.title ?? this.draft.title)
      .onChange((value) => {
        if (this.plan) this.plan.title = value;
      }));
    const sections = this.contentEl.createDiv("knowgrove-creation-plan-sections");
    for (const [index, section] of this.plan.sections.entries()) {
      const card = sections.createDiv("knowgrove-creation-plan-section");
      const heading = card.createDiv("knowgrove-creation-plan-heading");
      heading.createSpan({ cls: "knowgrove-creation-plan-number", text: String(index + 1) });
      const title = heading.createEl("input", { type: "text", value: section.heading });
      title.addEventListener("input", () => { section.heading = title.value; });
      const status = heading.createSpan({
        cls: "knowgrove-creation-evidence-status",
        text: section.evidenceStatus,
      });
      status.dataset.state = section.evidenceStatus;
      const purpose = card.createEl("textarea");
      purpose.rows = 2;
      purpose.value = section.purpose;
      purpose.addEventListener("input", () => { section.purpose = purpose.value; });
      const evidence = card.createDiv("knowgrove-creation-section-evidence");
      evidence.setText(section.evidencePaths.length
        ? `使用 ${section.evidencePaths.length} 篇材料：${section.evidencePaths.map((path) => path.replace(/\.md$/i, "").split("/").pop()).join("、")}`
        : "当前没有明确证据，生成时会标记为待验证");
    }
    if (this.plan.imageIdeas.length) {
      const details = this.contentEl.createEl("details", { cls: "knowgrove-creation-image-plan" });
      details.createEl("summary", { text: `配图方案 · ${this.plan.imageIdeas.length} 张` });
      for (const idea of this.plan.imageIdeas) {
        const item = details.createDiv("knowgrove-creation-image-item");
        item.createEl("strong", { text: `${idea.title} · ${idea.format}` });
        item.createEl("p", { text: idea.purpose });
        const prompt = item.createEl("textarea");
        prompt.rows = 2;
        prompt.value = idea.prompt;
        prompt.addEventListener("input", () => { idea.prompt = prompt.value; });
      }
    }
    const progress = this.contentEl.createDiv("knowgrove-creation-progress");
    progress.hide();
    const footer = this.contentEl.createDiv("modal-button-container");
    const back = new ButtonComponent(footer).setButtonText("返回修改方向").onClick(() => this.renderDirection());
    const replan = new ButtonComponent(footer).setButtonText("重新生成提纲").onClick(() => this.renderDirection());
    const generate = new ButtonComponent(footer).setCta().setButtonText("按这个提纲生成初稿").onClick(async () => {
      if (!this.plan) return;
      const invalid = this.plan.sections.some((section) => !section.heading.trim() || !section.purpose.trim());
      if (invalid) {
        new Notice("请补齐每个章节的标题和目标");
        return;
      }
      this.busy = true;
      back.setDisabled(true);
      replan.setDisabled(true);
      generate.setDisabled(true).setButtonText("正在生成初稿…");
      progress.show();
      try {
        await this.onGenerate(this.draft, this.plan, (message) => progress.setText(message));
        this.close();
      } catch (error) {
        console.error("KnowGrove: failed to generate creation output", error);
        progress.setText(`初稿生成失败：${error instanceof Error ? error.message : String(error)}`);
        new Notice("初稿生成失败，已保留当前提纲");
      } finally {
        this.busy = false;
        back.setDisabled(false);
        replan.setDisabled(false);
        generate.setDisabled(false).setButtonText("按这个提纲生成初稿");
      }
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
