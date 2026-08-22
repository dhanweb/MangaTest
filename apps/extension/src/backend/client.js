(() => {
  async function ping(serverUrl) {
    const response = await chrome.runtime.sendMessage({ type: "MANGATEST_PING", serverUrl });
    return response?.ok === true;
  }

  async function request({ method = "GET", endpoint, body }) {
    const response = await chrome.runtime.sendMessage({
      type: "MANGATEST_BACKEND_REQUEST",
      method,
      endpoint,
      body,
    });

    if (!response?.ok) {
      throw new Error(response?.error || "请求失败。");
    }

    return response.body?.result ?? response.body ?? null;
  }

  function getImportStatus(metadata) {
    return request({
      method: "POST",
      endpoint: "/api/metadata/status",
      body: {
        site: metadata.site,
        sourceId: metadata.sourceId,
        sourceUrl: metadata.sourceUrl,
        title: metadata.title,
        originalTitle: metadata.originalTitle,
      },
    });
  }

  function submitMetadata(metadata) {
    return request({
      method: "POST",
      endpoint: "/api/metadata/import",
      body: { ...metadata, resources: [] },
    });
  }

  function submitDownloadResource(metadata, resources) {
    return request({
      method: "POST",
      endpoint: "/api/metadata/import-with-magnet",
      body: { ...metadata, resources },
    });
  }

  async function resolveResources(resources) {
    const response = await chrome.runtime.sendMessage({
      type: "MANGATEST_RESOLVE_RESOURCES",
      resources,
    });

    if (!response?.ok) {
      throw new Error(response?.error || "资源处理失败。");
    }

    return Array.isArray(response.resources) ? response.resources : [];
  }

  function notifySourceResult(payload) {
    return chrome.runtime.sendMessage({
      type: "MANGATEST_NOTIFY_SOURCE_RESULT",
      sourceId: payload.sourceId,
      sourceUrl: payload.sourceUrl,
      site: payload.site,
      ok: payload.ok,
      message: payload.message || "",
    });
  }

  function closeCurrentTab(delayMs = 900) {
    return chrome.runtime.sendMessage({ type: "MANGATEST_CLOSE_TAB", delayMs });
  }

  window.MangaTestBackend = {
    ping,
    request,
    getImportStatus,
    submitMetadata,
    submitDownloadResource,
    resolveResources,
    notifySourceResult,
    closeCurrentTab,
  };
})();
