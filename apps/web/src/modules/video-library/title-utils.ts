export function normalizeVideoTitle(value: string) {
  return value.trim().replace(/\.[^.]+$/, "");
}

export function normalizeVideoSortTitle(value: string) {
  return normalizeVideoTitle(value).trim().toLocaleLowerCase();
}

export function naturalCompare(left: string, right: string) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}
