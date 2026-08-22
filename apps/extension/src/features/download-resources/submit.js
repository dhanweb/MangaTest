(() => {
  async function submit(metadata, resources) {
    const resolvedResources = await window.MangaTestBackend.resolveResources(resources);
    if (resolvedResources.length === 0) {
      throw new Error("没有可用种子/磁链");
    }

    return window.MangaTestBackend.submitDownloadResource(metadata, resolvedResources);
  }

  window.MangaTestDownloadResourceFeature = { submit };
})();
