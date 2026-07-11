import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(root, "dist");
const manifestPath = path.join(root, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const version = manifest.version || "0.1.0";
const zipName = `MangaTest-Extension-v${version}.zip`;

fs.mkdirSync(distDir, { recursive: true });

// Collect all files to include
const files = [
  "manifest.json",
  "src/popup/popup.html",
  "src/popup/popup.css",
  "src/popup/popup.js",
  "src/background/service-worker.js",
  "src/background/torrent-magnet.js",
  "src/content/site-adapters.js",
  "src/content/metadata-contract.js",
  "src/content/collect-page-metadata.js",
  "src/content/injector.js",
];

// Copy files to temp dir
const tmpDir = fs.mkdtempSync(path.join(root, ".tmp-build-"));
for (const file of files) {
  const src = path.join(root, file);
  const dest = path.join(tmpDir, file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

// Zip
const zipPath = path.join(distDir, zipName);
const { execSync } = await import("node:child_process");
execSync(`powershell -Command "Compress-Archive -Path '${tmpDir}\\*' -DestinationPath '${zipPath}' -Force"`);

// Cleanup
fs.rmSync(tmpDir, { recursive: true, force: true });

console.log(`✅ 生产构建完成: ${zipPath}`);
console.log(`   版本: v${version}`);
console.log(`   令牌验证: 默认跳过（留空即可）`);