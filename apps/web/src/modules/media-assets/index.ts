export type MediaAssetUse = "cover" | "list_thumbnail" | "reader_thumbnail";

export interface ThumbnailCacheKeyInput {
  sourceIdentity: string;
  width: number;
  height: number;
  use: MediaAssetUse;
}

export function createThumbnailCacheKey(input: ThumbnailCacheKeyInput) {
  return `${input.use}:${input.width}x${input.height}:${input.sourceIdentity}`;
}
