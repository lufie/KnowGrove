import { ButtonComponent, Modal, Notice, Setting, TextComponent, setIcon } from "obsidian";
import type KnowGrovePlugin from "./main";
import type {
  KnowledgeThemeDocument,
  KnowledgeWorkspaceSummary,
  KnowledgeWorkspaceType,
  ThemePlanningProposal,
} from "./types";

export interface KnowledgeWorkspaceDraft {
  name: string;
  type: KnowledgeWorkspaceType;
  objective: string;
  domains: string[];
  themes: string[];
  parentPath?: string;
  parentName?: string;
  repeatRule?: string;
}

export class CreateKnowledgeWorkspaceModal extends Modal {
  private name = "";
  private objective = "";
  private domains: string;
  private themes: string;
  private repeatRule = "";
  private type: KnowledgeWorkspaceType;
  private parentPath: string;

  constructor(
    private readonly plugin: KnowGrovePlugin,
    initialType: KnowledgeWorkspaceType,
    defaultDomain: string,
    private readonly parentCandidates: KnowledgeWorkspaceSummary[],
    defaultParent: KnowledgeWorkspaceSummary | undefined,
    private readonly onCreate: (draft: KnowledgeWorkspaceDraft) => Promise<void>,
  ) {
    super(plugin.app);
    this.type = initialType;
    this.domains = defaultDomain;
    this.parentPath = defaultParent?.workspacePath ?? "";
    this.themes = defaultParent?.themes.join(", ") ?? "";
  }

  onOpen(): void {
    this.modalEl.addClass("knowgrove-modal", "knowgrove-theme-manager-modal");
    this.titleEl.setText("新建工作空间");
    this.contentEl.createEl("p", {
      cls: "setting-item-description",
      text: "项目用于推动明确交付，生活目标用于改善状态，例行事项用于持续重复。领域和主题继续使用现有知识体系。",
    });
    let refreshConditionalFields = (): void => {};
    new Setting(this.contentEl).setName("空间类型").addDropdown((dropdown) => dropdown
      .addOption("项目", "项目")
      .addOption("生活目标", "生活目标")
      .addOption("例行事项", "例行事项")
      .setValue(this.type)
      .onChange((value) => {
        this.type = value as KnowledgeWorkspaceType;
        if (this.type !== "项目") this.parentPath = "";
        if (this.type !== "例行事项") this.repeatRule = "";
        refreshConditionalFields();
      }));
    let nameInput: TextComponent | undefined;
    new Setting(this.contentEl).setName("名称").addText((text) => {
      nameInput = text.onChange((value) => { this.name = value; });
    });
    new Setting(this.contentEl).setName("目标").addTextArea((text) => {
      text.setPlaceholder("这个空间最终要推动什么结果？")
        .onChange((value) => { this.objective = value; });
      text.inputEl.rows = 3;
    });
    new Setting(this.contentEl).setName("领域").setDesc("多个领域用逗号分隔").addText((text) => text
      .setValue(this.domains)
      .setPlaceholder("例如：AI产品")
      .onChange((value) => { this.domains = value; }));
    new Setting(this.contentEl).setName("关联主题").setDesc("多个主题用逗号分隔").addText((text) => text
      .setValue(this.themes)
      .setPlaceholder("例如：WorkBuddy, AI智能体")
      .onChange((value) => { this.themes = value; }));
    let parentSetting: Setting | undefined;
    if (this.parentCandidates.length) {
      parentSetting = new Setting(this.contentEl).setName("上级项目").setDesc("仅在确实需要子项目时设置").addDropdown((dropdown) => {
        dropdown.addOption("", "无上级项目");
        for (const candidate of this.parentCandidates.filter((workspace) => workspace.type === "项目")) {
          dropdown.addOption(candidate.workspacePath, candidate.name);
        }
        dropdown.setValue(this.parentPath).onChange((value) => { this.parentPath = value; });
      });
    }
    const repeatSetting = new Setting(this.contentEl).setName("重复规则").setDesc("例行事项可填写，例如：每周一、三、五").addText((text) => text
      .setPlaceholder("可选")
      .onChange((value) => { this.repeatRule = value; }));
    refreshConditionalFields = (): void => {
      nameInput?.setPlaceholder(this.type === "项目" ? "例如：WorkBuddy 使用技巧知识库" : "例如：每周跑步三次");
      if (parentSetting) parentSetting.settingEl.style.display = this.type === "项目" ? "" : "none";
      repeatSetting.settingEl.style.display = this.type === "例行事项" ? "" : "none";
    };
    refreshConditionalFields();
    const footer = this.contentEl.createDiv("modal-button-container");
    new ButtonComponent(footer).setButtonText("取消").onClick(() => this.close());
    new ButtonComponent(footer).setCta().setButtonText("创建空间").onClick(async () => {
      const name = this.name.trim();
      if (!name) {
        new Notice("请填写空间名称");
        return;
      }
      const parent = this.type === "项目"
        ? this.parentCandidates.find((candidate) => candidate.workspacePath === this.parentPath)
        : undefined;
      await this.onCreate({
        name,
        type: this.type,
        objective: this.objective.trim() || name,
        domains: this.domains.split(/[,，]/).map((value) => value.trim()).filter(Boolean),
        themes: this.themes.split(/[,，]/).map((value) => value.trim()).filter(Boolean),
        parentPath: parent?.workspacePath,
        parentName: parent?.name,
        repeatRule: this.repeatRule.trim() || undefined,
      });
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class KnowledgeWorkspaceManagerModal extends Modal {
  private readonly selectedPaths: Set<string>;
  private readonly aiSuggestedPaths = new Set<string>();
  private query = "";
  private objective: string;

  constructor(
    private readonly plugin: KnowGrovePlugin,
    private readonly workspace: KnowledgeWorkspaceSummary,
    private readonly candidates: KnowledgeThemeDocument[],
    private readonly onPlan: () => Promise<ThemePlanningProposal>,
    private readonly onSave: (objective: string, paths: string[]) => Promise<void>,
  ) {
    super(plugin.app);
    this.objective = workspace.objective;
    this.selectedPaths = new Set(workspace.documents.map((document) => document.path));
  }

  onOpen(): void {
    this.modalEl.addClass("knowgrove-modal", "knowgrove-theme-manager-modal");
    this.titleEl.setText(`${this.workspace.type}设置：${this.workspace.name}`);
    new Setting(this.contentEl).setName("目标").addTextArea((text) => {
      text.setValue(this.objective).onChange((value) => { this.objective = value; });
      text.inputEl.rows = 3;
    });
    const heading = this.contentEl.createDiv("knowgrove-theme-source-heading");
    heading.createEl("label", { cls: "knowgrove-field-label", text: "关联资料" });
    const count = heading.createSpan({ cls: "knowgrove-theme-source-count" });
    const search = this.contentEl.createDiv("knowgrove-topic-search");
    const icon = search.createSpan();
    setIcon(icon, "search");
    const input = new TextComponent(search).setPlaceholder("搜索标题、路径、领域或主题…");
    const list = this.contentEl.createDiv("knowgrove-theme-source-list");
    const render = (): void => {
      list.empty();
      count.setText(`已选 ${this.selectedPaths.size} 篇`);
      const query = this.query.toLocaleLowerCase();
      const matches = this.candidates.filter((document) => !query || [
        document.basename, document.path, ...document.domains, ...document.topics,
      ].join(" ").toLocaleLowerCase().includes(query));
      for (const document of matches.slice(0, 100)) {
        const row = list.createEl("label", { cls: "knowgrove-theme-source-row" });
        const checkbox = row.createEl("input", { type: "checkbox" });
        checkbox.checked = this.selectedPaths.has(document.path);
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) this.selectedPaths.add(document.path);
          else this.selectedPaths.delete(document.path);
          count.setText(`已选 ${this.selectedPaths.size} 篇`);
        });
        const copy = row.createDiv();
        const title = copy.createDiv("knowgrove-theme-source-title");
        title.createSpan({ text: document.basename });
        if (this.aiSuggestedPaths.has(document.path)) title.createEl("small", { text: "AI 推荐" });
        copy.createDiv({ cls: "knowgrove-theme-source-path", text: document.path });
      }
      if (!matches.length) list.createDiv({ cls: "knowgrove-topic-empty", text: "没有匹配资料" });
    };
    input.onChange((value) => { this.query = value.trim(); render(); });
    render();
    const footer = this.contentEl.createDiv("modal-button-container");
    const plan = new ButtonComponent(footer).setIcon("sparkles").setButtonText("AI 发现相关资料").onClick(async () => {
      plan.setDisabled(true).setButtonText("AI 正在判断…");
      try {
        const proposal = await this.onPlan();
        for (const source of proposal.sources) {
          this.selectedPaths.add(source.path);
          this.aiSuggestedPaths.add(source.path);
        }
        render();
        new Notice(`AI 推荐了 ${proposal.sources.length} 篇资料；确认保存后再建立关联`);
      } catch (error) {
        console.error("KnowGrove: failed to plan workspace sources", error);
        new Notice(`AI 发现失败：${error instanceof Error ? error.message : String(error)}`);
      } finally {
        plan.setDisabled(false).setButtonText("AI 重新发现");
      }
    });
    new ButtonComponent(footer).setButtonText("取消").onClick(() => this.close());
    new ButtonComponent(footer).setCta().setButtonText("保存空间").onClick(async () => {
      await this.onSave(this.objective.trim() || this.workspace.name, [...this.selectedPaths]);
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
