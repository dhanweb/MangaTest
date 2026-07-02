export interface AdminHealthSummary {
  scanStatus: string;
  missingFiles: number;
  duplicateCandidates: number;
  cacheSizeBytes: number;
}
