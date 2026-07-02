import { randomUUID } from "node:crypto";

export interface ScanSessionRecord {
  id: string;
  mangaRootId: string;
  status: "queued" | "running" | "completed" | "failed" | "cancel_requested" | "canceled";
  addedCount: number;
  missingCount: number;
  duplicateCandidateCount: number;
  recoverableCount: number;
}

export function createQueuedScanSession(mangaRootId: string): ScanSessionRecord {
  return {
    id: randomUUID(),
    mangaRootId,
    status: "queued",
    addedCount: 0,
    missingCount: 0,
    duplicateCandidateCount: 0,
    recoverableCount: 0,
  };
}
