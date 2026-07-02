export interface MetadataIngestPayload {
  site: string;
  sourceUrl: string;
  sourceId?: string;
  title?: string;
  coverUrl?: string;
  tags?: Array<{
    namespace: string;
    name: string;
  }>;
  resources?: Array<{
    type: "magnet" | "torrent" | "http" | "openlist";
    url: string;
    label?: string;
  }>;
}
