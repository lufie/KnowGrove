import { endpoint } from "../../../lib/handler.js";
import { requestError } from "../../../lib/http.js";
import { createOrder } from "../../../lib/service.js";

export const onRequest = endpoint({
  method: "POST",
  async run({ request, user, body }) {
    const idempotencyKey =
      request.headers.get("idempotency-key")?.trim() ??
      body.idempotencyKey?.trim();
    if (!idempotencyKey) {
      throw requestError("缺少幂等键", "MISSING_IDEMPOTENCY_KEY");
    }
    return createOrder(user, {
      planId: body.planId,
      idempotencyKey,
    });
  },
});

export default onRequest;
