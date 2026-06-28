"use client";

import Link from "next/link";
import { useState } from "react";
import { Edit3, Heart, Play, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
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
  SelectValue
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CoverBlock } from "@/components/SiteHeader";
import { type Comic, type ComicStatus, tagGroups } from "@/lib/mock-data";

type EditableComic = Pick<
  Comic,
  | "artist"
  | "group"
  | "localPath"
  | "note"
  | "originalTitle"
  | "source"
  | "status"
  | "tags"
  | "title"
>;

const statusOptions: Array<{ label: string; value: ComicStatus }> = [
  { label: "就绪", value: "ready" },
  { label: "已标注", value: "tagged" },
  { label: "缺封面", value: "missing_cover" },
  { label: "缺文件", value: "local_file_missing" }
];

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
    title: comic.title
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
  const [firstChapter] = comic.chapters;

  function updateDraft<FieldName extends keyof EditableComic>(
    field: FieldName,
    value: EditableComic[FieldName]
  ) {
    setDraftComic((current) => ({ ...current, [field]: value }));
  }

  function removeDraftTag(tag: string) {
    setDraftComic((current) => {
      return {
        ...current,
        tags: current.tags.filter((item) => item !== tag)
      };
    });
  }

  function addDraftTagFromGroup(groupLabel: string) {
    const group = tagGroups.find((item) => item.label === groupLabel);
    if (!group) {
      return;
    }

    setDraftComic((current) => {
      const nextValue = group.values
        .map((value) => tagValue(group.label, value))
        .find((tag) => !current.tags.includes(tag));

      if (!nextValue) {
        return current;
      }

      return { ...current, tags: [...current.tags, nextValue] };
    });
  }

  function handleDialogOpenChange(open: boolean) {
    if (open) {
      setDraftComic(savedComic);
    }
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
        <div className="detail-main">
          <p className="eyebrow">{savedComic.status === "tagged" ? "Tagged" : savedComic.source}</p>
          <h1>{savedComic.title}</h1>
          <p className="detail-subtitle">{savedComic.originalTitle}</p>

          <div className="stat-grid">
            <div><strong>{comic.episodes}</strong><span>总话数</span></div>
            <div><strong>{comic.pages}</strong><span>总页数</span></div>
            <div><strong>{comic.format}</strong><span>格式</span></div>
            <div><strong>{comic.fileSize}</strong><span>文件大小</span></div>
          </div>

          <div className="detail-tags">
            {savedComic.tags.map((tag) => (
              <Badge variant="outline" key={tag}>
                {tag}
              </Badge>
            ))}
          </div>

          <p className="detail-note">{savedComic.note}</p>

          <div className="detail-actions">
            <Link className="primary-action" href={`/reader/${comic.id}`}>
              <Play size={16} />
              继续 {firstChapter?.title ?? "阅读"}
            </Link>
            <Button
              type="button"
              variant={favorite ? "secondary" : "outline"}
              className="detail-action-button"
              onClick={() => setFavorite((current) => !current)}
            >
              <Heart data-icon="inline-start" />
              {favorite ? "已收藏 (2)" : "收藏"}
            </Button>
            <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
              <DialogTrigger asChild>
                <Button className="detail-action-button" type="button" variant="outline">
                  <Edit3 data-icon="inline-start" />
                  编辑信息
                </Button>
              </DialogTrigger>
              <ComicEditDialog
                comic={comic}
                draftComic={draftComic}
                onTagAdd={addDraftTagFromGroup}
                onTagRemove={removeDraftTag}
                onSave={saveDraft}
                onUpdate={updateDraft}
              />
            </Dialog>
          </div>
        </div>
      </section>

      <section className="chapter-section">
        <h2>章节列表</h2>
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
  onUpdate
}: {
  comic: Comic;
  draftComic: EditableComic;
  onTagAdd: (groupLabel: string) => void;
  onTagRemove: (tag: string) => void;
  onSave: () => void;
  onUpdate: <FieldName extends keyof EditableComic>(
    field: FieldName,
    value: EditableComic[FieldName]
  ) => void;
}) {
  const classifiedTags = tagGroups
    .map((group) => ({
      ...group,
      selectedTags: draftComic.tags.filter((tag) => tag.startsWith(`${group.label.toLowerCase()}:`))
    }))
    .filter((group) => group.selectedTags.length > 0);

  return (
    <DialogContent className="sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>编辑漫画信息</DialogTitle>
        <DialogDescription>{comic.fileTitle}</DialogDescription>
      </DialogHeader>

      <DialogBody>
        <FieldGroup>
          <div className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="comic-title">标题</FieldLabel>
              <Input
                id="comic-title"
                value={draftComic.title}
                onChange={(event) => onUpdate("title", event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="comic-original-title">原始标题</FieldLabel>
              <Input
                id="comic-original-title"
                value={draftComic.originalTitle}
                onChange={(event) => onUpdate("originalTitle", event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="comic-artist">作者</FieldLabel>
              <Input
                id="comic-artist"
                value={draftComic.artist}
                onChange={(event) => onUpdate("artist", event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="comic-group">组名</FieldLabel>
              <Input
                id="comic-group"
                value={draftComic.group}
                onChange={(event) => onUpdate("group", event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="comic-source">来源</FieldLabel>
              <Input
                id="comic-source"
                value={draftComic.source}
                onChange={(event) => onUpdate("source", event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>状态</FieldLabel>
              <Select
                value={draftComic.status}
                onValueChange={(value) => onUpdate("status", value as ComicStatus)}
              >
                <SelectTrigger className="w-full bg-white data-[size=default]:h-9" aria-label="漫画状态">
                  <SelectValue placeholder="选择状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {statusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
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
              onChange={(event) => onUpdate("localPath", event.target.value)}
            />
            <FieldDescription>显示当前记录关联的本地文件位置。</FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="comic-note">备注</FieldLabel>
            <Textarea
              id="comic-note"
              value={draftComic.note}
              onChange={(event) => onUpdate("note", event.target.value)}
            />
          </Field>

          <section className="classified-tags">
            <h3>归类标签</h3>
            <div className="classified-tag-panel">
              {classifiedTags.map((group) => (
                <div className="classified-tag-row" key={group.label}>
                  <strong>{group.label}:</strong>
                  <div>
                    {group.selectedTags.map((tag) => (
                      <button className="tag-chip" key={tag} type="button" onClick={() => onTagRemove(tag)}>
                        {tagLabel(tag)} <span aria-hidden="true">×</span>
                      </button>
                    ))}
                    <button className="tag-chip-add" type="button" aria-label={`添加 ${group.label} 标签`} onClick={() => onTagAdd(group.label)}>
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </FieldGroup>
      </DialogBody>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">取消</Button>
        </DialogClose>
        <Button type="button" onClick={onSave}>
          保存更改
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
