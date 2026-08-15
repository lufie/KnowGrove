const extensionApi = globalThis.browser ?? globalThis.chrome;

export const BRIDGE_URL = "http://127.0.0.1:47831";
export const KNOWGROVE_SETTINGS_URL = "obsidian://knowgrove-settings?section=browser-capture";

export const DEFAULT_SETTINGS = Object.freeze({
  token: "",
  autoRun: true,
});

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

const PROTECTED_MEDIA_HOSTS = [
  "douyin.com",
  "ixigua.com",
  "tiktok.com",
  "xiaohongshu.com",
  "instagram.com",
  "facebook.com",
  "weixin.qq.com",
];

export function detectPageType(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const isWeiboVideo = host.endsWith("weibo.com") && parsed.pathname.startsWith("/tv");
    const isWeChatChannels = host === "weixin.qq.com" && parsed.pathname.startsWith("/sph/");
    if (
      /\.(?:mp3|m4a|wav|aac|flac|ogg|opus)(?:$|[?#])/i.test(parsed.href)
      || AUDIO_HOSTS.some((candidate) => host === candidate || host.endsWith(`.${candidate}`))
    ) return "audio";
    return isWeiboVideo || isWeChatChannels || VIDEO_HOSTS.some((candidate) =>
      host === candidate || host.endsWith(`.${candidate}`),
    ) || /\.(?:mp4|mov|mkv|m4v)(?:$|[?#])/i.test(parsed.href)
      ? "video"
      : "article";
  } catch {
    return "article";
  }
}

export function isProtectedMediaPage(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return PROTECTED_MEDIA_HOSTS.some((candidate) => host === candidate || host.endsWith(`.${candidate}`));
  } catch {
    return false;
  }
}

export async function loadSettings() {
  const { settings = {} } = await extensionApi.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...settings };
}

export async function saveSettings(settings) {
  await extensionApi.storage.local.set({
    settings: {
      ...DEFAULT_SETTINGS,
      ...settings,
    },
  });
}

export async function bridgeRequest(settings, path, options = {}) {
  const headers = {
    Accept: "application/json",
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(settings?.token ? { "X-KnowGrove-Token": settings.token } : {}),
    ...(options.headers ?? {}),
  };
  let response;
  try {
    response = await fetch(`${BRIDGE_URL}${path}`, { ...options, headers });
  } catch {
    const error = new Error("没有连接到 KnowGrove。请打开 Obsidian，并确认 KnowGrove 已启用浏览器一键入库。");
    error.code = "KNOWGROVE_OFFLINE";
    throw error;
  }
  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`KnowGrove 返回了无法识别的内容（HTTP ${response.status}）`);
    }
  }
  if (!response.ok) {
    const error = new Error(data.error || `KnowGrove 请求失败（HTTP ${response.status}）`);
    error.code = data.code || `HTTP_${response.status}`;
    throw error;
  }
  return data;
}

export async function pairRequest() {
  return bridgeRequest({}, "/v1/pair/request", {
    method: "POST",
    body: JSON.stringify({ client: "knowgrove-browser-extension" }),
  });
}

export async function pairStatus(nonce) {
  return bridgeRequest({}, `/v1/pair/status?nonce=${encodeURIComponent(nonce)}`);
}

const PAIRING_STATE_KEY = "knowGrovePairing";

function delay(milliseconds) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

function isMissingBackgroundReceiver(error) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /receiving end does not exist|could not establish connection|message port closed/i.test(message);
}

export async function resumePendingPairing() {
  const stored = await extensionApi.storage.local.get(PAIRING_STATE_KEY);
  const pairing = stored[PAIRING_STATE_KEY];
  if (pairing?.status !== "pending" || !pairing.nonce) return { ok: false, pending: false };

  const startedAt = new Date(pairing.startedAt || 0).getTime();
  if (!Number.isFinite(startedAt) || Date.now() - startedAt >= 130_000) {
    await extensionApi.storage.local.set({
      [PAIRING_STATE_KEY]: {
        status: "failed",
        error: "配对请求已过期，请重新连接",
        completedAt: new Date().toISOString(),
      },
    });
    return { ok: false, pending: false };
  }

  let status;
  try {
    status = await pairStatus(pairing.nonce);
  } catch (error) {
    if (error?.code !== "HTTP_404") throw error;
    await extensionApi.storage.local.set({
      [PAIRING_STATE_KEY]: {
        status: "failed",
        error: "配对请求已失效，请重新连接",
        completedAt: new Date().toISOString(),
      },
    });
    return { ok: false, pending: false };
  }
  if (status.status !== "approved" || !status.token) {
    return {
      ok: false,
      pending: true,
      deepLink: pairing.deepLink || `obsidian://knowgrove-browser-pair?nonce=${encodeURIComponent(pairing.nonce)}`,
    };
  }

  const settings = await loadSettings();
  await saveSettings({ ...settings, token: status.token });
  await extensionApi.storage.local.set({
    [PAIRING_STATE_KEY]: {
      status: "approved",
      completedAt: new Date().toISOString(),
    },
  });
  return { ok: true, pending: false };
}

async function requestPopupPairing() {
  const pairing = await pairRequest();
  await extensionApi.storage.local.set({
    [PAIRING_STATE_KEY]: {
      status: "pending",
      nonce: pairing.nonce,
      startedAt: new Date().toISOString(),
      mode: "popup-fallback",
      deepLink: pairing.deepLink,
    },
  });
  await extensionApi.tabs.create({ url: pairing.deepLink });
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await delay(1_000);
    const result = await resumePendingPairing();
    if (result.ok) return result;
    if (!result.pending) break;
  }
  throw new Error("配对请求已过期，请重新连接");
}

export async function requestBackgroundPairing() {
  let result;
  try {
    result = await extensionApi.runtime.sendMessage({ type: "knowgrove:pair" });
  } catch (error) {
    if (!isMissingBackgroundReceiver(error)) throw error;
    return requestPopupPairing();
  }
  if (!result?.ok) {
    const error = new Error(result?.error || "KnowGrove 配对未完成");
    error.code = result?.code || "PAIRING_FAILED";
    throw error;
  }
  return result;
}

export async function capturePageContent(tabId) {
  if (!tabId || !extensionApi.scripting) return null;
  try {
    const results = await extensionApi.scripting.executeScript({
      target: { tabId },
      func: () => {
        const clean = (value) => String(value ?? "")
          .replace(/\r/g, "")
          .replace(/[ \t]+\n/g, "\n")
          .replace(/\n[ \t]+/g, "\n")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
        const selection = clean(document.getSelection?.()?.toString());
        const candidates = [
          document.querySelector("main"),
          document.querySelector("[role='main']"),
          ...document.querySelectorAll("article"),
          ...document.querySelectorAll(
            "[class*='conversation'],[class*='chat'],[class*='message-list'],[data-testid*='conversation'],[data-testid*='chat']",
          ),
        ].filter((element, index, all) => element && all.indexOf(element) === index);
        const root = candidates
          .map((element) => ({ element, text: clean(element.innerText) }))
          .sort((left, right) => right.text.length - left.text.length)[0];
        const text = (selection.length >= 80 ? selection : root?.text || clean(document.body?.innerText))
          .slice(0, 120_000);
        const meta = (names) => {
          for (const name of names) {
            const element = document.querySelector(`meta[name="${name}"],meta[property="${name}"]`);
            const value = clean(element?.getAttribute("content"));
            if (value) return value;
          }
          return "";
        };
        const ogType = meta(["og:type", "twitter:card"]).toLowerCase();
        const hasVideo = /video|player/.test(ogType);
        const hasAudio = /audio|music/.test(ogType);
        const imageCandidates = [...(root?.element?.querySelectorAll("img") ?? [])]
          .flatMap((image) => {
            const rect = image.getBoundingClientRect();
            const url = String(image.currentSrc || image.src || image.dataset?.src || image.dataset?.original || "").trim();
            if (!/^https?:\/\//i.test(url) || /^data:/i.test(url)) return [];
            if (Math.max(image.naturalWidth || 0, rect.width) < 240 || Math.max(image.naturalHeight || 0, rect.height) < 160) return [];
            if (image.closest("nav,header,footer,[role='navigation']")) return [];
            return [{ url, alt: clean(image.alt || image.getAttribute("aria-label") || "图片") }];
          })
          .filter((item, index, all) => all.findIndex((candidate) => candidate.url === item.url) === index)
          .slice(0, 80);
        const mediaCandidates = [];
        const pushMedia = (rawUrl, pageType, label = "") => {
          const url = String(rawUrl || "").trim();
          if (!/^https?:\/\//i.test(url)) return;
          if (mediaCandidates.some((candidate) => candidate.url === url)) return;
          mediaCandidates.push({ url, pageType, label: clean(label).slice(0, 160) });
        };
        for (const video of document.querySelectorAll("video")) {
          pushMedia(video.currentSrc || video.src, "video", video.title || video.getAttribute("aria-label") || "");
        }
        for (const audio of document.querySelectorAll("audio")) {
          pushMedia(audio.currentSrc || audio.src, "audio", audio.title || audio.getAttribute("aria-label") || "");
        }
        for (const source of document.querySelectorAll("video source,audio source")) {
          pushMedia(source.src, source.closest("audio") ? "audio" : "video");
        }
        for (const entry of performance.getEntriesByType?.("resource") ?? []) {
          const url = String(entry.name || "");
          if (/\.(?:m3u8|mpd|mp4|mov|mkv|m4v)(?:$|[?#])/i.test(url)) pushMedia(url, "video");
          if (/\.(?:mp3|m4a|aac|flac|ogg|opus|wav)(?:$|[?#])/i.test(url)) pushMedia(url, "audio");
        }
        return {
          title: (meta(["og:title", "twitter:title"]) || clean(document.title)).slice(0, 500),
          content: text,
          author: meta(["author", "article:author"]),
          publishedAt: meta(["article:published_time", "date", "datePublished"]),
          sourceKind: selection.length >= 80 ? "selection" : "rendered-page",
          detectedType: hasVideo ? "video" : hasAudio ? "audio" : "article",
          images: imageCandidates,
          mediaCandidates: mediaCandidates.slice(0, 8),
          userAgent: navigator.userAgent,
        };
      },
    });
    const captured = results?.[0]?.result;
    return captured?.content?.length >= 80 ? captured : null;
  } catch {
    return null;
  }
}

export async function captureProtectedMediaCandidates(tabId) {
  if (!tabId || !extensionApi.scripting) return [];
  try {
    const results = await extensionApi.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: () => {
        const candidates = [];
        const seenUrls = new Set();
        const seenObjects = new WeakSet();
        const mediaKey = /(?:play|video|audio|stream|download|master|backup|origin|source|src|url)/i;
        const mediaUrl = /(?:\.(?:m3u8|mpd|mp4|m4v|mov|mkv|mp3|m4a|aac|flac|ogg|opus|wav)(?:$|[?#])|videoplayback|video|play|stream|media|aweme|douyinvod|tiktokcdn|xhscdn|fbcdn|cdninstagram|vimeocdn|wxurl|tos-)/i;
        const imageUrl = /(?:avatar|profile|image|img|cover|poster|thumbnail|\.jpe?g(?:$|[?#])|\.png(?:$|[?#])|\.webp(?:$|[?#]))/i;
        const push = (rawUrl, key = "") => {
          const value = String(rawUrl ?? "")
            .replaceAll("\\u002F", "/")
            .replaceAll("\\/", "/")
            .replaceAll("&amp;", "&")
            .trim();
          if (!/^https?:\/\//i.test(value) || value.length > 8_000) return;
          if (!mediaKey.test(key) || !mediaUrl.test(value) || imageUrl.test(value)) return;
          let parsed;
          try {
            parsed = new URL(value, location.href);
          } catch {
            return;
          }
          if (!["http:", "https:"].includes(parsed.protocol) || seenUrls.has(parsed.href)) return;
          seenUrls.add(parsed.href);
          const pageType = /(?:\.mp3|\.m4a|\.aac|\.flac|\.ogg|\.opus|\.wav)(?:$|[?#])/i.test(parsed.href)
            ? "audio"
            : "video";
          candidates.push({ url: parsed.href, pageType, label: key.slice(0, 120) });
        };
        const walk = (value, key = "root", depth = 0) => {
          if (candidates.length >= 20 || depth > 10 || value == null) return;
          if (typeof value === "string") {
            push(value, key);
            return;
          }
          if (typeof value !== "object" || seenObjects.has(value)) return;
          seenObjects.add(value);
          if (Array.isArray(value)) {
            for (const item of value.slice(0, 300)) walk(item, key, depth + 1);
            return;
          }
          for (const [childKey, childValue] of Object.entries(value).slice(0, 600)) {
            walk(childValue, childKey, depth + 1);
            if (candidates.length >= 20) break;
          }
        };
        const parseScriptJson = (selector) => {
          const text = document.querySelector(selector)?.textContent?.trim();
          if (!text || text.length > 8_000_000) return null;
          try {
            return JSON.parse(text);
          } catch {
            return null;
          }
        };
        const roots = [
          globalThis.__INITIAL_STATE__,
          globalThis.__NEXT_DATA__,
          globalThis.__UNIVERSAL_DATA_FOR_REHYDRATION__,
          globalThis.SIGI_STATE,
          globalThis.__INITIAL_SSR_STATE__,
          parseScriptJson("#__NEXT_DATA__"),
          parseScriptJson("#__UNIVERSAL_DATA_FOR_REHYDRATION__"),
          parseScriptJson("#SIGI_STATE"),
        ];
        for (const root of roots) walk(root);
        return candidates;
      },
    });
    return Array.isArray(results?.[0]?.result) ? results[0].result.slice(0, 20) : [];
  } catch {
    return [];
  }
}

export async function captureBrowserSession(tab) {
  if (!tab?.url || !extensionApi.permissions || !extensionApi.cookies) return null;
  const parsed = new URL(tab.url);
  const originPattern = `${parsed.protocol}//${parsed.host}/*`;
  const granted = await extensionApi.permissions.request({
    permissions: ["cookies"],
    origins: [originPattern],
  });
  if (!granted) return null;
  const cookies = await extensionApi.cookies.getAll({ url: tab.url });
  return {
    cookies: cookies.slice(0, 300).map((cookie) => ({
      domain: cookie.domain,
      path: cookie.path,
      name: cookie.name,
      value: cookie.value,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      expirationDate: cookie.expirationDate || 0,
    })),
    referer: tab.url,
  };
}

export async function captureBilibiliTranscript(tabId) {
  if (!tabId || !extensionApi.scripting) return null;
  try {
    const results = await extensionApi.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: async () => {
        const state = globalThis.__INITIAL_STATE__ ?? {};
        const videoData = state.videoData ?? {};
        const pathBvid = location.pathname.match(/\/video\/(BV[a-zA-Z0-9]+)/)?.[1] ?? "";
        const stateBvid = String(videoData.bvid ?? state.bvid ?? "");
        const bvid = String(pathBvid || stateBvid);
        let title = stateBvid === bvid ? String(videoData.title ?? "") : "";
        let cid = Number(
          (stateBvid === bvid ? videoData.cid ?? state.cidMap?.[bvid]?.cids?.[0] : 0)
          ?? new URL(location.href).searchParams.get("cid")
          ?? 0,
        );
        if (bvid && (!cid || stateBvid !== bvid)) {
          const viewResponse = await fetch(
            `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`,
            { credentials: "include" },
          );
          if (viewResponse.ok) {
            const view = await viewResponse.json();
            cid = Number(view?.data?.pages?.[0]?.cid ?? view?.data?.cid ?? cid);
            title = String(view?.data?.title ?? title);
          }
        }
        if (!bvid || !cid) return null;
        const playerResponse = await fetch(
          `https://api.bilibili.com/x/player/v2?bvid=${encodeURIComponent(bvid)}&cid=${encodeURIComponent(cid)}`,
          { credentials: "include" },
        );
        if (!playerResponse.ok) return null;
        const player = await playerResponse.json();
        const subtitles = Array.isArray(player?.data?.subtitle?.subtitles)
          ? player.data.subtitle.subtitles
          : [];
        const ranked = [...subtitles].sort((left, right) => {
          const rank = (item) => {
            const language = String(item?.lan ?? "").toLowerCase();
            if (/zh[-_]?hans|zh[-_]?cn/.test(language)) return 0;
            if (/ai[-_]?zh/.test(language)) return 1;
            if (language === "zh") return 2;
            if (/zh[-_]?hant|zh[-_]?tw/.test(language)) return 3;
            if (language.startsWith("en")) return 4;
            return 10;
          };
          return rank(left) - rank(right);
        });
        for (const item of ranked) {
          const rawUrl = String(item?.subtitle_url ?? "").trim();
          if (!rawUrl) continue;
          const subtitleUrl = rawUrl.startsWith("//") ? `https:${rawUrl}` : rawUrl;
          const subtitleResponse = await fetch(subtitleUrl, { credentials: "omit" });
          if (!subtitleResponse.ok) continue;
          const subtitle = await subtitleResponse.json();
          const transcript = (Array.isArray(subtitle?.body) ? subtitle.body : [])
            .map((line) => String(line?.content ?? "").trim())
            .filter(Boolean)
            .join("\n");
          if (transcript) {
            return {
              title: String(title || document.title || "").trim().slice(0, 500),
              transcript: transcript.slice(0, 120_000),
              language: String(item?.lan ?? ""),
            };
          }
        }
        return null;
      },
    });
    const captured = results?.[0]?.result;
    return captured?.transcript?.length >= 20 ? captured : null;
  } catch {
    return null;
  }
}

export function pageTypeLabel(pageType) {
  return pageType === "video" ? "视频" : pageType === "audio" ? "音频" : "文章";
}

export function isSupportedPage(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function clipText(value, maxLength = 120) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1)}…`
    : normalized;
}

export { extensionApi };
