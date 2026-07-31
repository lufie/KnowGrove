import {
  createRemoteJWKSet,
  jwtVerify,
} from "jose";
import { requireEnvironment } from "./config.js";
import { requestError } from "./http.js";

const jwksByUrl = new Map();

export async function authenticate(request) {
  const testUser = authenticateTestUser(request);
  if (testUser) {
    return testUser;
  }

  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    throw requestError("请先登录", "UNAUTHENTICATED", 401);
  }

  const token = authorization.slice("Bearer ".length).trim();
  const jwksUrl = requireEnvironment("NEON_AUTH_JWKS_URL");
  let jwks = jwksByUrl.get(jwksUrl);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(jwksUrl));
    jwksByUrl.set(jwksUrl, jwks);
  }

  const verifyOptions = {
    issuer: requireEnvironment("NEON_AUTH_ISSUER"),
  };
  const audience = process.env.NEON_AUTH_AUDIENCE?.trim();
  if (audience) {
    verifyOptions.audience = audience;
  }

  try {
    const { payload } = await jwtVerify(token, jwks, verifyOptions);
    if (!payload.sub || typeof payload.email !== "string") {
      throw new Error("token missing subject or email");
    }
    return { id: payload.sub, email: payload.email.toLowerCase() };
  } catch {
    throw requestError("登录状态无效或已过期", "INVALID_SESSION", 401);
  }
}

function authenticateTestUser(request) {
  if (
    process.env.APP_ENV !== "development" ||
    process.env.ALLOW_TEST_AUTH !== "true"
  ) {
    return null;
  }

  const expectedKey = requireEnvironment("TEST_AUTH_KEY");
  const actualKey = request.headers.get("x-knowgrove-test-key") ?? "";
  if (!constantTimeEqual(actualKey, expectedKey)) {
    return null;
  }

  const id = request.headers.get("x-knowgrove-test-user")?.trim();
  const email = request.headers.get("x-knowgrove-test-email")?.trim().toLowerCase();
  if (!id || !email) {
    throw requestError("测试身份缺少用户或邮箱", "INVALID_TEST_IDENTITY", 401);
  }
  return { id, email };
}

function constantTimeEqual(left, right) {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}
