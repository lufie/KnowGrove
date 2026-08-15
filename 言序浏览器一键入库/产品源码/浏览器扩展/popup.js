import {
  bridgeRequest,
  captureBilibiliTranscript,
  capturePageContent,
  clipText,
  detectPageType,
  extensionApi,
  isSupportedPage,
  loadSettings,
  pageTypeLabel,
  requestBackgroundPairing,
  saveSettings,
} from "./common.js";

const elements = {
  openOptions: document.querySelector("#open-options"),
  pageType: document.querySelector("#page-type"),
  bridgeState: document.querySelector("#bridge-state"),
  pageTitle: document.querySelector("#page-title"),
  skillName: document.querySelector("#skill-name"),
  pageUrl: document.querySelector("#page-url"),
  provider: document.querySelector("#provider"),
  capture: document.querySelector("#capture"),
  progressPanel: document.querySelector("#progress-panel"),
  progressTitle: document.querySelector("#progress-title"),
  progressMessage: document.querySelector("#progress-message"),
  progressTrack: document.querySelector("#progress-track"),
  progressBar: document.querySelector("#progress-bar"),
  progressValue: document.querySelector("#progress-value"),
  cancelJob: document.querySelector("#cancel-job"),
  resultPanel: document.querySelector("#result-panel"),
  resultLabel: document.querySelector("#result-label"),
  resultTitle: document.querySelector("#result-title"),
  resultPreview: document.querySelector("#result-preview"),
  resultPath: document.querySelector("#result-path"),
  openObsidian: document.querySelector("#open-obsidian"),
  copyPath: document.querySelector("#copy-path"),
  errorPanel: document.querySelector("#error-panel"),
  errorMessage: document.querySelector("#error-message"),
  connect: document.querySelector("#connect"),
  retry: document.querySelector("#retry"),
  autoRunNote: document.querySelector("#auto-run-note"),
};

let currentTab;
let currentPageType = "article";
let currentSettings;
let currentResult;
let isCapturing = false;
let currentJobId;

function delay(milliseconds) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

function setBridgeState(label, state = "") {
  elements.bridgeState.textContent = label;
  elements.bridgeState.classList.toggle("is-online", state === "online");
  elements.bridgeState.classList.toggle("is-offline", state === "offline");
}

function showOnly(panel) {
  for (const candidate of [
    elements.progressPanel,
    elements.resultPanel,
    elements.errorPanel,
  ]) {
    candidate.hidden = candidate !== panel;
  }
}

function showError(error, options = {}) {
  showOnly(elements.errorPanel);
  elements.errorMessage.textContent = error instanceof Error ? error.message : String(error);
  elements.connect.hidden = !options.connect;
  elements.retry.hidden = Boolean(options.connect);
  elements.capture.disabled = true;
  isCapturing = false;
}

function renderConnection(data) {
  const route = data.routes?.[currentPageType];
  const provider = (data.providers ?? []).find((item) => item.id === route);
  elements.provider.textContent = provider?.label || route || "未配置";
  const skill = (data.skills ?? []).find((item) =>
    (item.contentTypes ?? []).includes(currentPageType),
  );
  elements.skillName.textContent = skill
    ? `内置 Skill：${skill.label}`
    : `内置 Skill：${pageTypeLabel(currentPageType)}处理`;
  if (!provider?.available) {
    showError(new Error(provider?.detail || "当前处理引擎不可用，请在 KnowGrove 设置中重新选择"));
    return false;
  }
  elements.capture.disabled = !isSupportedPage(currentTab?.url);
  return true;
}

function renderJob(job) {
  currentJobId = job.id || currentJobId;
  const progress = Math.max(0, Math.min(100, Number(job.progress) || 0));
  elements.progressBar.style.width = `${progress}%`;
  elements.progressTrack.setAttribute("aria-valuenow", String(progress));
  elements.progressValue.textContent = `${progress}%`;
  if (job.status === "completed" && (!job.result?.storageVerified || !job.result?.relativePath)) {
    currentResult = undefined;
    showError(new Error("整理结果没有通过 Obsidian 文件回读校验，请重新处理"));
    elements.retry.hidden = false;
    elements.capture.disabled = false;
    elements.capture.textContent = "重新整理到 Obsidian";
    return;
  }
  if (job.status === "completed" || job.status === "partial") {
    currentResult = job.result;
    showOnly(elements.resultPanel);
    const partial = job.status === "partial";
    elements.resultPanel.classList.toggle("is-partial", partial);
    elements.resultLabel.textContent = partial ? "已备份，处理未完成" : "已整理并保存";
    elements.resultTitle.textContent = job.result?.title || "内容已入库";
    elements.resultPreview.textContent = partial
      ? `${job.result?.preview || "内容已保存。"} ${job.error || ""}`.trim()
      : (job.result?.preview || "已完成提取、整理和保存。");
    elements.resultPath.textContent = job.result?.relativePath || "";
    elements.capture.textContent = "再次整理";
    elements.capture.disabled = false;
    isCapturing = false;
    return;
  }
  if (job.status === "failed") {
    showError(new Error(job.error || "任务执行失败"));
    elements.retry.hidden = false;
    elements.capture.disabled = false;
    return;
  }
  showOnly(elements.progressPanel);
  elements.progressTitle.textContent = job.phaseLabel || "正在整理";
  elements.progressMessage.textContent = job.message || "KnowGrove 正在处理当前内容。";
  elements.cancelJob.disabled = job.status === "cancelling";
  elements.cancelJob.textContent = job.status === "cancelling" ? "正在取消并清理…" : "取消并清理";
}

async function pollJob(jobId) {
  while (isCapturing) {
    const job = await bridgeRequest(currentSettings, `/v1/jobs/${encodeURIComponent(jobId)}`);
    await extensionApi.storage.local.set({ activeCaptureJob: job });
    renderJob(job);
    if (["completed", "partial", "failed"].includes(job.status)) return;
    await delay(1_400);
  }
}

async function startCapture() {
  if (isCapturing || !currentTab?.url || !currentSettings?.token) return;
  isCapturing = true;
  currentResult = undefined;
  elements.capture.disabled = true;
  elements.capture.textContent = "正在整理…";
  showOnly(elements.progressPanel);
  elements.progressTitle.textContent = "正在创建任务";
  elements.progressMessage.textContent = currentPageType === "video"
    ? "KnowGrove 将读取字幕，必要时使用 Whisper。"
    : currentPageType === "audio"
      ? "KnowGrove 将优先读取字幕，必要时下载并转录。"
    : "KnowGrove 将提取正文并先备份到 Vault。";
  try {
    const renderedPage = await capturePageContent(currentTab.id);
    const detectedType = renderedPage?.detectedType || currentPageType;
    if (detectedType !== currentPageType) {
      currentPageType = detectedType;
      elements.pageType.textContent = pageTypeLabel(currentPageType);
    }
    const mediaTranscript = currentPageType === "video"
      ? await captureBilibiliTranscript(currentTab.id)
      : null;
    const accepted = await bridgeRequest(currentSettings, "/v1/capture", {
      method: "POST",
      body: JSON.stringify({
        url: currentTab.url,
        title: currentTab.title || "",
        source: "popup",
        pageTypeHint: currentPageType,
        content: currentPageType === "article" ? renderedPage?.content || "" : "",
        contentTitle: mediaTranscript?.title || renderedPage?.title || "",
        author: renderedPage?.author || "",
        publishedAt: renderedPage?.publishedAt || "",
        sourceKind: renderedPage?.sourceKind || "",
        transcript: mediaTranscript?.transcript || "",
      }),
    });
    const snapshot = {
      id: accepted.jobId,
      url: currentTab.url,
      status: "queued",
      progress: 0,
      createdAt: new Date().toISOString(),
    };
    currentJobId = accepted.jobId;
    await extensionApi.storage.local.set({ activeCaptureJob: snapshot });
    await pollJob(accepted.jobId);
  } catch (error) {
    showError(error, { connect: error?.code === "PAIRING_REQUIRED" });
  } finally {
    if (!isCapturing) {
      elements.capture.textContent = currentResult ? "再次整理" : "一键整理到 Obsidian";
    }
  }
}

async function resumeRecentJob() {
  const { activeCaptureJob: job } = await extensionApi.storage.local.get("activeCaptureJob");
  if (!job?.id || job.url !== currentTab.url) return false;
  try {
    const current = await bridgeRequest(currentSettings, `/v1/jobs/${encodeURIComponent(job.id)}`);
    currentJobId = current.id;
    renderJob(current);
    if (current.status === "queued" || current.status === "running") {
      isCapturing = true;
      elements.capture.disabled = true;
      await pollJob(current.id);
    }
    return true;
  } catch {
    return false;
  }
}

async function cancelCurrentJob() {
  if (!currentJobId || elements.cancelJob.disabled) return;
  const confirmed = globalThis.confirm("取消当前整理？本次任务新建的笔记和附件会移入 Obsidian 回收站，之后可以重新处理。");
  if (!confirmed) return;
  const jobId = currentJobId;
  isCapturing = false;
  elements.cancelJob.disabled = true;
  elements.cancelJob.textContent = "正在取消并清理…";
  elements.progressTitle.textContent = "正在取消并清理";
  elements.progressMessage.textContent = "正在停止模型任务并移除本次创建的内容。";
  try {
    await bridgeRequest(currentSettings, `/v1/jobs/${encodeURIComponent(jobId)}/cancel`, {
      method: "POST",
    });
    await extensionApi.storage.local.remove("activeCaptureJob");
    await extensionApi.action.setBadgeText({ text: "" });
    currentJobId = undefined;
    currentResult = undefined;
    showOnly(null);
    elements.capture.disabled = false;
    elements.capture.textContent = "重新整理到 Obsidian";
  } catch (error) {
    showError(error);
    elements.retry.hidden = false;
  } finally {
    elements.cancelJob.disabled = false;
    elements.cancelJob.textContent = "取消并清理";
  }
}

async function connectKnowGrove() {
  elements.connect.disabled = true;
  elements.connect.textContent = "等待 Obsidian 确认…";
  try {
    await requestBackgroundPairing();
    currentSettings = await loadSettings();
    elements.connect.textContent = "已连接";
    await initialize();
  } catch (error) {
    showError(error, { connect: true });
  } finally {
    elements.connect.disabled = false;
    elements.connect.textContent = "连接 KnowGrove";
  }
}

async function initialize() {
  isCapturing = false;
  currentJobId = undefined;
  currentResult = undefined;
  currentSettings = await loadSettings();
  elements.autoRunNote.textContent = currentSettings.autoRun ? "打开即执行" : "手动执行";
  const tabs = await extensionApi.tabs.query({ active: true, currentWindow: true });
  currentTab = tabs[0];
  if (!currentTab || !isSupportedPage(currentTab.url)) {
    elements.pageTitle.textContent = "当前页面不支持整理";
    elements.pageUrl.textContent = currentTab?.url || "";
    elements.pageType.textContent = "不可用";
    setBridgeState("仅支持网页", "offline");
    elements.capture.disabled = true;
    return;
  }

  currentPageType = detectPageType(currentTab.url);
  elements.pageType.textContent = pageTypeLabel(currentPageType);
  elements.pageTitle.textContent = clipText(currentTab.title || "未命名页面", 82);
  elements.pageUrl.textContent = currentTab.url;

  let health;
  try {
    health = await bridgeRequest(currentSettings, "/health");
  } catch (error) {
    setBridgeState("Obsidian 未连接", "offline");
    showError(error, { connect: false });
    elements.retry.hidden = false;
    return;
  }
  if (currentSettings.token && !health.authorized) {
    currentSettings = { ...currentSettings, token: "" };
    await saveSettings(currentSettings);
    setBridgeState("需要重新配对", "offline");
    elements.provider.textContent = "授权已失效";
    elements.connect.textContent = "重新连接 KnowGrove";
    showError(new Error("浏览器授权已失效，请重新连接 KnowGrove。"), { connect: true });
    return;
  }
  if (!currentSettings.token) {
    setBridgeState("等待配对", "offline");
    elements.provider.textContent = "尚未连接";
    showError(new Error("请连接已打开的 Obsidian。KnowGrove 会弹出一次确认。"), { connect: true });
    return;
  }
  try {
    const data = await bridgeRequest(currentSettings, "/v1/providers");
    setBridgeState("KnowGrove 已连接", "online");
    if (!renderConnection(data)) return;
    const resumed = await resumeRecentJob();
    if (!resumed && currentSettings.autoRun && !elements.capture.disabled) await startCapture();
  } catch (error) {
    const needsPairing = error?.code === "PAIRING_REQUIRED";
    if (needsPairing) {
      currentSettings = { ...currentSettings, token: "" };
      await saveSettings(currentSettings);
      elements.connect.textContent = "重新连接 KnowGrove";
    }
    setBridgeState(needsPairing ? "需要重新配对" : "连接异常", "offline");
    showError(error, { connect: needsPairing });
  }
}

elements.openOptions.addEventListener("click", async () => {
  await extensionApi.runtime.openOptionsPage();
});
elements.capture.addEventListener("click", startCapture);
elements.cancelJob.addEventListener("click", cancelCurrentJob);
elements.retry.addEventListener("click", initialize);
elements.connect.addEventListener("click", connectKnowGrove);
elements.openObsidian.addEventListener("click", async () => {
  if (!currentJobId) return;
  elements.openObsidian.disabled = true;
  try {
    await bridgeRequest(currentSettings, `/v1/jobs/${encodeURIComponent(currentJobId)}/open`, {
      method: "POST",
    });
  } catch (error) {
    currentResult = undefined;
    showError(error);
    elements.retry.hidden = false;
    elements.capture.disabled = false;
    elements.capture.textContent = "重新整理到 Obsidian";
  } finally {
    elements.openObsidian.disabled = false;
  }
});
elements.copyPath.addEventListener("click", async () => {
  if (!currentResult?.relativePath) return;
  await navigator.clipboard.writeText(currentResult.relativePath);
  elements.copyPath.textContent = "已复制";
});

await initialize();
