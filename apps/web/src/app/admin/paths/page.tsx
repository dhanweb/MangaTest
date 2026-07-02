import { DEFAULT_SCAN_MODE } from "@/modules/core/config";

const rules = [
  "必须使用绝对路径",
  "系统不会自动创建父目录",
  "MVP 支持多个 manga root",
  "第一阶段只实现子项为漫画",
  "启动时不自动扫描，由后台手动触发",
];

export default function AdminPathsPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <header className="grid gap-2 border-b border-border pb-5">
        <p className="text-sm font-bold text-primary">Manga Roots</p>
        <h1 className="text-2xl font-black">漫画根目录</h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          真实保存和扫描动作会在下一步接入 SQLite repository 和 scan session service。这里先落定路径规则和管理入口。
        </p>
      </header>

      <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <form className="grid gap-4 rounded-lg border border-border bg-card p-5 shadow-sm">
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
            <p className="text-xs leading-5 text-muted-foreground">暂未提交到数据库。下一步会接 Server Action 和 repository。</p>
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
          <button className="min-h-10 rounded-md bg-primary px-4 text-sm font-black text-primary-foreground hover:bg-[var(--pink-strong)]" type="button">
            保存根目录
          </button>
        </form>

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
    </main>
  );
}
