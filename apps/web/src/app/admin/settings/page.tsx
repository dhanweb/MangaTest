import { defaultRuntimeSettings, settingDefinitions } from "@/modules/core/settings";

const settingRows = settingDefinitions.map((setting) => ({
  ...setting,
  currentValue: String(defaultRuntimeSettings[setting.key as keyof typeof defaultRuntimeSettings]),
}));

export default function AdminSettingsPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <header className="grid gap-2 border-b border-border pb-5">
        <p className="text-sm font-bold text-primary">Settings</p>
        <h1 className="text-2xl font-black">系统设置</h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          这里先固定第一阶段需要的设置项。下一步接入 Drizzle repository 后，再把这些值写入 SQLite。
        </p>
      </header>

      <section className="grid gap-3">
        {settingRows.map((setting) => (
          <article key={setting.key} className="grid gap-2 rounded-lg border border-border bg-card p-4 shadow-sm md:grid-cols-[1fr_auto] md:items-center">
            <div className="grid gap-1">
              <h2 className="font-black">{setting.label}</h2>
              <p className="text-sm leading-6 text-muted-foreground">{setting.description}</p>
            </div>
            <code className="rounded-md bg-secondary px-3 py-2 text-sm font-bold text-primary">{setting.currentValue}</code>
          </article>
        ))}
      </section>
    </main>
  );
}
