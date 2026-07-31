# 言序 · KnowGrove 浏览器剪藏

言序（KnowGrove）浏览器剪藏是 KnowGrove 的浏览器入口：点击一次，把当前文章或视频整理到当前 Obsidian Vault。

版本：Chrome / Edge 扩展 `0.3.4`，需配合 KnowGrove `2.5.5` 或更高版本。

## 目录

```text
言序浏览器一键入库/
├── 产品设计材料/
│   ├── 言序-产品设计文档.md
│   └── 隐私政策.md
├── 产品源码/
│   ├── 浏览器扩展/
│   └── 开发工具/
├── 安装文件/
│   ├── Chrome/
│   ├── KnowGrove/
│   ├── Safari/
│   ├── 脚本/
│   └── 安装与使用说明.md
└── CHROMEWEBSTORE.md
```

独立本地助手已经移除。文章提取、视频转录、AI 调用、任务记录和 Vault 写入全部由 KnowGrove 完成。

## 快速开始

1. 安装并启用 KnowGrove。
2. 保持 Obsidian 打开。
3. 在 Chrome 或 Edge 的扩展开发者模式中加载 `产品源码/浏览器扩展/`。
4. 点击扩展中的“连接 KnowGrove”，在 Obsidian 弹窗中允许。
5. 打开文章、AI 对话分享页、视频或音频，点击“一键整理到 Obsidian”。

扩展会读取用户主动点击时当前页面已经渲染的正文或对话内容；短链和陌生平台由 KnowGrove 根据最终地址、响应类型与页面媒体信息重新判断。音视频优先读取字幕，没有可用字幕时才下载公开音频并使用本机 Whisper 转录。浏览器 Cookie 不会离开浏览器。

发布候选安装包生成后，会在仓库 `release/` 目录提供可直接解压加载的版本。

## 开发检查

```bash
npm run check
```

插件侧测试和构建在仓库根目录执行：

```bash
pnpm test
pnpm run build
```
