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

  function addTag(tags, namespace, name) {
    const cleanNamespace = cleanText(namespace).toLowerCase();
    const cleanName = cleanText(name).toLowerCase();

    if (cleanNamespace && cleanName) {
      tags.push({ namespace: cleanNamespace, name: cleanName });
    }
  }

  function eHentaiAdapter() {
    const tags = [];

    for (const anchor of document.querySelectorAll("#taglist a, .gt, .gtl, .gtw")) {
      const raw = cleanText(anchor.textContent);
      if (!raw) {
        continue;
      }

      const [namespace, name] = raw.includes(":") ? raw.split(/:(.*)/, 2) : ["tag", raw];
      addTag(tags, namespace, name);
    }

    return {
      adapterId: "ehentai-gallery",
      site: location.hostname.replace(/^www\./, ""),
      sourceId: sourceIdFromPath(),
      sourceUrl: absoluteUrl(text('link[rel="canonical"]', "href")) || location.href,
      title: text("#gn") || text("h1") || document.title,
      originalTitle: text("#gj") || null,
      coverUrl: absoluteUrl(text("#gd1 img", "src") || text('[property="og:image"]', "content")),
      tags,
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
      matches: () => /(^|\.)e-hentai\.org$|(^|\.)exhentai\.org$/.test(location.hostname),
      collect: eHentaiAdapter,
    },
    {
      id: "nhentai-gallery",
      matches: () => /(^|\.)nhentai\.net$/.test(location.hostname),
      collect: nhentaiAdapter,
    },
  ];
})();
