# 知流 · 浏览器一键入库

知流是 KnowGrove 的浏览器入口：点击一次，把当前文章或视频整理到当前 Obsidian Vault。

版本：Chrome 扩展 `0.3.1`，需配合 KnowGrove `2.3.2` 或更高版本。

## 目录

```text
知流浏览器一键入库/
├── 产品设计材料/
│   ├── 知流-产品设计文档.md
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
3. 在 Chrome 开发者模式加载 `安装文件/Chrome/请选择此文件夹安装-知流-0.3.1/`。
4. 点击扩展中的“连接 KnowGrove”，在 Obsidian 弹窗中允许。
5. 打开文章或视频，点击“一键整理到 Obsidian”。

详见 [安装与使用说明](安装文件/安装与使用说明.md)。

## 开发检查

```bash
npm run check
```

插件侧测试和构建在仓库根目录执行：

```bash
pnpm test
pnpm run build
```
