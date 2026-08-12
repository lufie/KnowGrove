import { MarkdownView, Modal, Notice, TFile, TFolder, normalizePath, setIcon, type CachedMetadata } from "obsidian";
import type KnowGrovePlugin from "./main";
import {
  extractVaultReferenceTargets,
  attachmentFolderForNote,
  isAttachmentCleanupExcludedByFolders,
  isAttachmentCleanupExcludedPath,
  isAttachmentReferenceSource,
  isManagedAttachmentPath,
  isPathInsideVaultFolder,
  normalizeAttachmentExtensions,
  parentVaultPath,
  selectAttachmentReferenceSourcePaths,
  selectPreviouslyReferencedOrphanPaths,
  shouldPromptForLostAttachmentReference,
  uniqueAttachmentTargetPath,
} from "./attachment-cleanup-core";
export {
  attachmentFolderForNote,
  extractVaultReferenceTargets,
  isAttachmentCleanupExcludedByFolders,
  isAttachmentCleanupExcludedPath,
  isAttachmentReferenceSource,
  isManagedAttachmentPath,
  isPathInsideVaultFolder,
  normalizeAttachmentExtensions,
  parentVaultPath,
  selectAttachmentReferenceSourcePaths,
  selectPreviouslyReferencedOrphanPaths,
  shouldPromptForLostAttachmentReference,
  uniqueAttachmentTargetPath,
} from "./attachment-cleanup-core";

const FULL_SCAN_YIELD_INTERVAL = 10;
const FULL_SCAN_YIELD_DELAY_MS = 4;

export type AttachmentCleanupReason = "reference-removed" | "source-deleted" | "manual" | "daily";

export interface AttachmentCandidate {
  path: string;
  name: string;
  extension: string;
  size: number;
  modifiedAt: number;
  metadataSourcePaths?: string[];
  lastReferencedAt?: number;
  previousSourcePaths?: string[];
}

interface AttachmentReferenceSnapshot {
  all: Set<string>;
  content: Set<string>;
}

export interface AttachmentScanProgress {
  phase: "index" | "consistency";
  processed: number;
  total: number;
}

type AttachmentScanProgressListener = (progress: AttachmentScanProgress) => void;

class AttachmentScanCancelledError extends Error {
  constructor() {
    super("附件检查已停止");
    this.name = "AttachmentScanCancelledError";
  }
}

interface AttachmentLookup {
  byPath: Map<string, TFile[]>;
  byName: Map<string, TFile[]>;
  byStem: Map<string, TFile[]>;
}

interface AttachmentMoveCandidate {
  attachmentPath: string;
  targetPath: string;
  sourcePath: string;
  action: "move" | "copy";
  sharedSourceCount: number;
}

interface BrokenAttachmentReference {
  sourcePath: string;
  target: string;
  matches: string[];
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
      const evidence = [
        candidate.lastReferencedAt ? `上次引用 ${new Date(candidate.lastReferencedAt).toLocaleString()}` : "",
        candidate.previousSourcePaths?.length
          ? `历史来源 ${candidate.previousSourcePaths.slice(0, 2).join("、")}${candidate.previousSourcePaths.length > 2 ? ` 等 ${candidate.previousSourcePaths.length} 篇` : ""}`
          : "",
      ].filter(Boolean).join(" · ");
      if (evidence) copy.createDiv({ cls: "knowgrove-attachment-cleanup-path", text: evidence });
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

class AttachmentMoveModal extends Modal {
  private readonly selected = new Set<number>();

  constructor(
    private readonly plugin: KnowGrovePlugin,
    private readonly candidates: AttachmentMoveCandidate[],
    selectByDefault: boolean,
    private readonly onApply: (candidates: AttachmentMoveCandidate[]) => Promise<void>,
  ) {
    super(plugin.app);
    if (selectByDefault) candidates.forEach((_, index) => this.selected.add(index));
  }

  onOpen(): void {
    this.modalEl.addClass("knowgrove-attachment-cleanup-shell");
    this.render();
  }

  private render(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("knowgrove-attachment-cleanup-modal");
    root.createEl("h2", { text: "附件整理预览" });
    root.createEl("p", {
      cls: "setting-item-description",
      text: "目标目录沿用 Obsidian 的全局附件位置。共享附件只会复制，重名文件会自动使用新名称，不覆盖已有文件。",
    });
    const toolbar = root.createDiv("knowgrove-attachment-cleanup-toolbar");
    toolbar.createSpan({ text: `${this.candidates.length} 项 · 已选择 ${this.selected.size} 项` });
    const selectAll = toolbar.createEl("button", { text: this.selected.size === this.candidates.length ? "取消全选" : "全选" });
    selectAll.addEventListener("click", () => {
      if (this.selected.size === this.candidates.length) this.selected.clear();
      else this.candidates.forEach((_, index) => this.selected.add(index));
      this.render();
    });

    const list = root.createDiv("knowgrove-attachment-cleanup-list");
    this.candidates.forEach((candidate, index) => {
      const row = list.createEl("label", { cls: "knowgrove-attachment-cleanup-row" });
      const checkbox = row.createEl("input", { type: "checkbox" });
      checkbox.checked = this.selected.has(index);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) this.selected.add(index);
        else this.selected.delete(index);
        this.render();
      });
      const icon = row.createSpan("knowgrove-attachment-cleanup-icon");
      setIcon(icon, candidate.action === "copy" ? "copy" : "folder-input");
      const copy = row.createDiv("knowgrove-attachment-cleanup-copy");
      copy.createDiv({ cls: "knowgrove-attachment-cleanup-name", text: candidate.attachmentPath.split("/").pop() ?? candidate.attachmentPath });
      copy.createDiv({ cls: "knowgrove-attachment-cleanup-path", text: `${candidate.attachmentPath} → ${candidate.targetPath}` });
      copy.createDiv({ cls: "knowgrove-attachment-cleanup-path", text: `来源：${candidate.sourcePath}` });
      row.createSpan({
        cls: "knowgrove-attachment-cleanup-meta",
        text: candidate.action === "copy" ? `共享 ${candidate.sharedSourceCount} 篇 · 复制` : "移动",
      });
    });

    const actions = root.createDiv("knowgrove-attachment-cleanup-actions");
    actions.createEl("button", { text: "取消" }).addEventListener("click", () => this.close());
    const apply = actions.createEl("button", { cls: "mod-cta", text: "执行整理" });
    apply.disabled = this.selected.size === 0;
    apply.addEventListener("click", () => {
      apply.disabled = true;
      const selected = this.candidates.filter((_, index) => this.selected.has(index));
      void this.onApply(selected).then(() => this.close()).catch((error) => {
        apply.disabled = false;
        new Notice(`附件整理失败：${error instanceof Error ? error.message : String(error)}`);
      });
    });
  }
}

export class AttachmentCleanupManager {
  private readonly sourceReferences = new Map<string, Set<string>>();
  private readonly sourceContentReferences = new Map<string, Set<string>>();
  private readonly pendingPreviousReferences = new Map<string, Set<string>>();
  private readonly pendingPreviousContentReferences = new Map<string, Set<string>>();
  private readonly deletedSourceSnapshots = new Map<string, AttachmentReferenceSnapshot>();
  private readonly deletedSourceSnapshotTimers = new Map<string, number>();
  private indexing?: Promise<void>;
  private readonly refreshTimers = new Map<string, number>();
  private promptScheduled = false;
  private scanPromise?: Promise<void>;
  private fullScanRunning = false;
  private fullScanCancelRequested = false;
  private pendingPromptReason: AttachmentCleanupReason = "reference-removed";
  private readonly pendingPromptPaths = new Set<string>();
  private readonly pendingMetadataSourcePaths = new Map<string, Set<string>>();
  private extraExtensionCacheKey = "";
  private extraExtensionCache: string[] = [];
  private readonly organizingSources = new Set<string>();

  constructor(private readonly plugin: KnowGrovePlugin) {
    this.loadPersistedIndex();
  }

  private loadPersistedIndex(): void {
    this.sourceReferences.clear();
    this.sourceContentReferences.clear();
    for (const [attachmentPath, usage] of Object.entries(this.plugin.data.attachmentUsage)) {
      if (this.isExcludedPath(attachmentPath)) continue;
      for (const sourcePath of usage.currentSourcePaths ?? usage.lastSourcePaths) {
        if (this.isExcludedPath(sourcePath) || !isAttachmentReferenceSource(sourcePath)) continue;
        const references = this.sourceReferences.get(sourcePath) ?? new Set<string>();
        references.add(attachmentPath);
        this.sourceReferences.set(sourcePath, references);
      }
      for (const sourcePath of usage.currentContentSourcePaths ?? usage.lastContentSourcePaths) {
        if (this.isExcludedPath(sourcePath) || !isAttachmentReferenceSource(sourcePath)) continue;
        const references = this.sourceContentReferences.get(sourcePath) ?? new Set<string>();
        references.add(attachmentPath);
        this.sourceContentReferences.set(sourcePath, references);
      }
    }
  }

  start(): void {
    // The persisted reference history is enough for incremental edit/delete checks.
    // Full-vault indexing is deliberately reserved for explicit manual actions.
  }

  stop(): void {
    this.fullScanCancelRequested = true;
    for (const timer of this.refreshTimers.values()) window.clearTimeout(timer);
    for (const timer of this.deletedSourceSnapshotTimers.values()) window.clearTimeout(timer);
    this.refreshTimers.clear();
    this.deletedSourceSnapshotTimers.clear();
    this.deletedSourceSnapshots.clear();
  }

  configurationChanged(): void {
    this.extraExtensionCacheKey = "";
    this.loadPersistedIndex();
  }

  isFullScanActive(): boolean {
    return this.fullScanRunning;
  }

  cancelFullScan(): boolean {
    if (!this.fullScanRunning) return false;
    this.fullScanCancelRequested = true;
    return true;
  }

  captureSourceBeforeDelete(file: TFile, previousCache: CachedMetadata | null): void {
    if (!isAttachmentReferenceSource(file.path) || this.isExcludedPath(file.path)) return;
    const attachmentLookup = this.createAttachmentLookup([]);
    const snapshot = previousCache
      ? this.referenceSnapshotFromCache(file, previousCache, attachmentLookup, false)
      : { all: new Set<string>(), content: new Set<string>() };
    for (const path of this.referencesBeforeRefresh(file.path)) snapshot.all.add(path);
    for (const path of this.referencesBeforeRefresh(file.path, true)) snapshot.content.add(path);
    if (!snapshot.all.size) return;
    const existingTimer = this.deletedSourceSnapshotTimers.get(file.path);
    if (existingTimer !== undefined) window.clearTimeout(existingTimer);
    this.deletedSourceSnapshots.set(file.path, snapshot);
    this.deletedSourceSnapshotTimers.set(file.path, window.setTimeout(() => {
      this.deletedSourceSnapshots.delete(file.path);
      this.deletedSourceSnapshotTimers.delete(file.path);
    }, 5_000));
  }

  scheduleSourceRefresh(file: TFile): void {
    if (!isAttachmentReferenceSource(file.path) || this.isExcludedPath(file.path)) return;
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
    const timer = this.refreshTimers.get(file.path);
    // MetadataCache emits "changed" for many files while Obsidian builds its own
    // startup cache. Only real vault edits create a timer, and that debounced
    // content read remains the source of truth instead of a potentially stale cache.
    if (timer === undefined) return;
  }

  async handleDelete(file: TFile): Promise<void> {
    const captured = this.deletedSourceSnapshots.get(file.path);
    const capturedTimer = this.deletedSourceSnapshotTimers.get(file.path);
    if (capturedTimer !== undefined) window.clearTimeout(capturedTimer);
    this.deletedSourceSnapshots.delete(file.path);
    this.deletedSourceSnapshotTimers.delete(file.path);
    const previousBeforeIndex = captured?.all ?? (isAttachmentReferenceSource(file.path)
      ? this.referencesBeforeRefresh(file.path)
      : new Set<string>());
    if (this.isManagedAttachment(file.path)) {
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
    if (this.recordCurrentUsage(this.sourceReferences, this.sourceContentReferences)) {
      await this.plugin.savePluginData();
    }
    this.queuePotentialOrphans(previous, "source-deleted");
  }

  async handleRename(file: TFile, oldPath: string): Promise<void> {
    const previousContentReferences = isAttachmentReferenceSource(oldPath)
      ? this.referencesBeforeRefresh(oldPath, true)
      : new Set<string>();
    if (
      file.extension === "md"
      && this.plugin.settings.moveAttachmentsWithNote
      && previousContentReferences.size
    ) {
      const plans = this.buildMovePlansForSource(file, previousContentReferences, oldPath, true);
      await this.executeMovePlans(plans);
    }
    this.sourceReferences.delete(oldPath);
    this.sourceContentReferences.delete(oldPath);
    if (this.isManagedAttachment(oldPath) || this.isManagedAttachment(file.path)) {
      for (const references of this.sourceReferences.values()) {
        if (!references.delete(oldPath)) continue;
        if (this.isManagedAttachment(file.path) && !this.isExcludedPath(file.path)) references.add(file.path);
      }
      for (const references of this.sourceContentReferences.values()) {
        if (!references.delete(oldPath)) continue;
        if (this.isManagedAttachment(file.path) && !this.isExcludedPath(file.path)) references.add(file.path);
      }
      const previousUsage = this.plugin.data.attachmentUsage[oldPath];
      if (previousUsage) {
        this.plugin.data.attachmentUsage[file.path] = previousUsage;
        delete this.plugin.data.attachmentUsage[oldPath];
        await this.plugin.savePluginData();
      }
      return;
    }
    if (isAttachmentReferenceSource(file.path)) this.scheduleSourceRefresh(file);
  }

  async organizeCurrentNote(file: TFile): Promise<void> {
    if (file.extension !== "md") return;
    await this.refreshSource(file, false);
    const candidates = this.buildMovePlansForSource(file, this.referencesBeforeRefresh(file.path, true));
    if (!candidates.length) {
      new Notice("当前笔记的附件已经符合 Obsidian 全局附件位置，或共享附件已按设置跳过");
      return;
    }
    new AttachmentMoveModal(this.plugin, candidates, true, (selected) => this.executeMovePlans(selected, true)).open();
  }

  async organizeAllAttachments(onProgress?: AttachmentScanProgressListener): Promise<void> {
    await this.runFullScan((progress) => this.rebuildIndex(progress), onProgress);
    const candidates: AttachmentMoveCandidate[] = [];
    const reservedTargets = new Set(this.plugin.app.vault.getFiles().map((file) => file.path));
    for (const [sourcePath, references] of this.sourceContentReferences) {
      const source = this.plugin.app.vault.getAbstractFileByPath(sourcePath);
      if (!(source instanceof TFile) || source.extension !== "md" || this.isExcludedPath(source.path)) continue;
      for (const candidate of this.buildMovePlansForSource(source, references, undefined, false, reservedTargets)) {
        candidates.push(candidate);
        reservedTargets.add(candidate.targetPath);
      }
    }
    if (!candidates.length) {
      new Notice("全库附件已经符合 Obsidian 全局附件位置，或共享附件已按设置跳过");
      return;
    }
    new AttachmentMoveModal(this.plugin, candidates, false, (selected) => this.executeMovePlans(selected, true)).open();
  }

  async checkConsistency(onProgress?: AttachmentScanProgressListener): Promise<void> {
    await this.runFullScan(async (progress) => {
      await this.rebuildIndex(progress);
      await this.buildConsistencyReport(progress);
    }, onProgress);
  }

  private async buildConsistencyReport(onProgress?: AttachmentScanProgressListener): Promise<void> {
    const attachments = this.managedAttachments();
    const attachmentLookup = this.createAttachmentLookup(attachments);
    const broken: BrokenAttachmentReference[] = [];
    const sources = this.referenceSources();
    for (const [index, source] of sources.entries()) {
      this.throwIfFullScanCancelled();
      let content = "";
      try {
        content = await this.plugin.app.vault.cachedRead(source);
      } catch {
        continue;
      }
      for (const target of extractVaultReferenceTargets(content, source.extension)) {
        if (!this.isManagedAttachment(target)) continue;
        const resolved = this.plugin.app.metadataCache.getFirstLinkpathDest(target, source.path);
        if (resolved instanceof TFile && this.isManagedAttachment(resolved.path)) continue;
        const targetPath = normalizePath(target.split("#", 1)[0] ?? target).toLocaleLowerCase();
        const targetName = targetPath.split("/").pop() ?? targetPath;
        const matches = Array.from(new Set([
          ...(attachmentLookup.byPath.get(targetPath) ?? []),
          ...(attachmentLookup.byName.get(targetName) ?? []),
        ])).map((file) => file.path);
        broken.push({ sourcePath: source.path, target, matches });
      }
      if ((index + 1) % FULL_SCAN_YIELD_INTERVAL === 0 || index + 1 === sources.length) {
        onProgress?.({ phase: "consistency", processed: index + 1, total: sources.length });
      }
      await this.yieldDuringFullScan(index + 1);
    }

    const shared = Array.from(this.attachmentSources()).filter(([, sourcePaths]) => sourcePaths.length > 1);
    const misplaced: AttachmentMoveCandidate[] = [];
    for (const [sourcePath, references] of this.sourceContentReferences) {
      const source = this.plugin.app.vault.getAbstractFileByPath(sourcePath);
      if (!(source instanceof TFile) || source.extension !== "md") continue;
      misplaced.push(...this.buildMovePlansForSource(source, references));
    }
    const orphaned = this.orphanCandidates(0);
    const report = this.renderConsistencyReport(broken, shared, misplaced, orphaned);
    await this.writeConsistencyReport(report);
    new Notice(`附件与链接检查完成：断链 ${broken.length}，待整理 ${misplaced.length}，共享 ${shared.length}，历史失联 ${orphaned.length}`);
  }

  async scan(manual = true, onProgress?: AttachmentScanProgressListener): Promise<void> {
    if (this.scanPromise) return this.scanPromise;
    this.scanPromise = this.runFullScan((progress) => this.performScan(manual, progress), onProgress).finally(() => {
      this.scanPromise = undefined;
    });
    return this.scanPromise;
  }

  private async performScan(manual: boolean, onProgress?: AttachmentScanProgressListener): Promise<void> {
    await this.rebuildIndex(onProgress);
    const candidates = this.orphanCandidates(0);
    this.plugin.settings.lastAttachmentCleanupScanAt = Date.now();
    await this.plugin.savePluginData();
    if (!candidates.length) {
      if (manual) new Notice("没有发现历史使用后失联的附件");
      return;
    }
    new AttachmentCleanupModal(this.plugin, candidates, manual ? "manual" : "daily", (paths) => this.trash(paths)).open();
  }

  private async runFullScan(
    task: (onProgress?: AttachmentScanProgressListener) => Promise<void>,
    onProgress?: AttachmentScanProgressListener,
  ): Promise<void> {
    if (this.fullScanRunning) throw new Error("已有附件全库检查正在运行");
    this.fullScanRunning = true;
    this.fullScanCancelRequested = false;
    try {
      await task(onProgress);
    } finally {
      this.fullScanRunning = false;
      this.fullScanCancelRequested = false;
    }
  }

  private throwIfFullScanCancelled(): void {
    if (this.fullScanCancelRequested) throw new AttachmentScanCancelledError();
  }

  private async yieldDuringFullScan(processed: number): Promise<void> {
    if (processed % FULL_SCAN_YIELD_INTERVAL !== 0) return;
    await new Promise<void>((resolve) => window.setTimeout(resolve, FULL_SCAN_YIELD_DELAY_MS));
    this.throwIfFullScanCancelled();
  }

  private referenceSources(files = this.plugin.app.vault.getFiles()): TFile[] {
    const excludedFolders = [
      ...this.plugin.settings.propertySystem.excludedFolders,
      ...this.plugin.settings.attachmentCleanupExcludedFolders,
    ];
    const selectedPaths = new Set(selectAttachmentReferenceSourcePaths(
      files.map((file) => file.path),
      excludedFolders,
    ));
    return files.filter((file) => selectedPaths.has(file.path));
  }

  private async rebuildIndex(onProgress?: AttachmentScanProgressListener): Promise<void> {
    if (this.indexing) return this.indexing;
    this.indexing = (async () => {
      const next = new Map<string, Set<string>>();
      const nextContent = new Map<string, Set<string>>();
      const files = this.plugin.app.vault.getFiles();
      const attachmentLookup = this.createAttachmentLookup(this.managedAttachments(files));
      const sources = this.referenceSources(files);
      for (const [index, file] of sources.entries()) {
        this.throwIfFullScanCancelled();
        const snapshot = file.extension === "md"
          ? this.cachedMarkdownReferenceSnapshot(file, attachmentLookup)
            ?? await this.readReferenceSnapshotFromContent(file, attachmentLookup)
          : await this.readReferenceSnapshotFromContent(file, attachmentLookup);
        if (snapshot.all.size) next.set(file.path, snapshot.all);
        if (snapshot.content.size) nextContent.set(file.path, snapshot.content);
        if ((index + 1) % FULL_SCAN_YIELD_INTERVAL === 0 || index + 1 === sources.length) {
          onProgress?.({ phase: "index", processed: index + 1, total: sources.length });
        }
        await this.yieldDuringFullScan(index + 1);
      }
      this.sourceReferences.clear();
      for (const [path, references] of next) this.sourceReferences.set(path, references);
      this.sourceContentReferences.clear();
      for (const [path, references] of nextContent) this.sourceContentReferences.set(path, references);
      const prunedUsage = this.pruneMissingUsage();
      const recordedUsage = this.recordCurrentUsage(next, nextContent);
      const usageChanged = prunedUsage || recordedUsage;
      if (usageChanged) await this.plugin.savePluginData();
    })().finally(() => {
      this.indexing = undefined;
    });
    return this.indexing;
  }

  private async refreshSource(file: TFile, promptForRemoved = true): Promise<void> {
    if (!isAttachmentReferenceSource(file.path) || this.isExcludedPath(file.path)) return;
    const previous = this.pendingPreviousReferences.get(file.path)
      ?? this.referencesBeforeRefresh(file.path);
    const previousContent = this.pendingPreviousContentReferences.get(file.path)
      ?? this.referencesBeforeRefresh(file.path, true);
    this.pendingPreviousReferences.delete(file.path);
    this.pendingPreviousContentReferences.delete(file.path);
    const next = await this.readReferenceSnapshotFromContent(file);
    if (next.all.size) this.sourceReferences.set(file.path, next.all);
    else this.sourceReferences.delete(file.path);
    if (next.content.size) this.sourceContentReferences.set(file.path, next.content);
    else this.sourceContentReferences.delete(file.path);
    if (this.recordCurrentUsage(this.sourceReferences, this.sourceContentReferences)) await this.plugin.savePluginData();
    if (
      file.extension === "md"
      && this.plugin.settings.autoOrganizeAttachments
      && !this.organizingSources.has(file.path)
    ) {
      const plans = this.buildMovePlansForSource(file, next.content);
      if (plans.length) await this.executeMovePlans(plans);
    }
    if (!promptForRemoved || !this.plugin.settings.enableAttachmentCleanup) return;
    const removed = new Set(Array.from(previous).filter((path) => !next.all.has(path)));
    this.queuePotentialOrphans(removed, "reference-removed");
    const removedFromContent = new Set(Array.from(previousContent).filter((path) => !next.content.has(path)));
    this.queuePotentialOrphans(removedFromContent, "reference-removed", file.path);
  }

  private buildMovePlansForSource(
    source: TFile,
    references: Iterable<string>,
    oldSourcePath?: string,
    requireOldFolder = false,
    existingPaths = new Set(this.plugin.app.vault.getFiles().map((file) => file.path)),
  ): AttachmentMoveCandidate[] {
    if (this.isExcludedPath(source.path)) return [];
    const vaultWithConfig = this.plugin.app.vault as typeof this.plugin.app.vault & {
      getConfig?: (key: string) => unknown;
    };
    const configuredFolder = String(vaultWithConfig.getConfig?.("attachmentFolderPath") ?? "/");
    const targetFolder = attachmentFolderForNote(source.path, configuredFolder);
    const oldFolder = parentVaultPath(oldSourcePath ?? source.path);
    const ownerPath = oldSourcePath ?? source.path;
    const sourcesByAttachment = this.attachmentSources();
    const plans: AttachmentMoveCandidate[] = [];
    for (const attachmentPath of new Set(references)) {
      const attachment = this.plugin.app.vault.getAbstractFileByPath(attachmentPath);
      if (!(attachment instanceof TFile) || !this.isManagedAttachment(attachment.path) || this.isExcludedPath(attachment.path)) continue;
      if (parentVaultPath(attachment.path) === targetFolder) continue;
      if (requireOldFolder && !isPathInsideVaultFolder(attachment.path, oldFolder)) continue;
      const sourcePaths = sourcesByAttachment.get(attachment.path) ?? [];
      const otherSources = sourcePaths.filter((path) => path !== ownerPath && path !== source.path);
      const sharedSourceCount = Math.max(sourcePaths.length, otherSources.length + 1);
      const action: "move" | "copy" = otherSources.length ? "copy" : "move";
      if (action === "copy" && this.plugin.settings.sharedAttachmentHandling === "skip") continue;
      const targetPath = uniqueAttachmentTargetPath(targetFolder, attachment.name, existingPaths);
      if (targetPath === attachment.path) continue;
      plans.push({ attachmentPath: attachment.path, targetPath, sourcePath: source.path, action, sharedSourceCount });
      existingPaths.add(targetPath);
    }
    return plans;
  }

  private attachmentSources(): Map<string, string[]> {
    const result = new Map<string, string[]>();
    for (const [sourcePath, references] of this.sourceContentReferences) {
      for (const attachmentPath of references) {
        const sources = result.get(attachmentPath) ?? [];
        sources.push(sourcePath);
        result.set(attachmentPath, sources);
      }
    }
    for (const sources of result.values()) sources.sort((left, right) => left.localeCompare(right, "zh-CN"));
    return result;
  }

  private async executeMovePlans(candidates: AttachmentMoveCandidate[], showNotice = false): Promise<void> {
    if (!candidates.length) return;
    let moved = 0;
    let copied = 0;
    let skipped = 0;
    const touchedSources = new Set<string>();
    for (const candidate of candidates) {
      const attachment = this.plugin.app.vault.getAbstractFileByPath(candidate.attachmentPath);
      const source = this.plugin.app.vault.getAbstractFileByPath(candidate.sourcePath);
      if (!(attachment instanceof TFile) || !(source instanceof TFile) || this.plugin.app.vault.getAbstractFileByPath(candidate.targetPath)) {
        skipped += 1;
        continue;
      }
      await this.ensureFolder(parentVaultPath(candidate.targetPath));
      this.organizingSources.add(source.path);
      try {
        if (candidate.action === "move") {
          await this.plugin.app.fileManager.renameFile(attachment, candidate.targetPath);
          moved += 1;
        } else {
          const data = await this.plugin.app.vault.readBinary(attachment);
          const copiedFile = await this.plugin.app.vault.createBinary(candidate.targetPath, data);
          const changed = await this.rewriteSourceReference(source, attachment, copiedFile);
          if (!changed) {
            await this.plugin.app.fileManager.trashFile(copiedFile);
            skipped += 1;
            continue;
          }
          copied += 1;
          touchedSources.add(source.path);
        }
      } finally {
        this.organizingSources.delete(source.path);
      }
    }
    for (const sourcePath of touchedSources) {
      const source = this.plugin.app.vault.getAbstractFileByPath(sourcePath);
      if (source instanceof TFile) await this.refreshSource(source, false);
    }
    if (showNotice || skipped) new Notice(`附件整理完成：移动 ${moved}，复制 ${copied}，跳过 ${skipped}`);
  }

  private async ensureFolder(path: string): Promise<void> {
    if (!path) return;
    let current = "";
    for (const segment of path.split("/").filter(Boolean)) {
      current = current ? `${current}/${segment}` : segment;
      const existing = this.plugin.app.vault.getAbstractFileByPath(current);
      if (existing instanceof TFolder) continue;
      if (existing) throw new Error(`目标路径不是文件夹：${current}`);
      await this.plugin.app.vault.createFolder(current);
    }
  }

  private async rewriteSourceReference(source: TFile, previous: TFile, next: TFile): Promise<boolean> {
    const cache = this.plugin.app.metadataCache.getFileCache(source);
    if (!cache) return false;
    const references = [...(cache.embeds ?? []), ...(cache.links ?? [])]
      .filter((link) => this.plugin.app.metadataCache.getFirstLinkpathDest(link.link, source.path)?.path === previous.path)
      .filter((link) => Number.isFinite(link.position?.start?.offset) && Number.isFinite(link.position?.end?.offset))
      .sort((left, right) => right.position.start.offset - left.position.start.offset);
    if (!references.length) return false;
    let content = await this.plugin.app.vault.cachedRead(source);
    const linkText = this.plugin.app.metadataCache.fileToLinktext(next, source.path, true);
    for (const reference of references) {
      const start = reference.position.start.offset;
      const end = reference.position.end.offset;
      const original = content.slice(start, end);
      const embed = original.startsWith("!");
      const subpath = reference.link.includes("#") ? `#${reference.link.split("#").slice(1).join("#")}` : "";
      const display = reference.displayText && reference.displayText !== reference.link ? `|${reference.displayText}` : "";
      const replacement = `${embed ? "!" : ""}[[${linkText}${subpath}${display}]]`;
      content = `${content.slice(0, start)}${replacement}${content.slice(end)}`;
    }
    await this.plugin.app.vault.modify(source, content);
    return true;
  }

  private renderConsistencyReport(
    broken: BrokenAttachmentReference[],
    shared: Array<[string, string[]]>,
    misplaced: AttachmentMoveCandidate[],
    orphaned: AttachmentCandidate[],
  ): string {
    const lines = [
      "---",
      "类型: 系统",
      "状态: 已检查",
      `检查时间: ${new Date().toISOString()}`,
      "---",
      "<!-- knowgrove:attachment-consistency-report -->",
      "# 附件与链接检查",
      "",
      `- 断开的附件链接：${broken.length}`,
      `- 位置待整理：${misplaced.length}`,
      `- 多篇笔记共享附件：${shared.length}`,
      `- 历史使用后失联：${orphaned.length}`,
      "",
      "## 断开的附件链接",
      "",
      ...(broken.length ? broken.map((issue) => `- \`${issue.sourcePath}\` → \`${issue.target}\`${issue.matches.length === 1 ? `；唯一候选：\`${issue.matches[0]}\`` : issue.matches.length > 1 ? `；存在 ${issue.matches.length} 个同名候选，未猜测` : "；未找到候选"}`) : ["- 无"]),
      "",
      "## 位置待整理",
      "",
      ...(misplaced.length ? misplaced.map((item) => `- \`${item.attachmentPath}\` → \`${item.targetPath}\`（来源：\`${item.sourcePath}\`）`) : ["- 无"]),
      "",
      "## 共享附件",
      "",
      ...(shared.length ? shared.map(([path, sources]) => `- \`${path}\`：${sources.map((source) => `\`${source}\``).join("、")}`) : ["- 无"]),
      "",
      "## 历史使用后失联",
      "",
      ...(orphaned.length ? orphaned.map((item) => `- \`${item.path}\`；历史来源：${item.previousSourcePaths?.map((source) => `\`${source}\``).join("、") || "未知"}`) : ["- 无"]),
      "",
      "> 此报告只记录问题，不会自动修改或删除文件。请使用“整理当前笔记附件”“整理全库附件”或“检查历史失联附件”预览后执行。",
      "",
    ];
    return lines.join("\n");
  }

  private async writeConsistencyReport(content: string): Promise<void> {
    const path = "_KnowGrove/附件与链接检查.md";
    await this.ensureFolder(parentVaultPath(path));
    const existing = this.plugin.app.vault.getAbstractFileByPath(path);
    let file: TFile;
    if (existing instanceof TFile) {
      await this.plugin.app.vault.modify(existing, content);
      file = existing;
    } else if (existing) {
      throw new Error(`报告路径已被文件夹占用：${path}`);
    } else {
      file = await this.plugin.app.vault.create(path, content);
    }
    const existingLeaf = this.plugin.app.workspace.getLeavesOfType("markdown")
      .find((leaf) => leaf.view instanceof MarkdownView && leaf.view.file?.path === path);
    const leaf = existingLeaf ?? this.plugin.app.workspace.getLeaf(true);
    await leaf.openFile(file);
    this.plugin.app.workspace.setActiveLeaf(leaf, { focus: true });
  }

  private async readReferenceSnapshot(
    file: TFile,
    attachmentLookup = this.createAttachmentLookup([]),
  ): Promise<AttachmentReferenceSnapshot> {
    if (file.extension === "md") {
      const cached = this.cachedMarkdownReferenceSnapshot(file, attachmentLookup);
      if (cached) return cached;
    }
    return this.readReferenceSnapshotFromContent(file, attachmentLookup);
  }

  private async readReferenceSnapshotFromContent(
    file: TFile,
    attachmentLookup = this.createAttachmentLookup(this.managedAttachments()),
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
      this.addResolvedTarget(all, file, target, attachmentLookup);
    }
    const visibleContent = file.extension === "md" ? this.withoutFrontmatter(content) : content;
    for (const target of extractVaultReferenceTargets(visibleContent, file.extension)) {
      this.addResolvedTarget(contentReferences, file, target, attachmentLookup);
    }
    return { all, content: contentReferences };
  }

  private cachedMarkdownReferenceSnapshot(
    file: TFile,
    attachmentLookup: AttachmentLookup,
  ): AttachmentReferenceSnapshot | null {
    const cache = this.plugin.app.metadataCache.getFileCache(file);
    if (!cache) return null;
    return this.referenceSnapshotFromCache(file, cache, attachmentLookup, true);
  }

  private referenceSnapshotFromCache(
    file: TFile,
    cache: CachedMetadata,
    attachmentLookup: AttachmentLookup,
    includeResolvedLinks: boolean,
  ): AttachmentReferenceSnapshot {
    const all = new Set<string>();
    const content = new Set<string>();
    if (includeResolvedLinks) {
      const resolved = this.plugin.app.metadataCache.resolvedLinks[file.path] ?? {};
      for (const target of Object.keys(resolved)) {
        const resolvedFile = this.plugin.app.vault.getAbstractFileByPath(normalizePath(target));
        if (resolvedFile instanceof TFile && this.isManagedAttachment(resolvedFile.path) && !this.isExcludedPath(resolvedFile.path)) {
          all.add(resolvedFile.path);
        }
      }
    }
    for (const link of cache.frontmatterLinks ?? []) this.addResolvedTarget(all, file, link.link, attachmentLookup);
    for (const embed of cache.embeds ?? []) {
      this.addResolvedTarget(all, file, embed.link, attachmentLookup);
      this.addResolvedTarget(content, file, embed.link, attachmentLookup);
    }
    for (const link of cache.links ?? []) {
      this.addResolvedTarget(all, file, link.link, attachmentLookup);
      this.addResolvedTarget(content, file, link.link, attachmentLookup);
    }
    return { all, content };
  }

  private withoutFrontmatter(content: string): string {
    if (!content.startsWith("---\n") && !content.startsWith("---\r\n")) return content;
    const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
    return match ? content.slice(match[0].length) : content;
  }

  private addResolvedTarget(result: Set<string>, source: TFile, target: string, attachmentLookup: AttachmentLookup): void {
    const resolved = this.plugin.app.metadataCache.getFirstLinkpathDest(target, source.path);
    if (resolved instanceof TFile && this.isManagedAttachment(resolved.path) && !this.isExcludedPath(resolved.path)) {
      result.add(resolved.path);
      return;
    }
    const normalizedTarget = normalizePath(target.split("#", 1)[0] ?? target).toLocaleLowerCase();
    const targetName = normalizedTarget.split("/").pop() ?? normalizedTarget;
    const targetStem = targetName.replace(/\.[^.]+$/, "");
    const candidates = new Set([
      ...(attachmentLookup.byPath.get(normalizedTarget) ?? []),
      ...(attachmentLookup.byName.get(targetName) ?? []),
      ...(attachmentLookup.byStem.get(targetStem) ?? []),
    ]);
    for (const candidate of candidates) {
      result.add(candidate.path);
    }
  }

  private createAttachmentLookup(files: TFile[]): AttachmentLookup {
    const lookup: AttachmentLookup = {
      byPath: new Map(),
      byName: new Map(),
      byStem: new Map(),
    };
    const add = (map: Map<string, TFile[]>, key: string, file: TFile): void => {
      const existing = map.get(key);
      if (existing) existing.push(file);
      else map.set(key, [file]);
    };
    for (const file of files) {
      add(lookup.byPath, file.path.toLocaleLowerCase(), file);
      add(lookup.byName, file.name.toLocaleLowerCase(), file);
      add(lookup.byStem, file.basename.toLocaleLowerCase(), file);
    }
    return lookup;
  }

  private managedAttachments(files = this.plugin.app.vault.getFiles()): TFile[] {
    const extraExtensions = this.extraAttachmentExtensions();
    return files.filter((file) => isManagedAttachmentPath(file.path, extraExtensions) && !this.isExcludedPath(file.path));
  }

  private isManagedAttachment(path: string): boolean {
    return isManagedAttachmentPath(path, this.extraAttachmentExtensions());
  }

  private extraAttachmentExtensions(): string[] {
    const values = this.plugin.settings.attachmentCleanupExtraExtensions;
    const key = JSON.stringify(values);
    if (key !== this.extraExtensionCacheKey) {
      this.extraExtensionCacheKey = key;
      this.extraExtensionCache = normalizeAttachmentExtensions(values);
    }
    return this.extraExtensionCache;
  }

  private isExcludedPath(path: string): boolean {
    if (isAttachmentCleanupExcludedPath(path)) return true;
    return isAttachmentCleanupExcludedByFolders(path, [
      ...this.plugin.settings.propertySystem.excludedFolders,
      ...this.plugin.settings.attachmentCleanupExcludedFolders,
    ]);
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
    return attachments.filter((file) => orphanPaths.has(file.path)).map((file) => {
      const usage = this.plugin.data.attachmentUsage[file.path];
      return {
        path: file.path,
        name: file.name,
        extension: file.extension.toLowerCase(),
        size: file.stat.size,
        modifiedAt: file.stat.mtime,
        lastReferencedAt: usage?.lastReferencedAt,
        previousSourcePaths: usage?.lastSourcePaths,
      };
    });
  }

  private async promptIfNowOrphan(
    paths: Iterable<string>,
    reason: AttachmentCleanupReason,
    allowedMetadataSources: ReadonlyMap<string, ReadonlySet<string>>,
  ): Promise<void> {
    const unique = Array.from(new Set(paths));
    if (!unique.length) return;
    const referenced = this.referencedPaths();
    const candidates = unique.flatMap((path): AttachmentCandidate[] => {
      const metadataSourcePaths = referenced.has(path)
        ? this.metadataOnlySourcePaths(path, allowedMetadataSources.get(path))
        : [];
      if (referenced.has(path) && !metadataSourcePaths) return [];
      const file = this.plugin.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile) || !this.isManagedAttachment(file.path) || this.isExcludedPath(file.path)) return [];
      const usage = this.plugin.data.attachmentUsage[file.path];
      return [{
        path: file.path,
        name: file.name,
        extension: file.extension.toLowerCase(),
        size: file.stat.size,
        modifiedAt: file.stat.mtime,
        metadataSourcePaths: metadataSourcePaths ?? undefined,
        lastReferencedAt: usage?.lastReferencedAt,
        previousSourcePaths: usage?.lastSourcePaths,
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
    // Obsidian already owns the destructive confirmation for deleting a whole
    // note and its attachments. Keep the orphan history for a later manual
    // full-vault check, but never stack a second modal or race the same file.
    if ((reason === "reference-removed" || reason === "source-deleted") && !shouldPromptForLostAttachmentReference(reason)) return;
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
    for (const path of paths) {
      const metadataSources = this.metadataOnlySourcePaths(path, allowedMetadataSources.get(path));
      if (metadataSources?.length) await this.removeFrontmatterReferences(metadataSources, path);
    }
    const referenced = this.referencedPaths();
    let trashed = 0;
    let skipped = 0;
    for (const path of paths) {
      const file = this.plugin.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile) || referenced.has(path) || !this.isManagedAttachment(path) || this.isExcludedPath(path)) {
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
      const sourcePaths = contentOnly
        ? usage.currentContentSourcePaths ?? usage.lastContentSourcePaths
        : usage.currentSourcePaths ?? usage.lastSourcePaths;
      if (sourcePaths.includes(sourcePath)) result.add(attachmentPath);
    }
    return result;
  }

  private pruneMissingUsage(): boolean {
    let changed = false;
    for (const attachmentPath of Object.keys(this.plugin.data.attachmentUsage)) {
      const file = this.plugin.app.vault.getAbstractFileByPath(attachmentPath);
      if (file instanceof TFile && this.isManagedAttachment(file.path)) continue;
      delete this.plugin.data.attachmentUsage[attachmentPath];
      changed = true;
    }
    return changed;
  }

  private referencesBeforeRefresh(sourcePath: string, contentOnly = false): Set<string> {
    const current = (contentOnly ? this.sourceContentReferences : this.sourceReferences).get(sourcePath);
    if (current) return new Set(current);
    return this.historicalReferencesForSource(sourcePath, contentOnly);
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
    const now = Date.now();
    let changed = false;
    const attachmentPaths = new Set([
      ...Object.keys(this.plugin.data.attachmentUsage),
      ...sourcesByAttachment.keys(),
    ]);
    for (const attachmentPath of attachmentPaths) {
      const sources = sourcesByAttachment.get(attachmentPath) ?? new Set<string>();
      const previous = this.plugin.data.attachmentUsage[attachmentPath];
      const currentSourcePaths = Array.from(sources).sort((left, right) => left.localeCompare(right, "zh-CN"));
      const currentContentSourcePaths = Array.from(contentSourcesByAttachment.get(attachmentPath) ?? [])
        .sort((left, right) => left.localeCompare(right, "zh-CN"));
      if (!previous) {
        this.plugin.data.attachmentUsage[attachmentPath] = {
          firstReferencedAt: now,
          lastReferencedAt: now,
          currentSourcePaths,
          currentContentSourcePaths,
          lastSourcePaths: currentSourcePaths,
          lastContentSourcePaths: currentContentSourcePaths,
        };
        changed = true;
        continue;
      }
      const currentSourcesChanged = JSON.stringify(previous.currentSourcePaths ?? previous.lastSourcePaths) !== JSON.stringify(currentSourcePaths)
        || JSON.stringify(previous.currentContentSourcePaths ?? previous.lastContentSourcePaths) !== JSON.stringify(currentContentSourcePaths);
      if (currentSourcesChanged) {
        previous.currentSourcePaths = currentSourcePaths;
        previous.currentContentSourcePaths = currentContentSourcePaths;
        if (currentSourcePaths.length) previous.lastSourcePaths = currentSourcePaths;
        if (currentContentSourcePaths.length) previous.lastContentSourcePaths = currentContentSourcePaths;
        if (currentSourcePaths.length) previous.lastReferencedAt = now;
        changed = true;
      } else if (previous.currentSourcePaths === undefined || previous.currentContentSourcePaths === undefined) {
        previous.currentSourcePaths = currentSourcePaths;
        previous.currentContentSourcePaths = currentContentSourcePaths;
        previous.lastReferencedAt = now;
        changed = true;
      }
    }
    return changed;
  }
}
