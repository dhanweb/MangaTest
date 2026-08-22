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

  function collectGallery(context) {
    const tags = [];

    for (const container of context.document.querySelectorAll("#tags .tag-container")) {
      const namespace = cleanText(container.childNodes[0]?.textContent).replace(/:$/, "") || "tag";
      for (const anchor of container.querySelectorAll("a.tag span.name, a.tag")) {
        addTag(tags, namespace, anchor.textContent);
      }
    }

    return {
      adapterId: "nhentai-gallery",
      pageType: "detail",
      site: "nhentai.net",
      sourceId: `nhentai.net${context.location.pathname.replace(/\/+$/, "") || "/"}`,
      sourceUrl: absoluteUrl(context, text(context, 'link[rel="canonical"]', "href")) || context.location.href,
      title: text(context, "#info h1") || text(context, "h1") || context.document.title,
      originalTitle: text(context, "#info h2") || null,
      coverUrl: absoluteUrl(context, text(context, "#cover img", "src") || text(context, '[property="og:image"]', "content")),
      tags,
    };
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
    id: "nhentai",
    matches(context) {
      return /(^|\.)nhentai\.net$/.test(context.location.hostname);
    },
    detectPage(context) {
      if (!this.matches(context)) {
        return null;
      }

      return {
        id: "nhentai-gallery",
        type: "detail",
        capabilities: ["metadata"],
        collect: () => collectGallery(context),
      };
    },
  };

  window.MangaTestSiteAdapterDefinitions = [...(window.MangaTestSiteAdapterDefinitions || []), adapter];
})();
