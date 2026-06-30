export type ComicStatus = "ready" | "tagged" | "missing_cover" | "local_file_missing";

export interface Chapter {
  id: string;
  title: string;
  pageCount: number;
  addedAt: string;
}

export interface Comic {
  id: string;
  title: string;
  originalTitle: string;
  fileTitle: string;
  artist: string;
  group: string;
  format: "ZIP" | "CBZ" | "RAR" | "DIR";
  fileSize: string;
  pages: number;
  episodes: number;
  status: ComicStatus;
  addedAt: string;
  lastReadAt: string;
  progress: number;
  source: string;
  localPath: string;
  tags: string[];
  chapters: Chapter[];
  note: string;
  color: string;
}

export const statusLabel: Record<ComicStatus, string> = {
  ready: "就绪",
  tagged: "已标注",
  missing_cover: "缺封面",
  local_file_missing: "缺文件",
};

export const statusOptions: Array<{ label: string; value: ComicStatus }> = [
  { label: "就绪", value: "ready" },
  { label: "已标注", value: "tagged" },
  { label: "缺封面", value: "missing_cover" },
  { label: "缺文件", value: "local_file_missing" },
];

export const sortOptions = [
  { label: "recent", value: "recent" },
  { label: "title", value: "title" },
  { label: "progress", value: "progress" },
] as const;

export type SortMode = (typeof sortOptions)[number]["value"];

export const tagGroups = [
  { label: "Language", values: ["translated", "english", "chinese", "korean"] },
  { label: "Female", values: ["beauty mark", "big breasts", "schoolgirl uniform", "drunk", "ahegao"] },
  { label: "Category", values: ["manga", "doujinshi"] },
  { label: "Male", values: ["sole male", "teacher", "virginity"] },
  { label: "Other", values: ["mosaic censorship", "tankoubon", "uncensored", "rough translation"] },
  { label: "Artist", values: ["gen", "mashiro shirako", "unknown"] },
  { label: "Date Added", values: ["2026/6/13"] },
  { label: "Group", values: ["enji"] },
  { label: "Parody", values: ["original"] },
];

export const settingsTabs = ["常规设置", "阅读设置", "扫描设置", "安全设置"] as const;

const coverColors = [
  "#211b31", "#231b29", "#1e1b2a", "#281c2f",
  "#21172f", "#1d1730", "#241832", "#20162b",
  "#1d182d", "#22162a",
];

export const comics: Comic[] = [
  {
    id: "tagged-sample",
    title: "标签已审核样例",
    originalTitle: "Tagged Sample",
    fileTitle: "[gen] Tagged Sample 第001-120话.cbz",
    artist: "gen",
    group: "enji",
    format: "CBZ",
    fileSize: "10.71 GB",
    pages: 1480,
    episodes: 120,
    status: "tagged",
    addedAt: "2026/6/13",
    lastReadAt: "2026/6/27",
    progress: 36,
    source: "E-Hentai",
    localPath: "D:\\Comics\\Manga\\Tagged Sample.cbz",
    tags: ["category:manga", "female:big breasts", "male:sole male", "other:mosaic censorship", "language:translated", "parody:original"],
    chapters: Array.from({ length: 6 }, (_, i) => ({
      id: `tagged-${120 - i}`,
      title: `第${120 - i}话 - 第${120 - i}话`,
      pageCount: i === 0 ? 52 : 12,
      addedAt: "2026-06-13",
    })),
    note: "已通过外部 API 获取完整标签。",
    color: coverColors[0],
  },
  {
    id: "recent-scan",
    title: "目录扫描样例",
    originalTitle: "Local Folder Sample",
    fileTitle: "Local Folder Sample",
    artist: "mashiro shirako",
    group: "unknown",
    format: "DIR",
    fileSize: "892 MB",
    pages: 132,
    episodes: 8,
    status: "ready",
    addedAt: "2026/6/21",
    lastReadAt: "2026/6/26",
    progress: 64,
    source: "Local Scan",
    localPath: "E:\\Downloads\\Comics\\Local Folder Sample",
    tags: ["category:doujinshi", "female:beauty mark", "language:english", "other:uncensored"],
    chapters: Array.from({ length: 8 }, (_, i) => ({
      id: `scan-${i + 1}`,
      title: `Chapter ${i + 1}`,
      pageCount: 16 + (i % 3),
      addedAt: "2026-06-21",
    })),
    note: "本地扫描生成，等待补充来源站 metadata。",
    color: coverColors[1],
  },
  {
    id: "cover-missing",
    title: "缺封面样例",
    originalTitle: "No Cover Yet",
    fileTitle: "No Cover Yet.zip",
    artist: "unknown",
    group: "manual",
    format: "ZIP",
    fileSize: "456 MB",
    pages: 78,
    episodes: 4,
    status: "missing_cover",
    addedAt: "2026/6/18",
    lastReadAt: "未阅读",
    progress: 0,
    source: "Local Scan",
    localPath: "D:\\Comics\\Manga\\No Cover Yet.zip",
    tags: ["category:manga", "language:korean", "other:rough translation"],
    chapters: Array.from({ length: 4 }, (_, i) => ({
      id: `cover-${i + 1}`,
      title: `未分章 ${i + 1}`,
      pageCount: 18 + i,
      addedAt: "2026-06-18",
    })),
    note: "没有 cover 文件，稍后用第一页或手动封面补齐。",
    color: coverColors[2],
  },
  {
    id: "missing-file",
    title: "本地文件缺失样例",
    originalTitle: "Missing Local File",
    fileTitle: "[unknown] Missing Local File.cbz",
    artist: "unknown",
    group: "old",
    format: "CBZ",
    fileSize: "1.2 GB",
    pages: 210,
    episodes: 12,
    status: "local_file_missing",
    addedAt: "2026/5/30",
    lastReadAt: "2026/6/11",
    progress: 12,
    source: "Local Scan",
    localPath: "F:\\Backup\\OldComics\\Missing Local File.cbz",
    tags: ["category:doujinshi", "language:translated", "male:teacher"],
    chapters: Array.from({ length: 5 }, (_, i) => ({
      id: `missing-${i + 1}`,
      title: `第 ${i + 1} 章`,
      pageCount: 42,
      addedAt: "2026-05-30",
    })),
    note: "路径不存在。后台文件维护应提示修复路径。",
    color: coverColors[3],
  },
  {
    id: "sample-01",
    title: "夏日补完计划",
    originalTitle: "Summer Completion Plan",
    fileTitle: "Summer Completion Plan.cbz",
    artist: "mashiro shirako",
    group: "enji",
    format: "RAR",
    fileSize: "2.1 GB",
    pages: 980,
    episodes: 120,
    status: "tagged",
    addedAt: "2026/6/11",
    lastReadAt: "2026/6/26",
    progress: 80,
    source: "E-Hentai",
    localPath: "D:\\Comics\\Manga\\Summer Completion Plan.rar",
    tags: ["category:manga", "female:schoolgirl uniform", "language:chinese", "parody:original"],
    chapters: Array.from({ length: 6 }, (_, i) => ({
      id: `summer-${120 - i}`,
      title: `第${120 - i}话`,
      pageCount: 20 - i,
      addedAt: "2026-06-11",
    })),
    note: "",
    color: coverColors[4],
  },
  {
    id: "sample-02",
    title: "旧馆记录",
    originalTitle: "Old Building Records",
    fileTitle: "Old Building Records.cbz",
    artist: "unknown",
    group: "manual",
    format: "CBZ",
    fileSize: "671 MB",
    pages: 408,
    episodes: 78,
    status: "ready",
    addedAt: "2026/6/9",
    lastReadAt: "2026/6/26",
    progress: 44,
    source: "Local Scan",
    localPath: "D:\\Comics\\Manga\\Old Building Records.cbz",
    tags: ["category:doujinshi", "language:chinese", "male:virginity"],
    chapters: Array.from({ length: 5 }, (_, i) => ({
      id: `old-${78 - i}`,
      title: `第${78 - i}话`,
      pageCount: 16,
      addedAt: "2026-06-09",
    })),
    note: "",
    color: coverColors[5],
  },
  {
    id: "sample-03",
    title: "标签整理中",
    originalTitle: "Tagging In Progress",
    fileTitle: "Tagging In Progress.zip",
    artist: "unknown",
    group: "manual",
    format: "ZIP",
    fileSize: "320 MB",
    pages: 671,
    episodes: 56,
    status: "ready",
    addedAt: "2026/6/8",
    lastReadAt: "未阅读",
    progress: 0,
    source: "Local Scan",
    localPath: "D:\\Comics\\Manga\\Tagging In Progress.zip",
    tags: ["category:manga", "other:rough translation"],
    chapters: Array.from({ length: 3 }, (_, i) => ({
      id: `tagging-${56 - i}`,
      title: `第${56 - i}话`,
      pageCount: 22,
      addedAt: "2026-06-08",
    })),
    note: "标签整理中",
    color: coverColors[6],
  },
  {
    id: "sample-04",
    title: "粉色书架",
    originalTitle: "Pink Bookshelf",
    fileTitle: "Pink Bookshelf.cbz",
    artist: "unknown",
    group: "manual",
    format: "ZIP",
    fileSize: "1.08 GB",
    pages: 408,
    episodes: 34,
    status: "ready",
    addedAt: "2026/6/7",
    lastReadAt: "2026/6/26",
    progress: 18,
    source: "E-Hentai",
    localPath: "D:\\Comics\\Manga\\Pink Bookshelf.cbz",
    tags: ["category:manga", "female:drunk", "language:translated", "parody:original"],
    chapters: Array.from({ length: 3 }, (_, i) => ({
      id: `pink-${34 - i}`,
      title: `第${34 - i}话`,
      pageCount: 18,
      addedAt: "2026-06-07",
    })),
    note: "",
    color: coverColors[7],
  },
  {
    id: "sample-05",
    title: "夜间短篇集",
    originalTitle: "Night Short Stories",
    fileTitle: "Night Short Stories.cbz",
    artist: "unknown",
    group: "manual",
    format: "CBZ",
    fileSize: "512 MB",
    pages: 280,
    episodes: 22,
    status: "ready",
    addedAt: "2026/6/5",
    lastReadAt: "2026/6/27",
    progress: 72,
    source: "Local Scan",
    localPath: "D:\\Comics\\Manga\\Night Short Stories.cbz",
    tags: ["category:doujinshi", "language:english", "other:uncensored"],
    chapters: Array.from({ length: 3 }, (_, i) => ({
      id: `night-${22 - i}`,
      title: `第${22 - i}话`,
      pageCount: 10,
      addedAt: "2026-06-05",
    })),
    note: "",
    color: coverColors[8],
  },
  {
    id: "sample-06",
    title: "待补标签样例",
    originalTitle: "Missing Tags",
    fileTitle: "Missing Tags.cbr",
    artist: "unknown",
    group: "manual",
    format: "ZIP",
    fileSize: "256 MB",
    pages: 160,
    episodes: 63,
    status: "tagged",
    addedAt: "2026/6/3",
    lastReadAt: "未阅读",
    progress: 0,
    source: "Local Scan",
    localPath: "D:\\Comics\\Manga\\Missing Tags.cbr",
    tags: [],
    chapters: [],
    note: "",
    color: coverColors[9],
  },
];

// --- Generated mock comics for pagination testing ---
const extraArtists = ["mashiro shirako", "gen", "unknown", "sakura yuki", "tanaka rei", "kuroda aki", "watanabe jun", "ito haruka"];
const extraGroups = ["enji", "unknown", "manual", "old", "new"];
const extraFormats = ["CBZ", "ZIP", "RAR", "DIR"] as const;
const extraStatuses: ComicStatus[] = ["ready", "tagged", "ready", "ready", "tagged", "ready", "ready", "missing_cover", "ready", "local_file_missing"];
const extraSources = ["E-Hentai", "Local Scan", "DLsite", "Fanza", "ComicMarket"];
const extraTagSets = [
  ["category:manga", "language:chinese", "parody:original"],
  ["category:doujinshi", "female:schoolgirl uniform", "language:translated"],
  ["category:manga", "female:drunk", "other:mosaic censorship", "language:korean"],
  ["category:doujinshi", "male:sole male", "language:english", "other:uncensored"],
  ["category:manga", "female:big breasts", "female:ahegao", "language:translated", "parody:original"],
  ["category:doujinshi", "male:teacher", "language:chinese", "other:rough translation"],
  ["category:manga", "female:beauty mark", "language:english"],
  ["category:doujinshi", "male:virginity", "other:tankoubon", "language:translated"],
  ["category:manga", "female:schoolgirl uniform", "female:drunk", "language:chinese"],
  ["category:doujinshi", "other:uncensored", "language:korean", "parody:original"],
];
const extraNotes = [
  "", "", "", "等待 OCR 处理。", "", "封面需要重新生成。",
  "", "分章信息待确认。", "", "", "标签来自外部 API。",
];

const comicNames = [
  ["幻影城", "Phantom Castle"], ["深海迷宫", "Deep Sea Labyrinth"], ["赤月传说", "Red Moon Legend"],
  ["镜中少女", "Mirror Maiden"], ["暗黑教室", "Dark Classroom"], ["绯色之吻", "Scarlet Kiss"],
  ["时空旅人", "Time Traveler"], ["雪国奇谭", "Snow Country Tale"], ["禁断花园", "Forbidden Garden"],
  ["银翼骑士", "Silver Wing Knight"], ["迷宮华尔兹", "Labyrinth Waltz"], ["夜想曲", "Nocturne"],
  ["星屑幻想", "Stardust Fantasy"], ["魔女之家", "Witch House"], ["鋼鉄乙女", "Steel Maiden"],
  ["雨夜怪谈", "Rainy Night Tale"], ["黄昏图书馆", "Twilight Library"], ["狂気楽園", "Mad Paradise"],
  ["影法師", "Shadow Figure"], ["純情中毒", "Pure Addiction"], ["白昼夢", "Daydream"],
  ["桜花抄", "Sakura Notes"], ["電脳迷宮", "Cyber Labyrinth"], ["罪と罰", "Crime & Punishment"],
  ["猫耳喫茶", "Cat Ear Cafe"], ["月光譚", "Moonlight Story"], ["泡沫恋歌", "Bubble Love Song"],
  ["煉獄学園", "Purgatory Academy"], ["終末少女", "Apocalypse Girl"],
];

function makeComic(index: number): Comic {
  const name = comicNames[index % comicNames.length];
  const artist = extraArtists[index % extraArtists.length];
  const group = extraGroups[index % extraGroups.length];
  const format = extraFormats[index % extraFormats.length];
  const status = extraStatuses[index % extraStatuses.length];
  const pages = 80 + Math.floor(Math.random() * 1200);
  const episodes = 1 + Math.floor(Math.random() * 40);
  const day = 1 + (index % 28);
  const month = 1 + (index % 6);
  const year = 2026;

  return {
    id: `mock-${String(index + 1).padStart(2, "0")}`,
    title: name[0],
    originalTitle: name[1],
    fileTitle: `[${artist}] ${name[1]}.${format.toLowerCase()}`,
    artist,
    group,
    format,
    fileSize: `${(80 + Math.random() * 5000).toFixed(0)} MB`,
    pages,
    episodes,
    status,
    addedAt: `${year}/${month}/${day}`,
    lastReadAt: Math.random() > 0.3 ? `${year}/${month}/${Math.min(day + Math.floor(Math.random() * 5), 28)}` : "未阅读",
    progress: Math.floor(Math.random() * 100),
    source: extraSources[index % extraSources.length],
    localPath: `D:\\Comics\\Manga\\${name[1].replace(/\s/g, "_")}.${format.toLowerCase()}`,
    tags: extraTagSets[index % extraTagSets.length],
    chapters: Array.from({ length: Math.min(episodes, 8) }, (_, i) => ({
      id: `mock-${index}-${episodes - i}`,
      title: `第${episodes - i}话`,
      pageCount: 8 + Math.floor(Math.random() * 30),
      addedAt: `${year}-${String(month).padStart(2, "0")}-${String(Math.min(day + i, 28)).padStart(2, "0")}`,
    })),
    note: extraNotes[index % extraNotes.length],
    color: coverColors[3 + (index % 7)],
  };
}

for (let i = 0; i < 29; i++) {
  comics.push(makeComic(i));
}

export interface ScanPath {
  id: string;
  path: string;
  description: string;
  status: "ok" | "missing" | "scanning";
  comicCount: number;
  lastScanAt: string;
  addedAt: string;
}

export const scanPaths: ScanPath[] = [
  {
    id: "path-1",
    path: "D:\\Comics\\Manga",
    description: "主漫画库",
    status: "ok",
    comicCount: 156,
    lastScanAt: "2026/6/30 09:15",
    addedAt: "2026/5/1",
  },
  {
    id: "path-2",
    path: "E:\\Downloads\\Comics",
    description: "下载待整理",
    status: "ok",
    comicCount: 89,
    lastScanAt: "2026/6/29 22:40",
    addedAt: "2026/5/15",
  },
  {
    id: "path-3",
    path: "\\\\NAS-Media\\shared\\comics",
    description: "NAS 共享漫画",
    status: "scanning",
    comicCount: 0,
    lastScanAt: "—",
    addedAt: "2026/6/28",
  },
  {
    id: "path-4",
    path: "F:\\Backup\\OldComics",
    description: "旧盘备份（已断开）",
    status: "missing",
    comicCount: 0,
    lastScanAt: "2026/6/15 14:20",
    addedAt: "2026/3/10",
  },
];

export interface TagItem {
  id: string;
  namespace: string;
  name: string;
  canonical: string;
  translation: string;
  comicCount: number;
}

/** namespace → Chinese display label */
export const NAMESPACE_LABELS: Record<string, string> = {
  language: "语言",
  female: "女性",
  male: "男性",
  category: "类型",
  other: "其他",
  artist: "作者",
  group: "社团",
  parody: "原作",
};

/** "中文 (english)" label helper for Select options */
export function namespaceOptionLabel(ns: string): string {
  const cn = NAMESPACE_LABELS[ns];
  return cn ? `${cn} (${ns})` : ns;
}

/** Resolve namespace → Chinese label, fallback to raw key */
export function namespaceLabel(ns: string): string {
  return NAMESPACE_LABELS[ns] ?? ns;
}

export const allTags: TagItem[] = [
  { id: "t1", namespace: "language", name: "translated", canonical: "language:translated", translation: "已翻译", comicCount: 85 },
  { id: "t2", namespace: "language", name: "chinese", canonical: "language:chinese", translation: "中文", comicCount: 142 },
  { id: "t3", namespace: "language", name: "english", canonical: "language:english", translation: "英文", comicCount: 63 },
  { id: "t4", namespace: "language", name: "korean", canonical: "language:korean", translation: "韩文", comicCount: 12 },
  { id: "t5", namespace: "female", name: "big breasts", canonical: "female:big breasts", translation: "巨乳", comicCount: 98 },
  { id: "t6", namespace: "female", name: "schoolgirl uniform", canonical: "female:schoolgirl uniform", translation: "水手服", comicCount: 67 },
  { id: "t7", namespace: "female", name: "beauty mark", canonical: "female:beauty mark", translation: "泪痣", comicCount: 34 },
  { id: "t8", namespace: "female", name: "drunk", canonical: "female:drunk", translation: "醉酒", comicCount: 21 },
  { id: "t9", namespace: "female", name: "ahegao", canonical: "female:ahegao", translation: "阿黑颜", comicCount: 44 },
  { id: "t10", namespace: "male", name: "sole male", canonical: "male:sole male", translation: "单男主", comicCount: 76 },
  { id: "t11", namespace: "male", name: "teacher", canonical: "male:teacher", translation: "教师", comicCount: 18 },
  { id: "t12", namespace: "male", name: "virginity", canonical: "male:virginity", translation: "童贞", comicCount: 29 },
  { id: "t13", namespace: "category", name: "manga", canonical: "category:manga", translation: "漫画", comicCount: 156 },
  { id: "t14", namespace: "category", name: "doujinshi", canonical: "category:doujinshi", translation: "同人志", comicCount: 89 },
  { id: "t15", namespace: "other", name: "mosaic censorship", canonical: "other:mosaic censorship", translation: "马赛克", comicCount: 112 },
  { id: "t16", namespace: "other", name: "tankoubon", canonical: "other:tankoubon", translation: "单行本", comicCount: 31 },
  { id: "t17", namespace: "other", name: "uncensored", canonical: "other:uncensored", translation: "无修正", comicCount: 47 },
  { id: "t18", namespace: "other", name: "rough translation", canonical: "other:rough translation", translation: "机翻", comicCount: 15 },
  { id: "t19", namespace: "artist", name: "gen", canonical: "artist:gen", translation: "gen", comicCount: 40 },
  { id: "t20", namespace: "artist", name: "mashiro shirako", canonical: "artist:mashiro shirako", translation: "mashiro shirako", comicCount: 28 },
  { id: "t21", namespace: "artist", name: "unknown", canonical: "artist:unknown", translation: "未知作者", comicCount: 167 },
  { id: "t22", namespace: "group", name: "enji", canonical: "group:enji", translation: "enji", comicCount: 35 },
  { id: "t23", namespace: "parody", name: "original", canonical: "parody:original", translation: "原创", comicCount: 178 },
];

export interface FileIssue {
  id: string;
  comicId: string;
  comicTitle: string;
  issueType: "missing" | "changed" | "duplicate" | "orphan";
  filePath: string;
  expectedSize: string;
  detail: string;
  detectedAt: string;
}

export const fileIssues: FileIssue[] = [
  {
    id: "fi-1",
    comicId: "missing-file",
    comicTitle: "本地文件缺失样例",
    issueType: "missing",
    filePath: "F:\\Backup\\OldComics\\Missing Local File.cbz",
    expectedSize: "1.2 GB",
    detail: "文件路径不存在，可能是磁盘已断开连接或文件被删除。",
    detectedAt: "2026/6/30 08:00",
  },
  {
    id: "fi-2",
    comicId: "sample-02",
    comicTitle: "旧馆记录",
    issueType: "changed",
    filePath: "D:\\Comics\\Manga\\Old Building Records.cbz",
    expectedSize: "671 MB",
    detail: "文件大小已变更（671 MB → 712 MB），可能是文件被替换或修改。",
    detectedAt: "2026/6/29 22:15",
  },
  {
    id: "fi-3",
    comicId: "sample-04",
    comicTitle: "粉色书架",
    issueType: "duplicate",
    filePath: "D:\\Comics\\Manga\\Pink Bookshelf.cbz",
    expectedSize: "1.08 GB",
    detail: "在 D:\\Downloads 发现相同 hash 的文件，疑似重复。",
    detectedAt: "2026/6/28 14:30",
  },
  {
    id: "fi-4",
    comicId: "sample-05",
    comicTitle: "夜间短篇集",
    issueType: "orphan",
    filePath: "D:\\Comics\\Manga\\night_shorts_temp.cbz",
    expectedSize: "512 MB",
    detail: "数据库无对应记录，可能是临时下载文件或手动放入的文件。",
    detectedAt: "2026/6/27 11:00",
  },
];

export function getComic(id: string): Comic | undefined {
  return comics.find((comic) => comic.id === id);
}
