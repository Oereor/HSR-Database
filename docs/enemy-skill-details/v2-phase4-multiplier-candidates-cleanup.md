# Enemy Skill Details V2 Phase 4：倍率候选迁移与技术债清理

实施日期：2026-09-30。网站 `develop`，实施前 HEAD `106c8f3`；只读上游 `TurnBasedGameData` `6b2bc17ebf46`。使用 Node 24.19.0、pnpm 11.9.0。历史 redesign、Phase 1–3、Phase 4A 报告均保留，Phase 4A 原有未跟踪文件未修改。

## 1. Summary

伤害详情现在回答“关联配置中有哪些可可靠解析的攻击力倍率候选”。候选可以来自局部多击合计、不同分支、回调、阶段或 Ability；不承诺完整执行结果、互斥性、触发概率或分支与目标的配对。官方描述继续说明机制。没有引入战斗模拟、条件 AST、调度器、循环次数推演或新 opcode。

按 A 契约迁移、B 候选扩展、C UI 适配、D 清理的顺序完成。契约迁移保留旧行为时，3 文件 60 项定向测试通过；扩展与 UI 的 6 文件 89 项测试及数据同步通过后，才移除旧解析与诊断。清理后执行完整数据验证及最终检查。

## 2. Contract migration

中立域、生成契约、本地化投影、页面模型和 UI 使用同一伤害形状：

```ts
{ target?: EnemySkillDamageTarget; multipliers: DecimalString[]; scaling: 'attack' }
```

`totals`、旧格式／归一化函数名称和兼容别名均不再进入本功能实现或生成输出。投影原样保留候选及可选目标，详情仍属于具体 `(MonsterID, SkillID)` binding，共享技能定义不存变体倍率。

manifest schema 从 46 升为 47，同步生产者、读取器、类型、缓存与验证 fixture 和规范架构文档。旧缓存的上游提交及 TextMap 即使不变，也会因 schema 不兼容而重新生成；新增测试验证旧 schema 被拒绝。

## 3. Candidate extraction

新增 `scripts/data/enemy-skill-damage.ts`，分离 `extractHit` 数值提取、`localCandidates` 局部聚合与 `collectEnemySkillDamage` 收集。仍只使用现有 CharacterConfig／Ability 文件联接及具体 Monster 有效参数。

遍历已联 Ability 的配置结构，跳过 Predicate 对象，不解释谓词。不把未联 Ability 或全局配置当成当前技能的数据源。同一目标组内使用 `compareDecimals`、`decimalEquals` 精确排序去重；相等值保留稳定的首个十进制表示。直接数值及普通求和保留精度，含已验证乘积的结果沿用 Phase 3 去除无意义小数尾零的规则。

## 4. Local aggregation

支持的局部任务数组为 `OnStart`、`OnHit`、`OnProjectileHit`、`SuccessTaskList`、`FailedTaskList`、`TaskList`。同一局部线性段内，直接伤害任务按可信目标角色精确相加，只发布合计，不再发布其中每击。

嵌套伤害、Retarget、Loop／Bounce、技能结束／中断等结构切开局部段；不同数组、分支臂、回调及 Ability 不相加。未知包装数组仍递归提取单项值。无标签值不相加，因为它们可能对应不同实体；未知目标也不能连接两侧的已知伤害形成合计。

同目标序列含未解伤害时，保留可靠单项值，禁止生成已知子集的部分和。原有横扫三位置同值规则继续生成 `each-swept`，不把三个位置相加。

## 5. Runtime contexts and blocker migration

| 旧门槛 | 新职责 |
| --- | --- |
| 条件分支、未知回调可达性 | 不阻断数值；各自收集局部候选 |
| 跨 Ability／阶段 | 只阻断跨上下文求和 |
| Loop／Bounce | 保留内部数值及可证明的局部序列，不乘运行次数 |
| Retarget | 切开局部聚合，影响后续目标标签，数值独立保留 |
| 附近运行时改值 | 不构成广泛数值门槛；具体表达式的不可解析依赖仍拒绝 |
| 未支持 opcode、缺哈希、非法参数、畸形数值 | 严格数值拒绝 |
| 未映射目标 | 候选进入独立无标签组，不合并到已知角色 |

Kafka `Skill02_Phase02` 的三击发生在后续 Retarget 之前，仍保留主目标 `9` 与邻位 `2`。原有死亡伤害使用通用敌方侧映射；`406401207` 的已审核标记语义保留为目标映射函数，不再授予特殊执行或数值许可。

## 6. Partial knowledge

未知兄弟上下文不再压制已知值。`4014012/401401201` 一侧缺少哈希映射，另一侧可靠读到 `2.2`，因此发布 `['2.2']`。不增加占位值，不为无伤害分支合成零，也不记录分支／Ability／回调来源或跨角色相关性。

## 7. Representative examples

以下结果由当前真实配置和有效 Monster 参数计算，未在生产解析器中硬编码：

| Monster / Skill | 候选或保留事实 |
| --- | --- |
| `1022010/102201001` | primary `['3']`；行动延后 `0.5` |
| `2004010/200401001` | primary `['2.5']`；基础概率 `1` |
| `2004010/200401002` | primary `['9']`；adjacent `['2']` |
| `2004010/200401004` | 基础概率 `1.2`；行动提前 `1` |
| `4014018/401401803` | primary `['1.8','3.6']` |
| `4014018/401401805` | all `['1.4','2.8']` |
| `4014018/401401809` | all `['0.4','0.8']` |
| `2034010/203401001` | primary `['2']`，等值分支去重 |
| `4014018/401401801` | primary `['1.2','2.4']`，来自回调 |
| `4014018/401401802` | 无标签 `['0.9','1.1','1.8','2.2']` |
| `4014018/401401806` | all `['8.0','16.0']`，每臂分别聚合五击 |
| `4014012/401401201` | primary `['2.2']`，未知分支省略 |
| `4064012/406401204` | primary `['6','42']`，不生成 `48` |
| `8003050/800305004` | primary `['4.5']`，循环内值不按次数放大 |

`4014012/401401207/208` 当前每击数值来源仍不可静态解析，详情继续缺席；其拒绝依据是数值，不是 Bounce 包装。

## 8. Coverage impact

实施前后均使用相同上游、相同构建器联接及具体 binding 去重口径。完整 domain 与页面可达集合分别计数；两种口径不混用。

| 指标 | 前 → 后 |
| --- | ---: |
| 完整 domain：有伤害 binding | 2,908 → 4,778 |
| 完整 domain：唯一 Skill ID | 588 → 1,032 |
| 完整 domain：含已知目标 binding | 2,908 → 4,141 |
| 完整 domain：含无标签目标 binding | 0 → 760 |
| 页面可达：有伤害 binding（zh-CN/en 相同） | 2,864 → 4,673 |
| 页面可达：唯一 Skill ID | 574 → 1,003 |
| 页面可达：含已知目标 binding | 2,864 → 4,076 |
| 页面可达：含无标签目标 binding | 0 → 720 |

已知／无标签集合可重叠，两种口径均有 123 个 binding 同时包含二者。覆盖增长不作为正确性证明。

额外从 Git HEAD 临时加载原构建器，与新构建器比较 5,048 个前后有任一详情的绑定：原有伤害 binding 丢失数为 0，`applications`／`actionShifts` 差异数为 0。临时旧代码在比较后删除。

## 9. Target degradation and diagnostics

Retarget 内部及局部序列中可能受其影响的后续实体角色省略目标标签；不反向降级 Retarget 之前已经聚合的伤害。Ability 自身其他回调若可能受到其 `OnStart` 重定向影响，也采用无标签角色。明确的全体／敌方侧集合及已审核标记映射保留。

`401401802` 的页面伤害数据确切为：

```json
[{ "multipliers": ["0.9", "1.1", "1.8", "2.2"], "scaling": "attack" }]
```

UI 显示 `90% / 110% / 180% / 220%` 与本地化 ATK 单位，省略目标子标签，不显示 Unknown target。复用现有消息键，暂用“可能的伤害倍率”／“Possible Damage Multipliers”；没有新增卡片或警告。

新诊断按每个 binding 的不同原因去重，仅构建期回调输出：未解数值 398、未支持表达式 268、负值 4、目标未映射 605、目标降级 163。前三类是数值拒绝，后两类是保留数值后的标签说明；计数可重叠，不是互斥失败桶。

## 10. Technical-debt cleanup

- 删除 `structuralDamageRows`、`DamageOccurrence`、Ability 级 unsafe map，以及同目标跨 Ability／条件整体拒绝逻辑：候选集合不再需要完整执行结果证明。
- 删除旧 `reviewedConditionalDamageRows`：死亡伤害可由通用收集器处理，标记知识只保留在窄目标映射中。
- 删除 Chance／行动变化遍历中的 `marker`、`abilityName` 和 skillId 参数：这些仅供旧伤害解析使用。保留其原有 conditional 规则。
- 移除 `damage-no-supported-task`、`damage-not-linear`、`damage-conditional`、`damage-multiple-abilities`、`damage-runtime-mutation`、`damage-unsupported-target` 旧诊断及专属类型。
- 删除／改写“条件、跨 Ability、附近改值或未知目标必须隐藏所有伤害”等测试；保留数值拒绝反例和局部聚合回归。
- 迁移旧 totals helper／字段／注释，无兼容别名。现有消息键直接复用，没有新增后又遗留的消息键。

清理范围仅限本功能与必要的缓存 schema 管线。历史文档、页面一般召唤、官方描述、状态本地化和其他子系统没有删除。任务临时测量／比较脚本与快照在报告写入后删除；常规生成和审计输出保持仓库原有忽略策略。

## 11. Preserved safety gates

`enemy-skill-params.ts` 未修改。仅接受固定值、`AQAR` 直接 SkillParam 和既有严格形状的 `AQAAAAQR`。缺哈希、非 SkillParam 数据源、缺 trigger、越界／负数／非整数索引、缺操作数、未知表达式字段、畸形十进制和未支持 opcode 继续未解析。伤害必须来自 `DamageByAttackProperty.AttackProperty.DamagePercentage`；非攻击力伤害任务不进入候选，负伤害继续省略。所有运算使用精确十进制工具。

## 12. Payload impact

字节数为 UTF-8；生成是 locale Enemy JSON 文件大小，页面是图片／链接 enrichment 前 `JSON.stringify(buildEnemyDetailPageData(rich))`。相同上游及样本，未混入完整 raw 配置。

| Locale | Enemy | 生成前 → 后 | 页面前 → 后 |
| --- | --- | ---: | ---: |
| zh-CN | `1022010` | 794,762 → 794,867 | 120,891 → 120,991 |
| en | `1022010` | 794,516 → 794,621 | 121,188 → 121,288 |
| zh-CN | Kafka `2004010` | 567,182 → 567,532 | 97,284 → 97,609 |
| en | Kafka `2004010` | 567,443 → 567,793 | 97,991 → 98,316 |
| zh-CN | `4014018` | 87,528 → 88,744 | 14,987 → 15,595 |
| en | `4014018` | 88,459 → 89,675 | 15,625 → 16,233 |
| zh-CN | `4064012` | 272,240 → 273,368 | 35,488 → 36,432 |
| en | `4064012` | 276,029 → 277,157 | 36,855 → 37,799 |

遍历双语生成详情共 10,798 个伤害组，未发现旧 `totals` 或 raw Ability、Predicate、Callback、DynamicHashes、ReadInfo、PostfixExpr、ModifierName、诊断字段。双语生产 `__data.json` 和默认技能静态 HTML 也核查通过。

## 13. Tests

更新参数／解析、Monster 变体、双语投影、格式、Skill Browser 及 Enemy Detail 浏览器测试；新增 SSR 组件测试，覆盖已知／无标签组并存、目标标签省略、多值格式和空事实区隐藏。合成解析测试覆盖分支局部聚合、回调局部聚合、跨上下文不求和、未知兄弟不形成部分和、循环不乘次数、目标隔离、Retarget 降级、后置 Retarget 不影响既有聚合、无关运行时写入及不可解运行时依赖。

真实 fixtures 包括上表全部样本，保留 Kafka 基础概率／行动变化、具体 Monster 参数覆盖、横扫和标记角色回归。缓存测试新增旧 schema 拒绝。测试不固定可修改站点消息文案。

最终 10 个相关 Vitest 文件共 163 项通过；类型 fixture 修正后另外复跑 2 项 SSR 测试通过。浏览器新增双语候选切换测试明确先切换第二阶段再选择 `401401802`。

## 14. Validation

| 检查 | 结果 |
| --- | --- |
| `pnpm data:sync` | tsx CLI IPC 返回 EPERM；同入口 `node --import tsx scripts/data/sync.ts` 通过 |
| 完整数据验证 | `node --import tsx scripts/data/validate-full.ts` 通过，包含独立 build-input 校验、语义审计与双语结构检查 |
| `pnpm check` | messages 的 tsx CLI IPC 返回 EPERM；等价入口分别执行并通过，见下文 |
| 消息、Svelte／TS | Node 执行消息校验编译；`svelte-kit sync`、`svelte-check`、scripts/API 两项 `tsc --noEmit` 通过；0 错误、0 警告 |
| 定向 Prettier／ESLint、diff whitespace | 通过 |
| 生产构建 | Node 执行 data ensure、assets ensure、benchmark validation，再 `pnpm exec vite build` 通过，adapter-static 写入 `build` |
| Enemy Detail Playwright | 复用生产构建、desktop/mobile、单 worker、零重试尝试；预览服务器监听 `127.0.0.1:4173` 返回 EPERM，未执行浏览器用例 |
| 静态核查 | 两种语言下 `1022010`、Kafka、`4014018`、`4064012` 默认技能数值与迁移页面数据通过 |

完整数据验证沿用既有缺失 TextMap（533 个中文 TextHash）和弱点／抗性提示，最终通过；未将这些提示归因于本次迁移。没有重新尝试绕过浏览器环境限制，没有远程部署。最终 diff 检查通过，两个外部仓库 Git 状态与开始时相同（均干净）。

## 15. Remaining limitations

未支持 opcode、未知缩放形式和不能解析的数值来源仍省略。未映射目标或无法确认的实体归属以无标签候选保留；未知包装器的内部值可以保留，但不扩大其局部聚合证明。条件和回调是否触发不属于此静态数据库功能的目标。

浏览器交互未验证：在允许本地服务的环境复核双语 `4014018` 第一／第二阶段切换及无标签行、Kafka 选择与数值、具体 Monster 覆盖，以及手机布局。SSR 和静态数据检查不能替代这些交互检查。
