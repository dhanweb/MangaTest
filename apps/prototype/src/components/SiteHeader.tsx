import Link from "next/link";
import type { CSSProperties } from "react";
import { BookOpen, Heart, Library, Settings } from "lucide-react";

interface SiteHeaderProps {
  active?: "library" | "favorites" | "admin";
}

export function SiteHeader({ active = "library" }: SiteHeaderProps) {
  return (
    <header className="site-header">
      <div className="flex items-center justify-between w-[min(1200px,calc(100%-32px))] min-h-[60px] mx-auto gap-4">
        <Link href="/" className="flex items-center gap-[10px] text-white text-[20px] no-underline">
          <div className="w-[22px] h-[22px] rounded-[4px] bg-[linear-gradient(135deg,#46cf9f_0_40%,#6b7cf2_40%_68%,#ffb540_68%)] shadow-[4px_4px_0_rgba(255,255,255,0.28)]" aria-hidden="true" />
          <strong>ComicWeb</strong>
        </Link>
        <nav className="flex items-center gap-3" aria-label="主导航">
          <Link
            href="/"
            className={`flex items-center gap-[6px] min-h-[36px] px-[14px] rounded-[9px] text-white font-extrabold no-underline ${active === "library" ? "bg-white/18" : ""}`}
          >
            <Library size={16} />
            漫画库
          </Link>
          <Link
            href="/?view=favorites"
            className={`flex items-center gap-[6px] min-h-[36px] px-[14px] rounded-[9px] text-white font-extrabold no-underline ${active === "favorites" ? "bg-white/18" : ""}`}
          >
            <Heart size={16} />
            收藏
          </Link>
          <Link
            href="/admin"
            className={`flex items-center gap-[6px] min-h-[36px] px-[14px] rounded-[9px] text-white font-extrabold no-underline ${active === "admin" ? "bg-white/18" : ""}`}
          >
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
    <div
      className={compact ? "cover-block compact" : "cover-block"}
      style={{ "--cover-color": color } as CSSProperties}
    >
      <BookOpen aria-hidden="true" size={compact ? 22 : 30} />
      <span>{title}</span>
    </div>
  );
}
