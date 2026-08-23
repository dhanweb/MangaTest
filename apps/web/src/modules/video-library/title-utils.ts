export function normalizeVideoTitle(value: string) {
  return value.trim().replace(/\.[^.]+$/, "");
}

export function normalizeVideoSortTitle(value: string) {
  return normalizeVideoTitle(value).trim().toLocaleLowerCase();
}

export function naturalCompare(left: string, right: string) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

export function sanitizeVideoDirectoryName(value: string) {
  const sanitized = value
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .slice(0, 180);

  return sanitized || "download";
}

export function buildVideoImportSourceKey(value: string) {
  return `dir:下载入库/${sanitizeVideoDirectoryName(value)}`;
}
