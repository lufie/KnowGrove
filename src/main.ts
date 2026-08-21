import {
  Editor,
  type EditorPosition,
  FileSystemAdapter,
  MarkdownRenderChild,
  MarkdownRenderer,
  MarkdownView,
  Menu,
  Notice,
  type ObsidianProtocolHandler,
  Platform,
  Plugin,
  TAbstractFile,
  TFile,
  TFolder,
  type WorkspaceLeaf,
  getLanguage,
  getFrontMatterInfo,
  normalizePath,
  parseYaml,
  setIcon,
} from "obsidian";
import { access, copyFile, stat } from "node:fs/promises";
import { basename, isAbsolute, relative, sep } from "node:path";
import { AIPropertyBatchModal } from "./ai-property-modal";
import { AttachmentCleanupManager, normalizeAttachmentExtensions, type AttachmentScanProgress } from "./attachment-cleanup";
import {
  buildAIBatchPropertyPrompt,
  aiManagedDimensions,
  buildAIPropertyPrompt,
  isEmptyPropertyValue,
  parseAIBatchPropertyResponse,
  parseAIPropertyResponse,
  pendingAIManagedDimensions,
} from "./ai-property";
import type { AIBatchPromptItem, AIPropertyGeneration } from "./ai-property";
import {
  AI_SECRET_IDS,
  LEGACY_AI_SECRET_IDS,
  automaticAIContentCharacterLimit,
  detectAIProviders,
  providerName,
  runAIProvider,
} from "./ai-provider";
import { BrowserPairingModal } from "./browser-pairing-modal";
import {
  detectInterruptedCapture,
  detectLinkNoteCandidate,
  isManagedCaptureMarkdown,
  latestLinkNoteScanFiles,
  portableSiblingAssetLinkPath,
  rewriteWikiImageEmbeds,
} from "./browser-capture-core";
import {
  BrowserCaptureServer,
  type BrowserCaptureJob,
  type BrowserCaptureServerStatus,
} from "./browser-capture-server";
import {
  runBrowserProviderWithHandoff,
  type BrowserProviderRunResult,
} from "./browser-provider-handoff";
import {
  DESKTOP_RECORDER_VIEW_TYPE,
  DesktopRecorderView,
  DesktopRecordingOverlay,
  LEGACY_CAPTURE_CENTER_VIEW_TYPE,
  LINK_CAPTURE_VIEW_TYPE,
  LinkCaptureModal,
} from "./capture-center-view";
import {
  batchCaptureFileStem,
  buildBatchLinkNote,
  buildDesktopRecordingNote,
  buildLocalMediaImportNote,
  extractBatchCaptureUrls,
  localMediaImportTitle,
  localMediaImportType,
  safeLocalMediaImportFileName,
  type DesktopRecordingManifest,
  type DesktopRecordingSnapshot,
  type LocalMediaImportProgress,
} from "./capture-center-core";
import { DesktopRecorderController } from "./desktop-recorder";
import {
  inspectExternalMarkdownOpener,
  installExternalMarkdownOpener,
  restorePreviousMarkdownHandler,
  updateExternalMarkdownOpenerConfiguration,
  type ExternalMarkdownOpenerInstallOptions,
  type ExternalMarkdownOpenerStatus,
} from "./external-markdown-opener";
import {
  createBlockDragEditorExtension,
  createCommentEditorExtension,
  refreshCommentEditorDecorations,
} from "./editor-extension";
import { createWordLikeEditingExtension } from "./word-like-editing";
import {
  findMarkdownBlockRange,
  formatBlockEmbedInsertion,
  parseObsidianBlockEmbedSource,
  KNOWGROVE_BLOCK_DRAG_MIME,
  renderObsidianBlockEmbed,
  stripOwnBlockAnchor,
  type BlockDragPayload,
} from "./block-drag";
import {
  cleanMarkdownBlankLines,
} from "./blank-line-cleanup";
import { DocumentAnchorManager } from "./document-anchor-navigator";
import {
  KNOWGROVE_ROOT,
  LEGACY_READING_VIEW_TYPE,
  LEGACY_PLUGIN_ID,
  LEGACY_REFERENCE_PREFIX,
  LEGACY_ROOT,
  isLegacyResearchSourceStatePath,
  legacyResearchSourceStatePath,
  migrateLegacyBrandValue,
  migrateLegacyManagedContent,
  migrateLegacyResearchSourceStatePath,
} from "./brand-migration";
import {
  buildKnowledgeResearchTopicBase,
  buildKnowledgeResearchTopicNote,
  buildKnowledgeThemeBase,
  buildKnowledgeThemeNote,
  buildKnowledgeThemes,
  buildThemePlanningPrompt,
  buildResearchTopicPlanningPrompt,
  buildThemeSynthesisRepairPrompt,
  buildThemeSynthesisPrompt,
  ensureThemeDimensionHeadings,
  ensureResearchTopicActions,
  isManagedKnowledgeThemeBase,
  mergeThemeSynthesis,
  migrateKnowledgeThemeDomains,
  knowledgeNamesMatch,
  normalizeKnowledgeNameKey,
  normalizeKnowledgeTopic,
  parseThemePlanningResponse,
  parseThemeSynthesisResponse,
  rankThemeSourceCandidates,
  rankResearchTopicSourceCandidates,
  removeKnowledgeTopicPropertyValues,
  renameKnowledgeThemePropertyValues,
  renameRawKnowledgeTopicPropertyValues,
  researchTopicKeywords,
  RESEARCH_TOPIC_WORKSPACE_ROOT,
  researchTopicWorkspacePaths,
  safeTopicFileName,
  TOPIC_WORKSPACE_ROOT,
  topicWorkspacePaths,
  type ThemeSynthesisPromptSource,
} from "./knowledge-cycle";
import {
  buildKnowledgeWorkspaceBase,
  buildKnowledgeWorkspaceNote,
  buildKnowledgeWorkspaces,
  buildWorkspacePlanningPrompt,
  isManagedKnowledgeWorkspaceBase,
  KNOWLEDGE_WORKSPACE_ROOT,
  knowledgeWorkspacePaths,
  rankWorkspaceSourceCandidates,
} from "./knowledge-workspace";
import {
  findManagedReferenceIdNearOffset,
  insertManagedReference,
  removeManagedReference,
  renderManagedReference,
  replaceManagedReference,
} from "./reference-format";
import type { ReferenceDraft } from "./reference-modals";
import { COMMENTS_VIEW_TYPE, CommentsSidebarView } from "./comment-sidebar";
import { READING_VIEW_TYPE, ReadingListView } from "./reading-view";
import { TOPIC_INDEX_VIEW_TYPE, TopicIndexView } from "./topic-index-view";
import {
  finishDelayMilliseconds,
  hasRecentEditorActivity,
  isAtReadingEnd,
  isDocumentEndVisible,
} from "./reading-progress";
import { isRecentDocumentPath, selectRecentDocumentPaths } from "./recent-files";
import {
  captureReferenceSourceContext,
  locateReferenceSelection,
  repairReferenceAnchor,
} from "./reference-repair";
import { KnowGroveSettingTab } from "./settings";
import { installKnowGroveLocalization, setKnowGroveLanguage } from "./i18n";
import { KnowGroveRuntimeManager, type RuntimeInstallProgress } from "./runtime-manager";
import {
  formatRuntimeBytes,
  shouldAutoConfigureRuntime,
  type KnowGroveRuntimeAudit,
} from "./runtime-core";
import type { BrowserCapturePageType } from "./browser-capture-core";
import { getSelectionAnchorRect, positionSelectionCommentButton } from "./selection-comment-position";
import { PropertyAuditModal } from "./property-audit-modal";
import { PropertyIssueModal } from "./property-issue-modal";
import { ThemeSynthesisModal } from "./theme-synthesis-modal";
import { ResearchOutputModal } from "./research-output-modal";
import { ResearchSourceScreeningModal } from "./research-source-screening-modal";
import {
  ChannelDerivativeModal,
  CreationConfirmModal,
  CreationRewriteModal,
  CreationVersionPreviewModal,
} from "./creation-studio-modal";
import {
  CREATION_ASSISTANT_VIEW_TYPE,
  CreationAssistantView,
} from "./creation-assistant-view";
import {
  CREATION_IMAGE_SECRET_ID,
  generateCreationImage,
} from "./image-provider";
import {
  buildResearchSourceScreeningPrompt,
  ensureResearchSourceBrowser,
  normalizeResearchSourcePath,
  normalizeResearchSourceState,
  parseResearchSourceScreeningResponse,
  researchSourceStatePath,
  type ResearchSourceDecision,
  type ResearchSourceState,
} from "./research-sources";
import {
  batchResearchOutputChunks,
  buildChannelDerivativeNote,
  buildChannelDerivativePrompt,
  buildResearchEvidencePrompt,
  buildResearchEvidenceAuditPrompt,
  buildResearchRewritePrompt,
  buildResearchOutputNote,
  buildResearchOutputPlanPrompt,
  buildResearchOutputPrompt,
  buildResearchOutputState,
  chunkResearchOutputSources,
  findMarkdownSection,
  getResearchOutputPreset,
  mergeResearchEvidenceDigests,
  normalizeResearchOutput,
  normalizeResearchOutputState,
  parseResearchEvidenceAuditResponse,
  parseResearchEvidenceResponse,
  parseResearchOutputPlanResponse,
  researchOutputStatePath,
  type ResearchOutputDraft,
  type ResearchEvidenceAuditClaim,
  type ResearchOutputImageAsset,
  type ResearchOutputPlan,
  type ResearchOutputPresetId,
  type ResearchOutputSource,
  type ResearchOutputState,
  type ResearchRewriteAction,
} from "./research-output";
import {
  CreateKnowledgeResearchTopicModal,
  CreateKnowledgeThemeModal,
  KnowledgeResearchTopicManagerModal,
  KnowledgeThemeManagerModal,
  RenameKnowledgeNodeModal,
} from "./knowledge-theme-modal";
import {
  CreateKnowledgeWorkspaceModal,
  KnowledgeWorkspaceManagerModal,
  type KnowledgeWorkspaceDraft,
} from "./knowledge-workspace-modal";
import {
  analyzePropertyInventory,
  applyOperation,
  auditPropertySnapshots,
  buildPropertyBase,
  countPropertyFlowSnapshots,
  initializeTrackedNoteFrontmatter,
  isManagedPropertyBaseContent,
  isPropertyGovernedPath,
  localDateFromTimestamp,
  normalizePropertyDimensions,
  operationStillApplies,
  PROPERTY_BASE_MANAGED_MARKER,
  PROPERTY_RULE_SCHEMA_VERSION,
  shouldInitializeTrackedNote,
} from "./property-system";
import {
  applyTaxonomyToDimensions,
  buildAITaxonomyPrompt,
  domainPaths,
  normalizePropertyTaxonomy,
  parseAITaxonomyResponse,
  parseDomainPaths,
} from "./property-taxonomy";
import {
  PROPERTY_WORKBENCH_VIEW_TYPE,
  PropertyWorkbenchView,
} from "./property-workbench";
import {
  createDefaultSettings,
  normalizeAIProviderId,
  type AIPropertyRunState,
  type AIProviderAvailability,
  type AIProviderId,
  type CommentSelectionDraft,
  type KnowledgeThemeDocument,
  type KnowledgeResearchTopicSummary,
  type KnowledgeWorkspaceSummary,
  type KnowledgeWorkspaceType,
  type KnowledgeThemeSummary,
  type PropertyAudit,
  type PropertyAuditChange,
  type PropertyCaptureStatus,
  type PropertyDimensionConfig,
  type PropertyNoteSnapshot,
  type PropertyAIRepairPreview,
  type PropertySystemSettings,
  type PropertyTaxonomyProposal,
  type PropertyWorkspaceSnapshot,
  type ThemeSynthesisProposal,
  type ThemePlanningProposal,
  type KnowGroveData,
  type KnowGroveSettings,
  type ReferenceRecord,
} from "./types";
import { TableResizer } from "./table-resizer";
import { ImageLayoutEnhancer } from "./image-layout-enhancer";

const NEW_NOTE_SETTLE_MILLISECONDS = 650;
const NEW_NOTE_IMPORT_WINDOW_MILLISECONDS = 15_000;
const AI_BATCH_SIZE = 12;
const AI_BATCH_CONCURRENCY = 3;
const AI_BATCH_BODY_CHARACTERS = 3_000;
const AI_BATCH_RETRY_LIMIT = 2;

function makeId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${timestamp}-${random}`;
}

function stringValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return typeof value === "string" ? [value] : [];
}

function orderedPositions(editor: Editor): { from: EditorPosition; to: EditorPosition } {
  const from = editor.getCursor("from");
  const to = editor.getCursor("to");
  return editor.posToOffset(from) <= editor.posToOffset(to) ? { from, to } : { from: to, to: from };
}

interface ReferenceRepairSummary {
  checked: number;
  healthy: number;
  repaired: number;
  unresolved: number;
  missingSource: number;
  recoveredFromContext: number;
}

interface PendingNewNoteInitialization {
  timer?: number;
  cleanupTimer?: number;
  initializing: boolean;
  ignoreModifyUntil: number;
}

interface AIEnrichmentResult {
  applied: number;
  frontmatter: Record<string, unknown>;
  confidence?: number;
  reason?: string;
}

interface AIBatchContext extends AIBatchPromptItem {
  file: TFile;
}

const CURRENT_UI_MIGRATION_VERSION = 1;
const CURRENT_MAINTENANCE_MIGRATION_VERSION = 1;

function emptyRepairSummary(): ReferenceRepairSummary {
  return { checked: 0, healthy: 0, repaired: 0, unresolved: 0, missingSource: 0, recoveredFromContext: 0 };
}

function mergeRepairSummary(target: ReferenceRepairSummary, source: ReferenceRepairSummary): void {
  target.checked += source.checked;
  target.healthy += source.healthy;
  target.repaired += source.repaired;
  target.unresolved += source.unresolved;
  target.missingSource += source.missingSource;
  target.recoveredFromContext += source.recoveredFromContext;
}

export default class KnowGrovePlugin extends Plugin {
  data: KnowGroveData = {
    schemaVersion: PROPERTY_RULE_SCHEMA_VERSION,
    uiMigrationVersion: 0,
    maintenanceMigrationVersion: CURRENT_MAINTENANCE_MIGRATION_VERSION,
    settings: createDefaultSettings(),
    references: {},
    attachmentUsage: {},
  };
  settings: KnowGroveSettings = createDefaultSettings();
  private tooltipEl?: HTMLElement;
  private tooltipHideTimer?: number;
  private refreshTimer?: number;
  private autoCompletionTimer?: number;
  private referenceRepairTimer?: number;
  private completionCandidate?: { path: string; mode: "source" | "preview" };
  private selectionActionBar?: HTMLDivElement;
  private selectionCommentDraft?: CommentSelectionDraft;
  private selectionDragPointerActive = false;
  private activeBlockDrag?: BlockDragPayload;
  private blockEmbedObserver?: MutationObserver;
  private blockEmbedHydrationTimer?: number;
  private readonly blockEmbedRenderChildren = new Map<HTMLElement, MarkdownRenderChild>();
  private readonly lastEditorChangeAt = new Map<string, number>();
  private readonly pendingReferenceRepairPaths = new Set<string>();
  private readonly repairingSourcePaths = new Set<string>();
  private readonly pendingNewNoteInitializations = new Map<string, PendingNewNoteInitialization>();
  private readingViewActivation?: Promise<void>;
  private topicIndexActivation?: Promise<void>;
  private topicIndexRibbonEl?: HTMLElement;
  private propertyWorkbenchActivation?: Promise<void>;
  private creationAssistantActivation?: Promise<CreationAssistantView | null>;
  private coreSidebarMaintenanceTimer?: number;
  private recentFilesRenderTimer?: number;
  private recentFilesObserver?: MutationObserver;
  private recentFilesObserverTarget?: HTMLElement;
  private recentFilesCollapsed = false;
  private renderingRecentFiles = false;
  private latestPropertyCapture?: PropertyCaptureStatus;
  private aiProviderAvailability?: AIProviderAvailability[];
  private aiDetectionPromise?: Promise<AIProviderAvailability[]>;
  private aiRunState: AIPropertyRunState = {
    running: false,
    total: 0,
    completed: 0,
    failed: 0,
    message: "等待 AI 属性任务",
  };
  private aiBatchCancelRequested = false;
  private browserCaptureServer?: BrowserCaptureServer;
  private desktopRecorder?: DesktopRecorderController;
  private recordingOverlay?: DesktopRecordingOverlay;
  private linkCaptureModal?: LinkCaptureModal;
  private captureViewCleanupTimer?: number;
  private recordingUiUnsubscribe?: () => void;
  private runtimeManager?: KnowGroveRuntimeManager;
  private runtimeInstallPromise?: Promise<void>;
  private runtimeBootstrapPromise?: Promise<void>;
  private startupRuntimeBootstrapTimer?: number;
  private latestRuntimeInstallProgress?: RuntimeInstallProgress;
  private readonly runtimeInstallProgressListeners = new Set<(progress: RuntimeInstallProgress) => void>();
  private linkNoteScanPromise?: Promise<number>;
  private startupLinkNoteScanTimer?: number;
  private readonly automaticLinkNoteTimers = new Map<string, number>();
  private attachmentCleanupManager?: AttachmentCleanupManager;
  private documentAnchorManager?: DocumentAnchorManager;
  private tableResizer?: TableResizer;
  private imageLayoutEnhancer?: ImageLayoutEnhancer;
  private disposeLocalization?: () => void;
  private readonly normalizingCaptureImageLinks = new Set<string>();
  private readonly normalizedCaptureImageLinkMtime = new Map<string, number>();

  async onload(): Promise<void> {
    await this.loadPluginData();
    if (Platform.isDesktopApp) {
      await this.syncExternalMarkdownOpenerConfiguration().catch((error) => {
        console.error("KnowGrove: failed to refresh Markdown opener configuration", error);
      });
    }
    setKnowGroveLanguage(getLanguage());
    this.disposeLocalization = installKnowGroveLocalization(this.app.workspace.containerEl.ownerDocument);
    this.register(() => this.disposeLocalization?.());
    this.runtimeManager = new KnowGroveRuntimeManager({
      getRuntimeSettings: () => this.settings.runtime,
      getCaptureSettings: () => this.settings.browserCapture,
      getPluginVersion: () => this.manifest.version,
      saveSettings: () => this.savePluginData(),
    });
    this.browserCaptureServer = new BrowserCaptureServer({
      app: this.app,
      getSettings: () => this.settings,
      saveSettings: () => this.savePluginData(),
      getProviders: (force) => this.getAIProviders(force),
      runProvider: (provider, prompt, signal) => this.runBrowserCaptureProvider(provider, prompt, signal),
      getSkillInstruction: (pageType) => this.getRuntimeSkillInstruction(pageType),
      suppressNewNoteInitialization: (path) => this.clearPendingNewNoteInitialization(path),
      suppressAutomaticLinkNote: (path) => this.cancelAutomaticLinkNote(path),
      enrichCapturedFile: (file) => this.ensureNewNoteStatus(file),
    });
    this.desktopRecorder = new DesktopRecorderController({
      app: this.app,
      getRecordingFolder: () => this.desktopRecordingFolder(),
      getFfmpegPath: () => this.settings.browserCapture.ffmpegPath,
      onRecordingFinalized: (manifest, audioPath) => this.finalizeDesktopRecording(manifest, audioPath),
    });
    this.recordingOverlay = new DesktopRecordingOverlay(this);
    if (Platform.isDesktopApp) {
      await this.desktopRecorder.initialize().catch((error) => {
        console.error("KnowGrove: failed to restore desktop recording session", error);
      });
      this.recordingUiUnsubscribe = this.desktopRecorder.subscribe(() => this.syncRecordingOverlay());
      this.register(() => this.recordingUiUnsubscribe?.());
    }
    this.attachmentCleanupManager = new AttachmentCleanupManager(this);
    this.documentAnchorManager = new DocumentAnchorManager(this);
    this.tableResizer = new TableResizer(this);
    this.imageLayoutEnhancer = new ImageLayoutEnhancer(this);
    this.app.workspace.onLayoutReady(() => this.documentAnchorManager?.refreshAll());
    this.registerKnowGroveProtocolHandler("knowgrove-browser-pair", (params) => {
      const nonce = typeof params.nonce === "string" ? params.nonce : "";
      if (!nonce || !this.browserCaptureServer) {
        new Notice("浏览器配对请求无效或已过期");
        return;
      }
      new BrowserPairingModal(this.app, () => {
        const approved = this.browserCaptureServer?.approvePairing(nonce) ?? false;
        new Notice(approved ? "浏览器已连接 KnowGrove" : "浏览器配对请求已过期，请重新发起");
        return approved;
      }).open();
    });
    this.registerKnowGroveProtocolHandler("knowgrove-settings", (params) => {
      const section = typeof params.section === "string" ? params.section : "";
      this.openKnowGroveSettings(section);
    });
    if (Platform.isDesktopApp && this.settings.browserCapture.enabled) {
      void this.browserCaptureServer.start().catch((error) => {
        console.error("KnowGrove: failed to start browser capture server", error);
        new Notice(`浏览器接收未启动：${error instanceof Error ? error.message : String(error)}`);
      });
    }
    if (Platform.isDesktopApp && this.settings.runtime.mode !== "existing") {
      this.startupRuntimeBootstrapTimer = window.setTimeout(
        () => void this.ensureRuntimeEnvironmentOnStartup(),
        800,
      );
      this.register(() => window.clearTimeout(this.startupRuntimeBootstrapTimer));
    }
    if (Platform.isDesktopApp && this.settings.browserCapture.autoProcessLinkNotes) {
      this.startupLinkNoteScanTimer = window.setTimeout(
        () => void this.ensureRuntimeEnvironmentOnStartup()
          .then(() => this.scanPendingLinkNotes(false)),
        1_800,
      );
      this.register(() => window.clearTimeout(this.startupLinkNoteScanTimer));
    }

    this.registerView(READING_VIEW_TYPE, (leaf) => new ReadingListView(leaf, this));
    this.registerView(LEGACY_READING_VIEW_TYPE, (leaf) => new ReadingListView(leaf, this, LEGACY_READING_VIEW_TYPE));
    this.registerView(COMMENTS_VIEW_TYPE, (leaf) => new CommentsSidebarView(leaf, this));
    this.registerView(TOPIC_INDEX_VIEW_TYPE, (leaf) => new TopicIndexView(leaf, this));
    this.registerView(PROPERTY_WORKBENCH_VIEW_TYPE, (leaf) => new PropertyWorkbenchView(leaf, this));
    this.registerView(CREATION_ASSISTANT_VIEW_TYPE, (leaf) => new CreationAssistantView(leaf, this));
    this.registerView(DESKTOP_RECORDER_VIEW_TYPE, (leaf) => new DesktopRecorderView(leaf, this));
    this.removeDeprecatedCaptureViews();
    this.captureViewCleanupTimer = window.setTimeout(
      () => this.removeDeprecatedCaptureViews(),
      500,
    );
    this.register(() => window.clearTimeout(this.captureViewCleanupTimer));
    this.addRibbonIcon("library-big", "打开阅读列表", () => void this.activateReadingView());
    this.topicIndexRibbonEl = this.addRibbonIcon("list-tree", "打开主题", () => void this.activateTopicIndex());
    this.syncTopicIndexAvailability();
    this.addRibbonIcon("database-zap", "打开工作台", () => void this.activatePropertyWorkbench());
    this.addRibbonIcon("link-2", "批量存链接", () => void this.activateLinkCapture());
    this.addRibbonIcon("mic", "打开录音", () => void this.activateDesktopRecorder());
    this.addRibbonIcon("wand-sparkles", "整理新链接文档", () => void this.scanPendingLinkNotes(true));
    this.addSettingTab(new KnowGroveSettingTab(this.app, this));
    this.registerEditorExtension(createCommentEditorExtension(this));
    this.registerEditorExtension(createBlockDragEditorExtension(this));
    this.registerEditorExtension(createWordLikeEditingExtension(this));
    this.registerMarkdownPostProcessor((el, context) => this.decorateReadingView(el, context.sourcePath));
    this.registerMarkdownCodeBlockProcessor("knowgrove-research-actions", (_source, el, context) => {
      this.renderResearchTopicActions(el, context.sourcePath);
    });
    this.registerMarkdownCodeBlockProcessor("knowgrove-research-sources", (_source, el, context) => {
      void this.renderResearchTopicSources(el, context.sourcePath);
    });
    this.app.workspace.onLayoutReady(() => {
      void this.runStartupMigrations();
      this.attachmentCleanupManager?.start();
      this.scheduleCoreSidebarMaintenance(600);
      this.scheduleRecentFilesSection(650);
      const activeFile = this.app.workspace.getActiveFile();
      if (activeFile) void this.normalizeCapturedImageLinks(activeFile);
    });
    this.registerEvent(this.app.workspace.on("layout-change", () => {
      this.scheduleCoreSidebarMaintenance();
      this.scheduleRecentFilesSection();
      this.syncRecordingOverlay();
      const activeFile = this.app.workspace.getActiveFile();
      if (activeFile) void this.normalizeCapturedImageLinks(activeFile);
    }));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.syncRecordingOverlay()));
    this.register(() => window.clearTimeout(this.coreSidebarMaintenanceTimer));
    this.register(() => window.clearTimeout(this.recentFilesRenderTimer));
    this.initializeSelectionCommentButton();
    this.initializeBlockEmbedFallback();
    this.registerDomEvent(
      this.app.workspace.containerEl.ownerDocument,
      "selectionchange",
      () => this.updateSelectionCommentButton(),
    );
    this.registerDomEvent(this.app.workspace.containerEl, "scroll", (event) => this.handleReadingScroll(event), {
      capture: true,
      passive: true,
    });
    this.registerDomEvent(this.app.workspace.containerEl, "pointerdown", (event) => this.handleReadingInteraction(event), {
      capture: true,
      passive: true,
    });

    this.addCommand({
      id: "open-reading-list",
      name: "打开阅读列表",
      callback: () => void this.activateReadingView(),
    });
    this.addCommand({
      id: "open-property-workbench",
      name: "打开工作台",
      callback: () => void this.activatePropertyWorkbench(),
    });
    this.addCommand({
      id: "open-topic-index",
      name: "打开主题",
      callback: () => void this.activateTopicIndex(),
    });
    this.addCommand({
      id: "open-capture-center",
      name: "批量存链接",
      callback: () => void this.activateLinkCapture(),
    });
    this.addCommand({
      id: "start-desktop-recording",
      name: "打开录音",
      callback: () => void this.activateDesktopRecorder(),
    });
    this.addCommand({
      id: "check-runtime-environment",
      name: "检查运行环境",
      callback: () => {
        this.openKnowGroveSettings("runtime");
      },
    });
    this.addCommand({
      id: "configure-runtime-environment",
      name: "自动配置整理组件",
      callback: () => {
        const progressNotice = new Notice("正在检查整理组件…", 0);
        void this.installRuntimeEnvironment((progress) => {
          progressNotice.setMessage(progress.message);
        }).then(() => {
          progressNotice.hide();
          new Notice("自动整理组件已配置");
        }).catch((error) => {
          progressNotice.hide();
          const message = error instanceof Error ? error.message : String(error);
          new Notice(`自动配置失败：${message}`);
        });
      },
    });
    this.addCommand({
      id: "generate-property-base",
      name: "生成并打开属性工作流 Base",
      callback: () => void this.ensureAndOpenPropertyBase(),
    });
    this.addCommand({
      id: "ai-fill-missing-properties",
      name: "AI 补齐所有笔记的缺失属性",
      callback: () => void this.openAIPropertyBatch(),
    });
    this.addCommand({
      id: "ai-stop-property-batch",
      name: "停止 AI 属性批处理",
      checkCallback: (checking) => {
        if (!this.aiRunState.running) return false;
        if (!checking) this.stopAIPropertyBatch();
        return true;
      },
    });
    this.addCommand({
      id: "ai-refresh-current-note",
      name: "AI 刷新当前笔记属性",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        if (!checking) void this.refreshCurrentNoteAIProperties(file);
        return true;
      },
    });
    this.addCommand({
      id: "mark-current-note-reading",
      name: `将当前笔记标为${this.settings.readingStatus}`,
      checkCallback: (checking) => this.withActiveTrackedFile(checking, (file) => this.setReadingStatus(file, this.settings.readingStatus)),
    });
    this.addCommand({
      id: "mark-current-note-finished",
      name: `将当前笔记标为${this.settings.finishedStatus}`,
      checkCallback: (checking) => this.withActiveTrackedFile(checking, (file) => this.setReadingStatus(file, this.settings.finishedStatus)),
    });
    this.addCommand({
      id: "comment-and-reference-selection",
      name: "评论并引用选中内容",
      editorCheckCallback: (checking, editor, context) => {
        if (!this.settings.enableComments
          || !(context instanceof MarkdownView)
          || !context.file
          || !editor.getSelection().trim()) return false;
        if (!checking) void this.openCommentSidebarForSelection(editor, context);
        return true;
      },
    });
    this.addCommand({
      id: "edit-comment-at-cursor",
      name: "编辑光标处的评论",
      editorCheckCallback: (checking, editor, context) => {
        if (!this.settings.enableComments) return false;
        if (!(context instanceof MarkdownView) || !context.file) return false;
        const record = this.findReferenceAtCursor(editor, context.file);
        if (!record) return false;
        if (!checking) void this.openCommentSidebarForRecord(record);
        return true;
      },
    });
    this.addCommand({
      id: "open-current-note-comments",
      name: "打开当前文档评论侧边栏",
      checkCallback: (checking) => {
        if (!this.settings.enableComments) return false;
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        if (!checking) void this.openCommentSidebarForDocument(file.path);
        return true;
      },
    });
    this.addCommand({
      id: "open-creation-assistant",
      name: "打开创作助手",
      callback: () => void this.activateCreationAssistant(this.app.workspace.getActiveFile()?.path),
    });
    this.addCommand({
      id: "ai-edit-selection",
      name: "AI 编辑选中内容",
      editorCheckCallback: (checking, editor, context) => {
        if (!(context instanceof MarkdownView) || !context.file || !editor.getSelection().trim()) return false;
        if (!checking) this.openCreationRewrite(editor, context);
        return true;
      },
    });
    this.addCommand({
      id: "initialize-unclassified-notes",
      name: `将跟踪文件夹中未分类笔记标为${this.settings.readingStatus}`,
      callback: () => void this.initializeUnclassifiedNotes(),
    });
    this.addCommand({
      id: "check-and-repair-references",
      name: "检查并修复评论引用",
      callback: () => void this.repairAllReferenceAnchors(true),
    });
    this.addCommand({
      id: "parse-current-link-note",
      name: "解析当前链接笔记",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!Platform.isDesktopApp || !file || file.extension !== "md") return false;
        if (!checking) void this.parseLinkNote(file, "manual");
        return true;
      },
    });
    this.addCommand({
      id: "organize-new-link-notes",
      name: "整理新链接文档",
      callback: () => void this.scanPendingLinkNotes(true),
    });
    this.addCommand({
      id: "scan-unreferenced-attachments",
      name: "检查历史失联附件",
      callback: () => void this.scanUnreferencedAttachments(),
    });
    this.addCommand({
      id: "check-attachment-link-consistency",
      name: "检查附件与链接一致性",
      callback: () => void this.checkAttachmentLinkConsistency(),
    });
    this.addCommand({
      id: "stop-attachment-full-scan",
      name: "停止附件全库检查",
      checkCallback: (checking) => {
        const manager = this.attachmentCleanupManager;
        if (!manager?.isFullScanActive()) return false;
        if (!checking && manager.cancelFullScan()) new Notice("正在停止附件检查…");
        return true;
      },
    });
    this.addCommand({
      id: "organize-current-note-attachments",
      name: "整理当前笔记附件",
      callback: () => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") {
          new Notice("请先打开一篇 Markdown 笔记");
          return;
        }
        void this.organizeNoteAttachments(file);
      },
    });
    this.addCommand({
      id: "organize-all-attachments",
      name: "整理全库附件",
      callback: () => void this.organizeAllAttachments(),
    });

    this.registerEvent(this.app.vault.on("create", (file) => {
      if (file instanceof TFile) {
        this.trackNewNoteInitialization(file);
        this.scheduleAutomaticLinkNote(file);
        this.attachmentCleanupManager?.scheduleSourceRefresh(file);
      }
      this.refreshReadingViews();
    }));
    this.registerEvent(this.app.vault.on("modify", (file) => {
      if (file instanceof TFile) {
        this.handlePendingNewNoteModify(file);
        this.scheduleAutomaticLinkNote(file);
        this.attachmentCleanupManager?.scheduleSourceRefresh(file);
      }
      this.scheduleBlockEmbedHydration();
    }));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      if (file instanceof TFile) void this.attachmentCleanupManager?.handleRename(file, oldPath);
      void this.handleRename(file, oldPath);
    }));
    this.registerEvent(this.app.vault.on("delete", (file) => {
      if (file instanceof TFile) void this.attachmentCleanupManager?.handleDelete(file);
      void this.handleDelete(file);
      this.refreshReadingViews();
    }));
    this.registerEvent(this.app.metadataCache.on("deleted", (file, previousCache) => {
      this.attachmentCleanupManager?.captureSourceBeforeDelete(file, previousCache);
    }));
    this.registerEvent(this.app.metadataCache.on("changed", (file) => {
      this.refreshReadingViews();
      this.scheduleReferenceRepair(file);
      this.attachmentCleanupManager?.refreshSourceAfterMetadataChange(file);
      this.documentAnchorManager?.refreshAll();
    }));
    this.registerEvent(this.app.workspace.on("quick-preview", (file) => {
      this.lastEditorChangeAt.set(file.path, Date.now());
      if (this.completionCandidate?.path === file.path) this.resetAutoCompletionTracking();
    }));
    this.registerEvent(this.app.workspace.on("active-leaf-change", (leaf) => {
      this.resetAutoCompletionTracking();
      this.hideSelectionCommentButton();
      if (leaf?.view instanceof MarkdownView && leaf.view.file) {
        this.refreshCommentSidebars(leaf.view.file.path);
        this.documentAnchorManager?.updateView(leaf.view);
        void this.normalizeCapturedImageLinks(leaf.view.file);
      }
    }));
    this.registerEvent(this.app.workspace.on("file-open", (file) => {
      this.resetAutoCompletionTracking();
      this.hideSelectionCommentButton();
      if (file) this.refreshCommentSidebars(file.path);
      if (file) void this.normalizeCapturedImageLinks(file);
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (activeView) this.documentAnchorManager?.updateView(activeView);
      this.scheduleRecentFilesSection(30);
    }));
    this.registerEvent(this.app.workspace.on("layout-change", () => {
      this.documentAnchorManager?.refreshAll();
    }));
    this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => {
      if (!(file instanceof TFile) || file.extension !== "md") return;
      if (this.isTrackedFile(file)) this.addStatusMenuItems(menu, file);
      if (Platform.isDesktopApp) {
        menu.addItem((item) => item
          .setTitle("KnowGrove：解析链接内容")
          .setIcon("download")
          .onClick(() => void this.parseLinkNote(file, "manual")));
      }
      menu.addSeparator();
      menu.addItem((item) => item
        .setTitle("KnowGrove：整理此笔记附件")
        .setIcon("folder-input")
        .onClick(() => void this.organizeNoteAttachments(file)));
      menu.addItem((item) => item
        .setTitle("KnowGrove：检查附件与链接")
        .setIcon("list-checks")
        .onClick(() => void this.checkAttachmentLinkConsistency()));
    }));
    this.registerEvent(this.app.workspace.on("editor-menu", (menu, editor, context) => {
      if (!(context instanceof MarkdownView) || !context.file) return;
      if (editor.getSelection().trim()) {
        if (this.settings.enableComments) {
          menu.addItem((item) => item
            .setTitle("评论并引用")
            .setIcon("message-square-plus")
            .onClick(() => void this.openCommentSidebarForSelection(editor, context)));
        }
        menu.addItem((item) => item
          .setTitle("AI 编辑选中内容")
          .setIcon("wand-sparkles")
          .onClick(() => this.openCreationRewrite(editor, context)));
      }
      const reference = this.settings.enableComments
        ? this.findReferenceAtCursor(editor, context.file)
        : undefined;
      if (reference) {
        menu.addItem((item) => item
          .setTitle("编辑这条评论")
          .setIcon("message-circle")
          .onClick(() => void this.openCommentSidebarForRecord(reference)));
      }
    }));
  }

  onunload(): void {
    this.aiBatchCancelRequested = true;
    void this.browserCaptureServer?.stop();
    this.desktopRecorder?.shutdown();
    this.linkCaptureModal?.close();
    this.recordingOverlay?.hide();
    this.runtimeInstallProgressListeners.clear();
    this.attachmentCleanupManager?.stop();
    this.documentAnchorManager?.destroyAll();
    this.tableResizer?.destroy();
    this.imageLayoutEnhancer?.destroy();
    this.disposeLocalization?.();
    this.disposeLocalization = undefined;
    this.normalizingCaptureImageLinks.clear();
    window.clearTimeout(this.startupRuntimeBootstrapTimer);
    window.clearTimeout(this.refreshTimer);
    window.clearTimeout(this.referenceRepairTimer);
    window.clearTimeout(this.blockEmbedHydrationTimer);
    for (const timer of this.automaticLinkNoteTimers.values()) {
      window.clearTimeout(timer);
    }
    this.automaticLinkNoteTimers.clear();
    this.blockEmbedObserver?.disconnect();
    this.unloadBlockEmbedRenderChildren();
    this.recentFilesObserver?.disconnect();
    this.recentFilesObserver = undefined;
    this.recentFilesObserverTarget = undefined;
    this.app.workspace.containerEl.querySelectorAll(".knowgrove-recent-files").forEach((element) => element.remove());
    this.resetAutoCompletionTracking();
    this.hideCommentTooltip();
    this.hideSelectionCommentButton();
    this.clearActiveBlockDrag();
    for (const path of Array.from(this.pendingNewNoteInitializations.keys())) {
      this.clearPendingNewNoteInitialization(path);
    }
  }

  async scanUnreferencedAttachments(): Promise<void> {
    const manager = this.attachmentCleanupManager;
    if (!manager) return;
    const notice = new Notice("正在准备附件检查…", 0);
    try {
      await manager.scan(true, (progress) => notice.setMessage(this.attachmentScanProgressMessage(progress)));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(message === "附件检查已停止" ? message : `附件检查失败：${message}`, 7000);
    } finally {
      notice.hide();
    }
  }

  async checkAttachmentLinkConsistency(): Promise<void> {
    const manager = this.attachmentCleanupManager;
    if (!manager) {
      new Notice("附件检查组件尚未就绪，请重新加载插件后再试");
      return;
    }
    const notice = new Notice("正在准备附件与链接检查…", 0);
    try {
      await manager.checkConsistency((progress) => notice.setMessage(this.attachmentScanProgressMessage(progress)));
    } catch (error) {
      console.error("KnowGrove attachment consistency check failed", error);
      const message = error instanceof Error ? error.message : String(error);
      new Notice(message === "附件检查已停止" ? message : `附件检查失败：${message}`, 7000);
    } finally {
      notice.hide();
    }
  }

  private attachmentScanProgressMessage(progress: AttachmentScanProgress): string {
    const label = progress.phase === "index" ? "正在建立附件索引" : "正在检查断链";
    const percent = progress.total ? Math.round((progress.processed / progress.total) * 100) : 100;
    return `${label}：${progress.processed}/${progress.total}（${percent}%）\n可在命令面板执行“停止附件全库检查”`;
  }

  async organizeNoteAttachments(file: TFile): Promise<void> {
    await this.attachmentCleanupManager?.organizeCurrentNote(file);
  }

  async organizeAllAttachments(): Promise<void> {
    const manager = this.attachmentCleanupManager;
    if (!manager) return;
    const notice = new Notice("正在准备全库附件整理…", 0);
    try {
      await manager.organizeAllAttachments((progress) => notice.setMessage(this.attachmentScanProgressMessage(progress)));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(message === "附件检查已停止" ? message : `附件整理失败：${message}`, 7000);
    } finally {
      notice.hide();
    }
  }

  refreshAttachmentCleanupConfiguration(): void {
    this.attachmentCleanupManager?.configurationChanged();
  }

  private initializeSelectionCommentButton(): void {
    const ownerDocument = this.app.workspace.containerEl.ownerDocument;
    const actionBar = ownerDocument.body.createDiv({
      cls: "knowgrove-selection-actions",
      attr: { "aria-label": "选中内容操作" },
    });
    const commentButton = actionBar.createEl("button", {
      cls: "clickable-icon knowgrove-selection-comment-button",
      attr: { "aria-label": "评论选中内容" },
    });
    setIcon(commentButton, "message-square-plus");
    commentButton.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    commentButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const draft = this.selectionCommentDraft;
      this.hideSelectionCommentButton();
      if (draft) void this.openCommentSidebarForDraft(draft);
    });

    const dragHandle = actionBar.createEl("button", {
      cls: "clickable-icon knowgrove-selection-drag-handle",
      attr: {
        "aria-label": "拖到另一篇文档，插入完整块引用",
        draggable: "true",
      },
    });
    setIcon(dragHandle, "move");
    dragHandle.addEventListener("pointerdown", () => {
      this.selectionDragPointerActive = true;
    });
    dragHandle.addEventListener("dragstart", (event) => {
      const draft = this.selectionCommentDraft;
      const sourceView = draft
        ? this.app.workspace.getLeavesOfType("markdown")
          .map((leaf) => leaf.view)
          .find((view): view is MarkdownView => view instanceof MarkdownView && view.file?.path === draft.sourcePath)
        : undefined;
      if (!draft || !sourceView?.file || !event.dataTransfer) {
        event.preventDefault();
        this.selectionDragPointerActive = false;
        return;
      }
      const payload = this.prepareBlockDrag(
        sourceView.file.path,
        sourceView.editor.getValue(),
        sourceView.editor.posToOffset(draft.from),
        sourceView.editor.posToOffset(draft.to),
      );
      if (!payload) {
        event.preventDefault();
        this.selectionDragPointerActive = false;
        return;
      }
      this.setActiveBlockDrag(payload);
      event.dataTransfer.setData(KNOWGROVE_BLOCK_DRAG_MIME, payload.token);
      event.dataTransfer.setData("text/plain", payload.text);
      event.dataTransfer.effectAllowed = "copy";
      actionBar.addClass("is-dragging");
    });
    dragHandle.addEventListener("dragend", () => {
      this.selectionDragPointerActive = false;
      actionBar.removeClass("is-dragging");
      this.clearActiveBlockDrag();
      this.hideSelectionCommentButton();
    });
    dragHandle.addEventListener("click", () => {
      if (!this.selectionDragPointerActive) new Notice("按住拖动图标，将它拖到另一篇文档中");
    });

    actionBar.hidden = true;
    this.selectionActionBar = actionBar;
    this.registerDomEvent(ownerDocument, "pointerup", () => {
      if (!this.selectionDragPointerActive) return;
      this.selectionDragPointerActive = false;
      window.setTimeout(() => this.updateSelectionCommentButton(), 0);
    }, { capture: true });
    this.register(() => actionBar.remove());
  }

  private initializeBlockEmbedFallback(): void {
    const root = this.app.workspace.containerEl;
    this.blockEmbedObserver = new MutationObserver(() => {
      this.cleanupDetachedBlockEmbedRenderChildren();
      this.scheduleBlockEmbedHydration();
    });
    this.blockEmbedObserver.observe(root, { childList: true, subtree: true });
    this.register(() => this.blockEmbedObserver?.disconnect());
    this.app.workspace.onLayoutReady(() => this.scheduleBlockEmbedHydration());
  }

  private scheduleBlockEmbedHydration(): void {
    window.clearTimeout(this.blockEmbedHydrationTimer);
    this.blockEmbedHydrationTimer = window.setTimeout(() => {
      this.blockEmbedHydrationTimer = undefined;
      void this.hydrateVisibleBlockEmbeds();
    }, 80);
  }

  private async hydrateVisibleBlockEmbeds(): Promise<void> {
    this.cleanupDetachedBlockEmbedRenderChildren();
    const embeds = Array.from(this.app.workspace.containerEl.querySelectorAll<HTMLElement>(
      '.markdown-embed.inline-embed[src*="#^rr-"], .markdown-embed.inline-embed[src*="#^kg-"]',
    ));
    for (const embed of embeds) await this.hydrateBlockEmbed(embed);
  }

  private async hydrateBlockEmbed(embed: HTMLElement): Promise<void> {
    if (embed.dataset.knowGroveHydrating === "true") return;
    const nativeContent = Array.from(embed.querySelectorAll<HTMLElement>(
      ":scope > .markdown-embed-content p, :scope > .markdown-embed-content li, :scope > .markdown-embed-content pre, :scope > .markdown-embed-content blockquote, :scope > .markdown-embed-content table",
    )).some((element) => !element.closest(".mod-header") && element.textContent?.trim());
    const existingFallback = Array.from(embed.children)
      .find((element): element is HTMLElement => element.instanceOf(HTMLElement)
        && element.hasClass("knowgrove-block-embed-fallback"));
    if (nativeContent) {
      if (existingFallback) this.unloadBlockEmbedRenderChild(existingFallback);
      existingFallback?.remove();
      embed.removeClass("knowgrove-has-block-fallback");
      return;
    }

    const parsed = parseObsidianBlockEmbedSource(embed.getAttribute("src") ?? "");
    if (!parsed) return;
    const sourceFile = this.app.metadataCache.getFirstLinkpathDest(parsed.linkPath, "");
    const block = sourceFile ? this.app.metadataCache.getFileCache(sourceFile)?.blocks?.[parsed.blockId] : undefined;
    if (!sourceFile || !block) return;

    embed.dataset.knowGroveHydrating = "true";
    try {
      const source = await this.app.vault.cachedRead(sourceFile);
      const markdown = stripOwnBlockAnchor(
        source.slice(block.position.start.offset, block.position.end.offset),
        parsed.blockId,
      );
      if (!markdown) return;
      const fallback = existingFallback ?? createDiv({ cls: "knowgrove-block-embed-fallback" });
      this.unloadBlockEmbedRenderChild(fallback);
      fallback.empty();
      const renderChild = new MarkdownRenderChild(fallback);
      renderChild.load();
      this.blockEmbedRenderChildren.set(fallback, renderChild);
      await MarkdownRenderer.render(this.app, markdown, fallback, sourceFile.path, renderChild);
      if (!existingFallback) {
        const link = Array.from(embed.children)
          .find((element) => element.instanceOf(HTMLElement) && element.hasClass("markdown-embed-link"));
        embed.insertBefore(fallback, link ?? null);
      }
      embed.addClass("knowgrove-has-block-fallback");
    } finally {
      delete embed.dataset.knowGroveHydrating;
    }
  }

  private unloadBlockEmbedRenderChild(container: HTMLElement): void {
    const child = this.blockEmbedRenderChildren.get(container);
    if (!child) return;
    child.unload();
    this.blockEmbedRenderChildren.delete(container);
  }

  private cleanupDetachedBlockEmbedRenderChildren(): void {
    for (const [container] of this.blockEmbedRenderChildren) {
      if (!container.isConnected) this.unloadBlockEmbedRenderChild(container);
    }
  }

  private unloadBlockEmbedRenderChildren(): void {
    for (const container of Array.from(this.blockEmbedRenderChildren.keys())) {
      this.unloadBlockEmbedRenderChild(container);
    }
  }

  private updateSelectionCommentButton(): void {
    const actionBar = this.selectionActionBar;
    if (!actionBar) return;
    const actionCount = Number(this.settings.enableComments) + Number(this.settings.enableBlockDragReferences);
    if (!actionCount) {
      this.hideSelectionCommentButton();
      return;
    }
    const ownerDocument = this.app.workspace.containerEl.ownerDocument;
    const selection = ownerDocument.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) {
      if (this.selectionDragPointerActive) return;
      this.hideSelectionCommentButton();
      return;
    }
    const range = selection.getRangeAt(0);
    const markdownView = this.app.workspace.getLeavesOfType("markdown")
      .map((leaf) => leaf.view)
      .find((view): view is MarkdownView => view instanceof MarkdownView
        && view.file !== null
        && view.containerEl.contains(range.startContainer)
        && view.containerEl.contains(range.endContainer));
    if (!markdownView?.file) {
      this.hideSelectionCommentButton();
      return;
    }
    if (this.app.workspace.getActiveViewOfType(MarkdownView) !== markdownView) {
      this.hideSelectionCommentButton();
      return;
    }

    const visibleText = selection.toString().trim();
    if (!visibleText) {
      this.hideSelectionCommentButton();
      return;
    }
    const editorSelection = markdownView.editor.getSelection().trim();
    let from: EditorPosition;
    let to: EditorPosition;
    let selectedText: string;
    if (editorSelection) {
      const positions = orderedPositions(markdownView.editor);
      from = positions.from;
      to = positions.to;
      selectedText = editorSelection;
    } else {
      const content = markdownView.editor.getValue();
      const start = content.indexOf(visibleText);
      if (start < 0 || content.indexOf(visibleText, start + visibleText.length) >= 0) {
        this.hideSelectionCommentButton();
        return;
      }
      from = markdownView.editor.offsetToPos(start);
      to = markdownView.editor.offsetToPos(start + visibleText.length);
      selectedText = visibleText;
    }
    if (/\n\s*\n/.test(markdownView.editor.getRange(from, to))) {
      this.hideSelectionCommentButton();
      return;
    }
    const rangeElement = range.commonAncestorContainer.instanceOf(Element)
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
    const selectionSurface = rangeElement?.closest<HTMLElement>(".cm-scroller, .markdown-preview-view");
    if (!selectionSurface || !markdownView.containerEl.contains(selectionSurface)) {
      this.hideSelectionCommentButton();
      return;
    }
    const anchorRect = getSelectionAnchorRect(Array.from(range.getClientRects()))
      ?? getSelectionAnchorRect([range.getBoundingClientRect()]);
    if (!anchorRect) {
      this.hideSelectionCommentButton();
      return;
    }
    const ownerWindow = ownerDocument.defaultView ?? window;
    const position = positionSelectionCommentButton(
      anchorRect,
      selectionSurface.getBoundingClientRect(),
      {
        left: 0,
        right: ownerWindow.innerWidth,
        top: 0,
        bottom: ownerWindow.innerHeight,
        width: ownerWindow.innerWidth,
        height: ownerWindow.innerHeight,
      },
      actionCount > 1 ? 66 : 30,
      7,
      30,
    );
    if (!position) {
      this.hideSelectionCommentButton();
      return;
    }
    this.selectionCommentDraft = {
      sourcePath: markdownView.file.path,
      selectedText,
      from,
      to,
    };
    actionBar.toggleClass("has-comment", this.settings.enableComments);
    actionBar.toggleClass("has-drag-handle", this.settings.enableBlockDragReferences);
    actionBar.hidden = false;
    actionBar.style.left = `${position.left}px`;
    actionBar.style.top = `${position.top}px`;
  }

  private hideSelectionCommentButton(): void {
    const actionBar = this.selectionActionBar;
    this.selectionCommentDraft = undefined;
    if (!actionBar) return;
    actionBar.hidden = true;
    actionBar.removeClass("is-dragging");
    actionBar.style.removeProperty("left");
    actionBar.style.removeProperty("top");
  }

  prepareBlockDrag(sourcePath: string, content: string, from: number, to: number): BlockDragPayload | null {
    if (!this.settings.enableBlockDragReferences) return null;
    const range = findMarkdownBlockRange(content, from, to);
    if (!range) return null;
    return {
      ...range,
      sourcePath,
      token: makeId("drag"),
    };
  }

  setActiveBlockDrag(payload: BlockDragPayload): void {
    this.activeBlockDrag = payload;
  }

  getActiveBlockDrag(): BlockDragPayload | undefined {
    return this.activeBlockDrag;
  }

  clearActiveBlockDrag(): void {
    this.activeBlockDrag = undefined;
  }

  async insertDraggedBlockReference(
    payload: BlockDragPayload,
    targetView: MarkdownView,
    dropOffset: number,
  ): Promise<boolean> {
    if (!this.settings.enableBlockDragReferences || !targetView.file || targetView.file.path === payload.sourcePath) return false;
    const sourceFile = this.app.vault.getAbstractFileByPath(payload.sourcePath);
    const sourceView = this.app.workspace.getLeavesOfType("markdown")
      .map((leaf) => leaf.view)
      .find((view): view is MarkdownView => view instanceof MarkdownView && view.file?.path === payload.sourcePath);
    if (!(sourceFile instanceof TFile) || !sourceView) {
      new Notice("源文档已关闭或不存在，请重新选择后拖动");
      return false;
    }

    const currentSource = sourceView.editor.getValue();
    let blockStart = currentSource.slice(payload.start, payload.end) === payload.text ? payload.start : -1;
    if (blockStart < 0) {
      const firstMatch = currentSource.indexOf(payload.text);
      const repeated = firstMatch >= 0 && currentSource.indexOf(payload.text, firstMatch + payload.text.length) >= 0;
      if (firstMatch < 0 || repeated) {
        new Notice("源内容在拖动时发生了变化，请重新选择后拖动");
        return false;
      }
      blockStart = firstMatch;
    }

    try {
      const blockEnd = blockStart + payload.text.length;
      const sourceBlockId = this.ensureBlockAnchor(sourceView.editor, {
        from: sourceView.editor.offsetToPos(blockStart),
        to: sourceView.editor.offsetToPos(blockEnd),
      });
      await sourceView.save();
      await this.waitForBlockMetadata(sourceFile, sourceBlockId);

      const targetContent = targetView.editor.getValue();
      const safeDropOffset = Math.max(0, Math.min(targetContent.length, dropOffset));
      const embed = renderObsidianBlockEmbed(sourceFile.path, sourceBlockId);
      const insertion = formatBlockEmbedInsertion(targetContent, safeDropOffset, embed);
      targetView.editor.replaceRange(insertion, targetView.editor.offsetToPos(safeDropOffset));
      targetView.editor.setCursor(targetView.editor.offsetToPos(safeDropOffset + insertion.length));
      await targetView.save();
      this.scheduleBlockEmbedHydration();
      new Notice(`已引用《${sourceFile.basename}》中的完整内容块`);
      return true;
    } catch (error) {
      console.error("KnowGrove: failed to insert dragged block reference", error);
      new Notice("块引用插入失败，请查看开发者控制台");
      return false;
    }
  }

  private async waitForBlockMetadata(file: TFile, blockId: string): Promise<void> {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      if (this.app.metadataCache.getFileCache(file)?.blocks?.[blockId]) return;
      await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
    }
  }

  private async openCommentSidebarForDraft(draft: CommentSelectionDraft): Promise<void> {
    const sidebar = await this.activateCommentSidebar();
    sidebar?.showDraft(draft);
  }

  private async loadLegacyPluginData(): Promise<Partial<KnowGroveData> | null> {
    const path = normalizePath(`${this.app.vault.configDir}/plugins/${LEGACY_PLUGIN_ID}/data.json`);
    if (!(await this.app.vault.adapter.exists(path))) return null;
    try {
      const parsed = JSON.parse(await this.app.vault.adapter.read(path)) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed
        : null;
    } catch (error) {
      console.error("KnowGrove: failed to read legacy plugin data", error);
      return null;
    }
  }

  async loadPluginData(): Promise<void> {
    const current = (await this.loadData()) as Partial<KnowGroveData> | null;
    const legacy = current ? null : await this.loadLegacyPluginData();
    const brandMigration = migrateLegacyBrandValue(current ?? legacy ?? {});
    const saved = brandMigration.value;
    const defaults = createDefaultSettings();
    const savedSettingsRecord = {
      ...((saved?.settings as Record<string, unknown> | undefined) ?? {}),
    };
    const needsFocusSettingsRemoval = Object.prototype.hasOwnProperty.call(savedSettingsRecord, "focusPropertyEnabled")
      || Object.prototype.hasOwnProperty.call(savedSettingsRecord, "focusPropertyName");
    delete savedSettingsRecord.focusPropertyEnabled;
    delete savedSettingsRecord.focusPropertyName;
    const savedSettings = savedSettingsRecord as Partial<KnowGroveSettings>;
    const autoProcessNewNotes = savedSettings?.autoMarkNewNotes ?? defaults.autoMarkNewNotes;
    const savedAIProperties = savedSettings?.aiProperties;
    const savedBrowserCapture = savedSettings?.browserCapture;
    const savedDesktopCapture = savedSettings?.desktopCapture;
    const savedRuntime = savedSettings?.runtime;
    const savedCreationStudio = savedSettings?.creationStudio;
    const savedPropertySystem = savedSettings?.propertySystem as Partial<PropertySystemSettings> | undefined;
    const savedDimensions = Array.isArray(savedPropertySystem?.dimensions) && savedPropertySystem.dimensions.length
      ? savedPropertySystem.dimensions
      : defaults.propertySystem.dimensions;
    const creationDateProperty = savedPropertySystem?.creationDateProperty
      ?? defaults.propertySystem.creationDateProperty;
    const dimensions = normalizePropertyDimensions(savedDimensions, creationDateProperty);
    const savedDomainValues = dimensions.find((dimension) => dimension.name === "领域")?.allowedValues
      ?? defaults.propertySystem.taxonomy.domains.map((node) => node.name);
    const taxonomy = normalizePropertyTaxonomy(savedPropertySystem?.taxonomy, savedDomainValues);
    const needsRuleMigration = saved.schemaVersion !== PROPERTY_RULE_SCHEMA_VERSION
      || JSON.stringify(savedDimensions) !== JSON.stringify(dimensions);
    const needsAutoProcessMigration = savedAIProperties?.autoEnrichNewNotes !== autoProcessNewNotes
      || savedBrowserCapture?.autoProcessLinkNotes !== autoProcessNewNotes
      || savedPropertySystem?.initializeTrackedNotes !== autoProcessNewNotes;
    const legacyBrowserCapture = savedSettings?.browserCapture as unknown as Record<string, unknown> | undefined;
    const needsKeepAudioSourceMigration = legacyBrowserCapture?.keepAudioSource === false;
    const legacyDesktopCapture = savedDesktopCapture as unknown as Record<string, unknown> | undefined;
    const needsExternalMarkdownSettingsMigration = !legacyDesktopCapture
      || !Object.prototype.hasOwnProperty.call(legacyDesktopCapture, "externalMarkdownOpenerEnabled")
      || !Object.prototype.hasOwnProperty.call(legacyDesktopCapture, "externalMarkdownDeleteSourceAfterImport");
    const savedAIProvider = (savedAIProperties as { provider?: unknown } | undefined)?.provider;
    const normalizedAIProvider = normalizeAIProviderId(savedAIProvider, defaults.aiProperties.provider);
    const savedBrowserProviders = savedBrowserCapture as {
      articleProvider?: unknown;
      videoProvider?: unknown;
      audioProvider?: unknown;
    } | undefined;
    const browserProviderValues = [
      savedBrowserProviders?.articleProvider,
      savedBrowserProviders?.videoProvider,
      savedBrowserProviders?.audioProvider,
    ];
    const browserProviderFallbacks = [
      defaults.browserCapture.articleProvider,
      defaults.browserCapture.videoProvider,
      defaults.browserCapture.audioProvider,
    ];
    const needsAIProviderMigration = (
      typeof savedAIProvider === "string" && savedAIProvider !== normalizedAIProvider
    ) || browserProviderValues.some((provider, index) => (
      typeof provider === "string"
      && provider !== normalizeAIProviderId(provider, browserProviderFallbacks[index])
    ));
    this.data = {
      schemaVersion: PROPERTY_RULE_SCHEMA_VERSION,
      uiMigrationVersion: typeof saved.uiMigrationVersion === "number" ? saved.uiMigrationVersion : 0,
      maintenanceMigrationVersion: typeof saved.maintenanceMigrationVersion === "number"
        ? saved.maintenanceMigrationVersion
        : legacy
          ? 0
          : CURRENT_MAINTENANCE_MIGRATION_VERSION,
      settings: {
        ...defaults,
        ...(savedSettings ?? {}),
        autoMarkNewNotes: autoProcessNewNotes,
        defaultTargetFolder: "",
        defaultTargetHeading: "评论",
        attachmentCleanupExcludedFolders: Array.isArray(savedSettings?.attachmentCleanupExcludedFolders)
          ? Array.from(new Set(savedSettings.attachmentCleanupExcludedFolders
            .filter((folder): folder is string => typeof folder === "string")
            .map((folder) => normalizePath(folder.trim()).replace(/^\/+|\/+$/g, ""))
            .filter(Boolean)))
          : [...defaults.attachmentCleanupExcludedFolders],
        attachmentCleanupExtraExtensions: Array.isArray(savedSettings?.attachmentCleanupExtraExtensions)
          ? normalizeAttachmentExtensions(savedSettings.attachmentCleanupExtraExtensions
            .filter((extension): extension is string => typeof extension === "string"))
          : [...defaults.attachmentCleanupExtraExtensions],
        moveAttachmentsWithNote: savedSettings?.moveAttachmentsWithNote === true,
        autoOrganizeAttachments: savedSettings?.autoOrganizeAttachments === true,
        sharedAttachmentHandling: savedSettings?.sharedAttachmentHandling === "copy" ? "copy" : "skip",
        aiProperties: {
          ...defaults.aiProperties,
          ...(savedAIProperties ?? {}),
          autoEnrichNewNotes: autoProcessNewNotes,
          provider: normalizedAIProvider,
        },
        runtime: {
          ...defaults.runtime,
          ...(savedRuntime ?? {}),
        },
        browserCapture: {
          ...defaults.browserCapture,
          ...(savedBrowserCapture ?? {}),
          autoProcessLinkNotes: autoProcessNewNotes,
          keepAudioSource: true,
          articleProvider: normalizeAIProviderId(
            savedBrowserProviders?.articleProvider,
            defaults.browserCapture.articleProvider,
          ),
          videoProvider: normalizeAIProviderId(
            savedBrowserProviders?.videoProvider,
            defaults.browserCapture.videoProvider,
          ),
          audioProvider: normalizeAIProviderId(
            savedBrowserProviders?.audioProvider,
            defaults.browserCapture.audioProvider,
          ),
        },
        desktopCapture: {
          ...defaults.desktopCapture,
          ...(savedDesktopCapture ?? {}),
        },
        creationStudio: {
          ...defaults.creationStudio,
          ...(savedCreationStudio ?? {}),
        },
        propertySystem: {
          ...defaults.propertySystem,
          ...(savedPropertySystem ?? {}),
          initializeTrackedNotes: autoProcessNewNotes,
          excludedFolders: Array.isArray(savedPropertySystem?.excludedFolders)
            ? [...savedPropertySystem.excludedFolders]
            : [...defaults.propertySystem.excludedFolders],
          taxonomy,
          dimensions: dimensions.map((dimension) => ({
            ...dimension,
            aliases: Array.isArray(dimension.aliases) ? [...dimension.aliases] : [],
            allowedValues: Array.isArray(dimension.allowedValues) ? [...dimension.allowedValues] : [],
            requiredForTypes: Array.isArray(dimension.requiredForTypes) ? [...dimension.requiredForTypes] : [],
            aiManaged: Boolean(dimension.aiManaged),
          })),
        },
      },
      references: saved.references ?? {},
      attachmentUsage: Object.fromEntries(Object.entries(saved.attachmentUsage ?? {}).flatMap(([path, raw]) => {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
        const record = raw as Partial<KnowGroveData["attachmentUsage"][string]>;
        return [[normalizePath(path), {
          firstReferencedAt: typeof record.firstReferencedAt === "number" ? record.firstReferencedAt : Date.now(),
          lastReferencedAt: typeof record.lastReferencedAt === "number" ? record.lastReferencedAt : Date.now(),
          currentSourcePaths: Array.isArray(record.currentSourcePaths)
            ? record.currentSourcePaths.filter((source): source is string => typeof source === "string").map(normalizePath)
            : Array.isArray(record.lastSourcePaths)
              ? record.lastSourcePaths.filter((source): source is string => typeof source === "string").map(normalizePath)
              : [],
          currentContentSourcePaths: Array.isArray(record.currentContentSourcePaths)
            ? record.currentContentSourcePaths.filter((source): source is string => typeof source === "string").map(normalizePath)
            : Array.isArray(record.lastContentSourcePaths)
              ? record.lastContentSourcePaths.filter((source): source is string => typeof source === "string").map(normalizePath)
              : [],
          lastSourcePaths: Array.isArray(record.lastSourcePaths)
            ? record.lastSourcePaths.filter((source): source is string => typeof source === "string").map(normalizePath)
            : [],
          lastContentSourcePaths: Array.isArray(record.lastContentSourcePaths)
            ? record.lastContentSourcePaths.filter((source): source is string => typeof source === "string").map(normalizePath)
            : [],
        }]];
      })),
    };
    this.settings = this.data.settings;
    if (
      legacy
      || brandMigration.changed
      || needsRuleMigration
      || needsAutoProcessMigration
      || needsKeepAudioSourceMigration
      || needsExternalMarkdownSettingsMigration
      || needsAIProviderMigration
      || needsFocusSettingsRemoval
    ) {
      await this.savePluginData();
    }
    if (legacy) new Notice("KnowGrove 已导入 Reading Companion 的设置、评论与引用数据");
  }

  private async runStartupMigrations(): Promise<void> {
    await this.migrateLegacySidebarViews();
    if (this.data.maintenanceMigrationVersion >= CURRENT_MAINTENANCE_MIGRATION_VERSION) return;
    await this.migrateLegacyBrandStorage();
    await this.migrateResearchTopicSourceMetadata();
    await this.repairAllReferenceAnchors(false);
    this.data.maintenanceMigrationVersion = CURRENT_MAINTENANCE_MIGRATION_VERSION;
    await this.savePluginData();
  }

  private scheduleCoreSidebarMaintenance(delay = 250): void {
    window.clearTimeout(this.coreSidebarMaintenanceTimer);
    this.coreSidebarMaintenanceTimer = window.setTimeout(() => {
      this.coreSidebarMaintenanceTimer = undefined;
      void this.ensureCoreSidebarViews();
    }, delay);
  }

  private scheduleRecentFilesSection(delay = 80): void {
    window.clearTimeout(this.recentFilesRenderTimer);
    this.recentFilesRenderTimer = window.setTimeout(() => {
      this.recentFilesRenderTimer = undefined;
      this.ensureRecentFilesSection();
    }, delay);
  }

  refreshRecentFiles(): void {
    this.scheduleRecentFilesSection(0);
  }

  private ensureRecentFilesSection(): void {
    const explorerLeaf = this.app.workspace.getLeavesOfType("file-explorer")[0];
    const filesContainer = explorerLeaf?.view.containerEl.querySelector<HTMLElement>(".nav-files-container");
    if (!filesContainer) return;

    if (this.recentFilesObserverTarget !== filesContainer) {
      this.recentFilesObserver?.disconnect();
      this.recentFilesObserverTarget = filesContainer;
      this.recentFilesObserver = new MutationObserver(() => {
        if (this.renderingRecentFiles) return;
        if (!filesContainer.querySelector(":scope > .knowgrove-recent-files")) {
          this.scheduleRecentFilesSection(20);
        }
      });
      this.recentFilesObserver.observe(filesContainer, { childList: true });
    }

    const workspaceWithHistory = this.app.workspace as typeof this.app.workspace & {
      getLastOpenFiles?: () => string[];
    };
    const mode = this.settings.recentFileMode;
    const limit = Math.max(3, Math.min(20, Math.round(this.settings.recentFileLimit)));
    let history: string[];
    let existingPaths: Pick<ReadonlySet<string>, "has">;
    if (mode === "created") {
      const allFiles = this.app.vault.getFiles();
      history = allFiles
        .filter((file) => isRecentDocumentPath(file.path))
        .sort((left, right) => right.stat.ctime - left.stat.ctime)
        .map((file) => file.path);
      existingPaths = new Set(allFiles.map((file) => file.path));
    } else if (mode === "modified") {
      const allFiles = this.app.vault.getFiles();
      history = allFiles
        .filter((file) => isRecentDocumentPath(file.path))
        .sort((left, right) => right.stat.mtime - left.stat.mtime)
        .map((file) => file.path);
      existingPaths = new Set(allFiles.map((file) => file.path));
    } else {
      history = workspaceWithHistory.getLastOpenFiles?.call(this.app.workspace) ?? [];
      if (!history.length) {
        const allFiles = this.app.vault.getFiles();
        history = allFiles
          .filter((file) => isRecentDocumentPath(file.path))
          .sort((left, right) => right.stat.mtime - left.stat.mtime)
          .map((file) => file.path);
        existingPaths = new Set(allFiles.map((file) => file.path));
      } else {
        existingPaths = {
          has: (path: string) => Boolean(this.app.vault.getFileByPath(path)),
        };
      }
    }
    const recentPaths = selectRecentDocumentPaths(history, existingPaths, limit);

    const activePath = this.app.workspace.getActiveFile()?.path ?? "";
    const signature = `${mode}|${limit}|${this.recentFilesCollapsed ? "closed" : "open"}|${activePath}|${recentPaths.join("\n")}`;
    const current = filesContainer.querySelector<HTMLElement>(":scope > .knowgrove-recent-files");
    if (current?.dataset.signature === signature) return;

    this.renderingRecentFiles = true;
    current?.remove();
    const section = filesContainer.ownerDocument.body.createDiv();
    section.className = `tree-item nav-folder knowgrove-recent-files${this.recentFilesCollapsed ? " is-collapsed" : ""}`;
    section.dataset.signature = signature;

    const title = section.createDiv({
      cls: "tree-item-self nav-folder-title is-clickable mod-collapsible knowgrove-recent-title",
      attr: { "aria-label": this.recentFilesCollapsed ? "展开最近文件" : "收起最近文件" },
    });
    const collapseIcon = title.createDiv({
      cls: `tree-item-icon collapse-icon${this.recentFilesCollapsed ? " is-collapsed" : ""}`,
    });
    setIcon(collapseIcon, "right-triangle");
    title.createDiv({ cls: "tree-item-inner nav-folder-title-content", text: "最近" });
    const children = section.createDiv({ cls: "tree-item-children nav-folder-children knowgrove-recent-children" });
    children.hidden = this.recentFilesCollapsed;
    for (const path of recentPaths) {
      const file = this.app.vault.getFileByPath(path);
      if (!file) continue;
      const item = children.createDiv({ cls: "tree-item nav-file knowgrove-recent-file" });
      const row = item.createDiv({
        cls: `tree-item-self nav-file-title tappable is-clickable${path === activePath ? " is-active" : ""}`,
        attr: { "data-path": path, "aria-label": path },
      });
      row.createDiv({ cls: "tree-item-inner nav-file-title-content", text: file.basename });
      if (file.extension !== "md") row.createDiv({ cls: "nav-file-tag", text: file.extension });
      row.addEventListener("click", (event) => {
        event.stopPropagation();
        const openInNewLeaf = event.metaKey || event.ctrlKey;
        void this.app.workspace.getLeaf(openInNewLeaf).openFile(file);
      });
      row.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        const menu = new Menu();
        this.app.workspace.trigger("file-menu", menu, file, "file-explorer");
        menu.showAtMouseEvent(event);
      });
    }

    title.addEventListener("click", () => {
      this.recentFilesCollapsed = !this.recentFilesCollapsed;
      section.toggleClass("is-collapsed", this.recentFilesCollapsed);
      collapseIcon.toggleClass("is-collapsed", this.recentFilesCollapsed);
      children.hidden = this.recentFilesCollapsed;
      title.setAttr("aria-label", this.recentFilesCollapsed ? "展开最近文件" : "收起最近文件");
      section.dataset.signature = `${mode}|${limit}|${this.recentFilesCollapsed ? "closed" : "open"}|${activePath}|${recentPaths.join("\n")}`;
    });

    filesContainer.prepend(section);
    this.renderingRecentFiles = false;
  }

  private async ensureCoreSidebarViews(): Promise<void> {
    const readingLeaf = this.keepSingleCoreSidebarView(
      READING_VIEW_TYPE,
      (leaf) => leaf.view instanceof ReadingListView,
    );
    if (!readingLeaf) {
      const readingLeaf = this.app.workspace.getLeftLeaf(false);
      if (readingLeaf) await readingLeaf.setViewState({ type: READING_VIEW_TYPE, active: false });
    }
    if (this.settings.enableTopicIndex) {
      const topicLeaf = this.keepSingleCoreSidebarView(
        TOPIC_INDEX_VIEW_TYPE,
        (leaf) => leaf.view instanceof TopicIndexView,
      );
      if (!topicLeaf) {
        const topicLeaf = this.app.workspace.getLeftLeaf(false);
        if (topicLeaf) await topicLeaf.setViewState({ type: TOPIC_INDEX_VIEW_TYPE, active: false });
      }
    } else {
      for (const leaf of this.app.workspace.getLeavesOfType(TOPIC_INDEX_VIEW_TYPE)) leaf.detach();
    }
    const workbenchLeaf = this.keepSingleCoreSidebarView(
      PROPERTY_WORKBENCH_VIEW_TYPE,
      (leaf) => leaf.view instanceof PropertyWorkbenchView,
    );
    if (!workbenchLeaf) {
      const workbenchLeaf = this.app.workspace.getLeftLeaf(false);
      if (workbenchLeaf) {
        await workbenchLeaf.setViewState({ type: PROPERTY_WORKBENCH_VIEW_TYPE, active: false });
      }
    }
  }

  private keepSingleCoreSidebarView(
    viewType: string,
    isHealthy: (leaf: WorkspaceLeaf) => boolean,
  ): WorkspaceLeaf | undefined {
    const leaves = this.app.workspace.getLeavesOfType(viewType);
    if (!leaves.length) return undefined;
    const healthyLeaves = leaves.filter(isHealthy);
    if (!healthyLeaves.length) {
      for (const leaf of leaves) leaf.detach();
      return undefined;
    }
    const preferred = healthyLeaves.find((leaf) => leaf === this.app.workspace.getMostRecentLeaf())
      ?? healthyLeaves[0];
    for (const leaf of leaves) {
      if (leaf !== preferred) leaf.detach();
    }
    return preferred;
  }

  private async migrateLegacySidebarViews(): Promise<void> {
    if (this.data.uiMigrationVersion >= CURRENT_UI_MIGRATION_VERSION) return;

    let readingLeaf = this.app.workspace.getLeavesOfType(READING_VIEW_TYPE)[0];
    const legacyLeaves = this.app.workspace.getLeavesOfType(LEGACY_READING_VIEW_TYPE);
    for (const legacyLeaf of legacyLeaves) {
      if (!readingLeaf) {
        await legacyLeaf.setViewState({ type: READING_VIEW_TYPE, active: false });
        readingLeaf = legacyLeaf;
      } else {
        legacyLeaf.detach();
      }
    }

    if (!readingLeaf) {
      const leaf = this.app.workspace.getLeftLeaf(false);
      if (leaf) {
        await leaf.setViewState({ type: READING_VIEW_TYPE, active: false });
        readingLeaf = leaf;
      }
    }

    if (readingLeaf && this.data.uiMigrationVersion !== CURRENT_UI_MIGRATION_VERSION) {
      this.data.uiMigrationVersion = CURRENT_UI_MIGRATION_VERSION;
      await this.savePluginData();
    }
  }

  private async migrateLegacyBrandStorage(): Promise<void> {
    let movedRoot = false;
    let updatedFiles = 0;
    let renamedSidecars = 0;
    const legacyRoot = this.app.vault.getAbstractFileByPath(LEGACY_ROOT);
    const currentRoot = this.app.vault.getAbstractFileByPath(KNOWGROVE_ROOT);
    if (legacyRoot instanceof TFolder && !currentRoot) {
      await this.app.fileManager.renameFile(legacyRoot, KNOWGROVE_ROOT);
      movedRoot = true;
    } else if (legacyRoot instanceof TFolder && currentRoot) {
      console.warn(`KnowGrove: both ${LEGACY_ROOT} and ${KNOWGROVE_ROOT} exist; automatic folder merge was skipped`);
      new Notice("KnowGrove 检测到新旧工作空间同时存在，已保留两者，未自动合并");
    }

    const referenceTargets = new Set(Object.values(this.data.references)
      .map((record) => record.targetPath)
      .filter((path): path is string => Boolean(path)));
    const candidates = Array.from(new Map([
      ...this.filesUnderVaultFolder(KNOWGROVE_ROOT),
      ...this.filesUnderVaultFolder(LEGACY_ROOT),
      ...Array.from(referenceTargets)
        .map((path) => this.app.vault.getFileByPath(path))
        .filter((file): file is TFile => Boolean(file)),
    ].map((file) => [file.path, file])).values());

    for (const original of candidates) {
      let file = original;
      if (isLegacyResearchSourceStatePath(file.path)) {
        const nextPath = normalizePath(migrateLegacyResearchSourceStatePath(file.path));
        if (!(await this.app.vault.adapter.exists(nextPath))) {
          await this.app.fileManager.renameFile(file, nextPath);
          const renamed = this.app.vault.getAbstractFileByPath(nextPath);
          if (renamed instanceof TFile) file = renamed;
          renamedSidecars += 1;
        }
      }
      if (!["md", "base", "json"].includes(file.extension)) continue;
      const content = await this.app.vault.read(file);
      const migrated = migrateLegacyManagedContent(content);
      if (!migrated.changed) continue;
      await this.app.vault.modify(file, migrated.value);
      updatedFiles += 1;
    }

    if (movedRoot || updatedFiles || renamedSidecars) {
      new Notice(`KnowGrove 迁移完成：${movedRoot ? "工作空间已迁移，" : ""}${updatedFiles} 个文件已升级`);
      this.refreshReadingViews();
      this.refreshPropertyWorkbenches();
    }
  }

  private filesUnderVaultFolder(path: string): TFile[] {
    const root = this.app.vault.getAbstractFileByPath(normalizePath(path));
    if (!(root instanceof TFolder)) return [];
    const files: TFile[] = [];
    const visit = (folder: TFolder): void => {
      for (const child of folder.children) {
        if (child instanceof TFile) files.push(child);
        else if (child instanceof TFolder) visit(child);
      }
    };
    visit(root);
    return files;
  }

  async savePluginData(): Promise<void> {
    this.data.schemaVersion = PROPERTY_RULE_SCHEMA_VERSION;
    this.data.settings = this.settings;
    await this.saveData(this.data);
  }

  private desktopLinkFolder(): string {
    return normalizePath(
      this.settings.desktopCapture.linkFolder.trim()
      || this.settings.browserCapture.inboxFolder.trim()
      || this.settings.trackedFolder.trim()
      || "阅读列表",
    ).replace(/^\/+|\/+$/g, "");
  }

  private desktopRecordingFolder(): string {
    const explicit = this.settings.desktopCapture.recordingFolder.trim();
    if (explicit) return normalizePath(explicit).replace(/^\/+|\/+$/g, "");
    return normalizePath(`${this.desktopLinkFolder()}/录音`).replace(/^\/+|\/+$/g, "");
  }

  private desktopMediaImportFolder(): string {
    return normalizePath(
      this.settings.browserCapture.mediaFolder.trim()
      || `${this.desktopLinkFolder()}/附件/音视频`,
    ).replace(/^\/+|\/+$/g, "");
  }

  private externalMarkdownFolder(): string {
    return normalizePath(
      this.settings.desktopCapture.externalMarkdownFolder.trim()
      || this.desktopLinkFolder(),
    ).replace(/^\/+|\/+$/g, "");
  }

  private externalMarkdownOpenerOptions(): ExternalMarkdownOpenerInstallOptions {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) throw new Error("当前 Vault 不是本地文件系统");
    return {
      vaultPath: adapter.getFullPath(""),
      destinationFolder: this.externalMarkdownFolder(),
      enabled: this.settings.desktopCapture.externalMarkdownOpenerEnabled,
      deleteSourceAfterImport: this.settings.desktopCapture.externalMarkdownDeleteSourceAfterImport,
    };
  }

  async getExternalMarkdownOpenerStatus(): Promise<ExternalMarkdownOpenerStatus> {
    return await inspectExternalMarkdownOpener();
  }

  async installExternalMarkdownOpener(): Promise<ExternalMarkdownOpenerStatus> {
    return await installExternalMarkdownOpener(this.externalMarkdownOpenerOptions());
  }

  async syncExternalMarkdownOpenerConfiguration(): Promise<void> {
    if (process.platform !== "darwin") return;
    await updateExternalMarkdownOpenerConfiguration(this.externalMarkdownOpenerOptions());
  }

  async restorePreviousMarkdownHandler(): Promise<ExternalMarkdownOpenerStatus> {
    return await restorePreviousMarkdownHandler();
  }

  getDesktopRecordingSnapshot(): DesktopRecordingSnapshot {
    return this.desktopRecorder?.snapshot() ?? {
      state: "idle",
      title: "语音记录",
      recordedMilliseconds: 0,
      interruptionCount: 0,
      message: "准备录音",
    };
  }

  subscribeDesktopRecording(listener: (snapshot: DesktopRecordingSnapshot) => void): () => void {
    if (!this.desktopRecorder) {
      listener(this.getDesktopRecordingSnapshot());
      return () => undefined;
    }
    return this.desktopRecorder.subscribe(listener);
  }

  async startDesktopRecording(title = ""): Promise<void> {
    if (!Platform.isDesktopApp || !this.desktopRecorder) throw new Error("录音只支持 Obsidian 桌面版");
    await this.ensureVaultFolder(this.desktopRecordingFolder().split("/"));
    await this.desktopRecorder.start(title);
  }

  async resumeDesktopRecording(): Promise<void> {
    if (!this.desktopRecorder) throw new Error("录音服务尚未初始化");
    await this.desktopRecorder.resume();
  }

  async stopDesktopRecording(): Promise<void> {
    if (!this.desktopRecorder) return;
    const completed = await this.desktopRecorder.stop();
    if (completed?.notePath) new Notice(`录音已安全保存：${completed.notePath}`, 7000);
  }

  async resetDesktopRecording(): Promise<void> {
    await this.desktopRecorder?.discardCompletedState();
  }

  syncRecordingOverlay(): void {
    const snapshot = this.getDesktopRecordingSnapshot();
    const recorderOpen = this.app.workspace.getActiveViewOfType(DesktopRecorderView) !== null;
    const shouldFloat = !recorderOpen
      && snapshot.state !== "idle"
      && snapshot.state !== "completed";
    if (shouldFloat) this.recordingOverlay?.show();
    else this.recordingOverlay?.hide();
  }

  async captureBatchLinks(
    input: string,
    onProgress?: (completed: number, total: number, message?: string) => void,
  ): Promise<{ total: number; created: number; queued: number; failed: number; files: TFile[] }> {
    if (!Platform.isDesktopApp) throw new Error("批量链接收集只支持 Obsidian 桌面版");
    const urls = extractBatchCaptureUrls(input);
    if (!urls.length) return { total: 0, created: 0, queued: 0, failed: 0, files: [] };
    const folder = this.desktopLinkFolder();
    await this.ensureVaultFolder(folder.split("/"));
    let created = 0;
    let queued = 0;
    let failed = 0;
    const files: TFile[] = [];
    for (let index = 0; index < urls.length; index += 1) {
      const url = urls[index]!;
      try {
        const parsed = new URL(url);
        const title = parsed.hostname.replace(/^www\./i, "") || "链接";
        const now = new Date();
        const path = this.uniqueVaultPath(`${folder}/${batchCaptureFileStem(now, index, parsed.hostname)}.md`);
        const file = await this.app.vault.create(path, buildBatchLinkNote(url, title, now));
        this.clearPendingNewNoteInitialization(file.path);
        await this.ensureNewNoteStatus(file);
        files.push(file);
        created += 1;
        onProgress?.(index + 1, urls.length, title);
        if (this.browserCaptureServer) {
          await this.parseLinkNote(file, "auto");
          queued += 1;
        }
      } catch (error) {
        failed += 1;
        console.error(`KnowGrove: failed to capture batch link ${url}`, error);
        onProgress?.(index + 1, urls.length, "保存失败");
      }
    }
    this.refreshReadingViews();
    return { total: urls.length, created, queued, failed, files };
  }

  async importLocalMediaFiles(
    selectedFiles: readonly File[],
    onProgress?: (progress: LocalMediaImportProgress) => void,
  ): Promise<{ total: number; imported: number; failed: number; files: TFile[] }> {
    if (!Platform.isDesktopApp) throw new Error("本地音视频导入只支持 Obsidian 桌面版");
    if (!this.browserCaptureServer) throw new Error("内容整理服务尚未初始化");
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) throw new Error("当前 Vault 不是本地文件系统");
    const mediaFolder = this.desktopMediaImportFolder();
    const noteFolder = this.desktopLinkFolder();
    await this.ensureVaultFolder(mediaFolder.split("/"));
    await this.ensureVaultFolder(noteFolder.split("/"));
    const vaultRoot = adapter.getFullPath("");
    const seenSourcePaths = new Set<string>();
    const files: TFile[] = [];
    let imported = 0;
    let failed = 0;

    for (let index = 0; index < selectedFiles.length; index += 1) {
      const selected = selectedFiles[index]!;
      let sourcePath = "";
      let title = localMediaImportTitle(selected.name || `本地媒体 ${index + 1}`);
      const id = `${Date.now()}-${index}-${selected.name}`;
      try {
        sourcePath = this.desktopSelectedFilePath(selected);
        if (!sourcePath) throw new Error("没有取得本地文件路径，请重新选择文件");
        if (seenSourcePaths.has(sourcePath)) continue;
        seenSourcePaths.add(sourcePath);
        const sourceName = selected.name || basename(sourcePath);
        const mediaType = localMediaImportType(sourceName);
        if (!mediaType) throw new Error("不支持该文件格式");
        title = localMediaImportTitle(sourceName);
        const sourceStat = await stat(sourcePath);
        if (!sourceStat.isFile()) throw new Error("选择的项目不是文件");
        onProgress?.({ id, title, state: "copying", message: "正在导入 Vault" });

        const relativeSource = relative(vaultRoot, sourcePath);
        const sourceAlreadyInVault = relativeSource
          && relativeSource !== ".."
          && !relativeSource.startsWith(`..${sep}`)
          && !isAbsolute(relativeSource);
        let mediaPath: string;
        if (sourceAlreadyInVault) {
          mediaPath = normalizePath(relativeSource);
        } else {
          const fileName = safeLocalMediaImportFileName(sourceName);
          mediaPath = await this.uniqueFileSystemVaultPath(`${mediaFolder}/${fileName}`, adapter, access);
          await copyFile(sourcePath, adapter.getFullPath(mediaPath));
        }

        const reconcile = (adapter as FileSystemAdapter & {
          reconcileInternalFile?: (path: string) => Promise<void>;
        }).reconcileInternalFile;
        if (reconcile) await reconcile.call(adapter, mediaPath).catch(() => undefined);
        const mediaFile = await this.waitForVaultFile(mediaPath, 10_000);
        if (!(mediaFile instanceof TFile)) throw new Error("文件已复制，但 Obsidian 尚未识别，请稍后重试");

        const notePath = this.uniqueVaultPath(`${noteFolder}/${title}.md`);
        const note = await this.app.vault.create(
          notePath,
          buildLocalMediaImportNote(title, mediaPath, mediaType, new Date()),
        );
        this.clearPendingNewNoteInitialization(note.path);
        this.cancelAutomaticLinkNote(note.path);
        await this.ensureNewNoteStatus(note, { skipAI: true });
        this.clearPendingNewNoteInitialization(note.path);
        this.cancelAutomaticLinkNote(note.path);
        const job = await this.browserCaptureServer.enqueueLinkNote(note, "manual");
        files.push(note);
        imported += 1;
        onProgress?.({
          id,
          title,
          notePath: note.path,
          state: "queued",
          message: "已导入，正在后台转录和整理",
        });
        void this.browserCaptureServer.waitForJob(job.id).then((completed) => {
          const completedPath = completed.result?.relativePath || note.path;
          onProgress?.({
            id,
            title,
            notePath: completedPath,
            state: completed.status === "completed" ? "completed" : "failed",
            message: completed.status === "completed"
              ? "解析完成"
              : `已保留原文件和笔记：${completed.error || completed.message}`,
          });
          this.refreshReadingViews();
        }).catch((error) => {
          onProgress?.({
            id,
            title,
            notePath: note.path,
            state: "failed",
            message: error instanceof Error ? error.message : String(error),
          });
        });
      } catch (error) {
        failed += 1;
        console.error(`KnowGrove: failed to import local media ${sourcePath || selected.name}`, error);
        onProgress?.({
          id,
          title,
          state: "failed",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    this.refreshReadingViews();
    return { total: selectedFiles.length, imported, failed, files };
  }

  private desktopSelectedFilePath(file: File): string {
    const legacyPath = (file as File & { path?: string }).path?.trim();
    if (legacyPath) return legacyPath;
    try {
      const desktopWindow = window as Window & {
        require?: (moduleId: "electron") => {
          webUtils: { getPathForFile(value: File): string };
        };
      };
      return desktopWindow.require?.("electron").webUtils.getPathForFile(file).trim() ?? "";
    } catch {
      return "";
    }
  }

  private async uniqueFileSystemVaultPath(
    requestedPath: string,
    adapter: FileSystemAdapter,
    access: typeof import("node:fs/promises").access,
  ): Promise<string> {
    const normalized = normalizePath(requestedPath);
    const extensionMatch = /(\.[^./]+)$/.exec(normalized);
    const extension = extensionMatch?.[1] ?? "";
    const base = extension ? normalized.slice(0, -extension.length) : normalized;
    for (let index = 1; index < 10_000; index += 1) {
      const candidate = index === 1 ? normalized : `${base} (${index})${extension}`;
      if (this.app.vault.getAbstractFileByPath(candidate)) continue;
      const exists = await access(adapter.getFullPath(candidate)).then(() => true).catch(() => false);
      if (!exists) return candidate;
    }
    throw new Error(`无法为导入文件生成唯一名称：${requestedPath}`);
  }

  private async finalizeDesktopRecording(
    manifest: DesktopRecordingManifest,
    audioPath: string,
  ): Promise<string | undefined> {
    const folder = this.desktopRecordingFolder();
    await this.ensureVaultFolder(folder.split("/"));
    const notePath = this.uniqueVaultPath(`${folder}/${manifest.title}.md`);
    const note = await this.app.vault.create(notePath, buildDesktopRecordingNote(manifest, audioPath));
    this.clearPendingNewNoteInitialization(note.path);
    this.cancelAutomaticLinkNote(note.path);
    await this.ensureNewNoteStatus(note, { skipAI: true });
    this.processDesktopRecordingInBackground(note.path, audioPath);
    this.refreshReadingViews();
    return note.path;
  }

  private processDesktopRecordingInBackground(notePath: string, audioPath: string): void {
    window.setTimeout(() => {
      void (async () => {
        const note = this.app.vault.getAbstractFileByPath(notePath);
        if (note instanceof TFile) await this.ensureNewNoteStatus(note);
        await this.waitForVaultFile(audioPath);
        const current = this.app.vault.getAbstractFileByPath(notePath);
        if (current instanceof TFile && this.settings.browserCapture.autoProcessLinkNotes) {
          await this.parseLinkNote(current, "auto");
        }
      })().catch((error) => {
        console.error(`KnowGrove: background recording processing failed for ${notePath}`, error);
      });
    }, 0);
  }

  private async waitForVaultFile(path: string, timeoutMilliseconds = 5_000): Promise<TFile | undefined> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMilliseconds) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) return file;
      await new Promise<void>((resolve) => window.setTimeout(resolve, 100));
    }
    return undefined;
  }

  getBrowserCaptureStatus(): BrowserCaptureServerStatus {
    return this.browserCaptureServer?.getStatus() ?? {
      running: false,
      address: `http://127.0.0.1:${this.settings.browserCapture.port}`,
    };
  }

  async auditRuntimeEnvironment(): Promise<KnowGroveRuntimeAudit> {
    if (!this.runtimeManager) throw new Error("运行环境管理器尚未初始化");
    const audit = await this.runtimeManager.audit();
    const providers = await this.getAIProviders().catch(() => []);
    const available = providers.filter((provider) => provider.available);
    const ai = audit.capabilities.find((capability) => capability.id === "ai");
    if (ai && available.length) {
      ai.status = "ready";
      ai.detail = `已检测到 ${available.map((provider) => provider.name).slice(0, 2).join("、")}`;
    }
    return audit;
  }

  getRuntimeInstallProgress(): RuntimeInstallProgress | undefined {
    return this.latestRuntimeInstallProgress
      ? { ...this.latestRuntimeInstallProgress }
      : undefined;
  }

  subscribeRuntimeInstallProgress(
    listener: (progress: RuntimeInstallProgress) => void,
  ): () => void {
    this.runtimeInstallProgressListeners.add(listener);
    if (this.latestRuntimeInstallProgress) listener({ ...this.latestRuntimeInstallProgress });
    return () => this.runtimeInstallProgressListeners.delete(listener);
  }

  private reportRuntimeInstallProgress(progress: RuntimeInstallProgress): void {
    this.latestRuntimeInstallProgress = { ...progress };
    for (const listener of this.runtimeInstallProgressListeners) {
      listener({ ...progress });
    }
  }

  async installRuntimeEnvironment(
    onProgress?: (progress: RuntimeInstallProgress) => void,
  ): Promise<void> {
    if (!this.runtimeManager) throw new Error("运行环境管理器尚未初始化");
    const startsNewInstall = !this.runtimeInstallPromise;
    if (startsNewInstall) this.latestRuntimeInstallProgress = undefined;
    const unsubscribe = onProgress
      ? this.subscribeRuntimeInstallProgress(onProgress)
      : undefined;
    if (startsNewInstall) {
      this.runtimeInstallPromise = (async () => {
        await this.runtimeManager!.install((progress) => this.reportRuntimeInstallProgress(progress));
        await this.restartBrowserCaptureServer();
      })().finally(() => {
        this.runtimeInstallPromise = undefined;
      });
    }
    try {
      await this.runtimeInstallPromise;
    } finally {
      unsubscribe?.();
    }
  }

  private ensureRuntimeEnvironmentOnStartup(): Promise<void> {
    if (
      !Platform.isDesktopApp
      || this.settings.runtime.mode === "existing"
      || !this.runtimeManager
    ) {
      return Promise.resolve();
    }
    if (!this.runtimeBootstrapPromise) {
      this.runtimeBootstrapPromise = this.bootstrapRuntimeEnvironment().catch((error) => {
        console.warn("KnowGrove: automatic runtime setup failed", error);
      });
    }
    return this.runtimeBootstrapPromise;
  }

  private async bootstrapRuntimeEnvironment(): Promise<void> {
    const audit = await this.auditRuntimeEnvironment();
    if (!shouldAutoConfigureRuntime(this.settings.runtime, audit)) return;
    let progressNotice: Notice | undefined;
    let downloaded = false;
    try {
      await this.installRuntimeEnvironment((progress) => {
        if (progress.phase === "downloading") downloaded = true;
        if (!downloaded) return;
        progressNotice ??= new Notice("KnowGrove 正在自动配置整理组件…", 0);
        const total = progress.totalBytes || audit.packageSizeBytes || 0;
        const size = total > 0
          ? `${formatRuntimeBytes(Math.min(progress.completedBytes, total))} / ${formatRuntimeBytes(total)}`
          : "";
        progressNotice.setMessage(
          `${progress.message}${size ? ` · ${size}` : ""}`,
        );
      });
      if (progressNotice) {
        progressNotice.setMessage("KnowGrove 整理组件已自动配置，可以直接使用");
        window.setTimeout(() => progressNotice?.hide(), 4_000);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (progressNotice) {
        progressNotice.setMessage(`整理组件自动配置未完成：${message}`);
        window.setTimeout(() => progressNotice?.hide(), 9_000);
      } else {
        console.warn(`KnowGrove: automatic runtime setup skipped: ${message}`);
      }
      throw error;
    }
  }

  private async getRuntimeSkillInstruction(pageType: BrowserCapturePageType): Promise<string> {
    const pack = await this.runtimeManager?.readSkillPack();
    return pack?.skills[pageType].prompt ?? "";
  }

  async restartBrowserCaptureServer(): Promise<void> {
    if (!Platform.isDesktopApp) {
      new Notice("浏览器一键入库只支持 Obsidian 桌面版");
      return;
    }
    await this.browserCaptureServer?.restart();
  }

  async resetBrowserPairing(): Promise<void> {
    await this.browserCaptureServer?.resetPairing();
  }

  subscribeCaptureJobs(listener: (jobs: BrowserCaptureJob[]) => void): () => void {
    if (!this.browserCaptureServer) return () => undefined;
    return this.browserCaptureServer.subscribe(listener);
  }

  getCaptureJobs(): BrowserCaptureJob[] {
    return this.browserCaptureServer?.getJobs() ?? [];
  }

  async cancelCaptureJob(id: string): Promise<void> {
    await this.browserCaptureServer?.cancelJob(id);
  }

  pruneFinishedCaptureJobs(idsToPrune?: Set<string>): void {
    this.browserCaptureServer?.pruneFinishedJobs(idsToPrune);
  }

  private async parseLinkNote(file: TFile, source: "manual" | "auto"): Promise<boolean> {
    if (!this.browserCaptureServer) return false;
    try {
      const job = await this.browserCaptureServer.enqueueLinkNote(file, source);
      if (source === "manual") {
        const label = job.pageType === "video" ? "视频" : job.pageType === "audio" ? "语音" : "网页文章";
        new Notice(`已识别为${label}，正在后台解析并写回当前笔记`, 6000);
        void this.browserCaptureServer.waitForJob(job.id).then((completed) => {
          new Notice(
            completed.status === "completed"
              ? `${label}解析完成`
              : `${label}已保存，但处理未全部完成：${completed.error || completed.message}`,
            completed.status === "completed" ? 5000 : 9000,
          );
        }).catch((error) => {
          new Notice(error instanceof Error ? error.message : String(error), 7000);
        });
      }
      return true;
    } catch (error) {
      if (source === "manual") {
        new Notice(`无法解析：${error instanceof Error ? error.message : String(error)}`, 7000);
      }
      return false;
    }
  }

  async parseLinkNoteManually(file: TFile): Promise<void> {
    await this.parseLinkNote(file, "manual");
  }

  private scheduleAutomaticLinkNote(file: TFile): void {
    if (!Platform.isDesktopApp || file.extension !== "md" || !this.settings.browserCapture.autoProcessLinkNotes) return;
    const folder = normalizePath(
      this.settings.browserCapture.watchFolder.trim()
      || this.settings.trackedFolder.trim(),
    ).replace(/^\/+|\/+$/g, "");
    if (folder && file.path !== folder && !file.path.startsWith(`${folder}/`)) return;

    const existingTimer = this.automaticLinkNoteTimers.get(file.path);
    if (existingTimer !== undefined) {
      window.clearTimeout(existingTimer);
      this.automaticLinkNoteTimers.delete(file.path);
    }

    const attempt = (remaining: number, delay: number): void => {
      const timer = window.setTimeout(() => {
        this.automaticLinkNoteTimers.delete(file.path);
        const current = this.app.vault.getAbstractFileByPath(file.path);
        if (!(current instanceof TFile)) return;
        void this.parseLinkNote(current, "auto").then((accepted) => {
          if (!accepted && remaining > 1) attempt(remaining - 1, 2_500);
        });
      }, delay);
      this.automaticLinkNoteTimers.set(file.path, timer);
    };
    attempt(3, 1_500);
  }

  private cancelAutomaticLinkNote(path: string): void {
    const timer = this.automaticLinkNoteTimers.get(path);
    if (timer === undefined) return;
    window.clearTimeout(timer);
    this.automaticLinkNoteTimers.delete(path);
  }

  private automaticLinkNoteFolder(): string {
    return normalizePath(
      this.settings.browserCapture.watchFolder.trim()
      || this.settings.trackedFolder.trim(),
    ).replace(/^\/+|\/+$/g, "");
  }

  async scanPendingLinkNotes(showNotice = true): Promise<number> {
    if (!Platform.isDesktopApp) {
      if (showNotice) new Notice("链接内容整理只支持 Obsidian 桌面版");
      return 0;
    }
    if (!this.browserCaptureServer) {
      if (showNotice) new Notice("内容整理服务尚未初始化");
      return 0;
    }
    if (this.linkNoteScanPromise) {
      if (showNotice) new Notice("正在检查新链接文档");
      return this.linkNoteScanPromise;
    }

    const scan = async (): Promise<number> => {
      const folder = this.automaticLinkNoteFolder();
      const recent = latestLinkNoteScanFiles(
        this.filesUnderVaultFolder(folder).filter((file) => file.extension === "md").map((file) => ({
          path: file.path,
          mtime: file.stat.mtime,
        })),
        folder,
        200,
      );
      let queued = 0;
      for (const item of recent) {
        if (queued >= 50) break;
        const file = this.app.vault.getAbstractFileByPath(item.path);
        if (!(file instanceof TFile)) continue;
        const markdown = await this.app.vault.cachedRead(file).catch(() => "");
        if (
          !detectLinkNoteCandidate(markdown, file.basename)
          && !detectInterruptedCapture(markdown)
        ) continue;
        try {
          await this.browserCaptureServer!.enqueueLinkNote(file, "auto");
          queued += 1;
        } catch (error) {
          console.error(`KnowGrove: failed to enqueue link note ${file.path}`, error);
        }
      }
      if (showNotice) {
        new Notice(
          queued
            ? `已发现 ${queued} 篇新链接文档，正在后台整理并写回原文件`
            : "没有发现需要整理的新链接文档",
          queued ? 6000 : 3500,
        );
      } else if (queued) {
        new Notice(`KnowGrove 已自动开始整理 ${queued} 篇新链接文档`, 5000);
      }
      return queued;
    };

    this.linkNoteScanPromise = scan().finally(() => {
      this.linkNoteScanPromise = undefined;
    });
    return this.linkNoteScanPromise;
  }

  openKnowGroveSettings(section = ""): void {
    const settingsManager = (this.app as typeof this.app & {
      setting: {
        open(): void;
        openTabById(id: string): void;
      };
    }).setting;
    settingsManager.open();
    settingsManager.openTabById(this.manifest.id);
    if (section === "browser-capture" || section === "runtime") {
      window.setTimeout(() => {
        document.querySelector<HTMLElement>(
          section === "runtime" ? ".knowgrove-runtime-settings" : ".knowgrove-browser-capture-settings",
        )
          ?.scrollIntoView({ block: "start", behavior: "smooth" });
      }, 120);
    }
  }

  private async runBrowserCaptureProvider(
    provider: AIProviderId,
    prompt: string,
    signal?: AbortSignal,
  ): Promise<BrowserProviderRunResult> {
    try {
      return await runBrowserProviderWithHandoff({
        requestedProvider: provider,
        getSettings: () => ({ ...this.settings.aiProperties }),
        signal,
        execute: async (configuration, runSignal, attempt) => {
          const availability = await this.getAIProviders(attempt > 0);
          const selected = availability.find((item) => item.id === configuration.provider);
          if (!selected?.available) {
            throw new Error(selected?.detail || `${providerName(configuration.provider)} 当前不可用`);
          }
          return runAIProvider({
            ...configuration,
            timeoutSeconds: Math.max(900, configuration.timeoutSeconds),
          }, prompt, availability, this.getAISecret(configuration.provider), runSignal);
        },
      });
    } catch (error) {
      if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${message}；整理未完成，请重新处理`);
    }
  }

  supportsAISecretStorage(): boolean {
    return Boolean((this.app as typeof this.app & { secretStorage?: unknown }).secretStorage);
  }

  getAISecret(provider: AIProviderId): string | undefined {
    if (provider !== "anthropic-api" && provider !== "openai-compatible") return undefined;
    const storage = (this.app as typeof this.app & {
      secretStorage?: { getSecret(id: string): string | null };
    }).secretStorage;
    const current = storage?.getSecret(AI_SECRET_IDS[provider]) || undefined;
    if (current || !storage) return current;
    const legacy = storage.getSecret(LEGACY_AI_SECRET_IDS[provider]) || undefined;
    if (legacy) storage.setSecret(AI_SECRET_IDS[provider], legacy);
    return legacy;
  }

  setAISecret(provider: AIProviderId, value: string): void {
    if (provider !== "anthropic-api" && provider !== "openai-compatible") return;
    const storage = (this.app as typeof this.app & {
      secretStorage?: { setSecret(id: string, secret: string): void };
    }).secretStorage;
    if (!storage) throw new Error("当前 Obsidian 版本不支持安全密钥存储");
    storage.setSecret(AI_SECRET_IDS[provider], value);
    if (!value) storage.setSecret(LEGACY_AI_SECRET_IDS[provider], "");
  }

  getCreationImageSecret(): string | undefined {
    const storage = (this.app as typeof this.app & {
      secretStorage?: { getSecret(id: string): string | null };
    }).secretStorage;
    return storage?.getSecret(CREATION_IMAGE_SECRET_ID) || undefined;
  }

  setCreationImageSecret(value: string): void {
    const storage = (this.app as typeof this.app & {
      secretStorage?: { setSecret(id: string, secret: string): void };
    }).secretStorage;
    if (!storage) throw new Error("当前 Obsidian 版本不支持安全密钥存储");
    storage.setSecret(CREATION_IMAGE_SECRET_ID, value);
  }

  clearAIProviderDetection(): void {
    this.aiProviderAvailability = undefined;
    this.aiDetectionPromise = undefined;
  }

  getCachedAIProviders(): AIProviderAvailability[] | undefined {
    return this.aiProviderAvailability?.map((provider) => ({ ...provider }));
  }

  async getAIProviders(force = false): Promise<AIProviderAvailability[]> {
    if (force) this.clearAIProviderDetection();
    if (this.aiProviderAvailability) return this.getCachedAIProviders() ?? [];
    if (!this.aiDetectionPromise) {
      this.aiDetectionPromise = detectAIProviders(this.settings.aiProperties, {
        secretStorageAvailable: this.supportsAISecretStorage(),
        anthropicApiKey: this.getAISecret("anthropic-api"),
        openAICompatibleApiKey: this.getAISecret("openai-compatible"),
      })
        .then((providers) => {
          this.aiProviderAvailability = providers;
          return providers;
        })
        .finally(() => {
          this.aiDetectionPromise = undefined;
        });
    }
    return (await this.aiDetectionPromise).map((provider) => ({ ...provider }));
  }

  getAIPropertyRunState(): AIPropertyRunState {
    return { ...this.aiRunState };
  }

  dismissAIPropertyRunState(): void {
    if (this.aiRunState.running) return;
    this.aiRunState = {
      running: false,
      total: 0,
      completed: 0,
      failed: 0,
      message: "等待待规范批量处理",
    };
    this.refreshPropertyWorkbenches();
  }

  getAIProviderSummary(): string {
    const settings = this.settings.aiProperties;
    const detected = this.aiProviderAvailability?.find((provider) => provider.id === settings.provider);
    const model = settings.model.trim() || detected?.configuredModel || "默认模型";
    return `${providerName(settings.provider)} · ${model}`;
  }

  private async readAIPropertyContext(file: TFile): Promise<{
    body: string;
    frontmatter: Record<string, unknown>;
  }> {
    const content = await this.app.vault.read(file);
    const info = getFrontMatterInfo(content);
    let frontmatter: Record<string, unknown> = {};
    if (info.exists && info.frontmatter.trim()) {
      try {
        const parsed = parseYaml(info.frontmatter) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          frontmatter = parsed as Record<string, unknown>;
        }
      } catch (error) {
        throw new Error(`无法解析 YAML frontmatter：${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return { body: content.slice(info.contentStart), frontmatter };
  }

  private async enrichFileWithAI(file: TFile, overwrite: boolean): Promise<AIEnrichmentResult> {
    const generated = await this.generateAIPropertyForFile(file, overwrite);
    return this.applyAIPropertyGeneration(
      file,
      generated.context,
      generated.dimensions,
      generated.result,
      overwrite,
    );
  }

  private async generateAIPropertyForFile(
    file: TFile,
    overwrite: boolean,
    requestedProperties?: string[],
  ): Promise<{
    context: { body: string; frontmatter: Record<string, unknown> };
    dimensions: PropertyDimensionConfig[];
    result: AIPropertyGeneration;
  }> {
    const settings = this.settings.aiProperties;
    if (!settings.enabled) throw new Error("AI 自动属性尚未启用");
    const context = await this.readAIPropertyContext(file);
    let dimensions = pendingAIManagedDimensions(
      this.settings.propertySystem.dimensions,
      context.frontmatter,
      overwrite,
    );
    if (requestedProperties?.length) {
      const requested = new Set(requestedProperties);
      dimensions = dimensions.filter((dimension) => requested.has(dimension.name));
    }
    if (!dimensions.length) return { context, dimensions, result: { properties: {} } };

    const availability = await this.getAIProviders();
    const selected = availability.find((provider) => provider.id === settings.provider);
    if (selected && !selected.available) throw new Error(selected.detail);
    const prompt = buildAIPropertyPrompt({
      path: file.path,
      basename: file.basename,
      body: context.body,
      frontmatter: context.frontmatter,
      dimensions,
      maxContentCharacters: automaticAIContentCharacterLimit(
        settings.provider,
        settings.model,
        selected?.configuredModel,
      ),
      taxonomy: this.settings.propertySystem.taxonomy,
    });
    const raw = await runAIProvider(settings, prompt, availability, this.getAISecret(settings.provider));
    const result = parseAIPropertyResponse(raw, dimensions, context.frontmatter);
    return { context, dimensions, result };
  }

  private async applyAIPropertyGeneration(
    file: TFile,
    context: { body: string; frontmatter: Record<string, unknown> },
    dimensions: PropertyDimensionConfig[],
    generated: AIPropertyGeneration,
    overwrite: boolean,
  ): Promise<AIEnrichmentResult> {
    const before = new Map(dimensions.map((dimension) => [
      dimension.name,
      JSON.stringify(context.frontmatter[dimension.name]),
    ]));
    let applied = 0;
    let updatedFrontmatter = context.frontmatter;
    await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
      for (const [property, value] of Object.entries(generated.properties)) {
        if (JSON.stringify(frontmatter[property]) !== before.get(property)) continue;
        if (!overwrite && !isEmptyPropertyValue(frontmatter[property])) continue;
        frontmatter[property] = value;
        applied += 1;
      }
      updatedFrontmatter = JSON.parse(JSON.stringify(frontmatter)) as Record<string, unknown>;
    });
    return {
      applied,
      frontmatter: updatedFrontmatter,
      confidence: generated.confidence,
      reason: generated.reason,
    };
  }

  private aiPropertyCandidates(): TFile[] {
    const dimensions = aiManagedDimensions(this.settings.propertySystem.dimensions);
    if (!dimensions.length) return [];
    return this.app.vault.getMarkdownFiles().filter((file) => {
      if (!isPropertyGovernedPath(file.path, this.settings.propertySystem)) return false;
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
      return pendingAIManagedDimensions(dimensions, frontmatter, false).length > 0;
    });
  }

  async openAIPropertyBatch(): Promise<void> {
    if (!this.settings.aiProperties.enabled) {
      new Notice("请先在插件设置中启用 AI 自动属性");
      this.openPropertySettings();
      return;
    }
    if (this.aiRunState.running) {
      new Notice("AI 属性任务正在运行");
      return;
    }
    const files = this.aiPropertyCandidates();
    if (!files.length) {
      new Notice("没有需要 AI 补齐的缺失属性");
      return;
    }
    const fields = aiManagedDimensions(this.settings.propertySystem.dimensions).map((dimension) => dimension.name);
    new AIPropertyBatchModal(
      this.app,
      files.length,
      fields,
      this.getAIProviderSummary(),
      () => this.executeAIPropertyBatch(files),
    ).open();
  }

  openPropertyAuditAIRepairBatch(audit: PropertyAudit): void {
    if (!this.settings.aiProperties.enabled) {
      new Notice("请先在插件设置中启用 AI 自动属性");
      this.openPropertySettings();
      return;
    }
    if (this.aiRunState.running) {
      new Notice("AI 属性任务正在运行");
      return;
    }
    const aiNames = new Set(aiManagedDimensions(this.settings.propertySystem.dimensions).map((dimension) => dimension.name));
    const requested = new Map<string, Set<string>>();
    for (const issue of audit.issues) {
      if (!issue.automatic && aiNames.has(issue.property)) {
        const properties = requested.get(issue.path) ?? new Set<string>();
        properties.add(issue.property);
        requested.set(issue.path, properties);
      }
    }
    const files = Array.from(requested.keys())
      .map((path) => this.app.vault.getAbstractFileByPath(path))
      .filter((file): file is TFile => file instanceof TFile);
    if (!files.length) {
      new Notice("当前待规范项中没有可交给 AI 的语义字段");
      return;
    }
    const fields = Array.from(new Set(Array.from(requested.values()).flatMap((names) => Array.from(names))));
    new AIPropertyBatchModal(
      this.app,
      files.length,
      fields,
      this.getAIProviderSummary(),
      () => this.executeAIPropertyBatch(files, requested, true),
      "repair",
    ).open();
  }

  private async executeAIPropertyBatch(
    files: TFile[],
    requestedDimensions?: Map<string, Set<string>>,
    overwrite = false,
  ): Promise<void> {
    this.aiBatchCancelRequested = false;
    this.aiRunState = {
      running: true,
      total: files.length,
      completed: 0,
      failed: 0,
      message: "正在启动属性检查…",
    };
    let cleanedFiles = 0;
    let removedBlankLines = 0;
    this.refreshPropertyWorkbenches();
    try {
      const availability = await this.getAIProviders();
      const selected = availability.find((provider) => provider.id === this.settings.aiProperties.provider);
      if (selected && !selected.available) throw new Error(selected.detail);
      for (let start = 0; start < files.length && !this.aiBatchCancelRequested; start += AI_BATCH_SIZE * AI_BATCH_CONCURRENCY) {
        const groups: TFile[][] = [];
        for (let offset = 0; offset < AI_BATCH_CONCURRENCY; offset += 1) {
          const group = files.slice(start + offset * AI_BATCH_SIZE, start + (offset + 1) * AI_BATCH_SIZE);
          if (group.length) groups.push(group);
        }
        const cleanup = await Promise.all(groups.map((group) => this.executeAIPropertyBatchGroup(group, availability, requestedDimensions, overwrite)));
        for (const result of cleanup) {
          cleanedFiles += result.cleanedFiles;
          removedBlankLines += result.removedBlankLines;
        }
      }
    } catch (error) {
      this.aiRunState.failed += Math.max(0, files.length - this.aiRunState.completed);
      this.aiRunState.message = `属性检查中止：${error instanceof Error ? error.message : String(error)}`;
      console.error("KnowGrove: property check batch failed", error);
    }
    const failed = this.aiRunState.failed;
    const cancelled = this.aiBatchCancelRequested;
    this.aiRunState = {
      ...this.aiRunState,
      running: false,
      currentPath: undefined,
      message: cancelled
        ? `属性检查已停止，已处理 ${this.aiRunState.completed} 篇，失败 ${failed} 篇`
        : failed
        ? `属性检查完成，成功 ${files.length - failed} 篇，失败 ${failed} 篇`
        : `属性检查完成，共 ${files.length} 篇`,
    };
    if (cleanedFiles) {
      this.aiRunState.message += `；已整理 ${cleanedFiles} 篇文档的 ${removedBlankLines} 个多余空行`;
    }
    const snapshot = await this.scanPropertyWorkspace(new Set(files.map((file) => file.path)));
    this.aiRunState.message += snapshot.audit.nonCompliantFiles
      ? `；仍有 ${snapshot.audit.nonCompliantFiles} 篇需要判断`
      : "；当前文档已全部符合规范";
    this.refreshPropertyWorkbenches(snapshot);
    new Notice(this.aiRunState.message);
  }

  private async executeAIPropertyBatchGroup(
    files: TFile[],
    availability: AIProviderAvailability[],
    requestedDimensions?: Map<string, Set<string>>,
    overwrite = false,
  ): Promise<{ cleanedFiles: number; removedBlankLines: number }> {
    let cleanedFiles = 0;
    let removedBlankLines = 0;
    const contexts: AIBatchContext[] = [];
    for (const file of files) {
      if (this.aiBatchCancelRequested) return { cleanedFiles, removedBlankLines };
      try {
        const context = await this.readAIPropertyContext(file);
        const requested = requestedDimensions?.get(file.path);
        const dimensions = requested
          ? aiManagedDimensions(this.settings.propertySystem.dimensions).filter((dimension) => requested.has(dimension.name))
          : pendingAIManagedDimensions(this.settings.propertySystem.dimensions, context.frontmatter, false);
        contexts.push({ file, path: file.path, basename: file.basename, body: context.body, frontmatter: context.frontmatter, dimensions });
      } catch (error) {
        this.aiRunState.failed += 1;
        this.aiRunState.completed += 1;
        console.error(`KnowGrove: failed to read ${file.path} for AI batch`, error);
      }
    }
    const pending = contexts.filter((context) => context.dimensions.length > 0);
    const completedWithoutAI = contexts.filter((context) => context.dimensions.length === 0);
    this.aiRunState.completed += completedWithoutAI.length;
    if (!pending.length || this.aiBatchCancelRequested) {
      this.refreshPropertyWorkbenches();
      return { cleanedFiles, removedBlankLines };
    }

    const promptItems: AIBatchPromptItem[] = pending.map(({ path, basename, body, frontmatter, dimensions }) => ({
      path,
      basename,
      body,
      frontmatter,
      dimensions,
    }));
    let generated = new Map<string, AIPropertyGeneration>();
    let lastError: unknown;
    for (let attempt = 1; attempt <= AI_BATCH_RETRY_LIMIT; attempt += 1) {
      try {
        const prompt = buildAIBatchPropertyPrompt(
          promptItems,
          this.settings.propertySystem.taxonomy,
          AI_BATCH_BODY_CHARACTERS,
        );
        const raw = await runAIProvider(
          this.settings.aiProperties,
          prompt,
          availability,
          this.getAISecret(this.settings.aiProperties.provider),
        );
        generated = parseAIBatchPropertyResponse(raw, promptItems);
        if (!generated.size) throw new Error("模型没有返回可用的批量属性结果");
        break;
      } catch (error) {
        lastError = error;
        if (attempt < AI_BATCH_RETRY_LIMIT) {
          console.warn(`KnowGrove: retrying AI batch (${attempt}/${AI_BATCH_RETRY_LIMIT})`, error);
        }
      }
    }
    for (const context of contexts) {
      if (this.aiBatchCancelRequested) return { cleanedFiles, removedBlankLines };
      this.aiRunState.currentPath = context.path;
      this.aiRunState.message = `属性检查 ${this.aiRunState.completed}/${this.aiRunState.total} · ${context.basename}`;
      const result = generated.get(context.path);
      try {
        if (context.dimensions.length > 0 && !result) {
          throw lastError instanceof Error ? lastError : new Error("模型未返回该笔记的有效属性");
        }
        if (result) {
          await this.applyAIPropertyGeneration(context.file, context, context.dimensions, result, overwrite);
          const cleanup = await this.cleanupBlankLinesAfterPropertyCheck(context.file);
          if (cleanup.changed) {
            cleanedFiles += 1;
            removedBlankLines += cleanup.removedBlankLines;
          }
        }
      } catch (error) {
        this.aiRunState.failed += 1;
        console.error(`KnowGrove: AI property enrichment failed for ${context.path}`, error);
      }
      this.aiRunState.completed += 1;
      if (this.aiRunState.completed % 5 === 0 || this.aiRunState.completed >= this.aiRunState.total) {
        this.refreshPropertyWorkbenches();
      }
    }
    return { cleanedFiles, removedBlankLines };
  }

  stopAIPropertyBatch(): void {
    if (!this.aiRunState.running) {
      new Notice("当前没有运行中的 AI 属性任务");
      return;
    }
    this.aiBatchCancelRequested = true;
    new Notice("已请求停止 AI 属性任务；当前批次完成后停止，已写入结果会保留");
  }

  private async refreshCurrentNoteAIProperties(file: TFile): Promise<void> {
    if (!this.settings.aiProperties.enabled) {
      new Notice("请先在插件设置中启用 AI 自动属性");
      return;
    }
    try {
      new Notice(`AI 正在刷新：${file.basename}`);
      const result = await this.enrichFileWithAI(file, true);
      new Notice(result.applied ? `AI 已更新 ${result.applied} 个属性` : "没有可更新的 AI 属性");
      await this.scanPropertyWorkspace();
    } catch (error) {
      console.error(`KnowGrove: AI property refresh failed for ${file.path}`, error);
      new Notice(`AI 属性刷新失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  getTrackedMarkdownFiles(): TFile[] {
    return this.app.vault.getMarkdownFiles().filter((file) => this.isTrackedFile(file));
  }

  isTrackedFile(file: TFile): boolean {
    const folder = this.settings.trackedFolder.trim();
    if (!folder) return true;
    const normalized = normalizePath(folder).replace(/^\/+|\/+$/g, "");
    return file.path.startsWith(`${normalized}/`);
  }

  classifyStatus(file: TFile): "reading" | "finished" | "unclassified" {
    const cachedFrontmatter: unknown = this.app.metadataCache.getFileCache(file)?.frontmatter;
    const frontmatter = cachedFrontmatter && typeof cachedFrontmatter === "object" && !Array.isArray(cachedFrontmatter)
      ? cachedFrontmatter as Record<string, unknown>
      : undefined;
    const value = frontmatter?.[this.settings.statusProperty];
    if (value === this.settings.finishedStatus) return "finished";
    if (value === this.settings.readingStatus) return "reading";
    return "unclassified";
  }

  async setReadingStatus(file: TFile, value: string, automatic = false): Promise<void> {
    await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
      frontmatter[this.settings.statusProperty] = value;
    });
    this.resetAutoCompletionTracking();
    this.refreshReadingViews();
    new Notice(automatic ? `已读到文末，《${file.basename}》自动标为${value}` : `已将《${file.basename}》标为${value}`);
  }

  resetAutoCompletionTracking(): void {
    window.clearTimeout(this.autoCompletionTimer);
    this.autoCompletionTimer = undefined;
    this.completionCandidate = undefined;
  }

  async initializeUnclassifiedNotes(): Promise<void> {
    const files = this.getTrackedMarkdownFiles().filter((file) => this.classifyStatus(file) === "unclassified");
    let updated = 0;
    for (const file of files) {
      await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
        if (frontmatter[this.settings.statusProperty] === undefined) {
          frontmatter[this.settings.statusProperty] = this.settings.readingStatus;
          updated += 1;
        }
      });
    }
    this.refreshReadingViews();
    new Notice(updated ? `已将 ${updated} 篇未分类笔记归入${this.settings.readingStatus}` : "没有需要补齐的笔记");
  }

  private async cleanupBlankLinesAfterPropertyCheck(file: TFile): Promise<{ changed: boolean; removedBlankLines: number }> {
    if (!this.settings.cleanupBlankLinesWithPropertyCheck) return { changed: false, removedBlankLines: 0 };
    let changed = false;
    let removedBlankLines = 0;
    await this.app.vault.process(file, (content) => {
      const result = cleanMarkdownBlankLines(content);
      changed = result.changed;
      removedBlankLines = result.removedBlankLines;
      return result.content;
    });
    return { changed, removedBlankLines };
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private registerKnowGroveProtocolHandler(action: string, handler: ObsidianProtocolHandler): void {
    type ProtocolRegistry = {
      handlers?: Map<string, ObsidianProtocolHandler>;
      unregister: (registeredAction: string, registeredHandler?: ObsidianProtocolHandler) => void;
    };
    const workspace = this.app.workspace as typeof this.app.workspace & { protocolHandler?: ProtocolRegistry };
    const registry = workspace.protocolHandler;
    const previousHandler = registry?.handlers?.get(action);
    if (previousHandler) registry?.unregister(action, previousHandler);
    this.registerObsidianProtocolHandler(action, handler);
  }

  private async normalizeCapturedImageLinks(file: TFile): Promise<void> {
    if (
      file.extension !== "md"
      || this.normalizingCaptureImageLinks.has(file.path)
      || this.normalizedCaptureImageLinkMtime.get(file.path) === file.stat.mtime
    ) return;
    this.normalizingCaptureImageLinks.add(file.path);
    try {
      const source = await this.app.vault.cachedRead(file);
      if (!isManagedCaptureMarkdown(source) || !source.includes("![[")) return;
      const imageExtensions = new Set(["avif", "bmp", "gif", "jpeg", "jpg", "png", "svg", "webp"]);
      const normalized = rewriteWikiImageEmbeds(source, (linkPath, alias) => {
        const target = this.app.metadataCache.getFirstLinkpathDest(linkPath, file.path)
          ?? this.app.vault.getFileByPath(normalizePath(linkPath));
        if (!(target instanceof TFile) || !imageExtensions.has(target.extension.toLowerCase())) return undefined;
        const portablePath = portableSiblingAssetLinkPath(target.path, file.path);
        const markdownLink = portablePath
          ? `[[${portablePath}${alias ? `|${alias}` : ""}]]`
          : this.app.fileManager.generateMarkdownLink(target, file.path, undefined, alias || undefined);
        return markdownLink.includes("file://") ? undefined : `!${markdownLink}`;
      });
      if (normalized !== source) await this.app.vault.modify(file, normalized);
    } catch (error) {
      console.warn(`KnowGrove: failed to normalize captured image links for ${file.path}`, error);
    } finally {
      this.normalizingCaptureImageLinks.delete(file.path);
      const currentFile = this.app.vault.getFileByPath(file.path);
      if (currentFile instanceof TFile) {
        this.normalizedCaptureImageLinkMtime.set(file.path, currentFile.stat.mtime);
      }
    }
  }

  refreshReadingViews(): void {
    window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      for (const leaf of this.app.workspace.getLeavesOfType(READING_VIEW_TYPE)) {
        if (leaf.view instanceof ReadingListView) leaf.view.refresh();
      }
    }, 80);
  }

  refreshDocumentAnchors(): void {
    this.documentAnchorManager?.refreshAll();
  }

  async activateReadingView(): Promise<void> {
    if (this.readingViewActivation) return this.readingViewActivation;
    this.readingViewActivation = this.activateReadingViewOnce();
    try {
      await this.readingViewActivation;
    } finally {
      this.readingViewActivation = undefined;
    }
  }

  async activatePropertyWorkbench(): Promise<void> {
    if (this.propertyWorkbenchActivation) return this.propertyWorkbenchActivation;
    this.propertyWorkbenchActivation = this.activatePropertyWorkbenchOnce();
    try {
      await this.propertyWorkbenchActivation;
    } finally {
      this.propertyWorkbenchActivation = undefined;
    }
  }

  async activateTopicIndex(): Promise<void> {
    if (!this.settings.enableTopicIndex) {
      new Notice("主题列表已在增强功能中关闭");
      return;
    }
    if (this.topicIndexActivation) return this.topicIndexActivation;
    this.topicIndexActivation = this.activateTopicIndexOnce();
    try {
      await this.topicIndexActivation;
    } finally {
      this.topicIndexActivation = undefined;
    }
  }

  activateLinkCapture(): LinkCaptureModal | null {
    if (!Platform.isDesktopApp) {
      new Notice("批量存链接目前只支持 Obsidian 桌面版");
      return null;
    }
    this.linkCaptureModal?.close();
    let modal: LinkCaptureModal;
    modal = new LinkCaptureModal(this, () => {
      if (this.linkCaptureModal === modal) this.linkCaptureModal = undefined;
    });
    this.linkCaptureModal = modal;
    modal.open();
    return modal;
  }

  async activateDesktopRecorder(): Promise<void> {
    if (!Platform.isDesktopApp) {
      new Notice("录音目前只支持 Obsidian 桌面版");
      return;
    }
    this.linkCaptureModal?.close();
    const existing = this.app.workspace.getLeavesOfType(DESKTOP_RECORDER_VIEW_TYPE)[0];
    const leaf = existing ?? this.app.workspace.getLeftLeaf(false);
    if (!leaf) {
      new Notice("无法打开录音");
      return;
    }
    if (!existing) await leaf.setViewState({ type: DESKTOP_RECORDER_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
    this.app.workspace.setActiveLeaf(leaf, { focus: true });
    this.syncRecordingOverlay();
  }

  private removeDeprecatedCaptureViews(): void {
    for (const viewType of [
      LEGACY_CAPTURE_CENTER_VIEW_TYPE,
      LINK_CAPTURE_VIEW_TYPE,
    ]) {
      for (const leaf of this.app.workspace.getLeavesOfType(viewType)) leaf.detach();
    }
  }

  private async activateReadingViewOnce(): Promise<void> {
    const existing = this.keepSingleCoreSidebarView(
      READING_VIEW_TYPE,
      (leaf) => leaf.view instanceof ReadingListView,
    );
    const leaf = existing ?? this.app.workspace.getLeftLeaf(false);
    if (!leaf) return;
    if (!existing) await leaf.setViewState({ type: READING_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  private async activatePropertyWorkbenchOnce(): Promise<void> {
    const existing = this.keepSingleCoreSidebarView(
      PROPERTY_WORKBENCH_VIEW_TYPE,
      (leaf) => leaf.view instanceof PropertyWorkbenchView,
    );
    const leaf = existing ?? this.app.workspace.getLeftLeaf(false);
    if (!leaf) {
      new Notice("无法打开工作台");
      return;
    }
    if (!existing) await leaf.setViewState({ type: PROPERTY_WORKBENCH_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
    if (leaf.view instanceof PropertyWorkbenchView) await leaf.view.ensureScanned();
  }

  private async activateTopicIndexOnce(): Promise<void> {
    const existing = this.keepSingleCoreSidebarView(
      TOPIC_INDEX_VIEW_TYPE,
      (leaf) => leaf.view instanceof TopicIndexView,
    );
    const leaf = existing ?? this.app.workspace.getLeftLeaf(false);
    if (!leaf) {
      new Notice("无法打开主题");
      return;
    }
    if (!existing) await leaf.setViewState({ type: TOPIC_INDEX_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
    if (leaf.view instanceof TopicIndexView) await leaf.view.ensureScanned();
  }

  async setTopicIndexEnabled(enabled: boolean): Promise<void> {
    this.settings.enableTopicIndex = enabled;
    await this.savePluginData();
    this.syncTopicIndexAvailability();
    if (enabled) {
      await this.ensureCoreSidebarViews();
      return;
    }
    for (const leaf of this.app.workspace.getLeavesOfType(TOPIC_INDEX_VIEW_TYPE)) leaf.detach();
  }

  private syncTopicIndexAvailability(): void {
    if (this.topicIndexRibbonEl) this.topicIndexRibbonEl.hidden = !this.settings.enableTopicIndex;
  }

  async scanPropertyWorkspace(forceFreshPaths: ReadonlySet<string> = new Set()): Promise<PropertyWorkspaceSnapshot> {
    const files = this.app.vault.getMarkdownFiles();
    const snapshots: PropertyNoteSnapshot[] = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      if (!file) continue;
      const knowledgeWorkspace = file.path.startsWith(`${TOPIC_WORKSPACE_ROOT}/`)
        || file.path.startsWith(`${RESEARCH_TOPIC_WORKSPACE_ROOT}/`)
        || file.path.startsWith(`${KNOWLEDGE_WORKSPACE_ROOT}/`);
      if (!knowledgeWorkspace && !isPropertyGovernedPath(file.path, this.settings.propertySystem)) continue;
      const forceFresh = forceFreshPaths.has(file.path);
      const cached = forceFresh ? undefined : this.app.metadataCache.getFileCache(file)?.frontmatter;
      let frontmatter = cached
        ? JSON.parse(JSON.stringify(cached)) as Record<string, unknown>
        : undefined;
      // Newly created workspace files can be visible in the Vault before the metadata
      // cache has indexed their frontmatter. Read only these few managed files as a
      // fallback so the Project/Life counters update immediately after creation.
      if (!frontmatter && (knowledgeWorkspace || forceFresh)) {
        try {
          const content = await this.app.vault.cachedRead(file);
          const info = getFrontMatterInfo(content);
          if (info.exists && info.frontmatter.trim()) {
            const parsed = parseYaml(info.frontmatter) as unknown;
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              frontmatter = parsed as Record<string, unknown>;
            }
          }
        } catch (error) {
          console.warn(`KnowGrove: failed to read fresh workspace metadata for ${file.path}`, error);
        }
      }
      snapshots.push({ path: file.path, basename: file.basename, frontmatter, mtime: file.stat.mtime });
      if (index > 0 && index % 500 === 0) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }
    }
    const analysis = analyzePropertyInventory(snapshots, this.settings.propertySystem);
    const audit = auditPropertySnapshots(snapshots, this.settings.propertySystem, {
      reading: {
        propertyName: this.settings.statusProperty,
        readingValue: this.settings.readingStatus,
        finishedValue: this.settings.finishedStatus,
      },
    });
    const knowledge = buildKnowledgeThemes(snapshots, this.settings.propertySystem);
    await this.hydrateResearchTopicSources(knowledge.themes, knowledge.documents);
    const workspaces = buildKnowledgeWorkspaces(snapshots, knowledge.documents);
    const snapshot: PropertyWorkspaceSnapshot = {
      inventory: analysis.inventory,
      suggestedDimensions: analysis.suggestedDimensions,
      audit,
      flowCounts: countPropertyFlowSnapshots(snapshots, this.settings.propertySystem),
      knowledgeThemes: knowledge.themes,
      knowledgeDocuments: knowledge.documents,
      knowledgeWorkspaces: workspaces,
      unassignedTopicFiles: knowledge.unassignedFiles,
    };
    this.refreshPropertyWorkbenches(snapshot);
    this.refreshTopicIndexViews(snapshot);
    return snapshot;
  }

  private async readResearchSourceState(workspacePath: string): Promise<ResearchSourceState | undefined> {
    const currentPath = normalizePath(researchSourceStatePath(workspacePath));
    const legacyPath = normalizePath(legacyResearchSourceStatePath(workspacePath));
    const path = await this.app.vault.adapter.exists(currentPath)
      ? currentPath
      : await this.app.vault.adapter.exists(legacyPath)
        ? legacyPath
        : undefined;
    if (!path) return undefined;
    try {
      return normalizeResearchSourceState(JSON.parse(await this.app.vault.adapter.read(path)) as unknown);
    } catch (error) {
      console.warn(`KnowGrove: failed to read research source state ${path}`, error);
      return undefined;
    }
  }

  private async writeResearchSourceState(workspacePath: string, state: ResearchSourceState): Promise<void> {
    const path = normalizePath(researchSourceStatePath(workspacePath));
    await this.app.vault.adapter.write(path, `${JSON.stringify(normalizeResearchSourceState(state), null, 2)}\n`);
  }

  private async hydrateResearchTopicSources(
    themes: KnowledgeThemeSummary[],
    documents: KnowledgeThemeDocument[],
  ): Promise<void> {
    const byPath = new Map(documents.map((document) => [document.path, document]));
    const topics = themes.flatMap((theme) => theme.researchTopics);
    await Promise.all(topics.map(async (topic) => {
      const state = await this.readResearchSourceState(topic.workspacePath);
      if (!state) return;
      const rejected = new Set(state.rejected);
      const adopted = state.adopted
        .filter((path) => !rejected.has(path))
        .map((path) => byPath.get(path))
        .filter((document): document is KnowledgeThemeDocument => Boolean(document));
      const candidates = state.candidates
        .filter((path) => !rejected.has(path))
        .map((path) => byPath.get(path))
        .filter((document): document is KnowledgeThemeDocument => Boolean(document));
      topic.documents = adopted;
      topic.explicitSourcePaths = adopted.map((document) => document.path);
      topic.total = adopted.length;
      topic.candidateDocuments = Array.from(new Map([
        ...adopted,
        ...candidates,
      ].map((document) => [document.path, document])).values());
    }));
  }

  refreshPropertyWorkbenches(snapshot?: PropertyWorkspaceSnapshot): void {
    for (const leaf of this.app.workspace.getLeavesOfType(PROPERTY_WORKBENCH_VIEW_TYPE)) {
      if (leaf.view instanceof PropertyWorkbenchView) leaf.view.refresh(snapshot);
    }
  }

  refreshTopicIndexViews(snapshot?: PropertyWorkspaceSnapshot): void {
    for (const leaf of this.app.workspace.getLeavesOfType(TOPIC_INDEX_VIEW_TYPE)) {
      if (leaf.view instanceof TopicIndexView) leaf.view.refresh(snapshot);
    }
  }

  getLatestPropertyCapture(): PropertyCaptureStatus | undefined {
    return this.latestPropertyCapture ? { ...this.latestPropertyCapture } : undefined;
  }

  private updatePropertyCapture(status: PropertyCaptureStatus): void {
    this.latestPropertyCapture = status;
    this.refreshPropertyWorkbenches();
  }

  openPropertySettings(): void {
    const appWithSettings = this.app as typeof this.app & {
      setting: { open(): void; openTabById(id: string): void };
    };
    appWithSettings.setting.open();
    appWithSettings.setting.openTabById(this.manifest.id);
  }

  async adoptPropertySuggestions(dimensions: PropertyDimensionConfig[]): Promise<void> {
    this.settings.propertySystem.dimensions = normalizePropertyDimensions(
      dimensions,
      this.settings.propertySystem.creationDateProperty,
    ).map((dimension) => ({
      ...dimension,
      aliases: [...dimension.aliases],
      allowedValues: [...dimension.allowedValues],
      requiredForTypes: [...(dimension.requiredForTypes ?? [])],
    }));
    await this.savePluginData();
    new Notice(`已更新属性配置，共 ${dimensions.length} 个维度；尚未修改任何笔记`);
  }

  async generatePropertyTaxonomyProposal(): Promise<PropertyTaxonomyProposal> {
    const aiSettings = this.settings.aiProperties;
    const availability = await this.getAIProviders(true);
    const selected = availability.find((provider) => provider.id === aiSettings.provider);
    if (selected && !selected.available) throw new Error(selected.detail);

    const files = this.app.vault.getMarkdownFiles()
      .filter((file) => isPropertyGovernedPath(file.path, this.settings.propertySystem))
      .sort((left, right) => left.path.localeCompare(right.path, "zh-CN"));
    const snapshots: PropertyNoteSnapshot[] = files.map((file) => ({
      path: file.path,
      basename: file.basename,
      frontmatter: this.app.metadataCache.getFileCache(file)?.frontmatter,
    }));
    const analysis = analyzePropertyInventory(snapshots, this.settings.propertySystem);
    const limit = Math.min(120, files.length);
    const sampledFiles = limit === files.length
      ? files
      : Array.from({ length: limit }, (_, index) => files[Math.floor(index * (files.length - 1) / Math.max(1, limit - 1))])
        .filter((file): file is TFile => Boolean(file));
    const strings = (value: unknown): string[] => (Array.isArray(value) ? value : [value])
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 8);
    const samples = sampledFiles.map((file) => {
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
      return {
        path: file.path.slice(0, 180),
        title: file.basename.slice(0, 120),
        type: typeof frontmatter.类型 === "string" ? frontmatter.类型.slice(0, 30) : undefined,
        domains: strings(frontmatter.领域),
        topics: strings(frontmatter.主题),
      };
    });
    const prompt = buildAITaxonomyPrompt({
      currentDomains: domainPaths(this.settings.propertySystem.taxonomy.domains),
      observedDomains: analysis.inventory.find((item) => item.name === "领域")?.topValues ?? [],
      observedTopics: analysis.inventory.find((item) => item.name === "主题")?.topValues ?? [],
      samples,
    });
    const raw = await runAIProvider(aiSettings, prompt, availability, this.getAISecret(aiSettings.provider));
    const proposal = parseAITaxonomyResponse(raw);
    this.settings.propertySystem.taxonomy.proposal = proposal;
    await this.savePluginData();
    return proposal;
  }

  async adoptPropertyTaxonomyProposal(): Promise<void> {
    const taxonomy = this.settings.propertySystem.taxonomy;
    const proposal = taxonomy.proposal;
    if (!proposal) throw new Error("当前没有待采用的 AI 分类建议");
    taxonomy.domains = proposal.domains.map((node) => ({ name: node.name, children: [...node.children] }));
    taxonomy.source = "ai";
    taxonomy.adoptedAt = new Date().toISOString();
    taxonomy.proposal = undefined;
    this.settings.propertySystem.dimensions = applyTaxonomyToDimensions(
      this.settings.propertySystem.dimensions,
      createDefaultSettings().propertySystem.dimensions,
      taxonomy,
    );
    this.settings.aiProperties.enabled = true;
    await this.savePluginData();
    await this.scanPropertyWorkspace();
    new Notice("已采用 AI 分类方案；只更新规则，尚未修改任何笔记");
  }

  async dismissPropertyTaxonomyProposal(): Promise<void> {
    this.settings.propertySystem.taxonomy.proposal = undefined;
    await this.savePluginData();
  }

  async updatePropertyTaxonomyDomains(value: string): Promise<void> {
    const domains = parseDomainPaths(value);
    if (!domains.length) throw new Error("至少保留一个领域");
    const taxonomy = this.settings.propertySystem.taxonomy;
    taxonomy.domains = domains;
    taxonomy.source = "custom";
    taxonomy.adoptedAt = new Date().toISOString();
    taxonomy.proposal = undefined;
    this.settings.propertySystem.dimensions = applyTaxonomyToDimensions(
      this.settings.propertySystem.dimensions,
      createDefaultSettings().propertySystem.dimensions,
      taxonomy,
    );
    await this.savePluginData();
    await this.scanPropertyWorkspace();
    new Notice("领域树已更新；现有笔记尚未修改");
  }

  openPropertyAuditPreview(audit: PropertyAudit): void {
    void this.preparePropertyAuditPreview(audit);
  }

  private async preparePropertyAuditPreview(audit: PropertyAudit): Promise<void> {
    const changes = audit.changes.flatMap((change) => {
      const operations = change.operations.filter((operation) => operation.property === "文件名");
      return operations.length ? [{ ...change, operations }] : [];
    });
    if (changes.length) {
      await this.synchronizeFileNameProperties(changes);
      const refreshed = await this.scanPropertyWorkspace(new Set(changes.map((change) => change.path)));
      this.refreshPropertyWorkbenches(refreshed);
      audit = refreshed.audit;
    }
    const visibleIssues = audit.issues.filter((issue) => issue.property !== "文件名");
    if (!visibleIssues.length) {
      new Notice(changes.length ? "文件名属性已自动与文章标题同步，当前没有其他待修正属性" : "当前没有待修正属性");
      return;
    }
    new PropertyAuditModal(this, audit).open();
  }

  private async synchronizeFileNameProperties(changes: PropertyAuditChange[]): Promise<void> {
    const failures: string[] = [];
    for (const change of changes) {
      const file = this.app.vault.getAbstractFileByPath(change.path);
      if (!(file instanceof TFile)) {
        failures.push(change.path);
        continue;
      }
      try {
        await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
          for (const operation of change.operations) {
            if (operation.property === "文件名" && frontmatter[operation.property] !== file.basename) {
              frontmatter[operation.property] = file.basename;
            }
          }
        });
      } catch (error) {
        failures.push(change.path);
        console.error(`KnowGrove: failed to synchronize file name property: ${change.path}`, error);
      }
    }
    if (failures.length) {
      new Notice(`有 ${failures.length} 篇文章的文件名属性暂未同步，请稍后重新检查`, 8000);
    }
  }

  openPropertyIssueDetail(audit: PropertyAudit, path: string): void {
    new PropertyIssueModal(this, audit, path).open();
  }

  async previewAIPropertyRepair(path: string, properties: string[]): Promise<PropertyAIRepairPreview> {
    const abstract = this.app.vault.getAbstractFileByPath(path);
    if (!(abstract instanceof TFile)) throw new Error(`文件已不存在：${path}`);
    const generated = await this.generateAIPropertyForFile(abstract, true, properties);
    return {
      ...generated.result,
      expected: Object.fromEntries(generated.dimensions.map((dimension) => [dimension.name, generated.context.frontmatter[dimension.name]])),
    };
  }

  async previewAIPropertyAuditBatch(
    requested: ReadonlyMap<string, ReadonlySet<string>>,
    onProgress?: (completed: number, total: number) => void,
  ): Promise<Map<string, PropertyAIRepairPreview>> {
    if (!this.settings.aiProperties.enabled) throw new Error("AI 自动属性尚未启用");
    const availability = await this.getAIProviders();
    const selected = availability.find((provider) => provider.id === this.settings.aiProperties.provider);
    if (selected && !selected.available) throw new Error(selected.detail);

    const aiDimensions = aiManagedDimensions(this.settings.propertySystem.dimensions);
    const contexts: AIBatchContext[] = [];
    for (const [path, properties] of requested) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) continue;
      const context = await this.readAIPropertyContext(file);
      const dimensions = aiDimensions.filter((dimension) => properties.has(dimension.name));
      if (!dimensions.length) continue;
      contexts.push({
        file,
        path,
        basename: file.basename,
        body: context.body,
        frontmatter: context.frontmatter,
        dimensions,
      });
    }

    const previews = new Map<string, PropertyAIRepairPreview>();
    onProgress?.(0, contexts.length);
    for (let start = 0; start < contexts.length; start += AI_BATCH_SIZE) {
      const batch = contexts.slice(start, start + AI_BATCH_SIZE);
      const promptItems: AIBatchPromptItem[] = batch.map(({ path, basename, body, frontmatter, dimensions }) => ({
        path,
        basename,
        body,
        frontmatter,
        dimensions,
      }));
      let generated = new Map<string, AIPropertyGeneration>();
      let lastError: unknown;
      for (let attempt = 1; attempt <= AI_BATCH_RETRY_LIMIT; attempt += 1) {
        try {
          const prompt = buildAIBatchPropertyPrompt(
            promptItems,
            this.settings.propertySystem.taxonomy,
            AI_BATCH_BODY_CHARACTERS,
          );
          const raw = await runAIProvider(
            this.settings.aiProperties,
            prompt,
            availability,
            this.getAISecret(this.settings.aiProperties.provider),
          );
          generated = parseAIBatchPropertyResponse(raw, promptItems);
          if (!generated.size) throw new Error("模型没有返回可用的批量属性结果");
          break;
        } catch (error) {
          lastError = error;
          if (attempt < AI_BATCH_RETRY_LIMIT) {
            console.warn(`KnowGrove: retrying AI property preview (${attempt}/${AI_BATCH_RETRY_LIMIT})`, error);
          }
        }
      }
      if (!generated.size) {
        throw lastError instanceof Error ? lastError : new Error("模型没有返回可用的属性建议");
      }
      for (const context of batch) {
        const result = generated.get(context.path);
        if (!result) continue;
        previews.set(context.path, {
          ...result,
          expected: Object.fromEntries(
            context.dimensions.map((dimension) => [dimension.name, context.frontmatter[dimension.name]]),
          ),
        });
      }
      onProgress?.(Math.min(start + batch.length, contexts.length), contexts.length);
    }
    return previews;
  }

  async applyAIPropertyRepair(
    path: string,
    properties: string[],
    generated: PropertyAIRepairPreview,
  ): Promise<AIEnrichmentResult> {
    const abstract = this.app.vault.getAbstractFileByPath(path);
    if (!(abstract instanceof TFile)) throw new Error(`文件已不存在：${path}`);
    const context = await this.readAIPropertyContext(abstract);
    const requested = new Set(properties);
    const dimensions = pendingAIManagedDimensions(
      this.settings.propertySystem.dimensions,
      context.frontmatter,
      true,
    ).filter((dimension) => requested.has(dimension.name));
    if (!dimensions.length) return { applied: 0, frontmatter: context.frontmatter };
    for (const dimension of dimensions) {
      if (JSON.stringify(context.frontmatter[dimension.name]) !== JSON.stringify(generated.expected[dimension.name])) {
        throw new Error(`“${dimension.name}”在预览后已变化，请重新生成 AI 建议`);
      }
    }
    return this.applyAIPropertyGeneration(abstract, context, dimensions, generated, true);
  }

  async executePropertyAudit(audit: PropertyAudit, options: { silent?: boolean } = {}): Promise<boolean> {
    if (!audit.changes.length) {
      if (!options.silent) new Notice("没有可自动执行的属性修改");
      return true;
    }
    const applied: Array<{ file: TFile; original: string; modified: string }> = [];
    try {
      for (const change of audit.changes) {
        const abstract = this.app.vault.getAbstractFileByPath(change.path);
        if (!(abstract instanceof TFile)) throw new Error(`文件已不存在：${change.path}`);
        const original = await this.app.vault.read(abstract);
        await this.app.fileManager.processFrontMatter(abstract, (frontmatter: Record<string, unknown>) => {
          for (const operation of change.operations) {
            if (!operationStillApplies(frontmatter, operation)) {
              throw new Error(`预览后属性已变化，请重新扫描：${change.path} · ${operation.property}`);
            }
          }
          for (const operation of change.operations) applyOperation(frontmatter, operation);
        });
        const modified = await this.app.vault.read(abstract);
        applied.push({ file: abstract, original, modified });
      }
      const snapshot = await this.scanPropertyWorkspace(new Set(applied.map((item) => item.file.path)));
      this.refreshPropertyWorkbenches(snapshot);
      const unresolved = snapshot.audit.nonCompliantFiles
        ? `；仍有 ${snapshot.audit.nonCompliantFiles} 篇需要判断`
        : "；已全部符合规范";
      if (!options.silent) {
        new Notice(`属性规范化完成：修改 ${applied.length} 篇，共 ${audit.automaticOperations} 项${unresolved}`);
      }
      return true;
    } catch (error) {
      const rollbackFailures: string[] = [];
      for (const item of [...applied].reverse()) {
        try {
          let restored = false;
          await this.app.vault.process(item.file, (current) => {
            if (current !== item.modified) return current;
            restored = true;
            return item.original;
          });
          if (!restored) rollbackFailures.push(item.file.path);
        } catch {
          rollbackFailures.push(item.file.path);
        }
      }
      console.error("KnowGrove: property normalization failed", error);
      const rollback = rollbackFailures.length
        ? `；${rollbackFailures.length} 篇无法自动回滚，请查看控制台`
        : "；已回滚本次已执行的修改";
      new Notice(`属性规范化失败：${this.errorMessage(error)}${rollback}`, 10000);
      return false;
    }
  }

  private async migrateResearchTopicSourceFile(file: TFile, additionalPaths: string[] = []): Promise<ResearchSourceState> {
    const current = await this.app.vault.read(file);
    const info = getFrontMatterInfo(current);
    let parsedFrontmatter: Record<string, unknown> = {};
    if (info.exists && info.frontmatter.trim()) {
      const parsed = parseYaml(info.frontmatter) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) parsedFrontmatter = parsed as Record<string, unknown>;
    }
    const existing = await this.readResearchSourceState(file.path);
    const legacyCandidates = stringValues(parsedFrontmatter.候选资料).map(normalizeResearchSourcePath).filter(Boolean);
    const legacyAdopted = stringValues(parsedFrontmatter.资料范围).map(normalizeResearchSourcePath).filter(Boolean);
    const scannedAt = existing?.scannedAt
      ?? (typeof parsedFrontmatter.候选扫描时间 === "string" ? parsedFrontmatter.候选扫描时间 : undefined);
    const state = normalizeResearchSourceState({
      version: 1,
      adopted: [...(existing?.adopted ?? []), ...legacyAdopted],
      candidates: [...(existing?.candidates ?? []), ...legacyCandidates, ...additionalPaths],
      rejected: existing?.rejected ?? [],
      scannedAt,
    });
    const upgraded = ensureResearchSourceBrowser(ensureResearchTopicActions(current));
    if (upgraded !== current) await this.app.vault.process(file, () => upgraded);
    if (["资料范围", "候选资料", "候选扫描版本", "候选扫描时间"].some((key) => Object.prototype.hasOwnProperty.call(parsedFrontmatter, key))) {
      await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
        delete frontmatter.资料范围;
        delete frontmatter.候选资料;
        delete frontmatter.候选扫描版本;
        delete frontmatter.候选扫描时间;
      });
    }
    const topicName = typeof parsedFrontmatter.课题名称 === "string" ? parsedFrontmatter.课题名称.trim() : file.basename;
    const topicLink = `[[${file.path.replace(/\.md$/i, "")}]]`;
    for (const sourcePath of state.adopted) {
      const source = this.app.vault.getAbstractFileByPath(sourcePath);
      if (!(source instanceof TFile)) continue;
      await this.app.fileManager.processFrontMatter(source, (frontmatter: Record<string, unknown>) => {
        const values = stringValues(frontmatter.课题);
        if (!values.some((value) => normalizeKnowledgeTopic(value).toLocaleLowerCase() === topicName.toLocaleLowerCase())) {
          frontmatter.课题 = [...values, topicLink];
        }
      });
    }
    const normalizedExisting = existing ? JSON.stringify(normalizeResearchSourceState(existing)) : "";
    if (!existing || normalizedExisting !== JSON.stringify(state)) await this.writeResearchSourceState(file.path, state);
    return state;
  }

  private async migrateResearchTopicSourceMetadata(): Promise<void> {
    const managedRootFiles = this.filesUnderVaultFolder(KNOWGROVE_ROOT)
      .filter((file) => file.extension === "md");
    const files = managedRootFiles
      .filter((file) => file.path.startsWith(`${RESEARCH_TOPIC_WORKSPACE_ROOT}/`));
    let migrated = 0;
    for (const file of files) {
      try {
        const content = await this.app.vault.cachedRead(file);
        if (!/knowgrove_research_topic:\s*true/.test(content)) continue;
        const stateExists = await this.app.vault.adapter.exists(normalizePath(researchSourceStatePath(file.path)));
        const needsMigration = !stateExists
          || !content.includes("```knowgrove-research-sources")
          || /^资料范围:/m.test(content)
          || /^候选资料:|^候选扫描版本:|^候选扫描时间:/m.test(content)
          || /\n## 相关资料\s*\n/.test(content);
        if (!needsMigration) continue;
        await this.migrateResearchTopicSourceFile(file);
        migrated += 1;
      } catch (error) {
        console.warn(`KnowGrove: failed to migrate research source metadata for ${file.path}`, error);
      }
    }
    const managedFiles = managedRootFiles
      .filter((file) => file.path.startsWith("_KnowGrove/") && !file.path.startsWith(`${RESEARCH_TOPIC_WORKSPACE_ROOT}/`));
    for (const file of managedFiles) {
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (!frontmatter) continue;
      const themeWorkspace = frontmatter.knowgrove_topic_workspace === true;
      const genericWorkspace = frontmatter.knowgrove_workspace === true;
      if (!themeWorkspace && !genericWorkspace) continue;
      const sourcePaths = stringValues(frontmatter.资料范围).map(normalizeResearchSourcePath).filter(Boolean);
      if (themeWorkspace) {
        const name = typeof frontmatter.主题名称 === "string" ? frontmatter.主题名称.trim() : file.basename;
        const themeLink = `[[${file.path.replace(/\.md$/i, "")}]]`;
        for (const sourcePath of sourcePaths) {
          const source = this.app.vault.getAbstractFileByPath(sourcePath);
          if (!(source instanceof TFile)) continue;
          await this.app.fileManager.processFrontMatter(source, (sourceFrontmatter: Record<string, unknown>) => {
            const values = stringValues(sourceFrontmatter.主题);
            if (!values.some((value) => normalizeKnowledgeTopic(value).toLocaleLowerCase() === name.toLocaleLowerCase())) {
              sourceFrontmatter.主题 = [...values, themeLink];
            }
          });
        }
      } else {
        const name = typeof frontmatter.空间名称 === "string" ? frontmatter.空间名称.trim() : file.basename;
        const type = typeof frontmatter.空间类型 === "string" ? frontmatter.空间类型 : "";
        const relationProperty = type === "项目" ? "所属项目" : "所属空间";
        const workspaceLink = `[[${file.path.replace(/\.md$/i, "")}]]`;
        for (const sourcePath of sourcePaths) {
          const source = this.app.vault.getAbstractFileByPath(sourcePath);
          if (!(source instanceof TFile)) continue;
          await this.app.fileManager.processFrontMatter(source, (sourceFrontmatter: Record<string, unknown>) => {
            const values = stringValues(sourceFrontmatter[relationProperty]);
            if (!values.some((value) => normalizeKnowledgeTopic(value).toLocaleLowerCase() === name.toLocaleLowerCase())) {
              sourceFrontmatter[relationProperty] = [...values, workspaceLink];
            }
          });
        }
      }
      if (Object.prototype.hasOwnProperty.call(frontmatter, "资料范围")
        || Object.prototype.hasOwnProperty.call(frontmatter, "课题范围")
        || Object.prototype.hasOwnProperty.call(frontmatter, "子空间")) {
        await this.app.fileManager.processFrontMatter(file, (managedFrontmatter: Record<string, unknown>) => {
          delete managedFrontmatter.资料范围;
          delete managedFrontmatter.课题范围;
          delete managedFrontmatter.子空间;
        });
        migrated += 1;
      }
    }
    if (migrated) await this.scanPropertyWorkspace();
  }

  private async ensureKnowledgeThemeFiles(theme: KnowledgeThemeSummary): Promise<TFile> {
    await this.ensureVaultFolder(theme.workspacePath.split("/").slice(0, -1));
    const baseContent = buildKnowledgeThemeBase(theme);
    const baseAbstract = this.app.vault.getAbstractFileByPath(theme.basePath);
    if (baseAbstract instanceof TFolder) throw new Error(`主题 Base 路径是文件夹：${theme.basePath}`);
    if (baseAbstract instanceof TFile) {
      const current = await this.app.vault.read(baseAbstract);
      if (!isManagedKnowledgeThemeBase(current)) {
        throw new Error(`主题 Base 已存在且不是插件生成：${theme.basePath}`);
      }
      if (current !== baseContent) await this.app.vault.process(baseAbstract, () => baseContent);
    } else {
      await this.app.vault.create(theme.basePath, baseContent);
    }

    const noteAbstract = this.app.vault.getAbstractFileByPath(theme.workspacePath);
    if (noteAbstract instanceof TFolder) throw new Error(`主题空间路径是文件夹：${theme.workspacePath}`);
    if (noteAbstract instanceof TFile) {
      const current = await this.app.vault.read(noteAbstract);
      if (!/knowgrove_topic_workspace:\s*true/.test(current)) {
        throw new Error(`主题文档已存在且不是插件生成：${theme.workspacePath}`);
      }
      await this.app.fileManager.processFrontMatter(noteAbstract, (frontmatter: Record<string, unknown>) => {
        if (frontmatter.固定主题 !== true) frontmatter.固定主题 = true;
        delete frontmatter.资料范围;
        delete frontmatter.课题范围;
      });
      return noteAbstract;
    }
    return this.app.vault.create(theme.workspacePath, buildKnowledgeThemeNote(theme));
  }

  private async ensureKnowledgeResearchTopicFiles(
    theme: KnowledgeThemeSummary,
    topic: KnowledgeResearchTopicSummary,
  ): Promise<TFile> {
    await this.ensureVaultFolder(topic.workspacePath.split("/").slice(0, -1));
    const baseContent = buildKnowledgeResearchTopicBase(topic);
    const baseAbstract = this.app.vault.getAbstractFileByPath(topic.basePath);
    if (baseAbstract instanceof TFolder) throw new Error(`课题 Base 路径是文件夹：${topic.basePath}`);
    if (baseAbstract instanceof TFile) {
      const current = await this.app.vault.read(baseAbstract);
      if (!isManagedKnowledgeThemeBase(current)) throw new Error(`课题 Base 已存在且不是插件生成：${topic.basePath}`);
      if (current !== baseContent) await this.app.vault.process(baseAbstract, () => baseContent);
    } else {
      await this.app.vault.create(topic.basePath, baseContent);
    }
    const noteAbstract = this.app.vault.getAbstractFileByPath(topic.workspacePath);
    if (noteAbstract instanceof TFolder) throw new Error(`课题路径是文件夹：${topic.workspacePath}`);
    if (noteAbstract instanceof TFile) {
      const current = await this.app.vault.read(noteAbstract);
      if (!/knowgrove_research_topic:\s*true/.test(current)) {
        throw new Error(`课题文档已存在且不是插件生成：${topic.workspacePath}`);
      }
      await this.migrateResearchTopicSourceFile(noteAbstract, topic.candidateDocuments.map((document) => document.path));
      return noteAbstract;
    }
    const file = await this.app.vault.create(topic.workspacePath, buildKnowledgeResearchTopicNote(topic));
    await this.writeResearchSourceState(topic.workspacePath, normalizeResearchSourceState({
      version: 1,
      adopted: topic.documents.map((document) => document.path),
      candidates: topic.candidateDocuments.map((document) => document.path),
      rejected: [],
    }));
    const themeFile = this.app.vault.getAbstractFileByPath(theme.workspacePath);
    if (themeFile instanceof TFile) {
      await this.app.fileManager.processFrontMatter(themeFile, (frontmatter: Record<string, unknown>) => {
        delete frontmatter.课题范围;
        delete frontmatter.资料范围;
        const questions = stringValues(frontmatter.研究课题);
        if (!questions.includes(topic.name)) frontmatter.研究课题 = [...questions, topic.name];
      });
    }
    return file;
  }

  async openKnowledgeTheme(theme: KnowledgeThemeSummary): Promise<void> {
    try {
      const file = await this.ensureKnowledgeThemeFiles(theme);
      const existing = this.app.workspace.getLeavesOfType("markdown").find((leaf) => {
        const view = leaf.view as typeof leaf.view & { file?: TFile };
        return view.file?.path === file.path;
      });
      const leaf = existing ?? this.app.workspace.getLeaf("tab");
      await leaf.openFile(file);
      await this.app.workspace.revealLeaf(leaf);
      await this.scanPropertyWorkspace();
    } catch (error) {
      console.error("KnowGrove: failed to open knowledge theme", error);
      new Notice(`主题空间打开失败：${this.errorMessage(error)}`);
    }
  }

  openCreateKnowledgeTheme(defaultDomain = ""): void {
    new CreateKnowledgeThemeModal(this, async (name, domains, researchQuestions) => {
      const snapshot = await this.scanPropertyWorkspace();
      if (snapshot.knowledgeThemes.some((theme) => theme.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
        throw new Error(`主题“${name}”已经存在`);
      }
      const paths = topicWorkspacePaths(name);
      const theme: KnowledgeThemeSummary = {
        name,
        domains,
        total: 0,
        stageCounts: { P: 1, D: 0, S: 0, A: 0 },
        currentStage: "P",
        fixed: true,
        workspaceExists: false,
        workspacePath: paths.notePath,
        basePath: paths.basePath,
        researchQuestions,
        researchTopics: [],
        explicitSourcePaths: [],
        documents: [],
        suggestedDocuments: [],
      };
      const workspace = await this.ensureKnowledgeThemeFiles(theme);
      for (const question of researchQuestions) {
        const paths = researchTopicWorkspacePaths(name, question);
        await this.ensureKnowledgeResearchTopicFiles(theme, {
          name: question,
          coreQuestion: question,
          parentThemeName: name,
          domains,
          total: 0,
          fixed: true,
          workspaceExists: false,
          workspacePath: paths.notePath,
          basePath: paths.basePath,
          explicitSourcePaths: [],
          documents: [],
          candidateDocuments: rankResearchTopicSourceCandidates({
            name: question,
            coreQuestion: question,
            parentThemeName: name,
            domains,
          }, snapshot.knowledgeDocuments),
        });
      }
      await this.app.workspace.getLeaf("tab").openFile(workspace);
      await this.scanPropertyWorkspace();
      new Notice(`已创建研究主题“${name}”`);
    }, defaultDomain).open();
  }

  openCreateKnowledgeResearchTopic(theme: KnowledgeThemeSummary): void {
    new CreateKnowledgeResearchTopicModal(this, theme, async (name, coreQuestion) => {
      const snapshot = await this.scanPropertyWorkspace();
      const current = snapshot.knowledgeThemes.find((candidate) => knowledgeNamesMatch(candidate.name, theme.name)) ?? theme;
      const paths = researchTopicWorkspacePaths(current.name, name);
      if (current.researchTopics.some((topic) => knowledgeNamesMatch(topic.name, name))
        || this.app.vault.getAbstractFileByPath(paths.notePath)
        || this.app.vault.getAbstractFileByPath(paths.basePath)) {
        throw new Error("这个课题已经存在了");
      }
      const topic: KnowledgeResearchTopicSummary = {
        name,
        coreQuestion,
        parentThemeName: current.name,
        domains: current.domains,
        total: 0,
        fixed: true,
        workspaceExists: false,
        workspacePath: paths.notePath,
        basePath: paths.basePath,
        explicitSourcePaths: [],
        documents: [],
        candidateDocuments: rankResearchTopicSourceCandidates({
          name,
          coreQuestion,
          parentThemeName: current.name,
          domains: current.domains,
        }, snapshot.knowledgeDocuments),
      };
      const file = await this.ensureKnowledgeResearchTopicFiles(current, topic);
      await this.app.workspace.getLeaf("tab").openFile(file);
      await this.scanPropertyWorkspace();
      new Notice(`已在“${current.name}”下创建课题“${name}”`);
      void this.refreshResearchTopicCandidates(current, { ...topic, workspaceExists: true }, snapshot.knowledgeDocuments);
    }).open();
  }

  async openKnowledgeResearchTopic(theme: KnowledgeThemeSummary, topic: KnowledgeResearchTopicSummary): Promise<void> {
    try {
      const file = await this.ensureKnowledgeResearchTopicFiles(theme, topic);
      const leaf = this.app.workspace.getLeaf("tab");
      await leaf.openFile(file);
      await this.app.workspace.revealLeaf(leaf);
      await this.scanPropertyWorkspace();
    } catch (error) {
      console.error("KnowGrove: failed to open research topic", error);
      new Notice(`课题打开失败：${this.errorMessage(error)}`);
    }
  }

  async openKnowledgeResearchTopicMode(
    theme: KnowledgeThemeSummary,
    topic: KnowledgeResearchTopicSummary,
    sourceDocument?: KnowledgeThemeDocument,
  ): Promise<void> {
    try {
      const topicFile = await this.ensureKnowledgeResearchTopicFiles(theme, topic);
      const topicKey = topic.workspacePath;
      const markdownLeaves = this.app.workspace.getLeavesOfType("markdown");
      const existingTopicLeaf = markdownLeaves.find((leaf) => leaf.view instanceof MarkdownView
        && leaf.view.file?.path === topicFile.path);
      const topicLeaf = existingTopicLeaf ?? this.app.workspace.getLeaf("tab");
      await topicLeaf.openFile(topicFile);
      topicLeaf.view.containerEl.dataset.knowGroveResearchRole = "summary";
      topicLeaf.view.containerEl.dataset.knowGroveResearchTopic = topicKey;

      const source = sourceDocument ?? topic.documents[0] ?? topic.candidateDocuments[0];
      if (source) {
        const sourceFile = this.app.vault.getAbstractFileByPath(source.path);
        if (sourceFile instanceof TFile) {
          const sourceLeaf = this.app.workspace.getLeavesOfType("markdown").find((leaf) =>
            leaf !== topicLeaf
            && leaf.view.containerEl.dataset.knowGroveResearchRole === "source"
            && leaf.view.containerEl.dataset.knowGroveResearchTopic === topicKey)
            ?? this.app.workspace.createLeafBySplit(topicLeaf, "vertical", true);
          await sourceLeaf.openFile(sourceFile);
          sourceLeaf.view.containerEl.dataset.knowGroveResearchRole = "source";
          sourceLeaf.view.containerEl.dataset.knowGroveResearchTopic = topicKey;
        }
      }
      await this.app.workspace.revealLeaf(topicLeaf);
      const snapshot = await this.scanPropertyWorkspace();
      const sourceState = await this.readResearchSourceState(topicFile.path);
      if (!sourceState?.scannedAt) {
        const currentTheme = snapshot.knowledgeThemes.find((candidate) => candidate.name.toLocaleLowerCase() === theme.name.toLocaleLowerCase()) ?? theme;
        const currentTopic = currentTheme.researchTopics.find((candidate) => candidate.workspacePath === topic.workspacePath) ?? topic;
        void this.refreshResearchTopicCandidates(currentTheme, currentTopic, snapshot.knowledgeDocuments);
      }
    } catch (error) {
      console.error("KnowGrove: failed to open research mode", error);
      new Notice(`双窗格研究模式打开失败：${this.errorMessage(error)}`);
    }
  }

  async openKnowledgeResearchTopicManager(theme: KnowledgeThemeSummary, topic: KnowledgeResearchTopicSummary): Promise<void> {
    try {
      if (!topic.workspaceExists) await this.ensureKnowledgeResearchTopicFiles(theme, topic);
      await new Promise<void>((resolve) => window.setTimeout(resolve, 80));
      const snapshot = await this.scanPropertyWorkspace();
      const currentTheme = snapshot.knowledgeThemes.find((candidate) => candidate.name.toLocaleLowerCase() === theme.name.toLocaleLowerCase()) ?? theme;
      const currentTopic = currentTheme.researchTopics.find((candidate) => candidate.name.toLocaleLowerCase() === topic.name.toLocaleLowerCase())
        ?? { ...topic, workspaceExists: true };
      new KnowledgeResearchTopicManagerModal(
        this,
        currentTopic,
        snapshot.knowledgeDocuments,
        () => this.planKnowledgeResearchTopic(currentTopic, snapshot.knowledgeDocuments),
        async (question, paths) => {
        const file = await this.ensureKnowledgeResearchTopicFiles(currentTheme, currentTopic);
        const selected = new Set(paths);
        const documents = snapshot.knowledgeDocuments.filter((document) => selected.has(document.path));
        await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
          frontmatter.核心问题 = question;
          delete frontmatter.资料范围;
        });
        const topicLink = `[[${currentTopic.workspacePath.replace(/\.md$/i, "")}]]`;
        const affected = new Set([...currentTopic.documents.map((document) => document.path), ...documents.map((document) => document.path)]);
        for (const path of affected) {
          const source = this.app.vault.getAbstractFileByPath(path);
          if (!(source instanceof TFile)) continue;
          await this.app.fileManager.processFrontMatter(source, (frontmatter: Record<string, unknown>) => {
            const values = stringValues(frontmatter.课题);
            const withoutCurrent = values.filter((value) => normalizeKnowledgeTopic(value).toLocaleLowerCase() !== currentTopic.name.toLocaleLowerCase());
            const next = selected.has(path) ? [...withoutCurrent, topicLink] : withoutCurrent;
            if (next.length) frontmatter.课题 = next;
            else delete frontmatter.课题;
          });
        }
        const candidateDocuments = Array.from(new Map([
          ...currentTopic.candidateDocuments,
          ...documents,
        ].map((document) => [document.path, document])).values());
        const sourceState = await this.readResearchSourceState(currentTopic.workspacePath)
          ?? normalizeResearchSourceState({ version: 1, candidates: [], rejected: [] });
        await this.writeResearchSourceState(currentTopic.workspacePath, normalizeResearchSourceState({
          version: 1,
          adopted: documents.map((document) => document.path),
          candidates: [...sourceState.candidates, ...candidateDocuments.map((document) => document.path)],
          rejected: sourceState.rejected.filter((path) => !selected.has(path)),
          scannedAt: sourceState.scannedAt,
        }));
        await this.ensureKnowledgeResearchTopicFiles(currentTheme, {
          ...currentTopic,
          coreQuestion: question,
          documents,
          candidateDocuments,
          total: documents.length,
        });
        await this.scanPropertyWorkspace();
        new Notice(`“${currentTopic.name}”已选择 ${documents.length} 篇资料`);
      }).open();
    } catch (error) {
      console.error("KnowGrove: failed to open research topic manager", error);
      new Notice(`课题设置打开失败：${this.errorMessage(error)}`);
    }
  }

  private async planKnowledgeResearchTopic(
    topic: KnowledgeResearchTopicSummary,
    candidates: KnowledgeThemeDocument[],
  ): Promise<ThemePlanningProposal> {
    const ranked = rankResearchTopicSourceCandidates(topic, candidates, 120);
    if (!ranked.length) throw new Error("全库暂时没有可供模型判断的相关候选");
    const availability = await this.getAIProviders();
    const selected = availability.find((provider) => provider.id === this.settings.aiProperties.provider);
    if (selected && !selected.available) throw new Error(selected.detail);
    const raw = await runAIProvider(
      this.settings.aiProperties,
      buildResearchTopicPlanningPrompt(topic, ranked),
      availability,
      this.getAISecret(this.settings.aiProperties.provider),
    );
    return parseThemePlanningResponse(raw, ranked.map((document) => document.path));
  }

  private async refreshResearchTopicCandidates(
    theme: KnowledgeThemeSummary,
    topic: KnowledgeResearchTopicSummary,
    candidates: KnowledgeThemeDocument[],
  ): Promise<void> {
    try {
      const existingState = await this.readResearchSourceState(topic.workspacePath)
        ?? normalizeResearchSourceState({ version: 1, candidates: [], rejected: [] });
      const rejected = new Set(existingState.rejected);
      const metadataRanked = rankResearchTopicSourceCandidates(topic, candidates, 100);
      const metadataPaths = new Set(metadataRanked.map((document) => document.path));
      const terms = Array.from(new Set([
        topic.name.toLocaleLowerCase(),
        topic.parentThemeName.toLocaleLowerCase(),
        ...researchTopicKeywords(`${topic.name} ${topic.coreQuestion}`),
      ].filter((term) => term.length >= 2)));
      const scored: Array<{ document: KnowledgeThemeDocument; score: number }> = [];
      for (let offset = 0; offset < candidates.length; offset += 24) {
        const chunk = candidates.slice(offset, offset + 24);
        const matches = await Promise.all(chunk.map(async (document) => {
          const file = this.app.vault.getAbstractFileByPath(document.path);
          if (!(file instanceof TFile)) return undefined;
          const content = (await this.app.vault.cachedRead(file)).toLocaleLowerCase();
          let score = metadataPaths.has(document.path) ? 12 : 0;
          if (content.includes(topic.name.toLocaleLowerCase())) score += 40;
          if (content.includes(topic.parentThemeName.toLocaleLowerCase())) score += 10;
          const hits = terms.filter((term) => content.includes(term));
          score += hits.reduce((sum, term) => sum + (term.length >= 4 ? 4 : term.length === 3 ? 2 : 1), 0);
          return score >= 10 ? { document, score } : undefined;
        }));
        scored.push(...matches.filter((match): match is { document: KnowledgeThemeDocument; score: number } => Boolean(match)));
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }
      const fullTextRanked = scored
        .sort((left, right) => right.score - left.score || right.document.modifiedAt - left.document.modifiedAt)
        .map((item) => item.document);
      const candidateDocuments = Array.from(new Map([
        ...topic.documents,
        ...fullTextRanked,
        ...topic.candidateDocuments,
      ].filter((document) => !rejected.has(document.path))
        .map((document) => [document.path, document])).values()).slice(0, 120);
      const file = await this.ensureKnowledgeResearchTopicFiles(theme, { ...topic, candidateDocuments });
      await this.writeResearchSourceState(file.path, normalizeResearchSourceState({
        version: 1,
        adopted: existingState.adopted,
        candidates: candidateDocuments.map((document) => document.path),
        rejected: existingState.rejected,
        scannedAt: new Date().toISOString(),
      }));
      await this.ensureKnowledgeResearchTopicFiles(theme, { ...topic, candidateDocuments });
      await this.scanPropertyWorkspace();
      new Notice(`“${topic.name}”已从全库发现 ${candidateDocuments.length} 篇相关候选`);
    } catch (error) {
      console.error("KnowGrove: failed to refresh full-vault research candidates", error);
      new Notice(`全库资料发现失败：${this.errorMessage(error)}`);
    }
  }

  private renderResearchTopicActions(container: HTMLElement, sourcePath: string): void {
    container.addClass("knowgrove-research-actions");
    const heading = container.createDiv("knowgrove-research-actions-heading");
    const icon = heading.createSpan();
    setIcon(icon, "microscope");
    heading.createSpan({ text: "课题研究台" });
    const actions = container.createDiv("knowgrove-research-actions-buttons");
    const button = (label: string, iconName: string, action: () => void): void => {
      const element = actions.createEl("button");
      const buttonIcon = element.createSpan();
      setIcon(buttonIcon, iconName);
      element.createSpan({ text: label });
      element.addEventListener("click", action);
    };
    button("双窗格研究", "panels-top-left", () => void this.withResearchTopic(sourcePath, ({ theme, topic }) =>
      this.openKnowledgeResearchTopicMode(theme, topic)));
    button("引用左侧选区", "quote", () => void this.withResearchTopic(sourcePath, ({ theme, topic, snapshot }) =>
      this.addSelectionToResearchTopic(theme, topic, snapshot.knowledgeDocuments)));
    button("管理相关资料", "list-checks", () => void this.withResearchTopic(sourcePath, ({ theme, topic }) =>
      this.openKnowledgeResearchTopicManager(theme, topic)));
    button("创作", "sparkles", () => void this.withResearchTopic(sourcePath, ({ topic }) => {
      const documents = Array.from(new Map(
        [...topic.documents, ...topic.candidateDocuments].map((document) => [document.path, document]),
      ).values());
      new ResearchOutputModal(
        this,
        topic,
        documents,
        topic.documents.map((document) => document.path),
        (draft, report) => this.planResearchOutput(topic, draft, report),
        (draft, plan, report) => this.generateResearchOutput(topic, draft, plan, report),
      ).open();
    }));
  }

  private async renderResearchTopicSources(container: HTMLElement, sourcePath: string): Promise<void> {
    container.empty();
    container.addClass("knowgrove-research-sources");
    const loading = container.createDiv("knowgrove-research-sources-empty");
    loading.setText("正在读取课题资料…");
    try {
      const snapshot = await this.scanPropertyWorkspace();
      const theme = snapshot.knowledgeThemes.find((candidate) =>
        candidate.researchTopics.some((topic) => topic.workspacePath === sourcePath));
      const topic = theme?.researchTopics.find((candidate) => candidate.workspacePath === sourcePath);
      if (!theme || !topic) throw new Error("没有找到当前课题");
      const state = await this.readResearchSourceState(sourcePath)
        ?? normalizeResearchSourceState({
          version: 1,
          candidates: topic.candidateDocuments.map((document) => document.path),
          rejected: [],
        });
      const rejected = new Set(state.rejected);
      const adopted = new Set(topic.documents.map((document) => document.path));
      const available = topic.candidateDocuments.filter((document) => !rejected.has(document.path));
      const pending = available.filter((document) => !adopted.has(document.path));
      const rejectedDocuments = state.rejected.map((path) =>
        snapshot.knowledgeDocuments.find((document) => document.path === path))
        .filter((document): document is KnowledgeThemeDocument => Boolean(document));
      loading.remove();

      const toolbar = container.createDiv("knowgrove-research-sources-toolbar");
      const counts = toolbar.createDiv("knowgrove-research-sources-counts");
      counts.createSpan({ text: `已相关 ${topic.documents.length}` });
      counts.createSpan({ text: `待判断 ${pending.length}` });
      const ai = toolbar.createEl("button", { cls: "knowgrove-research-sources-ai" });
      const aiIcon = ai.createSpan();
      setIcon(aiIcon, "sparkles");
      ai.createSpan({ text: "AI 筛选候选" });
      ai.disabled = !pending.length;
      ai.addEventListener("click", () => {
        ai.disabled = true;
        ai.addClass("is-loading");
        void this.screenResearchTopicSources(theme, topic, pending, async () => {
          await this.renderResearchTopicSources(container, sourcePath);
        }).catch((error) => {
          console.error("KnowGrove: AI source screening failed", error);
          new Notice(`AI 资料筛选失败：${this.errorMessage(error)}`);
        }).finally(() => {
          if (!container.isConnected) return;
          ai.disabled = false;
          ai.removeClass("is-loading");
        });
      });

      const renderRows = (section: HTMLElement, documents: KnowledgeThemeDocument[], adoptedState: boolean): void => {
        let visible = Math.min(20, documents.length);
        const list = section.createDiv("knowgrove-research-sources-list");
        const draw = (): void => {
          list.empty();
          for (const document of documents.slice(0, visible)) {
            const row = list.createDiv("knowgrove-research-source-card");
            const open = row.createEl("button", { cls: "knowgrove-research-source-open" });
            const openIcon = open.createSpan();
            setIcon(openIcon, "file-text");
            const copy = open.createDiv();
            copy.createDiv({ cls: "knowgrove-research-source-title", text: document.basename });
            copy.createDiv({ cls: "knowgrove-research-source-path", text: document.path });
            open.addEventListener("click", () => void this.openKnowledgeResearchTopicMode(theme, topic, document));
            const actions = row.createDiv("knowgrove-research-source-decisions");
            const related = actions.createEl("button", { text: adoptedState ? "已相关" : "相关" });
            if (adoptedState) related.addClass("is-selected");
            related.disabled = adoptedState;
            related.addEventListener("click", () => void this.applyResearchSourceDecisions(theme, topic, [{
              path: document.path,
              decision: "相关",
              reason: "人工确认",
            }]).then(() => this.renderResearchTopicSources(container, sourcePath)).catch((error) => {
              console.error("KnowGrove: failed to mark source related", error);
              new Notice(`资料标记失败：${this.errorMessage(error)}`);
            }));
            const reject = actions.createEl("button", { text: "不相关" });
            reject.addEventListener("click", () => void this.applyResearchSourceDecisions(theme, topic, [{
              path: document.path,
              decision: "不相关",
              reason: "人工确认",
            }]).then(() => this.renderResearchTopicSources(container, sourcePath)).catch((error) => {
              console.error("KnowGrove: failed to reject source", error);
              new Notice(`资料标记失败：${this.errorMessage(error)}`);
            }));
          }
          if (visible < documents.length) {
            const more = list.createEl("button", {
              cls: "knowgrove-research-sources-more",
              text: `再显示 ${Math.min(20, documents.length - visible)} 篇`,
            });
            more.addEventListener("click", () => {
              visible = Math.min(documents.length, visible + 20);
              draw();
            });
          }
        };
        draw();
      };

      if (topic.documents.length) {
        const relatedSection = container.createEl("details", { cls: "knowgrove-research-sources-section" });
        relatedSection.open = true;
        relatedSection.createEl("summary", { text: `已确认相关 · ${topic.documents.length}` });
        renderRows(relatedSection, topic.documents, true);
      }
      const pendingSection = container.createEl("details", { cls: "knowgrove-research-sources-section" });
      pendingSection.open = true;
      pendingSection.createEl("summary", { text: `待判断候选 · ${pending.length}` });
      if (pending.length) renderRows(pendingSection, pending, false);
      else pendingSection.createDiv({ cls: "knowgrove-research-sources-empty", text: "候选资料已经处理完。" });
      if (rejectedDocuments.length) {
        const rejectedSection = container.createEl("details", { cls: "knowgrove-research-sources-section" });
        rejectedSection.createEl("summary", { text: `已排除 · ${rejectedDocuments.length}` });
        const rejectedList = rejectedSection.createDiv("knowgrove-research-sources-list");
        for (const document of rejectedDocuments) {
          const row = rejectedList.createDiv("knowgrove-research-source-card");
          const open = row.createEl("button", { cls: "knowgrove-research-source-open" });
          const openIcon = open.createSpan();
          setIcon(openIcon, "file-x");
          const copy = open.createDiv();
          copy.createDiv({ cls: "knowgrove-research-source-title", text: document.basename });
          copy.createDiv({ cls: "knowgrove-research-source-path", text: document.path });
          open.addEventListener("click", () => void this.openKnowledgeResearchTopicMode(theme, topic, document));
          const restore = row.createEl("button", { cls: "knowgrove-research-source-restore", text: "恢复候选" });
          restore.addEventListener("click", () => void this.restoreResearchSourceCandidate(topic, document)
            .then(() => this.renderResearchTopicSources(container, sourcePath))
            .catch((error) => {
              console.error("KnowGrove: failed to restore source candidate", error);
              new Notice(`恢复候选失败：${this.errorMessage(error)}`);
            }));
        }
      }
    } catch (error) {
      container.empty();
      container.createDiv({ cls: "knowgrove-research-sources-empty", text: `资料筛选区加载失败：${this.errorMessage(error)}` });
      console.error("KnowGrove: failed to render research sources", error);
    }
  }

  private async screenResearchTopicSources(
    theme: KnowledgeThemeSummary,
    topic: KnowledgeResearchTopicSummary,
    candidates: KnowledgeThemeDocument[],
    onApplied: () => Promise<void>,
  ): Promise<void> {
    if (!this.settings.aiProperties.enabled) {
      new Notice("请先在插件设置中启用 AI 自动属性并选择模型");
      this.openPropertySettings();
      return;
    }
    const availability = await this.getAIProviders();
    const provider = availability.find((candidate) => candidate.id === this.settings.aiProperties.provider);
    if (provider && !provider.available) throw new Error(provider.detail);
    new Notice(`AI 正在筛选 ${candidates.length} 篇课题候选…`, 4000);
    const decisions: ResearchSourceDecision[] = [];
    const batchSize = 12;
    for (let offset = 0; offset < candidates.length; offset += batchSize * 3) {
      const concurrentBatches = Array.from({ length: 3 }, (_, index) =>
        candidates.slice(offset + index * batchSize, offset + (index + 1) * batchSize)).filter((batch) => batch.length);
      const results = await Promise.all(concurrentBatches.map(async (batch) => {
        try {
          const sources = await Promise.all(batch.map(async (document) => {
            const file = this.app.vault.getAbstractFileByPath(document.path);
            if (!(file instanceof TFile)) return { ...document, excerpt: "" };
            const content = await this.app.vault.cachedRead(file);
            const info = getFrontMatterInfo(content);
            return { ...document, excerpt: content.slice(info.contentStart).trim().slice(0, 900) };
          }));
          const raw = await runAIProvider(
            this.settings.aiProperties,
            buildResearchSourceScreeningPrompt(topic, sources),
            availability,
            this.getAISecret(this.settings.aiProperties.provider),
          );
          return parseResearchSourceScreeningResponse(raw, batch.map((document) => document.path));
        } catch (error) {
          console.warn("KnowGrove: one AI source-screening batch failed", error);
          return [];
        }
      }));
      decisions.push(...results.flat());
    }
    if (!decisions.length) throw new Error("模型没有返回可用的筛选结果");
    new ResearchSourceScreeningModal(this, decisions, candidates, async () => {
      await this.applyResearchSourceDecisions(theme, topic, decisions);
      await onApplied();
    }).open();
  }

  private async applyResearchSourceDecisions(
    theme: KnowledgeThemeSummary,
    topic: KnowledgeResearchTopicSummary,
    decisions: ResearchSourceDecision[],
  ): Promise<void> {
    const topicFile = this.app.vault.getAbstractFileByPath(topic.workspacePath);
    if (!(topicFile instanceof TFile)) throw new Error("课题文档不存在");
    const byPath = new Map(topic.candidateDocuments.map((document) => [document.path, document]));
    for (const document of topic.documents) byPath.set(document.path, document);
    const state = await this.readResearchSourceState(topic.workspacePath)
      ?? normalizeResearchSourceState({
        version: 1,
        candidates: topic.candidateDocuments.map((document) => document.path),
        rejected: [],
      });
    const candidates = new Set(state.candidates);
    const rejected = new Set(state.rejected);
    const adopted = new Set(topic.documents.map((document) => document.path));
    for (const decision of decisions) {
      if (!byPath.has(decision.path)) continue;
      if (decision.decision === "相关") {
        adopted.add(decision.path);
        candidates.add(decision.path);
        rejected.delete(decision.path);
      } else {
        adopted.delete(decision.path);
        candidates.delete(decision.path);
        rejected.add(decision.path);
      }
    }
    await this.writeResearchSourceState(topic.workspacePath, normalizeResearchSourceState({
      version: 1,
      adopted: Array.from(adopted),
      candidates: Array.from(candidates),
      rejected: Array.from(rejected),
      scannedAt: state.scannedAt,
    }));
    await this.app.fileManager.processFrontMatter(topicFile, (frontmatter: Record<string, unknown>) => {
      delete frontmatter.资料范围;
      delete frontmatter.候选资料;
      delete frontmatter.候选扫描版本;
      delete frontmatter.候选扫描时间;
    });
    const topicLink = `[[${topic.workspacePath.replace(/\.md$/i, "")}]]`;
    for (const decision of decisions) {
      const file = this.app.vault.getAbstractFileByPath(decision.path);
      if (!(file instanceof TFile)) continue;
      await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
        const current = stringValues(frontmatter.课题).filter((value) => value !== topicLink);
        if (decision.decision === "相关") frontmatter.课题 = [...current, topicLink];
        else if (current.length) frontmatter.课题 = current;
        else delete frontmatter.课题;
      });
    }
    const documents = Array.from(adopted).map((path) => byPath.get(path))
      .filter((document): document is KnowledgeThemeDocument => Boolean(document));
    const candidateDocuments = Array.from(candidates).map((path) => byPath.get(path))
      .filter((document): document is KnowledgeThemeDocument => Boolean(document));
    await this.ensureKnowledgeResearchTopicFiles(theme, {
      ...topic,
      documents,
      candidateDocuments: Array.from(new Map([...documents, ...candidateDocuments].map((document) => [document.path, document])).values()),
      total: documents.length,
    });
    await this.scanPropertyWorkspace();
    const relatedCount = decisions.filter((decision) => decision.decision === "相关").length;
    const rejectedCount = decisions.filter((decision) => decision.decision === "不相关").length;
    new Notice(`资料筛选已更新：相关 ${relatedCount} 篇，不相关 ${rejectedCount} 篇`);
  }

  private async restoreResearchSourceCandidate(
    topic: KnowledgeResearchTopicSummary,
    document: KnowledgeThemeDocument,
  ): Promise<void> {
    const state = await this.readResearchSourceState(topic.workspacePath)
      ?? normalizeResearchSourceState({ version: 1, candidates: [], rejected: [] });
    await this.writeResearchSourceState(topic.workspacePath, normalizeResearchSourceState({
      version: 1,
      adopted: state.adopted,
      candidates: [...state.candidates, document.path],
      rejected: state.rejected.filter((path) => path !== document.path),
      scannedAt: state.scannedAt,
    }));
    await this.scanPropertyWorkspace();
    new Notice(`已恢复候选“${document.basename}”`);
  }

  private async withResearchTopic(
    sourcePath: string,
    action: (context: {
      theme: KnowledgeThemeSummary;
      topic: KnowledgeResearchTopicSummary;
      snapshot: PropertyWorkspaceSnapshot;
    }) => void | Promise<void>,
  ): Promise<void> {
    try {
      const snapshot = await this.scanPropertyWorkspace();
      for (const theme of snapshot.knowledgeThemes) {
        const topic = theme.researchTopics.find((candidate) => candidate.workspacePath === sourcePath);
        if (!topic) continue;
        await action({ theme, topic, snapshot });
        return;
      }
      throw new Error("没有找到当前课题");
    } catch (error) {
      console.error("KnowGrove: research topic action failed", error);
      new Notice(`课题操作失败：${this.errorMessage(error)}`);
    }
  }

  private async addSelectionToResearchTopic(
    theme: KnowledgeThemeSummary,
    topic: KnowledgeResearchTopicSummary,
    candidates: KnowledgeThemeDocument[],
  ): Promise<void> {
    const sourceView = this.app.workspace.getLeavesOfType("markdown")
      .map((leaf) => leaf.view)
      .find((view): view is MarkdownView => view instanceof MarkdownView
        && view.file !== null
        && view.file.path !== topic.workspacePath
        && Boolean(view.editor.getSelection().trim()));
    if (!sourceView?.file) {
      new Notice("请先在左侧资料中选中一个段落，再点击“引用左侧选区”");
      return;
    }
    const selectedText = sourceView.editor.getSelection().trim();
    const positions = orderedPositions(sourceView.editor);
    if (/\n\s*\n/.test(sourceView.editor.getRange(positions.from, positions.to))) {
      new Notice("一次只引用一个 Markdown 区块，请缩小选区");
      return;
    }
    const topicFile = await this.ensureKnowledgeResearchTopicFiles(theme, topic);
    await this.createReference(
      sourceView.editor,
      sourceView,
      sourceView.file,
      positions,
      selectedText,
      {
        comment: `课题摘录：${topic.name}`,
        targetFile: topicFile,
        targetHeading: "资料摘录",
      },
    );
    const document = candidates.find((candidate) => candidate.path === sourceView.file?.path);
    if (document) {
      await this.app.fileManager.processFrontMatter(topicFile, (frontmatter: Record<string, unknown>) => {
        delete frontmatter.资料范围;
      });
      const sourceState = await this.readResearchSourceState(topic.workspacePath)
        ?? normalizeResearchSourceState({ version: 1, adopted: [], candidates: [], rejected: [] });
      await this.writeResearchSourceState(topic.workspacePath, normalizeResearchSourceState({
        version: 1,
        adopted: [...sourceState.adopted, document.path],
        candidates: [...sourceState.candidates, document.path],
        rejected: sourceState.rejected.filter((path) => path !== document.path),
        scannedAt: sourceState.scannedAt,
      }));
      const topicLink = `[[${topic.workspacePath.replace(/\.md$/i, "")}]]`;
      await this.app.fileManager.processFrontMatter(sourceView.file, (frontmatter: Record<string, unknown>) => {
        const topics = stringValues(frontmatter.课题);
        if (!topics.includes(topicLink)) frontmatter.课题 = [...topics, topicLink];
      });
      const documents = Array.from(new Map([...topic.documents, document].map((item) => [item.path, item])).values());
      const candidateDocuments = Array.from(new Map([...topic.candidateDocuments, document].map((item) => [item.path, item])).values());
      await this.ensureKnowledgeResearchTopicFiles(theme, {
        ...topic,
        documents,
        candidateDocuments,
        total: documents.length,
      });
    }
    await this.scanPropertyWorkspace();
    new Notice(`已把选中区块引用到“${topic.name}”`);
  }

  private async loadResearchOutputSources(paths: string[]): Promise<ResearchOutputSource[]> {
    const sources: ResearchOutputSource[] = [];
    for (const path of Array.from(new Set(paths))) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile) || file.extension.toLocaleLowerCase() !== "md") continue;
      const content = await this.app.vault.cachedRead(file);
      const info = getFrontMatterInfo(content);
      const body = content.slice(info.contentStart).trim();
      if (!body) continue;
      sources.push({ path: file.path, title: file.basename, content: body });
      if (sources.length % 20 === 0) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }
    }
    return sources;
  }

  private async runCreationModel(prompt: string): Promise<string> {
    const availability = await this.getAIProviders();
    const provider = availability.find((candidate) => candidate.id === this.settings.aiProperties.provider);
    if (provider && !provider.available) throw new Error(provider.detail);
    return runAIProvider(
      this.settings.aiProperties,
      prompt,
      availability,
      this.getAISecret(this.settings.aiProperties.provider),
    );
  }

  private async planResearchOutput(
    topic: KnowledgeResearchTopicSummary,
    draft: ResearchOutputDraft,
    report: (message: string) => void,
  ): Promise<ResearchOutputPlan> {
    report(`正在读取 ${draft.selectedPaths.length} 篇材料…`);
    const sources = await this.loadResearchOutputSources(draft.selectedPaths);
    if (!sources.length) throw new Error("没有读取到可用于生成的资料正文");
    const chunks = chunkResearchOutputSources(sources);
    const batches = batchResearchOutputChunks(chunks);
    const digests = [];
    for (const [index, batch] of batches.entries()) {
      report(`正在提炼材料 ${index + 1} / ${batches.length}…`);
      const raw = await this.runCreationModel(buildResearchEvidencePrompt(topic, batch));
      const parsed = parseResearchEvidenceResponse(raw, sources);
      digests.push(...parsed);
    }
    const evidence = mergeResearchEvidenceDigests(digests);
    const completeEvidence = sources.map((source) => evidence.find((digest) => digest.path === source.path) ?? {
      path: source.path,
      title: source.title,
      summary: source.content.replace(/\s+/g, " ").trim().slice(0, 800),
      keyPoints: [],
      quotes: [],
    });
    report(`已提炼 ${completeEvidence.length} 篇材料，正在生成可编辑提纲…`);
    const raw = await this.runCreationModel(buildResearchOutputPlanPrompt(topic, completeEvidence, draft));
    return parseResearchOutputPlanResponse(raw, sources.map((source) => source.path), completeEvidence, draft.title);
  }

  private async generateResearchOutput(
    topic: KnowledgeResearchTopicSummary,
    draft: ResearchOutputDraft,
    plan: ResearchOutputPlan,
    report: (message: string) => void,
  ): Promise<void> {
    report(`正在按照 ${plan.sections.length} 个章节生成初稿…`);
    const raw = await this.runCreationModel(buildResearchOutputPrompt(topic, plan, draft));
    const output = normalizeResearchOutput(raw);
    if (!output) throw new Error("模型没有返回可写入的 Markdown 内容");
    const title = plan.title.trim() || draft.title;
    const outputFolder = this.settings.creationStudio.outputFolder.trim() || "_KnowGrove/输出";
    const outputPath = this.uniqueVaultPath(
      `${normalizePath(outputFolder).replace(/\/+$/, "")}/${safeTopicFileName(title)}.md`,
    );
    const statePath = researchOutputStatePath(outputPath);
    await this.ensureVaultFolder(outputPath.split("/").slice(0, -1));
    await this.ensureVaultFolder(statePath.split("/").slice(0, -1));
    const now = new Date();
    const date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
    const createdAt = now.toISOString();
    const noteContent = buildResearchOutputNote(topic, draft, plan, output, date);
    const file = await this.app.vault.create(outputPath, noteContent);
    const state = buildResearchOutputState(outputPath, topic.workspacePath, draft, plan, noteContent, createdAt);
    await this.app.vault.adapter.write(normalizePath(statePath), `${JSON.stringify(state, null, 2)}\n`);
    report("初稿已完成，正在打开作品…");
    await this.app.workspace.getLeaf("tab").openFile(file);
    await this.activateCreationAssistant(outputPath);
    new Notice(`初稿“${title}”已生成，可以直接在 Obsidian 中修改`);
  }

  async readResearchOutputState(outputPath: string): Promise<ResearchOutputState | null> {
    const directPath = researchOutputStatePath(outputPath);
    if (!(await this.app.vault.adapter.exists(directPath))) return null;
    try {
      const parsed = JSON.parse(await this.app.vault.adapter.read(directPath)) as unknown;
      const state = normalizeResearchOutputState(parsed);
      if (!state || state.outputPath !== outputPath) return null;
      const wasLegacy = (parsed as { version?: number }).version !== 2;
      if (wasLegacy) {
        const output = this.app.vault.getAbstractFileByPath(outputPath);
        if (output instanceof TFile && state.versions[0] && !state.versions[0].content.trimStart().startsWith("---")) {
          state.versions[0].content = await this.app.vault.read(output);
        }
        await this.writeResearchOutputState(state);
      }
      return state;
    } catch (error) {
      console.warn(`KnowGrove: failed to read creation state ${directPath}`, error);
      return null;
    }
  }

  async writeResearchOutputState(state: ResearchOutputState): Promise<void> {
    state.updatedAt = new Date().toISOString();
    const path = researchOutputStatePath(state.outputPath);
    await this.ensureAdapterFolder(path.split("/").slice(0, -1));
    await this.app.vault.adapter.write(path, `${JSON.stringify(state, null, 2)}\n`);
    this.refreshCreationAssistants();
  }

  private async ensureAdapterFolder(segments: string[]): Promise<void> {
    let current = "";
    for (const segment of segments) {
      if (!segment) continue;
      current = current ? `${current}/${segment}` : segment;
      if (!(await this.app.vault.adapter.exists(current))) await this.app.vault.adapter.mkdir(current);
    }
  }

  private refreshCreationAssistants(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(CREATION_ASSISTANT_VIEW_TYPE)) {
      if (leaf.view instanceof CreationAssistantView) void leaf.view.refresh();
    }
  }

  async activateCreationAssistant(outputPath?: string): Promise<CreationAssistantView | null> {
    if (this.creationAssistantActivation) return this.creationAssistantActivation;
    this.creationAssistantActivation = this.activateCreationAssistantOnce(outputPath);
    try {
      return await this.creationAssistantActivation;
    } finally {
      this.creationAssistantActivation = undefined;
    }
  }

  private async activateCreationAssistantOnce(outputPath?: string): Promise<CreationAssistantView | null> {
    const existing = this.app.workspace.getLeavesOfType(CREATION_ASSISTANT_VIEW_TYPE)[0];
    const leaf = existing ?? this.app.workspace.getRightLeaf(false);
    if (!leaf) {
      new Notice("无法打开创作助手");
      return null;
    }
    if (!existing) await leaf.setViewState({ type: CREATION_ASSISTANT_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
    if (!(leaf.view instanceof CreationAssistantView)) return null;
    if (outputPath) leaf.view.showOutput(outputPath);
    return leaf.view;
  }

  async openVaultFile(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      new Notice(`文件不存在：${path}`);
      return;
    }
    await this.app.workspace.getLeaf("tab").openFile(file);
  }

  async locateResearchClaim(outputPath: string, text: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(outputPath);
    if (!(file instanceof TFile)) return;
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.openFile(file);
    if (!(leaf.view instanceof MarkdownView)) return;
    const content = leaf.view.editor.getValue();
    const offset = content.indexOf(text);
    if (offset < 0) {
      new Notice("正文已发生变化，没有找到审查时的原句，请重新审查");
      return;
    }
    const from = leaf.view.editor.offsetToPos(offset);
    const to = leaf.view.editor.offsetToPos(offset + text.length);
    leaf.view.editor.setSelection(from, to);
    leaf.view.editor.scrollIntoView({ from, to }, true);
  }

  async saveCurrentResearchOutputVersion(outputPath: string, label: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(outputPath);
    const state = await this.readResearchOutputState(outputPath);
    if (!(file instanceof TFile) || !state) throw new Error("没有找到当前作品或创作状态");
    const content = await this.app.vault.read(file);
    const latest = state.versions[state.versions.length - 1];
    if (latest?.content === content) {
      new Notice("当前内容与最近保存的版本一致");
      return;
    }
    const nextNumber = state.versions.reduce((max, version) => {
      const match = /^v(\d+)$/.exec(version.id);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0) + 1;
    state.versions.push({
      id: `v${nextNumber}`,
      createdAt: new Date().toISOString(),
      label,
      content,
    });
    await this.writeResearchOutputState(state);
    new Notice(`已保存版本 v${nextNumber}`);
  }

  confirmRestoreResearchOutputVersion(outputPath: string, versionId: string): void {
    new CreationConfirmModal(
      this,
      "恢复历史版本",
      "恢复前会自动保存当前内容。确认后，当前作品将切换到所选版本。",
      "保存当前内容并恢复",
      () => this.restoreResearchOutputVersion(outputPath, versionId),
    ).open();
  }

  async openResearchOutputVersionPreview(outputPath: string, versionId: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(outputPath);
    const state = await this.readResearchOutputState(outputPath);
    const version = state?.versions.find((candidate) => candidate.id === versionId);
    if (!(file instanceof TFile) || !version) {
      new Notice("历史版本或作品不存在");
      return;
    }
    new CreationVersionPreviewModal(
      this,
      `${version.id} · ${version.label}`,
      await this.app.vault.read(file),
      version.content,
      () => this.confirmRestoreResearchOutputVersion(outputPath, versionId),
    ).open();
  }

  private async restoreResearchOutputVersion(outputPath: string, versionId: string): Promise<void> {
    const stateBefore = await this.readResearchOutputState(outputPath);
    const target = stateBefore?.versions.find((version) => version.id === versionId);
    const file = this.app.vault.getAbstractFileByPath(outputPath);
    if (!stateBefore || !target || !(file instanceof TFile)) throw new Error("历史版本或作品不存在");
    await this.saveCurrentResearchOutputVersion(outputPath, `恢复 ${versionId} 前自动保存`);
    await this.app.vault.process(file, () => target.content);
    this.refreshCreationAssistants();
    new Notice(`已恢复 ${target.label}`);
  }

  openCreationRewrite(editor: Editor, view: MarkdownView): void {
    const selection = editor.getSelection().trim();
    if (!selection || !view.file) return;
    const positions = orderedPositions(editor);
    const original = editor.getRange(positions.from, positions.to);
    new CreationRewriteModal(
      this,
      selection,
      async (action: ResearchRewriteAction, instruction: string, presetId?: ResearchOutputPresetId) => {
        const state = await this.readResearchOutputState(view.file!.path);
        const raw = await this.runCreationModel(buildResearchRewritePrompt(
          selection,
          action,
          instruction,
          state?.plan.evidence ?? [],
          presetId,
        ));
        const result = normalizeResearchOutput(raw);
        if (!result) throw new Error("模型没有返回可用的编辑结果");
        return result;
      },
      async (value, mode) => {
        if (editor.getRange(positions.from, positions.to) !== original) {
          throw new Error("原选区已发生变化，请重新选择后操作");
        }
        const state = await this.readResearchOutputState(view.file!.path);
        if (mode === "replace" && state) {
          await this.saveCurrentResearchOutputVersion(view.file!.path, "AI 局部改写前自动保存");
        }
        editor.replaceRange(mode === "replace" ? value : `${original}\n\n${value}`, positions.from, positions.to);
        new Notice(mode === "replace" ? "已替换选中内容，可随时从版本中恢复" : "已把编辑结果插入到选区下方");
      },
    ).open();
  }

  async openRegenerateResearchSection(outputPath: string, sectionIndex: number): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(outputPath);
    const state = await this.readResearchOutputState(outputPath);
    const section = state?.plan.sections[sectionIndex];
    if (!(file instanceof TFile) || !state || !section) {
      new Notice("作品或提纲章节不存在");
      return;
    }
    const current = await this.app.vault.read(file);
    const range = findMarkdownSection(current, section.heading);
    if (!range) {
      new Notice(`正文中没有找到章节“${section.heading}”，请先在正文中选中内容后使用 AI 编辑`);
      return;
    }
    new CreationRewriteModal(
      this,
      range.content,
      async (_action, instruction) => {
        const raw = await this.runCreationModel(buildResearchRewritePrompt(
          range.content,
          "改写",
          `完整重写“${section.heading}”这一节，保留 Markdown 章节标题。${instruction}`,
          state.plan.evidence.filter((evidence) => section.evidencePaths.includes(evidence.path)),
        ));
        const result = normalizeResearchOutput(raw);
        if (!result) throw new Error("模型没有返回可用的章节内容");
        return result;
      },
      async (value, mode) => {
        const latest = await this.app.vault.read(file);
        const latestRange = findMarkdownSection(latest, section.heading);
        if (!latestRange || latestRange.content !== range.content) {
          throw new Error("该章节在生成期间发生了变化，请重新操作");
        }
        if (mode === "replace") await this.saveCurrentResearchOutputVersion(outputPath, `重写“${section.heading}”前自动保存`);
        await this.app.vault.process(file, (content) => {
          const confirmed = findMarkdownSection(content, section.heading);
          if (!confirmed || confirmed.content !== range.content) return content;
          return mode === "replace"
            ? `${content.slice(0, confirmed.start)}${value.trim()}\n\n${content.slice(confirmed.end).replace(/^\s+/, "")}`
            : `${content.slice(0, confirmed.end).trimEnd()}\n\n${value.trim()}\n\n${content.slice(confirmed.end).replace(/^\s+/, "")}`;
        });
        new Notice(mode === "replace" ? "章节已重写，可从版本中恢复" : "新章节建议已插入在原章节下方");
      },
    ).open();
  }

  openChannelDerivative(outputPath: string): void {
    void this.readResearchOutputState(outputPath).then((state) => {
      if (!state) {
        new Notice("当前文档没有可用的创作状态");
        return;
      }
      new ChannelDerivativeModal(
        this,
        state.draft.title,
        state.draft.presetId,
        (presetId, title, instruction) => this.generateChannelDerivative(state, presetId, title, instruction),
      ).open();
    });
  }

  private async generateChannelDerivative(
    sourceState: ResearchOutputState,
    presetId: ResearchOutputPresetId,
    title: string,
    instruction: string,
  ): Promise<void> {
    const sourceFile = this.app.vault.getAbstractFileByPath(sourceState.outputPath);
    if (!(sourceFile instanceof TFile)) throw new Error("原作品不存在");
    const sourceContent = await this.app.vault.read(sourceFile);
    const raw = await this.runCreationModel(buildChannelDerivativePrompt(
      sourceContent.slice(0, automaticAIContentCharacterLimit(
        this.settings.aiProperties.provider,
        this.settings.aiProperties.model,
      )),
      sourceState.draft,
      presetId,
      title,
      instruction,
    ));
    const output = normalizeResearchOutput(raw);
    if (!output) throw new Error("模型没有返回可用的渠道稿");
    const folder = normalizePath(this.settings.creationStudio.outputFolder.trim() || "_KnowGrove/输出").replace(/\/+$/, "");
    const outputPath = this.uniqueVaultPath(`${folder}/${safeTopicFileName(title)}.md`);
    await this.ensureVaultFolder(outputPath.split("/").slice(0, -1));
    const now = new Date();
    const date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
    const note = buildChannelDerivativeNote(title, presetId, sourceState.outputPath, output, date);
    const file = await this.app.vault.create(outputPath, note);
    const draft: ResearchOutputDraft = {
      ...sourceState.draft,
      title,
      presetId,
    };
    const state = buildResearchOutputState(
      outputPath,
      sourceState.topicPath,
      draft,
      sourceState.plan,
      note,
      now.toISOString(),
      sourceState.outputPath,
    );
    await this.writeResearchOutputState(state);
    await this.app.workspace.getLeaf("tab").openFile(file);
    await this.activateCreationAssistant(outputPath);
    new Notice(`已生成 ${getResearchOutputPreset(presetId).label} 版本，并另存为新作品`);
  }

  async auditResearchOutput(outputPath: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(outputPath);
    const state = await this.readResearchOutputState(outputPath);
    if (!(file instanceof TFile) || !state) throw new Error("作品或创作状态不存在");
    const content = await this.app.vault.read(file);
    const chunks = chunkResearchOutputSources([{
      path: outputPath,
      title: file.basename,
      content,
    }], 6_000);
    const allowedPaths = state.plan.evidence.map((evidence) => evidence.path);
    const claims: ResearchEvidenceAuditClaim[] = [];
    for (const [index, chunk] of chunks.entries()) {
      new Notice(`正在审查证据 ${index + 1} / ${chunks.length}…`, 1500);
      const raw = await this.runCreationModel(buildResearchEvidenceAuditPrompt(
        chunk.content,
        state.plan.evidence,
        allowedPaths,
      ));
      claims.push(...parseResearchEvidenceAuditResponse(raw, allowedPaths));
    }
    const unique = Array.from(new Map(claims.map((claim) => [
      `${claim.text}::${claim.status}`,
      claim,
    ])).values());
    state.audit = {
      checkedAt: new Date().toISOString(),
      claims: unique,
    };
    await this.writeResearchOutputState(state);
    new Notice(`证据审查完成：检查出 ${unique.length} 条可验证主张`);
  }

  async updateResearchImagePrompt(outputPath: string, index: number, prompt: string): Promise<void> {
    const state = await this.readResearchOutputState(outputPath);
    const idea = state?.plan.imageIdeas[index];
    if (!state || !idea) throw new Error("配图方案不存在");
    idea.prompt = prompt.trim();
    await this.writeResearchOutputState(state);
  }

  async generateAndInsertResearchImage(outputPath: string, index: number, prompt: string): Promise<void> {
    const state = await this.readResearchOutputState(outputPath);
    const idea = state?.plan.imageIdeas[index];
    const outputFile = this.app.vault.getAbstractFileByPath(outputPath);
    if (!state || !idea || !(outputFile instanceof TFile)) throw new Error("作品或配图方案不存在");
    const cleanedPrompt = prompt.trim();
    if (!cleanedPrompt) throw new Error("配图提示词不能为空");
    idea.prompt = cleanedPrompt;
    const bytes = await generateCreationImage(
      this.settings.creationStudio,
      cleanedPrompt,
      this.getCreationImageSecret(),
    );
    const folder = normalizePath(this.settings.creationStudio.imageAssetFolder.trim()
      || "_KnowGrove/输出/assets").replace(/\/+$/, "");
    await this.ensureVaultFolder(folder.split("/"));
    const imagePath = this.uniqueVaultPath(
      `${folder}/${safeTopicFileName(`${outputFile.basename}-${idea.title}`)}.png`,
    );
    await this.app.vault.createBinary(imagePath, bytes);
    const asset: ResearchOutputImageAsset = {
      ideaTitle: idea.title,
      prompt: cleanedPrompt,
      path: imagePath,
      createdAt: new Date().toISOString(),
    };
    state.generatedImages.push(asset);
    await this.writeResearchOutputState(state);
    const embed = `![[${imagePath}]]`;
    const markdownLeaf = this.app.workspace.getLeavesOfType("markdown").find((leaf) =>
      leaf.view instanceof MarkdownView && leaf.view.file?.path === outputPath);
    if (markdownLeaf?.view instanceof MarkdownView) {
      const editor = markdownLeaf.view.editor;
      editor.replaceRange(`\n\n${embed}\n`, editor.getCursor());
    } else {
      await this.app.vault.process(outputFile, (current) =>
        `${current.trimEnd()}\n\n## 配图\n\n${embed}\n`);
    }
    new Notice(`配图已保存并插入：${imagePath}`);
  }

  private uniqueVaultPath(path: string): string {
    if (!this.app.vault.getAbstractFileByPath(path)) return path;
    const extensionMatch = /(\.[^./]+)$/.exec(path);
    const extension = extensionMatch?.[1] ?? "";
    const base = extension ? path.slice(0, -extension.length) : path;
    for (let index = 2; index < 10_000; index += 1) {
      const candidate = `${base} (${index})${extension}`;
      if (!this.app.vault.getAbstractFileByPath(candidate)) return candidate;
    }
    throw new Error(`无法为文件生成唯一名称：${path}`);
  }

  openRenameKnowledgeTheme(theme: KnowledgeThemeSummary): void {
    new RenameKnowledgeNodeModal(this, "重命名主题", theme.name, async (name) => {
      if (name === theme.name) return;
      const snapshot = await this.scanPropertyWorkspace();
      if (snapshot.knowledgeThemes.some((candidate) => candidate.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
        throw new Error(`主题“${name}”已经存在`);
      }
      const oldPaths = topicWorkspacePaths(theme.name);
      const newPaths = topicWorkspacePaths(name);
      const oldTopicFolder = `${RESEARCH_TOPIC_WORKSPACE_ROOT}/${safeTopicFileName(theme.name)}`;
      const newTopicFolder = `${RESEARCH_TOPIC_WORKSPACE_ROOT}/${safeTopicFileName(name)}`;
      const relatedPaths = new Set(theme.documents.map((document) => document.path));
      const affectedDocuments = snapshot.knowledgeDocuments.filter((document) => relatedPaths.has(document.path)
        || document.topics.some((value) => value.toLocaleLowerCase() === theme.name.toLocaleLowerCase()));
      const targets = [newPaths.notePath, newPaths.basePath, newTopicFolder];
      for (const target of targets) {
        if (target !== oldPaths.notePath && target !== oldPaths.basePath && target !== oldTopicFolder
          && this.app.vault.getAbstractFileByPath(target)) throw new Error(`目标路径已存在：${target}`);
      }
      const topicFolder = this.app.vault.getAbstractFileByPath(oldTopicFolder);
      if (topicFolder instanceof TFolder && oldTopicFolder !== newTopicFolder) {
        await this.app.fileManager.renameFile(topicFolder, newTopicFolder);
      }
      const base = this.app.vault.getAbstractFileByPath(oldPaths.basePath);
      if (base instanceof TFile) await this.app.fileManager.renameFile(base, newPaths.basePath);
      const note = this.app.vault.getAbstractFileByPath(oldPaths.notePath);
      if (!(note instanceof TFile)) throw new Error(`主题文档不存在：${oldPaths.notePath}`);
      await this.app.fileManager.renameFile(note, newPaths.notePath);
      await this.app.fileManager.processFrontMatter(note, (frontmatter: Record<string, unknown>) => {
        frontmatter.文件名 = name;
        frontmatter.主题名称 = name;
      });
      for (const document of affectedDocuments) {
        const source = this.app.vault.getAbstractFileByPath(document.path);
        if (!(source instanceof TFile)) continue;
        await this.app.fileManager.processFrontMatter(source, (frontmatter: Record<string, unknown>) => {
          const values = renameKnowledgeThemePropertyValues(
            stringValues(frontmatter.主题),
            theme.name,
            name,
            oldPaths.notePath,
            newPaths.notePath,
          );
          if (values.length) frontmatter.主题 = values;
          else delete frontmatter.主题;
        });
      }
      for (const topic of theme.researchTopics) {
        const topicPath = researchTopicWorkspacePaths(name, topic.name).notePath;
        const topicFile = this.app.vault.getAbstractFileByPath(topicPath);
        if (!(topicFile instanceof TFile)) continue;
        await this.app.fileManager.processFrontMatter(topicFile, (frontmatter: Record<string, unknown>) => {
          frontmatter.上级主题 = `[[${newPaths.notePath.replace(/\.md$/i, "")}]]`;
          const values = renameKnowledgeThemePropertyValues(
            stringValues(frontmatter.主题),
            theme.name,
            name,
            oldPaths.notePath,
            newPaths.notePath,
          );
          if (values.length) frontmatter.主题 = values;
        });
      }
      for (const childTheme of snapshot.knowledgeThemes.filter((candidate) =>
        candidate.parentName && knowledgeNamesMatch(candidate.parentName, theme.name))) {
        const childFile = this.app.vault.getAbstractFileByPath(childTheme.workspacePath);
        if (!(childFile instanceof TFile)) continue;
        await this.app.fileManager.processFrontMatter(childFile, (frontmatter: Record<string, unknown>) => {
          frontmatter.上级主题 = name;
        });
      }
      const refreshed = await this.scanPropertyWorkspace();
      const renamed = refreshed.knowledgeThemes.find((candidate) => candidate.name === name);
      if (renamed) await this.ensureKnowledgeThemeFiles(renamed);
      new Notice(`主题已重命名为“${name}”，同步更新 ${affectedDocuments.length} 篇笔记属性`);
    }).open();
  }

  openRenameIndexedTopic(theme: KnowledgeThemeSummary): void {
    if (theme.workspaceExists) {
      this.openRenameKnowledgeTheme(theme);
      return;
    }
    new RenameKnowledgeNodeModal(this, "批量重命名主题", theme.name, async (name) => {
      if (knowledgeNamesMatch(name, theme.name)) return;
      const snapshot = await this.scanPropertyWorkspace();
      if (snapshot.knowledgeThemes.some((candidate) => knowledgeNamesMatch(candidate.name, name))) {
        throw new Error(`主题“${name}”已经存在`);
      }
      const affectedDocuments = snapshot.knowledgeDocuments.filter((document) =>
        document.topics.some((topic) => knowledgeNamesMatch(topic, theme.name)));
      for (const document of affectedDocuments) {
        const file = this.app.vault.getAbstractFileByPath(document.path);
        if (!(file instanceof TFile)) continue;
        await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
          const values = renameRawKnowledgeTopicPropertyValues(stringValues(frontmatter.主题), theme.name, name);
          if (values.length) frontmatter.主题 = values;
          else delete frontmatter.主题;
        });
      }
      await this.scanPropertyWorkspace(new Set(affectedDocuments.map((document) => document.path)));
      new Notice(`主题已重命名为“${name}”，同步更新 ${affectedDocuments.length} 篇笔记`);
    }).open();
  }

  confirmDeleteIndexedTopic(theme: KnowledgeThemeSummary, relatedCount = theme.documents.length): void {
    const managedMessage = theme.workspaceExists
      ? "主题工作区与课题目录会移入 Obsidian 回收站，来源文档不会被删除。"
      : "来源文档不会被删除。";
    new CreationConfirmModal(
      this,
      `删除主题“${theme.name}”`,
      `将从 ${relatedCount} 篇关联笔记中移除这个主题。${managedMessage} 该操作不会删除笔记里的其他主题。`,
      "删除主题",
      () => this.deleteIndexedTopic(theme),
    ).open();
  }

  private async deleteIndexedTopic(theme: KnowledgeThemeSummary): Promise<void> {
    const snapshot = await this.scanPropertyWorkspace();
    const currentTheme = snapshot.knowledgeThemes.find((candidate) => knowledgeNamesMatch(candidate.name, theme.name)) ?? theme;
    const affectedDocuments = snapshot.knowledgeDocuments.filter((document) =>
      document.topics.some((topic) => knowledgeNamesMatch(topic, theme.name)));
    for (const document of affectedDocuments) {
      const file = this.app.vault.getAbstractFileByPath(document.path);
      if (!(file instanceof TFile)) continue;
      await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
        const values = removeKnowledgeTopicPropertyValues(
          stringValues(frontmatter.主题),
          theme.name,
          currentTheme.workspacePath,
        );
        if (values.length) frontmatter.主题 = values;
        else delete frontmatter.主题;
      });
    }
    let detachedChildren = 0;
    for (const childTheme of snapshot.knowledgeThemes.filter((candidate) =>
      candidate.parentName && knowledgeNamesMatch(candidate.parentName, currentTheme.name))) {
      const childFile = this.app.vault.getAbstractFileByPath(childTheme.workspacePath);
      if (!(childFile instanceof TFile)) continue;
      await this.app.fileManager.processFrontMatter(childFile, (frontmatter: Record<string, unknown>) => {
        delete frontmatter.上级主题;
      });
      detachedChildren += 1;
    }
    let trashedArtifacts = 0;
    if (currentTheme.workspaceExists) {
      const paths = topicWorkspacePaths(theme.name);
      const artifactPaths = [
        `${RESEARCH_TOPIC_WORKSPACE_ROOT}/${safeTopicFileName(theme.name)}`,
        researchSourceStatePath(paths.notePath),
        legacyResearchSourceStatePath(paths.notePath),
        paths.basePath,
        paths.notePath,
      ];
      for (const path of artifactPaths) {
        const artifact = this.app.vault.getAbstractFileByPath(normalizePath(path));
        if (!artifact) continue;
        await this.app.fileManager.trashFile(artifact);
        trashedArtifacts += 1;
      }
    }
    await this.scanPropertyWorkspace(new Set(affectedDocuments.map((document) => document.path)));
    new Notice(`已删除主题“${theme.name}”：更新 ${affectedDocuments.length} 篇笔记${detachedChildren ? `，${detachedChildren} 个子主题已移到顶层` : ""}${trashedArtifacts ? `，${trashedArtifacts} 项工作区内容已移入回收站` : ""}`);
  }

  openRenameKnowledgeResearchTopic(theme: KnowledgeThemeSummary, topic: KnowledgeResearchTopicSummary): void {
    new RenameKnowledgeNodeModal(this, "重命名课题", topic.name, async (name) => {
      if (name === topic.name) return;
      if (theme.researchTopics.some((candidate) => candidate.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
        throw new Error(`课题“${name}”已经存在`);
      }
      const paths = researchTopicWorkspacePaths(theme.name, name);
      if (this.app.vault.getAbstractFileByPath(paths.notePath) || this.app.vault.getAbstractFileByPath(paths.basePath)) {
        throw new Error(`课题目标路径已存在：${paths.notePath}`);
      }
      const note = await this.ensureKnowledgeResearchTopicFiles(theme, topic);
      const base = this.app.vault.getAbstractFileByPath(topic.basePath);
      if (base instanceof TFile) await this.app.fileManager.renameFile(base, paths.basePath);
      await this.app.fileManager.renameFile(note, paths.notePath);
      await this.app.fileManager.processFrontMatter(note, (frontmatter: Record<string, unknown>) => {
        frontmatter.文件名 = name;
        frontmatter.课题名称 = name;
      });
      const themeFile = this.app.vault.getAbstractFileByPath(theme.workspacePath);
      if (themeFile instanceof TFile) {
        await this.app.fileManager.processFrontMatter(themeFile, (frontmatter: Record<string, unknown>) => {
          frontmatter.研究课题 = stringValues(frontmatter.研究课题).map((value) => value === topic.name ? name : value);
        });
      }
      await this.scanPropertyWorkspace();
      new Notice(`课题已重命名为“${name}”`);
    }).open();
  }

  private async ensureKnowledgeWorkspaceFiles(workspace: KnowledgeWorkspaceSummary): Promise<TFile> {
    await this.ensureVaultFolder(workspace.workspacePath.split("/").slice(0, -1));
    const baseContent = buildKnowledgeWorkspaceBase(workspace);
    const baseAbstract = this.app.vault.getAbstractFileByPath(workspace.basePath);
    if (baseAbstract instanceof TFolder) throw new Error(`工作空间 Base 路径是文件夹：${workspace.basePath}`);
    if (baseAbstract instanceof TFile) {
      const current = await this.app.vault.read(baseAbstract);
      if (!isManagedKnowledgeWorkspaceBase(current)) throw new Error(`工作空间 Base 已存在且不是插件生成：${workspace.basePath}`);
      if (current !== baseContent) await this.app.vault.process(baseAbstract, () => baseContent);
    } else {
      await this.app.vault.create(workspace.basePath, baseContent);
    }
    const noteAbstract = this.app.vault.getAbstractFileByPath(workspace.workspacePath);
    if (noteAbstract instanceof TFolder) throw new Error(`工作空间路径是文件夹：${workspace.workspacePath}`);
    if (noteAbstract instanceof TFile) {
      const current = await this.app.vault.read(noteAbstract);
      if (!/knowgrove_workspace:\s*true/.test(current)) {
        throw new Error(`工作空间已存在且不是插件生成：${workspace.workspacePath}`);
      }
      await this.app.fileManager.processFrontMatter(noteAbstract, (frontmatter: Record<string, unknown>) => {
        delete frontmatter.资料范围;
        delete frontmatter.子空间;
      });
      return noteAbstract;
    }
    return this.app.vault.create(workspace.workspacePath, buildKnowledgeWorkspaceNote(workspace));
  }

  openCreateKnowledgeWorkspace(
    initialType: KnowledgeWorkspaceType,
    defaultDomain = "",
    defaultParent?: KnowledgeWorkspaceSummary,
  ): void {
    void this.scanPropertyWorkspace().then((snapshot) => {
      new CreateKnowledgeWorkspaceModal(
        this,
        initialType,
        defaultDomain,
        snapshot.knowledgeWorkspaces,
        defaultParent,
        async (draft: KnowledgeWorkspaceDraft) => {
          const current = await this.scanPropertyWorkspace();
          const paths = knowledgeWorkspacePaths(draft.type, draft.name);
          if (current.knowledgeWorkspaces.some((workspace) => workspace.workspacePath === paths.notePath)
            || this.app.vault.getAbstractFileByPath(paths.notePath)
            || this.app.vault.getAbstractFileByPath(paths.basePath)) {
            throw new Error(`工作空间“${draft.name}”已经存在`);
          }
          const workspace: KnowledgeWorkspaceSummary = {
            name: draft.name,
            type: draft.type,
            objective: draft.objective,
            status: draft.type === "项目" ? "构思中" : "进行中",
            domains: draft.domains,
            themes: draft.themes,
            parentName: draft.parentName,
            parentPath: draft.parentPath,
            repeatRule: draft.repeatRule,
            total: 0,
            workspaceExists: false,
            workspacePath: paths.notePath,
            basePath: paths.basePath,
            explicitSourcePaths: [],
            documents: [],
          };
          const file = await this.ensureKnowledgeWorkspaceFiles(workspace);
          const leaf = this.app.workspace.getLeaf("tab");
          await leaf.openFile(file);
          await this.app.workspace.revealLeaf(leaf);
          await this.scanPropertyWorkspace();
          new Notice(`已创建${draft.type}“${draft.name}”`);
        },
      ).open();
    }).catch((error) => {
      console.error("KnowGrove: failed to open workspace creator", error);
      new Notice(`工作空间创建入口打开失败：${this.errorMessage(error)}`);
    });
  }

  async openKnowledgeWorkspace(workspace: KnowledgeWorkspaceSummary): Promise<void> {
    try {
      const file = await this.ensureKnowledgeWorkspaceFiles(workspace);
      const leaf = this.app.workspace.getLeaf("tab");
      await leaf.openFile(file);
      await this.app.workspace.revealLeaf(leaf);
      await this.scanPropertyWorkspace();
    } catch (error) {
      console.error("KnowGrove: failed to open workspace", error);
      new Notice(`工作空间打开失败：${this.errorMessage(error)}`);
    }
  }

  async openKnowledgeWorkspaceManager(workspace: KnowledgeWorkspaceSummary): Promise<void> {
    try {
      if (!workspace.workspaceExists) await this.ensureKnowledgeWorkspaceFiles(workspace);
      const snapshot = await this.scanPropertyWorkspace();
      const current = snapshot.knowledgeWorkspaces.find((candidate) => candidate.workspacePath === workspace.workspacePath)
        ?? { ...workspace, workspaceExists: true };
      new KnowledgeWorkspaceManagerModal(
        this,
        current,
        snapshot.knowledgeDocuments,
        () => this.planKnowledgeWorkspace(current, snapshot.knowledgeDocuments),
        async (objective, paths) => this.updateKnowledgeWorkspace(current, snapshot.knowledgeDocuments, objective, paths),
      ).open();
    } catch (error) {
      console.error("KnowGrove: failed to open workspace manager", error);
      new Notice(`工作空间设置打开失败：${this.errorMessage(error)}`);
    }
  }

  private async planKnowledgeWorkspace(
    workspace: KnowledgeWorkspaceSummary,
    candidates: KnowledgeThemeDocument[],
  ): Promise<ThemePlanningProposal> {
    if (!this.settings.aiProperties.enabled) throw new Error("请先在设置中启用 AI 自动属性并选择模型");
    const ranked = rankWorkspaceSourceCandidates(workspace, candidates, 40);
    const availability = await this.getAIProviders();
    const selected = availability.find((provider) => provider.id === this.settings.aiProperties.provider);
    if (selected && !selected.available) throw new Error(selected.detail);
    const raw = await runAIProvider(
      this.settings.aiProperties,
      buildWorkspacePlanningPrompt(workspace, ranked),
      availability,
      this.getAISecret(this.settings.aiProperties.provider),
    );
    return parseThemePlanningResponse(raw, ranked.map((document) => document.path));
  }

  private async updateKnowledgeWorkspace(
    workspace: KnowledgeWorkspaceSummary,
    candidates: KnowledgeThemeDocument[],
    objective: string,
    sourcePaths: string[],
  ): Promise<void> {
    const file = await this.ensureKnowledgeWorkspaceFiles(workspace);
    const selected = new Set(sourcePaths);
    const documents = candidates.filter((document) => selected.has(document.path));
    await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
      frontmatter.目标 = objective;
      delete frontmatter.资料范围;
      delete frontmatter.子空间;
    });
    const relationProperty = workspace.type === "项目" ? "所属项目" : "所属空间";
    const workspaceLink = `[[${workspace.workspacePath.replace(/\.md$/i, "")}]]`;
    const affected = new Set([...workspace.documents.map((document) => document.path), ...documents.map((document) => document.path)]);
    for (const path of affected) {
      const source = this.app.vault.getAbstractFileByPath(path);
      if (!(source instanceof TFile)) continue;
      await this.app.fileManager.processFrontMatter(source, (frontmatter: Record<string, unknown>) => {
        const values = stringValues(frontmatter[relationProperty]);
        const withoutCurrent = values.filter((value) => {
          const normalized = normalizeKnowledgeTopic(value).toLocaleLowerCase();
          const target = /^\[\[([^\]|#]+)/.exec(value.trim())?.[1]?.replace(/\.md$/i, "") ?? "";
          return normalized !== workspace.name.toLocaleLowerCase()
            && target !== workspace.workspacePath.replace(/\.md$/i, "");
        });
        const nextValues = selected.has(path) ? [...withoutCurrent, workspaceLink] : withoutCurrent;
        if (nextValues.length > 0) frontmatter[relationProperty] = nextValues;
        else delete frontmatter[relationProperty];
      });
    }
    await this.ensureKnowledgeWorkspaceFiles({
      ...workspace,
      objective,
      workspaceExists: true,
      total: documents.length,
      explicitSourcePaths: documents.map((document) => document.path),
      documents,
    });
    await this.scanPropertyWorkspace();
    new Notice(`“${workspace.name}”已关联 ${documents.length} 篇资料`);
  }

  openRenameKnowledgeWorkspace(workspace: KnowledgeWorkspaceSummary): void {
    new RenameKnowledgeNodeModal(this, `重命名${workspace.type}`, workspace.name, async (name) => {
      if (name === workspace.name) return;
      const paths = knowledgeWorkspacePaths(workspace.type, name);
      if (this.app.vault.getAbstractFileByPath(paths.notePath) || this.app.vault.getAbstractFileByPath(paths.basePath)) {
        throw new Error(`工作空间目标路径已存在：${paths.notePath}`);
      }
      const note = await this.ensureKnowledgeWorkspaceFiles(workspace);
      const base = this.app.vault.getAbstractFileByPath(workspace.basePath);
      if (base instanceof TFile) await this.app.fileManager.renameFile(base, paths.basePath);
      await this.app.fileManager.renameFile(note, paths.notePath);
      await this.app.fileManager.processFrontMatter(note, (frontmatter: Record<string, unknown>) => {
        frontmatter.文件名 = name;
        frontmatter.空间名称 = name;
      });
      await this.scanPropertyWorkspace();
      new Notice(`${workspace.type}已重命名为“${name}”`);
    }).open();
  }

  async openKnowledgeThemeManager(theme: KnowledgeThemeSummary): Promise<void> {
    try {
      if (!theme.workspaceExists) await this.ensureKnowledgeThemeFiles(theme);
      await new Promise<void>((resolve) => window.setTimeout(resolve, 80));
      const snapshot = await this.scanPropertyWorkspace();
      const current = snapshot.knowledgeThemes.find((candidate) => candidate.name.toLocaleLowerCase() === theme.name.toLocaleLowerCase())
        ?? { ...theme, fixed: true, workspaceExists: true };
      new KnowledgeThemeManagerModal(
        this,
        current,
        snapshot.knowledgeThemes,
        snapshot.knowledgeDocuments,
        (questions) => this.planKnowledgeTheme(current, snapshot.knowledgeDocuments, questions),
        async (domains, parentName, questions, paths) => {
          await this.updateKnowledgeTheme(current, snapshot.knowledgeThemes, snapshot.knowledgeDocuments, domains, parentName, questions, paths);
        },
      ).open();
    } catch (error) {
      console.error("KnowGrove: failed to open theme manager", error);
      new Notice(`主题设置打开失败：${this.errorMessage(error)}`);
    }
  }

  private async updateKnowledgeTheme(
    theme: KnowledgeThemeSummary,
    allThemes: KnowledgeThemeSummary[],
    candidates: KnowledgeThemeSummary["documents"],
    domains: string[],
    parentName: string,
    researchQuestions: string[],
    sourcePaths: string[],
  ): Promise<void> {
    const normalizedParentName = parentName.trim();
    if (normalizedParentName) {
      const byName = new Map(allThemes.map((candidate) => [normalizeKnowledgeNameKey(candidate.name), candidate]));
      let current = byName.get(normalizeKnowledgeNameKey(normalizedParentName));
      if (!current) throw new Error(`上级主题“${normalizedParentName}”不存在`);
      const visited = new Set<string>();
      while (current) {
        const key = normalizeKnowledgeNameKey(current.name);
        if (knowledgeNamesMatch(current.name, theme.name)) throw new Error("主题层级不能形成循环");
        if (visited.has(key)) throw new Error("现有主题层级中存在循环，请先清理上级主题");
        visited.add(key);
        current = current.parentName ? byName.get(normalizeKnowledgeNameKey(current.parentName)) : undefined;
      }
    }
    const nextTheme = { ...theme, domains, parentName: normalizedParentName || undefined };
    const workspace = await this.ensureKnowledgeThemeFiles(nextTheme);
    const selected = new Set(sourcePaths);
    const documents = candidates.filter((document) => selected.has(document.path));
    const researchTopics: KnowledgeResearchTopicSummary[] = [];
    for (const question of researchQuestions) {
      const existing = theme.researchTopics.find((topic) => topic.name.toLocaleLowerCase() === question.toLocaleLowerCase());
      const paths = researchTopicWorkspacePaths(theme.name, question);
      const topic = existing ?? {
        name: question,
        coreQuestion: question,
        parentThemeName: theme.name,
        domains,
        total: 0,
        fixed: true,
        workspaceExists: false,
        workspacePath: paths.notePath,
        basePath: paths.basePath,
        explicitSourcePaths: [],
        documents: [],
        candidateDocuments: rankResearchTopicSourceCandidates({
          name: question,
          coreQuestion: question,
          parentThemeName: theme.name,
          domains,
        }, candidates),
      };
      const nextTopic = { ...topic, parentThemeName: theme.name, domains };
      const topicFile = await this.ensureKnowledgeResearchTopicFiles(nextTheme, nextTopic);
      await this.app.fileManager.processFrontMatter(topicFile, (frontmatter: Record<string, unknown>) => {
        frontmatter.领域 = domains;
        frontmatter.上级主题 = `[[${theme.workspacePath.replace(/\.md$/i, "")}]]`;
      });
      researchTopics.push({ ...nextTopic, workspaceExists: true });
    }
    await this.app.fileManager.processFrontMatter(workspace, (frontmatter: Record<string, unknown>) => {
      frontmatter.固定主题 = true;
      frontmatter.领域 = domains;
      if (normalizedParentName) frontmatter.上级主题 = normalizedParentName;
      else delete frontmatter.上级主题;
      frontmatter.研究课题 = researchQuestions;
      delete frontmatter.资料范围;
      delete frontmatter.课题范围;
    });
    const themeLink = `[[${theme.workspacePath.replace(/\.md$/i, "")}]]`;
    const existingThemePaths = new Set(theme.documents.map((document) => document.path));
    const affectedDocuments = candidates.filter((document) => selected.has(document.path)
      || existingThemePaths.has(document.path)
      || document.topics.some((value) => value.toLocaleLowerCase() === theme.name.toLocaleLowerCase()));
    for (const document of affectedDocuments) {
      const source = this.app.vault.getAbstractFileByPath(document.path);
      if (!(source instanceof TFile)) continue;
      await this.app.fileManager.processFrontMatter(source, (frontmatter: Record<string, unknown>) => {
        const values = stringValues(frontmatter.主题);
        const withoutCurrent = values.filter((value) => normalizeKnowledgeTopic(value).toLocaleLowerCase() !== theme.name.toLocaleLowerCase());
        const nextTopics = selected.has(document.path) ? [...withoutCurrent, themeLink] : withoutCurrent;
        if (nextTopics.length) frontmatter.主题 = nextTopics;
        else delete frontmatter.主题;
        const otherTopicNames = new Set(document.topics
          .filter((value) => value.toLocaleLowerCase() !== theme.name.toLocaleLowerCase())
          .map((value) => value.toLocaleLowerCase()));
        const retainedDomains = allThemes
          .filter((candidate) => otherTopicNames.has(candidate.name.toLocaleLowerCase()))
          .flatMap((candidate) => candidate.domains);
        const nextDomains = migrateKnowledgeThemeDomains(
          stringValues(frontmatter.领域),
          theme.domains,
          selected.has(document.path) ? domains : [],
          retainedDomains,
        );
        if (nextDomains.length) frontmatter.领域 = nextDomains;
        else delete frontmatter.领域;
      });
    }
    const stageCounts = { P: 1, D: 0, S: 0, A: 0 } as KnowledgeThemeSummary["stageCounts"];
    for (const document of documents) stageCounts[document.stage] += 1;
    await this.ensureKnowledgeThemeFiles({
      ...nextTheme,
      fixed: true,
      workspaceExists: true,
      researchQuestions,
      researchTopics,
      explicitSourcePaths: documents.map((document) => document.path),
      documents,
      total: documents.length,
      stageCounts,
    });
    await new Promise<void>((resolve) => window.setTimeout(resolve, 80));
    await this.scanPropertyWorkspace();
    new Notice(`“${theme.name}”已更新：${domains.join(" / ")}${normalizedParentName ? `，上级主题 ${normalizedParentName}` : "，顶层主题"}，同步 ${affectedDocuments.length} 篇笔记`);
  }

  private async planKnowledgeTheme(
    theme: KnowledgeThemeSummary,
    candidates: KnowledgeThemeSummary["documents"],
    researchQuestions: string[],
  ): Promise<ThemePlanningProposal> {
    if (!this.settings.aiProperties.enabled) throw new Error("请先在设置中启用 AI 自动属性并选择模型");
    const planningTheme = { ...theme, researchQuestions };
    const ranked = rankThemeSourceCandidates(planningTheme, candidates, 36);
    const availability = await this.getAIProviders();
    const selected = availability.find((provider) => provider.id === this.settings.aiProperties.provider);
    if (selected && !selected.available) throw new Error(selected.detail);
    const raw = await runAIProvider(
      this.settings.aiProperties,
      buildThemePlanningPrompt(planningTheme, ranked),
      availability,
      this.getAISecret(this.settings.aiProperties.provider),
    );
    return parseThemePlanningResponse(raw, ranked.map((document) => document.path));
  }

  async synthesizeKnowledgeTheme(theme: KnowledgeThemeSummary): Promise<void> {
    if (!this.settings.aiProperties.enabled) {
      new Notice("请先在设置中启用 AI 自动属性并选择模型");
      this.openPropertySettings();
      return;
    }
    if (!theme.documents.length) {
      new Notice("这个主题还没有可以整理的资料");
      return;
    }
    try {
      const workspace = await this.ensureKnowledgeThemeFiles(theme);
      new Notice(`AI 正在整理“${theme.name}”的研究结构…`, 3000);
      const sources: ThemeSynthesisPromptSource[] = [];
      for (const document of theme.documents.slice(0, 30)) {
        const file = this.app.vault.getAbstractFileByPath(document.path);
        if (!(file instanceof TFile)) continue;
        const content = await this.app.vault.cachedRead(file);
        const info = getFrontMatterInfo(content);
        const body = content.slice(info.contentStart).trim().slice(0, 1_600);
        sources.push({
          path: document.path,
          title: document.basename,
          type: document.type,
          status: document.status,
          content: body,
        });
      }
      if (!sources.length) throw new Error("没有读取到可用于整理的主题资料");
      const availability = await this.getAIProviders();
      const selected = availability.find((provider) => provider.id === this.settings.aiProperties.provider);
      if (selected && !selected.available) throw new Error(selected.detail);
      const prompt = buildThemeSynthesisPrompt(theme, sources);
      const runThemeModel = (modelPrompt: string) => runAIProvider(
        this.settings.aiProperties,
        modelPrompt,
        availability,
        this.getAISecret(this.settings.aiProperties.provider),
      );
      const raw = await runThemeModel(prompt);
      let proposal: ThemeSynthesisProposal;
      try {
        proposal = parseThemeSynthesisResponse(raw, sources.map((source) => source.path));
      } catch (firstError) {
        console.warn("KnowGrove: model returned malformed theme JSON; requesting one syntax repair", firstError);
        const repaired = await runThemeModel(buildThemeSynthesisRepairPrompt(raw));
        try {
          proposal = parseThemeSynthesisResponse(repaired, sources.map((source) => source.path));
        } catch (repairError) {
          throw new Error(`模型返回结构有误，自动修复后仍无法解析：${this.errorMessage(repairError)}`);
        }
      }
      new ThemeSynthesisModal(this, theme, proposal, async () => {
        await this.app.vault.process(workspace, (current) => {
          const withStructure = ensureThemeDimensionHeadings(current, proposal);
          return mergeThemeSynthesis(withStructure, proposal);
        });
        await this.app.fileManager.processFrontMatter(workspace, (frontmatter: Record<string, unknown>) => {
          if (frontmatter.当前阶段 === "P" || frontmatter.当前阶段 === "D") frontmatter.当前阶段 = "S";
          const existing = Array.isArray(frontmatter.研究课题)
            ? frontmatter.研究课题.filter((value: unknown): value is string => typeof value === "string")
            : [];
          frontmatter.研究课题 = Array.from(new Set([...existing, ...proposal.dimensions.map((dimension) => dimension.name)]));
        });
        await this.openKnowledgeTheme({ ...theme, workspaceExists: true, currentStage: "S" });
        new Notice(`“${theme.name}”的 AI 研究建议已写入主题空间`);
      }).open();
    } catch (error) {
      console.error("KnowGrove: theme synthesis failed", error);
      new Notice(`AI 整理主题失败：${this.errorMessage(error)}`, 8000);
    }
  }

  async openPropertyBaseView(viewName: string): Promise<void> {
    await this.ensureAndOpenPropertyBase(viewName);
  }

  async ensureAndOpenPropertyBase(viewName?: string): Promise<void> {
    try {
      const configured = this.settings.propertySystem.basePath.trim() || "_KnowGrove/属性工作台.base";
      const path = normalizePath(configured.endsWith(".base") ? configured : `${configured}.base`).replace(/^\/+/, "");
      await this.ensureVaultFolder(path.split("/").slice(0, -1));
      const snapshot = await this.scanPropertyWorkspace();
      const content = `${PROPERTY_BASE_MANAGED_MARKER}\n${buildPropertyBase(this.settings.propertySystem, snapshot.audit)}`;
      const abstract = this.app.vault.getAbstractFileByPath(path);
      if (abstract instanceof TFolder) throw new Error(`目标路径是文件夹：${path}`);
      let file: TFile;
      if (abstract instanceof TFile) {
        file = abstract;
        const existing = await this.app.vault.read(file);
        if (!isManagedPropertyBaseContent(existing)) {
          new Notice("目标 Base 已存在且不是插件生成。请在设置中换一个路径，避免覆盖你的内容。", 8000);
          return;
        }
        await this.app.vault.process(file, () => content);
      } else {
        file = await this.app.vault.create(path, content);
      }
      const existingLeaf = this.app.workspace.getLeavesOfType("bases").find((leaf) => {
        const view = leaf.view as typeof leaf.view & { file?: TFile };
        return view.file?.path === file.path;
      });
      const leaf = existingLeaf ?? this.app.workspace.getLeaf("tab");
      await leaf.openFile(file);
      await this.app.workspace.revealLeaf(leaf);
      if (viewName) await this.selectPropertyBaseView(leaf, viewName);
      else new Notice("属性工作面已更新");
    } catch (error) {
      console.error("KnowGrove: failed to generate property Base", error);
      new Notice(`Base 生成失败：${this.errorMessage(error)}`);
    }
  }

  private async selectPropertyBaseView(leaf: WorkspaceLeaf, viewName: string): Promise<void> {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const controller = (leaf.view as typeof leaf.view & {
        controller?: { selectView?: (name: string) => void };
      }).controller;
      if (controller?.selectView) {
        controller.selectView(viewName);
        return;
      }
      await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
    }
    throw new Error(`无法切换到工作面：${viewName}`);
  }

  private async ensureVaultFolder(segments: string[]): Promise<void> {
    let current = "";
    for (const segment of segments) {
      if (!segment) continue;
      current = current ? `${current}/${segment}` : segment;
      const existing = this.app.vault.getAbstractFileByPath(current);
      if (existing instanceof TFolder) continue;
      if (existing) throw new Error(`无法创建文件夹，已有同名文件：${current}`);
      await this.app.vault.createFolder(current);
    }
  }

  getReferenceTargetFiles(source: TFile | string): TFile[] {
    const sourcePath = typeof source === "string" ? source : source.path;
    return this.app.vault.getMarkdownFiles()
      .filter((file) => file.path !== sourcePath)
      .sort((a, b) => {
        const aFrontmatter = this.app.metadataCache.getFileCache(a)?.frontmatter;
        const bFrontmatter = this.app.metadataCache.getFileCache(b)?.frontmatter;
        const aWorkspace = aFrontmatter?.knowgrove_topic_workspace === true
          || aFrontmatter?.knowgrove_research_topic === true
          || aFrontmatter?.knowgrove_workspace === true;
        const bWorkspace = bFrontmatter?.knowgrove_topic_workspace === true
          || bFrontmatter?.knowgrove_research_topic === true
          || bFrontmatter?.knowgrove_workspace === true;
        if (aWorkspace !== bWorkspace) return aWorkspace ? -1 : 1;
        return a.path.localeCompare(b.path, "zh-CN");
      });
  }

  getReferencesForBlock(blockId: string): ReferenceRecord[] {
    return Object.values(this.data.references)
      .filter((record) => record.sourceBlockId === blockId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  getReferencesForSource(sourcePath: string): ReferenceRecord[] {
    return Object.values(this.data.references)
      .filter((record) => record.sourcePath === sourcePath)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async openCommentsForBlock(blockId: string): Promise<void> {
    if (!this.settings.enableComments) return;
    const records = this.getReferencesForBlock(blockId);
    if (!records.length) return;
    const record = records[0];
    if (record) await this.openCommentSidebarForRecord(record);
  }

  async openCommentSidebarForActiveSelection(): Promise<void> {
    if (!this.settings.enableComments) {
      new Notice("评论功能已关闭");
      return;
    }
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) {
      new Notice("请先在 Markdown 文档中选中文字");
      return;
    }
    await this.openCommentSidebarForSelection(view.editor, view);
  }

  async openCommentSidebarForCodeMirror(
    codeMirror: Parameters<typeof refreshCommentEditorDecorations>[0],
    selectedRange?: { from: number; to: number },
  ): Promise<void> {
    if (!this.settings.enableComments) return;
    const markdownView = this.app.workspace.getLeavesOfType("markdown")
      .map((leaf) => leaf.view)
      .find((view): view is MarkdownView => view instanceof MarkdownView
        && (view.editor as Editor & {
          cm?: Parameters<typeof refreshCommentEditorDecorations>[0];
        }).cm === codeMirror);
    if (!markdownView?.file) {
      new Notice("无法识别选区所在的 Markdown 文档，请重新选择文字");
      return;
    }
    const selection = selectedRange ?? codeMirror.state.selection.main;
    const rawSelection = codeMirror.state.doc.sliceString(selection.from, selection.to);
    const selectedText = rawSelection.trim();
    if (!selectedText) {
      new Notice("请先选中要评论的内容");
      return;
    }
    if (/\n\s*\n/.test(rawSelection)) {
      new Notice("一次只能评论一个 Markdown 区块，请缩小选区后重试");
      return;
    }
    const draft: CommentSelectionDraft = {
      sourcePath: markdownView.file.path,
      selectedText,
      from: markdownView.editor.offsetToPos(selection.from),
      to: markdownView.editor.offsetToPos(selection.to),
    };
    const sidebar = await this.activateCommentSidebar();
    sidebar?.showDraft(draft);
  }

  async openCommentSidebarForSelection(editor: Editor, view: MarkdownView): Promise<void> {
    if (!this.settings.enableComments) {
      new Notice("评论功能已关闭");
      return;
    }
    const selectedText = editor.getSelection().trim();
    const file = view.file;
    if (!file || !selectedText) {
      new Notice("请先选中要评论的内容");
      return;
    }
    const positions = orderedPositions(editor);
    if (/\n\s*\n/.test(editor.getRange(positions.from, positions.to))) {
      new Notice("一次只能评论一个 Markdown 区块，请缩小选区后重试");
      return;
    }
    const draft: CommentSelectionDraft = {
      sourcePath: file.path,
      selectedText,
      from: positions.from,
      to: positions.to,
    };
    const sidebar = await this.activateCommentSidebar();
    sidebar?.showDraft(draft);
  }

  async openCommentSidebarForRecord(record: ReferenceRecord): Promise<void> {
    const sidebar = await this.activateCommentSidebar();
    sidebar?.showRecord(record);
  }

  async openCommentSidebarForDocument(sourcePath: string): Promise<void> {
    const sidebar = await this.activateCommentSidebar();
    sidebar?.showDocument(sourcePath);
  }

  private async activateCommentSidebar(): Promise<CommentsSidebarView | null> {
    const existing = this.app.workspace.getLeavesOfType(COMMENTS_VIEW_TYPE)[0];
    const leaf = existing ?? this.app.workspace.getRightLeaf(false);
    if (!leaf) {
      new Notice("无法打开评论侧边栏");
      return null;
    }
    if (!existing) await leaf.setViewState({ type: COMMENTS_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
    return leaf.view instanceof CommentsSidebarView ? leaf.view : null;
  }

  private refreshCommentSidebars(sourcePath?: string): void {
    for (const leaf of this.app.workspace.getLeavesOfType(COMMENTS_VIEW_TYPE)) {
      if (leaf.view instanceof CommentsSidebarView) leaf.view.refresh(sourcePath);
    }
  }

  refreshCommentFeatureUi(): void {
    this.hideSelectionCommentButton();
    const paths = new Set<string>();
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      if (leaf.view instanceof MarkdownView && leaf.view.file) paths.add(leaf.view.file.path);
    }
    for (const path of paths) this.refreshCommentUi(path);
    if (!this.settings.enableComments) {
      for (const leaf of this.app.workspace.getLeavesOfType(COMMENTS_VIEW_TYPE)) leaf.detach();
    }
  }

  private refreshCommentUi(sourcePath: string): void {
    this.refreshCommentSidebars(sourcePath);
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      if (!(leaf.view instanceof MarkdownView) || leaf.view.file?.path !== sourcePath) continue;
      const codeMirror = (leaf.view.editor as Editor & {
        cm?: Parameters<typeof refreshCommentEditorDecorations>[0];
      }).cm;
      if (codeMirror) refreshCommentEditorDecorations(codeMirror);

      for (const annotation of Array.from(
        leaf.view.containerEl.querySelectorAll<HTMLElement>(
          ".markdown-preview-view .knowgrove-commented-text[data-comment-id]",
        ),
      )) {
        const parent = annotation.parentNode;
        annotation.replaceWith(...Array.from(annotation.childNodes));
        parent?.normalize();
      }
      leaf.view.containerEl.querySelectorAll(".knowgrove-reading-pin").forEach((pin) => pin.remove());
      leaf.view.containerEl.querySelectorAll(".knowgrove-annotated-block")
        .forEach((block) => block.removeClass("knowgrove-annotated-block"));
      this.decorateReadingView(leaf.view.containerEl, sourcePath);
    }
  }

  showCommentTooltip(anchor: HTMLElement, blockId: string): void {
    window.clearTimeout(this.tooltipHideTimer);
    this.hideCommentTooltip();
    const records = this.getReferencesForBlock(blockId);
    if (!records.length) return;

    const ownerDocument = anchor.ownerDocument;
    const ownerWindow = ownerDocument.defaultView ?? window;
    const tooltip = ownerDocument.body.createDiv("knowgrove-tooltip");
    this.tooltipEl = tooltip;
    tooltip.setAttribute("role", "tooltip");
    const heading = tooltip.createDiv("knowgrove-tooltip-heading");
    const icon = heading.createSpan();
    setIcon(icon, "message-circle");
    heading.createSpan({ text: records.length > 1 ? `${records.length} 条评论` : "评论" });

    for (const record of records.slice(0, 3)) {
      const item = tooltip.createDiv("knowgrove-tooltip-item");
      item.createDiv({ cls: "knowgrove-tooltip-comment", text: record.comment });
      item.createDiv({
        cls: "knowgrove-tooltip-target",
        text: record.targetPath ? `已引用到 ${record.targetPath}` : "仅在原文标记",
      });
    }
    if (records.length > 3) tooltip.createDiv({ cls: "knowgrove-tooltip-more", text: `另有 ${records.length - 3} 条…` });
    tooltip.createDiv({ cls: "knowgrove-tooltip-action", text: "点击气泡可编辑" });
    tooltip.addEventListener("mouseenter", () => window.clearTimeout(this.tooltipHideTimer));
    tooltip.addEventListener("mouseleave", () => this.hideCommentTooltipSoon());

    const rect = anchor.getBoundingClientRect();
    ownerWindow.requestAnimationFrame(() => {
      if (!this.tooltipEl) return;
      const tooltipRect = tooltip.getBoundingClientRect();
      const left = Math.min(ownerWindow.innerWidth - tooltipRect.width - 12, Math.max(12, rect.left - 8));
      const preferredTop = rect.top - tooltipRect.height - 10;
      const top = preferredTop > 8 ? preferredTop : Math.min(ownerWindow.innerHeight - tooltipRect.height - 8, rect.bottom + 10);
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    });
  }

  hideCommentTooltipSoon(): void {
    window.clearTimeout(this.tooltipHideTimer);
    this.tooltipHideTimer = window.setTimeout(() => this.hideCommentTooltip(), 180);
  }

  hideCommentTooltip(): void {
    window.clearTimeout(this.tooltipHideTimer);
    this.tooltipEl?.remove();
    this.tooltipEl = undefined;
  }

  async updateReferenceComment(id: string, comment: string): Promise<void> {
    const record = this.data.references[id];
    if (!record) {
      new Notice("这条引用记录已不存在");
      return;
    }
    record.comment = comment;
    record.updatedAt = new Date().toISOString();
    await this.savePluginData();
    const synced = await this.syncManagedReference(record);
    this.refreshCommentUi(record.sourcePath);
    new Notice(synced || !record.targetPath ? "评论已更新" : "评论已保存，但目标引用区块未找到");
  }

  async attachReferenceTarget(id: string, targetFile: TFile, targetHeading?: string): Promise<boolean> {
    const record = this.data.references[id];
    if (!record) {
      new Notice("这条评论已不存在");
      return false;
    }
    if (targetFile.path === record.sourcePath) {
      new Notice("目标文档需要与原文不同");
      return false;
    }
    if (record.targetPath) {
      new Notice("这条评论已经添加到目标文档");
      return false;
    }
    try {
      await this.app.vault.process(targetFile, (content) => insertManagedReference(
        content,
        renderManagedReference(record),
        targetHeading,
      ));
      record.targetPath = targetFile.path;
      record.targetHeading = targetHeading;
      record.updatedAt = new Date().toISOString();
      await this.savePluginData();
      this.refreshCommentUi(record.sourcePath);
      new Notice(`已添加到《${targetFile.basename}》`);
      return true;
    } catch (error) {
      console.error("KnowGrove: failed to attach reference target", error);
      new Notice("添加到目标文档失败，请查看开发者控制台");
      return false;
    }
  }

  async deleteReference(id: string): Promise<boolean> {
    const record = this.data.references[id];
    if (!record) return true;
    try {
      if (record.targetPath) {
        const target = this.app.vault.getAbstractFileByPath(record.targetPath);
        if (target instanceof TFile) {
          await this.app.vault.process(target, (content) => removeManagedReference(content, id) ?? content);
        }
      }
      delete this.data.references[id];
      await this.savePluginData();
      this.refreshCommentUi(record.sourcePath);
      new Notice("评论已删除");
      return true;
    } catch (error) {
      console.error("KnowGrove: failed to delete reference", error);
      new Notice("删除评论失败，请查看开发者控制台");
      return false;
    }
  }

  async openReferenceSource(record: ReferenceRecord): Promise<void> {
    const abstract = this.app.vault.getAbstractFileByPath(record.sourcePath);
    if (!(abstract instanceof TFile)) {
      new Notice("原文已不存在或被移动");
      return;
    }
    const leaf = this.app.workspace.getLeavesOfType("markdown")
      .find((candidate) => candidate.view instanceof MarkdownView && candidate.view.file?.path === record.sourcePath)
      ?? this.app.workspace.getLeaf("tab");
    await leaf.openFile(abstract);
    await this.app.workspace.revealLeaf(leaf);
    const view = leaf.view;
    if (!(view instanceof MarkdownView)) return;
    const content = view.editor.getValue();
    if (view.getMode() === "preview") {
      window.requestAnimationFrame(() => {
        const escaped = CSS.escape(record.sourceBlockId);
        const block = view.containerEl.querySelector<HTMLElement>(`[data-block-id="${escaped}"], #${escaped}`);
        const annotation = view.containerEl.querySelector<HTMLElement>(
          `.knowgrove-commented-text[data-comment-id="${CSS.escape(record.id)}"]`,
        );
        const target = annotation ?? block;
        if (!target) return;
        target.scrollIntoView({ block: "center", behavior: "smooth" });
        target.addClass("knowgrove-source-focus");
        window.setTimeout(() => target.removeClass("knowgrove-source-focus"), 1200);
      });
      return;
    }
    const match = locateReferenceSelection(content, record);
    if (match && match !== "ambiguous") {
      const from = view.editor.offsetToPos(match.start);
      const to = view.editor.offsetToPos(match.end);
      view.editor.setSelection(from, to);
      view.editor.scrollIntoView({ from, to }, true);
      return;
    }
    const offset = content.indexOf(`^${record.sourceBlockId}`);
    if (offset >= 0) {
      const position = view.editor.offsetToPos(offset);
      view.editor.setCursor(position);
      view.editor.scrollIntoView({ from: position, to: position }, true);
    }
  }

  async openReferenceTarget(record: ReferenceRecord): Promise<void> {
    if (!record.targetPath) return;
    const target = this.app.vault.getAbstractFileByPath(record.targetPath);
    if (!(target instanceof TFile)) {
      new Notice("目标文档已不存在或被移动");
      return;
    }
    const leaf = this.app.workspace.getLeavesOfType("markdown")
      .find((candidate) => candidate.view instanceof MarkdownView && candidate.view.file?.path === record.targetPath)
      ?? this.app.workspace.getLeaf("tab");
    await leaf.openFile(target);
    await this.app.workspace.revealLeaf(leaf);
    if (!(leaf.view instanceof MarkdownView)) return;
    const content = leaf.view.editor.getValue();
    const currentOffset = content.indexOf(`knowgrove-ref:${record.id}:start`);
    const offset = currentOffset >= 0
      ? currentOffset
      : content.indexOf(`${LEGACY_REFERENCE_PREFIX}:${record.id}:start`);
    if (offset < 0) return;
    const position = leaf.view.editor.offsetToPos(offset);
    leaf.view.editor.setCursor(position);
    leaf.view.editor.scrollIntoView({ from: position, to: position }, true);
  }

  private withActiveTrackedFile(checking: boolean, action: (file: TFile) => Promise<void>): boolean {
    const file = this.app.workspace.getActiveFile();
    if (!file || !this.isTrackedFile(file)) return false;
    if (!checking) void action(file);
    return true;
  }

  private getActiveReadingContext(): { view: MarkdownView; file: TFile; scroller: HTMLElement; mode: "source" | "preview" } | null {
    if (!this.settings.autoMarkFinishedAtEnd) return null;
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const file = view?.file;
    if (!view || !file || !this.isTrackedFile(file)) return null;
    if (this.classifyStatus(file) !== "reading") return null;
    const mode = view.getMode();
    const selector = mode === "preview" ? ".markdown-preview-view" : ".cm-scroller";
    const scroller = view.containerEl.querySelector<HTMLElement>(selector);
    return scroller ? { view, file, scroller, mode } : null;
  }

  private handleReadingScroll(event: Event): void {
    this.updateSelectionCommentButton();
    this.syncVisibleCommentWithSidebar(event);
    const context = this.getActiveReadingContext();
    const target = event.target;
    if (!context || !(target instanceof Node) || !context.view.containerEl.contains(target)) return;
    this.evaluateAutoCompletion(context);
  }

  private syncVisibleCommentWithSidebar(event: Event): void {
    const target = event.target;
    if (!(target instanceof Node)) return;
    const markdownLeaf = this.app.workspace.getLeavesOfType("markdown")
      .find((leaf) => leaf.view instanceof MarkdownView && leaf.view.containerEl.contains(target));
    if (!markdownLeaf || !(markdownLeaf.view instanceof MarkdownView) || !markdownLeaf.view.file) return;
    const annotations = Array.from(markdownLeaf.view.containerEl.querySelectorAll<HTMLElement>(
      ".knowgrove-commented-text",
    ));
    if (!annotations.length) return;
    const scroller = target.instanceOf(HTMLElement)
      ? target.closest<HTMLElement>(".cm-scroller, .markdown-preview-view")
      : null;
    if (!scroller) return;
    const scrollerRect = scroller.getBoundingClientRect();
    const guide = scrollerRect.top + Math.min(100, scrollerRect.height * 0.25);
    const visible = annotations
      .map((annotation) => ({ annotation, rect: annotation.getBoundingClientRect() }))
      .filter(({ rect }) => rect.bottom >= scrollerRect.top && rect.top <= scrollerRect.bottom)
      .sort((a, b) => Math.abs(a.rect.top - guide) - Math.abs(b.rect.top - guide))[0];
    if (!visible) return;
    const recordId = visible.annotation.dataset.commentId
      ?? visible.annotation.dataset.commentIds?.split(",")[0];
    if (!recordId) return;
    for (const leaf of this.app.workspace.getLeavesOfType(COMMENTS_VIEW_TYPE)) {
      if (leaf.view instanceof CommentsSidebarView) leaf.view.focusRecord(markdownLeaf.view.file.path, recordId);
    }
  }

  private handleReadingInteraction(event: Event): void {
    const context = this.getActiveReadingContext();
    const target = event.target;
    if (!context || !(target instanceof Node) || !context.view.containerEl.contains(target)) return;
    // Pointer events run before a possible resulting scroll. The scroll handler performs
    // the final check; this also handles short notes that do not need scrolling.
    window.requestAnimationFrame(() => {
      const latest = this.getActiveReadingContext();
      if (!latest || latest.file.path !== context.file.path) return;
      this.evaluateAutoCompletion(latest);
    });
  }

  private isContextAtReadingEnd(context: { view: MarkdownView; scroller: HTMLElement; mode: "source" | "preview" }): boolean {
    if (context.mode === "source") {
      const codeMirror = (context.view.editor as Editor & {
        cm?: {
          state?: { doc?: { length?: number } };
          visibleRanges?: readonly { to: number }[];
          viewport?: { to: number };
        };
      }).cm;
      const documentLength = codeMirror?.state?.doc?.length;
      const visibleRanges = codeMirror?.visibleRanges ?? (codeMirror?.viewport ? [codeMirror.viewport] : []);
      if (typeof documentLength === "number" && isDocumentEndVisible(documentLength, visibleRanges)) return true;
    }
    return isAtReadingEnd(context.scroller);
  }

  private evaluateAutoCompletion(context: { view: MarkdownView; file: TFile; scroller: HTMLElement; mode: "source" | "preview" }): void {
    if (context.mode === "source" && hasRecentEditorActivity(this.lastEditorChangeAt.get(context.file.path))) {
      this.resetAutoCompletionTracking();
      return;
    }
    if (!this.isContextAtReadingEnd(context)) {
      this.resetAutoCompletionTracking();
      return;
    }

    window.clearTimeout(this.autoCompletionTimer);
    this.completionCandidate = { path: context.file.path, mode: context.mode };
    this.autoCompletionTimer = window.setTimeout(() => {
      void this.completeCandidateAtReadingEnd();
    }, finishDelayMilliseconds(this.settings.finishDwellSeconds));
  }

  private async completeCandidateAtReadingEnd(): Promise<void> {
    const candidate = this.completionCandidate;
    this.autoCompletionTimer = undefined;
    if (!candidate) return;
    if (candidate.mode === "source" && hasRecentEditorActivity(this.lastEditorChangeAt.get(candidate.path))) return;

    const context = this.getActiveReadingContext();
    if (!context || context.file.path !== candidate.path || context.mode !== candidate.mode || !this.isContextAtReadingEnd(context)) return;

    this.completionCandidate = undefined;
    try {
      await this.setReadingStatus(context.file, this.settings.finishedStatus, true);
    } catch (error) {
      console.error(`KnowGrove: failed to auto-finish ${context.file.path}`, error);
      new Notice("自动更新阅读状态失败，请查看开发者控制台");
    }
  }

  private trackNewNoteInitialization(file: TFile): void {
    if (!shouldInitializeTrackedNote(
      file.path,
      file.extension,
      this.settings.trackedFolder,
      this.settings.autoMarkNewNotes,
    )) return;
    this.updatePropertyCapture({
      path: file.path,
      basename: file.basename,
      state: "processing",
      message: "已捕获新文档，正在补齐缺失的基础属性…",
      updatedAt: new Date().toISOString(),
    });
    const existing = this.pendingNewNoteInitializations.get(file.path);
    const state: PendingNewNoteInitialization = existing ?? {
      initializing: false,
      ignoreModifyUntil: 0,
    };
    this.pendingNewNoteInitializations.set(file.path, state);
    window.clearTimeout(state.cleanupTimer);
    state.cleanupTimer = window.setTimeout(() => {
      const current = this.pendingNewNoteInitializations.get(file.path);
      if (!current) return;
      if (current.timer !== undefined || current.initializing) {
        current.cleanupTimer = window.setTimeout(
          () => this.clearPendingNewNoteInitialization(file.path),
          NEW_NOTE_SETTLE_MILLISECONDS + 100,
        );
        return;
      }
      this.clearPendingNewNoteInitialization(file.path);
    }, NEW_NOTE_IMPORT_WINDOW_MILLISECONDS);
    this.schedulePendingNewNoteInitialization(file.path);
  }

  private schedulePendingNewNoteInitialization(path: string): void {
    const state = this.pendingNewNoteInitializations.get(path);
    if (!state) return;
    window.clearTimeout(state.timer);
    state.timer = window.setTimeout(() => void this.runPendingNewNoteInitialization(path), NEW_NOTE_SETTLE_MILLISECONDS);
  }

  private handlePendingNewNoteModify(file: TFile): void {
    const state = this.pendingNewNoteInitializations.get(file.path);
    if (!state || state.initializing || Date.now() < state.ignoreModifyUntil) return;
    this.schedulePendingNewNoteInitialization(file.path);
  }

  private transferPendingNewNoteInitialization(oldPath: string, file: TFile): void {
    const state = this.pendingNewNoteInitializations.get(oldPath);
    if (!state) return;
    window.clearTimeout(state.timer);
    window.clearTimeout(state.cleanupTimer);
    this.pendingNewNoteInitializations.delete(oldPath);
    this.pendingNewNoteInitializations.set(file.path, state);
    state.cleanupTimer = window.setTimeout(
      () => this.clearPendingNewNoteInitialization(file.path),
      NEW_NOTE_IMPORT_WINDOW_MILLISECONDS,
    );
    this.schedulePendingNewNoteInitialization(file.path);
  }

  private clearPendingNewNoteInitialization(path: string): void {
    const state = this.pendingNewNoteInitializations.get(path);
    if (!state) return;
    window.clearTimeout(state.timer);
    window.clearTimeout(state.cleanupTimer);
    this.pendingNewNoteInitializations.delete(path);
  }

  private async runPendingNewNoteInitialization(path: string): Promise<void> {
    const state = this.pendingNewNoteInitializations.get(path);
    if (!state || state.initializing) return;
    state.timer = undefined;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return;
    state.initializing = true;
    try {
      await this.ensureNewNoteStatus(file);
      state.ignoreModifyUntil = Date.now() + 200;
    } finally {
      state.initializing = false;
    }
  }

  private async ensureNewNoteStatus(file: TFile, options: { skipAI?: boolean } = {}): Promise<void> {
    if (!shouldInitializeTrackedNote(
      file.path,
      file.extension,
      this.settings.trackedFolder,
      this.settings.autoMarkNewNotes,
    )) return;
    try {
      let initializedFrontmatter: Record<string, unknown> | undefined;
      const aiSettings = this.settings.aiProperties;
      const deferredProperties = aiSettings.enabled && aiSettings.autoEnrichNewNotes
        ? new Set(aiManagedDimensions(this.settings.propertySystem.dimensions).map((dimension) => dimension.name))
        : new Set<string>();
      await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
        initializeTrackedNoteFrontmatter(
          frontmatter,
          file.basename,
          this.settings.propertySystem,
          this.settings.statusProperty,
          this.settings.readingStatus,
          localDateFromTimestamp(file.stat.ctime),
          deferredProperties,
        );
        initializedFrontmatter = JSON.parse(JSON.stringify(frontmatter)) as Record<string, unknown>;
      });
      this.refreshReadingViews();
      let aiError: string | undefined;
      if (deferredProperties.size) {
        this.updatePropertyCapture({
          path: file.path,
          basename: file.basename,
          state: "processing",
          message: options.skipAI
            ? "录音已保存，正在后台生成语义属性并整理内容…"
            : `基础属性已完成，正在使用 ${this.getAIProviderSummary()} 生成 ${Array.from(deferredProperties).join("、")}…`,
          updatedAt: new Date().toISOString(),
        });
        if (options.skipAI) return;
        try {
          const result = await this.enrichFileWithAI(file, false);
          initializedFrontmatter = result.frontmatter;
        } catch (error) {
          aiError = error instanceof Error ? error.message : String(error);
          console.error(`KnowGrove: AI property enrichment failed for ${file.path}`, error);
        }
      }
      const audit = auditPropertySnapshots([{
        path: file.path,
        basename: file.basename,
        frontmatter: initializedFrontmatter,
      }], this.settings.propertySystem);
      const needsReview = audit.nonCompliantFiles > 0 || Boolean(aiError);
      this.updatePropertyCapture({
        path: file.path,
        basename: file.basename,
        state: needsReview ? "needs-review" : "complete",
        message: aiError
          ? `基础属性已保存；AI 处理失败：${aiError}`
          : needsReview
            ? "AI 已完成处理，仍有属性未通过当前规则。"
            : "基础属性和 AI 语义属性已完成，已进入“输入队列”。",
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error(`KnowGrove: failed to initialize ${file.path}`, error);
      this.updatePropertyCapture({
        path: file.path,
        basename: file.basename,
        state: "failed",
        message: "属性规范失败，请点击“立即检查规范”重试。",
        updatedAt: new Date().toISOString(),
      });
    }
  }

  private addStatusMenuItems(menu: Menu, file: TFile): void {
    menu.addSeparator();
    menu.addItem((item) => item
      .setTitle(`标为${this.settings.readingStatus}`)
      .setIcon("book-open")
      .setChecked(this.classifyStatus(file) === "reading")
      .onClick(() => void this.setReadingStatus(file, this.settings.readingStatus)));
    menu.addItem((item) => item
      .setTitle(`标为${this.settings.finishedStatus}`)
      .setIcon("circle-check-big")
      .setChecked(this.classifyStatus(file) === "finished")
      .onClick(() => void this.setReadingStatus(file, this.settings.finishedStatus)));
  }

  async createCommentFromDraft(draft: CommentSelectionDraft, comment: string): Promise<ReferenceRecord | null> {
    if (!this.settings.enableComments) {
      new Notice("评论功能已关闭");
      return null;
    }
    const file = this.app.vault.getAbstractFileByPath(draft.sourcePath);
    const leaf = this.app.workspace.getLeavesOfType("markdown")
      .find((candidate) => candidate.view instanceof MarkdownView && candidate.view.file?.path === draft.sourcePath);
    if (!(file instanceof TFile) || !leaf || !(leaf.view instanceof MarkdownView)) {
      new Notice("原文已关闭或不存在，请重新选择文字");
      return null;
    }
    const current = leaf.view.editor.getRange(draft.from, draft.to).trim();
    if (current !== draft.selectedText) {
      new Notice("原文在评论前发生了变化，请重新选择文字");
      return null;
    }
    try {
      return await this.createReference(
        leaf.view.editor,
        leaf.view,
        file,
        { from: draft.from, to: draft.to },
        draft.selectedText,
        { comment },
      );
    } catch (error) {
      console.error("KnowGrove: failed to create sidebar comment", error);
      new Notice("评论保存失败，请查看开发者控制台");
      return null;
    }
  }

  private async createReference(
    editor: Editor,
    sourceView: MarkdownView,
    sourceFile: TFile,
    positions: { from: EditorPosition; to: EditorPosition },
    selectedText: string,
    draft: ReferenceDraft,
  ): Promise<ReferenceRecord> {
    const sourceContent = editor.getValue();
    const rawSelection = editor.getRange(positions.from, positions.to);
    const leadingWhitespace = rawSelection.length - rawSelection.trimStart().length;
    const trailingWhitespace = rawSelection.length - rawSelection.trimEnd().length;
    const rawStart = editor.posToOffset(positions.from);
    const rawEnd = editor.posToOffset(positions.to);
    const sourceMatch = {
      start: rawStart + leadingWhitespace,
      end: rawEnd - trailingWhitespace,
    };
    const sourceContext = captureReferenceSourceContext(sourceContent, sourceMatch);
    const sourceBlockId = this.ensureBlockAnchor(editor, positions);
    await sourceView.save();

    let anchorPersisted = false;
    await this.app.vault.process(sourceFile, (content) => {
      const result = repairReferenceAnchor(content, {
        sourceBlockId,
        selectedText,
        sourceContextBefore: sourceContext.before,
        sourceContextAfter: sourceContext.after,
      });
      anchorPersisted = result.status === "present" || result.status === "repaired";
      return result.content;
    });
    if (!anchorPersisted) throw new Error("The source block anchor could not be persisted safely.");

    const now = new Date().toISOString();
    const record: ReferenceRecord = {
      id: makeId("ref"),
      sourcePath: sourceFile.path,
      sourceBlockId,
      selectedText,
      sourceContextBefore: sourceContext.before,
      sourceContextAfter: sourceContext.after,
      comment: draft.comment,
      targetPath: draft.targetFile?.path,
      targetHeading: draft.targetHeading,
      createdAt: now,
      updatedAt: now,
    };
    this.data.references[record.id] = record;
    await this.savePluginData();

    if (draft.targetFile) {
      try {
        await this.app.vault.process(draft.targetFile, (content) => insertManagedReference(
          content,
          renderManagedReference(record),
          draft.targetHeading,
        ));
      } catch (error) {
        record.targetPath = undefined;
        record.targetHeading = undefined;
        await this.savePluginData();
        throw error;
      }
    }
    this.refreshCommentUi(sourceFile.path);
    new Notice(draft.targetFile ? `评论已保存，并引用到《${draft.targetFile.basename}》` : "评论已保存");
    return record;
  }

  private ensureBlockAnchor(editor: Editor, positions: { from: EditorPosition; to: EditorPosition }): string {
    const firstLine = Math.min(positions.from.line, positions.to.line);
    const lastLine = Math.max(positions.from.line, positions.to.line);
    const surrounding = Array.from({ length: lastLine - firstLine + 1 }, (_, index) => editor.getLine(firstLine + index)).join("\n");
    const lastLineText = editor.getLine(lastLine);
    const followingLine = lastLine + 1 < editor.lineCount() ? editor.getLine(lastLine + 1) : "";
    const existing = /\^([a-zA-Z0-9-]+)\s*$/.exec(surrounding)?.[1]
      ?? /(?:^|\s)\^([a-zA-Z0-9-]+)\s*$/.exec(lastLineText)?.[1]
      ?? /^\s*\^([a-zA-Z0-9-]+)\s*$/.exec(followingLine)?.[1];
    if (existing) return existing;

    const blockId = makeId("kg");
    const firstLineText = editor.getLine(firstLine).trimStart();
    const complexBlock = firstLine !== lastLine
      || /^(?:[-*+]\s|\d+[.)]\s|>|```|~~~)/.test(firstLineText);
    if (complexBlock) {
      editor.replaceRange(`\n^${blockId}`, { line: lastLine, ch: lastLineText.length });
    } else {
      editor.replaceRange(` ^${blockId}`, { line: lastLine, ch: lastLineText.length });
    }
    return blockId;
  }

  private scheduleReferenceRepair(file: TFile): void {
    if (file.extension !== "md") return;
    if (!Object.values(this.data.references).some((record) => record.sourcePath === file.path)) return;
    this.pendingReferenceRepairPaths.add(file.path);
    window.clearTimeout(this.referenceRepairTimer);
    this.referenceRepairTimer = window.setTimeout(() => {
      this.referenceRepairTimer = undefined;
      void this.repairPendingReferenceAnchors();
    }, 350);
  }

  private async repairPendingReferenceAnchors(): Promise<void> {
    const paths = [...this.pendingReferenceRepairPaths];
    this.pendingReferenceRepairPaths.clear();
    const summary = emptyRepairSummary();
    for (const path of paths) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) {
        summary.missingSource += Object.values(this.data.references).filter((record) => record.sourcePath === path).length;
        continue;
      }
      mergeRepairSummary(summary, await this.repairReferenceAnchorsForFile(file));
    }
    if (summary.repaired > 0) {
      new Notice(`已自动修复 ${summary.repaired} 条断开的评论引用`);
    }
    if (summary.unresolved > 0) {
      console.warn(`KnowGrove: ${summary.unresolved} reference anchor(s) require manual review.`);
    }
  }

  private async repairAllReferenceAnchors(showNotice: boolean): Promise<ReferenceRepairSummary> {
    const summary = emptyRepairSummary();
    const paths = new Set(Object.values(this.data.references).map((record) => record.sourcePath));
    for (const path of paths) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) {
        summary.missingSource += Object.values(this.data.references).filter((record) => record.sourcePath === path).length;
        continue;
      }
      mergeRepairSummary(summary, await this.repairReferenceAnchorsForFile(file));
    }

    if (showNotice) {
      const unresolved = summary.unresolved + summary.missingSource;
      new Notice(
        `引用检查完成：${summary.checked} 条，修复 ${summary.repaired} 条，正常 ${summary.healthy} 条${unresolved ? `，${unresolved} 条需手动处理` : ""}`,
      );
    } else if (summary.repaired > 0) {
      new Notice(`KnowGrove 已自动修复 ${summary.repaired} 条断开的评论引用`);
    }
    return summary;
  }

  private async repairReferenceAnchorsForFile(file: TFile): Promise<ReferenceRepairSummary> {
    const summary = emptyRepairSummary();
    if (this.repairingSourcePaths.has(file.path)) return summary;
    const records = Object.values(this.data.references).filter((record) => record.sourcePath === file.path);
    if (!records.length) return summary;

    this.repairingSourcePaths.add(file.path);
    let dataChanged = false;
    try {
      await this.app.vault.process(file, (content) => {
        let nextContent = content;
        for (const record of records) {
          summary.checked += 1;
          const result = repairReferenceAnchor(nextContent, record);
          const contentBeforeRepair = nextContent;
          if (result.status === "present") summary.healthy += 1;
          else if (result.status === "repaired") {
            summary.repaired += 1;
            if (result.match?.strategy === "context") summary.recoveredFromContext += 1;
          } else {
            summary.unresolved += 1;
          }

          const match = result.match ?? locateReferenceSelection(contentBeforeRepair, record);
          if (match && match !== "ambiguous") {
            const sourceContext = captureReferenceSourceContext(contentBeforeRepair, match, record.sourceBlockId);
            const currentSelectedText = contentBeforeRepair.slice(match.start, match.end).trim();
            if (match.strategy === "context" && currentSelectedText && record.selectedText !== currentSelectedText) {
              record.selectedText = currentSelectedText;
              dataChanged = true;
            }
            if (record.sourceContextBefore !== sourceContext.before || record.sourceContextAfter !== sourceContext.after) {
              record.sourceContextBefore = sourceContext.before;
              record.sourceContextAfter = sourceContext.after;
              dataChanged = true;
            }
          }
          nextContent = result.content;
        }
        return nextContent;
      });
      if (dataChanged) await this.savePluginData();
    } catch (error) {
      console.error(`KnowGrove: failed to repair references in ${file.path}`, error);
      summary.unresolved += Math.max(1, records.length - summary.checked);
    } finally {
      this.repairingSourcePaths.delete(file.path);
    }
    return summary;
  }

  private findReferenceAtCursor(editor: Editor, file: TFile): ReferenceRecord | null {
    const content = editor.getValue();
    const offset = editor.posToOffset(editor.getCursor());
    const managedId = findManagedReferenceIdNearOffset(content, offset);
    if (managedId && this.data.references[managedId]) return this.data.references[managedId] ?? null;

    const cursor = editor.getCursor();
    const fromLine = Math.max(0, cursor.line - 8);
    const toLine = Math.min(editor.lineCount() - 1, cursor.line + 3);
    const nearby = editor.getRange(
      { line: fromLine, ch: 0 },
      { line: toLine, ch: editor.getLine(toLine).length },
    );
    return Object.values(this.data.references).find((record) =>
      record.sourcePath === file.path && nearby.includes(`^${record.sourceBlockId}`)) ?? null;
  }

  private async syncManagedReference(record: ReferenceRecord): Promise<boolean> {
    if (!record.targetPath) return false;
    const abstract = this.app.vault.getAbstractFileByPath(record.targetPath);
    if (!(abstract instanceof TFile)) return false;
    let found = false;
    await this.app.vault.process(abstract, (content) => {
      const replaced = replaceManagedReference(content, record);
      if (replaced === null) return content;
      found = true;
      return replaced;
    });
    return found;
  }

  private async handleRename(file: TAbstractFile, oldPath: string): Promise<void> {
    if (!(file instanceof TFile) || file.extension !== "md") {
      this.refreshReadingViews();
      return;
    }
    this.transferPendingNewNoteInitialization(oldPath, file);
    const sourceChanged: ReferenceRecord[] = [];
    let changed = false;
    for (const record of Object.values(this.data.references)) {
      if (record.sourcePath === oldPath) {
        record.sourcePath = file.path;
        record.updatedAt = new Date().toISOString();
        sourceChanged.push(record);
        changed = true;
      }
      if (record.targetPath === oldPath) {
        record.targetPath = file.path;
        record.updatedAt = new Date().toISOString();
        changed = true;
      }
    }
    if (changed) {
      await this.savePluginData();
      for (const record of sourceChanged) await this.syncManagedReference(record);
    }
    if (isPropertyGovernedPath(file.path, this.settings.propertySystem)) {
      await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
        if (frontmatter.文件名 !== file.basename) frontmatter.文件名 = file.basename;
      });
    }
    this.refreshReadingViews();
  }

  private async handleDelete(file: TAbstractFile): Promise<void> {
    if (!(file instanceof TFile)) return;
    this.lastEditorChangeAt.delete(file.path);
    let changed = false;
    for (const record of Object.values(this.data.references)) {
      if (record.targetPath === file.path) {
        record.targetPath = undefined;
        record.targetHeading = undefined;
        record.updatedAt = new Date().toISOString();
        changed = true;
      }
    }
    if (changed) await this.savePluginData();
  }

  private decorateReadingView(container: HTMLElement, sourcePath: string): void {
    if (!this.settings.enableComments) return;
    const records = Object.values(this.data.references).filter((record) => record.sourcePath === sourcePath);
    const grouped = new Map<string, ReferenceRecord[]>();
    for (const record of records) grouped.set(record.sourceBlockId, [...(grouped.get(record.sourceBlockId) ?? []), record]);

    for (const [blockId, blockRecords] of grouped) {
      const escaped = CSS.escape(blockId);
      const block = container.querySelector<HTMLElement>(`[data-block-id="${escaped}"], #${escaped}`);
      if (!block) continue;
      block.addClass("knowgrove-annotated-block");
      for (const record of blockRecords) this.annotateRenderedSelection(block, record);
      if (block.querySelector(":scope > .knowgrove-reading-pin")) continue;
      const button = block.createEl("button", {
        cls: "knowgrove-reading-pin",
        attr: { "aria-label": `查看 ${blockRecords.length} 条评论` },
      });
      setIcon(button, "message-circle");
      button.createSpan({ cls: "knowgrove-editor-pin-count", text: blockRecords.length.toString() });
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void this.openCommentsForBlock(blockId);
      });
    }
  }

  private annotateRenderedSelection(block: HTMLElement, record: ReferenceRecord): void {
    if (block.querySelector(`[data-comment-id="${CSS.escape(record.id)}"]`)) return;
    const ownerDocument = block.ownerDocument;
    const walker = ownerDocument.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => node.parentElement?.closest(
        ".knowgrove-reading-pin, .knowgrove-editor-pin",
      ) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    const nodes: Text[] = [];
    let current = walker.nextNode();
    while (current) {
      if (current.instanceOf(Text) && current.data) nodes.push(current);
      current = walker.nextNode();
    }
    const renderedText = nodes.map((node) => node.data).join("");
    const rendered = this.normalizeRenderedText(renderedText);
    const candidates = [
      record.selectedText,
      record.selectedText
        .replace(/!?(?:\[\[)(?:[^\]|]+\|)?([^\]]+)\]\]/g, "$1")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/^\s*(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/gm, "")
        .replace(/(?:^|\s)\^[a-zA-Z0-9-]+\s*$/gm, "")
        .replace(/[*_~`=]+/g, ""),
    ];
    let normalizedStart = -1;
    let normalizedLength = 0;
    for (const candidate of candidates) {
      const needle = this.normalizeRenderedText(candidate).text;
      if (!needle) continue;
      normalizedStart = rendered.text.indexOf(needle);
      if (normalizedStart >= 0) {
        normalizedLength = needle.length;
        break;
      }
    }
    if (normalizedStart < 0 || !normalizedLength) return;
    const rawStart = rendered.boundaries[normalizedStart];
    const lastBoundary = rendered.boundaries[normalizedStart + normalizedLength - 1];
    if (rawStart === undefined || lastBoundary === undefined) return;
    const rawEnd = lastBoundary + 1;

    let offset = 0;
    for (const node of nodes) {
      const nodeStart = offset;
      const nodeEnd = nodeStart + node.data.length;
      offset = nodeEnd;
      const overlapStart = Math.max(rawStart, nodeStart);
      const overlapEnd = Math.min(rawEnd, nodeEnd);
      if (overlapStart >= overlapEnd) continue;
      const range = ownerDocument.createRange();
      range.setStart(node, overlapStart - nodeStart);
      range.setEnd(node, overlapEnd - nodeStart);
      const annotation = ownerDocument.body.createSpan();
      annotation.className = "knowgrove-commented-text";
      annotation.dataset.commentId = record.id;
      annotation.setAttribute("role", "button");
      annotation.setAttribute("tabindex", "0");
      annotation.setAttribute("aria-label", "打开这段文字的评论");
      annotation.addEventListener("click", () => void this.openCommentSidebarForRecord(record));
      annotation.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") void this.openCommentSidebarForRecord(record);
      });
      range.surroundContents(annotation);
    }
  }

  private normalizeRenderedText(value: string): { text: string; boundaries: number[] } {
    let text = "";
    const boundaries: number[] = [];
    let previousWasWhitespace = false;
    for (let index = 0; index < value.length; index += 1) {
      const character = value[index] ?? "";
      if (/\s/.test(character)) {
        if (previousWasWhitespace) continue;
        text += " ";
        boundaries.push(index);
        previousWasWhitespace = true;
      } else {
        text += character;
        boundaries.push(index);
        previousWasWhitespace = false;
      }
    }
    const start = text.length - text.trimStart().length;
    const end = text.trimEnd().length;
    return { text: text.slice(start, end), boundaries: boundaries.slice(start, end) };
  }
}
