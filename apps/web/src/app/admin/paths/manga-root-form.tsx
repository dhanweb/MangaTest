"use client";

import { useActionState } from "react";

import { saveMangaRootAction, type SaveMangaRootState } from "./actions";

const initialState: SaveMangaRootState = {
  status: "idle",
  message: "",
};

export function MangaRootForm() {
  const [state, formAction, isPending] = useActionState(saveMangaRootAction, initialState);

  return (
    <form action={formAction} className="grid gap-4 rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="grid gap-2">
        <label className="text-sm font-black" htmlFor="manga-root-path">
          绝对路径
        </label>
        <input
          className="min-h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          id="manga-root-path"
          name="absolutePath"
          placeholder="D:\\manga"
          type="text"
        />
        <p className="text-xs leading-5 text-muted-foreground">必须使用绝对路径。系统不会自动创建父目录。</p>
      </div>
      <div className="grid gap-2">
        <label className="text-sm font-black" htmlFor="manga-root-name">
          显示名称
        </label>
        <input
          className="min-h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          id="manga-root-name"
          name="displayName"
          placeholder="本地漫画库"
          type="text"
        />
      </div>
      <button
        className="min-h-10 rounded-md bg-primary px-4 text-sm font-black text-primary-foreground hover:bg-[var(--pink-strong)] disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "保存中..." : "保存根目录"}
      </button>
      {state.message ? (
        <p className={state.status === "error" ? "text-sm font-bold text-destructive" : "text-sm font-bold text-primary"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
