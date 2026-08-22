(() => {
  const MAX_TAGS = 80;
  const MAX_RESOURCES = 16;

  function collectPageMetadata() {
    const currentPage = getCurrentPage();
    const adapterMetadata = collectWithSiteAdapter(currentPage);
    const sourceUrl = getCanonicalUrl();
    const title = firstText([
      selectText("h1"),
      selectText('[property="og:title"]', "content"),
      selectText('[name="twitter:title"]', "content"),
      document.title,
    ]);
    const genericMetadata = {
      adapterId: currentPage?.page?.id || "generic",
      pageType: currentPage?.page?.type || "detail",
      site: location.hostname.replace(/^www\./, ""),
      sourceUrl,
      sourceId: createSourceId(sourceUrl),
      title: title || sourceUrl,
      originalTitle: title || null,
      coverUrl: firstUrl([
        selectText('[property="og:image"]', "content"),
        selectText('[name="twitter:image"]', "content"),
        selectText('link[rel="image_src"]', "href"),
        findLikelyCoverImage(),
      ]),
      tags: collectTags(),
      resources: [],
    };

    return mergeMetadata(genericMetadata, adapterMetadata);
  }

  function getCurrentPage() {
    return window.MangaTestAdapterRegistry?.getCurrentPage() || null;
  }

  function collectWithSiteAdapter(currentPage = getCurrentPage()) {
    if (!currentPage?.page || typeof currentPage.page.collect !== "function") {
      return null;
    }

    try {
      return currentPage.page.collect();
    } catch (error) {
      console.warn("[MangaTest] 页面适配器采集失败", { adapter: currentPage.page.id, error });
      return { adapterId: currentPage.page.id, pageType: currentPage.page.type };
    }
  }

  function mergeMetadata(genericMetadata, adapterMetadata) {
    if (!adapterMetadata) {
      return genericMetadata;
    }

    return {
      ...genericMetadata,
      ...pickPresent(adapterMetadata, ["adapterId", "pageType", "site", "sourceUrl", "sourceId", "title", "originalTitle", "coverUrl"]),
      tags: mergeTags(adapterMetadata.tags, genericMetadata.tags),
      resources: mergeResources(adapterMetadata.resources, genericMetadata.resources),
    };
  }

  function pickPresent(input, keys) {
    const output = {};

    for (const key of keys) {
      if (typeof input[key] === "string" && input[key].trim()) {
        output[key] = input[key].trim();
      }
    }

    return output;
  }

  function mergeTags(primary = [], fallback = []) {
    const tags = new Map();

    for (const tag of primary.length > 0 ? primary : fallback) {
      if (!tag?.namespace || !tag?.name) {
        continue;
      }
      addTag(tags, tag.namespace, tag.name, tag.displayNameZh);
    }

    return Array.from(tags.values()).slice(0, MAX_TAGS);
  }

  function mergeResources(primary = [], fallback = []) {
    const resources = new Map();

    for (const resource of [...primary, ...fallback]) {
      if (!resource?.type || !resource?.url) {
        continue;
      }
      addResource(resources, resource.type, resource.url, resource.label);
    }

    return Array.from(resources.values()).slice(0, MAX_RESOURCES);
  }

  function collectTags() {
    const tags = new Map();
    const keywords = selectText('meta[name="keywords"]', "content");

    if (keywords) {
      for (const keyword of keywords.split(",")) {
        addTag(tags, "tag", keyword);
      }
    }

    for (const anchor of document.querySelectorAll("a[href]")) {
      const text = cleanText(anchor.textContent);
      const href = anchor.href.toLowerCase();
      const rel = [anchor.getAttribute("rel"), anchor.className, anchor.getAttribute("data-tag"), anchor.getAttribute("data-namespace")]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const signal = `${href} ${rel}`;

      if (!text || text.length > 80) {
        continue;
      }

      if (hasAny(signal, ["artist", "author", "creator"])) {
        addTag(tags, "artist", text);
        continue;
      }

      if (hasAny(signal, ["group", "circle", "team"])) {
        addTag(tags, "group", text);
        continue;
      }

      if (hasAny(signal, ["tag", "tags", "category", "genre", "parody", "character", "female", "male", "language"])) {
        addTag(tags, inferNamespace(signal), text);
      }
    }

    return Array.from(tags.values()).slice(0, MAX_TAGS);
  }

  function addTag(tags, namespace, name, displayNameZh) {
    const cleanName = cleanText(name).toLowerCase();
    const cleanNamespace = cleanText(namespace).toLowerCase();

    if (!cleanNamespace || !cleanName || cleanName.length < 2) {
      return;
    }

    const key = `${cleanNamespace}:${cleanName}`;
    if (!tags.has(key)) {
      tags.set(key, {
        namespace: cleanNamespace,
        name: cleanName,
        displayNameZh: cleanText(displayNameZh) || null,
      });
    }
  }

  function addResource(resources, type, url, label) {
    const key = `${type}:${url}`;

    if (!resources.has(key)) {
      resources.set(key, {
        type,
        url,
        label: cleanText(label) || type,
      });
    }
  }

  function inferNamespace(signal) {
    for (const namespace of ["female", "male", "character", "parody", "language", "category"]) {
      if (signal.includes(namespace)) {
        return namespace;
      }
    }

    return "tag";
  }

  function findLikelyCoverImage() {
    const images = Array.from(document.images)
      .map((image) => ({
        src: image.currentSrc || image.src,
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
        alt: image.alt || "",
        className: String(image.className || ""),
      }))
      .filter((image) => image.src && image.width >= 120 && image.height >= 120);

    images.sort((a, b) => coverScore(b) - coverScore(a));
    return images[0]?.src ?? null;
  }

  function coverScore(image) {
    const words = `${image.alt} ${image.className} ${image.src}`.toLowerCase();
    const aspectScore = image.height >= image.width ? 10 : 0;
    const nameScore = hasAny(words, ["cover", "poster", "thumb", "thumbnail"]) ? 20 : 0;

    return image.width * image.height + aspectScore + nameScore;
  }

  function getCanonicalUrl() {
    return firstUrl([selectText('link[rel="canonical"]', "href"), location.href]) || location.href;
  }

  function createSourceId(url) {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, "") || "/";
    return `${parsed.hostname}${path}`;
  }

  function selectText(selector, attribute) {
    const element = document.querySelector(selector);

    if (!element) {
      return null;
    }

    return attribute ? element.getAttribute(attribute) : element.textContent;
  }

  function firstText(values) {
    for (const value of values) {
      const text = cleanText(value);
      if (text) {
        return text;
      }
    }

    return null;
  }

  function firstUrl(values) {
    for (const value of values) {
      const text = cleanText(value);
      if (text && isHttpUrl(text)) {
        return new URL(text, location.href).toString();
      }
    }

    return null;
  }

  function isHttpUrl(value) {
    try {
      const url = new URL(value, location.href);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }

  function hasAny(input, needles) {
    return needles.some((needle) => input.includes(needle));
  }

  function cleanText(value) {
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  }

  window.MangaTestCollector = {
    collectPageMetadata,
    collectWithSiteAdapter,
    getCurrentPage,
    mergeMetadata,
    normalizeMetadata: (metadata) => window.MangaTestMetadataContract?.normalizeMetadataPayload(metadata) ?? metadata,
    sameSource: (first, second) => window.MangaTestAdapterRegistry?.sameSource(first, second) ?? false,
  };
})();
