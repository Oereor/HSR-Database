# Rogue Investigation Round 2 — Blessings

调查日期：2026-08-27  
数据源：`TurnBasedGameData/ExcelOutput`、`TurnBasedGameData/TextMap/TextMapCHS.json`、`StarRailRes`  
调查性质：只读；本报告不修改上游数据、生产同步、domain type、route、UI 或资产。

证据等级沿用 Round 1：`Confirmed`、`Strongly Supported`、`Partial`、`Unresolved`、`Rejected`。

## 1. Executive Summary

| 问题 | 结论 | 证据等级 |
|---|---|---|
| A. 普通 SU Blessing 的 canonical identity | `RogueBuff.MazeBuffID` 在 `RogueBuff` family 内标识一项祝福；`MazeBuffLevel` 是其等级。normalized ID 应同时保留 source family，例如 `RogueBuff:612050`。 | Confirmed |
| B. 普通 DU Blessing 的 canonical identity | 同理为 `RogueTournBuff.MazeBuffID`，normalized ID 应为 source family + ID，例如 `RogueTournBuff:615030`。 | Confirmed |
| C. SU / DU 是否用同一 normalized entity type | 可以共用 `RogueBlessing` 形状，但必须保留 `sourceFamily`；两者 raw owner、pool 与 mode chain 不同，且 MazeBuff ID 零交集，不能合并成同一实体。 | Strongly Supported |
| D. 如何排除回响族与 scaffold | SU 先要求精确 MazeBuff join；再以 `BattleEventBuffType` 排除 base/enhance/cross 三类。90 条无 Maze target、无 `IsShow` 的 1–10 级记录单列为 scaffold。 | Confirmed |
| E. Common / Rare / Legendary 是否等于 1★ / 2★ / 3★ | 只在 ordinary subset 中为 **Strongly Supported**；配置没有显式 `starCount` 或 enum→星级映射，不得把该对应写成 raw config fact。对回响族全局套用该映射是错误的。 | Strongly Supported / globally Rejected |
| F. Lv1 / Lv2 是否属于同一 Blessing | 是。SU 162/162、DU 450/450 个普通 ID 都恰有 Lv1+Lv2；Path、category、mode/provenance、ExtraEffect 等 selection metadata 成对一致，tag 与 Maze display row 随等级变化。 | Confirmed |
| G. `RogueBuffType` 是否可靠表示 Path | 对 ordinary subset 可靠；SU type config 覆盖 120–128，DU 覆盖 120–129，重叠 120–128 的中文名完全一致。type 100 只出现在 scaffold 默认增益。 | Confirmed |
| H. 最小可靠 visibility | SU：`IsShow=true` + 精确 Maze join + 无 `BattleEventBuffType` + 合法 Path/category。DU：`IsInHandbook=true` + `UnlockDisplay=805` + 精确 Maze join + 合法 Path/category + 可由 DU group DAG 到达。 | Confirmed for current snapshot |
| I. ExtraEffect 是否面向用户 | 是可选展示候选：target 有本地化名称、说明、参数和可选图标，内容是“离神”“反震”等术语解释，不是主效果替代品。 | Confirmed |
| J. 描述与参数能否 normalized | 能。ordinary Blessing 的名称、主说明和简述均 100% 命中 CHS；1,918 个 numeric placeholder token 无越界；普通祝福中无 symbolic placeholder。 | Confirmed |
| K. 缺少哪些资产 | 配置 icon path 全部非空，但 `StarRailRes` 对 42 个 ordinary basename 与 `SpriteOutput/Rogue/Buff` 目录均零命中；本地缺 Blessing icon 实体。 | Confirmed |
| L. 是否达到 normalized schema design 成熟度 | 是。核心 identity、等级、Path、raw rarity、visibility、pool tag、ExtraEffect 与 DU mode 已闭合。星级展示映射及 SU 子模式精细 availability 应保留为显式限制，不阻塞 schema design。 | Strongly Supported |

**最终 ordinary 识别规则：**

```text
SU family
RogueBuff row
├── exact (MazeBuffID, MazeBuffLevel) -> RogueMazeBuff.(ID, Lv)
├── IsShow == true
├── BattleEventBuffType absent
├── RogueBuffType -> RogueBuffType config，且不是 type 100
└── RogueBuffCategory in Common | Rare | Legendary

DU family
RogueTournBuff row
├── exact (MazeBuffID, MazeBuffLevel) -> RogueMazeBuff.(ID, Lv)
├── IsInHandbook == true
├── UnlockDisplay == 805
├── RogueBuffType -> RogueTournBuffType
├── RogueBuffCategory in Common | Rare | Legendary
└── RogueBuffTag 可由 RogueTournBuffGroup DAG 到达，并归属恰一个 TournMode
```

这不是名称 heuristic。当前快照按上述结构得到 SU 324 rows / 162 IDs，DU 900 rows / 450 IDs。

## 2. Scope and Exclusions

本轮只调查以下 Blessing/Buff 边界：

- `RogueBuff`、`RogueTournBuff` selection metadata；
- `RogueMazeBuff` display/effect layer；
- Path、raw rarity、等级、visibility、group/pool、mode、ExtraEffect、localization、icon；
- 命途回响、回响构音、回响交错以及 scaffold 的排除边界；
- `RogueMagicMazeBuff` 是否误入 ordinary Blessing scope。

以下内容不在本轮实现或深挖范围：

- 方程/临界方程的最终分类与稀有度；
- 奇物、加权奇物、负面奇物的最终分类；
- 战斗 modifier/ability runtime 逆向；
- 资源下载、复制或生产资产管线；
- normalized schema、同步脚本、页面或 UI 实现。

Localized name 仅用于样例展示和同级文本验证，不参与实体关系建立。特别是，不按名称建立 SU↔DU、Tourn1↔Tourn2↔Tourn3 对应关系。

## 3. Blessing Raw Ownership

### 3.1 Selection 与 display/effect 分层

| Source | Field | Target | Cardinality | Confidence | Notes |
|---|---|---|---|---|---|
| `RogueBuff` | `(MazeBuffID, MazeBuffLevel)` | `RogueMazeBuff.(ID, Lv)` | 484 rows 中 394:1；90 missing | Confirmed | 394 包含 324 ordinary + 70 resonance-family |
| `RogueTournBuff` | `(MazeBuffID, MazeBuffLevel)` | `RogueMazeBuff.(ID, Lv)` | 900:900，全部 1:1 | Confirmed | 450 IDs × Lv1/Lv2 |
| `RogueBuff` | `RogueBuffType` | `RogueBuffType.RogueBuffType` | N:1 | Confirmed | ordinary 用 120–128 |
| `RogueTournBuff` | `RogueBuffType` | `RogueTournBuffType.RogueBuffType` | N:1 | Confirmed | ordinary 用 120–129 |
| selection row | `RogueBuffTag` | Buff group direct/recursive member | N:M | Confirmed | tag 是 level-specific selection key，不是用户 ID |
| `RogueAeon` | `BattleEventBuffGroup` | `RogueBuffGroup` | 9:9 | Confirmed | 回响 base owner |
| `RogueAeon` | `BattleEventEnhanceBuffGroup` | `RogueBuffGroup` | 9:9 | Confirmed | 回响构音 owner |
| `RogueDLCAeonCross` / `RogueNousAeonCross` | `BuffGroup` | `RogueBuffGroup` | 16 / 18 refs | Confirmed | 回响交错 owner；Nous 会复用 6 条较早记录 |
| selection row | `ExtraEffectIDList[]` | `ExtraEffectConfig.ExtraEffectID` | 0:N | Confirmed | 本轮所有 Blessing refs 均命中 |
| DU tag | recursive group ancestry 的 `TournMode` | `Tourn1/2/3` | 每 tag 恰 1 mode | Confirmed | Lv1/Lv2 mode 一致 |

`RogueMazeBuff` 提供名称、说明、参数、图标和 combat binding；`RogueBuff` / `RogueTournBuff` 提供 Path、category、visibility、tag、mode/provenance。单独读取任何一层都不足以构造 ordinary Blessing。

### 3.2 Full-library classification

| Source / Classification | Rows | Unique MazeBuff IDs | Visibility | Notes |
|---|---:|---:|---|---|
| `RogueBuff` Ordinary Blessing | 324 | 162 | 324 `IsShow=true` | 全部 Lv1+Lv2、全部 exact join |
| `RogueBuff` Resonance Base | 9 | 9 | 9 `IsShow=true` | `BattleEventBuffType=BattleEventBuff`，全为 Lv1 |
| `RogueBuff` Resonance Enhance | 27 | 27 | 27 `IsShow=true` | `BattleEventBuffEnhance`，每 Path 3 条 |
| `RogueBuff` Cross Resonance | 34 | 34 | 34 `IsShow=true` | `BattleEventBuffCross`，DLC/Nous group owner |
| `RogueBuff` Internal/Scaffold | 90 | 9 | `IsShow` 全缺失 | 全部无 Maze target，9 IDs × Lv1–10 |
| `RogueBuff` Legacy/Obsolete | 0 structurally identified | 0 | — | 无 explicit obsolete field；不把 scaffold 猜成 obsolete |
| `RogueBuff` Unresolved | 0 | 0 | — | 当前分类完整 |
| `RogueTournBuff` Ordinary Blessing | 900 | 450 | 全部 handbook=true / display=805 | 全部 exact join、Lv1+Lv2、group reachable |

DU 没有 SU 的 `BattleEventBuffType` / `AeonID` 特殊结构；当前 900 rows 无需制造 resonance 或 internal 子类。

## 4. Ordinary Blessing Classification

### 4.1 SU / Base

`RogueBuff` ordinary 共 162 IDs，9 条 Path 每条恰 18 IDs：

| 每 Path raw category | IDs | Rows（Lv1+Lv2） |
|---|---:|---:|
| Common | 8 | 16 |
| Rare | 7 | 14 |
| Legendary | 3 | 6 |
| 合计 | 18 | 36 |

七条无 `ActivityModuleID` 的 Path 为 type 120–126，共 126 IDs / 252 rows。这里的“Base”指 row provenance 没有 activity module，不自动断言每一条在所有 SU 子模式中的精确 availability。

### 4.2 DLC / Nous additions

| `ActivityModuleID` | Ordinary Path | IDs | Rows | Category composition |
|---:|---|---:|---:|---|
| 6000302 | type 127「繁育」 | 18 | 36 | 8 Common / 7 Rare / 3 Legendary |
| 6000901 | type 128「智识」 | 18 | 36 | 8 Common / 7 Rare / 3 Legendary |

结构支持将 6000302 视作寰宇蝗灾 addition provenance，将 6000901 视作黄金与机械 addition provenance：

- `RogueDLCAeonCross` 的 16 个 group 全部落到 `ActivityModuleID=6000302` cross rows；
- `RogueNousAeonCross` 的 18 个 group 落到 12 条 `6000901` 与 6 条复用的 `6000302` cross rows；
- resident configs 分别给出 `ChessRogue=寰宇蝗灾`、`ChessRogueNous=黄金与机械`。

因此 `ActivityModuleID` 更像“引入/定义来源”，不是完整 availability：Nous 明确复用了 6 条较早 cross rows。未来模型应把 `introducedByModule` 与 `availableInMode` 分开，不能令两者同义。

### 4.3 DU

DU 的 450 IDs 是三个 `TournMode` revision 的独立 ID 集合，不是 450 项同时出现的单池：

| Mode（由 group DAG 解析） | Rows | IDs | Path composition | Category composition（IDs） |
|---|---:|---:|---|---|
| Tourn1 | 324 | 162 | 120–128，各 18 | 72 Common / 63 Rare / 27 Legendary |
| Tourn2 | 288 | 144 | 121、122、124–129，各 18 | 64 Common / 56 Rare / 24 Legendary |
| Tourn3 | 288 | 144 | 121、122、124–129，各 18 | 64 Common / 56 Rare / 24 Legendary |
| 合计 | 900 | 450 | — | 200 / 175 / 75 |

三个 mode 的 tag 集合互斥；每个 tag 恰归属一个 mode，且 450/450 个 ID 的 Lv1/Lv2 mode 一致。localized name 在 450 IDs 中只有 306 个 unique values，但名称相同不建立 revision relation。

`RogueTournUseBuffType` 有 3 rows：无 `TournMode`、Tourn2、Tourn3，三者都列出 `[121,122,124,125,126,127,128,129]`。它与 Tourn2/Tourn3 group 结果一致；无 mode 的 row 不应擅自解释成 Tourn1，因为 Tourn1 group 实际为 120–128。

## 5. Visibility

### 5.1 Visibility matrix

| Condition | Ordinary SU | Resonance base/enhance | Cross | Internal/Scaffold | DU ordinary |
|---|---|---|---|---|---|
| `IsShow` | 324/324 true | 36/36 true | 34/34 true | 0 present | field absent |
| exact Maze join | 324/324 | 36/36 | 34/34 | 0/90 | 900/900 |
| category | Common/Rare/Legendary | Legendary | Legendary | 10 Common + 80 absent | Common/Rare/Legendary |
| `BattleEventBuffType` | absent | base / enhance | cross | absent | field absent |
| `AeonID` | absent | present | present | absent | field absent |
| explicit group owner | ordinary pool group | `RogueAeon` | DLC/Nous Cross | 8 tags in aggregation group | DU group DAG |
| handbook signal | `HandbookUnlockDesc` 不区分 | 同样存在，不区分 | 同样存在，不区分 | 同样存在，不区分 | 900/900 `IsInHandbook=true` |
| `UnlockDisplay` | field absent | field absent | field absent | field absent | 900/900 = 805 |

### 5.2 Minimum reliable structures

`IsShow=true` 单独使用会误收 70 条回响族，故 **Rejected**。SU ordinary 的最小正向结构是 `IsShow=true`、exact join、无 `BattleEventBuffType`、合法 Path/category。`AeonID` absent 与 group owner 可作为一致性断言，但当前不需要以名称补判。

DU 当前所有 900 rows 都是 handbook-visible ordinary。推荐验证 exact join、handbook/display、Path/category 以及 group DAG reachability；不要仅凭表名或 `UnlockDisplay=805`。

## 6. Path Taxonomy

| Type | SU label | DU label | DU deco | Ordinary ownership |
|---:|---|---|---|---|
| 100 | 默认增益 | — | — | 只见于 scaffold 600000，排除 |
| 120 | 「存护」 | 「存护」 | Preservation | SU / DU Tourn1 |
| 121 | 「记忆」 | 「记忆」 | Remembrance | SU / DU |
| 122 | 「虚无」 | 「虚无」 | Nihility | SU / DU |
| 123 | 「丰饶」 | 「丰饶」 | Abundance | SU / DU Tourn1 |
| 124 | 「巡猎」 | 「巡猎」 | TheHunt | SU / DU |
| 125 | 「毁灭」 | 「毁灭」 | Destruction | SU / DU |
| 126 | 「欢愉」 | 「欢愉」 | Elation | SU / DU |
| 127 | 「繁育」 | 「繁育」 | Propagation | SU module 6000302 / DU |
| 128 | 「智识」 | 「智识」 | Erudition | SU module 6000901 / DU |
| 129 | — | 「同谐」 | Harmony | DU Tourn2/Tourn3 |

重叠 120–128 的 CHS labels 全部一致，且各自有显式 type config。normalized presentation 可以共享 canonical Path value，但必须保留 source type config；label 相同不是 Buff entity relation。

## 7. Rarity

### 7.1 Product-side known presentation

用户提供的产品事实是普通祝福有 1★/2★/3★。这只作为验证目标，不是 raw config authority。

### 7.2 Raw enum analysis

ordinary subset 的 raw rarity 字段是 selection row 上的 `RogueBuffCategory`：

- SU：144 Common / 126 Rare / 54 Legendary rows，即 72 / 63 / 27 IDs；
- DU：400 / 350 / 150 rows，即 200 / 175 / 75 IDs；
- 每个 Path-mode block 都稳定为 8 Common、7 Rare、3 Legendary IDs；
- group 表存在大量按 Path + category + level 同质分组，例如 SU group 12001 为 type 120/Common/Lv1 的 8 tags，12002 为 Rare/Lv1 的 7 tags，12003 为 Legendary/Lv1 的 3 tags。

`RogueMazeBuff.BuffRarity` 不能用作祝福星级：所有 394 条 SU-family joined rows 与全部 900 条 DU rows 都是 `BuffRarity=1`，包括 ordinary 和 resonance-family。该候选为 **Rejected**。

### 7.3 Common / Rare / Legendary mapping

| Raw category | Product presentation hypothesis | Evidence |
|---|---:|---|
| Common | 1★ | Strongly Supported |
| Rare | 2★ | Strongly Supported |
| Legendary | 3★ | Strongly Supported |

支持证据是普通子集的稳定 8/7/3 层级分布、category-specific pool 结构及产品侧星级体系。缺失证据是显式 enum→数字映射字段或 UI config bridge。因此：

1. normalized raw model 应保存 `Common | Rare | Legendary`；
2. `starCount` 若后续提供，应是有证据标注的 presentation derivation，不应改写 raw enum；
3. 映射只适用于 ordinary subset。70 条回响族也全部为 Legendary，但不能因此显示为普通 3★祝福。

### 7.4 Cross-domain rarity ledger

| Domain | Product presentation | Config representation | Evidence / next round |
|---|---|---|---|
| Ordinary Blessing | 1★ / 2★ / 3★ | Common / Rare / Legendary | Strongly Supported；Round 2 |
| Ordinary Equation | 待调查 | unresolved | Round 3 |
| Critical Equation | 4★（用户提供） | unresolved | 只记 ledger；Round 3，不从 PathEcho 推导 |
| Ordinary Curio | 1★ / 2★ / 3★（用户提供） | unresolved | Round 4 |
| Negative Curio | 不纳入 ordinary rarity mapping | unresolved | Round 4 |
| Weighted Curio | 不纳入 ordinary rarity mapping | unresolved | Round 4 |

## 8. Level / Enhancement

### 8.1 Level set

| Family | Ordinary IDs | `{1,2}` | only Lv1 | `>2` | missing join | duplicate pair |
|---|---:|---:|---:|---:|---:|---:|
| SU | 162 | 162 | 0 | 0 | 0 | 0 |
| DU | 450 | 450 | 0 | 0 | 0 | 0 |

70 个 resonance-family IDs 都只有 Lv1；9 个 scaffold IDs 都是 Lv1–10。多级本身不能定义普通祝福。

### 8.2 Lv1/Lv2 pair stability

| Comparison | SU equal pairs / 162 | DU equal pairs / 450 | Meaning |
|---|---:|---:|---|
| Path | 162 | 450 | identity metadata stable |
| category | 162 | 450 | raw rarity stable |
| activity / mode metadata | 162 | 450 | provenance/mode stable |
| ExtraEffect list | 162 | 450 | glossary stable |
| `RogueBuffTag` | 0 equal | 0 equal | tag 是 level-specific |
| localized name | 162 | 450 | 同一 blessing name |
| localized main description | 105 | 386 | 有些 template 不变，另一些明确变化 |
| `ParamList` | 3 | 0 | 增强数值通常变化 |
| icon path | 161 | 449 | level 层必须保留 icon override |
| binding type | 162 | 450 | combat boundary 大体稳定 |

两个 icon exception 都是“子囊释放”：SU 612730 与 DU 615730 的 Lv1 为 `IconRoguePropagation05.png`，Lv2 为 `IconRoguePropagation03.png`。不能只在 entity 顶层保存一个 icon 并无条件覆盖 levels。

**结论：** entity identity 是 `MazeBuffID`，level identity 是 `(MazeBuffID, MazeBuffLevel)`；每个 level 应保留自己的 Maze presentation、参数、icon 和 raw tag。

## 9. Resonance-family Boundary

### 9.1 Full `BattleEventBuffType` enumeration

| Value | Rows / IDs | Explicit owner | Ordinary exclusion |
|---|---:|---|---|
| `BattleEventBuff` | 9 | `RogueAeon.BattleEventBuffGroup` | 命途回响 base |
| `BattleEventBuffEnhance` | 27 | `RogueAeon.BattleEventEnhanceBuffGroup` | 回响构音/强化 |
| `BattleEventBuffCross` | 34 | `RogueDLCAeonCross` / `RogueNousAeonCross` | 回响交错 |

三类共 70 rows，全部：

- Lv1 only；
- `IsShow=true`；
- category=Legendary；
- 有 `AeonID`；
- 有 exact Maze target；
- 其 tag 精确命中一个 special owner group。

这组结构足以无名称 heuristic 地排除回响族。

### 9.2 Owner trace example

```text
RogueAeon.AeonID=1
├── RogueBuffType=120「存护」
├── BattleEventBuffGroup=12004
│   └── RogueBuffGroup[12004] -> tag 1202001
│       └── RogueBuff MazeBuffID=612020, BattleEventBuff
└── BattleEventEnhanceBuffGroup=12005
    └── tags 1202101 / 1202201 / 1202301
        └── 612021 / 612022 / 612023, BattleEventBuffEnhance
```

Cross example：`RogueDLCAeonCross.BuffGroup=12021` → tag 1202401 → 612024「回响交错：披锋效应」；`RogueNousAeonCross.BuffGroup=12023` → tag 1202601 → 612026「回响交错：逆淬火」。

## 10. Buff Groups and Pools

### 10.1 SU family group graph

`RogueBuffGroup` 的 obfuscated fields 为 group ID `GMLOGNJAIGI` 与 member array `HECJCAMDGNO`。数组不是纯 Buff tag：

| Metric | Value |
|---|---:|
| groups | 546 |
| direct refs | 1,569 |
| terminal Buff-tag refs | 674 |
| subgroup-ID refs | 895 |
| unique refs | 748 = 402 tags + 346 group IDs |
| unknown refs | 0 |
| cycles | 0 |
| entity tags unreferenced | 82，全部 scaffold |

ordinary 324 tags 与 resonance-family 70 tags 都至少有 direct group；scaffold 只有 620001–620008 的 Lv1 tags 进入 group 210000，剩余 82 tags 不在 group。

普通 tag 可同时位于多个 direct groups：135 rows 在 1 组、125 在 2 组、45 在 3 组、19 在 4 组。这反映全池、category pool、机制子池等多重 selection membership，不能把 group 当 entity owner。

### 10.2 DU group DAG 与“201 dangling refs”解释

| Metric | Value |
|---|---:|
| groups | 456 |
| direct refs | 2,047 |
| terminal tag refs | 1,433 |
| subgroup refs | 614 |
| unique refs | 1,101 |
| unique Buff tags | 900 |
| unique non-Buff refs | 201 |
| non-Buff refs matching `RogueBuffGroupID` | 201 |
| unresolved refs after tag-or-group typing | 0 |
| Buff tags with no direct group | 0 |
| cycles | 0 |

因此 Round 1 的 “201 dangling refs” 已被 **Rejected**：它们全部是同表 child group IDs。例：parent group 1000010 引用 1000001/2/3；这些 child groups 再分别展开到 Common/Rare/Legendary terminal tags。

对 group DAG 递归展开后，900 个 tag 均可到达 mode-bearing ancestor，且每个 tag 的 distinct `TournMode` 集合大小都为 1。Round 1 的“多个 TournMode group”不应理解为跨 mode ownership；同一 tag 可以进入多个同 mode 的聚合组。

## 11. RogueBuffTag

以下事实验证了 tag 的 selection-key 语义：

- SU 484 rows 有 484 unique tags；DU 900 rows 有 900 unique tags；无 duplicate tag；
- 同一普通 `MazeBuffID` 的 Lv1/Lv2 tag 全部不同；
- 同一 `MazeBuffID` 的 Path、category、ExtraEffect 和 mode/provenance 全部不变；
- group 表以 tag 为 terminal member，并允许一个 tag 进入多个 pool；
- tag 与 group ID 数值空间在两套 group 表中均无交集，可明确解析 terminal 或 subgroup。

结论：

```text
MazeBuffID       -> user-facing Blessing identity within source family
MazeBuffLevel    -> enhancement level
RogueBuffTag     -> level-specific selection/group membership key
RogueBuffGroupID -> nested pool/aggregate identity
```

`RogueBuffTag` 不能作为用户可见 Blessing ID。

## 12. ExtraEffect

### 12.1 Coverage

| Subset | Rows | Rows with ExtraEffect | Refs | Unique effects | Missing target |
|---|---:|---:|---:|---:|---:|
| SU ordinary | 324 | 96 | 96 | 10 | 0 |
| DU ordinary | 900 | 326 | 326 | 22 | 0 |
| Resonance base | 9 | 2 | 2 | 2 | 0 |
| Resonance enhance | 27 | 11 | 13 | 11 | 0 |
| Cross resonance | 34 | 5 | 5 | 3 | 0 |
| Scaffold | 90 | 50 | 50 | 5 | 0 |

普通 Lv1/Lv2 的 `ExtraEffectIDList` 100% 相同，所以 ExtraEffect 可放在 entity 顶层，同时保留 raw level rows 供验证。

### 12.2 Semantics and product value

Blessing 引用的所有 `ExtraEffectConfig` targets 都是 `ExtraEffectType=2`，且 unique effects 的 CHS 名称与描述 100% 解析成功。代表项：

| ID | Name | Role |
|---:|---|---|
| 60000001 | 反震 | 解释由存护祝福造成的附加伤害 |
| 60000002 | 离神 | 解释视为冻结、解除时附加伤害及参数 |
| 60000004 | 会心 | 解释叠层、暴击率/暴伤与清除条件 |
| 60000017 | 孢子 | 解释爆裂、传播与上限 |
| 61000044 | 罐中脑 | 解释启迪充能与再次施放终结技 |
| 61000049 | 执念 | 解释 DU 机制层数与四个参数 |

DU 的 22 unique effects 中 15 有 icon、7 icon 为空；文本仍完整。结论为 **display candidate**：未来 detail 可作为术语表/补充效果卡显示，但不应拼接成主 `BuffDesc`，也不应被当作 combat implementation hint。

## 13. Mode Ownership

### 13.1 SU / DLC / Nous

Raw selection owner 始终是 `RogueBuff`；DLC 与 Nous 没有另一张 ordinary Buff selection 表。应区分三层：

1. `sourceFamily=RogueBuff`：确定 raw owner；
2. `ActivityModuleID`：记录 addition provenance；
3. specific group consumer：记录实际 mode availability，尤其 special rows 会被后续 mode 复用。

`RogueVersion=1` 在 484 rows 中恒定，不能区分模式。普通 Blessing 的 module/path 关系是精确的：无 module=120–126，6000302=127，6000901=128。对 ordinary schema 足以记录 provenance，但若产品将来要求“此祝福可在哪个 SU 子模式抽到”的精细 filter，还需追踪各玩法对 pool group 的消费关系，不能仅用 `ActivityModuleID` 推导。

### 13.2 DU

DU mode 由 `RogueTournBuffGroup.TournMode` 沿 DAG 递归到 terminal tag，证据完整：

- Tourn1：324 tags / 162 IDs；
- Tourn2：288 / 144；
- Tourn3：288 / 144；
- cross-mode terminal tags：0；
- Lv1/Lv2 mode mismatch：0。

DU normalized availability 可安全保存 `tournMode`。不要按名称把不同 mode 的不同 MazeBuff IDs 合并成 revision。

## 14. Localization

### 14.1 Ordinary coverage

| Field | SU resolved | DU resolved | Notes |
|---|---:|---:|---|
| BuffName | 324/324 | 900/900 | 每 pair localized name 相同 |
| BuffDesc | 324/324 | 900/900 | 主 display description |
| BuffSimpleDesc | 324/324 | 900/900 | 可作为 optional summary |
| BuffDescBattle | 288/324 | 0/900 | optional；不得作为主说明必填 |
| ParamList | 324/324 rows | 900/900 rows | 可为空；全部结构可读 |

TextMap hash 必须继续以 decimal string 解析。ordinary Blessing 没有 unresolved hash。

### 14.2 Round 1 的 30 条 missing TextMap rows

`RogueMazeBuff` 全表仍有 30 rows 的 `BuffName` 与 `BuffDesc` hash 无法命中当前 CHS，但全部在 `RogueBuff` / `RogueTournBuff` selection pair 集合之外：

- 25 个是 `RogueTournKeyword.MazeBuffID` 的 keyword helper rows；
- 5 个（619920–619923、617001）没有 Blessing selection owner。

它们不影响 ordinary Blessing，也不能据“无描述”推导 visibility。

## 15. Dynamic Parameters

### 15.1 Numeric placeholders

| Metric | SU ordinary | DU ordinary |
|---|---:|---:|
| descriptions with numeric placeholders | 319/324 | 895/900 |
| placeholder tokens | 498 | 1,420 |
| `%` tokens | 337 | 972 |
| `[i]` tokens | 476 | 1,385 |
| `[f1]` | 18 | 35 |
| `[f2]` | 4 | 0 |
| unmatched/out-of-range rows | 0 | 0 |
| rows with unused params | 86 | 123 |
| symbolic placeholder rows | 0 | 0 |

unused params 不是错误：`ParamList` 同时服务 combat binding，一部分参数未出现在主 display template。normalized pipeline 应验证“所有引用都有参数”，而不是强制“所有参数都被显示引用”。

### 15.2 Existing reusable infrastructure

现有 `scripts/data/localization.ts` 已按 decimal string 读取 `TextMapCHS`；`scripts/data/text.ts` 已支持 `#N[i]`、`#N[fN]`、百分比乘 100 与稳定小数；`GameText` 已支持 `<color>`、`<unbreak>`、`<u>`、`<i>` 与换行。

ordinary descriptions 的 rich-text coverage：SU 319 `<color>` / 319 `<unbreak>` / 96 `<u>`，DU 895 / 896 / 326；没有 `<i>` 或实际 newline。现有 infrastructure 足以承载本轮观测格式，本轮不接入数据。

普通祝福中没有 `#{symbolic:key}`；Blessing pipeline 暂不依赖 symbolic resolver。

## 16. Assets

| Subset | Rows | Unique `BuffIcon` | Empty | Lv pair shared |
|---|---:|---:|---:|---:|
| SU ordinary | 324 | 36 | 0 | 161/162 |
| DU ordinary | 900 | 42 | 0 | 449/450 |
| Resonance-family | 70 | 65 | 0 | N/A（Lv1 only） |

ordinary icon 均在 `SpriteOutput/Rogue/Buff/*.png`，basename 按 Path 呈 `IconRogueKnight*`、`Memory*`、`Warlock*`、`Pirest*`、`Rogue*`、`Warrior*`、`Joy*`、`Propagation*`、`Mage*`，DU 另有 `Harmony*`。

对 `StarRailRes` 的精确 basename 与相似 Rogue directory 定向搜索均为 0。配置路径存在、仓库实体缺失，结论是 asset gap；本轮不下载或建立相似文件映射。

### 16.1 Magic boundary

`RogueMagicMazeBuff` 是独立表：387 rows / 171 IDs。其中 24 IDs 被 `RogueMagicScepter.StaffMazeBuffID` 引用，109 IDs 被 `RogueMagicUnit.MagicUnitMazeBuffID` 引用。剩余 38 个 689xxx IDs 虽无这两类直接 owner，也仍只存在于 Magic display/effect family，没有 `RogueBuff` / `RogueTournBuff` selection row、Path、category 或 Blessing pool tag。

结论：Magic 记录属于不可知域权杖/组件及其内部效果边界，不纳入本轮 ordinary Blessing normalized scope；无需为此深挖 combat semantics。

## 17. Representative Sample Traces

样例中“1★/2★/3★”均是上一节的 Strongly Supported presentation hypothesis；raw category 才是配置事实。

### Sample A — SU Common / proposed 1★ ordinary

```text
source: RogueBuff
selection: MazeBuffID=612050, Lv=1, type=120「存护」, category=Common
visibility: IsShow=true; BattleEventBuffType/AeonID/ActivityModuleID absent
tag / direct groups: 1205001 -> [12000, 12001]
mode ownership: RogueBuff base provenance（不等同于精细 submode availability）
ExtraEffect: []
target: RogueMazeBuff.(612050,1)
name: 构筑 • 聚塑
desc: 每拥有1个「存护」的祝福，角色防御力提高 #1[i]%，最多 #2[i] 层
ParamList: [0.06, 6]
icon: SpriteOutput/Rogue/Buff/IconRogueKnight02.png
battle boundary: StageAbilityBeforeCharacterBorn / StageAbility_612050 / ADV_StageAbility_612050
classification: Ordinary Blessing
evidence: raw classification Confirmed；1★ presentation Strongly Supported
```

### Sample B — SU Rare / proposed 2★ ordinary

```text
source: RogueBuff
selection: 612040, Lv1, type120「存护」, Rare, IsShow=true
special signals: BattleEventBuffType/AeonID absent
tag / groups: 1204001 -> [12000,12002,12006]
mode: base provenance
ExtraEffect: 60000001「反震」
target/name: RogueMazeBuff.(612040,1) / 星间构筑 • 切变结构
desc: 反震伤害提高 #3[i]%，并对相邻目标造成主目标 #1[i]% 的反震伤害
ParamList: [0.25,1,0.1]
icon: SpriteOutput/Rogue/Buff/IconRogueKnight01.png
battle boundary: StageAbilityBeforeCharacterBorn / StageAbility_612040 / ADV_StageAbility_612040
classification/evidence: Ordinary Confirmed；2★ Strongly Supported
```

### Sample C — SU Legendary / proposed 3★ ordinary

```text
source: RogueBuff
selection: 612030, Lv1, type120「存护」, Legendary, IsShow=true
special signals: BattleEventBuffType/AeonID absent
tag / groups: 1203001 -> [12000,12003,12007,12008]
mode: base provenance
ExtraEffect: 60000001「反震」
target/name: RogueMazeBuff.(612030,1) / 神性构筑 • 谐振传递
desc: 攻击后按当前护盾量 #1[i]% 对目标造成反震伤害
ParamList: [1,0]
icon: SpriteOutput/Rogue/Buff/IconRogueKnight01.png
battle boundary: StageAbilityBeforeCharacterBorn / StageAbility_612030 / ADV_StageAbility_612030
classification/evidence: Ordinary Confirmed；3★ Strongly Supported
```

### Sample D — DU ordinary

```text
source: RogueTournBuff
selection: 615030, Lv1, type120「存护」, Legendary
visibility: IsInHandbook=true, UnlockDisplay=805
tag / direct groups: 1503001 -> [1000003,1010003,2020026]
recursive mode ownership: Tourn1 only
ExtraEffect: 60000001「反震」
target/name: RogueMazeBuff.(615030,1) / 神性构筑 • 谐振传递
desc: 攻击后按当前护盾量 #1[i]% 对目标造成反震伤害
ParamList: [1,0]
icon: SpriteOutput/Rogue/Buff/IconRogueKnight01.png
battle boundary: StageAbilityBeforeCharacterBorn / StageAbility_615030 / ADV_StageAbility_615030
classification/evidence: Ordinary Blessing, Confirmed
```

名称与 Sample C 相同，但 source family 和 MazeBuffID 不同；没有 config relation，禁止合并。

### Sample E — enhanced Lv2 of Sample A

```text
source: RogueBuff
selection: MazeBuffID=612050, Lv=2, type120, Common, IsShow=true
tag / group: 1205002 -> [12011]
mode / ExtraEffect: base provenance / []，与 Lv1 一致
target/name: RogueMazeBuff.(612050,2) / 构筑 • 聚塑
desc template: 与 Lv1 localized text 相同
ParamList: [0.08,9]（Lv1 为 [0.06,6]）
icon: SpriteOutput/Rogue/Buff/IconRogueKnight02.png
battle boundary: StageAbilityBeforeCharacterBorn / StageAbility_612050 / ADV_StageAbility_612050
classification: 612050 的 enhanced level，不是新 Blessing
evidence: Confirmed
```

### Sample F — resonance special exclusion

```text
source: RogueBuff
selection: 612020, Lv1, type120, Legendary, IsShow=true, AeonID=1
BattleEventBuffType: BattleEventBuff
tag / group: 1202001 -> [12004]
explicit owner: RogueAeon.AeonID=1.BattleEventBuffGroup=12004
mode provenance: base
ExtraEffect: []
target/name: RogueMazeBuff.(612020,1) / 命途回响：「存护」
desc: 消耗100点能量施放技能，与「存护」发生回响共鸣
ParamList: [2.5,0.5,0,0.15,0.4,0.03,2,0.01]
icon: SpriteOutput/AvatarProfessionTattoo/Profession/BgPathsKnight.png
battle boundary: StageAbilityBeforeCharacterBorn / StageAbility_612020 / ADV_StageAbility_612020
classification: Resonance Base；从 ordinary 排除
evidence: Confirmed
```

### Sample G — internal/scaffold multi-level row

```text
source: RogueBuff
selection: 600000, Lv1（同 ID 还有 Lv2–10）, type100「默认增益」, Common
visibility: IsShow/BattleEventBuffType/AeonID/ActivityModuleID absent
tag / group: 1000001 -> no group
mode / ExtraEffect: none / []
RogueMazeBuff target: missing for every Lv1–10
localized name/desc/ParamList/icon/battle binding: none（没有 target）
classification: Internal/Scaffold；从 ordinary 排除
evidence: Strongly Supported；没有证据把它进一步命名为 obsolete
```

## 18. Data Quality / Edge Cases

### 18.1 Ordinary subsets

| Check | SU | DU |
|---|---:|---:|
| missing Path | 0 | 0 |
| missing category | 0 | 0 |
| missing Maze pair | 0 | 0 |
| missing name / desc / simple desc | 0 | 0 |
| missing icon | 0 | 0 |
| duplicate `(MazeBuffID,Lv)` | 0 | 0 |
| duplicate tag | 0 | 0 |
| ID missing Lv1 | 0 | 0 |
| Lv2 without Lv1 | 0 | 0 |
| ID with >Lv2 | 0 | 0 |
| visible/handbook row without group | 0 | 0 |
| out-of-range numeric placeholder | 0 | 0 |

DU 的 201 refs 已全解析为 subgroup；没有真正 dangling tag。DU 的全部 900 rows `UnlockDisplay=805`，该字段没有内部区分力，但与 handbook/group chain 一致。

### 18.2 Scaffold deep dive

| ID set | Rows | Type/category | Group use | Maze target / visibility | Result |
|---|---:|---|---|---|---|
| 600000 Lv1–10 | 10 | type100 / Common | 0 tags referenced | 0 targets；无 `IsShow` | scaffold |
| 620001–620008，各 Lv1–10 | 80 | type120–127 / category absent | 仅 8 个 Lv1 tags 进入 group 210000；72 不进入 group | 0 targets；无 `IsShow` | scaffold |

这 90 rows 没有 user-facing display identity，不能进入 ordinary model。其 `HandbookUnlockDesc` 与全表共用，不能反向证明 handbook visibility。没有 explicit legacy/obsolete 标志，因此只标 `Internal/Scaffold`，不虚构更细语义。

### 18.3 Level-specific deviations

- SU 18 IDs 的 `InBattleBindingKey` 在 Lv1/Lv2 不同；DU 0。combat binding 不应上移为 entity display metadata。
- `BuffDescBattle` 在 SU ordinary 仅 288/324 存在，在 DU 全缺；主说明必须使用 `BuffDesc`。
- SU description localized text 57/162 pairs 不同，DU 64/450 不同；即使 text 相同，参数也可能不同。
- DU 450 IDs 只有 306 unique localized names；名称重复不构成关系。

## 19. Rejected Hypotheses

| Hypothesis | Result | Reason |
|---|---|---|
| `IsShow=true` 就是 ordinary SU Blessing | Rejected | 会误收 70 条 visible resonance-family rows |
| `RogueMazeBuff.BuffRarity` 是祝福星级 | Rejected | 所有 joined SU/DU rows 均为 1 |
| `Legendary` 在所有 RogueBuff 上都表示普通 3★ | Rejected | 70 条回响族全部 Legendary |
| DU 有 201 个失效/dangling Buff refs | Rejected | 201/201 都是同表 subgroup IDs |
| `RogueBuffTag` 是 Blessing identity | Rejected | Lv1/Lv2 tag 不同且 tag 服务多 pool membership |
| `ActivityModuleID` 等于完整 mode availability | Rejected | Nous cross groups 复用 6 条 module 6000302 rows |
| 同名 SU/DU 或 DU revision 是同一 Blessing | Rejected | 没有 explicit relation；source family 与 MazeBuffID 不同 |
| 无 TextMap 描述即可判隐藏 | Rejected | visibility 有独立结构；30 missing rows 均在 ordinary selection 外 |
| Magic MazeBuff 是普通祝福的另一来源 | Rejected | 独立 Magic owner/字段体系，没有 Blessing selection metadata |

## 20. Blessing Domain Map

```text
RogueBlessing（normalized convenience）
├── sourceFamily: RogueBuff | RogueTournBuff
├── canonical raw identity: MazeBuffID
├── Path
│   └── RogueBuffType -> family-specific BuffType config
├── raw rarity category: Common | Rare | Legendary
├── provenance / availability
│   ├── SU family: ActivityModuleID? + explicit group consumers
│   └── DU: RogueBuffTag -> RogueTournBuffGroup DAG -> TournMode
├── pool keys
│   └── level-specific RogueBuffTag -> group(s)
├── ExtraEffectIDList[] -> ExtraEffectConfig（optional glossary）
└── levels[]
    ├── MazeBuffLevel
    └── (MazeBuffID, MazeBuffLevel) -> RogueMazeBuff.(ID, Lv)
        ├── BuffName -> TextMapCHS
        ├── BuffDesc / BuffSimpleDesc / BuffDescBattle?
        ├── ParamList
        ├── BuffIcon
        └── combat binding（normalization boundary 外）

RogueBuff special boundary
├── BattleEventBuff -> RogueAeon base group
├── BattleEventBuffEnhance -> RogueAeon enhance group
└── BattleEventBuffCross -> DLC/Nous cross group

RogueBuff scaffold boundary
└── no Maze target + no IsShow；600000 / 620001–620008，Lv1–10
```

## 21. Proposal-only Normalized Model

这只是由调查结果导出的设计提案，不是本轮实现：

```ts
interface RogueBlessing {
  id: `${'RogueBuff' | 'RogueTournBuff'}:${number}`;
  sourceFamily: 'RogueBuff' | 'RogueTournBuff';
  mazeBuffId: number;
  path: {
    rawType: number;
    canonicalKey: string;
    name: string;
    icon?: string;
  };
  rarityCategory: 'Common' | 'Rare' | 'Legendary';
  // presentation-only；在 explicit product decision 后派生，不替代 raw enum
  proposedStarCount?: 1 | 2 | 3;
  levels: Array<{
    level: 1 | 2;
    rogueBuffTag: number;
    name: string;
    description: string;
    simpleDescription: string;
    battleDescription?: string;
    params: number[];
    iconPath: string;
  }>;
  extraEffects: Array<{
    id: number;
    name: string;
    description: string;
    params: number[];
    iconPath?: string;
  }>;
  provenance: {
    activityModuleId?: number;
  };
  availability: {
    tournMode?: 'Tourn1' | 'Tourn2' | 'Tourn3';
    rawGroupIds: number[];
  };
}
```

设计分层：

- **raw ownership：** source family、MazeBuffID/Lv、tag、group、module、TournMode；
- **normalized convenience：** composite ID、共用 entity shape、Path canonical key、levels array；
- **presentation convenience：** star count、formatted description、ExtraEffect glossary；
- **boundary：** combat binding 可保留在 audit/raw trace，不进入普通展示模型。

不建议拆成完全独立的 `SuBlessing` / `DuBlessing` types，因为核心 display/level/Path/rarity/ExtraEffect 结构一致；也不建议抹平 source family，因为 pool 与 mode semantics 明显不同。

## 22. Remaining Questions

1. **Star mapping 缺 explicit config bridge。** Common/Rare/Legendary→1/2/3★已 Strongly Supported，但还不是 raw `Confirmed`。schema 可先保存 raw category；后续 presentation mapping 需产品确认或找到 UI-side mapping source。
2. **SU 子模式精细 availability。** `ActivityModuleID` 可确认 addition provenance，不能完整表达复用。若未来需要“仅显示可在寰宇蝗灾/黄金与机械获得的普通祝福”，需继续追踪每个玩法实际消费哪些 aggregate groups。
3. **DU 无 mode 的 `RogueTournUseBuffType` row。** 不能安全命名为 Tourn1；对 group-derived entity mode 无影响，但使用该表做 filter 前需确认 default 语义。
4. **Asset source gap。** config paths 完整，本地资源仓缺实体；实现前需单独决定合法资源来源和 asset pipeline。
5. **38 个未被 scepter/unit 直接引用的 Magic IDs。** 已证明不属于 ordinary Blessing；只有在不可知域自身进入产品 scope 时才需调查 owner。

这些问题不要求 Blessing-focused Round 2B 才能开始 normalized-model design；其中 1、2 必须在实现星级展示或子模式 availability filter 前得到显式处理。

## 23. Recommendation for Round 3

**Round 2B：当前不需要。** Ordinary Blessing 的 canonical identity、classification、raw rarity、level ownership、Path、visibility、DU mode、ExtraEffect 和 localization 已足以评审 normalized schema。

建议下一步进入 Round 3，但拆清两个边界：

1. **Equation 调查：** 独立确认普通/关键方程、PathEcho 与 config rarity；临界方程 4★只保留为产品侧 ledger，不能从本报告推导 raw `rarity=4`。
2. **Resonance 调查：** 若产品要展示命途回响/构音/交错，则基于本报告已确认的 70-row special family 单独建模，不把它们塞回 ordinary Blessing。

在任何实现中，所有 rarity mapping 都必须继续保留 evidence boundary：用户提供的 1★/2★/3★与临界方程 4★是产品侧参考，不能被直接硬编码为 raw config semantics。
