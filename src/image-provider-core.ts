import type { AIPropertySettings, AIProviderAvailability, AIProviderId } from "./types";
import { isIP } from "node:net";

export interface AIImageExecutionPlan {
  settings: AIPropertySettings;
  availability: AIProviderAvailability[];
  apiKey?: string;
}

export function createAIImageExecutionPlan(
  settings: AIPropertySettings,
  availability: AIProviderAvailability[],
  apiKey?: string,
): AIImageExecutionPlan {
  const frozenAvailability = availability.map((provider) => ({
    ...provider,
    models: provider.models ? [...provider.models] : undefined,
  }));
  const selected = frozenAvailability.find((provider) => provider.id === settings.provider);
  return {
    settings: {
      ...settings,
      model: settings.model.trim() || selected?.configuredModel || settings.model,
    },
    availability: frozenAvailability,
    apiKey,
  };
}

export function supportsAIImageProvider(provider: AIProviderId): boolean {
  return provider === "codex-cli" || provider === "anthropic-api" || provider === "openai-compatible";
}

function uint32Be(bytes: Uint8Array, offset: number): number {
  return (((bytes[offset] ?? 0) << 24) | ((bytes[offset + 1] ?? 0) << 16)
    | ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0)) >>> 0;
}

function uint32Le(bytes: Uint8Array, offset: number): number {
  return (((bytes[offset + 3] ?? 0) << 24) | ((bytes[offset + 2] ?? 0) << 16)
    | ((bytes[offset + 1] ?? 0) << 8) | (bytes[offset] ?? 0)) >>> 0;
}

function ascii(bytes: Uint8Array, from: number, length: number): string {
  return String.fromCharCode(...bytes.slice(from, from + length));
}

function validPng(bytes: Uint8Array): boolean {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 45 || !signature.every((value, index) => bytes[index] === value)) return false;
  let cursor = 8;
  let hasHeader = false;
  while (cursor + 12 <= bytes.length) {
    const length = uint32Be(bytes, cursor);
    const type = ascii(bytes, cursor + 4, 4);
    const next = cursor + 12 + length;
    if (next > bytes.length) return false;
    if (type === "IHDR") {
      if (cursor !== 8 || length !== 13 || uint32Be(bytes, cursor + 8) === 0 || uint32Be(bytes, cursor + 12) === 0) return false;
      hasHeader = true;
    }
    if (type === "IEND") return hasHeader && length === 0;
    cursor = next;
  }
  return false;
}

function validJpeg(bytes: Uint8Array): boolean {
  if (bytes.length < 12 || bytes[0] !== 0xff || bytes[1] !== 0xd8
    || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) return false;
  let cursor = 2;
  let hasFrame = false;
  while (cursor + 1 < bytes.length) {
    if (bytes[cursor] !== 0xff) return false;
    while (bytes[cursor] === 0xff) cursor += 1;
    const marker = bytes[cursor] ?? 0;
    cursor += 1;
    if (marker === 0xd9) return hasFrame;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (cursor + 2 > bytes.length) return false;
    const length = ((bytes[cursor] ?? 0) << 8) | (bytes[cursor + 1] ?? 0);
    if (length < 2 || cursor + length > bytes.length) return false;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (length < 8) return false;
      const height = ((bytes[cursor + 3] ?? 0) << 8) | (bytes[cursor + 4] ?? 0);
      const width = ((bytes[cursor + 5] ?? 0) << 8) | (bytes[cursor + 6] ?? 0);
      if (!width || !height) return false;
      hasFrame = true;
    }
    if (marker === 0xda) return hasFrame;
    cursor += length;
  }
  return false;
}

export function detectedImageMediaType(data: ArrayBuffer): "image/png" | "image/jpeg" | "image/webp" | "image/gif" | undefined {
  const bytes = new Uint8Array(data);
  if (validPng(bytes)) return "image/png";
  if (validJpeg(bytes)) return "image/jpeg";
  if (bytes.length >= 16 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP"
    && ["VP8 ", "VP8L", "VP8X"].includes(ascii(bytes, 12, 4))
    && uint32Le(bytes, 4) + 8 === bytes.length) return "image/webp";
  if (bytes.length >= 14 && ["GIF87a", "GIF89a"].includes(ascii(bytes, 0, 6))
    && (bytes[6] ?? 0) + ((bytes[7] ?? 0) << 8) > 0
    && (bytes[8] ?? 0) + ((bytes[9] ?? 0) << 8) > 0
    && bytes[bytes.length - 1] === 0x3b) return "image/gif";
  return undefined;
}

export function assertImageBytes(data: ArrayBuffer, expectedMediaType: string): void {
  const detected = detectedImageMediaType(data);
  if (!detected) throw new Error("图片文件已损坏或实际内容不是受支持的图片");
  if (detected !== expectedMediaType) throw new Error(`图片实际格式与声明类型不一致（${detected} / ${expectedMediaType}）`);
}

function nonPublicIPv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  return octets.length === 4 && octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255) && (
    octets[0] === 10 || octets[0] === 127 || octets[0] === 0
    || (octets[0] === 100 && (octets[1] ?? 0) >= 64 && (octets[1] ?? 0) <= 127)
    || (octets[0] === 169 && octets[1] === 254)
    || (octets[0] === 172 && (octets[1] ?? 0) >= 16 && (octets[1] ?? 0) <= 31)
    || (octets[0] === 192 && octets[1] === 0 && octets[2] === 0)
    || (octets[0] === 192 && octets[1] === 0 && octets[2] === 2)
    || (octets[0] === 192 && octets[1] === 168)
    || (octets[0] === 198 && ((octets[1] ?? 0) === 18 || (octets[1] ?? 0) === 19))
    || (octets[0] === 198 && octets[1] === 51 && octets[2] === 100)
    || (octets[0] === 203 && octets[1] === 0 && octets[2] === 113)
    || (octets[0] ?? 0) >= 224
  );
}

function ipv6Words(address: string): number[] | undefined {
  let normalized = address.toLowerCase().split("%", 1)[0] ?? "";
  const dottedTail = normalized.match(/(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (dottedTail) {
    const octets = dottedTail.split(".").map(Number);
    if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return undefined;
    const high = ((octets[0] ?? 0) << 8) | (octets[1] ?? 0);
    const low = ((octets[2] ?? 0) << 8) | (octets[3] ?? 0);
    normalized = `${normalized.slice(0, -dottedTail.length)}${high.toString(16)}:${low.toString(16)}`;
  }
  const halves = normalized.split("::");
  if (halves.length > 2) return undefined;
  const parseHalf = (value: string): number[] | undefined => {
    if (!value) return [];
    const groups = value.split(":");
    if (groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return undefined;
    return groups.map((group) => Number.parseInt(group, 16));
  };
  const left = parseHalf(halves[0] ?? "");
  const right = parseHalf(halves[1] ?? "");
  if (!left || !right) return undefined;
  if (halves.length === 1) return left.length === 8 ? left : undefined;
  const fill = 8 - left.length - right.length;
  if (fill < 1) return undefined;
  return [...left, ...Array<number>(fill).fill(0), ...right];
}

function globallyReachableIetfProtocolAddress(words: number[]): boolean {
  if (words[0] !== 0x2001 || (words[1] ?? 0) > 0x01ff) return false;
  const suffixIsAnycast = words.slice(2, 7).every((word) => word === 0)
    && ((words[7] ?? 0) >= 1 && (words[7] ?? 0) <= 3);
  if (words[1] === 0x0001 && suffixIsAnycast) return true;
  if (words[1] === 0x0003) return true;
  if (words[1] === 0x0004 && words[2] === 0x0112) return true;
  if ((words[1] ?? 0) >= 0x0020 && (words[1] ?? 0) <= 0x002f) return true;
  return (words[1] ?? 0) >= 0x0030 && (words[1] ?? 0) <= 0x003f;
}

export function isPrivateImageAddress(host: string): boolean {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (isIP(normalized) === 4) return nonPublicIPv4(normalized);
  if (isIP(normalized) !== 6) return false;
  const words = ipv6Words(normalized);
  if (!words) return true;
  const mapped = words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff;
  if (mapped) {
    const high = words[6] ?? 0;
    const low = words[7] ?? 0;
    return nonPublicIPv4(`${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`);
  }
  // Unspecified, loopback and deprecated IPv4-compatible forms are all local/non-public.
  if (words.slice(0, 6).every((word) => word === 0)) return true;
  // Only global-unicast 2000::/3 addresses are eligible for remote image reads.
  if (((words[0] ?? 0) & 0xe000) !== 0x2000) return true;
  // IANA marks 2001::/23 non-global except the more-specific globally reachable registrations.
  if (words[0] === 0x2001 && (words[1] ?? 0) <= 0x01ff && !globallyReachableIetfProtocolAddress(words)) return true;
  // Exclude documentation and 6to4 ranges elsewhere in global-unicast space.
  if (words[0] === 0x2001 && words[1] === 0x0db8) return true;
  if (words[0] === 0x2002) return true;
  if (words[0] === 0x3fff && ((words[1] ?? 0) & 0xf000) === 0) return true;
  return false;
}

export function buildCodexImageArguments(model: string, imagePath: string): string[] {
  const args = [
    "exec",
    "--ephemeral",
    "--skip-git-repo-check",
    "--ignore-rules",
    "--sandbox",
    "read-only",
    "--color",
    "never",
    "--json",
    "--image",
    imagePath,
  ];
  if (model.trim()) args.push("--model", model.trim());
  args.push("-");
  return args;
}
