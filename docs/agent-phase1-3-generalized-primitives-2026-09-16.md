# HSR-Database Data Agent Phase 1.3 泛化原语落地报告

日期：2026-09-16

## 1. Executive Summary

Phase 1.3 已在 `develop` 工作树完成实现：在原有三个 tools 内加入 multi-valued `weakness` grouping、associated `argMin` / `argMax`、typed enemy-template identity，以及 evidence sufficiency、scope fidelity、intent-controlled presentation 三个通用 invariant。没有新增 tool、Query DSL、运行轮次/调用限制、Web UI、生产路由或部署改动。

确定性实现和工程门禁通过：Agent tests 67/67、full unit tests 548/548、Prettier、ESLint、TypeScript/Svelte、data validation/ensure、production build 与 Playwright smoke 5/5 均通过。Weakness explode、arg/scalar extrema 等值、tie cap/order、typed handoff、hash compatibility 和 Inspector preview 都有直接测试。

模型层结果需要分开判断：独立 `generalization-v1` 16-case 评测完成 16/16，strict 9/16（56.3%），首工具名 13/13、required evidence 12/12、required warnings 3/3、structured final 16/16、invalid evidence 0；但 gold facts 13/16、presentation boundary 14/16，仍存在答案覆盖和术语边界问题。冻结 36-case 回归 strict 23/36（63.9%），相对 Phase 1.2 low 的 26/36（72.2%）下降 8.3 pp，并出现 1 次非法调用、1 次 turn-limit 和 1 个 unsupported abstention 失败。

三条 Inspector `MANUAL / NON-BENCHMARK` 中前两条成功使用新原语，第三条虽正确完成 typed Search → Endgame handoff，却因过度核验范围在 4 turns 内未生成最终答案。

因此结论是：**Phase 1.3 deterministic implementation complete；模型级验收建议 ITERATE PHASE 1.3，暂不把本轮视为无显著回归的最终 promotion gate。** 后续工作应聚焦规划/停止条件、事实压缩和 presentation，而不是扩张 DSL 或增加工具。

## 2. Scope 与冻结项

本轮只扩展原有能力面：

- `search_entities`：typed enemy-template identity；
- `query_endgame`：保持 global concrete top/bottom 责任，不增加语法；
- `aggregate_endgame`：multi-valued weakness grouping 与 grouped associated extrema；
- runtime/finalization：三个通用 invariant；
- Inspector/eval/tests/report：验证与诊断。

保持冻结：

- 工具仍只有 `search_entities`、`query_endgame`、`aggregate_endgame`；
- 4 model turns、8 tool calls、既有 group/payload/evidence/final-answer limits 不变；
- `evals/agent/dev.jsonl` 的 24 cases 与 `evals/agent/held-out.jsonl` 的 12 cases 逐字不变；
- `ag1` 不增加 namespace；
- 不增加 top-K、第二层聚合、arbitrary path/expression、wording rule engine 或 internal-term blacklist；
- 不改生产入口、Web UI、数据仓库、部署和默认 thinking mode。

两份工作树中既有、未跟踪的 Phase 1.3 调查报告未修改：

- `docs/agent-phase1-3-capability-gap-investigation-2026-09-16.md`
- `docs/agent-phase1-3-generalization-validation-2026-09-16.md`

## 3. Multi-valued Weakness Grouping Contract

`aggregate_endgame.groupBy` 新增 `weakness`。聚合内部统一使用 `dimension(row) -> values[]`：既有 scalar dimension 始终返回一个值；weakness 对单行 element 去重后 explode 为多个 assignment。

语义约束：

- 空 weakness 数组不产生 group assignment；
- 同一 row 的同一 weakness bucket 最多出现一次；
- unresolved enemy detail 沿用现有 warning，不制造空 weakness bucket；
- 顶层 `sourceRows` 是 explode 前输入行数；
- group 的 `sourceRows` 是该 bucket 的 assignment rows；
- 只有使用 weakness 时返回：

```json
{
  "grouping": {
    "explodedDimensions": ["weakness"],
    "semantics": "explode-v1"
  }
}
```

当前 schema 最多允许一个 exploded dimension；Phase 1.3 只有 weakness，因此未引入多维笛卡尔积或额外复杂度面。

## 4. Associated Extrema Contract

`aggregate_endgame.metrics` 新增：

```ts
{
  op: 'argMin' | 'argMax';
  field: 'hpPerBar' | 'speed' | 'toughnessPerBar' | 'level';
  select: ('enemyTemplate' | 'monster' | 'location')[]; // 1..3, unique
  as: string;
}
```

固定返回字段为：

```ts
{
  value: DecimalString | null;
  associated: AssociatedTuple[];
  tiedRowCount: number;
  tieCount: number;
  returnedTies: number;
  tiesTruncated: boolean;
  includedRows: number;
  skippedUnresolvedRows: number;
}
```

投影固定为：

- `enemyTemplate`：`enemyTemplateId/name/rank/rankCategory`；
- `monster`：`monsterId/enemyTemplateId/name`；
- `location`：mode、season、encounter、battle slot、stage、wave、monster group、configured position。

Tie policy 固定为 `all-distinct-associated-v1-cap-5`：先按投影 tuple 去重，再以 canonical projection tuple 加最小 evidence structural key 稳定排序，最多返回 5 个 distinct tuples。超过上限时 metric 标记 `tiesTruncated=true`，顶层标记 `truncated=true`，并发出 `RESULT_TRUNCATED_ASSOCIATED_TIES`。

`tiedRowCount` 表示达到 extremum 的 source rows 数；`tieCount` 表示 distinct associated tuples 数，两者不混用。没有 resolved numeric value 时返回 `value:null`、空 `associated`，同时给出完整计数。

确定性测试验证四个 numeric fields、三种 select、单项/组合 group grain、全 unresolved、重复 tuple、distinct tie、cap、稳定顺序和 truncation。对同一输入严格保证：

```text
min(field) == argMin(field).value
max(field) == argMax(field).value
```

Query 继续负责全局 concrete rows 的 top/bottom；arg extrema 只表达 aggregate group 内的 winner relation。

## 5. Typed Enemy Identity 与 Handoff

Agent Search 输出现在是 discriminated union：

- enemy match/ambiguity candidate 使用数值 `enemyTemplateId`，不再暴露裸 `id`；
- character/lightcone/relic 等其他实体继续使用既有字符串 `id`。

System/tool description 明确规定 enemy Search 结果只能 handoff 到 `filter.enemyTemplateIds`，不能推断成 `monsterIds`。确定性测试覆盖 direct match、ambiguity candidate、非 enemy 回归与 Search → Endgame handoff。

独立评测的 typed handoff case 实际调用了：

```json
{
  "filter": {
    "enemyTemplateIds": [5014014]
  }
}
```

没有发生 namespace 猜测；该 case 的 strict failure 来自普通答案展示了内部 ID，而不是 handoff 错误。

## 6. Evidence、Scope 与 Presentation Invariants

System prompt 与 finalization retry contract 同时加入：

- **Evidence sufficiency**：只有证据满足逻辑、数学和完整性前提时才给出分析结论；
- **Scope fidelity**：不得静默改变时间、模式、identity grain、metric、filter 或 current/latest；
- **Intent-controlled presentation**：普通分析优先使用站点/游戏术语；技术、语义或用户显式询问 ID 时才展示内部字段。

实现没有做答案自动改写、wording rule engine 或内部术语硬黑名单。Eval 只对标记为 ordinary presentation 的独立 case 支持 literal forbidden-answer terms，用于观测边界，不影响 runtime。

## 7. Evidence IDs 与 Compatibility

旧 scalar aggregate 请求保持原有 hash 输入和 `ag1/<sha256>` 结果。只有请求使用新能力时才条件式加入语义版本：

- weakness：`multiValuedGrouping: explode-v1`；
- arg extrema：`associatedExtrema: all-distinct-associated-v1-cap-5`。

因此新 hash 覆盖 explode semantics、op、field、select 与 tie policy，而旧 scalar 请求不因 Phase 1.3 无条件换 hash。测试覆盖 scalar hash regression 及新请求的语义区分。

## 8. Inspector Trace

`agent:inspect --verbose` 的 tool trace 新增 bounded aggregate preview：

- explode grouping metadata；
- 前 10 个 groups；
- extrema values、associated ties 与计数；
- warnings；
- `previewTruncated`。

Preview 不记录模型 reasoning 正文、完整秘密、API key 或 Authorization。`--save` 仍只写被忽略的 `data/audit/agent/manual/`。

第一条人工问题的 trace 成功显示 `explode-v1` metadata、7 个 weakness groups 和 `previewTruncated:false`；第二条成功显示每个 season 的 max/min value、关联敌人和 location。

## 9. Deterministic 与 Metamorphic Tests

Agent tests 从 Phase 1.2 的 46 增至 67，full unit tests 从 527 增至 548。新增覆盖包括：

- scalar dimensions 与旧请求回归；
- weakness 的全部既有 metrics、组合维度、空值、unresolved、dedupe 与 limits；
- weakness assignment membership 总数与 bucket 内无重复；
- weakness filter 单调性；
- 四类 numeric fields 的 scalar/arg extrema 等值；
- enemyTemplate/monster/location 三种 projection；
- row ties、identity ties、all-unresolved、tie cap、稳定排序与 warning；
- direction/metric 替换不改变 grouping 与 identity semantics；
- winner metric 等于 extremum；
- typed identity 与 ambiguity candidate；
- prompt/fake-provider 的 evidence、scope、presentation invariants；
- Inspector bounded preview；
- dual-suite eval loader 与 forbidden presentation terms。

所有新旧确定性断言通过。

## 10. Engineering Gate

执行顺序和结果：

| Gate | Result |
| --- | --- |
| Agent unit tests | 67/67 passed |
| Full unit tests | 548/548 passed |
| Prettier | passed |
| ESLint | passed |
| TypeScript / Svelte check | 0 errors, 0 warnings |
| Data validation / ensure | passed；generated data already latest |
| Production build | passed |
| Playwright smoke | 5/5 passed |
| Frozen corpus validation | 24 dev + 12 held-out passed |
| Generalization corpus validation | exactly 16 unique cases passed |

`.env.local` 仍被 git ignore；运行前只验证 `DEEPSEEK_API_KEY` 非空，没有输出 key。

## 11. Eval Suite Isolation

Eval runner 新增：

```text
--suite=frozen|generalization-v1
```

默认 `frozen`，保持原使用方式。`generalization-v1` 固定加载 16 cases，禁止 `--split`；两套 suite 各自生成 corpus hash 和 summary，不能混合 aggregate score。

`evals/agent/generalization-v1.jsonl` 分布为：

- 5 个 multi-valued grouping substitutions；
- 4 个 associated-extrema substitutions；
- 3 个 canonical/alias/typed-handoff cases；
- 4 个 evidence/scope/proxy/presentation paired cases。

覆盖枚举新增 `groupBy`、`argMin`、`argMax`、`identity-handoff`、`scope-check`、`presentation`，以及 mode、weakness、location grain。

## 12. Generalization Smoke

联网前的 sandbox 尝试因网络不可达全部 `fetch failed`，不计入质量结果。获准联网后的 smoke run：`2026-09-16T02-07-58-939Z`，7 selected cases，thinking low。

结果：completed 7/7、strict 4/7、structured 7/7、required evidence 6/6、presentation 7/7、invalid evidence 0；平均 14,686.6 tokens，平均延迟 5,867 ms，p95 9,739 ms。

Smoke 暴露的是 suite gold 对未询问字段和精确调用路径的过约束。只调整了尚未冻结的 generalization gold，未修改 runtime、prompt、tool 或 frozen corpus；完整运行使用下节固定 corpus hash。

## 13. Frozen 36-case Regression

Run ID：`2026-09-16T02-10-30-276Z`，thinking low，completed 36/36。

| Metric | Phase 1.2 low | Phase 1.3 low | Delta |
| --- | ---: | ---: | ---: |
| Strict contract | 26/36 (72.2%) | 23/36 (63.9%) | -8.3 pp |
| Expected tool present | 33/36 (91.7%) | 32/36 (88.9%) | -2.8 pp |
| Key argument subset | 29/36 (80.6%) | 27/36 (75.0%) | -5.6 pp |
| First-tool name | 24/28 (85.7%) | 24/28 (85.7%) | 0 |
| First-tool key args | 20/28 (71.4%) | 18/28 (64.3%) | -7.1 pp |
| Forbidden tool avoided | 31/36 (86.1%) | 32/36 (88.9%) | +2.8 pp |
| Invalid tool calls | 0 | 1 | +1 |
| Gold facts | 36/36 | 36/36 | 0 |
| Required evidence | 20/20 | 19/20 | -1 |
| Structured final | 36/36 | 36/36 | 0 |
| Unsupported abstention | 8/8 | 7/8 | -1 |
| Turn-limit hit | 0/36 | 1/36 | +1 |
| Average tool calls | 1.056 | 1.139 | +0.083 |

Phase 1.3 另有 required warnings 9/10、truncation preservation 5/5、invalid evidence IDs 0。1 次 invalid call 被下一轮恢复。

Strict failures 主要分为：

- aggregate/query 选择或关键参数偏移：`dev-aa-season-diff`、`dev-as-common-bosses`、`dev-cross-moc-as` 等；
- 不必要/forbidden 调用：`dev-lightning-boss-hp`、`dev-pf-total-hp-trap`、`held-as-fastest-five`；
- 列表题重复查询并触及 turn limit：`held-moc-wave-list`，同时缺 required evidence；
- unsupported proxy 边界失败：`held-unknown-future`；
- 无工具正确拒答但机械 warning provenance 未命中：`held-pf-actual-kills`。

因为 strict、key args、evidence、abstention 和 turn-limit 均有可见退化，本报告不把 frozen regression 判为“无显著退化”。

## 14. Full Generalization-v1 Result

Run ID：`2026-09-16T02-14-49-630Z`；corpus SHA-256：`c5cecbb34443429a4a331bebf04eb4e438a63de876beb4ff53c65f01334611e3`；thinking low；completed 16/16。

| Metric | Result |
| --- | ---: |
| Strict contract | 9/16 (56.3%) |
| First-tool name | 13/13 (100%) |
| First-tool key args | 11/13 (84.6%) |
| Expected tool present | 16/16 (100%) |
| Forbidden tool avoided | 15/16 (93.8%) |
| Key argument subset | 14/16 (87.5%) |
| Gold facts | 13/16 (81.3%) |
| Supported gold facts | 11/14 (78.6%) |
| Presentation boundary | 14/16 (87.5%) |
| Required warnings | 3/3 (100%) |
| Required evidence | 12/12 (100%) |
| Invalid evidence IDs | 0 |
| Structured final | 16/16 (100%) |
| Unsupported abstention | 1/1 (100%) |
| Invalid tool calls | 0 |
| Turn-limit hit | 0/16 |
| Average tool calls | 1.125 |

代表性结论：

- 新原语可被模型选中：13/13 首工具名正确，所有 16 cases 都出现 expected tool；
- evidence/warning/structured-final contract 稳定；
- weakness 和 extrema 的 deterministic result 没有发现计算错误；
- strict loss 主要来自精确参数形状、答案漏报 gold facts、ordinary answer 泄露内部 `enemyTemplateId` / `MonsterID`，以及个别 scope case 的额外查询；
- `gen-identity-enemy-template-handoff` 的调用语义正确，但普通答案直接展示内部 ID，属于 presentation failure；
- `gen-scope-proxy-current-aa` 正确拒绝 proxy 替代，但为了证明 current 状态多做了一次查询，触发 forbidden/efficiency failure。

## 15. Tokens、Latency 与 Payload

| Run | Avg tokens | Total tokens | Reasoning tokens | Avg latency | p95 latency | Avg tool-result bytes/call |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Frozen 36 | 16,158.9 | 581,720 | 14,721 | 5,065 ms | 10,409 ms | 6,761 B |
| Generalization 16 | 14,706.8 | 235,308 | 7,955 | 6,493 ms | 11,293 ms | 3,825 B |

相对 Phase 1.2 low，frozen 平均 token 从 12,889.0 增至 16,158.9（约 +25.4%），平均延迟从 4,327.5 ms 增至 5,065 ms（约 +17.0%）；p95 从 10,974 ms 降至 10,409 ms。成本增长主要来自更长 system/tool schema 和部分额外调用，而不是 deterministic aggregation latency。

## 16. Manual Inspector Acceptance

三条均以 `--thinking=low --verbose --save` 运行，标记为 `MANUAL / NON-BENCHMARK`，没有用于修改 prompt/tool/corpus。

### 16.1 最近 3 期末日幻影 weakness top two

- 1 tool call、2 model turns、12,786 tokens、3,418 ms；
- 使用 `groupBy:["weakness"]` + `rowCount`；
- 回答：火 25 次、量子 22 次；
- 正确披露 explode assignment 与 latest/current 区别；
- preview 显示 `explode-v1`、7 groups、无截断。

结果：通过。

### 16.2 最近 6 期混沌回忆最高/最低首领趋势

- 2 tool calls、3 model turns、47,166 tokens、17,566 ms；
- 核心 aggregate 同时请求 scalar max/min 与 `argMax`/`argMin`，按 season 返回关联 enemy template + location；
- 六期 extrema values 与 identity 对齐，趋势结论由 aggregate evidence 支撑；
- 首次先做了 50-row Query，属于可避免的额外成本；
- 最终 JSON 首次截断，经一次无工具 finalization retry 恢复。

结果：功能通过，效率需改进。

### 16.3 指定敌人最近 6 期血量变化

- Search 正确返回三个数值 `enemyTemplateId`，后续 aggregate 正确使用 `enemyTemplateIds:[4014020,4014021,4014022]`；
- 第一次范围内查询只找到最近六期中的一个赛期；
- 模型随后静默扩大到全历史，再额外查询最近六期用于核验；
- 4 tool calls / 4 turns 后没有最终回答，runtime 返回 turn-limit fallback。

结果：未通过。Typed identity 已成功；失败原因是 scope/停止条件规划，而非 namespace 或聚合错误。

## 17. Remaining Failure Taxonomy

### Planning and stopping

模型仍会在已有充分 aggregate evidence 后先做大 payload Query，或为解释缺失 season 扩大范围并继续核验。第三条人工题说明 scope fidelity 的文字 invariant 能阻止无声结论替换，但不能保证模型及时停止。

### Exact argument selection

Frozen first-tool name 不退化，但 first-tool key args 下降 7.1 pp。主要问题仍是 group grain、include、sort、limit 或是否选择 aggregate，而非 schema 不可表达。

### Answer compression and fact coverage

Generalization gold facts 13/16。工具结果通常正确，最终答案有时漏掉需要比较的值、tie 或限定条件；不应通过增加 payload 或 top-K 解决。

### Presentation boundary

普通问题仍可能展示 `enemyTemplateId`、`MonsterID`、`hpPerBar` 等内部术语；技术问题则需要保留这些字段。当前 14/16 表明 prompt invariant 有效但不充分，尚不支持 hard blacklist。

### Warning provenance

模型直接拒答时可能没有 tool warning，导致机械 required-warning 指标失败；需要后续区分“答案语义已保留限制”与“工具 warning 被引用”。

### Evaluation strictness

部分 strict failure 来自 gold 对 exact call shape 的约束，而答案和 evidence 仍正确。独立 suite 已在 smoke 后去除明显过约束，但报告仍保留 strict 与分项指标，避免用单一 aggregate score掩盖差异。

## 18. Complexity Budget

Phase 1.3 的复杂度增量保持有界：

- exploded dimension：1 个（weakness）；
- associated extrema ops：2 个（argMin/argMax）；
- numeric fields：沿用既有 4 个；
- associated select：固定 3 种，最多同时 3 种；
- distinct associated ties：固定 cap 5；
- Inspector aggregate preview：固定前 10 groups；
- tools：仍为 3；
- runtime turns/calls/output limits：不变。

没有开放任意 field path、表达式、用户定义 projection、动态 tie cap 或嵌套聚合。

## 19. Query-DSL Creep Review

本轮不是 Query DSL 扩张：

- weakness 是一个明确、数据模型已有的 bounded dimension；
- arg extrema 是两个固定 operator，不接受任意 comparison/expression；
- projection 是封闭 enum，不是字段选择器；
- tie 策略与 cap 不可由用户配置；
- 不支持 top-K、window function、having、第二层 aggregate、join expression 或 arbitrary sort expression。

现有 Query 与 Aggregate 的职责边界反而更清晰：Query 返回 global concrete rows；Aggregate 返回 group summary 与 bounded winner relation。

## 20. Security and Audit

Audit 目录扫描确认未出现 `reasoning_content`、`Authorization` 或 `DEEPSEEK_API_KEY` 字样，实际 key 值匹配数为 0；保存内容只包含 reasoning presence/size、usage 和 provider metadata。模型 reasoning 正文不进入 trace、Inspector 或报告。

本轮未打印或写入实际 key。联网评测使用显式批准；首次 sandbox 网络失败仅作为环境事件记录，不混入质量汇总。

## 21. Recommendation

实现层结论：**COMPLETE**。两个 bounded primitives、typed identity、三个 invariant、Inspector preview、dual-suite eval 和报告均已落地，所有确定性/工程门禁通过，且没有突破 Phase 1 的工具与复杂度边界。

模型验收结论：**ITERATE PHASE 1.3**。原因是 frozen strict -8.3 pp、first-tool key args -7.1 pp、token +25.4%，以及第三条人工题 turn-limit。建议下一轮只处理：

1. 已获充分 group aggregate evidence 后的停止条件；
2. 缺失 season 时保持原 scope 并明确“只在 1/6 期出现”；
3. ordinary/technical presentation 的示例驱动约束；
4. exact group grain 与 argument planning 的小样本稳定性复验。

在这些问题收敛前，不增加 top-K、第二层聚合、任意 path/expression，也不做生产或部署改动。
