export type ComicStatus = "ready" | "tagged" | "missing_cover" | "local_file_missing";

export type Chapter = {
  id: string;
  title: string;
  pageCount: number;
  addedAt: string;
};

export type Comic = {
  id: string;
  title: string;
  originalTitle: string;
  fileTitle: string;
  artist: string;
  group: string;
  format: "ZIP" | "CBZ" | "DIR";
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
};

export const tagGroups = [
  { label: "Language", values: ["translated", "english", "chinese", "korean"] },
  { label: "Female", values: ["beauty mark", "big breasts", "schoolgirl uniform", "drunk", "ahegao"] },
  { label: "Category", values: ["manga", "doujinshi"] },
  { label: "Male", values: ["sole male", "teacher", "virginity"] },
  { label: "Other", values: ["mosaic censorship", "tankoubon", "uncensored", "rough translation"] },
  { label: "Artist", values: ["gen", "mashiro shirako", "unknown"] },
  { label: "Date Added", values: ["2026/6/13"] },
  { label: "Group", values: ["enji"] },
  { label: "Parody", values: ["original"] }
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
    chapters: Array.from({ length: 6 }, (_, index) => ({
      id: `tagged-${120 - index}`,
      title: `第${120 - index}话 - 第${120 - index}话`,
      pageCount: index === 0 ? 52 : 12,
      addedAt: "2026-06-13"
    })),
    note: "已通过外部 API 获取完整标签。后台可继续编辑翻译和别名。",
    color: "#211b31"
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
    chapters: Array.from({ length: 8 }, (_, index) => ({
      id: `scan-${index + 1}`,
      title: `Chapter ${index + 1}`,
      pageCount: 16 + (index % 3),
      addedAt: "2026-06-21"
    })),
    note: "本地扫描生成，等待补充来源站 metadata。",
    color: "#231b29"
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
    chapters: Array.from({ length: 4 }, (_, index) => ({
      id: `cover-${index + 1}`,
      title: `未分章 ${index + 1}`,
      pageCount: 18 + index,
      addedAt: "2026-06-18"
    })),
    note: "没有 cover 文件，稍后用第一页或手动封面补齐。",
    color: "#1e1b2a"
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
    chapters: Array.from({ length: 5 }, (_, index) => ({
      id: `missing-${index + 1}`,
      title: `第 ${index + 1} 章`,
      pageCount: 42,
      addedAt: "2026-05-30"
    })),
    note: "路径不存在。后台文件维护应提示修复路径，而不是删除真实文件。",
    color: "#281c2f"
  }
];

export const settingsTabs = ["常规设置", "阅读设置", "扫描设置", "安全设置"] as const;

export function getComic(id: string) {
  return comics.find((comic) => comic.id === id) ?? comics[0];
}
