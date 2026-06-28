"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { ComicCard } from "@/components/ComicCard";
import { SiteHeader } from "@/components/SiteHeader";
import { comics, sortOptions, tagGroups, type SortMode } from "@/lib/mock-data";

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const filteredComics = useMemo(() => {
    const q = query.trim().toLowerCase();
    const next = comics.filter((comic) => {
      const text = [comic.title, comic.originalTitle, comic.artist, comic.fileTitle, comic.tags.join(" ")].join(" ").toLowerCase();
      const matchesQuery = !q || text.includes(q);
      const matchesTags = selectedTags.every((tag) => comic.tags.some((t) => t.includes(tag)));
      return matchesQuery && matchesTags;
    });

    return next.toSorted((a, b) => {
      if (sortMode === "title") return a.title.localeCompare(b.title, "zh-Hans-CN");
      if (sortMode === "progress") return b.progress - a.progress;
      return b.addedAt.localeCompare(a.addedAt);
    });
  }, [query, selectedTags, sortMode]);

  function toggleTag(tag: string) {
    setSelectedTags((cur) => cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag]);
  }

  return (
    <>
      <SiteHeader active="library" />
      <main className="w-[min(1200px,calc(100%-32px))] mx-auto py-8 pb-14">
        <section className="mb-6">
          <h1 className="m-0 mb-1.5 text-[28px] leading-[1.15]" style={{ color: "var(--pink)" }}>漫画库</h1>
          <p style={{ color: "var(--ink-muted)" }}>浏览本地漫画收藏，使用标签筛选你想看的内容。</p>
        </section>

        <section className="search-row" aria-label="漫画搜索">
          <label className="search-box">
            <Search size={18} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索漫画名称、作者或标签..." />
          </label>
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="w-[180px] h-[42px] px-3 rounded-[10px] bg-white border cursor-pointer text-[var(--ink)] text-sm"
            style={{ borderColor: "var(--pink-line)" }}
            aria-label="排序方式"
          >
            {sortOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </section>

        <section className="tag-filter-panel" aria-label="标签快捷搜索">
          {tagGroups.map((group) => (
            <div className="tag-filter-row" key={group.label}>
              <strong>{group.label}:</strong>
              <div className="flex flex-wrap gap-2">
                {group.values.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className={selectedTags.includes(tag) ? "is-selected" : ""}
                    onClick={() => toggleTag(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>

        <div className="flex justify-between my-6" style={{ color: "var(--pink-text)" }}>
          <span>共 {filteredComics.length} 本</span>
          {selectedTags.length > 0 && (
            <button type="button" onClick={() => setSelectedTags([])} className="bg-transparent font-extrabold" style={{ color: "var(--pink)" }}>
              <X size={14} className="inline mr-1" />
              清除筛选
            </button>
          )}
        </div>

        <section className="comic-grid" aria-label="漫画列表">
          {filteredComics.map((comic) => (
            <ComicCard comic={comic} key={comic.id} />
          ))}
        </section>
      </main>
    </>
  );
}
