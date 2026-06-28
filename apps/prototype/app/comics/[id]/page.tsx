"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Edit3, Heart, Play, Star } from "lucide-react";
import { CoverBlock, SiteHeader } from "@/components/SiteHeader";
import { comics, getComic } from "@/lib/mock-data";

export default function ComicDetailPage() {
  const params = useParams<{ id: string }>();
  const comic = getComic(params.id);
  const [firstChapter] = comic.chapters;

  if (!comics.some((item) => item.id === params.id)) {
    return (
      <>
        <SiteHeader active="library" />
        <main className="page-shell">
          <Link className="back-link" href="/">
            <ArrowLeft size={16} />
            返回列表
          </Link>
          <section className="empty-state">
            <h1>没有找到这本漫画</h1>
            <p>原型数据里暂时没有这个漫画 ID。</p>
          </section>
        </main>
      </>
    );
  }

  return (
    <>
      <SiteHeader active="library" />
      <main className="page-shell detail-shell">
        <Link className="back-link" href="/">
          <ArrowLeft size={16} />
          返回列表
        </Link>

        <section className="detail-hero">
          <CoverBlock title={`第1页 / 共${comic.pages}页`} color={comic.color} />
          <div className="detail-main">
            <p className="eyebrow">{comic.status === "tagged" ? "Tagged" : comic.source}</p>
            <h1>{comic.title}</h1>
            <p className="detail-subtitle">{comic.originalTitle}</p>

            <div className="stat-grid">
              <div><strong>{comic.episodes}</strong><span>总话数</span></div>
              <div><strong>{comic.pages}</strong><span>总页数</span></div>
              <div><strong>{comic.format}</strong><span>格式</span></div>
              <div><strong>{comic.fileSize}</strong><span>文件大小</span></div>
            </div>

            <div className="detail-tags">
              {comic.tags.map((tag) => <span key={tag}>{tag}</span>)}
            </div>

            <p className="detail-note">{comic.note}</p>

            <div className="detail-actions">
              <Link className="primary-action" href={`/reader/${comic.id}`}>
                <Play size={16} />
                继续 {firstChapter?.title ?? "阅读"}
              </Link>
              <button type="button"><Heart size={16} /> 已收藏 (2)</button>
              <button type="button"><Edit3 size={16} /> 编辑信息</button>
            </div>
          </div>
        </section>

        <section className="chapter-section">
          <h2>章节列表</h2>
          <div className="chapter-list">
            {comic.chapters.map((chapter, index) => (
              <Link href={`/reader/${comic.id}?chapter=${chapter.id}`} key={chapter.id}>
                <strong>{comic.episodes - index}</strong>
                <span>
                  <b>{chapter.title}</b>
                  <small>{chapter.pageCount} 页 · {chapter.addedAt} 添加</small>
                </span>
                <Star size={18} />
              </Link>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
