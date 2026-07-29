import { Platform, TFile, normalizePath, requestUrl, type App } from "obsidian";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type {
  AIProviderAvailability,
  AIProviderId,
  BrowserCaptureSettings,
  KnowGroveSettings,
} from "./types";
import { runLocalCommand } from "./ai-provider";
import {
  BROWSER_CAPTURE_SKILLS,
  browserCaptureChunkPrompt,
  browserCapturePrompt,
  browserCaptureSkill,
  browserCaptureSynthesisPrompt,
  buildWhisperInvocation,
  buildCaptureFailureNote,
  buildEnhancedCaptureNote,
  buildRawCaptureNote,
  articleCaptureTitle,
  captureDatePrefix,
  classifyBrowserCaptureUrl,
  detectInterruptedCapture,
  detectLinkNoteCandidate,
  detectWhisperImplementation,
  cleanArticleMarkdown,
  extractArticleFromHtml,
  extractJsonObject,
  formatYtDlpCaptureError,
  formatTranscriptParagraphs,
  normalizeBrowserCaptureAIResult,
  parseSubtitleText,
  protectArticleImages,
  restoreArticleImages,
  safeCaptureFileName,
  selectPreferredSubtitleFile,
  selectedCaptureProvider,
  splitBrowserCaptureText,
  stripCaptureFrontmatter,
  ytDlpCaptureArgs,
  ytDlpSubtitleArgs,
  type BrowserCaptureAIResult,
  type BrowserCapturePageType,
} from "./browser-capture-core";

export type BrowserCaptureJobStatus = "queued" | "running" | "completed" | "partial" | "failed";

export interface BrowserCaptureJob {
  id: string;
  url: string;
  title: string;
  pageType: BrowserCapturePageType;
  skillId: string;
  providerId: AIProviderId;
  source: string;
  targetPath?: string;
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
  };
  resumeFromRaw?: boolean;
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
  runProvider(provider: AIProviderId, prompt: string): Promise<string>;
  getSkillInstruction(pageType: BrowserCapturePageType): Promise<string>;
  suppressNewNoteInitialization(path: string): void;
}

interface ExtractedSource {
  title: string;
  source: string;
  author?: string;
  publishedAt?: string;
  mediaPath?: string;
}

const HOST = "127.0.0.1";
const JOBS_PATH = ".obsidian/plugins/knowgrove/browser-capture-jobs.json";
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
};

function randomHex(bytes = 32): string {
  const buffer = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buffer);
  return Array.from(buffer, (value) => value.toString(16).padStart(2, "0")).join("");
}

function isAllowedOrigin(origin: string): boolean {
  // Chromium omits Origin for extension fetches covered by host_permissions.
  // Web pages do send Origin, so they still must match an extension scheme.
  return origin === ""
    || /^(chrome-extension|safari-web-extension|moz-extension):\/\/[a-z0-9.-]+$/i.test(origin);
}

function isWebUrl(value: unknown): string {
  const parsed = new URL(String(value ?? ""));
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("只支持 http 或 https 网页");
  return parsed.toString();
}

function compact(value: string, maxLength = 260): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

async function downloadCaptureImage(url: string, referer: string, redirects = 0): Promise<{
  data: ArrayBuffer;
  contentType: string;
}> {
  if (redirects > 5) throw new Error("图片重定向次数过多");
  const parsed = new URL(url);
  const client = parsed.protocol === "https:"
    ? require("node:https") as typeof import("node:https")
    : require("node:http") as typeof import("node:http");
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
        ) as ArrayBuffer;
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

function sameToken(expected: string, actual: unknown): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(String(actual ?? ""));
  if (left.length !== right.length) return false;
  const { timingSafeEqual } = require("node:crypto") as typeof import("node:crypto");
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
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
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

function captureBodyForConflictCheck(content: string): string {
  return stripCaptureFrontmatter(content).replace(
    /!\[\[([^\]|]+)(\|[^\]]+)?\]\]/g,
    (_embed, target, alias = "") => {
      const baseName = String(target).split("/").at(-1) ?? String(target);
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
  const { homedir } = require("node:os") as typeof import("node:os");
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
      const result = await runLocalCommand(candidate, ["--version"], "", 8);
      if (result.exitCode === 0) return candidate;
    } catch {
      // Try the next explicit path without invoking a shell.
    }
  }
  if (configured) throw new Error(`${label} 路径不可用：${configured}`);
  throw new Error(`未检测到 ${label}。请安装后重试，或在 KnowGrove 设置中填写完整路径`);
}

async function resolveWhisperCppModel(modelSetting: string): Promise<string> {
  const { access } = require("node:fs/promises") as typeof import("node:fs/promises");
  const { homedir } = require("node:os") as typeof import("node:os");
  const { join } = require("node:path") as typeof import("node:path");
  const home = homedir();
  const raw = modelSetting.trim() || "small";
  const expanded = raw === "~"
    ? home
    : raw.startsWith("~/")
      ? join(home, raw.slice(2))
      : raw;
  const isPath = expanded.includes("/") || expanded.includes("\\");
  const fileName = raw.endsWith(".bin") ? raw.split(/[\\/]/).at(-1)! : `ggml-${raw}.bin`;
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
  private readonly pendingPairings = new Map<string, PendingPairing>();
  private readonly queue: string[] = [];
  private processing = false;
  private stopping = false;

  constructor(private readonly host: BrowserCaptureHost) {}

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
    const { createServer } = require("node:http") as typeof import("node:http");
    this.server = createServer((request, response) => {
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
      job.targetPath === file.path && !FINISHED_STATUSES.has(job.status),
    );
    if (existing) return existing;
    const url = candidate?.url ?? interrupted!.url;
    const pageType = interrupted?.pageType ?? classifyBrowserCaptureUrl(url);
    const providerId = selectedCaptureProvider(this.host.getSettings().aiProperties.provider, pageType);
    const job = await this.createJob({
      url,
      title: candidate?.title ?? interrupted!.title,
      pageType,
      providerId,
      source: `link-note-${source}${interrupted ? "-resume" : ""}`,
      targetPath: file.path,
      resumeFromRaw: Boolean(interrupted),
    });
    this.queue.push(job.id);
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
      const pageType = classifyBrowserCaptureUrl(url);
      const providerId = selectedCaptureProvider(allSettings.aiProperties.provider, pageType);
      const providers = await this.host.getProviders();
      const provider = providers.find((item) => item.id === providerId);
      if (!provider?.available) {
        sendJson(response, 409, {
          error: `${provider?.name ?? providerId} 当前不可用，请在“大模型配置”中重新选择`,
        }, origin);
        return;
      }
      const job = await this.createJob({
        url,
        title: String(body.title ?? "").slice(0, 500),
        pageType,
        providerId,
        source: String(body.source ?? "extension").slice(0, 80),
      });
      const browserContent = String(body.content ?? "").trim().slice(0, MAX_SOURCE_CHARACTERS);
      const browserTranscript = String(body.transcript ?? "").trim().slice(0, MAX_SOURCE_CHARACTERS);
      if (pageType === "article" && browserContent.length >= 80) {
        this.capturedSources.set(job.id, {
          title: String(body.contentTitle ?? body.title ?? "").trim().slice(0, 500) || job.title,
          source: browserContent,
          author: String(body.author ?? "").trim().slice(0, 500) || undefined,
          publishedAt: String(body.publishedAt ?? "").trim().slice(0, 200) || undefined,
        });
      } else if (pageType === "video" && browserTranscript.length >= 20) {
        this.capturedSources.set(job.id, {
          title: String(body.contentTitle ?? body.title ?? "").trim().slice(0, 500) || job.title,
          source: formatTranscriptParagraphs(browserTranscript),
        });
      }
      this.queue.push(job.id);
      void this.drainQueue();
      sendJson(response, 202, { jobId: job.id, status: job.status }, origin);
      return;
    }
    const jobMatch = requestUrl.pathname.match(/^\/v1\/jobs\/([a-f0-9-]+)$/i);
    if (request.method === "GET" && jobMatch) {
      const job = this.jobs.get(jobMatch[1]!);
      if (!job) {
        sendJson(response, 404, { error: "任务不存在或已过期" }, origin);
        return;
      }
      sendJson(response, 200, job, origin);
      return;
    }
    sendJson(response, 404, { error: "接口不存在" }, origin);
  }

  private async loadJobs(): Promise<void> {
    try {
      if (!(await this.host.app.vault.adapter.exists(JOBS_PATH))) return;
      const parsed = JSON.parse(await this.host.app.vault.adapter.read(JOBS_PATH)) as { jobs?: BrowserCaptureJob[] };
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
    await this.host.app.vault.adapter.write(JOBS_PATH, `${JSON.stringify({ jobs }, null, 2)}\n`);
  }

  private async createJob(payload: Pick<
    BrowserCaptureJob,
    "url" | "title" | "pageType" | "providerId" | "source" | "targetPath" | "resumeFromRaw"
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
    this.jobs.set(job.id, job);
    await this.persistJobs();
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
    return next;
  }

  private async drainQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      while (this.queue.length && !this.stopping) {
        const id = this.queue.shift();
        if (id) await this.processJob(id);
      }
    } finally {
      this.processing = false;
    }
  }

  private async processJob(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;
    let noteFile: TFile | undefined;
    let extracted: ExtractedSource | undefined;
    let lastWrittenContent = "";
    try {
      await this.updateJob(id, {
        status: "running",
        phase: "backing_up",
        phaseLabel: PHASE_LABELS.backing_up,
        progress: 5,
        message: "正在先把链接和标题写入 Vault",
      });
      noteFile = job.targetPath
        ? this.host.app.vault.getAbstractFileByPath(job.targetPath) instanceof TFile
          ? this.host.app.vault.getAbstractFileByPath(job.targetPath) as TFile
          : undefined
        : await this.createPlaceholder(job);
      if (!noteFile) throw new Error("待解析的链接笔记已经不存在");
      let interrupted: ReturnType<typeof detectInterruptedCapture> = null;
      if (job.targetPath) {
        const current = await this.host.app.vault.read(noteFile);
        if (job.resumeFromRaw) {
          interrupted = detectInterruptedCapture(current);
          if (!interrupted || interrupted.url !== job.url) {
            throw new Error("可恢复的原文或逐字稿已经变化，已停止自动覆盖");
          }
        } else {
          const candidate = detectLinkNoteCandidate(current, noteFile.basename);
          if (!candidate || candidate.url !== job.url) {
            throw new Error("笔记在排队期间已经补写正文或更换链接，已停止自动覆盖");
          }
        }
      }
      const relativePath = noteFile.path;
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
          ? this.capturedSources.get(id) ?? await this.extractVideo(job)
          : job.pageType === "audio"
            ? await this.extractAudio(job, noteFile.path)
            : this.capturedSources.get(id) ?? await this.extractArticle(job);
        this.capturedSources.delete(id);
        if (job.pageType === "article") {
          const sourceTitle = extracted.title;
          extracted.source = cleanArticleMarkdown(extracted.source, sourceTitle);
          extracted.title = articleCaptureTitle(
            sourceTitle,
            this.articleDatePrefix(noteFile, extracted.publishedAt),
            this.host.getSettings().browserCapture.prefixArticleTitleWithDate,
          );
          noteFile = await this.renameArticleToTitle(noteFile, extracted.title);
          extracted.source = await this.localizeArticleImages(
            extracted.source,
            extracted.title,
            job.url,
            noteFile.path,
          );
        }
        const rawNote = buildRawCaptureNote({
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
        });
        if (job.targetPath) {
          await this.host.app.fileManager.processFrontMatter(noteFile, (frontmatter) => {
            frontmatter["文件名"] = noteFile!.basename;
            frontmatter["标题"] = extracted!.title;
            if (!Object.prototype.hasOwnProperty.call(frontmatter, "来源")) frontmatter["来源"] = job.url;
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
      await this.updateJob(id, {
        title: extracted.title,
        phase: "backed_up",
        phaseLabel: PHASE_LABELS.backed_up,
        progress: 50,
        message: "原始内容已经写入 Vault，正在调用 AI 整理",
        result: this.resultFor(job, noteFile, extracted.title, "原始内容已备份"),
      });
      const ai = await this.runAI(job, extracted.title, extracted.source, async (message, progress) => {
        await this.updateJob(id, {
          phase: "organizing",
          phaseLabel: PHASE_LABELS.organizing,
          progress,
          message,
        });
      });
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
      const enhanced = buildEnhancedCaptureNote(lastWrittenContent, job.pageType, ai);
      const completedContent = latestContent === lastWrittenContent
        ? enhanced
        : replaceGeneratedFrontmatter(enhanced, latestContent);
      await this.host.app.vault.modify(noteFile, completedContent);
      if (latestContent !== lastWrittenContent) {
        await this.host.app.fileManager.processFrontMatter(noteFile, (frontmatter) => {
          frontmatter["KnowGrove采集状态"] = "已完成";
        });
      }
      noteFile = await this.moveToConfiguredOutput(noteFile, job.pageType);
      await this.updateJob(id, {
        status: "completed",
        phase: "completed",
        phaseLabel: PHASE_LABELS.completed,
        progress: 100,
        message: "内容已经整理并写入 Obsidian",
        completedAt: new Date().toISOString(),
        result: this.resultFor(job, noteFile, extracted.title, compact(ai.summary)),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (noteFile) {
        if (!extracted && !job.targetPath) {
          await this.host.app.vault.modify(noteFile, buildCaptureFailureNote({
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
            noteFile,
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
          message: "任务没有写入 Vault",
        });
      }
    } finally {
      this.capturedSources.delete(id);
    }
  }

  private async createPlaceholder(job: BrowserCaptureJob): Promise<TFile> {
    const settings = this.host.getSettings().browserCapture;
    const folder = normalizePath(settings.inboxFolder.trim() || this.host.getSettings().trackedFolder || "阅读列表")
      .replace(/^\/+|\/+$/g, "");
    await this.ensureFolder(folder);
    const baseName = safeCaptureFileName(job.title || new URL(job.url).hostname);
    let path = normalizePath(`${folder}/${baseName}.md`);
    let suffix = 2;
    while (this.host.app.vault.getAbstractFileByPath(path)) {
      path = normalizePath(`${folder}/${baseName} ${suffix}.md`);
      suffix += 1;
    }
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

  private async moveToConfiguredOutput(file: TFile, pageType: BrowserCapturePageType): Promise<TFile> {
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
    const moved = this.host.app.vault.getAbstractFileByPath(path);
    return moved instanceof TFile ? moved : file;
  }

  private async renameArticleToTitle(file: TFile, title: string): Promise<TFile> {
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
    const renamed = this.host.app.vault.getAbstractFileByPath(path);
    return renamed instanceof TFile ? renamed : file;
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
  ): Promise<string> {
    const matches = Array.from(source.matchAll(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/gi));
    if (!matches.length) return source;
    const localized = new Map<string, string>();
    for (let index = 0; index < matches.length; index += 1) {
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
        const { createHash } = require("node:crypto") as typeof import("node:crypto");
        const hash = createHash("sha1").update(url).digest("hex").slice(0, 10);
        const titlePrefix = safeCaptureFileName(title).slice(0, 54);
        const fileName = `${titlePrefix}-${hash}.${extension}`;
        const path = normalizePath(await this.host.app.fileManager.getAvailablePathForAttachment(
          fileName,
          sourceNotePath,
        ));
        await this.ensureFolder(path.split("/").slice(0, -1).join("/"));
        await this.host.app.vault.createBinary(path, data);
        const alt = match[1]?.trim();
        localized.set(url, alt && alt !== "图片" ? `![[${path}|${alt}]]` : `![[${path}]]`);
      } catch {
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
  ): Promise<string> {
    const baseName = safeCaptureFileName(title);
    const path = normalizePath(await this.host.app.fileManager.getAvailablePathForAttachment(
      `${baseName}.${extension}`,
      sourceNotePath,
    ));
    await this.ensureFolder(path.split("/").slice(0, -1).join("/"));
    const { readFile } = require("node:fs/promises") as typeof import("node:fs/promises");
    const buffer = await readFile(sourcePath);
    const data = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    await this.host.app.vault.createBinary(path, data);
    return path;
  }

  private resultFor(
    job: BrowserCaptureJob,
    file: TFile,
    title: string,
    preview: string,
  ): NonNullable<BrowserCaptureJob["result"]> {
    return {
      title,
      relativePath: file.path,
      obsidianUri: `obsidian://open?vault=${encodeURIComponent(this.host.app.vault.getName())}&file=${encodeURIComponent(file.path)}`,
      preview,
      pageType: job.pageType,
      skillId: job.skillId,
      providerId: job.providerId,
    };
  }

  private async extractArticle(job: BrowserCaptureJob): Promise<ExtractedSource> {
    let fetched: ExtractedSource | undefined;
    let primaryError: unknown;
    try {
      const response = await requestUrl({
        url: job.url,
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
      fetched = extractArticleFromHtml(response.text, job.title, job.url);
    } catch (error) {
      primaryError = error;
    }
    try {
      const executable = await resolveCaptureTool(
        this.host.getSettings().browserCapture.defuddlePath,
        "defuddle",
        "Defuddle",
      );
      const result = await runLocalCommand(executable, ["parse", job.url, "--md"], "", 5 * 60);
      if (result.exitCode !== 0 || result.stdout.trim().length < 80) {
        if (fetched) return fetched;
        const browserCopy = this.capturedSources.get(job.id);
        if (browserCopy) return browserCopy;
        throw primaryError instanceof Error ? primaryError : new Error("网页正文提取失败");
      }
      let title = fetched?.title || "";
      if (!title || title === job.title) {
        const titleResult = await runLocalCommand(executable, ["parse", job.url, "-p", "title"], "", 90);
        if (titleResult.exitCode === 0 && titleResult.stdout.trim()) title = titleResult.stdout.trim();
      }
      let author = fetched?.author;
      if (!author) {
        const authorResult = await runLocalCommand(executable, ["parse", job.url, "-p", "author"], "", 90);
        if (authorResult.exitCode === 0 && authorResult.stdout.trim()) author = authorResult.stdout.trim();
      }
      return {
        ...fetched,
        title: title || job.title || "未命名网页",
        author,
        source: result.stdout.trim(),
      };
    } catch {
      if (fetched) return fetched;
      const browserCopy = this.capturedSources.get(job.id);
      if (browserCopy) return browserCopy;
      throw primaryError instanceof Error ? primaryError : new Error("网页正文提取失败");
    }
  }

  private async extractVideo(job: BrowserCaptureJob): Promise<ExtractedSource> {
    const settings = this.host.getSettings().browserCapture;
    const downloader = await resolveCaptureTool(settings.videoDownloaderPath, "yt-dlp", "yt-dlp");
    const { mkdtemp, readdir, readFile, rm } = require("node:fs/promises") as typeof import("node:fs/promises");
    const { tmpdir } = require("node:os") as typeof import("node:os");
    const { join } = require("node:path") as typeof import("node:path");
    const directory = await mkdtemp(join(tmpdir(), "knowgrove-video-"));
    try {
      const titleResult = await runLocalCommand(
        downloader,
        [...ytDlpCaptureArgs(job.url), "--skip-download", "--print", "%(title)s", job.url],
        "",
        90,
      );
      const title = titleResult.exitCode === 0
        ? titleResult.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1) || job.title
        : job.title;
      await runLocalCommand(
        downloader,
        ytDlpSubtitleArgs(join(directory, "source.%(ext)s"), job.url),
        "",
        15 * 60,
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
      await this.updateJob(job.id, {
        progress: 28,
        message: "没有找到可用字幕，正在下载音频",
      });
      const audioResult = await runLocalCommand(
        downloader,
        [
          ...ytDlpCaptureArgs(job.url),
          ...ffmpegLocationArgs(settings),
          "-x",
          "--audio-format",
          "mp3",
          "-o",
          join(directory, "audio.%(ext)s"),
          job.url,
        ],
        "",
        60 * 60,
      );
      if (audioResult.exitCode !== 0) {
        throw new Error(formatYtDlpCaptureError(
          `${audioResult.stderr}\n${audioResult.stdout}`,
          job.url,
        ));
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
      );
      if (whisperResult.exitCode !== 0) {
        throw new Error(whisperResult.stderr.trim() || "Whisper 转录失败");
      }
      let transcriptPath = invocation.transcriptPath;
      if (!transcriptPath) {
        const transcriptFile = (await readdir(directory)).find((name) => name.endsWith(".txt"));
        if (!transcriptFile) throw new Error("Whisper 完成后没有生成逐字稿");
        transcriptPath = join(directory, transcriptFile);
      }
      const transcript = formatTranscriptParagraphs(await readFile(transcriptPath, "utf8"));
      if (!transcript) throw new Error("Whisper 生成的逐字稿为空");
      return { title: title || "未命名视频", source: transcript };
    } finally {
      await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async extractAudio(job: BrowserCaptureJob, sourceNotePath: string): Promise<ExtractedSource> {
    const settings = this.host.getSettings().browserCapture;
    const downloader = await resolveCaptureTool(settings.videoDownloaderPath, "yt-dlp", "yt-dlp");
    const { mkdtemp, readdir, readFile, rm } = require("node:fs/promises") as typeof import("node:fs/promises");
    const { tmpdir } = require("node:os") as typeof import("node:os");
    const { extname, join } = require("node:path") as typeof import("node:path");
    const directory = await mkdtemp(join(tmpdir(), "knowgrove-audio-"));
    try {
      const titleResult = await runLocalCommand(
        downloader,
        [...ytDlpCaptureArgs(job.url), "--skip-download", "--print", "%(title)s", job.url],
        "",
        90,
      );
      const title = titleResult.exitCode === 0
        ? titleResult.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1) || job.title
        : job.title;
      const audioResult = await runLocalCommand(
        downloader,
        [
          ...ytDlpCaptureArgs(job.url),
          ...ffmpegLocationArgs(settings),
          "-x",
          "--audio-format",
          "m4a",
          "-o",
          join(directory, "audio.%(ext)s"),
          job.url,
        ],
        "",
        60 * 60,
      );
      if (audioResult.exitCode !== 0) {
        throw new Error(formatYtDlpCaptureError(
          `${audioResult.stderr}\n${audioResult.stdout}`,
          job.url,
        ));
      }
      const audioFile = (await readdir(directory)).find((name) => /^audio\./.test(name));
      if (!audioFile) throw new Error("没有找到已下载的音频文件");
      const audioPath = join(directory, audioFile);
      const mediaPath = await this.saveMediaFile(
        audioPath,
        title || job.title || "未命名音频",
        extname(audioFile).replace(/^\./, "") || "m4a",
        sourceNotePath,
      );
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
      const invocation = buildWhisperInvocation({
        implementation,
        audioPath,
        outputDirectory: directory,
        model,
        cppModelPath,
      });
      const whisperResult = await runLocalCommand(whisper, invocation.args, "", 90 * 60);
      if (whisperResult.exitCode !== 0) {
        throw new Error(whisperResult.stderr.trim() || "Whisper 转录失败");
      }
      let transcriptPath = invocation.transcriptPath;
      if (!transcriptPath) {
        const transcriptFile = (await readdir(directory)).find((name) => name.endsWith(".txt"));
        if (!transcriptFile) throw new Error("Whisper 完成后没有生成逐字稿");
        transcriptPath = join(directory, transcriptFile);
      }
      const transcript = formatTranscriptParagraphs(await readFile(transcriptPath, "utf8"));
      if (!transcript) throw new Error("Whisper 生成的逐字稿为空");
      return {
        title: title || job.title || "未命名音频",
        source: transcript,
        mediaPath,
      };
    } finally {
      await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async runAI(
    job: BrowserCaptureJob,
    title: string,
    source: string,
    onProgress: (message: string, progress: number) => Promise<void>,
  ): Promise<BrowserCaptureAIResult> {
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
      const output = await this.host.runProvider(
        job.providerId,
        withSkillInstruction(browserCapturePrompt(job.pageType, title, chunks[0]!)),
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
      const output = await this.host.runProvider(
        job.providerId,
        withSkillInstruction(
          browserCaptureChunkPrompt(job.pageType, title, chunks[index]!, index + 1, chunks.length),
        ),
      );
      partials.push(normalizeBrowserCaptureAIResult(extractJsonObject(output), job.pageType));
    }
    await onProgress("正在合并各段摘要与核心要点", 88);
    const output = await this.host.runProvider(
      job.providerId,
      withSkillInstruction(browserCaptureSynthesisPrompt(job.pageType, title, partials)),
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
}
