(() => {
  async function submit(metadata) {
    if (metadata?.mediaType !== "video") {
      throw new Error("当前页面不是视频详情页。");
    }

    const sources = metadata.video?.sources;
    if (!Array.isArray(sources) || sources.length === 0) {
      throw new Error("官方下载页没有可用的视频下载地址。");
    }

    return window.MangaTestBackend.submitVideo(metadata);
  }

  window.MangaTestVideoFeature = { submit };
})();
