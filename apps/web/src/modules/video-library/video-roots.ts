import path from "node:path";
import { randomUUID } from "node:crypto";

export interface VideoRootDraft {
  absolutePath: string;
  displayName?: string;
}

export interface VideoRootRecord {
  id: string;
  absolutePath: string;
  displayName: string | null;
  scanMode: "children_as_videos";
  isEnabled: boolean;
  lastScanAt: string | null;
}

export function createVideoRootRecord(input: VideoRootDraft): VideoRootRecord {
  const absolutePath = path.normalize(input.absolutePath.trim());

  if (!absolutePath || !path.isAbsolute(absolutePath)) {
    throw new Error("视频根目录必须是绝对路径。");
  }

  return {
    id: randomUUID(),
    absolutePath,
    displayName: input.displayName?.trim() || null,
    scanMode: "children_as_videos",
    isEnabled: true,
    lastScanAt: null,
  };
}
