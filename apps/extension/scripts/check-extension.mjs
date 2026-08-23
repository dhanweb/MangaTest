import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

assert(manifest.manifest_version === 3, "manifest_version must be 3");
assert(manifest.action?.default_popup, "default popup is required");
assert(Array.isArray(manifest.permissions), "permissions must be an array");
assert(manifest.permissions.includes("activeTab"), "activeTab permission is required");
assert(manifest.permissions.includes("scripting"), "scripting permission is required");
assert(manifest.permissions.includes("storage"), "storage permission is required");
assert(manifest.permissions.includes("downloads"), "downloads permission is required");
assert(manifest.host_permissions?.includes("https://nhentai.net/*"), "nhentai host permission is required");
assert(manifest.host_permissions?.includes("https://*.nhentai.net/*"), "nhentai subdomain host permission is required");
assert(manifest.host_permissions?.includes("https://hanime1.me/*"), "hanime1 host permission is required");
assert(manifest.content_scripts?.some((contentScript) => contentScript.matches?.includes("https://hanime1.me/*")), "hanime1 content script match is required");

const referencedFiles = [
  manifest.action.default_popup,
  manifest.background?.service_worker,
  "src/background/nhentai-download-capture.js",
  "src/runtime/status-placement.js",
  "src/adapters/exhentai/adapter.js",
  "src/adapters/nhentai/adapter.js",
  "src/adapters/hanime1/adapter.js",
  "src/runtime/adapter-registry.js",
  "src/runtime/metadata-contract.js",
  "src/runtime/collector.js",
  "src/backend/client.js",
  "src/features/metadata/submit.js",
  "src/features/download-resources/submit.js",
  "src/features/video/submit.js",
  "src/content/injector.js",
  "src/background/torrent-magnet.js",
  "src/popup/popup.css",
  "src/popup/popup.js",
  ...(manifest.content_scripts || []).flatMap((cs) => cs.js || []),
].filter(Boolean);

for (const file of [...new Set(referencedFiles)]) {
  assert(fs.existsSync(path.join(root, file)), `${file} is missing`);
}

assert(Array.isArray(manifest.content_scripts), "content_scripts must be an array");

checkFixture({
  file: "test-fixtures/generic-gallery.html",
  url: "https://example.test/gallery/123",
  expected: {
    adapterId: "generic",
    pageType: "detail",
    site: "example.test",
    sourceId: "example.test/gallery/123",
    title: "Generic Sample Comic",
    tagCount: 2,
    resourceCount: 0,
  },
});

checkFixture({
  file: "test-fixtures/hanime1-watch.html",
  url: "https://hanime1.me/watch?v=407861",
  expected: {
    adapterId: "hanime1-video",
    pageType: "detail",
    capabilities: ["metadata", "resource-navigation", "video"],
    mediaType: "video",
    site: "hanime1.me",
    sourceId: "hanime1.me/watch?v=407861",
    sourceUrl: "https://hanime1.me/watch?v=407861",
    title: "[Sample Artist] Sample Hanime Video",
    originalTitle: "Sample Hanime Video",
    coverUrl: "https://vdownload.hembed.com/image/thumbnail/407861h.jpg?secure=fixture",
    tagCount: 6,
    resourceCount: 0,
    videoSourceCount: 0,
    durationSeconds: 65,
  },
});

checkFixture({
  file: "test-fixtures/hanime1-download.html",
  url: "https://hanime1.me/download?v=407861",
  expected: {
    adapterId: "hanime1-video-download",
    pageType: "resource",
    capabilities: ["download-resource", "video"],
    mediaType: "video",
    site: "hanime1.me",
    sourceId: "hanime1.me/watch?v=407861",
    sourceUrl: "https://hanime1.me/watch?v=407861",
    title: "[Sample Artist] Sample Hanime Video",
    tagCount: 0,
    resourceCount: 3,
    firstResourceUrl: "https://vdownload.hembed.com/407861-1080p.mp4?secure=fixture",
    videoSourceCount: 3,
  },
});

checkFixture({
  file: "test-fixtures/nhentai-gallery.html",
  url: "https://nhentai.net/g/123/",
  expected: {
    adapterId: "nhentai-gallery",
    pageType: "detail",
    capabilities: ["metadata", "download-resource"],
    site: "nhentai.net",
    sourceId: "nhentai.net/g/123",
    title: "Sample Original Comic",
    originalTitle: "NH Sample Comic",
    tagCount: 2,
    resourceCount: 0,
  },
});

checkFixture({
  file: "test-fixtures/exhentai-gallery.html",
  url: "https://exhentai.org/g/3242017/mock-token/",
  expected: {
    adapterId: "ehentai-gallery",
    pageType: "detail",
    site: "exhentai.org",
    sourceId: "exhentai.org/g/3242017",
    sourceUrl: "https://exhentai.org/g/3242017/mock-token/",
    title: "[sample] The Single Hunter Meets Girl [English]",
    originalTitle: "[sample] 独身ハンターの出逢い [英訳]",
    tagCount: 2,
    resourceCount: 0,
    tags: [
      { namespace: "parody", name: "honkai star rail", displayNameZh: "崩坏：星穹铁道" },
      { namespace: "female", name: "sole female", displayNameZh: "单女主" },
    ],
  },
});

checkFixture({
  file: "test-fixtures/exhentai-torrents.html",
  url: "https://exhentai.org/gallerytorrents.php?gid=3242017&t=mocktoken",
  expected: {
    adapterId: "ehentai-torrents",
    pageType: "resource",
    site: "exhentai.org",
    sourceId: "exhentai.org/g/3242017",
    sourceUrl: "https://exhentai.org/g/3242017/",
    title: "[sample] The Single Hunter Meets Girl [English]",
    tagCount: 0,
    resourceCount: 1,
    firstResourceUrl: "https://exhentai.org/torrent/3242017/mock-download-token/mockhash1.torrent",
  },
});

await checkTorrentMagnet();
checkNhentaiDownloadCapture();
checkStatusPlacement();

console.log("Extension manifest and collector checks passed.");

function checkFixture({ file, url, expected }) {
  const html = fs.readFileSync(path.join(root, file), "utf8");
  const result = runCollector(html, url);

  assert(result.adapterId === expected.adapterId, `${file} adapterId mismatch`);
  assert(result.pageType === expected.pageType, `${file} pageType mismatch`);
  assert(result.site === expected.site, `${file} site mismatch`);
  assert(result.sourceId === expected.sourceId, `${file} sourceId mismatch`);
  assert(result.title === expected.title, `${file} title mismatch`);
  if (expected.sourceUrl) {
    assert(result.sourceUrl === expected.sourceUrl, `${file} sourceUrl mismatch`);
  }
  if (expected.coverUrl) {
    assert(result.coverUrl === expected.coverUrl, `${file} coverUrl mismatch`);
  }
  if (expected.mediaType) {
    assert(result.mediaType === expected.mediaType, `${file} mediaType mismatch`);
  }
  assert((result.originalTitle ?? null) === (expected.originalTitle ?? result.originalTitle ?? null), `${file} originalTitle mismatch`);
  assert(result.tags.length === expected.tagCount, `${file} tag count mismatch`);
  assert(result.resources.length === expected.resourceCount, `${file} resource count mismatch`);
  if (expected.firstResourceUrl) {
    assert(result.resources[0]?.url === expected.firstResourceUrl, `${file} first resource URL mismatch`);
  }
  if (expected.videoSourceCount !== undefined) {
    assert(result.video?.sources?.length === expected.videoSourceCount, `${file} video source count mismatch`);
  }
  if (expected.durationSeconds !== undefined) {
    assert(result.video?.durationSeconds === expected.durationSeconds, `${file} duration mismatch`);
  }
  if (expected.tags) {
    for (const tag of expected.tags) {
      assert(
        result.tags.some(
          (candidate) =>
            candidate.namespace === tag.namespace &&
            candidate.name === tag.name &&
            candidate.displayNameZh === tag.displayNameZh,
        ),
        `${file} missing tag ${tag.namespace}:${tag.name}`,
      );
    }
  }
  if (expected.capabilities) {
    for (const capability of expected.capabilities) {
      assert(result.pageCapabilities.includes(capability), `${file} missing capability ${capability}`);
    }
  }
}

function runCollector(html, url) {
  const location = new URL(url);
  const context = {
    URL,
    location,
    window: {},
    document: createDocument(html, location),
  };

  vm.createContext(context);
  for (const file of [
    "src/adapters/exhentai/adapter.js",
    "src/adapters/nhentai/adapter.js",
    "src/adapters/hanime1/adapter.js",
    "src/runtime/adapter-registry.js",
    "src/runtime/metadata-contract.js",
  ]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
  }

  vm.runInContext(fs.readFileSync(path.join(root, "src/runtime/collector.js"), "utf8"), context, {
    filename: "src/runtime/collector.js",
  });

  const metadata = context.window.MangaTestCollector.normalizeMetadata(context.window.MangaTestCollector.collectPageMetadata());
  const page = context.window.MangaTestCollector.getCurrentPage()?.page;
  return { ...metadata, pageCapabilities: page?.capabilities || [] };
}

function createDocument(html, location) {
  return {
    title: textOfFirst(html, "title") || "",
    images: parseElements(html, "img").map((element) => {
      const src = absoluteUrl(element.getAttribute("src"), location);
      return {
        ...element,
        src,
        currentSrc: src,
        width: Number(element.getAttribute("width") || 240),
        height: Number(element.getAttribute("height") || 320),
        naturalWidth: Number(element.getAttribute("width") || 240),
        naturalHeight: Number(element.getAttribute("height") || 320),
        alt: element.getAttribute("alt") || "",
        className: element.getAttribute("class") || "",
      };
    }),
    querySelector(selector) {
      return querySelector(html, selector, location);
    },
    querySelectorAll(selector) {
      return querySelectorAll(html, selector, location);
    },
  };
}

function querySelector(html, selector, location) {
  if (selector === "#gn") {
    return parseElements(html, "h1", location).find((element) => element.getAttribute("id") === "gn") ?? null;
  }

  if (selector === "#gj") {
    return parseElements(html, "h1", location).find((element) => element.getAttribute("id") === "gj") ?? null;
  }

  if (selector === "h1") {
    return elementFromTag(html, "h1", location);
  }

  const classSelector = /^([a-z0-9]+)\.([a-z0-9_-]+)$/i.exec(selector);
  if (classSelector) {
    return parseElements(html, classSelector[1], location).find((element) => element.className.split(/\s+/).includes(classSelector[2])) ?? null;
  }

  if (/^[a-z0-9]+$/i.test(selector)) {
    return elementFromTag(html, selector, location);
  }

  if (selector === "#gd1 img") {
    return parseElements(sectionById(html, "gd1"), "img", location)[0] ?? null;
  }

  if (selector === "#info > h1" || selector === "#info h1") {
    return elementFromTag(sectionById(html, "info"), "h1", location);
  }

  if (selector === "#info > h2" || selector === "#info h2") {
    return elementFromTag(sectionById(html, "info"), "h2", location);
  }

  if (selector === "#cover img") {
    return parseElements(sectionById(html, "cover"), "img", location)[0] ?? null;
  }

  const attrSelector = /^\[([^=]+)="([^"]+)"\]$/.exec(selector);
  if (attrSelector) {
    return findElementByAttr(html, null, attrSelector[1], attrSelector[2], location);
  }

  const tagAttrSelector = /^([a-z]+)\[([^=]+)="([^"]+)"\]$/.exec(selector);
  if (tagAttrSelector) {
    return findElementByAttr(html, tagAttrSelector[1], tagAttrSelector[2], tagAttrSelector[3], location);
  }

  return null;
}

function querySelectorAll(html, selector, location) {
  if (selector === "a[href]") {
    return parseElements(html, "a", location).filter((element) => Boolean(element.getAttribute("href")));
  }

  if (selector === 'a[href*="/torrent/"]') {
    return parseElements(html, "a", location).filter((element) => element.href.includes("/torrent/"));
  }

  if (selector === 'a[href*="/download"]') {
    return parseElements(html, "a", location).find((element) => element.href.includes("/download")) ?? null;
  }

  if (selector === 'a[href*="tags"]') {
    return parseElements(html, "a", location).filter((element) => element.href.includes("tags"));
  }

  if (selector === "a[data-url]") {
    return parseElements(html, "a", location).filter((element) => Boolean(element.getAttribute("data-url")));
  }

  if (selector === "#tags .tag-container") {
    return blocksByClass(sectionById(html, "tags"), "tag-container").map((block) => createElement("div", {}, block, location));
  }

  if (selector === "#taglist a, .gt, .gtl, .gtw") {
    return parseElements(html, "a", location).filter((element) => element.getAttribute("id")?.startsWith("ta_"));
  }

  return [];
}

async function checkTorrentMagnet() {
  const context = {
    ArrayBuffer,
    Map,
    Set,
    TextDecoder,
    Uint8Array,
    URL,
    crypto: globalThis.crypto,
    encodeURIComponent,
    fetch: async () => {
      throw new Error("Unexpected fetch in torrentToMagnet check");
    },
    self: {},
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, "src/background/torrent-magnet.js"), "utf8"), context, {
    filename: "src/background/torrent-magnet.js",
  });

  const torrent = new TextEncoder().encode("d8:announce14:http://tracker4:infod6:lengthi1e4:name4:demoe5:other4:nopee");
  const magnet = await context.self.MangaTestTorrentMagnet.torrentToMagnet(torrent);

  assert(magnet.startsWith("magnet:?xt=urn%3Abtih%3A"), "torrentToMagnet must produce a btih magnet");
  assert(magnet.includes("dn=demo"), "torrentToMagnet must include torrent name");
  assert(magnet.includes("tr=http%3A%2F%2Ftracker"), "torrentToMagnet must include tracker");
}

function checkNhentaiDownloadCapture() {
  const context = { URL, Date, self: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, "src/background/nhentai-download-capture.js"), "utf8"), context, {
    filename: "src/background/nhentai-download-capture.js",
  });

  const capture = context.self.MangaTestNhentaiDownloadCapture;
  const torrentUrl = "https://i2.nhentai.net/download/4132256?gid=674903&fmt=torrent&sig=mock";
  const zipUrl = "https://i2.nhentai.net/download/4132256?gid=674903&fmt=zip&sig=mock";
  assert(capture.isNhentaiTorrentDownloadUrl(torrentUrl), "nhentai torrent URL must be recognized");
  assert(!capture.isNhentaiTorrentDownloadUrl(zipUrl), "nhentai ZIP URL must be ignored");
  assert(capture.isTorrentDownload({ filename: "" }, torrentUrl), "nhentai torrent URL must identify a torrent");
  assert(capture.isUsableTabId(42), "zero-based Chrome tab IDs must be accepted");
  assert(!capture.isUsableTabId(-1), "unknown Chrome tab IDs must be rejected");

  const pending = new Map([[42, { createdAt: 1000 }]]);
  assert(capture.activePendingTabIds(pending, 1000)[0] === 42, "pending torrent intent must retain its tab ID");
}

function checkStatusPlacement() {
  const context = { self: {}, window: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, "src/runtime/status-placement.js"), "utf8"), context, {
    filename: "src/runtime/status-placement.js",
  });

  const placement = context.window.MangaTestStatusPlacement;
  assert(placement, "status placement runtime must be exposed");

  const document = createPlacementDocument();
  const element = createPlacementElement();
  placement.mount(element, undefined, { document, location: new URL("https://example.test/gallery/1") });
  assert(element.style.position === "fixed", "default status placement must use fixed positioning");
  assert(element.style.top === "16px", "default status placement must use the top-right offset");
  assert(element.style.right === "16px", "default status placement must use the right offset");
  assert(document.body.children.includes(element), "default status placement must append to body");

  const offsetElement = createPlacementElement();
  placement.mount(
    offsetElement,
    { mode: "viewport", top: 40, left: "12%", bottom: "8px" },
    { document, location: new URL("https://example.test/gallery/1") },
  );
  assert(offsetElement.style.top === "40px", "numeric status offsets must become pixels");
  assert(offsetElement.style.left === "12%", "custom left status offset must be preserved");
  assert(offsetElement.style.right === "auto", "unspecified right offset must be reset");

  const customTarget = { children: [], appendChild(elementToMount) { this.children.push(elementToMount); } };
  const customDocument = createPlacementDocument(customTarget);
  const customElement = createPlacementElement();
  let customCalled = false;
  placement.mount(
    customElement,
    {
      mode: "custom",
      mount({ element: elementToMount, document: documentToUse, location }) {
        customCalled = location.hostname === "example.test";
        documentToUse.querySelector(".site-status").appendChild(elementToMount);
        return true;
      },
    },
    { document: customDocument, location: new URL("https://example.test/gallery/1") },
  );
  assert(customCalled, "custom status placement must receive the page context");
  assert(customTarget.children.includes(customElement), "custom status placement must own DOM insertion");

  const fallbackElement = createPlacementElement();
  placement.mount(
    fallbackElement,
    { mode: "custom", mount: () => false },
    { document, location: new URL("https://example.test/gallery/1") },
  );
  assert(document.body.children.includes(fallbackElement), "failed custom placement must fall back to body mounting");
}

function createPlacementDocument(customTarget = null) {
  const body = { children: [], appendChild(element) { this.children.push(element); } };
  return {
    body,
    querySelector: () => customTarget,
  };
}

function createPlacementElement() {
  return { style: {} };
}

function findElementByAttr(html, tag, attrName, attrValue, location) {
  const tagPattern = tag ? tag : "[a-z0-9]+";
  const pattern = new RegExp(`<(${tagPattern})([^>]*)>`, "gi");
  let match;

  while ((match = pattern.exec(html))) {
    const element = createElement(match[1], parseAttributes(match[2]), "", location);
    if (element.getAttribute(attrName) === attrValue) {
      return element;
    }
  }

  return null;
}

function elementFromTag(html, tag, location) {
  return parseElements(html, tag, location)[0] ?? null;
}

function parseElements(html, tag, location) {
  const paired = new RegExp(`<${tag}([^>]*)>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const selfClosing = new RegExp(`<${tag}([^>]*)\\/?\\s*>`, "gi");
  const elements = [];
  let match;

  while ((match = paired.exec(html))) {
    elements.push(createElement(tag, parseAttributes(match[1]), match[2], location));
  }

  if (elements.length === 0 || tag === "img" || tag === "meta" || tag === "link") {
    while ((match = selfClosing.exec(html))) {
      elements.push(createElement(tag, parseAttributes(match[1]), "", location));
    }
  }

  return elements;
}

function createElement(tag, attributes, innerHtml, location) {
  const element = {
    tagName: tag.toUpperCase(),
    textContent: stripTags(innerHtml),
    className: attributes.class || "",
    href: attributes.href ? absoluteUrl(attributes.href, location) : "",
    childNodes: [{ textContent: stripTags(innerHtml.split(/<a\b/i)[0] ?? "") }],
    getAttribute(name) {
      return attributes[name] ?? null;
    },
    querySelectorAll(selector) {
      if (selector === "a.tag span.name, a.tag") {
        const spans = parseElements(innerHtml, "span", location).filter((span) => (span.getAttribute("class") || "").split(/\s+/).includes("name"));
        return spans.length ? spans : parseElements(innerHtml, "a", location);
      }

      return [];
    },
  };

  return element;
}

function parseAttributes(input) {
  const attributes = {};
  const pattern = /([a-zA-Z0-9:-]+)\s*=\s*"([^"]*)"/g;
  let match;

  while ((match = pattern.exec(input))) {
    attributes[match[1]] = match[2];
  }

  return attributes;
}

function sectionById(html, id) {
  const pattern = new RegExp(`<([a-z0-9]+)([^>]*\\sid="${escapeRegExp(id)}"[^>]*)>([\\s\\S]*?)<\\/\\1>`, "i");
  return pattern.exec(html)?.[3] ?? "";
}

function blocksByClass(html, className) {
  const blocks = [];
  const pattern = new RegExp(`<([a-z0-9]+)([^>]*\\bclass="${escapeRegExp(className)}"[^>]*)>([\\s\\S]*?)<\\/\\1>`, "gi");
  let match;

  while ((match = pattern.exec(html))) {
    blocks.push(match[3]);
  }

  return blocks;
}

function textOfFirst(html, tag) {
  return stripTags(elementFromTag(html, tag, new URL("https://example.test"))?.textContent ?? "");
}

function stripTags(input) {
  return input.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function absoluteUrl(value, location) {
  if (!value) {
    return "";
  }

  return new URL(value, location.href).toString();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
