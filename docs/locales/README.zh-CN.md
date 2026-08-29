# 言续

[返回 English README](https://github.com/lufie/KnowGrove/blob/main/README.md) · **简体中文** · [繁體中文](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.zh-TW.md) · [日本語](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.ja.md) · [한국어](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.ko.md) · [Deutsch](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.de.md) · [Français](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.fr.md) · [Español](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.es.md) · [Português (Brasil)](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.pt-BR.md) · [Русский](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.ru.md)

言续是一套本地优先的 Obsidian 知识工作流，面向“收集速度快于整理速度”的用户。它保留原始资料，提取有用结构，把内容连接到主题与证据，再沉淀成可复用的成果。

当前源码版本：`2.8.30`

## 从资料到成果的一条工作流

| 收集 | 处理 | 组织 | 创作 |
| --- | --- | --- | --- |
| 保存文章、链接、本地音视频、录音与图片。 | 提取网页正文，把图片转成结构化 Markdown，转录音频与视频。 | 稍后阅读，管理属性，连接主题、评论、块引用与证据。 | 基于选定资料生成大纲、报告、长文和渠道版本。 |

Vault 始终是唯一事实源。言续不收集客户端遥测；只有你选择的本地工具或兼容模型服务才会处理相应内容。

## 主要能力

- **稍后阅读**：统一收集箱、未读/已读筛选，以及读到文末自动标记。
- **浏览器与手机剪藏**：收集网页、视频、链接和轻量语音笔记。
- **自动整理**：保留文章正文图片；视频优先使用字幕，没有字幕时再执行本地语音转录。
- **AI 图片转文字**：支持单张或整篇图片转换，把表格和结构化文字写在原图下方；后台展示真实阶段，可取消并定位处理结果。
- **类 Word 实时编辑**：标题、列表、任务、图片、代码块和表格保持排版编辑；删除选区空行时会保留并修复 GFM 表格边界，确保实时预览和阅读视图继续渲染。
- **快速且可恢复的剪藏**：浏览器任务进入耗时队列前先创建并回读可打开的最小 Markdown，后续 AI 或媒体处理在后台继续。
- **超长文档导航**：标题索引首尾始终可达，文件定位按钮保持可见，同时不接管正文滚动。
- **属性治理**：检查属性、预览建议并批量执行已确认的修改，不覆盖未知字段。
- **主题与研究**：浏览全部主题、聚合相关资料，并组织领域、主题和研究课题。
- **评论与块引用**：评论选中文字，通过 Obsidian 原生块引用复用完整内容区块。
- **证据创作**：基于选定资料生成大纲、报告、长文和渠道版本。
- **安全附件清理**：只跟踪曾经被引用的附件，失去最后引用时先询问，再移入 Obsidian 回收站。

## 语言与数据

插件自动跟随 Obsidian 的界面语言。切换语言不会翻译或修改用户的笔记标题、路径、评论、领域、主题、属性值、frontmatter、Base 或 Markdown 正文。

## 安装

KnowGrove 已进入 Obsidian 社区插件目录，可在 **设置 → 第三方插件 → 浏览** 中搜索并安装。

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
