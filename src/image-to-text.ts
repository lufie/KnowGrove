import { FileSystemAdapter, TFile, normalizePath } from "obsidian";
import type { LookupAddress } from "node:dns";
import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { request as httpsRequest } from "node:https";
import type KnowGrovePlugin from "./main";
import { runAIImageProvider, type AIImageInput } from "./ai-provider";
import {
  assertImageBytes,
  createAIImageExecutionPlan,
  isPrivateImageAddress,
  supportsAIImageProvider,
  type AIImageExecutionPlan,
} from "./image-provider-core";
import { createPinnedImageLookup, normalizedImageHostname, resolvePublicImageAddresses } from "./image-network-core";
import { buildImageTextPrompt, resolveLocalImageTarget } from "./image-to-text-core";
import type { ImageTextTaskPhase } from "./image-text-progress-core";
import type { ImageOccurrence } from "./image-layout-core";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const REMOTE_IMAGE_TIMEOUT_MS = 30_000;
const IMAGE_TYPES = new Map([
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["webp", "image/webp"],
  ["gif", "image/gif"],
] as const);

function extensionFromTarget(target: string): string {
  const clean = target.split(/[?#]/, 1)[0] ?? target;
  return clean.split(".").pop()?.toLowerCase() ?? "";
}

function assertPublicRemoteUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("只支持 HTTP 或 HTTPS 图片");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new Error("不允许读取本机或局域网地址");
  }
  if (isPrivateImageAddress(host)) throw new Error("不允许读取本机或局域网地址");
  return url;
}

async function requestRemote(url: URL, addresses: LookupAddress[], signal?: AbortSignal): Promise<{
  status: number;
  headers: IncomingHttpHeaders;
  data: ArrayBuffer;
}> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("任务已由用户取消", "AbortError"));
      return;
    }
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, {
      method: "GET",
      headers: { Accept: "image/png,image/jpeg,image/webp,image/gif" },
      lookup: createPinnedImageLookup(normalizedImageHostname(url), addresses),
    }, (response) => {
      const chunks: Buffer[] = [];
      let total = 0;
      response.on("data", (chunk: Buffer) => {
        total += chunk.length;
        if (total > MAX_IMAGE_BYTES) {
          response.destroy(new Error("图片超过 15 MB 上限"));
          return;
        }
        chunks.push(chunk);
      });
      response.once("error", reject);
      response.once("end", () => {
        const buffer = Buffer.concat(chunks);
        resolve({
          status: response.statusCode ?? 0,
          headers: response.headers,
          data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
        });
      });
    });
    const abort = (): void => {
      request.destroy(new DOMException("任务已由用户取消", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    request.setTimeout(REMOTE_IMAGE_TIMEOUT_MS, () => {
      request.destroy(new Error("远程图片读取超过 30 秒，已停止"));
    });
    request.once("error", reject);
    request.once("close", () => signal?.removeEventListener("abort", abort));
    request.end();
  });
}

async function firstGifFrame(image: AIImageInput): Promise<AIImageInput> {
  if (image.mediaType !== "image/gif") return image;
  const sourceUrl = URL.createObjectURL(new Blob([image.data], { type: "image/gif" }));
  try {
    const decoded = new Image();
    decoded.decoding = "sync";
    await new Promise<void>((resolve, reject) => {
      decoded.onload = () => resolve();
      decoded.onerror = () => reject(new Error("GIF 首帧解码失败"));
      decoded.src = sourceUrl;
    });
    const canvas = createEl("canvas");
    canvas.width = decoded.naturalWidth;
    canvas.height = decoded.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context || !canvas.width || !canvas.height) throw new Error("GIF 首帧解码失败");
    context.drawImage(decoded, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error("GIF 首帧转换失败")), "image/png");
    });
    return {
      data: await blob.arrayBuffer(),
      mediaType: "image/png",
      extension: "png",
    };
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

async function fetchRemoteImage(source: string, signal?: AbortSignal): Promise<AIImageInput> {
  let current = assertPublicRemoteUrl(source);
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const addresses = await resolvePublicImageAddresses(current);
    const response = await requestRemote(current, addresses, signal);
    if (response.status >= 300 && response.status < 400) {
      const rawLocation = response.headers.location;
      const firstLocation: unknown = Array.isArray(rawLocation) ? (rawLocation as unknown[])[0] : rawLocation;
      const location = typeof firstLocation === "string" ? firstLocation : undefined;
      if (!location || redirects === 5) throw new Error("远程图片重定向无效或次数过多");
      current = assertPublicRemoteUrl(new URL(location, current).toString());
      continue;
    }
    if (response.status < 200 || response.status >= 300) throw new Error(`远程图片读取失败（HTTP ${response.status}）`);
    const declared = Number.parseInt(String(response.headers["content-length"] ?? ""), 10);
    if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) throw new Error("图片超过 15 MB 上限");
    const mediaType = String(response.headers["content-type"] ?? "").split(";", 1)[0]?.toLowerCase() ?? "";
    const allowed = [...IMAGE_TYPES.entries()].find(([, type]) => type === mediaType);
    if (!allowed) throw new Error(`不支持远程图片类型：${mediaType || "未知"}`);
    const data = response.data;
    if (data.byteLength > MAX_IMAGE_BYTES) throw new Error("图片超过 15 MB 上限");
    assertImageBytes(data, allowed[1]);
    return { data, mediaType: allowed[1], extension: allowed[0] === "jpeg" ? "jpg" : allowed[0] };
  }
  throw new Error("远程图片读取失败");
}

export class ImageToTextService {
  constructor(private readonly plugin: KnowGrovePlugin) {}

  async createExecutionPlan(): Promise<AIImageExecutionPlan> {
    const settings = { ...this.plugin.settings.aiProperties };
    const availability = await this.plugin.getAIProviders();
    return createAIImageExecutionPlan(
      settings,
      availability,
      this.plugin.getAISecret(settings.provider),
    );
  }

  supportsExecutionPlan(plan: AIImageExecutionPlan): boolean {
    return supportsAIImageProvider(plan.settings.provider);
  }

  async convert(
    file: TFile,
    occurrence: ImageOccurrence,
    plan: AIImageExecutionPlan,
    signal?: AbortSignal,
    onPhase?: (phase: Extract<ImageTextTaskPhase, "preparing" | "loading" | "calling-model" | "validating">) => void,
  ): Promise<string> {
    onPhase?.("preparing");
    const settings = plan.settings;
    if (!supportsAIImageProvider(settings.provider)) {
      throw new Error("当前模型不支持图片输入，请在设置中切换到 Codex CLI、Anthropic API 或 OpenAI 兼容视觉模型");
    }
    const selected = plan.availability.find((provider) => provider.id === settings.provider);
    if (!selected?.available) throw new Error(selected?.detail || "当前图片模型不可用");
    onPhase?.("loading");
    const image = await firstGifFrame(await this.loadImage(file, occurrence.target, signal));
    onPhase?.("calling-model");
    const result = await runAIImageProvider(
      settings,
      buildImageTextPrompt(),
      image,
      plan.availability,
      plan.apiKey,
      signal,
    );
    onPhase?.("validating");
    if (!result.trim()) throw new Error("模型没有返回可写入的图片识别结果，请重新转换");
    return result;
  }

  private async loadImage(file: TFile, target: string, signal?: AbortSignal): Promise<AIImageInput> {
    if (/^https?:\/\//i.test(target)) return fetchRemoteImage(target, signal);
    const vaultFiles = this.plugin.app.vault.getFiles();
    const resolved = resolveLocalImageTarget(
      target,
      (decoded) => this.plugin.app.metadataCache.getFirstLinkpathDest(decoded, file.path) ?? undefined,
      (path) => this.plugin.app.vault.getFileByPath(normalizePath(path)) ?? undefined,
      vaultFiles.map((candidate) => candidate.path),
    );
    if (!resolved) throw new Error(`找不到图片文件：${target}`);
    const extension = extensionFromTarget(resolved.path);
    const mediaType = IMAGE_TYPES.get(extension as "png" | "jpg" | "jpeg" | "webp" | "gif");
    if (!mediaType) throw new Error(`不支持图片格式：${extension || "未知"}；支持 PNG、JPEG、WebP、GIF`);
    if (resolved.stat.size > MAX_IMAGE_BYTES) throw new Error("图片超过 15 MB 上限");
    const data = await this.plugin.app.vault.readBinary(resolved);
    if (data.byteLength > MAX_IMAGE_BYTES) throw new Error("图片超过 15 MB 上限");
    assertImageBytes(data, mediaType);
    const adapter = this.plugin.app.vault.adapter;
    const localPath = adapter instanceof FileSystemAdapter ? adapter.getFullPath(resolved.path) : undefined;
    return {
      data,
      mediaType,
      extension: extension === "jpeg" ? "jpg" : extension as "png" | "jpg" | "webp" | "gif",
      localPath,
    };
  }
}
