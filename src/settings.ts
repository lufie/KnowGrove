import {
  App,
  FuzzySuggestModal,
  Modal,
  Notice,
  Platform,
  PluginSettingTab,
  Setting,
  TFolder,
  normalizePath,
} from "obsidian";
import type KnowGrovePlugin from "./main";
import { isCLIProvider, providerModelOptions } from "./ai-provider";
import { domainPaths, PDSA_STAGES } from "./property-taxonomy";
import {
  type AIProviderAvailability,
  type AIProviderId,
} from "./types";
import {
  formatRuntimeBytes,
  runtimeProgressRatio,
  type KnowGroveRuntimeAudit,
} from "./runtime-core";
import type { RuntimeInstallProgress } from "./runtime-manager";
import { currentKnowGroveLocale, localizeKnowGroveElement } from "./i18n";
import { normalizeAttachmentExtensions } from "./attachment-cleanup";

function cliExecutablePlaceholder(provider: AIProviderId): string {
  const placeholders: Partial<Record<AIProviderId, string>> = {
    "codex-cli": "/opt/homebrew/bin/codex",
    "claude-cli": "/opt/homebrew/bin/claude",
    "antigravity-cli": "/Users/liyijie/.local/bin/agy",
    "qoder-cli": "/Users/liyijie/.local/bin/qodercli",
    "kimi-cli": "/Users/liyijie/.local/bin/kimi",
    "minimax-cli": "/Users/liyijie/.local/bin/mmx",
    "glm-cli": "/Users/liyijie/.local/bin/zai",
    "codebuddy-cli": "/Users/liyijie/.local/bin/codebuddy",
  };
  return placeholders[provider] ?? "CLI 可执行文件路径";
}

class VaultFolderPickerModal extends FuzzySuggestModal<TFolder> {
  constructor(
    app: App,
    private readonly onChoose: (folder: TFolder) => void,
  ) {
    super(app);
    this.setPlaceholder("搜索 Vault 中的文件夹…");
  }

  getItems(): TFolder[] {
    return this.app.vault.getAllLoadedFiles()
      .filter((item): item is TFolder => item instanceof TFolder && Boolean(item.path))
      .sort((left, right) => left.path.localeCompare(right.path, currentKnowGroveLocale()));
  }

  getItemText(folder: TFolder): string {
    return folder.path;
  }

  onChooseItem(folder: TFolder): void {
    this.onChoose(folder);
  }
}

export class KnowGroveSettingTab extends PluginSettingTab {
  private readonly openModules = new Set<string>();
  private runtimeProgressUnsubscribe?: () => void;

  constructor(app: App, private readonly plugin: KnowGrovePlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    this.runtimeProgressUnsubscribe?.();
    this.runtimeProgressUnsubscribe = undefined;
    containerEl.empty();
    containerEl.addClass("knowgrove-settings");
    containerEl.createEl("h2", { text: "言序 · KnowGrove" });
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "按功能完成一次配置，之后让收集、属性整理与知识创作在 Vault 内自动流转。",
    });

    const aiModule = this.renderSettingsModule(
      containerEl,
      "ai",
      "01",
      "大模型配置",
      "选择本地 CLI 或 API、模型与连接方式，供属性整理、内容解析和知识创作统一使用。",
    );
    this.renderAIProperties(aiModule);

    const readItLaterModule = this.renderSettingsModule(
      containerEl,
      "read-it-later",
      "02",
      "Read It Later",
      "配置浏览器扩展、手机收集内容，以及文章、视频、语音的自动整理和阅读状态。",
    );
    this.renderReadItLaterSettings(readItLaterModule);
    this.renderReadItLaterAdvancedSettings(readItLaterModule);

    const propertyModule = this.renderSettingsModule(
      containerEl,
      "property",
      "03",
      "属性管理",
      "让 AI 建议分类树、补齐语义属性，并统一检查知识库中的属性规范。",
    );
    this.renderPropertyWorkflowGuide(propertyModule);
    this.renderAIPropertyAutomation(propertyModule);
    this.renderPropertySystem(propertyModule);

    const workbenchModule = this.renderSettingsModule(
      containerEl,
      "workbench",
      "04",
      "知识工作台",
      "配置知识创作、渠道稿件和配图。",
    );
    this.renderCreationStudio(workbenchModule);

    const enhancementModule = this.renderSettingsModule(
      containerEl,
      "enhancement",
      "05",
      "增强功能",
      "配置可选的笔记整理与效率增强能力。",
    );
    this.renderEnhancementSettings(enhancementModule);
    localizeKnowGroveElement(containerEl);
  }

  private renderSettingsModule(
    containerEl: HTMLElement,
    id: string,
    index: string,
    title: string,
    description: string,
  ): HTMLElement {
    const details = containerEl.createEl("details", { cls: "knowgrove-settings-module" });
    details.open = this.openModules.has(id);
    const summary = details.createEl("summary", { cls: "knowgrove-settings-module-summary" });
    summary.createSpan({ cls: "knowgrove-settings-module-index", text: index });
    const copy = summary.createDiv("knowgrove-settings-module-copy");
    copy.createEl("strong", { text: title });
    copy.createEl("span", { text: description });
    details.addEventListener("toggle", () => {
      if (details.open) this.openModules.add(id);
      else this.openModules.delete(id);
    });
    return details.createDiv("knowgrove-settings-module-content");
  }

  private renderReadItLaterSettings(containerEl: HTMLElement): void {
    const settings = this.plugin.settings;
    const capture = settings.browserCapture;

    new Setting(containerEl)
      .setName("收集箱路径")
      .setDesc("唯一需要确认的路径。阅读列表、浏览器剪藏、手机端剪藏和自动解析统一使用这个文件夹。")
      .addText((text) => text
        .setPlaceholder("阅读列表")
        .setValue(settings.trackedFolder)
        .onChange(async (value) => {
          const next = value.trim()
            ? normalizePath(value.trim()).replace(/^\/+|\/+$/g, "")
            : "阅读列表";
          settings.trackedFolder = next;
          capture.inboxFolder = "";
          capture.watchFolder = "";
          await this.plugin.savePluginData();
          this.plugin.refreshReadingViews();
        }));

    new Setting(containerEl)
      .setName("浏览器授权")
      .setDesc("仅在更换电脑或需要断开已配对的浏览器扩展时使用。")
      .addButton((button) => button
        .setButtonText("撤销授权")
        .setDisabled(!capture.enabled || !Platform.isDesktopApp)
        .onClick(async () => {
          await this.plugin.resetBrowserPairing();
          new Notice("浏览器授权已撤销。再次打开扩展即可重新配对。", 6000);
        }));

    new Setting(containerEl)
      .setName("自动整理新内容")
      .setDesc("新文档自动进入未读列表；对于只有链接或语音的轻量笔记，会自动提取、转录并由 AI 整理。")
      .addToggle((toggle) => toggle
        .setValue(settings.autoMarkNewNotes)
        .onChange(async (value) => {
          await this.setAutoProcessNewNotes(value);
        }));

    this.renderRuntimeEnvironment(containerEl);

    new Setting(containerEl)
      .setName("读到文末自动标记已读")
      .setDesc("在文末停留后自动完成；编辑文字时会暂停，避免误判。")
      .addToggle((toggle) => toggle
        .setValue(settings.autoMarkFinishedAtEnd)
        .onChange(async (value) => {
          settings.autoMarkFinishedAtEnd = value;
          this.plugin.resetAutoCompletionTracking();
          await this.plugin.savePluginData();
        }));

    new Setting(containerEl)
      .setName("文章标题添加日期")
      .setDesc("默认生成“YYYY-MM-DD-文章名”，方便按文件名排序；不会批量修改已有笔记。")
      .addToggle((toggle) => toggle
        .setValue(capture.prefixArticleTitleWithDate)
        .onChange(async (value) => {
          capture.prefixArticleTitleWithDate = value;
          await this.plugin.savePluginData();
        }));

  }

  private addClickableToggleSetting(
    containerEl: HTMLElement,
    name: string,
    description: string,
    value: boolean,
    onChange: (value: boolean) => Promise<void> | void,
  ): Setting {
    const setting = new Setting(containerEl)
      .setName(name)
      .setDesc(description);
    setting.settingEl.addClass("knowgrove-clickable-toggle-setting");
    const status = setting.controlEl.createSpan("knowgrove-setting-toggle-status");
    let inputEl: HTMLInputElement | null = null;

    const updateState = (enabled: boolean): void => {
      status.setText(enabled ? "已开启" : "已关闭");
      setting.settingEl.toggleClass("is-enabled", enabled);
      setting.infoEl.setAttr("aria-checked", enabled ? "true" : "false");
      localizeKnowGroveElement(status);
    };

    setting.addToggle((toggle) => {
      toggle
        .setValue(value)
        .onChange(async (enabled) => {
          updateState(enabled);
          await onChange(enabled);
        });
      inputEl = toggle.toggleEl.querySelector("input");
    });

    const activate = (): void => {
      const input = inputEl;
      if (input && !input.disabled) input.click();
    };
    setting.settingEl.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      if (target.closest(".setting-item-control, button, input, select, textarea, a")) return;
      activate();
    });
    setting.infoEl.tabIndex = 0;
    setting.infoEl.setAttr("role", "switch");
    setting.infoEl.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      activate();
    });
    updateState(value);
    return setting;
  }

  private renderReadItLaterAdvancedSettings(containerEl: HTMLElement): void {
    const settings = this.plugin.settings;
    const capture = settings.browserCapture;
    const details = containerEl.createEl("details", { cls: "knowgrove-settings-details" });
    details.createEl("summary", { text: "阅读习惯设置" });
    const content = details.createDiv("knowgrove-settings-details-content");

    new Setting(content)
      .setName("阅读状态属性")
      .setDesc("只有已有知识库使用不同字段时才需要修改。")
      .addText((text) => text
        .setValue(settings.statusProperty)
        .onChange(async (value) => {
          if (!value.trim()) return;
          settings.statusProperty = value.trim();
          await this.plugin.savePluginData();
          this.plugin.refreshReadingViews();
        }));

    new Setting(content)
      .setName("未读 / 已读状态值")
      .setDesc("默认使用“在看”和“已读完”。")
      .addText((text) => text
        .setValue(settings.readingStatus)
        .onChange(async (value) => {
          if (!value.trim()) return;
          settings.readingStatus = value.trim();
          await this.plugin.savePluginData();
          this.plugin.refreshReadingViews();
        }))
      .addText((text) => text
        .setValue(settings.finishedStatus)
        .onChange(async (value) => {
          if (!value.trim()) return;
          settings.finishedStatus = value.trim();
          await this.plugin.savePluginData();
          this.plugin.refreshReadingViews();
        }));

    new Setting(content)
      .setName("文末停留时间")
      .setDesc("默认 3 秒，用于避免快速滑过时误标已读。")
      .addSlider((slider) => slider
        .setLimits(1, 10, 1)
        .setDynamicTooltip()
        .setValue(settings.finishDwellSeconds)
        .onChange(async (value) => {
          settings.finishDwellSeconds = value;
          this.plugin.resetAutoCompletionTracking();
          await this.plugin.savePluginData();
        }));

  }

  private renderReadingStatusSettings(containerEl: HTMLElement): void {
    const details = containerEl.createEl("details", { cls: "knowgrove-settings-details" });
    details.createEl("summary", { text: "阅读状态管理" });
    const content = details.createDiv("knowgrove-settings-details-content");

    new Setting(content)
      .setName("跟踪文件夹")
      .setDesc("相对于仓库根目录的路径。留空表示统计整个仓库。")
      .addText((text) => text
        .setPlaceholder("例如：阅读列表")
        .setValue(this.plugin.settings.trackedFolder)
        .onChange(async (value) => {
          this.plugin.settings.trackedFolder = value.trim() ? normalizePath(value.trim()).replace(/^\/+|\/+$/g, "") : "";
          await this.plugin.savePluginData();
          this.plugin.refreshReadingViews();
        }));

    new Setting(content)
      .setName("状态属性名")
      .setDesc("写入 Markdown frontmatter 的属性名称。")
      .addText((text) => text
        .setPlaceholder("阅读状态")
        .setValue(this.plugin.settings.statusProperty)
        .onChange(async (value) => {
          const next = value.trim();
          if (!next) return;
          this.plugin.settings.statusProperty = next;
          await this.plugin.savePluginData();
          this.plugin.refreshReadingViews();
        }));

    new Setting(content)
      .setName("在看状态值")
      .addText((text) => text
        .setValue(this.plugin.settings.readingStatus)
        .onChange(async (value) => {
          const next = value.trim();
          if (!next) return;
          this.plugin.settings.readingStatus = next;
          await this.plugin.savePluginData();
          this.plugin.refreshReadingViews();
        }));

    new Setting(content)
      .setName("已读完状态值")
      .addText((text) => text
        .setValue(this.plugin.settings.finishedStatus)
        .onChange(async (value) => {
          const next = value.trim();
          if (!next) return;
          this.plugin.settings.finishedStatus = next;
          await this.plugin.savePluginData();
          this.plugin.refreshReadingViews();
        }));

    new Setting(content)
      .setName("自动接管新笔记")
      .setDesc("在跟踪文件夹中新建或导入 Markdown 笔记时，若没有阅读状态，自动设为“在看”。")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.autoMarkNewNotes)
        .onChange(async (value) => {
          this.plugin.settings.autoMarkNewNotes = value;
          await this.plugin.savePluginData();
        }));

    new Setting(content)
      .setName("读到文末自动完成")
      .setDesc("在实时阅览或阅读视图中主动滚动、点击，并在文末停留后自动切换为“已读完”。实时编辑文字时会暂停，避免误判。")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.autoMarkFinishedAtEnd)
        .onChange(async (value) => {
          this.plugin.settings.autoMarkFinishedAtEnd = value;
          this.plugin.resetAutoCompletionTracking();
          await this.plugin.savePluginData();
          this.display();
        }));

    if (this.plugin.settings.autoMarkFinishedAtEnd) {
      new Setting(content)
        .setName("文末停留时间")
        .setDesc("到达文末后等待多久再标记完成，用于减少快速滑过导致的误判。")
        .addSlider((slider) => slider
          .setLimits(1, 10, 1)
          .setDynamicTooltip()
          .setValue(this.plugin.settings.finishDwellSeconds)
          .onChange(async (value) => {
            this.plugin.settings.finishDwellSeconds = value;
            this.plugin.resetAutoCompletionTracking();
            await this.plugin.savePluginData();
          }));
    }

  }

  private renderEnhancementSettings(containerEl: HTMLElement): void {
    this.addClickableToggleSetting(
      containerEl,
      "主题列表",
      "默认开启。在左侧显示全部主题；关闭只隐藏入口，不会修改或删除笔记中的主题属性。",
      this.plugin.settings.enableTopicIndex,
      async (value) => {
        await this.plugin.setTopicIndexEnabled(value);
      },
    );

    this.addClickableToggleSetting(
      containerEl,
      "附件冗余检测",
      "只跟踪曾被笔记使用过的附件；失去最后一处引用时提醒。每天复查一次历史失联附件，不会扫描或删除从未引用的文件。",
      this.plugin.settings.enableAttachmentCleanup,
      async (value) => {
        this.plugin.settings.enableAttachmentCleanup = value;
        await this.plugin.savePluginData();
      },
    )
      .addButton((button) => button
        .setButtonText("检查附件")
        .onClick(async () => {
          button.setDisabled(true).setButtonText("正在检查");
          try {
            await this.plugin.checkAttachmentLinkConsistency();
          } finally {
            button.setDisabled(false).setButtonText("检查附件");
          }
        }));

    this.addClickableToggleSetting(
      containerEl,
      "附件随笔记移动",
      "关闭时不改变附件位置。开启后，移动笔记时只移动由该笔记独占、且位于原笔记目录内的附件；目标位置沿用 Obsidian 全局附件设置。",
      this.plugin.settings.moveAttachmentsWithNote,
      async (value) => {
        this.plugin.settings.moveAttachmentsWithNote = value;
        await this.plugin.savePluginData();
      },
    );

    this.addClickableToggleSetting(
      containerEl,
      "自动整理附件",
      "关闭时仍可从命令面板或笔记菜单手动预览整理。开启后，编辑笔记时自动把独占附件整理到 Obsidian 全局附件位置。",
      this.plugin.settings.autoOrganizeAttachments,
      async (value) => {
        this.plugin.settings.autoOrganizeAttachments = value;
        await this.plugin.savePluginData();
      },
    );

    new Setting(containerEl)
      .setName("共享附件处理")
      .setDesc("同一附件被多篇笔记引用时，默认跳过；选择复制后，为正在整理的笔记创建独立副本，并只修改该笔记的引用。")
      .addDropdown((dropdown) => dropdown
        .addOption("skip", "跳过（推荐）")
        .addOption("copy", "复制独立副本")
        .setValue(this.plugin.settings.sharedAttachmentHandling)
        .onChange(async (value) => {
          this.plugin.settings.sharedAttachmentHandling = value === "copy" ? "copy" : "skip";
          await this.plugin.savePluginData();
        }));

    new Setting(containerEl)
      .setName("附件与链接排除目录")
      .setDesc("清理、整理和一致性检查都会跳过这些 Vault 相对目录；属性管理中的排除目录也会继续生效。")
      .addTextArea((text) => {
        text.inputEl.rows = 3;
        text
          .setPlaceholder("例如：Archive/长期保留")
          .setValue(this.plugin.settings.attachmentCleanupExcludedFolders.join("\n"))
          .onChange(async (value) => {
            this.plugin.settings.attachmentCleanupExcludedFolders = Array.from(new Set(value
              .split(/\r?\n/)
              .map((folder) => normalizePath(folder.trim()).replace(/^\/+|\/+$/g, ""))
              .filter(Boolean)));
            await this.plugin.savePluginData();
            this.plugin.refreshAttachmentCleanupConfiguration();
          });
      });

    new Setting(containerEl)
      .setName("额外附件格式")
      .setDesc("通常无需修改。仅添加默认未覆盖的附件扩展名；Markdown、Canvas 和 Base 不会被当作附件。")
      .addText((text) => text
        .setPlaceholder("例如：zip, psd")
        .setValue(this.plugin.settings.attachmentCleanupExtraExtensions.join(", "))
        .onChange(async (value) => {
          this.plugin.settings.attachmentCleanupExtraExtensions = normalizeAttachmentExtensions([value]);
          await this.plugin.savePluginData();
          this.plugin.refreshAttachmentCleanupConfiguration();
        }));

    new Setting(containerEl)
      .setName("最近文件依据")
      .setDesc("控制文件列表顶部“最近”展示哪些文档。")
      .addDropdown((dropdown) => dropdown
        .addOption("opened", "最近操作")
        .addOption("modified", "最近编辑")
        .addOption("created", "最近新建")
        .setValue(this.plugin.settings.recentFileMode)
        .onChange(async (value) => {
          this.plugin.settings.recentFileMode = value as "opened" | "modified" | "created";
          await this.plugin.savePluginData();
          this.plugin.refreshRecentFiles();
        }));

    new Setting(containerEl)
      .setName("最近文件数量")
      .setDesc("默认显示 8 篇，可设置为 3–20 篇。")
      .addSlider((slider) => slider
        .setLimits(3, 20, 1)
        .setDynamicTooltip()
        .setValue(this.plugin.settings.recentFileLimit)
        .onChange(async (value) => {
          this.plugin.settings.recentFileLimit = value;
          await this.plugin.savePluginData();
          this.plugin.refreshRecentFiles();
        }));

    this.addClickableToggleSetting(
      containerEl,
      "删除多余空行",
      "段落间保留一个空行，删除多余空行。",
      this.plugin.settings.cleanupBlankLinesWithPropertyCheck,
      async (value) => {
        this.plugin.settings.cleanupBlankLinesWithPropertyCheck = value;
        await this.plugin.savePluginData();
      },
    );

    this.addClickableToggleSetting(
      containerEl,
      "选中文字支持整块拖动",
      "默认开启。选中源笔记中的文字并拖到另一篇 Markdown 后，自动引用选区所在的完整块；源内容修改后，目标笔记会同步展示。",
      this.plugin.settings.enableBlockDragReferences,
      async (value) => {
        this.plugin.settings.enableBlockDragReferences = value;
        this.plugin.clearActiveBlockDrag();
        await this.plugin.savePluginData();
      },
    );

    this.addClickableToggleSetting(
      containerEl,
      "类 Word 实时编辑",
      "默认开启。实时预览中保持排版；支持列表层级编辑，以及从块外一次删除完整图片或代码块。",
      this.plugin.settings.enableWordLikeEditing,
      async (value) => {
        this.plugin.settings.enableWordLikeEditing = value;
        await this.plugin.savePluginData();
        this.app.workspace.updateOptions();
      },
    );

    this.addClickableToggleSetting(
      containerEl,
      "启用评论",
      "评论后，评论内容将在目标文档末尾以“评论”为标题，在该章节进行记录。",
      this.plugin.settings.enableComments,
      async (value) => {
        this.plugin.settings.enableComments = value;
        await this.plugin.savePluginData();
        this.plugin.refreshCommentFeatureUi();
      },
    );
  }

  private renderRuntimeEnvironment(containerEl: HTMLElement): void {
    const setting = new Setting(containerEl)
      .setName("自动整理组件配置")
      .setDesc("正在检测自动整理组件…");

    const progressPanel = containerEl.createDiv("knowgrove-runtime-progress");
    progressPanel.hidden = true;
    const progressHeader = progressPanel.createDiv("knowgrove-runtime-progress-header");
    const progressStatus = progressHeader.createSpan("knowgrove-runtime-progress-status");
    const progressSize = progressHeader.createSpan("knowgrove-runtime-progress-size");
    const progressBar = progressPanel.createEl("progress");
    progressBar.max = 1;
    const progressStages = progressPanel.createDiv("knowgrove-runtime-progress-stages");
    const stageNames = ["检查环境", "下载组件", "校验文件", "配置组件"];
    const stageEls = stageNames.map((name) =>
      progressStages.createSpan({ cls: "knowgrove-runtime-progress-stage", text: name }));
    const capabilityList = containerEl.createDiv("knowgrove-runtime-capabilities");
    capabilityList.hidden = true;

    let latestAudit: KnowGroveRuntimeAudit | undefined;
    let latestProgress = this.plugin.getRuntimeInstallProgress();
    let downloadedInThisRun = false;
    let lastProgressRenderedAt = 0;

    const phaseIndex = (phase: RuntimeInstallProgress["phase"]): number => {
      if (phase === "checking") return 0;
      if (phase === "downloading") return 1;
      if (phase === "verifying") return 2;
      if (phase === "installing") return 3;
      return 4;
    };

    const renderProgress = (progress: RuntimeInstallProgress, failed = false): void => {
      latestProgress = progress;
      progressPanel.hidden = false;
      progressPanel.toggleClass("is-error", failed);
      const totalBytes = progress.totalBytes || latestAudit?.packageSizeBytes || 0;
      const completedBytes = Math.min(progress.completedBytes, totalBytes || progress.completedBytes);
      progressStatus.setText(failed ? `配置失败：${progress.message}` : progress.message);
      progressSize.setText(totalBytes > 0
        ? `总包大小 ${formatRuntimeBytes(totalBytes)} · 已下载 ${formatRuntimeBytes(completedBytes)}`
        : "正在获取运行包大小…");
      if (totalBytes > 0) {
        progressBar.value = progress.phase === "completed"
          ? 1
          : runtimeProgressRatio(completedBytes, totalBytes);
      } else {
        progressBar.removeAttribute("value");
      }
      const activeIndex = phaseIndex(progress.phase);
      stageEls.forEach((stageEl, index) => {
        stageEl.toggleClass("is-done", progress.phase === "completed" || index < activeIndex);
        stageEl.toggleClass("is-active", !failed && progress.phase !== "completed" && index === activeIndex);
      });
    };

    const renderCapabilities = (audit: KnowGroveRuntimeAudit): void => {
      capabilityList.empty();
      capabilityList.hidden = false;
      for (const id of ["article", "video", "audio", "ai"] as const) {
        const capability = audit.capabilities.find((item) => item.id === id);
        if (!capability) continue;
        const row = capabilityList.createDiv("knowgrove-runtime-capability");
        row.addClass(`is-${capability.status}`);
        row.createSpan("knowgrove-runtime-capability-dot");
        const copy = row.createDiv("knowgrove-runtime-capability-copy");
        const capabilityName = id === "article" ? "网页文章解析" : capability.name;
        copy.createDiv({
          cls: "knowgrove-runtime-capability-name",
          text: `${capabilityName}${capability.status === "ready" ? "可用" : "不可用"}`,
        });
        copy.createDiv({
          cls: "knowgrove-runtime-capability-detail",
          text: capability.detail,
        });
      }
    };

    const describeAudit = (audit: KnowGroveRuntimeAudit): string => {
      const size = audit.packageSizeBytes
        ? `运行包总大小 ${formatRuntimeBytes(audit.packageSizeBytes)}`
        : "未获取到运行包大小";
      return `${size}；已配置组件会自动复用。`;
    };

    const refresh = async (): Promise<void> => {
      setting.setDesc("正在检测自动整理组件…");
      try {
        latestAudit = await this.plugin.auditRuntimeEnvironment();
        setting.setDesc(describeAudit(latestAudit));
        renderCapabilities(latestAudit);
        if (latestProgress) renderProgress(latestProgress, progressPanel.hasClass("is-error"));
      } catch (error) {
        setting.setDesc(`检测失败：${error instanceof Error ? error.message : String(error)}`);
      }
    };

    setting
      .addButton((button) => button
        .setButtonText("检测")
        .onClick(async () => {
          button.setDisabled(true);
          await refresh();
          button.setDisabled(false);
        }))
      .addButton((button) => button
        .setCta()
        .setButtonText("自动配置")
        .setDisabled(!Platform.isDesktopApp)
        .onClick(async () => {
          button.setDisabled(true).setButtonText("配置中…");
          downloadedInThisRun = false;
          try {
            await this.plugin.installRuntimeEnvironment((state) => {
              if (state.phase === "downloading" && state.completedBytes > 0) downloadedInThisRun = true;
              const now = Date.now();
              const phaseChanged = state.phase !== latestProgress?.phase;
              latestProgress = state;
              if (phaseChanged || state.phase === "completed" || now - lastProgressRenderedAt >= 100) {
                renderProgress(state);
                lastProgressRenderedAt = now;
              }
            });
            new Notice("自动整理组件已配置");
            await refresh();
            if (!downloadedInThisRun && latestProgress?.phase !== "completed") {
              renderProgress({
                phase: "completed",
                message: "已复用现有组件，无需重复下载",
                completedBytes: 0,
                totalBytes: latestAudit?.packageSizeBytes ?? 0,
              });
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setting.setDesc(`自动配置失败：${message}`);
            renderProgress({
              phase: latestProgress?.phase ?? "checking",
              message,
              completedBytes: latestProgress?.completedBytes ?? 0,
              totalBytes: latestProgress?.totalBytes || latestAudit?.packageSizeBytes || 0,
            }, true);
            new Notice(`自动整理组件配置失败：${message}`, 9000);
          } finally {
            button.setDisabled(false).setButtonText("自动配置");
          }
        }));
    this.runtimeProgressUnsubscribe = this.plugin.subscribeRuntimeInstallProgress((progress) => {
      renderProgress(progress);
    });
    void refresh();
  }

  private renderBrowserClippingSettings(containerEl: HTMLElement): void {
    const settings = this.plugin.settings.browserCapture;
    const details = containerEl.createEl("details", { cls: "knowgrove-settings-details" });
    details.createEl("summary", { text: "浏览器剪藏" });
    const section = details.createDiv("knowgrove-settings-details-content");

    const status = this.plugin.getBrowserCaptureStatus();
    new Setting(section)
      .setName("接收浏览器剪藏")
      .setDesc(!Platform.isDesktopApp
        ? "只支持 Obsidian 桌面版。移动端会忽略此设置。"
        : status.running
          ? `已运行：${status.address}`
          : `未运行${status.error ? `：${status.error}` : ""}`)
      .addToggle((toggle) => toggle
        .setValue(settings.enabled)
        .setDisabled(!Platform.isDesktopApp)
        .onChange(async (value) => {
          settings.enabled = value;
          await this.plugin.savePluginData();
          try {
            await this.plugin.restartBrowserCaptureServer();
          } catch (error) {
            new Notice(`浏览器接收切换失败：${error instanceof Error ? error.message : String(error)}`);
          }
          this.display();
        }))
      .addButton((button) => button
        .setButtonText("撤销浏览器授权")
        .setDisabled(!settings.enabled || !Platform.isDesktopApp)
        .onClick(async () => {
          await this.plugin.resetBrowserPairing();
          new Notice("浏览器授权已撤销。再次打开扩展，点击“重新连接 KnowGrove”即可配对。", 7000);
        }));

    new Setting(section)
      .setName("浏览器剪藏存储路径")
      .setDesc("填写相对于当前库的路径。")
      .addText((text) => text
        .setPlaceholder(this.plugin.settings.trackedFolder || "阅读列表")
        .setValue(settings.inboxFolder)
        .onChange(async (value) => {
          settings.inboxFolder = value.trim()
            ? normalizePath(value.trim()).replace(/^\/+|\/+$/g, "")
            : "";
          await this.plugin.savePluginData();
        }));
  }

  private renderMobileClippingSettings(containerEl: HTMLElement): void {
    const settings = this.plugin.settings.browserCapture;
    const details = containerEl.createEl("details", { cls: "knowgrove-settings-details" });
    details.createEl("summary", { text: "手机端剪藏" });
    const section = details.createDiv("knowgrove-settings-details-content");

    new Setting(section)
      .setName("手机端剪藏文件夹")
      .setDesc("监听手机端写入的链接或语音笔记。填写相对于当前库的路径；留空时沿用阅读状态管理的跟踪文件夹。")
      .addText((text) => text
        .setPlaceholder(this.plugin.settings.trackedFolder || "阅读列表")
        .setValue(settings.watchFolder)
        .onChange(async (value) => {
          settings.watchFolder = value.trim()
            ? normalizePath(value.trim()).replace(/^\/+|\/+$/g, "")
            : "";
          await this.plugin.savePluginData();
        }));
  }

  private renderCaptureParsingSettings(containerEl: HTMLElement): void {
    const settings = this.plugin.settings.browserCapture;
    const details = containerEl.createEl("details", { cls: "knowgrove-settings-details" });
    details.createEl("summary", { text: "剪藏内容解析" });
    const section = details.createDiv("knowgrove-settings-details-content");

    new Setting(section)
      .setName("笔记自动解析")
      .setDesc("针对剪藏笔记中的链接或语音文件进行转录和解析。启用后会在 Obsidian 启动时自动触发，也可通过左侧菜单栏手动触发。")
      .addToggle((toggle) => toggle
        .setValue(settings.autoProcessLinkNotes)
        .onChange(async (value) => {
          settings.autoProcessLinkNotes = value;
          await this.plugin.savePluginData();
        }));

    new Setting(section)
      .setName("文章标题添加日期前缀")
      .setDesc("默认开启，生成“YYYY-MM-DD-文章名”，便于按文件名排序。关闭后只使用原文章名；不会批量修改已有笔记。")
      .addToggle((toggle) => toggle
        .setValue(settings.prefixArticleTitleWithDate)
        .onChange(async (value) => {
          settings.prefixArticleTitleWithDate = value;
          await this.plugin.savePluginData();
        }));

    const providerOptions: Array<[AIProviderId, string]> = [
      ["codex-cli", "Codex CLI"],
      ["claude-cli", "Claude Code CLI"],
      ["antigravity-cli", "Antigravity CLI"],
      ["qoder-cli", "Qoder CLI"],
      ["kimi-cli", "Kimi Code CLI"],
      ["minimax-cli", "MiniMax CLI"],
      ["glm-cli", "GLM CLI"],
      ["codebuddy-cli", "CodeBuddy CLI"],
      ["anthropic-api", "Anthropic API"],
      ["openai-compatible", "OpenAI 兼容接口"],
    ];
    const addProviderDropdown = (
      name: string,
      description: string,
      current: AIProviderId,
      save: (provider: AIProviderId) => void,
    ): void => {
      new Setting(section)
        .setName(name)
        .setDesc(description)
        .addDropdown((dropdown) => {
          for (const [id, label] of providerOptions) dropdown.addOption(id, label);
          dropdown.setValue(current).onChange(async (value) => {
            save(value as AIProviderId);
            await this.plugin.savePluginData();
          });
        });
    };
    addProviderDropdown(
      "网页文章引擎",
      "网页正文提取后，使用这个引擎生成摘要、要点和整理正文。",
      settings.articleProvider,
      (provider) => { settings.articleProvider = provider; },
    );
    addProviderDropdown(
      "视频内容引擎",
      "字幕或 Whisper 逐字稿生成后，使用这个引擎整理。",
      settings.videoProvider,
      (provider) => { settings.videoProvider = provider; },
    );
    addProviderDropdown(
      "语音内容引擎",
      "Whisper 逐字稿生成后，使用这个引擎生成摘要、要点和整理正文。",
      settings.audioProvider,
      (provider) => { settings.audioProvider = provider; },
    );

    const toolsDetails = section.createEl("details", { cls: "knowgrove-settings-details" });
    toolsDetails.createEl("summary", { text: "存储路径与本地解析工具" });
    const tools = toolsDetails.createDiv("knowgrove-settings-details-content");
    const addFolderSetting = (
      name: string,
      description: string,
      value: string,
      save: (path: string) => void,
      placeholder: string,
    ): void => {
      new Setting(tools)
        .setName(name)
        .setDesc(description)
        .addText((text) => text
          .setPlaceholder(placeholder)
          .setValue(value)
          .onChange(async (next) => {
            save(next.trim() ? normalizePath(next.trim()).replace(/^\/+|\/+$/g, "") : "");
            await this.plugin.savePluginData();
          }));
    };
    addFolderSetting(
      "网页文章保存目录",
      "留空时在原链接笔记内完成；填写后处理完成会移动到该目录。",
      settings.articleOutputFolder,
      (path) => { settings.articleOutputFolder = path; },
      "例如：Home/📬输入/网页",
    );
    addFolderSetting(
      "视频笔记保存目录",
      "留空时在原链接笔记内完成。",
      settings.videoOutputFolder,
      (path) => { settings.videoOutputFolder = path; },
      "例如：Home/📬输入/视频",
    );
    addFolderSetting(
      "语音笔记保存目录",
      "留空时在原链接笔记内完成。",
      settings.audioOutputFolder,
      (path) => { settings.audioOutputFolder = path; },
      "例如：Home/📬输入/语音",
    );
    addFolderSetting(
      "网页正文图片目录",
      "文章正文图片会下载到 Vault，并使用 Obsidian 内部链接嵌入；头图和平台装饰图不会保留。",
      settings.articleAssetFolder,
      (path) => { settings.articleAssetFolder = path; },
      "Home/📬输入/assets",
    );
    addFolderSetting(
      "音视频原文件目录",
      "语音原文件会保存在 Vault 内，并在笔记正文中使用 Obsidian 内部链接嵌入。",
      settings.mediaFolder,
      (path) => { settings.mediaFolder = path; },
      "Home/📬输入/附件/音视频",
    );
    new Setting(tools)
      .setName("Defuddle")
      .setDesc("网页内置解析失败时使用；留空自动检测 defuddle。")
      .addText((text) => text
        .setPlaceholder("/opt/homebrew/bin/defuddle")
        .setValue(settings.defuddlePath)
        .onChange(async (value) => {
          settings.defuddlePath = value.trim();
          await this.plugin.savePluginData();
        }));
    new Setting(tools)
      .setName("yt-dlp")
      .setDesc("通常留空自动检测；用于读取字幕，以及下载公开视频或公开音频。")
      .addText((text) => text
        .setPlaceholder("/opt/homebrew/bin/yt-dlp")
        .setValue(settings.videoDownloaderPath)
        .onChange(async (value) => {
          settings.videoDownloaderPath = value.trim();
          await this.plugin.savePluginData();
        }));
    new Setting(tools)
      .setName("FFmpeg")
      .setDesc("通常由运行环境自动配置；用于音视频格式转换。")
      .addText((text) => text
        .setPlaceholder("/opt/homebrew/bin/ffmpeg")
        .setValue(settings.ffmpegPath)
        .onChange(async (value) => {
          settings.ffmpegPath = value.trim();
          await this.plugin.savePluginData();
        }));
    new Setting(tools)
      .setName("Whisper")
      .setDesc("视频没有字幕时使用；留空会自动检测 whisper 或 whisper-cli。")
      .addText((text) => text
        .setPlaceholder("/opt/homebrew/bin/whisper-cli")
        .setValue(settings.whisperPath)
        .onChange(async (value) => {
          settings.whisperPath = value.trim();
          await this.plugin.savePluginData();
        }));
    new Setting(tools)
      .setName("Whisper 模型")
      .setDesc("Python Whisper 可填 small；whisper.cpp 可填 small 或 GGML 模型完整路径。")
      .addText((text) => text
        .setPlaceholder("small")
        .setValue(settings.whisperModel)
        .onChange(async (value) => {
          settings.whisperModel = value.trim() || "small";
          await this.plugin.savePluginData();
        }));
    this.renderRuntimeEnvironment(section);
  }

  private renderAIProperties(containerEl: HTMLElement): void {
    const settings = this.plugin.settings.aiProperties;
    const section = containerEl;

    const providerSetting = new Setting(section)
      .setName("模型选择")
      .setDesc("")
      .addDropdown((dropdown) => dropdown
        .addOption("codex-cli", "Codex CLI")
        .addOption("claude-cli", "Claude Code CLI")
        .addOption("antigravity-cli", "Antigravity CLI")
        .addOption("qoder-cli", "Qoder CLI")
        .addOption("kimi-cli", "Kimi Code CLI")
        .addOption("minimax-cli", "MiniMax CLI")
        .addOption("glm-cli", "GLM CLI（zai 兼容）")
        .addOption("codebuddy-cli", "CodeBuddy CLI")
        .addOption("anthropic-api", "Anthropic API")
        .addOption("openai-compatible", "OpenAI 兼容接口")
        .setValue(settings.provider)
        .onChange(async (value) => {
          settings.provider = value as AIProviderId;
          settings.model = "";
          settings.executablePath = "";
          settings.endpoint = "";
          this.plugin.clearAIProviderDetection();
          await this.plugin.savePluginData();
          this.display();
        }));
    const providerStatus = section.createDiv("knowgrove-provider-status");
    providerStatus.createDiv({ text: "正在检查本机命令、API 配置和接口连接…" });
    const updateProviderDescription = (providers: AIProviderAvailability[]): void => {
      if (!providerSetting.settingEl.isConnected) return;
      const available = providers.filter((provider) => provider.available).map((provider) => provider.name);
      const installedOnly = providers
        .filter((provider) => provider.installed && !provider.available)
        .map((provider) => provider.name);
      const unavailable = providers
        .filter((provider) => !provider.available && !provider.installed)
        .map((provider) => provider.name);
      const selected = providers.find((provider) => provider.id === settings.provider);
      providerStatus.empty();
      providerStatus.createDiv({ text: `可调用：${available.join("、") || "暂无"}` });
      if (installedOnly.length) {
        providerStatus.createDiv({ text: `已安装但不可调用：${installedOnly.join("、")}` });
      }
      providerStatus.createDiv({ text: `待安装或配置：${unavailable.join("、") || "无"}` });
      if (selected && !selected.available) {
        providerStatus.createDiv({
          cls: "knowgrove-provider-status-warning",
          text: `当前选择不可用：${selected.detail}`,
        });
      }
    };
    const cached = this.plugin.getCachedAIProviders();
    if (cached) updateProviderDescription(cached);
    else void this.plugin.getAIProviders().then((providers) => {
      updateProviderDescription(providers);
      this.display();
    }).catch((error) => {
      providerStatus.setText(`模型检测失败：${error instanceof Error ? error.message : String(error)}`);
    });

    const selectedAvailability = cached?.find((provider) => provider.id === settings.provider);
    const models = providerModelOptions(settings.provider, selectedAvailability);
    const modelIsCustom = Boolean(settings.model && !models.includes(settings.model));
    if (models.length) {
      new Setting(section)
        .setName("模型名称")
        .setDesc("从已检测或官方推荐的模型中选择；选择“自定义模型 ID”后才需要手动填写。")
        .addDropdown((dropdown) => {
          dropdown.addOption(
            "",
            settings.provider === "codebuddy-cli"
              ? "跟随 CodeBuddy 默认模型"
              : "使用 CLI 默认模型",
          );
          for (const model of models) dropdown.addOption(model, model);
          dropdown.addOption("__custom__", "自定义模型 ID…");
          dropdown.setValue(modelIsCustom ? "__custom__" : settings.model);
          dropdown.onChange(async (value) => {
            settings.model = value === "__custom__" ? "__custom__" : value;
            await this.plugin.savePluginData();
            this.display();
          });
        });
      if (settings.model === "__custom__" || modelIsCustom) {
        new Setting(section)
          .setName("自定义模型 ID")
          .setDesc("仅在下拉列表没有目标模型时填写；填写后会覆盖 CLI 默认模型。")
          .addText((text) => text
            .setPlaceholder("模型 ID")
            .setValue(settings.model === "__custom__" ? "" : settings.model)
            .onChange(async (value) => {
              settings.model = value.trim();
              await this.plugin.savePluginData();
            }));
      }
    } else {
      new Setting(section)
        .setName("模型名称")
        .setDesc(isCLIProvider(settings.provider)
          ? "该 CLI 尚未提供可读取的模型列表；留空使用 CLI 默认模型。只有下拉列表没有目标模型时，才填写其模型 ID。"
          : "API 接口必须填写模型 ID。")
        .addText((text) => text
          .setPlaceholder(settings.provider === "codex-cli" ? "例如：gpt-5.6-sol；留空使用 CLI 默认" : "模型 ID")
          .setValue(settings.model)
          .onChange(async (value) => {
            settings.model = value.trim();
            await this.plugin.savePluginData();
          }));
    }

    if (isCLIProvider(settings.provider)) {
      new Setting(section)
        .setName("CLI 可执行文件")
        .setDesc("通常留空即可自动检测；仅在自定义安装位置时填写绝对路径。插件使用无 shell 的只读子进程运行。")
        .addText((text) => text
          .setPlaceholder(cliExecutablePlaceholder(settings.provider))
          .setValue(settings.executablePath)
          .onChange(async (value) => {
            settings.executablePath = value.trim();
            this.plugin.clearAIProviderDetection();
            await this.plugin.savePluginData();
          }));
    } else {
      new Setting(section)
        .setName("接口地址")
        .setDesc(settings.provider === "anthropic-api"
          ? "留空使用 Anthropic 官方 messages 接口。"
          : "留空使用 http://127.0.0.1:11434/v1，适用于 Ollama；也可填写 LM Studio 或其他兼容地址。")
        .addText((text) => text
          .setPlaceholder(settings.provider === "anthropic-api"
            ? "https://api.anthropic.com/v1/messages"
            : "http://127.0.0.1:11434/v1")
          .setValue(settings.endpoint)
          .onChange(async (value) => {
            settings.endpoint = value.trim();
            await this.plugin.savePluginData();
          }));

      const secretStored = Boolean(this.plugin.getAISecret(settings.provider));
      new Setting(section)
        .setName("API Key")
        .setDesc(this.plugin.supportsAISecretStorage()
          ? `${secretStored ? "已保存" : "尚未保存"}；密钥进入 Obsidian SecretStorage，不写入 data.json。OpenAI 兼容的本地接口可留空。`
          : "当前 Obsidian 版本不支持安全密钥存储，请升级后使用 API 提供方。")
        .addText((text) => {
          text.inputEl.type = "password";
          text.setPlaceholder(secretStored ? "已安全保存；输入新值可替换" : "输入 API Key")
            .setDisabled(!this.plugin.supportsAISecretStorage())
            .onChange((value) => {
              if (value.trim()) this.plugin.setAISecret(settings.provider, value.trim());
            });
        })
        .addExtraButton((button) => button
          .setIcon("eraser")
          .setTooltip("清除已保存的密钥")
          .setDisabled(!secretStored)
          .onClick(() => {
            this.plugin.setAISecret(settings.provider, "");
            this.display();
          }));
    }

    new Setting(section)
      .setName("重新检测本机 CLI")
      .setDesc("安装、升级或切换本地 CLI 后使用；只刷新可执行路径和可用状态。")
      .addButton((button) => button
        .setButtonText("重新检测")
        .onClick(async () => {
          button.setDisabled(true).setButtonText("检测中…");
          try {
            await this.plugin.getAIProviders(true);
            this.display();
          } finally {
            button.setDisabled(false).setButtonText("重新检测");
          }
        }));
  }

  private renderAIPropertyAutomation(containerEl: HTMLElement): void {
    const settings = this.plugin.settings.aiProperties;

    new Setting(containerEl)
      .setName("启用 AI 自动属性")
      .setDesc("基础字段仍由规则维护；大模型只生成类型、状态、领域和主题等语义字段，已有值默认保留。")
      .addToggle((toggle) => toggle
        .setValue(settings.enabled)
        .onChange(async (value) => {
          settings.enabled = value;
          await this.plugin.savePluginData();
          this.display();
        }));

  }

  private renderCreationStudio(containerEl: HTMLElement): void {
    const settings = this.plugin.settings.creationStudio;
    let outputFolderInput: HTMLInputElement | undefined;
    new Setting(containerEl)
      .setName("作品文件夹")
      .setDesc("保存首稿、渠道稿和版本记录。可直接输入路径，或从当前 Vault 选择已有文件夹。")
      .addText((text) => {
        outputFolderInput = text.inputEl;
        text
          .setValue(settings.outputFolder)
          .setPlaceholder("_KnowGrove/输出")
          .onChange(async (value) => {
            const next = this.normalizedFolder(value);
            if (!next) return;
            settings.outputFolder = next;
            await this.plugin.savePluginData();
          });
      })
      .addButton((button) => button
        .setButtonText("选择文件夹")
        .onClick(() => {
          new VaultFolderPickerModal(this.app, (folder) => {
            const next = this.normalizedFolder(folder.path);
            if (!next) return;
            settings.outputFolder = next;
            if (outputFolderInput) outputFolderInput.value = next;
            void this.plugin.savePluginData();
          }).open();
        }));

    new Setting(containerEl)
      .setName("生成真实配图")
      .setDesc("关闭时仍会生成可复制的配图方案；开启后可在创作助手中生成图片并保存为 Vault 附件。")
      .addToggle((toggle) => toggle
        .setValue(settings.imageGenerationEnabled)
        .onChange(async (value) => {
          settings.imageGenerationEnabled = value;
          await this.plugin.savePluginData();
          this.display();
        }));

    if (!settings.imageGenerationEnabled) return;
    new Setting(containerEl)
      .setName("配图接口与模型")
      .setDesc("支持 OpenAI Images API 或相同返回结构的兼容服务。")
      .addText((text) => text
        .setPlaceholder("https://api.openai.com/v1/images/generations")
        .setValue(settings.imageEndpoint)
        .onChange(async (value) => {
          settings.imageEndpoint = value.trim();
          await this.plugin.savePluginData();
        }))
      .addText((text) => text
        .setPlaceholder("gpt-image-1")
        .setValue(settings.imageModel)
        .onChange(async (value) => {
          settings.imageModel = value.trim();
          await this.plugin.savePluginData();
        }));
    new Setting(containerEl)
      .setName("配图尺寸与附件目录")
      .addDropdown((dropdown) => dropdown
        .addOption("1536x1024", "横图 1536×1024")
        .addOption("1024x1024", "方图 1024×1024")
        .addOption("1024x1536", "竖图 1024×1536")
        .setValue(settings.imageSize)
        .onChange(async (value) => {
          settings.imageSize = value;
          await this.plugin.savePluginData();
        }))
      .addText((text) => text
        .setValue(settings.imageAssetFolder)
        .setPlaceholder("_KnowGrove/输出/assets")
        .onChange(async (value) => {
          const next = this.normalizedFolder(value);
          if (!next) return;
          settings.imageAssetFolder = next;
          await this.plugin.savePluginData();
        }));
    new Setting(containerEl)
      .setName("配图 API Key")
      .setDesc(this.plugin.supportsAISecretStorage()
        ? "只保存在 Obsidian 安全密钥存储中，不写入 data.json。"
        : "当前 Obsidian 版本不支持安全密钥存储。")
      .addText((text) => {
        text.inputEl.type = "password";
        text.setPlaceholder(this.plugin.getCreationImageSecret() ? "已安全保存，输入新值可替换" : "输入 API Key");
        text.onChange((value) => {
          if (value.trim()) this.plugin.setCreationImageSecret(value.trim());
        });
      })
      .addButton((button) => button
        .setButtonText("清除")
        .onClick(() => {
          this.plugin.setCreationImageSecret("");
          new Notice("已清除配图 API Key");
          this.display();
        }));
  }

  private renderPropertyWorkflowGuide(containerEl: HTMLElement): void {
    const taxonomy = this.plugin.settings.propertySystem.taxonomy;

    const guide = containerEl.createDiv("knowgrove-property-guide");
    guide.setAttr("aria-label", "AI 自生长分类方案");

    const header = guide.createDiv("knowgrove-property-guide-header");
    const heading = header.createDiv();
    heading.createEl("h3", { text: "AI 自动搭建你的分类树" });
    heading.createEl("p", { text: "系统扫描现有知识，只给出一套建议；你决定是否采用，不需要逐字段配置。" });
    const badge = header.createSpan({
      cls: "knowgrove-property-guide-status",
      text: taxonomy.source === "ai" ? "已采用 AI 方案" : taxonomy.source === "custom" ? "已微调" : "系统推荐方案",
    });
    badge.setAttr("data-state", "compatible");

    const structure = guide.createDiv("knowgrove-taxonomy-layers");
    const layers = [
      {
        index: "1",
        eyebrow: "纵向骨架",
        title: "领域树",
        text: "稳定、互斥，最多两级",
        tags: taxonomy.domains.map((node) => node.children.length ? `${node.name} · ${node.children.length}` : node.name),
      },
      {
        index: "2",
        eyebrow: "横向组合",
        title: "区块维度",
        text: "与领域正交，不重复分类",
        tags: ["类型", "内容类型", "所属项目", "发布渠道"],
      },
      {
        index: "3",
        eyebrow: "精准检索",
        title: "概念索引",
        text: "AI 提取可复用概念和关系",
        tags: ["主题", "来源笔记", "关联笔记"],
      },
      {
        index: "4",
        eyebrow: "生命周期",
        title: "PDSA",
        text: "围绕主题推动计划、实践、研究与应用",
        tags: PDSA_STAGES.map((stage) => `${stage.code} · ${stage.title}`),
      },
    ];
    layers.forEach((layer) => {
      const card = structure.createDiv("knowgrove-property-guide-layer");
      const cardHeading = card.createDiv("knowgrove-property-guide-layer-heading");
      cardHeading.createSpan({ text: layer.index });
      const label = cardHeading.createDiv();
      label.createEl("small", { text: layer.eyebrow });
      label.createEl("h4", { text: layer.title });
      card.createEl("p", { text: layer.text });
      const tags = card.createDiv("knowgrove-property-guide-tags");
      layer.tags.forEach((tag) => tags.createSpan({ text: tag }));
    });

    const treeSection = guide.createDiv("knowgrove-taxonomy-tree-section");
    const treeHeader = treeSection.createDiv("knowgrove-property-guide-subheading");
    treeHeader.createSpan({ text: "当前分类树" });
    treeHeader.createEl("p", { text: "AI 会按语义选择最具体的二级领域；内容较宽时保留在一级领域。" });
    this.renderTaxonomyTree(treeSection, taxonomy.domains);

    const actions = guide.createDiv("knowgrove-taxonomy-actions");
    const generate = actions.createEl("button", {
      cls: "mod-cta",
      text: taxonomy.proposal ? "重新生成 AI 建议" : "AI 分析并给出建议",
    });
    generate.addEventListener("click", () => {
      generate.disabled = true;
      generate.setText("正在分析知识库…");
      void this.plugin.generatePropertyTaxonomyProposal()
        .then(() => {
          new Notice("AI 分类建议已生成，请选择是否使用");
          this.display();
        })
        .catch((error) => {
          console.error("KnowGrove: taxonomy proposal failed", error);
          new Notice(`分类建议生成失败：${error instanceof Error ? error.message : String(error)}`, 8000);
          generate.disabled = false;
          generate.setText("AI 分析并给出建议");
        });
    });
    actions.createEl("small", { text: `使用 ${this.plugin.getAIProviderSummary()}；只发送标题和已有分类摘要。` });

    if (taxonomy.proposal) {
      const proposal = guide.createDiv("knowgrove-taxonomy-proposal");
      const proposalHeading = proposal.createDiv();
      proposalHeading.createEl("h4", { text: "AI 建议待确认" });
      proposalHeading.createEl("p", { text: taxonomy.proposal.summary });
      this.renderTaxonomyTree(proposal, taxonomy.proposal.domains);
      const proposalActions = proposal.createDiv("knowgrove-taxonomy-actions");
      const adopt = proposalActions.createEl("button", { cls: "mod-cta", text: "直接使用这套方案" });
      adopt.addEventListener("click", () => {
        adopt.disabled = true;
        void this.plugin.adoptPropertyTaxonomyProposal()
          .then(() => this.display())
          .catch((error) => {
            new Notice(`采用失败：${error instanceof Error ? error.message : String(error)}`);
            adopt.disabled = false;
          });
      });
      const dismiss = proposalActions.createEl("button", { text: "暂不使用" });
      dismiss.addEventListener("click", () => void this.plugin.dismissPropertyTaxonomyProposal().then(() => this.display()));
    }

    new Setting(guide)
      .setName("微调分类树")
      .setDesc("只在 AI 建议不符合你的分类习惯时调整领域名称和层级。")
      .addButton((button) => button
        .setButtonText("微调")
        .onClick(() => this.openTaxonomyFineTuneModal()));
  }

  private renderTaxonomyTree(container: HTMLElement, nodes: Array<{ name: string; children: string[] }>): void {
    const tree = container.createDiv("knowgrove-taxonomy-tree");
    nodes.forEach((node) => {
      const branch = tree.createDiv("knowgrove-taxonomy-branch");
      branch.createSpan({ text: node.name });
      if (node.children.length) {
        const children = branch.createDiv();
        node.children.forEach((child) => children.createSpan({ text: child }));
      }
    });
  }

  private renderPropertySystem(containerEl: HTMLElement): void {
    const settings = this.plugin.settings.propertySystem;
    new Setting(containerEl)
      .setName("忽略文件夹")
      .setDesc("属性检查默认覆盖整个知识库，并自动跳过系统文件和代码依赖；这里每行可再添加一个不需要检查的文件夹。")
      .addTextArea((text) => text
        .setPlaceholder("例如：Home/🕹️skills")
        .setValue(settings.excludedFolders.join("\n"))
        .onChange(async (value) => {
          settings.excludedFolders = Array.from(new Set(value.split("\n")
            .map((item) => this.normalizedFolder(item))
            .filter(Boolean)));
          await this.plugin.savePluginData();
        }));
  }

  private openTaxonomyFineTuneModal(): void {
    const modal = new Modal(this.app);
    modal.titleEl.setText("微调分类树");
    modal.contentEl.createEl("p", {
      cls: "setting-item-description",
      text: "每行填写“一级领域”或“一级领域/二级领域”。最多两级，其他字段由系统维护。",
    });
    const editor = modal.contentEl.createEl("textarea", {
      cls: "knowgrove-taxonomy-fine-tune-editor",
    });
    editor.value = domainPaths(this.plugin.settings.propertySystem.taxonomy.domains).join("\n");
    const actions = modal.contentEl.createDiv("modal-button-container");
    const cancel = actions.createEl("button", { text: "取消" });
    cancel.addEventListener("click", () => modal.close());
    const save = actions.createEl("button", { cls: "mod-cta", text: "保存微调" });
    save.addEventListener("click", () => {
      save.disabled = true;
      void this.plugin.updatePropertyTaxonomyDomains(editor.value)
        .then(() => {
          modal.close();
          this.display();
        })
        .catch((error) => {
          new Notice(`分类树保存失败：${error instanceof Error ? error.message : String(error)}`);
          save.disabled = false;
        });
    });
    modal.open();
    window.setTimeout(() => editor.focus(), 50);
  }

  private async setAutoProcessNewNotes(value: boolean): Promise<void> {
    const settings = this.plugin.settings;
    settings.autoMarkNewNotes = value;
    settings.browserCapture.autoProcessLinkNotes = value;
    settings.aiProperties.autoEnrichNewNotes = value;
    settings.propertySystem.initializeTrackedNotes = value;
    await this.plugin.savePluginData();
  }

  private normalizedFolder(value: string): string {
    const trimmed = value.trim();
    return trimmed ? normalizePath(trimmed).replace(/^\/+|\/+$/g, "") : "";
  }

}
