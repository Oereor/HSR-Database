# Enemy Skill Details V2 Phase 3：`AQAAAAQR` 有界表达式

## 1. Executive Summary

检查点 A 已完成：现有上游数据足以高置信确认 `AQAAAAQR` 的相关形状为“动态值 × 固定值”，且动态值可限定为直接读取有效 Monster `SkillParam`。检查点 B 已实施，新增 403 个页面可达伤害绑定；原有伤害绑定没有消失。倍率是配置输入，不代表最终伤害。

## 2. Raw Expression Structure

站点实际联接的伤害任务将表达式存为 `IsDynamic: true`、`PostfixExpr.OpCodes: "AQAAAAQR"`、单项 `FixedValues: [{Value: ...}]` 和单项 `DynamicHashes: [hash]`。`readRaw` 把 `Value` 包装内的原始十进制拼写保留为字符串。哈希在同一 CharacterConfig 的 `DynamicValues.Floats[hash].ReadInfo` 中映射到 `Type: "SkillParam"`、`TriggerKey`、`Index`；具体 Monster 的 `OverrideSkillParams` 按索引覆盖技能基础 `ParamList`。

Base64 解码后的 opcode 字节是 `01 00 00 00 04 11`。结合单哈希直读 `AQAR` 的 `01 00 11`、反向操作数形状 `AAABAAQR` 的 `00 00 01 00 04 11`，当前形状以动态值在前、固定值在后；字节 `04` 在跨配置样本中与乘法一致。这里不把字节推断推广成通用 VM 规范。

## 3. Evidence Set

按 `buildEnemySkillDetails` 的模板路径、Ability 联接和具体 Monster–Skill 绑定规则扫描当前上游：`AQAAAAQR` 出现于 2,880 个伤害任务、697 个具体绑定、118 个唯一 Skill ID。全部 2,880 项均为一个固定值加一个哈希，且哈希 `ReadInfo.Type` 均为 `SkillParam`。扫描全部 Monster Ability 文件时，70 个文件中有 361 个同 opcode 表达式，其中 295 个位于 `DamagePercentage`，66 个位于其他字段；因此不能按字段名推断运算。

| Monster / Skill | Ability 与任务路径 | 固定值与参数 | 乘法候选及结构证据 |
| --- | --- | --- | --- |
| `2004010/200401001` | `Monster_W2_Kafka_00_Skill01_Phase02`，`OnStart/4`、`OnStart/7` | 各 `0.5`，哈希 `-1126825319` → `Skill01[0]=2.5` | 两击各 `1.25`，合计 `2.5` |
| `1004010/100401003` | `Boss_Cocolia_P1_Skill03_Phase02`，`OnStart/8,10,12` | `0.33, 0.33, 0.34`，`Skill03[0]=5` | 权重合计 `1`，三击合计 `5` |
| `1013010/101301004` | `WMonster_W1_Mecha_02_Skill03_Phase02`，两个顶层伤害任务 | `0.7, 0.3`，`Skill03[0]=4` | 权重合计 `1`，两击合计 `4` |
| `3024010/302401005` | `Monster_W2_Argenti_00_Skill05_Phase02`，两个顶层伤害任务 | `0.2, 0.8`，`Skill05[0]=3.6` | 权重合计 `1`，两击合计 `3.6` |
| `8012010/801201001` | `Monster_AML_Minion02_00_Skill01_Phase02`，三个顶层伤害任务 | `0.25, 0.25, 0.5`，`Skill01[0]=2.5` | 权重合计 `1`，三击合计 `2.5` |

这些互不相同的敌人家族、技能与参数共同支持乘法解释。加法解释会使多击总值随任务数额外增加参数，不能解释持续出现的权重归一结构。Kafka 的游戏表现仅作合理性核对，并非单独的操作符证据。

反例搜索：站点实际联接的伤害项没有发现零值、负固定值、双哈希、双固定值或非 `SkillParam` 形状；固定值大于 `1` 的任务有 17 次。跨全部 Monster Ability 文件的 361 个同 opcode 表达式仍全为一个固定值与一个哈希；其中有 5 个固定值为零，另有非伤害字段及大于 `1` 的值。反向编码 `AAABAAQR`、双哈希 `AQABAQQR` 及其他 opcode 明确不同；它们不进入本次支持。未发现与“动态值 × 固定值”矛盾的同形状样本。配置中不存在可直接核对的同 opcode 双固定值或双哈希样本，因此这些形状由解析器明确拒绝，不据此推广语义。

## 4. Operator Semantics

结论：仅对原样字节串 `AQAAAAQR`、一个动态哈希加一个固定值的形状，将动态参数与固定十进制值相乘。操作数顺序按上面的 opcode 字节和反向编码区分；乘法交换律不用于放宽编码接受范围。信心为高，但不声称已解释整个 postfix 指令集。

## 5. Supported Bounded Shape

`resolveSkillValue` 仅在原样 opcode、恰好三个已知 `PostfixExpr` 字段、一个安全整数哈希、一个仅含 `Value` 的固定十进制包装，以及直接 `SkillParam` ReadInfo 和有效索引同时满足时，用 `multiplyDecimals` 算乘积。已有 `AQAR` 直读路径保留原接受规则。参数仍通过 `effectiveSkillParams` 从基础列表与具体 Monster 覆盖合成。新乘积进入 Phase 2 原有的目标分组与同路径求和；含新乘积的总值只去除无意义的小数尾零，使 Kafka 的公开数值为 `2.5`，原有直接值的拼写不变。

## 6. Rejected Shapes

双哈希、双固定值、缺少操作数、附加表达式字段、嵌套值、非十进制固定值、非 `SkillParam` ReadInfo、缺失或无效索引、无对应 trigger 参数及其他 opcode 全部保持未解析。反向操作数编码 `AAABAAQR` 即使可能也表示乘法，本阶段仍不接受。负伤害仍由原有伤害门槛拒绝。

## 7. Kafka Walkthrough

`2004010/200401001` 的 `Skill01[0]=2.5`；`Monster_W2_Kafka_00_Skill01_Phase02` 的 `OnStart/4` 与 `OnStart/7` 均使用哈希 `-1126825319` 和固定值 `0.5`。每击精确得到 `1.25`；原有同路径聚合得到主目标 `totals: ['2.5']`。独立的 `AddModifier.Chance=1` 继续产生 100% 基础概率。`200401004` 继续保留 `1.2` 基础概率与 `1` 行动提前。

## 8. Additional Fixtures

`1013010/101301004` 的 `0.7+0.3` 权重乘 `4`，全体总值 `4`；`3024010/302401005` 的 `0.2+0.8` 乘 `3.6`，全体总值 `3.6`；具体 Monster `302401013` 将同技能参数覆盖为 `1.75`，总值也为 `1.75`；`8012010/801201001` 的 `0.25+0.25+0.5` 乘 `2.5`，主目标总值 `2.5`。这些技能来自不同敌人家族。

`1004010/100401001` 的条件任务、`1003010/100301002` 的跨 Ability 任务及 `1004010/100401003` 的非线性执行，即使内含可解表达式也继续没有伤害行。

## 9. Coverage Impact

| 口径 | 实施前 → 后 |
| --- | ---: |
| 完整构建期 domain 有伤害的绑定 | 2,501 → 2,908 |
| 完整构建期 domain 唯一伤害 Skill ID | 526 → 588 |
| 中文页面可达绑定中有伤害者 | 2,461 → 2,864 |
| 中文页面可达唯一伤害 Skill ID | 516 → 574 |

页面可达绑定全集仍为 11,645。697 个 `AQAAAAQR` 候选绑定中，407 个通过原有结构门槛并在完整 domain 新增伤害；290 个仍无伤害。页面可达候选为 693 个，其中 403 个新增伤害、290 个仍被拒绝，另外 4 个候选不在页面可达集合。没有旧伤害绑定消失。290 个拒绝绑定的诊断分别为条件路径 200、跨 Ability 59、非线性 15、目标不支持 11、运行时改值／重定向 5；这些计数在该候选集合中刚好各对应一个主因。覆盖增长只是结果测量，不作为运算语义的证据。

## 10. Safety Gates

表达式解析只返回构建期十进制值；原有结构解析器继续决定是否发布。`SuccessTaskList`／`FailedTaskList`、循环／Bounce、跨 Ability、运行时改值、未知目标和已有的窄范围例外均未扩展。没有新增目标别名或推断阶段关系。未恢复期限、技能召唤、DoT、韧性或战斗模拟。

## 11. Projection/UI

未改产品类型、投影、组件、站点消息或样式。中文与英文生成详情均有 Kafka `['2.5']`、基础概率 `1`；言灵仍为 `1.2` 与行动提前 `1`。抽查 Kafka、`1013010` 与现代 Boss `8012142` 的中英文生成详情，均无 `OpCodes`、`DynamicHashes`、`ReadInfo`、`PostfixExpr` 或 `ModifierName`。生成文件 UTF-8 字节数分别增加：Kafka 中文／英文各 952，`1013010` 各 2,117，`8012142` 各 136；增长来自新增数值详情。静态生产 HTML 中 Kafka 默认技能显示中文 250% 攻击力、英文 250% ATK。

## 12. Tests

定向 Vitest 四文件 65 项通过：表达式小数／零值／Monster 覆盖、拒绝形状、Kafka、三个无关正例、真实变体、条件及跨 Ability 反例、既有直接伤害和 Chance／行动变化。投影测试核对中英文详情及无原始字段。Enemy Detail 的浏览器用例已更新 Kafka 的 250% 断言，但本环境未能执行，见下节。

## 13. Validation

使用 Node 24.19.0、pnpm 11.9.0、网站 `develop` 与只读上游 `6b2bc17ebf46`。`node --import tsx scripts/data/sync.ts`、`node --import tsx scripts/data/validate-full.ts`、消息校验、`svelte-kit sync`、`svelte-check`、scripts/API TypeScript 检查、定向 Prettier 与 ESLint、生产 `vite build` 均通过。数据验证仍报告已有的 TextMap 缺项及弱点／抗性提示。

本沙箱拒绝 `tsx` CLI 创建本地 IPC 管道，因此 `pnpm data:sync` 与 `pnpm check` 的包装命令不能启动；上述相同入口改由 Node `--import tsx` 执行。Playwright 预览服务器绑定 `127.0.0.1:4173` 时返回 `EPERM`，没有可用的浏览器测试结果。静态构建的中英文 Kafka HTML 与数据文件已检查；在允许本地服务的环境仍需手动核对 Kafka 技能切换、言灵概率／行动提前、`102201001` 直接伤害与一个复杂技能的伤害缺席。

## 14. Next Recommendation

下一个最小阶段可单独调查目前被条件路径挡下的窄成对分支是否有可证明的完整结果集。不要顺带支持其他 opcode、循环／Bounce 或新目标别名。
