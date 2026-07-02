const adminItems = [
  "manga root 设置",
  "手动扫描",
  "缺失文件",
  "疑似重复",
  "缓存状态",
  "备份导出",
];

export default function AdminPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <header className="grid gap-2 border-b border-border pb-5">
        <p className="text-sm font-bold text-primary">Admin</p>
        <h1 className="text-2xl font-black">后台管理入口</h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          MVP 后台会优先承载本地库设置、扫描结果、缺失文件、危险操作日志和缓存维护。前台只展示本地可读漫画。
        </p>
      </header>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {adminItems.map((item) => (
          <div key={item} className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <h2 className="font-black">{item}</h2>
          </div>
        ))}
      </section>
    </main>
  );
}
