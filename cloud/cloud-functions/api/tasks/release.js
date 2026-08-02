import { endpoint } from "../../../lib/handler.js";
import { releaseTask } from "../../../lib/service.js";

export const onRequest = endpoint({
  method: "POST",
  async run({ user, body }) {
    return releaseTask(user, { taskId: body.taskId });
  },
});

export default onRequest;
