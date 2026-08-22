# Refactor-09 Phase 4 调查报告：开拓者·记忆强化普攻【明天，一同写下！】

- 调查日期：2026-08-22
- 权威数据源：`../TurnBasedGameData`
- 数据源提交：`648b08fbdb2e49739ebbf1210c9a189fcfc5e2d7`
- 调查性质：只读配置调查；本轮未修改数据 pipeline、visibility architecture 或 UI

## 结论摘要

【明天，一同写下！】不是只能依靠名称、图标或 SkillID 规律推断的内部技能。`TurnBasedGameData` 提供了两类互相补强的显式关系：

1. `ExcelOutput/AvatarSpecialSkillTree.json` 使用 `ShowSkill` 明确声明该技能应在开拓者·记忆的特殊技能树 presentation 中展示；
2. `ExcelOutput/AvatarSkillTreeConfig.json` 使用同一个基础攻击升级节点的 `LevelUpSkillID`，把普通普攻和强化普攻放入同一升级组。

因此，可以仅依赖显式配置稳定识别该技能，而不需要恢复 progression/name/icon heuristic，也不需要 hardcode SkillID。推荐未来使用：

```text
FULL Avatar Skill index
    ↓
AvatarSpecialSkillTree.ShowSkill（显式 inclusion relation）
    ↓
AvatarSkillTreeConfig.LevelUpSkillID（显式 progression/group relation）
    ↓
现有 Basic ATK multi-variant Skill Card
```

但本次没有在导出的 Mission、MainMission、SubMission、StoryLine 或相关配置中找到“具体 Mission ID → 解锁 `Point21`/技能”的直接关系。因此可以回答“为什么它是正式玩家展示技能”，但不能仅凭当前导出数据准确还原它在剧情中的具体解锁任务或玩家进度条件。

## 1. Skill identity

目标角色存在男女两套镜像配置：

| 性别配置      | AvatarID |  SkillID | 名称             | 配置文件                             |          等级记录 | HideInUI |
| ------------- | -------: | -------: | ---------------- | ------------------------------------ | ----------------: | -------- |
| 男开拓者·记忆 |   `8007` | `800708` | 明天，一同写下！ | `ExcelOutput/AvatarSkillConfig.json` | Lv.1–10，共 10 条 | `true`   |
| 女开拓者·记忆 |   `8008` | `800808` | 明天，一同写下！ | `ExcelOutput/AvatarSkillConfig.json` | Lv.1–10，共 10 条 | `true`   |

两套记录除 TextMap hash 和 SkillID 外，战斗展示字段一致：

| 字段                   | 值                                                                |
| ---------------------- | ----------------------------------------------------------------- |
| `SkillTypeDesc`        | `普攻`（TextMap hash `12757588871161859361`）                     |
| `AttackType`           | `Normal`                                                          |
| `SkillTag`             | `群攻`（TextMap hash `9868503137584243444`）                      |
| `SkillTriggerKey`      | `Skill11`                                                         |
| `SkillIcon`            | `SpriteOutput/SkillIcons/Avatar/8007/SkillIcon_8007_Normal02.png` |
| `MaxLevel`             | `10`                                                              |
| `StanceDamageType`     | `Ice`                                                             |
| `SkillEffect`          | `AoEAttack`                                                       |
| `SPBase.Value`         | `30`                                                              |
| `BPNeed.Value`         | `-1`                                                              |
| `BPAdd.Value`          | `1`                                                               |
| `StanceDamageDisplay`  | `10`                                                              |
| `ShowStanceList`       | `[0, 30, 0]`                                                      |
| `ExtraEffectIDList`    | `[10000011, 10000019]`                                            |
| `RatedSkillTreeID`     | `[]`                                                              |
| `RatedRankID`          | `[]`                                                              |
| `SkillComboValue`      | 字段不存在                                                        |
| `SkillComboValueDelta` | 字段不存在                                                        |

技能描述明确写明它消耗 1 层【史诗】，由开拓者与迷迷发动连携攻击，攻击敌方全体，并为迷迷恢复充能。Lv.1 参数为 `[0.6, 0.6, 0.1]`，Lv.10 为 `[1.68, 1.68, 0.1]`；前两项随等级递增，充能参数保持不变。

`AvatarConfig.json` 也直接把它列入角色技能列表：

```text
AvatarID 8007 SkillList =
  800701, 800702, 800703, 800704, 800706, 800707, 800708, 800709

AvatarID 8008 SkillList =
  800801, 800802, 800803, 800804, 800806, 800807, 800808, 800809
```

这证明 `800708/800808` 属于对应角色，但单独的 `SkillList` 仍不足以越过 `HideInUI`；真正明确声明特殊 presentation 的关系是后述 `AvatarSpecialSkillTree.ShowSkill`。

## 2. Normal Basic ATK

普通普攻同样有男女两套镜像记录：

| AvatarID | 普通普攻 SkillID | 名称         | AttackType | SkillTag | Trigger   | HideInUI             |
| -------: | ---------------: | ------------ | ---------- | -------- | --------- | -------------------- |
|   `8007` |         `800701` | 包在我身上！ | `Normal`   | 单攻     | `Skill01` | 字段不存在，即 false |
|   `8008` |         `800801` | 包在我身上！ | `Normal`   | 单攻     | `Skill01` | 字段不存在，即 false |

普通普攻也有 Lv.1–10 共 10 条记录，图标为 `SkillIcon_8007_Normal.png`。它和强化普攻：

- 共享 `SkillTypeDesc = 普攻`、`AttackType = Normal`、`MaxLevel = 10` 和冰属性；
- 不共享 `SkillTag`：普通普攻为单攻，强化普攻为群攻；
- 不共享图标：普通普攻使用 `Normal.png`，强化普攻使用 `Normal02.png`；
- 不共享 trigger：分别为 `Skill01` 与 `Skill11`；
- Skill record 内没有 `ParentSkillID`、`ReplaceSkill`、`OverrideSkill` 或直接指向另一技能的字段。

二者的直接 grouping relation 位于技能树，而不是 Skill record：

```text
PointID 8007001 / AvatarID 8007 / AnchorType Point01
LevelUpSkillID = [800701, 800708]

PointID 8008001 / AvatarID 8008 / AnchorType Point01
LevelUpSkillID = [800801, 800808]
```

以上数组在该 PointID 的 Lv.1–6 六条记录中保持一致。项目当前的 `progressionIdsFor()` 已经以 `PointID` 作为 progression ID，因此在现有 pipeline 中：

```text
800701 + 800708 → progression 8007001
800801 + 800808 → progression 8008001
```

此外，`AvatarRankConfig.json` 的第 5 星魂也同时为普通和强化普攻加 1 级：

```text
RankID 800705 SkillAddLevelList:
  800701: 1
  800708: 1

RankID 800805 SkillAddLevelList:
  800801: 1
  800808: 1
```

这是二者共享升级 progression 的第二项显式证据。

## 3. References

对 `800708`、`800808` 做精确数字边界搜索后，重要引用如下。

### 直接引用

| 文件                                      | 字段/位置                         | 含义                            |
| ----------------------------------------- | --------------------------------- | ------------------------------- |
| `ExcelOutput/AvatarSkillConfig.json`      | `SkillID`，每个 ID 各 10 条       | 技能 Lv.1–10 原始记录           |
| `ExcelOutput/AvatarConfig.json`           | `SkillList`                       | 技能归属于 Avatar `8007/8008`   |
| `ExcelOutput/AvatarSkillTreeConfig.json`  | `LevelUpSkillID`，每个性别各 6 条 | 与普通普攻共享升级节点          |
| `ExcelOutput/AvatarRankConfig.json`       | `SkillAddLevelList`               | 第 5 星魂同时提升普通和强化普攻 |
| `ExcelOutput/AvatarSpecialSkillTree.json` | `ShowSkill`                       | 明确的特殊技能树展示关系        |

### 间接引用与语义证据

| 文件                                                            | 相关记录                                                            | 含义                                                               |
| --------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `ExcelOutput/AvatarSkillTreeConfig.json`                        | `PointID 8007501/8008501`，`AnchorType=Point21`                     | 与特殊技能树记录通过 AvatarID + AnchorType 对应的特殊节点          |
| `ExcelOutput/AvatarSkillConfig.json`                            | 终结技 `800703/800803` 的 `RatedSkillTreeID=[8007501]/[8008501]`    | 特殊节点会影响终结技机制                                           |
| `ExcelOutput/AvatarStatusConfig.json`                           | `StatusID=10080075`，`ModifierName=MAvatar_PlayerBoy_30_UltraState` | 【史诗】状态；描述明确“迷迷在场时，普攻强化为【明天，一同写下！】” |
| `Config/ConfigCharacter/Avatar/Avatar_PlayerBoy_30_Config.json` | `Skill11`                                                           | 角色战斗配置声明该正式可选技能及其 ability 列表                    |
| `TextMap/TextMapCHS.json`                                       | 技能名称、描述、【史诗】状态文本                                    | 说明真实玩家机制，而非仅内部占位文本                               |

### 仅文本或无关命中

全仓库的非边界字符串搜索还会命中：

- TextMap 中包含相同数字片段的 hash；
- `0.800808` 这样的地图坐标；
- SoundBank、语音、聊天或其它 ID 中的数字子串。

这些均不是 SkillID relation，已从结论证据中排除。

## 4. Unlock / replacement relation

### 找到的显式 presentation relation

`ExcelOutput/AvatarSpecialSkillTree.json` 只有以下两条记录：

```json
{
  "AvatarID": 8007,
  "AnchorType": "Point21",
  "AvatarImgPath": "SpriteOutput/AvatarDrawCard/8007_02.png",
  "ShowSkill": 800708
}
{
  "AvatarID": 8008,
  "AnchorType": "Point21",
  "AvatarImgPath": "SpriteOutput/AvatarDrawCard/8008_02.png",
  "ShowSkill": 800808
}
```

`ShowSkill` 是本次调查最关键的 inclusion signal：它不是通过名称、图标或 progression 猜测，而是专门的配置表直接指定应展示的 SkillID。

### 特殊节点关系

同一 `AvatarID + AnchorType=Point21` 可对应到：

```text
PointID 8007501 / AvatarID 8007
PointID 8008501 / AvatarID 8008

PointType = 5
AnchorType = Point21
MaxLevel = 1
DefaultUnlock = 字段不存在
PrePoint = []
MaterialList = []
LevelUpSkillID = []
IconPath = SkillIcon_8007_Normal02.png
PointTriggerKey = PointSpecial1
ParamList = [2]
```

该节点使用强化普攻图标，并被终结技 `800703/800803` 通过 `RatedSkillTreeID` 引用。它表现为一个非普通养成解锁的特殊节点，但节点本身没有 Mission ID，也没有 `LevelUpSkillID`；强化普攻的共享升级关系仍来自普通攻击节点 `8007001/8008001`。

### 没有找到的字段或链

在目标 Skill record、Avatar config、SkillTree、Rank、Mission 和 Story 表中，没有找到：

- `ReplaceSkill` / `OverrideSkill` / `EnhancedSkill`；
- base SkillID → enhanced SkillID 的专用 replacement 字段；
- Mission ID → `8007501/8008501` 或 `800708/800808` 的直接引用；
- PlayerProgress flag → SkillID 的直接关系。

因此，准确说法是：

> 找到了显式的“展示此特殊技能”关系和显式的“与普通普攻共享升级组”关系；没有找到导出的“具体剧情任务直接替换技能”关系。

完整、可由现有配置证明的链是：

```text
Avatar 8007 / 8008（开拓者·记忆）
    ↓ AvatarConfig.SkillList
Skill 800708 / 800808（HideInUI=true）
    ↓ AvatarSpecialSkillTree.ShowSkill
特殊技能树明确展示该技能
    ↓ AvatarID + AnchorType Point21
Special Point 8007501 / 8008501
    ↓ 另一条显式 grouping relation
Basic Point 8007001 / 8008001.LevelUpSkillID
    ↓
普通普攻 800701 / 800801 + 强化普攻 800708 / 800808
```

## 5. Story relation

本次专门检查了：

- `MainMission.json`、`MainMissionPack.json`、`MainMissionSchedule.json`；
- `SubMission.json`、`StoryLine.json`、`MissionStoryEvent.json`；
- `SpecialAvatar.json`、`SpecialAvatarLD.json`；
- 目标 SkillID、PointID、`Point21`、`PointSpecial1` 的全表引用。

没有找到任何 Mission/MainMission/SubMission/Story 记录直接引用：

```text
800708 / 800808
8007501 / 8008501
Point21 / PointSpecial1
```

`Point21` 只出现在 `AvatarSpecialSkillTree.json` 和对应的两条 `AvatarSkillTreeConfig` 记录中。特殊节点没有 `DefaultUnlock=true`、没有前置节点、没有材料，也没有 Mission 字段。这支持“它由普通养成树之外的外部状态解锁”的判断，但这是配置形状上的推论，不能据此虚构具体任务 ID。

战斗内的可用条件有明确文本证据：

- 【史诗】状态描述：“迷迷在场时，普攻强化为【明天，一同写下！】”；
- 另一组开拓者·记忆机制文本说明施放终结技后获得【史诗】，持有【史诗】且迷迷在场时普攻强化。

这些文本解释解锁后的战斗内切换条件，但不等于剧情解锁链。未来静态数据库无需模拟玩家任务进度，只需确认该技能是正式可展示形态。

## 6. Multi-variant evidence

配置证据足以支持：

```text
普通普攻【包在我身上！】
+
强化普攻【明天，一同写下！】
→ 同一个 Basic ATK Skill Card
```

证据强度从高到低如下：

1. `AvatarSpecialSkillTree.ShowSkill` 明确要求展示强化技能；
2. `AvatarSkillTreeConfig.LevelUpSkillID` 把普通和强化普攻放在同一 PointID；
3. 第 5 星魂同时为两者加级；
4. 二者均为 `AttackType=Normal`、`SkillTypeDesc=普攻`，且共享 Lv.1–10 progression；
5. Avatar 战斗配置同时声明 `Skill01` 和 `Skill11`；
6. 状态文本明确使用“普攻强化为”语义。

不同 SkillTag、图标和 trigger 是不同 variant 的预期差异，不削弱 grouping 证据。

项目现有 pipeline 已经用 SkillTree `PointID` 生成 progression ID，所以未来只需通过显式 `ShowSkill` relation 让隐藏 variant 进入 standard skill variant collection；后续分类、等级交集和 multi-variant card builder 均可复用现有实现。

## 7. Similar cases

### 同一种 `AvatarSpecialSkillTree.ShowSkill` 机制

`AvatarSpecialSkillTree.json` 当前总共只有 2 条记录，即 `8007 → 800708` 和 `8008 → 800808`。没有其它角色使用该表。因此：

- 机制本身是通用、结构化的显式 relation；
- 当前数据实例只覆盖开拓者·记忆的男女镜像，不是多个角色已广泛复用的机制；
- 未来实现仍应读取该表，而不是 hardcode `8007/8008` 或 `800708/800808`。

### 为什么不能只使用 `LevelUpSkillID`

全表分析发现 13 个 SkillTree Point 同时包含可见和 `HideInUI=true` 技能。代表性例子包括：

- 黄泉 `PointID 1308003`：可见终结技 `130803` 与多个内部阶段 `130814–130817` 同组；
- 姬子·启行 `PointID 1510004`：普通技能和 `151025/151026` Special Effects 同组；
- 开拓者·记忆 `PointID 8007002`：可见战技 `800702` 与 hidden `800709` 同组，但 `800709` 不在 `AvatarSpecialSkillTree.ShowSkill` 中；
- 昔涟/其它多阶段角色也存在同一升级节点内的运行时阶段技能。

因此，以下规则不安全：

```text
hidden skill 与 visible skill 共享 LevelUpSkillID
→ 自动展示 hidden skill
```

它会重新引入 progression-only visibility heuristic，并暴露内部阶段。正确职责划分应是：

```text
AvatarSpecialSkillTree.ShowSkill → 决定 hidden skill 是否进入玩家 presentation
AvatarSkillTreeConfig.LevelUpSkillID → 决定已纳入 skill 的 progression/group
```

### 四类 HideInUI case 对比

| Case                        | HideInUI 后的显式 relation                                              | 正确 presentation                   |
| --------------------------- | ----------------------------------------------------------------------- | ----------------------------------- |
| 吉尔伽美什 `150909`         | 无玩家 presentation relation；仅在 Avatar SkillList/Skill config 中出现 | standard list 隐藏                  |
| 昔涟 hidden servant skills  | `AvatarServantSkillLink`                                                | Special Effects popup               |
| 姬子·启行 `151025/151026`   | `AvatarSkillLink`                                                       | Special Effects popup               |
| 开拓者·记忆 `800708/800808` | `AvatarSpecialSkillTree.ShowSkill` + shared SkillTree progression       | normal Basic ATK multi-variant card |

## 8. Recommended architecture

建议下一阶段增加一个轻量、通用的 `AvatarSpecialSkillTree` relation normalizer，而不是增加角色或 SkillID hardcode。

### Inclusion path

```text
AvatarSkillConfig 全量索引（不预先应用 HideInUI）
    ↓
AvatarSpecialSkillTree rows
    ↓ validate AvatarID / AnchorType / ShowSkill
    ↓ resolve ShowSkill from full index
    ↓ verify ShowSkill also belongs to AvatarConfig.SkillList
    ↓
将显式 ShowSkill 加入该 profile 的 standard Avatar skill variants
```

### Grouping path

```text
已显式纳入的 ShowSkill
    ↓
现有 progressionIdsFor(traceRows)
    ↓
PointID 8007001 / 8008001
    ↓
与普通普攻共享 slider/progression
    ↓
现有 buildSkillCards()
```

### 建议的约束和审计

- `ShowSkill` 是 inclusion allow-list；`LevelUpSkillID` 只负责 grouping，不负责 inclusion；
- 不按名称、图标、SkillID 前缀或单独的 progression 相似度恢复 hidden skill；
- 校验 relation 的 AvatarID 存在、SkillID 可解析、SkillID 属于对应 Avatar SkillList；
- 校验同一 AvatarID + AnchorType 能匹配唯一 SkillTree point；
- 对重复、冲突、未解析 relation 写 audit/warning；
- 不读取或模拟玩家账号的剧情进度；
- 不改变 Special Effects、ExtraEffect、ShowStanceList 或其它 standard visibility 路径；
- 增加回归测试，确保 `800708/800808` 被纳入 Basic card，同时 `800709`、黄泉内部阶段和吉尔伽美什 `150909` 仍不显示。

### 是否需要 hardcode

不需要。虽然当前 `AvatarSpecialSkillTree` 只有开拓者·记忆男女两条数据，但其字段已经完整表达了“哪个角色的哪个隐藏技能应被特殊展示”。读取这张表比 hardcode 更窄、更稳定，也能自然支持未来新增记录。

## 最终回答

### 为什么 `HideInUI=true` 仍应向玩家展示？

因为 `HideInUI` 只阻止默认技能列表 discovery，而 `AvatarSpecialSkillTree.ShowSkill` 明确覆盖了默认 discovery：它直接声明 `800708/800808` 是开拓者·记忆特殊技能树要展示的技能。共享 SkillTree progression、星魂共同加级以及“普攻强化为”的状态文本进一步证明它是正式强化普攻，而不是内部实现记录。

### 能否仅依赖显式配置稳定识别，而不重新引入 heuristic？

可以。使用 `AvatarSpecialSkillTree.ShowSkill` 决定 inclusion，再使用 `AvatarSkillTreeConfig.LevelUpSkillID` 决定 grouping，即可完全基于显式关系完成识别。不能把 `LevelUpSkillID` 单独当作 visibility inclusion 规则，因为同类数组还包含大量内部阶段技能。

### 能否从当前配置还原精确剧情解锁条件？

不能。当前导出数据没有提供 Mission/Story ID 到 `Point21`、`8007501/8008501` 或 `800708/800808` 的直接链。未来实现静态展示不依赖这条缺失链；若以后需要展示具体剧情条件，应单独调查客户端/服务器任务状态来源，不能在本次证据之外猜测。
