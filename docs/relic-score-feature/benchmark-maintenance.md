# V2 Benchmark 维护

唯一正式文件位于 data/relic-score/v2/farming-benchmarks.json，审计位于同目录 benchmark-generation-audit.json。schema 4；Lens B 条件包含角色、实际槽与实际主词条。N=1，K=65536，seed=123456789，既有 mulberry32、自然五星 +15 和 257 点 CDF 不变，最大表示误差必须 ≤0.005。每轮直接计算单件 U，selectionMode=single-base-raw-sub-utility；不取多件最大值，也不从旧 N=3 CDF 开立方。

pnpm relic-score:v2:benchmarks:generate 在 .staging 隔离目录生成并校验，覆盖集合由当前 Profile 和合法条件实际推导，当前为 2744 条。全部通过后才发布两份产物；发布后 bytes 校验也在回滚保护内，异常恢复原文件并保留诊断。禁止手工编辑 JSON、降门槛、513 点替换或借用旧算法。pnpm relic-score:v2:benchmarks:validate 独立验证 identity、覆盖、有限值、单调性、逐分布审计、汇总与真实 bytes/hash。pnpm relic-score:v2:benchmarks:determinism 对 1413 OBJECT/SPRatioBase、1001 HEAD/HPDelta、1505 NECK/PhysicalAddedRatio、1506 OBJECT/SPRatioBase 全 K 复算。

Manifest schema 53 绑定政策 bytes/hash 及正式 Benchmark bytes/hash/audit hash。生成后运行 pnpm data:ensure；旧缓存自动失效。prebuild 和部署流水线只验证 V2。服务端完整验证一次并缓存，逐件核对条件，缺失/过期时返回明确 unavailable。

政策迁移时，先冻结来源、记录旧产物和配置并在忽略目录保存回滚备份；生成期间不要并行启动构建或消费正式产物的开发服务。候选失败不得发布；若产物发布后 Manifest 更新失败，应恢复旧正式产物、活动配置及绑定后停止。备份只用于本轮恢复，不纳入 Git 或活动 loader。必要网络操作仍遵守系统代理；生成本身只读锁定本地输入。

N=3 的历史基线见 [调查报告](farming-benchmark-n-comparison.md)。不需要在活动目录复制旧大型产物。N、K、seed、选择模式或表示契约变化必须更新 sampling identity 并直接重新生成全量分布；旧产物不能作为新的正式评分输入。

分布 identity 包含最终副权重、副映射/Flat/U、reference、概率和随机生成表示契约；主权重、α、Set Integrity 与 UI 不使副分布失效。完整 Profile digest 和源码生成 provenance 另作审计。α 比较复用同一正式 Benchmark，仅生成报告，正式 α 保持 0.35。
