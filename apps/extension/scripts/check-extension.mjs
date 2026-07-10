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

const referencedFiles = [
  manifest.action.default_popup,
  manifest.background?.service_worker,
  "src/content/site-adapters.js",
  "src/content/metadata-contract.js",
  "src/content/collect-page-metadata.js",
  "src/popup/popup.css",
  "src/popup/popup.js",
].filter(Boolean);

for (const file of referencedFiles) {
  assert(fs.existsSync(path.join(root, file)), `${file} is missing`);
}

const popupScript = fs.readFileSync(path.join(root, "src/popup/popup.js"), "utf8");
assert(popupScript.includes("src/content/metadata-contract.js"), "popup must inject metadata-contract.js before the collector");

checkFixture({
  file: "test-fixtures/generic-gallery.html",
  url: "https://example.test/gallery/123",
  expected: {
    adapterId: "generic",
    site: "example.test",
    sourceId: "example.test/gallery/123",
    title: "Generic Sample Comic",
    tagCount: 2,
    resourceCount: 1,
  },
});

checkFixture({
  file: "test-fixtures/nhentai-gallery.html",
  url: "https://nhentai.net/g/123/",
  expected: {
    adapterId: "nhentai-gallery",
    site: "nhentai.net",
    sourceId: "nhentai.net/g/123",
    title: "NH Sample Comic",
    originalTitle: "Sample Original Comic",
    tagCount: 2,
    resourceCount: 0,
  },
});

console.log("Extension manifest and collector checks passed.");

function checkFixture({ file, url, expected }) {
  const html = fs.readFileSync(path.join(root, file), "utf8");
  const result = runCollector(html, url);

  assert(result.adapterId === expected.adapterId, `${file} adapterId mismatch`);
  assert(result.site === expected.site, `${file} site mismatch`);
  assert(result.sourceId === expected.sourceId, `${file} sourceId mismatch`);
  assert(result.title === expected.title, `${file} title mismatch`);
  assert((result.originalTitle ?? null) === (expected.originalTitle ?? result.originalTitle ?? null), `${file} originalTitle mismatch`);
  assert(result.tags.length === expected.tagCount, `${file} tag count mismatch`);
  assert(result.resources.length === expected.resourceCount, `${file} resource count mismatch`);
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
  for (const file of ["src/content/site-adapters.js", "src/content/metadata-contract.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
  }

  return vm.runInContext(fs.readFileSync(path.join(root, "src/content/collect-page-metadata.js"), "utf8"), context, {
    filename: "src/content/collect-page-metadata.js",
  });
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
  if (selector === "h1") {
    return elementFromTag(html, "h1", location);
  }

  if (selector === "#info h1") {
    return elementFromTag(sectionById(html, "info"), "h1", location);
  }

  if (selector === "#info h2") {
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

  if (selector === "#tags .tag-container") {
    return blocksByClass(sectionById(html, "tags"), "tag-container").map((block) => createElement("div", {}, block, location));
  }

  if (selector === "#taglist a, .gt, .gtl, .gtw") {
    return parseElements(sectionById(html, "taglist"), "a", location);
  }

  return [];
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
