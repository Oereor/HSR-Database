# 上游更新与 Rating V2 内容身份修复

日期：2026-10-19。网站分支：develop。本文记录本次修复证据，不替代现行维护契约。

## 原因与来源核验

自动工作流先更新 lock，再执行 `update:enemy-assets`；后者准备 pin 并调用完整 `ensureData → syncData → buildRatingV2Profiles`。旧 `assertRatingV2Overrides` 强制审批 policy 的 sourceCommit 等于整站来源 commit，因此 PF 热更新也会触发 `Invalid/stale Rating V2 override policy`。

通过代理读取了[指定上游比较](https://github.com/DimbreathBot/TurnBasedGameData/compare/312b4597691e0a29cf9828a15b592757dba86949...74a7b96fba32f00cf495a5c00b0311bd02207aaf)。实际变更为 GameCoreConstValue、StageInfiniteMonsterGroup、StageInfiniteWaveConfig、TextMapFR；但迁移依据并非文件名：从原批准 commit `312b4597691e0a29cf9828a15b592757dba86949` 的真实 Git blob 提取八份表，在网站内部准备目标 commit `74a7b96fba32f00cf495a5c00b0311bd02207aaf`，逐表比较原始 bytes 和无损解析后的内容 digest，八份均完全一致。

八份表为 RelicMainAffixAvatarValue、RelicSubAffixAvatarValue、RelicMainAffixBaseValue、RelicSubAffixBaseValue、AvatarConfig、AvatarConfigLD、AvatarRelicRecommend、AvatarRelicRecommendLD。前四表提供偏好及映射校验，AvatarConfig 提供 ID 闭包和元素，推荐表决定推荐状态及覆盖的适用性；普通与 LD 在合并前分别审核。概率模型和实际遗器 reference 由独立 Benchmark identity 约束。

还确认了同类问题：旧 tracked Profile 的八份原始 hash 与本地同 commit 的八份文件 hash 全部不同；逐项转换 LF→CRLF 后均匹配旧 hash，而两份 Profile 的语义相同。审批不能直接复用这些平台相关的历史字节 hash。

## 新校验与审批安全边界

policy schema 2 的 sourceDigests 是八份表经现有 lossless raw adapter 和稳定序列化后的 SHA-256。对象键排序，数组顺序保留，Hash/精确数值沿用 raw adapter 表示；换行、缩进与对象键顺序不造成过期。完整八表的内容变化仍保守触发审核，不只保护两个角色的局部行。

本次审批 digest 只从原批准 commit 建立，确认与目标来源相同后才迁移。原 sourceCommit、basis、两个例外数组及原因完全保留。生成和自动更新代码均没有写审批配置的入口。真实变化会报告表名、approved/current digest 和人工复核指引；缺失、额外来源或非法 digest 也会被拒绝。

Profile schema 6 保留当前真实 sourceCommit、来源 digest、policy digest、语义 digest 和映射版本；Manifest schema 54 绑定 policy schema 2 的 bytes/hash，使旧缓存失效。生产入口、独立输入验证和维护 CLI 均使用同一来源集合及校验，保留原有 ID、slot、stat、数值、推荐、missing、异常及 Profile 语义重建门禁。

新来源下 98 个 Profile 全部 ready，0 blocker。1505 的 NECK/PhysicalAddedRatio/0.4（含原始 missing）及 1506 的 NECK、OBJECT explicit-agnostic 全部保持。98 份 Profile 内容与修复前稳定序列化后逐项相同；semanticDigest 仍为 `0af49aa7158d8ebb32fae1e3e7c438992678cf43a7ba6a0d69f197cf2ae7be39`。只有外层 schema、来源和审批 metadata 更新。

## Benchmark 与同类问题分类

| 分类                   | 检查对象与处理                                                                                                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 保持严格 commit 一致性 | checkout/lock、整站 manifest/准备来源、runtime Profile/manifest、正式 Benchmark/其 audit。全站内容更新仍要求重新生成对应站点产物。                                                     |
| 改为依赖内容身份       | policy 的全局 SHA 审批门禁；八份来源原始字节 hash 的 CRLF/LF 敏感性。共享来源模块集中定义与检查，不保留旧审批通道。                                                                    |
| 已有正确机制           | Benchmark 的 sampling、副权重、条件 identity 和完整覆盖；敌方 catalog 的 ID fingerprint；普通资产 pin 与 bytes/hash、生成物 inventory。保留实现。                                      |
| 工作流补齐门禁         | enemy 更新继续使用完整 ensureData。其后新增现有正式 Benchmark/audit validator，避免分布依赖变化仅到生产构建时才失败；全部通过才可提交维护更新。分支、force-with-lease 和 PR 行为不变。 |
| 范围外风险             | 新增上游数据源仍需显式注册与审核；稀疏 checkout 不负责发现未注册的新表。本次不新增跨子系统的自动发现架构。                                                                             |

正式 Benchmark 原本就不要求等于当前 Profile commit；此次没有修改分布 identity、采样参数或 audit 判断。audit 的完整 Profile/policy digest 保留生成历史，分布消费仍验证 sampling、副权重、条件、覆盖、表示误差、原 bytes/hash 和逐分布 audit。审批 schema 迁移改变了当前 policy digest，但没有改变分布身份，故不应重生成。

已通过现有正式 Benchmark 校验，且与 HEAD 的两份文件逐字节比较一致，未运行任何 Benchmark 生成命令：

- farming-benchmarks.json：`3b19258d43c017d4a1e3948273ce6741edd31f4e9eade05229a6189bb4f91bd3`。
- benchmark-generation-audit.json：`70ecedaa774e1578f01a4f960ca33e6fe17c3cfa73915d14197a3c157e02e9ce`。

## 具体修改文件

- 来源与生成：`src/lib/relic-score/v2/source-identity.ts`（新增）、`overrides.ts`、`profile.ts`；`scripts/data/relic-rating-v2.ts`、`source-requirements.ts`、`sync.ts`、`generated-artifacts.ts`、`validation/build-inputs.ts`；`scripts/relic-score/v2-command.ts`。
- 生产与类型：`src/lib/domain/types.ts`、`src/lib/server/relic-score/v2.ts`、`benchmark-loader.ts`。
- 审批及维护产物：`data/relic-score/v2/profile-overrides.json`、`character-profiles.json`；`upstream.lock.json`；`data/search/character-official-names.generated.json`；`docs/relic-score-feature/relic-rating-v2-profile-review.json`。StarRailRes pin、玩家别名和 enemy snapshot 无内容变化。
- 工作流：`.github/workflows/update-upstreams.yml`。
- 现行文档：`docs/architecture/localization-and-data-generation.md`；`docs/relic-score-feature/profile-maintenance.md`、`benchmark-maintenance.md`、`relic-rating-v2.md`；`docs/vercel-deployment-foundation.md`；本报告。
- 仅修正六个现有测试文件：`tests/unit/relic-rating-v2-overrides.test.ts`、`relic-rating-v2.test.ts`、`build-input-validation.test.ts`、`data-cache.test.ts`、`data.test.ts`、`robustness-invariants.test.ts`。更新旧 SHA 判定、参数及 schema，保留原用例和语义断言；未新增测试用例、fixture、mock、snapshot，未删除或跳过测试。

## 验证、限制与工作区

使用 Node.js 24.19.0、pnpm 11.9.0。初期只读调查的代理及 tsx IPC 受沙箱限制；本次在获准的命令环境中通过本地代理运行，已消除这两项验证阻断。

- 现有四个 policy/build-input/audit/upstream updater 测试文件：28 项通过；五个 V2/data-cache/invariants/data/ensure 回归文件：89 项通过，共 117 项，未增加用例数量。
- 新 pin 的 `data:sync`、`profiles:generate`、`review`、`relic-score:v2:validate`、`benchmarks:validate` 均通过。
- `data:validate:full` 通过，包含独立 build-input 门禁；zh-CN/en 各 1153 条搜索记录、191 个 English Endgame shards。保留现有缺失文本等分类诊断，未忽略校验错误。
- 不落盘检查实际改变一项 AvatarValue 偏好并重新计算内容 digest，确认审批拒绝且含复核指引；缺失与非法 digest 同样拒绝。未修改真实上游文件。
- `update:enemy-assets` 通过：observed 4.6.53，632 个敌人，609 映射、23 unavailable、212 张图片全部复用，0 下载，tracked snapshot changed=false。
- 官方名称 update、玩家别名 sync、名称 check 通过；名称快照仅更新实际来源 commit，人工别名无 diff。
- scripts TypeScript 及修改文件的 ESLint、Prettier 检查通过。production profile 全流程通过，包含新 pin 数据输入门禁、正式 Benchmark/audit、素材校验、Vite 构建、输出 smoke、视觉引用闭包和 2180 个公共页面及内部链接校验；用时约 185.5 秒，首次准备锁定 StarRailRes 约 130 秒。

另直接调用当前生产 loader，已确认新 Profile/policy 能与原正式 Benchmark/audit 一起构造 scorer，且缓存复用正常。`pnpm check` 通过：Svelte 0 errors/0 warnings，scripts/API TypeScript 均通过；最终收紧来源集合和来源 commit 格式校验后，复跑既有 policy/build-input 10 项用例全部通过。

本轮不运行远端 GitHub Actions 的提交、push 或 PR 创建步骤，不执行 merge 或部署；远端 PR 行为通过原脚本保持和现有 updater 测试核对，不能宣称实际创建 PR 成功。

初始网站及两个 sibling 仓库均干净。最终网站仍在 develop：28 个 tracked 文件修改、2 个新增文件（共享来源模块与本报告），无暂存或提交；`git diff --shortstat` 对 tracked 文件为 161 additions / 107 deletions。逐项检查差异后，评分 Profile 本体、正式 Benchmark/audit、人工别名和敌方快照均无语义变化。两个 sibling 的最终 `git status --short` 仍为空。

`git diff --check`、修改文件的 ESLint/Prettier、修改文档的 Prettier 均通过。未运行全套 unit/browser 测试；本轮没有浏览器交互变化，采用上述定向检查、完整数据语义验证和 production 构建覆盖风险。未发现需重新批准规则的 blocker。

一次性审批来源提取目录已清理。完整逐表比较、命令日志及 enemy 报告保留在网站忽略的 `data/audit/upstream-rating-v2-*`；`.upstream/` 仅保留锁定的构建输入，不新增测试设施或外部仓库改动。
