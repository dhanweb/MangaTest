import Link from "next/link";
import { Play } from "lucide-react";
import type { Comic } from "@/lib/mock-data";
import { CoverBlock } from "./SiteHeader";

const statusLabel: Record<Comic["status"], string> = {
  ready: "就绪",
  tagged: "已标注",
  missing_cover: "缺封面",
  local_file_missing: "缺文件"
};

export function ComicCard({ comic }: { comic: Comic }) {
  return (
    <article className="comic-card">
      <Link href={`/comics/${comic.id}`} aria-label={`打开 ${comic.title}`}>
        <CoverBlock title={`${comic.episodes}话`} color={comic.color} compact />
        <div className="comic-card-meta">
          <h2>{comic.title}</h2>
          <p>{comic.artist} · {comic.pages} 页 · {comic.format}</p>
          <div className="comic-card-footer">
            <span className={`status-pill ${comic.status}`}>{statusLabel[comic.status]}</span>
            <span>{comic.addedAt}</span>
          </div>
        </div>
      </Link>
      <Link className="quick-read" href={`/reader/${comic.id}`} aria-label={`继续阅读 ${comic.title}`}>
        <Play size={14} />
      </Link>
    </article>
  );
}
