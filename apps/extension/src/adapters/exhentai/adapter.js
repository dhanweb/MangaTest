(() => {
  function cleanText(value) {
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  }

  function text(context, selector, attribute) {
    const element = context.document.querySelector(selector);
    if (!element) {
      return null;
    }

    return attribute ? cleanText(element.getAttribute(attribute)) : cleanText(element.textContent);
  }

  function absoluteUrl(context, value) {
    if (!value) {
      return null;
    }

    try {
      return new URL(value, context.location.href).toString();
    } catch {
      return null;
    }
  }

  function siteFromLocation(context) {
    return context.location.hostname.replace(/^www\./, "");
  }

  function sourceIdFromPath(context) {
    return `${siteFromLocation(context)}${context.location.pathname.replace(/\/+$/, "") || "/"}`;
  }

  function isEHentaiHost(context) {
    return /(^|\.)e-hentai\.org$|(^|\.)exhentai\.org$/.test(context.location.hostname);
  }

  function gallerySourceId(context) {
    const match = /^\/g\/(\d+)(?:\/|$)/.exec(context.location.pathname);
    return match?.[1] ? `${siteFromLocation(context)}/g/${match[1]}` : null;
  }

  function collectGallery(context) {
    const tags = [];

    for (const anchor of context.document.querySelectorAll("#taglist a, .gt, .gtl, .gtw")) {
      const tag = parseTag(anchor);
      if (!tag) {
        continue;
      }

      addTag(tags, tag.namespace, tag.name, tag.displayNameZh);
    }

    return {
      adapterId: "ehentai-gallery",
      pageType: "detail",
      site: siteFromLocation(context),
      sourceId: gallerySourceId(context) || sourceIdFromPath(context),
      sourceUrl: absoluteUrl(context, text(context, 'link[rel="canonical"]', "href")) || context.location.href,
      title: text(context, "#gn") || text(context, "h1") || context.document.title,
      originalTitle: text(context, "#gj") || null,
      coverUrl: absoluteUrl(context, text(context, "#gd1 img", "src") || text(context, '[property="og:image"]', "content")),
      tags,
    };
  }

  function collectTorrents(context) {
    const gid = new URL(context.location.href).searchParams.get("gid") || "";
    const resources = [];

    for (const anchor of context.document.querySelectorAll('a[href*="/torrent/"]')) {
      const torrentUrl = extractTorrentUrl(context, anchor);
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
      pageType: "resource",
      site: siteFromLocation(context),
      sourceId: gid ? `${siteFromLocation(context)}/g/${gid}` : sourceIdFromPath(context),
      sourceUrl: gid ? `${context.location.origin}/g/${gid}/` : context.location.href,
      title: text(context, "h1") || context.document.title,
      resources,
    };
  }

  function findResourcePageLink(context) {
    const preferred = context.document.querySelector("#gd5 > p:nth-child(3) > a");
    if (preferred) {
      return preferred;
    }

    const byHref = context.document.querySelector('#gd5 a[href*="gallerytorrents.php"], a[href*="gallerytorrents.php"]');
    if (byHref) {
      return byHref;
    }

    return [...context.document.querySelectorAll("#gd5 a, #gd5 p a")].find((element) => {
      const onclick = element.getAttribute("onclick") || "";
      return /gallerytorrents/i.test(onclick) || /gallerytorrents/i.test(element.getAttribute("href") || "");
    }) || null;
  }

  function getResourceAnchors(context) {
    return [...context.document.querySelectorAll('a[href*="/torrent/"]')];
  }

  function extractTorrentUrl(context, anchor) {
    const onclick = anchor.getAttribute("onclick") || "";
    const match = /document\.location\s*=\s*['"]([^'"]+\.torrent[^'"]*)['"]/i.exec(onclick);
    const raw = match?.[1] || anchor.getAttribute("href") || anchor.href;

    return absoluteUrl(context, raw);
  }

  function sameSource(first, second) {
    if (!first || !second) {
      return false;
    }

    const sourceText = (value) => String(value?.site || value?.sourceId || value?.sourceUrl || "");
    if (!/(^|[/.])(?:e-hentai|exhentai)\.org/i.test(sourceText(first)) || !/(^|[/.])(?:e-hentai|exhentai)\.org/i.test(sourceText(second))) {
      return false;
    }

    if (first.sourceId && second.sourceId && first.sourceId === second.sourceId) {
      return true;
    }

    const gidOf = (value) => {
      const id = String(value?.sourceId || value?.sourceUrl || "");
      return /\/g\/(\d+)/.exec(id)?.[1] || null;
    };

    return Boolean(gidOf(first) && gidOf(first) === gidOf(second));
  }

  function parseTag(anchor) {
    const canonical =
      cleanText(anchor.getAttribute("ehs-tag")) || parseTagFromHref(anchor.href) || parseTagFromTitle(anchor);
    const namespace = parseNamespace(anchor);

    if (!namespace || !canonical) {
      return null;
    }

    return {
      namespace,
      name: canonical.replace(/_/g, " "),
      displayNameZh: anchor.getAttribute("lang") === "zh-hans" ? anchor.textContent : null,
    };
  }

  function parseNamespace(anchor) {
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

  function parseTagFromHref(href) {
    try {
      const match = /\/tag\/[^:]+:([^/?#]+)/i.exec(href);
      return match?.[1] ? decodeURIComponent(match[1].replace(/\+/g, " ")) : null;
    } catch {
      return null;
    }
  }

  function parseTagFromTitle(anchor) {
    const title = cleanText(anchor.getAttribute("title"));
    return /^[a-z]:\s*(.+)$/i.exec(title)?.[1] || null;
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

  const adapter = {
    id: "exhentai",
    matches(context) {
      return isEHentaiHost(context);
    },
    detectPage(context) {
      if (!isEHentaiHost(context)) {
        return null;
      }

      if (/^\/g\/\d+(?:\/|$)/.test(context.location.pathname)) {
        return {
          id: "ehentai-gallery",
          type: "detail",
          capabilities: ["metadata", "resource-navigation"],
          collect: () => collectGallery(context),
          findResourcePageLink: () => findResourcePageLink(context),
          sameSource,
        };
      }

      if (context.location.pathname.endsWith("/gallerytorrents.php")) {
        return {
          id: "ehentai-torrents",
          type: "resource",
          capabilities: ["download-resource"],
          collect: () => collectTorrents(context),
          getResourceAnchors: () => getResourceAnchors(context),
          extractResourceUrl: (anchor) => extractTorrentUrl(context, anchor),
          resourceType: () => "torrent",
          resourceLabel: (anchor) => cleanText(anchor.textContent) || "Torrent",
          sameSource,
        };
      }

      return null;
    },
    sameSource,
  };

  window.MangaTestSiteAdapterDefinitions = [...(window.MangaTestSiteAdapterDefinitions || []), adapter];
})();
