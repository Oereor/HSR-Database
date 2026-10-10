# 遗器评分 V2 α 比较：未执行

日期：2026-10-10。状态：被人工复核 blocker 阻止；没有生成正式新 Benchmark，没有产生 α 比较数值或调参建议。

正式 pin 312b4597691e0a29cf9828a15b592757dba86949 中，1505 推荐 PhysicalAddedRatio，但主表没有 DamageAddedRatio。全量生成命令在 Monte Carlo 开始前退出，不能用旧分布、混合分布或猜测权重替代比较。

## 已实现的复现方法

先关闭 blocker，完成 pnpm relic-score:v2:benchmarks:generate 和 pnpm relic-score:v2:benchmarks:validate，再运行 pnpm relic-score:v2:alpha-compare。

脚本复用同一个已校验 Benchmark；sample seed=20261010，每个角色／主档位 128 组配装，角色为 1102、1205、1309、1001、1211、1409、1413、1506、1415、1015，涵盖直伤、HP、辅助、生存、特殊机制和 LD。

样本一次性生成。档位为最高权重、严格次低权重（无更低者沿用最高）、最低合法权重和 +0。低等级样本使用真实 +0 主 reference 与三条一次低档副词条；其余使用现有自然 +15 生成器。套装 ID 来自角色推荐集合。样本明确是可复现合成样本，不冒充真实玩家统计。

α 为 0.20/0.25/0.30/0.35/0.40/0.45，只重组缓存 a、Q、P 和套装结果，不重新运行 Monte Carlo。输出单件和配装均值／p10／p50／p90、按档位和角色的分布、相对 0.35 的角色内排名翻转、固定槽／agnostic 分布，以及 P≥0.9 的低权重主词条与 P≤0.1 的最佳主词条在同槽的补偿比较。分析分组不进入评分模型。

机器结果保存在 data/relic-score/v2/alpha-comparison.json，运行成功才更新本报告。当前不存在该结果，均值、分位数、排名翻转和补偿效果均为未测量。

## 参数政策

正式 α 保持 0.35。普通六槽在 statCompletion 内有效 Main/Sub 为 28/72，并非 35/65；agnostic 会进一步降低主份额。Set Integrity 的 95/5 合成另行作用。比较只提供证据与建议，不自动改参数。
