import { DEFAULT_ADMIN_TAB_ID, type AdminTabKind } from "./admin-tab-types";

interface AdminTabInfo {
  title: string;
  kind: AdminTabKind;
  closeable: boolean;
}

const EXACT_TITLES: Record<string, AdminTabInfo> = {
  "/admin": { title: "后台首页", kind: "dashboard", closeable: false },
  "/admin/paths": { title: "漫画路径", kind: "list", closeable: true },
  "/admin/comics": { title: "漫画管理", kind: "list", closeable: true },
  "/admin/files": { title: "文件维护", kind: "list", closeable: true },
  "/admin/tags": { title: "标签管理", kind: "list", closeable: true },
  "/admin/collections": { title: "收藏夹", kind: "list", closeable: true },
  "/admin/downloads": { title: "下载任务", kind: "list", closeable: true },
  "/admin/settings": { title: "系统设置", kind: "settings", closeable: true },
};

export function normalizeAdminTabPath(path: string) {
  if (!path.startsWith("/admin")) {
    return DEFAULT_ADMIN_TAB_ID;
  }

  const [withoutHash = DEFAULT_ADMIN_TAB_ID] = path.split("#");
  const [pathname = DEFAULT_ADMIN_TAB_ID, search = ""] = withoutHash.split("?");
  const normalizedPathname = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;

  return search ? `${normalizedPathname}?${search}` : normalizedPathname;
}

export function getAdminTabInfo(path: string): AdminTabInfo {
  const [pathname = DEFAULT_ADMIN_TAB_ID] = normalizeAdminTabPath(path).split("?");
  const exact = EXACT_TITLES[pathname];

  if (exact) {
    return exact;
  }

  if (/^\/admin\/comics\/[^/]+$/.test(pathname)) {
    return { title: "漫画详情", kind: "detail", closeable: true };
  }

  return { title: "管理页面", kind: "detail", closeable: true };
}
