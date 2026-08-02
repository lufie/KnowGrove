import { ItemView, Notice, TFile, WorkspaceLeaf, setIcon } from "obsidian";
import type KnowGrovePlugin from "./main";
import {
  buildTopicIndexEntries,
  filterTopicIndexEntries,
  flattenTopicIndexEntries,
  includeTopicIndexAncestors,
  type TopicIndexEntry,
  type TopicIndexRow,
} from "./topic-index";
import type { PropertyWorkspaceSnapshot } from "./types";

export const TOPIC_INDEX_VIEW_TYPE = "knowgrove-topic-index";
const TOPIC_BATCH_SIZE = 80;
const DOCUMENT_BATCH_SIZE = 40;
const SEARCH_DEBOUNCE_MS = 100;

export class TopicIndexView extends ItemView {
  private snapshot?: PropertyWorkspaceSnapshot;
  private cachedSnapshot?: PropertyWorkspaceSnapshot;
  private cachedEntries: TopicIndexEntry[] = [];
  private query = "";
  private selectedTopic?: string;
  private documentLimit = DOCUMENT_BATCH_SIZE;
  private searchTimer?: number;
  private scanning = false;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: KnowGrovePlugin) {
    super(leaf);
  }

  getViewType(): string {
    return TOPIC_INDEX_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "主题";
  }

  getIcon(): string {
    return "list-tree";
  }

  async onOpen(): Promise<void> {
    this.registerEvent(this.app.workspace.on("file-open", () => this.updateActiveFileHighlight()));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.updateActiveFileHighlight()));
    this.render();
    await this.scan();
  }

  refresh(snapshot?: PropertyWorkspaceSnapshot): void {
    if (snapshot) this.setSnapshot(snapshot);
    this.render();
  }

  async onClose(): Promise<void> {
    window.clearTimeout(this.searchTimer);
  }

  private async scan(): Promise<void> {
    if (this.scanning) return;
    this.scanning = true;
    this.render();
    try {
      this.setSnapshot(await this.plugin.scanPropertyWorkspace());
    } catch (error) {
      console.error("KnowGrove: failed to scan topic index", error);
      new Notice("主题索引刷新失败，请查看开发者控制台");
    } finally {
      this.scanning = false;
      this.render();
    }
  }

  private entries(): TopicIndexEntry[] {
    if (!this.snapshot) return [];
    if (this.cachedSnapshot !== this.snapshot) {
      this.cachedSnapshot = this.snapshot;
      this.cachedEntries = buildTopicIndexEntries(this.snapshot.knowledgeThemes, this.snapshot.knowledgeDocuments);
    }
    return this.cachedEntries;
  }

  private setSnapshot(snapshot: PropertyWorkspaceSnapshot): void {
    this.snapshot = snapshot;
    if (this.cachedSnapshot === snapshot) return;
    this.cachedSnapshot = snapshot;
    this.cachedEntries = buildTopicIndexEntries(snapshot.knowledgeThemes, snapshot.knowledgeDocuments);
  }

  private render(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("knowgrove-topic-index-view");

    const controls = root.createDiv("knowgrove-topic-index-controls");
    const searchWrap = controls.createDiv("knowgrove-topic-index-search");
    const searchIcon = searchWrap.createSpan();
    setIcon(searchIcon, "search");
    const search = searchWrap.createEl("input", {
      type: "search",
      value: this.query,
      placeholder: "搜索主题、领域或文档…",
      attr: { "aria-label": "搜索主题、领域或文档" },
    });
    search.addEventListener("input", () => {
      this.query = search.value.trim();
      this.selectedTopic = undefined;
      this.documentLimit = DOCUMENT_BATCH_SIZE;
      window.clearTimeout(this.searchTimer);
      this.searchTimer = window.setTimeout(() => this.renderContent(content), SEARCH_DEBOUNCE_MS);
    });
    const refresh = controls.createEl("button", {
      cls: "clickable-icon",
      attr: { "aria-label": this.scanning ? "正在刷新主题" : "刷新主题" },
    });
    setIcon(refresh, this.scanning ? "loader-circle" : "refresh-cw");
    refresh.disabled = this.scanning;
    if (this.scanning) refresh.addClass("is-loading");
    refresh.addEventListener("click", () => void this.scan());

    const content = root.createDiv("knowgrove-topic-index-content");
    this.renderContent(content);
    this.updateActiveFileHighlight();
  }

  private renderContent(container: HTMLElement): void {
    container.empty();
    const entries = this.entries();
    const selected = this.selectedTopic
      ? entries.find((entry) => entry.name.toLocaleLowerCase() === this.selectedTopic?.toLocaleLowerCase())
      : undefined;
    if (selected) {
      this.renderTopicDetail(container, selected);
      return;
    }

    const matches = filterTopicIndexEntries(entries, this.query);
    if (!this.snapshot && this.scanning) {
      const loading = container.createDiv("knowgrove-topic-index-empty");
      const icon = loading.createSpan("is-loading");
      setIcon(icon, "loader-circle");
      loading.createSpan({ text: "正在读取主题…" });
      return;
    }
    if (!matches.length) {
      const empty = container.createDiv("knowgrove-topic-index-empty");
      const icon = empty.createSpan();
      setIcon(icon, this.query ? "search-x" : "tags");
      empty.createSpan({ text: this.query ? "没有匹配的主题或文档" : "还没有主题属性" });
      return;
    }

    const visibleEntries = this.query ? includeTopicIndexAncestors(matches, entries) : matches;
    const list = container.createDiv("knowgrove-topic-index-list");
    this.renderTopicRows(list, flattenTopicIndexEntries(visibleEntries), container);
  }

  private renderTopicRows(list: HTMLElement, rows: readonly TopicIndexRow[], content: HTMLElement): void {
    let limit = Math.min(TOPIC_BATCH_SIZE, rows.length);
    const renderBatch = (): void => {
      list.empty();
      for (const { entry, depth } of rows.slice(0, limit)) {
        const row = list.createEl("button", {
          cls: depth ? "knowgrove-topic-index-row is-child-topic" : "knowgrove-topic-index-row",
          attr: {
            "aria-label": `${entry.name}，${entry.documents.length} 篇文档，${entry.fixed ? "已进入知识树" : "尚未进入知识树"}`,
          },
        });
        row.dataset.depth = String(depth);
        row.style.setProperty("--knowgrove-topic-indent", `${Math.min(depth, 6) * 16}px`);
        const copy = row.createDiv("knowgrove-topic-index-row-copy");
        copy.createSpan({ text: entry.name });
        if (entry.fixed) {
          const fixed = copy.createSpan({ cls: "knowgrove-topic-index-fixed", attr: { title: "已进入知识树" } });
          setIcon(fixed, "tree-pine");
        }
        row.createEl("small", { text: String(entry.documents.length) });
        row.addEventListener("click", () => {
          this.selectedTopic = entry.name;
          this.documentLimit = DOCUMENT_BATCH_SIZE;
          this.renderContent(content);
          this.contentEl.scrollTop = 0;
          this.updateActiveFileHighlight();
        });
      }
      if (limit < rows.length) {
        const more = list.createEl("button", {
          cls: "knowgrove-topic-index-more",
          text: `再显示 ${Math.min(TOPIC_BATCH_SIZE, rows.length - limit)} 个`,
        });
        more.addEventListener("click", () => {
          limit = Math.min(rows.length, limit + TOPIC_BATCH_SIZE);
          renderBatch();
        });
      }
    };
    renderBatch();
  }

  private renderTopicDetail(container: HTMLElement, entry: TopicIndexEntry): void {
    const header = container.createDiv("knowgrove-topic-index-detail-header");
    const back = header.createEl("button", { cls: "clickable-icon", attr: { "aria-label": "返回全部主题" } });
    setIcon(back, "chevron-left");
    back.addEventListener("click", () => {
      this.selectedTopic = undefined;
      this.documentLimit = DOCUMENT_BATCH_SIZE;
      this.renderContent(container);
      this.contentEl.scrollTop = 0;
    });
    const copy = header.createDiv("knowgrove-topic-index-detail-copy");
    copy.createDiv({ cls: "knowgrove-topic-index-detail-title", text: entry.name });
    copy.createDiv({
      cls: "knowgrove-topic-index-detail-meta",
      text: `${entry.domains[0] || "待确认领域"} · ${entry.documents.length} 篇 · ${entry.fixed ? "已进入知识树" : "尚未进入知识树"}`,
    });
    const actions = header.createDiv("knowgrove-topic-index-detail-actions");
    const action = actions.createEl("button", {
      cls: "clickable-icon",
      attr: { "aria-label": entry.fixed ? "打开主题空间" : "加入知识树" },
    });
    setIcon(action, entry.fixed ? "panel-right-open" : "pin");
    action.addEventListener("click", () => {
      const theme = this.snapshot?.knowledgeThemes.find((candidate) => candidate.name === entry.name);
      if (!theme) return;
      if (entry.fixed) void this.plugin.openKnowledgeTheme(theme);
      else void this.plugin.openKnowledgeThemeManager(theme);
    });
    const rename = actions.createEl("button", {
      cls: "clickable-icon",
      attr: { "aria-label": "批量重命名主题" },
    });
    setIcon(rename, "pencil");
    rename.addEventListener("click", () => {
      const theme = this.snapshot?.knowledgeThemes.find((candidate) => candidate.name === entry.name);
      if (theme) this.plugin.openRenameIndexedTopic(theme);
    });
    const remove = actions.createEl("button", {
      cls: "clickable-icon",
      attr: { "aria-label": "删除主题" },
    });
    setIcon(remove, "trash-2");
    remove.addEventListener("click", () => {
      const theme = this.snapshot?.knowledgeThemes.find((candidate) => candidate.name === entry.name);
      if (theme) this.plugin.confirmDeleteIndexedTopic(theme, entry.documents.length);
    });

    const list = container.createDiv("knowgrove-topic-index-documents");
    if (!entry.documents.length) {
      list.createDiv({ cls: "knowgrove-topic-index-empty", text: "这个正式主题暂时没有带该主题属性的文档。" });
      return;
    }
    for (const document of entry.documents.slice(0, this.documentLimit)) {
      const file = this.app.vault.getFileByPath(document.path);
      if (!(file instanceof TFile)) continue;
      const row = list.createEl("button", { cls: "knowgrove-topic-index-document" });
      row.dataset.knowgrovePath = document.path;
      row.createDiv({ cls: "knowgrove-topic-index-document-title", text: document.basename });
      row.createDiv({ cls: "knowgrove-topic-index-document-path", text: document.path });
      row.addEventListener("click", () => void this.app.workspace.getLeaf(false).openFile(file));
    }
    if (this.documentLimit < entry.documents.length) {
      const more = list.createEl("button", {
        cls: "knowgrove-topic-index-more",
        text: `再显示 ${Math.min(DOCUMENT_BATCH_SIZE, entry.documents.length - this.documentLimit)} 篇`,
      });
      more.addEventListener("click", () => {
        this.documentLimit = Math.min(entry.documents.length, this.documentLimit + DOCUMENT_BATCH_SIZE);
        this.renderContent(container);
        this.updateActiveFileHighlight();
      });
    }
  }

  private updateActiveFileHighlight(): void {
    const activePath = this.app.workspace.getActiveFile()?.path;
    this.contentEl.querySelectorAll<HTMLElement>("[data-knowgrove-path]").forEach((element) => {
      element.toggleClass("is-active-document", Boolean(activePath) && element.dataset.knowgrovePath === activePath);
    });
  }
}
