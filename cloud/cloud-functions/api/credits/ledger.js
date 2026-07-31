import { endpoint } from "../../../lib/handler.js";
import { listLedger } from "../../../lib/service.js";

export const onRequest = endpoint({
  method: "GET",
  async run({ request, user }) {
    const limit = new URL(request.url).searchParams.get("limit");
    return listLedger(user, limit);
  },
});

export default onRequest;
