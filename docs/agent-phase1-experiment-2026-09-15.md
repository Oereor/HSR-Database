# HSR-Database Data Agent Phase 1 实验报告

日期：2026-09-15

## 1. Executive Summary

Phase 1 已完成一个仅本地运行、仅支持 `zh-CN` 的单 Agent prototype。实现直接读取现有 generated Endgame、Enemy detail、Search V2 和 manifest，没有增加 Web route、UI、数据库、部署变更或 Agent 专用数据生成管线。

确定性数据层、三个只读工具、受限 runtime、DeepSeek provider、CLI、36 条冻结 eval corpus 和离线/真实模型 eval 均已落地。Human Gate 前真实模型调用数为 0；用户明确允许后，执行了 36 条全量单次评测和 10 条代表性 case 的三次稳定性评测。

最终建议：**ITERATE PHASE 1**。

理由：确定性工具层可靠，模型对 gold 事实字符串的命中为 35/36，说明跨模式、指标和操作的事实获取有初步泛化；但严格 gold contract 仅通过 3/36，证据要求仅通过 12/20，产生 17 个无效 evidence ID，平均工具调用 2.75 次，高于 gold 平均值加一的 1.81 次上限。unsupported 的原评分为 8/8，但人工复核为 7/8；稳定性评测严格通过 4/30。当前证据不足以扩展工具面或进入生产化 Phase 2。

## 2. Implemented Architecture

实现保持三层边界：

1. `src/lib/agent`：Zod strict contracts、共享类型、eval corpus contract。
2. `src/lib/server/agent`：数据源、normalized row、filter/sort engine、三个工具、bounded runtime。
3. `scripts/agent`：本地 CLI 与 eval runner。

数据流为：

```text
generated Endgame + Enemy detail + Search V2 + manifest
                         ↓
       normalized configured-occurrence rows
                         ↓
 search_entities | query_endgame | aggregate_endgame
                         ↓
  allowlist → JSON parse → Zod → semantic limits → execute
                         ↓
          bounded DeepSeek tool-calling runtime
```

Runtime 固定最多 4 个 model turns、8 个总 tool calls，并计入并行调用。模型只能调用三个固定工具，不能访问 shell、文件系统、通用网络、SQL 或代码执行。错误返回脱敏 code；debug trace 只记录 turn、tool、validated args、结果数量、warning、latency 和 usage。

DeepSeek provider 使用 OpenAI-compatible `/chat/completions`、`tool_choice: auto`、`thinking: { type: "disabled" }`、temperature 0 和 60 秒 timeout。应用侧始终再次执行本地验证，没有启用 provider strict beta，也没有引入 Agent SDK 或额外 HTTP client。实现依据：[Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)、[Tool Calls](https://api-docs.deepseek.com/guides/tool_calls/) 和 [Models](https://api-docs.deepseek.com/quick_start/pricing/)。

## 3. Changes From Feasibility Report

可行性报告原先设想 `schedule-first + groupId fallback`。实现按已确认领域规则统一为：

```text
MoC / PF / AS / AA season recency = 同一模式内 groupId 排序
schedule = calendar dates 与 current/upcoming/historical/unknown 状态证据
```

因此：

- `latest N` 默认排除已知 upcoming，包含 current、historical 和 unknown，再按 `groupId DESC` 取值；
- 可以显式包含 upcoming；
- `current` 只由 schedule 证明，绝不由最大 groupId 推断；
- AA 即使 schedule 为 unknown，仍能确定 latest，但不能推断 current。

其余实现选择均遵循当前代码优先：复用 Search V2、generated loaders、manifest、Enemy detail、现有 DecimalString 数据和 domain helper，没有建设第二套索引或数据管线。

## 4. Tool Contracts

所有 input 都是 Zod strict object，provider JSON Schema 由同一 schema 生成，未知字段会被拒绝。

### `search_entities`

- types：`character | light-cone | relic | enemy`；
- 复用 Search V2 normalization、FlexSearch 和既有九级排序；
- 默认 10，最大 25；
- 返回 stable entity id、canonical/matched label、name kind、match kind、1-based rank、truncation、首档并列 ambiguity 和 data version。

### `query_endgame`

- allowlisted filter：mode、season selection/status、encounter、variant、battle slot、stage、level、wave、enemy template、MonsterID、rank/category、weakness；
- projection：`location | enemy-identity | enemy-defenses | instance-stats | mechanics`；
- sort 只允许固定字段；数值使用无损十进制比较，unresolved/null 排在 resolved 后，evidence ID 稳定打破平局；
- 默认 100 行，最大 500 行；完整 JSON payload 上限 256 KiB；任何截断都有 warning。

### `aggregate_endgame`

- 与 query 共用 season selection、row 和 filter engine；
- operations：`rowCount | countDistinct | min | max | avg`；
- `groupBy <= 3`、`metrics <= 5`，默认 20 组、最大 100 组；
- group dimension、numeric field、distinct identity 和 sort key 均为固定 enum；
- metric alias 必须唯一且符合受限标识符；
- `avg` 返回 exact `sum/count`、可用时的 `exactDecimal`、BigInt half-up 12 位 `decimalApprox` 和 `approximate`；
- 每个 metric 分别记录 included/skipped rows，每组只携带有界、确定性的代表 evidence IDs。

所有工具输出携带：

```text
gameVersion, sourceCommit, dataRevision, locale
```

缺失赛期名称返回 `null`，不会把 UI fallback 当成官方名称。

## 5. Data Semantics

### Configured occurrence

normalized row 的固定 grain 是 `configured-occurrence`。每一行描述一个配置位置，不描述趋势、难度、最佳选择或设计意图。

PF 的配置重复保留原貌：configured occurrence 不等于运行时实际刷新、出现或击杀数量。因此 PF `rowCount` 和 `avg` 分别发出稳定 warning，不能被解释为真实刷新数或玩家战斗统计。

### Template、Monster 与 occurrence

敌人防御、弱点、rank 等按：

```text
monsterTemplateId → Enemy detail → exact MonsterID
```

解析。找不到 exact MonsterID 或 detail 时保留 unresolved，绝不回退 canonical/default Monster。distinct aggregation 明确区分 enemy template、Monster 和 configured occurrence 的语义。

### Multi-phase HP

不会默认把 `hpPerBar × phaseCount` 称为 Boss 总 HP。shared HP、restore、lock/manipulation、召唤物或外部 stage mechanics 会令 `effectiveTotalHpStatus` 成为 `runtime-unclear`，并返回 warning。

### Evidence

Endgame occurrence evidence ID 固定为：

```text
eg1/<mode>/<groupId>/<encodedEncounterId>/<battleSlot>/<stageId>/<waveKind>/<waveId>/<monsterGroupId|->/<1-basedPosition>/<monsterId>
```

ID 不依赖本地化文本，并在同一数据 snapshot 内 deterministic。Runtime 只保留本轮工具结果中实际出现过的 Endgame evidence ID，其余引用会从最终答案移除并计入 `invalidEvidenceIds`。

### Latest 与 current

latest 只表示 groupId recency；current 只表示 schedule 证明当前开放。两者不能互相替代。

## 6. Deterministic Test Results

Stage A 与最终收尾验证覆盖：

- 四模式 groupId recency、矛盾 schedule、AA unknown schedule、latest/current/upcoming；
- exact/prefix/alias/type filter、同名 Enemy ambiguity；
- fixed wave、PF 原始重复配置、1-based position、exact/missing Monster join；
- rank、weakness/resistance、speed/toughness unavailable、HP unresolved；
- single/multi phase、shared/restore/lock/manipulation、runtime-unclear effective HP；
- 五种 aggregation、distinct identity、非终止 avg、DecimalString 大数精度；
- row/group/payload limit、显式 truncation、稳定排序；
- fake model 多轮、并行、非法调用、超限、timeout、provider 响应兼容与秘密脱敏；
- 24 dev + 12 held-out 的 coverage 约束。

最终检查结果：

| 检查 | 结果 |
| --- | --- |
| Agent unit tests | 29/29 passed |
| Full unit tests | 510/510 passed |
| ESLint / Prettier | passed |
| TypeScript / Svelte check | 0 errors, 0 warnings |
| Data validation / ensure | passed；保留既有 544 个 missing TextHash warnings |
| Production build | passed |
| Playwright e2e smoke | 5/5 passed |

## 7. Model Eval Design

Corpus 在 Human Gate 前冻结：

- `dev.jsonl`：24 条；
- `held-out.jsonl`：12 条；
- answerability：23 supported、5 partial、8 unsupported；
- 系统覆盖 MoC、PF、AS、AA；HP、speed、toughness、level、weakness、rank 与 identity；current/latest/specific/multi-season/historical；retrieve/filter/sort/distinct/count/countDistinct/min/max/avg/set comparison/multi-step/abstain；多种 grain。

Gold contract 包含 expected/forbidden tools、关键参数子集、事实字符串、warnings、answerability 和 evidence 要求。全量基线先跑 36 条各一次；随后取冻结的 10 条 `stability` case，各跑三次。没有根据 held-out 失败增加专用工具、helper、prompt 答案或 wording branch。

## 8. Model Eval Results

### Provider compatibility run

第一次全量运行 `2026-09-15T06-24-26-182Z` 的 36/36 case 都返回 `DEEPSEEK_INVALID_RESPONSE`，平均 1,663 ms，p95 2,397 ms。原因是 DeepSeek 的非流式 tool call 对象包含额外 `index` metadata，而 provider response parser 错误地把该外层对象设为 strict。

这是通用 provider compatibility bug，不是模型质量失败。修复为只对受信任的内部字段做映射、允许 tool-call envelope 的额外 provider metadata，并加入包含 `index: 0` 的 mock regression test。工具 input strict validation 没有放宽。修复后两次正式 eval 均为 0 provider/schema/runtime fatal errors。

### 36 条全量单次基线

Run ID：`2026-09-15T06-28-32-651Z`

| 指标 | 结果 |
| --- | ---: |
| Completed / fatal errors | 36 / 0 |
| Strict gold contract | 3/36（8.3%） |
| Expected tool present | 35/36（97.2%） |
| Forbidden tool avoided | 19/36（52.8%） |
| Key argument subset matched | 24/36（66.7%） |
| Gold fact strings matched | 35/36（97.2%） |
| Supported gold facts matched | 22/23（95.7%） |
| Required semantic warnings matched | 10/10（100%） |
| Required evidence passed | 12/20（60.0%） |
| Invalid evidence IDs | 17，分布于 5 个 entity-search case |
| Structured final answer | 23/36（63.9%） |
| Hit 4-turn limit | 9/36（25.0%） |
| Avg tool calls | 2.75；gold avg 0.81，门槛 1.81 |
| Within per-case gold + 1 | 21/36（58.3%） |
| Avg / p50 / p95 latency | 7,258 / 6,581 / 13,328 ms |

事实字符串指标会被无事实 gold case 稀释，不能单独视为完整准确率；严格 contract、argument 与 evidence 指标更能反映端到端可用性。

unsupported 的旧评分器因为“limitations 非空”即可通过，原始记录显示 8/8。人工逐条复核后为 7/8（87.5%）：`最近几期混沌回忆哪一期最难？` 仍以 HP proxy 直接给出“最难”结论，违反 gold 的 objective-difficulty 边界。评分器已改为只接受明确拒答措辞或 turn-limit 无答案，防止以后虚高；原始 audit 未被改写。

15 个 case 收到过 truncated 工具结果，仅 8 个最终回答明确提及截断。工具正确产生 warning，但模型没有稳定保留。

### 10 条 × 3 次稳定性基线

Run ID：`2026-09-15T06-35-08-099Z`

| 指标 | 结果 |
| --- | ---: |
| Completed / fatal errors | 30 / 0 |
| Strict gold contract | 4/30（13.3%） |
| Gold fact strings matched | 30/30（100%） |
| Key argument subset matched | 14/30（46.7%） |
| Evidence passed | 16/30（53.3%） |
| Structured final answer | 20/30（66.7%） |
| Invalid evidence IDs | 3 |
| Avg / p50 / p95 latency | 6,516 / 6,249 / 9,947 ms |
| Avg tool calls | 2.63 |

10 个 case 中，9 个的 pass/fail 结果三次一致，但主要是一致失败；只有 5/10 的 exact tool sequence 三次一致，5/10 的最终 answer 文本三次完全一致。所有 10 个 case 的 gold facts 都是 3/3 命中，说明事实提取相对稳定，但工具编排、关键参数和证据闭环不稳定。

## 9. Failure Taxonomy

### Provider/runtime

- 首次运行的 tool-call `index` compatibility bug：已作为通用 bug 修复并回归测试。
- 修复后的 66 次正式尝试无 fatal provider、timeout、schema 或 runtime error。
- 9/36 全量 case 达到 4-turn 上限，表明模型会在已有结果后继续探索。

### Tool selection 与 unnecessary calls

- 35/36 至少调用了 expected tool，但仅 19/36 避开 forbidden tool。
- 全量共 99 次工具调用：45 query、44 aggregate、10 search；其中 3 次参数非法并被本地拒绝。
- 模型常先拉 rows 再 aggregate，或在问题已不可回答时继续查询多个 proxy；平均调用超出 gold 1.94 次。

### Arguments 与 season/mode reasoning

- 12/36 没有出现满足 gold 关键参数子集的调用。
- 最明显的失败是 AS minimum-level case 中先把 `as` 误写成 `aa`，随后跨模式探测并达到 turn limit。
- latest/current、sort、limit、grouping 和 rank filter 也出现缺失或替代调用。

### Aggregation 与事实

- 只有一个 case 未命中 gold facts；直接失败原因是 mode 混淆后无最终答案，而不是 BigInt 聚合错误。
- 没有发现确定性 min/max/avg/countDistinct 的数值计算错误。
- 但模型有时用多个 proxy 回答不具定义的问题，例如用 HP 宣称客观“最难”。

### Evidence

- Endgame evidence validation 工作正常：无效 ID 会被剥离。
- 17 个无效 ID 全部来自 5 个 entity-search case：模型把 entity stable id 填进 `evidenceIds`，而 `search_entities` 当前没有可供最终答案引用的 evidence ID。这是 Phase 1 的真实 evidence-contract 缺口。
- 多个 aggregation 答案没有引用工具返回的代表 Endgame evidence，导致 evidence coverage 失败。

### Structured final answer

- 13/36 终答未通过严格 JSON parse，常见形式是把 JSON 包在 Markdown code fence 中；runtime 按约定保留文本并标记结构化失败。
- 非结构化 fallback 不泄漏 secret，但会失去机器可读 evidence/limitations。

### Warnings 与 truncation

- Gold 要求的 10 个 warning case 全部在 trace 中出现相应稳定 code。
- 但截断只在 8/15 相关终答中被解释；warning 从工具到最终回答的保真度不足。

### Knowledge boundary / abstention

- 多数 unsupported case 能明确说明数据缺口。
- “哪一期最难”case 越过 knowledge boundary，用 HP proxy 代替未定义的 objective difficulty，人工复核使 abstention 降为 7/8。
- 没有观察到直接捏造不存在的数据库字段；主要问题是 proxy 被表述为结论，以及为 unsupported 请求做过多工具调用。

## 10. Generalization Assessment

实验没有只对 PF HP trend 表现良好。冻结 corpus 的事实命中跨越：

- MoC、PF、AS、AA 和 cross-mode；
- speed、toughness、level、weakness、rank、identity 和 HP；
- retrieve、sort、distinct、min、max、avg、countDistinct、set comparison；
- current、latest、specific、multi-season 和 unknown schedule。

稳定性组中 10 个 case 的 facts 均为 3/3，PF HP trend 只是其中一个普通 case。因此底层通用 primitives 确实表现出跨 domain slice 的泛化。

但端到端 Agent 泛化仍不足：关键参数只有 66.7%（稳定性 46.7%）、证据要求 60.0%（稳定性 53.3%）、forbidden tool avoidance 52.8%。当前能力更接近“能找到相关数据并写出多数事实”，还不是“能以可验证、节制、稳定的方式完成数据分析请求”。

## 11. Cost / Usage

以下 token 都来自 DeepSeek 响应的官方 usage 字段；没有根据价格表推算货币成本。首次 compatibility-failure run 和单条诊断请求在 parser 抛错前未进入 usage 汇总，因此不包含在 token 表中。

| Run | Attempts | Model turns | Input | Output | Total | Cache hit | Cache miss |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Full baseline | 36 | 96 | 1,910,109 | 45,899 | 1,956,008 | 1,089,792 | 820,317 |
| Stability | 30 | 82 | 1,475,632 | 33,310 | 1,508,942 | 1,259,260 | 216,372 |
| Combined recorded | 66 | 178 | 3,385,741 | 79,209 | 3,464,950 | 2,349,052 | 1,036,689 |

成功记录平均每次尝试 52,499 tokens、2.70 model turns、2.70 tool calls；端到端 latency 平均 6,921 ms，p50 6,462 ms，p95 11,292 ms，最大 14,546 ms。

实际 DeepSeek HTTP 请求数为 215：首次失败 run 36、通用诊断 1、两次正式 eval 的 178 model turns。正式 eval fatal error rate 为 0/66；若包含修复前 compatibility run，则 case-level fatal error 为 36/102。两种口径必须分开解释。

所有原始运行记录保存在 Git ignored 的：

```text
data/audit/agent/2026-09-15T06-24-26-182Z
data/audit/agent/2026-09-15T06-28-32-651Z
data/audit/agent/2026-09-15T06-35-08-099Z
```

## 12. Architecture Pressure

### Real blockers

1. **Evidence contract**：`search_entities` 缺少可引用 evidence ID；aggregation evidence 也没有被模型稳定带入终答。
2. **Context/tool-result size**：平均每次超过 52k tokens，模型会重复 query/aggregate 并频繁触及截断或 turn limit。
3. **Structured finalization**：code-fenced JSON 令 36.1% 全量终答降级为文本。
4. **Answerability boundary**：模型仍会为未定义概念选择 proxy 并下结论。
5. **Tool-planning stability**：mode、season、sort、grouping 和 limit 的关键参数不稳定。

### Nice-to-have

- eval runner 直接输出分维度指标和 stability consistency，而不只输出 strict pass rate；
- 更紧凑的 tool result projection/summary；
- CLI 对结构化失败和无效 evidence 的更醒目提示；
- 在不暴露 secret 的前提下记录 provider/model 配置 fingerprint。

### Premature abstractions

当前不应增加 Agent SDK、provider registry、MCP、SQL/DuckDB、向量库、generic Query DSL、Answerability service、Evidence Graph、Web endpoint、chat UI、持久记忆或部署迁移。现有失败主要在小型 runtime 的契约闭环和模型编排，不是工具数量不足。

## 13. Recommended Next Step

选择：**ITERATE PHASE 1**。

下一轮仍冻结三个通用工具，不新增场景专用能力，优先完成：

1. 为 entity search 定义稳定、可验证的 citation contract，并统一 runtime 的 evidence 收集规则；
2. 压缩 tool result 与 prompt token，占用受控后再衡量 turn/call 上限；
3. 改善 final JSON 收敛，消除 code fence 降级；
4. 加强 capability-oriented tool descriptions 与 unsupported boundary，但不加入题目答案或 wording branch；
5. 用冻结 held-out corpus 重新评测，要求 invalid evidence IDs 为 0、人工复核 abstention 100%、平均工具调用不超过 gold + 1，并显著提高 argument/evidence/strict contract 指标。

在达到这些门槛前，不建议扩大 tool surface，也不建议进入 Web Agent endpoint、UI 或生产部署阶段。
