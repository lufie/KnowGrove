import { chmod, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import process from "node:process";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

const platform = argument("platform");
const output = argument("output") || "runtime-dist";
const ytDlp = process.env.KNOWGROVE_YTDLP_PATH || "";
const ffmpeg = process.env.KNOWGROVE_FFMPEG_PATH || "";
const ffprobe = process.env.KNOWGROVE_FFPROBE_PATH || "";
const whisper = process.env.KNOWGROVE_WHISPER_PATH || "";

if (!["darwin-arm64", "darwin-x64", "win32-x64"].includes(platform)) {
  throw new Error("Pass --platform darwin-arm64, darwin-x64, or win32-x64");
}
for (const [name, value] of Object.entries({ ytDlp, ffmpeg, ffprobe, whisper })) {
  if (!value) throw new Error(`Missing ${name} input path`);
  await readFile(value);
}

const windows = platform.startsWith("win32");
const targets = [
  [ytDlp, windows ? "yt-dlp.exe" : "yt-dlp"],
  [ffmpeg, windows ? "ffmpeg.exe" : "ffmpeg"],
  [ffprobe, windows ? "ffprobe.exe" : "ffprobe"],
  [whisper, windows ? "whisper-cli.exe" : "whisper-cli"],
];

for (const [source, targetName] of targets) {
  const target = join(output, platform, "bin", targetName);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
  if (!windows) await chmod(target, 0o755);
}

await writeFile(
  join(output, platform, "runtime-info.json"),
  `${JSON.stringify({
    platform,
    generatedAt: new Date().toISOString(),
    sources: targets.map(([source, target]) => ({ source: basename(source), target })),
  }, null, 2)}\n`,
  "utf8",
);
