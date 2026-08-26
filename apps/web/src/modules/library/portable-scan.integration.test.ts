import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("portable manga scan identity", () => {
  afterEach(() => {
    delete process.env.MANGATEST_DB_PATH;
    delete process.env.MANGATEST_PATH_PROFILE;
  });

  it("keeps local-file, comic, chapter, and page IDs when the root location changes profile", async () => {
    vi.resetModules();

    const workspace = path.join(process.cwd(), `.tmp-portable-scan-${randomUUID()}`);
    const sourcePath = path.join(workspace, "source");
    const targetPath = path.join(workspace, "target");
    const sourceComicPath = path.join(sourcePath, "Portable Comic");
    const targetComicPath = path.join(targetPath, "Portable Comic");
    const sourceZipPath = path.join(sourcePath, "Archive Zip.zip");
    const targetZipPath = path.join(targetPath, "Archive Zip.zip");
    const sourceCbzPath = path.join(sourcePath, "Archive Cbz.cbz");
    const targetCbzPath = path.join(targetPath, "Archive Cbz.cbz");
    const dbPath = path.join(workspace, "test.sqlite");
    const sourceProfile = process.platform === "win32" ? "windows" : "linux";
    const targetProfile = "wsl";
    const jpegFixture = await sharp({
      create: { width: 8, height: 12, channels: 3, background: "#ef3b91" },
    })
      .jpeg()
      .toBuffer();

    await mkdir(sourceComicPath, { recursive: true });
    await mkdir(targetComicPath, { recursive: true });
    await writeFile(path.join(sourceComicPath, "001.jpg"), jpegFixture);
    await writeFile(path.join(targetComicPath, "001.jpg"), jpegFixture);
    const archiveFixture = createStoredZip([{ name: "001.jpg", data: jpegFixture }]);
    await writeFile(sourceZipPath, archiveFixture);
    await writeFile(targetZipPath, archiveFixture);
    await writeFile(sourceCbzPath, archiveFixture);
    await writeFile(targetCbzPath, archiveFixture);

    process.env.MANGATEST_DB_PATH = dbPath;
    process.env.MANGATEST_PATH_PROFILE = sourceProfile;

    const { getDb, getSqlite, chapters, comics, localFiles, pages } = await import("../core/db");
    const { createMangaRootLocationRepository } = await import("../local-files/manga-root-locations.repository");
    const { readReaderPageImage } = await import("../reader/page-images");
    const { createMangaRootRepository } = await import("./manga-roots.repository");
    const { scanMangaRoot } = await import("./scan-library-root");

    const root = await createMangaRootRepository().create({ absolutePath: sourcePath, displayName: "Portable" });
    const firstScan = await scanMangaRoot(root.id);
    expect(firstScan.addedCount).toBe(3);

    const before = {
      comics: getDb().select({ id: comics.id }).from(comics).all().map((row) => row.id).sort(),
      localFiles: getDb().select({ id: localFiles.id, relativePath: localFiles.relativePath }).from(localFiles).all().sort((left, right) => left.relativePath.localeCompare(right.relativePath)),
      chapters: getDb().select({ id: chapters.id }).from(chapters).all().map((row) => row.id).sort(),
      pages: getDb().select({ id: pages.id }).from(pages).all().map((row) => row.id).sort(),
    };
    const pageId = before.pages[0];
    expect(pageId).toBeTruthy();
    if (!pageId) {
      throw new Error("扫描没有创建页面记录。");
    }
    await expect(readReaderPageImage(pageId)).resolves.toMatchObject({ contentType: "image/jpeg" });

    process.env.MANGATEST_PATH_PROFILE = targetProfile;
    const targetLocationPath = toHostPortableAbsolutePath(targetPath);
    createMangaRootLocationRepository().upsert({
      mangaRootId: root.id,
      runtimeProfile: targetProfile,
      absolutePath: targetLocationPath,
    });

    const secondScan = await scanMangaRoot(root.id);
    const after = {
      comics: getDb().select({ id: comics.id }).from(comics).all().map((row) => row.id).sort(),
      localFiles: getDb().select({ id: localFiles.id, absolutePath: localFiles.absolutePath, relativePath: localFiles.relativePath }).from(localFiles).all().sort((left, right) => left.relativePath.localeCompare(right.relativePath)),
      chapters: getDb().select({ id: chapters.id }).from(chapters).all().map((row) => row.id).sort(),
      pages: getDb().select({ id: pages.id }).from(pages).all().map((row) => row.id).sort(),
    };

    expect(secondScan.addedCount).toBe(0);
    expect(after.comics).toEqual(before.comics);
    expect(after.localFiles.map((row) => ({ id: row.id, relativePath: row.relativePath }))).toEqual(before.localFiles);
    expect(after.localFiles.every((row) => row.absolutePath.replaceAll("\\", "/").startsWith(targetLocationPath.replaceAll("\\", "/")))).toBe(true);
    expect(after.chapters).toEqual(before.chapters);
    expect(after.pages).toEqual(before.pages);
    await expect(readReaderPageImage(pageId)).resolves.toMatchObject({ contentType: "image/jpeg" });

    getSqlite().close();
    await rm(workspace, { recursive: true, force: true });
  });
});

function toHostPortableAbsolutePath(nativePath: string) {
  if (process.platform !== "win32") {
    return nativePath;
  }

  const driveRoot = path.parse(nativePath).root;
  return `/${path.relative(driveRoot, nativePath).replaceAll("\\", "/")}`;
}

function createStoredZip(entries: Array<{ name: string; data: Buffer }>) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name);
    const crc = crc32(entry.data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(entry.data.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localParts.push(localHeader, nameBuffer, entry.data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(entry.data.length, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBuffer);
    offset += localHeader.length + nameBuffer.length + entry.data.length;
  }

  const endOfCentralDirectory = Buffer.alloc(22);
  const centralDirectoryOffset = offset;
  const centralDirectorySize = centralParts.reduce((size, part) => size + part.length, 0);
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(entries.length, 8);
  endOfCentralDirectory.writeUInt16LE(entries.length, 10);
  endOfCentralDirectory.writeUInt32LE(centralDirectorySize, 12);
  endOfCentralDirectory.writeUInt32LE(centralDirectoryOffset, 16);

  return Buffer.concat([...localParts, ...centralParts, endOfCentralDirectory]);
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});
