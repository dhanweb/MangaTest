# 阅读页窗口化与虚拟化设计

## Architecture boundary

数据流保持为：

```text
reader route
  -> library reader manifest/window repository methods
  -> SQLite chapters/pages queries
  -> ReaderView page-window cache
  -> virtual main-page rail + virtual thumbnail rail
  -> existing /api/pages/:pageId and thumbnail API
```

`ReaderView` 不知道数据库字段或文件路径，只消费 reader 专用的 manifest、page-window 和页面 URL。页面图片仍由现有 `pageId` API 读取，客户端不会获得也不会提交绝对路径。

## Data contracts

新增 reader manifest/window 类型，沿用现有 `ReaderPageRecord` 的页面字段：

```ts
interface ReaderChapterManifest extends LibraryChapterRecord {
  startIndex: number;
}

interface ReaderManifestRecord {
  id: string;
  displayTitle: string;
  lastReadPageId: string | null;
  lastReadPageIndex: number | null;
  totalPages: number;
  chapters: ReaderChapterManifest[];
  initialPages: ReaderPageRecord[];
}

interface ReaderPageWindowRecord {
  comicId: string;
  startIndex: number;
  totalPages: number;
  pages: ReaderPageRecord[];
}
```

窗口接口为 `GET /api/reader/:comicId/pages?start=<integer>&limit=<integer>`：

- `comicId` 从路由参数读取，并在 repository 中校验漫画存在、可读且未被删除。
- `start` 默认 0，限制为非负整数；`limit` 默认 48，限制在 1–96。
- 越界 start 返回空 pages 和真实 totalPages；不接受路径字段。
- repository 按章节排序和页码排序计算全局索引，窗口可跨章节，返回的 `ReaderPageRecord` 包含章节标题和宽高。

初始 route 只调用 manifest 方法，manifest 内只包含有限窗口（推荐当前页前后各 24 页，合计最多 48 页）。`getReaderData()` 保留给现有合并/扫描测试和非 reader 内部调用，避免无关行为变化；真实阅读页改用新 manifest 方法。

## Main page virtualizer

不引入第三方虚拟列表依赖，增加 reader 纯函数布局工具，负责：

- 根据页面宽高或 `2 / 3` fallback 计算估算高度；
- 根据章节 `startIndex` 加入固定章节分隔高度；
- 生成全局 page index 的前缀位置、总高度；
- 用二分查找从 scrollTop 推导可视 index，并扩展有限 overscan；
- 将远处页面表示为一个 spacer，实际只渲染可视窗口。

页面窗口缓存按全局 index 存放在 `Map<number, ReaderPageRecord>`；滚动接近未知页面时只请求合并后的窗口，不重复请求已缓存页。页面宽高字段已经由扫描记录；已知宽高时布局高度稳定，缺失宽高使用固定比例，避免因为图片加载而逐页更新整个 6,000+ 页面树。

## Thumbnail virtualizer

缩略图使用固定行高 `THUMB_ROW_HEIGHT` 的绝对定位 spacer：rail 保持完整滚动高度，只渲染 `thumbVisibleRange` 加 overscan 的按钮。远处跳转时先设置 rail scrollTop，再请求目标页面窗口；当前页对应页面未在缓存中时显示占位，窗口到达后替换为真实缩略图。

## Compatibility and failure handling

- 初始阅读页根据 `lastReadPageIndex` 定位；没有进度时使用 index 0。
- 页面窗口 fetch 失败时保留占位并显示轻量错误状态，不阻塞已有页面滚动；请求可在用户继续滚动时重试。
- 已有 `saveReadingProgress(pageId, progressPercent)` 不变，进度只在缓存中有目标 `pageId` 时发送。
- 现有页面图片和缩略图 API 不接受任意路径，缓存行为保持不变。
- `getReaderData()` 的旧全量行为只保留为兼容内部测试/调用，不再由生产 reader route 使用。

## Rollback

若虚拟布局出现偏移，保留新的窗口 repository/API，临时把 ReaderView 的渲染窗口扩大到全部已缓存页面即可定位问题；不涉及数据库迁移或物理文件，回滚只需恢复 reader route、repository 新方法和组件改动。
