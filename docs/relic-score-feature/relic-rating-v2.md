# 遗器评分 V2 数学与维护契约

本文件是 V2 候选实现的规范。生产目前继续使用 V1；1505 推荐物伤球却缺少主偏好，阻止全量 V2 Benchmark 与生产切换。历史调查中的候选建议不覆盖本规范。

## 来源和映射

输入来自 upstream.lock.json 锁定的 TurnBasedGameData，经共享 source registry、lossless raw adapter 和 locale-neutral 派生，进入 Manifest schema 52 的 runtime/relic-rating-v2.json。Profile schema 5 记录实际 source SHA、八份来源的字节 SHA-256、主／副映射版本、U 版本与语义 digest。生产不读取相邻仓库。

两份 AvatarValue 提供独立主、副类别偏好；两份 BaseValue 只校验类别到 canonical key 的完整映射，不作为额外乘数。regular/LD 与推荐表必须闭包一致；未知额外 LD 权重源、重复身份、未知字段、非法数值或元素枚举使生成失败。

固定 HP/ATK/DEF 与百分比使用独立 key。主词条只输出 registry 中合法的 key，不输出没有合法主槽的 DefenceDelta。三种 Flat 副词条的最终权重是对应类别偏好乘精确 4/9；百分比不折扣。其他副词条直接使用类别偏好。4/9 是本评分器政策，不宣称复刻官方公式。

伤害球只适用于角色本属性，显式接受 raw Thunder 与 domain Lightning 并映射到 ThunderAddedRatio。其他元素球是 inapplicable，权重零；推荐跨属性球必须复核。

present 保留真实偏好，包括显式零。missing 保留缺失状态；非推荐缺失适用 nonrecommended-missing-zero-v2。推荐缺失标为 blocked-recommended-missing-v2，角色不可评分，其零值仅是候选序列化占位，不参与归一或评分。非法输入被拒绝，不产生可消费的 Profile。推荐集合始终独立。

## 单件和配装

普通可变槽：M=max(合法、适用、present 的主权重)，要求 M>0；a=wMain/M；Q=clamp(actualMain/fiveStarPlus15SameSlotSameKey,0,1)。

副效用 U=Σ(actualSub/highRollReference)×effectiveSubWeight。运行时解释与离线生成共用 U，不再次对 Flat 数值或 reference 折扣。P 是实际主词条条件下 Lens B CDF 百分位，不是理论上限百分比。

- 普通可变槽：pieceNormalized=0.35×a×Q+0.65×P。
- HEAD/HAND：pieceNormalized=P；适配度、主完成度为 null，主贡献零。
- 1506 NECK/OBJECT：显式角色 agnostic，pieceNormalized=P；与固定部位使用不同 mode 和理由。
- pieceScore=100×pieceNormalized，成功值限定 0–100；不确定输入明确 unavailable。

Effective Hits 只累计推荐副词条的真实 provider 次数。未推荐正权重可以增加 U，却不能增加 hits；次数不确定保留 partial/unavailable。

六槽权重为 0.1/0.1/0.2/0.2/0.2/0.2。主、副贡献分别加权一次，相加得到 statCompletion；FinalBuildScore=100×clamp(0.95×statCompletion+0.05×SetIntegrity)。Set Integrity 沿用 V1 的纯套装逻辑。Soft/Hard、面板阈值和 modifier 不属于 V2。普通完整配装在 statCompletion 内有效 Main/Sub 是 28/72，更多 agnostic 会减少主份额；Stat/Set 份额另行应用。

## 接口和分布

V2 normalization 只接收 canonical character build 与可信 runtime affixes。光锥、行迹或面板合成失败不阻止可解析遗器评分。共享 panel synthesis 继续服务玩家面板。

presentation 为 version:3、algorithmVersion:2。单件包含 mainMode、mainSuitability、可选 mainCompletion、主／副贡献、U、P、hits 与真实副权重解释；Build 包含 statCompletion、加权主／副贡献、Set Integrity 和 hits。没有 accepted/mismatch、Soft/Hard 或 panel-unavailable 字段。

Benchmark schema 4 保留实际主词条条件、Lens B、N=3、K=65536、seed=123456789、mulberry32-v1、逐分布重置 seed、原自然强化生成器和右连续线性 257 点表示，误差门槛 0.005。副权重、Flat／副映射／U 语义、概率和 reference、随机算法、采样参数及表示契约进入分布 identity；主合成、主映射、α、套装和展示不进入副分布 identity。

全量候选生成先通过来源与人工异常门禁，再通过覆盖、identity、数值、单调性和 representation gate。失败不改生产产物，不切换 513 点，不混用 V1/V2。审计校验要求实际候选 bytes/hash、分布生成来源、sampling digest、副权重 digest、覆盖数和 gate 结果一致。完整 Profile semantic digest 保留为生成时的 provenance，不用于主偏好变化后的副分布消费门禁。来源 SHA 变化本身也不代替实际输入 identity。运行时完整验证后复用缓存，并逐件核对副权重和条件 identity。

## 命令和切换

配置 HSR_DATA_ROOT 为已准备的正式 pin 后：

```text
pnpm data:sync
pnpm relic-score:v2:profiles:generate
pnpm relic-score:v2:review
pnpm relic-score:v2:validate
pnpm relic-score:v2:inspect --character=1505
pnpm relic-score:v2:score --input=canonical-build.json
pnpm relic-score:v2:benchmarks:generate
pnpm relic-score:v2:benchmarks:validate
pnpm relic-score:v2:alpha-compare
```

候选与运行记录在 data/relic-score/v2/；审核报告在本目录。V2 没有 approve-current 或 skip-gate 参数。score 输入是 canonical build，不是带面板的旧 normalized fixture；缺分布返回 version 3 unavailable，不套用 V1。

维护者须先处理 1505，再生成并校验全量候选、完成 α 比较，然后在同一次可审查迁移中切换生产 loader 和 Enka 管线、发布整套产物、删除仍为 V1 服务的模板／阈值／审批工具与 UI 分支。正式 α 保持 0.35，修改比例需要新的维护者决定。当前不提供自动生产切换、提交或部署命令。
