# Relic Score Profile 数值维护

长期人工 source of truth 是 `data/relic-score/profile-overrides.json`，共用默认权重在 `data/relic-score/profile-templates.json`。这两个文件使用普通 JSON；角色 ID 是 `overrides` 的键，同一角色的权重、Soft Target 和 Hard Breakpoint 集中在一个对象中。只填写真正覆盖自动结果的字段。`reviewedInputDigest` 由命令维护，不需要人工计算或复制。

## 修改角色配置

1. 编辑 `data/relic-score/profile-overrides.json`。新角色仅需新增其实际需要的 override；没有 override 时 generator 自动使用模板。
2. 运行 `pnpm relic-score:profiles:generate`。配置变动后的 Profile 会标记 `needs-review`。
3. 检查 source 与 generated diff，确认角色、权重、阈值和单位。
4. 运行 `pnpm relic-score:profiles:review --character=1303` 查看当前评分输入与 digest；核对后运行 `pnpm relic-score:profiles:review --character=1303 --approve-current`。后者只批准指定角色，并重新生成和校验。
5. 运行 `pnpm relic-score:validate`。若还有其他 stale Profile，逐个检查并批准。

不要直接编辑 `src/lib/relic-score/generated/character-profiles.json`。该文件只由 generator 写入。

## Soft Target

在角色 override 中写完整对象，例如：

```json
"softTargets": [
  {
    "stat": "BreakDamageAddedRatioBase",
    "minimumThreshold": 1.2,
    "maximumThreshold": 1.8
  }
]
```

仅依据最终 OOC Build 面板值计算 `clamp((panel − minimumThreshold) / (maximumThreshold − minimumThreshold), 0, 1)`。下限奖励进度为 0，上限及以上为 1。必须 `maximumThreshold > minimumThreshold`；不能重复同一 stat，也不能将 `CriticalChanceBase` 加入 Soft Target。多个目标取平均；无目标时进度为 0。现有 9 条目标的 min/max 已由维护者在人工审核表中确认并写入正式配置；以后新增目标仍需先由维护者确定完整区间。

## Hard Breakpoint

写 `{"stat":"SpeedDelta","threshold":160}`。最终面板值大于或等于 threshold 时达标；低于 threshold 时失败。多个 breakpoint 的失败比例为失败数除以总数；无 breakpoint 时为 0。不能重复完全相同的 stat 和 threshold。

## 单位和评分边界

阈值使用内部最终面板单位。比例属性 `1.0 = 100%`，例如击破特攻 `1.8 = 180%`；SPD、ATK、DEF 使用最终面板数值。`AttackAddedRatio`、`DefenceAddedRatio` 等 stat 是 canonical 属性键，阈值仍对应映射后的最终面板 ATK、DEF 数值。

Soft Target 进度和 Hard Breakpoint 失败比例只在 Build 层参与评分，权重位于 `src/lib/relic-score/scoring-config.ts` 的集中配置，不在 Character Profile 中设置。Piece Score 和 farming benchmark 只使用基础副词条权重。

当前 Build Score 先计算归一化属性完成度，再按属性 95%、套装 5% 聚合。令 `S` 为原 Stat Completion、`T` 为 Set Integrity、`P` 为 Soft Target Progress、`F` 为 Hard Breakpoint Failure Ratio；`Is` 和 `Ih` 分别表示 Profile 是否存在 Soft Target 和 Hard Breakpoint（有则为 1，否则为 0）：

```text
N = (95×S + 8×Is×P + 5×Ih×(1−F)) / (95 + 8×Is + 5×Ih)
FinalBuildScore = 100×(0.95×N + 0.05×T)
```

Soft Target 权重为 8，Hard Breakpoint 权重为 5。没有两类 modifier 时 `N=S`；有 modifier 时，它们只在 `N` 中应用一次。旧版 `CoreBuildScore + soft bonus − hard penalty` 已废弃，不能再用来计算当前分数。Phase 1D 报告记录历史校准结果，不代表当前评分规则。

正式 benchmark 的过期规则和独立再生成步骤见 [Benchmark 维护](benchmark-maintenance.md)。
