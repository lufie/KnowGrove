import assert from "node:assert/strict";
import test from "node:test";
import {
  compareRuntimeVersions,
  DEFAULT_RUNTIME_MANIFEST_URLS,
  detectRuntimePlatform,
  formatRuntimeBytes,
  platformArtifacts,
  runtimeManifestCandidates,
  selectNewestRuntimeManifest,
  shouldRestartRuntimeDownload,
  runtimeProgressRatio,
  stableRuntimeJson,
  totalArtifactBytes,
  unsignedRuntimeManifest,
  validateSkillPack,
  validateRuntimeManifest,
  type KnowGroveRuntimeManifest,
} from "../src/runtime-core";

function manifest(): KnowGroveRuntimeManifest {
  return {
    schemaVersion: 1,
    runtimeVersion: "1.0.0",
    minimumPluginVersion: "2.4.0",
    generatedAt: "2026-07-28T00:00:00.000Z",
    platforms: {
      "darwin-arm64": {
        artifacts: [
          {
            id: "yt-dlp",
            target: "bin/yt-dlp",
            sha256: "a".repeat(64),
            size: 10,
            executable: true,
            urls: ["https://cnb.cool/example/yt-dlp"],
          },
          {
            id: "whisper-model",
            target: "models/ggml-small.bin",
            sha256: "b".repeat(64),
            size: 20,
            urls: ["https://cnb.cool/example/ggml-small.bin"],
          },
        ],
      },
    },
    signature: Buffer.from("signature").toString("base64"),
  };
}

test("runtime platform detection only accepts supported desktop targets", () => {
  assert.equal(detectRuntimePlatform("darwin", "arm64"), "darwin-arm64");
  assert.equal(detectRuntimePlatform("darwin", "x64"), "darwin-x64");
  assert.equal(detectRuntimePlatform("win32", "x64"), "win32-x64");
  assert.equal(detectRuntimePlatform("linux", "x64"), undefined);
  assert.equal(detectRuntimePlatform("win32", "arm64"), undefined);
});

test("runtime manifest sources use an optional override before the signed public release", () => {
  assert.deepEqual(DEFAULT_RUNTIME_MANIFEST_URLS, [
    "https://cnb.cool/lufie-knowgrove/knowgrove-runtime/-/releases/download/runtime-v1.0.1/runtime-manifest.json",
    "https://github.com/lufie/KnowGrove-runtime/releases/latest/download/runtime-manifest.json",
  ]);
  assert.deepEqual(
    runtimeManifestCandidates("https://mirror.example/runtime-manifest.json"),
    [
      "https://mirror.example/runtime-manifest.json",
      ...DEFAULT_RUNTIME_MANIFEST_URLS,
    ],
  );
  assert.deepEqual(runtimeManifestCandidates(""), [...DEFAULT_RUNTIME_MANIFEST_URLS]);
});

test("runtime version comparison handles normalized semantic versions", () => {
  assert.equal(compareRuntimeVersions("2.5.0", "2.5.0"), 0);
  assert.equal(compareRuntimeVersions("v2.5.1", "2.5.0"), 1);
  assert.equal(compareRuntimeVersions("2.4.26", "2.5.0"), -1);
  assert.equal(compareRuntimeVersions("2.5", "2.5.0"), 0);
});

test("runtime download recovery resumes transient failures and restarts only when Range is unsupported", () => {
  assert.equal(shouldRestartRuntimeDownload("Error: aborted"), false);
  assert.equal(shouldRestartRuntimeDownload("运行包下载连接超时"), false);
  assert.equal(shouldRestartRuntimeDownload("下载源不支持断点续传，请重试"), true);
});

test("runtime source selection uses the newest signed release instead of the first reachable mirror", () => {
  const selected = selectNewestRuntimeManifest([
    { manifest: { runtimeVersion: "1.0.0" }, url: "https://cnb.example/runtime.json" },
    { manifest: { runtimeVersion: "1.0.1" }, url: "https://github.example/runtime.json" },
  ]);
  assert.equal(selected?.manifest.runtimeVersion, "1.0.1");
  assert.equal(selected?.url, "https://github.example/runtime.json");
});

test("runtime source selection keeps the domestic mirror first when versions match", () => {
  const selected = selectNewestRuntimeManifest([
    { manifest: { runtimeVersion: "1.0.1" }, url: "https://cnb.example/runtime.json" },
    { manifest: { runtimeVersion: "1.0.1" }, url: "https://github.example/runtime.json" },
  ]);
  assert.equal(selected?.url, "https://cnb.example/runtime.json");
});

test("runtime manifest validation rejects traversal and insecure mirrors", () => {
  assert.equal(validateRuntimeManifest(manifest()).runtimeVersion, "1.0.0");
  const traversal = manifest();
  traversal.platforms["darwin-arm64"]!.artifacts[0]!.target = "../yt-dlp";
  assert.throws(() => validateRuntimeManifest(traversal), /不安全/);
  const insecure = manifest();
  insecure.platforms["darwin-arm64"]!.artifacts[0]!.urls = ["http://example.com/file"];
  assert.throws(() => validateRuntimeManifest(insecure), /HTTPS/);
});

test("runtime manifest serialization is stable and excludes signature", () => {
  const value = manifest();
  const unsigned = unsignedRuntimeManifest(value);
  assert.doesNotMatch(stableRuntimeJson(unsigned), /signature/);
  assert.equal(
    stableRuntimeJson({ z: 1, a: { y: 2, x: 3 } }),
    "{\"a\":{\"x\":3,\"y\":2},\"z\":1}",
  );
});

test("runtime artifact helpers report platform size", () => {
  const artifacts = platformArtifacts(manifest(), "darwin-arm64");
  assert.equal(totalArtifactBytes(artifacts), 30);
  assert.equal(formatRuntimeBytes(1024 * 1024), "1.0 MB");
  assert.throws(() => platformArtifacts(manifest(), "win32-x64"), /不支持/);
});

test("runtime progress ratio is bounded and handles unknown totals", () => {
  assert.equal(runtimeProgressRatio(25, 100), 0.25);
  assert.equal(runtimeProgressRatio(120, 100), 1);
  assert.equal(runtimeProgressRatio(-10, 100), 0);
  assert.equal(runtimeProgressRatio(10, 0), 0);
});

test("runtime Skill Pack accepts bounded data-only prompts", () => {
  const pack = validateSkillPack({
    schemaVersion: 1,
    version: "1.0.0",
    minimumPluginVersion: "2.4.0",
    skills: Object.fromEntries(["article", "video", "audio"].map((id) => [id, {
      id: `knowgrove.${id}.v1`,
      purpose: "整理资料",
      prompt: "只使用提供的证据。",
      output: ["summary"],
    }])),
  });
  assert.equal(pack.skills.article.prompt, "只使用提供的证据。");
  const oversized = structuredClone(pack);
  oversized.skills.audio.prompt = "a".repeat(8_001);
  assert.throws(() => validateSkillPack(oversized), /安全上限/);
});
