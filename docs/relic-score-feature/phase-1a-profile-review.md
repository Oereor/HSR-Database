# Relic Score Phase 1A Character Profile 人工审核

## 审核说明

- 本文记录 Phase 1A 人工审核；逐角色 [x] 回答与 Weight 表中的修改后数值是最终维护者决定。候选 Profile 和 review reasons 为 application 前快照；决定已应用至 source config。
- 数据快照：当前生成 artifact 的 sourceCommit 为 `4ce30f69b32dc259ab9a8da3ba57035485103221`。角色名、命途中文名、套装名和属性中文名来自当前 `zh-CN` projection；ID、PropertyType、推荐顺序与权重分别取自当前 recommendation 和 generated Profile。
- Cavern 行按上游有序 4 件套候选列出；不把多个候选拼成 2+2。权重只表达当前候选 Profile，不代表人工认可。
- 未推荐属性未通过本次审核加入权重。

## 审核前统计

| 指标 | 数量 |
| --- | ---: |
| Character Profile 总数 | 97 |
| needs-review | 34 |
| unreviewed | 63 |
| reviewed | 0 |
| AMBIGUOUS_SCALING | 13 |
| SPECIAL_PATH | 15 |

审核后 / application 后（通过 profile validation）：

| 指标 | 数量 |
| --- | ---: |
| reviewed | 97 |
| unreviewed | 0 |
| needs-review | 0 |

模板候选数：`direct-dps` 60；`direct-support` 7；`break` 9；`dot-dps` 6；`debuff-support` 2；`sustain` 9；`hybrid-direct-break` 4。

## needs-review 总览

| 角色 | ID | 命途 | Confidence | 当前 Template | Review reasons |
| --- | --- | --- | --- | --- | --- |
| 三月七·存护 | `1001` | 存护（`Knight`） | `medium` | `debuff-support` | `PATH_TEMPLATE_MISMATCH` |
| 艾丝妲 | `1009` | 同谐（`Shaman`） | `medium` | `direct-dps` | `PATH_TEMPLATE_MISMATCH` |
| 布洛妮娅 | `1101` | 同谐（`Shaman`） | `medium` | `direct-support` | `MIXED_STAT_SIGNALS`<br>`AMBIGUOUS_SCALING` |
| 杰帕德 | `1104` | 存护（`Knight`） | `medium` | `debuff-support` | `PATH_TEMPLATE_MISMATCH` |
| 卢卡 | `1111` | 虚无（`Warlock`） | `medium` | `hybrid-direct-break` | `PATH_TEMPLATE_MISMATCH` |
| 驭空 | `1207` | 同谐（`Shaman`） | `medium` | `direct-dps` | `PATH_TEMPLATE_MISMATCH` |
| 寒鸦 | `1215` | 同谐（`Shaman`） | `high` | `direct-support` | `AMBIGUOUS_SCALING` |
| 灵砂 | `1222` | 丰饶（`Priest`） | `medium` | `break` | `PATH_TEMPLATE_MISMATCH` |
| 忘归人 | `1225` | 虚无（`Warlock`） | `medium` | `break` | `MIXED_STAT_SIGNALS`<br>`AMBIGUOUS_SCALING` |
| 加拉赫 | `1301` | 丰饶（`Priest`） | `medium` | `break` | `PATH_TEMPLATE_MISMATCH`<br>`AMBIGUOUS_SCALING` |
| 阮•梅 | `1303` | 同谐（`Shaman`） | `medium` | `break` | `PATH_TEMPLATE_MISMATCH`<br>`AMBIGUOUS_SCALING` |
| 砂金 | `1304` | 存护（`Knight`） | `medium` | `direct-dps` | `PATH_TEMPLATE_MISMATCH` |
| 花火 | `1306` | 同谐（`Shaman`） | `medium` | `direct-support` | `MIXED_STAT_SIGNALS`<br>`AMBIGUOUS_SCALING` |
| 星期日 | `1313` | 同谐（`Shaman`） | `medium` | `direct-support` | `MIXED_STAT_SIGNALS`<br>`AMBIGUOUS_SCALING` |
| 大丽花 | `1321` | 虚无（`Warlock`） | `high` | `break` | `AMBIGUOUS_SCALING` |
| 阿格莱雅 | `1402` | 记忆（`Memory`） | `low` | `direct-dps` | `SPECIAL_PATH`<br>`PATH_TEMPLATE_MISMATCH` |
| 缇宝 | `1403` | 同谐（`Shaman`） | `medium` | `direct-dps` | `PATH_TEMPLATE_MISMATCH` |
| 遐蝶 | `1407` | 记忆（`Memory`） | `low` | `direct-dps` | `SPECIAL_PATH`<br>`PATH_TEMPLATE_MISMATCH` |
| 风堇 | `1409` | 记忆（`Memory`） | `low` | `direct-dps` | `SPECIAL_PATH`<br>`MIXED_STAT_SIGNALS`<br>`PATH_TEMPLATE_MISMATCH` |
| 刻律德菈 | `1412` | 同谐（`Shaman`） | `medium` | `direct-support` | `MIXED_STAT_SIGNALS` |
| 长夜月 | `1413` | 记忆（`Memory`） | `low` | `direct-dps` | `SPECIAL_PATH`<br>`PATH_TEMPLATE_MISMATCH` |
| 昔涟 | `1415` | 记忆（`Memory`） | `low` | `direct-dps` | `SPECIAL_PATH`<br>`PATH_TEMPLATE_MISMATCH` |
| 火花 | `1501` | 欢愉（`Elation`） | `low` | `direct-dps` | `SPECIAL_PATH`<br>`PATH_TEMPLATE_MISMATCH` |
| 爻光 | `1502` | 欢愉（`Elation`） | `low` | `direct-dps` | `SPECIAL_PATH`<br>`PATH_TEMPLATE_MISMATCH`<br>`AMBIGUOUS_SCALING` |
| 绯英 | `1505` | 欢愉（`Elation`） | `low` | `direct-dps` | `SPECIAL_PATH`<br>`PATH_TEMPLATE_MISMATCH` |
| 银狼LV.999 | `1506` | 欢愉（`Elation`） | `low` | `direct-dps` | `SPECIAL_PATH`<br>`PATH_TEMPLATE_MISMATCH`<br>`AMBIGUOUS_SCALING` |
| 知更鸟•晴歌 | `1512` | 记忆（`Memory`） | `low` | `direct-dps` | `SPECIAL_PATH`<br>`PATH_TEMPLATE_MISMATCH` |
| 砂金•戏浪 | `1513` | 欢愉（`Elation`） | `low` | `direct-dps` | `SPECIAL_PATH`<br>`PATH_TEMPLATE_MISMATCH`<br>`AMBIGUOUS_SCALING` |
| 开拓者·同谐 | `8005` | 同谐（`Shaman`） | `medium` | `break` | `PATH_TEMPLATE_MISMATCH`<br>`AMBIGUOUS_SCALING` |
| 开拓者·同谐 | `8006` | 同谐（`Shaman`） | `medium` | `break` | `PATH_TEMPLATE_MISMATCH`<br>`AMBIGUOUS_SCALING` |
| 开拓者·记忆 | `8007` | 记忆（`Memory`） | `low` | `direct-dps` | `SPECIAL_PATH`<br>`MIXED_STAT_SIGNALS`<br>`PATH_TEMPLATE_MISMATCH` |
| 开拓者·记忆 | `8008` | 记忆（`Memory`） | `low` | `direct-dps` | `SPECIAL_PATH`<br>`MIXED_STAT_SIGNALS`<br>`PATH_TEMPLATE_MISMATCH` |
| 开拓者·欢愉 | `8009` | 欢愉（`Elation`） | `low` | `direct-dps` | `SPECIAL_PATH`<br>`PATH_TEMPLATE_MISMATCH` |
| 开拓者·欢愉 | `8010` | 欢愉（`Elation`） | `low` | `direct-dps` | `SPECIAL_PATH`<br>`PATH_TEMPLATE_MISMATCH` |

## needs-review 逐角色审核

> **此条说明是维护者人工增加的。** 我们约定：在没有特别说明的情况下，crit-rate 的 target 默认为 100%，且在达到了 target 之后权重直接降低至 0。特别说明的情况包括 target 的值改变，或是在超出 target 之后权重不为 0。

### 1001 · 三月七·存护

- **Character ID：** `1001`；**命途：** 存护（`Knight`）；**inference confidence：** `medium`。
- **当前 inferred template：** `debuff-support`；**完整 review reasons：** `PATH_TEMPLATE_MISMATCH`。

#### 上游 Recommendation

- **Cavern 推荐（原顺序）：** 净庭教宗的圣骑士（`103`）、自匿星芒的隐士（`128`）、戍卫风雪的铁卫（`106`）。
- **Planar 推荐（原顺序）：** 筑城者的贝洛伯格（`304`）、折断的龙骨（`310`）、沉陆海域露莎卡（`317`）。
- **BODY 主词条：** 防御力（`DefenceAddedRatio`）、效果命中（`StatusProbabilityBase`）。
- **FOOT 主词条：** 速度（`SpeedDelta`）、防御力（`DefenceAddedRatio`）。
- **NECK / Sphere 主词条：** 防御力（`DefenceAddedRatio`）。
- **OBJECT / Rope 主词条：** 防御力（`DefenceAddedRatio`）。
- **推荐副词条（原顺序）：** 防御力（`DefenceAddedRatio`）、速度（`SpeedDelta`）、效果命中（`StatusProbabilityBase`）、效果抵抗（`StatusResistanceBase`）。

#### 当前 Generated Profile

| PropertyType | 中文属性名 | Weight |
| --- | --- | ---: |
| `DefenceAddedRatio` | 防御力 | ~~0.5~~ 1.0 |
| `SpeedDelta` | 速度 | ~~1.25~~ 1.0 |
| `StatusProbabilityBase` | 效果命中 | ~~1.25~~ 0.75 |
| `StatusResistanceBase` | 效果抵抗 | 0.5 |

- **Override：** 无。
- **已生成的 Hard Breakpoint / stat target / curve：** 0 / 0 / 0；仅供核对，未替人工补值。

#### Review reason 解释

- **`PATH_TEMPLATE_MISMATCH`：** 存护路径先验只匹配 sustain；推荐效果命中与速度；该分支选择 debuff-support；最终 `debuff-support` 不在该路径先验匹配集合中。这里仅描述生成器的分类冲突，不判断角色实际定位。

#### 人工审核 checklist

- [x] 当前 Template 是否正确？*不正确。三月七·存护适用生存位模版*
- [x] scaling stat 应为哪个 PropertyType？如不适用，请记录原因。*scaling-stat 使用 DEF。*
- [x] 当前各推荐副词条权重是否合理？*不合理。*
- [x] 是否存在角色自身明确的 Hard Breakpoint？*不存在。*
- [x] 是否需要 stat target / curve？*不需要。*
- [x] 是否需要 weight override？*需要，请看表格中的修改。*
- [x] 结论：接受 / 修改 / 待进一步调查。*修改。*

### 1009 · 艾丝妲

- **Character ID：** `1009`；**命途：** 同谐（`Shaman`）；**inference confidence：** `medium`。
- **当前 inferred template：** `direct-dps`；**完整 review reasons：** `PATH_TEMPLATE_MISMATCH`。

#### 上游 Recommendation

- **Cavern 推荐（原顺序）：** 骇域漫游的信使（`114`）、流星追迹的怪盗（`111`）、戍卫风雪的铁卫（`106`）。
- **Planar 推荐（原顺序）：** 不老者的仙舟（`302`）、折断的龙骨（`310`）、生命的翁瓦克（`308`）。
- **BODY 主词条：** 生命值（`HPAddedRatio`）、暴击率（`CriticalChanceBase`）。
- **FOOT 主词条：** 速度（`SpeedDelta`）。
- **NECK / Sphere 主词条：** 火属性伤害提高（`FireAddedRatio`）、生命值（`HPAddedRatio`）。
- **OBJECT / Rope 主词条：** 能量恢复效率（`SPRatioBase`）。
- **推荐副词条（原顺序）：** 速度（`SpeedDelta`）、攻击力（`AttackAddedRatio`）、暴击率（`CriticalChanceBase`）、暴击伤害（`CriticalDamageBase`）。

#### 当前 Generated Profile

| PropertyType | 中文属性名 | Weight |
| --- | --- | ---: |
| `AttackAddedRatio` | 攻击力 | ~~1~~ 0.5 |
| `CriticalChanceBase` | 暴击率 | ~~1.25~~ 0.5 |
| `CriticalDamageBase` | 暴击伤害 | ~~1.25~~ 0.5 |
| `SpeedDelta` | 速度 | ~~0.75~~ 1.25 |

- **Override：** 无。
- **已生成的 Hard Breakpoint / stat target / curve：** 0 / 0 / 0；仅供核对，未替人工补值。

#### Review reason 解释

- **`PATH_TEMPLATE_MISMATCH`：** 同谐路径先验只匹配 direct-support；同时推荐暴击率与暴击伤害；双暴分支选择 direct-dps；最终 `direct-dps` 不在该路径先验匹配集合中。这里仅描述生成器的分类冲突，不判断角色实际定位。

#### 人工审核 checklist

- [x] 当前 Template 是否正确？*不正确。应为 direct-support。*
- [x] scaling stat 应为哪个 PropertyType？如不适用，请记录原因。*scaling-stat 使用 ATK。*
- [x] 当前各推荐副词条权重是否合理？*不合理。*
- [x] 是否存在角色自身明确的 Hard Breakpoint？*不存在。*
- [x] 是否需要 stat target / curve？*不需要。*
- [x] 是否需要 weight override？*需要，已在表格中修改。*
- [x] 结论：接受 / 修改 / 待进一步调查。*修改。*

### 1101 · 布洛妮娅

- **Character ID：** `1101`；**命途：** 同谐（`Shaman`）；**inference confidence：** `medium`。
- **当前 inferred template：** `direct-support`；**完整 review reasons：** `MIXED_STAT_SIGNALS`、`AMBIGUOUS_SCALING`。

#### 上游 Recommendation

- **Cavern 推荐（原顺序）：** 骇域漫游的信使（`114`）、晨昏交界的翔鹰（`110`）、重循苦旅的司铎（`121`）。
- **Planar 推荐（原顺序）：** 沉陆海域露莎卡（`317`）、折断的龙骨（`310`）、不老者的仙舟（`302`）。
- **BODY 主词条：** 暴击伤害（`CriticalDamageBase`）。
- **FOOT 主词条：** 速度（`SpeedDelta`）。
- **NECK / Sphere 主词条：** 生命值（`HPAddedRatio`）、防御力（`DefenceAddedRatio`）。
- **OBJECT / Rope 主词条：** 能量恢复效率（`SPRatioBase`）。
- **推荐副词条（原顺序）：** 暴击伤害（`CriticalDamageBase`）、速度（`SpeedDelta`）、效果抵抗（`StatusResistanceBase`）。

#### 当前 Generated Profile

| PropertyType | 中文属性名 | Weight |
| --- | --- | ---: |
| `CriticalDamageBase` | 暴击伤害 | 1 |
| `SpeedDelta` | 速度 | 1.25 |
| `StatusResistanceBase` | 效果抵抗 | 0.5 |

- **Override：** 无。
- **已生成的 Hard Breakpoint / stat target / curve：** 0 / 0 / 0；仅供核对，未替人工补值。

#### Review reason 解释

- **`MIXED_STAT_SIGNALS`：** 双暴只出现一项：暴击伤害（`CriticalDamageBase`）；生成器因此降低置信度，未据此推断战斗机制。
- **`AMBIGUOUS_SCALING`：** 推荐副词条里没有 ATK/HP/DEF 百分比候选；推荐主词条中的 NECK：生命值（`HPAddedRatio`）、NECK：防御力（`DefenceAddedRatio`） 不能替推荐副词条新增 scaling 权重，因此生成器没有解析 scaling-stat。

#### 人工审核 checklist

- [x] 当前 Template 是否正确？*正确。*
- [x] scaling stat 应为哪个 PropertyType？如不适用，请记录原因。*不需要 scaling-stat；布洛妮娅一般不参与输出。*
- [x] 当前各推荐副词条权重是否合理？*合理。*
- [x] 是否存在角色自身明确的 Hard Breakpoint？*不存在。*
- [x] 是否需要 stat target / curve？*不需要。*
- [x] 是否需要 weight override？*不需要。*
- [x] 结论：接受 / 修改 / 待进一步调查。*接受。*

### 1104 · 杰帕德

- **Character ID：** `1104`；**命途：** 存护（`Knight`）；**inference confidence：** `medium`。
- **当前 inferred template：** `debuff-support`；**完整 review reasons：** `PATH_TEMPLATE_MISMATCH`。

#### 上游 Recommendation

- **Cavern 推荐（原顺序）：** 净庭教宗的圣骑士（`103`）、自匿星芒的隐士（`128`）、戍卫风雪的铁卫（`106`）。
- **Planar 推荐（原顺序）：** 筑城者的贝洛伯格（`304`）、折断的龙骨（`310`）、沉陆海域露莎卡（`317`）。
- **BODY 主词条：** 防御力（`DefenceAddedRatio`）。
- **FOOT 主词条：** 速度（`SpeedDelta`）。
- **NECK / Sphere 主词条：** 防御力（`DefenceAddedRatio`）。
- **OBJECT / Rope 主词条：** 能量恢复效率（`SPRatioBase`）、防御力（`DefenceAddedRatio`）。
- **推荐副词条（原顺序）：** 防御力（`DefenceAddedRatio`）、速度（`SpeedDelta`）、效果命中（`StatusProbabilityBase`）、效果抵抗（`StatusResistanceBase`）。

#### 当前 Generated Profile

| PropertyType | 中文属性名 | Weight |
| --- | --- | ---: |
| `DefenceAddedRatio` | 防御力 | ~~0.5~~ 1.0 |
| `SpeedDelta` | 速度 | ~~1.25~~ 0.75 |
| `StatusProbabilityBase` | 效果命中 | ~~1.25~~ 0.75 |
| `StatusResistanceBase` | 效果抵抗 | 0.5 |

- **Override：** 无。
- **已生成的 Hard Breakpoint / stat target / curve：** 0 / 0 / 0；仅供核对，未替人工补值。

#### Review reason 解释

- **`PATH_TEMPLATE_MISMATCH`：** 存护路径先验只匹配 sustain；推荐效果命中与速度；该分支选择 debuff-support；最终 `debuff-support` 不在该路径先验匹配集合中。这里仅描述生成器的分类冲突，不判断角色实际定位。

#### 人工审核 checklist

- [x] 当前 Template 是否正确？*不正确。应为生存位。*
- [x] scaling stat 应为哪个 PropertyType？如不适用，请记录原因。*scaling-stat 使用 DEF。*
- [x] 当前各推荐副词条权重是否合理？*不合理。*
- [x] 是否存在角色自身明确的 Hard Breakpoint？*不存在。*
- [x] 是否需要 stat target / curve？*不需要。*
- [x] 是否需要 weight override？*需要。已在表格中标出。*
- [x] 结论：接受 / 修改 / 待进一步调查。*修改。*

### 1111 · 卢卡

- **Character ID：** `1111`；**命途：** 虚无（`Warlock`）；**inference confidence：** `medium`。
- **当前 inferred template：** `hybrid-direct-break`；**完整 review reasons：** `PATH_TEMPLATE_MISMATCH`。

#### 上游 Recommendation

- **Cavern 推荐（原顺序）：** 街头出身的拳王（`105`）、幽锁深牢的系囚（`116`）、野穗伴行的快枪手（`102`）。
- **Planar 推荐（原顺序）：** 太空封印站（`301`）、盗贼公国塔利亚（`307`）、繁星竞技场（`309`）。
- **BODY 主词条：** 攻击力（`AttackAddedRatio`）。
- **FOOT 主词条：** 速度（`SpeedDelta`）。
- **NECK / Sphere 主词条：** 物理属性伤害提高（`PhysicalAddedRatio`）。
- **OBJECT / Rope 主词条：** 攻击力（`AttackAddedRatio`）。
- **推荐副词条（原顺序）：** 攻击力（`AttackAddedRatio`）、速度（`SpeedDelta`）、击破特攻（`BreakDamageAddedRatioBase`）、暴击率（`CriticalChanceBase`）、暴击伤害（`CriticalDamageBase`）。

#### 当前 Generated Profile

| PropertyType | 中文属性名 | Weight |
| --- | --- | ---: |
| `AttackAddedRatio` | 攻击力 | 0.75 |
| `BreakDamageAddedRatioBase` | 击破特攻 | ~~1.25~~ 0.25 |
| `CriticalChanceBase` | 暴击率 | ~~1~~ 0.5 |
| `CriticalDamageBase` | 暴击伤害 | ~~1~~ 0.5 |
| `SpeedDelta` | 速度 | 0.75 |

- **Override：** 无。
- **已生成的 Hard Breakpoint / stat target / curve：** 0 / 0 / 0；仅供核对，未替人工补值。

#### Review reason 解释

- **`PATH_TEMPLATE_MISMATCH`：** 虚无路径先验允许 dot-dps、debuff-support、break、direct-dps；同时推荐暴击率、暴击伤害与击破特攻；最高优先级分支选择 hybrid-direct-break；最终 `hybrid-direct-break` 不在该路径先验匹配集合中。这里仅描述生成器的分类冲突，不判断角色实际定位。

#### 人工审核 checklist

- [x] 当前 Template 是否正确？*不正确。应为 dot-dps。*
- [x] scaling stat 应为哪个 PropertyType？如不适用，请记录原因。*scaling-stat 为 ATK。*
- [x] 当前各推荐副词条权重是否合理？*不合理。*
- [x] 是否存在角色自身明确的 Hard Breakpoint？*不存在。*
- [x] 是否需要 stat target / curve？*不需要。*
- [x] 是否需要 weight override？*需要。已在表格中标出。*
- [x] 结论：接受 / 修改 / 待进一步调查。*修改。*

### 1207 · 驭空

- **Character ID：** `1207`；**命途：** 同谐（`Shaman`）；**inference confidence：** `medium`。
- **当前 inferred template：** `direct-dps`；**完整 review reasons：** `PATH_TEMPLATE_MISMATCH`。

#### 上游 Recommendation

- **Cavern 推荐（原顺序）：** 野穗伴行的快枪手（`102`）、盗匪荒漠的废土客（`112`）、流星追迹的怪盗（`111`）。
- **Planar 推荐（原顺序）：** 不老者的仙舟（`302`）、梦想之地匹诺康尼（`312`）、生命的翁瓦克（`308`）。
- **BODY 主词条：** 暴击率（`CriticalChanceBase`）。
- **FOOT 主词条：** 速度（`SpeedDelta`）。
- **NECK / Sphere 主词条：** 虚数属性伤害提高（`ImaginaryAddedRatio`）。
- **OBJECT / Rope 主词条：** 能量恢复效率（`SPRatioBase`）、攻击力（`AttackAddedRatio`）。
- **推荐副词条（原顺序）：** 速度（`SpeedDelta`）、攻击力（`AttackAddedRatio`）、暴击率（`CriticalChanceBase`）、暴击伤害（`CriticalDamageBase`）。

#### 当前 Generated Profile

| PropertyType | 中文属性名 | Weight |
| --- | --- | ---: |
| `AttackAddedRatio` | 攻击力 | ~~1~~ 0.5 |
| `CriticalChanceBase` | 暴击率 | ~~1.25~~ 0.5 |
| `CriticalDamageBase` | 暴击伤害 | ~~1.25~~ 0.5 |
| `SpeedDelta` | 速度 | ~~0.75~~ 1.25 |

- **Override：** 无。
- **已生成的 Hard Breakpoint / stat target / curve：** 0 / 0 / 0；仅供核对，未替人工补值。

#### Review reason 解释

- **`PATH_TEMPLATE_MISMATCH`：** 同谐路径先验只匹配 direct-support；同时推荐暴击率与暴击伤害；双暴分支选择 direct-dps；最终 `direct-dps` 不在该路径先验匹配集合中。这里仅描述生成器的分类冲突，不判断角色实际定位。

#### 人工审核 checklist

- [x] 当前 Template 是否正确？*不正确。应为 direct-support。*
- [x] scaling stat 应为哪个 PropertyType？如不适用，请记录原因。*scaling-stat 使用 ATK。*
- [x] 当前各推荐副词条权重是否合理？*不合理。*
- [x] 是否存在角色自身明确的 Hard Breakpoint？*不存在。*
- [x] 是否需要 stat target / curve？*不需要。*
- [x] 是否需要 weight override？*需要。已在表格中标出。*
- [x] 结论：接受 / 修改 / 待进一步调查。*修改。*

### 1215 · 寒鸦

- **Character ID：** `1215`；**命途：** 同谐（`Shaman`）；**inference confidence：** `high`。
- **当前 inferred template：** `direct-support`；**完整 review reasons：** `AMBIGUOUS_SCALING`。

#### 上游 Recommendation

- **Cavern 推荐（原顺序）：** 骇域漫游的信使（`114`）、野穗伴行的快枪手（`102`）、重循苦旅的司铎（`121`）。
- **Planar 推荐（原顺序）：** 沉陆海域露莎卡（`317`）、生命的翁瓦克（`308`）、折断的龙骨（`310`）。
- **BODY 主词条：** 生命值（`HPAddedRatio`）、防御力（`DefenceAddedRatio`）。
- **FOOT 主词条：** 速度（`SpeedDelta`）。
- **NECK / Sphere 主词条：** 生命值（`HPAddedRatio`）、防御力（`DefenceAddedRatio`）。
- **OBJECT / Rope 主词条：** 能量恢复效率（`SPRatioBase`）。
- **推荐副词条（原顺序）：** 速度（`SpeedDelta`）、效果抵抗（`StatusResistanceBase`）。

#### 当前 Generated Profile

| PropertyType | 中文属性名 | Weight |
| --- | --- | ---: |
| `SpeedDelta` | 速度 | 1.25 |
| `StatusResistanceBase` | 效果抵抗 | 0.5 |

- **Override：** 无。
- **已生成的 Hard Breakpoint / stat target / curve：** 0 / 0 / 0；仅供核对，未替人工补值。

#### Review reason 解释

- **`AMBIGUOUS_SCALING`：** 推荐副词条里没有 ATK/HP/DEF 百分比候选；推荐主词条中的 BODY：生命值（`HPAddedRatio`）、BODY：防御力（`DefenceAddedRatio`）、NECK：生命值（`HPAddedRatio`）、NECK：防御力（`DefenceAddedRatio`） 不能替推荐副词条新增 scaling 权重，因此生成器没有解析 scaling-stat。

#### 人工审核 checklist

- [x] 当前 Template 是否正确？*正确。*
- [x] scaling stat 应为哪个 PropertyType？如不适用，请记录原因。*无需 scaling-stat；寒鸦一般不参与输出。*
- [x] 当前各推荐副词条权重是否合理？*合理。*
- [x] 是否存在角色自身明确的 Hard Breakpoint？*不存在。*
- [x] 是否需要 stat target / curve？*不需要。*
- [x] 是否需要 weight override？*不需要。*
- [x] 结论：接受 / 修改 / 待进一步调查。*接受。*

### 1222 · 灵砂

- **Character ID：** `1222`；**命途：** 丰饶（`Priest`）；**inference confidence：** `medium`。
- **当前 inferred template：** `break`；**完整 review reasons：** `PATH_TEMPLATE_MISMATCH`。

#### 上游 Recommendation

- **Cavern 推荐（原顺序）：** 荡除蠹灾的铁骑（`119`）、流星追迹的怪盗（`111`）、云无留迹的过客（`101`）。
- **Planar 推荐（原顺序）：** 劫火莲灯铸炼宫（`316`）、盗贼公国塔利亚（`307`）、不老者的仙舟（`302`）。
- **BODY 主词条：** 治疗量加成（`HealRatioBase`）。
- **FOOT 主词条：** 速度（`SpeedDelta`）。
- **NECK / Sphere 主词条：** 攻击力（`AttackAddedRatio`）。
- **OBJECT / Rope 主词条：** 能量恢复效率（`SPRatioBase`）、击破特攻（`BreakDamageAddedRatioBase`）。
- **推荐副词条（原顺序）：** 击破特攻（`BreakDamageAddedRatioBase`）、速度（`SpeedDelta`）、攻击力（`AttackAddedRatio`）。

#### 当前 Generated Profile

| PropertyType | 中文属性名 | Weight |
| --- | --- | ---: |
| `AttackAddedRatio` | 攻击力 | 0.75 |
| `BreakDamageAddedRatioBase` | 击破特攻 | ~~1.25~~ 0.75 |
| `SpeedDelta` | 速度 | 1 |

- **Override：** 无。
- **已生成的 Hard Breakpoint / stat target / curve：** 0 / 0 / 0；仅供核对，未替人工补值。

#### Review reason 解释

- **`PATH_TEMPLATE_MISMATCH`：** 丰饶路径先验只匹配 sustain；推荐击破特攻且没有双暴；击破分支选择 break；最终 `break` 不在该路径先验匹配集合中。这里仅描述生成器的分类冲突，不判断角色实际定位。

#### 人工审核 checklist

- [x] 当前 Template 是否正确？*正确。但是 template 对于灵砂而言不重要。*
- [x] scaling stat 应为哪个 PropertyType？如不适用，请记录原因。*scaling-stat 使用 ATK。*
- [x] 当前各推荐副词条权重是否合理？*不合理。*
- [x] 是否存在角色自身明确的 Hard Breakpoint？*不存在。*
- [x] 是否需要 stat target / curve？*需要。break-effect 的 target 为 200%，在大于 200% 后权重降低至 0.25。*
- [x] 是否需要 weight override？*需要。已在表格中标出（均为未达到 target 时的权重；达到 target 后另行说明）。*
- [x] 结论：接受 / 修改 / 待进一步调查。*修改。*

### 1225 · 忘归人

- **Character ID：** `1225`；**命途：** 虚无（`Warlock`）；**inference confidence：** `medium`。
- **当前 inferred template：** `break`；**完整 review reasons：** `MIXED_STAT_SIGNALS`、`AMBIGUOUS_SCALING`。

#### 上游 Recommendation

- **Cavern 推荐（原顺序）：** 荡除蠹灾的铁骑（`119`）、流星追迹的怪盗（`111`）、机心戏梦的钟表匠（`118`）。
- **Planar 推荐（原顺序）：** 劫火莲灯铸炼宫（`316`）、生命的翁瓦克（`308`）、盗贼公国塔利亚（`307`）。
- **BODY 主词条：** 效果命中（`StatusProbabilityBase`）。
- **FOOT 主词条：** 速度（`SpeedDelta`）。
- **NECK / Sphere 主词条：** 生命值（`HPAddedRatio`）。
- **OBJECT / Rope 主词条：** 能量恢复效率（`SPRatioBase`）、击破特攻（`BreakDamageAddedRatioBase`）。
- **推荐副词条（原顺序）：** 击破特攻（`BreakDamageAddedRatioBase`）、速度（`SpeedDelta`）、效果命中（`StatusProbabilityBase`）。

#### 当前 Generated Profile

| PropertyType | 中文属性名 | Weight |
| --- | --- | ---: |
| `BreakDamageAddedRatioBase` | 击破特攻 | ~~1.25~~ 1 |
| `SpeedDelta` | 速度 | 1 |
| `StatusProbabilityBase` | 效果命中 | 0.25 |

- **Override：** 无。
- **已生成的 Hard Breakpoint / stat target / curve：** 0 / 0 / 0；仅供核对，未替人工补值。

#### Review reason 解释

- **`MIXED_STAT_SIGNALS`：** 同时推荐击破特攻（`BreakDamageAddedRatioBase`）与效果命中（`StatusProbabilityBase`）；生成器因此降低置信度，未据此推断战斗机制。
- **`AMBIGUOUS_SCALING`：** 推荐副词条里没有 ATK/HP/DEF 百分比候选；推荐主词条中的 NECK：生命值（`HPAddedRatio`） 不能替推荐副词条新增 scaling 权重，因此生成器没有解析 scaling-stat。

#### 人工审核 checklist

- [x] 当前 Template 是否正确？*正确。*
- [x] scaling stat 应为哪个 PropertyType？如不适用，请记录原因。*无需 scaling-stat；忘归人不依赖某个基础属性的值来输出。*
- [x] 当前各推荐副词条权重是否合理？*不合理。*
- [x] 是否存在角色自身明确的 Hard Breakpoint？*不存在。*
- [x] 是否需要 stat target / curve？*不需要。*
- [x] 是否需要 weight override？*需要，已在表格中标出。*
- [x] 结论：接受 / 修改 / 待进一步调查。*修改。*

### 1301 · 加拉赫

- **Character ID：** `1301`；**命途：** 丰饶（`Priest`）；**inference confidence：** `medium`。
- **当前 inferred template：** `break`；**完整 review reasons：** `PATH_TEMPLATE_MISMATCH`、`AMBIGUOUS_SCALING`。

#### 上游 Recommendation

- **Cavern 推荐（原顺序）：** 荡除蠹灾的铁骑（`119`）、流星追迹的怪盗（`111`）、云无留迹的过客（`101`）。
- **Planar 推荐（原顺序）：** 劫火莲灯铸炼宫（`316`）、盗贼公国塔利亚（`307`）、不老者的仙舟（`302`）。
- **BODY 主词条：** 治疗量加成（`HealRatioBase`）。
- **FOOT 主词条：** 速度（`SpeedDelta`）。
- **NECK / Sphere 主词条：** 生命值（`HPAddedRatio`）、防御力（`DefenceAddedRatio`）。
- **OBJECT / Rope 主词条：** 击破特攻（`BreakDamageAddedRatioBase`）、能量恢复效率（`SPRatioBase`）。
- **推荐副词条（原顺序）：** 速度（`SpeedDelta`）、击破特攻（`BreakDamageAddedRatioBase`）、效果抵抗（`StatusResistanceBase`）。

#### 当前 Generated Profile

| PropertyType | 中文属性名 | Weight |
| --- | --- | ---: |
| `BreakDamageAddedRatioBase` | 击破特攻 | 1.25 |
| `SpeedDelta` | 速度 | 1 |
| `StatusResistanceBase` | 效果抵抗 | 0.25 |

- **Override：** 无。
- **已生成的 Hard Breakpoint / stat target / curve：** 0 / 0 / 0；仅供核对，未替人工补值。

#### Review reason 解释

- **`PATH_TEMPLATE_MISMATCH`：** 丰饶路径先验只匹配 sustain；推荐击破特攻且没有双暴；击破分支选择 break；最终 `break` 不在该路径先验匹配集合中。这里仅描述生成器的分类冲突，不判断角色实际定位。
- **`AMBIGUOUS_SCALING`：** 推荐副词条里没有 ATK/HP/DEF 百分比候选；推荐主词条中的 NECK：生命值（`HPAddedRatio`）、NECK：防御力（`DefenceAddedRatio`） 不能替推荐副词条新增 scaling 权重，因此生成器没有解析 scaling-stat。

#### 人工审核 checklist

- [x] 当前 Template 是否正确？*正确。*
- [x] scaling stat 应为哪个 PropertyType？如不适用，请记录原因。*无需 scaling-stat；加拉赫的治疗量为固定数值，不依赖于某个 stat。*
- [x] 当前各推荐副词条权重是否合理？*合理。*
- [x] 是否存在角色自身明确的 Hard Breakpoint？*不存在。*
- [x] 是否需要 stat target / curve？*需要。break-effect 在达到 150% 后权重降低至 0.25。*
- [x] 是否需要 weight override？*不需要。*
- [x] 结论：接受 / 修改 / 待进一步调查。*接受。*

### 1303 · 阮•梅

- **Character ID：** `1303`；**命途：** 同谐（`Shaman`）；**inference confidence：** `medium`。
- **当前 inferred template：** `break`；**完整 review reasons：** `PATH_TEMPLATE_MISMATCH`、`AMBIGUOUS_SCALING`。

#### 上游 Recommendation

- **Cavern 推荐（原顺序）：** 机心戏梦的钟表匠（`118`）、流星追迹的怪盗（`111`）、骇域漫游的信使（`114`）。
- **Planar 推荐（原顺序）：** 盗贼公国塔利亚（`307`）、梦想之地匹诺康尼（`312`）、生命的翁瓦克（`308`）。
- **BODY 主词条：** 生命值（`HPAddedRatio`）、防御力（`DefenceAddedRatio`）。
- **FOOT 主词条：** 速度（`SpeedDelta`）。
- **NECK / Sphere 主词条：** 生命值（`HPAddedRatio`）、防御力（`DefenceAddedRatio`）。
- **OBJECT / Rope 主词条：** 击破特攻（`BreakDamageAddedRatioBase`）、能量恢复效率（`SPRatioBase`）。
- **推荐副词条（原顺序）：** 击破特攻（`BreakDamageAddedRatioBase`）、速度（`SpeedDelta`）、效果抵抗（`StatusResistanceBase`）。

#### 当前 Generated Profile

| PropertyType | 中文属性名 | Weight |
| --- | --- | ---: |
| `BreakDamageAddedRatioBase` | 击破特攻 | 1.25 |
| `SpeedDelta` | 速度 | 1 |
| `StatusResistanceBase` | 效果抵抗 | 0.25 |

- **Override：** 无。
- **已生成的 Hard Breakpoint / stat target / curve：** 0 / 0 / 0；仅供核对，未替人工补值。

#### Review reason 解释

- **`PATH_TEMPLATE_MISMATCH`：** 同谐路径先验只匹配 direct-support；推荐击破特攻且没有双暴；击破分支选择 break；最终 `break` 不在该路径先验匹配集合中。这里仅描述生成器的分类冲突，不判断角色实际定位。
- **`AMBIGUOUS_SCALING`：** 推荐副词条里没有 ATK/HP/DEF 百分比候选；推荐主词条中的 BODY：生命值（`HPAddedRatio`）、BODY：防御力（`DefenceAddedRatio`）、NECK：生命值（`HPAddedRatio`）、NECK：防御力（`DefenceAddedRatio`） 不能替推荐副词条新增 scaling 权重，因此生成器没有解析 scaling-stat。

#### 人工审核 checklist

- [x] 当前 Template 是否正确？*正确。*
- [x] scaling stat 应为哪个 PropertyType？如不适用，请记录原因。*不需要 scaling-stat；阮梅几乎不参与输出。*
- [x] 当前各推荐副词条权重是否合理？*合理。*
- [x] 是否存在角色自身明确的 Hard Breakpoint？*不存在。*
- [x] 是否需要 stat target / curve？*需要。break-effect 在达到 180% 后权重降低至 0.25。*
- [x] 是否需要 weight override？*不需要。*
- [x] 结论：接受 / 修改 / 待进一步调查。*接受。*

### 1304 · 砂金

- **Character ID：** `1304`；**命途：** 存护（`Knight`）；**inference confidence：** `medium`。
- **当前 inferred template：** `direct-dps`；**完整 review reasons：** `PATH_TEMPLATE_MISMATCH`。

#### 上游 Recommendation

- **Cavern 推荐（原顺序）：** 净庭教宗的圣骑士（`103`）、自匿星芒的隐士（`128`）、死水深潜的先驱（`117`）。
- **Planar 推荐（原顺序）：** 停转的萨尔索图（`306`）、筑城者的贝洛伯格（`304`）、折断的龙骨（`310`）。
- **BODY 主词条：** 防御力（`DefenceAddedRatio`）、暴击伤害（`CriticalDamageBase`）。
- **FOOT 主词条：** 防御力（`DefenceAddedRatio`）、速度（`SpeedDelta`）。
- **NECK / Sphere 主词条：** 防御力（`DefenceAddedRatio`）、虚数属性伤害提高（`ImaginaryAddedRatio`）。
- **OBJECT / Rope 主词条：** 防御力（`DefenceAddedRatio`）。
- **推荐副词条（原顺序）：** 防御力（`DefenceAddedRatio`）、暴击率（`CriticalChanceBase`）、暴击伤害（`CriticalDamageBase`）、速度（`SpeedDelta`）。

#### 当前 Generated Profile

| PropertyType | 中文属性名 | Weight |
| --- | --- | ---: |
| `CriticalChanceBase` | 暴击率 | ~~1.25~~ 0.5 |
| `CriticalDamageBase` | 暴击伤害 | ~~1.25~~ 0.5 |
| `DefenceAddedRatio` | 防御力 | 1 |
| `SpeedDelta` | 速度 | 0.75 |

- **Override：** 无。
- **已生成的 Hard Breakpoint / stat target / curve：** 0 / 0 / 0；仅供核对，未替人工补值。

#### Review reason 解释

- **`PATH_TEMPLATE_MISMATCH`：** 存护路径先验只匹配 sustain；同时推荐暴击率与暴击伤害；双暴分支选择 direct-dps；最终 `direct-dps` 不在该路径先验匹配集合中。这里仅描述生成器的分类冲突，不判断角色实际定位。

#### 人工审核 checklist

- [x] 当前 Template 是否正确？*不正确。砂金是生存位。*
- [x] scaling stat 应为哪个 PropertyType？如不适用，请记录原因。*scaling-stat 使用 DEF。*
- [x] 当前各推荐副词条权重是否合理？*不合理。*
- [x] 是否存在角色自身明确的 Hard Breakpoint？*不存在。*
- [x] 是否需要 stat target / curve？*需要。DEF 在达到 4000 之后，权重降低至 0.25。*
- [x] 是否需要 weight override？*需要。已在表格中标出。*
- [x] 结论：接受 / 修改 / 待进一步调查。*修改。*

### 1306 · 花火

- **Character ID：** `1306`；**命途：** 同谐（`Shaman`）；**inference confidence：** `medium`。
- **当前 inferred template：** `direct-support`；**完整 review reasons：** `MIXED_STAT_SIGNALS`、`AMBIGUOUS_SCALING`。

#### 上游 Recommendation

- **Cavern 推荐（原顺序）：** 重循苦旅的司铎（`121`）、骇域漫游的信使（`114`）、晨昏交界的翔鹰（`110`）。
- **Planar 推荐（原顺序）：** 沉陆海域露莎卡（`317`）、折断的龙骨（`310`）、梦想之地匹诺康尼（`312`）。
- **BODY 主词条：** 暴击伤害（`CriticalDamageBase`）。
- **FOOT 主词条：** 速度（`SpeedDelta`）。
- **NECK / Sphere 主词条：** 生命值（`HPAddedRatio`）、防御力（`DefenceAddedRatio`）。
- **OBJECT / Rope 主词条：** 能量恢复效率（`SPRatioBase`）。
- **推荐副词条（原顺序）：** 暴击伤害（`CriticalDamageBase`）、速度（`SpeedDelta`）、效果抵抗（`StatusResistanceBase`）。

#### 当前 Generated Profile

| PropertyType | 中文属性名 | Weight |
| --- | --- | ---: |
| `CriticalDamageBase` | 暴击伤害 | 1 |
| `SpeedDelta` | 速度 | 1.25 |
| `StatusResistanceBase` | 效果抵抗 | 0.5 |

- **Override：** 无。
- **已生成的 Hard Breakpoint / stat target / curve：** 0 / 0 / 0；仅供核对，未替人工补值。

#### Review reason 解释

- **`MIXED_STAT_SIGNALS`：** 双暴只出现一项：暴击伤害（`CriticalDamageBase`）；生成器因此降低置信度，未据此推断战斗机制。
- **`AMBIGUOUS_SCALING`：** 推荐副词条里没有 ATK/HP/DEF 百分比候选；推荐主词条中的 NECK：生命值（`HPAddedRatio`）、NECK：防御力（`DefenceAddedRatio`） 不能替推荐副词条新增 scaling 权重，因此生成器没有解析 scaling-stat。

#### 人工审核 checklist

- [x] 当前 Template 是否正确？*正确。*
- [x] scaling stat 应为哪个 PropertyType？如不适用，请记录原因。*无需 scaling-stat；花火不参与输出。*
- [x] 当前各推荐副词条权重是否合理？*合理。*
- [x] 是否存在角色自身明确的 Hard Breakpoint？*不存在。*
- [x] 是否需要 stat target / curve？*不需要。*
- [x] 是否需要 weight override？*不需要。*
- [x] 结论：接受 / 修改 / 待进一步调查。*接受。*

### 1313 · 星期日

- **Character ID：** `1313`；**命途：** 同谐（`Shaman`）；**inference confidence：** `medium`。
- **当前 inferred template：** `direct-support`；**完整 review reasons：** `MIXED_STAT_SIGNALS`、`AMBIGUOUS_SCALING`。

#### 上游 Recommendation

- **Cavern 推荐（原顺序）：** 重循苦旅的司铎（`121`）、骇域漫游的信使（`114`）、晨昏交界的翔鹰（`110`）。
- **Planar 推荐（原顺序）：** 沉陆海域露莎卡（`317`）、折断的龙骨（`310`）、生命的翁瓦克（`308`）。
- **BODY 主词条：** 暴击伤害（`CriticalDamageBase`）。
- **FOOT 主词条：** 速度（`SpeedDelta`）。
- **NECK / Sphere 主词条：** 生命值（`HPAddedRatio`）、防御力（`DefenceAddedRatio`）。
- **OBJECT / Rope 主词条：** 能量恢复效率（`SPRatioBase`）。
- **推荐副词条（原顺序）：** 暴击伤害（`CriticalDamageBase`）、速度（`SpeedDelta`）、效果抵抗（`StatusResistanceBase`）。

#### 当前 Generated Profile

| PropertyType | 中文属性名 | Weight |
| --- | --- | ---: |
| `CriticalDamageBase` | 暴击伤害 | 1 |
| `SpeedDelta` | 速度 | 1.25 |
| `StatusResistanceBase` | 效果抵抗 | 0.5 |

- **Override：** 无。
- **已生成的 Hard Breakpoint / stat target / curve：** 0 / 0 / 0；仅供核对，未替人工补值。

#### Review reason 解释

- **`MIXED_STAT_SIGNALS`：** 双暴只出现一项：暴击伤害（`CriticalDamageBase`）；生成器因此降低置信度，未据此推断战斗机制。
- **`AMBIGUOUS_SCALING`：** 推荐副词条里没有 ATK/HP/DEF 百分比候选；推荐主词条中的 NECK：生命值（`HPAddedRatio`）、NECK：防御力（`DefenceAddedRatio`） 不能替推荐副词条新增 scaling 权重，因此生成器没有解析 scaling-stat。

#### 人工审核 checklist

- [x] 当前 Template 是否正确？*正确。*
- [x] scaling stat 应为哪个 PropertyType？如不适用，请记录原因。*不需要 scaling-stat；星期日不参与输出。*
- [x] 当前各推荐副词条权重是否合理？*合理。*
- [x] 是否存在角色自身明确的 Hard Breakpoint？*不存在。*
- [x] 是否需要 stat target / curve？*不需要。*
- [x] 是否需要 weight override？*不需要。*
- [x] 结论：接受 / 修改 / 待进一步调查。*接受。*

### 1321 · 大丽花

- **Character ID：** `1321`；**命途：** 虚无（`Warlock`）；**inference confidence：** `high`。
- **当前 inferred template：** `break`；**完整 review reasons：** `AMBIGUOUS_SCALING`。

#### 上游 Recommendation

- **Cavern 推荐（原顺序）：** 荡除蠹灾的铁骑（`119`）、流星追迹的怪盗（`111`）、机心戏梦的钟表匠（`118`）。
- **Planar 推荐（原顺序）：** 劫火莲灯铸炼宫（`316`）、生命的翁瓦克（`308`）、盗贼公国塔利亚（`307`）。
- **BODY 主词条：** 生命值（`HPAddedRatio`）、防御力（`DefenceAddedRatio`）。
- **FOOT 主词条：** 速度（`SpeedDelta`）。
- **NECK / Sphere 主词条：** 生命值（`HPAddedRatio`）、防御力（`DefenceAddedRatio`）。
- **OBJECT / Rope 主词条：** 击破特攻（`BreakDamageAddedRatioBase`）、能量恢复效率（`SPRatioBase`）。
- **推荐副词条（原顺序）：** 击破特攻（`BreakDamageAddedRatioBase`）、速度（`SpeedDelta`）。

#### 当前 Generated Profile

| PropertyType | 中文属性名 | Weight |
| --- | --- | ---: |
| `BreakDamageAddedRatioBase` | 击破特攻 | 1.25 |
| `SpeedDelta` | 速度 | 1 |

- **Override：** 无。
- **已生成的 Hard Breakpoint / stat target / curve：** 0 / 0 / 0；仅供核对，未替人工补值。

#### Review reason 解释

- **`AMBIGUOUS_SCALING`：** 推荐副词条里没有 ATK/HP/DEF 百分比候选；推荐主词条中的 BODY：生命值（`HPAddedRatio`）、BODY：防御力（`DefenceAddedRatio`）、NECK：生命值（`HPAddedRatio`）、NECK：防御力（`DefenceAddedRatio`） 不能替推荐副词条新增 scaling 权重，因此生成器没有解析 scaling-stat。

#### 人工审核 checklist

- [x] 当前 Template 是否正确？*正确。*
- [x] scaling stat 应为哪个 PropertyType？如不适用，请记录原因。*无需 scaling-stat；击破出伤不依赖基础属性。*
- [x] 当前各推荐副词条权重是否合理？*合理。*
- [x] 是否存在角色自身明确的 Hard Breakpoint？*不存在。*
- [x] 是否需要 stat target / curve？*不需要。*
- [x] 是否需要 weight override？*不需要。*
- [x] 结论：接受 / 修改 / 待进一步调查。*接受。*

### 1402 · 阿格莱雅

- **Character ID：** `1402`；**命途：** 记忆（`Memory`）；**inference confidence：** `low`。
- **当前 inferred template：** `direct-dps`；**完整 review reasons：** `SPECIAL_PATH`、`PATH_TEMPLATE_MISMATCH`。

#### 上游 Recommendation

- **Cavern 推荐（原顺序）：** 凯歌祝捷的英豪（`123`）、野穗伴行的快枪手（`102`）、激奏雷电的乐队（`109`）。
- **Planar 推荐（原顺序）：** 奇想蕉乐园（`318`）、不老者的仙舟（`302`）、太空封印站（`301`）。
- **BODY 主词条：** 暴击率（`CriticalChanceBase`）、暴击伤害（`CriticalDamageBase`）。
- **FOOT 主词条：** 速度（`SpeedDelta`）。
- **NECK / Sphere 主词条：** 雷属性伤害提高（`ThunderAddedRatio`）。
- **OBJECT / Rope 主词条：** 能量恢复效率（`SPRatioBase`）、攻击力（`AttackAddedRatio`）。
- **推荐副词条（原顺序）：** 暴击率（`CriticalChanceBase`）、暴击伤害（`CriticalDamageBase`）、攻击力（`AttackAddedRatio`）、速度（`SpeedDelta`）。

#### 当前 Generated Profile

| PropertyType | 中文属性名 | Weight |
| --- | --- | ---: |
| `AttackAddedRatio` | 攻击力 | ~~1~~ 0.75 |
| `CriticalChanceBase` | 暴击率 | 1.25 |
| `CriticalDamageBase` | 暴击伤害 | 1.25 |
| `SpeedDelta` | 速度 | ~~0.75~~ 1 |

- **Override：** 无。
- **已生成的 Hard Breakpoint / stat target / curve：** 0 / 0 / 0；仅供核对，未替人工补值。

#### Review reason 解释

- **`SPECIAL_PATH`：** 当前命途为 记忆（`Memory`）；生成器没有针对该特殊命途的专用机制分类，只将 inference confidence 降为 low，保留当前模板候选供人工复核。
- **`PATH_TEMPLATE_MISMATCH`：** 生成器没有为 Memory 设置匹配模板集合；同时推荐暴击率与暴击伤害；双暴分支选择 direct-dps；最终 `direct-dps` 不在该路径先验匹配集合中。这里仅描述生成器的分类冲突，不判断角色实际定位。

#### 人工审核 checklist

- [x] 当前 Template 是否正确？*正确。*
- [x] scaling stat 应为哪个 PropertyType？如不适用，请记录原因。*scaling-stat 为 ATK。*
- [x] 当前各推荐副词条权重是否合理？*不合理。*
- [x] 是否存在角色自身明确的 Hard Breakpoint？*不存在。*
- [x] 是否需要 stat target / curve？*不需要。*
- [x] 是否需要 weight override？*需要，已在表格中标出。*
- [x] 结论：接受 / 修改 / 待进一步调查。*修改。*

### 1403 · 缇宝

- **Character ID：** `1403`；**命途：** 同谐（`Shaman`）；**inference confidence：** `medium`。
- **当前 inferred template：** `direct-dps`；**完整 review reasons：** `PATH_TEMPLATE_MISMATCH`。

#### 上游 Recommendation

- **Cavern 推荐（原顺序）：** 哀歌覆国的诗人（`124`）、繁星璀璨的天才（`108`）、野穗伴行的快枪手（`102`）。
- **Planar 推荐（原顺序）：** 谧宁拾骨地（`319`）、不老者的仙舟（`302`）、沉陆海域露莎卡（`317`）。
- **BODY 主词条：** 暴击伤害（`CriticalDamageBase`）、暴击率（`CriticalChanceBase`）。
- **FOOT 主词条：** 生命值（`HPAddedRatio`）。
- **NECK / Sphere 主词条：** 量子属性伤害提高（`QuantumAddedRatio`）、生命值（`HPAddedRatio`）。
- **OBJECT / Rope 主词条：** 能量恢复效率（`SPRatioBase`）、生命值（`HPAddedRatio`）。
- **推荐副词条（原顺序）：** 暴击率（`CriticalChanceBase`）、暴击伤害（`CriticalDamageBase`）、生命值（`HPAddedRatio`）。

#### 当前 Generated Profile

| PropertyType | 中文属性名 | Weight |
| --- | --- | ---: |
| `CriticalChanceBase` | 暴击率 | ~~1.25~~ 0.5 |
| `CriticalDamageBase` | 暴击伤害 | ~~1.25~~ 0.5 |
| `HPAddedRatio` | 生命值 | 1 |

- **Override：** 无。
- **已生成的 Hard Breakpoint / stat target / curve：** 0 / 0 / 0；仅供核对，未替人工补值。

#### Review reason 解释

- **`PATH_TEMPLATE_MISMATCH`：** 同谐路径先验只匹配 direct-support；同时推荐暴击率与暴击伤害；双暴分支选择 direct-dps；最终 `direct-dps` 不在该路径先验匹配集合中。这里仅描述生成器的分类冲突，不判断角色实际定位。

#### 人工审核 checklist

- [x] 当前 Template 是否正确？*不正确。应为 direct-support。*
- [x] scaling stat 应为哪个 PropertyType？如不适用，请记录原因。*scaling-stat 是 HP。*
- [x] 当前各推荐副词条权重是否合理？*不合理。*
- [x] 是否存在角色自身明确的 Hard Breakpoint？*不存在。*
- [x] 是否需要 stat target / curve？*不需要。*
- [x] 是否需要 weight override？*需要，已在表格中标出。*
- [x] 结论：接受 / 修改 / 待进一步调查。*修改。*

### 1407 · 遐蝶

- **Character ID：** `1407`；**命途：** 记忆（`Memory`）；**inference confidence：** `low`。
- **当前 inferred template：** `direct-dps`；**完整 review reasons：** `SPECIAL_PATH`、`PATH_TEMPLATE_MISMATCH`。

#### 上游 Recommendation

- **Cavern 推荐（原顺序）：** 哀歌覆国的诗人（`124`）、繁星璀璨的天才（`108`）、宝命长存的莳者（`113`）。
- **Planar 推荐（原顺序）：** 谧宁拾骨地（`319`）、不老者的仙舟（`302`）、奇想蕉乐园（`318`）。
- **BODY 主词条：** 暴击伤害（`CriticalDamageBase`）。
- **FOOT 主词条：** 生命值（`HPAddedRatio`）。
- **NECK / Sphere 主词条：** 量子属性伤害提高（`QuantumAddedRatio`）、生命值（`HPAddedRatio`）。
- **OBJECT / Rope 主词条：** 生命值（`HPAddedRatio`）。
- **推荐副词条（原顺序）：** 暴击率（`CriticalChanceBase`）、暴击伤害（`CriticalDamageBase`）、生命值（`HPAddedRatio`）。

#### 当前 Generated Profile

| PropertyType | 中文属性名 | Weight |
| --- | --- | ---: |
| `CriticalChanceBase` | 暴击率 | 1.25 |
| `CriticalDamageBase` | 暴击伤害 | 1.25 |
| `HPAddedRatio` | 生命值 | 1 |

- **Override：** 无。
- **已生成的 Hard Breakpoint / stat target / curve：** 0 / 0 / 0；仅供核对，未替人工补值。

#### Review reason 解释

- **`SPECIAL_PATH`：** 当前命途为 记忆（`Memory`）；生成器没有针对该特殊命途的专用机制分类，只将 inference confidence 降为 low，保留当前模板候选供人工复核。
- **`PATH_TEMPLATE_MISMATCH`：** 生成器没有为 Memory 设置匹配模板集合；同时推荐暴击率与暴击伤害；双暴分支选择 direct-dps；最终 `direct-dps` 不在该路径先验匹配集合中。这里仅描述生成器的分类冲突，不判断角色实际定位。

#### 人工审核 checklist

- [x] 当前 Template 是否正确？*正确。*
- [x] scaling stat 应为哪个 PropertyType？如不适用，请记录原因。*scaling-stat 是 HP。*
- [x] 当前各推荐副词条权重是否合理？*合理。*
- [x] 是否存在角色自身明确的 Hard Breakpoint？*不存在。*
- [x] 是否需要 stat target / curve？*不需要。*
- [x] 是否需要 weight override？*不需要。*
- [x] 结论：接受 / 修改 / 待进一步调查。*接受。*

### 1409 · 风堇

- **Character ID：** `1409`；**命途：** 记忆（`Memory`）；**inference confidence：** `low`。
- **当前 inferred template：** `direct-dps`；**完整 review reasons：** `SPECIAL_PATH`、`MIXED_STAT_SIGNALS`、`PATH_TEMPLATE_MISMATCH`。

#### 上游 Recommendation

- **Cavern 推荐（原顺序）：** 烈阳惊雷的女武神（`125`）、云无留迹的过客（`101`）、骇域漫游的信使（`114`）。
- **Planar 推荐（原顺序）：** 渊思寂虑的巨树（`320`）、不老者的仙舟（`302`）、生命的翁瓦克（`308`）。
- **BODY 主词条：** 治疗量加成（`HealRatioBase`）。
- **FOOT 主词条：** 速度（`SpeedDelta`）。
- **NECK / Sphere 主词条：** 生命值（`HPAddedRatio`）。
- **OBJECT / Rope 主词条：** 能量恢复效率（`SPRatioBase`）、生命值（`HPAddedRatio`）。
- **推荐副词条（原顺序）：** 生命值（`HPAddedRatio`）、速度（`SpeedDelta`）、效果抵抗（`StatusResistanceBase`）、暴击伤害（`CriticalDamageBase`）。

#### 当前 Generated Profile

| PropertyType | 中文属性名 | Weight |
| --- | --- | ---: |
| `CriticalDamageBase` | 暴击伤害 | ~~1.25~~ 0.5 |
| `HPAddedRatio` | 生命值 | ~~1~~ 0.75 |
| `SpeedDelta` | 速度 | ~~0.75~~ 1.25 |
| `StatusResistanceBase` | 效果抵抗 | 0.25 |

- **Override：** 无。
- **已生成的 Hard Breakpoint / stat target / curve：** 0 / 0 / 0；仅供核对，未替人工补值。

#### Review reason 解释

- **`SPECIAL_PATH`：** 当前命途为 记忆（`Memory`）；生成器没有针对该特殊命途的专用机制分类，只将 inference confidence 降为 low，保留当前模板候选供人工复核。
- **`MIXED_STAT_SIGNALS`：** 双暴只出现一项：暴击伤害（`CriticalDamageBase`）；生成器因此降低置信度，未据此推断战斗机制。
- **`PATH_TEMPLATE_MISMATCH`：** 生成器没有为 Memory 设置匹配模板集合；前面属性和路径分支未命中；最终回退为 direct-dps；最终 `direct-dps` 不在该路径先验匹配集合中。这里仅描述生成器的分类冲突，不判断角色实际定位。

#### 人工审核 checklist

- [x] 当前 Template 是否正确？*不正确。风堇是生存位。*
- [x] scaling stat 应为哪个 PropertyType？如不适用，请记录原因。*scaling-stat 是 HP。*
- [x] 当前各推荐副词条权重是否合理？*不合理。*
- [x] 是否存在角色自身明确的 Hard Breakpoint？*存在。SPD 有明确的 breakpoint 为 200。*
- [x] 是否需要 stat target / curve？*需要。effect-res 的 target 为 50%，达到 target 之后权重降低为 0（继续增加没有任何收益）。其余属性不设置 target 或者 curve。*
- [x] 是否需要 weight override？*需要。已在表格中标出。*
- [x] 结论：接受 / 修改 / 待进一步调查。*修改。*

### 1412 · 刻律德菈

- **Character ID：** `1412`；**命途：** 同谐（`Shaman`）；**inference confidence：** `medium`。
- **当前 inferred template：** `direct-support`；**完整 review reasons：** `MIXED_STAT_SIGNALS`。

#### 上游 Recommendation

- **Cavern 推荐（原顺序）：** 重循苦旅的司铎（`121`）、晨昏交界的翔鹰（`110`）、野穗伴行的快枪手（`102`）。
- **Planar 推荐（原顺序）：** 沉陆海域露莎卡（`317`）、不老者的仙舟（`302`）、太空封印站（`301`）。
- **BODY 主词条：** 攻击力（`AttackAddedRatio`）。
- **FOOT 主词条：** 速度（`SpeedDelta`）、攻击力（`AttackAddedRatio`）。
- **NECK / Sphere 主词条：** 攻击力（`AttackAddedRatio`）。
- **OBJECT / Rope 主词条：** 能量恢复效率（`SPRatioBase`）、攻击力（`AttackAddedRatio`）。
- **推荐副词条（原顺序）：** 攻击力（`AttackAddedRatio`）、速度（`SpeedDelta`）、暴击伤害（`CriticalDamageBase`）。

#### 当前 Generated Profile

| PropertyType | 中文属性名 | Weight |
| --- | --- | ---: |
| `AttackAddedRatio` | 攻击力 | ~~0.75~~ 1 |
| `CriticalDamageBase` | 暴击伤害 | ~~1~~ 0.75 |
| `SpeedDelta` | 速度 | ~~1.25~~ 1 |

- **Override：** 无。
- **已生成的 Hard Breakpoint / stat target / curve：** 0 / 0 / 0；仅供核对，未替人工补值。

#### Review reason 解释

- **`MIXED_STAT_SIGNALS`：** 双暴只出现一项：暴击伤害（`CriticalDamageBase`）；生成器因此降低置信度，未据此推断战斗机制。

#### 人工审核 checklist

- [x] 当前 Template 是否正确？*正确。*
- [x] scaling stat 应为哪个 PropertyType？如不适用，请记录原因。*scaling-stat 为 ATK。*
- [x] 当前各推荐副词条权重是否合理？*不合理。*
- [x] 是否存在角色自身明确的 Hard Breakpoint？*不存在。*
- [x] 是否需要 stat target / curve？*需要。ATK 的 target 为 4000，达到 target 后权重降低至 0.25。*
- [x] 是否需要 weight override？*需要。已在表格中标出。*
- [x] 结论：接受 / 修改 / 待进一步调查。*修改。*

### 1413 · 长夜月

- **Character ID：** `1413`；**命途：** 记忆（`Memory`）；**inference confidence：** `low`。
- **当前 inferred template：** `direct-dps`；**完整 review reasons：** `SPECIAL_PATH`、`PATH_TEMPLATE_MISMATCH`。

#### 上游 Recommendation

- **Cavern 推荐（原顺序）：** 再创天地的救世主（`127`）、密林卧雪的猎人（`104`）、宝命长存的莳者（`113`）。
- **Planar 推荐（原顺序）：** 谧宁拾骨地（`319`）、妖精织梦的乐园（`321`）、奇想蕉乐园（`318`）。
- **BODY 主词条：** 暴击伤害（`CriticalDamageBase`）、暴击率（`CriticalChanceBase`）。
- **FOOT 主词条：** 速度（`SpeedDelta`）、生命值（`HPAddedRatio`）。
- **NECK / Sphere 主词条：** 冰属性伤害提高（`IceAddedRatio`）、生命值（`HPAddedRatio`）。
- **OBJECT / Rope 主词条：** 生命值（`HPAddedRatio`）。
- **推荐副词条（原顺序）：** 暴击率（`CriticalChanceBase`）、暴击伤害（`CriticalDamageBase`）、速度（`SpeedDelta`）、生命值（`HPAddedRatio`）。

#### 当前 Generated Profile

| PropertyType | 中文属性名 | Weight |
| --- | --- | ---: |
| `CriticalChanceBase` | 暴击率 | 1.25 |
| `CriticalDamageBase` | 暴击伤害 | 1.25 |
| `HPAddedRatio` | 生命值 | 1 |
| `SpeedDelta` | 速度 | ~~0.75~~ 0.25 |

- **Override：** 无。
- **已生成的 Hard Breakpoint / stat target / curve：** 0 / 0 / 0；仅供核对，未替人工补值。

#### Review reason 解释

- **`SPECIAL_PATH`：** 当前命途为 记忆（`Memory`）；生成器没有针对该特殊命途的专用机制分类，只将 inference confidence 降为 low，保留当前模板候选供人工复核。
- **`PATH_TEMPLATE_MISMATCH`：** 生成器没有为 Memory 设置匹配模板集合；同时推荐暴击率与暴击伤害；双暴分支选择 direct-dps；最终 `direct-dps` 不在该路径先验匹配集合中。这里仅描述生成器的分类冲突，不判断角色实际定位。

#### 人工审核 checklist

- [x] 当前 Template 是否正确？*正确。*
- [x] scaling stat 应为哪个 PropertyType？如不适用，请记录原因。*scaling-stat 是 HP。*
- [x] 当前各推荐副词条权重是否合理？*不合理。*
- [x] 是否存在角色自身明确的 Hard Breakpoint？*不存在。*
- [x] 是否需要 stat target / curve？*需要。crit-rate 的 target 为 65%，达到 target 后权重降低为 0（此后暴击率溢出了，无收益）。*
- [x] 是否需要 weight override？*需要，已在表格中标出。*
- [x] 结论：接受 / 修改 / 待进一步调查。*修改。*

### 1415 · 昔涟

- **Character ID：** `1415`；**命途：** 记忆（`Memory`）；**inference confidence：** `low`。
- **当前 inferred template：** `direct-dps`；**完整 review reasons：** `SPECIAL_PATH`、`PATH_TEMPLATE_MISMATCH`。

#### 上游 Recommendation

- **Cavern 推荐（原顺序）：** 再创天地的救世主（`127`）、骇域漫游的信使（`114`）、凯歌祝捷的英豪（`123`）。
- **Planar 推荐（原顺序）：** 永恒之地翁法罗斯（`323`）、谧宁拾骨地（`319`）、渊思寂虑的巨树（`320`）。
- **BODY 主词条：** 暴击伤害（`CriticalDamageBase`）。
- **FOOT 主词条：** 速度（`SpeedDelta`）。
- **NECK / Sphere 主词条：** 生命值（`HPAddedRatio`）、冰属性伤害提高（`IceAddedRatio`）。
- **OBJECT / Rope 主词条：** 生命值（`HPAddedRatio`）。
- **推荐副词条（原顺序）：** 速度（`SpeedDelta`）、暴击伤害（`CriticalDamageBase`）、暴击率（`CriticalChanceBase`）、生命值（`HPAddedRatio`）。

#### 当前 Generated Profile

| PropertyType | 中文属性名 | Weight |
| --- | --- | ---: |
| `CriticalChanceBase` | 暴击率 | ~~1.25~~ 0.75 |
| `CriticalDamageBase` | 暴击伤害 | ~~1.25~~ 0.5 |
| `HPAddedRatio` | 生命值 | ~~1~~ 0.75 |
| `SpeedDelta` | 速度 | ~~0.75~~ 1.25 |

- **Override：** 无。
- **已生成的 Hard Breakpoint / stat target / curve：** 0 / 0 / 0；仅供核对，未替人工补值。

#### Review reason 解释

- **`SPECIAL_PATH`：** 当前命途为 记忆（`Memory`）；生成器没有针对该特殊命途的专用机制分类，只将 inference confidence 降为 low，保留当前模板候选供人工复核。
- **`PATH_TEMPLATE_MISMATCH`：** 生成器没有为 Memory 设置匹配模板集合；同时推荐暴击率与暴击伤害；双暴分支选择 direct-dps；最终 `direct-dps` 不在该路径先验匹配集合中。这里仅描述生成器的分类冲突，不判断角色实际定位。

#### 人工审核 checklist

- [x] 当前 Template 是否正确？*不正确，但是昔涟的 template 不重要。*
- [x] scaling stat 应为哪个 PropertyType？如不适用，请记录原因。*scaling-stat 为 HP。*
- [x] 当前各推荐副词条权重是否合理？*不合理。*
- [x] 是否存在角色自身明确的 Hard Breakpoint？*存在。SPD 的 breakpoint 为 180。*
- [x] 是否需要 stat target / curve？*需要。crit-rate 的 target 为 50%，达到 target 之后权重降低为 0。*
- [x] 是否需要 weight override？*需要，已在表格中标出。*
- [x] 结论：接受 / 修改 / 待进一步调查。*修改。*

### 1501 · 火花

- **Character ID：** `1501`；**命途：** 欢愉（`Elation`）；**inference confidence：** `low`。
- **当前 inferred template：** `direct-dps`；**完整 review reasons：** `SPECIAL_PATH`、`PATH_TEMPLATE_MISMATCH`。

#### 上游 Recommendation

- **Cavern 推荐（原顺序）：** 闪耀功勋的魔法少女（`129`）、恶海逐波的船长（`126`）。
- **Planar 推荐（原顺序）：** 天国@直播间（`324`）、奇想蕉乐园（`318`）、繁星竞技场（`309`）。
- **BODY 主词条：** 暴击率（`CriticalChanceBase`）、暴击伤害（`CriticalDamageBase`）。
- **FOOT 主词条：** 攻击力（`AttackAddedRatio`）。
- **NECK / Sphere 主词条：** 攻击力（`AttackAddedRatio`）。
- **OBJECT / Rope 主词条：** 攻击力（`AttackAddedRatio`）、能量恢复效率（`SPRatioBase`）。
- **推荐副词条（原顺序）：** 暴击率（`CriticalChanceBase`）、暴击伤害（`CriticalDamageBase`）、攻击力（`AttackAddedRatio`）。

#### 当前 Generated Profile

| PropertyType | 中文属性名 | Weight |
| --- | --- | ---: |
| `AttackAddedRatio` | 攻击力 | 1 |
| `CriticalChanceBase` | 暴击率 | 1.25 |
| `CriticalDamageBase` | 暴击伤害 | 1.25 |

- **Override：** 无。
- **已生成的 Hard Breakpoint / stat target / curve：** 0 / 0 / 0；仅供核对，未替人工补值。

#### Review reason 解释

- **`SPECIAL_PATH`：** 当前命途为 欢愉（`Elation`）；生成器没有针对该特殊命途的专用机制分类，只将 inference confidence 降为 low，保留当前模板候选供人工复核。
- **`PATH_TEMPLATE_MISMATCH`：** 生成器没有为 Elation 设置匹配模板集合；同时推荐暴击率与暴击伤害；双暴分支选择 direct-dps；最终 `direct-dps` 不在该路径先验匹配集合中。这里仅描述生成器的分类冲突，不判断角色实际定位。

#### 人工审核 checklist

- [x] 当前 Template 是否正确？*正确。*
- [x] scaling stat 应为哪个 PropertyType？如不适用，请记录原因。*scaling-stat 是 ATK。*
- [x] 当前各推荐副词条权重是否合理？*合理。*
- [x] 是否存在角色自身明确的 Hard Breakpoint？*不存在。*
- [x] 是否需要 stat target / curve？*需要。ATK 的 target 为 3600，达到 target 后权重降低至 0。*
- [x] 是否需要 weight override？*不需要。*
- [x] 结论：接受 / 修改 / 待进一步调查。*接受。*

### 1502 · 爻光

- **Character ID：** `1502`；**命途：** 欢愉（`Elation`）；**inference confidence：** `low`。
- **当前 inferred template：** `direct-dps`；**完整 review reasons：** `SPECIAL_PATH`、`PATH_TEMPLATE_MISMATCH`、`AMBIGUOUS_SCALING`。

#### 上游 Recommendation

- **Cavern 推荐（原顺序）：** 应天涉远的卜者（`130`）、骇域漫游的信使（`114`）。
- **Planar 推荐（原顺序）：** 沉陆海域露莎卡（`317`）、生命的翁瓦克（`308`）、折断的龙骨（`310`）。
- **BODY 主词条：** 暴击伤害（`CriticalDamageBase`）、暴击率（`CriticalChanceBase`）。
- **FOOT 主词条：** 速度（`SpeedDelta`）。
- **NECK / Sphere 主词条：** 生命值（`HPAddedRatio`）、防御力（`DefenceAddedRatio`）。
- **OBJECT / Rope 主词条：** 能量恢复效率（`SPRatioBase`）。
- **推荐副词条（原顺序）：** 速度（`SpeedDelta`）、暴击伤害（`CriticalDamageBase`）、暴击率（`CriticalChanceBase`）。

#### 当前 Generated Profile

| PropertyType | 中文属性名 | Weight |
| --- | --- | ---: |
| `CriticalChanceBase` | 暴击率 | ~~1.25~~ 0.75 |
| `CriticalDamageBase` | 暴击伤害 | ~~1.25~~ 0.75 |
| `SpeedDelta` | 速度 | ~~0.75~~ 1.25 |

- **Override：** 无。
- **已生成的 Hard Breakpoint / stat target / curve：** 0 / 0 / 0；仅供核对，未替人工补值。

#### Review reason 解释

- **`SPECIAL_PATH`：** 当前命途为 欢愉（`Elation`）；生成器没有针对该特殊命途的专用机制分类，只将 inference confidence 降为 low，保留当前模板候选供人工复核。
- **`PATH_TEMPLATE_MISMATCH`：** 生成器没有为 Elation 设置匹配模板集合；同时推荐暴击率与暴击伤害；双暴分支选择 direct-dps；最终 `direct-dps` 不在该路径先验匹配集合中。这里仅描述生成器的分类冲突，不判断角色实际定位。
- **`AMBIGUOUS_SCALING`：** 推荐副词条里没有 ATK/HP/DEF 百分比候选；推荐主词条中的 NECK：生命值（`HPAddedRatio`）、NECK：防御力（`DefenceAddedRatio`） 不能替推荐副词条新增 scaling 权重，因此生成器没有解析 scaling-stat。

#### 人工审核 checklist

- [x] 当前 Template 是否正确？*不正确，但是爻光的 template 不重要。*
- [x] scaling stat 应为哪个 PropertyType？如不适用，请记录原因。*无需 scaling-stat；欢愉伤害不依赖基础属性。*
- [x] 当前各推荐副词条权重是否合理？*不合理。*
- [x] 是否存在角色自身明确的 Hard Breakpoint？*存在。SPD 的 breakpoint 为 120。*
- [x] 是否需要 stat target / curve？*不需要。*
- [x] 是否需要 weight override？*需要。已经在表格中标出。*
- [x] 结论：接受 / 修改 / 待进一步调查。*修改。*

### 1505 · 绯英

- **Character ID：** `1505`；**命途：** 欢愉（`Elation`）；**inference confidence：** `low`。
- **当前 inferred template：** `direct-dps`；**完整 review reasons：** `SPECIAL_PATH`、`PATH_TEMPLATE_MISMATCH`。

#### 上游 Recommendation

- **Cavern 推荐（原顺序）：** 闪耀功勋的魔法少女（`129`）、恶海逐波的船长（`126`）、街头出身的拳王（`105`）。
- **Planar 推荐（原顺序）：** 零号关卡朋克洛德（`325`）、无主荒星茨冈尼亚（`313`）、太空封印站（`301`）。
- **BODY 主词条：** 暴击率（`CriticalChanceBase`）、暴击伤害（`CriticalDamageBase`）。
- **FOOT 主词条：** 速度（`SpeedDelta`）、攻击力（`AttackAddedRatio`）。
- **NECK / Sphere 主词条：** 攻击力（`AttackAddedRatio`）、物理属性伤害提高（`PhysicalAddedRatio`）。
- **OBJECT / Rope 主词条：** 能量恢复效率（`SPRatioBase`）、攻击力（`AttackAddedRatio`）。
- **推荐副词条（原顺序）：** 暴击率（`CriticalChanceBase`）、暴击伤害（`CriticalDamageBase`）、速度（`SpeedDelta`）、攻击力（`AttackAddedRatio`）。

#### 当前 Generated Profile

| PropertyType | 中文属性名 | Weight |
| --- | --- | ---: |
| `AttackAddedRatio` | 攻击力 | 1 |
| `CriticalChanceBase` | 暴击率 | 1.25 |
| `CriticalDamageBase` | 暴击伤害 | 1.25 |
| `SpeedDelta` | 速度 | 0.75 |

- **Override：** 无。
- **已生成的 Hard Breakpoint / stat target / curve：** 0 / 0 / 0；仅供核对，未替人工补值。

#### Review reason 解释

- **`SPECIAL_PATH`：** 当前命途为 欢愉（`Elation`）；生成器没有针对该特殊命途的专用机制分类，只将 inference confidence 降为 low，保留当前模板候选供人工复核。
- **`PATH_TEMPLATE_MISMATCH`：** 生成器没有为 Elation 设置匹配模板集合；同时推荐暴击率与暴击伤害；双暴分支选择 direct-dps；最终 `direct-dps` 不在该路径先验匹配集合中。这里仅描述生成器的分类冲突，不判断角色实际定位。

#### 人工审核 checklist

- [x] 当前 Template 是否正确？*正确。*
- [x] scaling stat 应为哪个 PropertyType？如不适用，请记录原因。*scaling-stat 使用 ATK。*
- [x] 当前各推荐副词条权重是否合理？*合理。*
- [x] 是否存在角色自身明确的 Hard Breakpoint？*不存在。*
- [x] 是否需要 stat target / curve？*需要。crit-rate 的 target 为 70%，达到 target 之后权重降低至 0。*
- [x] 是否需要 weight override？*不需要。*
- [x] 结论：接受 / 修改 / 待进一步调查。*接受。*

### 1506 · 银狼LV.999

- **Character ID：** `1506`；**命途：** 欢愉（`Elation`）；**inference confidence：** `low`。
- **当前 inferred template：** `direct-dps`；**完整 review reasons：** `SPECIAL_PATH`、`PATH_TEMPLATE_MISMATCH`、`AMBIGUOUS_SCALING`。

#### 上游 Recommendation

- **Cavern 推荐（原顺序）：** 闪耀功勋的魔法少女（`129`）、恶海逐波的船长（`126`）、盗匪荒漠的废土客（`112`）。
- **Planar 推荐（原顺序）：** 零号关卡朋克洛德（`325`）、无主荒星茨冈尼亚（`313`）、天国@直播间（`324`）。
- **BODY 主词条：** 暴击率（`CriticalChanceBase`）、暴击伤害（`CriticalDamageBase`）。
- **FOOT 主词条：** 速度（`SpeedDelta`）。
- **NECK / Sphere 主词条：** 生命值（`HPAddedRatio`）、防御力（`DefenceAddedRatio`）。
- **OBJECT / Rope 主词条：** 防御力（`DefenceAddedRatio`）、生命值（`HPAddedRatio`）。
- **推荐副词条（原顺序）：** 速度（`SpeedDelta`）、暴击率（`CriticalChanceBase`）、暴击伤害（`CriticalDamageBase`）。

#### 当前 Generated Profile

| PropertyType | 中文属性名 | Weight |
| --- | --- | ---: |
| `CriticalChanceBase` | 暴击率 | ~~1.25~~ 0.75 |
| `CriticalDamageBase` | 暴击伤害 | ~~1.25~~ 0.75 |
| `SpeedDelta` | 速度 | ~~0.75~~ 1.25 |

- **Override：** 无。
- **已生成的 Hard Breakpoint / stat target / curve：** 0 / 0 / 0；仅供核对，未替人工补值。

#### Review reason 解释

- **`SPECIAL_PATH`：** 当前命途为 欢愉（`Elation`）；生成器没有针对该特殊命途的专用机制分类，只将 inference confidence 降为 low，保留当前模板候选供人工复核。
- **`PATH_TEMPLATE_MISMATCH`：** 生成器没有为 Elation 设置匹配模板集合；同时推荐暴击率与暴击伤害；双暴分支选择 direct-dps；最终 `direct-dps` 不在该路径先验匹配集合中。这里仅描述生成器的分类冲突，不判断角色实际定位。
- **`AMBIGUOUS_SCALING`：** 推荐副词条里没有 ATK/HP/DEF 百分比候选；推荐主词条中的 NECK：生命值（`HPAddedRatio`）、NECK：防御力（`DefenceAddedRatio`）、OBJECT：防御力（`DefenceAddedRatio`）、OBJECT：生命值（`HPAddedRatio`） 不能替推荐副词条新增 scaling 权重，因此生成器没有解析 scaling-stat。

#### 人工审核 checklist

- [x] 当前 Template 是否正确？*正确。*
- [x] scaling stat 应为哪个 PropertyType？如不适用，请记录原因。*无需 scaling-stat；银狼LV.999 主要输出手段为欢愉伤害，不受基础属性值影响。*
- [x] 当前各推荐副词条权重是否合理？*不合理。*
- [x] 是否存在角色自身明确的 Hard Breakpoint？*存在。SPD 的 breakpoint 为 160。*
- [x] 是否需要 stat target / curve？*不需要。*
- [x] 是否需要 weight override？*需要。已在表格中标出。*
- [x] 结论：接受 / 修改 / 待进一步调查。*修改。*

### 1512 · 知更鸟•晴歌

- **Character ID：** `1512`；**命途：** 记忆（`Memory`）；**inference confidence：** `low`。
- **当前 inferred template：** `direct-dps`；**完整 review reasons：** `SPECIAL_PATH`、`PATH_TEMPLATE_MISMATCH`。

#### 上游 Recommendation

- **Cavern 推荐（原顺序）：** 再创天地的救世主（`127`）、重循苦旅的司铎（`121`）、骇域漫游的信使（`114`）。
- **Planar 推荐（原顺序）：** 永恒之地翁法罗斯（`323`）、生命的翁瓦克（`308`）、沉陆海域露莎卡（`317`）。
- **BODY 主词条：** 生命值（`HPAddedRatio`）、暴击伤害（`CriticalDamageBase`）。
- **FOOT 主词条：** 速度（`SpeedDelta`）、生命值（`HPAddedRatio`）。
- **NECK / Sphere 主词条：** 生命值（`HPAddedRatio`）、风属性伤害提高（`WindAddedRatio`）。
- **OBJECT / Rope 主词条：** 能量恢复效率（`SPRatioBase`）、生命值（`HPAddedRatio`）。
- **推荐副词条（原顺序）：** 暴击率（`CriticalChanceBase`）、暴击伤害（`CriticalDamageBase`）、生命值（`HPAddedRatio`）、速度（`SpeedDelta`）。

#### 当前 Generated Profile

| PropertyType | 中文属性名 | Weight |
| --- | --- | ---: |
| `CriticalChanceBase` | 暴击率 | ~~1.25~~ 0.5 |
| `CriticalDamageBase` | 暴击伤害 | ~~1.25~~ 0.5 |
| `HPAddedRatio` | 生命值 | ~~1~~ 0.75 |
| `SpeedDelta` | 速度 | ~~0.75~~ 1 |

- **Override：** 无。
- **已生成的 Hard Breakpoint / stat target / curve：** 0 / 0 / 0；仅供核对，未替人工补值。

#### Review reason 解释

- **`SPECIAL_PATH`：** 当前命途为 记忆（`Memory`）；生成器没有针对该特殊命途的专用机制分类，只将 inference confidence 降为 low，保留当前模板候选供人工复核。
- **`PATH_TEMPLATE_MISMATCH`：** 生成器没有为 Memory 设置匹配模板集合；同时推荐暴击率与暴击伤害；双暴分支选择 direct-dps；最终 `direct-dps` 不在该路径先验匹配集合中。这里仅描述生成器的分类冲突，不判断角色实际定位。

#### 人工审核 checklist

- [x] 当前 Template 是否正确？*不正确，但是知更鸟·晴歌的 template 不重要。*
- [x] scaling stat 应为哪个 PropertyType？如不适用，请记录原因。*scaling-stat 是 HP。*
- [x] 当前各推荐副词条权重是否合理？*不合理。*
- [x] 是否存在角色自身明确的 Hard Breakpoint？*不存在。*
- [x] 是否需要 stat target / curve？*需要。crit-rate 的 target 为 50%，达到 target 后权重降低至 0。*
- [x] 是否需要 weight override？*需要。已经在表格中标出。*
- [x] 结论：接受 / 修改 / 待进一步调查。*修改。*

### 1513 · 砂金•戏浪

- **Character ID：** `1513`；**命途：** 欢愉（`Elation`）；**inference confidence：** `low`。
- **当前 inferred template：** `direct-dps`；**完整 review reasons：** `SPECIAL_PATH`、`PATH_TEMPLATE_MISMATCH`、`AMBIGUOUS_SCALING`。

#### 上游 Recommendation

- **Cavern 推荐（原顺序）：** 闪耀功勋的魔法少女（`129`）、繁星璀璨的天才（`108`）。
- **Planar 推荐（原顺序）：** 零号关卡朋克洛德（`325`）、奇想蕉乐园（`318`）、无主荒星茨冈尼亚（`313`）。
- **BODY 主词条：** 暴击率（`CriticalChanceBase`）、暴击伤害（`CriticalDamageBase`）。
- **FOOT 主词条：** 速度（`SpeedDelta`）。
- **NECK / Sphere 主词条：** 量子属性伤害提高（`QuantumAddedRatio`）、生命值（`HPAddedRatio`）。
- **OBJECT / Rope 主词条：** 能量恢复效率（`SPRatioBase`）。
- **推荐副词条（原顺序）：** 暴击率（`CriticalChanceBase`）、暴击伤害（`CriticalDamageBase`）、速度（`SpeedDelta`）。

#### 当前 Generated Profile

| PropertyType | 中文属性名 | Weight |
| --- | --- | ---: |
| `CriticalChanceBase` | 暴击率 | ~~1.25~~ 0.75 |
| `CriticalDamageBase` | 暴击伤害 | ~~1.25~~ 0.75 |
| `SpeedDelta` | 速度 | ~~0.75~~ 1 |

- **Override：** 无。
- **已生成的 Hard Breakpoint / stat target / curve：** 0 / 0 / 0；仅供核对，未替人工补值。

#### Review reason 解释

- **`SPECIAL_PATH`：** 当前命途为 欢愉（`Elation`）；生成器没有针对该特殊命途的专用机制分类，只将 inference confidence 降为 low，保留当前模板候选供人工复核。
- **`PATH_TEMPLATE_MISMATCH`：** 生成器没有为 Elation 设置匹配模板集合；同时推荐暴击率与暴击伤害；双暴分支选择 direct-dps；最终 `direct-dps` 不在该路径先验匹配集合中。这里仅描述生成器的分类冲突，不判断角色实际定位。
- **`AMBIGUOUS_SCALING`：** 推荐副词条里没有 ATK/HP/DEF 百分比候选；推荐主词条中的 NECK：生命值（`HPAddedRatio`） 不能替推荐副词条新增 scaling 权重，因此生成器没有解析 scaling-stat。

#### 人工审核 checklist

- [x] 当前 Template 是否正确？*正确。*
- [x] scaling stat 应为哪个 PropertyType？如不适用，请记录原因。*无需 scaling-stat；砂金·戏浪的主要输出手段是欢愉伤害，不受基础属性影响。*
- [x] 当前各推荐副词条权重是否合理？*不合理。*
- [x] 是否存在角色自身明确的 Hard Breakpoint？*存在。SPD 的 breakpoint 为 140。*
- [x] 是否需要 stat target / curve？*不需要。*
- [x] 是否需要 weight override？*需要。已经在表格中标出。*
- [x] 结论：接受 / 修改 / 待进一步调查。*修改。*

> **这条说明是维护者人工加入的。** 开拓者有男/女两种性别，但他们的战斗属性是完全一致的，因此下方不做性别上的区分。8005/8006 都是开拓者·同谐；8007/8008 都是开拓者·记忆；8009/8010 都是开拓者·欢愉。

### 8005/8006 · 开拓者·同谐

- **Character ID：** `8005`；**命途：** 同谐（`Shaman`）；**inference confidence：** `medium`。
- **当前 inferred template：** `break`；**完整 review reasons：** `PATH_TEMPLATE_MISMATCH`、`AMBIGUOUS_SCALING`。

#### 上游 Recommendation

- **Cavern 推荐（原顺序）：** 机心戏梦的钟表匠（`118`）、流星追迹的怪盗（`111`）、骇域漫游的信使（`114`）。
- **Planar 推荐（原顺序）：** 盗贼公国塔利亚（`307`）、劫火莲灯铸炼宫（`316`）、不老者的仙舟（`302`）。
- **BODY 主词条：** 生命值（`HPAddedRatio`）、防御力（`DefenceAddedRatio`）。
- **FOOT 主词条：** 速度（`SpeedDelta`）。
- **NECK / Sphere 主词条：** 防御力（`DefenceAddedRatio`）、生命值（`HPAddedRatio`）。
- **OBJECT / Rope 主词条：** 击破特攻（`BreakDamageAddedRatioBase`）。
- **推荐副词条（原顺序）：** 击破特攻（`BreakDamageAddedRatioBase`）、速度（`SpeedDelta`）。

#### 当前 Generated Profile

| PropertyType | 中文属性名 | Weight |
| --- | --- | ---: |
| `BreakDamageAddedRatioBase` | 击破特攻 | 1.25 |
| `SpeedDelta` | 速度 | 1 |

- **Override：** 无。
- **已生成的 Hard Breakpoint / stat target / curve：** 0 / 0 / 0；仅供核对，未替人工补值。

#### Review reason 解释

- **`PATH_TEMPLATE_MISMATCH`：** 同谐路径先验只匹配 direct-support；推荐击破特攻且没有双暴；击破分支选择 break；最终 `break` 不在该路径先验匹配集合中。这里仅描述生成器的分类冲突，不判断角色实际定位。
- **`AMBIGUOUS_SCALING`：** 推荐副词条里没有 ATK/HP/DEF 百分比候选；推荐主词条中的 BODY：生命值（`HPAddedRatio`）、BODY：防御力（`DefenceAddedRatio`）、NECK：防御力（`DefenceAddedRatio`）、NECK：生命值（`HPAddedRatio`） 不能替推荐副词条新增 scaling 权重，因此生成器没有解析 scaling-stat。

#### 人工审核 checklist

- [x] 当前 Template 是否正确？*正确.*
- [x] scaling stat 应为哪个 PropertyType？如不适用，请记录原因。*无需 scaling-stat；击破伤害不受基础属性影响。*
- [x] 当前各推荐副词条权重是否合理？*合理。*
- [x] 是否存在角色自身明确的 Hard Breakpoint？*不存在。*
- [x] 是否需要 stat target / curve？*不需要。*
- [x] 是否需要 weight override？*不需要。*
- [x] 结论：接受 / 修改 / 待进一步调查。*接受。*

### 8007/8008 · 开拓者·记忆

- **Character ID：** `8007`；**命途：** 记忆（`Memory`）；**inference confidence：** `low`。
- **当前 inferred template：** `direct-dps`；**完整 review reasons：** `SPECIAL_PATH`、`MIXED_STAT_SIGNALS`、`PATH_TEMPLATE_MISMATCH`。

#### 上游 Recommendation

- **Cavern 推荐（原顺序）：** 凯歌祝捷的英豪（`123`）、密林卧雪的猎人（`104`）、晨昏交界的翔鹰（`110`）。
- **Planar 推荐（原顺序）：** 沉陆海域露莎卡（`317`）、梦想之地匹诺康尼（`312`）、奇想蕉乐园（`318`）。
- **BODY 主词条：** 暴击伤害（`CriticalDamageBase`）。
- **FOOT 主词条：** 速度（`SpeedDelta`）、攻击力（`AttackAddedRatio`）。
- **NECK / Sphere 主词条：** 冰属性伤害提高（`IceAddedRatio`）。
- **OBJECT / Rope 主词条：** 能量恢复效率（`SPRatioBase`）、攻击力（`AttackAddedRatio`）。
- **推荐副词条（原顺序）：** 暴击伤害（`CriticalDamageBase`）、速度（`SpeedDelta`）、攻击力（`AttackAddedRatio`）。

#### 当前 Generated Profile

| PropertyType | 中文属性名 | Weight |
| --- | --- | ---: |
| `AttackAddedRatio` | 攻击力 | ~~1~~ 0.75 |
| `CriticalDamageBase` | 暴击伤害 | ~~1.25~~ 0.75 |
| `SpeedDelta` | 速度 | ~~0.75~~ 1.25 |

- **Override：** 无。
- **已生成的 Hard Breakpoint / stat target / curve：** 0 / 0 / 0；仅供核对，未替人工补值。

#### Review reason 解释

- **`SPECIAL_PATH`：** 当前命途为 记忆（`Memory`）；生成器没有针对该特殊命途的专用机制分类，只将 inference confidence 降为 low，保留当前模板候选供人工复核。
- **`MIXED_STAT_SIGNALS`：** 双暴只出现一项：暴击伤害（`CriticalDamageBase`）；生成器因此降低置信度，未据此推断战斗机制。
- **`PATH_TEMPLATE_MISMATCH`：** 生成器没有为 Memory 设置匹配模板集合；前面属性和路径分支未命中；最终回退为 direct-dps；最终 `direct-dps` 不在该路径先验匹配集合中。这里仅描述生成器的分类冲突，不判断角色实际定位。

#### 人工审核 checklist

- [x] 当前 Template 是否正确？*不正确。开拓者·记忆是辅助位。*
- [x] scaling stat 应为哪个 PropertyType？如不适用，请记录原因。*scaling-stat 为 ATK。*
- [x] 当前各推荐副词条权重是否合理？*不合理。*
- [x] 是否存在角色自身明确的 Hard Breakpoint？*不存在。*
- [x] 是否需要 stat target / curve？*不需要。*
- [x] 是否需要 weight override？*需要，已在表格中标出。*
- [x] 结论：接受 / 修改 / 待进一步调查。*修改。*

### 8009/8010 · 开拓者·欢愉

- **Character ID：** `8009`；**命途：** 欢愉（`Elation`）；**inference confidence：** `low`。
- **当前 inferred template：** `direct-dps`；**完整 review reasons：** `SPECIAL_PATH`、`PATH_TEMPLATE_MISMATCH`。

#### 上游 Recommendation

- **Cavern 推荐（原顺序）：** 应天涉远的卜者（`130`）、闪耀功勋的魔法少女（`129`）、野穗伴行的快枪手（`102`）。
- **Planar 推荐（原顺序）：** 沉陆海域露莎卡（`317`）、零号关卡朋克洛德（`325`）、太空封印站（`301`）。
- **BODY 主词条：** 暴击伤害（`CriticalDamageBase`）、暴击率（`CriticalChanceBase`）。
- **FOOT 主词条：** 速度（`SpeedDelta`）、攻击力（`AttackAddedRatio`）。
- **NECK / Sphere 主词条：** 攻击力（`AttackAddedRatio`）。
- **OBJECT / Rope 主词条：** 能量恢复效率（`SPRatioBase`）、攻击力（`AttackAddedRatio`）。
- **推荐副词条（原顺序）：** 暴击率（`CriticalChanceBase`）、暴击伤害（`CriticalDamageBase`）、速度（`SpeedDelta`）、攻击力（`AttackAddedRatio`）。

#### 当前 Generated Profile

| PropertyType | 中文属性名 | Weight |
| --- | --- | ---: |
| `AttackAddedRatio` | 攻击力 | ~~1~~ 0.75 |
| `CriticalChanceBase` | 暴击率 | ~~1.25~~ 1 |
| `CriticalDamageBase` | 暴击伤害 | ~~1.25~~ 0.75 |
| `SpeedDelta` | 速度 | ~~0.75~~ 1 |

- **Override：** 无。
- **已生成的 Hard Breakpoint / stat target / curve：** 0 / 0 / 0；仅供核对，未替人工补值。

#### Review reason 解释

- **`SPECIAL_PATH`：** 当前命途为 欢愉（`Elation`）；生成器没有针对该特殊命途的专用机制分类，只将 inference confidence 降为 low，保留当前模板候选供人工复核。
- **`PATH_TEMPLATE_MISMATCH`：** 生成器没有为 Elation 设置匹配模板集合；同时推荐暴击率与暴击伤害；双暴分支选择 direct-dps；最终 `direct-dps` 不在该路径先验匹配集合中。这里仅描述生成器的分类冲突，不判断角色实际定位。

#### 人工审核 checklist

- [x] 当前 Template 是否正确？*不正确，但是开拓者·欢愉的 template 不重要。*
- [x] scaling stat 应为哪个 PropertyType？如不适用，请记录原因。*scaling-stat 为 ATK。*
- [x] 当前各推荐副词条权重是否合理？*不合理。*
- [x] 是否存在角色自身明确的 Hard Breakpoint？*不存在。*
- [x] 是否需要 stat target / curve？*需要。ATK 的 target 为 2200，达到 target 之后的权重降低为 0.25；crit-rate 的 target 为 85%，达到 target 之后权重降低为 0。*
- [x] 是否需要 weight override？*需要，已经在表格中标出。*
- [x] 结论：接受 / 修改 / 待进一步调查。*修改。*

## AMBIGUOUS_SCALING 汇总

这里只列当前生成器未能唯一解析的候选；表中主词条证据不构成人工选择。

| 角色 | ID | 当前 Template | 推荐副词条中的 scaling candidates | 推荐主词条中的 scaling 信息 |
| --- | --- | --- | --- | --- |
| 布洛妮娅 | `1101` | `direct-support` | 无 | NECK：生命值（`HPAddedRatio`）<br>NECK：防御力（`DefenceAddedRatio`）<br>候选∩主词条：无 |
| 寒鸦 | `1215` | `direct-support` | 无 | BODY：生命值（`HPAddedRatio`）<br>BODY：防御力（`DefenceAddedRatio`）<br>NECK：生命值（`HPAddedRatio`）<br>NECK：防御力（`DefenceAddedRatio`）<br>候选∩主词条：无 |
| 忘归人 | `1225` | `break` | 无 | NECK：生命值（`HPAddedRatio`）<br>候选∩主词条：无 |
| 加拉赫 | `1301` | `break` | 无 | NECK：生命值（`HPAddedRatio`）<br>NECK：防御力（`DefenceAddedRatio`）<br>候选∩主词条：无 |
| 阮•梅 | `1303` | `break` | 无 | BODY：生命值（`HPAddedRatio`）<br>BODY：防御力（`DefenceAddedRatio`）<br>NECK：生命值（`HPAddedRatio`）<br>NECK：防御力（`DefenceAddedRatio`）<br>候选∩主词条：无 |
| 花火 | `1306` | `direct-support` | 无 | NECK：生命值（`HPAddedRatio`）<br>NECK：防御力（`DefenceAddedRatio`）<br>候选∩主词条：无 |
| 星期日 | `1313` | `direct-support` | 无 | NECK：生命值（`HPAddedRatio`）<br>NECK：防御力（`DefenceAddedRatio`）<br>候选∩主词条：无 |
| 大丽花 | `1321` | `break` | 无 | BODY：生命值（`HPAddedRatio`）<br>BODY：防御力（`DefenceAddedRatio`）<br>NECK：生命值（`HPAddedRatio`）<br>NECK：防御力（`DefenceAddedRatio`）<br>候选∩主词条：无 |
| 爻光 | `1502` | `direct-dps` | 无 | NECK：生命值（`HPAddedRatio`）<br>NECK：防御力（`DefenceAddedRatio`）<br>候选∩主词条：无 |
| 银狼LV.999 | `1506` | `direct-dps` | 无 | NECK：生命值（`HPAddedRatio`）<br>NECK：防御力（`DefenceAddedRatio`）<br>OBJECT：防御力（`DefenceAddedRatio`）<br>OBJECT：生命值（`HPAddedRatio`）<br>候选∩主词条：无 |
| 砂金•戏浪 | `1513` | `direct-dps` | 无 | NECK：生命值（`HPAddedRatio`）<br>候选∩主词条：无 |
| 开拓者·同谐 | `8005` | `break` | 无 | BODY：生命值（`HPAddedRatio`）<br>BODY：防御力（`DefenceAddedRatio`）<br>NECK：防御力（`DefenceAddedRatio`）<br>NECK：生命值（`HPAddedRatio`）<br>候选∩主词条：无 |
| 开拓者·同谐 | `8006` | `break` | 无 | BODY：生命值（`HPAddedRatio`）<br>BODY：防御力（`DefenceAddedRatio`）<br>NECK：防御力（`DefenceAddedRatio`）<br>NECK：生命值（`HPAddedRatio`）<br>候选∩主词条：无 |

## SPECIAL_PATH 汇总

Memory / Elation 在当前生成器中只降低置信度，不触发额外模板；下表仍需人工核对实际机制。

| 角色 | ID | Path | 当前 Template | Confidence | 其他 review reason | 推荐副词条主要信号 |
| --- | --- | --- | --- | --- | --- | --- |
| 阿格莱雅 | `1402` | 记忆（`Memory`） | `direct-dps` | `low` | `PATH_TEMPLATE_MISMATCH` | 暴击率（`CriticalChanceBase`）<br>暴击伤害（`CriticalDamageBase`）<br>攻击力（`AttackAddedRatio`）<br>速度（`SpeedDelta`） |
| 遐蝶 | `1407` | 记忆（`Memory`） | `direct-dps` | `low` | `PATH_TEMPLATE_MISMATCH` | 暴击率（`CriticalChanceBase`）<br>暴击伤害（`CriticalDamageBase`）<br>生命值（`HPAddedRatio`） |
| 风堇 | `1409` | 记忆（`Memory`） | `direct-dps` | `low` | `MIXED_STAT_SIGNALS`<br>`PATH_TEMPLATE_MISMATCH` | 生命值（`HPAddedRatio`）<br>速度（`SpeedDelta`）<br>效果抵抗（`StatusResistanceBase`）<br>暴击伤害（`CriticalDamageBase`） |
| 长夜月 | `1413` | 记忆（`Memory`） | `direct-dps` | `low` | `PATH_TEMPLATE_MISMATCH` | 暴击率（`CriticalChanceBase`）<br>暴击伤害（`CriticalDamageBase`）<br>速度（`SpeedDelta`）<br>生命值（`HPAddedRatio`） |
| 昔涟 | `1415` | 记忆（`Memory`） | `direct-dps` | `low` | `PATH_TEMPLATE_MISMATCH` | 速度（`SpeedDelta`）<br>暴击伤害（`CriticalDamageBase`）<br>暴击率（`CriticalChanceBase`）<br>生命值（`HPAddedRatio`） |
| 火花 | `1501` | 欢愉（`Elation`） | `direct-dps` | `low` | `PATH_TEMPLATE_MISMATCH` | 暴击率（`CriticalChanceBase`）<br>暴击伤害（`CriticalDamageBase`）<br>攻击力（`AttackAddedRatio`） |
| 爻光 | `1502` | 欢愉（`Elation`） | `direct-dps` | `low` | `PATH_TEMPLATE_MISMATCH`<br>`AMBIGUOUS_SCALING` | 速度（`SpeedDelta`）<br>暴击伤害（`CriticalDamageBase`）<br>暴击率（`CriticalChanceBase`） |
| 绯英 | `1505` | 欢愉（`Elation`） | `direct-dps` | `low` | `PATH_TEMPLATE_MISMATCH` | 暴击率（`CriticalChanceBase`）<br>暴击伤害（`CriticalDamageBase`）<br>速度（`SpeedDelta`）<br>攻击力（`AttackAddedRatio`） |
| 银狼LV.999 | `1506` | 欢愉（`Elation`） | `direct-dps` | `low` | `PATH_TEMPLATE_MISMATCH`<br>`AMBIGUOUS_SCALING` | 速度（`SpeedDelta`）<br>暴击率（`CriticalChanceBase`）<br>暴击伤害（`CriticalDamageBase`） |
| 知更鸟•晴歌 | `1512` | 记忆（`Memory`） | `direct-dps` | `low` | `PATH_TEMPLATE_MISMATCH` | 暴击率（`CriticalChanceBase`）<br>暴击伤害（`CriticalDamageBase`）<br>生命值（`HPAddedRatio`）<br>速度（`SpeedDelta`） |
| 砂金•戏浪 | `1513` | 欢愉（`Elation`） | `direct-dps` | `low` | `PATH_TEMPLATE_MISMATCH`<br>`AMBIGUOUS_SCALING` | 暴击率（`CriticalChanceBase`）<br>暴击伤害（`CriticalDamageBase`）<br>速度（`SpeedDelta`） |
| 开拓者·记忆 | `8007` | 记忆（`Memory`） | `direct-dps` | `low` | `MIXED_STAT_SIGNALS`<br>`PATH_TEMPLATE_MISMATCH` | 暴击伤害（`CriticalDamageBase`）<br>速度（`SpeedDelta`）<br>攻击力（`AttackAddedRatio`） |
| 开拓者·记忆 | `8008` | 记忆（`Memory`） | `direct-dps` | `low` | `MIXED_STAT_SIGNALS`<br>`PATH_TEMPLATE_MISMATCH` | 暴击伤害（`CriticalDamageBase`）<br>速度（`SpeedDelta`）<br>攻击力（`AttackAddedRatio`） |
| 开拓者·欢愉 | `8009` | 欢愉（`Elation`） | `direct-dps` | `low` | `PATH_TEMPLATE_MISMATCH` | 暴击率（`CriticalChanceBase`）<br>暴击伤害（`CriticalDamageBase`）<br>速度（`SpeedDelta`）<br>攻击力（`AttackAddedRatio`） |
| 开拓者·欢愉 | `8010` | 欢愉（`Elation`） | `direct-dps` | `low` | `PATH_TEMPLATE_MISMATCH` | 暴击率（`CriticalChanceBase`）<br>暴击伤害（`CriticalDamageBase`）<br>速度（`SpeedDelta`）<br>攻击力（`AttackAddedRatio`） |

## unreviewed 按 Template 分组

以下 63 个候选是审核前快照；本轮已按最终生成结果批量批准。表中的 confidence 与非零权重照录审核前 artifact。

### direct-dps（41）

| 角色名 | ID | Path | Confidence | Non-zero weights 摘要 |
| --- | --- | --- | --- | --- |
| 丹恒 | `1002` | 巡猎（`Rogue`） | `high` | 攻击力（`AttackAddedRatio`）×1<br>暴击率（`CriticalChanceBase`）×1.25<br>暴击伤害（`CriticalDamageBase`）×1.25<br>速度（`SpeedDelta`）×0.75 |
| 姬子 | `1003` | 智识（`Mage`） | `high` | 攻击力（`AttackAddedRatio`）×1<br>暴击率（`CriticalChanceBase`）×1.25<br>暴击伤害（`CriticalDamageBase`）×1.25<br>速度（`SpeedDelta`）×0.75 |
| 瓦尔特 | `1004` | 虚无（`Warlock`） | `high` | 攻击力（`AttackAddedRatio`）×1<br>暴击率（`CriticalChanceBase`）×1.25<br>暴击伤害（`CriticalDamageBase`）×1.25<br>速度（`SpeedDelta`）×0.75<br>效果命中（`StatusProbabilityBase`）×0.25 |
| 银狼 | `1006` | 虚无（`Warlock`） | `high` | 攻击力（`AttackAddedRatio`）×1<br>暴击率（`CriticalChanceBase`）×1.25<br>暴击伤害（`CriticalDamageBase`）×1.25<br>速度（`SpeedDelta`）×0.75<br>效果命中（`StatusProbabilityBase`）×0.25 |
| 阿兰 | `1008` | 毁灭（`Warrior`） | `high` | 攻击力（`AttackAddedRatio`）×1<br>暴击率（`CriticalChanceBase`）×1.25<br>暴击伤害（`CriticalDamageBase`）×1.25<br>速度（`SpeedDelta`）×0.75 |
| 黑塔 | `1013` | 智识（`Mage`） | `high` | 攻击力（`AttackAddedRatio`）×1<br>暴击率（`CriticalChanceBase`）×1.25<br>暴击伤害（`CriticalDamageBase`）×1.25<br>速度（`SpeedDelta`）×0.75 |
| Saber | `1014` | 毁灭（`Warrior`） | `high` | 攻击力（`AttackAddedRatio`）×1<br>暴击率（`CriticalChanceBase`）×1.25<br>暴击伤害（`CriticalDamageBase`）×1.25<br>速度（`SpeedDelta`）×0.75 |
| Archer | `1015` | 巡猎（`Rogue`） | `high` | 攻击力（`AttackAddedRatio`）×1<br>暴击率（`CriticalChanceBase`）×1.25<br>暴击伤害（`CriticalDamageBase`）×1.25<br>速度（`SpeedDelta`）×0.75 |
| 希儿 | `1102` | 巡猎（`Rogue`） | `high` | 攻击力（`AttackAddedRatio`）×1<br>暴击率（`CriticalChanceBase`）×1.25<br>暴击伤害（`CriticalDamageBase`）×1.25<br>速度（`SpeedDelta`）×0.75 |
| 希露瓦 | `1103` | 智识（`Mage`） | `high` | 攻击力（`AttackAddedRatio`）×1<br>暴击率（`CriticalChanceBase`）×1.25<br>暴击伤害（`CriticalDamageBase`）×1.25<br>速度（`SpeedDelta`）×0.75 |
| 佩拉 | `1106` | 虚无（`Warlock`） | `high` | 攻击力（`AttackAddedRatio`）×1<br>暴击率（`CriticalChanceBase`）×1.25<br>暴击伤害（`CriticalDamageBase`）×1.25<br>速度（`SpeedDelta`）×0.75<br>效果命中（`StatusProbabilityBase`）×0.25 |
| 克拉拉 | `1107` | 毁灭（`Warrior`） | `high` | 攻击力（`AttackAddedRatio`）×1<br>暴击率（`CriticalChanceBase`）×1.25<br>暴击伤害（`CriticalDamageBase`）×1.25<br>速度（`SpeedDelta`）×0.75 |
| 虎克 | `1109` | 毁灭（`Warrior`） | `high` | 攻击力（`AttackAddedRatio`）×1<br>暴击率（`CriticalChanceBase`）×1.25<br>暴击伤害（`CriticalDamageBase`）×1.25<br>速度（`SpeedDelta`）×0.75 |
| 托帕&账账 | `1112` | 巡猎（`Rogue`） | `high` | 攻击力（`AttackAddedRatio`）×1<br>暴击率（`CriticalChanceBase`）×1.25<br>暴击伤害（`CriticalDamageBase`）×1.25<br>速度（`SpeedDelta`）×0.75 |
| 青雀 | `1201` | 智识（`Mage`） | `high` | 攻击力（`AttackAddedRatio`）×1<br>暴击率（`CriticalChanceBase`）×1.25<br>暴击伤害（`CriticalDamageBase`）×1.25<br>速度（`SpeedDelta`）×0.75 |
| 景元 | `1204` | 智识（`Mage`） | `high` | 攻击力（`AttackAddedRatio`）×1<br>暴击率（`CriticalChanceBase`）×1.25<br>暴击伤害（`CriticalDamageBase`）×1.25<br>速度（`SpeedDelta`）×0.75 |
| 刃 | `1205` | 毁灭（`Warrior`） | `high` | 暴击率（`CriticalChanceBase`）×1.25<br>暴击伤害（`CriticalDamageBase`）×1.25<br>生命值（`HPAddedRatio`）×1<br>速度（`SpeedDelta`）×0.75 |
| 彦卿 | `1209` | 巡猎（`Rogue`） | `high` | 攻击力（`AttackAddedRatio`）×1<br>暴击率（`CriticalChanceBase`）×1.25<br>暴击伤害（`CriticalDamageBase`）×1.25<br>速度（`SpeedDelta`）×0.75 |
| 镜流 | `1212` | 毁灭（`Warrior`） | `high` | 暴击率（`CriticalChanceBase`）×1.25<br>暴击伤害（`CriticalDamageBase`）×1.25<br>生命值（`HPAddedRatio`）×1<br>速度（`SpeedDelta`）×0.75 |
| 丹恒•饮月 | `1213` | 毁灭（`Warrior`） | `high` | 攻击力（`AttackAddedRatio`）×1<br>暴击率（`CriticalChanceBase`）×1.25<br>暴击伤害（`CriticalDamageBase`）×1.25<br>速度（`SpeedDelta`）×0.75 |
| 飞霄 | `1220` | 巡猎（`Rogue`） | `high` | 攻击力（`AttackAddedRatio`）×1<br>暴击率（`CriticalChanceBase`）×1.25<br>暴击伤害（`CriticalDamageBase`）×1.25<br>速度（`SpeedDelta`）×0.75 |
| 云璃 | `1221` | 毁灭（`Warrior`） | `high` | 攻击力（`AttackAddedRatio`）×1<br>暴击率（`CriticalChanceBase`）×1.25<br>暴击伤害（`CriticalDamageBase`）×1.25<br>速度（`SpeedDelta`）×0.75 |
| 貊泽 | `1223` | 巡猎（`Rogue`） | `high` | 攻击力（`AttackAddedRatio`）×1<br>暴击率（`CriticalChanceBase`）×1.25<br>暴击伤害（`CriticalDamageBase`）×1.25<br>速度（`SpeedDelta`）×0.75 |
| 三月七·巡猎 | `1224` | 巡猎（`Rogue`） | `high` | 攻击力（`AttackAddedRatio`）×1<br>暴击率（`CriticalChanceBase`）×1.25<br>暴击伤害（`CriticalDamageBase`）×1.25<br>速度（`SpeedDelta`）×0.75 |
| 银枝 | `1302` | 智识（`Mage`） | `high` | 攻击力（`AttackAddedRatio`）×1<br>暴击率（`CriticalChanceBase`）×1.25<br>暴击伤害（`CriticalDamageBase`）×1.25<br>速度（`SpeedDelta`）×0.75 |
| 真理医生 | `1305` | 巡猎（`Rogue`） | `high` | 攻击力（`AttackAddedRatio`）×1<br>暴击率（`CriticalChanceBase`）×1.25<br>暴击伤害（`CriticalDamageBase`）×1.25<br>速度（`SpeedDelta`）×0.75 |
| 黄泉 | `1308` | 虚无（`Warlock`） | `high` | 攻击力（`AttackAddedRatio`）×1<br>暴击率（`CriticalChanceBase`）×1.25<br>暴击伤害（`CriticalDamageBase`）×1.25<br>速度（`SpeedDelta`）×0.75 |
| 米沙 | `1312` | 毁灭（`Warrior`） | `high` | 攻击力（`AttackAddedRatio`）×1<br>暴击率（`CriticalChanceBase`）×1.25<br>暴击伤害（`CriticalDamageBase`）×1.25<br>速度（`SpeedDelta`）×0.75 |
| 翡翠 | `1314` | 智识（`Mage`） | `high` | 攻击力（`AttackAddedRatio`）×1<br>暴击率（`CriticalChanceBase`）×1.25<br>暴击伤害（`CriticalDamageBase`）×1.25<br>速度（`SpeedDelta`）×0.75 |
| 大黑塔 | `1401` | 智识（`Mage`） | `high` | 攻击力（`AttackAddedRatio`）×1<br>暴击率（`CriticalChanceBase`）×1.25<br>暴击伤害（`CriticalDamageBase`）×1.25<br>速度（`SpeedDelta`）×0.75 |
| 万敌 | `1404` | 毁灭（`Warrior`） | `high` | 暴击率（`CriticalChanceBase`）×1.25<br>暴击伤害（`CriticalDamageBase`）×1.25<br>生命值（`HPAddedRatio`）×1<br>速度（`SpeedDelta`）×0.75 |
| 那刻夏 | `1405` | 智识（`Mage`） | `high` | 攻击力（`AttackAddedRatio`）×1<br>暴击率（`CriticalChanceBase`）×1.25<br>暴击伤害（`CriticalDamageBase`）×1.25<br>速度（`SpeedDelta`）×0.75 |
| 赛飞儿 | `1406` | 虚无（`Warlock`） | `high` | 攻击力（`AttackAddedRatio`）×1<br>暴击率（`CriticalChanceBase`）×1.25<br>暴击伤害（`CriticalDamageBase`）×1.25<br>速度（`SpeedDelta`）×0.75 |
| 白厄 | `1408` | 毁灭（`Warrior`） | `high` | 攻击力（`AttackAddedRatio`）×1<br>暴击率（`CriticalChanceBase`）×1.25<br>暴击伤害（`CriticalDamageBase`）×1.25 |
| 不死途 | `1504` | 巡猎（`Rogue`） | `high` | 攻击力（`AttackAddedRatio`）×1<br>暴击率（`CriticalChanceBase`）×1.25<br>暴击伤害（`CriticalDamageBase`）×1.25<br>速度（`SpeedDelta`）×0.75 |
| 千冶•刃 | `1507` | 虚无（`Warlock`） | `high` | 暴击率（`CriticalChanceBase`）×1.25<br>暴击伤害（`CriticalDamageBase`）×1.25<br>生命值（`HPAddedRatio`）×1<br>速度（`SpeedDelta`）×0.75 |
| 远坂凛 | `1508` | 智识（`Mage`） | `high` | 攻击力（`AttackAddedRatio`）×1<br>暴击率（`CriticalChanceBase`）×1.25<br>暴击伤害（`CriticalDamageBase`）×1.25<br>速度（`SpeedDelta`）×0.75 |
| 吉尔伽美什 | `1509` | 毁灭（`Warrior`） | `high` | 攻击力（`AttackAddedRatio`）×1<br>暴击率（`CriticalChanceBase`）×1.25<br>暴击伤害（`CriticalDamageBase`）×1.25<br>速度（`SpeedDelta`）×0.75 |
| 姬子•启行 | `1510` | 智识（`Mage`） | `high` | 攻击力（`AttackAddedRatio`）×1<br>暴击率（`CriticalChanceBase`）×1.25<br>暴击伤害（`CriticalDamageBase`）×1.25<br>速度（`SpeedDelta`）×0.75 |
| 开拓者·毁灭 | `8001` | 毁灭（`Warrior`） | `high` | 攻击力（`AttackAddedRatio`）×1<br>暴击率（`CriticalChanceBase`）×1.25<br>暴击伤害（`CriticalDamageBase`）×1.25<br>速度（`SpeedDelta`）×0.75 |
| 开拓者·毁灭 | `8002` | 毁灭（`Warrior`） | `high` | 攻击力（`AttackAddedRatio`）×1<br>暴击率（`CriticalChanceBase`）×1.25<br>暴击伤害（`CriticalDamageBase`）×1.25<br>速度（`SpeedDelta`）×0.75 |

### direct-support（2）

| 角色名 | ID | Path | Confidence | Non-zero weights 摘要 |
| --- | --- | --- | --- | --- |
| 停云 | `1202` | 同谐（`Shaman`） | `high` | 攻击力（`AttackAddedRatio`）×0.75<br>速度（`SpeedDelta`）×1.25<br>效果抵抗（`StatusResistanceBase`）×0.5 |
| 知更鸟 | `1309` | 同谐（`Shaman`） | `high` | 攻击力（`AttackAddedRatio`）×0.75<br>攻击力（`AttackDelta`）×0.5<br>速度（`SpeedDelta`）×1.25 |

### break（2）

| 角色名 | ID | Path | Confidence | Non-zero weights 摘要 |
| --- | --- | --- | --- | --- |
| 流萤 | `1310` | 毁灭（`Warrior`） | `high` | 攻击力（`AttackAddedRatio`）×0.75<br>击破特攻（`BreakDamageAddedRatioBase`）×1.25<br>速度（`SpeedDelta`）×1 |
| 乱破 | `1317` | 智识（`Mage`） | `high` | 攻击力（`AttackAddedRatio`）×0.75<br>击破特攻（`BreakDamageAddedRatioBase`）×1.25<br>速度（`SpeedDelta`）×1 |

### dot-dps（6）

| 角色名 | ID | Path | Confidence | Non-zero weights 摘要 |
| --- | --- | --- | --- | --- |
| 卡芙卡 | `1005` | 虚无（`Warlock`） | `high` | 攻击力（`AttackAddedRatio`）×1.25<br>速度（`SpeedDelta`）×1<br>效果命中（`StatusProbabilityBase`）×1 |
| 桑博 | `1108` | 虚无（`Warlock`） | `high` | 攻击力（`AttackAddedRatio`）×1.25<br>速度（`SpeedDelta`）×1<br>效果命中（`StatusProbabilityBase`）×1 |
| 桂乃芬 | `1210` | 虚无（`Warlock`） | `high` | 攻击力（`AttackAddedRatio`）×1.25<br>速度（`SpeedDelta`）×1<br>效果命中（`StatusProbabilityBase`）×1 |
| 椒丘 | `1218` | 虚无（`Warlock`） | `high` | 攻击力（`AttackAddedRatio`）×1.25<br>速度（`SpeedDelta`）×1<br>效果命中（`StatusProbabilityBase`）×1 |
| 黑天鹅 | `1307` | 虚无（`Warlock`） | `high` | 攻击力（`AttackAddedRatio`）×1.25<br>速度（`SpeedDelta`）×1<br>效果命中（`StatusProbabilityBase`）×1 |
| 海瑟音 | `1410` | 虚无（`Warlock`） | `high` | 攻击力（`AttackAddedRatio`）×1.25<br>速度（`SpeedDelta`）×1<br>效果命中（`StatusProbabilityBase`）×1 |

### debuff-support（0）

当前无 `unreviewed` 角色；该模板的候选见上方 needs-review。

### sustain（9）

| 角色名 | ID | Path | Confidence | Non-zero weights 摘要 |
| --- | --- | --- | --- | --- |
| 娜塔莎 | `1105` | 丰饶（`Priest`） | `high` | 生命值（`HPAddedRatio`）×1<br>速度（`SpeedDelta`）×1.25<br>效果抵抗（`StatusResistanceBase`）×0.75 |
| 玲可 | `1110` | 丰饶（`Priest`） | `high` | 生命值（`HPAddedRatio`）×1<br>速度（`SpeedDelta`）×1.25<br>效果抵抗（`StatusResistanceBase`）×0.75 |
| 罗刹 | `1203` | 丰饶（`Priest`） | `high` | 攻击力（`AttackAddedRatio`）×1<br>速度（`SpeedDelta`）×1.25<br>效果抵抗（`StatusResistanceBase`）×0.75 |
| 符玄 | `1208` | 存护（`Knight`） | `high` | 防御力（`DefenceAddedRatio`）×0.5<br>生命值（`HPAddedRatio`）×1<br>速度（`SpeedDelta`）×1.25<br>效果抵抗（`StatusResistanceBase`）×0.75 |
| 白露 | `1211` | 丰饶（`Priest`） | `high` | 生命值（`HPAddedRatio`）×1<br>速度（`SpeedDelta`）×1.25<br>效果抵抗（`StatusResistanceBase`）×0.75 |
| 藿藿 | `1217` | 丰饶（`Priest`） | `high` | 生命值（`HPAddedRatio`）×1<br>速度（`SpeedDelta`）×1.25<br>效果抵抗（`StatusResistanceBase`）×0.75 |
| 丹恒•腾荒 | `1414` | 存护（`Knight`） | `high` | 攻击力（`AttackAddedRatio`）×1<br>速度（`SpeedDelta`）×1.25 |
| 开拓者·存护 | `8003` | 存护（`Knight`） | `high` | 防御力（`DefenceAddedRatio`）×1<br>速度（`SpeedDelta`）×1.25<br>效果抵抗（`StatusResistanceBase`）×0.75 |
| 开拓者·存护 | `8004` | 存护（`Knight`） | `high` | 防御力（`DefenceAddedRatio`）×1<br>速度（`SpeedDelta`）×1.25<br>效果抵抗（`StatusResistanceBase`）×0.75 |

### hybrid-direct-break（3）

| 角色名 | ID | Path | Confidence | Non-zero weights 摘要 |
| --- | --- | --- | --- | --- |
| 素裳 | `1206` | 巡猎（`Rogue`） | `high` | 攻击力（`AttackAddedRatio`）×0.75<br>击破特攻（`BreakDamageAddedRatioBase`）×1.25<br>暴击率（`CriticalChanceBase`）×1<br>暴击伤害（`CriticalDamageBase`）×1<br>速度（`SpeedDelta`）×0.75 |
| 雪衣 | `1214` | 毁灭（`Warrior`） | `high` | 攻击力（`AttackAddedRatio`）×0.75<br>击破特攻（`BreakDamageAddedRatioBase`）×1.25<br>暴击率（`CriticalChanceBase`）×1<br>暴击伤害（`CriticalDamageBase`）×1<br>速度（`SpeedDelta`）×0.75 |
| 波提欧 | `1315` | 巡猎（`Rogue`） | `high` | 攻击力（`AttackAddedRatio`）×0.75<br>击破特攻（`BreakDamageAddedRatioBase`）×1.25<br>暴击率（`CriticalChanceBase`）×1<br>暴击伤害（`CriticalDamageBase`）×1<br>速度（`SpeedDelta`）×0.75 |

## 建议抽查样本

建议先抽查以下 18 个候选，覆盖不同命途、ATK/HP/DEF scaling 结构及小样本模板；这只是阅读顺序建议，不改变审核状态。

| Template | 角色 | ID | Path | 当前状态 | 抽查角度（来自推荐数据） |
| --- | --- | --- | --- | --- | --- |
| `direct-dps` | 丹恒 | `1002` | 巡猎 | `unreviewed` | 推荐 scaling 候选：攻击力（`AttackAddedRatio`）；推荐副词条：暴击率、暴击伤害、攻击力、速度 |
| `direct-dps` | 姬子 | `1003` | 智识 | `unreviewed` | 推荐 scaling 候选：攻击力（`AttackAddedRatio`）；推荐副词条：暴击率、暴击伤害、攻击力、速度 |
| `direct-dps` | 刃 | `1205` | 毁灭 | `unreviewed` | 推荐 scaling 候选：生命值（`HPAddedRatio`）；推荐副词条：暴击率、暴击伤害、生命值、速度 |
| `direct-dps` | 千冶•刃 | `1507` | 虚无 | `unreviewed` | 推荐 scaling 候选：生命值（`HPAddedRatio`）；推荐副词条：生命值、暴击率、暴击伤害、速度 |
| `direct-support` | 停云 | `1202` | 同谐 | `unreviewed` | 推荐 scaling 候选：攻击力（`AttackAddedRatio`）；推荐副词条：速度、攻击力、效果抵抗 |
| `direct-support` | 知更鸟 | `1309` | 同谐 | `unreviewed` | 推荐 scaling 候选：攻击力（`AttackAddedRatio`）；推荐副词条：攻击力、攻击力、速度 |
| `break` | 流萤 | `1310` | 毁灭 | `unreviewed` | 推荐 scaling 候选：攻击力（`AttackAddedRatio`）；推荐副词条：击破特攻、速度、攻击力 |
| `break` | 乱破 | `1317` | 智识 | `unreviewed` | 推荐 scaling 候选：攻击力（`AttackAddedRatio`）；推荐副词条：击破特攻、速度、攻击力 |
| `dot-dps` | 卡芙卡 | `1005` | 虚无 | `unreviewed` | 推荐 scaling 候选：攻击力（`AttackAddedRatio`）；推荐副词条：攻击力、速度、效果命中 |
| `dot-dps` | 黑天鹅 | `1307` | 虚无 | `unreviewed` | 推荐 scaling 候选：攻击力（`AttackAddedRatio`）；推荐副词条：攻击力、效果命中、速度 |
| `debuff-support` | 三月七·存护 | `1001` | 存护 | `needs-review` | 推荐 scaling 候选：防御力（`DefenceAddedRatio`）；推荐副词条：防御力、速度、效果命中、效果抵抗 |
| `debuff-support` | 杰帕德 | `1104` | 存护 | `needs-review` | 推荐 scaling 候选：防御力（`DefenceAddedRatio`）；推荐副词条：防御力、速度、效果命中、效果抵抗 |
| `sustain` | 罗刹 | `1203` | 丰饶 | `unreviewed` | 推荐 scaling 候选：攻击力（`AttackAddedRatio`）；推荐副词条：攻击力、速度、效果抵抗 |
| `sustain` | 符玄 | `1208` | 存护 | `unreviewed` | 推荐 scaling 候选：生命值（`HPAddedRatio`）、防御力（`DefenceAddedRatio`）；推荐副词条：生命值、防御力、效果抵抗、速度 |
| `sustain` | 开拓者·存护 | `8003` | 存护 | `unreviewed` | 推荐 scaling 候选：防御力（`DefenceAddedRatio`）；推荐副词条：防御力、速度、效果抵抗 |
| `hybrid-direct-break` | 素裳 | `1206` | 巡猎 | `unreviewed` | 推荐 scaling 候选：攻击力（`AttackAddedRatio`）；推荐副词条：暴击率、暴击伤害、攻击力、速度、击破特攻 |
| `hybrid-direct-break` | 雪衣 | `1214` | 毁灭 | `unreviewed` | 推荐 scaling 候选：攻击力（`AttackAddedRatio`）；推荐副词条：击破特攻、暴击率、暴击伤害、攻击力、速度 |
| `hybrid-direct-break` | 波提欧 | `1315` | 巡猎 | `unreviewed` | 推荐 scaling 候选：攻击力（`AttackAddedRatio`）；推荐副词条：击破特攻、速度、攻击力、暴击率、暴击伤害 |
