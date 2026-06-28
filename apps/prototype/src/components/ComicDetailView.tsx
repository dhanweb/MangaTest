"use client";

import Link from "next/link";
import { useState } from "react";
import { Edit3, Heart, Play, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CoverBlock } from "@/components/SiteHeader";
import { type Comic, type ComicStatus, statusOptions, tagGroups } from "@/lib/mock-data";

type EditableComic = Pick<
  Comic,
  "artist" | "group" | "localPath" | "note" | "originalTitle" | "source" | "status" | "tags" | "title"
>;

function createDraft(comic: Comic): EditableComic {
  return {
    artist: comic.artist,
    group: comic.group,
    localPath: comic.localPath,
    note: comic.note,
    originalTitle: comic.originalTitle,
    source: comic.source,
    status: comic.status,
    tags: comic.tags,
    title: comic.title,
  };
}

function tagValue(groupLabel: string, value: string) {
  return `${groupLabel.toLowerCase()}:${value}`;
}

function tagLabel(tag: string) {
  return tag.includes(":") ? tag.split(":").slice(1).join(":") : tag;
}

export function ComicDetailView({ comic }: { comic: Comic }) {
  const [savedComic, setSavedComic] = useState<EditableComic>(() => createDraft(comic));
  const [draftComic, setDraftComic] = useState<EditableComic>(() => createDraft(comic));
  const [favorite, setFavorite] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const firstChapter = comic.chapters[0];

  function updateDraft<F extends keyof EditableComic>(field: F, value: EditableComic[F]) {
    setDraftComic((cur) => ({ ...cur, [field]: value }));
  }

  function removeDraftTag(tag: string) {
    setDraftComic((cur) => ({ ...cur, tags: cur.tags.filter((t) => t !== tag) }));
  }

  function addDraftTagFromGroup(groupLabel: string) {
    const group = tagGroups.find((g) => g.label === groupLabel);
    if (!group) return;
    setDraftComic((cur) => {
      const next = group.values
        .map((v) => tagValue(group.label, v))
        .find((t) => !cur.tags.includes(t));
      return next ? { ...cur, tags: [...cur.tags, next] } : cur;
    });
  }

  function handleDialogOpenChange(open: boolean) {
    if (open) setDraftComic(savedComic);
    setDialogOpen(open);
  }

  function saveDraft() {
    setSavedComic(draftComic);
    setDialogOpen(false);
  }

  return (
    <>
      <section className="detail-hero">
        <CoverBlock title={`第1页 / 共${comic.pages}页`} color={comic.color} />
        <div className="pt-0.5">
          <p className="m-0 mb-1 font-extrabold" style={{ color: "var(--ink-muted)" }}>
            {savedComic.status === "tagged" ? "Tagged" : savedComic.source}
          </p>
          <h1 className="m-0 mt-0.5 text-[34px] leading-[1.15]" style={{ color: "var(--pink)" }}>
            {savedComic.title}
          </h1>
          <p className="text-[var(--ink-muted)]">{savedComic.originalTitle}</p>

          <div className="stat-grid">
            <div><strong>{comic.episodes}</strong><span>总话数</span></div>
            <div><strong>{comic.pages}</strong><span>总页数</span></div>
            <div><strong>{comic.format}</strong><span>格式</span></div>
            <div><strong>{comic.fileSize}</strong><span>文件大小</span></div>
          </div>

          <div className="flex flex-wrap gap-2">
            {savedComic.tags.map((tag) => (
              <Badge variant="outline" key={tag}>{tag}</Badge>
            ))}
          </div>

          <p className="mb-7 mt-6 text-[var(--ink)]">{savedComic.note}</p>

          <div className="flex flex-wrap gap-[10px] mt-7">
            <Link
              href={`/reader/${comic.id}`}
              className="inline-flex items-center justify-center gap-[7px] min-h-[38px] px-[14px] rounded-[10px] font-extrabold text-white shadow-[0_7px_14px_rgba(239,59,145,0.24)] no-underline"
              style={{ background: "var(--pink)", borderColor: "var(--pink)" }}
            >
              <Play size={16} />
              继续 {firstChapter?.title ?? "阅读"}
            </Link>
            <Button
              type="button"
              variant={favorite ? "secondary" : "outline"}
              onClick={() => setFavorite((cur) => !cur)}
            >
              <Heart data-icon="inline-start" />
              {favorite ? "已收藏 (2)" : "收藏"}
            </Button>
            <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
              <DialogTrigger render={<Button type="button" variant="outline" />}>
                <Edit3 data-icon="inline-start" />
                编辑信息
              </DialogTrigger>
              <ComicEditDialog
                draftComic={draftComic}
                comic={comic}
                onTagAdd={addDraftTagFromGroup}
                onTagRemove={removeDraftTag}
                onSave={saveDraft}
                onUpdate={updateDraft}
              />
            </Dialog>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-[14px]">章节列表</h2>
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
    </>
  );
}

function ComicEditDialog({
  comic,
  draftComic,
  onTagAdd,
  onTagRemove,
  onSave,
  onUpdate,
}: {
  comic: Comic;
  draftComic: EditableComic;
  onTagAdd: (groupLabel: string) => void;
  onTagRemove: (tag: string) => void;
  onSave: () => void;
  onUpdate: <F extends keyof EditableComic>(field: F, value: EditableComic[F]) => void;
}) {
  const classifiedTags = tagGroups
    .map((group) => ({
      ...group,
      selectedTags: draftComic.tags.filter((tag) => tag.startsWith(`${group.label.toLowerCase()}:`)),
    }))
    .filter((group) => group.selectedTags.length > 0);

  return (
    <DialogContent className="sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>编辑漫画信息</DialogTitle>
        <DialogDescription>{comic.fileTitle}</DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 overflow-y-auto max-h-[60vh]">
        <FieldGroup>
          <div className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="comic-title">标题</FieldLabel>
              <Input
                id="comic-title"
                value={draftComic.title}
                onChange={(e) => onUpdate("title", e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="comic-original-title">原始标题</FieldLabel>
              <Input
                id="comic-original-title"
                value={draftComic.originalTitle}
                onChange={(e) => onUpdate("originalTitle", e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="comic-artist">作者</FieldLabel>
              <Input
                id="comic-artist"
                value={draftComic.artist}
                onChange={(e) => onUpdate("artist", e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="comic-group">组名</FieldLabel>
              <Input
                id="comic-group"
                value={draftComic.group}
                onChange={(e) => onUpdate("group", e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="comic-source">来源</FieldLabel>
              <Input
                id="comic-source"
                value={draftComic.source}
                onChange={(e) => onUpdate("source", e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>状态</FieldLabel>
              <Select
                value={draftComic.status}
                onValueChange={(v) => onUpdate("status", v as ComicStatus)}
              >
                <SelectTrigger className="w-full bg-white data-[size=default]:h-9" aria-label="漫画状态">
                  <SelectValue placeholder="选择状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {statusOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="comic-local-path">本地路径</FieldLabel>
            <Input
              id="comic-local-path"
              value={draftComic.localPath}
              onChange={(e) => onUpdate("localPath", e.target.value)}
            />
            <FieldDescription>显示当前记录关联的本地文件位置。</FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="comic-note">备注</FieldLabel>
            <Textarea
              id="comic-note"
              value={draftComic.note}
              onChange={(e) => onUpdate("note", e.target.value)}
            />
          </Field>

          <section>
            <h3 className="m-0 text-[15px]" style={{ color: "#8f526e" }}>归类标签</h3>
            <div className="classified-tag-panel mt-2">
              {classifiedTags.map((group) => (
                <div className="classified-tag-row" key={group.label}>
                  <strong>{group.label}:</strong>
                  <div className="flex flex-wrap gap-[7px] min-w-0">
                    {group.selectedTags.map((tag) => (
                      <button className="tag-chip" key={tag} type="button" onClick={() => onTagRemove(tag)}>
                        {tagLabel(tag)} <span aria-hidden="true">x</span>
                      </button>
                    ))}
                    <button
                      className="tag-chip-add"
                      type="button"
                      aria-label={`添加 ${group.label} 标签`}
                      onClick={() => onTagAdd(group.label)}
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </FieldGroup>
      </div>

      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>
          取消
        </DialogClose>
        <Button type="button" onClick={onSave}>保存更改</Button>
      </DialogFooter>
    </DialogContent>
  );
}
