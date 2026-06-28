"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ComicDetailView } from "@/components/ComicDetailView";
import { SiteHeader } from "@/components/SiteHeader";
import { getComic } from "@/lib/mock-data";

export default function ComicDetailPage() {
  const params = useParams<{ id: string }>();
  const comic = getComic(params.id);

  if (!comic) {
    return (
      <>
        <SiteHeader active="library" />
        <main className="w-[min(1200px,calc(100%-32px))] mx-auto py-8">
          <Link href="/" className="inline-flex items-center gap-1.5 mb-[22px] text-[var(--ink)]">
            <ArrowLeft size={16} />
            返回列表
          </Link>
          <section className="py-12 rounded-[14px] bg-white">
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
      <main className="w-[min(1200px,calc(100%-32px))] mx-auto py-8 pb-16">
        <Link href="/" className="inline-flex items-center gap-1.5 mb-[22px] text-[var(--ink)]">
          <ArrowLeft size={16} />
          返回列表
        </Link>

        <ComicDetailView comic={comic} />
      </main>
    </>
  );
}
