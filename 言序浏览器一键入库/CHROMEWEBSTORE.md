# Chrome Web Store Listing — 言序 · KnowGrove 剪藏

> Last Updated: 2026-07-29

## Store Listing

**Extension Name**

言序 · KnowGrove 剪藏

**Short Description**

把当前文章或视频交给本机 KnowGrove 整理，并保存到 Obsidian。

**Detailed Description**

言序（KnowGrove）是 KnowGrove 的浏览器入口。打开一篇文章或视频，点击扩展即可创建入库任务。

KnowGrove 会先把来源链接写入当前 Obsidian Vault。文章优先使用用户点击时浏览器已经显示的正文；Bilibili 优先读取当前登录页的官方字幕，其他视频动态查找公开字幕，没有字幕才转录音频。AI 会把字幕切片整理为自然段，再生成摘要、核心要点和整理正文。弹窗和工具栏角标会显示后台进度。

首次使用需要安装 KnowGrove Obsidian 插件，并在 Obsidian 中确认一次浏览器连接。扩展不要求终端命令，不保存模型 API Key，也不连接言序云端服务器。

扩展不读取 Cookie、表单值或密码，不绕过登录墙、付费内容或 DRM。Obsidian 关闭时不能接收新任务。

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

## Privacy & Data Use

**Does the extension collect user data?**

发布方不收集用户数据。扩展在本地处理当前页面 URL、标题、可见正文、配对信息和任务状态，再把用户主动提交的数据发送到同一台电脑上的 KnowGrove。

| Data Type | Processed | Transmitted Off-Device by Extension | Purpose | Shared by Publisher |
| --- | --- | --- | --- | --- |
| Web history / current URL | Yes | No | 创建用户主动发起的入库任务 | No |
| Website title/content reference | Yes | No | 识别和处理当前内容 | No |
| Website visible content | Yes, only after user action | No | 处理当前已经渲染的文章或登录态页面 | No |
| Authentication info | Local pairing token only | No | 认证本机 KnowGrove | No |

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
| 0.3.3 | 2026-07-29 | 中文品牌统一为“言序”、英文品牌统一为“KnowGrove”，主题色同步言序 App 的暖朱红 `#F24B3F` | Draft |
| 0.3.2 | 2026-07-29 | Bilibili 当前登录页字幕优先、动态字幕语言与自然段整理 | Draft |
| 0.3.1 | 2026-07-27 | 优先提取当前标签页可见正文，修复登录态页面和失败状态回写 | Draft |
| 0.3.0 | 2026-07-26 | 直接连接 KnowGrove，移除独立本地助手和手动 Token 配置 | Draft |

## Pre-publish Blockers

- 创建 128×128 PNG 图标和至少一张商店截图。
- 发布隐私政策并填写可公开访问的 URL。
- 填写并验证支持邮箱。
- 用 Chrome Web Store 账号上传 `KnowGrove-Capture-0.3.3.zip`。
