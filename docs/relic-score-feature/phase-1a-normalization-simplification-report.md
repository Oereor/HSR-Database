# Relic Score Phase 1A 归一化精简修复报告

> 日期：2026-09-23  
> 分支：`develop`  
> 范围：真实 Enka 遗器的 Production Player Input 归一化

## 1. 修复缘由与旧行为

Phase 1A 曾以本地重建的强化流程判断真实 Enka 遗器是否合法：5★ 的副词条 occurrence 总数必须匹配等级推导出的范围，`cnt` 有理论上限，`step` 不能超过 `cnt × StepNum`。低星虽然能解析身份及数值，却因缺少已验证的 rarity-specific roll lifecycle 而返回 `UNSUPPORTED_RARITY_ROLLS`，仅留下不可评分的 `partialInput`。

这些判断无法回答程序是否理解数据，只是在重新证明游戏已经产生的遗器能否存在。因此本次将真实数据路径限定为 parse、resolve、normalize。

## 2. 新责任边界

Enka decoder 解析 provider 字段；canonical/runtime resolution 确定遗器、词条及槽位身份；stat synthesis 和 normalizer 计算数值型 actual 并形成 `PlayerBuildInput`。Production normalization 不重建初始副词条数、揭示与强化次数、3-init/4-init 历史或档位可达性。

`HSR-Relic-Simulator-Cross-Platform` 只可作为未来 farming probability、Monte Carlo 或虚拟遗器生成的只读机制参考；它不是 Production validation 规则来源、依赖、import、vendored 内容或 submodule。

## 3. 移除的 validation

- 删除 5★ 等级到 occurrence 总数的可行性检查，以及副词条数与 occurrence 总数的历史对应检查。
- 删除 `cnt <= 9` 和 `step <= cnt × StepNum` 这类理论上限；不再因为低星 affix 缺少 `StepNum` 或低星 roll lifecycle 而拒绝归一化。
- 删除基于游戏副词条容量的 `substats.length > 4` gate。
- 删除正常低星路径中的 `UNSUPPORTED_RARITY_ROLLS`、不再使用的 `IMPOSSIBLE_OCCURRENCES` reason 和 `partialInput` 分支。

## 4. 保留的 validation

仍检查必需数据、有限数值、整数和非负/正数约束（列出的副词条 `cnt` 必须为正整数，`step` 必须为非负整数）、runtime 中可解析的 relic/affix identity 及其 set/slot 映射、等级在该 relic 的 runtime 范围内、raw slot 与 resolved identity 一致、重复槽位或属性、主副词条冲突、canonical stat 支持、stat synthesis 成功，以及数值型 actual 可可靠计算。未知 ID 和合成失败继续返回 `unavailable`；结构冲突继续返回 `invalid`。

5★ `BaseValue + LevelAdd × 15` 主词条参考值、`BaseValue + StepNum × StepValue` high-roll 副词条参考值及其 finite、closure、uniqueness 校验保持不变。全局 runtime 接受可选 `StepNum`，出现时仍必须为正整数；5★ 参考值构造仍要求所需的 `StepNum`。

## 5. 低星与 `cnt` / `step`

当前 runtime 包含 2★、3★、4★ 遗器。测试对每种 rarity 的真实 runtime relic ID 构造 Enka-like 输入，并移除对应低星 affix 的 `StepNum`，仍能经 decoder、adapter、synthesis、normalizer 得到 `valid PlayerBuildInput`。rarity、level、数值型主副词条和 provider 的 `cnt`、`step` 均保留。

`cnt` 仍是 provider 给出的 total occurrence count，`step` 仍是 provider 给出的累计档位信息。归一化以这两个数和 runtime affix 数值计算 actual，`RollCountEvidence` 保持 `{ status: 'exact', source: 'provider' }`；不反推 display value 或猜测强化历史。

低星 roll lifecycle 缺失不再被视为 Relic Score 的 limitation，因为 Production scoring 不需要重建真实遗器的生成历史。低星仍统一与既定的 5★ +15 main 和 5★ high-roll substat 参考值比较；本次没有加入低星 benchmark 或 rarity penalty。

## 6. 修改文件与测试

- `src/lib/relic-score/normalize.ts`、`types.ts`：移除 lifecycle gate、相应 reason 和 `partialInput`。
- `src/lib/player/runtime-data.ts`、`scripts/data/player-runtime.ts`：`StepNum` 可缺省；若提供则维持正整数要求，5★ reference 验证保持原约束。
- `tests/unit/relic-score-normalize.test.ts`：覆盖 2★/3★/4★ valid、5★ 旧规则会拒绝的输入，以及负数、非整数、未知 ID、重复槽位/属性、合成失败和无法解析的属性。
- `tests/unit/player-runtime-generation.test.ts`、`relic-score-boundary.test.ts`：覆盖可选 `StepNum` 和 Production 与 farming/simulator 的边界。

## 7. 验证结果

- 相关 relic-score、player runtime/normalization、Enka adapter/pipeline 回归：10 个测试文件、61 项通过。
- `pnpm check`：通过，Svelte 0 errors / 0 warnings，scripts 与 API TypeScript 检查通过。
- `pnpm data:validate:build-inputs`：通过，源数据 `4ce30f69b32d`。
- `pnpm build`：通过，静态站点成功写入 `build`。
- 本次修改的 TypeScript 文件经 Prettier check 和 ESLint 单独检查：通过；`git diff --check`：通过。
- 全仓库 `pnpm lint`：未通过。Prettier 报告多个本轮未修改文件已有格式差异；初次运行时本轮测试文件也在列表中，随后已格式化并通过定向检查。未为清除此类无关差异扩大修改范围。
- 本地忽略的 generated cache 起初仍为 schema v1；已通过现有 `data:ensure` 同步至 schema v2，未引入被跟踪的生成产物修改。

## 8. 剩余限制与 Phase 1B 影响

本次只形成可供后续 scorer 消费的规范化输入；Piece Score、Build Score、benchmark、farming probability、Monte Carlo、UI 和 Phase 1B 均未实现或改动。可解析低星现在可进入 Phase 1B 的输入路径，5★ 评分参考值与未来评分数学未变。对无法解析的 provider/runtime 数据仍按结构性错误返回 `invalid` 或 `unavailable`。

## 9. `git status --short`

完成本报告后的预期状态（未 stage 或 commit）：

```text
 M scripts/data/player-runtime.ts
 M src/lib/player/runtime-data.ts
 M src/lib/relic-score/normalize.ts
 M src/lib/relic-score/types.ts
 M tests/unit/player-runtime-generation.test.ts
 M tests/unit/relic-score-boundary.test.ts
 M tests/unit/relic-score-normalize.test.ts
?? docs/relic-score-feature/phase-1a-normalization-simplification-report.md
```

`../TurnBasedGameData` 与 `../StarRailRes` 在本轮前后均无工作区修改。
