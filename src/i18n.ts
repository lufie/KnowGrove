export type KnowGroveLocale =
  | "zh-CN"
  | "zh-TW"
  | "en"
  | "ja"
  | "ko"
  | "de"
  | "fr"
  | "es"
  | "pt-BR"
  | "ru";

export const SUPPORTED_LOCALES: readonly KnowGroveLocale[] = [
  "zh-CN",
  "zh-TW",
  "en",
  "ja",
  "ko",
  "de",
  "fr",
  "es",
  "pt-BR",
  "ru",
] as const;

const ENGLISH: Record<string, string> = {
  "言续": "KnowGrove",
  "言续设置": "KnowGrove settings",
  "按功能完成一次配置，之后让收集、属性整理与知识创作在 Vault 内自动流转。": "Set up each area once, then let capture, property management, and knowledge creation flow through your vault.",
  "大模型配置": "AI model",
  "选择本地 CLI 或 API、模型与连接方式，供属性整理、内容解析和知识创作统一使用。": "Choose a local CLI or API, model, and connection for property management, content processing, and creation.",
  "Read It Later": "Read it later",
  "配置浏览器扩展、手机收集内容，以及文章、视频、语音的自动整理和阅读状态。": "Configure browser and mobile capture, automatic processing for articles, video, and audio, and reading status.",
  "属性管理": "Property management",
  "让 AI 建议分类树、补齐语义属性，并统一检查知识库中的属性规范。": "Let AI suggest a taxonomy, complete semantic properties, and audit property consistency across your vault.",
  "知识工作台": "Knowledge workspace",
  "配置知识创作、渠道稿件和配图。": "Configure knowledge creation, channel-specific drafts, and illustrations.",
  "增强功能": "Enhancements",
  "配置可选的笔记整理与效率增强能力。": "Configure optional organization and productivity features.",
  "收集箱路径": "Inbox folder",
  "唯一需要确认的路径。阅读列表、浏览器剪藏、手机端剪藏和自动解析统一使用这个文件夹。": "The only required folder. Reading list, browser capture, mobile capture, and automatic processing all use it.",
  "浏览器授权": "Browser authorization",
  "仅在更换电脑或需要断开已配对的浏览器扩展时使用。": "Use this only when switching computers or disconnecting a paired browser extension.",
  "撤销授权": "Revoke authorization",
  "自动整理新内容": "Automatically process new content",
  "新文档自动进入未读列表；对于只有链接或语音的轻量笔记，会自动提取、转录并由 AI 整理。": "New notes enter the unread list automatically. Link-only and audio notes are extracted, transcribed, and organized by AI.",
  "Mac 批量链接目录": "Mac batch-link folder",
  "每个链接保存为一篇独立笔记。留空时沿用收集箱路径。": "Save each link as a separate note. Leave blank to use the inbox folder.",
  "Mac 录音目录": "Mac recording folder",
  "录音、整理笔记和安全恢复片段保存在这里。留空时使用“收集箱路径/录音”。": "Store recordings, processed notes, and recovery segments here. Leave blank to use Inbox/Recordings.",
  "默认用 Obsidian 打开 Markdown": "Open Markdown in Obsidian by default",
  "默认开启。开启后由 KnowGrove Mac 打开器接管 .md 和 .markdown；库外文件会先导入下方 Vault 路径，再在 Obsidian 打开。首次启用仍需在 Finder 确认“全部更改”。": "On by default. The KnowGrove Mac opener handles .md and .markdown, imports external files into the vault folder below, and opens them in Obsidian. The first setup still requires confirming Change All in Finder.",
  "导入成功后移除库外原文件": "Remove the external source after import",
  "默认开启。只有 Vault 内副本完整写入并校验成功后，才把库外原文件移到 macOS 废纸篓，可从废纸篓恢复；关闭则保留原文件。Vault 内文件永远不会因此删除。": "On by default. Only after the vault copy is fully written and verified is the external source moved to the macOS Trash, where it can be restored. Turn this off to keep the source. Files already in the vault are never removed by this setting.",
  "Markdown 默认导入路径": "Default Markdown import folder",
  "双击库外 Markdown 时先导入这个 Vault 相对路径，再在 Obsidian 中打开。留空时默认使用收集箱路径；不会覆盖同名笔记。": "Import external Markdown into this vault-relative folder before opening it in Obsidian. Leave blank to use the inbox. Existing notes with the same name are never overwritten.",
  "Mac Markdown 打开器状态": "Mac Markdown opener status",
  "正在检查系统默认应用与 KnowGrove 打开器状态。": "Checking the system default app and KnowGrove opener status.",
  "在访达中恢复": "Restore in Finder",
  "双击导入 Markdown 当前仅支持 macOS；其他平台不会修改默认打开方式。": "Double-click Markdown import currently supports macOS only. Other platforms do not change file associations.",
  "当前平台不可用": "Unavailable on this platform",
  "功能已关闭，打开器也不会导入文件；macOS 仍把它列为默认应用，请点击右侧按钮并在 Finder 完成恢复。": "The feature is off and the opener will not import files, but macOS still lists it as the default app. Use the button on the right and complete restoration in Finder.",
  "功能已关闭，KnowGrove 不会接管或导入双击的 Markdown。已有打开器保留，可随时重新开启。": "The feature is off. KnowGrove will not handle or import double-clicked Markdown. The installed opener remains available for later use.",
  "功能已关闭": "Feature off",
  "已启用并设为默认：库外 Markdown 导入并校验成功后，原文件会移到废纸篓；重名文件安全编号，Vault 内文件直接打开。": "Enabled and set as default. After an external Markdown file is imported and verified, its source moves to Trash. Name conflicts receive a safe suffix, and vault files open directly.",
  "已启用并设为默认：库外 Markdown 会复制到上方路径并保留原文件；重名文件安全编号，Vault 内文件直接打开。": "Enabled and set as default. External Markdown is copied to the folder above while the source is kept. Name conflicts receive a safe suffix, and vault files open directly.",
  "重新配置": "Reconfigure",
  "打开器已安装，但当前不是默认 Markdown 应用。点击后会在访达中选中引导文件；打开文件简介，在“打开方式”选择 KnowGrove 打开器，再点“全部更改”。": "The Mac opener is installed but is not the default Markdown app. Click to select the setup file in Finder, open Get Info, choose KnowGrove Markdown Opener under Open with, and select Change All.",
  "在访达中设置": "Set up in Finder",
  "安装打开器": "Install opener",
  "重试安装": "Retry installation",
  "安装中…": "Installing…",
  "已设为默认。现在双击 Markdown 会导入当前 Vault 并用 Obsidian 打开。": "Set as default. Double-clicking Markdown now imports it into the current vault and opens it in Obsidian.",
  "打开器已安装。请在已打开的 Finder 中按 Command-I，选择 KnowGrove Markdown Opener，再点“全部更改”。": "The opener is installed. In the Finder window that opened, press Command-I, choose KnowGrove Markdown Opener, and select Change All.",
  "已恢复原来的默认 Markdown 应用。KnowGrove 打开器仍保留，可随时重新启用。": "Restored the previous default Markdown app. The KnowGrove opener remains installed and can be enabled again at any time.",
  "该默认打开能力当前仅支持 macOS；设置已保存，但不会修改系统文件关联。": "Default Markdown handling currently supports macOS only. The setting was saved, but system file associations were not changed.",
  "已开启。现在双击 Markdown 会导入当前 Vault 并用 Obsidian 打开。": "Enabled. Double-clicking Markdown now imports it into the current vault and opens it in Obsidian.",
  "功能已开启，打开器也已安装。请在 Finder 中完成“打开方式 → 全部更改”。": "The feature and opener are enabled. Complete Open with → Change All in Finder.",
  "功能已关闭。请在 Finder 中选择原应用并点击“全部更改”以完成系统恢复。": "The feature is off. Choose the previous app in Finder and select Change All to finish restoring the system association.",
  "功能已关闭，并已恢复原来的默认 Markdown 应用。": "The feature is off and the previous default Markdown app has been restored.",
  "功能已关闭；KnowGrove 打开器不会再导入 Markdown。": "The feature is off. The KnowGrove opener will no longer import Markdown.",
  "已开启：后续导入校验成功后，库外原文件会移到废纸篓。": "Enabled. After future imports are verified, external source files will move to Trash.",
  "已关闭：后续导入会保留库外原文件。": "Disabled. Future imports will keep the external source file.",
  "读到文末自动标记已读": "Mark as read at the end",
  "在文末停留后自动完成；编辑文字时会暂停，避免误判。": "Mark a note as read after you remain at the end. Pauses while editing to avoid false positives.",
  "文章标题添加日期": "Add date to article titles",
  "默认生成“YYYY-MM-DD-文章名”，方便按文件名排序；不会批量修改已有笔记。": "Creates “YYYY-MM-DD-Article title” by default for filename sorting. Existing notes are not renamed in bulk.",
  "阅读习惯设置": "Reading preferences",
  "阅读状态属性": "Reading status property",
  "只有已有知识库使用不同字段时才需要修改。": "Change this only if your existing vault uses a different property.",
  "未读 / 已读状态值": "Unread / read values",
  "默认使用“在看”和“已读完”。": "The defaults are “Reading” and “Read”.",
  "文末停留时间": "End-of-note delay",
  "默认 3 秒，用于避免快速滑过时误标已读。": "Defaults to 3 seconds to avoid marking a note as read while scrolling past.",
  "主题列表": "Topic list",
  "默认开启。在左侧显示全部主题；关闭只隐藏入口，不会修改或删除笔记中的主题属性。": "On by default. Shows all topics in the left sidebar. Turning it off only hides the entry and never changes topic properties.",
  "文档浮动层级定位锚点": "Floating document outline anchors",
  "默认开启。在文档阅读区左侧边缘显示极简浮动锚点轨。仅在文档包含标题层级时展示，鼠标悬停可预览标题，点击可快速跳转定位，滚动时实时跟随阅读位置。": "On by default. Displays a minimal floating outline rail along the left edge of the document reading area. Visible only when the document has headings; hover to preview heading, click to jump, and syncs automatically with current scroll position.",
  "在文件列表中定位此文档": "Reveal this note in file explorer",
  "附件冗余检测": "Orphaned attachment check",
  "只跟踪曾被笔记使用过的附件；失去最后一处引用时提醒。每天复查一次历史失联附件，不会扫描或删除从未引用的文件。": "Tracks only attachments previously used by notes and alerts when the last reference is removed. Never treats never-referenced files as cleanup candidates.",
  "日常只检查刚刚创建、编辑、移动或删除的笔记；附件失去最后一处引用时提醒。启动时不扫描全库，从未引用的文件不会进入删除候选。": "Checks only notes you just created, edited, moved, or deleted. Alerts when an attachment loses its last reference. Never scans the full vault at startup or treats never-referenced files as cleanup candidates.",
  "正文移除最后一处附件引用时提醒；删除整篇笔记沿用 Obsidian 自己的一次确认，不再重复弹窗。启动时不扫描全库，从未引用的文件不会进入删除候选。": "Alerts when the last attachment reference is removed while editing. Deleting an entire note uses Obsidian's single confirmation without another popup. Never scans the full vault at startup or treats never-referenced files as cleanup candidates.",
  "立即检查": "Check now",
  "全面检查": "Full check",
  "检查附件": "Check attachments",
  "全库检查": "Full-vault check",
  "检查中": "Checking…",
  "附件随笔记移动": "Move attachments with notes",
  "关闭时不改变附件位置。开启后，移动笔记时只移动由该笔记独占、且位于原笔记目录内的附件；目标位置沿用 Obsidian 全局附件设置。": "When enabled, moving a note also moves attachments used only by that note and stored under its original folder. The destination follows Obsidian's global attachment setting.",
  "自动整理附件": "Automatically organize attachments",
  "关闭时仍可从命令面板或笔记菜单手动预览整理。开启后，编辑笔记时自动把独占附件整理到 Obsidian 全局附件位置。": "When off, organization remains available as a manual preview. When on, editing a note organizes its exclusively used attachments into Obsidian's global attachment location.",
  "共享附件处理": "Shared attachment handling",
  "同一附件被多篇笔记引用时，默认跳过；选择复制后，为正在整理的笔记创建独立副本，并只修改该笔记的引用。": "Shared attachments are skipped by default. Copy mode creates a separate copy for the note being organized and updates only that note's reference.",
  "跳过（推荐）": "Skip (recommended)",
  "复制独立副本": "Create a separate copy",
  "附件与链接排除目录": "Excluded attachment and link folders",
  "清理、整理和一致性检查都会跳过这些 Vault 相对目录；属性管理中的排除目录也会继续生效。": "Cleanup, organization, and consistency checks skip these vault-relative folders. Property-management exclusions also remain in effect.",
  "例如：archive/长期保留": "Example: archive/Keep",
  "额外附件格式": "Additional attachment types",
  "通常无需修改。仅添加默认未覆盖的附件扩展名；Markdown、Canvas 和 Base 不会被当作附件。": "Usually no changes are needed. Add only attachment extensions not covered by default. Markdown, Canvas, and Bases are never treated as attachments.",
  "例如：zip, psd": "Example: zip, psd",
  "最近文件依据": "Recent files based on",
  "控制文件列表顶部“最近”展示哪些文档。": "Choose which notes appear in Recent at the top of the file explorer.",
  "最近操作": "Recently opened",
  "最近编辑": "Recently edited",
  "最近新建": "Recently created",
  "最近文件数量": "Number of recent files",
  "默认显示 8 篇，可设置为 3–20 篇。": "Shows 8 notes by default. Choose between 3 and 20.",
  "删除多余空行": "Remove extra blank lines",
  "段落间保留一个空行，删除多余空行。": "Keep one blank line between paragraphs and remove extras.",
  "删除选中内容的空行": "Remove blank lines from selection",
  "选中内容中没有可删除的空行": "There are no removable blank lines in the selection.",
  "已删除选中内容的空行": "Removed blank lines from the selection.",
  "AI 图片转文字": "AI image to text",
  "图片转文字": "Image to text",
  "图片转文字后台任务": "Background image-to-text tasks",
  "转换本文全部图片": "Convert all images in this note",
  "一键移除本文全部图片": "Remove all images from this note",
  "开始转换": "Start conversion",
  "转文字": "Convert to text",
  "本文没有可转换的图片": "This note has no images that can be converted.",
  "本文没有可移除的图片": "This note has no images that can be removed.",
  "移除图片引用": "Remove image references",
  "正在启动…": "Starting…",
  "图片转文字已结束": "Image-to-text finished",
  "正在转换图片": "Converting images",
  "取消后续处理": "Cancel remaining images",
  "正在取消…": "Cancelling…",
  "正在安全停止当前图片…": "Safely stopping the current image…",
  "正在准备图片": "Preparing image",
  "正在读取图片": "Reading image",
  "正在调用模型识别": "Waiting for the model",
  "正在校验识别结果": "Validating recognition result",
  "正在写入图片下方": "Writing below the image",
  "正在回读验证结果": "Verifying the saved result",
  "图片转文字已完成": "Image-to-text completed",
  "图片转文字失败": "Image-to-text failed",
  "图片转文字已取消": "Image-to-text cancelled",
  "定位转换位置": "Locate conversion",
  "定位失败，请稍后重试": "Could not locate the conversion. Try again shortly.",
  "详情": "Details",
  "转到后台": "Continue in background",
  "关闭": "Close",
  "关键时刻": "Key moment",
  "跳转到录音位置": "Jump to the recording position",
  "当前阅读视图中没有可跳转的音频或视频播放器": "No audio or video player is available in the current reading view.",
  "选中文字支持整块拖动": "Drag selected text as a block",
  "默认开启。选中源笔记中的文字并拖到另一篇 Markdown 后，自动引用选区所在的完整块；源内容修改后，目标笔记会同步展示。": "On by default. Drag selected text to another Markdown note to embed its full source block and keep it in sync.",
  "类 Word 实时编辑": "Word-like live editing",
  "默认开启。实时预览中保持排版；任务列表的选择、回车、退格和缩进保持完整复选框，并支持从块外一次删除完整图片或代码块。": "On by default. Preserve formatting in Live Preview, keep task checkboxes intact across selection, Enter, Backspace, and indentation, and delete an image or code block as one unit from outside the block.",
  "启用评论": "Enable comments",
  "评论后，评论内容将在目标文档末尾以“评论”为标题，在该章节进行记录。": "Comments are stored in a Comments section at the end of the target note.",
  "自动整理组件配置": "Content processing components",
  "正在检测自动整理组件…": "Checking content processing components…",
  "检测": "Check",
  "自动配置": "Set up automatically",
  "配置中…": "Setting up…",
  "检查环境": "Check environment",
  "下载组件": "Download components",
  "校验文件": "Verify files",
  "配置组件": "Configure components",
  "浏览器剪藏": "Browser capture",
  "接收浏览器剪藏": "Receive browser captures",
  "浏览器剪藏存储路径": "Browser capture folder",
  "填写相对于当前库的路径。": "Enter a path relative to the current vault.",
  "手机端剪藏": "Mobile capture",
  "手机端剪藏文件夹": "Mobile capture folder",
  "剪藏内容解析": "Capture processing",
  "笔记自动解析": "Automatically process notes",
  "针对剪藏笔记中的链接或语音文件进行转录和解析。启用后会在 Obsidian 启动时自动触发，也可通过左侧菜单栏手动触发。": "Transcribe and process links or audio in captured notes. Runs when Obsidian starts or from the ribbon.",
  "模型选择": "Model provider",
  "模型名称": "Model",
  "自定义模型 ID": "Custom model ID",
  "CLI 可执行文件": "CLI executable",
  "接口地址": "API endpoint",
  "重新检测本机 CLI": "Detect local CLIs again",
  "重新检测": "Detect again",
  "检测中…": "Detecting…",
  "启用 AI 自动属性": "Enable AI-generated properties",
  "作品文件夹": "Output folder",
  "选择文件夹": "Choose folder",
  "生成真实配图": "Generate images",
  "配图接口与模型": "Image endpoint and model",
  "配图尺寸与附件目录": "Image size and attachment folder",
  "配图 API key": "Image API key",
  "清除": "Clear",
  "忽略文件夹": "Excluded folders",
  "阅读列表": "Reading list",
  "未读": "Unread",
  "已读": "Read",
  "刷新阅读列表": "Refresh reading list",
  "搜索标题或路径…": "Search titles or paths…",
  "搜索阅读列表": "Search reading list",
  "没有匹配的笔记": "No matching notes",
  "这里还没有笔记": "No notes here yet",
  "换个关键词试试。": "Try another search term.",
  "把 Markdown 文档加入跟踪文件夹后，它会自动出现在这里。": "Markdown notes appear here when added to the tracked folder.",
  "仓库根目录": "Vault root",
  "定位到原始目录": "Reveal in file explorer",
  "复制绝对路径": "Copy absolute path",
  "复制相对路径": "Copy relative path",
  "主题": "Topics",
  "搜索主题、领域或文档…": "Search topics, domains, or notes…",
  "刷新主题列表": "Refresh topic list",
  "没有匹配的主题": "No matching topics",
  "工作台": "Workspace",
  "研究": "Research",
  "项目": "Projects",
  "生活": "Life",
  "知识树": "Knowledge tree",
  "处理": "Resolve",
  "正在检查": "Checking",
  "重新检查": "Check again",
  "知道了": "Got it",
  "已开启": "On",
  "已关闭": "Off",
  "评论": "Comment",
  "取消": "Cancel",
  "保存评论": "Save comment",
  "保存修改": "Save changes",
  "打开原文": "Open source note",
  "暂不处理": "Not now",
  "移入回收站": "Move to trash",
  "取消全选": "Deselect all",
  "全选": "Select all",
  "打开阅读列表": "Open reading list",
  "打开主题": "Open topics",
  "打开工作台": "Open workspace",
  "浏览器 cookie 来源": "Browser cookie source",
  "配置下载组件读取 cookie 的模式。推荐使用“自动优先探测”，优先静默复用本机已登录的浏览器会话。": "Configures how the downloader accesses cookies. “Automatic detection” is recommended to seamlessly reuse existing browser sessions on this computer.",
  "平台登录授权与状态管理": "Platform login authorization & status",
  "各平台登录授权状态": "Platform login authorization status",
  "重新登录": "Log in again",
  "解除授权": "Revoke authorization",
  "一键登录授权": "One-click login authorization",
  "我已完成登录": "I have completed login",
  "未能检测到有效的登录会话，请在上方页面中完成登录后重试": "No valid login session was detected. Please complete login in the page above and try again.",
  "清空所有平台授权": "Clear all platform authorizations",
  "删除本地保存的所有平台登录凭据与授权状态。": "Deletes all locally saved platform credentials and authorization states.",
  "清空全部授权": "Clear all authorizations",
  "已清空所有平台的登录凭据与授权状态": "Cleared all platform credentials and authorization states",
  "存链接": "Save links",
  "批量存链接": "Save links in batch",
  "录音": "Record",
  "每行一个链接，可一次粘贴多篇。": "Paste one link per line, with support for multiple links at once.",
  "保存并解析": "Save and process",
  "录音标题（可不填）": "Recording title (optional)",
  "开始录音": "Start recording",
  "首次使用会请求麦克风权限；中断后可自动续录。": "Microphone permission is requested on first use; recording can resume automatically after an interruption.",
  "导入音视频": "Import audio or video",
  "选择本地音频或视频": "Choose local audio or video",
  "拖拽或选择本地音频和视频": "Drop or choose local audio and video",
  "正在导入…": "Importing…",
  "拖拽音频或视频到这里": "Drop audio or video here",
  "或点击选择文件": "or click to choose files",
  "正在导入 Vault": "Importing into the vault",
  "已导入，正在后台转录和整理": "Imported. Transcription and processing are running in the background.",
  "解析完成": "Processing complete",
  "收起为悬浮框": "Minimize to floating recorder",
  "继续录音": "Resume recording",
  "重新连接麦克风": "Reconnect microphone",
  "停止并保存": "Stop and save",
  "保存已有录音": "Save recovered recording",
  "打开录音笔记": "Open recording note",
  "新建录音": "New recording",
  "展开录音": "Expand recorder",
  "返回录音": "Return to recorder",
  "返回录音页": "Return to recorder",
  "录音中": "Recording",
  "打开录音": "Open recorder",
  "整理新链接文档": "Process new link notes",
  "检查运行环境": "Check runtime environment",
  "自动配置整理组件": "Set up processing components",
  "解析当前链接笔记": "Process current link note",
  "检查历史失联附件": "Check orphaned attachments",
  "检查附件与链接一致性": "Check attachment and link consistency",
  "整理当前笔记附件": "Organize attachments for the current note",
  "整理全库附件": "Organize attachments across the vault",
  "附件整理预览": "Attachment organization preview",
  "目标目录沿用 Obsidian 的全局附件位置。共享附件只会复制，重名文件会自动使用新名称，不覆盖已有文件。": "The destination follows Obsidian's global attachment location. Shared attachments are copied only, and name collisions use a new name without overwriting existing files.",
  "执行整理": "Organize",
  "移动": "Move",
  "搜索 Vault 中的文件夹…": "Search folders in this vault…",
  "跟踪文件夹": "Tracked folder",
  "相对于仓库根目录的路径。留空表示统计整个仓库。": "Path relative to the vault root. Leave blank to include the entire vault.",
  "例如：阅读列表": "For example: Reading list",
  "状态属性名": "Status property",
  "写入 Markdown frontmatter 的属性名称。": "Property name written to Markdown frontmatter.",
  "阅读状态": "Reading status",
  "在看状态值": "Reading value",
  "已读完状态值": "Read value",
  "自动接管新笔记": "Initialize new notes automatically",
  "在跟踪文件夹中新建或导入 Markdown 笔记时，若没有阅读状态，自动设为“在看”。": "When a Markdown note is created or imported in the tracked folder, set it to Reading if no reading status exists.",
  "读到文末自动完成": "Complete at the end of a note",
  "在实时阅览或阅读视图中主动滚动、点击，并在文末停留后自动切换为“已读完”。实时编辑文字时会暂停，避免误判。": "After active scrolling or clicking in Live Preview or Reading view, mark a note as Read when you remain at the end. Pauses while editing.",
  "到达文末后等待多久再标记完成，用于减少快速滑过导致的误判。": "How long to wait at the end before marking a note as read.",
  "撤销浏览器授权": "Revoke browser authorization",
  "监听手机端写入的链接或语音笔记。填写相对于当前库的路径；留空时沿用阅读状态管理的跟踪文件夹。": "Watch link or audio notes created on mobile. Enter a vault-relative path, or leave blank to use the tracked folder.",
  "文章标题添加日期前缀": "Add a date prefix to article titles",
  "默认开启，生成“YYYY-MM-DD-文章名”，便于按文件名排序。关闭后只使用原文章名；不会批量修改已有笔记。": "On by default. Creates “YYYY-MM-DD-Article title” for filename sorting. Existing notes are not renamed in bulk.",
  "网页内置解析失败时使用；留空自动检测 defuddle。": "Used when the built-in article parser fails. Leave blank to detect Defuddle automatically.",
  "通常留空自动检测；用于读取字幕，以及下载公开视频或公开音频。": "Usually detected automatically. Reads subtitles and downloads public video or audio.",
  "通常由运行环境自动配置；用于音视频格式转换。": "Usually configured automatically. Converts audio and video formats.",
  "视频没有字幕时使用；留空会自动检测 Whisper 或 whisper-cli。": "Used when a video has no subtitles. Leave blank to detect Whisper automatically.",
  "Whisper 模型": "Whisper model",
  "Python Whisper 可填 small；whisper.cpp 可填 small 或 GGML 模型完整路径。": "For Python Whisper, enter small. For whisper.cpp, enter small or the full path to a GGML model.",
  "从已检测或官方推荐的模型中选择；选择“自定义模型 ID”后才需要手动填写。": "Choose a detected or officially recommended model. Enter an ID only after selecting Custom model ID.",
  "仅在下拉列表没有目标模型时填写；填写后会覆盖 CLI 默认模型。": "Use only when the model is missing from the list. This overrides the CLI default.",
  "模型 ID": "Model ID",
  "通常留空即可自动检测；仅在自定义安装位置时填写绝对路径。插件使用无 shell 的只读子进程运行。": "Usually leave blank for automatic detection. Enter an absolute path only for a custom installation.",
  "清除已保存的密钥": "Clear saved API key",
  "安装、升级或切换本地 CLI 后使用；只刷新可执行路径和可用状态。": "Use after installing, upgrading, or switching a local CLI. Only executable paths and availability are refreshed.",
  "基础字段仍由规则维护；大模型只生成类型、状态、领域和主题等语义字段，已有值默认保留。": "Rules maintain basic fields. AI only generates semantic fields such as type, status, domain, and topic, preserving existing values.",
  "保存首稿、渠道稿和版本记录。可直接输入路径，或从当前 Vault 选择已有文件夹。": "Stores first drafts, channel versions, and revision history. Enter a path or choose an existing folder.",
  "_KnowGrove/输出": "_KnowGrove/Output",
  "关闭时仍会生成可复制的配图方案；开启后可在创作助手中生成图片并保存为 Vault 附件。": "When off, KnowGrove still creates a reusable image brief. When on, the creation assistant can generate images as vault attachments.",
  "支持 OpenAI images API 或相同返回结构的兼容服务。": "Supports the OpenAI Images API and compatible services with the same response format.",
  "_KnowGrove/输出/assets": "_KnowGrove/Output/assets",
  "微调分类树": "Fine-tune taxonomy",
  "只在 AI 建议不符合你的分类习惯时调整领域名称和层级。": "Adjust domain names and levels only when the AI suggestion does not match your taxonomy.",
  "微调": "Fine-tune",
  "属性检查默认覆盖整个知识库，并自动跳过系统文件和代码依赖；这里每行可再添加一个不需要检查的文件夹。": "Property checks cover the entire vault and skip system files and code dependencies. Add one excluded folder per line.",
  "例如：home/🕹️skills": "For example: home/skills",
  "阅读状态管理": "Reading status",
  "存储路径与本地解析工具": "Storage paths and local processing tools",
  "AI 自动搭建你的分类树": "Let AI build your taxonomy",
  "系统扫描现有知识，只给出一套建议；你决定是否采用，不需要逐字段配置。": "KnowGrove scans existing knowledge and proposes one taxonomy. You decide whether to adopt it without configuring every field.",
  "AI 会按语义选择最具体的二级领域；内容较宽时保留在一级领域。": "AI chooses the most specific second-level domain and keeps broader content at the first level.",
  "AI 建议待确认": "AI suggestion awaiting confirmation",
  "直接使用这套方案": "Use this taxonomy",
  "暂不使用": "Not now",
  "保存微调": "Save changes",
  "浏览器授权已撤销。再次打开扩展即可重新配对。": "Browser authorization revoked. Reopen the extension to pair again.",
  "自动整理组件已配置": "Content processing components are ready.",
  "浏览器授权已撤销。再次打开扩展，点击“重新连接 KnowGrove”即可配对。": "Browser authorization revoked. Reopen the extension and select Reconnect KnowGrove to pair again.",
  "已清除配图 API key": "Image API key cleared.",
  "AI 分类建议已生成，请选择是否使用": "AI taxonomy suggestion generated. Review it before applying.",
  "GLM CLI（zai 兼容）": "GLM CLI (zai-compatible)",
  "OpenAI 兼容接口": "OpenAI-compatible API",
  "正在检查本机命令、API 配置和接口连接…": "Checking local commands, API settings, and connections…",
  "跟随 CodeBuddy 默认模型": "Use the CodeBuddy default model",
  "使用 CLI 默认模型": "Use the CLI default model",
  "自定义模型 ID…": "Custom model ID…",
  "已采用 AI 方案": "AI taxonomy applied",
  "已微调": "Customized",
  "系统推荐方案": "Recommended taxonomy",
  "纵向骨架": "Vertical structure",
  "领域树": "Domain taxonomy",
  "稳定、互斥，最多两级": "Stable, distinct, and limited to two levels",
  "横向组合": "Cross-cutting dimensions",
  "区块维度": "Content dimensions",
  "与领域正交，不重复分类": "Independent from domains, without duplicate classification",
  "类型": "Type",
  "内容类型": "Content type",
  "所属项目": "Project",
  "发布渠道": "Publishing channel",
  "精准检索": "Precise retrieval",
  "概念索引": "Concept index",
  "AI 提取可复用概念和关系": "AI extracts reusable concepts and relationships",
  "来源笔记": "Source notes",
  "关联笔记": "Related notes",
  "生命周期": "Lifecycle",
  "围绕主题推动计划、实践、研究与应用": "Move each topic through planning, practice, study, and application",
  "当前分类树": "Current taxonomy",
  "AI 分析并给出建议": "Analyze and suggest a taxonomy",
  "重新生成 AI 建议": "Generate a new AI suggestion",
  "正在分析知识库…": "Analyzing the vault…",
};

const LOCAL_OVERRIDES: Partial<Record<KnowGroveLocale, Record<string, string>>> = {
  "zh-TW": {
    "言续": "言续", "言续设置": "言续設定",
    "大模型配置": "AI 模型設定", "属性管理": "屬性管理", "知识工作台": "知識工作區", "增强功能": "增強功能",
    "收集箱路径": "收集匣路徑", "自动整理新内容": "自動整理新內容", "阅读习惯设置": "閱讀習慣",
    "主题列表": "主題列表", "在文件列表中定位此文档": "在檔案總管中顯示此筆記", "附件冗余检测": "孤立附件檢查", "附件随笔记移动": "附件隨筆記移動", "自动整理附件": "自動整理附件", "共享附件处理": "共用附件處理", "附件与链接排除目录": "附件與連結排除資料夾", "额外附件格式": "其他附件格式", "最近文件依据": "最近檔案依據",
    "最近操作": "最近開啟", "最近编辑": "最近編輯", "最近新建": "最近建立", "删除多余空行": "刪除多餘空行", "删除选中内容的空行": "刪除所選內容的空行", "选中内容中没有可删除的空行": "所選內容中沒有可刪除的空行", "已删除选中内容的空行": "已刪除所選內容的空行", "AI 图片转文字": "AI 圖片轉文字", "图片转文字": "圖片轉文字", "图片转文字后台任务": "圖片轉文字背景工作", "转换本文全部图片": "轉換本文全部圖片", "一键移除本文全部图片": "移除本文全部圖片", "开始转换": "開始轉換", "转文字": "轉文字", "本文没有可转换的图片": "本文沒有可轉換的圖片", "本文没有可移除的图片": "本文沒有可移除的圖片", "移除图片引用": "移除圖片引用", "正在准备图片": "正在準備圖片", "正在读取图片": "正在讀取圖片", "正在调用模型识别": "正在呼叫模型辨識", "正在校验识别结果": "正在驗證辨識結果", "正在写入图片下方": "正在寫入圖片下方", "正在回读验证结果": "正在回讀驗證結果", "图片转文字已完成": "圖片轉文字已完成", "图片转文字失败": "圖片轉文字失敗", "图片转文字已取消": "圖片轉文字已取消", "定位转换位置": "定位轉換位置", "定位失败，请稍后重试": "定位失敗，請稍後再試", "详情": "詳細資料", "转到后台": "轉到背景執行",
    "启用评论": "啟用評論", "自动整理组件配置": "自動整理元件", "浏览器剪藏": "瀏覽器剪藏",
    "手机端剪藏": "行動裝置剪藏", "剪藏内容解析": "剪藏內容解析", "模型选择": "模型供應商",
    "模型名称": "模型", "作品文件夹": "作品資料夾", "选择文件夹": "選擇資料夾", "阅读列表": "閱讀列表",
    "未读": "未讀", "已读": "已讀", "主题": "主題", "工作台": "工作區", "研究": "研究", "项目": "專案",
    "生活": "生活", "知识树": "知識樹", "处理": "處理", "正在检查": "檢查中", "重新检查": "重新檢查",
    "知道了": "知道了", "检查附件": "檢查附件", "全库检查": "全庫檢查", "已开启": "已開啟", "已关闭": "已關閉", "评论": "評論", "取消": "取消", "保存评论": "儲存評論", "保存修改": "儲存變更",
    "打开原文": "開啟原文", "暂不处理": "暫不處理", "移入回收站": "移至回收筒", "全选": "全選",
  },
  ja: {
    "大模型配置": "AIモデル", "属性管理": "プロパティ管理", "知识工作台": "ナレッジワークスペース", "增强功能": "拡張機能",
    "收集箱路径": "受信トレイフォルダー", "自动整理新内容": "新しいコンテンツを自動整理", "阅读习惯设置": "読書設定",
    "主题列表": "トピック一覧", "在文件列表中定位此文档": "ファイルエクスプローラーでこのノートを表示", "附件冗余检测": "孤立した添付ファイルの確認", "附件随笔记移动": "ノートと一緒に添付ファイルを移動", "自动整理附件": "添付ファイルを自動整理", "共享附件处理": "共有添付ファイルの処理", "附件与链接排除目录": "添付ファイルとリンクの除外フォルダー", "额外附件格式": "追加の添付ファイル形式", "最近文件依据": "最近のファイルの基準",
    "最近操作": "最近開いた項目", "最近编辑": "最近編集した項目", "最近新建": "最近作成した項目", "删除多余空行": "余分な空行を削除", "删除选中内容的空行": "選択範囲の空行を削除", "选中内容中没有可删除的空行": "選択範囲に削除できる空行はありません", "已删除选中内容的空行": "選択範囲の空行を削除しました", "AI 图片转文字": "AI画像をテキスト化", "转换本文全部图片": "このノートの画像をすべて変換", "一键移除本文全部图片": "このノートの画像をすべて削除", "开始转换": "変換を開始", "转文字": "テキスト化", "本文没有可转换的图片": "変換できる画像がありません", "本文没有可移除的图片": "削除できる画像がありません", "移除图片引用": "画像参照を削除",
    "启用评论": "コメントを有効化", "自动整理组件配置": "コンテンツ処理コンポーネント", "浏览器剪藏": "ブラウザーキャプチャ",
    "手机端剪藏": "モバイルキャプチャ", "剪藏内容解析": "キャプチャの処理", "模型选择": "モデルプロバイダー",
    "模型名称": "モデル", "作品文件夹": "出力フォルダー", "选择文件夹": "フォルダーを選択", "阅读列表": "リーディングリスト",
    "未读": "未読", "已读": "既読", "主题": "トピック", "工作台": "ワークスペース", "研究": "リサーチ", "项目": "プロジェクト",
    "生活": "ライフ", "知识树": "ナレッジツリー", "处理": "修正", "正在检查": "確認中", "重新检查": "再確認",
    "知道了": "OK", "检查附件": "添付ファイルを確認", "全库检查": "保管庫全体を確認", "已开启": "オン", "已关闭": "オフ", "评论": "コメント", "取消": "キャンセル", "保存评论": "コメントを保存", "保存修改": "変更を保存",
    "打开原文": "元のノートを開く", "暂不处理": "後で", "移入回收站": "ゴミ箱へ移動", "全选": "すべて選択",
  },
  ko: {
    "大模型配置": "AI 모델", "属性管理": "속성 관리", "知识工作台": "지식 작업 공간", "增强功能": "향상 기능",
    "收集箱路径": "받은 편지함 폴더", "自动整理新内容": "새 콘텐츠 자동 정리", "阅读习惯设置": "읽기 환경설정",
    "主题列表": "주제 목록", "在文件列表中定位此文档": "파일 탐색기에서 이 노트 표시", "附件冗余检测": "고아 첨부 파일 검사", "附件随笔记移动": "노트와 함께 첨부 파일 이동", "自动整理附件": "첨부 파일 자동 정리", "共享附件处理": "공유 첨부 파일 처리", "附件与链接排除目录": "첨부 파일 및 링크 제외 폴더", "额外附件格式": "추가 첨부 파일 형식", "最近文件依据": "최근 파일 기준",
    "最近操作": "최근에 연 파일", "最近编辑": "최근에 편집한 파일", "最近新建": "최근에 만든 파일", "删除多余空行": "불필요한 빈 줄 제거", "删除选中内容的空行": "선택 영역의 빈 줄 제거", "选中内容中没有可删除的空行": "선택 영역에 제거할 수 있는 빈 줄이 없습니다", "已删除选中内容的空行": "선택 영역의 빈 줄을 제거했습니다", "AI 图片转文字": "AI 이미지 텍스트 변환", "转换本文全部图片": "이 노트의 모든 이미지 변환", "一键移除本文全部图片": "이 노트의 모든 이미지 제거", "开始转换": "변환 시작", "转文字": "텍스트로 변환", "本文没有可转换的图片": "변환할 이미지가 없습니다", "本文没有可移除的图片": "제거할 이미지가 없습니다", "移除图片引用": "이미지 참조 제거",
    "启用评论": "댓글 사용", "自动整理组件配置": "콘텐츠 처리 구성 요소", "浏览器剪藏": "브라우저 캡처",
    "手机端剪藏": "모바일 캡처", "剪藏内容解析": "캡처 처리", "模型选择": "모델 공급자", "模型名称": "모델",
    "作品文件夹": "출력 폴더", "选择文件夹": "폴더 선택", "阅读列表": "읽기 목록", "未读": "읽지 않음", "已读": "읽음",
    "主题": "주제", "工作台": "작업 공간", "研究": "연구", "项目": "프로젝트", "生活": "생활", "知识树": "지식 트리",
    "处理": "해결", "正在检查": "검사 중", "重新检查": "다시 검사", "知道了": "확인", "检查附件": "첨부 파일 검사", "全库检查": "전체 보관함 검사", "已开启": "켜짐", "已关闭": "꺼짐", "评论": "댓글", "取消": "취소",
    "保存评论": "댓글 저장", "保存修改": "변경 사항 저장", "打开原文": "원본 노트 열기", "暂不处理": "나중에", "移入回收站": "휴지통으로 이동", "全选": "모두 선택",
  },
  de: {
    "大模型配置": "KI-Modell", "属性管理": "Eigenschaften", "知识工作台": "Wissensarbeitsbereich", "增强功能": "Erweiterungen",
    "收集箱路径": "Posteingangsordner", "自动整理新内容": "Neue Inhalte automatisch verarbeiten", "阅读习惯设置": "Leseeinstellungen",
    "主题列表": "Themenliste", "在文件列表中定位此文档": "Diese Notiz im Datei-Explorer anzeigen", "附件冗余检测": "Verwaiste Anhänge prüfen", "附件随笔记移动": "Anhänge mit Notizen verschieben", "自动整理附件": "Anhänge automatisch organisieren", "共享附件处理": "Gemeinsame Anhänge", "附件与链接排除目录": "Ausgeschlossene Anhangs- und Linkordner", "额外附件格式": "Zusätzliche Anhangsformate", "最近文件依据": "Zuletzt verwendet nach",
    "最近操作": "Zuletzt geöffnet", "最近编辑": "Zuletzt bearbeitet", "最近新建": "Zuletzt erstellt", "删除多余空行": "Zusätzliche Leerzeilen entfernen", "删除选中内容的空行": "Leerzeilen in der Auswahl entfernen", "选中内容中没有可删除的空行": "Die Auswahl enthält keine entfernbaren Leerzeilen.", "已删除选中内容的空行": "Leerzeilen in der Auswahl wurden entfernt.", "AI 图片转文字": "KI-Bild in Text", "转换本文全部图片": "Alle Bilder dieser Notiz umwandeln", "一键移除本文全部图片": "Alle Bilder aus dieser Notiz entfernen", "开始转换": "Umwandlung starten", "转文字": "In Text umwandeln", "本文没有可转换的图片": "Diese Notiz enthält keine umwandelbaren Bilder.", "本文没有可移除的图片": "Diese Notiz enthält keine entfernbaren Bilder.", "移除图片引用": "Bildverweise entfernen",
    "启用评论": "Kommentare aktivieren", "自动整理组件配置": "Komponenten zur Inhaltsverarbeitung", "浏览器剪藏": "Browser-Erfassung",
    "手机端剪藏": "Mobile Erfassung", "剪藏内容解析": "Erfasste Inhalte verarbeiten", "模型选择": "Modellanbieter", "模型名称": "Modell",
    "作品文件夹": "Ausgabeordner", "选择文件夹": "Ordner auswählen", "阅读列表": "Leseliste", "未读": "Ungelesen", "已读": "Gelesen",
    "主题": "Themen", "工作台": "Arbeitsbereich", "研究": "Recherche", "项目": "Projekte", "生活": "Leben", "知识树": "Wissensbaum",
    "处理": "Beheben", "正在检查": "Wird geprüft", "重新检查": "Erneut prüfen", "知道了": "Verstanden", "检查附件": "Anhänge prüfen", "全库检查": "Gesamten Vault prüfen", "已开启": "Ein", "已关闭": "Aus", "评论": "Kommentar", "取消": "Abbrechen",
    "保存评论": "Kommentar speichern", "保存修改": "Änderungen speichern", "打开原文": "Quellnotiz öffnen", "暂不处理": "Nicht jetzt", "移入回收站": "In Papierkorb verschieben", "全选": "Alle auswählen",
  },
  fr: {
    "大模型配置": "Modèle d’IA", "属性管理": "Gestion des propriétés", "知识工作台": "Espace de connaissances", "增强功能": "Améliorations",
    "收集箱路径": "Dossier de réception", "自动整理新内容": "Traiter automatiquement le nouveau contenu", "阅读习惯设置": "Préférences de lecture",
    "主题列表": "Liste des sujets", "在文件列表中定位此文档": "Afficher cette note dans l’explorateur de fichiers", "附件冗余检测": "Vérifier les pièces jointes orphelines", "附件随笔记移动": "Déplacer les pièces jointes avec les notes", "自动整理附件": "Organiser automatiquement les pièces jointes", "共享附件处理": "Pièces jointes partagées", "附件与链接排除目录": "Dossiers de pièces jointes et liens exclus", "额外附件格式": "Formats de pièce jointe supplémentaires", "最近文件依据": "Fichiers récents selon",
    "最近操作": "Ouverture récente", "最近编辑": "Modification récente", "最近新建": "Création récente", "删除多余空行": "Supprimer les lignes vides en trop", "删除选中内容的空行": "Supprimer les lignes vides de la sélection", "选中内容中没有可删除的空行": "La sélection ne contient aucune ligne vide à supprimer.", "已删除选中内容的空行": "Les lignes vides de la sélection ont été supprimées.", "AI 图片转文字": "Image IA en texte", "转换本文全部图片": "Convertir toutes les images de cette note", "一键移除本文全部图片": "Supprimer toutes les images de cette note", "开始转换": "Démarrer la conversion", "转文字": "Convertir en texte", "本文没有可转换的图片": "Cette note ne contient aucune image convertible.", "本文没有可移除的图片": "Cette note ne contient aucune image à supprimer.", "移除图片引用": "Supprimer les références d’image",
    "启用评论": "Activer les commentaires", "自动整理组件配置": "Composants de traitement", "浏览器剪藏": "Capture du navigateur",
    "手机端剪藏": "Capture mobile", "剪藏内容解析": "Traitement des captures", "模型选择": "Fournisseur du modèle", "模型名称": "Modèle",
    "作品文件夹": "Dossier de sortie", "选择文件夹": "Choisir un dossier", "阅读列表": "Liste de lecture", "未读": "Non lu", "已读": "Lu",
    "主题": "Sujets", "工作台": "Espace de travail", "研究": "Recherche", "项目": "Projets", "生活": "Vie", "知识树": "Arbre de connaissances",
    "处理": "Corriger", "正在检查": "Vérification", "重新检查": "Vérifier à nouveau", "知道了": "Compris", "检查附件": "Vérifier les pièces jointes", "全库检查": "Vérifier tout le coffre", "已开启": "Activé", "已关闭": "Désactivé", "评论": "Commentaire", "取消": "Annuler",
    "保存评论": "Enregistrer le commentaire", "保存修改": "Enregistrer", "打开原文": "Ouvrir la note source", "暂不处理": "Plus tard", "移入回收站": "Mettre à la corbeille", "全选": "Tout sélectionner",
  },
  es: {
    "大模型配置": "Modelo de IA", "属性管理": "Gestión de propiedades", "知识工作台": "Espacio de conocimiento", "增强功能": "Mejoras",
    "收集箱路径": "Carpeta de entrada", "自动整理新内容": "Procesar contenido nuevo automáticamente", "阅读习惯设置": "Preferencias de lectura",
    "主题列表": "Lista de temas", "在文件列表中定位此文档": "Mostrar esta nota en el explorador de archivos", "附件冗余检测": "Comprobar adjuntos huérfanos", "附件随笔记移动": "Mover adjuntos con las notas", "自动整理附件": "Organizar adjuntos automáticamente", "共享附件处理": "Adjuntos compartidos", "附件与链接排除目录": "Carpetas de adjuntos y enlaces excluidas", "额外附件格式": "Formatos de adjuntos adicionales", "最近文件依据": "Archivos recientes según",
    "最近操作": "Abiertos recientemente", "最近编辑": "Editados recientemente", "最近新建": "Creados recientemente", "删除多余空行": "Eliminar líneas vacías adicionales", "删除选中内容的空行": "Eliminar líneas vacías de la selección", "选中内容中没有可删除的空行": "La selección no contiene líneas vacías que se puedan eliminar.", "已删除选中内容的空行": "Se eliminaron las líneas vacías de la selección.", "AI 图片转文字": "Imagen a texto con IA", "转换本文全部图片": "Convertir todas las imágenes de esta nota", "一键移除本文全部图片": "Eliminar todas las imágenes de esta nota", "开始转换": "Iniciar conversión", "转文字": "Convertir a texto", "本文没有可转换的图片": "Esta nota no contiene imágenes convertibles.", "本文没有可移除的图片": "Esta nota no contiene imágenes para eliminar.", "移除图片引用": "Eliminar referencias de imagen",
    "启用评论": "Activar comentarios", "自动整理组件配置": "Componentes de procesamiento", "浏览器剪藏": "Captura del navegador",
    "手机端剪藏": "Captura móvil", "剪藏内容解析": "Procesamiento de capturas", "模型选择": "Proveedor del modelo", "模型名称": "Modelo",
    "作品文件夹": "Carpeta de salida", "选择文件夹": "Elegir carpeta", "阅读列表": "Lista de lectura", "未读": "Sin leer", "已读": "Leído",
    "主题": "Temas", "工作台": "Espacio de trabajo", "研究": "Investigación", "项目": "Proyectos", "生活": "Vida", "知识树": "Árbol de conocimiento",
    "处理": "Corregir", "正在检查": "Comprobando", "重新检查": "Comprobar de nuevo", "知道了": "Entendido", "检查附件": "Comprobar adjuntos", "全库检查": "Comprobar toda la bóveda", "已开启": "Activado", "已关闭": "Desactivado", "评论": "Comentario", "取消": "Cancelar",
    "保存评论": "Guardar comentario", "保存修改": "Guardar cambios", "打开原文": "Abrir nota original", "暂不处理": "Ahora no", "移入回收站": "Mover a la papelera", "全选": "Seleccionar todo",
  },
  "pt-BR": {
    "大模型配置": "Modelo de IA", "属性管理": "Gerenciamento de propriedades", "知识工作台": "Espaço de conhecimento", "增强功能": "Recursos avançados",
    "收集箱路径": "Pasta de entrada", "自动整理新内容": "Processar novos conteúdos automaticamente", "阅读习惯设置": "Preferências de leitura",
    "主题列表": "Lista de tópicos", "在文件列表中定位此文档": "Mostrar esta nota no explorador de arquivos", "附件冗余检测": "Verificar anexos órfãos", "附件随笔记移动": "Mover anexos com as notas", "自动整理附件": "Organizar anexos automaticamente", "共享附件处理": "Anexos compartilhados", "附件与链接排除目录": "Pastas de anexos e links excluídas", "额外附件格式": "Formatos de anexo adicionais", "最近文件依据": "Arquivos recentes por",
    "最近操作": "Abertos recentemente", "最近编辑": "Editados recentemente", "最近新建": "Criados recentemente", "删除多余空行": "Remover linhas em branco extras", "删除选中内容的空行": "Remover linhas em branco da seleção", "选中内容中没有可删除的空行": "A seleção não contém linhas em branco que possam ser removidas.", "已删除选中内容的空行": "As linhas em branco da seleção foram removidas.", "AI 图片转文字": "Imagem em texto com IA", "转换本文全部图片": "Converter todas as imagens desta nota", "一键移除本文全部图片": "Remover todas as imagens desta nota", "开始转换": "Iniciar conversão", "转文字": "Converter em texto", "本文没有可转换的图片": "Esta nota não contém imagens conversíveis.", "本文没有可移除的图片": "Esta nota não contém imagens para remover.", "移除图片引用": "Remover referências de imagem",
    "启用评论": "Ativar comentários", "自动整理组件配置": "Componentes de processamento", "浏览器剪藏": "Captura do navegador",
    "手机端剪藏": "Captura no celular", "剪藏内容解析": "Processamento de capturas", "模型选择": "Provedor do modelo", "模型名称": "Modelo",
    "作品文件夹": "Pasta de saída", "选择文件夹": "Escolher pasta", "阅读列表": "Lista de leitura", "未读": "Não lido", "已读": "Lido",
    "主题": "Tópicos", "工作台": "Espaço de trabalho", "研究": "Pesquisa", "项目": "Projetos", "生活": "Vida", "知识树": "Árvore de conhecimento",
    "处理": "Corrigir", "正在检查": "Verificando", "重新检查": "Verificar novamente", "知道了": "Entendi", "检查附件": "Verificar anexos", "全库检查": "Verificar todo o cofre", "已开启": "Ativado", "已关闭": "Desativado", "评论": "Comentário", "取消": "Cancelar",
    "保存评论": "Salvar comentário", "保存修改": "Salvar alterações", "打开原文": "Abrir nota original", "暂不处理": "Agora não", "移入回收站": "Mover para a lixeira", "全选": "Selecionar tudo",
  },
  ru: {
    "大模型配置": "Модель ИИ", "属性管理": "Управление свойствами", "知识工作台": "Рабочая область знаний", "增强功能": "Дополнительные функции",
    "收集箱路径": "Папка входящих", "自动整理新内容": "Автоматически обрабатывать новые материалы", "阅读习惯设置": "Настройки чтения",
    "主题列表": "Список тем", "在文件列表中定位此文档": "Показать эту заметку в файловом проводнике", "附件冗余检测": "Проверка потерянных вложений", "附件随笔记移动": "Перемещать вложения вместе с заметками", "自动整理附件": "Автоматически упорядочивать вложения", "共享附件处理": "Общие вложения", "附件与链接排除目录": "Исключённые папки вложений и ссылок", "额外附件格式": "Дополнительные форматы вложений", "最近文件依据": "Недавние файлы по",
    "最近操作": "Недавно открытые", "最近编辑": "Недавно изменённые", "最近新建": "Недавно созданные", "删除多余空行": "Удалять лишние пустые строки", "删除选中内容的空行": "Удалить пустые строки в выделении", "选中内容中没有可删除的空行": "В выделении нет пустых строк, которые можно удалить.", "已删除选中内容的空行": "Пустые строки в выделении удалены.", "AI 图片转文字": "Изображение в текст с ИИ", "转换本文全部图片": "Преобразовать все изображения в заметке", "一键移除本文全部图片": "Удалить все изображения из заметки", "开始转换": "Начать преобразование", "转文字": "Преобразовать в текст", "本文没有可转换的图片": "В заметке нет изображений для преобразования.", "本文没有可移除的图片": "В заметке нет изображений для удаления.", "移除图片引用": "Удалить ссылки на изображения",
    "启用评论": "Включить комментарии", "自动整理组件配置": "Компоненты обработки", "浏览器剪藏": "Сохранение из браузера",
    "手机端剪藏": "Сохранение с телефона", "剪藏内容解析": "Обработка сохранённых материалов", "模型选择": "Поставщик модели", "模型名称": "Модель",
    "作品文件夹": "Папка результатов", "选择文件夹": "Выбрать папку", "阅读列表": "Список чтения", "未读": "Не прочитано", "已读": "Прочитано",
    "主题": "Темы", "工作台": "Рабочая область", "研究": "Исследования", "项目": "Проекты", "生活": "Жизнь", "知识树": "Дерево знаний",
    "处理": "Исправить", "正在检查": "Проверка", "重新检查": "Проверить снова", "知道了": "Понятно", "检查附件": "Проверить вложения", "全库检查": "Проверить всё хранилище", "已开启": "Включено", "已关闭": "Выключено", "评论": "Комментарий", "取消": "Отмена",
    "保存评论": "Сохранить комментарий", "保存修改": "Сохранить изменения", "打开原文": "Открыть исходную заметку", "暂不处理": "Не сейчас", "移入回收站": "Переместить в корзину", "全选": "Выбрать всё",
  },
};

export function normalizeKnowGroveLocale(language: string): KnowGroveLocale {
  const normalized = language.trim().replace(/_/g, "-").toLowerCase();
  if (normalized === "zh-tw" || normalized === "zh-hant" || normalized === "zh-hk") return "zh-TW";
  if (normalized === "zh" || normalized.startsWith("zh-")) return "zh-CN";
  if (normalized.startsWith("ja")) return "ja";
  if (normalized.startsWith("ko")) return "ko";
  if (normalized.startsWith("de")) return "de";
  if (normalized.startsWith("fr")) return "fr";
  if (normalized.startsWith("es")) return "es";
  if (normalized.startsWith("pt")) return "pt-BR";
  if (normalized.startsWith("ru")) return "ru";
  return "en";
}

let activeLocale: KnowGroveLocale = "en";

export function setKnowGroveLanguage(language: string): KnowGroveLocale {
  activeLocale = normalizeKnowGroveLocale(language);
  return activeLocale;
}

export function currentKnowGroveLocale(): KnowGroveLocale {
  return activeLocale;
}

export function formatImageTextElapsedLabel(
  elapsed: string,
  locale = currentKnowGroveLocale(),
): string {
  if (locale === "zh-CN") return `已耗时 ${elapsed}`;
  if (locale === "zh-TW") return `已耗時 ${elapsed}`;
  if (locale === "ja") return `経過時間 ${elapsed}`;
  if (locale === "ko") return `경과 시간 ${elapsed}`;
  if (locale === "de") return `Verstrichen ${elapsed}`;
  if (locale === "fr") return `Temps écoulé ${elapsed}`;
  if (locale === "es") return `Transcurrido ${elapsed}`;
  if (locale === "pt-BR") return `Decorrido ${elapsed}`;
  if (locale === "ru") return `Прошло ${elapsed}`;
  return `Elapsed ${elapsed}`;
}

export function formatImageTextTaskCounts(
  current: number,
  total: number,
  completed: number,
  skipped: number,
  failed: number,
  locale = currentKnowGroveLocale(),
): string {
  if (locale === "zh-CN") return `第 ${current}/${total} 张 · 已完成 ${completed} · 跳过 ${skipped} · 失败 ${failed}`;
  if (locale === "zh-TW") return `第 ${current}/${total} 張 · 已完成 ${completed} · 略過 ${skipped} · 失敗 ${failed}`;
  if (locale === "ja") return `${current}/${total} 枚目 · 完了 ${completed} · スキップ ${skipped} · 失敗 ${failed}`;
  if (locale === "ko") return `${current}/${total}번째 · 완료 ${completed} · 건너뜀 ${skipped} · 실패 ${failed}`;
  if (locale === "de") return `Bild ${current}/${total} · Fertig ${completed} · Übersprungen ${skipped} · Fehler ${failed}`;
  if (locale === "fr") return `Image ${current}/${total} · Terminées ${completed} · Ignorées ${skipped} · Échecs ${failed}`;
  if (locale === "es") return `Imagen ${current}/${total} · Completadas ${completed} · Omitidas ${skipped} · Fallidas ${failed}`;
  if (locale === "pt-BR") return `Imagem ${current}/${total} · Concluídas ${completed} · Ignoradas ${skipped} · Falhas ${failed}`;
  if (locale === "ru") return `Изображение ${current}/${total} · Готово ${completed} · Пропущено ${skipped} · Ошибок ${failed}`;
  return `Image ${current}/${total} · Completed ${completed} · Skipped ${skipped} · Failed ${failed}`;
}

export function knowGroveDisplayName(locale = currentKnowGroveLocale()): "言续" | "KnowGrove" {
  return locale === "zh-CN" || locale === "zh-TW" ? "言续" : "KnowGrove";
}

function localizeBrandTokens(value: string, locale: KnowGroveLocale): string {
  return value.replace(/KnowGrove|言序|言续/g, knowGroveDisplayName(locale));
}

export function translateKnowGroveText(source: string, locale = currentKnowGroveLocale()): string {
  if (!source) return source;
  if (locale === "zh-CN") return localizeBrandTokens(source, locale);
  const exact = LOCAL_OVERRIDES[locale]?.[source] ?? ENGLISH[source];
  if (exact) return localizeBrandTokens(exact, locale);
  const noteCount = source.match(/^(\d+)\s*篇$/);
  if (noteCount) return formatLocalizedCount(Number(noteCount[1]), "note", locale);
  const topicCount = source.match(/^(\d+)\s*个主题$/);
  if (topicCount) return formatLocalizedCount(Number(topicCount[1]), "topic", locale);
  for (const [prefix, englishPrefix] of [
    ["可调用：", "Available: "],
    ["已安装但不可调用：", "Installed but unavailable: "],
    ["待安装或配置：", "Not installed or configured: "],
    ["当前选择不可用：", "Selected provider unavailable: "],
    ["检测失败：", "Check failed: "],
    ["自动配置失败：", "Automatic setup failed: "],
  ] as const) {
    if (source.startsWith(prefix)) return `${englishPrefix}${source.slice(prefix.length)}`;
  }
  return localizeBrandTokens(source, locale);
}

function formatLocalizedCount(count: number, unit: "note" | "topic", locale: KnowGroveLocale): string {
  if (locale === "zh-CN") return `${count} ${unit === "note" ? "篇" : "个主题"}`;
  if (locale === "zh-TW") return `${count} ${unit === "note" ? "篇" : "個主題"}`;
  if (locale === "ja") return `${count}${unit === "note" ? "件" : "個のトピック"}`;
  if (locale === "ko") return `${count}${unit === "note" ? "개" : "개 주제"}`;
  const nouns: Record<Exclude<KnowGroveLocale, "zh-CN" | "zh-TW" | "ja" | "ko">, [string, string, string, string]> = {
    en: ["note", "notes", "topic", "topics"],
    de: ["Notiz", "Notizen", "Thema", "Themen"],
    fr: ["note", "notes", "sujet", "sujets"],
    es: ["nota", "notas", "tema", "temas"],
    "pt-BR": ["nota", "notas", "tópico", "tópicos"],
    ru: ["заметка", "заметок", "тема", "тем"],
  };
  const words = nouns[locale];
  const word = unit === "note" ? words[count === 1 ? 0 : 1] : words[count === 1 ? 2 : 3];
  return `${count} ${word}`;
}

const SKIP_LOCALIZATION_SELECTOR = [
  "textarea",
  "code",
  "pre",
  "[contenteditable='true']",
  ".knowgrove-note-title",
  ".knowgrove-note-meta",
  ".knowgrove-suggestion-title",
  ".knowgrove-suggestion-path",
  ".knowgrove-comment-text",
  ".knowgrove-topic-index-row-copy",
  ".knowgrove-topic-index-detail-title",
  ".knowgrove-topic-index-document-title",
  ".knowgrove-topic-index-document-path",
  ".knowgrove-tree-node-label",
  ".knowgrove-topic-card-title",
  ".knowgrove-research-topic-name",
  ".knowgrove-research-topic-question",
  ".knowgrove-research-source-title",
  ".knowgrove-research-source-path",
  ".knowgrove-theme-source-title",
  ".knowgrove-theme-source-path",
  ".knowgrove-taxonomy-tree",
  ".knowgrove-property-guide-tags",
  ".knowgrove-sidebar-source-preview",
  ".knowgrove-sidebar-comment-input",
  ".knowgrove-sidebar-edit-input",
  "[data-knowgrove-user-content]",
].join(",");

export const KNOWGROVE_UI_ROOT_SELECTOR = [
  ".knowgrove-settings",
  ".knowgrove-modal",
  ".knowgrove-property-matrix-shell",
  ".knowgrove-property-issue-modal",
  ".knowgrove-view",
  ".knowgrove-topic-index-view",
  ".knowgrove-creation-assistant",
  ".knowgrove-comments-view",
  ".knowgrove-theme-synthesis-modal",
  ".knowgrove-property-workbench",
  ".knowgrove-capture-modal",
  ".knowgrove-capture-view",
  ".knowgrove-recording-overlay",
  ".knowgrove-attachment-cleanup-shell",
  ".knowgrove-ai-batch-modal",
  ".knowgrove-tooltip",
].join(",");

export function isKnowGroveUiElement(element: Element | null): boolean {
  return Boolean(element?.closest(KNOWGROVE_UI_ROOT_SELECTOR));
}

function shouldSkip(element: Element | null): boolean {
  return Boolean(element?.closest(SKIP_LOCALIZATION_SELECTOR));
}

function translateTextNode(node: Text, locale: KnowGroveLocale): void {
  if (shouldSkip(node.parentElement)) return;
  const value = node.nodeValue ?? "";
  const trimmed = value.trim();
  if (!trimmed) return;
  const translated = translateKnowGroveText(trimmed, locale);
  if (translated === trimmed) return;
  node.nodeValue = value.replace(trimmed, translated);
}

function translateAttributes(element: Element, locale: KnowGroveLocale): void {
  if (shouldSkip(element)) return;
  for (const attribute of ["placeholder", "aria-label", "title"] as const) {
    const value = element.getAttribute(attribute);
    if (!value) continue;
    const translated = translateKnowGroveText(value, locale);
    if (translated !== value) element.setAttribute(attribute, translated);
  }
}

export function localizeKnowGroveElement(root: Node, locale = currentKnowGroveLocale()): void {
  if (root.instanceOf(Element)) translateAttributes(root, locale);
  if (root.instanceOf(Text)) translateTextNode(root, locale);
  const document = root.ownerDocument ?? (root.instanceOf(Document) ? root : undefined);
  if (!document) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    if (current.instanceOf(Text)) translateTextNode(current, locale);
    else if (current.instanceOf(Element)) translateAttributes(current, locale);
    current = walker.nextNode();
  }
}

export function installKnowGroveLocalization(document: Document): () => void {
  const locale = currentKnowGroveLocale();
  const rootObservers = new Map<Element, MutationObserver>();

  const observeRoot = (root: Element): void => {
    if (rootObservers.has(root)) return;
    localizeKnowGroveElement(root, locale);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") localizeKnowGroveElement(mutation.target, locale);
        for (const node of Array.from(mutation.addedNodes)) localizeKnowGroveElement(node, locale);
      }
    });
    observer.observe(root, { subtree: true, childList: true, characterData: true });
    rootObservers.set(root, observer);
  };

  const discoverRoots = (node: Node): void => {
    if (!node.instanceOf(Element)) return;
    if (node.matches(KNOWGROVE_UI_ROOT_SELECTOR)) observeRoot(node);
    node.querySelectorAll(KNOWGROVE_UI_ROOT_SELECTOR).forEach(observeRoot);
  };

  document.querySelectorAll(KNOWGROVE_UI_ROOT_SELECTOR).forEach(observeRoot);
  const discoveryObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes") discoverRoots(mutation.target);
      for (const node of Array.from(mutation.addedNodes)) discoverRoots(node);
    }
  });
  discoveryObserver.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => {
    discoveryObserver.disconnect();
    for (const observer of rootObservers.values()) observer.disconnect();
    rootObservers.clear();
  };
}

export function knownEnglishTranslation(source: string): string | undefined {
  return ENGLISH[source];
}
