import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

export interface AbortableJsonResponse {
  status: number;
  json: unknown;
  text: string;
}

function abortError(): Error {
  const error = new Error("任务已由用户取消");
  error.name = "AbortError";
  return error;
}

/**
 * Send a desktop-only JSON request whose underlying socket is destroyed when
 * the task is cancelled. Obsidian's requestUrl does not expose an AbortSignal,
 * so image tasks use this path to make the Cancel action truthful.
 */
export async function requestJsonWithSignal(
  urlValue: string,
  headers: Record<string, string>,
  body: string,
  timeoutSeconds: number,
  signal?: AbortSignal,
): Promise<AbortableJsonResponse> {
  if (signal?.aborted) throw abortError();
  const url = new URL(urlValue);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`不支持的 API 地址协议：${url.protocol}`);
  }
  const request = url.protocol === "https:" ? httpsRequest : httpRequest;
  const responseLimit = 8 * 1024 * 1024;

  return await new Promise<AbortableJsonResponse>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      callback();
    };
    const fail = (error: Error): void => finish(() => reject(error));
    const clientRequest = request(url, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body).toString(),
      },
    }, (response) => {
      const chunks: Buffer[] = [];
      let byteLength = 0;
      response.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        byteLength += buffer.byteLength;
        if (byteLength > responseLimit) {
          const error = new Error("AI 接口响应超过 8 MB 安全上限");
          response.destroy(error);
          clientRequest.destroy(error);
          fail(error);
          return;
        }
        chunks.push(buffer);
      });
      response.on("error", fail);
      response.on("end", () => {
        if (settled) return;
        const text = Buffer.concat(chunks).toString("utf8");
        let json: unknown;
        try {
          json = text ? JSON.parse(text) : {};
        } catch {
          fail(new Error("AI 接口返回了无法解析的 JSON"));
          return;
        }
        finish(() => resolve({ status: response.statusCode ?? 0, json, text }));
      });
    });
    const onAbort = (): void => {
      const error = abortError();
      clientRequest.destroy(error);
      fail(error);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    clientRequest.on("error", fail);
    clientRequest.setTimeout(Math.max(5, timeoutSeconds) * 1_000, () => {
      const timeout = Math.max(5, timeoutSeconds);
      const error = new Error(`AI 接口请求超过 ${timeout} 秒`);
      clientRequest.destroy(error);
      fail(error);
    });
    clientRequest.end(body);
  });
}
