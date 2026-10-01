# 遗器主词条 accepted 扩充与评分份额调整调查

调查日期：2026-10-01（UTC+8）。范围：仅调查，不实施。

依据：工作区 `Relic-Score-Feature/codex-relic-main-stat-inference-investigation.md`。本报告中的代码路径除 `../TurnBasedGameData/` 外均相对于 `HSR-Database/`。数据与结论限定于本地快照，不验证玩家使用率或实战配装收益。

## 1. Executive Summary

**方案可行，适合现有架构，建议分阶段实施。** 可以在现有 `data/relic-score/profile-overrides.json` 中加入稀疏正向增补和 slot agnostic 配置，使用现成 canonical stat registry 完成有效副词条推导，无需新增独立配置文件、角色定位推断、外部 API 或复杂 stat 映射。

建议采用以下边界：

- accepted 集合为上游推荐、合法且权重为正的同名副词条主词条、显式 `addAccepted` 的并集；不支持删除上游推荐。
- `agnostic` 是独立的 slot 评价模式，退出主词条维度；不展开成“所有合法主词条 accepted”。
- accepted 推导只读取推荐、最终 `substatWeights` 和主词条例外；不读取 soft/hard target、面板或其他装备。
- 单件与 build 共用已经归一化的主、副词条贡献。`agnostic` 下分别为 `0` 与副词条 percentile，防止 build 再乘一次 `0.75`。
- 普通副词条权重、采样和实际主词条条件 CDF 不变时，无需重新生成正式 farming benchmark；profile 的 schema、digest、审核和生成产物则需要同步维护。

最大风险有三项：

1. **扩充范围大。** 98 个 AvatarID 中，83 个（84.69%）新增 accepted，增加 173 个“角色／slot／stat”组合，攻击百分比占 124 个。正权重表示“副词条有收益”，不自动证明该属性适合作为高占比主词条。此处是拟议规则的明确产品语义，应人工检查代表性变化。
2. **现状并非纯二元主词条评分。** 当前 `mainCompletion = suitability × clamp(actual / fiveStarAt15)`。严格采用拟议公式会删除强化值完成度，改变低星、未满级和固定主词条的得分行为；不能将其当成单纯 `0.35 → 0.25` 调参。
3. **build 当前重算分量。** 仅在 `scorePiece` 特判 agnostic 会造成卡片分与 build 分不一致。

两个指定案例已确认：长夜月为 `1413`，绳只推荐 `HPAddedRatio`，ERR 必须显式增补；「银狼LV.999」为 `1506`，不是旧银狼 `1006`，球／绳均推荐 HP% 与 DEF%，有效副词条只有 SPD／CR／CD，适合用两个 slot 的显式 agnostic 表达题设意图。

### 调查基线与已执行验证

| 项目 | 本次快照／结果 |
| --- | --- |
| 网站分支与 HEAD | `develop`，`13a85063d9b494b8dc7d8ea045c59824f4eb1879` |
| sibling TurnBasedGameData HEAD／锁定提交 | `df3aa4ad71806bd083b1a0ddc938f5aa95c4933e` |
| sibling StarRailRes HEAD／锁定提交 | `dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487`；未用于本次业务数据调查 |
| 当前 generated manifest | schema `47`，sourceCommit `6b2bc17ebf461e497ba0dd0ffd44875f1866762b`，gameVersion `4.6` |
| 当前 scoring profiles | schema `3`，98 份，全部 `reviewed`；provenance sourceCommit 均为 `8b178dd48698e5e7b12f0cc319ddab149f2ffc5c` |
| `pnpm relic-score:validate` | 98 份通过 |
| `pnpm relic-score:benchmarks:validate` | 2744／2744 分布通过 |
| 相关现有单测 | 8 个文件，47 项通过；命令见第 8 节 |

三个 sourceCommit 不同，不应混为一个来源快照。`validateProfiles` 有意不将 provenance commit 的文本差异视为评分语义差异，而会重新生成并比较输入 digest 与实际 profile 字段。本次另外读取 sibling 的 `AvatarRelicRecommend.json` **与** `AvatarRelicRecommendLD.json`，按项目规则合并，对 98 个 ID 的四个主词条列表和副词条列表逐项比较，均与 generated runtime 一致。因此本次涉及的推荐字段不存在已发现的快照漂移；此结论不等于对所有游戏表执行了全量同步校验。

初始网站及两个 sibling 均无工作区变更；交付范围仅本 Markdown 报告。没有 regenerate／approve profiles，没有修改正式代码、配置、测试或 benchmark。

## 2. Current Architecture

### 2.1 上游推荐 → domain → generated 推荐 → profile／runtime

```text
upstream.lock.json + HSR_DATA_ROOT
  → ExcelOutput/AvatarRelicRecommend.json + AvatarRelicRecommendLD.json
  → readRaw/readTable + mergeConfigSources
  → buildCharacterDomain：equipmentRecommendation
  ├→ projectCharacterView → generated/views/zh-CN/details/characters/{id}.json
  │   → loadProfileInputs + templates + overrides
  │   → generateCharacterProfile → character-profiles.json
  └→ data/sync.ts → generated/runtime/relic-score-recommendations.json
      → server/relic-score/player.ts → scorePiece / scoreBuild
```

| 层 | 实际路径与关键 symbol | 作用 |
| --- | --- | --- |
| source 准备 | `scripts/deployment/prepare.ts`：`prepareTurnBasedGameData`；`scripts/deployment/git.ts`：`prepareCheckout` | deployment 使用 lock 在网站内 `.upstream/TurnBasedGameData` 准备 pinned checkout。本次没有运行这些可能抓取／写入的步骤 |
| 本地 source 路径 | `scripts/data/paths.ts`：`resolveDataRoot`、`assertDataRoot` | `HSR_DATA_ROOT`，默认 `../TurnBasedGameData` |
| source 清单 | `scripts/data/source-requirements.ts`；`scripts/data/character-sources.ts`：`characterLdSourceSpecs`、`loadCharacterDomainTables` | 正式推荐表与 LD 推荐表均为真实来源，不能漏算 LD 角色 |
| raw parser | `scripts/data/raw.ts`：`readRaw`、`readTable`、`mergeConfigSources` | lossless-json；TextMap hash 保留十进制字符串。相同 identity 的完全相同记录去重，冲突报错，不静默覆盖 |
| domain | `scripts/data/domain/character.ts`：`buildCharacterDomain` | 按 `AvatarID` 关联推荐；`PropertyList3/4/5/6 → BODY/FOOT/NECK/OBJECT`；`SubAffixPropertyList → subStatPropertyTypes`；另读 `Set4IDList/Set2IDList` |
| locale projection | `scripts/data/projection/character.ts`：`projectCharacterView` | `AvatarEquipmentRecommendation.avatarId = domain.id`；数值推荐字段沿用 domain |
| 中间产物 | `scripts/data/sync.ts` | 写 `src/lib/generated/views/{locale}/details/characters/{id}.json` 与独立 locale-neutral `src/lib/generated/runtime/relic-score-recommendations.json` |
| profile 输入 | `scripts/relic-score/validate.ts`：`loadProfileInputs` | 从 manifest 的角色路线清单读取中文 detail 的 ID、path、equipmentRecommendation；不是从 StarRailRes index 推导 |
| runtime 推荐 | `src/lib/relic-score/recommendations.ts`：`RelicScoreRecommendation`、`assertRelicScoreRecommendations` | projection 保留 avatarId、套装、四槽主词条、副词条；runtime 检查 shape、ID 和四槽覆盖 |

**修正题设的一处现状假设：主词条推荐没有保存在当前 `CharacterRelicScoreProfile` 字段里。** 推荐进入 `profileInputDigest`，也参与模板与 scaling-stat 的生成；真正评分时 `ScoringSources` 分别传入 profile 与 recommendation。新方案应沿用这种职责划分，不能把 upstream 推荐改写成新规则的产物。

validation 分层：`assertRelicScoreRecommendations` 检查 runtime shape，但只要求 property 是字符串；`validateConfig` 进一步检查推荐有四个准确的 variable slots、主词条非空／不重复／合法落槽、副词条合法且非空，以及套装非空。`buildRelicScoreReferenceData` 对 registry 与真实 5★ affix 的合法主／副词条集合执行 closure 校验。

### 2.2 玩家 raw relic → normalized piece → 分数 → UI

```text
api/_player/enka/decode.ts / adapter.ts
  → CanonicalPlayerProfile / CanonicalPlayerRelic
  → api/_player/enka/pipeline.ts：resolveCanonicalPlayerProfile
  → synthesizePlayerProfile（stat-synthesis.ts，精确 OOC 面板）
  → normalizePlayerBuildInput（relic-score/normalize.ts）
  → scorePlayerCharacterBuild（server/relic-score/player.ts）
  → scoreProductionBuild + getProductionBenchmarkContext
  → scoreBuild → scorePiece
  → presentRelicScoreResult
  → PlayerRelicScorePresentation
  → PlayerEquipmentSection / PlayerRelicCard / PlayerRelicScoreSummary
```

`normalizePiece` 是 `normalize.ts` 内部函数：从 runtime relic identity 确定 rarity、最大等级、slot、main/sub affix group；使用 `playerMainAffixValue` 与 `playerSubAffixValue` 计算数值，输出 `NormalizedRelicPiece`。它会拒绝不合法等级／slot／stat、同名 main/sub 冲突、重复副词条、非法 roll count 和非正主词条值。`scorePiece` 并不替代完整的 raw normalization，例如直接给它人工构造的 piece 时，不会重新检查 main/sub 冲突。

server `benchmark-loader.ts` 的 `productionState` 校验 runtime 与 profile 覆盖，编译概率模型，构造全部合法主词条的 expected identity，并缓存正式 artifact 的验证结果。主词条不推荐仍可评分，查询的依然是该实际主词条对应的 benchmark，不会回退到旧的 slot 混合分布。

`presentRelicScoreResult` 删除 profile、benchmark 与逐 stat 内部解释，再序列化卡片 score、`mainCompletion`、`benchmarkPercentile`、`rawSubUtility`、有效命中及 build modifiers。当前 UI 卡片实际显示数值分，没有字母评级或主词条不符的评级上限。

### 2.3 当前主、副词条与 build 公式

实现位置：`src/lib/relic-score/score.ts` 的 `scorePiece`，`scoring-math.ts` 的 `pieceNormalized`，常量集中在 `scoring-config.ts` 的 `RELIC_SCORE_CONFIG.piece`。

```text
mains = 上游当前 slot 的 propertyTypes
HEAD/HAND：改为 reference.mainAt15[slot] 的合法固定主词条集合
suitability = mains.has(actualMainKey) ? 1 : 0
M = suitability × clamp(actualMainValue / fiveStarMainAt15, 0, 1)
U = Σ(subValue / fiveStarHighRoll × profile.substatWeights[key])
P = actualMainConditionedBenchmarkCDF(U) ∈ [0, 1]
PieceScore = 100 × (0.35×M + 0.65×P)
```

因此目前 variable slot 严格按 upstream whitelist 判 suitability，且有连续的**数值完成度**；没有主词条单独的 stat 权重表。`S` 若用于拟议公式，应明确为 `100×P`，不是 `100×U`，也不是“有效命中次数”。

build 使用 `scoreBuild`：六槽权重 HEAD／HAND 各 `0.1`，四个 variable slot 各 `0.2`。当前代码从每件 `mainCompletion` 与 `benchmarkPercentile` 分别重建 main、sub，而不是直接读取 `pieceScore`。

```text
B = Σ(slotWeight × (0.35×M + 0.65×P))
N = (95×B + 8×Is×SoftProgress + 5×Ih×(1−HardFailure))
    / (95 + 8×Is + 5×Ih)
FinalBuildScore = 100 × (0.95×N + 0.05×SetIntegrity)
```

`Is/Ih` 分别表示 profile 是否有 soft/hard 配置。它们没有配置时为 0，`N=B`。`coreBuildScore` 是未应用 modifiers 的参考分。套装完整性只读取 setId 与推荐套装，主词条政策不应改变它。

`evaluateSoftTargets`、`evaluateBreakpoints` 仅在 build 层读取最终 OOC 面板。当前 `scorePiece` 不读取这些字段，farming `rawSubUtility` 也只读权重。**没有发现主词条评分与 target／玩家面板的计算耦合。** profile digest 和审核包含 target 属于版本／可用性耦合：修改 target 仍可能使整份 profile 需重新审核，但不能因此将 target 当成 accepted 推导证据。现有 `inferTemplate` 已使用命途及推荐 stat 信号；新主词条 resolver 应只消费其最终权重，不新增定位推断，也不另行读取命途。

## 3. Existing Override System

### 3.1 文件、schema、loader 与合并顺序

真实配置是 [profile-overrides.json](../../data/relic-score/profile-overrides.json)，不是记忆中的 `character-profile-override.json`。与 [profile-templates.json](../../data/relic-score/profile-templates.json) 共同使用，没有额外的角色继承树。

类型在 `scripts/relic-score/profiles.ts`：

```ts
interface ProfileOverride {
  templateId?: TemplateId;
  scalingStat?: RelicStatKey | null;
  statWeights?: Partial<Record<RelicStatKey, number>>;
  hardBreakpoints?: SourceBreakpoint[];
  softTargets?: CharacterSoftTarget[];
  reviewedInputDigest?: string;
  note?: string;
}
// ProfileOverrideConfig.schemaVersion = 3
// ProfileTemplateConfig.schemaVersion = 1
// CharacterProfileArtifact.schemaVersion = 3
// PROFILE_GENERATOR_VERSION = 3
```

`loadProfileInputs` 通过 `JSON.parse` 读取普通 JSON，然后交给 `validateConfig`；不存在另外一份 JSON Schema 文件或通用深合并 parser。

生成顺序：

1. `inferTemplate(character)` 得到自动模板；显式 `templateId` 优先。
2. `resolveScalingStat` 查推荐百分比 HP／ATK／DEF；若不唯一再看主词条支持；显式 `scalingStat` 优先，`null` 明确表示不需要 scaling stat。
3. `resolveWeights` 只遍历 upstream 推荐副词条，取 `template[key] → scaling-stat → other-recommended → 0`。
4. `statWeights` 对同一 stat 覆写；`0` 删除最终权重，正值保留。
5. soft/hard arrays 直接采用 override 的数组，未配置则 `[]`；soft 按 stat 排序。不是追加合并。
6. `profileInputDigest`、review metadata、source provenance 进入 generated profile。

weight 允许值为 `[0, 0.25, 0.5, 0.75, 1, 1.25]`。没有负数、特殊 sentinel 或单独 disabled flag。缺省 key 在 runtime 按 `0` 处理。`statWeights` 不能给未被 upstream 推荐的副词条新增权重，这是现有约束；新的主词条 `addAccepted` 必须独立于它，不能靠给 ERR 填一个虚构副词条权重实现。

`validateConfig` 会拒绝未知 override 字段、孤儿角色、非法权重／stat、无效 scaling、冗余模板或权重 override、空 target 数组、重复 target、非有限阈值与非法 digest。`validateProfiles` 检查覆盖、顺序、至少一个正权重、完整生成结果一致、digest 与 stale review。新字段若不接入这些环节，当前 validator 会直接拒绝，或者新语义不会被审核追踪。

### 3.2 审核、diff、generated artifact 与 CI

维护流程见 [profile-maintenance.md](profile-maintenance.md)：编辑 source JSON → `relic-score:profiles:generate` → 检查 source/generated Git diff → `relic-score:profiles:review --character=ID` → 人工核对后 `--approve-current` → `relic-score:validate`。只 approve 指定角色；approve 命令会写 override 的 digest，重新生成并校验 profile。

`generate-artifact.ts` 的 `writeGeneratedProfiles` 允许暂时 stale reviews，写唯一产物 `src/lib/relic-score/generated/character-profiles.json`；正常严格 validate 拒绝已有批准 digest 与新输入不符。`review-core.ts` 的 `currentReviewSummary` 当前只展示模板、权重、targets 与 digest，新字段和 accepted 的来源解释需要加入 summary。没有独立的 profile diff 命令，diff 由 Git 与 summary 承担。

`profileInputDigest` 目前手动列举 semantic override 字段，忽略 `note`、`reviewedInputDigest`。因此新增 mainStatOverrides 时**必须加入 semanticFields**。不能只扩展接口和 JSON 读取。

CI 路径：`.github/workflows/ci.yml` 在 develop push／PR 运行 `ci:develop`，在到 main 的 PR 运行 `ci:validate`，后者还有 Chromium smoke。`scripts/deployment/build.ts` 两类 profile 均执行 data ensure、`relic-score:benchmarks:validate`、check、lint、unit tests；ci 还有 full data validation 与完整输出校验。`benchmarks:validate → loadProductionBenchmarkInputs → loadScoringInputs → validateCurrentProfiles` 间接覆盖 profile 检查。CI 与普通 prebuild **不执行 Monte Carlo benchmark generation，也不自动 approve profiles**。

结论：该体系很适合加入主词条例外。最小改造集中在现有 override 类型／validator、generator、digest／review summary 与 scoring，不需要另外一套文件或审批机制。

## 4. Proposed Minimal Design

以下均是未来建议，**不是当前可用 schema 或已经实施的代码**。

### 4.1 effective substat 与 stat 映射

建议有效判定：`(profile.substatWeights[key] ?? 0) > 0`，并同时要求 `relicStatSemantics(key).canBeSubstat` 及 `mainSlots.includes(slot)`。应从**最终生成权重**读取，而不是从原始推荐副词条列表读取。

| 属性 | 现有 canonical key | 可对应主词条的 slot |
| --- | --- | --- |
| HP% | `HPAddedRatio` | BODY、FOOT、NECK、OBJECT |
| ATK% | `AttackAddedRatio` | BODY、FOOT、NECK、OBJECT |
| DEF% | `DefenceAddedRatio` | BODY、FOOT、NECK、OBJECT |
| SPD | `SpeedDelta` | FOOT |
| CR | `CriticalChanceBase` | BODY |
| CD | `CriticalDamageBase` | BODY |
| EHR | `StatusProbabilityBase` | BODY |
| Effect RES | `StatusResistanceBase` | 无；`mainSlots=[]` |
| Break Effect | `BreakDamageAddedRatioBase` | OBJECT |
| flat HP／ATK／DEF | `HPDelta`／`AttackDelta`／`DefenceDelta` | HEAD／HAND／无；不映射百分比 |
| ERR | `SPRatioBase` | OBJECT，但 `canBeSubstat=false` |
| Outgoing Healing | `HealRatioBase` | BODY，但 `canBeSubstat=false` |
| 七种属性伤害 | `Physical/Fire/Ice/Thunder/Wind/Quantum/ImaginaryAddedRatio` | NECK，但 `canBeSubstat=false` |

该表是对 `RELIC_STAT_REGISTRY` 的说明，不应复制成另一份映射配置。主／副词条可以直接同名对应；flat／percent key 明确不同。`PLAYER_PROPERTY_SEMANTICS.panelTarget` 会将 HPDelta 与 HPAddedRatio 都映到面板 hp，但它是面板归因映射，**不可用于 accepted 推导**，否则会错误地把 flat 权重扩成百分比主词条。

本次 98 份 profile 的所有 upstream 推荐副词条都有正权重，没有实际为零的案例；仍须为 `0` 和缺省写合成测试。只有知更鸟 `1309` 有正 flat ATK 权重 `AttackDelta=0.5`，不会由此新增 variable slot ATK%。18 个角色有正 Effect RES 权重，合法 slot 检查使它们新增数量为 **0**。

### 4.2 推荐最小 source schema

沿用实际 enum `BODY/FOOT/NECK/OBJECT`，不要再引入 `sphere/rope` 或另一套 `energy_regen_rate` stat key。

```ts
type VariableRelicSlot = 'BODY' | 'FOOT' | 'NECK' | 'OBJECT';
interface MainStatOverrides {
  addAccepted?: Partial<Record<VariableRelicSlot, RelicStatKey[]>>;
  agnosticSlots?: VariableRelicSlot[];
}
// ProfileOverride 新增：mainStatOverrides?: MainStatOverrides
// CharacterRelicScoreProfile 新增同一语义字段，由 generator 规范化复制。
```

示例仅展示需要增补的字段，实施时必须保留角色现有配置：

```json
{
  "schemaVersion": 4,
  "overrides": {
    "1413": {
      "mainStatOverrides": {
        "addAccepted": { "OBJECT": ["SPRatioBase"] }
      }
    },
    "1506": {
      "mainStatOverrides": {
        "agnosticSlots": ["NECK", "OBJECT"]
      }
    }
  }
}
```

建议 override config 与 generated profile artifact `3 → 4`，generator `3 → 4`；template schema 无需改变。新字段缺省解释为无例外，generator 将数组去重／排序策略固定，审核摘要展示四槽 resolved 集合与来源。source validator 宜拒绝重复元素、空对象／空数组、未知字段、非法 slot／stat、slot 不支持的 stat，以及同一个 agnostic slot 再写 addAccepted 的冗余组合。不要求 addAccepted 在 upstream 副词条或主词条推荐中出现，否则无法表达 ERR 漏推荐。

已被基础并集接受的 addAccepted 属于冗余，可沿用项目的稀疏配置原则进行提示／拒绝；未来 upstream 补齐时应有清晰诊断，避免自动移除数据。HEAD/HAND 不提供这些 override 能力，保留固定合法主词条 accepted 的规则。

### 4.3 resolver 落点、单调性与数据边界

推荐在 `src/lib/relic-score/` 增加一个小型纯 resolver（具体文件名在实施时确定），由 score 与 review summary 共享；profile generator 仅规范化保存稀疏 exception，不复制／覆写 upstream 推荐。resolver 参数仅包含 slot、推荐主词条、最终副词条权重与主词条例外：

```text
U(slot) = upstream 推荐集合（固定槽为合法固定主词条集合）
I(slot) = { k | substatWeights[k]>0 ∧ canBeSubstat(k) ∧ slot∈mainSlots(k) }
E(slot) = validated addAccepted[slot]
A(slot) = U(slot) ∪ I(slot) ∪ E(slot)

slot 被配置 agnostic → evaluationStatus = agnostic
否则 actualMainKey∈A(slot) → accepted
否则 → mismatch
```

保证 `U ⊆ A`，上游原始数据不变。agnostic 不从 A 中删除推荐，只是在该 slot 不评价适配性；其 evaluationStatus 优先于 membership。这个区分消除“上游永远 accepted”与“agnostic 退出评分”之间的表面冲突。

resolver 可给 review／内部解释返回该 stat 的多个 evidence：upstream、effective-substat、explicit override。它不得接收 `PlayerBuildInput`、panel、targets、光锥或队伍，避免以后无意越界。角色模板已计算好权重，resolver 不关心模板名称。

### 4.4 agnostic、serialization 与 UI

当前 `PieceScoreValue` 只有 number 类型的 `mainCompletion`，不能区分 mismatch、未强化 accepted 与 agnostic。建议新增明确的 `mainStatStatus` 三态；若继续保留 mainCompletion，accepted／mismatch 下对应 `1/0`，agnostic 使用 `null` 表达退出维度，配套修改类型，不能冒充 accepted=1。

评分 helper 应一次输出 `mainContribution`、`subContribution` 与两者和 `pieceNormalized`，使 build 的 `aggregatedMainPart/aggregatedSubPart` 聚合真实贡献。agnostic 的 `mainContribution=0`、`subContribution=P`。这两个内部字段不必全部发送给 UI。

若 mainCompletion 改为 nullable 或公开新的状态语义，需同步 `src/lib/player/relic-score-contract.ts`、`relic-score/presentation.ts` 与相关序列化测试，建议 presentation `version:1 → 2` 明示契约更新。API envelope 无需新增另一个评分入口。UI 卡片仅显示数值，三态公式不强制要求增加视觉控件；为可解释性，可将 mainStatStatus 送到 presentation，后续决定是否展示。

另一个现有通道需知晓：`src/lib/player/equipment.ts` 的 `resolvePlayerRelicSlots/resolveAffix` 给主、副词条标注 `recommended`，依据仍是 upstream；`PlayerAffixRow` 消费该标记。它不是 scorer 的 accepted。扩充后可能出现“没有 upstream 推荐高亮、但评分 accepted”的情况。应保持两者语义清晰，不能直接改写 recommendation 数据来让高亮匹配评分。本次不修改 UI。

## 5. Main/Sub Weight Change

### 5.1 比例调整与纯三态公式是两项变更

`RELIC_SCORE_CONFIG.piece={mainShare:0.35,subShare:0.65}` 是唯一集中常量。`pieceNormalized` 只使用 alpha 与 `1-alpha`，build 则分别读取 mainShare、subShare；必须同时维护二者。当前 `validateScoringConfig` 检查份额和为 1，不会处理 slot agnostic。

严格采用题设的结果如下，令 `P=S/100`：

| 状态 | mainContribution | subContribution | PieceScore |
| --- | --- | --- | --- |
| accepted | 0.25 | 0.75×P | 25 + 0.75×S |
| mismatch | 0 | 0.75×P | 0.75×S |
| agnostic | 0 | P | S |

这会移除 `actual/mainAt15` 的评分乘数；数值仍用于 normalization 合法性与展示，5★ reference 仍用于副词条 roll-equivalent 和真实 main 合法表。若只改比例而保留数值完成度，则公式是 `25×clamp(actual/mainAt15)+0.75×S`，**不满足本次拟议的 accepted 固定拿 25 分**。建议下一阶段按题设严格实施，并把该变化单独说明／测试，不暗中折中。

HEAD/HAND 继续合法固定主词条 accepted，无需依赖相应 flat 副词条正权重。对于满级 5★ 固定槽，新 accepted 公式直接适用；对于低星／低等级固定槽，移除数值完成度也是预期变化，不能要求旧的“主词条半值、主分也减半”断言继续成立。

### 5.2 build 聚合与 invariant

正确的新 build base 为 `Σ slotWeight×pieceNormalized`。main/sub 解释字段应各自聚合已经算好的贡献，不再统一套 `0.25/0.75`。单件 agnostic 下归一一次即可，无需删除该 slot 或重分配六槽权重。

由此仍满足：

- 单件、build base、normalized statCompletion 均在 `[0,1]`；最终分在 `[0,100]`。
- 每个 slot 的主、副贡献之和等于 pieceNormalized；六槽权重仍和为 1。
- 固定主词条、无 agnostic 的满级 5★ build 有直接加权等价关系。
- soft/hard modifiers 与套装公式不变，不重复归一，也不将 agnostic 当成全 build 主词条退出。
- mismatch 上限是 75 分；无需额外评级封顶或拒绝评分。

不带 modifiers 时，某个 variable slot 的单件变化 `Δscore` 传到最终 build 为 `0.95×0.2×Δscore = 0.19×Δscore`。带 modifiers 时再乘 `95/(95+8×Is+5×Ih)`。这是同一套装备、同一面板／targets／套装下的算术影响；不代表换装后的实战收益。

### 5.3 benchmark 与 profile identity

正式 Lens B 是“同角色／slot／实际固定主词条，三件 5★+15 的最大 rawSubUtility CDF”，配置 N=3、K=65536、seed=123456789、257 点。每角色有 28 个合法主词条条件：HEAD 1、HAND 1、BODY 7、FOOT 4、NECK 10、OBJECT 5；98×28=2744。

`benchmark/identity.ts` 的 `profileScoringDigest` 只 hash `{characterId,substatWeights}`。`benchmarkIdentityDigest` 的正式 Lens B 不纳入 recommended main、main/sub 比例、targets、agnostic 或 profile schema／review note。因此只改主词条接受政策、份额或 exception，保持最终 substatWeights 与采样条件不变，**不需要 regenerate benchmark，也不应扩大其 digest 导致无意义 stale**。profile generator version 的迁移仍会使审核输入变化；先重新审核 profiles 后，现有 benchmark 数值可以继续验证。

诊断 Lens C 另有按推荐主词条筛选逻辑，其 identity 会包含 recommended mains；本次不应把它的筛选规则偷换成 scorer accepted。正式路径使用 Lens B。历史 phase/calibration JSON 包含旧分数，作为历史材料保留；未来实施需更新当前行为断言与新的审核结果，不能重写历史报告伪装成新基线。

即使 agnostic，仍按**实际主词条**查询 CDF。它表示不直接给主词条加／扣分，不意味着不同主词条下相同 U 必须得到相同 S。主词条与同名副词条互斥，条件 CDF 仍可能不同；若要令 agnostic 下完全不受 main-conditioned CDF 影响，那是另一项 benchmark 设计变更，本次不建议加入。

## 6. Case Studies

### 6.1 长夜月 `1413`

身份依据是 raw `AvatarConfig.AvatarID=1413`、`AvatarVOTag=evernight`、`AvatarName.Hash="14327888430982372557"`，以及对应 generated detail 的中文名称和 path `Memory`。推荐依据是 raw `AvatarRelicRecommend.AvatarID=1413`，与 generated runtime 一致：

| slot | upstream 主词条 | 自动推导新增 |
| --- | --- | --- |
| BODY | CD、CR | HP% |
| FOOT | SPD、HP% | 无 |
| NECK | Ice DMG、HP% | 无 |
| OBJECT | HP% | 无；ERR 不可推导 |

现有 profile：`CriticalChanceBase=1.25`、`CriticalDamageBase=1.25`、`HPAddedRatio=1`、`SpeedDelta=0.25`；soft/hard 均为空。现有 override 只有 SpeedDelta 的 `0.25` 与 reviewed digest。

最小未来增补是 `mainStatOverrides.addAccepted.OBJECT=["SPRatioBase"]`。它只增加该 slot 适配，保留当前权重及 targets；不会让 ERR 成为普通副词条，也不会自动接受所有角色 ERR 绳。本报告仅确认题设需求的配置表达与评分影响，不使用 `SPNeed` 反推能量循环合理性。

固定种子、单件自然生成调查样本（见第 7 节）：ERR 绳 U=3.5，S=53.90625。旧分 35.03906；仅调整份额仍 mismatch 为 40.42969；显式 ERR accepted 后为 **65.42969**。自动 HP% 衣服样本 S=72.65625，旧 47.22656，新 79.49219。

### 6.2 「银狼LV.999」`1506`

raw `AvatarConfig.AvatarID=1506`、`AvatarVOTag=silverwolflv999`、`JsonPath` 指向 `Avatar_SilverWolf999_00_Config.json`；generated detail 名称为 `银狼LV.<unbreak>999</unbreak>`，path `Elation`。这与 `1006` 的旧银狼不同，不能靠名称片段替代 ID 关联。

raw 与 generated 推荐：BODY CR／CD，FOOT SPD，NECK HP%／DEF%，OBJECT DEF%／HP%。最终权重 `CR=0.75`、`CD=0.75`、`SPD=1.25`；override 有 `scalingStat:null`，hard breakpoint 为 `SpeedDelta≥160`，soft 为空。

自动推导不会增加任何 variable slot 主词条：三个有效 stat 的合法主槽已被推荐覆盖。仅“上游 + 有效副词条”不能解决其内圈的题设问题。推荐显式 `agnosticSlots=["NECK","OBJECT"]`，保留当前 SPD breakpoint；它只在最终 build 层评价速度，与内圈主词条政策无关。

列举全部主词条 accepted 的局限：需要穷举球 10 项、绳 5 项，并随合法 stat 清单维护；即使列全，得分仍为 `25+0.75×S`，低质量副词条也有固定 25 分。agnostic 得分为 S，在 S=0 时是 0，而非 25；S=100 时两者均为 100。

本次生成样本体现两个方向：

- 原已推荐 HP% 球，S=47.65625：旧 65.97656 → 新普通 accepted 60.74219 → agnostic **47.65625**。agnostic 不保证所有分数提高。
- 原未推荐 Imaginary DMG 球或 ERR 绳，S=53.125：旧 34.53125 → 新普通 mismatch 39.84375 → agnostic **53.125**。

其 build 有 hard、无 soft：单个内圈 piece 的 Δscore 对最终 build 影响为 `0.95×0.2×95/100×Δscore=0.1805×Δscore`。例如上述 HP% 球相对旧公式的变化约 `−3.30682` build 分，未推荐球／绳各约 `+3.35617` 分，其他分量固定时成立。不是给整个 build 再补／扣一份 25 分。

题设“该角色内圈主词条不应参与评分”是显式产品／配置决策；静态 profile 证实它目前没有 HP／DEF 正权重，但仅据此不能自动判定其他角色的某槽 agnostic。

## 7. Impact Analysis

### 7.1 统计口径与结构影响

分母为当前 98 个 generated profile 的 **AvatarID**，包括开拓者各形态／性别等独立 ID，未按展示名称合并。仅模拟四个 variable slots 的有效副词条同名扩充，不包括未来 ERR exception 与 agnostic 配置；不修改原始数据，不运行大型 Monte Carlo。

| 指标 | 结果 |
| --- | --- |
| accepted set 完全不变的角色 | 15／98（15.31%） |
| 至少一个 slot 增加 accepted 的角色 | 83／98（84.69%） |
| 上游 accepted 组合 | 592 |
| 推导后 accepted 组合 | 765，新增 173（+29.22%） |
| 新增数量的角色分布 | 0：15；1：33；2：24；3：16；4：6；5：4 |
| 至少新增一项 HP%／DEF% 的角色 | 17 |
| 至少新增一项权重 ≤0.5 的主词条的角色 | 9 |

| slot | 增加的角色数 | 新增组合数 | 新增属性构成 |
| --- | --- | --- | --- |
| BODY | 70 | 82 | ATK% 51，CR 9，CD 9，HP% 7，EHR 4，DEF% 2 |
| FOOT | 42 | 42 | ATK% 29，HP% 6，DEF% 4，SPD 3 |
| NECK | 36 | 36 | ATK% 34，HP% 1，DEF% 1 |
| OBJECT | 13 | 13 | ATK% 10，HP% 1，DEF% 1，Break Effect 1 |
| 合计 | 角色跨槽重复，不求和 | 173 | ATK% 124、HP% 15、DEF% 8、CR 9、CD 9、EHR 4、SPD 3、Break Effect 1 |

新增组合按触发权重分布：1.25 为 14，1 为 89，0.75 为 46，0.5 为 23，0.25 为 1。没有自动新增 ERR、Healing、Elemental DMG、Effect RES 或 variable-slot flat 主词条。最终集合最大大小：BODY 4／合法 7，FOOT 3／4，NECK 3／10，OBJECT 3／5；没有把某个 variable slot 的全部合法主词条自动放行。

15 个无扩充 ID：`1001,1101,1215,1225,1301,1303,1306,1313,1321,1414,1502,1506,1513,8005,8006`。**集合不变不等于评分不变**：改变 main/sub 份额仍会让它们在 P<1 时发生分数漂移。

### 7.2 优先人工 review 的真实例子

| 角色 ID／名称 | 自动新增重点 | review 理由 |
| --- | --- | --- |
| `1006` 银狼 | BODY ATK%／CD，FOOT／NECK／OBJECT ATK%；共 5 项 | 有效权重扩到不同槽；与 `1506` 严格区分 |
| `1009` 艾丝妲 | 同上，共 5 项；触发 ATK%／CD 权重均 0.5 | 低权重也完整获得 25 分，尤其 upstream 仅 ERR 的绳 |
| `1106` 佩拉 | 同上，共 5 项；ATK% 0.75，CD 0.5 | 不能把“副词条有收益”解释成最优主词条 |
| `1111` 卢卡 | BODY CR／CD，FOOT／NECK ATK%，OBJECT Break Effect；共 5 项 | CR／CD 为 0.5；唯一 0.25 新增是击破绳 |
| `1208` 符玄 | 四槽均 DEF%，触发权重 0.5 | 本次低权重 defensive 扩张的明确例子 |
| `1212` 镜流 | BODY CR、NECK HP% | 实际当前 HP% 权重为 1，上游也多处推荐 HP%；应先复核现有输入语义，不能凭通用角色印象删除它 |
| `1309` 知更鸟 | FOOT SPD、OBJECT ATK% | 正 flat ATK 权重不能参与 percent 推导；SPD 政策变化需复核 |
| `1413` 长夜月 | BODY HP%；ERR 需显式增补 | 校验只增补主词条政策，现有 SPD 0.25 保留 |
| `1506` 银狼LV.999 | 自动无新增，内圈拟 agnostic | 独立于有效副词条推导的显式配置决策 |

低权重 HP／DEF（≤0.5）造成的新增仅有符玄 DEF% 四项，**不是大量角色获得弱防御 fallback**。18 份 Effect RES profile 全部合法落槽为空，没有扩张。主要宽化实际来自攻击百分比，而非题设担心的 Effect RES。

当前数据不足以证明应增加“辅助 HP／DEF 生存 fallback”。有些弱权重 stat 可接受但不最优，已经由题设“宁可放过”的语义覆盖；漏掉的无同名副词条主词条通过稀疏显式配置处理。若人工 review 明确认为某类正权重不能作为自动 accepted 证据，最小后续选项是配置单独的“是否允许由该副词条推导”语义，仅控制 I 集合，保留 upstream 单调性；不要降低副词条权重来绕过主词条规则，因为那会改变 U 与 benchmark。**本阶段不建议预先加入这项额外能力，也不引入统一权重门槛或角色定位 heuristic。**

### 7.3 理论分差

以下令满级 5★／旧数值完成度为 1，并保持实际主词条、U 与 CDF 不变：

| 变化 | 旧分 → 新分 | Δscore |
| --- | --- | --- |
| 原 accepted 仍 accepted | `35+0.65S → 25+0.75S` | `−10+0.1S`，范围 −10～0 |
| 原 mismatch 仍 mismatch | `0.65S → 0.75S` | `0.1S`，范围 0～10 |
| 原 mismatch 新 accepted | `0.65S → 25+0.75S` | `25+0.1S`，范围 25～35 |
| 原 accepted 新 agnostic | `35+0.65S → S` | `−35+0.35S`，范围 −35～0 |
| 原 mismatch 新 agnostic | `0.65S → S` | `0.35S`，范围 0～35 |

若旧 accepted 的数值比例为 r<1，则新 accepted 的分差为 `25−35r+0.1S`，可以上升。这个效应与集合扩充不同，未来 drift 审计必须分开。

### 7.4 已有 fixture 的真实评分对照

使用 `tests/fixtures/relic-score/player-builds/complete-five-star.json` 的流萤 `1310` 六件装备，读取现有正式 benchmark，按拟议公式做独立算术模拟；fixture、生产实现与 artifact 均未改变。该 build 原本全部主词条 accepted，故下面只体现份额变化。

| slot／主词条 | S（percentile×100） | 当前分 | 拟议分 | Δ |
| --- | ---: | ---: | ---: | ---: |
| HEAD／HPDelta | 98.38542 | 98.95052 | 98.78906 | −0.16146 |
| HAND／AttackDelta | 88.82212 | 92.73438 | 91.61659 | −1.11779 |
| BODY／ATK% | 61.52344 | 74.99023 | 71.14258 | −3.84766 |
| FOOT／SPD | 77.73437 | 85.52734 | 83.30078 | −2.22656 |
| NECK／ATK% | 88.28125 | 92.38281 | 91.21094 | −1.17188 |
| OBJECT／Break Effect | 85.93750 | 90.85938 | 89.45313 | −1.40625 |

build base `0.87920443 → 0.86062049`，最终分 **88.52442 → 86.75895（−1.76547）**。套装完整性=1，当前该 profile 的 soft 配置不存在、hard 失败比例=0，modifiers 按现有公式保留。不是修改 fixture 面板来补偿分差。

### 7.5 可复现的小样本

用现有 `generateNaturalRelic(slot, model, createSeededRng(123456789), mainKey)`，每种条件只生成一件真实模型的 5★+15 piece；不挑种子、不筛最佳、共 8 件。这些是调查用合成样本，**不是玩家使用率或角色实战配装样本**。每件实际 stat 数值取自现有 runtime／概率模型，查询正式该角色／slot／main 分布。

| ID／slot／main | U | S | 当前 | 仅自动规则＋25/75 | 加拟议显式例外 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1413／OBJECT／ERR | 3.50000 | 53.90625 | 35.03906 | 40.42969 | 65.42969（addAccepted） |
| 1413／BODY／HP% | 3.50000 | 72.65625 | 47.22656 | 79.49219 | 同左 |
| 1506／NECK／HP% | 2.10000 | 47.65625 | 65.97656 | 60.74219 | 47.65625（agnostic） |
| 1506／NECK／Imaginary DMG | 2.10000 | 53.12500 | 34.53125 | 39.84375 | 53.12500（agnostic） |
| 1506／OBJECT／ERR | 2.10000 | 53.12500 | 34.53125 | 39.84375 | 53.12500（agnostic） |
| 1208／BODY／DEF% | 0 | 1.17188 | 0.76172 | 25.87891 | 同左 |
| 1310／FOOT／ATK% | 0 | 12.50000 | 8.12500 | 34.37500 | 同左 |
| 1310／FOOT／DEF% | 0 | 1.56250 | 1.01563 | 1.17188 | 同左 |

这些样本恰有相同四个副词条：CD=0.1814400016（3 次）、flat ATK=35.986915（2 次）、EHR=0.0432000026（1 次）、flat DEF=35.986915（2 次）。不同角色权重／条件分布得到不同 U、S。U=0 仍可能有非零 S，因为当前 right-continuous CDF 对零值 ties 有 percentile；这不是本方案引入的错误，不能把 agnostic 直接替换成 raw utility。

## 8. Tests / Validation Plan

### 8.1 本次执行的检查

profile 与 production benchmark validator 均为只读；单测没有重新生成／批准正式 artifact。最初 `pnpm exec vitest` 未识别本地命令 shim，确认仓库已有 Vitest CLI 后通过其实际入口完成同一批检查：

```powershell
pnpm relic-score:validate
pnpm relic-score:benchmarks:validate
node node_modules/vitest/vitest.mjs run `
  tests/unit/relic-score-profiles.test.ts `
  tests/unit/relic-score-scoring.test.ts `
  tests/unit/relic-score-normalize.test.ts `
  tests/unit/relic-score-reference.test.ts `
  tests/unit/relic-score-benchmark.test.ts `
  tests/unit/relic-score-presentation.test.ts `
  tests/unit/relic-score-player-integration.test.ts `
  tests/unit/relic-score-boundary.test.ts
```

结果：98 profiles、2744 distributions、8 文件／47 测试通过。这只证明当前基线可用及本次调查有可靠输入，**不是拟议实现的测试结果**。文档调查没有运行全量 build、浏览器、远程部署或实时 API。

### 8.2 未来实施的针对性矩阵

| 必须验证的行为 | 适合落点／调整 |
| --- | --- |
| upstream 永远包含于 accepted，即使对应副权重为 0 | resolver 纯逻辑测试；加入逐集合 monotonic invariant |
| 正权重同名副词条仅扩合法 slot | resolver：HP%／ATK%／DEF%、SPD、CR、CD、EHR、BE 的参数化测试 |
| 零、缺省权重不扩充；Effect RES、flat 不跨类型 | 合成 profile fixture；不要依赖当前 98 份都正权重的事实 |
| ERR／Healing／Elemental DMG 不自动推导 | 上游推荐仍 accepted；无上游时保持 mismatch；显式增补单独验证 |
| addAccepted 精确增补、去重、合法性及不可删除 upstream | `relic-score-profiles.test.ts`、resolver；validator 拒绝非法／孤儿字段 |
| agnostic 只针对配置 slot | resolver＋`relic-score-scoring.test.ts`；相同 S=0/50/100 验证 S 而非 `25+.75S` 或 `.75S` |
| accepted／mismatch 的 25/75 | 更新 scoring test 的 `0.35+.65*.5` 与 `65×percentile` 断言；新断言值来自独立公式 |
| HEAD/HAND 固定合法主词条 | 不依赖 profile flat 权重；禁止这些 slot 的 agnostic／addAccepted source 配置 |
| 低星／低等级 binary main 行为 | 调整 scoring test 的 mainCompletion 半值断言及 player integration 同类断言；normalization 数值／等级校验继续覆盖 |
| build 不 double normalization | 0／1／2／全部 variable slots agnostic；`base=ΣslotWeight×pieceNormalized`；两贡献之和一致；soft/hard modifiers 仅一次 |
| inference 与面板／targets 无关 | 修改 panel、soft/hard、其他五件装备仍保持单件 status、U、S、score 不变（审核可用前提相同） |
| profile generation、version、digest、审核 | 新字段变化必须 stale；note 不 stale；approve 单个角色不批准其他角色；旧 schema 清晰拒绝；产物 deterministic |
| benchmark 身份边界 | `relic-score-benchmark.test.ts`：主词条例外／份额不改变 profileScoringDigest、expected identity 与 CDF；副权重变动必须 stale |
| serialization 与 UI 消费 | `relic-score-presentation.test.ts`、`relic-score-player-integration.test.ts`；三态／nullable main 合法传递，仍不泄露完整 profiles／benchmark |
| 数据来源隔离 | `relic-score-boundary.test.ts`；不引入 browser sibling 读取、另一套业务 index 或网络主词条推导 |
| 长夜月与银狼LV.999 | 针对 `1413` ERR 及 `1506` 两内圈的静态配置测试，区分 `1006`；SPD breakpoint 留在 build |

`relic-score-scoring.test.ts` 明确锁定了 35/65、mismatch 65%、低 rarity 主数值比例和 build 加权公式；`relic-score-player-integration.test.ts` 同样有 lower main completion 的断言；`relic-score-benchmark.test.ts` 使用旧 main/sub 分量聚合断言。它们需要有意更新，不能简单全局替换数字而漏掉 agnostic。

实施后预期变化：第 7 节结构统计与数学区间内的 piece／build 漂移、低星主分行为改变、profile schema/digest/审核变化。应当视为回归：U、substat weights、条件 CDF 或 benchmark hash 无理由变化，新增非法主词条／flat-percent 混淆，upstream 被移除，targets影响 accepted，agnostic 仍乘 0.75，或 build 分量与 piece 不一致。

先运行上述直接相关测试、profile／benchmark validate，再按真实代码改动运行 targeted format/lint、`pnpm check` 与数据 build-input validation。保持一个非阻塞的代表角色 before/after 审核表，分离份额变动、集合扩充和 agnostic；不建立易碎全站数值快照。只有上游生成代码确实改动或处于明确阶段交付 gate 时，才增加对应 build 检查；本方案不要求 benchmark 重新校准或大型采样。

## 9. Risks and Edge Cases

| 边界 | 结论与处理 |
| --- | --- |
| canonical key | 已有 registry 足够；禁止重新命名内部 stat 或根据面板 target 映射 |
| flat／percent | 按相同 key 交集；flat ATK 有效不意味着 ATK% accepted |
| low-weight defensive | 符玄 DEF% 0.5 扩四槽，值得 review；没有发现大量低权重 HP／DEF 扩张，不新增 fallback heuristic |
| Effect RES | 18 个正权重角色，合法主槽为空，零扩充；依赖合法 slot gate |
| 固定槽 | HEAD／HAND 的 upstream 等价规则为合法固定主词条；保持其适配性，不提供退出配置 |
| 1★–5★ | 当前本地 runtime relic identity 只有 2／3／4／5★；没有可验证的 1★ identity。normalizer 支持 runtime-backed rarity，未知 tid／rarity unavailable；不能声称已验证 1★。reference／benchmark 始终 5★+15，不存在按 rarity 再补偿归一 |
| 低等级 | 移除 actual/mainAt15 后 accepted 同样拿 25 分；副词条数值仍按 5★ high roll 和 CDF，因此未强化遗器整体仍受副词条质量限制，但不保证与旧公式同排序 |
| agnostic CDF | 主维度退出，实际 main-conditioned CDF 不退出；相同 U 不保证不同 main 得分相同 |
| double normalization | build 聚合已归一化贡献，slot 权重不重分配；modifiers只应用一次 |
| upstream legality | 单调扩充在合法已验证推荐上成立；非法 upstream 必须数据验证失败，不靠 inference 静默过滤来掩盖 |
| profile staleness | mainStatOverrides 纳入 profileInputDigest，reviewed 不匹配应 unavailable；generator version 迁移会带来全角色审核压力，不可自动批准 |
| benchmark staleness | 保留仅 sub-weight scoring digest；主词条政策不污染 Lens B identity，仍检查覆盖和真实 main 条件 |
| semantic migration | 同步 config／artifact／generator／review／runtime 类型；不要只让 TS cast 通过；presentation mainCompletion 改义要同步契约 |
| UI 标记 | upstream recommended 与 scorer accepted 分开；新增 accepted 不必篡改原始推荐高亮 |
| 数据快照 | 本地 manifest/profile provenance 不同，本次相关字段比较与严格 validate 均通过；以后以 semantic digest 和 pinned 来源检查，勿只看提交文本判断 |
| 正向边界 | 不提供 removeAccepted；agnostic 为显式 slot 决策，不通过“有效 stat 都在别的槽”自动产生 |

## 10. Recommended Implementation Plan

建议在后续独立实施任务中按以下顺序推进；本次没有执行这些步骤。

1. **先扩展配置与审核契约。** 在现有 override 文件／接口中加入 mainStatOverrides；升级 override/artifact/generator version，加入严格 validation、digest 和 review summary。模板、权重、targets、上游推荐均不变。记录版本迁移导致的审核范围。
2. **实现纯 resolver。** 用 registry 的同名 key 与合法 slot，合并 upstream／positive sub weights／explicit additions；实现独立 agnostic 状态与来源解释。先用合成数据测试单调性、零权重、特殊主词条与 flat／Effect RES 边界。
3. **同步 piece 与 build 公式。** 采用 25/75 与 binary main，统一返回贡献并聚合，更新 mainCompletion／presentation 的语义及 targeted tests。低星／未强化行为作为明确变更记录，保持 5★ reference 与实际 main CDF。
4. **再录入两例稀疏配置。** 保留现有 1413 与 1506 对象的所有字段，仅分别加入 ERR 绳、内圈 agnostic。先核对 summary 与 diff，然后按项目既有流程逐角色审核；schema/generator 全局迁移所需其他角色审核也需明确完成，不能自动填新 digest。
5. **检查影响并交付。** 与本报告统计及分差公式对照，优先 review 第 7.2 节角色。验证 U／CDF／benchmark identity 不变、profile 没有 stale、卡片与 build 一致。保留正式 farming benchmark，只有实际修改其采样／权重输入时才安排另一个再生成任务。

该路线的实现复杂度主要在公式与契约同步，而不是 stat 推理。现成 registry、override、digest 与 Lens B 条件分布已提供大部分基础能力。

## 附录 A：复现结构统计与上游核对

从网站仓库运行以下 PowerShell。脚本经 stdin 执行，只读取文件，不留下一次性脚本，也不执行 data sync 或 profile generation。需要当前仓库已有 Node／tsx dependencies。所有集合计数均以角色／slot／stat 为单位。

```powershell
@'
import { readFileSync } from 'node:fs';
import { readTable, mergeConfigSources } from './scripts/data/raw.ts';
import { RELIC_STAT_REGISTRY as registry } from './src/lib/relic-score/stat-registry.ts';
const read = p => JSON.parse(readFileSync(p, 'utf8'));
const profiles = read('src/lib/relic-score/generated/character-profiles.json').profiles;
const recommendations = read('src/lib/generated/runtime/relic-score-recommendations.json');
const root = process.env.HSR_DATA_ROOT || '../TurnBasedGameData';
const upstream = mergeConfigSources('AvatarRelicRecommend', [
  { name: 'regular', rows: await readTable(root, 'AvatarRelicRecommend') },
  { name: 'LD', rows: await readTable(root, 'AvatarRelicRecommendLD') }
], row => String(row.AvatarID));
const slots = { BODY: 0, FOOT: 0, NECK: 0, OBJECT: 0 };
const slotCharacters = { ...slots };
const stats = {}, weights = {}, histogram = {}, unchangedIds = [], diffs = [];
let before = 0, after = 0, effectResProfiles = 0, flatProfiles = 0;
const defensiveCharacters = new Set(), weakCharacters = new Set();
for (const profile of profiles) {
  const id = profile.characterId, rec = recommendations[id];
  const raw = upstream.find(row => String(row.AvatarID) === id);
  if (JSON.stringify(rec.mainStatOptions.map(o => o.propertyTypes)) !==
      JSON.stringify(['PropertyList3','PropertyList4','PropertyList5','PropertyList6']
        .map(k => raw?.[k] ?? [])) ||
      JSON.stringify(rec.subStatPropertyTypes) !== JSON.stringify(raw?.SubAffixPropertyList ?? []))
    diffs.push(id);
  if ((profile.substatWeights.StatusResistanceBase ?? 0) > 0) effectResProfiles++;
  if (['HPDelta','AttackDelta','DefenceDelta'].some(k => (profile.substatWeights[k] ?? 0) > 0))
    flatProfiles++;
  let count = 0;
  for (const option of rec.mainStatOptions) {
    const added = Object.keys(registry).filter(k => registry[k].sub &&
      registry[k].mainSlots.includes(option.slot) &&
      (profile.substatWeights[k] ?? 0) > 0 && !option.propertyTypes.includes(k));
    before += option.propertyTypes.length;
    after += option.propertyTypes.length + added.length;
    count += added.length;
    slots[option.slot] += added.length;
    if (added.length) slotCharacters[option.slot]++;
    for (const k of added) {
      stats[k] = (stats[k] ?? 0) + 1;
      const w = profile.substatWeights[k];
      weights[w] = (weights[w] ?? 0) + 1;
      if (['HPAddedRatio','DefenceAddedRatio'].includes(k)) defensiveCharacters.add(id);
      if (w <= 0.5) weakCharacters.add(id);
    }
  }
  histogram[count] = (histogram[count] ?? 0) + 1;
  if (!count) unchangedIds.push(id);
}
console.log(JSON.stringify({ total: profiles.length, unchangedIds,
  changed: profiles.length - unchangedIds.length, before, after,
  added: after - before, slots, slotCharacters, stats, weights, histogram,
  effectResProfiles, flatProfiles, defensiveCharacters: defensiveCharacters.size,
  weakCharacters: weakCharacters.size, upstreamDiffIds: diffs }, null, 2));
'@ | node --import tsx --input-type=module
```

预期核心输出：`total=98, changed=83, before=592, after=765, added=173, upstreamDiffIds=[]`。不加载 LD 表会缺失 `1014/1015/1508/1509`，不能将其误判为 generated stale。

## 附录 B：复现代表样本的分数

以下仅读取正式 benchmark，用现有 scorePiece 得到旧分，再在脚本中计算拟议分；不会替换 scorePiece 或修改配置。

```powershell
@'
import { readFileSync } from 'node:fs';
import { loadProductionBenchmarkInputs } from './scripts/relic-score/benchmark-production.ts';
import { buildRelicScoreReferenceData } from './src/lib/relic-score/reference.ts';
import { scorePiece } from './src/lib/relic-score/score.ts';
import { RELIC_STAT_REGISTRY as registry } from './src/lib/relic-score/stat-registry.ts';
import { generateNaturalRelic } from './src/lib/relic-score/farming/generate-natural-relic.ts';
import { createSeededRng } from './src/lib/relic-score/farming/prng.ts';
const { inputs, expected } = await loadProductionBenchmarkInputs();
const benchmark = JSON.parse(readFileSync('src/lib/relic-score/generated/farming-benchmarks.json','utf8'));
const reference = buildRelicScoreReferenceData(inputs.runtime);
const cases = [
  ['1413','OBJECT','SPRatioBase'], ['1413','BODY','HPAddedRatio'],
  ['1506','NECK','HPAddedRatio'], ['1506','NECK','ImaginaryAddedRatio'],
  ['1506','OBJECT','SPRatioBase'], ['1208','BODY','DefenceAddedRatio'],
  ['1310','FOOT','AttackAddedRatio'], ['1310','FOOT','DefenceAddedRatio']
];
for (const [id, slot, key] of cases) {
  const profile = inputs.profiles.find(p => p.characterId === id);
  const recommendation = inputs.recommendations.find(r => r.avatarId === id);
  const generated = generateNaturalRelic(slot, inputs.model, createSeededRng(123456789), key);
  const [relicId, identity] = Object.entries(inputs.runtime.relics).find(([,r]) =>
    r.rarity === 5 && r.slot === ({BODY:3,FOOT:4,NECK:5,OBJECT:6}[slot]));
  const piece = { ...generated, relicId, setId: identity.setId,
    substats: generated.substats.map(s => ({...s,
      rollCount:{status:'exact',count:s.occurrenceCount,source:'provider'}})) };
  const result = scorePiece(piece,id,{profile,recommendation,reference,benchmark,
    benchmarkExpected:expected});
  if (result.status !== 'available') throw new Error(JSON.stringify(result));
  const v = result.value, S = 100*v.benchmarkPercentile;
  const accepted = recommendation.mainStatOptions.find(o => o.slot === slot).propertyTypes.includes(key) ||
    registry[key].sub && registry[key].mainSlots.includes(slot) && (profile.substatWeights[key] ?? 0) > 0;
  const inferredOnly = (accepted ? 25 : 0) + .75*S;
  const withExceptions = id === '1506' ? S :
    id === '1413' && key === 'SPRatioBase' ? 25+.75*S : inferredOnly;
  console.log(JSON.stringify({id,slot,key,U:v.rawSubUtility,S,
    current:v.pieceScore,inferredOnly,withExceptions}));
}
'@ | node --import tsx --input-type=module
```
