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
  aria2Enabled: boolean;
  aria2RpcUrl: string;
  aria2RpcToken: string;
}
