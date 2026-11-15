import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { probeLocalTool, resolveProbedTool, TOOL_PROBE_TIMEOUT_SECONDS } from "../src/tool-probe";

const success = { exitCode: 0, stdout: "2026.08.19\n", stderr: "" };
const execute = promisify(execFile);

test("a real child taking longer than the old eight-second cutoff completes its startup probe", async () => {
  const started = Date.now();
  await probeLocalTool(async (path, args, _input, timeout, signal) => {
    const output = await execute(path, args, { timeout: timeout * 1_000, signal });
    assert.equal(output.stdout.trim(), "slow tool ready");
    return { ...output, exitCode: 0 };
  }, process.execPath, ["-e", "setTimeout(() => console.log('slow tool ready'), 8500)"]);
  assert.ok(Date.now() - started > 8_000);
});

test("packaged tool cold starts longer than eight seconds receive a bounded startup allowance", async () => {
  await probeLocalTool(async (path, args, input, timeout) => {
    assert.equal(path, "/managed runtime/yt-dlp");
    assert.deepEqual(args, ["--version"]);
    assert.equal(input, "");
    assert.equal(timeout, TOOL_PROBE_TIMEOUT_SECONDS);
    assert.ok(timeout > 15.5);
    assert.ok(timeout <= 60);
    // Regression: a real packaged binary takes 15.5s just to print its version.
    if (timeout < 15.5) throw new Error(`运行超过 ${timeout} 秒，已停止`);
    return success;
  }, "/managed runtime/yt-dlp", ["--version"]);
});

test("timeouts are reported as startup timeouts rather than invalid paths", async () => {
  await assert.rejects(resolveProbedTool(async () => {
    throw new Error("/private/user/path 运行超过 45 秒，已停止");
  }, ["/private/user/path"], "yt-dlp", ["--version"]), (error: Error) => {
    assert.match(error.message, /启动检测超过 45 秒/);
    assert.doesNotMatch(error.message, /路径不可用|private\/user/);
    return true;
  });
});

test("missing programs, denied permission and nonzero exits retain distinct diagnostics", async () => {
  for (const [code, message] of [["ENOENT", /文件不存在/], ["EACCES", /拒绝执行/], ["EPERM", /拒绝执行/]] as const) {
    await assert.rejects(probeLocalTool(async () => {
      throw Object.assign(new Error("spawn error"), { code });
    }, "tool", ["--version"]), message);
  }
  await assert.rejects(probeLocalTool(async () => ({ ...success, exitCode: 3 }), "tool", ["--version"]), /退出码 3/);
});

test("explicit paths are not substituted, while autodetection can try later candidates", async () => {
  const tried: string[] = [];
  const run = async (path: string) => {
    tried.push(path);
    if (path === "configured") throw Object.assign(new Error("missing"), { code: "ENOENT" });
    return success;
  };
  await assert.rejects(resolveProbedTool(run, ["configured"], "Whisper", ["--help"]), /文件不存在/);
  assert.deepEqual(tried, ["configured"]);
  tried.length = 0;
  assert.equal(await resolveProbedTool(run, ["configured", "configured", "system"], "yt-dlp", ["--version"]), "system");
  assert.deepEqual(tried, ["configured", "system"]);
});

test("cancellation reaches the child and stops fallback probes", async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(resolveProbedTool(async (_path, _args, _input, _timeout, signal) => {
    calls += 1;
    assert.equal(signal, controller.signal);
    controller.abort();
    throw new Error("interrupted startup");
  }, ["first", "second"], "yt-dlp", ["--version"], controller.signal), { name: "AbortError" });
  assert.equal(calls, 1);
  await assert.rejects(probeLocalTool(async () => {
    throw new Error("must not launch");
  }, "tool", ["--version"], controller.signal), { name: "AbortError" });
});

test("an AbortError is never hidden by a later successful candidate", async () => {
  await assert.rejects(resolveProbedTool(async () => {
    const error = new Error("cancelled");
    error.name = "AbortError";
    throw error;
  }, ["first", "second"], "yt-dlp", ["--version"]), { name: "AbortError" });
});
