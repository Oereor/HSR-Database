# 异相仲裁 Boss 分阶段 HP 调查报告

## 1. 调查目标

本报告只调查异相仲裁（ChallengePeak / Endgame）多阶段敌人的生命上限来源，重点 testcase 为 v4.5「军团再临」Boss“反造物主，流溢之恨”（Iron Tomb Core）。调查范围包括：

- 当前 HSR-Database 如何得到单条 HP 与 `phaseCount`；
- 原始数据如何从 ChallengePeak 关卡链定位到 Boss；
- P1→P2、P2→P3 是否存在阶段专属 MaxHP 倍率；
- `12,395,970 / 15,494,963 / 12,395,970` 与本地配置的吻合程度；
- 未来 parser 的最小改造边界。

本轮没有修改生产代码，也没有修改 `TurnBasedGameData`。

## 2. TL;DR

- **当前显示为什么是 `12,395,970 × 3`？** `[Verified]` 当前 parser 只计算一个 encounter 的 `maxHpPerBar`，再从角色配置读取 `MaxMonsterPhase = 3`。`buildOccurrenceView()` 把二者投影为 `roundedPerBar + phaseCount`，`HpDisplay.svelte` 固定显示为 `HP × phaseCount`，没有输出逐阶段 HP。
- **P2 的额外 HP 从哪里来？** `[Verified]` Iron Tomb Core 的角色配置 `PhaseList[].PhaseMaxHPRatio` 通过 DynamicValue 指向 `PassiveSkill02` 的参数索引 2/3/4；`MonsterSkillConfig.SkillID = 403501010` 的参数为 `[0.5, 0.35, 1, 1.25, 1]`，因此静态阶段倍率为 `[1, 1.25, 1]`。
- **是否已确认“×1.25”？** `[Verified]` 已确认配置中存在 `1.25`，且它被阶段 2 的 `PhaseMaxHPRatio` 引用。`[Inferred]` 这是目标结果 P2 增加 25% 的最直接来源。仍不能断言游戏最终采用何种整数化顺序。
- **P3 为什么恢复？** `[Verified]` 静态 `PhaseMaxHPRatio` 的 P3 参数为 `1`。但 P3 过场还会对主体与两个附属实体添加 `HPAddedRatio` modifier，并调用 `SetBossPluralityHP`；该运行时逻辑与复数血条/UI 的最终 MaxHP 关系未完全可由静态表证明，标记为 `[Unknown]`。
- **parser 应修在哪一层？** 优先在 Monster 角色配置的 phase metadata 层解析 `PhaseMaxHPRatio` 与 DynamicValue→技能参数映射；对确实只在 Ability/Modifier 中改变 MaxHP 的 Boss，再增加一个窄范围的 `AddModifier → StackProperty(HPAddedRatio)` 解析，不需要完整 Ability 解释器。

## 3. 当前 HSR-Database HP pipeline

### 3.1 数据读取

`HSR-Database/scripts/data/endgame.ts` 的 `loadTables()` 读取以下相关表：

- `ChallengePeakGroupConfig`
- `ChallengePeakConfig`
- `ChallengePeakBossConfig`
- `PlaneEvent`
- `StageConfig`
- `StageInfiniteGroup`
- `StageInfiniteWaveConfig`
- `StageInfiniteMonsterGroup`
- `MonsterConfig`
- `MonsterTemplateConfig`
- `HardLevelGroup`
- `EliteGroup`

同时，`scanMechanics()` 按 `MonsterTemplateConfig.JsonConfig` 读取 `Config/ConfigCharacter/Monster/*.json`，并读取 companion `Config/ConfigAbility/Monster/*.json`。

### 3.2 关卡到敌人的解析链

当前固定/无限波次均按下列方式解析：

```text
ChallengePeakGroupConfig
  → ChallengePeakConfig / ChallengePeakBossConfig
  → EventIDList / HardEventIDList
  → PlaneEvent.EventID → StageConfig.StageID
  → StageConfig._StageInfiniteGroup
  → StageInfiniteGroup.WaveIDList
  → StageInfiniteWaveConfig.MonsterGroupIDList
  → StageInfiniteMonsterGroup.MonsterList
  → MonsterConfig.MonsterID
  → MonsterConfig.MonsterTemplateID
  → MonsterTemplateConfig
```

代码位置：`scripts/data/endgame.ts` 中 `resolveStage()`、`infiniteGroupIdOf()`、`buildSpawnStage()`、`buildOccurrence()`。

### 3.3 当前 HP 公式

`buildOccurrence()`（约 1044–1059 行）计算：

```text
baseEncounterMaxHpPerBar
  = MonsterTemplateConfig.HPBase
  × MonsterConfig.HPModifyRatio
  × HardLevelGroup.HPRatio
  × EliteGroup.HPRatio
```

普通 AA testcase 使用：

```text
6975 × 3.666667 × 484.69086 × 1
= 12,395,969.87140624950
→ 当前 UI 半上取整显示为 12,395,970
```

其中 `HardLevelGroup` 和 `Level` 来自 `StageConfig`，`EliteGroup` 优先来自波次上下文（缺失时才回退到 `MonsterConfig.EliteGroup`）。

### 3.4 当前 phaseCount 的来源与丢失点

`scanMechanics()` 读取角色 JSON 的 `MaxMonsterPhase`：

```ts
const phaseCount = integer(character.MaxMonsterPhase ?? 0, 'MaxMonsterPhase');
if (phaseCount > 0) result.phaseCount = phaseCount;
```

随后只写入 `EnemyMechanics.phaseCount`。`EnemyOccurrence` 保留 `hp`（单个 `baseEncounterMaxHpPerBar`）和 `mechanics.phaseCount`，没有保存 `PhaseList`、每阶段倍率或阶段来源。

`src/lib/domain/endgame-view.ts` 的 `buildOccurrenceView()` 只输出：

```text
exactPerBar = occurrence.hp.final.maxHpPerBar
roundedPerBar = formatFullHp(...)
phaseCount = mechanics.phaseCount
```

`formatHpWithPhases()` 与 `src/lib/components/endgame/HpDisplay.svelte` 再把它渲染成 `HP × phaseCount`。因此 `phaseCount = 3` 被隐式解释成“三条相同血条”。

注意：`scanMechanics()` 虽然会记录 `characterConfig`、`abilityConfig`、`abilityReferences`，也会标记 `runtime-unclear`，但阶段倍率本身没有进入领域模型。

## 4. 「反造物主，流溢之恨」数据身份确认

### 4.1 ChallengePeak 身份

`TurnBasedGameData/ExcelOutput/ChallengePeakGroupConfig.json`：

```text
ChallengePeakGroupConfig.ID = 9
PreLevelIDList = [901, 902, 903]
BossLevelID = 904
```

`ExcelOutput/ChallengePeakConfig.json` 的 `ID = 904`：

```text
EventIDList = [30509021]          // 普通
```

`ExcelOutput/ChallengePeakBossConfig.json` 的 `ID = 904`：

```text
HardEventIDList = [30509022]      // 绝境/Hard
```

### 4.2 Stage / wave / Monster 身份

`PlaneEvent.json` 将 `EventID` 映射到同号 `StageID`：

```text
30509021 → StageID 30509021
30509022 → StageID 30509022
```

两条 `StageConfig` 的关键字段：

| 变体 | StageID | Level | HardLevelGroup | `_StageInfiniteGroup` | MonsterList |
| --- | ---: | ---: | ---: | ---: | --- |
| 普通 | 30509021 | 100 | 3 | 30509021 | [403501001] |
| Hard | 30509022 | 120 | 3 | 30509022 | [403501001] |

`StageInfiniteGroup`：

```text
30509021 → WaveIDList [305090211]
30509022 → WaveIDList [305090221]
```

`StageInfiniteWaveConfig`：

```text
305090211 → MonsterGroupIDList [305090211]
305090221 → MonsterGroupIDList [305090221]
```

`StageInfiniteMonsterGroup`：

```text
305090211 → MonsterList [403501001], EliteGroup = 1
305090221 → MonsterList [403501001], EliteGroup = 1
```

### 4.3 MonsterID / TemplateID / TemplateGroupID

`ExcelOutput/MonsterConfig.json`：

```text
MonsterID = 403501001
MonsterTemplateID = 4035010
HPModifyRatio = 3.666667
EliteGroup = 1
HardLevelGroup = 1       // Stage 的 HardLevelGroup=3 在 encounter 计算中优先
SummonIDList = [403502001, 403206001, 403207001]
```

`ExcelOutput/MonsterTemplateConfig.json`：

```text
MonsterTemplateID = 4035010
TemplateGroupID = 4035010
JsonConfig = Config/ConfigCharacter/Monster/Monster_W4_IronTombCore_00_Config.json
HPBase = 6975
Rank = BigBoss
```

结论：

- `[Verified]` `403501001` 是 Stage 实际生成的具体 `MonsterConfig` 记录。
- `[Verified]` `4035010` 是它引用的模板 ID；模板记录同时有 `TemplateGroupID = 4035010`。
- `[Verified]` `4035010` 不是 phase ID。P1/P2/P3 没有替换成不同的 `MonsterID` 或不同的 `MonsterTemplateID`。
- `[Verified]` `SummonIDList` 中的三个 ID 是附属单位/组件引用，不应当当作主体的阶段。

## 5. P1 基础 HP 的来源

普通阶段 `StageID=30509021` 使用 `Level=100, HardLevelGroup=3`；波次上下文使用 `EliteGroup=1`。

证据：

- `Monster_W4_IronTombCore_00_Config.json` 对应模板的 `HPBase = 6975`（模板表）；
- `MonsterConfig[403501001].HPModifyRatio = 3.666667`；
- `HardLevelGroup[3,100].HPRatio = 484.69086`；
- `EliteGroup[1].HPRatio = 1`。

因此：

```text
P1 静态单条 HP
= 6975 × 3.666667 × 484.69086 × 1
= 12,395,969.87140624950
```

当前网站 `formatRoundedDecimal()` 检查小数首位，首位为 8，因此采用半上取整显示 `12,395,970`。这解释了当前页面单条 HP 的来源，但尚未包含阶段倍率。

## 6. Phase 数据来源

文件：`TurnBasedGameData/Config/ConfigCharacter/Monster/Monster_W4_IronTombCore_00_Config.json`

关键字段：

```text
MaxMonsterPhase = 3
PhaseList = [
  { PhaseNum: 1, PhaseMaxHPRatio → DynamicHash -2011261060 },
  { PhaseNum: 2, PhaseMaxHPRatio → DynamicHash -1187209710 },
  { PhaseNum: 3, PhaseMaxHPRatio → DynamicHash 92988696 }
]
```

同一文件的 `DynamicValues.Floats` 将三个 hash 绑定到：

```text
-2011261060 → SkillParam(PassiveSkill02, index 2)
-1187209710 → SkillParam(PassiveSkill02, index 3)
  92988696 → SkillParam(PassiveSkill02, index 4)
```

`TurnBasedGameData/ExcelOutput/MonsterSkillConfig.json` 中：

```text
SkillID = 403501010
SkillTriggerKey = PassiveSkill02
PhaseList = [1, 2, 3]
ParamList = [0.5, 0.35, 1, 1.25, 1]
```

因此阶段 MaxHP 倍率为：

```text
[P1, P2, P3] = [Param[2], Param[3], Param[4]] = [1, 1.25, 1]
```

这是通用的静态 phase metadata 形态：阶段数量与阶段上限倍率存放在角色配置，倍率值可通过 DynamicValue 绑定到技能参数。

## 7. P1 → P2 调查

### 7.1 阶段切换触发链

文件：`Config/ConfigAbility/Monster/Monster_W4_IronTombCore_00_Ability.json`

1. `Monster_W4_IronTombCore_00_PassiveSkillInitiate.OnAdd` 执行 `SetMonsterPhase`，初始化 P1。
2. `MMonster_W4_IronTombCore_00_PhaseController._CallbackList` 监听 `OnLimboWaitHeal`。
3. 满足 `InsertCheck == 1` 后执行 `SetMonsterPhase { SetMode: "Inc" }`。
4. 随后 `TurnInsertAbility` 插入 `Monster_W4_IronTombCore_00_PassiveSkill_Insert`，并通过 `IncludeTaskListTemplate("Monster_ChangePhase")` 执行通用换阶段流程。

上述证据证明 P1→P2 是同一 runtime entity 的 phase 增量，而不是换成另一个 MonsterConfig。

### 7.2 P2 的静态 MaxHP 倍率

`PhaseList[PhaseNum=2].PhaseMaxHPRatio` 指向 `PassiveSkill02` 的索引 3；该索引值为 `1.25`。

结论：

- `[Verified]` 配置中存在明确的 P2 `PhaseMaxHPRatio = 1.25`。
- `[Inferred]` 它是外部参考中 P2 比 P1 多 25% 的首要来源。
- `[Unknown]` `PhaseMaxHPRatio` 在完整游戏引擎中是按“当前阶段 MaxHP 重新设定”、还是以先前整数化后的 MaxHP 叠加，单凭导出 JSON 无法确定。

## 8. P2 → P3 调查

### 8.1 阶段递增

`MMonster_W4_IronTombCore_00_P3_PhaseController` 同样监听 `OnLimboWaitHeal`，在 `InsertCheck02 == 1` 时执行：

```text
SetMonsterPhase { SetMode: "Inc" }
→ TurnInsertAbility("Monster_W4_IronTombCore_00_PassiveSkill_Insert02")
```

### 8.2 P3 的额外运行时逻辑

`Monster_W4_IronTombCore_00_PassiveSkill_Insert02` 的过场任务包含：

```text
SetIronTombInfinityHPUI { IsShowInfinityHP: false, IsShowPluralityHP: true }
AddModifier target = Part_00 + Part_01 + IronTombCore
  ModifierName = MMonster_W4_IronTombCore_00_Main_P3_HpRatioAdded
```

该 modifier 的 `OnStack`：

```text
StackProperty {
  Property = "HPAddedRatio"
  PropertyValue → DynamicHash 960730890
}
SetBossPluralityHP { PluralityValue = 99999 }
```

`960730890` 在角色配置中绑定 `PassiveSkill03` 索引 0；`MonsterSkillConfig[403501012]` 的 `ParamList[0] = 50`。

解释边界：

- `[Verified]` P3 transition 确实添加了 `HPAddedRatio`，并且作用目标包含主体与两个 part entity。
- `[Verified]` 静态 `PhaseMaxHPRatio` 的 P3 值仍是 `1`。
- `[Unknown]` `HPAddedRatio = 50` 的单位/语义（例如百分比、引擎内部定点比例或特殊 Boss 复数血条参数）、它与 `SetBossPluralityHP=99999` 的组合方式，以及最终显示血条 MaxHP，不能仅凭当前导出数据安全还原。
- 因此不能把 P3 简化为“只读取静态倍率即可完全模拟运行时”。对本 Boss，静态倍率支持 P3 回到 P1 的结构，但 runtime modifier 仍需在风险项中保留。

## 9. 数值验证

以普通 Stage 的精确 P1 单条 HP 为基准：

```text
H = 12,395,969.87140624950
```

按静态阶段倍率直接乘：

| Phase | Base HP（精确） | Phase modifier | 直接计算结果 | 当前网站半上取整 |
| --- | ---: | ---: | ---: | ---: |
| P1 | 12,395,969.87140624950 | 1.00 | 12,395,969.87140624950 | 12,395,970 |
| P2 | 12,395,969.87140624950 | 1.25 | 15,494,962.3392578118750 | 15,494,962 |
| P3 | 12,395,969.87140624950 | 1.00 | 12,395,969.87140624950 | 12,395,970 |

外部参考目标为 `12,395,970 / 15,494,963 / 12,395,970`。若先把 P1 显示整数化，再乘 1.25：

```text
12,395,970 × 1.25 = 15,494,962.5
→ 半上取整 = 15,494,963
```

结论：

- `[Verified]` `[1, 1.25, 1]` 的结构与三阶段目标完全一致。
- `[Verified]` 当前网站以精确十进制保存单条 HP，再在显示层半上取整；按该顺序 P2 会显示 `15,494,962`。
- `[Inferred]` 外部 `15,494,963` 很可能采用了“先得到/显示 P1 整数，再施加 1.25”的顺序，或游戏使用另一种 fixed-point/整数算法。
- `[Unknown]` 游戏客户端/服务器真实的整数化顺序与 `HPAddedRatio` 的定点单位，当前本地静态资料无法确认，不能在实现中硬编码某一种舍入规则。

## 10. 其他 Boss 抽样

### 10.1 各阶段相同的普通多阶段 Boss

抽样：`Monster_W3_FigureBoss_00_Config_New.json`。

- `MonsterTemplateID = 3004012`，`TemplateGroupID = 3004010`；
- `MonsterID = 3004012`；
- `MaxMonsterPhase = 2`；
- `PhaseList = [{PhaseNum:1}, {PhaseNum:2}]`，没有 `PhaseMaxHPRatio`；
- 当前生成数据中对应 `groupId=1, configId=101` 的 occurrence 标记 `phaseCount=2`，且没有 HP manipulation。

这支持一个安全默认：未声明阶段倍率时，数据库可以暂时视为各阶段相同，但仍应保留“未声明”与“已确认相同”的区别。

### 10.2 存在显式阶段倍率的通用能力

原始仓库中多个 Monster character config 含 `PhaseMaxHPRatio`，例如 Cocolia、Asat Pramad、DawnsEye 等。Cocolia P2 配置 `Monster_W1_CocoliaP2_00_Config.json` 明确包含 P2 `PhaseMaxHPRatio`，并通过 DynamicValue 绑定 `SkillP01` 参数。

结论：

- `[Verified]` per-phase HP metadata 不是 ChallengePeak 专属字段，而是通用 Monster phase 配置能力。
- `[Verified]` 也存在 Ability/Modifier 动态改 HP 的 Boss 特例；Iron Tomb Core 同时具备静态 phase ratio 与 P3 runtime modifier。
- `[Inferred]` 未来 parser 需要“静态 phase metadata + 少量 runtime HP modifier 识别”的组合，而不是只依赖 ChallengePeak 表。

## 11. 对现有数据模型的影响

当前模型实质上是：

```text
singlePhaseHP + phaseCount
```

对 Iron Tomb Core 不足，因为 `[1, 1.25, 1]` 不能被一个 `singlePhaseHP` 与总数无损表达；P3 还存在运行时 HP modifier 与复数血条操作。

建议未来领域模型至少保留：

```ts
phases: Array<{
  phase: number;
  hp?: DecimalString;
  multiplier?: DecimalString;
  source: 'phase-metadata' | 'ability-modifier' | 'unknown';
}>
```

同时保留 `baseHP`、`phaseCount`、原始配置路径和解析状态，避免把“未声明倍率”误报为“确定相同”。本节仅为设计建议，不改现有代码。

## 12. 推荐的最小重构方案

1. **第一层：解析静态 phase metadata。** 从 `MonsterTemplateConfig.JsonConfig` 读取 `MaxMonsterPhase`、`PhaseList[].PhaseMaxHPRatio`，解析 DynamicValue 的 `SkillParam(TriggerKey, Index)` 引用，再从对应 `MonsterSkillConfig` 读取参数。
2. **第二层：窄范围扫描 Ability。** 只识别影响 MaxHP 的结构化模式：
   `SetMonsterPhase` 触发顺序、`AddModifier`、modifier `StackProperty(Property="HPAddedRatio")`、相关 `DynamicValue`。
3. **不要实现完整 Ability interpreter。** 对展示逐阶段 HP，仅需识别上述少数任务与数值来源；动画、镜头、伤害、召唤、UI 特效不必执行。
4. **保留不确定状态。** 若只找到 `PhaseMaxHPRatio`，可输出静态倍率；若发现 `HPAddedRatio`、共享血条或 `SetBossPluralityHP`，标记 `runtime-unclear` 并附证据。
5. **显示策略。** 只有在所有阶段倍率都已确认相同且没有 runtime HP 操作时，才继续压缩为 `HP × PhaseCount`；否则显示 P1/P2/P3 明细或明确的“运行时未完全解析”。

## 13. 未解决问题 / 风险

- `[Unknown]` 游戏实际对 phase MaxHP 的整数化顺序：精确十进制后乘倍率、先整数化再乘、fixed-point，或其他。
- `[Unknown]` Iron Tomb Core 的 `HPAddedRatio` 参数 `50` 的确切单位及其与 `PhaseMaxHPRatio=1` 的组合。
- `[Unknown]` `SetBossPluralityHP` 的 `99999` 是否只控制 UI/复数血条，还是同时参与 runtime MaxHP 计算。
- `[Unknown]` 主体与 `Monster_W4_IronTombCorePart_00/01` 的共享/复数血条聚合规则；本报告没有尝试模拟战斗引擎。
- `[Verified]` 当前网站的 `effectiveTotalHp` 在 `phaseCount > 1` 或检测到 HP runtime 操作时会被省略，并标记 `runtime-unclear`；这避免了把当前单条静态值错误宣称为完整总 HP，但仍无法给出逐阶段数值。

## 14. 关键证据索引

| Purpose | File | Key / object | Finding |
| --- | --- | --- | --- |
| AA group identity | `TurnBasedGameData/ExcelOutput/ChallengePeakGroupConfig.json` | `ID=9` | `BossLevelID=904`, preliminary `[901,902,903]` |
| AA normal boss | `TurnBasedGameData/ExcelOutput/ChallengePeakConfig.json` | `ID=904` | `EventIDList=[30509021]` |
| AA hard boss | `TurnBasedGameData/ExcelOutput/ChallengePeakBossConfig.json` | `ID=904` | `HardEventIDList=[30509022]` |
| Stage identity | `TurnBasedGameData/ExcelOutput/StageConfig.json` | `StageID=30509021/30509022` | Level 100/120, `_StageInfiniteGroup`, MonsterList |
| Wave chain | `TurnBasedGameData/ExcelOutput/StageInfiniteGroup.json`, `StageInfiniteWaveConfig.json`, `StageInfiniteMonsterGroup.json` | `30509021* / 30509022*` | Both variants spawn MonsterID `403501001` |
| Concrete Monster | `TurnBasedGameData/ExcelOutput/MonsterConfig.json` | `MonsterID=403501001` | Template `4035010`, HPModifyRatio `3.666667`, summons |
| Template/base HP | `TurnBasedGameData/ExcelOutput/MonsterTemplateConfig.json` | `MonsterTemplateID=4035010` | `TemplateGroupID=4035010`, HPBase `6975`, Iron Tomb JSON path |
| Level multiplier | `TurnBasedGameData/ExcelOutput/HardLevelGroup.json` | `(HardLevelGroup=3, Level=100)` | `HPRatio=484.69086` |
| Elite multiplier | `TurnBasedGameData/ExcelOutput/EliteGroup.json` | `EliteGroup=1` | `HPRatio=1` |
| Phase metadata | `TurnBasedGameData/Config/ConfigCharacter/Monster/Monster_W4_IronTombCore_00_Config.json` | `MaxMonsterPhase`, `PhaseList`, `DynamicValues.Floats` | P1/P2/P3 hashes map to PassiveSkill02 indices 2/3/4 |
| Static phase ratios | `TurnBasedGameData/ExcelOutput/MonsterSkillConfig.json` | `SkillID=403501010` | `PassiveSkill02.ParamList=[0.5,0.35,1,1.25,1]` |
| P1/P2 transition | `TurnBasedGameData/Config/ConfigAbility/Monster/Monster_W4_IronTombCore_00_Ability.json` | `PhaseController`, `SetMonsterPhase`, `Monster_ChangePhase` | Same entity increments phase and inserts transition ability |
| P3 runtime HP change | same Ability file | `MMonster_*_Main_P3_HpRatioAdded` | `StackProperty(HPAddedRatio)` + `SetBossPluralityHP=99999` |
| Current HP pipeline | `HSR-Database/scripts/data/endgame.ts` | `buildOccurrence`, `scanMechanics` | Computes one `baseEncounterMaxHpPerBar`; reads only `MaxMonsterPhase` |
| Current UI projection | `HSR-Database/src/lib/domain/endgame-view.ts`, `src/lib/components/endgame/HpDisplay.svelte` | `buildOccurrenceView`, `formatHpWithPhases` | Renders `HP × phaseCount` |

