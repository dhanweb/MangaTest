(() => {
  function cleanText(value) {
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  }

  function text(context, selector, attribute) {
    const element = context.document.querySelector(selector);
    if (!element) return null;
    return attribute ? cleanText(element.getAttribute(attribute)) : cleanText(element.textContent);
  }

  function absoluteUrl(context, value) {
    if (!value) return null;
    try {
      const url = new URL(value, context.location.href);
      return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
    } catch {
      return null;
    }
  }

  function videoId(context) {
    const id = new URL(context.location.href).searchParams.get("v")?.trim() || "";
    return /^\d+$/.test(id) ? id : null;
  }

  function sourceId(context) {
    const id = videoId(context);
    return id ? `hanime1.me/watch?v=${id}` : null;
  }

  function watchUrl(context) {
    const id = videoId(context);
    return id ? `${context.location.origin}/watch?v=${encodeURIComponent(id)}` : context.location.href;
  }

  function collectVideo(context, type) {
    const id = videoId(context);
    if (!id) return null;

    const sources = type === "resource" ? collectDownloadSources(context) : [];
    const tags = type === "detail" ? collectTags(context) : [];
    const duration = Number(text(context, 'meta[property="og:video:duration"]', "content"));
    return {
      adapterId: type === "resource" ? "hanime1-video-download" : "hanime1-video",
      pageType: type,
      mediaType: "video",
      site: "hanime1.me",
      sourceId: sourceId(context),
      sourceUrl: watchUrl(context),
      title: text(context, "h3.video-details-wrapper") || text(context, "h3") || context.document.title,
      originalTitle: text(context, "h4.video-title") || null,
      coverUrl: absoluteUrl(context, text(context, '[property="og:image"]', "content")),
      tags,
      resources: sources.map((source) => ({ type: "http", url: source.url, label: source.label })),
      video: {
        durationSeconds: Number.isFinite(duration) && duration >= 0 ? Math.trunc(duration) : null,
        sources,
      },
    };
  }

  function collectDownloadSources(context) {
    const sources = [];
    const seen = new Set();
    for (const anchor of context.document.querySelectorAll("a[data-url]")) {
      const url = absoluteUrl(context, anchor.getAttribute("data-url"));
      if (!url || seen.has(url)) continue;
      seen.add(url);
      const rawQuality = /-(\d+)p\.mp4(?:$|\?)/i.exec(url)?.[1] || "";
      const quality = Number(rawQuality);
      sources.push({
        url,
        label: rawQuality ? `${rawQuality}p` : "Hanime1 视频下载",
        quality: Number.isFinite(quality) && quality > 0 ? quality : null,
      });
    }
    return sources.sort((left, right) => (right.quality || 0) - (left.quality || 0));
  }

  function collectTags(context) {
    const tags = [];
    for (const anchor of context.document.querySelectorAll('a[href*="tags"]')) {
      const name = cleanText(anchor.textContent).replace(/\s*\(\d+\)\s*$/, "");
      if (name) addTag(tags, "general", name);
    }
    return tags;
  }

  function addTag(tags, namespace, name) {
    const cleanName = cleanText(name).toLowerCase();
    if (!cleanName || tags.some((tag) => tag.namespace === namespace && tag.name === cleanName)) return;
    tags.push({ namespace, name: cleanName, displayNameZh: null });
  }

  function getDownloadAnchors(context) {
    return [...context.document.querySelectorAll("a[data-url]")];
  }

  function extractResourceUrl(context, anchor) {
    return absoluteUrl(context, anchor.getAttribute("data-url"));
  }

  function resourceLabel(anchor) {
    const url = anchor.getAttribute("data-url") || "";
    const match = /(\d+)p/i.exec(url);
    return match?.[1] ? `${match[1]}p` : "Hanime1 视频下载";
  }

  const adapter = {
    id: "hanime1",
    matches(context) {
      return /(^|\.)hanime1\.me$/.test(context.location.hostname);
    },
    detectPage(context) {
      if (!this.matches(context) || !videoId(context)) return null;

      if (/^\/watch\/?$/i.test(context.location.pathname)) {
        return {
          id: "hanime1-video",
          type: "detail",
          capabilities: ["metadata", "resource-navigation", "video"],
          statusPlacement: { mode: "viewport", top: "72px", right: "16px" },
          collect: () => collectVideo(context, "detail"),
          findResourcePageLink: () => context.document.querySelector('a[href*="/download"]'),
        };
      }

      if (/^\/download\/?$/i.test(context.location.pathname)) {
        return {
          id: "hanime1-video-download",
          type: "resource",
          capabilities: ["download-resource", "video"],
          collect: () => collectVideo(context, "resource"),
          getResourceAnchors: () => getDownloadAnchors(context),
          extractResourceUrl: (anchor) => extractResourceUrl(context, anchor),
          resourceType: () => "http",
          resourceLabel,
        };
      }

      return null;
    },
    sameSource(first, second) {
      return Boolean(first?.site === "hanime1.me" && second?.site === "hanime1.me" && first.sourceId && first.sourceId === second.sourceId);
    },
  };

  window.MangaTestSiteAdapterDefinitions = [...(window.MangaTestSiteAdapterDefinitions || []), adapter];
})();
