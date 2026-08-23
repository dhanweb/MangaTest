# 视频集数管理增强 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 允许后台编辑集标题、移除误合并的集数，并支持在带视频封面的扩大弹框中多选视频合并为当前视频的多个集数。

**Architecture:** 保持 `video-library` 负责集数归属、标题和可逆合并规则；Route Handler 只解析请求并调用仓储；管理面板负责表单状态、批量选择和封面展示。移除目标视频中的合并集数通过现有可逆恢复语义还原来源视频，不删除真实文件。

**Tech Stack:** Next.js App Router、TypeScript、React、Mantine、Drizzle ORM、Vitest。

## Global Constraints

- `docs/plan.md` 是产品范围、架构和模块边界的事实来源。
- 视频合并只修改数据库归属，不移动或删除真实视频文件。
- 合并操作必须可逆；被合并的视频恢复后重新成为独立视频。
- API 不接受客户端任意文件路径；封面通过受控的视频 ID 接口读取。
- UI 使用项目 `globals.css` 的语义色彩令牌和 Mantine 组件，不引入新依赖。
- 前端改动完成后运行 `npm run lint -w apps/web`、`npm run typecheck -w apps/web` 和相关 Vitest 测试。

---

### Task 1: 扩展视频仓储数据与可逆合并服务

**Files:**
- Modify: `apps/web/src/modules/video-library/videos.repository.ts`
- Modify: `apps/web/src/modules/video-library/video-merge.repository.ts`
- Test: `apps/web/src/modules/video-library/video-merge.repository.test.ts`

**Interfaces:**
- `VideoEpisodeRecord` 增加 `mergedFromVideoId: string | null`，详情查询通过 `videos.merged_as_episode_id = video_episodes.id` 找到来源视频。
- `VideoMergeRepository` 增加 `mergeAsEpisodes(sourceVideoIds: string[], targetVideoId: string): Promise<VideoMergeResult[]>` 和 `removeMergedEpisode(targetVideoId: string, episodeId: string): Promise<VideoMergeResult>`；保留 `mergeAsEpisode` 作为单个合并兼容入口。

- [x] **Step 1: 扩展详情查询返回来源视频 ID**

在 `getDetail` 的 episode 查询中增加自连接 `videos as sourceVideos`，选择 `sourceVideos.id` 为 `mergedFromVideoId`；未通过合并加入当前视频的集数返回 `null`。

- [x] **Step 2: 实现批量合并**

将现有单集校验复用到每个来源视频：去重输入、拒绝空列表、拒绝当前目标、要求来源和目标可读、来源未合并且只有一个非缺失集。使用一次数据库事务按当前最大 `sortOrder + 1` 依次接入全部集数，并为每个来源写 `merge_video_episode` 操作日志；遇到任一非法来源时整个事务失败。

核心接口形状：

```ts
mergeAsEpisodes(sourceVideoIds: string[], targetVideoId: string): Promise<VideoMergeResult[]>;
```

- [x] **Step 3: 实现按目标和集数移除**

根据 `targetVideoId`、`episodeId` 找到 `videos.parentVideoId = targetVideoId` 且 `videos.mergedAsEpisodeId = episodeId` 的来源视频，然后调用同一恢复逻辑，将集数归还来源视频并保留原排序和来源状态；找不到时返回明确错误。

- [x] **Step 4: 增加仓储测试**

覆盖三项行为：批量合并两个单集视频并验证目标有三个集数；移除其中一个后验证目标剩余两个集数且来源恢复为可读独立视频；批量中包含多集来源时整个操作失败且目标归属不变。

- [x] **Step 5: 运行相关测试**

运行：`npm run test -w apps/web -- src/modules/video-library/video-merge.repository.test.ts`

预期：所有视频合并仓储测试通过。

### Task 2: 增加集标题编辑、批量合并和移除 API

**Files:**
- Create: `apps/web/src/app/api/videos/[id]/episodes/[episodeId]/route.ts`
- Modify: `apps/web/src/app/api/videos/[id]/merge/route.ts`

**Interfaces:**
- `PATCH /api/videos/:videoId/episodes/:episodeId` 接收 `{ title: string }`，返回 `{ video: VideoDetailRecord }`。
- `DELETE /api/videos/:videoId/episodes/:episodeId` 仅移除当前视频中通过合并加入的集数，返回更新后的目标视频和后台列表。
- `POST /api/videos/:videoId/merge` 接收 `{ sourceVideoIds: string[] }`，兼容旧 `{ sourceVideoId: string }`，返回更新后的目标视频、后台列表和合并结果数组。

- [x] **Step 1: 添加受控集标题 PATCH 路由**

校验 episode 属于 URL 中的视频、标题 trim 后非空且不超过现有合理输入长度；更新 `video_episodes.title`、`sort_title`、`updated_at`，返回最新详情。不存在或归属不匹配返回 404/400。

- [x] **Step 2: 添加移除合并集数 DELETE 路由**

调用 `removeMergedEpisode(id, episodeId)`，不触碰文件系统，返回目标视频详情和 `listAdminRows()`，错误映射为 404 或 400。

- [x] **Step 3: 更新合并 POST 路由**

优先读取非空 `sourceVideoIds`；没有时从旧的 `sourceVideoId` 构造单元素数组。调用批量仓储并返回 `merge` 数组，保留现有字段兼容前端响应。

- [x] **Step 4: 运行类型检查**

运行：`npm run typecheck -w apps/web`

预期：新增动态路由参数和返回类型无 TypeScript 错误。

### Task 3: 改造视频管理面板

**Files:**
- Modify: `apps/web/src/app/admin/videos/[id]/video-admin-detail-panel.tsx`

**Interfaces:**
- 集标题由静态文本改为可保存的行内输入；仅当前视频且非合并状态允许编辑。
- 合并弹框维护 `selectedMergeSourceIds: string[]`，每个候选使用 checkbox、多选汇总和封面 `/api/videos/:id/cover`。
- 合并集数行若 `episode.mergedFromVideoId` 存在，显示“移除”按钮并调用 DELETE API。

- [x] **Step 1: 增加集标题编辑状态与保存动作**

为每个 episode 维护本地 title draft，添加行内 `TextInput` 和保存按钮；保存成功以接口返回的完整详情刷新 `video`、`episodes`，失败保留用户输入并提示错误。合并视频详情不可编辑。

- [x] **Step 2: 增加移除合并集数动作**

在集数操作列展示 `Unlink/Trash2` 图标按钮，仅对 `mergedFromVideoId` 非空的集数展示；点击前使用确认文案“移除后会恢复来源视频，不会删除真实文件”，成功后刷新目标详情和视频列表。

- [x] **Step 3: 改成多选合并状态与请求**

用 `Checkbox.Group` 或受控 `Checkbox` 列表替换 `Radio.Group`；选择变化同步数组，保留搜索过滤。确认按钮在数组为空时禁用，提交 `{ sourceVideoIds: selectedMergeSourceIds }`，成功后清空选择并关闭弹框。

- [x] **Step 4: 放大弹框并展示视频封面**

将 Modal 设置为 `size="min(960px, 92vw)"` 或等价的响应式宽度、`fullScreen` 仅在窄屏启用；列表使用两列候选卡，每张卡左侧展示固定比例封面 `<img src={`/api/videos/${candidate.id}/cover`} ... />`，右侧显示勾选框、标题、路径、集数和时长。封面加载失败隐藏图片并显示明确占位文字，不阻塞选择。

- [x] **Step 5: 做无障碍与响应式复核**

确保所有图标按钮有 `aria-label`/`title`，候选卡可通过 checkbox 键盘操作；在 640px 以下切换单列列表，使用 `globals.css` 中的粉色、边框和文字令牌。

### Task 4: 验证完整流程

**Files:**
- Verify: `apps/web/src/app/admin/videos/[id]/video-admin-detail-panel.tsx`
- Verify: `apps/web/src/app/api/videos/[id]/episodes/[episodeId]/route.ts`
- Verify: `apps/web/src/app/api/videos/[id]/merge/route.ts`

- [x] **Step 1: 运行格式和静态检查**

运行：`git diff --check` 和 `npm run lint -w apps/web`。

- [x] **Step 2: 运行全部相关测试**

运行：`npm run test -w apps/web -- src/modules/video-library/video-merge.repository.test.ts` 和 `npm run typecheck -w apps/web`。

- [ ] **Step 3: 浏览器复核管理流程**

在 `http://127.0.0.1:4427/admin/videos` 打开一个有集数的视频，验证集标题保存、批量勾选并合并、目标集数中点击移除后来源视频恢复；确认弹框能看到封面且窄屏不溢出。

- [x] **Step 4: 检查最终差异**

运行：`git status --short`、`git diff --stat`，确保只包含本需求相关源代码、测试和计划文件，不提交 `dev-server.pid` 或运行时缓存。
