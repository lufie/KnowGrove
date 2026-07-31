# 言序 · KnowGrove

言序（KnowGrove）是一个本地优先的 Obsidian 知识工作台，负责资料入库、阅读、属性治理、研究组织、引用和内容创作。

当前版本：`2.5.7`（阅读列表窄侧栏布局修复候选）

## 主要能力

- 浏览器一键入库：Chrome 或 Safari 扩展把当前文章、视频直接交给 KnowGrove。
- 一键运行环境：自动检查当前电脑，优先复用已有工具；缺失组件时安装经过签名校验的 KnowGrove 托管运行包。
- 链接笔记自动解析：监控指定文件夹，并在 Obsidian 启动时补查最近文档，把只有链接和标题的轻量笔记自动分流为网页、视频或语音。
- 阅读列表：跟踪阅读状态，可在文末自动标记已读。
- 属性工作流：检查、预览并修复 Markdown 属性。
- AI 引擎：支持 Codex、Claude、Antigravity、Qoder、Kimi、MiniMax、GLM、CodeBuddy，以及 Anthropic/OpenAI 兼容接口。
- 知识研究：用领域、主题、课题和工作空间组织资料与证据。
- 评论与引用：为选区创建稳定块引用和双向关系。
- 创作工作室：从已确认资料生成提纲、初稿、渠道版本和证据审查。

## 浏览器一键入库

浏览器扩展只负责提交当前页面并展示进度，所有本地处理都在 KnowGrove 内完成：

```text
Chrome / Safari
  → KnowGrove 本机接收服务
  → 文章提取或视频 / 语音字幕与 Whisper
  → 用户选择的 AI 引擎
  → Obsidian Vault
```

不再需要独立本地助手、终端启动命令、LaunchAgent、手动端口配置或 Token 复制。首次使用只需在 Obsidian 中确认一次浏览器配对。

浏览器产品文件位于 [言序浏览器一键入库](言序浏览器一键入库/README.md)。

## 链接笔记自动解析

在设置的监控文件夹中新建一篇 Markdown，内容只有一个 `http/https` 链接、标题和少量说明时，KnowGrove 会自动执行：

- 网页文章：使用 Defuddle 与内置解析器提取正文，清理平台噪音，把正文图片下载到 Vault；可在设置中选择是否以 `YYYY-MM-DD-文章名` 统一文件名、标题属性和正文一级标题。
- 视频：优先读取字幕，没有字幕时用 `yt-dlp` 下载公开音频并交给本机 Whisper。
- 语音：保存原始音频到 Vault，使用本机 Whisper 转录，再由 AI 生成摘要、要点和整理正文。

每次打开 Obsidian 时，KnowGrove 会按修改时间补查最近的文档；也可以点击左侧栏的“整理”图标，手动触发同一批量检查。命令面板仍提供“整理新链接文档”和“解析当前链接笔记”，Markdown 文件菜单也保留“KnowGrove：解析链接内容”。自动检测文件夹、三类笔记的完成后保存目录和原始媒体目录都可在插件设置中配置。完整正文、多链接笔记、已处理笔记不会被自动改写；处理期间如果用户修改正文，AI 结果也不会覆盖新内容。属性系统同时更新 frontmatter 时会保留属性并继续整理，不会误判为正文冲突。

## 一键运行环境

设置页会检查当前系统、磁盘空间、下载源、视频组件、语音转录和 AI 引擎。用户点击“一键完成配置”后：

1. 优先复用兼容的 `yt-dlp`、FFmpeg 和 Whisper。
2. 缺失时从签名运行包清单选择 `darwin-arm64`、`darwin-x64` 或 `win32-x64` 组件。
3. 每个文件独立校验 SHA-256，清单使用 Ed25519 验签。
4. 在临时目录安装成功后原子切换；失败不会破坏上一版本。
5. 托管 Skill Pack 只能更新提示词和结构化规则，不能下发脚本或任意命令。

运行环境保存在系统用户数据目录，不进入 Vault，也不会由 iCloud 同步：

- macOS：`~/Library/Application Support/KnowGrove/runtime`
- Windows：`%LOCALAPPDATA%\KnowGrove\runtime`

跨平台构建与发布说明见 [runtime/README.md](runtime/README.md)。

公开运行包发布仓库：[lufie/KnowGrove-runtime](https://github.com/lufie/KnowGrove-runtime)。
插件只接受通过 Ed25519 签名、且组件大小与 SHA-256 均匹配的运行包清单。

## 开发

```bash
pnpm install
pnpm test
pnpm run build
```

生产构建会生成根目录 `main.js`。浏览器扩展另行检查：

```bash
cd "言序浏览器一键入库"
npm run check
```

## 安全边界

- 本机接收服务只监听 `127.0.0.1:47831`。
- 浏览器必须经过 Obsidian 弹窗确认才能配对。
- CLI 使用 `shell: false` 和独立临时目录运行。
- API Key 使用 Obsidian SecretStorage，不写入插件数据文件。
- 默认不读取浏览器 Cookie，不绕过登录墙、付费限制或 DRM。
- Obsidian 关闭后不会接收新任务。

## 许可证

MIT
