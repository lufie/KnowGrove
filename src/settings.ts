import { App, Notice, PluginSettingTab, Setting, normalizePath } from "obsidian";
import type KnowGrovePlugin from "./main";
import { isCLIProvider, providerModelOptions } from "./ai-provider";
import { domainPaths, PDSA_STAGES } from "./property-taxonomy";
import {
  type AIProviderAvailability,
  type AIProviderId,
} from "./types";

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
    "workbuddy-cli": "/Users/liyijie/.local/bin/workbuddy",
  };
  return placeholders[provider] ?? "CLI 可执行文件路径";
}

export class KnowGroveSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: KnowGrovePlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("knowgrove-settings");
    containerEl.createEl("h2", { text: "KnowGrove · 知识森林" });
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "让散落资料沿着领域、主题、证据与输出持续生长。阅读状态保存在笔记属性中，评论与引用关系随 Vault 数据同步。",
    });

    this.renderPropertyWorkflowGuide(containerEl);
    this.renderAIProperties(containerEl);
    this.renderCreationStudio(containerEl);
    this.renderPropertySystem(containerEl);

    containerEl.createEl("h3", { text: "阅读列表" });

    new Setting(containerEl)
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

    new Setting(containerEl)
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

    new Setting(containerEl)
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

    new Setting(containerEl)
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

    containerEl.createEl("h3", { text: "手动标记" });

    new Setting(containerEl)
      .setName("重点关注")
      .setDesc("为笔记写入一个原生 Checkbox 属性。开启后，阅读列表会显示星标，点一下即可设为或取消重点关注；重点笔记会排在列表前面。")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.focusPropertyEnabled)
        .onChange(async (value) => {
          this.plugin.settings.focusPropertyEnabled = value;
          await this.plugin.savePluginData();
          this.plugin.refreshReadingViews();
          this.display();
        }));

    if (this.plugin.settings.focusPropertyEnabled) {
      new Setting(containerEl)
        .setName("重点关注属性名")
        .setDesc("默认“重点关注”。首次点亮星标时，插件会写入 true，Obsidian 会将它识别为可直接点选的 Checkbox。")
        .addText((text) => text
          .setPlaceholder("重点关注")
          .setValue(this.plugin.settings.focusPropertyName)
          .onChange(async (value) => {
            const next = value.trim();
            if (!next) return;
            this.plugin.settings.focusPropertyName = next;
            await this.plugin.savePluginData();
            this.plugin.refreshReadingViews();
          }));
    }

    new Setting(containerEl)
      .setName("自动接管新笔记")
      .setDesc("在跟踪文件夹中新建或导入 Markdown 笔记时，若没有阅读状态，自动设为“在看”。")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.autoMarkNewNotes)
        .onChange(async (value) => {
          this.plugin.settings.autoMarkNewNotes = value;
          await this.plugin.savePluginData();
        }));

    new Setting(containerEl)
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
      new Setting(containerEl)
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

    new Setting(containerEl)
      .setName("初始化现有笔记")
      .setDesc("仅给当前未分类的笔记补上“在看”；不会覆盖已有状态。")
      .addButton((button) => button
        .setButtonText("补齐未分类")
        .onClick(async () => {
          button.setDisabled(true).setButtonText("处理中…");
          await this.plugin.initializeUnclassifiedNotes();
          button.setDisabled(false).setButtonText("补齐未分类");
        }));

    containerEl.createEl("h3", { text: "属性检查" });

    new Setting(containerEl)
      .setName("处理时整理多余空行")
      .setDesc("默认开启。待规范笔记交给 AI 处理并成功写入属性后，会同时整理正文的多余空行；YAML、代码块、数学块和注释不会改动。")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.cleanupBlankLinesWithPropertyCheck)
        .onChange(async (value) => {
          this.plugin.settings.cleanupBlankLinesWithPropertyCheck = value;
          await this.plugin.savePluginData();
        }));

    containerEl.createEl("h3", { text: "引用默认值" });

    new Setting(containerEl)
      .setName("选中文字拖成块引用")
      .setDesc("默认开启。选中源笔记中的文字并拖到另一篇 Markdown 后，自动引用选区所在的完整块；源内容修改后，目标笔记会同步展示。")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.enableBlockDragReferences)
        .onChange(async (value) => {
          this.plugin.settings.enableBlockDragReferences = value;
          this.plugin.clearActiveBlockDrag();
          await this.plugin.savePluginData();
        }));

    new Setting(containerEl)
      .setName("默认目标文件夹")
      .setDesc("在引用目标搜索中优先显示这个文件夹。留空表示整个仓库。")
      .addText((text) => text
        .setPlaceholder("例如：卡片盒")
        .setValue(this.plugin.settings.defaultTargetFolder)
        .onChange(async (value) => {
          this.plugin.settings.defaultTargetFolder = value.trim() ? normalizePath(value.trim()).replace(/^\/+|\/+$/g, "") : "";
          await this.plugin.savePluginData();
        }));

    new Setting(containerEl)
      .setName("默认插入章节")
      .setDesc("目标笔记没有该标题时，会在文末自动创建二级标题。留空则直接追加到文末。")
      .addText((text) => text
        .setPlaceholder("引用与评论")
        .setValue(this.plugin.settings.defaultTargetHeading)
        .onChange(async (value) => {
          this.plugin.settings.defaultTargetHeading = value.trim();
          await this.plugin.savePluginData();
        }));
  }

  private renderAIProperties(containerEl: HTMLElement): void {
    const settings = this.plugin.settings.aiProperties;
    const section = containerEl.createDiv("knowgrove-ai-settings");
    const header = section.createDiv("knowgrove-property-settings-heading");
    header.createEl("h4", { text: "AI 自动属性" });
    header.createEl("p", {
      text: "规则负责文件名、日期和阅读状态；大模型只处理已开启的语义字段。已有属性默认保留，批量处理必须手动确认。",
    });

    new Setting(section)
      .setName("启用 AI 自动属性")
      .setDesc("启用后，新阅读资料会在基础属性写入后自动生成 AI 管理字段。笔记内容会发送给所选模型。")
      .addToggle((toggle) => toggle
        .setValue(settings.enabled)
        .onChange(async (value) => {
          settings.enabled = value;
          await this.plugin.savePluginData();
          this.display();
        }));

    const providerSetting = new Setting(section)
      .setName("模型引擎")
      .setDesc("正在检测本机 CLI 和可用接口…")
      .addDropdown((dropdown) => dropdown
        .addOption("codex-cli", "Codex CLI")
        .addOption("claude-cli", "Claude Code CLI")
        .addOption("antigravity-cli", "Antigravity CLI")
        .addOption("qoder-cli", "Qoder CLI")
        .addOption("kimi-cli", "Kimi Code CLI")
        .addOption("minimax-cli", "MiniMax CLI")
        .addOption("glm-cli", "GLM CLI（zai 兼容）")
        .addOption("codebuddy-cli", "CodeBuddy CLI")
        .addOption("workbuddy-cli", "WorkBuddy CLI（待协议支持）")
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
    const updateProviderDescription = (providers: AIProviderAvailability[]): void => {
      if (!providerSetting.settingEl.isConnected) return;
      const selected = providers.find((provider) => provider.id === settings.provider);
      const summary = providers.map((provider) => `${provider.available ? "✓" : "○"} ${provider.name}：${provider.detail}`).join("；");
      providerSetting.setDesc(`${summary}${selected?.configuredModel ? `；当前配置模型：${selected.configuredModel}` : ""}`);
    };
    const cached = this.plugin.getCachedAIProviders();
    if (cached) updateProviderDescription(cached);
    else void this.plugin.getAIProviders().then((providers) => {
      updateProviderDescription(providers);
      this.display();
    }).catch((error) => {
      providerSetting.setDesc(`模型检测失败：${error instanceof Error ? error.message : String(error)}`);
    });

    if (settings.enabled) {
      new Setting(section)
        .setName("自动处理新文档")
        .setDesc("关闭后只保留手动刷新和批量补齐入口。")
        .addToggle((toggle) => toggle
          .setValue(settings.autoEnrichNewNotes)
          .onChange(async (value) => {
            settings.autoEnrichNewNotes = value;
            await this.plugin.savePluginData();
          }));
    }

    const selectedAvailability = cached?.find((provider) => provider.id === settings.provider);
    const models = providerModelOptions(settings.provider, selectedAvailability);
    const modelIsCustom = Boolean(settings.model && !models.includes(settings.model));
    if (models.length) {
      new Setting(section)
        .setName("模型名称")
        .setDesc("从已检测或官方推荐的模型中选择；选择“自定义模型 ID”后才需要手动填写。")
        .addDropdown((dropdown) => {
          dropdown.addOption("", "使用 CLI 默认模型");
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
      .setName("正文发送上限")
      .setDesc("长文会保留开头和结尾，中间截断；不会修改原文。")
      .addSlider((slider) => slider
        .setLimits(4_000, 40_000, 2_000)
        .setDynamicTooltip()
        .setValue(settings.maxContentCharacters)
        .onChange(async (value) => {
          settings.maxContentCharacters = value;
          await this.plugin.savePluginData();
        }));

    new Setting(section)
      .setName("连接与执行")
      .setDesc("连接测试只发送一段插件内置的虚拟文本，不读取或修改你的笔记。")
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
        }))
      .addButton((button) => button
        .setButtonText("测试模型")
        .onClick(async () => {
          button.setDisabled(true).setButtonText("测试中…");
          try {
            const result = await this.plugin.testAIProviderConfiguration();
            button.setButtonText(`成功：${Object.keys(result).join("、")}`);
            new Notice(`AI 模型连接成功：${JSON.stringify(result)}`);
          } catch (error) {
            console.error("KnowGrove: AI provider test failed", error);
            button.setButtonText("测试失败");
            new Notice(`AI 模型测试失败：${error instanceof Error ? error.message : String(error)}`);
          } finally {
            window.setTimeout(() => button.setDisabled(false).setButtonText("测试模型"), 2_000);
          }
        }))
      .addButton((button) => button
        .setCta()
        .setButtonText("补齐缺失属性")
        .onClick(() => void this.plugin.openAIPropertyBatch()));
  }

  private renderCreationStudio(containerEl: HTMLElement): void {
    const settings = this.plugin.settings.creationStudio;
    const details = containerEl.createEl("details", { cls: "knowgrove-settings-details" });
    const summary = details.createEl("summary");
    summary.createSpan({ text: "创作与配图" });
    const content = details.createDiv("knowgrove-settings-details-content");

    new Setting(content)
      .setName("作品文件夹")
      .setDesc("首稿、渠道派生稿和版本元数据都保存在 Vault 内；不会覆盖来源资料。")
      .addText((text) => text
        .setValue(settings.outputFolder)
        .setPlaceholder("_KnowGrove/输出")
        .onChange(async (value) => {
          const next = this.normalizedFolder(value);
          if (!next) return;
          settings.outputFolder = next;
          await this.plugin.savePluginData();
        }));

    new Setting(content)
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
    new Setting(content)
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
    new Setting(content)
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
    new Setting(content)
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

    const fineTune = guide.createEl("details", { cls: "knowgrove-taxonomy-fine-tune" });
    fineTune.createEl("summary", { text: "微调领域树（可选）" });
    fineTune.createEl("p", { text: "每行填写“一级领域”或“一级领域/二级领域”。最多两级，其他字段由系统维护。" });
    const editor = fineTune.createEl("textarea");
    editor.value = domainPaths(taxonomy.domains).join("\n");
    const save = fineTune.createEl("button", { text: "保存微调" });
    save.addEventListener("click", () => {
      save.disabled = true;
      void this.plugin.updatePropertyTaxonomyDomains(editor.value)
        .then(() => this.display())
        .catch((error) => {
          new Notice(`领域树保存失败：${error instanceof Error ? error.message : String(error)}`);
          save.disabled = false;
        });
    });
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
    const advanced = containerEl.createEl("details", { cls: "knowgrove-property-advanced" });
    advanced.createEl("summary", { text: "高级设置" });
    const advancedContent = advanced.createDiv();

    new Setting(advancedContent)
      .setName("治理范围")
      .setDesc("相对于 Vault 根目录。留空表示扫描整个 Vault；系统文件、代码依赖和排除目录仍会跳过。")
      .addText((text) => text
        .setPlaceholder("例如：Home")
        .setValue(settings.scopeFolder)
        .onChange(async (value) => {
          settings.scopeFolder = this.normalizedFolder(value);
          await this.plugin.savePluginData();
        }));

    new Setting(advancedContent)
      .setName("排除目录")
      .setDesc("每行一个 Vault 相对路径。机器语料、代码仓库、Skills 和其他不适用普通笔记模板的目录应放在这里。")
      .addTextArea((text) => text
        .setPlaceholder("Home/🕹️skills\nHome/🐘项目/某项目/知识库")
        .setValue(settings.excludedFolders.join("\n"))
        .onChange(async (value) => {
          settings.excludedFolders = Array.from(new Set(value.split("\n")
            .map((item) => this.normalizedFolder(item))
            .filter(Boolean)));
          await this.plugin.savePluginData();
        }));

    new Setting(advancedContent)
      .setName("Base 文件路径")
      .setDesc("插件只会更新带有 KnowGrove 管理标记的 Base，不覆盖你手工创建的同名文件。")
      .addText((text) => text
        .setPlaceholder("_KnowGrove/属性工作台.base")
        .setValue(settings.basePath)
        .onChange(async (value) => {
          const trimmed = value.trim();
          if (!trimmed) return;
          settings.basePath = normalizePath(trimmed).replace(/^\/+/, "");
          await this.plugin.savePluginData();
        }))
      .addButton((button) => button
        .setButtonText("生成并打开")
        .onClick(() => void this.plugin.ensureAndOpenPropertyBase()));

    new Setting(advancedContent)
      .setName("为新阅读资料补齐核心属性")
      .setDesc("只处理新建事件产生的阅读资料；已有值全部保留，普通移动不会触发核心属性模板。")
      .addToggle((toggle) => toggle
        .setValue(settings.initializeTrackedNotes)
        .onChange(async (value) => {
          settings.initializeTrackedNotes = value;
          await this.plugin.savePluginData();
          this.display();
        }));

    if (settings.initializeTrackedNotes) {
      new Setting(advancedContent)
        .setName("新阅读资料的类型与状态")
        .setDesc("阅读跟踪文件夹通常承担外部输入入口；只有字段缺失时才会补齐。")
        .addText((text) => text
          .setPlaceholder("输入资料")
          .setValue(settings.trackedNoteType)
          .onChange(async (value) => {
            const next = value.trim();
            if (!next) return;
            settings.trackedNoteType = next;
            await this.plugin.savePluginData();
          }))
        .addText((text) => text
          .setPlaceholder("待整理")
          .setValue(settings.trackedNoteStatus)
          .onChange(async (value) => {
            const next = value.trim();
            if (!next) return;
            settings.trackedNoteStatus = next;
            await this.plugin.savePluginData();
          }));

      new Setting(advancedContent)
        .setName("进入知识库日期属性")
        .setDesc("仅对当下新建或导入的阅读资料写入文件创建日期，不会用运行日期回填历史笔记。")
        .addText((text) => text
          .setPlaceholder("创建时间")
          .setValue(settings.creationDateProperty)
          .onChange(async (value) => {
            const next = value.trim();
            if (!next) return;
            const previous = settings.creationDateProperty;
            settings.creationDateProperty = next;
            const creationDimension = settings.dimensions.find((dimension) => dimension.name === previous
              && dimension.origin === "system"
              && (dimension.requiredForTypes ?? []).includes("输入资料"));
            if (creationDimension) creationDimension.name = next;
            await this.plugin.savePluginData();
          }));
    }

  }

  private normalizedFolder(value: string): string {
    const trimmed = value.trim();
    return trimmed ? normalizePath(trimmed).replace(/^\/+|\/+$/g, "") : "";
  }

}
