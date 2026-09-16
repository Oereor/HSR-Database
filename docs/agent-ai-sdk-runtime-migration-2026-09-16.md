# HSR Data Agent 迁移至 Vercel AI SDK 7

日期：2026-09-16  
范围：本地 CLI、Inspector、profile 与 eval；不新增 Web Agent 路由或 UI。

## A. 摘要

HSR Data Agent 已从手写 DeepSeek Chat Completions 协议和手写多步循环迁移到 Vercel AI SDK 7 `ToolLoopAgent`。AI SDK 现在负责模型调用、消息与工具结果回传、多步执行、reasoning 协议、retry、timeout、stop condition 和结构化输出。项目代码聚焦于 HSR instructions、三个模型可见工具、确定性数据执行、evidence 与 limitation 语义。

公共结果仍为中文 `answer`、`evidenceIds` 和 `limitations`。静态 SvelteKit 站点、部署方式与两个上游数据仓库都不在本次改动范围。

## B. 迁移前后

迁移前：

```text
CLI / eval
  → custom while loop
  → custom message/tool-call/reasoning bookkeeping
  → raw fetch DeepSeek /chat/completions
  → manual JSON parse/repair/finalization retry
  → deterministic HSR executors
```

迁移后：

```text
CLI / Inspector / eval
  → HSR Agent configuration
  → Vercel AI SDK 7 ToolLoopAgent
  → official @ai-sdk/deepseek provider
  → AI SDK tool + Zod schema
  → deterministic HSR executors
```

被取代的主要组件包括手写 loop、OpenAI-compatible request/response DTO、`tool_calls` JSON 解析、assistant/tool message 拼接、`reasoning_content` replay、原始 HTTP client 及终答 JSON 修复/专用 finalization retry。

## C. 仓库变更

- `src/lib/server/agent/runtime.ts`：改为薄的 HSR `ToolLoopAgent` 配置、安全错误边界、evidence ledger 与产品 trace 转换。
- `src/lib/server/agent/model.ts`：新增官方 DeepSeek provider 工厂与环境配置校验。
- `src/lib/server/agent/tools.ts`：三个工具改用 AI SDK `tool()` 与原有 Zod schema，共享单次运行的 8-call 领域上限。
- `scripts/agent/{run,inspect,inspector,eval,profile}.ts`：改读 SDK 步骤、工具、usage 和耗时，并保留 secret/reasoning 隔离。
- `tests/unit/agent/*`：删除旧协议单测，改用 SDK mock model 验证 Agent 生命周期。
- 删除 `src/lib/server/agent/providers/deepseek.ts`。
- 依赖锁定为 `ai@7.0.102` 与 `@ai-sdk/deepseek@3.0.45`。

## D. AI SDK 集成

- Runtime：Vercel AI SDK `7.0.102`。
- Provider：`@ai-sdk/deepseek@3.0.45` 的 `createDeepSeek`，使用非 beta endpoint。
- 模型：默认保留 `deepseek-flash`，可由 `DEEPSEEK_MODEL` 覆盖。
- Stopping：`stopWhen: stepCountIs(4)`；另保留单次运行最多 8 个已执行工具的领域约束。
- Timeout：总计 180 秒、单步 60 秒、单工具 30 秒。
- Retry：只使用 SDK `maxRetries: 1`，不再叠加自定义 provider/finalization retry。
- Reasoning：CLI 继续支持 `off|low`，通过 SDK 的 provider-agnostic `reasoning` 设置传递；不保存或展示 reasoning 正文。
- Structured output：`Output.object({ schema: modelAnswerSchema })`；provider 使用 JSON object 输出，SDK 在本地校验，不启用 DeepSeek beta strict tool mode。
- 观测：从 SDK steps 读取 finish reason、validated inputs、tool result/error、usage 和 performance；显式排除 request body、request messages、response body 和 reasoning text。

## E. 工具迁移

### `search_entities`

AI SDK 用 `searchEntitiesInputSchema` 校验模型输入，然后调用原有 `searchEntities` 确定性执行器。同名候选、截断和 `ent1` evidence 语义不变。

### `query_endgame`

AI SDK 用 `queryEndgameInputSchema` 校验 filters/projection/sort/limit，然后调用 `queryEndgame`。season、configured-occurrence、PF warning、DecimalString、截断和 `eg1` evidence 不变。

### `aggregate_endgame`

AI SDK 用 `aggregateEndgameInputSchema` 校验 group/metrics/sort，然后调用 `aggregateEndgame`。标量聚合、associated extrema、并列、weakness explode、warning 与 `ag1` evidence 不变；本次没有新增第四个工具。

## F. 意图与歧义

instructions 要求先解决会实质影响数据集、结论、可回答性或重要限制的意图歧义，再评判 Scope Fidelity。Agent 可直接执行明显占优的解释、明示低风险假设，或在多个自然解释实质分歧时请求澄清。

历史 Manual Case C（“颁赐者…最近 6 期”）被作为人工/语义歧义案例。评测可接受澄清或明示假设，不再强制唯一首工具或 tool path，也不作为自动晋级阻断项。

## G. 删除的技术债

- 手写 bounded model/tool loop 与步骤状态。
- 手写 assistant/tool message history 和 reasoning replay。
- 原始 `fetch` DeepSeek client、协议 DTO 和 HTTP retry/timeout 层。
- 手写 tool name allowlist、JSON arguments parser 和重复 schema validation。
- 终答 JSON fence/prose repair 与 finalization-only retry。
- 仅验证旧 provider request body / `reasoning_content` 的测试。

## H. 测试与验证

以下是本次实际执行结果，不沿用历史报告或迁移前数字。

- `pnpm check:scripts`：通过；Site Messages 为 324 条 / 2 locales，Agent runtime、CLI、eval 与 profile 的 TypeScript 通过。
- Agent 测试源文件独立 TypeScript 检查：通过，包括 `MockLanguageModelV4` 场景。
- 独立 `MockLanguageModelV4` runtime smoke：通过；实际执行了无工具结构化输出、工具结果回传、SDK 输入校验/恢复、确定性工具错误安全回传、evidence ledger、4-step stop、8-tool execution cap 和 timeout 映射。
- `pnpm agent:eval --suite=frozen`：通过语料校验，识别 24 dev + 12 held-out；未加 `--model`，真实模型调用为 0。
- `pnpm agent:profile`：通过；生成 SDK tool fingerprints 与离线 payload profile，真实模型调用为 0。
- `pnpm data:validate`：通过；data revision `8dc7843723cf`，输出了既有 TextMap/敌人数据警告。
- 本次变更的 TS/JSON/YAML 文件 Prettier：通过。本次变更的 TS 文件 ESLint：通过。
- `pnpm check`：退出码 0，`svelte-check` 为 0 errors / 0 warnings，且 scripts typecheck 通过；但沙箱内 esbuild 打印了无法读取 workspace 根目录 / `vite.config.ts` 的错误，Svelte 工具随后使用 fallback 完成。
- `pnpm lint`：未通过；全仓 Prettier 报告 7 个本次未修改文件存在格式差异（`contracts.ts`、三个 deterministic executor/helper 文件、`warnings.ts` 和两个旧测试）；为避免扩大 migration diff 未机械重写它们。
- `pnpm test:agent` / `pnpm test`：未能启动 Vitest。首次依赖安装被中断后，当前根 `node_modules` 的虚拟存储缺少 `std-env`；改用完整的隔离依赖树启动 Vitest 时，esbuild 又因沙箱拒绝读取 workspace 根目录而失败。沙箱外只读重试申请被自动审批服务以 HTTP 429 拒绝。
- `pnpm build` / `pnpm test:e2e:smoke`：data/assets ensure 成功，但 Vite 同样因上述沙箱 esbuild 读取限制无法加载 `vite.config.ts`，因此未能完成 build 或启动 smoke web server。
- 真实 DeepSeek smoke：0 prompts。环境中存在凭据，但因完整 Vitest/build gate 未通过，未发起付费调用。
- `TurnBasedGameData` 与 `StarRailRes` 最终 `git status --short` 均为空，与实施前一致。

手动 smoke 命令（不输出 key）：

```bash
pnpm agent:run -- "查找敌人可可利亚，同名候选不要擅自合并。"
```

## I. 剩余风险

- DeepSeek 对 structured JSON 和 tool calling 的具体行为仍需用最多三条真实 prompt 做有界 smoke；确定性测试不能代替 provider 兼容性验证。
- `aggregate_endgame` 的 schema 仍然较复杂，特别是 associated extrema；本次为保持 baseline 不进行工具拆分。
- 历史 frozen corpus 仍包含一些 tool-name 级指标；歧义 case 已从唯一首工具约束中分离，其余评测未扩张为全面的自然语言歧义 taxonomy。

## J. 后续候选

SDK baseline 稳定后，再单独评估 `aggregate_endgame` 是否需要拆分 associated-extrema 职责；不应把该试验与本次 runtime 迁移混在同一 baseline 中。
