import { Platform, requestUrl } from "obsidian";
import { runLocalCommand } from "./ai-provider";
import {
  compareRuntimeVersions,
  KNOWGROVE_RUNTIME_PUBLIC_KEY,
  detectRuntimePlatform,
  formatRuntimeBytes,
  platformArtifacts,
  runtimeManifestCandidates,
  selectNewestRuntimeManifest,
  shouldRestartRuntimeDownload,
  stableRuntimeJson,
  totalArtifactBytes,
  unsignedRuntimeManifest,
  validateSkillPack,
  validateRuntimeManifest,
  type KnowGroveRuntimeArtifact,
  type KnowGroveRuntimeArtifactId,
  type KnowGroveRuntimeAudit,
  type KnowGroveRuntimeInstallationRecord,
  type KnowGroveRuntimeManifest,
  type KnowGroveRuntimePlatform,
  type KnowGroveRuntimeSettings,
  type KnowGroveSkillPack,
} from "./runtime-core";
import type { BrowserCaptureSettings } from "./types";

const CURRENT_RECORD = "current.json";
const MAX_REDIRECTS = 5;

export interface RuntimeManagerHost {
  getRuntimeSettings(): KnowGroveRuntimeSettings;
  getCaptureSettings(): BrowserCaptureSettings;
  getPluginVersion(): string;
  saveSettings(): Promise<void>;
}

export interface RuntimeInstallProgress {
  phase: "checking" | "downloading" | "verifying" | "installing" | "completed";
  message: string;
  completedBytes: number;
  totalBytes: number;
}

type ProgressHandler = (progress: RuntimeInstallProgress) => void;

function runtimeRoot(): string {
  const { homedir } = require("node:os") as typeof import("node:os");
  const { join } = require("node:path") as typeof import("node:path");
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "KnowGrove", "runtime");
  }
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
    return join(localAppData, "KnowGrove", "runtime");
  }
  return join(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "KnowGrove", "runtime");
}

function toolFileName(id: KnowGroveRuntimeArtifactId): string {
  if (process.platform === "win32" && ["yt-dlp", "ffmpeg", "ffprobe", "whisper"].includes(id)) {
    return `${id === "whisper" ? "whisper-cli" : id}.exe`;
  }
  return id === "whisper" ? "whisper-cli" : id;
}

function commandCandidates(id: KnowGroveRuntimeArtifactId, configured = ""): string[] {
  const { homedir } = require("node:os") as typeof import("node:os");
  const { join } = require("node:path") as typeof import("node:path");
  const home = homedir();
  const name = toolFileName(id);
  const candidates = [
    configured.trim(),
    process.platform === "darwin" ? `/opt/homebrew/bin/${name}` : "",
    process.platform === "darwin" ? `/usr/local/bin/${name}` : "",
    process.platform === "win32" && process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, "Programs", name)
      : "",
    join(home, ".local", "bin", name),
    id === "yt-dlp" ? join(home, ".pyenv", "shims", "yt-dlp") : "",
    name,
  ];
  return Array.from(new Set(candidates.filter(Boolean)));
}

function modelCandidates(configured = ""): string[] {
  const { homedir } = require("node:os") as typeof import("node:os");
  const { join } = require("node:path") as typeof import("node:path");
  const home = homedir();
  const raw = configured.trim();
  const configuredPath = raw.endsWith(".bin")
    ? raw.startsWith("~/") ? join(home, raw.slice(2)) : raw
    : "";
  const name = raw && !raw.endsWith(".bin") ? `ggml-${raw}.bin` : "ggml-small.bin";
  return Array.from(new Set([
    configuredPath,
    join(home, ".cache", "whisper-models", name),
    join(home, ".cache", "whisper.cpp", name),
    join(home, ".local", "share", "whisper", name),
    process.platform === "darwin" ? join("/opt/homebrew/share/whisper-cpp", name) : "",
    process.platform === "darwin" ? join("/usr/local/share/whisper-cpp", name) : "",
  ].filter(Boolean)));
}

function modelDirectories(): string[] {
  const { homedir } = require("node:os") as typeof import("node:os");
  const { join } = require("node:path") as typeof import("node:path");
  const home = homedir();
  return [
    join(home, ".cache", "whisper-models"),
    join(home, ".cache", "whisper.cpp"),
    join(home, ".local", "share", "whisper"),
    ...(process.platform === "darwin"
      ? ["/opt/homebrew/share/whisper-cpp", "/usr/local/share/whisper-cpp"]
      : []),
  ];
}

async function isFile(path: string): Promise<boolean> {
  const { stat } = require("node:fs/promises") as typeof import("node:fs/promises");
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function probeCommand(id: KnowGroveRuntimeArtifactId, candidate: string): Promise<boolean> {
  const args = id === "ffmpeg" || id === "ffprobe" ? ["-version"] : id === "whisper" ? ["--help"] : ["--version"];
  try {
    const result = await runLocalCommand(candidate, args, "", 8);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

function verifyManifestSignature(manifest: KnowGroveRuntimeManifest): void {
  const { verify } = require("node:crypto") as typeof import("node:crypto");
  const payload = Buffer.from(stableRuntimeJson(unsignedRuntimeManifest(manifest)));
  const signature = Buffer.from(manifest.signature, "base64");
  if (!verify(null, payload, KNOWGROVE_RUNTIME_PUBLIC_KEY, signature)) {
    throw new Error("运行包清单签名无效，已拒绝安装");
  }
}

function assertPluginVersion(manifest: KnowGroveRuntimeManifest, pluginVersion: string): void {
  if (compareRuntimeVersions(pluginVersion, manifest.minimumPluginVersion) < 0) {
    throw new Error(`运行包需要 KnowGrove ${manifest.minimumPluginVersion} 或更高版本`);
  }
}

async function sha256File(path: string): Promise<string> {
  const { createReadStream } = require("node:fs") as typeof import("node:fs");
  const { createHash } = require("node:crypto") as typeof import("node:crypto");
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

async function downloadFile(
  urls: string[],
  destination: string,
  expectedSize: number,
  onBytes: (bytes: number) => void,
): Promise<void> {
  const { mkdir, open, stat, unlink } = require("node:fs/promises") as typeof import("node:fs/promises");
  const { dirname } = require("node:path") as typeof import("node:path");
  await mkdir(dirname(destination), { recursive: true });
  let lastError: unknown;
  for (const url of urls) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        let existing = 0;
        try {
          existing = (await stat(destination)).size;
        } catch {
          existing = 0;
        }
        if (existing === expectedSize) return;
        if (existing > expectedSize) {
          await unlink(destination).catch(() => undefined);
          onBytes(-existing);
          existing = 0;
        }
        const handle = await open(destination, existing ? "a" : "w");
        try {
          await downloadFromUrl(url, handle, existing, onBytes);
        } finally {
          await handle.close();
        }
        const actual = (await stat(destination)).size;
        if (actual !== expectedSize) throw new Error(`下载大小不完整：${actual}/${expectedSize}`);
        return;
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        if (shouldRestartRuntimeDownload(message)) {
          let discarded = 0;
          try {
            discarded = (await stat(destination)).size;
          } catch {
            discarded = 0;
          }
          await unlink(destination).catch(() => undefined);
          if (discarded) onBytes(-discarded);
        }
        if (attempt < 3) {
          await new Promise<void>((resolve) => setTimeout(resolve, 1_000 * (attempt + 1)));
        }
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("所有运行包下载源都不可用");
}

async function downloadFromUrl(
  url: string,
  handle: import("node:fs/promises").FileHandle,
  offset: number,
  onBytes: (bytes: number) => void,
  redirects = 0,
): Promise<void> {
  if (redirects > MAX_REDIRECTS) throw new Error("运行包下载重定向过多");
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error("运行包仅允许通过 HTTPS 下载");
  const https = require("node:https") as typeof import("node:https");
  await new Promise<void>((resolve, reject) => {
    const request = https.get(parsed, {
      headers: {
        "User-Agent": "KnowGrove-Runtime",
        ...(offset ? { Range: `bytes=${offset}-` } : {}),
      },
    }, (response) => {
      const status = response.statusCode ?? 0;
      const location = response.headers.location;
      if (status >= 300 && status < 400 && location) {
        response.resume();
        const next = new URL(location, parsed).toString();
        void downloadFromUrl(next, handle, offset, onBytes, redirects + 1).then(resolve, reject);
        return;
      }
      if (status !== 200 && status !== 206) {
        response.resume();
        reject(new Error(`运行包下载失败（HTTP ${status}）`));
        return;
      }
      if (offset && status === 200) {
        reject(new Error("下载源不支持断点续传，请重试"));
        response.resume();
        return;
      }
      let position = offset;
      response.on("data", (chunk: Buffer) => {
        response.pause();
        void handle.write(chunk, 0, chunk.length, position).then(() => {
          position += chunk.length;
          onBytes(chunk.length);
          response.resume();
        }, reject);
      });
      response.on("end", resolve);
      response.on("error", reject);
    });
    request.setTimeout(60_000, () => request.destroy(new Error("运行包下载连接超时")));
    request.on("error", reject);
  });
}

export class KnowGroveRuntimeManager {
  constructor(private readonly host: RuntimeManagerHost) {}

  getRoot(): string {
    return runtimeRoot();
  }

  private async fetchManifest(
    configuredUrl: string,
  ): Promise<{ manifest: KnowGroveRuntimeManifest; url: string }> {
    let lastError: unknown;
    const available: Array<{ manifest: KnowGroveRuntimeManifest; url: string }> = [];
    for (const url of runtimeManifestCandidates(configuredUrl)) {
      try {
        const response = await requestUrl({ url, method: "GET", throw: false });
        if (response.status < 200 || response.status >= 400) {
          throw new Error(`HTTP ${response.status}`);
        }
        const manifest = validateRuntimeManifest(response.json);
        verifyManifestSignature(manifest);
        assertPluginVersion(manifest, this.host.getPluginVersion());
        available.push({ manifest, url });
      } catch (error) {
        lastError = error;
      }
    }
    const newest = selectNewestRuntimeManifest(available);
    if (newest) return newest;
    throw lastError instanceof Error ? lastError : new Error("没有可用的运行包清单地址");
  }

  async readInstallation(): Promise<KnowGroveRuntimeInstallationRecord | undefined> {
    const { readFile } = require("node:fs/promises") as typeof import("node:fs/promises");
    const { join } = require("node:path") as typeof import("node:path");
    try {
      const parsed = JSON.parse(await readFile(join(this.getRoot(), CURRENT_RECORD), "utf8")) as unknown;
      if (!parsed || typeof parsed !== "object") return undefined;
      return parsed as KnowGroveRuntimeInstallationRecord;
    } catch {
      return undefined;
    }
  }

  async readSkillPack(): Promise<KnowGroveSkillPack | undefined> {
    const installation = await this.readInstallation();
    const path = installation?.files["skill-pack"];
    if (!path) return undefined;
    const { readFile } = require("node:fs/promises") as typeof import("node:fs/promises");
    try {
      return validateSkillPack(JSON.parse(await readFile(path, "utf8")) as unknown);
    } catch (error) {
      console.error("KnowGrove: managed Skill Pack is invalid", error);
      return undefined;
    }
  }

  private async findExistingTools(): Promise<Partial<Record<KnowGroveRuntimeArtifactId, string>>> {
    const capture = this.host.getCaptureSettings();
    const configured: Partial<Record<KnowGroveRuntimeArtifactId, string>> = {
      "yt-dlp": capture.videoDownloaderPath,
      ffmpeg: capture.ffmpegPath,
      whisper: capture.whisperPath,
      "whisper-model": capture.whisperModel,
    };
    const managed = await this.readInstallation();
    const tools: Partial<Record<KnowGroveRuntimeArtifactId, string>> = {};
    for (const id of ["yt-dlp", "ffmpeg", "ffprobe", "whisper"] as const) {
      const candidates = [
        configured[id] ?? "",
        managed?.files[id] ?? "",
        ...commandCandidates(id, configured[id] ?? ""),
      ];
      for (const candidate of Array.from(new Set(candidates.filter(Boolean)))) {
        if (await probeCommand(id, candidate)) {
          tools[id] = candidate;
          break;
        }
      }
    }
    const modelPaths = [
      managed?.files["whisper-model"] ?? "",
      ...modelCandidates(configured["whisper-model"] ?? ""),
    ];
    for (const candidate of Array.from(new Set(modelPaths.filter(Boolean)))) {
      if (await isFile(candidate)) {
        tools["whisper-model"] = candidate;
        break;
      }
    }
    if (!tools["whisper-model"]) {
      const { readdir } = require("node:fs/promises") as typeof import("node:fs/promises");
      const { join } = require("node:path") as typeof import("node:path");
      for (const directory of modelDirectories()) {
        try {
          const names = (await readdir(directory))
            .filter((name) => /^ggml-[a-z0-9._-]+\.bin$/i.test(name))
            .sort((left, right) => {
              const rank = (name: string): number => name.includes("small") ? 0 : name.includes("medium") ? 1 : 2;
              return rank(left) - rank(right) || left.localeCompare(right);
            });
          const path = names[0] ? join(directory, names[0]) : "";
          if (path && await isFile(path)) {
            tools["whisper-model"] = path;
            break;
          }
        } catch {
          // Continue through the bounded list of known model directories.
        }
      }
    }
    if (managed?.files["skill-pack"] && await isFile(managed.files["skill-pack"])) {
      tools["skill-pack"] = managed.files["skill-pack"];
    }
    return tools;
  }

  async audit(): Promise<KnowGroveRuntimeAudit> {
    const settings = this.host.getRuntimeSettings();
    const checkedAt = new Date().toISOString();
    if (!Platform.isDesktopApp) {
      return {
        desktop: false,
        runtimeRoot: this.getRoot(),
        sourceReachable: false,
        sourceDetail: "移动端不运行本地媒体组件",
        tools: {},
        capabilities: [
          { id: "article", name: "网页文章", status: "ready", detail: "使用插件内置解析能力" },
          { id: "video", name: "视频解析", status: "unavailable", detail: "需要 Obsidian 桌面版" },
          { id: "audio", name: "语音转录", status: "unavailable", detail: "需要 Obsidian 桌面版" },
          { id: "ai", name: "AI 整理", status: "needs-setup", detail: "由模型设置决定" },
        ],
        checkedAt,
      };
    }
    const platform = detectRuntimePlatform(process.platform, process.arch);
    const tools = await this.findExistingTools();
    const installed = await this.readInstallation();
    let sourceReachable = false;
    let sourceDetail = "正在检查 KnowGrove 运行包";
    let packageSizeBytes: number | undefined;
    let runtimeUpdateAvailable = false;
    try {
      const { manifest, url } = await this.fetchManifest(settings.manifestUrl);
      sourceReachable = true;
      runtimeUpdateAvailable = Boolean(
        installed
        && installed.runtimeVersion !== "existing"
        && compareRuntimeVersions(manifest.runtimeVersion, installed.runtimeVersion) > 0
      );
      sourceDetail = runtimeUpdateAvailable
        ? `运行包 ${manifest.runtimeVersion} 可更新 · 当前 ${installed?.runtimeVersion} · ${new URL(url).hostname}`
        : `运行包 ${manifest.runtimeVersion} 可用 · ${new URL(url).hostname}`;
      const release = platform ? manifest.platforms[platform] : undefined;
      if (release) packageSizeBytes = totalArtifactBytes(release.artifacts);
    } catch (error) {
      sourceDetail = error instanceof Error ? error.message : String(error);
    }
    let diskFreeBytes: number | undefined;
    try {
      const { mkdir, statfs } = require("node:fs/promises") as typeof import("node:fs/promises");
      await mkdir(this.getRoot(), { recursive: true });
      const stats = await statfs(this.getRoot());
      diskFreeBytes = Number(stats.bavail) * Number(stats.bsize);
    } catch {
      // Older Electron/Node versions may not expose statfs.
    }
    settings.lastAuditAt = checkedAt;
    await this.host.saveSettings();
    const mediaReady = Boolean(tools["yt-dlp"] && tools.ffmpeg);
    const transcriptReady = Boolean(mediaReady && tools.whisper && tools["whisper-model"]);
    return {
      desktop: true,
      platform,
      runtimeRoot: this.getRoot(),
      sourceReachable,
      sourceDetail,
      packageSizeBytes,
      diskFreeBytes,
      tools,
      capabilities: [
        { id: "article", name: "网页文章", status: "ready", detail: "使用插件内置解析能力" },
        {
          id: "video",
          name: "视频解析",
          status: mediaReady ? "ready" : platform ? "needs-setup" : "unavailable",
          detail: mediaReady
            ? runtimeUpdateAvailable ? "下载器与媒体引擎已就绪，有新版组件可更新" : "下载器与媒体引擎已就绪"
            : platform ? "需要配置媒体运行包" : "当前系统架构尚未支持",
        },
        {
          id: "audio",
          name: "语音转录",
          status: transcriptReady ? "ready" : platform ? "needs-setup" : "unavailable",
          detail: transcriptReady ? "Whisper 与本地模型已就绪" : platform ? "需要配置转录引擎和模型" : "当前系统架构尚未支持",
        },
        { id: "ai", name: "AI 整理", status: "needs-setup", detail: "使用插件模型设置中的 CLI 或接口" },
      ],
      checkedAt,
    };
  }

  async install(onProgress: ProgressHandler = () => undefined): Promise<KnowGroveRuntimeInstallationRecord> {
    if (!Platform.isDesktopApp) throw new Error("本地运行包只支持 Obsidian 桌面版");
    const platform = detectRuntimePlatform(process.platform, process.arch);
    if (!platform) throw new Error(`暂不支持当前系统：${process.platform}/${process.arch}`);
    const settings = this.host.getRuntimeSettings();
    onProgress({ phase: "checking", message: "正在检查已有运行环境", completedBytes: 0, totalBytes: 0 });
    try {
      const { manifest } = await this.fetchManifest(settings.manifestUrl);
      if (settings.mode !== "managed" && settings.preferExistingTools) {
        const existing = await this.findExistingTools();
        if (existing["yt-dlp"] && existing.ffmpeg && existing.whisper && existing["whisper-model"]) {
          const installed = await this.readInstallation();
          const managedUpdateAvailable = settings.mode === "auto"
            && installed
            && installed.runtimeVersion !== "existing"
            && compareRuntimeVersions(manifest.runtimeVersion, installed.runtimeVersion) > 0;
          if (!managedUpdateAvailable) {
            this.applyCapturePaths(existing);
            settings.lastInstallError = "";
            await this.host.saveSettings();
            return {
              runtimeVersion: installed?.runtimeVersion ?? "existing",
              platform,
              installedAt: installed?.installedAt ?? new Date().toISOString(),
              files: existing,
            };
          }
          onProgress({
            phase: "checking",
            message: `发现运行组件更新 ${installed.runtimeVersion} → ${manifest.runtimeVersion}`,
            completedBytes: 0,
            totalBytes: 0,
          });
        } else if (settings.mode === "existing") {
          throw new Error("已有工具不完整，请安装缺失组件或切换为自动配置");
        }
      }
      const artifacts = platformArtifacts(manifest, platform);
      const totalBytes = totalArtifactBytes(artifacts);
      const free = await this.freeDiskBytes();
      if (free !== undefined && free < totalBytes * 1.25) {
        throw new Error(`空间不足：需要约 ${formatRuntimeBytes(totalBytes * 1.25)}，当前可用 ${formatRuntimeBytes(free)}`);
      }
      return await this.installArtifacts(manifest, platform, artifacts, onProgress);
    } catch (error) {
      settings.lastInstallError = error instanceof Error ? error.message : String(error);
      await this.host.saveSettings();
      throw error;
    }
  }

  private async freeDiskBytes(): Promise<number | undefined> {
    try {
      const { mkdir, statfs } = require("node:fs/promises") as typeof import("node:fs/promises");
      await mkdir(this.getRoot(), { recursive: true });
      const stats = await statfs(this.getRoot());
      return Number(stats.bavail) * Number(stats.bsize);
    } catch {
      return undefined;
    }
  }

  private async installArtifacts(
    manifest: KnowGroveRuntimeManifest,
    platform: KnowGroveRuntimePlatform,
    artifacts: KnowGroveRuntimeArtifact[],
    onProgress: ProgressHandler,
  ): Promise<KnowGroveRuntimeInstallationRecord> {
    const { chmod, mkdir, readFile, rename, rm, stat, unlink, writeFile } = require("node:fs/promises") as typeof import("node:fs/promises");
    const { dirname, join } = require("node:path") as typeof import("node:path");
    const root = this.getRoot();
    const transactionId = Date.now();
    const staging = join(root, `.staging-${manifest.runtimeVersion}-${transactionId}`);
    const destination = join(root, manifest.runtimeVersion);
    const backup = join(root, `.backup-${manifest.runtimeVersion}-${transactionId}`);
    const currentRecordPath = join(root, CURRENT_RECORD);
    const currentRecordTemp = join(root, `.current-${transactionId}.json`);
    await mkdir(staging, { recursive: true });
    const totalBytes = totalArtifactBytes(artifacts);
    let completedBytes = 0;
    const files: Partial<Record<KnowGroveRuntimeArtifactId, string>> = {};
    let previousRecord: string | undefined;
    let movedExisting = false;
    let activatedNew = false;
    const capture = this.host.getCaptureSettings();
    const previousCapturePaths = {
      videoDownloaderPath: capture.videoDownloaderPath,
      ffmpegPath: capture.ffmpegPath,
      whisperPath: capture.whisperPath,
      whisperModel: capture.whisperModel,
    };
    try {
      previousRecord = await readFile(currentRecordPath, "utf8");
    } catch {
      previousRecord = undefined;
    }
    try {
      for (const artifact of artifacts) {
        const output = join(staging, artifact.target);
        await mkdir(dirname(output), { recursive: true });
        onProgress({
          phase: "downloading",
          message: `正在下载 ${artifact.id}`,
          completedBytes,
          totalBytes,
        });
        await downloadFile(artifact.urls, output, artifact.size, (bytes) => {
          completedBytes += bytes;
          onProgress({
            phase: "downloading",
            message: `正在下载 ${artifact.id}`,
            completedBytes,
            totalBytes,
          });
        });
        onProgress({
          phase: "verifying",
          message: `正在校验 ${artifact.id}`,
          completedBytes,
          totalBytes,
        });
        const actual = await sha256File(output);
        if (actual.toLowerCase() !== artifact.sha256.toLowerCase()) {
          throw new Error(`${artifact.id} 校验失败，已停止安装`);
        }
        if (artifact.executable && process.platform !== "win32") await chmod(output, 0o755);
        files[artifact.id] = join(destination, artifact.target);
      }
      onProgress({
        phase: "installing",
        message: "正在启用已校验的组件",
        completedBytes,
        totalBytes,
      });
      try {
        if ((await stat(destination)).isDirectory()) {
          await rename(destination, backup);
          movedExisting = true;
        }
      } catch {
        movedExisting = false;
      }
      await rename(staging, destination);
      activatedNew = true;
      const record: KnowGroveRuntimeInstallationRecord = {
        runtimeVersion: manifest.runtimeVersion,
        platform,
        installedAt: new Date().toISOString(),
        files,
      };
      await writeFile(currentRecordTemp, `${JSON.stringify(record, null, 2)}\n`, "utf8");
      await rm(currentRecordPath, { force: true });
      await rename(currentRecordTemp, currentRecordPath);
      this.applyCapturePaths(files);
      const settings = this.host.getRuntimeSettings();
      settings.lastInstallError = "";
      await this.host.saveSettings();
      if (movedExisting) await rm(backup, { recursive: true, force: true });
      onProgress({ phase: "completed", message: "KnowGrove 运行环境已就绪", completedBytes: totalBytes, totalBytes });
      return record;
    } catch (error) {
      await rm(staging, { recursive: true, force: true }).catch(() => undefined);
      await unlink(currentRecordTemp).catch(() => undefined);
      if (activatedNew) await rm(destination, { recursive: true, force: true }).catch(() => undefined);
      if (movedExisting) await rename(backup, destination).catch(() => undefined);
      if (previousRecord !== undefined) {
        await writeFile(currentRecordPath, previousRecord, "utf8").catch(() => undefined);
      } else {
        await unlink(currentRecordPath).catch(() => undefined);
      }
      capture.videoDownloaderPath = previousCapturePaths.videoDownloaderPath;
      capture.ffmpegPath = previousCapturePaths.ffmpegPath;
      capture.whisperPath = previousCapturePaths.whisperPath;
      capture.whisperModel = previousCapturePaths.whisperModel;
      throw error;
    }
  }

  private applyCapturePaths(files: Partial<Record<KnowGroveRuntimeArtifactId, string>>): void {
    const capture = this.host.getCaptureSettings();
    if (files["yt-dlp"]) capture.videoDownloaderPath = files["yt-dlp"];
    if (files.ffmpeg) capture.ffmpegPath = files.ffmpeg;
    if (files.whisper) capture.whisperPath = files.whisper;
    if (files["whisper-model"]) capture.whisperModel = files["whisper-model"];
  }
}
