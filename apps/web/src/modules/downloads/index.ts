export type DownloadProvider = "openlist" | "builtin-http" | "aria2";

export interface CreateDownloadTaskInput {
  comicResourceId: string;
  provider: DownloadProvider;
  targetDirectory?: string;
}
