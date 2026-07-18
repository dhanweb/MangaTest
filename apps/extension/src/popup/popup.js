const elements = {
  serverUrl: document.querySelector("#server-url"),
  importToken: document.querySelector("#import-token"),
  autoDownloadTorrent: document.querySelector("#auto-download-torrent"),
  autoTorrentCount: document.querySelector("#auto-torrent-count"),
  status: document.querySelector("#status"),
};

document.addEventListener("DOMContentLoaded", initializePopup);
elements.serverUrl.addEventListener("input", autoSave);
elements.importToken.addEventListener("input", autoSave);
elements.autoDownloadTorrent.addEventListener("change", autoSave);
elements.autoTorrentCount.addEventListener("input", autoSave);

let saveTimer = null;

function normalizeAutoTorrentSubmitCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(10, Math.trunc(n)));
}

async function initializePopup() {
  const versionEl = document.querySelector("#ext-version");
  if (versionEl) {
    const manifest = chrome.runtime.getManifest();
    versionEl.textContent = `v${manifest.version || "?"}`;
  }

  const settings = await chrome.storage.local.get({
    serverUrl: "http://127.0.0.1:4317",
    importToken: "",
    autoDownloadOnGalleryOpen: false,
    autoDownloadOnTorrentPage: false,
    autoTorrentSubmitCount: 1,
  });
  let auto = settings.autoDownloadOnGalleryOpen === true;
  if (settings.autoDownloadOnGalleryOpen === undefined && settings.autoDownloadOnTorrentPage === true) {
    auto = true;
  }
  elements.serverUrl.value = settings.serverUrl || "http://127.0.0.1:4317";
  elements.importToken.value = settings.importToken || "";
  elements.autoDownloadTorrent.checked = auto;
  elements.autoTorrentCount.value = String(normalizeAutoTorrentSubmitCount(settings.autoTorrentSubmitCount));
}

async function autoSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const serverUrl = normalizeServerUrl(elements.serverUrl.value);
      const importToken = elements.importToken.value.trim();
      const autoDownloadOnGalleryOpen = elements.autoDownloadTorrent.checked;
      const autoTorrentSubmitCount = normalizeAutoTorrentSubmitCount(elements.autoTorrentCount.value);
      elements.autoTorrentCount.value = String(autoTorrentSubmitCount);
      await chrome.storage.local.set({
        serverUrl,
        importToken,
        autoDownloadOnGalleryOpen,
        // keep legacy key in sync for older content-script sessions
        autoDownloadOnTorrentPage: autoDownloadOnGalleryOpen,
        autoTorrentSubmitCount,
      });
      setStatus("✅ 已保存", "success");
    } catch (err) {
      setStatus("❌ " + (err instanceof Error ? err.message : "保存失败"), "error");
    }
  }, 400);
}

function normalizeServerUrl(value) {
  const trimmed = value.trim() || "http://127.0.0.1:4317";
  const url = new URL(trimmed);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("地址必须是 http 或 https");
  return url.origin;
}

function setStatus(message, tone) {
  elements.status.textContent = message;
  elements.status.dataset.tone = tone || "";
}
