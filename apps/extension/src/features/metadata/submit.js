(() => {
  function submit(metadata) {
    return window.MangaTestBackend.submitMetadata({ ...metadata, resources: [] });
  }

  window.MangaTestMetadataFeature = { submit };
})();
