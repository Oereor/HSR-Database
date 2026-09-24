# Relic Score Phase 1A 实施报告

## 1. Executive Summary

Phase 1A 已完成。当前 `develop` 的 97 个角色均有可追踪、可校验的 Character Profile 候选；5★ 主词条 +15 与副词条 high-roll 参考值从现有 Player runtime 数据推导；脱敏 Enka fixture 的 6 个 Build 均可在服务端转换为精确数值输入。未实现评分公式、benchmark 或 UI。

Profile 统计：`high / medium / low = 65 / 17 / 15`；`reviewed / unreviewed / needs-review = 0 / 63 / 34`。没有把推断结果自动宣称为人工审核。

## 2. Files Added / Changed

- 新增 `src/lib/relic-score/`：stat registry、参考值、normalized input、Profile 类型，以及 Git 跟踪的 `generated/character-profiles.json`。
- 新增 `data/relic-score/`：七类模板和差异化 override 配置；新增 `scripts/relic-score/`：生成、digest、校验和维护命令。
- 新增 `tests/fixtures/relic-score/` 及四个 Relic Score 单元测试文件；扩展现有 runtime、数据 manifest 与玩家测试。
- 修改 `scripts/data/player-runtime.ts`、`src/lib/player/runtime-data.ts`、`src/lib/player/stat-synthesis.ts`、`api/_player/enka/pipeline.ts`，保留 `StepNum` 并建立展示前的输入边界。
- 数据 manifest 从 44 升至 45，Player runtime schema 从 1 升至 2；同步调整对应类型和测试断言。

## 3. Final Module Layout

`stat-registry.ts` 定义唯一评分属性注册表；`types.ts` 定义玩家输入和状态；`reference.ts` 生成 5★ 参考值；`normalize.ts` 转换玩家 Build；`profile-types.ts` 定义 runtime artifact。维护侧的 `profiles.ts` 负责确定性推断与 digest，`validate.ts` 负责配置、Profile 与 5★ reference 校验。Production runtime 不执行模板推断。

## 4. RelicStatKey / Reference Data Design

`RelicStatKey` 是现有 `PlayerPropertyType` 的 21 项遗器属性子集。注册表只保存主词条合法槽位与副词条资格；百分比标志和 panel target 从 `PLAYER_PROPERTY_SEMANTICS` 取得，不维护显示名。参考值直接从 5★ relic identity 对应的 affix group 计算：主词条 `BaseValue + LevelAdd × 15`，副词条 `BaseValue + StepNum × StepValue`。校验覆盖组闭合、槽位与属性、唯一性、正有限值、`StepNum` 和组冲突。当前上游 5★ `StepNum` 均为 2，但代码和 `StepNum=3` 测试均使用实际字段。

## 5. PlayerBuildInput Contract

`PlayerBuildInput` 包含角色 ID、未格式化 numeric panel、六件遗器及每件的 `relicId / setId / slot / rarity / level`、numeric main/sub actual、总 occurrence count、累计 step 和显式 roll evidence。当前 Enka 正常路径产生 `{ status: 'exact', source: 'provider' }`。模型同时支持未来的 `inferred / ambiguous / unavailable` evidence，未实现猜测型 roll 推断。

## 6. Normalization Boundary

`normalizePlayerBuildInput()` 只消费 `SynthesizedPlayerCharacterBuild` 与 `PlayerRuntimeData`；它在 `resolveCanonicalPlayerProfile()` 的数值合成之后、presentation 格式化之前调用，结果保留在内部 `normalizedBuilds`，不改变 `/api/player` 响应。评分模块不 import Enka raw 类型、DOM、UI DTO 或 simulator。

## 7. Legality / Availability Handling

结果使用 `valid | unavailable | invalid`。未知实体或 affix、合成失败、缺槽、缺 panel 值返回 `unavailable`；重复槽位、槽位不符、非法等级、主副属性冲突、重复副词条、非法 `cnt/step`、不可能的 5★ occurrence 总数返回 `invalid`。所有失败带机器可读原因，不把缺失值转成零。低星遗器的 rarity、level 和 numeric affix 可从 runtime 读取，但目前没有经过本仓库验证的低星初始副词条 occurrence 规则；normalizer 因而返回 `UNSUPPORTED_RARITY_ROLLS`，并用 `partialInput` 保存已经可靠解析的数值，不将其作为可评分的 `valid` 输入。

## 8. Profile Template / Inference Design

七类模板为 `direct-dps`、`direct-support`、`break`、`dot-dps`、`debuff-support`、`sustain`、`hybrid-direct-break`。权重只使用 `0 / 0.25 / 0.5 / 0.75 / 1 / 1.25`，只分配给当前上游推荐的副词条。推断固定使用双暴与击破、双暴、纯击破、效果命中与攻击、效果命中与速度、存护/丰饶、同谐、其他命途的优先级；命途只影响先验与置信度。`Memory / Elation` 一律降低置信度。

`scaling-stat` 只在推荐副词条中的 ATK/HP/DEF 缩放候选唯一，或多个候选可被推荐主词条唯一消歧时解析；否则候选保留并标为 `needs-review`。Generated Profile 不含 `scaling-stat` 或 `other-recommended` 占位符。

## 9. Override Design

`profile-overrides.json` 初始为空；支持 template、单项权重、hard breakpoint、stat target、单调 curve、review digest 和说明。校验拒绝 orphan、非法属性或权重、重复 panel stat、非单调曲线，以及与自动结果相同的冗余 template/weight override。Override 不复制上游套装、主词条或副词条推荐列表。

## 10. Generated Profile Artifact

`src/lib/relic-score/generated/character-profiles.json` 跟踪于 Git，包含全部 97 个角色，每项有具体属性权重、可为空的 breakpoint/target/curve、inference confidence、review status、review reasons、input/review digest、generator version 和 `sourceCommit`。模板分布：`direct-dps 60`、`direct-support 7`、`break 9`、`dot-dps 6`、`debuff-support 2`、`sustain 9`、`hybrid-direct-break 4`。

## 11. Review / Digest / Staleness Rules

SHA-256 digest 使用稳定对象键排序且保留推荐数组顺序；输入覆盖角色 ID/path、Cavern/Planar set 顺序、主/副词条推荐、模板、影响结果的 override、schema 与 generator version。本地化文案、TextMap、敌人数据及完整 upstream commit 不进入 digest；`sourceCommit` 仅供 provenance。首次高置信度且无 review reason 为 `unreviewed`；其余为 `needs-review`。只有 override 中的 `reviewedInputDigest` 与当前 digest 相等才为 `reviewed`；过期 review 或 artifact 被 validator 拒绝。

## 12. Fixtures

复用 `tests/fixtures/enka/phase1-player.sanitized.json`，新增无 UID、昵称、provider object 或显示字符串的 `complete-five-star.json`，并提供 typed builders 组合缺槽、错误主词条、panel target、ambiguous/unavailable roll evidence 等输入。未复制大型 raw fixture。

## 13. Tests Added / Updated

新增参考值、normalization、Profile 推断/校验与架构边界测试。覆盖 `StepNum≠2`、上游代表值、实际 Enka 六角色链路、非法 `cnt/step`、未知 relic/affix、重复槽位、低星不可用、七类模板、未推荐词条排除、override、digest 顺序和本地化独立性、stale review。更新 Player runtime 与 manifest 版本相关的现有测试。

## 14. Commands Added

- `pnpm relic-score:profiles:generate`：显式维护生成，写出 Git 跟踪 artifact 并立即校验。
- `pnpm relic-score:validate`：读取当前生成数据、5★ runtime reference、source config 与提交的 Profile，执行便宜校验，不写文件。

## 15. Build / CI Impact

生成命令没有挂入 `data:ensure`、`prebuild` 或 `deploy:build`。本阶段未改 CI workflow 或部署脚本；可以在后续将 `relic-score:validate` 作为便宜校验插入 data ensure 之后。Production build 不做 Profile 推断，也没有 benchmark 生成。本轮 runtime schema 升级通过 manifest 45 使旧生成缓存失效。

## 16. Characters Marked `needs-review`

下表中的 ID 共 34 个；原因可叠加，表中按完整原因组合列出：

| 原因 | Character ID |
| --- | --- |
| `PATH_TEMPLATE_MISMATCH` | 1001, 1009, 1104, 1111, 1207, 1222, 1304, 1403 |
| `MIXED_STAT_SIGNALS` + `AMBIGUOUS_SCALING` | 1101, 1225, 1306, 1313 |
| `AMBIGUOUS_SCALING` | 1215, 1321 |
| `PATH_TEMPLATE_MISMATCH` + `AMBIGUOUS_SCALING` | 1301, 1303, 8005, 8006 |
| `SPECIAL_PATH` + `PATH_TEMPLATE_MISMATCH` | 1402, 1407, 1413, 1415, 1501, 1505, 1512, 8009, 8010 |
| `SPECIAL_PATH` + `MIXED_STAT_SIGNALS` + `PATH_TEMPLATE_MISMATCH` | 1409, 8007, 8008 |
| `MIXED_STAT_SIGNALS` | 1412 |
| `SPECIAL_PATH` + `PATH_TEMPLATE_MISMATCH` + `AMBIGUOUS_SCALING` | 1502, 1506, 1513 |

其中 `AMBIGUOUS_SCALING` 的 13 个 ID 需要明确实际缩放词条；`SPECIAL_PATH` 的 15 个 ID 涉及记忆/欢愉，需核对特殊机制。其余 path/template 或属性信号冲突同样应在公开稳定分数前审核。

## 17. Known Limitations

低星 occurrence 规则尚未可靠建模；当前只为 5★ 检查完整总 roll 可行性。无人工审核记录，所以 `reviewed=0`。模板仅产生候选相对权重；具体角色的 breakpoint、target/curve 需要后续人工 override。Validator 尚未加入 CI/Production 自动关卡，但命令已可显式运行。

## 18. Deviations from Phase 0 Audit

Phase 0 提议的完整 Phase 1 scorer/benchmark 已按本阶段文档拆出范围。本轮实际使用当前 Enka provider；5★ `StepNum` 与 Phase 0 一致，当前数值全为 2，但实现未把 2 写死。未发现 Phase 0 与当前代码事实相矛盾的新数据问题。

## 19. Phase 1B Prerequisites

评分器可直接消费 `PlayerBuildInput`、5★ reference 和 Git 跟踪 Profile 候选。进入 Phase 1B 没有新的数据 blocker；公开稳定评分前应先审核 34 个 `needs-review` 角色、确认待定缩放及特殊机制，并决定其余候选的人工审核流程。Farming probability、benchmark 与评分数学仍属后续阶段。

## 20. Validation Results

- Profile generation / validation：97/97，通过；5★ reference 校验通过。
- 完整单元测试：56 个文件、567 项通过。
- `pnpm lint`：通过；Svelte、scripts、API 类型检查：通过（0 errors / 0 warnings）。
- `data:validate:build-inputs`：通过，2125 个 artifact；`vite build`：通过，静态站点写入 `build/`。
- 当前沙箱禁止 `tsx` CLI 创建 IPC 管道，因此维护命令以等价的 `node --import tsx scripts/...` 方式执行；这是工具运行环境限制，不影响实际脚本逻辑。

## 21. `git status --short`

```text
 M api/_player/enka/pipeline.ts
 M package.json
 M scripts/data/generated-artifacts.ts
 M scripts/data/player-runtime.ts
 M scripts/data/sync.ts
 M src/lib/domain/types.ts
 M src/lib/player/canonical.ts
 M src/lib/player/runtime-data.ts
 M src/lib/player/stat-synthesis.ts
 M tests/unit/build-input-validation.test.ts
 M tests/unit/data-cache.test.ts
 M tests/unit/data.test.ts
 M tests/unit/player-runtime-generation.test.ts
 M tests/unit/player-stat-synthesis.test.ts
 M tests/unit/robustness-invariants.test.ts
?? data/relic-score/
?? docs/relic-score-feature/phase-1a-implementation-report.md
?? scripts/relic-score/
?? src/lib/relic-score/
?? tests/fixtures/relic-score/
?? tests/unit/relic-score-boundary.test.ts
?? tests/unit/relic-score-normalize.test.ts
?? tests/unit/relic-score-profiles.test.ts
?? tests/unit/relic-score-reference.test.ts
```

`TurnBasedGameData` 状态仍为空；`StarRailRes` 仍保留开始前已有的 `?? icon/.DS_Store`，本轮未修改两个外部仓库。
