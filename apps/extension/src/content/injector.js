(async () => {
  const COLLECTOR = window.__mangatest;
  if (!COLLECTOR) {
    console.log("[MangaTest] 未找到采集器，跳过");
    return;
  }

  console.log("[MangaTest] 内容脚本已加载");

  const settings = await chrome.storage.local.get({
    serverUrl: "http://127.0.0.1:4317",
    importToken: "",
    /** When true (default), opening gallerytorrents page auto-clicks first MT button. */
    autoDownloadOnTorrentPage: true,
  });
  console.log("[MangaTest] 设置", {
    服务地址: settings.serverUrl,
    有令牌: Boolean(settings.importToken),
    种子页自动下载: settings.autoDownloadOnTorrentPage !== false,
  });

  const adapter = (window.MangaTestSiteAdapters || []).find((a) => {
    try { return a.matches(); } catch { return false; }
  });
  if (!adapter) {
    console.log("[MangaTest] 当前页面没有匹配的站点适配器");
    return;
  }

  console.log("[MangaTest] 匹配到适配器", { id: adapter.id });

  // 检查服务器连通性
  const connected = await checkServer(settings.serverUrl);
  if (!connected) {
    console.log("[MangaTest] 无法连接 MangaTest 服务", { 地址: settings.serverUrl });
    injectDisconnectedHint(settings.serverUrl);
    return;
  }
  console.log("[MangaTest] 服务器连接正常");

  if (adapter.id === "ehentai-gallery" || adapter.id === "nhentai-gallery") {
    // Cache gallery metadata early so torrent-page submit can attach tags without re-visiting.
    void cacheGalleryMetadataForTorrentFollowUp();
    injectGalleryButton(settings);
    // Opening gallerytorrents.php often happens via popup; refresh cache when user clicks torrent entry links.
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
  } else if (adapter.id === "ehentai-torrents") {
    injectTorrentButtons(settings);
  }

  async function cacheGalleryMetadataForTorrentFollowUp() {
    try {
      const raw = COLLECTOR.collectPageMetadata();
      const metadata = COLLECTOR.normalizeMetadata(raw);
      if (!metadata?.sourceId) return;
      await chrome.storage.local.set({ lastExhentaiMetadata: metadata });
      console.log("[MangaTest] 已缓存详情页元数据供种子页使用", {
        sourceId: metadata.sourceId,
        标签数: metadata.tags?.length ?? 0,
        标题: metadata.title,
      });
    } catch (error) {
      console.warn("[MangaTest] 缓存详情页元数据失败", error);
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
    const ga = gidOf(a);
    const gb = gidOf(b);
    return Boolean(ga && gb && ga === gb);
  }

  function mergeGalleryMetadataIntoTorrentPayload(pageMetadata, cached) {
    if (!cached || !sameGallerySource(pageMetadata, cached)) {
      return pageMetadata;
    }
    const pageTags = Array.isArray(pageMetadata.tags) ? pageMetadata.tags : [];
    const cachedTags = Array.isArray(cached.tags) ? cached.tags : [];
    return {
      ...cached,
      ...pageMetadata,
      // Prefer non-empty tags/title/cover from cache when torrent page has none.
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
      const resp = await chrome.runtime.sendMessage({
        type: "MANGATEST_PING",
        serverUrl,
      });
      return resp?.ok === true;
    } catch {
      return false;
    }
  }

  function injectDisconnectedHint(serverUrl) {
    const hint = document.createElement("div");
    hint.id = "mangatest-hint";
    hint.title = "点击打开 MangaTest 设置";
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
      cursor: "pointer",
      boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
      userSelect: "none",
    });
    hint.textContent = `⚠️ MangaTest 无法连接 (${serverUrl})`;
    hint.addEventListener("click", () => {
      const note = document.createElement("div");
      note.textContent = "点击浏览器工具栏的 MangaTest 图标配置服务地址";
      Object.assign(note.style, { fontSize: "11px", color: "#f59f00", marginTop: "4px" });
      hint.appendChild(note);
    });
    document.body.appendChild(hint);
    console.log("[MangaTest] 已显示连接失败提示");
  }

  function injectGalleryButton(settings) {
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
      transition: "transform 0.15s, box-shadow 0.15s",
      userSelect: "none",
    });
    btn.addEventListener("mouseenter", () => {
      btn.style.transform = "scale(1.04)";
      btn.style.boxShadow = "0 6px 20px rgba(239,59,145,0.45)";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.transform = "scale(1)";
      btn.style.boxShadow = "0 4px 16px rgba(239,59,145,0.35)";
    });
    btn.addEventListener("click", () => handleGallerySubmit(settings, btn));
    document.body.appendChild(btn);
    console.log("[MangaTest] 详情页浮动按钮已注入");
  }

  async function handleGallerySubmit(settings, btn) {
    console.log("[MangaTest] 点击了详情页提交按钮");
    btn.textContent = "⏳ 采集中...";
    btn.style.pointerEvents = "none";

    try {
      const raw = COLLECTOR.collectPageMetadata();
      console.log("[MangaTest] 元数据采集完成", { 标题: raw?.title, 标签数: raw?.tags?.length, 资源数: raw?.resources?.length });

      const metadata = COLLECTOR.normalizeMetadata(raw);
      if (!metadata) throw new Error("采集失败");

      // 详情页只提交元数据（标题/标签/封面），不提交资源链接
      metadata.resources = [];

      // Persist for later torrent-page magnet import (tags/title/cover).
      try {
        await chrome.storage.local.set({ lastExhentaiMetadata: metadata });
        console.log("[MangaTest] 提交前已写入 lastExhentaiMetadata", {
          sourceId: metadata.sourceId,
          标签数: metadata.tags?.length ?? 0,
        });
      } catch (error) {
        console.warn("[MangaTest] 写入 lastExhentaiMetadata 失败", error);
      }

      console.log("[MangaTest] 规范化后的元数据", { 站点: metadata.site, 来源ID: metadata.sourceId, 标题: metadata.title, 标签数: metadata.tags?.length });
      console.log("[MangaTest] 通过后台线程提交");

      const resp = await chrome.runtime.sendMessage({
        type: "MANGATEST_API_CALL",
        method: "POST",
        endpoint: "/api/metadata/import",
        body: metadata,
      });

      console.log("[MangaTest] 提交结果", resp);

      if (!resp?.ok) throw new Error(resp?.error || "提交失败");

      showToast("✅ 已提交到 MangaTest", "success");
      btn.textContent = "✅ 已提交";
      setTimeout(() => {
        btn.textContent = "📥 提交到 MangaTest";
        btn.style.pointerEvents = "auto";
      }, 3000);
    } catch (err) {
      console.error("[MangaTest] 提交失败", err);
      showToast("❌ " + (err instanceof Error ? err.message : "提交失败"), "error");
      btn.textContent = "📥 提交到 MangaTest";
      btn.style.pointerEvents = "auto";
    }
  }

  function injectTorrentButtons(settings) {
    let count = 0;
    for (const anchor of document.querySelectorAll('a[href*="/torrent/"]')) {
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
        handleTorrentSubmit(settings, anchor, btn);
      });
      anchor.parentElement?.insertBefore(btn, anchor.nextSibling);
      count++;
    }
    console.log("[MangaTest] 种子页按钮已注入", { 数量: count });

    if (settings.autoDownloadOnTorrentPage !== false && count > 0) {
      scheduleAutoTorrentDownload();
    }
  }

  function scheduleAutoTorrentDownload() {
    // Debounce + short delay so layout/buttons settle; only once per page load.
    if (window.__mangatestAutoTorrentStarted) return;
    window.__mangatestAutoTorrentStarted = true;

    const run = () => {
      const buttons = [...document.querySelectorAll(".mangatest-torrent-btn")];
      if (buttons.length === 0) {
        console.log("[MangaTest] 自动下载：尚未找到 .mangatest-torrent-btn，稍后重试");
        setTimeout(run, 400);
        return;
      }
      // Prefer first real torrent row button (DOM order matches page listing).
      const btn = buttons[0];
      if (!(btn instanceof HTMLElement)) return;
      if (btn.dataset.mangatestAutoClicked === "1") return;
      btn.dataset.mangatestAutoClicked = "1";
      console.log("[MangaTest] 自动下载：触发 .mangatest-torrent-btn 点击", {
        按钮数: buttons.length,
        文案: btn.textContent,
      });
      showToast("⚡ 自动下载：正在提交首个种子…", "success");
      btn.click();
    };

    setTimeout(run, 500);
  }

  function extractTorrentUrl(anchor) {
    // Extract torrent URL from the clicked anchor element
    const onclick = anchor.getAttribute("onclick") || "";
    const m = /document\.location\s*=\s*['"]([^'"]+\.torrent[^'"]*)['"]/i.exec(onclick);
    return m?.[1] || anchor.getAttribute("href") || anchor.href || "";
  }

  async function handleTorrentSubmit(settings, anchor, btn) {
    console.log("[MangaTest] 点击了种子提交按钮");
    const originalText = btn.textContent;
    btn.textContent = "⏳...";
    btn.style.pointerEvents = "none";

    try {
      // Get clicked torrent URL
      const clickedUrl = extractTorrentUrl(anchor);
      if (!clickedUrl) throw new Error("无法获取种子链接");

      // Collect page metadata (for site/sourceId/title info)
      const raw = COLLECTOR.collectPageMetadata();
      let metadata = COLLECTOR.normalizeMetadata(raw);
      if (!metadata) throw new Error("采集失败");

      // Merge tags/title/cover from gallery page cache (torrent page has no #taglist).
      const stored = await chrome.storage.local.get({ lastExhentaiMetadata: null });
      metadata = mergeGalleryMetadataIntoTorrentPayload(metadata, stored.lastExhentaiMetadata);
      console.log("[MangaTest] 种子页合并详情缓存后", {
        sourceId: metadata.sourceId,
        标签数: metadata.tags?.length ?? 0,
        有缓存: Boolean(stored.lastExhentaiMetadata),
        缓存sourceId: stored.lastExhentaiMetadata?.sourceId,
      });

      // Only keep the clicked torrent resource
      metadata.resources = [{ type: "torrent", url: clickedUrl, label: (anchor.textContent || "").trim() || "Torrent" }];

      console.log("[MangaTest] 只提交点击的种子", { url: clickedUrl.slice(0, 80) });

      // Convert to magnet and submit
      const resp = await chrome.runtime.sendMessage({
        type: "MANGATEST_RESOLVE_TORRENTS",
        resources: metadata.resources,
      });
      console.log("[MangaTest] 转换结果", resp);
      if (resp?.ok) {
        metadata.resources = resp.resources;
      }

      console.log("[MangaTest] 通过后台线程提交元数据和磁链（直发 OpenList）");
      const res = await chrome.runtime.sendMessage({
        type: "MANGATEST_API_CALL",
        method: "POST",
        endpoint: "/api/metadata/import-with-magnet",
        body: metadata,
      });
      console.log("[MangaTest] 提交结果", res);
      if (!res?.ok) throw new Error(res?.error || "提交失败");

      showToast("✅ 已提交磁链和信息到 MangaTest", "success");
      btn.textContent = "✅ 已提交";
      setTimeout(() => { btn.textContent = originalText; btn.style.pointerEvents = "auto"; }, 3000);
    } catch (err) {
      console.error("[MangaTest] 种子提交失败", err);
      showToast("❌ " + (err instanceof Error ? err.message : "提交失败"), "error");
      btn.textContent = originalText;
      btn.style.pointerEvents = "auto";
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
      zIndex: 999999,
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
    requestAnimationFrame(() => { toast.style.opacity = "1"; });
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }
})();
