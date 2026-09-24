# Relic Score Phase 1E — Production Benchmark Report

## 1. Executive Summary

Phase 1E 已生成正式 Lens B benchmark：97 个 reviewed Profile × 6 个 canonical 槽位，共 582 个分布，全部通过同一样本 257 点表示门槛。正式 JSON、廉价校验器、server-only loader 和内部生产评分入口已建立；Player Info UI 与公开 API 响应未改动。

## 2. Frozen V1 Parameters

N=3、K=65,536、Lens B、257 quantiles；seed=123456789、PRNG=`mulberry32-v1`，每个角色／槽位重新从同一 seed 开始。Piece Main/Sub=0.35/0.65；槽位权重为 HEAD/HAND 各 0.10、其余各 0.20；Build Stat/Set=0.95/0.05；Soft Target bonus 上限 4、Breakpoint penalty 上限 8。Set Integrity 规则保持 Phase 1D 版本。配置入口是 `src/lib/relic-score/scoring-config.ts`。

## 3. Files Added / Changed

主要新增：正式 JSON、`scripts/relic-score/benchmarks-{generate,validate}.ts`、共享 benchmark 身份计算、`src/lib/server/relic-score/` loader／评分入口、Phase 1E 测试、审计 JSON 和维护文档。修改集中配置、prototype 共用身份逻辑、artifact 类型／校验器、build gate 与 prototype fixture。没有改动 UI 或 Player API。

## 4. Production Artifact Layout

唯一正式产物为 `src/lib/relic-score/generated/farming-benchmarks.json`，`schemaVersion=2`、`benchmarkVersion=lens-b-base-raw-v1`、`prototype=false`。全局 metadata 保存模型／生成器／PRNG／seed contract、N/K、Lens、量化版本及输入 digest；每角色／槽位保存身份 digest、mean/p25/p50/p75/p90/p95/p99 和 257 个 quantile。产物不含 raw Monte Carlo samples、UI 文案或玩家数据。

## 5. Generator Architecture

显式维护命令 `pnpm relic-score:benchmarks:generate` 从当前生成数据、已审核 Profile、概率模型和 5★ affix runtime 读取输入，不联网。按角色 ID、`RELIC_SLOTS` 顺序处理；每个 experiment 自然生成并强化三件同槽 5★ 遗器，取基础副词条 utility 最大值。每个分布重置同一 seed，保持 Phase 1B/1D 的随机数契约。

## 6. Memory Strategy

生成器一次只保留一个分布的 65,536 个样本；排序、汇总、量化并验收后，仅保留 257 点产物和小型审计行。582 个分布对应约 114,425,856 件虚拟遗器。进程 RSS／heap 是逐分布测得的粗略峰值，并非全程采样的严格上界。

## 7. Full 97×6 Generation Result

**582/582 generated**，每项使用 N=3、K=65,536、Lens B、257 点；无 silent skip、缺槽 fallback 或额外角色。

## 8. Full Representation Gate Result

**582/582 pass，0 fail**。每项比较同一批训练样本的精确右连续 empirical CDF 与 257 点线性重建 CDF；验收阈值为最大绝对误差 ≤0.005。平均绝对误差的跨分布均值约 0.00070684；最大 rank error 为 256 个样本位次。失败时仅计算 513 点诊断，不自动切换格式，且不会替换正式产物。

## 9. Worst-case Representation Error

最大绝对误差为 **0.00390625**；稳定排序下首个最差分布为 `1001:BODY`，rank error 为 256。完整逐分布指标在 `phase-1e-benchmark-generation-audit.json`。

## 10. Artifact Size

正式 JSON 为 **4,471,496 bytes**，gzip 为 **365,269 bytes**；同一对象若无空白序列化约 2,738,666 bytes。Phase 1D 对原始 JSON 的 2.78 MB 估算与紧凑表示接近；Git 跟踪产物采用缩进与逐量化点换行，故磁盘原始大小增至约 4.47 MB。gzip 比粗估的 0.51 MB 小，主要来自重复字段和量化数值的可压缩性。

## 11. Generation Runtime / Memory

最终 schema 的三次完整生成分别耗时 **158.882 s**、**159.871 s** 和 **159.354 s**。对应粗略峰值 RSS 为 244,350,976／249,970,688／235,126,784 bytes，heap 为 97,513,040／191,983,528／100,925,944 bytes；不同运行中的 GC 时机可改变峰值。最终审计记录第三次运行数据。

## 12. Artifact SHA / Determinism

三次完整生成的正式 JSON SHA-256 均为 `5c104551149bb9c5cb599bf0352097402fca237b03ae5ec588ba0123326da553`，逐字节一致。运行时间／内存属于非确定性审计测量，不进入正式产物。

## 13. Benchmark Identity / Staleness

Lens B 身份仅依赖角色 ID、槽位、基础副词条权重、采样概率字段、5★ affix 参考、N/K、PRNG／seed contract、Lens、生成器及量化版本。推荐主词条仅在 prototype Lens C 的身份中保留；概率模型来源文字不参与 digest。Soft Target、Breakpoint、推荐套装、评分份额、modifier、UI、本地化和 review note 不改变 benchmark 身份。Profile 审核是否有效仍由独立的 Profile 校验先行把关。

## 14. Cheap Validator

`pnpm relic-score:benchmarks:validate` 只读取本地输入和正式 JSON，重算身份并检查版本、精确 97×6 覆盖、metadata、有限单调量化点、摘要顺序及无多余角色／槽位；不运行 Monte Carlo。过期或缺失时提示显式生成命令。正式产物不加入现有临时数据 manifest：该 registry 管理 `src/lib/generated` 和 `static/generated` 的构建缓存，而 benchmark 是独立 Git 跟踪维护产物。

## 15. Production Loader

`src/lib/server/relic-score/benchmark-loader.ts` 静态导入正式 JSON、Profile、概率配置和已生成 player runtime，按当前配置重算期望身份，单 server 实例只校验一次。`getBenchmarkDistribution(characterId, slot)` 返回 typed available、missing 或 stale；不使用 prototype fixture、网络或模拟。

## 16. Scorer Integration

`src/lib/server/relic-score/score.ts` 的内部 `scoreProductionBuild(input, recommendation)` 向现有 deterministic `scoreBuild` 提供已验证的正式 benchmark、Profile 和 5★ 参考。Piece、Build、Soft Target、Breakpoint 和 Set 数学保持 V1；缺失／过期分布不会被视作 0 percentile。测试仍可注入小型 prototype fixture。

## 17. Server / Client Bundle Boundary

完整 JSON 只被 `src/lib/server/relic-score/` 导入；客户端页面／组件没有该导入。源代码架构测试和生产构建扫描均未在 client chunks、静态站点或当前 SvelteKit server 输出中找到正式 benchmark 标识。该内部评分服务尚未接入 `/api/player`，所以当前部署函数不携带这份 JSON；Phase 1F 接入时需再测对应函数大小。

## 18. Build Impact

直接执行的最终 Vite production build 成功，Vite 阶段约 21.25 s。当前输出 client JS 总计 626,891 bytes，`.svelte-kit/output/server` 约 2.1 MiB；站点目录包含大量既有游戏图片，不能把其总大小归因于 benchmark。没有可靠的引入前同机基线，因此不声称精确差值。普通 build／部署流程新增的只是廉价 validator，不执行生成器。

## 19. Maintenance Workflow

维护者按 `benchmark-maintenance.md`：先审核 Profile → `pnpm relic-score:validate` → `pnpm relic-score:farming:validate` → `pnpm relic-score:benchmarks:generate` → `pnpm relic-score:benchmarks:validate` → 检查 diff、运行测试／build、提交产物和审计。完整重复生成可核对 SHA。

## 20. When Regeneration Is / Is Not Required

基础权重、采样概率、5★ affix 参考、N/K/seed/PRNG/Lens、量化或生成器行为改变时需要再生成。Soft Target、Breakpoint、Main/Sub 与 Stat/Set 份额、modifier、Set Integrity、UI、本地化、review note 改变时不需要再生成；相关 Profile 审核仍按其自身流程完成。

## 21. Tests / Build

遗器评分相关单测 **9 文件／56 项通过**；Profile 校验 97/97、farming 校验、正式 benchmark 校验 582/582、Svelte check 0 errors／0 warnings、scripts/API TypeScript、全仓 lint、`data:validate:build-inputs`（2,125 个数据产物）均通过。`pnpm build` 的 `tsx` CLI 在此沙箱因 IPC `EPERM` 无法启动；使用 `node --import tsx` 跑过相同准备与校验脚本，再直接运行 `pnpm exec vite build` 成功。

## 22. Remaining Limitations

K=65,536 是有限 Monte Carlo 估计，不代表数学真分布；离散 utility 仍有 ties。生成器版本需在采样行为改变时人工提升。审计内存峰值是粗略观测。当前没有 UI、公开评分字段或 API 线路，也没有独立部署函数 bundle 大小测量。

## 23. Next-stage Readiness

Phase 1F 可在 server/API 层调用 `scoreProductionBuild`，为每个 Build 提供现有推荐配置，并在改变公开响应前核对客户端契约及实际函数包大小。正式 artifact、stale gate、lookup 和评分数学已就绪；本阶段未启动 UI 工作。

## 24. `git status --short`

实施文件尚在 `develop` 工作区待审阅，未暂存或提交。`git status --short --untracked-files=all`：

```text
 M .prettierignore
 M docs/relic-score-feature/profile-maintenance.md
 M package.json
 M scripts/deployment/build.ts
 M scripts/relic-score/benchmark-core.ts
 M scripts/relic-score/farming-inputs.ts
 M src/lib/relic-score/benchmark/types.ts
 M src/lib/relic-score/benchmark/validate.ts
 M src/lib/relic-score/scoring-config.ts
 M tests/fixtures/relic-score/benchmark/prototype.json
?? docs/relic-score-feature/benchmark-maintenance.md
?? docs/relic-score-feature/phase-1e-benchmark-generation-audit.json
?? docs/relic-score-feature/phase-1e-production-benchmark-report.md
?? scripts/relic-score/benchmark-production.ts
?? scripts/relic-score/benchmarks-generate.ts
?? scripts/relic-score/benchmarks-validate.ts
?? src/lib/relic-score/benchmark/identity.ts
?? src/lib/relic-score/generated/farming-benchmarks.json
?? src/lib/server/relic-score/benchmark-loader.ts
?? src/lib/server/relic-score/score.ts
?? tests/unit/relic-score-phase1e.test.ts
```

两个只读上游仓库状态与开始时一致：`TurnBasedGameData` clean；`StarRailRes` 保留原有 `?? icon/.DS_Store`。
