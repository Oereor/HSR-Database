# Rogue Domain Investigation — Round 1: Config Universe Inventory

调查日期：2026-08-27  
权威数据：`../TurnBasedGameData/ExcelOutput`、`../TurnBasedGameData/TextMap/TextMapCHS.json`  
辅助数据：`../StarRailRes`、当前 `HSR-Database` 代码  
状态：**Round 1 complete；后续领域深挖尚未完成**

## Executive Summary

| 问题 | Round 1 结论 | Evidence level |
|---|---|---|
| Blessing canonical config | SU/DLC 侧入口为 `RogueBuff`；DU 侧入口为独立的 `RogueTournBuff`。两者均用 `(MazeBuffID, MazeBuffLevel)` 显式引用 `RogueMazeBuff.(ID, Lv)`，展示文本、参数、图标和战斗绑定属于 `RogueMazeBuff`。 | Confirmed |
| `RogueBuff` ↔ MazeBuff | 不是“一个文件就是祝福、另一个文件就是强化祝福”。`RogueBuff`/`RogueTournBuff` 是分类、可见性、图鉴/池入口；`RogueMazeBuff` 是分等级的 presentation/effect identity。 | Confirmed |
| Equation canonical config | 差分宇宙方程为 `RogueTournFormula.FormulaID`；结构化需求为 `MainBuffTypeID/MainBuffNum` 与 `SubBuffTypeID/SubBuffNum`；效果显式引用 `MazeBuffID`。 | Confirmed |
| Resonance relation | SU 命途回响属于 `RogueAeon → RogueBuffGroup → RogueBuff → RogueMazeBuff` 链，不是普通方程 subtype。 | Confirmed |
| Critical Equation relation | DU 的 `RogueTournFormula.FormulaCategory = PathEcho` 为单命途 16 祝福结构；其 MazeBuff 文本写“临界回响”，`BattleEventSkillConfig` 另有“临界方程”技能。Formula 到 BattleEvent skill 的直接外键尚未找到。 | Strongly Supported / Partial |
| Curio canonical config | Base/SU runtime identity 为 `RogueMiracle.MiracleID`；DU runtime identity 为 `RogueTournMiracle.MiracleID`。名称/背景、效果展示和运行时效果被拆到 Display/Effect family。 | Confirmed |
| Weighted Curio relation | 57 条 `RogueTournMiracle` 恰好缺少 `MiracleCategory`，且与 57 条 `RogueTournHexAvatarBaseType.MiracleID` 一一对应；该 sidecar 提供角色命途/属性条件。不是普通 Curio 上的简单 `Weighted=true`。 | Confirmed |
| Tourn3 Hex | `RogueTournHex` 是 26 条仅 `Tourn3` 的独立 `HexID` family，带 `MazeBuffID` 与角色条件，且不与上述 57 个 `MiracleID` 重合；结合文本，疑似“惊世奇迹”，不能继续称作传统加权奇物。 | Strongly Supported |
| SU / DU relation | `RogueActivityResidentConfig.SubMode` 明确区分 `CosmosRogue`、`ChessRogue`、`ChessRogueNous`、`MagicRogue`、`TournRogue`。DU 使用独立 Tourn entity/pool family，但复用 `RogueMazeBuff`、`RogueMiracleDisplay`、`RogueMiracleEffect` 等低层表。 | Confirmed |
| Dynamic description source | Blessing/Formula：`RogueMazeBuff.BuffDesc` + `ParamList`；Curio：`RogueMiracleEffect(.MiracleDesc, ParamList)` 或 `RogueMiracleEffectDisplay.(MiracleDesc, DescParamList)`。存在 `#N[i/f1/f2]`、rich tags 和 `#{symbolic:key}`。 | Confirmed / Partial |
| Asset availability | Config 内存在显式 path；当前 StarRailRes 有 84 个 128×128 curio PNG，但没有调查到 blessing/formula config 所指的 `Rogue/Buff` 或 `BgPaths*` 文件。不是完整覆盖。 | Confirmed |
| 下一步 | 按规范拆轮：Round 2 Blessing；Round 3 Equation/Resonance；Round 4 Curio/Weighted/Hex；Round 5 mode/pool/assets；最后综合报告。 | Recommended |

本轮只新增 Markdown 报告，没有修改 domain model、schema、pipeline、UI 或资产管线。

## 1. Scope and Method

### 1.1 完成状态

- **CONFIRMED**：235 个文件名含 `Rogue` 的 ExcelOutput config 已全量枚举并统计；核心 domain 入口、主键候选与第一层关系已定位。
- **PARTIAL**：Blessing、Equation、Resonance、Curio、Weighted Curio 的第一层 cardinality、mode 和 localization/asset 入口已统计。
- **NOT YET INVESTIGATED**：所有 pool 的完整反向归属、每个 mode/season 的可见实体全集、3–5 个/领域的最终 sample trace、全部 effect chain、全部 asset coverage、最终 normalized proposal。

调查使用全库 JSON 统计；TextMap hash 使用 Python arbitrary-precision integer 读取并转成十进制字符串。曾用普通 JavaScript JSON 读取做非 hash 的 ID/count 快速统计，但所有报告中的 TextMap hash 均重新以 lossless 方式核对，避免 IEEE-754 精度丢失。

### 1.2 数据规模

`ExcelOutput` 共 2,185 个 JSON config；其中 235 个文件名包含 `Rogue`，合计 33,302 条顶层 record。

| Family | Files | Top-level records | 初步 ownership |
|---|---:|---:|---|
| `Rogue*` base/common | 63 | 16,590 | Base SU、共享 presentation/effect、通用 room/event |
| `RogueDLC*` | 32 | 2,038 | 寰宇蝗灾 DLC 基础与共享 DLC 层 |
| `RogueNous*` | 21 | 1,681 | 黄金与机械 |
| `RogueMagic*` | 32 | 3,380 | 不可知域 |
| `RogueTourn*` | 64 | 8,408 | 差分宇宙（Tourn1/2/3） |
| `RoguePersona*` | 11 | 711 | 新/部分混淆的 Persona Rogue family；语义未深挖 |
| `RogueEndless*` | 2 | 40 | Endless variant |
| `ActivityRogue*` | 3 | 44 | Rogue activity area/banner |
| `RogueActivity*` | 1 | 5 | 常驻玩法 taxonomy |
| 其它含 Rogue 名称 | 6 | 405 | guide/finish/schedule/reward/constant |

完整逐文件 inventory 见 [00-config-inventory-appendix.md](./00-config-inventory-appendix.md)。该表中的 `Partial` 表示只确认结构信号，不能把“Likely role”当作最终 domain 语义。

### 1.3 被 Rogue 显式引用或展示链需要的非 Rogue config

| Config | Count | Evidence |
|---|---:|---|
| `ExtraEffectConfig.json` | 310 | `RogueBuff.ExtraEffectIDList`、`RogueTournHex.ExtraEffect` 等值可命中 `ExtraEffectID`；如 `60000001`、`60000002`、`61000500`。Confirmed。 |
| `BattleEventSkillConfig.json` | 322 | 含 9 条“命途回响”与至少 12 条“临界方程”技能名及 icon/SP 数据；与 Rogue 战斗效果有关，但与 Formula 的直接外键仍 unresolved。 |
| `BattleEventConfig.json` | 486 | BattleEvent presentation/config；本轮未完成 Rogue 子集 ownership。Partial。 |
| `BattleEventData.json` | 446 | `BattleEventID → SkillIDList`；本轮未确认 `RogueAeon.BattleEventBuffGroup` 指向它，实际值不命中 `BattleEventID`，该假设已拒绝。 |
| `MazeBuff.json` | 2,000+（通用表，非 RogueMazeBuff） | 当前 HSR-Database 已解析终局玩法 MazeBuff；不是本轮 Rogue blessing 的目标表。不要混淆。 |
| `TextMapCHS.json` | 全局 map | Rogue name/description hash 的唯一中文来源。Confirmed。 |

## 2. Core Config Inventory

| Config | Count | Canonical/composite key | Important relations | Presentation/type/mode | Role | Confidence |
|---|---:|---|---|---|---|---|
| `RogueBuff.json` | 484 | `(MazeBuffID, MazeBuffLevel)`；484/484 unique | `MazeBuffID+Level`, `RogueBuffType`, `RogueBuffTag`, `ExtraEffectIDList`, `ActivityModuleID`, `AeonID` | `RogueBuffCategory`, `IsShow`, `RogueVersion`, `BattleEventBuffType` | SU/DLC blessing/resonance selection record | Confirmed |
| `RogueTournBuff.json` | 900 | `(MazeBuffID, MazeBuffLevel)`；900/900 unique | 同上；`UnlockDisplay` | `RogueBuffCategory`, `IsInHandbook` | DU blessing selection record | Confirmed |
| `RogueMazeBuff.json` | 1,851 | `(ID, Lv)`；1,851/1,851 unique | battle binding key/type | `BuffName/Desc/SimpleDesc`, `ParamList`, `BuffIcon`, `BuffRarity`, `LvMax` | shared Rogue presentation/effect table | Confirmed |
| `RogueBuffType.json` | 10 | `RogueBuffType` | reward quest lists | Path name/title/icon | SU path taxonomy | Confirmed |
| `RogueTournBuffType.json` | 10 | `RogueBuffType` | — | Path name/title/deco/icon variants | DU path taxonomy | Confirmed |
| `RogueBuffGroup.json` | 546 | obfuscated group field `GMLOGNJAIGI` | tag list `HECJCAMDGNO` | — | SU/DLC selection/resonance groups | Strongly Supported |
| `RogueTournBuffGroup.json` | 456 | `RogueBuffGroupID` | `RogueBuffDrop[] → RogueBuffTag` | optional `TournMode` | DU blessing pools | Confirmed |
| `RogueTournFormula.json` | 328 | `FormulaID` | required buff types/counts, `MazeBuffID`, `FormulaDisplayID` | `FormulaCategory`, `TournMode`, `IsInHandbook` | DU equation identity | Confirmed |
| `RogueTournFormulaDisplay.json` | 324 | `FormulaDisplayID` | `HandbookUnlockDisplayID` | story/extra effect | equation presentation supplement | Confirmed |
| `RogueAeon.json` | 9 | `AeonID` | `RogueBuffType`, base/enhance buff groups, display | `RogueVersion` | SU path resonance owner | Confirmed |
| `RogueDLCAeon.json` | 8 | `AeonID` / `AeonDiceID` | base/enhance groups, display, unlock | effect texts/params | DLC resonance owner | Confirmed |
| `RogueNousAeon.json` | 9 | `AeonID` | base/enhance groups, display | effect text/params | Nous resonance owner | Confirmed |
| `RogueMiracle.json` | 250 | `MiracleID` | display/effect-display/handbook IDs | no own text/icon | Base/SU curio runtime identity | Confirmed |
| `RogueMiracleDisplay.json` | 314 | `MiracleDisplayID` | — | name/background/icon/figure | shared curio presentation | Confirmed |
| `RogueMiracleEffect.json` | 1,038 | `MiracleEffectID` | — | desc/dynamic hint/params | curio runtime effect presentation | Confirmed |
| `RogueMiracleEffectDisplay.json` | 769 | `MiracleEffectDisplayID` | extra effects | desc/simple desc/desc params | curio handbook/display effect | Confirmed |
| `RogueTournMiracle.json` | 699 | `MiracleID` | display/effect/handbook IDs | `TournMode`, optional `MiracleCategory` | DU curio/weighted-curio identity | Confirmed |
| `RogueTournHexAvatarBaseType.json` | 57 | `MiracleID` | exact 1:1 sidecar to uncategorized Tourn miracles | `AvatarType[]`, `AvatarDamageType[]` | weighted-curio applicability | Confirmed |
| `RogueTournHex.json` | 26 | `HexID` | `MazeBuffID`, `DisplayID`, `ExtraEffect` | `TournMode=Tourn3`, avatar conditions | Tourn3 separate special-curio family | Confirmed structure / Strongly Supported semantics |
| `RogueTournHexDisplay.json` | 34 | `HexDisplayID` | — | name/background/icon/figure | Hex presentation | Confirmed |
| `RogueActivityResidentConfig.json` | 5 | `ActivityID` | optional `ActivityModuleID`, unlock | `SubMode`, localized names/descs | high-level mode taxonomy | Confirmed |
| `RogueDLCEntrance.json` | 3 | `ID` | — | `SubType` + title + art paths | SU DLC taxonomy | Confirmed |
| `RogueTournModule.json` | 9 | `(MainTournID, SubTournID)` | `ActivityModuleID` | — | DU module/season mapping | Confirmed |

## 3. Blessing / Buff — Round 1 Findings

### 3.1 Ownership separation

```text
SU / DLC selection identity
RogueBuff.(MazeBuffID, MazeBuffLevel)
   ├─ RogueBuffType ───────→ RogueBuffType.RogueBuffType (Path taxonomy)
   ├─ RogueBuffTag ────────→ RogueBuffGroup.HECJCAMDGNO[] (pool/group membership)
   ├─ ExtraEffectIDList[] ─→ ExtraEffectConfig.ExtraEffectID
   └─ (MazeBuffID, Level) ─→ RogueMazeBuff.(ID, Lv)
                                  ├─ BuffName/BuffDesc ─→ TextMapCHS
                                  ├─ ParamList ─────────→ #N[i/f1/f2]
                                  ├─ BuffIcon ──────────→ upstream asset path
                                  └─ InBattleBindingKey → combat implementation boundary

DU selection identity
RogueTournBuff.(MazeBuffID, MazeBuffLevel)
   ├─ RogueBuffType ───────→ RogueTournBuffType.RogueBuffType
   ├─ RogueBuffTag ────────→ RogueTournBuffGroup.RogueBuffDrop[]
   └─ (MazeBuffID, Level) ─→ RogueMazeBuff.(ID, Lv)
```

`presentation identity` 是 `RogueMazeBuff.(ID,Lv)`；`selection/category identity` 是 mode-specific Buff row；`battle identity` 目前停在 `InBattleBindingType/Key`，不能把 modifier/ability 运行时强行归到 normalized blessing。

### 3.2 Cardinality

| Metric | `RogueBuff` | `RogueTournBuff` |
|---|---:|---:|
| records | 484 | 900 |
| unique `(MazeBuffID, Level)` | 484 | 900 |
| unique `MazeBuffID` | 241 | 450 |
| 1 record per MazeBuffID | 70 | 0 |
| >1 record per MazeBuffID | 171 | 450 |
| level 1 | 241 | 450 |
| level 2 | 171 | 450 |
| levels 3–10 | 72（9 IDs × 8 extra levels） | 0 |
| exact `(ID,Lv)` missing in `RogueMazeBuff` | 90 | 0 |
| base ↔ Tourn shared MazeBuffID | 0 | 0 |

`RogueMazeBuff` 本身有 1,851 rows、1,219 distinct IDs、1,851 unique `(ID,Lv)`。本轮核心 owner sets（visible base blessing、DU blessing、formula、Hex、TitanBless、Keyword）之间 **没有共享 MazeBuffID**；因此虽然物理表共享，effect identity 在这些 domain 间仍按 ID 分区。

90 个未命中的 base rows 恰好来自 9 个 ID（`600000`, `620001`–`620008`）各 10 level；均无 `IsShow`，其中 80 条没有 `RogueBuffCategory`。它们应视为 internal/scaffolding，不能进入可见祝福目录；最终语义留到 Round 2。

### 3.3 Visible and special records

- `RogueBuff.IsShow=true`：394 rows / 232 MazeBuff IDs。
- 其中 70 rows 有 `BattleEventBuffType`（9 base resonance、27 enhance、34 cross），不是普通 selectable blessing 的同构记录。
- `RogueBuffCategory` distribution：`Common=154`, `Rare=126`, `Legendary=124`, absent=80。
- `RogueTournBuffCategory`：`Common=400`, `Rare=350`, `Legendary=150`，全部 `IsInHandbook=true`。
- Round 1 不把这些 enum 直接映射为 UI 星级；base `Legendary` 中包含命途回响 record，证明 category 不是“普通祝福星级”的充分条件。

### 3.4 Upgrade relation is explicit by level

普通强化祝福通常同一 `MazeBuffID` 有 `Lv=1/2` 两行，Buff row 也有相同 ID 的 `MazeBuffLevel=1/2`。名称和 icon 可相同，但 hash、description hash 与 ParamList 可变化。

样例 `MazeBuffID=612140`（记忆，`RogueBuffCategory=Rare`）：

| Lv | Name hash | Desc hash | ParamList | Localized name |
|---:|---|---|---|---|
| 1 | `9264074071365766736` | `9089563931370705331` | `[1.5]` | 极端体验：怅然若失 |
| 2 | `10573614874163744836` | `1281845221708635511` | `[2]` | 极端体验：怅然若失 |

两行 `ModifierName` 与 `InBattleBindingKey` 都保持 `ADV_StageAbility_612140` / `StageAbility_612140`；强化发生在同一 effect identity 的 level 上，不是用同名或相邻 ID 猜测出的 variant。

## 4. Equation and Critical Equation — Round 1 Findings

### 4.1 Canonical identity and structured requirement

`RogueTournFormula.FormulaID` 是 equation identity。328 条全部有结构化 requirement：

```text
MainBuffTypeID + MainBuffNum
[SubBuffTypeID + SubBuffNum]
```

303 条普通方程是双命途 requirement；25 条 `PathEcho` 是单命途 requirement，`MainBuffNum=16`，没有 sub path。无需也不应从中文 description 解析激活条件。

| FormulaCategory | Count | Initial interpretation |
|---|---:|---|
| `Rare` | 133 | ordinary lower-tier equation |
| `Epic` | 104 | ordinary middle-tier equation |
| `Legendary` | 66 | ordinary high-tier equation |
| `PathEcho` | 25 | critical/path-echo special formula |

Mode distribution：4 条无 `TournMode`、`Tourn1=108`、`Tourn2=112`、`Tourn3=104`。4 条无 mode 的 rows 与有 mode rows共享 `MazeBuffID`/`FormulaDisplayID`，是 legacy/duplicate edge cases，不可按 328 个效果页面直接计数。

### 4.2 Formula cardinality

- 328 unique `FormulaID`。
- 324 unique `MazeBuffID`，全部命中 `RogueMazeBuff.ID`。
- 324 unique `FormulaDisplayID`，全部命中 `RogueTournFormulaDisplay`。
- 4 组额外 Formula row 复用既有 MazeBuff/Display：`675680`, `673690`, `670140`, `672160` 各被两条 Formula 引用。
- Formula effect 与 blessing/Hex/Titan/Keyword 的 MazeBuff ID sets 没有交集。

示例 `FormulaID=100001`：`126×3 + 128×2 → MazeBuffID=675680 → 诸神诡辩家`；描述的 `#1[i]`, `#2[i]%` 由 `ParamList=[1, 2.4]` 提供。

### 4.3 Critical equation boundary

`FormulaCategory=PathEcho` 是最强结构证据：Tourn1/2/3 分别 9/8/8 条，均单 Path、16 blessings。例如 `FormulaID=150100`：

```text
MainBuffTypeID=120
MainBuffNum=16
SubBuffTypeID absent
FormulaCategory=PathEcho
MazeBuffID=615020
localized MazeBuff name=筑城者
description=...与命途「存护」产生临界回响...
```

`BattleEventSkillConfig` 同时存在 `SkillID=4110101` 等“临界方程：「存护」”技能，以及 `4100101` 等“命途回响：「存护」”技能。当前只确认它们共享 path/icon/SP presentation；没有在 Formula row 找到 `SkillID` 外键。因此：

- “`PathEcho` 就是玩家页面的临界方程 identity”：**Strongly Supported**；
- “Formula 直接引用 BattleEventSkill”：**Unresolved**；
- “命途回响与临界方程是同一 raw entity”：**Rejected**。

## 5. Path Resonance — Round 1 Findings

SU 命途回响由 Aeon family ownership：

```text
RogueAeon.AeonID=1 (存护)
   ├─ RogueBuffType=120
   ├─ BattleEventBuffGroup=12004
   │    └─ RogueBuffGroup.GMLOGNJAIGI=12004
   │         └─ HECJCAMDGNO=[1202001]
   │              └─ RogueBuff.RogueBuffTag=1202001
   │                   └─ MazeBuffID=612020, Lv=1
   │                        └─ BuffName=命途回响：「存护」
   └─ BattleEventEnhanceBuffGroup=12005
        └─ tags [1202101,1202201,1202301] (resonance formations/enhancements)
```

字段名 `BattleEventBuffGroup` 容易误导：值 `12004` 不命中 `BattleEventData.BattleEventID`，实际命中 `RogueBuffGroup` 的 group field。Round 1 明确拒绝“它直接 FK 到 BattleEventData”的假设。

数据层上 SU resonance 有独立 Aeon owner、path relation、base group 与 enhance group，足以支持未来作为独立 entity 候选；是否建站点 entity 要等 Round 3 完成全部 9 Path、DLC/Nous override、formation 和 effect chain。

## 6. Curio / Weighted Curio / Hex — Round 1 Findings

### 6.1 Base and DU identities

```text
Base/SU
RogueMiracle.MiracleID
   ├─ MiracleDisplayID ───────→ RogueMiracleDisplay
   ├─ MiracleEffectDisplayID ─→ RogueMiracleEffectDisplay
   └─ UnlockHandbookMiracleID → handbook identity

DU
RogueTournMiracle.MiracleID
   ├─ TournMode
   ├─ optional MiracleCategory
   ├─ MiracleDisplayID ───────→ RogueMiracleDisplay (all 699 rows)
   ├─ MiracleEffectID ────────→ RogueMiracleEffect (all 699 rows)
   └─ HandbookMiracleID ──────→ RogueTournHandbookMiracle
```

Base `RogueMiracle` 有 250 unique IDs；11 条 `2001,2002,2004–2012` 缺 display/effect-display，是 data-quality/internal edge case。其余关系会在 Round 4 做完整 1:N/shared-display 统计。

DU `RogueTournMiracle` 有 699 unique IDs：`Tourn1=167`, `Tourn2=272`, `Tourn3=260`；category distribution 为 `Common=196`, `Rare=273`, `Legendary=68`, `Negative=105`, absent=57`。

### 6.2 Weighted Curio is a sidecar classification

57 条 category absent 的 Tourn miracle 与 57 条 `RogueTournHexAvatarBaseType` 存在精确集合相等：

| Metric | Value |
|---|---:|
| uncategorized Tourn miracles | 57 |
| unique uncategorized MiracleID | 57 |
| sidecar rows / unique MiracleID | 57 / 57 |
| entity missing sidecar | 0 |
| sidecar missing entity | 0 |
| Tourn1 / Tourn2 / Tourn3 | 23 / 34 / 0 |

sidecar 的 `AvatarType[]` 与 `AvatarDamageType[]` 给出角色命途/伤害属性适用条件。例如 `MiracleID=6501`（营养过剩）要求 `AvatarType=[Priest]`；`6508`（喧哗上等）要求 `AvatarDamageType=[Fire]`。

本轮没有发现普通 `MiracleID ↔ weighted MiracleID` 外键。共享 artwork/name 或相似名称不能用来建立 variant relation。

### 6.3 Tourn3 Hex is separate

`RogueTournHex` 26 rows：

- 26 unique `HexID`；
- 全部 `TournMode=Tourn3`；
- 26 unique `MazeBuffID`，全部命中 `RogueMazeBuff`；
- 26 unique `DisplayID`，命中 `RogueTournHexDisplay.HexDisplayID`；
- 自带 `AvatarType[]` / `AvatarDamageType[]`；
- 与 57 个 weighted `MiracleID` 的 ID 集合交集为 0。

Tourn3 活动说明把收集项从“加权奇物”改称“惊世奇迹”，且 Hex sample（十光年不晚、静谧的歌声、拟赤月等）拥有独立展示与 MazeBuff。语义映射为 **Strongly Supported**，仍需 Round 4 用 handbook/pool/selection config 闭环确认。

## 7. Mode Taxonomy

### 7.1 High-level config taxonomy

`RogueCommonModeTitle` 与 `RogueActivityResidentConfig` 明确给出：

| SubMode | Chinese title | Config ownership |
|---|---|---|
| `CosmosRogue` | 模拟宇宙 | base/common Rogue |
| `ChessRogue` | 寰宇蝗灾 | `RogueDLC*` |
| `ChessRogueNous` | 黄金与机械 | `RogueNous*` + shared DLC |
| `MagicRogue` | 不可知域 | `RogueMagic*` |
| `TournRogue` | 差分宇宙 | `RogueTourn*` |

`RogueDLCEntrance` 进一步确认 `ID=1/2/3` 分别为 `ChessRogue`、`ChessRogueNous`、`MagicRogue`。

### 7.2 DU revisions

`RogueTournModule` 有 9 个 `(MainTournID,SubTournID) → ActivityModuleID` 映射。Domain records 主要使用 `TournMode=Tourn1/Tourn2/Tourn3`，而不是直接保存 Main/SubTournID：

- Tourn1：初始差分宇宙 family；
- Tourn2：后续 DU revision；
- Tourn3：`RogueActivityResidentConfig.ActivityModuleID=6002401`，localized title “差分宇宙·乐园漫记”。

Round 1 只确认结构，不把 `MainTournID` 自动解释成游戏版本号或 release version。

### 7.3 SU vs DU entity sharing

| Product concept | SU / DLC | DU | Sharing result |
|---|---|---|---|
| Blessing | `RogueBuff` | `RogueTournBuff` | separate selection identities; shared low-level table, zero shared MazeBuff IDs |
| Equation | none in base family | `RogueTournFormula` | DU-only confirmed |
| Resonance | `RogueAeon`/DLC/Nous + buff groups | `FormulaCategory=PathEcho` critical system | different raw family |
| Curio | `RogueMiracle` | `RogueTournMiracle` | separate runtime IDs; DU reuses base display/effect tables |
| Weighted Curio | none located | uncategorized TournMiracle + sidecar | DU Tourn1/2-only confirmed |
| Tourn3 Hex | none | `RogueTournHex` | DU Tourn3-only |

## 8. Pool / Group Findings

Confirmed pool examples：

- `RogueBuffGroup`: obfuscated group ID + explicit RogueBuffTag list；Aeon resonance uses it。
- `RogueTournBuffGroup`: 456 groups、2,047 tag refs、1,101 unique referenced tags。900 entity tags全部至少被一个 group 引用；有 201 dangling refs（可能特殊/legacy tags），200 entity tags跨多个 `TournMode` group。
- `RogueMiracleGroup`: `RogueMiracleGroupID → MiracleWeight{MiracleID: weight}`，明确是 weighted selection pool，不是 Curio entity。
- `RogueTournMiracleGroup`: 288 rows；当前导出仅稳定暴露 `RogueMiracleGroupID`，pool contents 尚未解析。
- `RogueTournFormulaRandom`: 139 rows；当前导出仅稳定暴露 `RandomID`，selection contents 尚未解析。

不要把带 name 的 group/pool 自动视为页面 entity。

## 9. Localization and Dynamic Text

### 9.1 Hash ownership

- Blessing/Formula name/description hashes在 `RogueMazeBuff.BuffName/BuffDesc/BuffSimpleDesc/BuffDescBattle`。
- Curio identity表通常不持有文字；name/background在 `RogueMiracleDisplay`，effect text 在 `RogueMiracleEffect` 或 `RogueMiracleEffectDisplay`。
- Formula supplement story hash 在 `RogueTournFormulaDisplay.FormulaStory`。
- Path labels分别在 `RogueBuffType` / `RogueTournBuffType`。

### 9.2 Markup audit

对核心 Rogue display/effect fields 共读取 7,714 个 localized text reference（3,916 unique texts）：

| Feature | Text count containing feature |
|---|---:|
| indexed placeholder `#N[...]` | 3,139 |
| symbolic placeholder `#{...}` | 81 |
| `<color>` | 2,343 |
| `<unbreak>` | 3,249 |
| `<u>` | 1,445 |
| `<i>` | 9 |
| escaped newline | 135 |

indexed format occurrences：`i=5,548`, `f1=133`, `f2=10`。

当前 HSR-Database 可复用：

- `scripts/data/localization.ts`：十进制字符串 hash resolver、diagnostics；
- `scripts/data/maze-buffs.ts`：MazeBuff Lv=1 解析、TextMap、ParamList、markup interpolation；
- `scripts/data/text.ts`：`#N[i/fN]` 与百分比格式；
- `src/lib/domain/game-text.ts` / `GameText.svelte`：color/i/u/unbreak/icon；
- `scripts/data/decimal.ts`：decimal string 运算。

Gap：`#{miracle:...}`、`#{room_comp_type:...}` 等 symbolic token 不由当前 numeric placeholder interpolation 解决；Rogue round-trip 需要另做调查，不能直接断言现有 GameText 已完全足够。

## 10. Visual Asset Audit — Round 1

`StarRailRes` 是 AGPL-3.0 资源仓库；本轮只读，没有复制资产。

| Domain | Config paths | StarRailRes finding | Coverage |
|---|---|---|---|
| Base blessing | 83 unique non-empty `BuffIcon` paths；90 rows无可解析 MazeBuff/icon | 未发现 basename 匹配 `IconRogue*` / `BgPaths*` | 0/83 unique paths |
| DU blessing | 42 unique `BuffIcon` paths | 未发现匹配 | 0/42 |
| Formula | 9 `BgPaths*` path-art basenames | 未发现匹配 | 0/9 |
| Curio | 254 unique `MiracleIconPath` values | `StarRailRes/icon/curio` 有 84 PNG | 84 direct basename candidates；全目录 basename 搜索会产生角色等误命中，不能使用 |
| Hex | 34 display icon paths | 12 basenames出现在当前 curio subset | partial |

`StarRailRes/icon/curio` 的 84 files 全部为 PNG、128×128，命名如 `1001.png`。这与上游 `SpriteOutput/Rogue/MiracleIcon/1001.png` 可按 basename 显式转换，但当前 StarRailRes 不是完整 Rogue asset source，不能据此建立完整 pipeline。

## 11. Existing HSR-Database Infrastructure

### Potentially reusable

- lossless TextMap resolver and decimal-string types；
- `createMazeBuffResolver` 的 ID/Lv/display/param diagnostics 设计；
- `formatGameMarkup` + `GameText` rich text renderer；
- `PATH_SOURCE_NAMES` 已包含 Warrior/Rogue/Mage/Shaman/Warlock/Knight/Priest/Memory/Elation 映射；
- visual asset manifest、missing asset diagnostics、path icon sync patterns；
- provenance/diagnostic conventions from endgame pipeline。

### Not already implemented

没有找到 Rogue blessing/formula/curio parser、normalized domain model、route 或 UI。现有 `MazeBuff` parser针对全局 `MazeBuff.json` 的 endgame use cases，不应未经适配直接替代 `RogueMazeBuff` 的 `(ID,Lv)` 与增强状态语义。

## 12. Relation Table

| Source | Field | Target | Cardinality observed | Confidence | Notes |
|---|---|---|---|---|---|
| RogueBuff | `(MazeBuffID,MazeBuffLevel)` | RogueMazeBuff `(ID,Lv)` | 394 visible exact; 90 internal rows missing | Confirmed | composite key required |
| RogueTournBuff | `(MazeBuffID,MazeBuffLevel)` | RogueMazeBuff `(ID,Lv)` | 900/900 exact | Confirmed | 450 IDs × 2 levels |
| RogueBuff | `RogueBuffType` | RogueBuffType | 484 rows use 10 types | Confirmed | includes type 100 internal/default |
| RogueTournBuff | `RogueBuffType` | RogueTournBuffType | 900 rows use 10 types | Confirmed | types 120–129 |
| RogueAeon | `BattleEventBuffGroup` | RogueBuffGroup `GMLOGNJAIGI` | 9/9 sampled structurally | Confirmed | not BattleEventData |
| RogueBuffGroup | `HECJCAMDGNO[]` | RogueBuff `RogueBuffTag` | group-to-many | Confirmed | obfuscated field names preserved |
| RogueTournBuffGroup | `RogueBuffDrop[]` | RogueTournBuff `RogueBuffTag` | 2,047 refs / 1,101 tags | Confirmed | 201 dangling refs need audit |
| RogueTournFormula | `Main/SubBuffTypeID` | RogueTournBuffType | 328 structured requirements | Confirmed | 303 dual + 25 single |
| RogueTournFormula | `MazeBuffID` | RogueMazeBuff `ID` | 328 rows / 324 targets | Confirmed | 4 duplicated target pairs |
| RogueTournFormula | `FormulaDisplayID` | FormulaDisplay | 328 rows / 324 targets | Confirmed | no missing |
| RogueMiracle | `MiracleDisplayID` | RogueMiracleDisplay | 239 complete + 11 incomplete | Confirmed | display can be shared |
| RogueMiracle | `MiracleEffectDisplayID` | MiracleEffectDisplay | 239 complete + 11 incomplete | Confirmed | effect display can vary |
| RogueTournMiracle | `MiracleDisplayID` | RogueMiracleDisplay | 699/699 | Confirmed | dedicated Tourn display table not used by these rows |
| RogueTournMiracle | `MiracleEffectID` | RogueMiracleEffect | 699/699 | Confirmed | runtime effect text/params |
| uncategorized TournMiracle | `MiracleID` | HexAvatarBaseType `MiracleID` | 57 ↔ 57 exact 1:1 | Confirmed | weighted curio applicability |
| RogueTournHex | `MazeBuffID` | RogueMazeBuff `ID` | 26/26 | Confirmed | Tourn3 only |
| RogueTournHex | `DisplayID` | HexDisplay `HexDisplayID` | 26/26 | Confirmed | 34 display rows total |
| core Rogue entities | `ExtraEffect*` | ExtraEffectConfig | representative IDs resolve | Partial | full cardinality Round 2–4 |
| Formula PathEcho | runtime binding | BattleEventSkillConfig | no direct FK found | Unresolved | do not infer by icon/name |

## 13. Data Quality and Edge Cases

- Empty/test configs：`RogueMiracleDisplayTest`, `RogueMiracleEffectTest`, `RogueMagicMiracleDisplay`, `RogueTournMiracleGroupTest`, `RogueTournMiracleTest` 均 0 rows。
- 90 个 base Buff scaffold rows 不命中 RogueMazeBuff，且不可见。
- 11 个 base Miracle rows缺 display/effect-display。
- Formula 有 4 个 mode-less legacy/duplicate rows共享现有 display/effect。
- `RogueTournBuffGroup` 有 201 个不命中当前 TournBuffTag 的引用；可能是特殊 blessing/tag 或跨 revision residue，需 Round 2 追踪。
- 核心 localization audit 发现 30 个 `RogueMazeBuff.BuffName` 与 30 个 `BuffDesc` hash 在当前 TextMapCHS 缺失；需判断是否 internal/obsolete。
- `RogueMiracleEffectDisplay` 大量 hash 不能直接命中当前 TextMapCHS，可能涉及 symbolic/hash-generation scheme；Round 4 必须先解决，不得按“无描述”过滤。
- `RoguePersona*` 多个字段名仍混淆，不能仅凭 family name解释为当前玩家概念。
- visibility fields不是全家族统一：`IsShow`, `IsInHandbook`, handbook membership, category absence 和 pool membership都可能参与可见性。

## 14. Rejected Initial Assumptions

1. **Rejected：`RogueBuff` 单独就是完整祝福。** 展示/effect/level 在 `RogueMazeBuff`，DU 另有 `RogueTournBuff`。
2. **Rejected：`RogueMazeBuff` 就是强化祝福表。** 它同时承载 base blessing、DU blessing、formula、Hex 等多种 owner 的分级效果记录。
3. **Rejected：SU 与 DU 共享同一 blessing identity。** 两个 selection families 独立，当前 MazeBuff ID 交集为 0。
4. **Rejected：命途回响是普通 Equation subtype。** SU 由 Aeon + buff groups ownership；DU critical system才在 Formula `PathEcho` 中。
5. **Rejected：`RogueAeon.BattleEventBuffGroup` 直接指向 `BattleEventData.BattleEventID`。** 值不命中 BattleEventData，而命中 RogueBuffGroup。
6. **Rejected：加权奇物只是普通 Curio 的 category enum。** 其 category 反而缺失，分类/角色条件来自 1:1 sidecar。
7. **Rejected：`RogueTournHex` 就是所有加权奇物。** 传统 weighted set 是 Tourn1/2 MiracleID；Hex 是 Tourn3 独立 HexID family。
8. **Rejected：同名/同 icon 可以建立 normal ↔ weighted variant。** 没有 explicit FK，不能建立关系。

## 15. Recommended Investigation Plan

数据量和结构分裂程度要求继续拆轮；现在进入 normalized-model design 风险过高。

1. **Round 2 — Blessings**：全量解析 base/Tourn Buff、group/pool、Aeon/cross/formation、level/enhancement、mode availability、ExtraEffect 与 3–5 sample traces。
2. **Round 3 — Equations and Resonance**：Formula categories/mode revisions、PathEcho ↔ BattleEvent effect chain、SU/DLC/Nous resonance branches、critical equation presentation。
3. **Round 4 — Curios**：Base/Tourn/Magic Miracle ownership、effect/display hash scheme、weighted sidecar、normal↔weighted relation rejection audit、Tourn3 Hex/handbook/pool closure。
4. **Round 5 — Modes, pools, assets**：所有 ActivityModule/Tourn/submode relation、season/pool membership、StarRailRes coverage与尺寸/重复统计。
5. **Final synthesis**：3–5 samples/domain、最终 cardinality、dependency/domain diagrams、remaining unknowns、proposal-only normalized model。

在上述工作完成前，数据 readiness 为：Blessing **Partial-High**、Equation **Partial-High**、SU Resonance **Partial**、Curio **Partial**、Weighted Curio **Partial-High**、Assets **Low**。
