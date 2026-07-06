(() => {
  const MAX_TAGS = 80;
  const MAX_RESOURCES = 16;

  function collectPageMetadata() {
    const sourceUrl = getCanonicalUrl();
    const title = firstText([
      selectText("h1"),
      selectText('[property="og:title"]', "content"),
      selectText('[name="twitter:title"]', "content"),
      document.title,
    ]);
    const coverUrl = firstUrl([
      selectText('[property="og:image"]', "content"),
      selectText('[name="twitter:image"]', "content"),
      selectText('link[rel="image_src"]', "href"),
      findLikelyCoverImage(),
    ]);

    return {
      sourceUrl,
      sourceId: createSourceId(sourceUrl),
      title: title || sourceUrl,
      originalTitle: title || null,
      coverUrl,
      tags: collectTags(),
      resources: collectResources(),
    };
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

  function collectResources() {
    const resources = new Map();

    for (const anchor of document.querySelectorAll("a[href]")) {
      const href = anchor.href.trim();
      const lowerHref = href.toLowerCase();
      const label = cleanText(anchor.textContent) || anchor.getAttribute("download") || null;

      if (lowerHref.startsWith("magnet:?")) {
        addResource(resources, "magnet", href, label || "Magnet");
        continue;
      }

      if (lowerHref.endsWith(".torrent") || lowerHref.includes("/torrent/")) {
        addResource(resources, "torrent", href, label || "Torrent");
        continue;
      }

      if (isHttpUrl(href) && looksLikeDownload(anchor, lowerHref)) {
        addResource(resources, "http", href, label || "Download");
      }
    }

    return Array.from(resources.values()).slice(0, MAX_RESOURCES);
  }

  function addTag(tags, namespace, name) {
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

  function looksLikeDownload(anchor, lowerHref) {
    const text = cleanText(anchor.textContent).toLowerCase();
    const download = anchor.getAttribute("download");

    return Boolean(
      download ||
        hasAny(text, ["download", "下载"]) ||
        hasAny(lowerHref, [".zip", ".cbz", "/download", "download=", "dl="]),
    );
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

  return collectPageMetadata();
})();
