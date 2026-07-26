import { Modal, Notice, Setting } from "obsidian";
import type KnowGrovePlugin from "./main";
import {
  RESEARCH_OUTPUT_PRESETS,
  getResearchOutputPreset,
  type ResearchOutputPresetId,
  type ResearchRewriteAction,
} from "./research-output";

type RewriteApplyMode = "insert" | "replace";

export class CreationRewriteModal extends Modal {
  private action: ResearchRewriteAction = "改写";
  private instruction = "";
  private presetId?: ResearchOutputPresetId;
  private result = "";
  private busy = false;

  constructor(
    private readonly plugin: KnowGrovePlugin,
    private readonly rewriteSourceText: string,
    private readonly onGenerate: (
      action: ResearchRewriteAction,
      instruction: string,
      presetId?: ResearchOutputPresetId,
    ) => Promise<string>,
    private readonly onApply: (value: string, mode: RewriteApplyMode) => Promise<void>,
  ) {
    super(plugin.app);
  }

  onOpen(): void {
    this.modalEl.addClass("knowgrove-modal", "knowgrove-rewrite-modal");
    this.render();
  }

  private render(): void {
    const root = this.contentEl;
    root.empty();
    root.createEl("h2", { text: "AI 编辑选中内容" });
    const selection = root.createEl("blockquote", { cls: "knowgrove-rewrite-selection" });
    selection.setText(this.rewriteSourceText.length > 500
      ? `${this.rewriteSourceText.slice(0, 500)}…`
      : this.rewriteSourceText);

    new Setting(root)
      .setName("编辑动作")
      .addDropdown((dropdown) => {
        for (const action of ["改写", "精简", "扩写", "改变语气", "补充证据", "适配渠道"] as ResearchRewriteAction[]) {
          dropdown.addOption(action, action);
        }
        dropdown.setValue(this.action);
        dropdown.onChange((value) => {
          this.action = value as ResearchRewriteAction;
          this.render();
        });
      });

    if (this.action === "适配渠道") {
      new Setting(root)
        .setName("目标渠道")
        .addDropdown((dropdown) => {
          for (const preset of RESEARCH_OUTPUT_PRESETS) dropdown.addOption(preset.id, preset.label);
          dropdown.setValue(this.presetId ?? "wechat");
          this.presetId = dropdown.getValue() as ResearchOutputPresetId;
          dropdown.onChange((value) => {
            this.presetId = value as ResearchOutputPresetId;
          });
        });
    }

    new Setting(root)
      .setName("补充要求")
      .setDesc("例如：更克制、保留数字、面向没有背景的读者。")
      .addTextArea((text) => {
        text.setValue(this.instruction);
        text.inputEl.rows = 3;
        text.onChange((value) => {
          this.instruction = value;
        });
      });

    const generate = root.createEl("button", {
      cls: "mod-cta knowgrove-rewrite-generate",
      text: this.busy ? "正在生成…" : this.result ? "重新生成" : "生成建议",
    });
    generate.disabled = this.busy;
    generate.addEventListener("click", () => void this.generate());

    if (!this.result) return;
    root.createEl("h3", { text: "编辑结果" });
    const result = root.createEl("textarea", {
      cls: "knowgrove-rewrite-result",
      attr: { "aria-label": "AI 编辑结果" },
    });
    result.rows = 12;
    result.value = this.result;
    result.addEventListener("input", () => {
      this.result = result.value;
    });
    const actions = root.createDiv("knowgrove-rewrite-actions");
    const insert = actions.createEl("button", { text: "插入到下方" });
    insert.addEventListener("click", () => void this.apply("insert"));
    const replace = actions.createEl("button", { cls: "mod-warning", text: "替换选区" });
    replace.addEventListener("click", () => void this.apply("replace"));
    const copy = actions.createEl("button", { text: "复制" });
    copy.addEventListener("click", () => void navigator.clipboard.writeText(this.result)
      .then(() => new Notice("已复制编辑结果")));
  }

  private async generate(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.render();
    try {
      this.result = await this.onGenerate(this.action, this.instruction, this.presetId);
    } catch (error) {
      new Notice(`AI 编辑失败：${error instanceof Error ? error.message : String(error)}`, 8000);
    } finally {
      this.busy = false;
      this.render();
    }
  }

  private async apply(mode: RewriteApplyMode): Promise<void> {
    if (!this.result.trim()) return;
    try {
      await this.onApply(this.result.trim(), mode);
      this.close();
    } catch (error) {
      new Notice(`写入失败：${error instanceof Error ? error.message : String(error)}`, 8000);
    }
  }
}

export class ChannelDerivativeModal extends Modal {
  private presetId: ResearchOutputPresetId;
  private title: string;
  private instruction = "";
  private busy = false;

  constructor(
    private readonly plugin: KnowGrovePlugin,
    sourceTitle: string,
    currentPresetId: ResearchOutputPresetId,
    private readonly onGenerate: (
      presetId: ResearchOutputPresetId,
      title: string,
      instruction: string,
    ) => Promise<void>,
  ) {
    super(plugin.app);
    this.presetId = RESEARCH_OUTPUT_PRESETS.find((preset) => preset.id !== currentPresetId)?.id ?? "wechat";
    this.title = `${sourceTitle} · ${getResearchOutputPreset(this.presetId).label}版`;
  }

  onOpen(): void {
    this.modalEl.addClass("knowgrove-modal", "knowgrove-channel-modal");
    this.render();
  }

  private render(): void {
    const root = this.contentEl;
    root.empty();
    root.createEl("h2", { text: "生成渠道版本" });
    root.createEl("p", {
      cls: "setting-item-description",
      text: "新版本会另存为一篇作品，不覆盖当前原稿，并保留来源作品链接。",
    });
    new Setting(root)
      .setName("目标渠道")
      .addDropdown((dropdown) => {
        for (const preset of RESEARCH_OUTPUT_PRESETS) dropdown.addOption(preset.id, preset.label);
        dropdown.setValue(this.presetId);
        dropdown.onChange((value) => {
          this.presetId = value as ResearchOutputPresetId;
          if (!this.title.trim()) this.title = getResearchOutputPreset(this.presetId).label;
        });
      });
    new Setting(root)
      .setName("作品标题")
      .addText((text) => text.setValue(this.title).onChange((value) => {
        this.title = value;
      }));
    new Setting(root)
      .setName("补充要求")
      .setDesc("可指定长度、语气、读者或希望保留的段落。")
      .addTextArea((text) => {
        text.setValue(this.instruction);
        text.inputEl.rows = 4;
        text.onChange((value) => {
          this.instruction = value;
        });
      });
    const button = root.createEl("button", {
      cls: "mod-cta",
      text: this.busy ? "正在生成…" : "生成并另存",
    });
    button.disabled = this.busy || !this.title.trim();
    button.addEventListener("click", () => void this.generate());
  }

  private async generate(): Promise<void> {
    if (this.busy || !this.title.trim()) return;
    this.busy = true;
    this.render();
    try {
      await this.onGenerate(this.presetId, this.title.trim(), this.instruction.trim());
      this.close();
    } catch (error) {
      new Notice(`渠道稿生成失败：${error instanceof Error ? error.message : String(error)}`, 8000);
      this.busy = false;
      this.render();
    }
  }
}

export class CreationConfirmModal extends Modal {
  constructor(
    plugin: KnowGrovePlugin,
    private readonly title: string,
    private readonly message: string,
    private readonly confirmLabel: string,
    private readonly onConfirm: () => Promise<void>,
  ) {
    super(plugin.app);
  }

  onOpen(): void {
    const root = this.contentEl;
    root.createEl("h2", { text: this.title });
    root.createEl("p", { text: this.message });
    const actions = root.createDiv("knowgrove-rewrite-actions");
    actions.createEl("button", { text: "取消" }).addEventListener("click", () => this.close());
    const confirm = actions.createEl("button", { cls: "mod-warning", text: this.confirmLabel });
    confirm.addEventListener("click", () => {
      confirm.disabled = true;
      void this.onConfirm()
        .then(() => this.close())
        .catch((error) => {
          confirm.disabled = false;
          new Notice(`操作失败：${error instanceof Error ? error.message : String(error)}`, 8000);
        });
    });
  }
}

export class CreationVersionPreviewModal extends Modal {
  constructor(
    plugin: KnowGrovePlugin,
    private readonly label: string,
    private readonly current: string,
    private readonly historical: string,
    private readonly onRestore: () => void,
  ) {
    super(plugin.app);
  }

  onOpen(): void {
    this.modalEl.addClass("knowgrove-modal", "knowgrove-version-preview-modal");
    const root = this.contentEl;
    root.createEl("h2", { text: `对比 ${this.label}` });
    root.createEl("p", {
      cls: "setting-item-description",
      text: `当前 ${this.current.length.toLocaleString()} 字符；历史版本 ${this.historical.length.toLocaleString()} 字符。这里只预览，不会自动修改正文。`,
    });
    const columns = root.createDiv("knowgrove-version-preview-columns");
    const current = columns.createDiv();
    current.createEl("h3", { text: "当前内容" });
    const currentText = current.createEl("textarea");
    currentText.value = this.current;
    currentText.rows = 22;
    currentText.readOnly = true;
    const historical = columns.createDiv();
    historical.createEl("h3", { text: this.label });
    const historicalText = historical.createEl("textarea");
    historicalText.value = this.historical;
    historicalText.rows = 22;
    historicalText.readOnly = true;
    const actions = root.createDiv("knowgrove-rewrite-actions");
    actions.createEl("button", { text: "关闭" }).addEventListener("click", () => this.close());
    actions.createEl("button", { cls: "mod-warning", text: "恢复这个版本" }).addEventListener("click", () => {
      this.close();
      this.onRestore();
    });
  }
}
