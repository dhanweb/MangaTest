"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { ComicCard } from "@/components/ComicCard";
import { SiteHeader } from "@/components/SiteHeader";
import { comics, tagGroups } from "@/lib/mock-data";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

type SortMode = "recent" | "title" | "progress";

const sortOptions: Array<{ label: string; value: SortMode }> = [
  { label: "recent", value: "recent" },
  { label: "title", value: "title" },
  { label: "progress", value: "progress" }
];

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const filteredComics = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const next = comics.filter((comic) => {
      const text = [comic.title, comic.originalTitle, comic.artist, comic.fileTitle, comic.tags.join(" ")].join(" ").toLowerCase();
      const matchesQuery = !normalizedQuery || text.includes(normalizedQuery);
      const matchesTags = selectedTags.every((tag) => comic.tags.some((comicTag) => comicTag.includes(tag)));
      return matchesQuery && matchesTags;
    });

    return next.toSorted((a, b) => {
      if (sortMode === "title") {
        return a.title.localeCompare(b.title, "zh-Hans-CN");
      }
      if (sortMode === "progress") {
        return b.progress - a.progress;
      }
      return b.addedAt.localeCompare(a.addedAt);
    });
  }, [query, selectedTags, sortMode]);

  function toggleTag(tag: string) {
    setSelectedTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]);
  }

  return (
    <>
      <SiteHeader active="library" />
      <main className="page-shell">
        <section className="library-heading">
          <h1>漫画库</h1>
          <p>浏览本地漫画收藏，使用标签筛选你想看的内容。</p>
        </section>

        <section className="search-row" aria-label="漫画搜索">
          <label className="search-box">
            <Search size={18} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索漫画名称、作者或标签..." />
          </label>
          <Select value={sortMode} onValueChange={(value) => setSortMode(value as SortMode)} items={sortOptions}>
            <SelectTrigger className="w-full min-w-[180px] border-[var(--pink-line)] bg-white data-[size=default]:h-[42px]" aria-label="排序方式">
              <SelectValue placeholder="排序方式" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {sortOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </section>

        <section className="tag-filter-panel" aria-label="标签快捷搜索">
          {tagGroups.map((group) => (
            <div className="tag-filter-row" key={group.label}>
              <strong>{group.label}:</strong>
              <div>
                {group.values.map((tag) => (
                  <button className={selectedTags.includes(tag) ? "is-selected" : ""} key={tag} type="button" onClick={() => toggleTag(tag)}>
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>

        <div className="result-summary">
          <span>共 {filteredComics.length} 本</span>
          {selectedTags.length > 0 ? <button type="button" onClick={() => setSelectedTags([])}>清除筛选</button> : null}
        </div>

        <section className="comic-grid" aria-label="漫画列表">
          {filteredComics.map((comic) => <ComicCard comic={comic} key={comic.id} />)}
        </section>
      </main>
    </>
  );
}
