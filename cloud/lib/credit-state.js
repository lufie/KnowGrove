export function calculateCreditState(entries) {
  return entries.reduce(
    (state, entry) => ({
      available: state.available + entry.availableDelta,
      reserved: state.reserved + entry.reservedDelta,
      consumed: state.consumed + entry.consumedAmount,
    }),
    { available: 0, reserved: 0, consumed: 0 },
  );
}

export function buildReserveEvents({ amount, taskId }) {
  assertPositiveInteger(amount, "预留 Credit");
  return [
    {
      eventType: "reserve",
      availableDelta: -amount,
      reservedDelta: amount,
      consumedAmount: 0,
      taskId,
    },
  ];
}

export function buildSettlementEvents({ actual, reserved, taskId }) {
  assertNonNegativeInteger(actual, "实际 Credit");
  assertPositiveInteger(reserved, "已预留 Credit");
  if (actual > reserved) {
    throw creditError("实际消费不能超过预留上限", "USAGE_EXCEEDS_RESERVATION");
  }

  const events = [];
  if (actual > 0) {
    events.push({
      eventType: "consume",
      availableDelta: 0,
      reservedDelta: -actual,
      consumedAmount: actual,
      taskId,
    });
  }

  const unused = reserved - actual;
  if (unused > 0) {
    events.push({
      eventType: "release",
      availableDelta: unused,
      reservedDelta: -unused,
      consumedAmount: 0,
      taskId,
    });
  }
  return events;
}

export function buildReleaseEvents({ reserved, taskId }) {
  assertPositiveInteger(reserved, "已预留 Credit");
  return [
    {
      eventType: "release",
      availableDelta: reserved,
      reservedDelta: -reserved,
      consumedAmount: 0,
      taskId,
    },
  ];
}

function assertPositiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) {
    throw creditError(`${label}必须是正整数`, "INVALID_CREDIT_AMOUNT");
  }
}

function assertNonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw creditError(`${label}必须是非负整数`, "INVALID_CREDIT_AMOUNT");
  }
}

function creditError(message, code) {
  const error = new Error(message);
  error.code = code;
  error.status = 400;
  return error;
}
