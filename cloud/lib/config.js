export const PLANS = Object.freeze({
  trial: Object.freeze({
    id: "trial",
    amountCents: 0,
    credits: 100,
    grantEvent: "trial_grant",
  }),
  basic_30d: Object.freeze({
    id: "basic_30d",
    amountCents: 990,
    credits: 1300,
    grantEvent: "subscription_grant",
  }),
  standard_30d: Object.freeze({
    id: "standard_30d",
    amountCents: 1990,
    credits: 2800,
    grantEvent: "subscription_grant",
  }),
  topup_1000: Object.freeze({
    id: "topup_1000",
    amountCents: 990,
    credits: 1000,
    grantEvent: "purchase_grant",
  }),
});

export function getPlan(planId) {
  const plan = PLANS[planId];
  if (!plan) {
    const error = new Error("未知套餐");
    error.code = "UNKNOWN_PLAN";
    error.status = 400;
    throw error;
  }
  return plan;
}

export function requireEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    const error = new Error(`缺少环境变量：${name}`);
    error.code = "MISSING_CONFIGURATION";
    error.status = 500;
    throw error;
  }
  return value;
}
