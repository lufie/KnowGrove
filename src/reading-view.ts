import { FileSystemAdapter, ItemView, Menu, Notice, TFile, WorkspaceLeaf, setIcon } from "obsidian";
import type KnowGrovePlugin from "./main";
import type { ReadingFilter } from "./types";
import {
  KNOWGROVE_READING_VIEW_TYPE,
} from "./brand-migration";

export const READING_VIEW_TYPE = KNOWGROVE_READING_VIEW_TYPE;

interface StatusSummary {
  unread: number;
  finished: number;
}

interface DesktopWindow extends Window {
  electron?: {
    shell?: {
      showItemInFolder(path: string): void;
    };
  };
}

const FILTERS: Array<{ value: ReadingFilter; label: string }> = [
  { value: "unread", label: "未读" },
  { value: "finished", label: "已读" },
];

export class ReadingListView extends ItemView {
  private filter: ReadingFilter = "unread";
  private query = "";

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: KnowGrovePlugin,
    private readonly viewType = READING_VIEW_TYPE,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return this.viewType;
  }

  getDisplayText(): string {
    return "阅读列表";
  }

  getIcon(): string {
    return "library-big";
  }

  async onOpen(): Promise<void> {
    this.registerEvent(this.app.workspace.on("file-open", () => this.updateActiveFileHighlight()));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.updateActiveFileHighlight()));
    this.render();
  }

  refresh(): void {
    this.render();
  }

  private summarize(files: TFile[]): StatusSummary {
    const summary: StatusSummary = { unread: 0, finished: 0 };
    for (const file of files) {
      const status = this.plugin.classifyStatus(file);
      summary[status === "finished" ? "finished" : "unread"] += 1;
    }
    return summary;
  }

  private matches(file: TFile): boolean {
    const status = this.plugin.classifyStatus(file);
    const category: ReadingFilter = status === "finished" ? "finished" : "unread";
    if (category !== this.filter) return false;
    if (!this.query) return true;
    const haystack = `${file.basename} ${file.path}`.toLocaleLowerCase();
    return haystack.includes(this.query.toLocaleLowerCase());
  }

  private render(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("knowgrove-view");

    const files = this.plugin.getTrackedMarkdownFiles();
    const summary = this.summarize(files);

    const header = root.createDiv("knowgrove-header");
    const categoryGrid = header.createDiv("knowgrove-categories");
    for (const item of FILTERS) {
      const button = categoryGrid.createEl("button", {
        cls: `knowgrove-category${this.filter === item.value ? " is-active" : ""}`,
        attr: {
          "aria-pressed": String(this.filter === item.value),
        },
      });
      const icon = button.createSpan("knowgrove-category-icon");
      setIcon(icon, item.value === "finished" ? "circle-check-big" : "book-open");
      const text = button.createSpan("knowgrove-category-text");
      text.createSpan({ cls: "knowgrove-category-label", text: item.label });
      text.createSpan({ cls: "knowgrove-category-count", text: `${summary[item.value]} 篇` });
      button.addEventListener("click", () => {
        this.filter = item.value;
        this.render();
      });
    }
    const refreshButton = header.createEl("button", {
      cls: "clickable-icon knowgrove-icon-button",
      attr: { "aria-label": "刷新阅读列表" },
    });
    setIcon(refreshButton, "refresh-cw");
    refreshButton.addEventListener("click", () => this.render());

    const controls = root.createDiv("knowgrove-controls");
    const searchWrap = controls.createDiv("knowgrove-search");
    const searchIcon = searchWrap.createSpan("knowgrove-search-icon");
    setIcon(searchIcon, "search");
    const search = searchWrap.createEl("input", {
      type: "search",
      placeholder: "搜索标题或路径…",
      value: this.query,
      attr: { "aria-label": "搜索阅读列表" },
    });
    search.addEventListener("input", () => {
      this.query = search.value;
      this.renderList(list, files);
    });

    const list = root.createDiv("knowgrove-list");
    this.renderList(list, files);
    this.updateActiveFileHighlight();
  }

  private updateActiveFileHighlight(): void {
    const activePath = this.app.workspace.getActiveFile()?.path;
    this.contentEl.querySelectorAll<HTMLElement>(".knowgrove-note[data-knowgrove-path]").forEach((card) => {
      card.toggleClass("is-active-document", Boolean(activePath) && card.dataset.knowgrovePath === activePath);
    });
  }

  private renderList(container: HTMLElement, allFiles: TFile[]): void {
    container.empty();
    const files = allFiles
      .filter((file) => this.matches(file))
      .sort((a, b) => b.stat.ctime - a.stat.ctime || a.path.localeCompare(b.path, "zh-CN"));

    if (!files.length) {
      const empty = container.createDiv("knowgrove-empty");
      const icon = empty.createDiv("knowgrove-empty-icon");
      setIcon(icon, this.query ? "search-x" : "book-dashed");
      empty.createEl("strong", { text: this.query ? "没有匹配的笔记" : "这里还没有笔记" });
      empty.createEl("p", {
        text: this.query ? "换个关键词试试。" : "把 Markdown 文档加入跟踪文件夹后，它会自动出现在这里。",
      });
      return;
    }

    for (const file of files) this.renderFile(container, file);
  }

  private renderFile(container: HTMLElement, file: TFile): void {
    const classification = this.plugin.classifyStatus(file);
    const card = container.createDiv("knowgrove-note");
    card.dataset.knowgrovePath = file.path;
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `打开 ${file.basename}`);

    const main = card.createDiv("knowgrove-note-main");
    const body = main.createDiv("knowgrove-note-body");
    body.createDiv({ cls: "knowgrove-note-title", text: file.basename });
    const relativePath = file.parent?.path && file.parent.path !== "/" ? file.parent.path : "仓库根目录";
    body.createDiv({ cls: "knowgrove-note-meta", text: relativePath });

    const actions = card.createDiv("knowgrove-note-actions");
    if (this.plugin.settings.focusPropertyEnabled) {
      const focused = this.plugin.isFocusFile(file);
      const focusButton = actions.createEl("button", {
        cls: `clickable-icon knowgrove-focus-action${focused ? " is-focused" : ""}`,
        attr: {
          "aria-label": focused ? `取消收藏：${file.basename}` : `收藏：${file.basename}`,
          "aria-pressed": String(focused),
        },
      });
      setIcon(focusButton, "star");
      focusButton.addEventListener("click", (event) => {
        event.stopPropagation();
        void this.plugin.toggleFocus(file);
      });
    }
    const statusButton = actions.createEl("button", {
      cls: `clickable-icon knowgrove-status-action is-${classification}`,
      attr: {
        "aria-label": classification === "finished"
          ? `已读：${file.basename}，点击标记为未读`
          : `标记 ${file.basename} 为已读`,
      },
    });
    setIcon(statusButton, "check");
    statusButton.addEventListener("click", (event) => {
      event.stopPropagation();
      const nextStatus = classification === "finished"
        ? this.plugin.settings.readingStatus
        : this.plugin.settings.finishedStatus;
      void this.plugin.setReadingStatus(file, nextStatus);
    });

    const more = actions.createEl("button", {
      cls: "clickable-icon knowgrove-more",
      attr: { "aria-label": `更多：${file.basename}` },
    });
    setIcon(more, "ellipsis");
    more.addEventListener("click", (event) => {
      event.stopPropagation();
      this.showFileMenu(event, file);
    });

    const open = async (): Promise<void> => {
      await this.app.workspace.getLeaf(false).openFile(file);
    };
    card.addEventListener("click", () => void open());
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        void open();
      }
    });
  }

  private showFileMenu(event: MouseEvent, file: TFile): void {
    const menu = new Menu();
    menu.addItem((item) => item.setTitle("定位到原始目录").setIcon("folder-open").onClick(() => {
      this.revealInFileSystem(file);
    }));
    menu.addSeparator();
    menu.addItem((item) => item.setTitle("复制绝对路径").setIcon("copy").onClick(async () => {
      const adapter = this.app.vault.adapter;
      if (!(adapter instanceof FileSystemAdapter)) {
        new Notice("当前设备不支持获取绝对路径");
        return;
      }
      await this.copyPath(adapter.getFullPath(file.path), "绝对路径");
    }));
    menu.addItem((item) => item.setTitle("复制相对路径").setIcon("copy").onClick(async () => {
      await this.copyPath(file.path, "相对路径");
    }));
    menu.showAtMouseEvent(event);
  }

  private revealInFileSystem(file: TFile): void {
    const adapter = this.app.vault.adapter;
    const desktopWindow = window as DesktopWindow;
    if (!(adapter instanceof FileSystemAdapter) || !desktopWindow.electron?.shell?.showItemInFolder) {
      new Notice("当前设备不支持在系统文件管理器中定位");
      return;
    }
    desktopWindow.electron.shell.showItemInFolder(adapter.getFullPath(file.path));
  }

  private async copyPath(path: string, label: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(path);
      new Notice(`已复制${label}`);
    } catch {
      new Notice(`${label}复制失败`);
    }
  }
}
