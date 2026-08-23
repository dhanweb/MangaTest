(() => {
  const RESOURCE_TYPES = new Set(["magnet", "torrent", "http", "openlist"]);

  function cleanText(value) {
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  }

  function normalizeUrl(value, baseUrl) {
    const text = cleanText(value);
    if (!text) {
      return null;
    }

    try {
      const url = new URL(text, baseUrl);
      return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
    } catch {
      return null;
    }
  }

  function normalizeMetadataPayload(input, baseUrl = location.href) {
    if (!input || typeof input !== "object") {
      throw new Error("页面没有返回可用 metadata。");
    }

    const sourceUrl = normalizeUrl(input.sourceUrl, baseUrl);
    const title = cleanText(input.title);
    const site = cleanText(input.site).toLowerCase();

    if (!site || !sourceUrl || !title) {
      throw new Error("metadata 缺少站点、来源 URL 或标题。");
    }

    return {
      adapterId: cleanText(input.adapterId) || "generic",
      pageType: cleanText(input.pageType) || "detail",
      mediaType: input.mediaType === "video" ? "video" : "manga",
      site,
      sourceId: cleanText(input.sourceId) || null,
      sourceUrl,
      title,
      originalTitle: cleanText(input.originalTitle) || null,
      coverUrl: normalizeUrl(input.coverUrl, baseUrl),
      tags: normalizeTags(input.tags),
      resources: normalizeResources(input.resources, baseUrl),
      video: input.mediaType === "video" ? normalizeVideo(input.video, baseUrl) : null,
    };
  }

  function normalizeVideo(input, baseUrl) {
    const duration = Number(input?.durationSeconds);
    const sources = [];
    const seen = new Set();

    for (const source of Array.isArray(input?.sources) ? input.sources : []) {
      const url = normalizeUrl(source?.url, baseUrl);
      if (!url || seen.has(url)) {
        continue;
      }

      seen.add(url);
      const quality = Number(source?.quality);
      sources.push({
        url,
        label: cleanText(source?.label) || "视频直链",
        quality: Number.isFinite(quality) && quality > 0 ? Math.trunc(quality) : null,
      });
    }

    return {
      durationSeconds: Number.isFinite(duration) && duration >= 0 ? Math.trunc(duration) : null,
      sources: sources.slice(0, 8),
    };
  }

  function normalizeTags(input) {
    const tags = [];
    const seen = new Set();

    for (const tag of Array.isArray(input) ? input : []) {
      const namespace = cleanText(tag?.namespace).toLowerCase();
      const name = cleanText(tag?.name).toLowerCase();
      const key = `${namespace}:${name}`;

      if (namespace && name && !seen.has(key)) {
        seen.add(key);
        tags.push({
          namespace,
          name,
          displayNameZh: cleanText(tag?.displayNameZh) || null,
        });
      }
    }

    return tags.slice(0, 80);
  }

  function normalizeResources(input, baseUrl) {
    const resources = [];
    const seen = new Set();

    for (const resource of Array.isArray(input) ? input : []) {
      const type = cleanText(resource?.type).toLowerCase();
      const url = type === "magnet" ? cleanText(resource?.url) : normalizeUrl(resource?.url, baseUrl);
      const key = `${type}:${url}`;

      if (RESOURCE_TYPES.has(type) && url && !seen.has(key)) {
        seen.add(key);
        resources.push({ type, url, label: cleanText(resource?.label) || type });
      }
    }

    return resources.slice(0, 16);
  }

  window.MangaTestMetadataContract = { normalizeMetadataPayload };
})();
