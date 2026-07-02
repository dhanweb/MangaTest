import Link from "next/link";

const foundationItems = [
  "SQLite + Drizzle schema foundation",
  "NestJS-like module boundaries",
  "Local readable comics first",
  "Reader page access by pageId",
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <p className="text-sm font-bold text-primary">MangaTest</p>
          <h1 className="text-2xl font-black tracking-normal">本地漫画库</h1>
        </div>
        <nav className="flex gap-2 text-sm font-bold">
          <Link className="rounded-md px-3 py-2 text-primary hover:bg-secondary" href="/">
            首页
          </Link>
          <Link className="rounded-md px-3 py-2 text-muted-foreground hover:bg-secondary hover:text-primary" href="/admin">
            管理
          </Link>
        </nav>
      </header>

      <section className="grid gap-5 rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="grid gap-2">
          <h2 className="text-xl font-black">真实项目 MVP 地基</h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            当前应用先建立真实项目结构、模块边界和数据模型。下一步会从 manga root 设置和手动扫描开始，打通本地目录 / zip / cbz 到 reader 的第一条闭环。
          </p>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {foundationItems.map((item) => (
            <li key={item} className="rounded-md border border-border bg-background px-3 py-2 text-sm font-bold">
              {item}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
