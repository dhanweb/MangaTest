# 跨平台外部路径集成实施计划

详细 TDD 步骤见 `docs/superpowers/plans/2026-08-26-cross-platform-path-integrations.md`。

- [ ] 1. 增加 provider path dialect 和受控 translator。
- [ ] 2. 改造 PixivDownloader 外部 Windows 路径到逻辑 root/relative path 的两阶段解析与匹配。
- [ ] 3. 改造 Downloads/aria2/builtin HTTP 的 temp/final path 合同和迁移 blocker。
- [ ] 4. 增加 video root locations 并改造 scan、stream、poster、merge/progress 保持。
- [ ] 5. 实现 Windows/WSL/Linux open-folder adapter 和 PotPlayer capability/bridge。
- [ ] 6. 扩展 migration report 和后台状态覆盖 integrations。
- [ ] 7. 运行 targeted/full tests、typecheck、lint、build 和 Windows/WSL smoke。

每一集成独立提交和验证；任何 provider dialect 不明确的路径必须 fail closed。
