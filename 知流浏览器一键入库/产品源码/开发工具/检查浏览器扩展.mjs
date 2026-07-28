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
  check(!/\.then\s*\(/.test(source), `${path} 使用了 .then()，应改为 async/await`);
  check(!/bridge:init|bridge:start|本地助手/.test(source), `${path} 仍引用已删除的独立本地助手`);
}

if (errors.length) {
  console.error("浏览器扩展检查失败：");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log("浏览器扩展 Manifest V3、安全权限和文件引用检查通过。");
}
