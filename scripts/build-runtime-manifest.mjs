import { createHash, createPrivateKey, sign } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import process from "node:process";

const PLATFORMS = ["darwin-arm64", "darwin-x64", "win32-x64"];
const VERSION = process.env.KNOWGROVE_RUNTIME_VERSION || "1.0.0";
const MINIMUM_PLUGIN_VERSION = process.env.KNOWGROVE_MINIMUM_PLUGIN_VERSION || "2.4.0";
const DIST = process.env.KNOWGROVE_RUNTIME_DIST || "runtime-dist";
const RELEASE_BASE = (process.env.KNOWGROVE_RELEASE_BASE_URL || "").replace(/\/+$/, "");
const FALLBACK_BASE = (process.env.KNOWGROVE_FALLBACK_BASE_URL || "").replace(/\/+$/, "");
const OUTPUT = process.env.KNOWGROVE_RUNTIME_MANIFEST || join(DIST, "runtime-manifest.json");
const keyInput = process.env.KNOWGROVE_RUNTIME_SIGNING_KEY || "";

if (!RELEASE_BASE) throw new Error("KNOWGROVE_RELEASE_BASE_URL is required");
if (!keyInput) throw new Error("KNOWGROVE_RUNTIME_SIGNING_KEY is required");

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function hash(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function artifact(id, path, target, assetName, executable = false) {
  const info = await stat(path);
  return {
    id,
    target,
    sha256: await hash(path),
    size: info.size,
    ...(executable ? { executable: true } : {}),
    urls: [
      `${RELEASE_BASE}/${assetName}`,
      ...(FALLBACK_BASE ? [`${FALLBACK_BASE}/${assetName}`] : []),
    ],
  };
}

const shared = [
  ["whisper-model", join(DIST, "shared", "ggml-small.bin"), "models/ggml-small.bin"],
  ["skill-pack", join(DIST, "shared", "skill-pack.json"), "skill-pack.json"],
  ["notices", join(DIST, "shared", "THIRD_PARTY_NOTICES.md"), "THIRD_PARTY_NOTICES.md"],
];

const manifest = {
  schemaVersion: 1,
  runtimeVersion: VERSION,
  minimumPluginVersion: MINIMUM_PLUGIN_VERSION,
  generatedAt: new Date().toISOString(),
  platforms: {},
};

for (const platform of PLATFORMS) {
  const windows = platform.startsWith("win32");
  const executableExtension = windows ? ".exe" : "";
  const files = [
    ["yt-dlp", `yt-dlp${executableExtension}`],
    ["ffmpeg", `ffmpeg${executableExtension}`],
    ["ffprobe", `ffprobe${executableExtension}`],
    ["whisper", `whisper-cli${executableExtension}`],
  ];
  const artifacts = [];
  for (const [id, fileName] of files) {
    const assetName = `knowgrove-runtime-${VERSION}-${platform}-${fileName}`;
    artifacts.push(await artifact(
      id,
      join(DIST, platform, "bin", fileName),
      `bin/${fileName}`,
      assetName,
      true,
    ));
  }
  for (const [id, path, target] of shared) {
    const assetName = `knowgrove-runtime-${VERSION}-shared-${basename(path)}`;
    artifacts.push(await artifact(id, path, target, assetName));
  }
  manifest.platforms[platform] = { artifacts };
}

const key = keyInput.includes("BEGIN PRIVATE KEY")
  ? createPrivateKey(keyInput)
  : createPrivateKey(await readFile(keyInput, "utf8"));
const signature = sign(null, Buffer.from(stableJson(manifest)), key).toString("base64");
await writeFile(OUTPUT, `${JSON.stringify({ ...manifest, signature }, null, 2)}\n`, "utf8");
