importScripts("torrent-magnet.js");

function log(...args) {
  console.log("[MangaTest:后台]", ...args);
}

chrome.runtime.onInstalled.addListener(async () => {
  log("后台服务已启动");
  const defaults = {
    serverUrl: "http://127.0.0.1:4317",
    importToken: "",
    autoDownloadOnGalleryOpen: false,
    autoDownloadOnTorrentPage: false,
    autoTorrentSubmitCount: 1,
    pendingAutoDownloadSourceId: null,
    lastSubmitBySourceId: {},
  };
  const current = await chrome.storage.local.get(defaults);
  // Prefer new key; if only legacy true exists, keep true once for migration.
  if (current.autoDownloadOnGalleryOpen === undefined && current.autoDownloadOnTorrentPage === true) {
    current.autoDownloadOnGalleryOpen = true;
  }
  if (current.autoDownloadOnGalleryOpen === undefined) {
    current.autoDownloadOnGalleryOpen = false;
  }
  await chrome.storage.local.set({ ...defaults, ...current });
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
    log("准备关闭标签", { tabId, delayMs, url: sender.tab?.url });
    setTimeout(() => {
      chrome.tabs.remove(tabId).catch((error) => {
        log("关闭标签失败", { tabId, error: error instanceof Error ? error.message : String(error) });
      });
    }, Math.max(0, delayMs));
    sendResponse({ ok: true, tabId });
    return false;
  }

  if (message?.type === "MANGATEST_NOTIFY_GALLERY") {
    notifyGalleryTabs(message)
      .then((count) => sendResponse({ ok: true, notified: count }))
      .catch((error) => {
        log("通知详情页失败", { error: error instanceof Error ? error.message : String(error) });
        sendResponse({ ok: false, error: error instanceof Error ? error.message : "notify failed" });
      });
    return true;
  }

  if (message?.type === "MANGATEST_RESOLVE_TORRENTS") {
    log("开始转换种子为磁链", { 数量: message.resources?.length });
    resolveTorrentResources(message.resources)
      .then((resources) => {
        log("种子转换完成", { 数量: resources.length });
        sendResponse({ ok: true, resources });
      })
      .catch((error) => {
        log("种子转换失败", { 错误: error instanceof Error ? error.message : String(error) });
        sendResponse({ ok: false, error: error instanceof Error ? error.message : "种子转换失败。" });
      });
    return true;
  }

  if (message?.type === "MANGATEST_PING") {
    const serverUrl = message.serverUrl || "http://127.0.0.1:4317";
    fetch(serverUrl, { method: "HEAD", signal: AbortSignal.timeout(3000) })
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message?.type === "MANGATEST_API_CALL") {
    log("API 请求", { 方法: message.method, 接口: message.endpoint });
    handleApiCall(message)
      .then((result) => {
        log("API 请求成功", { 接口: message.endpoint, 状态码: result.status });
        sendResponse(result);
      })
      .catch((error) => {
        log("API 请求失败", { 接口: message.endpoint, 错误: error instanceof Error ? error.message : String(error) });
        sendResponse({ ok: false, error: error instanceof Error ? error.message : "请求失败。" });
      });
    return true;
  }

  return false;
});

async function notifyGalleryTabs(message) {
  const sourceId = message.sourceId || "";
  const gid = extractGid(sourceId) || extractGid(message.sourceUrl || "");
  const tabs = await chrome.tabs.query({
    url: ["https://exhentai.org/*", "https://e-hentai.org/*"],
  });
  let count = 0;
  for (const tab of tabs) {
    if (typeof tab.id !== "number" || !tab.url) continue;
    // Skip torrent listing tabs.
    if (/gallerytorrents\.php/i.test(tab.url)) continue;
    if (!/\/g\/\d+/i.test(tab.url)) continue;
    if (gid && !tab.url.includes(`/g/${gid}`)) continue;
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: "MANGATEST_DOWNLOAD_RESULT",
        sourceId: message.sourceId,
        sourceUrl: message.sourceUrl,
        ok: Boolean(message.ok),
        message: message.message || "",
      });
      count += 1;
    } catch {
      // tab may not have content script
    }
  }
  log("已通知详情页", { count, sourceId, gid });
  return count;
}

function extractGid(value) {
  const m = /\/g\/(\d+)/.exec(String(value || ""));
  return m?.[1] || null;
}

async function handleApiCall(message) {
  const settings = await chrome.storage.local.get({ serverUrl: "http://127.0.0.1:4317", importToken: "" });
  const url = `${settings.serverUrl}${message.endpoint}`;
  log("正在请求", { 地址: url, 方法: message.method || "GET" });

  const headers = { "Content-Type": "application/json" };
  if (settings.importToken) {
    headers.Authorization = `Bearer ${settings.importToken}`;
  }

  const res = await fetch(url, {
    method: message.method || "GET",
    headers,
    body: message.body ? JSON.stringify(message.body) : undefined,
  });

  const responseBody = await res.json().catch(() => null);
  log("响应结果", { 状态码: res.status, 成功: res.ok, 数据: responseBody });

  if (!res.ok) {
    return { ok: false, status: res.status, error: responseBody?.error || `HTTP ${res.status}` };
  }

  return { ok: true, status: res.status, body: responseBody };
}

async function resolveTorrentResources(resources) {
  const input = Array.isArray(resources) ? resources : [];
  const resolved = [];
  for (const resource of input) {
    if (!resource || resource.type !== "torrent" || typeof resource.url !== "string") continue;
    log("正在转换种子", { 地址: resource.url?.slice(0, 80) });
    try {
      const magnet = await self.MangaTestTorrentMagnet.fetchTorrentAsMagnet(resource.url);
      resolved.push({ type: "magnet", url: magnet, label: resource.label || "Magnet" });
    } catch (err) {
      log("种子转换失败", { 错误: err instanceof Error ? err.message : String(err) });
    }
  }
  return resolved;
}
