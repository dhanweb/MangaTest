import Link from "next/link";

const adminItems = [
  {
    title: "manga root 设置",
    description: "配置一个或多个漫画根目录，第一阶段只实现子项为漫画。",
    href: "/admin/paths",
  },
  {
    title: "系统设置",
    description: "监听地址、缓存目录、缓存上限、备份导出和阅读偏好。",
    href: "/admin/settings",
  },
  {
    title: "手动扫描",
    description: "下一步接入 scan session，记录新增、缺失、疑似重复和可恢复项目。",
    href: "/admin/paths",
  },
  {
    title: "缓存状态",
    description: "后续展示封面、reader 缩略图、压缩包文件列表和最近页面缓存。",
    href: "/admin/settings",
  },
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
          <Link key={item.title} className="grid gap-2 rounded-lg border border-border bg-card p-4 shadow-sm hover:border-primary hover:bg-secondary" href={item.href}>
            <h2 className="font-black">{item.title}</h2>
            <p className="text-sm leading-6 text-muted-foreground">{item.description}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
