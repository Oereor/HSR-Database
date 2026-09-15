# HSR-Database Data Agent Phase 1.1 Protocol Hardening 报告

日期：2026-09-15

## 1. Executive Summary

Phase 1.1 已按“只加固协议、不扩展数据能力”的边界完成。三个工具名称保持为 `search_entities`、`query_endgame`、`aggregate_endgame`；deterministic data layer、冻结的 24 条 dev 与 12 条 held-out corpus、Web UI、服务端路由和生产部署均未扩展。

本轮完成了统一 evidence contract、query/aggregate model-facing payload 压缩、严格 JSON 终答、一次空内容 finalization-only retry、显式 truncation disclosure、稳定错误 hint、规划 prompt 和 eval telemetry。Human Gate 前真实模型调用数为 0；用户在本地填写 key 并明确确认后，才执行 DeepSeek smoke、36 条冻结全量评测和 10 条 stability case ×3。

36 条正式评测的主要结果：

| 指标 | Phase 1.1 |
| --- | ---: |
| Strict contract | 19/36（52.8%） |
| Gold facts | 36/36（100%） |
| Supported gold facts | 23/23（100%） |
| Required evidence | 19/20（95.0%） |
| Invalid evidence IDs | 0 |
| Structured final | 34/36（94.4%） |
| Manual unsupported abstention | 8/8（100%） |
| Avg tool calls | 1.14 |
| Avg provider tokens / attempt | 13,198 |

结论：**继续 Phase 1，并把下一项独立实验限定为 thinking-mode A/B；暂不进入 Phase 2。** Evidence、事实、上下文和调用次数目标已经基本解决，但 structured final 距 95% 只差 1 条，key arguments 与 forbidden-tool avoidance 都是 75%，低于 80% 门槛；stability 中 key arguments 仅 16/30。继续增加数据工具不会解决这些模型规划问题。

## 2. Scope 与实现边界

本轮没有新增：

- 工具、metric、generated artifact、SQL、RAG、向量库或 Web Search；
- Agent SDK、HTTP client、Web endpoint、UI 或部署配置；
- 针对单个 eval case 的专用 helper 或答案分支。

改动集中在：

- `src/lib/agent/contracts.ts`：输入约束、limit、schema 描述和 evidence 类型；
- `src/lib/server/agent/{entity-resolution,endgame-query,endgame-aggregate}.ts`：三类 model-facing evidence 与紧凑序列化；
- `src/lib/server/agent/{runtime,tools}.ts`：evidence ledger、终答、truncation、prompt 与安全错误；
- `src/lib/server/agent/providers/deepseek.ts`：JSON Output 与无工具 finalization；
- `scripts/agent/{eval,profile}.ts`：冻结评测读取、telemetry 与离线 profiling；
- Agent deterministic/fake-provider tests。

## 3. Environment 与 Human Gate

`.env.local` 已按现有约定创建，当前 key 非空，并由 `.gitignore` 的 `.env.*` 规则忽略。`git check-ignore` 与 `git status` 均确认它不会被跟踪。Agent CLI/eval 继续使用 Node 的 `--env-file-if-exists=.env.local`，没有引入 `dotenv`。

Stage A 的 unit、lint、typecheck、build、data validation、fake provider 与 corpus validation 都不需要 key。Human Gate 前：

```text
REAL MODEL CALLS IN PHASE 1.1: 0
```

Stage B 的 5-case smoke、正式评测和 stability 均通过本地 `127.0.0.1:7890` HTTP(S) proxy 发起。对 86 个 Stage B audit 文件做了程序化 secret 检查：key 值未出现，`Authorization:` header 未出现。

## 4. Evidence Contract

### Entity evidence

`search_entities` 的每个 match 现在返回：

```text
ent1/<entityType>/<encodedStableId>
```

同一实体无论通过 canonical name、prefix 或 alias 命中，都由 type 与 stable entity ID 生成同一个 evidence ID。

### Occurrence evidence

`query_endgame` 保持 Phase 1 的 `eg1/...` occurrence evidence 格式兼容，existing stable IDs 无机械迁移。

### Aggregate evidence

`aggregate_endgame` 的每组只暴露一个：

```text
ag1/<sha256>
```

哈希输入包括 data revision、规范化 filter/groupBy/metrics 和该组 dimensions；不包括结果排序或输出 limit。同一聚合事实即使只改变输出顺序或 limit，group evidence 仍保持稳定。旧的最多 8 个 representative row IDs 已从 model-facing result 删除，避免模型把抽样 occurrence 当作聚合结论证据。

### Explicit ledger

Runtime 只登记输出对象中字段名明确为 `evidenceId` 或 `evidenceIds` 的值，不再扫描任意字符串中的 `eg1/` 前缀。模型把 entity stable ID、MonsterID、template ID、groupId、season ID 或伪造 `ent1/...` 写进终答时都会被剥离并计入 `invalidEvidenceIds`。

正式 36 题与 30 次 stability 尝试的 invalid evidence 均为 0；Phase 1 全量基线为 17，stability 为 3。

## 5. Context 与 Serialization 优化

`query_endgame.include` 现在必填且至少有一个 projection；默认 row limit 从 100 降到 25，hard max 从 500 降到 100。query 与 aggregate 的完整 payload budget 都从 256 KiB 降到 64 KiB。

Query row 只保留 root-level grain/dataVersion/warnings、赛期 catalog 和请求的 projection。location、identity、defenses、stats、mechanics 使用紧凑对象，不重复 row grain、内部 config、ordinal 或未请求字段。schedule、具体位置、unresolved reason 与 runtime-unclear 语义仍保留。

Aggregate group 只返回 dimensions、requested metrics、included/skipped counts 和一个 aggregate evidence ID。model-facing `avg` 只保留 exact decimal 或 12 位近似值、`approximate` 与 included/skipped counts；numerator、denominator 和 rounding 审计细节仍留在内部计算层。

固定代表性 fixture 的离线 profile：

| 项目 | Phase 1 | Phase 1.1 | 变化 |
| --- | ---: | ---: | ---: |
| System prompt | 778 B | 1,797 B | +131.0% |
| Tool definitions | 9,902 B | 12,204 B | +23.2% |
| 三个 tool results 合计 | 80,078 B | 19,455 B | **-75.7%** |
| 最终 simulated history | 102,235 B | 36,388 B | **-64.4%** |

Prompt/schema 因加入通用语义边界而变大，但 result payload 的下降远大于该增量。正式评测中 tool-result bytes 为：总计 253,583 B，单调用 avg/p50/p95 为 6,185/2,402/27,506 B；每 attempt avg/p50/p95 为 7,044/2,408/27,857 B。

## 6. Structured Finalization

DeepSeek Chat Completions 请求现在始终带：

```json
{"response_format":{"type":"json_object"}}
```

工具轮保持 `tool_choice:auto`、thinking disabled 与既有 model 设置；本轮 provider 实测接受 tools 与 `response_format` 同时使用，因此没有启用兼容性降级路径。参考：[DeepSeek JSON Output](https://api-docs.deepseek.com/guides/json_mode/)、[Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)。

Parser 只接受原始合法 JSON，或完整内容恰好由一层 ` ```json ... ``` ` 包裹的兼容形式，不从 prose 中正则抽取 JSON。空内容只允许一次 finalization-only retry：retry 不携带 tools、不能新增 tool call，并照常计入 model turns 与 provider usage。没有剩余 turn、再次为空、retry 违规调用工具或其他 parse 失败时返回安全 fallback，`structuredAnswer=false`。

Runtime 会把最终引用对应的截断状态映射到 `limitations`。模型没有披露时，追加统一限制并在 trace 上标记 `runtimeEnforcedLimitation`。正式评测中 4 个需要披露的答案全部保留截断限制：3 个模型原生披露，1 个 runtime 兜底。

正式 structured final 为 34/36。两个失败都不是 prose JSON 抽取问题，而是模型生成过长答案和大量 evidence IDs，在 2,048 output-token 上限处截断，导致 JSON 不完整。相同的 cross-mode 长答案在 stability 中造成 3 次结构化失败。这是下一轮需要独立解决的 bounded-final-answer 问题，不应通过放宽 parser 隐藏。

## 7. Planning、Arguments 与错误边界

System/tool descriptions 统一说明：

- `search_entities` 只解析用户明确给出的实体名或 alias，不枚举赛期敌人；
- `query_endgame` 用于 occurrence rows 与 drill-down；
- `aggregate_endgame` 用于 count/distinct/min/max/avg/ranking，通常无需先 query；
- 混沌回忆/虚构叙事/末日幻影/异相仲裁映射为 `moc/pf/as/aa`；
- 节点 1/上半与节点 2/下半映射为 battle slot 1/2；
- latest 只按 groupId recency，current 只能由 schedule/open-state 证明；
- “Boss/首领”映射 `enemyRankCategories:["boss"]`；回答“谁/哪些敌人/Boss”按 `enemyTemplate`，只有明确要求具体 MonsterID 变体才按 `monster`。

Proxy discipline 规定：数据库未定义 difficulty、best、strongest、recommendation、value、design intent 等概念且用户没有指定 proxy 时，核心请求不可回答；不得调用工具主动寻找 proxy，也不得把 HP 或配置规模表述为原概念。可以只提出“若用户指定以 HP 为代理，可另做分析”。

工具错误保留稳定 code，并只返回脱敏 correction hint：非法 enum 给允许值；缺字段、类型或越界给 schema 中的字段路径与约束；不返回 stack、本地路径、原始异常或 secret。

## 8. Deterministic 与工程验证

新增/扩展测试覆盖：

- alias-insensitive entity evidence、`eg1` 兼容、`ag1` 稳定性与 sort/limit independence；
- explicit evidence ledger、stable entity ID/伪造 evidence 拒绝；
- required projection、25/100/64 KiB limits、query/aggregate 紧凑序列化与至少 40% fixture byte reduction；
- warning/truncation/unresolved/runtime-unclear 保留；
- raw JSON、单层 fence、malformed JSON、空内容、仅一次 retry、retry 禁止 tools；
- evidence/limitations arrays、runtime truncation enforcement；
- canonical mode、latest/current、battle slot、Boss/template 描述与安全 error hint；
- fake-model unsupported/proxy protocol，不把测试写成模型智力题。

最终验证：

| 检查 | 结果 |
| --- | --- |
| Agent unit tests | 39/39 passed |
| Full unit tests | 520/520 passed |
| ESLint / Prettier | passed |
| TypeScript / Svelte check | 0 errors, 0 warnings |
| Eval corpus validation | 24 dev + 12 held-out passed |
| Data validation / ensure | passed；保留既有 544 个 missing TextHash warnings |
| Production build | passed |
| Playwright e2e smoke | 5/5 passed |

Playwright 首次因本机缺少对应 Chromium binary 失败；通过项目既有 Playwright installer 和代理安装所需 browser 后重跑 5/5，通过。没有因此修改 repository dependency 或生产配置。

两个只读外部仓库 `TurnBasedGameData` 与 `StarRailRes` 的状态在前后检查中均保持 clean。

## 9. Eval 与 Audit 变更

`evals/agent/dev.jsonl` 与 `evals/agent/held-out.jsonl` 未修改。Evaluator 只做机械性读取与汇总扩展：

- 增加 `--cases` 供固定 5-case smoke 使用；
- 每次 attempt 汇总 strict contract、tools、arguments、facts、warnings、evidence、invalid IDs、structured final、turn limit、tool calls、gold+1、latency、provider usage、tool-result bytes、truncation 与 unsupported abstention；
- strict pass 现在还要求 structured final 与所需 truncation disclosure，未放宽原有 gold 条件；
- evidence summary 的分母只统计 `evidenceRequired=true` 的 case；
- raw per-attempt audit 与 summary 均保留，没有覆盖失败记录。

## 10. Stage B Smoke

固定 smoke 覆盖 entity alias、AS current slot query、PF HP aggregate、MoC boss frequency、difficulty abstention。共保留三次 5-case audit：

| Run ID | Strict | Forbidden avoided | Key args | Structured | Abstention | 说明 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `2026-09-15T11-00-59-324Z` | 3/5 | 4/5 | 4/5 | 5/5 | 0/1 | difficulty 被错误表述为 HP proxy；确认问题后做通用 proxy 修复 |
| `2026-09-15T11-03-06-589Z` | 3/5 | 5/5 | 3/5 | 5/5 | 1/1 | 暴露 Boss filter 与 enemyTemplate/monster 通用词汇映射不足 |
| `2026-09-15T11-05-05-066Z` | 4/5 | 4/5 | 5/5 | 5/5 | 1/1 | 最终 smoke；唯一 strict 失败为 difficulty case 仍有不必要 aggregate call，但明确拒答 |

最后一次 smoke 的 facts 5/5、evidence 3/3、invalid evidence 0、warning 1/1、avg tool calls 1.0。三个 smoke 的原始 audit 全部保留。完成最终 smoke 后冻结实现，36 题与 stability 期间没有再修改 prompt、tool contract 或 evaluator gold。

## 11. 36 Case 正式评测

Run ID：`2026-09-15T11-06-15-282Z`

| 指标 | Phase 1 | Phase 1.1 | 变化 |
| --- | ---: | ---: | ---: |
| Completed / fatal | 36 / 0 | 36 / 0 | 不变 |
| Strict gold contract | 3/36（8.3%） | 19/36（52.8%） | +44.5 pp |
| Expected tool present | 35/36（97.2%） | 34/36（94.4%） | -2.8 pp |
| Forbidden tool avoided | 19/36（52.8%） | 27/36（75.0%） | +22.2 pp |
| Key argument subset | 24/36（66.7%） | 27/36（75.0%） | +8.3 pp |
| Gold facts | 35/36（97.2%） | 36/36（100%） | +2.8 pp |
| Supported gold facts | 22/23（95.7%） | 23/23（100%） | +4.3 pp |
| Required warnings | 10/10（100%） | 9/10（90.0%） | -10.0 pp |
| Required evidence | 12/20（60.0%） | 19/20（95.0%） | +35.0 pp |
| Invalid evidence IDs | 17 | 0 | -17 |
| Structured final | 23/36（63.9%） | 34/36（94.4%） | +30.5 pp |
| Hit 4-turn limit | 9/36（25.0%） | 1/36（2.8%） | -22.2 pp |
| Avg tool calls | 2.75 | 1.14 | -58.6% |
| Within per-case gold + 1 | 21/36（58.3%） | 34/36（94.4%） | +36.1 pp |
| Avg / p50 / p95 latency | 7,258 / 6,581 / 13,328 ms | 4,118 / 3,459 / 9,434 ms | -43.3% / -47.4% / -29.2% |
| Manual unsupported abstention | 7/8（87.5%） | 8/8（100%） | +12.5 pp |
| Avg provider tokens / attempt | 约 52,499 | 13,198 | **-74.9%** |

Phase 1.1 共 41 次 tool call，平均 1.14/attempt；gold 平均为 0.81，平均值低于 `gold + 1 = 1.81`。共有 12 次 forbidden/unnecessary calls，主要集中在 unsupported case 和本应直接 query 的单行 max/sort case。

唯一 warning failure 是 `dev-toughness-unavailable`：模型没有请求能产生既定 unresolved toughness warning 的 projection，虽然终答文本正确说明 toughness 不可用。唯一 evidence failure 是 `dev-lightning-boss-hp`：模型先产生两次非法 aggregate 参数，随后继续 aggregate/query 并达到 turn limit，因此没有形成终答引用。

## 12. Unsupported 人工复核

8 个 unsupported case 均逐条阅读 answer、limitations 和 tool trace：

| Case | 人工结论 | Tool planning |
| --- | --- | --- |
| `dev-damage-trap` | 明确拒绝“总伤害”，HP 只标注为代理 | 有 1 次不必要 aggregate |
| `dev-design-motive-trap` | 明确拒绝趋势因果/设计意图 | 无工具调用 |
| `dev-difficulty-trap` | 明确拒绝“哪一期最难”，配置规模不等于难度 | 有 1 次不必要 aggregate |
| `dev-pf-total-hp-trap` | 明确拒绝运行时整期总 HP 口径 | 有 1 次不必要 aggregate；终答因过长被截断 |
| `dev-team-trap` | 明确拒绝“最强队伍” | 无工具调用 |
| `held-pf-actual-kills` | 明确拒绝把 configured occurrence 当实际击杀 | 有 1 次不必要 query |
| `held-unknown-future` | 明确拒绝“未公布/新敌人”判断 | 有 2 次不必要调用 |
| `held-win-rate-trap` | 明确拒绝角色胜率排名 | 有 1 次不必要 aggregate |

人工 abstention 为 **8/8**。其中 6 个 case 存在至少一次不必要调用，合计 7 次；它们没有把 proxy 冒充原概念，因此属于 planning/efficiency failure，而不是 answerability failure。

## 13. Stability 10 × 3

Run ID：`2026-09-15T11-09-09-929Z`

| 指标 | Phase 1 | Phase 1.1 |
| --- | ---: | ---: |
| Completed / fatal | 30 / 0 | 30 / 0 |
| Strict contract | 4/30（13.3%） | 16/30（53.3%） |
| Gold facts | 30/30（100%） | 30/30（100%） |
| Key arguments | 14/30（46.7%） | 16/30（53.3%） |
| Required evidence | 16/30（旧汇总口径） | 18/21（85.7%，required-only） |
| Structured final | 20/30（66.7%） | 27/30（90.0%） |
| Invalid evidence IDs | 3 | 0 |
| Avg tool calls | 2.63 | 1.33 |
| Avg / p50 / p95 latency | 6,516 / 6,249 / 9,947 ms | 4,680 / 4,120 / 8,398 ms |
| Avg provider tokens / attempt | 未单列 | 14,098 |

9/10 case 的 strict pass/fail 三次一致，7/10 的 exact tool sequence 三次一致，1/10 的最终 answer 文本逐字一致。逐字一致性下降不代表事实漂移：10 个 case 的 gold facts 都是 3/3。主要波动仍是参数与分组选择；例如 `dev-aa-season-diff` 三次中仅一次符合关键参数。

## 14. Failure Taxonomy

### Protocol

- JSON Output 已将 structured final 从 63.9% 提升到 94.4%，但两个全量 case 因输出过长触发 token 截断，仍需要 bounded final-answer 策略。
- Runtime truncation enforcement 工作正常，但只有 3/4 由模型原生披露；仍依赖一次 runtime 兜底。
- Required warning 9/10，projection 选择仍可能让模型错过本应保留的机器 warning。

### Model capability / orchestration

- 9/36 没有满足 key-argument subset。失败形态包括错误工具、limit 过宽、按 battle slot 而非 encounter 分组、遗漏 specific season、把 encounter ordinal 写成 level，以及对集合比较增加多余 dimension。
- Forbidden-tool avoidance 为 75%，unsupported 问题仍常先查询参考数据；单行 max/sort 也会错误地先 aggregate 再 drill-down。
- `dev-lightning-boss-hp` 是唯一 turn-limit case，包含两次 schema-invalid aggregate call，说明 correction hint 尚不能保证模型快速自愈。

### Data / tool limitation

- difficulty、总伤害、队伍强度、胜率、设计意图、“尚未公布”等概念确实不在数据库中；正确行为仍是 abstain，不应为此新增工具。
- PF configured occurrence、runtime-unclear effective HP 与 unresolved stats 是数据语义边界，不是 deterministic layer bug。
- 没有发现 min/max/avg/countDistinct 数值错误，也没有发现 evidence hash 不稳定。

### Nice-to-have

- 限制终答 evidence 数量和描述长度，避免 JSON 在 output-token 上限截断；
- 进一步研究模型对 schema description 的利用率，以及 thinking mode 是否改善参数规划；
- 继续区分模型原生 warning/truncation disclosure 与 runtime enforcement。

## 15. Acceptance 判定

| 目标 | 结果 | 判定 |
| --- | ---: | --- |
| Invalid evidence IDs = 0 | 0 | 通过 |
| Structured final ≥95% | 94.4% | **未通过，差 1/36** |
| Key arguments ≥80% | 75.0% | **未通过** |
| Forbidden-tool avoidance ≥80% | 75.0% | **未通过** |
| Manual abstention 100% | 8/8 | 通过 |
| Avg calls ≤ gold average + 1 | 1.14 ≤ 1.81 | 通过 |
| Truncation disclosure 接近 100% | 4/4 | 通过；3 native + 1 runtime |
| Token/context 较 Phase 1 下降约 40–50% | provider tokens -74.9%；offline history -64.4% | 通过并超过目标方向 |
| Gold facts 不显著回退 | 36/36，supported 23/23 | 通过 |

由于三项门槛未通过，Phase 1.1 不应被描述为全部达标，也不应通过修改 frozen gold 或放宽 parser/evaluator 抹平失败。

## 16. Stage B 调用与用量

Stage B 共运行 81 个 attempts：15 个 smoke、36 个正式、30 个 stability。按每条 audit 的实际 model turns 汇总，共 168 次真实 Chat Completions 请求：smoke 29、正式 73、stability 66。

Provider usage 总计 1,065,006 tokens：三次 smoke 166,943，正式 475,135，stability 422,928。这里只报告 provider usage，不推算货币成本。

## 17. Recommendation

建议保持当前三个 tools 与 deterministic data layer 冻结，**继续 Phase 1，下一步只做 thinking-disabled 与 thinking-enabled 的独立 A/B**，使用同一冻结 corpus 和同一严格 evaluator，重点观察：

1. key arguments 与 forbidden-tool avoidance 是否稳定超过 80%；
2. stability 中参数选择是否提升，而 tool calls/token/latency 是否恶化；
3. bounded final-answer 是否能让 structured final 稳定达到 ≥95%，且不牺牲 evidence 与事实；
4. unsupported 是否保持人工 100% abstention。

在这些指标稳定前，不建议准备生产 Phase 2，也不建议扩展工具面。当前结果证明 Phase 1.1 的 evidence 与上下文协议方向有效，但剩余瓶颈已经主要是模型规划和终答长度控制。
