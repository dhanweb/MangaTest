"use client";

import { ArrowUp, Pin } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type PinnedActionConfig = {
  id: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  isVisible?: boolean;
};

const BACK_TO_TOP_OFFSET = 320;

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

export function PinnedActions() {
  const pathname = usePathname();
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    let animationFrame = 0;

    function updateVisibility() {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        setShowBackToTop(window.scrollY > BACK_TO_TOP_OFFSET);
      });
    }

    updateVisibility();
    window.addEventListener("scroll", updateVisibility, { passive: true });
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("scroll", updateVisibility);
    };
  }, []);

  const actions = useMemo<PinnedActionConfig[]>(
    () => [
      {
        id: "back-to-top",
        label: "返回顶部",
        icon: ArrowUp,
        onClick: scrollToTop,
        isVisible: showBackToTop,
      },
    ],
    [showBackToTop],
  );

  const visibleActions = actions.filter((action) => action.isVisible !== false);

  if (pathname.startsWith("/reader")) {
    return null;
  }

  if (visibleActions.length === 0) {
    return null;
  }

  return (
    <aside className="pinned-actions" aria-label="图钉快捷操作">
      <span className="pinned-actions-mark" aria-hidden="true">
        <Pin size={14} />
      </span>
      {visibleActions.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.id}
            type="button"
            className="pinned-action-button"
            aria-label={action.label}
            data-action-id={action.id}
            title={action.label}
            onClick={action.onClick}
          >
            <Icon size={18} />
          </button>
        );
      })}
    </aside>
  );
}
