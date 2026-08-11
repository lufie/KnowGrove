import { App, FileSystemAdapter, normalizePath } from "obsidian";
import { runLocalCommand } from "./ai-provider";
import {
  RECORDING_RESUME_DELAYS_MS,
  localRecordingFileStem,
  recordingExtension,
  recordingMimeType,
  type DesktopRecordingManifest,
  type DesktopRecordingSegment,
  type DesktopRecordingSnapshot,
  type DesktopRecordingState,
} from "./capture-center-core";
import { resolveLocalExecutable } from "./local-cli";

const RECORDING_CHUNK_MILLISECONDS = 2_000;
const RECORDING_SAFETY_ROTATION_MILLISECONDS = 10 * 60 * 1_000;
const SESSION_DIRECTORY = ".knowgrove-sessions";

export interface DesktopRecorderHost {
  app: App;
  getRecordingFolder(): string;
  getFfmpegPath(): string;
  onRecordingFinalized(manifest: DesktopRecordingManifest, audioPath: string): Promise<string | undefined>;
}

type RecordingListener = (snapshot: DesktopRecordingSnapshot) => void;

function recordingId(): string {
  return typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function safeFileName(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160) || "语音记录";
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function stateMessage(state: DesktopRecordingState): string {
  switch (state) {
    case "idle": return "准备录音";
    case "requesting": return "正在请求麦克风权限";
    case "recording": return "录音中，内容正在安全分段保存";
    case "interrupted": return "麦克风被占用，已有片段已保存";
    case "resuming": return "正在等待麦克风恢复";
    case "finalizing": return "正在合并并保存录音";
    case "completed": return "录音已安全保存";
    case "needs-attention": return "已有录音片段安全保留，需要继续或保存";
  }
}

export class DesktopRecorderController {
  private manifest?: DesktopRecordingManifest;
  private sessionRelativePath = "";
  private recorder?: MediaRecorder;
  private stream?: MediaStream;
  private track?: MediaStreamTrack;
  private currentSegment?: DesktopRecordingSegment;
  private currentSegmentStartedAt = 0;
  private appendQueue: Promise<void> = Promise.resolve();
  private manifestQueue: Promise<void> = Promise.resolve();
  private pendingWriteError?: Error;
  private listeners = new Set<RecordingListener>();
  private rotationTimer?: number;
  private tickTimer?: number;
  private passiveResumeTimer?: number;
  private resumeGeneration = 0;
  private userRequestedStop = false;
  private interruptionPromise?: Promise<void>;
  private deviceChangeHandler?: () => void;
  private trackMuteHandler?: () => void;
  private trackEndedHandler?: () => void;

  constructor(private readonly host: DesktopRecorderHost) {}

  async initialize(): Promise<void> {
    if (!(this.host.app.vault.adapter instanceof FileSystemAdapter)) return;
    const { readdir, readFile, stat } = require("node:fs/promises") as typeof import("node:fs/promises");
    const { join } = require("node:path") as typeof import("node:path");
    const root = this.absolutePath(normalizePath(`${this.host.getRecordingFolder()}/${SESSION_DIRECTORY}`));
    let names: string[];
    try {
      names = await readdir(root);
    } catch {
      return;
    }
    const candidates: DesktopRecordingManifest[] = [];
    for (const name of names.slice(-100)) {
      try {
        const parsed = JSON.parse(await readFile(join(root, name, "manifest.json"), "utf8")) as DesktopRecordingManifest;
        if (parsed?.version !== 1 || !parsed.id || parsed.outputPath || !Array.isArray(parsed.segments)) continue;
        const recoveredSegments: DesktopRecordingSegment[] = [];
        for (const segment of parsed.segments) {
          try {
            const file = await stat(this.absolutePath(segment.relativePath));
            if (file.size <= 0) continue;
            const durationMilliseconds = segment.durationMilliseconds > 0
              ? segment.durationMilliseconds
              : Math.max(0, file.mtimeMs - Date.parse(segment.startedAt));
            recoveredSegments.push({
              ...segment,
              endedAt: segment.endedAt ?? file.mtime.toISOString(),
              durationMilliseconds,
              fileSize: file.size,
            });
          } catch {
            // A manifest can outlive an empty segment created immediately before a crash.
          }
        }
        parsed.segments = recoveredSegments;
        parsed.recordedMilliseconds = recoveredSegments.reduce(
          (total, segment) => total + segment.durationMilliseconds,
          0,
        );
        if (recoveredSegments.length) candidates.push(parsed);
      } catch {
        // Ignore incomplete folders; the audio segment remains available for manual recovery.
      }
    }
    const latest = candidates.sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
    if (!latest) return;
    this.manifest = latest;
    this.sessionRelativePath = normalizePath(`${this.host.getRecordingFolder()}/${SESSION_DIRECTORY}/${latest.id}`);
    latest.state = "needs-attention";
    latest.lastError = "Obsidian 上次关闭前录音尚未完成；已有片段已保留";
    await this.persistManifest();
    this.emit();
  }

  subscribe(listener: RecordingListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  snapshot(): DesktopRecordingSnapshot {
    const manifest = this.manifest;
    const activeElapsed = manifest?.state === "recording" && this.currentSegmentStartedAt
      ? Date.now() - this.currentSegmentStartedAt
      : 0;
    const recordedMilliseconds = (manifest?.recordedMilliseconds ?? 0) + activeElapsed;
    return {
      state: manifest?.state ?? "idle",
      sessionId: manifest?.id,
      title: manifest?.title ?? "语音记录",
      startedAt: manifest?.createdAt,
      recordedMilliseconds,
      interruptionCount: manifest?.interruptions.length ?? 0,
      message: manifest?.lastError || stateMessage(manifest?.state ?? "idle"),
      outputPath: manifest?.outputPath,
      notePath: manifest?.notePath,
    };
  }

  isActive(): boolean {
    const state = this.manifest?.state;
    return state === "requesting" || state === "recording" || state === "interrupted" || state === "resuming" || state === "finalizing";
  }

  async start(title = ""): Promise<void> {
    if (this.isActive()) return;
    if (this.manifest?.state === "needs-attention" && this.manifest.segments.length) {
      await this.resume();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      throw new Error("当前 Obsidian/Electron 环境不支持麦克风录音");
    }
    if (!(this.host.app.vault.adapter instanceof FileSystemAdapter)) {
      throw new Error("桌面录音需要本地文件系统 Vault");
    }

    const createdAt = new Date();
    const id = recordingId();
    const recordingTitle = safeFileName(title.trim() || localRecordingFileStem(createdAt));
    this.manifest = {
      version: 1,
      id,
      title: recordingTitle,
      state: "requesting",
      createdAt: createdAt.toISOString(),
      recordedMilliseconds: 0,
      sessionMilliseconds: 0,
      segments: [],
      interruptions: [],
    };
    this.sessionRelativePath = normalizePath(`${this.host.getRecordingFolder()}/${SESSION_DIRECTORY}/${id}`);
    this.userRequestedStop = false;
    this.pendingWriteError = undefined;
    await this.persistManifest();
    this.emit();

    try {
      const stream = await this.requestAudioStream();
      await this.beginSegment(stream);
      this.installDeviceListener();
    } catch (error) {
      this.setNeedsAttention(error);
      throw error;
    }
  }

  async resume(): Promise<void> {
    if (!this.manifest || this.manifest.state === "completed" || this.manifest.state === "finalizing") return;
    this.userRequestedStop = false;
    await this.tryResume("手动继续录音", false);
  }

  async stop(): Promise<DesktopRecordingManifest | undefined> {
    const manifest = this.manifest;
    if (!manifest || manifest.state === "idle" || manifest.state === "completed") return manifest;
    this.userRequestedStop = true;
    this.resumeGeneration += 1;
    this.clearRotationTimer();
    this.clearPassiveResumeTimer();
    this.closeLatestInterruption(false);
    this.setState("finalizing", "正在合并并保存录音");
    try {
      await this.stopCurrentSegment();
      if (!manifest.segments.length) throw new Error("没有录到可保存的音频内容");
      const outputPath = await this.mergeSegments();
      manifest.outputPath = outputPath;
      manifest.endedAt = new Date().toISOString();
      manifest.sessionMilliseconds = Date.now() - Date.parse(manifest.createdAt);
      manifest.lastError = undefined;
      const notePath = await this.host.onRecordingFinalized(manifest, outputPath);
      if (notePath) manifest.notePath = notePath;
      manifest.state = "completed";
      await this.persistManifest();
      this.stopTicking();
      this.removeDeviceListener();
      this.emit();
      return manifest;
    } catch (error) {
      this.setNeedsAttention(error);
      throw error;
    }
  }

  async discardCompletedState(): Promise<void> {
    if (this.isActive()) return;
    this.manifest = undefined;
    this.sessionRelativePath = "";
    this.emit();
  }

  shutdown(): void {
    this.userRequestedStop = true;
    this.resumeGeneration += 1;
    this.clearRotationTimer();
    this.clearPassiveResumeTimer();
    this.stopTicking();
    this.removeDeviceListener();
    if (!this.manifest || this.manifest.state === "completed") return;
    this.manifest.state = "interrupted";
    this.manifest.lastError = "Obsidian 已关闭；正在保存最后一个安全片段";
    void this.stopCurrentSegment()
      .then(() => this.persistManifest())
      .catch((error) => console.error("KnowGrove: failed to seal recording during unload", error));
  }

  private async requestAudioStream(): Promise<MediaStream> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    });
    const track = stream.getAudioTracks()[0];
    if (!track || track.readyState !== "live" || track.muted) {
      stream.getTracks().forEach((item) => item.stop());
      throw new Error("麦克风暂时不可用");
    }
    return stream;
  }

  private async beginSegment(stream: MediaStream): Promise<void> {
    const manifest = this.requireManifest();
    const mimeType = recordingMimeType((candidate) => MediaRecorder.isTypeSupported(candidate));
    const extension = recordingExtension(mimeType);
    const index = manifest.segments.length + 1;
    const relativePath = normalizePath(`${this.sessionRelativePath}/segment-${String(index).padStart(4, "0")}.${extension}`);
    const absolutePath = this.absolutePath(relativePath);
    const { mkdir } = require("node:fs/promises") as typeof import("node:fs/promises");
    const { dirname } = require("node:path") as typeof import("node:path");
    await mkdir(dirname(absolutePath), { recursive: true });

    const segment: DesktopRecordingSegment = {
      index,
      relativePath,
      startedAt: new Date().toISOString(),
      durationMilliseconds: 0,
      fileSize: 0,
      mimeType,
    };
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    recorder.addEventListener("dataavailable", (event) => {
      if (!event.data.size) return;
      const data = event.data;
      this.appendQueue = this.appendQueue.then(async () => {
        const buffer = Buffer.from(await data.arrayBuffer());
        const { open } = require("node:fs/promises") as typeof import("node:fs/promises");
        const handle = await open(absolutePath, "a");
        try {
          await handle.write(buffer);
          await handle.sync();
        } finally {
          await handle.close();
        }
      }).catch((error) => {
        this.pendingWriteError = error instanceof Error ? error : new Error(String(error));
      });
    });
    recorder.addEventListener("error", (event) => {
      const failure = event as Event & { error?: DOMException };
      void this.handleInterruption(failure.error?.message || "录音编码被系统中断");
    });

    this.stream = stream;
    this.track = stream.getAudioTracks()[0];
    this.recorder = recorder;
    this.currentSegment = segment;
    this.currentSegmentStartedAt = Date.now();
    this.installTrackListeners();
    this.installDeviceListener();
    manifest.segments.push(segment);
    await this.persistManifest();
    recorder.start(RECORDING_CHUNK_MILLISECONDS);
    this.setState("recording", "录音中，内容正在安全分段保存");
    this.scheduleRotation();
    this.startTicking();
  }

  private async stopCurrentSegment(): Promise<void> {
    const recorder = this.recorder;
    const segment = this.currentSegment;
    const startedAt = this.currentSegmentStartedAt;
    this.clearRotationTimer();
    this.removeTrackListeners();
    if (!recorder || !segment) {
      this.stopStream();
      return;
    }
    const stopped = new Promise<void>((resolve) => recorder.addEventListener("stop", () => resolve(), { once: true }));
    if (recorder.state !== "inactive") {
      try { recorder.requestData(); } catch { /* The final dataavailable event still fires on stop. */ }
      recorder.stop();
      await stopped;
    }
    this.stopStream();
    await this.appendQueue;
    if (this.pendingWriteError) throw this.pendingWriteError;

    const { stat } = require("node:fs/promises") as typeof import("node:fs/promises");
    const endedAt = new Date();
    const file = await stat(this.absolutePath(segment.relativePath));
    segment.endedAt = endedAt.toISOString();
    segment.durationMilliseconds = Math.max(0, endedAt.getTime() - startedAt);
    segment.fileSize = file.size;
    const manifest = this.requireManifest();
    if (file.size > 0) {
      manifest.recordedMilliseconds += segment.durationMilliseconds;
    } else {
      manifest.segments = manifest.segments.filter((item) => item.relativePath !== segment.relativePath);
    }
    this.recorder = undefined;
    this.currentSegment = undefined;
    this.currentSegmentStartedAt = 0;
    await this.persistManifest();
    this.emit();
  }

  private stopStream(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
    this.track = undefined;
  }

  private installTrackListeners(): void {
    const track = this.track;
    if (!track) return;
    this.trackMuteHandler = () => void this.handleInterruption("麦克风被其他通话或应用占用");
    this.trackEndedHandler = () => void this.handleInterruption("麦克风输入已断开");
    track.addEventListener("mute", this.trackMuteHandler);
    track.addEventListener("ended", this.trackEndedHandler);
  }

  private removeTrackListeners(): void {
    if (this.track && this.trackMuteHandler) this.track.removeEventListener("mute", this.trackMuteHandler);
    if (this.track && this.trackEndedHandler) this.track.removeEventListener("ended", this.trackEndedHandler);
    this.trackMuteHandler = undefined;
    this.trackEndedHandler = undefined;
  }

  private installDeviceListener(): void {
    if (this.deviceChangeHandler || !navigator.mediaDevices) return;
    this.deviceChangeHandler = () => {
      if (this.manifest?.state !== "recording") return;
      const track = this.track;
      if (!track || track.readyState === "ended" || track.muted) {
        void this.handleInterruption("麦克风设备发生变化");
      }
    };
    navigator.mediaDevices.addEventListener("devicechange", this.deviceChangeHandler);
  }

  private removeDeviceListener(): void {
    if (this.deviceChangeHandler) navigator.mediaDevices?.removeEventListener("devicechange", this.deviceChangeHandler);
    this.deviceChangeHandler = undefined;
  }

  private async handleInterruption(reason: string): Promise<void> {
    if (this.userRequestedStop || this.manifest?.state !== "recording") return;
    if (this.interruptionPromise) return this.interruptionPromise;
    this.interruptionPromise = (async () => {
      const manifest = this.requireManifest();
      manifest.interruptions.push({ startedAt: new Date().toISOString(), reason });
      this.setState("interrupted", `${reason}，已有片段已保存`);
      try {
        await this.stopCurrentSegment();
        if (!this.userRequestedStop) await this.tryResume(reason, true);
      } catch (error) {
        this.setNeedsAttention(error);
      }
    })().finally(() => {
      this.interruptionPromise = undefined;
    });
    return this.interruptionPromise;
  }

  private async tryResume(reason: string, keepWaiting: boolean): Promise<void> {
    const manifest = this.requireManifest();
    this.clearPassiveResumeTimer();
    const generation = ++this.resumeGeneration;
    this.setState("resuming", `${reason}，等待系统归还麦克风`);
    let lastError: unknown;
    for (const delay of RECORDING_RESUME_DELAYS_MS) {
      if (delay) await sleep(delay);
      if (this.userRequestedStop || generation !== this.resumeGeneration) return;
      try {
        const stream = await this.requestAudioStream();
        await this.beginSegment(stream);
        this.closeLatestInterruption(true);
        manifest.lastError = undefined;
        await this.persistManifest();
        this.emit();
        return;
      } catch (error) {
        lastError = error;
      }
    }
    if (keepWaiting && manifest.segments.length && !this.userRequestedStop) {
      manifest.lastError = undefined;
      this.setState("interrupted", "麦克风仍被占用，将在系统归还后自动继续");
      this.schedulePassiveResume(reason, generation);
      return;
    }
    this.closeLatestInterruption(false);
    this.setNeedsAttention(lastError ?? new Error("系统尚未归还麦克风"));
  }

  private schedulePassiveResume(reason: string, generation: number): void {
    this.clearPassiveResumeTimer();
    this.passiveResumeTimer = window.setTimeout(() => {
      this.passiveResumeTimer = undefined;
      if (this.userRequestedStop || generation !== this.resumeGeneration || this.manifest?.state !== "interrupted") return;
      void this.requestAudioStream().then(async (stream) => {
        if (this.userRequestedStop || generation !== this.resumeGeneration) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        await this.beginSegment(stream);
        this.closeLatestInterruption(true);
        const manifest = this.requireManifest();
        manifest.lastError = undefined;
        await this.persistManifest();
        this.emit();
      }).catch(() => {
        if (!this.userRequestedStop && generation === this.resumeGeneration) {
          this.schedulePassiveResume(reason, generation);
        }
      });
    }, 10_000);
  }

  private clearPassiveResumeTimer(): void {
    if (this.passiveResumeTimer !== undefined) window.clearTimeout(this.passiveResumeTimer);
    this.passiveResumeTimer = undefined;
  }

  private closeLatestInterruption(resumedAutomatically: boolean): void {
    const interruption = this.manifest?.interruptions.at(-1);
    if (!interruption || interruption.endedAt) return;
    interruption.endedAt = new Date().toISOString();
    interruption.resumedAutomatically = resumedAutomatically;
  }

  private scheduleRotation(): void {
    this.clearRotationTimer();
    this.rotationTimer = window.setTimeout(() => {
      if (this.manifest?.state !== "recording" || this.userRequestedStop) return;
      void this.rotateSegment();
    }, RECORDING_SAFETY_ROTATION_MILLISECONDS);
  }

  private async rotateSegment(): Promise<void> {
    const stream = this.stream;
    if (!stream || this.manifest?.state !== "recording") return;
    this.removeTrackListeners();
    try {
      await this.stopCurrentSegment();
      if (this.userRequestedStop) return;
      const replacement = await this.requestAudioStream();
      await this.beginSegment(replacement);
    } catch (error) {
      this.setNeedsAttention(error);
    }
  }

  private clearRotationTimer(): void {
    if (this.rotationTimer !== undefined) window.clearTimeout(this.rotationTimer);
    this.rotationTimer = undefined;
  }

  private startTicking(): void {
    this.stopTicking();
    this.tickTimer = window.setInterval(() => this.emit(), 500);
  }

  private stopTicking(): void {
    if (this.tickTimer !== undefined) window.clearInterval(this.tickTimer);
    this.tickTimer = undefined;
  }

  private async mergeSegments(): Promise<string> {
    const manifest = this.requireManifest();
    const adapter = this.requireFileSystemAdapter();
    const folder = normalizePath(this.host.getRecordingFolder()).replace(/^\/+|\/+$/g, "");
    const { access, copyFile, mkdir, writeFile } = require("node:fs/promises") as typeof import("node:fs/promises");
    const { dirname, join } = require("node:path") as typeof import("node:path");
    const base = safeFileName(manifest.title);
    let relativePath = normalizePath(`${folder}/${base}.m4a`);
    let suffix = 2;
    while (await access(adapter.getFullPath(relativePath)).then(() => true).catch(() => false)) {
      relativePath = normalizePath(`${folder}/${base} ${suffix}.m4a`);
      suffix += 1;
    }
    const outputAbsolutePath = adapter.getFullPath(relativePath);
    await mkdir(dirname(outputAbsolutePath), { recursive: true });
    const ffmpeg = await resolveLocalExecutable(this.host.getFfmpegPath().trim() || "ffmpeg");
    if (ffmpeg) {
      const concatPath = join(this.absolutePath(this.sessionRelativePath), "segments.txt");
      const lines = manifest.segments.map((segment) => {
        const absolute = this.absolutePath(segment.relativePath).replace(/'/g, "'\\''");
        return `file '${absolute}'`;
      });
      await writeFile(concatPath, `${lines.join("\n")}\n`, "utf8");
      const result = await runLocalCommand(ffmpeg, [
        "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", concatPath,
        "-vn",
        "-c:a", "aac",
        "-b:a", "128k",
        outputAbsolutePath,
      ], "", 4 * 60 * 60);
      if (result.exitCode === 0) return relativePath;
      if (manifest.segments.length > 1) {
        throw new Error(result.stderr.trim() || "FFmpeg 无法合并录音片段；原始片段已经安全保留");
      }
    }
    if (manifest.segments.length !== 1) {
      throw new Error("需要 FFmpeg 合并多个安全片段；原始片段已经安全保留");
    }
    const source = manifest.segments[0]!;
    const extension = recordingExtension(source.mimeType);
    relativePath = normalizePath(`${folder}/${base}.${extension}`);
    suffix = 2;
    while (await access(adapter.getFullPath(relativePath)).then(() => true).catch(() => false)) {
      relativePath = normalizePath(`${folder}/${base} ${suffix}.${extension}`);
      suffix += 1;
    }
    await copyFile(this.absolutePath(source.relativePath), adapter.getFullPath(relativePath));
    return relativePath;
  }

  private setState(state: DesktopRecordingState, message = stateMessage(state)): void {
    const manifest = this.requireManifest();
    manifest.state = state;
    manifest.lastError = state === "needs-attention" ? message : undefined;
    void this.persistManifest();
    this.emit();
  }

  private setNeedsAttention(error: unknown): void {
    const manifest = this.manifest;
    if (!manifest) return;
    manifest.state = "needs-attention";
    manifest.lastError = error instanceof Error ? error.message : String(error);
    this.clearRotationTimer();
    this.clearPassiveResumeTimer();
    this.stopTicking();
    void this.persistManifest();
    this.emit();
  }

  private persistManifest(): Promise<void> {
    const manifest = this.requireManifest();
    const path = this.absolutePath(normalizePath(`${this.sessionRelativePath}/manifest.json`));
    const content = `${JSON.stringify(manifest, null, 2)}\n`;
    this.manifestQueue = this.manifestQueue.then(async () => {
      const { mkdir, open, rename } = require("node:fs/promises") as typeof import("node:fs/promises");
      const { dirname } = require("node:path") as typeof import("node:path");
      await mkdir(dirname(path), { recursive: true });
      const temporaryPath = `${path}.tmp`;
      const handle = await open(temporaryPath, "w");
      try {
        await handle.writeFile(content, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporaryPath, path);
    });
    return this.manifestQueue;
  }

  private emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }

  private requireManifest(): DesktopRecordingManifest {
    if (!this.manifest) throw new Error("录音会话尚未创建");
    return this.manifest;
  }

  private requireFileSystemAdapter(): FileSystemAdapter {
    const adapter = this.host.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) throw new Error("当前 Vault 不是本地文件系统");
    return adapter;
  }

  private absolutePath(relativePath: string): string {
    return this.requireFileSystemAdapter().getFullPath(relativePath);
  }
}
