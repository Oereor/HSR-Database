# HSR-Database Data Agent Phase 1.3 Capability Gap Investigation

日期：2026-09-16  
调查分支：`develop`  
调查提交：`43b9ae8c419212c89440cfff747b570d6fdcf5bf`  
调查性质：只读代码级调查；除本报告外未修改 source、tests、tool schema、prompt、runtime、eval 或配置；真实模型调用数为 0。

## 1. Executive Summary

本轮调查验证了三个真实 capability gap，但它们不支持新增第四个 tool，也不支持把当前工具扩张为通用 Query DSL。

| 失败模式 | 代码级结论 | 最小修复层 |
| --- | --- | --- |
| 弱点频率需要 7 次聚合 | `aggregate_endgame` 没有 multi-valued categorical grouping；当前一次只把一行映射到一个 group key | 在现有 `aggregate_endgame` 增加明确为 explode 语义的 `weakness` group dimension |
| 每期最高/最低 HP 无法同时得到敌人身份 | 当前 `min/max` 只保留标量，产生标量的 row identity 在 `metricValue()` 后丢失 | 在现有 `aggregate_endgame` 增加 bounded `argMin/argMax`；暂不增加 top-K |
| Search ID 被放入 `monsterIds` | enemy search 的裸 `id` 实际是 `MonsterTemplateID`，但输出没有声明 namespace | 把 enemy search identity 显式类型化；当前最小形状是 `enemyTemplateId` |
| 只有 1 期数据仍继续探索 | prompt 只有笼统的“数据不足时说明限制”，没有 observation threshold 或 identity-first stop flow | system/finalization planning contract |
| 最终回答泄漏 `groupId`、`configured-occurrence` 等 | tool/prompt 大量使用内部词汇，final schema 只约束形状与长度，没有 presentation policy | system/finalization presentation contract；不新增格式化 tool |

三个案例共同揭示的结构性问题是：模型在用重复调用或长上下文模拟缺失的有限代数；类型信息没有跨 tool 保真；runtime 约束了 JSON 和 evidence，却没有约束何时停止以及如何把内部模型翻译为用户语言。

最终 Tool Surface 建议选择：

> **A：保持 `search_entities`、`query_endgame`、`aggregate_endgame` 三个 tools，不新增第四个 tool；只在 `aggregate_endgame` 增加一个 multi-valued categorical group dimension 和 bounded `argMin/argMax`，同时加固现有 cross-tool identity、stopping 与 presentation contracts。**

Phase 1.3 值得实施，但应保持小范围：

1. `weakness` explode grouping；
2. `argMin/argMax` associated-dimension extrema；
3. typed enemy identity handoff；
4. observation-aware stopping rule；
5. final-answer presentation boundary。

不建议本轮实现：top-K per group、resistance grouping、第四个 tool、per-group query/window syntax、提高 turn limit、Evidence Graph、format-answer tool 或任意 SQL/表达式能力。

## 2. Current Phase 1.2 Architecture

### 2.1 调查事实来源

本报告完整阅读并交叉核对：

- `agent-data-tools-feasibility-2026-09-15.md`；
- `agent-phase1-experiment-2026-09-15.md`；
- `agent-phase1-1-protocol-hardening-2026-09-15.md`；
- `agent-phase1-2-thinking-ab-2026-09-15.md`；
- 当前 contracts、tool registry、normalized row、query、aggregate、runtime、Inspector、deterministic tests、eval schema 与 24 dev + 12 held-out frozen corpus；
- 当前 generated Search、Enemy detail、Endgame 数据；
- 用户提供的三个 dogfooding trace。

当前工作区没有 `data/audit/agent/manual/` 中对应三个案例的保存文件，因此没有把缺失的 manual audit 当作证据，也没有为了复现调用 DeepSeek。仓库中已有的 Phase 1.1 audit 仅用于核对 presentation leakage 是不是孤立现象；当前代码和本轮本地 deterministic tool execution 优先。

### 2.2 当前数据与工具链

```text
Search V2 / generated Endgame / Enemy detail / manifest
                           ↓
          normalized configured-occurrence row
                           ↓
 search_entities | query_endgame | aggregate_endgame
                           ↓
    bounded 4-turn / 8-call runtime + evidence ledger
                           ↓
  { answer, evidenceIds, limitations } bounded final JSON
```

- `search_entities` 复用 Search V2 的 normalization、FlexSearch 与 ranking，排除 `endgame` locator document，只返回普通 catalog entity。
- `query_endgame` 对 normalized rows 做 allowlisted filter、global sort、projection 和 bounded row retrieval。
- `aggregate_endgame` 对同一批 rows 做 bounded groupBy 与标量聚合。
- normalized row 的固定 grain 是一个 Endgame 配置位置，内部同时保留 season、encounter、battle slot、stage、wave、template、Monster 与 occurrence evidence。
- evidence namespace 已稳定为 `ent1`、`eg1`、`ag1`；runtime 只登记显式 evidence 字段。
- Phase 1.2 的 thinking-low 已改善规划，但没有改变 tool algebra、identity shape、4-turn/8-call 限制或 presentation contract。

### 2.3 当前边界中已经做对的部分

- Query 与 Aggregate 分离合理：一个返回具体 rows，一个返回确定性 summary。
- DecimalString 的比较、求和与平均没有发现精度错误。
- exact Monster join、PF configured-row warning、runtime-unclear HP、latest/current 区分均应保留。
- payload、row、group、metric 与 turn limits 是有效边界，不应因三个案例移除。
- `ag1` 已能引用聚合结论，不需要新的 provenance framework。

## 3. Dogfooding Case A — Weakness Frequency

### 3.1 复核结果

当前 schema 中：

- filter 有 `weaknessesAny`；
- `groupBy` 只有 `mode | season | encounter | battleSlot | stage | wave | enemyTemplate | monster`；
- 没有 `weakness`；
- `groupRows()` 对每行只调用一次 `dimensionsFor()`，生成一个 JSON group key。

因此当前聚合引擎确实不能直接表达“按 weakness 分类计数并排序”。模型只能预先知道七种元素，然后分别用 `weaknessesAny:[element]` 调用七次。

用当前 deterministic tool 对相同请求复核：

| Weakness | configured-occurrence rows | 单次结果字节数 |
| --- | ---: | ---: |
| Physical | 18 | 521 |
| Fire | 25 | 521 |
| Ice | 13 | 521 |
| Lightning | 21 | 521 |
| Wind | 4 | 517 |
| Quantum | 22 | 521 |
| Imaginary | 13 | 521 |

七次结果合计仅 3,643 bytes，因此主要问题不是 payload，而是 tool-call algebra：7 次调用已接近总计 8 次的 runtime hard limit，还要求模型完整枚举分类域、合并结果和排序。任何一次参数修正或后续 drill-down 都会触及上限。

### 3.2 限制性质

这最初是 deliberate MVP limitation：Phase 1 只实现了有限 single-valued dimensions。但真实 dogfooding 已证明它也是一个 missing generic primitive，而不是某个题目的专用需求。弱点是 Endgame row 上已有的、规范化的、有限枚举的 categorical data；它不是新数据源，也不需要新 tool。

### 3.3 Presentation leakage

Case A 的答案出现“按 groupId 取最新3个赛期”和“configured-occurrence 行”。当前 prompt 教模型使用这些词，却没有要求最终回答翻译它们。仓库已有 audit 也多次出现 `groupId`、`battleSlot`、`enemyTemplate`、`templateId`、`occurrence`、`hpPerBar`，说明这不是一次偶发措辞。

用户实际需要的是“按数据库中的最近三期”和“每条敌人配置记录”，通常不需要知道内部排序字段或 row grain 名称。

## 4. Dogfooding Case B — Per-Season HP Extrema

### 4.1 当前 algebra 的实际输出

对最近 6 期 MoC、Boss-only 的当前数据复核：

- 匹配 50 个 configured-occurrence rows；
- 按 `season + enemyTemplate` 分成 46 groups；
- `minHp + maxHp + avgHp` 的聚合输出为 27,014 bytes；
- 没有 truncation，但结果中包含远多于最终任务所需的 groups。

用户真正需要的是每期两个 extrema 与对应敌人，共 12 个 bounded facts，而不是 46 个 template group 的三个统计量。

### 4.2 为什么当前 `min/max` 不能回答“对应谁”

`metricValue()` 的当前流程是：

```text
rows
  → 提取 numeric values
  → 比较出一个 DecimalString
  → 只返回 value / includedRows / skippedUnresolvedRows
```

产生 extremum 的 row 在函数返回前被丢弃。`modelGroup()` 只序列化标量 metric；`ag1` 引用整个 group，但结果中没有 associated enemy identity。

把 `enemyTemplate` 加入 groupBy 不等价于解决问题：它把每期拆成多个 template group；引擎没有 second-stage “在每个 season 的 template groups 中再取最大/最小”能力。模型被迫在 46 组中手工执行第二层 aggregation。

### 4.3 当前 query 能否替代

当前 `query_endgame` 可以返回所有 50 行，并按 `groupId DESC, hpPerBar DESC` 排序。包含 location、identity、instance-stats 时输出 33,369 bytes。它足够让一个模型离线扫描全部 rows，但不能表达“每个 season 取 1 行”：

- sort 是全局 sort；
- limit 是全局 limit；
- `limit:6` 会先截取最新 season 的若干行，不会每季取一行；
- 同时求最高与最低需要模型读完整 50 行，或做多次 season-specific query；
- projection 粒度较粗，`instance-stats` 会带上本题不需要的 speed、toughness、phase 与 effective HP 字段。

一个当前可行但不理想的 plan 是：

1. `aggregate_endgame groupBy:season` 取 `minHp/maxHp`，当前约 2,553 bytes；
2. `query_endgame` 拉回 50 行 identity + location + stats，当前约 33,369 bytes；
3. 模型按 season 和 DecimalString 值关联出敌人并处理 tie。

合计约 35,922 bytes，能够完成这个具体六期样本，但把确定性 join、tie handling 和 per-group selection 推给了模型；数据规模增长或 64 KiB 截断时会失效。因此“现有能力完全不能回答”并不准确，但“现有 algebra 不能自然、紧凑、确定性地回答”成立。

## 5. Dogfooding Case C — Named Enemy HP Trend

### 5.1 当前 stable enemy ID 到底是什么

`search_entities` 的 enemy document 来自 `catalogs.enemies`。Enemy domain 的 `id` 由 `MonsterTemplateConfig.MonsterTemplateID` 生成；projected `Enemy.id`、`Enemy.template.monsterTemplateId` 与 catalog ID 相同。

所以：

> **当前 `search_entities(type:"enemy")` 返回的 `id` namespace 是 Enemy catalog identity，具体等于 `MonsterTemplateID` / enemy template ID，不是 concrete `MonsterID`，也不是 occurrence ID 或 SearchDocument key。**

`search_entities` 返回的 `ent1/enemy/...` 是 citation ID，也不是可用于 Endgame filter 的数据 ID。

### 5.2 当前 cross-tool contract 的歧义

Search 输出只有：

```json
{"type":"enemy","id":"4014020"}
```

而 Endgame filter 同时接受：

```text
enemyTemplateIds: number[]
monsterIds: number[]
```

tool description 只称其为 “stable entity identity”，没有声明 enemy `id` 的具体 namespace。模型确实需要根据一个裸数字自行猜应填入哪一个数组。Case C 把 template IDs 放进 `monsterIds`，正是一个真实 cross-tool contract failure。

由于 canonical Monster 通常满足 `MonsterID == MonsterTemplateID`，错误 namespace 在部分数据上会碰巧命中，反而更危险：它不会稳定报错，而会静默缩窄结果。

### 5.3 三个 search matches 的真实含义

当前 Search 结果为：

| Rank | ID | Match | Canonical name | Identity |
| --- | --- | --- | --- | --- |
| 1 | 4014020 | exact | 颁赐者，千军首，天谴之矛 | enemy template |
| 2 | 4014021 | exact | 颁赐者，千军首，天谴之矛 | enemy template |
| 3 | 4014022 | prefix | 颁赐者，千军首，天谴之矛（完整） | enemy template |

它们不是三个 Monster records：每个都是独立 template，且各自拥有一组 concrete Monsters。4014020 与 4014021 同名、同描述和同 base HP；4014022 名称带“（完整）”，base HP 也不同。当前数据模型没有显式 `enemyFamilyId` 或 variant relation，Search V2 也没有把它们建模成一个 family；只能证明同名/前缀，不能证明业务上应自动合并。

当前 Endgame Search target 只存在 4014020。使用正确 `enemyTemplateIds:[4014020,4014021,4014022]` 查询最近 6 期 MoC，仍只有 1031 期一个 observation；使用错误 `monsterIds` 在这个窗口也碰巧返回同一行。扩大到全部 MoC 历史，4014020 出现在 1031、1026、1023、1022、1021 共 5 期，但这不再是用户要求的“最近 6 期”。

### 5.4 正确的停止点

在 typed identity 已验证后，最近六期只有一个有效点。这时应结束：可以报告该期数值以及其余请求期没有可比较 observation，但不能描述上升、下降或趋势，也不能擅自扩大到更早赛期后仍声称回答了最近六期。

Case C 的失败不是 4-turn limit 太低。正确 plan 最多需要：

1. search/name resolution；
2. typed template-filtered Endgame aggregate/query；
3. final answer。

错误 namespace、无阈值的继续探索和扩大范围才消耗了 turns。

## 6. Shared Failure Patterns

三个案例放在一起后，结构性模式如下：

1. **模型模拟缺失代数**：Case A 用七次 filter 模拟 categorical group；Case B 用 46 groups 和大段 reasoning 模拟 associated extrema。
2. **identity namespace 丢失**：Search 的 catalog/template identity 到 Endgame filter 时退化为裸数字。
3. **result volume 与任务信息量不匹配**：Case B 只需 12 个结果，却返回 46 groups / 27 KB；问题不应通过提高 context 或 output token limit 解决。
4. **缺少 stopping discipline**：Case C 已没有足够 observations，模型仍继续扩大查询。
5. **内部词汇穿透 presentation**：tool 和 prompt 的术语直接进入 answer。
6. **现有边界并非整体失效**：三个工具的职责仍清晰；问题都可在现有 aggregate/search/prompt contracts 内局部修复。

不是结构性问题的项目：

- DecimalString 比较与 aggregation correctness；
- evidence namespace 数量；
- 4-turn hard limit；
- 是否需要通用 SQL、window AST 或第四个场景 tool；
- 是否需要更多真实模型调用才能确认 provider compatibility。

## 7. Current `aggregate_endgame` Capability Audit

### 7.1 完整真实能力

| Surface | 当前支持 |
| --- | --- |
| Filter dimensions | `modes`；explicit season keys；latest-per-mode；`statuses`；encounter ID/ordinal/variant；battle slot；stage ID；level；wave number/ID；enemy template ID；MonsterID；raw rank；rank category；`weaknessesAny` |
| Season semantics | latest 按各 mode 的 `groupId DESC`；默认排除 upcoming；current 只由 schedule 证明；latest count 最大 20 |
| GroupBy dimensions | `mode`、`season`、`encounter`、`battleSlot`、`stage`、`wave`、`enemyTemplate`、`monster`；最多 3 个 |
| Metric operations | `rowCount`、`countDistinct`、`min`、`max`、`avg`；最多 5 个且 alias 唯一 |
| Numeric fields | `hpPerBar`、`speed`、`toughnessPerBar`、`level` |
| Distinct identities | `seasonKey`、`encounterKey`、`stageKey`、`waveKey`、`enemyTemplateId`、`monsterId` |
| Sort | 最多 5 项；只能按已声明 dimension 或 metric alias 排序；相等时按 dimensions JSON deterministic tie-break |
| Limits | 默认 20 groups；hard max 100；完整 payload 64 KiB；显式 group/payload truncation warning |
| Evidence | 每个返回 group 一个 `ag1/<sha256>`；哈希包含 data revision、canonical filter/groupBy/metrics、group dimensions；不受 output sort/limit 影响 |
| Missing/unresolved | numeric metrics 分别返回 included/skipped unresolved counts；warning 保留 PF、HP、speed、toughness 等语义 |

### 7.2 限制分类

| 限制 | 分类 | 判断 |
| --- | --- | --- |
| 最多 3 group dimensions、5 metrics、100 groups、64 KiB | intentional MVP limitation | 应保留 |
| 只有 allowlisted fields/ops，无表达式和 join | intentional MVP limitation | 应保留 |
| PF rowCount/avg 是配置行语义 | domain semantic limitation | 不能用新 algebra 消除 |
| unresolved stats 与 runtime-unclear total HP | domain semantic limitation | 不能用新 algebra“补全” |
| weakness 只能 filter，不能 group | 已被 dogfooding 证明的 missing generic primitive | 建议补充 |
| row 只能贡献一个 group key | implementation limitation | 为 explode grouping 做小型重构 |
| min/max 丢失产生值的 row | 已被 dogfooding 证明的 missing generic primitive | 建议补充 argMin/argMax |
| aggregate 无 second-stage aggregation | deliberate stopping line | 不应实现任意二次聚合；arg extrema 可直接在 source rows 上解决 |
| query 无 per-group limit | intentional query limitation | 不建议演化为 window query |
| resistance 无 filter/group/metric | 尚未被真实请求证明，且语义比 weakness 复杂 | 本轮不扩 |

## 8. Categorical / Multi-valued Grouping

### 8.1 当前 row representation

每个 normalized row 的 weakness 是 exact Monster join 后的数组：

```ts
weaknesses: Array<{ element: ElementType; name: string }>
```

上游对单个 Monster 的 weakness code 已去重。`weaknessesAny` 是 existential filter：数组中任一元素匹配即可保留整行。它不能替代 groupBy。

### 8.2 推荐语义：explode

如果加入 `groupBy:"weakness"`，应明确采用 explode semantics：

```text
row weaknesses = [Fire, Lightning, Quantum]
→ Fire bucket +1
→ Lightning bucket +1
→ Quantum bucket +1
```

这与用户问“弱点属性出现次数”最一致。不是把一整组 weakness array 当成一个组合类别，也不是平均分摊 1/3。

具体 metric 语义：

- `rowCount`：该 weakness 出现在多少条匹配的 configured-occurrence row；同一 row 对同一 weakness 最多贡献一次。
- `countDistinct`：在该 weakness bucket 内按所选 identity 去重；一条拥有多个 weakness 的 row 可分别进入多个 bucket。
- `min/max/avg`：在每个 exploded bucket 内对原 row 的 numeric value 计算；同一 row 可对多个 weakness group 各贡献一次，但不会在同一 group 重复。
- 顶层 `sourceRows` 仍是 explode 前的匹配行数；各 group 的 `sourceRows` 是该 category 的 assignment rows，因此 group counts 之和可以大于顶层 sourceRows。
- 空 weakness array 不产生 group。unresolved detail 继续发 `UNRESOLVED_ENEMY_DETAIL`；合法的“无弱点”与解析失败不应被伪造成某个元素。

输出应显式带稳定的 grouping metadata 或 warning，说明 `weakness` 是 multi-valued/exploded dimension，避免调用者误以为 groups 互斥。无需改变 row grain。

### 8.3 实现边界

应在 aggregation engine 中抽象“一个 dimension 可返回一个或多个 values”，而不是为七种元素写七条分支。但 Phase 1.3 只暴露已被证明需要的 `weakness`。

为了避免未经审查的 Cartesian explosion，建议：

- 一次 aggregate 最多允许一个 multi-valued group dimension；
- 与普通 dimensions 组合时，先生成普通 key，再为每个 weakness 生成 assignment；
- 不支持两个 multi-valued dimensions 的交叉组合；
- 不支持用户定义 explode path。

### 8.4 为什么暂不加入 resistance

Resistance 不是 weakness 的简单同构：当前数组只保留非零 resistance，并包含 element、localized name 与 numeric value。按 element 分组、按 `(element,value)` 分组、统计“有抗性”还是聚合 resistance value 都是不同问题。当前没有真实 dogfooding 证明需要哪一种。

因此应建立可复用的 multi-valued dimension engine，但 Phase 1.3 schema 只增加 `weakness`。这避免把一个已证实 gap 扩张为未定义的 resistance analytics。

## 9. Extremum Selection Design

### 9.1 Current min/max

优点：schema 小、DecimalString comparator 已稳定、每个 group 只返回一个标量。  
缺点：不能返回产生 extrema 的 identity/location；`groupBy enemyTemplate` 只能把问题转成更多 groups，不能做 per-season winner selection。

这不是 prompt 可以完全修复的缺口，因为 identity 已在 deterministic metric computation 中被丢弃。

### 9.2 `argMin / argMax`

概念形状：

```text
groupBy season
argMax(field=hpPerBar, select=enemyTemplate)
argMin(field=hpPerBar, select=enemyTemplate)
```

它适合当前架构：group bucket 已保留 source rows，numeric comparator 已支持四个 numeric fields，只需在选择 extremum 时保留 matched rows，并把 bounded associated dimensions 序列化。

建议结果至少包含：

```text
value
associated[]
tiedRowCount
tieCount               # 按 select tuple 去重后的 tie 数
returnedTies
tiesTruncated
includedRows
skippedUnresolvedRows
```

`associated` 使用 allowlisted select dimensions，不允许任意 path。首期最小选择可覆盖 `enemyTemplate`、`monster` 与必要的 location identity；每个 associated item 应 deterministic 排序。`ag1` 继续引用整个 group/metric 结论。

通用性成立：相同 primitive 可回答 per-season HP highest/lowest、per-mode speed highest enemy、per-season toughness lowest enemy、level extrema 等，不是 HP 专用操作。

### 9.3 Top-K per Group

Top-K 比 arg extrema 表面上更通用，但会引入更大的 query language：

- per-group `orderBy`；
- `take K`；
- row projection；
- asc/desc 两套调用或多个 selector；
- K 与 ties 的关系；
- row duplication/dedup；
- 更容易返回大 payload。

它可回答“每期最高三个 Boss”，但本轮没有真实场景证明 K > 1 是必要能力。对于同时最高和最低，top-K 通常需要两个 selector 或两次调用；`argMin + argMax` 可在同一 group pass 中完成。

加入 top-K 会让 aggregate 接近 window function executor，是 premature Query DSL。Phase 1.3 不建议实现。

### 9.4 `query_endgame` Alternative

当前 query 对“全局最高一行”很好用，frozen corpus 已有 `sort hp DESC + limit 1`。它不适合 per-group extrema，因为 limit 不是 partitioned limit。

可选改进只剩两类：

1. 拉回全部 rows 让模型处理：在当前 Case B 是 50 rows / 33,369 bytes，可行但不紧凑、不确定性高；
2. 给 query 增加 partition/order/take：这实际上就是 window function，应拒绝。

因此不应为了 Case B 增强 query。保留 query 做具体 row retrieval 和 global top row；per-group associated extrema 属于 aggregate responsibility。

### 9.5 Recommendation

Phase 1.3 只实现 `argMin/argMax`，不实现 top-K。两者不需要同时存在。

Tie policy：

- 不静默用 template ID 选一个 winner；
- 返回全部 distinct selected ties，设置 hard cap；
- 同时返回完整 `tieCount/tiedRowCount`；
- 按 selected identity 再按 structural evidence ID deterministic 排序；
- 超限时显式 `tiesTruncated` 与 warning；
- 最终答案应告诉用户“并列”，而不是把 deterministic tie-break 伪装成业务结论。

## 10. Cross-tool Entity Identity Contract

### 10.1 候选设计比较

| 设计 | 优点 | 问题 | 结论 |
| --- | --- | --- | --- |
| A `{type:"enemy",id}` | 最小、与当前一致 | `enemy` 没说明 family/template/Monster；正是当前 failure | 不足 |
| B `{type,identity:{kind:"enemyTemplate",id}}` | 最统一，可扩展到 avatar/equipment/relicSet；namespace 明确 | schema 更深；仍需模型把 kind 映射到现有 filter field | 可接受的通用设计 |
| C `{type:"enemy",enemyTemplateId}` | 与当前数据模型和 `enemyTemplateIds` 直接同名；最难误用；改动最小 | 输出 union 对不同 entity type 会有不同 ID 字段 | **Phase 1.3 推荐** |
| D `{filterRef:{kind,id}}` | 可直接 handoff | Search 与 Endgame filter 强耦合；character/light-cone/relic 没有对应 Endgame filter | 不推荐 |

### 10.2 推荐

当前只有 enemy identity 会跨入 Endgame。因此最小、安全的 Phase 1.3 contract 是 C-shaped discriminated output：enemy match 显式返回 `enemyTemplateId`，而不是让裸 `id` 承担未声明的 namespace。其他 entity 可继续拥有各自稳定 catalog ID；若未来确实需要统一跨工具 identity algebra，再演进为 B。

同时应在 tool description 明示：

```text
search_entities enemyTemplateId → query/aggregate filter.enemyTemplateIds
MonsterID 只能来自 concrete Monster/Endgame row，不得由 enemy search id 推断
```

可保留旧 `id` 作为一段兼容期的数据值，但模型-facing contract 不应继续只暴露裸 `id`。TypeScript output type 与 deterministic test 必须表达 namespace；不能只依赖 prompt 说明。

## 11. Enemy Template / Monster / Occurrence Semantics

当前四层 identity 应明确分开：

| Grain | 当前含义 | 典型用途 |
| --- | --- | --- |
| Display-name concept / family | 当前没有稳定 ID 或显式关系 | 不能只凭同名自动建立 |
| Enemy template | `MonsterTemplateID`；Search enemy catalog 的稳定 identity | 跨赛期“这个敌人类型”统计 |
| Concrete Monster | `MonsterID`；属于一个 template，带 weakness、resistance、modifier 等实例配置 | 指定变体、精确 defense/stat join |
| Endgame occurrence | season/location 下的一条配置记录，`eg1` evidence | 某期某节点某波的具体实例 |

用户按显示名称问跨赛期趋势时，默认 longitudinal grain 应是 enemy template，而不是 MonsterID 或 occurrence。原因是 HP 是 occurrence stat，但“同一敌人”需要一个跨位置稳定 identity；template 正好是当前已存在的稳定层。

同名多个 template 不能直接折叠为隐式 family。建议 resolution policy：

1. exact matches 优先；已有 exact 时不自动把 prefix/contains match 合并；
2. 把所有 exact candidate template IDs 作为 typed candidates，结果中继续保留 template identity；
3. 如果请求窗口只有一个 candidate 实际出现，可报告该 template 的数据，并说明同名搜索歧义没有改变本窗口结果；
4. 如果多个 candidate 都出现且合并会改变趋势，必须分别展示或请求澄清，不能按名称静默合并；
5. 只有未来数据源提供显式 family/variant relation 时，才可把它作为新的 identity grain。

Case C 中 4014022 只是 prefix match，不应在已有 exact matches 时自动加入用户的精确名称概念。4014020/4014021 是 exact candidates；只有 4014020 出现在当前 Endgame 数据。

## 12. Analytical Stopping Rules

### 12.1 当前 instruction 的缺口

当前 system prompt 有：

> 数据库不足、结果 unresolved、runtime-unclear 或 truncated 时明确写入 limitations，不要猜测或连续查询无关 proxy。

它能阻止部分 proxy exploration，但没有定义：

- trend 需要几个 comparable observations；
- 空/稀疏结果时先检查 identity 还是扩大时间范围；
- 什么情况下应停止；
- 扩大范围后如何避免冒充原时间窗口。

### 12.2 建议的 observation discipline

- 0 observations：报告请求窗口未找到数据；若 identity 尚未类型化或存在明显 namespace ambiguity，只允许做一次 identity correction。
- 1 observation：可以报告该值和出现期，但必须明确“无法分析变化”；停止趋势探索。
- 2 comparable observations：可以描述两点间的增减或差值，建议称“相比上一点变化”，避免宣称稳定趋势。
- 至少 3 comparable observations：可以做描述性趋势判断，如上升、下降、波动；仍不能推断原因。

“Comparable” 至少要求相同 metric definition、identity grain、mode 与用户指定 scope；missing season 不能当作数值 0。

### 12.3 Stop vs Explore

建议顺序是 C → A，而不是直接 B：

1. 如果结果稀疏且 identity 来自 search，先检查 typed identity 是否用错或 exact candidates 是否遗漏；
2. identity 已正确后，若请求窗口仍只有 0/1 个 observation，停止并回答数据不足；
3. 不擅自扩大到更早赛期；可以把“若你愿意，我可以另查更长历史范围”作为明确的后续选项；
4. 只有用户原问题本身允许开放时间范围时，才主动扩大。

### 12.4 Turn limit

当前 4-turn limit 不需要改变。Phase 1.2 thinking-low 的正式 A/B 已经把 turn-limit hit 降到 0/36 和 0/30；Case C 的正确 plan 也可在 3 turns 内完成。提高到 6/8 只会给错误 namespace 和无目的扩大范围更多机会。

## 13. Presentation Boundary

### 13.1 当前状态

- system prompt 和 tool descriptions 大量使用内部词汇；
- final answer schema 只约束 JSON shape、字符数、evidence 数和 limitation 数；
- runtime 不检查 answer prose 是否泄漏 internal vocabulary；
- Inspector 是开发者界面，故意显示 validated args、warnings、evidence 和 provider metadata，不是用户 presentation layer。

因此当前没有明确的 internal-vs-user-facing boundary。

### 13.2 默认 presentation policy

最终 answer 应默认使用游戏/网站用户语言；内部术语只允许出现在：

- machine-readable `evidenceIds` 字段；
- Inspector/debug output；
- 用户明确询问数据口径、ID、工具或实现细节时。

建议内部词汇策略：

| Internal term | 普通回答默认表达 | 例外 |
| --- | --- | --- |
| `groupId` | “第 1034 期”或赛期名；必要时说明“数据库期号 1034” | 用户问排序/ID 规则时可解释 |
| `configured-occurrence` | “配置表中的敌人出现记录”或更简洁的“配置记录” | 用户明确问 raw row grain 时 |
| `enemyTemplate` / `templateId` | “敌人类型”/“同一敌方单位” | 用户问实体 ID 或去重口径时 |
| `MonsterID` | 不主动展示 | 用户明确要求 MonsterID 或区分具体变体时 |
| `battleSlot` | “节点 1/2”或“上半/下半” | 技术说明时可附内部字段 |
| `ag1/eg1/ent1`、`evidenceId` | 不进入 answer prose；只放 machine evidence array | 开发调试时 |
| `runtime-unclear` | “当前静态数据不足以可靠确定” | 技术审计时可附 status code |
| `DecimalString` | 直接展示准确数值与必要舍入说明 | 开发实现讨论时 |
| `dataRevision` / `sourceCommit` | 不主动展示 | 用户问数据快照或可复现性时 |

`ag1/...`、`eg1/...`、`ent1/...` 不是要从机器输出删除；它们应继续存在于 `evidenceIds`，但不应被模型复制进自然语言 answer。

### 13.3 修复层

Presentation leakage 应通过 system prompt + finalization contract 修复，并用 deterministic prompt test / audit lint 做回归。final schema 已把 answer、evidence、limitations 分开，不需要再造 `format_answer` tool，也不应让 data tools承担文案翻译。

不建议硬编码无条件 banned-word rejection，因为用户可能明确询问 `groupId` 或 MonsterID。规则应是“默认隐藏、按用户意图允许”，而不是机械禁词。

## 14. Evidence Contract Impact

现有三个 namespace 足够：

- `weakness` explode group 仍是 aggregate group，使用 `ag1`；dimension 被纳入 hash 即可。
- `argMin/argMax` 仍是 aggregate metric，使用 group 的 `ag1`；associated rows 不需要第四种 evidence namespace。
- 若结果需要 drill-down，已有 `eg1` 可引用具体 occurrence；但普通 extrema 结论优先只引用 `ag1`，避免 evidence explosion。
- typed search identity 仍使用 `ent1` citation；`enemyTemplateId` 是数据 identity，不是 evidence。

需要注意：

1. `argMin/argMax` 的 metric definition、select dimensions 和 tie policy 必须进入 `ag1` hash 输入；
2. weakness explode semantics 也必须由 schema/version 或 metric input稳定表达，避免同一 hash 在语义变更后复用；
3. tie list 被 cap 时，aggregate output 与 final limitations 都应披露 truncation；
4. 不需要 Evidence Graph 或 row-level provenance list塞入每个 aggregate result。

## 15. Tool Surface Assessment

### 15.1 是否需要新 tool

不需要。

- weakness frequency 是现有 aggregate 的 categorical grouping；
- associated extrema 是现有 aggregate 的 bounded metric；
- typed identity 是 search output contract；
- stopping 与 presentation 是 runtime instruction/finalization contract。

四项都没有形成与三个现有 tools 不同的新 responsibility，也没有多个真实场景要求一个独立工具。

### 15.2 防止滑向 SQL 的停止线

允许：

- allowlisted filters；
- 最多 3 个 bounded dimensions；
- 最多一个 allowlisted multi-valued exploded dimension；
- 现有 scalar metrics；
- bounded `argMin/argMax` 与 allowlisted associated dimensions；
- deterministic sort、limit、tie cap。

不允许：

- arbitrary field paths 或 expressions；
- computed formulas；
- user-defined predicates；
- nested/second-stage aggregates；
- partition/window AST；
- top-K per group（本阶段）；
- joins、subqueries、SQL；
- arbitrary explode/cross-product；
- dynamic projection of internal rows。

## 16. What Should Remain Unchanged

- tool 数量与名称：`search_entities`、`query_endgame`、`aggregate_endgame`；
- normalized row grain 与 PF semantics；
- exact Monster join，不回退 canonical Monster；
- DecimalString lossless comparison/average；
- latest/current 与 groupId recency contract；
- `ent1/eg1/ag1` evidence namespaces；
- query 做 rows/global sort，aggregate 做 cross-row summaries；
- 4 model turns、8 total tool calls；
- row/group/latest/payload hard limits；
- bounded final JSON；
- frozen `dev.jsonl` 与 `held-out.jsonl` 内容；
- no real-model call before a separate approved implementation/eval stage。

## 17. Candidate Phase 1.3 Changes

既有 frozen corpora 不应被改写。任何实施都会改变 prompt/tools fingerprint，因此需要保留新 fingerprint 并重跑原 36-case regression；三个 dogfooding cases 可建立独立的 Phase 1.3 supplemental/manual acceptance set，但不能回填到原 frozen benchmark。

| Candidate | 分类 | 解决的 failure / 通用性 | 复杂度与 schema 影响 | Token/context 影响 | Evidence 影响 | Eval / deterministic tests |
| --- | --- | --- | --- | --- | --- | --- |
| `groupBy:"weakness"` + explicit explode semantics | **REQUIRED** | Case A；通用 multi-valued categorical frequency | 中；group engine 从 one-key-per-row 改为 bounded assignments；schema 加一个 dimension，限制最多一个 multi-valued dimension | 7 calls → 1；结果预计仅 7 groups | 继续 `ag1`；dimension/semantics 入 hash | 不改原 corpus；重跑 36 题；新增 explode rowCount/countDistinct/min/max/avg、空弱点、unresolved、组合 dimension、group limit 测试 |
| `argMin/argMax` with bounded associated dimensions | **REQUIRED** | Case B；通用于 HP/speed/toughness/level extrema identity | 中；metric union 增加两个 op、select allowlist、tie result type/cap | 46 groups/27 KB 可降为 6 season groups 与 bounded winners | 继续 `ag1`；metric/select/tie policy 入 hash | 不改原 corpus；新增 DecimalString extrema、all ties、dedup、null/unresolved、tie truncation、deterministic ordering 测试 |
| Enemy search 显式 `enemyTemplateId` | **REQUIRED** | Case C；消除 cross-tool namespace guessing | 低；search match 做 discriminated output；可短期兼容旧 `id` | 减少错误调用和修正 turns | `ent1` 不变；ID 仍不是 evidence | 更新 contract tests、Search→Endgame handoff test；重跑 entity/multi-step cases；无需改 frozen questions |
| Observation-aware stopping rule | **REQUIRED** | Case C；对所有趋势/变化分析通用 | 低；system/finalization instruction，无 data capability | 减少无目的 calls/tokens | 无变化 | fake-provider tests 覆盖 0/1/2/3 observations、identity correction once、禁止静默扩窗；后续 manual eval |
| User-facing presentation policy | **REQUIRED** | Case A 及已有 audit 的内部词汇泄漏 | 低；system/finalization contract；可选 audit lint，不改 tool | 轻微 prompt 增量；终答更短 | evidence array 保留，prose 不展示 raw IDs | prompt snapshot/fake final tests；人工审查普通问题与技术追问两种模式 |
| Bounded query projection 进一步拆细 | **OPTIONAL** | 只缓解 Case B fallback plan 的 row bytes，不解决 per-group selection | 中；扩大 projection enum 与 result shapes | 可降低 query fallback bytes | `eg1` 不变 | 只有 profiling 仍证明必要时做；不是 Phase 1.3 blocker |
| Resistance categorical grouping | **OPTIONAL / DEFER** | 尚无真实 request；语义未定义 | 中高；element/value/no-resistance 多种 grain | 未知 | 可用 `ag1` | 先出现真实场景并定义 semantics；本轮不实施 |
| top-K per group | **NOT RECOMMENDED** | 可覆盖未出现的 K>1 场景，但 Case B 不需要 | 高；接近 window DSL，ties/projection/payload复杂 | 容易增大结果 | 可勉强用 `ag1`，但 provenance 更复杂 | 不实施，不为假设场景扩 eval |
| 增加第四个 analytical tool | **NOT RECOMMENDED** | 没有独立 responsibility | 高 routing ambiguity | 增加 tool schema context | 新 namespace/contract 无必要 | 不实施 |
| 4 turns → 6/8 | **NOT RECOMMENDED** | 不修 algebra、identity 或 stopping | 低代码、高行为风险 | 增加无目的探索与 token | 无帮助 | 保持 4；用正确 plan 验证 Case C |

## 18. Changes Explicitly Not Recommended

1. 不为三个问题分别新增 `count_weaknesses`、`boss_hp_trend`、`resolve_enemy_trend` 等场景 tool。
2. 不同时实现 arg extrema 与 top-K；先用最小 primitive 覆盖已证明的需求。
3. 不把 `query_endgame` 扩展为 partition/window executor。
4. 不增加 arbitrary `groupByPath`、expression AST、formula、join 或 SQL。
5. 不因 Case B output 截断扩大 final output token limit或 aggregate payload limit。
6. 不因 Case C hit limit 提高 model turns。
7. 不把同名 template 仅按 display name 永久合并成 family。
8. 不把 Search stable ID 默认解释为 MonsterID。
9. 不新增 Evidence Graph、第四种 evidence namespace 或把全部 tied row evidence塞进聚合结果。
10. 不新增 `format_answer` tool；presentation 是已有 finalization responsibility。
11. 不在本轮修改 frozen eval 或把 dogfooding questions直接加入它们。
12. 不讨论 Phase 2、Web、production、MCP、RAG、memory、auth 或 deployment。

## 19. Risks / Open Questions

1. **arg extrema associated shape**：首期 `select` 最小集合要覆盖到什么程度，需要在 implementation review 中定稿；过窄不能回答“在哪里”，过宽又会扩大 schema。
2. **tie cap**：需要选择 hard cap，并明确 `tieCount` 是 row ties 还是 selected-identity ties；本报告建议两者都返回。
3. **empty weakness**：合法无弱点与 unresolved detail 必须保持可区分；不能增加伪元素 `Unknown` 后混算。
4. **multi-valued cross-product**：未来若再加 resistance/tag 等维度，必须继续限制一次最多一个 exploded dimension。
5. **identity compatibility**：若保留旧 `id`，模型可能继续优先使用它；model-facing description 应明确首选 typed field，并设迁移测试。
6. **同名 concept**：当前没有 family relation；对多个 exact templates 的用户意图仍可能需要 clarification。typed ID 只能防 namespace 错误，不能创造缺失的 family semantics。
7. **趋势措辞**：两点是否可以称“趋势”属于产品语言选择；最低安全线是 1 点绝不描述变化，2 点只描述 pairwise change，3 点以上才做 descriptive trend。
8. **presentation lint**：纯 banned-word lint 会误伤用户主动问技术细节；如实现，应有 user-intent escape，而不是无条件拒绝。
9. **existing eval gold**：部分 frozen case 当前把 query 作为 global extremum 的正确工具，加入 argMax 后不能让模型把所有 global top-1 query 都错误路由到 aggregate；tool description 需保留责任边界。
10. **warning retention**：新增 explode/tie warning 后，仍需区分 model-native disclosure 与 runtime-enforced limitation，不能只看 trace 中存在 warning。

## 20. Recommended Next Step

### 20.1 建议决策

建议人工批准一个严格限界的 Phase 1.3 implementation：

1. 先写 contracts 与 deterministic tests，明确 weakness explode、arg ties 与 typed identity；
2. 在现有 aggregate engine 中实现 `weakness` 与 `argMin/argMax`，不加 top-K；
3. 更新 system/finalization identity、stopping、presentation rules；
4. 保持 3 tools、4 turns、8 calls、64 KiB、frozen corpora不变；
5. 先跑全量 deterministic checks；
6. 使用新的 prompt/tools fingerprint 重跑原 36-case regression；
7. 经单独批准后，再用三个 dogfooding questions做 manual acceptance，不直接写入 frozen benchmark。

Phase 1.3 值得实施，因为三个真实案例分别证明了两个有限代数缺口和三个 contract 缺口；这些修改都能缩小模型自由推理面，而不是增加开放式能力。

### 20.2 十五个必答问题

1. **`weakness` 是否应该成为 `groupBy` dimension？**  
   是。真实 dogfooding 已证明需求，数据已规范化且分类域有限；应作为现有 aggregate 的 multi-valued dimension，不是新 tool。

2. **Multi-valued weakness grouping 应采用什么计数语义？**  
   Explode。每条配置记录对其每个不同 weakness bucket 各贡献一次；因此各组计数总和可大于 source rows。`countDistinct` 与 numeric metrics 都在各 bucket 内计算。

3. **当前 `min/max` 为什么不能自然回答“最大值对应谁”？**  
   `metricValue()` 只返回比较后的 DecimalString，产生该值的 source row 被丢弃；加 `enemyTemplate` groupBy 只会过度分组，当前没有第二层 winner selection。

4. **`argMin/argMax` 和 `top-K per group` 哪个更适合当前架构？**  
   `argMin/argMax`。它复用现有 bucket 与 DecimalString comparator，schema 和 payload 都更小；top-K 会引入 partition/order/take/projection，接近 window DSL。

5. **是否需要二者都实现？**  
   不需要。Phase 1.3 只实现 bounded `argMin/argMax`；等真实 K>1 场景出现后再调查 top-K。

6. **是否可以通过 `query_endgame` 解决，而不用扩 aggregation？**  
   这个六期样本可以用“6-group scalar aggregate + 50-row query + 模型手工关联”完成，约 35,922 bytes；但 query 没有 per-group limit，不能紧凑、确定性地表达任务，规模扩大后不可靠。增强 query 到能直接表达会变成 window function，因此应扩 aggregate。

7. **`search_entities` 返回的 enemy ID 当前是什么 identity namespace？**  
   Enemy catalog ID，等于 `MonsterTemplateID` / enemy template ID。不是 MonsterID、occurrence ID、SearchDocument ID 或 evidence ID。

8. **如何防止 Agent 猜 `monsterIds` / `enemyTemplateIds`？**  
   让 Search enemy match 显式返回 `enemyTemplateId`，tool description 声明它只可交给 `enemyTemplateIds`；MonsterID 只能来自 concrete Monster/Endgame row。用 TypeScript discriminated output 和 cross-tool test保证，不只靠 prompt。

9. **同名多个 enemy match 在跨赛期分析时应该如何解释？**  
   它们是多个 template candidates，不是自动成立的一个 family。优先 exact matches；不在 exact 存在时静默加入 prefix；保留 template 维度查询。若多个 template 都贡献且影响趋势，分别展示或澄清；默认 longitudinal grain 是 template。

10. **“趋势”在只有 1 个 observation 时应如何处理？**  
    明确无法分析变化，只报告该 observation 与其他请求期缺少可比较数据；identity 正确后停止，不扩大窗口冒充原请求。

11. **当前 4-turn limit 是否需要改变？**  
    不需要。正确的 Case C plan 在 3 turns 内完成；Phase 1.2 low 也没有 turn-limit failure。增加 turns 只会掩盖 planning/stopping 问题。

12. **哪些内部术语不应默认出现在用户回答？**  
    `groupId`、`configured-occurrence`、`enemyTemplate`、`templateId`、`MonsterID`、`battleSlot`、`stageId`、`evidenceId`、`ag1/eg1/ent1`、`runtime-unclear`、`DecimalString`、`dataRevision`、`sourceCommit`。用户明确询问 ID/口径/实现时可以解释，不应机械永久禁止。

13. **Presentation leakage 应通过 prompt、finalization、schema 还是其他层解决？**  
    主要通过 system prompt + finalization presentation contract；现有 final schema 已把 prose 与 machine evidence 分离。可加 audit lint 做回归，但不应新增 tool，也不应让 data schema负责文案。

14. **这些改动是否足以保持三个-tool architecture？**  
    足以。所有真实 gap 都落在现有 search output、aggregate algebra 或 runtime contract 内，没有第四种 responsibility。

15. **Phase 1.3 是否值得实施？**  
    值得，但仅限本报告的 bounded scope：weakness explode、arg extrema、typed identity、stopping 与 presentation。不要把它扩张为 top-K、generic analytics DSL 或更多 turns。

