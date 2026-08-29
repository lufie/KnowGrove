import { FileSystemAdapter, getLanguage, Platform, TFile, normalizePath, requestUrl, type App } from "obsidian";
import { createHash, timingSafeEqual } from "node:crypto";
import { access, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import * as http from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import * as https from "node:https";
import { homedir, tmpdir } from "node:os";
import { extname, join } from "node:path";
import type {
  AIProviderAvailability,
  AIProviderId,
  BrowserCaptureSettings,
  KnowGroveSettings,
} from "./types";
import { runLocalCommand } from "./ai-provider";
import { normalizeKnowGroveLocale, type KnowGroveLocale } from "./i18n";
import {
  BROWSER_CAPTURE_SKILLS,
  browserCaptureChunkPrompt,
  browserCapturePrompt,
  browserCaptureSkill,
  browserCaptureSynthesisPrompt,
  captureCancellationPlan,
  enqueueAfterInitialCaptureNote,
  settleTaskOwnedCapturePreparation,
  buildWhisperInvocation,
  whisperLanguageFromLocale,
  buildWhisperPcmConversionArgs,
  buildCaptureFailureNote,
  buildEnhancedCaptureNote,
  buildRawCaptureNote,
  articleCaptureTitle,
  captureDatePrefix,
  classifyBrowserCaptureResource,
  classifyBrowserCaptureUrl,
  detectInterruptedCapture,
  detectCaptureErrorShell,
  detectLinkNoteCandidate,
  LOCAL_MEDIA_EXTENSION,
  detectWhisperImplementation,
  whisperNeedsPcmConversion,
  cleanArticleMarkdown,
  extractArticleFromHtml,
  extractEmbeddedMediaCandidates,
  extractJsonObject,
  formatYtDlpCaptureError,
  formatTranscriptParagraphs,
  normalizeBrowserCaptureAIResult,
  parseSubtitleText,
  protectArticleImages,
  restoreArticleImages,
  safeCaptureFileName,
  sameCaptureResourceUrl,
  selectPreferredSubtitleFile,
  selectApplePodcastEpisode,
  selectedCaptureProvider,
  normalizeCaptureSessionCookies,
  serializeNetscapeCookies,
  splitBrowserCaptureText,
  stripCaptureFrontmatter,
  ytDlpCaptureArgs,
  ytDlpSubtitleArgs,
  extractRootDomain,
  matchDomainSessionCookies,
  initialCaptureNotePath,
  isTikTokCaptureUrl,
  isXiguaCaptureUrl,
  isVimeoCaptureUrl,
  isTencentVideoUrl,
  isInstagramCaptureUrl,
  extractVimeoVideoId,
  parseTikTokHtml,
  portableSiblingAssetLinkPath,
  nextCapturePlaceholderPath,
  extractTencentVideoVid,
  parseXiguaHtml,
  type BrowserCaptureAIResult,
  type ApplePodcastEpisode,
  type BrowserCaptureMediaCandidate,
  type BrowserCapturePageType,
  type BrowserCaptureSessionCookie,
  type WhisperInvocation,
} from "./browser-capture-core";
import {
  alignRecordingMarkers,
  appendPreservedRecordingMarkerBlock,
  parseRecordingMarkers,
  parseTimedTranscriptSrt,
  recordingMarkerHeading,
  renderAlignedRecordingMarkers,
  type TimedTranscriptSegment,
} from "./recording-markers";

export type BrowserCaptureJobStatus = "queued" | "running" | "cancelling" | "completed" | "partial" | "failed";

class CaptureAdmissionCancelledError extends Error {
  constructor() {
    super("任务已取消");
    this.name = "CaptureAdmissionCancelledError";
  }
}

export interface BrowserCaptureJob {
  id: string;
  url: string;
  resolvedUrl?: string;
  title: string;
  pageType: BrowserCapturePageType;
  skillId: string;
  providerId: AIProviderId;
  source: string;
  targetPath?: string;
  mediaPath?: string;
  status: BrowserCaptureJobStatus;
  phase: string;
  phaseLabel: string;
  message: string;
  progress: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
  result?: {
    title: string;
    relativePath: string;
    obsidianUri: string;
    preview: string;
    pageType: BrowserCapturePageType;
    skillId: string;
    providerId: AIProviderId;
    storageVerified?: boolean;
    verifiedAt?: string;
  };
  resumeFromRaw?: boolean;
  createdNotePath?: string;
  createdAttachmentPaths?: string[];
  cancelRequestedAt?: string;
}

export interface BrowserCaptureServerStatus {
  running: boolean;
  address: string;
  error?: string;
}

interface PendingPairing {
  nonce: string;
  origin: string;
  createdAt: number;
  approved: boolean;
}

interface BrowserCaptureHost {
  app: App;
  getSettings(): KnowGroveSettings;
  saveSettings(): Promise<void>;
  getProviders(force?: boolean): Promise<AIProviderAvailability[]>;
  runProvider(provider: AIProviderId, prompt: string, signal?: AbortSignal): Promise<{
    output: string;
    providerId: AIProviderId;
    handoffCount: number;
  }>;
  getSkillInstruction(pageType: BrowserCapturePageType): Promise<string>;
  suppressNewNoteInitialization(path: string): void;
  suppressAutomaticLinkNote(path: string): void;
  enrichCapturedFile(file: TFile): Promise<void>;
}

interface ExtractedSource {
  title: string;
  source: string;
  recordingMarkerBlock?: string;
  author?: string;
  publishedAt?: string;
  mediaPath?: string;
  embeddedMedia?: BrowserCaptureMediaCandidate[];
}

interface BrowserCaptureSessionContext {
  cookies: BrowserCaptureSessionCookie[];
  userAgent: string;
  referer: string;
  mediaCandidates: BrowserCaptureMediaCandidate[];
}

const HOST = "127.0.0.1";
const MAX_REQUEST_BYTES = 512_000;
const MAX_SOURCE_CHARACTERS = 240_000;
const PAIRING_LIFETIME_MS = 2 * 60 * 1_000;
const FINISHED_STATUSES = new Set<BrowserCaptureJobStatus>(["completed", "partial", "failed"]);

const PHASE_LABELS: Record<string, string> = {
  queued: "等待处理",
  backing_up: "备份链接",
  extracting: "提取网页正文",
  transcribing: "获取媒体并转录",
  backed_up: "原始内容已备份",
  organizing: "调用 AI 整理",
  saving: "写入 Vault",
  completed: "整理完成",
  partial: "已备份，整理未完成",
  failed: "处理失败",
  cancelling: "正在取消并清理",
};

function captureAbortError(): Error {
  const error = new Error("任务已由用户取消");
  error.name = "AbortError";
  return error;
}

function throwIfCaptureAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw captureAbortError();
}

function isCaptureAbort(error: unknown, signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted || (error instanceof Error && error.name === "AbortError"));
}

function randomHex(bytes = 32): string {
  const buffer = new Uint8Array(bytes);
  window.crypto.getRandomValues(buffer);
  return Array.from(buffer, (value) => value.toString(16).padStart(2, "0")).join("");
}

function isAllowedOrigin(origin: string): boolean {
  // Chromium omits Origin for extension fetches covered by host_permissions.
  // Web pages do send Origin, so they still must match an extension scheme.
  return origin === ""
    || /^(chrome-extension|safari-web-extension|moz-extension):\/\/[a-z0-9.-]+$/i.test(origin);
}

function stringField(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function captureMediaCandidates(value: unknown, baseUrl: string): BrowserCaptureMediaCandidate[] {
  if (!Array.isArray(value)) return [];
  const candidates: BrowserCaptureMediaCandidate[] = [];
  for (const raw of value.slice(0, 16)) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const pageType = stringField(item.pageType);
    if (pageType !== "video" && pageType !== "audio") continue;
    try {
      const url = new URL(stringField(item.url), baseUrl);
      if (!['http:', 'https:'].includes(url.protocol)) continue;
      if (candidates.some((candidate) => sameCaptureResourceUrl(candidate.url, url.toString()))) continue;
      candidates.push({
        url: url.toString(),
        pageType,
        ...(stringField(item.label).trim() ? { label: stringField(item.label).trim().slice(0, 160) } : {}),
      });
    } catch {
      // Ignore malformed browser hints; the original page still remains usable.
    }
  }
  return candidates.slice(0, 8);
}

function captureSessionCookies(value: unknown, url: string): BrowserCaptureSessionCookie[] {
  if (!Array.isArray(value)) return [];
  return normalizeCaptureSessionCookies(value.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    return [{
      domain: stringField(item.domain),
      path: stringField(item.path, "/"),
      name: stringField(item.name),
      value: stringField(item.value),
      secure: Boolean(item.secure),
      httpOnly: Boolean(item.httpOnly),
      expirationDate: typeof item.expirationDate === "number" ? item.expirationDate : 0,
    }];
  }), url);
}

function isWebUrl(value: unknown): string {
  const parsed = new URL(stringField(value));
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("只支持 http 或 https 网页");
  return parsed.toString();
}

function compact(value: string, maxLength = 260): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

function lastLine(value: string): string {
  const lines = value.trim().split(/\r?\n/).filter(Boolean);
  return lines[lines.length - 1] ?? "";
}

function systemCaptureOutputLocale(): KnowGroveLocale {
  const language = typeof getLanguage === "function"
    ? getLanguage()
    : typeof navigator !== "undefined"
      ? navigator.languages?.[0] || navigator.language
      : Intl.DateTimeFormat().resolvedOptions().locale;
  return normalizeKnowGroveLocale(language || "zh-CN");
}

async function downloadCaptureImage(url: string, referer: string, redirects = 0): Promise<{
  data: ArrayBuffer;
  contentType: string;
}> {
  if (redirects > 5) throw new Error("图片重定向次数过多");
  const parsed = new URL(url);
  const client = parsed.protocol === "https:" ? https : http;
  return await new Promise((resolve, reject) => {
    const request = client.get(parsed, {
      headers: {
        "User-Agent": "Mozilla/5.0 KnowGrove/2.4",
        Referer: referer,
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
    }, (response) => {
      const status = response.statusCode ?? 0;
      const location = response.headers.location;
      if (status >= 300 && status < 400 && location) {
        response.resume();
        void downloadCaptureImage(new URL(location, parsed).toString(), referer, redirects + 1)
          .then(resolve, reject);
        return;
      }
      if (status < 200 || status >= 400) {
        response.resume();
        reject(new Error(`图片下载失败（HTTP ${status}）`));
        return;
      }
      const chunks: Buffer[] = [];
      let total = 0;
      response.on("data", (chunk: Buffer) => {
        total += chunk.length;
        if (total > 30 * 1024 * 1024) {
          request.destroy(new Error("单张图片超过 30 MB 安全上限"));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        const buffer = Buffer.concat(chunks);
        const data = buffer.buffer.slice(
          buffer.byteOffset,
          buffer.byteOffset + buffer.byteLength,
        );
        resolve({
          data,
          contentType: String(response.headers["content-type"] ?? "").toLowerCase(),
        });
      });
      response.on("error", reject);
    });
    request.setTimeout(30_000, () => request.destroy(new Error("图片下载超时")));
    request.on("error", reject);
  });
}

async function probeCaptureResource(url: string, redirects = 0): Promise<{
  finalUrl: string;
  contentType: string;
  contentDisposition: string;
  html: string;
}> {
  if (redirects > 8) throw new Error("链接重定向次数过多");
  const parsed = new URL(url);
  const client = parsed.protocol === "https:" ? https : http;
  return await new Promise((resolve, reject) => {
    const request = client.get(parsed, {
      headers: {
        "User-Agent": "Mozilla/5.0 KnowGrove/2.5",
        Accept: "text/html,application/xhtml+xml,video/*,audio/*;q=0.9,*/*;q=0.2",
        "Accept-Encoding": "identity",
      },
    }, (response) => {
      const status = response.statusCode ?? 0;
      const location = response.headers.location;
      if (status >= 300 && status < 400 && location) {
        response.resume();
        void probeCaptureResource(new URL(location, parsed).toString(), redirects + 1)
          .then(resolve, reject);
        return;
      }
      if (status < 200 || status >= 400) {
        response.resume();
        reject(new Error(`链接探测失败（HTTP ${status}）`));
        return;
      }
      const contentType = String(response.headers["content-type"] ?? "");
      const contentDisposition = String(response.headers["content-disposition"] ?? "");
      const isHtml = /^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i.test(contentType);
      const declaredLength = Number(response.headers["content-length"] || 0);
      if (!isHtml || declaredLength > 4_000_000) {
        response.resume();
        resolve({ finalUrl: parsed.toString(), contentType, contentDisposition, html: "" });
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        if (size >= 4_000_000) return;
        const remaining = 4_000_000 - size;
        const next = chunk.byteLength > remaining ? chunk.subarray(0, remaining) : chunk;
        chunks.push(next);
        size += next.byteLength;
      });
      response.on("end", () => {
        resolve({
          finalUrl: parsed.toString(),
          contentType,
          contentDisposition,
          html: Buffer.concat(chunks).toString("utf8"),
        });
      });
      response.on("error", reject);
    });
    request.setTimeout(30_000, () => request.destroy(new Error("链接探测超时")));
    request.on("error", reject);
  });
}

function sameToken(expected: string, actual: unknown): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(stringField(actual));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function sendJson(response: ServerResponse, status: number, data: unknown, origin = ""): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...(origin && isAllowedOrigin(origin)
      ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Private-Network": "true",
        Vary: "Origin",
      }
      : {}),
  });
  response.end(JSON.stringify(data));
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request as AsyncIterable<unknown>) {
    const buffer = typeof chunk === "string"
      ? Buffer.from(chunk)
      : Buffer.isBuffer(chunk)
        ? Buffer.from(chunk)
        : undefined;
    if (!buffer) throw new Error("请求内容格式无效");
    total += buffer.length;
    if (total > MAX_REQUEST_BYTES) throw new Error("请求内容超过安全上限");
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) as Record<string, unknown> : {};
}

function captureContentType(pageType: BrowserCapturePageType): string {
  return pageType === "video" ? "视频" : pageType === "audio" ? "音频" : "网页文章";
}

function ffmpegLocationArgs(settings: BrowserCaptureSettings): string[] {
  const configured = settings.ffmpegPath.trim();
  return configured ? ["--ffmpeg-location", configured] : [];
}

function replaceGeneratedFrontmatter(generated: string, current: string): string {
  const frontmatter = current.match(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/)?.[0]?.trimEnd();
  const body = generated.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "").replace(/^\s+/, "");
  return frontmatter ? `${frontmatter}\n\n${body}` : generated;
}

async function readWhisperTranscript(
  directory: string,
  invocation: WhisperInvocation,
): Promise<{ transcript: string; segments: TimedTranscriptSegment[] }> {
  let transcriptPath = invocation.transcriptPath;
  if (transcriptPath) {
    try {
      await access(transcriptPath);
    } catch {
      transcriptPath = undefined;
    }
  }
  if (!transcriptPath) {
    const files = await readdir(directory);
    const transcriptFile = files.find((name) => name.toLowerCase().endsWith(".srt"))
      ?? files.find((name) => name.toLowerCase().endsWith(".txt"));
    if (!transcriptFile) throw new Error("Whisper 完成后没有生成逐字稿");
    transcriptPath = join(directory, transcriptFile);
  }
  const raw = await readFile(transcriptPath, "utf8");
  const segments = transcriptPath.toLowerCase().endsWith(".srt")
    ? parseTimedTranscriptSrt(raw)
    : [];
  const transcript = formatTranscriptParagraphs(
    segments.length ? segments.map((segment) => segment.text).join("\n") : raw,
  );
  if (!transcript) throw new Error("Whisper 生成的逐字稿为空");
  return { transcript, segments };
}

function captureBodyForConflictCheck(content: string): string {
  return stripCaptureFrontmatter(content).replace(
    /!\[\[([^\]|]+)(\|[^\]]+)?\]\]/g,
    (_embed, target, alias = "") => {
      const targetParts = String(target).split("/");
      const baseName = targetParts[targetParts.length - 1] ?? String(target);
      return `![[${baseName}${alias}]]`;
    },
  );
}

async function resolveWhisperExecutable(configuredPath: string): Promise<string> {
  const configured = configuredPath.trim();
  const candidates = configured
    ? [configured]
    : [
      "/opt/homebrew/bin/whisper",
      "/usr/local/bin/whisper",
      "/opt/homebrew/bin/whisper-cli",
      "/usr/local/bin/whisper-cli",
      "whisper",
      "whisper-cli",
    ];
  for (const candidate of candidates) {
    try {
      const result = await runLocalCommand(candidate, ["--help"], "", 8);
      if (result.exitCode === 0) return candidate;
    } catch {
      // Try the next supported Whisper implementation.
    }
  }
  if (configured) {
    throw new Error(`Whisper 路径不可用：${configured}。请清空后自动检测，或填写 whisper / whisper-cli 的完整路径`);
  }
  throw new Error("未检测到 Whisper。请安装 openai-whisper 或 whisper.cpp，或在 KnowGrove 设置中填写完整路径");
}

async function resolveCaptureTool(
  configuredPath: string,
  executableName: string,
  label: string,
): Promise<string> {
  const configured = configuredPath.trim();
  const candidates = configured
    ? [configured]
    : [
      `/opt/homebrew/bin/${executableName}`,
      `/usr/local/bin/${executableName}`,
      `${homedir()}/.local/bin/${executableName}`,
      ...(executableName === "yt-dlp" ? [`${homedir()}/.pyenv/shims/yt-dlp`] : []),
      executableName,
    ];
  for (const candidate of candidates) {
    try {
      const result = await runLocalCommand(
        candidate,
        executableName === "ffmpeg" ? ["-version"] : ["--version"],
        "",
        8,
      );
      if (result.exitCode === 0) return candidate;
    } catch {
      // Try the next explicit path without invoking a shell.
    }
  }
  if (configured) throw new Error(`${label} 路径不可用：${configured}`);
  throw new Error(`未检测到 ${label}。请安装后重试，或在 KnowGrove 设置中填写完整路径`);
}

async function resolveWhisperCppModel(modelSetting: string): Promise<string> {
  const home = homedir();
  const raw = modelSetting.trim() || "small";
  const expanded = raw === "~"
    ? home
    : raw.startsWith("~/")
      ? join(home, raw.slice(2))
      : raw;
  const isPath = expanded.includes("/") || expanded.includes("\\");
  const rawParts = raw.split(/[\\/]/);
  const fileName = raw.endsWith(".bin") ? rawParts[rawParts.length - 1]! : `ggml-${raw}.bin`;
  const candidates = Array.from(new Set([
    ...(isPath ? [expanded] : []),
    join(home, ".cache", "whisper-models", fileName),
    join(home, ".cache", "whisper.cpp", fileName),
    join(home, ".local", "share", "whisper", fileName),
    join(home, ".wechat-inbox-local-asr", "models", fileName),
    join("/opt/homebrew/share/whisper-cpp", fileName),
    join("/usr/local/share/whisper-cpp", fileName),
  ]));
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Continue through the bounded set of well-known local model locations.
    }
  }
  if (isPath) throw new Error(`Whisper 模型文件不存在：${expanded}`);
  throw new Error(
    `已检测到 whisper-cli，但没有找到 ${fileName}。请在 KnowGrove 设置的“Whisper 模型”中填写 GGML 模型完整路径`,
  );
}

export class BrowserCaptureServer {
  private server?: Server;
  private status: BrowserCaptureServerStatus = {
    running: false,
    address: `http://${HOST}:47831`,
  };
  private readonly jobs = new Map<string, BrowserCaptureJob>();
  private readonly capturedSources = new Map<string, ExtractedSource>();
  private readonly captureSessions = new Map<string, BrowserCaptureSessionContext>();
  private readonly pendingPairings = new Map<string, PendingPairing>();
  private readonly queue: string[] = [];
  private readonly jobAbortControllers = new Map<string, AbortController>();
  private readonly activeJobRuns = new Map<string, Promise<void>>();
  private readonly originalTargetContents = new Map<string, { path: string; content: string }>();
  private readonly currentNotePaths = new Map<string, string>();
  private readonly queuedNotePreparations = new Map<string, Promise<TFile>>();
  private readonly listeners = new Set<(jobs: BrowserCaptureJob[]) => void>();
  private processing = false;
  private stopping = false;

  constructor(private readonly host: BrowserCaptureHost) {}

  subscribe(listener: (jobs: BrowserCaptureJob[]) => void): () => void {
    this.listeners.add(listener);
    try {
      listener(this.getJobs());
    } catch (error) {
      console.error("KnowGrove: capture job listener error", error);
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  getJobs(): BrowserCaptureJob[] {
    return Array.from(this.jobs.values());
  }

  pruneFinishedJobs(idsToPrune?: Set<string>): void {
    let changed = false;
    for (const [id, job] of this.jobs) {
      if (FINISHED_STATUSES.has(job.status)) {
        if (!idsToPrune || idsToPrune.has(id)) {
          this.jobs.delete(id);
          this.currentNotePaths.delete(id);
          this.jobAbortControllers.delete(id);
          this.capturedSources.delete(id);
          this.captureSessions.delete(id);
          this.originalTargetContents.delete(id);
          this.queuedNotePreparations.delete(id);
          changed = true;
        }
      }
    }
    if (changed) {
      void this.persistJobs();
      this.notifyListeners();
    }
  }

  private notifyListeners(): void {
    const jobs = this.getJobs();
    for (const listener of this.listeners) {
      try {
        listener(jobs);
      } catch (error) {
        console.error("KnowGrove: capture job listener error", error);
      }
    }
  }

  getStatus(): BrowserCaptureServerStatus {
    return { ...this.status };
  }

  async start(): Promise<void> {
    if (!Platform.isDesktopApp || this.server) return;
    const settings = this.host.getSettings().browserCapture;
    if (!settings.enabled) return;
    if (!settings.accessToken) {
      settings.accessToken = randomHex();
      await this.host.saveSettings();
    }
    await this.loadJobs();
    this.stopping = false;
    this.server = http.createServer((request, response) => {
      void this.handleRequest(request, response).catch((error) => {
        console.error("KnowGrove: browser capture request failed", error);
        if (!response.headersSent) {
          sendJson(response, error instanceof SyntaxError ? 400 : 500, {
            error: error instanceof Error ? error.message : String(error),
          }, String(request.headers.origin ?? ""));
        } else {
          response.end();
        }
      });
    });
    await new Promise<void>((resolve, reject) => {
      const server = this.server;
      if (!server) return reject(new Error("浏览器接收服务初始化失败"));
      const onError = (error: Error): void => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = (): void => {
        server.off("error", onError);
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(settings.port, HOST);
    }).then(() => {
      this.status = {
        running: true,
        address: `http://${HOST}:${settings.port}`,
      };
    }).catch((error) => {
      this.server = undefined;
      this.status = {
        running: false,
        address: `http://${HOST}:${settings.port}`,
        error: error instanceof Error ? error.message : String(error),
      };
      throw error;
    });
  }

  async stop(): Promise<void> {
    this.stopping = true;
    const server = this.server;
    this.server = undefined;
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeIdleConnections?.();
        server.closeAllConnections?.();
      });
    }
    for (const job of this.jobs.values()) {
      if (!FINISHED_STATUSES.has(job.status)) {
        job.status = "failed";
        job.phase = "failed";
        job.phaseLabel = PHASE_LABELS.failed!;
        job.error = "Obsidian 已关闭，任务已停止；重新打开后可以再次提交";
        job.message = job.error;
        job.progress = 100;
        job.updatedAt = new Date().toISOString();
      }
    }
    this.capturedSources.clear();
    this.captureSessions.clear();
    await this.persistJobs().catch(() => undefined);
    this.status = {
      running: false,
      address: this.status.address,
    };
  }

  async restart(): Promise<void> {
    await this.stop();
    if (this.host.getSettings().browserCapture.enabled) await this.start();
  }

  async resetPairing(): Promise<void> {
    this.host.getSettings().browserCapture.accessToken = randomHex();
    this.pendingPairings.clear();
    await this.host.saveSettings();
  }

  approvePairing(nonce: string): boolean {
    this.prunePairings();
    const pairing = this.pendingPairings.get(nonce);
    if (!pairing) return false;
    pairing.approved = true;
    return true;
  }

  async enqueueLinkNote(file: TFile, source: "manual" | "auto"): Promise<BrowserCaptureJob> {
    if (file.extension !== "md") throw new Error("只能解析 Markdown 链接笔记");
    const content = await this.host.app.vault.read(file);
    const candidate = detectLinkNoteCandidate(content, file.basename);
    const interrupted = candidate ? null : detectInterruptedCapture(content);
    if (!candidate && !interrupted) {
      throw new Error("当前笔记不是待解析的轻量链接笔记，也没有可恢复的原文或逐字稿");
    }
    this.host.suppressNewNoteInitialization(file.path);
    const existing = [...this.jobs.values()].find((job) =>
      !FINISHED_STATUSES.has(job.status)
      && (
        job.targetPath === file.path
        || job.createdNotePath === file.path
        || this.currentNotePaths.get(job.id) === file.path
      ),
    );
    if (existing) return existing;
    const url = candidate?.url ?? interrupted!.url;
    const pageType = candidate?.pageType
      ?? interrupted?.pageType
      ?? classifyBrowserCaptureUrl(url);
    const providerId = selectedCaptureProvider(this.host.getSettings().aiProperties.provider, pageType);
    const job = await this.createJob({
      url,
      title: candidate?.title ?? interrupted!.title,
      pageType,
      providerId,
      source: `link-note-${source}${interrupted ? "-resume" : ""}`,
      targetPath: file.path,
      mediaPath: candidate?.mediaPath,
      resumeFromRaw: Boolean(interrupted),
    });
    try {
      const admitted = await enqueueAfterInitialCaptureNote(job, (queuedJob) => this.ensureInitialNote(queuedJob), (id) => {
        this.queue.push(id);
      }, (queuedJob) => this.jobs.get(queuedJob.id)?.status === "queued");
      if (!admitted) throw new CaptureAdmissionCancelledError();
    } catch (error) {
      await this.cleanupCancelledJob(job.id);
      throw error;
    }
    void this.drainQueue();
    return job;
  }

  async waitForJob(id: string, timeoutMilliseconds = 2 * 60 * 60 * 1_000): Promise<BrowserCaptureJob> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMilliseconds) {
      const job = this.jobs.get(id);
      if (!job) throw new Error("解析任务不存在");
      if (FINISHED_STATUSES.has(job.status)) return job;
      await new Promise<void>((resolve) => window.setTimeout(resolve, 750));
    }
    throw new Error("解析任务仍在后台运行，可稍后查看笔记");
  }

  async cancelJob(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) throw new Error("任务不存在或已经清理");
    if (FINISHED_STATUSES.has(job.status)) throw new Error("任务已经结束，无需取消");

    this.queue.splice(0, this.queue.length, ...this.queue.filter((queuedId) => queuedId !== id));
    await this.updateJob(id, {
      status: "cancelling",
      phase: "cancelling",
      phaseLabel: PHASE_LABELS.cancelling,
      message: "正在停止处理并移除本次任务创建的内容",
      cancelRequestedAt: new Date().toISOString(),
    });
    this.jobAbortControllers.get(id)?.abort();
    await settleTaskOwnedCapturePreparation({
      targetPath: job.targetPath,
      preparation: this.queuedNotePreparations.get(id),
    });
    const activeRun = this.activeJobRuns.get(id);
    if (activeRun) {
      await activeRun;
      return;
    }
    await this.cleanupCancelledJob(id);
  }

  private prunePairings(): void {
    const threshold = Date.now() - PAIRING_LIFETIME_MS;
    for (const [nonce, pairing] of this.pendingPairings) {
      if (pairing.createdAt < threshold) this.pendingPairings.delete(nonce);
    }
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const origin = String(request.headers.origin ?? "");
    if (!isAllowedOrigin(origin)) {
      sendJson(response, 403, { error: "只允许浏览器扩展连接 KnowGrove" });
      return;
    }
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "Content-Type, X-KnowGrove-Token",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Private-Network": "true",
        Vary: "Origin",
      });
      response.end();
      return;
    }

    const allSettings = this.host.getSettings();
    const settings = allSettings.browserCapture;
    const requestUrl = new URL(request.url || "/", `http://${HOST}:${settings.port}`);
    if (request.method === "GET" && requestUrl.pathname === "/health") {
      const suppliedToken = request.headers["x-knowgrove-token"];
      sendJson(response, 200, {
        ok: true,
        service: "knowgrove",
        desktop: Platform.isDesktopApp,
        pairing: "required",
        authorized: Boolean(suppliedToken) && sameToken(settings.accessToken, suppliedToken),
      }, origin);
      return;
    }
    if (request.method === "POST" && requestUrl.pathname === "/v1/pair/request") {
      this.prunePairings();
      const nonce = randomHex(20);
      this.pendingPairings.set(nonce, {
        nonce,
        origin,
        createdAt: Date.now(),
        approved: false,
      });
      sendJson(response, 201, {
        nonce,
        deepLink: `obsidian://knowgrove-browser-pair?nonce=${encodeURIComponent(nonce)}`,
        expiresInSeconds: Math.round(PAIRING_LIFETIME_MS / 1_000),
      }, origin);
      return;
    }
    if (request.method === "GET" && requestUrl.pathname === "/v1/pair/status") {
      this.prunePairings();
      const nonce = requestUrl.searchParams.get("nonce") ?? "";
      const pairing = this.pendingPairings.get(nonce);
      if (!pairing) {
        sendJson(response, 404, { error: "配对请求不存在或已过期" }, origin);
        return;
      }
      if (!pairing.approved) {
        sendJson(response, 200, { status: "pending" }, origin);
        return;
      }
      this.pendingPairings.delete(nonce);
      sendJson(response, 200, {
        status: "approved",
        token: settings.accessToken,
      }, origin);
      return;
    }

    if (!sameToken(settings.accessToken, request.headers["x-knowgrove-token"])) {
      sendJson(response, 401, { error: "浏览器尚未与 KnowGrove 配对", code: "PAIRING_REQUIRED" }, origin);
      return;
    }
    if (request.method === "POST" && requestUrl.pathname === "/v1/pair/revoke") {
      await this.resetPairing();
      sendJson(response, 200, { ok: true }, origin);
      return;
    }
    if (request.method === "GET" && requestUrl.pathname === "/v1/providers") {
      const providers = await this.host.getProviders();
      sendJson(response, 200, {
        routes: {
          article: selectedCaptureProvider(allSettings.aiProperties.provider, "article"),
          video: selectedCaptureProvider(allSettings.aiProperties.provider, "video"),
          audio: selectedCaptureProvider(allSettings.aiProperties.provider, "audio"),
        },
        providers: providers.map((provider) => ({
          id: provider.id,
          label: provider.name,
          available: provider.available,
          detail: provider.detail,
        })),
        skills: BROWSER_CAPTURE_SKILLS,
      }, origin);
      return;
    }
    if (request.method === "POST" && requestUrl.pathname === "/v1/capture") {
      const body = await readJsonBody(request);
      const url = isWebUrl(body.url);
      const pageType = classifyBrowserCaptureResource(url, {
        pageTypeHint: stringField(body.pageTypeHint),
      });
      const providerId = selectedCaptureProvider(allSettings.aiProperties.provider, pageType);
      const providers = await this.host.getProviders();
      const provider = providers.find((item) => item.id === providerId);
      if (!provider?.available) {
        sendJson(response, 409, {
          error: `${provider?.name ?? providerId} 当前不可用，请在“大模型配置”中重新选择`,
        }, origin);
        return;
      }
      const browserContent = stringField(body.content).trim().slice(0, MAX_SOURCE_CHARACTERS);
      const browserTranscript = stringField(body.transcript).trim().slice(0, MAX_SOURCE_CHARACTERS);
      const errorShell = detectCaptureErrorShell({
        title: stringField(body.contentTitle) || stringField(body.title),
        text: browserContent,
      });
      if (errorShell && pageType === "article") {
        sendJson(response, 422, {
          error: `${errorShell}。请在浏览器中打开有效内容或完成登录/验证后重试。`,
          code: "PAGE_REQUIRES_BROWSER_SESSION",
        }, origin);
        return;
      }
      const active = [...this.jobs.values()].find((job) =>
        !FINISHED_STATUSES.has(job.status)
        && job.status !== "cancelling"
        && sameCaptureResourceUrl(job.url, url),
      );
      if (active) {
        await this.ensureInitialNote(active);
        sendJson(response, 202, { jobId: active.id, status: active.status, reused: true }, origin);
        return;
      }
      let targetFile: TFile | undefined;
      const requestedTargetPath = stringField(body.targetPath).trim();
      if (requestedTargetPath) {
        const targetPath = normalizePath(requestedTargetPath).replace(/^\/+/, "");
        const candidateFile = this.host.app.vault.getAbstractFileByPath(targetPath);
        if (!(candidateFile instanceof TFile) || candidateFile.extension !== "md") {
          sendJson(response, 404, { error: "指定的目标 Markdown 笔记不存在" }, origin);
          return;
        }
        const existingContent = await this.host.app.vault.cachedRead(candidateFile);
        const candidate = detectLinkNoteCandidate(existingContent, candidateFile.basename);
        const interrupted = candidate ? null : detectInterruptedCapture(existingContent);
        const existingUrl = candidate?.url ?? interrupted?.url;
        if (!existingUrl || !sameCaptureResourceUrl(existingUrl, url)) {
          sendJson(response, 409, { error: "目标笔记中的来源链接与当前页面不一致，已停止覆盖" }, origin);
          return;
        }
        this.host.suppressNewNoteInitialization(candidateFile.path);
        targetFile = candidateFile;
      }
      const job = await this.createJob({
        url,
        title: stringField(body.title).slice(0, 500),
        pageType,
        providerId,
        source: stringField(body.source, "extension").slice(0, 80),
        targetPath: targetFile?.path,
      });
      const mediaCandidates = captureMediaCandidates(body.mediaCandidates, url);
      const cookies = captureSessionCookies(body.sessionCookies, url);
      const userAgent = stringField(body.userAgent).replace(/[\r\n\0]/g, "").slice(0, 1_000);
      const referer = stringField(body.referer, url).replace(/[\r\n\0]/g, "").slice(0, 2_000);
      if (cookies.length) {
        const rootDomain = extractRootDomain(url);
        const pluginSettings = this.host.getSettings();
        if (!pluginSettings.browserCapture.savedDomainSessions) {
          pluginSettings.browserCapture.savedDomainSessions = {};
        }
        pluginSettings.browserCapture.savedDomainSessions[rootDomain] = {
          domain: rootDomain,
          cookies,
          userAgent: userAgent || undefined,
          referer: referer || undefined,
          updatedAt: Date.now(),
        };
        void this.host.saveSettings();
      }
      if (cookies.length || mediaCandidates.length || userAgent) {
        this.captureSessions.set(job.id, {
          cookies,
          userAgent,
          referer,
          mediaCandidates,
        });
      }
      if (pageType === "article" && browserContent.length >= 80) {
        const browserImages = Array.isArray(body.images)
          ? body.images.slice(0, 80).flatMap((raw) => {
            if (!raw || typeof raw !== "object") return [];
            const item = raw as Record<string, unknown>;
            try {
              const imageUrl = new URL(stringField(item.url), url);
              if (!["http:", "https:"].includes(imageUrl.protocol)) return [];
              const alt = stringField(item.alt, "图片")
                .replaceAll("[", " ")
                .replaceAll("]", " ")
                .replace(/[\n\r]/g, " ")
                .trim()
                .slice(0, 160) || "图片";
              return [`![${alt}](${imageUrl.toString()})`];
            } catch {
              return [];
            }
          })
          : [];
        const source = [browserContent, browserImages.length ? `## 页面图片\n\n${browserImages.join("\n\n")}` : ""]
          .filter(Boolean)
          .join("\n\n");
        this.capturedSources.set(job.id, {
          title: (stringField(body.contentTitle) || stringField(body.title)).trim().slice(0, 500) || job.title,
          source: source.slice(0, MAX_SOURCE_CHARACTERS),
          author: stringField(body.author).trim().slice(0, 500) || undefined,
          publishedAt: stringField(body.publishedAt).trim().slice(0, 200) || undefined,
          embeddedMedia: mediaCandidates,
        });
      } else if (pageType === "video" && browserTranscript.length >= 20) {
        this.capturedSources.set(job.id, {
          title: (stringField(body.contentTitle) || stringField(body.title)).trim().slice(0, 500) || job.title,
          source: formatTranscriptParagraphs(browserTranscript),
        });
      }
      try {
        const admitted = await enqueueAfterInitialCaptureNote(job, (queuedJob) => this.ensureInitialNote(queuedJob), (id) => {
          this.queue.push(id);
        }, (queuedJob) => this.jobs.get(queuedJob.id)?.status === "queued");
        if (!admitted) throw new CaptureAdmissionCancelledError();
      } catch (error) {
        await this.cleanupCancelledJob(job.id);
        if (error instanceof CaptureAdmissionCancelledError) {
          sendJson(response, 409, { error: error.message }, origin);
          return;
        }
        throw error;
      }
      void this.drainQueue();
      sendJson(response, 202, { jobId: job.id, status: job.status }, origin);
      return;
    }
    const jobMatch = requestUrl.pathname.match(/^\/v1\/jobs\/([a-f0-9-]+)$/i);
    const openMatch = requestUrl.pathname.match(/^\/v1\/jobs\/([a-f0-9-]+)\/open$/i);
    const cancelMatch = requestUrl.pathname.match(/^\/v1\/jobs\/([a-f0-9-]+)\/cancel$/i);
    if (request.method === "POST" && cancelMatch) {
      try {
        await this.cancelJob(cancelMatch[1]!);
        sendJson(response, 200, { ok: true, jobId: cancelMatch[1], cleaned: true }, origin);
      } catch (error) {
        sendJson(response, 409, { error: error instanceof Error ? error.message : String(error) }, origin);
      }
      return;
    }
    if (request.method === "POST" && openMatch) {
      const job = this.jobs.get(openMatch[1]!);
      if (!job) {
        sendJson(response, 404, { error: "任务不存在或已过期" }, origin);
        return;
      }
      const current = await this.reconcileStoredJob(job);
      const path = current.result?.relativePath?.trim() ?? "";
      const file = path ? this.host.app.vault.getAbstractFileByPath(path) : undefined;
      if (!(file instanceof TFile)) {
        sendJson(response, 409, { error: current.error || "保存的笔记已经不存在，请重新处理" }, origin);
        return;
      }
      await this.host.app.workspace.getLeaf(false).openFile(file);
      sendJson(response, 200, { ok: true, relativePath: file.path }, origin);
      return;
    }
    if (request.method === "GET" && jobMatch) {
      const job = this.jobs.get(jobMatch[1]!);
      if (!job) {
        sendJson(response, 404, { error: "任务不存在或已过期" }, origin);
        return;
      }
      sendJson(response, 200, await this.reconcileStoredJob(job), origin);
      return;
    }
    sendJson(response, 404, { error: "接口不存在" }, origin);
  }

  private async loadJobs(): Promise<void> {
    try {
      const jobsPath = this.jobsPath();
      if (!(await this.host.app.vault.adapter.exists(jobsPath))) return;
      const parsed = JSON.parse(await this.host.app.vault.adapter.read(jobsPath)) as { jobs?: BrowserCaptureJob[] };
      for (const job of parsed.jobs ?? []) {
        if (!FINISHED_STATUSES.has(job.status)) {
          job.status = "failed";
          job.phase = "failed";
          job.phaseLabel = PHASE_LABELS.failed!;
          job.progress = 100;
          job.error = "上次 Obsidian 退出时任务尚未完成，请重新提交";
          job.message = job.error;
        }
        this.jobs.set(job.id, job);
      }
    } catch (error) {
      console.error("KnowGrove: failed to restore browser capture jobs", error);
    }
  }

  private async persistJobs(): Promise<void> {
    const jobs = [...this.jobs.values()]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 100);
    await this.host.app.vault.adapter.write(this.jobsPath(), `${JSON.stringify({ jobs }, null, 2)}\n`);
  }

  private jobsPath(): string {
    return normalizePath(`${this.host.app.vault.configDir}/plugins/knowgrove/browser-capture-jobs.json`);
  }

  private async createJob(payload: Pick<
    BrowserCaptureJob,
    "url" | "title" | "pageType" | "providerId" | "source" | "targetPath" | "mediaPath" | "resumeFromRaw"
  >): Promise<BrowserCaptureJob> {
    const skill = browserCaptureSkill(payload.pageType);
    const job: BrowserCaptureJob = {
      id: crypto.randomUUID(),
      ...payload,
      skillId: skill.id,
      status: "queued",
      phase: "queued",
      phaseLabel: PHASE_LABELS.queued!,
      message: "任务已进入 KnowGrove 处理队列",
      progress: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (!this.captureSessions.has(job.id) && payload.url) {
      const saved = matchDomainSessionCookies(this.host.getSettings().browserCapture.savedDomainSessions, payload.url);
      if (saved?.cookies?.length) {
        this.captureSessions.set(job.id, {
          cookies: saved.cookies,
          userAgent: saved.userAgent || "",
          referer: saved.referer || payload.url,
          mediaCandidates: [],
        });
      }
    }
    this.jobs.set(job.id, job);
    await this.persistJobs();
    this.notifyListeners();
    return job;
  }

  private async updateJob(id: string, patch: Partial<BrowserCaptureJob>): Promise<BrowserCaptureJob> {
    const current = this.jobs.get(id);
    if (!current) throw new Error(`任务不存在：${id}`);
    const next = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.jobs.set(id, next);
    await this.persistJobs();
    this.notifyListeners();
    return next;
  }

  private async reconcileStoredJob(job: BrowserCaptureJob): Promise<BrowserCaptureJob> {
    if (job.status !== "completed" && job.status !== "partial") return job;
    const path = job.result?.relativePath?.trim() ?? "";
    const file = path ? this.host.app.vault.getAbstractFileByPath(path) : undefined;
    const stored = file instanceof TFile
      ? await this.host.app.vault.read(file).catch(() => "")
      : "";
    if (!(file instanceof TFile) || !stored.trim()) {
      return this.updateJob(job.id, {
        status: "failed",
        phase: "failed",
        phaseLabel: PHASE_LABELS.failed,
        progress: 100,
        error: "保存的笔记已经不存在或内容为空，请重新处理",
        message: "没有找到可打开的 Obsidian 笔记",
        result: undefined,
      });
    }
    const result = job.result;
    if (
      job.status === "completed"
      && result
      && !result.storageVerified
      && /KnowGrove采集状态:\s*["']?已完成["']?/i.test(stored)
    ) {
      return this.updateJob(job.id, {
        result: {
          ...result,
          storageVerified: true,
          verifiedAt: new Date().toISOString(),
        },
      });
    }
    return job;
  }

  private async drainQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      while (this.queue.length && !this.stopping) {
        const id = this.queue.shift();
        if (id) {
          const run = this.processJob(id);
          this.activeJobRuns.set(id, run);
          try {
            await run;
          } finally {
            this.activeJobRuns.delete(id);
          }
        }
      }
    } finally {
      this.processing = false;
    }
  }

  private async processJob(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;
    if (job.status === "cancelling") {
      await this.cleanupCancelledJob(id);
      return;
    }
    const controller = new AbortController();
    this.jobAbortControllers.set(id, controller);
    const { signal } = controller;
    let noteFile: TFile | undefined;
    let extracted: ExtractedSource | undefined;
    let lastWrittenContent = "";
    const outputLocale = job.pageType === "article" ? "zh-CN" : systemCaptureOutputLocale();
    try {
      throwIfCaptureAborted(signal);
      await this.updateJob(id, {
        status: "running",
        phase: "backing_up",
        phaseLabel: PHASE_LABELS.backing_up,
        progress: 5,
        message: "正在先把链接和标题写入 Vault",
      });
      if (!job.resumeFromRaw && !job.mediaPath && !this.capturedSources.has(id)) {
        await this.probeCaptureTarget(job);
      }
      const initialNotePath = initialCaptureNotePath({
        targetPath: job.targetPath,
        createdNotePath: job.createdNotePath,
        resultPath: job.result?.relativePath,
      });
      const target = initialNotePath
        ? this.host.app.vault.getAbstractFileByPath(initialNotePath)
        : undefined;
      noteFile = target instanceof TFile
        ? target
        : job.targetPath
          ? undefined
          : await this.ensureInitialNote(job);
      if (!noteFile) throw new Error("待解析的链接笔记已经不存在");
      this.currentNotePaths.set(id, noteFile.path);
      throwIfCaptureAborted(signal);
      let interrupted: ReturnType<typeof detectInterruptedCapture> = null;
      if (job.targetPath) {
        const current = await this.host.app.vault.read(noteFile);
        this.originalTargetContents.set(id, { path: noteFile.path, content: current });
        if (job.resumeFromRaw) {
          interrupted = detectInterruptedCapture(current);
          if (!interrupted || interrupted.url !== job.url) {
            throw new Error("可恢复的原文或逐字稿已经变化，已停止自动覆盖");
          }
        } else {
          const candidate = detectLinkNoteCandidate(current, noteFile.basename);
          if (
            !candidate
            || candidate.url !== job.url
            || (job.mediaPath && !this.isMatchingMediaPath(candidate.mediaPath, job.mediaPath, noteFile.path))
          ) {
            throw new Error("笔记在排队期间已经补写正文或更换链接，已停止自动覆盖");
          }
        }
      }
      const initialResult = this.resultFor(job, noteFile, job.title || "待提取内容", "链接已经备份，正在提取内容");
      await this.updateJob(id, {
        result: initialResult,
        phase: interrupted ? "backed_up" : job.pageType === "article" ? "extracting" : "transcribing",
        phaseLabel: PHASE_LABELS[
          interrupted ? "backed_up" : job.pageType === "article" ? "extracting" : "transcribing"
        ],
        progress: interrupted ? 50 : job.pageType === "article" ? 18 : 12,
        message: interrupted
          ? "已找到上次保存的原文或逐字稿，正在继续 AI 整理"
          : job.pageType === "video"
          ? "正在读取字幕；没有字幕时将下载音频并使用 Whisper"
          : job.pageType === "audio"
            ? "正在保存音频并使用本机 Whisper 转录"
          : this.capturedSources.has(id)
            ? "正在读取浏览器中已经渲染的页面正文"
            : "正在由 KnowGrove 提取公开网页正文",
      });

      if (interrupted) {
        extracted = {
          title: interrupted.title,
          source: interrupted.source,
          mediaPath: interrupted.mediaPath,
        };
        lastWrittenContent = await this.host.app.vault.read(noteFile);
      } else {
        extracted = job.pageType === "video"
          ? job.mediaPath
            ? await this.extractLocalMedia(job, noteFile.path, signal, outputLocale)
            : this.capturedSources.get(id) ?? await this.extractVideo(job, signal, outputLocale)
          : job.pageType === "audio"
            ? job.mediaPath
              ? await this.extractLocalMedia(job, noteFile.path, signal, outputLocale)
              : await this.extractAudio(job, noteFile.path, signal, outputLocale)
            : this.capturedSources.get(id) ?? await this.extractArticle(job, signal);
        throwIfCaptureAborted(signal);
        this.capturedSources.delete(id);
        if (job.pageType === "article") {
          const sourceTitle = extracted.title;
          extracted.source = cleanArticleMarkdown(extracted.source, sourceTitle);
          extracted.title = articleCaptureTitle(
            sourceTitle,
            this.articleDatePrefix(noteFile, extracted.publishedAt),
            this.host.getSettings().browserCapture.prefixArticleTitleWithDate,
          );
          noteFile = await this.renameArticleToTitle(noteFile, extracted.title, id);
          const embeddedMedia = extracted.embeddedMedia
            ?? this.captureSessions.get(id)?.mediaCandidates
            ?? [];
          if (embeddedMedia.length) {
            extracted.source = await this.appendEmbeddedMediaTranscripts(
              job,
              noteFile.path,
              extracted.source,
              embeddedMedia,
              signal,
            );
          }
          extracted.source = await this.localizeArticleImages(
            extracted.source,
            extracted.title,
            job.resolvedUrl || job.url,
            noteFile.path,
            id,
            signal,
          );
        } else {
          const sourceTitle = extracted.title;
          extracted.title = articleCaptureTitle(
            sourceTitle,
            this.articleDatePrefix(noteFile, extracted.publishedAt),
            this.host.getSettings().browserCapture.prefixArticleTitleWithDate,
          );
          noteFile = await this.renameArticleToTitle(noteFile, extracted.title, id);
        }
        const generatedRawNote = buildRawCaptureNote({
          pageType: job.pageType,
          title: extracted.title,
          fileName: noteFile.basename,
          url: job.url,
          source: extracted.source.slice(0, MAX_SOURCE_CHARACTERS),
          author: extracted.author,
          publishedAt: extracted.publishedAt,
          capturedAt: new Date().toISOString(),
          statusProperty: this.host.getSettings().statusProperty,
          readingStatus: this.host.getSettings().readingStatus,
          mediaPath: extracted.mediaPath,
          outputLocale,
        });
        const rawNote = appendPreservedRecordingMarkerBlock(
          generatedRawNote,
          extracted.recordingMarkerBlock ?? "",
        );
        if (job.targetPath) {
          await this.host.app.fileManager.processFrontMatter(noteFile, (frontmatter: Record<string, unknown>) => {
            frontmatter["文件名"] = noteFile!.basename;
            frontmatter["标题"] = extracted!.title;
            if (
              job.url
              && !Object.prototype.hasOwnProperty.call(frontmatter, "来源")
            ) {
              frontmatter["来源"] = job.url;
            }
            if (!Object.prototype.hasOwnProperty.call(frontmatter, "内容类型")) frontmatter["内容类型"] = captureContentType(job.pageType);
            if (!Object.prototype.hasOwnProperty.call(frontmatter, "采集时间")) frontmatter["采集时间"] = new Date().toISOString();
            const statusProperty = this.host.getSettings().statusProperty;
            if (statusProperty && !Object.prototype.hasOwnProperty.call(frontmatter, statusProperty)) {
              frontmatter[statusProperty] = this.host.getSettings().readingStatus;
            }
            frontmatter["KnowGrove采集状态"] = "处理中";
          });
          const current = await this.host.app.vault.read(noteFile);
          lastWrittenContent = replaceGeneratedFrontmatter(rawNote, current);
        } else {
          lastWrittenContent = rawNote;
        }
        await this.host.app.vault.modify(noteFile, lastWrittenContent);
      }
      throwIfCaptureAborted(signal);
      await this.updateJob(id, {
        title: extracted.title,
        phase: "backed_up",
        phaseLabel: PHASE_LABELS.backed_up,
        progress: 50,
        message: "原始内容已经写入 Vault，正在调用 AI 整理",
        result: this.resultFor(job, noteFile, extracted.title, "原始内容已备份"),
      });
      const ai = await this.runAI(job, extracted.title, extracted.source, outputLocale, signal, async (message, progress) => {
        await this.updateJob(id, {
          phase: "organizing",
          phaseLabel: PHASE_LABELS.organizing,
          progress,
          message,
        });
      });
      throwIfCaptureAborted(signal);
      await this.updateJob(id, {
        phase: "saving",
        phaseLabel: PHASE_LABELS.saving,
        progress: 94,
        message: "正在写入摘要、要点和整理正文",
      });
      const latestContent = job.targetPath
        ? await this.host.app.vault.read(noteFile)
        : lastWrittenContent;
      if (
        job.targetPath
        && captureBodyForConflictCheck(latestContent) !== captureBodyForConflictCheck(lastWrittenContent)
      ) {
        throw new Error("处理期间笔记正文被手动修改；原始内容已保留，AI 结果未覆盖");
      }
      const enhanced = buildEnhancedCaptureNote(lastWrittenContent, job.pageType, ai, outputLocale);
      const completedContent = latestContent === lastWrittenContent
        ? enhanced
        : replaceGeneratedFrontmatter(enhanced, latestContent);
      await this.host.app.vault.modify(noteFile, completedContent);
      if (latestContent !== lastWrittenContent) {
        await this.host.app.fileManager.processFrontMatter(noteFile, (frontmatter: Record<string, unknown>) => {
          frontmatter["KnowGrove采集状态"] = "已完成";
        });
      }
      await this.updateJob(id, {
        progress: 97,
        message: "正在识别内容所属的领域与主题",
      });
      await this.host.enrichCapturedFile(noteFile);
      throwIfCaptureAborted(signal);
      noteFile = await this.moveToConfiguredOutput(noteFile, job.pageType, id);
      throwIfCaptureAborted(signal);
      noteFile = await this.verifyCompletedCapture(id, noteFile, completedContent);
      await this.updateJob(id, {
        status: "completed",
        phase: "completed",
        phaseLabel: PHASE_LABELS.completed,
        progress: 100,
        message: "内容已经整理并写入 Obsidian",
        completedAt: new Date().toISOString(),
        result: this.resultFor(job, noteFile, extracted.title, compact(ai.summary), true),
      });
    } catch (error) {
      if (isCaptureAbort(error, signal) || this.jobs.get(id)?.status === "cancelling") {
        await this.cleanupCancelledJob(id);
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      const liveNoteFile = noteFile ? this.resolveLiveNoteFile(id, noteFile) : undefined;
      if (liveNoteFile) {
        if (!extracted && !job.targetPath) {
          await this.host.app.vault.modify(liveNoteFile, buildCaptureFailureNote({
            pageType: job.pageType,
            title: job.title || "待提取内容",
            url: job.url,
            capturedAt: new Date().toISOString(),
            error: message,
          }));
        }
        await this.updateJob(id, {
          status: "partial",
          phase: "partial",
          phaseLabel: PHASE_LABELS.partial,
          progress: 100,
          error: message,
          message: extracted
            ? "原始内容已保存，但 AI 整理没有完成"
            : "链接和标题已保存，但正文提取没有完成",
          result: this.resultFor(
            job,
            liveNoteFile,
            extracted?.title || job.title || "待提取内容",
            extracted ? "原始内容已保存，可以稍后重试" : "链接已保存，可以稍后重试",
          ),
        });
      } else {
        await this.updateJob(id, {
          status: "failed",
          phase: "failed",
          phaseLabel: PHASE_LABELS.failed,
          progress: 100,
          error: message,
          message: "任务没有成功写入 Vault，可以重新处理",
          result: undefined,
        });
      }
    } finally {
      this.capturedSources.delete(id);
      this.captureSessions.delete(id);
      this.jobAbortControllers.delete(id);
      this.originalTargetContents.delete(id);
      this.currentNotePaths.delete(id);
    }
  }

  private async cleanupCancelledJob(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;
    const plan = captureCancellationPlan(job);
    for (const path of plan.trashPaths) {
      const file = this.host.app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) await this.host.app.fileManager.trashFile(file).catch(() => undefined);
    }
    if (plan.restoreTarget) {
      const original = this.originalTargetContents.get(id);
      if (original) {
        const currentPath = this.currentNotePaths.get(id) ?? original.path;
        let file = this.host.app.vault.getAbstractFileByPath(currentPath);
        if (
          file instanceof TFile
          && currentPath !== original.path
          && !this.host.app.vault.getAbstractFileByPath(original.path)
        ) {
          await this.host.app.fileManager.renameFile(file, original.path).catch(() => undefined);
          file = this.host.app.vault.getAbstractFileByPath(original.path);
        }
        if (file instanceof TFile) await this.host.app.vault.modify(file, original.content).catch(() => undefined);
      }
    }
    this.queue.splice(0, this.queue.length, ...this.queue.filter((queuedId) => queuedId !== id));
    this.capturedSources.delete(id);
    this.captureSessions.delete(id);
    this.originalTargetContents.delete(id);
    this.queuedNotePreparations.delete(id);
    this.currentNotePaths.delete(id);
    this.jobAbortControllers.delete(id);
    this.jobs.delete(id);
    await this.persistJobs();
    this.notifyListeners();
  }

  private async trackCreatedNote(id: string, path: string): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;
    await this.updateJob(id, { createdNotePath: path });
  }

  private async trackCreatedAttachment(id: string, path: string): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;
    const createdAttachmentPaths = Array.from(new Set([...(job.createdAttachmentPaths ?? []), path]));
    await this.updateJob(id, { createdAttachmentPaths });
  }

  private async createPlaceholder(job: BrowserCaptureJob): Promise<TFile> {
    const settings = this.host.getSettings().browserCapture;
    const folder = normalizePath(settings.inboxFolder.trim() || this.host.getSettings().trackedFolder || "阅读列表")
      .replace(/^\/+|\/+$/g, "");
    await this.ensureFolder(folder);
    const baseName = safeCaptureFileName(job.title || new URL(job.url).hostname);
    const path = normalizePath(nextCapturePlaceholderPath(
      folder,
      baseName,
      (candidate) => Boolean(this.host.app.vault.getAbstractFileByPath(candidate)),
    ));
    const placeholder = [
      "---",
      `来源: ${JSON.stringify(job.url)}`,
      `内容类型: ${JSON.stringify(captureContentType(job.pageType))}`,
      `采集时间: ${JSON.stringify(new Date().toISOString())}`,
      "KnowGrove采集状态: \"处理中\"",
      "---",
      "",
      `# ${job.title || baseName}`,
      "",
      "> KnowGrove 正在提取和整理这条内容。",
      "",
    ].join("\n");
    const file = await this.host.app.vault.create(path, placeholder);
    this.host.suppressNewNoteInitialization(path);
    this.host.suppressAutomaticLinkNote(path);
    await this.trackCreatedNote(job.id, path);
    return file;
  }

  private async ensureInitialNote(job: BrowserCaptureJob): Promise<TFile> {
    const current = this.jobs.get(job.id);
    if (!current || current.status === "cancelling") throw new CaptureAdmissionCancelledError();
    const activePreparation = this.queuedNotePreparations.get(job.id);
    if (activePreparation) return activePreparation;
    const preparation = this.prepareQueuedNote(job);
    this.queuedNotePreparations.set(job.id, preparation);
    try {
      return await preparation;
    } finally {
      if (this.queuedNotePreparations.get(job.id) === preparation) {
        this.queuedNotePreparations.delete(job.id);
      }
    }
  }

  private async prepareQueuedNote(job: BrowserCaptureJob): Promise<TFile> {
    const current = this.jobs.get(job.id) ?? job;
    const targetPath = initialCaptureNotePath({
      targetPath: current.targetPath,
      createdNotePath: current.createdNotePath,
      resultPath: current.result?.relativePath,
    });
    const target = targetPath
      ? this.host.app.vault.getAbstractFileByPath(targetPath)
      : undefined;
    const file = target instanceof TFile
      ? target
      : current.targetPath || current.createdNotePath
        ? undefined
        : await this.createPlaceholder(current);
    if (!file) {
      throw new Error(current.targetPath
        ? "待解析的链接笔记已经不存在"
        : "已保存的剪藏占位笔记已经不存在，请重新处理");
    }
    const stored = await this.host.app.vault.read(file);
    if (!stored.trim()) throw new Error("剪藏占位笔记写入后回读为空，请重新处理");
    this.currentNotePaths.set(current.id, file.path);
    const latest = this.jobs.get(current.id);
    if (!latest || latest.status === "cancelling") return file;
    await this.updateJob(current.id, {
      result: this.resultFor(
        latest,
        file,
        latest.title || file.basename || "待提取内容",
        latest.targetPath ? "目标笔记已确认，等待后台整理" : "链接和标题已保存，等待后台整理",
        true,
      ),
    });
    return file;
  }

  private async ensureFolder(folder: string): Promise<void> {
    if (!folder) return;
    let current = "";
    for (const part of folder.split("/").filter(Boolean)) {
      current = current ? `${current}/${part}` : part;
      if (!this.host.app.vault.getAbstractFileByPath(current)) {
        await this.host.app.vault.createFolder(current);
      }
    }
  }

  private async moveToConfiguredOutput(file: TFile, pageType: BrowserCapturePageType, jobId: string): Promise<TFile> {
    const settings = this.host.getSettings().browserCapture;
    const configured = pageType === "video"
      ? settings.videoOutputFolder
      : pageType === "audio"
        ? settings.audioOutputFolder
        : settings.articleOutputFolder;
    const folder = normalizePath(configured.trim()).replace(/^\/+|\/+$/g, "");
    if (!folder || file.parent?.path === folder) return file;
    await this.ensureFolder(folder);
    const baseName = safeCaptureFileName(file.basename);
    let path = normalizePath(`${folder}/${baseName}.md`);
    let suffix = 2;
    while (this.host.app.vault.getAbstractFileByPath(path)) {
      path = normalizePath(`${folder}/${baseName} ${suffix}.md`);
      suffix += 1;
    }
    await this.host.app.fileManager.renameFile(file, path);
    this.currentNotePaths.set(jobId, path);
    if (this.jobs.get(jobId)?.createdNotePath) await this.trackCreatedNote(jobId, path);
    const moved = this.host.app.vault.getAbstractFileByPath(path);
    if (!(moved instanceof TFile)) throw new Error("整理结果移动后无法在 Vault 中找到，请重新处理");
    return moved;
  }

  private resolveLiveNoteFile(jobId: string, file: TFile): TFile | undefined {
    const currentPath = this.currentNotePaths.get(jobId) ?? file.path;
    const current = this.host.app.vault.getAbstractFileByPath(currentPath);
    return current instanceof TFile ? current : undefined;
  }

  private async verifyCompletedCapture(jobId: string, file: TFile, expectedContent: string): Promise<TFile> {
    const current = this.resolveLiveNoteFile(jobId, file);
    if (!current) throw new Error("整理结果未实际写入 Vault，任务已标记失败，请重新处理");
    const stored = await this.host.app.vault.read(current);
    if (!stored.trim()) throw new Error("整理结果文件为空，任务已标记失败，请重新处理");
    if (captureBodyForConflictCheck(stored) !== captureBodyForConflictCheck(expectedContent)) {
      throw new Error("整理结果回读校验失败，任务已标记失败，请重新处理");
    }
    return current;
  }

  private async renameArticleToTitle(file: TFile, title: string, jobId: string): Promise<TFile> {
    const baseName = safeCaptureFileName(title);
    if (!baseName || file.basename === baseName) return file;
    const folder = file.parent?.path && file.parent.path !== "/" ? file.parent.path : "";
    let path = normalizePath(folder ? `${folder}/${baseName}.md` : `${baseName}.md`);
    let suffix = 2;
    while (this.host.app.vault.getAbstractFileByPath(path)) {
      path = normalizePath(folder ? `${folder}/${baseName} ${suffix}.md` : `${baseName} ${suffix}.md`);
      suffix += 1;
    }
    await this.host.app.fileManager.renameFile(file, path);
    this.currentNotePaths.set(jobId, path);
    if (this.jobs.get(jobId)?.createdNotePath) await this.trackCreatedNote(jobId, path);
    const renamed = this.host.app.vault.getAbstractFileByPath(path);
    return renamed instanceof TFile ? renamed : file;
  }

  private async ytDlpSessionArgs(
    job: BrowserCaptureJob,
    directory: string,
    captureUrl: string,
  ): Promise<string[]> {
    const session = this.captureSessions.get(job.id);
    const saved = matchDomainSessionCookies(this.host.getSettings().browserCapture.savedDomainSessions, captureUrl);
    const cookies = session?.cookies?.length ? session.cookies : (saved?.cookies ?? []);
    const userAgent = session?.userAgent || saved?.userAgent || "";
    const referer = session?.referer || saved?.referer || captureUrl;
    const browserCookieSource = this.host.getSettings().browserCapture.browserCookieSource;

    const args: string[] = [];
    if (cookies.length) {
      const cookiePath = join(directory, "session-cookies.txt");
      await writeFile(cookiePath, serializeNetscapeCookies(cookies), { encoding: "utf8", mode: 0o600 });
      args.push("--cookies", cookiePath);
    } else if (browserCookieSource === "auto") {
      args.push("--cookies-from-browser", "chrome");
    } else if (browserCookieSource && browserCookieSource !== "extension" && browserCookieSource !== "disabled") {
      args.push("--cookies-from-browser", browserCookieSource);
    }
    if (userAgent) args.push("--user-agent", userAgent);
    if (referer) args.push("--referer", referer);
    return args;
  }

  private async probeCaptureTarget(job: BrowserCaptureJob): Promise<void> {
    try {
      const {
        finalUrl,
        contentType,
        contentDisposition,
        html,
      } = await probeCaptureResource(job.url);
      const pageType = classifyBrowserCaptureResource(job.url, {
        finalUrl,
        contentType,
        contentDisposition,
        html,
      });
      job.resolvedUrl = finalUrl;
      if (pageType !== job.pageType) {
        job.pageType = pageType;
        job.skillId = browserCaptureSkill(pageType).id;
      }
      if (pageType === "article" && html.length >= 80) {
        const errorShell = detectCaptureErrorShell({ html });
        if (errorShell) {
          const error = new Error(`${errorShell}。请在浏览器中打开有效内容或完成登录/验证后重试。`);
          error.name = "CaptureContentError";
          throw error;
        }
        try {
          const extracted = extractArticleFromHtml(html, job.title, finalUrl);
          const mediaCandidates = extractEmbeddedMediaCandidates(html, finalUrl);
          this.capturedSources.set(job.id, { ...extracted, embeddedMedia: mediaCandidates });
          const existing = this.captureSessions.get(job.id);
          if (mediaCandidates.length) {
            this.captureSessions.set(job.id, {
              cookies: existing?.cookies ?? [],
              userAgent: existing?.userAgent ?? "",
              referer: existing?.referer ?? finalUrl,
              mediaCandidates: Array.from(new Map([
                ...(existing?.mediaCandidates ?? []),
                ...mediaCandidates,
              ].map((candidate) => [candidate.url, candidate])).values()),
            });
          }
        } catch {
          // Dynamic and protected pages continue through Defuddle and browser-visible fallbacks.
        }
      }
      await this.updateJob(job.id, {
        resolvedUrl: job.resolvedUrl,
        pageType: job.pageType,
        skillId: job.skillId,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "CaptureContentError") throw error;
      // Redirect and metadata probing is best-effort; established extractors remain available.
    }
  }

  private articleDatePrefix(file: TFile, publishedAt?: string): string {
    const frontmatter = this.host.app.metadataCache.getFileCache(file)?.frontmatter;
    const candidates = [
      publishedAt,
      frontmatter?.["发布时间"],
      frontmatter?.created,
      frontmatter?.["创建时间"],
      frontmatter?.["采集时间"],
    ];
    for (const candidate of candidates) {
      if (candidate === undefined || candidate === null || String(candidate).trim() === "") continue;
      return captureDatePrefix(candidate, file.stat.ctime);
    }
    return captureDatePrefix("", file.stat.ctime);
  }

  private async localizeArticleImages(
    source: string,
    title: string,
    sourceUrl: string,
    sourceNotePath: string,
    jobId: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const matches = Array.from(source.matchAll(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/gi));
    if (!matches.length) return source;
    const localized = new Map<string, string>();
    for (let index = 0; index < matches.length; index += 1) {
      throwIfCaptureAborted(signal);
      const match = matches[index]!;
      const url = match[2]!;
      if (localized.has(url)) continue;
      try {
        let data: ArrayBuffer;
        let contentType = "";
        try {
          const response = await requestUrl({
            url,
            method: "GET",
            headers: {
              "User-Agent": "Mozilla/5.0 KnowGrove/2.4",
              Referer: sourceUrl,
              Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            },
            throw: false,
          });
          if (response.status < 200 || response.status >= 400 || response.arrayBuffer.byteLength === 0) {
            throw new Error(`图片下载失败（HTTP ${response.status}）`);
          }
          data = response.arrayBuffer;
          contentType = String(response.headers["content-type"] ?? "").toLowerCase();
        } catch {
          const downloaded = await downloadCaptureImage(url, sourceUrl);
          data = downloaded.data;
          contentType = downloaded.contentType;
        }
        const urlObject = new URL(url);
        const format = urlObject.searchParams.get("wx_fmt")?.toLowerCase();
        const extension = format === "jpeg" || format === "jpg"
          ? "jpg"
          : format === "png" || format === "gif" || format === "webp"
            ? format
            : contentType.includes("png")
              ? "png"
              : contentType.includes("gif")
                ? "gif"
                : contentType.includes("webp")
                  ? "webp"
                  : contentType.includes("svg")
                    ? "svg"
                    : "jpg";
        const hash = createHash("sha1").update(url).digest("hex").slice(0, 10);
        const titlePrefix = safeCaptureFileName(title).slice(0, 54);
        const fileName = `${titlePrefix}-${hash}.${extension}`;
        const path = normalizePath(await this.host.app.fileManager.getAvailablePathForAttachment(
          fileName,
          sourceNotePath,
        ));
        await this.ensureFolder(path.split("/").slice(0, -1).join("/"));
        await this.host.app.vault.createBinary(path, data);
        await this.trackCreatedAttachment(jobId, path);
        const alt = match[1]?.trim();
        const assetFile = this.host.app.vault.getFileByPath(path);
        if (!(assetFile instanceof TFile)) throw new Error(`图片已写入但无法读取：${path}`);
        const alias = alt && alt !== "图片" ? alt : undefined;
        const portablePath = portableSiblingAssetLinkPath(assetFile.path, sourceNotePath);
        const link = portablePath
          ? `[[${portablePath}${alias ? `|${alias}` : ""}]]`
          : this.host.app.fileManager.generateMarkdownLink(assetFile, sourceNotePath, undefined, alias);
        localized.set(url, `!${link}`);
      } catch (error) {
        if (isCaptureAbort(error, signal)) throw error;
        // A single protected image must not make the entire article fail.
      }
    }
    return source.replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/gi, (markdown, _alt, url) => {
      return localized.get(String(url)) ?? markdown;
    });
  }

  private async saveMediaFile(
    sourcePath: string,
    title: string,
    extension: string,
    sourceNotePath: string,
    jobId: string,
  ): Promise<string> {
    const baseName = safeCaptureFileName(title);
    const path = normalizePath(await this.host.app.fileManager.getAvailablePathForAttachment(
      `${baseName}.${extension}`,
      sourceNotePath,
    ));
    await this.ensureFolder(path.split("/").slice(0, -1).join("/"));
    const buffer = await readFile(sourcePath);
    const data = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    await this.host.app.vault.createBinary(path, data);
    await this.trackCreatedAttachment(jobId, path);
    return path;
  }

  private resultFor(
    job: BrowserCaptureJob,
    file: TFile,
    title: string,
    preview: string,
    storageVerified = false,
  ): NonNullable<BrowserCaptureJob["result"]> {
    return {
      title,
      relativePath: file.path,
      obsidianUri: `obsidian://open?vault=${encodeURIComponent(this.host.app.vault.getName())}&file=${encodeURIComponent(file.path)}`,
      preview,
      pageType: job.pageType,
      skillId: job.skillId,
      providerId: job.providerId,
      storageVerified,
      ...(storageVerified ? { verifiedAt: new Date().toISOString() } : {}),
    };
  }

  private async extractArticle(job: BrowserCaptureJob, signal?: AbortSignal): Promise<ExtractedSource> {
    throwIfCaptureAborted(signal);
    const captureUrl = job.resolvedUrl || job.url;
    let fetched: ExtractedSource | undefined;
    let primaryError: unknown;
    try {
      const response = await requestUrl({
        url: captureUrl,
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 KnowGrove/2.3",
          Accept: "text/html,application/xhtml+xml",
        },
        throw: false,
      });
      if (response.status < 200 || response.status >= 400) {
        throw new Error(`网页读取失败（HTTP ${response.status}）`);
      }
      const errorShell = detectCaptureErrorShell({ html: response.text });
      if (errorShell) throw new Error(`${errorShell}。请在浏览器中打开有效内容或完成登录/验证后重试。`);
      fetched = {
        ...extractArticleFromHtml(response.text, job.title, captureUrl),
        embeddedMedia: extractEmbeddedMediaCandidates(response.text, captureUrl),
      };
    } catch (error) {
      primaryError = error;
    }
    try {
      const executable = await resolveCaptureTool(
        this.host.getSettings().browserCapture.defuddlePath,
        "defuddle",
        "Defuddle",
      );
      const result = await runLocalCommand(executable, ["parse", captureUrl, "--md"], "", 5 * 60, signal);
      if (result.exitCode !== 0 || result.stdout.trim().length < 80) {
        if (fetched) return fetched;
        const browserCopy = this.capturedSources.get(job.id);
        if (browserCopy) return browserCopy;
        throw primaryError instanceof Error ? primaryError : new Error("网页正文提取失败");
      }
      let title = fetched?.title || "";
      if (!title || title === job.title) {
        const titleResult = await runLocalCommand(executable, ["parse", captureUrl, "-p", "title"], "", 90, signal);
        if (titleResult.exitCode === 0 && titleResult.stdout.trim()) title = titleResult.stdout.trim();
      }
      let author = fetched?.author;
      if (!author) {
        const authorResult = await runLocalCommand(executable, ["parse", captureUrl, "-p", "author"], "", 90, signal);
        if (authorResult.exitCode === 0 && authorResult.stdout.trim()) author = authorResult.stdout.trim();
      }
      return {
        ...fetched,
        title: title || job.title || "未命名网页",
        author,
        source: result.stdout.trim(),
        embeddedMedia: fetched?.embeddedMedia ?? this.captureSessions.get(job.id)?.mediaCandidates ?? [],
      };
    } catch (error) {
      if (isCaptureAbort(error, signal)) throw error;
      if (fetched) return fetched;
      const browserCopy = this.capturedSources.get(job.id);
      if (browserCopy) return browserCopy;
      throw primaryError instanceof Error ? primaryError : new Error("网页正文提取失败");
    }
  }

  private async appendEmbeddedMediaTranscripts(
    job: BrowserCaptureJob,
    sourceNotePath: string,
    articleSource: string,
    candidates: BrowserCaptureMediaCandidate[],
    signal?: AbortSignal,
  ): Promise<string> {
    const unique = candidates
      .filter((candidate) => !sameCaptureResourceUrl(candidate.url, job.url))
      .filter((candidate, index, all) => all.findIndex((item) => sameCaptureResourceUrl(item.url, candidate.url)) === index)
      .slice(0, 3);
    if (!unique.length) return articleSource;
    const sections: string[] = [];
    for (let index = 0; index < unique.length; index += 1) {
      throwIfCaptureAborted(signal);
      const candidate = unique[index]!;
      await this.updateJob(job.id, {
        progress: 24 + Math.round(((index + 1) / unique.length) * 18),
        message: `正在解析文章内嵌媒体 ${index + 1}/${unique.length}`,
      });
      try {
        const result = candidate.pageType === "video"
          ? await this.extractVideo(job, signal, undefined, candidate.url)
          : await this.extractAudio(job, sourceNotePath, signal, undefined, candidate.url, false);
        sections.push([
          `### ${result.title || candidate.label || (candidate.pageType === "video" ? "内嵌视频" : "内嵌音频")}`,
          "",
          candidate.url,
          "",
          result.source,
        ].join("\n"));
      } catch (error) {
        if (isCaptureAbort(error, signal)) throw error;
        const message = error instanceof Error ? error.message : String(error);
        sections.push([
          `### ${candidate.label || (candidate.pageType === "video" ? "内嵌视频" : "内嵌音频")}`,
          "",
          candidate.url,
          "",
          `> 暂未完成转录：${message}`,
        ].join("\n"));
      }
    }
    return [articleSource.trim(), "## 内嵌媒体", sections.join("\n\n")]
      .filter(Boolean)
      .join("\n\n");
  }

  private async extractVideo(
    job: BrowserCaptureJob,
    signal?: AbortSignal,
    outputLocale?: KnowGroveLocale,
    urlOverride?: string,
  ): Promise<ExtractedSource> {
    throwIfCaptureAborted(signal);
    const captureUrl = urlOverride || job.resolvedUrl || job.url;
    const settings = this.host.getSettings().browserCapture;
    const downloader = await resolveCaptureTool(settings.videoDownloaderPath, "yt-dlp", "yt-dlp");
    const directory = await mkdtemp(join(tmpdir(), "knowgrove-video-"));
    try {
      const sessionArgs = await this.ytDlpSessionArgs(job, directory, captureUrl);
      let resolvedTitle = job.title;
      let audioReady = false;

      // Platform specialized metadata resolution
      if (isTencentVideoUrl(captureUrl)) {
        const vid = extractTencentVideoVid(captureUrl);
        if (vid) {
          try {
            const vinfo = await requestUrl({
              url: `https://node.video.qq.com/x/api/float_vinfo2?cid=&vid=${vid}`,
              headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
            });
            const data = vinfo.json as { c?: { title?: string } };
            if (data.c?.title) {
              resolvedTitle = data.c.title.trim();
            }
          } catch {
            // Best-effort
          }
        }
      } else if (isXiguaCaptureUrl(captureUrl)) {
        try {
          const match = captureUrl.match(/(?:video\/|\/)([0-9]+)/);
          const xiguaId = match?.[1];
          if (xiguaId) {
            const res = await requestUrl({
              url: `https://m.ixigua.com/video/${xiguaId}`,
              headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15" },
            });
            const parsedXigua = parseXiguaHtml(res.text);
            if (parsedXigua?.title) {
              resolvedTitle = parsedXigua.title;
            }
          }
        } catch {
          // Best-effort
        }
      } else if (isVimeoCaptureUrl(captureUrl)) {
        const vimeoId = extractVimeoVideoId(captureUrl);
        if (vimeoId) {
          try {
            const vimeoRes = await requestUrl({
              url: `https://player.vimeo.com/video/${vimeoId}/config`,
              headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                "Referer": "https://vimeo.com/",
              },
            });
            const vimeoData = vimeoRes.json as {
              video?: { title?: string };
              request?: {
                files?: {
                  progressive?: Array<{ url: string; quality: string }>;
                  hls?: { default_cdn?: string; cdns?: Record<string, { url: string }> };
                };
              };
            };
            if (vimeoData.video?.title) {
              resolvedTitle = vimeoData.video.title;
            }
            const prog = vimeoData.request?.files?.progressive;
            const hls = vimeoData.request?.files?.hls;
            const streamUrl = prog?.[0]?.url
              || (hls?.default_cdn && hls.cdns?.[hls.default_cdn]?.url)
              || Object.values(hls?.cdns ?? {})[0]?.url;
            if (streamUrl) {
              const ffmpeg = await resolveCaptureTool(settings.ffmpegPath, "ffmpeg", "ffmpeg");
              const audioPath = join(directory, "audio.mp3");
              const ffmpegRes = await runLocalCommand(
                ffmpeg,
                ["-y", "-headers", "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36\r\nReferer: https://vimeo.com/\r\n", "-i", streamUrl, "-vn", "-acodec", "libmp3lame", "-q:a", "2", audioPath],
                "",
                10 * 60,
                signal,
              );
              if (ffmpegRes.exitCode === 0) {
                audioReady = true;
              }
            }
          } catch {
            // Fallback to yt-dlp
          }
        }
      } else if (isTikTokCaptureUrl(captureUrl)) {
        try {
          const tiktokRes = await requestUrl({
            url: captureUrl,
            headers: {
              "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
              "Referer": "https://www.tiktok.com/",
            },
          });
          const tiktokData = parseTikTokHtml(tiktokRes.text);
          if (tiktokData?.title) {
            resolvedTitle = tiktokData.title;
          }
          const mediaUrl = tiktokData?.audioUrl || tiktokData?.playUrl;
          if (mediaUrl) {
            const ffmpeg = await resolveCaptureTool(settings.ffmpegPath, "ffmpeg", "ffmpeg");
            const audioPath = join(directory, "audio.mp3");
            const ffmpegRes = await runLocalCommand(
              ffmpeg,
              ["-y", "-headers", "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36\r\nReferer: https://www.tiktok.com/\r\n", "-i", mediaUrl, "-vn", "-acodec", "libmp3lame", "-q:a", "2", audioPath],
              "",
              10 * 60,
              signal,
            );
            if (ffmpegRes.exitCode === 0) {
              audioReady = true;
            }
          }
        } catch {
          // Fallback to yt-dlp
        }
      }

      if (!resolvedTitle || resolvedTitle === job.title) {
        const titleResult = await runLocalCommand(
          downloader,
          [...ytDlpCaptureArgs(captureUrl), ...sessionArgs, "--skip-download", "--print", "%(title)s", captureUrl],
          "",
          90,
          signal,
        );
        if (titleResult.exitCode === 0 && lastLine(titleResult.stdout)) {
          resolvedTitle = lastLine(titleResult.stdout);
        }
      }
      const title = resolvedTitle || job.title;

      await runLocalCommand(
        downloader,
        [
          ...ytDlpSubtitleArgs(join(directory, "source.%(ext)s"), captureUrl).slice(0, -1),
          ...sessionArgs,
          captureUrl,
        ],
        "",
        15 * 60,
        signal,
      );
      const subtitleFile = selectPreferredSubtitleFile(await readdir(directory));
      if (subtitleFile) {
        const transcript = parseSubtitleText(
          await readFile(join(directory, subtitleFile), "utf8"),
          subtitleFile,
        );
        if (transcript) return { title: title || "未命名视频", source: transcript };
      }
      // A subtitle lookup can fail even when the public audio remains downloadable.
      // Continue to the local transcription fallback instead of requiring a manual path.
      if (!audioReady) {
        await this.updateJob(job.id, {
          progress: 28,
          message: "没有找到可用字幕，正在下载音频",
        });
        const downloadUrls = [
          captureUrl,
          ...(this.captureSessions.get(job.id)?.mediaCandidates ?? [])
            .filter((candidate) => candidate.pageType === "video")
            .map((candidate) => candidate.url),
        ].filter((url, index, all) => all.findIndex((candidate) => sameCaptureResourceUrl(candidate, url)) === index);
        let audioResult: Awaited<ReturnType<typeof runLocalCommand>> | undefined;
        for (const downloadUrl of downloadUrls) {
          audioResult = await runLocalCommand(
            downloader,
            [
              ...ytDlpCaptureArgs(downloadUrl),
              ...sessionArgs,
              ...ffmpegLocationArgs(settings),
              "-x",
              "--audio-format",
              "mp3",
              "-o",
              join(directory, "audio.%(ext)s"),
              downloadUrl,
            ],
            "",
            60 * 60,
            signal,
          );
          if (audioResult.exitCode === 0) {
            audioReady = true;
            break;
          }
        }
        if (!audioReady) {
          if (isInstagramCaptureUrl(captureUrl)) {
            const videoResult = await runLocalCommand(
              downloader,
              [
                ...ytDlpCaptureArgs(captureUrl),
                ...sessionArgs,
                "--skip-download",
                "--print",
                "%(description)s",
                captureUrl,
              ],
              "",
              60,
              signal,
            );
            const desc = videoResult.exitCode === 0 ? videoResult.stdout.trim() : "";
            return {
              title: title || "Instagram 视频",
              source: [
                desc ? `## 动态文案\n\n${desc}` : "",
                "> 注：该视频无独立音轨，已提取视频文案与基础信息并整理入库。",
              ].filter(Boolean).join("\n\n"),
            };
          }
          throw new Error(formatYtDlpCaptureError(
            `${audioResult?.stderr ?? ""}\n${audioResult?.stdout ?? ""}`,
            captureUrl,
          ));
        }
      }
      const audioFile = (await readdir(directory)).find((name) => /^audio\./.test(name));
      if (!audioFile) throw new Error("没有找到已下载的视频音频");
      await this.updateJob(job.id, {
        progress: 38,
        message: "正在检测本机 Whisper 转写工具",
      });
      const whisper = await resolveWhisperExecutable(settings.whisperPath);
      const implementation = detectWhisperImplementation(whisper);
      const model = settings.whisperModel.trim() || "small";
      const cppModelPath = implementation === "whisper-cpp"
        ? await resolveWhisperCppModel(model)
        : undefined;
      const invocation = buildWhisperInvocation({
        implementation,
        audioPath: join(directory, audioFile),
        outputDirectory: directory,
        model,
        cppModelPath,
        language: whisperLanguageFromLocale(outputLocale),
      });
      await this.updateJob(job.id, {
        progress: 40,
        message: implementation === "whisper-cpp"
          ? `正在使用 whisper.cpp ${model} 转录`
          : `正在使用 Whisper ${model} 转录`,
      });
      const whisperResult = await runLocalCommand(
        whisper,
        invocation.args,
        "",
        90 * 60,
        signal,
      );
      if (whisperResult.exitCode !== 0) {
        throw new Error(whisperResult.stderr.trim() || "Whisper 转录失败");
      }
      const { transcript } = await readWhisperTranscript(directory, invocation);
      return { title: title || "未命名视频", source: transcript };
    } finally {
      await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private isMatchingMediaPath(candidateMediaPath?: string, jobMediaPath?: string, sourceNotePath = ""): boolean {
    if (!candidateMediaPath && !jobMediaPath) return true;
    if (!candidateMediaPath || !jobMediaPath) return false;
    const cNorm = normalizePath(candidateMediaPath.trim()).replace(/^\/+|\/+$/g, "");
    const jNorm = normalizePath(jobMediaPath.trim()).replace(/^\/+|\/+$/g, "");
    if (cNorm === jNorm) return true;
    const cBase = cNorm.split("/").pop() || cNorm;
    const jBase = jNorm.split("/").pop() || jNorm;
    if (cBase.toLowerCase() === jBase.toLowerCase()) return true;

    const file1 = this.host.app.metadataCache.getFirstLinkpathDest(cNorm, sourceNotePath)
      ?? this.host.app.vault.getAbstractFileByPath(cNorm);
    const file2 = this.host.app.metadataCache.getFirstLinkpathDest(jNorm, sourceNotePath)
      ?? this.host.app.vault.getAbstractFileByPath(jNorm);
    if (file1 instanceof TFile && file2 instanceof TFile && file1.path === file2.path) {
      return true;
    }
    return false;
  }

  private async extractLocalMedia(
    job: BrowserCaptureJob,
    sourceNotePath: string,
    signal?: AbortSignal,
    outputLocale?: KnowGroveLocale,
  ): Promise<ExtractedSource> {
    throwIfCaptureAborted(signal);
    const linkPath = job.mediaPath?.trim() ?? "";
    if (!linkPath) throw new Error("本地媒体笔记没有可用的音视频引用");
    const linked = this.host.app.metadataCache.getFirstLinkpathDest(linkPath, sourceNotePath);
    const exact = this.host.app.vault.getAbstractFileByPath(normalizePath(linkPath));
    const base = linkPath.split("/").pop() || linkPath;
    const byBase = this.host.app.metadataCache.getFirstLinkpathDest(base, sourceNotePath)
      ?? this.host.app.vault.getFiles().find((f) => f.name === base && LOCAL_MEDIA_EXTENSION.test(f.path));
    const mediaFile = linked instanceof TFile
      ? linked
      : exact instanceof TFile
        ? exact
        : byBase instanceof TFile
          ? byBase
          : undefined;
    if (!mediaFile || !LOCAL_MEDIA_EXTENSION.test(mediaFile.path)) {
      throw new Error(`找不到本地音视频文件：${linkPath}`);
    }

    const sourceNote = this.host.app.vault.getAbstractFileByPath(sourceNotePath);
    const sourceMarkdown = sourceNote instanceof TFile
      ? await this.host.app.vault.read(sourceNote)
      : "";
    const markerData = parseRecordingMarkers(sourceMarkdown);
    if (markerData?.diagnostics.length) {
      console.warn(`KnowGrove: recording marker diagnostics for ${sourceNotePath}`, markerData.diagnostics);
    }

    const settings = this.host.getSettings().browserCapture;
    const directory = await mkdtemp(join(tmpdir(), "knowgrove-local-audio-"));
    try {
      const extension = extname(mediaFile.name) || ".m4a";
      const adapter = this.host.app.vault.adapter;
      let audioPath: string;
      if (adapter instanceof FileSystemAdapter) {
        audioPath = adapter.getFullPath(mediaFile.path);
      } else {
        audioPath = join(directory, `source${extension}`);
        const audio = await this.host.app.vault.readBinary(mediaFile);
        await writeFile(audioPath, Buffer.from(audio));
      }
      await this.updateJob(job.id, {
        progress: 30,
        message: "已读取本地媒体，正在检测本机 Whisper",
      });
      const whisper = await resolveWhisperExecutable(settings.whisperPath);
      const implementation = detectWhisperImplementation(whisper);
      const model = settings.whisperModel.trim() || "small";
      const cppModelPath = implementation === "whisper-cpp"
        ? await resolveWhisperCppModel(model)
        : undefined;
      let whisperAudioPath = audioPath;
      if (whisperNeedsPcmConversion(implementation, audioPath)) {
        const ffmpeg = await resolveCaptureTool(settings.ffmpegPath, "ffmpeg", "FFmpeg");
        whisperAudioPath = join(directory, "whisper-input.wav");
        await this.updateJob(job.id, {
          progress: 34,
          message: "正在提取 Whisper 可读取的音轨",
        });
        const conversion = await runLocalCommand(
          ffmpeg,
          buildWhisperPcmConversionArgs(audioPath, whisperAudioPath),
          "",
          20 * 60,
          signal,
        );
        if (conversion.exitCode !== 0) {
          throw new Error(conversion.stderr.trim() || "本地媒体音轨转换失败");
        }
      }
      const invocation = buildWhisperInvocation({
        implementation,
        audioPath: whisperAudioPath,
        outputDirectory: directory,
        model,
        cppModelPath,
        language: whisperLanguageFromLocale(outputLocale),
      });
      await this.updateJob(job.id, {
        progress: 38,
        message: implementation === "whisper-cpp"
          ? `正在使用 whisper.cpp ${model} 转录本地媒体`
          : `正在使用 Whisper ${model} 转录本地媒体`,
      });
      const whisperResult = await runLocalCommand(whisper, invocation.args, "", 90 * 60, signal);
      if (whisperResult.exitCode !== 0) {
        throw new Error(whisperResult.stderr.trim() || "Whisper 转录失败");
      }
      const { transcript, segments } = await readWhisperTranscript(directory, invocation);
      const alignedMarkers = alignRecordingMarkers(markerData?.markers ?? [], segments);
      const markerSection = renderAlignedRecordingMarkers(
        alignedMarkers,
        recordingMarkerHeading(outputLocale ?? "zh-CN"),
      );
      return {
        title: job.title || mediaFile.basename || (job.pageType === "video" ? "视频记录" : "语音记录"),
        source: [markerSection, transcript].filter(Boolean).join("\n\n"),
        recordingMarkerBlock: markerData?.rawBlock,
        mediaPath: mediaFile.path,
      };
    } finally {
      await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async extractAudio(
    job: BrowserCaptureJob,
    sourceNotePath: string,
    signal?: AbortSignal,
    outputLocale?: KnowGroveLocale,
    urlOverride?: string,
    saveOriginal = true,
  ): Promise<ExtractedSource> {
    throwIfCaptureAborted(signal);
    const captureUrl = urlOverride || job.resolvedUrl || job.url;
    const settings = this.host.getSettings().browserCapture;
    const downloader = await resolveCaptureTool(settings.videoDownloaderPath, "yt-dlp", "yt-dlp");
    const directory = await mkdtemp(join(tmpdir(), "knowgrove-audio-"));
    try {
      const appleEpisode = await this.resolveApplePodcastEpisode(captureUrl, signal);
      const sessionArgs = await this.ytDlpSessionArgs(job, directory, captureUrl);
      const titleResult = await runLocalCommand(
        downloader,
        [...ytDlpCaptureArgs(captureUrl), ...sessionArgs, "--skip-download", "--print", "%(title)s", captureUrl],
        "",
        90,
        signal,
      );
      const title = appleEpisode?.title || (titleResult.exitCode === 0
        ? lastLine(titleResult.stdout) || job.title
        : job.title);
      await runLocalCommand(
        downloader,
        [
          ...ytDlpSubtitleArgs(join(directory, "source.%(ext)s"), captureUrl).slice(0, -1),
          ...sessionArgs,
          captureUrl,
        ],
        "",
        15 * 60,
        signal,
      );
      const subtitleFile = selectPreferredSubtitleFile(await readdir(directory));
      if (subtitleFile) {
        const transcript = parseSubtitleText(
          await readFile(join(directory, subtitleFile), "utf8"),
          subtitleFile,
        );
        if (transcript) return {
          title: title || "未命名音频",
          source: transcript,
        };
      }
      await this.updateJob(job.id, {
        progress: 28,
        message: "没有找到可用字幕，正在下载音频并转录",
      });
      const downloadUrls = [
        appleEpisode?.mediaUrl ?? "",
        captureUrl,
        ...(this.captureSessions.get(job.id)?.mediaCandidates ?? [])
          .filter((candidate) => candidate.pageType === "audio")
          .map((candidate) => candidate.url),
      ].filter(Boolean)
        .filter((url, index, all) => all.findIndex((candidate) => sameCaptureResourceUrl(candidate, url)) === index);
      let audioResult: Awaited<ReturnType<typeof runLocalCommand>> | undefined;
      for (const downloadUrl of downloadUrls) {
        audioResult = await runLocalCommand(
          downloader,
          [
            ...ytDlpCaptureArgs(downloadUrl),
            ...sessionArgs,
            ...ffmpegLocationArgs(settings),
            "-x",
            "--audio-format",
            "m4a",
            "-o",
            join(directory, "audio.%(ext)s"),
            downloadUrl,
          ],
          "",
          60 * 60,
          signal,
        );
        if (audioResult.exitCode === 0) break;
      }
      if (!audioResult || audioResult.exitCode !== 0) {
        throw new Error(formatYtDlpCaptureError(
          `${audioResult?.stderr ?? ""}\n${audioResult?.stdout ?? ""}`,
          captureUrl,
        ));
      }
      const audioFile = (await readdir(directory)).find((name) => /^audio\./.test(name));
      if (!audioFile) throw new Error("没有找到已下载的音频文件");
      const audioPath = join(directory, audioFile);
      const mediaPath = saveOriginal
        ? await this.saveMediaFile(
          audioPath,
          title || job.title || "未命名音频",
          extname(audioFile).replace(/^\./, "") || "m4a",
          sourceNotePath,
          job.id,
        )
        : undefined;
      await this.updateJob(job.id, {
        progress: 34,
        message: "音频已经保存，正在检测本机 Whisper",
      });
      const whisper = await resolveWhisperExecutable(settings.whisperPath);
      const implementation = detectWhisperImplementation(whisper);
      const model = settings.whisperModel.trim() || "small";
      const cppModelPath = implementation === "whisper-cpp"
        ? await resolveWhisperCppModel(model)
        : undefined;
      let whisperAudioPath = audioPath;
      if (whisperNeedsPcmConversion(implementation, audioPath)) {
        const ffmpeg = await resolveCaptureTool(settings.ffmpegPath, "ffmpeg", "FFmpeg");
        whisperAudioPath = join(directory, "whisper-input.wav");
        await this.updateJob(job.id, {
          progress: 36,
          message: "正在转换为 Whisper 可读取的音轨",
        });
        const conversion = await runLocalCommand(
          ffmpeg,
          buildWhisperPcmConversionArgs(audioPath, whisperAudioPath),
          "",
          20 * 60,
          signal,
        );
        if (conversion.exitCode !== 0) {
          throw new Error(conversion.stderr.trim() || "远程音频音轨转换失败");
        }
      }
      const invocation = buildWhisperInvocation({
        implementation,
        audioPath: whisperAudioPath,
        outputDirectory: directory,
        model,
        cppModelPath,
        language: whisperLanguageFromLocale(outputLocale),
      });
      const whisperResult = await runLocalCommand(whisper, invocation.args, "", 90 * 60, signal);
      if (whisperResult.exitCode !== 0) {
        throw new Error(whisperResult.stderr.trim() || "Whisper 转录失败");
      }
      const { transcript } = await readWhisperTranscript(directory, invocation);
      return {
        title: title || job.title || "未命名音频",
        source: transcript,
        ...(mediaPath ? { mediaPath } : {}),
      };
    } finally {
      await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async resolveApplePodcastEpisode(
    captureUrl: string,
    signal?: AbortSignal,
  ): Promise<ApplePodcastEpisode | undefined> {
    let showId = "";
    try {
      const parsed = new URL(captureUrl);
      if (parsed.hostname.toLowerCase() !== "podcasts.apple.com") return undefined;
      showId = parsed.pathname.match(/\/id(\d+)/i)?.[1] ?? "";
    } catch {
      return undefined;
    }
    if (!showId) return undefined;
    throwIfCaptureAborted(signal);
    try {
      const response = await requestUrl({
        url: `https://itunes.apple.com/lookup?id=${encodeURIComponent(showId)}&entity=podcastEpisode&limit=200`,
        method: "GET",
        throw: false,
      });
      if (response.status < 200 || response.status >= 400) return undefined;
      const payload = response.json as { results?: unknown[] };
      const results = Array.isArray(payload.results)
        ? payload.results.flatMap((raw) => {
          if (!raw || typeof raw !== "object") return [];
          const item = raw as Record<string, unknown>;
          const trackId = typeof item.trackId === "number" ? item.trackId : undefined;
          return [{
            wrapperType: stringField(item.wrapperType),
            kind: stringField(item.kind),
            trackId,
            trackName: stringField(item.trackName),
            episodeUrl: stringField(item.episodeUrl),
          }];
        })
        : [];
      return selectApplePodcastEpisode(
        captureUrl,
        results,
      );
    } catch {
      return undefined;
    }
  }

  private async runAI(
    job: BrowserCaptureJob,
    title: string,
    source: string,
    outputLocale: KnowGroveLocale,
    signal: AbortSignal,
    onProgress: (message: string, progress: number) => Promise<void>,
  ): Promise<BrowserCaptureAIResult> {
    throwIfCaptureAborted(signal);
    const protectedArticle = job.pageType === "article"
      ? protectArticleImages(source.slice(0, MAX_SOURCE_CHARACTERS))
      : { source: source.slice(0, MAX_SOURCE_CHARACTERS), images: [] };
    const chunks = splitBrowserCaptureText(protectedArticle.source);
    if (!chunks.length) throw new Error("没有可供 AI 整理的正文");
    const skillInstruction = await this.host.getSkillInstruction(job.pageType);
    const withSkillInstruction = (prompt: string): string => skillInstruction
      ? `${prompt}\n\nKnowGrove 当前技能补充要求：\n${skillInstruction}`
      : prompt;
    if (chunks.length === 1) {
      await onProgress("正在生成摘要、要点和整理正文", 72);
      const output = await this.runProviderForJob(
        job,
        withSkillInstruction(browserCapturePrompt(job.pageType, title, chunks[0]!, outputLocale)),
        signal,
      );
      const result = normalizeBrowserCaptureAIResult(extractJsonObject(output), job.pageType);
      return job.pageType === "article"
        ? { ...result, bodyMarkdown: restoreArticleImages(result.bodyMarkdown, protectedArticle.images) }
        : result;
    }
    const partials: BrowserCaptureAIResult[] = [];
    for (let index = 0; index < chunks.length; index += 1) {
      await onProgress(
        `长内容分段整理中：${index + 1}/${chunks.length}`,
        55 + Math.round(((index + 1) / chunks.length) * 30),
      );
      const output = await this.runProviderForJob(
        job,
        withSkillInstruction(
          browserCaptureChunkPrompt(job.pageType, title, chunks[index]!, index + 1, chunks.length, outputLocale),
        ),
        signal,
      );
      partials.push(normalizeBrowserCaptureAIResult(extractJsonObject(output), job.pageType));
    }
    await onProgress("正在合并各段摘要与核心要点", 88);
    const output = await this.runProviderForJob(
      job,
      withSkillInstruction(browserCaptureSynthesisPrompt(job.pageType, title, partials, outputLocale)),
      signal,
    );
    const synthesis = normalizeBrowserCaptureAIResult(extractJsonObject(output), job.pageType);
    const merged = {
      ...synthesis,
      bodyMarkdown: partials.map((item) => item.bodyMarkdown).join("\n\n").replace(/\n{3,}/g, "\n\n"),
    };
    return job.pageType === "article"
      ? { ...merged, bodyMarkdown: restoreArticleImages(merged.bodyMarkdown, protectedArticle.images) }
      : merged;
  }

  private async runProviderForJob(
    job: BrowserCaptureJob,
    prompt: string,
    signal: AbortSignal,
  ): Promise<string> {
    const result = await this.host.runProvider(job.providerId, prompt, signal);
    if (result.providerId !== job.providerId) {
      job.providerId = result.providerId;
      await this.updateJob(job.id, {
        providerId: result.providerId,
        message: "已切换到新的处理引擎，正在继续整理",
      });
    }
    return result.output;
  }
}
