export type LocalFileKind = "directory" | "zip" | "cbz";

export interface PageSource {
  localFileId: string;
  sourceKind: "filesystem" | "archive";
  internalPath: string;
  archiveIndex: number | null;
}

export * from "./file-enumerator";
export * from "./file-maintenance.repository";
export * from "./path-safety";
