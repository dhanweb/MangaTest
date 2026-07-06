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
