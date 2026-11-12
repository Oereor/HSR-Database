# HSR-Database v4.7 数据兼容性调查

调查日期：2026-11-11。网站代码基线：`86ece31c1d11119051fe3d4cd2cdddfb8706a0ce`，分支 `develop`。

本文以网站仓库根目录为代码路径基准；游戏配置位于只读的 `../TurnBasedGameData/`，资源位于只读的 `../StarRailRes/`。本文是调查报告，不修改现行架构契约，也不表示建议已实施。

证据分级：**事实**表示已由当前配置、源码或实际函数调用验证；**判断**表示由已验证结构推导的兼容性结论；**建议**表示后续实现方案；**待确认**表示现有证据不足或仍需产品决定。用户已确认的外部角色解锁语义直接作为前提使用。

## 1. Executive Summary

**事实：当前角色管线不能直接生成完整的 4.7 角色数据。** 这不只是新面板尚未显示：所有欢愉角色的 29 系列技能已进入 `AvatarConfig.SkillList`，但 `SkillTriggerKey=SkillAha` 无法通过当前分类器，真实调用 `buildCharacterDomain` 在 `150129` 处中止。阿哈 `151131` 的 `SkillAeon` 是另一个独立分类阻断；其 `Point23` 节点还会触发现有养成树的锚点校验错误。

**事实：可复用的基础能力较完整。** 隔离两个尚不支持的新技能后，阿哈普通技能和仓库技可通过现有 Neutral 与中英文 Projection；语义类别内多个 Variant、独立 progression、GameText 参数插值、ExtraEffects、缺图 fallback 和 Dialog 的基础交互均已有实现。无需为阿哈另建一套普通技能解析器。

**事实：新增关系尚无入口和类型。** `AvatarSeriesSkill` 与 `AvatarExRankConfig` 都没有进入数据加载清单。现有 Neutral、角色 View Model 和特殊效果联合类型没有表达外部角色条件、SeriesSkill 跨角色汇总或独立奇缘星魂的位置。把数据强行塞进普通升级 progression、普通星魂数组或已有两种特殊效果关系会丢失语义。

**事实：文本解析存在可见泄漏。** 阿哈普通 E2 描述使用 `series_ref_skill_desc`；当前 TextResolver 返回 `available`，保留整个宏，且没有诊断。29 系列技能正文和三条奇缘星魂正文所用的普通富文本格式则已通过中英文解析检查。

**判断：应先解决数据入口、分类、特殊节点和宏，再实施 UI。** 29 系列应按原始 `AvatarSeriesSkill` 关联构建独立类别，以“阿哈 E0 / 阿哈 E2”作为外部状态选择。奇缘星魂应独立建模并复用 `EidolonCard` 的内容渲染，避免 E7、ID 冲突和普通星魂激活状态误判。

**事实：当前存在两个不同的数据版本环境。** 可访问的相邻游戏仓库是 4.7，但网站的上游锁、本地固定上游和当前生成 manifest 仍为 4.6。已有 4.6 产物可用不代表 4.7 兼容。本轮未更新锁或生成产物。

## 2. 已确认的数据结构

### 2.1 版本与调查边界

| 对象 | 实际版本或提交 | 作用 |
| --- | --- | --- |
| 相邻 `../TurnBasedGameData/` | `fe44559408d9f53700a5c236edfb64c3122d9449`，`OSPRODWin4.7.0_D17128178_A17108910_L17088526` | 4.7 配置和 TextMap 的调查来源 |
| `upstream.lock.json` 的 `turnBasedGameData.commit` | `74a7b96fba32f00cf495a5c00b0311bd02207aaf`，4.6.0 | 当前构建固定来源 |
| `.upstream/TurnBasedGameData/` | 同上，4.6.0 | 本地构建准备目录 |
| `src/lib/generated/manifest.json` | `schemaVersion=64`，`sourceCommit=74a7b96…`，`gameVersion=4.6` | 当前已有生成产物的来源证据 |
| `../StarRailRes/` 与锁定资源提交 | `dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487` | 视觉资源来源，不用于推断游戏机制 |

`scripts/data/paths.ts::resolveDataRoot` 默认使用相邻 `../TurnBasedGameData`，也接受 `HSR_DATA_ROOT`。`scripts/deployment/build.ts` 则向构建命令传入已准备的 `.upstream/` 路径。因此，直接调用本地数据函数和走固定部署构建可能读取不同版本，报告中的验证均注明所用来源。

以下结论基于实际可访问的 4.7 快照，不推断未来配置。没有拉取网络更新，没有改动任一外部仓库。当前版本的新增文件已经存在，未出现需要用猜测补全的缺文件问题；网站版本锁尚未迁移是另一件事。

### 2.2 `AvatarSeriesSkill` 完整字段

来源：`../TurnBasedGameData/ExcelOutput/AvatarSeriesSkill.json`，顶层为数组，共 18 条记录，9 个不同 `SkillID`，`(SkillID, Level)` 无重复。

| 字段 | 当前形态 | 已验证含义或用途 |
| --- | --- | --- |
| `SkillID` | 整数 | 与 `AvatarSkillConfig.SkillID` 关联；当前全部形如 `{AvatarID}29`，格式是观察结果，不是推荐的解析规则 |
| `Level` | `1` 或 `2` | 与同技能的 `AvatarSkillConfig.Level` 组成精确关联键 |
| `AvatarID` | 整数 | 该升格技能所属角色，可直接用于归属和反查 |
| `UnlockCondition.Type` | `AvatarLevel` 或 `AvatarEidolon` | 条件种类；参数中的角色是外部角色阿哈 |
| `UnlockCondition.Param` | 字符串 `1511.0` 或 `1511.2` | 分别对应拥有阿哈、阿哈 E2；保留字符串或显式拆成角色 ID 与阈值，不把它当浮点数 |
| `SpecialTagPrefab` | 资源路径 | 当前全部为 `UI/Battle/ViewMode/Widget/AvatarTag/ExtraSkillTag_1511.prefab`，属于游戏 UI 资源元数据 |
| `SpecialTag` | 可选 `{ Hash }` | 仅 Level 2 存在；9 个 hash 不同，但 CHS 均解析为 `「欢愉」跃升` |
| `FramePrefab` | 资源路径 | 当前全部为 `UI/Avatar/Widget/AvatarCustomized/BtnSpecialSkillAha.prefab` |
| `RelateAvatarIDList` | 角色 ID 数组 | 仅阿哈 `151129` 非空，两个等级内容相同；可建立阿哈汇总面板的目标集合和源顺序 |

两个等级的条件一致遵循：

```json
[
  {"SkillID":151129,"Level":1,"AvatarID":1511,"UnlockCondition":{"Type":"AvatarLevel","Param":"1511.0"}},
  {"SkillID":151129,"Level":2,"AvatarID":1511,"UnlockCondition":{"Type":"AvatarEidolon","Param":"1511.2"}}
]
```

**前提：** Level 1 条件表示拥有阿哈，Level 2 条件表示阿哈达到 E2。这不是当前欢愉角色自己的等级、突破或星魂要求，也不等于实际战斗中升格状态始终生效。`10015111` 的说明仍明确要求阿哈持有【欢愉万相】状态。

### 2.3 全体角色与技能关系

来源：`AvatarSeriesSkill` 与 `AvatarConfig`、`AvatarSkillConfig` 的连接。以下 9 个角色恰好等于当前 `AvatarBaseType=Elation` 的全部角色；配置中的 `Release` 均为 `true`。后者仅是配置字段，不作为现实上线时间的判断。

| AvatarID | CHS 名称 | SkillID | 技能名 | `ParamList` Level 1 → Level 2 |
| --- | --- | --- | --- | --- |
| `1501` | 火花 | `150129` | 欢愉万相★兔子戏法 | `[0.15,10,1,8,0.5]` → `[0.2,10,1,12,1.2]` |
| `1502` | 爻光 | `150229` | 欢愉万相★心灵感应 | `[0.2,12,0,10]` → `[0.4,30,0,10]` |
| `1503` | 真珠 | `150329` | 欢愉万相★跃然纸上 | `[75,0.1,0.1]` → `[75,0.2,0.2]` |
| `1505` | 绯英 | `150529` | 欢愉万相★书中折花 | `[0.75,0.1,60,480]` → `[1.5,0.24,240,480]` |
| `1506` | 银狼LV.999 | `150629` | 欢愉万相★全息幻象 | `[360,0.2,0.4]` → `[999,0.4,0.4]` |
| `1511` | 星神★阿哈 | `151129` | 欢愉万相★无中生有 | `[0.1,0.3,0.12]` → `[0.1,0.6,0.2]` |
| `1513` | 砂金•戏浪 | `151329` | 欢愉万相★三赌牌局 | `[0,0.15,1,1]` → `[0,0.25,2,2]` |
| `8009` | 开拓者，原文为 `{NICKNAME}` | `800929` | 欢愉万相★主角光环 | `[0.2,2,0.2]` → `[0.3,3,0.2]` |
| `8010` | 开拓者，原文为 `{NICKNAME}` | `801029` | 欢愉万相★主角光环 | `[0.2,2,0.2]` → `[0.3,3,0.2]` |

名称列为阅读方便省略了银狼名称中的 `<unbreak>`，开拓者展示名必须继续走现有命名投影。表中参数是原始数值，不是已经乘以 100 的百分比显示值。

每个角色的 `SkillList` 恰好包含本人的一项 SeriesSkill；每项技能恰好有两个等级。两行配置比较时，变化字段只有 `Level`、`ParamList` 和 `SimpleParamList`。`SkillName`、`SkillDesc`、`SkillEffect`、ExtraEffects 等在两个等级之间一致，因此可共享同一模板并按等级取参数。

### 2.4 `151129.RelateAvatarIDList` 的完整关系

两个等级均按以下顺序提供：

```text
1506, 1505, 1501, 1502, 1503, 1513, 8009, 8010, 1511
```

每个目标均存在于 `AvatarConfig`，且在 `AvatarSeriesSkill` 中可按 `AvatarID + Level` 唯一查到目标技能；集合包含阿哈自己，也包含两个开拓者变体。其他八项技能的关联列表为空。

**判断：** 当前快照足以可靠生成包含 9 项的汇总。应由关联列表选择角色，再由 SeriesSkill 关系查技能，避免计算 `AvatarID * 100 + 29`。列表本身没有直接保存目标技能 ID，不能跳过第二次关系连接。

**证据边界：** 关联字段名、完整覆盖以及阿哈 E2 的 SeriesSkill 描述宏共同支持“汇总目标”的解释；仅凭配置不能确认原游戏面板的精确排版、开拓者合并方式或宏的全部展开步骤。

## 3. 新增技能调查

### 3.1 阿哈普通技能、天赋 Variant 与仓库技

来源：`AvatarConfig.AvatarID=1511`、`AvatarSkillConfig`、`AvatarSkillTreeConfig`、`AvatarGlobalBuffConfig`。

| 技能或来源 | 结构证据 | 当前结果 |
| --- | --- | --- |
| `151101` 普攻 | `AttackType=Normal`，等级 1–10，节点 `1511001` | 既有 basic 分类可处理 |
| `151102` 战技 | `AttackType=BPSkill`，等级 1–15，节点 `1511002` | 既有 skill 分类可处理 |
| `151103` 终结技 | `AttackType=Ultra`，等级 1–15，节点 `1511003` | 既有 ultimate 分类可处理 |
| `151104` 正常天赋 | `SkillTriggerKey=SkillP01`，等级 1–15，节点 `1511004` | 既有 talent 分类可处理 |
| `151106` 场景普攻 | `AttackType=MazeNormal` | 分类器明确排除，符合现有规则 |
| `151107` 秘技 | `AttackType=Maze`，等级 1，节点 `1511007` | 既有 technique 分类可处理 |
| `151120` 欢愉技 | `AttackType=ElationDamage`，等级 1–15，节点 `1511420` | 既有 elation-skill 分类可处理 |
| `151129` 命途升格 | `SkillTriggerKey=SkillAha`，等级 1、2，无升级节点 | 分类失败，详见 3.2 |
| `151131` 阿哈正传 | `SkillTriggerKey=SkillAeon`，等级 1，节点 `1511601` | 分类失败，不能表述为当前已支持第二天赋 |
| 仓库技 | `AvatarGlobalBuffConfig.AvatarID=1511`、`SkillID=151104` | 可复用既有合成 Variant 路径 |

`scripts/data/domain/character.ts::buildProfile` 按 `AvatarConfig.SkillList` 获取技能，`buildSkillVariant` 调用 `classifyProductSkill`；分类后才保留等级、参数、ExtraEffects 和 progression。`scripts/data/skills.ts::buildSkillCards` 将同类别多个 Variant 放在同一卡片内，并支持各自的 progression。这个容器能力已经存在，但不代表它已经识别 `SkillAeon`。

仓库技名称为“阿哈时刻在”。配置包含 `Name`、`SkillTag`、`Desc`、`ParamList`、ExtraEffects，以及 `AppendAvatarToBattle=true`、`MazeBuffID=151104` 和模式黑白名单。现有解析生成 `id=151104:global-buff:1`、`source=avatar-global-buff`、无 progression 的独立 Variant，与正常天赋共处 talent 卡片；`SkillVariantView` 也已有专属标记。

**事实：** 隔离 `151129`、`151131`，并移除仅用于该隔离调用的 `AvatarSpecialSkillTree` 阿哈关系后，原函数成功输出中英文六类卡片：basic、skill、ultimate、talent、elation-skill、technique；talent 内包含正常天赋和仓库技。隔离仅发生于进程内对象，未写回配置。

**边界：** 现有仓库技展示投影不保留所有游戏模式限制，它复用的是说明文本能力，不是运行时战斗资格计算器。无需因 4.7 新建阿哈专用解析器；如果以后展示模式限制，应单独确认产品范围。

### 3.2 29 系列的分类与数据损失

9 项技能均采用 `SkillTriggerKey=SkillAha`、没有 `AttackType`、没有 `HideInUI=true`、`MaxLevel=2`。`SkillTypeDesc.Hash=4638709958174700838` 的 CHS 值是“固有行迹”，不能把它直接用作用户要求的新类别标题。

`scripts/data/skills.ts::classifyAvatarSkill` 的无 AttackType 分支仅接受以 `SkillP` 开头的触发键。`classifyProductSkill` 对可见且未识别的技能抛错。实际调用在 `150129` 处返回：

```text
[character/schema] table=AvatarSkillConfig record=150129 field=AttackType value=null SkillTriggerKey="SkillAha" is not supported for a visible skill
```

因此，**技能正文已经由原始 SkillList 带入，但在分类阶段失败；外部解锁条件和关联列表则从未被加载。** 只增加原始文件加载、只添加 TS 联合值，或把未识别技能隐藏，都不能完成兼容。

完整扫描当前 `AvatarSkillConfig` 后，`SkillAha` 的不同技能集合恰好等于这 9 项；`SkillAeon` 仅有 `151131`。就这两个触发键而言，没有额外隐藏技能。这个结论不扩展为对全部战斗 Ability 的穷举。

### 3.3 等级、ExtraEffects 与技能树

对 `AvatarSkillTreeConfig` 及 LD 合并来源的 `LevelUpSkillID` 检索，18 条 SeriesSkill 关系对应的技能没有升级节点；`AvatarSpecialSkillTree.ShowSkill` 也不引用它们。其 Level 来自 `AvatarSeriesSkill` 的外部条件，不能从技能树节点合成。

现有 `SkillProgression` 由真实 `PointID` 归组，控制普通 Lv. 滑块；没有 progression 的 Variant 在 `SkillCardPanel` 中默认显示第一条等级记录。由此可知，即便分类器识别了 29 系列，直接使用现有卡片仍只显示 Level 1，无法选择阿哈 E2。伪造 progression 虽可出现滑块，却会把外部条件误呈现为普通技能升级，并受玩家技能树模式约束。

| SkillID | `ExtraEffectIDList` 与 `SimpleExtraEffectIDList`，两个等级一致 |
| --- | --- |
| `150129` | `10015111,10015113,10015112` |
| `150229` | `10015111,10015112` |
| `150329` | `10015111,10015113,10000000,10000029,10000027` |
| `150529` | `10015111,10015113,10000028,10000029` |
| `150629` | `10015111,10015113` |
| `151129` | `10015111,10000027,10000029,10015112,10015113` |
| `151329` | `10015111,10015112` |
| `800929`、`801029` | `10015111,10015113,10000017` |

新增术语由 `ExtraEffectConfig` 提供：`10015111` 为「欢愉」命途升格，`10015112` 为爽点，`10015113` 为绝活共赏，`10015114` 为欢愉负债。后者由 `151131` 引用。上述外键均存在，可复用 `projectExtraEffects` 与 `SkillExtraEffects`。

**事实：** 两等级的战斗元数据字段相同，符合 `scripts/data/skills.ts::buildSkillVariant` 要求的 Variant 级不变性。`800929`、`801029` 还带 `SPBase=5`，现有 `normalizeSkillCombatMeta` 会投影为 `energyGain=5`；其他 29 技能的该字段未提供。应保留可验证的原始元数据，但不要把这个值解释为一次可主动施放升格技能的操作。

### 3.4 阿哈正传的独立节点问题

`AvatarSpecialSkillTree` 明确给出 `AvatarID=1511`、`AnchorType=Point23`、`ShowSkill=151131`。`AvatarSkillTreeConfig.PointID=1511601` 同时具备：

```json
{"PointType":6,"AnchorType":"Point23","MaxLevel":1,"DefaultUnlock":true,"PrePoint":[],"MaterialList":[],"LevelUpSkillID":[151131],"PointTriggerKey":"PointAeonPower"}
```

该节点有 `PointName`、`PointDesc`、3 项参数和 `ExtraEffectIDList=[10015114]`。当前 `buildProfile` 的普通行迹仅保留 PointType 1、3、5，因此不会把它放入 `traces`；但会把其技能关联作为 progression 信息，并通过 `AvatarSpecialSkillTree` 确保 ShowSkill 可见。

`scripts/data/domain/training.ts::buildTrainingDomain` 构建所有真实树节点，`resolveTrainingSkillTree` 要求节点匹配静态布局。`data/skill-tree-layouts/elation.json` 不含 `Point23`，只读调用实际得到：

```text
[training/tree] 1511:0 (Elation): PointID 1511601: unmapped AnchorType Point23
```

**建议：** 将 `SkillAeon` 归入 talent，继续在 talent 卡内展示正常天赋、阿哈正传和仓库技；阿哈正传保持自身单等级，不与正常天赋共享升级 progression。对 PointType 6 明确采用“默认解锁的额外能力”策略，并在树布局解析之前做有依据的展示分类。不要把共享欢愉树模板强制加 Point23 后要求其他八个角色填满，也不要对所有未知锚点静默忽略。是否把这个免费节点绘制到养成树上留待产品确认，不应与无树关联的 29 系列混为一谈。

### 3.5 `series_ref_skill_desc` 与 GameText

来源链：`AvatarRankConfig.RankID=151102` → `Desc=AvatarRankDesc_151102` → TextResolver 使用 XXHash64 解出 `7518821223469069166` → CHS / EN TextMap。CHS 内容为：

```text
使<u>「欢愉」命途升格</u>效果获得加强：\n#{series_ref_skill_desc:UIText_SeriesSkillDescFormat,151129,2}
```

EN 同样包含这一宏。`Param=[]`，宏中的 `2` 不是 `#2` 数值占位符，而是目标 SeriesSkill 等级。`UIText_SeriesSkillDescFormat` 通过现有 symbolic resolver 可解析，hash 为 `9670052225496736211`，CHS 模板为 `• #1：#2`，EN 为 `• #1: #2`。

**事实：** `scripts/data/localization.ts::createTextResolver` 的 `projectGameText` 与 `scripts/data/text.ts::formatDescription` 只完成现有文本替换、数值占位符和富文本处理。`src/lib/domain/game-text.ts` 也没有跨技能查询能力。直接调用 resolver 后，结果为 `available`，`diagnostics=[]`，返回的普通文本和 token 都保留原始宏。

**判断：** 如果先修复分类使阿哈完整通过 Projection，但不处理该宏，普通 E2 卡片就会泄漏原始配置语法。不能只检查 29 系列正文是否能解析，也不能把 resolver 的 `available` 等同于所有宏已展开。

**建议：** 在构建时引入有限的结构化跨技能引用解析，分开处理外层格式模板与被引用技能自己的参数。先解析 SeriesSkill 根技能和目标等级，再按明确关系获取名称、正文，最终走同一套 GameText token 投影；不要让 Svelte 查询原始配置或 TextMap。宏中 `#1`、`#2` 是字符串插入位置，不能交给现有只接收数值的参数插值器。

**待确认：** 根技能 `151129` 自带 9 个关联角色，外层模板也具备名称与描述两个插入位，支持宏可能展开关联技能列表的判断；当前仓库没有游戏端宏求值实现，不能宣称已证实仅展开自身一项，或已证实展开全部 9 项。下一轮实现前应固定这条语义；阿哈汇总面板可直接按已验证的关联列表生成，不依赖对宏行为的猜测。

### 3.6 其他文本格式检查

对 29 系列两等级、`151104`、`151131`、三条奇缘星魂及它们引用的 ExtraEffects，共 96 个名称或描述来源逐一调用现有 TextResolver；CHS 和 EN 各 96 项均为 available，无参数诊断、无残余花括号宏。该集合中富文本只有 `<color>`、`<u>`、`<unbreak>` 及对应闭合标签，现有解析器支持。

上述 96 项不包括单独验证的阿哈 E2 描述；因此这项通过结果与 3.5 的宏缺口并不矛盾。也不表示已经审计 4.7 所有角色全部文案。

## 4. 奇缘星魂调查

### 4.1 三条记录与独立身份

来源：`../TurnBasedGameData/ExcelOutput/AvatarExRankConfig.json`。当前顶层数组有 3 条记录，没有等级列，也没有普通星魂的 `Rank` 列。

| ExRankID | AvatarID | 名称，CHS / EN | 参数列表 | ExtraEffects |
| --- | --- | --- | --- | --- |
| `120401` | `1204` 景元 | 万钧入盏，风静灯明 / One Quiet Cup of Thunder | `[1,2.4,6,12,4,20]` | 空数组 |
| `121301` | `1213` 丹恒•饮月 | 沧溟间，月落潮平 / Moonset Stills the Deep | `[5,5,1,2.4,1,3]` | `[10000004]` |
| `130801` | `1308` 黄泉 | 虚隙一顾…枯骨眠霜 / A Glance Through Rime to Bone | `[3,1,1,0.8]` | `[10000004]` |

这三个 ID 分别与 `AvatarRankConfig` 中同角色普通 E1 的 `RankID` 重合，也与该角色部分技能 ID 存在跨表数值重合。它们是不同表的实体，不是同一个效果。普通 `AvatarConfig.MaxRank` 仍为 6，`RankIDList` 仍引用六个普通星魂，不能把 ExRank 拼到它后面当作 E7。

### 4.2 混淆字段映射

置信度“高”表示存在 TextMap 结果、外键或独立具名字段等交叉证据；“中”表示资源路径或上下文可证明用途类别，但未证明原始字段名称；“低”表示无法建立可靠语义。推荐语义名是报告中的规范化建议，不声称还原了被混淆前的准确字段拼写。

| 混淆字段 | 推断含义 / 推荐语义名 | 对应依据 | 置信度 |
| --- | --- | --- | --- |
| `PHFMCACHFIJ` | 奇缘星魂 ID / `exRankId` | 与 `AvatarExRankName_*`、`AvatarExRankDesc_*` 后缀一致；`AvatarSkillConfig.RelatedExRankIDList` 精确引用三项；`GridFightBackRoleExRank.ExRankID=120401` 的 Comment 明示来自 AvatarExRankConfig | 高 |
| `ACCJKGEKHKP` | 所属角色 / `avatarId` | 三个值均有对应 `AvatarConfig`；名称、图标目录、Ability 名和激活材料同时指向相同角色 | 高 |
| `OIBKPJEGPOK` | 战斗激活触发键 / `triggerKey` | 三行均为 `{Hash:1475409642}`；具名的 `GridFightBackRoleExRank.TriggerKey` 相同；对应 Ability 中 `ByRankActivated.TriggerKey` 也使用该值；不是 TextMap 文本 hash | 高 |
| `OENAMINOLLF` | 名称 / `nameSource` | symbolic key `AvatarExRankName_{ID}` 经现有 resolver 得到三项正确中英文名称 | 高 |
| `NMAHGFAPENI` | 描述 / `descriptionSource` | symbolic key `AvatarExRankDesc_{ID}` 解析正文，配合参数列表可无诊断插值 | 高 |
| `AGOHEFBOPNO` | 效果分类文本 / `effectTypeSource` | 景元值 `15983939177738998168` 对应“强化 / Enhance”；另外两项 `9868503137584243444` 对应“群攻 / AoE”，与正文行为相符；未证明原名是 SkillTag 或 SkillTypeDesc | 高（文本语义） |
| `BDECHFIJBFA` | ExtraEffects ID 列表 / `extraEffectIds` | 丹恒与黄泉为 `[10000004]`，精确关联 ExtraEffectConfig 的“追加攻击 / Follow-Up ATK”，其正文同样使用该术语；景元为空 | 高 |
| `OLOIFNNLKJP` | 技能式图标路径 / `iconPath` | `SpriteOutput/SkillIcons/Avatar/{AvatarID}/SkillIcon_{AvatarID}_ExRank01.png`；景元与 `GridFightBackRoleExRank.IconPath` 完全一致 | 高 |
| `AIAFHMFPFMN` | 星魂 3D 面板使用的纹理路径 / `rankTexturePath` | 路径为 `UI/UI3D/Rank/_dependencies/Textures/{AvatarID}/{AvatarID}_ExRank_1.png`；能证明纹理资源类别，未核实游戏端加载过程 | 中 |
| `DPPHHNMHPAK` | 奇缘星魂 3D 面板 prefab / `panelPrefabPath` | `UI/Avatar/Rank/DLC/AvatarSpRank3DPanel_{AvatarID}.prefab`，与普通说明文本、技能图标属于不同资源 | 高（资源类别） |
| `NNFEGHLLEPH` | 激活后注入的战斗 Ability 名称列表 / `rankAbilities` | 三个 `Avatar_*_00_ExRank01` 均为对应 ConfigAbility 文件的实际 Ability Name；具名 GridFight 记录也使用 `RankAbility` 列表 | 高 |
| `NNACKOBKFGE` | 描述及战斗参数 / `params` | `{Value}` 数组与描述 `#n` 对应；景元 Character Config 的 `ReadInfo.Type=SkillRank, TriggerKey=ExRank01, Index=0..5` 提供独立参数读取证据 | 高 |
| `NJNDLOFDBHB` | 未确认的可选数值 | 仅丹恒、黄泉存在，值均为 `10`，景元缺省；没有独立具名字段或确定引用。不能据此认定为削韧、能量、等级或普通星魂要求 | 低，保留未知 |
| `ODEKADIBFAO` | 说明视频 ID / `guideVideoId` | 值 `15010/15011/15009` 分别关联 `GuideVideoConfig.VideoID`，路径依次为 `Activity_ExRank_1204.usm`、`Activity_ExRank_1213.usm`、`Activity_ExRank_1308.usm` | 高 |
| `PKBNJLOLPBM` | 激活材料成本 / `unlockCost` | `{ItemID,ItemNum}` 单对象；ItemID 为 `131204/131213/131308`，ItemConfig 的 ItemSubType 均为 `AvatarExRankMaterial`，描述明示用于相应角色激活奇缘星魂，数量均为 1 | 高 |

`OIBKPJEGPOK.Hash=1475409642` 在 CHS、EN TextMap 中均无文本项，这与它作为战斗触发键的证据一致。不要仅因属性名叫 `Hash` 就把它作为本地化内容读取。

### 4.3 名称、参数与描述结果

`scripts/data/domain/shared.ts::textSource` 已支持 symbolic key，`parameterized` 已支持 `{Value}` 参数包装；`scripts/data/raw.ts::parseRawJson` 保留文本 hash 和数值包装的十进制拼写。现有 `createTextResolver` 对 ExRank 的 3 个名称及 3 个描述在两种语言下均成功，参数诊断为空。

可复核的插值例子：景元 `2.4` 显示为伤害提高 `240%`，`6/12` 显示为战技 / 终结技额外神君段数；丹恒•饮月第二项 `5` 以 `500%` 攻击力显示；黄泉 `3` 与 `0.8` 以 `300%`、`80%` 显示。丹恒•饮月参数索引 5 在当前描述模板中未使用，不应因为没有显示占位符就删除这个参数；运行时 Ability 可有不同使用方式。

`AGOHEFBOPNO` 提供的效果类别可以保留作可选元数据，但当前普通 `EidolonCard` 没有效果分类标签入口。用户要求的名称、描述和 ExtraEffects 不依赖新增这一标签，也不依赖视频、3D prefab 或插画。

### 4.4 额外技能、效果引用与激活关系

`AvatarSkillConfig.RelatedExRankIDList` 的全部非空关联为：

| 现有技能 | 关联 ExRankID | 当前数据层处理 |
| --- | --- | --- |
| `120404` 景元天赋，各等级 | `[120401]` | `buildSkillVariant` 不读取，关系丢失 |
| `121304` 丹恒•饮月天赋，各等级 | `[121301]` | 同上 |
| `130804` 黄泉天赋，各等级 | `[130801]` | 同上 |

这些是对奇缘星魂的引用，不是普通星魂的 `SkillAddLevelList`，也不是要求额外创建一个可升级技能 Variant。`NNFEGHLLEPH` 指向 `Config/ConfigAbility/Avatar/Avatar_JingYuan_00_Ability.json`、`Avatar_DanHengIL_00_Ability.json`、`Avatar_Acheron_00_Ability.json` 中的真实战斗 Ability。例如景元对应 Ability 会添加强化 Modifier 并插入后续 Ability；黄泉、丹恒•饮月对应追加攻击链也存在。

**事实：** 激活材料是独立的 `AvatarExRankMaterial`，与普通星魂 `UnlockCost` 使用的角色星魂材料不同；触发键也独立于普通 Rank。配置里没有显式的 `UnlockCondition`、前置普通 Rank 或 E6 条件。现有证据足以证明应独立建模，但不足以证明游戏全部激活前提只有消耗该材料。

**建议：** 文档站展示奇缘星魂说明时无需实现战斗 Ability 执行器、视频播放或材料获取系统；保留经验证的 ID 和关系即可。当前玩家 API 的普通 rank 不能推导奇缘星魂是否激活，应显示说明而不假造“已激活”状态。

### 4.5 图标与资源约束

`EidolonCard` 经 `getCharacterDetailIconUrl` 和 `AssetImage` 已支持缺图 fallback。`scripts/assets/shared.ts::planCharacterDetailIcons` 将无来源的图标记为 missing，正常缺图不会自动阻断构建。

但图标身份不能直接复用 `rank--120401`：该 key 已指向普通 E1，`readCharacterDetailIconSources` 按 `StarRailRes/index_new/cn/character_ranks.json` 查询同 ID，会取得普通星魂图标。即使游戏配置提供了不同 ExRank 路径，现有 resolver 也不会直接用该路径覆盖索引。

**建议：** 首版不登记奇缘星魂的 `iconKey`，让已有 fallback 生效，同时在 Neutral 保留已知图标路径供后续资源工作使用。以后接入真实资源时再引入独立身份 / 来源策略，不能因 ID 相同误用 E1 图标。本轮没有下载、复制、补绘或生成资源，也不把本地资源情况当作未来 StarRailRes 一定缺图的结论。专属插画、纹理和 3D 面板不进入首版实现依赖。

## 5. 现有管线兼容性矩阵

### 5.1 按机制检查

| 机制 | 原始读取 | Neutral 转换 | Projection / 页面数据 | Svelte UI / 养成 | 当前失败或遗漏 |
| --- | --- | --- | --- | --- | --- |
| 阿哈普通技能 | 已读取 AvatarConfig、SkillConfig、树配置 | 既有字段足够 | 隔离验证通过 zh-CN / en | 现有卡片可复用 | 完整构建被新技能先行阻断，不可宣称整角色已支持 |
| 仓库技 | 已读取 AvatarGlobalBuffConfig | 合成 avatar-global-buff Variant | 隔离验证通过 | 既有专属标记、ExtraEffects 可用 | 游戏模式限制未投影，属既有展示边界 |
| 阿哈正传 `151131` | SkillList 与 SpecialSkillTree 均可带入 | SkillAeon 分类失败；PointType 6 不进入普通 traces | 未能进入完整 Projection | 卡内多 Variant 可复用；Point23 养成树另行报错 | 构建硬失败 |
| 29 系列正文 | 已在 SkillList / SkillConfig 中 | SkillAha 分类失败 | 目前无可生成卡片；仅改分类也缺少外部状态 | 无 progression 时固定第一等级；普通滑块语义不适用 | 构建硬失败 |
| SeriesSkill 解锁条件与关联列表 | 两个入口均未加载新表 | 无条件、SeriesSkill 关系类型 | 无外部条件标签和汇总目标 | 无阿哈 E0 / E2 状态控件 | 关系完全遗漏 |
| 阿哈汇总面板 | 既有 SkillLink / ServantSkillLink 无本组关系 | 当前两种 relation 不适配 SeriesSkill | 仅查询 owner profile.skills，不能拿到其他八个角色的技能 | Dialog 内容可复用，状态 Badge 和跳转需扩展 | 无数据与入口 |
| 奇缘星魂 | 新表未加载 | 只沿 RankIDList 读取普通 RankConfig | 无独立集合，RelatedExRankIDList 被丢弃 | 卡片内容可复用；编号 / 玩家激活逻辑需区分 | 静默遗漏，若强合并还会 ID 冲突 |
| 普通数值 / 富文本 / ExtraEffects | 相关 TextMap 与效果表已读取 | 已有 textSource、params、extraEffectIds | 96 项双语文本检查通过 | GameText、DescriptionText、SkillExtraEffects 可用 | 无需新建通用文本渲染器 |
| 阿哈 E2 跨技能宏 | 普通 Rank Desc 可读 | 仅保留普通文本来源 | 原宏返回 available，无诊断 | 最终会当普通文本显示 | 可见宏泄漏，非正常缺文 fallback |
| 奇缘星魂资源 | 游戏图标路径可调查，当前资产入口无独立身份 | 当前只存在普通 rank icon key 约定 | 不应生成碰撞 key | 缺图 fallback 已支持 | 需要防止误取普通 E1 图标，无需等待新资源 |

### 5.2 必须关注的代码位置

| 子系统 | 已核实的代码与函数 | 下一轮需要考虑的改动 |
| --- | --- | --- |
| 原始源清单 | `scripts/data/source-requirements.ts::DATA_GENERATION_TABLE_NAMES`、`TURN_BASED_DEPLOYMENT_TABLE_NAMES`；`scripts/data/character-sources.ts::characterDomainTableNames`、`loadCharacterDomainTables` | 同步纳入两个新表；部署物化清单和独立角色加载器都覆盖 |
| 同步数据入口 | `scripts/data/sync.ts` 中 `characterDomainSource=tableSubset(...)`、`buildCharacterDomain`、`extraEffectsById` / 引用集合 | 仅更新加载清单不够，传入 Domain 的子集、ExtraEffects 覆盖及诊断也要扩展 |
| Neutral | `src/lib/domain/neutral.ts::NeutralSkillVariant`、`NeutralCharacterProfile`、`NeutralEidolon`、`NeutralSpecialEffectRelation` | 新增外部条件 / SeriesSkill、独立 ExRank 与跨角色关系，保留来源 |
| 分类与卡片 | `scripts/data/skills.ts::classifyAvatarSkill`、`classifyProductSkill`、`buildSkillCards`、`buildSkillVariant` | 结构化识别 SkillAha、SkillAeon；新增类别须更新 categoryOrder，否则 Map 中的数据不会被输出 |
| Domain 构造 | `scripts/data/domain/character.ts::buildSkillVariant`、`buildProfile`、`buildCharacterDomain` | 按新表关联接入条件、独立星魂和跨角色索引，不只沿 RankIDList 构建 |
| 投影与标签 | `scripts/data/projection/character.ts::projectSkillVariant`、`projectProfile`、`projectCharacterView`；`scripts/data/projection/shared.ts::projectLevels`；`scripts/data/projection/policy.ts` | 外部状态、独立星魂、跨角色技能来源和双语类别名称；可复用数值差异高亮，但不能把差异解释为养成升级 |
| 页面 View Model | `src/lib/domain/types.ts::SkillCategory`、`SkillCard`、`SkillProgression`、`CharacterProfile`、`CharacterSpecialEffectEntry` | 增加明确的新语义；已有字段不足以表达全部条件 |
| 文本解析 | `scripts/data/localization.ts::createTextResolver`；`scripts/data/text.ts::formatDescription`；`src/lib/domain/game-text.ts` | 构建时解析有限跨技能宏，并为未解决引用增加诊断；浏览器保持安全渲染 |
| 技能 UI | `SkillCardPanel.svelte`、`SkillVariantView.svelte`、`DetailPage.svelte` | 新类别保留一张卡；增加独立外部状态控件，复用正文与 ExtraEffects |
| 星魂 UI | `EidolonCard.svelte`、`DetailPage.svelte`、`src/lib/player/character.ts::resolvePlayerEidolonState` | 奇缘类型 Badge 和独立列表，不使用普通 rank 数值计算激活状态 |
| 特殊效果 UI | `SpecialEffectDialog.svelte`、`SpecialEffectRelation.svelte`、`src/lib/domain/special-effects-presentation.ts` | 独立的 SeriesSkill 条目分支、条件状态标题、真实链接与目标名称解析 |
| 页面目标加载 | `src/routes/[category=category]/[id]/+page.server.ts::resolveSpecialEffectTargets` | 当前只有 servant 单目标和 avatar 目标列表分支，必须显式支持新 relation |
| 特殊效果入口 | `scripts/data/special-effect-triggers.ts::annotateSpecialEffectTokens`、`annotateSpecialEffectCards` | 现有入口基于已审查的图标，阿哈升格文本没有对应图标触发，不能期待自动出现可点击入口 |
| 养成与布局 | `scripts/data/domain/training.ts::buildTrainingDomain`；`src/lib/domain/training/skill-tree.ts::resolveTrainingSkillTree`；`src/lib/domain/training/detail-view.ts::createTrainingSkillTargets` | 单独解决免费 PointType 6，保持 29 系列无升级费用，不伪造节点 |
| 资产 | `scripts/assets/shared.ts::readCharacterDetailIconSources`、`planCharacterDetailIcons` 与需求收集；`src/lib/components/shared/AssetImage.svelte` | 首版缺图 fallback 足够；独立集合应纳入需求遍历，避免未来资源接入时漏项 |
| 验证和缓存 | `scripts/data/validate.ts::validateCharacterProfile`、`profileIds`；`scripts/data/validation/full.ts` 及被调用的语义校验；manifest / 生成输入版本约定 | 新分支、独立身份、外键、结构一致性和源码语义验证；按现行机制使旧产物失效，不把单纯 TS 编译通过当作数据覆盖 |

上表组件的完整路径位于 `src/lib/components/character/`；`DetailPage.svelte` 位于 `src/lib/components/shared/`。报告没有修改上述文件。

## 6. 建议的实现方案

### 6.1 数据层：关联驱动，保留语义边界

1. 同步补齐加载清单、部署所需文件清单和 sync 的 Domain 子集，增加针对当前配置的外键 / 重复关系诊断。继续使用 `parseRawJson`，文本 hash 保持十进制字符串；symbolic key 通过共享 resolver 解析。
2. 由 `AvatarSeriesSkill` 构建 `(AvatarID, SkillID)` 分组和 `(SkillID, Level)` 索引，把外部角色 ID、条件种类、阈值、SpecialTag 文本来源和关联目标保存在 Neutral。SkillAha 可作为结构化分类证据，SeriesSkill 是条件与归属的权威关系；二者不一致时给出诊断，不用 ID 后缀补数据。
3. 新增命途升格类别，例如 `elation-ascension`，更新 `SkillCategory`、排序与双语标签投影。技能来源仍是 AvatarSkillConfig，是否新增 source 字面值不是接入新类别的必要条件。类别名称优先解析 ExtraEffectConfig `10015111.ExtraEffectName`，其 hash `4115819549525708429` 在 CHS / EN 分别为「欢愉」命途升格 / `"Elation" Path Ascension`。不要使用泛化的“固有行迹”或只在 Level 2 存在的 SpecialTag 作为统一标题。
4. 保持普通 `SkillProgression` 表达真实技能树升级。SeriesSkill 的可选状态另存为外部条件选择元数据，仍可用已验证的两级描述承载内容，但 `progressionId` 为空、普通 `progressions` 为空。状态选择不能写入训练目标或从当前角色的玩家 rank / skillTree 反推。
5. 增加独立 `exEidolons` 集合及明确 ExRank 类型，保存 ID、角色 ID、名称、带参数描述、ExtraEffects 和已验证引用。普通 `eidolons`、MaxRank、RankIDList 保持六星魂语义；相关技能可选保存 `relatedExRankIds` 供可追溯关联使用。不把低置信字段用于数值计算。
6. 对阿哈汇总增加不同于既有 SkillLink 的 relation / entry，例如 `series-skill-link`。构建时从根记录的目标列表出发，查对应角色的 SeriesSkill 和原始 SkillConfig，并为每条记录保存 owner、目标、根 SkillID、目标 SkillID、等级与顺序。投影上下文需要跨角色的有限索引，不能只查询当前 `profile.skills`。

上述名字是建议的接口形状，不是已发布 API。下一轮选择具体类型时，保留“条件级选择独立于升级 progression”“ExRank 独立于普通 Rank”“SeriesSkill 独立于既有 SkillLink”三项边界即可。

### 6.2 特殊效果模型比较与面板复用

| 维度 | `AvatarSkillLink` | `AvatarServantSkillLink` | `AvatarSeriesSkill` |
| --- | --- | --- | --- |
| 关键字段 | `SkillID`、`LinkToAvatarIDList`、`LinkToAvatarIDSimplifiedList` | `SkillID`、`LinkToAvatarID`、`Order`、Tarot 路径 | `SkillID`、`Level`、`AvatarID`、`UnlockCondition`、`RelateAvatarIDList` |
| 关系形态 | 一项 owner 技能关联多个角色 | 一项忆灵技能关联一个角色及顺序 | owner 的升格技能按外部条件分级；根记录另关联其他角色 |
| 条件 / 等级 | 没有独立外部角色条件 | 没有独立外部角色条件 | 每个 Level 有明确外部条件 |
| 内容获取 | 当前实现从 owner profile 找技能 | 当前实现从 owner profile 找技能 | 汇总需要查询目标角色各自的技能 |
| 现有图像要求 | 无 Tarot 必填项 | 规范化器要求 Tarot 路径 | 没有 Tarot 字段，不应补造 |
| 可直接套用现有结构 | 不能保留全部 SeriesSkill 语义 | 不能，且字段要求不符 | 应新增明确分支 |

`normalizeSpecialEffectLinks` 目前按 SkillID 或 SkillID + 目标去重；若把 SeriesSkill 的两个等级直接送进去，还会失去 Level 维度或形成冲突。配置中这 9 个 SeriesSkill 没有对应的 `AvatarSkillLink`、`AvatarServantSkillLink` 记录，不能假定已有关系会自动生成汇总。

`projectProfile` 对特殊效果先查 `profile.skills.find(skill.id===relation.skillId)`，找不到就返回空数组。即使手工制造现有 relation，在阿哈 profile 里也拿不到其他八个角色的正文。这是数据投影缺口，不能只改 UI。

可复用 Dialog 的模态、滚动、关闭、导航关闭和焦点恢复；复用 `SkillVariantView`、`DescriptionText`、`SkillExtraEffects` 渲染内容。应把标题旁固定 `Lv.{selectedLevel}` 改为可区分普通等级 / 外部条件的呈现，防止阿哈 E2 被显示成当前角色 Lv.2。

当前 `SpecialEffectRelation` 使用 `div` / `span`，不是跳转组件。新面板需要目标角色的本地化 href，继续通过 `src/lib/i18n/routing.ts` 生成带语言前缀和尾斜线的链接；不要把头像看起来可点等同于已有跳转能力。目标保持源 ID，阿哈自己也包含在列表，两个开拓者变体暂不合并。

### 6.3 技能卡片与独立状态

新增类别可以继续进入 `DetailPage` 的技能卡循环，满足每个语义类别一张卡的约束。扩展 `SkillCardPanel` 的控件区域，使状态选择使用已有 UI 体系中的 Segmented / ToggleGroup / Select 能力；最终组件选择按仓库现有组件能力决定，不要求新增第三方依赖。

控件显式标注“阿哈 E0 / 阿哈 E2”，默认 E0；描述同时交代依赖外部角色阿哈。它是浏览效果预览，不根据当前角色普通星魂自动解锁或禁用，也不写入真实玩家 API 的技能树。若阿哈自身详情页有完整玩家 ExRank / 外部条件数据，自动选中仍应作为后续独立需求确认。

`SkillVariantView` 已按 `selectedLevel` 取正文，可继续复用；此处传入的 1 / 2 是存储层等级索引，用户看到的是外部状态标签。普通技能卡、普通 Lv.滑块、养成 previewLevels 与该状态各自维护。

阿哈汇总 Dialog 建议与打开它的升格卡共享同一个外部状态选择，让面板内全部目标使用相同 Level。`DetailPage` 当前只有 `specialEffectLevel`，应改为明确区分上下文的选择状态，避免开普通特殊效果时继承阿哈的状态，或反过来继承普通技能 Lv.10。

`annotateSpecialEffectTokens` 当前只允许已审查的 `AvatarCyrene` 和 `AvatarHimekoNova` 图标来源，并且 `segmentSpecialEffectTriggers` 依赖 icon token。阿哈升格描述中的红色下划线没有对应 icon，建议先在卡片提供明确的“查看相关角色效果”按钮，不按中文词句匹配文本制造点击区域。

### 6.4 奇缘星魂卡片

在原星魂 Section 中，先保留现有普通六星魂，再渲染独立奇缘卡片，循环 key 使用种类 + ID。扩展 `EidolonCard` 接受可区分的普通 / 奇缘数据，或复用其内部内容模板；不要以 `rank=7`、`rank=0`、负 rank 或假编号伪装奇缘星魂。

奇缘 Badge 显示 TextMap 名称“奇缘星魂”，可用 hash `5057575626871868393` 或 `17432769083266920987`，两者在当前中英文均存在；首选固定一个经过审查的来源并保留来源记录。Badge 使用传入的 `characterAccent`。名称、正文和 ExtraEffects 继续按原方式显示。

普通 `resolvePlayerEidolonState` 只比较 `eidolon.rank <= playerRank`，不适用于奇缘。首版奇缘卡不显示基于普通 rank 推导的 active / inactive 状态；缺图继续使用已有 fallback。新增图像、视频和 3D 展示不属于本轮或首版依赖。

### 6.5 i18n、产物及验证边界

游戏名称、技能效果、类别名和奇缘名称继续来自同版本的 CHS / EN TextMap。外部状态说明、面板按钮、无障碍标签等站点自有文案放入成对 Paraglide 消息；不要在组件内访问全量 TextMap，也不要做中英跨语言 fallback。

新集合及新关系应进入角色生成产物、页面目标加载、结构一致性验证、ExtraEffects 引用覆盖和缓存失效机制。验证逻辑中现有 `else` 常默认第二种 relation 是 servant，新增联合分支后必须改为显式处理；否则容易误要求 Tarot 字段或读取错误的 linkedAvatarId。

网站锁更新是后续实施的显式任务，应与新入口、完整 4.7 生成验证和既有版本相关基线一起完成，不能在调查阶段只改锁掩盖失败。当前 manifest 版本号只是快照事实，下一轮应按仓库现行生成版本机制确定变更，不在报告里预分配新的版本数字。

## 7. 风险与待确认问题

| 事项 | 已知事实 | 尚未确认或需要决定的内容 | 对后续实施的影响 |
| --- | --- | --- | --- |
| 宏展开范围 | 151102 引用根技能 151129 的 Level 2；根列表包含 9 个角色，模板有名称 / 描述两处插入位 | 原游戏宏是否递归展开全部关联目标、是否合并开拓者、用何名称 | 宏完整展开前需要确认，不能任意只取自身正文；未解决时应诊断并安全降级，不能泄漏宏 |
| 奇缘未知数值 | `NJNDLOFDBHB=10` 只在两条追加攻击记录存在 | 原始字段语义 | 不影响说明卡首版，保留未知，不参与养成或战斗数值 |
| 奇缘激活前提 | 三种材料及数量、独立 TriggerKey 已有证据 | 是否另有账号、角色等级、任务、普通星魂前置限制 | 不依据缺少字段断言“无其他前提”，不展示未经证明的激活状态 |
| Point23 展示 | 免费、默认解锁、PointType 6，且 SpecialSkillTree 显式关联 | 是否在网站技能树上绘制，以及布局 | 构建必须先有明确分类策略；可先作为独立免费能力处理，但不能默默删除全部未知节点 |
| 29 技能与技能树 | 当前全部无 LevelUpSkillID / ShowSkill 关联 | 产品以后是否希望可视化关联 | 首版不接树、不计费用；未来关联不改变外部条件语义 |
| 阿哈正传分类 | 现有多 Variant 容器可用，SkillAeon 尚未识别 | talent 归类是报告建议，原配置另标为 SkillAeon | 用结构化触发键完成映射，保留源字段，不重写为 SkillP01 |
| 汇总目标展示 | 源列表含阿哈自己及 8009、8010 | 两性别开拓者是否合并为一个可切换条目 | 首版保留 9 项源关系；合并仅限展示并保留可追溯身份 |
| 图标资源 | 原始配置有图标路径，既有 rank key 会与 E1 相撞，fallback 可用 | StarRailRes 后续是否提供对应文件与索引 | 不阻塞首版；人工确认后再决定接图或取消图标区域 |
| 4.7 全站构建 | 角色 Domain 与养成树已证实有阻断；网站锁仍为 4.6 | 其他 4.7 子系统是否存在独立上游变更 | 本报告不宣称全站构建通过；后续迁移需执行针对生成链的完整验证 |

本轮没有浏览器交互验证，也没有执行生产构建、`data:sync`、`data:ensure` 或会更新生成产物的完整检查。UI 兼容性结论来自源码和数据结构比较，不是视觉验收结果。

## 8. Codex 后续实施任务清单

### 8.1 按依赖推进

| 优先级 / 任务 | 依赖 | 实施内容 | 完成判据 |
| --- | --- | --- | --- |
| P0-A 原始入口与结构化关联 | 无 | 补齐新表加载、部署物化、sync 子集，建立 SeriesSkill / ExRank 映射与外键检查 | 实际 4.7 的 18 条、3 条记录都进入 Neutral；无 ID 后缀推导；普通 Rank 与 ExRank 身份分离 |
| P0-B 角色分类阻断 | P0-A 的关系约定 | 支持 SkillAha 新类别、SkillAeon talent Variant，更新类别排序与标签；保留可见未知分类的失败机制 | 完整 buildCharacterDomain 不再被两触发键阻断；同类 Variant 各自保留 progression 和来源 |
| P0-C 特殊免费节点 | 与 P0-B 协调 | 给 PointType 6 / Point23 明确展示和养成策略，不要求其他欢愉角色增加槽位 | 阿哈树解析通过；默认能力不产生付费目标；其他角色树不回归 |
| P0-D 跨技能文本宏 | P0-A，先确认 7 节宏语义 | 按实际引用链解析模板、SeriesSkill 和技能参数；增加未解决宏诊断及循环 / 缺失保护 | 阿哈 E2 的中英文产物没有原始宏，内容与确定的展开范围一致 |
| P1-A Projection 与 View Model | P0-A、P0-B | 外部条件选择、独立 exEidolons、SeriesSkill 汇总 entry、跨角色有限索引、ExtraEffects 引用覆盖 | 9 个角色均有新卡，3 个角色有独立奇缘卡；两语言结构一致且没有全量原始数据进入浏览器 |
| P1-B 技能卡与阿哈汇总 | P1-A、P0-D 的文本方案 | E0 / E2 控件、显式汇总按钮、Dialog 条件标签和角色跳转 | 默认 E0；切换后正文 / 高亮 / 面板一致；普通 Lv.、玩家技能树及费用不受影响 |
| P1-C 奇缘卡 | P1-A | 复用 EidolonCard 内容，类型 Badge、属性颜色、ExtraEffects、缺图 fallback | 普通六星魂不变；不显示 E7；不误用 E1 图标；不根据普通 rank 假造奇缘激活状态 |
| P1-D 版本迁移与数据验收 | P0、P1 数据实现完成 | 按现行流程更新固定来源和相关版本基线，检查缓存 / manifest / 原始语义验证 | 固定构建来源与 4.7 一致，完整生成和针对性验证通过；无绕过分类 / 树 / 本地化校验 |
| P2 资源与展示精修 | 首版已可用，人工确认资源 | 确认 StarRailRes 奇缘图标；如有则实现独立身份，如无再决定取消图标；另定开拓者合并与 Point23 绘制 | 无资源仍可正常展示；不把插画、视频或 3D 面板作为上线前提 |

### 8.2 下一轮应覆盖的验证场景

- 数据：按真实关系覆盖 9 个角色和两个条件等级，检查重复 / 缺失 / 无效目标，证明阿哈关联列表完整且源顺序保留；新增样本不依赖 ID 后缀。
- 分类：151104、151131 和仓库技同属 talent 卡但保留独立进度；SkillAha 独立卡；未知可见技能继续失败，不能靠隐藏数据取得构建成功。
- 文本：中英文名称、参数百分比、ExtraEffects、阿哈 E2 宏及缺失引用诊断；测试引用语义和结构，避免锁死可变的站点文案。
- 养成：29 技能的 E0 / E2 切换不创建材料费用；Point23 为免费默认能力；其他欢愉角色不要求 Point23；普通技能预览和付费目标仍独立。
- 星魂：同数值普通 / 奇缘 ID 可共存；普通 E1 图标不会被复用；丹恒•饮月和黄泉展示追加攻击 ExtraEffect；缺图正常 fallback。
- UI：卡片与 Dialog 状态一致、角色链接支持中英文路由、关闭及导航后焦点处理正确；玩家模式不根据当前角色技能树或普通 rank 锁定外部状态。

### 8.3 本轮执行证据与复核方法

本轮使用内联 Python 与 `node --import tsx --input-type=module` 进行只读分析，没有保存临时业务脚本，没有为报告新增测试。验证结果如下：

| 核验 | 调用或来源 | 结果 |
| --- | --- | --- |
| 当前完整 4.7 角色 Domain | `loadCharacterDomainTables('../TurnBasedGameData')` → `buildCharacterDomain` | 在 150129 / SkillAha 失败，未宣称整体通过 |
| 阿哈单角色 Domain | 以 AvatarID 1511 的进程内子集调用同一构造器 | 在 151129 / SkillAha 失败 |
| 两种新触发键分别检查 | `classifyProductSkill`，`productReachable=true` | 151129 / SkillAha 与 151131 / SkillAeon 均抛错；151104 分类为 talent |
| 阿哈普通部分隔离投影 | 进程内排除 151129、151131 和相应 SpecialSkillTree 关系，保留其他真实配置 | zh-CN / en 六类卡片均成功，包含仓库技；不是完整角色成功证明 |
| Point23 独立校验 | 从阿哈真实树行提取 PointID / AnchorType 等数据，调用 `resolveTrainingSkillTree` | unmapped AnchorType Point23 |
| SeriesSkill 关联统计 | `(SkillID,Level)` 与 AvatarID、SkillList、SkillTree / SpecialSkillTree 连接 | 18 行、9 技能、0 重复键，9 个角色都具备技能，0 个树节点关联 |
| 有限正文解析 | 两语言各 96 个来源，使用现有 resolver 与真实参数 | 全部 available，参数诊断为空；涵盖 11 个 ExtraEffect ID 的名称和描述 |
| E2 宏单独检查 | hash 7518821223469069166 的 `projectGameText` | 两语言均 available 但泄漏原宏，诊断为空 |
| ExRank symbolic 解析 | 三条记录的 Name / Desc 与 NNACKOBKFGE | 中英文均成功；TriggerKey 不当作文本来源 |
| 混淆字段交叉验证 | RelatedExRankIDList、ItemConfig、GuideVideoConfig、GridFightBackRoleExRank、Character Config 与 Ability | 确认主体字段；NJNDLOFDBHB 保留未知 |

最小复核入口示例，仅在网站仓库中执行，不会写生成数据：

```powershell
@'
import { loadCharacterDomainTables } from './scripts/data/character-sources.ts';
import { buildCharacterDomain } from './scripts/data/domain/character.ts';
const tables = await loadCharacterDomainTables('../TurnBasedGameData');
try {
  buildCharacterDomain({ tables });
} catch (error) {
  console.log(error.message);
}
'@ | node --import tsx --input-type=module
```

复核宏时，以 `createTextResolver({locale:'zh-CN',textMapCode:'CHS'}, await loadTextMap(root,'CHS'))` 建立同版本 resolver，再对 `{kind:'direct',ref:{kind:'hash',hash:'7518821223469069166'}}` 调用 `projectGameText`；EN 使用 `locale='en'`、`textMapCode='EN'`。引用的是文本 hash 字符串，不应转成 JavaScript number。

### 8.4 报告交付检查

只创建本文件；未修改生产代码、Schema、组件、上游锁、配置、图片或生成产物，未提交、未 push。交付检查限于 Markdown 结构、空白错误、文档范围及三个仓库 Git 状态。仓库 Prettier 配置将 Markdown 设为手工维护文件；伪代码检查器 `.crossnote/scripts/check-pseudocode.cjs` 当前不存在，本文也没有伪代码围栏。无需为调查报告运行生产构建或新增回归测试。
