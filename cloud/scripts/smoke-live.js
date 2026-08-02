import assert from "node:assert/strict";
import { onRequest as account } from "../cloud-functions/api/account.js";
import { onRequest as health } from "../cloud-functions/api/health.js";
import { onRequest as createOrder } from "../cloud-functions/api/orders/create.js";
import { onRequest as completeOrder } from "../cloud-functions/api/orders/simulate-complete.js";
import { getPool } from "../lib/db.js";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

process.env.APP_ENV = "development";
process.env.ALLOW_TEST_AUTH = "true";
process.env.TEST_AUTH_KEY = crypto.randomUUID();

const suffix = crypto.randomUUID();
const user = {
  id: `smoke-${suffix}`,
  email: `smoke-${suffix}@example.invalid`,
};
const headers = {
  "content-type": "application/json",
  "x-knowgrove-test-key": process.env.TEST_AUTH_KEY,
  "x-knowgrove-test-user": user.id,
  "x-knowgrove-test-email": user.email,
};

try {
  const healthResponse = await health({
    request: new Request("https://smoke.local/api/health"),
  });
  const healthPayload = await healthResponse.json();
  assert.equal(healthResponse.status, 200);
  assert.equal(healthPayload.data.status, "ok");

  const initial = await call(account, "/api/account");
  assert.deepEqual(initial.balance, {
    available: 0,
    reserved: 0,
    consumed: 0,
  });

  const order = await call(createOrder, "/api/orders/create", {
    planId: "standard_30d",
    idempotencyKey: `smoke-order-${suffix}`,
  });
  assert.equal(order.status, "pending_payment");

  const completed = await call(
    completeOrder,
    "/api/orders/simulate-complete",
    { orderId: order.id },
  );
  assert.equal(completed.order.status, "credited");
  assert.equal(completed.balance.available, 2800);

  const repeated = await call(
    completeOrder,
    "/api/orders/simulate-complete",
    { orderId: order.id },
  );
  assert.equal(repeated.balance.available, 2800);

  console.log("Live smoke test passed: health, account, order and ledger.");
} finally {
  const pool = getPool();
  await pool.query("delete from ai_tasks where user_id = $1", [user.id]);
  await pool.query("delete from billing_orders where user_id = $1", [user.id]);
  await pool.query(
    `delete from credit_ledger
      where account_id in (
        select id from credit_accounts where user_id = $1
      )`,
    [user.id],
  );
  await pool.query("delete from credit_accounts where user_id = $1", [user.id]);
  await pool.query("delete from app_profiles where id = $1", [user.id]);
  await pool.end();
}

async function call(handler, path, body) {
  const request = new Request(`https://smoke.local${path}`, {
    method: body ? "POST" : "GET",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const response = await handler({ request });
  const payload = await response.json();
  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.equal(payload.ok, true, JSON.stringify(payload));
  return payload.data;
}
