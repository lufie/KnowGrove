import { access, readFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const extensionRoot = resolve(currentDirectory, "..", "浏览器扩展");
const manifestPath = resolve(extensionRoot, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const errors = [];

function check(condition, message) {
  if (!condition) errors.push(message);
}

async function fileExists(relativePath) {
  try {
    await access(resolve(extensionRoot, relativePath), fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

check(manifest.manifest_version === 3, "manifest_version 必须为 3");
check(Boolean(manifest.action), "使用 chrome.action 时 manifest 必须声明 action");
check(manifest.permissions?.includes("storage"), "扩展需要 storage 权限保存配置和任务");
check(manifest.permissions?.includes("tabs"), "读取当前页面 URL 和标题需要 tabs 权限");
check(manifest.permissions?.includes("activeTab"), "读取用户主动提交页面的可见正文需要 activeTab 权限");
check(manifest.permissions?.includes("scripting"), "按用户操作提取当前页面正文需要 scripting 权限");
check(manifest.permissions?.includes("alarms"), "后台任务进度恢复需要 alarms 权限");
check(!manifest.permissions?.includes("cookies"), "cookies 不得成为安装时必选权限");
check(manifest.optional_permissions?.includes("cookies"), "受保护媒体重试需要用户手势触发的可选 cookies 权限");
check(
  JSON.stringify([...(manifest.optional_host_permissions ?? [])].sort()) === JSON.stringify(["http://*/*", "https://*/*"]),
  "动态站点授权只能声明 http/https 可选主机权限",
);
check(!manifest.host_permissions?.includes("<all_urls>"), "不得使用 <all_urls> 主机权限");
for (const host of manifest.host_permissions ?? []) {
  check(
    /^http:\/\/127\.0\.0\.1:47831\/\*$/.test(host),
    `主机权限必须限定到 KnowGrove 本机接收服务：${host}`,
  );
}

const referencedFiles = [
  manifest.background?.service_worker,
  manifest.action?.default_popup,
  manifest.options_page,
  ...Object.values(manifest.action?.default_icon ?? {}),
  ...Object.values(manifest.icons ?? {}),
].filter(Boolean);
for (const path of referencedFiles) {
  check(await fileExists(path), `manifest 引用了不存在的文件：${path}`);
}

const htmlFiles = [manifest.action?.default_popup, manifest.options_page].filter(Boolean);
for (const path of htmlFiles) {
  const html = await readFile(resolve(extensionRoot, path), "utf8");
  check(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), `${path} 包含内联脚本`);
  check(!/\son[a-z]+\s*=/i.test(html), `${path} 包含内联事件处理器`);
  if (path === manifest.action?.default_popup) {
    check(/id="cancel-job"/.test(html), "任务进度必须提供取消并清理入口");
    check(/id="browser-session"/.test(html), "站点授权失败后必须提供再次授权入口");
    check(/id="public-capture"/.test(html), "站点授权失败后必须允许退回公开解析");
  }
}

const javaScriptFiles = [
  "common.js",
  "popup.js",
  "options.js",
  manifest.background?.service_worker,
].filter(Boolean);
for (const path of javaScriptFiles) {
  const source = await readFile(resolve(extensionRoot, path), "utf8");
  check(!/\beval\s*\(/.test(source), `${path} 使用了 eval`);
  check(!/\bnew\s+Function\s*\(/.test(source), `${path} 使用了 new Function`);
  if (/(?:document|chrome|browser)\.cookies?\b/.test(source)) {
    check(path === "common.js", `${path} 不得读取浏览器 Cookie`);
  }
  check(!/\.then\s*\(/.test(source), `${path} 使用了 .then()，应改为 async/await`);
  check(!/bridge:init|bridge:start|本地助手/.test(source), `${path} 仍引用已删除的独立本地助手`);
  if (path === "common.js") {
    check(/const pathBvid = location\.pathname\.match/.test(source), "Bilibili 字幕必须优先使用当前页面 BV 号");
    check(/x\/web-interface\/view\?bvid=/.test(source), "Bilibili 单页切换后必须重新获取当前视频 CID");
    check(
      /fetch\(subtitleUrl, \{ credentials: "omit" \}\)/.test(source),
      "Bilibili 字幕正文必须避免携带凭据触发跨域失败",
    );
    check(/permissions\.request\(\{[\s\S]*permissions: \["cookies"\]/.test(source), "Cookie 必须在用户操作时动态授权");
    check(/cookies\.getAll\(\{ url: tab\.url \}\)/.test(source), "只允许读取当前标签页 URL 可用的 Cookie");
    check(!/storage\.(?:local|sync)\.set\([^)]*sessionCookies/s.test(source), "站点 Cookie 不得写入扩展持久存储");
    check(/captureProtectedMediaCandidates/.test(source), "受保护媒体页面必须读取播放器和页面状态中的可见媒体地址");
    check(/isMissingBackgroundReceiver/.test(source), "配对必须识别后台接收端缺失错误");
    check(/return requestPopupPairing\(\)/.test(source), "后台接收端缺失时必须由弹窗直接续接配对");
    check(/resumePendingPairing/.test(source), "配对状态必须支持弹窗重新打开后恢复");
  }
  if (path === "popup.js") {
    check(/\/v1\/jobs\/\$\{encodeURIComponent\(jobId\)\}\/cancel/.test(source), "取消入口必须调用本机任务清理接口");
    check(/storage\.local\.remove\("activeCaptureJob"\)/.test(source), "取消后必须清理浏览器活动任务状态");
    check(/openConnectionGuide/.test(source), "未连接时必须自动唤起 KnowGrove 连接引导");
    check(/await connectKnowGrove\(\)/.test(source), "本机服务在线但未配对时必须自动发起配对");
    check(/KNOWGROVE_SETTINGS_URL/.test(source), "本机服务离线时必须打开 KnowGrove 浏览器连接设置");
    check(/SITE_PERMISSION_REQUIRED/.test(source), "当前站点权限失败必须使用独立错误分支");
    check(/startCapture\(\{ useSession: false \}\)/.test(source), "当前站点授权失败后必须保留公开解析入口");
    check(
      source.indexOf("await captureBrowserSession(currentTab)") < source.indexOf("await capturePageContent(currentTab.id)"),
      "当前站点权限必须在其他异步操作之前请求，以保留 Chrome 用户手势",
    );
  }
  if (path === manifest.background?.service_worker) {
    check(/action\.enable\(\)/.test(source), "后台启动时必须恢复工具栏入口");
    check(/action\.setPopup\(\{ popup: "popup\.html" \}\)/.test(source), "后台启动时必须恢复剪藏弹窗");
  }
}

const originalChrome = globalThis.chrome;
const permissionRequests = [];
globalThis.chrome = {
  permissions: {
    request: async (request) => {
      permissionRequests.push(request);
      return permissionRequests.length > 1;
    },
  },
  cookies: {
    getAll: async () => [{
      domain: ".example.com",
      path: "/",
      name: "session",
      value: "test-only",
      secure: true,
      httpOnly: true,
      expirationDate: 0,
    }],
  },
};
try {
  const common = await import(`${resolve(extensionRoot, "common.js")}?permission-check=${Date.now()}`);
  check(
    common.normalizeCaptureUrl("https://www.douyin.com/jingxuan?modal_id=7653682159667989801")
      === "https://www.douyin.com/video/7653682159667989801",
    "抖音 jingxuan modal_id 链接必须转换为下载器可识别的标准视频链接",
  );
  check(
    common.normalizeCaptureUrl("https://example.com/article?a=1") === "https://example.com/article?a=1",
    "非抖音弹层链接不得被改写",
  );
  let deniedError;
  try {
    await common.captureBrowserSession({ url: "https://www.example.com/article" });
  } catch (error) {
    deniedError = error;
  }
  check(deniedError?.code === "SITE_PERMISSION_REQUIRED", "用户拒绝当前站点权限时必须返回可识别的错误码");
  const session = await common.captureBrowserSession({ url: "https://www.example.com/article" });
  check(session?.cookies?.length === 1, "用户允许当前站点权限后必须读取该 URL 的 Cookie");
  check(
    permissionRequests.every((request) => request.origins?.[0] === "https://www.example.com/*"),
    "当前站点授权必须限定到精确 origin",
  );
} finally {
  if (originalChrome === undefined) delete globalThis.chrome;
  else globalThis.chrome = originalChrome;
}

if (errors.length) {
  console.error("浏览器扩展检查失败：");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log("浏览器扩展 Manifest V3、安全权限和文件引用检查通过。");
}
