"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Eye, Settings } from "lucide-react";
import { getComic } from "@/lib/mock-data";

export default function ReaderPage() {
  const params = useParams<{ id: string }>();
  const comic = getComic(params.id);
  const [toolbarVisible, setToolbarVisible] = useState(true);

  if (!comic) {
    return (
      <main className="reader-shell flex items-center justify-center">
        <p className="text-white/60">找不到该漫画。</p>
      </main>
    );
  }

  const pages = useMemo(
    () => Array.from({ length: Math.min(comic.pages, 18) }, (_, i) => i + 1),
    [comic.pages],
  );

  return (
    <main className="reader-shell">
      <header className={`reader-toolbar ${toolbarVisible ? "" : "is-hidden"}`}>
        <Link href={`/comics/${comic.id}`}>
          <ArrowLeft size={18} /> 返回详情
        </Link>
        <div>
          <strong>{comic.title}</strong>
          <span>垂直阅读 · {comic.progress}%</span>
        </div>
        <button type="button" onClick={() => setToolbarVisible((v) => !v)}>
          <Eye size={18} /> 隐藏
        </button>
        <button type="button">
          <Settings size={18} /> 设置
        </button>
      </header>

      <button
        className="reader-edge-toggle"
        type="button"
        onClick={() => setToolbarVisible((v) => !v)}
        aria-label="显示或隐藏工具栏"
      />

      <section className="reader-pages" aria-label="漫画页面">
        <div className="reader-divider">
          <span>{comic.chapters[0]?.title}</span>
          <strong>{comic.title}</strong>
        </div>
        {pages.map((page) => (
          <article className="mock-page" key={page}>
            <span>PAGE {String(page).padStart(2, "0")}</span>
            <p>{comic.title}</p>
          </article>
        ))}
        <div className="reader-divider">
          <span>当前章节已接近底部</span>
          <strong>下一话将自动接在下面</strong>
        </div>
      </section>

      <aside className="thumb-rail" aria-label="缩略图导航">
        {pages.slice(0, 10).map((page) => (
          <button className={page === 7 ? "is-active" : ""} key={page} type="button">
            {page}
          </button>
        ))}
      </aside>
    </main>
  );
}
