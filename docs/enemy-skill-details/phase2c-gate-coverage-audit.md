# Enemy Skill Details Phase 2C：门槛与覆盖率审计

调查日期：2026-09-29。网站 `faf5a4a`（`develop`），只读上游 `TurnBasedGameData` `6b2bc17ebf`。本报告调查当前行为；未改变生产解析器、生成数据或 UI。百分比均指配置输入，不代表最终伤害或最终命中率。

## 1. Executive Summary

**伤害缺失的最大可量化原因是 `VERIFIED_DAMAGE_SKILLS` 的 Skill ID 门槛，但它不是唯一原因。** 13,219 个具体 Monster–Skill 绑定中，当前 227 个有伤害倍率；仅跳过该名单、保留现有其余代码时，另有 2,542 个绑定（564 个 Skill ID）得到伤害行。其中 2,384 个绑定（517 个 Skill ID）还满足本审计的较严格静态条件：所有已发现伤害任务均非条件分支、值可解析且目标别名在现有已支持集合中。后一个数字依然是**候选上界**，不是可直接发布的数量；`tasksFor` 没有完整控制流证明，跨 Ability 的同倍率任务可能仍需人工核对。仅 ID 门槛放行会使当前 227 个增加至 2,769 个，但不宜直接这样上线。

其他主要原因是缺少任务联接、条件分支、复合表达式/动态值、重复伤害任务、目标别名未建模，以及状态身份缺失。状态的 `Chance` 有时已能算出，却因找不到稳定 `StatusID` 而整条状态事实不输出。UI 管线本身能工作：`102201001` 的 300% ATK 与 50% 行动延后贯穿到生成 JSON 和组件；卡芙卡 `200401004` 当前其实也有 100% 行动提前。截图中的 `莫要困毙洞中` 当前已有“行动锁定”状态，缺的是伤害。此前“这些技能均无详情”的观察需要按字段修正。

后续可考虑以经过加强的结构性证明替代伤害 ID 名单，并把该名单转为回归样本。复合表达式、条件分支、重复击打、未知目标、状态身份与期限冲突仍须保守。本文不实施变更。

## 2. Current Detail Pipeline

`scripts/data/sync.ts:652` 调用 `buildEnemySkillDetails`。`scripts/data/enemy-skill-details.ts` 从 `MonsterTemplateConfig.JsonConfig` 读取 CharacterConfig，只尝试同名及共享 `_Ability.json` 路径；按 `MonsterConfig.SkillList` 联接 `MonsterSkillConfig`，以 `effectiveSkillParams` 覆盖具体 Monster 的参数，再把所选 trigger、CharacterConfig、Ability 与状态映射交给 `parseEnemySkillDetail`。`scripts/data/domain/enemy.ts:225` 将返回值附在具体 Monster 的 skill binding，而非共享 Skill 定义。

`scripts/data/projection/enemy.ts:299,369` 将中性 `EnemySkillDetailDomain` 投影为带本地化状态名、召唤引用的 `EnemySkillDetail`；`src/lib/domain/enemy-view.ts:150,189` 把它放进 `EnemyDetailPageData.monsters[].skills[].detail`，`getEnemySkillsForMonster` 再联接共享文案形成 `EnemySkillView`。`src/lib/components/enemy/EnemySkillBrowser.svelte:24,39-41` 先按具体 Monster 和阶段选技能，`EnemySkillDetail.svelte:53,81` 只在存在事实时渲染补充区。`src/lib/server/enemies.ts:51` 只给召唤引用补页面链接和图片。

这里有两道产品可见性边界：`domain/enemy.ts` 对不存在的 `MonsterSkillConfig` 行跳过该技能；Skill Browser 按 `skillPhases` 过滤当前阶段。后者影响何时可选中技能，不删除已经附着的事实。共享定义按 Skill ID 去重，detail 保留在 Monster binding；样本 `100203001`、`406401201` 验证未把变体倍率串用。

| 当前中文样本 | `EnemySkillDetailDomain` → 生成 `EnemySkillDetail` | `EnemySkillBindingView` → `EnemySkillView` → 选中后的 UI |
| --- | --- | --- |
| `1022010/102201001` | 主目标倍率 `3`、延后 `0.5` → 两字段均保留 | binding/view 均有 detail；显示 300% ATK、延后 50% |
| `2004010/200401001` | `undefined` → 无 detail | binding/view 只有官方文案；无补充区 |
| `2004010/200401004` | 仅提前 `1` → 同值 | binding/view 有 detail；显示提前 100%，没有状态概率 |
| `4035010/403501001` | `undefined` → 无 detail | binding/view 只有官方文案；无补充区 |
| `4035010/403501004` | 仅状态 `240350101` → 本地化为“行动锁定” | binding/view 有状态；显示状态，没有伤害倍率 |

## 3. Gate Inventory

分类：A 正确语义安全；B 原型人工门槛；C 解析实现限制；D 现有模型限制；E 下游丢失/显示条件；F 有意产品省略。一个条件可能兼属多类。

| Gate / 实际条件 | 位置 | 范围及影响 | 类别 |
| --- | --- | --- | --- |
| `VERIFIED_DAMAGE_SKILLS`，14 项；ID 不在集合则 `damage=[]` | `enemy-skill-semantics.ts:9,177` | 全部伤害，即使任务可解也不发布 | B |
| `VERIFIED_SUMMON_SKILLS`，3 项；ID 不在集合则 `summons=[]` | 同文件 `:25,230` | 候选召唤引用 | B；条件召唤仍需 A |
| `skillId==='401401207/208'`、`Skill04` 参数索引及 Loop 存在 | 同文件 `:235-244` | Bounce 仅两个手审样本；不可推广循环语义 | B/C |
| `skillId==='300305105'` 且触发、清除任务同时存在 | 同文件 `:217-227` | DoT 语义只发布该样本 | B/A |
| `skillId.startsWith('3003051')`、两状态 ID、`ModifierPhase1End`、正整数期限 | 同文件 `:190-203` | 仅这一族发布回合期限 | B/A |
| `406401207` 专用 `Retarget` marker；`201201002` 条件伤害例外 | 同文件 `:95-104,130` | 专门处理标记者/死亡触发 | 特例语义规则，A/B |
| CharacterConfig 路径只认 `Config/ConfigCharacter/Monster/`，Ability 仅同名/共享两路径，文件必须存在且含被引用 Ability | `enemy-skill-details.ts:11-18,70-95` | 未联接模板的所有事实缺失；未搜索其他 Ability 文件 | C/A |
| Skill 行、`SkillTriggerKey`、`SkillAbilityList`/`EntryAbility` 联接 | `enemy-skill-details.ts:108-137`、`enemy-skill-semantics.ts:71-116` | 无任务即 `undefined`；只走列出的 Ability | A/C |
| 同 trigger 不同有效参数冲突、重复 override、不合法参数值 | `enemy-skill-details.ts:115-119`、`enemy-skill-params.ts:9-25` | 参数数组清空/某值 `undefined`，关联数值事实消失 | A |
| `resolveSkillValue` 只接受固定值或单哈希 `AQAR` 的直接 `SkillParam` ReadInfo | `enemy-skill-params.ts:30-53` | 复合 postfix、其他 DynamicValue、缺索引一律不解 | A/C |
| 伤害仅 `DamageByAttackProperty`；支持的目标别名有限、负倍率/自伤跳过 | `enemy-skill-semantics.ts:118-164` | 其他伤害机制、目标不输出 | A/C/D |
| 条件任务一般跳过，只有 marker/死亡例外；同目标不同倍率或同 Ability 重复任务拒绝 | 同文件 `:126-160` | 防止分支冲突与多击误导；可能只保留其他目标行 | A，部分粒度风险 |
| 状态必须在 `MonsterStatusConfig` 中有唯一 modifier 映射且目标可映射 | `enemy-skill-details.ts:52-62`、`enemy-skill-semantics.ts:181-204` | 已知 Chance 仍可能无法显示；重复状态名删除映射 | A/D；通用状态覆盖 C |
| Action shift 仅非条件、非零、可解值；最终恰好一个唯一 shift | `enemy-skill-semantics.ts:206-214,247-258`、`enemy-skill-params.ts:55` | 条件/冲突 shift 被省略 | A |
| 召唤 ID 须来自 `CustomValues` 的 `SummonID*`，同时在 `SummonIDList` 与 Monster 表中 | `enemy-skill-details.ts:28-40` | 不可闭合候选消失；并未验证每个任务实际取哪个键 | A/C |
| 任一字段都空则 detail 为 `undefined` | `enemy-skill-semantics.ts:244-259` | 整个补充区消失，官方描述仍在 | A/E |
| 投影仅转发定义的 detail 字段；阶段筛选、`hasFacts` 条件渲染 | `projection/enemy.ts:299-340,369`；`enemy-skill-browser.ts:4`；`EnemySkillDetail.svelte:53` | 只显示已投影、当前选中的事实 | E；样本未见额外丢失 |
| 不输出韧性数值、通用多击总量、复杂条件公式、最终命中率、条件召唤数量等 | `EnemySkillDetailDomain` 类型与 Phase 1 决策 | 产品范围 | F |

`enemy-skill-policy.ts` 的 `enemySkillKinds`（2 项）、`enemySkillTagCodes`（17 项）也是人工映射，但作用是现有类别/标签；未知代码会抛错，不是本次“文案有而 detail 无”的静默门槛。未找到生产用的 Monster ID 白名单；变体主要受 Skill ID 门槛、有效参数和模板路径影响。

## 4. Positive Control：永冬灾影

`MonsterConfig[1022010].SkillList` 含 `102201001`；`MonsterSkillConfig` 记录 `SkillTriggerKey=Skill01`、参数 `p0=3,p1=0.5`；模板的 `JsonConfig` 为 `Monster_W1_Soldier01_02_Config.json`，`Skill01` 的 `EntryAbility`/`SkillAbilityList` 指到对应 `Monster_W1_Soldier01_02_Ability.json` 的 Phase Ability。`DamageByAttackProperty` 目标 `AbilityTargetEntity`，`DamagePercentage` 的单哈希 `-1126825319` 直读 `Skill01.p0`；`ModifyActionDelay.AddNormalizedValue` 的 `-1433019565` 直读 `p1`。`VERIFIED_DAMAGE_SKILLS` 包含此 ID，故中性 domain 输出 `damage=[primary,3]`、`actionShifts=[delay,0.5]`。

中文生成文件 `src/lib/generated/views/zh-CN/details/enemies/1022010.json` 的具体 `1022010/102201001` binding 保留这两项；投影、页面模型与 `getEnemySkillsForMonster` 均原样保留，`hasFacts` 为真。组件将小数字符串显示为 300% ATK 与行动延后 50%。这是 UI 全链路正对照。

## 5. Kafka Missing-Detail Investigation

当前 `/enemies/2004010/` 页面默认具体 Monster 为 `2004010`（`EnemyDetailPage.svelte:38`）；其余 `200401001`–`200401012` 与它同属模板 `2004010`。当前生成文件逐个核验：这 13 个变体的 `200401001` 均无 detail，`200401004` 均有 `actionShifts=[advance,1]`。没有截图 URL 或当时选中的 Monster ID，无法从文字反推出当时具体选择；逐个变体验证已覆盖这一不确定性。

| 技能 | 原始链与当前结果 | 精确阻断点 |
| --- | --- | --- |
| `200401001` 夜间喧嚣不止 | `Skill01` → `Monster_W2_Kafka_00_Skill01_Phase02`，同一 Ability 两个主目标伤害任务；每项 `DamagePercentage` 为哈希 `-1126825319` 与固定 `0.5` 的 `AQAAAAQR` 表达式。`AddModifier(MCommon_DOT_Electric).Chance` 直读 `1`，`LifeTime` 直读 `3`。domain、投影、页面、view 均无 detail。 | 伤害不在 14 项名单，且即使跳过 ID 门槛，表达式不受 `resolveSkillValue` 支持、同 Ability 两次击打也被多击规则挡住；状态 `MCommon_DOT_Electric` 没有唯一稳定 ST 身份，100% 基础概率随状态一起丢失。并非单纯 ID 漏加。 |
| `200401004` 言灵 | `Skill05` → Phase02，`AddModifier(MCommon_MindControl).Chance` 直读 `1.2`；`ModifyActionDelay=-1`。domain、生成文件、页面与 view 均有行动提前 `1`，UI 在选中此技能时可显示 100%。 | 120% 基础概率因 `MCommon_MindControl` 无 ST 映射而被整条状态分支跳过；期限仍是复合表达式，不应猜测。所谓“完全无补充”与当前生成文件不符；若浏览器当时未显示行动提前，需用当时构建版本/选择状态复核。 |

Kafka 的 CharacterConfig 与 Ability 文件均与 Phase 1 fixture 相同；这里未发现变体改用另一 Ability 路径。`OverrideAIPath` 不在静态详情链。实际问题分别是复合多击＋状态身份，以及状态身份；不是“只查了 base Monster”。

## 6. Screenshot Enemy Investigation

TextMap/`MonsterSkillConfig` 将七个名称对应到模板 `4035010`（`Monster_W4_IronTombCore_00_Config.json`）和独立模板 `4035011`（`..._Config_Main.json`）。`4035010` 页面含具体 Monster `4035010/403501001`；`4035011` 页面含 `4035011`。两者当前默认 Monster 各为自身。技能的 `PhaseList` 是上游标记；浏览器仍按所选阶段的 `skillPhases` 决定是否可选。

| 名称 | `4035010` Skill ID / 阶段；`4035011` Skill ID / 阶段 | 现行与仅跳过伤害 ID 门槛的结果 |
| --- | --- | --- |
| 掷下血与伤 | `403501001` / 1–3；`403501101` / 1–2 | 当前无 detail；单个主目标直接伤害可解。dry run：`4035010` 450%、`403501001` 400%、`4035011` 650% ATK；B，参数随具体 Monster 变。 |
| 编织受难与死亡 | `403501002` / 1–3；`403501102` / 1–2 | 每绑定有 3 个可解伤害任务，但目标是 `AllLightTeam`，不在现有目标映射；跳过名单仍无伤害。C/D，不能直接标为现有 `all`。 |
| 莫要臣服暴政 | `403501003` / 1；`403501103` / 1 | 当前无 detail；单个主目标直接伤害可解。dry run：450%/360%/650%，按上述三个具体 Monster 顺序。B。 |
| 莫要困毙洞中 | `403501004` / 1；`403501104` / 1 | 当前有 `240350101`“行动锁定”Debuff；伤害被 ID 门槛挡住。dry run 主目标 500%/450%/650%，按三个 Monster 顺序。B；这是**字段缺失**，不是整技能无 detail。 |
| 翁法罗斯的「恨」 | `403501009` / 1–3；`403501109` / 1–2 | 已联 Ability 链里无直接 `DamageByAttackProperty`；当前与 dry run 均无 detail。不能从文案推倍率。 |
| 三千万转，罪业回环 | `403501010` / 1–3；`403501110` / 1–2 | 同上；无直接伤害任务，可能涉及被动/回调，当前模型不抽取。 |
| 万有成灰，陪葬新生 | `403501011` / 1–3；`403501113` / 1–2 | 同上；无直接伤害任务，不能因名称推定数值。 |

## 7. Global Coverage Statistics

方法：遍历当前 `MonsterConfig.SkillList` 中可联到 `MonsterSkillConfig` 的具体绑定；使用现行 `buildEnemySkillDetails` 统计输出；临时副本仅将两个 `VERIFIED_*` 条件改为 `true` 做 dry run；对伤害任务用与 `tasksFor` 相同的遍历做原因统计。临时文件及输出在结束前删除。绑定是 `(MonsterID, SkillID)`，同一 Skill ID 的变体重复计数；当前 Skill ID 去重列不含上游未绑定技能。该统计覆盖原始绑定，不等于某一页面当前阶段同时可见数。

| 当前结构化事实 | 绑定数 |
| --- | ---: |
| 总绑定 / 唯一 Skill ID | 13,219 / 3,562 |
| 任一 detail / 无 detail | 3,189 / 10,030 |
| 有 detail 的唯一 Skill ID | 719 |
| 伤害 | 227 |
| 状态身份 / 其中带基础概率 / 其中带回合期限 | 2,853 / 521 / 8 |
| 行动提前或延后 | 238 |
| DoT 触发/清除 | 4 |
| 候选召唤 / Bounce 次数 | 31 / 6 |

这些字段会重叠，不能相加得到 `3,189`。状态基础概率必须随可识别状态发布；单独的 Chance 不在现有域模型中。

## 8. Damage Gate Analysis

**“结构可解析”口径：**在当前联接的 Ability 中有 `DamageByAttackProperty`；所有被该技能遍历到的伤害任务都处于非条件路径，倍率为固定值或直接单哈希 `SkillParam`，目标别名在现有单体/邻位/全体/横扫集合内；生产 `damageRows` 仍须通过同角色一致倍率与重复任务检查。为避免把“解析器能输出一行”说成全技能安全，报告同时给出原解析器 dry run 与较严格静态子集。即便严格子集也未证明所有 Ability 回调或运行时覆盖已纳入，发布前仍需抽样核对。

| 互斥首要原因（按当前绑定分类） | 绑定 | 唯一 Skill ID |
| --- | ---: | ---: |
| 当前已输出伤害 | 227 | 14 |
| 仅跳过 ID 门槛后原解析器会输出 | 2,542 | 564 |
| 无已联直接伤害任务 | 8,018 | 2,380 |
| 已联伤害任务全部位于条件路径 | 1,180 | 310 |
| 值不可解（含复合 postfix / 其他动态） | 732 | 142 |
| 多任务、同角色倍率冲突或重复击打 | 456 | 129 |
| 目标别名不受现有模型支持 | 55 | 17 |
| 其他现有语义限制 | 9 | 8 |
| **合计** | **13,219** | **各行 Skill ID 不可相加** |

分类优先级是“现行输出 → dry run 输出 → 无伤害任务 → 全条件 → 值不可解 → 多任务 → 目标 → 其他”；因此例如 Kafka `200401001` 在“值不可解”，同时还具有多击问题。`8,018` 中有 `3,150` 个绑定连 `tasksFor` 任务都没有，既可能是无伤害技能，也可能是 Ability 联接/回调覆盖空白，不能全部称为“真正无伤害”。

仅 ID 门槛 dry run 的新增 2,542 个中，2,384 个（517 个 Skill ID）满足上面的更严格静态检查；其余 158 个至少涉及本检查排除的条件/未解值/目标情形，提示当前 `damageRows` 允许部分行输出，不能把 2,542 全当安全候选。严格子集中 1,854 个绑定原本完全没有 detail。代表例子是 `1002020/100202001` 单体 250%，`1002011/100201101` 全体 200%，以及 `4035010/403501001` 主目标 450%。它们都未进入 14 项名单；对应伤害任务直接可解。**移除名单的预计增量是解析器产物，不是已批准的产品覆盖率。**

## 9. Other Semantic Coverage

| 家族 | 现行输出 | 额外证据与限制 |
| --- | ---: | --- |
| Action shift | 238 绑定 | 352 个绑定有 `ModifyActionDelay` 任务，114 个未输出；原因包括条件路径、值不可解、零值或多种 shift。没有行动变化 Skill ID 名单。`200401004` 正常输出。 |
| 状态基础概率 | 521 绑定 | 1,728 个绑定的 `AddModifier` 至少有一个可解 Chance；其中 980 个绑定至少有一个可解 Chance 的 modifier 缺稳定 ST 映射，748 个至少有一个可解 Chance 且有映射。两组可重叠，不能直接相减。`MCommon_MindControl` 与 `MCommon_DOT_Electric` 是缺身份而非缺概率。 |
| 回合期限 | 8 绑定 | 2,363 个绑定的 `AddModifier.LifeTime` 至少有一个可解值；这**不**意味着 2,355 个安全漏报。当前只核准 `3003051` 家族的两状态、`ModifierPhase1End` 和正整数；`100204001` 的施加值 2 与 GlobalModifier 的 1 冲突，`200401004` 是复合表达式。需区分值已知、生命周期语义仍不明。 |
| 召唤 | 31 绑定 | 831 个绑定有 `SummonMonster` 任务。仅跳过 3 项召唤名单，现有候选 ID 联接逻辑会额外给 356 个绑定（95 个 Skill ID）生成候选；这未证明条件、实际召唤键或数量安全，不能直接发布。`1003010/100301004` 是待审样本。 |
| Bounce | 6 绑定 | 当前仅 `401401207/208` 两个 ID，用 `Skill04` 参数索引和 Loop 存在判定；这是 fixture 驱动，维持现状直到通用循环/覆盖语义可验证。 |
| DoT 语义 | 4 绑定 | `300305105` 专门要求触发任务与按 `STAT_DOT` 清除任务同时存在。 |

## 10. Variant Analysis

解析器没有 Monster ID 白名单。`effectiveSkillParams` 先按具体 Monster 的 `OverrideSkillParams` 覆盖参数，再让该绑定解析。已发布样本 `1002030/100203001` 主目标 `1.3` 对比 `100203026/100203001` 的 `1`，`4064012/406401201` 的 `4` 对比 `406401201/406401201` 的 `3.6`；投影和页面仍按绑定保存。`1004020` 家族已审召唤候选也可随 `CustomValues` 覆盖变化。

Kafka `2004010` 及其 12 个具体变体均缺 `200401001` detail，均有 `200401004` 行动提前；这是共享表达式/身份门槛，不是变体继承失败。`4035010/403501001` 同 Skill ID 可解伤害输入分别为 `4.5/4`，因 Skill ID 名单同时被挡。`4035011` 是另一模板/CharacterConfig，不能当作前者的参数变体；其同名技能另用 `403501101` 等 ID。`4064012` 家族的伤害已能继承正确，重复多击/条件任务仍单独受限。若出现缺失，优先按具体 Monster 检查参数覆盖、模板 `JsonConfig`、Ability 路径与 trigger，而非回退到 base Monster 的 detail。

## 11. Field-Level vs Skill-Level Rejection

解析总体按字段独立：伤害、状态、行动变化、DoT、召唤、Bounce 各自提取；一项失败通常不清空其他项。`403501004` 已有状态而缺伤害，`200401004` 有行动提前而缺状态概率，正是证据。最后只有所有家族都为空才 `return undefined`。

但存在**过宽的字段内拒绝或不完整字段内输出**：`AddModifier` 在 `!stable || !role` 时 `continue`，即使 Chance 已安全可解也无法单独呈现，这是现有“概率必须附状态”模型限制；`uniqueShifts.length !== 1` 时全部 shift 省略；`damageRows` 对同角色冲突会弃该角色，但仍可能输出别的角色，且条件分支可被跳过后仅输出无条件部分。后两者需审查显示行是否足以代表技能，不能简单把局部行视为完整倍率。

## 12. Representative False Negatives

以下是**当前完全无 detail**、且在当前已联任务中具有非条件、直接可解伤害的代表绑定。置信度“高”仅针对所列任务的倍率输入；发布前还需核对跨 Ability 控制流。所有当前阻断点都是 `VERIFIED_DAMAGE_SKILLS` 缺 ID。

| Monster / Skill | 名称 | 可恢复事实 | 置信度 |
| --- | --- | --- | --- |
| `1002011/100201101` | 冰风 | 全体 200% ATK | 高 |
| `1002013/100201301` | 永冬余响 | 全体 240% ATK | 高 |
| `1002020/100202001` | 铲击 | 主目标 250% ATK | 高 |
| `1002041/100204101` | 奔袭 | 主目标 300% ATK | 高 |
| `1002050/100205001` | 破甲榴弹 | 主目标 300% ATK；其撕裂 Chance `1` 另受身份限制 | 高（伤害） |
| `1003010/100301001` | 突击 | 主目标 300% ATK | 高 |
| `1003014/100301401` | 突击 | 主目标 200% ATK | 高 |
| `1004021/100402101` | 一意之拳 | 主目标 300% ATK | 高 |
| `1004021/100402102` | 霜之惩击 | 主目标 400% ATK | 高 |
| `4035010/403501001` | 掷下血与伤 | 主目标 450% ATK | 高 |
| `4035011/403501101` | 掷下血与伤 | 主目标 650% ATK；与前一行不是同 Skill ID | 高 |

另有**部分事实漏报**：`403501004` 已显示状态但缺主目标 500%；`200401004` 已显示行动提前但缺可解的 120% `Chance`（需要先解决状态身份模型）；`1003010/100301004` 的召唤候选在仅跳过召唤名单后可联到 `1002040`，但十二个召唤任务及条件语义未核验，不能列作高置信安全发布样本。

## 13. Representative Correct Rejections

| 绑定 | 应继续拒绝的内容与证据 |
| --- | --- |
| `2004010/200401001` | 两个顺序伤害任务的 `AQAAAAQR` 混合固定 `0.5` 与动态哈希；当前既不解复合式，也不把两击误写为单次倍率。 |
| `2004010/200401002` | 主目标多条顺序伤害、邻位另有任务；不能把参数直接写成全技能总倍率。 |
| `4013010/401301004` | 分摊/吸收数量进入多哈希复合 postfix；`p0=12` 不是无条件 1200% ATK。 |
| `4064012/406401204` | 多个顺序伤害任务与阶段路径，不能把单任务输入写成整技能倍率。 |
| `4035010/403501002` | `AllLightTeam` 三个伤害任务虽可解值，现有目标语义不含该别名；不能无证映射为 `all`。 |
| `1002040/100204001` | `AddModifier.LifeTime=2` 与同名 GlobalModifier `LifeTime=1` 冲突，现行不输出数字期限正确。 |
| `2004010/200401004` | 控制期限为复合 postfix；当前不猜回合数正确。 |
| `4014012/401401207` | 特殊行动可改写普通弹射伤害动态键；现行只输出已核实次数，不输出无条件每弹倍率正确。 |

## 14. Diagnostic Gaps

`effectiveSkillParams`、`resolveSkillValue`、`tasksFor`、`damageRows` 和 `parseEnemySkillDetail` 多处以 `[]`、`undefined`、`continue` 静默退出。`buildEnemySkillDetails` 对路径、Ability、trigger 不匹配也直接跳过。现有 `EnemyDomainAudit.unresolvedSkills` 只记录缺 `MonsterSkillConfig` 等联接，不记录“有 Ability 但详情被哪个门槛拒绝”。目前开发者看到 10,030 个无 detail 绑定，无法从生成数据判断原因；早期 14 项 fixture 测试验证了正确样本，却未揭示全局覆盖率。

建议以后在构建期收集字段级、绑定级 reason code，不进入浏览器：`missing-config-path`、`missing-ability`、`missing-trigger`、`conflicting-override`、`not-reviewed-damage`、`not-reviewed-summon`、`unsupported-expression`、`unresolved-dynamic-value`、`conditional-branch`、`ambiguous-multi-hit`、`unsupported-target`、`status-identity-unmapped`、`duration-conflict`、`summon-reference-unresolved`、`bounce-unverified`。每次数据同步输出绑定/唯一 Skill ID 计数和已审样本矩阵，可让上游版本变化显性化。分类可多标签；本报告伤害表仅采用互斥首因以便合计。

## 15. Gate Redesign Options

| 方案 | 正确性 / 风险 | 维护与覆盖 / 上游变化 |
| --- | --- | --- |
| A：继续扩大两个名单 | 低实现风险，但人工审查每个新 ID；无法自动发现类似安全结构 | 维护成本高，变体/新版本持续漏报；当前 14/3 项规模解释了覆盖缺口 |
| B：强化结构证明后移除 ID 生产门槛，名单改回归 fixture | 有机会覆盖至少数百 Skill ID；需补全条件路径、多击、目标及值解析的审计理由，不能直接采用 2,542 | 对新 ID 更有韧性，测试和诊断要求最高 |
| C：分家族混合迁移 | 先放行**单个非条件直接伤害任务**等窄模式，保留特殊 marker、Bounce、期限和复杂召唤 fixture | 覆盖逐步增加，能按原因监测回归；长期仍需减少例外 |

`VERIFIED_DAMAGE_SKILLS` 最像回归 fixture/临时迁移门槛；`VERIFIED_SUMMON_SKILLS` 目前更像特殊条件召唤的迁移门槛，不能因候选 ID 可联就一并解除。`401401207/208` Bounce、`406401207` marker、`300305105` DoT 与 `3003051` 期限包含明确特例语义，应保留为专门规则及测试，待有通用语义证明才泛化。此处只是选项评估，不作生产决策。

## 16. Recommended Next Step

最小下一任务：先加入**只在构建期运行的字段级拒绝原因与覆盖计数**，固定 `102201001`、Kafka 两技能、`4035010/403501001/002/004`、两个已知参数覆写族作为回归矩阵；随后仅针对“单个非条件、直接 SkillParam/固定倍率、已支持目标、无其他同技能伤害任务”的伤害模式设计结构性放行。先用本报告 2,384 个严格候选进一步剔除跨 Ability/回调不确定项，再决定产线门槛。不要在这个审计任务中放宽输出。

## Validation and limitations

统计使用现行解析器与临时干跑副本，未改生产路径。抽查中文生成 JSON 的 `1022010`、`2004010`、`4035010`，证实 domain 结论与生成边界一致；页面模型与 Svelte 渲染条件按当前代码核对，未重新进行浏览器自动化。无法从提供的文字截图确定当时选择的具体 Monster、阶段、构建版本，报告分别核验了有关默认 Monster 与变体。上述潜在覆盖数是静态解析候选，不是战斗验证或安全发布承诺。调查结束前删除临时脚本/数据，并核验 Git diff/status 及两个只读上游的状态。
