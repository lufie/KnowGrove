import { createPrivateKey, sign } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";

const input = process.argv[2];
const output = process.argv[3];
const primaryBase = (process.env.KNOWGROVE_RELEASE_BASE_URL || "").replace(/\/+$/, "");
const fallbackBase = (process.env.KNOWGROVE_FALLBACK_BASE_URL || "").replace(/\/+$/, "");
const keyInput = process.env.KNOWGROVE_RUNTIME_SIGNING_KEY || "";

if (!input || !output) {
  throw new Error("Usage: node scripts/resign-runtime-manifest.mjs <input> <output>");
}
if (!primaryBase) throw new Error("KNOWGROVE_RELEASE_BASE_URL is required");
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

function assetName(url) {
  const segments = new URL(url).pathname.split("/").filter(Boolean);
  const name = segments.at(-1);
  if (!name) throw new Error(`Cannot derive asset name from ${url}`);
  return decodeURIComponent(name);
}

const parsed = JSON.parse(await readFile(input, "utf8"));
const { signature: _previousSignature, ...manifest } = parsed;
manifest.generatedAt = new Date().toISOString();

for (const release of Object.values(manifest.platforms ?? {})) {
  for (const artifact of release.artifacts ?? []) {
    const name = assetName(artifact.urls?.[0] || "");
    artifact.urls = [
      `${primaryBase}/${name}`,
      ...(fallbackBase ? [`${fallbackBase}/${name}`] : []),
    ];
  }
}

const key = keyInput.includes("BEGIN PRIVATE KEY")
  ? createPrivateKey(keyInput)
  : createPrivateKey(await readFile(keyInput, "utf8"));
const signature = sign(null, Buffer.from(stableJson(manifest)), key).toString("base64");
await writeFile(output, `${JSON.stringify({ ...manifest, signature }, null, 2)}\n`, "utf8");
