# V2 Benchmark 维护

唯一正式文件位于 data/relic-score/v2/farming-benchmarks.json，审计位于同目录 benchmark-generation-audit.json。schema 4；Lens B 条件包含角色、实际槽与实际主词条。N=3，K=65536，seed=123456789，既有 mulberry32、自然五星 +15 和 257 点 CDF 不变，最大表示误差必须 ≤0.005。

pnpm relic-score:v2:benchmarks:generate 在 .staging 隔离目录生成并校验，所有 2744 条分布通过后才发布两份产物；发布异常恢复原文件。禁止手工编辑 JSON、降门槛、513 点替换或借用旧算法。pnpm relic-score:v2:benchmarks:validate 独立验证 identity、覆盖、有限值、单调性、逐分布审计、汇总与真实 bytes/hash。pnpm relic-score:v2:benchmarks:determinism 对固定槽、1505 覆盖条件、1506 agnostic 条件全 K 复算。

Manifest schema 53 绑定政策 bytes/hash 及正式 Benchmark bytes/hash/audit hash。生成后运行 pnpm data:ensure；旧缓存自动失效。prebuild 和部署流水线只验证 V2。服务端完整验证一次并缓存，逐件核对条件，缺失/过期时返回明确 unavailable。

分布 identity 包含最终副权重、副映射/Flat/U、reference、概率和随机生成表示契约；主权重、α、Set Integrity 与 UI 不使副分布失效。完整 Profile digest 和源码生成 provenance 另作审计。α 比较复用同一正式 Benchmark，仅生成报告，正式 α 保持 0.35。
