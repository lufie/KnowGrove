import { ButtonComponent, Modal, Notice, Setting, TextAreaComponent, TextComponent, setIcon } from "obsidian";
import type KnowGrovePlugin from "./main";
import { knowledgeNamesMatch, researchTopicWorkspacePaths } from "./knowledge-cycle";
import type {
  KnowledgeResearchTopicSummary,
  KnowledgeThemeDocument,
  KnowledgeThemeSummary,
  ThemePlanningProposal,
} from "./types";

export class CreateKnowledgeThemeModal extends Modal {
  private name = "";
  private domains = "";
  private questions = "";

  constructor(
    private readonly plugin: KnowGrovePlugin,
    private readonly onCreate: (name: string, domains: string[], questions: string[]) => Promise<void>,
    private readonly defaultDomain = "",
  ) {
    super(plugin.app);
    this.domains = defaultDomain;
  }

  onOpen(): void {
    this.modalEl.addClass("knowgrove-modal", "knowgrove-theme-manager-modal");
    this.titleEl.setText("新建研究主题");
    this.contentEl.createEl("p", {
      cls: "setting-item-description",
      text: "主题是长期保留的一级研究空间，可以暂时没有资料。资料和课题稍后都能继续增加。",
    });
    new Setting(this.contentEl).setName("主题名称").addText((text) => text
      .setPlaceholder("例如：AI 知识管理")
      .onChange((value) => { this.name = value; }));
    new Setting(this.contentEl).setName("所属领域").setDesc("多个领域用逗号分隔").addText((text) => text
      .setPlaceholder("例如：AI产品, 个人成长")
      .setValue(this.defaultDomain)
      .onChange((value) => { this.domains = value; }));
    this.contentEl.createEl("label", { cls: "knowgrove-field-label", text: "首批研究课题" });
    const questions = new TextAreaComponent(this.contentEl)
      .setPlaceholder("每行一个，例如：\n怎样让知识持续更新？\n如何保证每条结论可追溯？")
      .onChange((value) => { this.questions = value; });
    questions.inputEl.rows = 5;
    const footer = this.contentEl.createDiv("modal-button-container");
    new ButtonComponent(footer).setButtonText("取消").onClick(() => this.close());
    new ButtonComponent(footer).setCta().setButtonText("创建主题").onClick(async () => {
      if (!this.name.trim()) {
        new Notice("请填写主题名称");
        return;
      }
      await this.onCreate(
        this.name.trim(),
        this.domains.split(/[,，]/).map((value) => value.trim()).filter(Boolean),
        this.questions.split(/\r?\n/).map((value) => value.trim()).filter(Boolean),
      );
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class CreateKnowledgeResearchTopicModal extends Modal {
  private name = "";
  private question = "";

  constructor(
    private readonly plugin: KnowGrovePlugin,
    private readonly theme: KnowledgeThemeSummary,
    private readonly onCreate: (name: string, question: string) => Promise<void>,
  ) {
    super(plugin.app);
  }

  onOpen(): void {
    this.modalEl.addClass("knowgrove-modal", "knowgrove-theme-manager-modal");
    this.titleEl.setText(`在“${this.theme.name}”下新建课题`);
    this.contentEl.createEl("p", {
      cls: "setting-item-description",
      text: "课题是主题下面可持续研究的具体问题，可以单独聚合一篇或多篇资料。",
    });
    let validateName = (): boolean => false;
    const nameSetting = new Setting(this.contentEl).setName("课题名称").addText((text) => text
      .setPlaceholder("例如：移动端资料采集体验")
      .onChange((value) => {
        this.name = value;
        validateName();
      }));
    const validationMessage = this.contentEl.createEl("p", {
      cls: "knowgrove-name-validation",
      attr: { role: "alert", "aria-live": "polite" },
    });
    validationMessage.hide();
    new Setting(this.contentEl).setName("核心问题").addTextArea((text) => {
      text.setPlaceholder("这个课题真正想弄清楚什么？")
        .onChange((value) => { this.question = value; });
      text.inputEl.rows = 3;
    });
    const footer = this.contentEl.createDiv("modal-button-container");
    new ButtonComponent(footer).setButtonText("取消").onClick(() => this.close());
    const createButton = new ButtonComponent(footer).setCta().setButtonText("创建课题");
    const showDuplicate = (): void => {
      validationMessage.setText("这个课题已经存在了，请使用已有课题。");
      validationMessage.show();
      nameSetting.settingEl.addClass("knowgrove-setting-invalid");
      createButton.setDisabled(true);
    };
    const clearValidation = (): void => {
      validationMessage.hide();
      nameSetting.settingEl.removeClass("knowgrove-setting-invalid");
      createButton.setDisabled(false);
    };
    validateName = (): boolean => {
      const name = this.name.trim();
      if (!name) {
        clearValidation();
        return false;
      }
      const paths = researchTopicWorkspacePaths(this.theme.name, name);
      const duplicate = this.theme.researchTopics.some((topic) => knowledgeNamesMatch(topic.name, name))
        || Boolean(this.plugin.app.vault.getAbstractFileByPath(paths.notePath))
        || Boolean(this.plugin.app.vault.getAbstractFileByPath(paths.basePath));
      if (duplicate) showDuplicate();
      else clearValidation();
      return duplicate;
    };
    createButton.onClick(async () => {
      const name = this.name.trim();
      if (!name) {
        new Notice("请填写课题名称");
        return;
      }
      if (validateName()) {
        new Notice("这个课题已经存在了");
        return;
      }
      createButton.setDisabled(true).setButtonText("正在创建…");
      try {
        await this.onCreate(name, this.question.trim() || name);
        this.close();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("已经存在") || message.includes("已存在")) {
          showDuplicate();
          new Notice("这个课题已经存在了");
        } else {
          validationMessage.setText(`创建失败：${message}`);
          validationMessage.show();
          nameSetting.settingEl.addClass("knowgrove-setting-invalid");
          createButton.setDisabled(false);
        }
      } finally {
        createButton.setButtonText("创建课题");
      }
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class KnowledgeResearchTopicManagerModal extends Modal {
  private readonly selectedPaths: Set<string>;
  private readonly aiSuggestedPaths = new Set<string>();
  private query = "";
  private coreQuestion: string;

  constructor(
    private readonly plugin: KnowGrovePlugin,
    private readonly topic: KnowledgeResearchTopicSummary,
    private readonly candidates: KnowledgeThemeDocument[],
    private readonly onPlan: () => Promise<ThemePlanningProposal>,
    private readonly onSave: (question: string, paths: string[]) => Promise<void>,
  ) {
    super(plugin.app);
    this.selectedPaths = new Set(topic.documents.map((document) => document.path));
    this.coreQuestion = topic.coreQuestion;
  }

  onOpen(): void {
    this.modalEl.addClass("knowgrove-modal", "knowgrove-theme-manager-modal");
    this.titleEl.setText(`课题设置：${this.topic.name}`);
    new Setting(this.contentEl).setName("核心问题").addTextArea((text) => {
      text.setValue(this.coreQuestion).onChange((value) => { this.coreQuestion = value; });
      text.inputEl.rows = 3;
    });
    const sourceHeading = this.contentEl.createDiv("knowgrove-theme-source-heading");
    sourceHeading.createEl("label", { cls: "knowgrove-field-label", text: "课题资料" });
    const count = sourceHeading.createSpan({ cls: "knowgrove-theme-source-count" });
    const searchWrap = this.contentEl.createDiv("knowgrove-topic-search");
    const searchIcon = searchWrap.createSpan();
    setIcon(searchIcon, "search");
    const input = new TextComponent(searchWrap).setPlaceholder("搜索整个知识库的标题、路径、领域或主题…");
    const list = this.contentEl.createDiv("knowgrove-theme-source-list");
    const suggested = new Set(this.topic.candidateDocuments.map((document) => document.path));
    const render = (): void => {
      list.empty();
      count.setText(`已选 ${this.selectedPaths.size} 篇`);
      const query = this.query.toLocaleLowerCase();
      const ranked = [...this.candidates].sort((left, right) => {
        const selectedDifference = Number(this.selectedPaths.has(right.path)) - Number(this.selectedPaths.has(left.path));
        if (selectedDifference) return selectedDifference;
        const suggestedDifference = Number(suggested.has(right.path)) - Number(suggested.has(left.path));
        return suggestedDifference || right.modifiedAt - left.modifiedAt;
      });
      const matches = ranked.filter((document) => !query || [
        document.basename,
        document.path,
        ...document.domains,
        ...document.topics,
      ].join(" ").toLocaleLowerCase().includes(query));
      for (const document of matches.slice(0, 80)) {
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
        else if (suggested.has(document.path) && !this.selectedPaths.has(document.path)) title.createEl("small", { text: "全库相关" });
        copy.createDiv({ cls: "knowgrove-theme-source-path", text: `${document.domains.slice(0, 2).join(" · ") || "未分类"} · ${document.path}` });
      }
      if (!matches.length) list.createDiv({ cls: "knowgrove-topic-empty", text: "没有匹配的资料" });
    };
    input.onChange((value) => { this.query = value.trim(); render(); });
    render();
    const footer = this.contentEl.createDiv("modal-button-container");
    const plan = new ButtonComponent(footer).setIcon("sparkles").setButtonText("AI 全库发现").onClick(async () => {
      plan.setDisabled(true).setButtonText("AI 正在全库判断…");
      try {
        const proposal = await this.onPlan();
        for (const source of proposal.sources) {
          this.selectedPaths.add(source.path);
          this.aiSuggestedPaths.add(source.path);
          suggested.add(source.path);
        }
        render();
        new Notice(`AI 推荐 ${proposal.sources.length} 篇资料；保存后才建立正式关联`);
      } catch (error) {
        console.error("KnowGrove: failed to discover research topic sources", error);
        new Notice(`AI 全库发现失败：${error instanceof Error ? error.message : String(error)}`);
      } finally {
        plan.setDisabled(false).setButtonText("AI 重新发现");
      }
    });
    new ButtonComponent(footer).setButtonText("取消").onClick(() => this.close());
    new ButtonComponent(footer).setCta().setButtonText("保存课题").onClick(async () => {
      await this.onSave(this.coreQuestion.trim() || this.topic.name, [...this.selectedPaths]);
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class RenameKnowledgeNodeModal extends Modal {
  private value: string;

  constructor(
    private readonly plugin: KnowGrovePlugin,
    title: string,
    currentValue: string,
    private readonly onRename: (value: string) => Promise<void>,
  ) {
    super(plugin.app);
    this.titleEl.setText(title);
    this.value = currentValue;
  }

  onOpen(): void {
    this.modalEl.addClass("knowgrove-modal");
    new Setting(this.contentEl).setName("新名称").addText((text) => text
      .setValue(this.value)
      .onChange((value) => { this.value = value; }));
    const footer = this.contentEl.createDiv("modal-button-container");
    new ButtonComponent(footer).setButtonText("取消").onClick(() => this.close());
    new ButtonComponent(footer).setCta().setButtonText("保存").onClick(async () => {
      const value = this.value.trim();
      if (!value) {
        new Notice("名称不能为空");
        return;
      }
      await this.onRename(value);
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class KnowledgeThemeManagerModal extends Modal {
  private readonly selectedPaths: Set<string>;
  private readonly aiSuggestedPaths = new Set<string>();
  private query = "";
  private domains: string;
  private questions: string;

  constructor(
    private readonly plugin: KnowGrovePlugin,
    private readonly theme: KnowledgeThemeSummary,
    private readonly candidates: KnowledgeThemeDocument[],
    private readonly onPlan: (questions: string[]) => Promise<ThemePlanningProposal>,
    private readonly onSave: (domains: string[], questions: string[], paths: string[]) => Promise<void>,
  ) {
    super(plugin.app);
    this.selectedPaths = new Set(theme.documents.map((document) => document.path));
    this.domains = theme.domains.join(", ");
    this.questions = theme.researchQuestions.join("\n");
  }

  onOpen(): void {
    this.modalEl.addClass("knowgrove-modal", "knowgrove-theme-manager-modal");
    this.titleEl.setText(`主题设置：${this.theme.name}`);
    this.contentEl.createEl("p", {
      cls: "setting-item-description",
      text: "所属领域会同步到主题、课题和关联资料；再写课题并选择本轮要分析的资料。",
    });

    new Setting(this.contentEl).setName("所属领域").setDesc("多个领域用逗号分隔；保存后自动同步对应属性").addText((text) => text
      .setValue(this.domains)
      .setPlaceholder("例如：投资, 宏观经济")
      .onChange((value) => { this.domains = value; }));

    this.contentEl.createEl("label", { cls: "knowgrove-field-label", text: "研究课题" });
    const questions = new TextAreaComponent(this.contentEl)
      .setValue(this.questions)
      .setPlaceholder("每行一个你真正想研究的问题")
      .onChange((value) => { this.questions = value; });
    questions.inputEl.rows = 5;

    const sourceHeading = this.contentEl.createDiv("knowgrove-theme-source-heading");
    sourceHeading.createEl("label", { cls: "knowgrove-field-label", text: "研究资料" });
    const count = sourceHeading.createSpan({ cls: "knowgrove-theme-source-count" });
    const searchWrap = this.contentEl.createDiv("knowgrove-topic-search");
    const searchIcon = searchWrap.createSpan();
    setIcon(searchIcon, "search");
    const input = new TextComponent(searchWrap).setPlaceholder("搜索标题、路径、领域或已有主题…");
    const list = this.contentEl.createDiv("knowgrove-theme-source-list");
    const suggested = new Set(this.theme.suggestedDocuments.map((document) => document.path));

    const render = (): void => {
      list.empty();
      count.setText(`已选 ${this.selectedPaths.size} 篇`);
      const normalized = this.query.toLocaleLowerCase();
      const ranked = [...this.candidates].sort((left, right) => {
        const selectedDifference = Number(this.selectedPaths.has(right.path)) - Number(this.selectedPaths.has(left.path));
        if (selectedDifference) return selectedDifference;
        const suggestedDifference = Number(suggested.has(right.path)) - Number(suggested.has(left.path));
        return suggestedDifference || right.modifiedAt - left.modifiedAt;
      });
      const matches = ranked.filter((document) => !normalized || [
        document.basename,
        document.path,
        ...document.domains,
        ...document.topics,
      ].join(" ").toLocaleLowerCase().includes(normalized));
      for (const document of matches.slice(0, 80)) {
        const row = list.createEl("label", { cls: "knowgrove-theme-source-row" });
        const checkbox = row.createEl("input", { type: "checkbox" });
        checkbox.checked = this.selectedPaths.has(document.path);
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) this.selectedPaths.add(document.path);
          else this.selectedPaths.delete(document.path);
          render();
        });
        const copy = row.createDiv();
        const title = copy.createDiv("knowgrove-theme-source-title");
        title.createSpan({ text: document.basename });
        if (this.aiSuggestedPaths.has(document.path)) {
          title.createEl("small", { text: "AI 推荐" });
        } else if (suggested.has(document.path) && !this.selectedPaths.has(document.path)) {
          title.createEl("small", { text: "属性相关" });
        }
        copy.createDiv({
          cls: "knowgrove-theme-source-path",
          text: `${document.domains.slice(0, 2).join(" · ") || "未分类"} · ${document.path}`,
        });
      }
      if (matches.length > 80) list.createDiv({ cls: "knowgrove-topic-more", text: `还有 ${matches.length - 80} 篇，请继续搜索` });
      if (!matches.length) list.createDiv({ cls: "knowgrove-topic-empty", text: "没有匹配的资料" });
    };
    input.onChange((value) => {
      this.query = value.trim();
      render();
    });
    render();

    const footer = this.contentEl.createDiv("modal-button-container");
    const plan = new ButtonComponent(footer).setIcon("sparkles").setButtonText("AI 规划课题与资料").onClick(async () => {
      plan.setDisabled(true).setButtonText("AI 正在规划…");
      try {
        const currentQuestions = this.questions.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
        const proposal = await this.onPlan(currentQuestions);
        this.questions = Array.from(new Set([...currentQuestions, ...proposal.questions])).join("\n");
        questions.setValue(this.questions);
        for (const source of proposal.sources) {
          this.selectedPaths.add(source.path);
          this.aiSuggestedPaths.add(source.path);
        }
        render();
        new Notice(`AI 建议了 ${proposal.questions.length} 个课题、${proposal.sources.length} 篇资料；确认后再保存`);
      } catch (error) {
        console.error("KnowGrove: failed to plan knowledge theme", error);
        new Notice(`AI 规划失败：${error instanceof Error ? error.message : String(error)}`);
      } finally {
        plan.setDisabled(false).setButtonText("AI 重新规划");
      }
    });
    new ButtonComponent(footer).setButtonText("取消").onClick(() => this.close());
    new ButtonComponent(footer).setCta().setButtonText("保存主题设置").onClick(async () => {
      const domains = Array.from(new Set(this.domains.split(/[,，]/).map((value) => value.trim()).filter(Boolean)));
      if (!domains.length) {
        new Notice("请至少保留一个所属领域");
        return;
      }
      await this.onSave(
        domains,
        this.questions.split(/\r?\n/).map((value) => value.trim()).filter(Boolean),
        [...this.selectedPaths],
      );
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
