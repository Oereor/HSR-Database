# Avatar equipment recommendation config investigation

调查日期：2026-08-24  
权威数据源：`../TurnBasedGameData`  
上游提交：`648b08fbdb2e49739ebbf1210c9a189fcfc5e2d7`  
数据版本：`OSPRODWin4.4.0_D15909703_A15802547_L15874300`

本报告只做数据调查，没有修改 production model、serializer、runtime data 或 UI。统计时将同名主表和 `LD` 表按 `AvatarID` 合并；`LD` 在当前数据中是 4 条角色追加记录，不是版本、模式或推荐等级。

## A. Executive Summary

`AvatarEquipRecommend` 的真实模型比名称暗示的范围更窄：它只保存 `AvatarID -> EquipmentList`，其中每个值都是一个可直接解析到 `EquipmentConfig.EquipmentID` 的具体光锥 ID。遗器、位面饰品、主词条、副词条和两项未解释的评分阈值位于独立的 `AvatarRelicRecommend` 表。

整体结构与“角色 -> 光锥 / 遗器套装 / 主副词条”的初步预期一致，没有发现隐藏的 build profile、mode scenario、unlock condition 或 versioned recommendation record。当前 4.4 数据中，`AvatarConfig + AvatarConfigLD`、光锥推荐表和遗器推荐表都恰好覆盖 95 个角色配置，每个具体 `AvatarID` 各有一条记录。

明显但局部的复杂点有三项：

1. `Set4IDList` 与 `Set2IDList` 是两条分开的套装关系；前者只引用四部位 Cavern set，后者只引用两部位 Planar set。
2. 主词条同时存在按槽位的 option lists（`PropertyList3`–`6`）和每槽一个的 `PropertyList`。后者总是等于对应 option list 的第一项，但当前数据未提供字段说明来证明“第一项 = 全局业务优先级”。
3. `ScoreRankList` 每个角色固定有两个整数，但仓库内没有解释表或独立引用，不能把它擅自命名为 B/A/S 阈值或权重。

产品语义最准确的说法是：**游戏官方配置中的角色系统推荐/兜底装备数据**。TextMap 明确说明角色页面的“光锥建议”“遗器建议”通常来自近期活跃玩家统计，并按周刷新；当统计中或样本不足时才显示“系统推荐光锥/遗器套装”。因此静态 Excel 表不能被描述为每周动态使用率数据，也不应虚构使用率、tier、F2P、专武等标签。

建议选择 **Route A：先补足 Relic model，再实现 recommendation**。当前项目已能直接复用 Character、Light Cone、Relic Set 的 normalized identity，但 Relic 详情模型还缺少机器可用的 set category、slot identity 和 stat identity。只先实现推荐会使遗器部分依赖 ID 数值范围或 UI 临时映射，形成明显半成品。

## B. Config Map

### 关键 config

| Config | 角色 |
| --- | --- |
| `AvatarEquipRecommend.json` | 91 条普通来源光锥系统推荐记录；字段只有 `AvatarID`、`EquipmentList` |
| `AvatarEquipRecommendLD.json` | 4 条追加光锥推荐记录；结构与主表完全相同 |
| `AvatarRelicRecommend.json` | 91 条普通来源遗器系统推荐记录 |
| `AvatarRelicRecommendLD.json` | 4 条追加遗器推荐记录；结构与主表完全相同 |
| `AvatarConfig.json` / `AvatarConfigLD.json` | `AvatarID` 的角色实体与命途、稀有度、Release 等身份 |
| `EquipmentConfig.json` | `EquipmentList[] -> EquipmentID`；具体光锥实体 |
| `ItemConfigEquipment.json` | 光锥名称、描述和故事等 item localization 引用；当前网站已据此归一化光锥 |
| `RelicSetConfig.json` | `Set4IDList[]`、`Set2IDList[] -> SetID`；套装名称、set skill、release version |
| `RelicSetSkillConfig.json` | 套装 2 件/4 件效果；决定套装能力，而非 recommendation 自身语义 |
| `RelicDataInfo.json` | `SetID -> pieces`；四部位 set 为 `HEAD/HAND/BODY/FOOT`，两部位 set 为 `NECK/OBJECT` |
| `RelicBaseType.json` | 槽位代码、槽位名称与各槽允许的主词条类型 |
| `AvatarPropertyConfig.json` | `PropertyType` 的名称、遗器显示名称、筛选编号和图标 |
| `RelicMainAffixConfig.json` | 主词条 property 的具体 affix/value 配置；recommendation 只保存 property type，不保存 affix ID |
| `RelicSubAffixConfig.json` | 副词条 property 的具体 affix/value 配置；recommendation 只保存 property type |
| `TextMapCHS.json` | Character、Light Cone、Relic set、slot、stat 名称，以及“光锥建议/遗器建议”的产品说明 |

`GridFightRoleRecommendEquip.json` 和 `GridFightEquipRecommendRole.json` 也包含 `RecommendEquip`，但它们引用 `3503xxxx` 的 GridFight mini-game 装备，并按 `FrontBackType` 区分。它们不是角色常规 Light Cone/Relic 推荐关系，不能并入本模型；它们反而证明搜索 `Equip` 关键字后必须按 entity namespace 和 explicit target 排除同名玩法表。

### 完整 relation graph

```text
AvatarConfig / AvatarConfigLD
  PK: AvatarID
  ├─ 1:1 AvatarEquipRecommend / AvatarEquipRecommendLD
  │     PK/FK: AvatarID
  │     └─ EquipmentList[]
  │          └─ EquipmentConfig.EquipmentID
  │               ├─ concrete Light Cone identity
  │               ├─ EquipmentName -> TextMapCHS
  │               ├─ Rarity
  │               └─ AvatarBaseType (Path compatibility)
  │
  └─ 1:1 AvatarRelicRecommend / AvatarRelicRecommendLD
        PK/FK: AvatarID
        ├─ Set4IDList[]
        │    └─ RelicSetConfig.SetID
        │         └─ RelicDataInfo: HEAD/HAND/BODY/FOOT
        ├─ Set2IDList[]
        │    └─ RelicSetConfig.SetID
        │         └─ RelicDataInfo: NECK/OBJECT
        ├─ PropertyList3[] -> AvatarPropertyConfig.PropertyType (BODY options)
        ├─ PropertyList4[] -> AvatarPropertyConfig.PropertyType (FOOT options)
        ├─ PropertyList5[] -> AvatarPropertyConfig.PropertyType (NECK options)
        ├─ PropertyList6[] -> AvatarPropertyConfig.PropertyType (OBJECT options)
        ├─ PropertyList[4]
        │    └─ RelicType + PropertyType (one selected/default pair per variable slot)
        ├─ SubAffixPropertyList[] -> AvatarPropertyConfig.PropertyType
        └─ ScoreRankList[2] -> unresolved numeric semantics
```

推荐表本身没有 title、description、TextMap hash、intermediate group、condition、unlock、scene、mode、timestamp 或 version 字段。

## C. Character Ownership

ownership 是直接且显式的：两类 recommendation row 都保存 `AvatarID`，并可直接关联 `AvatarConfig.AvatarID` 或 `AvatarConfigLD.AvatarID`。不需要名称匹配、ID 相似性、skill identity 或 Path 推断。

当前数据的 cardinality：

- 95 个 `AvatarConfig + AvatarConfigLD` records。
- 95 个合并后的 `AvatarEquipRecommend` records。
- 95 个合并后的 `AvatarRelicRecommend` records。
- 每一张推荐表中 `AvatarID` 都唯一；一个具体 `AvatarID` 不会出现多个 recommendation records。
- 三个集合完全一致，没有缺失或额外的 recommendation-only avatar。
- 95 个角色配置均为 `Release: true`；未发现 NPC、test 或 internal avatar 混入这两张推荐表。

特殊 identity 仍按具体 playable avatar identity 建模：

- 三月七：`1001`（存护）与 `1224`（巡猎）是两个独立 `AvatarID`，各自有独立推荐。
- 开拓者：`8001`–`8010` 按性别和命途分别拥有独立推荐。男女同命途通常数据相同，但 ownership 仍是各自 `AvatarID`，不能合并成一个无性别 recommendation key。
- `LD` 追加的 `1014`、`1015`、`1508`、`1509` 也直接属于对应 `AvatarConfigLD.AvatarID`，没有间接 group ownership。

因此未来 normalized record 的主键至少应保留 concrete `avatarId`；是否在展示层共享男女开拓者内容，是 presentation decision，不应改变数据 ownership。

## D. Light Cone Recommendation

### Target entity

`EquipmentList` 直接引用具体 `EquipmentConfig.EquipmentID`。它不是 rarity group、Path group、tag 或中间 recommendation group。当前 262 个 list entries 全部解析成功，共引用 113 个不同光锥。

### Cardinality

| 每角色光锥数 | 角色数 |
| ---: | ---: |
| 2 | 23 |
| 3 | 72 |

没有空 list，没有单项或超过三项的记录，也没有同一 list 内重复 ID。

### Ordering and alternatives

配置保存稳定数组顺序，但没有 `Priority`、`Order`、`Tier`、`Category`、`Label`、`Condition` 或概率/使用率字段。TextMap 只证明动态“光锥建议排序”可按使用率排序，并在数据不足时显示系统推荐；它没有证明静态 `EquipmentList` 的第 1/2/3 项分别是什么业务等级。

结论：

> Ordering exists in data, but semantic priority is not confirmed.

数组显然表达多个可展示的推荐候选，但没有 record-level alternative group。不能从当前表把它们命名为“专武 / 次选 / F2P”。稀有度组合也不支持这种硬编码：95 个角色中出现 12 种 4★/5★序列，包括 13 个全 5★ list、3 个全 4★ list，以及多个以 4★ 开头的 list；没有推荐 3★光锥。

所有推荐光锥的 `AvatarBaseType` 都可与所属角色的命途兼容；这是目标实体本身的显式字段，不需要通过名称推断。

## E. Relic / Planar Recommendation

### Cavern Relic

`Set4IDList` 直接引用 `RelicSetConfig.SetID`。所有被引用 set 都通过 `RelicDataInfo` 拥有 `HEAD/HAND/BODY/FOOT` 四个 pieces，并在 `RelicSetSkillConfig` 中提供 2 件与 4 件效果。因此它指向 **四部位 Cavern Relic set entity**，不是具体 relic item。

| 每角色 `Set4IDList` 数量 | 角色数 |
| ---: | ---: |
| 2 | 2 |
| 3 | 93 |

只有 `1501`、`1502` 各有两个，其余角色均为三个。共引用 32 个不同 Cavern sets，所有 ID 均可解析。

它支持 4pc 的方式是推荐具有 4 件套效果的 set entity；表中没有 `requiredPieces: 4` 字段，也不构造具体四件 item。`Set4IDList` 中的每个 ID 是一个独立可选 set，不是把多个 ID 组合成同一方案。

### 2pc + 2pc

没有找到显式的 Cavern `2pc + 2pc` 组合结构。虽然每个四部位 set 自身也有 2 件效果，但 `Set4IDList: [A, B, C]` 只是一列 set IDs；没有 pair/group/nesting 字段能证明 `(A+B)`、`(A+C)` 或顺序配对。未来 UI 不应把相邻两个 set 自动画成一个 2+2 build。

### Planar Ornament

`Set2IDList` 同样引用 `RelicSetConfig.SetID`，但所有目标 set 都通过 `RelicDataInfo` 只包含 `NECK` 和 `OBJECT` 两个 pieces。因此 Planar Ornament 与 Cavern Relic 共用同一个 Relic Set entity/config family，通过目标 set 的 piece types（同时也与 `Set2IDList` 字段 ownership 一致）区分。

| 每角色 `Set2IDList` 数量 | 角色数 |
| ---: | ---: |
| 3 | 95 |

共引用 28 个不同 Planar sets，全部解析成功。它不是与 Cavern 完全无关的第二种 entity，也不是同一无分类 list；在 recommendation row 中是独立字段关系：

```text
Character -> Set4IDList -> Cavern Relic sets
Character -> Set2IDList -> Planar Ornament sets
```

### Ordering and alternatives

两个 set lists 都有数组顺序，但没有 label、priority、score、usage ratio 或 nested方案。它们表达多个候选 set；是否按最佳/次佳排列无法由当前 config 证明。

> Ordering exists in data, but semantic priority is not confirmed.

## F. Main / Sub Stats

### Main stat representation

推荐使用 `AvatarPropertyConfig.PropertyType` 的字符串 code，不使用 TextMap 文本，也不直接保存 `RelicMainAffixConfig.AffixID`。19 个出现过的 property codes 均可解析到 `AvatarPropertyConfig`，并且每个 option 都属于 `RelicBaseType.ValidPropertyList` 允许的对应槽位。

四个 variable-main-stat slots 的字段映射是：

| Recommendation field | RelicType | 中文槽位 |
| --- | --- | --- |
| `PropertyList3` | `BODY` | 躯干 |
| `PropertyList4` | `FOOT` | 脚部 |
| `PropertyList5` | `NECK` | 位面球 |
| `PropertyList6` | `OBJECT` | 连结绳 |

头部与手部没有 recommendation field，因为 `RelicBaseType` 显式限定其主词条分别只能是 `HPDelta`、`AttackDelta`。

每个 slot 的 option 数量：

| Slot | 1 option | 2 options |
| --- | ---: | ---: |
| BODY | 30 | 65 |
| FOOT | 57 | 38 |
| NECK | 54 | 41 |
| OBJECT | 47 | 48 |

数据另有 `PropertyList`，95 个角色均固定包含四项，每项为 `{ RelicType, PropertyType }`，顺序固定为 BODY、FOOT、NECK、OBJECT。全量验证显示，其中每个 `PropertyType` 都恰好等于对应 option list 的第一项。

最保守的解释是：

- `PropertyList3`–`6`：该槽位的系统推荐有效 options。
- `PropertyList`：每槽选出一个具体/default property，可能供需要固定组合的消费方使用。

但是没有 schema 文档或 consumer code 证明 option list 的后续项是降序 preference，也没有条件字段说明不同 option 何时生效。不能仅凭 `[CritRate, CritDamage]` 宣称它们是带顺序的“暴击率优先、暴伤次选”；也不能把四个 option lists 的笛卡尔积自动称为 build variants。

### Sub-stat representation

`SubAffixPropertyList` 是 property type code 数组，长度分布为：

| 副词条数 | 角色数 |
| ---: | ---: |
| 2 | 5 |
| 3 | 33 |
| 4 | 50 |
| 5 | 7 |

没有重复 property，没有 weight、score、group 或 per-slot condition。TextMap 只把这些属性描述为“推荐副属性/有效副属性”，没有说明数组顺序是 priority。

> Ordering exists in data, but semantic priority is not confirmed.

### ScoreRankList

所有角色都有两个整数，值随角色变化。全仓库搜索没有找到解释这些数字的 companion config、enum 或外键目标；TextMap 虽提到遗器智能搭配具有 B/A/S 评级，但仅凭两个阈值和该文案不足以证明精确映射。未来模型如需保留，应先用中性 raw 字段或继续调查客户端 consumer，不能命名成已确认的 `sRankThreshold/aRankThreshold`。

## G. Version / Mode / Ownership

```text
Version dimension:
Not found in recommendation records.
```

`AvatarEquipRecommend` 和 `AvatarRelicRecommend` 没有 version、patch、season、timestamp、revision、begin/end version 或 replacement chain。当前 repository snapshot 是游戏 4.4 数据，旧版本差异只存在于 Git history，不构成 runtime version model。

`RelicSetConfig.ReleaseVersion` 属于目标 Relic Set entity 的发布元数据，不属于 recommendation relation 的生效版本。不能据此推导“某推荐从该版本开始”或保留 recommendation 历史。

```text
Mode dimension:
Not found.
```

两张 avatar recommendation 表没有 mode、scene、content、difficulty 或 activity 字段，也没有按 MoC、PF、AS、AA、剧情或刷本拆分的 related record。

`GridFight*Recommend*` 是另一个装备 namespace 的 mini-game 独立系统，不是 mode-specific Light Cone/Relic recommendation。没有找到 `AvatarEquipRecommend -> GridFight` 或反向 relation。

```text
Source semantics:
Official static system recommendation / fallback config for character Light Cones and Relics.
```

证据：

- config 以 `AvatarID` 为 owner，并直接列出光锥、套装和属性。
- TextMap 的“光锥建议”说明：数据通常来自近期活跃玩家统计，每周刷新；统计中或数据不足时显示“系统推荐光锥”。
- TextMap 的“遗器建议”说明：套装和主属性通常来自近期活跃玩家统计；数据不足时显示“系统推荐遗器套装”。
- 其他活动说明明确使用“系统推荐主属性”“遗器套装和属性推荐使用系统推荐数据”。

因此这套静态表可合理用于展示“官方配置的系统推荐”，但不能伪装成当前服务器每周使用率排名。仓库没有客户端 UI controller 源码，无法证明具体 prefab/controller 的读取函数或请求动态统计数据的接口。

### Localization

recommendation records 自己没有 TextMap fields，所以没有 per-character title、label、解释、condition text 或方案名称。展示文本只能来自：

- 光锥实体名称/描述；
- 遗器套装名称/效果；
- `AvatarPropertyConfig` 的 stat 名称；
- `RelicBaseType` 的 slot 名称；
- TextMap 中通用“光锥建议”“遗器建议”“推荐主属性”等界面文案。

未来 UI 应以 entity list + stat list 为主；不能期待每条推荐自带 mechanic explanation。

## H. Representative Examples

以下名称来自当前 HSR-Database 已归一化 CHS entities；ID relation 来自 recommendation configs。

### 1. `1001` 三月七·存护（4★、旧角色、存护）

```text
Avatar 1001
├─ Light Cones: 21002 余生的第一天; 23005 制胜的瞬间; 24002 记忆的质料
├─ Cavern sets: 103 净庭教宗的圣骑士; 128 自匿星芒的隐士; 106 戍卫风雪的铁卫
├─ Planar sets: 304 筑城者的贝洛伯格; 310 折断的龙骨; 317 沉陆海域露莎卡
├─ Main options
│  ├─ BODY: DefenceAddedRatio, StatusProbabilityBase
│  ├─ FOOT: SpeedDelta, DefenceAddedRatio
│  ├─ NECK: DefenceAddedRatio
│  └─ OBJECT: DefenceAddedRatio
├─ PropertyList fixed/default tuple: Defence / Speed / Defence / Defence
├─ Substats: DefenceAddedRatio, SpeedDelta, StatusProbabilityBase, StatusResistanceBase
└─ ScoreRankList: [279, 216] (semantics unresolved)
```

三月七·巡猎 `1224` 是另一条独立 avatar/recommendation，不与 `1001` 共用 ownership。

### 2. `1201` 青雀（4★、智识）

```text
Avatar 1201
├─ Light Cones: 21034 今日亦是和平的一日; 21027 早餐的仪式感; 23010 拂晓之前
├─ Cavern sets: 108 繁星璀璨的天才; 102 野穗伴行的快枪手; 111 流星追迹的怪盗
├─ Planar sets: 309 繁星竞技场; 305 星体差分机; 301 太空封印站
├─ Main options: BODY [CriticalChanceBase, CriticalDamageBase]; FOOT [SpeedDelta];
│               NECK [QuantumAddedRatio]; OBJECT [AttackAddedRatio]
├─ PropertyList fixed/default tuple: Crit Rate / Speed / Quantum DMG / ATK%
├─ Substats: CriticalChanceBase, CriticalDamageBase, AttackAddedRatio, SpeedDelta
└─ ScoreRankList: [346, 287]
```

### 3. `1301` 加拉赫（4★、丰饶、两条光锥）

```text
Avatar 1301
├─ Light Cones: 21035 何物为真; 21021 等价交换
├─ Cavern sets: 119 荡除蠹灾的铁骑; 111 流星追迹的怪盗; 101 云无留迹的过客
├─ Planar sets: 316 劫火莲灯铸炼宫; 307 盗贼公国塔利亚; 302 不老者的仙舟
├─ Main options: BODY [HealRatioBase]; FOOT [SpeedDelta];
│               NECK [HPAddedRatio, DefenceAddedRatio];
│               OBJECT [BreakDamageAddedRatioBase, SPRatioBase]
├─ PropertyList fixed/default tuple: Outgoing Healing / Speed / HP% / Break Effect
├─ Substats: SpeedDelta, BreakDamageAddedRatioBase, StatusResistanceBase
└─ ScoreRankList: [293, 237]
```

### 4. `1403` 缇宝（5★ limited、同谐、较新角色）

```text
Avatar 1403
├─ Light Cones: 23038 如果时间是一朵花; 21018 舞！舞！舞！
├─ Cavern sets: 124 哀歌覆国的诗人; 108 繁星璀璨的天才; 102 野穗伴行的快枪手
├─ Planar sets: 319 谧宁拾骨地; 302 不老者的仙舟; 317 沉陆海域露莎卡
├─ Main options: BODY [CriticalDamageBase, CriticalChanceBase]; FOOT [HPAddedRatio];
│               NECK [QuantumAddedRatio, HPAddedRatio]; OBJECT [SPRatioBase, HPAddedRatio]
├─ PropertyList fixed/default tuple: Crit DMG / HP% / Quantum DMG / Energy Regen
├─ Substats: CriticalChanceBase, CriticalDamageBase, HPAddedRatio
└─ ScoreRankList: [324, 268]
```

### 5. `8001` 开拓者·毁灭（特殊 identity）

```text
Avatar 8001
├─ Light Cones: 23015 比阳光更明亮的; 21026 汪！散步时间！; 21019 在蓝天下
├─ Cavern sets: 105 街头出身的拳王; 122 识海迷坠的学者; 102 野穗伴行的快枪手
├─ Planar sets: 309 繁星竞技场; 301 太空封印站; 306 停转的萨尔索图
├─ Main options: BODY [CriticalChanceBase, CriticalDamageBase]; FOOT [SpeedDelta];
│               NECK [PhysicalAddedRatio]; OBJECT [AttackAddedRatio]
├─ Substats: CriticalChanceBase, CriticalDamageBase, AttackAddedRatio, SpeedDelta
└─ ScoreRankList: [346, 287]
```

`8002`（女开拓者·毁灭）的内容相同但 record 独立；`8003/8004`、`8005/8006`、`8007/8008`、`8009/8010` 分别是其他命途的独立 recommendation ownership。

### 6. `1508` 远坂凛（5★、`LD` 追加、近期角色）

```text
Avatar 1508
├─ Light Cones: 23061 星火悄然闪耀; 23037 向着不可追问处; 24004 不息的演算
├─ Cavern sets: 108 繁星璀璨的天才; 122 识海迷坠的学者; 102 野穗伴行的快枪手
├─ Planar sets: 324 天国@直播间; 309 繁星竞技场; 301 太空封印站
├─ Main options: BODY [CriticalChanceBase, CriticalDamageBase];
│               FOOT [AttackAddedRatio, SpeedDelta];
│               NECK [QuantumAddedRatio, AttackAddedRatio];
│               OBJECT [AttackAddedRatio, SPRatioBase]
├─ PropertyList fixed/default tuple: Crit Rate / ATK% / Quantum DMG / ATK%
├─ Substats: CriticalChanceBase, CriticalDamageBase, AttackAddedRatio, SpeedDelta
└─ ScoreRankList: [346, 288]
```

这证明 `LD` 记录在关系模型上没有特殊分支；它们只需与现有 character LD merge 规则相同地按 ID 合并。

## I. Dataset Statistics

### Coverage and identity

| Metric | Result |
| --- | ---: |
| Avatar configs（main + LD） | 95 |
| Light Cone recommendation records | 95 |
| Relic recommendation records | 95 |
| 有 recommendation 的 playable avatar 数量 | 95 |
| 每具体 AvatarID 的 Light Cone records | 1（95/95） |
| 每具体 AvatarID 的 Relic records | 1（95/95） |
| EquipmentConfig entities | 165 |
| 被推荐的不同 Light Cones | 113 |
| RelicSetConfig entities | 60 |
| 被 `Set4IDList` 引用的不同 sets | 32 |
| 被 `Set2IDList` 引用的不同 sets | 28 |
| recommendation 使用的不同 property codes | 19 |

### Distribution

| Dimension | Distribution |
| --- | --- |
| Light Cones per avatar | 2: 23；3: 72 |
| Cavern sets per avatar | 2: 2；3: 93 |
| Planar sets per avatar | 3: 95 |
| BODY main options | 1: 30；2: 65 |
| FOOT main options | 1: 57；2: 38 |
| NECK main options | 1: 54；2: 41 |
| OBJECT main options | 1: 47；2: 48 |
| `PropertyList` entries | 4: 95 |
| Substat options | 2: 5；3: 33；4: 50；5: 7 |
| `ScoreRankList` entries | 2: 95 |

### Integrity checks

- Duplicate recommendation records：0。
- 同一 list 内 duplicate IDs/properties：0。
- Unresolved avatar IDs：0。
- Unresolved equipment IDs：0。
- Unresolved set IDs：0。
- Unresolved property codes：0。
- 与 slot allowed-property 不一致的主词条 options：0。
- 推荐引用的 entity localization missing：0（按当前网站 normalized CHS catalogs 核对）。
- recommendation-specific localization fields：不存在，不属于 missing。

### Outliers / edge cases

- `1501` 和 `1502` 的 `Set4IDList` 只有 2 项；UI 不能硬编码三个 Cavern cards。
- 23 个角色只有 2 个推荐光锥；UI 不能硬编码三个 Light Cone cards。
- 副词条长度为 2–5；UI 不能假设固定四项。
- 每槽主词条 option 数为 1 或 2；`PropertyList` 固定只选其中一个。
- 开拓者男女同命途数据重复但 ownership 不重复；不能因 deep equality 合并 ID。
- `LD` 追加表必须合并，否则会遗漏 4 个当前 Release avatars。
- 数组顺序稳定存在，但除 `PropertyList` 与 option-list first item 的结构一致性外，没有业务优先级证据。

## J. Existing HSR-Database Integration

### 可直接复用

- `Character.id` 已等于 concrete `AvatarID`，当前 95 个推荐 owner 全部可直接解析。
- `LightCone.id` 已等于 `EquipmentID`，113 个被推荐光锥全部可直接引用；名称、稀有度、命途、被动与属性不应复制到 recommendation record。
- `RelicSet.id` 已等于 `SetID`，60 个 set 都已有 overview/detail normalized entity；推荐只应保存 set IDs。
- 现有 TextMap resolver、`AvatarPropertyConfig` 和 `RelicBaseType` 可以成为 stat/slot normalization 的权威来源。
- 现有 LD merge primitive (`mergeConfigSources`) 可按相同规则扩展到两张 recommendation config，而不是另写名称或位置判断。

### Recommendation-specific semantics

未来最小 recommendation model 可以保持简单，例如：

```ts
interface AvatarEquipmentRecommendation {
  avatarId: string;
  lightConeIds: string[];
  cavernSetIds: string[];
  planarSetIds: string[];
  mainStatOptions: Array<{
    slot: 'BODY' | 'FOOT' | 'NECK' | 'OBJECT';
    propertyTypes: string[];
    selectedPropertyType: string;
  }>;
  subStatPropertyTypes: string[];
  rawScoreRanks?: [number, number]; // only if retained with unresolved semantics
}
```

这不是本轮实现建议，只用于说明 ownership 边界。不要为当前数据引入 mode/scenario/strategy/variant rule engine。

### Relic model dependency

当前 `RelicSet` presentation model 有 effects、pieces 和 sources，但要可靠实现 recommendation，最低还需要：

1. **机器可用的 set category**：`cavern | planar`，由真实 piece types 归一化，而不是在 UI 用 `SetID < 300` 之类数值启发式。
2. **机器可用的 slot code**：保留 `HEAD/HAND/BODY/FOOT/NECK/OBJECT`，中文名称只做 presentation。
3. **normalized relic stat identity**：至少含 `propertyType`、localized relic label、icon、允许的 main slots、是否可为 substat。
4. **set effect requirement**：保留 `required: 2 | 4`，以正确解释 Cavern set 可提供 4pc；但不要把多个推荐 set 自动组合为 2+2。
5. **ID-based references**：recommendation 只引用 `RelicSet.id` 和 stat code，不 duplicate 套装名、版本、效果、piece 文本。

### 不应 flatten / duplicate

- 不复制光锥名称、稀有度、命途或被动。
- 不复制遗器套装名称、ReleaseVersion、effects 或 pieces。
- 不把 Planar set 变成 recommendation 私有名称字符串。
- 不把 property code 提前翻译成不可关联的中文字符串。
- 不把数组 index 命名成 `best/secondBest/tier`。
- 不把 `PropertyList3`–`6` flatten 成四个中文 UI 字段后丢失 slot identity。
- 不把男女开拓者或不同命途 AvatarID 合并为一个 domain owner。

## K. Confirmed Facts vs Unknowns

### Confirmed

- Primary configs 是 `AvatarEquipRecommend(.json/.LD.json)` 和 `AvatarRelicRecommend(.json/.LD.json)`。
- 每条 record 直接以 `AvatarID` 属于一个具体 Character。
- 当前每个具体 Character ID 在每张表中恰有一条 recommendation record。
- Light Cone recommendation 直接指向 concrete `EquipmentID`。
- Relic recommendation 直接指向 `RelicSetConfig.SetID`，不是 relic item ID。
- `Set4IDList` 的目标都是四部位 Cavern sets；目标 set 具有 4pc effects。
- `Set2IDList` 的目标都是 `NECK/OBJECT` Planar sets。
- Cavern 与 Planar 是同一 Relic Set entity family 中的两类目标，但 recommendation 使用两个独立字段。
- main stats 使用 property type codes，按 BODY/FOOT/NECK/OBJECT 保存 1–2 个 options。
- `PropertyList` 每槽保存一个具体 property，且当前总等于相应 option list 第一项。
- substats 使用 property type codes，保存 2–5 个有效属性。
- 所有 avatar/equipment/set/property references 均解析成功。
- recommendation config 没有自己的 localization fields。
- TextMap 明确区分每周玩家统计建议与数据不足时的系统推荐。
- 当前 HSR-Database 的 Character、Light Cone、Relic Set IDs 可直接承接这些关系。

### Unresolved

- Light Cone、Cavern set、Planar set 数组顺序是否代表严格 priority。
- main-stat option list 后续项是否是降序 preference，或只是多个有效 options。
- `PropertyList` 的准确 consumer 语义：默认组合、系统固定选择、生成用 fallback，还是其他用途。
- `SubAffixPropertyList` 顺序是否代表 priority。
- `ScoreRankList` 两个整数的准确含义及与 B/A/S 文案的映射。
- 客户端具体哪个 controller/prefab 直接读取这些静态表，以及动态玩家统计数据的服务端 schema。
- `LD` 缩写的上游正式定义；当前只确认它是需要合并的同构追加来源。

### Not Present

- No mode-specific recommendation relation was found.
- No explicit recommendation version/patch/season/timestamp dimension was found.
- No recommendation unlock condition was found.
- No scene/content ownership was found.
- No per-item usage rate, score, probability, tier or category was found.
- No explicit signature/F2P/rarity-role labels were found.
- No explicit Cavern 2pc + 2pc combination structure was found.
- No conditional alternative groups were found.
- No recommendation-specific explanatory text or per-character labels were found.
- No unresolved IDs, duplicate records or non-release/test avatars were found in the current dataset.

### Mandatory questions: direct answers

1. Primary config：`AvatarEquipRecommend`（光锥）和独立的 `AvatarRelicRecommend`（遗器/属性），两者均含同构 `LD` 追加表。
2. Character binding：直接 `AvatarID` foreign key。
3. Multiple records per Character：当前否；每具体 `AvatarID` 各一条。
4. Light Cone target：concrete `EquipmentConfig.EquipmentID`。
5. Light Cone order semantics：有顺序，优先级未确认。
6. Relic target：`RelicSetConfig.SetID`。
7. 4pc：目标 Cavern set 具有 4 件效果；不是具体四件 item 组合。
8. 2pc + 2pc：无显式组合支持。
9. Planar：独立 `Set2IDList`，目标仍是 Relic Set entity，以 `NECK/OBJECT` pieces 区分。
10. Main stats：四个槽位 option lists + 一个每槽单选的 `PropertyList`，均使用 property type code。
11. Substats：`SubAffixPropertyList` property codes。
12. Stat order priority：未确认。
13. Alternatives：有多个候选值，但无命名/条件化 alternative groups。
14. Version dimension：recommendation record 中没有。
15. Mode dimension：没有。
16. Localization/explanation：record 自身没有；只有目标实体/stat/通用 UI 文案。
17. Product semantics：官方静态系统推荐/玩家统计不足时的 fallback，不是动态使用率数据本身。
18. Existing normalized links：Character、Light Cone、Relic Set 都可直接按 ID 关联。
19. Minimum Relic capabilities：set category、slot code、normalized stat identity、set effect requirement、ID-based references。
20. Edge cases：2/3 个光锥、2/3 个 Cavern sets、固定 3 个 Planar sets、1/2 主词条 options、2–5 副词条、Trailblazer concrete IDs、LD merge、未知 score semantics。

## L. Recommended Next Step

选择 **Route A**：

```text
Relic model normalization
→ Relic Overview / Detail exposes category + slots + stat identities
→ Avatar equipment recommendation normalized model
→ Character recommendation UI and cross-links
```

理由不是 recommendation 本身复杂，而是它的大部分非光锥内容都需要 Relic domain 提供稳定 identity。当前已有 `RelicSet` 页面可作为基础，但若没有 `cavern/planar` category、raw slot code 和 normalized property identity，recommendation implementation 只能：

- 在 UI 重复解析套装 pieces；
- 用 SetID 数值范围猜分类；
- 把 property code 临时翻译成字符串；
- 或只完成 Light Cone 半边。

建议下一阶段先做一个**最小增量**的 Relic normalization，而不是扩大成遗器实例/强化/随机词条系统：

1. 为 set 加入由 `RelicDataInfo.Type` 验证的 `category` 与机器可用 piece slot codes。
2. 新增共享 `RelicProperty`/slot primitives，来源为 `AvatarPropertyConfig + RelicBaseType`。
3. 验证现有 Relic Overview/Detail 能消费这些字段且不改变展示语义。
4. 随后一次性实现完整 recommendation record，直接引用现有 Character、Light Cone、Relic Set 和新 stat primitives。
5. `ScoreRankList` 在找到明确 consumer 证据前不进入用户可见语义；可以暂不抽取，或以明确 unresolved 的 raw diagnostics 保留。

完成上述调查后应停止，不开始正式实现。
