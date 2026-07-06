const DEFAULT_SETTINGS = {
  serverUrl: "http://127.0.0.1:4317",
  importToken: "",
  siteName: "",
};

const elements = {
  collectButton: document.querySelector("#collect-button"),
  importToken: document.querySelector("#import-token"),
  pageHost: document.querySelector("#page-host"),
  preview: document.querySelector("#preview"),
  previewResources: document.querySelector("#preview-resources"),
  previewTags: document.querySelector("#preview-tags"),
  previewTitle: document.querySelector("#preview-title"),
  serverUrl: document.querySelector("#server-url"),
  siteName: document.querySelector("#site-name"),
  status: document.querySelector("#status"),
  submitButton: document.querySelector("#submit-button"),
};

let activeTab = null;
let collectedMetadata = null;

document.addEventListener("DOMContentLoaded", initializePopup);
elements.collectButton.addEventListener("click", collectFromCurrentTab);
elements.submitButton.addEventListener("click", submitMetadata);

async function initializePopup() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tab ?? null;

  const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
  elements.serverUrl.value = settings.serverUrl || DEFAULT_SETTINGS.serverUrl;
  elements.importToken.value = settings.importToken || "";
  elements.siteName.value = settings.siteName || inferSiteName(activeTab?.url ?? "");
  elements.pageHost.textContent = activeTab?.url ? new URL(activeTab.url).hostname : "没有可采集的页面";

  setStatus("准备采集当前详情页。");
}

async function collectFromCurrentTab() {
  if (!activeTab?.id || !isInjectableUrl(activeTab.url)) {
    setStatus("当前页面不能采集，请打开一个 http/https 漫画详情页。", "error");
    return;
  }

  setBusy(true);
  setStatus("正在采集页面 metadata...");

  try {
    await persistSettings();
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      files: ["src/content/collect-page-metadata.js"],
    });

    collectedMetadata = withPopupFields(result?.result);
    renderPreview(collectedMetadata);
    setStatus("已采集预览，可以提交入库。", "success");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "采集失败。", "error");
  } finally {
    setBusy(false);
  }
}

async function submitMetadata() {
  if (!collectedMetadata) {
    await collectFromCurrentTab();
  }

  if (!collectedMetadata) {
    return;
  }

  setBusy(true);
  setStatus("正在提交到 MangaTest...");

  try {
    await persistSettings();

    const response = await fetch(`${normalizeServerUrl(elements.serverUrl.value)}/api/metadata/import`, {
      method: "POST",
      body: JSON.stringify(collectedMetadata),
      headers: {
        Authorization: `Bearer ${elements.importToken.value.trim()}`,
        "Content-Type": "application/json",
      },
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error || "提交失败。");
    }

    const result = payload.result;
    const status = result.createdComic ? "已创建远程记录" : "已更新漫画 metadata";

    setStatus(`${status}：${result.comicId}`, "success");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "提交失败。", "error");
  } finally {
    setBusy(false);
  }
}

function withPopupFields(metadata) {
  if (!metadata || typeof metadata !== "object") {
    throw new Error("页面没有返回可用 metadata。");
  }

  return {
    ...metadata,
    site: elements.siteName.value.trim() || inferSiteName(activeTab?.url ?? ""),
  };
}

function renderPreview(metadata) {
  elements.preview.hidden = false;
  elements.previewTitle.textContent = metadata.title || "未识别标题";
  elements.previewTags.textContent = String(metadata.tags?.length ?? 0);
  elements.previewResources.textContent = String(metadata.resources?.length ?? 0);
}

async function persistSettings() {
  await chrome.storage.local.set({
    serverUrl: normalizeServerUrl(elements.serverUrl.value),
    importToken: elements.importToken.value.trim(),
    siteName: elements.siteName.value.trim(),
  });
}

function normalizeServerUrl(value) {
  const trimmed = value.trim() || DEFAULT_SETTINGS.serverUrl;
  const url = new URL(trimmed);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("本地服务地址必须是 http 或 https。");
  }

  return url.origin;
}

function inferSiteName(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isInjectableUrl(url) {
  return typeof url === "string" && (url.startsWith("http://") || url.startsWith("https://"));
}

function setBusy(isBusy) {
  elements.collectButton.disabled = isBusy;
  elements.submitButton.disabled = isBusy;
}

function setStatus(message, tone = "") {
  elements.status.textContent = message;
  elements.status.dataset.tone = tone;
}
