import { DEFAULT_CACHE_SIZE_MB, DEFAULT_LISTEN_HOST } from "@/modules/core/config";

import type { RuntimeSettings, SettingDefinition } from "./types";

export const defaultRuntimeSettings: RuntimeSettings = {
  listenHost: DEFAULT_LISTEN_HOST,
  cacheDirectory: ".data/cache",
  cacheSizeMb: DEFAULT_CACHE_SIZE_MB,
  readerThumbnailTtlDays: 30,
  readerPreloadEnabled: true,
  readerPreloadAheadPages: 2,
  readerThumbnailSidebarDefault: true,
  readerImmersiveDefault: false,
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
    key: "readerPreloadEnabled",
    label: "Reader 图片预加载",
    description: "阅读时预加载当前页附近的后续图片。",
    valueType: "boolean",
    defaultValue: defaultRuntimeSettings.readerPreloadEnabled,
  },
  {
    key: "readerPreloadAheadPages",
    label: "Reader 预加载页数",
    description: "阅读时向后预加载多少页。",
    valueType: "number",
    defaultValue: defaultRuntimeSettings.readerPreloadAheadPages,
  },
  {
    key: "readerThumbnailSidebarDefault",
    label: "默认显示缩略图侧栏",
    description: "桌面端打开 reader 时默认显示页面缩略图侧栏。",
    valueType: "boolean",
    defaultValue: defaultRuntimeSettings.readerThumbnailSidebarDefault,
  },
  {
    key: "readerImmersiveDefault",
    label: "默认沉浸阅读",
    description: "打开 reader 时默认隐藏顶部工具栏。",
    valueType: "boolean",
    defaultValue: defaultRuntimeSettings.readerImmersiveDefault,
  },
  {
    key: "themeMode",
    label: "主题模式",
    description: "控制 Mantine 的初始主题模式。",
    valueType: "string",
    defaultValue: defaultRuntimeSettings.themeMode,
  },
] satisfies Array<SettingDefinition<RuntimeSettings[keyof RuntimeSettings]>>;
