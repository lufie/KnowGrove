import { App, Modal, Setting } from "obsidian";

export class BrowserPairingModal extends Modal {
  constructor(
    app: App,
    private readonly approve: () => boolean,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText("连接浏览器与 KnowGrove");
    this.contentEl.createEl("p", {
      text: "浏览器扩展正在请求连接当前 Vault。允许后，它只能把你主动提交的网页交给本机 KnowGrove 处理。",
    });
    new Setting(this.contentEl)
      .addButton((button) => button
        .setButtonText("取消")
        .onClick(() => this.close()))
      .addButton((button) => button
        .setCta()
        .setButtonText("允许连接")
        .onClick(() => {
          this.approve();
          this.close();
        }));
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
