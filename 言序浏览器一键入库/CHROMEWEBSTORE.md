# Chrome Web Store Listing — 言序 · KnowGrove 剪藏

> Last Updated: 2026-08-15

## 0.3.10

- 首次配对增加弹窗直连兜底；后台 Service Worker 不可用时仍可打开 Obsidian 完成确认。
- 待确认配对写入扩展本地状态，关闭或重新打开弹窗后可继续完成，不再暴露 Chrome 接收端错误。

## Store Listing

**Extension Name**

言序 · KnowGrove 剪藏

**Short Description**

把当前文章或视频交给本机 KnowGrove 整理，并保存到 Obsidian。

**Detailed Description**

言序（KnowGrove）是 KnowGrove 的浏览器入口。打开一篇文章或视频，点击扩展即可创建入库任务。

KnowGrove 会先把来源链接写入当前 Obsidian Vault。文章优先使用用户点击时浏览器已经显示的正文；Bilibili 优先读取当前登录页的官方字幕，其他视频动态查找公开字幕，没有字幕才转录音频。对于需要登录态的媒体，用户可在完成当前站点登录或验证后，单次授权当前标签页再重试。AI 会把字幕切片整理为自然段，再生成摘要、核心要点和整理正文。弹窗和工具栏角标会显示后台进度。

首次使用需要安装 KnowGrove Obsidian 插件，并在 Obsidian 中确认一次浏览器连接。扩展不要求终端命令，不保存模型 API Key，也不连接言序云端服务器。

扩展不读取表单值或密码，也不绕过登录墙、验证码、付费内容或 DRM。只有用户点击“使用当前站点登录状态并整理”时，扩展才请求当前站点的可选权限，并把当前 URL 可用的 Cookie 临时交给同一台电脑的 KnowGrove；Cookie 不持久化，单次任务结束后立即删除。Obsidian 关闭时不能接收新任务。

**Category**

Productivity

**Single Purpose**

把用户主动提交的当前网页交给本机 KnowGrove，并保存到 Obsidian。

**Primary Language**

Chinese (Simplified)

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
| --- | --- | --- | --- |
| Store Icon | 128×128 PNG | Not created | |
| Screenshot 1 | 1280×800 | Not created | |
| Screenshot 2 | 1280×800 | Not created | |
| Small Promo Tile | 440×280 | Not created | |

建议截图：

1. 当前文章识别和“一键整理到 Obsidian”。
2. 任务进度与完成结果。
3. Obsidian 中的 KnowGrove 浏览器设置。

## Permissions Justification

| Permission | Type | Justification |
| --- | --- | --- |
| `tabs` | permissions | 用户打开扩展或使用右键菜单时，读取当前页面 URL 和标题以创建入库任务。 |
| `activeTab` | permissions | 只在用户点击扩展图标或“整理当前页面”菜单时，临时访问当前标签页，不持续读取其他页面。 |
| `scripting` | permissions | 从用户主动提交的当前标签页读取已经渲染的可见正文，以处理需要登录但用户已能看到的页面。 |
| `storage` | permissions | 在浏览器本地保存配对令牌、自动执行偏好和最近任务状态。 |
| `contextMenus` | permissions | 提供“整理当前页面”和“整理此链接到 Obsidian”。 |
| `alarms` | permissions | 弹窗关闭后定期读取本机任务状态并更新工具栏角标。 |
| `http://127.0.0.1:47831/*` | host_permissions | 只连接同一台电脑上运行的 KnowGrove，不访问局域网或言序服务器。 |
| `cookies` | optional_permissions | 仅在用户主动重试受保护媒体时动态请求，用于读取当前标签页 URL 可用的站点会话；不是安装时权限。 |
| `http://*/*`, `https://*/*` | optional_host_permissions | 只在用户手势中请求当前标签页的精确 origin，用于当前站点 Cookie；不会静默获得所有站点访问权。 |

## Privacy & Data Use

**Does the extension collect user data?**

发布方不收集用户数据。扩展在本地处理当前页面 URL、标题、可见正文、配对信息和任务状态，再把用户主动提交的数据发送到同一台电脑上的 KnowGrove。

| Data Type | Processed | Transmitted Off-Device by Extension | Purpose | Shared by Publisher |
| --- | --- | --- | --- | --- |
| Web history / current URL | Yes | No | 创建用户主动发起的入库任务 | No |
| Website title/content reference | Yes | No | 识别和处理当前内容 | No |
| Website visible content | Yes, only after user action | No | 处理当前已经渲染的文章或登录态页面 | No |
| Authentication info | Local pairing token only | No | 认证本机 KnowGrove | No |
| Current-site session Cookie | Optional, only after explicit user permission | No | 让本机下载器读取用户当前已获授权的媒体；任务结束后删除 | No |

- [x] Data is NOT sold to third parties
- [x] Data is NOT used for unrelated purposes
- [x] Data is NOT used for creditworthiness or lending

用户在 KnowGrove 中自行配置的远程 AI Provider 不属于扩展的发布方服务，可能按其自身条款处理材料。

## Privacy Policy

源文件：[产品设计材料/隐私政策.md](产品设计材料/隐私政策.md)

公开 URL：发布前填写并验证。

## Distribution

**Visibility**: Unlisted for first review

**Regions**: All regions where dependencies are available
**Pricing**: Free

## Developer Info

**Publisher Name**: Liyijie

**Contact Email**: 发布前填写

**Support URL**: https://github.com/lufie/KnowGrove/issues
**Homepage URL**: https://github.com/lufie/KnowGrove

## Version History

| Version | Date | Changes | Status |
| --- | --- | --- | --- |
| 0.3.9 | 2026-08-15 | 修复工具栏入口变灰且无响应：启动和升级时主动恢复 action、popup 与标题；补齐言序品牌图标；当前站点登录态权限在用户点击后的第一个异步步骤请求，避免 Chrome 丢失用户手势 | Local candidate |
| 0.3.8 | 2026-08-15 | 受保护媒体新增当前站点单次权限、临时 Cookie、播放器和页面状态媒体地址兜底；不持久化会话数据 | Local candidate |
| 0.3.7 | 2026-08-15 | “在 Obsidian 打开”改由本机 KnowGrove 直接校验并打开真实 TFile；旧完成记录的文件不存在时显示失败，同一剪藏占位笔记不再触发第二条自动任务，网页标题优先读取 Open Graph 标题 | Local candidate |
| 0.3.6 | 2026-08-15 | CLI 或模型配置在任务中切换时由 KnowGrove 接力继续处理；完成页只接受经过 Obsidian 文件回读验证的结果，异常完成显示失败并允许重新处理 | Local candidate |
| 0.3.5 | 2026-08-15 | 处理进度增加“取消并清理”，可停止本地模型任务、清理本次创建的笔记与附件并立即重新提交；活动任务按来源链接去重 | Local candidate |
| 0.3.4 | 2026-07-30 | 支持短链最终地址识别、陌生站点媒体检测、豆包等动态 AI 对话页可见内容提取，以及文章、视频和音频统一整理 | Draft |
| 0.3.3 | 2026-07-29 | 中文品牌统一为“言序”、英文品牌统一为“KnowGrove”，主题色同步言序 App 的暖朱红 `#F24B3F` | Draft |
| 0.3.2 | 2026-07-29 | Bilibili 当前登录页字幕优先、动态字幕语言与自然段整理 | Draft |
| 0.3.1 | 2026-07-27 | 优先提取当前标签页可见正文，修复登录态页面和失败状态回写 | Draft |
| 0.3.0 | 2026-07-26 | 直接连接 KnowGrove，移除独立本地助手和手动 Token 配置 | Draft |

## Pre-publish Blockers

- 创建 128×128 PNG 图标和至少一张商店截图。
- 发布隐私政策并填写可公开访问的 URL。
- 填写并验证支持邮箱。
- 用 Chrome Web Store 账号上传并实测 `KnowGrove-Capture-0.3.9.zip` 的工具栏入口、当前站点单次授权、取消、CLI 切换接力、真实文件打开与重新处理流程。
