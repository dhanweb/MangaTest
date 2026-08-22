importScripts("nhentai-download-capture.js", "torrent-magnet.js");

function log(...args) {
  console.log("[MangaTest:后台]", ...args);
}

const processingDownloadIds = new Set();
const capturedDownloadIds = new Set();
const pendingNhentaiTorrentIntents = new Map();
const nhentaiCapture = self.MangaTestNhentaiDownloadCapture;

chrome.runtime.onInstalled.addListener(async () => {
  log("后台服务已启动");
  const defaults = {
    serverUrl: "http://127.0.0.1:4427",
    importToken: "",
    autoDownloadOnGalleryOpen: false,
    autoDownloadOnTorrentPage: false,
    autoTorrentSubmitCount: 1,
    pendingAutoDownload: null,
    pendingAutoDownloadSourceId: null,
    lastPageMetadata: null,
    lastExhentaiMetadata: null,
    lastSubmitBySourceId: {},
  };
  const current = await chrome.storage.local.get(defaults);
  if (current.autoDownloadOnGalleryOpen === undefined && current.autoDownloadOnTorrentPage === true) {
    current.autoDownloadOnGalleryOpen = true;
  }
  if (current.autoDownloadOnGalleryOpen === undefined) {
    current.autoDownloadOnGalleryOpen = false;
  }
  await chrome.storage.local.set({ ...defaults, ...current });
});

chrome.downloads.onCreated.addListener((downloadItem) => {
  void captureNhentaiTorrentDownload(downloadItem);
});

chrome.downloads.onChanged.addListener((delta) => {
  if (!delta.filename && !delta.mime && !delta.finalUrl && !delta.state) return;
  void chrome.downloads.search({ id: delta.id }).then((items) => {
    if (items[0]) void captureNhentaiTorrentDownload(items[0]);
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  log("收到消息", { 类型: message?.type });

  if (message?.type === "MANGATEST_CLOSE_TAB") {
    const tabId = sender.tab?.id;
    if (typeof tabId !== "number") {
      sendResponse({ ok: false, error: "no tab" });
      return false;
    }

    const delayMs = typeof message.delayMs === "number" ? message.delayMs : 800;
    setTimeout(() => {
      chrome.tabs.remove(tabId).catch((error) => {
        log("关闭标签失败", { tabId, error: error instanceof Error ? error.message : String(error) });
      });
    }, Math.max(0, delayMs));
    sendResponse({ ok: true, tabId });
    return false;
  }

  if (message?.type === "MANGATEST_NHENTAI_TORRENT_INTENT") {
    const tabId = sender.tab?.id;
    if (!nhentaiCapture.isUsableTabId(tabId)) {
      sendResponse({ ok: false, error: "no tab" });
      return false;
    }

    pendingNhentaiTorrentIntents.set(tabId, {
      createdAt: Date.now(),
      sourceId: typeof message.sourceId === "string" ? message.sourceId : "",
      sourceUrl: typeof message.sourceUrl === "string" ? message.sourceUrl : "",
    });
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "MANGATEST_NOTIFY_SOURCE_RESULT" || message?.type === "MANGATEST_NOTIFY_GALLERY") {
    notifySourceTabs(message)
      .then((count) => sendResponse({ ok: true, notified: count }))
      .catch((error) => {
        log("通知来源页面失败", { error: error instanceof Error ? error.message : String(error) });
        sendResponse({ ok: false, error: error instanceof Error ? error.message : "notify failed" });
      });
    return true;
  }

  if (message?.type === "MANGATEST_RESOLVE_RESOURCES" || message?.type === "MANGATEST_RESOLVE_TORRENTS") {
    resolveResources(message.resources)
      .then((resources) => sendResponse({ ok: true, resources }))
      .catch((error) => {
        log("资源处理失败", { error: error instanceof Error ? error.message : String(error) });
        sendResponse({ ok: false, error: error instanceof Error ? error.message : "资源处理失败。" });
      });
    return true;
  }

  if (message?.type === "MANGATEST_PING") {
    const serverUrl = message.serverUrl || "http://127.0.0.1:4427";
    fetch(serverUrl, { method: "HEAD", signal: AbortSignal.timeout(3000) })
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message?.type === "MANGATEST_BACKEND_REQUEST" || message?.type === "MANGATEST_API_CALL") {
    handleBackendRequest(message)
      .then(sendResponse)
      .catch((error) => {
        log("后端请求失败", { error: error instanceof Error ? error.message : String(error) });
        sendResponse({ ok: false, error: error instanceof Error ? error.message : "请求失败。" });
      });
    return true;
  }

  return false;
});

async function notifySourceTabs(message) {
  const tabs = await chrome.tabs.query({});
  let count = 0;

  for (const tab of tabs) {
    if (typeof tab.id !== "number") continue;
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: "MANGATEST_SOURCE_RESULT",
        site: message.site || "",
        sourceId: message.sourceId || "",
        sourceUrl: message.sourceUrl || "",
        ok: Boolean(message.ok),
        message: message.message || "",
      });
      count += 1;
    } catch {
      // Tabs without the content script are expected and can be ignored.
    }
  }

  log("已通知来源页面", { count, site: message.site || "", sourceId: message.sourceId || "" });
  return count;
}

async function captureNhentaiTorrentDownload(downloadItem) {
  if (capturedDownloadIds.has(downloadItem.id) || processingDownloadIds.has(downloadItem.id)) return;
  processingDownloadIds.add(downloadItem.id);

  try {
    const resourceUrl = downloadItem.finalUrl || downloadItem.url;
    if (!nhentaiCapture.isTorrentDownload(downloadItem, resourceUrl) && !nhentaiCapture.isNhentaiTorrentDownloadUrl(resourceUrl)) return;

    const tabId = await resolveNhentaiCaptureTabId(downloadItem);
    if (!nhentaiCapture.isUsableTabId(tabId)) return;

    const intent = pendingNhentaiTorrentIntents.get(tabId) || null;
    const label = torrentDownloadLabel(downloadItem);
    log("识别到 NHentai Torrent 下载", {
      downloadId: downloadItem.id,
      tabId,
      地址: String(resourceUrl || "").slice(0, 120),
      文件名: label,
    });

    let response = null;
    try {
      response = await chrome.tabs.sendMessage(tabId, {
        type: "MANGATEST_NHENTAI_TORRENT_CAPTURED",
        downloadId: downloadItem.id,
        url: resourceUrl,
        label,
      });
    } catch (error) {
      log("详情页消息发送失败，改用后台提交", { error: error instanceof Error ? error.message : String(error) });
    }

    if (!response?.ok) {
      response = await submitNhentaiTorrentFromCache(resourceUrl, label, intent);
    }

    if (response?.ok) {
      capturedDownloadIds.add(downloadItem.id);
      pendingNhentaiTorrentIntents.delete(tabId);
      await chrome.downloads.cancel(downloadItem.id).catch(() => undefined);
    }
  } catch (error) {
    log("Torrent 捕获失败", { error: error instanceof Error ? error.message : String(error) });
  } finally {
    processingDownloadIds.delete(downloadItem.id);
  }
}

async function resolveNhentaiCaptureTabId(downloadItem) {
  if (nhentaiCapture.isUsableTabId(downloadItem?.tabId)) {
    return downloadItem.tabId;
  }

  for (const tabId of nhentaiCapture.activePendingTabIds(pendingNhentaiTorrentIntents)) {
    try {
      await chrome.tabs.get(tabId);
      return tabId;
    } catch {
      pendingNhentaiTorrentIntents.delete(tabId);
    }
  }

  return null;
}

async function submitNhentaiTorrentFromCache(resourceUrl, label, intent) {
  const expectedSourceId = intent?.sourceId || nhentaiSourceIdFromTorrentUrl(resourceUrl);
  if (!expectedSourceId) {
    return { ok: false, error: "无法确定 NHentai 漫画来源" };
  }

  const stored = await chrome.storage.local.get({ lastPageMetadata: null, lastExhentaiMetadata: null });
  const metadata = stored.lastPageMetadata || stored.lastExhentaiMetadata;
  if (!metadata || metadata.site !== "nhentai.net" || metadata.sourceId !== expectedSourceId) {
    return { ok: false, error: "没有匹配的 NHentai 页面元数据" };
  }

  const resources = await resolveResources([{ type: "torrent", url: resourceUrl, label }]);
  if (resources.length === 0) {
    return { ok: false, error: "Torrent 转换失败" };
  }

  return handleBackendRequest({
    method: "POST",
    endpoint: "/api/metadata/import-with-magnet",
    body: { ...metadata, resources },
  });
}

function nhentaiSourceIdFromTorrentUrl(value) {
  try {
    const url = new URL(String(value || ""));
    const galleryId = url.searchParams.get("gid");
    return /^\d+$/.test(galleryId || "") ? `nhentai.net/g/${galleryId}` : "";
  } catch {
    return "";
  }
}

function torrentDownloadLabel(downloadItem) {
  const filename = String(downloadItem?.filename || "");
  return filename.split(/[\\/]/).pop() || "NHentai Torrent";
}

async function handleBackendRequest(message) {
  const settings = await chrome.storage.local.get({ serverUrl: "http://127.0.0.1:4427", importToken: "" });
  const endpoint = typeof message.endpoint === "string" ? message.endpoint : "";
  if (!endpoint.startsWith("/api/")) {
    throw new Error("只允许访问本地 API 路径。");
  }

  const url = `${settings.serverUrl}${endpoint}`;
  const headers = { "Content-Type": "application/json" };
  if (settings.importToken) {
    headers.Authorization = `Bearer ${settings.importToken}`;
  }

  const response = await fetch(url, {
    method: message.method || "GET",
    headers,
    body: message.body ? JSON.stringify(message.body) : undefined,
  });
  const responseBody = await response.json().catch(() => null);

  if (!response.ok) {
    return { ok: false, status: response.status, error: responseBody?.error || `HTTP ${response.status}` };
  }

  return { ok: true, status: response.status, body: responseBody };
}

async function resolveResources(resources) {
  const input = Array.isArray(resources) ? resources : [];
  const resolved = [];

  for (const resource of input) {
    if (!resource || typeof resource.url !== "string") continue;

    if (resource.type !== "torrent") {
      resolved.push(resource);
      continue;
    }

    log("正在转换种子", { 地址: resource.url.slice(0, 80) });
    try {
      const magnet = await self.MangaTestTorrentMagnet.fetchTorrentAsMagnet(resource.url);
      resolved.push({ type: "magnet", url: magnet, label: resource.label || "Magnet" });
    } catch (error) {
      log("种子转换失败", { error: error instanceof Error ? error.message : String(error) });
    }
  }

  return resolved;
}
