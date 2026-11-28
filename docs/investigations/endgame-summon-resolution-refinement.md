# 召唤属性解析与配置证据

比较基线为 Phase 2 提交 `ccb872e`。两个版本使用 TurnBasedGameData v4.7.0 `25cf028e97b54a640c674bd8ce0c8a4d65805c8d`。用户报告的游戏内结果支持继承召唤者的有效 HP 上下文。具体实测关卡和读数未提供，速度与韧性仍待独立实测。

## 生产规则

目标使用自己的模板基础值和具体 Variant 修正。Level、HardLevelGroup、EliteGroup 和表来源默认来自召唤者已经生效的上下文。MoC 的 1,028 条召唤者 MonsterConfig 回退关系在当前 pin 的旧规则下均无独立目标组候选。移除这条默认歧义分支本身未改变数值。明确的任务覆写和双表冲突依旧逐属性比较。

三种模式使用同一套具体技能、具名 Ability、modifier 和任务模板扫描。配置键可由具名读取或独立于 TextMap 的有符号配置哈希关联。呼雷的 `WolfSummon01/02` 通过 LevelEntity 的 `WolfID01/02` 默认初始化传入其绑定的 BattleEvent `20008`，再由具名关卡 Ability 读取。MoC 的 26 条关系可继续计算，AA 有 2 条关系由未知变为可计算。奎木 `2022050 → 2022051` 通过哈希读到 `SummonID01`，移除了 concrete ID 特例。其 `CurrentHP/MaxHP` 继承仍依赖运行时。

玻吕刻斯各 Variant 的同一任务序列先生成两个明确目标，随后用 `CasterSummonedMinions` 组池。具体 ID 映射已移除。剧目 `3004012` 的入场共享从 `ParamEntityList` 读取标记，仍保留原有受检规则。幼蛰虫 `8022010/8022012` 的自繁殖读取缺少可重建的静态来源，仍以原 concrete SkillID 和生成任务护栏确认。天谴之矛的原护栏仅用于限定待核成员。

## 共享与属性缺口

影将军 `203501201–203501204` 可达的 `DefineHPSharedGroup` 将暗方实体筛选结果交给 `ParamEntityList`。各难度分支的固定生成 ID 都是 `203302200`，直接声明的是 `2033022`。当前表缺少这两者的明确映射，12 条关系的 HP 仍未知。天谴之矛 `4014020` 的具名筛选器使用 `MonsterUniqueID=401401` 或 concrete `9004112`，`4014012` 留待核对。其另一目标 `4012060` 由独立的 `SummonID1` 生成，保留配置 HP。

蕉研组、裁定者、火花大会与超偶像均保留可达共享操作的证据。蕉研组通过 `ParamEntityList` 筛人。裁定者的范围依赖当前阶段与队伍成员。火花大会和超偶像使用生成时的 `CasterSummonedMinions`，部分生成参数缺少具体成员绑定。归寂的共享部件选择器与喜剧学家的生成链分别保留。神主日及其 AS Variant 的共享操作同样来自入场任务，具体目标筛选进入待审。

至黑之剑，盗火行者及末日歧途的盗火者的具体 `SummonID_1/2/3` 指向列表外 Variant，声明中的目标因此缺少可绑定生成链。「至高，至阳，天空的化身」与「诛尽杀绝的灭星兽」的部件含 `InheritEliteGroupForBodyPart=false`，当前配置无法确定实际替代属性组。「反造物主，流溢之恨」的部件有 concrete ID 的配置槽，初始生成任务尚未绑定。复生时的历史状态与静态初始属性分别核查。死亡清理、锁定当前 HP、传伤和削韧不作为共享证据。未知的创建 modifier 归为静态追踪缺口，明确继承或依据战斗状态读数的属性归为运行时依赖。

## 覆盖率

| 模式 | 有效召唤者 | 候选 | 召唤者 / 目标 Variant / 关系对 | 基础 HP | 共享 HP | 未知 HP | 未知速度 | 未知韧性 | 无效引用 |
| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| MoC | 1,411 | 1,839 | 62 / 65 / 105 | 1,696 → 1,685 | 11 | 132 → 143 | 12 | 10 → 21 | 0 |
| AA | 80 | 130 | 36 / 58 / 64 | 88 → 77 | 7 | 35 → 46 | 9 → 15 | 10 → 15 | 0 |
| AS | 190 | 565 | 72 / 146 / 224 | 388 → 367 | 32 | 145 → 166 | 56 | 44 → 61 | 0 |

各属性的原因按关系去重。一条关系可以同时出现在多个原因列。任务列表外按召唤者与目标 Variant 对计。

| 模式 | 待审集合（含旧护栏） | 静态解析缺口 | 共享成员未知 | 运行时依赖 | 缺失／无效属性输入 | 静态上下文歧义 | 既有特例 | 列表外关系对 | 诊断次数前后 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| MoC | 78 | 12 | 75 | 56 | 9 | 0 | 5 | 17 | 156 → 904 |
| AA | 34 | 15 | 31 | 0 | 0 | 0 | 3 | 8 | 315 → 279 |
| AS | 125 | 53 | 125 | 0 | 11 | 0 | 0 | 29 | 1,535 → 1,341 |

## 静态解析待核清单

| 模式与 concrete ID 对 | 关系数 | 当前缺口 |
| --- | ---: | --- |
| `moc-8034010-8032030` 「石心十人」诡弈砂金 → 「所有或一无所有」 | 6 | 韧性 missing-base |
| `moc-4034010-4032020` 至黑之剑，盗火行者 → 残破容器 | 11 | HP unbound-summon-task、速度 unbound-summon-task、韧性 unbound-summon-task |
| `moc-803401004-8032030` 「石心十人」诡弈砂金 → 「所有或一无所有」 | 3 | 韧性 missing-base |
| `moc-8033020-8032040` 「灯塔」 → 千星戍卫 | 1 | HP unbound-creation-task、速度 unbound-creation-task、韧性 unbound-creation-task |
| `aa-401501101-4012090` 至高，至阳，天空的化身 → 百眼之梢 | 2 | HP unbound-summon-task、速度 unbound-summon-task、韧性 unbound-summon-task |
| `aa-401501101-4012091` 至高，至阳，天空的化身 → 百眼之末 | 2 | HP unbound-summon-task、速度 unbound-summon-task、韧性 unbound-summon-task |
| `aa-4034010-4032020` 至黑之剑，盗火行者 → 残破容器 | 3 | HP unbound-summon-task、速度 unbound-summon-task、韧性 unbound-summon-task |
| `aa-8033020-8032040` 「灯塔」 → 千星戍卫 | 4 | HP unbound-creation-task、速度 unbound-creation-task、韧性 unbound-creation-task |
| `aa-403501001-403206001` 反造物主，流溢之恨 → 被囚禁的秘所思 | 2 | HP unbound-summon-task、速度 unbound-summon-task、韧性 unbound-summon-task |
| `aa-403501001-403207001` 反造物主，流溢之恨 → 被操弄的逻各斯 | 2 | HP unbound-summon-task、速度 unbound-summon-task、韧性 unbound-summon-task |
| `as-801501201-801214601` 诛尽杀绝的灭星兽 → 灾虐的右手 | 2 | HP unbound-summon-task、速度 unbound-summon-task、韧性 unbound-summon-task |
| `as-801501201-801314501` 诛尽杀绝的灭星兽 → 反物质引擎 | 2 | HP unbound-summon-task、速度 unbound-summon-task、韧性 unbound-summon-task |
| `as-801501201-801214701` 诛尽杀绝的灭星兽 → 黎明的左手 | 2 | HP unbound-summon-task、速度 unbound-summon-task、韧性 unbound-summon-task |
| `as-801501202-801214602` 诛尽杀绝的灭星兽 → 灾虐的右手 | 2 | HP unbound-summon-task、速度 unbound-summon-task、韧性 unbound-summon-task |
| `as-801501202-801314502` 诛尽杀绝的灭星兽 → 反物质引擎 | 2 | HP unbound-summon-task、速度 unbound-summon-task、韧性 unbound-summon-task |
| `as-801501202-801214702` 诛尽杀绝的灭星兽 → 黎明的左手 | 2 | HP unbound-summon-task、速度 unbound-summon-task、韧性 unbound-summon-task |
| `as-801501203-801214603` 诛尽杀绝的灭星兽 → 灾虐的右手 | 2 | HP unbound-summon-task、速度 unbound-summon-task、韧性 unbound-summon-task |
| `as-801501203-801314503` 诛尽杀绝的灭星兽 → 反物质引擎 | 2 | HP unbound-summon-task、速度 unbound-summon-task、韧性 unbound-summon-task |
| `as-801501203-801214703` 诛尽杀绝的灭星兽 → 黎明的左手 | 2 | HP unbound-summon-task、速度 unbound-summon-task、韧性 unbound-summon-task |
| `as-801501204-801214604` 诛尽杀绝的灭星兽 → 灾虐的右手 | 2 | HP unbound-summon-task、速度 unbound-summon-task、韧性 unbound-summon-task |
| `as-801501204-801314504` 诛尽杀绝的灭星兽 → 反物质引擎 | 2 | HP unbound-summon-task、速度 unbound-summon-task、韧性 unbound-summon-task |
| `as-801501204-801214704` 诛尽杀绝的灭星兽 → 黎明的左手 | 2 | HP unbound-summon-task、速度 unbound-summon-task、韧性 unbound-summon-task |
| `as-403401301-4032021` 末日歧途的盗火者 → 残破容器 | 1 | HP unbound-summon-task、速度 unbound-summon-task、韧性 unbound-summon-task |
| `as-403401301-403202111` 末日歧途的盗火者 → 残破容器 | 1 | 速度 missing-base |
| `as-403401301-403202112` 末日歧途的盗火者 → 残破容器 | 1 | 速度 missing-base |
| `as-403401301-403202113` 末日歧途的盗火者 → 残破容器 | 1 | 速度 missing-base |
| `as-403401302-4032021` 末日歧途的盗火者 → 残破容器 | 1 | HP unbound-summon-task、速度 unbound-summon-task、韧性 unbound-summon-task |
| `as-403401302-403202111` 末日歧途的盗火者 → 残破容器 | 1 | HP unbound-summon-task、速度 unbound-summon-task、韧性 unbound-summon-task |
| `as-403401302-403202112` 末日歧途的盗火者 → 残破容器 | 1 | HP unbound-summon-task、速度 unbound-summon-task、韧性 unbound-summon-task |
| `as-403401302-403202113` 末日歧途的盗火者 → 残破容器 | 1 | HP unbound-summon-task、速度 unbound-summon-task、韧性 unbound-summon-task |
| `as-403401303-4032021` 末日歧途的盗火者 → 残破容器 | 1 | HP unbound-summon-task、速度 unbound-summon-task、韧性 unbound-summon-task |
| `as-403401303-403202111` 末日歧途的盗火者 → 残破容器 | 1 | HP unbound-summon-task、速度 unbound-summon-task、韧性 unbound-summon-task |
| `as-403401303-403202112` 末日歧途的盗火者 → 残破容器 | 1 | HP unbound-summon-task、速度 unbound-summon-task、韧性 unbound-summon-task |
| `as-403401303-403202113` 末日歧途的盗火者 → 残破容器 | 1 | HP unbound-summon-task、速度 unbound-summon-task、韧性 unbound-summon-task |
| `as-403401304-4032021` 末日歧途的盗火者 → 残破容器 | 2 | HP unbound-summon-task、速度 unbound-summon-task、韧性 unbound-summon-task |
| `as-403401304-403202111` 末日歧途的盗火者 → 残破容器 | 2 | HP unbound-summon-task、速度 unbound-summon-task、韧性 unbound-summon-task |
| `as-403401304-403202112` 末日歧途的盗火者 → 残破容器 | 2 | HP unbound-summon-task、速度 unbound-summon-task、韧性 unbound-summon-task |
| `as-403401304-403202113` 末日歧途的盗火者 → 残破容器 | 2 | HP unbound-summon-task、速度 unbound-summon-task、韧性 unbound-summon-task |
| `as-203501201-2033022` 业火焚心的影将军 → 蛊言妄念的蚀心兽 | 3 | 速度 unbound-summon-task、韧性 unbound-summon-task |
| `as-203501202-2033022` 业火焚心的影将军 → 蛊言妄念的蚀心兽 | 3 | 速度 unbound-summon-task、韧性 unbound-summon-task |
| `as-203501203-2033022` 业火焚心的影将军 → 蛊言妄念的蚀心兽 | 3 | 速度 unbound-summon-task、韧性 unbound-summon-task |
| `as-203501204-2033022` 业火焚心的影将军 → 蛊言妄念的蚀心兽 | 3 | 速度 unbound-summon-task、韧性 unbound-summon-task |
| `as-401401301-401402101` 兵戈扰攘的常胜军 → 颁赐者，千军首，天谴之矛 | 2 | 韧性 missing-base |
| `as-401401302-401402102` 兵戈扰攘的常胜军 → 颁赐者，千军首，天谴之矛 | 2 | 韧性 missing-base |
| `as-401401303-401402103` 兵戈扰攘的常胜军 → 颁赐者，千军首，天谴之矛 | 2 | 韧性 missing-base |
| `as-401401304-401402104` 兵戈扰攘的常胜军 → 颁赐者，千军首，天谴之矛 | 2 | 韧性 missing-base |

## Phase 2 → Phase 3 逐关系属性变化

使用 `(occurrenceId, targetMonsterId)` 对照。两边状态相同的条目表示属性数值或属性来源字段有变化。

| 召唤者 occurrenceId | 目标 MonsterID | 变化 |
| --- | ---: | --- |
| `moc:group:1022:encounter:4112:variant::slot:1:stage:30112121:fixed:2:position:1:monster:4034010` | 4032020 | HP configured → unresolved（unbound-summon-task）、速度 unavailable（missing-base） → unavailable（unbound-summon-task）、韧性 resolved → unavailable（unbound-summon-task） |
| `moc:group:1023:encounter:4211:variant::slot:2:stage:30113112:fixed:2:position:1:monster:4034010` | 4032020 | HP configured → unresolved（unbound-summon-task）、速度 unavailable（missing-base） → unavailable（unbound-summon-task）、韧性 resolved → unavailable（unbound-summon-task） |
| `moc:group:1025:encounter:4411:variant::slot:2:stage:30115112:fixed:2:position:1:monster:4034010` | 4032020 | HP configured → unresolved（unbound-summon-task）、速度 unavailable（missing-base） → unavailable（unbound-summon-task）、韧性 resolved → unavailable（unbound-summon-task） |
| `moc:group:1027:encounter:4612:variant::slot:1:stage:30117121:fixed:2:position:1:monster:4034010` | 4032020 | HP configured → unresolved（unbound-summon-task）、速度 unavailable（missing-base） → unavailable（unbound-summon-task）、韧性 resolved → unavailable（unbound-summon-task） |
| `moc:group:1029:encounter:4810:variant::slot:1:stage:30119101:fixed:2:position:1:monster:4034010` | 4032020 | HP configured → unresolved（unbound-summon-task）、速度 unavailable（missing-base） → unavailable（unbound-summon-task）、韧性 resolved → unavailable（unbound-summon-task） |
| `moc:group:1032:encounter:5111:variant::slot:1:stage:30122111:fixed:2:position:1:monster:4034010` | 4032020 | HP configured → unresolved（unbound-summon-task）、速度 unavailable（missing-base） → unavailable（unbound-summon-task）、韧性 resolved → unavailable（unbound-summon-task） |
| `moc:group:1033:encounter:5212:variant::slot:1:stage:30123121:fixed:2:position:1:monster:4034010` | 4032020 | HP configured → unresolved（unbound-summon-task）、速度 unavailable（missing-base） → unavailable（unbound-summon-task）、韧性 resolved → unavailable（unbound-summon-task） |
| `moc:group:1034:encounter:5310:variant::slot:1:stage:30124101:fixed:2:position:1:monster:4034010` | 4032020 | HP configured → unresolved（unbound-summon-task）、速度 unavailable（missing-base） → unavailable（unbound-summon-task）、韧性 resolved → unavailable（unbound-summon-task） |
| `moc:group:1035:encounter:5410:variant::slot:1:stage:30125101:fixed:2:position:1:monster:4034010` | 4032020 | HP configured → unresolved（unbound-summon-task）、速度 unavailable（missing-base） → unavailable（unbound-summon-task）、韧性 resolved → unavailable（unbound-summon-task） |
| `moc:group:1036:encounter:5510:variant::slot:2:stage:30126102:fixed:2:position:1:monster:4034010` | 4032020 | HP configured → unresolved（unbound-summon-task）、速度 unavailable（missing-base） → unavailable（unbound-summon-task）、韧性 resolved → unavailable（unbound-summon-task） |
| `moc:group:1037:encounter:5607:variant::slot:2:stage:30127072:fixed:2:position:2:monster:8033020` | 8032040 | HP unresolved（dynamic-summon-task） → unresolved（unbound-creation-task）、速度 unavailable（dynamic-summon-task） → unavailable（unbound-creation-task）、韧性 unavailable（dynamic-summon-task） → unavailable（unbound-creation-task） |
| `moc:group:1037:encounter:5611:variant::slot:2:stage:30127112:fixed:2:position:1:monster:4034010` | 4032020 | HP configured → unresolved（unbound-summon-task）、速度 unavailable（missing-base） → unavailable（unbound-summon-task）、韧性 resolved → unavailable（unbound-summon-task） |
| `aa:group:2:encounter:202:variant:preliminary:slot:1:stage:30502012:spawn:305020122:group:305020122:position:1:monster:2034010` | 203201003 | HP unresolved（unbound-summon-task） → configured、速度 unavailable（unbound-summon-task） → resolved、韧性 unavailable（unbound-summon-task） → resolved |
| `aa:group:2:encounter:202:variant:preliminary:slot:1:stage:30502012:spawn:305020122:group:305020122:position:1:monster:2034010` | 203202004 | HP unresolved（unbound-summon-task） → configured、速度 unavailable（unbound-summon-task） → resolved、韧性 unavailable（unbound-summon-task） → resolved |
| `aa:group:2:encounter:204:variant:boss-normal:slot:1:stage:30502021:spawn:305020211:group:305020211:position:1:monster:401501101` | 4012090 | HP configured → unresolved（unbound-summon-task）、速度 resolved → unavailable（unbound-summon-task）、韧性 resolved → unavailable（unbound-summon-task） |
| `aa:group:2:encounter:204:variant:boss-normal:slot:1:stage:30502021:spawn:305020211:group:305020211:position:1:monster:401501101` | 4012091 | HP configured → unresolved（unbound-summon-task）、速度 resolved → unavailable（unbound-summon-task）、韧性 resolved → unavailable（unbound-summon-task） |
| `aa:group:2:encounter:204:variant:boss-hard:slot:1:stage:30502022:spawn:305020221:group:305020221:position:1:monster:401501101` | 4012090 | HP configured → unresolved（unbound-summon-task）、速度 resolved → unavailable（unbound-summon-task）、韧性 resolved → unavailable（unbound-summon-task） |
| `aa:group:2:encounter:204:variant:boss-hard:slot:1:stage:30502022:spawn:305020221:group:305020221:position:1:monster:401501101` | 4012091 | HP configured → unresolved（unbound-summon-task）、速度 resolved → unavailable（unbound-summon-task）、韧性 resolved → unavailable（unbound-summon-task） |
| `aa:group:3:encounter:304:variant:boss-normal:slot:1:stage:30503021:spawn:305030211:group:305030211:position:1:monster:3025016` | 3022010 | HP configured → unresolved（unresolved-shared-membership） |
| `aa:group:3:encounter:304:variant:boss-hard:slot:1:stage:30503022:spawn:305030221:group:305030221:position:1:monster:3025016` | 3022010 | HP configured → unresolved（unresolved-shared-membership） |
| `aa:group:4:encounter:402:variant:preliminary:slot:1:stage:30504012:spawn:305040122:group:305040122:position:1:monster:4034010` | 4032020 | HP configured → unresolved（unbound-summon-task）、速度 unavailable（missing-base） → unavailable（unbound-summon-task）、韧性 resolved → unavailable（unbound-summon-task） |
| `aa:group:6:encounter:603:variant:preliminary:slot:1:stage:30506013:spawn:305060132:group:305060132:position:1:monster:4034010` | 4032020 | HP configured → unresolved（unbound-summon-task）、速度 unavailable（missing-base） → unavailable（unbound-summon-task）、韧性 resolved → unavailable（unbound-summon-task） |
| `aa:group:9:encounter:901:variant:preliminary:slot:1:stage:30509011:spawn:305090111:group:305090111:position:1:monster:8033020` | 8032040 | HP unresolved（dynamic-summon-task） → unresolved（unbound-creation-task）、速度 unavailable（dynamic-summon-task） → unavailable（unbound-creation-task）、韧性 unavailable（dynamic-summon-task） → unavailable（unbound-creation-task） |
| `aa:group:9:encounter:901:variant:preliminary:slot:1:stage:30509011:spawn:305090112:group:305090112:position:1:monster:8033020` | 8032040 | HP unresolved（dynamic-summon-task） → unresolved（unbound-creation-task）、速度 unavailable（dynamic-summon-task） → unavailable（unbound-creation-task）、韧性 unavailable（dynamic-summon-task） → unavailable（unbound-creation-task） |
| `aa:group:9:encounter:903:variant:preliminary:slot:1:stage:30509013:spawn:305090132:group:305090132:position:1:monster:4034010` | 4032020 | HP configured → unresolved（unbound-summon-task）、速度 unavailable（missing-base） → unavailable（unbound-summon-task）、韧性 resolved → unavailable（unbound-summon-task） |
| `aa:group:9:encounter:904:variant:boss-normal:slot:1:stage:30509021:spawn:305090211:group:305090211:position:1:monster:403501001` | 403206001 | HP configured → unresolved（unbound-summon-task）、速度 resolved → unavailable（unbound-summon-task）、韧性 unavailable（missing-base） → unavailable（unbound-summon-task） |
| `aa:group:9:encounter:904:variant:boss-normal:slot:1:stage:30509021:spawn:305090211:group:305090211:position:1:monster:403501001` | 403207001 | HP configured → unresolved（unbound-summon-task）、速度 resolved → unavailable（unbound-summon-task）、韧性 unavailable（missing-base） → unavailable（unbound-summon-task） |
| `aa:group:9:encounter:904:variant:boss-hard:slot:1:stage:30509022:spawn:305090221:group:305090221:position:1:monster:403501001` | 403206001 | HP configured → unresolved（unbound-summon-task）、速度 resolved → unavailable（unbound-summon-task）、韧性 unavailable（missing-base） → unavailable（unbound-summon-task） |
| `aa:group:9:encounter:904:variant:boss-hard:slot:1:stage:30509022:spawn:305090221:group:305090221:position:1:monster:403501001` | 403207001 | HP configured → unresolved（unbound-summon-task）、速度 resolved → unavailable（unbound-summon-task）、韧性 unavailable（missing-base） → unavailable（unbound-summon-task） |
| `aa:group:10:encounter:1004:variant:boss-normal:slot:1:stage:30510021:spawn:305100211:group:305100211:position:2:monster:8033020` | 8032040 | HP unresolved（dynamic-summon-task） → unresolved（unbound-creation-task）、速度 unavailable（dynamic-summon-task） → unavailable（unbound-creation-task）、韧性 unavailable（dynamic-summon-task） → unavailable（unbound-creation-task） |
| `aa:group:10:encounter:1004:variant:boss-hard:slot:1:stage:30510022:spawn:305100221:group:305100221:position:2:monster:8033020` | 8032040 | HP unresolved（dynamic-summon-task） → unresolved（unbound-creation-task）、速度 unavailable（dynamic-summon-task） → unavailable（unbound-creation-task）、韧性 unavailable（dynamic-summon-task） → unavailable（unbound-creation-task） |
| `as:group:3004:encounter:30041:variant::slot:2:stage:420161:fixed:1:position:1:monster:302501301` | 3022011 | HP configured → unresolved（unresolved-shared-membership） |
| `as:group:3004:encounter:30042:variant::slot:2:stage:420162:fixed:1:position:1:monster:302501302` | 3022011 | HP configured → unresolved（unresolved-shared-membership） |
| `as:group:3004:encounter:30043:variant::slot:2:stage:420163:fixed:1:position:1:monster:302501303` | 3022011 | HP configured → unresolved（unresolved-shared-membership） |
| `as:group:3004:encounter:30044:variant::slot:2:stage:420164:fixed:1:position:1:monster:302501304` | 3022011 | HP configured → unresolved（unresolved-shared-membership） |
| `as:group:3010:encounter:30101:variant::slot:1:stage:420281:fixed:1:position:1:monster:403401301` | 4032021 | HP configured → unresolved（unbound-summon-task）、速度 unavailable（missing-base） → unavailable（unbound-summon-task）、韧性 resolved → unavailable（unbound-summon-task） |
| `as:group:3010:encounter:30102:variant::slot:1:stage:420282:fixed:1:position:1:monster:403401302` | 4032021 | HP configured → unresolved（unbound-summon-task）、速度 unavailable（missing-base） → unavailable（unbound-summon-task）、韧性 resolved → unavailable（unbound-summon-task） |
| `as:group:3010:encounter:30102:variant::slot:1:stage:420282:fixed:1:position:1:monster:403401302` | 403202111 | HP configured → unresolved（unbound-summon-task）、速度 unavailable（missing-base） → unavailable（unbound-summon-task）、韧性 resolved → unavailable（unbound-summon-task） |
| `as:group:3010:encounter:30102:variant::slot:1:stage:420282:fixed:1:position:1:monster:403401302` | 403202112 | HP configured → unresolved（unbound-summon-task）、速度 unavailable（missing-base） → unavailable（unbound-summon-task）、韧性 resolved → unavailable（unbound-summon-task） |
| `as:group:3010:encounter:30102:variant::slot:1:stage:420282:fixed:1:position:1:monster:403401302` | 403202113 | HP configured → unresolved（unbound-summon-task）、速度 unavailable（missing-base） → unavailable（unbound-summon-task）、韧性 resolved → unavailable（unbound-summon-task） |
| `as:group:3010:encounter:30103:variant::slot:1:stage:420283:fixed:1:position:1:monster:403401303` | 4032021 | HP configured → unresolved（unbound-summon-task）、速度 unavailable（missing-base） → unavailable（unbound-summon-task）、韧性 resolved → unavailable（unbound-summon-task） |
| `as:group:3010:encounter:30103:variant::slot:1:stage:420283:fixed:1:position:1:monster:403401303` | 403202111 | HP configured → unresolved（unbound-summon-task）、速度 unavailable（missing-base） → unavailable（unbound-summon-task）、韧性 resolved → unavailable（unbound-summon-task） |
| `as:group:3010:encounter:30103:variant::slot:1:stage:420283:fixed:1:position:1:monster:403401303` | 403202112 | HP configured → unresolved（unbound-summon-task）、速度 unavailable（missing-base） → unavailable（unbound-summon-task）、韧性 resolved → unavailable（unbound-summon-task） |
| `as:group:3010:encounter:30103:variant::slot:1:stage:420283:fixed:1:position:1:monster:403401303` | 403202113 | HP configured → unresolved（unbound-summon-task）、速度 unavailable（missing-base） → unavailable（unbound-summon-task）、韧性 resolved → unavailable（unbound-summon-task） |
| `as:group:3010:encounter:30104:variant::slot:1:stage:420284:fixed:1:position:1:monster:403401304` | 4032021 | HP configured → unresolved（unbound-summon-task）、速度 unavailable（missing-base） → unavailable（unbound-summon-task）、韧性 resolved → unavailable（unbound-summon-task） |
| `as:group:3010:encounter:30104:variant::slot:1:stage:420284:fixed:1:position:1:monster:403401304` | 403202111 | HP configured → unresolved（unbound-summon-task）、速度 unavailable（missing-base） → unavailable（unbound-summon-task）、韧性 resolved → unavailable（unbound-summon-task） |
| `as:group:3010:encounter:30104:variant::slot:1:stage:420284:fixed:1:position:1:monster:403401304` | 403202112 | HP configured → unresolved（unbound-summon-task）、速度 unavailable（missing-base） → unavailable（unbound-summon-task）、韧性 resolved → unavailable（unbound-summon-task） |
| `as:group:3010:encounter:30104:variant::slot:1:stage:420284:fixed:1:position:1:monster:403401304` | 403202113 | HP configured → unresolved（unbound-summon-task）、速度 unavailable（missing-base） → unavailable（unbound-summon-task）、韧性 resolved → unavailable（unbound-summon-task） |
| `as:group:3011:encounter:30111:variant::slot:2:stage:420301:fixed:1:position:1:monster:203501201` | 2033022 | HP unresolved（unbound-summon-task） → unresolved（unresolved-shared-membership） |
| `as:group:3011:encounter:30112:variant::slot:2:stage:420302:fixed:1:position:1:monster:203501202` | 2033022 | HP unresolved（unbound-summon-task） → unresolved（unresolved-shared-membership） |
| `as:group:3011:encounter:30113:variant::slot:2:stage:420303:fixed:1:position:1:monster:203501203` | 2033022 | HP unresolved（unbound-summon-task） → unresolved（unresolved-shared-membership） |
| `as:group:3011:encounter:30114:variant::slot:2:stage:420304:fixed:1:position:1:monster:203501204` | 2033022 | HP unresolved（unbound-summon-task） → unresolved（unresolved-shared-membership） |
| `as:group:3016:encounter:30161:variant::slot:2:stage:420391:fixed:1:position:1:monster:203501201` | 2033022 | HP unresolved（unbound-summon-task） → unresolved（unresolved-shared-membership） |
| `as:group:3016:encounter:30162:variant::slot:2:stage:420392:fixed:1:position:1:monster:203501202` | 2033022 | HP unresolved（unbound-summon-task） → unresolved（unresolved-shared-membership） |
| `as:group:3016:encounter:30163:variant::slot:2:stage:420393:fixed:1:position:1:monster:203501203` | 2033022 | HP unresolved（unbound-summon-task） → unresolved（unresolved-shared-membership） |
| `as:group:3016:encounter:30164:variant::slot:2:stage:420394:fixed:1:position:1:monster:203501204` | 2033022 | HP unresolved（unbound-summon-task） → unresolved（unresolved-shared-membership） |
| `as:group:3018:encounter:30184:variant::slot:3:stage:420464:fixed:1:position:1:monster:403401304` | 4032021 | HP configured → unresolved（unbound-summon-task）、速度 unavailable（missing-base） → unavailable（unbound-summon-task）、韧性 resolved → unavailable（unbound-summon-task） |
| `as:group:3018:encounter:30184:variant::slot:3:stage:420464:fixed:1:position:1:monster:403401304` | 403202111 | HP configured → unresolved（unbound-summon-task）、速度 unavailable（missing-base） → unavailable（unbound-summon-task）、韧性 resolved → unavailable（unbound-summon-task） |
| `as:group:3018:encounter:30184:variant::slot:3:stage:420464:fixed:1:position:1:monster:403401304` | 403202112 | HP configured → unresolved（unbound-summon-task）、速度 unavailable（missing-base） → unavailable（unbound-summon-task）、韧性 resolved → unavailable（unbound-summon-task） |
| `as:group:3018:encounter:30184:variant::slot:3:stage:420464:fixed:1:position:1:monster:403401304` | 403202113 | HP configured → unresolved（unbound-summon-task）、速度 unavailable（missing-base） → unavailable（unbound-summon-task）、韧性 resolved → unavailable（unbound-summon-task） |
| `as:group:3020:encounter:30201:variant::slot:2:stage:420511:fixed:1:position:1:monster:203501201` | 2033022 | HP unresolved（unbound-summon-task） → unresolved（unresolved-shared-membership） |
| `as:group:3020:encounter:30202:variant::slot:2:stage:420512:fixed:1:position:1:monster:203501202` | 2033022 | HP unresolved（unbound-summon-task） → unresolved（unresolved-shared-membership） |
| `as:group:3020:encounter:30203:variant::slot:2:stage:420513:fixed:1:position:1:monster:203501203` | 2033022 | HP unresolved（unbound-summon-task） → unresolved（unresolved-shared-membership） |
| `as:group:3020:encounter:30204:variant::slot:2:stage:420514:fixed:1:position:1:monster:203501204` | 2033022 | HP unresolved（unbound-summon-task） → unresolved（unresolved-shared-membership） |

双语四模式剔除 schema 及直接目标子记录后，预置数据与 Phase 2 摘要一致。双语搜索索引与源英语序列化分片的摘要一致。Endgame schema 为 29，manifest 为 78，搜索分片为 schema 4。

[共享生命值审阅](endgame-summon-shared-hp-review.md) · [速度与韧性实测方案](endgame-summon-stat-benchmarks.md) · [Phase 2 对照](endgame-summoned-enemy-aa-as-investigation.md)
