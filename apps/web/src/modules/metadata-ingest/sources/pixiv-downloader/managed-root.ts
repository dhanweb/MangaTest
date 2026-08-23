import { getRuntimeSettings } from "@/modules/core/settings";
import { createMangaRootRepository } from "@/modules/library/manga-roots.repository";

const PIXIV_ROOT_DISPLAY_NAME = "PixivDownloader 下载目录";

/** 注册或更新 PixivDownloader 的受管 MangaTest 媒体路径，不触碰物理文件。 */
export async function ensurePixivDownloaderMangaRoot(downloadRoot: string) {
  return createMangaRootRepository().ensureManaged({
    absolutePath: downloadRoot,
    displayName: PIXIV_ROOT_DISPLAY_NAME,
    kind: "pixiv",
  });
}

/** 把旧版本已经保存的 Pixiv 下载根目录迁移为受管媒体路径。 */
export async function ensureConfiguredPixivDownloaderMangaRoot() {
  const settings = await getRuntimeSettings();
  const downloadRoot = settings.pixivDownloaderDownloadRoot.trim();
  return downloadRoot ? ensurePixivDownloaderMangaRoot(downloadRoot) : null;
}
