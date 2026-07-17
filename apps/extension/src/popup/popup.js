const elements = {
  serverUrl: document.querySelector("#server-url"),
  importToken: document.querySelector("#import-token"),
  autoDownloadTorrent: document.querySelector("#auto-download-torrent"),
  status: document.querySelector("#status"),
};

document.addEventListener("DOMContentLoaded", initializePopup);
elements.serverUrl.addEventListener("input", autoSave);
elements.importToken.addEventListener("input", autoSave);
elements.autoDownloadTorrent.addEventListener("change", autoSave);

let saveTimer = null;

async function initializePopup() {
  const settings = await chrome.storage.local.get({
    serverUrl: "http://127.0.0.1:4317",
    importToken: "",
    autoDownloadOnTorrentPage: true,
  });
  elements.serverUrl.value = settings.serverUrl || "http://127.0.0.1:4317";
  elements.importToken.value = settings.importToken || "";
  elements.autoDownloadTorrent.checked = settings.autoDownloadOnTorrentPage !== false;
}

async function autoSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const serverUrl = normalizeServerUrl(elements.serverUrl.value);
      const importToken = elements.importToken.value.trim();
      const autoDownloadOnTorrentPage = elements.autoDownloadTorrent.checked;
      await chrome.storage.local.set({ serverUrl, importToken, autoDownloadOnTorrentPage });
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
