# Enka Player Data Migration Audit

调查日期：2026-09-22  
调查范围：Enka 与 MiHoMo 同 UID fixture、TurnBasedGameData、StarRailRes 和当前 HSR-Database Player Info/静态数据管线。  
调查性质：只读分析与一次性内存脚本验证；未修改生产代码、未切换 provider、未安装依赖。

## 1. Executive Summary

### 1.1 结论

**Enka 是更适合 HSR-Database 的玩家运行时事实源，但它目前还不是 MiHoMo 的无条件 drop-in replacement。**

对当前 Player Info V1 的玩家资料、角色培养、星魂、光锥、遗器、行迹以及本地实体解析而言，Enka 提供的信息足够，并且保留了 `_assist`、`affixId`、`cnt`、`step`、`enhancedId`、`dressedSkinId`、展示区域位置等 MiHoMo 已折叠或遗漏的信息。它与 HSR-Database 的“运行时玩家状态 + 本地静态游戏数据”架构更匹配。

阻止立即完全替换的唯一重要功能差距是：Enka fixture 不直接提供 MiHoMo 的角色最终 `statistics/attributes/additions/properties`。TurnBasedGameData 包含重建这些数值所需的大部分基础事实，但当前 HSR-Database 尚无完整的玩家 build stat aggregator；光锥被动、套装、行迹、星魂加级及部分特殊角色规则还没有经过全样本合成验证。因此：

- **Profile、角色培养、装备、遗器、行迹页面数据：Go**，可由 Enka 替代。
- **当前最终面板属性：Conditional Go**，先完成并验证 provider-neutral stat synthesis；在此之前不能宣称完整 UI 等价。
- **Relic Score / farming benchmark：Go**。Enka raw 遗器数据足够，而且比只依赖格式化最终值更适合作为 canonical input。

### 1.2 关键实测结果

- 两份文件均属于 UID `168902602`；玩家昵称、等级、均衡等级、签名、好友数一致。
- 两份均有 6 个角色、36 件遗器、116 个 skill-tree 节点；角色、光锥、遗器 TID 与等级整体对齐。
- 35/36 件遗器的词条状态一致；角色 `1409` 的 TID `61252` 在两份响应中词条组合不同，应解释为同类型遗器被替换/抓取时点不同，而不是 schema 差异。
- Enka 缺失 `rank` 的两个角色在 MiHoMo 中均为 `rank: 0`；其余 4 个角色的 `rank` 也全部一致。`raw.rank ?? 0` 得到 6/6 匹配。
- Enka 的 3 个 `_assist: true` 角色与 3 个普通展示角色共享 `pos=1/2`，证明 `pos` 是**展示区域内位置**，不是全局唯一位置。
- 36 个主词条和 144 个副词条全部能从 `RelicConfig`、`RelicMainAffixConfig`、`RelicSubAffixConfig` 重建 Enka `_flat.props`；最大绝对误差约 `1.5e-8`。
- 21/144 个副词条缺失 `step`。本 fixture 中它们全部满足 `final = BaseValue × cnt`，即有效聚合 step 为 0；这仍不足以单凭一个 UID 宣称所有未来响应都保证“missing step === 0”。
- 6 个光锥的 18 个 `_flat.props` 全部可由 `EquipmentPromotionConfig` 精确重建；光锥名称 hash 也全部等于 `EquipmentConfig.EquipmentName.Hash`。
- Enka 角色 skill-tree 原始等级与 MiHoMo 有 112/116 相同；4 个差异全在 E6 开拓者 `8006`，MiHoMo 已加上星魂的 `SkillAddLevelList`，Enka 保留原始投入等级。
- MiHoMo `space_info` 在本 fixture 中存在明显的字段错位迹象：`avatar_count=90` 等于 Enka `equipmentCount`，`light_cone_count=234` 等于 Enka `musicCount`，`music_count=48` 等于 Enka `avatarCount`。这不是可依赖的 canonical 映射。

### 1.3 建议

采用：

```text
EnkaRawResponse
  -> 窄校验 + transport metadata 分离
  -> Enka adapter（保留 slot/assist/raw roll semantics）
  -> provider-neutral PlayerProfile
  -> 现有本地 entity/text/asset resolver
  -> 新增的小型 relic-affix + player-stat synthesis 层
  -> UI / Relic Score
```

不要在 canonical model 中引入 `enkaFoo`/`mihomoFoo` 字段，也不要按 `avatarId` 去重 Player Character Build。

## 2. Inputs and Methodology

### 2.1 输入

- `Enka-API-Integration-01/168902602-Enka.json`
- `Enka-API-Integration-01/168902602-MiHoMo.json`
- `TurnBasedGameData/ExcelOutput` 和 `TextMap`
- `StarRailRes/index_new`（只用于交叉检查，未替代 TurnBasedGameData 作为结构化事实源）
- 当前 HSR-Database：
  - `api/_player/parse.ts`
  - `src/lib/player/contract.ts`
  - `src/lib/player/character.ts`
  - `src/lib/player/equipment.ts`
  - `src/lib/player/resolve.ts`
  - `scripts/data/domain/{character,light-cone,relic}.ts`
  - `scripts/data/stats.ts`

### 2.2 方法

一次性 Python stdin 脚本完成了：

1. JSON 结构、层级、数量和 key inventory；
2. 按角色、光锥、遗器、skill-tree ID 的一一对照；
3. `rank`、`enhancedId`、skin、position/assist 的交叉检查；
4. 对全部 36 件遗器、180 个主/副词条值进行静态配置重建；
5. 单独枚举 21 个 missing `step`；
6. 对 6 个光锥的 18 个基础属性进行静态配置重建；
7. 将全部 116 个 `pointId` 连接到 `AvatarSkillTreeConfig` 并比较 MiHoMo level normalization。

实验脚本未写入仓库。浮点比较使用按来源精度设置的容差；本次实际最大误差远小于 `1e-6`。

### 2.3 结论标签

- **Confirmed**：由 fixture 与项目/游戏静态配置直接验证。
- **Strongly inferred**：全部当前样本一致，且与配置/游戏机制相符，但缺少正式 schema 保证或跨样本覆盖。
- **Unknown / requires more evidence**：当前 fixture 无法决定。

## 3. Fixture Overview

| 指标 | Enka | MiHoMo | 结论 |
| --- | ---: | ---: | --- |
| 文件大小 | 66,999 bytes（约 65.4 KiB） | 208,583 bytes（约 203.7 KiB） | MiHoMo 因携带名称、资源路径、格式化属性而约为 3.1 倍 |
| 容器最大层级 | 约 9 | 约 7 | Enka relic raw 嵌套更深，不代表信息量更大 |
| 顶层 | `detailInfo`, `ttl`, `uid`, `region` | `player`, `characters` | Enka 明确分离 transport 与 domain payload |
| 角色 | 6 | 6 | ID 集合、顺序相同 |
| 遗器 | 36 | 36 | TID、slot、level 全部对应 |
| skill-tree 节点 | 116 | 116 | PointID 全部对应 |
| 光锥 | 6 | 6 | ID/rank/level/promotion 全部对应 |

两份 fixture 的 UID 均为 `168902602`；Enka 顶层 `uid` 和 `detailInfo.uid` 也一致。玩家核心资料完全一致，角色和装备高度一致，因此足以做 schema 映射。

文件时间显示 MiHoMo fixture 早于 Enka fixture 数日。更重要的内容证据是：角色 `1409` 的手部遗器 `61252` 在 Enka 中为 HP%、防御%、速度、效果抵抗，在 MiHoMo 中为 HP、固定防御、速度、效果命中；同一个 TID 只是遗器类型 ID，不是玩家物品实例 ID。因此最合理解释是玩家换了一件同类型遗器。Enka `recordInfo.relicCount=1703` 与 MiHoMo `space_info.relic_count=1605` 也支持抓取时间不同。

后文的跨 provider 最终值比较会排除这件时点不一致的遗器；静态公式验证不受其影响，因为它只使用各自 Enka raw 与同次 Enka `_flat`。

## 4. Enka Raw Schema

```text
root
├─ uid, region, ttl
└─ detailInfo
   ├─ uid, nickname, level, worldLevel, signature
   ├─ headIcon, personalCardId, platform, friendCount
   ├─ isDisplayAvatar, privacySettingInfo
   ├─ recordInfo
   ├─ playerDisplayArea
   └─ avatarDetailList[]
      ├─ avatarId, pos?, _assist?
      ├─ level, promotion, rank?
      ├─ enhancedId?, dressedSkinId?
      ├─ skillTreeList[] { pointId, level }
      ├─ equipment { tid, rank, level, promotion, _flat }
      └─ relicList[]
         ├─ tid, type, level, mainAffixId
         ├─ subAffixList[] { affixId, cnt, step? }
         └─ _flat { props, setID, setName }
```

Enka `_flat.name`/`setName` 在本 fixture 中不是用户语言文本，而是 TextMap hash 的十进制字符串。这再次说明 `_flat` 是方便层，不应成为 canonical localized text。

## 5. Enka ↔ MiHoMo Mapping

### 5.1 映射原则

- 运行时状态采用 Enka raw ID 和数值。
- 名称、描述、rarity、path/element、图标由 HSR-Database pinned 静态数据解析。
- MiHoMo 的 `display`、名称和远程资源路径不是 Enka 的能力缺失，只是 MiHoMo 预先做了本地项目也能做的解析。
- `statistics` 是例外：它是构建结果而非单个静态实体 metadata；当前项目尚未完整重建。

### 5.2 角色级对应

| Enka | MiHoMo | 语义/差异 |
| --- | --- | --- |
| `avatarId` | `id` | 6/6 exact；Enka number，canonical 建议 string ID |
| `rank ?? 0` | `rank` | 星魂数量；6/6 exact |
| `level` | `level` | 6/6 exact |
| `promotion` | `promotion` | 6/6 exact |
| `enhancedId` | `enhanced: boolean` | Enka 保留具体 profile ID；MiHoMo 只保留布尔值 |
| `dressedSkinId` | 无 | MiHoMo 丢失 |
| `_assist` | 无直接字段 | MiHoMo 将来源折叠进 `pos[]` |
| `pos` | `pos[]` | 非等价；Enka 是区域内位置，MiHoMo 是扁平化后的多个位置 |
| `skillTreeList` | `skill_trees` | PointID exact；level 可能被 MiHoMo 加上星魂 bonus |
| `equipment` | `light_cone` | ID/rank/level/promotion exact；MiHoMo 增补静态解析 |
| `relicList` | `relics` | TID/type/level/affix data 可对应；MiHoMo 增补名称与最终值 |

## 6. Player / Profile Fields

### 6.1 V1 必需

`uid`、`nickname`、`level`、`worldLevel`、`signature`、`headIcon`、`friendCount`、`isDisplayAvatar` 都有直接值。除了头像 metadata 需要本地解析，当前 V1 不依赖 MiHoMo 才能获得这些信息。

### 6.2 有 UI 价值

- `personalCardId`：个人名片身份；MiHoMo fixture 没有。
- `privacySettingInfo`：五个精细隐私开关，比 `isDisplayAvatar` 更丰富。
- `platform`：本例为 `CLOUD_IOS`；可用于诊断或可选 badge，不应成为渲染前置条件。
- `recordInfo`：成就、书籍、角色、装备、音乐、遗器、模拟宇宙/挑战信息。
- `playerDisplayArea`：动态展示槽与照片墙数据；第一版可不渲染，但不应在 adapter 验证前永久丢弃。

### 6.3 `recordInfo` 与 MiHoMo `space_info`

| Enka | 值 | MiHoMo 表面对应 | 值 | 判断 |
| --- | ---: | --- | ---: | --- |
| `achievementCount` | 1660 | `achievement_count` | 1660 | exact |
| `bookCount` | 529 | `book_count` | 529 | exact |
| `avatarCount` | 48 | `music_count` | 48 | MiHoMo 字段疑似错位 |
| `equipmentCount` | 90 | `avatar_count` | 90 | MiHoMo 字段疑似错位；语义上 equipment 为光锥数 |
| `musicCount` | 234 | `light_cone_count` | 234 | MiHoMo 字段疑似错位 |
| `relicCount` | 1703 | `relic_count` | 1605 | 可能是抓取时间差 |
| `maxRogueChallengeScore` | 9 | `universe_level` | 9 | 数值 exact，MiHoMo 命名已解释化 |
| `challengeInfo: {}` | - | `memory_data` | 全部空/0 | parsed expansion |

当前 `PlayerProfile.characterCount` 和 `lightConeCount` 直接读取 MiHoMo `avatar_count/light_cone_count`，因此本 fixture 中实际会显示 90/234，而 Enka raw 表明更可信的值是 48/90。迁移时应从真实 raw 字段重新定义 canonical 名称，不要延续 MiHoMo 的错误命名。

### 6.4 分类

- **A / V1 必需**：UID、nickname、level、worldLevel、signature、headIcon、friendCount、isDisplayAvatar、公开角色 build。
- **B / 潜在 UI 价值**：personalCardId、privacySettingInfo、recordInfo、playerDisplayArea、platform。
- **C / transport metadata**：顶层 `ttl`、`region`（region 也可进入 request context，但不是角色 domain）。
- **D / 可立即舍弃**：当前没有足够证据把 detailInfo 的实际字段永久归入此类。
- **E / 暂时未知**：`playerDisplayArea.normalDynamicList` 中 `diceSlotId/diyDynamicId` 的产品语义、photo type 4 的实体域。

## 7. Character Build Model

`avatarDetailList[]` 应映射为 build occurrence，而不是 Character entity：

```text
Character static identity (avatarId)
          +
PlayerCharacterBuild occurrence
  - display area / position
  - progression / enhanced profile / skin
  - skill-tree levels
  - light cone
  - six relics
```

角色 `1310` 的 `enhancedId=1` 可在 `AvatarConfigEnhanced` 精确找到；MiHoMo 只返回 `enhanced=true`。角色 `1407` 的 `dressedSkinId=1140701` 可在 `AvatarSkin` 精确找到，且 `AvatarID=1407`；MiHoMo character 中没有等价字段。角色 `8006` 可在 `MultiplePathAvatarConfig` 连接到 base Avatar `8001`，证明现有多命途/开拓者静态数据域可复用。

## 8. Assist / Position Semantics

### 8.1 本 fixture 的事实

| avatarId | Enka `_assist` | Enka `pos` | MiHoMo `pos[]` |
| ---: | --- | ---: | --- |
| 1310 | true | missing | `[0, 7]` |
| 1413 | true | 1 | `[1, 3]` |
| 1409 | true | 2 | `[2]` |
| 1415 | missing/false | 1 | `[4]` |
| 1407 | missing/false | 2 | `[5]` |
| 8006 | missing/false | 3 | `[6]` |

**Confirmed：**

- `_assist` 标识一个独立展示区域/角色用途；不能把它从 `pos` 推导出来。
- `pos=1/2` 同时出现在 assist 与非-assist 角色上，因此 `pos` 必须与区域一起解释。
- MiHoMo 把多种来源折叠为 opaque `pos[]`；从 `[0..7]` 无法可靠反向恢复 Enka 的 assist/普通展示身份。

**Unknown：**

- `[7]` 与 `[3]` 的精确上游槽位含义；仅凭此 UID 不能将它们确定命名为星海同行或照片墙槽。
- 同一个 `avatarId` 同时拥有 assist build 与普通展示 build 时，Enka 是否一定返回两个 occurrence。本 fixture 的 6 个 avatarId 都唯一，没有覆盖该 edge case。

### 8.2 去重结论

当前 `api/_player/parse.ts` 的 `dedupeCharacters()` 以 `characterId` 去重。这个行为来自 MiHoMo folded schema，不能带入 Enka adapter。

Canonical model 必须允许同一个 `avatarId` 出现多次，并以 occurrence/build ID（例如 adapter 内生成的稳定 `area + sourceIndex`）区分。即使两个 occurrence 当前装备完全相同，也不能先合并再尝试恢复。UI 可以按区域决定是否只展示一份，但数据层不应丢失。

## 9. Light Cone Data

6 个光锥的 `tid/rank/promotion/level` 与 MiHoMo 全部一致。样本 rank 为 `1,1,1,5,1,2`；MiHoMo 同值，`EquipmentConfig.MaxRank=5`，`EquipmentSkillConfig` 等级也是 1–5。因此：

> `equipment.rank` 是 **1-based 叠影等级**，与角色 `rank` 的 0-based 星魂数量语义不同。

重建公式（对每个 base stat）：

```text
value = PromotionRow.Base + PromotionRow.Add × (level - 1)
```

使用 `(tid, promotion)` 连接 `EquipmentPromotionConfig` 后，18/18 个 HP/ATK/DEF `_flat.props` 精确匹配。6/6 个 `_flat.name` 也精确等于 `EquipmentConfig.EquipmentName.Hash`，可由 TextMap 解析。

因此 `tid + rank + promotion + level` 足以重建光锥名称、路径、rarity、基础属性、叠影被动和资产。当前 HSR-Database 的 light-cone domain、stat progression、TextMap 和 asset resolver 已覆盖大部分能力；player stat synthesis 若要计入被动的常驻属性，还需把 `EquipmentSkillConfig` 的结构化 property contribution 纳入运行时计算。

## 10. Skill Tree / Trace Data

### 10.1 ID 与节点类别

全部 116 个 `pointId` 均能连接 `AvatarSkillTreeConfig`。本样本按 `PointType` 分布：

| PointType | 数量 | 当前管线用途 |
| ---: | ---: | --- |
| 1 | 60 | 属性节点，当前映射为 `Trace.type='stat'` |
| 2 | 30 | 普通主动技能 progression |
| 3 | 18 | 额外能力，当前映射为 `Trace.type='ability'` |
| 4 | 8 | 特殊/忆灵技能 progression，当前 character domain 已通过 servant relation 处理 |

当前 `scripts/data/domain/character.ts` 已按结构化字段处理 base/enhanced profile、普通技能、忆灵技能、属性节点和额外能力，不需要 Enka 专用技能字典。

### 10.2 level normalization

112/116 个节点 raw level 与 MiHoMo 相同。仅 E6 开拓者 `8006` 的四个主动技能不同：

| pointId | Enka raw | MiHoMo parsed | 静态解释 |
| ---: | ---: | ---: | --- |
| 8006001 | 3 | 4 | E5 `SkillAddLevelList +1` |
| 8006002 | 5 | 7 | E3 `+2` |
| 8006003 | 8 | 10 | E5 `+2` |
| 8006004 | 10 | 12 | E3 `+2` |

因此 Enka `skillTreeList[].level` 是更适合作为 canonical 的**原始投入等级**；MiHoMo 已混入星魂带来的 effective level。UI 若显示战斗有效等级，应通过 `rank + AvatarRankConfig.SkillAddLevelList` 派生，不应修改 canonical raw level。

当前 character domain 读取 `AvatarRankConfig`，但 projected Eidolon model 尚未保留 `SkillAddLevelList`，所以迁移前需做一个小型静态投影扩展或专用 provider-neutral resolver；不要在 Enka parser 中写角色特例。

## 11. Relic Data Model

### 11.1 字段语义

- `tid`：`RelicConfig.ID`，标识遗器静态种类，不是玩家 inventory instance ID。
- `type`：1–6，对应 HEAD/HAND/BODY/FOOT/NECK/OBJECT；也可从 `RelicConfig.Type` 验证。
- `level`：遗器强化等级；本 fixture 全为 15。
- `mainAffixId`：在 `RelicConfig.MainAffixGroup` 内选择主词条。
- `affixId`：在 `RelicConfig.SubAffixGroup` 内选择副词条。
- `cnt`：该副词条的累计 base contribution 数量。
- `step`：该副词条所有 contribution 的累计档位增量。

当前网站 relic set resolver 使用 set + slot 解析页面 piece；为精确从 `tid` 找到 set、rarity、主/副词条 group，需要把 `RelicConfig`/`ItemConfigRelic` 加入一个窄的构建时 runtime lookup。数据已经存在，但当前生成物没有这张映射。

### 11.2 主词条公式

```text
relic = RelicConfig[tid]
affix = RelicMainAffixConfig[(relic.MainAffixGroup, mainAffixId)]
value = affix.BaseValue + affix.LevelAdd × relic.level
```

36/36 matched；31 个在双精度下完全相等，5 个只有约 `1e-8` 的配置/输出舍入差。

### 11.3 副词条公式

```text
relic = RelicConfig[tid]
affix = RelicSubAffixConfig[(relic.SubAffixGroup, affixId)]
value = affix.BaseValue × cnt + affix.StepValue × effectiveStep
```

对存在 `step` 的条目，`effectiveStep = step`。144/144 个副词条匹配；96 个精确相等，48 个仅有最多约 `9.8e-9` 的舍入差。

Enka `_flat` 有时将静态 `CriticalChanceBase` 写成 `CriticalChance`、`BreakDamageAddedRatioBase` 写成 `BreakDamageAddedRatio` 等；canonical property type 应采用 TurnBasedGameData 的 `Property` code，而不是 `_flat.type`。

## 12. Relic `cnt / step` Investigation

### 12.1 `cnt`

本 fixture 每件 +15 五星遗器的四项 `cnt` 总和只有两种：

- 29 件总和为 8；
- 7 件总和为 9。

这与 3 初始副词条（3 个初始 contribution + 解锁第 4 条 + 4 次升级 = 8）和 4 初始副词条（4 + 5 次升级 = 9）完全一致。

结论：

- **Confirmed mathematical meaning**：`cnt` 是公式中 `BaseValue` 的乘数，即该词条累计 contribution/roll 数。
- **Strongly inferred game-mechanic meaning**：它包含初始出现/解锁该词条的那一次，不只是后续强化命中次数。
- `cnt - 1` 才是“该副词条出现后又被命中多少次”，但对第 4 条在 +3 解锁的情形，产品若要区分初始/解锁仍需遗器初始状态信息；最终 snapshot 本身不能恢复完整时间顺序。

### 12.2 `step`

`RelicSubAffixConfig.StepNum=2`，每次 contribution 的离散档位可表示为 base 加 `0/1/2 × StepValue`。当前数据要求的 `step` 可以大于 2（例如 `cnt=4, step=7`），因此它显然不是“最后一次 roll 的档位”，而是累计值。

结论：

- **Confirmed mathematical meaning**：`step` 是最终公式中 `StepValue` 的总乘数。
- **Strongly inferred procedural meaning**：`step` 是 `cnt` 次 contribution 各自 0–2 档位索引之和；初始生成也有自己的档位，因为 fixture 中 `cnt=1` 可出现 `step=1/2`。
- 最终 `cnt/step` 不能还原每次 roll 的先后顺序，但能还原总 roll 数、总档位质量和最终数值，足够用于绝大多数评分。

### 12.3 missing `step`

共 21 个实例缺失 `step`，覆盖 `cnt=1` 和 `cnt=2`，并覆盖 HP、DEF、HP%、DEF%、暴击、暴伤、命中、抵抗、击破等多种 property。21/21 均满足：

```text
Enka _flat value
  == MiHoMo value（排除时点不一致件后）
  == BaseValue × cnt
  == formula with effectiveStep 0
```

这强烈符合 proto/default-zero 在 JSON 中省略字段的行为，但本次没有 Enka HSR 正式 schema/source contract 证明 optional omission 规则。因此精确表述必须是：

> **Strongly inferred：当前 fixture 中 missing `step` 的有效数学值全部为 0。Unknown：这是否是所有未来 Enka HSR 响应的 schema guarantee。**

迁移实现不应在未经额外 contract test 的情况下把 `step ?? 0` 当作不可变协议事实。安全模型是 `step?: number`，normalizer 可同时产出 `effectiveStep` 与 warning/provenance；在补充 fixture 或上游 source 证据后再收紧。

## 13. `_flat` Redundancy Analysis

| `_flat` 字段 | 可重建 | 证据 | 当前能否立即 strip |
| --- | --- | --- | --- |
| 遗器名称/图标/rarity/type | Yes | `tid -> ItemConfigRelic/RelicConfig/TextMap/assets` | resolver lookup 落地后 |
| 遗器套装 ID | Yes | `RelicConfig.SetID`，36/36 与 `_flat.setID` 一致 | resolver lookup 落地后 |
| 遗器套装名称 | Yes | `RelicSetConfig.SetName -> TextMap`，hash exact | Yes after normalization |
| 主词条 type/value | Yes | 36/36 全量公式验证 | Yes after normalization |
| 副词条 type/value | Yes | 144/144 全量公式验证 | missing-step contract gate 前建议保留用于 shadow check |
| 光锥名称 | Yes | `EquipmentConfig.EquipmentName -> TextMap`，6/6 hash exact | Yes after normalization |
| 光锥基础属性 | Yes | 18/18 精确验证 | Yes after normalization |

架构目标应是：

```text
Enka raw + TurnBasedGameData lookup
  -> validate/reconstruct
  -> canonical model
  -> discard _flat
```

但迁移的首个 shadow phase 应暂留 `_flat`，逐响应比较 reconstructed value；达到跨 UID、跨 rarity、跨 level 的 contract gate 后再从持久 payload 删除。`_flat` 是 redundant derived data，不等于可以在 resolver 尚未实现时盲删。

## 14. Existing HSR-Database Resolver Reuse

| Enka raw | 现有能力 | 复用状态 |
| --- | --- | --- |
| `avatarId` | Character domain/catalog、path/element、TextMap、assets | 直接复用 |
| `enhancedId` | `AvatarConfigEnhanced` base/enhanced profiles | 直接复用；需 runtime 选择具体 ID |
| `dressedSkinId` | 上游 `AvatarSkin` 存在 | 上游可解；当前网站尚无完整 skin projection/asset manifest |
| `pointId` | Character skill progression、trace、servant/忆灵 relation | 直接复用大部分 |
| raw skill level | `resolvePlayerSkillLevel` | 基础可复用；effective level 需 rank bonus resolver |
| light-cone `tid` | LightCone domain、promotion stats、TextMap、assets | 直接复用 |
| relic `tid` | 当前仅 set + slot view resolver | 需增加 `RelicConfig.ID -> set/group/slot` 窄 lookup |
| relic property code | `RelicProperty` registry/formatter/icons | 直接复用 |
| set ID | RelicSet domain + set/piece assets | 直接复用 |
| TextMap hash | shared TextMap resolver | 直接复用；hash 保持 string |
| final character stats | 当前只消费 MiHoMo `statistics` | **缺失完整 synthesis** |

不应重新建立 Enka 专用静态数据层。新增部分应是对现有 build-time domain 的小型 runtime lookup 投影和 provider-neutral build calculation。

## 15. Proposed Canonical `PlayerProfile`

概念模型：

```ts
interface PlayerProfile {
  uid: string;
  nickname: string;
  level: number;
  worldLevel: number;
  signature?: string;
  headIconId?: string;
  personalCardId?: string;
  friendCount?: number;
  isDisplayAvatar: boolean;
  privacy?: PlayerPrivacy;
  records?: PlayerRecords;
  characters: PlayerCharacterBuild[];
}

interface PlayerCharacterBuild {
  buildId: string; // occurrence identity; never avatarId alone
  avatarId: string;
  display: {
    area: 'assist' | 'showcase' | 'unknown';
    position?: number;
    sourceOrder: number;
  };
  level: number;
  promotion: number;
  eidolon: number;
  enhancedId?: number;
  skinId?: string;
  traces: Array<{ pointId: string; rawLevel: number }>;
  lightCone?: PlayerLightCone;
  relics: PlayerRelic[];
  derivedStats?: PlayerStatSnapshot; // local derived result, not provider DTO
}

interface PlayerLightCone {
  lightConeId: string;
  superimposition: number; // 1..5
  level: number;
  promotion: number;
}

interface PlayerRelic {
  relicId: string; // static TID, not instance ID
  slot: 1 | 2 | 3 | 4 | 5 | 6;
  level: number;
  mainAffixId: number;
  subAffixes: Array<{
    affixId: number;
    count: number;
    step?: number;
  }>;
}
```

最终 value、property type、name、set、rarity、assets 都是 resolver output，不必永久复制进 canonical snapshot。Relic Score 若需要审计可在 score result 中保存当时的 derived value/config revision，而不是污染 PlayerRelic 原始事实。

## 16. Proposed Runtime Payload Pruning

### 16.1 Minimum Enka Runtime Payload

```ts
type MinimumEnkaRuntimePayload = {
  uid: string;
  detailInfo: {
    uid: number;
    nickname: string;
    level: number;
    worldLevel: number;
    signature?: string;
    headIcon?: number;
    personalCardId?: number;
    friendCount?: number;
    isDisplayAvatar?: boolean;
    privacySettingInfo?: Record<string, boolean>;
    recordInfo?: Record<string, unknown>;
    avatarDetailList?: Array<{
      avatarId: number;
      pos?: number;
      _assist?: boolean;
      rank?: number;
      level: number;
      promotion: number;
      enhancedId?: number;
      dressedSkinId?: number;
      skillTreeList?: Array<{ pointId: number; level: number }>;
      equipment?: { tid: number; rank: number; promotion: number; level: number };
      relicList?: Array<{
        tid: number;
        type: number;
        level: number;
        mainAffixId: number;
        subAffixList?: Array<{ affixId: number; cnt: number; step?: number }>;
      }>;
    }>;
  };
  ttl?: number;
  region?: string;
};
```

### 16.2 生命周期分类

- **Persist in canonical model**：上述玩家 identity/profile 必需字段、build occurrence/area/position、progression、raw trace level、光锥四字段、遗器 raw affix 字段。
- **Keep during normalization only**：`_flat`（shadow validation）、完整 `playerDisplayArea`、尚未投影的 record/privacy 扩展字段、原响应诊断路径。
- **Transport metadata only**：`ttl`、region、HTTP status、Retry-After、fetchedAt、cache status。
- **Strip immediately after trusted normalization**：MiHoMo/Enka 预解析名称、formatted display、重复图标路径；对于 Enka `_flat` 应在 migration shadow gate 通过后才进入此类。

## 17. Relic Score Compatibility

1. `_flat` 不是评分必需；raw fields + static config 足够。
2. 最终值可由 `affixId + cnt + step + RelicConfig/RelicSubAffixConfig` 重建。
3. `cnt` 足以确定累计 roll/contribution 数；有效副词条命中数可按 scoring 权重统计。
4. `step` 提供同样 `cnt` 下的 roll 档位质量，可用于 roll quality、farming benchmark 和潜力分析。
5. missing `step` 不阻止基于 `cnt` 的 V1 hit-count score；若要计算精确 roll quality，在 schema guarantee 建立前应标记 inferred-zero，而不是静默当作确定值。
6. canonical 应保存 `cnt` 和 optional `step`；最终 value 应派生。为了历史审计，score output 可以同时保存 derived value 和 data revision。
7. MiHoMo 本 fixture 也保留 `count/step`，所以不能声称它完全无法支持 roll score。Enka 的实际优势是同时保留 `affixId` 和直接静态 group 关系，减少对 provider property naming/formatting 的依赖。

Enka 更适合评分系统的原因是**原始、可验证、版本化**，不是因为本 fixture 的 MiHoMo 完全没有 roll 信息。

## 18. Enka vs MiHoMo Information Preservation

### 18.1 Enka 保留、MiHoMo 丢失或弱化

- `_assist` 与区域内 `pos`；MiHoMo 只剩 folded `pos[]`。
- `enhancedId` 的具体值；MiHoMo 只有 boolean。
- `dressedSkinId`；MiHoMo character 无对应字段。
- relic `affixId`；MiHoMo 只给解析后的 property type/value/count/step。
- 原始 skill-tree 投入等级；MiHoMo 混入星魂加级。
- privacy 五个细分开关、platform、personalCardId、playerDisplayArea。
- 原始 recordInfo 命名；MiHoMo 本 fixture 出现明显 count 字段错位。
- transport `ttl` 与 region。

### 18.2 MiHoMo 直接提供、Enka raw 不直接提供

- Character/Light Cone/Relic/Property 的名称、rarity、path、element、图标路径。
- 遗器主副词条最终 value/display/percent。
- 光锥基础属性与被动 properties。
- 角色 `statistics/attributes/additions/properties`。
- resolved relic set effects 和格式化 display。
- 星魂修正后的 effective skill level。

前两类及大部分 metadata 可由当前本地静态数据重建。最终角色 stats 和 effective skill level 也有静态来源，但当前项目尚未形成完整、已验证的 synthesis resolver；这是迁移工作项，不应伪装成已经完成。

## 19. Migration Risks

| 风险 | 影响 | 当前证据 | 必需缓解 |
| --- | --- | --- | --- |
| final stats 缺失 | 当前 Stats UI 无直接输入 | Enka fixture 无 `statistics`；当前 parser 强依赖 MiHoMo | 先实现 provider-neutral stat synthesis + fixture golden tests；未通过前保留旧 stats 或隐藏明确标注 |
| missing `step` contract | 精确 roll-quality 可能误判 | 21/21 拟合 0，但只有一个 UID | 跨 UID/rank/rarity fixture + 上游 schema/source 证据；模型保持 optional |
| `_assist`/区域语义 | 展示错区、丢 build | `pos` 跨区域冲突；MiHoMo 已折叠 | occurrence model；不以 avatarId dedupe；补重复 avatar fixture |
| duplicate avatar IDs | 不同装备 build 被覆盖 | 当前 fixture 未覆盖；现有 parser 明确 dedupe | 删除 adapter 层 dedupe 思维；contract test 同 ID 多 build |
| skill effective level | 页面等级比 MiHoMo 低 | 8006 有 4 个已验证差异 | 用 `AvatarRankConfig.SkillAddLevelList` 派生 effective level |
| relic TID resolver | 无法从 raw 找 group/set | TurnBased `RelicConfig` 有完整关系，但当前 generated lookup 缺失 | 构建时生成最小 lookup；未知 TID graceful fallback |
| skin/enhanced assets | 显示 base 图而非实际形态 | fixture 各覆盖一个真实 ID | 扩展 skin/enhanced asset resolver；保持 ID 即使资源缺失 |
| record count schema drift | UI 展示错误计数 | MiHoMo count 明显错位；Enka 字段也需 schema 版本监控 | raw field contract tests；UI 未验证字段先不展示 |
| API schema stability | decoder 因 optional/新增字段失败 | HSR 正式字段文档有限 | 窄 decoder、unknown fields ignore、required/optional 分层、versioned fixtures |
| TTL/cache | 请求风暴/封禁 | fixture `ttl=60`；任务契约说明为刷新等待时间 | cache key 按 UID/region；遵守 ttl；single-flight；不提供无约束 force refresh |
| HTTP errors | 错误提示或重试错误 | 已知主要状态 400/404/424/429/500/503 | 稳定 public error taxonomy；429/503 retryable；保留 Retry-After/ttl |
| pinned data 落后 | 新 ID 无 resolver | runtime 可领先部署静态版本 | unknown-ID fallback；不要让单实体失败整页；记录 data revision |
| Trailblazer/多命途 | 错 join base avatar | 8006 -> MultiplePath 8001 可解析 | 始终以具体 avatarId 为 build identity，base ID 仅作 relation |
| snapshot 时点差 | 错判 schema | 61252 与 relicCount 已出现差异 | 对比 identity/schema 与值状态分开；不要求所有数值相等 |

建议错误映射：400 → `INVALID_UID`；404 → `PLAYER_NOT_FOUND`；424/500/503 → `UPSTREAM_UNAVAILABLE`；429 → `RATE_LIMITED` 并保留 Retry-After。具体 404/隐私/未设置展柜的区分仍需真实响应 fixture，不应猜测。

## 20. Additional Fixture Requirements

下一轮 regression set 应按特征收集，不要求报告真实 UID：

- 同一 avatar 同时位于 assist、星海同行/其他展示区域和普通展示，且装备不同；
- 仅 assist、仅普通展示、没有公开展柜、`isDisplayAvatar=false`；
- 0/E1/E3/E5/E6 角色，尤其星魂会加主动技能等级；
- 无光锥、1–5 叠影、未满级/突破边界光锥；
- 0/+3/+6/+9/+12/+15、2–5 星遗器；
- 可确认 3 初始与 4 初始副词条的遗器；
- 大量 missing `step`、显式 `step=0`（若 API 会输出）、`cnt=1 step=1/2`；
- 非满级遗器的所有主词条种类；
- 开拓者男女、多命途切换；
- base/enhanced profile 角色与特殊召唤物技能；
- 带皮肤和不带皮肤的同一角色；
- 新版本刚上线、本站 pinned data 尚未覆盖的 avatar/relic/light cone；
- 低开拓等级玩家与 recordInfo 各隐私组合；
- 400/404/424/429/500/503、ttl 边界与缓存命中响应。

## 21. Confirmed / Inferred / Unknown Findings

### 21.1 Confirmed

- UID、角色/装备/行迹 identity 对齐，fixture 足够接近。
- `rank ?? 0` 在本 fixture 6/6 验证通过。
- equipment rank 是 1-based。
- `_assist` 是独立区域信号；`pos` 不是全局位置。
- raw trace level 与 MiHoMo effective level 不总等价。
- relic 主词条公式 36/36、副词条公式 144/144 匹配。
- `cnt` 是 BaseValue 的累计乘数；`step` 是 StepValue 的累计乘数。
- 21 个 missing-step 样本的有效聚合 step 均为 0。
- relic/light-cone `_flat` 的样本内容均可由本地静态数据重建。
- 当前 MiHoMo parser 会按 characterId 去重。

### 21.2 Strongly inferred

- `cnt` 包含初始生成/解锁贡献，不只是后续强化。
- `step` 是每次 contribution 的 0–2 档位索引之和，初始 contribution 也参与。
- missing `step` 是 JSON/proto 默认零省略。
- Enka 是比 MiHoMo parsed schema 更适合 canonical runtime input 的 provider。

### 21.3 Unknown / requires more evidence

- missing `step === 0` 是否为正式、长期 schema guarantee。
- 同 avatar 跨区域时 Enka 是否返回多个完整 occurrence，以及顺序稳定性。
- MiHoMo `pos[3]`/`pos[7]` 对应的精确展示区定义。
- Enka `playerDisplayArea` 各 type/dynamic ID 的完整语义。
- private/empty showcase 的字段缺失与 HTTP status 组合。
- 当前静态数据能否在所有角色/特殊机制上逐 bit 等价重建 MiHoMo final statistics；本报告只证明基础组成数据存在，未证明完整 aggregator。

## 22. Recommended Migration Plan

### Phase 0 — Contract fixtures and lookups

- 固化当前 Enka/MiHoMo 双 fixture 和额外 edge fixtures；
- 生成最小 `RelicConfig`/affix lookup；
- 为 `AvatarRankConfig.SkillAddLevelList` 建立 effective-level resolver；
- 实现 investigation/golden tests，覆盖 36/144 公式与 missing-step provenance。

### Phase 1 — Enka adapter, no UI switch

- 新建 `EnkaRawResponse -> PlayerProfile` 窄 decoder/normalizer；
- transport metadata 与 domain 分离；
- 不 dedupe builds；
- 保留 `_flat` 仅用于 shadow comparison；
- 与现有 MiHoMo normalized output 并行 diff，不改变生产 provider。

### Phase 2 — Player Info core switch

- 切换 profile、character progression、light cone、relic、trace 数据；
- 使用本地 resolver 替代所有 parsed names/paths/affix values；
- unknown ID/partial payload graceful fallback；
- stats 仍使用独立兼容策略，不让它阻塞其余区域。

### Phase 3 — Stat synthesis gate

- 组合 character/LC base stats、relic raw values、trace properties、eidolon skill bonus、LC 常驻 property、set effects；
- 明确战斗条件属性与静态面板属性边界；
- 跨 fixture 对照 MiHoMo `attributes/additions/properties/statistics`；
- 达成容差与特殊角色覆盖后移除 MiHoMo final-stat dependency。

### Phase 4 — Pruning and scoring

- 通过跨 fixture shadow gate 后 strip `_flat`；
- Relic Score 直接消费 canonical raw affix；
- 保留 config revision、inferred-zero warning 和可重复计算的 score evidence。

下一阶段最小、安全实现边界是：**只新增 Enka DTO/decoder/adapter、relic runtime lookup、rank skill-level resolver 与双 provider contract tests；不同时重构 UI，不删除 MiHoMo fallback，不实现大而全的 provider abstraction。**

## 23. Core Questions — Direct Answers

1. **Enka 能否完整替代当前 Player Info 所依赖的 MiHoMo？** 不是立即 drop-in。除最终角色面板 stats 外，当前 V1 所需信息都足够；完成 stat synthesis proof 后具备完整替代路径。
2. **是否有无法由现有静态数据补齐的重要信息？** MiHoMo final stats 当前没有现成的本地 resolver，属于重要实现缺口；底层静态输入大部分存在，但尚未全量证明。除此之外未发现不可补齐的核心信息。
3. **哪些 `_flat` 可视为 redundant？** 遗器 set ID/name、主副词条 type/value、光锥 name/base props 均已在本 fixture 全量证明 redundant；迁移 shadow gate 前不要实际删除。
4. **Canonical 最少保存什么？** 玩家核心资料；每个 build 的 occurrence/area/position、avatarId、level/promotion/eidolon/enhancedId/skinId；raw point levels；光锥 ID/rank/promotion/level；遗器 tid/type/level/mainAffixId/affixId/cnt/optional step。
5. **`_assist` 如何影响展示和去重？** 它决定展示区域；`pos` 必须区域化。不得按 avatarId 去重，同 ID 的多个 build occurrence 必须保留。
6. **missing character `rank=0` 是否验证？** 是。两个缺失样本均对应 MiHoMo rank 0，所有显式 rank 也相同，6/6 通过。
7. **`cnt` 的准确语义？** 公式上是 base contribution 数量；机制上强烈表明包含初始出现/解锁和后续命中的总 roll 数。
8. **`step` 的准确语义？** 公式上是 StepValue 的累计乘数；机制上强烈表明是所有 `cnt` 次 0–2 档位索引之和，包含初始 contribution。
9. **missing `step` 能否安全解释为 0？** 当前 fixture 21/21 可按 0 精确重建，但单 UID 不足以升级为 schema guarantee；正式模型保持 optional，补证后再收紧。
10. **仅 raw relic + TurnBasedGameData 能否重建 `_flat.props`？** 能。本 fixture 36 个主词条、144 个副词条全部匹配，只有约 `1e-8` 舍入误差。
11. **Enka 是否更适合 Relic Score？** 是，因为保留 affix ID 与 raw roll 编码并可由 pinned config 验证；但 MiHoMo 本 fixture 也有 count/step，优势不能夸大为 MiHoMo 完全不支持评分。
12. **迁移前缺哪些证据？** missing-step 上游/跨 UID contract、重复 avatar 多区域 fixture、private/empty/error fixtures、低 rarity/非满级遗器、皮肤/多命途以及 final stat synthesis golden tests。
13. **下一阶段最小安全边界？** Enka adapter + 最小静态 lookup + contract/golden tests + shadow diff；暂不删 MiHoMo、暂不改 UI、暂不删 `_flat`。

## Appendix A. Field Mapping Matrix

| Domain | Enka raw | MiHoMo | Static resolver | Canonical field | Keep? | Confidence | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Transport | `ttl` | 无 | - | none/transport | metadata | High | cache/refresh control，不进 Player domain |
| Transport | `region` | 无 | - | request context | metadata | High | 本例 CN |
| Player | root/detail `uid` | `player.uid` | - | `uid` | Yes | High | Enka number，canonical string |
| Player | `nickname` | `nickname` | - | `nickname` | Yes | High | exact |
| Player | `level` | `level` | - | `level` | Yes | High | exact |
| Player | `worldLevel` | `world_level` | - | `worldLevel` | Yes | High | exact |
| Player | `signature` | `signature` | - | `signature` | Yes | High | exact |
| Player | `headIcon` | `avatar.id` | Player avatar asset | `headIconId` | Yes | High | MiHoMo name/icon derived |
| Player | `personalCardId` | 无 | personal-card config TBD | `personalCardId` | Optional | High | future UI |
| Player | `friendCount` | `friend_count` | - | `friendCount` | Optional | High | exact |
| Player | `isDisplayAvatar` | `is_display` | - | `isDisplayAvatar` | Yes | High | exact |
| Player | `platform` | 无 | - | optional platform | Maybe | High | product value TBD |
| Player | `privacySettingInfo.*` | 无细项 | - | `privacy` | Maybe | High | 5 booleans |
| Player | `recordInfo` | `space_info` | - | `records` | Maybe | Medium | Mi fields show mapping skew |
| Player | `playerDisplayArea` | 无直接值 | config TBD | optional display profile | Normalize-only | Medium | ID domains需后续研究 |
| Character | `avatarId` | `id` | AvatarConfig/Character domain | `avatarId` | Yes | High | exact |
| Character | `rank` optional | `rank` | - | `eidolon` | Yes | High | missing=0 verified in fixture |
| Character | `level` | `level` | AvatarPromotionConfig | `level` | Yes | High | exact |
| Character | `promotion` | `promotion` | AvatarPromotionConfig | `promotion` | Yes | High | exact |
| Character | `_assist` | folded into `pos[]` | - | `display.area` | Yes | High | no dedupe |
| Character | `pos` | `pos[]` | - | `display.position` | Yes | High | scoped by area |
| Character | source order | character order/`pos[]` | - | `display.sourceOrder` | Yes | High | occurrence identity input |
| Character | `enhancedId` | `enhanced` bool | AvatarConfigEnhanced | `enhancedId` | Yes | High | Enka richer |
| Character | `dressedSkinId` | 无 | AvatarSkin | `skinId` | Yes | High | fixture ID resolves |
| Trace | `pointId` | `skill_trees.id` | AvatarSkillTreeConfig | `pointId` | Yes | High | 116/116 join |
| Trace | raw `level` | normalized `level` | AvatarRankConfig | `rawLevel` | Yes | High | 4 Trailblazer nodes differ by rank bonus |
| Light Cone | `equipment.tid` | `light_cone.id` | EquipmentConfig | `lightConeId` | Yes | High | 6/6 exact |
| Light Cone | `rank` | `rank` | EquipmentSkillConfig | `superimposition` | Yes | High | 1-based |
| Light Cone | `promotion` | `promotion` | EquipmentPromotionConfig | `promotion` | Yes | High | exact |
| Light Cone | `level` | `level` | EquipmentPromotionConfig | `level` | Yes | High | exact |
| Light Cone | `_flat.name` | parsed `name` | EquipmentConfig + TextMap | none | No after gate | High | derived hash/text |
| Light Cone | `_flat.props` | `attributes` | EquipmentPromotionConfig | none | No after gate | High | 18/18 reconstructed |
| Relic | `tid` | `id` | RelicConfig/ItemConfigRelic | `relicId` | Yes | High | static type ID, not instance |
| Relic | `type` | `type` | RelicConfig.Type | `slot` | Yes | High | 1..6 |
| Relic | `level` | `level` | RelicConfig.MaxLevel | `level` | Yes | High | fixture all +15 |
| Relic | `mainAffixId` | parsed `main_affix.type` | RelicMainAffixConfig | `mainAffixId` | Yes | High | 36/36 reconstructed |
| Relic | `affixId` | 无 ID | RelicSubAffixConfig | `affixId` | Yes | High | Enka advantage |
| Relic | `cnt` | `count` | RelicSubAffixConfig | `count` | Yes | High | cumulative contribution count |
| Relic | `step?` | `step` numeric | RelicSubAffixConfig | `step?` | Yes | Medium-High | aggregate tier multiplier; omission guarantee pending |
| Relic | `_flat.setID` | `set_id` | RelicConfig.SetID | none | No after gate | High | 36/36 derived |
| Relic | `_flat.setName` | `set_name` | RelicSetConfig + TextMap | none | No after gate | High | hash derived |
| Relic | `_flat.props` | main/sub final values | affix configs | none | No after gate | High | 180/180 reconstructed |
| Stats | 无 final block | `statistics` etc. | multiple configs | `derivedStats?` | Derived | Medium | current resolver incomplete |

## Appendix B. Formula Verification Summary

| Verification | Samples | Result | Max absolute delta |
| --- | ---: | --- | ---: |
| Relic main affix | 36 | 36 matched | ~`1.5e-8` |
| Relic sub affix | 144 | 144 matched | ~`9.8e-9` |
| Missing-step subset | 21 | 21 matched with effective 0 | ~`4.0e-9` |
| Light-cone base stats | 18 | 18 exact | 0 |
| Character rank | 6 | 6 matched after missing→0 | 0 |
| Skill-tree PointID | 116 | 116 joined/matched | n/a |
| Skill-tree raw level | 116 | 112 same; 4 explained by E3/E5 bonus | n/a |

## Appendix C. Evidence Files

Primary local evidence:

- `Enka-API-Integration-01/168902602-Enka.json`
- `Enka-API-Integration-01/168902602-MiHoMo.json`
- `TurnBasedGameData/ExcelOutput/RelicConfig.json`
- `TurnBasedGameData/ExcelOutput/RelicMainAffixConfig.json`
- `TurnBasedGameData/ExcelOutput/RelicSubAffixConfig.json`
- `TurnBasedGameData/ExcelOutput/EquipmentConfig.json`
- `TurnBasedGameData/ExcelOutput/EquipmentPromotionConfig.json`
- `TurnBasedGameData/ExcelOutput/AvatarSkillTreeConfig.json`
- `TurnBasedGameData/ExcelOutput/AvatarRankConfig.json`
- `TurnBasedGameData/ExcelOutput/AvatarConfigEnhanced.json`
- `TurnBasedGameData/ExcelOutput/AvatarSkin.json`
- `TurnBasedGameData/ExcelOutput/MultiplePathAvatarConfig.json`
- HSR-Database Player Info contract/parser/resolvers and data-domain pipeline listed in §2.1.

本文关于 `ttl` 和 400/404/424/429/500/503 的 API 行为采用任务审计说明给出的 Enka 官方行为基线；未在本轮进行破坏性或高频 live API probe。HSR 字段语义结论优先来自实际 fixture、TurnBasedGameData 和当前代码。
