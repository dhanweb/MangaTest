import { DEFAULT_CACHE_SIZE_MB, DEFAULT_LISTEN_HOST } from "@/modules/core/config";

import type { RuntimeSettings, SettingDefinition } from "./types";

export const defaultRuntimeSettings: RuntimeSettings = {
  listenHost: DEFAULT_LISTEN_HOST,
  cacheDirectory: ".data/cache",
  cacheSizeMb: DEFAULT_CACHE_SIZE_MB,
  readerThumbnailTtlDays: 30,
  themeMode: "system",
};

export const settingDefinitions = [
  {
    key: "listenHost",
    label: "监听地址",
    description: "默认只监听本机。开启局域网访问后，写 API 必须使用 token。",
    valueType: "string",
    defaultValue: defaultRuntimeSettings.listenHost,
  },
  {
    key: "cacheDirectory",
    label: "缓存目录",
    description: "用于压缩包文件列表、最近访问页面、封面和 reader 缩略图缓存。",
    valueType: "string",
    defaultValue: defaultRuntimeSettings.cacheDirectory,
  },
  {
    key: "cacheSizeMb",
    label: "缓存大小上限",
    description: "缓存清理同时使用大小上限和过期时间。",
    valueType: "number",
    defaultValue: defaultRuntimeSettings.cacheSizeMb,
  },
  {
    key: "readerThumbnailTtlDays",
    label: "Reader 缩略图过期天数",
    description: "缩略图按当前页和可视区域附近懒生成，命中缓存时立即显示。",
    valueType: "number",
    defaultValue: defaultRuntimeSettings.readerThumbnailTtlDays,
  },
  {
    key: "themeMode",
    label: "主题模式",
    description: "第一阶段先保留设置项，后续接入真实主题切换。",
    valueType: "string",
    defaultValue: defaultRuntimeSettings.themeMode,
  },
] satisfies Array<SettingDefinition<RuntimeSettings[keyof RuntimeSettings]>>;
