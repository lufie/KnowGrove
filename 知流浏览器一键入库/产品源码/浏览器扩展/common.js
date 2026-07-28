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
];

export function detectPageType(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const isWeiboVideo = host.endsWith("weibo.com") && parsed.pathname.startsWith("/tv");
    return isWeiboVideo || VIDEO_HOSTS.some((candidate) =>
      host === candidate || host.endsWith(`.${candidate}`),
    )
      ? "video"
      : "article";
  } catch {
    return "article";
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

export async function requestBackgroundPairing() {
  const result = await extensionApi.runtime.sendMessage({ type: "knowgrove:pair" });
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
        return {
          title: clean(document.title).slice(0, 500),
          content: text,
          author: meta(["author", "article:author"]),
          publishedAt: meta(["article:published_time", "date", "datePublished"]),
          sourceKind: selection.length >= 80 ? "selection" : "rendered-page",
        };
      },
    });
    const captured = results?.[0]?.result;
    return captured?.content?.length >= 80 ? captured : null;
  } catch {
    return null;
  }
}

export function pageTypeLabel(pageType) {
  return pageType === "video" ? "视频" : "文章";
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
