# Enemy Skill Details V2：精简模型与伤害总倍率调查

调查日期：2026-09-29。网站 `develop`、上游 `TurnBasedGameData` `6b2bc17ebf`。本报告只设计 V2，不改变 V1 解析、生成数据或页面。下文的倍率是 `DamageByAttackProperty.AttackProperty.DamagePercentage` 的 ATK 缩放输入，不是最终实战伤害。先前调查与 Phase 1/2A/2B/2C 报告已核对；以当前代码和本地数据为准。

## 1. Executive Summary

V2 精简可行。结构化详情只补充官方描述中的**数值**：目标角色对应的单次技能执行**总倍率**、配置基础概率、行动提前/延后百分比。官方描述继续解释条件、阶段、召唤、状态行为和攻击顺序。V1 的 Bounce 次数、回合期限、技能内召唤卡、DoT 触发/清除及无数值状态块可从技能详情链移除；已有的具体 Monster binding、官方描述、主页面召唤区和行动变化仍保留。

本地静态分析证明大量伤害可进一步建模，但“任务树里有多个数值”不等于“可相加”。13,219 个具体 Monster–Skill 绑定中，1,885 个具有单个可解的顶层伤害任务；同一 Ability 顶层还发现 415 个仅需按目标分行、372 个有重复目标任务可作为顺序求和候选。另有 397 个绑定的顶层多击使用一个固定值加一个 SkillParam 哈希的 `AQAAAAQR` 表达式形状，Kafka 两击是其中的关键样本。互斥 `SuccessTaskList`/`FailedTaskList` 窄模式有 90 个候选，其中 6 个出现不同的分支总值。**这些都是设计候选数，不是已批准的生产覆盖率**；尤其表达式操作符、阶段 Ability 的执行关系和早退/运行时改值必须先验证。378 个绑定含循环内伤害，本次没有证明可安全发布的循环总倍率。

建议 V2 使用“每目标的一组**完整、可证明的可能总值**”模型，严格区分同一路径求和与互斥路径列举。若某目标存在无法解析的可达分支，就不把已知分支伪装成完整总值集。`VERIFIED_DAMAGE_SKILLS` 最终可由结构证明替代，但不能直接删掉并采用 Phase 2C 的 2,542 个 dry-run 输出。

## 2. Current V1 Model

`src/lib/domain/neutral.ts:236` 的 `EnemySkillDetailDomain` 包含 `damage[{target,ratio,scaling}]`、`bounce.count`、带身份/类别/目标/概率/期限的 `statuses`、`actionShifts`、DoT `effects` 和 `summons`。`scripts/data/enemy-skill-semantics.ts` 的 `damageRows` 拒绝同一 Ability 对同一角色的重复伤害；`VERIFIED_DAMAGE_SKILLS` 另限制 14 个 Skill ID。状态必须经 `MonsterStatusConfig.ModifierName` 映射，故 Kafka `MCommon_MindControl` 的 `Chance=1.2` 不输出。`enemy-skill-params.ts` 只解固定值或单哈希 `AQAR` 直读 SkillParam。

`enemy-skill-details.ts` 用具体 `MonsterConfig` 的 `OverrideSkillParams` 构建 binding；`scripts/data/domain/enemy.ts:225` 附上 detail，`projection/enemy.ts:299` 本地化状态/召唤，`src/lib/domain/enemy-view.ts:150,189` 形成页模型，`EnemySkillDetail.svelte` 显示事实。**这条具体 Monster binding 所有权必须保留**：`100203001` 在 `1002030/100203026` 分别读到 `1.3/1`，`403501001` 在 `4035010/403501001` 分别读到 `4.5/4`。

Phase 2C 的基线是 13,219 绑定、3,562 唯一 Skill ID；V1 有任一 detail 的绑定 3,189，伤害 227、基础概率 521、行动变化 238、期限 8、候选召唤 31、Bounce 6、DoT 4。数字按绑定统计，字段可重叠。该报告的 2,384 个“严格候选”是**V1 中额外未输出伤害**的静态子集，并不等价于 V2 的总倍率证明。

## 3. Revised Product Semantics

一个 `damage` 值表示**一次可能执行结果中，一个目标角色受到的该技能总 ATK 倍率**，不是某次击打的倍率。相同目标同一路径的顺序伤害求和；不同目标角色分别列行；互斥路径产生多个可能总值，不把分支相加，也不把条件 AST 给 UI。多值列表只承诺“已证实且完整的可能总值集”，不承诺实际触发概率。基础概率是 `AddModifier.Chance` 的配置输入，不是最终命中率；即使没有稳定 Status ID，也可独立显示。行动变化继续使用现行 `{kind,ratio}` 正数语义，`0.5` 延后显示 50%、`-1` 提前显示 100%。

状态名字/类别、自身 Buff、召唤和机制解释原则上由官方文案负责。V2 不显示期限、技能内召唤、Bounce 次数、DoT 触发/清除、韧性数值、条件或击数。`EnemySkillBrowser` 的 Monster/阶段/技能选择与 `SkillExtraEffects` 官方说明仍有独立用途。

## 4. Damage Execution Model Findings

`CharacterConfig.SkillAbilityList[].AbilityList` 与 `SkillList[].EntryAbility` 给出**可联的 Ability 名称集合**，并未证明该集合按数组顺序逐个执行。Ability 内 `OnStart[]` 则是有序任务数组。Kafka `Monster_W2_Kafka_00_Skill01_Phase02.OnStart[4],[7]` 各有一条主目标伤害，之间是镜头/动画任务；`Skill02_Phase02.OnStart[9],[13],[17]` 是三个主目标任务，`[18]` 是邻位任务。`4064012` 的 `Skill04_Phase02.OnStart[5,7,9,11,13,15,17]` 有七条同目标伤害，而 `Skill04_Phase03.OnStart[5]` 另有一条；两个 Ability 都在联接集合中，**不能无证把 7+1 合计**。`Skill05_Phase02.OnStart[4,6,8]` 则在同一 Ability 中有三个全体伤害任务。

分支结构可见：`4014018/401401801` 的同一 `OnProjectileHit` 节点，`SuccessTaskList` 为 `1.2`、`FailedTaskList` 为 `2.4`，两者是候选替代总值而非 `3.6`。`4014018/401401802` 的两侧分支各自有主/邻位任务，必须**先在分支内按角色计算**，再把每个角色的结果列为可能总值。`PredicateTaskList` 可嵌在 `OnStart` 或命中回调中，`TaskList` 也可属于循环、重定向或一般任务组；仅凭键名递归 flatten 会把备选路径混成一条。`SkillPerformFinish`、阶段触发、条件执行及运行时 `SetDynamicValue` 需用允许的静态结构逐种证明；本任务不设计完整 Ability VM。

循环见 `Monster_W4_Nikadory_00_Skill04_Phase02`：`OnStart[13]` 依 `MMonster_W4_Nikadory_00_FT_SpecialAction` 在两个 `SetDynamicValue(Skill04Damage)` 值间选择；`[14]` 先循环 1 次，`[15]` 设置剩余次数，`[16]` 按动态 `Skill04Count` 循环，内部 `Retarget` 可失败后重选。每弹伤害任务读 `ParamEntity` 的动态键。Phase 1 的 5/10 次 fixture 可作为内部线索，但目前不能把普通分支 `5×0.9` 无条件标成目标所受 450%，更不能忽略特殊行动或随机分配目标。

## 5. Multi-hit Aggregation

| 类别 | 实例与静态计算方向 | 决策边界 |
| --- | --- | --- |
| A 单个任务 | `1022010/102201001`：`Skill01.p0=3` → 主目标总 `3` | 单个顶层可解任务，可直接作为总值，仍要排除其他可达伤害路径 |
| B 同一路径顺序击打 | Kafka `200401001`：同一 `OnStart` 两个 `0.5×2.5`，**若 `AQAAAAQR` 确认乘法且无改值/跳过**，两次各 `1.25`，总 `2.5` | 两条任务不是两个可能结果；先验算表达式和执行路径 |
| B 同一路径顺序击打 | Kafka `200401002`：三条主目标 `3`、一条邻位 `2`，候选总值主 `9`、邻 `2`；`406401205` 三条全体 `3.5`，候选 `10.5` | 都是同一 Phase02 的顶层 `OnStart`，但需检查早退/重定向及每击目标是否持续一致 |
| C 不同目标角色 | `1002030/100203001`：主 `1.3`、邻 `1`；横扫 `401301001` 三个位置各 `2.8` | 绝不能跨目标相加；横扫应显示每个命中目标的总值 |
| D 互斥分支 | `4014018/401401801`：成功 `1.2`、失败 `2.4` | 两个可能总值，不相加 |
| E 分支内多击 | `4014018/401401802`：成功主/邻 `1.1/0.9`，失败主/邻 `2.2/1.8` | 分别产生主 `[1.1,2.2]`、邻 `[0.9,1.8]`；不把主邻合成单个数 |
| F 复合运行时公式 | `4013010/401301004` 的多哈希 `AQABAQECBAIBAwUR` 依吸收数量/分摊变化 | 无有限、已证完整常数集，继续省略 |
| G 循环/弹射 | `401401207/208` 有 5/10 次线索、动态每击倍率及随机目标 | V2 不设 Bounce UI；未证最终总值时不输出伤害 |

`406401204` 的 Phase02 七次 `6` 可形成该 Ability 内的 `42` **条件候选**；Phase03 的另一次 `6` 是单独 Ability，需先证明二者是备选、续接还是其他场景，不能发布 `42`、`48` 或 `[42,6]` 中任一结论。V2 只改变最终显示语义，不降低这一步证明要求。

## 6. Conditional Outcome Aggregation

建议构建期维护小型、仅用于证明的“路径 → 每目标精确十进制和”状态，而生产 schema 只存去重后的 totals。遇到可证互斥的 `SuccessTaskList`/`FailedTaskList`，复制进入分支，各分支内部按顺序求和，合流时对同一目标收集两个总值。只有当两个分支的所有可达伤害任务和目标均已解析、且没有未知早退/运行时改值，才认为结果集完整。共同前缀伤害应先计入两条路径；不同 Ability/阶段不能默认求和或视为互斥。

这并不要求把条件本身建模到产品数据。`4014018/401401801` 可概念化为主目标 `['1.2','2.4']`；`4014012/401401201` 则一侧 `2.2`，另一侧读无法从 SkillParam 静态确定的动态键，不能只发布 `2.2`。分支的目标角色可能不同或某分支没有伤害；若缺席分支是合法零伤害结果，不能静默删除零或把别的分支冒充普遍值。建议第一批只支持单层成对、可证明穷尽的分支，嵌套谓词和循环组合延后。

## 7. Expression Requirements

当前 `resolveSkillValue` 对固定值或 `AQAR` 单哈希直读 `SkillParam` 成功。临时遍历已联 Ability 的伤害任务，按**任务出现次数**统计 `AQAR` 10,755、`AQAAAAQR` 2,880、固定值 33；541 条没有可识别倍率对象。`AQAAAAQR` 中一固定值＋一哈希形状涉及 697 个具体绑定、118 个 Skill ID；其中 397 个绑定的全部伤害任务位于同一 Ability 顶层、目标可映射、每个哈希可直读 SkillParam，且至少一条任务使用该表达式。它们是验证一个有界“参数×常量”运算后可进一步评估的**新增候选**。Kafka `200401001` 的 `2.5` 与 `0.5` 两次击打支持乘法解释，但仅靠一个样本不能把 opaque `OpCodes` 当成通用运算符规范。

其他观察到的伤害 opcode 包括 `AAABAAQR`（110 条）、`AQAAAAUR`（83 条）、`AQABAQQR`（101 条）及多哈希 `AQABAQECBAIBAwUR`（14 条）；它们可能对应加减/乘法/运行时值组合，但当前仓库没有运算符解码器，**没有可核实的增量绑定数**。建议第一阶段只接收固定值和 `AQAR`，第二阶段用 Kafka 与反例 fixture 验证 `AQAAAAQR` 的精确操作数顺序与乘法，再考虑单参数加/减常量。多哈希、非 `SkillParam` ReadInfo、动态键、分摊和运行时状态保持 unresolved。`scripts/data/decimal.ts` 已有无损 `addDecimals`、`multiplyDecimals`、`compareDecimals`；将来求和/去重可复用，不能用 JS 浮点数生成产品倍率。

## 8. Target-Role Review

| V1 角色或上游别名 | V2 建议 | 理由 |
| --- | --- | --- |
| `primary` / `AbilityTargetEntity` | 保留 | 对单体与扩散主目标有用 |
| `adjacent` / `AbilityTargetAdjoinEntity` | 保留 | 不可与主目标相加 |
| `all` / `AllEnemy` | 保留，注明施术者视角 | 指敌人技能命中的玩家侧全体；具体召唤物覆盖需核验 |
| `each-swept` / 左、中、右目标 | 保留或更名 `each-swept-target` | 三个位置各 `2.8` 不等于单目标 `8.4`，也不等于全体 |
| `enemy-ally` / `AllTeammate` | 保留语义，考虑更名 `enemy-side` | `201201002` 死亡时伤害施术者一侧，不能标作普通玩家目标 |
| `marked` / `other-marked` | 保留 | `406401207` 有 `12/4` 两种角色；合并会丢失数值意义 |
| `self` | 不进入 V2 伤害角色；状态目标仅内部判断 | 自身无数值状态块不应单独显示 |
| `AllLightTeam` | **待验证映射**，不能仅凭名称直接并入 `all` | `403501002` 官方文案是全体，Ability 有三条此目标任务；需核对队伍/召唤物范围及每条是否命中同一对象 |
| `ParamEntity`、`AllTeamMember`、`ProjectileHitEntity` | 继续未映射，按具体任务调查 | 目标依赖重定向或上下文；简化产品模型不能替代语义证明 |

V2 可把名字从 `EnemySkillTarget` 改为 `EnemySkillDamageTarget`，与概率应用目标分开；`self` 不属于伤害 totals。无证目标不输出总倍率。

## 9. Base Chance / Status Simplification

身份不再是 Chance 的必要条件。`2004010/200401004` 的 `MCommon_MindControl.Chance=1.2` 与 `200401001` 的 `MCommon_DOT_Electric.Chance=1` 都可直接求得，V1 因缺稳定 ST 映射整条跳过；V2 应可显示 120% / 100% 配置基础概率。`1002040/100204001` 有稳定 `210010101` 与 `Chance=1`，可保留身份用于区分。`3003051/300305101` 对两个稳定状态各有 `Chance=1`，若 UI 只需数字可合并为一次“基础概率 100%”，但不能由此推断两个状态同时施加；官方文案保留“或”。

**不能简单采用 `baseChances: DecimalString[]` 作为唯一模型。** `3003013/300301301` 同一技能对主/邻位施加灼烧 `0.8` 与减速 `0.5`；`300301302` 对全体分别是减速 `0.5`、灼烧 `1`。本地扫描发现 39 个绑定至少有两种可解 Chance。V1 的 `new Map(statusId → status)` 去重甚至会把同一状态的主目标行覆写为最后一个邻位行；生成数据中的 `300301301` 只留下 `target:'adjacent'`，说明 V2 必须以**状态 ID＋目标＋概率**（或完整应用上下文）去重，而不是按状态 ID 去重。若两个不同的未映射 modifier 有不同概率、目标又相同，V2 不应给用户一串无法辨认归属的数字。

建议最小模型为 `applications?: Array<{baseChance; statusId?; target?}>`，且每项必须有可解 `baseChance`；`statusId` 仅在唯一映射时添加，`target` 仅在辨别主/邻/全体概率所必需且目标安全映射时添加。显示策略：单一概率或多个应用共用同一概率时可显示一次独立“基础概率”；不同概率需要可本地化的 Status ID 或不同目标才能区分，否则省略有歧义的应用。不要显示原始 ModifierName，也不要产生“状态名＋自身目标＋类别”而无数字的块。`Chance` 只从已确认的状态施加 `AddModifier` 读取；不能把任意其他任务的 `Chance` 无条件叫作状态基础概率。不同条件分支的概率同样需去重并标为可能值，而不假装同时施加。

## 10. Removed Features

| V1 功能 | V2 技能详情处置 | 保留的仓库边界 |
| --- | --- | --- |
| `statuses[].duration`、`simpleTurns`、`LifeTime` 到 UI | 删除回合期限类型、解析与 UI；移除期限专属测试/消息 | 不删除外部 Ability 的 LifeTime 或未来其他系统可能读取的通用 JSON；`resolveSkillValue` 仍服务倍率/概率/行动变化 |
| `summons`、`VERIFIED_SUMMON_SKILLS`、技能召唤卡 | 从详情域、投影、服务端技能链接/图片 enrichment、组件与测试删去 | `EnemyMonsterDomain.summons`、主页面召唤区、`projectSummon` 的一般敌人用途、`CompactEntityCard` 及其一般链接保留 |
| `bounce.count` 与 `401401207/208` fixture | 删除产品字段、UI、消息；如将来静态证明总倍率，循环知识只在内部聚合器使用 | 不把 5/10 次当作可直接展示的总伤害 |
| `effects: trigger-dot/clear-dot` 与 `300305105` 特例 | 删除技能详情结构化重复描述 | 官方技能描述、其他地方的 DoT 数据不受影响 |
| 无数值 `statuses`（例如 `406401201` 的自身“追打”、`403501004` 的“行动锁定”） | 不单独创建补充块 | 官方文案/ExtraEffects 仍描述机制；有安全数值时才显示相应数值 |

`401401208` 当前只有 Bounce 次数和自身“战甲”状态；`300305105` 当前只有 DoT 两个 effect；`401301004` 当前只有“易伤”状态。若无可证 V2 数值，这些技能最后只有官方描述，这是符合新产品定义的结果。

## 11. Proposed V2 Domain Schema

```ts
type EnemySkillDamageTarget =
  | 'primary' | 'adjacent' | 'all' | 'each-swept'
  | 'enemy-side' | 'marked' | 'other-marked';

interface EnemySkillDetailDomainV2 {
  damage?: Array<{
    target: EnemySkillDamageTarget;
    totals: DecimalString[]; // 完整、去重、按数值排序的一次执行可能总值
    scaling: 'attack';
  }>;
  applications?: Array<{
    baseChance: DecimalString; // 必填；不依赖 statusId
    statusId?: string;         // 仅唯一稳定映射时提供
    target?: EnemySkillDamageTarget; // 仅用于区分不同应用
  }>;
  actionShifts?: Array<{ kind: 'advance' | 'delay'; ratio: DecimalString }>;
}
```

`damage` 归属 `EnemySkillBindingDomain`，继续以 `(MonsterID,SkillID)` 为准；共享 Skill 定义不存 totals。`totals` 是每个目标角色的**可能完整总倍率集**，同值按十进制数值去重（如 `1` 与 `1.0` 合并），顺序稳定；不能用字符串字典序。没有证据的字段直接省略，不制造 `unknown` 或零；只有至少一项有数值时才有 detail。`applications` 的身份和目标为辅助区分而非状态系统；本地化投影只对存在的 `statusId` 补名称，UI 可按规则汇总显示。`actionShifts` 的域类型和正值规范不变。V1 的 Bounce、duration、kind、无数值状态、effects、summons 全部不进入 V2 域。

备选的单个 `damageMultiplier` 不能表示主/邻位或多个结果；纯 `baseChances[]` 无法区分 `3003013` 的 50%/80%；完整 condition AST 则超出产品需要。上述模型是最小的可扩展折中，不要求前端理解 Ability 分支。

## 12. Current → V2 Migration Table

| 当前字段/规则（实际标识） | V2 决策 | 理由 |
| --- | --- | --- |
| `damage[].ratio`、`damageRows` 按角色单值 | 改为 `damage[].totals[]`，先路径内求和、后分支去重 | 总倍率与多结果 |
| `VERIFIED_DAMAGE_SKILLS` | 经结构证明替代，旧 ID 改回归 fixture | ID 不是语义安全证据 |
| `EnemySkillTarget` | 保留有用角色，单独定义伤害角色；审查别名 | 避免跨目标求和 |
| `statuses[].statusId/kind/target/baseChance/duration` | 改为必须有 `baseChance`、可选身份/区分目标的 `applications` | 数值优先，不建完整状态系统 |
| `!stable || !role` 跳过状态 | 仅对无法解释的 Chance/目标应用省略；身份缺失本身不拦 Chance | Kafka 的 100%/120% |
| `simpleTurns` / `LifeTime` 期限专例 | 从本功能移除 | 期限不在 V2 范围 |
| `bounce.count` / `401401207/208` | 删除产品字段；循环仅可能作内部总值证明 | UI 不展示击数 |
| `summons` / `VERIFIED_SUMMON_SKILLS` / `candidateSummons` | 移出技能 detail 链 | 主页面召唤保留 |
| `effects` / `300305105` | 删除 | 官方文案已说明 DoT 行为 |
| `actionShifts` / `normalizedActionShift` | 保留 | 数值有用且现行解析有效 |
| 具体 Monster binding、官方描述、Skill Browser 选择 | 保留 | 变体正确性与上下文 |

## 13. Coverage Estimate

方法：临时只读脚本按 `MonsterConfig.SkillList` 联接具体 Monster、Skill、模板 CharacterConfig 及现行同名/共享 Ability 文件，使用 `effectiveSkillParams` 与现行 `resolveSkillValue`；仅遍历可联 Ability 的伤害任务路径。Phase 2C 的总数为 13,219 绑定，本次有 13,068 个进入 CharacterConfig 路径检查，其余 151 个未过模板路径/读取边界。下面的层级互斥；`OnStart[n]` 顶层比“任意递归找到任务”更保守，仍没有证明运行时控制流。数值是**设计候选**，不是上线承诺。

| 层级 / 条件 | 绑定 | 唯一 Skill ID | 解释 |
| --- | ---: | ---: | --- |
| L1：唯一顶层、非条件、现行可解伤害 | 1,885 | 381 | 其中 1,753 个绑定的 Skill ID 不在 V1 的 14 项名单；这是 Phase 2C 2,384 个额外严格候选中可明确归入最简 V2 形状的子集 |
| 分角色顶层任务，无同目标重复 | 415 | 86 | 主/邻位等直接分行，不增加同目标求和复杂度 |
| L2：同一 Ability 顶层、同目标重复且全部现行可解 | 372 | 93 | 顺序多击总倍率候选，需复核中途早退/换目标 |
| L2 扩展：同一顶层重复目标且需验证 `AQAAAAQR` 一哈希×常量 | 397 | 未单独去重 | 与上述三行不重叠；Kafka `200401001` 在此组，尚不能视为可发布 |
| L3：同一分支点成对 Success/Failed，值现行可解 | 78 单任务＋12 分支多任务＝90 | 15＋5（组间不可相加） | 仅 6 个绑定呈不同分支总值；仍需验证分支穷尽与回调语义 |
| L4：循环内伤害 | **0 已证明** | — | 378 个绑定存在循环内伤害；本次未证明循环次数×每击值×目标分配的完整关系 |
| 另有嵌套但非分支的直接候选 | 214 单任务＋50 多任务 | 37＋6 | 未计入上方保守层级，需确认回调执行条件 |

若将所有前五行不加人工核验地相加，可得 3,159 个绑定的**宽松候选上界**，其中 397 依赖未验证的表达式操作符、90 依赖分支语义。更稳妥的第一批分析范围是顶层直接值的 1,885＋415＋372＝2,672 绑定；它也只是审查队列，不是生产覆盖。`other` 10,042 个已联绑定混合了无伤害技能、目标/公式/流程不支持等，不能统称缺失。Phase 2C 的 2,384 指未发布的 V1 单行候选；本次最简 L1 中有 1,753 个未审 ID 绑定，剩余 V1 严格候选分布在分角色或嵌套等形状。V2 多击/分支能扩大候选，但不自动证明可用。

## 14. Representative Skill Walkthroughs

| 具体 Monster / Skill | V1 | V2 调查结论 |
| --- | --- | --- |
| `1022010/102201001` 霜冻重击 | `primary:3`、延后 `0.5` | 主目标总 `3`、延后 50%；正对照，保留 |
| `2004010/200401001` 夜间喧嚣不止 | 无 detail | `Skill01_Phase02.OnStart[4],[7]` 两个 `0.5×p0`，`p0=2.5`；验证表达式后候选总 `2.5`。`MCommon_DOT_Electric.Chance=1` 可独立显示 100%，不需 Status ID；期限不显示 |
| `2004010/200401002` 月光摩挲连绵 | 无 detail | `Skill02_Phase02.OnStart[9,13,17]` 主目标各 `3`、`[18]` 邻位 `2`；候选主 `9`、邻 `2`。条件触电传递由官方描述解释，不应混入无条件基础概率 |
| `2004010/200401004` 言灵 | 仅提前 `1` | `MCommon_MindControl.Chance=1.2` → 120% 基础概率，提前 100%；无身份也可显示；期限删除 |
| `4035010/403501001` 掷下血与伤 | 无 detail | 顶层主目标总 `4.5`；具体 `403501001/403501001` 为 `4`，不同模板 `4035011/403501101` 为 `6.5`，绑定归属必须保留 |
| `4035010/403501002` 编织受难与死亡 | 无 detail | 三条顶层 `AllLightTeam` 各 `4.5`；若验证目标集合和每次同目标命中，候选每目标总 `13.5`。现阶段先标目标映射未证，不发布 |
| `4035010/403501004` 莫要困毙洞中 | 只有“行动锁定”状态 | 单个顶层主目标 `5` 可作总倍率；当前状态块没有数值，V2 不单独显示。没有可解 Chance 时不补概率 |
| `4014012/401401207/208` | Bounce `5/10`，无伤害 | `Skill04/14` 的循环读 `Skill04Damage`，特殊行动分支改值，Retarget 随机且可能重复；450%/900% 仅为普通分支跨所有弹次的算术设想，**不是已证的某目标总倍率**。V2 删除 Bounce 字段，目前不输出伤害 |
| `4064012/406401204` 罪血锯刑 | 仅自身“追打”状态 | Phase02 七个 `6` → 该 Ability 候选 `42`；Phase03 另有 `6`，阶段关系未证，不能定最终 totals；无数值自身状态块移除 |
| `4064012/406401205` 罪血钳刑 | 无 detail | 同一 Phase02 顶层三次 `3.5` 全体伤害，候选每目标总 `10.5`，待验证路径和目标持续性 |
| `4013010/401301004` 在滔滔血海中沉溺 | 仅“易伤”状态 | 多哈希分摊/吸收倍率依运行时数量，不能枚举完整总值；无数值状态块移除，官方文案保留 |
| `3003051/300305105` 为你洗去一切罪 | `trigger-dot`＋`clear-dot` | 无独立可证 ATK 总倍率/Chance/行动变化；V2 仅官方描述 |

状态代表例：`100204001` 有稳定 Status ID `210010101` 与基础概率 `1`；Kafka `200401004` 有 Chance `1.2` 但无 ID；`406401201` 的自身“追打”只有身份无有用数值；`403501004` 是玩家侧“行动锁定”但目前无 Chance；`300305101` 两个状态各 `1`，可折为一个共用概率；`300301301` 的灼烧 `0.8` 与减速 `0.5` 必须分别保留归属。目标与身份有信息价值时保留作数字标签，绝不输出仅有名称/类别/自身目标的状态卡。

## 15. Partial-Knowledge Policy

建议**对每个目标角色要求完整的可达结果集**。若分支 A 主目标 `3`、分支 B 主目标为未知运行时表达式，则不发布主目标 `totals:['3']`，因为 UI 的“可能倍率”暗示列全了；同时可以发布与该不确定分支无关、已完整证明的行动变化或 Chance。若某技能主目标完整而邻位某分支未知，可只发主目标行，前提是主目标的每条可达路径都已覆盖。若产品以后希望显示“已知部分结果”，需要新文案和显式不完整标记；本次最小 V2 不引入它。

零伤害分支必须纳入路径证明：如果该技能有合法执行结果完全不造成伤害，不能把非零结果标成无条件“伤害倍率”；是否以 `0` 出现在多值列表需另定产品文案。目标重定向、随机弹射和阶段续接造成的路径不确定性不能通过丢弃未知任务来假装为零。

## 16. UI / Data Contract Implications

保留 `EnemySkillDetailDomain → EnemySkillDetail → EnemySkillBindingView → EnemySkillView → EnemySkillDetail.svelte` 的具体 binding 管线；投影只需本地化可选 Status ID，页模型继续保留 Monster 专属 detail。概念性渲染：单值“主目标 300% ATK”；多值“可能的伤害倍率：主目标 300% / 500% ATK”；扩散“主目标 130%，相邻目标 100% ATK”；无身份 Chance“基础概率 120%”；只有自身 Buff 身份时不显示补充区。无需条件、击数、召唤卡或状态期限 UI。多个概率仅在能辨认状态/目标归属时分行，不能把不相关的百分比堆到一起。

`messages/zh-CN.json` 与 `messages/en.json` 的 Phase 2B key 建议：保留 `enemy_skill_attack_ratio`、`enemy_skill_base_chance`、`enemy_skill_action_advance/delay` 及仍采用的目标标签；`enemy_skill_damage_multiplier` 可保留单值文案，新增“可能的伤害倍率”key。删除 `enemy_skill_bounce_count`、`enemy_skill_duration`、`enemy_skill_turn_one/other`、`enemy_skill_effect`、`enemy_skill_trigger_dot/clear_dot`、`enemy_skill_possible_summons`；若取消状态卡，`enemy_skill_status`、`enemy_skill_status_buff/debuff/other`、`enemy_skill_target` 与 `enemy_skill_target_self` 可移除或在新概率行精简。`enemy_skill_target_each_swept`、`enemy_skill_target_enemy_ally` 若更名则同步修改 key 和中英文案。Skill Browser 的阶段、选择、空态消息和通用 `enemy_summons` 保留。

## 17. Test Migration

保留 `tests/unit/enemy-skill-browser.test.ts` 的选择/阶段/精确百分比格式，保留 `enemy-domain.test.ts` 的具体 binding、`enemy-detail.test.ts` 的一般召唤与页面数据完整性。重写 `enemy-skill-details.test.ts` 的当前“重复任务不出总值”“无 Status ID 不出 Chance”断言，并新增：单击、两击求和、主/邻位不跨角色求和、互斥两总值、分支内多击、具体 Monster 参数覆盖、Chance 无 ID、不同状态/目标不同 Chance、提前/延后、不支持表达式、未知分支导致整目标省略、阶段 Ability 不盲合、循环/重定向不盲乘。`enemy-skill-projection.test.ts` 改测 `totals[]` 与可选身份本地化、两种 locale 的 binding 分离；移除期限/召唤/Bounce/DoT 特定断言。`tests/e2e/enemy-detail.spec.ts` 保留选择与响应式交互，替换 `data-status-duration`、`data-dot-effect`、`data-enemy-skill-bounce`、技能召唤卡断言为用户可见数字事实；不要把站点文案作为精确测试契约。已删除的产品字段不保留空快照测试。

## 18. Code Simplification Map

| 文件/区域 | 未来动作 | 具体范围 |
| --- | --- | --- |
| `scripts/data/enemy-skill-semantics.ts` | 重写伤害、简化状态；保留行动变化 | `tasksFor` 改为保留路径结构，`damageRows` 改总值聚合，移除两个已弃用名单、Bounce/DoT/期限/技能召唤分支；`normalizedActionShift` 调用保留 |
| `scripts/data/enemy-skill-details.ts` | 简化 | 保留模板/Ability 联接与具体参数；删除 `candidateSummons` 及召唤传参；可选状态映射仍需去重检查 |
| `scripts/data/enemy-skill-params.ts` | 扩展有界倍率表达式，保留现有参数覆盖 | `effectiveSkillParams` 与行动变化保留；只对白名单 opcode 加验证过的算术 |
| `src/lib/domain/neutral.ts`、`types.ts` | 改技能 detail 类型 | 增 `totals[]`、数值应用；删 Bounce、期限、召唤、DoT、状态类别；其他敌人类型不动 |
| `scripts/data/projection/enemy.ts` | 简化 `projectSkillDetail` | 状态 ID 可选时才本地化；删技能召唤投影；保留一般 `projectSummon` |
| `src/lib/server/enemies.ts` | 删技能 detail 的召唤链接/图片 enrichment | 主页面 `monster.summons` enrichment 不变 |
| `src/lib/domain/enemy-view.ts` | 缩小 `EnemySkillDetailView` | 保留 binding、共享定义和 `getEnemySkillsForMonster` |
| `EnemySkillDetail.svelte` | 精简补充区 | 多 totals、独立概率、行动变化；移除 Bounce/期限/状态卡/DoT/技能召唤卡；官方描述/ExtraEffects 保留 |
| `messages/zh-CN.json`、`messages/en.json` | 清理/增一个多结果 key | 见上节；不改无关消息 |
| 单元/浏览器测试 | 迁移契约 | 见第 17 节 |

`MonsterStatusConfig` 已列入 `source-requirements.ts`，V2 的可选 Status ID/本地化仍会使用；不能因删除期限便全局删除该表。`CompactEntityCard`、一般 `EnemySummonReference` 与页面召唤投影被其他功能使用，不能随技能内召唤一起删。

## 19. Gate Redesign and Implementation Sequence

新门槛应逐字段问：**能否静态证明该目标的完整总倍率集合？能否解析 `AddModifier.Chance` 且清楚说明概率归属？能否解析单一非条件行动变化？** 对“无法联 Ability”“不支持的值/目标”“无法证明分支/阶段/循环路径”“同一目标的未知可达结果”保留拒绝。建立仅构建期的精简 reason code：`damage-missing-ability`、`damage-unresolved-value`、`damage-ambiguous-flow`、`damage-unsupported-target`、`chance-unresolved`、`chance-ambiguous-application`、`action-shift-unresolved`；不再维护召唤、期限、Bounce、DoT 的详情诊断。

建议分阶段独立提交并在每阶段只更改必要边界：

1. 先固定只读的 V2 样本矩阵与原因计数，尤其 Kafka、`4014018` 分支、`406401204` 阶段、`403501002` 目标和 Bounce 反例；避免先删门槛后发现数值误报。
2. 增加构建期路径/精确十进制总值算法及 V2 域测试；第一批只接收单个顶层伤害和经证明的线性 `OnStart`，随后验证 `AQAAAAQR` 和窄成对分支。旧 14 个 ID 变回回归 fixture 后再移除生产 ID 门槛。
3. 独立改 Chance：身份可选、不同应用不混淆；行动变化保持原逻辑，并检查与简化域并存。
4. 删除详情专属期限、召唤、Bounce、DoT 与无数值状态；修改投影、页模型、组件和消息。一般召唤链单独回归验证。
5. 迁移定向单元、投影与 Skill Browser 浏览器测试，做中文/英文及具体 Monster 变体核验。不要把循环、复杂表达式或目标别名未证的候选夹带进首批上线。

## 20. Risks / Open Questions

- `AQAAAAQR` 的操作符、操作数顺序与参数源需以多个正反例固定，397 个表达式候选不能因 Kafka 一个样本就全部放行；加/减 opcode 的覆盖增量目前未能可靠量化。
- `OnStart` 中的早退、重定向、`SetDynamicValue`、命中回调和阶段 Ability 关系可能破坏“顶层任务必顺序执行”的假设。`406401204` 是必备反例。
- `AllLightTeam` 是否等同玩家可见“全体目标”、是否包含额外单位，关系到 `403501002` 的 3 次倍率；需查目标集合语义而非仅看官方文案。
- 多值 totals 按角色独立列出，不表达不同角色结果间的相关性；官方文案负责条件。若用户会误读为可任意组合，需再评估文案。
- 随机弹射的“全技能跨目标总倍率”与“某个目标受到的总倍率”不是同一量。V2 应先省略不确定项；是否将来新增分配型目标角色是尚未决定的产品问题，不恢复 Bounce UI。
- 多个未映射状态且概率不同、零伤害路径、部分已知结果集，均需要严格的省略/标注策略。本文推荐完整结果集和不可区分概率省略；不引入 UI 条件模型。

## Validation

本次分析只读取上游与现行生成数据，临时脚本用于路径/表达式形状计数；生产代码和生成 JSON 未修改。统计里的推定求和与分支总值已明确标成候选。结束前删除临时脚本/输出，检查报告格式、`git diff`/`git status`，并确认两个只读上游仓库的状态不变。此前 Phase 2C 报告为本任务开始时已有的未跟踪文件，本任务不修改它。
