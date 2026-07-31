import {
  buildReleaseEvents,
  buildReserveEvents,
  buildSettlementEvents,
} from "./credit-state.js";
import { getPlan } from "./config.js";
import { getPool, withTransaction } from "./db.js";
import { requestError } from "./http.js";

export async function getAccountOverview(user) {
  const accountId = await ensureAccount(getPool(), user);
  const balance = await readBalance(getPool(), accountId);
  return { user, balance };
}

export async function listLedger(user, limit = 50) {
  const accountId = await ensureAccount(getPool(), user);
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const { rows } = await getPool().query(
    `select id, event_type, available_delta, reserved_delta,
            consumed_amount, order_id, task_id, metadata, created_at
       from credit_ledger
      where account_id = $1
      order by created_at desc
      limit $2`,
    [accountId, safeLimit],
  );
  return rows;
}

export async function createOrder(user, { planId, idempotencyKey }) {
  const plan = getPlan(planId);
  const orderId = crypto.randomUUID();
  await ensureAccount(getPool(), user);
  const { rows } = await getPool().query(
    `insert into billing_orders (
       id, user_id, plan_id, amount_cents, credits, status,
       provider, idempotency_key
     ) values ($1, $2, $3, $4, $5, 'pending_payment', 'simulation', $6)
     on conflict (user_id, idempotency_key)
     do update set updated_at = billing_orders.updated_at
     returning id, plan_id, amount_cents, credits, status, provider, created_at`,
    [
      orderId,
      user.id,
      plan.id,
      plan.amountCents,
      plan.credits,
      idempotencyKey,
    ],
  );
  return rows[0];
}

export async function simulateOrderCompletion(user, orderId) {
  return withTransaction(async (client) => {
    const accountId = await ensureAccount(client, user);
    const orderResult = await client.query(
      `select *
         from billing_orders
        where id = $1 and user_id = $2
        for update`,
      [orderId, user.id],
    );
    const order = orderResult.rows[0];
    if (!order) {
      throw requestError("订单不存在", "ORDER_NOT_FOUND", 404);
    }
    if (order.status === "credited") {
      return { order, balance: await readBalance(client, accountId) };
    }
    if (order.status !== "pending_payment") {
      throw requestError("订单当前状态不能模拟支付", "INVALID_ORDER_STATE");
    }

    const plan = getPlan(order.plan_id);
    await insertLedger(client, {
      accountId,
      eventType: plan.grantEvent,
      availableDelta: order.credits,
      reservedDelta: 0,
      consumedAmount: 0,
      orderId: order.id,
      idempotencyKey: `order:${order.id}:grant`,
      metadata: { provider: "simulation", planId: order.plan_id },
    });
    const transactionId = `simulation-${order.id}`;
    const { rows } = await client.query(
      `update billing_orders
          set status = 'credited',
              provider_transaction_id = $2,
              updated_at = now()
        where id = $1
      returning *`,
      [order.id, transactionId],
    );
    return { order: rows[0], balance: await readBalance(client, accountId) };
  });
}

export async function reserveTask(
  user,
  { taskId = crypto.randomUUID(), taskType, credits, idempotencyKey },
) {
  const events = buildReserveEvents({ amount: credits, taskId });
  return withTransaction(async (client) => {
    const accountId = await ensureAccount(client, user);
    await lockAccount(client, accountId);

    const existing = await client.query(
      `select * from ai_tasks where user_id = $1 and idempotency_key = $2`,
      [user.id, idempotencyKey],
    );
    if (existing.rows[0]) {
      return {
        task: existing.rows[0],
        balance: await readBalance(client, accountId),
      };
    }

    const balance = await readBalance(client, accountId);
    if (balance.available < credits) {
      throw requestError("Credit 余额不足", "INSUFFICIENT_CREDITS", 402);
    }

    await client.query(
      `insert into ai_tasks (
         id, user_id, task_type, status, reserved_credits, idempotency_key
       ) values ($1, $2, $3, 'reserved', $4, $5)`,
      [taskId, user.id, taskType, credits, idempotencyKey],
    );
    for (const event of events) {
      await insertLedger(client, {
        accountId,
        ...event,
        idempotencyKey: `task:${taskId}:reserve`,
      });
    }
    const task = await readTask(client, taskId, user.id);
    return { task, balance: await readBalance(client, accountId) };
  });
}

export async function settleTask(user, { taskId, actualCredits }) {
  return finishTask(user, taskId, "settled", (task) =>
    buildSettlementEvents({
      actual: actualCredits,
      reserved: task.reserved_credits,
      taskId,
    }),
  );
}

export async function releaseTask(user, { taskId }) {
  return finishTask(user, taskId, "released", (task) =>
    buildReleaseEvents({ reserved: task.reserved_credits, taskId }),
  );
}

async function finishTask(user, taskId, targetStatus, eventBuilder) {
  return withTransaction(async (client) => {
    const accountId = await ensureAccount(client, user);
    await lockAccount(client, accountId);
    const taskResult = await client.query(
      `select * from ai_tasks where id = $1 and user_id = $2 for update`,
      [taskId, user.id],
    );
    const task = taskResult.rows[0];
    if (!task) {
      throw requestError("任务不存在", "TASK_NOT_FOUND", 404);
    }
    if (task.status !== "reserved") {
      return { task, balance: await readBalance(client, accountId) };
    }

    const events = eventBuilder(task);
    for (const [index, event] of events.entries()) {
      await insertLedger(client, {
        accountId,
        ...event,
        idempotencyKey: `task:${taskId}:${targetStatus}:${index}`,
      });
    }
    const consumed = events.reduce(
      (sum, event) => sum + event.consumedAmount,
      0,
    );
    const { rows } = await client.query(
      `update ai_tasks
          set status = $3, consumed_credits = $4, updated_at = now()
        where id = $1 and user_id = $2
      returning *`,
      [taskId, user.id, targetStatus, consumed],
    );
    return { task: rows[0], balance: await readBalance(client, accountId) };
  });
}

async function ensureAccount(client, user) {
  await client.query(
    `insert into app_profiles (id, email)
     values ($1, $2)
     on conflict (id)
     do update set email = excluded.email, updated_at = now()`,
    [user.id, user.email],
  );
  const accountId = `credit_${user.id}`;
  await client.query(
    `insert into credit_accounts (id, user_id)
     values ($1, $2)
     on conflict (user_id) do nothing`,
    [accountId, user.id],
  );
  return accountId;
}

async function lockAccount(client, accountId) {
  await client.query(
    "select id from credit_accounts where id = $1 for update",
    [accountId],
  );
}

async function readBalance(client, accountId) {
  const { rows } = await client.query(
    `select
       coalesce(sum(available_delta), 0)::integer as available,
       coalesce(sum(reserved_delta), 0)::integer as reserved,
       coalesce(sum(consumed_amount), 0)::integer as consumed
     from credit_ledger
     where account_id = $1`,
    [accountId],
  );
  return rows[0];
}

async function readTask(client, taskId, userId) {
  const { rows } = await client.query(
    "select * from ai_tasks where id = $1 and user_id = $2",
    [taskId, userId],
  );
  return rows[0];
}

async function insertLedger(client, event) {
  const {
    accountId,
    eventType,
    availableDelta,
    reservedDelta,
    consumedAmount,
    orderId = null,
    taskId = null,
    idempotencyKey,
    metadata = {},
  } = event;
  await client.query(
    `insert into credit_ledger (
       id, account_id, event_type, available_delta, reserved_delta,
       consumed_amount, order_id, task_id, idempotency_key, metadata
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
     on conflict (account_id, idempotency_key, event_type) do nothing`,
    [
      crypto.randomUUID(),
      accountId,
      eventType,
      availableDelta,
      reservedDelta,
      consumedAmount,
      orderId,
      taskId,
      idempotencyKey,
      JSON.stringify(metadata),
    ],
  );
}
