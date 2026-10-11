# 遗器评分文档

## 当前规范与维护

- [V2 数学与维护契约](relic-rating-v2.md)：本专题的权威规范，生产唯一使用 V2，正式副百分位基准为 N=1。
- [Profile 维护](profile-maintenance.md)：人工政策输入、来源证据、审核与 manifest 更新。
- [Benchmark 维护](benchmark-maintenance.md)：正式生成、发布门禁、独立验证与确定性复算。
- [英文说明](relic-rating-v2-user-guide.en.md)：评分语义说明；模型政策仍以数学契约为准。
- [共享架构](../architecture/localization-and-data-generation.md)：数据管线、manifest 与 locale 边界。

按 Profile → 必要的 Benchmark 重生成 → `data:ensure` 绑定 → 相关验证的流程维护。
权重政策、例外和比例变更需要明确维护者依据，文档整理不构成新的批准。

## 历史证据

本目录的调查、审核表、实施与校准报告及配套 JSON 保留原阶段结论。
V1 Phase 0–2、旧主词条政策、Soft/Hard 以及 N=3 实验命令不用于当前生产维护。

模型演进可从 [V2 来源调查](relic-rating-v2-investigation.md)、[正式切换](relic-rating-v2-implementation.md)、[N 比较调查](farming-benchmark-n-comparison.md)、[N=1 实际迁移](farming-benchmark-n1-migration.md)追溯。
[UI 精简](relic-rating-ui-simplification.md)记录展示变化，不改变数学政策；报告里的固定 Profile 数量、分布数量、hash、耗时与“通过”都是对应 pin 的快照。

脚本仍会写入本目录的 V2 review JSON 与 α 比较报告，维护时审阅实际 diff；历史报告不会因重新生成而变成当前规范。
