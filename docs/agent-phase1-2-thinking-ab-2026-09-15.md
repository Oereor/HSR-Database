# HSR-Database Data Agent Phase 1.2 Thinking A/B 与本地 Inspector 报告

日期：2026-09-15

## 1. Executive Summary

Phase 1.2 已在 `develop` 完成。三个工具、deterministic data layer、system/tool semantics、24 条 dev + 12 条 held-out 评测语料、4-turn/8-call 限制和生产架构均保持冻结；没有新增 Web UI、服务端路由、外部数据仓库或部署改动。Runtime、Inspector 与普通 CLI 的默认 thinking mode 仍为 `off`。

本轮先把最终答案收紧为有界 contract，再接入 DeepSeek `thinking=low`、reasoning replay、逐轮 planning telemetry、A/B runner 和本地开发者 Inspector。受控实验共执行 142 次模型 attempt：5 题 smoke × 2 模式、36 题全量 × 2 模式，以及 10 个 stability case × 3 次 × 2 模式。所有 attempt 均完成。

全量 36 题中，low 相对 off 的严格通过率从 18/36（50.0%）提升到 26/36（72.2%），首工具关键参数从 17/28（60.7%）提升到 20/28（71.4%），非法调用从 4 降到 0，unsupported abstention 从 7/8 提升到 8/8；平均 token 反而下降 4.3%，但平均延迟上升 26.5%，p95 从 5,601 ms 上升到 10,974 ms。Stability 中 low 同样提升规划质量并消除 11 次非法调用和 3 次 turn-limit，但平均 token 增加 21.0%，平均延迟增加 76.6%。

结论：**USE THINKING-LOW，限于后续本地/Phase 1 Agent 使用；代码默认值继续保持 `off`。** 质量收益足以支持开发阶段显式开启 low，但延迟尾部、重复运行成本与 warning retention 仍需继续观察。本结论不自动开启 low、不运行 high，也不授权进入 Phase 2。

## 2. Scope

本轮允许并完成的范围：

- DeepSeek provider 的 off/low 参数、assistant reasoning replay 与 provider metadata 映射；
- runtime 的 bounded finalization、逐轮 telemetry 和安全 trace；
- `agent:eval --thinking=off|low|both`、A/B fingerprint 与评分扩展；
- `agent:inspect` 本地开发者 CLI；
- deterministic tests 与本报告。

冻结项：

- 工具仍只有 `search_entities`、`query_endgame`、`aggregate_endgame`；
- normalized Endgame row、season recency、PF configured-occurrence、DecimalString、Enemy exact Monster join、HP 与 evidence 语义未改变；
- `evals/agent/dev.jsonl`、`evals/agent/held-out.jsonl` 和 10 个 stability case 未改变；
- production route、Web UI、deployment 和外部数据仓库未改变。

Phase 1.1 原始 audit 目录未保留在当前工作区。终答限制的选择因此使用当前仓库仍存在的 raw audit 结构化输出分布，并结合已提交 Phase 1.1 报告中“2 个正式 + 3 个 stability 输出因 2,048 output-token 截断”的事实；本报告不声称重新测量了已缺失的 Phase 1.1 原始文件。

## 3. Bounded Finalization

终答形状保持不变：

```ts
{
  answer: string;
  evidenceIds: string[];
  limitations: string[];
}
```

Parser 仍只接受 raw JSON 或内容完整地包在单层 JSON fence 中的 JSON，不从 prose 中抽取片段。Provider `max_tokens` 保持 2,048，没有用扩大输出窗口掩盖无界回答。

Hard limits 为：

| 字段 | 限制 |
| --- | ---: |
| `answer` | 最多 800 个 Unicode 字符 |
| `evidenceIds` | 确定性去重后最多 8 个 |
| `limitations` | 确定性去重后最多 5 个 |
| 单条 limitation | 最多 160 个 Unicode 字符 |

Prompt 要求优先使用足以支撑核心结论的 aggregate evidence，避免同时枚举大量 occurrence evidence。Runtime 只对 evidence/limitations 做确定性去重、过滤与 cap，不改写 `answer` 的事实内容。空内容、非法或截断 JSON、answer/limitation 超限只允许一次无工具 finalization retry；再次失败时返回有界安全 fallback，并保持 `structuredAnswer=false`。

Trace 新增 retry reason、contract violation、数组去重/截断数量和 runtime truncation limitation。全量 A/B 的 72 次 attempt 没有触发 finalization retry，structured final 为 72/72。Stability 的 low 有 3 次 output-truncation retry，分别为 `dev-aa-season-diff` 第 3 次、`dev-cross-moc-as` 第 2/3 次；三次全部恢复为结构化终答。两种模式 stability 的 structured final 均为 30/30，说明 bounded retry 修复了 Phase 1.1 的主要终答截断压力，而没有放宽 parser。

## 4. Thinking Runtime

公共类型新增：

```ts
type AgentThinkingMode = 'off' | 'low';
```

请求映射：

- `off`：显式发送 `thinking: { type: "disabled" }` 与 `temperature: 0`，保持 Phase 1.1 行为；
- `low`：显式发送 `thinking: { type: "enabled" }` 与 `reasoning_effort: "low"`，不发送在 thinking 模式下无效的 temperature。

内部 assistant turn 保存 `content`、`reasoning_content` 和 `tool_calls`。只要后续请求仍携带 tools，就完整 replay 既往 assistant reasoning content；无工具 finalization retry 不 replay 旧 reasoning content。low 响应在协议要求的位置缺失 `reasoning_content` 时抛出明确 compatibility error，不能静默退化为 off。

Provider/runtime 汇总 model、system fingerprint、finish reason、input/output/cache usage、逐 model-turn latency，以及 reasoning 是否存在和字符数。只有 provider 官方 usage 字段存在时才记录 reasoning tokens；off 标记为 `not separately reported`。原始 reasoning 文本永不进入 runtime 返回值、audit 或 Inspector。

实现遵循 DeepSeek Chat Completions、Tool Calls、Thinking Mode 与 JSON Output 协议：[Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)、[Tool Calls](https://api-docs.deepseek.com/guides/tool_calls/)、[Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode/)、[JSON Output](https://api-docs.deepseek.com/guides/json_mode/)。

## 5. Developer Inspector

新增薄 CLI：

```text
pnpm agent:inspect
pnpm agent:inspect --thinking=low -- "问题"
pnpm agent:inspect --verbose --save -- "问题"
```

无问题参数时进入交互模式，每次输入都会创建 fresh request，不继承上一题模型上下文。默认 `thinking=off`。常规输出格式化展示问题、每轮工具名、validated arguments、结果摘要、warning/evidence 数量、latency、最终结构和总 metrics；`--verbose` 只增加 warning details、evidence list 和 finish reason，不打印完整工具 JSON 或 reasoning。

`--save` 只能写入已被忽略的 `data/audit/agent/manual/`，文件名由时间戳与问题哈希构成，不接受用户自定义路径。控制台和保存内容统一经过 secret redaction，不包含 key、Authorization、环境变量 dump 或原始 reasoning；Inspector 也不会写入冻结 eval corpus。

## 6. Deterministic Tests

Stage A 新增/扩展覆盖：

- 终答数组去重/cap、过长 retry、截断 JSON、fallback 与 enforcement telemetry；
- thinking-off 回归、low 参数映射、reasoning replay、缺失 reasoning 报错、usage/fingerprint 映射；
- first-tool 分母、key-argument subset、invalid-call 与 recovery 评分；
- Inspector 参数、交互 fresh request、格式化、verbose、secret redaction、manual audit 路径与 eval 隔离。

最终工程验证见第 15 节。正式模型实验开始后没有再修改 runtime、prompt、tool schema、evaluator 或 corpus。

## 7. Compatibility Smoke

Run ID：`2026-09-15T15-01-57-061Z`

固定五题按 corpus 顺序逐题交错 off → low：

```text
dev-as-current-slot2
dev-pf-hp-trend
dev-search-character-alias
dev-runtime-unclear-hp
dev-difficulty-trap
```

两种模式均完成 5/5，strict 4/5、gold facts 5/5、required evidence 3/3、structured final 5/5、非法调用 0。首工具名和首工具关键参数均为 3/4。low 相对 off 平均增加 520.2 tokens 和 518.8 ms，low 官方 reasoning tokens 合计 1,351。Smoke 没有发现 provider/runtime/protocol bug，因此未进行 prompt、gold 或 tool 调整。

## 8. A/B Design

正式变量只有 thinking `off` 与 `low`。两种模式使用同一 provider model `deepseek-flash`、数据快照、prompt、tool schema、输出约束和执行限制；顺序固定为 `repetition → corpus case → off then low`，即同一 case 交错运行。

冻结 fingerprint：

| 对象 | 值 |
| --- | --- |
| game version | `4.5.0` |
| source commit | `8dc7843723cf6f2d6acafee0b3fb152c90994208` |
| data revision | `6f4dc9165611be7b6caa5c0d961bdbaedc6ca45193a491f10ce212548bc806c4` |
| prompt SHA-256 | `0c7f147a287b37018a27a70f12794e498bea26ebe7ff4e8c122a285e1db5bf1a` |
| tools SHA-256 | `ebb7a87d6849e85b34039256cc03d21b746b00632892267fa9a4ed129214fa0b` |
| dev corpus SHA-256 | `d768e89d2310ae59ce5f84efb2a4af9309225a3e1dd176e3ef0f9d5c3f739fd9` |
| held-out corpus SHA-256 | `920fac6c6649335a886f64c569bdb97854e83907ce617b560ce9b4c42eeca92c` |

First-tool name 的分母只包含 28 个 `expectedTools[0]` 存在的 case；8 个零工具 unsupported case 不进入分母。First-tool arguments 要求同一个首调用同时满足该工具既有 key-argument subset。Invalid calls 统计 `UNKNOWN_TOOL`、`INVALID_JSON`、`INVALID_ARGUMENTS`；recovery 要求下一 model turn 的第一个调用使用同一工具且本地验证成功。

运行命令：

```text
pnpm agent:eval --thinking=both --cases=dev-search-character-alias,dev-as-current-slot2,dev-pf-hp-trend,dev-runtime-unclear-hp,dev-difficulty-trap
pnpm agent:eval --thinking=both
pnpm agent:eval --thinking=both --stability --repeat=3
```

## 9. Full A/B

Run ID：`2026-09-15T15-03-03-941Z`；36 cases × 2 = 72 attempts，全部完成。

| 指标 | Off | Low | Delta（low - off） |
| --- | ---: | ---: | ---: |
| Strict contract | 18/36（50.0%） | 26/36（72.2%） | +22.2 pp |
| Expected tool present | 33/36（91.7%） | 33/36（91.7%） | 0 |
| Key argument subset | 27/36（75.0%） | 29/36（80.6%） | +5.6 pp |
| First-tool name | 23/28（82.1%） | 24/28（85.7%） | +3.6 pp |
| First-tool key arguments | 17/28（60.7%） | 20/28（71.4%） | +10.7 pp |
| Forbidden tool avoided | 25/36（69.4%） | 31/36（86.1%） | +16.7 pp |
| Invalid tool calls | 4 | 0 | -4 |
| Recovery after invalid | 1/4（25.0%） | 0/0 | n/a |
| Gold facts | 36/36（100%） | 36/36（100%） | 0 |
| Required evidence | 19/20（95.0%） | 20/20（100%） | +5.0 pp |
| Required warnings | 9/10（90.0%） | 8/10（80.0%） | -10.0 pp |
| Structured final | 36/36（100%） | 36/36（100%） | 0 |
| Unsupported abstention | 7/8（87.5%） | 8/8（100%） | +12.5 pp |
| Turn-limit hit | 1/36 | 0/36 | -1 |
| Avg tool calls | 1.250 | 1.056 | -0.194 |
| Avg model turns | 2.083 | 1.972 | -0.111 |
| Avg tokens / attempt | 13,464.6 | 12,889.0 | -575.5（-4.3%） |
| Avg latency | 3,419.8 ms | 4,327.5 ms | +907.7 ms（+26.5%） |
| p95 latency | 5,601 ms | 10,974 ms | +5,373 ms |

Low 官方 reasoning tokens 合计 11,907。Off 的 4 次 invalid call 分布在 `dev-as-level-min`（1 次）和 `dev-lightning-boss-hp`（3 次，最终触及 turn limit）；low 为 0。两种模式的 invalid evidence ID 都是 0。

## 10. Stability A/B

Run ID：`2026-09-15T15-08-04-985Z`；10 cases × 3 repetitions × 2 = 60 attempts，全部完成。

| 指标 | Off | Low | Delta（low - off） |
| --- | ---: | ---: | ---: |
| Strict contract | 15/30（50.0%） | 19/30（63.3%） | +13.3 pp |
| Expected tool present | 24/30（80.0%） | 28/30（93.3%） | +13.3 pp |
| Key argument subset | 15/30（50.0%） | 20/30（66.7%） | +16.7 pp |
| First-tool name | 22/30（73.3%） | 24/30（80.0%） | +6.7 pp |
| First-tool key arguments | 15/30（50.0%） | 18/30（60.0%） | +10.0 pp |
| Forbidden tool avoided | 22/30（73.3%） | 26/30（86.7%） | +13.3 pp |
| Invalid tool calls | 11 | 0 | -11 |
| Recovery after invalid | 1/11（9.1%） | 0/0 | n/a |
| Gold facts | 30/30（100%） | 30/30（100%） | 0 |
| Required evidence | 18/21（85.7%） | 21/21（100%） | +14.3 pp |
| Structured final | 30/30（100%） | 30/30（100%） | 0 |
| Turn-limit hit | 3/30 | 0/30 | -3 |
| Avg tool calls | 1.367 | 1.267 | -0.100 |
| Avg model turns | 2.200 | 2.300 | +0.100 |
| Avg tokens / attempt | 13,708.2 | 16,587.8 | +2,879.7（+21.0%） |
| Avg latency | 3,511.7 ms | 6,201.3 ms | +2,689.6 ms（+76.6%） |
| p95 latency | 5,003 ms | 16,692 ms | +11,689 ms |

Low 官方 reasoning tokens 合计 18,536。Off 的 11 次 invalid call 全部来自 `dev-lightning-boss-hp` 的重复非法 aggregate 参数，每个 repetition 出现 3–4 次，只有 1/11 符合 recovery 定义；low 完全消除该模式，且没有 turn-limit。

## 11. First-Tool Analysis

Low 对“选对首工具”的改善较小但稳定：全量 +3.6 pp、stability +6.7 pp。更显著的改善发生在首工具参数：全量 +10.7 pp、stability +10.0 pp。这与 Phase 1.1 的主要剩余压力一致——工具能力本身足够，错误更多来自首步过滤、分组和 metric 参数规划。

全量 general key-argument subset 达到 80.6%，首次跨过本阶段 80% 参考线；first-tool key-argument 仍只有 71.4%，说明多轮后续修正会掩盖部分首步不稳定。Expected-tool-present 在全量中没有变化（均 91.7%），因此 strict +22.2 pp 不是由“多调用一个 gold tool”单独驱动，而是参数、禁用工具规避、evidence 和 abstention 的联合提升。

## 12. Failure Taxonomy

### Planning / unnecessary calls

全量 forbidden/unnecessary call 从 off 的 17 次降到 low 的 9 次，forbidden avoidance 提升 16.7 pp。Stability 从 17 次降到 5 次，提升 13.3 pp。剩余 strict failures 仍主要是工具选择、首步参数或不必要调用，而非 deterministic data failure。

### Invalid arguments and recovery

Off 在全量出现 4 次、stability 出现 11 次非法调用；low 两组均为 0。Off 的 recovery 分别只有 1/4 和 1/11，显示只依赖错误 hint 不能稳定修复重复错误。Low 的主要价值之一是防止错误进入 tool loop，而非更擅长事后恢复。

### Finalization

全量没有 retry；stability low 的 3 次截断均由一次无工具 retry 恢复。没有出现 fallback，structured final 为 100%。因此 bounded finalization 已解决观察到的 JSON 截断结果，但模型仍可能先消耗一次额外终答请求。

### Semantic warning retention

全量 required warnings 从 9/10 降到 8/10。`dev-pf-total-hp-trap` 与 `held-pf-actual-kills` 的 low 回答都无工具调用并正确拒绝不可回答概念，但因为没有 tool warning，机械 warning 指标未命中。这是 warning provenance/retention 的评分与架构压力，不是 answerability 退化；仍应保留为可见回归，不能从 gold 中删除。

### Unsupported boundary

Off 唯一人工 abstention 失败是 `dev-difficulty-trap`：回答先说明数据库未定义难度，随后仍以 HP proxy 排名，越过了冻结的 proxy discipline。Low 对 8 个 unsupported case 全部正确拒答。

## 13. Accuracy vs Cost

全量 low 的质量收益没有增加总 token：tool calls 和 model turns 下降，使平均 token 从 13,464.6 降到 12,889.0，抵消了 11,907 个 reasoning tokens。代价主要体现为等待时间，平均延迟增加 26.5%，p95 几乎翻倍。

Stability 则暴露较差尾部：low 平均 token 增加 21.0%，平均延迟增加 76.6%，p95 达 16.7 秒。3 次 finalization retry 是成本的一部分，但不能解释全部差异。该数据支持“开发阶段显式 low”而不支持“无条件全局默认 low”。后续若考虑默认开启，需要单独设定 latency SLO、按题型路由或更大样本复验。

## 14. Secondary Safety / Quality

- 两组正式 audit 共 132 个 attempt 文件（72 + 60），程序化扫描确认不含 `reasoning_content`、`Authorization`、`DEEPSEEK_API_KEY` 字样或实际 key 值；
- Audit 只暴露 reasoning 是否存在、字符数和官方 usage，不暴露思维文本；
- Gold facts 在全量与 stability 的两种模式均为 100%，invalid evidence ID 均为 0；
- Truncation disclosure/preservation 在两组正式运行中均为 100%，必要时由 runtime 追加 limitation；
- 没有通过修改 eval、gold、prompt 或 tool schema 修复模型答错。

## 15. Manual Inspector Notes

Inspector 是本地开发诊断面，不是生产入口。它复用真实 runtime 和相同 redaction，并把复杂内部对象压缩为可读摘要。推荐人工检查顺序为：问题 → 首工具/validated args → warning/evidence count → 每轮 latency/finish reason → 最终 `answer/evidenceIds/limitations` → 总 usage。

实现与工程检查：

| 检查 | 结果 |
| --- | --- |
| Agent unit tests | 46/46 passed |
| Full unit tests | 527/527 passed |
| Changed-file Prettier | passed |
| ESLint | passed |
| TypeScript / Svelte check | 0 errors, 0 warnings |
| Eval corpus validation | 24 dev + 12 held-out passed |
| Data validation / ensure | passed；保留既有 generated-data warnings |
| Production build | passed |
| Playwright smoke | 5/5 passed |

完整 `pnpm lint` 的 Prettier 全仓检查仍会被若干本轮未触碰的历史文件阻塞；本轮所有 changed files 的 Prettier 检查与全仓 ESLint 均通过。没有机械重排这些无关文件。

## 16. Remaining Architecture Pressure

1. 首工具关键参数在 low 下仍只有 71.4%（全量）和 60.0%（stability），尚未达到稳定生产规划水平。
2. Low 的 p95 latency 分别为 10.97 秒和 16.69 秒，尾部成本显著。
3. 正确无工具 abstention 与“必须来自工具结果”的 warning gold 之间存在 provenance 张力，需要在未来单独设计，不应在冻结实验中临时改评分。
4. Bounded retry 能恢复截断，但 stability 仍有 3/30 low attempt 触发额外请求；应继续观察 answer contract adherence。
5. Reasoning usage 仅在 provider 官方字段存在时可分列，不能从 output tokens 反推隐藏 reasoning 成本。
6. Inspector 仍是单问题本地 CLI，没有会话、UI、权限或生产可观测性；这些都属于 Phase 2 之外的工作。

## 17. Recommendation

**推荐：USE THINKING-LOW for continued local / Phase 1 Agent work。**

依据是全量 strict +22.2 pp、首工具参数 +10.7 pp、forbidden avoidance +16.7 pp、非法调用 4 → 0、evidence 95% → 100%、unsupported abstention 7/8 → 8/8；stability 也在 strict、参数、evidence 和 turn-limit 上同方向改善。收益跨单次全量与重复样本出现，不是单个 case 偶然波动。

同时保留以下决策边界：

- Runtime、Inspector 与普通 CLI 默认继续为 `off`；需要 low 时显式指定；
- 不自动运行或建议默认启用 high；
- 不进入 Phase 2，不扩工具、不改数据语义；
- 在考虑默认 low 之前，先解决/量化 latency p95 与 warning retention，并用相同冻结纪律复验。

