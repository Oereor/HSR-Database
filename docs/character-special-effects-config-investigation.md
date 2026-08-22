# Character Special Effects Config Investigation

本调查仅分析配置关系，不修改 production code。调查基线：

- `TurnBasedGameData`: `648b08fbdb2e49739ebbf1210c9a189fcfc5e2d7`
- `HSR-Database`: `5728ace9e3e76d1e43b875ff311c89698c8f1c5d`
- `StarRailRes`: `b95e75c7e1273d819d20c530c0b7e13a3ef19fb4`
- 文本来源：`TextMap/TextMapCHS.json`

证据等级：

- **Confirmed**：存在明确的 config 字段引用。
- **Strong inference**：没有客户端源码可直接证明页面调用，但多个专用字段、资源路径和完整记录集合共同指向同一 UI 用途。
- **Unknown**：当前数据导出不能确认。

## 1. Executive Summary

### Special Effect -> SkillID relation

**Confirmed。** 两个案例都存在专用的 SkillID link table：

- 昔涟：`AvatarServantSkillLink.json` 直接列出 14 个 `AvatarServantSkillConfig.SkillID`，并为每项提供 `LinkToAvatarID`、`Order`、`TarotFigurePath`、`TarotIconPath`。资源路径明确位于 `UI/Avatar/Special/Special_1415/...`。
- 姬子·启行：`AvatarSkillLink.json` 直接列出 `151025` 与 `151026`，并用 `LinkToAvatarIDList` / `LinkToAvatarIDSimplifiedList` 指定每种“同行协议”适用的角色集合。

调查修正了背景中的一个具体假设：昔涟 14 个“献予……”技能不在 `AvatarSkillConfig.json`，而在 `AvatarServantSkillConfig.json`。它们属于昔涟的忆灵德谬歌（`ServantID = 11415`），但通过 `AvatarSkillTreeConfig.AvatarID = 1415` 和专用 link table 明确关联回昔涟及目标黄金裔。

### HideInUI semantics

`HideInUI` 更接近“不要作为该角色/忆灵的标准技能列表项自动展示”，而不是“永远不是玩家可见内容”。

- 吉尔伽美什 `150909` 只有标准角色 SkillList/成长关系，没有发现专用展示 link，因此按 `HideInUI` 从标准技能列表排除是正确的。
- 昔涟 `1141513`-`1141526` 虽然全部 `HideInUI = true`，却被 `AvatarServantSkillLink` 全量引用并配置专用特殊页面卡图。
- 姬子·启行 `151025`、`151026` 虽然 `HideInUI = true`，却被 `AvatarSkillLink` 明确引用并分配适用角色集合。

因此，`HideInUI` 可以用于 standard skill builder，不能用于全局 raw skill index 或显式 special-effect relation 的目标过滤。

### Colored / underlined tooltip source

**Confirmed。** 本次案例没有发现独立的 keyword/glossary config，也不是 `NounAtlas.json`。机制是：

1. `SkillDesc` 的 TextMap 原文用 `<u>...</u>`、`<color=...>`、`<icon ...>` 描述视觉样式；
2. markup 本身不携带 tooltip ID；
3. 同一个 skill record 的 `ExtraEffectIDList` / `SimpleExtraEffectIDList` 提供解释项 ID；
4. ID 指向 `ExtraEffectConfig.json`，名称和说明再通过 TextMap hash 解析。

昔涟 `1141502` 的 `<u>黄金裔</u>` 对应 `ExtraEffectID = 10000025`。姬子·启行 `151022` 的 `<u>开拓同行</u>`、`<u>助战技</u>` 分别对应 `10000031`、`10000032`。

### Pipeline conclusion

推荐的数据模型与调查目标中的方案一致，但需要同时覆盖两种 skill source：

```text
AvatarSkillConfig + AvatarServantSkillConfig
        -> full SkillID indexes (do not apply HideInUI)

Standard Character/Memosprite Skill Builder
        -> follow normal AvatarConfig / Servant / SkillTree relations
        -> apply HideInUI

Special Effect Builder
        -> AvatarSkillLink / AvatarServantSkillLink
        -> lookup full indexes
        -> keep explicitly referenced HideInUI skills
```

不应恢复名称、SkillID 前缀或角色特例 heuristic。当前两个已知系统都有明确 link config。

## 2. Investigated Characters

### 昔涟

#### Identity

| Field | Value | Evidence |
|---|---|---|
| Avatar ID | `1415` | `AvatarConfig.json.AvatarID` |
| Avatar name | 昔涟 | `AvatarName.Hash = 7809981386909966580` |
| Path | `Memory` | `AvatarConfig.AvatarBaseType` |
| Servant ID | `11415` | `AvatarServantConfig.ServantID` |
| Servant name | 德谬歌 | `ServantName.Hash = 12853558968518270305` |
| Special skill trace | `PointID = 1415301`, `PointType = 4` | `AvatarSkillTreeConfig.json` |
| Shared skill icon | `SpriteOutput/SkillIcons/Avatar/1415/SkillIcon_11415_Servant.png` | all 14 skill records |

#### Special-effect skills

下表覆盖 `AvatarServantSkillLink.json` 的全部 14 条记录。所有技能均有 10 个等级，且各等级的 `HideInUI` 一致为 `true`；`AttackType = Servant`，`SkillEffect = Support`。

| Order | SkillID | 名称 | HideInUI | Config Source | Referenced By |
|---:|---:|---|---|---|---|
| 1 | `1141526` | 献予「真我」之诗 | true | `AvatarServantSkillConfig` | `AvatarServantSkillLink -> Avatar 1415 昔涟` |
| 2 | `1141521` | 献予「负世」之诗 | true | `AvatarServantSkillConfig` | `AvatarServantSkillLink -> Avatar 1408 白厄` |
| 3 | `1141518` | 献予「理性」之诗 | true | `AvatarServantSkillConfig` | `AvatarServantSkillLink -> Avatar 1405 那刻夏` |
| 4 | `1141514` | 献予「浪漫」之诗 | true | `AvatarServantSkillConfig` | `AvatarServantSkillLink -> Avatar 1402 阿格莱雅` |
| 5 | `1141516` | 献予「纷争」之诗 | true | `AvatarServantSkillConfig` | `AvatarServantSkillLink -> Avatar 1404 万敌` |
| 6 | `1141517` | 献予「生死」之诗 | true | `AvatarServantSkillConfig` | `AvatarServantSkillLink -> Avatar 1407 遐蝶` |
| 7 | `1141520` | 献予「诡计」之诗 | true | `AvatarServantSkillConfig` | `AvatarServantSkillLink -> Avatar 1406 赛飞儿` |
| 8 | `1141515` | 献予「门径」之诗 | true | `AvatarServantSkillConfig` | `AvatarServantSkillLink -> Avatar 1403 缇宝` |
| 9 | `1141523` | 献予「律法」之诗 | true | `AvatarServantSkillConfig` | `AvatarServantSkillLink -> Avatar 1412 刻律德菈` |
| 10 | `1141524` | 献予「岁月」之诗 | true | `AvatarServantSkillConfig` | `AvatarServantSkillLink -> Avatar 1413 长夜月` |
| 11 | `1141519` | 献予「天空」之诗 | true | `AvatarServantSkillConfig` | `AvatarServantSkillLink -> Avatar 1409 风堇` |
| 12 | `1141522` | 献予「海洋」之诗 | true | `AvatarServantSkillConfig` | `AvatarServantSkillLink -> Avatar 1410 海瑟音` |
| 13 | `1141525` | 献予「大地」之诗 | true | `AvatarServantSkillConfig` | `AvatarServantSkillLink -> Avatar 1414 丹恒·腾荒` |
| 14 | `1141513` | 献予「创世」之诗 | true | `AvatarServantSkillConfig` | `AvatarServantSkillLink -> Avatar 8007 开拓者·记忆` |

#### Description identity

| SkillID | Skill name hash | Skill description hash | Description summary |
|---:|---:|---:|---|
| `1141526` | `7988707773089394394` | `12807517861119419956` | 德谬歌根据昔涟从不同队友处获得追忆的情况强化“花与箭的舞曲”，并通过【故事】获得额外回合。 |
| `1141521` | `2642572698205651895` | `12763518950885854967` | 对白厄整场生效，提供火种、变身持续、毁伤、暴击伤害与附加伤害相关强化。 |
| `1141518` | `6679083897019156166` | `7566274673750517712` | 对那刻夏单次生效，恢复战技点、立即行动，并提供智识角色攻击力/战技伤害强化。 |
| `1141514` | `1864075102823768366` | `3300036497874028010` | 对阿格莱雅单次生效，叠满衣匠速度效果，并提供能量、增伤与无视防御。 |
| `1141516` | `13178204774019298337` | `2249689971101516988` | 对万敌单次生效，解除控制；按【血仇】状态触发强化攻击或行动提前。 |
| `1141517` | `15093368059794720496` | `574135135909699753` | 对遐蝶整场生效，使【新蕊】溢出并强化召唤死龙时的伤害倍率。 |
| `1141520` | `10422640405771706449` | `10186546058691031387` | 对赛飞儿整场生效，提高伤害并降低不同敌方目标的防御。 |
| `1141515` | `12930045937820081577` | `4103936048075714836` | 对缇宝整场生效，无视防御并增加结界附加伤害次数。 |
| `1141523` | `5000824477949082800` | `12346091978677735094` | 对刻律德菈整场生效，提高持有【军功】角色的暴击伤害并在奇袭后补充充能。 |
| `1141524` | `2819207802308892371` | `16232850186444002090` | 对长夜月整场生效，强化忆灵技伤害、忆质获取和战技暴击伤害。 |
| `1141519` | `12399410741650866922` | `3195157591843010775` | 对风堇提供能量及可消耗层数，强化小伊卡忆灵技计入的治疗值。 |
| `1141522` | `996130028192310442` | `16414086226942662959` | 对海瑟音单次生效并提供整场增伤、能量恢复和持续伤害结算。 |
| `1141525` | `12911689887938793265` | `5841568370071833020` | 对丹恒·腾荒与龙灵提供附加伤害、同袍增伤、行动提前和终结技强化。 |
| `1141513` | `11275256214853616339` | `13831556487013363949` | 对开拓者·记忆整场生效，提高攻击/暴击率，并在强化普攻后令德谬歌获得额外回合。 |

每条 link 还带有独立的目标角色卡图，例如：

```text
SkillID 1141514
LinkToAvatarID 1402
TarotFigurePath SpriteOutput/UI/Avatar/Special/Special_1415/CardFigure/CardFigure_1402.png
TarotIconPath   SpriteOutput/UI/Avatar/Special/Special_1415/Card/Card_1402.png
Order           4
```

这套 `Special_1415` 专用资源及完整 14 条映射，是其服务昔涟特殊效果页面的强直接证据。

### 姬子·启行

#### Identity

| Field | Value | Evidence |
|---|---|---|
| Avatar ID | `1510` | `AvatarConfig.json.AvatarID` |
| Avatar name | 姬子·启行 | `AvatarName.Hash = 12653203655511224443` |
| Path | `Mage` | `AvatarConfig.AvatarBaseType` |
| Special source skill | `151022` 开拓，与你同行 | visible `AvatarSkillConfig` record |
| Special progression | `PointID = 1510004` | its `LevelUpSkillID` contains `151004`, `151022`, `151025`, `151026` |

#### Special-effect skills

| SkillID | 名称 | HideInUI | Type / effect | Icon | Referenced By |
|---:|---|---|---|---|---|
| `151025` | 同行协议：裁决 | true | `AttackType = Assist`, `SkillEffect = AoEAttack`, type text = 助战技 | `SkillIcon_1510_AssisSkill02.png` | `AvatarSkillLink` |
| `151026` | 同行协议：歼破 | true | `AttackType = Assist`, `SkillEffect = AoEAttack`, type text = 助战技 | `SkillIcon_1510_AssisSkill03.png` | `AvatarSkillLink` |

`151025`：

- name hash: `1165259365179791606`
- description hash: `5030389794118958784`
- description: 进入【同行协议：裁决】状态；强化姬子·启行伤害/终结技伤害，并在队友主动施放规定次数终结技后发动无消耗助战技。
- `ExtraEffectIDList = [10000032]`，解释“助战技”。

`151026`：

- name hash: `13153160677134990962`
- description hash: `13738543041774056539`
- description: 进入【同行协议：歼破】状态；提高全队暴击伤害/战技暴击伤害，按命中敌人数充能并发动无消耗助战技。
- `ExtraEffectIDList = [10000032]`，解释“助战技”。

`AvatarSkillLink` 的目标集合：

| SkillID | Full list | Simplified list |
|---:|---|---|
| `151025` | `8001` 开拓者、`1002` 丹恒、`1213` 丹恒·饮月、`1414` 丹恒·腾荒、`1313` 星期日 | `8001` 开拓者、`1002` 丹恒、`1313` 星期日 |
| `151026` | `1001` 三月七、`1413` 长夜月、`1004` 瓦尔特、`1003` 姬子 | `1001` 三月七、`1004` 瓦尔特、`1003` 姬子 |

可见父技能 `151022` 的原文明确说明：若使用者是姬子·启行以外的“开拓同行”，姬子·启行按使用者获得其中一种特殊效果。该语义与 `AvatarSkillLink` 的两组角色列表完全吻合。

## 3. Special Effect Skill Reference Chain

### 3.1 昔涟

```text
AvatarConfig
  AvatarID = 1415 (昔涟)
  AvatarBaseType = Memory
        |
        v
AvatarSkillTreeConfig
  AvatarID = 1415
  PointID = 1415301
  PointType = 4
  PointTriggerKey = PointServant1
  LevelUpSkillID = [1141501, 1141502, 1141513 ... 1141526]
        |
        +-------------------------------+
        |                               |
        v                               v
AvatarServantConfig               AvatarServantSkillConfig
  ServantID = 11415                SkillID = 1141513 ... 1141526
  SkillIDList contains all 14       HideInUI = true
  Config = Servant_Cyrene...        AttackType = Servant
                                    SkillEffect = Support
                                            |
                                            v
                                AvatarServantSkillLink
                                  SkillID
                                  LinkToAvatarID
                                  Order
                                  TarotFigurePath
                                  TarotIconPath
                                  UI/Avatar/Special/Special_1415/...
```

**Confirmed facts:**

- `AvatarSkillTreeConfig.AvatarID = 1415` 的 `LevelUpSkillID` 明确包含全部 14 个特殊 SkillID。
- `AvatarServantConfig.ServantID = 11415` 的 `SkillIDList` 明确包含全部 14 个特殊 SkillID。
- `AvatarServantSkillLink.SkillID` 对 14 个 ID 一一建立目标角色、显示顺序和特殊卡图关系。
- 14 个 ID 在 `AvatarServantSkillConfig` 中都有正式名称、描述、等级、参数和 `HideInUI = true`。

**Strong inference:**

- `AvatarServantSkillLink` 是官方昔涟特殊效果/塔罗卡页面的直接展示数据。理由是文件只含这 14 条、每条都使用 `UI/Avatar/Special/Special_1415` 专用资源，并完整覆盖调查对象。

**Unknown:**

- `TurnBasedGameData` 不包含游戏客户端 UI 控制器源码，无法在本仓库中证明具体哪个 prefab/controller 读取此表或点击交互的事件名。

### 3.2 姬子·启行

```text
AvatarConfig
  AvatarID = 1510
  SkillList contains 151022, 151025, 151026
        |
        v
AvatarSkillTreeConfig
  AvatarID = 1510
  PointID = 1510004
  LevelUpSkillID = [151004, 151022, 151025, 151026]
        |
        +--> AvatarSkillConfig 151022 (visible parent assist skill)
        |      description says different Trailblaze Companions grant one special effect
        |
        +--> AvatarSkillConfig 151025 (HideInUI = true)
        +--> AvatarSkillConfig 151026 (HideInUI = true)
                   |
                   v
             AvatarSkillLink
               SkillID -> LinkToAvatarIDList
                       -> LinkToAvatarIDSimplifiedList
```

**Confirmed facts:**

- `AvatarConfig.SkillList`、`AvatarSkillTreeConfig.LevelUpSkillID` 同时包含两个隐藏技能。
- `AvatarSkillLink` 直接以 `SkillID` 引用两个隐藏技能并分配角色集合。
- `151022` 的描述把角色身份与“特殊效果的其中一种”建立了显式语义关系。

**Strong inference:**

- `AvatarSkillLink` 是姬子·启行特殊效果选择/说明 UI 的展示 mapping。文件只有这两条记录，角色分组与 `151022` 描述完全相符。

**Unknown:**

- `LinkToAvatarIDList` 与 `LinkToAvatarIDSimplifiedList` 在客户端中切换的精确条件。字段名表明后者用于 simplified presentation，但数据仓库没有消费代码。

## 4. HideInUI Semantics

### 吉尔伽美什对照

吉尔伽美什 LD 配置中的 `150909`：

- name: 漫不经心
- name hash: `6663538969025930431`
- description: empty
- `AttackType = BPSkill`
- `SkillEffect = SingleAttack`
- `HideInUI = true`
- 被 `AvatarConfigLD.AvatarID = 1509.SkillList` 引用
- 未被 `AvatarSkillLink`、`AvatarServantSkillLink` 或其他专用 display mapping 引用

因此，对 standard character skill list 应隐藏它。全仓精确搜索中出现的其他 `150909` 子串多为 VoiceID、TalkSentenceID、motion ID 或无关 hash，不构成 skill display relation。

### Safe scope

`HideInUI` 可以安全用于：

- 从 `AvatarConfig.SkillList` 自动构建标准 Character Skill Cards；
- 从 `AvatarServantConfig.SkillIDList` 自动构建标准 Memosprite Skill Cards；
- 防止内部/替代/取消/实现技能因普通关系被重复展示。

`HideInUI` 不能用于：

- 删除 raw `AvatarSkillConfig` / `AvatarServantSkillConfig` 记录；
- 构建全局 SkillID lookup 前过滤；
- 拒绝解析 `AvatarSkillLink` / `AvatarServantSkillLink` 明确引用的 SkillID；
- 推导“玩家永远看不到此内容”。

更准确的语义表述是：

> Do not expose this record through the default skill-list presentation path; another explicit presentation path may still reference it.

## 5. Colored / Underlined Keyword Investigation

### 5.1 昔涟案例：此诗，献予一切生命

该技能是德谬歌的正常可见忆灵技：

- config: `AvatarServantSkillConfig.json`
- SkillID: `1141502`
- name hash: `18212054484327507581`
- description hash: `1079349313869035708`
- `HideInUI`: false/字段缺省
- `ExtraEffectIDList = [10000009, 10000025]`
- `SimpleExtraEffectIDList = [10000009, 10000025]`

TextMapCHS 原始 description：

```text
对指定我方单体角色施加<u>增益效果</u>。当该角色为<u>黄金裔</u>时，使其获得<color=#f9b0f0><u><unbreak><icon SpriteName=AvatarCyrene id=0 width=1 height=1>特</unbreak>殊效果</u></color>。当该角色不是<u>黄金裔</u>时，使其造成的伤害提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>，持续<unbreak>#3[i]</unbreak>回合，该效果对其忆灵也生效。
```

Markup 分析：

- `<u>增益效果</u>`：下划线术语。
- `<u>黄金裔</u>`：下划线术语；没有内嵌 ID。
- `<color=#f9b0f0><u>...特殊效果...</u></color>`：粉色 + 下划线；内部还使用 `<icon SpriteName=AvatarCyrene id=0 ...>` 插入角色专属 icon。
- `<unbreak>`：防止术语/数值错误换行，不承担 tooltip identity。
- `#2[i]`、`#3[i]`：参数占位符，不是 glossary reference。

解释来源：

| Underlined term | Skill ExtraEffectID | ExtraEffect name hash | ExtraEffect desc hash | Explanation |
|---|---:|---:|---:|---|
| 增益效果 | `10000009` | `18157997645719654996` | `11900561702339978033` | 对战斗有增益效果的所有持续状态，若无特殊说明则可以被解除。 |
| 黄金裔 | `10000025` | `10091091466095703957` | `8498977798639018880` | 昔涟、缇宝、刻律德菈、长夜月、丹恒·腾荒、海瑟音、风堇、白厄、那刻夏、阿格莱雅、万敌、遐蝶、赛飞儿、开拓者·记忆。 |

结论：markup 只负责展示样式；tooltip identity 来自同一 skill record 的 ExtraEffect list。名称文本与下划线文本相同，使客户端可以把 ExtraEffect disclosure/tooltip 与对应术语呈现到一起。数据中没有 `golden-desc-id` 一类 inline reference。

### 5.2 为什么不是 NounAtlas

调查了：

- `NounAtlas.json`
- `NounAtlasChangeInfo.json`
- TextMap 中所有“黄金裔”精确文本 hash
- `NounArchivePage`、`NounArchive` 相关配置

结果：`NounAtlas` 是独立的名词档案/百科系统，没有包含本次所需的“黄金裔”“助战技”等技能 tooltip 记录，也没有被上述 SkillID 或 SkillDesc hash 引用。真正的定义项位于 `ExtraEffectConfig.json`。

### 5.3 姬子·启行同类验证

可见父技能 `151022`“开拓，与你同行”的原始描述包含：

```text
若使用者为姬子•启行外的<u>开拓同行</u>角色，则根据使用者的不同，姬子•启行额外获得<color=#DE7A66><u><unbreak><icon SpriteName=AvatarHimekoNova id=0 width=1 height=1>特</unbreak>殊效果</u></color>的其中1种。
所有<color=#DE7A66><u><unbreak><icon SpriteName=AvatarHimekoNova id=1 width=1 height=1>特</unbreak>殊效果</u></color>发动的额外<u>助战技</u>单场战斗中最多发动...
```

该记录的：

- `ExtraEffectIDList = [10000031, 10000032]`
- `10000031` = 开拓同行：开拓者、姬子、姬子·启行、三月七、长夜月、丹恒、丹恒·饮月、丹恒·腾荒、瓦尔特、星期日。
- `10000032` = 助战技：能给予我方目标的额外技能，施放助战技也会消耗当前行动回合。

两个隐藏“同行协议”技能也都携带 `ExtraEffectIDList = [10000032]`，因此其描述中的 `<u>助战技</u>` 使用完全相同的 `ExtraEffectConfig` 系统。

**Confirmed：昔涟与姬子·启行使用同一 markup + ExtraEffect relation，而不是两个角色特有的 keyword config。**

## 6. Relation to ExtraEffects

### Upstream relation

Special keyword tooltip 并不独立于 ExtraEffects；在本次两个案例中，它就是 `ExtraEffectConfig` 系统：

```text
SkillDesc TextMap
  -> <u>visible term</u> / color / icon markup

Skill config ExtraEffectIDList
  -> ExtraEffectConfig.ExtraEffectID
       -> ExtraEffectName TextMap
       -> ExtraEffectDesc TextMap
```

### Current HSR-Database behavior

当前 production pipeline 已能对进入 player-facing pipeline 的技能解析 ExtraEffects：

- 生成的昔涟 `1141502` 已包含 `10000009`“增益效果”和 `10000025`“黄金裔”。
- 生成的姬子·启行 `151022` 已包含 `10000031`“开拓同行”和 `10000032`“助战技”。
- 生成数据保留了 description token 的 `underline: true`。

所以“现有 ExtraEffects 没有这些解释”并非上游关系缺失，也不是当前 resolver 完全无法解析。更准确的现状是：

- 标准可见父技能已经拥有这些 ExtraEffect explanations；
- 14 个昔涟特殊技能和 2 个同行协议技能被 `HideInUI` 从 standard skill builder 排除；
- 网站尚未实现读取 link table 的 Special Effect Builder/UI，因此这些隐藏 special-effect records 及其自身 ExtraEffects 没有独立展示入口。

### Presentation boundary

应分开建模的是 presentation container，而不是 tooltip definition source：

- `ExtraEffectConfig`：通用术语/机制解释数据。
- `AvatarSkillLink` / `AvatarServantSkillLink`：角色专属特殊效果条目、目标映射、顺序及专用视觉资源。
- standard skill cards 和 special-effect cards 可以共享同一个 ExtraEffect resolver/disclosure component。

## 7. HSR-Database Architecture Recommendation

### 7.1 Full raw indexes

构建两个不过滤 visibility 的索引：

```text
avatarSkillById: Map<SkillID, AvatarSkillConfig level rows>
servantSkillById: Map<SkillID, AvatarServantSkillConfig level rows>
```

TextMap hash 必须继续保持 decimal string/BigInt-safe 处理。

### 7.2 Standard skill visibility

现有 standard builders 继续遵守 `HideInUI`：

- `AvatarConfig.SkillList` -> normal avatar skill discovery -> filter `HideInUI`。
- `AvatarServantConfig.SkillIDList` / PointType 4 relation -> normal memosprite discovery -> filter `HideInUI`。

这保留了吉尔伽美什、Archer、饮月取消技能、昔涟内部/特殊忆灵技能不进入常规技能卡的正确行为。

### 7.3 Explicit special-effect builders

新增独立 builder 时，应直接读取配置关系：

#### Cyrene-style servant special effects

```text
AvatarServantSkillLink rows
  -> SkillID lookup in servantSkillById
  -> LinkToAvatarID
  -> Order
  -> TarotFigurePath / TarotIconPath
  -> normalized levels + ExtraEffects
```

需要决定如何把 `AvatarServantSkillLink` 归属到 owner avatar。对当前数据，所有资源路径都包含 `Special_1415`，并且所有 SkillID 同时属于 `AvatarSkillTreeConfig.AvatarID = 1415` 的 PointType 4 progression。推荐使用 SkillTree/Servant relation 确认 owner，资源路径只作为审计信号，不作为 primary key。

#### Himeko-style avatar special effects

```text
AvatarSkillLink rows
  -> SkillID lookup in avatarSkillById
  -> full/simplified target AvatarID lists
  -> normalized levels + ExtraEffects
```

owner 可由 `AvatarConfig.SkillList` 和 `AvatarSkillTreeConfig.LevelUpSkillID` 反查；当前两条唯一归属于 `AvatarID = 1510`。

### 7.4 Visibility precedence

建议明确规则：

```text
explicitSpecialReference(skillId) > standard HideInUI exclusion
```

这不表示修改 `HideInUI` 或把技能重新加入标准列表，而是让不同 presentation path 各自拥有 visibility 规则。

### 7.5 No skill visibility heuristic

本调查范围内不需要名称匹配、SkillID 前缀、icon 共用或角色 hardcode 来判断 special-effect visibility。两套专用 link table 已经提供明确引用。

仍可保留的不是 visibility heuristic，而是 validation/audit：

- link table SkillID 必须能在正确的 full index 中解析；
- 同一 SkillID 各等级 `HideInUI` 状态必须一致；
- special link 的 owner 必须可由 Avatar/SkillTree/Servant relation 唯一确认；
- target AvatarID 必须存在；
- order 不得冲突；
- visual asset 缺失应有 fallback；
- underline term 与 ExtraEffect name 不匹配时记录诊断，但不要靠文本匹配决定关系存在与否。

## 8. Open Questions

1. **Unknown:** 游戏客户端究竟以何种 controller/prefab 读取 `AvatarServantSkillLink` 和 `AvatarSkillLink`。数据仓库没有客户端 UI 代码。
2. **Unknown:** `LinkToAvatarIDList` 与 `LinkToAvatarIDSimplifiedList` 的运行时选择条件。
3. **Unknown:** `AvatarSkillLink` 后续是否会承载其他角色，还是当前专用于姬子·启行。当前文件只有两条记录，不能假设 schema 永远只有一个 owner。
4. **Unknown:** `AvatarServantSkillLink` 后续是否会为其他 owner avatar 增加记录。实现时必须通过 SkillID owner relation 分组，不能硬编码 `1415`。
5. **Strong inference:** 粉色/红色“特殊效果”文本本身是打开特殊效果页面/提示的交互入口；markup 提供 icon/color/underline，但点击行为不在导出数据中。
6. **Confirmed limitation:** `ExtraEffectIDList` 是 skill 级的解释集合，没有 inline span -> ExtraEffectID 映射。如果一个描述有多个同名/不同名下划线术语，客户端具体匹配顺序仍需通过 UI 行为或客户端代码确认。

## 9. Files / Configs Investigated

| File | Purpose | Relation status |
|---|---|---|
| `ExcelOutput/AvatarConfig.json` | Avatar identity and normal SkillList | Confirmed participant |
| `ExcelOutput/AvatarConfigLD.json` | 吉尔伽美什 LD identity/SkillList | Confirmed comparison participant |
| `ExcelOutput/AvatarSkillConfig.json` | 姬子·启行技能及标准昔涟 avatar skills | Confirmed participant |
| `ExcelOutput/AvatarSkillConfigLD.json` | 吉尔伽美什 `150909` | Confirmed comparison participant |
| `ExcelOutput/AvatarServantConfig.json` | 德谬歌 `11415` 及完整 SkillIDList | Confirmed participant |
| `ExcelOutput/AvatarServantSkillConfig.json` | 昔涟 14 个特殊忆灵技及 `1141502` | Confirmed participant |
| `ExcelOutput/AvatarSkillTreeConfig.json` | Avatar -> progression -> SkillID relation | Confirmed participant |
| `ExcelOutput/AvatarSkillLink.json` | 同行协议 SkillID -> target avatar groups | Confirmed special relation |
| `ExcelOutput/AvatarServantSkillLink.json` | 14 个献诗 SkillID -> target/avatar/card/order | Confirmed special relation |
| `ExcelOutput/ExtraEffectConfig.json` | underlined terms and tooltip definitions | Confirmed tooltip source |
| `TextMap/TextMapCHS.json` | raw names/descriptions/markup | Confirmed text source |
| `ExcelOutput/NounAtlas.json` | noun archive candidate | Investigated; not involved |
| `ExcelOutput/NounAtlasChangeInfo.json` | noun archive replacement relation | Investigated; not involved |
| `Config/GameCoreUISetting.json` | skill type colors and common UI settings | Investigated; not the tooltip relation |
| `Config/ConfigAbility/Servant/Servant_CyreneServant_00_Ability.json` | battle implementation | Spot-checked; not needed for UI identity chain |
| `StarRailRes` | potential asset cross-check | Not required; link config already contains authoritative asset paths |
| `HSR-Database/scripts/data/sync.ts` | current parser behavior | Confirms standard HideInUI filtering and ExtraEffect resolution |
| `HSR-Database/scripts/data/validate.ts` | current visibility invariants | Confirms 14+2 skills are intentionally absent from standard cards |
| `HSR-Database/src/lib/generated/details/characters/1415.json` | current generated Cyrene data | Confirms `1141502` already includes Golden Scion ExtraEffect |
| `HSR-Database/src/lib/generated/details/characters/1510.json` | current generated Himeko data | Confirms `151022` already includes Trailblaze Companion/Assist Skill ExtraEffects |

## 10. Evidence Appendix

### A. Key owner/progression IDs

| Entity | ID | Important fields |
|---|---:|---|
| 昔涟 | `1415` | `AvatarBaseType = Memory` |
| 德谬歌 | `11415` | `SkillIDList` includes `1141501`, `1141502`, `1141513`-`1141526` |
| 昔涟忆灵技 progression | `1415301` | `PointType = 4`, `PointTriggerKey = PointServant1`, contains all 14 special IDs |
| 姬子·启行 | `1510` | SkillList contains `151022`, `151025`, `151026` |
| 姬子·启行天赋 progression | `1510004` | contains `151004`, `151022`, `151025`, `151026` |

### B. Special SkillID sets

```text
Cyrene/Demiurge special effects:
1141513, 1141514, 1141515, 1141516, 1141517, 1141518, 1141519,
1141520, 1141521, 1141522, 1141523, 1141524, 1141525, 1141526

Himeko special effects:
151025, 151026
```

### C. Tooltip IDs

| ExtraEffectID | Name | Name hash | Desc hash |
|---:|---|---:|---:|
| `10000009` | 增益效果 | `18157997645719654996` | `11900561702339978033` |
| `10000025` | 黄金裔 | `10091091466095703957` | `8498977798639018880` |
| `10000031` | 开拓同行 | `5638119904684089463` | `9294130689424795237` |
| `10000032` | 助战技 | `73511576447477049` | `4790548193254787042` |

### D. Exact-reference search result summary

对 14 个昔涟特殊 SkillID 的精确全仓搜索，稳定出现于：

- `AvatarServantSkillConfig.json`
- `AvatarServantSkillLink.json`
- `AvatarServantConfig.json`
- `AvatarSkillTreeConfig.json`
- `AvatarRankConfig.json`

其中 `AvatarServantSkillLink` 是唯一同时携带目标 Avatar、UI 专用卡图和显示顺序的 relation。

对 `151025` / `151026` 的精确全仓搜索，稳定出现于：

- `AvatarSkillConfig.json`
- `AvatarSkillLink.json`
- `AvatarConfig.json`
- `AvatarSkillTreeConfig.json`
- `AvatarRankConfig.json`

其中 `AvatarSkillLink` 是唯一把两个 SkillID 分别映射到不同适用 Avatar 集合的 relation。

搜索结果中纯粹把数字包含在更长 hash、坐标、VoiceID、TalkSentenceID、PerformanceID 中的命中均不作为 SkillID relation 证据。
