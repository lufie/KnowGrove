# KnowGrove 上架 Obsidian 社区插件目录方案

本文档依据 Obsidian 当前社区插件提交规则维护。上架前应再次核对官方文档，因为审核规则会持续更新。

## 1. 当前结论

KnowGrove 源代码仓库已经公开。社区自动审核对 `2.6.1` 给出失败结果；修复版本 `2.7.3` 完成重新扫描并消除了原来的 3 个阻断 Error。性能修复版本 `2.7.4` 已正式发布，插件 ID `knowgrove` 已收录到 Obsidian 官方 `community-plugins.json`。当前社区条目仍明确标记为“尚未由 Obsidian 员工人工审核”，不能描述为已经通过人工审核。

已完成：

1. 源代码已合并到公开仓库默认分支 `main`。
2. `2.7.4` 正式标签和 Release 已存在；Manifest、包版本和版本映射均为 `2.7.4`。
3. Release 已包含 `main.js`、`manifest.json` 和 `styles.css`，不包含用户数据或密钥。
4. GitHub 自动发布工作流已执行 Obsidian 官方规则预检、类型检查、测试与生产构建，并为三个 `2.7.4` 发布文件生成构建来源证明。
5. 社区审核记录识别到 `2.6.1` / `c9453e0`，其构建校验、网络扫描和依赖扫描通过，但因下面 3 项代码规则错误而失败。

`2.6.1` 的阻断错误与 `2.7.3` 的处理：

1. 使用了 Manifest 最低版本之后才提供的 Obsidian API：根据官方规则计算出的真实最高下限，将 `minAppVersion` 提升为 `1.11.4`。
2. 将主插件实例传给 `MarkdownRenderer.render()`：改为为每个回退渲染容器创建独立 `MarkdownRenderChild`，并在替换、脱离 DOM 或插件卸载时释放。
3. 设置页手工创建 `h2/h3/h4`：改用 `new Setting(...).setHeading()`。

同时将 Manifest 标记为桌面专属，以匹配本产品对本地 CLI、接收服务和 Runtime 的真实依赖。缺少构建来源证明属于建议项而非失败原因，但 `2.7.3` 的发布工作流也会补齐。

已完成：`2.7.4` 的完整本地验收、GitHub Release、构建来源证明和官方社区清单收录。待完成：Obsidian 员工后续人工审核。

插件 ID `knowgrove` 已在 Obsidian 官方社区插件清单中登记，仓库为 `lufie/KnowGrove`。

## 2. 仓库准备

根目录必须包含：

- `README.md`：英文优先或中英双语，说明能力、安装、使用方法和安全边界。
- `LICENSE`：当前为 MIT。
- `manifest.json`：`id`、名称、描述、作者、版本和最低 Obsidian 版本准确。
- `versions.json`：每个插件版本对应最低 Obsidian 版本。
- `pnpm-lock.yaml`：固定依赖版本。
- `SECURITY.md`：安全问题报告方式。
- `PRIVACY.md`：联网、外部模型、Runtime 下载和本地数据边界。

不要把以下内容提交或上传到 Release：

- `data.json`
- `.env`、API Key、Token、签名私钥
- `browser-capture-jobs.json`
- Vault 中的笔记、评论、引用和附件历史
- Runtime 临时目录或平台二进制缓存

## 3. 审核前代码检查

执行：

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm check
pnpm test
pnpm build
git diff --check
```

还需要人工核对：

- 设置和命令使用 sentence case，英文界面不使用标题式大写。
- 不使用全局 `app`，而使用插件获得的 `this.app`。
- 修改 frontmatter 使用 `FileManager.processFrontMatter`。
- 删除文件使用 Obsidian 回收站接口，不直接永久删除。
- 用户路径通过 `normalizePath()` 处理。
- 不硬编码 `.obsidian`，使用 `Vault.configDir`。
- Manifest 必须如实声明桌面专属；当前版本依赖本地 CLI、接收服务和 Runtime，因此 `isDesktopOnly` 为 `true`。
- 发布构建压缩 `main.js`，源码仓库不提交构建产物。
- 不包含客户端遥测；若以后增加账号、付费或遥测，必须先更新 README 与隐私说明。

## 4. 正式发布

本仓库的 `.github/workflows/plugin-release.yml` 会在推送纯数字语义版本标签后执行测试、构建并创建 GitHub Release。

建议流程：

```bash
# 确认 manifest.json、package.json、versions.json 都是同一版本
git tag 2.7.3
git push origin 2.7.3
```

工作流会验证标签与 Manifest 版本一致，并上传：

- `main.js`
- `manifest.json`
- `styles.css`

Release 成功后，在干净 Vault 中从该 Release 手动安装一次，并验证：

1. 插件启用、停用和重新加载正常。
2. 英文和至少一种非拉丁语言界面无错误。
3. Manifest 正确阻止在不受支持的移动端安装，macOS 与 Windows 桌面端的核心功能正常。
4. Runtime 未安装、下载失败、CLI 缺失和 API 未配置时不会阻塞 Obsidian。
5. 插件卸载后用户笔记、属性、评论、引用和附件不丢失。

## 5. 提交社区目录

1. 打开 `https://community.obsidian.md` 并登录 Obsidian 账号。
2. 在个人资料中绑定拥有 `lufie/KnowGrove` 的 GitHub 账号。
3. 选择 **Plugins → New plugin**。
4. 输入公开仓库地址 `https://github.com/lufie/KnowGrove`。
5. 同意开发者政策并提交。
6. 自动审核提出问题后，在源码中修正、提升版本、创建新的 GitHub Release，再重新触发审核。

通过首次审核后，后续版本无需重复提交目录；只需更新默认分支的 Manifest 并发布版本号完全一致的 GitHub Release，Obsidian 会自动发现更新。

## 6. 建议的发布阶段

### Beta

- 先保持仓库公开，发布 GitHub prerelease。
- 使用 BRAT 招募英文、日文、德文和 Windows 用户测试。
- 完成 macOS Apple Silicon、macOS Intel、Windows x64 和 Obsidian 移动端加载验收。

### Community directory candidate

- 修复 Beta 阻塞问题。
- 发布非 prerelease 的正式版本。
- 通过官方自动审查和人工反馈。

### Stable

- 使用语义化版本。
- 每次发布附英文变更说明。
- 任何联网、账号、Credit、支付、模型提供方或数据发送范围变化，都同步更新 `README.md`、`PRIVACY.md` 和 `PRD.md`。
