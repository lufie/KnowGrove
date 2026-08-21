import { ItemView, Menu, Notice, WorkspaceLeaf, setIcon } from "obsidian";
import type KnowGrovePlugin from "./main";
import { buildKnowledgeDomainTree } from "./knowledge-cycle";
import type {
  KnowledgeResearchTopicSummary,
  KnowledgeThemeSummary,
  KnowledgeWorkspaceSummary,
  PropertyWorkspaceSnapshot,
} from "./types";

export const PROPERTY_WORKBENCH_VIEW_TYPE = "knowgrove-property-workbench";

export class PropertyWorkbenchView extends ItemView {
  private snapshot?: PropertyWorkspaceSnapshot;
  private scanning = false;
  private topicQuery = "";
  private activeFlow: "research" | "project" | "life" = "research";
  private readonly expandedThemeKeys = new Set<string>();
  private readonly expandedResearchTopicKeys = new Set<string>();

  constructor(leaf: WorkspaceLeaf, private readonly plugin: KnowGrovePlugin) {
    super(leaf);
  }

  getViewType(): string {
    return PROPERTY_WORKBENCH_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "工作台";
  }

  getIcon(): string {
    return "database-zap";
  }

  async onOpen(): Promise<void> {
    this.registerEvent(this.app.workspace.on("file-open", () => this.updateActiveFileHighlight()));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.updateActiveFileHighlight()));
    this.registerDomEvent(this.contentEl, "pointerdown", () => void this.ensureScanned(), { once: true });
    this.registerDomEvent(this.contentEl, "focusin", () => void this.ensureScanned(), { once: true });
    this.render();
  }

  async ensureScanned(): Promise<void> {
    if (this.snapshot || this.scanning) return;
    await this.scan();
  }

  refresh(snapshot?: PropertyWorkspaceSnapshot): void {
    if (snapshot) this.snapshot = snapshot;
    this.render();
  }

  private async scan(): Promise<void> {
    if (this.scanning) return;
    this.scanning = true;
    this.render();
    try {
      this.snapshot = await this.plugin.scanPropertyWorkspace();
    } catch (error) {
      console.error("KnowGrove: failed to scan property workspace", error);
      new Notice("属性检查失败，请查看开发者控制台");
    } finally {
      this.scanning = false;
      this.render();
    }
  }

  private render(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("knowgrove-property-workbench");
    root.scrollLeft = 0;

    this.renderGovernance(root);
    this.renderKnowledgeFlow(root);
    this.updateActiveFileHighlight();
  }

  private updateActiveFileHighlight(): void {
    const activePath = this.app.workspace.getActiveFile()?.path;
    this.contentEl.querySelectorAll<HTMLElement>("[data-knowgrove-path]").forEach((item) => {
      item.toggleClass("is-active-document", Boolean(activePath) && item.dataset.knowgrovePath === activePath);
    });
  }

  private renderGovernance(root: HTMLElement): void {
    const section = root.createDiv("knowgrove-property-section");
    const heading = section.createDiv("knowgrove-property-section-heading");
    const audit = this.snapshot?.audit;
    heading.createEl("h3", {
      text: `属性规范：${audit ? audit.nonCompliantFiles.toLocaleString() : "—"}篇待规范`,
    });

    const actions = heading.createDiv("knowgrove-property-header-actions");
    const process = this.iconButton(
      actions,
      "list-checks",
      "处理",
      () => { if (audit) this.plugin.openPropertyAuditPreview(audit); },
    );
    process.disabled = !audit;

    const check = actions.createEl("button", {
      cls: "clickable-icon",
      attr: {
        "aria-label": this.scanning ? "正在检查" : "重新检查",
        title: this.scanning ? "正在检查" : "重新检查",
      },
    });
    setIcon(check, this.scanning ? "loader-circle" : "refresh-cw");
    if (this.scanning) check.addClass("is-loading");
    check.disabled = this.scanning;
    check.addEventListener("click", () => void this.scan());

    const state = this.plugin.getAIPropertyRunState();
    if (state.running || state.completed || state.failed) {
      const progress = section.createDiv("knowgrove-property-batch-progress");
      progress.setAttr("data-state", state.running ? "running" : state.failed ? "warning" : "complete");
      const progressIcon = progress.createSpan();
      setIcon(progressIcon, state.running ? "loader-circle" : state.failed ? "circle-alert" : "circle-check-big");
      if (state.running) progressIcon.addClass("is-loading");
      const progressCopy = progress.createDiv();
      progressCopy.createDiv({
        text: state.running
          ? `正在批量处理待检查文档`
          : state.failed
            ? `属性检查结束：${state.completed} 篇已执行，${state.failed} 篇失败`
            : `属性检查完成：${state.completed} 篇已执行`,
      });
      progressCopy.createEl("small", {
        text: state.total ? `进度 ${state.completed} / ${state.total}` : "",
      });
      const track = progressCopy.createDiv("knowgrove-property-batch-track");
      const fill = track.createDiv("knowgrove-property-batch-fill");
      const percentage = state.total ? Math.min(100, Math.round((state.completed / state.total) * 100)) : 0;
      fill.style.width = `${percentage}%`;
      if (!state.running) {
        const dismiss = progressCopy.createEl("button", {
          cls: "knowgrove-property-batch-dismiss",
          text: "知道了",
        });
        dismiss.addEventListener("click", () => this.plugin.dismissAIPropertyRunState());
      }
    }
  }

  private renderKnowledgeFlow(root: HTMLElement): void {
    const section = root.createDiv("knowgrove-property-section knowgrove-property-flow-section");
    const themes = this.snapshot?.knowledgeThemes ?? [];
    const workspaces = this.snapshot?.knowledgeWorkspaces ?? [];
    const switcher = section.createDiv("knowgrove-flow-switcher");
    this.flowSwitch(switcher, "research", "研究", themes.filter((theme) => theme.fixed).length);
    this.flowSwitch(switcher, "project", "项目", workspaces.filter((workspace) => workspace.type === "项目").length);
    this.flowSwitch(switcher, "life", "生活", workspaces.filter((workspace) => ["生活目标", "例行事项"].includes(workspace.type)).length);
    if (this.activeFlow !== "research") {
      this.renderOperationalFlow(section, this.activeFlow, workspaces);
      return;
    }

    const fixedThemes = themes.filter((theme) => theme.fixed);
    const discoveredThemes = themes.filter((theme) => !theme.fixed && theme.total >= 3);
    const domains = buildKnowledgeDomainTree(fixedThemes);
    const researchTopicCount = fixedThemes.reduce((sum, theme) => sum + theme.researchTopics.length, 0);

    const search = section.createDiv("knowgrove-topic-search knowgrove-knowledge-tree-search");
    const searchIcon = search.createSpan();
    setIcon(searchIcon, "search");
    const input = search.createEl("input", {
      type: "search",
      placeholder: "搜索领域、主题或课题",
      value: this.topicQuery,
      attr: { "aria-label": "搜索领域、主题或课题" },
    });
    const treeHeading = section.createDiv("knowgrove-topic-group-heading");
    treeHeading.createSpan({ cls: "knowgrove-topic-group-label", text: "知识树" });
    treeHeading.createSpan({
      cls: "knowgrove-topic-group-stats",
      text: `${domains.length} 个领域 · ${fixedThemes.length} 个主题 · ${researchTopicCount} 个课题`,
    });
    const tree = section.createDiv("knowgrove-knowledge-tree");
    const candidates = section.createDiv("knowgrove-topic-candidates");
    const renderTopics = (): void => {
      tree.empty();
      candidates.empty();
      const query = this.topicQuery.toLocaleLowerCase();
      const matchingDomains = domains.filter((domain) => !query || domain.name.toLocaleLowerCase().includes(query)
        || domain.themes.some((theme) => this.themeMatches(theme, query)));
      for (const domain of matchingDomains) this.renderDomain(tree, domain.name, domain.themes, query);
      if (!matchingDomains.length) {
        tree.createDiv({ cls: "knowgrove-topic-empty", text: fixedThemes.length ? "知识树里没有匹配项" : "还没有正式主题，先从右上角新建一个。" });
      }
      const candidateMatches = discoveredThemes.filter((theme) => !query || this.themeMatches(theme, query));
      const discovery = candidates.createEl("details", { cls: "knowgrove-topic-discovery" });
      discovery.open = true;
      discovery.createEl("summary", { text: `待确认主题 · ${candidateMatches.length}` });
      const list = discovery.createDiv("knowgrove-topic-list");
      const byDomain = new Map<string, KnowledgeThemeSummary[]>();
      for (const theme of candidateMatches) {
        const domain = theme.domains[0]?.trim() || "待确认领域";
        byDomain.set(domain, [...(byDomain.get(domain) ?? []), theme]);
      }
      for (const [domain, domainThemes] of Array.from(byDomain.entries())
        .sort((left, right) => left[0].localeCompare(right[0], "zh-CN"))) {
        const group = list.createDiv("knowgrove-pending-domain-group");
        const heading = group.createDiv("knowgrove-pending-domain-heading");
        heading.createSpan({ text: domain });
        heading.createEl("small", { text: `${domainThemes.length} 个主题` });
        const domainList = group.createDiv("knowgrove-pending-domain-list");
        for (const theme of domainThemes) this.renderCandidateTopic(domainList, theme);
      }
      if (!candidateMatches.length) list.createDiv({ cls: "knowgrove-topic-empty", text: "没有匹配的候选主题" });
    };
    input.addEventListener("input", () => {
      this.topicQuery = input.value.trim();
      renderTopics();
    });
    renderTopics();
  }

  private flowSwitch(
    container: HTMLElement,
    value: "research" | "project" | "life",
    label: string,
    count: number,
  ): void {
    const button = container.createEl("button", {
      cls: this.activeFlow === value ? "is-active" : "",
      attr: { "aria-pressed": String(this.activeFlow === value) },
    });
    button.createSpan({ text: label });
    button.createEl("small", { text: String(count) });
    button.addEventListener("click", () => {
      this.activeFlow = value;
      this.topicQuery = "";
      this.render();
    });
  }

  private renderOperationalFlow(
    section: HTMLElement,
    flow: "project" | "life",
    allWorkspaces: KnowledgeWorkspaceSummary[],
  ): void {
    const workspaces = allWorkspaces.filter((workspace) => flow === "project"
      ? workspace.type === "项目"
      : ["生活目标", "例行事项"].includes(workspace.type));
    const linkedPaths = new Set(workspaces.flatMap((workspace) => workspace.documents.map((document) => document.path)));
    const stats = section.createDiv("knowgrove-topic-stats");
    this.topicStat(stats, workspaces.length, flow === "project" ? "项目空间" : "生活空间");
    this.topicStat(stats, linkedPaths.size, "已关联资料");
    this.topicStat(
      stats,
      flow === "project" ? this.snapshot?.flowCounts.project : workspaces.filter((workspace) => workspace.type === "例行事项").length,
      flow === "project" ? "项目笔记" : "例行事项",
    );
    const search = section.createDiv("knowgrove-topic-search knowgrove-knowledge-tree-search");
    const icon = search.createSpan();
    setIcon(icon, "search");
    const input = search.createEl("input", {
      type: "search",
      placeholder: flow === "project" ? "搜索领域、项目或目标" : "搜索生活主题、目标或例行事项",
      value: this.topicQuery,
    });
    const tree = section.createDiv("knowgrove-knowledge-tree");
    const render = (): void => {
      tree.empty();
      const query = this.topicQuery.toLocaleLowerCase();
      const matches = workspaces.filter((workspace) => !query || this.workspaceMatches(workspace, query));
      const groupName = (workspace: KnowledgeWorkspaceSummary): string => flow === "project"
        ? workspace.domains[0] || "待确认领域"
        : workspace.themes[0] || workspace.domains[0] || "日常生活";
      const groups = new Map<string, KnowledgeWorkspaceSummary[]>();
      for (const workspace of matches) groups.set(groupName(workspace), [...(groups.get(groupName(workspace)) ?? []), workspace]);
      for (const [name, items] of Array.from(groups.entries()).sort((left, right) => left[0].localeCompare(right[0], "zh-CN"))) {
        this.renderWorkspaceGroup(tree, name, items, flow);
      }
      if (!matches.length) {
        const empty = tree.createDiv("knowgrove-topic-empty");
        empty.createDiv({ text: flow === "project" ? "还没有项目空间。项目笔记不会自动变成项目，先建立一个明确目标。" : "还没有生活空间。可以建立生活目标或例行事项。" });
        const create = empty.createEl("button", { text: flow === "project" ? "新建项目" : "新建生活空间" });
        create.addEventListener("click", () => this.plugin.openCreateKnowledgeWorkspace(flow === "project" ? "项目" : "生活目标", flow === "life" ? "生活" : ""));
      }
    };
    input.addEventListener("input", () => { this.topicQuery = input.value.trim(); render(); });
    render();
  }

  private workspaceMatches(workspace: KnowledgeWorkspaceSummary, query: string): boolean {
    return `${workspace.name} ${workspace.objective} ${workspace.domains.join(" ")} ${workspace.themes.join(" ")} ${workspace.status}`
      .toLocaleLowerCase().includes(query);
  }

  private renderWorkspaceGroup(
    container: HTMLElement,
    name: string,
    workspaces: KnowledgeWorkspaceSummary[],
    flow: "project" | "life",
  ): void {
    const group = container.createEl("details", { cls: "knowgrove-domain-node" });
    group.open = true;
    const summary = group.createEl("summary", { cls: "knowgrove-domain-summary" });
    const label = summary.createDiv("knowgrove-tree-node-label");
    const icon = label.createSpan();
    setIcon(icon, flow === "project" ? "briefcase-business" : "heart-handshake");
    label.createSpan({ text: name });
    const add = summary.createEl("button", { cls: "clickable-icon", attr: { "aria-label": `在${name}下新建${flow === "project" ? "项目" : "生活空间"}` } });
    setIcon(add, "plus");
    add.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.plugin.openCreateKnowledgeWorkspace(flow === "project" ? "项目" : "生活目标", flow === "project" ? name : "生活");
    });
    const list = group.createDiv("knowgrove-domain-themes");
    if (flow === "project") {
      const byTheme = new Map<string, KnowledgeWorkspaceSummary[]>();
      for (const workspace of workspaces) {
        const theme = workspace.themes[0] || "未指定主题";
        byTheme.set(theme, [...(byTheme.get(theme) ?? []), workspace]);
      }
      for (const [theme, items] of Array.from(byTheme.entries()).sort((left, right) => left[0].localeCompare(right[0], "zh-CN"))) {
        const themeNode = list.createEl("details", { cls: "knowgrove-theme-node" });
        themeNode.open = true;
        const themeSummary = themeNode.createEl("summary", { cls: "knowgrove-theme-summary" });
        const themeLabel = themeSummary.createDiv("knowgrove-tree-node-label");
        const themeIcon = themeLabel.createSpan();
        setIcon(themeIcon, "folder-tree");
        themeLabel.createSpan({ text: theme });
        const themeList = themeNode.createDiv("knowgrove-research-topic-list");
        const itemPaths = new Set(items.map((workspace) => workspace.workspacePath.replace(/\.md$/i, "")));
        const itemRoots = items.filter((workspace) => !workspace.parentPath || !itemPaths.has(workspace.parentPath.replace(/\.md$/i, "")));
        for (const workspace of itemRoots) this.renderWorkspaceNode(themeList, workspace, items, 0);
      }
      return;
    }
    const paths = new Set(workspaces.map((workspace) => workspace.workspacePath.replace(/\.md$/i, "")));
    const roots = workspaces.filter((workspace) => !workspace.parentPath || !paths.has(workspace.parentPath.replace(/\.md$/i, "")));
    for (const workspace of roots) this.renderWorkspaceNode(list, workspace, workspaces, 0);
  }

  private renderWorkspaceNode(
    container: HTMLElement,
    workspace: KnowledgeWorkspaceSummary,
    all: KnowledgeWorkspaceSummary[],
    depth: number,
  ): void {
    const row = container.createDiv("knowgrove-workspace-row");
    row.dataset.knowgrovePath = workspace.workspacePath;
    row.style.setProperty("--workspace-depth", String(depth));
    const open = row.createEl("button", { cls: "knowgrove-tree-open" });
    const icon = open.createSpan();
    setIcon(icon, workspace.type === "项目" ? "briefcase-business" : workspace.type === "例行事项" ? "repeat-2" : "target");
    const copy = open.createDiv();
    copy.createDiv({ cls: "knowgrove-research-topic-name", text: workspace.name });
    copy.createDiv({ cls: "knowgrove-research-topic-question", text: `${workspace.status || "未设置状态"} · ${workspace.objective}` });
    open.addEventListener("click", () => void this.plugin.openKnowledgeWorkspace(workspace));
    const more = row.createEl("button", { cls: "clickable-icon", attr: { "aria-label": `管理${workspace.type}${workspace.name}` } });
    setIcon(more, "ellipsis");
    more.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const menu = new Menu()
        .addItem((item) => item.setTitle("设置目标与资料").setIcon("list-checks").onClick(() => void this.plugin.openKnowledgeWorkspaceManager(workspace)))
        .addItem((item) => item.setTitle(`重命名${workspace.type}`).setIcon("pencil").onClick(() => this.plugin.openRenameKnowledgeWorkspace(workspace)));
      if (workspace.type === "项目") {
        menu.addItem((item) => item.setTitle("新建子项目").setIcon("git-branch-plus").onClick(() => this.plugin.openCreateKnowledgeWorkspace("项目", workspace.domains[0] || "", workspace)));
      }
      menu.showAtMouseEvent(event);
    });
    const path = workspace.workspacePath.replace(/\.md$/i, "");
    const children = all.filter((candidate) => candidate.parentPath?.replace(/\.md$/i, "") === path);
    for (const child of children) this.renderWorkspaceNode(container, child, all, depth + 1);
  }

  private themeMatches(theme: KnowledgeThemeSummary, query: string): boolean {
    return `${theme.name} ${theme.domains.join(" ")} ${theme.researchTopics.map((topic) => `${topic.name} ${topic.coreQuestion}`).join(" ")}`
      .toLocaleLowerCase().includes(query);
  }

  private renderDomain(
    container: HTMLElement,
    name: string,
    themes: KnowledgeThemeSummary[],
    query: string,
  ): void {
    const group = container.createEl("details", { cls: "knowgrove-domain-node" });
    group.open = true;
    const summary = group.createEl("summary", { cls: "knowgrove-domain-summary" });
    const label = summary.createDiv("knowgrove-tree-node-label");
    const icon = label.createSpan();
    setIcon(icon, "layers-3");
    label.createSpan({ text: name });
    const add = summary.createEl("button", { cls: "clickable-icon", attr: { "aria-label": `在${name}下新建主题` } });
    setIcon(add, "plus");
    add.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.plugin.openCreateKnowledgeTheme(name === "待确认领域" ? "" : name);
    });
    const list = group.createDiv("knowgrove-domain-themes");
    for (const theme of themes.filter((candidate) => !query || this.themeMatches(candidate, query) || name.toLocaleLowerCase().includes(query))) {
      this.renderThemeNode(list, theme, query);
    }
  }

  private renderThemeNode(container: HTMLElement, theme: KnowledgeThemeSummary, query: string): void {
    const node = container.createDiv("knowgrove-theme-node");
    const themeKey = theme.name.toLocaleLowerCase();
    let expanded = Boolean(query) || this.expandedThemeKeys.has(themeKey);
    const summary = node.createDiv("knowgrove-theme-summary");
    summary.dataset.knowgrovePath = theme.workspacePath;
    const toggle = summary.createEl("button", { cls: "knowgrove-tree-open", attr: { "aria-label": theme.name } });
    const icon = toggle.createSpan("knowgrove-tree-chevron");
    setIcon(icon, "chevron-right");
    toggle.createSpan({ text: theme.name });
    const openWorkspace = summary.createEl("button", { cls: "clickable-icon", attr: { "aria-label": `打开主题文档${theme.name}` } });
    setIcon(openWorkspace, "panel-right-open");
    openWorkspace.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void this.plugin.openKnowledgeTheme(theme);
    });
    const add = summary.createEl("button", { cls: "clickable-icon", attr: { "aria-label": `在${theme.name}下新建课题` } });
    setIcon(add, "plus");
    add.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.plugin.openCreateKnowledgeResearchTopic(theme);
    });
    const more = summary.createEl("button", { cls: "clickable-icon", attr: { "aria-label": `管理主题${theme.name}` } });
    setIcon(more, "ellipsis");
    more.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      new Menu()
        .addItem((item) => item.setTitle("主题设置").setIcon("list-checks").onClick(() => void this.plugin.openKnowledgeThemeManager(theme)))
        .addItem((item) => item.setTitle("重命名主题").setIcon("pencil").onClick(() => this.plugin.openRenameKnowledgeTheme(theme)))
        .addItem((item) => item.setTitle("AI 整理资料").setIcon("sparkles").onClick(() => void this.plugin.synthesizeKnowledgeTheme(theme)))
        .showAtMouseEvent(event);
    });
    const topics = node.createDiv("knowgrove-research-topic-list");
    const syncExpandedState = (): void => {
      node.toggleClass("is-expanded", expanded);
      toggle.setAttr("aria-expanded", String(expanded));
      topics.hidden = !expanded;
      if (expanded) this.expandedThemeKeys.add(themeKey);
      else this.expandedThemeKeys.delete(themeKey);
    };
    toggle.addEventListener("click", () => {
      expanded = !expanded;
      syncExpandedState();
    });
    for (const topic of theme.researchTopics.filter((candidate) => !query
      || `${candidate.name} ${candidate.coreQuestion}`.toLocaleLowerCase().includes(query)
      || theme.name.toLocaleLowerCase().includes(query))) {
      this.renderResearchTopic(topics, theme, topic);
    }
    if (!theme.researchTopics.length) {
      const empty = topics.createEl("button", { cls: "knowgrove-add-first-topic", text: "+ 添加第一个课题" });
      empty.addEventListener("click", () => this.plugin.openCreateKnowledgeResearchTopic(theme));
    }
    syncExpandedState();
  }

  private renderResearchTopic(
    container: HTMLElement,
    theme: KnowledgeThemeSummary,
    topic: KnowledgeResearchTopicSummary,
  ): void {
    const node = container.createDiv("knowgrove-research-topic-node");
    const key = `${theme.name}::${topic.name}`.toLocaleLowerCase();
    let expanded = this.expandedResearchTopicKeys.has(key);
    const row = node.createDiv("knowgrove-research-topic-row");
    row.dataset.knowgrovePath = topic.workspacePath;
    const toggle = row.createEl("button", { cls: "knowgrove-tree-open", attr: { "aria-label": topic.name } });
    const icon = toggle.createSpan("knowgrove-tree-chevron");
    setIcon(icon, "chevron-right");
    const copy = toggle.createDiv();
    copy.createDiv({ cls: "knowgrove-research-topic-name", text: topic.name });
    if (topic.coreQuestion !== topic.name) copy.createDiv({ cls: "knowgrove-research-topic-question", text: topic.coreQuestion });
    const openWorkspace = row.createEl("button", { cls: "clickable-icon", attr: { "aria-label": `双窗格研究${topic.name}` } });
    setIcon(openWorkspace, "panels-top-left");
    openWorkspace.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void this.plugin.openKnowledgeResearchTopicMode(theme, topic);
    });
    const more = row.createEl("button", { cls: "clickable-icon", attr: { "aria-label": `管理课题${topic.name}` } });
    setIcon(more, "ellipsis");
    more.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      new Menu()
        .addItem((item) => item.setTitle("课题设置与资料").setIcon("list-checks").onClick(() => void this.plugin.openKnowledgeResearchTopicManager(theme, topic)))
        .addItem((item) => item.setTitle("重命名课题").setIcon("pencil").onClick(() => this.plugin.openRenameKnowledgeResearchTopic(theme, topic)))
        .showAtMouseEvent(event);
    });
    const candidates = node.createDiv("knowgrove-research-source-list");
    const sources = Array.from(new Map([
      ...topic.documents,
      ...topic.candidateDocuments,
    ].map((document) => [document.path, document])).values());
    for (const document of sources.slice(0, 16)) {
      const source = candidates.createEl("button", { cls: "knowgrove-research-source-row" });
      source.dataset.knowgrovePath = document.path;
      const sourceIcon = source.createSpan();
      setIcon(sourceIcon, topic.documents.some((selected) => selected.path === document.path) ? "check" : "file-text");
      const sourceCopy = source.createDiv();
      sourceCopy.createDiv({ cls: "knowgrove-research-source-title", text: document.basename });
      sourceCopy.createDiv({ cls: "knowgrove-research-source-path", text: document.path });
      source.draggable = true;
      source.setAttr("title", "点击在左窗格打开；也可以拖到右侧文档插入原生 Wikilink");
      source.addEventListener("dragstart", (event) => {
        const link = `[[${document.path.replace(/\.md$/i, "")}]]`;
        event.dataTransfer?.setData("text/plain", link);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
      });
      source.addEventListener("click", () => void this.plugin.openKnowledgeResearchTopicMode(theme, topic, document));
    }
    if (sources.length > 16) {
      const moreSources = candidates.createEl("button", { cls: "knowgrove-research-source-more", text: `查看全部 ${sources.length} 篇相关资料` });
      moreSources.addEventListener("click", () => void this.plugin.openKnowledgeResearchTopicManager(theme, topic));
    }
    if (!sources.length) candidates.createDiv({ cls: "knowgrove-topic-empty", text: "暂未发现相关资料，可在课题设置中运行 AI 全库发现。" });
    const syncExpandedState = (): void => {
      node.toggleClass("is-expanded", expanded);
      toggle.setAttr("aria-expanded", String(expanded));
      candidates.hidden = !expanded;
      if (expanded) this.expandedResearchTopicKeys.add(key);
      else this.expandedResearchTopicKeys.delete(key);
    };
    toggle.addEventListener("click", () => {
      expanded = !expanded;
      syncExpandedState();
    });
    syncExpandedState();
  }

  private topicStat(container: HTMLElement, value: number | undefined, label: string): void {
    const item = container.createDiv("knowgrove-topic-stat");
    item.createSpan({ text: value === undefined ? "—" : value.toLocaleString() });
    item.createEl("small", { text: label });
  }

  private renderCandidateTopic(container: HTMLElement, theme: KnowledgeThemeSummary): void {
    const card = container.createDiv({
      cls: "knowgrove-topic-card",
      attr: {
        role: "button",
        tabindex: "0",
        "aria-label": `打开主题空间：${theme.name}，共 ${theme.total} 篇资料`,
      },
    });
    card.dataset.knowgrovePath = theme.workspacePath;
    const main = card.createDiv("knowgrove-topic-card-main");
    const heading = main.createDiv("knowgrove-topic-card-heading");
    const title = heading.createDiv("knowgrove-topic-card-title");
    const icon = title.createSpan();
    setIcon(icon, theme.workspaceExists ? "folder-tree" : "network");
    title.createSpan({ text: theme.name });
    heading.createSpan({ cls: "knowgrove-topic-count", text: String(theme.total) });
    main.createDiv({
      cls: "knowgrove-topic-domain",
      text: theme.domains.slice(0, 2).join(" · ") || "待确认领域",
    });
    main.createDiv({ cls: "knowgrove-topic-meta", text: `${theme.total} 篇相关资料 · 固定后进入知识树` });
    const actions = card.createDiv("knowgrove-topic-actions");
    const manage = actions.createEl("button", {
      cls: "clickable-icon",
      attr: { "aria-label": `固定并设置主题：${theme.name}` },
    });
    setIcon(manage, "pin");
    manage.addEventListener("click", (event) => {
      event.stopPropagation();
      void this.plugin.openKnowledgeThemeManager(theme);
    });
    const arrow = actions.createSpan();
    setIcon(arrow, "chevron-right");
    card.addEventListener("click", () => void this.plugin.openKnowledgeTheme(theme));
    card.addEventListener("keydown", (event) => {
      if (event.target !== card) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      void this.plugin.openKnowledgeTheme(theme);
    });
  }

  private metric(
    container: HTMLElement,
    iconName: string,
    label: string,
    value: number | undefined,
    viewName: string,
    tone: string,
    action?: () => void,
  ): void {
    const button = container.createEl("button", { cls: "knowgrove-property-metric" });
    button.setAttr("data-tone", tone);
    const icon = button.createSpan();
    setIcon(icon, iconName);
    const copy = button.createDiv();
    copy.createDiv({ cls: "knowgrove-property-metric-value", text: value === undefined ? "—" : value.toLocaleString() });
    copy.createDiv({ cls: "knowgrove-property-metric-label", text: label });
    button.addEventListener("click", () => {
      if (action) action();
      else void this.plugin.openPropertyBaseView(viewName);
    });
  }

  private iconButton(container: HTMLElement, iconName: string, label: string, action: () => void): HTMLButtonElement {
    const button = container.createEl("button", {
      cls: "clickable-icon",
      attr: { "aria-label": label, title: label },
    });
    setIcon(button, iconName);
    button.addEventListener("click", action);
    return button;
  }
}
