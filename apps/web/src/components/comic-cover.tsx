"use client";

/* eslint-disable @next/next/no-img-element -- Covers are local generated media served by a comic-id API. */

import { useState } from "react";

import { CoverBlock } from "@/components/site-header";

const coverColors = [
  "#211b31",
  "#231b29",
  "#1e1b2a",
  "#281c2f",
  "#21172f",
  "#1d1730",
  "#241832",
  "#20162b",
];

export function ComicCover({
  className,
  comicId,
  compact = true,
  index = 0,
  title,
  use = "list_thumbnail",
}: {
  className?: string;
  comicId?: string;
  compact?: boolean;
  index?: number;
  title: string;
  use?: "cover" | "list_thumbnail";
}) {
  const [hasImageError, setHasImageError] = useState(false);
  const coverUrl = comicId && !hasImageError ? getComicCoverUrl(comicId, use) : null;

  return (
    <div className={className}>
      {coverUrl ? (
        <img
          alt={title}
          decoding="async"
          loading="lazy"
          onError={() => setHasImageError(true)}
          src={coverUrl}
          style={{
            aspectRatio: "2 / 3",
            background: coverColors[index % coverColors.length],
            borderRadius: compact ? "10px 10px 0 0" : 14,
            boxShadow: compact ? "none" : "0 12px 24px rgba(37, 23, 46, 0.18)",
            display: "block",
            maxWidth: "100%",
            objectFit: "cover",
            width: compact ? "100%" : 260,
          }}
        />
      ) : (
        <CoverBlock title={title} color={coverColors[index % coverColors.length]} compact={compact} />
      )}
    </div>
  );
}

export function getCoverColor(index: number) {
  return coverColors[index % coverColors.length];
}

function getComicCoverUrl(comicId: string, use: "cover" | "list_thumbnail") {
  const params = new URLSearchParams({
    h: use === "list_thumbnail" ? "360" : "780",
    use,
    w: use === "list_thumbnail" ? "240" : "520",
  });

  return `/api/comics/${encodeURIComponent(comicId)}/cover?${params.toString()}`;
}
