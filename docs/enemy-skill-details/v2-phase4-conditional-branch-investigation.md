# Enemy Skill Details V2 Phase 4A：窄条件分支调查

> 历史阶段记录：本文描述实施当时的模型与结论，不是当前实现规范。当前契约以 [规范架构文档](../architecture/localization-and-data-generation.md)、[V2 Phase 4 倍率候选报告](v2-phase4-multiplier-candidates-cleanup.md) 和 [UI Round 1 报告](ui-round1-information-hierarchy.md) 为准；历史测试、覆盖和文案记录不代表当前状态。

调查日期：2026-09-30。网站 `develop` (`106c8f3`)，只读上游 `TurnBasedGameData` (`6b2bc17ebf`)。本次只调查，不修改解析器、产品数据或 UI。下文数值是 `DamagePercentage` 的攻击力缩放输入，不是实战伤害。

## 1. Executive Summary

**结论：结构上存在值得支持的窄双分支，但现在不能把 `SuccessTaskList` / `FailedTaskList` 的运行时互斥、穷尽及回调必达视为已证明。建议暂不实施 Phase 4B，先取得 `PredicateTaskList` 的引擎语义或可复现的运行轨迹。** 上游 JSON 明确把一个 `Predicate`、一个 `SuccessTaskList` 和一个 `FailedTaskList` 放在同一 `RPG.GameCore.PredicateTaskList` 对象下，强烈支持二选一解释；但仓库不含执行这些 task 的解释器或规范，结构本身没有写明谓词失败、目标不存在、回调未触发时的调度结果。字段名称不能替代这个证明。

按现行具体 Monster–Skill 和 Ability 联接扫描，发现 720 个含成对分支内伤害的绑定、1,684 个分支点。收紧到一个伤害分支点、两侧同目标角色且所有值可解、无其他伤害及无分支内嵌套谓词/循环/改值/重定向，有 **84 个静态候选 / 19 个 Skill ID**；其中 82 个分支点位于顶层 `OnStart`，再只保留两侧**直接伤害任务**，得到 **52 个绑定 / 13 个 Skill ID**。这 52 个当前均无伤害行，若以后证明控制流、复核分支外非伤害任务并实施，完整构建期伤害覆盖可从 `2,908 / 588` 最多增加到 `2,960 / 601`（绑定 / 唯一 Skill ID）。这是**条件上界，不是已批准覆盖率**。52 个中只有 `401401803/805/809` 的两侧总值不同；其余主要解锁相同倍率的条件包裹伤害。

`401401801`、`401401802` 的数值分支本身清楚，但在投射物命中回调内；后者还在回调前重定向邻位目标。它们不能作为第一批可直接发布的完整技能总倍率证据。循环、嵌套条件、运行时改值、目标别名、跨 Ability 与零伤害分支仍须挡住。

## 2. Current Flow Model

现行 `enemy-skill-details.ts` 从 `MonsterTemplateConfig.JsonConfig` 读取 CharacterConfig，按同名及共享 Ability 路径收集文件，用 `SkillAbilityList[].AbilityList` 与 `SkillList[].EntryAbility` 联接名称；每个 `MonsterConfig.SkillList` 的具体绑定由 `effectiveSkillParams` 合成基础及覆盖参数。`enemy-skill-semantics.ts` 的 `tasksFor` 递归供概率、行动变化和两条特殊已审查技能使用；一般伤害走 `structuralDamageRows`。它遍历所有已联 Ability 寻找伤害，但只把**同一 Ability 的顶层 `OnStart[n]` 直接 `DamageByAttackProperty`**纳入线性和。任一同目标嵌套伤害、同目标跨 Ability、不可解值、未知目标、伤害前改值/重定向或循环/结束任务会阻断相应产出；未知目标会阻断整项。`201201002` 和 `406401207` 的专门规则不是通用分支许可。

值解析仅含固定值、直接 SkillParam `AQAR`、Phase 3 验证的单哈希乘固定值 `AQAAAAQR`。同路径用 `addDecimals` 精确求和；`normalizeEnemySkillTotals` 用十进制比较排序去重。现行 `damage[target].totals[]` 已能承载多个可能总值，但没有条件、路径、概率或跨目标关联。相关合成及真实 fixture 测试在 `tests/unit/enemy-skill-details.test.ts`；Phase 2/3 报告的安全门槛与当前代码一致。

## 3. Conditional Task Structures and What They Prove

实际伤害相关包装器是 `RPG.GameCore.PredicateTaskList`，有 `Predicate`、`SuccessTaskList`、`FailedTaskList`。例如 `Monster_W4_Nikadory_00_Skill02_Phase02.OnStart[5]` 的谓词是 `ByIsContainModifier`，两侧均为直接伤害，父级 `OnStart` 数组之后继续 `DamagePerformFinish`。`203401001` 的 `Monster_W2_LycanKing_00_Skill01_Phase02.OnStart[5]` 是相同包装器；`OnStart[3]` 另有仅控制特效的谓词，`[6]` 为 `DamagePerformFinish`、`[7]` 为 `SkillPerformFinish`。这证明非伤害谓词可在共同前缀，且外层有顺序兄弟任务；不证明运行时必然执行每个兄弟任务。

同一包装器也可嵌在 `FireProjectile.OnProjectileHit[]`、`Retarget.TaskList[]`、`LoopTargetList` 和另一个 `SuccessTaskList` 内。`Predicate` 常为 `ByIsContainModifier`、`ByCompareDynamicValue` 等读取形状；就检查过的首批样本，谓词对象没有可执行 task list。但类型名称与 JSON 结构只支持“设计意图为真/假两臂”的推断。**缺少引擎解释器/规范，无法单从 JSON 排除谓词求值异常、目标不存在、父 task 不执行、命中回调不触发，或 `FailedTaskList` 并非所有未成功路径的回退。** 因而不能宣称“一定且只执行一侧”。即使二臂语义得到确认，也只适用于包装器实际被调用时；回调是否发生是另一层条件。

静态证明应区分三件事：① 一个已执行的 `PredicateTaskList` 是否恰好选择一臂；② 所在 `OnStart` 兄弟任务是否正常顺序执行；③ 所在 callback / 父 task 是否在该技能的每次有关执行中到达。当前 Phase 2 仅在很窄的顶层线性路径上接受②；Phase 4B 不应把①误当成②或③。

## 4. `4014018 / 401401801` Full Trace

具体 Monster `4014018`，Skill `401401801`（**曾为苍穹的雷枪**），trigger `Skill01`，CharacterConfig `Monster_W4_Nikadory_00_Config_FT.json`；`SkillAbilityList` 联到 `Skill01_Phase01`、`Skill01_Phase02`、Camera 及 FT 插入 Ability，入口为 `Skill01_Phase01`。入口 `OnStart[0]` 明确 `TriggerAbility` 至 `Monster_W4_Nikadory_00_Skill01_Phase02`。伤害在该 Phase02 的 `OnStart[5] FireProjectile / OnProjectileHit[0] PredicateTaskList`，谓词为 `ByIsContainModifier(Caster, MMonster_W4_Nikadory_00_FT_SpecialAction)`。

`SuccessTaskList[0]` 唯一伤害指向 `AbilityTargetEntity`，`AQAR` 哈希 `-335668838` → `Skill01[1]=1.2`；`FailedTaskList[0]` 同目标，哈希 `-1126825319` → `Skill01[0]=2.4`。回调的 `[1]` 是 `DamagePerformFinish`、`[2]` 为镜头任务。Phase02 中未发现其他伤害任务；`OnStart[0]` 和 `[7]` 还有只做 `AddGlobalDynamicOffset` 的谓词，`[8]` 为 `SkillPerformFinish`。该伤害点之前无本 Ability 的伤害、动态伤害改值或重定向；两臂也无循环、嵌套 task、提前结束或改值。

**条件结论**：若这一投射物恰好命中并调用一次 `OnProjectileHit`，且包装器确实恰选一臂，那么本次命中主目标的候选集合是 `['1.2','2.4']`。但 `FireProjectile` 的回调可否跳过、投射物目标失败时如何处理，不在结构中获证；`['1.2','2.4']` 不能直接称为完整的**整次技能**结果集。第一批顶层 `OnStart` 规则应拒绝该样本，诊断为回调边界未证，而非值未解析。

## 5. `4014018 / 401401802` Multi-target Trace

Monster `4014018`，Skill `401401802`（**撕裂大地的脊髓**），trigger `Skill11`，同一 FT CharacterConfig；入口 `Skill11_Phase01.OnStart[0]` 触发 `Monster_W4_Nikadory_00_Skill11_Phase02`。分支位于 `Phase02.OnStart[11] FireProjectile / OnProjectileHit[0] PredicateTaskList`，仍检查施术者 `MMonster_W4_Nikadory_00_FT_SpecialAction`。Success `[0],[1]` 分别是主目标 `1.1`（`Skill11[2]`）和邻位 `0.9`（`Skill11[3]`）；Failed `[0],[1]` 为主 `2.2`（`Skill11[0]`）、邻 `1.8`（`Skill11[1]`）。四个值均由 `AQAR` 直接解析。回调之后只有伤害结束/镜头任务；整个已联 Ability 的伤害搜索未见其他伤害。

条件成立时，按目标独立投影可写主 `['1.1','2.2']`、邻 `['0.9','1.8']`，绝不能把主邻相加。**当前仍须拒绝**：`Phase02.OnStart[5],[6]` 有左/右 `Retarget`，`[8]` 对 `AbilityTargetAdjoinEntity` 重定向并在 `TaskList` 加标记及发射投射物，`[9]` 又可能重定向另一个邻位；这些任务在 `[11]` 之前，邻位别名及目标集不再有静态稳定性证明。且 `[11]` 的伤害在命中回调内，回调必达/次数未证。不能用四个可解值掩盖目标与 callback 问题。

## 6. Incomplete Branch Negative Fixture

Monster `4014012`，Skill `401401201`（同名 **曾为苍穹的雷枪**），trigger `Skill01`，CharacterConfig 为 `Monster_W4_Nikadory_00_Config_WithHearse.json`。它联到同一 Ability 文件；`Skill01_Phase02.OnStart[5]/OnProjectileHit[0]` 的 Success 主目标读 `AQAR` 哈希 `-335668838`，Failed 主目标读 `-1126825319` → `Skill01[0]=2.2`。**在这个 CharacterConfig 的 `DynamicValues.Floats` 中，Success 哈希缺失**；这比先前报告所称“运行时动态值”更精确：当前 resolver 无法静态解析，而不是已证明运行时会生成哪个倍率。故发布 `['2.2']` 会把一个未解的可达结果藏掉。即使将来证明回调和二臂控制流，本绑定仍须拒绝主目标行。

## 7. Common Prefix / Suffix

在成对且含伤害的分支点中，简单按同一 Ability 的顶层 `OnStart` 索引查找**分支外直接伤害**，发现前缀 13 个分支点、后缀 3 个；未找到同一单分支样本同时有直接前缀和直接后缀。这些不是已证的可相加路径：`1023021/102302111` 的 `Monster_W1_Mecha03_01_Skill11_Phase02.OnStart[7]` 有全体 `1`，`[10]` 的 Success 有全体 `1`、Failed 无伤害，但 `[9]` 和 `[11]` 另有条件伤害；`8024010/802401006` 在 `Skill06_Phase02.OnStart[13]` 的复杂分支后有 `[19]` 全体伤害，分支内还使用 `ParamEntity`。这些都不适合作首批共同前后缀证明。

将来若获得调度语义，内部可以对每条路径累加 `prefix + branch + suffix`，无需通用控制流引擎；首批建议要求**所显示目标的完整伤害路径都在一个直接双臂分支内**，不做前后缀组合。数值收益上，收紧至此仍有 52 个静态候选。

## 8. Zero-damage Branch

一侧无伤害不自动等于整个技能的零伤害。扫描有 247 个仅一侧含伤害的分支点（41 个绑定），其中 229 个分支点的已有伤害值可解；但许多还有其他分支/前后伤害。`1023021/102302111.OnStart[10]` 的 Failed 空臂可局部贡献零，却已有 `[7]` 全体伤害及 `[9],[11]` 条件伤害。`4015021/401502104` 的 `Skill04_B_Phase02.OnStart[6]` Success 无伤害、Failed 有十条全体伤害，但这是含 `StopTimeline`/QTE 任务且伤害值未解析的路径。

产品建议：若未来确证一臂是合法无伤害执行结果，且整条技能路径没有共同伤害，该目标的可能集合应包含 `0`，如 `['0','3']`；省略零会暗示伤害必然发生。但当前标题“伤害倍率”未解释零/条件，多值展示可能令人困惑。Phase 4B 首批可拒绝零臂，待文案明确后再支持；不能静默丢掉零臂。

## 9. Target Roles and Correlation

成对且两侧均有伤害的 1,437 个分支点中，1,291 个两侧角色集合相同，146 个不同。不同角色的真实例子 `8003010/800301004`：`Monster_XP_Elite01_01_Skill04_Phase02.OnStart[7]` 的 Success 投射物命中回调伤害目标是 `AbilityTargetEntity`，Failed 是 `ProjectileHitEntity`；后者是现行不支持的别名，且两臂都嵌 callback，不能分别输出主目标和未知角色。`3021032/302103201.OnStart[5]` 的 Success 包含 `ParamEntity` 与 `AllEnemy`，Failed 仅 `ParamEntity`，还涉及循环/重定向。这说明“各角色各有可能 totals”不能代表该角色某些路径上完全缺席，更不能把未知别名假定为零。

同角色集合也会丢失**跨角色配对**：`401401802` 若日后满足控制流与邻位目标证明，主 `1.1/2.2` 分别与邻 `0.9/1.8` 同时出现；V2 两行无法编码配对。对静态说明，这个信息损失在官方技能描述清晰解释条件、UI 明确称“可能的倍率”且用户不需从两行自由组合时可以接受；但当前 UI 没有路径/配对提示。首批保守规则可优先单角色分支；多角色同集合样本需产品审阅，角色集合不同者拒绝。无需增加条件 AST 或 schema 字段。

## 10. Nested, Loop, Mutation, Exit and Callback Findings

以下为**分支点 / 去重绑定**，类别重叠，且嵌套分支可同时计父子节点；不是可相加的失败分桶：

| 结构 | 数量 | 实例及影响 |
| --- | ---: | --- |
| 分支臂内再有 `PredicateTaskList` | 682 / 233 | `3014020/301402005` 的 `Skill05_Phase02.OnStart[33]` Failed 内再分支，路径数不能视为二 |
| 分支臂内 Loop / loop-like | 51 / 45 | `8003050/800305004` 的 `Skill05_Phase02.OnStart[13]` 含 `LoopTargetList`、`GoNextTargetInList`；次数/目标分配未证 |
| 分支臂内动态值相关任务或 `Retarget` | 761 / 261 | `3014020/301402005.OnStart[33]` 含 `SetDynamicValueByAddValue`；此外首批候选还须检查**分支前**改值/重定向 |
| 分支臂内潜在结束/中断类 | 23 / 23 | `4015021/401502104.OnStart[6]` 含 `StopTimeline`；`2034014/203401403.OnStart[5]` 含 `ForceKill` |
| 分支含不可解伤害值 | 305 / 218 | `4014012/401401201` 缺哈希；`3013012/301301204` 有未支持 `AQABAQQR` |
| 分支含不支持目标 | 1,046 / 322 | `8003010/800301004` 的 `ProjectileHitEntity`；不可扩充别名映射 |

`4014018/401401806` 的 `Skill13_Phase02.OnStart[9]` 每臂有五次 `AllEnemy` 直接伤害，中间是 `WaitAnimState` / `RemoveEffect`；Success 五次 `1.6` 候选和为 `8`，Failed 五次 `3.2` 候选和为 `16`。它表明 Phase 2 线性求和可在两臂复用，但非纯伤害任务的先后效果仍需审查，第一批 52 个直接伤害候选未包含它。跨 Ability 反例仍是 `4064012/406401204`：Phase02 七次 `6`，Phase03 另一次 `6`，联接名称集合不足以证明相加或二选一。

回调边界必须保留：`OnStart`、`OnProjectileHit`、`OnHit` 不是自动连续的一条路径。首批只接受同一 Ability 的顶层 `OnStart` 谓词；任何分支伤害落在 `FireProjectile.OnProjectileHit` 等 callback 中都需要独立的必达、次数和目标证明。`SkillPerformFinish` 出现在分支之后时，不能无条件视作会跳过前面的已执行伤害；若出现在路径中或在共同后缀前，则应拒绝路径合成。

## 11. Quantitative Scan and Coverage

临时只读扫描复刻 `buildEnemySkillDetails` 的模板 CharacterConfig、同名/共享 Ability 文件、具体 `MonsterConfig.SkillList`、trigger 的 `SkillAbilityList`/`EntryAbility` 联接；按 `(MonsterID, SkillID)` 去重，用具体覆盖参数与现行三种值形状解析。仅计已联 Ability 内**同一个 `PredicateTaskList` 同时存在 Success 与 Failed 键、且至少一臂有 `DamageByAttackProperty`**的节点。`TaskListTemplate` 中未证明会实例化的节点也被宽扫计入；嵌套父子分别计数。因此宽扫是配置出现次数，不是可达执行次数。扫描的可检查具体绑定全集为 11,747；旧 redesign 文档的 13,219 是不同、更宽的历史扫描口径；Phase 2/3 页面可达全集为 11,645，不能直接与这里相减。

| 指标 | 当前结果 |
| --- | ---: |
| 含候选结构的绑定 / 唯一 Skill ID / 分支点 | 720 / 197 / 1,684 |
| 两侧均有伤害 / 仅一侧有伤害 | 1,437 / 247 分支点 |
| 两侧同角色集合 / 不同集合 | 1,291 / 393 分支点；后者含 247 个单侧伤害点 |
| 分支外仍有其他伤害 | 1,308 分支点 / 413 绑定 |
| 全部值可解、同角色集合、单一伤害分支点、无分支外伤害、无分支内嵌套/循环/改值/重定向等列举的阻断项 | 84 绑定 / 19 Skill ID |
| 上一行中顶层 `OnStart` / 再限两侧直接伤害任务 | 82 / **52** 绑定；后者 13 Skill ID |
| 52 个中两侧不同总值 / 相同总值 | 3 / 49 绑定 |

旧“90 个”来自 redesign 阶段的 78 单任务加 12 分支多任务的**宽松设计候选**。本次 84 的入口与排除条件更严格（尤其要求无分支外伤害、目标集合相同、无列举的内部阻断项），故不是数据回退，也不能把差额 6 精确归因于 Phase 3；旧临时脚本已不存在。两次扫描都发现 Nikadory FT 的六个不同值绑定，其中本次首批纯顶层集合只含三个。Phase 3 的 `AQAAAAQR` 在宽扫的 70 个分支点 / 57 个绑定中出现，70 个点的现有伤害值均可解；**没有一个进入这 84 个窄候选**，所以该表达式支持并未提升首批分支覆盖。

现行 `buildEnemySkillDetails` 重新运行得到完整 domain 伤害 2,908 绑定 / 588 Skill ID，详情共 3,571 绑定。52 个首批静态候选逐项与当前输出比对，均未输出伤害，13 个 Skill ID 也不在现有伤害 ID 集合。若控制流得到证实，52/13 是该最窄规则的净增上界；82/17 是容许分支内非伤害任务的下一层上界；84/19 再含两个 callback 样本。这些不是当前可上线数字。

## 12. Representative Static Shortlist

下表“完整”仅指**配置伤害任务穷举**：整个已联 Ability 的伤害搜索只见所列两臂，没有遗漏的其他伤害；仍受第 3 节运行语义缺口约束。名称来自本地 pinned 中文 TextMap。

| Monster / Skill（名称） | Ability 与分支 | Success → Failed，按目标 | 静态判断 |
| --- | --- | --- | --- |
| `2034010/203401001` 碎剑为牙 | `Monster_W2_LycanKing_00_Skill01_Phase02.OnStart[5]` | 主 `2 → 2` | `ByIsContainModifier`；两臂各一条直接伤害，无其他伤害；`[3]` 仅特效条件 |
| `2034010/203401002` 斩铁成爪 | 同族 `Skill02_Phase02.OnStart[5]` | 主 `1.8 → 1.8`；邻 `1.5 → 1.5` | 四条直接伤害，角色集合相同，分支外无伤害；`[3]` 仅特效条件 |
| `4014018/401401803` 劈断冥河的湍流 | `Monster_W4_Nikadory_00_Skill02_Phase02.OnStart[5]` | 主 `1.8 → 3.6` | 同一 `ByIsContainModifier` 的双臂各一条；`[0],[17],[18]` 为不含伤害的其他谓词 |
| `4014018/401401805` 那战火漫无边际 | 同族 `Skill03_Phase02.OnStart[9]` | 全体 `1.4 → 2.8` | 目标同为 `AllEnemy`，双臂值可解，分支外无伤害 |
| `4014018/401401809` 不磨不灭的灾厄 | 同族 `Skill05_Phase02.OnStart[11]` | 全体 `0.4 → 0.8` | 同上，且无分支内循环/改值 |
| `5012030/501203001` 读或死！ | `Monster_W5_JK_00_Skill01_Phase02.OnStart[5]` | 主 `2.5 → 2.5` | 另有不含伤害的特效谓词；唯一伤害在此双臂 |
| `8003050/800305001` 巡风光陨 | `Monster_AML_Elite01_01_Skill01_Phase02.OnStart[8]` | 主 `3 → 3` | 分支前投射物任务没有伤害 callback；唯一伤害为双臂直接任务 |
| `8015030/801503002` 讥讽的目光 | `Monster_W5_AsatPramad_00_Skill02_Phase02.OnStart[5]` | 主 `3.5 → 3.5` | `ByCompareDynamicValue`，前方有非伤害谓词；唯一伤害在此双臂 |

这些至少涵盖五个敌人家族。相同值分支未来应投影成一个总值，例如 `2 → 2` 输出 `['2']`；`normalizeEnemySkillTotals` 已能十进制去重。未列出的 52 个多为同一 Skill 的具体 Monster 变体，不能按绑定数量误称独立机制。

## 13. Representative Correct Rejections

| 原因 | 精确样本 |
| --- | --- |
| 未解分支 | `4014012/401401201`，`Skill01_Phase02.OnStart[5]/OnProjectileHit[0]` Success 哈希缺失、Failed `2.2`；不能只输出 `2.2` |
| 回调 + 重定向 | `4014018/401401802`，`Skill11_Phase02.OnStart[11]/OnProjectileHit[0]` 四个值可解，但 `[5],[6],[8],[9]` 已重定向邻位/投射物 |
| 嵌套谓词/运行时改值 | `3014020/301402005`，`Skill05_Phase02.OnStart[33]` 的 Failed 内再分支，含 `SetDynamicValueByAddValue` |
| 循环 | `8003050/800305004`，`Skill05_Phase02.OnStart[13]` 含 `LoopTargetList` / `GoNextTargetInList` |
| 不支持表达式/目标 | `3013012/301301204` 的深层 `Skill07_Phase02_IF.OnStart[10]/TaskList[3]` 使用 `AQABAQQR` 且目标 `ParamEntity`；`8003010/800301004` Failed 用 `ProjectileHitEntity` |
| 零臂/多分支 | `1023021/102302111` 的 `Skill11_Phase02.OnStart[10]` Failed 无伤害，前后另有伤害条件，不可局部丢零 |
| 提前结束/QTE | `4015021/401502104` 的 `Skill04_B_Phase02.OnStart[6]` 含 `StopTimeline`，Failed 十条值未解的全体伤害 |
| 跨 Ability | `4064012/406401204` Phase02 七击、Phase03 一击，不能凭联接集合推断执行关系 |

## 14. Proposed First-production Structural Rule

**以下是未来实现的候选规则，须先补足二臂调度证据：**一个具体绑定中，对拟显示的每个目标，所有已联 Ability 的可达伤害必须归于同一个 Ability 的一个顶层 `OnStart[n] PredicateTaskList`；该节点有且只有一个 Success 数组及一个 Failed 数组，每臂至少一条直接 `DamageByAttackProperty`，其余分支内 task 初版不接受；谓词只采用经证实为纯读取的类型。两臂角色集合相同、目标别名在现行映射内，每个值由现行 resolver 可解、非负。整个伤害路径无别的 callback、分支伤害、循环、动态值写入、目标重定向、提前结束或未知 task 对伤害/目标的影响；不跨 Ability 相加。其他**不含伤害**的谓词仍须检查其前后副作用，不能因“不含伤害”自动忽略。任何一臂无法证明即不产出该目标完整集合。

若正式证明所有合格谓词确实是纯布尔并恰好选择一臂，解析器**不必解释条件的业务含义**（例如是否持有某 modifier），只需知道真/假两臂是穷尽替代。若引擎对缺失目标/求值错误有第三种调度或跳过整节点，必须另行纳入零路径或拒绝该包装器。

## 15. Proposed Internal Parser Design

在取得语义证据后，最小改法是为伤害解析增加专用窄分支提取器，而不是让现有 `tasksFor` 的 `conditional` 布尔值承担路径语义。`tasksFor` 当前会递归 flatten `SuccessTaskList`、`FailedTaskList` 和 `TaskList`，适合查找 Chance，无法表示二选一或兄弟执行顺序。提取器先基于 `structuralDamageRows` 的已联 Ability 搜索确认**所有**伤害位置及互斥门槛，再对两臂分别复用值解析、角色映射、精确加法与 `normalizeEnemySkillTotals`。只有通过验证后才投影到产品 `target/totals/scaling`。

将来扩展前缀/后缀时可在构建期使用 `DamagePath = Map<Target, DecimalString>` 和两个路径状态：线性任务累加一个状态，二臂复制状态，合流时对每个目标收集去重总值。但首批 52 个只需专用 extractor；无需泛化 VM 或把 `Predicate`、分支名称写入生成数据。诊断可用 `damage-conditional-nested`、`-incomplete`、`-loop`、`-runtime-mutation`、`-unsupported-target`、`-unresolved-value`、`-cross-context`、`-callback-unproven`、`-zero-ambiguous` 等构建期原因，保持产品数据干净。

## 16. Complete-result Policy

继续维持**按目标角色完整穷举所有在支持模型下可达的总值**。一臂未知时，该目标整行缺席；另一完全独立且两臂均获证的角色可以保留，但未知目标别名可能重叠任一角色时整项缺席。`401401201` 因此不能展示 220%。一臂合法零伤害必须作为路径存在；首批可以拒绝零臂而非误报非零值。两臂相同值按十进制等值折叠。当前产品不显示“仅已知部分”，无需加标记。

## 17. Product and UI Implications

产品 schema 无需新增字段；`EnemySkillDetail.svelte` 已遍历 `damage.totals`，`formatEnemySkillTotals` 可格式化多值。现行中文标题是“伤害倍率”，英文为 “Damage Multiplier”，多值行仅用分隔数值且不解释对应条件。未来若发布多值，建议标题改为“可能的伤害倍率”或加简短说明；零值与多角色关联尤其需要产品审阅。官方描述仍解释条件，数值事实不附 raw 条件、概率、击数或执行路径。本调查不改 UI/消息。

## 18. Future Test Matrix

语义证据到位后，先用合成配置覆盖：不同值双臂；相同值去重；同/异角色集合；双臂内部多击；一臂不可解则目标省略；合法零臂；嵌套、循环、`SetDynamicValue`/`SetDynamicValueByAddValue`、`Retarget`、提前结束及 callback 拒绝；跨 Ability 拒绝；具体 Monster 参数覆盖；安全分支内 `AQAAAAQR`；一个目标完整、另一个未知时的按目标省略；未知目标别名整项阻断。真实回归需至少包含 `401401803/805/809`、相同值的 LycanKing/JK/AML、`401401801/802/201`、`406401204` 与 `800305004`。不要把未证明的回调 fixture 写成正例。

## 19. Implementation Recommendation

**Do not implement yet; more control-flow evidence is required.** 缺口是 `PredicateTaskList` 已执行时是否恰好执行一臂，以及顶层兄弟调度与命中 callback 的必达/次数语义；当前只有配置结构，没有引擎执行定义。先取得上游引擎规范、对应反编译执行逻辑，或可重复的真实运行 trace，至少验证 `ByIsContainModifier` 与 `ByCompareDynamicValue` 在代表技能上的真/假、空目标、失败和提前结束路径。证实后优先按第 14 节的 52 绑定窄规则实施 Phase 4B；`401401801/802` 等回调和重定向样本继续单独调查。
