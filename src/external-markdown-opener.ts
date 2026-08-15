import { spawn } from "node:child_process";
import {
  chmod,
  lstat,
  mkdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";

export const MARKDOWN_OPENER_BUNDLE_ID = "app.knowgrove.markdown-opener";
export const MARKDOWN_CONTENT_TYPE = "net.daringfireball.markdown";

const APP_NAME = "KnowGrove Markdown Opener.app";
const PROCESSOR_NAME = "process-markdown.zsh";
const CONFIG_NAME = "external-markdown-opener.plist";
const SETUP_FILE_NAME = "Set KnowGrove as Markdown Default.md";
const LSREGISTER_PATH = "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";

export interface ExternalMarkdownOpenerStatus {
  supported: boolean;
  installed: boolean;
  isDefault: boolean;
  appPath: string;
  defaultAppPath: string;
  previousHandlerPath: string;
}

export interface ExternalMarkdownOpenerInstallOptions {
  vaultPath: string;
  destinationFolder: string;
}

interface OpenerPaths {
  supportRoot: string;
  appRoot: string;
  appPath: string;
  configPath: string;
}

interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function openerPaths(): OpenerPaths {
  const supportRoot = join(homedir(), "Library", "Application Support", "KnowGrove");
  const appRoot = join(homedir(), "Applications");
  return {
    supportRoot,
    appRoot,
    appPath: join(appRoot, APP_NAME),
    configPath: join(supportRoot, CONFIG_NAME),
  };
}

function isInsideDirectory(path: string, parent: string): boolean {
  const child = resolve(path);
  const root = resolve(parent);
  const pathFromRoot = relative(root, child);
  return pathFromRoot !== ""
    && pathFromRoot !== ".."
    && !pathFromRoot.startsWith(`..${sep}`)
    && !pathFromRoot.startsWith(sep);
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function normalizeExternalMarkdownFolder(value: string): string {
  const segments = value
    .replaceAll("\\", "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error("库外 Markdown 目录不能包含 . 或 ..");
  }
  return segments.join("/");
}

export function buildExternalMarkdownOpenerConfig(
  options: ExternalMarkdownOpenerInstallOptions,
  previousHandlerPath: string,
): string {
  const destinationFolder = normalizeExternalMarkdownFolder(options.destinationFolder);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>vaultPath</key>
  <string>${escapeXml(resolve(options.vaultPath))}</string>
  <key>destinationFolder</key>
  <string>${escapeXml(destinationFolder)}</string>
  <key>previousHandlerPath</key>
  <string>${escapeXml(previousHandlerPath)}</string>
</dict>
</plist>
`;
}

export function buildExternalMarkdownAppleScript(): string {
  return `on run
  display dialog "KnowGrove Markdown 打开器已安装。请双击 .md 文件使用。" buttons {"知道了"} default button "知道了"
end run

on open openedItems
  set processorPath to (POSIX path of (path to me)) & "Contents/Resources/${PROCESSOR_NAME}"
  repeat with openedItem in openedItems
    try
      do shell script (quoted form of processorPath) & " " & (quoted form of (POSIX path of openedItem))
    on error errorMessage
      display alert "无法用 Obsidian 打开 Markdown" message errorMessage as critical
    end try
  end repeat
  quit
end open
`;
}

export function buildExternalMarkdownProcessorScript(): string {
  return `#!/bin/zsh
set -eu

config_path="$HOME/Library/Application Support/KnowGrove/${CONFIG_NAME}"
plist_buddy="/usr/libexec/PlistBuddy"

if [[ ! -f "$config_path" ]]; then
  print -u2 "没有找到 KnowGrove Markdown 打开器配置，请在 Obsidian 的 KnowGrove 设置中重新安装。"
  exit 2
fi

if [[ $# -ne 1 ]]; then
  print -u2 "没有收到要打开的 Markdown 文件。"
  exit 2
fi

source_path="\${1:A}"
if [[ ! -f "$source_path" ]]; then
  print -u2 "Markdown 文件不存在或不可读取。"
  exit 3
fi

file_name="\${source_path:t}"
case "\${file_name:l}" in
  *.md|*.markdown) ;;
  *)
    print -u2 "只支持 .md 或 .markdown 文件。"
    exit 4
    ;;
esac

vault_path="$($plist_buddy -c 'Print :vaultPath' "$config_path")"
destination_folder="$($plist_buddy -c 'Print :destinationFolder' "$config_path")"
vault_path="\${vault_path:A}"

if [[ ! -d "$vault_path" ]]; then
  print -u2 "配置的 Obsidian Vault 不存在，请在 KnowGrove 设置中重新安装打开器。"
  exit 5
fi

if [[ "$source_path" == "$vault_path/"* ]]; then
  target_path="$source_path"
else
  destination_root="$vault_path"
  if [[ -n "$destination_folder" ]]; then
    destination_root="$vault_path/$destination_folder"
  fi
  /bin/mkdir -p "$destination_root"

  source_hash="$(/usr/bin/shasum -a 256 "$source_path" | /usr/bin/awk '{print $1}')"
  hash_attribute="app.knowgrove.external-markdown-source-hash"
  extension=".\${file_name##*.}"
  stem="\${file_name%.*}"
  target_path="$destination_root/$file_name"
  suffix=2
  while [[ -e "$target_path" ]]; do
    if [[ -f "$target_path" ]]; then
      imported_hash="$(/usr/bin/xattr -p "$hash_attribute" "$target_path" 2>/dev/null || true)"
      if [[ "$imported_hash" == "$source_hash" ]]; then
        break
      fi
      if /usr/bin/cmp -s "$source_path" "$target_path"; then
        /usr/bin/xattr -w "$hash_attribute" "$source_hash" "$target_path"
        break
      fi
    fi
    target_path="$destination_root/$stem $suffix$extension"
    (( suffix += 1 ))
  done

  if [[ ! -e "$target_path" ]]; then
    /bin/cp -p "$source_path" "$target_path"
    /usr/bin/xattr -w "$hash_attribute" "$source_hash" "$target_path"
  fi
fi

encoded_path="$(/usr/bin/osascript -l JavaScript -e 'function run(argv) { return encodeURIComponent(argv[0]); }' "$target_path")"
/usr/bin/open "obsidian://open?path=$encoded_path"
`;
}

async function runExecutable(
  executable: string,
  args: string[],
  timeoutMilliseconds = 10_000,
): Promise<CommandResult> {
  return await new Promise<CommandResult>((resolveCommand, reject) => {
    const child = spawn(executable, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      callback();
    };
    const timer = window.setTimeout(() => {
      child.kill("SIGTERM");
      finish(() => reject(new Error(`${executable} 运行超时`)));
    }, timeoutMilliseconds);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", (error) => finish(() => reject(error)));
    child.once("close", (code) => finish(() => resolveCommand({
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      exitCode: code ?? -1,
    })));
  });
}

async function runChecked(executable: string, args: string[]): Promise<string> {
  const result = await runExecutable(executable, args);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || `${executable} 退出码 ${result.exitCode}`);
  }
  return result.stdout;
}

const DEFAULT_APP_SCRIPT = `ObjC.import("AppKit");
function run(argv) {
  const type = $.NSClassFromString("UTType").typeWithIdentifier($(argv[0]));
  const url = $.NSWorkspace.sharedWorkspace.URLForApplicationToOpenContentType(type);
  return url ? ObjC.unwrap(url.path) : "";
}`;

const SET_DEFAULT_APP_SCRIPT = `ObjC.import("AppKit");
function run(argv) {
  const workspace = $.NSWorkspace.sharedWorkspace;
  const type = $.NSClassFromString("UTType").typeWithIdentifier($(argv[0]));
  const appURL = $.NSURL.fileURLWithPath($(argv[1]));
  workspace.setDefaultApplicationAtURLToOpenContentTypeCompletionHandler(appURL, type, null);
  delay(0.4);
  const current = workspace.URLForApplicationToOpenContentType(type);
  return current ? ObjC.unwrap(current.path) : "";
}`;

async function defaultMarkdownAppPath(): Promise<string> {
  return await runChecked("/usr/bin/osascript", [
    "-l", "JavaScript", "-e", DEFAULT_APP_SCRIPT, MARKDOWN_CONTENT_TYPE,
  ]);
}

async function setDefaultMarkdownApp(appPath: string): Promise<void> {
  const selectedPath = await runChecked("/usr/bin/osascript", [
    "-l", "JavaScript", "-e", SET_DEFAULT_APP_SCRIPT, MARKDOWN_CONTENT_TYPE, appPath,
  ]);
  if (resolve(selectedPath) !== resolve(appPath)) {
    throw new Error("macOS 未接受默认 Markdown 打开方式，请在 Finder 的“显示简介”中手动选择 KnowGrove Markdown Opener");
  }
}

async function revealMarkdownSetupFile(paths: OpenerPaths): Promise<void> {
  const setupPath = join(paths.supportRoot, SETUP_FILE_NAME);
  await writeFile(setupPath, `# Set KnowGrove as the default Markdown app

1. Press Command-I in Finder.
2. Under Open with, choose KnowGrove Markdown Opener.
3. Select Change All, then Continue.

macOS requires this one-time confirmation before an app can become the default for every Markdown file.
`, { encoding: "utf8", mode: 0o600 });
  await runChecked("/usr/bin/open", ["-R", setupPath]);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function readConfigValue(configPath: string, key: string): Promise<string> {
  if (!(await pathExists(configPath))) return "";
  const result = await runExecutable("/usr/libexec/PlistBuddy", ["-c", `Print :${key}`, configPath]);
  return result.exitCode === 0 ? result.stdout : "";
}

async function assertOwnedApp(path: string): Promise<void> {
  const entry = await lstat(path);
  if (entry.isSymbolicLink() || !entry.isDirectory()) {
    throw new Error("Markdown 打开器安装位置不是安全的应用目录");
  }
  const infoPath = join(path, "Contents", "Info.plist");
  const bundleId = await runExecutable("/usr/bin/plutil", [
    "-extract", "CFBundleIdentifier", "raw", "-o", "-", infoPath,
  ]);
  if (bundleId.exitCode !== 0 || bundleId.stdout !== MARKDOWN_OPENER_BUNDLE_ID) {
    throw new Error(`安装位置已有非 KnowGrove 管理的应用：${path}`);
  }
}

async function compileOpener(stagingPath: string): Promise<void> {
  const scriptPath = join(dirname(stagingPath), `.markdown-opener-${process.pid}-${Date.now()}.applescript`);
  try {
    await writeFile(scriptPath, buildExternalMarkdownAppleScript(), { encoding: "utf8", mode: 0o600 });
    await runChecked("/usr/bin/osacompile", ["-o", stagingPath, scriptPath]);
    const infoPath = join(stagingPath, "Contents", "Info.plist");
    await runChecked("/usr/bin/plutil", ["-replace", "CFBundleIdentifier", "-string", MARKDOWN_OPENER_BUNDLE_ID, infoPath]);
    await runChecked("/usr/bin/plutil", ["-replace", "CFBundleName", "-string", "KnowGrove Markdown Opener", infoPath]);
    await runChecked("/usr/bin/plutil", ["-replace", "CFBundleDocumentTypes", "-json", JSON.stringify([{
      CFBundleTypeExtensions: ["md", "markdown"],
      CFBundleTypeName: "Markdown",
      CFBundleTypeRole: "Editor",
      LSHandlerRank: "Owner",
      LSItemContentTypes: [MARKDOWN_CONTENT_TYPE],
    }]), infoPath]);
    const processorPath = join(stagingPath, "Contents", "Resources", PROCESSOR_NAME);
    await writeFile(processorPath, buildExternalMarkdownProcessorScript(), { encoding: "utf8", mode: 0o700 });
    await chmod(processorPath, 0o700);
  } finally {
    await rm(scriptPath, { force: true }).catch(() => undefined);
  }
}

async function replaceOwnedApp(stagingPath: string, appPath: string, supportRoot: string): Promise<void> {
  if (!isInsideDirectory(stagingPath, supportRoot) || !isInsideDirectory(appPath, supportRoot)) {
    throw new Error("Markdown 打开器安装路径超出 KnowGrove 应用目录");
  }
  if (!(await pathExists(appPath))) {
    await rename(stagingPath, appPath);
    return;
  }
  await assertOwnedApp(appPath);
  const backupPath = `${appPath}.backup-${process.pid}-${Date.now()}`;
  await rename(appPath, backupPath);
  try {
    await rename(stagingPath, appPath);
  } catch (error) {
    await rename(backupPath, appPath).catch(() => undefined);
    throw error;
  }
  if (!isInsideDirectory(backupPath, supportRoot)) {
    throw new Error("Markdown 打开器备份路径超出 KnowGrove 应用目录");
  }
  await rm(backupPath, { recursive: true, force: true });
}

export async function inspectExternalMarkdownOpener(): Promise<ExternalMarkdownOpenerStatus> {
  const paths = openerPaths();
  if (process.platform !== "darwin") {
    return {
      supported: false,
      installed: false,
      isDefault: false,
      appPath: paths.appPath,
      defaultAppPath: "",
      previousHandlerPath: "",
    };
  }
  const installed = await pathExists(paths.appPath);
  const defaultAppPath = await defaultMarkdownAppPath().catch(() => "");
  const previousHandlerPath = await readConfigValue(paths.configPath, "previousHandlerPath");
  return {
    supported: true,
    installed,
    isDefault: installed && resolve(defaultAppPath) === resolve(paths.appPath),
    appPath: paths.appPath,
    defaultAppPath,
    previousHandlerPath,
  };
}

export async function installExternalMarkdownOpener(
  options: ExternalMarkdownOpenerInstallOptions,
): Promise<ExternalMarkdownOpenerStatus> {
  if (process.platform !== "darwin") throw new Error("双击导入 Markdown 当前仅支持 macOS");
  const paths = openerPaths();
  await mkdir(paths.supportRoot, { recursive: true });
  await mkdir(paths.appRoot, { recursive: true });
  const currentDefault = await defaultMarkdownAppPath();
  const savedPrevious = await readConfigValue(paths.configPath, "previousHandlerPath");
  const previousHandlerPath = resolve(currentDefault) === resolve(paths.appPath)
    ? savedPrevious
    : currentDefault;
  await writeFile(
    paths.configPath,
    buildExternalMarkdownOpenerConfig(options, previousHandlerPath),
    { encoding: "utf8", mode: 0o600 },
  );

  const stagingPath = join(paths.appRoot, `.markdown-opener-${process.pid}-${Date.now()}.app`);
  try {
    await compileOpener(stagingPath);
    await replaceOwnedApp(stagingPath, paths.appPath, paths.appRoot);
  } finally {
    if (isInsideDirectory(stagingPath, paths.appRoot)) {
      await rm(stagingPath, { recursive: true, force: true }).catch(() => undefined);
    }
  }
  await runChecked(LSREGISTER_PATH, ["-f", paths.appPath]);
  await setDefaultMarkdownApp(paths.appPath).catch(async () => {
    await revealMarkdownSetupFile(paths);
  });
  return await inspectExternalMarkdownOpener();
}

export async function updateExternalMarkdownOpenerConfiguration(
  options: ExternalMarkdownOpenerInstallOptions,
): Promise<void> {
  if (process.platform !== "darwin") return;
  const paths = openerPaths();
  if (!(await pathExists(paths.appPath))) return;
  await assertOwnedApp(paths.appPath);
  const previousHandlerPath = await readConfigValue(paths.configPath, "previousHandlerPath");
  await writeFile(
    paths.configPath,
    buildExternalMarkdownOpenerConfig(options, previousHandlerPath),
    { encoding: "utf8", mode: 0o600 },
  );
}

export async function restorePreviousMarkdownHandler(): Promise<ExternalMarkdownOpenerStatus> {
  if (process.platform !== "darwin") throw new Error("默认 Markdown 打开方式仅能在 macOS 恢复");
  const paths = openerPaths();
  const previousHandlerPath = await readConfigValue(paths.configPath, "previousHandlerPath");
  if (!previousHandlerPath || !(await pathExists(previousHandlerPath))) {
    throw new Error("没有找到可恢复的原默认 Markdown 应用");
  }
  await setDefaultMarkdownApp(previousHandlerPath).catch(async () => {
    await revealMarkdownSetupFile(paths);
  });
  return await inspectExternalMarkdownOpener();
}
