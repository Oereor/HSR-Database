# 遗器评分 V2：上游权重与评分架构调查

调查日期：2026-10-10（Asia/Shanghai）。网站分支：`develop`。

任务依据：工作区 `Relic-Score-02/Relic-Score-V2-Investigation.md`。本轮只新增本报告，没有实施 V2、修改配置或生成产物、审批 Profile、重新模拟 Benchmark、提交或推送 Git。以下网站代码路径相对于 `HSR-Database/`，`../TurnBasedGameData/` 表示只读的相邻数据仓库。

证据标记：**事实**表示已由当前文件、统计或代码证实；**推断**表示有数据支持但未找到完整消费者；**未知**表示证据不足；**待决**表示产品／数学政策。推荐方案均是下一轮讨论的输入，不是已批准的数学模型。

## 1. Executive Summary

**具备引入上游角色权重的条件，但尚不具备直接复刻“官方评分算法”的证据。** 本地两份 AvatarValue 表各覆盖 98 个 AvatarID，与 98 个当前生成 Profile 的 ID 集完全一致，包含 regular 94 个与 LD 4 个角色。当前锁文件、缓存 checkout、生成 Manifest 和 Profile 的来源 SHA 不一致，锁定提交中的具体表内容尚未读取成功；本地覆盖完整不能代替锁定版本验证。

调查发现的不只有两份角色权重表：`RelicMainAffixBaseValue`、`RelicSubAffixBaseValue`、`RelicSetBonusValue` 和客户端 `Relic_Recommend_*` 常量共同提供了词条类别价值、Flat 差异、套装条件分数和推荐评分参数的线索。**不能写成“没有 Flat 或套装数值配置”。** 但没有找到游戏客户端计算代码，不能证明它们的组合公式、单位、作用顺序或完整用途。

当前 98 个 Profile 都有可观察的显式副词条权重差异。以九类不含 Flat 的对应属性统计：768 项上游显式值中，95 项一致、673 项不同；其中 416 项旧模型为零、新表为正。另有 114 项字段缺失，不能未经政策确认当作零。上游偏好更完整，但其相对权重与手工模型并不等价，也不能仅凭完整性认定其更适合我们的评分。

建议的架构方向是：上游提供属性偏好，纯映射／价值变换模块形成最终权重；Effective Hits 独立读取推荐集合；Monte Carlo 保留现有随机模型、实际主词条条件、Lens B 最大副词条效用和 CDF 定义；连续主词条只在单件评分合成中评价；Build 移除 Soft/Hard Target；套装完整性暂时保留。

已确认的产品方向：Effective Hits 与评分权重解耦；考虑连续主词条；Flat 贡献应显著低于百分比但系数未定；调查彻底移除 Soft/Hard Target 的影响；没有可靠替代公式时保留 Set Integrity。待维护者决定的是主词条公式与归一化、Main/Sub 份额、Flat 价值变换、缺失字段政策、固定主词条和 agnostic 例外、自动派生 Profile 的审核方式。

## 2. Source Investigation

### 2.1 版本、来源与证据边界

首先阅读了 `AGENTS.md` 和规范性架构文档 `docs/architecture/localization-and-data-generation.md`。历史调查仅用于解释设计目的，当前行为以代码及磁盘产物为准。

| 来源 | 当前证据 | 可得结论 |
| --- | --- | --- |
| `upstream.lock.json` | TurnBased pin：`312b4597691e0a29cf9828a15b592757dba86949`；资产 pin：`dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487` | 是部署锁定目标，不能当成本地 HEAD |
| 相邻 TurnBasedGameData | HEAD：`724b139d8c9c32d12552eb95745a4fee72bfe48b`；提交标题：`OSPRODWin4.6.0_D16707949_A16704710_L16700845` | 本报告权重统计的实际快照 |
| 网站 `.upstream/TurnBasedGameData` | HEAD：`8b178dd48698e5e7b12f0cc319ddab149f2ffc5c`；标题：`OSPRODWin4.6.0_D16688351_A16684237_L16658846` | 缓存未处于当前 lock 的 SHA |
| 缓存 materialization | sparse 清单没有两份 AvatarValue、两份评分 BaseValue 或 SetBonusValue；磁盘上两份 AvatarValue 缺失 | 只证明没有 materialize，不能证明该提交的完整上游不存在表 |
| `src/lib/generated/manifest.json` | schema 51；来源为上述本地 `724b…`，版本 4.6.0 | 普通生成数据采用本地快照 |
| `generated/character-profiles.json` | schema/generator 4；全部 98 项 metadata 来源 `6b2bc17ebf461e497ba0dd0ffd44875f1866762b`；均为 reviewed，input/review digest 相同 | Profile provenance 与当前 Manifest 不同；不能据历史报告说“98 项仍待审” |
| 正式 Benchmark | schema 3；`lens-b-main-conditioned-v2`；SHA-256 与历史生成审计相同 | 评分 V1 已使用名字含 v2 的条件 Benchmark；它不是本轮拟议评分 V2 |

本地锁定对象检查未成功读取提交／树，因此本轮不能给出锁定 SHA 的游戏版本、权重数值或覆盖结论。前期一次缓存 `git cat-file` 探测触发 partial-clone 的隐式联网，因 DNS 失败而停止，未取得远程数据；这次尝试没有按项目代理要求执行。后续设置 `GIT_NO_LAZY_FETCH=1`，只做本地对象／树探测，不再联网、fetch、checkout 或更新 lock。下一轮应在明确准备来源的步骤中核实锁定表；若必要联网，先验证 `7890` 代理并显式使用它。

本地两份文件的字节摘要：

| 文件 | SHA-256 |
| --- | --- |
| `RelicMainAffixAvatarValue.json` | `7190060e1ebc0c76069034c913d2fb95cf0fb0fc25cafaced383d995c8bfdae6` |
| `RelicSubAffixAvatarValue.json` | `57a41534befb187995860c2c83a425285732c912f18c940b9b1ce14cbc455c0f` |

### 2.2 完整观察 schema

两份文件均为 JSON 数组，记录无嵌套字段、无 schemaVersion、无部位／等级／星级／星魂／光锥／队伍字段。`AvatarID` 是每条必有的正整数；属性字段是可缺省的 JSON 数值。以下列出本快照出现的全部字段，不把“可缺省”解释为“已知零”。

| 字段 | 主表存在数／98 | 副表存在数／98 | 主表显式值域 | 副表显式值域 |
| --- | --- | --- | --- | --- |
| AvatarID | 98 | 98 | 正整数 ID | 正整数 ID |
| Attack | 82 | 82 | 0.1–1 | 0.1–1 |
| HP | 98 | 98 | 0.1–1 | 0.1–1 |
| Defence | 97 | 97 | 0.1–1 | 0.1–1 |
| Speed | 98 | 98 | 0.1–1 | 0.1–1 |
| CriticalChance | 82 | 82 | 0.1–1 | 0.1–1 |
| CriticalDamage | 89 | 89 | 0.1–1 | 0.1–1 |
| StatusProbability | 27 | 27 | 0.1–1 | 0.1–1 |
| StatusResistance | 不存在 | 98 | — | 0.1–1 |
| BreakDamage | 97 | 97 | 0.1–1 | 0.1–1 |
| DamageAddedRatio | 90 | 不存在 | 0.1–1 | — |
| SPRatio | 92 | 不存在 | 0.8–1 | — |
| HealRatio | 9 | 不存在 | 全部为 1 | — |

**事实**：两表各 98 个唯一 ID，无重复记录 ID、重复 JSON key、非法数值类型、负数、非有限值或大于 1 的权重；没有显式零，也没有 null。主表共有 861 个显式属性值，11×98 的潜在矩阵有 217 项未出现；副表共有 768 个，9×98 的潜在矩阵有 114 项未出现。字段稀疏属于观察到的结构，不等于业务异常。

| 显式权重 | 主表频数 | 副表频数 |
| --- | --- | --- |
| 0.1 | 304 | 365 |
| 0.2 | 4 | 32 |
| 0.4 | 47 | 22 |
| 0.6 | 30 | 23 |
| 0.8 | 68 | 39 |
| 0.88 | 2 | 0 |
| 0.9 | 8 | 4 |
| 1 | 398 | 283 |
| 合计 | 861 | 768 |

权重是离散偏好值，不能套用旧 `ALLOWED_WEIGHTS=[0,0.25,0.5,0.75,1,1.25]`。主表两项 `0.88` 均为 LD 的 Saber／Archer 的 `SPRatio`，不是解析误差；不能四舍五入到旧档位。

### 2.3 regular／LD、ID 及推荐覆盖

`AvatarConfig` 与 `AvatarRelicRecommend` 各 94 条；对应 LD 表各 4 条，ID 为 `1014`、`1015`、`1508`、`1509`。合并后 98 个 ID，与两份权重表、Profile 和 Manifest 角色路线 ID 集相同，无漏项或额外项。未发现 `RelicMainAffixAvatarValueLD.json`／`RelicSubAffixAvatarValueLD.json`；当前 LD 权重已经在普通 AvatarValue 文件中。

既有 `scripts/data/character-sources.ts:loadCharacterDomainTables` 合并 regular／LD；`raw.ts:mergeConfigSources` 对同 identity 的相同记录去重、冲突报错。新增来源要沿用覆盖闭包及冲突检查，不应推断以后也永远只有两份普通表。若未来出现 LD 权重源，须显式加入来源清单并检测冲突。

ID 使用 `String(AvatarID)` 对接 `characterId`／domain `id`；例如多命途开拓者仍分别为 `8001` 等 ID。不能按名字、基础角色或命途合并权重；增强形态没有独立的 AvatarValue 维度，不能自动声称覆盖不同实战玩法。

**事实**：当前 353 项推荐副词条均有对应上游字段；592 项推荐可变主词条中，有 1 项缺少对应字段：绯英 `1505` 推荐 `PhysicalAddedRatio`，但主表省略 `DamageAddedRatio`。另外 4 项推荐主词条的值仅为 0.1：佩拉的 HP 球、爻光的 HP／DEF 球、砂金•戏浪的 HP 球。可见推荐集合、正权重和优质主词条不能视作同一概念。

### 2.4 主副同类偏好差异与低权重

主副共有的八类字段中，670 个双方显式存在的“角色×字段”有 627 项相同、43 项不同；共享字段的缺失模式相同。Speed 的 98 项全部一致；HP、Defence 各有 16 项不同；Attack 1 项；双暴各 2 项；StatusProbability 2 项；BreakDamage 4 项。

例：花火、知更鸟主词条 HP／DEF 为 0.4，副词条为 0.2；三月七 `1003`、旧银狼 `1006` 的 Break 主权重 0.4、副权重 0.1；万敌 `1406` 命中主 0.6、副 0.1；`1501` Attack 主 0.8、副 1。**不能用副表自动推导主表或只维护一套权重。**

将九类副字段对照推荐集合，365 项 0.1 全部不属于推荐集合；非推荐的正值共 416 项，其余为 32 项 0.2、17 项 0.4、2 项 0.6。**推断**：0.1 很像非首选属性的低收益标记；但不能将所有非推荐值强制改为 0.1，也不能当作 Effective Hits 依据。主表的推荐低值和缺失反例进一步证明，“缺失=不推荐=零”并不成立。

### 2.5 与当前 Profile 的对照统计

统计将旧 Profile 未配置的 key 按当前 `scorePiece` 的 `??0` 视作零；上游缺失单列，不计入显式值一致／差异。九类口径中 Attack／HP／Defence 只对应百分比；另给出十二类的 **Flat 与同类共用权重的临时比较口径**，它不是拟定的 Flat 处理方案。

| 项目 | 九类直接对应 | 十二类（Flat 暂共用同类权重） |
| --- | --- | --- |
| 角色数／ID 覆盖差异 | 98／无 | 98／无 |
| 潜在角色×属性组合 | 882 | 1,176 |
| 上游显式存在 | 768 | 1,045 |
| 上游缺失，不推定零 | 114 | 131 |
| 显式值与旧权重一致 | 95 | 95 |
| 显式值与旧权重不同 | 673 | 950 |
| 旧零、上游显式正值 | 416 | 692 |
| 旧正值且不同 | 257 | 258 |
| 至少一项显式差异的角色 | 98 | 98 |

现有 353 项正权重中，只有知更鸟的 `AttackDelta=0.5` 属于三种 Flat；其余 352 项属于九类对应属性。所有上游缺失组合的旧值均为零，但这只是当前数据相关性，不能证明缺省的游戏语义。

人工配置统计：98 个角色都有 `reviewedInputDigest`；31 个角色有 `statWeights`，共 82 个显式权重配置，其中 17 项等于上游对应值、65 项不同；11 个有 template override、13 个有 scaling override、16 个有 Soft Target、7 个有 Hard Breakpoint、2 个有主词条例外。Soft／Hard 的角色集合不重叠，共 23 个。

**预计可移除范围**：若维护者接受上游作为 V2 偏好来源，31 个角色的 82 项手写偏好可以整体退出维护体系；这并不是 82 项保持原分值的等价替换。Template／scaling 推断也可退出权重链路。不能凭统计证明未来还需几个人工副权重例外；本轮没有证实必须新增任何副权重例外。已知主词条讨论对象至少有长夜月、银狼 LV.999，以及绯英的缺失字段；推荐低值角色需复核政策，不立即加入大规模手写覆盖。

### 2.6 代表性角色比较

下表用短属性名表示规范化副词条；`—` 表示上游字段缺失。除特别注明 Flat 外，ATK／HP／DEF 为百分比。

| 角色与类别 | 当前 → 上游副权重 | 关键主词条／架构影响 |
| --- | --- | --- |
| 希儿 1102，直伤 DPS | ATK 1→1；双暴各 1.25→1；SPD 0.75→1；HP／DEF／RES／Break 0→0.1 | 双暴相对速度的排序改变；主双暴／ATK／本属性伤害均 1，ERR 0.8；不能保证新排名与旧评分相同 |
| 刃 1205，HP DPS | HP 1→1；双暴 1.25→1；SPD 0.75→1；ATK 等低收益项从零变 0.1 | 上游可以表达 HP 偏好；Flat HP 仍需单独价值政策 |
| 知更鸟 1309，辅助 | ATK% 0.75→1；Flat ATK 0.5→待折扣的 Attack=1；SPD 1.25→0.6；HP／DEF 0→0.2；RES 0→0.4；双暴— | 主 ATK／伤害／ERR 为 1，SPD 为 0.6，HP／DEF 为 0.4；旧模型强调 SPD 的主观偏好被显著改变 |
| 三月七·存护 1001，生存／控制 | DEF 1→1；SPD 1→1；命中 0.75→0.8；RES 0.5→0.8；其他多项 0→0.1 | 连续主权重区分 DEF／SPD=1、命中／ERR=0.8 与其他 0.1 |
| 白露 1211，生存 | HP 1→1；SPD 1.25→1；RES 0.75→1；DEF／Break 0→0.1；ATK／双暴／命中— | 主治疗／HP／SPD／ERR 都为 1；省略字段不能直接解释为已知无收益 |
| 风堇 1409，特殊生存 | HP 0.75→1；SPD 1.25→1；CD 0.5→0.6；RES 0.25→0.4 | 当前 hard SPD≥200；套装 125 的静态 2 件加速和条件 4 件加速不同，OOC 固定阈值无法表达后者 |
| 长夜月 1413，特殊机制 | 双暴 1.25→1；HP 1→1；SPD 0.25→1 | 当前 `addAccepted.OBJECT=SPRatioBase`；新主表 ERR=0.8，可连续表达“有收益但次于 HP=1”，可能不再需要二元增补 |
| 银狼 LV.999 1506，特殊机制 | 双暴 0.75→1；SPD 1.25→1；HP／DEF 0→0.2；其他低值项新增 | 当前球／绳 agnostic；新主表 HP／DEF=0.4、ATK／Break=0.1，伤害／ERR 缺失；正值并不能自然表达退出主词条评价 |
| 昔涟 1415，忆灵机制 | HP 0.75→0.8；CR 0.75→0.8；CD 0.5→0.8；SPD 1.25→1 | 当前 hard SPD≥180；主 HP／双暴 0.8、伤害 0.6，按槽最大值归一会把 BODY 的 0.8 提升为 1，必须明确这种语义 |
| Archer 1015，LD | ATK 1→1；CR 1.25→1；CD 1→1；SPD 0.25→0.8 | 覆盖 LD 不意味着匹配旧人工策略；主 ERR=0.88 应保留原始精度 |

这些比较只展示数据差异，不证明实战哪套权重更优。也没有以主观玩法攻略给上游添加新的角色分支。

## 3. Stat Mapping 与 Flat 属性

### 3.1 完整映射矩阵

`stat-registry.ts:RELIC_STAT_REGISTRY` 提供 21 个合法内部 key，`player/property-semantics.ts:PLAYER_PROPERTY_SEMANTICS` 提供面板 target 和 base／ratio／flat／direct bucket。更关键的直接证据是两份 `Relic*AffixBaseValue` 的 `Type→Relic*Affix` 关联：上游已经明确 Attack 同时关联 `AttackDelta` 和 `AttackAddedRatio`，不是仅凭字段名猜测。

| 上游类别 | 内部 key／面板 target | 主词条合法部位 | 可作副词条 | 映射证据与限制 |
| --- | --- | --- | --- | --- |
| Attack | `AttackDelta`／atk(flat)；`AttackAddedRatio`／atk(ratio) | Flat 仅 HAND；百分比 BODY／FOOT／NECK／OBJECT | 两者均可 | 一对多，BaseValue 表直接关联；共享偏好不等于共享价值 |
| HP | `HPDelta`／hp(flat)；`HPAddedRatio`／hp(ratio) | Flat 仅 HEAD；百分比四个可变槽 | 两者均可 | 同上 |
| Defence | `DefenceDelta`／def(flat)；`DefenceAddedRatio`／def(ratio) | Flat 无合法主槽；百分比四个可变槽 | 两者均可 | 主 BaseValue 中有 DefenceDelta，但 registry／实际遗器无此合法主词条，必须拒绝输出该主 key |
| Speed | `SpeedDelta`／spd | FOOT | 是 | 直接关联；不能映射成 `SpeedAddedRatio`（该 key 仅属面板语义，非遗器词条） |
| CriticalChance | `CriticalChanceBase`／crit_rate | BODY | 是 | 直接关联 |
| CriticalDamage | `CriticalDamageBase`／crit_dmg | BODY | 是 | 直接关联 |
| StatusProbability | `StatusProbabilityBase`／effect_hit | BODY | 是 | 直接关联 |
| StatusResistance | `StatusResistanceBase`／effect_res | 无 | 是 | 副表／副 BaseValue 直接关联；禁止生成主词条 |
| BreakDamage | `BreakDamageAddedRatioBase`／break_dmg | OBJECT | 是 | 直接关联 |
| DamageAddedRatio | `PhysicalAddedRatio`／physical_dmg；`FireAddedRatio`／fire_dmg；`IceAddedRatio`／ice_dmg；`ThunderAddedRatio`／thunder_dmg；`WindAddedRatio`／wind_dmg；`QuantumAddedRatio`／quantum_dmg；`ImaginaryAddedRatio`／imaginary_dmg | 全部仅 NECK | 否 | 主 BaseValue 将七元素都关联同类别；决定哪些元素获得角色权重仍需产品政策／角色 DamageType |
| SPRatio | `SPRatioBase`／sp_rate | OBJECT | 否 | 主表专有，直接关联 |
| HealRatio | `HealRatioBase`／heal_rate | BODY | 否 | 主表专有，直接关联 |
| AvatarID | `characterId` | — | — | 身份字段，非评分属性 |

**建议／待决**：DamageAddedRatio 默认只赋给角色本属性球，其他元素设定为已定义的不适用值；依据 AvatarConfig.DamageType／domain element，而不是名字。`Lightning` 在 domain 对应 `ThunderAddedRatio`，要用显式枚举映射。BaseValue 的七元素共享 Type 本身没有证明客户端也采用“只限本属性”的政策；混合属性、忆灵或其他特殊机制应在有证据时以少量显式例外表达，不能把一对多映射无条件复制为七球同权重。

不需新增 `RelicStatKey` 来代表泛化 Attack／DamageAddedRatio；它们适合保留在输入分类层。建议新增输入状态（如 present／missing／inapplicable）和偏好／最终权重的区分，避免缺失、数值零、合法性三者混淆。未知类别、未知 DamageType、全槽无可归一权重须显式诊断，不能生成一个看似有效的零分 Profile。

### 3.2 缺失值与解析边界

已知缺失并不等于 JSON `0`。合理候选解释是导出省略默认零、不适用或未知收益；没有找到原始类型默认值和消费逻辑，无法排除其中任何一种。绯英的推荐物伤缺失尤其不能仅凭“不推荐”解释。

建议保留原始缺失状态，下一轮明确采取严格异常阻止、缺失按零但输出诊断，或有证据的推荐 fallback；推荐优先检查“推荐属性缺失”和角色全零等异常，不用旧模板静默补齐。若最终选择缺失零，须将该政策作为我们评分器的定义记录、版本化，而非写成已经证实的上游语义。

`scripts/data/raw.ts:materialize` 会将非安全整数数值保留为字符串；新权重通过该 parser 时必须显式转换并验证有限数值。可使用 `numberOf` 作为转换入口，但不能只依赖其 fallback，不检查缺失而把未知值吞为零。TextMap hash 仍按现有规则保留字符串；本轮 Python 读取小型权重表的统计不替代生产 lossless parser。

### 3.3 Flat 高档当量为何会失真

当前运行时 `score.ts:scorePiece` 和离线 `farming/prototype.ts:rawSubUtility` 均使用：

```text
H[k] = 五星该副词条 BaseValue + StepNum × StepValue
e[k] = 实际词条数值 / H[k]
U = Σ e[k] × W[k]
```

一次高档 Flat ATK 的 `e=1`，一次高档 ATK% 的 `e=1`。如果两个 key 都直接使用 Attack 权重 1，各贡献 1；不同物理单位已经被各自的 H 消去。问题不在采样器，而在最终效用的跨词条价值标尺。

真实面板的 `atk=base×(1+ratio)+flat+direct`（`stat-synthesis.ts:finalizePlayerStats`）意味着 ATK% 的绝对增量取决于角色与光锥基础攻击，Flat ATK 的增量不随基础攻击变化。高档当量相同不等于实际收益相同。不能把 AttackDelta 与 AttackAddedRatio 合并成同一个 key，否则还会错误排除合法共存的主副词条。

### 3.4 上游价值线索及可选变换

**事实**：`RelicSubAffixBaseValue` 有 12 条完整的副词条类别关联；三种 Flat 的 BaseValue 均 1.728，三种百分比均 3.888，比值 `4/9≈0.444444`。Speed 为 4.6；双暴／Break 为 4.374；命中／抵抗为 3.888。主 BaseValue 有 20 条，Flat 为 `5.12+1.792×level`，百分比为 `6.912+2.4192×level`，相同比例约 `20/27`，与副表不同。这些数值并非 `RelicMainAffixConfig`／`RelicSubAffixConfig` 中的实际面板成长值。

**推断**：这是跨属性价值／评分标尺的有力候选证据，尤其支持 Flat 应更低。但未知这些基准对应什么 roll 档位、是否按实际值／基础值换算、是否受等级或稀有度修正；不能直接把 `4/9` 宣布为“官方 Flat 折扣”。主表还包含不合法的 DefenceDelta 主词条，更说明不能全盘照搬字段库存。

| 候选 | 数学定义 | 优点 | 风险／复杂度 |
| --- | --- | --- | --- |
| 全局 Flat 折扣 | `W[flat]=d×w[type]`，百分比 `W=w[type]`，`0≤d<1`，值待决 | 最小改动，不需角色手写权重；可将上游 4/9 作为候选依据 | 同一 d 不代表每个角色实际收益；需讨论是否“显著低于”已满足；低复杂度 |
| 分类折扣 | `W[flat-X]=dX×w[X]`，X 为 HP／ATK／DEF | 只需三个全局参数，能区分类别 | 本快照三个上游比值相同，没有支持不同 dX 的直接证据；增加主观参数；低至中复杂度 |
| 基于实际收益换算 | `W[flat-X]=w[X]×Hflat/(BX×Hratio)`，BX 为明确的基础属性 | 相同属性类别按绝对增量对齐 | 必须决定 BX 取固定角色等级／光锥还是玩家装备；玩家依赖会令同角色 Benchmark 失效；还不等于完整伤害／生存收益；高复杂度 |
| 上游类别价值全量变换 | `W[k]=w[type(k)]×c[k]/cRef`，c 来自副 BaseValue，cRef 为明确公共标尺 | 不只处理 Flat，也利用双暴／Speed 的上游相对价值；避免另写每角色规则 | c 的完整消费语义未知；会再次改变旧／新偏好解释；所有受影响分布重生成；中复杂度 |

前三项及第四项均是可讨论方案。本报告倾向先讨论全局 Flat 折扣，并把完整 BaseValue 变换作为独立候选；**不选定 d，不把 4/9 写入配置**。如果未来验证了完整上游公式，再决定是否复用类别标尺。

## 4. Current Architecture

### 4.1 当前数据与运行链路

```text
HSR_DATA_ROOT（默认 ../TurnBasedGameData）/ 部署 lock + sparse preparation
  → regular/LD raw tables → domain → locale projection / generated Manifest
  → details 中 equipmentRecommendation + runtime/relic-score-recommendations.json
  → Profile generator（template inference + scaling + overrides + review digest）
  → character-profiles.json

runtime/player.json + probability-model.json + reviewed Profiles
  → 离线 Lens B Benchmark → farming-benchmarks.json

Enka decode/adapter → CanonicalPlayerProfile → OOC panel synthesis
  → normalizePlayerBuildInput → scorePlayerCharacterBuild
  → server Benchmark loader / scoreBuild / scorePiece
  → presentRelicScoreResult → presentation DTO → 卡片与配装摘要
```

推荐不是 Profile 内的主／副集合字段：`ScoringSources` 分开传 recommendation 与 profile。`scripts/data/domain/character.ts:490` 从 Set4／Set2、PropertyList3/4/5/6 和 SubAffixPropertyList 提取推荐；`sync.ts:970` 输出独立运行时推荐索引。Profile 生成读取中文 detail 中的 locale-neutral 推荐字段，不能用 StarRailRes 索引代替结构化数据源。

### 4.2 主词条三态及历史目的

`main-stat-policy.ts:resolveMainStatPolicy`：固定头／手由合法槽定义接受；可变槽的 accepted 是上游推荐、推荐且最终副权重为正的同名合法主词条、显式 addAccepted 的并集。agnostic 只来自显式槽位 override，优先于 accepted，表示退出主词条维度。

`scoring-math.ts:pieceContributions` 的实际公式：

```text
Q = clamp(实际主值 / 五星同部位同词条+15参考值, 0, 1)
P = 当前角色、部位、实际主词条的 Benchmark CDF(U)
accepted：main=0.35Q；sub=0.65P
mismatch：main=0；sub=0.65P
agnostic：main=0；sub=P；mainCompletion=null
PieceScore=100(main+sub)
```

历史 `main-stat-policy-implementation.md` 解释了三态用于扩大合理主词条和处理特殊角色，且保留强化完成度；本轮核对代码后确认上述行为仍在。历史报告中“当时全部 needs-review”已经被当前产物 reviewed 状态取代。

信息损失：accepted 将 1、0.8 与二元增补一视同仁；mismatch 把低收益与不适用都归零；agnostic 不表达偏好差异。副权重还参与主 accepted 推导，V2 若直接让所有正副权重推导 accepted，会扩大接受集合，因此连续主评价应读取独立主表，推荐集合留作展示／证据，不再代替数值评价。

### 4.3 Effective Hits 的显式分离与隐式耦合

`score.ts:calculateEffectiveHits` 只按 `recommendation.subStatPropertyTypes` 判断是否计数；精确 cnt 累加，未知次数保留 partial／unavailable。`scorePiece` 中逐词条 `effectiveHit` 同样按推荐判断，与 `rollEq×baseWeight` 分开。现有展示语义无需改变。

隐式耦合在生成与校验：`profiles.ts:resolveWeights` 只遍历推荐集合，并禁止非推荐 override；`validate.ts:validateConfig/validateProfiles` 也拒绝非推荐权重。因此现状很容易给调用方造成“正权重必是有效词条”的印象。V2 必须解除此限制，测试“非推荐正权重贡献 U 但 Effective Hits=0”，同时不将推荐集合改成所有正权重集合。

### 4.4 当前 Build 数学

`score.ts:scoreBuild` 直接汇总每件的 mainContribution／subContribution／pieceNormalized，不再按历史版本重建二元主分量：

```text
B = Σ slotWeight × pieceNormalized
slotWeight：HEAD/HAND各0.1，BODY/FOOT/NECK/OBJECT各0.2
T = (95B + 8Is×SoftProgress + 5Ih×(1−HardFailure)) / (95+8Is+5Ih)
Core = 100(0.95B+0.05SetIntegrity)
Final = clamp(100(0.95T+0.05SetIntegrity), 0, 100)
```

Is／Ih 表示是否有相应配置。主词条公式迁移必须继续单件／配装共用贡献，防止 agnostic 被再次乘 Sub 份额。

## 5. Main Stat Design Alternatives

### 5.1 候选公式的公共定义

令 `w(c,s,k)` 为映射后的原始主偏好。候选示例采用部位内归一：`a=w/max(w of applicable legal mains)`；最大值须大于零。HEAD／HAND 由于无选择，候选默认 `a=1`，保留 Q；agnostic 槽默认 `S=P`。所有未知字段先经过明确的缺失政策，不能在归一时无声补零。

部位归一是**待决选择**，不是事实：它让每槽最优主词条有 a=1，但会把昔涟 BODY 的 0.8、银狼 LV.999 球的 0.4 提升到 1，抹去上游跨槽绝对差异。另一个候选是直接用原始 `a=w`（当前显式值在 [0,1]），保留原始差异但某些槽永远达不到满主分。两者均需讨论，不应自动把 raw w 当“百分比收益”。

令 `α∈[0,1]` 为全局份额，Q 保留当前实际值／五星+15定义，P 保留条件 CDF。三个候选均满足 `0≤S≤1`，单件分为 100S：

| 候选 | 数学公式（普通槽） | 评价意义与主要代价 |
| --- | --- | --- |
| A：主分连续加权 | `S=αaQ+(1−α)P` | 最接近现有主、副贡献；低收益主不会抹去好副词条；α 仍是独立主份额；P=0 时仍有主完成度分 |
| B：适配限制整体分 | `S=a[αQ+(1−α)P]` | 次优主也降低副词条贡献；低权重主分数上限明显降低；副质量与适配重复耦合，a=0 整件为零 |
| C：主完成度调制副质量 | `S=[(1−α)+αaQ]P` | 最优满级主时整件分=P，没有固定主词条起评分；α 是最大适配／完成度惩罚幅度，不再是可独立相加的 Main/Sub 份额 |

建议优先讨论 A：它最小化副质量定义变化，也最容易向现有贡献字段迁移。B／C 是明确可实现的替代，不是拟实施公式。采用 C 时必须重定义 DTO 中主贡献的解释，不能仍宣称固定 35/65 两个独立维度。

### 5.2 同一数值示例下的行为

以下仅用旧 `α=0.35` 与 `P=0.8` 演示，并未确认 V2 份额。低星／未强化行的 Q=0.5 是抽象示例，不宣称具体某星级+0必然为此值。

| 情形 | a | Q | A 分数 | B 分数 | C 分数 |
| --- | --- | --- | --- | --- | --- |
| 最优主词条 | 1 | 1 | 87.0 | 87.0 | 80.0 |
| 次优主词条 | 0.8 | 1 | 80.0 | 69.6 | 74.4 |
| 低权重主词条 | 0.1 | 1 | 55.5 | 8.7 | 54.8 |
| 已确定不适用／零值 | 0 | 1 | 52.0 | 0.0 | 52.0 |
| 固定头／手，a设为1 | 1 | 1 | 87.0 | 87.0 | 80.0 |
| 低星或未强化，最优主 | 1 | 0.5 | 69.5 | 69.5 | 66.0 |
| agnostic 槽，退出主维度 | — | 忽略 | 80.0 | 80.0 | 80.0 |

HEAD／HAND 若直接使用原始 HP／Attack 权重，会使同样五星+15固定头／手因角色偏好低而失去主分，即使玩家没有其他主选择；建议固定槽默认 a=1。若改为固定槽也退出主评价，则 S=P 且无 Q 惩罚，须另行决定，不能与“按槽只有一个选择所以归一为1”混为一谈。

agnostic 保留 S=P 意味着低星／未强化主值不会再通过 Q 扣分，这就是现有例外语义。若认为 V2 应惩罚其强化未完成，需定义一个新质量维度，而非将 agnostic 偷换成 a=1。

### 5.3 上限、可比性与例外迁移

A 的 P=1 时上限 `(1−α)+αaQ`；B 为 `a[αQ+(1−α)]`；C 为 `(1−α)+αaQ`。不应事后按此上限再归一到 100，否则会取消次优主词条的惩罚。P 跨实际主词条是相对副质量指标，不是绝对实战效用；“各部位满分可达”也不代表各部位掉率或刷取成本相等。

长夜月 ERR 的 0.8 可自然替代 addAccepted 的二元政策，但 A 的具体 ERR 分数与旧 accepted=1 不同。删除显式增补应发生在连续模型验收后，推荐展示仍可保留原推荐列表，不强行改写上游。

银狼 LV.999 的主表无法自然表达 agnostic；建议首轮保留该显式评价模式。不能因为 HP／DEF=0.4 就认定应该结束 agnostic，也不能归一成1后声称等价。绯英缺失的 DamageAddedRatio 要先明确缺失策略；本轮不新增角色数值覆盖。

主连续权重只用于以上最终合成时，不改变 U 或候选选取，无需进入 Monte Carlo。若改为主副总效用选最优、随机混合主词条比较、或用主权重过滤候选，就改变了 Lens B 的数学定义，超出本轮“保留模型”的建议范围。

## 6. Substat and Benchmark Migration

### 6.1 当前随机模型与 CDF

`farming/probability-model.ts:compileProbabilityModel` 编译真实五星 affix、配置概率、初始3／4条、档位、强化节点与元信息，并与 registry／reference 做闭包检查。`generate-natural-relic.ts:generateNaturalRelic` 副词条按 selection weight 无放回抽取，排除与主词条完全相同的 key；档位均匀取 0…StepNum，+3 时三条初始揭示第四条，其余节点等概率强化既有词条。

正式 `benchmarks-generate.ts` 对每个角色×slot×合法 actual main 重置同一 seed，生成 N=3 件同槽同主词条五星+15遗器，取三件 U 最大值，重复 K=65,536。不是“从自然主词条中刷到满意主再比较”，不包含主词条掉率／体力成本。当前全覆盖 98×28=2,744 份分布。

分布压缩为 257 点经验分位数；`benchmark/cdf.ts:lookupDenseCdf` 同值点右连续、不同点线性插值、端点 clamp。CDF 质量分是相对于“三件取最好”的概率基准，既不是有效词条个数，也不是期望伤害。可直接保留自然生成器、PRNG、最大值采样及压缩结构。

### 6.2 失效与再生成矩阵

| 变化 | 数学分布是否改变 | 生成／门禁影响 |
| --- | --- | --- |
| 某角色最终副权重或 Flat 变换改变 | 是 | 对该角色各主条件重新生成；本快照所有 98 角色都有显式差异，首次整体迁移宜完整再生成 |
| 仅整体同比例正缩放某角色所有副权重 | U 的坐标缩放，理论 CDF 排名可保持 | 当前 identity 仍变化；没有安全的缩放迁移入口，建议正常再生成，不绕过校验 |
| 连续主权重／主公式／Main/Sub份额，仅最终合成 | 否 | Profile／评分语义版本变更，Benchmark 不需模拟 |
| Soft/Hard 删除、Build份额、Set Integrity数值、UI | 否 | 调整 schema、DTO／测试与门禁；不能把审批／版本失效误说成分布失效 |
| Effective Hits 推荐集合变化 | Lens B 分布不变 | 展示与推荐 digest 改变；历史 Lens C 会受推荐主集合影响 |
| 新角色 | 新增该角色分布 | 覆盖校验不能继续接受旧产物；角色删除更新覆盖，不需重模拟其余角色 |
| 采样概率、N/K/seed、PRNG、五星参考、互斥或强化语义改变 | 是／生成契约改变 | 提升相应版本并生成、验证全部受影响分布 |
| 来源 SHA／说明文本变化而语义不变 | 否 | 更新 provenance；按有效语义 digest 判定，不因上游任意文字变化全部模拟 |

Flat 折扣应在“偏好→最终 effective weights”的阶段形成，并在运行时 U 与离线 U 中使用同一结果；不能只在运行时最后扣分，也不能只改 Benchmark。建议共享纯效用函数，消除 `scorePiece` 与 `prototype.rawSubUtility` 的重复表达；逐词条解释可从同一函数返回贡献。

HP% 主词条仍可以有 Flat HP 副词条，只有同 key 的 HP% 副词条被排除；HAND 的 AttackDelta 主则排除同名 Flat ATK，但可有 ATK%。映射类别可共享偏好，最终 key 必须保持独立。主连续评分只改变最后合成时，按实际主条件 CDF 的假设不受破坏。

### 6.3 Identity 已包含什么、还缺什么

`benchmark/identity.ts:profileScoringDigest` 当前只包含 characterId 与 substatWeights。`benchmarkIdentityDigest` 还包含 schema／generator版本、slot、actual main condition、概率模型 digest、主副参考、budget、K、seed契约、PRNG、自然生成器、Lens 与 quantile版本／点数；Lens C 另含推荐主集合。当前 Build／main override／targets 不在 Lens B identity 中，这是正确的职责边界。

**事实**：当前的数值副权重已完整进入 identity。但没有独立的 RawSubUtility 语义版本／Flat政策字段，函数实现若直接改变而仍保持同一权重和版本，将无法被自动检测。现有参考映射、互斥与生成行为同样依赖版本纪律；“所有影响分布的代码都自动哈希”并不存在。

建议：若 Flat 已完全折入规范化后的最终 substatWeights，数值 digest 可自然检测系数变化；仍需引入效用／映射语义版本来覆盖不反映在权重 JSON 中的行为变化。如果系数在运行时单独作用，则必须将完整变换 policy digest 加入 expected identity。不要把只有最终主分的参数塞入副 Benchmark digest，造成无关重生成。

分开维护 raw-source provenance／digest、派生 Profile 输入 digest、最终副权重 digest、评分合成版本。映射用到 DamageType 时应进入 Profile 的相关语义输入；只改变 DamageType／主权重、不改变副权重时，不必让全部副分布失效。

### 6.4 Review Gate、版本与自动更新

当前 `buildExpectedBenchmarkIdentity`、`scorePiece` 均要求 reviewed 且 input/review digest 相同；`validateProfiles` 重算生成预期并校验 approval；server loader 还检查 Profile 与 player runtime 角色闭包，模块实例缓存 artifact 校验。不能只删除 review CLI 而保留这些条件，否则所有自动派生 Profile 会被拒绝。

迁移需提升 Profile schema／generator并同步 loader、validator、fixture 和生成产物；阈值删除后不保留空数组伪兼容。Benchmark 如果增加效用 identity 字段，要同步 schema／generator／expected验证；保留旧量化、PRNG和自然模型版本，除非它们实际改变。当前 presentation version 已是 2，未来协议破坏性改动应另升版本（例如3），不能与“评分算法V2”编号混用。

自动更新建议先生成规范化输入并验证字段、ID闭包、有限值、合法key、推荐缺失异常和非全零权重，再按副语义digest产生过期清单；没有新 Benchmark 时明确评分不可用，不用旧 artifact 或测试 fixture。普通 data sync／CI 只报告／验证过期，仍由显式维护任务模拟；未批准自动生成耗时 Benchmark。手写例外保留来源、理由及适用输入digest，来源变化触发复核。

### 6.5 完整再生成成本与风险

当前正式文件 SHA-256：`bedf7579503c7bb1f49662ad1bdea69ccba1b506ebd6b9d4306e45210f580cd9`，本轮直接读取验证与 `phase-1e-benchmark-generation-audit.json` 相同。历史审计记录 2,744 份、544.344秒（约9.1分钟）、22,401,085字节JSON、1,317,261字节gzip、峰值RSS约332MB、heap约160MB。这是历史运行证据，不是本机／V2实测性能。

当前规模为 `2744×65536=179,830,784` 次实验、三件／次，共 `539,492,352` 件自然遗器生成，外加逐分布排序与误差评估。参数与覆盖不变时可按相同量级预算；不能保证本机同耗时。上游正权重更多会改变效用离散度与重复值结构，257点门禁仍要重验。

现有 representation gate 要求训练经验CDF与压缩CDF最大误差≤0.005；旧审计全部通过、最大0.00390625，并不证明新权重仍通过，也不代表Monte Carlo抽样误差≤0.005。超过门禁时 513点仅诊断，当前 validator 仍固定257点，不能自动发布513点。生成器在所有分布完成与验证后临时写JSON并rename；审计另写，并非两份文件的整体原子事务，未来失败恢复应检查产物／审计摘要一致性。本轮没有运行任何正式模拟。

## 7. Soft/Hard Target Removal

### 7.1 可删除内容与受影响调用方

| 层 | 当前实际内容 | V2删除／调整边界 |
| --- | --- | --- |
| Profile schema | `profile-types.ts` 的 ProfileBreakpoint、CharacterSoftTarget、hardBreakpoints、softTargets | 删除阈值类型／字段；升schema，修改fixture |
| Generator／override | `profiles.ts` 的 SourceBreakpoint、相关override字段、复制／排序与input digest | 移除16个soft与7个hard人工配置及阈值digest输入；其余偏好／例外单独迁移 |
| Validation／Review | `validate.ts:validateThresholds`、允许字段／逐项检查；review-core摘要 | 删除阈值专属校验／摘要；通用 finite、config闭包、主key校验须保留 |
| Scoring Config | baseStatWeight=95、softTargetWeight=8、hardBreakpointWeight=5及校验 | 阈值归一化整体退出后这三个modifier权重都可删除；保留statShare=0.95等配装合成份额 |
| Piece／Build | `score.ts:evaluateSoftTargets/evaluateBreakpoints`、解释类型、调用与Build返回字段；`scoring-math.ts:normalizedStatCompletion` | 删除；piece评分及CDF无阈值依赖，不改U |
| 输入／normalization | `types.ts:PlayerBuildInput.panel`；`normalize.ts:93` 要求synthesis完整及六项基础panel存在 | 不只删调用：需解除评分对panel完整性／合成失败的硬依赖，保留遗器本身校验和partial piece诊断 |
| Presentation／API | `presentation.ts` 的两个modifier对象；`relic-score-contract.ts` 的softTarget/hardBreakpoint及coreScore | 删除modifier字段、升DTO版本；coreScore与final相等后建议合并单一score，避免冗余语义；这是待实施契约变更 |
| API pipeline／server | `api/_player/enka/pipeline.ts`、server/relic-score/player.ts／score.ts | 评分输入可从canonical遗器独立规范化；面板显示继续走synthesis，评分异常与面板异常分开传播 |
| UI／格式化 | `PlayerRelicScoreSummary.svelte` 的阈值行／Disclosure；`relic-score-presentation.ts:formatRelicScorePanelValue` | 删除专属展示及唯一使用的格式化helper；共享Disclosure组件和普通score／hits展示保留 |
| Messages | zh-CN／en的soft_target、hard_breakpoint、passed／failed／passed_count、target_detail、breakpoint_detail、stat_unknown及contracts | 核实其他消费者后成对清理，后续正常重新编译Paraglide；本轮未改 |
| 测试／维护文档 | scoring/profiles/main-stat-policy/benchmark/farming-prototype/presentation/player-integration单测、scoring-sources fixture、player-handler与player-character E2E fixture；Profile／Benchmark维护说明与校准工具 | 删除目标专属断言，更新契约fixture；保留Benchmark与评分合成分离的不变式；历史报告标历史，不全盘删除 |

`PANEL_MISSING` 只在目标评价函数中产生，删掉目标后可删除该 scorer reason。`panel-unavailable` 目前也对应 normalization 的 NONFINITE_VALUE／MISSING_PANEL_STAT，不能只做文字替换；评分入口解耦完成后再收敛契约。NONFINITE_VALUE 还可表示非法词条数值，不能删除整个通用数值失败校验。

### 7.2 新 Build 形式和面板保留边界

移除全部modifier且保持现有其余份额时：

```text
B = Σ slotWeight × 新pieceNormalized
FinalBuildScore = clamp(100(0.95B + 0.05SetIntegrity), 0, 100)
```

无需再计算normalizedStatCompletion；core／final不再有区别，base／normalized也不应双存同值。slot权重／Stat-Set份额是否另外调参不属于阈值删除的必要动作。

**评分本身不再需要面板**，但玩家详情仍需展示HP／ATK／DEF／SPD／双暴等，`stat-synthesis.ts` 及shared property semantics、trace、lightCone和套装静态贡献仍有用途。不能删整个panel synthesis、runtime属性表或玩家面板UI。若采用玩家属性依赖的Flat实际收益方案，则会重新引入部分panel／基础属性依赖，必须作为另一个待决选择显式说明。

当前 normalize 接收 SynthesizedPlayerCharacterBuild，并要求complete及六项基础面板；删除目标而保留此入口，面板失败仍会令整套不可用。建议从canonical relics建立独立评分规范化入口，沿用已有affix查找与数值验证，panel用于显示的失败单独处理。不要靠放宽所有synthesis错误来接受未知遗器／affix。

风堇的hard SPD≥200属于当前人工规则；套装125的2件静态SpeedAddedRatio=0.06已可进入OOC合成，4件治疗触发后的6%加速由Ability表达，不能由静态panel reliably推导是否生效（数据：RelicSetSkillConfig及生成套装description）。这支持移除评分阈值的动机，但不需要证明所有阈值在任何情境无用，也不据此模拟整场战斗。

目标删除不改变现有profileScoringDigest，因此不会单独改变副分布；会改变Profile inputDigest与生成schema／review gate。独立参考阈值展示可作为未来功能讨论，但本轮建议不保留旧参数、不开新展示，避免以“仅供参考”继续维护同样的大量主观阈值。

## 8. Set Integrity Findings 与其他上游配置

### 8.1 确实存在的配置与未知消费者

| 配置 | 观察证据 | 能证明／不能证明 |
| --- | --- | --- |
| AvatarRelicRecommend regular／LD | Set4IDList、Set2IDList、推荐主副属性、PropertyList、ScoreRankList | 提供套装成员推荐，没有每个推荐SetID的权重字段；列表顺序不能当数值评分 |
| RelicSetBonusValue | 15条；SetID、Property、Threshold:{Value:number}、BonusValue；值为-10、10、15 | 存在条件套装分数线索；无AvatarID、RequireNum、优先级或完整评分公式，不能替换角色套装适配模型 |
| RelicSetSkillConfig | 当前96条；SetID、RequireNum、PropertyList、AbilityName／Param | 是真实静态／条件机制，不是套装适配分数；现有panel synthesis仍需 |
| RelicMain／SubAffixBaseValue | 20／12条，canonical affix、Type、基础值，主表还有ValuePerLevel | 支持类别映射和评分标尺推断，但消费公式未知 |
| ConstValueClient | `Relic_Recommend_Param1=0.2`、Param2=2、Param3=1.5、Param6=1.1、Param7=0.05、Param8=2、Param9=0.15；Crit=[0.35,10]；ParamScore=10；RankScore=[0.1,0.3,0.5,1]；Match_Score_Delta=20 | 命名支持游戏存在推荐／匹配评分参数；不能把任意Param直接解释为Main/Sub份额、Flat折扣或通用门槛 |
| ConstValueCommon／RecommendConstValueCommon | Relic_Recommend_Big_Data_Max_Num=2；后者4条以助战等推荐常量为主 | 存在其他推荐流程，但不提供可直接使用的遗器评分公式 |
| SpecialAvatarRelic、SpecialAvatarRelicMainValue／SubValue、UpgradeAvatarSubRelic、RogueUpgradeAvatarSubRelic | 特殊／模板遗器值、rarity／level／slot与子词条列表等结构；MainValue约64,400条、SubValue1,689条 | 属于预设／特殊遗器属性线索，不是98角色质量权重表；未发现足以取代评分的完整公式 |

`RelicSetBonusValue` 示例：Set301 speed≥120对应+10；Set302同阈值+15；Set124 speed阈值95.01对应-10；Set319 MaxHP≥5000对应+10；Set322 Attack≥3600对应+10。**推断**：这些像条件效果／配装推荐评分的修正量。特别是低速套装的负值和多种面板单位说明不能不确认比较方向就使用它们，更不能为本轮移除Soft/Hard又引入另一套未知的阈值分。

本轮按文件名检索ExcelOutput相关relic／affix／recommend／score表，并在本地TurnBasedGameData（排除大TextMap及定义表自身）检索两份权重、BaseValue、SetBonusValue、ScoreRankList引用。发现客户端常量定义，未找到可执行消费者／完整调用公式。这是“本地导出仓库可见内容”的证据边界，不证明客户端没有相关实现。未反编译或联网检索游戏客户端。

### 8.2 ScoreRankList

98条推荐记录均有长度2、严格降序的整数列表；第一项范围190–358，第二项128–304。例如三月七1001为[279,216]，希儿1102为[346,287]。它不是按每个推荐套装配对的值，也不是我们0–100分制。

**推断**：字段名、按角色配置和两个降序数值更像综合评分等级门槛；也可能是推荐筛选阈值。客户端RankScore常量提供相关线索，但没有证据确定等级数量、阈值适用范围、是否与套装修正相加。不能将它当作套装ID、推荐列表位置权重，或直接映射我们的评级；V2仍采用我们的Monte Carlo归一化，不导入这套未知绝对分制。

### 8.3 当前套装逻辑与结构限制

`score.ts:evaluateSetIntegrity` 与 `scoring-config.ts.sets`：

| 洞窟／位面状态 | integrity |
| --- | --- |
| 推荐洞窟4件 | 1 |
| 非推荐洞窟4件 | 0.8 |
| 洞窟2+2，不区分两套是否推荐 | 0.5 |
| 仅洞窟一对（含3+1） | 0.2 |
| 洞窟无配对 | 0 |
| 推荐位面2件 | 1 |
| 非推荐位面2件 | 0.5 |
| 位面不成套 | 0 |

总值=`2/3×cavern + 1/3×planar`，再以5%进入Build。推荐4+推荐2为1；2+2配推荐位面为2/3，套装部分贡献约3.333分；非推荐4配推荐位面为0.866667，贡献约4.333分。因此某些合理2+2会被任意非推荐4件压过，两个推荐2件组合也不会获得额外优待。这是现有完整性经验规则的结构性限制，不是新权重引入的回归。

函数不计算套装战斗效果，也不按推荐列表顺序加分；它在scoreBuild的唯一六槽检查后使用。推荐列表本身不表达2件组合数值优劣。暂未发现能可靠取代该模型的完整角色套装适配权重，因此建议本轮后续V2保留规则并明确其“完整性而非实战效果”的含义，不扩为套装系统重构。条件BonusValue不直接接入。

## 9. Proposed V2 Architecture 与技术债

### 9.1 推荐模块边界

```text
Pinned upstream source registry + regular/LD character inventory
  → raw typed category preferences（保留缺失、来源摘要）
  → stat mapper（合法key、元素政策、映射版本）
  → value policy（Flat／其他类别价值变换，数学参数另行批准）
  → 自动派生 Profile：main preferences、effective sub weights、少量评价模式例外

AvatarRelicRecommend → 独立 recommendation / Effective Hits / Set Integrity
effective sub weights + 既有随机模型 → 离线条件 Benchmark
canonical relics → 独立 normalization → U / CDF → 连续主合成 → Build
panel synthesis → 玩家面板展示（不再作为评分准入条件）
```

来源接入须加入 `scripts/data/source-requirements.ts` 的shared source registry，使deployment sparse preparation、默认local source、full／build-input validation一致。现在该清单不含两份AvatarValue或BaseValue／SetBonus表；只改本地读取路径会令部署缺文件。基础的两份权重属于必要输入；其余表只有采用相关价值方案时才成为运行输入，不因本轮调查而全部打包。

新增小型locale-neutral派生数据遵循Manifest artifact inventory／digest和原子发布，sourceCommit写实际输入；Profile不再长期复制到人工配置。若继续把Profile产物放在relic-score/generated的独立维护位置，应明确其生成／验证入口与Manifest的同步关系，不能依赖写着旧SHA的metadata推断新数据一致性。推荐将权重派生接入数据生成边界，Benchmark仍独立显式维护。

### 9.2 可以退出与应保留的机制

| 机制 | 建议 |
| --- | --- |
| 自动角色定位／Template Inference／resolveScalingStat | 退出评分输入；上游按AvatarID直接给偏好，无需先猜DPS／辅助；只有存在独立产品消费者才另保留 |
| profile-templates.json | 在消除评分与历史工具消费者后可删除；不能为了缺失字段保留静默模板fallback |
| templateId、scalingStat、31角色statWeights | 正常迁移后从日常override中移除；不同分值是预期模型变化，不是逐个复制旧数值回来 |
| 16 soft／7 hard配置 | 完全删除及其评分消费者 |
| mainStatOverrides | 二元addAccepted改为连续数据后长夜月可不再需要；银狼LV.999暂保留显式agnostic模式；不要自动生成每角色例外 |
| 98份approval digest／inference confidence／review reason | 自动派生方案中可删除逐角色审批字段与门禁，改结构／语义校验；需同步运行时及离线validator |
| 稀疏语义例外 | 有证据时保留，附理由／来源和变更复核条件；允许少量主／副偏好或评价模式例外，不承诺零人工配置 |
| 原始推荐、registry、reference、natural generator、PRNG、CDF／压缩、Benchmark validator | 保留并复用；validator更新identity而非弱化过期拒绝 |
| 玩家panel synthesis／property semantics | 保留展示与其他消费者；只解除评分耦合 |

Profile Review建议从逐角色人工批准改为自动派生校验与变更摘要：覆盖、新字段、缺失推荐值、全零、异常范围、稀疏override输入变化等需要注意；普通已知结构上游变更通过digest进入派生数据。一次性的迁移结果复核仍有价值，但不能伪造reviewedInputDigest把机器生成说成人工批准。是否保留异常审批由维护者确认。

### 9.3 历史消费者与兼容层

`scripts/relic-score/calibration-core.ts`、calibrate、score-command、farming-prototype、review及相关历史tools仍会消费旧Profile／阈值或`pieceNormalized`兼容helper。迁移时逐一判定：校准工具若只比较旧公式可归档／删除；inspect、score、概率验证和Benchmark维护有持续用途，应适配新输入；“historical natural-mixture diagnostic”、Lens A/C不是生产模型，是否保留需按维护价值处理，不能连同Lens B一起删。

相关tests应从人工模板与审批断言转为来源闭包、映射合法性、U一致性、digest失效与新公式语义。维护文档更新，历史阶段报告只作为历史证据保留，避免继续引用为规范。`scoring-math.ts:pieceNormalized` 当前仅为历史calibration兼容，需要确认调用方清理后再删除。

## 10. Migration Plan（仅实施建议）

1. **先确定数学与来源政策**：批准主公式、raw／槽内归一、固定／agnostic策略、Flat变换、缺失处理及review机制；在代理合规的来源准备步骤核实当前pin是否有全部必要表。先解决来源差异，再谈发布。
2. **接入上游与映射**：扩shared source registry／sparse输入、typed raw adapter、regular/LD闭包、21-key合法矩阵、DamageType映射与缺失诊断；生成小型locale-neutral派生数据并纳入artifact契约。此阶段可以只做新旧diff，不切运行时评分。
3. **迁移Profile与效用**：移除模板偏好与targets，保留批准的稀疏例外；形成最终sub权重，运行／离线共享效用；更新schema／digest／Review Gate，保留旧Benchmark不可误用的严格拒绝。
4. **连续主分与Build改造**：实现已批准公式，共享单件／配装贡献；移除modifier归一和评分panel依赖，保留玩家面板展示。主公式本身不要求重新模拟。
5. **显式Benchmark再生成与验收**：仅在新副语义冻结后生成全部98角色／合法actual-main分布，验representation gate、coverage、identity和产物摘要；失败不发布。无实际行为变化的随机／CDF版本不升号。
6. **API／UI同步和债务清理**：升级DTO，删除阈值字段／展示／旧fixtures，更新维护命令与文档，清理确认无消费者的模板、审批和历史compat。最后按改变的面做定向验证；不把全仓测试／部署当本轮调查任务。

后续验收场景至少包括：regular+LD无遗漏／ID冲突拒绝；未知字段和推荐主缺失；Lightning→Thunder；Flat与百分比互斥边界；非推荐正权重贡献U但不计hits；runtime与offline U同值；次优／零／固定／低星／agnostic主分；六槽聚合等于单件贡献加权；仅panel失败时遗器评分仍能独立判断；阈值字段不再出现在API；权重变化令旧Benchmark拒绝、纯主合成变化不改变副identity；257点gate失败不发布。数学政策确定后才能把预期数值写入测试。

## 11. Decisions Required

| 问题 | 候选方案 | 推荐方案 | 推荐理由 | 是否需要维护者决定 |
| --- | --- | --- | --- | --- |
| 连续主词条公式 | A连续主贡献；B整体适配乘法；C主完成度调制副质量 | 优先讨论A | 保留独立副质量含义与现有贡献边界 | 是，未批准 |
| 主偏好归一 | raw w；按角色槽最大值；其他变换 | 对比raw与槽最大值后决定 | 槽内满分与跨槽绝对偏好存在实际冲突，昔涟／1506有反例 | 是，未批准 |
| Main/Sub份额 | 延用0.35／0.65；调份额；C下改解释 | 用现有份额作首轮对比基准，不宣布V2参数 | 连续适配已经改变分数，避免同时未经验证调参 | 是 |
| 固定HEAD/HAND | a=1且保留Q；raw偏好；退出主评价 | a=1且保留Q | 固定槽无选择，仍可评价强化完成度 | 是 |
| agnostic特殊角色 | 保留显式模式；全部连续评价；新机制模拟 | 暂留1506显式agnostic | 新权重不能自然表达旧退出语义，避免新增战斗模拟 | 是 |
| 长夜月addAccepted | 保留二元例外；由ERR=0.8连续表达 | 连续模型确认后删除二元增补 | 已有真实主表数值，减少人工维护 | 是，依赖公式 |
| Flat折扣／换算 | 全局d；分类dX；基础收益；完整BaseValue类别变换 | 先讨论全局d；4/9只作证据候选 | 低维护成本且有上游差异线索，消费语义仍未知 | 是，系数不定 |
| 是否采用全部类别BaseValue | 仅角色偏好+Flat；全部c[k]价值系数 | 与Flat方案分开批准 | Speed／双暴等也改变，不能隐含加入 | 是 |
| 缺失字段语义 | 严格拒绝异常；按零并诊断；有证据的fallback | 保留missing状态、优先诊断推荐缺失，明确政策后转换 | 绯英推荐伤害缺失，不足以证明零语义 | 是 |
| 元素伤害映射 | 只本属性；七元素共用；稀疏例外 | 本属性默认+有证据的例外 | 避免给错误元素同分，但客户端映射未证实 | 是 |
| Profile Review | 保留逐角色审批；自动校验+异常复核 | 自动派生校验+变更摘要／稀疏例外复核 | 去除模板猜测后大量人工approval不再对应必要维护任务 | 是 |
| Soft/Hard移除程度 | 只禁用权重；删除schema／消费者并解耦panel | 完整删除评分阈值链路 | 彻底减少主观参数，避免死字段与准入依赖残留 | 移除倾向已明确；最终迁移确认 |
| 参考阈值展示 | 保留独立提示；无该功能 | 不新增提示，删除旧展示 | 避免借展示继续维护原主观阈值体系 | 若想保留则需另行决定 |
| Set Integrity | 保留；直接使用SetBonus；重构套装价值 | 暂留现有模型 | 有数值线索但无可靠完整替代，2+2结构限制已记录 | 保留方向已明确；后续修改另决 |
| Benchmark维护 | data sync自动模拟；显式生成+CI廉价校验 | 保持显式生成 | 约5.39亿件规模，源更新不应无声触发耗时任务 | 现有行为可延续 |
| API版本／字段 | 沿用v2空字段；新版本删除字段并重述主适配 | 独立升级presentation协议 | 当前DTO已经version2，算法V2不能掩盖破坏性契约变更 | 是，具体schema后定 |

## 12. Evidence / References 与本轮验证

### 12.1 核心定位索引

以下“文件:行”是本轮读取时的定位，不把历史报告当运行规范；引用函数名用于后续行号变化时定位。

| 结论 | 直接证据位置 |
| --- | --- |
| 权重schema／覆盖／分布 | `../TurnBasedGameData/ExcelOutput/RelicMainAffixAvatarValue.json`、`RelicSubAffixAvatarValue.json` 全量记录；AvatarConfig／AvatarConfigLD／AvatarRelicRecommend／AvatarRelicRecommendLD |
| 类别映射／Flat候选／套装条件分 | 上游 `RelicMainAffixBaseValue.json`、`RelicSubAffixBaseValue.json`、`RelicSetBonusValue.json`；ConstValueClient:7399、7482、7587、7617、8037 |
| pin与来源准备 | `upstream.lock.json`；`scripts/data/paths.ts:resolveDataRoot`；`scripts/deployment/prepare.ts:54`；`scripts/deployment/git.ts:prepareCheckout`；`source-requirements.ts` |
| regular／LD关联与推荐提取 | `scripts/data/character-sources.ts:loadCharacterDomainTables`；`raw.ts:mergeConfigSources`；`domain/character.ts:490`；`sync.ts:208/970` |
| 合法stat、reference与数值完成度 | `src/lib/relic-score/stat-registry.ts:10`；`src/lib/player/property-semantics.ts`；`relic-score/reference.ts:52`；`score.ts:95` |
| 三态与有效次数 | `main-stat-policy.ts:26/60`；`scoring-math.ts:3`；`score.ts:75/95` |
| 模板／手写限制／审批 | `scripts/relic-score/profiles.ts:17/95/135/resolveWeights`；`validate.ts:139/293`；`review-core.ts:approveCurrentReview`；`review.ts` |
| 样本、U、条件CDF、identity | `farming/generate-natural-relic.ts:generateNaturalRelic`；`farming/prototype.ts:12`；`scripts/relic-score/benchmarks-generate.ts`；`benchmark/identity.ts:44/56/98/147`；`benchmark/cdf.ts` |
| 压缩门禁与严格artifact契约 | `farming/dense-quantile.ts:44`；`benchmark/types.ts`；`benchmark/validate.ts:44/83`；历史generation audit摘要 |
| 阈值与Build／套装 | `score.ts:193/229/262/333`；`scoring-math.ts:33`；`scoring-config.ts` |
| panel依赖／可保留的面板能力 | `normalize.ts:30/93`；`player/stat-synthesis.ts:229/241/261`；`api/_player/enka/pipeline.ts:36` |
| DTO、runtime门禁与UI | `player/relic-score-contract.ts`；`relic-score/presentation.ts:presentRelicScoreResult`；`server/relic-score/benchmark-loader.ts:productionState`；`components/player/PlayerRelicScoreSummary.svelte` |
| 历史目的与维护入口 | `docs/relic-score-feature/main-stat-policy-implementation.md`、`profile-maintenance.md`、`benchmark-maintenance.md`；实际行为均已回查代码 |

### 12.2 实际执行结果与限制

本轮只读统计使用 `python3 - <<'PY' ... PY`，不留下脚本文件；检查完整权重schema、重复key、ID集合、值域／频数、推荐集合、九类／十二类比较、override、源SHA与产物摘要。统计未运行游戏算法或实战模拟。

| 实际命令／检查 | 结果 |
| --- | --- |
| 显式仓库路径的 `git status --short`、branch、rev-parse HEAD、log -1 | 网站在develop，开始三个仓库无修改；来源SHA如2.1；结束状态见下 |
| `GIT_NO_LAZY_FETCH=1 git … cat-file -e / show --no-patch / ls-tree` 锁定对象探测 | 未取得锁定提交／树／权重内容；不宣称完成pin覆盖验证 |
| 前期未禁用lazy fetch的缓存cat-file | 触发隐式网络，DNS失败；停止，无远程数据；后续只查本地 |
| Python重复key／字段类型／ID／数值检查 | 两份表各98条，无重复ID/key或非法值；regular+LD覆盖一致 |
| Python全量Profile／上游属性对照 | 9类768显式项及12类1045显式项统计成立；所有98角色有显式差异 |
| Python复算当前profileScoringDigest | 98/98与现有Benchmark metadata中的profileDigests一致；不等同生产validator通过 |
| Python检查正式分布数组 | 2744/2744具六槽覆盖、257点、有限非负及单调；不声称复算全部分布identity或经验CDF门禁 |
| Python字节SHA和候选公式示例 | Benchmark摘要与历史审计一致；候选示例数值及[0,1]界限检查通过 |
| `node node_modules/tsx/dist/cli.mjs scripts/relic-score/validate-command.ts` | 被tsx IPC `listen EPERM`阻止，未进入Profile业务验证 |
| `node node_modules/tsx/dist/cli.mjs scripts/relic-score/farming-validate.ts` | 同样IPC阻止，未进入概率模型业务验证 |
| `node node_modules/tsx/dist/cli.mjs scripts/relic-score/benchmarks-validate.ts` | 同样IPC阻止，未进入正式Benchmark验证 |

上述三条CLI实际环境为Node v26.5.0，与仓库Node24.x基线不一致，因此即便启动成功也不能替代支持环境的发布验收。IPC失败后没有申请提权、绕过或反复重跑。可由维护者在支持环境补跑这三条只读命令；报告结论来自已完成的代码／数据证据，不把未执行验证包装为成功。

统计复现的核心九类比较口径如下（在网站仓库执行，内存统计，无文件写入）：

```python
import json
from pathlib import Path
from collections import Counter

source = Path('../TurnBasedGameData/ExcelOutput')
upstream = {
    str(row['AvatarID']): row
    for row in json.loads((source / 'RelicSubAffixAvatarValue.json').read_text())
}
profiles = json.loads(
    Path('src/lib/relic-score/generated/character-profiles.json').read_text()
)['profiles']
mapping = {
    'AttackAddedRatio': 'Attack', 'HPAddedRatio': 'HP',
    'DefenceAddedRatio': 'Defence', 'SpeedDelta': 'Speed',
    'CriticalChanceBase': 'CriticalChance', 'CriticalDamageBase': 'CriticalDamage',
    'StatusProbabilityBase': 'StatusProbability',
    'StatusResistanceBase': 'StatusResistance',
    'BreakDamageAddedRatioBase': 'BreakDamage',
}
counts = Counter()
for profile in profiles:
    row = upstream[profile['characterId']]
    for key, field in mapping.items():
        if field not in row:
            counts['absent'] += 1
            continue
        old, new = profile['substatWeights'].get(key, 0), row[field]
        counts['present'] += 1
        counts['equal' if old == new else 'different'] += 1
        if old == 0 and new > 0:
            counts['old_zero_new_positive'] += 1
print(dict(counts))
```

只新增本报告后检查Markdown格式、文件引用和最终Git状态；外部两仓库状态保持开始时的干净状态。未运行全仓测试、构建、data sync、Profile生成／审批、calibration、frequency采样、正式Benchmark生成或部署。本报告不是V2实施验收，也没有把未决参数提前固化。
