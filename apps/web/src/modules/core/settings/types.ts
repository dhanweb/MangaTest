export type SettingValueType = "string" | "number" | "boolean" | "json";

export interface SettingDefinition<TValue> {
  key: string;
  label: string;
  description: string;
  valueType: SettingValueType;
  defaultValue: TValue;
}

export interface RuntimeSettings {
  listenHost: string;
  cacheDirectory: string;
  cacheSizeMb: number;
  readerThumbnailTtlDays: number;
  readerPreloadEnabled: boolean;
  readerPreloadAheadPages: number;
  readerThumbnailSidebarDefault: boolean;
  readerImmersiveDefault: boolean;
  themeMode: "system" | "light" | "dark";
  metadataImportToken: string;
  downloadDefaultTargetDirectory: string;
  openlistEnabled: boolean;
  openlistBaseUrl: string;
  openlistToken: string;
  /** 用于 token 过期时服务端自动重新登录（本地自托管）。 */
  openlistUsername: string;
  /** 用于 token 过期时服务端自动重新登录（本地自托管）。 */
  openlistPassword: string;
  /** OpenList 离线下载提交的云端保存路径，如 /115Open/Temp。 */
  openlistOfflineSavePath: string;
  /** OpenList 云端库索引/10008 恢复扫描根路径，如 /115Open/HENTAI/exhentai。 */
  openlistLibraryScanRoot: string;
  aria2Enabled: boolean;
  aria2RpcUrl: string;
  aria2RpcToken: string;
  potplayerExecutablePath?: string;
  /** PixivDownloader SQLite 数据库文件的绝对路径，例如 C:\\Program Files\\PixivDownload\\data\\pixiv_download.db。 */
  pixivDownloaderDbPath: string;
  /** PixivDownloader 下载根目录的绝对路径，用于解析 artworks.folder 中的 {0}。 */
  pixivDownloaderDownloadRoot: string;
  /** PixivDownloader 下载内容对应的 MangaTest 漫画根目录 ID。 */
  pixivDownloaderMangaRootId: string;
}
