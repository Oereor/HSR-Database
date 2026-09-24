# Relic Score Phase 1D — Scoring and Benchmark Calibration

## 1. Executive Summary

Phase 1D 的代表性 Lens B 训练分布全部通过 257 点同样本表示误差门槛。V1 推荐并已写入集中配置：`N=3`、`K=65536`、Main/Sub `0.35/0.65`、Core Stat/Set `0.95/0.05`、`maxSoftTargetBonus=4`、`maxBreakpointPenalty=8`。当前 Set Integrity partial credit 可冻结为 V1。没有生成正式 97 × 6 benchmark；Phase 1E 可按此契约显式生成。

完整逐分布、逐遗器和逐 Build 数据见 [首轮校准](phase-1d-calibration-results.json)、[N 细测](phase-1d-n-fine-results.json)、[Production K](phase-1d-production-k-results.json)、[257 验收](phase-1d-representation-results.json)和[modifier 配对](phase-1d-modifier-results.json)。这些 JSON 仅存摘要与固定 fixture 查询，不含 Monte Carlo 原始样本。

## 2. Frozen Inputs

- 5★ 同槽自然生成、全部 +15、Lens B 从 N 件中按基础权重 RawSubUtility 取最大；主词条不参与 Lens B eligibility。N 不是体力、掉落数或真实刷取成本。
- `RawSubUtility = Σ RollEq × Profile base weight`；Piece 不用 Soft Target、Breakpoint、Set、面板或 MainCompletion 影响 benchmark。
- 六槽权重保持 `HEAD/HAND=0.10`、其余各 `0.20`。9 条人工确认的 Soft Target 区间和现有 Breakpoint 阈值均未修改。
- `T=2/3×CavernIntegrity+1/3×PlanarIntegrity`；Core 为 `100×(0.95S+0.05T)`。最终分数为 `clamp(Core+4×SoftProgress−8×FailureRatio,0,100)`。

## 3. Representation Error Redefinition

257 点验收只比较生成量化表的**同一批训练样本**：精确右连续 empirical CDF 与 257 点线性重建 CDF，在不同观测值及相邻值中点测绝对误差。正式门槛是最大误差 `≤0.005`；平均误差和 `max error × K` 的 rank 误差单列。未通过时自动比较 513 点，不自动切换格式。旧 Phase 1C 用独立 seed 验收而得到的失败结论混入了 Monte Carlo 估计噪声，不能作为表示误差结论。

## 4. 257 Representation Validation

最终 Lens B，`N=3`、`K=65536`、seed `123456789`，十个代表 case 覆盖六槽、固定及可变主词条、direct DPS、break、DoT、support、sustain、不同有用词条密度。**10/10 通过**；最大误差 `0.003906`，各 case 平均误差的均值 `0.000640`，最大 rank 误差约 `256`。实际 case 均无需 513；513 失败分支另用小样本确定性测试覆盖。

| Character | Slot | N | K | Quantile Points | Max Representation Error | Mean Representation Error | Max Rank Error | Pass? |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1002 | BODY | 3 | 65536 | 257 | 0.003845 | 0.000719 | 252 | Yes |
| 1002 | NECK | 3 | 65536 | 257 | 0.003891 | 0.000741 | 255 | Yes |
| 1222 | FOOT | 3 | 65536 | 257 | 0.003708 | 0.000508 | 243 | Yes |
| 1222 | OBJECT | 3 | 65536 | 257 | 0.003876 | 0.000543 | 254 | Yes |
| 1005 | BODY | 3 | 65536 | 257 | 0.003906 | 0.000568 | 256 | Yes |
| 1005 | NECK | 3 | 65536 | 257 | 0.003891 | 0.000624 | 255 | Yes |
| 1101 | HEAD | 3 | 65536 | 257 | 0.003845 | 0.000631 | 252 | Yes |
| 1101 | HAND | 3 | 65536 | 257 | 0.003845 | 0.000631 | 252 | Yes |
| 1104 | OBJECT | 3 | 65536 | 257 | 0.003830 | 0.000775 | 251 | Yes |
| 1409 | FOOT | 3 | 65536 | 257 | 0.003906 | 0.000661 | 256 | Yes |

## 5. Monte Carlo Stability Definition

稳定性另用三个 seed，比较同一 N、相同 K 的模拟分布与 seed `123456789`、`K=65536` 的高精度**参考估计**。记录 p50/p90/p95/p99 原始 utility 漂移、257 knot 最大原始 utility 漂移、独立 held-out 固定遗器的最大 CDF 查询漂移及耗时。65536 不是数学真值，也不使用 `0.005` representation gate 判断独立 seed。

## 6. K Convergence

以下为十个分布各指标的最大漂移，运行时间是每个分布平均模拟毫秒。完整 90 行在 Production K JSON；同 seed 增加 K 时 p50 最大漂移由 `0.0750` 降至 `0.0269`，固定查询最大漂移由 `0.0077` 降至 `0.0057`。257 knot 的最大原始 utility 漂移在所测行达到 `0.8000`，主要反映离散尾部取值；不同 seed 下漂移不必随 K 单调降低。

| N | K | Seed | Distribution | P50 drift | P90 drift | P95 drift | P99 drift | Fixed-piece CDF drift | Runtime ms |
| ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 3 | 16384 | 123456789 | 10-case max | 0.0750 | 0.0288 | 0.0305 | 0.0434 | 0.0077 | 65 |
| 3 | 32768 | 123456789 | 10-case max | 0.0269 | 0.0212 | 0.0212 | 0.0442 | 0.0057 | 125 |
| 3 | 65536 | 123456789 | reference | 0 | 0 | 0 | 0 | 0 | 253 |
| 3 | 16384 | 2192574334 | 10-case max | 0.0750 | 0.0442 | 0.0500 | 0.0491 | 0.0063 | 68 |
| 3 | 32768 | 2192574334 | 10-case max | 0.0750 | 0.0442 | 0.0500 | 0.0442 | 0.0058 | 125 |
| 3 | 65536 | 2192574334 | 10-case max | 0.0750 | 0.0596 | 0.0442 | 0.0558 | 0.0066 | 250 |
| 3 | 16384 | 2574038188 | 10-case max | 0.0500 | 0.0500 | 0.0615 | 0.0731 | 0.0078 | 63 |
| 3 | 32768 | 2574038188 | 10-case max | 0.0385 | 0.0442 | 0.0558 | 0.0563 | 0.0065 | 130 |
| 3 | 65536 | 2574038188 | 10-case max | 0.0269 | 0.0365 | 0.0558 | 0.0481 | 0.0039 | 261 |

## 7. N Candidate Range

首轮仅 `N=1,3,5,7,9`；`N=1` 是基线，全部候选 `≤9`。围绕 5 追加 `N=4,5,6`，没有把历史 N=10/25/50/100/200 当作 Production 候选。训练矩阵每分布 K=16384，held-out 自然单件语料每角色/槽 4096 件，使用独立 seed `2734581936`；按基础 utility 条件分位数 5/20/50/80/95/99.5% 标为 poor 到 extreme。这是校准标签，不是 UI grade。wrong-main 只用于可变主词条槽，固定主词条槽不伪造不可能的自然遗器。

## 8. N × Alpha Calibration

25 组完整矩阵及 N=4/5/6 细测见 JSON。下表是六角色、推荐完整套装（T=1）、同质量六件 Build 的 Core 均值。N=1 对优秀/极端过于宽松；N≥5 把 poor 与 average 压在几乎相同的主词条基线附近。N=3、alpha=0.35 在普通、好、优秀、极端之间保留梯度；N=4、alpha=0.40 是较严格的可接受邻近方案。

| N | Alpha | Poor | Average | Good | Excellent | Extreme |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 0.35 | 54.2 | 64.9 | 83.8 | 94.6 | 98.8 |
| 3 | 0.30 | 34.8 | 39.3 | 61.1 | 84.5 | 96.2 |
| **3** | **0.35** | **39.4** | **43.6** | **63.9** | **85.6** | **96.5** |
| 3 | 0.40 | 44.1 | 48.0 | 66.7 | 86.7 | 96.8 |
| 4 | 0.35 | 38.5 | 40.7 | 57.6 | 81.8 | 95.5 |
| 4 | 0.40 | 43.3 | 45.3 | 60.9 | 83.2 | 95.8 |
| 5 | 0.35 | 38.3 | 39.4 | 52.9 | 78.3 | 94.4 |
| 5 | 0.40 | 43.1 | 44.1 | 56.6 | 79.9 | 94.8 |
| 6 | 0.35 | 38.2 | 38.8 | 49.5 | 75.2 | 93.4 |
| 7 | 0.35 | 38.2 | 38.5 | 46.9 | 72.3 | 92.4 |
| 9 | 0.35 | 38.2 | 38.4 | 43.3 | 67.2 | 90.5 |

## 9. Piece-level Calibration

示例为 direct DPS `1002:BODY` 同一批 held-out correct-main 遗器；N 改变 benchmark，而不改变遗器原始 utility。全量 9000 行还记录有用词条密度、wrong main、六槽与六角色。N=3、alpha=0.35 下全部 correct-main 行平均 percentile 从 poor `0.018` 到 average `0.095`、good `0.433`、excellent `0.783`、extreme `0.950`；平均 Piece Score 分别 `36.2/41.1/63.2/85.9/96.8`。wrong-main average 的均值为 `9.9`，说明主词条有明显影响；同 utility 的主词条切换固定相差 35 分。有用词条密度样本从 0 到 1，未被评分器硬编码为 grade。

| N | Alpha | Character | Slot | Fixture Quality | MainCompletion | BenchmarkPercentile | PieceScore |
| ---: | ---: | --- | --- | --- | ---: | ---: | ---: |
| 1 | 0.35 | 1002 | BODY | average | 1 | 0.414 | 61.9 |
| 3 | 0.35 | 1002 | BODY | poor | 1 | 0.012 | 35.8 |
| 3 | 0.35 | 1002 | BODY | average | 1 | 0.074 | 39.8 |
| 3 | 0.35 | 1002 | BODY | good | 1 | 0.376 | 59.4 |
| 3 | 0.35 | 1002 | BODY | excellent | 1 | 0.789 | 86.3 |
| 3 | 0.35 | 1002 | BODY | extreme | 1 | 0.946 | 96.5 |
| 4 | 0.35 | 1002 | BODY | average | 1 | 0.031 | 37.0 |
| 5 | 0.35 | 1002 | BODY | average | 1 | 0.013 | 35.9 |
| 7 | 0.35 | 1002 | BODY | average | 1 | 0.002 | 35.2 |
| 9 | 0.35 | 1002 | BODY | average | 1 | 0.001 | 35.1 |

## 10. Build-level Calibration

六件分别取相同 held-out quality，统一配推荐完整套装；表中为六角色均值。T=0、2/3、1 的逐行数据见 JSON；相同 S 下 T 从 0 到 1，Core 恰好增加 5 分。N=3 的 excellent 与 extreme 相差约 10.9 分，尚未全部饱和。

| N | Alpha | Build Fixture | S | T | CoreBuildScore |
| ---: | ---: | --- | ---: | ---: | ---: |
| 3 | 0.35 | poor | 0.363 | 1 | 39.4 |
| 3 | 0.35 | average | 0.407 | 1 | 43.6 |
| 3 | 0.35 | good | 0.620 | 1 | 63.9 |
| 3 | 0.35 | excellent | 0.849 | 1 | 85.6 |
| 3 | 0.35 | extreme | 0.963 | 1 | 96.5 |
| 4 | 0.35 | average | 0.376 | 1 | 40.7 |
| 5 | 0.35 | average | 0.362 | 1 | 39.4 |

## 11. Cross-character Fairness

同一质量构造下角色均值接近，未见类别级系统性偏斜。这里不是同一数值词条跨角色复制，而是每角色同槽自然 held-out 分位质量；它检验校准尺度，不能证明所有实际玩家 Build 公平。

| Character / archetype | Mean BenchmarkPercentile | Mean PieceScore | S | Core (T=1) |
| --- | ---: | ---: | ---: | ---: |
| 1002 direct DPS | 0.097 | 41.3 | 0.409 | 43.8 |
| 1222 break | 0.107 | 41.9 | 0.416 | 44.5 |
| 1005 DoT | 0.087 | 40.7 | 0.401 | 43.1 |
| 1101 support | 0.100 | 41.5 | 0.410 | 44.0 |
| 1104 sustain | 0.085 | 40.5 | 0.399 | 42.9 |
| 1409 sustain / breakpoint | 0.092 | 41.0 | 0.405 | 43.5 |

## 12. Recommended N

**N=3**，可接受邻近候选 N=4（更严格，尤其普通到好遗器）。N=5 的平均 Build 约 39.4、poor 约 38.3；两者只差 1.1 分，即便 alpha 升至 0.40 仍只差约 1 分。N=3 保留更好的下半区分度。N 是评分参照的同槽 best-of-3，不解释为实际刷取成本。

## 13. Recommended K

**K=65536**，`32768` 是维护成本较低的可接受备选。65536 的十 case 模拟平均约 253 ms/分布，跨 seed 最大固定查询漂移约 `0.0066`；增加 K 没有消除离散分位与 seed 波动。选择较高 K 是在约 2.5 分钟全量模拟成本可接受的前提下提高离线精度，不声称它是真值。

## 14. Recommended Main/Sub Share

**0.35 / 0.65**。0.30 对普通 correct-main 遗器过严；0.40 抬高下限，也缩小 poor/average 的差距。0.35 保持 wrong main 的 35 分影响，同时让 sub percentile 决定主要梯度。可接受邻近 alpha=0.40，适合维护者以后明确偏重主词条时再审。

## 15. Core Build Formula Validation

`0.95S+0.05T` 在固定 S 的套装切换中贡献最多 5 分；N=3、alpha=0.35 下 poor→excellent Core 均值差约 46.2 分，套装不会盖过遗器质量。旧 `85% Stat + 10% Breakpoint + 5% Set` 和独立加权 B 已从评分输出中移除。Breakpoint 只在 Core 后扣分。

## 16. Soft Target Bonus Calibration

用角色 1222 的同六件、同套装、Core `44.52` average Build，仅调整最终击破面板，使 progress 为 0/0.25/0.5/0.75/1。下表每行的 delta 已考虑最终 clamp；完整 average/good/excellent 配对见 JSON。满进度 4 分可感知，远小于 average→good 的约 20 分差，普通 Build 不会因此饱和。

| maxBonus | progress | CoreBuildScore | FinalScore | delta |
| ---: | ---: | ---: | ---: | ---: |
| 2 | 0 | 44.52 | 44.52 | 0 |
| 2 | 0.25 | 44.52 | 45.02 | 0.5 |
| 2 | 0.5 | 44.52 | 45.52 | 1 |
| 2 | 0.75 | 44.52 | 46.02 | 1.5 |
| 2 | 1 | 44.52 | 46.52 | 2 |
| 4 | 0 | 44.52 | 44.52 | 0 |
| 4 | 0.25 | 44.52 | 45.52 | 1 |
| 4 | 0.5 | 44.52 | 46.52 | 2 |
| 4 | 0.75 | 44.52 | 47.52 | 3 |
| 4 | 1 | 44.52 | 48.52 | 4 |
| 6 | 0 | 44.52 | 44.52 | 0 |
| 6 | 0.25 | 44.52 | 46.02 | 1.5 |
| 6 | 0.5 | 44.52 | 47.52 | 3 |
| 6 | 0.75 | 44.52 | 49.02 | 4.5 |
| 6 | 1 | 44.52 | 50.52 | 6 |

## 17. Hard Breakpoint Penalty Calibration

角色 1409 excellent Build 的同六件、同套装 Core 为 `86.82`；只改变最终 SPD 为 `199.999/200/200.001`，失败比例从 1 跳到 0，等于阈值即通过。下表的 0.5 行说明两个 breakpoint 仅失败一个时的公式；角色 1409 实际只有一个。8 分明显强于少量 Soft Target 未完成，又不会把优秀 Build 打成极低分。

| maxPenalty | failureRatio | CoreBuildScore | FinalScore | delta |
| ---: | ---: | ---: | ---: | ---: |
| 5 | 0 | 86.82 | 86.82 | 0 |
| 5 | 0.5 | 86.82 | 84.32 | -2.5 |
| 5 | 1 | 86.82 | 81.82 | -5 |
| 8 | 0 | 86.82 | 86.82 | 0 |
| 8 | 0.5 | 86.82 | 82.82 | -4 |
| 8 | 1 | 86.82 | 78.82 | -8 |
| 10 | 0 | 86.82 | 86.82 | 0 |
| 10 | 0.5 | 86.82 | 81.82 | -5 |
| 10 | 1 | 86.82 | 76.82 | -10 |

## 18. Recommended Modifier Values

`maxSoftTargetBonus=4`、`maxBreakpointPenalty=8`。Modifier 在 Core 后依次加、减并 clamp 到 0–100；不改变 Piece Score 或 benchmark identity。满 Soft Target 的 4 分与一次完整 Breakpoint 失败的 8 分保持清晰量级。

## 19. Set Integrity Validation

现行映射通过边界测试：推荐 Cavern 4pc 为 1，同一推荐套装 2pc 为 0.5，否则 0；推荐 Planar 2pc 为 1，否则 0；多个推荐候选取最佳。两个不同推荐 Cavern 套装各 2pc 只得 0.5，不拼成完整 2+2。`T=2/3 C+1/3 P`，建议正式冻结为 V1。

## 20. Production Cost Projection

最终 `N=3, K=65536, 257 points, 582 distributions` 需要生成 `114,425,856` 件虚拟遗器。代表 case 的模拟耗时线性外推约 `147,404 ms`（约 2.5 分钟，不含 582 分布的加载、排序、序列化和格式化）。量化点原始 double 下界约 `1.20 MB`；代表 artifact 比例外推 JSON 约 `2.78 MB`、gzip 约 `0.51 MB`，均为粗估。若同时保留全部 582×65536 个原始 double 样本，数值本体下界约 `305 MB`，JS 数组和对象会更高；Phase 1E 正式生成器宜逐分布处理并释放样本。显式维护任务可行，不接入普通 build。

## 21. Human-maintainable Config

维护者只需编辑 `src/lib/relic-score/scoring-config.ts` 的具名 `benchmark`、`piece`、`build` 对象；`validateScoringConfig()` 检查范围与份额总和。N/K/seed、Main/Sub、Stat/Set、bonus/penalty 都集中；Profile 不存 modifier，generated artifact 不作为配置源。`pnpm relic-score:calibrate --mode=all` 可重跑首轮矩阵与最终候选稳定性；`--n=... --alpha=... --k=... --seed=...` 可重跑子集，`--mode=fixture` 保留旧 prototype 用途。

## 22. Remaining Decisions

本轮没有阻断 Phase 1E 的必需参数决定。N=4 / alpha=0.40 与 K=32768 是记录在案的备选，不制造“唯一真实刷取量”或数学真值的假象。若维护者日后改变偏好，应显式重跑相同语料和 gate，并更新集中配置及正式 benchmark identity。

## 23. Phase 1E Readiness

**Ready**：257 同样本 gate 通过，N/K/alpha/modifier/Set 规则明确，CLI 与报告可复算。正式 97×6 artifact、Production loader、UI、Player Info integration、grade、排行榜、升级建议和 combat simulation 均未在本轮制作。Phase 1E 仍需实现正式 artifact 的显式生成及廉价验证，并控制生成期样本内存。

## 24. Tests / Build

- `node --import tsx scripts/relic-score/validate-command.ts`：97 个 Profile 通过；`node --import tsx scripts/relic-score/farming-validate.ts`：farming 模型通过。
- 相关 Vitest：5 文件、38 项通过，包括 same-sample gate、513 分支、同 seed 再现、矩阵重跑、N 限制、评分公式、modifier clamp、套装边界。
- 直接执行 messages check、SvelteKit sync、Svelte check、scripts/API TypeScript：均通过；Svelte 为 0 errors / 0 warnings。`pnpm lint` 通过；直接执行构建输入校验通过（2125 artifacts）；直接执行 data/assets ensure 与 `vite build` 通过，静态站点写入 `build`。`git diff --check` 通过。
- 本机 `pnpm check`、`pnpm data:validate:build-inputs`、`pnpm build` 的 `tsx` CLI 包装器在启动时均因本地 IPC 管道 `EPERM` 停止；上述相同脚本的 `node --import tsx` 入口及后续原命令均成功。该包装器限制没有产生项目测试或构建失败。
- 校准命令运行信息均在 JSON 中：seed、N、alpha、K、角色/槽 corpus、模拟及总耗时。首轮矩阵及最终 N=3 K 稳定性分别约 36.0 秒和 14.4 秒。

## 25. `git status --short`

```text
 M docs/relic-score-feature/profile-maintenance.md
 M scripts/relic-score/benchmark-core.ts
 M scripts/relic-score/calibrate.ts
 M scripts/relic-score/score-command.ts
 M src/lib/relic-score/score.ts
 M src/lib/relic-score/scoring-config.ts
 M tests/unit/relic-score-phase1c.test.ts
?? docs/relic-score-feature/phase-1d-calibration-results.json
?? docs/relic-score-feature/phase-1d-modifier-results.json
?? docs/relic-score-feature/phase-1d-n-fine-results.json
?? docs/relic-score-feature/phase-1d-production-k-results.json
?? docs/relic-score-feature/phase-1d-representation-results.json
?? docs/relic-score-feature/phase-1d-scoring-and-benchmark-calibration-report.md
?? scripts/relic-score/calibration-core.ts
?? src/lib/relic-score/scoring-math.ts
?? tests/unit/relic-score-phase1d.test.ts
```
