# Endgame 静态分阶段 HP 技术审计

审计日期：2026-11-03。对应 Issue #53[^issue]。网站代码基线：`a155d388bc81e82de0aa083344dec07312b9dfe1`，分支 `develop`。本报告是调查结果，不替代架构规范，也不实现功能或设计 UI。

版本说明：第 1—9 节保留旧锁定数据下的调查与实施结论，其中亚婆离缺失 Character Config 的结论仅适用于旧提交。4.7 提交已补全配置，当前解析结果见第 10 节。

## 1. 结论与数据口径

**现有上游数据与参数工具已足以支持绝大多数 Endgame 敌人的静态分阶段 HP，尚不足以完整覆盖全部敌人。** 已确认多阶段的 354 个 occurrence 中，352 个可以完整计算，占 **99.44%**。缺省倍率按 1 处理；明确配置的值必须解析并通过 HP 倍率有效性检查。运行时 HP 状态不参与这个静态覆盖率门槛。

剩余缺口有两类：Iron Tomb Core 的具体 Monster 参数覆盖经现有工具得到负倍率，缺少 `-1` 覆盖值语义的可靠证据；另一个 Boss 的 Character Config 在锁定提交中缺失，无法确定阶段数。这些问题不阻碍先支持已解析结果，但不能静默回退成倍率 1。无需以完整 Ability 解释器或所有运行时 Modifier 为实施前提。

### 1.1 来源与统计方法

- 权威源为 `../TurnBasedGameData`，HEAD 与 `upstream.lock.json` 一致：`74a7b96fba32f00cf495a5c00b0311bd02207aaf`，提交标题 `OSPRODWin4.6.0_D16854589_A16781679_L16781679`。下文原始路径均相对此源目录。线上证据按该提交固定[^upstream]。
- 仓库内 `.upstream/TurnBasedGameData` 为 `312b4597691e0a29cf9828a15b592757dba86949`，不用于本报告统计。也没有使用 StarRailRes 的索引替代游戏表。
- 直接调用现有 `buildEndgameDomain(root)`，遍历 `datasets → groups → encounters → battles → stages → waveModel.waves`。固定波次取 `enemies`，无限波次取各 `monsterGroups.orderedEnemies`。
- 覆盖所有配置期次，包括历史、未来配置和 AA 普通／Hard；不按当前日期筛选。Stage 的 previewMonsterIds 不重复计数，SummonIDList 不递归展开。无限波次按静态配置中的敌人位置计数，不模拟运行时重复生成。
- occurrence 使用现有 `occurrenceId`，包含 mode、group、encounter、variant、slot、stage、wave、spawn group 和 position。26,776 个条目与 26,776 个唯一 occurrenceId 一致。
- T、M、O 分别表示唯一 MonsterTemplateID、唯一 MonsterID、occurrence。跨模式总计的 T/M 重新去重，O 求和。已确认多阶段要求可读 Character Config 且 `MaxMonsterPhase > 1`；缺失配置单列。
- 所有倍率和 HP 使用 `readRaw/readTable` 的无损十进制字符串以及现有十进制工具；不通过普通 JSON 数值解析计算 HP。

Issue #53 在审计时只有标题，无正文和评论。需求依据采用本次产品原则。旧报告 [challenge-peak-phase-hp.md](challenge-peak-phase-hp.md) 提供身份与运行时线索；其中基础技能参数的结论需要加入具体 Monster 覆盖后重新评估。当前数据流以 [localization-and-data-generation.md](../architecture/localization-and-data-generation.md) 为准。

### 1.2 数量与完整静态覆盖率

| 模式 | 全部 T / M / O | 已确认多阶段 T / M / O | 全阶段可算 T / M / O | 多阶段 O 覆盖率 | 阶段数未知 T / M / O |
| --- | --- | --- | --- | --- | --- |
| MoC | 133 / 177 / 7,298 | 18 / 24 / 139 | 18 / 24 / 139 | 100% | 1 / 1 / 1 |
| PF | 128 / 227 / 19,064 | 0 / 0 / 0 | 0 / 0 / 0 | 不适用 | 0 / 0 / 0 |
| AS | 18 / 72 / 201 | 17 / 68 / 181 | 17 / 68 / 181 | 100% | 0 / 0 / 0 |
| AA | 67 / 70 / 213 | 18 / 19 / 34 | 17 / 18 / 32 | 94.12% | 1 / 1 / 2 |
| 跨模式总计 | 191 / 415 / 26,776 | 39 / 98 / 354 | 38 / 97 / 352 | 99.44% | 1 / 2 / 3 |

完整可算还要求 occurrence 的现有 `hp.final.status === 'resolved'`；本次所有 occurrence 均满足这个基础 HP 条件。按多阶段 T/M 计，完整覆盖率分别为 38/39（97.44%）、97/98（98.98%）。这些是静态公式覆盖率，不代表游戏运行时 HP 已被完整还原。

## 2. 阶段结构与倍率配置

### 2.1 MaxMonsterPhase 与 PhaseList

39 个已确认多阶段 Template、98 个 MonsterID 的 PhaseList 均完整对应 `1..MaxMonsterPhase`：没有缺失阶段、重复 PhaseNum、越界、零起始或其他特殊编号；数组顺序也与编号一致。36 个 Template 为两阶段，3 个为三阶段：`4015011`、`3025016`、`4035010`。不能由这一批数据推导“所有未来配置永远按数组下标编号”；实现应使用 PhaseNum 并校验结构。

普通单阶段样本可能同时省略 MaxMonsterPhase 和 PhaseList，例如 `8012010`。**可读配置中的省略**可采用单阶段、倍率 1；**整个配置缺失**则不能被等同为单阶段。缺失 Template `5034010` 不进入上述 39 个 Template 的分母。

### 2.2 按敌人分类的倍率形式

以下类别互斥：“全缺省”指每阶段都没有 PhaseMaxHPRatio；“固定”或“DynamicValue”允许其他阶段缺省。每格为 T / M / O。

| 模式 | 全缺省 | 含固定倍率 | 含 DynamicValue（AQAR） | 复杂／其他显式形式 |
| --- | --- | --- | --- | --- |
| MoC | 18 / 24 / 139 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| PF | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| AS | 14 / 56 / 145 | 1 / 4 / 8 | 2 / 8 / 28 | 0 / 0 / 0 |
| AA | 14 / 15 / 26 | 0 / 0 / 0 | 4 / 4 / 8 | 0 / 0 / 0 |
| 跨模式总计 | 32 / 82 / 310 | 1 / 4 / 8 | 6 / 12 / 36 | 0 / 0 / 0 |

按唯一 MonsterID 的各阶段条目统计：缺省 180 条、固定 4 条、AQAR 15 条，共 199 条。按 occurrence 展开：缺省 664 条、固定 8 条、AQAR 42 条，共 714 条。AQAR 条目全部能通过现有工具读到数值，但其中 4 条 occurrence 阶段值为 `-1`，不构成有效 HP 倍率。**显式数值可读不等于有效 HP 可算。**

在当前 Endgame 使用范围内，没有多 hash、嵌套运算、其他 OpCodes、非 SkillParam 动态读值，也没有直接裸数值形式的 PhaseMaxHPRatio。没有必要为提高本批覆盖率扩展表达式解释器。

### 2.3 显式倍率证据清单

路径前缀均为 `Config/ConfigCharacter/Monster/`。表内倍率已经考虑具体 Monster 的参数覆盖；“缺省 1”是产品计算规则。

| TemplateID | 实际 MonsterID | Character Config 文件 | 阶段倍率 | 形式 |
| --- | --- | --- | --- | --- |
| 8034012 | 803401201–803401204 | Monster_W3_Aventurine_00_Config_IF.json | 缺省 1、1.1 | 固定 |
| 8025011 | 802501101–802501104 | Monster_SW_Boss_01_Config_IF.json | 缺省 1、1 | AQAR |
| 2035012 | 203501201–203501204 | Monster_W2_Feixiao_00_Config_IF.json | 缺省 1、1 | AQAR |
| 4015011 | 401501101 | Monster_W4_DawnsEye_03_Config.json | 缺省 1、1.4、2.2 | AQAR + 具体覆盖 |
| 3025016 | 3025016 | Monster_W3_Sunday_02_Config.json | 缺省 1、缺省 1、0.8 | AQAR |
| 8025010 | 802501003 | Monster_SW_Boss_01_Config.json | 缺省 1、1.4 | AQAR |
| 4035010 | 403501001 | Monster_W4_IronTombCore_00_Config.json | -1（无效）、-1（无效）、1 | AQAR + 具体覆盖 |

**明确具有有效不同阶段静态倍率**的敌人共 4 T / 7 M / 14 O：AS 为 1 / 4 / 8，AA 为 3 / 3 / 6，MoC 与 PF 为 0。Iron Tomb Core 单列为 1 T / 1 M / 2 O 的无效倍率，不把负值差异计入有效差异统计；其基础技能表确实存在不同倍率，但不是具体 Monster 的现有解析结果。

## 3. 现有参数解析能力与复用边界

### 3.1 已验证的映射

`scripts/data/enemy-skill-params.ts` 的 `resolveSkillValue()` 可直接接收 PhaseMaxHPRatio 的配置对象。需要调用方先构造 `Map<SkillTriggerKey, effectiveParams>`：

```text
MonsterConfig.SkillList → MonsterSkillConfig.SkillID
  → SkillTriggerKey + effectiveSkillParams(skill, concreteMonster)
PhaseMaxHPRatio.PostfixExpr.DynamicHashes[0]
  → CharacterConfig.DynamicValues.Floats[String(hash)].ReadInfo
  → Type=SkillParam、TriggerKey、零起始 Index
  → effectiveParams[TriggerKey][Index]
```

这是技能参数索引，不是 PhaseList 的数组索引，也不能直接把动态 hash 当 SkillID。需要使用 Character Config 的 Floats；不需要为静态阶段倍率读取 Ability body。

现有 `effectiveSkillParams()` 使用覆盖行的 `BOKJJKFCFME` 匹配 SkillID，以 `PBLPLDJKPEI` 中实际提供的位置替换基础 ParamList，未提供的后缀保留基础值。重复覆盖行、非数组覆盖配置会返回空数组；非法十进制位置返回 undefined。它**没有**把负数视为继承标记的逻辑，也不负责验证数值是否适合作为 HP 倍率。

`scripts/data/enemy-skill-details.ts` 已包含按具体 Monster 构造 trigger 参数表的实现，可复用其构造规则；不宜直接调用整个 `buildEnemySkillDetails()`，因为该函数先要求匹配的 Ability 文件和引用，静态阶段倍率不应被这个无关前提阻断。

### 3.2 表达式、冲突及失败边界

| 条件 | 现有能力／建议行为 |
| --- | --- |
| IsDynamic=false | 读取 FixedValue，支持十进制包装 |
| AQAR、单 hash、无固定项 | 直接读取 SkillParam；本次显式动态倍率全部为此形式 |
| AQAAAAQR | 已有“动态值乘固定值”支持；要求单 hash、单个 Value 包装固定项等严格结构，本次阶段倍率未使用 |
| 其他 OpCodes、多 hash、未知 ReadInfo.Type | 返回 undefined；保持 unresolved，不增加猜测语义 |
| trigger 缺失、索引越界／负索引、参数无效 | 返回 undefined；不能视为缺省倍率 |
| 同 trigger 对应不同有效参数 | 采用 enemy-skill-details 的整组冲突拒绝策略，不任取一个 SkillID |
| 解析得到 -1 等非正数 | 数值解析成功，但 HP 倍率无效；阶段层拒绝，不直接交给非负 HP 取整函数 |

实际存在 trigger 冲突：PF 的 Monster `4032024`、`403202401`（Template `4032024`）同时引用 Skill `403202403` 与 `403202404`，两者的 `PassiveSkill01` 参数分别为 `[1, 0.06]` 与 `[1, 0.02]`。现有整组冲突策略会将该 trigger 置为空数组，即使某个位置恰好相同，也不会选取局部参数。本例没有显式阶段倍率，因此仍可使用缺省 1。不能因为一个无关 trigger 冲突就拒绝整只敌人的静态阶段 HP。

本批显式阶段引用没有缺失 SkillID、缺失动态 hash、索引越界或相关 trigger 冲突；实际不完整情形是第 5 节的负倍率和配置缺失。通用拒绝分支仍需保留，以免上游更新时把显式失败伪装为缺省。

### 3.3 三层缓存

| 层次 | 适合缓存 | 不适合缓存 |
| --- | --- | --- |
| Character Config 路径 | 原始阶段数量、按 PhaseNum 索引的倍率表达式、Floats 和结构诊断 | 已应用某只 Monster 覆盖的最终倍率 |
| 具体 MonsterID | SkillList、有效 trigger 参数表、逐阶段倍率解析结果 | 给其他同 Template Monster 共用覆盖后的结果 |
| occurrence／完整 encounter 上下文 | 现有 final.maxHpPerBar 与阶段倍率组合的 HP | 只按 MonsterID 缓存不同等级、EliteGroup、PF 波次的最终 HP |

当前 `scanMechanics()` 按 Template 缓存阶段数量和运行时线索，这对原始元数据适用；新增有效倍率不能直接放进这个缓存。同一 Template 的 `4015011` 与 `401501101`、`4035010` 与 `403501001` 均有真实参数差异。前两组中的基础 Monster 不作为本次 Endgame occurrence 分母，只用来验证缓存边界。

## 4. HP 计算与整数化兼容性

### 4.1 当前计算链

`scripts/data/endgame.ts` 的 `buildOccurrence()` 先按 Monster、Template 和 Stage 查找 HPBase、HPModifyRatio、HardLevelGroup/Level 的 HPRatio。EliteGroup 优先使用关卡／spawn group 上下文，缺失时回退 Monster.EliteGroup；无限波次允许命中 InfiniteEliteGroup。不能只从 Monster 表取 EliteGroup。

$$
B = HPBase \times HPModifyRatio \times HardLevelHPRatio \times EliteHPRatio
$$

非 PF 的 `hp.final.maxHpPerBar = B`，保留精确小数，`buildOccurrenceView()` 再通过 `formatFullHp()` 显示半上取整。`phaseCount` 当前仅进入 view，PhaseList 和阶段倍率没有进入模型。

PF 的 `resolvePureFictionHpModifier()` 只接受已有验证过的波次 Ability `FantasticStory_Wave_Ability_0001`（参数长度 2，HPAddedRatio 为索引 1），或无 Ability 且无参数的 identity。其他情况可返回 unresolved。`resolvePureFictionFinalHp()` 将 HardLevel HPRatio 转为 f32 对应十进制，再计算：

$$
U = HPBase \times HPModifyRatio \times f32(HardLevelHPRatio) \times EliteHPRatio \times (1 + HPAddedRatio)
$$

LittleBoss/BigBoss 截断 U，其他 rank 半上取整，结果写入现有 `final.maxHpPerBar`。该流程也适用于 identity 修正；不能绕过现有 resolver 仅在 B 上乘修正，否则会改变 f32 和整数化行为。

### 4.2 推荐的简单策略

对于已解析倍率 $r_p$，以**现有 resolved final.maxHpPerBar** 为基准计算静态阶段 HP：

$$
H_p = final.maxHpPerBar \times r_p
$$

保留精确十进制 $H_p$，显示时半上取整。非 PF 因而是先乘阶段倍率、最后显示取整；PF 则保留当前波次修正和整数化结果，再乘阶段倍率。倍率 1 完全保持当前展示值。不要用已经格式化的 roundedPerBar、缩写字符串或 JS number 反推 HP。

`multiplyDecimals`、`compareDecimals`、`canonicalDecimal` 和现有半上取整工具可以直接复用。canonicalDecimal／decimalEquals 适合判定 `1` 与 `1.0` 是否相同；字符串直接比较不能代替倍率相等判断。运行时 unclear、召唤、共享 HP 等信息仍不代表静态阶段计算失败，不改变现有 effectiveTotalHp 的运行时语义。

### 4.3 整数化影响的实际证据

对全部 352 个完整可算多阶段 occurrence 的 708 个阶段，比较“精确 final 乘倍率后半上取整”与“先半上取整 final 再乘倍率后半上取整”：8 个阶段结果不同，差值绝对值均为 **1 HP**。其余相同。

| MonsterID / StageID / 阶段 | 精确 final | 倍率 | 先乘后取整 | 先取整后乘 |
| --- | --- | --- | --- | --- |
| 803401203 / 420153 / P2 | 1083995.7077250 | 1.1 | 1,192,395 | 1,192,396 |
| 401501101 / 30502021 / P2 | 12677700.3779531227500 | 1.4 | 17,748,781 | 17,748,780 |
| 401501101 / 30502021 / P3 | 12677700.3779531227500 | 2.2 | 27,890,941 | 27,890,940 |
| 802501003 / 30507021 / P2 | 14559631.195687998912 | 1.4 | 20,383,484 | 20,383,483 |

这验证了当前数据下无需追求游戏内部整数化顺序也能满足允许 1 HP 误差的原则，未证明游戏恰好采用推荐顺序。PF 没有多阶段 occurrence，因此“PF 修正后乘非 1 阶段倍率”的实际战斗顺序仍未经真实组合样本验证；推荐顺序是保留现有 PF 行为的产品计算策略。实数乘法中两个倍率可交换，但中间整数化会改变结果；未来更大倍率不能沿用“误差永远最多 1”的断言。

## 5. 典型案例与异常证据

以下数值是配置静态计算结果，显示值按第 4 节策略生成，不宣称完整运行时 HP。所有案例的原始 Monster、Template、技能记录分别位于 `ExcelOutput/MonsterConfig.json`、`MonsterTemplateConfig.json`、`MonsterSkillConfig.json`；Stage 上下文位于 `StageConfig.json`，无限波次再经 StageInfiniteGroup、StageInfiniteWaveConfig、StageInfiniteMonsterGroup。Character 路径在表中完整列出相对文件名，统一加 `Config/ConfigCharacter/Monster/` 前缀。

### 5.1 普通、缺省和固定倍率

| 类型 | MonsterID / TemplateID | StageID | Character Config | 阶段倍率 | 基础 final 与显示 HP |
| --- | --- | --- | --- | --- | --- |
| 单阶段普通敌人 | 8012010 / 8012010 | 30001011 | Monster_AML_Minion02_00_Config.json | 缺省 1 | 139.5 × 1 × 6.099006 × 1 = 850.8113370；P1 851 |
| 多阶段全缺省 | 2024010 / 2024010 | 30004212，固定 wave 3 | Monster_W2_Xuanlu_00_Config.json | 缺省 1、缺省 1 | 1023 × 1 × 148.01102 × 1 = 151415.27346；P1/P2 均 151,415 |
| 多阶段不同固定倍率 | 803401204 / 8034012 | 420154 | Monster_W3_Aventurine_00_Config_IF.json | 缺省 1、1.1 | 8137.5 × 1 × 236.53471 × 1 = 1924801.202625；P1 1,924,801，P2 2,117,281 |

固定倍率原始事实为 `PhaseNum=2 → PhaseMaxHPRatio={IsDynamic:false, FixedValue:{Value:1.1}}`。缺省 1 是约定的静态策略，不是上游显式写入的值。

### 5.2 DynamicValue 与真正影响阶段倍率的覆盖

| MonsterID / TemplateID | StageID | Character Config | 参数链 | 倍率与显示 HP |
| --- | --- | --- | --- | --- |
| 802501101 / 8025011 | 420201 | Monster_SW_Boss_01_Config_IF.json | P2 hash 1944609779 → Skill08[0] → SkillID 802501108 → 1 | [1, 1]；final 196133.83056000；[196,134, 196,134] |
| 203501204 / 2035012 | 420304 | Monster_W2_Feixiao_00_Config_IF.json | P2 hash 24749745 → PassiveSkill03[1] → SkillID 203501209 → 1 | [1, 1]；final 8469125.29155；[8,469,125, 8,469,125] |
| 3025016 / 3025016 | 30503021 | Monster_W3_Sunday_02_Config.json | P3 hash -1317609772 → SkillP01[3] → SkillID 302501613 → 0.8 | [1, 1, 0.8]；final 10818299.99520；[10,818,300, 10,818,300, 8,654,640] |
| 401501101 / 4015011 | 30502021 | Monster_W4_DawnsEye_03_Config.json | P2 hash 2068769088 → SkillP01[0] → 401501111；P3 hash -716158144 → SkillP06[0] → 401501120 | [1, 1.4, 2.2]；final 12677700.3779531227500；[12,677,700, 17,748,781, 27,890,941] |
| 802501003 / 8025010 | 30507021 | Monster_SW_Boss_01_Config.json | P2 hash 1944609779 → Skill08[0] → SkillID 802501008 → 1.4 | [1, 1.4]；final 14559631.195687998912；[14,559,631, 20,383,484] |

DawnsEye 的 Skill `401501120` 基础 ParamList 为 `[2, 1.2, 120, 1.4, 1.4]`；Monster `401501101` 的匹配覆盖行为 `PBLPLDJKPEI=[2.2, 1.2]`。现有工具返回 `[2.2, 1.2, 120, 1.4, 1.4]`，所以 P3 为 2.2，而同 Template 基础 Monster `4015011` 的 P3 为 2。AA Hard Stage `30502022` 使用同一具体 Monster，final 为 `56345333.85062452500`，静态显示为 `[56,345,334, 78,883,467, 123,959,734]`。

Monster `802501003` 也有参数覆盖，但它覆盖的是技能 `802501005` 与 `802501009`，不影响 PhaseMaxHPRatio 所读的 `802501008`。存在 OverrideSkillParams 不等于阶段倍率一定变化。

### 5.3 PF 修正样本及多阶段样本不存在

PF 中没有已确认 MaxMonsterPhase > 1 的敌人，因此不存在可验证的“PF 特殊 HP 修正 + 多阶段”真实 occurrence。使用单阶段 Monster `4032024`（Template `4032024`）核查基础链：

- Character：`Config/ConfigCharacter/Monster/Monster_W4_FireProwler_01_Config_FantasticStory.json`，无显式阶段倍率，按单阶段倍率 1。
- Stage `30312042`，`StageInfiniteWaveConfig.InfiniteWaveID=303120423`；Ability 为 `FantasticStory_Wave_Ability_0001`，波次 HPAddedRatio 为 `7.6`，totalRatio 为 `8.6`。
- 基础 B 为 `223.2 × 1 × 188.2636 × 1 = 42020.43552`。
- f32 levelRatio 为 `188.2635955810547`；runtimeBase 为 `42020.43453369140904`；乘 8.6 后为 `361375.736989746117744`。
- 当前普通敌人取整结果为 **361,376**；按推荐策略，倍率 1 的 P1 仍为 **361,376**。同 Template 的 `403202401` 也出现在该配置波次。

这个样本的 PassiveSkill01 冲突不影响缺省倍率；PF hpParentChild、killTransfer 等机制的运行时状态也不能直接阻断这条静态 HP。

### 5.4 Iron Tomb Core：旧报告需要补上的具体覆盖

身份链仍成立：AA group 9 → config 904 → 普通／Hard Event `30509021` / `30509022` → 同号 Stage → infinite wave `305090211` / `305090221` → Monster `403501001` → Template `4035010`。Character 为 `Config/ConfigCharacter/Monster/Monster_W4_IronTombCore_00_Config.json`，MaxMonsterPhase=3。

| 阶段 | Dynamic hash | ReadInfo | Skill 403501010 基础值 | Monster 403501001 覆盖后 |
| --- | --- | --- | --- | --- |
| P1 | -2011261060 | PassiveSkill02[2] | 1 | -1 |
| P2 | -1187209710 | PassiveSkill02[3] | 1.25 | -1 |
| P3 | 92988696 | PassiveSkill02[4] | 1 | 1 |

**配置事实**：基础 ParamList 是 `[0.5, 0.35, 1, 1.25, 1]`；具体 Monster 对 Skill `403501010` 提供的 `PBLPLDJKPEI` 是 `[-1, -1, -1, -1, 1]`。`effectiveSkillParams()` 确实逐位置替换，`resolveSkillValue()` 确实返回 `[-1, -1, 1]`。基础 Monster `4035010` 没有覆盖，但当前两个 AA occurrence 使用的是 `403501001`。

**尚未验证的解释**：这些 `-1` 在游戏中是否表示“保留基础值”，以及运行时何处处理该标记。锁定数据中大量覆盖行也使用 -1，但出现频繁不能证明继承语义。不能为了复现旧报告目标值而跳过明确覆盖、统一把 -1 改成 1，或未经验证修改共享参数工具。

| 变体 / Stage | final 基础 HP | 当前可计算静态阶段显示 |
| --- | --- | --- |
| 普通 / 30509021 | 12395969.87140624950 | P1/P2 未解析为有效倍率；P3 12,395,970 |
| Hard / 30509022 | 49583878.4626249050 | P1/P2 未解析为有效倍率；P3 49,583,878 |

若未来证实 -1 表示继承，则普通阶段可得 `[12,395,970, 15,494,962, 12,395,970]`（精确基础先乘后取整）；若先把基础取整再乘，P2 为 15,494,963。这里的 1 HP 差别是可接受的取整差异，**当前阻碍却是覆盖语义未验证，不能用取整差异解释或消除**。该组数值仅为条件推导，不计入已验证覆盖率。

Ability `Config/ConfigAbility/Monster/Monster_W4_IronTombCore_00_Ability.json` 仍包含 `MMonster_W4_IronTombCore_00_Main_P3_HpRatioAdded`、`StackProperty(HPAddedRatio)` 和 `SetBossPluralityHP`。本报告不执行它们，不推断完整运行时 HP。旧报告直接引用基础 PassiveSkill03 的 50 也不能替代具体 Monster 的覆盖：当前 `403501012` 的覆盖参数为 `[0.5, 0]`；其运行时组合规则不在本次实施前提内。

### 5.5 缺失配置的特殊 Boss

Template `5034010` 的 JsonConfig 指向 `Config/ConfigCharacter/Monster/Monster_W5_Fallen_00_Config.json`。文件读取失败，且 `git ls-tree HEAD <该路径>` 没有条目：这是锁定提交中缺少目标文件，不是 `.upstream` 稀疏检出的误用。不能从显示名称、Prefab、其他 Boss 或召唤关系补造阶段数。

| MonsterID | StageID | final 基础 HP | 可保留的基础显示 |
| --- | --- | --- | --- |
| 5034010 | 30126122 | 5106432.898125 | 5,106,433 |
| 503401002 | 30510021 | 6389558.4346650 | 6,389,558 |
| 503401002 | 30510022 | 23529802.004100 | 23,529,802 |

三条基础 HP 均可算，但阶段数量及倍率未知；不能用一个伪造的 P1 结果表示“全阶段完整”。

## 6. 最小实现建议

本节仅为后续实现建议，本次没有改动下列接口或文件。

### 6.1 模型、解析模块与回退

- 增加构建期 `enemy-phase-hp.ts` 模块，负责读取／缓存 Character 阶段结构、构造具体 Monster 的有效参数表、调用现有 resolveSkillValue、验证正倍率，输出逐阶段结果。表达式语义保持现有白名单；不扫描 Ability 来补倍率。
- 将缺省、显式 resolved、显式 unresolved 三种事实分开。建议具体 Monster 层使用 `phaseCount` 加 `phases: [{ phase, ratioResolution }]`；ratioResolution 为 resolved（含 DecimalString ratio）或 unresolved。缺失 Character 使用整体结构未知状态，不生成默认阶段。
- occurrence 的 `hp` 下增加逐阶段静态计算结果，每项有 `phase` 和 resolved exact HP／unresolved 状态。计算仅依赖现有 resolved final HP 与该阶段倍率；与 mechanics.effectiveTotalHpStatus 解耦。保留现有基础 HP，避免把静态分阶段和完整战斗总 HP 混为一个字段。
- 阶段属性真正缺省时用 1；属性存在但为 null、形状错误、解析失败、非正倍率、参数冲突时保留 unresolved。不能用 `resolvedValue ?? '1'` 合并两类。结构编号冲突／缺失时不伪造完整阶段列表，应保留基础 HP 和内部诊断。
- 部分阶段失败时仍保留已算阶段；不把失败阶段填成基础值，也不据此宣称全部阶段相同。只在全部阶段 resolved 且倍率相等时支持压缩为相同 HP × count 的数据判断。
- 构建期诊断记录 MonsterID、配置路径、阶段和失败原因；浏览器模型不携带来源、可信度、警告文本。界面如何呈现 partial/unavailable 另行处理，本次不设计 Popover。

### 6.2 数据流与主要修改点

数值只在 locale-neutral domain 中计算一次，经 `projectEndgame()` 分别投影到 zh-CN 和 en，随后 `buildOccurrenceView()` 输出相同数值结构，页面与 occurrence shard 共用这个入口。不按翻译后的名称定位敌人，不使用 TextMap 回退，不把原始游戏配置带入浏览器。

| 子系统 | 后续主要修改位置与职责 |
| --- | --- |
| 阶段解析和源输入 | 新增 `scripts/data/enemy-phase-hp.ts`；在 `endgame.ts` 的 Tables/loadTables 引入 MonsterSkillConfig，buildOccurrence 应用阶段结果；`source-requirements.ts` 补入 ENDGAME_TABLE_NAMES |
| 中性模型与投影 | `src/lib/domain/endgame.ts` 增加静态阶段结果；`scripts/data/projection/endgame.ts` 保留新增数值。若复用 enemy-skill-details 的参数表构造，应抽取纯工具，不引入其 Ability 依赖 |
| view 与 shard | `src/lib/domain/endgame-view.ts` 输出逐阶段 exact／rounded 数据及可用性；`scripts/data/endgame-occurrence-shards.ts` 继续调用统一 view；同步 `src/lib/domain/search-index.ts` 的 shard 类型 |
| 缓存与独立验证 | 更新 Endgame schema（当前 25）、manifest schema（当前 55），并因 shard 对外结构变化更新 shard schema（当前 3）及其消费者；同步 validate.ts、build-inputs 与相关 full validation 的结构／语义检查 |

MonsterSkillConfig 已属于全局游戏表源清单，部署输入也已覆盖 Monster Character/Ability 目录；它**尚不属于 ENDGAME_TABLE_NAMES，也未进入 Endgame Tables**。因此不是缺少下载能力，而是 Endgame 局部依赖需要明确接入。不要依赖全局其他构建步骤碰巧已经读取过该表。

### 6.3 必要验证与少量测试

后续实现采用少量表驱动单元测试，不运行游戏运行时、不增加全量输出快照：

1. 缺省、固定、AQAR、已支持的乘法形状；未知表达式、缺 hash／trigger／索引、显式 null 均保持 unresolved。
2. 同 Template 不同 Monster 的覆盖隔离、短覆盖后缀保留、重复／冲突参数拒绝；使用 DawnsEye 的 2 → 2.2 和 Iron Tomb 的 -1 回归例，不擅自赋予 -1 继承语义。
3. 基础 final 乘倍率后取整、已记录的 1 HP 顺序差异、PF 倍率 1 保持现值；PF 非 1 倍率仅用合成夹具验证约定的计算顺序，不称为真实战斗验证。
4. 单一投影／shard 针对性检查：zh-CN 与 en 的阶段编号、状态和 exact HP 相同，来源和诊断不进入 occurrence view；现有 runtime-unclear 不阻断静态阶段值，partial 结果不被补成完整结果。

生产数据验证独立从原始输入复核 PhaseNum 完整性、正倍率、全阶段完成状态及跨语言数值一致性，不能只验证生产解析器自行宣称 resolved。若上游新增不支持表达式，记录诊断并保持局部回退，不把扩大解释器变成自动修复。

## 7. 执行记录与最终判断

实际检查包括 Issue、仓库 AGENTS.md、两份既有文档、锁定提交、现有参数／HP／投影／shard 实现，以及只读源表遍历。临时分析脚本只写入网站仓库，已移除，不作为交付物。运行现有 domain builder 与十进制函数以取得统计和案例，没有运行完整生成、构建或测试套件，没有修改现有测试。

报告按仓库 Markdown 手工维护规则检查了表格列数、相对文档链接、代码围栏和行尾空白；`.prettierignore` 排除了全部 Markdown，Prettier 的默认检查不构成该文件的格式验证。仓库没有 `.crossnote/scripts/check-pseudocode.cjs`，本报告也没有 pseudocode 围栏。最终网站仓库仅新增本报告，TurnBasedGameData 与 StarRailRes 的 Git status 均与调查开始时一致（干净）。

**实施没有全局技术阻碍。** 现有数据和表达式工具能够支撑 352/354 个已确认多阶段 occurrence，所需新增能力是阶段元数据接入、按具体 Monster 解析与缓存、倍率有效性验证、逐阶段 HP 模型及双语言投影／shard 传递。要达到完整覆盖，还需要证实 Iron Tomb Core 中负覆盖值的实际语义，以及补齐 Template 5034010 的 Character Config。两项均应保持局部未知，不阻止已有静态结果展示，也不通过默认倍率掩盖。

### 参考文献

[^issue]: Oereor. HSR-Database 深渊血量信息分阶段展示. GitHub Issue #53, 2026. [Issue #53](https://github.com/Oereor/HSR-Database/issues/53).
[^upstream]: DimbreathBot. TurnBasedGameData，锁定提交 74a7b96fba32f00cf495a5c00b0311bd02207aaf. GitHub, 2026. [固定提交数据树](https://github.com/DimbreathBot/TurnBasedGameData/tree/74a7b96fba32f00cf495a5c00b0311bd02207aaf).

## 8. 补充调查：OverrideSkillParams 中 -1 的语义

补充调查日期：2026-11-03；网站代码基线 `bce5d87ef0b163202ad8f6e46a2642826303f4a4`，分支 `develop`。上游仍为第 1 节的锁定提交 `74a7b96fba32f00cf495a5c00b0311bd02207aaf`。本节追加证据及当前决策，保留前文历史统计，不将反事实计算纳入已验证覆盖率。

**判断：分布与多个消费字段强烈支持“选择性跳过覆盖／继承基础参数”的假设，但目前不足以可靠确认统一的引擎规则。暂不建议修改共享 effectiveSkillParams()；Iron Tomb Core 的 P1/P2 继续保持 unresolved，Issue #53 可以按局部 unresolved 策略推进。**

亚婆离（Template `5034010`）沿用用户已确定的回退策略：保留现有基础 HP 展示，不从缺失的 Character Config 推断阶段数量，不增加特殊处理。本节不调查其阶段或护盾机制。

### 8.1 全量覆盖参数统计

统计遍历完整 `ExcelOutput/MonsterConfig.json`，不限制于 Endgame，按每个具体 Monster 的覆盖记录计数。数组统计对象严格为 `OverrideSkillParams[].PBLPLDJKPEI[]`；每项经无损读取后比较十进制值，覆盖行的 `BOKJJKFCFME` 与 `MonsterSkillConfig.SkillID` 对应。

| 指标 | 数量 |
| --- | ---: |
| MonsterConfig 总记录 | 2,722 |
| OverrideSkillParams 非空的 Monster | 131 |
| 覆盖记录／数组参数位置 | 292 / 645 |
| 含 -1 的 Monster／Template／SkillID | 64 / 48 / 70 |
| 含 -1 的覆盖记录／参数位置 | 86 / 201 |
| 这些记录中混合包含 -1 与非负值／全为 -1 | 86 / 0 |
| -1 位置存在基础参数／基础参数也是 -1／缺少基础参数 | 201 / 0 / 0 |
| 其他负覆盖值／显式零覆盖值 | 0 / 34 |
| MonsterSkillConfig 全部基础 ParamList 中的负值 | 0 |

292 条覆盖记录均可找到对应 SkillID，其中 14 条提供空参数数组。201 个 -1 位置对应的基础值包括 0、概率和倍率小数、整数、120、300 等，没有集中于 HP 参数；86 条记录中的非负值负责其他位置的显式配置。该形态与“只修改部分位置，其余位置用占位符保留”相符。

同一覆盖行另外两个混淆命名标量字段 `NFNILIEFKHJ`、`ANLGHKHLFDE` 分别有 247、290 次取值为 -1。它们不是 PBLPLDJKPEI 数组元素，现有 effectiveSkillParams() 也不读取它们。相邻字段重复使用 -1 是格式线索，但字段含义及合并规则未确认，不能把它们的潜在标记语义直接转移给参数数组。

**已验证事实**是分布、位置和基础值；**合理推断**是 -1 可能表示跳过覆盖。零值已经被显式使用，不能把 0 也归为继承值；本批数组没有其他负数，也不能据此引入“所有负数都继承”的规则。基础 ParamList 没有负值同样不证明所有参数消费字段都禁止负值。

### 8.2 代表案例及实际引用

下列原始路径均相对锁定的 TurnBasedGameData。Monster 和技能数组分别来自 `ExcelOutput/MonsterConfig.json`、`ExcelOutput/MonsterSkillConfig.json`。所有参数索引均从 0 起；Character 的 `DynamicValues.Floats[hash].ReadInfo` 指定 Type=SkillParam、TriggerKey 和 Index，再由实际配置中的表达式引用该 hash。

#### 8.2.1 Iron Tomb Core：阶段倍率与伤害共用同一种覆盖形态

Monster `403501001`，Template `4035010`：

- Character：`Config/ConfigCharacter/Monster/Monster_W4_IronTombCore_00_Config.json`。
- Ability：`Config/ConfigAbility/Monster/Monster_W4_IronTombCore_00_Ability.json`。
- Skill `403501010` / PassiveSkill02：基础 `[0.5, 0.35, 1, 1.25, 1]`，覆盖 `[-1, -1, -1, -1, 1]`。
- hash `-2011261060` → PassiveSkill02[2] → `PhaseList[PhaseNum=1].PhaseMaxHPRatio`；hash `-1187209710` → PassiveSkill02[3] → `PhaseList[PhaseNum=2].PhaseMaxHPRatio`。基础倍率为 1、1.25；现有覆盖结果为 -1、-1。
- 同一 Monster 的 Skill `403501006` / Skill06：基础 `[5, 0.08, 3, 2]`，覆盖 `[-1, 0.06, 5]`。hash `-1122549516` → Skill06[0]，被 `Monster_W4_IronTombCore_00_Skill06_Phase02` 多个 `AttackProperty.DamagePercentage` 引用。现有参数为 `[-1, 0.06, 5, 2]`；继承假设下才会变成 `[5, 0.06, 5, 2]`。

这些引用说明问题不限于 HP，也说明基础数组的尾项与显式覆盖位置需要分开处理。负 HP 倍率不适合静态展示、负伤害候选被当前网站解析器拒绝，均支持继续核查标记语义；网站自身的拒绝规则不能作为游戏引擎合并规则的证明。

#### 8.2.2 FireProwler：同一数组同时影响伤害与层数

Monster `403401003`，Template `4034010`，Skill `403401001` / Skill01：

- Character：`Config/ConfigCharacter/Monster/Monster_W4_FireProwler_00_Config.json`。
- Ability：`Config/ConfigAbility/Monster/Monster_W4_FireProwler_00_Ability.json`。
- 基础 `[4, 2, 0.05, 8, 0.05]`，覆盖 `[-1, -1, 0.05, -1, 0.05]`。
- hash `-1126825319` → Skill01[0]，hash `-335668838` → Skill01[1]；在 `Monster_W4_FireProwler_00_Skill01_Phase02` 与 `Monster_W4_FireProwler_00_Skill01_Assist` 中进入 `AttackProperty.DamagePercentage`。
- hash `-1157393854` → Skill01[3]，在 `Monster_W4_FireProwler_00_PassiveSkill01` 等 Ability 中进入 AddModifier 的 MaxLayer、LayerAddWhenStack。

把 -1 解释为继承会保留基础伤害倍率 4/2 和层数参数 8，配置形态与保留部分基础能力相符。但仅有引用不足以排除“某些位置禁用／交由消费方特殊处理”等替代解释；本节没有执行这些 Ability 或推导其实际战斗效果。

#### 8.2.3 ArgentiTotem：覆盖位置是韧性伤害

Monster `302103005`，Template `3021030`，Skill `302103002` / SkillP01：

- Character：`Config/ConfigCharacter/Monster/Monster_W2_ArgentiTotem_00_Config.json`。
- Ability：`Config/ConfigAbility/Monster/Monster_W2_ArgentiTotem_00_Ability.json`。
- 基础 `[0.6, 30, 0.8, 60]`，覆盖 `[0.25, -1, 0.5]`；现有有效数组为 `[0.25, -1, 0.5, 60]`。
- hash `-213833750` → SkillP01[1] → `Monster_W2_ArgentiTotem_00_SkillP01_Phase01.OnStart[10].FailedTaskList[2].AttackProperty.StanceValue`。

继承假设下该位置为 30，但“该参数被引用”不能证明 30 就是具体 Monster 的游戏实际值。这个案例主要用于确认 -1 横跨多个数值用途，不能只为 HP 分支单独硬编码合并规则。

#### 8.2.4 Iron Tomb Core Part：不能把所有消费场景的负值都视为异常

Monster `403206001`，Template `4032060`：

- Character：`Config/ConfigCharacter/Monster/Monster_W4_IronTombCorePart_00_Config.json`。
- Ability：`Config/ConfigAbility/Monster/Monster_W4_IronTombCorePart_00_Ability.json`。
- Skill `403206001` / Skill01 与 `403206003` / Skill03 均为基础 `[3, 0.25, 0.05]`、覆盖 `[2.8, -1, 0.03]`。
- hash `-1433019565` → Skill01[1] → `Monster_W4_IronTombCorePart_00_Skill01_Phase02.OnStart[8].AddNormalizedValue`。
- hash `234321181` → Skill03[1] → `Monster_W4_IronTombCorePart_00_Skill03_Phase02.OnStart[6].AddNormalizedValue`。
- 两处消费节点均为 `RPG.GameCore.ModifyActionDelay`。

按当前共享工具的字面覆盖，两个位置均为 -1，网站 normalizedActionShift() 将其解释为 advance、ratio=1；若采用继承规则，则读取基础 0.25，变成 delay、ratio=0.25。

**这是当前解析器两种规则下的已验证输出差异，不是游戏提前／延后行为的实测。** 行动位移有可解释的负值消费场景，所以“负 HP 不合理”不足以证明任何参数位置的 -1 都应继承；反过来，此例也没有证明游戏确实按字面消费覆盖数组中的 -1。

### 8.3 能够确认与仍缺少的证据

| 假设 | 当前证据 | 判断 |
| --- | --- | --- |
| -1 跳过该位置覆盖、保留基础值 | 全部 86 条为混合数组；201 个位置均有基础值；多个伤害／HP／层数引用与保留基础值的解释相符 | 强支持的推断，尚未验证合并实现 |
| -1 禁用参数或某部分能力 | 部分消费字段有特殊负值的解释空间，但导出配置未提供统一禁用规则 | 不能确认，也不能仅靠数值分布排除 |
| -1 一律作为普通数值替换 | 当前网站确实如此实现，行动位移也能产生有意义的解析结果；但 HP 和伤害会产生不可用负值 | 网站实现事实，不等于游戏规则事实 |
| 所有负数、0 等都代表继承 | 没有其他负覆盖值；存在 34 个显式零值 | 不支持泛化 |

当前锁定源提供表和 Character／Ability 配置，没有取得处理 OverrideSkillParams 的游戏引擎合并代码或明确格式说明。DynamicValue 仅说明 ReadInfo 读取哪个参数位置，不能直接说明它读到的是原始覆盖值、合并后的基础值，还是消费方处理过的值。公共代码精确关键词检索也没有取得可核对的合并实现；空搜索结果不证明这种实现不存在。

要提升为可靠规则，至少还需获得可对应当前数据格式的覆盖合并实现／明确语义说明，或能区分“基础值继承、字面 -1、禁用”的针对性运行时验证。尤其应覆盖行动位移这种负值可被解释的消费场景，不能只以恢复预期 HP 的结果自证规则正确。

### 8.4 修改共享工具的反事实影响

分析方法：通过 readTable() 读取 MonsterConfig、MonsterTemplateConfig、MonsterSkillConfig、MonsterStatusConfig；保持一份原始内存表，另复制 Monster 表，只把 PBLPLDJKPEI 中数值为 -1 的位置替换为对应基础 ParamList 项。分别调用现有 buildEnemySkillDetails()，按 MonsterID + SkillID 对比 damage、applications、actionShifts。源文件和 effectiveSkillParams() 均未修改。

该实验回答“共享规则改变会影响哪些当前可解析技能详情”，不回答“哪种规则符合游戏”。它不生成完整数据、不过 locale projection，也不模拟战斗。两种规则均输出 2,083 个 Monster 的非空技能详情映射；变化涉及 **4 个 Monster 的 6 条详情**。

| MonsterID | SkillID | 当前字面覆盖输出 | 假设 -1 继承后的输出 |
| --- | --- | --- | --- |
| 403206001 | 403206001 | 主目标伤害 2.8；行动提前 100% | 主目标伤害 2.8；行动延后 25% |
| 403206001 | 403206003 | 主目标伤害 2.8；行动提前 100% | 主目标伤害 2.8；行动延后 25% |
| 403401003 | 403401004 | 全体伤害候选 3 | 保留全体 3，增加主目标 4、相邻 2 |
| 403401003 | 403401001 | 无详情输出 | 增加主目标 4、相邻 2 的伤害详情 |
| 403501001 | 403501006 | 无详情输出 | 增加倍率 5 的伤害候选，目标角色未确定 |
| 405201004 | 405201001 | 无详情输出 | 增加全体倍率 1.8 的伤害详情 |

共 4 条详情的 damage 字段、2 条详情的 actionShifts 字段变化；applications 未变化。3 条从无详情变为有详情，指已有 SkillID 新增可解析详情，**不代表新增了游戏技能**。伤害负值诊断由 4 次变为 0；这反映候选不再被当前解析器拒绝，不能充当游戏语义验证。

最后一例的 Monster `405201004` 引用 Template `4052010`，Character 为 `Config/ConfigCharacter/Monster/Monster_W2_Mecha02_02_Config.json`，Ability 为 `Config/ConfigAbility/Monster/Monster_W2_Mecha02_02_Ability.json`。Skill `405201001` / Skill01 的基础 `[1.8, 0.7]` 被覆盖为 `[-1, 0.9]`；hash `-1126825319` → Skill01[0] → `Monster_W2_Mecha02_02_Skill01_Phase02.OnStart[2].AttackProperty.DamagePercentage`。

共享调用链为 `effectiveSkillParams → buildEnemySkillDetails → parseEnemySkillDetail → damage / applications / actionShifts`，后续还会进入敌人 domain 与双语言投影。因此修改影响越过 Endgame HP；不能把它当成只修 Iron Tomb Core 的局部改动。

64 个含 -1 的 Monster 不等于 64 个都会改变当前详情输出：缺失或未匹配的 Ability、当前不支持的表达式、未提取的参数用途、目标和分支限制都会缩小可见差异。6 条是当前解析能力下的详情差异数量，不是全游戏影响上限，也不证明未改变详情输出的负覆盖位置都没有作用。参数冲突仍沿用原工具的拒绝策略，本实验没有为提高覆盖率放宽表达式或冲突规则。

### 8.5 四项答复与实施决策

1. **-1 是否能够可靠认定为特殊覆盖标记？尚不能。** 大量混合覆盖和多个消费字段强烈支持标记假设，但缺少覆盖合并实现、明确说明或能区分竞争假设的运行时证据。应把“支持继承解释”与“证实引擎继承规则”分开表述。
2. **是否建议修改共享 effectiveSkillParams()？目前不建议。** 保留现有实现，不硬编码 -1 → 原始值，也不推广到所有负值或零值。若未来取得证据，再单独评估共享行为调整，并针对本节 6 条详情差异做定向验证；本节不实现或新增测试。
3. **Iron Tomb Core 的两个 occurrence 是否可以恢复完整静态阶段 HP？目前不能。** 普通／Hard 仍使用具体 Monster `403501001`；现有解析结果为 `[-1, -1, 1]`，P1/P2 保留 unresolved，P3 可保留第 5.4 节的静态值。`[1, 1.25, 1]` 及对应完整 HP 只能作为继承假设成立后的条件结果，不提升为已验证数据，不更新历史 352/354 的完整覆盖统计。
4. **Issue #53 是否可以继续实施？可以。** 采用第 6 节的局部 unresolved 策略：有效阶段继续计算，显式失败不回退成 1，不阻断其他敌人的静态展示。亚婆离继续保留基础 HP，不推断阶段数，不增加专用处理；本节没有开展其战斗机制调查。

### 8.6 补充调查验证记录

全量统计复核使用与锁定文件一致的上游；共享参数、技能详情、语义和伤害解析文件与前轮调查代码基线相比无变化，反事实对比仍适用。分析通过标准输入和内存表执行，没有保留临时脚本，没有运行完整构建、数据生成或测试套件。

文档检查覆盖表格列数、代码围栏、相对链接和行尾空白；同时验证本节之前的原文内容保持不变。最终仅本审计报告修改，两个外部仓库的 Git status 均与补充调查开始时一致（干净）。

## 9. Issue #53 实施决策

用户在后续实施要求中明确授权一个局部产品规则：仅在 PhaseMaxHPRatio 实际读取的 SkillParam 位置，具体 Monster 唯一匹配覆盖值为 -1 且基础值为合法正倍率时，继承基础值。该规则限定在阶段 HP 模块；共享 effectiveSkillParams()、伤害和行动位移解析保持不变。第 8 节关于游戏通用覆盖语义仍未确认的结论不变。

按该规则，Monster 403501001 的静态阶段倍率恢复为 `[1, 1.25, 1]`。普通 AA occurrence 的显示值为 `[12,395,970, 15,494,962, 12,395,970]`，Hard 为 `[49,583,878, 61,979,848, 49,583,878]`；采用精确基础值先乘倍率、显示时取整。锁定数据中已确认的 354 个多阶段 occurrence 均可完整静态计算，历史 352/354 的统计保留为采用本规则之前的审计结果。

亚婆离仍保留基础 HP，不推断阶段数量、不添加专用分支。阶段结果通过中性 domain、两种 locale 的 projection、统一 view 和 occurrence shard 传递；相同阶段 HP 压缩为数值乘阶段数，不同或部分 unresolved 的阶段以 HP 数值按钮打开下方 Popover。静态计算不解释运行时 Ability/Modifier，不宣称还原完整战斗总 HP。

## 10. 4.7 配置补全：亚婆离阶段 HP

更新日期：2026-11-11。TurnBasedGameData 提交 `fe15a954eba1f24bf1bcd4003848710eced44996`[^fallen-config] 补全了 `Config/ConfigCharacter/Monster/Monster_W5_Fallen_00_Config.json`。此前 4.6 锁定提交以及 4.7 的 `fe445594` 缺少该文件，基础 HP 回退是当时数据条件下的结果，不再作为当前数据的预期。

Template `5034010` 继续经真实 `JsonConfig` 外键加载配置。`MaxMonsterPhase=2`；第一阶段未提供 `PhaseMaxHPRatio`，按既有默认规则取 1；第二阶段的 `AQAR` 表达式以 DynamicHash `1300048128` 读取 `PassiveSkill01[5]`。技能 `503401005` 的基础参数为 2；AA Monster `503401002` 对应位置覆盖为 -1，现有阶段 HP 局部继承规则取得基础正倍率 2。共享技能参数、伤害及行动位移解析保持不变。

现有通用管线得到以下静态结果；先对各 encounter 的精确基础 HP 乘倍率，再按既有显示规则取整，未复用其他难度的最终 HP：

| Encounter / StageID | 第一阶段精确 HP | 第二阶段精确 HP | 第一阶段显示 HP | 第二阶段显示 HP |
| --- | ---: | ---: | ---: | ---: |
| MoC 5512 / 30126122 | 5106432.898125 | 10212865.796250 | 5,106,433 | 10,212,866 |
| AA 1004 普通 / 30510021 | 6389558.4346650 | 12779116.8693300 | 6,389,558 | 12,779,117 |
| AA 1004 Hard / 30510022 | 23529802.004100 | 47059604.008200 | 23,529,802 | 47,059,604 |
| AA 1101 初试 / 30511011 | 6284840.49000 | 12569680.98000 | 6,284,840 | 12,569,681 |

四项的倍率均为 `[1, 2]`，View 使用 `hp.display='phases'` 展示两行阶段 HP。无需修改解析器、Domain、View 或 UI，也不增加 Boss 专用分支。删除旧测试中要求所有 `5034010` occurrence 缺少阶段数据的断言；Iron Tomb、真实共享参数和通用缺失配置测试继续保留。正常敌人 ID、资源和映射引用保持不变。

这些结果仅描述配置中的静态阶段 HP，不解释运行时 Ability/Modifier，也不宣称还原完整战斗总 HP。真正缺失 Character Config 或存在不可可靠解析表达式时，仍沿用通用缺失／unresolved 语义。

### 10.1 验证记录

通过现有准备流程将固定 `fe15a954` 物化到网站内部 `.upstream/TurnBasedGameData`，明确设置 `HSR_DATA_ROOT` 后运行正常 `pnpm data:sync`，成功生成中文及英文数据。生成 manifest 的 `sourceCommit` 与新 pin 一致。逐项复核中文投影、英文投影及英文 occurrence shard，四项均完整保留上述精确阶段 HP；AA 普通与 Hard 的同一 MonsterID 使用各自的基础 HP。

- 阶段 HP、共享技能参数与 Endgame View 三个定向测试文件共 96 项通过；关卡上下文独立 HP 的现有定向测试 1 项通过。
- `pnpm data:validate:full` 通过，包括重新读取真实源配置的阶段 HP 语义验证；校验 2,500 项产物、1,132 条路由及 195 个英文 Endgame shards。114 个缺失 TextHash 和 13 个敌方弱点／抗性冲突仍按既有审计记录，不属于该修复新增阻断。
- `pnpm check` 和 `pnpm lint` 通过，Svelte 检查无错误和警告。
- 本地开发页面完成中英文各四项、共八项 Popover 抽查，阶段显示值与生成产物一致；Escape 关闭后焦点恢复到 HP 按钮。截图及精确值复核记录保存在忽略目录 `data/audit/fallen-phase-hp/`，未新增快照测试。

未运行完整 `pnpm ci:develop` 或生产构建；此前记录的 Vite Windows 原生崩溃属于独立限制。两个相邻上游仓库保持只读。

### 参考文献

[^fallen-config]: DimbreathBot. TurnBasedGameData，固定提交 fe15a954eba1f24bf1bcd4003848710eced44996. GitHub, 2026. [亚婆离 Character Config](https://github.com/DimbreathBot/TurnBasedGameData/blob/fe15a954eba1f24bf1bcd4003848710eced44996/Config/ConfigCharacter/Monster/Monster_W5_Fallen_00_Config.json).
