import { endpoint } from "../../../lib/handler.js";
import { requestError } from "../../../lib/http.js";
import { simulateOrderCompletion } from "../../../lib/service.js";

export const onRequest = endpoint({
  method: "POST",
  async run({ user, body }) {
    if (
      process.env.APP_ENV !== "development" ||
      process.env.ALLOW_TEST_AUTH !== "true"
    ) {
      throw requestError("模拟支付只在开发环境开放", "SIMULATION_DISABLED", 403);
    }
    if (!body.orderId) {
      throw requestError("缺少订单号", "MISSING_ORDER_ID");
    }
    return simulateOrderCompletion(user, body.orderId);
  },
});

export default onRequest;
