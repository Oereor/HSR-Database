# 遗器主词条政策实施报告

> 历史报告：V1 已退出生产；文中的旧命令、审批、阈值和产物仅作历史证据。当前规范与维护流程见 [V2 规范](relic-rating-v2.md)。

日期：2026-10-01（UTC+8）。网站分支：develop。依据工作区 `Relic-Score-Feature/codex-relic-main-stat-policy-implementation.md`，以本轮正式语义覆盖历史报告的 25/75 与 binary 主词条建议。

## 1. Executive Summary

代码、稀疏配置、生成产物、审核摘要、presentation v2 和精简测试已完成。**98 个角色等待人工重新审核**；没有执行正式审批。84 个角色的 resolved policy 有变化：173 项有效副词条推导增补、1413 的 1 项 ERR 显式增补，以及 1506 的两个 agnostic 槽。其余角色也因全局 schema/generator 迁移需要重新审核。

98 个角色的副词条权重、soft/hard、既有 override 字段和旧 approval digest 均与 HEAD 基线一致。正式 benchmark 与审计文件未修改，2744 项实际主词条分布的 identity 独立逐项核对一致。新逻辑及独立回归集 9 文件 / 61 测试通过；审批依赖的集成验证被严格门禁阻止。另有既存 build-input 的 manifest/source HEAD 不一致，未扩大范围执行数据同步。

## 2. Files Changed

以下路径均相对于网站仓库 `HSR-Database/`。

| 路径 | 职责 |
| --- | --- |
| `src/lib/relic-score/main-stat-policy.ts` | 纯 resolver、三态与来源证据 |
| `src/lib/relic-score/profile-types.ts` | variable slot、稀疏例外、artifact v4 |
| `src/lib/relic-score/scoring-math.ts` | 单一贡献公式及旧 helper 兼容入口 |
| `src/lib/relic-score/score.ts` | 单件三态、贡献返回和 build 聚合 |
| `scripts/relic-score/profiles.ts` | generator v4、规范化复制及 semantic digest |
| `scripts/relic-score/validate.ts` | source/artifact 的新字段严格验证 |
| `scripts/relic-score/review-core.ts` | resolved policy 摘要和全部待审核清单 |
| `scripts/relic-score/review.ts` | 只读 --all；单角色审批后报告剩余审核 |
| `data/relic-score/profile-overrides.json` | schema v4 和两个角色最小例外 |
| `src/lib/relic-score/generated/character-profiles.json` | 正常 generator 产物，98 项 needs-review |
| `src/lib/player/relic-score-contract.ts` | presentation v2、状态与 nullable completion |
| `src/lib/relic-score/presentation.ts` | 三态/null 序列化，保留内部数据过滤 |
| `tests/fixtures/relic-score/scoring-sources.ts` | 独立合成评分 fixture，不依赖正式审批 |
| `tests/unit/relic-score-main-stat-policy.test.ts` | 5 个集中测试覆盖 resolver、贡献、build、契约、角色例外及 identity |
| `tests/unit/relic-score-profiles.test.ts` | v4 fixtures；2 个集中配置/digest/review 测试 |
| `tests/unit/relic-score-scoring.test.ts` | 使用合成 fixture；贡献字段及 nullable 类型同步 |
| `tests/unit/relic-score-benchmark.test.ts` | 贡献字段同步，保留正式审批依赖 |
| `tests/unit/relic-score-player-integration.test.ts` | 契约 v2 与 nullable 类型同步 |
| `tests/unit/relic-score-presentation.test.ts` | v2 合成 DTO fixture |
| `tests/unit/player-handler.test.ts` | API 输出版本同步 |
| `tests/e2e/player-character.spec.ts` | 消费端 v2 fixture 同步；本轮未运行浏览器测试 |
| `docs/relic-score-feature/profile-maintenance.md` | v4 配置、公式及审核维护说明 |
| `docs/relic-score-feature/benchmark-maintenance.md` | identity 与 review gate 的边界说明 |
| `docs/relic-score-feature/main-stat-policy-review.json` | 确定性的 98 角色摘要、84 角色 policy diff 及待审核 ID |
| `docs/relic-score-feature/main-stat-policy-implementation.md` | 本报告 |

两份已有未跟踪调查报告保持原样。未修改其他 sibling 仓库。

## 3. Final Semantics

`Q=clamp(actualMainValue / fiveStarAt15MainValue,0,1)`；`U` 仍为 reviewed 基础副词条权重的高档当量加权和；`P` 仍为该实际主词条分布对 U 的 CDF 查询。

| mainStatStatus | mainCompletion | mainContribution | subContribution | pieceNormalized |
| --- | --- | --- | --- | --- |
| accepted | Q | 0.35×Q | 0.65×P | 0.35×Q+0.65×P |
| mismatch | 0 | 0 | 0.65×P | 0.65×P |
| agnostic | null | 0 | P | P |

`pieceScore=100×pieceNormalized`。agnostic 不表示 Q=1；低星、低等级 accepted 的 Q 仍小于 1。nullable completion 和 mainStatStatus 在 presentation v2 中保持语义，UI 继续显示既有数值，无新增视觉标签。

## 4. Resolver

`resolveMainStatPolicy` 只接收 slot、推荐主/副词条和 profile 的最终权重/显式例外。它不接收 build、面板、soft/hard、命途、光锥、星魂、队伍或 rotation。

variable slots 合并三类证据：upstream、effective-substat、explicit-override。自动推导同时要求 upstream 推荐副词条、正权重、canBeSubstat 和同名合法 mainSlots。HEAD/HAND 根据 registry 采用合法固定主词条，证据为 fixed，与 flat 副词条权重无关。agnostic 仅来自显式槽位配置，状态优先，但摘要仍保留底层 accepted 集合和证据。

upstream 集合始终包含于 accepted，没有 removeAccepted。flat/percentage 不互相转换；Effect RES 无主槽；ERR、Healing 和属性 DMG 不自动推导。没有第二张映射表、角色 ID 分支或外部 API。

## 5. Profile / Override Migration

override schema、generated artifact schema、generator 均为 **4**；template schema 保持 1；benchmark schema 保持 3。新增集合稳定排序后进入 digest 并复制到产物；未配置的角色不生成空例外字段。note 和 reviewedInputDigest 自身不参与 semantic digest。

严格校验拒绝未知字段、未知角色、非法槽位/stat、HEAD/HAND 覆盖、重复或空数组/对象、agnostic 与 addAccepted 同槽冲突，以及已由上游或最终权重接受的冗余添加。显式 ERR 等 special main 不需要属于推荐副词条。

生成器正常生成了 98 个 needs-review profile，保留所有旧 reviewedInputDigest；新 inputDigest 随 schema/generator 版本和语义变化失效。sourceCommit provenance 正常更新为当前 generated manifest 来源，不影响 benchmark weight identity。逐项比较已确认所有权重、targets、旧审批及除新增字段外的 override 内容不变。

`--all` 是只读摘要入口，不支持批量批准。单角色审批后的结构校验使用现有维护用途 allowStaleReviews，以允许其他角色继续待审；剩余角色明确报告。独立严格 validate 和 runtime 要求保持不变。没有修改 validator 接受 stale，也没有执行任何 approve-current。

## 6. Case Studies

- **1413 长夜月**：只增补 `mainStatOverrides.addAccepted.OBJECT=["SPRatioBase"]`。去掉显式例外时 ERR 绳为 mismatch，无法由副词条推导；加入后证据为 explicit-override。其主贡献按实际 Q 计算为 0.35×Q，HP/SPD/CR/CD 权重和 targets 不变。
- **1506 银狼LV.999**：只增加 `agnosticSlots=["NECK","OBJECT"]`。两槽归一分均为实际主词条的 P；`scalingStat:null`、权重和 `SpeedDelta≥160` 保留。速度门槛只在 build 层计算。
- **1006 旧银狼**：没有这两个 agnostic 例外，原 override 完整保留。

角色配置测试直接读取真实 source 配置并生成当前 profile，验证 resolver；合成评分 fixture 用于独立验证公式。没有为测试赋予正式角色新的人工审批。

## 7. Piece / Build Integration

pieceContributions 是三态贡献的唯一公式入口；历史 calibration 使用的 pieceNormalized helper 委托 accepted 公式，保留旧签名。本轮没有运行 calibration。

```text
pieceNormalized = mainContribution + subContribution
B = Σ slotWeight × pieceNormalized
aggregatedMainPart = Σ slotWeight × mainContribution
aggregatedSubPart = Σ slotWeight × subContribution
B ≈ aggregatedMainPart + aggregatedSubPart
```

最后一项只允许浮点求和顺序误差。HEAD/HAND 权重仍为 0.1，其余各为 0.2，不因 agnostic 重分配。0/1/2/4 个 agnostic 槽位的测试核对独立公式、两个聚合分量、目标归一、套装和有效次数。soft/hard/set 的实现与公式没有改动，final 仍在 [0,100]。

## 8. Benchmark Boundary

所有 98 项 profileScoringDigest 与正式产物保存的 digest 一致；另外直接用当前 model、权重及正式 N/K/seed，对全部 **2744 个实际主词条条件 identity** 调用纯 benchmarkIdentityDigest，逐项核对通过。该检查不赋予审批，不替代正式 loader 的 review gate。

U 的输入权重、五星参考、概率模型、主副互斥规则、P 定义和实际主词条查询均未改变。N=3、K=65536、seed=123456789、Lens B、257 点、PRNG 和生成器版本保持原样。正式 artifact 与历史 generation audit 无 diff，没有重跑 Monte Carlo。

改动前后正式 benchmark SHA-256 均为：

```text
bedf7579503c7bb1f49662ad1bdea69ccba1b506ebd6b9d4306e45210f580cd9
```

改动前 `pnpm relic-score:benchmarks:validate` 通过 2744/2744。改动后同一正式命令在严格 profile stale review 门禁停止，尚未完成正式入口的后续校验；不能把独立 identity 检查描述为正式审批后校验已通过。

## 9. Tests / Validation

新增 7 个集中测试（resolver/scoring/contract 文件 5 项、profile 文件 2 项），以 registry/状态/槽数/非法配置矩阵覆盖边界，没有按 48 条要求逐条建立重复测试。已有低 rarity、未强化 Q、有效次数、modifier、set 和失败传播测试继续保留。合成 scoring fixture 独立于正式审批生命周期；生产 benchmark、player integration 与 handler 测试没有放宽可用性断言或静默跳过门禁。

| 实际命令 / 检查 | 结果 |
| --- | --- |
| 直接 4 文件 Vitest：main-stat-policy、profiles、scoring、presentation | 32/32 通过 |
| 文档要求的 relic-score 集及 player-stat-synthesis、player-handler，共 13 文件 | 78 通过、9 失败、3 未执行；4 个失败文件均受正式审批状态影响 |
| 随后独立回归集 9 文件 | 61/61 通过 |
| `pnpm relic-score:profiles:generate` | 98 项生成成功，无审批写入 |
| --all CLI、两种输入顺序生成、维护结构验证和严格 stale 拒绝 | 通过；98 pending |
| `pnpm relic-score:validate` | stale review 1001；98 项待审 |
| `pnpm relic-score:farming:validate` | 通过，原 probability digest 不变 |
| `pnpm relic-score:benchmarks:validate` | profile stale review 门禁阻止 |
| `pnpm check` | 通过；合成 fixture 类型问题已修复，Svelte 0 错误 / 0 警告，scripts/API TypeScript 通过 |
| 改动 TS 文件 ESLint、改动文件 Prettier | 通过；直接使用已安装 CLI，无依赖安装 |
| `pnpm data:validate:build-inputs` | Generated data manifest does not match prepared source HEAD；源和生成数据未被本轮改动 |

宽范围测试失败明细：farming prototype 2 项因 strict validate stale；player integration 6 项及 handler 1 项因生产 context 不可用；benchmark suite 的 beforeAll 在 stale review 停止，3 项未执行。该状态要求人工审批，未改写为成功预期。审批完成后需重跑。

独立回归命令：

```powershell
node node_modules/vitest/vitest.mjs run tests/unit/relic-score-main-stat-policy.test.ts tests/unit/relic-score-profiles.test.ts tests/unit/relic-score-scoring.test.ts tests/unit/relic-score-normalize.test.ts tests/unit/relic-score-reference.test.ts tests/unit/relic-score-presentation.test.ts tests/unit/relic-score-boundary.test.ts tests/unit/relic-score-farming-model.test.ts tests/unit/player-stat-synthesis.test.ts
```

未运行完整 unit/browser 套件、production build、远程部署或 benchmark generation。浏览器 fixtures 只做契约同步，本轮没有新增交互行为。已有 pnpm exec prettier 的命令 shim 不可用，使用安装目录中的 CLI 完成相同目标检查。

## 10. Review / Next Step

完整 98 个待审 ID、旧/新 digest、全部 resolved evidence 和 84 个角色的 policy diff 位于 [main-stat-policy-review.json](main-stat-policy-review.json)。全量失效原因是 schema/generator v3→v4，不是权重或分布过期。当前 runtime 评分整体不可用，必须审核完成后才可进入正常发布 gate。

在 `HSR-Database` 中先查看：

```powershell
pnpm relic-score:profiles:review --all
pnpm relic-score:profiles:review --character=1413
pnpm relic-score:profiles:review --character=1506
```

维护者逐角色核对当前摘要和 diff 后，明确执行该角色审批；以下仅是命令示例，本轮没有执行：

```powershell
pnpm relic-score:profiles:review --character=1413 --approve-current
pnpm relic-score:profiles:review --character=1506 --approve-current
```

其余 pending ID 按同样流程逐个审核，不提供自动批量批准。全部审核完成后运行：

```powershell
pnpm relic-score:validate
pnpm relic-score:farming:validate
pnpm relic-score:benchmarks:validate
node node_modules/vitest/vitest.mjs run tests/unit/relic-score-benchmark.test.ts tests/unit/relic-score-farming-prototype.test.ts tests/unit/relic-score-player-integration.test.ts tests/unit/player-handler.test.ts
```

独立处理当前 generated manifest 与 prepared source HEAD 的匹配，再运行 build-input validation。无须重新生成 farming benchmark。
