export type KnowGroveRuntimeMode = "auto" | "managed" | "existing";
export type KnowGroveRuntimePlatform = "darwin-arm64" | "darwin-x64" | "win32-x64";

export const KNOWGROVE_RUNTIME_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAZHLYiOkzTqqtqmPwgSDqfT2zLgRbsU8PNqLy/DQux/s=
-----END PUBLIC KEY-----`;

export const DEFAULT_RUNTIME_MANIFEST_URLS = [
  "https://cnb.cool/lufie-knowgrove/knowgrove-runtime/-/releases/download/runtime-v1.0.1/runtime-manifest.json",
  "https://github.com/lufie/KnowGrove-runtime/releases/latest/download/runtime-manifest.json",
] as const;
export type KnowGroveRuntimeArtifactId =
  | "yt-dlp"
  | "ffmpeg"
  | "ffprobe"
  | "whisper"
  | "whisper-model"
  | "skill-pack"
  | "notices";

export interface KnowGroveRuntimeArtifact {
  id: KnowGroveRuntimeArtifactId;
  target: string;
  sha256: string;
  size: number;
  executable?: boolean;
  urls: string[];
}

export interface KnowGroveRuntimePlatformRelease {
  artifacts: KnowGroveRuntimeArtifact[];
}

export interface KnowGroveRuntimeManifest {
  schemaVersion: 1;
  runtimeVersion: string;
  minimumPluginVersion: string;
  generatedAt: string;
  platforms: Partial<Record<KnowGroveRuntimePlatform, KnowGroveRuntimePlatformRelease>>;
  signature: string;
}

export interface KnowGroveRuntimeInstallationRecord {
  runtimeVersion: string;
  platform: KnowGroveRuntimePlatform;
  installedAt: string;
  files: Partial<Record<KnowGroveRuntimeArtifactId, string>>;
}

export interface KnowGroveRuntimeSettings {
  mode: KnowGroveRuntimeMode;
  manifestUrl: string;
  preferExistingTools: boolean;
  autoUpdateSkillPack: boolean;
  lastAuditAt: string;
  lastInstallError: string;
}

export interface KnowGroveRuntimeCapability {
  id: "article" | "video" | "audio" | "ai";
  name: string;
  status: "ready" | "needs-setup" | "unavailable";
  detail: string;
}

export interface KnowGroveRuntimeAudit {
  desktop: boolean;
  platform?: KnowGroveRuntimePlatform;
  runtimeRoot: string;
  sourceReachable: boolean;
  sourceDetail: string;
  packageSizeBytes?: number;
  diskFreeBytes?: number;
  tools: Partial<Record<KnowGroveRuntimeArtifactId, string>>;
  capabilities: KnowGroveRuntimeCapability[];
  checkedAt: string;
}

export interface KnowGroveSkillPackEntry {
  id: string;
  purpose: string;
  prompt: string;
  output: string[];
}

export interface KnowGroveSkillPack {
  schemaVersion: 1;
  version: string;
  minimumPluginVersion: string;
  skills: {
    article: KnowGroveSkillPackEntry;
    video: KnowGroveSkillPackEntry;
    audio: KnowGroveSkillPackEntry;
  };
}

const SUPPORTED_PLATFORMS = new Set<KnowGroveRuntimePlatform>([
  "darwin-arm64",
  "darwin-x64",
  "win32-x64",
]);

const ARTIFACT_IDS = new Set<KnowGroveRuntimeArtifactId>([
  "yt-dlp",
  "ffmpeg",
  "ffprobe",
  "whisper",
  "whisper-model",
  "skill-pack",
  "notices",
]);

export function detectRuntimePlatform(
  platform: string,
  arch: string,
): KnowGroveRuntimePlatform | undefined {
  const key = `${platform}-${arch}` as KnowGroveRuntimePlatform;
  return SUPPORTED_PLATFORMS.has(key) ? key : undefined;
}

export function compareRuntimeVersions(left: string, right: string): number {
  const parse = (value: string): number[] => value
    .trim()
    .replace(/^v/i, "")
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .map((part) => Number.isFinite(part) && part >= 0 ? part : 0);
  const leftParts = parse(left);
  const rightParts = parse(right);
  const length = Math.max(leftParts.length, rightParts.length, 3);
  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }
  return 0;
}

export function runtimeManifestCandidates(configuredUrl = ""): string[] {
  return Array.from(new Set([
    configuredUrl.trim(),
    ...DEFAULT_RUNTIME_MANIFEST_URLS,
  ].filter(Boolean)));
}

export function selectNewestRuntimeManifest<T extends {
  manifest: Pick<KnowGroveRuntimeManifest, "runtimeVersion">;
  url: string;
}>(candidates: T[]): T | undefined {
  return [...candidates].sort((left, right) =>
    compareRuntimeVersions(right.manifest.runtimeVersion, left.manifest.runtimeVersion),
  )[0];
}

export function stableRuntimeJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableRuntimeJson(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableRuntimeJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function unsignedRuntimeManifest(
  manifest: KnowGroveRuntimeManifest,
): Omit<KnowGroveRuntimeManifest, "signature"> {
  const { signature: _signature, ...unsigned } = manifest;
  return unsigned;
}

function assertSafeTarget(target: string): void {
  if (!target || target.startsWith("/") || target.startsWith("\\") || /^[a-z]:/i.test(target)) {
    throw new Error(`运行包目标路径无效：${target}`);
  }
  const segments = target.split(/[\\/]/);
  if (segments.some((segment) => segment === ".." || segment === "")) {
    throw new Error(`运行包目标路径不安全：${target}`);
  }
}

export function validateRuntimeManifest(value: unknown): KnowGroveRuntimeManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("运行包清单不是 JSON 对象");
  }
  const manifest = value as Partial<KnowGroveRuntimeManifest>;
  if (manifest.schemaVersion !== 1) throw new Error("不支持的运行包清单版本");
  if (!manifest.runtimeVersion || !manifest.minimumPluginVersion || !manifest.generatedAt) {
    throw new Error("运行包清单缺少版本信息");
  }
  if (!manifest.signature || !/^[A-Za-z0-9+/=]+$/.test(manifest.signature)) {
    throw new Error("运行包清单缺少有效签名");
  }
  if (!manifest.platforms || typeof manifest.platforms !== "object") {
    throw new Error("运行包清单缺少平台定义");
  }
  for (const [platform, release] of Object.entries(manifest.platforms)) {
    if (!SUPPORTED_PLATFORMS.has(platform as KnowGroveRuntimePlatform)) {
      throw new Error(`运行包清单包含未知平台：${platform}`);
    }
    if (!release || !Array.isArray(release.artifacts)) {
      throw new Error(`运行包平台 ${platform} 缺少文件列表`);
    }
    const ids = new Set<string>();
    for (const artifact of release.artifacts) {
      if (!ARTIFACT_IDS.has(artifact.id)) throw new Error(`未知运行包组件：${artifact.id}`);
      if (ids.has(artifact.id)) throw new Error(`运行包组件重复：${platform}/${artifact.id}`);
      ids.add(artifact.id);
      assertSafeTarget(artifact.target);
      if (!/^[a-f0-9]{64}$/i.test(artifact.sha256)) {
        throw new Error(`运行包组件校验值无效：${artifact.id}`);
      }
      if (!Number.isSafeInteger(artifact.size) || artifact.size <= 0) {
        throw new Error(`运行包组件大小无效：${artifact.id}`);
      }
      if (!Array.isArray(artifact.urls) || !artifact.urls.length) {
        throw new Error(`运行包组件缺少下载地址：${artifact.id}`);
      }
      for (const url of artifact.urls) {
        const parsed = new URL(url);
        if (parsed.protocol !== "https:") throw new Error(`运行包下载地址必须使用 HTTPS：${artifact.id}`);
      }
    }
  }
  return manifest as KnowGroveRuntimeManifest;
}

export function platformArtifacts(
  manifest: KnowGroveRuntimeManifest,
  platform: KnowGroveRuntimePlatform,
): KnowGroveRuntimeArtifact[] {
  const release = manifest.platforms[platform];
  if (!release) throw new Error(`当前发布不支持 ${platform}`);
  return release.artifacts;
}

export function totalArtifactBytes(artifacts: KnowGroveRuntimeArtifact[]): number {
  return artifacts.reduce((total, artifact) => total + artifact.size, 0);
}

export function formatRuntimeBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

export function runtimeProgressRatio(completedBytes: number, totalBytes: number): number {
  if (!Number.isFinite(completedBytes) || !Number.isFinite(totalBytes) || totalBytes <= 0) return 0;
  return Math.min(1, Math.max(0, completedBytes / totalBytes));
}

export function shouldRestartRuntimeDownload(errorMessage: string): boolean {
  return errorMessage.includes("不支持断点续传");
}

export function validateSkillPack(value: unknown): KnowGroveSkillPack {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Skill Pack 不是 JSON 对象");
  const pack = value as Partial<KnowGroveSkillPack>;
  if (pack.schemaVersion !== 1 || !pack.version || !pack.minimumPluginVersion || !pack.skills) {
    throw new Error("Skill Pack 缺少版本或技能定义");
  }
  for (const id of ["article", "video", "audio"] as const) {
    const skill = pack.skills[id];
    if (!skill?.id || !skill.purpose || !skill.prompt || !Array.isArray(skill.output)) {
      throw new Error(`Skill Pack 缺少 ${id} 定义`);
    }
    if (skill.prompt.length > 8_000) throw new Error(`Skill Pack 的 ${id} 提示词超过安全上限`);
    if (skill.output.some((item) => typeof item !== "string" || item.length > 80)) {
      throw new Error(`Skill Pack 的 ${id} 输出字段无效`);
    }
  }
  return pack as KnowGroveSkillPack;
}
