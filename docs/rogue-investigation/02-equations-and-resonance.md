# Rogue Investigation Round 3 — Equations & Resonance

调查日期：2026-08-28  
权威结构数据：`../../../TurnBasedGameData/ExcelOutput`、`../../../TurnBasedGameData/TextMap/TextMapCHS.json`  
辅助资产数据：`../../../StarRailRes`  
前置证据：`00-config-inventory.md`、`00-config-inventory-appendix.md`、`01-blessings.md`  
调查性质：**只读；未修改 schema、pipeline、domain types、route、UI、CSS、search、navigation 或资产。**

证据等级：`Confirmed`、`Strongly Supported`、`Partial`、`Unresolved`、`Not Found`、`Rejected`。

## 1. Executive Summary

### 1.1 Equation（A–J）

| 问题 | 结论 | 等级 |
|---|---|---|
| A. 普通 Equation canonical raw identity | `RogueTournFormula.FormulaID`。328/328 唯一；selection/entity identity 不能被 `MazeBuffID` 或 `FormulaDisplayID` 替代。 | Confirmed |
| B. `Rare/Epic/Legendary → 1★/2★/3★` | 与用户提供的产品事实、三个互斥 ordinary category 和严格分层的 requirement band 一致，足以作为**有证据标注的 presentation derivation**；没有 `starCount`、quality、frame、color 或 enum→数字 bridge，不能写成 raw fact。 | Strongly Supported；raw bridge Not Found |
| C. `PathEcho` 是否是临界方程 | 25 条全部单 Path、`MainBuffNum=16`、无 Sub；Maze 文本均为“临界回响”，另有 12 条“临界方程” BattleEvent skills。`PathEcho` 是玩家侧临界方程的 raw entity category。 | Confirmed entity category |
| D. 临界方程 4★ raw bridge | 未找到。`PathEcho` 是 category，不是数值 rarity；对应 MazeBuff 的 `BuffRarity` 也恒为 1。4★仍是产品视觉事实。 | Not Found |
| E. Main/Sub 是否有方向 | 有。字段、需求数、主/副 Path icon 均区分；同 mode 存在 `(A,B)` 与 `(B,A)` 的不同 Formula/effect。禁止排序。 | Confirmed |
| F. requirement 是否 100% 结构化 | 是。328 条均由 `MainBuffTypeID/MainBuffNum` 及可选 `SubBuffTypeID/SubBuffNum` 完整读取；不需要解析中文。 | Confirmed |
| G. Formula/MazeBuff/Display ownership | FormulaID=entity/selection；`MazeBuffID → RogueMazeBuff.(ID,Lv=1)`=效果、主文本、参数、combat binding；FormulaDisplay=story、ExtraEffect、unlock supplement。 | Confirmed |
| H. 4 条 mode-less row | 各自共享一个有 mode、可入图鉴 peer 的 Maze/Display；自身无 `TournMode`/`IsInHandbook`。它们是独立 raw Formula selection rows，但没有证据证明是独立 user-facing entity，也没有 explicit legacy/replacement 字段。审计保留，默认不进可见 normalized set。 | Confirmed structure；legacy semantics Unresolved |
| I. visibility | Ordinary：mode present + `IsInHandbook=true` + ordinary category + valid Path/Maze/Display。PathEcho：mode present + category=PathEcho + structured single-Path requirement + valid Maze/Display；它没有 `IsInHandbook`。FormulaDisplay 的 unlock=808 恒定，不能单独判断。 | Confirmed for snapshot |
| J. Tourn revision relation | 324 条 mode-bearing rows 的 Formula/Maze/Display target 均不跨 Tourn1/2/3 复用；无 revision/replacement FK。禁止按名称合并。 | Not Found |

### 1.2 Resonance（K–R）

| 问题 | 结论 | 等级 |
|---|---|---|
| K. Path Resonance canonical owner | base system owner 是 `RogueAeon.AeonID`；其 `BattleEventBuffGroup` 选中一条 special `RogueBuff`，后者再指向 `RogueMazeBuff` 主效果。AeonID 不能单独替代 effect identity。 | Confirmed |
| L. Base Resonance 与 special RogueBuff | 9 Aeon → 9 group → 9 tag → 9 `BattleEventBuff` RogueBuff → 9 MazeBuff，全部 1:1、Lv1-only、可见。 | Confirmed |
| M. 27 enhancement | `RogueAeon.BattleEventEnhanceBuffGroup` 每 Path 指向 3 条独立 `BattleEventBuffEnhance` RogueBuff。它们有独立名称、说明、参数与 Maze identity，不是 base resonance 的 Lv2/Lv3。 | Confirmed |
| N. 34 cross canonical identity | raw owner key 为 `(source family, MainAeonID, SubAeonID)`；DLC 16、Nous 18 均唯一。`BuffGroup` 是到 effect row 的关系键，不是 Path pair identity。 | Confirmed |
| O. DLC/Nous extend/override | `RogueDLCAeon`（Aeon 1–8）和 `RogueNousAeon`（1–9）重复引用 base 的 Path、Display、base/enhance group，但提供独立 mode effect fields；它们是 source-family overlays，不是同一 raw record。 | Confirmed |
| P. 三类是否分开建模 | base、enhancement、cross 的 owner、cardinality 与 requirement 不同，应该是三种 normalized entities，共享 Rogue effect/presentation primitive。 | Strongly Supported |
| Q. BattleEventSkill ↔ Resonance | `BattleEventData.SkillIDList → BattleEventSkillConfig.SkillID` 是 explicit；但 `RogueAeon/RogueBuff/RogueMazeBuff` 到 BattleEventEvent/Skill 没有 FK。9 条 410xx skill 与 9 Path 只有强 presentation correspondence。 | Direct domain FK Not Found |
| R. BattleEventSkill ↔ Critical Equation | 12 条 411xx critical skills 均被 BattleEventData 引用，但 25 个 PathEcho Formula 没有 SkillID/BattleEventID FK；不能按 Path/name/icon 建立关系。 | Direct domain FK Not Found |

### 1.3 Overall（S–W）

| 问题 | 结论 |
|---|---|
| S. Equation 与 Resonance 是否共享 domain type | 否。Formula owner 与 Aeon/group/special-Buff owner 是两套 raw family。 |
| T. 可共享 primitive | canonical Path、localized game text、numeric params、ExtraEffect glossary、asset reference、mode/provenance、RogueMazeBuff effect presentation。 |
| U. rarity 边界 | Equation category 是 raw；ordinary 星数是 Strongly Supported presentation derivation；PathEcho 4★只有产品事实；resonance 的 Legendary 不属于普通 3★。 |
| V. normalized-model design 成熟度 | Formula、base resonance、enhancement、cross 的 identity/owner/Path/effect/display 足够设计；星数 raw semantics、pool、BattleEvent FK、enhancement unlock threshold 不够硬编码。 |
| W. 是否需 Round 3B/3C | 不需要为了 schema design 再拆 3B/3C；只有要实现精确 Formula 抽取池、BattleEvent runtime binding 或回响解锁规则时，才需针对缺失导出/客户端规则另开专项。 |

## 2. Scope and Method

严格分成两条 track：

```text
Track A — DU Formula
RogueTournFormula
├── Rare / Epic / Legendary ordinary Equation
└── PathEcho critical Equation

Track B — SU/DLC/Nous Resonance
RogueAeon + RogueDLCAeon + RogueNousAeon
├── BattleEventBuff base resonance
├── BattleEventBuffEnhance enhancement
└── RogueDLCAeonCross / RogueNousAeonCross
```

方法包括全库 cardinality、ID coverage、group DAG 解析、TextMap decimal-string resolution、placeholder bounds、FormulaID/SkillID 反向查找、Path pair direction、StarRailRes basename/dimension audit。story/quest/dialogue 内容、combat ability/runtime 被排除；story 字段只记录 presentation role。

# Part A — Equations

## 3. Formula Raw Ownership

```text
RogueTournFormula.FormulaID                         ← canonical entity/selection identity
├── MainBuffTypeID ──→ RogueTournBuffType.RogueBuffType
├── MainBuffNum
├── SubBuffTypeID? ──→ RogueTournBuffType.RogueBuffType
├── SubBuffNum?
├── FormulaCategory = Rare | Epic | Legendary | PathEcho
├── TournMode? = Tourn1 | Tourn2 | Tourn3
├── IsInHandbook?
├── MazeBuffID ──────→ RogueMazeBuff.ID（当前全部唯一 Lv=1）
│                        ├── BuffName/BuffDesc/BuffSimpleDesc → TextMapCHS
│                        ├── ParamList
│                        ├── BuffIcon
│                        └── InBattleBindingType/Key（combat boundary）
└── FormulaDisplayID → RogueTournFormulaDisplay.FormulaDisplayID
                         ├── FormulaStory（lore）
                         ├── ExtraEffect[] → ExtraEffectConfig
                         └── HandbookUnlockDisplayID
```

`FormulaID` 328/328 unique。`MazeBuffID` 和 `FormulaDisplayID` 各 324 unique；其少 4 的原因全部是 mode-less edge 与一个 mode-bearing peer 共享 target，不是 4 个缺失 target。

## 4. Full Formula Classification

分类优先级先识别 mode-less edge，再识别 category：

| Classification | Rows | User-facing default | 结构 |
|---|---:|---|---|
| Ordinary Equation | 299 | include | mode present、handbook=true、category=Rare/Epic/Legendary |
| PathEcho / Critical Equation | 25 | include as separate subtype | mode present、single Path×16、无 handbook flag |
| Mode-less duplicate/legacy edge | 4 | exclude from visible set；audit retain | no mode、no handbook、共享 Maze/Display |
| Internal/hidden | 0 additionally identified | — | 无其它结构化 hidden row |
| Unresolved | 0 | — | 328 rows 全覆盖 |

“legacy”只是 edge label，不是 raw semantics；没有 obsolete/replacedBy/revision 字段。

## 5. FormulaCategory and Mode Cardinality

### 5.1 Raw category totals

| Category | Rows / FormulaIDs | Maze / Display IDs | Mode | Handbook | Requirement |
|---|---:|---:|---|---|---|
| Rare | 133 | 131 / 131 | no-mode 2；T1 45；T2 44；T3 42 | 131 true；2 absent | 86×(2,2)；47×(3,2) |
| Epic | 104 | 104 / 104 | T1 36；T2 36；T3 32 | 104 true | 68×(4,2)；14×(4,4)；22×(5,3) |
| Legendary | 66 | 64 / 64 | no-mode 2；T1 18；T2 24；T3 22 | 64 true；2 absent | 46×(6,4)；9×(7,5)；11×(8,4) |
| PathEcho | 25 | 25 / 25 | T1 9；T2 8；T3 8 | 25 absent | 25×(16,sub absent) |

### 5.2 Mode-bearing entity totals

| Mode | Ordinary | PathEcho | Categories ordinary | Path set |
|---|---:|---:|---|---|
| Tourn1 | 99 | 9 | Rare45 / Epic36 / Legendary18 | 120–128 |
| Tourn2 | 104 | 8 | 44 / 36 / 24 | 121,122,124–129 |
| Tourn3 | 96 | 8 | 42 / 32 / 22 | 121,122,124–129 |

FormulaID 不跨 mode；mode-bearing MazeBuffID/DisplayID 也不跨 Tourn1/2/3。没有 explicit revision relation。

## 6. Rarity Investigation

### 6.1 Ordinary Equation

| Raw category | Product star hypothesis | Config evidence | 结论 |
|---|---:|---|---|
| Rare | 1★ | 三个 ordinary category 的最低 requirement band；独立 handbook rows | Strongly Supported presentation |
| Epic | 2★ | 中间 requirement band；独立 handbook rows | Strongly Supported presentation |
| Legendary | 3★ | 最高 requirement band；独立 handbook rows | Strongly Supported presentation |

Supporting evidence：

- category 对所有 ordinary rows 完整且互斥；
- 不同 revision 虽然绝对 requirement 改变，仍保持 Rare < Epic < Legendary 的 tier ordering；
- 用户已确认产品侧存在 1/2/3★三档。

不能升级为 raw fact 的原因：

- 未发现 `starCount`、quality、rank、rarity color/frame、category→number config；
- Formula 的 328 个 Maze targets `BuffRarity=1`、`BuffSeries=1` 恒定，二者无区分力；
- `RogueTournFormulaAeonIcon` 只按 Path 给 main/sub/ultra artwork，不按 Rare/Epic/Legendary；
- requirement 数量只能支持 tier，不是星级定义；
- `RogueTournFormulaRandom` 当前导出没有 category/weight/content 可做独立 bridge。

因此 normalized raw model 保存 category；若 UI 显示星数，必须标为产品侧 presentation rule，不能改写 raw enum。

### 6.2 Critical Equation 4★ ledger

```text
Critical Equation product presentation: 4★
Raw field representing 4★: Not Found
Derivation source: user-provided product visual fact + PathEcho critical entity classification
Raw model storage: FormulaCategory=PathEcho
Evidence: product presentation Confirmed by product input; raw numeric rarity Unresolved/Not Found
```

`UltraFormulaIcon/UltraFormulaCardIcon` 证明 PathEcho 有专门展示 primitive，但没有星数。禁止 `PathEcho → raw rarity=4`。

## 7. Critical Equation / PathEcho

全部 25 rows 满足：

```text
FormulaCategory = PathEcho
MainBuffNum = 16
SubBuffTypeID / SubBuffNum absent
TournMode present
IsInHandbook absent
MazeBuffID target exists and only Lv1
FormulaDisplayID target exists
```

Tourn1 覆盖 120–128 九 Path；Tourn2/Tourn3 覆盖 121、122、124–129 八 Path。Maze 主说明均把激活后的效果写成“临界回响”，SimpleDesc 写“触发临界方程”或等价产品措辞。这一结构闭环足以确认 `PathEcho` 是临界方程的 raw category，而不是“raw 4★”。

## 8. Structured Path Requirements

### 8.1 Requirement matrix

| Category | Main Count | Sub Count | Formulas |
|---|---:|---:|---:|
| Rare | 2 | 2 | 86 |
| Rare | 3 | 2 | 47 |
| Epic | 4 | 2 | 68 |
| Epic | 4 | 4 | 14 |
| Epic | 5 | 3 | 22 |
| Legendary | 6 | 4 | 46 |
| Legendary | 7 | 5 | 9 |
| Legendary | 8 | 4 | 11 |
| PathEcho | 16 | absent | 25 |

Tourn1 ordinary 使用旧 requirement bands `(3,2)/(4,4)/(5,3)/(7,5)/(8,4)`；Tourn2/3 使用 `(2,2)/(4,2)/(6,4)`。这再次说明 requirement 是结构化 activation condition，但不能被反向当作星级定义。

### 8.2 Path taxonomy coverage

| Type | CHS | Canonical key | Formula modes | Base resonance |
|---:|---|---|---|---|
| 120 | 「存护」 | Preservation | T1 | Aeon 1 |
| 121 | 「记忆」 | Remembrance | T1/T2/T3 | Aeon 2 |
| 122 | 「虚无」 | Nihility | T1/T2/T3 | Aeon 3 |
| 123 | 「丰饶」 | Abundance | T1 | Aeon 4 |
| 124 | 「巡猎」 | TheHunt | T1/T2/T3 | Aeon 5 |
| 125 | 「毁灭」 | Destruction | T1/T2/T3 | Aeon 6 |
| 126 | 「欢愉」 | Elation | T1/T2/T3 | Aeon 7 |
| 127 | 「繁育」 | Propagation | T1/T2/T3 | Aeon 8 |
| 128 | 「智识」 | Erudition | T1/T2/T3 | Aeon 9 |
| 129 | 「同谐」 | Harmony | T2/T3 | no base `RogueAeon` row |

10/10 Formula path types 命中 `RogueTournBuffType`。120–128 与 SU `RogueBuffType` label 对齐；129 是 DU-only。共享 canonical Path 是 taxonomy convenience，不建立 Formula↔Resonance ownership。

### 8.3 Pairing and direction

| Mode | Ordinary rows | Ordered pairs | Unordered coverage | Missing unordered pair | Both directions present |
|---|---:|---:|---:|---|---:|
| Tourn1 | 99 | 62 | 35/36 | 丰饶+智识 | 27 pair-directions（54 ordered entries） |
| Tourn2 | 104 | 53 | 28/28 | none | 25 pair-directions（50 entries） |
| Tourn3 | 96 | 48 | 27/28 | 记忆+虚无 | 21 pair-directions（42 entries） |

无 self-pair。一个 unordered pair 可有多个不同 category/effect，且反向也是独立 Formula。例如 Tourn1：

```text
Formula 120102: Main 120×3 + Sub 121×2 → Maze 672010
Formula 120201: Main 121×3 + Sub 120×2 → Maze 672100
```

`RogueTournFormulaAeonIcon` 还分别提供 `FormulaIcon` 与 `FormulaSubIcon`。因此 Main/Sub 至少具有明确的 raw ordering 和 presentation semantics；是否每个战斗 effect 都使用“主命途机制”不需要从文本猜测。normalized model 必须原样保存顺序。

## 9. Formula → RogueMazeBuff

| Check | Result |
|---|---:|
| Formula rows | 328 |
| distinct MazeBuffID | 324 |
| missing target | 0 |
| target level sets | 328/328 都只有 `{Lv=1}` |
| Formula explicit level field | absent |
| shared targets | 4 Maze IDs，各 2 Formula rows |

Formula 不指定 Lv；当前 target 恰只有 Lv1，所以 join 无歧义。未来 parser 应验证 target level cardinality，不能静默假定所有版本永远 Lv1。

`FormulaID` 是 equation identity；`MazeBuffID` 是可共享的 presentation/effect identity；`InBattleBindingType/Key` 是 combat binding boundary。四个 shared Maze targets只证明 selection rows 共享效果，不证明 FormulaID 可被合并。

## 10. Formula Display and ExtraEffect

`RogueTournFormulaDisplay` 324 rows / 324 unique IDs，全部被使用、无 missing/unused。关系为 320 个 1:1 target + 4 个 2:1 target。

| Field | Coverage | Role |
|---|---:|---|
| FormulaStory | 324/324 CHS resolved | lore/story supplement；非 core effect |
| HandbookUnlockDisplayID | 324/324 = 808 | constant unlock/presentation signal；无分类能力 |
| ExtraEffect | 237 rows / 293 refs / 25 unique IDs | glossary/display supplement |
| background/icon/image | field absent | 由 Path/Maze/Aeon-icon configs 提供，不在 FormulaDisplay |

Formula owner 上的 `FormulaStoryJson` 只在 18 Legendary + 9 PathEcho rows 非空，是 lore interaction path；不作为 normalized core relation。

25 个 Formula ExtraEffect target 全部命中 `ExtraEffectConfig`，名称/说明 25/25 resolved，18/25 有 icon；44 个 numeric placeholders 全部有参数。它们解释“反震”“离神”“回味”等术语，适合作为独立 glossary，不应拼入主 BuffDesc。

## 11. Formula Pools / Random / Keyword

`RogueTournFormulaRandom` 139 rows，但当前导出每行只有 `RandomID`：没有 FormulaID、weight、mode、category、subgroup 或 child list。全库字段名搜索也未找到 `FormulaRandomID` consumer。因此：

- pool contents、weight、selection group、subgroup DAG：**Unresolved / export data absent**；
- RandomID 不能作为 Formula identity；
- 不能用该表判断 visibility。

唯一额外 explicit FormulaID list 是 `RogueTournKeyword.RogueFormulaList`：247 refs / 222 unique FormulaIDs，覆盖 Rare77、Epic88、Legendary57、PathEcho0，且不覆盖 4 个 mode-less rows。它表示 keyword/mechanic association，不是完整 selection pool，也不是 visibility owner。

全库纯数值 reverse search 会命中大量 Avatar skill、UnlockID 等相同整数；只有字段语义为 `RogueFormulaList` 时才算 Formula FK。数值相等本身被拒绝。

## 12. Formula Visibility and Mode-less Edges

| Signal | Ordinary | PathEcho | Mode-less |
|---|---|---|---|
| FormulaCategory | Rare/Epic/Legendary | PathEcho | Rare/Legendary |
| TournMode | required | required | absent |
| IsInHandbook | 299/299 true | absent | absent |
| Maze target | valid Lv1 | valid Lv1 | valid but shared |
| Display target | valid | valid | valid but shared |
| FormulaRandom membership | unavailable | unavailable | unavailable |
| Keyword association | partial only | 0 | 0 |
| Default normalized visibility | true | true, separate critical class | false/audit only |

4 条 edge：

| FormulaID | Category / req | Shared target | Mode-bearing peer | Difference |
|---:|---|---|---:|---|
| 100001 | Rare 126×3+128×2 | Maze675680 / Display2102019 | 2102019 T2 Rare 126×2+128×2 | requirement differs |
| 100002 | Legendary 126×7+129×5 | 673690 / 2104010 | 2104010 T2 Legendary 126×6+129×4 | requirement differs |
| 203072 | Rare 121×3+126×2 | 672160 / 10203072 | 120207 T1 same req | same effect/req |
| 207055 | Legendary 121×7+124×5 | 670140 / 10207055 | 140205 T1 same req | peer has FormulaStoryJson |

这些 row 仍有 unique FormulaID，所以 raw 审计不能删除；但缺 mode/handbook 且共享完整 presentation/effect，不足以成为独立 user-facing Equation。没有 explicit replacement edge。

## 13. Formula Localization / Parameters

按 328 raw rows（含 shared target 重复引用）统计：

| Field | Present / resolved |
|---|---:|
| BuffName | 328/328 |
| BuffDesc | 328/328 |
| BuffSimpleDesc | 328/328 |
| BuffDescBattle | 0/328 |

BuffDesc 含 935 numeric tokens：`i=308`、`i%=592`、`f1=6`、`f1%=28`、`f2=1`；0 越界，43 rows 有 unused params，0 symbolic token。328 rows 均含 color/unbreak rich tags，241 含 underline。unused params 是 combat/presentation 共享参数，不是错误。

## 14. Formula Assets

Formula/Path 相关 config 共 70 个 unique path values：

- `FormulaIcon/FormulaSubIcon` 20 个、Path icon/large/small 30 个：StarRailRes 无 basename match；
- `UltraFormulaIcon/UltraFormulaCardIcon` 20 个 path values 对应 10 个 `HoshinoKami_001..009,012.png` basename；StarRailRes 实体位于 `image/simulated_event/`；
- 10 个 matched PNG 大多 2048×2048，例外 `004=2017×2046`、`012=2048×1972`；
- 未发现 category-specific rarity frame/star asset。

同一 HoshinoKami basename 被两个 config directory path 引用，只是 presentation reuse，不是 Formula relation。

## 15. Equation Representative Traces

### Sample A — candidate 1★（raw Rare）

```text
FormulaID=120102, category=Rare, Tourn1, handbook=true
requirement: Main 120「存护」×3 + Sub 121「记忆」×2
MazeBuffID=672010 -> RogueMazeBuff.(672010,1) only
name=筑城史官
desc params=[0.25,3,0.05]; binding=StageAbility_672010
FormulaDisplayID=10103022 -> story resolved, ExtraEffect=[]; unlock=808
keyword membership=no; FormulaRandom membership=unavailable
classification=Ordinary Equation
rarity evidence=1★ Strongly Supported presentation; raw category Confirmed
```

### Sample B — candidate 2★（raw Epic）

```text
FormulaID=130103, Epic, Tourn1, handbook=true
requirement: 120「存护」×5 + 122「虚无」×3
MazeBuffID=671020, Lv1, name=无神论者, ParamList=[0.5]
Display=10105033; ExtraEffect=60000001「反震」; story resolved
keyword membership=yes; random pool unresolved
classification=Ordinary; 2★ presentation Strongly Supported
```

### Sample C — candidate 3★（raw Legendary）

```text
FormulaID=140102, Legendary, Tourn1, handbook=true
requirement: 120「存护」×8 + 121「记忆」×4
MazeBuffID=670010, Lv1, name=城市复原师
ParamList=[10,25,1,1,1,0.8]
Display=10108024; ExtraEffect=[61000500「基础伤害」,60000001「反震」]
FormulaStoryJson non-empty; display story resolved
keyword membership=yes; classification=Ordinary
3★ presentation Strongly Supported; no raw star field
```

### Sample D — Critical Equation

```text
FormulaID=150100, category=PathEcho, Tourn1, handbook flag absent
requirement: Main 120「存护」×16; Sub absent
MazeBuffID=615020, Lv1, name=筑城者
desc: consumes 100 energy and creates critical resonance; ParamList=[15,8,1,5,0.8,2]
Display=10114000; story resolved; ExtraEffect=[]; UltraFormula artwork via type120
BattleEventSkill candidate=4110101「临界方程：「存护」」
raw FK to skill=Not Found; raw 4★ bridge=Not Found
classification=Critical Equation Confirmed; product visual 4★ only
```

### Sample E/F — different mode and mode-less edge

```text
mode-less FormulaID=100001: Rare, 126×3+128×2, no mode/handbook
Tourn2 FormulaID=2102019: Rare, 126×2+128×2, mode+handbook
both -> Maze675680 / Display2102019 / name「诸神诡辩家」 / ExtraEffect「回味」
result: two raw FormulaIDs; one shared effect/display; no replacement FK
visibility: peer include, mode-less audit-only
```

# Part B — Resonance

## 16. Aeon / Resonance Raw Ownership

```text
RogueAeon.AeonID                                      ← base Path/Aeon owner
├── RogueBuffType ─────────→ RogueBuffType taxonomy
├── DisplayID ─────────────→ RogueAeonDisplay
├── BattleEventBuffGroup ──→ RogueBuffGroup.GMLOGNJAIGI
│                              └── HECJCAMDGNO[] → RogueBuff.RogueBuffTag
│                                   └── BattleEventBuff + MazeBuffID
└── BattleEventEnhanceBuffGroup → RogueBuffGroup
                                   └── 3× BattleEventBuffEnhance + MazeBuffID

RogueDLCAeonCross / RogueNousAeonCross
├── MainAeonID + MainAeonNum
├── SubAeonID + SubAeonNum
└── BuffGroup → RogueBuffGroup → RogueBuffTag
              → BattleEventBuffCross RogueBuff → RogueMazeBuff
```

`AeonID` 是 Path/Aeon system owner key；玩家看到的 resonance 主效果 identity 仍由 special `RogueBuff.(MazeBuffID,Lv1) → RogueMazeBuff` 承担。normalized `RoguePathResonance` 应同时引用 owner 与 effect，不应 flatten 成一个 ID。

## 17. Base Path Resonance

9 个 `RogueAeon` 覆盖 AeonID 1–9、type 120–128。每个 base group 都是 direct 1 tag，无 subgroup：

| Metric | Result |
|---|---:|
| Aeon owners | 9 |
| unique base groups | 9 |
| terminal tags | 9 unique |
| BattleEventBuff rows | 9 unique |
| MazeBuff IDs / exact targets | 9 / 9 |
| rows per Aeon | 1 |
| Lv/category/visibility | all Lv1 / Legendary / IsShow=true |
| UnlockIDList non-empty | 0 |

Base `RogueBuff.AeonID` 与 owner AeonID 相等。它是 ordinary Blessing exclusion family；Legendary 不表示普通 3★。

## 18. Resonance Enhancements

每个 `BattleEventEnhanceBuffGroup` 直接按数组顺序列 3 tags，总计 9×3=27：

- 27 unique tag/MazeBuff IDs，exact Maze join；
- 每条有独立 name、BuffDesc、SimpleDesc、ParamList 与 binding；
- 全部 `BattleEventBuffEnhance`、Lv1-only、Legendary、IsShow=true；
- base `MazeBuffID` 与 enhancement MazeBuffID 不同；不是 MazeBuff level；
- `UnlockIDList` 27/27 为空；owner/group 外未找到结构化“选几个解锁”或 acquisition threshold；
- group array order 是唯一明确 ordering，normalized model可保留 raw order，但不可虚构 unlock step。

因此 enhancement raw selection/effect identity 可用 source-family + `MazeBuffID`，并保留 `AeonID`/owner group/`RogueBuffTag`；不能建成 base resonance `level=2/3/4`。

## 19. Cross Resonance

### 19.1 Cardinality and identity

| Family | Rows | Directed pair unique | Group/tag/Maze unique | Requirement |
|---|---:|---:|---:|---|
| RogueDLCAeonCross | 16 | 16 | 16/16/16 | all Main×3 + Sub×3 |
| RogueNousAeonCross | 18 | 18 | 18/18/18 | all 3+3 |
| Combined | 34 | 34 family-qualified | 34/34/34 | — |

全部 group 直接解析成恰一 terminal tag、恰一 `BattleEventBuffCross` row、恰一 Lv1 Maze target；all references resolve。special RogueBuff 的 `AeonID` 等于 `MainAeonID`。

Canonical raw identity 推荐：

```text
(sourceFamily='RogueDLCAeonCross'|'RogueNousAeonCross', MainAeonID, SubAeonID)
```

`BuffGroup` 是 effect-chain relation；`MazeBuffID` 是 presentation/effect identity；两者都不应取代 raw owner key。

### 19.2 Direction is semantic

DLC 内没有 reverse pair；Nous 中有三组双向 pair：2↔8、3↔7、4↔6。反向 row 指向不同 group、tag、Maze 和 effect。例如：

```text
Nous (2,8) -> group12124 -> Maze612127「回响交错：犹在镜中」
Nous (8,2) -> group12724 -> Maze612727「回响交错：冷凝腔体」
```

因此 cross pair 禁止 canonical-sort。

### 19.3 Provenance versus availability

16 DLC targets 均 `ActivityModuleID=6000302`。Nous 18 targets 中 12 为 6000901，6 为 6000302；这支持 Round 2 的“Nous 使用较早引入的 cross records”结论。

进一步精化：DLC 与 Nous cross owner 实际消费的 BuffGroup/tag/Maze 集合没有交集；所谓 reuse 是 **provenance family reuse**，不是同一个 DLC owner row 被两个 cross configs 引用。`RogueNousAeonCross` 是 Nous availability owner，target 上的 6000302 仍记录 earlier introduction。introducedBy 与 availableIn 必须分开。

## 20. DLC / Nous Owner Overlays

| Aeon | Base | DLC | Nous | Path/group/display relation |
|---:|---|---|---|---|
| 1–8 | yes | yes | yes | 三 family 的 type、base group、enhance group、display ID 相同 |
| 9（智识） | yes | no | yes | base/Nous type128、groups12804/12805、Display9 |

相同 AeonID 不表示同一 raw record：

- `RogueAeon` 提供 base Path owner、`EffectDesc1/2`、Sort、groups；
- `RogueDLCAeon` 提供 DiceID、`EffectDesc3/DescParam`、EffectType/Param、ExtraEffect、Unlock；
- `RogueNousAeon` 提供 custom-dice mode `EffectDesc1` 与 EffectParam；
- 它们显式复用同一 base/enhance group/display，所以是 extend/overlay relation，而不是重新定义另一套 resonance effect rows。

## 21. Display and Duplicate Description Layers

`RogueAeonDisplay` 有 14 rows；base resonance owner使用 Display1–9。每 row 提供 Aeon name、Path name、AeonBuffIcon/AeonImage、AeonIcon、AeonFigure。Display10–14 是同谐/秩序/贪饕/均衡/神秘 presentation，不因存在 display 就自动成为 base resonance owner。

三层文本不得拼接：

| Layer | 内容例子 | Role |
|---|---|---|
| RogueAeon EffectDesc1/2 | “护盾量提高10%”“出现存护祝福概率提高” | Path selection/passive overview |
| RogueDLCAeon/NousAeon EffectDesc | board/dice/custom-dice effects | mode overlay effect summary |
| special RogueMazeBuff BuffDesc | 消耗100能量、回响攻击、enhancement/cross 实际效果 | Rogue combat-facing main effect |
| BattleEventSkill SimpleSkillDesc | skill button tooltip | BattleEvent subsystem presentation |

Base 18 owner descriptions、DLC 16、Nous 9 均 100% TextMap resolved；DLC EffectDesc3 有 16 numeric tokens，均由 DescParam 支持。Aeon owner文本不替代 MazeBuff 主效果。

## 22. BattleEventSkill Investigation

### 22.1 Localized target skills

`BattleEventSkillConfig` 有 26 条名称命中目标概念：

- 14 条“命途回响”：9 条 4100101–4100901 base Path skills；另有 4200401 与 4300101–4300401 巡猎 variants；
- 12 条“临界方程”：4110101–4111201。

25/26 被 `BattleEventData.SkillIDList` 显式引用；4200401 在当前 BattleEventData 无引用。BattleEventData 再以相同 BattleEventID 命中 `BattleEventConfig`，例如：

```text
BattleEventData.41001.SkillIDList=[4100101,4100102]
BattleEventConfig.41001 AssetPackName=Rogue_Shield

BattleEventData.41101.SkillIDList=[4110101,4110102]
BattleEventConfig.41101 AssetPackName=Rogue_Shield
```

这确认 BattleEvent subsystem 内的真实 explicit chain，但不是 Rogue domain FK。

### 22.2 Full-library reverse lookup result

对 26 个 SkillID 全 ExcelOutput reverse lookup：

- genuine refs：`BattleEventData.SkillIDList`；
- `Rogue*` owner/config direct refs：0；
- Formula direct refs：0；
- 另有 `SpecialAvatarRelicMainValue.RelicMainValueType=4111201` 和 `TutorialGuideTalkData.ID=4300101` 两个整数碰撞，字段语义不匹配，拒绝为 FK。

`RogueAeon.BattleEventBuffGroup` 仍只命中 `RogueBuffGroup`，不命中 BattleEventData；Round 1 rejection 保持。

### 22.3 Relation status

| Candidate | Status |
|---|---|
| BattleEventData → BattleEventSkill | Confirmed explicit FK |
| BattleEventData ↔ BattleEventConfig by BattleEventID | Confirmed |
| RogueAeon → BattleEventSkill | Not Found |
| special RogueBuff/MazeBuff → BattleEventSkill | Not Found |
| PathEcho Formula → critical BattleEventSkill | Not Found |
| same Path/name/icon | Strong presentation correspondence only |

25 PathEcho rows 对 12 critical skills 不可能自然 1:1；禁止建立 heuristic FK。

## 23. Resonance Localization / Parameters / ExtraEffect

70 special Maze rows：

| Field | Present / resolved |
|---|---:|
| BuffName | 70/70 |
| BuffDesc | 70/70 |
| BuffSimpleDesc | 70/70 |
| BuffDescBattle | 32/32（38 absent） |

BuffDesc 共 109 numeric tokens（`i=41`、`i%=65`、`f1%=2`、`f2%=1`），0 越界；31 rows 有 unused params；symbolic rows=0。rich coverage：color59、unbreak66、underline18。

special family 的 ExtraEffect 共 20 refs / 12 unique IDs：12/12 name+desc resolved、12/12 有 icon、15 numeric tokens 无越界。分布：base 2 refs、enhancement 13、cross 5。它们仍是 glossary supplement。

## 24. Resonance Assets

相关 config 共 87 unique path values：

- `RogueAeonDisplay.AeonBuffIcon/AeonImage` 的 14 个 HoshinoKami basenames 在 `StarRailRes/image/simulated_event/` 全命中；PNG 尺寸约 1897–2048；
- Path small/figure、special MazeBuff icons、34 个 `HoshinoKamiCombination` cross icons、10 个 RogueIntervene skill icons均未在当前 StarRailRes 命中；
- Cutin prefab 不是 bitmap，也未命中。

HoshinoKami artwork 同时被 Formula ultra presentation、Aeon display、BattleEventConfig head icon使用；asset reuse 不能建立 entity FK。

## 25. Resonance Visibility Matrix

| Signal | Base | Enhancement | Cross |
|---|---|---|---|
| `BattleEventBuffType` | BattleEventBuff | BattleEventBuffEnhance | BattleEventBuffCross |
| `IsShow` | 9/9 true | 27/27 true | 34/34 true |
| category / level | all Legendary / Lv1 | same | same |
| explicit owner | RogueAeon base group | RogueAeon enhance group | DLC/Nous Cross row |
| Maze target | 9/9 | 27/27 | 34/34 |
| Display target | AeonDisplay + Maze | parent AeonDisplay + own Maze | AeonCrossIcon + own Maze |
| handbook field | none specific | none specific | none specific |
| mode signal | base owner + reused overlays | base owner + reused overlays | source family controls availability |

最可靠的 visibility 是 special type + IsShow + exact Maze join + exact owner-group membership；名称不是条件。

## 26. Resonance Representative Traces

### Base — 存护

```text
owner: RogueAeon.AeonID=1, Path120, Display1「克里珀/存护星神」
base group12004 -> tag1202001
RogueBuff: Maze612020 Lv1, AeonID1, Legendary, IsShow, BattleEventBuff
Maze: name「命途回响：「存护」」; ParamList=[2.5,0.5,0,0.15,0.4,0.03,2,0.01]
binding=StageAbility_612020; ExtraEffect=[]
BattleEventSkill candidate=4100101; raw FK=Not Found
classification/confidence=Base Path Resonance / Confirmed
```

### Enhancement — 存护第一项

```text
owner: RogueAeon1.BattleEventEnhanceBuffGroup=12005
ordered tags=[1202101,1202201,1202301]
first RogueBuff: Maze612021, tag1202101, BattleEventBuffEnhance, Lv1
name「回响构音：零维强化」
desc: resonance attacks always crit; shielded allies increase crit damage
ParamList same raw eight-value vector; ExtraEffect=[]; UnlockIDList=[]
classification=independent Resonance Enhancement, not level / Confirmed
```

### DLC Cross

```text
owner: RogueDLCAeonCross(MainAeonID1×3,SubAeonID3×3), group12021
-> tag1202401 -> RogueBuff Maze612024, AeonID1, module6000302
name「回响交错：披锋效应」; BattleEventBuffCross; Lv1
AeonCrossIcon=HoshinoKamiCombination_001.png; ExtraEffect=[]
classification=DLC Cross Resonance / Confirmed
```

### Nous Cross

```text
owner: RogueNousAeonCross(1×3,6×3), group12023
-> tag1202601 -> Maze612026, module6000901
name「回响交错：逆淬火」; Lv1; IsShow
classification=Nous Cross Resonance / Confirmed
```

### Nous earlier-provenance edge

```text
owner: RogueNousAeonCross(7×3,3×3), group12623
-> tag1262601 -> Maze612626「回响交错：夜以继夜」
target ActivityModuleID=6000302, but availability owner is Nous cross config
same row/group/Maze is not referenced by RogueDLCAeonCross
result: introducedBy earlier DLC module != availableIn Nous
```

# Synthesis

## 27. Equation vs Resonance Domain Comparison

| Dimension | Ordinary Equation | Critical Equation | Path Resonance |
|---|---|---|---|
| Raw owner | RogueTournFormula | same Formula family | RogueAeon + special RogueBuff |
| Canonical identity | FormulaID | FormulaID | base owner AeonID + effect MazeBuffID layering |
| Path relation | Main+Sub RogueTournBuffType | Main only | Aeon.RogueBuffType |
| Requirement | structured Main/Sub counts | Main×16 | no acquisition count found；effect uses energy text |
| Effect target | MazeBuffID → RogueMazeBuff Lv1 | same | group → RogueBuff → MazeBuff Lv1 |
| Rarity | Rare/Epic/Legendary raw；1/2/3 presentation | PathEcho raw；4★ product only | special RogueBuff Legendary；ordinary star N/A |
| Mode | TournMode | TournMode | base + DLC/Nous overlays / source-family cross owner |
| Display | FormulaDisplay supplement + Maze | same + UltraFormula artwork | AeonDisplay + special Maze / cross icon |
| BattleEventSkill | none found | presentation correspondence only | presentation correspondence only |

Equation 与 Resonance 不共享 domain entity type；只能共享 lower-level primitives。

## 28. Rarity Ledger

| Domain | Raw representation | Product stars | Evidence |
|---|---|---:|---|
| Ordinary Blessing | Common/Rare/Legendary | 1/2/3 | Strongly Supported（Round 2） |
| Ordinary Equation | Rare/Epic/Legendary | 1/2/3 | Strongly Supported presentation；raw numeric bridge Not Found |
| Critical Equation | PathEcho | 4 | product visual fact；raw numeric bridge Not Found |
| Path Resonance | BattleEventBuff special RogueBuff + Aeon owner | N/A | Confirmed；Legendary 不是普通 3★ |
| Curio | unresolved | 1/2/3 | Round 4 |
| Negative Curio | unresolved | excluded | Round 4 |
| Weighted Curio | unresolved | excluded | Round 4 |

## 29. Relation Tables

### 29.1 Equation

| Source | Field | Target | Cardinality | Confidence | Notes |
|---|---|---|---|---|---|
| Formula | FormulaID | self identity | 328 unique | Confirmed | canonical raw entity |
| Formula | MazeBuffID | RogueMazeBuff.ID | 328→324；all target Lv1 | Confirmed | effect/presentation identity |
| Formula | FormulaDisplayID | FormulaDisplay | 328→324 | Confirmed | 4 shared pairs |
| Formula | MainBuffTypeID | TournBuffType | 328/328 | Confirmed | ordered main Path |
| Formula | SubBuffTypeID | TournBuffType | 303/303 | Confirmed | absent only PathEcho |
| FormulaDisplay | ExtraEffect[] | ExtraEffectConfig | 293 refs / 25 targets | Confirmed | glossary |
| RogueTournKeyword | RogueFormulaList[] | FormulaID | 247 refs / 222 IDs | Confirmed | partial mechanic association, not pool |
| FormulaRandom | contents | FormulaID | no field exported | Unresolved | only RandomID |
| Formula | Skill/BattleEvent | BattleEvent config | 0 refs | Not Found | no heuristic FK |

### 29.2 Resonance

| Source | Field | Target | Cardinality | Confidence | Notes |
|---|---|---|---|---|---|
| RogueAeon | BattleEventBuffGroup | RogueBuffGroup | 9/9 | Confirmed | not BattleEventData |
| RogueAeon | EnhanceGroup | RogueBuffGroup | 9/9 | Confirmed | 3 terminal tags each |
| BuffGroup | member[] | RogueBuffTag | base9 + enhance27 + cross34 | Confirmed | all direct for these subsets |
| RogueBuff | MazeBuffID+Level | RogueMazeBuff.ID+Lv | 70/70 exact | Confirmed | all Lv1 |
| Cross owner | BuffGroup | RogueBuffGroup | 34/34 | Confirmed | one effect each |
| Cross owner | Main/SubAeonID | source-family Aeon | 68 refs | Confirmed | ordered；counts all 3+3 |
| DLC/Nous Aeon | base/enhance group | same base groups | DLC8 / Nous9 | Confirmed | overlay/reuse |
| BattleEventData | SkillIDList | BattleEventSkill | 25 target skills | Confirmed | battle subsystem |
| Resonance owner | SkillID | BattleEventSkill | 0 | Not Found | presentation only |

## 30. Data Quality / Edge Cases

- Formula：0 duplicate FormulaID、0 missing Path/Maze/Display/name/desc/simple-desc；4 mode-less edges；0 unknown category。
- Formula：所有 Maze targets Lv1-only；`BuffDescBattle` 全缺，不应设为 required。
- Path pairs：T1/T3 各缺一个 unordered pair，T2 全覆盖；不是每个 Path pair 在每 mode 必然存在。
- FormulaRandom：只导出 ID，不能伪造 pool/weight。
- Resonance：9/9 Aeon 都有 1 base + 3 enhancement；无 ownerless special base/enhance。
- Cross：34/34 groups/targets resolve；0 duplicate family-qualified pair；Nous 有 3 组双向不同效果。
- DLC/Nous：相同 AeonID 是 separate raw records；DLC 缺 Aeon9 是真实 mode coverage difference。
- BattleEvent：26 localized target skills 中 1 条 4200401 当前无 BattleEventData consumer；仍不能反向绑定 Rogue owner。
- Assets：只有 HoshinoKami large images覆盖；Path/cross/skill/special Buff icons存在 config path但资源仓缺实体。

## 31. Rejected Hypotheses

| Hypothesis | Result | Evidence |
|---|---|---|
| PathEcho automatically means raw rarity=4 | Rejected | category ≠ numeric rarity；无 bridge |
| Rare/Epic/Legendary solely by enum order become stars | Rejected as raw fact | mapping仅由产品事实+supporting config支持 |
| Main/Sub Path unordered | Rejected | reverse pairs有不同 effects；main/sub icons分开 |
| FormulaDisplayID is Formula identity | Rejected | 4 displays each shared by 2 FormulaIDs |
| MazeBuffID is Formula identity | Rejected | 同样 4 shared effects |
| BattleEvent skill linked by icon/name | Rejected | full-library direct FK 0 |
| Enhancement is MazeBuff Lv2/Lv3 | Rejected | 27 independent Lv1 Maze IDs |
| Legendary resonance is ordinary 3★ blessing | Rejected | special owner/type boundary |
| same Formula name across TournMode is same entity | Rejected | no revision FK；IDs/targets are raw authority |
| same AeonID across base/DLC/Nous is same raw record | Rejected | separate tables and mode effect fields |
| ActivityModuleID is full availability | Rejected | Nous owner consumes 6 earlier-provenance targets |
| FormulaRandom.RandomID is Equation identity | Rejected | selection structure key only；contents absent |

## 32. Proposal-only Normalized Models

以下仅为 design input，不实现。

```ts
interface RogueEquation {
  id: `RogueTournFormula:${number}`;
  formulaId: number;
  kind: 'ordinary' | 'critical';
  rawCategory: 'Rare' | 'Epic' | 'Legendary' | 'PathEcho';
  // presentation-only, never raw semantics
  proposedStarCount?: 1 | 2 | 3 | 4;
  mode: 'Tourn1' | 'Tourn2' | 'Tourn3';
  inHandbook?: boolean;
  requirement: {
    main: { rawType: number; path: string; count: number };
    sub?: { rawType: number; path: string; count: number };
  };
  mazeBuffId: number;
  formulaDisplayId: number;
  effect: RogueEffectPresentation;
  extraEffects: RogueExtraEffect[];
}

interface RoguePathResonance {
  id: `RogueAeon:${number}`;
  aeonId: number;
  path: RoguePath;
  baseGroupId: number;
  effect: RogueSpecialBuffEffect;
  overlays: Array<{ source: 'RogueDLCAeon' | 'RogueNousAeon'; rawAeonId: number }>;
}

interface RogueResonanceEnhancement {
  id: `RogueBuff:${number}`; // MazeBuffID within source family
  aeonId: number;
  ownerGroupId: number;
  rawOrder: number;
  effect: RogueSpecialBuffEffect;
}

interface RogueCrossResonance {
  id: `${'RogueDLCAeonCross' | 'RogueNousAeonCross'}:${number}:${number}`;
  sourceFamily: 'RogueDLCAeonCross' | 'RogueNousAeonCross';
  main: { aeonId: number; count: number };
  sub: { aeonId: number; count: number };
  buffGroupId: number;
  effect: RogueSpecialBuffEffect;
  introducedByModule?: number;
  availableIn: 'ChessRogue' | 'ChessRogueNous';
}
```

三层必须分开：

- **raw ownership：** Formula/Aeon/Cross source row、group、special RogueBuff、MazeBuff、Display；
- **normalized convenience：** composite ID、Path canonical key、effect presentation primitive、overlay list；
- **presentation convenience：** formatted params、glossary、starCount、shared card shape。

## 33. Design Readiness and Hard-code Boundary

### 足以进入 normalized-model design

- FormulaID canonical identity、complete classification、TournMode、ordinary/critical visibility boundary；
- ordered structured requirement 与 10-type DU Path taxonomy；
- Formula→MazeBuff→localized effect/params/binding boundary；
- Formula→Display→story/ExtraEffect/unlock supplement；
- RogueAeon base owner、9×base、9×3 enhancements；
- source-qualified Cross identity、ordered 3+3 requirements、34 complete effect chains；
- base/DLC/Nous overlay relation与 introducedBy/availableIn 分离；
- ExtraEffect、localization、placeholder validation、asset gap diagnostics。

### 仍不可硬编码

- 将 `starCount` 冒充 raw field；尤其 `PathEcho=raw rarity 4`；
- 4 个 mode-less rows 的 legacy/replacement/version 语义；
- FormulaRandom pool contents、weights、DAG 或完整 pool membership；
- Formula/Aeon/special Buff 到 BattleEventSkill 的 FK；
- enhancement 的 unlock count/selection threshold；
- 通过名称、icon、共享 artwork 合并 entity/revision；
- 用 `ActivityModuleID` 代替完整 mode availability；
- 把 Resonance Legendary 映射普通 3★。

## 34. Remaining Questions and Recommendation

1. `RogueTournFormulaRandom` 的 contents/weight 未出现在当前导出。只有产品需要精确抽取池时才需查客户端原始 binary/UI rule 或更新导出。
2. BattleEventSkill 的 Rogue owner FK 未找到。只有要展示 skill button/runtime tooltip 或实现 combat binding 时才需专项追踪，不阻塞 Rogue normalized schema。
3. 回响构音的 acquisition/unlock threshold 未找到。不要把游戏经验写成 raw rule。
4. 星级 bridge 仍不存在。schema 保存 raw category；UI 可在明确产品规则下派生 ordinary 1/2/3 与 critical 4，并标注 provenance。
5. 本地资产只有 HoshinoKami large images；其余配置 path 需要以后单独决定合法资源来源与 asset pipeline。

**Round 3 结论：无需继续 Round 3B/3C 即可开始 Equation/Resonance normalized-model design。** 设计必须保留上述 unresolved 字段为空/unknown，并把星数放在 presentation derivation 层。

建议下一步进入 **Round 4 — Curio / Weighted Curio / Hex**；不要在 Round 4 顺带改动本轮 schema 或 UI。
