import { endpoint } from "../../lib/handler.js";

export const onRequest = endpoint({
  auth: false,
  method: "GET",
  async run() {
    return {
      service: "knowgrove-cloud",
      status: "ok",
      mode: process.env.APP_ENV ?? "unknown",
      time: new Date().toISOString(),
    };
  },
});

export default onRequest;
