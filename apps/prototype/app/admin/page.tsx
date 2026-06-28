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
          <button className={panel === "paths" ? "is-active" : ""} type="button" onClick={() => setPanel("paths")}><Folder size={18} /> 漫画路径</button>
          <button className={panel === "comics" ? "is-active" : ""} type="button" onClick={() => setPanel("comics")}><Library size={18} /> 漫画管理</button>
          <button className={panel === "tags" ? "is-active" : ""} type="button" onClick={() => setPanel("tags")}><Tag size={18} /> 标签管理</button>
          <button className={panel === "settings" ? "is-active" : ""} type="button" onClick={() => setPanel("settings")}><Settings size={18} /> 系统设置</button>
        </aside>

        <section className="admin-content">
          {panel === "paths" ? <PathPanel /> : null}
          {panel === "comics" ? <ComicAdminPanel /> : null}
          {panel === "tags" ? <TagAdminPanel /> : null}
          {panel === "settings" ? <SettingsPanel activeTab={settingsTab} onTabChange={setSettingsTab} /> : null}
        </section>
      </main>
    </>
  );
}

function PathPanel() {
  return (
    <section className="admin-card">
      <h1><Folder size={22} /> 漫画路径设置</h1>
      <p>设置本地漫画文件夹路径，系统将自动扫描这些目录下的漫画文件。</p>
      <label className="path-input">
        添加新路径 <span>支持多行，每行一个路径</span>
        <textarea defaultValue={"D:\\NewComics\nE:\\Downloads\\Comics\n\\\\NAS\\Comics"} />
      </label>
      <button className="pink-button" type="button"><Plus size={16} /> 添加</button>
      <div className="path-list">
        {["D:\\Comics\\Manga", "E:\\Downloads\\Comics", "F:\\Backup\\OldComics"].map((path, index) => (
          <div className="path-item" key={path}>
            <code>{path}</code>
            <span className={index === 2 ? "scan-status missing" : "scan-status ok"}>{index === 2 ? "路径不存在" : `已扫描 ${index === 0 ? 156 : 89} 本`}</span>
            <button type="button"><RefreshCcw size={15} /> 重新扫描</button>
            <button className="icon-button" type="button" aria-label="删除路径"><X size={18} /></button>
          </div>
        ))}
      </div>
    </section>
  );
}

function ComicAdminPanel() {
  return (
    <section className="admin-card">
      <h1><Library size={22} /> 漫画管理</h1>
      <p>查看扫描结果、文件状态和需要维护的漫画记录。</p>
      <div className="admin-table">
        {comics.map((comic) => (
          <div className="admin-row" key={comic.id}>
            <strong>{comic.title}</strong>
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
      <h1><Tag size={22} /> 标签管理</h1>
      <p>管理所有可用的分类标签。点击 x 可删除标签。</p>
      <div className="tag-manager-list">
        {tagGroups.map((group) => (
          <div className="tag-manager-row" key={group.label}>
            <strong>{group.label}:</strong>
            <div>
              {group.values.map((tag, index) => <button key={tag} type="button">{tag} {index + 1} x</button>)}
              <button className="add-chip" type="button">+</button>
            </div>
          </div>
        ))}
      </div>
      <label className="add-category">
        添加新分类
        <span>
          <input placeholder="例如 parody 或 cosplayer" />
          <button className="pink-button" type="button"><Plus size={16} /> 添加分类</button>
        </span>
      </label>
    </section>
  );
}

function SettingsPanel({ activeTab, onTabChange }: { activeTab: (typeof settingsTabs)[number]; onTabChange: (tab: (typeof settingsTabs)[number]) => void }) {
  return (
    <section className="admin-card">
      <h1><Settings size={22} /> 系统设置</h1>
      <p>本地自托管配置按用途分组，原型只展示模拟选项。</p>
      <div className="settings-tabs">
        {settingsTabs.map((tab) => <button className={activeTab === tab ? "is-active" : ""} key={tab} type="button" onClick={() => onTabChange(tab)}>{tab}</button>)}
      </div>
      <div className="settings-list">
        {activeTab === "常规设置" ? (
          <>
            <SettingSwitch title="自动扫描" note="启动时自动扫描所有漫画路径" checked />
            <SettingSwitch title="阅读进度记录" note="自动记录每本漫画的阅读进度" checked />
            <SettingSelect title="默认阅读模式" note="选择打开漫画时的默认阅读方式" value="滚动模式" />
            <SettingSwitch title="图片预加载" note="阅读时提前加载后续页面" />
            <SettingSelect title="每页显示数量" note="漫画列表每页显示的漫画数" value="20" />
          </>
        ) : null}
        {activeTab === "阅读设置" ? ["向上滚动 ↑", "向下滚动 ↓", "翻下一屏 Space", "返回详情 Esc", "显示工具栏 Tab"].map((item) => <SettingKey item={item} key={item} />) : null}
        {activeTab === "扫描设置" ? ["支持格式：zip / cbz / 目录", "忽略目录：__MACOSX, .DS_Store", "封面优先级：cover.* 优先"].map((item) => <SettingText item={item} key={item} />) : null}
        {activeTab === "安全设置" ? ["导入令牌：已隐藏", "写接口保护：开启", "日志脱敏：开启"].map((item) => <SettingText item={item} key={item} />) : null}
      </div>
    </section>
  );
}

function SettingSwitch({ title, note, checked = false }: { title: string; note: string; checked?: boolean }) {
  return <label className="setting-row"><span><strong>{title}</strong><small>{note}</small></span><input type="checkbox" defaultChecked={checked} /></label>;
}

function SettingSelect({ title, note, value }: { title: string; note: string; value: string }) {
  return <label className="setting-row"><span><strong>{title}</strong><small>{note}</small></span><select defaultValue={value}><option>{value}</option><option>分页模式</option></select></label>;
}

function SettingKey({ item }: { item: string }) {
  const [title, key] = item.split(" ");
  return <div className="setting-row"><span><strong>{title}</strong><small>点击按键输入框后按下新的快捷键即可修改</small></span><kbd>{key}</kbd></div>;
}

function SettingText({ item }: { item: string }) {
  return <div className="setting-row"><span><strong>{item}</strong><small>原型配置项，后续接入真实设置存储</small></span></div>;
}
