export function clampPage(page: number, total: number, pageSize: number): number {
  const totalPages = Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, pageSize)));
  return Math.min(Math.max(1, Math.trunc(page) || 1), totalPages);
}

export function getRowNumber(rowIndex: number, page: number, pageSize: number): number {
  return (Math.max(1, Math.trunc(page) || 1) - 1) * Math.max(1, Math.trunc(pageSize) || 1) + rowIndex + 1;
}

export function getSelectablePageKeys<T>(
  rows: readonly T[],
  getKey: (row: T) => string,
  isSelectable: (row: T) => boolean = () => true,
): string[] {
  return rows.filter(isSelectable).map(getKey);
}

export function togglePageSelection(current: ReadonlySet<string>, pageKeys: readonly string[], selected: boolean): Set<string> {
  const next = new Set(current);
  for (const key of pageKeys) {
    if (selected) {
      next.add(key);
    } else {
      next.delete(key);
    }
  }
  return next;
}
