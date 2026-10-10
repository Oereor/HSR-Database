# 主词条政策迁移：审批与验证收尾

> 历史报告：V1 已退出生产；文中的旧命令、审批、阈值和产物仅作历史证据。当前规范与维护流程见 [V2 规范](relic-rating-v2.md)。

日期：2026-10-01（UTC+8）。分支：develop。依据工作区 `Relic-Score-Feature/codex-relic-profile-approval-validation.md`，本阶段仅完成已获人工授权的 profile 审批及本地验证。

## 1. Approval Summary

| 项目 | 结果 |
| --- | --- |
| 初始 pending | 98；与已审核的 review artifact 及只读 --all 输出完全一致 |
| schema / generator | 均为 v4，审批期间未改变 |
| 正式批准 | 98 个，每个均通过现有单角色 CLI |
| 最终 pending | 0；98 个 profile 均为 reviewed，审批 digest 等于当前 inputDigest |
| 审批中途失败 | 无；98 个 approval exit code 均为 0 |
| semantic drift | 无 |

初检曾遇到子进程 PowerShell 对 pnpm.ps1 的执行策略限制，尚未进行任何审批。随后使用该启动器所调用的同一 pnpm Node CLI 入口执行现有命令，没有修改执行策略、审批逻辑或 validator。

## 2. Representative Gate

按指定顺序先只读 review、与 artifact 完整比对，再逐个 approve-current：

| 角色 | 审批前 → 后 | 保留的政策 |
| --- | --- | --- |
| 1413 | needs-review → reviewed；pending 98→97 | OBJECT 显式 addAccepted SPRatioBase |
| 1506 | needs-review → reviewed；pending 97→96 | NECK/OBJECT agnostic；scalingStat=null；SPD≥160 |
| 1111 | needs-review → reviewed；pending 96→95 | BE 权重 0.25 等原权重及同名主词条推导保持原样，无新增例外 |

代表审批后重新调用 `pnpm relic-score:profiles:review --all`，确认 pending=95。权重、soft/hard、主词条例外及 generated profile 语义均与审批前一致；1006 没有被加入 1506 的 agnostic 例外。

## 3. Full Approval

从代表审批后的最新 --all 输出取得剩余 95 个 ID。临时本地脚本逐角色执行：

```powershell
pnpm relic-score:profiles:review --character=<ID>
pnpm relic-score:profiles:review --character=<ID> --approve-current
```

每次审批前比对当前 review 与获授权 artifact，审批后比对配置和 generated profile 的全部非审批字段。逐角色保留 ID、命令、exit code、stdout/stderr，并采用 fail-fast；没有调用内部 approval 函数或直接写入 digest。审批完成后再次 --all，确认 pending=0。

临时编排文件已删除，没有新增长期 bulk-approve 功能。原始执行日志、基线及 audit 保留在 Git 忽略的 `test-results/relic-profile-approval-20261001/`，不提交仓库。原 `main-stat-policy-review.json` 由现有 CLI 保持原样，作为审批前 98 pending 的历史审核快照；当前状态以 --all 为准。

## 4. Validation

依次执行正式入口，未用 allowStaleReviews 替代：

| 命令 | 结果 |
| --- | --- |
| `pnpm relic-score:validate` | 98 profiles 通过严格验证 |
| `pnpm relic-score:farming:validate` | natural-5star-v1，通过；12 substats、6 slots |
| `pnpm relic-score:benchmarks:validate` | 2744/2744 distributions 通过 |
| `pnpm check` | 通过；Svelte 0 errors / 0 warnings，scripts/API TypeScript 通过 |
| 改动 JSON/报告 Prettier；迁移相关 TS ESLint | 通过 |

## 5. Benchmark Integrity

正式 farming benchmark 和 generation audit 均无改动，也未重新生成。审批不改变 U、P、权重、概率模型、参考值、N/K/seed、Lens B 或 PRNG。SHA-256 与审批前一致：

```text
bedf7579503c7bb1f49662ad1bdea69ccba1b506ebd6b9d4306e45210f580cd9
```

此前独立 identity 核对之外，本阶段正式 validator 已实际完成全部 2744 分布校验。

## 6. Tests

此前被 stale gate 阻断的四类测试全部恢复：**4 文件、29/29 通过，0 失败、0 跳过**。

```powershell
node node_modules/vitest/vitest.mjs run tests/unit/relic-score-benchmark.test.ts tests/unit/relic-score-farming-prototype.test.ts tests/unit/relic-score-player-integration.test.ts tests/unit/player-handler.test.ts
```

独立回归集继续通过：**9 文件、61/61 通过，0 失败、0 跳过**。

```powershell
node node_modules/vitest/vitest.mjs run tests/unit/relic-score-main-stat-policy.test.ts tests/unit/relic-score-profiles.test.ts tests/unit/relic-score-scoring.test.ts tests/unit/relic-score-normalize.test.ts tests/unit/relic-score-reference.test.ts tests/unit/relic-score-presentation.test.ts tests/unit/relic-score-boundary.test.ts tests/unit/relic-score-farming-model.test.ts tests/unit/player-stat-synthesis.test.ts
```

两组共 13 文件、90 项通过。没有修改测试期望或 fixture 语义，没有出现真实 assertion failure。未运行全站 unit/browser 套件、部署或 benchmark generation。

## 7. Git Diff Audit

已执行 git status --short、git diff --stat 和 git diff，并以任务开始时的工作区为基线审计。此前实现的未提交改动保留，本阶段仅新增本报告，并正常更新两个既有文件：

- `data/relic-score/profile-overrides.json`：98 个 reviewedInputDigest 更新，其他字段逐项相同。
- `src/lib/relic-score/generated/character-profiles.json`：98 个 reviewedInputDigest 更新，98 个 reviewStatus 从 needs-review 变为 reviewed；其他字段逐项相同。

33 个受保护文件的 SHA-256 与本阶段起点一致，包括此前已修改的评分代码、契约、测试、维护文档及审核快照，以及 benchmark、audit、概率模型、模板、registry、份额、identity 和 recommendation。无新增评分公式变化或 unrelated app diff。两个 sibling 仓库的 Git status 均保持初始状态，无修改。

## 8. Known External Issue

按本阶段任务文档记录：TurnBasedGameData local HEAD is behind upstream；build-input manifest/source HEAD validation 属于 **known external/upstream synchronization issue; handled separately after profile approval verification**。

本阶段未重复执行已知失败的 build-input 检查，也未同步、重新 prepare 或修改 TurnBasedGameData；该问题不归因于 relic-score migration。

## 9. Final Status

**ready for local manual verification**。

98 个审批及全部规定的本地验证已完成。未 push、merge、创建 PR、触发 GitHub Actions 或部署 Preview/Production。上游同步问题按独立任务处理。
