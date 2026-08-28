# Rogue Investigation Round 4 — Curios

调查日期：2026-08-28  
网站仓快照：`c6fc8f692346d89c6b66f27f557839d32aa169ab`  
权威结构数据：`../../../TurnBasedGameData/ExcelOutput`（`687a47fff45776cad442ef49a34237074a2abfa3`）  
权威中文文本：`../../../TurnBasedGameData/TextMap/TextMapCHS.json`  
辅助资产数据：`../../../StarRailRes`（`f1b643637554019f6d611ac9240410bbe9698da8`）  
前置证据：`00-config-inventory.md`、`00-config-inventory-appendix.md`、`01-blessings.md`、`02-equations-and-resonance.md`  
调查性质：**只读调查；未修改 schema、pipeline、domain types、route、UI、CSS、search、navigation 或资产。**

证据等级：`Confirmed`、`Strongly Supported`、`Partial`、`Unresolved`、`Not Found`、`Rejected`。

## 1. Executive Summary

### 1.1 Base / SU（A–E）

| 问题 | 结论 | 等级 |
|---|---|---|
| A. Base/SU canonical raw identity | `RogueMiracle.MiracleID`。250/250 唯一；它是 runtime/state identity，不能被 Display、EffectDisplay 或 Handbook ID 替代。 | Confirmed |
| B. user-visible subset | 严格的 collection identity 来自 `RogueHandbookMiracle`。250 runtime rows 中 207 条显式带 `UnlockHandbookMiracleID`，汇聚到 82 个 handbook rows；其余 43 条是无独立图鉴 FK 的状态/边缘记录，不能仅因有名称就当独立可见奇物。 | Confirmed explicit subset；其余 visibility Partial |
| C. Display / Effect / EffectDisplay / Handbook ownership | `RogueMiracleDisplay` 管名称、背景与图片；Base 只显式指向 `RogueMiracleEffectDisplay`，没有到 `RogueMiracleEffect` 的 FK；Handbook 管 collection identity、奖励、顺序与模式筛选。 | Confirmed |
| D. 11 个 missing-display rows | `2001,2002,2004–2012` 只有 `MiracleID`，无 display/effect-display/handbook。`2001/2004/2011` 被 Base pool 引用，其余 8 条在目标配置集合内仅见 owner row。它们必须 audit-retain；前 3 条可称 pool-referenced opaque helper，后 8 条仍是 unresolved id-only edge，不能擅称 legacy 或删除。 | Confirmed structure；semantics Unresolved |
| E. Base 1★/2★/3★ raw rarity | 未找到 raw representation。`RogueHandbookMiracleType` 的五个标签是“全部/模拟宇宙/寰宇蝗灾/黄金与机械/不可知域”，不是 rarity；Base owner/display/effect-display/group 均无 category/quality/rank/star bridge。 | Not Found |

### 1.2 DU（F–J）

| 问题 | 结论 | 等级 |
|---|---|---|
| F. DU canonical raw identity | `RogueTournMiracle.MiracleID`。699/699 唯一，所有 row 都有 valid Display 与 runtime Effect FK。 | Confirmed |
| G. ordinary Curio | `MiracleCategory ∈ {Common,Rare,Legendary}`，共 537 条；与 105 Negative、57 category-absent 形成完整互斥分区，无需制造 Other。 | Confirmed |
| H. `Common/Rare/Legendary → 1★/2★/3★` | 足以作为 ordinary-only 的 presentation derivation；raw 中没有 starCount、category→数字、frame/color/quality bridge。不能把星数写回 raw category。 | Strongly Supported；raw bridge Not Found |
| I. `Negative → 负面奇物` | literal enum、handbook 同 category，以及 TextMap 中 exact“负面奇物”和 136 条产品/规则文本形成闭环。 | Confirmed |
| J. Negative 与 ordinary | 共用 `RogueTournMiracle` owner、Display、Effect、Handbook architecture；仅 discriminator 不同。Negative 不是 0★ ordinary。 | Confirmed |

### 1.3 Weighted（K–P）

| 问题 | 结论 | 等级 |
|---|---|---|
| K. 57 条 category-absent 是否为加权奇物 | **结构分区 Confirmed；产品名 Strongly Supported。** 57 个 uncategorized `MiracleID` 与 57 个 sidecar IDs 集合精确相等，全部 Tourn1/2、全部有 handbook；Tourn1/2 活动说明与 UI 明确使用“加权奇物”。但没有 row-level `Weighted` enum/FK，故产品名不提升为 raw fact。 | Confirmed structure / Strongly Supported semantic |
| L. sidecar 职责 | `RogueTournHexAvatarBaseType` 是这 57 个 runtime entities 的 applicability sidecar；只存 `MiracleID + AvatarType[] + AvatarDamageType[]`，不是新的奇物 identity，也不是 Hex owner。 | Confirmed |
| M. Path / Element | `AvatarType[]` FK-like 值由 `AvatarBaseType.ID` 映射为命途；`AvatarDamageType[]` 由 `DamageType.ID` 映射为属性。它们描述效果适用角色，不是获取/解锁条件。 | Confirmed |
| N. 条件逻辑 | 当前 57 rows 是 31 path-only + 26 element-only；0 both、0 neither。单数组多值在中文效果中是集合成员 one-of/OR。由于从未同时出现两轴，跨轴 AND/OR **不可观测、不可硬编码**。 | Confirmed current shape；cross-axis Unresolved |
| O. visibility | 57/57 都有 `HandbookMiracleID` 且命中 category-absent handbook row，Display/Effect 也全命中；可进入加权 collection。TournMode 为 T1 23、T2 34。 | Confirmed |
| P. normal ↔ weighted explicit relation | 未找到。57 个 effect IDs 全独立；与 ordinary 只有 1 个 shared DisplayID，且表中没有 base/origin/upgrade/replacement/weighted FK。名称、icon、共享 presentation 不能建 entity relation。 | Not Found |

### 1.4 Tourn3 Hex（Q–U）

| 问题 | 结论 | 等级 |
|---|---|---|
| Q. Hex canonical identity | `RogueTournHex.HexID`。26/26 唯一；DisplayID、MazeBuffID 也各 26 unique，但都是 relation target。 | Confirmed |
| R. 是否可 Confirmed 为“惊世奇迹” | Tourn3 activity panel 明确把收集项写为“惊世奇迹”，TextMap 有 exact label/选择/一览/奖励文本，且 Hex 是唯一 Tourn3 专属、带角色条件的独立 special family。但没有 `HexID → product category label` 的 direct FK。最终仍为 **Strongly Supported**，不是 raw-confirmed enum。 | Strongly Supported |
| S. Hex 与 Weighted raw relation | 两套 owner、identity、effect 与 condition ownership；57 weighted 只在 T1/2，26 Hex 只在 T3；ID 集不交。34 HexDisplay 的名称与 icon basename 都复用 weighted presentation，但这只是 presentation correspondence，不是 replacement FK。 | Confirmed separation；replacement Not Found |
| T. condition primitive | 可以共享 `{axis, oneOf[]}` normalized primitive；Weighted 条件在 sidecar，Hex 条件 inline。不得因此假定未来双轴 operator 相同。 | Strongly Supported design input |
| U. 8 个额外 HexDisplay | `1003,1004,1006,1009,1010,1013,1024,1025` 当前无 Hex owner。八条都有完整 localized name/bg/icon/figure，且都与旧 weighted presentation 同名同 basename；只能分类为 **unowned display-only candidates**，不能硬称 internal、legacy 或删除。 | Confirmed unowned；semantics Unresolved |

### 1.5 Shared / Architecture（V–AE）

| 问题 | 结论 | 等级 |
|---|---|---|
| V. Effect vs EffectDisplay | `RogueMiracleEffect` 是 DU runtime effect owner（文本、ParamList、optional DynamicHint）；`RogueMiracleEffectDisplay` 是 Base/Magic/handbook presentation state（DescParamList、SimpleDesc、ExtraEffect）。二者无 explicit FK。 | Confirmed |
| W. multi-state | 明确存在。Base 239 display-bearing runtime rows 只用 85 displays；DU 699 rows 只用 283 runtime displays、534 referenced handbook identities，且一个 handbook 可被最多 12 个 runtime rows 引用。state identity 必须保留 owner `MiracleID`。 | Confirmed |
| X. `#{miracle:...}` | numeric token（例 `9258`）可命中 `RogueTournMiracle.MiracleID`；六条 DU effect 中 `excel_N` 可由同 row `ParamList[N].Value` 解到目标 MiracleID。不能把 `excel_N` 当字面 ID。 | Confirmed for observed patterns |
| Y. ExtraEffect | 是可本地化、带 icon/type 的 user-facing glossary/annotation，不是 Curio identity 或 combat effect owner。Hex 5 条引用、EffectDisplay 6 条引用均命中 `ExtraEffectConfig`。 | Confirmed |
| Z. assets | `StarRailRes/icon/curio` 仅 84 个 128×128 PNG。Base 84/84 unique basenames 命中；DU ordinary 67/187、negative 11/27；weighted 0/35；Hex 0/26。只能作为 coverage diagnostics。 | Confirmed |
| AA. ordinary / negative / weighted normalized type | 可以共用一个 source-qualified、discriminated `RogueCurio` family；不能 flatten rarity、visibility 或 applicability。 | Strongly Supported |
| AB. Hex normalized type | 应独立为 `RogueHex`/special-curio domain type，复用低层 presentation/effect/applicability primitives。 | Strongly Supported |
| AC. 可跨域复用 primitives | Path/element taxonomy、mode/provenance、localized text ref、parameterized text、ExtraEffect glossary、asset ref、visibility evidence、applicability predicate。 | Strongly Supported |
| AD. rarity boundary | DU `MiracleCategory` 是 raw；ordinary starCount 是 presentation derivation；Base star raw bridge缺失；Negative/Weighted 不进入普通 star mapping；Hex `MazeBuff.BuffRarity=1` 不是 Curio 星级。 | Confirmed boundary |
| AE. 是否可进入统一 normalized architecture design | **可以。** identity、owner、分区、effect/display/handbook、conditions 与 visibility evidence 已足够；rarity raw bridge、pool contents、cross-mode revision、Hex product-name direct FK 等必须保留 unknown。 | Ready with hard-code boundaries |

## 2. Scope and Exclusions

本轮严格分四条 track：

```text
Track A — Base/SU
RogueMiracle + shared Display/EffectDisplay + RogueHandbookMiracle

Track B — DU ordinary/negative
RogueTournMiracle + RogueMiracleDisplay/Effect + RogueTournHandbookMiracle

Track C — DU weighted candidate
category-absent RogueTournMiracle + RogueTournHexAvatarBaseType

Track D — Tourn3 Hex
RogueTournHex + RogueTournHexDisplay + MazeBuff + ExtraEffectConfig
```

方法包括全库 cardinality、ID/FK coverage、handbook fan-out、category/mode 分区、TextMap decimal-string resolution、symbolic/numeric placeholder audit、条件轴与 taxonomy 映射、精确 basename 资产检查，以及 target-field 反向检索。

`RogueMagicMiracle` 只作为 shared presentation 边界纳入，不全面调查不可知域。故事文本只用于 presentation/semantic supporting evidence；combat ability、客户端 code 与二进制 pool 内容不在范围内。

# Part A — Base Curio

## 3. Base Raw Ownership

```text
RogueMiracle.MiracleID                         ← runtime/state identity
├── MiracleDisplayID? ───────────────────────→ RogueMiracleDisplay
├── MiracleEffectDisplayID? ─────────────────→ RogueMiracleEffectDisplay
└── UnlockHandbookMiracleID? ────────────────→ RogueHandbookMiracle.MiracleHandbookID
```

| Metric | Result |
|---|---:|
| runtime rows / unique MiracleID | 250 / 250 |
| rows with DisplayID | 239 |
| rows with EffectDisplayID | 239 |
| rows with Handbook FK | 207 |
| unique DisplayIDs used | 85 |
| unique EffectDisplayIDs used | 237 |
| unique HandbookIDs referenced | 82 |
| broken present FKs | 0 |

ID equality没有 semantic guarantee：只有 8 条 `MiracleID=MiracleDisplayID`、53 条等于 EffectDisplayID、61 条等于 HandbookID。normalized identity 必须 source-qualify，例如 `RogueMiracle:1`。

## 4. Display / Effect / Handbook

### 4.1 Display

`RogueMiracleDisplay` 有 314/314 unique IDs，字段只有 name、background、icon、figure。Base 的 239 rows 形成明显 N:1 state presentation：

| Display fan-out | Display count |
|---:|---:|
| 1 runtime | 18 |
| 2 runtimes | 6 |
| 3 runtimes | 52 |
| 4 runtimes | 2 |
| 6 runtimes | 6 |
| 9 runtimes | 1 |

Display 多于 Base owner 不是异常：同表还被 DU runtime、Base/DU handbook、Magic family 复用。合并这些已列 owner 后仍有 20 条 shared display 当前未被引用，必须视为 display-only edge，而不是新 Curio。

### 4.2 Effect 与 EffectDisplay

Base row 只给 `MiracleEffectDisplayID`。全库拥有 `MiracleEffectID` 字段的 Curio owner 是 `RogueTournMiracle`/`RogueTournHandbookMiracle`；没有 `RogueMiracle → RogueMiracleEffect` FK，也没有 `EffectDisplay → Effect` FK。

因此：

- Base exported chain 能确认的是 **effect presentation state**，不是完整 runtime effect owner；
- `RogueMiracleEffectDisplay.MiracleEffectDisplayID` 是 display-state identity；
- Base 的真实 combat/runtime implementation 不得为了与 DU 对称而虚构。

### 4.3 Handbook

`RogueHandbookMiracle` 112/112 unique handbook IDs；Base 显式引用 82 条，其中 82 条 display/effect-display 都与 owner FK 回链一致。Handbook 另有 30 条未被 Base owner 引用，属于 Magic/其它 handbook presentation 边界。

`RogueHandbookMiracleType` 的真实语义：

| Type | Title | ActivityModuleID |
|---:|---|---:|
| 1 | 全部奇物 | absent |
| 100 | 模拟宇宙 | absent |
| 130 | 模拟宇宙：寰宇蝗灾 | 6000302 |
| 160 | 模拟宇宙：黄金与机械 | 6000901 |
| 260 | 模拟宇宙：不可知域 | 6001601 |

`MiracleTypeList[]` 是 handbook mode/filter membership，不是 rarity。Handbook identity 也不是 runtime identity：207 runtime states 可汇聚到 82 collection rows。

## 5. Base Visibility

| Base runtime subset | Rows | Interpretation |
|---|---:|---|
| explicit Handbook FK | 207 | explicit collection linkage；82 unique visible handbook identities |
| no Handbook FK、Display 属于某 handbook | 28 | runtime/state variant；不形成独立 collection identity |
| no Handbook FK、Display 不在 handbook | 4 | display-bearing non-collection edge：IDs 16、109、901、902 |
| no Display/EffectDisplay/Handbook | 11 | opaque id-only edge |

可靠的 normalized collection 应以 handbook row 为 visibility evidence，并保留对应 runtime states。`hasName`、`hasDisplay`、pool membership 都不足以单独等价 `isVisible=true`。

## 6. Base Rarity

在 `RogueMiracle`、Display、EffectDisplay、Handbook、HandbookType、Group 中均未找到 `rarity/category/quality/rank/star` bridge。Group 的整数 weight 只表示抽取权重；HandbookType 表示模式筛选。

结论：Base ordinary 1★/2★/3★是已知产品展示事实，但当前 raw 快照不能按 ID 可靠重建。Base normalized model 应保留 `rawRarity=null`；若将来由产品维护 starCount，必须标注 external/presentation provenance。

## 7. Base Pools

`RogueMiracleGroup` 100 rows，结构为：

```text
RogueMiracleGroupID
└── MiracleWeight { MiracleID: weight }
```

| Metric | Result |
|---|---:|
| total member refs | 989 |
| unique member IDs | 240 |
| member refs missing `RogueMiracle` owner | 2（43、44） |
| Base owner IDs never in any group | 12 |
| weights | 890×1、11×2、88×3 |

多 group membership 很普遍，最多一个 ID 出现在 10 groups。Group 是 pool entity，不是 Curio、rarity 或 visibility owner；还不能仅由 group ID 推导完整 mode availability。

11 个 opaque rows 中只有 `2001`、`2004`、`2011` 被 group 引用（分别 1、2、1 groups）。这证明它们参与某些 runtime pool，但不证明玩家可直接看到一张 Curio card。

# Part B — DU Curio

## 8. DU Raw Ownership

```text
RogueTournMiracle.MiracleID                   ← runtime/state identity
├── TournMode                                 ← Tourn1 | Tourn2 | Tourn3
├── MiracleCategory?                         ← raw discriminator
├── MiracleDisplayID ───────────────────────→ RogueMiracleDisplay
├── MiracleEffectID ────────────────────────→ RogueMiracleEffect
└── HandbookMiracleID? ─────────────────────→ RogueTournHandbookMiracle
```

699/699 `MiracleID` unique；699 Display 与 699 Effect FKs 全命中。647 rows 有 handbook FK，52 rows 无；这 52 条仍是有效 runtime variants，不应从 raw universe 删除。

## 9. Full Classification

| Classification | Raw predicate | Rows | Modes |
|---|---|---:|---|
| Ordinary | Common/Rare/Legendary | 537 | T1/T2/T3 |
| Negative | Negative | 105 | T1/T2/T3 |
| Weighted structural set | category absent + exact sidecar member | 57 | T1/T2 only |
| Other Special | — | 0 | — |
| Unresolved category | — | 0 | — |

699 rows 全覆盖，三类互斥。Visibility/state status 是另一维，不能把 52 个无 handbook FK 的 ordinary variants 改分类为 internal。

## 10. Ordinary Curio

ordinary category/mode cardinality：

| Mode | Common | Rare | Legendary | Total |
|---|---:|---:|---:|---:|
| Tourn1 | 42 | 58 | 19 | 119 |
| Tourn2 | 71 | 111 | 24 | 206 |
| Tourn3 | 83 | 104 | 25 | 212 |
| Total | 196 | 273 | 68 | 537 |

三种 category 都有有效 Display/Effect；handbook category 对所有显式 join 均与 owner category 一致。普通分类由 raw enum 确认，不需要从名称、效果强度或 icon 推断。

## 11. Negative Curio

105 条 `MiracleCategory=Negative`：T1 25、T2 32、T3 48。它们与 ordinary 共用 owner/display/effect/handbook family，所有 105 条都有 display/effect；所有 Negative runtime rows 都带 handbook FK，但会汇聚到 70 个 handbook identities。

产品语义证据：

- raw enum literal `Negative`；
- handbook row 保留同一 category；
- TextMap 有两个 exact“负面奇物”label，以及 136 条规则/事件/collection 文本；
- 文本明确把“负面奇物”与“1–2星奇物”等普通集合并列。

所以 Negative 是同一 raw family 的 separate kind，不是 ordinary rarity tier，也不能 derivation 为 0★。

## 12. Rarity

| Raw category | Proposed presentation | Evidence | Hard-code boundary |
|---|---:|---|---|
| Common | 1★ | product fact + ordered ordinary category + star-labeled Curio rules | ordinary-only derivation |
| Rare | 2★ | same | ordinary-only derivation |
| Legendary | 3★ | same | ordinary-only derivation |
| Negative | none | explicit separate product category | never map to ordinary star |
| absent/weighted | none | explicit separate product category | never map to ordinary star |

未找到 category config、starCount、frame、color、quality 或 rank 数字 bridge。状态是 Strongly Supported presentation mapping，不是 raw fact。

## 13. DU Mode / Visibility

`TournMode` 在所有 699 rows 上存在：T1 167、T2 272、T3 260。它可作为 raw mode owner/provenance，但不能自动推导“在所有后续版本仍可获得”。

Handbook architecture：

| Metric | Result |
|---|---:|
| handbook rows / unique IDs | 544 / 544 |
| runtime rows with FK | 647 |
| unique handbook IDs referenced | 534 |
| unowned handbook rows | 10 |
| handbook rows with `MiracleEffectID` | 203（均为 Tourn3 layer） |

Handbook Display 是双来源而非单表：407 rows 指向 shared `RogueMiracleDisplay`，137 rows 指向 `RogueTournMiracleDisplay`；两组 target ID 在当前 handbook 引用中不碰撞，0 missing。`RogueTournMiracleDisplay` 有 166 rows，当前 handbook 使用 135 unique targets，余 31 条未被使用。

10 个 unowned handbook rows 是完整 presentation/collection remnants（包括天彗合金 I/II/III 型、分裂咕咕钟等）；没有 runtime owner FK，故不能自动纳入 active runtime set。严格 visibility 应分别保存：

```text
runtimeRenderable = owner + valid Display + valid Effect
collectionLinked  = explicit HandbookMiracleID
handbookOnly      = handbook row without current runtime owner
```

# Part C — Weighted Curio

## 14. Weighted Classification

结构闭环：

```text
set(RogueTournMiracle.MiracleID where MiracleCategory absent)
==
set(RogueTournHexAvatarBaseType.MiracleID)
== 57 IDs
```

两侧差集均为空；所有 57 IDs 具备 valid runtime Display/Effect/Handbook。分布为 Tourn1 23、Tourn2 34、Tourn3 0。

产品语义 supporting evidence：

- Tourn1/Tourn2 `ActivityPanel.IntroDesc` 明确介绍/收集“加权奇物”；
- TextMap 有 4 个 exact“加权奇物”labels、122 条相关文本；
- `ActionGroup_Rouge_Only` 的 localized 文本为“仅显示加权奇物”；
- `RogueTournContentDisplay[807]` 是“尚未获得该加权奇物…”，但当前 handbook `UnlockDesc` 实际恒用 806，故 807 不能伪装成 row-level FK。

最终：57-set 的 raw partition 与 applicability ownership 是 Confirmed；“加权奇物”产品名是 Strongly Supported，不是 `MiracleCategory=Weighted`。

## 15. HexAvatarBaseType Sidecar

字段仅有：

```text
MiracleID
AvatarType[]
AvatarDamageType[]
```

它不含 display、effect、handbook、rarity、mode 或独立 ID。canonical owner 仍是 `RogueTournMiracle.MiracleID`。

Path mapping 由 `AvatarBaseType.ID → BaseTypeText` 直接给出：

| Raw | Path | Raw | Path |
|---|---|---|---|
| Warrior | 毁灭 | Rogue | 巡猎 |
| Mage | 智识 | Shaman | 同谐 |
| Warlock | 虚无 | Knight | 存护 |
| Priest | 丰饶 | Memory | 记忆 |
| Elation | 欢愉 | — | — |

Weighted 当前使用前八种，不使用 Elation。Element mapping 为 Physical/Fire/Ice/Thunder/Wind/Quantum/Imaginary → 物理/火/冰/雷/风/量子/虚数。

## 16. Applicability Conditions

| Shape | Weighted rows | Hex rows |
|---|---:|---:|
| Path-only | 31 | 17 |
| Element-only | 26 | 9 |
| both axes | 0 | 0 |
| neither | 0 | 0 |

Weighted cardinality：

- Path list：19×1、11×2、1×3；
- Element list：13×1、12×2、1×3；
- effect text 对多值使用并列集合，例如“「毁灭」「虚无」命途角色”或“「物理」「量子」属性角色”。

推荐语义：

```ts
type RogueApplicability =
  | { axis: 'path'; oneOf: RoguePath[] }
  | { axis: 'element'; oneOf: DamageType[] };
```

当前单 row 只有一个 union branch。不要预先添加 `path AND element` 或 `path OR element`；未来若出现双轴 row，必须重新取证 operator。

## 17. Weighted Mode / Visibility

57/57 runtime rows 带 handbook FK，57/57 对应 handbook rows 也缺 category；没有 weighted missing-handbook edge。它们是本轮最完整的 DU collection subset。

Mode owner 是 Tourn1/Tourn2；T1 与 T2 的 57 effects 全不复用，但 presentation 只有 35 unique DisplayIDs，两个 mode 共享 22 个 DisplayIDs。这说明同一外观可跨 mode 复用，不能由此建立 revision identity。

`RogueTournMiracleGroup` 只有 288 个 `RogueMiracleGroupID`，没有 member/weight/mode 字段；因此无法重建加权抽取池、装配池或 selection weight。

## 18. normal ↔ weighted Relation Audit

| Candidate relation | Result |
|---|---|
| explicit base/origin/parent/upgrade/replacement field | Not Found |
| shared runtime effect ID | 0 |
| shared DisplayID with ordinary set | 1 |
| name/icon similarity | present, clue only |
| handbook relation | separate handbook IDs/categories；无 normal target FK |

唯一 shared DisplayID 只是 presentation reuse；按证据规则不能产生 normal→weighted FK。normalized model 可保存独立 Curio rows和共享 presentation ref，不应生成 `weightedVersionOf`。

# Part D — Tourn3 Hex

## 19. Hex Raw Ownership

```text
RogueTournHex.HexID                         ← canonical special entity
├── TournMode = Tourn3
├── AvatarType[] / AvatarDamageType[]       ← inline applicability
├── DisplayID ────────────────────────────→ RogueTournHexDisplay.HexDisplayID
├── MazeBuffID ───────────────────────────→ MazeBuff.(ID, Lv=1)
└── ExtraEffect[] ─────────────────────────→ ExtraEffectConfig.ExtraEffectID
```

26 rows、26 unique HexID、26 unique DisplayID、26 unique MazeBuffID，所有 targets 命中；HexID 与 weighted MiracleID 集合无交集。

### 对 Round 1 前置证据的纠正

当前快照中 `633401–633426` **不在 `RogueMazeBuff.json`**，而在通用 `MazeBuff.json`。因此正确 FK 是：

```text
RogueTournHex.MazeBuffID → MazeBuff.ID
```

不是此前 inventory 写下的 `RogueMazeBuff.ID`。这是一条 direct raw counter-evidence，Round 4 以当前验证结果覆盖该前置结论。

## 20. Hex Display

`RogueTournHexDisplay` 34/34 unique IDs，34/34 name/bg hashes 均在 TextMapCHS resolve。26 条被 owner 使用，8 条 unowned。

重要 presentation correspondence：34/34 HexDisplay 的**解析后名称**与 icon basename 都能在 57 weighted presentations 中找到；TextMap hash 本身不同，且没有 entity FK。八个 unowned display 分别对应：云间肉排、石语者结片、入梦罐、美味球藻糖、神圣容颜、通向彗星之路、星星的回忆、简易判决。

这支持“Hex 复用了旧 weighted presentation palette”，不支持“Hex 就是旧 weighted row 改名”。

## 21. Hex MazeBuff / ExtraEffect

26 个 MazeBuff target 均为：

- single row：`Lv=1, LvMax=1`；
- `BuffRarity=1` 恒定；这是 MazeBuff 技术字段，不是 Hex 1★；
- `BuffDesc` 与 `BuffDescBattle` 都存在且相同；
- `BuffName`、`BuffSimpleDesc` 缺失，名称由 HexDisplay 提供；
- ParamList 长度 1–6；26/26 描述含 numeric placeholder，26/26 bounds valid。

Hex `ExtraEffect[]`：21 rows 为空，5 rows 各 1 项，全部命中 `ExtraEffectConfig`：

| Hex | ExtraEffect | Glossary |
|---|---:|---|
| 1007 醒觉-310 | 61000500 | 基础伤害 |
| 1012 喧哗上等 | 61000500 | 基础伤害 |
| 1016 平行宇宙对讲机 | 61000500 | 基础伤害 |
| 1020 冬鱼夏草 | 10000015 | 超击破伤害 |
| 1022 绝对音质 | 61000500 | 基础伤害 |

这些 glossary row 的 `ExtraEffectType=2`，有独立 localized name/desc/icon，无 BattleEventSkill 或 Curio identity FK。

## 22. Hex Conditions

Hex 条件形状为 17 path-only + 9 element-only。Path list 为 9×1、6×2、2×3；Element list为4×1、5×2。与 Weighted 一样，文本把数组解释为受效果影响的 one-of 角色集合。

Hex 新增使用 `Elation=欢愉`；同一 normalized Path taxonomy 可以共享，但 raw owner 与字段位置必须保留：

```text
Weighted: RogueTournHexAvatarBaseType sidecar
Hex:      RogueTournHex inline
```

## 23. “惊世奇迹” Semantic Verification

证据链：

1. `RogueTournHex` 26 rows 全部 `TournMode=Tourn3`，是独立 special family；
2. `ActivityPanel.PanelID=60018` 使用 `QuestRogueTournPersonaPanel`，其 IntroDesc 明确说收集“奇物、惊世奇迹”；Tourn1/Tourn2 panels 对应位置写“加权奇物”；
3. TextMap 有 2 个 exact“惊世奇迹”label，共 19 条相关产品文本，包括“选择惊世奇迹”“惊世奇迹一览”“获得…惊世奇迹”；
4. Tourn3 的旧 weighted structural set为 0，而 Hex 有 26 条。

缺口：未找到 `HexID`、HexDisplay 或 selection pool 到 exact product label hash 的 explicit FK；只有 mode-level与 UI-level闭环。

```text
Raw family:       RogueTournHex
Product semantic: 惊世奇迹
Status:           Strongly Supported（not raw-confirmed）
```

## 24. Weighted vs Hex Relationship

| Dimension | Weighted | Hex |
|---|---|---|
| owner | RogueTournMiracle | RogueTournHex |
| identity | MiracleID | HexID |
| mode | Tourn1/Tourn2 | Tourn3 |
| effect | RogueMiracleEffect | MazeBuff |
| display | RogueMiracleDisplay | RogueTournHexDisplay |
| applicability | sidecar | inline |
| handbook | RogueTournHandbookMiracle | none exported |
| explicit cross-FK | none | none |

存在完整 presentation reuse，但不存在 replacement/revision/evolution FK。设计上可以并列展示或共享 artwork reference；不能自动建立 `Hex.replacesWeighted`。

# Shared Systems

## 25. Miracle Effect Architecture

### 25.1 `RogueMiracleEffect`

1038/1038 unique `MiracleEffectID`，字段为 effect desc、ParamList、optional MiracleDynamicHint。DU runtime 使用 694 unique effects 服务 699 rows：690 effects 被一个 row 使用，3 个被两个 rows 使用，1 个被三个 rows 使用。EffectID 不能替代 Curio identity。

699 DU rows 的 694 owned effects 中 694/694 populated descriptions resolve。614 rows 含 numeric placeholders；发现 1 个 bounds edge：weighted `MiracleID=9533` 的文本引用 `#3`，但 ParamList 只有 2 项。该 row 必须保留 raw text/params并标记插值异常，不能静默填值。

### 25.2 `RogueMiracleEffectDisplay`

769/769 unique IDs；Base 使用 237 unique IDs，Magic 使用 81，Base handbook 使用112。字段 coverage：768 MiracleDesc、769 DescParamList、34 SimpleDesc、769 ExtraEffect。

关键 localization 结果：768 个非空 `MiracleDesc.Hash` 与 34 个 `MiracleSimpleDesc.Hash` 在权威 `TextMapCHS.json` 中 **0 resolve**。这不是 owner/display FK 缺失；它是当前 snapshot 的 localization coverage gap。不能因为文本 hash unresolved 就把 Base row判 hidden，也不能从 DU Effect 拼接替代文本。

### 25.3 DU handbook effect

`RogueTournHandbookMiracle` 只有 203/544 rows 带 `MiracleEffectID`，全部属于 Tourn3 presentation layer。它们被 245 runtime rows引用：189 条 runtime effect 与 handbook effect相同，56 条不同；例如一个 handbook可汇聚多条升级/休眠/runtime states。

因此 multi-state identity层次是：

```text
runtime state: MiracleID
collection grouping: HandbookMiracleID
presentation: DisplayID
runtime effect state: MiracleEffectID
```

任何一层都不能单独替换其它层。

## 26. Localization / Symbolic Text

### 26.1 TextMap coverage

| Source field | Populated | Resolved in TextMapCHS |
|---|---:|---:|
| RogueMiracleDisplay.MiracleName | 314 | 314 |
| RogueMiracleDisplay.MiracleBGDesc | 269 | 269 |
| RogueMiracleEffect.MiracleDesc | 1037 | 1037 |
| RogueMiracleEffectDisplay.MiracleDesc | 768 | 0 |
| RogueTournHexDisplay.Name/BgDesc | 34/34 | 34/34 |
| Hex MazeBuff.BuffDesc | 26 | 26 |

所有 hash 都以 lossless decimal string lookup；未使用 JS number round-trip。

### 26.2 `#{miracle:...}` resolver

TextMapCHS 共 17 个文本 rows 出现 miracle token：

- numeric `#{miracle:9258}` 出现 12 次；`9258` 直接命中 Tourn3 `RogueTournMiracle.MiracleID=9258`（超霸王玩偶箱）；
- `excel_1..excel_4` 出现在 6 个 DU runtime effect rows；`excel_N` 对应同一 effect `ParamList[N].Value`，值分别可命中 9062、9025、9063、9261/9262/9263、9230、9231 等 target MiracleID；
- 其余含 numeric 9258 的文本属于其它 UI/mask effect owner，本轮只确认 namespace，不替其建立 Curio owner FK。

推荐 resolver：

```text
numeric token → source-qualified MiracleID lookup
excel_N       → current effect ParamList[N].Value → MiracleID lookup
unknown token → preserve raw token + diagnostic
```

`#{room_comp_type:...}` 是另一个 namespace，不得交给 miracle resolver。rich tags（`<color>`、`<unbreak>`）和 numeric placeholders 应由共用 renderer 处理，raw text保持不变。

## 27. ExtraEffect

`ExtraEffectConfig` 是全 Rogue 共享 glossary table。Curio 相关引用：

- Hex：5 rows、2 unique ExtraEffectIDs；
- EffectDisplay：6 rows，IDs 为 `10000003`×1、`61000500`×5；
- 所有引用均命中 config，相关 entries 均 `ExtraEffectType=2`。

它提供术语名称、说明、参数、icon 与 type；不是 runtime effect、BattleEventSkill 或 rarity owner。normalized model 应使用 `extraEffectRefs[]`，不要把 glossary description 拼进主 effect 文本。

## 28. Assets

审计只在预期目录 `StarRailRes/icon/curio` 做 exact basename mapping，不做全仓 fuzzy search。84 个 PNG 全是 128×128。

| Family | Config rows | Unique icon basenames | Exact hits | Missing |
|---|---:|---:|---:|---:|
| Base display-bearing runtime | 239 | 84 | 84 | 0 |
| DU ordinary | 537 | 187 | 67 | 120 |
| DU Negative | 105 | 27 | 11 | 16 |
| DU Weighted | 57 | 35 | 0 | 35 |
| Hex | 26 | 26 | 0 | 26 |

Base 使用 85 unique DisplayIDs却只有84 unique basenames，说明至少一组 display共享 asset。Asset basename只能映射 presentation coverage，不能产生 Curio、Weighted 或 Hex entity FK。

## 29. Pools / Availability

| Family | Pool evidence | What is safe | What is unknown |
|---|---|---|---|
| Base | 100 `RogueMiracleGroup` with explicit weights | group membership/weight | full mode availability、selection context |
| DU | 288 `RogueTournMiracleGroup` ID-only rows | group identity inventory | members、weights、category filters、mode |
| Weighted | no separate pool contents | TournMode + handbook + sidecar | acquisition/overwrite pool |
| Hex | no group/member config | 26 Tourn3 owner rows renderable | exact selection pool、weights、handbook visibility |

`introducedBy` 与 `availableIn` 必须分开：DU `TournMode` 是 row ownership/provenance；Base handbook type list是 collection filters。两者都不能自动扩展成完整 runtime availability timeline。

# Synthesis

## 30. Curio Family Comparison

| Family | Canonical raw identity | Raw category | Effect owner | Presentation | Applicability | Product semantic |
|---|---|---|---|---|---|---|
| Base/SU | RogueMiracle.MiracleID | none | only EffectDisplay FK exported | shared Display + Handbook | none | ordinary Curio family |
| DU ordinary | RogueTournMiracle.MiracleID | Common/Rare/Legendary | RogueMiracleEffect | shared Display + Tourn Handbook | none | ordinary Curio |
| DU negative | same owner family | Negative | RogueMiracleEffect | same | none | 负面奇物 Confirmed |
| DU weighted | same owner family | absent | RogueMiracleEffect | same | sidecar | 加权奇物 Strongly Supported |
| Tourn3 Hex | RogueTournHex.HexID | none | MazeBuff | HexDisplay | inline | 惊世奇迹 Strongly Supported |

## 31. Rarity Ledger

| Domain | Raw evidence | Presentation derivation | Status |
|---|---|---|---|
| Base ordinary | none found | product has 1★/2★/3★, per-ID mapping unknown | do not encode |
| DU ordinary Common | category=Common | 1★ | Strongly Supported |
| DU ordinary Rare | category=Rare | 2★ | Strongly Supported |
| DU ordinary Legendary | category=Legendary | 3★ | Strongly Supported |
| DU Negative | category=Negative | separate non-star kind | Confirmed |
| DU Weighted | category absent + sidecar | separate non-star kind | Confirmed structure |
| Hex | MazeBuff.BuffRarity=1 technical | no Curio star mapping | do not encode |

## 32. Visibility Matrix

| Family | Runtime renderable | Collection/handbook evidence | Default normalized visibility |
|---|---|---|---|
| Base | 239/250 have Display+EffectDisplay | 207 rows → 82 handbook IDs | expose 82 collection identities；retain states/edges |
| DU ordinary | 537/537 | mixed; some runtime variants no own FK | expose linked handbook identity；retain all runtime states |
| DU Negative | 105/105 | 105 rows → 70 handbook IDs | expose 70 collection identities + states |
| DU Weighted | 57/57 | 57 rows → 57 handbook IDs | expose 57 |
| Hex | 26/26 Display+MazeBuff | no handbook table/FK | expose as Tourn3 runtime set with `handbookVisible=unknown` |
| unowned HexDisplay | presentation only | none | exclude from entity list；audit retain |

## 33. Relation Tables

### Base

| From | Field | To | Coverage | Meaning |
|---|---|---|---:|---|
| RogueMiracle | MiracleDisplayID | RogueMiracleDisplay | 239/239 present | presentation |
| RogueMiracle | MiracleEffectDisplayID | RogueMiracleEffectDisplay | 239/239 present | effect presentation state |
| RogueMiracle | UnlockHandbookMiracleID | RogueHandbookMiracle | 207/207 present | collection linkage |
| RogueMiracleGroup | MiracleWeight key | RogueMiracle.MiracleID | 987/989 refs | weighted pool member |
| RogueMiracle | — | RogueMiracleEffect | 0 explicit | no runtime effect FK exported |

### DU

| From | Field | To | Coverage | Meaning |
|---|---|---|---:|---|
| RogueTournMiracle | MiracleDisplayID | RogueMiracleDisplay | 699/699 | runtime presentation |
| RogueTournMiracle | MiracleEffectID | RogueMiracleEffect | 699/699 | runtime effect |
| RogueTournMiracle | HandbookMiracleID | RogueTournHandbookMiracle | 647/647 present | collection grouping |
| category-absent Miracle | MiracleID | HexAvatarBaseType.MiracleID | 57/57 exact set | applicability sidecar |
| RogueTournHandbookMiracle | MiracleDisplayID | shared/Tourn Display | 544/544 | handbook presentation |
| normal Miracle | — | weighted Miracle | 0 explicit | no variant FK |

### Hex

| From | Field | To | Coverage | Meaning |
|---|---|---|---:|---|
| RogueTournHex | DisplayID | RogueTournHexDisplay | 26/26 | presentation |
| RogueTournHex | MazeBuffID | MazeBuff.ID | 26/26 | main effect text/params |
| RogueTournHex | ExtraEffect[] | ExtraEffectConfig | 5/5 refs | glossary |
| RogueTournHex | — | weighted Miracle | 0 explicit | no replacement FK |

## 34. Representative Traces

### 34.1 Base visible

```text
RogueMiracle.MiracleID=1
  → DisplayID=1 → “降维骰子” + background + 1001.png
  → EffectDisplayID=1 → DescParamList=[1,1,2]（hash当前不resolve）
  → HandbookID=1 → DisplayID=1 / EffectDisplayID=1
                    MiracleTypeList=[100,130,160]
```

### 34.2 Base non-collection state

```text
MiracleID=109 / 901 / 902
  → same DisplayID=61 → “分裂咕咕钟”
  → different EffectDisplayID=79 / 80 / 81
  → no Handbook FK
```

这是明确 multi-state presentation，不是三张独立 handbook Curios。

### 34.3 DU ordinary tiers

```text
6101 Common    “跃迁复眼”   → Effect 801 → Handbook 6101
6125 Rare      “许愿星”     → Effect 824 → Handbook 6125
6301 Legendary “纯美之袍”   → Effect 880 → Handbook 6301
```

Raw 只确认 category；1/2/3★是 presentation derivation。

### 34.4 Negative

```text
6401 / Tourn1 / Negative
  → Display 46 “卜筮咕咕钟”
  → Effect 888（祝福选项减少 #1）
  → Handbook 6401 / Negative
```

### 34.5 Weighted Path

```text
6503 / Tourn1 / category absent
  → Display 131 “云间肉排”
  → Effect 915
  → Handbook 6503 / category absent
  → sidecar AvatarType=[Warrior,Warlock]
  → text applies to “毁灭”“虚无” characters
```

### 34.6 Weighted Element

```text
6509 / Tourn1 / category absent
  → “美味球藻糖”
  → AvatarDamageType=[Physical,Quantum]
  → effect applies to “物理”“量子” characters
```

### 34.7 Hex Path

```text
HexID=1001 / Tourn3
  → HexDisplayID=1014 “十光年不晚”
  → AvatarType=[Rogue/巡猎]
  → MazeBuffID=633401 → MazeBuff Lv1
  → ParamList=[0.3] → BuffDesc #1
```

### 34.8 Hex Element + ExtraEffect

```text
HexID=1020 / Tourn3 “冬鱼夏草”
  → element-only applicability
  → MazeBuff main effect
  → ExtraEffectID=10000015 “超击破伤害” glossary
```

## 35. Edge Cases

- Base 11 id-only rows：3 pool-referenced、8 owner-only；全部不可渲染但不可删除。
- Base groups 有两个 dangling member IDs（43、44），不可伪造 owner。
- Base DisplayIDs 14/61 有四条 display-bearing、无 handbook-link runtime rows。
- 20 shared MiracleDisplay rows与31 TournMiracleDisplay rows当前无列出的 owner；display-only 不等于 entity。
- DU 52 runtime rows无 handbook FK，多数是状态/版本变体；仍有有效 Display/Effect。
- DU 有10个 handbook-only rows，无 current runtime owner。
- 七个 runtime/handbook name mismatch 中六个是“（休眠）”状态，另有 6134 runtime“首次旅程”对 handbook“挣扎的色彩”；保留两层文本，不自动纠正。
- DU Effect `MiracleID=9533` 有一个 numeric placeholder bounds anomaly。
- EffectDisplay hashes 结构有效但 TextMapCHS 全部 unresolved；不是 hidden signal。
- Hex 8个 unowned display rows；不能按名称/icon将其补成 Hex owner。

## 36. Rejected Hypotheses

| Hypothesis | Result | Evidence |
|---|---|---|
| DisplayID 是 Curio identity | Rejected | Base/DU 大量 N:1；display跨family复用 |
| EffectID/EffectDisplayID 是 Curio identity | Rejected | effect可共享；owner state有独立 MiracleID |
| Base 必然有到 RogueMiracleEffect 的 FK | Rejected | Base只导出 EffectDisplayID |
| HandbookID 就是 runtime ID | Rejected | 207 Base states→82 handbook；647 DU states→534 referenced handbooks |
| HandbookType 是 rarity | Rejected | localized titles全是mode/filter |
| Common/Rare/Legendary 自动是 raw starCount | Rejected | 无数字 bridge；只可 presentation derive |
| Negative 是0★ ordinary | Rejected | separate enum/product category |
| category absent 单独足以证明 Weighted | Rejected | 必须加 exact sidecar set、mode与产品UI证据 |
| Weighted 是 `MiracleCategory=Weighted` | Rejected | 该 enum不存在 |
| sidecar 创建新的 weighted identity | Rejected | key回到 MiracleID，只提供conditions |
| Path 与 Element 当前使用 AND | Rejected | 0 rows同时有两轴 |
| normal↔weighted 可按同名/icon链接 | Rejected | 无FK；effect独立 |
| Tourn3 Hex 是旧 weighted row 改名 | Rejected | owner/effect/display/IDs独立，只有presentation correspondence |
| 模式接替意味着 replacement FK | Rejected | 无revision/replacedBy字段 |
| 八个额外 HexDisplay 就是八个 hidden Hex | Rejected | 无Hex owner |
| Hex MazeBuffID 指向 RogueMazeBuff | Rejected for current snapshot | 26 targets只命中 MazeBuff.json |
| BuffRarity=1 表示 Hex 1★ | Rejected | technical MazeBuff field；无Curio star bridge |
| unresolved EffectDisplay hash 表示 hidden | Rejected | owner/FK/params仍完整；是localization coverage gap |
| asset同basename建立entity FK | Rejected | assets只属于presentation |

## 37. Proposal-only Normalized Models

以下只是 design input，不实现。

```ts
type RogueCurioKind = 'ordinary' | 'negative' | 'weighted';

interface RogueCurioRuntime {
  id: `RogueMiracle:${number}` | `RogueTournMiracle:${number}`;
  sourceFamily: 'RogueMiracle' | 'RogueTournMiracle';
  miracleId: number;
  kind: RogueCurioKind;
  rawCategory?: 'Common' | 'Rare' | 'Legendary' | 'Negative';
  // presentation derivation only; ordinary DU subset only
  proposedStarCount?: 1 | 2 | 3;
  mode?: 'Tourn1' | 'Tourn2' | 'Tourn3';
  displayRef?: RoguePresentationRef;
  runtimeEffectRef?: { family: 'RogueMiracleEffect'; id: number };
  effectDisplayRef?: { family: 'RogueMiracleEffectDisplay'; id: number };
  handbookRef?: RogueHandbookRef;
  applicability?: RogueApplicability;
  visibility: RogueVisibilityEvidence;
}

interface RogueHex {
  id: `RogueTournHex:${number}`;
  hexId: number;
  mode: 'Tourn3';
  productLabelEvidence: 'strongly-supported';
  displayId: number;
  mazeBuffRef: { family: 'MazeBuff'; id: number; level: 1 };
  applicability: RogueApplicability;
  extraEffectRefs: number[];
}

type RogueApplicability =
  | { axis: 'path'; oneOf: RoguePath[] }
  | { axis: 'element'; oneOf: DamageType[] };

interface RogueVisibilityEvidence {
  runtimeRenderable: boolean;
  handbookLinked: boolean;
  handbookOnly?: boolean;
  productVisible?: boolean | 'unknown';
}
```

三层必须分离：

- **raw ownership：** source table、owner ID、raw category、raw target IDs、raw params；
- **normalized convenience：** source-qualified ID、discriminated kind、applicability、visibility evidence；
- **presentation convenience：** starCount、formatted params、product label、asset URL、glossary expansion。

## 38. Remaining Questions

1. Base 1★/2★/3★没有 raw per-ID bridge；需要新的 export/config 或明确维护的 product mapping。
2. Base 11个 id-only rows的 runtime职责、8个 owner-only rows是否仍active，当前导出不能回答。
3. `RogueMiracleEffectDisplay` 的文本 hashes为何不在 TextMapCHS；在未找到同快照权威字典前保持 unresolved。
4. `RogueTournMiracleGroup` 缺 contents/weights；精确 DU/weighted/Hex pool需要客户端原始配置或更新导出。
5. Hex→“惊世奇迹”缺 direct row-level category bridge；产品名保持 Strongly Supported。
6. Weighted/Hex未来若出现 Path+Element 同行，跨轴 operator必须重新调查。
7. 8个 unowned HexDisplay 是候选、废弃还是未来预留，当前结构不能定性。
8. DU/Tourn cross-mode availability/revision 不能从同名、shared display或mode顺序推导。

## 39. Recommendation

### 足以进入 normalized-model design

- Base `MiracleID` runtime/state identity、Handbook collection identity与85-display multi-state architecture；
- DU `MiracleID` identity、537 ordinary / 105 negative / 57 weighted 完整分区；
- ordinary raw category与presentation star derivation分层；
- weighted sidecar ownership、Path/Element taxonomy和current one-of semantics；
- Hex独立 identity、Display、`MazeBuff` effect/params、ExtraEffect与inline applicability；
- Effect / EffectDisplay / Handbook四层分工与state identity；
- source-qualified symbolic resolver、numeric placeholder diagnostics；
- visibility evidence而非单一布尔值；
-跨域共享的 Path、Text、Param、ExtraEffect、Asset、Mode primitives。

### 仍不可硬编码

- Base per-ID starCount或任何伪造 raw rarity；
- 把 DU starCount写成 raw category字段；
- Negative/Weighted/Hex套普通1/2/3★；
- 仅以 category absent 判 weighted，或伪造 `Weighted` enum；
- Weighted Path+Element 的跨轴 AND/OR；
- normal↔weighted、weighted↔Hex、跨TournMode revision/replacement FK；
- 以名称、icon、shared Display/Effect合并 entity；
- `RogueTournMiracleGroup` pool contents/weights；
- Base完整runtime effect chain；
- Hex handbook visibility、product-name raw enum；
- 八个unowned HexDisplay的legacy/internal语义；
- 把 unresolved TextMap hash 当空文本或hidden signal；
- 把配置路径存在等同资产文件存在。

**Round 4 结论：Curio domain 已足够进入统一 normalized architecture design，无需为了 schema design 再拆 Round 4A/4B/4C。** 实现时必须把上述 unknown 保留为 nullable/evidence-bearing 字段，并保持 Hex 独立 domain boundary。
