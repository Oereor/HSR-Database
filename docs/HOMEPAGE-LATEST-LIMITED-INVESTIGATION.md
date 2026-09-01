# Homepage Latest Limited Investigation

本调查仅分析本地配置关系，不修改 production code。调查基线：

- `TurnBasedGameData`: `014e33e2404f8cd668bf06fc2ea6db53b6bc3992`
- `HSR-Database`: `8726fe3f6db86694a06b33c6a48b9c40258e5b30`
- `StarRailRes`: `d226befe3db13f2ec15f4161d5f34b1b607643fe`（本次未使用）
- 文本来源：`TextMap/TextMapCHS.json`

证据等级：

- **A — Explicit / Strong**：config 明确引用实体 ID，且类型/文本明确表示限定跃迁。
- **B — Strong Structural Inference**：config 未直写「限定」二字，但 pool type + content relation + 常驻池排除可以稳定判断。
- **C — Controlled Heuristic**：当前数据上成立的 ID 经验规律，无 config 保证。
- **D — Weak / Do Not Use**：名称匹配、图片关系、人工 hardcode 等。

---

## 1. Executive Summary

**结论先行：**

1. **能否可靠判断限定五星角色？—— 能（A 级证据）。**
   `ExcelOutput/GachaBasicInfo.json` 保存了自 1.0 起完整的历史跃迁配置（`AvatarUp` 类型 138 条，`GachaID` 2001–2138 无缺口）。每条 banner 的 `PrefabPath`（如 `AvatarGacha_1512.prefab`）机械地内嵌了当期五星实体 ID。`GachaCeiling.json` 的 `Normal.CeilingItemList` 明确列出全部 7 名常驻五星，与 `AvatarUp` 出现集合完全不相交。`TypeTitle` 文本明确区分「角色活动跃迁」/「光锥活动跃迁」/「常驻跃迁」/「新手跃迁」/「Fate[UBW]联动跃迁」。

2. **能否可靠判断限定五星光锥？—— 能（A 级证据）。**
   `WeaponUp` 类型 138 条（`GachaID` 3001–3138 无缺口），同样通过 `LightConeGacha_XXXXX.prefab` 内嵌光锥 ID。71 张五星光锥被完美划分为 53 限定（WeaponUp）+ 7 常驻 + 4 联动 + 7 黑塔商店（24xxx），四类互不相交，无一例外。

3. **能否确定推出先后顺序？—— 能，但注意证据形态（B 级证据）。**
   `StartTime`/`EndTime` 在本地 dump 中全部为空（286/286 条），**没有任何 gacha 相关的时间戳配置**。但 `GachaID` 是严格递增、无缺口、只增不删的序列，复刻以新 `GachaID` 追加。用「每个实体取最早出现的 `GachaID` 作为 debut」得到的新角色序列与已知真实版本史（1.0 希儿 → … → 4.5 知更鸟·晴歌/砂金·戏浪）完全一致，且 `GachaGroupData.json` 的版本标签图标（250/300/…/440）随 `GachaID` 单调递增。因此 **debut 顺序 = min(GachaID) 升序** 可靠，但排序依据是"追加序列"而非"真实时间"。

4. **推荐方案：Algorithm A（explicit banner config）。**
   不需要 ID heuristic fallback。复刻历史完整（47/53 限定角色有复刻记录），debut 推导可行，当前 dump 直接给出正确答案：角色 1513、1512、1510；光锥 23064、23063、23060。

5. **不应把 `isLimited` 提升为共享 domain field**，应作为 homepage-only selection strategy，在 build-time 从 gacha config 派生。

---

## 2. Scope

- 本次只调查：**最新限定五星 Character / Light Cone**（截至当前数据库版本，最近**首次推出**的实体，而非当前正在 UP 的实体）。
- 不实现 Homepage；不修改 production code；不新增 homepage selection logic；不重构数据 pipeline。
- 主要证据源：`TurnBasedGameData/`（ExcelOutput + Config + TextMap）。
- 参考了 `HSR-Database/` 现有 loader / 生成管线以确认集成边界（只读）。

---

## 3. Relevant Config Files

| File | Relevant Fields | Purpose |
|---|---|---|
| `ExcelOutput/GachaBasicInfo.json` | `GachaID`, `GachaType`, `SortID`, `StartTime`/`EndTime`(全空), `PrefabPath`(内嵌实体 ID), `PoolName.Hash`, `TypeTitle.Hash` | 全部 286 条跃迁池配置：`Normal`(1001)、`Newbie`(4001)、`AvatarUp`(2001–2138)、`WeaponUp`(3001–3138)、`CollaborationAvatarUp`(5001–5004)、`CollaborationWeaponUp`(6001–6004)。核心 relation 文件 |
| `ExcelOutput/GachaCeiling.json` | `GachaType`, `CeilingType`, `CeilingNum`, `CeilingItemList` | `Normal` 池 300 抽自选列表 = 7 名常驻五星角色 ID。常驻集合的明确来源 |
| `ExcelOutput/GachaTypeBasicInfo.json` | `GachaTypeID`, `UpPropability`, `ItemCosume` | 跃迁类型枚举及 UP 概率：`Normal`/`Newbie`/`AvatarUp`/`WeaponUp`/`CollaborationAvatarUp`/`CollaborationWeaponUp` |
| `ExcelOutput/GachaGroupData.json` | `GroupID`, `GachaIDList`, `GroupType`(`MultiAvatarUp`/`MultiWeaponUp`/`CollaborationMerge`), 图标路径(250/300/…/440 版本标签) | 2.5 起的复刻池组、联动合并池；图标编号锚定版本 |
| `ExcelOutput/GachaShowToastData.json` | `GachaID`, `ShowVideoID`, `LoopBGMState` | 抽卡演出配置；交叉验证 GachaID↔角色（如 2067→Castorice） |
| `ExcelOutput/AvatarConfig.json` | `AvatarID`, `AvatarName.Hash`, `Rarity`, `Release` | 角色主配置（93 条） |
| `ExcelOutput/AvatarConfigLD.json` | 同上 | 仅含 4 名联动角色（1014/1015/1508/1509），被站点管线 merge 进角色目录 |
| `ExcelOutput/EquipmentConfig.json` | `EquipmentID`, `EquipmentName.Hash`, `Rarity` | 光锥配置（含全部 71 张五星光锥） |
| `TextMap/TextMapCHS.json` | hash → 文本 | `PoolName`/`TypeTitle`/实体名解析 |
| `ExcelOutput/GachaNews.json` / `GachaPoolReward.json` | `NewsID`, `AvatarList` / `GachaID`, `ActivityID`, `QuestID` | 公告与赠礼活动（2 条 / 1 条），与分类无关 |
| `ExcelOutput/PlayerReturnRecommendConfig.json` / `GrowthTargetTimeLimitTop.json` | `GachaID`(引用) | 回流推荐 / 成长目标，只是引用 GachaID，无时间/内容数据 |
| `ExcelOutput/AvatarComefrom.json` | `ComefromID`, `GotoID` | 所有角色统一 `ComefromID=99`，**无法**用于区分限定/常驻 |
| `ExcelOutput/ItemComefrom.json` | — | 仅物品，**不含**光锥条目 |
| `ExcelOutput/ActivityBannerComMission.json` | `BannerID`, `AvatarIDList` | 同行任务 banner（如 1209 彦卿），与跃迁无关（易混淆文件名） |
| `ScheduleData*.json` | `BeginTime`/`EndTime` | 活动面板/任务/全局日程；**不存在** ScheduleDataGacha，无跃迁日程 |
| `Config/GachaCutsceneConfig.json` | 时间轴参数 | 抽卡过场动画配置，非 banner 数据 |

反向搜索结论：`1513`、`1512`、`23063`、`23064` 在 ExcelOutput 中除 `AvatarConfig`/`EquipmentConfig` 与上述 gacha 家族文件外，**没有任何其他 config 引用**；不存在隐藏在 Activity/Schedule 里的第二条 banner relation。

---

## 4. Character Evidence

### 4.1 Relation chain（真实字段）

```text
ExcelOutput/GachaBasicInfo.json
  GachaID = 2135
  GachaType = "AvatarUp"                      ← 限定角色跃迁类型
  PrefabPath = "UI/Drawcard/GachaPanelLimited/AvatarGacha_1512.prefab"
  PoolLabelIcon = ".../GachaTabIconLimited/TabIcon_1512.png"   ← 同记录第二个字段交叉印证
  TypeTitle.Hash → TextMapCHS → "角色活动跃迁"
      ↓ (PrefabPath 内嵌 AvatarID = 1512)
ExcelOutput/AvatarConfig.json
  AvatarID = 1512
  Rarity = "CombatPowerAvatarRarityType5"
  AvatarName.Hash → TextMapCHS → "知更鸟•晴歌"
```

对 138 条 `AvatarUp` 逐条解析 `PrefabPath`：**100% 覆盖**，且每条内嵌 ID 都命中一张存在、且 Rarity 为五星的角色卡。无 4 星、无缺失、无越界 ID。

### 4.2 限定判定

- 出现于任意 `AvatarUp` banner 的角色 = 限定：**53 名**（互不相同）。
- `GachaCeiling.json` → `GachaType="Normal"` → `CeilingItemList = [1003 姬子, 1004 瓦尔特, 1101 布洛妮娅, 1104 杰帕德, 1107 克拉拉, 1209 彦卿, 1211 白露]` = 7 名常驻五星。该 7 名在 `AvatarUp` 中**出现 0 次**，与限定集合完全不相交。
- `Newbie`（4001）为独立类型，不含任何单独 UP 实体。
- `CollaborationAvatarUp`（5001–5004）为独立类型：1014 Saber、1015 Archer、1508 远坂凛、1509 吉尔伽美什。这些 ID 只存在于 `AvatarConfigLD.json`（主表 `AvatarConfig.json` 中没有），且**从未**出现在 `AvatarUp`。

### 4.3 样例验证

| 样例 | 结果 |
|---|---|
| **1512 知更鸟•晴歌** | `AvatarUp` 仅 1 次：GachaID 2135 → 限定，debut = 2135。`PoolName` = "晴音和鸣" |
| **1513 砂金•戏浪** | `AvatarUp` 仅 1 次：GachaID 2137 → 限定，debut = 2137。`PoolName` = "激浪跃金" |
| 更早限定：1102 希儿 | 出现 3 次：[2001, 2003, 2013]，debut = 2001（1.0 首池，已知史实） |
| 更早限定：1005 卡芙卡 | 出现 4 次：[2008, 2020, 2044, 2085]，debut = 2008（1.2，已知史实） |
| 常驻：1003 姬子 / 1101 布洛妮娅 | 在 `CeilingItemList` 中；`AvatarUp` 出现 0 次 → 正确判为常驻 |
| Trailblazer：8001–8010 | Rarity 五星、`Release=true`，但**任何** banner 类型中出现 0 次；显示名 `{NICKNAME}`。正确排除 |
| 联动：1508 远坂凛 | 仅 `CollaborationAvatarUp`(5003)；不在 `AvatarUp` → 正确排除 |

### 4.4 完整性核对

站点管线的五星角色全集（`AvatarConfig` + `AvatarConfigLD` 合并，74 名）= 53 限定 + 7 常驻 + 4 联动 + 10 开拓者(8xxx)。**四类互不相交、并集恰好等于全集，无一名未归类角色。** 该精确划分同时证明：历史 banner 没有丢失（若丢失，会出现"有五星卡但从未进过任何池"的孤儿）。

---

## 5. Light Cone Evidence

### 5.1 Relation chain（真实字段）

```text
ExcelOutput/GachaBasicInfo.json
  GachaID = 3135
  GachaType = "WeaponUp"                      ← 限定光锥跃迁类型
  PrefabPath = "UI/Drawcard/GachaPanelLimited/LightConeGacha_23063.prefab"
  TypeTitle.Hash → TextMapCHS → "光锥活动跃迁"
      ↓ (PrefabPath 内嵌 EquipmentID = 23063)
ExcelOutput/EquipmentConfig.json
  EquipmentID = 23063
  Rarity = "CombatPowerLightconeRarity5"
  EquipmentName.Hash → TextMapCHS → "你将起身歌唱"
```

138 条 `WeaponUp` 同样 100% 覆盖、全部命中五星光锥。

### 5.2 限定判定

- 出现于任意 `WeaponUp` = 限定：**53 张**。
- 常驻五星：23xxx 中从未进 `WeaponUp` 且非联动的 7 张 = [23000 银河铁道之夜, 23002 无可取代的东西, 23003 但战斗还未结束, 23004 以世界之名, 23005 制胜的瞬间, 23012 如泥酣眠, 23013 时节不居]（与游戏内常驻七光锥一致）。
- 黑塔商店：24000–24006 共 **7** 张（24005 记忆永不落幕、24006 欢愉满溢祝福 等），`WeaponUp` 出现 0 次。
- 联动：23045/23046/23061/23062 仅出现在 `CollaborationWeaponUp`（6001–6004），`WeaponUp` 出现 0 次。

### 5.3 样例验证

| 样例 | 结果 |
|---|---|
| **23063 你将起身歌唱** | `WeaponUp` 仅 1 次：3135 → 限定，debut = 3135（与 1512 同版本） |
| **23064 向浪花掷下盛夏** | `WeaponUp` 仅 1 次：3137 → 限定，debut = 3137（与 1513 同版本） |
| 更早限定：23001 于夜色中 | debut = 3001（1.0 首池） |
| 更早限定：23027 驶向第二次生命 | debut = 3031（知更鸟专武，2.2） |
| 常驻：23000 银河铁道之夜 | `WeaponUp` 出现 0 次 → 常驻 |
| 黑塔商店：24000 记一位星神的陨落 | 24xxx、`WeaponUp` 出现 0 次 → 正确排除 |
| 联动：23062 所见即我 | 仅 `CollaborationWeaponUp`(6004) → 正确排除 |

71 张五星光锥 = 53 限定 + 7 常驻 + 4 联动 + 7 商店，**精确划分，无一例外**。限定光锥与限定角色总数相等（53=53），且每个新角色版本对应 1 张新光锥 debut（1.0–3.2 已知史实全部吻合）。

---

## 6. Banner / Schedule Model

### 6.1 数据结构（真实字段名，无虚构字段）

```text
ExcelOutput/GachaBasicInfo.json          — 286 条，历史全量累积，只增不删
  ├─ GachaID        数值主键，严格递增、无缺口：
  │                 1001 Normal | 4001 Newbie | 2001–2138 AvatarUp |
  │                 3001–3138 WeaponUp | 5001–5004 CollaborationAvatarUp |
  │                 6001–6004 CollaborationWeaponUp
  ├─ GachaType      跃迁类型（见上）
  ├─ SortID         当期跃迁界面 tab 顺序（按版本/阶段重置，1.x 部分版本有异常值；
  │                 不跨版本单调，不能用于全局排序）
  ├─ StartTime/EndTime   全部为空字符串（286/286）→ dump 无真实时间
  ├─ PrefabPath     "…/GachaPanelLimited/AvatarGacha_1512.prefab"
  │                 / "…/GachaPanelLimited/LightConeGacha_23063.prefab"  ← 实体链接
  ├─ PoolName.Hash  → TextMap（例：2135 "晴音和鸣"；WeaponUp 统一 "流光定影"、
  │                 复刻池 "溯回忆象"、复刻单项 "真意之汇•<光锥名>"）
  └─ TypeTitle.Hash → TextMap（"角色活动跃迁" / "光锥活动跃迁" / "常驻跃迁" /
                     "新手跃迁" / "Fate[UBW]联动跃迁"）

ExcelOutput/GachaCeiling.json            — 常驻池井
  └─ GachaType="Normal" → CeilingItemList = [1003, 1004, 1101, 1104, 1107, 1209, 1211]

ExcelOutput/GachaGroupData.json          — 复刻池组 / 版本锚点
  └─ GroupID → GachaIDList + GroupType(MultiAvatarUp/MultiWeaponUp/CollaborationMerge)
     图标名内嵌版本号：TabIcon_MultiAvatar_250_1 / 300_1 / 320_1 / 340_1 / 370_1 /
     400_1 / 420_1 / 440_1 / 440_2、TabIcon_0450（联动合并，指向 4.5）

（不存在）ScheduleDataGacha / ActivityGacha / BannerActivity*
```

### 6.2 Join chain

```text
GachaBasicInfo.GachaType ∈ {AvatarUp, WeaponUp}
  ↓ 限定池过滤
PrefabPath 正则 (Avatar|LightCone)Gacha_(\d+) → 实体 ID
  ↓ join
AvatarConfig.AvatarID / EquipmentConfig.EquipmentID
  ↓ 常驻排除（交叉验证，实际不相交）
GachaCeiling.Normal.CeilingItemList
  ↓ 时间排序
debut(entity) = min(GachaID over 该实体的全部 banner)
```

### 6.3 时间证据

- `GachaBasicInfo.StartTime/EndTime`：286/286 为空。**不存在任何跃迁时间戳。**
- `ScheduleDataActivityPanel`（183 条，时间止于 2024-12）与 gacha 无关联；`ScheduleDataGlobal`（7 条，时间到 2026-09-28）疑似版本窗口，但无任何字段链接 GachaID，不能用于 banner。
- 唯一可靠的"时间"代理是 `GachaID` 的追加顺序（见第 7 节验证）。

---

## 7. Rerun vs Debut

### 7.1 历史完整性

- `AvatarUp`：2001–2138 连续 138 条；`WeaponUp`：3001–3138 连续 138 条。**无缺口 = 覆盖 1.0 至今全部版本。**
- dump 为全量快照，**不会覆盖旧 config**（286 条全部保留）。
- **包含复刻**：53 名限定角色中 47 名出现 ≥2 次（分布：1 次 ×12、2 次 ×36、3 次 ×42、4 次 ×14、5 次 ×2，角色与光锥合计 106 个实体）。同一实体复刻时分配**新 GachaID**，例如：
  - 希儿 1102：2001(首) → 2003(1.4 复刻) → 2013(1.4 下半复刻)
  - 卡芙卡 1005：2008(首) → 2020 → 2044 → 2085
  - 黄泉 1308：2025(首) → 2049 → 2070
- **未来 banner**：dump 中最新的 `AvatarUp` 为 2138、`WeaponUp` 为 3138，即当前版本（4.5 前半，`SortID` 2–5 / 6–9）。不存在更靠后的未开放 banner 条目（联动合并池图标 0450 亦指向 4.5）。

### 7.2 debut 推导可行性：可行

```
限定实体
  ↓ 收集该实体的全部 AvatarUp / WeaponUp GachaID
debut = min(GachaID)     ← 首次出现
  ↓ 按 debut 升序
最新 3 个 = debut 最大的 3 个
```

### 7.3 GachaID 递增 = 时间递增 的验证

1. **已知史实锚点**：由 min-GachaID 推出的 debut 序列与真实版本史完全一致——2001 希儿(1.0) → 2002 景元(1.0) → 2005 银狼(1.1) → 2006 罗刹(1.1) → 2007 刃(1.2) → 2008 卡芙卡(1.2) → 2009 丹恒•饮月(1.3) → 2010 符玄(1.3) → 2011 镜流(1.4) → 2012 托帕&账账(1.4) → 2014 藿藿(1.5) → … → 2041 飞霄(2.5) → 2045 灵砂(2.5) → 2047 乱破(2.6) → 2051 星期日(2.7) → 2053 忘归人(2.7) → 2055 大黑塔(3.0) → 2059 阿格莱雅(3.0) → 2063 缇宝(3.1) → 2065 万敌(3.1) → 2067 遐蝶(3.2) → 2071 那刻夏(3.2) → 2073 风堇(3.2) → 2075 赛飞儿(3.3) → 2077 白厄(3.3) → 2084 海瑟音(3.5) → 2086 刻律德菈(3.5) → 2088 长夜月(3.6) → 2090 丹恒•腾荒(3.6) → 2092 昔涟(3.7) → 2099 大丽花(3.8) → 2105 爻光(4.0) → 2109 火花(4.0) → 2113 不死途(4.1) → 2116 银狼LV.<unbreak>999</unbreak>(4.1) → 2120 绯英(4.2) → 2124 千冶•刃(4.2) → 2128 姬子•启行(4.4) → **2135 知更鸟•晴歌(4.5) → 2137 砂金•戏浪(4.5)**。
2. **复刻交叉验证**：所有复刻的 GachaID 均大于其 debut（47/47 无一反例）。
3. **版本锚点**：`GachaGroupData` 图标版本号 250→300→320→340→370→400→420→440 与组内 GachaID 单调同步。
4. **光锥侧**：debut 序列（3001 于夜色中 → … → 3135 你将起身歌唱 → 3137 向浪花掷下盛夏）与角色版本对齐，1.0–3.2 的已知配对全部正确。

### 7.4 rerun 是否干扰"最新"？

不干扰。按 min(GachaID) 取 debut 后，旧角色复刻（如 2136 风堇复刻、2138 不死途复刻）不会进入"最新"序列。当前 dump 的最终答案：

| 种类 | 最新 3 个（按 debut 降序） | debut GachaID |
|---|---|---|
| 角色 | 1513 砂金•戏浪, 1512 知更鸟•晴歌, 1510 姬子•启行 | 2137, 2135, 2128 |
| 光锥 | 23064 向浪花掷下盛夏, 23063 你将起身歌唱, 23060 当一颗星照亮夜空 | 3137, 3135, 3128 |

---

## 8. Validation Table

| Entity | ID | Rarity | Expected | Config Result | Evidence |
|---|---:|---:|---|---|---|
| 知更鸟•晴歌 | 1512 | 5 | 限定(最新) | 限定, debut 2135 | A：AvatarUp×1, PrefabPath=AvatarGacha_1512, TypeTitle=角色活动跃迁 |
| 砂金•戏浪 | 1513 | 5 | 限定(最新) | 限定, debut 2137 | A：AvatarUp×1, PrefabPath=AvatarGacha_1513 |
| 希儿 | 1102 | 5 | 限定(1.0) | 限定, debut 2001 | A：AvatarUp×3 [2001,2003,2013] |
| 卡芙卡 | 1005 | 5 | 限定(1.2) | 限定, debut 2008 | A：AvatarUp×4 |
| 知更鸟 | 1309 | 5 | 限定(2.2) | 限定, debut 2029 | A：AvatarUp 复刻 2042 |
| 布洛妮娅 | 1101 | 5 | 常驻 | 常驻 | A：GachaCeiling.Normal.CeilingItemList 命中; AvatarUp×0 |
| 姬子 | 1003 | 5 | 常驻 | 常驻 | A：同上 |
| 开拓者(记忆) | 8001 | 5 | 主角变体，非限定 | 未进任何池 | A：所有 banner 类型出现 0 次 |
| 远坂凛 | 1508 | 5 | 联动 | 联动 | A：仅 CollaborationAvatarUp(5003)；AvatarUp×0 |
| 银狼LV.999 | 1506 | 5 | 特殊变体 | 限定, debut 2116 | A：AvatarUp×1（是否计入首页属产品决策，见 §13） |
| 你将起身歌唱 | 23063 | 5 | 限定(最新) | 限定, debut 3135 | A：WeaponUp×1, PrefabPath=LightConeGacha_23063, TypeTitle=光锥活动跃迁 |
| 向浪花掷下盛夏 | 23064 | 5 | 限定(最新) | 限定, debut 3137 | A：WeaponUp×1 |
| 于夜色中 | 23001 | 5 | 限定(1.0) | 限定, debut 3001 | A：WeaponUp 复刻 3003 |
| 驶向第二次生命 | 23027 | 5 | 限定(2.2) | 限定, debut 3031 | A：WeaponUp 复刻 3115 |
| 银河铁道之夜 | 23000 | 5 | 常驻 | 常驻 | B：23xxx 五星但 WeaponUp×0 且非联动 |
| 记一位星神的陨落 | 24000 | 5 | 黑塔商店 | 商店 | A：24xxx, WeaponUp×0 |
| 没有回报的加冕 | 23045 | 5 | 联动 | 联动 | A：仅 CollaborationWeaponUp(6001) |
| 勿忘她的火焰 | 23050 | 5 | 限定(3.2) | 限定, debut 3099 | A：WeaponUp×2 [3099,3117]（注意：其 ID 小于 23051/23052 但 debut 更晚，是 ID 排序的反例） |

---

## 9. ID Pattern Evaluation

### Character：1xxx vs 8xxx

- **当前成立**：五星 1xxx 恰好 = 53 限定 + 7 常驻；8xxx = 10 个开拓者变体。`1xxx 五星 + 排除 8xxx + ID 降序` 今天取前 3 恰好得到 1513/1512/1510，与 banner 推导一致。
- **Counterexample / 隐患**：
  1. **ID 顺序 ≠ debut 顺序**：1321 大丽花 ID 小于 1401/1410 等 14xx 角色，但 debut(2099, 3.8) 晚于它们。当前新角色 ID 已到 15xx，此反例不会进入前 3，但说明排序无保证；
  2. 该模式**无法自行区分常驻**（1003/1004/1101/1104/1107/1209/1211 也是 1xxx 五星），需要额外排除名单；
  3. 无任何 config 字段保证 ID 命名空间分配规则（未来出现 16xx 常驻/新免费角色即失效）。
- **评级：C（Controlled Heuristic）**。仅可作 presentation fallback；有 A 级方案时不使用。

### Light Cone：23xxx vs 24xxx

- **当前成立**：24xxx = 7 张黑塔商店五星；23xxx 五星 = 53 限定 + 7 常驻 + 4 联动。
- **Counterexample（已在当前数据中存在）**：
  1. **联动污染**：23062 所见即我、23061 均为 23xxx 五星，纯 `23xxx + ID 降序` 的第 3、4 名就是它们——纯 ID 方案在**当前数据上立即出错**；
  2. **常驻污染**：23000–23013 也是 23xxx，需额外排除；
  3. **ID 顺序 ≠ debut 顺序**：23050 勿忘她的火焰（debut 3099，3.2）晚于 23051（3090）与 23052（3092）——ID 更小反而更晚推出。
- **评级：C**，且比角色侧更不可靠（已有真实反例）。即使作 fallback 也必须叠加"排除 24xxx + 排除常驻 + 排除联动"的名单，退化成本与手工维护相当，不建议。

### 共同结论

ID 模式是**经验规律**：当前 dump 上"大致成立"，但既不能证明 limited，也不能保证 debut 排序；光锥侧已有可复现反例。适合 fallback，不适合作为 domain property 或正式 relation。

---

## 10. Candidate Algorithms

### Algorithm A — Explicit config（首选）

```text
输入: ExcelOutput/GachaBasicInfo.json, GachaCeiling.json,
      AvatarConfig(.json/.jsonLD), EquipmentConfig.json

avatarLimited = {}
for row in GachaBasicInfo where GachaType == "AvatarUp":
    id = regex(AvatarGacha_(\d+), row.PrefabPath)     # 138/138 全覆盖
    avatarLimited[id].append(row.GachaID)              # 记录全部出现（含复刻）

debutCharacter(id) = min(avatarLimited[id])            # GachaID 递增 = 时间递增
latestCharacters = top(3, avatarLimited, by=-debut)

# 光锥同构: GachaType == "WeaponUp", regex(LightConeGacha_(\d+), row.PrefabPath)
# 交叉验证(可选): GachaCeiling.Normal.CeilingItemList ∩ avatarLimited == ∅
```

- 维护成本：无（随 dump 自动更新）。
- 正确性：A 级 relation；debut 顺序 B 级（追加序列，无时间戳）。
- 风险：依赖 PrefabPath 命名内嵌 ID（当前 100% 覆盖，且 `PoolLabelIcon` 第二字段可交叉验证）；若未来命名变化需适配（可在 build-time 断言覆盖率为 100% 以尽早发现）。

### Algorithm B — Hybrid

explicit classification（A 的分类部分）+ ID/order fallback（C 的排序部分）。

- 只有当"GachaID 序列不可用"（如 dump 出现缺口/重排）时才需要。当前数据 A 已完整覆盖分类与排序，B 没有额外收益。

### Algorithm C — Pure ID heuristic

```text
角色: AvatarConfig.Rarity == 五星 && AvatarID ∈ 1xxx && 排除 8xxx
      → 按 AvatarID 降序取 3
光锥: EquipmentConfig.Rarity == 五星 && EquipmentID ∈ 23xxx
      → 按 EquipmentID 降序取 3
```

- 维护成本：低，但需要手工维护"排除名单"（常驻 7 名、联动 4 张、24xxx）。
- 正确性：当前角色侧碰巧正确；光锥侧**当前即错**（第 3、4 名是联动光锥 23062/23061）。排序无保证（23050、1321 反例）。

### 对比

| 维度 | A | B | C |
|---|---|---|---|
| 维护成本 | 零 | 低 | 低（但含手工排除名单） |
| 分类正确性 | 高（explicit relation） | 高 | 中（依赖排除名单完整性） |
| 排序正确性 | 高（追加序列，史实验证） | 同 A（fallback 时降级） | 低（已有反例） |
| 风险 | 命名格式变化需 build 断言 | 双路径复杂度 | 未来 ID 分配变化即失效 |

---

## 11. Recommendation

> **Recommendation:**
> 使用 explicit gacha banner history 识别限定实体：`GachaBasicInfo.GachaType ∈ {AvatarUp, WeaponUp}` + `PrefabPath` 内嵌实体 ID 确定限定集合，`GachaCeiling.Normal.CeilingItemList` 作为常驻交叉验证；以每个实体最早的 `GachaID`（min）作为 debut，按 debut 降序取最新 3 个。当前 dump 上该方法完整、无例外、给出正确答案（角色 1513/1512/1510；光锥 23064/23063/23060）。
>
> 不需要 ID heuristic fallback（算法 A 已覆盖），不要新增手动 curated list。
>
> 不要把「当前 ID pattern 恰好成立」升级为共享 domain 的 `isLimited` property；`isLimited`/debut 只作为 homepage selection strategy 的派生数据存在（见 §12）。

排序依据为"GachaID 追加序列"而非真实时间戳——这是本方案唯一的 B 级成分，但经 47/47 复刻单调性、版本图标锚点与 1.0–3.2 全量史实锚点交叉验证，风险可控，且 build-time 可以加断言兜底（§13）。

---

## 12. Proposed Integration Boundary

（只描述，不修改代码。）

现状（已确认）：

- build-time：`scripts/data/sync.ts` 从 `ExcelOutput/AvatarConfig(.json/.jsonLD)`、`EquipmentConfig` 等生成 `src/lib/generated/catalogs/{characters,light-cones}.json`（catalog 顺序 = 表内 ID 升序）。
- runtime：`src/routes/+page.server.ts` 的 `featured = characters.filter(rarity===5).slice(-8).reverse()`——**当前实际取到的是 8007–8010 四个开拓者变体 + 1014/1015/1508/1509 四名联动角色**，这正是本次重构要修复的问题。

建议边界：

1. **build-time 派生，不进入 domain model**：
   - 新增 `scripts/data/gacha.ts`（只读 `GachaBasicInfo.json`、`GachaCeiling.json`），输出派生数据集，例如 `src/lib/generated/homepage-latest-limited.json`：
     ```json
     { "characters": ["1513","1512","1510"], "lightCones": ["23064","23063","23060"] }
     ```
     或并入 `manifest.json` 的一个 section。
   - `Character` / `LightCone` 的 domain interface（`src/lib/domain/types.ts`）**不加** `isLimited`/`debutOrder` 字段；`scripts/data/sync.ts` 的现有实体解析不动。
2. **homepage selector 消费派生数据**：
   - `src/routes/+page.server.ts` 的 `featured` 改为读取上述生成数据（经 `$lib/server/generated` 的现有 getter 模式），按 ID join 现有 catalog 条目取展示字段。
3. **可选 build 断言**：gacha 解析时断言（a）`PrefabPath` 覆盖率 = 100%；（b）`GachaCeiling.Normal.CeilingItemList` 与 `AvatarUp` 集合交集为空；（c）`AvatarUp`/`WeaponUp` GachaID 连续无缺口。任一失败即构建失败，避免静默产出错误首页。

无需：serialized `isLimited` field、parser 改动、generated schema 升级、UI 之外的任何 runtime 逻辑。

---

## 13. Open Questions / Risks

1. **无真实时间戳**：`StartTime`/`EndTime` 全空，debut 排序完全依赖 `GachaID` 追加序列。若未来 Mihoyo 重排/回收 GachaID、或 dump 方式改变（如只保留当期 banner），序列会失效。缓解：build-time 断言（§12.3）+ 每次数据更新后人工抽查最新 3 个。
2. **PrefabPath 是"路径字符串解析"**：实体链接不在独立字段中，而是 `AvatarGacha_1512.prefab` 这类命名。当前 138/138 覆盖且与 `PoolLabelIcon`（`TabIcon_1512.png`）双字段一致，但命名规则没有 schema 保证。缓解：覆盖率断言。
3. **「限定」的语义边界（产品决策，非技术阻塞）**：
   - 真理医生（1305）为 1.6 免费赠送但仍有 `AvatarUp` banner（2019）→ 按本方案计入限定；
   - 银狼LV.<unbreak>999</unbreak>（1506）为特殊变体角色，有独立 `AvatarUp`（2116）→ 计入限定；
   - 联动角色（Saber/Archer/远坂凛/吉尔伽美什）在本方案中天然排除（仅 `CollaborationAvatarUp`）——若产品希望计入"最新"，需单独决策；
   - 黑塔商店光锥（24000–24006）天然排除。
4. **4.4/4.5 边界**：2132–2134（`SortID` 14–16）与 2135–2138（`SortID` 2–5）的版本归属无法从本地 dump 唯一确定（无时间戳、4.5 组图标暂缺），但不影响 debut 结论（1512/1513 是最后两个 debut）。
5. **`SortID` 语义**：为当期 UI tab 顺序、按版本重置且 1.x 有异常值，**不可**用于跨版本排序（已排除在算法外）。
6. **联动角色只在 `AvatarConfigLD.json`**：主表 `AvatarConfig.json` 不含 1014/1015/1508/1509。若未来联动角色并入主表或出现其他池类型，分类逻辑（`AvatarUp` 成员资格）不受影响，但需保持对新 `GachaType` 枚举值的关注（当前枚举仅 6 种）。
7. **未来 dump 可能出现新 GachaType**（如 `AnniversaryAvatarUp`）：build 断言（b）可发现常驻集合被新类型污染，但新类型是否计入"限定"需人工评估。

---

## 附：复现用核心查询（Python）

```python
import json, re
from collections import defaultdict

gacha = json.load(open('ExcelOutput/GachaBasicInfo.json', encoding='utf-8'))
app = defaultdict(list)
for r in gacha:
    m = re.search(r'Gacha_?(\d+)', r['PrefabPath'])
    if r['GachaType'] in ('AvatarUp', 'WeaponUp'):
        app[(r['GachaType'], int(m.group(1)))].append(r['GachaID'])

debut = {k: min(v) for k, v in app.items()}
latest_chars = sorted(((k[1], v) for k, v in debut.items() if k[0] == 'AvatarUp'),
                      key=lambda x: -x[1])[:3]   # [(1513, 2137), (1512, 2135), (1510, 2128)]
latest_lcs   = sorted(((k[1], v) for k, v in debut.items() if k[0] == 'WeaponUp'),
                      key=lambda x: -x[1])[:3]   # [(23064, 3137), (23063, 3135), (23060, 3128)]
```
