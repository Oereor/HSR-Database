# TurnBasedGameData 数据与视觉资源审计

## 来源与边界

- 上游路径通过 `HSR_DATA_ROOT` 配置，默认 `../TurnBasedGameData`；脚本只读，不创建、克隆或修改上游。
- 当前 commit：`648b08fbdb2e49739ebbf1210c9a189fcfc5e2d7`，版本 `OSPRODWin4.4.0_D15909703_A15802547_L15874300`。
- 上游约 2.29 GB、124,060 个 JSON；主要目录为 `ExcelOutput/`、`TextMap/`、`Config/`、`Stages/`、`Story/`。
- 上游未包含 LICENSE、NOTICE 或图片二进制文件；README 请求使用数据的网站或工具致谢。
- `StarRailRes` 通过 `HSR_ASSET_ROOT` 配置，默认 `../StarRailRes`；当前 commit `b95e75c7e1273d819d20c530c0b7e13a3ef19fb4`，仅作为只读视觉资源源。

## 核心表与关系

| 实体     | 主表                                 |     数量 | 主键/关系                                       |
| -------- | ------------------------------------ | -------: | ----------------------------------------------- |
| 角色     | `AvatarConfig.json`                  |       91 | `AvatarID`、`SkillList`、`RankIDList`           |
| 多命途   | `MultiplePathAvatarConfig.json`      |       12 | `AvatarID`、`BaseAvatarID`                      |
| 角色技能 | `AvatarSkillConfig.json`             |    6,804 | `SkillID + Level`                               |
| 行迹     | `AvatarSkillTreeConfig.json`         |    5,196 | `AvatarID`、`PointID + Level`、`LevelUpSkillID` |
| 星魂     | `AvatarRankConfig.json`              |      606 | `RankID`                                        |
| 角色加强 | `AvatarConfigEnhanced.json`          |       10 | `AvatarID`、`EnhancedID`、完整技能/星魂列表     |
| 加强变更 | `AvatarEnhancedSkill/SkillTree/Rank` | 32/25/20 | 构建期关联验证                                  |
| 忆灵     | `AvatarServantConfig.json`           |        6 | `ServantID`、`SkillIDList`                      |
| 忆灵技能 | `AvatarServantSkillConfig.json`      |      440 | `SkillID + Level`                               |
| 光锥     | `EquipmentConfig.json`               |      165 | `EquipmentID`、`SkillID`                        |
| 光锥叠影 | `EquipmentSkillConfig.json`          |      825 | `SkillID + Level`                               |
| 遗器套装 | `RelicSetConfig.json`                |       60 | `SetID`                                         |
| 遗器记录 | `RelicConfig.json`                   |      742 | `ID`、`SetID`                                   |
| 敌人模板 | `MonsterTemplateConfig.json`         |      613 | `MonsterTemplateID`                             |
| 敌人变体 | `MonsterConfig.json`                 |    2,591 | `MonsterID`、`MonsterTemplateID`                |

第二次重构后网站不再消费普通 `ItemConfig`、`PromotionCostList`、行迹 `MaterialList` 或 `MonsterDrop`。材料、普通物品、养成成本和敌人掉落不进入领域模型、路由、搜索或生成数据。

以下带有 Item 名称的表仍服务核心领域，不能机械删除：

- `ItemConfigAvatar`：角色简介；
- `ItemConfigEquipment`：光锥名称、简介与故事；
- `ItemComefrom`：当前仅用于遗器获取来源。

现有敌人百科的出现关卡继续由 `StageConfig.MonsterList` 经 `MonsterID → MonsterTemplateID` 聚合。Endgame 数据另建 encounter-centric 管线，不改变百科模型。

## Endgame 敌方实例与战斗属性

schema 14 在 `src/lib/generated/endgame/{moc,pf,as,aa}.json` 中生成：

| 模式 | Group | Encounter | Stage | Occurrence |
| ---- | ----: | --------: | ----: | ---------: |
| MoC  |    55 |       603 | 1,453 |      7,077 |
| PF   |    25 |       100 |   202 |     16,930 |
| AS   |    20 |        80 |   163 |        183 |
| AA   |     8 |        40 |    40 |        184 |

- MoC 与 AS 使用 fixed waves；PF 与 AA 经完整 `StageInfiniteGroup → Wave → MonsterGroup` 链生成有序 spawn sequence。
- AA 保留 `StageConfig` preview MonsterID，但实例、模板和 HP 只由实际 spawn MonsterID 驱动。
- 最新 MoC/PF/AS 的 Tierce 配置均产生第三个 battle slot；历史 `EventIDList` 中的多个事件保留为同一 slot 内的有序 stages。
- 单条配置 HP 使用四个原始十进制因子：`HPBase × HPModifyRatio × HardLevelGroup.HPRatio × contextual Elite HPRatio`。构建器使用 BigInt/scale 精确乘法，不采用 JS 浮点或未经验证的整数化规则。
- 速度使用 `(SpeedBase × SpeedModifyRatio + SpeedModifyValue) × HardLevel.SpeedRatio × Elite.SpeedRatio`。Stance 使用同一乘加链得到 resolved internal stance，再以固定 3:1 比例换算为玩家侧单管韧性；两层单位在领域模型中分别保存，UI 不执行换算。
- `StanceCount` 仅作为配置韧性管数，不参与 3:1 单位转换，也不从 HP phase count 推断。能力配置中的锁定、重置或管数修改继续保留为构建期机制元数据，但页面不展示详细机制弹窗。
- 当前 24,374 个 occurrence 中有 24,215 个 resolved internal stance、159 个缺失值、36 个多管实例；玩家韧性范围为 10–800，不能精确按 3:1 转换及非正值均为 0。
- 当前 185 个 Endgame 模板中有 2 个缺少 SpeedBase、7 个缺少 StanceBase；这些记录生成明确的 `unavailable` 状态并显示“资料未提供”，不补写数值。
- 5,272 个历史 MoC occurrence 缺少 Stage EliteGroup，均显式使用 `MonsterConfig.EliteGroup=1`，并标记为 `inferred`；缺少两种来源时生成失败。
- 当前核心关系错误为 0。机制扫描有 19 个唯一可选警告：1 个角色配置缺失，18 个 companion ability 路径无法读取；这些实例的有效总 HP 保持 `runtime-unclear`。
- phase count、召唤、共享生命、SetHP 和 LockHP 只作为静态机制信号；不会把阶段当成 wave，也不会推算复杂 Boss 的实际伤害需求。

四个真实精确回归值为：MoC 萨姆 `11347628.66250`、PF 杰帕德 `1444452.47100`、AS `14628489.139950`、AA `63467351.45020015200`。AA 样本明确使用实际 MonsterID `501403002`，而不是 preview `5014030`。

Endgame UI 静态构建时按 mode/group 读取单个赛期并生成玩家视图：

- MoC fixed formation 中完整 identity 相同的 occurrence 合并并保留数量；不同 MonsterID、缩放或机制不合并。
- PF/AA spawn sequence 仍在底层完整保存；PF 页面在每个 wave 内按实际 MonsterID、HP/Elite 上下文和机制 identity 保留第一次出现，隐藏重复次数和运行时顺序。当前 PF 16,930 条原始 occurrence 投影为 1,989 个波内唯一类型。
- occurrence 使用实际 MonsterID 的名称、HP 和机制，并按 MonsterTemplateID 关联百科链接与弱点。当前 Endgame 涉及 185 个模板，全部存在百科详情，其中 9 个缺少弱点列表并在 UI 中明确降级。
- HP 由 branded 十进制字符串直接四舍五入，不经过 JS `number`；页面显示带千分位的完整整数。多阶段显示 `14,628,489 × 2`，不把乘积标记为总生命值。
- 速度继续由十进制字符串四舍五入为整数；韧性显示全部缩放后精确换算出的玩家单位，多管韧性使用 `120 × 8` 语法。当前换算结果均为整数，未来若出现精确小数则不擅自取整。
- 弱点标签统一使用 canonical 七属性颜色、生成的属性图标和简中名称。可选敌人立绘通过 server-only manifest resolver 按 MonsterTemplateID 注入；当前 185 个实际模板中 184 个有本地映射，`8003060` 使用无图片降级，不产生无效请求。

## 简中文本与 Hash

网站只读取 `TextMap/TextMapCHS.json`。一次性审计确认 `TextMapMainCHS.json` 的 1,116 个键全部包含在 CHS 中，因此 MainCHS 和其他语言 TextMap 均不是依赖或 fallback。

数值 Hash 可能超过 JavaScript 安全整数范围。导入器使用 `lossless-json`，所有 Hash 在最早边界物化为 branded 十进制字符串。已有 `{ Hash }` 直接查表；`RelicDesc_1012`、`SkillPointName_1001101` 等符号键才执行 UTF-8、seed 0 的 XXHash64。

所有构建期文本经过同一个 resolver。空源字段、有效引用无 CHS、符号键失败和异常 Hash 分别诊断；异常 Hash 或其他 D 类程序错误会使验证失败。修复符号键路径后，可恢复全部已确认的非空行迹和 606 组星魂文本。

## 技能、忆灵与分级描述

角色技能数据流为：

```text
AvatarConfig.SkillList
→ AvatarSkillConfig
→ AvatarSkillTreeConfig.PointID + LevelUpSkillID
→ SkillCategory
→ SkillCard
→ SkillVariant
```

- 分类使用 `AttackType`、`SkillTriggerKey` 等结构字段，不以中文名称为主规则。
- 同一角色每个语义类别最多一张卡片；同一 `PointID` 证明共享 progression。
- 无描述 Variant 仅在同类别存在公开描述，且共享 progression 或共享 `SkillTag + SkillIcon` 时作为内部实现过滤；当前共过滤 20 个，不使用名称或角色 ID 规则。
- 丹恒·饮月的四个普攻和大黑塔的两个战技分别共享一张卡片。
- 当前数据还包含真实的 `ElationDamage` 和 `Assist`，对应欢愉技与助战技；`MazeNormal` 是场景普通攻击，不生成资料卡。

忆灵通过 `AvatarSkillTreeConfig.PointType=4` 的 `LevelUpSkillID` 与 `AvatarServantConfig.SkillIDList` 的真实交集连接。6 个忆灵配置覆盖 7 个记忆形态角色，男女记忆开拓者共享同一配置。忆灵技和忆灵天赋进入同一技能管线；已吸收的升级节点不再重复作为行迹，普通忆灵相关行迹保留。

每级 `ParamList` 与 `#n[i]`、`#n[f1]` 和百分比模板对应。生成模型保存真实等级、参数、纯文本与语义 token，仅把跨等级变化的值标为 `scaling-value`。模板参数异常写入审计，原占位符保留。技能默认等级为普攻/忆灵 Lv.6、其他可升级能力 Lv.10、固定能力 Lv.1；默认值不改变真实最大等级。光锥叠影真实范围 1–5，默认 Lv.1。

属性强化行迹的事实来源是 `AvatarSkillTreeConfig.StatusAddList[].PropertyType/Value`。`AvatarPropertyConfig.PropertyNameSkillTree` 提供带 `#1[f1]%` 或 `#1[i]` 的官方简中格式模板，继续交给统一 formatter 插值。当前 1,010 条 `PointType=1` 空描述记录全部具有一条有效属性增益，覆盖 17 种属性代码，没有无法恢复的节点；原始 `PointDesc` 非空时仍优先使用原文。

TextMap 中普通简介和故事的换行保存为字面量 `\\n`。schema 7 在统一游戏文本边界恢复真实换行；安全 token renderer 白名单支持 `<color>`、`<i>` 与 `<unbreak>`，未知标签只移除外壳并保留可读文本，不执行 HTML。`<icon>` 仍仅作为审计限制记录。

遐蝶的召唤物列表同时包含 `1140706` 与 `1140712`。两者共享 `SkillTag` 和 `SkillIcon`，但 `1140706` 使用 `SkillP04` 并归类为忆灵天赋，`1140712` 使用 `Skill23`、标记 `HideInUI: true`。schema 7 对这组关系做显式校验并只展示 `1140706`，避免“灼掠幽墟的晦翼”重复进入忆灵技卡片。

## Skill Variant 战斗元数据

schema 10 从 `AvatarSkillConfig` 和 `AvatarServantSkillConfig` 提取 `BPNeed`、`BPAdd`、`SkillNeed`、`SPBase`、`StanceDamageDisplay` 和 `SkillEffect`，并在规范化后存入每个最终展示的 Skill Variant。UI 不读取 raw config。

schema 11 将 `AvatarSkillTreeConfig` 的可读节点规范化为行迹森林：`PointType=1` 为 1,010 个属性加成，`PointType=3` 为 303 个常规额外能力；男女记忆开拓者的 `PointType=5` 节点 `8007501/8008501` 是已审计的第四项额外能力。全部节点均为单级记录，因此客户端不再生成虚假的 `Lv.1`。

`PrePoint` 产生 860 条同 Profile 前置关系，包含属性→属性 485、属性→额外能力 361、额外能力→属性 14；不存在跨角色、跨 Profile、悬空、自引用或循环。`AnchorType=PointNN` 提供同层稳定顺序。`AvatarPromotionLimit` 仍完整进入生成模型；UI 仅为额外能力显示角色晋阶 2/4/6，属性节点的真实晋阶字段按产品决策隐藏。

卡片分组不改变 schema 11 或任何原始关系。展示层只沿属性节点自己的 `PrePoint` 链向前追溯，首次遇到额外能力即归入该能力；额外能力反向依赖属性节点时不会改变该属性节点的归属。全部 101 套 Profile 当前得到 785 个能力所属属性节点和 225 个独立属性节点，最长追溯链为 3，且每个节点只展示一次。

男女记忆开拓者均形成 3 个常规能力组：属性节点数量分别为 2、2、3；另有 3 个独立属性节点。`8007209/8007210` 与对应女形态记录通过多级属性链归入“磁石与长链”。`PointType=5`“未完的尾声”作为第四项特殊能力在独立行迹区通栏展示，不伪造晋阶条件。

- `BPNeed > 0` 表示战技点消耗，`BPAdd > 0` 表示战技点生成；`BPNeed <= 0` 本身不生成战技点。
- `SkillNeed` 是 TextMap Hash，通过 CHS resolver 与对应等级 `ParamList` 插值。特殊资源与战技点是独立字段；`131002` 和 `1131002` 会同时展示“40%生命值”与战技点 -1。
- 当前全库不存在 `BPNeed` 和 `BPAdd` 同时为正的记录；未来若出现则验证失败，不计算净变化。
- 当前最终展示的 605 个唯一 Variant 中，上述元数据不随技能等级变化，因此折叠为 Variant 级对象。隐藏的 `1140712` 不进入该集合。
- 当前实际 SkillEffect 为 `SingleAttack`、`Blast`、`AoEAttack`、`Bounce`、`Enhance`、`Impair`、`Support`、`Defence`、`Restore`、`Summon` 和 `MazeAttack`，均有简中展示标签。
- 261 个 Variant 缺少 `SPBase`，257 个缺少 `StanceDamageDisplay`，展示层直接省略对应行。

## 角色加强 Profile

`AvatarConfigEnhanced` 覆盖镜流、刃、卡芙卡、银狼、黑天鹅、花火、希儿、藿藿、流萤和瓦尔特 10 名角色。schema 9 将每名角色的能量、技能、行迹与星魂分别生成为 `profiles.base` 和 `profiles.enhanced`。

- base 技能/星魂来自 `AvatarConfig.SkillList/RankIDList`，enhanced 来自 `AvatarConfigEnhanced.SkillList/RankIDList`。
- 行迹严格依 `AvatarSkillTreeConfig.EnhancedID` 分区：0 或缺省进入 base，匹配当前加强配置的记录进入 enhanced。这修复了旧生成器将两套行迹同时展示的问题。
- `AvatarEnhancedSkill`、`AvatarEnhancedSkillTree`和 `AvatarEnhancedRank` 的 32/25/20 条声明只用于构建期完整性验证，不使用摘要文本替代完整配置。
- 详情 JSON 可包含两套 Profile 以便即时切换，但展示层一次只渲染一套。无 URL 参数时默认 enhanced，`?enhanced=0` 选择 base。

## Lv.1–80 基础属性

角色和光锥分别读取 `AvatarPromotionConfig` 与 `EquipmentPromotionConfig`。HP、ATK、DEF 使用：

```text
Base + Add × (level - 1)
```

生成数据只保存规范化 promotion stages，不硬编码 80 条结果。等级范围 1–80，默认 Lv.80。Lv.20、30、40、50、60、70 同时存在突破前后状态；产品统一选择能够达到该等级的最高已突破阶段。该规则同时用于角色、光锥、UI 和测试。原始计算值保持小数精度，角色和光锥的 HP、ATK、DEF 仅在展示边界四舍五入为整数。

真实回归：三月七 Lv.1 HP 144、Lv.20 突破后原始 HP 338.4（显示 338）、Lv.80 原始 HP 1058.4（显示 1,058）；锋镝 Lv.80 原始 HP 846.72（显示 847）。

角色普通能量读取 `AvatarConfig.SPNeed`。特殊能量以 `AvatarUltraSkillConfig.UltraSkillType = SpecialSP` 为唯一分类依据，并用 `GridFightFrontSpecialSP.MaxSpecialSP` 校验配置完整性；schema 9 将黄泉、飞霄、遐蝶、白厄、昔涟和银狼LV.999生成为 `{ kind: "special", max: 0 }`，旧版银狼仍为普通 110 能量。内部特殊上限不进入客户端展示模型。

## 缺失文本审计

schema 14 按 `实体 + ID + 字段 + 引用` 去重后的基线：

| 类别 |  数量 | 说明                                            |
| ---- | ----: | ----------------------------------------------- |
| A    | 6,557 | 源字段为空或有效引用在 CHS 中不存在             |
| B    |    25 | 当前 Formatter 未表达的 `<icon>` 语义           |
| C    |   244 | 关卡引用了当前 `MonsterConfig` 不存在的敌人变体 |
| D    |     0 | 当前程序级错误                                  |

A 类主要包括 4,310 个无简中名称的关卡、1,016 个原始空行迹描述、410/389 个无简中映射的敌人技能描述/名称、235 条角色技能空描述和 20 条忆灵技能空描述。其中 1,010 条属性行迹已由结构化数据恢复，255 条空技能等级所属的 20 个内部 Variant 已由关系规则隐藏；审计仍如实保留原始缺失。B 类包括角色技能 `151022` 的 15 个等级和忆灵技能 `1141502` 的 10 个等级。普通物品已退出消费域，因此此前 274 个空物品名称不再计入运行审计。

完整分组和最多 20 个样本位于 `data/audit/latest.json` 与 `data/audit/audit.json`。

## 生成策略、资源和许可

- schema 14 生成 91 个角色、165 个光锥、60 个遗器套装、613 个敌人详情、四类 Endgame 数据及 929 条简中搜索记录；其中 10 个角色详情包含双 Profile。
- 生成数据位于 `src/lib/generated/` 和 `static/generated/`，浏览器不加载上游 Config 或完整 TextMap。
- `TurnBasedGameData` 只有 `SpriteOutput/...` 路径，没有图片文件；`StarRailRes` 当前为 91 个目录角色提供完整的 128×128 PNG 头像与 2048×2048 PNG 立绘，并覆盖七属性和九种实际命途图标。网站只按真实 ID/语义 code 生成所需集合。
- 视觉 manifest schema 2 分别记录头像、立绘、属性和命途资源。头像保留原始 PNG，立绘生成最大 960px WebP，语义图标生成 64px PNG；所有输出均位于 gitignore 的 generated-assets 目录。
- 构建期仅复制当前角色目录需要的头像；视觉 manifest 与业务 schema 14 相互独立，详情领域模型不携带视觉路径。
- 头像缺失只记录诊断并使用中性占位，不请求不存在的图片，也不阻止数据构建。
- 生成数据采用方案 B，不提交。上游没有明确再分发许可证；网站 MIT 许可证仅覆盖原创代码。公开构建产物前应确认授权。
- StarRailRes 仓库声明 GNU AGPL v3；网站提供其完整许可证副本和来源/commit 说明。游戏图片相关权利仍归相应权利人。

## 更新与验证流程

1. 在网站仓库外独立更新上游并记录 commit。
2. 在 `HSR-Database` 运行 `pnpm data:audit`、`pnpm data:sync`、`pnpm data:validate`。
3. 检查实体数量、技能分类、忆灵关系、promotion 覆盖和 A/B/C/D 变化。
4. 运行 `pnpm assets:sync`、`pnpm assets:verify`，检查视觉资源 commit、覆盖率、格式、尺寸与缺图诊断。
5. 运行 `pnpm lint`、`pnpm check`、`pnpm test`、`pnpm test:e2e`、`pnpm build`。
6. 确认两个上游 Git 状态与更新前一致。

当前已实现首页、角色、光锥、遗器、敌人、全局搜索、详情及四模式 Endgame 赛期页面。材料和普通物品属于主动移除的产品域，不是待补页面。角色和光锥没有可靠发布版本字段，因此仅遗器提供版本筛选。
