import { DEFAULT_SCAN_MODE } from "@/modules/core/config";
import { createMangaRootRepository } from "@/modules/library/manga-roots.repository";
import { createScanSessionRepository } from "@/modules/library/scan-sessions.repository";

import { createScanSessionAction } from "./actions";
import { MangaRootForm } from "./manga-root-form";

export const dynamic = "force-dynamic";

const rules = [
  "必须使用绝对路径",
  "系统不会自动创建父目录",
  "MVP 支持多个 manga root",
  "第一阶段只实现子项为漫画",
  "启动时不自动扫描，由后台手动触发",
];

export default async function AdminPathsPage() {
  const mangaRoots = await createMangaRootRepository().list();
  const scanSessions = await createScanSessionRepository().listRecent();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <header className="grid gap-2 border-b border-border pb-5">
        <p className="text-sm font-bold text-primary">Manga Roots</p>
        <h1 className="text-2xl font-black">漫画根目录</h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          漫画根目录会保存到本地 SQLite。下一步会在这里接入 scan session 和手动扫描按钮。
        </p>
      </header>

      <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <MangaRootForm />

        <aside className="grid gap-3 rounded-lg border border-border bg-card p-5 shadow-sm">
          <div>
            <h2 className="font-black">扫描规则</h2>
            <p className="text-sm text-muted-foreground">当前模式：{DEFAULT_SCAN_MODE}</p>
          </div>
          <ul className="grid gap-2 text-sm text-muted-foreground">
            {rules.map((rule) => (
              <li key={rule} className="rounded-md bg-secondary px-3 py-2 font-bold text-primary">
                {rule}
              </li>
            ))}
          </ul>
        </aside>
      </section>

      <section className="grid gap-3">
        <div>
          <h2 className="font-black">已配置根目录</h2>
          <p className="text-sm text-muted-foreground">前台只展示本地可读漫画。缺失、隐藏、remote-only 记录会留在后台。</p>
        </div>
        {mangaRoots.length ? (
          <div className="grid gap-3">
            {mangaRoots.map((root) => (
              <article key={root.id} className="grid gap-2 rounded-lg border border-border bg-card p-4 shadow-sm md:grid-cols-[1fr_auto] md:items-center">
                <div className="grid gap-1">
                  <h3 className="font-black">{root.displayName || root.absolutePath}</h3>
                  <p className="break-all text-sm text-muted-foreground">{root.absolutePath}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-secondary px-3 py-2 text-sm font-bold text-primary">
                    {root.isEnabled ? "启用" : "停用"}
                  </span>
                  <form action={createScanSessionAction}>
                    <input name="mangaRootId" type="hidden" value={root.id} />
                    <button className="min-h-9 rounded-md border border-border bg-background px-3 text-sm font-black text-primary hover:border-primary hover:bg-secondary" type="submit">
                      创建扫描批次
                    </button>
                  </form>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-card p-6 text-sm font-bold text-muted-foreground">
            还没有配置 manga root。先添加一个绝对路径，再开始手动扫描。
          </div>
        )}
      </section>

      <section className="grid gap-3">
        <div>
          <h2 className="font-black">最近扫描批次</h2>
          <p className="text-sm text-muted-foreground">当前只创建 queued 记录。下一步会让扫描器消费这个批次并写入结果。</p>
        </div>
        {scanSessions.length ? (
          <div className="grid gap-3">
            {scanSessions.map((session) => (
              <article key={session.id} className="grid gap-2 rounded-lg border border-border bg-card p-4 shadow-sm md:grid-cols-[1fr_auto] md:items-center">
                <div className="grid gap-1">
                  <h3 className="font-black">扫描批次 {session.id.slice(0, 8)}</h3>
                  <p className="text-sm text-muted-foreground">root: {session.mangaRootId}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-bold">
                  <span className="rounded-md bg-secondary px-2 py-1 text-primary">{session.status}</span>
                  <span className="rounded-md bg-background px-2 py-1 text-muted-foreground">新增 {session.addedCount}</span>
                  <span className="rounded-md bg-background px-2 py-1 text-muted-foreground">缺失 {session.missingCount}</span>
                  <span className="rounded-md bg-background px-2 py-1 text-muted-foreground">疑似重复 {session.duplicateCandidateCount}</span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-card p-6 text-sm font-bold text-muted-foreground">
            还没有扫描批次。保存 manga root 后，可以先创建一个 queued 批次。
          </div>
        )}
      </section>
    </main>
  );
}
