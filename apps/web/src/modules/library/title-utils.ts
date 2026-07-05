export function normalizeSortTitle(title: string) {
  return title.trim().toLocaleLowerCase();
}

export function normalizeOptionalTitle(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized ? normalized : null;
}
