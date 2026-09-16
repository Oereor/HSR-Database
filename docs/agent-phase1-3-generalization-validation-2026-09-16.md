# HSR-Database Data Agent Phase 1.3 Generalization Validation

日期：2026-09-16  
调查分支：`develop`  
调查提交：`43b9ae8c419212c89440cfff747b570d6fdcf5bf`  
调查性质：只读 generalization validation；未修改 Agent source、tool schema、prompt、runtime、tests、frozen eval 或 package files；真实模型调用数为 0。

## 1. Executive Summary

本轮把三个原始 dogfooding failures 从设计目标中移除后，重新验证上一报告提出的候选能力。结论不是“所有上一轮 REQUIRED 都原样保留”，而是：

- **multi-valued grouping 是通用数据 primitive**；但 public capability 只应先暴露经过 domain gate 的 `weakness`，不能自动开放所有数组字段；
- **`argMin/argMax` 是 metric-neutral、mode-neutral、grain-neutral 的 associated-extrema primitive**；它不是某个 Boss HP workflow，也不等于完整 top-K；
- **typed identity 是普遍 type-safety invariant**；但当前只有 enemy Search → Endgame 存在真实 cross-tool consumer，因此只做 `enemyTemplateId` 最小修复，不建设 universal identity algebra；
- **stopping 不应实现为 trend wording 或固定的 0/1/2/3 规则表**；应收敛为 evidence sufficiency 与 scope fidelity 两个通用 analytical invariants；
- **presentation boundary 是由 user intent 控制的通用 invariant**；不应实现无条件 internal-term blacklist。

反向测试结果：即使完全删除“弱点频率”“每期 Boss HP 最高/最低”“指定敌人最近六期 HP”三个原案例，当前数据仍提供了充分的 counterfactual evidence 支持 multi-valued grouping、arg extrema、typed enemy identity、evidence sufficiency、scope fidelity 和 presentation boundary。

最重要的降级是：

> 上一报告的“observation-aware 0/1/2/3 stopping rule”不应作为独立 REQUIRED 规则实施；它应降为 evidence sufficiency 的示例性推论。Presentation lint 也不应成为 REQUIRED runtime gate。

最终建议仍保持三个 tools，并实施一个有明确停止线的 Phase 1.3：

| Candidate | Generalization Verdict | Implement in Phase 1.3? | Why |
| --- | --- | --- | --- |
| Multi-valued grouping engine | **GENERAL PRIMITIVE — APPROVE** | Yes | 独立的 dimension→values 操作，跨 mode/scope/grain/metric 成立 |
| `weakness` exposure | **GENERAL PRIMITIVE — APPROVE** | Yes | 当前 domain 中 explode 语义稳定且有多类 counterfactual use |
| `argMin` | **GENERAL PRIMITIVE — APPROVE** | Yes | 与 metric、mode、group grain 解耦，并保留产生最小值的 identity |
| `argMax` | **GENERAL PRIMITIVE — APPROVE** | Yes | 与 `argMin` 对称，能消除大结果上的 model-side join |
| top-K per group | **PREMATURE — DEFER** | No | 引入 partition/order/take/tie cutoff，开始接近 window DSL |
| typed enemy identity | **GENERAL INVARIANT — APPROVE** | Yes | 保留已存在的 template namespace，消除裸 ID 猜测 |
| universal identity algebra | **PREMATURE — DEFER** | No | 当前没有多个真实 cross-tool entity consumers |
| evidence sufficiency | **GENERAL INVARIANT — APPROVE** | Yes | 可推导 comparison、change、trend、ranking、intersection、extremum 的前提 |
| scope fidelity | **GENERAL INVARIANT — APPROVE** | Yes | 覆盖时间、mode、identity grain、metric 与 filter，不限于趋势问题 |
| presentation boundary | **GENERAL INVARIANT — APPROVE** | Yes | planning representation 与 user-facing prose 的稳定职责边界 |

这组能力增加计算表达力，但不增加 epistemic authority：Agent 仍不能把 HP 当作难度、把弱点当作配队推荐、把 configured rows 当作 runtime spawn，或从相关性推断设计原因。

## 2. Why Generalization Validation Is Needed

真实 failure 只证明“值得调查”，不自动证明“值得增加能力”。如果每出现一种措辞就增加一个 workflow，Agent 会退化成事后枚举的 API 集合。

上一轮已经证明三个具体 gap 存在。本轮验证的是另一件事：

```text
移除原始问题
  → 替换 metric / mode / grain / scope
  → primitive 是否仍有稳定语义
  → 是否仍比现有组合更确定、更有界
```

本轮事实来源依次是当前代码与 tests、上一份 Phase 1.3 报告、generated data、frozen eval 和历史报告。执行了只读 deterministic profile，没有建立或保留 scratch artifact；`pnpm test:agent` 当前为 5 files / 46 tests 全部通过。

当前 baseline 大小为：

- 三个 tool definitions：12,204 bytes；
- `aggregate_endgame` definition：6,539 bytes；
- system prompt：2,066 bytes。

任何新增能力都必须证明其 generalization gain 值得增加 schema/prompt/result complexity，而不是仅证明“可以实现”。

## 3. Generalization Gate

本报告使用以下 gate：

| Gate | 通过条件 | 失败信号 |
| --- | --- | --- |
| Orthogonality | 表达独立 operation、dimension rule 或 invariant | 名称或参数直接编码某个业务问题 |
| Metric neutrality | HP、speed、toughness、level 替换后语义不变 | 只对 HP 有意义 |
| Mode neutrality | MoC/PF/AS/AA 使用同一 operation | schema 写死 mode |
| Grain neutrality | global、season、slot、encounter、stage、template 等只改变 partition | 必须依赖一种固定 grain |
| Composability | 可与现有 filter/groupBy/metric/scope 自然组合 | 需要特殊 workflow 或二次手工 join |
| Boundedness | allowlist、count/payload/tie cap 和停止线明确 | 自然要求 arbitrary expression/window/join |
| Counterfactual usefulness | 删除原 failure 后仍有多个不同问题 | 只剩原题改写 |

评级定义：

- `GENERAL PRIMITIVE — APPROVE`：通过 operation-level gate，可进入 Phase 1.3；
- `GENERAL INVARIANT — APPROVE`：通过 contract/analysis-level gate，可进入 Phase 1.3；
- `PROMISING BUT INSUFFICIENT EVIDENCE`：可能通用，但当前没有足够真实/数据证据；
- `CASE-SPECIFIC — REJECT`：只修某个 workflow；
- `PREMATURE — DEFER`：方向可能合理，但复杂度或 responsibility 尚未被真实需求证明。

## 4. Candidate A — Multi-valued Grouping

### 4.1 真正的 engine abstraction

应抽象为：

```text
dimension(row) → one or more normalized grouping values
```

而不是：

```text
special weakness grouping
```

原因：group engine 关心的是一行产生多少个 group assignments，不应知道 Fire、Lightning 或 weakness 的业务名单。`weakness` 只是第一个满足 public exposure gate 的 multi-valued domain dimension。

当前 `groupRows()` 假设：

```text
row → one dimensions object → one JSON key
```

通用 primitive 只需把这条映射扩为 bounded assignments；scalar dimensions 仍返回一个值，multi-valued dimension 返回规范化、去重后的多个值。它不需要用户提供 path、explode 函数或表达式。

### 4.2 当前数据的跨 mode 验证

对每个 mode 的 latest 3 seasons 做只读 explode simulation：

| Mode | Source rows | Rows with weakness | Weakness assignments | Categories | Resolved empty rows | Duplicate values |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| MoC | 318 | 314 | 919 | 7 | 4 | 0 |
| PF | 2,918 | 2,891 | 7,701 | 7 | 27 | 0 |
| AS | 31 | 30 | 116 | 7 | 1 | 0 |
| AA | 55 | 53 | 155 | 7 | 2 | 0 |

同一 explode semantics 在四个 mode 均成立。AA 的 `current` scope 返回 0 rows，是因为当前 AA schedule status 全为 unknown，不是 primitive 的 mode-specific failure。

### 4.3 Explode 与 metrics 的稳定组合

对 row values `[A,B,C]`：

- row 对 A、B、C 各贡献一次；
- 单个 category 内同一 row 最多贡献一次；
- scalar numeric value 可在多个 category 中各参与一次 aggregation；
- category groups 不互斥，因此 group rowCount 之和可大于 source rows。

与现有 metrics 的语义：

| Metric | Explode 后语义 | 稳定性判断 |
| --- | --- | --- |
| `rowCount` | 拥有该 category 的配置记录数 | 稳定；总和可大于 source rows，必须披露 explode |
| `countDistinct(enemyTemplate)` | 该 category 中不同 template 数 | 稳定；同 template 多 occurrence 去重 |
| `countDistinct(monster)` | 该 category 中不同 concrete Monster 数 | 稳定；与 template grain 明确区分 |
| `min(speed)` | 属于该 category 的 rows 中最小 resolved speed | 稳定；unresolved 按现有 skipped 规则处理 |
| `max(hpPerBar)` | 属于该 category 的 rows 中最大 resolved HP | 稳定；不改变 HP 定义 |
| `avg(toughnessPerBar)` | 属于该 category 的 rows 的配置行加权平均 | 稳定；PF weighting warning 仍适用 |

在 latest 2 MoC + AS 的 Fire bucket 中，当前数据同时得到：122 rows、40 个 templates、52 个 Monsters、min speed 105、max HP 30,004,901.032920、avg toughness 142.561983471074；只有 1 row 的 toughness unresolved。这个单一 bucket 已验证 count、distinct、min、max、avg 并非 weakness-frequency 专用。

### 4.4 Edge semantics

- **Empty arrays**：不产生 assignment；合法无 weakness 与 unresolved detail 必须继续区分。
- **Duplicate values**：当前 generated sample 为 0，但 engine 应 defensive dedupe，保证一行不在同一 bucket 计两次。
- **Unresolved values**：dimension unresolved 时不伪造 `Unknown` category；numeric unresolved 继续计入 `skippedUnresolvedRows`。
- **Group limit**：`enemyTemplate + weakness` 在 latest 2 MoC + AS 产生 205 groups，超过当前 100 group cap；应显式截断，而不是放宽 cap。
- **Payload limit**：仍使用 64 KiB；multi-valued grouping 不获得特殊豁免。
- **Evidence**：每个 exploded group 仍是 aggregate group，使用 `ag1`；dimension semantics 与 value 必须进入 hash。
- **Cross-product**：一次最多一个 multi-valued dimension，禁止两个 arrays 的 Cartesian explosion。

### 4.5 为什么只 expose `weakness`

内部 abstraction 可以通用，public schema 不应自动暴露数组字段。未来 dimension 必须逐项通过：

1. 字段有稳定、规范化的 domain semantics；
2. explode 对用户有自然含义；
3. category identity 清晰、可比较；
4. 有真实使用需求；
5. empty/unresolved/duplicate semantics 可定义；
6. 不产生不受控 cross-product；
7. evidence、warning 与 group limits 可继续成立。

`weakness` 满足这些条件。Resistance 尚不满足：按 element、按 `(element,value)`、按非零 resistance presence 是不同 grain。Tags 当前也没有经过真实需求和 category identity 审查。因此 generic engine 与 incremental public exposure 并不矛盾。

Candidate A verdict：

> **Multi-valued grouping：GENERAL PRIMITIVE — APPROVE。**  
> **`weakness` exposure：GENERAL PRIMITIVE — APPROVE。**  
> Resistance/tags exposure：`PROMISING BUT INSUFFICIENT EVIDENCE`，本阶段不实施。

## 5. Multi-valued Grouping Counterfactual Matrix

以下问题刻意不使用原始 weakness-frequency wording，也不作为正式 eval：

| Counterfactual capability question | Mode | Scope | Group grain | Metric | 为什么验证 generalization |
| --- | --- | --- | --- | --- | --- |
| 不同模式中，具有量子弱点的不同敌人类型数量如何比较？ | cross-mode | explicit mode range | mode + weakness | countDistinct(template) | set cardinality，不是 frequency 排名 |
| 当前 AS 两个节点分别覆盖多少种具有雷弱点的 concrete Monsters？ | AS | current | battleSlot + weakness | countDistinct(monster) | slot partition + concrete identity |
| 最近几期 MoC 中，各弱点对应敌人的平均韧性是多少？ | MoC | latest N | season + weakness | avg(toughness) | numeric average，非 count |
| 指定 PF 赛期中，不同弱点类别的最大单条 HP 是多少？ | PF | specific season | weakness | max(HP) | mode-specific warning 与 scalar max 组合 |
| 最新 AA 赛期里，各敌人类型实际配置了哪些 weakness categories？ | AA | latest N | enemyTemplate + weakness | rowCount | template-category relation；会触及 group cap |
| 最近两期 MoC 与 AS 中，各弱点下的最低速度是多少？ | cross-mode | latest N per mode | mode + weakness | min(speed) | metric/mode substitution |

Capability matrix：

| Axis | Variants checked | Result |
| --- | --- | --- |
| Mode | MoC / PF / AS / AA | 同一 explode semantics；数据量和 schedule availability 不同 |
| Scope | latest N / specific season / current / explicit mode range | 都可由现有 filter 先定义 scope；0-row scope 合法 |
| Other dimensions | weakness / season+weakness / slot+weakness / template+weakness / mode+weakness | 产生 7 / 26 / 58 / 205 / 13 groups 的 representative profile |
| Metrics | rowCount / two distinct grains / min speed / max HP / avg toughness | 语义一致；unresolved 继续使用现有 included/skipped contract |

反向结论：完全删除原始 weakness-frequency case 后，仍有多个跨 mode、scope、grain、metric 的独立能力需求。因此不是 case-specific patch。

## 6. Candidate B — Associated Extrema

### 6.1 Operation definition

Associated extrema 的核心不是“Boss HP trend”，而是：

```text
within each aggregate group:
  select min/max resolved metric value
  preserve bounded identities/locations associated with every tied extremum
```

它与现有 scalar `min/max` 的差别是保留 winner relation，而不是增加新的 numeric calculation。

### 6.2 Metric neutrality

| Numeric field | `argMin` 含义 | `argMax` 含义 | Special handling |
| --- | --- | --- | --- |
| `hpPerBar` | group 内最小 resolved HP 及其 identity | 最大 resolved HP 及其 identity | 保留当前 HP/PF/runtime semantics |
| `speed` | 最慢 resolved row identity | 最快 resolved row identity | unavailable rows skipped/disclosed |
| `toughnessPerBar` | 最低 resolved toughness identity | 最高 resolved toughness identity | unavailable rows skipped/disclosed |
| `level` | 最低 stage level associated identity | 最高 stage level associated identity | 当前 level 总是可转 DecimalString |

Comparator 和 tie rule 不因 field 改变。Primitive 真正 metric-neutral。

### 6.3 Group-grain neutrality

| Aggregate group | Operation interpretation | Useful associated result |
| --- | --- | --- |
| global / no group | 全 scope extremum | identity；简单单行 winner 通常仍应交给 Query |
| season | 每期 extremum | template/Monster/location |
| mode | 每个 mode extremum | template/Monster/location |
| battleSlot | 每个已 scoped slot extremum | Monster/location |
| encounter | 每个 encounter extremum | Monster/location |
| stage | 每个 stage extremum | Monster/wave location |
| enemyTemplate | 每个 template 的 extremum configuration | Monster/location |

GroupBy 只定义 partition，arg direction 与 metric semantics 不变。

### 6.4 Associated dimension allowlist

不应开放任意 result projection，也不需要把所有 group dimensions再变成 `select` enum。建议只允许三类 bounded associated identity：

1. `enemyTemplate`：稳定的敌人类型 identity；
2. `monster`：具体 Monster identity，并带所属 template；
3. `location`：一个 bounded structural locator，包含 mode/season/encounter/battleSlot/stage/wave 与 occurrence evidence。

Group dimensions本身已随 group 返回，不应重复 select。`season`、`encounter`、`battleSlot`、`stage`、`wave` 不分别扩成任意投影；需要位置时统一请求 structural `location`。Associated select 数量应有小 hard cap，tie list 也应有 hard cap。

这条边界服务稳定 identity/location，不服务 arbitrary row fields、mechanics、defenses 或用户指定 path。

### 6.5 Tie semantics

`argMin/argMax` 不是 deterministic 挑一个 row。结果应返回：

- extremum value；
- distinct associated tuples；
- `tiedRowCount`；
- associated `tieCount`；
- returned count 与 truncation flag；
- included/skipped unresolved rows。

当前 counterfactual profile 已出现真实 ties：latest 2 AS 的 per-slot minimum toughness 有 6 groups，其中 3 groups 存在 associated ties，最大 4 ties；MoC 1034 per-encounter minimum HP 有 12 groups，其中 10 groups 有 2 个 tied locations。Tie 不是理论边角，必须成为 primitive contract。

Candidate B verdict：

> **`argMin`：GENERAL PRIMITIVE — APPROVE。**  
> **`argMax`：GENERAL PRIMITIVE — APPROVE。**

## 7. Associated Extrema Counterfactual Matrix

本轮用当前 tools 和 generated rows 做了只读 profile。Candidate bytes 是按建议的 bounded result shape 模拟，不是已实现 tool output。

| Counterfactual task | Metric / group / associated | Source rows | Current scalar+query | Current over-grouping | Candidate simulation |
| --- | --- | ---: | --- | --- | --- |
| 每个 mode 速度最高的敌人类型 | max speed / mode / template | 2,209 | 4 scalar groups + query 截于 97 rows，合计 66,256 B | 171 groups，100 returned，truncated | 4 groups，1,067 B |
| 最近两期 AS 各节点韧性最低的 Monster | min toughness / slot / Monster | 18 | 6 scalar groups + 18 rows，14,333 B | 18 groups，6,398 B | 6 groups，2,622 B；3 tie groups |
| 指定 AA 赛期等级最高的敌人类型 | max level / one scope / template | 14 | 1 scalar group + 14 rows，10,702 B | 10 template groups，3,341 B | 1 group，277 B |
| MoC 1034 每个 encounter HP 最低实例的位置 | min HP / encounter / Monster+location | 112 | 12 scalar groups + query 截于 100 rows，66,624 B | 50 encounter+wave groups，22,395 B | 12 groups，8,776 B；10 tie groups |

这些问题没有使用原始 Boss-HP-per-season形状，却重复显示同一差异：

- current scalar min/max 得到 value，但丢 identity；
- 加 associated identity 到 groupBy 会 over-group，需要模型做 second-stage selection；
- query + model join 对小 scope 可行，对 112/2,209 rows 会截断；
- arg extrema 直接返回与 group 数量同阶的 bounded output，并集中处理 ties。

### 7.1 完整 cross-product 判断

| Axis | Values | Generalization result |
| --- | --- | --- |
| Numeric metric | HP / speed / toughness / level | 同一 comparator/skip/tie operation；通过 |
| Group grain | global / season / mode / slot / encounter / stage / template | 只改变 partition key；通过 |
| Associated identity | template / Monster / structural location | 都是稳定 allowlisted identity；通过 |
| Direction | min / max | 一个对称 comparison direction；通过 |

完全删除原始 Boss HP case 后，per-mode speed、per-slot toughness、specific-season level、per-encounter location 已提供独立充分理由。

## 8. `argMin/argMax` vs Top-K Re-evaluation

`argMax` 不是简单把 top-K 的 K 写死为 1：

- arg extrema 返回一个 scalar extremum value 与全部 bounded ties；
- top-K 返回有序 rows，必须定义 K、secondary order、tie cutoff、K 是否包含 ties、projection 和 result pagination；
- arg extrema 是 aggregate metric；top-K 更接近 partitioned row selection/window operation。

| Axis | argMin/argMax | top-K per group |
| --- | --- | --- |
| Schema | direction + numeric field + bounded associated identity | partition + orderBy + K + projection + tie cutoff |
| Payload | 与 groups × tie cap 有界 | 与 groups × K 增长 |
| Ties | 所有 extrema ties，明确 cap | K 边界处 ties 语义复杂 |
| Composability | 现有 group/metric 自然组合 | 引入 row selection 子语言 |
| Counterfactual coverage | 当前已证明多个 K=extremum 问题 | 没有真实 K>1 evidence |
| DSL creep | 低 | 高，接近 window function |

未来出现“每组前三”并不自动意味着应扩 aggregate；届时要重新调查 output size、ties 和 Query responsibility。当前结论仍是：

> **Top-K per group：PREMATURE — DEFER。**

## 9. Candidate C — Typed Identity

Typed identity 的通用原则是：

> 跨 tool handoff 时，不能丢失 identity namespace；数值相同不表示 identity kind 相同。

它不是 analytical operation，也不扩大可查询数据。它使当前已有事实不能被模型错误解释。

当前 enemy Search `id` 实际等于 `MonsterTemplateID`，而 Endgame 同时接受 `enemyTemplateIds` 和 `monsterIds`。用裸 `id` 要求模型猜 namespace，是 TypeScript 可以避免的 failure。

Phase 1.3 最小修复仍应是 enemy result 显式返回 `enemyTemplateId`，并让 tool contract声明它只能 handoff 到 `enemyTemplateIds`。无需把 Search 结果包装成 Endgame `filterRef`。

Candidate C verdict：

> **Typed cross-tool identity：GENERAL INVARIANT — APPROVE。**

## 10. Cross-tool Identity Generalization

### 10.1 当前 namespaces

| Identity | 当前形状 | 当前 cross-tool consumer | 裸 ID 风险 |
| --- | --- | --- | --- |
| Character ID | Search match `type+id`；实际 Avatar catalog ID | 无 Character detail/Endgame filter | 当前无 handoff failure |
| Light-cone ID | Search match `type+id`；equipment catalog ID | 无后续 tool | 当前无 handoff failure |
| Relic ID | Search match `type+id`；relic-set catalog ID | 无后续 tool | 当前无 handoff failure |
| Enemy template ID | Search match 裸 `id`；Query row `templateId`；filter `enemyTemplateIds` | Search → Query/Aggregate | **真实 ambiguity** |
| Monster ID | Query row `monsterId`；filter `monsterIds` | Query → later Query/Aggregate | 字段名已显式 typed |
| Season ID | `{mode,groupId}` pair | Query/Aggregate filters/results | 不是裸全局 ID；mode 是 namespace |
| Evidence ID | `ent1/eg1/ag1` prefix + explicit evidence fields | final evidence ledger | 已 self-namespaced，不能作 data filter |

一般原则确实适用于所有 cross-tool identity，但当前只有 enemy template 存在一个真实、已消费的 ambiguous handoff。Character/light-cone/relic 还没有第二个 tool consumer；为它们提前设计 `UniversalEntityRef<T>` 只会引入没有使用者的 identity algebra。

推荐层级：

1. 当前修复 `enemyTemplateId`；
2. 保持 Monster、season、evidence 的现有显式 fields/prefixes；
3. 将“新增任何 cross-tool consumer 必须声明 namespace”写成设计 invariant；
4. 只有出现第二类以上真实 typed handoff 后，再调查共享 generic reference。

Universal identity algebra verdict：

> **PREMATURE — DEFER。**

## 11. Candidate D — Evidence Sufficiency

### 11.1 General invariant

> 一个 analytical claim 只有在当前 evidence 满足该 claim 的最低逻辑、数学和完整性前提时才能输出。

这比“trend 至少几个点”更通用。Observation count 只是某些 claim 的一个前提；数据可比性、候选集合完整性、unresolved/truncation 也同样重要。

### 11.2 Analytical preconditions

| Claim type | Minimum evidence requirement |
| --- | --- |
| Single factual value | 至少一个匹配且该字段 resolved 的 observation；若多行值不一致，不能擅自选一个 |
| Absence / not found | 已定义且完整扫描的 scope；0 matches 可以支持 absence，但 truncated/错误 identity 不可以 |
| Comparison A vs B | A、B 都已定义，metric、grain、scope 可比 |
| Change | 至少两个有顺序、可比的 observations |
| Descriptive trend | 足够的有序、可比 observations 支持 pattern；通常至少 3，但不是脱离 coverage 的万能数字 |
| Ranking | 非空且可比较的候选集合；要声称全局/组内名次，候选集必须完整或明确 limitation |
| Frequency | counting grain 和 category 定义明确；scope 完整；PF row semantics 不能变成 runtime frequency |
| Intersection | 两侧集合都按相同 identity grain 定义且足够完整 |
| Extremum | 候选集合非空；至少一个 resolved metric；ties 与 skipped rows 被保留/披露 |

这张表用于验证推导，不应原样变成几十条 `if user says ...` prompt rules。

### 11.3 Avoid rule explosion

反模式：

```text
if trend → count points
if ranking → count candidates
if compare → run two queries
if growth → special wording
```

推荐实现只保留：

```text
respect requested scope
only make claims whose preconditions are supported by returned evidence
do not invent proxy, identity relation, missing value, or completeness
```

然后用少量 examples 示范 1-point trend、truncated ranking、unresolved extrema，而不是枚举用户句型。

上一报告的 0/1/2/≥3 表仍可作为 trend example：1 点不能描述 change；2 点可描述 pairwise change；3 点以上才可能描述 trend。但它不应成为独立 runtime rule 或 universal truth。

Evidence sufficiency verdict：

> **GENERAL INVARIANT — APPROVE。**

## 12. Candidate E — Scope Fidelity

### 12.1 General invariant

> Agent 不得为了让问题变得可回答，静默改变用户指定的 time range、mode、identity grain、metric definition 或 filters。

Scope fidelity 不限于 Case C：

- `current` 不能换成 latest；
- latest 6 不能换成 all history；
- MonsterID 不能扩大成同 template 的全部 Monsters；
- exact template 不能按同名自动扩大成隐式 family；
- `effectiveTotalHp` 不能换成 `hpPerBar × phaseCount`；
- Boss-only 不能静默包含 elite；
- weakness-filtered list 不能变成按 canonical Monster weakness；
- PF runtime spawn 不能换成 configured-row count；
- 用户的 metric 不能换成未经同意的 proxy。

允许的行为是：回答原 scope 内证据不足，并把扩大 scope 或替代 metric作为明确的 follow-up proposal；不能把 proposal 的结果冒充原问题答案。

Scope fidelity verdict：

> **GENERAL INVARIANT — APPROVE。**

## 13. Candidate F — Presentation Boundary

### 13.1 General invariant

> Internal representation may guide planning, but final user-facing prose should use public/game/domain language unless implementation detail itself is the user's subject.

它由 user intent 控制，而不是 internal-term blacklist：

| User intent | `groupId` / `configured-occurrence` / `MonsterID` 等是否可出现 |
| --- | --- |
| Ordinary analysis | 默认不出现；翻译为赛期、配置记录、节点、敌人类型 |
| Data-semantics question | 可以解释配置记录、去重与计数口径 |
| Implementation question | 可以明确解释 `groupId`、latest selection、evidence contract |
| Explicit ID question | 可以展示用户要求的 MonsterID/template ID |

### 13.2 Implementation layer assessment

- **System instruction**：需要建立 planning vocabulary 与 answer vocabulary 的边界；是主要层。
- **Finalization instruction**：需要提醒只在用户意图要求时暴露实现词；是第二道边界。
- **Schema**：现有 `answer/evidenceIds/limitations` 分离已经足够，不需要新增 format schema。
- **Lightweight lint**：可作为 non-blocking audit telemetry。对 `ag1/eg1/ent1`、`dataRevision/sourceCommit` 等几乎总是内部的 token 可高置信 flag；对 `groupId`、MonsterID、battleSlot 等必须结合 user intent，不能自动拒绝或改写。

初次 Phase 1.3 不需要把 lint 做成 runtime hard gate。先用 ordinary/semantics/implementation/ID 四类 paired eval 验证 prompt/finalization boundary。

Presentation boundary verdict：

> **GENERAL INVARIANT — APPROVE。**

## 14. Negative Generalization Cases

新增计算能力不扩大 epistemic authority：

| Request | 看似可用的新 primitive | 为什么仍不能这样回答 |
| --- | --- | --- |
| 哪一期最难？ | argMax HP/level | difficulty 未由 HP 或 level 定义；不能自动选 proxy |
| 最适合打该节点的角色？ | weakness grouping | 敌人弱点不等于角色推荐、队伍强度或胜率 |
| PF 实际刷怪最多的弱点？ | weakness rowCount | configured rows 不等于 runtime spawns |
| 哪个 Boss 总血量最高？ | argMax hpPerBar | hpPerBar 不等于 runtime-effective total HP |
| 同名敌人整体趋势？ | typed template IDs | typed identity 防误传，不创造 family relation |
| 当前 AA 的最高速度？ | latest AA + argMax | latest 不等于 current；AA schedule 当前 unknown |
| 为什么最近 HP 上升？ | extrema/trend data | calculation 不支持因果或设计动机 |
| 玩家平均击杀哪些弱点敌人？ | explode + count | 数据没有玩家 runtime behavior |

因此 tool descriptions 必须描述 operation responsibility 和 semantic boundaries，不能把“highest”“weakness”等词写成无条件 routing triggers。

## 15. Generalization Validation Matrix

| Candidate | Orthogonal? | Metric neutral? | Mode neutral? | Grain neutral? | Composable? | Bounded? | Counterfactual useful? | Case-specific risk | Complexity | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Multi-valued grouping | Yes | Yes | Yes | Yes | Yes | Yes：≤1 exploded dimension | Yes | 低，若 engine generic | 中 | **GENERAL PRIMITIVE — APPROVE** |
| `weakness` exposure | Yes，domain dimension | Yes | Yes | Yes | Yes | Yes：7-value enum + existing caps | Yes | 低 | 低 | **GENERAL PRIMITIVE — APPROVE** |
| `argMin` | Yes | Yes | Yes | Yes | Yes | Yes：allowlist + tie cap | Yes | 低 | 中 | **GENERAL PRIMITIVE — APPROVE** |
| `argMax` | Yes | Yes | Yes | Yes | Yes | Yes：allowlist + tie cap | Yes | 低 | 中 | **GENERAL PRIMITIVE — APPROVE** |
| Typed enemy identity | Yes，type invariant | n/a | n/a | Yes | Yes | Yes | Yes | 低 | 低 | **GENERAL INVARIANT — APPROVE** |
| Evidence sufficiency | Yes，analysis invariant | Yes | Yes | Yes | Yes | Yes | Yes | 低 | 低 | **GENERAL INVARIANT — APPROVE** |
| Scope fidelity | Yes，scope invariant | Yes | Yes | Yes | Yes | Yes | Yes | 低 | 低 | **GENERAL INVARIANT — APPROVE** |
| Presentation boundary | Yes，interface invariant | Yes | Yes | Yes | n/a | Yes | Yes | 中，若变 blacklist | 低 | **GENERAL INVARIANT — APPROVE** |
| top-K per group | Operation-like | Yes | Yes | Yes | Yes | 较弱 | 尚无充分 evidence | 中高 | 高 | **PREMATURE — DEFER** |
| Universal identity algebra | Principle-like | n/a | n/a | Yes | 潜在 | 未定义 | 当前不足 | 高 | 中高 | **PREMATURE — DEFER** |

反向测试通过：删除三个原始 failures 后，前七项仍有独立、跨轴 counterfactual evidence。top-K 与 universal identity algebra 没有通过同一门槛。

## 16. Query-DSL Creep / Stopping Line

加入 multi-valued grouping 与 arg extrema 后，`aggregate_endgame` 会成为更强的 bounded analytical surface，但尚未等于通用 Query DSL，前提是停止线保持严格：

允许：

```text
allowlisted filters
<= 3 group dimensions
<= 1 exploded dimension
bounded scalar metrics
bounded argMin/argMax
bounded associated identity/location
deterministic ties with cap
existing group/payload limits
```

拒绝：

```text
arbitrary path
arbitrary expression or formula
computed metric
nested / second-stage aggregate
window / partition AST
topK per group
subquery
join language
user-defined explode
multiple exploded-dimension Cartesian product
percentile / median without separate evidence
```

这条边界逻辑一致：新增项仍然是有限 enum 上的一次 group pass；被拒绝项会引入新的执行语言、第二层计算或无界结果。

Tool responsibility wording 应避免 bias：

- Query：具体 rows、global ordering、global top/bottom row、drill-down；
- Aggregate scalar：count/distinct/min/max/avg 等 summary；
- Aggregate arg extrema：**aggregate groups 内**的 extrema 与 bounded associated identity；
- weakness filter：只缩小候选 rows；
- weakness group：用户明确按 weakness categories 比较/汇总时使用。

当前全范围 HP global top-1 用 `query sort hp DESC limit 1` 只返回 1 row，约 1,825 bytes；这是最自然路径。加入 argMax 后不应把它改成 aggregate。Future regression 应保留 global top-1 Query cases，并加入 grouped extrema cases，防止“看到最高就一律 argMax”。

## 17. Complexity Budget

以下是实施预算上限，不是承诺的代码行数；超过预算应重新审查 scope。

| Candidate | Schema additions | Runtime/engine branches | New result shape | Deterministic test budget | Description growth | Payload risk | Gain / cost |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Multi-valued engine + weakness | 1 dimension enum；1 exploded marker | 1 assignment expansion path；≤1 multi-value validation | 现有 group shape + semantics metadata | 8–12 cases | 一小段 explode说明 | group count 增长；100/64KiB cap控制 | 高 |
| argMin/argMax | 2 metric union arms或1 direction union；small associated allowlist | comparator保留 rows；tie dedupe/cap | 1 associated-extrema metric variant | 12–18 cases | operation boundary + tie说明 | groups×tie cap；需硬上限 | 高 |
| Typed enemy identity | 1 explicit output field/type arm | 无 analytical branch | Search match 小幅变化 | 4–6 cases | 一句 handoff说明 | 可忽略 | 很高 |
| Evidence sufficiency + scope fidelity | 无 tool schema | planning/finalization instruction | 无 | 6–10 fake/model-eval scenarios | 两条 invariant + 少量 examples | 降低 calls/results | 很高 |
| Presentation boundary | 无 tool schema | 无 data branch | 无 | 4–8 intent-paired cases | 一条 boundary + exceptions | 降低终答长度 | 高 |
| top-K | 多个 order/K/tie/projection字段 | partitioned ordering | ordered row sets | ≥15–25 cases | 显著 | 高 | 当前不足 |
| Universal identity algebra | 多 entity unions/generics | consumers/adapters | 全部 Search outputs变化 | 跨域大矩阵 | 中 | 低 | 当前不足 |

实施 abstraction 可以适度 generic，public capability 仍应逐项暴露。Generic engine 不构成“顺手”暴露 resistance/tags 的理由；extrema engine 也不构成顺手加入 median、percentile、top-K 的理由。

## 18. Future Eval Strategy

### 18.1 Existing frozen regression

保持 24 dev + 12 held-out 原样不动。Phase 1.3 改变 tools/prompt fingerprint 后重跑，重点确认：

- global top-1 仍自然使用 Query；
- ordinary weakness filter 不被误路由成 grouping；
- concrete row/list/drill-down 不被 aggregate吞并；
- facts、scope、identity、evidence、warnings、bounded calls 不回退。

### 18.2 Supplemental generalization set

未来可独立创建 `generalization-v1` suite，但本轮不创建。设计原则：

- 不使用原始三个 dogfooding wording；
- 对 metric/mode/grain/scope 做系统 substitutions；
- positive 与 negative cases 成对；
- 包含 global Query top-1 vs grouped arg extrema 的责任边界；
- 包含 weakness filter vs weakness group 的责任边界；
- 包含 alias→same typed identity；
- 包含 scope-change traps、proxy traps 与 insufficient evidence；
- 包含 ordinary/semantics/implementation/ID presentation intent pairs；
- 不预设唯一 tool trace，除非测试目标正是 routing/first-tool planning。

主要评分应是：correct facts、correct scope、correct identity、ties、bounded calls、no unsupported inference、user-facing presentation。Tool path 只在 operation responsibility 是测试对象时评分。

### 18.3 Manual dogfooding

原始三个 questions 继续标记 `MANUAL / NON-BENCHMARK`。它们验证原 failure 是否消失，但不进入 supplemental gold，也不用于反复调整 wording。

## 19. Metamorphic Testing Opportunities

Metamorphic assertions 比逐题答案更能检测 case overfit：

| Transformation | Structural invariant |
| --- | --- |
| MoC → AS / PF / AA | operation shape不变；只允许 data availability/warnings变化 |
| HP → speed → toughness → level | group/select identity不变；只改变 numeric field 与 unresolved semantics |
| max → min | 只改变 comparison direction；filter/group/select不变 |
| season → mode / slot / encounter | 只改变 partition dimension；metric semantics不变 |
| canonical name → alias | typed entity identity 与 `ent1` evidence保持相同 |
| template identity → Monster identity | 只改变 explicit identity grain，不能静默合并 |
| add weakness filter | 候选 row set只能缩小或不变，不应改变 group operation |
| scalar group → exploded weakness group | assignment总数等于 source rows 的 weakness memberships，不等于 source row count |
| scalar extremum → arg extremum | value必须完全相同；每个 associated winner 的 metric等于 scalar value |
| result sort/limit变化 | 同一返回 aggregate fact 的 evidence identity遵循既有稳定规则 |
| ordinary → implementation intent | facts不变；只有允许的技术 vocabulary exposition变化 |
| latest 6 → all history | 必须是显式 scope transformation，不能在同一答案中静默发生 |

未来 deterministic tests 可以从 generated fixtures 生成 transformations；model eval 只需检查 invariant 和 scope，不必为每个替换写唯一 prose gold。

## 20. What Should NOT Be Implemented

1. 不实现任何 case-shaped API 或 workflow 名称。
2. 不公开 arbitrary multi-valued field path。
3. 不因 engine generic 就暴露 resistance、tags 或其他 arrays。
4. 不实现多个 exploded dimensions 的 Cartesian product。
5. 不实现 top-K、median、percentile、window、nested aggregate 或 second-stage aggregate。
6. 不把 argMax 描述为所有“最高”问题的默认 tool；global concrete top-1 保留 Query。
7. 不把 weakness grouping 描述为所有弱点问题的默认 operation；filter/list仍使用原责任边界。
8. 不建设 UniversalEntityRef、全站 identity registry 或 filterRef coupling。
9. 不把 0/1/2/3 observation 表写成独立硬编码 rule engine。
10. 不建立 `if trend/if ranking/if compare/if growth` 的 wording rule explosion。
11. 不实现 unconditional internal-term blacklist 或自动改写 user answer。
12. 不扩大 turn、group、payload 或 output-token limits补偿 planning/algebra问题。
13. 不修改原 frozen eval，不把三个 dogfooding cases 转成正式 benchmark。
14. 不让新 primitives 推导 difficulty、recommendation、runtime behavior、因果或设计动机。

## 21. Final Phase 1.3 Recommendation

### 21.1 最终实施范围

建议人审后实施：

1. generic bounded multi-valued grouping engine，但 public schema 只新增 `weakness`；
2. symmetric bounded `argMin/argMax`，associated allowlist 只含 template、Monster、structural location；
3. Search enemy match 显式 typed 为 `enemyTemplateId`；
4. system/finalization contract 加入 evidence sufficiency 与 scope fidelity；
5. system/finalization contract 加入 intent-controlled presentation boundary；
6. 保持三个 tools、4 turns、8 calls、现有 data/evidence/limits/frozen regression。

### 21.2 上一报告 REQUIRED 的复核

| Previous item | 本轮结论 |
| --- | --- |
| weakness explode grouping | 保持 REQUIRED；generalization evidence 通过 |
| argMin/argMax | 保持 REQUIRED；generalization evidence 通过 |
| typed enemy identity | 保持 REQUIRED；但不泛化成 universal identity algebra |
| observation-aware stopping | **降级/重构**：取消独立 0/1/2/3 rule，改为 evidence sufficiency + scope fidelity 两个 REQUIRED invariants |
| presentation policy | 保持 REQUIRED invariant；runtime hard lint / banned list 降为不实施或后置 telemetry |
| narrower Query projections | 仍为 optional/defer；不解决 operation gap |
| resistance grouping | 继续 defer；generic engine 不等于 public exposure approval |
| top-K | 继续不推荐/ defer |

### 21.3 二十个必答问题

1. **`weakness` grouping 背后的真正 primitive 是什么？**  
   `dimension(row) → one or more normalized grouping values` 的 bounded multi-valued grouping；weakness 只是首个 exposed dimension。

2. **如果完全删除原 weakness-frequency case，是否仍有充分理由实现？**  
   有。跨 mode 的 distinct templates、per-slot Monsters、per-season average toughness、per-category max HP/min speed 等 counterfactuals 都使用同一 primitive。

3. **`argMin/argMax` 是否真正 metric-neutral？**  
   是。HP、speed、toughness、level 共用同一 comparison、unresolved、tie 与 associated identity semantics。

4. **如果完全删除原 Boss-HP case，是否仍有充分理由实现？**  
   有。per-mode max speed、per-slot min toughness、specific-season max level、per-encounter min HP location 都显示同一 deterministic join gap。

5. **Associated dimension 应开放到什么范围？**  
   只开放 `enemyTemplate`、`monster` 和 bounded structural `location`。Group dimensions已自动返回；不开放 arbitrary projections/paths。

6. **`argMin/argMax` 与 Query global sort 的稳定责任边界是什么？**  
   Query 返回具体 rows、global ordering 和 global top/bottom；arg extrema 在 aggregate groups 内返回 extremum 与 bounded associated identity。简单 global top-1 继续 Query。

7. **Top-K 是否仍然应 defer？**  
   是。它需要 partition/order/K/projection/tie-cutoff，结果随 groups×K 增长，当前没有 K>1 真实证据。

8. **Typed identity 是 enemy-specific patch 还是普遍 type-safety principle？**  
   原则普遍；当前最小实施点是 enemy-specific，因为只有 enemy Search → Endgame 有真实 ambiguous consumer。

9. **是否需要现在建立 universal typed reference？**  
   不需要。Character、light-cone、relic 没有后续 tool consumer；先显式 `enemyTemplateId`，未来新增 consumer 时再审查。

10. **Stopping 应该写成 trend-specific threshold，还是 evidence sufficiency？**  
    写成 evidence sufficiency，并辅以 scope fidelity；0/1/2/3 只作为 trend example，不做独立规则系统。

11. **Scope fidelity 能否覆盖 Case C 之外的大量请求？**  
    能。它同时约束 current/latest、mode、Monster/template、HP metric、Boss/weakness filters、PF grain 与 proxy substitution。

12. **Presentation boundary 能否不依赖 banned-word list？**  
    能。以 user intent 决定 ordinary、data-semantics、implementation、ID 四种 exposition；lint最多做 non-blocking telemetry。

13. **新 primitives 是否会扩大计算能力但保持 epistemic boundary 不变？**  
    会。它们只改善 grouping、selection 和 type preservation，不授权 difficulty、recommendation、runtime、family、causality 等推断。

14. **Phase 1.3 后的 aggregate surface 是否仍然 bounded？**  
    是，只要保持 ≤3 group dims、≤1 exploded dim、bounded metrics/associated ties、100 groups、64 KiB和 allowlists。

15. **是否已经开始重新发明 Query DSL？**  
    尚未；它仍是一次 bounded domain aggregation。若加入 arbitrary paths、top-K/window、nested aggregates、formula/join，就越过停止线。

16. **哪些未来需求明确应该拒绝继续扩 aggregate？**  
    任意表达式、计算公式、nested/second-stage aggregate、window/top-K、subquery/join、arbitrary explode、多个 array cross-product，以及没有 domain semantics 的 median/percentile。

17. **怎样通过 metamorphic/counterfactual eval 检测过拟合？**  
    做 mode/metric/grain/direction/alias transformations，检查 operation shape、identity、scope、ties、evidence 与 unsupported boundary，而不是只核对逐题 prose。

18. **三个原始 dogfooding cases 是否应继续保持 manual-only？**  
    是，保持 `MANUAL / NON-BENCHMARK`，只做 acceptance，不进入新 gold suite。

19. **Phase 1.3 到底应该实施哪些内容？**  
    Weakness 的 generic explode grouping、argMin/argMax、typed enemy identity、evidence sufficiency、scope fidelity、intent-controlled presentation boundary。

20. **哪些上一报告的 `REQUIRED` 项应该被降级或取消？**  
    独立的 0/1/2/3 trend stopping rule取消，重构为两个 invariants；presentation hard lint/banned list不实施。其他四项保持，但 public scope更窄：只 exposure weakness、只 minimal enemy typing、只 bounded associated dimensions。

### 21.4 Final decision

Phase 1.3 应实施，但目标必须表述为：

> **增加两个 bounded analytical primitives，保留一个真实 cross-tool identity namespace，并用两个分析不变量与一个 presentation invariant约束模型。**

不能表述为“修复三个问题”，也不能借此一次补齐更多 analytics。Human review 通过前不应开始实现。

