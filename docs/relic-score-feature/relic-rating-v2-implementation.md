# 遗器评分 V2 实施报告

日期：2026-10-10（Asia/Shanghai）。网站：develop，起始提交 489ca1cf4839decd71d3e93ffba91f6c79d37d2b，本轮修改未提交。依据为已批准实施文档与计划；数学规范见 [V2 规范](relic-rating-v2.md)。

## 交付状态

V2 来源链路、纯映射、候选 Profile、评分核心、canonical normalization、version 3 DTO、候选 Enka 集成、双语 UI、维护 CLI、正式 Benchmark 生成／门禁和 α 比较工具已实现。生产仍明确使用 V1。

全部 98 个角色 Profile 派生及结构／语义校验完成：97 ready，1505 needs-review。全量 V2 正式 Benchmark 为 **0/2744 个分布生成**，α 比较未执行。没有发布 V2、混合旧新分布、伪造审批或调整 α。

## 来源与版本

- 正式 TurnBased pin：312b4597691e0a29cf9828a15b592757dba86949，版本 OSPRODWin4.6.0_D16728363_A16704710_L16700845。
- StarRailRes pin dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487 未改。两个相邻仓库全程只读，开始与结束均无工作区变化。
- 网站 .upstream/TurnBasedGameData 经现有 prepareCheckout 重建为正式 pin；fetch 从本地只读的同一 pin 取 Git 对象，保留官方 origin。没有联网或更新锁文件。
- sparse/shared registry 加入两份 AvatarValue 和两份 BaseValue。前者各 98 行，与 94 regular + 4 LD 的角色及推荐闭包一致；后者仅校验完整映射。
- Manifest schema 52 包含 runtime/relic-rating-v2.json 候选；Profile schema 5；Benchmark schema 4；presentation version 3 / algorithmVersion 2。
- 最终 Profile semantic digest：b276c6ace6cb22f7061aaf728ef9120553cce2825c20072aee8e70ad5e913245。八份输入的实际 SHA-256、逐角色异常和旧新变化见 [审核报告](relic-rating-v2-profile-review.json)。

V1 Profile 和 Benchmark 原字节保留，V1 Profile provenance 仍是历史 6b2bc17…；这是保留旧生产路径的边界，不表示其来源已统一到 V2 pin。新 Manifest 和 V2 派生全部使用正式 pin。

## 实现与差异

纯映射保留 present、missing、inapplicable；invalid 输入被拒绝。推荐缺失和非推荐缺失使用不同政策标记。未知额外 LD 源、重复身份、非法字段／权重、元素异常及无正权重槽位不能自动通过。审核改为来源、闭包、合法性与语义变化审计，V2 无 approve-current。

全部 98 个角色都与 V1 最终副权重不同，共 950 个 canonical 副权重改变。Flat 精确 4/9 仅在权重层应用。推荐集合独立，非推荐正权重产生 U 而不产生 hits。1506 球／绳保留明确退出理由；1413 不再消费 addAccepted。

普通槽公式为 100×(.35×a×Q+.65×P)，固定和 agnostic 为 100×P。主、副贡献按槽权重各聚合一次；最终 100×(.95×statCompletion+.05×SetIntegrity)。V2 没有 Soft/Hard、panel 输入或二元主匹配。数值范围、非法遗器、主副互斥和部分失败均有明确处理。

现有纯 affix normalization、Effective Hits、Set Integrity、reference、随机模型、PRNG 和 CDF 被复用；评分不依赖光锥／行迹／面板合成。候选 scorer 不读取 V1 Profile／Benchmark，也不 fallback。Svelte 消费 V1 或 V2 DTO；V2 展示适配度、贡献、P、真实权重与有效次数，固定部位不显示伪造主适配度。

分布依赖副权重和副映射／Flat／U 语义、概率／reference、N/K/seed/PRNG 及表示；主权重、主合成、α、套装和展示不进入分布 identity。正式生成仍逐条件重置 seed，N=3、K=65536、257 点、误差≤0.005；全部 gate 通过才写候选，校验核对真实生成审计。审计保留生成时的来源 SHA 和完整 Profile semantic digest 作为 provenance；消费门禁比较 sampling digest 与最终副权重 digest，因此仅主偏好改变不会使副分布失效。正式生产产物未写入。

## 验证证据

- pnpm check：最终通过，Svelte 0 errors / 0 warnings，scripts 与 API TypeScript 通过。收尾发现并修正测试 fixture 的类型推断问题。
- V2 数学／映射／normalization／双语 UI、Manifest、sparse、玩家集成、V1 presentation 及共享随机／Benchmark 定向 unit/integration：14 文件、96 用例通过；最后修正后受影响的 2 文件、10 用例再次通过。未执行全仓回归。
- 全部变更／新增 TS、Svelte 的定向 ESLint，以及 TS、Svelte、JSON 的 Prettier 检查通过；git diff --check 通过。
- pnpm relic-score:v2:profiles:generate 和 pnpm relic-score:v2:validate：结构／语义验证通过，明确报告 98 角色／1 blocker，publication blocked。
- pnpm data:validate:build-inputs：通过，正式 pin，2417 artifacts、398002061 bytes、1090 routes。
- pnpm data:validate:full：通过，含 V2 raw 重新派生、训练及跨语言验证。保留原有配置诊断：533 个唯一缺失 TextHash、13 个 weakness/resistance 冲突，未改无关模块。
- pnpm relic-score:validate：V1 98 Profile 通过；pnpm relic-score:benchmarks:validate：V1 2744/2744 分布通过。
- pnpm build：本地 production build 通过，输出到 build。这是 V1 生产入口加 V2 UI 支持的构建，不是 V2 发布证明。
- pnpm relic-score:v2:benchmarks:generate：预期 fail-closed，原因 Rating V2 review blockers: 1505，在模拟前退出。K=64 的确定性 representation 失败测试仅是诊断，不是正式分布或正式 gate 成功记录。
- Playwright 桌面／移动 Chromium 的 V2 展示及 V1 兼容尝试：webServer 等待 180 秒超时，测试尚未开始；该浏览器路径未验证。遵守仓库外部工具失败停止规则，没有反复重试或替代绕行。
- 首次沙箱内 pnpm 遇 Windows realpath EPERM；执行权限升级后使用相同项目命令完成验证。没有自动审批拒绝或网络绕行。

浏览器人工补验：本地 preview 就绪后，分别在桌面和移动宽度用测试 version 3 响应打开玩家角色页，确认主／副贡献可见、Soft/Hard 不出现、HEAD/HAND 无主适配度、普通槽显示适配度／完成度、副权重和次数对应正确，且只发一次 Player 请求。测试代码在 player-character.spec.ts，grep 为 V2|presents relic scores。

## Blocker、残留工作与复现

1505 推荐 NECK PhysicalAddedRatio 映射到缺失 DamageAddedRatio。原始 missing、blocked policy 与 anomaly 保留，不从模板、推荐身份或猜测填权重。需要维护者提供可追溯的数据修正／明确评分政策决定；本轮没有替维护者决定。

未完成：正式全量 V2 分布及审计、实际 α 比较和建议、生产 loader／Enka 入口切换，以及旧 V1 模板、审批／校准工具、阈值类型／文案／测试和 legacy UI 删除。这些仍被 V1 生产路径消费，不能在 blocker 存在时删除；V2 路径本身不消费它们。

关闭 blocker 后按顺序运行 Profile 验证、全量候选生成、候选审计验证、α 比较；固定 α=0.35。全部通过后，下一次明确迁移须将 Profile/Benchmark/loader/API 同时切换并清理旧消费者，不允许静默 fallback 或混合分布。factory 的显式 production 模式检查全角色闭包、review blocker 和非 prototype 分布。

PowerShell 本地复现（已准备正式 sparse source）：

```powershell
$env:HSR_DATA_ROOT = (Resolve-Path '.upstream/TurnBasedGameData').Path
pnpm data:sync
pnpm relic-score:v2:profiles:generate
pnpm relic-score:v2:validate
pnpm relic-score:v2:inspect --character=1505
pnpm relic-score:v2:benchmarks:generate # 当前必须在 1505 blocker 处失败
pnpm relic-score:v2:benchmarks:validate
pnpm relic-score:v2:alpha-compare
```

最后两项当前也不能产出成功结果；比较工具和未执行状态见 [α 报告](relic-rating-v2-alpha-comparison.md)。last-run.json 是失败／阻塞记录，不能当成成功审计。没有 commit、push、合并或部署。
