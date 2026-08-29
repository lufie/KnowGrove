import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { requestJsonWithSignal } from "../src/abortable-json-request";

test("cancelling an image API request destroys the in-flight connection", async () => {
  let markRequestStarted: (() => void) | undefined;
  let markSocketClosed: (() => void) | undefined;
  const requestStarted = new Promise<void>((resolve) => {
    markRequestStarted = resolve;
  });
  const socketClosed = new Promise<void>((resolve) => {
    markSocketClosed = resolve;
  });
  const server = createServer((request) => {
    request.socket.once("close", () => markSocketClosed?.());
    markRequestStarted?.();
    // Intentionally never respond: cancellation must close this connection.
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  try {
    const controller = new AbortController();
    const pending = requestJsonWithSignal(
      `http://127.0.0.1:${address.port}/v1/chat/completions`,
      {},
      JSON.stringify({ model: "vision-test" }),
      30,
      controller.signal,
    );
    await requestStarted;
    controller.abort();
    await assert.rejects(pending, (error: unknown) => error instanceof Error && error.name === "AbortError");
    await socketClosed;
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
