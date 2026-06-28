"use client";

import { useState } from "react";
import { Folder, Library, Plus, RefreshCcw, Settings, Tag, X } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { comics, settingsTabs, tagGroups } from "@/lib/mock-data";

type AdminPanel = "paths" | "comics" | "tags" | "settings";

export default function AdminPage() {
  const [panel, setPanel] = useState<AdminPanel>("paths");
  const [settingsTab, setSettingsTab] = useState<(typeof settingsTabs)[number]>("常规设置");

  return (
    <>
      <SiteHeader active="admin" />
      <main className="admin-shell">
        <aside className="admin-sidebar">
          {([
            { id: "paths", icon: Folder, label: "漫画路径" },
            { id: "comics", icon: Library, label: "漫画管理" },
            { id: "tags", icon: Tag, label: "标签管理" },
            { id: "settings", icon: Settings, label: "系统设置" },
          ] as const).map((item) => (
            <button
              key={item.id}
              className={panel === item.id ? "is-active" : ""}
              type="button"
              onClick={() => setPanel(item.id as AdminPanel)}
            >
              <item.icon size={18} />
              {item.label}
            </button>
          ))}
        </aside>

        <section className="admin-content">
          {panel === "paths" && <PathPanel />}
          {panel === "comics" && <ComicAdminPanel />}
          {panel === "tags" && <TagAdminPanel />}
          {panel === "settings" && <SettingsPanel activeTab={settingsTab} onTabChange={setSettingsTab} />}
        </section>
      </main>
    </>
  );
}

function PathPanel() {
  return (
    <section className="admin-card">
      <h1 className="flex items-center gap-[10px] m-0 mb-[18px] text-[20px] text-[var(--ink)]">
        <Folder size={22} /> 漫画路径设置
      </h1>
      <p style={{ color: "var(--ink-muted)" }}>设置本地漫画文件夹路径，系统将自动扫描这些目录下的漫画文件。</p>

      <label className="grid gap-2 my-[22px] font-extrabold" style={{ color: "#8f526e" }}>
        添加新路径 <span className="text-[13px] font-normal" style={{ color: "var(--ink-muted)" }}>支持多行，每行一个路径</span>
        <textarea
          className="min-h-[98px] resize-y p-[13px_16px] rounded-[11px] border bg-[#fff8fc] text-[14px]/[1.6] font-mono text-[#3f3142]"
          style={{ borderColor: "var(--pink-line)" }}
          defaultValue={"D:\\NewComics\nE:\\Downloads\\Comics\n\\\\NAS\\Comics"}
        />
      </label>

      <div className="flex justify-end -mt-6 mb-[18px]">
        <button
          type="button"
          className="inline-flex items-center justify-center gap-1.5 min-h-[36px] px-4 rounded-[10px] font-extrabold text-white shadow-[0_7px_14px_rgba(239,59,145,0.3)]"
          style={{ background: "var(--pink)" }}
        >
          <Plus size={16} /> 添加
        </button>
      </div>

      <div className="grid gap-3">
        {[
          { path: "D:\\Comics\\Manga", status: "ok" as const, count: 156 },
          { path: "E:\\Downloads\\Comics", status: "ok" as const, count: 89 },
          { path: "F:\\Backup\\OldComics", status: "missing" as const },
        ].map((item) => (
          <div className="path-item" key={item.path}>
            <code className="overflow-wrap-anywhere text-[#201422] text-[14px] font-mono">{item.path}</code>
            <span className={`scan-status ${item.status}`}>
              {item.status === "ok" ? `已扫描 ${item.count} 本` : "路径不存在"}
            </span>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 min-h-[34px] px-3 rounded-lg font-extrabold"
              style={{ background: "#fff4fa", color: "var(--pink)" }}
            >
              <RefreshCcw size={15} /> 重新扫描
            </button>
            <button
              className="inline-flex w-[38px] h-[38px] items-center justify-center rounded-[10px] bg-white border border-[#ffc7c7] text-[#f04a4a]"
              type="button"
              aria-label={`删除 ${item.path}`}
            >
              <X size={18} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function ComicAdminPanel() {
  return (
    <section className="admin-card">
      <h1 className="flex items-center gap-[10px] m-0 mb-[18px] text-[20px] text-[var(--ink)]">
        <Library size={22} /> 漫画管理
      </h1>
      <p style={{ color: "var(--ink-muted)" }}>查看扫描结果、文件状态和需要维护的漫画记录。</p>
      <div className="admin-table mt-5">
        {comics.map((comic) => (
          <div className="admin-row" key={comic.id}>
            <strong className="truncate">{comic.title}</strong>
            <span>{comic.artist}</span>
            <span>{comic.pages} 页</span>
            <button type="button">编辑</button>
          </div>
        ))}
      </div>
    </section>
  );
}

function TagAdminPanel() {
  return (
    <section className="admin-card">
      <h1 className="flex items-center gap-[10px] m-0 mb-[18px] text-[20px] text-[var(--ink)]">
        <Tag size={22} /> 标签管理
      </h1>
      <p style={{ color: "var(--ink-muted)" }}>管理所有可用的分类标签。点击 x 可删除标签。</p>
      <div className="tag-manager-list">
        {tagGroups.map((group) => (
          <div className="tag-manager-row" key={group.label}>
            <strong>{group.label}:</strong>
            <div className="flex flex-wrap gap-2">
              {group.values.map((tag) => (
                <button key={tag} type="button" className="tag-manager-row-button">
                  {tag} x
                </button>
              ))}
              <button type="button" className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-md border border-dashed border-[#ff9bc5] bg-[#fff8fc] text-[var(--pink)] font-black text-xs">
                +
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-[10px]">
        <label className="font-extrabold text-[#3a2034]">
          添加新分类
          <span className="grid grid-cols-[minmax(0,1fr)_auto] gap-[10px] mt-[10px]">
            <input
              className="min-h-[48px] px-4 rounded-[10px] border bg-[#fff8fc] text-[#4c3345]"
              style={{ borderColor: "var(--pink-line)" }}
              placeholder="例如 parody 或 cosplayer"
            />
            <button
              type="button"
              className="inline-flex items-center justify-center gap-1.5 min-h-[48px] px-[22px] rounded-[10px] font-extrabold text-white shadow-[0_7px_14px_rgba(239,59,145,0.3)]"
              style={{ background: "var(--pink)" }}
            >
              <Plus size={16} /> 添加分类
            </button>
          </span>
        </label>
      </div>
    </section>
  );
}

function SettingsPanel({
  activeTab,
  onTabChange,
}: {
  activeTab: (typeof settingsTabs)[number];
  onTabChange: (tab: (typeof settingsTabs)[number]) => void;
}) {
  return (
    <section className="admin-card">
      <h1 className="flex items-center gap-[10px] m-0 mb-[18px] text-[20px] text-[var(--ink)]">
        <Settings size={22} /> 系统设置
      </h1>
      <p style={{ color: "var(--ink-muted)" }}>本地自托管配置按用途分组，原型只展示模拟选项。</p>
      <div className="settings-tabs" role="tablist">
        {settingsTabs.map((tab) => (
          <button
            key={tab}
            className={activeTab === tab ? "is-active" : ""}
            type="button"
            onClick={() => onTabChange(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="grid">
        {activeTab === "常规设置" && (
          <>
            <SettingSwitch title="自动扫描" note="启动时自动扫描所有漫画路径" defaultChecked />
            <SettingSwitch title="阅读进度记录" note="自动记录每本漫画的阅读进度" defaultChecked />
            <SettingSelect title="默认阅读模式" note="选择打开漫画时的默认阅读方式" defaultValue="滚动模式" options={["滚动模式", "分页模式", "双页模式"]} />
            <SettingSwitch title="图片预加载" note="阅读时提前加载后续页面" />
            <SettingSelect title="每页显示数量" note="漫画列表每页显示的漫画数" defaultValue="20" options={["20", "40", "80"]} />
          </>
        )}
        {activeTab === "阅读设置" && (
          <>
            {["向上滚动 ↑", "向下滚动 ↓", "翻下一屏 Space", "返回详情 Esc", "显示工具栏 Tab"].map((item) => {
              const [title, key] = item.split(" ");
              return (
                <div className="setting-row" key={item}>
                  <span><strong>{title}</strong><small>点击按键输入框后按下新的快捷键即可修改</small></span>
                  <kbd className="inline-flex items-center justify-center min-w-[60px] min-h-[36px] px-3 rounded-lg border bg-white font-mono font-extrabold" style={{ borderColor: "var(--pink-line)" }}>{key}</kbd>
                </div>
              );
            })}
          </>
        )}
        {activeTab === "扫描设置" && (
          <>
            {["支持格式：zip / cbz / 目录", "忽略目录：__MACOSX, .DS_Store", "封面优先级：cover.* 优先"].map((item) => (
              <div className="setting-row" key={item}>
                <span><strong>{item}</strong><small>原型配置项，后续接入真实设置存储</small></span>
              </div>
            ))}
          </>
        )}
        {activeTab === "安全设置" && (
          <>
            {["导入令牌：已隐藏", "写接口保护：开启", "日志脱敏：开启"].map((item) => (
              <div className="setting-row" key={item}>
                <span><strong>{item}</strong><small>原型配置项，后续接入真实设置存储</small></span>
              </div>
            ))}
          </>
        )}
      </div>
    </section>
  );
}

function SettingSwitch({ title, note, defaultChecked = false }: { title: string; note: string; defaultChecked?: boolean }) {
  return (
    <label className="setting-row">
      <span><strong>{title}</strong><small>{note}</small></span>
      <input type="checkbox" defaultChecked={defaultChecked} className="w-[44px] h-6 accent-[var(--pink)]" />
    </label>
  );
}

function SettingSelect({ title, note, defaultValue, options }: { title: string; note: string; defaultValue: string; options: string[] }) {
  return (
    <div className="setting-row">
      <span><strong>{title}</strong><small>{note}</small></span>
      <select
        defaultValue={defaultValue}
        className="w-full min-w-[150px] h-[38px] px-3 rounded-[10px] bg-white border cursor-pointer text-[var(--ink)]"
        style={{ borderColor: "var(--pink-line)" }}
        aria-label={title}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  );
}
