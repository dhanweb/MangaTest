import Link from "next/link";
import { Play } from "lucide-react";
import type { Comic } from "@/lib/mock-data";
import { statusLabel } from "@/lib/mock-data";
import { CoverBlock } from "./SiteHeader";

export function ComicCard({ comic }: { comic: Comic }) {
  return (
    <article className="relative overflow-hidden rounded-[10px] bg-white shadow-[0_8px_24px_rgba(239,59,145,0.08)] transition-[box-shadow,transform] duration-160 ease hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(239,59,145,0.16)]">
      <Link href={`/comics/${comic.id}`} aria-label={`打开 ${comic.title}`}>
        <CoverBlock title={`${comic.episodes}话`} color={comic.color} compact />
        <div className="p-3 pb-[14px]">
          <h2 className="m-0 mb-[6px] text-[15px] leading-[1.35]">{comic.title}</h2>
          <p className="m-0 mb-3 text-xs" style={{ color: "var(--ink-muted)" }}>
            {comic.artist} · {comic.pages} 页 · {comic.format}
          </p>
          <div className="flex items-center justify-between gap-2 text-xs" style={{ color: "var(--ink-muted)" }}>
            <span className={`status-pill ${comic.status}`}>{statusLabel[comic.status]}</span>
            <span>{comic.addedAt}</span>
          </div>
        </div>
      </Link>
      <Link
        href={`/reader/${comic.id}`}
        className="absolute top-2 right-2 grid w-[34px] h-[34px] place-items-center rounded-full text-white"
        style={{ background: "var(--pink)" }}
        aria-label={`继续阅读 ${comic.title}`}
      >
        <Play size={14} />
      </Link>
    </article>
  );
}
