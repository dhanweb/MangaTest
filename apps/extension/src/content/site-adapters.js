(() => {
  function cleanText(value) {
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  }

  function text(selector, attribute) {
    const element = document.querySelector(selector);
    if (!element) {
      return null;
    }

    return attribute ? cleanText(element.getAttribute(attribute)) : cleanText(element.textContent);
  }

  function absoluteUrl(value) {
    if (!value) {
      return null;
    }

    try {
      return new URL(value, location.href).toString();
    } catch {
      return null;
    }
  }

  function sourceIdFromPath() {
    return `${location.hostname}${location.pathname.replace(/\/+$/, "") || "/"}`;
  }

  function addTag(tags, namespace, name, displayNameZh) {
    const cleanNamespace = cleanText(namespace).toLowerCase();
    const cleanName = cleanText(name).toLowerCase();

    if (cleanNamespace && cleanName) {
      tags.push({
        namespace: cleanNamespace,
        name: cleanName,
        displayNameZh: cleanText(displayNameZh) || null,
      });
    }
  }

  function eHentaiGalleryAdapter() {
    const tags = [];

    for (const anchor of document.querySelectorAll("#taglist a, .gt, .gtl, .gtw")) {
      const tag = parseEHentaiTag(anchor);
      if (!tag) {
        continue;
      }

      addTag(tags, tag.namespace, tag.name, tag.displayNameZh);
    }

    return {
      adapterId: "ehentai-gallery",
      site: location.hostname.replace(/^www\./, ""),
      sourceId: eHentaiSourceIdFromGalleryPath() || sourceIdFromPath(),
      sourceUrl: absoluteUrl(text('link[rel="canonical"]', "href")) || location.href,
      title: text("#gn") || text("h1") || document.title,
      originalTitle: text("#gj") || null,
      coverUrl: absoluteUrl(text("#gd1 img", "src") || text('[property="og:image"]', "content")),
      tags,
    };
  }

  function eHentaiTorrentAdapter() {
    const gid = new URL(location.href).searchParams.get("gid") || "";
    const resources = [];

    for (const anchor of document.querySelectorAll('a[href*="/torrent/"]')) {
      const torrentUrl = extractEHentaiTorrentUrl(anchor);
      if (!torrentUrl) {
        continue;
      }

      resources.push({
        type: "torrent",
        url: torrentUrl,
        label: cleanText(anchor.textContent) || "ExHentai Torrent",
      });
    }

    return {
      adapterId: "ehentai-torrents",
      site: location.hostname.replace(/^www\./, ""),
      sourceId: gid ? `${location.hostname}/g/${gid}` : sourceIdFromPath(),
      sourceUrl: gid ? `${location.origin}/g/${gid}/` : location.href,
      title: text("h1") || document.title,
      resources,
    };
  }

  function nhentaiAdapter() {
    const tags = [];

    for (const container of document.querySelectorAll("#tags .tag-container")) {
      const namespace = cleanText(container.childNodes[0]?.textContent).replace(/:$/, "") || "tag";
      for (const anchor of container.querySelectorAll("a.tag span.name, a.tag")) {
        addTag(tags, namespace, anchor.textContent);
      }
    }

    return {
      adapterId: "nhentai-gallery",
      site: "nhentai.net",
      sourceId: sourceIdFromPath(),
      sourceUrl: absoluteUrl(text('link[rel="canonical"]', "href")) || location.href,
      title: text("#info h1") || text("h1") || document.title,
      originalTitle: text("#info h2") || null,
      coverUrl: absoluteUrl(text("#cover img", "src") || text('[property="og:image"]', "content")),
      tags,
    };
  }

  window.MangaTestSiteAdapters = [
    {
      id: "ehentai-gallery",
      matches: () => isEHentaiHost() && /^\/g\/\d+\//.test(location.pathname),
      collect: eHentaiGalleryAdapter,
    },
    {
      id: "ehentai-torrents",
      matches: () => isEHentaiHost() && location.pathname.endsWith("/gallerytorrents.php"),
      collect: eHentaiTorrentAdapter,
    },
    {
      id: "nhentai-gallery",
      matches: () => /(^|\.)nhentai\.net$/.test(location.hostname),
      collect: nhentaiAdapter,
    },
  ];

  function isEHentaiHost() {
    return /(^|\.)e-hentai\.org$|(^|\.)exhentai\.org$/.test(location.hostname);
  }

  function eHentaiSourceIdFromGalleryPath() {
    const match = /^\/g\/(\d+)(?:\/|$)/.exec(location.pathname);
    return match?.[1] ? `${location.hostname}/g/${match[1]}` : null;
  }

  function parseEHentaiTag(anchor) {
    const canonical = cleanText(anchor.getAttribute("ehs-tag")) || parseEHentaiTagFromHref(anchor.href) || parseEHentaiTagFromTitle(anchor);
    const namespace = parseEHentaiNamespace(anchor);

    if (!namespace || !canonical) {
      return null;
    }

    return {
      namespace,
      name: canonical.replace(/_/g, " "),
      displayNameZh: anchor.getAttribute("lang") === "zh-hans" ? anchor.textContent : null,
    };
  }

  function parseEHentaiNamespace(anchor) {
    const id = anchor.id || anchor.parentElement?.id || "";
    const idMatch = /(?:ta|td)_([^:]+):/.exec(id);
    if (idMatch?.[1]) {
      return idMatch[1];
    }

    const hrefMatch = /\/tag\/([^:/?#]+):/i.exec(anchor.href);
    if (hrefMatch?.[1]) {
      return hrefMatch[1];
    }

    const title = cleanText(anchor.getAttribute("title"));
    const titleMatch = /^([a-z]):/i.exec(title);
    const titleMap = {
      p: "parody",
      c: "character",
      f: "female",
      m: "male",
      a: "artist",
      g: "group",
      l: "language",
      o: "other",
    };

    return titleMap[titleMatch?.[1]?.toLowerCase()] || "tag";
  }

  function parseEHentaiTagFromHref(href) {
    try {
      const match = /\/tag\/[^:]+:([^/?#]+)/i.exec(href);
      return match?.[1] ? decodeURIComponent(match[1].replace(/\+/g, " ")) : null;
    } catch {
      return null;
    }
  }

  function parseEHentaiTagFromTitle(anchor) {
    const title = cleanText(anchor.getAttribute("title"));
    const match = /^[a-z]:\s*(.+)$/i.exec(title);
    return match?.[1] || null;
  }

  function extractEHentaiTorrentUrl(anchor) {
    const onclick = anchor.getAttribute("onclick") || "";
    const onclickMatch = /document\.location\s*=\s*['"]([^'"]+\.torrent[^'"]*)['"]/i.exec(onclick);
    const raw = onclickMatch?.[1] || anchor.getAttribute("href");

    return absoluteUrl(raw);
  }
})();
