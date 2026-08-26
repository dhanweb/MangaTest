# 可移植漫画路径与无损迁移实施计划

详细 TDD 步骤见 `docs/superpowers/plans/2026-08-26-portable-manga-paths.md`。

- [ ] 1. 增加 runtime profile 和 portable relative path 纯函数及测试。
- [ ] 2. 增加 manga root location schema、bootstrap backfill、repository 和测试。
- [ ] 3. 增加 root location verification/resolver，并让 root offline 不触发 missing reconciliation。
- [ ] 4. 增加 migration inventory、dry-run fingerprint、SQLite backup、active-transfer guard、transaction apply 和 invariant verification。
- [ ] 5. 改造 library/local-files/reader/media-assets 消费 resolver；保留 legacy derived absolute columns。
- [ ] 6. 增加后台 profile/location 状态与 migration preview/apply workflow。
- [ ] 7. 更新 docs/implemented-features 和 Windows/WSL 部署说明。
- [ ] 8. 运行 targeted tests、full web tests、typecheck、lint、build、browser smoke 和 diff check。

回滚点：schema backfill 后、migration service 后、消费者切换后、UI 后分别独立提交。真实数据库 apply 必须等本子任务全部验证通过。
