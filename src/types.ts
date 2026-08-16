import type { KnowGroveRuntimeSettings } from "./runtime-core";

export type ReadingFilter = "unread" | "finished";
export type RecentFileMode = "opened" | "modified" | "created";
export type SharedAttachmentHandling = "skip" | "copy";
export type PropertyValueType = "text" | "single" | "multi" | "date" | "checkbox";
export type PropertyFillStrategy = "none" | "file-name" | "empty-list" | "fixed";
export type PropertyRuleOrigin = "system" | "user" | "inferred";
export type PropertyEnumMode = "open" | "closed";
export const AI_PROVIDER_IDS = [
  "codex-cli",
  "claude-cli",
  "antigravity-cli",
  "qoder-cli",
  "kimi-cli",
  "minimax-cli",
  "glm-cli",
  "codebuddy-cli",
  "anthropic-api",
  "openai-compatible",
] as const;

export type AIProviderId = typeof AI_PROVIDER_IDS[number];

export function normalizeAIProviderId(
  value: unknown,
  fallback: AIProviderId = "codex-cli",
): AIProviderId {
  if (value === "workbuddy-cli") return "codebuddy-cli";
  return typeof value === "string" && (AI_PROVIDER_IDS as readonly string[]).includes(value)
    ? value as AIProviderId
    : fallback;
}

export interface PropertyDimensionConfig {
  id: string;
  name: string;
  description: string;
  aliases: string[];
  valueType: PropertyValueType;
  required: boolean;
  requiredForTypes?: string[];
  origin?: PropertyRuleOrigin;
  aiManaged?: boolean;
  enumMode?: PropertyEnumMode;
  allowedValues: string[];
  fillStrategy: PropertyFillStrategy;
  defaultValue: string;
}

export interface AIPropertySettings {
  enabled: boolean;
  autoEnrichNewNotes: boolean;
  provider: AIProviderId;
  model: string;
  executablePath: string;
  endpoint: string;
  maxContentCharacters: number;
  timeoutSeconds: number;
}

export interface AIProviderAvailability {
  id: AIProviderId;
  name: string;
  available: boolean;
  installed?: boolean;
  configured?: boolean;
  version?: string;
  executablePath?: string;
  configuredModel?: string;
  models?: string[];
  supportsModelOverride?: boolean;
  detail: string;
}

export interface AIPropertyRunState {
  running: boolean;
  total: number;
  completed: number;
  failed: number;
  currentPath?: string;
  message: string;
}

export interface PropertyAIRepairPreview {
  properties: Record<string, unknown>;
  confidence?: number;
  reason?: string;
  expected: Record<string, unknown>;
}

export interface PropertyTaxonomyNode {
  name: string;
  children: string[];
}

export interface PropertyTaxonomyProposal {
  summary: string;
  domains: PropertyTaxonomyNode[];
  confidence?: number;
  generatedAt: string;
}

export interface PropertyTaxonomySettings {
  version: 1;
  strategy: "four-layer-pdca" | "four-layer-pdsa";
  source: "recommended" | "ai" | "custom";
  domains: PropertyTaxonomyNode[];
  adoptedAt?: string;
  proposal?: PropertyTaxonomyProposal;
}

export interface PropertySystemSettings {
  scopeFolder: string;
  excludedFolders: string[];
  basePath: string;
  dimensions: PropertyDimensionConfig[];
  initializeTrackedNotes: boolean;
  trackedNoteType: string;
  trackedNoteStatus: string;
  creationDateProperty: string;
  taxonomy: PropertyTaxonomySettings;
}

export interface CreationStudioSettings {
  outputFolder: string;
  imageGenerationEnabled: boolean;
  imageEndpoint: string;
  imageModel: string;
  imageSize: string;
  imageAssetFolder: string;
}

export interface SavedDomainSession {
  domain: string;
  cookies: BrowserCaptureSessionCookie[];
  userAgent?: string;
  referer?: string;
  updatedAt: number;
}

export interface BrowserCaptureSessionCookie {
  domain: string;
  path: string;
  name: string;
  value: string;
  secure?: boolean;
  httpOnly?: boolean;
  expirationDate?: number;
}

export interface BrowserCaptureSettings {
  enabled: boolean;
  port: number;
  inboxFolder: string;
  autoProcessLinkNotes: boolean;
  watchFolder: string;
  prefixArticleTitleWithDate: boolean;
  articleOutputFolder: string;
  videoOutputFolder: string;
  audioOutputFolder: string;
  articleAssetFolder: string;
  mediaFolder: string;
  /** @deprecated 原始语音现在始终保留；该字段仅用于兼容旧 data.json。 */
  keepAudioSource: boolean;
  articleProvider: AIProviderId;
  videoProvider: AIProviderId;
  audioProvider: AIProviderId;
  defuddlePath: string;
  videoDownloaderPath: string;
  ffmpegPath: string;
  whisperPath: string;
  whisperModel: string;
  accessToken: string;
  savedDomainSessions: Record<string, SavedDomainSession>;
  browserCookieSource: "auto" | "extension" | "chrome" | "edge" | "safari" | "firefox" | "disabled";
}

export interface DesktopCaptureSettings {
  /** 留空时沿用阅读列表/收集箱路径。 */
  linkFolder: string;
  /** 留空时使用“收集箱路径/录音”。 */
  recordingFolder: string;
  /** 是否启用 macOS Markdown 默认打开器。 */
  externalMarkdownOpenerEnabled: boolean;
  /** 导入验证成功后，是否把 Vault 外源文件移到系统废纸篓。 */
  externalMarkdownDeleteSourceAfterImport: boolean;
  /** 留空时沿用阅读列表/收集箱路径。 */
  externalMarkdownFolder: string;
}

export interface KnowGroveSettings {
  trackedFolder: string;
  statusProperty: string;
  readingStatus: string;
  finishedStatus: string;
  autoMarkNewNotes: boolean;
  autoMarkFinishedAtEnd: boolean;
  finishDwellSeconds: number;
  defaultTargetFolder: string;
  defaultTargetHeading: string;
  enableBlockDragReferences: boolean;
  enableComments: boolean;
  enableWordLikeEditing: boolean;
  cleanupBlankLinesWithPropertyCheck: boolean;
  enableAttachmentCleanup: boolean;
  attachmentCleanupExcludedFolders: string[];
  attachmentCleanupExtraExtensions: string[];
  moveAttachmentsWithNote: boolean;
  autoOrganizeAttachments: boolean;
  sharedAttachmentHandling: SharedAttachmentHandling;
  enableTopicIndex: boolean;
  enableDocumentAnchors: boolean;
  lastAttachmentCleanupScanAt: number;
  recentFileMode: RecentFileMode;
  recentFileLimit: number;
  runtime: KnowGroveRuntimeSettings;
  browserCapture: BrowserCaptureSettings;
  desktopCapture: DesktopCaptureSettings;
  aiProperties: AIPropertySettings;
  creationStudio: CreationStudioSettings;
  propertySystem: PropertySystemSettings;
}

export interface ReferenceRecord {
  id: string;
  sourcePath: string;
  sourceBlockId: string;
  selectedText: string;
  sourceContextBefore?: string;
  sourceContextAfter?: string;
  comment: string;
  targetPath?: string;
  targetHeading?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommentSelectionDraft {
  sourcePath: string;
  selectedText: string;
  from: { line: number; ch: number };
  to: { line: number; ch: number };
}

export interface KnowGroveData {
  schemaVersion: number;
  uiMigrationVersion: number;
  settings: KnowGroveSettings;
  references: Record<string, ReferenceRecord>;
  attachmentUsage: Record<string, AttachmentUsageRecord>;
}

export interface AttachmentUsageRecord {
  firstReferencedAt: number;
  lastReferencedAt: number;
  currentSourcePaths?: string[];
  currentContentSourcePaths?: string[];
  lastSourcePaths: string[];
  lastContentSourcePaths: string[];
}

export interface PropertyNoteSnapshot {
  path: string;
  basename: string;
  frontmatter?: Record<string, unknown>;
  mtime?: number;
}

export type PDSAStage = "P" | "D" | "S" | "A";

export interface KnowledgeThemeDocument {
  path: string;
  basename: string;
  type: string;
  status: string;
  domains: string[];
  topics: string[];
  stage: PDSAStage;
  modifiedAt: number;
}

export interface KnowledgeResearchTopicSummary {
  name: string;
  coreQuestion: string;
  parentThemeName: string;
  domains: string[];
  total: number;
  fixed: boolean;
  workspaceExists: boolean;
  workspacePath: string;
  basePath: string;
  explicitSourcePaths: string[];
  documents: KnowledgeThemeDocument[];
  candidateDocuments: KnowledgeThemeDocument[];
}

export type KnowledgeWorkspaceType = "研究课题" | "项目" | "生活目标" | "例行事项";

export interface KnowledgeWorkspaceSummary {
  name: string;
  type: KnowledgeWorkspaceType;
  objective: string;
  status: string;
  domains: string[];
  themes: string[];
  parentName?: string;
  parentPath?: string;
  repeatRule?: string;
  total: number;
  workspaceExists: boolean;
  workspacePath: string;
  basePath: string;
  explicitSourcePaths: string[];
  documents: KnowledgeThemeDocument[];
}

export interface KnowledgeDomainSummary {
  name: string;
  total: number;
  themes: KnowledgeThemeSummary[];
}

export interface KnowledgeThemeSummary {
  name: string;
  parentName?: string;
  domains: string[];
  total: number;
  stageCounts: Record<PDSAStage, number>;
  currentStage: PDSAStage;
  fixed: boolean;
  workspaceExists: boolean;
  workspacePath: string;
  basePath: string;
  researchQuestions: string[];
  researchTopics: KnowledgeResearchTopicSummary[];
  explicitSourcePaths: string[];
  documents: KnowledgeThemeDocument[];
  suggestedDocuments: KnowledgeThemeDocument[];
}

export interface ThemeSynthesisProposal {
  summary: string;
  dimensions: Array<{ name: string; question: string }>;
  propositions: Array<{
    title: string;
    status: "待验证" | "有证据" | "存在争议";
    evidencePaths: string[];
  }>;
  gaps: string[];
  outputs: Array<{ title: string; format: string; angle: string }>;
}

export interface ThemePlanningProposal {
  questions: string[];
  sources: Array<{ path: string; reason: string }>;
}

export interface PropertyInventoryItem {
  name: string;
  files: number;
  coverage: number;
  valueType: PropertyValueType;
  uniqueValues: number;
  topValues: Array<{ value: string; count: number }>;
}

export type PropertyAuditIssueKind = "missing" | "legacy-alias" | "alias-conflict" | "wrong-type" | "invalid-value";

export interface PropertyAuditIssue {
  path: string;
  property: string;
  kind: PropertyAuditIssueKind;
  message: string;
  automatic: boolean;
  currentValue?: unknown;
  suggestedValue?: unknown;
}

export interface PropertyChangeOperation {
  kind: "set" | "rename";
  property: string;
  alias?: string;
  before?: unknown;
  after: unknown;
  reason: string;
}

export interface PropertyAuditChange {
  path: string;
  basename: string;
  operations: PropertyChangeOperation[];
}

export interface PropertyAudit {
  scannedFiles: number;
  governedFiles: number;
  excludedFiles: number;
  compliantFiles: number;
  nonCompliantFiles: number;
  compliantPaths: string[];
  nonCompliantPaths: string[];
  automaticFiles: number;
  automaticOperations: number;
  manualIssues: number;
  issues: PropertyAuditIssue[];
  changes: PropertyAuditChange[];
  createdAt: string;
}

export type PropertyCaptureState = "processing" | "complete" | "needs-review" | "failed";

export interface PropertyCaptureStatus {
  path: string;
  basename: string;
  state: PropertyCaptureState;
  message: string;
  updatedAt: string;
}

export interface PropertyFlowCounts {
  input: number;
  knowledge: number;
  project: number;
  action: number;
  output: number;
}

export interface PropertyWorkspaceSnapshot {
  inventory: PropertyInventoryItem[];
  suggestedDimensions: PropertyDimensionConfig[];
  audit: PropertyAudit;
  flowCounts: PropertyFlowCounts;
  knowledgeThemes: KnowledgeThemeSummary[];
  knowledgeDocuments: KnowledgeThemeDocument[];
  knowledgeWorkspaces: KnowledgeWorkspaceSummary[];
  unassignedTopicFiles: number;
}

export interface HeadingChoice {
  label: string;
  value: string;
}

export const DEFAULT_SETTINGS: KnowGroveSettings = {
  trackedFolder: "阅读列表",
  statusProperty: "阅读状态",
  readingStatus: "在看",
  finishedStatus: "已读完",
  autoMarkNewNotes: true,
  autoMarkFinishedAtEnd: true,
  finishDwellSeconds: 3,
  defaultTargetFolder: "",
  defaultTargetHeading: "评论",
  enableBlockDragReferences: true,
  enableComments: true,
  enableWordLikeEditing: true,
  cleanupBlankLinesWithPropertyCheck: false,
  enableAttachmentCleanup: true,
  attachmentCleanupExcludedFolders: [],
  attachmentCleanupExtraExtensions: [],
  moveAttachmentsWithNote: false,
  autoOrganizeAttachments: false,
  sharedAttachmentHandling: "skip",
  enableTopicIndex: true,
  enableDocumentAnchors: true,
  lastAttachmentCleanupScanAt: 0,
  recentFileMode: "opened",
  recentFileLimit: 8,
  runtime: {
    mode: "auto",
    manifestUrl: "",
    preferExistingTools: true,
    autoUpdateSkillPack: true,
    lastAuditAt: "",
    lastInstallError: "",
  },
  browserCapture: {
    enabled: true,
    port: 47831,
    inboxFolder: "",
    autoProcessLinkNotes: true,
    watchFolder: "",
    prefixArticleTitleWithDate: true,
    articleOutputFolder: "",
    videoOutputFolder: "",
    audioOutputFolder: "",
    articleAssetFolder: "阅读列表/assets",
    mediaFolder: "阅读列表/附件/音视频",
    keepAudioSource: true,
    articleProvider: "codex-cli",
    videoProvider: "codex-cli",
    audioProvider: "codex-cli",
    defuddlePath: "",
    videoDownloaderPath: "",
    ffmpegPath: "",
    whisperPath: "",
    whisperModel: "small",
    accessToken: "",
    savedDomainSessions: {},
    browserCookieSource: "auto",
  },
  desktopCapture: {
    linkFolder: "",
    recordingFolder: "",
    externalMarkdownOpenerEnabled: true,
    externalMarkdownDeleteSourceAfterImport: true,
    externalMarkdownFolder: "",
  },
  aiProperties: {
    enabled: false,
    autoEnrichNewNotes: true,
    provider: "codex-cli",
    model: "",
    executablePath: "",
    endpoint: "",
    maxContentCharacters: 12_000,
    timeoutSeconds: 120,
  },
  creationStudio: {
    outputFolder: "_KnowGrove/输出",
    imageGenerationEnabled: false,
    imageEndpoint: "https://api.openai.com/v1/images/generations",
    imageModel: "gpt-image-1",
    imageSize: "1536x1024",
    imageAssetFolder: "_KnowGrove/输出/assets",
  },
  propertySystem: {
    scopeFolder: "",
    excludedFolders: [
      "_KnowGrove",
      "Home/🕹️skills",
      "Home/🐘项目/亚马逊经营助手/知识库",
      "Home/🐘项目/亚马逊经营助手/amazon-seller-analyst",
    ],
    basePath: "_KnowGrove/属性工作台.base",
    initializeTrackedNotes: true,
    trackedNoteType: "输入资料",
    trackedNoteStatus: "待整理",
    creationDateProperty: "创建时间",
    taxonomy: {
      version: 1,
      strategy: "four-layer-pdsa",
      source: "recommended",
      domains: [
        { name: "工作", children: [] },
        { name: "AI产品", children: [] },
        { name: "投资", children: [] },
        { name: "内容创作", children: [] },
        { name: "商业探索", children: [] },
        { name: "职业发展", children: [] },
        { name: "个人成长", children: [] },
        { name: "生活", children: [] },
      ],
    },
    dimensions: [
      {
        id: "file-name",
        name: "文件名",
        description: "用于属性面板展示和标题管理，默认与 Markdown 文件名一致。",
        aliases: ["title", "name"],
        valueType: "text",
        required: true,
        requiredForTypes: [],
        origin: "system",
        aiManaged: false,
        enumMode: "open",
        allowedValues: [],
        fillStrategy: "file-name",
        defaultValue: "",
      },
      {
        id: "type",
        name: "类型",
        description: "说明文档承担的内容角色，不能只根据所在文件夹推断。",
        aliases: ["type"],
        valueType: "single",
        required: true,
        requiredForTypes: [],
        origin: "system",
        aiManaged: true,
        enumMode: "closed",
        allowedValues: ["输入资料", "随手笔记", "知识笔记", "项目笔记", "行动", "复盘", "内容输出"],
        fillStrategy: "none",
        defaultValue: "",
      },
      {
        id: "status",
        name: "状态",
        description: "推动知识处理或交付生命周期；阅读进度应使用独立的阅读状态。",
        aliases: ["status"],
        valueType: "single",
        required: true,
        requiredForTypes: [],
        origin: "system",
        aiManaged: true,
        enumMode: "closed",
        allowedValues: [
          "待整理", "待归类", "待沉淀", "已沉淀", "跳过", "处理失败", "已归档",
          "种子", "生长中", "常青", "待复核", "构思中", "进行中", "等待中", "已完成",
          "已暂停", "待办", "已取消", "草稿", "选题", "提纲", "待发布", "已发布", "已复盘",
        ],
        fillStrategy: "none",
        defaultValue: "",
      },
      {
        id: "domain",
        name: "领域",
        description: "稳定的长期知识版图，一篇笔记通常不超过两个。",
        aliases: ["domain", "area"],
        valueType: "multi",
        required: true,
        requiredForTypes: [],
        origin: "system",
        aiManaged: true,
        enumMode: "closed",
        allowedValues: ["工作", "AI产品", "投资", "内容创作", "商业探索", "职业发展", "个人成长", "生活"],
        fillStrategy: "none",
        defaultValue: "",
      },
      {
        id: "topic",
        name: "主题",
        description: "可复用的核心概念；附件、文章标题和一次性名词不进入主题。",
        aliases: ["topic", "topics"],
        valueType: "multi",
        required: true,
        requiredForTypes: [],
        origin: "system",
        aiManaged: true,
        enumMode: "open",
        allowedValues: [],
        fillStrategy: "none",
        defaultValue: "",
      },
    ],
  },
};

export function createDefaultSettings(): KnowGroveSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as KnowGroveSettings;
}
