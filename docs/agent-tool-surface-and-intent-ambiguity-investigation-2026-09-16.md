# HSR-Database Data Agent Tool Surface & Intent Ambiguity Investigation

日期：2026-09-16  
分支：`develop`  
调查性质：只读代码、schema、deterministic data 与既有 eval/audit 调查；除本报告外未修改 Agent source、tool contract、prompt、runtime、tests、eval corpus、Inspector、package 或部署配置；真实模型调用数为 0。

## 1. Executive Summary

本轮得到两个相互独立、但会共同影响下一阶段设计的结论。

第一，原 Manual Case C：

```text
分析「颁赐者，千军首，天谴之矛」
在最近6期混沌回忆中的血量变化。
```

不是一个无歧义的 scope/stopping benchmark。至少有两个自然解释：

1. 先确定全局最近 6 个 MoC 赛期，再查看实体在这个窗口内的 observations；
2. 先确定实体，再取它最近出现的至多 6 个 MoC 赛期/observations。

当前数据中两者产生物质性不同的数据集：第一种只有 1031 期 1 个 observation；第二种在全部历史中有 1031、1026、1023、1022、1021 共 5 个 season observations。因此 Case C 应重新分类为 **ambiguous-intent case**；在交互层面很可能需要澄清，或至少显式声明假设。它不应继续作为 Phase 1.3 promotion blocker，也不应以唯一 query plan 评分。

Scope Fidelity 之前需要增加更上游的 **Intent / Scope Resolution**：只有用户措辞已经足够确定 scope，或 Agent 已公开选定一个合理口径，才适合检查后续执行是否忠实于该 scope。规则不应演化为 wording 表；核心判断是：是否存在多个同样合理的解释，以及它们是否会实质改变数据集、结论、置信度或 limitation。

第二，当前三工具架构仍是最成熟、唯一有真实 regression 证据的 baseline，但不能再被假定为最终最优。当前序列化事实为：

| 项目 | 当前值 |
| --- | ---: |
| System prompt | 3,255 B |
| 全部 tool definitions | 13,657 B |
| `search_entities` definition | 1,249 B |
| `query_endgame` definition | 4,728 B |
| `aggregate_endgame` definition | 7,676 B |
| `aggregate_endgame` description / schema | 558 B / 7,028 B |

`aggregate_endgame` 当前同时承担 scalar summary、categorical/exploded grouping、associated extrema、ties、associated identity/location、summary sort/limit。Phase 1.3 frozen regression 中 first-tool name 仍为 24/28（85.7%），但 first-tool key arguments 从 20/28 降为 18/28（64.3%）。在相同分母上，至少有 6 个 case 首工具名正确但首调用关键参数不正确；generalization-v1 则为 13/13 对工具名、11/13 对关键参数。这与“routing 大体正确、within-tool parameter planning 压力更大”的假设一致，但不是因果证明。

把 associated extrema 拆成第四个 model-facing tool 具有清晰的 mental responsibility：

```text
多少 / 平均 / 数值摘要
→ aggregate_endgame

谁 / 哪个身份或位置产生组内极值 / 保留并列
→ select_endgame_extrema
```

静态 prototype 中，拆分把 scalar aggregate 的 metric union 从 7 个分支降到 5 个，把 extrema tool 限定为 2 个分支；最大单工具从 7,676 B 降到 6,532 B。但 provider-facing 总 definitions 因 filter/groupBy/sort 重复，从 13,657 B 升到 18,578 B（+4,921 B，+36.0%）。拆分也会使真正同时要求 summary + winner 的问题变成两次调用。

因此最终架构判断为：

- 当前三工具：**KEEP AS BASELINE**；
- extrema 拆分四工具：**PROMISING — A/B TEST**；
- 进一步拆 global summary / grouped summary：**NOT RECOMMENDED**；
- 合并 Query/Aggregate/Extrema 为统一 `analyze_endgame`：**NOT RECOMMENDED**。

下一阶段不应再先做 prompt/orchestration tuning；应先进行严格限界的 3-tool vs 4-tool A/B。没有真实 A/B 证据前，不把第四个 tool 直接定为 production architecture。

## 2. Why This Investigation Is Needed

Phase 1.3 deterministic primitives 已经成立，但模型层出现了一个重要分离：

- frozen facts 仍为 36/36；
- first-tool name 没有退化；
- first-tool key arguments、strict contract、token、latency 和 turn-limit 出现退化；
- manual Case C 被当作 stopping/scope failure，但其原始请求自身存在 scope attachment ambiguity。

如果不先处理这两个上游问题，继续调整 prompt 会有两类风险：

1. 把一个天然有多种合理解释的问题强行写成唯一 planning rule；
2. 用更多 prose 解释一个已经在 schema 内积累过多决策分支的工具，而不检查 model-facing responsibility boundary。

本报告按以下事实优先级工作：当前代码与 schemas、当前 deterministic tests、Phase 1.3 generalized-primitives report、两份 Phase 1.3 调查报告、Phase 1.2 及更早报告。现有代码与历史报告冲突时以代码为准。

## 3. Case C Reclassification

### 3.1 两种解释都合理

原句的“最近 6 期”可以附着在模式时间窗口，也可以附着在实体出现序列：

```text
Interpretation A — season-window centered
最近 6 个 MoC seasons
→ 这些 seasons 内该实体的 observations

Interpretation B — entity-occurrence centered
该实体出现过的 MoC seasons
→ 按 recency 取最近 6 个 season observations
```

中文“某实体在最近 N 期中的变化”通常偏向 A，但在实体并非每期出现时，用户也可能自然地把“最近 N 期”理解为“最近 N 次出现所在的期”。B 并不牵强。

### 3.2 当前数据证明差异具有物质性

使用当前 deterministic aggregate engine、同名 exact template candidates `4014020` 与 `4014021` 得到：

| 解释 | 选中 seasons | observations | 可支持的回答 |
| --- | --- | ---: | --- |
| A：最近 6 个 MoC seasons 内 | 仅 1031 命中 | 1 | 只能报告 1031 期 HP `10893723.51600`；不能分析变化 |
| B：实体最近出现的 seasons | 1031、1026、1023、1022、1021 | 5 | 可以比较五次出现的 HP，仍应说明当前数据不足 6 次 |

B 中五个 HP 分别为：

```text
1031  10893723.51600
1026   3230096.564160
1023   2102473.24560
1022   2871196.945920
1021   3770904.29400
```

这不是小幅行集合差异；它把“只有一个点、无法分析变化”变成“五个点、可以描述变化”。因此值得在执行前解决意图。

### 3.3 新分类

Case C 的主要分类应是：

> **B. ambiguous-intent case**

在当前数据快照下，它同时很可能触发交互行为：

> **C. clarification outcome is valid and often preferred**

这不是 deterministic acceptance case，也不应继续作为 Phase 1.3 promotion blocker。它可以保留为 ambiguity-handling 的 manual/exploratory case，观察 Agent 是否澄清、声明假设或并列解释两种口径，但不能要求唯一 tool path、固定第 N turn 停止或唯一 season selection。

过去 trace 中“静默扩到全历史”仍说明：一旦 Agent 已经选择 A，却没有告诉用户就改成 B，违反 Scope Fidelity。但原始请求本身不能证明 A 是唯一正确 scope，所以不能把“没有坚持 A”整体判成 stopping failure。

## 4. Intent / Scope Ambiguity Model

不需要 exhaustive taxonomy。当前问题可以收敛为四个一般 semantic axes，另把 `current/latest` 视为 scope/reference 的子轴。

| Ambiguity class | Example pattern | Material? | Default action candidate |
| --- | --- | --- | --- |
| Scope attachment / temporal reference | “这个 Boss 在最近 5 期中的 HP”；latest N global seasons vs latest N entity appearances；current vs latest known | 当选中 seasons/rows 或 status 不同时 material | 强 domain default 且差异小则声明假设；两者同样自然且集合明显不同则 clarify |
| Identity grain | same display name、enemyTemplate、Monster、occurrence；同名 templates 是否合并 | 当不同 identity 集合贡献不同数值或趋势时 material | 用户明确说模板/MonsterID 时直接执行；同名 candidates 会改变结论时 clarify 或分开展示 |
| Counting / observation grain | configured rows、distinct template、distinct Monster、distinct season appearances | 当 count 值或排名改变时 material | 领域常用口径明显时声明口径；“出现次数/多少敌人”可对应多个同等合理 grain 时 clarify |
| Metric interpretation | `hpPerBar`、effective/runtime total HP；速度是 occurrence value 还是 template property | 当数值定义、可回答性或 winner 改变时 material | 术语明确则 proceed；数据库只有 proxy 或多个核心 metric 都合理时 clarify，不静默替代 |

这些 axes 可以组合。例如“最近出现最多的敌人”同时缺少时间窗口、identity grain 和 counting grain。不能通过给每种 wording 写一条规则解决；应先识别哪几个 semantic decisions 会改变查询集合或结论。

### 4.1 Counterfactual examples

| 请求 | 判断 | 原因 / 合理行为 |
| --- | --- | --- |
| “最近 5 期这个 Boss 的血量” | mildly ambiguous，A 较强 | 语序明显偏向全局 season window；可声明“按最近 5 个赛期”后执行 |
| “这个 Boss 最近 5 期的血量” | materially ambiguous 的可能性更高 | scope attachment 较弱；若实体稀疏，应澄清或显式假设 |
| “这个 Boss 最近 5 次出现的血量” | scope 基本 unambiguous | entity-occurrence centered；仍需定义同季多个 occurrences 如何归并 |
| “这个 Boss 在最近 5 期中的出现次数” | season scope 较明确，count grain 仍 ambiguous | 可能是配置行数、出现过的赛期数或不同 Monster 数；需要口径 |
| “这个敌人最近 5 次出现的等级” | entity-occurrence scope 较明确 | 同一 season 多 occurrence 时仍可能需要按 row 或 season 聚合 |
| “某个弱点最近几期的覆盖变化” | materially ambiguous | 覆盖可以指 rows、templates、Monsters 或 encounters；通常 clarify |
| “这个模板最近 3 次进入 AS 时的速度” | template identity 与 occurrence scope 较强 | 若每期有多个 rows，应声明按 row、max/avg 或全部展示 |
| “目前最强的敌人” | materially ambiguous / unsupported | current scope 与 strongest metric 都未定义；应 clarify metric，不能自行用 HP proxy |
| “最近出现最多的敌人” | materially ambiguous | 时间范围、count grain、template/Monster 都可能改变排名；应 clarify |
| “最高血量的 Boss” | mildly to materially ambiguous | 若产品默认是 Endgame 单条 `hpPerBar` 可声明假设；若涉及多阶段总 HP 则必须澄清/说明不可可靠确定 |

## 5. Clarify vs Assume vs Proceed

### 5.1 General decision framework

建议使用以下通用判断，而不是 wording trigger：

1. **Plausibility**：是否真的存在两个领域上自然的解释，而不是语法上勉强可构造的解释。
2. **Domain default strength**：是否有稳定、用户可预期的产品/领域默认；默认是否已在当前系统公开。
3. **Material divergence**：候选解释是否改变选中 rows/seasons/identities、metric 定义、winner、趋势方向、answerability 或 limitations。
4. **Reversibility and interaction cost**：错误假设是否容易在一句话中暴露并让用户纠正；澄清是否会打断一个本可直接回答的普通请求。
5. **Evidence cost**：不应默认先做两套完整查询；只有在结果很小、双口径本身有解释价值时，才考虑一次回答两种口径。

### 5.2 三类行为

#### A. Proceed

适用于：一个解释明显是领域常用含义；其他解释很牵强；或不同解释最终选择相同数据、产生相同答案。

例如“最近 5 次出现”已经明确 attached to entity occurrence，且没有其他 grain 问题时可直接执行。

#### B. Proceed with explicit assumption

适用于：存在轻微 ambiguity，但一个解释明显更自然，或假设可以用很低成本公开：

```text
“我按最近 5 个 MoC 赛期统计……”
```

公开假设使 Scope Fidelity 有了可检查的基准，也允许用户快速纠正。

#### C. Clarify

适用于：两个以上解释都自然；会明显改变数据集或结论；没有强 domain default；错误选择会使回答回答了另一个问题。

Case C 在当前数据中满足这些条件。一个合理澄清是：

> 你指的是最近 6 个混沌回忆赛期内的数据，还是这个敌人在混沌回忆中最近出现的 6 次？

### 5.3 Case C interaction options

| Option | Benefit | Cost / risk | Best fit |
| --- | --- | --- | --- |
| A. Clarify first | 最高 intent fidelity；避免无效查询 | 增加一次用户交互 | 两种解释同样自然且 materially divergent；当前 Case C 最符合 |
| B. Explicit assumption | 不增加交互；scope 可审计、可纠正 | 仍可能回答错口径 | 一个解释明显更自然、错误成本较低 |
| C. Compute both | 用户无需往返，直接看到差异 | 两套查询、更多 token/证据与更复杂回答 | 两套结果很小且差异本身有价值 |

不能把 A、B 或 C 编码成所有类似句式的 fixed policy。选择依据仍是 plausibility、domain default、materiality 和 interaction/query cost。

### 5.3 “物质性差异”原则

只有 ambiguity 会 materially change the answer 时，才值得打断用户。建议把 material 定义为：

```text
候选解释导致不同的核心数据集合或语义，
并进一步改变至少一项：核心事实、排序/趋势结论、可回答性、置信度、重要 limitation。
```

仅有底层 row 顺序不同、但去重后的结果完全一致，不需要澄清。A/B 两种 scope 最终 observations 完全相同时可直接按较自然解释执行，必要时一句话声明口径。

不建议在本阶段实现“双查询 preview”。Agent 通常可从 wording、domain model 和预期 cardinality 判断是否高风险；若未来确需测量，应该作为成本明确的独立设计，而不是每次请求都查询两遍。

## 6. Ambiguity Fidelity and Scope Fidelity

建议在 Scope Fidelity 之前增加：

> **Intent / Scope Resolution：在强制忠实执行某个 scope 前，先确认用户措辞是否足以唯一确定该 scope，或显式公开所采用的合理解释。**

更一般地：

> **当多个合理解释会产生物质性不同的数据集或结论时，不得静默把其中一个当作唯一意图。**

关系为：

```text
Intent / Scope Resolution
        ↓
resolved scope or explicit assumption
        ↓
Scope Fidelity
        ↓
Evidence Sufficiency
        ↓
user-facing conclusion
```

它不是要求所有 ambiguity 都追问。它只在“多种合理解释 + material divergence + 缺少强 default”时提升为澄清。

## 7. Implications for Eval Design

Ambiguous prompt 不应再使用单一 gold query plan。建议为未来 eval 引入以下设计：

1. 标记 `ambiguityAxes` 与 `materiality`，但不把它扩张成完整语言学 taxonomy。
2. 允许多个 accepted outcomes：
   - clarification；
   - 明确假设后按一个 accepted interpretation 正确执行；
   - 在成本有界时并列展示两个解释及差异。
3. 每个 accepted interpretation 可有自己的 scope facts、limitations 和 architecture-neutral operation gold。
4. 在意图未 resolved 前，从 strict first-tool path、expected tool 和 key-argument accuracy 分母中排除；否则 clarification 会被错误判成“没有调用 gold tool”。
5. 若用户/fixture 提供澄清后的第二轮，再单独评价 Scope Fidelity 和 planning。
6. 若多个解释在当前数据上得到相同 observations，接受直接执行，不强制无意义追问。
7. Case C 不进入 decomposition gold；它只测 ambiguity handling，不证明 3-tool 或 4-tool 更优。

评分应区分：

```text
ambiguity recognition
assumption disclosure / clarification quality
post-resolution user correctness
post-resolution tool discipline
```

答案正确但选择了另一合理解释，不应被判 factual failure。相反，未声明地混用两个 scope，即使碰巧得到某些正确数字，也应判 scope failure。

## 8. Current Tool Surface Audit

测量方法：对当前 `AGENT_TOOL_DEFINITIONS` 使用 compact `JSON.stringify` 并按 UTF-8 计字节；description 单独按 UTF-8 计字节。结果与 `pnpm agent:profile` 一致。JSON Schema 来自当前 Zod `draft-7` serialization。

| Tool | Definition B | Description B | JSON schema B | Top-level parameters | Input union/branch pressure | Result variants / evidence | Intended responsibility | Formal eval expected usage |
| --- | ---: | ---: | ---: | ---: | --- | --- | --- | ---: |
| `search_entities` | 1,249 | 491 | 670 | 4 | 无 input union；4 entity types | enemy vs non-enemy typed match；ambiguity candidates；`ent1` | 用户明确名称/alias → stable entity identity | 9/52 cases |
| `query_endgame` | 4,728 | 498 | 4,144 | 5 | season selector 2 branches；5 projections；10 sort fields | projection-dependent concrete rows；`eg1` | list/filter/global concrete top-bottom/drill-down | 11/52 cases |
| `aggregate_endgame` | 7,676 | 558 | 7,028 | 6 | season 2；metric 7；sort 2；9 group dimensions | count、scalar extrema、avg、associated extrema；`ag1` | cross-row summaries、grouping、grouped winner relation | 23/52 cases |

52 cases 指 frozen 36 + generalization-v1 16；multi-step case 会同时计入多个 expected tool，11 个 case 为 no-tool/abstention 或纯说明任务，因此各列不要求相加等于 52。

### 8.1 Search result behavior

- enemy match 返回 `enemyTemplateId:number`；其他类型返回 `id:string`；
- 每个 match 有 `ent1` evidence；
- ambiguity 返回同 rank-class typed candidates；
- limit 默认 10、最大 25；
- 没有 warning 数组，使用 `truncated` 与 `ambiguity` 表达边界。

### 8.2 Query warning/evidence behavior

Query 可以产生 PF grain、unresolved detail/HP、unavailable speed/toughness、runtime-unclear effective HP、row-limit 和 payload-limit warnings。每个 concrete row 返回 `eg1`。Projection 是 model-facing payload 控制，而不是 row grain 变化。

### 8.3 Aggregate warning/evidence behavior

Aggregate 可以产生：

```text
PF_CONFIGURED_OCCURRENCE_GRAIN
PF_ROW_COUNT_NOT_RUNTIME_SPAWNS
PF_AVG_CONFIGURED_OCCURRENCE_WEIGHTING
UNRESOLVED_ENEMY_DETAIL
UNRESOLVED_HP
UNAVAILABLE_SPEED
UNAVAILABLE_TOUGHNESS
RESULT_TRUNCATED_ASSOCIATED_TIES
RESULT_TRUNCATED_GROUP_LIMIT
RESULT_TRUNCATED_PAYLOAD_LIMIT
```

每个返回 group 有一个 `ag1`，hash 包含 data revision、canonical filter/groupBy/metrics/dimensions，并对 weakness explode 与 associated extrema 加入 semantics version。Sort/limit 不改变同一事实的 evidence identity。

## 9. `aggregate_endgame` Responsibility Audit

### 9.1 Filters

当前 `EndgameFilter` 有 15 个 top-level filter branches：

```text
modes
seasons: ids | latest-per-mode
statuses
encounterIds
encounterOrdinals
encounterVariants
battleSlots
stageIds
levels
waveNumbersOrIds
enemyTemplateIds
monsterIds
enemyRanks
enemyRankCategories
weaknessesAny
```

其中 `seasons` 自身是 2-branch discriminated union。Filter 同时承载时间、模式、位置、identity、rank 和 weakness scope。

### 9.2 Grouping

- scalar dimensions：`mode | season | encounter | battleSlot | stage | wave | enemyTemplate | monster`；
- multi-valued dimension：`weakness`，采用 `explode-v1`；
- 最多 3 dimensions；
- 当前只有一个可 exploded dimension，因而实际最多 1 个 exploded dimension；
- group 上限 100，payload 64 KiB；
- empty weakness 不产生 assignment，unresolved detail 不伪造 `Unknown`。

### 9.3 Metrics

Scalar summary branches：

```text
rowCount
countDistinct(field: 6 identity choices)
min(field: 4 numeric choices)
max(field: 4 numeric choices)
avg(field: 4 numeric choices)
```

Associated extrema branches：

```text
argMin
argMax
field: hpPerBar | speed | toughnessPerBar | level
select: 1..3 unique values from enemyTemplate | monster | location
```

三个 `select` 值有 7 种非空集合组合。Tie policy 是 all distinct associated tuples、cap 5；同时返回 tied source row count、distinct tie count、returned ties 和 truncation flag。

### 9.4 Sorting and limits

- 最多 5 个 sort items；
- sort union：dimension sort 或 metric-alias sort；
- dimension 必须已在 groupBy；metric alias 必须已声明；
- metric alias 需满足受限 identifier 且唯一；
- metrics 1..5；
- 默认 20 groups，最大 100；
- payload 64 KiB；并列结果每 metric 最多 5 个 associated tuples。

### 9.5 Result shapes

内部 `AggregateMetricValue` 有四类主要 variants：

1. `rowCount/countDistinct` integer；
2. `min/max` DecimalString 或 null；
3. `avg` exact/approx decimal 或 null；
4. `argMin/argMax` DecimalString + associated tuples + tie metadata。

Model-facing serialization 把前三类压缩为 `value/includedRows/skippedUnresolvedRows`（avg 额外可能有 `approximate`），associated extrema 则增加 `associated/tiedRowCount/tieCount/returnedTies/tiesTruncated`。

因此它当前至少承担四个可辨识 responsibilities：

1. define/filter analytical scope；
2. construct scalar or exploded groups；
3. compute value summaries；
4. select and project identities/locations associated with extrema，并处理 ties。

前两项是所有 aggregate 的共同 engine responsibility；第三和第四项是最值得调查是否拆分的 model-facing operation responsibility。

## 10. Model Decision Complexity

本报告不把 schema bytes 当作 entropy，也不伪造数学复杂度公式。使用以下结构性 proxies：

- tool name choices；
- discriminated union branches；
- enums 与组合选择；
- mutually exclusive parameter combinations；
- 一次调用前必须完成的 conceptual decisions；
- description/schema size；
- 现有 invalid/key-argument/extra-call failure patterns。

### 10.1 Current aggregate conceptual decisions

一次非平凡调用通常要求模型决定：

1. Query 还是 Aggregate；
2. mode 与时间 scope；
3. explicit seasons、latest-per-mode 还是 status；
4. template、Monster、rank、weakness 等 filter grain；
5. 不分组还是按 1–3 个 dimensions 分组；
6. weakness 是 filter 还是 exploded group；
7. scalar summary 还是 associated extrema；
8. 7 个 metric operation 中选哪个；
9. distinct identity field 或 numeric field；
10. extrema 需要 template、Monster、location 的哪个非空组合；
11. metric alias；
12. dimension sort 还是 metric sort、目标与方向；
13. group limit；
14. 是否会触发 PF weighting、unresolved、tie/group/payload warning。

并非每题都需要显式考虑全部 14 项，但 schema 同时暴露了它们。工具名少并不等于模型需要做的 operation decisions 少。

### 10.2 Phase 1.3 telemetry 的含义

Frozen regression：

```text
first-tool name       24/28 = 85.7%
first-tool key args   18/28 = 64.3%
```

Generalization-v1：

```text
first-tool name       13/13 = 100%
first-tool key args   11/13 = 84.6%
```

这说明主要剩余压力更接近 parameter planning 而不是 tool-name routing。尤其 frozen 同一分母中有 6 个 case 选对首工具名但没有选对首工具关键参数。Phase 1.2 low 对应 gap 为 4（24 vs 20），Phase 1.3 扩大为 6（24 vs 18）。

但不能据此断言 `argMin/argMax` 直接导致退化：同时变化的还有 tool descriptions、system prompt、generalization responsibilities 和随机模型行为。静态结构与 telemetry 只足以形成 A/B hypothesis。

## 11. Phase 1.3 Failure Mapping

Phase 1.3 raw audit 在当前工作区未保留，以下映射只使用 generalized-primitives report 的汇总与代表 case，不重建不存在的逐 attempt 精确计数。类别可重叠。

| Failure class | Available evidence | Interpretation |
| --- | --- | --- |
| Wrong first tool | frozen 24/28 first-tool name，4/28 未命中；generalization 13/13 | 存在，但不是 generalization suite 的主要问题 |
| Right tool / wrong operation or key args | frozen 24/28 name vs 18/28 args；generalization 13/13 vs 11/13 | 当前最直接的 planning burden evidence |
| Right operation / wrong grain | `dev-aa-season-diff`、`dev-as-common-bosses`、`dev-cross-moc-as` 被报告为 group grain / key-arg 偏移 | 聚合工具内 season/mode/template grain 规划不稳定 |
| Right operation / wrong metric/select | generalization 有 2/13 首工具 key-arg failure；exact field/select/tie shape 被报告为 strict loss 来源 | 与 7-branch metric union、numeric/distinct/select choices 相容 |
| Unnecessary second/extra tool | frozen forbidden avoided 32/36；generalization 15/16；Manual Case B 先 Query 50 rows 再 aggregate；Case C 4 calls | 额外调用是持续成本，不全由 routing error 解释 |
| Scope ambiguity | Manual Case C | 不能继续算作 deterministic planning failure |
| Presentation | generalization presentation 14/16 | 2/16 ordinary answers 泄漏内部 ID/术语 |
| Fact omission | generalization facts 13/16 | 3/16 最终回答漏报值、tie 或限定条件；tool 结果未发现 deterministic 错误 |
| Unsupported inference | frozen abstention 7/8 | 1 个 knowledge-boundary regression |
| Turn-limit | frozen 1/36；Manual Case C hit limit | frozen 是真实 discipline failure；Case C 需先从 blocker 中移除 |

结论：当前主要可观测错误在 **within-tool operation/grain/parameter planning**，其次是 extra calls、presentation 和 answer compression；不能把它简化成“选错三个工具之一”。

## 12. Architecture A — Current 3 Tools

```text
search_entities
query_endgame
aggregate_endgame
```

### Benefits

- tool-name routing surface 小；
- deterministic engine、warnings、evidence、tests 与 Inspector 已成熟；
- scalar 与 extrema 可在同一 group pass、同一 tool result 中组合；
- shared filter schema 只在 Query/Aggregate 间重复一次；
- 52 个正式 cases 与两轮真实模型报告都围绕该 surface 建立；
- 无 migration cost。

### Costs

- `aggregate_endgame` 占全部 tool-definition bytes 的 56.2%；
- metric union 有 7 branches，associated extrema 另有 7 种 select subsets；
- value summary 与 winner relation 混在一个 description/schema/result union；
- 模型选中 Aggregate 后仍需完成大量 operation/grain/field/select/sort 决策；
- 更强 aggregate surface 会诱发本来只需 Query 的 global top-row 请求误路由，必须靠 description 保持边界。

Verdict：**KEEP AS BASELINE**。它是当前最可信的比较基线，不代表已经证明是最佳 production surface。

## 13. Architecture B — Extrema Split

候选 model-facing surface：

```text
search_entities
query_endgame
aggregate_endgame
select_endgame_extrema
```

其中：

```text
aggregate_endgame
  grouping / weakness explode
  rowCount / countDistinct / min / max / avg
  summary sort / limit

select_endgame_extrema
  grouped argMin / argMax
  numeric field
  enemyTemplate / Monster / location association
  all deterministic ties, bounded by existing cap
  group sort / limit
```

### 13.1 Mental responsibility

`argMin/argMax` 已经形成独立 operation responsibility，因为它回答的不是只求极值，而是确定并保留：

```text
value → which associated identity/location produced it
```

用户语言上的区分通常自然：

| Request | Natural tool |
| --- | --- |
| “每期最高 HP 是多少？” | `aggregate_endgame` scalar max |
| “每期 HP 最高的是谁？” | `select_endgame_extrema` argMax |
| “每期最高 HP 是多少、对应谁？” | `select_endgame_extrema`，因为结果自带 value |
| “范围内最高的一个具体实例在哪里？” | `query_endgame` global sort + limit |
| “范围内最高的是哪些敌人类型，并保留并列？” | extrema，即使 groupBy 为空也需要 associated identity/tie semantics |

最后两行说明 Query/Extrema 仍有边界压力：global concrete top row 与 global associated/deduped/tied extrema 不是同一 result grain。候选 description 和 eval 必须显式保留这条区别。

### 13.2 Pseudo-schema

```ts
type SelectEndgameExtremaInput = {
  locale: 'zh-CN';
  filter: EndgameFilter;
  groupBy: EndgameGroupDimension[]; // <= 3, <= 1 exploded weakness
  metrics: Array<{
    op: 'argMin' | 'argMax';
    field: 'hpPerBar' | 'speed' | 'toughnessPerBar' | 'level';
    select: Array<'enemyTemplate' | 'monster' | 'location'>; // 1..3 unique
    as: MetricAlias;
  }>;
  sort: AggregateSort[];
  limit: number;
};
```

这是 surface prototype，不是实现建议定稿。为了隔离 decomposition 的影响，字节模拟保留当前 `metrics` key、filter/groupBy/sort/limit 和 result contract，只把 metric union 拆为 5 + 2 branches。

### 13.3 Schema and context measurement

| Item | Current | Extrema split prototype | Delta |
| --- | ---: | ---: | ---: |
| Total tool definitions | 13,657 B | 18,578 B | +4,921 B / +36.0% |
| Largest tool | 7,676 B | 6,532 B | -1,144 B / -14.9% |
| Scalar aggregate schema | 7,028 B | 6,208 B | -820 B / -11.7% |
| Scalar aggregate metric branches | 7 | 5 | -2 |
| Extrema schema | n/a | 5,698 B | +5,698 B |
| Extrema metric branches | mixed in 7 | 2 | isolated |

Prototype definition sizes：

```text
search_entities          1,249 B
query_endgame            4,728 B
aggregate_endgame        6,532 B
select_endgame_extrema   6,064 B
```

Prototype 中两个 analytical descriptions 合计 505 B，反而略低于当前 Aggregate 的 558 B，因为使用了更短的职责文案；这不是稳定收益。生产描述仍需在两个 tools 中重复 scope、weakness、evidence 与 global-top boundary。测量显示主要增量来自 schema duplication，而不是 description 本身。

拆分改善最大单工具和局部 branch complexity，但不会自动减少每次 API request 的总 tool tokens，因为四个 definitions 仍全部发送。

### 13.4 Shared schema duplication

单个候选 extrema schema 中重复序列化：

```text
EndgameFilter   3,190 B
groupBy           407 B
sort              891 B
```

仅这三项合计约 4,488 B，解释了总 definitions 增量的大部分。TypeScript/Zod 可以继续共享同一 code-level schema，但当前 provider-facing JSON Schema 会 inline 每个 tool 的完整结构；代码复用不等于 wire bytes 复用。

当前 stack 没有自然使用 provider `$ref` 的基础，也没有必要为了四个 tools 建一套复杂 reference infrastructure。即使 provider 接受 `$ref`，还需要单独验证兼容性和 token 实际收益，不能作为本阶段前提。

### 13.5 Overlap risk

核心区分对大多数用户 operation 自然，但不是零 overlap：

- “最高值是多少” → scalar；
- “最高的是谁” → extrema；
- “全局最高具体 row” → Query；
- “全局最高 identity 且保留并列” → Extrema；
- “平均值 + 最高是谁” → Aggregate + Extrema。

因此 Architecture B 将一部分 within-tool branching 变成 tool selection。它是否净改善只能由 A/B 证明。

Verdict：**PROMISING — A/B TEST**。

## 14. Architecture C — Further Summary / Group Split

调查的实际分解是：

```text
search_entities
query_endgame
summarize_endgame       // ungrouped scalar summary
group_endgame           // grouped scalar summary
select_endgame_extrema
```

静态 prototype 总 definitions 为 23,272 B，比 baseline 增加 9,615 B（+70.4%）。

这个拆分不满足 Routing Separability：用户 operation 没有从“summary”变成另一种 operation，只是 partition 是否为空。以下两个请求在用户心智中都是 summary：

```text
整个范围平均 HP
每期平均 HP
```

要求模型仅因为是否有 `groupBy` 就改 tool name，会把 schema 内一个自然参数提升为 routing decision。Grouping 与 scalar aggregation 在领域上不可自然分离；`groupBy season + avg HP` 本身就是 summary aggregation。

如果 Architecture C 只是把 `aggregate_endgame` 改名为 `summarize_endgame`，则没有实质 decomposition，不能解决 branching。若真正拆 global/grouped，则会增加 tool overlap、filter duplication 和 combined-operation calls。

Verdict：**NOT RECOMMENDED**。

## 15. Architecture D — Unified Analysis Negative Control

Negative control：

```text
search_entities
analyze_endgame
```

`analyze_endgame` 用 top-level operation union 合并 Query、Aggregate 和 Extrema。粗略 prototype 为：

| Item | Value |
| --- | ---: |
| Total definitions | about 12,833 B |
| `analyze_endgame` definition | about 11,581 B |
| `analyze_endgame` schema | about 11,350 B |

总 bytes 可以因 wrapper/description 合并而略低于 baseline，但最大单工具急剧增大，list row、global sort、summary、grouped extrema、projection、metric、tie 和 result shape 全部进入一个入口。Tool selection complexity 看似下降，所有 complexity 实际转移到 `operation` 与参数分支内。

它与 Phase 1.3 “工具名稳定但 key args 退化”的方向相反，也会让 result union 和 correction hint 更复杂。责任名称 `analyze` 过宽，不满足 distinct responsibility。

Verdict：**NOT RECOMMENDED**。

## 16. Tool Responsibility Matrix

### 16.1 Current baseline vs extrema split

| User operation | Current Query | Current Aggregate | Candidate Extrema | Candidate behavior |
| --- | --- | --- | --- | --- |
| list rows | single obvious | no | no | Query |
| global concrete top row | single obvious | possible but discouraged | possible if ties/identity requested | Query unless associated/tie grain is explicit |
| count | no | single obvious | no | Aggregate |
| distinct count | no | single obvious | no | Aggregate |
| scalar grouped min/max | no | single obvious | no | Aggregate |
| grouped winner identity/location | no | supported inside broad Aggregate | single obvious | Extrema |
| weakness frequency | no | single obvious | no | Aggregate |
| weakness-filtered list | single obvious | no | no | Query |
| scalar summary + winner | no | one call | second operation | two calls under split |
| drill-down | single obvious | no | no | Query |

### 16.2 Architecture-level overlap

| Architecture | Single obvious cases | Multiple plausible cases |
| --- | --- | --- |
| A — current | list/query vs summary 基本清楚 | global highest；Aggregate 内 scalar vs arg 不影响 tool name但影响参数 |
| B — extrema split | count/avg/value vs who/location 更清楚 | global concrete top vs tied associated extrema；combined summary+winner |
| C — global/group split | 很少新增自然区别 | global vs grouped summary 需要模型根据内部 partition 选 tool |
| D — unified | nominally one Endgame tool | 所有 operation ambiguity 都进入巨型 parameter union |

Routing separability gate 判断：Architecture B 通过到“值得实验”的程度，因为用户 operation type 通常能区分 value summary 与 associated winner；Architecture C 不通过；Architecture D 取消 routing 但显著恶化 within-tool planning。

## 17. Schema / Context Cost Comparison

| Architecture | Tool count | Responsibility clarity | Routing ambiguity | Within-tool complexity | Total definition bytes | Largest tool | Double-call risk | Migration cost | Verdict |
| --- | ---: | --- | --- | --- | ---: | ---: | --- | --- | --- |
| Current 3-tool | 3 | Medium；Query/Search 清楚，Aggregate 宽 | Low–Medium | High in Aggregate | 13,657 | 7,676 | Low | None | **KEEP AS BASELINE** |
| Extrema split | 4 | High for scalar vs associated winner | Medium；global top 与 combined tasks仍有 overlap | Medium per analytical tool | 18,578 | 6,532 | Medium | Medium | **PROMISING — A/B TEST** |
| Global/group/extrema split | 5 | Low–Medium；grouping 被人工提升为责任 | High | Lower locally, fragmented globally | 23,272 | 6,413 | High | High | **NOT RECOMMENDED** |
| Unified analysis | 2 | Low | Low at name level | Very high in one 11.6 KB tool | ~12,833 | ~11,581 | Low | High | **NOT RECOMMENDED** |

Definition bytes 不包括 system prompt、tool results 和 message framing。当前 system prompt 为 3,255 B；Architecture B 还需要增加一段责任说明，因此 request context 不会只增加表中的 4,921 B，而是至少增加该值加 prompt delta。

## 18. Parameter Complexity Comparison

| Proxy | Current Aggregate | Candidate Scalar Aggregate | Candidate Extrema |
| --- | ---: | ---: | ---: |
| Top-level params | 6 | 6 | 6 |
| Season selector branches | 2 | 2 | 2 |
| Group dimensions | 9 | 9 | 9 |
| Metric union branches | 7 | 5 | 2 |
| Distinct field choices | 6 | 6 | 0 |
| Numeric field choices | 4 | 4 | 4 |
| Associated select choices | 7 non-empty subsets | 0 | 7 non-empty subsets |
| Sort union branches | 2 | 2 | 2 |
| Result metric families | scalar/count/avg/associated | scalar/count/avg | associated only |

Architecture B 的收益不是总 branch 数消失，而是让每个调用不再同时面对 scalar family 与 associated family。代价是模型必须先选择两个 analytical tool 之一，且 shared scope/group/sort schema 在两个 tool 中都存在。

## 19. Combined-Operation Trade-offs

正式 52-case corpora 中：

- 4 cases 覆盖 `argMin/argMax`；
- 23 cases expected `aggregate_endgame`；
- **0/52 cases 同时标记 scalar summary 与 associated extrema**；
- 三条 manual dogfooding 中也没有必须同时做 avg/count + winner 的请求。

因此现有 eval 不能估计 combined-operation double-call rate。必须用独立 counterfactual set 补测，而不能从“当前 0 次”推断产品中不会发生。

使用当前 deterministic engine 对三个组合问题做相同 filter/group 的实际序列化 profile：

| Combined task | Rows / groups | Current one-call bytes | Split two-call bytes | Extra result bytes |
| --- | ---: | ---: | ---: | ---: |
| 每期平均 HP + 最高 HP 敌人 | 50 / 6 | 3,967 | 5,558 | +1,591 |
| 每期 Boss 数量 + 速度最快敌人 | 31 / 3 | 3,042 | 3,997 | +955 |
| 各弱点出现次数 + HP 最大值对应敌人 | 31 / 7 | 4,084 | 5,711 | +1,627 |

拆分后的额外 bytes 主要来自重复 `dataVersion`、row grain、group dimensions、warnings 和 per-group envelopes。两次 tool call 还会增加一次 model planning/action 和 provider message history。

Evidence 也有真实成本。当前一个 combined call 的每个 group 只有一个 `ag1`，同时证明 summary 与 extrema；拆分后同一 group 的两套 metrics 会产生两个不同 `ag1`。六期 combined question 可能从 6 个核心 evidence 变成 12 个，超过当前终答 `evidenceIds <= 8`。这不是要求新 evidence namespace，但 A/B 必须观察 evidence coverage；不能只比较 tool-name accuracy。

相反，以下问题不需要两次调用：

```text
“每期最高值是多少、对应谁？”
```

Extrema result 自带 `value`，单次调用即可。真正的 double-call 风险只发生在 count/avg/其他 scalar summary 与 winner relation 同时被请求时。

## 20. Evidence & Internal Engine Reuse

Model-facing tool boundary 不等于 internal engine boundary。

当前代码已经适合共享：

```text
loadEndgameRows / filter / season resolution
              ↓
dimensionAssignments / aggregateRows
              ↓
Decimal comparison / scalar + arg metric evaluation
              ↓
sort / warnings / payload cap / ag1 hash
```

如果实现 Architecture B，理想结构是：

```text
shared deterministic aggregate executor
        ├─ aggregate_endgame schema/wrapper
        └─ select_endgame_extrema schema/wrapper
```

不应复制 filtering、season resolution、grouping、Decimal comparison、warning collection、tie handling 或 evidence hashing。当前 `endgame-aggregate.ts` 的部分 helper 是 module-private，实验实现可能需要提取一个 internal executor，但不需要拆两套数据逻辑。

Extrema 仍是 deterministic grouped aggregate fact，应继续使用 `ag1`。Tool name 当前不进入 hash；若 input filter/groupBy/metrics/dimensions 和 semantics 不变，拆 tool 可以保持 evidence identity。没有 provenance 语义变化，不应新增 `ex1`。

## 21. Eval Migration Strategy

旧 frozen gold 不能反向绑架新架构，也不能被任意重写。建议：

1. 保留当前分支、prompt/tools fingerprints 和全部原始结果作为 baseline。
2. Candidate branch 只改变 model-facing surface；先用 deterministic equivalence tests 证明新 extrema output、ties、warnings 和 `ag1` 与当前同输入 arg metric 等价。
3. 把 eval gold 分为 architecture-neutral operation：
   - entity resolution；
   - concrete row query/global row sort；
   - scalar/group summary；
   - associated extrema；
   - abstain/clarify。
4. Baseline 与 Candidate 各自映射 operation → tool name。不能因为旧 gold 写 `aggregate_endgame` 就判 candidate 的 extrema tool 错。
5. Facts、scope、identity、limitations、warnings 与 evidence gold 不随架构改写。
6. Global top-row cases保留，防止 Candidate 把所有“最高”都路由到 extrema。
7. Combined scalar+winner cases单独分层，观察 double-call 与 evidence cap。
8. Ambiguous prompts 如 Case C 不进入 strict tool-path metric；允许 clarification、explicit assumption 或 multiple accepted interpretations。
9. 同一 model、`thinking=low`、data revision、turn/call limits、output contract、case order strategy 与 repetitions；tool definitions 和必要的责任说明是实验 treatment。
10. 先跑 deterministic tests，再在单独批准后运行真实模型；本报告没有运行任何模型。

Frozen evaluator 的 `AgentToolNameSchema`、expected/forbidden tools、keyArguments、Inspector labels、error allowlist、tool fingerprint 和文档都会发生 migration。原 deterministic semantics 可以保留；model-facing contract 和 gold mapping需要显式版本化。

## 22. Proposed A/B Experiment

### 22.1 Arms

```text
Baseline A
  current 3-tool surface

Candidate B
  scalar-only aggregate_endgame
  associated-extrema-only select_endgame_extrema
  shared deterministic engine
```

不要在 Candidate 中同时做 prompt tuning、提高 turns、改变 model 或修改 data primitives。

### 22.2 Corpora

1. frozen 36：通过 architecture-neutral mapping 复验 regression；
2. generalization-v1 16：保留 weakness、arg extrema、identity、scope 和 presentation；
3. new decomposition set：
   - scalar-only counts/avg/min/max；
   - grouped winner identity/location；
   - global concrete top row；
   - global tied associated identity；
   - combined summary + winner；
   - query drill-down after summary；
   - ambiguity cases，但与 architecture score 分离。

### 22.3 Metrics

User correctness：

```text
facts
scope
identity
limitations
presentation
unsupported inference
```

Tool discipline：

```text
invalid calls
unnecessary calls
turn-limit
warning/evidence retention
```

Planning：

```text
first-tool name
first-tool key args
all key args
operation selection
group/identity grain
```

Efficiency：

```text
input/output/reasoning tokens
tool-result bytes
model turns
tool calls
latency average/p95
```

Architecture：

```text
tool-definition bytes
largest individual definition
overlap cases
combined-operation double-call rate
evidence IDs required per answer
```

### 22.4 Tiered decision rule

不使用一个 strict score 选 winner。

1. **Tier 1 — user correctness**：facts、scope、identity、limitations、presentation、unsupported boundary 必须 non-inferior；重大 scope/unsupported regression 直接淘汰 candidate。
2. **Tier 2 — agent discipline**：invalid/unnecessary calls、turn-limit、evidence/warnings 应改善或至少不恶化。
3. **Tier 3 — preferred planning**：first-tool name/key args、exact preferred trace 用于在前两层合格后比较。
4. **Efficiency guardrail**：若 planning 提升仅靠显著更多 tokens、double calls 或 evidence overflow 获得，不应 promotion。

Strict contract 可以继续报告，但只作为 composite diagnostic，不作为唯一 promotion gate。

## 23. Risks / Open Questions

1. Architecture B 是否会把“global top row vs global tied associated winner”变成新的 routing ambiguity。
2. Candidate extrema 是否允许 empty `groupBy`；若禁止，会丢失当前 global tied identity 能力；若允许，需要更清楚地区分 Query result grain。
3. Combined-operation 真实产品频率未知；当前 52 cases 为 0，不能代表实际用户分布。
4. 两次调用导致 `ag1` 数量增加，可能触及 final evidence cap。
5. 总 tool-definition bytes +36%，可能抵消局部 branch simplification。
6. Code-level shared schema 不会减少 provider inline duplication。
7. 当前 regression raw audit 未保留在工作区，failure mapping 无法做到逐 attempt 精确重算；下一次 A/B 必须保留原始 audit。
8. Ambiguity materiality 若完全依赖模型判断，仍可能漏判；但把它写成 wording list 会造成更大的 rule explosion。
9. 澄清过多会降低体验；必须坚持“合理多解 + material divergence + 无强 default”三项同时成立。
10. 如果未来 tool 数显著增长，再调查 selective exposure/dynamic tool loading；4 个 tools 不构成当前问题。

## 24. Final Recommendation

### 24.1 Intent

- 在 Scope Fidelity 前增加 **Intent / Scope Resolution** 原则。
- 只有歧义会实质改变数据集、结论、可回答性或重要 limitation，且没有强 domain default 时才澄清。
- 一个解释明显更自然时，允许声明 assumption 后继续。
- 多种解释最终结果相同，无需打断用户。
- Case C 两种“最近 6”解释都合理，当前数据分别产生 1 与 5 个 observations；它不再是 stopping failure 的确定性 gold，也不再是 promotion blocker。
- Ambiguous eval 应允许 multiple valid plans、clarification 和 explicit assumption，并从 unresolved strict tool-path metric 中排除。

### 24.2 Tool surface

- `aggregate_endgame` 当前确实承担 value summary 与 associated winner selection 两类独立 model-facing responsibilities。
- Phase 1.3 telemetry 与 within-tool complexity hypothesis 一致：工具名选择相对稳定，关键参数更弱；但尚不能证明拆 tool 必然改善。
- 当前三工具仍应保留为 **KEEP AS BASELINE**，不是不可改变的设计原则。
- `argMin/argMax` 与 scalar aggregate 的 mental model 足够可分，extrema split 值得 **PROMISING — A/B TEST**。
- 拆分会把 metric branches 从 7 分为 5 + 2，并降低最大单工具；同时总 definitions 增加 36.0%，combined tasks 会增加 calls、result bytes 和 evidence pressure。
- Weakness grouping 继续属于 scalar/group aggregate，不需要独立 tool。
- Query 的责任应继续是 concrete rows、global concrete ordering/top row 与 drill-down。
- Evidence namespace继续使用 `ag1`；底层 deterministic engine必须共享。
- 进一步拆 global/grouped summary 与统一 `analyze_endgame` 均不推荐。

### 24.3 Next phase

下一阶段应优先进行 **3-tool baseline vs 4-tool extrema split A/B**，而不是继续 orchestration/prompt refinement，也不是直接 production implementation。A/B 前先做人审，预注册 architecture-neutral gold、combined-operation cases、ambiguity scoring 和 Tier 1/2/3 decision rule。

最终原则：

> Resolve materially ambiguous intent before enforcing scope.  
> Optimize model-facing responsibility boundaries, not tool count.  
> Measure both routing difficulty and within-tool parameter planning.  
> Keep deterministic engines shared even when model-facing tools differ.

## 25. Required Questions — Direct Answers

### 25.1 Intent / ambiguity

1. **Case C 是否真的能作为 stopping failure？** 不能作为确定性 stopping failure；只有在 Agent 已明确采用 season-window scope 后又静默扩窗，才能单独判 Scope Fidelity failure。
2. **两种“最近 6”解释是否都合理？** 是；当前数据分别得到 1 与 5 个 observations。
3. **是否仍应作为 promotion blocker？** 否；改为 ambiguity-handling manual/exploratory case。
4. **Scope Fidelity 是否需要前置 resolution？** 是，增加 Intent / Scope Resolution。
5. **哪些 ambiguity 值得澄清？** 多个解释同样合理、materially divergent、且无强 domain default。
6. **哪些可声明 assumption 后继续？** 一个解释明显更自然、风险较低、且口径能用一句话公开。
7. **哪些无需处理？** 候选解释最终选择相同数据并产生相同核心答案。
8. **如何避免 clarification rule explosion？** 按 semantic axes、materiality 与 domain default 决策，不按 wording 建规则表。
9. **Ambiguous eval 如何评分？** 评分 ambiguity recognition、assumption/clarification、post-resolution correctness；不强制唯一首工具。
10. **是否允许 multiple valid plans / clarification？** 应允许，并为每个 accepted interpretation 保留独立 scope/fact gold。

### 25.2 Tool surface

1. **Aggregate 当前承担多少 responsibility？** 至少四项：scope/filter、scalar/exploded grouping、value summary、associated extrema selection/ties/projection。
2. **Name 稳定、key args 退化是否与 within-tool complexity 一致？** 一致，且 frozen 有至少 6/28“首工具名正确但关键参数错误”；只能作为 hypothesis，不能证明因果。
3. **主要 burden 在 tool selection 还是 parameter selection？** 当前证据偏向 parameter selection。
4. **三工具是否仍是最优 baseline？** 是最可信 baseline；不是已证明最优 production architecture。
5. **Arg extrema 是否值得独立 responsibility？** 值得进入 A/B，因为它回答 winner relation 而不只是 scalar value。
6. **Scalar aggregate 与 associated extrema 是否足够可分？** 大多数请求可按“多少/数值”与“谁/哪个位置”自然区分；global top 与 combined tasks 仍有 overlap。
7. **拆分后 scalar Aggregate 缩小多少？** Prototype definition 7,676 → 6,532 B；schema 7,028 → 6,208 B；metric branches 7 → 5。
8. **新 Extrema tool 多大？** Prototype definition 6,064 B；schema 5,698 B；2 metric branches。
9. **总 definition bytes 如何变化？** 13,657 → 18,578 B，增加 4,921 B / 36.0%。
10. **Branch complexity 是否下降？** 单工具显著下降为 5 与 2；跨完整 surface 的 shared scope branches 会重复。
11. **Routing ambiguity 是否上升？** 会小幅上升，主要在 global concrete top vs tied associated winner 和 combined operations。
12. **多少现有 eval 同时需要 summary + extrema？** 0/52 formal cases；现有 manual 也没有 count/avg + winner 的必需组合。
13. **Double-call 会成为新问题吗？** 对 combined tasks 会；实测增加 955–1,627 result bytes，并增加 evidence pressure。
14. **Query global top responsibility是否更清晰？** 可以更清晰，但必须以“concrete row”区别于 Extrema 的 identity/ties。
15. **Weakness grouping 留在哪里？** 留在 scalar/group Aggregate。
16. **Evidence namespace 是否变化？** 不变，Extrema 继续使用 `ag1`。
17. **Deterministic engine 能否共享？** 能；当前 filter/group/Decimal/tie/warning/hash 路径可由两个 wrapper 复用。
18. **Frozen eval 如何公平迁移？** 保留 facts/scope/evidence gold，增加 architecture-neutral operation 层，再分别映射 tool name。
19. **是否值得做 3 vs 4 tool A/B？** 值得；静态收益与成本方向相反，无法只靠 schema audit定胜负。
20. **下一阶段做 orchestration refinement 还是 decomposition A/B？** 优先 decomposition A/B；在人审前不再进入 prompt-tuning loop。
