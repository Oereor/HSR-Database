# Farming Benchmark 主词条条件化修正实验报告

## 结论与根因

旧正式 Lens B 按 `character × slot` 保存 582 个分布。模拟器先按槽位概率抽主词条，再用相同 canonical stat key 从副词条池排除同名词条；这一排除实现本身正确。但旧 best-of-3 的三件遗器各自随机抽取主词条，因此把不同副词条可用池的候选混在一次实验中。运行时只按角色和槽位查分布，导致主词条已经占用高权重副词条的遗器被不匹配的人群评价。

现按 `character × slot × actualMainStatKey` 生成和查询 2716 个分布。每轮生成三件主词条固定且相同的合法 5★ 遗器，全部强化至 +15，再按 RawSubUtility 选最佳；重复 K=65,536。Lens B 不检查主词条是否推荐。MainCompletion 独立处理推荐适配性，Piece Score 仍是 `100 × (0.35 × MainCompletion + 0.65 × BenchmarkPercentile)`。这个模型衡量已取得三件同槽、同主词条遗器后的副词条质量，不衡量主词条掉率或体力成本。

## 实现与身份契约

- 自然生成器接受可选的合法主词条 key。指定时跳过随机主词条抽取；未指定时保留原自然抽取供旧概率诊断使用。副词条权重、3/4 初始概率、roll grade、强化节点、5★ affix 值均未改动。
- 正式产物按 `characterId → slot → mainStatKey → distribution` 存放；包含所有合法主词条，包括角色不推荐者。固定 HEAD/HAND 各一个主词条。类型、期望身份、完整覆盖校验、离线工具、server loader 与 scorer 均使用该 key。
- 非法槽位／主词条仍按既有 reference 检查判为 `PIECE_INVALID`；合法主词条对应分布若缺失或过期，则返回 benchmark unavailable，不回退旧混合分布。
- schema 由 2 升至 3；benchmark、正式生成器和自然生成器版本升至主词条条件化版本。分布身份包含固定主词条约束。旧 JSON 在新校验器下明确报 `artifact schema`，缺少一个合法主词条则报 `main stat coverage`。服务端仍静态导入产物、模块级缓存校验；请求不运行 Monte Carlo、无网络或测试 fixture fallback。
- 排除规则使用 probability model、runtime affix 与 `RelicStatKey` 的同一 identity。当前 BODY 的治疗、OBJECT 的能量恢复、NECK 的各元素伤害主词条没有同名副词条，故不排除额外词条。HEAD/HAND 分别固定 HPDelta/AttackDelta；它们的新旧随机流相同。

## 产物、误差与确定性

| 项目 | 旧混合模型 | 新条件模型 |
| --- | ---: | ---: |
| 分布数 | 582 | 2716 |
| 原始 Git JSON 字节 | 4,471,496 | 22,206,995 |
| gzip 字节 | 365,269 | 1,322,964 |
| SHA-256 | `5c104551149bb9c5cb599bf0352097402fca237b03ae5ec588ba0123326da553` | `9fe13f6163c7f6b8e5d997cb9eca71dc0e1495f6bb458e5b245190ffb40ba8ac` |

新分布数按槽位为 HEAD 97、HAND 97、BODY 679、FOOT 388、NECK 970、OBJECT 485；总和 2716。仍使用 Lens B、N=3、K=65,536、257 点、`mulberry32-v1`、seed `123456789`，每个分布重置相同 seed。首轮正式生成用时 684.211 秒，粗略峰值 RSS 186,085,376 字节。2716/2716 项通过既有最大 CDF 表示误差 `≤0.005` 门槛；实测最大值 `0.00390625`，最差 key 为 `1005:BODY:HealRatioBase`，平均误差的分布均值为 `0.000727`，最大样本 rank 误差为 256。未调高点数或放宽门槛。

若仅按“排除哪个副词条”分类，当前每角色共有 22 个槽位／排除类，理论上可由 2716 降至 2134 个分布；其中差额来自 NECK 的七种无同名副词条元素伤害主词条。本轮保留显式的实际主词条 key，不引入额外映射与去重。

通过与 `pnpm relic-score:benchmarks:generate` 相同的脚本入口，连续三次完整生成分别用时 684.211、698.969、809.268 秒，均得到相同的 22,206,995 字节正式 JSON，SHA-256 均为 `9fe13f6163c7f6b8e5d997cb9eca71dc0e1495f6bb458e5b245190ffb40ba8ac`。三次均为 2716/2716 通过门槛；第三轮粗略峰值 RSS 为 196,726,784 字节。审计文件的耗时／内存随运行变化，确定性比较针对正式 benchmark JSON 字节。

## 代表性分布实验

下表值均为同一角色、槽位的旧混合分布与新条件分布；`F(old p50)` 使用完全相同的旧 p50 RawSubUtility 查询两边 CDF。数值保留四位。

| 角色／槽位／实际主词条 | 旧 mean / p50 / p90 / p95 / p99 | 新 mean / p50 / p90 / p95 / p99 | 旧 p50 处旧→新 percentile |
| --- | --- | --- | --- |
| 风堇 `1409`／FOOT／SPD | 2.2920 / 2.1500 / 3.9615 / 4.5673 / 5.5288 | 1.7339 / 1.7250 / 2.7750 / 3.0750 / 3.5750 | 0.5000 → 0.7073 |
| `1002`／BODY／CR | 3.5737 / 3.5000 / 5.6250 / 6.2250 / 7.3000 | 3.0006 / 2.9000 / 4.9135 / 5.4000 / 6.3750 | 0.5117 → 0.6563 |
| `1002`／BODY／CD | 3.5737 / 3.5000 / 5.6250 / 6.2250 / 7.3000 | 3.0006 / 2.9000 / 4.9135 / 5.4000 / 6.3750 | 0.5117 → 0.6563 |
| `1310`／OBJECT／Break Effect | 2.7999 / 2.6538 / 4.6788 / 5.2500 / 6.2596 | 1.8777 / 1.8750 / 3.3288 / 3.8481 / 4.6577 | 0.5000 → 0.7813 |

风堇 Profile 的 SPD 权重为 1.25、HP% 为 0.75，FOOT 推荐 SPD。SPD 鞋不可能再掷出 SPD 副词条；同为 SPD 鞋的 p50 RawSubUtility 约为 1.725，而旧混合分布 p50 为 2.150。同一 RawSubUtility 2.15 在旧模型处于 50.00 百分位，在正确的 SPD 鞋人群中约为 70.73 百分位。实际脱敏风堇 SPD 鞋从 30.47 百分位升至 43.75 百分位，Piece Score 从 54.805 升至 63.438（+8.633）。

同槽主词条并非一律上调。风堇 HP% 鞋的新 mean/p50/p90 为 1.7899/1.4500/3.6058；ATK% 与 DEF% 鞋均为 2.5599/2.3808/4.2615。对于 RawSubUtility 2.15，HP% 条件 percentile 为 0.6505，ATK% 与 DEF% 均为 0.4096（旧混合值 0.5000）。这正体现排除不同 stat 后的分布差异；本案例 ATK% 与 DEF% 因权重与采样对称而得到相同数值，但身份及 key 仍各自独立。

`1002` 的 CR/CD 副词条权重均为 1.25，BODY 推荐 CR/CD；两个主词条各自排除同名副词条。两份条件分布数值相同，是该角色权重和当前采样配置对称的结果。HP% BODY 则保留 CR/CD 副词条，其新 mean/p50/p90 为 3.9293/3.8769/5.9519；RawSubUtility 3.5 的 percentile 从旧 0.5117 降至 0.4180。`1310` 的 Break Effect 权重为 1.25、OBJECT 推荐 Break Effect；BE 绳自身排除 BE 副词条，同样出现旧混合 benchmark 抬高比较门槛的现象。其 HP% 绳新 mean/p50/p90 为 3.1541/3.1500/4.9750，能量恢复绳为 2.9470/2.8750/4.7942。

控制组先取 `1409`、`1002`、`1310` 各自 HEAD/HAND；随后扩展核对全部 97 个角色的 HEAD/HAND，共 194 个分布。新旧全部 257 个量化点逐项完全一致。其主词条固定，旧模型本来就没有不同主词条混合问题。

## 脱敏 Player Info Build 影响

使用仓库现有本地脱敏 Enka fixture 的六个完整 build。旧分数由 Git 中旧 JSON、同一 RawSubUtility/MainCompletion 与不变的评分公式重算；新分数由正式生产评分入口读取新产物。36 件中 23 件分数变化，Piece Score 绝对变化中位数 0.465，最大上升 +19.043（`1310` BE 绳），最大下降 −0.508。12 件 HEAD/HAND 全部变化为 0。

| 角色 ID | 旧 Build Score | 新 Build Score | 变化 |
| --- | ---: | ---: | ---: |
| `1310` | 81.505 | 88.524 | +7.019 |
| `1413` | 95.013 | 96.788 | +1.775 |
| 风堇 `1409` | 89.817 | 91.640 | +1.824 |
| `1415` | 82.065 | 86.622 | +4.557 |
| `1407` | 91.456 | 95.653 | +4.197 |
| `8006` | 59.358 | 60.978 | +1.620 |

六个 Build Score 绝对变化中位数 3.010；最高上升 +7.019，最低变化 +1.620。`1310` 实际 BE 绳的 Piece Score 从 71.816 升至 90.859（+19.043）；`1413` 的 CD BODY 为 +2.234。`8006` 的 DEF% BODY 为 −0.508，说明修正不是统一加分。

错误主词条独立性另用 `1310` 现有鞋的合法副词条构造 DEF% 主词条鞋。DEF% 不在该角色 FOOT 推荐中，故 MainCompletion=0；其专属 DEF% FOOT 条件 percentile=0.6367，Piece Score=41.3867，身份 digest 与 DEF% 条件分布一致。高副词条质量可以得到高 percentile，但不会获得缺失的 35% 主词条份额。

## 风险、验证与建议

新产物较大，server 首次静态导入与校验成本上升；之后沿用模块缓存，评分查询仍为按 key 取 257 点表和二分 CDF。静态依赖检查确认正式 JSON 仅由 `src/lib/server/relic-score/benchmark-loader.ts` 导入，客户端 bundle 的实际构建测量因下述环境错误未完成。N=3 仍是人为比较 lens，Monte Carlo 有抽样误差；模型未覆盖主词条掉率、体力成本及获取三件目标主词条的刷取次数。这些限制不影响本轮主词条条件匹配的修复结论。

校验记录：

- `pnpm relic-score:validate`、`pnpm relic-score:farming:validate`、`pnpm relic-score:benchmarks:validate`：通过；正式产物 2716/2716 覆盖。
- `pnpm check:scripts`、`pnpm check:api`、`pnpm lint`、`pnpm data:validate:build-inputs`：通过。三个直接相关的单测文件另经独立 TypeScript 检查通过；prototype fixture 生成和离线六件套评分命令通过。
- 脱敏 Enka 六个 Build 的直接生产评分与旧／新对照运行通过；另断言 194 个 HEAD/HAND 控制分布完全相等，以及错误主词条使用自己的条件身份。
- Vitest 定向运行和 `pnpm build` 均在本机 esbuild 加载 `vite.config.ts` 时遇到沙箱目录 `Access is denied`。Build 的 `data:ensure`、`assets:ensure` 和 benchmark 预校验均先通过；Vite 构建、完整 `pnpm test` 与实际客户端 bundle 测量未完成。`pnpm check` 首次在消息检查阶段以 Windows 进程退出码 `3221225477` 停止；单独的消息、脚本与 API 检查随后均通过。未修改项目代码来绕过该环境限制。

建议将新条件模型作为正式 Lens B benchmark：它修正了已证实的人群不匹配，所有分布的表示门槛已通过，固定主词条控制组无数值漂移，现有脱敏 Build 呈现预期的双向评分变化。发布前仍需在可正常加载 Vite 配置的环境完成单测、完整 `check`、`build` 及客户端 bundle 检查；本轮不再调整 N/K、权重或 Piece 份额。
