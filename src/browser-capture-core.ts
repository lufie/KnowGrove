import type { AIProviderId } from "./types";

import type { KnowGroveLocale } from "./i18n";

export type BrowserCapturePageType = "article" | "video" | "audio";

export function selectedCaptureProvider(
  globalProvider: AIProviderId,
  _pageType: BrowserCapturePageType,
): AIProviderId {
  return globalProvider;
}

export interface LinkNoteCandidate {
  url: string;
  title: string;
  pageType?: BrowserCapturePageType;
  mediaPath?: string;
}

export interface InterruptedCaptureCandidate extends LinkNoteCandidate {
  pageType: BrowserCapturePageType;
  source: string;
  mediaPath?: string;
}

export interface BrowserCaptureSkill {
  id: string;
  label: string;
  contentTypes: BrowserCapturePageType[];
  description: string;
  stages: string[];
}

export interface BrowserCaptureAIResult {
  summary: string;
  keyPoints: string[];
  bodyMarkdown: string;
  mode: "article" | "single-speaker" | "multi-speaker";
}

export interface ExtractedArticle {
  title: string;
  author: string;
  publishedAt: string;
  source: string;
}

export interface BrowserCaptureResourceHints {
  finalUrl?: string;
  contentType?: string;
  contentDisposition?: string;
  html?: string;
  pageTypeHint?: string;
}

export interface BrowserCaptureMediaCandidate {
  url: string;
  pageType: "video" | "audio";
  label?: string;
}

export interface SavedDomainSession {
  domain: string;
  cookies: BrowserCaptureSessionCookie[];
  userAgent?: string;
  referer?: string;
  updatedAt: number;
}

export interface VimeoResolvedMedia {
  title: string;
  duration?: number;
  author?: string;
  streamUrl?: string;
  hlsUrl?: string;
  progressiveUrl?: string;
}

export interface TikTokResolvedMedia {
  title: string;
  author?: string;
  duration?: number;
  playUrl?: string;
  audioUrl?: string;
  coverUrl?: string;
}

export interface TencentVideoResolvedMeta {
  title: string;
  coverUrl?: string;
}

export interface XiguaResolvedMedia {
  title: string;
  duration?: number;
  author?: string;
  coverUrl?: string;
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

export interface ApplePodcastLookupItem {
  wrapperType?: string;
  kind?: string;
  trackId?: number;
  trackName?: string;
  episodeUrl?: string;
}

export interface ApplePodcastEpisode {
  title: string;
  mediaUrl: string;
}

export type WhisperImplementation = "openai-whisper" | "whisper-cpp";

export interface WhisperInvocation {
  args: string[];
  transcriptPath?: string;
}

const VIDEO_HOSTS = [
  "youtube.com",
  "youtu.be",
  "bilibili.com",
  "b23.tv",
  "v.qq.com",
  "youku.com",
  "tudou.com",
  "iqiyi.com",
  "douyin.com",
  "ixigua.com",
  "tiktok.com",
  "weibo.tv",
  "instagram.com",
  "vimeo.com",
  "dailymotion.com",
  "twitch.tv",
  "facebook.com",
  "fb.watch",
];

const AUDIO_HOSTS = [
  "podcasts.apple.com",
  "podcasts.google.com",
  "music.163.com",
  "audio.com",
  "soundcloud.com",
  "ximalaya.com",
  "qingting.fm",
  "open.spotify.com",
  "podbean.com",
];

const VIDEO_EXTENSIONS = /\.(?:mp4|mov|mkv|m4v)(?:$|[?#])/i;
const AUDIO_EXTENSIONS = /\.(?:mp3|m4a|wav|aac|flac|ogg|opus|webm)(?:$|[?#])/i;
const YT_DLP_BROWSER_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

export const BROWSER_CAPTURE_SKILLS: BrowserCaptureSkill[] = [
  {
    id: "article-to-obsidian",
    label: "网页文章入库",
    contentTypes: ["article"],
    description: "提取公开网页正文，生成摘要、要点和知识笔记，并保留原文。",
    stages: ["网页提取", "原文备份", "AI 整理", "写入 Vault"],
  },
  {
    id: "video-to-obsidian",
    label: "视频转写入库",
    contentTypes: ["video"],
    description: "优先读取公开视频字幕，必要时下载音频并使用 Whisper 转录。",
    stages: ["字幕或音频", "转录", "原文备份", "AI 整理"],
  },
  {
    id: "audio-to-obsidian",
    label: "语音转写入库",
    contentTypes: ["audio"],
    description: "保存公开音频，使用本机 Whisper 转录，再由 AI 生成摘要和结构化笔记。",
    stages: ["保存音频", "转录", "逐字稿备份", "AI 总结"],
  },
];

export function classifyBrowserCaptureUrl(url: string): BrowserCapturePageType {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const isWeiboVideo = (host.endsWith("weibo.com") || host === "weibo.tv") && (parsed.pathname.startsWith("/tv") || parsed.pathname.startsWith("/show") || parsed.pathname.includes("/video"));
    const isWeChatChannels = (host === "weixin.qq.com" && parsed.pathname.startsWith("/sph/")) || host === "channels.weixin.qq.com";
    const isInstagramMedia = (host === "instagram.com" || host.endsWith(".instagram.com")) && /^\/(?:reel|reels|p|tv)\//i.test(parsed.pathname);
    const isShortVideoHost = host === "v.douyin.com" || host === "vt.tiktok.com" || host === "vm.tiktok.com" || host === "v.ixigua.com" || host === "b23.tv" || host === "youtu.be";
    if (AUDIO_EXTENSIONS.test(parsed.href) || AUDIO_HOSTS.some((candidate) =>
      host === candidate || host.endsWith(`.${candidate}`),
    )) return "audio";
    return isWeiboVideo || isWeChatChannels || isInstagramMedia || isShortVideoHost || VIDEO_EXTENSIONS.test(parsed.href) || VIDEO_HOSTS.some((candidate) =>
      host === candidate || host.endsWith(`.${candidate}`),
    )
      ? "video"
      : "article";
  } catch {
    return "article";
  }
}

export function selectApplePodcastEpisode(
  captureUrl: string,
  items: ApplePodcastLookupItem[],
): ApplePodcastEpisode | undefined {
  let requestedEpisode = "";
  try {
    const parsed = new URL(captureUrl);
    if (parsed.hostname.toLowerCase() !== "podcasts.apple.com") return undefined;
    requestedEpisode = parsed.searchParams.get("i")?.trim() ?? "";
  } catch {
    return undefined;
  }
  const episodes = items.filter((item) =>
    item.wrapperType === "podcastEpisode"
    && item.kind === "podcast-episode"
    && typeof item.episodeUrl === "string"
    && /^https?:\/\//i.test(item.episodeUrl),
  );
  const selected = requestedEpisode
    ? episodes.find((item) => String(item.trackId ?? "") === requestedEpisode)
    : episodes[0];
  if (!selected?.episodeUrl) return undefined;
  return {
    title: selected.trackName?.trim() || "Podcast episode",
    mediaUrl: selected.episodeUrl,
  };
}

export function classifyBrowserCaptureResource(
  url: string,
  hints: BrowserCaptureResourceHints = {},
): BrowserCapturePageType {
  const explicitHint = String(hints.pageTypeHint ?? "").toLowerCase();
  if (explicitHint === "audio" || explicitHint === "video") return explicitHint;
  const contentType = String(hints.contentType ?? "").split(";")[0]!.trim().toLowerCase();
  if (contentType.startsWith("audio/")) return "audio";
  if (contentType.startsWith("video/")) return "video";
  const disposition = String(hints.contentDisposition ?? "");
  if (AUDIO_EXTENSIONS.test(disposition)) return "audio";
  if (VIDEO_EXTENSIONS.test(disposition)) return "video";
  const resolvedType = classifyBrowserCaptureUrl(hints.finalUrl || url);
  if (resolvedType !== "article") return resolvedType;
  const originalType = classifyBrowserCaptureUrl(url);
  if (originalType !== "article") return originalType;
  const html = String(hints.html ?? "");
  const metaSignals = Array.from(html.matchAll(/<meta\b[^>]*>/gi)).map((match) => {
    const tag = match[0];
    const name = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase() ?? "";
    const content = tag.match(/\bcontent\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase() ?? "";
    return { name, content };
  });
  const visibleTextLength = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim().length;
  if (
    metaSignals.some(({ name, content }) =>
      ((name === "og:type" || name === "twitter:card") && /video|player/.test(content))
      || /^(?:og:video|twitter:player)(?::|$)/.test(name),
    )
    || (visibleTextLength < 2_000
      && /<(?:video|source)\b[^>]*(?:type=["']video\/|src=["'][^"']+\.(?:mp4|mov|mkv|m4v))/i.test(html))
  ) return "video";
  if (
    metaSignals.some(({ name, content }) =>
      (name === "og:type" && /audio|music/.test(content))
      || /^og:audio(?::|$)/.test(name),
    )
    || (visibleTextLength < 2_000
      && /<(?:audio|source)\b[^>]*(?:type=["']audio\/|src=["'][^"']+\.(?:mp3|m4a|wav|aac|flac|ogg|opus|webm))/i.test(html))
  ) return "audio";
  return "article";
}

export function detectCaptureErrorShell(input: {
  title?: string;
  text?: string;
  html?: string;
}): string | undefined {
  const title = String(input.title ?? "").replace(/\s+/g, " ").trim();
  const text = String(input.text ?? "").replace(/\s+/g, " ").trim();
  const html = String(input.html ?? "");
  const haystack = `${title}\n${text.slice(0, 8_000)}\n${html.slice(0, 20_000)}`;
  const explicitPatterns: Array<[RegExp, string]> = [
    [/你访问的页面不见了|当前笔记暂时无法浏览|内容已删除或不可见|该内容无法查看/, "页面内容不存在或已经失效"],
    [/verify you are human|checking your browser|完成验证以继续|安全验证|滑动验证|验证码/, "页面要求完成人机验证"],
    [/this page (?:doesn['’]t|does not) exist|page not found|content (?:is )?unavailable/i, "页面内容不存在或已经失效"],
    [/access denied|request blocked|访问被拒绝|请求被拦截/i, "页面拒绝了当前访问"],
  ];
  for (const [pattern, message] of explicitPatterns) {
    if (pattern.test(haystack)) return message;
  }
  if (text.length < 6_000 && /请先登录|登录后查看|扫码登录|sign in to (?:continue|view)/i.test(haystack)) {
    return "页面需要登录后才能读取内容";
  }
  return undefined;
}

function absoluteCaptureUrl(raw: string, baseUrl: string): string | undefined {
  const value = raw.trim().replace(/&amp;/g, "&");
  if (!value || /^(?:blob|data|javascript):/i.test(value)) return undefined;
  try {
    const parsed = new URL(value, baseUrl);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function extractEmbeddedMediaCandidates(
  html: string,
  baseUrl: string,
  limit = 8,
): BrowserCaptureMediaCandidate[] {
  const candidates: BrowserCaptureMediaCandidate[] = [];
  const add = (raw: string, pageType?: "video" | "audio", label?: string): void => {
    const url = absoluteCaptureUrl(raw, baseUrl);
    if (!url) return;
    const resolvedType = pageType ?? classifyBrowserCaptureUrl(url);
    if (resolvedType !== "video" && resolvedType !== "audio") return;
    if (candidates.some((candidate) => sameCaptureResourceUrl(candidate.url, url))) return;
    candidates.push({ url, pageType: resolvedType, ...(label ? { label: label.slice(0, 160) } : {}) });
  };
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const property = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase() ?? "";
    const content = tag.match(/\bcontent\s*=\s*["']([^"']+)["']/i)?.[1] ?? "";
    if (/^(?:og:video|twitter:player)(?::|$)/.test(property)) add(content, "video");
    if (/^og:audio(?::|$)/.test(property)) add(content, "audio");
  }
  for (const match of html.matchAll(/<(video|audio|source|iframe)\b([^>]*)>/gi)) {
    const tag = match[1]!.toLowerCase();
    const attributes = match[2] ?? "";
    const src = attributes.match(/\b(?:src|data-src)\s*=\s*["']([^"']+)["']/i)?.[1] ?? "";
    const type = attributes.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase() ?? "";
    const pageType = tag === "audio" || type.startsWith("audio/")
      ? "audio"
      : tag === "video" || type.startsWith("video/")
        ? "video"
        : undefined;
    add(src, pageType);
  }
  return candidates.slice(0, Math.max(0, limit));
}

export function normalizeCaptureSessionCookies(
  cookies: BrowserCaptureSessionCookie[],
  captureUrl: string,
  limit = 300,
): BrowserCaptureSessionCookie[] {
  const host = new URL(captureUrl).hostname.toLowerCase();
  const safeValue = (value: string): boolean => value.length <= 16_384 && !/[\r\n\t\0]/.test(value);
  return cookies.filter((cookie) => {
    const domain = String(cookie.domain ?? "").replace(/^\./, "").toLowerCase();
    return Boolean(
      domain
      && (host === domain || host.endsWith(`.${domain}`) || domain.endsWith(`.${host}`))
      && safeValue(String(cookie.name ?? ""))
      && safeValue(String(cookie.value ?? ""))
      && safeValue(String(cookie.path ?? "/")),
    );
  }).slice(0, Math.max(0, limit)).map((cookie) => ({
    domain: cookie.domain.startsWith(".") ? cookie.domain : `.${cookie.domain}`,
    path: cookie.path || "/",
    name: cookie.name,
    value: cookie.value,
    secure: Boolean(cookie.secure),
    httpOnly: Boolean(cookie.httpOnly),
    expirationDate: Number.isFinite(cookie.expirationDate) ? cookie.expirationDate : 0,
  }));
}

export function serializeNetscapeCookies(cookies: BrowserCaptureSessionCookie[]): string {
  return [
    "# Netscape HTTP Cookie File",
    "# Generated temporarily by KnowGrove for one local capture task.",
    ...cookies.map((cookie) => [
      cookie.domain,
      cookie.domain.startsWith(".") ? "TRUE" : "FALSE",
      cookie.path || "/",
      cookie.secure ? "TRUE" : "FALSE",
      Math.max(0, Math.floor(cookie.expirationDate ?? 0)),
      cookie.name,
      cookie.value,
    ].join("\t")),
    "",
  ].join("\n");
}

export function parseRawCookieString(
  raw: string,
  targetDomain: string,
): BrowserCaptureSessionCookie[] {
  const normalizedDomain = targetDomain.startsWith(".") ? targetDomain : `.${targetDomain}`;
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const cookies: BrowserCaptureSessionCookie[] = [];

  const isNetscape = lines.some((l) => l.includes("\t"));
  if (isNetscape) {
    for (const line of lines) {
      if (line.startsWith("#")) continue;
      const parts = line.split("\t");
      if (parts.length >= 7) {
        cookies.push({
          domain: parts[0] || normalizedDomain,
          path: parts[2] || "/",
          secure: parts[3] === "TRUE",
          expirationDate: Number(parts[4]) || 0,
          name: parts[5] || "",
          value: parts[6] || "",
          httpOnly: false,
        });
      }
    }
    if (cookies.length) return cookies;
  }

  const joined = raw.replace(/\r?\n/g, "; ");
  const pairs = joined.split(";");
  for (const pair of pairs) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const name = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (name && !["path", "domain", "expires", "max-age", "samesite", "secure", "httponly"].includes(name.toLowerCase())) {
        cookies.push({
          domain: normalizedDomain,
          path: "/",
          name,
          value,
          secure: true,
          httpOnly: false,
          expirationDate: Math.floor(Date.now() / 1000) + 365 * 24 * 3600,
        });
      }
    }
  }
  return cookies;
}

export function sameCaptureResourceUrl(left: string, right: string): boolean {
  try {
    const normalize = (value: string): string => {
      const parsed = new URL(value);
      parsed.hash = "";
      return parsed.toString().replace(/\/$/, "");
    };
    return normalize(left) === normalize(right);
  } catch {
    return false;
  }
}

export function captureCancellationPlan(input: {
  targetPath?: string;
  createdNotePath?: string;
  createdAttachmentPaths?: string[];
}): { trashPaths: string[]; restoreTarget: boolean } {
  const trashPaths = Array.from(new Set([
    ...(input.createdAttachmentPaths ?? []),
    ...(input.createdNotePath ? [input.createdNotePath] : []),
  ].map((path) => path.trim()).filter(Boolean)));
  return {
    trashPaths,
    restoreTarget: Boolean(input.targetPath && !input.createdNotePath),
  };
}

export function extractRootDomain(urlOrHost: string): string {
  try {
    const hostname = urlOrHost.includes("://") ? new URL(urlOrHost).hostname : urlOrHost;
    const clean = hostname.toLowerCase().replace(/^\.+/, "");
    const parts = clean.split(".");
    if (parts.length <= 2) return clean;
    const lastTwo = `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
    if (["com.cn", "net.cn", "org.cn", "gov.cn", "co.uk", "org.uk", "com.tw", "com.hk"].includes(lastTwo)) {
      return parts.slice(-3).join(".");
    }
    return parts.slice(-2).join(".");
  } catch {
    return urlOrHost.toLowerCase();
  }
}

export function matchDomainSessionCookies(
  sessions: Record<string, SavedDomainSession> | undefined,
  url: string,
): { cookies: BrowserCaptureSessionCookie[]; userAgent?: string; referer?: string } | undefined {
  if (!sessions) return undefined;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const root = extractRootDomain(host);
    const candidateKeys = [host, `.${host}`, root, `.${root}`];
    for (const key of candidateKeys) {
      const match = sessions[key] || sessions[key.replace(/^\./, "")];
      if (match?.cookies?.length) {
        return match;
      }
    }
  } catch {
    // Ignore invalid url
  }
  return undefined;
}

export function isBilibiliCaptureUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "bilibili.com"
      || host.endsWith(".bilibili.com")
      || host === "b23.tv"
      || host.endsWith(".b23.tv");
  } catch {
    return false;
  }
}

export function isDouyinCaptureUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "douyin.com" || host.endsWith(".douyin.com") || host === "v.douyin.com";
  } catch {
    return false;
  }
}

export function isTikTokCaptureUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "tiktok.com" || host.endsWith(".tiktok.com") || host === "vt.tiktok.com" || host === "vm.tiktok.com";
  } catch {
    return false;
  }
}

export function isXiguaCaptureUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "ixigua.com" || host.endsWith(".ixigua.com") || host === "v.ixigua.com";
  } catch {
    return false;
  }
}

export function isXiaohongshuCaptureUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "xiaohongshu.com" || host.endsWith(".xiaohongshu.com") || host === "xhslink.com";
  } catch {
    return false;
  }
}

export function isWeChatChannelsCaptureUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return (host === "weixin.qq.com" && parsed.pathname.startsWith("/sph/")) || host === "channels.weixin.qq.com";
  } catch {
    return false;
  }
}

export function isVimeoCaptureUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "vimeo.com" || host.endsWith(".vimeo.com") || host === "player.vimeo.com";
  } catch {
    return false;
  }
}

export function isTencentVideoUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "v.qq.com" || host.endsWith(".v.qq.com");
  } catch {
    return false;
  }
}

export function isInstagramCaptureUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "instagram.com" || host.endsWith(".instagram.com");
  } catch {
    return false;
  }
}

export function extractVimeoVideoId(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/(?:videos?\/|channels\/(?:\w+\/)?|groups\/[^/]+\/videos\/|album\/(?:\d+\/)?video\/|video\/|)(\d+)/i);
    return match?.[1];
  } catch {
    return undefined;
  }
}

export function parseTikTokHtml(html: string): TikTokResolvedMedia | undefined {
  const matchUniversal = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
  if (matchUniversal?.[1]) {
    try {
      const data = JSON.parse(matchUniversal[1]) as Record<string, unknown>;
      const defaultScope = (data["__DEFAULT_SCOPE__"] ?? {}) as Record<string, unknown>;
      const detail = (defaultScope["webapp.video-detail"] as Record<string, unknown> | undefined)?.itemInfo as {
        itemStruct?: {
          desc?: string;
          author?: { nickname?: string; uniqueId?: string };
          video?: { duration?: number; playAddr?: string; downloadAddr?: string; cover?: string };
          music?: { playUrl?: string; title?: string };
        };
      } | undefined;
      const item = detail?.itemStruct;
      if (item) {
        return {
          title: item.desc?.trim() || "TikTok 视频",
          author: item.author?.nickname || item.author?.uniqueId,
          duration: item.video?.duration,
          playUrl: item.video?.playAddr || item.video?.downloadAddr,
          audioUrl: item.music?.playUrl,
          coverUrl: item.video?.cover,
        };
      }
    } catch {
      // Continue
    }
  }
  const matchSigi = html.match(/<script id="SIGI_STATE"[^>]*>([\s\S]*?)<\/script>/);
  if (matchSigi?.[1]) {
    try {
      const data = JSON.parse(matchSigi[1]) as {
        ItemModule?: Record<string, {
          desc?: string;
          author?: string;
          video?: { duration?: number; playAddr?: string; downloadAddr?: string };
          music?: { playUrl?: string };
        }>;
      };
      const items = Object.values(data.ItemModule ?? {});
      if (items.length) {
        const item = items[0]!;
        return {
          title: item.desc?.trim() || "TikTok 视频",
          author: item.author,
          duration: item.video?.duration,
          playUrl: item.video?.playAddr || item.video?.downloadAddr,
          audioUrl: item.music?.playUrl,
        };
      }
    } catch {
      // Continue
    }
  }
  return undefined;
}

export function extractTencentVideoVid(url: string): string | undefined {
  try {
    const match = url.match(/(?:\/page\/|\/cover\/[^/]+\/|\bvid=)([a-zA-Z0-9]{11})/);
    return match?.[1];
  } catch {
    return undefined;
  }
}

export function parseXiguaHtml(html: string): XiguaResolvedMedia | undefined {
  const matchSsr = html.match(/window\._SSR_DATA\s*=\s*(\{[\s\S]*?\});/)
    || html.match(/<script[^>]*>(window\._SSR_DATA\s*=[\s\S]*?)<\/script>/);
  if (matchSsr?.[1]) {
    try {
      const raw = matchSsr[1].replace(/^window\._SSR_DATA\s*=\s*/, "").replace(/;?\s*$/, "");
      const data = JSON.parse(raw) as {
        data?: {
          storeState?: {
            detail?: {
              videoData?: {
                result?: {
                  title?: string;
                  duration?: number;
                  media_user?: { screen_name?: string };
                  cover_image_url?: string;
                };
              };
            };
          };
        };
      };
      const result = data.data?.storeState?.detail?.videoData?.result;
      if (result?.title) {
        return {
          title: result.title.trim(),
          duration: result.duration,
          author: result.media_user?.screen_name,
          coverUrl: result.cover_image_url,
        };
      }
    } catch {
      // Ignore
    }
  }
  const ldJson = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (ldJson?.[1]) {
    try {
      const data = JSON.parse(ldJson[1]) as { name?: string; description?: string; thumbnailUrl?: string };
      if (data.name) {
        return {
          title: data.name.replace(/\s*\|\s*西瓜视频\s*$/, "").trim(),
          coverUrl: data.thumbnailUrl,
        };
      }
    } catch {
      // Ignore
    }
  }
  return undefined;
}

/**
 * Keep video extraction independent from a user's global yt-dlp config and use
 * bounded retries. Provides proper user-agent and headers for platform compatibility.
 */
export function ytDlpCaptureArgs(
  url: string,
  options: {
    cookiesPath?: string;
    userAgent?: string;
    referer?: string;
    browserCookieSource?: string;
  } = {},
): string[] {
  const args = [
    "--ignore-config",
    "--no-warnings",
    "--no-playlist",
    "--socket-timeout",
    "30",
    "--extractor-retries",
    "3",
    "--retries",
    "5",
    "--fragment-retries",
    "5",
  ];
  if (options.cookiesPath) {
    args.push("--cookies", options.cookiesPath);
  } else if (options.browserCookieSource === "auto") {
    args.push("--cookies-from-browser", "chrome");
  } else if (
    options.browserCookieSource
    && options.browserCookieSource !== "extension"
    && options.browserCookieSource !== "disabled"
  ) {
    args.push("--cookies-from-browser", options.browserCookieSource);
  }
  const ua = options.userAgent || YT_DLP_BROWSER_USER_AGENT;
  if (isBilibiliCaptureUrl(url)) {
    args.push(
      "--user-agent",
      ua,
      "--add-header",
      "Referer:https://www.bilibili.com/",
      "--add-header",
      "Origin:https://www.bilibili.com",
    );
  } else if (isDouyinCaptureUrl(url)) {
    args.push(
      "--user-agent",
      ua,
      "--add-header",
      "Referer:https://www.douyin.com/",
    );
  } else if (isXiguaCaptureUrl(url)) {
    args.push(
      "--user-agent",
      ua,
      "--add-header",
      "Referer:https://www.ixigua.com/",
    );
  } else if (isTikTokCaptureUrl(url)) {
    args.push(
      "--user-agent",
      ua,
      "--add-header",
      "Referer:https://www.tiktok.com/",
    );
  } else if (isXiaohongshuCaptureUrl(url)) {
    args.push(
      "--user-agent",
      ua,
      "--add-header",
      "Referer:https://www.xiaohongshu.com/",
    );
  } else if (isInstagramCaptureUrl(url)) {
    args.push(
      "--user-agent",
      ua,
      "--add-header",
      "Referer:https://www.instagram.com/",
    );
  } else if (options.referer) {
    args.push("--add-header", `Referer:${options.referer}`);
  }
  return args;
}

export function ytDlpSubtitleArgs(outputTemplate: string, url: string): string[] {
  return [
    ...ytDlpCaptureArgs(url),
    "--skip-download",
    "--write-subs",
    "--write-auto-subs",
    "--sub-langs",
    "all,-danmaku",
    "--sub-format",
    "vtt/srt/best",
    "-o",
    outputTemplate,
    url,
  ];
}

export function selectPreferredSubtitleFile(files: string[]): string | undefined {
  const supported = files.filter((name) => /\.(?:vtt|srt|json3?|json)$/i.test(name));
  const rank = (name: string): number => {
    const normalized = name.toLowerCase();
    if (/(?:^|[._-])zh[-_]?hans(?:[._-]|$)|zh[-_]?cn/.test(normalized)) return 0;
    if (/(?:^|[._-])ai[-_]?zh(?:[._-]|$)/.test(normalized)) return 1;
    if (/(?:^|[._-])zh(?:[._-]|$)/.test(normalized)) return 2;
    if (/(?:^|[._-])zh[-_]?hant(?:[._-]|$)|zh[-_]?tw/.test(normalized)) return 3;
    if (/(?:^|[._-])en(?:[._-]|$)/.test(normalized)) return 4;
    return 10;
  };
  return supported.sort((left, right) => rank(left) - rank(right) || left.localeCompare(right))[0];
}

export function formatYtDlpCaptureError(stderr: string, url: string): string {
  const ansiColorSequence = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
  const cleaned = stderr
    .replace(ansiColorSequence, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^WARNING:\s*Your yt-dlp version .*older than 90 days/i.test(line));
  const errorLines = cleaned.filter((line) => /^ERROR:/i.test(line));
  const detail = errorLines[errorLines.length - 1]
    ?? cleaned[cleaned.length - 1]
    ?? "视频音频下载失败";
  if (isBilibiliCaptureUrl(url) && /(?:HTTP Error\s*)?412|Precondition Failed/i.test(stderr)) {
    return "Bilibili 拒绝了当前下载组件的请求（HTTP 412）。KnowGrove 已使用浏览器请求头重试；请在设置 → Read It Later → 自动整理组件配置中点击“自动配置”更新组件后重试。";
  }
  if (/(?:HTTP Error\s*)?(?:401|403|429)|cookies-from-browser|fresh cookies|Sign in to confirm|login required|Cloudflare|Cookies \(not necessarily logged in\) are needed/i.test(stderr)) {
    return "该平台需要登录授权后方可解析。请在 KnowGrove 设置 → 平台登录授权中完成一次登录授权（仅需一次，后续全自动复用）。";
  }
  if (/Unsupported URL|No video formats found|Unable to extract/i.test(stderr)) {
    return "当前下载组件没有识别出可用媒体。请检查链接是否有效，或在 KnowGrove 设置中确认该平台登录授权状态。";

  }
  return detail.replace(/^ERROR:\s*/i, "").slice(0, 800);
}

export function stripCaptureFrontmatter(markdown: string): string {
  return markdown.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "");
}

export function isManagedCaptureMarkdown(markdown: string): boolean {
  return /^(?:capture_id\s*:|type\s*:\s*keeprec-capture\s*$|KnowGrove采集状态\s*:)/m.test(markdown);
}

export function rewriteWikiImageEmbeds(
  markdown: string,
  render: (linkPath: string, alias: string) => string | undefined,
): string {
  return markdown.replace(/!\[\[([^\]\n]+)\]\]/g, (raw, inner: string) => {
    const separator = inner.indexOf("|");
    const linkPath = (separator >= 0 ? inner.slice(0, separator) : inner).trim();
    const alias = (separator >= 0 ? inner.slice(separator + 1) : "").trim();
    if (!linkPath || linkPath.includes("#")) return raw;
    return render(linkPath, alias) ?? raw;
  });
}

export function portableSiblingAssetLinkPath(targetPath: string, sourceNotePath: string): string | undefined {
  const sourceDirectory = sourceNotePath.split("/").slice(0, -1).join("/");
  const prefix = sourceDirectory ? `${sourceDirectory}/` : "";
  if (!targetPath.startsWith(prefix)) return undefined;
  const relativePath = targetPath.slice(prefix.length);
  return relativePath && !relativePath.startsWith("../") ? relativePath : undefined;
}

function normalizedLinkNoteTitle(title: string, url: string): string {
  const cleaned = title
    .replace(/^#+\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned) return cleaned.slice(0, 200);
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "待解析内容";
  }
}

export function detectLinkNoteCandidate(markdown: string, fallbackTitle = ""): LinkNoteCandidate | null {
  if (/KnowGrove采集状态:\s*["']?(?:处理中|已完成)["']?/i.test(markdown)) return null;
  const body = stripCaptureFrontmatter(markdown);
  const urls = Array.from(body.matchAll(/https?:\/\/[^\s<>()\]]+/gi))
    .map((match) => match[0].replace(/[.,;:!?，。；：！？）】》]+$/g, ""));
  const uniqueUrls = Array.from(new Set(urls));
  if (uniqueUrls.length === 0) {
    return detectLocalMediaNoteCandidate(markdown, body, fallbackTitle);
  }
  if (uniqueUrls.length !== 1) return null;
  const url = uniqueUrls[0]!;
  const withoutLinks = body
    .replace(/!?\[[^\]]*]\(https?:\/\/[^)]+\)/gi, " ")
    .replace(/https?:\/\/[^\s<>()\]]+/gi, " ")
    .replace(/^#{1,6}\s+.*$/gm, " ")
    .replace(/^>\s*(?:来源|链接|待处理|稍后阅读|KnowGrove).*$|^\s*[-*]\s*(?:来源|链接)\s*[:：].*$/gim, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\s+/g, "");
  if (withoutLinks.length > 120 || body.length > 1_500) return null;
  const heading = body.match(/^#{1,6}\s+(.+)$/m)?.[1]?.trim() ?? "";
  return {
    url,
    title: normalizedLinkNoteTitle(heading || fallbackTitle, url),
  };
}

export const LOCAL_VIDEO_EXTENSION = /\.(?:mp4|mov|mkv|m4v)$/i;
export const LOCAL_MEDIA_EXTENSION = /\.(?:mp3|m4a|wav|aac|flac|ogg|opus|webm|mp4|mov|mkv|m4v)$/i;

function detectLocalMediaNoteCandidate(
  markdown: string,
  body: string,
  fallbackTitle: string,
): LinkNoteCandidate | null {
  const embeddedMedia = Array.from(body.matchAll(/!\[\[([^\]]+)]]/g))
    .map((match) => match[1]!.split("|")[0]!.trim())
    .filter((path) => LOCAL_MEDIA_EXTENSION.test(path));
  const frontmatterMedia = frontmatterScalar(markdown, ["audio", "video", "音频", "语音文件", "视频", "视频文件"])
    .replace(/^!?\[\[|\]\]$/g, "")
    .split("|")[0]!
    .trim();
  if (frontmatterMedia && LOCAL_MEDIA_EXTENSION.test(frontmatterMedia)) {
    embeddedMedia.push(frontmatterMedia);
  }
  if (embeddedMedia.length === 0) return null;

  // Deduplicate by normalized basename so full vault path and short wikilink match the same media file
  const uniqueNames = new Set(embeddedMedia.map((p) => p.split("/").pop()?.toLowerCase() || p.toLowerCase()));
  if (uniqueNames.size !== 1) return null;

  const withoutTemplate = body
    .replace(/!\[\[[^\]]+]]/g, " ")
    .replace(/^#{1,6}\s+.*$/gm, " ")
    .replace(/^\s*[-*]\s+(?:无|没有|暂无)\s*$/gim, " ")
    .replace(/^(?:中断记录|整理记录|语音记录|视频记录)\s*$/gim, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\s+/g, "");
  if (withoutTemplate.length > 120 || body.length > 1_500) return null;

  const heading = body.match(/^#{1,6}\s+(.+)$/m)?.[1]?.trim() ?? "";
  const mediaPath = embeddedMedia[0]!;
  return {
    url: "",
    title: normalizedLinkNoteTitle(heading || fallbackTitle, ""),
    pageType: LOCAL_VIDEO_EXTENSION.test(mediaPath) ? "video" : "audio",
    mediaPath,
  };
}

function frontmatterScalar(markdown: string, keys: string[]): string {
  const frontmatter = markdown.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] ?? "";
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const value = frontmatter.match(new RegExp(`^${escaped}:\\s*(.+?)\\s*$`, "mi"))?.[1]?.trim() ?? "";
    if (!value) continue;
    try {
      const parsed = JSON.parse(value) as unknown;
      if (typeof parsed === "string") return parsed.trim();
    } catch {
      return value.replace(/^["']|["']$/g, "").trim();
    }
  }
  return "";
}

export function detectInterruptedCapture(markdown: string): InterruptedCaptureCandidate | null {
  if (!/KnowGrove采集状态:\s*["']?(?:处理中|部分完成)["']?/i.test(markdown)) return null;
  const outputLabels = Object.values(CAPTURE_OUTPUT_LABELS);
  if (outputLabels.some((labels) => new RegExp(`^##\\s+${escapeRegExp(labels.summary)}\\s*$`, "m").test(markdown))) return null;
  const url = frontmatterScalar(markdown, ["来源", "source_url"]);
  const mediaPath = markdown.match(/^!\[\[([^\]]+)]]\s*$/m)?.[1]?.trim();
  if (!/^https?:\/\//i.test(url) && !mediaPath) return null;
  const contentType = frontmatterScalar(markdown, ["内容类型", "source_type"]);
  const pageType: BrowserCapturePageType = /视频|video/i.test(contentType)
    ? "video"
    : /音频|语音|audio|podcast/i.test(contentType)
      ? "audio"
      : classifyBrowserCaptureUrl(url);
  const sourceHeadings = outputLabels.map((labels) => pageType === "article" ? labels.originalText : labels.fullTranscript);
  const source = sourceHeadings.map((heading) => markdown.match(
    new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$\\r?\\n([\\s\\S]+)$`, "m"),
  )?.[1]?.trim() ?? "").find(Boolean) ?? "";
  if (source.length < 80) return null;
  const title = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "";
  return {
    url,
    title: normalizedLinkNoteTitle(title, url),
    pageType,
    source,
    ...(mediaPath ? { mediaPath } : {}),
  };
}

export interface LinkNoteScanFile {
  path: string;
  mtime: number;
}

export function latestLinkNoteScanFiles(
  files: LinkNoteScanFile[],
  folder: string,
  limit = 200,
): LinkNoteScanFile[] {
  const normalizedFolder = folder
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");
  return files
    .filter((file) => {
      const path = file.path.replace(/\\/g, "/").replace(/^\/+/, "");
      if (!path.toLowerCase().endsWith(".md")) return false;
      return !normalizedFolder
        || path === normalizedFolder
        || path.startsWith(`${normalizedFolder}/`);
    })
    .sort((left, right) => right.mtime - left.mtime || left.path.localeCompare(right.path))
    .slice(0, Math.max(0, limit));
}

export function detectWhisperImplementation(executable: string): WhisperImplementation {
  const pathParts = executable.split(/[\\/]/);
  const name = pathParts[pathParts.length - 1]?.toLowerCase() ?? "";
  return name.includes("whisper-cli") || name.includes("whisper-cpp")
    ? "whisper-cpp"
    : "openai-whisper";
}

export function whisperNeedsPcmConversion(
  implementation: WhisperImplementation,
  audioPath: string,
): boolean {
  return implementation === "whisper-cpp"
    && !/\.(?:flac|mp3|ogg|wav)$/i.test(audioPath);
}

export function buildWhisperPcmConversionArgs(inputPath: string, outputPath: string): string[] {
  return [
    "-y",
    "-i",
    inputPath,
    "-ar",
    "16000",
    "-ac",
    "1",
    "-c:a",
    "pcm_s16le",
    outputPath,
  ];
}

export function whisperLanguageFromLocale(locale?: string): string {
  const norm = String(locale ?? "").trim().toLowerCase();
  if (norm.startsWith("zh")) return "zh";
  if (norm.startsWith("en")) return "en";
  if (norm.startsWith("ja")) return "ja";
  if (norm.startsWith("ko")) return "ko";
  if (norm.startsWith("de")) return "de";
  if (norm.startsWith("fr")) return "fr";
  if (norm.startsWith("es")) return "es";
  if (norm.startsWith("pt")) return "pt";
  if (norm.startsWith("ru")) return "ru";
  if (norm.startsWith("it")) return "it";
  return "zh";
}

export function buildWhisperInvocation(input: {
  implementation: WhisperImplementation;
  audioPath: string;
  outputDirectory: string;
  model: string;
  cppModelPath?: string;
  language?: string;
}): WhisperInvocation {
  const language = input.language || "zh";
  if (input.implementation === "whisper-cpp") {
    if (!input.cppModelPath) throw new Error("whisper.cpp 缺少 GGML 模型文件");
    const transcriptStem = `${input.outputDirectory.replace(/[\\/]$/, "")}/transcript`;
    return {
      args: [
        "-m",
        input.cppModelPath,
        "-f",
        input.audioPath,
        "-l",
        language,
        "-sns",
        "-nf",
        "-mc",
        "0",
        "-otxt",
        "-of",
        transcriptStem,
        "-np",
      ],
      transcriptPath: `${transcriptStem}.txt`,
    };
  }
  return {
    args: [
      input.audioPath,
      "--model",
      input.model,
      "--language",
      language,
      "--task",
      "transcribe",
      "--output_format",
      "txt",
      "--output_dir",
      input.outputDirectory,
    ],
  };
}

export function browserCaptureSkill(pageType: BrowserCapturePageType): BrowserCaptureSkill {
  return BROWSER_CAPTURE_SKILLS.find((skill) => skill.contentTypes.includes(pageType))
    ?? BROWSER_CAPTURE_SKILLS[0]!;
}

export function extractJsonObject(text: string): Record<string, unknown> {
  const source = String(text ?? "").replace(/```(?:json)?/gi, "").replace(/```/g, "");
  for (let start = source.indexOf("{"); start >= 0; start = source.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < source.length; index += 1) {
      const char = source[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === "\"") inString = false;
        continue;
      }
      if (char === "\"") inString = true;
      else if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          try {
            return JSON.parse(source.slice(start, index + 1)) as Record<string, unknown>;
          } catch {
            break;
          }
        }
      }
    }
  }
  throw new Error("模型没有返回可解析的 JSON 结果");
}

export function splitBrowserCaptureText(text: string, maxChars = 28_000): string[] {
  const normalized = String(text ?? "").trim();
  if (!normalized) return [];
  if (normalized.length <= maxChars) return [normalized];
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of normalized.split(/\n{2,}/)) {
    if (paragraph.length > maxChars) {
      if (current.trim()) chunks.push(current.trim());
      current = "";
      for (let offset = 0; offset < paragraph.length; offset += maxChars) {
        chunks.push(paragraph.slice(offset, offset + maxChars).trim());
      }
      continue;
    }
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length > maxChars) {
      chunks.push(current.trim());
      current = paragraph;
    } else {
      current = candidate;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

function normalizeMode(value: unknown, pageType: BrowserCapturePageType): BrowserCaptureAIResult["mode"] {
  if (pageType === "article") return "article";
  return value === "multi-speaker" ? "multi-speaker" : "single-speaker";
}

export function normalizeBrowserCaptureAIResult(
  raw: Record<string, unknown>,
  pageType: BrowserCapturePageType,
): BrowserCaptureAIResult {
  const summary = typeof raw.summary === "string" ? raw.summary.trim() : "";
  const keyPoints = Array.isArray(raw.key_points)
    ? raw.key_points.map((item) => String(item).trim()).filter(Boolean).slice(0, 16)
    : [];
  const bodyMarkdown = typeof raw.body_markdown === "string"
    ? raw.body_markdown.trim().replace(/^##\s+/gm, "### ")
    : "";
  if (!summary || !keyPoints.length || !bodyMarkdown) {
    throw new Error("模型结果缺少摘要、核心要点或整理正文");
  }
  return {
    summary,
    keyPoints,
    bodyMarkdown,
    mode: normalizeMode(raw.mode, pageType),
  };
}

export interface CaptureOutputLabels {
  languageName: string;
  summary: string;
  keyPoints: string;
  organizedBody: string;
  dialogue: string;
  audioBody: string;
  videoBody: string;
  originalAudio: string;
  originalVideo: string;
  originalText: string;
  fullTranscript: string;
}

const CAPTURE_OUTPUT_LABELS: Record<KnowGroveLocale, CaptureOutputLabels> = {
  "zh-CN": { languageName: "简体中文", summary: "内容摘要", keyPoints: "核心要点", organizedBody: "整理正文", dialogue: "对话记录", audioBody: "音频正文", videoBody: "视频正文", originalAudio: "原始音频", originalVideo: "原始视频", originalText: "原文", fullTranscript: "完整逐字稿" },
  "zh-TW": { languageName: "繁體中文", summary: "內容摘要", keyPoints: "核心要點", organizedBody: "整理正文", dialogue: "對話記錄", audioBody: "音訊正文", videoBody: "影片正文", originalAudio: "原始音訊", originalVideo: "原始影片", originalText: "原文", fullTranscript: "完整逐字稿" },
  en: { languageName: "English", summary: "Summary", keyPoints: "Key points", organizedBody: "Organized content", dialogue: "Conversation", audioBody: "Audio notes", videoBody: "Video notes", originalAudio: "Original audio", originalVideo: "Original video", originalText: "Original text", fullTranscript: "Full transcript" },
  ja: { languageName: "日本語", summary: "要約", keyPoints: "要点", organizedBody: "整理本文", dialogue: "会話記録", audioBody: "音声本文", videoBody: "動画本文", originalAudio: "元の音声", originalVideo: "元の動画", originalText: "原文", fullTranscript: "全文文字起こし" },
  ko: { languageName: "한국어", summary: "내용 요약", keyPoints: "핵심 요점", organizedBody: "정리 본문", dialogue: "대화 기록", audioBody: "오디오 본문", videoBody: "비디오 본문", originalAudio: "원본 오디오", originalVideo: "원본 비디오", originalText: "원문", fullTranscript: "전체 녹취록" },
  de: { languageName: "Deutsch", summary: "Zusammenfassung", keyPoints: "Kernaussagen", organizedBody: "Aufbereiteter Inhalt", dialogue: "Gespräch", audioBody: "Audio-Notizen", videoBody: "Video-Notizen", originalAudio: "Originalaudio", originalVideo: "Originalvideo", originalText: "Originaltext", fullTranscript: "Vollständiges Transkript" },
  fr: { languageName: "Français", summary: "Résumé", keyPoints: "Points clés", organizedBody: "Contenu structuré", dialogue: "Conversation", audioBody: "Notes audio", videoBody: "Notes vidéo", originalAudio: "Audio original", originalVideo: "Vidéo originale", originalText: "Texte original", fullTranscript: "Transcription complète" },
  es: { languageName: "Español", summary: "Resumen", keyPoints: "Puntos clave", organizedBody: "Contenido organizado", dialogue: "Conversación", audioBody: "Notas de audio", videoBody: "Notas de vídeo", originalAudio: "Audio original", originalVideo: "Vídeo original", originalText: "Texto original", fullTranscript: "Transcripción completa" },
  "pt-BR": { languageName: "Português (Brasil)", summary: "Resumo", keyPoints: "Pontos principais", organizedBody: "Conteúdo organizado", dialogue: "Conversa", audioBody: "Notas de áudio", videoBody: "Notas de vídeo", originalAudio: "Áudio original", originalVideo: "Vídeo original", originalText: "Texto original", fullTranscript: "Transcrição completa" },
  ru: { languageName: "Русский", summary: "Краткое содержание", keyPoints: "Ключевые моменты", organizedBody: "Структурированный материал", dialogue: "Диалог", audioBody: "Материал аудио", videoBody: "Материал видео", originalAudio: "Исходное аудио", originalVideo: "Исходное видео", originalText: "Исходный текст", fullTranscript: "Полная расшифровка" },
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function captureOutputLabels(locale: KnowGroveLocale): CaptureOutputLabels {
  return CAPTURE_OUTPUT_LABELS[locale];
}

function captureLanguageRequirement(locale: KnowGroveLocale): string {
  const labels = captureOutputLabels(locale);
  return [
    `分析输出语言必须使用${labels.languageName}（${locale}）。`,
    "summary、key_points、body_markdown 以及其中的分析性小标题全部使用该语言。",
    "原始材料可能是另一种语言：不要翻译、改写或音译原话；直接引用和说话人原句保持原语言。完整原文或逐字稿会由系统另行原样保存。",
  ].join("");
}

function captureJsonExample(locale: KnowGroveLocale, scope: "full" | "chunk" | "synthesis"): string {
  const language = captureOutputLabels(locale).languageName;
  return JSON.stringify({
    summary: `<${scope === "chunk" ? "section " : ""}summary in ${language}>`,
    key_points: [`<key point in ${language}>`],
    mode: "article|single-speaker|multi-speaker",
    body_markdown: scope === "synthesis"
      ? `<merged body marker in ${language}>`
      : `### <heading in ${language}>\n\n<content in ${language}>`,
  });
}

export function browserCapturePrompt(
  pageType: BrowserCapturePageType,
  title: string,
  source: string,
  outputLocale: KnowGroveLocale = "zh-CN",
): string {
  return [
    "你正在执行 KnowGrove 的浏览器入库 Skill。",
    "只根据提供的材料工作，不补造事实；无法确认的人名、数字和术语标记为 [待核]。",
    "输出必须是一个 JSON 对象，不要使用 Markdown 代码围栏。",
    captureLanguageRequirement(outputLocale),
    pageType !== "article"
      ? [
        "判断单人讲解或多人对话。mode 使用 single-speaker 或 multi-speaker；正文需去除口语赘词，多人对话使用 **说话人**：格式。",
        "字幕换行只是时间切片，不是自然段。必须把碎片合并成语义完整的自然段，按主题使用 ### 小标题；禁止一条字幕占一行。",
        "单人讲解每段围绕一个意思组织 2-5 个完整句子；多人对话也要合并同一说话人的连续短句，避免逐字稿式碎片排版。",
      ].join("")
      : [
        "mode 固定为 article；正文重构为忠于原文、带 ### 小标题的知识笔记。",
        "删除正文开始前的作者栏、编辑栏、阅读器提示、头图、公众号引导和纯装饰符号；删除正文末尾的关注、推荐阅读、二维码、转载声明等平台噪音。",
        "原始材料中的 {{KNOWGROVE_IMAGE_数字}} 是已本地化的正文图片占位符，必须逐个原样保留、顺序不变、单独成段；不得改写、遗漏或新增占位符。",
        `不要在 body_markdown 中重复输出文章一级标题“${title}”。`,
      ].join(""),
    captureJsonExample(outputLocale, "full"),
    `内容类型：${pageType === "video" ? "视频" : pageType === "audio" ? "语音" : "文章"}`,
    `标题：${title}`,
    "原始材料：",
    source,
  ].join("\n\n");
}

export function browserCaptureChunkPrompt(
  pageType: BrowserCapturePageType,
  title: string,
  source: string,
  index: number,
  total: number,
  outputLocale: KnowGroveLocale = "zh-CN",
): string {
  return [
    `这是《${title}》的第 ${index}/${total} 段材料。`,
    "只整理这一段，不推断其他段落。输出必须是一个 JSON 对象。",
    captureLanguageRequirement(outputLocale),
    pageType !== "article"
      ? [
        "将口语整理成忠于原意、带 ### 小标题的正文；明显多人对话使用 **说话人**：格式。",
        "忽略字幕原始换行，把连续碎片合并成自然段，禁止一条字幕占一行；单人讲解每段组织 2-5 个完整句子。",
      ].join("")
      : [
        "将文章片段整理成忠于原文、带 ### 小标题的知识笔记。",
        "删除作者栏、编辑栏、阅读器提示、头图、关注引导和纯装饰符号。",
        "所有 {{KNOWGROVE_IMAGE_数字}} 图片占位符必须逐个原样保留、顺序不变、单独成段，不得遗漏或新增。",
      ].join(""),
    captureJsonExample(outputLocale, "chunk"),
    source,
  ].join("\n\n");
}

export function browserCaptureSynthesisPrompt(
  pageType: BrowserCapturePageType,
  title: string,
  partials: BrowserCaptureAIResult[],
  outputLocale: KnowGroveLocale = "zh-CN",
): string {
  return [
    `综合《${title}》各段结果，生成全局摘要和核心要点。不要新增原结果没有的事实。`,
    captureLanguageRequirement(outputLocale),
    pageType !== "article"
      ? "mode 在 single-speaker 与 multi-speaker 中选择。"
      : "mode 固定为 article。",
    "body_markdown 填写“由分段整理正文合并生成”。输出必须是一个 JSON 对象。",
    captureJsonExample(outputLocale, "synthesis"),
    JSON.stringify(partials.map((item, index) => ({
      part: index + 1,
      summary: item.summary,
      key_points: item.keyPoints,
      mode: item.mode,
    }))),
  ].join("\n\n");
}

function cleanText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function imageSource(element: Element, baseUrl = ""): string {
  const srcset = element.getAttribute("data-srcset")?.trim()
    || element.getAttribute("srcset")?.trim()
    || "";
  const srcsetUrl = srcset.split(",")[0]?.trim().split(/\s+/)[0] ?? "";
  const raw = element.getAttribute("data-src")?.trim()
    || element.getAttribute("data-original")?.trim()
    || element.getAttribute("data-lazy-src")?.trim()
    || element.getAttribute("src")?.trim()
    || srcsetUrl;
  if (!raw || /^data:/i.test(raw)) return "";
  try {
    return baseUrl ? new URL(raw, baseUrl).toString() : raw;
  } catch {
    return raw;
  }
}

function inlineMarkdown(node: Node, baseUrl = ""): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (!(node.instanceOf(Element))) return "";
  const tag = node.tagName.toLowerCase();
  if (tag === "img") {
    const src = imageSource(node, baseUrl);
    const alt = node.getAttribute("alt")?.trim() || "图片";
    return src ? `![${alt}](${src})` : "";
  }
  const content = Array.from(node.childNodes).map((child) => inlineMarkdown(child, baseUrl)).join("");
  if (tag === "br") return "\n";
  if (tag === "strong" || tag === "b") return `**${content.trim()}**`;
  if (tag === "em" || tag === "i") return `*${content.trim()}*`;
  if (tag === "code") return `\`${content.trim()}\``;
  if (tag === "a") {
    const href = node.getAttribute("href")?.trim();
    return href ? `[${content.trim() || href}](${href})` : content;
  }
  return content;
}

function elementMarkdown(element: Element, baseUrl = ""): string {
  const tag = element.tagName.toLowerCase();
  if (["script", "style", "noscript", "svg", "nav", "footer", "form", "button"].includes(tag)) return "";
  if (/^h[1-6]$/.test(tag)) {
    const level = Number(tag.slice(1));
    return `${"#".repeat(Math.min(6, Math.max(3, level + 1)))} ${cleanText(inlineMarkdown(element, baseUrl))}\n\n`;
  }
  if (tag === "p") return `${cleanText(inlineMarkdown(element, baseUrl))}\n\n`;
  if (tag === "li") return `- ${cleanText(inlineMarkdown(element, baseUrl))}\n`;
  if (tag === "blockquote") {
    return `${cleanText(inlineMarkdown(element, baseUrl)).split("\n").map((line) => `> ${line}`).join("\n")}\n\n`;
  }
  if (tag === "pre") return `\`\`\`\n${element.textContent?.trim() ?? ""}\n\`\`\`\n\n`;
  if (tag === "img") {
    const src = imageSource(element, baseUrl);
    const alt = element.getAttribute("alt")?.trim() || "图片";
    return src ? `![${alt}](${src})\n\n` : "";
  }
  return Array.from(element.children).map((child) => elementMarkdown(child, baseUrl)).join("")
    || `${cleanText(inlineMarkdown(element, baseUrl))}\n\n`;
}

function collectStructuredPageText(value: unknown, output: string[], key = "", depth = 0): void {
  if (depth > 18 || output.length >= 600) return;
  if (typeof value === "string") {
    if (!/^(?:title|content|text|message|answer|question|prompt|markdown|body|description|summary)$/i.test(key)) return;
    const normalized = cleanText(value);
    if (
      normalized.length >= 2
      && normalized.length <= 120_000
      && !/^https?:\/\//i.test(normalized)
      && !/^[A-Za-z0-9+/=]{200,}$/.test(normalized)
    ) output.push(normalized);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStructuredPageText(item, output, key, depth + 1));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
    collectStructuredPageText(childValue, output, childKey, depth + 1);
  }
}

export function extractStructuredCaptureTextFromScripts(scripts: string[]): string {
  const fragments: string[] = [];
  for (const source of scripts) {
    const raw = source.trim();
    if (!raw) continue;
    try {
      collectStructuredPageText(JSON.parse(raw), fragments);
    } catch {
      try {
        collectStructuredPageText(extractJsonObject(raw), fragments);
      } catch {
        // Ignore analytics and executable scripts that do not contain JSON.
      }
    }
  }
  const unique = fragments.filter((fragment, index) =>
    fragments.findIndex((candidate) => candidate === fragment) === index,
  );
  return cleanText(unique.join("\n\n"));
}

function extractStructuredPageText(document: Document): string {
  const scripts = Array.from(document.querySelectorAll("script"))
    .filter((script) => {
      const type = script.getAttribute("type")?.toLowerCase() ?? "";
      const id = script.id.toLowerCase();
      const source = script.textContent ?? "";
      return type === "application/ld+json"
        || type === "application/json"
        || id === "__next_data__"
        || id === "__nuxt_data__"
        || /(?:_ROUTER_DATA|_SSR_DATA|__NEXT_DATA__|__NUXT__)\s*=/.test(source);
    })
    .map((script) => script.textContent ?? "");
  return extractStructuredCaptureTextFromScripts(scripts);
}

export function extractArticleFromHtml(html: string, fallbackTitle = "", baseUrl = ""): ExtractedArticle {
  if (typeof DOMParser === "undefined") {
    throw new Error("当前环境不支持网页正文解析");
  }
  const document = new DOMParser().parseFromString(html, "text/html");
  const structuredSource = extractStructuredPageText(document);
  for (const selector of [
    "script", "style", "noscript", "svg", "nav", "footer", "form", "button",
    "[aria-hidden='true']", ".advertisement", ".ads", ".sidebar", ".comments",
  ]) {
    document.querySelectorAll(selector).forEach((node) => node.remove());
  }
  const title = document.querySelector("meta[property='og:title']")?.getAttribute("content")?.trim()
    || document.querySelector("h1")?.textContent?.trim()
    || document.title.trim()
    || fallbackTitle.trim()
    || "未命名网页";
  const author = document.querySelector("meta[name='author']")?.getAttribute("content")?.trim()
    || document.querySelector("[rel='author']")?.textContent?.trim()
    || "";
  const publishedAt = document.querySelector("meta[property='article:published_time']")?.getAttribute("content")?.trim()
    || document.querySelector("time")?.getAttribute("datetime")?.trim()
    || "";
  const root = document.querySelector("article")
    || document.querySelector("main")
    || document.querySelector("[role='main']")
    || document.body;
  let source = cleanText(Array.from(root.children).map((child) => elementMarkdown(child, baseUrl)).join(""));
  if (source.length < 80 && structuredSource.length >= 80) source = structuredSource;
  if (source.length < 80) throw new Error("没有提取到足够的网页正文，页面可能需要登录或使用动态加载");
  return { title, author, publishedAt, source };
}

const ARTICLE_IMAGE_PATTERN = /!\[\[[^\]]+\]\]|!\[([^\]]*)\]\((https?:\/\/[^)\s]+(?:\?[^)\s]*)?)\)/gi;
const IMAGE_PLACEHOLDER_PATTERN = /\{\{KNOWGROVE_IMAGE_(\d{3})\}\}/g;

export interface ProtectedArticleImages {
  source: string;
  images: Array<{ token: string; markdown: string }>;
}

export function cleanArticleMarkdown(source: string, title = ""): string {
  const normalizedTitle = title.trim().replace(/^#+\s*/, "");
  let lines = String(source ?? "")
    .replace(/\r/g, "")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.trimEnd());

  const firstLines = lines.slice(0, 60);
  let bylineEnd = -1;
  firstLines.forEach((line, index) => {
    if (/^(?:作者|编辑|撰文|文|采访|来源)\s*[丨|｜:：]/.test(line.trim())) bylineEnd = index;
  });
  if (bylineEnd >= 0) {
    let start = bylineEnd + 1;
    while (start < lines.length) {
      const value = lines[start]!.trim();
      if (
        !value
        || /^\*+$/.test(value)
        || /^\**!\[[^\]]*]\([^)]+\)\**$/.test(value)
      ) {
        start += 1;
        continue;
      }
      break;
    }
    lines = lines.slice(start);
  } else {
    while (lines.length) {
      const value = lines[0]!.trim();
      if (
        !value
        || value === normalizedTitle
        || value.replace(/^#+\s*/, "") === normalizedTitle
        || /^(?:原创|在小说阅读器|去阅读|微信扫一扫|点击.*阅读)/.test(value)
        || /^\*+$/.test(value)
      ) {
        lines.shift();
        continue;
      }
      break;
    }
  }

  let footerStart = lines.findIndex((line, index) => {
    if (index < Math.floor(lines.length * 0.55)) return false;
    const value = line.trim()
      .replace(/^#+\s*/, "")
      .replace(/^\*+|\*+$/g, "")
      .trim();
    return /^(?:推荐阅读|阅读原文|知道了|微信扫一扫|扫描上方二维码|未经.+授权|上车[，,]|可独家畅览)/.test(value);
  });
  if (footerStart >= 0) {
    while (footerStart > 0) {
      const previous = lines[footerStart - 1]!.trim();
      if (!previous || /^(?:!\[\[[^\]]+]]\s*)+$/.test(previous) || /^(?:!\[[^\]]*]\([^)]+\)\s*)+$/.test(previous)) {
        footerStart -= 1;
        continue;
      }
      break;
    }
    lines = lines.slice(0, footerStart);
  }

  return cleanText(lines
    .filter((line) => {
      const value = line.trim();
      return !/^\*{2,}$/.test(value)
        && value !== "//"
        && !/^\*{0,2}\d{1,2}\s*$/.test(value)
        && !/^(?:在小说阅读器读本章|在小说阅读器中沉浸阅读|去阅读)$/.test(value);
    })
    .join("\n"));
}

export function protectArticleImages(source: string): ProtectedArticleImages {
  const images: ProtectedArticleImages["images"] = [];
  const protectedSource = source.replace(ARTICLE_IMAGE_PATTERN, (markdown) => {
    const token = `{{KNOWGROVE_IMAGE_${String(images.length + 1).padStart(3, "0")}}}`;
    images.push({ token, markdown });
    return `\n\n${token}\n\n`;
  }).replace(/\n{3,}/g, "\n\n");
  return { source: protectedSource.trim(), images };
}

export function restoreArticleImages(bodyMarkdown: string, images: ProtectedArticleImages["images"]): string {
  let restored = bodyMarkdown;
  const present = new Set(restored.match(IMAGE_PLACEHOLDER_PATTERN) ?? []);
  for (const image of images) restored = restored.split(image.token).join(image.markdown);
  const missing = images.filter((image) => !present.has(image.token));
  if (missing.length) {
    restored = [
      restored.trim(),
      "### 正文图片",
      missing.map((image) => image.markdown).join("\n\n"),
    ].filter(Boolean).join("\n\n");
  }
  return restored.replace(IMAGE_PLACEHOLDER_PATTERN, "").replace(/\n{3,}/g, "\n\n").trim();
}

function transcriptJoiner(left: string, right: string): string {
  if (!left || !right) return "";
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]$/u.test(left)
    || /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}，。！？；：、]/u.test(right)) {
    return "";
  }
  return " ";
}

export function formatTranscriptParagraphs(source: string): string {
  const sanitized = source
    .replace(/(?:[\p{Script=Sinhala}\p{Script=Telugu}\p{Script=Tamil}\p{Script=Devanagari}\p{Script=Gujarati}\p{Script=Bengali}]\s*){4,}/gu, " ")
    .replace(/^.*?(?:MING PAO|字幕[製制作组]|未经许可|\(字幕).*?$/gim, " ");
  const fragments = sanitized
    .replace(/\r\n/g, "\n")
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => Boolean(line) && !/^(?:MING PAO|字幕[製制作组]|未经许可|\(字幕)/i.test(line));
  const merged: string[] = [];
  for (const fragment of fragments) {
    const previous = merged[merged.length - 1];
    if (previous === fragment || previous?.startsWith(fragment)) continue;
    if (previous && fragment.startsWith(previous)) {
      merged[merged.length - 1] = fragment;
      continue;
    }
    merged.push(fragment);
  }
  const continuous = merged.reduce(
    (text, fragment) => text
      ? `${text}${transcriptJoiner(text, fragment)}${fragment}`
      : fragment,
    "",
  ).trim();
  if (!continuous) return "";

  const sentences = continuous.match(/[^。！？!?；;\n]+[。！？!?；;]?/g)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean)
    ?? [continuous];
  const readableUnits = sentences.flatMap((sentence) => {
    if (sentence.length <= 280) return [sentence];
    const chunks: string[] = [];
    let remaining = sentence;
    while (remaining.length > 280) {
      const whitespace = remaining.lastIndexOf(" ", 280);
      const splitAt = whitespace >= 140 ? whitespace : 240;
      chunks.push(remaining.slice(0, splitAt).trim());
      remaining = remaining.slice(splitAt).trim();
    }
    if (remaining) chunks.push(remaining);
    return chunks;
  });
  const paragraphs: string[] = [];
  let current = "";
  let sentenceCount = 0;
  for (const sentence of readableUnits) {
    const joiner = transcriptJoiner(current, sentence);
    current = current ? `${current}${joiner}${sentence}` : sentence;
    sentenceCount += 1;
    if (current.length >= 180 || sentenceCount >= 4) {
      paragraphs.push(current.trim());
      current = "";
      sentenceCount = 0;
    }
  }
  if (current.trim()) paragraphs.push(current.trim());
  return paragraphs.join("\n\n");
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function parseSubtitleText(subtitle: string, fileName = ""): string {
  if (/\.json3?$|\.json$/i.test(fileName) || /^\s*[{[]/.test(subtitle)) {
    try {
      const parsed = JSON.parse(subtitle) as {
        body?: Array<{ content?: unknown }>;
        events?: Array<{ segs?: Array<{ utf8?: unknown }> }>;
      };
      const body = parsed.body?.map((item) => stringField(item.content).trim()).filter(Boolean) ?? [];
      const events = parsed.events?.map((event) =>
        event.segs?.map((segment) => stringField(segment.utf8)).join("").trim() ?? "",
      ).filter(Boolean) ?? [];
      const jsonTranscript = [...body, ...events].join("\n");
      if (jsonTranscript) return formatTranscriptParagraphs(jsonTranscript);
    } catch {
      // Some providers serve WebVTT with a JSON-looking preamble; continue with text parsing.
    }
  }
  const lines: string[] = [];
  for (const rawLine of subtitle.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .trim();
    if (!line
      || /^WEBVTT/.test(line)
      || /-->/.test(line)
      || /^\d+$/.test(line)
      || /^NOTE\b/.test(line)
      || /^Kind:|^Language:/i.test(line)) continue;
    lines.push(line);
  }
  return formatTranscriptParagraphs(lines.join("\n"));
}

export function parseWebVtt(vtt: string): string {
  return parseSubtitleText(vtt, "subtitle.vtt");
}

export const CAPTURE_FILE_NAME_MAX_BYTES = 180;

export function truncateUtf8(value: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  let bytes = 0;
  let result = "";
  for (const character of value) {
    const characterBytes = encoder.encode(character).length;
    if (bytes + characterBytes > maxBytes) break;
    result += character;
    bytes += characterBytes;
  }
  return result;
}

export function safeCaptureFileName(value: string): string {
  const withoutControlCharacters = Array.from(value, (character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 31 || code === 127 ? " " : character;
  }).join("");
  const normalized = withoutControlCharacters
    .replace(/[\\/:*?"<>|#^[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const truncated = truncateUtf8(normalized, CAPTURE_FILE_NAME_MAX_BYTES)
    .replace(/[. ]+$/g, "")
    .trim();
  return truncated || "未命名内容";
}

export function captureDatePrefix(value: unknown, fallbackTime?: number): string {
  const raw = typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
  const dateOnly = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (dateOnly) {
    return `${dateOnly[1]}-${dateOnly[2]!.padStart(2, "0")}-${dateOnly[3]!.padStart(2, "0")}`;
  }
  const fallback = typeof fallbackTime === "number" && Number.isFinite(fallbackTime)
    ? fallbackTime
    : Date.now();
  const parsed = raw ? new Date(raw) : new Date(fallback);
  const date = Number.isNaN(parsed.getTime())
    ? new Date(fallback)
    : parsed;
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function datedArticleTitle(title: string, datePrefix: string): string {
  const cleanTitle = safeCaptureFileName(title).replace(/^\d{4}-\d{2}-\d{2}-/, "");
  return `${datePrefix}-${cleanTitle}`;
}

export function articleCaptureTitle(
  title: string,
  datePrefix: string,
  prefixWithDate: boolean,
): string {
  return prefixWithDate
    ? datedArticleTitle(title, datePrefix)
    : safeCaptureFileName(title);
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

export function buildRawCaptureNote(input: {
  pageType: BrowserCapturePageType;
  title: string;
  fileName?: string;
  url?: string;
  source: string;
  author?: string;
  publishedAt?: string;
  capturedAt: string;
  statusProperty: string;
  readingStatus: string;
  mediaPath?: string;
  outputLocale?: KnowGroveLocale;
}): string {
  const labels = captureOutputLabels(input.outputLocale ?? "zh-CN");
  const transcriptHeading = input.pageType === "article" ? labels.originalText : labels.fullTranscript;
  const contentType = input.pageType === "video"
    ? "视频"
    : input.pageType === "audio"
      ? "音频"
      : "网页文章";
  return [
    "---",
    ...(input.fileName ? [`文件名: ${yamlString(input.fileName)}`] : []),
    `标题: ${yamlString(input.title)}`,
    ...(input.url ? [`来源: ${yamlString(input.url)}`] : []),
    `内容类型: ${yamlString(contentType)}`,
    `采集时间: ${yamlString(input.capturedAt)}`,
    ...(input.author ? [`作者: ${yamlString(input.author)}`] : []),
    ...(input.publishedAt ? [`发布时间: ${yamlString(input.publishedAt)}`] : []),
    `${input.statusProperty}: ${yamlString(input.readingStatus)}`,
    "KnowGrove采集状态: \"处理中\"",
    "---",
    "",
    `# ${input.title}`,
    "",
    ...(input.mediaPath
      ? [`## ${input.pageType === "video" ? labels.originalVideo : labels.originalAudio}`, "", `![[${input.mediaPath}]]`, ""]
      : []),
    `## ${transcriptHeading}`,
    "",
    input.source.trim(),
    "",
  ].join("\n");
}

export function buildCaptureFailureNote(input: {
  pageType: BrowserCapturePageType;
  title: string;
  url: string;
  capturedAt: string;
  error: string;
}): string {
  const contentType = input.pageType === "video"
    ? "视频"
    : input.pageType === "audio"
      ? "音频"
      : "网页文章";
  return [
    "---",
    `标题: ${yamlString(input.title)}`,
    `来源: ${yamlString(input.url)}`,
    `内容类型: ${yamlString(contentType)}`,
    `采集时间: ${yamlString(input.capturedAt)}`,
    "KnowGrove采集状态: \"部分完成\"",
    "---",
    "",
    `# ${input.title}`,
    "",
    "> 来源链接已经保存，但正文提取没有完成。重新打开来源页面后，可以再次点击言续重试。",
    "",
    "## 处理状态",
    "",
    `- 错误：${input.error.replace(/\s+/g, " ").trim() || "未知错误"}`,
    "",
    "## 来源",
    "",
    input.url,
    "",
  ].join("\n");
}

export function buildEnhancedCaptureNote(
  rawNote: string,
  pageType: BrowserCapturePageType,
  result: BrowserCaptureAIResult,
  outputLocale: KnowGroveLocale = "zh-CN",
): string {
  const labels = captureOutputLabels(outputLocale);
  const frontmatter = rawNote.match(/^---\n[\s\S]*?\n---\n?/)?.[0]?.trim() ?? "";
  const completedFrontmatter = frontmatter
    ? frontmatter.replace(/KnowGrove采集状态:\s*["']?处理中["']?/, "KnowGrove采集状态: \"已完成\"")
    : "";
  const title = rawNote.match(/^#\s+(.+)$/m)?.[1]?.trim() || "未命名内容";
  const sourceHeading = pageType === "article" ? labels.originalText : labels.fullTranscript;
  const sourceMatch = rawNote.match(new RegExp(`^##\\s+${sourceHeading}\\s*$([\\s\\S]*)`, "m"));
  const source = sourceMatch?.[1]?.trim() ?? "";
  const bodyHeading = pageType !== "article"
    ? result.mode === "multi-speaker"
      ? labels.dialogue
      : pageType === "audio" ? labels.audioBody : labels.videoBody
    : labels.organizedBody;
  const originalMediaHeading = pageType === "video" ? labels.originalVideo : labels.originalAudio;
  const mediaHeading = rawNote.match(new RegExp(`^##\\s+${escapeRegExp(originalMediaHeading)}\\s*$`, "m"));
  let mediaSection = "";
  if (mediaHeading?.index !== undefined) {
    const fromHeading = rawNote.slice(mediaHeading.index);
    const afterHeading = fromHeading.slice(mediaHeading[0].length);
    const nextHeadingOffset = afterHeading.search(/^##\s+/m);
    mediaSection = fromHeading
      .slice(0, nextHeadingOffset >= 0 ? mediaHeading[0].length + nextHeadingOffset : undefined)
      .trim();
  }
  return [
    completedFrontmatter,
    "",
    `# ${title}`,
    "",
    `## ${labels.summary}`,
    "",
    result.summary,
    "",
    `## ${labels.keyPoints}`,
    "",
    result.keyPoints.map((point) => `- ${point.replace(/^[-*]\s+/, "")}`).join("\n"),
    "",
    `## ${bodyHeading}`,
    "",
    result.bodyMarkdown,
    "",
    ...(mediaSection ? [mediaSection, ""] : []),
    `## ${sourceHeading}`,
    "",
    source,
    "",
  ].join("\n").replace(/\n{3,}/g, "\n\n");
}
