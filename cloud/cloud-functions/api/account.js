import { endpoint } from "../../lib/handler.js";
import { getAccountOverview } from "../../lib/service.js";

export const onRequest = endpoint({
  method: "GET",
  async run({ user }) {
    return getAccountOverview(user);
  },
});

export default onRequest;
