# Farming Benchmark N=1 正式迁移交付报告

日期：2026-10-10。工作分支：`develop`。本报告记录实际生成与本地验收；没有提交、推送或部署。

## 1. 执行结论

已将正式基准从同条件三件最大 U 改为同条件自然单件 U，真正重新生成全部 2,744 条分布。K=65,536、seed=123456789、257 点及 0.005 表示误差门槛保持不变。全部分布通过门禁，最大误差为 0.003906217442194132。正式 Benchmark、审计和 Manifest 已更新，生产 loader 的本地 Player 链路已消费新 N=1 基准，旧 N=3 产物被明确拒绝。

这次迁移改变评价基准的语义：分数表示单件质量相对于同部位、同主词条自然五星 +15 遗器的质量位置。评分合成规则保持不变。完整 CI 的最终结果见第 4、6 节。

## 2. 实现与保护范围

- 正式配置为 `budgetN=1`、`selectionMode=single-base-raw-sub-utility`。每轮直接调用既有自然生成器一次并计算 U，正式路径移除多件取最大值；通用 `farmingBudget(N)` 保留。
- metadata、编码点数、审计与确定性记录均使用正式配置；sampling digest 和全部 2,744 个条件 identity 已随配置变化。没有从旧 CDF 开根、转换或复用旧分布。
- Benchmark schema 4、算法版本 2、RelicScore DTO version 3 不变。自然模型、PRNG、Profile、α=0.35、flat 4/9、主副词条评分合成、Effective Hits、Set Integrity、1505 Override 和 1506 agnostic 政策不变。没有 UI、CSS、评分等级或组件文案修改；新增中英文 Changelog。
- 生成前记录正式产物、Profile、Override、概率模型、锁文件及上游状态，在 Git 忽略的 `.staging/n1-migration/backup/` 保存本轮恢复依据。生成期间未运行开发服务器、构建或评分消费者。
- 发布前校验实际 staging Benchmark 与审计字节、coverage、identity、表示门禁及候选 bytes/hash。发布后的两个文件字节检查已移入同一个回滚保护区；发布失败会恢复此前文件并保留失败候选诊断。随后 `data:ensure` 成功刷新 Manifest，完成最终绑定检查；本轮没有触发回滚，没有强制删除占用文件。

锁定上游缓存使用既有 pin：TurnBasedGameData `312b4597691e0a29cf9828a15b592757dba86949`，StarRailRes `dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487`。两个相邻上游仓库只读。

## 3. 新正式产物与审计

覆盖集合由当前 ready Profile 与可用条件推导，实际生成 2,744 条；每条 65,536 次实验，共 179,830,784 件自然样本。审计记录生成耗时 **309.3073842 秒**，表示门禁 **2,744 通过、0 失败**。误差是编码 CDF 对本次全 K 经验 CDF 的表示误差，不是总体分布估计误差的置信界限。

| 项目 | 实际值 |
| --- | --- |
| sampling digest | `46e98a8e062478702f19b776b004734917393738c4bf47e4c27f7e5d80c5c027` |
| Benchmark bytes | 23,570,308 |
| Benchmark SHA-256 | `3b19258d43c017d4a1e3948273ce6741edd31f4e9eade05229a6189bb4f91bd3` |
| 审计 bytes | 1,923,576 |
| 审计 SHA-256 | `70ecedaa774e1578f01a4f960ca33e6fe17c3cfa73915d14197a3c157e02e9ce` |
| 确定性记录 SHA-256 | `ef898dca37cc7f992a75444c67a053662d4b2a4be5422af00d42b6874874fb78` |
| Manifest schema | 53（未升级 schema） |
| Manifest SHA-256 | `cc701292453790702572b5a3922b045d5678586ee04eed62eb9e6f7992289d00` |
| Manifest dataRevision | `537d396dfcac69afde2a3a075db6073bbb3a18bbe8597fe03de4649131209295` |
| generator commit | `84de58b0ba01a1d1d709c410a75601a694a7f983` |
| generator workingDiffSha256 | `57a0a270e1ae71881f55fb75ec57b4ef3dbd0f465b8d551e66c0028ba82da221` |

Manifest 的 `ratingV2BenchmarkInput` 绑定 schema 4、新 Benchmark bytes/hash 和审计 hash。生成输入的字节指纹与正式文件逐项相符；首次 `data:ensure` 因旧产物绑定失效而重新生成，后续 CI 命中新的有效绑定。运行时 loader 完整验证这组绑定后加载 N=1，没有旧产物 fallback。

生成 provenance 记录生成当时的工作 diff；之后仅将错误诊断的点数类型与消息改为读取配置，不改变采样实现或产物。

以下 SHA-256 与迁移前完全一致：

| 受保护输入 | SHA-256 |
| --- | --- |
| upstream.lock.json | `fdcdbb9b06ac413c684c281b59ab7a1acbbbdf45f64fec5241d2394b1b113b06` |
| probability-model.json | `11a83f7f6e4fe2e31c62534a67931b98325d6321407b1f4eafd8c7ebc41174f8` |
| character-profiles.json | `f634da898707425bc2448d12647707b23d985e20465c1a5b28cd08c7c41d513d` |
| profile-overrides.json | `f6c88e92237567af6198a868519c6e9531ef22e3ea58e01ea754dcf14e345112` |
| runtime/relic-rating-v2.json | `183dc5a7375c2a94d151a410cea182099f94ed8395b40017658aff6c27a4b724` |

所有 sub-profile digest 保持一致；所有条件 identity 均不同于原正式 N=3。旧 sampling digest `e0ff67cb7c8e99a3f89cdad3a390ff4524fc79956578aac094a1273cf899d2bc` 与旧 Benchmark SHA-256 `542c3aec09187e5be5e34832a44d2c7a789cadc95798ac469b9d6f1e916857b8` 仅作历史依据。

## 4. 数学、运行时与真实数据验收

### 定向与确定性验收

四个相关测试文件共 22 项通过，覆盖单件自然条件采样、metadata、旧 N=3／旧 digest 拒绝、审计，以及既有离散 CDF、重复值、端点和表示误差门禁。`tsconfig.scripts.json` 类型检查通过。正式 `benchmarks-validate` 通过。

`benchmarks-determinism` 按正式 seed 与全 K 重算，四个条件的完整分布与正式文件一致：

| 条件 | 最大表示误差 | 结果 |
| --- | --- | --- |
| 1413 OBJECT / SPRatioBase | 0.0034637267709708985 | 通过 |
| 1001 HEAD / HPDelta | 0.0019073367198176316 | 通过 |
| 1506 OBJECT / SPRatioBase | 0.002792345588148226 | 通过 |
| 1505 NECK / PhysicalAddedRatio | 0.0018375254255326157 | 通过 |

### 本地 Player Mock

使用既有本地 Mock 入口调用正式 `handlePlayerRequest`，通过正式生产 loader 评分；没有访问远端 Enka。四份私有输入的前后 SHA-256 一致。只保留匿名聚合验收、字段结构和不变量，不保存原始响应、UID 或昵称。

| 匿名样本 | 角色数 | 可评分单件 | 完整配装 | 缺件配装 |
| --- | ---: | ---: | ---: | ---: |
| 1 | 7 | 31 | 3 | 4 |
| 2 | 1 | 6 | 1 | 0 |
| 3 | 6 | 36 | 6 | 0 |
| 4 | 8 | 48 | 8 | 0 |
| 合计 | 22 | 121 | 18 | 4 |

同输入逐项比较 U、主适配度、主完成度、Effective Hits、Set Integrity、主贡献和副词条分项，全部一致。1505 有 1 份记录、1506 有 2 份记录，沿用既有政策。DTO 字段结构、version 3、algorithmVersion 2 均一致。API 输出与正式 scorer 一致；完整配装和单件分数均在 0–100，缺件配装继续返回 `incomplete-build`。HEAD、HAND 与 explicit-agnostic 单件仍为 `100 × 正式 CDF 百分位`。

| 匿名聚合 | 原 N=3 均值 | 新 N=1 均值 | 新最小值 | 新最大值 |
| --- | ---: | ---: | ---: | ---: |
| 121 件单件 | 77.42083315 | 87.90362265 | 0.44799999 | 99.90795848 |
| 18 份完整配装 | 77.84659882 | 87.59742509 | 31.29941942 | 98.49263215 |

分数变化来自真实生成的新 N=1 CDF，未改变合成公式或重新比较 α。

### 长夜月截图推定案例

该案例由调查中截图的合法词条次数及档位推定，**并非原始 Enka 记录复算**。1413 OBJECT / SPRatioBase，主适配度 0.8、完成度 1；副词条为 DefenceDelta（次数 2／累计档位 3）、AttackAddedRatio（1／2）、CriticalDamageBase（4／3）、StatusProbabilityBase（1／1）。U=3.5844444203829458，Effective Hits=4。

新正式 CDF 百分位为 **0.7529871282790636**，α=0.35 合成后的实际分数为 **76.94416333813913**（展示约 76.94）。同推定输入原 N=3 分数为 55.77734331433306。没有为了匹配约 77 分调整参数、权重或算法。

### 全量 CI

`pnpm ci:validate` 实际执行一次，耗时 156.760 秒，在全量单元测试阶段以 exit 1 中断。此前全部准备、数据、资源、名称、TypeScript／Svelte、Prettier 和 ESLint 阶段通过；Svelte 为 0 errors、0 warnings。单元测试结果为 **83 个文件通过、1 个文件失败；986 项通过、1 项失败**。

唯一失败是未修改的 `tests/unit/endgame-voracity.test.ts` 中 `preserves pollution in zh-CN occurrence shards` 超过既有 5,000 ms 时限（约 5,203 ms）。没有断言失败或 Windows 原生进程崩溃记录。该文件按原参数单独核查，13 项全部通过，测试耗时 2.30 秒。此次全量并发超时可能与运行时负载有关，这一解释属于推断；保留 CI 失败，不提高时限、不修改工具链、不反复重跑完整 CI。

CI 尚未执行的构建阶段由既有 `pnpm deploy:build:production` 本地入口补做：**通过，117.992 秒**。Vite 构建、output smoke、最终视觉资源引用闭包（4,736 个文本文件／9,971 条路径）和静态路由验证（2,180 个页面索引及内部链接）全部通过。这个补验没有远端部署，也没有替代完整 CI 的失败状态。最终诊断点数清理后的局部 Prettier、ESLint、脚本 TypeScript 检查通过。

## 5. 清理与文档

完成任务的临时 `investigate-budget-n.ts` 已删除；旧调查报告保留，明确标记其重映射结果和复现命令属于历史 N=3 基线，删除失效的脚本超链接。旧实现与 α 比较报告加上历史说明。活动代码及测试中的 N=3 metadata 和相关硬编码已清理，通用数学工具、历史报告和旧身份拒绝测试保留。

更新了 V2 数学契约、Benchmark 维护说明、英文评分说明与生成架构文档，并新增中英文 Changelog，说明语义变化与评分合成不变。未复制旧 N=3 大型产物到活动目录；历史正式产物可从 Git 历史恢复，本轮回滚备份仅在忽略的 staging 内。

本轮诊断、回滚文件及匿名验收材料均位于忽略的 `data/relic-score/v2/.staging/n1-migration/` 或 `data/audit/n1-migration/`。正式产物保持既有目录；未修改依赖、工具链、上游锁定版本、组件或样式。

## 6. 最终状态与人工验收

| 状态 | 项目 |
| --- | --- |
| 通过 | 真正 N=1 全量生成、2,744 条表示门禁、coverage、全部新 identity、审计与候选／发布 bytes/hash、Manifest 更新及绑定、正式校验、四条件全 K 确定性复算、定向测试、正式本地 Player Mock、私有输入 SHA-256 与评分不变量、类型／Svelte、ESLint／Prettier、全量数据、资源、局部超时文件核查、本地生产构建及输出／路由验证 |
| 失败 | 一次完整 `ci:validate` 的全量单元测试阶段：1 项 5 秒超时，986 项通过。单独核查通过不抹去此项失败 |
| 环境阻塞 | 没有确认的 Windows 原生进程或外部工具阻塞；全量测试负载原因尚未确证 |
| 未执行 | CI 原调用中的构建阶段因前序失败未执行，已用既有本地生产入口补验；无界面变更，未新增浏览器视觉验收；未重新运行 α 比较、远端 Enka 或远端部署 |

最终 diff 和 Git 忽略规则检查通过，诊断与回滚备份没有进入可提交文件；可审查的 18 个修改／新增文件未检出私有 UID、文件名、绝对路径或多字符昵称。两个相邻上游仓库均维持原 pin 且工作区干净；锁文件、Profile、Override、概率模型和 runtime Profile 的 SHA-256 保持一致。

**实现与本地产物迁移完成，但不声明满足正式发布条件**：完整 CI 的超时失败仍未关闭。维护者应在正常运行环境确认全量 CI 通过后再人工验收发布。此处停止，不提交、不推送、不部署。
