const authBaseUrl =
  "https://ep-odd-surf-azhvluew.neonauth.c-3.ap-southeast-1.aws.neon.tech/knowgrove/auth";

const state = {
  mode: "signin",
  otpMode: "verify-email",
  email: "",
};

const elements = {
  loading: document.querySelector("#loading"),
  authView: document.querySelector("#auth-view"),
  otpView: document.querySelector("#otp-view"),
  dashboardView: document.querySelector("#dashboard-view"),
  authForm: document.querySelector("#auth-form"),
  authSubmit: document.querySelector("#auth-submit"),
  authMessage: document.querySelector("#auth-message"),
  otpForm: document.querySelector("#otp-form"),
  otpMessage: document.querySelector("#otp-message"),
  nameField: document.querySelector("#name-field"),
  name: document.querySelector("#name"),
  email: document.querySelector("#email"),
  password: document.querySelector("#password"),
  newPasswordField: document.querySelector("#new-password-field"),
  newPassword: document.querySelector("#new-password"),
  otp: document.querySelector("#otp"),
  formTitle: document.querySelector("#form-title"),
  formDescription: document.querySelector("#form-description"),
  otpTitle: document.querySelector("#otp-title"),
  otpDescription: document.querySelector("#otp-description"),
  userEmail: document.querySelector("#user-email"),
  creditAvailable: document.querySelector("#credit-available"),
  creditReserved: document.querySelector("#credit-reserved"),
  creditConsumed: document.querySelector("#credit-consumed"),
  developmentTools: document.querySelector("#development-tools"),
  dashboardMessage: document.querySelector("#dashboard-message"),
};

document.querySelectorAll("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => setAuthMode(button.dataset.mode));
});
document
  .querySelector("#forgot-password")
  .addEventListener("click", beginPasswordReset);
document
  .querySelector("#back-to-login")
  .addEventListener("click", () => show("auth"));
document.querySelector("#sign-out").addEventListener("click", signOut);
document
  .querySelector("#simulate-purchase")
  .addEventListener("click", simulatePurchase);
elements.authForm.addEventListener("submit", submitAuth);
elements.otpForm.addEventListener("submit", submitOtp);

await restoreSession();

async function restoreSession() {
  try {
    const session = await authRequest("/get-session");
    if (session?.user) {
      await showDashboard(session.user);
      return;
    }
  } catch {
    // A missing session is the normal signed-out state.
  }
  show("auth");
}

function setAuthMode(mode) {
  state.mode = mode;
  const isSignup = mode === "signup";
  elements.nameField.hidden = !isSignup;
  elements.name.required = isSignup;
  elements.password.autocomplete = isSignup ? "new-password" : "current-password";
  elements.formTitle.textContent = isSignup ? "创建邮箱账户" : "邮箱登录";
  elements.formDescription.textContent = isSignup
    ? "注册后需输入邮箱收到的 6 位验证码。"
    : "登录后可查看 Credit 和设备连接状态。";
  elements.authSubmit.textContent = isSignup ? "注册" : "登录";
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mode === mode);
  });
  setMessage(elements.authMessage, "");
}

async function submitAuth(event) {
  event.preventDefault();
  setBusy(elements.authSubmit, true);
  setMessage(elements.authMessage, "");
  const email = elements.email.value.trim().toLowerCase();
  const password = elements.password.value;
  state.email = email;

  try {
    if (state.mode === "signup") {
      await authRequest("/sign-up/email", {
        method: "POST",
        body: {
          email,
          password,
          name: elements.name.value.trim() || email.split("@")[0],
        },
      });
      state.otpMode = "verify-email";
      prepareOtp(
        "验证邮箱",
        `验证码已发送至 ${email}。验证后会自动登录。`,
        false,
      );
      return;
    }

    await authRequest("/sign-in/email", {
      method: "POST",
      body: { email, password },
    });
    const session = await authRequest("/get-session");
    if (!session?.user) {
      throw new Error("登录成功，但未能读取会话");
    }
    await showDashboard(session.user);
  } catch (error) {
    setMessage(
      elements.authMessage,
      state.mode === "signup"
        ? "暂时无法完成注册，请检查填写内容或稍后重试。"
        : friendlyError(error),
      "error",
    );
  } finally {
    setBusy(elements.authSubmit, false);
  }
}

async function beginPasswordReset() {
  const email = elements.email.value.trim().toLowerCase();
  if (!email) {
    setMessage(elements.authMessage, "请先填写需要找回密码的邮箱。", "error");
    elements.email.focus();
    return;
  }

  try {
    await authRequest("/email-otp/request-password-reset", {
      method: "POST",
      body: { email },
    });
    state.email = email;
    state.otpMode = "reset-password";
    prepareOtp(
      "重设密码",
      `验证码已发送至 ${email}。输入验证码和新密码完成重设。`,
      true,
    );
  } catch (error) {
    state.email = email;
    state.otpMode = "reset-password";
    prepareOtp(
      "重设密码",
      `如果该邮箱已注册，验证码会发送至 ${email}。`,
      true,
    );
  }
}

function prepareOtp(title, description, needsPassword) {
  elements.otpTitle.textContent = title;
  elements.otpDescription.textContent = description;
  elements.newPasswordField.hidden = !needsPassword;
  elements.newPassword.required = needsPassword;
  elements.otp.value = "";
  elements.newPassword.value = "";
  setMessage(elements.otpMessage, "");
  show("otp");
  elements.otp.focus();
}

async function submitOtp(event) {
  event.preventDefault();
  const submit = elements.otpForm.querySelector("button[type=submit]");
  setBusy(submit, true);
  setMessage(elements.otpMessage, "");

  try {
    const path =
      state.otpMode === "reset-password"
        ? "/email-otp/reset-password"
        : "/email-otp/verify-email";
    const body = {
      email: state.email,
      otp: elements.otp.value.trim(),
    };
    if (state.otpMode === "reset-password") {
      body.password = elements.newPassword.value;
    }
    await authRequest(path, { method: "POST", body });

    if (state.otpMode === "reset-password") {
      show("auth");
      setAuthMode("signin");
      elements.email.value = state.email;
      elements.password.value = "";
      setMessage(elements.authMessage, "密码已更新，请重新登录。", "success");
      return;
    }

    const session = await authRequest("/get-session");
    if (!session?.user) {
      show("auth");
      setAuthMode("signin");
      elements.email.value = state.email;
      setMessage(elements.authMessage, "邮箱已验证，请登录。", "success");
      return;
    }
    await showDashboard(session.user);
  } catch (error) {
    setMessage(elements.otpMessage, friendlyError(error), "error");
  } finally {
    setBusy(submit, false);
  }
}

async function showDashboard(user) {
  elements.userEmail.textContent = user.email;
  show("dashboard");
  await refreshAccount();
}

async function refreshAccount() {
  setMessage(elements.dashboardMessage, "正在同步账户…");
  try {
    const response = await apiRequest("/api/account");
    elements.creditAvailable.textContent = response.balance.available;
    elements.creditReserved.textContent = response.balance.reserved;
    elements.creditConsumed.textContent = response.balance.consumed;
    elements.developmentTools.hidden = false;
    setMessage(elements.dashboardMessage, "");
  } catch (error) {
    setMessage(elements.dashboardMessage, friendlyError(error), "error");
  }
}

async function simulatePurchase() {
  const button = document.querySelector("#simulate-purchase");
  setBusy(button, true);
  setMessage(elements.dashboardMessage, "正在模拟订单与入账…");
  try {
    const order = await apiRequest("/api/orders/create", {
      method: "POST",
      body: {
        planId: "standard_30d",
        idempotencyKey: crypto.randomUUID(),
      },
    });
    await apiRequest("/api/orders/simulate-complete", {
      method: "POST",
      body: { orderId: order.id },
    });
    await refreshAccount();
    setMessage(elements.dashboardMessage, "模拟充值完成，账本已更新。", "success");
  } catch (error) {
    setMessage(elements.dashboardMessage, friendlyError(error), "error");
  } finally {
    setBusy(button, false);
  }
}

async function signOut() {
  await authRequest("/sign-out", { method: "POST" });
  elements.password.value = "";
  setAuthMode("signin");
  show("auth");
}

async function apiRequest(path, options = {}) {
  const tokenResult = await authRequest("/token");
  const token = tokenResult?.token;
  if (!token) {
    throw new Error("登录状态已过期，请重新登录");
  }
  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error?.message || "请求失败");
  }
  return payload.data;
}

async function authRequest(path, options = {}) {
  const response = await fetch(`${authBaseUrl}${path}`, {
    method: options.method ?? "GET",
    credentials: "include",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(
      payload?.message ||
        payload?.error?.message ||
        payload?.code ||
        `认证请求失败（${response.status}）`,
    );
  }
  return payload;
}

function show(view) {
  elements.loading.hidden = true;
  elements.authView.hidden = view !== "auth";
  elements.otpView.hidden = view !== "otp";
  elements.dashboardView.hidden = view !== "dashboard";
}

function setMessage(element, message, type = "") {
  element.textContent = message;
  element.classList.toggle("is-error", type === "error");
  element.classList.toggle("is-success", type === "success");
}

function setBusy(button, busy) {
  button.disabled = busy;
  button.setAttribute("aria-busy", String(busy));
}

function friendlyError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const mappings = [
    ["Invalid email or password", "邮箱或密码不正确。"],
    ["Email not verified", "邮箱尚未验证，请先完成验证码验证。"],
    ["Invalid OTP", "验证码不正确。"],
    ["OTP expired", "验证码已过期，请重新获取。"],
  ];
  return mappings.find(([source]) => message.includes(source))?.[1] || message;
}
