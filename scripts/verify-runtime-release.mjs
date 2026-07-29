import { readFile } from "node:fs/promises";
import { verify } from "node:crypto";
import process from "node:process";

const manifestUrl = process.argv[2]
  || "https://cnb.cool/lufie-knowgrove/knowgrove-runtime/-/releases/download/runtime-v1.0.0/runtime-manifest.json";

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

async function publicKey() {
  const source = await readFile("src/runtime-core.ts", "utf8");
  const match = source.match(
    /KNOWGROVE_RUNTIME_PUBLIC_KEY = `([\s\S]+?-----END PUBLIC KEY-----)`/,
  );
  if (!match) throw new Error("Cannot locate the embedded Runtime public key");
  return match[1];
}

const response = await fetch(manifestUrl, { redirect: "follow" });
if (!response.ok) throw new Error(`Manifest HTTP ${response.status}`);
const manifest = await response.json();
const { signature, ...unsigned } = manifest;
if (
  typeof signature !== "string"
  || !verify(
    null,
    Buffer.from(stableJson(unsigned)),
    await publicKey(),
    Buffer.from(signature, "base64"),
  )
) {
  throw new Error("Runtime manifest signature verification failed");
}

const artifacts = Object.entries(manifest.platforms ?? {})
  .flatMap(([platform, release]) => release.artifacts.map((artifact) => ({
    platform,
    ...artifact,
  })));
if (!artifacts.length) throw new Error("Runtime manifest has no artifacts");

for (const artifact of artifacts) {
  let available = false;
  let lastStatus = 0;
  for (const url of artifact.urls) {
    const check = await fetch(url, { method: "HEAD", redirect: "follow" });
    lastStatus = check.status;
    if (!check.ok) continue;
    const length = Number(check.headers.get("content-length"));
    if (Number.isFinite(length) && length > 0 && length !== artifact.size) {
      throw new Error(
        `${artifact.platform}/${artifact.id} has remote size ${length}, expected ${artifact.size}`,
      );
    }
    available = true;
    break;
  }
  if (!available) {
    throw new Error(`${artifact.platform}/${artifact.id} is unavailable (HTTP ${lastStatus})`);
  }
}

process.stdout.write(`${JSON.stringify({
  manifestUrl,
  runtimeVersion: manifest.runtimeVersion,
  minimumPluginVersion: manifest.minimumPluginVersion,
  platforms: Object.keys(manifest.platforms),
  artifacts: artifacts.length,
  signature: "valid",
  remoteAssets: "reachable",
}, null, 2)}\n`);
