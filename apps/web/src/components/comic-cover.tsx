import { CoverBlock } from "@/components/site-header";

const coverColors = [
  "#211b31",
  "#231b29",
  "#1e1b2a",
  "#281c2f",
  "#21172f",
  "#1d1730",
  "#241832",
  "#20162b",
];

export function ComicCover({ title, index = 0, className }: { title: string; index?: number; className?: string }) {
  return (
    <div className={className}>
      <CoverBlock title={title} color={coverColors[index % coverColors.length]} compact />
    </div>
  );
}

export function getCoverColor(index: number) {
  return coverColors[index % coverColors.length];
}
