(async () => {
  const COLLECTOR = window.__mangatest;
  if (!COLLECTOR) {
    console.log("[MangaTest] 未找到采集器，跳过");
    return;
  }

  console.log("[MangaTest] 内容脚本已加载");

  let settings = await chrome.storage.local.get({
    serverUrl: "http://127.0.0.1:4317",
    importToken: "",
    /** Open gallery detail → auto full download (default off for browsing). */
    autoDownloadOnGalleryOpen: false,
    /** Legacy key; used only when autoDownloadOnGalleryOpen is unset. */
    autoDownloadOnTorrentPage: false,
    autoTorrentSubmitCount: 1,
    pendingAutoDownloadSourceId: null,
    lastSubmitBySourceId: {},
  });

  // Migrate: if new key missing but old was explicitly true, keep true once.
  if (settings.autoDownloadOnGalleryOpen === undefined && settings.autoDownloadOnTorrentPage === true) {
    settings.autoDownloadOnGalleryOpen = true;
  }
  settings.autoDownloadOnGalleryOpen = settings.autoDownloadOnGalleryOpen === true;
  settings.autoTorrentSubmitCount = normalizeAutoTorrentSubmitCount(settings.autoTorrentSubmitCount);

  console.log("[MangaTest] 设置", {
    服务地址: settings.serverUrl,
    有令牌: Boolean(settings.importToken),
    详情页自动下载: settings.autoDownloadOnGalleryOpen,
    自动提交种子数: settings.autoTorrentSubmitCount,
  });

  function normalizeAutoTorrentSubmitCount(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 1;
    return Math.max(1, Math.min(10, Math.trunc(n)));
  }

  const adapter = (window.MangaTestSiteAdapters || []).find((a) => {
    try {
      return a.matches();
    } catch {
      return false;
    }
  });
  if (!adapter) {
    console.log("[MangaTest] 当前页面没有匹配的站点适配器");
    return;
  }

  console.log("[MangaTest] 匹配到适配器", { id: adapter.id });

  const connected = await checkServer(settings.serverUrl);
  if (!connected) {
    console.log("[MangaTest] 无法连接 MangaTest 服务", { 地址: settings.serverUrl });
    injectDisconnectedHint(settings.serverUrl);
    return;
  }
  console.log("[MangaTest] 服务器连接正常");

  /** @type {HTMLElement | null} */
  let panelRoot = null;
  /** @type {{ imported?: boolean, localReadable?: boolean, displayTitle?: string | null, hasLocalFile?: boolean, comicStatus?: string | null } | null} */
  let libraryStatus = null;
  let panelBusy = false;

  if (adapter.id === "ehentai-gallery") {
    void cacheGalleryMetadataForTorrentFollowUp();
    injectGalleryPanel();
    document.addEventListener(
      "click",
      (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const link = target.closest('a[href*="gallerytorrents.php"], a[onclick*="gallerytorrents"]');
        if (!link) return;
        void cacheGalleryMetadataForTorrentFollowUp();
      },
      true,
    );
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === "MANGATEST_DOWNLOAD_RESULT") {
        handleDownloadResultMessage(message);
      }
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes.autoDownloadOnGalleryOpen) {
        settings.autoDownloadOnGalleryOpen = changes.autoDownloadOnGalleryOpen.newValue === true;
        updatePanelStatusUi();
      }
      if (changes.autoTorrentSubmitCount) {
        settings.autoTorrentSubmitCount = normalizeAutoTorrentSubmitCount(changes.autoTorrentSubmitCount.newValue);
      }
    });
    void initGalleryPage();
  } else if (adapter.id === "nhentai-gallery") {
    void cacheGalleryMetadataForTorrentFollowUp();
    injectSimpleMetadataButton();
  } else if (adapter.id === "ehentai-torrents") {
    injectTorrentButtons();
  }

  async function initGalleryPage() {
    await refreshLibraryStatus();
    updatePanelStatusUi();
    if (settings.autoDownloadOnGalleryOpen && !isLocallyDownloaded(libraryStatus)) {
      void startDownloadFlow({ fromAuto: true });
    }
  }

  function isLocallyDownloaded(status) {
    return Boolean(status?.localReadable);
  }

  function findGalleryTorrentPageLink() {
    const preferred = document.querySelector("#gd5 > p:nth-child(3) > a");
    if (preferred instanceof HTMLAnchorElement) return preferred;
    const byHref = document.querySelector('#gd5 a[href*="gallerytorrents.php"], a[href*="gallerytorrents.php"]');
    if (byHref instanceof HTMLAnchorElement) return byHref;
    const byOnclick = [...document.querySelectorAll("#gd5 a, #gd5 p a")].find((el) => {
      const onclick = el.getAttribute("onclick") || "";
      return /gallerytorrents/i.test(onclick) || /gallerytorrents/i.test(el.getAttribute("href") || "");
    });
    return byOnclick instanceof HTMLAnchorElement ? byOnclick : null;
  }

  async function cacheGalleryMetadataForTorrentFollowUp() {
    try {
      const raw = COLLECTOR.collectPageMetadata();
      const metadata = COLLECTOR.normalizeMetadata(raw);
      if (!metadata?.sourceId) return metadata;
      await chrome.storage.local.set({ lastExhentaiMetadata: metadata });
      console.log("[MangaTest] 已缓存详情页元数据", {
        sourceId: metadata.sourceId,
        标签数: metadata.tags?.length ?? 0,
      });
      return metadata;
    } catch (error) {
      console.warn("[MangaTest] 缓存详情页元数据失败", error);
      return null;
    }
  }

  function sameGallerySource(a, b) {
    if (!a || !b) return false;
    if (a.sourceId && b.sourceId && a.sourceId === b.sourceId) return true;
    const gidOf = (value) => {
      const id = String(value?.sourceId || value?.sourceUrl || "");
      const m = /\/g\/(\d+)/.exec(id);
      return m?.[1] || null;
    };
    return Boolean(gidOf(a) && gidOf(a) === gidOf(b));
  }

  function mergeGalleryMetadataIntoTorrentPayload(pageMetadata, cached) {
    if (!cached || !sameGallerySource(pageMetadata, cached)) return pageMetadata;
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

  async function checkServer(serverUrl) {
    try {
      const resp = await chrome.runtime.sendMessage({ type: "MANGATEST_PING", serverUrl });
      return resp?.ok === true;
    } catch {
      return false;
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

  function collectNormalizedMetadata() {
    const raw = COLLECTOR.collectPageMetadata();
    const metadata = COLLECTOR.normalizeMetadata(raw);
    if (!metadata) throw new Error("采集失败");
    return metadata;
  }

  async function refreshLibraryStatus() {
    try {
      const metadata = collectNormalizedMetadata();
      const resp = await chrome.runtime.sendMessage({
        type: "MANGATEST_API_CALL",
        method: "POST",
        endpoint: "/api/metadata/status",
        body: {
          site: metadata.site,
          sourceId: metadata.sourceId,
          sourceUrl: metadata.sourceUrl,
          title: metadata.title,
        },
      });
      if (resp?.ok && resp.body?.result) {
        libraryStatus = resp.body.result;
      } else {
        libraryStatus = null;
      }
    } catch (error) {
      console.warn("[MangaTest] 状态查询失败", error);
      libraryStatus = null;
    }
  }

  function injectGalleryPanel() {
    if (document.getElementById("mangatest-panel-root")) return;

    // Fixed top-right status (always visible; not inside the action panel).
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
      <div style="font-weight:800;font-size:12px;color:#24141f;margin-bottom:4px;">MangaTest</div>
      <div id="mangatest-status-main">检查库状态…</div>
      <div id="mangatest-status-extra" style="margin-top:4px;opacity:0.9;"></div>
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
      <div id="mangatest-panel" style="display:none;margin-bottom:10px;background:#fff8fb;border:1px solid #f7c9dc;border-radius:12px;box-shadow:0 8px 24px rgba(239,59,145,0.2);overflow:hidden;">
        <div style="padding:12px 14px;border-bottom:1px solid #fde0eb;">
          <div style="font-weight:800;font-size:14px;color:#24141f;">操作</div>
        </div>
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
    const autoCb = root.querySelector("#mangatest-auto-download");
    const btnMeta = root.querySelector("#mangatest-btn-metadata");
    const btnDl = root.querySelector("#mangatest-btn-download");

    if (autoCb instanceof HTMLInputElement) {
      autoCb.checked = settings.autoDownloadOnGalleryOpen === true;
      autoCb.addEventListener("change", async () => {
        settings.autoDownloadOnGalleryOpen = autoCb.checked;
        await chrome.storage.local.set({
          autoDownloadOnGalleryOpen: autoCb.checked,
          autoDownloadOnTorrentPage: autoCb.checked,
        });
        showToast(autoCb.checked ? "✅ 已开启：打开详情页自动下载" : "✅ 已关闭自动下载", "success");
        updatePanelStatusUi();
      });
    }

    fab?.addEventListener("click", () => {
      if (!(panel instanceof HTMLElement)) return;
      const open = panel.style.display !== "none";
      panel.style.display = open ? "none" : "block";
    });

    btnMeta?.addEventListener("click", () => {
      void submitMetadataOnly();
    });
    btnDl?.addEventListener("click", () => {
      void startDownloadFlow({ fromAuto: false });
    });

    console.log("[MangaTest] 详情页面板与右上角状态已注入");
  }

  function updatePanelStatusUi() {
    const mainEl = document.querySelector("#mangatest-status-main");
    const extraEl = document.querySelector("#mangatest-status-extra");
    const badge = document.querySelector("#mangatest-status-badge");
    if (!(mainEl instanceof HTMLElement) || !(extraEl instanceof HTMLElement)) return;

    let main = "未在库中";
    let border = "#f7c9dc";
    let color = "#7c5166";

    if (isLocallyDownloaded(libraryStatus)) {
      main = `📚 已入库可阅读${libraryStatus?.displayTitle ? `：${libraryStatus.displayTitle}` : ""}`;
      border = "#8ce99a";
      color = "#087f5b";
    } else if (libraryStatus?.imported) {
      main = libraryStatus.hasLocalFile
        ? "已导入（本地文件可能缺失）"
        : "已导入元数据，本地尚无文件";
      border = "#ffe066";
      color = "#e67700";
    }

    const extras = [];
    extras.push(settings.autoDownloadOnGalleryOpen ? "自动下载：开" : "自动下载：关");
    if (isLocallyDownloaded(libraryStatus)) {
      extras.push("不会自动下载");
    }

    try {
      const meta = collectNormalizedMetadata();
      const map = settings.lastSubmitBySourceId || {};
      const last = meta.sourceId ? map[meta.sourceId] : null;
      if (last?.at) {
        const t = new Date(last.at).toLocaleString();
        if (last.kind === "download" && last.ok) {
          extras.push(`✅ 下载已提交 ${t}`);
        } else if (last.kind === "download") {
          extras.push(`下载提交失败 ${t}`);
        } else {
          extras.push(`元数据已提交 ${t}`);
        }
      }
    } catch {
      // ignore
    }

    mainEl.textContent = main;
    mainEl.style.color = color;
    extraEl.textContent = extras.join(" · ");
    if (badge instanceof HTMLElement) {
      badge.style.borderColor = border;
    }
  }

  async function recordLastSubmit(sourceId, kind, ok, message) {
    if (!sourceId) return;
    const map = { ...(settings.lastSubmitBySourceId || {}) };
    map[sourceId] = { at: new Date().toISOString(), kind, ok, message: message || "" };
    settings.lastSubmitBySourceId = map;
    await chrome.storage.local.set({ lastSubmitBySourceId: map });
    updatePanelStatusUi();
  }

  function handleDownloadResultMessage(message) {
    try {
      const meta = collectNormalizedMetadata();
      if (!sameGallerySource(meta, { sourceId: message.sourceId, sourceUrl: message.sourceUrl })) {
        return;
      }
      void recordLastSubmit(meta.sourceId, "download", Boolean(message.ok), message.message || "");
      if (message.ok) {
        showToast("✅ 下载已提交到 MangaTest", "success");
      } else {
        showToast(`❌ 下载提交失败：${message.message || "未知错误"}`, "error");
      }
      void refreshLibraryStatus().then(updatePanelStatusUi);
    } catch (error) {
      console.warn("[MangaTest] 处理下载结果失败", error);
    }
  }

  async function submitMetadataOnly() {
    if (panelBusy) return;
    panelBusy = true;
    setPanelButtonsBusy(true);
    try {
      const metadata = collectNormalizedMetadata();
      metadata.resources = [];
      await chrome.storage.local.set({ lastExhentaiMetadata: metadata });
      const resp = await chrome.runtime.sendMessage({
        type: "MANGATEST_API_CALL",
        method: "POST",
        endpoint: "/api/metadata/import",
        body: metadata,
      });
      if (!resp?.ok) throw new Error(resp?.error || "提交失败");
      await recordLastSubmit(metadata.sourceId, "metadata", true, "ok");
      showToast("✅ 已提交信息到 MangaTest", "success");
      await refreshLibraryStatus();
      updatePanelStatusUi();
    } catch (err) {
      showToast("❌ " + (err instanceof Error ? err.message : "提交失败"), "error");
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
        const ok = window.confirm(`「${title}」已在本地库中。\n\n确定要再次提交离线下载吗？`);
        if (!ok) {
          showToast("已取消重复下载", "success");
          return;
        }
      }

      const metadata = collectNormalizedMetadata();
      metadata.resources = [];
      await chrome.storage.local.set({
        lastExhentaiMetadata: metadata,
        pendingAutoDownloadSourceId: metadata.sourceId || null,
      });

      const resp = await chrome.runtime.sendMessage({
        type: "MANGATEST_API_CALL",
        method: "POST",
        endpoint: "/api/metadata/import",
        body: metadata,
      });
      if (!resp?.ok) throw new Error(resp?.error || "提交信息失败");

      await recordLastSubmit(metadata.sourceId, "metadata", true, "before-download");
      showToast("⚡ 已提交信息，正在打开种子页…", "success");

      const opened = await openTorrentPageFromGallery();
      if (!opened) {
        await chrome.storage.local.set({ pendingAutoDownloadSourceId: null });
        throw new Error("未找到种子入口链接");
      }
    } catch (err) {
      showToast("❌ " + (err instanceof Error ? err.message : "开启下载失败"), "error");
      await chrome.storage.local.set({ pendingAutoDownloadSourceId: null });
    } finally {
      panelBusy = false;
      setPanelButtonsBusy(false);
      void refreshLibraryStatus().then(updatePanelStatusUi);
    }
  }

  function setPanelButtonsBusy(busy) {
    const ids = ["#mangatest-btn-metadata", "#mangatest-btn-download"];
    for (const id of ids) {
      const btn = panelRoot?.querySelector(id);
      if (btn instanceof HTMLButtonElement) {
        btn.disabled = busy;
        btn.style.opacity = busy ? "0.6" : "1";
      }
    }
  }

  function openTorrentPageFromGallery() {
    return new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 25;
      const tryOpen = () => {
        attempts += 1;
        const link = findGalleryTorrentPageLink();
        if (!link) {
          if (attempts < maxAttempts) {
            setTimeout(tryOpen, 300);
            return;
          }
          resolve(false);
          return;
        }
        void cacheGalleryMetadataForTorrentFollowUp().finally(() => {
          link.click();
          resolve(true);
        });
      };
      setTimeout(tryOpen, 200);
    });
  }

  function injectSimpleMetadataButton() {
    if (document.getElementById("mangatest-float-btn")) return;
    const btn = document.createElement("div");
    btn.id = "mangatest-float-btn";
    btn.textContent = "📥 提交到 MangaTest";
    Object.assign(btn.style, {
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
    btn.addEventListener("click", async () => {
      btn.style.pointerEvents = "none";
      btn.textContent = "⏳ 提交中...";
      try {
        const metadata = collectNormalizedMetadata();
        metadata.resources = [];
        await chrome.storage.local.set({ lastExhentaiMetadata: metadata });
        const resp = await chrome.runtime.sendMessage({
          type: "MANGATEST_API_CALL",
          method: "POST",
          endpoint: "/api/metadata/import",
          body: metadata,
        });
        if (!resp?.ok) throw new Error(resp?.error || "提交失败");
        showToast("✅ 已提交到 MangaTest", "success");
        btn.textContent = "✅ 已提交";
      } catch (err) {
        showToast("❌ " + (err instanceof Error ? err.message : "提交失败"), "error");
        btn.textContent = "📥 提交到 MangaTest";
      }
      btn.style.pointerEvents = "auto";
    });
    document.body.appendChild(btn);
  }

  async function injectTorrentButtons() {
    /** @type {Array<{ anchor: HTMLAnchorElement, btn: HTMLElement }>} */
    const items = [];
    for (const anchor of document.querySelectorAll('a[href*="/torrent/"]')) {
      if (!(anchor instanceof HTMLAnchorElement)) continue;
      if (anchor.parentElement?.querySelector(".mangatest-torrent-btn")) continue;
      const btn = document.createElement("span");
      btn.className = "mangatest-torrent-btn";
      btn.textContent = "📥 MT";
      Object.assign(btn.style, {
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
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        void handleTorrentSubmit(anchor, btn, { closeOnSuccess: true, notifyGallery: true });
      });
      anchor.parentElement?.insertBefore(btn, anchor.nextSibling);
      items.push({ anchor, btn });
    }
    console.log("[MangaTest] 种子页按钮已注入", { 数量: items.length });

    const stored = await chrome.storage.local.get({
      pendingAutoDownloadSourceId: null,
      autoTorrentSubmitCount: 1,
      lastExhentaiMetadata: null,
    });
    settings.autoTorrentSubmitCount = normalizeAutoTorrentSubmitCount(stored.autoTorrentSubmitCount);

    const pageMeta = (() => {
      try {
        return COLLECTOR.normalizeMetadata(COLLECTOR.collectPageMetadata());
      } catch {
        return null;
      }
    })();
    const pendingId = stored.pendingAutoDownloadSourceId;
    const shouldAuto =
      Boolean(pendingId) &&
      pageMeta &&
      sameGallerySource(pageMeta, { sourceId: pendingId, sourceUrl: pageMeta.sourceUrl });

    if (!shouldAuto) {
      console.log("[MangaTest] 种子页：无 pending 自动下载标记，仅手动 MT");
      if (items.length === 0) {
        showToast("⚠️ 本页没有可用种子", "error");
      }
      return;
    }

    if (items.length === 0) {
      await chrome.storage.local.set({ pendingAutoDownloadSourceId: null });
      showToast("⚠️ 本页没有可用种子，页面保持打开", "error");
      await notifyGalleryDownloadResult({
        ok: false,
        sourceId: pendingId,
        message: "本页没有可用种子",
      });
      return;
    }

    scheduleAutoTorrentDownload(items, pendingId);
  }

  function scheduleAutoTorrentDownload(items, pendingId) {
    if (window.__mangatestAutoTorrentStarted) return;
    window.__mangatestAutoTorrentStarted = true;

    const limit = normalizeAutoTorrentSubmitCount(settings.autoTorrentSubmitCount);
    const targets = items.slice(0, limit);

    setTimeout(async () => {
      showToast(
        targets.length === 1 ? "⚡ 自动下载：正在提交 1 个种子…" : `⚡ 自动下载：正在提交前 ${targets.length} 个种子…`,
        "success",
      );

      let successCount = 0;
      let lastError = "";
      for (const item of targets) {
        if (item.btn.dataset.mangatestAutoClicked === "1") continue;
        item.btn.dataset.mangatestAutoClicked = "1";
        const ok = await handleTorrentSubmit(item.anchor, item.btn, {
          closeOnSuccess: false,
          notifyGallery: false,
        });
        if (ok) successCount += 1;
        else lastError = "提交失败";
      }

      await chrome.storage.local.set({ pendingAutoDownloadSourceId: null });

      if (successCount > 0) {
        showToast(`✅ 自动提交成功 ${successCount}/${targets.length}，即将关闭`, "success");
        await notifyGalleryDownloadResult({
          ok: true,
          sourceId: pendingId,
          message: `已提交 ${successCount} 个种子`,
        });
        void closeTorrentPopupTabAfterSuccess();
      } else {
        showToast("❌ 自动提交失败，页面保持打开", "error");
        await notifyGalleryDownloadResult({
          ok: false,
          sourceId: pendingId,
          message: lastError || "自动提交失败",
        });
      }
    }, 500);
  }

  function extractTorrentUrl(anchor) {
    const onclick = anchor.getAttribute("onclick") || "";
    const m = /document\.location\s*=\s*['"]([^'"]+\.torrent[^'"]*)['"]/i.exec(onclick);
    return m?.[1] || anchor.getAttribute("href") || anchor.href || "";
  }

  /**
   * @returns {Promise<boolean>}
   */
  async function handleTorrentSubmit(anchor, btn, options = {}) {
    const closeOnSuccess = options.closeOnSuccess !== false;
    const notifyGallery = options.notifyGallery !== false;
    const originalText = btn.textContent;
    btn.textContent = "⏳...";
    btn.style.pointerEvents = "none";

    try {
      const clickedUrl = extractTorrentUrl(anchor);
      if (!clickedUrl) throw new Error("无法获取种子链接");

      const raw = COLLECTOR.collectPageMetadata();
      let metadata = COLLECTOR.normalizeMetadata(raw);
      if (!metadata) throw new Error("采集失败");

      const stored = await chrome.storage.local.get({ lastExhentaiMetadata: null });
      metadata = mergeGalleryMetadataIntoTorrentPayload(metadata, stored.lastExhentaiMetadata);
      metadata.resources = [{ type: "torrent", url: clickedUrl, label: (anchor.textContent || "").trim() || "Torrent" }];

      const resp = await chrome.runtime.sendMessage({
        type: "MANGATEST_RESOLVE_TORRENTS",
        resources: metadata.resources,
      });
      if (resp?.ok) metadata.resources = resp.resources;
      if (!Array.isArray(metadata.resources) || metadata.resources.length === 0) {
        throw new Error("没有可用种子/磁链");
      }

      const res = await chrome.runtime.sendMessage({
        type: "MANGATEST_API_CALL",
        method: "POST",
        endpoint: "/api/metadata/import-with-magnet",
        body: metadata,
      });
      if (!res?.ok) throw new Error(res?.error || "提交失败");

      showToast("✅ 已提交磁链和信息到 MangaTest", "success");
      btn.textContent = "✅ 已提交";
      if (notifyGallery) {
        await notifyGalleryDownloadResult({
          ok: true,
          sourceId: metadata.sourceId,
          sourceUrl: metadata.sourceUrl,
          message: "已提交磁链",
        });
      }
      if (closeOnSuccess) void closeTorrentPopupTabAfterSuccess();
      return true;
    } catch (err) {
      console.error("[MangaTest] 种子提交失败", err);
      showToast("❌ " + (err instanceof Error ? err.message : "提交失败"), "error");
      btn.textContent = originalText;
      btn.style.pointerEvents = "auto";
      return false;
    }
  }

  async function notifyGalleryDownloadResult(payload) {
    try {
      await chrome.runtime.sendMessage({
        type: "MANGATEST_NOTIFY_GALLERY",
        sourceId: payload.sourceId,
        sourceUrl: payload.sourceUrl,
        ok: payload.ok,
        message: payload.message,
      });
    } catch (error) {
      console.warn("[MangaTest] 通知详情页失败", error);
    }
  }

  async function closeTorrentPopupTabAfterSuccess() {
    try {
      if (!/gallerytorrents\.php/i.test(location.pathname + location.search + location.href)) return;
      await chrome.runtime.sendMessage({ type: "MANGATEST_CLOSE_TAB", delayMs: 900 });
    } catch {
      try {
        window.close();
      } catch {
        // ignore
      }
    }
  }

  function showToast(msg, tone) {
    const existing = document.getElementById("mangatest-toast");
    if (existing) existing.remove();
    const toast = document.createElement("div");
    toast.id = "mangatest-toast";
    toast.textContent = msg;
    const bg = tone === "success" ? "#087f5b" : tone === "error" ? "#c92a2a" : "#ef3b91";
    Object.assign(toast.style, {
      position: "fixed",
      top: "20px",
      right: "20px",
      zIndex: 1000000,
      padding: "12px 20px",
      borderRadius: "10px",
      background: bg,
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
})();
