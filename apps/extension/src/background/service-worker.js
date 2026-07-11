importScripts("torrent-magnet.js");

function log(...args) {
  console.log("[MangaTest:后台]", ...args);
}

chrome.runtime.onInstalled.addListener(async () => {
  log("后台服务已启动");
  const defaults = {
    serverUrl: "http://127.0.0.1:4317",
    importToken: "",
    devMode: true,
  };
  const current = await chrome.storage.local.get(defaults);
  await chrome.storage.local.set({ ...defaults, ...current });
  log("设置已加载", { 服务地址: current.serverUrl || defaults.serverUrl, 有令牌: Boolean(current.importToken), 开发模式: Boolean(current.devMode) });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  log("收到消息", { 类型: message?.type, 来源: sender.tab ? `标签页:${sender.tab.id}` : "扩展自身" });

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

async function handleApiCall(message) {
  const settings = await chrome.storage.local.get({
    serverUrl: "http://127.0.0.1:4317",
    importToken: "",
    devMode: true,
  });
  const url = `${settings.serverUrl}${message.endpoint}`;
  log("正在请求", { 地址: url, 方法: message.method || "GET" });

  const headers = {
    "Content-Type": "application/json",
  };

  if (!settings.devMode) {
    headers.Authorization = `Bearer ${settings.importToken}`;
  } else {
    log("开发模式，跳过令牌验证");
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
    if (!resource || resource.type !== "torrent" || typeof resource.url !== "string") {
      log("跳过非种子资源", { 资源: resource });
      continue;
    }

    log("正在转换种子", { 地址: resource.url?.slice(0, 80) });
    try {
      const magnet = await self.MangaTestTorrentMagnet.fetchTorrentAsMagnet(resource.url);
      log("种子转换成功", { 磁链: magnet?.slice(0, 80) });
      resolved.push({ type: "magnet", url: magnet, label: resource.label || "Magnet" });
    } catch (err) {
      log("种子转换失败", { 地址: resource.url?.slice(0, 80), 错误: err instanceof Error ? err.message : String(err) });
    }
  }

  return resolved;
}
