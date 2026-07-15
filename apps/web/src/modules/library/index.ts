export type ComicStatus = "readable" | "missing_local_file" | "remote_only" | "hidden" | "deleted";

export interface LibraryComicSummary {
  id: string;
  displayTitle: string;
  sortTitle: string;
  status: ComicStatus;
  primaryLocalFileId: string | null;
  lastReadPageId: string | null;
}

export * from "./comics.repository";
export * from "./comic-chapter-order.repository";
export * from "./comic-merge.repository";
export * from "./comic-metadata.repository";
export * from "./comic-maintenance.repository";
export * from "./duplicate-candidates.repository";
export * from "./manga-roots";
export * from "./manga-roots.repository";
export * from "./scan-all-manga-roots";
export * from "./scan-library-root";
export * from "./scan-sessions";
export * from "./scan-sessions.repository";
export * from "./relocate-system-manga-root";
