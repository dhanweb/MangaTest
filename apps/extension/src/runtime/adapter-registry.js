(() => {
  function definitions() {
    return Array.isArray(window.MangaTestSiteAdapterDefinitions) ? window.MangaTestSiteAdapterDefinitions : [];
  }

  function getCurrentPage() {
    const context = { document, location };

    for (const adapter of definitions()) {
      try {
        if (!adapter.matches(context)) {
          continue;
        }

        const page = adapter.detectPage(context);
        if (page) {
          return { adapter, page };
        }
      } catch (error) {
        console.warn("[MangaTest] 站点适配器识别失败", { adapter: adapter.id, error });
      }
    }

    return null;
  }

  function sameSource(first, second) {
    for (const adapter of definitions()) {
      if (typeof adapter.sameSource !== "function") {
        continue;
      }

      try {
        if (adapter.sameSource(first, second)) {
          return true;
        }
      } catch {
        // Try the next adapter before using the generic source identity fallback.
      }
    }

    return Boolean(first?.sourceId && second?.sourceId && first.sourceId === second.sourceId);
  }

  window.MangaTestAdapterRegistry = {
    definitions,
    getCurrentPage,
    sameSource,
  };
})();
