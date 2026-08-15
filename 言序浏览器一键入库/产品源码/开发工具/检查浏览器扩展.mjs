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
  }
  if (path === "popup.js") {
    check(/\/v1\/jobs\/\$\{encodeURIComponent\(jobId\)\}\/cancel/.test(source), "取消入口必须调用本机任务清理接口");
    check(/storage\.local\.remove\("activeCaptureJob"\)/.test(source), "取消后必须清理浏览器活动任务状态");
  }
}

if (errors.length) {
  console.error("浏览器扩展检查失败：");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log("浏览器扩展 Manifest V3、安全权限和文件引用检查通过。");
}
