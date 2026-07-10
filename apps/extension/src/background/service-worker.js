importScripts("torrent-magnet.js");

chrome.runtime.onInstalled.addListener(async () => {
  const defaults = {
    serverUrl: "http://127.0.0.1:4317",
    importToken: "",
    siteName: "",
  };
  const current = await chrome.storage.local.get(defaults);

  await chrome.storage.local.set({
    ...defaults,
    ...current,
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "MANGATEST_RESOLVE_TORRENTS") {
    return false;
  }

  resolveTorrentResources(message.resources)
    .then((resources) => sendResponse({ ok: true, resources }))
    .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "种子转换失败。" }));

  return true;
});

async function resolveTorrentResources(resources) {
  const input = Array.isArray(resources) ? resources : [];
  const resolved = [];

  for (const resource of input) {
    if (!resource || resource.type !== "torrent" || typeof resource.url !== "string") {
      continue;
    }

    const magnet = await self.MangaTestTorrentMagnet.fetchTorrentAsMagnet(resource.url);
    resolved.push({
      type: "magnet",
      url: magnet,
      label: resource.label || "Magnet",
    });
  }

  return resolved;
}
