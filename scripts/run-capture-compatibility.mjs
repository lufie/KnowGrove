import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import process from "node:process";

const fixtures = JSON.parse(await readFile("tests/fixtures/capture-platforms.json", "utf8"));
const runtimeYtDlp = "/Users/liyijie/Library/Application Support/KnowGrove/runtime/1.0.1/bin/yt-dlp";
const ytDlp = process.env.KNOWGROVE_YTDLP || await access(runtimeYtDlp).then(() => runtimeYtDlp).catch(() => "yt-dlp");
const concurrency = Math.max(1, Math.min(6, Number(process.env.KNOWGROVE_CAPTURE_CONCURRENCY) || 3));
const timeoutMilliseconds = Math.max(10_000, Number(process.env.KNOWGROVE_CAPTURE_TIMEOUT_MS) || 60_000);

function runCommand(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = globalThis.setTimeout(() => child.kill("SIGTERM"), timeoutMilliseconds);
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", (error) => {
      globalThis.clearTimeout(timer);
      resolve({ exitCode: -1, stdout, stderr: error.message, timedOut: false });
    });
    child.on("close", (exitCode, signal) => {
      globalThis.clearTimeout(timer);
      resolve({ exitCode: exitCode ?? -1, stdout, stderr, timedOut: signal === "SIGTERM" });
    });
  });
}

async function checkArticle(fixture) {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMilliseconds);
  try {
    const response = await fetch(fixture.url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 KnowGrove compatibility preflight" },
    });
    const text = await response.text();
    return {
      status: response.ok && text.length >= 80
        ? "reachable"
        : fixture.mode === "browser-rendered" ? "needs-browser-rendered" : "failed",
      detail: `HTTP ${response.status}, ${text.length} chars`,
    };
  } catch (error) {
    return { status: "failed", detail: error instanceof Error ? error.message : String(error) };
  } finally {
    globalThis.clearTimeout(timer);
  }
}

async function checkApplePodcast(fixture) {
  const parsed = new URL(fixture.url);
  const showId = parsed.pathname.match(/\/id(\d+)/i)?.[1] ?? "";
  const episodeId = parsed.searchParams.get("i") ?? "";
  const response = await fetch(`https://itunes.apple.com/lookup?id=${showId}&entity=podcastEpisode&limit=200`);
  const payload = await response.json();
  const episode = (payload.results ?? []).find((item) => String(item.trackId ?? "") === episodeId);
  return episode?.episodeUrl
    ? { status: "media", detail: `${episode.trackName} -> ${new URL(episode.episodeUrl).hostname}` }
    : { status: "failed", detail: "Apple lookup did not return the shared episode audio" };
}

async function checkMedia(fixture) {
  const result = await runCommand(ytDlp, [
    "--no-warnings",
    "--skip-download",
    "--socket-timeout", "15",
    "--retries", "1",
    "--print", "%(extractor_key)s\t%(title)s\t%(duration)s",
    fixture.url,
  ]);
  const detail = (result.stdout.trim() || result.stderr.trim()).split("\n").slice(-2).join(" ").slice(0, 500);
  return {
    status: result.exitCode === 0
      ? "media"
      : fixture.mode === "browser-session"
        ? "needs-browser-session"
        : fixture.mode === "browser-rendered" ? "needs-browser-rendered" : "failed",
    detail: result.timedOut ? "timeout" : detail,
  };
}

async function checkFixture(fixture) {
  const startedAt = Date.now();
  let result;
  if (fixture.mode === "apple-api") result = await checkApplePodcast(fixture);
  else if (fixture.kind === "article") result = await checkArticle(fixture);
  else result = await checkMedia(fixture);
  return { ...fixture, ...result, elapsedMilliseconds: Date.now() - startedAt };
}

const queue = [...fixtures];
const results = [];
await Promise.all(Array.from({ length: concurrency }, async () => {
  while (queue.length) {
    const fixture = queue.shift();
    if (!fixture) return;
    results.push(await checkFixture(fixture));
  }
}));
results.sort((left, right) => fixtures.findIndex((item) => item.platform === left.platform)
  - fixtures.findIndex((item) => item.platform === right.platform));

process.stdout.write(`${JSON.stringify({
  checkedAt: new Date().toISOString(),
  ytDlp,
  timeoutMilliseconds,
  results,
}, null, 2)}\n`);
if (results.some((item) => item.mode === "public" && item.status === "failed")) process.exitCode = 1;
