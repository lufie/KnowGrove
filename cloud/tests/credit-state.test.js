import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReleaseEvents,
  buildReserveEvents,
  buildSettlementEvents,
  calculateCreditState,
} from "../lib/credit-state.js";

test("预留后 Credit 从可用余额进入预留余额", () => {
  const entries = [
    {
      availableDelta: 100,
      reservedDelta: 0,
      consumedAmount: 0,
    },
    ...buildReserveEvents({ amount: 40, taskId: "task-1" }),
  ];
  assert.deepEqual(calculateCreditState(entries), {
    available: 60,
    reserved: 40,
    consumed: 0,
  });
});

test("按实际用量结算并释放未使用 Credit", () => {
  const entries = [
    {
      availableDelta: 100,
      reservedDelta: 0,
      consumedAmount: 0,
    },
    ...buildReserveEvents({ amount: 40, taskId: "task-1" }),
    ...buildSettlementEvents({
      actual: 25,
      reserved: 40,
      taskId: "task-1",
    }),
  ];
  assert.deepEqual(calculateCreditState(entries), {
    available: 75,
    reserved: 0,
    consumed: 25,
  });
});

test("失败任务释放全部预留 Credit", () => {
  const entries = [
    {
      availableDelta: 100,
      reservedDelta: 0,
      consumedAmount: 0,
    },
    ...buildReserveEvents({ amount: 40, taskId: "task-1" }),
    ...buildReleaseEvents({ reserved: 40, taskId: "task-1" }),
  ];
  assert.deepEqual(calculateCreditState(entries), {
    available: 100,
    reserved: 0,
    consumed: 0,
  });
});

test("实际消费不能超过预留上限", () => {
  assert.throws(
    () =>
      buildSettlementEvents({
        actual: 41,
        reserved: 40,
        taskId: "task-1",
      }),
    { code: "USAGE_EXCEEDS_RESERVATION" },
  );
});
