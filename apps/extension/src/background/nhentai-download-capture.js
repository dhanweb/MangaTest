(() => {
  const INTENT_TTL_MS = 15_000;

  function isUsableTabId(value) {
    return Number.isInteger(value) && value >= 0;
  }

  function isNhentaiGalleryUrl(value) {
    try {
      const url = new URL(String(value || ""));
      return /(^|\.)nhentai\.net$/.test(url.hostname) && /^\/g\/\d+\/?$/.test(url.pathname);
    } catch {
      return false;
    }
  }

  function isNhentaiTorrentDownloadUrl(value) {
    try {
      const url = new URL(String(value || ""));
      return (
        /(^|\.)nhentai\.net$/.test(url.hostname) &&
        /^\/download\/\d+\/?$/.test(url.pathname) &&
        url.searchParams.get("fmt") === "torrent"
      );
    } catch {
      return false;
    }
  }

  function isTorrentDownload(downloadItem, resourceUrl) {
    const url = String(resourceUrl || "");
    const filename = String(downloadItem?.filename || "");
    const mime = String(downloadItem?.mime || "");
    return (
      isNhentaiTorrentDownloadUrl(url) ||
      /\.torrent(?:[?#]|$)/i.test(url) ||
      /\.torrent(?:[?#]|$)/i.test(filename) ||
      /(?:bittorrent|x-torrent)/i.test(mime)
    );
  }

  function activePendingTabIds(pendingIntents, now = Date.now()) {
    return [...pendingIntents.entries()]
      .filter(([, intent]) => intent && now - intent.createdAt <= INTENT_TTL_MS)
      .sort(([, first], [, second]) => second.createdAt - first.createdAt)
      .map(([tabId]) => tabId)
      .filter(isUsableTabId);
  }

  self.MangaTestNhentaiDownloadCapture = {
    INTENT_TTL_MS,
    isUsableTabId,
    isNhentaiGalleryUrl,
    isNhentaiTorrentDownloadUrl,
    isTorrentDownload,
    activePendingTabIds,
  };
})();
