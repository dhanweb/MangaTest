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
  themeMode: "system" | "light" | "dark";
}
