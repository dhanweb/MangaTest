# 可移植漫画路径与无损迁移实施计划

详细 TDD 步骤见 `docs/superpowers/plans/2026-08-26-portable-manga-paths.md`。

- [x] 1. 增加 runtime profile 和 portable relative path 纯函数及测试。
- [x] 2. 增加 manga root location schema、bootstrap backfill、repository 和测试。
- [x] 3. 增加 root location verification/resolver，并让 root offline 不触发 missing reconciliation。
- [x] 4. 增加 migration inventory、dry-run fingerprint、SQLite backup、active-transfer guard、transaction apply 和 invariant verification。
- [x] 5. 改造 library/local-files/reader/media-assets 消费 resolver；保留 legacy derived absolute columns。
- [x] 6. 增加后台 profile/location 状态与 migration preview/apply workflow。
- [x] 7. 更新 docs/implemented-features 和 Windows/WSL 部署说明。
- [x] 8. 运行 targeted tests、full web tests、typecheck、lint、build、browser smoke 和 diff check。

最终检查记录：路径相关 targeted tests、typecheck、production build 和 HTTP smoke 已通过；full web test 仍有既有的 aria2/openlist 默认 provider 断言，full lint 仍有既有的 settings hook 规则错误，均未由本任务引入。

回滚点：schema backfill 后、migration service 后、消费者切换后、UI 后分别独立提交。真实数据库 apply 必须等本子任务全部验证通过。
