import { endpoint } from "../../../lib/handler.js";
import { settleTask } from "../../../lib/service.js";

export const onRequest = endpoint({
  method: "POST",
  async run({ user, body }) {
    return settleTask(user, {
      taskId: body.taskId,
      actualCredits: body.actualCredits,
    });
  },
});

export default onRequest;
