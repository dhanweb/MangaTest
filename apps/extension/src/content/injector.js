(async () => {
  const COLLECTOR = window.MangaTestCollector;
  const BACKEND = window.MangaTestBackend;
  const METADATA_FEATURE = window.MangaTestMetadataFeature;
  const DOWNLOAD_FEATURE = window.MangaTestDownloadResourceFeature;
  const currentPage = COLLECTOR?.getCurrentPage?.();

  if (!COLLECTOR || !BACKEND || !currentPage) {
    console.log("[MangaTest] 当前页面没有可用的运行时或站点适配器，跳过");
    return;
  }

  const page = currentPage.page;
  const adapter = currentPage.adapter;
  const isDetailPage = page.type === "detail";
  const isResourcePage = page.type === "resource";

  let settings = await chrome.storage.local.get({
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
  });

  if (settings.autoDownloadOnGalleryOpen === undefined && settings.autoDownloadOnTorrentPage === true) {
    settings.autoDownloadOnGalleryOpen = true;
  }
  settings.autoDownloadOnGalleryOpen = settings.autoDownloadOnGalleryOpen === true;
  settings.autoTorrentSubmitCount = normalizeAutoTorrentSubmitCount(settings.autoTorrentSubmitCount);

  console.log("[MangaTest] 站点页面已匹配", {
    adapter: adapter.id,
    page: page.id,
    服务地址: settings.serverUrl,
    有令牌: Boolean(settings.importToken),
  });

  const connected = await BACKEND.ping(settings.serverUrl);
  if (!connected) {
    console.log("[MangaTest] 无法连接 MangaTest 服务", { 地址: settings.serverUrl });
    injectDisconnectedHint(settings.serverUrl);
    return;
  }

  /** @type {HTMLElement | null} */
  let panelRoot = null;
  /** @type {{ imported?: boolean, localReadable?: boolean, displayTitle?: string | null, hasLocalFile?: boolean, comicStatus?: string | null } | null} */
  let libraryStatus = null;
  let libraryStatusLoaded = false;
  let panelBusy = false;
  const handledCapturedDownloads = new Set();

  if (isDetailPage) {
    void cachePageMetadata();
    chrome.storage.onChanged.addListener(handleStorageChange);

    if (page.capabilities?.includes("resource-navigation") || page.capabilities?.includes("download-resource")) {
      injectGalleryPanel();
      void initDetailPage();
    } else {
      injectSimpleMetadataButton();
    }
  } else if (isResourcePage && page.capabilities?.includes("download-resource")) {
    void injectResourceButtons();
  }

  function normalizeAutoTorrentSubmitCount(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 1;
    return Math.max(1, Math.min(10, Math.trunc(number)));
  }

  function handleStorageChange(changes, area) {
    if (area !== "local") return;

    if (changes.autoDownloadOnGalleryOpen) {
      settings.autoDownloadOnGalleryOpen = changes.autoDownloadOnGalleryOpen.newValue === true;
      updatePanelStatusUi();
    }

    if (changes.autoTorrentSubmitCount) {
      settings.autoTorrentSubmitCount = normalizeAutoTorrentSubmitCount(changes.autoTorrentSubmitCount.newValue);
    }
  }

  async function initDetailPage() {
    await refreshLibraryStatus();
    updatePanelStatusUi();

    if (settings.autoDownloadOnGalleryOpen && !isLocallyDownloaded(libraryStatus)) {
      void startDownloadFlow({ fromAuto: true });
    }
  }

  async function cachePageMetadata() {
    try {
      const metadata = collectNormalizedMetadata();
      if (!metadata?.sourceId) return metadata;

      await chrome.storage.local.set({
        lastPageMetadata: metadata,
        // Keep the old key readable so an already-open resource tab can finish its flow after reload.
        lastExhentaiMetadata: metadata,
      });
      return metadata;
    } catch (error) {
      console.warn("[MangaTest] 缓存页面元数据失败", error);
      return null;
    }
  }

  async function readCachedPageMetadata() {
    const stored = await chrome.storage.local.get({ lastPageMetadata: null, lastExhentaiMetadata: null });
    return stored.lastPageMetadata || stored.lastExhentaiMetadata || null;
  }

  function sameSource(first, second) {
    return COLLECTOR.sameSource(first, second);
  }

  function mergePageMetadata(pageMetadata, cached) {
    if (!cached || !sameSource(pageMetadata, cached)) return pageMetadata;

    const pageTags = Array.isArray(pageMetadata.tags) ? pageMetadata.tags : [];
    const cachedTags = Array.isArray(cached.tags) ? cached.tags : [];
    return {
      ...cached,
      ...pageMetadata,
      title: pageMetadata.title || cached.title,
      originalTitle: pageMetadata.originalTitle || cached.originalTitle || null,
      coverUrl: pageMetadata.coverUrl || cached.coverUrl || null,
      tags: pageTags.length > 0 ? pageTags : cachedTags,
      sourceId: pageMetadata.sourceId || cached.sourceId,
      sourceUrl: pageMetadata.sourceUrl || cached.sourceUrl,
      site: pageMetadata.site || cached.site,
      adapterId: pageMetadata.adapterId,
    };
  }

  function isLocallyDownloaded(status) {
    return Boolean(status?.localReadable);
  }

  function collectNormalizedMetadata() {
    const raw = COLLECTOR.collectPageMetadata();
    const metadata = COLLECTOR.normalizeMetadata(raw);
    if (!metadata) throw new Error("采集失败");
    return metadata;
  }

  async function refreshLibraryStatus() {
    try {
      libraryStatus = await BACKEND.getImportStatus(collectNormalizedMetadata());
    } catch (error) {
      console.warn("[MangaTest] 状态查询失败", error);
      libraryStatus = null;
    } finally {
      libraryStatusLoaded = true;
    }
  }

  function injectDisconnectedHint(serverUrl) {
    const hint = document.createElement("div");
    hint.id = "mangatest-hint";
    Object.assign(hint.style, {
      position: "fixed",
      bottom: "24px",
      right: "24px",
      zIndex: 999999,
      padding: "8px 14px",
      borderRadius: "10px",
      background: "#f59f00",
      color: "#fff",
      fontSize: "13px",
      fontWeight: "700",
      fontFamily: "system-ui, sans-serif",
      boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
    });
    hint.textContent = `⚠️ MangaTest 无法连接 (${serverUrl})`;
    document.body.appendChild(hint);
  }

  function injectGalleryPanel() {
    if (document.getElementById("mangatest-panel-root")) return;

    const badge = document.createElement("div");
    badge.id = "mangatest-status-badge";
    Object.assign(badge.style, {
      position: "fixed",
      top: "16px",
      right: "16px",
      zIndex: 999999,
      maxWidth: "min(420px, calc(100vw - 32px))",
      padding: "10px 14px",
      borderRadius: "10px",
      background: "rgba(255, 248, 251, 0.96)",
      border: "1px solid #f7c9dc",
      boxShadow: "0 6px 20px rgba(36, 20, 31, 0.12)",
      fontFamily: "system-ui, sans-serif",
      fontSize: "12px",
      lineHeight: "1.45",
      color: "#7c5166",
      pointerEvents: "none",
    });
    badge.innerHTML = `
      <div id="mangatest-status-main" style="font-weight:800;font-size:13px;color:#24141f;">检查状态…</div>
    `;
    document.body.appendChild(badge);

    const root = document.createElement("div");
    root.id = "mangatest-panel-root";
    Object.assign(root.style, {
      position: "fixed",
      bottom: "24px",
      right: "24px",
      zIndex: 999999,
      fontFamily: "system-ui, sans-serif",
      width: "280px",
    });
    root.innerHTML = `
      <div id="mangatest-panel" style="display:block;margin-bottom:10px;background:#fff8fb;border:1px solid #f7c9dc;border-radius:12px;box-shadow:0 8px 24px rgba(239,59,145,0.2);overflow:hidden;">
        <div style="padding:12px 14px;border-bottom:1px solid #fde0eb;"><div style="font-weight:800;font-size:14px;color:#24141f;">操作</div></div>
        <div style="padding:10px 14px;display:grid;gap:8px;">
          <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:#5e4051;font-weight:600;cursor:pointer;">
            <input id="mangatest-auto-download" type="checkbox" style="width:15px;height:15px;" />
            <span>打开详情页时自动下载</span>
          </label>
          <button id="mangatest-btn-metadata" type="button" style="min-height:34px;border:none;border-radius:8px;background:#ef3b91;color:#fff;font-weight:700;font-size:13px;cursor:pointer;">提交到 MangaTest</button>
          <button id="mangatest-btn-download" type="button" style="min-height:34px;border:1px solid #ef3b91;border-radius:8px;background:#fff;color:#ef3b91;font-weight:700;font-size:13px;cursor:pointer;">开启下载</button>
        </div>
      </div>
      <button id="mangatest-fab" type="button" style="margin-left:auto;display:block;min-height:42px;padding:0 16px;border:none;border-radius:10px;background:#ef3b91;color:#fff;font-weight:800;font-size:14px;cursor:pointer;box-shadow:0 4px 16px rgba(239,59,145,0.35);">📥 MangaTest</button>
    `;
    document.body.appendChild(root);
    panelRoot = root;

    const panel = root.querySelector("#mangatest-panel");
    const fab = root.querySelector("#mangatest-fab");
    const autoCheckbox = root.querySelector("#mangatest-auto-download");
    const metadataButton = root.querySelector("#mangatest-btn-metadata");
    const downloadButton = root.querySelector("#mangatest-btn-download");

    if (autoCheckbox instanceof HTMLInputElement) {
      autoCheckbox.checked = settings.autoDownloadOnGalleryOpen === true;
      autoCheckbox.addEventListener("change", async () => {
        settings.autoDownloadOnGalleryOpen = autoCheckbox.checked;
        await chrome.storage.local.set({
          autoDownloadOnGalleryOpen: autoCheckbox.checked,
          autoDownloadOnTorrentPage: autoCheckbox.checked,
        });
        showToast(autoCheckbox.checked ? "✅ 已开启：打开详情页自动下载" : "✅ 已关闭自动下载", "success");
        updatePanelStatusUi();
      });
    }

    fab?.addEventListener("click", () => {
      if (!(panel instanceof HTMLElement)) return;
      panel.style.display = panel.style.display === "none" ? "block" : "none";
    });
    metadataButton?.addEventListener("click", () => void submitMetadataOnly());
    downloadButton?.addEventListener("click", () => void startDownloadFlow({ fromAuto: false }));
  }

  function updatePanelStatusUi() {
    const mainElement = document.querySelector("#mangatest-status-main");
    const badge = document.querySelector("#mangatest-status-badge");
    if (!(mainElement instanceof HTMLElement)) return;

    let main = libraryStatusLoaded ? (libraryStatus ? "未入库" : "状态未知") : "检查状态…";
    let border = "#f7c9dc";
    let color = "#7c5166";

    if (!libraryStatusLoaded) {
      main = "检查状态…";
    } else if (isLocallyDownloaded(libraryStatus)) {
      main = "已下载，可阅读";
      border = "#8ce99a";
      color = "#087f5b";
    } else if (libraryStatus?.imported) {
      main = libraryStatus.hasLocalFile ? "已入库，文件缺失" : "已入库，未下载";
      border = "#ffe066";
      color = "#e67700";
    }

    mainElement.textContent = main;
    mainElement.style.color = color;
    if (badge instanceof HTMLElement) badge.style.borderColor = border;
  }

  async function recordLastSubmit(sourceId, kind, ok, message) {
    if (!sourceId) return;
    const map = { ...(settings.lastSubmitBySourceId || {}) };
    map[sourceId] = { at: new Date().toISOString(), kind, ok, message: message || "" };
    settings.lastSubmitBySourceId = map;
    await chrome.storage.local.set({ lastSubmitBySourceId: map });
    updatePanelStatusUi();
  }

  async function submitMetadataOnly() {
    if (panelBusy) return;
    panelBusy = true;
    setPanelButtonsBusy(true);

    try {
      const metadata = collectNormalizedMetadata();
      await cachePageMetadata();
      await METADATA_FEATURE.submit(metadata);
      await recordLastSubmit(metadata.sourceId, "metadata", true, "ok");
      showToast("✅ 已提交信息到 MangaTest", "success");
      await refreshLibraryStatus();
      updatePanelStatusUi();
    } catch (error) {
      showToast("❌ " + (error instanceof Error ? error.message : "提交失败"), "error");
    } finally {
      panelBusy = false;
      setPanelButtonsBusy(false);
    }
  }

  async function startDownloadFlow(options = {}) {
    const fromAuto = options.fromAuto === true;
    if (panelBusy) return;
    panelBusy = true;
    setPanelButtonsBusy(true);

    try {
      if (isLocallyDownloaded(libraryStatus)) {
        if (fromAuto) {
          showToast("📚 已入库，跳过自动下载", "success");
          updatePanelStatusUi();
          return;
        }
        const title = libraryStatus?.displayTitle || "该漫画";
        if (!window.confirm(`「${title}」已在本地库中。\n\n确定要再次提交离线下载吗？`)) {
          showToast("已取消重复下载", "success");
          return;
        }
      }

      const metadata = collectNormalizedMetadata();
      await chrome.storage.local.set({
        pendingAutoDownload: { site: metadata.site, sourceId: metadata.sourceId, sourceUrl: metadata.sourceUrl },
        pendingAutoDownloadSourceId: metadata.sourceId || null,
      });
      await cachePageMetadata();
      await METADATA_FEATURE.submit(metadata);
      await recordLastSubmit(metadata.sourceId, "metadata", true, "before-download");
      showToast("⚡ 已提交信息，正在获取下载资源…", "success");

      const link = page.findResourcePageLink?.();
      if (link) {
        link.click();
      } else if (typeof page.triggerResourceDownload === "function") {
        const triggered = await page.triggerResourceDownload();
        if (!triggered) throw new Error("未找到 Torrent 下载按钮");
      } else {
        throw new Error("当前页面没有可用的下载入口");
      }
    } catch (error) {
      showToast("❌ " + (error instanceof Error ? error.message : "开启下载失败"), "error");
      await clearPendingAutoDownload();
    } finally {
      panelBusy = false;
      setPanelButtonsBusy(false);
      void refreshLibraryStatus().then(updatePanelStatusUi);
    }
  }

  async function clearPendingAutoDownload() {
    await chrome.storage.local.set({ pendingAutoDownload: null, pendingAutoDownloadSourceId: null });
  }

  function setPanelButtonsBusy(busy) {
    for (const selector of ["#mangatest-btn-metadata", "#mangatest-btn-download"]) {
      const button = panelRoot?.querySelector(selector);
      if (button instanceof HTMLButtonElement) {
        button.disabled = busy;
        button.style.opacity = busy ? "0.6" : "1";
      }
    }
  }

  function injectSimpleMetadataButton() {
    if (document.getElementById("mangatest-float-btn")) return;
    const button = document.createElement("div");
    button.id = "mangatest-float-btn";
    button.textContent = "📥 提交到 MangaTest";
    Object.assign(button.style, {
      position: "fixed",
      bottom: "24px",
      right: "24px",
      zIndex: 999999,
      padding: "10px 18px",
      borderRadius: "10px",
      background: "#ef3b91",
      color: "#fff",
      fontSize: "14px",
      fontWeight: "700",
      fontFamily: "system-ui, sans-serif",
      cursor: "pointer",
      boxShadow: "0 4px 16px rgba(239,59,145,0.35)",
      userSelect: "none",
    });
    button.addEventListener("click", async () => {
      button.style.pointerEvents = "none";
      button.textContent = "⏳ 提交中...";
      try {
        const metadata = collectNormalizedMetadata();
        await cachePageMetadata();
        await METADATA_FEATURE.submit(metadata);
        showToast("✅ 已提交到 MangaTest", "success");
        button.textContent = "✅ 已提交";
      } catch (error) {
        showToast("❌ " + (error instanceof Error ? error.message : "提交失败"), "error");
        button.textContent = "📥 提交到 MangaTest";
      }
      button.style.pointerEvents = "auto";
    });
    document.body.appendChild(button);
  }

  async function injectResourceButtons() {
    const items = [];
    const anchors = page.getResourceAnchors?.() || [];

    for (const anchor of anchors) {
      if (!(anchor instanceof HTMLAnchorElement)) continue;
      if (anchor.parentElement?.querySelector(".mangatest-resource-btn")) continue;

      const button = document.createElement("span");
      button.className = "mangatest-resource-btn";
      button.textContent = "📥 MT";
      Object.assign(button.style, {
        marginLeft: "8px",
        padding: "2px 10px",
        borderRadius: "6px",
        background: "#ef3b91",
        color: "#fff",
        fontSize: "12px",
        fontWeight: "700",
        cursor: "pointer",
        display: "inline-block",
        userSelect: "none",
      });
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void handleResourceSubmit(anchor, button, { closeOnSuccess: true, notifyDetail: true });
      });
      anchor.parentElement?.insertBefore(button, anchor.nextSibling);
      items.push({ anchor, button });
    }

    const stored = await chrome.storage.local.get({
      pendingAutoDownload: null,
      pendingAutoDownloadSourceId: null,
      autoTorrentSubmitCount: 1,
    });
    settings.autoTorrentSubmitCount = normalizeAutoTorrentSubmitCount(stored.autoTorrentSubmitCount);

    const pageMetadata = (() => {
      try {
        return collectNormalizedMetadata();
      } catch {
        return null;
      }
    })();
    const pending = stored.pendingAutoDownload || (stored.pendingAutoDownloadSourceId ? { sourceId: stored.pendingAutoDownloadSourceId } : null);
    const shouldAuto = Boolean(pending && pageMetadata && sameSource(pageMetadata, pending));

    if (!shouldAuto) {
      console.log("[MangaTest] 资源页：无 pending 自动下载标记，仅手动提交");
      if (items.length === 0) showToast("⚠️ 本页没有可用资源", "error");
      return;
    }

    if (items.length === 0) {
      await clearPendingAutoDownload();
      showToast("⚠️ 本页没有可用资源，页面保持打开", "error");
      await notifyDetailDownloadResult({ ok: false, sourceId: pending.sourceId, message: "本页没有可用资源" });
      return;
    }

    scheduleAutoResourceDownload(items, pending.sourceId);
  }

  function scheduleAutoResourceDownload(items, pendingSourceId) {
    if (window.__mangatestAutoResourceStarted) return;
    window.__mangatestAutoResourceStarted = true;

    const limit = normalizeAutoTorrentSubmitCount(settings.autoTorrentSubmitCount);
    const targets = items.slice(0, limit);
    setTimeout(async () => {
      showToast(targets.length === 1 ? "⚡ 自动下载：正在提交 1 个资源…" : `⚡ 自动下载：正在提交前 ${targets.length} 个资源…`, "success");

      let successCount = 0;
      let lastError = "";
      for (const item of targets) {
        if (item.button.dataset.mangatestAutoClicked === "1") continue;
        item.button.dataset.mangatestAutoClicked = "1";
        const ok = await handleResourceSubmit(item.anchor, item.button, { closeOnSuccess: false, notifyDetail: false });
        if (ok) successCount += 1;
        else lastError = "提交失败";
      }

      await clearPendingAutoDownload();
      if (successCount > 0) {
        showToast(`✅ 自动提交成功 ${successCount}/${targets.length}，即将关闭`, "success");
        await notifyDetailDownloadResult({ ok: true, sourceId: pendingSourceId, message: `已提交 ${successCount} 个资源` });
        void closeResourceTabAfterSuccess();
      } else {
        showToast("❌ 自动提交失败，页面保持打开", "error");
        await notifyDetailDownloadResult({ ok: false, sourceId: pendingSourceId, message: lastError || "自动提交失败" });
      }
    }, 500);
  }

  async function handleResourceSubmit(anchor, button, options = {}) {
    const closeOnSuccess = options.closeOnSuccess !== false;
    const notifyDetail = options.notifyDetail !== false;
    const originalText = button.textContent;
    button.textContent = "⏳...";
    button.style.pointerEvents = "none";

    try {
      const resourceUrl = page.extractResourceUrl?.(anchor);
      if (!resourceUrl) throw new Error("无法获取资源链接");

      const pageMetadata = collectNormalizedMetadata();
      const cached = await readCachedPageMetadata();
      const metadata = mergePageMetadata(pageMetadata, cached);
      const resource = {
        type: page.resourceType?.(anchor) || "http",
        url: resourceUrl,
        label: page.resourceLabel?.(anchor) || "Resource",
      };

      await DOWNLOAD_FEATURE.submit(metadata, [resource]);
      showToast("✅ 已提交资源到 MangaTest", "success");
      button.textContent = "✅ 已提交";
      if (notifyDetail) {
        await notifyDetailDownloadResult({
          ok: true,
          sourceId: metadata.sourceId,
          sourceUrl: metadata.sourceUrl,
          site: metadata.site,
          message: "已提交资源",
        });
      }
      if (closeOnSuccess) void closeResourceTabAfterSuccess();
      return true;
    } catch (error) {
      console.error("[MangaTest] 资源提交失败", error);
      showToast("❌ " + (error instanceof Error ? error.message : "提交失败"), "error");
      button.textContent = originalText;
      button.style.pointerEvents = "auto";
      return false;
    }
  }

  async function notifyDetailDownloadResult(payload) {
    try {
      await BACKEND.notifySourceResult(payload);
    } catch (error) {
      console.warn("[MangaTest] 通知详情页失败", error);
    }
  }

  async function closeResourceTabAfterSuccess() {
    try {
      if (!isResourcePage) return;
      await BACKEND.closeCurrentTab(900);
    } catch {
      try {
        window.close();
      } catch {
        // Ignore browsers that refuse to close a tab they did not open.
      }
    }
  }

  function showToast(message, tone) {
    const existing = document.getElementById("mangatest-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "mangatest-toast";
    toast.textContent = message;
    const background = tone === "success" ? "#087f5b" : tone === "error" ? "#c92a2a" : "#ef3b91";
    Object.assign(toast.style, {
      position: "fixed",
      top: "20px",
      right: "20px",
      zIndex: 1000000,
      padding: "12px 20px",
      borderRadius: "10px",
      background,
      color: "#fff",
      fontSize: "14px",
      fontWeight: "600",
      fontFamily: "system-ui, sans-serif",
      boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
      opacity: "0",
      transition: "opacity 0.25s ease",
      pointerEvents: "none",
      maxWidth: "400px",
      overflowWrap: "anywhere",
    });
    document.body.appendChild(toast);
    requestAnimationFrame(() => {
      toast.style.opacity = "1";
    });
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  function handleSourceResultMessage(message) {
    const metadata = collectNormalizedMetadata();
    if (!isDetailPage || !sameSource(metadata, message)) return;
    void recordLastSubmit(metadata.sourceId, "download", Boolean(message.ok), message.message || "");
    showToast(message.ok ? "✅ 下载已提交到 MangaTest" : `❌ 下载提交失败：${message.message || "未知错误"}`, message.ok ? "success" : "error");
    void refreshLibraryStatus().then(updatePanelStatusUi);
  }

  async function handleCapturedTorrentDownload(message) {
    if (!isDetailPage || page.id !== "nhentai-gallery" || !message?.url) {
      return { ok: false, error: "当前页面不支持 nhentai Torrent 捕获。" };
    }

    const downloadKey = String(message.downloadId || message.url);
    if (handledCapturedDownloads.has(downloadKey)) {
      return { ok: true, duplicate: true };
    }
    handledCapturedDownloads.add(downloadKey);

    try {
      const metadata = collectNormalizedMetadata();
      const resourceUrl = new URL(message.url, location.href).toString();
      await DOWNLOAD_FEATURE.submit(metadata, [
        {
          type: "torrent",
          url: resourceUrl,
          label: message.label || "NHentai Torrent",
        },
      ]);
      await clearPendingAutoDownload();
      await recordLastSubmit(metadata.sourceId, "download", true, "torrent");
      showToast("✅ Torrent 已提交到 MangaTest", "success");
      await refreshLibraryStatus();
      updatePanelStatusUi();
      return { ok: true };
    } catch (error) {
      await clearPendingAutoDownload();
      showToast("❌ Torrent 提交失败：" + (error instanceof Error ? error.message : "未知错误"), "error");
      return { ok: false, error: error instanceof Error ? error.message : "Torrent 提交失败" };
    }
  }

  if (isDetailPage) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message?.type === "MANGATEST_NHENTAI_TORRENT_CAPTURED") {
        void handleCapturedTorrentDownload(message).then(sendResponse);
        return true;
      }

      if (message?.type === "MANGATEST_SOURCE_RESULT" || message?.type === "MANGATEST_DOWNLOAD_RESULT") {
        try {
          handleSourceResultMessage(message);
        } catch (error) {
          console.warn("[MangaTest] 处理资源结果失败", error);
        }
      }
    });
  }
})();
