export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...corsHeaders(),
    },
  });
}

export function optionsResponse() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

export async function readJson(request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw requestError("请求必须使用 application/json", "INVALID_CONTENT_TYPE");
  }
  try {
    return await request.json();
  } catch {
    throw requestError("JSON 请求体无效", "INVALID_JSON");
  }
}

export function handleError(error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const code = typeof error?.code === "string" ? error.code : "INTERNAL_ERROR";
  if (status >= 500) {
    console.error("[knowgrove-cloud]", {
      code,
      name: typeof error?.name === "string" ? error.name : "Error",
      message:
        typeof error?.message === "string"
          ? error.message.slice(0, 500)
          : "Unknown server error",
    });
  }
  const message = status >= 500 ? "服务暂时不可用" : error.message;
  return json({ ok: false, error: { code, message } }, status);
}

export function requestError(message, code = "BAD_REQUEST", status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function corsHeaders() {
  const configured = process.env.CORS_ORIGIN?.trim();
  return {
    "access-control-allow-origin": configured || "*",
    "access-control-allow-headers":
      "authorization, content-type, idempotency-key, x-knowgrove-test-user, x-knowgrove-test-email, x-knowgrove-test-key",
    "access-control-allow-methods": "GET, POST, OPTIONS",
  };
}
