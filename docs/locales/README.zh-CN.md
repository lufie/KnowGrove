# 言续

[返回 English README](https://github.com/lufie/KnowGrove/blob/main/README.md) · **简体中文** · [繁體中文](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.zh-TW.md) · [日本語](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.ja.md) · [한국어](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.ko.md) · [Deutsch](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.de.md) · [Français](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.fr.md) · [Español](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.es.md) · [Português (Brasil)](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.pt-BR.md) · [Русский](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.ru.md)

言续是一个本地优先的 Obsidian 知识工作台，用来把零散资料转化为相互连接的主题、证据、研究和可复用知识。

当前源码候选版本：`2.8.24`

## 主要能力

- **稍后阅读**：统一收集箱、未读/已读筛选，以及读到文末自动标记。
- **浏览器与手机剪藏**：收集网页、视频、链接和轻量语音笔记。
- **自动整理**：保留文章正文图片；视频优先使用字幕，没有字幕时再执行本地语音转录。
- **属性治理**：检查属性、预览建议并批量执行已确认的修改，不覆盖未知字段。
- **主题与研究**：浏览全部主题、聚合相关资料，并组织领域、主题和研究课题。
- **评论与块引用**：评论选中文字，通过 Obsidian 原生块引用复用完整内容区块。
- **证据创作**：基于选定资料生成大纲、报告、长文和渠道版本。
- **安全附件清理**：只跟踪曾经被引用的附件，失去最后引用时先询问，再移入 Obsidian 回收站。

## 语言与数据

插件自动跟随 Obsidian 的界面语言。切换语言不会翻译或修改用户的笔记标题、路径、评论、领域、主题、属性值、frontmatter、Base 或 Markdown 正文。

## 安装

KnowGrove 已进入 Obsidian 社区插件目录，可在 **设置 → 第三方插件 → 浏览** 中搜索并安装。当前条目尚未由 Obsidian 员工完成人工审核。

手动安装：

1. 从最新 GitHub Release 下载 `main.js`、`manifest.json` 和 `styles.css`。
2. 放入 `<仓库>/.obsidian/plugins/knowgrove/`。
3. 重新加载 Obsidian，并在第三方插件中启用 KnowGrove。

不要复制其他用户的 `data.json`。

## 首次使用

1. 在插件设置中确认“收集箱路径”。
2. 需要 AI 整理时选择本地 CLI 或兼容 API。
3. 使用“自动整理组件配置 → 自动配置”准备文章、视频和语音处理环境。
4. 从 Obsidian 左侧栏打开“阅读列表”“主题”或“工作台”。

## 隐私与安全

- Vault 始终是用户数据的最终来源。
- 已有属性和未知字段默认保留。
- 批量修改必须先预览、再确认。
- 插件不包含客户端遥测或使用分析。
- API Key 优先使用 Obsidian SecretStorage。
- 不绕过付费墙、登录限制、DRM 或平台权限。

完整说明见 [隐私政策](../../PRIVACY.md) 和 [安全说明](../../SECURITY.md)。

## 开发

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
```

## 许可证

[MIT](../../LICENSE)
