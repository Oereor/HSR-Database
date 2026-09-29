# HSR 战斗模拟可行性审计

调查日期：2026-09-29。范围：本地 `TurnBasedGameData`（`6b2bc17ebf`）、`StarRailRes`（`541e1100`）及 `HSR-Database` 的现有数据管线；只读调查，未实现模拟器。下文的 A–F 是**证据分类**，不是实现完成度：A 明确编码，B 可跨引用推导，C 有依据但需解释，D 需手写规则，E 仅表现层，F 证据不足。置信度另列。所有数值都是所列样本的配置值，不能推广到其他版本或变体。

## 1. Executive Summary

**有限范围、可复现的战斗模拟技术上可行。** 上游明显超过敌人技能文案：`MonsterConfig.SkillList` 指向 `MonsterSkillConfig.SkillID`，再以 `SkillTriggerKey` 对接怪物 `CharacterConfig.SkillList[].Name`；后者的 `EntryAbility` 和 `SkillAbilityList` 指向 `ConfigAbility/Monster` 中的任务、伤害、状态、召唤等配置。`MonsterTemplateConfig` 同时给出 `JsonConfig`、`AIPath` 和基础属性。示例见第 4 节。

可用信息高度分散；技能描述的 `ParamList` **不能单独当作伤害公式**。例如 `100204001` 的倍率要通过角色配置的 `DynamicValues.Floats[-1126825319].ReadInfo` 才能连接到 Ability 的 `DamagePercentage`。怪物 AI 亦有独立决策树。精确结算、事件先后、概率/目标权重、阶段状态机及部分共享技能行为仍需要人工建模、实验或社区研究。上游缺口不妨碍一个明确标记近似规则的 MVP。

现有网站已经分离原始解析、领域模型、语言投影及服务端 loader；模拟器可在新的构建期数据编译器和纯 TypeScript 核心中隔离，不应把 Ability/AI 原文件送进浏览器。**建议下一任务先做不进入产品的窄范围 combat-data schema/编译器可行性原型及人工核对样本**，以这 5 个技能链的引用完整性和公式映射为验收点，然后才决定核心引擎范围。`ConfigAI` 目前不在部署稀疏源清单内，是必须先解决的输入准备问题。

## 2. Current Repository Architecture

- `TurnBasedGameData/ExcelOutput` 是结构化游戏数据及 TextMap 来源；`StarRailRes` 是图像来源，不应作为战斗规则的第二套数据模型。两者在本次调查中保持只读。`HSR-Database/AGENTS.md` 及两库 README 已核查；`TurnBasedGameData` 本地没有 `LICENSE` 文件，`StarRailRes/LICENSE` 存在。本报告不作许可结论。
- `HSR-Database/scripts/data/raw.ts` 用 `lossless-json` 保留 `Hash`/`Value` 的十进制原文；未来动态哈希键和文本哈希解析应维持这一边界。`scripts/data/sync.ts` 先构建 locale-neutral 域，再分别投影中文/英文，写入 `src/lib/generated/views/{locale}` 与 `static/generated/{locale}`。规范见 `docs/architecture/localization-and-data-generation.md`。
- 敌人当前管线 `scripts/data/domain/enemy.ts` 从 `MonsterTemplateConfig`、`MonsterConfig`、`MonsterSkillConfig`、`HardLevelGroup`、`EliteGroup` 形成属性、弱点、抗性、技能身份及描述；`buildSkill` 保留 ID、语义 kind/tag、元素、阶段、额外效果，但**未编译** Ability 的伤害任务、状态回调或 AI。`scripts/data/projection/enemy.ts` 做语言投影；`src/lib/domain/neutral.ts` 和 `src/lib/domain/types.ts` 是已存在的共享类型。
- 角色管线 `scripts/data/domain/character.ts` 已提取逐级 `BPNeed`、`BPAdd`、`SPBase`、`SkillEffect`、韧性展示；`scripts/data/skill-combat.ts` 映射战技点增减、能量和展示韧性，`AvatarConfig.SPNeed` 被用于能量上限。可复用字段语义及来源，但当前展示模型不是完整战斗技能。
- `src/lib/server/generated.ts` 按 locale/详情读取生成 JSON；`src/lib/server/enemies.ts` 形成敌人详情页数据，`src/routes/[category=category]/[id]/+page.server.ts` 经服务端加载。浏览器得到的是页面投影，不直接读上游。现有部分生成的敌人详情包含大量展开资料，不能把这种体量当成战斗包目标。
- `scripts/data/source-requirements.ts` 的部署输入包含约 82 个 Excel 表、TextMap 及 `ConfigCharacter/Monster`、`ConfigAbility/Monster`、`ConfigAbility/BattleEvent` 三个动态目录，**没有 `ConfigAI`**。本机有 AI 文件不意味着部署构建可用。未来应作为独立新输入契约评估，不能仅在本地路径上读取。

## 3. Upstream Combat Data Map

| 来源 | 实际职责与关联 | 取舍 |
|---|---|---|
| `ExcelOutput/MonsterTemplateConfig.json` | `MonsterTemplateID`、`JsonConfig`、`AIPath`、`AISkillSequence`、`AttackBase`/`SpeedBase`/`StanceBase`/`InitialDelayRatio` 等 | 属性与文件路径保留；图像/Prefab 路径排除 |
| `ExcelOutput/MonsterConfig.json` | `MonsterID` → `MonsterTemplateID`，`SkillList`、`OverrideAIPath`、`OverrideAISkillSequence`、`OverrideSkillParams`、`SummonIDList`、属性倍率与抗性 | 按具体敌人变体覆盖模板，不能只按模板编译 |
| `ExcelOutput/MonsterSkillConfig.json` | `SkillID`、`SkillTriggerKey`、`PhaseList`、`ParamList`、`SPHitBase`、`AI_CD`/`AI_ICD`、名称/描述哈希 | 身份、参数与冷却线索；`AttackType=Normal` 不能代替目标范围 |
| `Config/ConfigCharacter/Monster/*_Config.json` | `SkillList[].Name/TargetInfo/EntryAbility`、`SkillAbilityList`、`DynamicValues.Floats[*].ReadInfo` | 桥接展示技能、可执行 Ability 与参数索引；同文件亦含外观字段 |
| `Config/ConfigAbility/Monster/*_Ability.json` | `AbilityList[].OnStart` 等任务、`GlobalModifiers` 的生命周期与回调 | 提取语义任务并保留事件顺序；过滤 Camera/动画/VFX |
| `Config/ConfigAI/*.json` | `DecisionList`、`RootTask`、`ConsiderAxisList`、`Weight`、目标 selector | AI 决策；当前部署输入缺失 |
| `ExcelOutput/MonsterStatusConfig.json` | `ModifierName` → `StatusID`、`StatusType`、状态文案及 `ReadParamList` | 可作部分状态身份映射；不是状态全部行为 |
| `ExcelOutput/AvatarConfig.json` / `AvatarSkillConfig.json` | `SPNeed`、逐级 `SPBase`、`BPNeed`/`BPAdd`、`SkillEffect`、`ShowStanceList` | 角色资源与技能类别的可复用来源；结算仍需 Ability/规则 |

实际链条：

```text
MonsterConfig.MonsterID → MonsterTemplateConfig.MonsterTemplateID
  ├─ MonsterConfig.SkillList[] → MonsterSkillConfig.SkillID/SkillTriggerKey/ParamList
  ├─ MonsterTemplateConfig.JsonConfig → CharacterConfig.SkillList[Name=SkillTriggerKey]
  │    ├─ EntryAbility / SkillAbilityList → ConfigAbility.AbilityList[Name]
  │    └─ DynamicValues.Floats[hash].ReadInfo → SkillTriggerKey + ParamList[index]
  ├─ MonsterTemplateConfig.AIPath / MonsterConfig.OverrideAIPath → ConfigAI.DecisionList
  └─ Ability.GlobalModifiers[ModifierName] ↔ MonsterStatusConfig.ModifierName（部分）
```

这是可编译的引用图，不是“一条技能一行 JSON”。共享 Ability、阶段变体和 `Override*` 要逐个解析。`Config/ConfigAbility/BattleEvent` 另涉及关卡/模式效果；MVP 应固定战斗环境，不把它整体纳入第一批。

## 4. Representative Skill Traces

以下列 5 条技能链，覆盖单体伤害/减防、扩散/支援、群攻、控制与行动延迟、召唤；同一敌人的不同技能分别验证不同语义。`B` 表示跨文件可靠联接，单项任务中的字面字段可为 `A`。文件前缀均为 `TurnBasedGameData/`。

1. **士兵普通攻击兼减防：`1002040` → `100204001`（高置信 B）**。`ExcelOutput/MonsterConfig.json` 的 `1002040.SkillList=[100204001]`；`MonsterTemplateConfig.json` 指向 `Config/ConfigCharacter/Monster/Monster_W1_Soldier01_00_Config.json`。技能记录 `SkillTriggerKey=Skill01`，`ParamList=[3,0.5,2]`。角色配置 `Skill01.EntryAbility=Monster_W1_CWSoldier_01_Skill01_Phase01`，其 `SkillAbilityList` 还列出 `Phase02` 和 Camera。`Config/ConfigAbility/Monster/Monster_W1_Soldier01_00_Ability.json` 的 `Phase02` 以 `DamageByAttackProperty` 打 `AbilityTargetEntity`、元素 Physical，`DamagePercentage.PostfixExpr.DynamicHashes=[-1126825319]`；角色 `DynamicValues.Floats[-1126825319].ReadInfo={Type:SkillParam,TriggerKey:Skill01,Index:0}`，故此样本伤害比例输入为 3。相同任务的 `AddModifier` 目标相同、`Chance.FixedValue=1`、`LifeTime` 哈希 `-436537167` → 参数索引 2，即 2；`MDF_PropertyValue` 哈希 `494842016` → 索引 1，即 0.5。`GlobalModifiers.Monster_W1_Soldier01_00_DefenceRatioDown` 有 `LifeTime=1`、`Stacking=Replace`、`OnStack/StackProperty.Property=DefenceAddedRatio`；`ExcelOutput/MonsterStatusConfig.json` 将该名称标为 `StatusID=210010101`、`StatusType=Debuff`。**限制**：参数是结算输入；减防符号、有效命中与持续时间优先级还要验证，不能单凭 `0.5` 宣称最终减防百分比。
2. **士兵扩散与援护：`1002030` → `100203001` / `100203002` / `100203003`（高置信 B）**。模板指向 `Monster_W1_Soldier04_00_Config.json`、AI `Monster_W1_Soldier04_00_AI.json`。`Skill01.TargetInfo={TargetType:EnemySelect,SubTargetType:TargetAdjoinEntity}`；`Monster_W1_Soldier04_00_Ability.json` 的 `Skill01_Phase02` 有两个 `DamageByAttackProperty`，分别指向 `AbilityTargetEntity` 与 `AbilityTargetAdjoinEntity`。动态哈希 `-1126825319` 和 `-1655355878` 分别映射 `Skill01.ParamList` 索引 0/1，`100203001` 对应 1.3/1；这比文案更明确地表示主/邻目标分配。`Skill02_Phase02` 对友方 `AddModifier`；被动 `SkillP01_Initiate` 出现 `TurnInsertAbility`，并由 `GlobalModifiers` 的 `OnAfterHit` 等回调驱动；`100203003` 的参数由同一角色动态值映射。AI 中 `UseSkill02` 还检查友方与已持有的 `Supported` modifier。**限制**：何时触发援护、插队相对优先级和目标过滤，不能只靠这几个字段完全复现。
3. **Kafka 群攻：`2004010` → `200401003`（高置信 B）**。`MonsterConfig.SkillList` 含此 ID；`MonsterSkillConfig.SkillTriggerKey=Skill03`、`ParamList=[2.5]`。`Monster_W2_Kafka_00_Config.json` 的 `Skill03.TargetInfo.TargetType=AllEnemy`，`EntryAbility=Monster_W2_Kafka_00_Skill03_Phase01`。`Monster_W2_Kafka_00_Ability.json` 的 `Skill03_Phase02` 以 `DamageByAttackProperty.TargetType=AllEnemy`、`DamageType=Thunder`，倍率哈希 `-56289053` 由角色 `DynamicValues` 映射至 `Skill03` 参数索引 0（2.5）。这证明群攻范围和倍率可从结构化数据获得；不证明最终逐目标伤害公式。
4. **Kafka 控制与行动改动：`2004010` → `200401004`（中高置信 B）**。此记录的 `SkillTriggerKey=Skill05`、`ParamList=[2,2,1.5,0.5,1.2]`，角色 `Skill05.TargetInfo=EnemySelect`。`Monster_W2_Kafka_00_Ability.json` 的 `Skill05_Phase02` 对 `AbilityTargetEntity` 调用 `AddModifier(MCommon_MindControl)`，`Chance.DynamicHashes=[-1260024276]` 对应参数索引 4（1.2），`LifeTime` 表达式引用参数索引 0（2）且含固定值 1；同一 Ability 有 `ModifyActionDelay.AddNormalizedValue=-1`。这是状态概率输入和行动改动的明确证据；**不能把 1.2 直接解释为最终 120% 命中率，也不能把 -1 直接换算成实际行动值**。该文件的 `Monster_W2_Kafka_00_Charm` modifier 在 `OnCharmAction` 使用 `Retarget.ByRandom=true`、`MaxNumber=1`，并通过 `AllLightTeam` + 排除持有者的 filter 选目标。这证明随机结果可作为 RNG 决策，但没有在此处看到等概率/权重定义，也不能把控制后的重定向当作 AI 的主动选技。
5. **杰帕德召唤：`1004020` → `100402005`（中置信 B/C）**。`MonsterSkillConfig.SkillTriggerKey=Skill12`；角色配置 `Skill12.EntryAbility=Monster_W1_Gepard_00_Skill12_Phase01`。`Monster_W1_Gepard_00_Ability.json` 的 `Skill12_Phase02` 有多条置于 `PredicateTaskList` 下的 `SummonMonster`，位置有 `First`/`Last`，部分 `DelayRatio.FixedValue=0`；后续向 `CasterSummonedMinions` 添加 `MCommon_Servant`。`MonsterConfig` 的 `1004020.SummonIDList=[1002050,1002030]`，`CustomValues` 又把 `SummonID01/02` 指向这些 ID；Ability 用 `MonsterIDFromCustomValue` 的哈希引用它们。可确认召唤身份和条件分支存在，但哈希名到自定义键的完整解析、占位/位置条件、召唤物初始回合需要专门适配。`Monster_W1_Gepard_00_AI.json` 的 `UseSkill12` 受 `CheckPredicateAxis` 制约，不能视为固定轮转。

补充：敌人变体会改变链条。`200401001` 在 `MonsterConfig.OverrideAIPath` 指向 `Monster_W2_Kafka_00_AI_B.json`，而模板 `2004010.AIPath` 指向 `Monster_W2_Kafka_00_AI.json`；编译器必须以具体 `MonsterID` 解析有效 AI。未选取弹射敌人作可验证完整链：`AvatarSkillConfig` 的角色技能 `100402` 仅显示 `SkillEffect=Bounce` 与参数，不能据此推断弹射次数、能否重复目标或权重；本审计将它们列为 F。

## 5. Combat Mechanic Coverage Matrix

| 机制 | 局部证据 | 类别 | 置信度与边界 |
|---|---|:---:|---|
| 技能 ID/名称/类别/阶段 | `MonsterConfig.SkillList` → `MonsterSkillConfig.SkillID/SkillName/SkillTypeDesc/PhaseList` | A | 高；可见类别有文案哈希，不能代替执行目标规则 |
| 展示技能 → 执行 Ability/内部变体 | `SkillTriggerKey` → 角色 `SkillList.Name/EntryAbility` → `SkillAbilityList` | B | 高；同一 Skill 有 Phase/Camera 和共享 Ability |
| 伤害倍率与元素 | `100204001.ParamList[0]=3` → 哈希 `-1126825319` → `DamagePercentage`；Ability `DamageType=Physical` | B | 高；是输入值，不是最终伤害 |
| 攻击来源与完整伤害公式 | `DamageByAttackProperty/AttackData` 提示攻击属性；未在这些样本找到完整服务端结算定义 | C/D | 中；攻击、倍率及防御/抗性/暴击等结算需人工验证 |
| 命中次数/伤害分配 | `100203001` 两个独立伤害任务，主/邻 1.3/1 | B | 高（本例）；通用多段、打断后的执行需另查 |
| 单体/邻位/全体 | `EnemySelect`、`TargetAdjoinEntity`、`AllEnemy`；实际 `DamageByAttackProperty.TargetType` | A/B | 高；以实际伤害任务确认范围 |
| 弹射次数、重复目标、权重 | `AvatarSkillConfig.SkillEffect=Bounce` 示例 `100402` 只给标签 | F | 低；不可用标签补出随机规则 |
| 随机目标、过滤和选择数 | Kafka modifier `Retarget.ByRandom=true/MaxNumber=1` + `AllLightTeam` filter | A/B | 高（该回调）；未找到概率分布/权重及是否全局通用 |
| 韧性伤害 | `AvatarSkillConfig.ShowStanceList/StanceDamageDisplay`；敌技 `SPHitBase`、Ability `SPHitRatio` | A/C | 中；字段明确，敌方韧性/能量单位及逐击换算需验证 |
| SPD/初始位置 | `MonsterTemplateConfig.SpeedBase/InitialDelayRatio` + `MonsterConfig.SpeedModifyRatio` | A/B | 高（输入），行动值换算规则 D |
| 行动提前/延后、插入 | Kafka `ModifyActionDelay=-1`；士兵 `TurnInsertAbility` | A/C | 高（存在）；值域、插队优先级和额外回合语义待实验 |
| 角色能量与战技点 | `AvatarConfig.SPNeed=110`（1304）；`AvatarSkillConfig` 130401 Lv1 `SPBase=20/BPAdd=1`，130402 Lv1 `SPBase=30/BPNeed=1` | A/B | 高；网站已正规化。受击回能、上限/溢出等仍 D |
| 状态身份/期限/叠层/回调 | `MonsterStatusConfig.ModifierName`；士兵 `GlobalModifiers` 的 `LifeTime/Stacking/OnStack` | A/B | 高（字段），通用回调结算 C |
| 状态命中/抵抗 | Kafka `AddModifier.Chance`，`MonsterConfig.DebuffResist`、模板 `StatusResistanceBase` | A/C | 中；最终概率公式 D |
| 召唤与阶段条件 | 杰帕德 `SummonMonster` + `PredicateTaskList`；Kafka Ability `ByCompareMonsterPhase` | B/C | 中；转换时机/状态机需专门验证 |
| AI 选技/目标 | `ConfigAI.DecisionList`、`UseSkill`、`SelectAISkillTarget`、`Weight`/评分轴 | A/C | 高（存在），评分融合及权重语义中低 |
| Camera/动画/VFX/SFX | `SkillAbilityList.*Camera`、`VCameraConfigChange`、`WaitAnimState`、`TriggerEffect`、音效路径 | E | 高；`WaitAnimState` 可能影响任务先后，抽取顺序后丢弃表现参数 |

## 6. Buff / Debuff / Event System Findings

`ConfigAbility/Monster/*_Ability.json` 通常有 `AbilityList` 和以 modifier 名为键的 `GlobalModifiers`。士兵减防显示 `AddModifier`、动态持续/数值、`GlobalModifiers.LifeTime`、`Stacking=Replace`、`_CallbackList.Event=OnStack`、`StackProperty.Property=DefenceAddedRatio`；`MonsterStatusConfig` 给它可显示的 `StatusID`/`StatusType`。士兵 04 的支援状态在 `OnCreate`/`OnPhase1`/`OnPhase2`/`OnAfterHit` 维护动态计数并追加目标 modifier。杰帕德护盾样本 `MMonster_W1_Gepard_00_BlockDamage` 有 `Count=1`、`Stacking=ReplaceByCaster`、`OnAfterBeingAttacked` 和 `ByIsTriggeredBlockDamage`，夹杂纯特效回调。结构足以支持一个受控 modifier 子集，而非无条件复用全部客户端回调。

重要边界：`AddModifier.Chance`、`LifeTime` 和 `GlobalModifiers.LifeTime` 同时存在时，优先级和回合结束点尚未确认；`OnStack`、`OnAfterHit` 等事件的全局排序亦未确认。编译器应把不支持的语义标成 unresolved，避免静默忽略后声称精准。初期只实现样本实际需要的状态增减、简单位属性变化及有限触发器。

## 7. Enemy AI Findings

AI 并非只能人工写死。`Monster_Common_SequenceThree_AI.json` 的 `UseSequencedSkill` 与模板 `AISkillSequence` 构成一个简单可导出的策略；`Monster_W1_Soldier04_00_AI.json` 有 `UseSkill01`/`UseSkill02`、`CheckSkillUsabilityAxis.InitialCD/CD`、带 modifier 条件的评分轴和友方 `SelectAISkillTarget`；`Monster_W2_Kafka_00_AI.json` 决策含 `Weight.Value=0.5`、动态 `AIFlag`、受控目标的 modifier selector；`Monster_W1_Gepard_00_AI.json` 包含 `Gepard_AICounter`、`CheckPredicateAxis` 和标记目标选择。均为 `TurnBasedGameData/Config/ConfigAI/` 下的实际文件。

结论：固定序列可先编译为政策，较复杂评分树可逐种语法适配。`Weight` 在 AI 里存在，不等于“最终技能使用概率”，因为仍有可用性/谓词/评分器。目标 selector 是 AI **决策**；Kafka 控制回调的 `ByRandom` 是一次 **随机结果**。两者在未来模型中应分开。阶段/具体敌人覆写、技能冷却和可用性失败后的回退是准确 AI 的主要成本。

## 8. Presentation Data to Ignore

| 类别 | 真实样本 | 编译处理 |
|---|---|---|
| Camera | `SkillAbilityList` 中 `*_Camera`、`VCameraConfigChange` | 不进入战斗 schema |
| 动画/时间线 | `ReadyAnimState`、`WaitAnimState`、`PlayTimeline`、`SetTeamFormation` | 不模拟播放；若夹在伤害任务间，仅保留逻辑事件相对顺序 |
| VFX/UI/SFX | `TriggerEffect.EffectPath`、`GlobalModifiers.UIConfig.UIEffectPath`、`HitEffect`、`SpecialHitSoundEvent` | 不打包 |
| 表现几何 | `CharacterHUDOffset`、`VisualRadius`、`PrefabPath` | 不打包；邻位目标的**战斗队列拓扑**另行保留 |
| 战斗语义 | `DamagePercentage`、`AddModifier`、`ModifyActionDelay`、`SummonMonster`、`Retarget.ByRandom` | 转为规范化效果 |

过滤应基于字段/任务的语义白名单；不能简单删除整个含 Camera 的 Ability，因为同一个 `OnStart` 列表还包含伤害和状态任务。

## 9. Proposed Normalized Combat Schema

概念草案，不是生产类型；记录来源和不支持项，让编译器可审计：

```ts
type SourceRef = { monsterId?: string; skillId?: string; file: string; ability?: string };
type TargetRule =
  | { kind: 'selected-enemy' | 'selected-ally' | 'self' | 'all-enemies' | 'adjacent' }
  | { kind: 'random'; from: TargetRule; count: number; excludeSelf?: boolean;
      replacement?: 'yes' | 'no' | 'unknown'; weights?: number[] };
type Effect =
  | { kind: 'damage'; target: TargetRule; element: string; multiplier?: number;
      scaling: 'attack' | 'unknown'; toughness?: number }
  | { kind: 'status'; target: TargetRule; statusId: string; chanceInput?: number;
      durationInput?: number }
  | { kind: 'action-order'; target: TargetRule; normalizedDelta?: number;
      insertSkillId?: string }
  | { kind: 'resource'; target: TargetRule; energyDelta?: number; skillPointDelta?: number }
  | { kind: 'summon'; monsterIds: string[]; conditionId?: string };
type CombatSkill = { id: string; triggerKey: string; target: TargetRule;
  effects: Effect[]; source: SourceRef[]; unresolved: string[] };
type Combatant = { instanceId: string; sourceId: string; stats: Record<string, number>;
  hp: number; toughness: number; energy?: number; actionValue: number;
  statuses: StatusInstance[]; phase?: string };
type BattleState = { combatants: Combatant[]; skillPoints: number;
  turn: number; rngState: unknown; pendingEvents: InternalEvent[] };
```

`EnemyPolicy` 应以可用性/条件/评分/目标选择输入 `BattleState` 后产生技能意图；玩家动作由外部策略给出。`StatusInstance` 和 `InternalEvent` 是核心内部结构，具体字段要在原型中按已验证回调确定。编译器对 `replacement`/`weights` 等无证据字段应填 unknown/省略，绝不能暗中设成均匀分布。

## 10. Proposed Battle Log Contract

核心内部事件需要记录实际伤害、破韧、资源变化、状态增减、触发、召唤和 RNG 抽样，才能正确续算；**UI 只接收完成后的投影**。一个动作可有多次命中，但初期按动作聚合，必要时 `substep` 保留顺序：

```ts
type BattleLogEntry = {
  sequence: number; actionValue?: number;
  actorInstanceId: string; skillId?: string;
  actionKind: 'basic' | 'skill' | 'ultimate' | 'enemy' | 'follow-up' | 'other';
  skillType?: string; targetInstanceIds: string[];
  energy?: { instanceId: string; before: number; after: number }[];
  skillPoints?: { before: number; after: number };
  hp?: { instanceId: string; before: number; after: number }[];
  toughness?: { instanceId: string; before: number; after: number }[];
};
type BattleLog = { schemaVersion: 1; seed: string; entries: BattleLogEntry[];
  result: { outcome: 'win' | 'loss' | 'timeout'; actions: number } };
```

稳定实例 ID 区分同种召唤物；技能 ID 区分展示名相同的变体。聚合日志用于约略复盘，不保证逐帧/逐状态回放；不向首版 UI 暴露完整 buff/debuff 事件。内部事件 → 日志投影的分层值得保留，因为它同时支持调试、统计和轻量传输。

## 11. Proposed Architecture

```text
TurnBasedGameData（构建输入；固定版本）
  → combat-data（逐敌人解析引用、参数哈希、AI/状态；拒绝未知语义）
  → 小型、版本化、可分片的 normalized combat records
  → combat-core（纯 TS 状态迁移、显式 RNG、事件流；CLI/测试可运行）
  → combat-strategy（将来的固定轮转、AI、采样、搜索）
  → web integration（收集配置，执行后显示结果和简化日志）
```

`combat-data` 应与现有 `scripts/data` 共享可靠原始读取、ID/TextMap 规则，但有独立输出契约和校验；可沿用 `src/lib/domain` 的纯类型风格，避免让核心 import Svelte、路由、DOM 或服务端文件系统。不能把当前敌人展示对象直接当作核心输入。样本上游体量已说明预编译必要性：`ExcelOutput/MonsterConfig.json` 约 4.1 MiB、`MonsterSkillConfig.json` 约 2.5 MiB；整个 `ConfigAbility/Monster` 约 51 MiB、`ConfigAI` 约 12 MiB，Kafka 单个 Ability 约 128 KiB。数字来自本地 `du`，并非未来 bundle 预测。只输出选定敌人/角色所需的目标规则、效果、条件和数值，剔除表现字段；按遭遇或实体分片及惰性加载可评估，但先实测编译结果大小。

运行位置暂不锁定：核心可在 CLI、浏览器 worker 或服务端运行，具体选择取决于计算耗时、数据体积和部署成本。网站不需实时流式状态。输入与 RNG 种子固定时，核心应在同版本规则下确定性运行。测试优先用 5 个引用链的结构校验和手工战斗样本，不以全游戏覆盖作为第一门槛。

## 12. Monte Carlo / Search Readiness

把玩家动作/敌人政策与随机样本分开，再让所有抽样通过显式 RNG，就可以要求“初态 + 政策/动作序列 + 种子 + 规则版本 → 同结果”。Kafka `Retarget.ByRandom` 是明确的 chance node；但样本没有给出选取权重，不能预设均匀。AI `Weight` 是决策树中的值，与该随机节点不同。固定轮转 × 多种子属于**模拟评估**；寻找更佳动作属于**策略优化**。状态至少包含双方实例、HP/韧性/能量、战技点、速度/行动值、阶段、状态叠层与期限、召唤物、AI 计数及 RNG 状态。可枚举行动需要技能可用性和目标集合。状态爆炸来自多目标/弹射、条件回调、额外行动、召唤、阶段及技能等级；MCTS、剪枝和宏动作均不属于本任务。

## 13. Missing Information / Manual Rules

1. 最终伤害公式与乘区、暴击/抗性/减伤/防御、等级差、逐击舍入和护盾优先级；Ability 提供输入和部分任务，未证明完整结算。
2. 韧性与 `SPHitBase`/`SPHitRatio`/`ShowStanceList` 的精确单位和多段分配；击破及弱点击破附带行动/状态规则。
3. 基础行动值、初始延迟、速度变化、`ModifyActionDelay` 的归一化值换算、插入行动与额外回合优先级。
4. 能量受击收益、击杀收益、溢出/返还能量、特殊资源，以及部分被动带来的战技点变化；角色表只覆盖基础字段。
5. 状态效果命中/抵抗公式、`Chance` 超过 1 的处理、`LifeTime` 与 modifier 自身期限的优先级、事件回调顺序及多重叠层冲突。
6. AI 评分器 `DefaultDSE`、`Weight` 融合规则、同分裁决、失败回退和随机目标概率；部分复杂敌人需手写有限政策。
7. 弹射次数、是否放回、可选目标过滤和权重；仅有 `SkillEffect=Bounce` 标签不足以推断。
8. 特定阶段/关卡效果、召唤物布阵和自定义值哈希解析、共享 Ability 引用闭包；需按选定遭遇逐一验证。

这些是待验证项，并非认定上游全都缺失。未来可用公开战斗录像/社区实测做规则核对，并在记录中标注假设与版本。

## 14. Risk Assessment

| 风险 | 影响 | 初期控制方式 |
|---|---|---|
| 引用链和解析器复杂度 | 高：Excel、角色、Ability、modifier、AI、共享配置多跳 | 先用少量 ID 的闭包编译；显式 unresolved 报告 |
| 上游版本/字段不稳定 | 高：动态哈希、混淆字段、覆盖路径和变体 | 锁定数据版本；记录来源 ID/路径；版本升级做差异审计 |
| 正确性误判 | 高：看见倍率不等于完整公式；顺序/概率影响结果 | 对照人工样本，区分 A–F；结果标“近似”范围 |
| AI 与状态空间 | 高：回调、召唤、阶段、随机分支迅速扩张 | MVP 固定遭遇与有限政策，先不做搜索 |
| 浏览器体积/性能 | 中高：原始 Ability/AI 大且夹杂表现数据 | 构建期过滤、按遭遇分片、核心运行环境保持可替换 |
| 现有网站耦合 | 中：若复用展示域作核心输入，会污染页面数据 | 新战斗 schema/编译结果独立，UI 只消费结果与日志 |
| 部署输入不完整 | 高：当前稀疏清单没有 `ConfigAI` | 原型明确检查可用路径；正式构建前扩充并验证输入契约 |

## 15. Recommended MVP Boundary

选**一个固定遭遇**、少量已核对角色技能与一类简单敌人。第一版应能计算基础攻击/战技/终结技、单体及一个扩散/群攻目标规则、有限伤害与韧性、角色能量/战技点、速度/行动值、仅为该遭遇必要的状态、种子 RNG 和战后日志。若状态规则尚无验证样本，宁可选无需复杂状态的敌人并明确范围。`1002040` 适合验证数据链，但其减防若进入战斗必须实现或明确屏蔽该技能附加效果；不能悄悄忽略。AI 先采用由 `AISkillSequence` 可证实的简单顺序或人工固定策略，标出与游戏 AI 的差距。

首个原型不应含全敌人覆盖、复杂阶段首领、完整 modifier/AI 解释器、弹射概率猜测、实时 UI、全事件调试界面、Monte Carlo/MCTS 或官方客户端表现数据。

## 16. Final Recommendation / Next Investigation

**继续推进，但先做数据合同原型。** 下一工程任务建议：在独立目录构建一个只读、构建期的 5 条代表链解析器，输出小型 schema 样本和逐字段 provenance/unresolved 清单；把 `ConfigAI` 纳入原型输入检查；人工核对 2–3 组实际伤害、状态期限及目标选择。验收条件是：`SkillID` 到伤害/状态/AI 的链可复现，未知语义会显式失败或标记，产物不含 Camera/VFX，体积可测且不流入现有页面 bundle。通过后再设计纯模拟核心和受限 MVP。
