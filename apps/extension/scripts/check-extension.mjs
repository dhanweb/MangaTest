import fs from "node:fs";
import path from "node:path";
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
  "src/content/collect-page-metadata.js",
  "src/popup/popup.css",
  "src/popup/popup.js",
].filter(Boolean);

for (const file of referencedFiles) {
  assert(fs.existsSync(path.join(root, file)), `${file} is missing`);
}

console.log("Extension manifest check passed.");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
