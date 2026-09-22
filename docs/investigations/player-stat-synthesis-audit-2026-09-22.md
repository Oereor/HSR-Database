# Player Stat Synthesis Audit

调查日期：2026-09-22  
调查范围：同 UID Enka/MiHoMo fixture、当前版本 TurnBasedGameData、HSR-Database 现有静态数据与 Player Info 管线。  
调查性质：只读配置调查、一次性 prototype 与 golden comparison；未修改生产 provider、API、UI、domain model 或部署配置。

## 1. Executive Summary

### 1.1 结论

**对于当前 Player Info 显示的战斗外最终属性，Enka raw + TurnBasedGameData 足以替代 MiHoMo final-stat block。**

本轮用 `168902602-Enka.json` 重建了全部 6 个角色，再与 `168902602-MiHoMo.json` 的 `statistics` 对照：

- 测试 6 个角色、56 个最终属性；
- 49 个在绝对误差 `<= 1e-12` 内一致；
- 2 个仅有约 `2e-9` 的配置精度差，显示值相同；
- 5 个 mismatch 全部位于角色 1409，且精确对应上一轮已确认在两次抓取之间更换的同 TID 手部遗器；
- **0 个 unexplained mismatch**；
- 排除时点不同的角色 1409 后，44/44 个属性均为 exact 或 rounding-only；
- 若以 `1e-8` 作为内部数值容差，当前同状态可比较项为 51/51 通过。

经验证的核心公式是：

```text
HP  = HP_base  × (1 + ΣHPAddedRatio)      + ΣHPDelta
ATK = ATK_base × (1 + ΣAttackAddedRatio)  + ΣAttackDelta
DEF = DEF_base × (1 + ΣDefenceAddedRatio) + ΣDefenceDelta
SPD = SPD_base × (1 + ΣSpeedAddedRatio)    + ΣSpeedDelta
```

其中：

```text
HP/ATK/DEF base = 角色等级基础值 + 光锥等级基础值 + 同类 Base* property
SPD base        = 角色基础速度 + ΣBaseSpeed
```

当前数据里只有光锥 `23036`、`23044` 使用额外 `BaseSpeed`；当前 golden fixture 没有装备它们。因此“光锥 `BaseSpeed` 也先进入速度百分比的乘数基数”是由 property bucket、结构化配置及既有实现交叉支持的 **Strongly inferred**，而不是本 fixture 直接 golden-confirmed。其余速度顺序已由多个同时拥有 ratio 与 flat 的角色确认。

CRIT、击破、效果命中、效果抵抗、能量恢复、治疗、元素增伤等不是 `base × ratio + flat`，而是默认/角色固有值与同类 direct property 的加法。

### 1.2 迁移判断

- **不再存在必须从 MiHoMo 获取的当前最终 stat 信息。** MiHoMo 可以降级为迁移期 golden oracle，而不是 runtime dependency。
- 正式移除 MiHoMo 前仍需实现本报告定义的 provider-neutral aggregator、最小 generated lookups 和 fixture tests。
- 不需要解析描述、不需要角色 ID 特例、不需要执行 Ability/Battle Script，也不需要大型规则引擎。
- `AllDamageTypeAddedRatio`、`HealTakenRatio` 和光锥 `BaseSpeed` 尚缺专门 golden fixture；它们不阻止当前 Player Info 字段迁移，但应在宣布“所有未来 property 全覆盖”前补测。

## 2. Scope and Methodology

输入：

- `Enka-API-Integration-01/168902602-Enka.json`
- `Enka-API-Integration-01/168902602-MiHoMo.json`
- `Enka-API-Integration-01/171357231-Enka.json`（补充结构观察，无同 UID MiHoMo golden）
- `TurnBasedGameData/ExcelOutput` 中角色、光锥、遗器、套装、行迹和星魂配置
- 当前 HSR-Database 的 stat progression、domain projection、MiHoMo parser 与 Player Info formatter

方法：

1. 完整扫描当前版本的结构化 property 来源，不用描述文本判断数值语义；
2. 建立显式 `PropertySemanticRegistry`，不按字符串前后缀猜 bucket；
3. 从 Enka raw 的角色、光锥、遗器、套装与已激活行迹产生 `PropertyContribution[]`；
4. 聚合并 finalize；
5. 与 MiHoMo `attributes/additions/properties/statistics` 逐字段比较；
6. 主动搜索 PointType、星魂、空 PropertyList、少见 AbilityProperty 等反例。

可复现实验脚本：`scripts/investigations/player-stat-synthesis-audit.mjs`。脚本不进入生产运行时，也不写 generated data。

数值分类：

- `exact`：`abs(delta) <= 1e-12`；
- `rounding-only`：`1e-12 < abs(delta) <= 1e-8`；
- `explained mismatch`：超过容差，但有独立 fixture 时点证据；
- `unexplained mismatch`：超过容差且无法解释；
- `not comparable`：任一侧无同语义字段。

## 3. Existing Fixture / Golden Reference

当前 6 个角色为 1310 流萤、1413 长夜月、1409 风堇、1415 昔涟、1407 遐蝶、8006 星。

MiHoMo 只被用作 golden reference：

```text
Enka raw + TurnBasedGameData -> local synthesis -> compare MiHoMo parsed final stats
```

两份 fixture 不是同一抓取时点。上一轮已确认角色 1409 的手部遗器 TID 同为 `61252`，但主副词条组合不同；TID 是静态遗器类型而非玩家实例 ID。本报告保留并解释该差异，不用它否定公式。

## 4. MiHoMo Stats Block Semantics

对全部 6 个角色逐字段验证：

```text
statistics = attributes + additions
```

最大残差仅为普通 IEEE-754 误差。

| Block | 实际语义 | 证据 |
| --- | --- | --- |
| `attributes` | 角色+光锥的 HP/ATK/DEF base、角色 base SPD、角色固有 CR/CD | 与本地 base bucket 一致 |
| `properties` | 装备、套装、行迹、光锥 AbilityProperty 聚合后的原始 property totals；ratio 仍是 ratio，flat 仍是 flat | 逐 PropertyType 与本地 contribution totals 对齐 |
| `additions` | 最终值相对 `attributes` 的增量；HP/ATK/DEF/SPD 已把 ratio 转为数值增量 | `statistics - attributes` 精确等于 additions |
| `statistics` | 当前 Player Info 使用的最终战斗外属性 | 本地 synthesis 的 golden target |

因此 `statistics` 是 final；`properties` 不是 final，不能直接按 field 相加；`additions` 是派生结果，不是更适合保存的 canonical input。

## 5. Out-of-Combat Panel Definition

本报告的战斗外面板只接收结构化静态 property channel：

- avatar promotion/base stat；
- equipment promotion/base stat；
- `EquipmentSkillConfig.AbilityProperty`；
- relic main/sub affix `Property`；
- 已满足件数的 `RelicSetSkillConfig.PropertyList`；
- 玩家已激活小行迹的 `AvatarSkillTreeConfig.StatusAddList`。

不接收：

- 技能、光锥、套装、星魂的描述文本；
- 进入战斗、回合、攻击目标、生命阈值、施放技能后才成立的 Ability；
- 大行迹 Ability；
- 星魂 RankAbility；
- 战斗脚本计算出的临时 buff。

“存在结构化静态 property”与“当前 UI 一定显示一个独立行”仍需区分。例如 `HealTakenRatio` 是明确静态 property，但当前 MiHoMo/HSR-Database 可见字段没有对应展示行。

## 6. Structured Property Sources

| Source | Config | Field | OOC included? | Evidence / rule |
| --- | --- | --- | --- | --- |
| Avatar base | `AvatarPromotionConfig` | `HPBase/HPAdd`, `AttackBase/AttackAdd`, `DefenceBase/DefenceAdd`, `SpeedBase`, `CriticalChance`, `CriticalDamage` | Yes | 6/6 golden |
| Light-cone base | `EquipmentPromotionConfig` | `Base*`, `Base*Add` | Yes | 18/18 previous audit; final base golden |
| Light-cone passive | `EquipmentSkillConfig` | `AbilityProperty` | Yes, static property | 6/6 current builds; 116 SkillIDs full scan |
| Relic main | `RelicMainAffixConfig` | `Property`, `BaseValue`, `LevelAdd` | Yes | 36/36 previous audit + final golden |
| Relic sub | `RelicSubAffixConfig` | `Property`, `BaseValue`, `StepValue` | Yes | 144/144 previous audit + final golden |
| Relic set | `RelicSetSkillConfig` | `PropertyList` | Yes when `equippedCount >= RequireNum` | all current sets + 92-row scan |
| Minor trace | `AvatarSkillTreeConfig` | `StatusAddList` | Yes when owned level > 0 | 1030/1030 PointType 1 rows |
| Major trace | same | Ability/ExtraEffect/ParamList | No absent explicit property | 309 PointType 3 rows; no StatusAddList |
| Special trace | same | PointType 2/4/5 fields | No absent explicit property | full scan; no StatusAddList |
| Eidolon | `AvatarRankConfig` | `RankAbility`, `SkillAddLevelList`, `Param` | No panel contribution found | 618-row recursive field scan |

## 7. PropertyType Inventory and Semantic Registry

扫描上述来源得到 29 个与玩家静态属性相关的 PropertyType。Registry 必须逐项显式登记：

```ts
type ContributionKind = 'base' | 'ratio' | 'flat' | 'direct';

interface PropertySemantic {
  propertyType: string;
  targetStat: string;
  contributionKind: ContributionKind;
  visibleField?: string;
}
```

不能用 `startsWith('Base')`、`endsWith('Delta')` 等运行时 heuristic。`BaseSpeed` 是速度基数，而 `CriticalChanceBase` 是直接相加；名称相似但数学语义不同。

完整矩阵见 Appendix A。

## 8. Avatar Base Stat Reconstruction

选择 `(avatarId, promotion)` 对应的 `AvatarPromotionConfig` row：

```text
Avatar HP  = HPBase      + HPAdd      × (level - 1)
Avatar ATK = AttackBase  + AttackAdd  × (level - 1)
Avatar DEF = DefenceBase + DefenceAdd × (level - 1)
Avatar SPD = SpeedBase
Avatar CR  = CriticalChance
Avatar CD  = CriticalDamage
```

突破边界按玩家给出的 promotion 精确选择 row；这与现有 `normalizeStatProgression()` 的“选择最高已达到阶段”产品规则一致。

特殊角色：

- `enhancedId=1` 的 1310：`AvatarConfigEnhanced` 只切换技能/SP 等 profile，没有第二套 promotion stat；用 1310 的 promotion row 重建精确匹配。
- 多命途 8006：以具体 avatarId `8006` 选择其 promotion row，不回退到 base avatar 8001；精确匹配。
- 1407 的 skin 只影响资产，不改变 stat profile；精确匹配。
- 8006 的 E3/E5 `SkillAddLevelList` 只改变技能有效等级，不改变面板 stat。

## 9. Light Cone Base Stats

选择 `(lightConeId, promotion)`：

```text
LC HP  = BaseHP      + BaseHPAdd      × (level - 1)
LC ATK = BaseAttack  + BaseAttackAdd  × (level - 1)
LC DEF = BaseDefence + BaseDefenceAdd × (level - 1)
```

然后：

```text
HP_base  = Avatar HP  + LC HP  + Σother BaseHP
ATK_base = Avatar ATK + LC ATK + Σother BaseAttack
DEF_base = Avatar DEF + LC DEF + Σother BaseDefence
```

当前静态 property 来源没有额外的 `BaseHP/BaseAttack/BaseDefence` AbilityProperty；这三种额外 sum 仍应由统一 registry 表达，避免以后 schema 扩展时改公式。

## 10. Light Cone AbilityProperty

全表统计：

- `EquipmentSkillConfig` 845 rows、169 个 SkillID；
- 116 个 SkillID（580 rows）有非空 `AbilityProperty`；
- 每个有 property 的 SkillID 都有 rank 1–5 五条显式 row；
- 当前出现 15 种 AbilityProperty；
- contribution 可由 `lightConeId -> EquipmentConfig.SkillID + rank` 唯一得到；
- 值直接读取选中 rank row 的 `AbilityProperty[].Value`；
- `ParamList` 不参与 property 数值求值；它服务描述/Ability 参数。不存在需要用描述或 `ParamList` 反推 property 的情况。

| PropertyType | Light-cone SkillIDs |
| --- | --- |
| `AllDamageTypeAddedRatio` | 21012, 21027, 21061, 23006 |
| `AttackAddedRatio` | 21003, 21019, 21020, 21026, 21033, 21037, 21040, 21046, 21051, 22002, 22004, 22005, 22008, 23002, 23008, 23048, 23051, 23062, 24004, 24006 |
| `BaseSpeed` | 23036, 23044 |
| `BreakDamageAddedRatioBase` | 21004, 21022, 21035, 21042, 21045, 21047, 23019, 23025, 23027, 23032, 23033, 23035, 23050, 24003 |
| `CriticalChanceBase` | 21031, 21044, 21052, 21058, 21060, 21065, 23001, 23009, 23015, 23016, 23028, 23031, 23037, 23046, 23056, 23061, 23064, 24001 |
| `CriticalDamageBase` | 21050, 21057, 21062, 22006, 22007, 23010, 23012, 23014, 23018, 23020, 23021, 23024, 23030, 23038, 23045, 23053, 23058 |
| `DefenceAddedRatio` | 20003, 21002, 21016, 21030, 21043, 23005, 23023 |
| `ElationDamageAddedRatioBase` | 21064, 21066 |
| `HPAddedRatio` | 21028, 21054, 22001, 22003, 23009, 23011, 23013, 23039, 23040, 23049, 23059, 23063 |
| `HealRatioBase` | 21007, 21055, 23013 |
| `HealTakenRatio` | 23039 |
| `SPRatioBase` | 21000, 23003, 23011, 23017, 23062 |
| `SpeedAddedRatio` | 21048, 23042, 23043, 23052, 23054, 23057, 24005 |
| `StatusProbabilityBase` | 21008, 22000, 23005, 23007, 23022, 23029, 23047 |
| `StatusResistanceBase` | 21014, 21039, 24002 |

精确语义：`AbilityProperty` 是光锥技能配置中随叠影 rank 固化的静态 property projection。它只包含无条件进入静态 character property set 的部分；同一光锥其余条件型战斗效果仍留在 Ability/ParamList，不应执行。

限定：15 种里 `AllDamageTypeAddedRatio` 与 `HealTakenRatio` 未被当前 6 个 build 覆盖。前者应保留为独立 `allDamageBoost` direct bucket，不能无证据地复制到七个元素；后者应保留为 `incomingHealing` direct bucket，但当前 Player Info 是否展示需另行产品/fixture 验证。

## 11. Relic Main / Sub Affixes

直接复用上一轮已验证公式：

```text
main = BaseValue + LevelAdd × relicLevel
sub  = BaseValue × cnt + StepValue × effectiveStep
```

`effectiveStep = raw.step ?? 0` 在当前 fixture 21 个省略 step 样本全部拟合；canonical 仍建议保留 optional/provenance。

Property 映射统一交给 registry：例如 `HPAddedRatio` 无论来自遗器、套装、光锥或行迹都进入同一个 HP ratio bucket。

## 12. Relic Set PropertyList

全表 92 rows：

- 57 rows 有非空 `PropertyList`；
- 35 rows 的 `PropertyList` 为空；
- 这 35 rows 全部有 `AbilityName`；
- 非空 PropertyList 覆盖 19 种 property；
- 当前 6 build 中所有套装 contribution 均与 MiHoMo properties/final stats 对齐。

结论：

> 在当前版本，`PropertyList` 可可靠作为“满足件数后进入战斗外静态属性”的来源；空 `PropertyList` 的 Ability 不应为了面板而执行。

这仍是当前版本全表事实，不是永远不变的上游 schema 保证。每次数据更新应做 schema validation。

具有 Ability 但无 PropertyList 的效果包括条件增伤、行动提前、战斗内叠层等。相反，套装 117 的 4 件无条件 CR、套装 124 的 4 件静态 `-8% SpeedAddedRatio` 被明确放进 PropertyList，说明该字段能把同一 Ability 中的静态部分与条件部分分开。

完整 57-row 清单见 Appendix D。

## 13. Minor Trace StatusAddList

`AvatarSkillTreeConfig` 全表 5318 rows：

| PointType | Rows | Rows with StatusAddList |
| ---: | ---: | ---: |
| 1 | 1030 | 1030 |
| 2 | 3811 | 0 |
| 3 | 309 | 0 |
| 4 | 166 | 0 |
| 5 | 2 | 0 |

此外：

- 1030 个 PointType 1 row 全部是 `Level=1`、`MaxLevel=1`；
- 每个都恰有一个 StatusAddList item；
- 没有 PointType 1 缺 StatusAddList；
- 没有非 PointType 1 带 StatusAddList；
- Enka `skillTreeList` 的 `pointId + level` 足以判断激活：存在且 level > 0 即应用；
- 当前小行迹 value 不随 level 缩放，因为属性节点只有 level 1。

因此目标链路已全表验证：

```text
owned pointId/level > 0
  -> AvatarSkillTreeConfig[pointId]
  -> PointType == 1
  -> StatusAddList[0]
  -> PropertyContribution
```

## 14. Major Trace Behavior

309 个 PointType 3 rows 均没有 `StatusAddList`；其他非属性节点也没有。它们通过 Ability、ExtraEffect、ParamList 等表达战斗效果。

**当前版本无“大行迹通过同类结构化 panel property channel 进入战斗外面板”的反例。**

这支持明确实现规则：不要解析大行迹描述，不要执行 Ability；只消费显式 StatusAddList。若未来上游给非 PointType 1 节点增加 StatusAddList，应由 schema audit 告警，而不是被代码静默忽略。

## 15. Eidolon Behavior

`AvatarRankConfig` 618 rows 的字段全集只包含：

```text
RankID, Rank, Trigger, Name, Desc, ExtraEffectIDList,
IconPath, SkillAddLevelList, RankAbility, UnlockCost, Param
```

递归搜索没有 `PropertyType`、`PropertyList`、`StatusAddList` 或 `AbilityProperty`：

- 206 rows 有 `SkillAddLevelList`；
- 71 rows 有 `RankAbility`；
- 0 rows 有 panel property channel。

结论：星魂不向本轮战斗外面板注入 property；只需继续处理技能等级等 progression。描述里的 CR/ATK 等不得解析进面板。

## 16. HP / ATK / DEF Formulas

对 stat `S ∈ {HP, ATK, DEF}`：

```text
S_avatar = Promotion.SBase + Promotion.SAdd × (level - 1)
S_lc     = EquipmentPromotion.BaseS + EquipmentPromotion.BaseSAdd × (lcLevel - 1)
S_base   = S_avatar + S_lc + ΣBaseS
S_final  = S_base × (1 + ΣSAddedRatio) + ΣSDelta
```

证据：当前每个角色同时覆盖 base、ratio、flat；HP/ATK/DEF 共 18 个 final 值中，角色 1409 的 HP/DEF 两项为已解释遗器时点差，其余 16 项 exact/rounding-only。ATK 1409 也精确匹配，因为被替换遗器没有改变 ATK contribution。

Confidence：**Confirmed for current sources and fixture**。

## 17. Speed Formula

```text
SPD_base  = AvatarPromotion.SpeedBase + ΣBaseSpeed
SPD_final = SPD_base × (1 + ΣSpeedAddedRatio) + ΣSpeedDelta
```

运算顺序由以下样本直接区分：

- 1310：`104 × 1.06 + 54.232 = 164.472`；
- 1415：`101 × 1.12 + 68.832 = 181.952`；
- 1407：`95 × 0.92 + 4.9 = 92.3`，覆盖负 ratio；
- 1409：公式差异精确对应更换遗器的 flat SPD 差。

因此 flat 不进入 percentage multiplier，且不得提前 round。

光锥 `23036/23044` 的 `BaseSpeed` 应加入 `SPD_base` 再承受 ratio；当前 fixture 未装备这两件光锥，故该子规则 Confidence 为 **Strongly inferred**。应补一份同时拥有 BaseSpeed LC、SpeedAddedRatio 与 SpeedDelta 的 golden fixture。

显示精度：内部保留 double；当前 MiHoMo `164.472` 等值证明真实值有小数，而 UI `display` 截断/格式化为整数。synthesis 不应为匹配 UI 提前 round。

## 18. Direct Percentage Stats

| Stat | Finalize rule | Default / innate |
| --- | --- | --- |
| CRIT Rate | `Avatar CriticalChance + ΣCriticalChanceBase` | 当前角色均 0.05 |
| CRIT DMG | `Avatar CriticalDamage + ΣCriticalDamageBase` | 当前角色均 0.50 |
| Break Effect | `ΣBreakDamageAddedRatioBase` | 0 |
| Effect Hit Rate | `ΣStatusProbabilityBase` | 0 |
| Effect RES | `ΣStatusResistanceBase` | 0 |
| Elation | `ΣElationDamageAddedRatioBase` | 0 |

这些都是 direct additive，不能套 HP/ATK/DEF 公式。

## 19. Elemental DMG / Healing / ERR

```text
Outgoing Healing = ΣHealRatioBase
Incoming Healing = ΣHealTakenRatio
Energy Regen bonus = ΣSPRatioBase
Elemental DMG[element] = Σ<Element>AddedRatio
All DMG = ΣAllDamageTypeAddedRatio
```

注意：

- MiHoMo `statistics.sp_rate` 表示 bonus，例如 `0.194394015`，而游戏面板总倍率显示为 `1 + bonus = 119.4394015%`；当前 `formatPlayerStatTotal()` 已补 100%。Aggregator 应保存 bonus，presentation 决定是否补 baseline。
- `AllDamageTypeAddedRatio` 应先保持独立，当前证据不足以把它机械展开为七个元素属性。
- 当前 Player Info 能展示的元素字段为七种 `*AddedRatio`；fixture 覆盖 Ice、Quantum、Imaginary。
- HealTakenRatio 是明确静态 contribution，但当前 MiHoMo property metadata 将其视为无公开 field 的 non-affix；是否新增展示不属于本轮。

## 20. Local Stat Synthesis Prototype

概念中间模型：

```ts
interface PropertyContribution {
  propertyType: string;
  value: number;
  source: 'avatar' | 'lightCone' | 'lightConeAbility'
    | 'relicMain' | 'relicSub' | 'relicSet' | 'trace';
  sourceId: string;
}

interface StatBuckets {
  base: number;
  ratio: number;
  flat: number;
  direct: number;
}
```

流向：

```text
source resolvers
  -> PropertyContribution[]
  -> explicit PropertySemanticRegistry
  -> StatAccumulator
  -> per-stat finalize rules
  -> provider-neutral final stats
```

不为每个来源写不同数学逻辑；source resolver 只负责把 raw/config 变成 contribution，共享 registry 决定语义。

## 21. MiHoMo Golden Comparison

汇总：

| Metric | Count |
| --- | ---: |
| Characters tested | 6 |
| Stats tested | 56 |
| Exact (`<=1e-12`) | 49 |
| Rounding-only (`<=1e-8`) | 2 |
| Explained mismatch | 5 |
| Unexplained mismatch | 0 |
| Not comparable | 0 |

按角色：

| Character | Tested | Exact | Rounding | Explained mismatch | Unexplained |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1310 流萤 | 9 | 9 | 0 | 0 | 0 |
| 1413 长夜月 | 8 | 7 | 1 | 0 | 0 |
| 1409 风堇 | 11 | 6 | 0 | 5 | 0 |
| 1415 昔涟 | 8 | 8 | 0 | 0 | 0 |
| 1407 遐蝶 | 9 | 8 | 1 | 0 | 0 |
| 8006 星 | 11 | 11 | 0 | 0 | 0 |

## 22. Mismatches and Edge Cases

### 22.1 Character 1409

五项差异：HP `+90.35209499`、DEF `+37.315842`、SPD `-1.7`、EHR `-0.0820800049`、RES `+0.1166400069`。

它们与两份 fixture 中 TID `61252` 的不同词条逐项一致：Enka 时点的遗器增加 HP%、DEF%、SPD、RES；MiHoMo 时点的遗器增加 flat HP、flat DEF、SPD、EHR。ATK、Healing、Break、ERR 等未受影响并精确匹配。因此这是 snapshot drift，不是计算 mismatch。

### 22.2 Two rounding-only CR values

1413 与 1407 的 CR 均相差约 `2e-9`，UI display 相同。差异来自静态数据序列化精度，不应通过提前 round 修复；`1e-8` 是合理 golden tolerance。

### 22.3 Uncovered property types

- `BaseSpeed` from LC：结构语义明确，缺带 ratio+flat 的 golden build；
- `AllDamageTypeAddedRatio`：静态 direct bucket 明确，当前 final display folding 未 golden 验证；
- `HealTakenRatio`：静态 direct bucket 明确，当前 UI visibility 未验证；
- Fire/Physical/Thunder/Wind DMG：与已验证 Ice/Quantum/Imaginary 同一显式 registry 类，但当前 fixture 没有 final sample。

## 23. Existing HSR-Database Code Reuse

可直接复用：

- `scripts/data/stats.ts#normalizeStatProgression`：角色/光锥等级成长和突破阶段规则正确；
- `scripts/data/domain/character.ts`：已读取 AvatarPromotion、固定 SPD/CR/CD、PointType 与 StatusAddList；
- `scripts/data/domain/light-cone.ts`：已生成光锥 promotion progression 与 rank skill 数据；
- `scripts/data/domain/relic.ts`：已有 set/effect requirement 框架；
- `src/lib/player/character.ts`：已有 MiHoMo field 到 property label 的展示映射与 ERR +100% 展示规则。

只适用于静态 catalog、不能直接满足 runtime synthesis：

- domain stat progression 是面向详情页的 normalized stages，不是按 runtime `(id, promotion, level)` 的窄 lookup；
- light-cone domain 保留描述/params，但未投影 `AbilityProperty`；
- relic domain 当前 `PropertyList.map(String)` 无法保留混淆对象中的 type/value；
- character trace projection面向 UI，只取第一 property/type/value，虽适合当前每节点一个 item，但没有 runtime owned-node aggregator；
- Eidolon projection 未保留 `SkillAddLevelList`，上一轮已指出 effective level resolver 缺口；
- Player contract 只保存 MiHoMo formatted relic affix 和 final stats，不能承载 Enka raw synthesis input。

## 24. Required Runtime Lookups

正式实现最小新增/扩展：

1. `(avatarId, promotion) -> HP/ATK/DEF base/add + SPD/CR/CD`；
2. `(equipmentId, promotion) -> BaseHP/ATK/DEF + adds`；
3. `(equipmentId, rank) -> AbilityProperty[]`；
4. `relicTid -> setId/mainAffixGroup/subAffixGroup`；
5. `(mainGroup, affixId)` 与 `(subGroup, affixId)` affix rows；
6. `(setId, requiredPieces) -> PropertyContribution[]`；
7. `pointId -> PointType/level/StatusAddList`；
8. 显式 `PropertySemanticRegistry`；
9. `(avatarId, rank) -> SkillAddLevelList`（属于上一轮 progression 缺口，不参与 final stat）；
10. property display metadata，只用于 label/icon/percent，不参与数值语义。

所有 lookup 都应是窄投影，不把完整上游 JSON 打进 browser/runtime bundle。

## 25. Proposed Stat Aggregator Architecture

```text
Enka PlayerCharacterBuild
  ├─ avatar progression resolver
  ├─ light-cone progression + AbilityProperty resolver
  ├─ relic raw affix resolver
  ├─ equipped set counter + PropertyList resolver
  └─ owned trace StatusAddList resolver
           ↓
    PropertyContribution[]
           ↓
    PropertySemanticRegistry
           ↓
      StatAccumulator
           ↓
    per-stat finalize rules
           ↓
 PlayerStat[] (existing UI contract shape)
```

实现应对未知 PropertyType fail closed：记录诊断并不把未知值猜进任意 stat。数据更新 validation 应确保当前 29 类型都注册。

## 26. Migration Impact

完成 aggregator 后：

- Enka 提供玩家当前 build facts；
- TurnBasedGameData 提供静态规则；
- HSR-Database 本地确定性合成 final stats；
- MiHoMo 只保留为离线 fixture/golden 来源，可从 Player Info runtime dependency 完全移除；
- UI 继续只显示最终值，不增加 Base/Bonus 分栏，不改变 rounding；
- 不影响 Relic Score、provider API、CSS 或部署流程。

## 27. Additional Fixture Requirements

优先级最高：

1. 装备 `23036` 或 `23044`，同时有 SpeedAddedRatio 与 SpeedDelta；
2. 装备带 `AllDamageTypeAddedRatio` 的光锥；
3. 装备 `23039`，确认 HealTakenRatio 的 final/display contract；
4. Fire/Physical/Thunder/Wind DMG build；
5. 无光锥、未满级光锥、突破边界等级；
6. 低等级角色、未满级/非五星遗器；
7. 同 avatar 多展示区域且装备不同；
8. 更多 enhanced profile、不同 Trailblazer path、servant/memosprite build。

## 28. Confirmed / Inferred / Unknown

### Confirmed

- `statistics = attributes + additions`；
- avatar 与 light-cone base progression 公式；
- HP/ATK/DEF 的 base-ratio-flat 顺序；
- SPD 的 avatar base-ratio-flat 顺序；
- direct percentage stats 为加法；
- 当前 6 build 的 AbilityProperty、relic、set PropertyList、minor trace contribution；
- 1030 个 PointType 1 全部且仅它们有 StatusAddList；
- 当前大行迹与星魂没有 panel property channel；
- 当前 56 golden 项没有 unexplained mismatch。

### Strongly inferred

- LC `BaseSpeed` 进入 ratio 前的 SPD base；
- `EquipmentSkillConfig.AbilityProperty` 是所有当前光锥静态 property 的完整 projection；
- `RelicSetSkillConfig.PropertyList` 在未来版本仍保持“静态面板部分”语义；
- `HealTakenRatio` 应进入内部 accumulator，即使当前 UI 不显示。

### Unknown / requires more evidence

- `AllDamageTypeAddedRatio` 在游戏/MiHoMo final display 中是否独立显示或折叠到角色元素；
- `HealTakenRatio` 是否应成为 HSR-Database 可见 PlayerStat；
- 未覆盖的未来 PropertyType；
- 上游未来是否会给非 PointType 1 节点或 AvatarRank 增加显式 property channel。

## 29. Recommended Next Implementation Phase

1. 将本 prototype 收敛为纯函数和 generated narrow lookups；
2. 固化当前 6 角色 golden test，容差 `1e-8`，对 1409 使用同抓取时点 fixture 或按已知 relic drift 隔离；
3. 为 unknown PropertyType、PointType structural exception、set property schema 增加 generation-time validation；
4. 补三类最高优先 fixture：BaseSpeed、AllDamage、HealTaken；
5. shadow compare Enka synthesis 与 MiHoMo；
6. 通过后切 Player Info stats 输入并移除 MiHoMo runtime dependency；
7. 保留 MiHoMo fixture 作为回归 golden，不作为 canonical source。

## 30. Direct Answers

1. **能否完全由 Enka raw + TurnBasedGameData 重建当前 Player Info 的战斗外最终面板？** 能。当前 6 角色全部可重建，所有差异均为 rounding 或已证实 snapshot drift。
2. **是否还存在必须依赖 MiHoMo 才能获得的最终 stat 信息？** 没有。MiHoMo 只需作为 golden oracle。
3. **哪些字段明确代表 OOC contribution？** Avatar/Equipment promotion stat、EquipmentSkill `AbilityProperty`、relic main/sub `Property`、RelicSetSkill `PropertyList`、PointType 1 `StatusAddList`。
4. **AbilityProperty 精确语义？** 按光锥 SkillID 与 1-based rank 选择的显式静态 property/value；不需 ParamList 求值。
5. **RelicSet PropertyList 可否直接使用？** 当前版本可以；达到 RequireNum 时加入。空列表 Ability 不执行。
6. **小行迹 StatusAddList 是否完整？** 当前版本完整：1030/1030 PointType 1 有且仅有一个，非 PointType 1 为 0。
7. **大行迹反例？** 当前版本无。
8. **星魂反例？** 当前版本无；仅 RankAbility/SkillAddLevelList 等。
9. **BaseHP/Attack/Defence/Speed 语义？** 都是对应 final 公式 percentage multiplier 的 base bucket；CR/CD 的 `Base` 后缀不是该语义。
10. **AddedRatio 如何作用？** 乘在汇总后的对应 base 上；不乘 flat。
11. **Delta 何时加入？** ratio 计算后相加。
12. **HP/ATK/DEF 公式？** `base × (1 + ratio) + flat`。
13. **SPD 公式？** `(avatar SpeedBase + ΣBaseSpeed) × (1 + ΣSpeedAddedRatio) + ΣSpeedDelta`；LC BaseSpeed 子项待专门 fixture 提升为 Confirmed。
14. **CRIT/Break/EHR/RES/ERR/Healing/DMG？** 同类 direct additions；CR/CD另加角色固有值；ERR 的 UI 总值再加 100% baseline。
15. **匹配率？** 49 exact、2 rounding-only、5 explained mismatch、0 unexplained，共 56 项；同状态项在 `1e-8` 下 51/51。
16. **所有 mismatch 是否可解释？** 是。
17. **需要角色-specific heuristic？** 不需要。
18. **需要执行 Ability/Battle Script？** 不需要。
19. **最小 lookup/resolver？** 见 §24 的 10 项窄 lookup/registry。
20. **完成这一层后能否移除 MiHoMo runtime dependency？** 能；但本轮没有实施切换。

## Appendix A. Property Semantic Matrix

| PropertyType | Target | Bucket | Sources | OOC static? | Confidence | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `BaseHP` | HP | base | avatar, LC | Yes | Confirmed | ratio multiplier base |
| `HPAddedRatio` | HP | ratio | LC, relic, set, trace | Yes | Confirmed | multiplies total HP base |
| `HPDelta` | HP | flat | relic | Yes | Confirmed | post-ratio |
| `BaseAttack` | ATK | base | avatar, LC | Yes | Confirmed | ratio multiplier base |
| `AttackAddedRatio` | ATK | ratio | LC, relic, set, trace | Yes | Confirmed | multiplies total ATK base |
| `AttackDelta` | ATK | flat | relic | Yes | Confirmed | post-ratio |
| `BaseDefence` | DEF | base | avatar, LC | Yes | Confirmed | ratio multiplier base |
| `DefenceAddedRatio` | DEF | ratio | LC, relic, set, trace | Yes | Confirmed | multiplies total DEF base |
| `DefenceDelta` | DEF | flat | relic | Yes | Confirmed | post-ratio |
| `BaseSpeed` | SPD | base | avatar, LC AbilityProperty | Yes | Strongly inferred for LC | LC IDs 23036/23044 |
| `SpeedAddedRatio` | SPD | ratio | LC, set | Yes | Confirmed | can be negative |
| `SpeedDelta` | SPD | flat | relic, trace | Yes | Confirmed | post-ratio, retains decimals |
| `CriticalChanceBase` | CR | direct | avatar, LC, relic, set, trace | Yes | Confirmed | avatar innate + sums |
| `CriticalDamageBase` | CD | direct | avatar, LC, relic, set, trace | Yes | Confirmed | avatar innate + sums |
| `BreakDamageAddedRatioBase` | Break | direct | LC, relic, set, trace | Yes | Confirmed | default 0 |
| `StatusProbabilityBase` | EHR | direct | LC, relic, set, trace | Yes | Confirmed | default 0 |
| `StatusResistanceBase` | RES | direct | LC, relic, set, trace | Yes | Confirmed | default 0 |
| `SPRatioBase` | ERR bonus | direct | LC, relic, set | Yes | Confirmed | display total adds 1.0 |
| `HealRatioBase` | outgoing healing | direct | LC, relic, set | Yes | Confirmed | default 0 |
| `HealTakenRatio` | incoming healing | direct | LC | Static, visibility TBD | Strongly inferred | only LC 23039 |
| `AllDamageTypeAddedRatio` | all DMG | direct | LC | Yes, display TBD | Strongly inferred | keep separate |
| `PhysicalAddedRatio` | Physical DMG | direct | relic, set, trace | Yes | Semantic confirmed | fixture coverage pending |
| `FireAddedRatio` | Fire DMG | direct | relic, set, trace | Yes | Semantic confirmed | fixture coverage pending |
| `IceAddedRatio` | Ice DMG | direct | relic, set, trace | Yes | Confirmed | golden covered |
| `ThunderAddedRatio` | Lightning DMG | direct | relic, set, trace | Yes | Semantic confirmed | fixture coverage pending |
| `WindAddedRatio` | Wind DMG | direct | relic, set, trace | Yes | Semantic confirmed | fixture coverage pending |
| `QuantumAddedRatio` | Quantum DMG | direct | relic, set, trace | Yes | Confirmed | golden covered |
| `ImaginaryAddedRatio` | Imaginary DMG | direct | relic, set, trace | Yes | Confirmed | golden covered |
| `ElationDamageAddedRatioBase` | Elation | direct | LC, set, trace | Yes | Structural | no current golden final |

## Appendix B. Property Source Matrix

| Source | Identity lookup | Value lookup | Activation |
| --- | --- | --- | --- |
| Avatar | avatarId + promotion | promotion base/add and fixed stats | always |
| Light cone base | tid + promotion | equipment promotion base/add | equipped |
| Light cone static property | tid -> SkillID + rank | AbilityProperty | equipped |
| Relic main | tid -> MainAffixGroup + mainAffixId | BaseValue + LevelAdd × level | equipped |
| Relic sub | tid -> SubAffixGroup + affixId | BaseValue × cnt + StepValue × step | equipped |
| Relic set | tid -> SetID; count slots | PropertyList | count >= RequireNum |
| Minor trace | pointId + owned level | StatusAddList | owned level > 0 |
| Major trace | pointId | no panel property | excluded |
| Eidolon | avatar rank | no panel property | excluded from stats |

## Appendix C. Per-Character Golden Results

| Character | Stat | Local | MiHoMo | Delta | Result |
| --- | --- | ---: | ---: | ---: | --- |
| 流萤 (1310) | hp | 3115.47601052248 | 3115.47601052248 | -4.55e-13 | exact |
| 流萤 (1310) | atk | 2523.4928245632 | 2523.4928245632 | 0 | exact |
| 流萤 (1310) | def | 1447.124957 | 1447.124957 | -2.27e-13 | exact |
| 流萤 (1310) | spd | 164.472 | 164.472 | 0 | exact |
| 流萤 (1310) | crit_rate | 0.05 | 0.05 | 0 | exact |
| 流萤 (1310) | crit_dmg | 0.5648000008 | 0.5648000008 | 0 | exact |
| 流萤 (1310) | break_dmg | 2.331800002 | 2.331800002 | 4.44e-16 | exact |
| 流萤 (1310) | effect_hit | 0.1987200118 | 0.1987200118 | 0 | exact |
| 流萤 (1310) | effect_res | 0.2966400069 | 0.2966400069 | 0 | exact |
| 长夜月 (1413) | hp | 7812.5929238956 | 7812.5929238956 | 0 | exact |
| 长夜月 (1413) | atk | 1684.77411848417 | 1684.77411848417 | 0 | exact |
| 长夜月 (1413) | def | 1253.30784 | 1253.30784 | 0 | exact |
| 长夜月 (1413) | spd | 99 | 99 | 0 | exact |
| 长夜月 (1413) | crit_rate | 0.6993200008 | 0.6993200028 | -2.00e-9 | rounding-only |
| 长夜月 (1413) | crit_dmg | 1.8901200024 | 1.8901200024 | 0 | exact |
| 长夜月 (1413) | effect_hit | 0.1512000089 | 0.1512000089 | 0 | exact |
| 长夜月 (1413) | ice_dmg | 0.388803015 | 0.388803015 | 0 | exact |
| 风堇 (1409) | hp | 5062.6036117834 | 4972.25151678943 | 90.35209499 | explained mismatch |
| 风堇 (1409) | atk | 1382.24871311675 | 1382.24871311675 | 0 | exact |
| 风堇 (1409) | def | 1417.141662 | 1379.82582 | 37.315842 | explained mismatch |
| 风堇 (1409) | spd | 218.032 | 219.732 | -1.7 | explained mismatch |
| 风堇 (1409) | crit_rate | 0.05 | 0.05 | 0 | exact |
| 风堇 (1409) | crit_dmg | 0.5 | 0.5 | 0 | exact |
| 风堇 (1409) | effect_hit | 0.0777600046 | 0.1598400095 | -0.0820800049 | explained mismatch |
| 风堇 (1409) | effect_res | 0.3398400095 | 0.2232000026 | 0.1166400069 | explained mismatch |
| 风堇 (1409) | heal_rate | 0.345606 | 0.345606 | 0 | exact |
| 风堇 (1409) | break_dmg | 0.1231200012 | 0.1231200012 | 0 | exact |
| 风堇 (1409) | sp_rate | 0.194394015 | 0.194394015 | 0 | exact |
| 昔涟 (1415) | hp | 6264.20416561336 | 6264.20416561336 | 9.09e-13 | exact |
| 昔涟 (1415) | atk | 1469.73020187256 | 1469.73020187256 | 2.27e-13 | exact |
| 昔涟 (1415) | def | 1152.461323 | 1152.461323 | 0 | exact |
| 昔涟 (1415) | spd | 181.952 | 181.952 | 0 | exact |
| 昔涟 (1415) | crit_rate | 0.26184 | 0.26184 | 0 | exact |
| 昔涟 (1415) | crit_dmg | 1.8061200016 | 1.8061200016 | 0 | exact |
| 昔涟 (1415) | break_dmg | 0.3110400032 | 0.3110400032 | 0 | exact |
| 昔涟 (1415) | effect_res | 0.069120004 | 0.069120004 | 0 | exact |
| 遐蝶 (1407) | hp | 9677.77804478032 | 9677.77804478032 | 0 | exact |
| 遐蝶 (1407) | atk | 1524.19309751051 | 1524.19309751051 | 2.27e-13 | exact |
| 遐蝶 (1407) | def | 1034.413776 | 1034.413776 | 0 | exact |
| 遐蝶 (1407) | spd | 92.3 | 92.3 | 1.42e-14 | exact |
| 遐蝶 (1407) | crit_rate | 0.6970800008 | 0.6970800028 | -2.00e-9 | rounding-only |
| 遐蝶 (1407) | crit_dmg | 1.7540400036 | 1.7540400036 | 0 | exact |
| 遐蝶 (1407) | effect_res | 0.0734400043 | 0.0734400043 | 0 | exact |
| 遐蝶 (1407) | break_dmg | 0.0648000008 | 0.0648000008 | 0 | exact |
| 遐蝶 (1407) | quantum_dmg | 0.244 | 0.244 | -2.78e-17 | exact |
| 星 (8006) | hp | 3026.68758043062 | 3026.68758043062 | 0 | exact |
| 星 (8006) | atk | 1511.24827787798 | 1511.24827787798 | 0 | exact |
| 星 (8006) | def | 2619.1365542812 | 2619.1365542812 | 0 | exact |
| 星 (8006) | spd | 153.332 | 153.332 | 0 | exact |
| 星 (8006) | crit_rate | 0.1115600006 | 0.1115600006 | 0 | exact |
| 星 (8006) | crit_dmg | 0.7462400024 | 0.7462400024 | 0 | exact |
| 星 (8006) | break_dmg | 0.9262800016 | 0.9262800016 | 0 | exact |
| 星 (8006) | effect_res | 0.3721600161 | 0.3721600161 | 0 | exact |
| 星 (8006) | sp_rate | 0.194394015 | 0.194394015 | 0 | exact |
| 星 (8006) | effect_hit | 0.0864000052 | 0.0864000052 | 0 | exact |
| 星 (8006) | imaginary_dmg | 0.144 | 0.144 | 0 | exact |

## Appendix D. Relic Set PropertyList Inventory

仅列非空 PropertyList；未列出的 35 rows 均为 Ability-only。

| Set | Pieces | PropertyType | Value |
| ---: | ---: | --- | ---: |
| 101 | 2 | HealRatioBase | 0.10 |
| 102 | 2 | AttackAddedRatio | 0.12 |
| 102 | 4 | SpeedAddedRatio | 0.06 |
| 103 | 2 | DefenceAddedRatio | 0.15 |
| 104 | 2 | IceAddedRatio | 0.10 |
| 105 | 2 | PhysicalAddedRatio | 0.10 |
| 107 | 2 | FireAddedRatio | 0.10 |
| 108 | 2 | QuantumAddedRatio | 0.10 |
| 109 | 2 | ThunderAddedRatio | 0.10 |
| 110 | 2 | WindAddedRatio | 0.10 |
| 111 | 2 | BreakDamageAddedRatioBase | 0.16 |
| 111 | 4 | BreakDamageAddedRatioBase | 0.16 |
| 112 | 2 | ImaginaryAddedRatio | 0.10 |
| 113 | 2 | HPAddedRatio | 0.12 |
| 114 | 2 | SpeedAddedRatio | 0.06 |
| 116 | 2 | AttackAddedRatio | 0.12 |
| 117 | 4 | CriticalChanceBase | 0.04 |
| 118 | 2 | BreakDamageAddedRatioBase | 0.16 |
| 119 | 2 | BreakDamageAddedRatioBase | 0.16 |
| 120 | 2 | AttackAddedRatio | 0.12 |
| 120 | 4 | CriticalChanceBase | 0.06 |
| 121 | 2 | SpeedAddedRatio | 0.06 |
| 122 | 2 | CriticalChanceBase | 0.08 |
| 123 | 2 | AttackAddedRatio | 0.12 |
| 124 | 2 | QuantumAddedRatio | 0.10 |
| 124 | 4 | SpeedAddedRatio | -0.08 |
| 125 | 2 | SpeedAddedRatio | 0.06 |
| 126 | 2 | CriticalDamageBase | 0.16 |
| 127 | 2 | CriticalChanceBase | 0.08 |
| 129 | 2 | CriticalDamageBase | 0.16 |
| 130 | 2 | SpeedAddedRatio | 0.06 |
| 131 | 2 | AttackAddedRatio | 0.12 |
| 132 | 2 | HPAddedRatio | 0.12 |
| 301 | 2 | AttackAddedRatio | 0.12 |
| 302 | 2 | HPAddedRatio | 0.12 |
| 303 | 2 | StatusProbabilityBase | 0.10 |
| 304 | 2 | DefenceAddedRatio | 0.15 |
| 305 | 2 | CriticalDamageBase | 0.16 |
| 306 | 2 | CriticalChanceBase | 0.08 |
| 307 | 2 | BreakDamageAddedRatioBase | 0.16 |
| 308 | 2 | SPRatioBase | 0.05 |
| 309 | 2 | CriticalChanceBase | 0.08 |
| 310 | 2 | StatusResistanceBase | 0.10 |
| 311 | 2 | AttackAddedRatio | 0.12 |
| 312 | 2 | SPRatioBase | 0.05 |
| 313 | 2 | CriticalChanceBase | 0.04 |
| 314 | 2 | AttackAddedRatio | 0.12 |
| 316 | 2 | SpeedAddedRatio | 0.06 |
| 317 | 2 | SPRatioBase | 0.05 |
| 318 | 2 | CriticalDamageBase | 0.16 |
| 319 | 2 | HPAddedRatio | 0.12 |
| 320 | 2 | SpeedAddedRatio | 0.06 |
| 322 | 2 | AttackAddedRatio | 0.12 |
| 323 | 2 | CriticalChanceBase | 0.08 |
| 324 | 2 | CriticalDamageBase | 0.16 |
| 325 | 2 | ElationDamageAddedRatioBase | 0.08 |
| 327 | 2 | CriticalChanceBase | 0.08 |

## Appendix E. Evidence Files

- `Enka-API-Integration-01/168902602-Enka.json`
- `Enka-API-Integration-01/168902602-MiHoMo.json`
- `TurnBasedGameData/ExcelOutput/AvatarPromotionConfig.json`
- `TurnBasedGameData/ExcelOutput/EquipmentConfig.json`
- `TurnBasedGameData/ExcelOutput/EquipmentPromotionConfig.json`
- `TurnBasedGameData/ExcelOutput/EquipmentSkillConfig.json`
- `TurnBasedGameData/ExcelOutput/RelicConfig.json`
- `TurnBasedGameData/ExcelOutput/RelicMainAffixConfig.json`
- `TurnBasedGameData/ExcelOutput/RelicSubAffixConfig.json`
- `TurnBasedGameData/ExcelOutput/RelicSetSkillConfig.json`
- `TurnBasedGameData/ExcelOutput/AvatarSkillTreeConfig.json`
- `TurnBasedGameData/ExcelOutput/AvatarRankConfig.json`
- `HSR-Database/scripts/data/stats.ts`
- `HSR-Database/scripts/data/domain/{character,light-cone,relic}.ts`
- `HSR-Database/src/lib/player/{contract,character}.ts`
- `HSR-Database/api/_player/parse.ts`
