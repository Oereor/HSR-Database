# HSR Data Agent — AI SDK 迁移后修复

日期：2026-09-16  
范围：`AGENT-VAL-001`、`AGENT-VAL-002`；不改变三个 HSR 工具的职责或 SDK-first 架构。

## A. AGENT-VAL-001 根因

这是 Case A：AI SDK 7 正确把 `query_endgame` 结果传给下一模型步骤，生产 runtime 不需要兼容性修改。

安装版本中的实际 provider prompt 结构是：

```text
role: tool
  → type: tool-result
  → toolName: query_endgame
  → toolCallId: query
  → output.type: json
  → output.value.rows[n].evidenceId
```

失败测试把整个 prompt `JSON.stringify` 后用 `/eg1\/[a-f0-9]{64}/` 搜索，但当前 occurrence evidence 是路径型 ID，例如 `eg1/as/3020/...`，不是 64 位哈希。测试现改为 typed helper，按 tool message、tool name、call ID 和 JSON output 结构读取真实结果，再引用 `rows[0].evidenceId`。测试继续覆盖 evidence ledger 接受和 runtime 强制补充截断限制。

## B. AGENT-VAL-002 根因

首次失败的精确子类别无法事后恢复。旧 CLI 只输出安全消息，没有保留 `NoObjectGeneratedError.text`、finish reason 或 validation cause；同一实体搜索提示在本次诊断中成功，因此不能诚实地把历史失败断言为空内容、fence、无效 JSON 或 schema mismatch。

可确认的结构化输出风险有两项：

1. `@ai-sdk/deepseek` 对该模型使用 `response_format: { type: "json_object" }`，并通过 system message 注入 schema；warning 正确标识为 compatibility，而不是原生 JSON Schema enforcement。
2. 原 schema 用 Zod `refine` 表达 800/160 字符限制，生成给 provider 的 JSON Schema 没有 `maxLength`；Agent instructions 也没有 DeepSeek 官方建议的 JSON 格式示例。

修复后，同一 schema 会生成 `answer.maxLength = 800`、`limitations.items.maxLength = 160`、`evidenceIds.maxItems = 8` 和 `limitations.maxItems = 5`，instructions 同时提供最小纯 JSON 示例。三个真实 smoke 均成功，没有捕获 fence、空内容或截断 JSON，因此没有启用 `extractJsonMiddleware`，也没有增加 retry。

## C. 最终结构化输出设计

```text
DeepSeek deepseek-flash
  → official @ai-sdk/deepseek JSON-object compatibility mode
  → ToolLoopAgent tool/result propagation
  → Output.object({ schema: modelAnswerSchema })
  → AI SDK JSON parse + local Zod validation
  → HSR evidence/limitation normalization
```

- DeepSeek 收到 SDK 注入的 JSON Schema，以及 HSR instructions 中的最小 JSON contract/example。
- `modelAnswerSchema` 仍是最终结构和长度约束的本地权威。
- runtime 现在把 structured-output failure 分类为 `empty-content`、`markdown-wrapped-json`、`invalid-json`、`schema-validation`、`truncated-json`、`no-output` 或 `unknown`。
- 普通 CLI 仍只显示安全错误。`--debug` 才允许显示 provider 最终生成文本；request/response body、密钥和 reasoning 始终不记录。

## D. Stopping 语义

`MAX_MODEL_STEPS` 保持 4。一个 SDK step 是一次模型响应以及该响应触发的工具执行；结构化终答本身占一个额外 step。因此当前上限允许最多三个连续的工具型 model steps，再用第四步生成终答。单个 step 可以并行调用多个工具；单次运行另有 8 个已执行工具上限。

确定性测试同时证明：

- 三个工具步骤后，第四步可以生成 schema-valid object；
- 第四步仍继续调用工具时，runtime 安全返回 turn-limit 结果，不把未完成 tool call 当成终答。

## E. 测试

新增或更新覆盖：

- typed AI SDK tool-result traversal；
- `query_endgame` 真实 `eg1/...` evidence 回传和 ledger 接受；
- 截断结果的 runtime-enforced limitation；
- JSON Schema 的 `maxLength`/`maxItems`；
- 四步 stopping 边界；
- invalid JSON、empty content、Markdown fence、truncated JSON、schema mismatch 分类；
- schema issue 摘要、provider warning 分类和 debug/raw-text 隔离。

验证结果：

- `pnpm check:scripts`：通过。
- `pnpm check`：通过，0 errors；Paraglide/Svelte 检查报告 324 条生成声明发现 warning。
- `pnpm test:agent`：通过，5 files / 67 tests。
- `pnpm test`：通过，51 files / 548 tests。
- 修改文件 Prettier 与 ESLint：通过。
- `pnpm lint`：未通过；全仓 Prettier 仅报告 5 个未修改的既有文件：`endgame-aggregate.ts`、`endgame-query.ts`、`entity-resolution.ts`、`warnings.ts`、`data-tools.test.ts`。
- `pnpm build`：通过；static adapter 成功写入 `build`。

## F. 真实 smoke

所有调用使用 `deepseek-flash`、thinking off、四步上限；均出现预期的 JSON Schema compatibility warning，未抑制 warning。

### Smoke 1 — entity search

- 结果：成功。
- 时机：实施前诊断复测。
- 工具：`search_entities` 1 次。
- model steps：2。
- evidence：`ent1/...` 通过 ledger；同名候选未合并。
- structured output：成功，无 fence/空内容/schema error。

### Smoke 2 — aggregate

- 结果：成功。
- 工具：同一首步调用 `aggregate_endgame` 与 `query_endgame`，共 2 次。
- model steps：2。
- evidence：3 个 `ag1/...` 被接受，`invalidEvidenceIds` 为空。
- structured output：成功；未触发 turn limit 或截断 disclosure。

### Smoke 3 — ambiguity handling

- 结果：成功。
- 工具：`search_entities`、`query_endgame`、`aggregate_endgame`，共 3 次。
- model steps：3。
- evidence：5 个 `ag1/...` 与 1 个 `ent1/...` 被接受，`invalidEvidenceIds` 为空。
- scope：回答明确声明采用最匹配的 `enemyTemplateId 4014020`，并把另外两个同名模板及“最近 6 期”数据不足列为限制，没有静默合并或切换口径。
- structured output：成功；未触发 turn limit。中间 `query_endgame` 截断结果未被最终证据引用，最终结论改用未截断 aggregate evidence，因此无需强制截断 disclosure。

## G. 剩余风险

- DeepSeek JSON Output 官方仍说明可能偶发返回空内容；本次不通过额外 retry 隐藏该 provider 风险，新诊断可在再次发生时精确归类。
- compatibility warning 仍有开发价值，未做全局抑制。
- 历史首次失败缺少原始错误数据，其精确子类别保持“不可恢复”，不以成功复测反向臆测。
