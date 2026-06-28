import Link from "next/link";
import type { CSSProperties } from "react";
import { BookOpen, Heart, Library, Settings } from "lucide-react";

type SiteHeaderProps = {
  active?: "library" | "favorites" | "admin";
};

export function SiteHeader({ active = "library" }: SiteHeaderProps) {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true" />
          <strong>ComicWeb</strong>
        </Link>
        <nav className="top-nav" aria-label="主导航">
          <Link className={active === "library" ? "is-active" : ""} href="/">
            <Library size={16} />
            漫画库
          </Link>
          <Link className={active === "favorites" ? "is-active" : ""} href="/?view=favorites">
            <Heart size={16} />
            收藏
          </Link>
          <Link className={active === "admin" ? "is-active" : ""} href="/admin">
            <Settings size={16} />
            管理
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function CoverBlock({ title, color, compact = false }: { title: string; color: string; compact?: boolean }) {
  return (
    <div className={compact ? "cover-block compact" : "cover-block"} style={{ "--cover-color": color } as CSSProperties}>
      <BookOpen aria-hidden="true" size={compact ? 22 : 30} />
      <span>{title}</span>
    </div>
  );
}
