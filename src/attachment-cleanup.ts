import { Modal, Notice, TFile, normalizePath, setIcon } from "obsidian";
import type KnowGrovePlugin from "./main";
import {
  extractVaultReferenceTargets,
  isAttachmentCleanupExcludedPath,
  isAttachmentReferenceSource,
  isManagedAttachmentPath,
  selectPreviouslyReferencedOrphanPaths,
} from "./attachment-cleanup-core";
export {
  extractVaultReferenceTargets,
  isAttachmentCleanupExcludedPath,
  isAttachmentReferenceSource,
  isManagedAttachmentPath,
  selectPreviouslyReferencedOrphanPaths,
} from "./attachment-cleanup-core";

const DAILY_SCAN_INTERVAL = 24 * 60 * 60 * 1_000;
const SCAN_CHECK_INTERVAL = 60 * 60 * 1_000;
const NEW_ATTACHMENT_GRACE_PERIOD = 10 * 60 * 1_000;

export type AttachmentCleanupReason = "reference-removed" | "source-deleted" | "manual" | "daily";

export interface AttachmentCandidate {
  path: string;
  name: string;
  extension: string;
  size: number;
  modifiedAt: number;
  metadataSourcePaths?: string[];
}

interface AttachmentReferenceSnapshot {
  all: Set<string>;
  content: Set<string>;
}

function attachmentKind(extension: string): string {
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp", "tif", "tiff", "heic", "heif"].includes(extension)) return "图片";
  if (["mp3", "m4a", "wav", "aac", "flac", "ogg", "oga", "opus"].includes(extension)) return "录音";
  if (["mp4", "mov", "mkv", "webm", "m4v", "avi"].includes(extension)) return "视频";
  if (extension === "pdf") return "PDF";
  return "附件";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export class AttachmentCleanupModal extends Modal {
  private selected = new Set<string>();

  constructor(
    private readonly plugin: KnowGrovePlugin,
    private readonly candidates: AttachmentCandidate[],
    private readonly reason: AttachmentCleanupReason,
    private readonly onTrash: (paths: string[]) => Promise<{ trashed: number; skipped: number }>,
  ) {
    super(plugin.app);
    if (reason === "reference-removed" || reason === "source-deleted") {
      for (const candidate of candidates) this.selected.add(candidate.path);
    }
  }

  onOpen(): void {
    this.modalEl.addClass("knowgrove-attachment-cleanup-shell");
    this.render();
  }

  private render(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("knowgrove-attachment-cleanup-modal");
    root.createEl("h2", { text: this.reason === "manual" || this.reason === "daily" ? "历史失联附件" : "附件引用已移除" });
    root.createEl("p", {
      cls: "setting-item-description",
      text: this.reason === "manual" || this.reason === "daily"
        ? "以下附件曾被笔记使用，但当前已失去 Markdown、Canvas 或 Base 的全部引用。请选择后移入 Obsidian 回收站。"
        : this.candidates.some((candidate) => candidate.metadataSourcePaths?.length)
          ? "附件的正文引用已被移除，仅剩同一文档中的属性链接。确认后会同步清除该属性链接，并将附件移入 Obsidian 回收站。"
          : "以下附件已失去全库最后一处引用。是否同步移入 Obsidian 回收站？",
    });

    const toolbar = root.createDiv("knowgrove-attachment-cleanup-toolbar");
    toolbar.createSpan({ text: `${this.candidates.length} 个附件 · ${formatBytes(this.candidates.reduce((sum, item) => sum + item.size, 0))}` });
    const selectAll = toolbar.createEl("button", { text: this.selected.size === this.candidates.length ? "取消全选" : "全选" });
    selectAll.addEventListener("click", () => {
      if (this.selected.size === this.candidates.length) this.selected.clear();
      else for (const candidate of this.candidates) this.selected.add(candidate.path);
      this.render();
    });

    const list = root.createDiv("knowgrove-attachment-cleanup-list");
    for (const candidate of this.candidates) {
      const row = list.createEl("label", { cls: "knowgrove-attachment-cleanup-row" });
      const checkbox = row.createEl("input", { type: "checkbox" });
      checkbox.checked = this.selected.has(candidate.path);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) this.selected.add(candidate.path);
        else this.selected.delete(candidate.path);
        this.render();
      });
      const icon = row.createSpan("knowgrove-attachment-cleanup-icon");
      setIcon(icon, candidate.extension === "pdf" ? "file-text" : attachmentKind(candidate.extension) === "图片" ? "image" : "paperclip");
      const copy = row.createDiv("knowgrove-attachment-cleanup-copy");
      copy.createDiv({ cls: "knowgrove-attachment-cleanup-name", text: candidate.name });
      copy.createDiv({ cls: "knowgrove-attachment-cleanup-path", text: candidate.path });
      row.createSpan({ cls: "knowgrove-attachment-cleanup-meta", text: `${attachmentKind(candidate.extension)} · ${formatBytes(candidate.size)}` });
    }

    const actions = root.createDiv("knowgrove-attachment-cleanup-actions");
    const cancel = actions.createEl("button", { text: "暂不处理" });
    cancel.addEventListener("click", () => this.close());
    const trash = actions.createEl("button", { cls: "mod-warning", text: "移入回收站" });
    trash.disabled = this.selected.size === 0;
    trash.addEventListener("click", () => {
      trash.disabled = true;
      void this.onTrash(Array.from(this.selected)).then(({ trashed, skipped }) => {
        this.close();
        new Notice(skipped ? `已移入回收站 ${trashed} 个；${skipped} 个已恢复引用或不存在，未处理` : `已移入回收站 ${trashed} 个附件`);
      }).catch((error) => {
        trash.disabled = false;
        new Notice(`附件清理失败：${error instanceof Error ? error.message : String(error)}`);
      });
    });
  }
}

export class AttachmentCleanupManager {
  private readonly sourceReferences = new Map<string, Set<string>>();
  private readonly sourceContentReferences = new Map<string, Set<string>>();
  private readonly pendingPreviousReferences = new Map<string, Set<string>>();
  private readonly pendingPreviousContentReferences = new Map<string, Set<string>>();
  private initialized = false;
  private indexing?: Promise<void>;
  private readonly refreshTimers = new Map<string, number>();
  private dailyTimer?: number;
  private promptScheduled = false;
  private scanPromise?: Promise<void>;
  private pendingPromptReason: AttachmentCleanupReason = "reference-removed";
  private readonly pendingPromptPaths = new Set<string>();
  private readonly pendingMetadataSourcePaths = new Map<string, Set<string>>();

  constructor(private readonly plugin: KnowGrovePlugin) {
    for (const [attachmentPath, usage] of Object.entries(plugin.data.attachmentUsage)) {
      for (const sourcePath of usage.lastSourcePaths) {
        const references = this.sourceReferences.get(sourcePath) ?? new Set<string>();
        references.add(attachmentPath);
        this.sourceReferences.set(sourcePath, references);
      }
      for (const sourcePath of usage.lastContentSourcePaths) {
        const references = this.sourceContentReferences.get(sourcePath) ?? new Set<string>();
        references.add(attachmentPath);
        this.sourceContentReferences.set(sourcePath, references);
      }
    }
  }

  start(): void {
    void this.rebuildIndex().then(() => this.runDailyScanIfDue());
    this.dailyTimer = window.setInterval(() => void this.runDailyScanIfDue(), SCAN_CHECK_INTERVAL);
  }

  stop(): void {
    if (this.dailyTimer !== undefined) window.clearInterval(this.dailyTimer);
    for (const timer of this.refreshTimers.values()) window.clearTimeout(timer);
    this.refreshTimers.clear();
  }

  scheduleSourceRefresh(file: TFile): void {
    if (!isAttachmentReferenceSource(file.path)) return;
    if (!this.pendingPreviousReferences.has(file.path)) {
      this.pendingPreviousReferences.set(file.path, this.referencesBeforeRefresh(file.path));
      this.pendingPreviousContentReferences.set(file.path, this.referencesBeforeRefresh(file.path, true));
    }
    if (this.refreshTimers.has(file.path)) return;
    this.refreshTimers.set(file.path, window.setTimeout(() => {
      this.refreshTimers.delete(file.path);
      void this.refreshSource(file);
    }, 450));
  }

  refreshSourceAfterMetadataChange(file: TFile): void {
    if (!isAttachmentReferenceSource(file.path)) return;
    const timer = this.refreshTimers.get(file.path);
    if (timer !== undefined) window.clearTimeout(timer);
    this.refreshTimers.delete(file.path);
    void this.refreshSource(file);
  }

  async handleDelete(file: TFile): Promise<void> {
    const previousBeforeIndex = isAttachmentReferenceSource(file.path)
      ? this.referencesBeforeRefresh(file.path)
      : new Set<string>();
    await this.ensureIndex();
    if (isManagedAttachmentPath(file.path)) {
      for (const references of this.sourceReferences.values()) references.delete(file.path);
      for (const references of this.sourceContentReferences.values()) references.delete(file.path);
      if (this.plugin.data.attachmentUsage[file.path]) {
        delete this.plugin.data.attachmentUsage[file.path];
        await this.plugin.savePluginData();
      }
      return;
    }
    if (!isAttachmentReferenceSource(file.path)) return;
    const previous = previousBeforeIndex.size
      ? previousBeforeIndex
      : new Set(this.sourceReferences.get(file.path) ?? []);
    this.sourceReferences.delete(file.path);
    this.sourceContentReferences.delete(file.path);
    this.pendingPreviousReferences.delete(file.path);
    this.pendingPreviousContentReferences.delete(file.path);
    this.queuePotentialOrphans(previous, "source-deleted");
  }

  async handleRename(file: TFile, oldPath: string): Promise<void> {
    await this.ensureIndex();
    this.sourceReferences.delete(oldPath);
    this.sourceContentReferences.delete(oldPath);
    if (isManagedAttachmentPath(oldPath) || isManagedAttachmentPath(file.path)) {
      const previousUsage = this.plugin.data.attachmentUsage[oldPath];
      if (previousUsage) {
        this.plugin.data.attachmentUsage[file.path] = previousUsage;
        delete this.plugin.data.attachmentUsage[oldPath];
        await this.plugin.savePluginData();
      }
      await this.rebuildIndex();
      return;
    }
    if (isAttachmentReferenceSource(file.path)) this.scheduleSourceRefresh(file);
  }

  async scan(manual = true): Promise<void> {
    if (this.scanPromise) return this.scanPromise;
    this.scanPromise = this.performScan(manual).finally(() => {
      this.scanPromise = undefined;
    });
    return this.scanPromise;
  }

  private async performScan(manual: boolean): Promise<void> {
    await this.rebuildIndex();
    const candidates = this.orphanCandidates(manual ? 0 : NEW_ATTACHMENT_GRACE_PERIOD);
    this.plugin.settings.lastAttachmentCleanupScanAt = Date.now();
    await this.plugin.savePluginData();
    if (!candidates.length) {
      if (manual) new Notice("没有发现历史使用后失联的附件");
      return;
    }
    new AttachmentCleanupModal(this.plugin, candidates, manual ? "manual" : "daily", (paths) => this.trash(paths)).open();
  }

  private async runDailyScanIfDue(): Promise<void> {
    if (!this.plugin.settings.enableAttachmentCleanup) return;
    if (Date.now() - this.plugin.settings.lastAttachmentCleanupScanAt < DAILY_SCAN_INTERVAL) return;
    await this.scan(false);
  }

  private async ensureIndex(): Promise<void> {
    if (this.initialized) return;
    await this.rebuildIndex();
  }

  private async rebuildIndex(): Promise<void> {
    if (this.indexing) return this.indexing;
    this.indexing = (async () => {
      const next = new Map<string, Set<string>>();
      const nextContent = new Map<string, Set<string>>();
      const files = this.plugin.app.vault.getFiles();
      const attachmentFiles = this.managedAttachments(files);
      const markdownSources = files.filter((file) => file.extension === "md");
      const uncachedMarkdownSources: TFile[] = [];
      for (const file of markdownSources) {
        const snapshot = this.cachedMarkdownReferenceSnapshot(file, attachmentFiles);
        if (snapshot === null) {
          uncachedMarkdownSources.push(file);
          continue;
        }
        if (snapshot.all.size) next.set(file.path, snapshot.all);
        if (snapshot.content.size) nextContent.set(file.path, snapshot.content);
      }
      const sources = [
        ...uncachedMarkdownSources,
        ...files.filter((file) => file.extension === "canvas" || file.extension === "base"),
      ];
      let cursor = 0;
      const worker = async (): Promise<void> => {
        while (cursor < sources.length) {
          const file = sources[cursor];
          cursor += 1;
          if (file) {
            const snapshot = await this.readReferenceSnapshot(file, attachmentFiles);
            if (snapshot.all.size) next.set(file.path, snapshot.all);
            if (snapshot.content.size) nextContent.set(file.path, snapshot.content);
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(8, sources.length) }, () => worker()));
      this.sourceReferences.clear();
      for (const [path, references] of next) this.sourceReferences.set(path, references);
      this.sourceContentReferences.clear();
      for (const [path, references] of nextContent) this.sourceContentReferences.set(path, references);
      const prunedUsage = this.pruneMissingUsage();
      const recordedUsage = this.recordCurrentUsage(next, nextContent);
      const usageChanged = prunedUsage || recordedUsage;
      if (usageChanged) await this.plugin.savePluginData();
      this.initialized = true;
    })().finally(() => {
      this.indexing = undefined;
    });
    return this.indexing;
  }

  private async refreshSource(file: TFile): Promise<void> {
    await this.ensureIndex();
    const previous = this.pendingPreviousReferences.get(file.path)
      ?? this.referencesBeforeRefresh(file.path);
    const previousContent = this.pendingPreviousContentReferences.get(file.path)
      ?? this.referencesBeforeRefresh(file.path, true);
    this.pendingPreviousReferences.delete(file.path);
    this.pendingPreviousContentReferences.delete(file.path);
    const next = await this.readReferenceSnapshot(file);
    if (next.all.size) this.sourceReferences.set(file.path, next.all);
    else this.sourceReferences.delete(file.path);
    if (next.content.size) this.sourceContentReferences.set(file.path, next.content);
    else this.sourceContentReferences.delete(file.path);
    if (this.recordCurrentUsage(this.sourceReferences, this.sourceContentReferences)) await this.plugin.savePluginData();
    if (!this.plugin.settings.enableAttachmentCleanup) return;
    const removed = new Set(Array.from(previous).filter((path) => !next.all.has(path)));
    this.queuePotentialOrphans(removed, "reference-removed");
    const removedFromContent = new Set(Array.from(previousContent).filter((path) => !next.content.has(path)));
    this.queuePotentialOrphans(removedFromContent, "reference-removed", file.path);
  }

  private async readReferenceSnapshot(
    file: TFile,
    attachmentFiles = this.managedAttachments(),
  ): Promise<AttachmentReferenceSnapshot> {
    if (file.extension === "md") {
      const cached = this.cachedMarkdownReferenceSnapshot(file, attachmentFiles);
      if (cached) return cached;
    }
    return this.readReferenceSnapshotFromContent(file, attachmentFiles);
  }

  private async readReferenceSnapshotFromContent(
    file: TFile,
    attachmentFiles = this.managedAttachments(),
  ): Promise<AttachmentReferenceSnapshot> {
    const all = new Set<string>();
    const contentReferences = new Set<string>();
    let content = "";
    try {
      content = await this.plugin.app.vault.cachedRead(file);
    } catch {
      return { all, content: contentReferences };
    }
    for (const target of extractVaultReferenceTargets(content, file.extension)) {
      this.addResolvedTarget(all, file, target, attachmentFiles);
    }
    const visibleContent = file.extension === "md" ? this.withoutFrontmatter(content) : content;
    for (const target of extractVaultReferenceTargets(visibleContent, file.extension)) {
      this.addResolvedTarget(contentReferences, file, target, attachmentFiles);
    }
    return { all, content: contentReferences };
  }

  private cachedMarkdownReferenceSnapshot(
    file: TFile,
    attachmentFiles: TFile[],
  ): AttachmentReferenceSnapshot | null {
    const cache = this.plugin.app.metadataCache.getFileCache(file);
    if (!cache) return null;
    const all = new Set<string>();
    const content = new Set<string>();
    const resolved = this.plugin.app.metadataCache.resolvedLinks[file.path] ?? {};
    for (const target of Object.keys(resolved)) {
      const resolvedFile = this.plugin.app.vault.getAbstractFileByPath(normalizePath(target));
      if (resolvedFile instanceof TFile && isManagedAttachmentPath(resolvedFile.path) && !this.isExcludedPath(resolvedFile.path)) {
        all.add(resolvedFile.path);
      }
    }
    for (const link of cache.frontmatterLinks ?? []) this.addResolvedTarget(all, file, link.link, attachmentFiles);
    for (const embed of cache.embeds ?? []) {
      this.addResolvedTarget(all, file, embed.link, attachmentFiles);
      this.addResolvedTarget(content, file, embed.link, attachmentFiles);
    }
    for (const link of cache.links ?? []) {
      if (isManagedAttachmentPath(link.link.split("#", 1)[0] ?? "")) {
        this.addResolvedTarget(all, file, link.link, attachmentFiles);
        this.addResolvedTarget(content, file, link.link, attachmentFiles);
      }
    }
    return { all, content };
  }

  private withoutFrontmatter(content: string): string {
    if (!content.startsWith("---\n") && !content.startsWith("---\r\n")) return content;
    const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
    return match ? content.slice(match[0].length) : content;
  }

  private addResolvedTarget(result: Set<string>, source: TFile, target: string, attachmentFiles: TFile[]): void {
    const resolved = this.plugin.app.metadataCache.getFirstLinkpathDest(target, source.path);
    if (resolved instanceof TFile && isManagedAttachmentPath(resolved.path) && !this.isExcludedPath(resolved.path)) {
      result.add(resolved.path);
      return;
    }
    const normalizedTarget = normalizePath(target.split("#", 1)[0] ?? target).toLocaleLowerCase();
    const targetName = normalizedTarget.split("/").pop() ?? normalizedTarget;
    const targetStem = targetName.replace(/\.[^.]+$/, "");
    for (const candidate of attachmentFiles) {
      const candidatePath = candidate.path.toLocaleLowerCase();
      const candidateName = candidate.name.toLocaleLowerCase();
      if (candidatePath === normalizedTarget || candidateName === targetName || candidate.basename.toLocaleLowerCase() === targetStem) {
        result.add(candidate.path);
      }
    }
  }

  private managedAttachments(files = this.plugin.app.vault.getFiles()): TFile[] {
    return files.filter((file) => isManagedAttachmentPath(file.path) && !this.isExcludedPath(file.path));
  }

  private isExcludedPath(path: string): boolean {
    if (isAttachmentCleanupExcludedPath(path)) return true;
    return this.plugin.settings.propertySystem.excludedFolders.some((folder) => {
      const normalizedFolder = normalizePath(folder.trim()).replace(/^\/+|\/+$/g, "");
      return Boolean(normalizedFolder) && (path === normalizedFolder || path.startsWith(`${normalizedFolder}/`));
    });
  }

  private referencedPaths(): Set<string> {
    const result = new Set<string>();
    for (const references of this.sourceReferences.values()) {
      for (const path of references) result.add(path);
    }
    return result;
  }

  private orphanCandidates(gracePeriod: number): AttachmentCandidate[] {
    const attachments = this.managedAttachments();
    const createdAt = new Map(attachments.map((file) => [file.path, file.stat.ctime]));
    const orphanPaths = new Set(selectPreviouslyReferencedOrphanPaths(
      attachments.map((file) => file.path),
      this.referencedPaths(),
      new Set(Object.keys(this.plugin.data.attachmentUsage)),
      createdAt,
      Date.now(),
      gracePeriod,
    ));
    return attachments.filter((file) => orphanPaths.has(file.path)).map((file) => ({
      path: file.path,
      name: file.name,
      extension: file.extension.toLowerCase(),
      size: file.stat.size,
      modifiedAt: file.stat.mtime,
    }));
  }

  private async promptIfNowOrphan(
    paths: Iterable<string>,
    reason: AttachmentCleanupReason,
    allowedMetadataSources: ReadonlyMap<string, ReadonlySet<string>>,
  ): Promise<void> {
    const unique = Array.from(new Set(paths));
    if (!unique.length) return;
    await this.rebuildIndex();
    const referenced = this.referencedPaths();
    const candidates = unique.flatMap((path): AttachmentCandidate[] => {
      const metadataSourcePaths = referenced.has(path)
        ? this.metadataOnlySourcePaths(path, allowedMetadataSources.get(path))
        : [];
      if (referenced.has(path) && !metadataSourcePaths) return [];
      const file = this.plugin.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile) || !isManagedAttachmentPath(file.path) || this.isExcludedPath(file.path)) return [];
      return [{
        path: file.path,
        name: file.name,
        extension: file.extension.toLowerCase(),
        size: file.stat.size,
        modifiedAt: file.stat.mtime,
        metadataSourcePaths: metadataSourcePaths ?? undefined,
      }];
    });
    if (candidates.length) {
      const metadataByPath = new Map(candidates.flatMap((candidate) => candidate.metadataSourcePaths?.length
        ? [[candidate.path, new Set(candidate.metadataSourcePaths)] as const]
        : []));
      new AttachmentCleanupModal(this.plugin, candidates, reason, (selected) => this.trash(selected, metadataByPath)).open();
    }
  }

  private queuePotentialOrphans(paths: Iterable<string>, reason: AttachmentCleanupReason, metadataSourcePath?: string): void {
    for (const path of paths) {
      this.pendingPromptPaths.add(path);
      if (metadataSourcePath) {
        const sources = this.pendingMetadataSourcePaths.get(path) ?? new Set<string>();
        sources.add(metadataSourcePath);
        this.pendingMetadataSourcePaths.set(path, sources);
      }
    }
    if (!this.pendingPromptPaths.size) return;
    if (reason === "source-deleted") this.pendingPromptReason = reason;
    if (this.promptScheduled) return;
    this.promptScheduled = true;
    queueMicrotask(() => {
      this.promptScheduled = false;
      const queued = Array.from(this.pendingPromptPaths);
      this.pendingPromptPaths.clear();
      const metadataSources = new Map(this.pendingMetadataSourcePaths);
      this.pendingMetadataSourcePaths.clear();
      const queuedReason = this.pendingPromptReason;
      this.pendingPromptReason = "reference-removed";
      void this.promptIfNowOrphan(queued, queuedReason, metadataSources);
    });
  }

  private async trash(
    paths: string[],
    allowedMetadataSources = new Map<string, ReadonlySet<string>>(),
  ): Promise<{ trashed: number; skipped: number }> {
    await this.rebuildIndex();
    for (const path of paths) {
      const metadataSources = this.metadataOnlySourcePaths(path, allowedMetadataSources.get(path));
      if (metadataSources?.length) await this.removeFrontmatterReferences(metadataSources, path);
    }
    const referenced = this.referencedPaths();
    let trashed = 0;
    let skipped = 0;
    for (const path of paths) {
      const file = this.plugin.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile) || referenced.has(path) || !isManagedAttachmentPath(path) || this.isExcludedPath(path)) {
        skipped += 1;
        continue;
      }
      await this.plugin.app.fileManager.trashFile(file);
      delete this.plugin.data.attachmentUsage[path];
      trashed += 1;
    }
    if (trashed) await this.plugin.savePluginData();
    return { trashed, skipped };
  }

  private metadataOnlySourcePaths(path: string, allowedSources?: ReadonlySet<string>): string[] | null {
    const sourcePaths = Array.from(this.sourceReferences.entries())
      .filter(([, references]) => references.has(path))
      .map(([sourcePath]) => sourcePath);
    if (!sourcePaths.length) return [];
    if (!allowedSources?.size) return null;
    for (const sourcePath of sourcePaths) {
      if (!allowedSources.has(sourcePath) || this.sourceContentReferences.get(sourcePath)?.has(path)) return null;
    }
    return sourcePaths;
  }

  private async removeFrontmatterReferences(sourcePaths: string[], attachmentPath: string): Promise<void> {
    for (const sourcePath of sourcePaths) {
      const file = this.plugin.app.vault.getAbstractFileByPath(sourcePath);
      if (!(file instanceof TFile) || file.extension !== "md") continue;
      await this.plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
        for (const [key, value] of Object.entries(frontmatter)) {
          if (typeof value === "string" && this.isExactFrontmatterAttachmentReference(value, file, attachmentPath)) {
            delete frontmatter[key];
            continue;
          }
          if (!Array.isArray(value)) continue;
          const next = value.filter((item) => (
            typeof item !== "string" || !this.isExactFrontmatterAttachmentReference(item, file, attachmentPath)
          ));
          if (next.length === value.length) continue;
          if (next.length) frontmatter[key] = next;
          else delete frontmatter[key];
        }
      });
      const snapshot = await this.readReferenceSnapshotFromContent(file);
      if (snapshot.all.size) this.sourceReferences.set(sourcePath, snapshot.all);
      else this.sourceReferences.delete(sourcePath);
      if (snapshot.content.size) this.sourceContentReferences.set(sourcePath, snapshot.content);
      else this.sourceContentReferences.delete(sourcePath);
    }
  }

  private isExactFrontmatterAttachmentReference(value: string, source: TFile, attachmentPath: string): boolean {
    const trimmed = value.trim();
    if (!/^!?\[\[[^\]]+\]\]$/.test(trimmed) && !/^!?\[[^\]]*\]\((?:<[^>]+>|[^)]+)\)$/.test(trimmed)) return false;
    const targets = extractVaultReferenceTargets(trimmed, "md");
    const target = targets.length === 1 ? targets[0] : undefined;
    if (!target) return false;
    const resolved = this.plugin.app.metadataCache.getFirstLinkpathDest(target, source.path);
    return resolved instanceof TFile && resolved.path === attachmentPath;
  }

  private historicalReferencesForSource(sourcePath: string, contentOnly = false): Set<string> {
    const result = new Set<string>();
    for (const [attachmentPath, usage] of Object.entries(this.plugin.data.attachmentUsage)) {
      const sourcePaths = contentOnly ? usage.lastContentSourcePaths : usage.lastSourcePaths;
      if (sourcePaths.includes(sourcePath)) result.add(attachmentPath);
    }
    return result;
  }

  private pruneMissingUsage(): boolean {
    let changed = false;
    for (const attachmentPath of Object.keys(this.plugin.data.attachmentUsage)) {
      const file = this.plugin.app.vault.getAbstractFileByPath(attachmentPath);
      if (file instanceof TFile && isManagedAttachmentPath(file.path)) continue;
      delete this.plugin.data.attachmentUsage[attachmentPath];
      changed = true;
    }
    return changed;
  }

  private referencesBeforeRefresh(sourcePath: string, contentOnly = false): Set<string> {
    const current = (contentOnly ? this.sourceContentReferences : this.sourceReferences).get(sourcePath);
    if (current) return new Set(current);
    return this.initialized ? new Set<string>() : this.historicalReferencesForSource(sourcePath, contentOnly);
  }

  private recordCurrentUsage(
    current: ReadonlyMap<string, ReadonlySet<string>>,
    currentContent: ReadonlyMap<string, ReadonlySet<string>>,
  ): boolean {
    const sourcesByAttachment = new Map<string, Set<string>>();
    const contentSourcesByAttachment = new Map<string, Set<string>>();
    for (const [sourcePath, references] of current) {
      for (const attachmentPath of references) {
        const sources = sourcesByAttachment.get(attachmentPath) ?? new Set<string>();
        sources.add(sourcePath);
        sourcesByAttachment.set(attachmentPath, sources);
      }
    }
    for (const [sourcePath, references] of currentContent) {
      for (const attachmentPath of references) {
        const sources = contentSourcesByAttachment.get(attachmentPath) ?? new Set<string>();
        sources.add(sourcePath);
        contentSourcesByAttachment.set(attachmentPath, sources);
      }
    }
    if (!sourcesByAttachment.size) return false;
    const now = Date.now();
    let changed = false;
    for (const [attachmentPath, sources] of sourcesByAttachment) {
      const previous = this.plugin.data.attachmentUsage[attachmentPath];
      const lastSourcePaths = Array.from(sources).sort((left, right) => left.localeCompare(right, "zh-CN"));
      const lastContentSourcePaths = Array.from(contentSourcesByAttachment.get(attachmentPath) ?? [])
        .sort((left, right) => left.localeCompare(right, "zh-CN"));
      if (!previous) {
        this.plugin.data.attachmentUsage[attachmentPath] = {
          firstReferencedAt: now,
          lastReferencedAt: now,
          lastSourcePaths,
          lastContentSourcePaths,
        };
        changed = true;
        continue;
      }
      const sourcesChanged = JSON.stringify(previous.lastSourcePaths) !== JSON.stringify(lastSourcePaths)
        || JSON.stringify(previous.lastContentSourcePaths) !== JSON.stringify(lastContentSourcePaths);
      if (sourcesChanged) {
        previous.lastSourcePaths = lastSourcePaths;
        previous.lastContentSourcePaths = lastContentSourcePaths;
        previous.lastReferencedAt = now;
        changed = true;
      }
    }
    return changed;
  }
}
