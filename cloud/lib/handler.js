import { authenticate } from "./auth.js";
import { handleError, json, optionsResponse, readJson } from "./http.js";

export function endpoint({ auth = true, method, run }) {
  return async function onRequest(context) {
    const request = context.request;
    if (request.method === "OPTIONS") {
      return optionsResponse();
    }
    if (request.method !== method) {
      return json(
        { ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "请求方法无效" } },
        405,
      );
    }
    try {
      const user = auth ? await authenticate(request) : null;
      const body = method === "POST" ? await readJson(request) : null;
      const data = await run({ request, user, body, context });
      return json({ ok: true, data });
    } catch (error) {
      return handleError(error);
    }
  };
}
