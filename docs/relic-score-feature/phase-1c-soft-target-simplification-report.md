# Relic Score Phase 1C Soft Target 精简与审核应用报告

## 1. Executive Summary

旧 post-target 边际权重模型、贡献归因和 Candidate A/B 已撤销。Character Profile schema 升为 v3：Soft Target 只含 `stat/minimumThreshold/maximumThreshold`，Hard Breakpoint 只含 `stat/threshold`。维护者已在[人工审核表](phase-1c-soft-target-review.md)确认 9 条非暴击候选的完整区间，现均已写入正式配置并重新生成 Profile。Piece Score 与 farming 数值计算保持原样，最终 Build modifier 仍待校准。

## 2. Why Old Target Model Was Removed

旧模型要求无法可靠取得的非目标副词条 baseline 与逐槽 final-panel delta，且 Candidate A 会在越过目标时产生非预期下降。它也把 final-panel 阈值耦合到 Piece benchmark 身份。新的面板直接读取方式不需要 stat contribution attribution。

## 3. New Soft Target Semantics

逐项进度为 `clamp((panelValue - minimumThreshold) / (maximumThreshold - minimumThreshold), 0, 1)`：小于或等于下限为 0，达到或超过上限为 1，中间线性插值。多项取算术平均；空列表为 0。validator 要求完整有限区间、上限严格大于下限、canonical stat、可解析 final panel、同 stat 不重复，且禁止 `CriticalChanceBase`。

## 4. Hard Breakpoint Semantics

最终面板值 `>= threshold` 达标，否则失败。输出逐项状态与 `failedCount / count`；没有 breakpoint 时失败比例为 0。Profile 不存 penalty 或权重。validator 拒绝非有限阈值、不可解析属性和完全重复的 stat/threshold；同一属性的不同阈值可以共存。

## 5. Crit Rate Target Removal

移除全局默认 policy 与 6 条角色级 target；旧 generated artifact 中的暴击率 target 共 61 条（55 条默认、6 条角色级），现全部删除。暴击率仍保留原有 base substat weight，正常参与 RawSubUtility 与 Piece Score。

## 6. Legacy Target Migration Summary

9 条非暴击旧 target 涉及 1222、1301、1303、1304、1409、1412、1501、8009、8010。精简时先全部移出 active source config；维护者随后逐条选择保留，并填写 min/max，现已作为完整 `softTargets` 写回。没有根据旧 target 或游戏资料推测下限，也没有在 generated Profile 写入不完整目标。

## 7. Old Candidate A/B Code Removed

删除 `BuildTargetContext`、baseline/逐槽 delta、target-aware utility、效率调整、Candidate A/B、benchmark p50 RawSubUtility 目标参考尺度、`TARGET_CONTEXT_MISSING`、target study CLI 与结果 JSON。N/K 校准 CLI 中只移除旧 Build target 字段，N/K/257 算法与取值不变。原 Phase 1C 报告加了历史状态提示。

旧 N 测量 JSON 中附带的 Candidate A/B 数字仅作为历史快照保留；它们不再由当前 CLI 产生，也不代表现行评分契约。

## 8. Character Profile Schema Changes

Profile artifact、override schema 和 generator version 均升为 3。旧 `statTargets`、`statCurves`、`postTargetWeight` 与 threshold `value/panelTarget` 从新契约消失。面板映射只在 evaluator 通过统一 stat registry 查询。`substatWeights`、模板选择和自动推荐机制保持原样。

## 9. Human-Maintainable Config Audit

数值 source of truth 是 `data/relic-score/profile-overrides.json`，共用模板权重是 `data/relic-score/profile-templates.json`。一个角色的人工覆盖集中在其 ID 键下；推荐列表和未覆盖的自动值不重复写入。JSON 对现有小型结构足够清楚，字段使用完整名称、对象而非位置数组。`reviewedInputDigest` 仍在 override 中，但维护者通过命令预览并刷新，无须手算 hash 或编辑 generated metadata；无需为注释引入 JSONC/TS 配置管线。新增角色只在需要覆盖自动结果时编辑 override。正式 generated artifact 仅由 generator 写入。

## 10. Long-Term Source Config Choice

继续使用现有 JSON：它和当前 generator、validator、Prettier 流程一致，角色 override 仍集中且自解释。无需为注释能力改造读取管线；维护命令解决唯一不宜手写的 digest 字段。

## 11. Review / Digest Maintenance Workflow

修改 override → `pnpm relic-score:profiles:generate` → 检查 diff → `pnpm relic-score:profiles:review --character=ID` 预览摘要 → 核对后附加 `--approve-current` → `pnpm relic-score:validate`。审批命令只更新指定角色的 `reviewedInputDigest`，然后重新生成、校验。以后修改 min/max、breakpoint 或权重会改变 input digest 并标为 `needs-review`，不会自动批准其他角色。

本轮迁移前后对 97 个 source override 和 generated Profile 做了逐项语义比较：差异只包括已经批准的旧 target 删除、breakpoint 字段改名、schema/generator/digest/review 元数据。核对通过后才一次性刷新 97 个 digest；最终 `reviewed/unreviewed/needs-review = 97/0/0`。

审核表填写后的第二次应用只涉及 9 个指定角色。先生成 Profile，确认恰好这 9 个角色变为 `needs-review`，再逐项比较旧/新 source 与 Profile，确认唯一新增的评分字段是表中明确批准的区间；随后只刷新这 9 个 digest。再次生成与校验后，状态仍为 `97/0/0`。后续改动仍须使用单角色显式批准命令。

## 12. Soft Target Review Sheet Summary

[审核表](phase-1c-soft-target-review.md)中的 9 条均由维护者选择保留并确认完整区间。已应用的最终面板单位数值如下：

| 角色 ID | Stat | minimumThreshold | maximumThreshold |
| --- | --- | ---: | ---: |
| 1222 | `BreakDamageAddedRatioBase` | 0 | 2.0 |
| 1301 | `BreakDamageAddedRatioBase` | 0 | 1.5 |
| 1303 | `BreakDamageAddedRatioBase` | 1.2 | 1.8 |
| 1304 | `DefenceAddedRatio` | 1600 | 4000 |
| 1409 | `StatusResistanceBase` | 0 | 0.5 |
| 1412 | `AttackAddedRatio` | 2000 | 4000 |
| 1501 | `AttackAddedRatio` | 2000 | 3600 |
| 8009 | `AttackAddedRatio` | 1000 | 2200 |
| 8010 | `AttackAddedRatio` | 1000 | 2200 |

## 13. Tests / Validation

- `pnpm relic-score:profiles:generate`、`pnpm relic-score:validate`：通过，97 个 reviewed Profile。
- `pnpm relic-score:farming:validate`：通过；同参数 prototype benchmark 的分位点与 N=10、K=512、seed、257 点均未变化，只有与 Profile 相关的身份 digest 更新。
- 单角色 review 命令的预览与 `--approve-current` 路径：通过；定向 TypeScript、Prettier、ESLint 与 `pnpm check:scripts`、`pnpm check:api`：通过。
- 直接运行断言验证区间端点/中点、非法区间、breakpoint 比例、审核过期/批准、Piece 结果及 benchmark 身份与 Soft Target 隔离：通过。
- 审核应用后，针对全部 9 条实际 Profile 再次验证下限/中点/上限进度为 0/0.5/1、Crit Rate 目标缺席、benchmark 的权重 digest 不受 Soft Target 影响；Profile 校验通过，97 个角色均为 `reviewed`。
- 定向 Vitest 在收集测试前因沙箱拒绝 Vite/esbuild 读取 `vite.config.ts` 而停止；相关测试文件已通过 TypeScript 编译。`pnpm check` 退出 0、Svelte 诊断为 0，但配置加载报相同权限错误，不能视作干净通过。
- `pnpm build` 的 data/assets ensure 均通过，Vite build 在同一配置读取权限处停止。需要在能读取配置的开发或 CI 环境补跑定向 Vitest 和 build。

## 14. Remaining Human Decisions

9 条候选的保留决定和 min/max 已由维护者完成。`maxSoftTargetBonus`、`maxBreakpointPenalty` 与最终 Build 评分公式仍未冻结。评分器只输出 Stat Completion、Set Integrity、Soft Target Progress、Hard Breakpoint Failure Ratio 和 `pending-calibration`，不输出旧 `FinalBase` 或替代分数。

## 15. Impact on Existing Phase 1C Scoring Core

RawSubUtility、Lens B、CDF、Main Completion、Piece Score 和 effective hits 数学未变。benchmark identity 的 Profile 部分改为仅包含实际影响 Piece 分布的权重；prototype fixture 只重算身份 digest。旧 target/breakpoint 不再改变 benchmark 身份。

## 16. N/K/257 Status

Production N/K 仍未冻结；257 点接受门槛、相关历史测量及算法均未修改。本轮没有进行新的 N/K/257 校准，也没有生成正式 benchmark。

## 17. `git status --short`

```text
 M data/relic-score/profile-overrides.json
 D data/relic-score/profile-policy.json
 M docs/relic-score-feature/phase-1c-scoring-core-and-calibration-report.md
 D docs/relic-score-feature/phase-1c-target-results.json
 M package.json
 M scripts/relic-score/benchmark-core.ts
 M scripts/relic-score/calibrate.ts
 M scripts/relic-score/farming-inputs.ts
 M scripts/relic-score/farming-prototype.ts
 M scripts/relic-score/generate.ts
 M scripts/relic-score/profiles.ts
 M scripts/relic-score/score-command.ts
 D scripts/relic-score/target-study.ts
 M scripts/relic-score/validate.ts
 M src/lib/relic-score/generated/character-profiles.json
 M src/lib/relic-score/profile-types.ts
 M src/lib/relic-score/score.ts
 M src/lib/relic-score/scoring-config.ts
 M tests/fixtures/relic-score/benchmark/prototype.json
 M tests/unit/relic-score-farming-prototype.test.ts
 M tests/unit/relic-score-phase1c.test.ts
 M tests/unit/relic-score-profiles.test.ts
?? docs/relic-score-feature/phase-1c-soft-target-review.md
?? docs/relic-score-feature/phase-1c-soft-target-simplification-report.md
?? docs/relic-score-feature/profile-maintenance.md
?? scripts/relic-score/generate-artifact.ts
?? scripts/relic-score/review-core.ts
?? scripts/relic-score/review.ts
```
