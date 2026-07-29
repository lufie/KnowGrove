import { constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import {
  extname,
  posix,
  win32,
} from "node:path";

export interface LocalExecutableOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  homeDirectory?: string;
  loginShellPath?: string;
}

function pathValue(env: NodeJS.ProcessEnv): string {
  const key = Object.keys(env).find((name) => name.toLowerCase() === "path");
  return key ? env[key] ?? "" : "";
}

function platformPath(platform: NodeJS.Platform): typeof posix {
  return platform === "win32" ? win32 : posix;
}

function splitPath(value: string, platform: NodeJS.Platform): string[] {
  const separator = platform === "win32" ? ";" : ":";
  return value.split(separator).map((entry) => entry.trim()).filter(Boolean);
}

function expandHome(
  value: string,
  homeDirectory: string,
  platform: NodeJS.Platform,
): string {
  if (value === "~") return homeDirectory;
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return platformPath(platform).join(homeDirectory, value.slice(2));
  }
  return value;
}

function windowsExecutableNames(name: string, env: NodeJS.ProcessEnv): string[] {
  if (extname(name)) return [name];
  const extensions = (env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM")
    .split(";")
    .map((extension) => extension.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set([
    ...extensions.map((extension) => `${name}${extension}`),
    name,
  ]));
}

export function commonExecutableDirectories(options: LocalExecutableOptions = {}): string[] {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const homeDirectory = options.homeDirectory ?? homedir();
  const path = platformPath(platform);
  const configured = [
    env.PNPM_HOME,
    env.NPM_CONFIG_PREFIX
      ? platform === "win32"
        ? env.NPM_CONFIG_PREFIX
        : path.join(env.NPM_CONFIG_PREFIX, "bin")
      : undefined,
  ].filter((entry): entry is string => Boolean(entry));
  const platformDirectories = platform === "win32"
    ? [
      path.join(homeDirectory, ".local", "bin"),
      env.APPDATA ? path.join(env.APPDATA, "npm") : undefined,
      env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, "Microsoft", "WinGet", "Links") : undefined,
      path.join(homeDirectory, ".volta", "bin"),
      path.join(homeDirectory, "scoop", "shims"),
      env.ProgramFiles ? path.join(env.ProgramFiles, "nodejs") : undefined,
    ]
    : [
      path.join(homeDirectory, ".local", "bin"),
      path.join(homeDirectory, ".claude", "local"),
      path.join(homeDirectory, ".claude", "local", "bin"),
      path.join(homeDirectory, ".antigravity", "bin"),
      path.join(homeDirectory, ".npm-global", "bin"),
      path.join(homeDirectory, ".volta", "bin"),
      path.join(homeDirectory, ".bun", "bin"),
      path.join(homeDirectory, ".local", "share", "pnpm"),
      path.join(homeDirectory, "Library", "pnpm"),
      "/opt/homebrew/bin",
      "/usr/local/bin",
      "/usr/bin",
      "/bin",
    ];
  return Array.from(new Set(
    [...configured, ...platformDirectories]
      .filter((entry): entry is string => Boolean(entry))
      .map((entry) => expandHome(entry, homeDirectory, platform)),
  ));
}

export function buildExecutableSearchDirectories(options: LocalExecutableOptions = {}): string[] {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  return Array.from(new Set([
    ...splitPath(options.loginShellPath ?? "", platform),
    ...splitPath(pathValue(env), platform),
    ...commonExecutableDirectories(options),
  ]));
}

export function buildExecutableCandidates(
  executable: string,
  options: LocalExecutableOptions = {},
): string[] {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const homeDirectory = options.homeDirectory ?? homedir();
  const path = platformPath(platform);
  const expanded = expandHome(executable.trim(), homeDirectory, platform);
  if (!expanded) return [];
  const names = platform === "win32"
    ? windowsExecutableNames(expanded, env)
    : [expanded];
  const hasPath = path.isAbsolute(expanded)
    || expanded.includes("/")
    || expanded.includes("\\");
  if (hasPath) {
    return Array.from(new Set(names.map((name) => path.isAbsolute(name) ? name : path.resolve(name))));
  }
  return Array.from(new Set(
    buildExecutableSearchDirectories(options)
      .flatMap((directory) => names.map((name) => path.join(directory, name))),
  ));
}

export async function resolveLocalExecutable(
  executable: string,
  options: LocalExecutableOptions = {},
): Promise<string | undefined> {
  const platform = options.platform ?? process.platform;
  const mode = platform === "win32" ? fsConstants.F_OK : fsConstants.X_OK;
  for (const candidate of buildExecutableCandidates(executable, options)) {
    try {
      await access(candidate, mode);
      return candidate;
    } catch {
      // Continue through the deterministic search path.
    }
  }
  return undefined;
}

export function mergeExecutablePath(
  executable: string,
  loginShellPath: string,
  options: LocalExecutableOptions = {},
): string {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const path = platformPath(platform);
  const separator = platform === "win32" ? ";" : ":";
  const executableDirectory = path.dirname(executable);
  const entries = [
    executableDirectory === "." ? "" : executableDirectory,
    ...buildExecutableSearchDirectories({ ...options, loginShellPath }),
  ].filter(Boolean);
  return Array.from(new Set(entries)).join(separator);
}
