import {
  bridgeRequest,
  captureBilibiliTranscript,
  capturePageContent,
  detectPageType,
  extensionApi,
  loadSettings,
  pairRequest,
  pairStatus,
  saveSettings,
} from "./common.js";

const JOB_ALARM = "knowgrove-active-job";
const PAIRING_LOCK = "knowgrove-pairing-lock";

function delay(milliseconds) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

async function runPairing() {
  const pairing = await pairRequest();
  await extensionApi.storage.local.set({
    knowGrovePairing: {
      status: "pending",
      nonce: pairing.nonce,
      startedAt: new Date().toISOString(),
    },
  });
  await extensionApi.tabs.create({ url: pairing.deepLink });
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await delay(1_000);
    const status = await pairStatus(pairing.nonce);
    if (status.status !== "approved") continue;
    const settings = await loadSettings();
    await saveSettings({ ...settings, token: status.token });
    await extensionApi.storage.local.set({
      knowGrovePairing: {
        status: "approved",
        completedAt: new Date().toISOString(),
      },
    });
    return { ok: true };
  }
  throw new Error("配对请求已过期，请重新连接");
}

async function startPairing() {
  const lockStorage = extensionApi.storage.session ?? extensionApi.storage.local;
  const stored = await lockStorage.get(PAIRING_LOCK);
  const lock = stored[PAIRING_LOCK];
  if (lock?.startedAt && Date.now() - lock.startedAt < 130_000) {
    throw new Error("配对正在进行，请在 Obsidian 中完成确认");
  }
  await lockStorage.set({ [PAIRING_LOCK]: { startedAt: Date.now() } });
  try {
    return await runPairing();
  } catch (error) {
    await extensionApi.storage.local.set({
      knowGrovePairing: {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        completedAt: new Date().toISOString(),
      },
    });
    throw error;
  } finally {
    await lockStorage.remove(PAIRING_LOCK);
  }
}

async function createMenus() {
  await extensionApi.contextMenus.removeAll();
  extensionApi.contextMenus.create({
    id: "knowgrove-save-page",
    title: "整理当前页面到 Obsidian",
    contexts: ["page"],
  });
  extensionApi.contextMenus.create({
    id: "knowgrove-save-link",
    title: "整理此链接到 Obsidian",
    contexts: ["link"],
  });
}

async function setBadge(text, color) {
  await extensionApi.action.setBadgeText({ text });
  if (color) await extensionApi.action.setBadgeBackgroundColor({ color });
}

async function clearJobAlarm() {
  if (!extensionApi.alarms) return;
  await extensionApi.alarms.clear(JOB_ALARM);
}

async function ensureJobAlarm() {
  if (!extensionApi.alarms) return;
  const stored = await extensionApi.storage.local.get("activeCaptureJob");
  const job = stored.activeCaptureJob;
  if (!job?.id || ["completed", "partial", "failed"].includes(job.status)) {
    await clearJobAlarm();
    return;
  }
  const alarm = await extensionApi.alarms.get(JOB_ALARM);
  if (!alarm) {
    await extensionApi.alarms.create(JOB_ALARM, {
      delayInMinutes: 0.5,
      periodInMinutes: 0.5,
    });
  }
}

async function renderJobBadge(job) {
  if (job.status === "completed") {
    await setBadge("✓", "#f24b3f");
    return;
  }
  if (job.status === "partial") {
    await setBadge("存", "#a46616");
    return;
  }
  if (job.status === "failed") {
    await setBadge("!", "#9b3b3b");
    return;
  }
  const progress = Math.max(0, Math.min(99, Math.round(Number(job.progress) || 0)));
  await setBadge(`${progress}%`, "#f24b3f");
}

async function pollActiveJob() {
  const stored = await extensionApi.storage.local.get("activeCaptureJob");
  const snapshot = stored.activeCaptureJob;
  if (!snapshot?.id) {
    await clearJobAlarm();
    return;
  }
  try {
    const settings = await loadSettings();
    const job = await bridgeRequest(settings, `/v1/jobs/${encodeURIComponent(snapshot.id)}`);
    await extensionApi.storage.local.set({ activeCaptureJob: job });
    await renderJobBadge(job);
    if (["completed", "partial", "failed"].includes(job.status)) {
      await clearJobAlarm();
    }
  } catch (error) {
    console.error("更新言序后台任务失败", error);
    await setBadge("!", "#9b3b3b");
  }
}

async function submitFromContextMenu(info, tab) {
  const settings = await loadSettings();
  const url = info.linkUrl || info.pageUrl || tab?.url;
  if (!url) throw new Error("没有找到可整理的网页链接");
  const pageType = detectPageType(url);
  const pageContent = info.linkUrl
    ? null
    : pageType === "article"
      ? await capturePageContent(tab?.id)
      : await captureBilibiliTranscript(tab?.id);
  await setBadge("…", "#a46616");
  const accepted = await bridgeRequest(settings, "/v1/capture", {
    method: "POST",
    body: JSON.stringify({
      url,
      title: info.linkUrl ? "" : (tab?.title || ""),
      source: "context-menu",
      content: pageContent?.content || "",
      contentTitle: pageContent?.title || "",
      author: pageContent?.author || "",
      publishedAt: pageContent?.publishedAt || "",
      sourceKind: pageContent?.sourceKind || "",
      transcript: pageContent?.transcript || "",
    }),
  });
  await extensionApi.storage.local.set({
    activeCaptureJob: {
      id: accepted.jobId,
      url,
      status: "queued",
      progress: 0,
      createdAt: new Date().toISOString(),
    },
  });
  await setBadge("0%", "#f24b3f");
  await ensureJobAlarm();
}

extensionApi.runtime.onInstalled.addListener((details) => {
  (async () => {
    try {
      await createMenus();
      await ensureJobAlarm();
      if (details.reason === "install") {
        await extensionApi.runtime.openOptionsPage();
      }
    } catch (error) {
      console.error("创建言序菜单失败", error);
    }
  })();
});

extensionApi.runtime.onStartup.addListener(() => {
  void (async () => {
    try {
      await ensureJobAlarm();
    } catch (error) {
      console.error("恢复言序后台任务失败", error);
    }
  })();
});

extensionApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "knowgrove:pair") return false;
  void (async () => {
    try {
      sendResponse(await startPairing());
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        code: error?.code || "PAIRING_FAILED",
      });
    }
  })();
  return true;
});

extensionApi.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes.activeCaptureJob?.newValue) return;
  void (async () => {
    try {
      const job = changes.activeCaptureJob.newValue;
      await renderJobBadge(job);
      await ensureJobAlarm();
    } catch (error) {
      console.error("同步言序任务进度失败", error);
    }
  })();
});

if (extensionApi.alarms) {
  extensionApi.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== JOB_ALARM) return;
    void (async () => {
      await pollActiveJob();
    })();
  });
}

extensionApi.contextMenus.onClicked.addListener((info, tab) => {
  if (!["knowgrove-save-page", "knowgrove-save-link"].includes(info.menuItemId)) return;
  (async () => {
    try {
      await submitFromContextMenu(info, tab);
    } catch (error) {
      console.error("提交言序任务失败", error);
      await setBadge("!", "#9b3b3b");
      await extensionApi.storage.local.set({
        lastCaptureError: error instanceof Error ? error.message : String(error),
      });
    }
  })();
});
