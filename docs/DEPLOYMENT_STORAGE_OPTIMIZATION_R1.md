# Deployment Storage Optimization R1

## 1. Summary

本轮在保留双语静态站、完整 prerender、现有路由和全部 Enemy Detail 交互的前提下，将 Enemy page presentation payload 从逐级对象改为 columnar stat DTO，并对单路由内相同 progression 按值共享。

最终 `build/` 从 **697,611,520 B** 降至 **394,300,449 B**，减少 **303,311,071 B（43.48%）**，落入预期的 390–410 MB 区间。本轮达到停止条件，未继续扩大到 lazy shard、SSR、Search、Endgame 或外部存储。

## 2. Implemented Changes

- 新增明确的 `EnemyDetailPageData` presentation contract；rich `Enemy` domain 和 generated JSON schema 保持不变。
- Monster payload 只保留 UI 使用的 ID、`statsRef`、弱点/抗性、召唤和技能阶段引用。
- Skill definitions 继续 default-first 稳定去重，并移除卡片未使用的 internal kind、localized status 和 phases。
- Enemy server projection 改为构建 compact page data，再补充敌人及召唤物立绘 URL。
- UI 通过集中 accessor 解引用 progression 和读取当前等级，没有在 Svelte markup 中散落 compact schema 索引。
- 未修改 CSS、文案、URL、locale 策略、upstream lock、依赖或 lockfile。

## 3. Compact Stat Schema

每个 progression 保留 `minLevel`、`maxLevel`、`defaultLevel`，并使用七个定长列：

```ts
type EnemyStatCompactValue = DecimalString | null;

interface EnemyStatProgressionCompact {
  minLevel: number;
  maxLevel: number;
  defaultLevel: number;
  hp: EnemyStatCompactValue[];
  attack: EnemyStatCompactValue[];
  defence: EnemyStatCompactValue[];
  speed: EnemyStatCompactValue[];
  toughness: EnemyStatCompactValue[];
  effectHit: EnemyStatCompactValue[];
  effectResistance: EnemyStatCompactValue[];
}
```

等级由 `level - minLevel` 映射到数组下标。resolved 值继续使用原始 `DecimalString`，没有 number 转换；page UI 不区分原因的 unavailable 值编码为 `null`，rich domain 中的 status/reason 不变。

对 628 个中文 Enemy 的实测候选中，dedup 后 columnar devalue 为 10,825,651 B，tuple 为 11,380,079 B；columnar 小 4.9%，且 accessor 复杂度相当，因此采用 columnar。

## 4. Progression Deduplication

- 每个 Enemy route 独立维护 `statProgressions[]`。
- 按 Monster 原始顺序构造 compact progression，并以固定字段顺序的完整 JSON 值作为去重键。
- 首次出现的值决定稳定 index；Monster 只保存整数 `statsRef`。
- 输出仅包含普通对象、数组和 primitive，不把 `Map`/`Set` 传入 page data。
- `8002050` 验证结果：76 个 Monster 只输出 14 个唯一 progression，所有引用均有效。

## 5. UI Adaptation

- `getEnemyMonsterStatProgression` 集中校验并解引用 `statsRef`。
- `getEnemyStatsAtLevel` 将指定等级恢复为七个具名 stat 值。
- slider 范围和初始等级来自默认 Monster 的 compact progression。
- Monster 切换继续共享当前等级；stats、phase tabs、skills、ExtraEffect、summon、weakness/resistance 和布局保持现有行为。

## 6. Correctness / Parity Verification

- 全量比较 628 个中文 Enemy、2,649 个 Monster、264,900 个等级行的七项 stat 列。
- 所有 resolved decimal string 与 rich progression 完全相等；所有 unavailable 值稳定映射为 `null`。
- 显式覆盖 `5012052`、`8032040`、`1002016`、`8002050`、缺失 stat 的 `3004010`，以及具有多 phase、ExtraEffect 和 summon 的真实样本 `1005014`。
- 验证 `statsRef` 为有效整数且不越界、相同 progression 能共享、不同 progression 不误合并、重复构建输出完全一致。

## 7. Before / After Build Metrics

口径与 `docs/investigations/DEPLOYMENT_STORAGE_AUDIT.md` 一致，均为未压缩文件字节。

| Metric                     |      Before |       After |        Delta | Reduction |
| -------------------------- | ----------: | ----------: | -----------: | --------: |
| Total deployment output    | 697,611,520 | 394,300,449 | -303,311,071 |    43.48% |
| Enemy total                | 417,626,269 | 114,313,519 | -303,312,750 |    72.63% |
| Enemy HTML total           | 230,620,920 |  84,035,503 | -146,585,417 |    63.56% |
| Enemy `__data.json` total  | 187,005,349 |  30,278,016 | -156,727,333 |    83.81% |
| Enemy detail 4-file median |     354,407 |     138,911 |     -215,496 |    60.80% |
| Enemy detail 4-file P90    |   1,552,596 |     312,110 |   -1,240,486 |    79.90% |
| `8002050` zh HTML          |   2,644,383 |     268,180 |   -2,376,203 |    89.86% |
| `8002050` zh data          |   2,520,598 |     117,612 |   -2,402,986 |    95.33% |
| `8002050` 4-file total     |  10,332,423 |     774,019 |   -9,558,404 |    92.51% |
| Characters total           |  43,380,728 |  43,380,532 |         -196 |     0.00% |
| Endgame total              |  50,820,689 |  50,820,457 |         -232 |     0.00% |
| Search total               |   9,332,484 |   9,332,484 |            0 |     0.00% |

文件数保持 7,122。Characters/Endgame 的百字节级变化来自共享 bundle/hash envelope，业务 payload 未调整。

## 8. Test Results

| Command / check               | Result                                                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Targeted Prettier + ESLint    | 通过                                                                                                                                        |
| `pnpm data:sync`              | 通过，generated tracked files 无变化                                                                                                        |
| `pnpm assets:ensure`          | 通过                                                                                                                                        |
| `pnpm messages:check`         | 通过                                                                                                                                        |
| `pnpm data:validate`          | 通过；保留既有 544 条 TextMapCHS 缺失警告                                                                                                   |
| `pnpm check`                  | 通过，0 errors；保留既有 Relic unused CSS warning                                                                                           |
| Enemy unit tests              | 16/16 通过，包含全量 stat parity                                                                                                            |
| `pnpm test`                   | 421/423 通过；2 项既有 localization/product baseline 文案漂移失败                                                                           |
| Enemy E2E                     | 24/24 通过（desktop + mobile）                                                                                                              |
| Full `pnpm test:e2e`          | 初次运行 271 通过、17 失败、3 flaky、3 skipped；失败主要为既有文案 baseline 漂移和并发超时，新增不稳定目录假设已修正并由 Enemy 定向复跑通过 |
| `pnpm deploy:build`           | 通过                                                                                                                                        |
| `pnpm deploy:verify`          | 通过，扫描 4,375 个文本文件                                                                                                                 |
| `pnpm lint`                   | 被既有 `README.md` 和未跟踪审计文档的 Prettier 格式挡住；本轮全部改动文件的 Prettier/ESLint 均通过                                          |
| `pnpm product:baseline:check` | 既有 homepage tagline baseline 漂移 1 项；与 Enemy DTO 无关                                                                                 |

已观察到的既有文案漂移包括英文 Enemy rank（`Normal Enemy` → `Normal`）、homepage tagline、footer 文案及中文弱点分隔符。本轮按 scope 未修改这些产品文案或历史 baseline。

## 9. Remaining Opportunities

以下机会保留到后续轮次，本轮未实施：

- coefficient-based client calculation
- lazy non-default stats shard
- Search static-index direct fetch
- Endgame local reference normalization
- locale-neutral shared data
- external storage

## 10. Recommendation

当前 deployment 已降至约 394.3 MB，并且 Enemy payload、全量数值 parity、prerender 和核心交互均达到本轮目标。建议立即停止本轮优化并部署验证实际 Vercel Storage 变化；后续只有在 retained deployment storage 仍不满足预算时，再单独评估 lazy shard 或 locale-neutral shared data。
