const elements = {
  serverUrl: document.querySelector("#server-url"),
  importToken: document.querySelector("#import-token"),
  status: document.querySelector("#status"),
};

document.addEventListener("DOMContentLoaded", initializePopup);
elements.serverUrl.addEventListener("input", autoSave);
elements.importToken.addEventListener("input", autoSave);

let saveTimer = null;

async function initializePopup() {
  const settings = await chrome.storage.local.get({
    serverUrl: "http://127.0.0.1:4317",
    importToken: "",
  });
  elements.serverUrl.value = settings.serverUrl || "http://127.0.0.1:4317";
  elements.importToken.value = settings.importToken || "";
}

async function autoSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const serverUrl = normalizeServerUrl(elements.serverUrl.value);
      const importToken = elements.importToken.value.trim();
      await chrome.storage.local.set({ serverUrl, importToken });
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
