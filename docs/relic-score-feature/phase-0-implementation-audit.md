# Relic Score Phase 0 实施审计

> 调查日期：2026-09-22  
> 目标仓库：`HSR-Database`（`develop`）  
> 上游数据快照：`TurnBasedGameData@4ce30f69b32dc259ab9a8da3ba57035485103221`  
> 参考实现：`HSR-Relic-Simulator-Cross-Platform`，仅只读行为调查

## 1. Executive Summary

### 结论

当前仓库已经具备 Relic Score V1 所需的大部分基础设施，可以进入 Phase 1，但应先完成“评分输入与数据契约”而不是直接写 UI 或冻结分数参数。

最关键的已确认事实如下：

1. Player Info 的生产 provider 已从旧设计中的 MiHoMo 切换为 **Enka.Network**。真实链路已经有严格的 `decode -> provider adapter -> canonical model -> local stat synthesis -> presentation DTO` 分层；当前 UI 不直接依赖 Enka response。
2. Enka raw 提供 `relic.tid`、槽位、等级、`mainAffixId`，以及副词条 `affixId + cnt + optional step`。`cnt` 是可直接保留的 roll occurrence count；`step` 是累计档位增量，不是逐次 roll 序列。现有 canonical 层完整保留这些字段。
3. 现有公开 `PlayerProfile` presentation DTO 会丢失 `relic.tid`、rarity、数值型 actual value、`step` 和精确 panel 数值，只保留格式化字符串。因此评分 adapter 必须位于 canonical/runtime resolution 之后、`presentCanonicalPlayerProfile()` 之前，不能从现有 UI DTO 反推。
4. 推荐数据的 Source of Truth 已明确且可复用：`TurnBasedGameData/ExcelOutput/AvatarRelicRecommend{,LD}.json`，经现有 data pipeline 生成 `AvatarEquipmentRecommendation`。当前合并后 97 个角色均有非空套装、四个可变槽位主词条和副词条推荐。
5. 推荐结构只表达有序的 Cavern 4pc 候选列表和 Planar 2pc 候选列表；**不表达具体 2+2 组合**。不能擅自把两个候选 4pc 套装组合成合法 2+2。
6. `PropertyType` 已经是 Player raw resolution、上游推荐和游戏表之间的稳定 canonical key。`PLAYER_PROPERTY_SEMANTICS` 负责映射到最终面板字段；不需要再发明一套中文/英文 stat key。
7. 5★ 主词条与副词条数值可从当前已使用的 `RelicConfig`、`RelicMainAffixConfig`、`RelicSubAffixConfig` 生成。唯一明显缺口是现有 `PlayerRuntimeAffix` 未保留 `RelicSubAffixConfig.StepNum`，Phase 1 应补入生成模型，避免假定 high roll 永远是 `base + 2 * step`。
8. 参考模拟器提供了足够清晰的单件自然生成行为，但不包含掉落来源、套装掉率、槽位掉率或“整套 farming budget”。它的 main-stat 概率、substat 权重也来自仓库内静态表而非当前 HSR 上游表，必须在 HSR-Database 内独立建模、注明来源并验证。
9. benchmark 不应只存少量 percentile。建议使用每个 character × slot 的**固定概率网格 dense quantile table**（例如 257 或 513 个隐式概率点），通过二分查找近似 `F(x)`；先做体积/误差原型，再决定 257 或 513。当前 97 角色对应 582 个分布，257 点约 149,574 个数值，适合以提交到 Git 的确定性 artifact 交付。
10. Production build 已有“昂贵生成 + 便宜校验”分层先例。Profile 和 benchmark 应作为显式维护命令生成并提交；普通 CI/Production 只做 schema、语义、digest 与覆盖率校验，绝不能在 `data:ensure`、`prebuild` 或 `deploy:build` 中运行 Monte Carlo。

### 风险结论

- **BLOCKER：未发现。**
- **HIGH RISK：** benchmark 的 farming budget/掉落条件尚未定义；参考概率的来源可追溯性不足；当前 public DTO 不足以在浏览器端精确评分；推荐数据不能表达 2+2。
- 上述问题都有清晰的 Phase 1 解决边界，但在它们解决前不应对外宣称分数已经稳定或“等价于真实刷取成本”。

## 2. Scope / Non-goals

本报告只做实现前审计与落点设计，未实现以下内容：

- Character Profile、scorer、roll inference、benchmark generator；
- Piece Score / Build Score UI；
- 新依赖、package script、CI 或 build 配置；
- 对 `TurnBasedGameData`、`StarRailRes` 或参考模拟器的修改；
- 对算法权重、分数组成比例、breakpoint 列表或 farming budget 的最终产品决策。

参考模拟器只用于提炼行为规格。未来 HSR-Database 不得 import、调用、vendoring、submodule 或要求 clone 该仓库。

## 3. Repository & Relevant Module Map

| 层 | 当前关键文件 / symbol | 与 Relic Score 的关系 |
| --- | --- | --- |
| Player server endpoint | `api/player.ts`：`handlePlayerRequest()` | 请求入口、错误映射、最终 presentation 输出 |
| Enka request | `api/_player/enka/client.ts`：`createEnkaPlayerClient()` | 请求 Enka、重试、超时、缓存 |
| Enka decode | `api/_player/enka/decode.ts`：`decodeEnkaResponse()` | provider schema 边界；保留 relic raw facts |
| Provider adapter | `api/_player/enka/adapter.ts`：`adaptEnkaProfile()` | Enka -> `CanonicalPlayerProfile` |
| Canonical model | `src/lib/player/canonical.ts` | provider-neutral build facts；最接近评分输入 |
| 游戏数据 runtime | `scripts/data/player-runtime.ts`、`src/lib/player/runtime-data.ts` | relic identity、rarity、set、affix 数值与 property key |
| 面板合成 | `src/lib/player/stat-synthesis.ts` | 产生精确 OOC panel values，随后格式化为 DTO |
| Browser client | `src/lib/player/client.ts`、`src/lib/player/cache.ts` | 请求 `/api/player/`，5 分钟浏览器缓存 |
| 角色页 Player mode | `src/lib/components/shared/DetailPage.svelte` | 再次取 profile，选择 build，传给 stats/equipment |
| 遗器 presentation | `src/lib/player/equipment.ts` | slot resolution、metadata、推荐命中展示 |
| 遗器 UI | `PlayerEquipmentSection.svelte`、`PlayerRelicCard.svelte`、`PlayerAffixRow.svelte` | Piece / Build score 的最小接入点 |
| 推荐 domain | `scripts/data/domain/character.ts`、`src/lib/domain/types.ts` | 现有唯一推荐列表 |
| 推荐 view | `src/lib/domain/equipment-recommendation-view.ts` | ID/property resolution；当前角色页 consumer |
| 数据生成/校验 | `scripts/data/sync.ts`、`scripts/data/validation/*` | Profile 输入同步、cheap validation 的集成参考 |
| 部署管线 | `scripts/deployment/build.ts`、`.github/workflows/ci.yml` | 明确 production/CI 热路径 |
| 测试 | `tests/unit/*player*`、`tests/fixtures/enka/*`、`tests/e2e/player-character.spec.ts` | adapter、pure logic、SSR component、responsive E2E 先例 |

## 4. Current Player Info Data Flow

### 4.1 当前真实链路

```text
Browser: /player/ 或 /characters/:id/?uid=...
  -> src/lib/player/client.ts::fetchPlayerProfile()
  -> GET /api/player/?uid=...
  -> api/player.ts::handlePlayerRequest()
  -> api/_player/enka/client.ts::fetchPlayerProfile()
  -> https://enka.network/api/hsr/uid/:uid/
  -> api/_player/enka/decode.ts::decodeEnkaResponse()
  -> api/_player/enka/adapter.ts::adaptEnkaProfile()
  -> CanonicalPlayerProfile
  -> api/_player/enka/pipeline.ts::resolveCanonicalPlayerProfile()
       -> synthesizePlayerProfile()
       -> presentCanonicalPlayerProfile()
  -> PlayerProfile JSON
  -> DetailPage.svelte::findPlayerCharacter()
  -> PlayerStatsPanel / PlayerEquipmentSection
  -> resolvePlayerRelicSlots()
  -> PlayerRelicCard / PlayerAffixRow
```

`src/routes/player/+page.server.ts` 和角色 detail 的 `+page.server.ts` 只加载静态 catalog/detail/recommendation；实时玩家请求发生在浏览器挂载后。`DetailPage.svelte` 和 `/player/` 页共用 `src/lib/player/cache.ts` 的默认 client cache，因此同一页面导航链中同 UID 通常只请求一次。

### 4.2 Provider 与旧设计差异

- 当前 production provider 是 Enka.Network，基地址写在 `api/_player/enka/client.ts` 的 `upstreamBaseUrl`。
- 当前代码已没有 MiHoMo runtime client。旧 MiHoMo 文档只能作为历史背景；现状以 Enka pipeline 为准。
- `api/_player/enka/decode.ts` 是 provider-specific strict parser；它读取已知字段并忽略未知 future fields。
- `adaptEnkaProfile()` 已是明确 adapter/normalization layer；UI 从未接触 `EnkaRawResponse`。

### 4.3 `PlayerBuildInput` 的合理边界

推荐新增一个纯函数边界：

```text
CanonicalPlayerCharacterBuild + PlayerRuntimeData + synthesized numeric panel values
  -> normalizePlayerBuildInput()
  -> PlayerBuildInput
  -> scorePlayerBuild(profile, benchmark)
  -> presentation score DTO
```

位置应在 `resolveCanonicalPlayerProfile()` 已完成 runtime resolution 之后、`presentCanonicalPlayerProfile()` 丢失精确信息之前。不要从 `PlayerRelic` 的 `display` 字符串或 DOM 再建评分输入。

可复用类型：

- `CanonicalPlayerCharacterBuild`：角色 ID、relic TID、raw affix ID、`cnt`、`step`；
- `PlayerRuntimeData` / `PlayerRuntimeRelicIdentity` / `PlayerRuntimeAffix`：set、rarity、affix 数值；
- `RelicSlot`、`PLAYER_RELIC_SLOT_ORDER` 与 slot/type mapping；
- `PlayerPropertyType`、`PlayerStatTarget`、`PLAYER_PROPERTY_SEMANTICS`；
- `AvatarEquipmentRecommendation` 作为 profile inference 输入。

应新增而不应复用 presentation DTO 的类型：

- `PlayerBuildInput`；
- `NormalizedRelicPiece`、`NormalizedMainStat`、`NormalizedSubstat`；
- `RollCountEvidence = exact | inferred | ambiguous | unavailable`；
- `CharacterRelicScoreProfile`；
- `PieceScoreResult` / `BuildScoreResult`，其中 unavailable 必须是显式 union，而不是 `0`；
- benchmark artifact schema 与 digest metadata。

### 4.4 失败路径

`api/_player/enka/client.ts` 对网络失败和 timeout 最多尝试两次；400/404/429/5xx/424 被映射为稳定的 `PlayerErrorCode`。`api/_player/errors.ts` 再映射为 400/404/429/502/503/504，错误响应 `Cache-Control: no-store`，内部 diagnostic 不返回浏览器。

浏览器 `src/lib/player/client.ts` 解析错误 envelope；页面进入 error/fallback。角色 detail 在 Player 请求失败时继续显示静态角色资料与装备推荐，不会让整页失败。未知角色/装备/affix 则是另一条路径：HTTP 仍为 200，`synthesizePlayerCharacter()` 标记 `failed`、stats 为空并记录结构化日志。未来评分应在这种情况下返回 `unavailable` 及 reason，不得给 0 分。

## 5. Relic Data Capability Audit

### 5.1 字段可用性

| 所需字段 | 当前来源 | canonical / runtime 状态 | public `PlayerProfile` 状态 | 结论 |
| --- | --- | --- | --- | --- |
| character ID | Enka `avatarId` | `CanonicalPlayerCharacterBuild.avatarId` | `characterId` | 可用 |
| relic ID | Enka `relic.tid` | `CanonicalPlayerRelic.tid` | **丢失** | adapter 前可用 |
| slot | Enka `type` 1–6 | canonical `type`；runtime 也有 `slot` | `type`，UI 映射为 `RelicSlot` | 可用，应交叉校验 raw 与 runtime |
| set ID | `RelicConfig.SetID` | `PlayerRuntimeRelicIdentity.setId` | `PlayerRelic.setId` | 可用 |
| rarity | `RelicConfig.Rarity` | runtime `rarity?` | **丢失** | 可用但需进入 normalized model |
| level | Enka `level` | canonical `level` | `level` | 可用 |
| main stat key | `mainAffixId` + main group | runtime `propertyType` | `mainAffix.type` | 可用 |
| main actual value | runtime `baseValue + levelAdd * level` | synthesis 中计算为 number | 仅格式化 `display` | 精确值可用，不能从 DTO 反推 |
| substat key | `affixId` + sub group | runtime `propertyType` | `subAffix.type` | 可用 |
| substat actual value | `baseValue * cnt + stepValue * step` | synthesis 中计算为 number | 仅格式化 `display` | 精确值可用，不能从 DTO 反推 |
| substat roll count | Enka `cnt` | canonical `cnt` | `count` | 直接可用 |
| 每次 roll grade | Enka 不提供序列 | 只有累计 `step` | 丢失 | 单次 grade 不可恢复；累计 grade 通常足够算 high-roll equivalent |
| final OOC panel | 本地 synthesis | `SynthesizedPlayerCharacterBuild.values` number | 格式化 `PlayerStat.total` | 精确值可用于 breakpoint |

### 5.2 `cnt`、`step` 与显示取整

现有公式已经由 `src/lib/player/stat-synthesis.ts` 和 golden test 固化：

```text
main = BaseValue + LevelAdd * relicLevel
sub  = BaseValue * cnt + StepValue * (step ?? 0)
```

因此：

- `cnt` 是该副词条的总 occurrence 数，包含初始出现/揭示和后续强化命中，不只是“额外强化次数”。
- `step` 是所有 occurrence 的累计档位增量。若单次档位为 0/1/2，知道 `cnt + step` 仍无法知道顺序或每次拆分。
- Enka fixture 中 `step` 可以省略，现有实现将其解释为 0；`cnt` 仍存在。
- decoder 当前只验证非负安全整数，没有验证 rarity/level 下的合法总 roll 数。Phase 1 adapter 应增加语义校验；非法组合应为 `unavailable`，不能静默评分。
- Enka raw 本身不提供显示值；public DTO 由本地数值格式化。`displayNumber()` 对 flat stat 截断为整数，对 percentage 截断为一位百分数。浏览器可见值已经损失精度。

如果未来接入只提供显示值的 provider，合法组合反推并不总能唯一：高 `cnt` 时不同 count/grade sum 的数值区间会重叠，而一位百分数或整数截断进一步扩大歧义。因此建议统一表示：

```ts
type RollCountEvidence =
  | { status: 'exact'; count: number; source: 'provider' }
  | { status: 'inferred'; count: number; candidates: [number] }
  | { status: 'ambiguous'; candidates: number[] }
  | { status: 'unavailable' };
```

对当前 Enka adapter，正常路径应为 `exact`。不要为了“provider-neutral”而丢弃这条强证据。

### 5.3 Breakpoint 面板能力

`SynthesizedPlayerCharacterBuild.values` 保存未格式化的最终战斗外数值，覆盖 HP、ATK、DEF、SPD、CRIT、Break、EHR、RES、ERR bonus、Healing 和各元素伤害等。当前六角色 fixture 的 51 个数值以 `1e-8` 容差验证。因此 Hard Breakpoint / stat target 有可用输入。

限制是：任何 unknown entity diagnostic 会令该角色整个 synthesis `failed`，`values` 变空。V1 应把相关 breakpoint 结果标为 unavailable；不要退回读取格式化 `stats`。

## 6. Upstream Recommendation Audit

### 6.1 Source of Truth 与加载路径

真实来源：

- `TurnBasedGameData/ExcelOutput/AvatarRelicRecommend.json`
- `TurnBasedGameData/ExcelOutput/AvatarRelicRecommendLD.json`
- 光锥推荐另来自 `AvatarEquipRecommend{,LD}.json`

`scripts/data/character-sources.ts` 用稳定 identity 合并 regular/LD 表；`scripts/data/domain/character.ts::buildCharacterDomain()` 读取：

- `Set4IDList -> cavernSetIds`
- `Set2IDList -> planarSetIds`
- `PropertyList3/4/5/6 -> BODY/FOOT/NECK/OBJECT mainStatOptions`
- `SubAffixPropertyList -> subStatPropertyTypes`

随后经过 neutral domain、localized projection，写入每个角色 detail JSON。`src/routes/[category]/[id]/+page.server.ts` 调用 `resolveEquipmentRecommendation()` 将 ID/property key 解析为当前 locale 的 view；Player equipment 复用同一 view 来标记推荐词条。

### 6.2 当前结构与 ID

- Character、relic set、light cone 均使用十进制字符串 ID。
- slot 使用 `HEAD | HAND | BODY | FOOT | NECK | OBJECT`。
- stat 使用上游 `PropertyType`，不使用中文或英文名称作为 identity。
- set category 不是按名称或 ID 范围判断，而是由 `scripts/data/domain/relic.ts` 根据 piece slot 推导为 `cavern | planar`。
- localization 只在 projection 层解析；推荐模型内部没有中英文 key 混用。

当前 pinned 数据合并后有 97 个角色和 97 条 recommendation，未发现缺 recommendation、空 set list、空主词条槽位或空副词条列表。现有 `robustness-invariants.ts` 已校验 recommendation owner、重复 ID、FK、set category、main-slot 合法性和 substat 合法性。

### 6.3 顺序、优先级与方案表达

- 各 list 的顺序从上游保留到生成 artifact，因此它们是**有序数据**。
- 但当前 TypeScript 类型只表示数组，没有显式 `rank`、weight 或 tier；`resolvePlayerRelicSlots()` 对副词条只转成 `Set` 做 membership。不能把顺序直接解释成数值权重而不经产品审核。
- raw 中还存在 `ScoreRankList`，26 条记录含 `LocalCriticalChance`；当前 pipeline 完全不消费它们，含义也未在项目中验证。Relic Score 不应偷偷借用。
- `Set4IDList` 表达有序 Cavern 4pc 候选；`Set2IDList` 表达有序 Planar 2pc 候选。
- 当前没有 `(setA, setB)` 组合结构，不能表达 Cavern 2+2；也没有“方案 A = 某 main stat + 某 set”的组合关系。

### 6.4 Relic Score 的读取原则

Profile generator 必须直接消费现有 normalized `AvatarEquipmentRecommendation`（或同一 domain build 的 locale-neutral projection），而不是维护第二份推荐 set/main/sub list。Character Profile 只允许补充：

- 副词条相对权重；
- hard breakpoint / stat target / curve；
- 对 inference 的显式 override；
- `needs-review`、reviewer、reviewed-at、source digest 等元数据。

推荐列表变化必须通过 profile input digest 使 generated profile stale。对于 2+2，V1 应默认“不被推荐数据表达”，除非上游新增明确结构或产品批准一个受审 override；不能把 `Set4IDList` 两两组合。

## 7. Stat Canonicalization & Reference Values

### 7.1 现有 canonical key

`src/lib/player/property-semantics.ts::PLAYER_PROPERTY_SEMANTICS` 已覆盖所需 key：

| 语义 | canonical `PropertyType` | panel target |
| --- | --- | --- |
| flat HP / ATK / DEF | `HPDelta` / `AttackDelta` / `DefenceDelta` | `hp` / `atk` / `def` 的 flat bucket |
| HP% / ATK% / DEF% | `HPAddedRatio` / `AttackAddedRatio` / `DefenceAddedRatio` | ratio bucket |
| SPD | `SpeedDelta` | `spd` flat bucket |
| CRIT Rate / DMG | `CriticalChanceBase` / `CriticalDamageBase` | `crit_rate` / `crit_dmg` |
| Break Effect | `BreakDamageAddedRatioBase` | `break_dmg` |
| Effect Hit / RES | `StatusProbabilityBase` / `StatusResistanceBase` | `effect_hit` / `effect_res` |
| Energy Regeneration | `SPRatioBase` | `sp_rate` bonus；UI 另加 100% baseline |
| Outgoing Healing | `HealRatioBase` | `heal_rate` |
| elemental damage | `PhysicalAddedRatio` 等七种 | 对应 `*_dmg` |

Player raw 的 affix ID 通过 `PlayerRuntimeData` 解析为这些 key；推荐配置直接使用相同 key；游戏表的 `Property` 也是相同 key。三方已经对齐。

建议新增 `RelicStatKey`，作为 `PlayerPropertyType` 的受限子集，并由一个 central registry 派生 `canBeMain`、`canBeSub`、percent、panel target、high-roll reference。不要把 `PlayerStat.field`（`crit_rate` 等 presentation key）升级成第二套评分 canonical key。

### 7.2 5★ reference value

可靠来源是当前已使用的：

- `RelicConfig`：rarity、slot、main/sub affix group、max level；
- `RelicMainAffixConfig`：`BaseValue`、`LevelAdd`；
- `RelicSubAffixConfig`：`BaseValue`、`StepValue`、`StepNum`。

5★ relic 当前使用 main group 51–56、sub group 5、max level 15。+15 主词条由 `BaseValue + 15 * LevelAdd` 得到，例如 HP flat 705.6、ATK flat 352.8、HP/ATK% 43.2%、DEF% 54%、SPD 25.032、CRIT Rate 32.4%、CRIT DMG 64.8%、elemental DMG 38.88%、Break 64.8%、ERR 19.4394%、Healing 34.56%。

5★ 副词条 high roll 应由 `BaseValue + StepNum * StepValue` 得到，而不是本地散落常量。例如 SPD 2.6、CRIT Rate 3.24%、CRIT DMG/Break 6.48%、HP/ATK% 4.32%、DEF% 5.4%。

现有 runtime generator 已保留 `baseValue`、`levelAdd`、`stepValue`，但丢弃 `StepNum`。Phase 1 应扩展 `PlayerRuntimeAffix` 或生成专用 `RelicScoreReferenceData`，并对 5★ group 唯一性、slot/property closure 和 high-roll > 0 做 validation。

`RelicMainAffixBaseValue.json` / `RelicSubAffixBaseValue.json` 虽存在于上游，但当前 pipeline 未使用，且 flat main 的尺度并不直接等于装备实际值。没有必要为了评分引入第二套难解释的参考；优先复用已验证的 actual affix config。

## 8. Character Profile Integration Plan

### 8.1 推荐目录

基于当前项目“手工 source config 放 `data/`、构建脚本放 `scripts/`、runtime domain 放 `src/lib/`”的习惯，建议：

```text
data/relic-score/
  profile-templates.json
  profile-overrides.json
  probability-model.json

scripts/relic-score/
  generate-profiles.ts
  generate-benchmarks.ts
  validate.ts
  digest.ts

src/lib/relic-score/
  types.ts
  canonical.ts
  player-build-input.ts
  score.ts
  benchmark.ts
  generated/
    character-profiles.json
    benchmark-index.json
    benchmarks.json        # 先用单文件原型；体积超标再分片
```

这里使用 `src/lib/relic-score` 不是机械套旧规格，而是因为评分 core 既不是纯 `player` presentation，也不是通用游戏 `domain`；它需要被 `api/player.ts` 和 unit fixtures 同时导入。provider adapter 仍留在 `api/_player/enka`，避免评分包依赖 Enka。

### 8.2 Pipeline

```text
profile-templates.json
  + existing AvatarEquipmentRecommendation
  -> deterministic inference
  + profile-overrides.json
  -> generated CharacterRelicScoreProfile[]
  -> schema validation
  -> semantic validation
  -> review-state validation
```

建议规则：

- generated profile 提交 Git。它体积小、是人工审核边界、Production clone 必须可直接使用。
- 生成结果记录 `inputDigest`、`generatorVersion`、`sourceCommit`、`reviewStatus`、`reviewedInputDigest`。
- 新角色、推荐列表变化、template/override 变化使 `inputDigest !== reviewedInputDigest`，生成器输出 `needs-review`。
- 常规 `relic-score:validate` 对 `needs-review` 可以在 develop 给出错误或明确清单；进入 main/production 前必须为 reviewed。具体 develop 是否 hard-fail可由团队决定，但 production 应 hard-fail。
- semantic validation 至少覆盖：角色一一对应、canonical stat key、非负有限权重、至少一个有效副词条、breakpoint key/target/curve 单调性、override 无孤儿、recommendation 不重复复制。

不要把 profile generation 放进 `data:sync`。`data:sync` 是 locale/game-data build artifact 生成器，且 clean Production build 必定执行；Profile 是显式维护与审核动作。

## 9. Existing Relic UI Integration Points

### 9.1 当前 DOM / component 边界

`src/lib/components/player/PlayerEquipmentSection.svelte`：

```text
section#equipment
  SectionHeading(level=1)  装备
  group                     光锥
  group
    SectionHeading(level=2) 遗器
    div.player-equipment__relic-grid
      PlayerRelicCard × 6
```

`PlayerRelicCard.svelte`：

```text
a | article.player-relic-card
  header
    artwork
    identity: slot / set / piece
    strong.player-relic-card__level   # +15 在这里
  div.affixes--main
    PlayerAffixRow
  div.affixes--sub
    div.affix-list
      PlayerAffixRow × N
```

### 9.2 最小侵入式建议

- 为 `PlayerRelicCard` 增加一个明确的 `score` presentation prop（推荐 union：available/unavailable），不要让 Card import scorer 或 benchmark。
- Piece Score 最安全的位置是 header 第三列，与现有 `+level` 组成一个右上角 metadata stack；保持 artwork、identity、主词条和副词条 DOM 不动。
- 不要把 score 塞进 `PlayerAffixRow`，也不要新增有 border-top 的第四个大 section。
- 在 `PlayerEquipmentSection` 的“遗器” `SectionHeading level=2` 后、`.player-equipment__relic-grid` 前插入浅层 `PlayerRelicBuildSummary`。Build Score 可以同时利用 `SectionHeading` 已有 `meta` slot 做紧凑主值，summary 只展示 Stat Completion、Hard Breakpoint、Set Integrity 与有效副词条命中次数。
- `unavailable` 应显示 `—`/状态文案并带可访问 label，不得渲染 `0`。

### 9.3 Responsive 与可复用样式

- relic grid：默认 3 列；`<=1080px` 2 列；`<=680px` 1 列。
- 角色 detail hero：`<=1180px` 从双列变单列；全站主要 tablet breakpoint 为 `820px`；窄屏规则集中在 `520px`。
- 可复用 token：`--space-*`、`--font-internal`、`--font-meta-value`、`--gold`、`--border`、`--radius-control`、`font-variant-numeric: tabular-nums`。
- 可复用 pattern：`SectionHeading` 的 `meta` slot、现有 gold/recommended highlight、`data-*` 测试 hook、focus-visible 样式。

应避免：改变 header 的三列基本结构、移动 `+15` 到主词条区、嵌套 dashboard cards、让 summary 在手机上产生横向滚动、把 card 由整卡链接改成内部嵌套链接/按钮。

## 10. Reference Probability Model Findings

以下仅描述参考仓库观察到的行为，不构成代码复用建议。

### 10.1 已确认行为

- slot 由调用者指定；模拟器不模拟 Cavern/Planar source、set 掉落、slot 掉率或体力。
- HEAD/HANDS 主词条固定；BODY/FEET/SPHERE/ROPE 按静态 main probability 表抽取。
- main stat 与 substat 同类型互斥。
- substat 按权重无放回抽取；已选 key 不重复，每次从剩余权重重新归一化。
- 权重表：普通 flat/% HP/ATK/DEF 为 10，Break/EHR/RES 为 8，CRIT 为 6，SPD 为 4。
- 4 initial 概率硬编码为 20%，3 initial 为 80%。内部为方便始终放四条，3-init 的第四条在 +0 时 count 0。
- 单次 roll tier 为三档 0/1/2，等概率 `1/3`；初始、揭示和强化都使用该规则。
- 4-init 在 +3/+6/+9/+12/+15 各均匀选择四条已有副词条强化。
- 3-init 在 +3 揭示第四条，+6/+9/+12/+15 才均匀强化已有四条。
- 5★ +15 路径是：指定 slot -> 自然主词条 -> 3/4 initial -> 四个不重复副词条 -> 强化到 +15。
- reforge 是独立操作：重投各副词条初始 grade 并重新分配原有 enhancement count；可排除一个 index。它不是 natural drop 行为。
- `RelicSet` 只是六槽容器与统计入口；没有“刷 N 次/消耗 N 开拓力/最佳六件”的 farming budget。

### 10.2 配置与硬编码边界

| 静态 JSON | 实现中硬编码 |
| --- | --- |
| main actual value、main probability、sub actual value、sub weight | max level 15、每 3 级节点、4-init 20%、三档等概率、强化目标均匀、无重复/同名互斥流程 |

参考仓库的 actual affix values 与当前 TurnBased 5★ affix config 相符；但 main probability 与 sub weight 在当前 HSR-Database 使用的上游表中没有对应权重字段。其来源在参考仓库内没有可审计的 upstream commit/digest，因此是需要独立验证的知识输入。

### 10.3 不应带入的内容

Vue、Pinia、Vue Router、Tailwind、Web Crypto buffered RNG、mutable `Relic` UI model、save/load、card styling、character name templates、OOC stats service 和 reforge UI 均不属于 HSR-Database benchmark core。benchmark 应使用可注入的 seeded PRNG；Production runtime 不需要 RNG。

## 11. Independent Benchmark Implementation Requirements

| Behavior requirement | Data required | Suggested independent HSR-Database implementation | Validation strategy |
| --- | --- | --- | --- |
| 六个 slot 的合法主词条 | `RelicBaseType.ValidPropertyList` | 从当前 data source 生成 allowed key set | 与 5★ main group closure 交叉校验 |
| 自然主词条概率 | 本地受审 probability config | `data/relic-score/probability-model.json`，canonical key + integer tickets | 每 slot tickets 总和；HEAD/HAND 唯一；外部资料人工复核 |
| 主/副同名互斥 | canonical stat key | 抽副词条前排除 main key | property test：任何样本不冲突 |
| weighted sub selection | 本地受审权重；上游合法 sub key | 无放回 weighted sampler，每抽一次重新归一 | 固定 seed golden + 大样本频率容差 |
| substat 不重复 | canonical stat key | selected set | property test：size 等于条目数 |
| 3/4 initial | 80/20 配置或 model constant | 显式 initial count，不创建“隐藏有效 roll” | boundary unit + 频率 test |
| 三档 roll | `BaseValue/StepValue/StepNum` | 在 `0..StepNum` 均匀抽 integer grade；当前 StepNum=2 | 所有 grade 合法；均值/频率 test |
| +3…+15 | max level 与 cadence | 3-init +3 reveal，之后均匀强化；4-init 每节点强化 | scripted RNG state-transition tests |
| 5★ high-roll equivalent | 5★ sub reference | actual / (`BaseValue + StepNum*StepValue`) | 每 key high roll 恰为 1；线性关系 invariant |
| Natural Farming | 禁止 reforge | benchmark API 根本不暴露 reforge | test/architecture invariant：generation graph 无 reforge |
| character/slot utility | reviewed profile + main recommendation | pure utility evaluator | monotonicity 与 irrelevant-stat invariants |
| farming budget | **尚需产品决策** | 明确 `best-of-N target-slot drops` 或完整 source model | 参数写入 artifact；不同 budget 不可混用 |

关键未决项是 farming budget。参考模拟器只能支持“给定 slot 的一个自然 5★ piece”分布。若 V1 要表达真实刷取成本，还需定义：Cavern/Planar source、set 命中、slot 命中、每次产出数和预算单位；这些行为不能从参考仓库推出。

Phase 1 最保守且可验证的定义是：先把 benchmark 明确定义为 **conditional target-slot natural drops 的 best-of-N**，artifact 中写入 N。它不应宣传为 Trailblaze Power 等价，除非后续补齐 source model。

## 12. Benchmark Artifact / CDF Representation Analysis

当前合并后 97 个角色 × 6 slot = 582 个分布。

| Representation | 体积 | lookup | 误差/特性 | 再生成与 diff |
| --- | --- | --- | --- | --- |
| empirical sorted samples | 最高；若每分布 100k 样本即 58.2m 数值，JSON 可达数百 MB | `O(log n)` | 经验 CDF 精确 | 确定性可做，但不可接受且 diff 极差 |
| histogram | 约 `bins × 582` | `O(1)` 或 `O(log bins)` | bin 内插值误差；离散 atom 易被抹平 | 边界规则需稳定，review 一般 |
| dense quantile table | `Q × 582`，概率网格可隐式 | `O(log Q)` | CDF rank 误差约 `1/(Q-1)`；重复 quantile 可保留 atom | 确定、紧凑、结构简单 |
| sampled CDF `(x,p)` points | dense quantile 的约两倍 | `O(log Q)` | 可对 x 自适应，但 point selection 更复杂 | diff 较难解释 |
| 少量 p25…p99 | 极小 | 无法可靠计算任意 `F(x)` | 不满足 V1 runtime 公式 | 不可选 |

### 推荐

先实现固定概率网格的 dense quantile table：

- `p` 网格由 schema 隐式定义，例如 `i / 256`（257 点）或 `i / 512`（513 点）；artifact 只存单调 `rawUtility` cutoffs。
- runtime 用 upper-bound/binary search 求近似 percentile；对重复 cutoff 明确定义右连续经验 CDF语义。
- 257 点约 149,574 个数值；按普通 JSON 数字估算总 raw 体积约 1.2–1.8 MB。513 点约 2.4–3.6 MB。1001 点约 4.7–7 MB。应以真实生成结果和 Vercel function bundle 实测后选择。
- 0–100 最终显示为整数时，257 点最大 rank 网格误差约 0.39 percentage point，通常足够做 V1；算法测试仍使用未取整值。
- artifact 记录 `sampleCount`、seed、PRNG/model version、profile digest、probability/reference digest、budget、quantileCount。

建议先使用一个 committed JSON 以降低 loader 复杂度；如果实测 function bundle/cold start 不理想，再拆成 per-character shards + committed index。分片时要确认 Vercel function tracing；不要依赖运行时 sibling repo 或未打包的任意文件读取。

为了 reviewability，另生成一个小型 summary/index，包含每分布 `mean/p25/p50/p75/p90/p95/p99/min/max` 和 digest。summary 用于 code review，不替代 runtime quantile table。

## 13. Staleness, Digest & Build-Pipeline Integration

### 13.1 当前管线事实

- `src/lib/generated/*` 与 `static/generated/*` 被 `.gitignore`；clean build 通过 `data:ensure` 从 pinned upstream 重建。
- `scripts/deployment/build.ts` 的 Production 会 prepare pinned TurnBased/StarRailRes、`data:ensure`、`data:validate:build-inputs`、asset ensure、Vite build 和 closure checks。
- CI 的 develop push 运行 development profile；main PR 的 `Correctness` 运行 full semantic validation、unit tests、build 和 smoke E2E。
- 现有 manifest 已对 generated artifact 记录 bytes/SHA-256，并通过 `computeDataRevision()` 与 `validateGeneratedArtifacts()` 做 cheap integrity check。

### 13.2 新命令边界

建议 package commands：

```text
relic-score:profiles:generate     explicit, deterministic, maintenance
relic-score:benchmarks:generate  explicit, expensive, seeded maintenance
relic-score:validate             cheap schema/semantic/digest/staleness
relic-score:inspect              local fixture / benchmark diagnostics
```

它们的实现放 `scripts/relic-score/`，不要挂入 `data:ensure`、`prebuild` 或 `deploy:build` 的生成阶段。`relic-score:validate` 可以进入普通 CI/Production；两个 `generate` 命令只能由维护者或专用 workflow 显式执行。

### 13.3 Digest 范围

Profile input digest 应覆盖 canonical serialized：

- 角色 inventory/ID；
- 对应 `AvatarEquipmentRecommendation`（set/main/sub list，保留顺序）；
- template config；
- character override；
- profile generator/schema version。

Benchmark input digest 应覆盖：

- 对应 generated profile 的 scoring-relevant subset；
- probability model；
- 从 5★ affix configs 生成的 normalized reference data；
- farming budget/conditioning policy；
- benchmark algorithm、PRNG、seed policy、sample count、quantile schema version。

建议 digest 规范化后的最小输入，而不是整个 upstream commit；否则无关敌人/TextMap变化会制造假 stale。`sourceCommit` 仍应作为 provenance metadata 单独记录。

staleness 关系：

- 新角色、`AvatarRelicRecommend{,LD}`、template/override、generator version 变化 -> profile stale。
- profile 的 weights/targets/main recommendation、概率模型、5★ reference、budget、PRNG/algorithm/sample count 变化 -> benchmark stale。
- 仅本地化文案变化不应让 profile/benchmark stale。
- set display name或图片变化不应让 benchmark stale；set ID recommendation变化会让 profile stale，并让 Build Set Integrity输入变化。

### 13.4 是否提交 Git

- generated profile：应提交，便于人工审核和 Production 自包含。
- benchmark：应提交，因为昂贵生成不能进入 build；同时提交 schema/index/summary。机器文件可分片，避免一次更新重写所有角色。
- validator 在 build 中只重算 digest、检查 schema/coverage/单调性/finite values，不做 Monte Carlo。

## 14. Fixture / Local Debug Strategy

### 14.1 Raw provider fixture

现有 `tests/fixtures/enka/phase1-player.sanitized.json` 可以继续作为 adapter golden 基础。它已去掉 nickname/signature/friend/social 字段，并使用占位 UID。今后任何真实抓取必须移除或替换：

- root/detail UID；
- nickname、signature；
- friend count、privacy、record/social info；
- platform、personal card/head icon 等与评分无关且可能关联个人的信息。

raw fixture 只用于 decode/adapter，不应成为 scoring core 的默认输入。

### 14.2 Normalized fixture

新增 `tests/fixtures/relic-score/player-builds/*.json`，直接保存 `PlayerBuildInput`，包含 numeric actual values、canonical key、rarity/level/set/slot 和 roll evidence。它应被 core、Piece、Build、Breakpoint、Set Integrity、SSR component 与 regression 共用，并完全不含 provider/UID。

### 14.3 Synthetic matrix

至少提供可组合 fixture builders/JSON：

- 正常六件 5★ +15；极高质量；极差质量；
- BODY 错误主词条；SPHERE/ROPE 错误主词条；
- 低星、未满强化、缺 slot；
- 六件散件；推荐 Cavern 4pc + Planar 2pc；
- breakpoint `target - 1`、exact target、above target；
- 大量无效 roll、极端 SPD；
- profile missing、benchmark stale；
- roll count ambiguous / unavailable；
- unknown relic/affix、重复 slot、非法 count/step。

不要把这些场景都复制成完整大 JSON。建议一个小 canonical base fixture + typed builders，只有 adapter golden 和跨版本 regression 使用 JSON。

### 14.4 CLI / inspect

沿用 `tsx scripts/...` 风格，把 `score`、`inspect`、benchmark summary/diff 放入 `scripts/relic-score/`。CLI 应接收 fixture path 或 character ID，不直接请求 Enka；需要实时数据时由现有 `/api/player` 路径单独负责。

## 15. Testing / Regression Strategy

| 层 | 优先测试内容 | 可复用现有模式 |
| --- | --- | --- |
| pure unit | canonicalization、high-roll conversion、main/sub 分离、score monotonicity、unavailable propagation | `tests/unit/player-equipment.test.ts` 的 typed fixture |
| schema/semantic | profile/benchmark schema、coverage、monotone quantiles、digest、finite range | `build-input-validation.test.ts` 的 temp-root/rewrite pattern |
| adapter | Enka `cnt/step`、rarity/set resolution、numeric actual、illegal raw | `enka-player.test.ts` sanitized fixture |
| benchmark reproducibility | 同 seed byte-identical；不同 shard 顺序不影响；small deterministic sample | 注入 scripted/seeded RNG；不要复制参考实现 helper |
| property/invariant | 无 main/sub 冲突、sub 不重复、合法 roll 总数、增加有效 roll 不降 raw utility、CDF 单调且 [0,1] | `invariants.test.ts` 的 architecture assertions |
| regression fixtures | high/low/wrong main/breakpoint/set/unavailable 等关系 | normalized builders + 少量 JSON |
| UI component | badge available/unavailable、summary结构、无 score 时布局 | `svelte/server::render()` 的 component tests |
| E2E | 3/2/1 列布局、无横向溢出、header内容 containment、链接/可访问性 | `player-character.spec.ts` 当前 geometry 与 breakpoint assertions |
| golden score | 参数冻结后少量代表角色/slot | 延后；带 schema/model version |

第一版优先断言关系而非具体浮点：

- 更高同类有效 roll 不降低 RawSubUtility/Piece Score；
- 非推荐 main 不会被当成推荐；
- irrelevant stat 不增加有效命中；
- exact breakpoint 不应被判未达标；
- `unavailable !== 0`；
- CDF 单调；
- 相同输入、profile、artifact 必须确定性输出；
- Piece Score 不受其他五件 set/breakpoint 影响；Build Score 才消费全局条件。

## 16. Risks & Blockers

| 等级 | 问题 | 证据与影响 | 处置 |
| --- | --- | --- | --- |
| NON-BLOCKING | stable stat canonical key | `PropertyType` 已贯通三方 | 新增受限 `RelicStatKey`，不另造名称 key |
| NON-BLOCKING | recommendation 按角色/slot 解析 | 97/97 recommendation 完整；现有 invariants 校验 | 直接消费 existing domain |
| NON-BLOCKING | 5★ main/high-roll reference | 当前 upstream affix config 足够 | 保留 `StepNum` 并生成专用 reference |
| LOW RISK | Enka direct roll count | `cnt` 直接存在，但 decoder 无语义范围校验 | adapter 增加 legality validation |
| MEDIUM RISK | 单次 roll grade 不可得 | 仅有累计 `step` | high-roll equivalent 不需逐次序列；显式记录 provenance |
| NON-BLOCKING | panel stat 支持 breakpoint | numeric `values` 已有 golden coverage | 在 presentation 前构造 `PlayerBuildInput` |
| MEDIUM RISK | UI contract 丢精确字段 | public DTO 只有 display string，缺 tid/rarity/step | server pipeline 中先 score，或显式扩展 normalized DTO |
| HIGH RISK | 2+2 recommendation 不可表达 | `Set4IDList` 只有单 set 候选 | V1 不擅自接受 2+2；等待上游或受审 override 决策 |
| HIGH RISK | farming budget/source 未定义 | 参考 simulator 只接收 slot | 先明确 conditional target-slot best-of-N；避免“真实体力”措辞 |
| HIGH RISK | 关键概率 provenance 不完整 | main probability/sub weight 不在当前 upstream config | 本地受审 config + 来源说明 + empirical/外部验证 |
| LOW RISK | benchmark artifact 体积 | 257 quantile 估算 1.2–1.8 MB raw | 原型实测；必要时 per-character shard |
| NON-BLOCKING | benchmark digest | 当前项目已有 canonical JSON/SHA-256/manifest 先例 | 对 normalized minimal inputs hash |
| NON-BLOCKING | Production 被迫模拟 | 当前 build 可只增加 validator | generator 永不挂到 `data:ensure/prebuild/deploy:build` |
| NON-BLOCKING | self-contained | 所有必要 game data 已由 pinned TurnBased 进入项目 | 独立实现；参考仓库不成为依赖 |

## 17. Recommended Phase 1 Implementation Boundary

建议 Phase 1 只建立可验证的数据与评分核心，不同时做大规模 UI 调整：

1. 定义 `RelicStatKey`、`PlayerBuildInput`、roll evidence、profile/benchmark/result union。
2. 扩展现有 generated player runtime 或生成 scoring reference，保留 rarity、`StepNum` 与 5★ reference；不改变现有显示。
3. 在 Enka canonical/runtime resolution 后实现 `normalizePlayerBuildInput()`，并用当前 sanitized fixture 覆盖。
4. 建立 template -> inference -> override -> generated profile -> validation；直接消费现有 recommendation。
5. 决定并文档化 V1 farming budget；建立独立 seeded probability model 和 property tests。
6. 用小规模样本原型比较 257/513 quantile 的体积与误差，再生成 committed benchmark。
7. 实现 pure scorer 与 normalized fixtures，优先不变量测试。
8. 最后才把 score result 以新增 optional presentation 字段接到现有 `PlayerRelicCard` / `PlayerEquipmentSection`；不重构 card。

Phase 1 的完成门槛应是：同一个 normalized fixture 在无网络环境下可得到确定性 score/unavailable 结果；profile/benchmark stale 会被 cheap validator 拒绝；Production build 不执行 benchmark generation。

## 18. Open Questions / Decisions Required

1. V1 farming budget 到底是 `best-of-N target-slot drops`、`N source runs`，还是开拓力？建议先选第一种并明确命名。
2. benchmark 是否条件于“主词条合法/推荐”，还是自然抽取所有 main 后让 main score参与？二者会显著改变 CDF，必须写入 artifact identity。
3. Cavern 2+2 是否属于 V1 合法推荐方案？当前 Source of Truth 不表达；若必须支持，需要上游结构或正式 override policy。
4. `SubAffixPropertyList` 的顺序是否可作为 weight inference？当前只能确认顺序被保留，不能确认数值语义。
5. raw `ScoreRankList` 与 `LocalCriticalChance` 是否与新算法相关？当前建议忽略，除非另做语义调查。
6. `cnt` UI 文案目前称“强化次数”，而实际公式表示总 occurrence count；Phase 1 是否顺便纠正文案不属于 core，但应避免把旧文案语义带入评分。
7. benchmark quantile 取 257 还是 513？应由真实误差/体积测量决定，不在 Phase 0 凭感觉冻结。
8. score 在 server endpoint 内计算还是把 normalized input 送到 client？推荐 server 侧先算，以免公开 DTO 膨胀和浏览器加载全部 benchmark；需要用真实 bundle size验证。

## 19. Files Inspected

### HSR-Database

- `AGENTS.md`、`package.json`、`.gitignore`、`vite.config.ts`、`svelte.config.js`、`vercel.json`、`upstream.lock.json`
- `api/player.ts`
- `api/_player/errors.ts`
- `api/_player/enka/{client,decode,adapter,pipeline}.ts`
- `src/lib/player/{canonical,contract,client,cache,resolve,character,equipment,equipment-client,property-semantics,runtime-data,stat-synthesis}.ts`
- `src/routes/player/+page.{server.ts,svelte}`
- `src/routes/[category=category]/[id]/+page.{server.ts,svelte}`
- `src/lib/components/shared/DetailPage.svelte`、`SectionHeading.svelte`
- `src/lib/components/player/{PlayerEquipmentSection,PlayerRelicCard,PlayerAffixRow,PlayerStatsPanel}.svelte`
- `src/lib/components/character/EquipmentRecommendationSection.svelte`
- `src/lib/domain/{types,neutral,equipment-recommendation-view}.ts`
- `scripts/data/{sync,raw,paths,source-requirements,character-sources,player-runtime,generated-artifacts,ensure,source-metadata}.ts`
- `scripts/data/domain/{character,relic}.ts`
- `scripts/data/projection/relic.ts`
- `scripts/data/robustness-invariants.ts`
- `scripts/data/validation/{build-inputs,full}.ts`
- `scripts/deployment/build.ts`
- `.github/workflows/{ci,vercel-preview,update-upstreams}.yml`
- `docs/architecture/localization-and-data-generation.md`
- `docs/investigations/{enka-player-data-migration-audit-2026-09-22,enka-migration-infrastructure-phase1-2026-09-22,enka-production-cutover-2026-09-22,player-stat-synthesis-audit-2026-09-22}.md`
- `tests/fixtures/enka/phase1-player.{sanitized,expected-stats}.json`
- `tests/unit/{enka-player,player-handler,player-equipment,player-stat-synthesis,player-components,player-character-components,player-runtime-generation,build-input-validation,invariants}.test.ts`
- `tests/e2e/player-character.spec.ts`
- `src/styles/app.css`、`src/styles/presentation/{detail-hero,detail-inspection}.css`

### TurnBasedGameData（只读）

- `ExcelOutput/AvatarRelicRecommend{,LD}.json`
- `ExcelOutput/AvatarEquipRecommend{,LD}.json`
- `ExcelOutput/RelicConfig.json`
- `ExcelOutput/RelicBaseType.json`
- `ExcelOutput/RelicMainAffixConfig.json`
- `ExcelOutput/RelicSubAffixConfig.json`
- `ExcelOutput/RelicMainAffixBaseValue.json`
- `ExcelOutput/RelicSubAffixBaseValue.json`
- `ExcelOutput/AvatarPropertyConfig.json`
- 与现有 generator 所需的 character/relic set 表关系

### HSR-Relic-Simulator-Cross-Platform（只读）

- `README.md`
- `src/logic/{RelicSystem,RelicData,ConfigService,RandomSource,AffixCalculator}.ts`
- `src/types/{relic,enums,config}.ts`
- `src/data/{MainAffixProbabilityConfig,MainAffixConfig,SubAffixConfig}.json`
- `src/logic/__tests__/RelicSystem.test.ts`
- `src/benchmarks/simulator.bench.ts`
- reforge/create/level UI 调用点（只用于确认模式边界）

`StarRailRes` 未发现影响评分算法的数据依赖；未来仅继续作为现有图标/遗器图片来源即可。

## 20. Final Recommendation

可以安全进入 Phase 1，但应把第一目标定义为“建立一个自包含、可审核、provider-neutral 的评分输入与离线 benchmark contract”。当前代码最有价值的资产不是 UI，而是刚完成的 Enka canonical/runtime/synthesis 分层；Relic Score 应直接接在这一层上。

不建议先做的事情：从 `PlayerRelic.display` 解析数值、复制推荐列表、把模拟器仓库变成依赖、把 Monte Carlo 放进 Production build、把所有 `Set4IDList` 组合成 2+2、或在算法未稳定时写死大量 golden 分数。

建议的 Phase 1 首个可合并切片是：`PlayerBuildInput + 5★ reference extraction + profile schema/generator/validator + fixtures`。完成后再独立提交 probability/benchmark/scorer，最后以小幅 prop/presentation 增强接入现有 Card 和 Build Summary。
