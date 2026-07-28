import {
  bridgeRequest,
  extensionApi,
  KNOWGROVE_SETTINGS_URL,
  loadSettings,
  requestBackgroundPairing,
  saveSettings,
} from "./common.js";

const elements = {
  connectionResult: document.querySelector("#connection-result"),
  connect: document.querySelector("#connect"),
  disconnect: document.querySelector("#disconnect"),
  openKnowGrove: document.querySelector("#open-knowgrove"),
  autoRun: document.querySelector("#auto-run"),
  routeSummary: document.querySelector("#route-summary"),
  skillList: document.querySelector("#skill-list"),
};

let settings;

function showStatus(message, type = "") {
  elements.connectionResult.textContent = message;
  elements.connectionResult.classList.toggle("success", type === "success");
  elements.connectionResult.classList.toggle("error", type === "error");
}

function renderSkills(skills) {
  elements.skillList.replaceChildren();
  for (const skill of skills) {
    const card = document.createElement("article");
    card.className = "skill-card";
    const title = document.createElement("strong");
    title.textContent = skill.label;
    const description = document.createElement("p");
    description.textContent = skill.description;
    const stages = document.createElement("div");
    stages.className = "skill-stages";
    for (const stage of skill.stages ?? []) {
      const pill = document.createElement("span");
      pill.textContent = stage;
      stages.append(pill);
    }
    card.append(title, description, stages);
    elements.skillList.append(card);
  }
}

function renderRoutes(data) {
  const nameFor = (id) => (data.providers ?? []).find((item) => item.id === id)?.label || id || "未配置";
  elements.routeSummary.textContent = `文章：${nameFor(data.routes?.article)}；视频：${nameFor(data.routes?.video)}。修改请进入 KnowGrove 设置。`;
  renderSkills(data.skills ?? []);
}

async function refreshConnection() {
  settings = await loadSettings();
  elements.autoRun.checked = settings.autoRun;
  let health;
  try {
    health = await bridgeRequest(settings, "/health");
  } catch (error) {
    showStatus(error instanceof Error ? error.message : String(error), "error");
    elements.connect.hidden = true;
    elements.disconnect.hidden = true;
    return;
  }
  if (settings.token && !health.authorized) {
    settings = { ...settings, token: "" };
    await saveSettings(settings);
    elements.connect.textContent = "重新连接 KnowGrove";
    showStatus("浏览器授权已失效，请重新连接 KnowGrove。", "error");
    elements.connect.hidden = false;
    elements.disconnect.hidden = true;
    return;
  }
  if (!settings.token) {
    showStatus("KnowGrove 已运行，等待首次连接。");
    elements.connect.textContent = "连接 KnowGrove";
    elements.connect.hidden = false;
    elements.disconnect.hidden = true;
    return;
  }
  try {
    const data = await bridgeRequest(settings, "/v1/providers");
    showStatus("已连接当前 Obsidian Vault。", "success");
    elements.connect.textContent = "重新配对";
    elements.connect.hidden = false;
    elements.disconnect.hidden = false;
    renderRoutes(data);
  } catch (error) {
    settings = { ...settings, token: "" };
    await saveSettings(settings);
    elements.connect.textContent = "重新连接 KnowGrove";
    showStatus(error instanceof Error ? error.message : String(error), "error");
    elements.connect.hidden = false;
    elements.disconnect.hidden = true;
  }
}

async function connectKnowGrove() {
  elements.connect.disabled = true;
  showStatus("请在 Obsidian 弹窗中允许连接…");
  try {
    await requestBackgroundPairing();
    settings = await loadSettings();
    await refreshConnection();
  } catch (error) {
    showStatus(error instanceof Error ? error.message : String(error), "error");
  } finally {
    elements.connect.disabled = false;
  }
}

elements.connect.addEventListener("click", connectKnowGrove);
elements.disconnect.addEventListener("click", async () => {
  try {
    await bridgeRequest(settings, "/v1/pair/revoke", { method: "POST" });
  } catch {
    // Local removal still disconnects this browser if Obsidian has already closed.
  }
  settings = { ...settings, token: "" };
  await saveSettings(settings);
  await refreshConnection();
});
elements.openKnowGrove.addEventListener("click", async () => {
  await extensionApi.tabs.create({ url: KNOWGROVE_SETTINGS_URL });
});
elements.autoRun.addEventListener("change", async () => {
  settings = { ...settings, autoRun: elements.autoRun.checked };
  await saveSettings(settings);
});

await refreshConnection();
window.addEventListener("focus", () => void refreshConnection());
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void refreshConnection();
});
