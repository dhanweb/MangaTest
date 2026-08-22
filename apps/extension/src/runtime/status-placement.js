(() => {
  const DEFAULT_VIEWPORT_PLACEMENT = {
    mode: "viewport",
    top: "16px",
    right: "16px",
    bottom: "auto",
    left: "auto",
  };

  function mount(element, placement, context = {}) {
    const document = context.document || globalThis.document;
    const location = context.location || globalThis.location;
    if (!element || !element.style || !document?.body) {
      return false;
    }

    const resolved = typeof placement === "function" ? placement({ document, location }) : placement;
    if (resolved?.mode === "custom" && typeof resolved.mount === "function") {
      try {
        if (resolved.mount({ element, document, location }) !== false) {
          return true;
        }
      } catch (error) {
        console.warn("[MangaTest] 状态提示自定义挂载失败", error);
      }
    }

    const isExplicitViewport = resolved?.mode === "viewport";
    const viewport = isExplicitViewport ? resolved : DEFAULT_VIEWPORT_PLACEMENT;
    Object.assign(element.style, {
      position: "fixed",
      top: toCssOffset(viewport.top) || (isExplicitViewport ? "auto" : DEFAULT_VIEWPORT_PLACEMENT.top),
      right: toCssOffset(viewport.right) || (isExplicitViewport ? "auto" : DEFAULT_VIEWPORT_PLACEMENT.right),
      bottom: toCssOffset(viewport.bottom) || (isExplicitViewport ? "auto" : DEFAULT_VIEWPORT_PLACEMENT.bottom),
      left: toCssOffset(viewport.left) || (isExplicitViewport ? "auto" : DEFAULT_VIEWPORT_PLACEMENT.left),
    });
    document.body.appendChild(element);
    return true;
  }

  function toCssOffset(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return `${value}px`;
    }

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    return null;
  }

  window.MangaTestStatusPlacement = {
    DEFAULT_VIEWPORT_PLACEMENT,
    mount,
    toCssOffset,
  };
})();
