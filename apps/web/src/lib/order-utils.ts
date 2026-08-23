export function insertItemAt<T extends { id: string }>(items: readonly T[], itemId: string, oneBasedPosition: number): T[] {
  const currentIndex = items.findIndex((item) => item.id === itemId);
  if (currentIndex < 0) return [...items];

  const next = [...items];
  const [item] = next.splice(currentIndex, 1);
  if (!item) return next;

  const position = Number.isFinite(oneBasedPosition) ? Math.trunc(oneBasedPosition) : currentIndex + 1;
  const targetIndex = Math.max(0, Math.min(next.length, position - 1));
  next.splice(targetIndex, 0, item);
  return next;
}
