# 遗器评分 V2 正式迁移报告

> 历史 V2 迁移记录，本文 N=3 产物、耗时与验收结论属于当时基线。后续 N=1 迁移见 [新报告](farming-benchmark-n1-migration.md)，当前政策以 [数学契约](relic-rating-v2.md) 为准。

日期：2026-10-10，Asia/Shanghai。起始网站 develop / 4b052ed。本轮未提交、推送、合并或部署；仅修改 HSR-Database。此前候选实施见 Git 历史；当前生产入口统一使用 V2。

## 正式来源与批准覆盖

TurnBasedGameData 312b4597691e0a29cf9828a15b592757dba86949，StarRailRes dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487。锁文件与相邻上游不改。唯一稀疏政策 schema 1 承载已批准的 1505 NECK / PhysicalAddedRatio / 0.4，以及 1506 NECK/OBJECT agnostic。覆盖保存原始 missing 证据，状态 override，纳入槽最大权重；未补上游 DamageAddedRatio。

98 个 Profile ready，0 blocker。全部 98 个最终副权重与起始提交候选逐一比较，0 变化。Profile schema 5，主映射 avatar-main-slot-max-overrides-v2，semantic digest 0af49aa7158d8ebb32fae1e3e7c438992678cf43a7ba6a0d69f197cf2ae7be39，override semantic digest fce67814c80b31f5d05d689de0b3fb3e8e3dc1096e0906b9b5d058742265bca2。Manifest schema 53 绑定本地政策及正式 Benchmark bytes/hash，缓存与 build-input 同步失效。

## 全量正式生成

输入冻结后完成一次全量 MC，耗时 1283.199 秒，2744/2744 分布通过，0 失败。Lens B / N=3 / K=65536 / seed=123456789 / 自然五星 +15 / 既有 PRNG / 257 点 CDF 均保持。最大表示误差 0.003905550682893888，小于 0.005；未放宽门槛。

正式文件 23,439,037 bytes，SHA256 542c3aec09187e5be5e34832a44d2c7a789cadc95798ac469b9d6f1e916857b8。sampling digest e0ff67cb7c8e99a3f89cdad3a390ff4524fc79956578aac094a1273cf899d2bc。生成审计记录真实生成提交、当时工作 diff hash、逐分布误差与汇总；后续共享函数提取不改采样语义，没有伪造新的生成 provenance。

独立 coverage/identity/有限值/单调性/逐条审计/bytes/hash 校验通过。1001 HEAD HPDelta、1505 NECK PhysicalAddedRatio、1506 OBJECT SPRatioBase 三个条件全 K 复算完全一致。正式产物与审计纳入 Git，运行不依赖候选缓存；失败在 staging 保留诊断，阻止发布。

## 生产切换与清理

生产 scorer、Enka pipeline、Player Function、Svelte UI 统一 version:3 / algorithmVersion:2。服务端依据 Manifest 绑定正式 Profile、Benchmark 和审计，完整验证一次并缓存；逐件条件 identity 核对，无旧算法 fallback。canonical 遗器 normalization 独立于面板，面板失败仍保留合法遗器评分与显示诊断。

普通槽 S=100×(0.35×a×Q+0.65×P)，固定槽与显式 agnostic 为 100×P。Build=100×(0.95×加权单件分+0.05×套装完整性)。Flat 4/9、独立推荐次数、六槽和套装政策不变，成功分值限定 0–100。

已删除 V1 scorer/Profile类型、模板/scaling/阈值/审批配置、旧正式产物、专用 CLI、候选双管线、旧 DTO/i18n/UI 和失效测试。保留并提取 reference、canonical normalization、概率模型、生成器、PRNG、CDF、Effective Hits、Set Integrity 和摘要类型。保留已有历史比较报告，审核 CLI 改为引用静态历史比较，不读取已删除的 V1 文件。

α 六档比较完成，正式仍为 0.35，结论见 [比较报告](relic-rating-v2-alpha-comparison.md)。本地真实文件只读验收见 [mock 报告](../investigations/player-local-enka-mock.md)。

## 复现

使用锁定输入运行 data:sync；然后 relic-score:v2:profiles:generate、:review、:validate、:benchmarks:validate、:benchmarks:determinism、:alpha-compare。输入 identity 变更时才运行 :benchmarks:generate 全量 MC。正式生成后 data:ensure 更新 Manifest。完整迁移验证与本地输出预检使用 pnpm ci:validate；相关浏览器使用现有 Playwright。

本轮中途真实失败：旧 schema/DTO 测试未同步、Windows 开发服务占用导致目录 rename EPERM、并行 messages 编译引起 HMR 模块失效，以及开发 Analytics 外部请求。已迁移断言、停止服务再发布、顺序验收，并关闭开发 Analytics；最终结果追加于本报告末尾。

## 最终验证记录

- 正式 Profile 98 ready / 0 blocker；Benchmark 2744/2744 gate pass；三条件复算确定性通过。source registry/sparse 的四份新增权重表齐全，正式 pin 复用。
- 全仓 Vitest 84 文件 / 986 tests 全通过；最后三份生产/API/mock 定向用例 22 tests 通过。override、原始 missing、过时拒绝、身份不变、CDF/Set/Hits 与面板独立失败均覆盖。
- pnpm data:validate:full 和 build-input 校验通过；已知上游 533 缺失 TextHash、13 weakness conflicts 保持既有诊断，无评分 blocker。
- pnpm deploy:build 本地 production profile 完整通过：artifact gate、Vite/adapter-static、输出 smoke、视觉资源闭包、2180 公共页面及内部链接校验；未调用远端平台。原生 Player Function 本地打包约 25.4 MiB，正式 V2 对四份真实文件验证 18 available / 4 缺件、22 个面板，保持 API headers。
- 真实桌面/移动、中英文 16 例全部通过；相关 Player 40 例最终行为均覆盖（最后整组 36 pass，修复两项旧测试后定向 4 pass）。没有把失败的整组命令写成一次全绿。完整证据见 mock 报告。
- pnpm check 曾 0 errors/0 warnings，scripts/API 分步亦通过；pnpm lint 曾全仓通过。后续 Windows 原生检查进程不稳定，3221225477/3221225501，CI 总流程先后停在 check/lint。尝试直接 Node 入口不能稳定解决，已撤销无效 workaround，保留原 package check/lint 入口；停止该外部工具验证路径。最终 CI 总流程未取得成功，这是剩余验收限制，不能宣称上线 gate 全绿。手动复验：在稳定 Node 24/pnpm 11 环境运行 pnpm check、pnpm lint、pnpm ci:validate。
- git diff --check 最终检查；私有原文件验收前后 SHA256 一致、私有数据/绝对目录未进入静态输出或 Function。上游仓库 clean，锁文件不变；无 commit/push/merge/deploy。
