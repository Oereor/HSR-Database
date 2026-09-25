# Relic Score 正式 Benchmark 维护

正式产物是 `src/lib/relic-score/generated/farming-benchmarks.json`，由命令生成并跟踪于 Git。不要手改产物或将 `tests/fixtures/relic-score/benchmark/prototype.json` 用作生产替代。`phase-1e-benchmark-generation-audit.json` 仅记录摘要证据，不参与运行时。

## V1 契约

`src/lib/relic-score/scoring-config.ts` 是 N、K、seed、Lens B、257 点和评分份额的唯一配置入口。每个角色／槽位／合法主词条从相同 seed `123456789` 重新初始化 `mulberry32-v1`，生成三件**主词条固定且相同**的同槽 5★ 遗器并全部强化至 +15，取基础副词条 RawSubUtility 的最大值；重复 65,536 次。主词条与同名副词条按 canonical stat key 互斥。角色、槽位和主词条按稳定顺序处理，正式产物不保存样本。

Lens B 仍比较三件中的最高副词条质量，且不按角色推荐主词条筛选。错误主词条也有自己的条件分布；推荐与否只由 MainCompletion 评价。这个 benchmark 以已经取得三件同槽且同主词条遗器为前提，不计主词条掉率或体力成本。运行时以实际主词条查询静态产物；缺项或过期时评分不可用，不使用旧槽位混合分布。

## 何时重新生成

需要重新生成：已审核 Profile 的基础副词条权重、实际采样概率、5★ 主／副词条参考、N、K、seed、PRNG、Lens、量化契约或生成器行为发生变化。若修改生成器行为，应先提升 benchmark generator version，再生成并检查差异。角色增删也需要维护者明确审核覆盖契约。

不需要重新生成：Soft Target 区间、Hard Breakpoint 阈值、推荐套装和主词条、Main/Sub 份额、Build Stat/Set 份额、bonus/penalty、Set Integrity、UI、本地化、Profile review note 或概率模型的文字来源说明。Profile 自身可能仍需按 [Profile 维护流程](profile-maintenance.md)重新审核；这与 benchmark 是否过期是两个独立判断。

## 操作步骤

1. 如修改 Profile，先完成逐角色审核，并运行 `pnpm relic-score:validate`。
2. 运行 `pnpm relic-score:farming:validate`。
3. 运行 `pnpm relic-score:benchmarks:generate`，确认输出 `2716/2716 generated` 与 `2716/2716 gate passed`。任一分布超过 `0.005` 时，命令会输出角色／槽位／主词条和 513 点诊断，并保持正式产物不变；需人工调查，不自动改格式。
4. 运行 `pnpm relic-score:benchmarks:validate`，检查正式 JSON 与当前输入、配置及完整覆盖一致。
5. 检查正式 JSON、审计摘要和配置的 Git diff；再运行相关单测、`pnpm check`、`pnpm lint`、`pnpm data:validate:build-inputs` 与 `pnpm build`。
6. 提交产物、审计和必要的源代码。普通 build／CI 只做廉价校验，绝不执行 Monte Carlo 生成。

若需证明可重复性，连续两次运行完整生成命令并比较两次输出的 SHA-256；审计中的运行时间和内存测量允许不同，但正式 JSON 必须逐字节一致。
