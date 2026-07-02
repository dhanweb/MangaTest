export type ComicStatus = "readable" | "missing_local_file" | "remote_only" | "hidden" | "deleted";

export interface LibraryComicSummary {
  id: string;
  displayTitle: string;
  sortTitle: string;
  status: ComicStatus;
  primaryLocalFileId: string | null;
  lastReadPageId: string | null;
}

export * from "./manga-roots";
export * from "./manga-roots.repository";
export * from "./scan-sessions";
export * from "./scan-sessions.repository";
