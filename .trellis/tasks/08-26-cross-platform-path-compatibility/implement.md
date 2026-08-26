# Windows / WSL 路径兼容总体实施计划

## Execution Order

- [ ] 1. 完成并审核 `08-26-portable-manga-paths` 的 PRD、设计和详细计划。
- [ ] 2. 激活 `08-26-portable-manga-paths`，实现 runtime profile、portable path、root locations、迁移和漫画消费者改造。
- [ ] 3. 通过该子任务的单元测试、数据库迁移测试、Reader/扫描集成测试和后台浏览器验证。
- [ ] 4. 在 Windows 当前数据库备份副本上执行 dry-run，核对 `D:\hentai\manga -> /mnt/d/hentai/manga` 建议和 invariant counts。
- [ ] 5. 完成并审核 `08-26-cross-platform-path-integrations` 的 PRD、设计和详细计划。
- [ ] 6. 激活第二个子任务，依次改造 PixivDownloader、Downloads/aria2、video-library、open-folder 和 PotPlayer。
- [ ] 7. 运行全量 web tests、typecheck、lint 和 build。
- [ ] 8. Windows smoke test：扫描目录/zip/cbz、Reader、视频、Pixiv preview、下载 finalization、打开目录和 PotPlayer capability。
- [ ] 9. 停止 Windows 后端，备份数据库，在 WSL 原生应用目录恢复副本并配置 WSL locations。
- [ ] 10. WSL smoke test：验证相同实体 ID/计数、首次扫描无重复、Reader/视频、Pixiv preview、下载路径方言和 desktop capability。
- [ ] 11. 模拟 `/mnt/d` offline，验证扫描被阻止且 existing local files/episodes 不被批量标记 missing。
- [ ] 12. 恢复迁移前备份并比较关键表计数与 ID 摘要，完成回滚演练。
- [ ] 13. 更新 `docs/implemented-features.md`、部署说明和任务检查记录。

## Child Plans

- `docs/superpowers/plans/2026-08-26-portable-manga-paths.md`
- `docs/superpowers/plans/2026-08-26-cross-platform-path-integrations.md`

## Parent Validation Commands

```powershell
npm run test -w apps/web
npm run typecheck:web
npm run lint:web
npm run build:web
git diff --check
```

Windows 与 WSL 的原生依赖安装和 smoke test 必须分别在对应运行环境执行。不得复用同一个 `node_modules`，不得同时启动两个指向同一 SQLite 的服务。

## Review Gates

- Gate A：核心路径合同和迁移报告经审查后，第二子任务才可开始。
- Gate B：任何真实数据库迁移前必须确认一致性 backup 文件可打开。
- Gate C：任何 active transfer 使用不可映射绝对路径时，迁移必须停止。
- Gate D：full-scope completion 需要父任务跨平台验收，不以单平台单元测试代替。
