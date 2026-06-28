"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ComicDetailView } from "@/components/ComicDetailView";
import { SiteHeader } from "@/components/SiteHeader";
import { comics, getComic } from "@/lib/mock-data";

export default function ComicDetailPage() {
  const params = useParams<{ id: string }>();
  const comic = getComic(params.id);

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

        <ComicDetailView comic={comic} />
      </main>
    </>
  );
}
