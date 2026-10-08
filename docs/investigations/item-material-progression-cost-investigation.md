# Item Domain 与角色养成成本计算可行性调查

调查日期：2026-10-08（UTC+8）。基于当前锁定数据与网站源码，中文报告。

证据标签：**FACT** = 原始配置或源码直接证明；**DERIVED** = 可复现求和或统计；**INFERENCE** = 有依据但尚未证明的语义；**UNKNOWN** = 缺少证据。费用标签：`Exact from configuration`、`Exact under stated assumptions`、`Partially resolved`、`Unavailable`。这些标签区分静态成本与游戏运行时扣费，不把理论资源组合称为实机结果。

## 1. Executive Summary｜执行结论

**DERIVED：现有数据足以支持以角色等级、晋阶状态及真实技能树节点为输入的材料需求计算器。推荐进入工程实现，MVP 采用范围 A：140 个实际养成资源，包括 134 个成本引用 ID、3 种角色经验道具和 3 种光锥经验道具。140/140 均有原始记录、有效中文名、有效英文名、配置图标路径及本地图标；无需恢复完整 Items 图鉴。**

角色 Lv.1→80 需要 **5,797,920 EXP**，98 个角色形态使用同一经验组，四星与五星经验需求相同。晋阶与技能/行迹有逐阶段、逐节点的离散费用表，可精确求和。晋阶表费用属于当前阶段到下一阶段，技能节点的费用属于到达该节点等级：二者求和区间不同。

关键限制：经验需求不等于投入经验道具总量。角色经验信用点除数常量存在，但舍入、晋阶边界溢出和返还、自动材料选择缺少运行时实现与实机基准。光锥经验道具费用明确，但自动选择和强化后光锥作为素材的返还仍未闭合。不要据此阻止明确的静态晋阶和行迹功能。

| 领域 | 判断 | 费用精度 / 条件 |
| --- | --- | --- |
| Item Domain | GO（仅范围 A） | 元数据与图标闭合；完整 Items 为 CONDITIONAL GO，需另做产品决策 |
| Character Promotion Calculator | GO | Exact from configuration；必须显式输入 promotion |
| Character EXP Calculator | CONDITIONAL GO | Required EXP 为 Exact from configuration；道具组合/实际扣费为 Partially resolved |
| Skill / Trace Calculator | GO | Exact from configuration；以真实节点与 Profile 为单位 |
| Light Cone Calculator | CONDITIONAL GO | 晋阶与 Required EXP 精确；指定原始经验道具组合的费用精确，自动选择/返还待验证 |

nanoka.cc 可读取首页数据；应用脚本请求返回 HTTP 403，已停止该核查路径。本轮没有确认到可复现的 nanoka 成本差异，也没有实机数值。第三方物品展示存在可复现的名称占位差异，详见第 13 节；不能由此推断其成本算法错误。

## 2. Scope and Dataset Baseline｜范围与数据基线

**FACT：**网站仓库为 `HSR-Database`，当前分支 `develop`，调查开始时工作区干净。两份上游均只读、状态干净且 HEAD 与 `upstream.lock.json` 完全一致：

| 数据源 | 锁定 commit / 版本 |
| --- | --- |
| HSR-Database | `ce808e2`（调查时 develop HEAD），`develop` |
| TurnBasedGameData | `724b139d8c9c32d12552eb95745a4fee72bfe48b`；commit 标题 `OSPRODWin4.6.0_D16707949_A16704710_L16700845` |
| StarRailRes | `dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487` |

已阅读 `AGENTS.md`、`docs/refactor-status.md`、`docs/data-audit.md`、规范性架构 `docs/architecture/localization-and-data-generation.md`、`scripts/data/source-requirements.ts`，以及当前 Character、Light Cone、Skill、raw parsing 和 TextResolver 实现。历史文档中的 4.4 版本和实体数量不代表本次基线。

本报告的核心“养成成本”范围是角色升级、晋阶、技能/行迹，以及光锥升级、晋阶。星魂获取与光锥叠影另行说明，不混入 140 个资源统计。Trial、Test、活动小玩法的角色升级表不是正式角色主数据，不能混入公开养成模型。

| 配置（均在 ExcelOutput/） | 对象记录 |
| --- | --- |
| AvatarConfig.json | 94 |
| AvatarConfigLD.json | 4 |
| AvatarConfigEnhanced.json | 10 |
| AvatarPromotionConfig.json | 658 |
| AvatarPromotionConfigLD.json | 28 |
| AvatarSkillTreeConfig.json | 5,378 |
| AvatarSkillTreeConfigLD.json | 200 |
| EquipmentConfig.json | 170 |
| EquipmentPromotionConfig.json | 1,190 |
| ExpType.json | 200 |
| EquipmentExpType.json | 240 |
| AvatarExpItemConfig.json | 3 |
| EquipmentExpItemConfig.json | 3 |
| AvatarRankConfig.json | 624 |
| AvatarRankConfigLD.json | 24 |
| AvatarServantConfig.json | 7 |
| MultiplePathAvatarConfig.json | 12 |
| ItemComefrom.json | 2,363 |
| ItemComposeConfig.json | 343 |
| AvatarSpecialSkillTree.json | 2 |

当前生成目录含 98 个角色形态、170 个光锥，恰好覆盖 regular+LD 角色及 Equipment 主表；不是按真实公测发布日期筛选出的“当前已上线实体”数量。公开目录范围与原始主表范围在本次核心材料集合中均为 140；Profile 切换会影响步骤集合，但本次不新增材料 ID。

遵守边界：未改生产代码、模型、UI、路由、管线、现有测试或领域排除规则；未执行数据同步、全量构建、commit/push，未安装新依赖。网络只经已验证的 `127.0.0.1:7890` 代理。报告只引用资源文件名与字节数，没有复制任何图片。TurnBasedGameData 当前无 LICENSE 文件；README 请求致谢。StarRailRes 有 AGPL-3.0 LICENSE，仓库已有第三方声明；后续若复制资源沿用现有资产和声明流程。

## 3. Historical Items Architecture｜历史设计与可复用边界

**FACT（历史文档）：**第二次重构主动移除了 Materials、普通 Items、升级费用、敌人掉落，以及相关领域模型、页面、搜索和关联。`ItemConfigAvatar`、`ItemConfigEquipment` 仍服务角色/光锥名称、简介和故事，不能因名称带 Item 而移除；`ItemComefrom` 当前服务遗器来源。重构后生成数据当时为 934 个文件、11,894,836 字节，静态构建为 1,901 个文件、53,592,752 字节；这是重构后历史实测，不能作为旧 Items 性能差值。

**FACT（Git 历史限制）：**`git rev-list --all --count` 为 252。最早 `c828665` 只有 `.gitattributes`、`AGENTS.md`、`LICENSE` 三个文件；下一个 `5a06e8d` 已是包含第二次重构完成说明的完整网站快照。检查所有 refs 的 item/material 路径历史，没有可访问的第二次重构前 Items 实现。因此：

| 历史问题 | 本轮可证明程度 |
| --- | --- |
| 使用过哪些物品源 | 文档证明有材料/物品/成本域；不能从保留源码确认完整源表清单（UNKNOWN） |
| 当时种类及数量 | UNKNOWN；不能拿当前 5,395 个 ID 代替历史收录量 |
| 角色/光锥成本关联方式 | UNKNOWN；当前原始表支持 ID 外键，但不能声称旧版就是这样实现 |
| 是否已有 EXP/道具/信用点计算 | UNKNOWN；“有成本展示”不等于已经模拟经验道具扣费 |
| 移除范围 | 文档明确：领域、页面、搜索、关联及生成逻辑；旧符号/文件清单不可恢复 |
| 旧性能/正确性/维护问题 | 未找到量化旧 Items 基准或错误案例；不能把删除理由归因为某个未证明故障 |

可复用的是当前架构：无损 Hash、共享 TextResolver、locale-neutral 身份、独立双语 projection、构建期选择性抽取和本地资产管线；Character 的共享 progression、LD 合并和 Profile 身份关系尤其有价值。不能恢复完整原始 Item Map、全量 TextMap 浏览器打包、按名称匹配、按显示卡片数收费、或仅凭稀有度套模板。

源码复用限制：`scripts/data/stats.ts` 的 `normalizeStatProgression` 为属性 UI 选择最高已突破阶段，把边界阶段区间压缩成互不重叠区间，且不保留费用。成本计算必须读取原始 Promotion 与 MaterialList；不能反向从当前 stats.stages 推断玩家晋阶状态。

## 4. ItemConfig Family Inventory｜文件族规模与冲突

**DERIVED：**实际目录发现 18 个 `ItemConfig*.json`，总原始体积 **3,648,010 字节**。共有 **5,582 个数组槽位，其中 135 个 null，5,447 条对象记录，5,395 个跨文件唯一数字 ID**。每个文件内的对象 ID 均唯一；下表槽位/对象/ID 不混用。两个 Test 文件仅含 null，不能把 null 计为物品。

文本/图标列是非空记录数，分母为该文件对象数。名称/说明/背景原字段与 CHS 已解析字段分别列出；EN 已解析数量在所有 18 文件上与 CHS 相同。数量可直接换算覆盖率；例如 ItemConfig 名称为 2,747/2,941 = 93.40%，两个 Test 文件分母为零，覆盖率为 N/A。

| 文件（ExcelOutput/） | 字节 | 槽位/对象/ID | 原名称/说明/背景 | CHS=EN 解析名称/说明/背景 | Icon/Figure 非空 |
| --- | --- | --- | --- | --- | --- |
| ItemConfig.json | 1,947,960 | 2941/2941/2941 | 2747/1691/2140 | 2747/1691/2140 | 2897/2897 |
| ItemConfigAvatar.json | 59,370 | 99/99/99 | 99/0/99 | 99/0/99 | 99/99 |
| ItemConfigAvatarLD.json | 2,402 | 4/4/4 | 4/0/4 | 4/0/4 | 4/4 |
| ItemConfigAvatarPlayerIcLD.json | 2,075 | 4/4/4 | 4/0/0 | 4/0/0 | 4/0 |
| ItemConfigAvatarPlayerIcon.json | 48,714 | 94/94/94 | 94/0/0 | 94/0/0 | 94/0 |
| ItemConfigAvatarRank.json | 54,412 | 94/94/94 | 94/94/12 | 94/94/12 | 94/94 |
| ItemConfigAvatarRankLD.json | 2,288 | 4/4/4 | 4/4/0 | 4/4/0 | 4/4 |
| ItemConfigAvatarSkin.json | 5,059 | 8/8/8 | 8/8/0 | 8/8/0 | 8/8 |
| ItemConfigAvatarTest.json | 633 | 70/0/0 | 0/0/0 | 0/0/0 | 0/0 |
| ItemConfigAvatarTestRank.json | 588 | 65/0/0 | 0/0/0 | 0/0/0 | 0/0 |
| ItemConfigBadge.json | 12,314 | 21/21/21 | 21/21/0 | 21/21/0 | 21/21 |
| ItemConfigBook.json | 549,396 | 762/762/762 | 762/762/762 | 762/762/762 | 762/762 |
| ItemConfigDisk.json | 185,837 | 272/272/272 | 272/272/272 | 272/272/272 | 272/272 |
| ItemConfigEquipment.json | 120,175 | 170/170/170 | 170/170/170 | 170/170/170 | 170/170 |
| ItemConfigLD.json | 31,638 | 69/69/69 | 0/0/0 | 0/0/0 | 69/69 |
| ItemConfigPlayerRoomDynamic.json | 55,166 | 79/79/79 | 78/58/78 | 78/58/78 | 78/78 |
| ItemConfigRelic.json | 532,627 | 774/774/774 | 774/0/774 | 774/0/774 | 774/774 |
| ItemConfigTrainDynamic.json | 37,356 | 52/52/52 | 52/52/52 | 0/0/0 | 52/52 |

**FACT：Release 字段在所有对象中均缺省；没有通用 Release 过滤器。** `isVisible` 只有 true 或缺省，未发现 false；缺省不能解释为隐藏。`InventoryDisplayTag` 为 1/2/3，并非公开网页收录开关。每文件 MainType、SubType、可见性分布见附录 A。

**DERIVED：52 个 ID 重叠，全部来自 `ItemConfigPlayerRoomDynamic` 与 `ItemConfigTrainDynamic`，均非完全相同记录。** 51 个 ID 仅在 `ItemName / ItemDesc / ItemBGDesc` 上不同；ID `294003` 还在 Rarity 上不同（PlayerRoom=SuperRare，Train=VeryRare）。其余字段一致。ID 范围为 `291001–291008`、`292001–292006`、`293001–293008`、`294001–294006`、`295001–295024`。其来源属于动态车厢/房间物品，而非 regular/LD 覆盖。ItemConfigLD 与其他文件无 ID 重叠。

例：ID `291001` 在 PlayerRoom 的名称 Hash 为 `17450310681412571793`，Train 为 `18275679769456901297`；PlayerRoom 的文本可解析，Train 的 52 条记录名称/说明/背景在 pinned 双语 TextMap 中均未解析。**INFERENCE：**可能是不同上下文或旧资源版本的重复配置；本轮不能证明其中哪个具有全局覆盖优先级，不能称其为已经解决的同一物品追加关系。完整图鉴应保留 `(source, ID)` 和冲突诊断。

140 个核心养成 ID 全部且唯一来自 `ItemConfig.json`，不受上述冲突影响。性能测量 C 使用明确的试验策略：冲突 ID 选 PlayerRoom 条目，未把这一策略认可为生产合并规范。

## 5. Item Identity and Classification｜身份、分类与最小领域

**FACT：**ItemConfig 身份字段为 `ID`；费用记录引用字段为 `ItemID`，数字值连接。`ItemMainType / ItemSubType` 表达类别；`Rarity` 是枚举，不是角色 `CombatPowerAvatarRarityType*`。`ItemRarityConfig` 的星级图片明确给出 Normal/NotNormal/Rare/VeryRare/SuperRare 的 1–5 星展示关系，保留原 code 后在展示层映射。

| 实际样本 | 类型与用途 |
| --- | --- |
| `2` 信用点 | Virtual/Virtual，PileLimit=999999999；在多项费用中聚合 |
| `213` 漫游指南 | Material/AvatarExp，VeryRare，PileLimit=99999，SellType=Destroy |
| `110417` 镇灵敕符 | Material/AvatarRank；这里 AvatarRank 是晋阶材料子类，不能误认成星魂道具 |
| `241` 命运的足迹 | Material/WeeklyMonsterDrop；与周本材料同属子类，仍按具体 ID 区分 |

`ItemName / ItemDesc / ItemBGDesc` 为 TextMap 引用，普通材料有 `{Hash}`，文件族不能假定所有引用均为同一种形态。哈希大于 JS 安全整数，使用 Python 原生整数核查并将 lookup key 转十进制字符串；TypeScript 生产方案复用 `lossless-json` 与现有共享 resolver，符号键用 XXH64(seed=0)。调查实现的 XXH64 已与已安装 `xxhash-wasm` 两个样本交叉核对。禁止通过 JS number 再转字符串。

ItemIconPath 是小图标，ItemFigureIconPath 是较大展示图，ItemCurrencyIconPath 是货币/上下文图，ItemAvatarIconPath 是角色物品关联图；不能假定每列都非空，也不能把资源路径当身份。`PileLimit` 可还原配置堆叠上限；`SellType=Destroy` 不能推导出售价，缺省 SellType 也不能判定可出售。UseMethod、CustomDataList、ReturnItemIDList、ItemGroup、PurposeType 属于用途、交互或资源关系，不足以单独证明运行时返还规则。

报告建议的最小接口（只提出，不修改任何公开 API）：

```ts
type MaterialId = string;
type MaterialMetadata = {
  id: MaterialId;
  mainType: string;
  subType: string;
  rarityCode: string;
  nameSource: TextSource;        // 复用现有 neutral text 类型
  descriptionSource?: TextSource;
  assetKey?: string;
};
type Cost = Record<MaterialId, number>;
```

构建期另保留 provenance、文本诊断和源路径；locale projection 仅输出当前语言名称与说明，不携带整份 TextMap。MVP 不需要堆叠、销售、背包、获取、兑换与故事字段。若未来扩展完整 Items，身份必须包含 source context，不能沿用无条件 `Map<ID, row>`。

补充源已扫描：`ItemPurpose`、`ItemRarityConfig`、`ItemComefrom`、`ItemGotoData`、`ItemComposeConfig`、`ItemGenderedConfig`、`ItemGiftPackData`、`ItemRecycle`、`ItemUseData` 等分别补充分类、资源外观、获取、组合与使用信息，不替代 ItemConfig 名称/身份。`AvatarUseMaterialData(+LD)` 提供角色材料类别关联，但没有逐步数量，不能用它代替费用表。活动类 Material 表独立于本次正式养成域。

## 6. Material ItemID Coverage｜实际引用材料覆盖

按实际费用反向收集 ID，未用 ItemMainType 猜测养成集合。五张核心来源去重前的各自引用集合如下；集合之间有重叠，不能把计数直接相加。

| 来源 | 费用字段 | 该源唯一 ItemID |
| --- | --- | --- |
| AvatarPromotionConfig.json | PromotionCostList | 64 |
| AvatarPromotionConfigLD.json | PromotionCostList | 11 |
| AvatarSkillTreeConfig.json | MaterialList | 101 |
| AvatarSkillTreeConfigLD.json | MaterialList | 22 |
| EquipmentPromotionConfig.json | PromotionCostList | 94 |

| 集合 | 唯一 ID | 原记录 | CHS 有效名 | EN 有效名 | Icon 路径 | 实际 ID 图标 |
| --- | --- | --- | --- | --- | --- | --- |
| 核心成本表并集 | 134 | 134 | 134 | 134 | 134 | 134 |
| 加六种经验道具（范围 A） | 140 | 140 | 140 | 140 | 140 | 140 |
| 当前公开目录覆盖的范围 A | 140 | 140 | 140 | 140 | 140 | 140 |
| 全文件族数字 ID | 5,395 | 5,395 | 5,131 | 5,131 | 5,350 | 1,261 |

**DERIVED：核心材料缺失 ItemID、缺失中文名、缺失英文名、缺失图标清单均为空。** 第 14 节另列全文件族按资源路径匹配数量，不能用全部物品的图标覆盖率代表养成材料覆盖率。

核心范围 A 包括货币、普通怪物材料、角色晋阶材料、行迹命途材料、周本材料、命运的足迹和经验道具。全部 ID、双语名及子类见附录 B，可直接作为后续选择性抽取输入集合。

范围 B 的可靠候选是 A 加三个 `MultiMaterialConfig` 中的通用替代材料：`110101` 梦之珠泪、`111000` 灵之珠泪、`110610` 轨之珠泪，共 143 件。三者 isVisible=true、有名称和图标；兑换比例各为 1/3/9、1/3/9、1/1/1。当前没有费用表直接消耗这些 ID，计算库存抵扣时需显式选择替代规则，不能把它们凭空加进角色需求。

额外费用源检查：`AvatarRankConfig(+LD).UnlockCost` 为星魂解锁，648 条配置引用 93 个独立星魂/解锁物品 ID；不包含在本报告核心的 134/140 中。`EquipmentConfig.RankUpCostList` 有 16 个光锥非空，内容是 ID 数组，不是 ItemID+ItemNum 费用行。若未来扩大到星魂获取/叠影材料，必须另定义范围并重新统计，不应将其无数量信息的列表直接并入普通升级扣费。

## 7. Character EXP Calculation｜角色经验与经验道具费用

### 7.1 需求已闭合

**FACT：**`AvatarConfig(+LD).ExpGroup → ExpType.TypeID`。所有 98 形态的 ExpGroup=1；23 个四星、75 个五星。ExpType 有 TypeID=1/2 两组，每组 Level=1–100 各一行，两组数值相同；没有角色使用组 2。98 形态 MaxPromotion=6，实际晋阶链上限均为 80，不能因经验表存在 81–100 而开放等级 100。

`ExpType(TypeID=1, Level=1).Exp=200`、Level=2 为 300；这是当前等级升下一级的增量需求。Level=100 终点缺省 Exp；光锥表在 Level=80 终点缺省 Exp，进一步支持 outgoing-level 语义。不要把缺省 EXP 应用于尚未到达的中间行；1–79 均有明确正值。

**DERIVED / Exact from configuration：**

```text
RequiredExp(a→b) = Σ ExpType[ExpGroup, level=k].Exp，k=a…b−1
有当前级内经验 x 时：RequiredExp = 上式 − x（目标为更高等级）
晋阶费用和晋阶动作不增加 RequiredExp。
```

同等级目标须定义级内经验目标；MVP 建议目标是所选等级起点。已经处于目标状态时需求为零，不能简单返回负经验。当前经验合法范围依据当前等级及晋阶上限验证；在上限时的残余处理见运行时缺口。

| 等级区间（左闭右开逐级求和） | EXP |
| --- | --- |
| 1-20 | 112,510 |
| 20-30 | 177,910 |
| 30-40 | 206,920 |
| 40-50 | 389,390 |
| 50-60 | 822,140 |
| 60-70 | 1,326,050 |
| 70-80 | 2,763,000 |
| 1→80 合计 | 5,797,920 |

边界检验：Lv.20/promotion0 与 Lv.20/promotion1 到 Lv.30 的等级经验需求同为 177,910（均假设当前经验为零），但前者还需要支付第一次晋阶费用。

### 7.2 道具与信用点必须独立

**FACT：**AvatarExpItemConfig 明确 `211→1000`、`212→5000`、`213→20000 EXP`。道具表没有 CoinCost 字段。`ConstValueCommon.Exp_SoftCoin_Cost.Value.IntValue=10`。

**INFERENCE：**常量支持角色经验费用采用 `EXP/10` 的解释，但本仓库未找到调用这一常量的客户端/服务端扣费实现。因此“每 10 EXP 一信用点”作为本节算例的显式假设，不能把常量本身当成舍入和实际扣费证明。

| 量 | 定义与精度 |
| --- | --- |
| Required EXP | 达到目标所需经验，逐级表精确 |
| EXP Supplied | 指定道具数量 × 配置 Exp 的和，精确 |
| Material Count | 由输入组合或带库存的选择策略确定，Required EXP 不能唯一决定 |
| Credit Cost | 若按完整 supplied/10 扣费，可按组合精确计算；实机截断/舍入/返还未证明 |
| Wasted/Returned EXP | supplied−required 是数学超额；究竟返还/保留/丢失尚未证明 |

**DERIVED / Exact under stated assumptions：**取当前经验为零、只比较总需求且暂不模拟晋阶卡点：

| 方案 | 道具 | Supplied EXP | 数学超额 | 假设 Supplied/10 费用 |
| --- | --- | --- | --- | --- |
| 需求比值参考 | 无法指定组合 | 需求=5,797,920 | N/A | 579,792（仅需求比值） |
| 全程理论最少超额 | 213×289、212×3、211×3 | 5,798,000 | 80 | 579,800 |
| 只用 213，全程一次取整 | 213×290 | 5,800,000 | 2,080 | 580,000 |
| 每晋阶区间分别按最小 1,000 EXP 单位取整 | 必须逐段组合 | 5,801,000 | 3,080 | 580,100 |
| 每晋阶区间只用 213，分别取整 | 213×(6+9+11+20+42+67+139)=294 | 5,880,000 | 82,080 | 588,000 |

前两种全程组合只是资源下界算例，不是可一次喂到 80 的合法游戏操作。逐段方案假设边界剩余经验不带入下一段、无可重新使用的返还；不是已确认的游戏机制。它们的差异恰好说明：把 Required EXP 直接折成某一种经验书数量，会隐藏边界与选择策略。

配置对这六种经验道具的 ReturnItemIDList 均为空；这不能证明通用运行时没有返还。未知：升普通目标等级时超额在级内保留的实现、晋阶上限及 80 上限的经验返还单位/阈值、实际按 supplied 还是有效经验扣费、舍入顺序、最低费用、游戏自动选择、特殊折扣或返还。未找到能证明这些行为的角色 EXP 回调；不能填入“无折扣”“一律丢失”等猜测。需要 currentExp、库存及具体组合才能输出更接近游戏 UI 的唯一答案。

## 8. Character Promotion Costs｜晋阶语义与逐步计算

**FACT：**94 regular +4 LD 角色各 7 行；缺省 Promotion 对应阶段 0，其余显式为 1–6；阶段 MaxLevel 依次 20/30/40/50/60/70/80。只有阶段 6 的费用为空，阶段 0 就有首晋阶费用。缺省值按 0 规范化，与显式 0 是候选解析语义；本次正式表没有显式 Promotion=0 行可供同角色差异比较。

**DERIVED / Exact from configuration：**费用为离开阶段 p 的增量，0→6 使用 p=0…5：

```text
PromotionCost(p0→p1) = Σ PromotionCostList[p]，p0 ≤ p < p1
```

把阶段 p1 行算作“到达 p1”的费用会整体错移，且会漏首晋阶/误用最终空表。全体 268 条角色/光锥链的结构都符合相同 outgoing-stage 模型。费用不是累计值，否则阶段末尾空表与逐段材料更换不能组成累计链。

`PlayerLevelRequire` 出现在阶段 0，例如三月七为 15；阶段 1–6 的 WorldLevelRequire 为 1/2/3/4/5/5。这些是阶段记录上的资格字段，报告保留原值，不擅自把阶段 6 的 5 解释成“已经允许升阶段 7”。计算任意计划可独立输出需求；若要模拟游戏允许点击晋阶的条件，未来须明确账号输入及字段读取时点。升级经验信用点与费用列表里的 ItemID=2 必须分项保存。

**边界算例：**三月七 `Lv.20/20, p=0 → Lv.20/30, p=1`：EXP=0，费用为 `2×3200 +111011×4`；`Lv.20/30 → Lv.30/30`：新增 EXP=177,910，晋阶费用=0。相同整数 level 不能代表相同成本状态。
### 三月七 `1001`：0→6

| 当前阶段→下一阶段 | 当前/目标上限 | 当前行费用 |
| --- | --- | --- |
| 0→1 | 20→30 | `2` × 3,200；`111011` × 4 |
| 1→2 | 30→40 | `2` × 6,400；`111011` × 8 |
| 2→3 | 40→50 | `2` × 12,800；`110403` × 2；`111012` × 5 |
| 3→4 | 50→60 | `2` × 32,000；`110403` × 5；`111012` × 8 |
| 4→5 | 60→70 | `2` × 64,000；`110403` × 15；`111013` × 5 |
| 5→6 | 70→80 | `2` × 128,000；`110403` × 28；`111013` × 7 |
| 6（终点） | 80 | 空 / 0 |

合计：`2` × 246,400；`110403` × 50；`111011` × 12；`111012` × 13；`111013` × 12。

### 希儿 `1102`：0→6

| 当前阶段→下一阶段 | 当前/目标上限 | 当前行费用 |
| --- | --- | --- |
| 0→1 | 20→30 | `2` × 4,000；`111011` × 5 |
| 1→2 | 30→40 | `2` × 8,000；`111011` × 10 |
| 2→3 | 40→50 | `2` × 16,000；`110406` × 3；`111012` × 6 |
| 3→4 | 50→60 | `2` × 40,000；`110406` × 7；`111012` × 9 |
| 4→5 | 60→70 | `2` × 80,000；`110406` × 20；`111013` × 6 |
| 5→6 | 70→80 | `2` × 160,000；`110406` × 35；`111013` × 9 |
| 6（终点） | 80 | 空 / 0 |

合计：`2` × 308,000；`110406` × 65；`111011` × 15；`111012` × 15；`111013` × 15。

**DERIVED：**常规四星三月七晋阶信用点 246,400、晋阶材料50；常规五星希儿 308,000、晋阶材料65。这里不能做全局四星/五星模板：开拓者虽 Rarity=5，晋阶信用点仍为246,400，110400晋阶材料仅28；应逐角色读表。

三月七 Lv.1→80，晋阶与全行迹信用点合计 2,646,400；希儿选择任一单独 Profile 后为3,308,000。再加经验需求比值579,792分别为3,226,192和3,887,792，**这些是经验比值假设下的参考值，不是实机总扣费**。若采用每段最少1,000 EXP且无返还假设，加580,100，参考总数分别3,226,500和3,888,100。

## 9. Skill and Trace Upgrade Costs｜技能与行迹

### 9.1 节点等级是收费单位

**FACT：**regular 5,378 +LD200 =5,578 条 SkillTree 行，组成 **1,970 个 `(AvatarID, EnhancedID, PointID)` 节点**。每组 Level 从1到MaxLevel连续、无缺口，`(PointID, EnhancedID, Level)` 无重复。不能省略 EnhancedID。

每个默认解锁节点的 Level=1 MaterialList 均为空；所有有费用的 Level=1 行只属于属性/额外能力节点。由完整等级链、DefaultUnlock 与非默认单级解锁共同确定：**MaterialList 表示到达该 Level 的增量成本。**

```text
已有付费等级 u → v：Σ MaterialList[node, level=l]，u < l ≤ v
未解锁单级节点：0 →1，读取 Level=1 行
默认解锁技能初始等级=1；不把初始等级当成一次付费升级
```

`MaxLevel` 表示玩家主动升级上限，不能用 AvatarSkillConfig 的展示等级数量替代：三月七普攻技能数据到10而付费节点到6；战技技能数据到15而付费节点到10。技能数值表额外等级供星魂等展示使用。

三月七战技节点 `1001002`，SkillID=`100102`，Lv.1→10 的逐行过程（Exact from configuration）：

| 到达 Level | AvatarPromotionLimit | 该行 MaterialList |
| --- | --- | --- |
| 1 | 0 | 空 / 0 |
| 2 | 1 | `2` × 2,000；`111011` × 2 |
| 3 | 2 | `2` × 4,000；`110141` × 2；`111011` × 4 |
| 4 | 3 | `2` × 8,000；`110142` × 2；`111012` × 2 |
| 5 | 4 | `2` × 16,000；`110142` × 4；`111012` × 3 |
| 6 | 4 | `2` × 24,000；`110142` × 6；`111012` × 5 |
| 7 | 5 | `2` × 36,000；`110143` × 2；`111013` × 2 |
| 8 | 5 | `2` × 64,000；`110143` × 4；`110501` × 1；`111013` × 3 |
| 9 | 6 | `2` × 128,000；`110143` × 6；`110501` × 1 |
| 10 | 6 | `2` × 240,000；`241` × 1；`110143` × 11；`110501` × 1 |

总计：`2` × 522,000；`241` × 1；`110141` × 2；`110142` × 12；`110143` × 23；`110501` × 3；`111011` × 6；`111012` × 10；`111013` × 5。例如 Lv.3→5 只计 Level=4、5，两行信用点合计24,000，不重新计 Level=3。

### 9.2 各类节点与约束

| PointType | 唯一节点数 | 本次配置语义 |
| --- | --- | --- |
| 1 | 1,080 | 属性强化，单级解锁，Level1收费 |
| 2 | 540 | 角色技能：6/10级付费 progression 或免费单级秘技 |
| 3 | 324 | 额外能力，单级解锁，Level1收费 |
| 4 | 24 | 忆灵技能或欢愉技；不能只按数字4分类为忆灵 |
| 5 | 2 | 记忆开拓者特殊展示节点，MaxLevel1、无费用 |

`PrePoint` 为前置 PointID 列表；在所属角色/Profile 内均能解析，缺失为0。`AvatarPromotionLimit` 限制到达该节点等级的晋阶阶段，升级Lv.10通常要求6；普攻Lv.2要求2。固定能力不可人为增加等级。资格检查与材料求和分离：目标违反限制应显式报不可达，不截断后假装计算完成。

**全部三月七行迹/技能：**以下每个节点只计一次，常规技能升至付费上限、全部属性和额外能力解锁；秘技Level1免费。

| PointID | PointType | 累计材料（至MaxLevel） |
| --- | --- | --- |
| 1001001 | 2 | `2` × 192,000；`110141` × 2；`110142` × 6；`110143` × 8；`111011` × 4；`111012` × 5；`111013` × 5 |
| 1001002 | 2 | `2` × 522,000；`241` × 1；`110141` × 2；`110142` × 12；`110143` × 23；`110501` × 3；`111011` × 6；`111012` × 10；`111013` × 5 |
| 1001003 | 2 | `2` × 522,000；`241` × 1；`110141` × 2；`110142` × 12；`110143` × 23；`110501` × 3；`111011` × 6；`111012` × 10；`111013` × 5 |
| 1001004 | 2 | `2` × 522,000；`241` × 1；`110141` × 2；`110142` × 12；`110143` × 23；`110501` × 3；`111011` × 6；`111012` × 10；`111013` × 5 |
| 1001007 | 2 | 空 / 0 |
| 1001101 | 3 | `2` × 4,000；`110141` × 2；`110501` × 1 |
| 1001102 | 3 | `2` × 16,000；`241` × 1；`110142` × 4；`110501` × 1 |
| 1001103 | 3 | `2` × 128,000；`241` × 1；`110143` × 6；`110501` × 1 |
| 1001201 | 1 | `2` × 2,000；`111011` × 2 |
| 1001202 | 1 | `2` × 4,000；`110141` × 2；`111011` × 4 |
| 1001203 | 1 | `2` × 8,000；`110142` × 2；`111012` × 2 |
| 1001204 | 1 | `2` × 8,000；`110142` × 2；`111012` × 2 |
| 1001205 | 1 | `2` × 16,000；`110142` × 4；`111012` × 3 |
| 1001206 | 1 | `2` × 36,000；`110143` × 2；`111013` × 2 |
| 1001207 | 1 | `2` × 36,000；`110143` × 2；`111013` × 2 |
| 1001208 | 1 | `2` × 128,000；`110143` × 6；`111013` × 6 |
| 1001209 | 1 | `2` × 128,000；`110143` × 6；`111013` × 6 |
| 1001210 | 1 | `2` × 128,000；`110143` × 6；`111013` × 6 |

总计：`2` × 2,400,000；`241` × 5；`110141` × 12；`110142` × 54；`110143` × 105；`110501` × 12；`111011` × 28；`111012` × 42；`111013` × 42。其中10个属性节点信用点494,000，3个额外能力信用点148,000，付费技能信用点1,758,000；合计2,400,000。

### 9.3 共享 progression 与星魂

**FACT：**`LevelUpSkillID` 可以连接多个展示技能；`scripts/data/domain/character.ts` 的 progressionBySkill 与 `scripts/data/skills.ts` 的 buildSkillCards 以 PointID 组织关系。必须消费该节点费用，而非为每个变体创建独立费用。卡片 availableLevels 是展示技能数值表交集，不是付费节点MaxLevel。

三月七星魂3：SkillAddLevelList=`100103:+2、100101:+1`；星魂5：`100102:+2、100104:+2`。这些增量没有新的 SkillTree MaterialList 行，显示等级=付费等级+免费增量。10级战技显示12级时仍只收费Lv.2…10。星魂本身 UnlockCost 属于另一个资源系统，不把它当成额外技能升级费用。

当前 neutral 域保留技能/行迹身份与前置关系，但丢弃 MaterialList、节点逐级晋阶限制及成本统计；未来需增加一个 locale-neutral cost extraction 层。不要直接把 UI 卡片反序列化为成本模型。

## 10. Special Character Cases｜特殊角色验证

以下结果均为 **DERIVED / Exact from configuration**，满级技能采用节点实际 MaxLevel；总计包含所有单级属性/额外能力，免费节点加入0费用。每个 Profile 单独求和，不相加。

| 角色 | AvatarID | EnhancedID | 节点数 | 晋阶0→6 | 全部技能树 |
| --- | --- | --- | --- | --- | --- |
| 三月七 | 1001 | 0 | 18 | `2` × 246,400；`110403` × 50；`111011` × 12；`111012` × 13；`111013` × 12 | `2` × 2,400,000；`241` × 5；`110141` × 12；`110142` × 54；`110143` × 105；`110501` × 12；`111011` × 28；`111012` × 42；`111013` × 42 |
| 希儿 | 1102 | 0 | 18 | `2` × 308,000；`110406` × 65；`111011` × 15；`111012` × 15；`111013` × 15 | `2` × 3,000,000；`241` × 8；`110121` × 18；`110122` × 69；`110123` × 139；`110502` × 12；`111011` × 41；`111012` × 56；`111013` × 58 |
| 希儿 | 1102 | 1 | 18 | `2` × 308,000；`110406` × 65；`111011` × 15；`111012` × 15；`111013` × 15 | `2` × 3,000,000；`241` × 8；`110121` × 18；`110122` × 69；`110123` × 139；`110502` × 12；`111011` × 41；`111012` × 56；`111013` × 58 |
| 丹恒•饮月 | 1213 | 0 | 18 | `2` × 308,000；`110417` × 65；`113001` × 15；`113002` × 15；`113003` × 15 | `2` × 3,000,000；`241` × 8；`110111` × 18；`110112` × 69；`110113` × 139；`110503` × 12；`113001` × 41；`113002` × 56；`113003` × 58 |
| 镜流 | 1212 | 0 | 18 | `2` × 308,000；`110413` × 65；`113001` × 15；`113002` × 15；`113003` × 15 | `2` × 3,000,000；`241` × 8；`110111` × 18；`110112` × 69；`110113` × 139；`110503` × 12；`113001` × 41；`113002` × 56；`113003` × 58 |
| 镜流 | 1212 | 1 | 18 | `2` × 308,000；`110413` × 65；`113001` × 15；`113002` × 15；`113003` × 15 | `2` × 3,000,000；`241` × 8；`110111` × 18；`110112` × 69；`110113` × 139；`110503` × 12；`113001` × 41；`113002` × 56；`113003` × 58 |
| 遐蝶 | 1407 | 0 | 20 | `2` × 308,000；`110436` × 65；`115011` × 15；`115012` × 15；`115013` × 15 | `2` × 3,000,000；`241` × 8；`110251` × 18；`110252` × 69；`110253` × 139；`110506` × 12；`115011` × 41；`115012` × 56；`115013` × 58 |
| 开拓者·记忆 | 8007 | 0 | 21 | `2` × 246,400；`110400` × 28；`111011` × 12；`111012` × 13；`111013` × 12 | `2` × 2,400,000；`241` × 5；`110251` × 9；`110252` × 53；`110253` × 105；`110506` × 12；`111011` × 28；`111012` × 39；`111013` × 43 |
| Saber | 1014 | 0 | 18 | `2` × 308,000；`110425` × 65；`111011` × 15；`111012` × 15；`111013` × 15 | `2` × 3,000,000；`241` × 8；`110181` × 18；`110182` × 69；`110183` × 139；`110501` × 12；`111011` × 41；`111012` × 56；`111013` × 58 |
| 开拓者·欢愉 | 8009 | 0 | 19 | `2` × 246,400；`110400` × 28；`111011` × 12；`111012` × 13；`111013` × 12 | `2` × 2,400,000；`241` × 5；`110261` × 12；`110262` × 54；`110263` × 105；`110508` × 12；`111011` × 28；`111012` × 42；`111013` × 42 |
| 火花 | 1501 | 0 | 19 | `2` × 308,000；`110432` × 65；`116001` × 15；`116002` × 15；`116003` × 15 | `2` × 3,000,000；`241` × 8；`110261` × 18；`110262` × 69；`110263` × 139；`110508` × 12；`116001` × 41；`116002` × 56；`116003` × 58 |

**丹恒·饮月：**`1213001` 连接 `121301、121308、121310、121312` 四个普攻变体，仅有一条1→6付费链，费用240,000信用点、110111×3、110112×8、110113×11、113001×6、113002×7、113003×7。若按四变体重复计费，会额外多算720,000信用点等材料。镜流战技base节点`1212002`连接两个变体，加强版`11212002`也连接两个，均各算一次。

**遐蝶：**普通节点`1407001`普攻1→6为201,500信用点；两个忆灵节点`1407301/1407302`各1→6为201,500信用点，合计403,000，不能遗漏。普通战技`1407002`连接`140702/140709`；忆灵节点包括隐藏SkillID`1140712`，其HideInUI=true且与公开忆灵技能共用`1407302`，不产生额外收费。总技能树仍为3,000,000信用点，但各技能分配与常规五星不同，不能因为总数相同就套模板。

**记忆开拓者：**`8007301/8007302`各161,200信用点，合计322,400；特殊`8007501` PointType5费用为空；`AvatarSpecialSkillTree.ShowSkill=800708` 已连接普攻节点8007001，不另建付费节点。技能树21个节点，信用点2,400,000，命途材料9/53/105而非常规四星12/54/105。

**加强 Profile：**镜流base/enhanced分别18个节点、各3,000,000信用点。全10名加强角色逐Profile材料聚合均完全相同（1212/1205/1005/1006/1307/1306/1102/1217/1310/1004）。这证明本次两个完整Profile成本相等，不能证明“切换加强时游戏重新收费”或自动状态迁移；未来用户状态应只选择一个Profile，历史等级迁移规则单独验证。

**多命途：**MultiplePathAvatarConfig 的8001–8010形态均指向BaseAvatarID=8001，1001/1224指向1001。这直接证明共享基础身份关联；跨形态等级/晋阶共享的运行时状态仍缺少调用代码证明。单形态计划可精确读表；多角色批量计划建议在显式共享等级/晋阶假设下按BaseAvatarID去重，技能树仍按形态/节点保留。记忆开拓者单形态晋阶需110400×28；不能把所有开拓者形态的该费用重复相加。`AvatarPathItemTransfer` 对欢愉开拓者的291→18009转换是命途解锁，不属于普通等级经验/晋阶费用。

**LD：**Saber1014的首技能节点1014001连接101401与101408，仍只有一个普攻1→6 progression；LD四角色材料均从regular ItemConfig解析。当前character-sources.ts按身份合并regular/LD且不同内容冲突时报错，沿用这一校验边界。

**新增类型补充：**欢愉角色1501及开拓者8009分别有PointType4、MaxLevel10、连接普通AvatarSkillConfig的欢愉技，信用点520,000和416,000。不能把PointType4全部视为AvatarServantSkillConfig，需与Servant.SkillIDList交集及结构分类联合判断。记忆角色包括尚有新形态的1512，扫描结果24个PointType4节点已覆盖，不使用旧审计中的“6忆灵/7形态”作为固定常量。

## 11. Light Cone Progression Costs｜光锥养成

**FACT：**EquipmentConfig.ExpType连接EquipmentExpType；25个三星ExpType1、73个四星ExpType2、72个五星ExpType3。每组Level1–80连续，Level80终点缺省Exp，1–79均有需求。光锥与角色共用“逐级表求和”的抽象，但数值组、材料提供值和扣费来源不同。

**DERIVED / Exact from configuration：**

| 光锥 | ID | ExpType | Lv.1→80 EXP | 晋阶0→6 |
| --- | --- | --- | --- | --- |
| 锋镝 | 20000 | 1 | 597,440 | `2` × 231,000；`110121` × 2；`110122` × 6；`110123` × 9；`111011` × 12；`111012` × 10；`111013` × 8 |
| 一场术后对话 | 21000 | 2 | 796,590 | `2` × 308,000；`110171` × 3；`110172` × 9；`110173` × 12；`111001` × 15；`111002` × 15；`111003` × 12 |
| 银河铁道之夜 | 23000 | 3 | 995,700 | `2` × 385,000；`110131` × 4；`110132` × 12；`110133` × 15；`111001` × 20；`111002` × 20；`111003` × 14 |

EquipmentPromotionConfig的7阶段费用与角色一样属于离开当前阶段，四星晋阶信用点308,000，五星385,000。完整逐阶段列表可由附录C代码直接重现，经验信用点另算。

| 经验材料 | ExpProvide | CoinCost | CoinCost/EXP |
| --- | --- | --- | --- |
| 221 稀薄以太 | 500 | 250 | 1/2 |
| 222 凝缩以太 | 2,000 | 1,000 | 1/2 |
| 223 提纯以太 | 6,000 | 3,000 | 1/2 |

对**明确指定、未强化的经验道具组合**，supplied与费用可以直接由道具表求和（Exact from configuration）；是否允许组合在给定等级边界全部被消耗、溢出后净消耗多少，仍为运行时问题。不要使用角色的EXP/10假设计算光锥费用。

| 理论方案（忽略晋阶卡点与返还） | 组合 | Supplied EXP / 超额 | 组合信用点 | 晋阶+该组合 |
| --- | --- | --- | --- | --- |
| 四星最少500单位超额 | 223×132、222×2、221×2 | 797,000 /410 | 398,500 | 706,500 |
| 五星最少500单位超额 | 223×165、222×2、221×4 | 996,000 /300 | 498,000 | 883,000 |

这些是固定组合的数学费用，不是游戏推荐道具数。原始需求除2分别398,295及497,850，也不是已证明扣费；按六次晋阶区间分别取整、返还或混合素材可能不同。

EquipmentConfig还允许光锥作经验素材：20000原始ExpProvide500/CoinCost250、21000为12000/6000、23000为60000/30000；`Equipment_Exp_Recyle_Ratio=80`提供强化素材回收比例线索，但未找到累计经验/舍入/返还实现。本次不将强化光锥喂料纳入精确模型。

叠影与等级升级独立：三个代表光锥RankUpCostList为空；全部表有16个非空列表，引用121000…121008或271等替代叠影资源，没有数量字段。不能把叠影次数视为升级经验步骤，也不能把RankUpCostList误作晋阶ItemNum数组。MVP光锥计算器只处理等级和晋阶；叠影需求另建功能。

## 12. Mathematical Cost Model｜数学模型与复现检查

建议状态与输出（草案，未改任何公开接口）：

```ts
type CharacterProgress = {
  avatarId: string;
  enhancedId: number;
  level: number;
  promotion: number;
  currentExp?: number;
  nodeLevels: Record<string, number>; // 0=未解锁；默认技能初始为1
};
type CostResult = {
  requiredExp: number;
  promotion: Cost;
  skillTree: Cost;
  leveling?: { materials: Cost; suppliedExp: number; credits: number };
  precision: 'configuration' | 'assumptions' | 'partial';
};
```

**DERIVED：**`TotalCost = LevelingCost + PromotionCost + SkillTreeCost` 按ItemID向量逐项相加。ItemID2信用点参与相加，但仍保留分项便于审计；RequiredExp不直接写成经验道具ItemNum，也不与2混成同一个单位。

区间不同：晋阶为`[p0,p1)`；技能为`(l0,l1]`；经验表为`[L0,L1)`。边界和当前经验必须明确输入，不借用网站现有基础属性“最高晋阶阶段”的默认选择。降级目标不产生退款；无效状态或不可达目标报错，不输出负材料。库存抵扣和合成/通用替代优化器不属于本轮MVP。

**本轮实际运行的独立扫描断言通过：**268条晋阶链均是0…6、MaxLevel20/30/40/50/60/70/80、终点费用空；1,970组节点等级1…MaxLevel连续；5,578行键唯一；所有费用ItemNum为正；DefaultUnlock节点初始费用空；所属Profile前置外键缺失0。分别对每条链的所有切分点验证`Cost(a,b)+Cost(b,c)=Cost(a,c)`。同状态区间为空，费用为零。

人工定向核对：Lv.20边界；1001002逐级列表；三月七18节点总计；丹恒饮月共享4变体只收一次；遐蝶隐藏变体不额外收费；10加强Profile不合并；星魂免费等级不读取节点上限之外的MaterialList；98角色经验组相同；四星/五星光锥经验组不同；140材料名与图标闭合。附录C包含实际扫描源码和独立断言，可用标准库重现，无需安装依赖。

这些检查证明配置模型的完整性和求和一致性，不等同于游戏内扣费实测。本轮未运行站点单测/浏览器测试/构建，因为没有改变生产逻辑。后续工程测试应保持同样的小范围真实数据与边界用例，并另加入状态非法、技能前置不满足和单语言缺失的失败场景。

## 13. nanoka.cc Comparison｜第三方对比与访问限制

**FACT：**2026-10-08（UTC+8）经项目代理读取[nanoka主页](https://nanoka.cc)和[HSR首页](https://hsr.nanoka.cc)，HTTP200。首页内联SvelteKit fetched数据明确指向`https://static.nanoka.cc/hsr/4.6.51/`，包含character99、lightcone172、en/item1600、relicset64等数据；这不是TurnBased pinned4.6.0的同版本承诺。

读取首页实际引用的公开应用脚本`https://hsr.nanoka.cc/_app/immutable/entry/app.39af6305.js`时返回HTTP403。遵守AGENTS外部工具失败停止规则，未重试脚本或尝试绕过访问限制。首页已取得的数据只有实体概要和物品元数据，不含晋阶/技能成本或计算器输入状态；因此以下案例只能提供本地配置基准，第三方数值和差值均不可用。

| 案例/输入 | 本地配置信用点 | nanoka同输入费用 | 数值差值 |
| --- | --- | --- | --- |
| 三月七，晋阶0→6 | 246,400 | Unavailable | N/A |
| 三月七，战技1→10 | 522,000 | Unavailable | N/A |
| 三月七，全技能树 | 2,400,000 | Unavailable | N/A |
| 遐蝶，全技能树含两忆灵节点 | 3,000,000 | Unavailable | N/A |
| 三月七/希儿，Required EXP 1→80 | 5,797,920 EXP（非信用点） | Unavailable | N/A |

**已成功复现的是物品展示差异，不是费用差异：**[nanoka公开英文物品数据](https://static.nanoka.cc/hsr/4.6.51/en/item.json)中140个核心材料ID均存在，但110507/110508/110509的item_name都是字面量`...`；本地EN对应Daythunder Anamnesis、Vanquished Flow's Reticence、High Hopes of the Falsely Enlightened。其余137个材料名称与本地EN一致。元数据ID覆盖140/140不意味着有效名称覆盖140/140。

用户此前观察到的费用差异没有角色、目标状态、所用道具或实机数值，本轮不归因。共享技能重复计算、遗漏属性/额外能力、星魂付费化、EXP与晋阶混算、用错稀有度模板、遗漏忆灵/欢愉节点都是需要核对的假说，**不是已确认的nanoka缺陷**。

待补基准：用同一版本和角色记录当前level/promotion/currentExp、付费节点等级、星魂、Profile、目标、指定经验道具及UI扣费；先核对各ItemID分项，再比较净返还。若配置与第三方一致而实机不同，只能标记“配置与第三方一致，缺少/待核对客户端基准”，不能推断游戏错误。本轮“一个nanoka成本差异案例”验收项未闭合，原因是成本数据访问受限且无用户实机基准；其他静态调查项不受影响。

## 14. Item Icon Coverage｜图标覆盖与映射

**DERIVED：**`StarRailRes/icon/item`有1,650个文件、1,650个唯一stem，其中1,365个stem完全是数字，其余285个包含后缀或文本。不是每个文件名都直接对应ItemID；例如1001_1/1001_2等不能机械映射角色ID1001。

| 口径 | 覆盖数量 |
| --- | --- |
| 全部5,395个数字物品ID，严格匹配`<ID>.png` | 1,261 |
| 全部5,395个数字物品ID，匹配ItemIconPath basename | 4,119 |
| 全部物品ID，无路径basename匹配 | 1,276 |
| 核心134费用ID，严格ID匹配 | 134 |
| 范围A140资源，严格ID匹配及路径匹配 | 140 |
| 范围A140图标原文件总字节 | 3,348,614 |

**FACT：**养成140项的Icon basename与ID均闭合，MVP可直接使用ID驱动的选择性同步。完整图鉴只能把path basename命中称为“文件存在候选”，不能称为图片内容已验证：很多活动/内部物品共用测试图。basename也不自动证明不同上游资源目录语义可互换。

按明确ID优先、资源basename候选回退统计，有289个图标文件被多个ItemID引用，例如2.png对应2/140401/300202，21.png对应21/281034，51.png对应51/52；Icon_Testmaterial01.png对应大量测试/活动物品。物品身份不能由图片反推，也不能把共享图标数计成唯一物品数。

ItemRarityConfig提供独立边框、背景、颜色和星级资源路径，稀有度视觉是可独立渲染的元数据；不需要每件材料复制一套稀有度图片。带后缀的星魂/角色图需要显式映射，范围A不依赖它们。原ItemFigureIconPath属于另一种展示尺寸；MVP用小图标即可。缺图fallback沿用现有资产处理，不阻断成本计算。

## 15. Performance and Architecture Options｜性能与架构选择

### 15.1 实测投影，而非站点构建估算

**DERIVED：**一次标准库扫描，无损读取小配置并保留source，TextMap逐行读取且只保留本次引用Hash。CHS文件52,399,646字节、EN59,061,007字节，合计111,460,653；未把TextMap整体json.load进内存。全部ItemConfig输入3,648,010字节；核心ItemConfig+角色/光锥/费用/经验/常量候选输入8,425,983字节。全家族审计读取的元数据更广，不能把最终140件的JSON大小当成构建输入大小。

测量字段为`id,name,description,mainType,subType,rarity,icon`，紧凑UTF-8 JSON，gzip level9/mtime0；不包含故事、获取、成本表和搜索索引。A=140实际资源；B=143（A加3种可见通用替代材料）；C=5,131（数字ID去重、PlayerRoom冲突策略、InventoryDisplayTag>0、双语名称均非空）。C是明确的试验候选，不是已经可靠确定的全部玩家可见物品集合。

| 范围 | 记录 | CHS JSON/gzip 字节 | EN JSON/gzip 字节 | 图标文件/原字节 | 缺图候选ID |
| --- | --- | --- | --- | --- | --- |
| A | 140 | 32,170 / 5,928 | 36,609 / 6,489 | 140 / 3,348,614 | 0 |
| B | 143 | 32,957 / 6,130 | 37,545 / 6,698 | 143 / 3,406,352 | 0 |
| C | 5131 | 991,252 / 103,500 | 1,067,297 / 106,862 | 1625 / 33,361,558 | 1232 |

A双语JSON合计68,779字节，gzip12,417；所有成本行的紧凑locale-neutral投影另为593,079字节、gzip36,755，字段仅含实体/阶段或节点/等级/上限/材料。后者没有完整前置和技能映射，是测量下界，不是生产产物协议。合计约661,858字节JSON、49,172字节gzip，成本文件可按角色/光锥拆分，无需每语言重复。

Windows独立Python进程一次实测：扫描约1.448秒（暖文件缓存、含统计和gzip），PeakWorkingSet从16,211,968升至70,987,776字节，结束WorkingSet67,383,296；本次峰值约67.7MiB，增量约52.2MiB。A/B投影+gzip约1–3ms/语言，C约50–60ms/语言。**这些不是Node/SvelteKit构建内存或总构建时间保证**；完整站点新增页面的渲染成本未测，不能按比例冒充实测。

### 15.2 搜索与路由增量

| 方案 | 最小MVP新增路由 | 若每材料做独立详情（双语，含目录） | 新材料搜索记录 |
| --- | --- | --- | --- |
| A | 计算器入口2个，材料详情0个 | 282个 | 可为0；若加入搜索则140/语言 |
| B | 同A | 288个 | 可为0；若加入搜索则143/语言 |
| C | 独立Items至少需要目录与详情设计 | 10,264个候选 | 5,131/语言（部分与现有实体重复） |

路由数是给定产品形态下的推导，不是本轮创建的页面。搜索条目数量可算，FlexSearch实际索引字节/构建内存未执行完整索引测量，标记UNKNOWN；可用名字+ID的小投影做后续定向测量，不能把gzip元数据字节当成搜索索引大小。C还含现有角色、光锥、遗器和动态道具，恢复前需要去掉重复页面和解决收录语义，不能直接开放10,264路由。

**推荐范围A：**沿用SvelteKit静态部署和构建期分层抽取，材料只作为计算结果展示元数据，角色/光锥按需加载费用shard；增加两份本地语言投影，统一ID与本地资产URL。140张原图仅3.19MiB，可选择性处理更小输出；不复制全部1,650张。先不建材料详情页，不加入完整Items搜索，不引入后端/数据库，不把raw source路径暴露给浏览器。

生产工程若开始，应在source-requirements集中登记ItemConfig、ExpType、AvatarExpItemConfig、EquipmentExpType、EquipmentExpItemConfig、ConstValueCommon，复用当前已登记的费用源和LD关系；现有源注册尚未准备全部经验/物品成本新表，部署sparse checkout也要同步其精确文件列表。当前调查不修改该清单和域排除规则。

## 16. Unresolved Questions and Risks｜未闭合问题与风险

| 问题 | 状态与实际影响 |
| --- | --- |
| 角色经验信用点具体调用、舍入与最小扣费 | Partially resolved；常量10可见，无调用实现，固定组合费用需标假设 |
| 普通升级、晋阶上限、80级上限的溢出/返还 | UNKNOWN；不能输出“净消耗道具”或自动方案的游戏精确值 |
| 光锥自动材料选择、强化光锥喂料回收 | Partially resolved；普通经验道具CoinCost精确，净返还未证明 |
| 多命途跨形态共享经验/晋阶状态的读取机制 | 有BaseAvatarID关系；单形态精确，批量去重需显式共享假设或运行时验证 |
| 加强Profile已有等级如何迁移 | 两套成本相等，但状态迁移/解锁行为UNKNOWN；只选一套，不收两套费用 |
| 完整Items可见性与52个上下文ID冲突 | 不能从缺省isVisible或InventoryDisplayTag确定网页收录；不影响140核心资源 |
| 旧Items源码与旧数量 | Git没有第二次重构前实现，UNKNOWN；需原始归档才能补历史审计 |
| nanoka成本差异与实机基准 | 脚本403，首页无成本；用户未提供实机输入/数值，本轮无确认费用差异 |
| 新版本新节点/来源 | 每次upstream更新应重新检查FK、range、PointType和共享节点；不可硬编码当前总数为永久契约 |

不要扩大未知范围：晋阶离散费用、节点MaterialList、经验逐级需求、140件材料连接已经闭合，不需要等待自动选择/返还全部实测后才实现它们。

未来最小客户端核对包：Lv.1→2（200EXP）投入211×1、晋阶上限前少量经验再投入213、80级前最后一次投料、混合经验道具组合；分别记录确认前/后信用点、返还道具和级内经验。再核对光锥相同边界、强化光锥作素材、命途切换与加强Profile已有等级。该清单是后续建议，本轮没有宣称已经执行。

## 17. Recommendation and Next Steps｜建议与验收答复

**建议进入工程实现：先做范围A的晋阶、付费节点与Required EXP计算；指定经验道具方案明确标注精度，暂不宣称游戏自动选择和净返还模拟。独立Items板块目前收益不足，不建议随计算器一并恢复。** 本轮调查授权不等于修改AGENTS产品边界的批准，正式实现时需依据独立产品决定更新约束；本报告未改规则。

| # | 验收问题 | 答复 |
| --- | --- | --- |
| 1 | ItemConfig有多少物品 | 18文件，5,582槽位含135null，5,447对象，5,395数字ID；52上下文冲突 |
| 2 | 有意义的养成材料 | 核心成本134，加6经验道具=140；3通用替代资源可扩展至143 |
| 3 | 实际引用材料能否解析 | 核心140/140原记录、CHS/EN名称均闭合；星魂/叠影另域 |
| 4 | 图标是否足够 | 核心140/140严格ID图标，足够；完整Items有缺图/测试图问题 |
| 5 | 角色逐级EXP能否还原 | 可以，ExpGroup→ExpType，1→80=5,797,920 |
| 6 | 每次晋阶能否还原 | 可以，读当前阶段费用，[p0,p1)求和 |
| 7 | 每节点技能/行迹能否还原 | 可以，1,970节点链连续，(l0,l1]求和，Profile分区 |
| 8 | 特殊角色是否存在 | 存在共享变体、忆灵/欢愉节点、加强Profile、多命途、LD及开拓者不同费用 |
| 9 | 经验书与信用点是否精确 | 需求和指定提供量精确；组合不唯一，角色扣费/净返还仅条件精确或未闭合 |
| 10 | 光锥能否共用算法 | 共用逐级/阶段/向量聚合框架；经验组和扣费规则独立，光锥原道具费用1/2 |
| 11 | nanoka有哪些费用差异 | 没有确认数值差异；应用脚本403、无实机基准；仅名称占位差异已复现 |
| 12 | 能否可靠构建计算器 | 可以；先覆盖静态精确部分，对运行时未知明确限制 |
| 13 | 是否恢复独立Items | 当前不推荐；材料展示可嵌入计算器，完整图鉴需另做产品决策 |
| 14 | 最适合MVP | 140资源、显式level/promotion、单Profile真实节点、Required EXP和分项成本，无自动库存优化 |

后续工程顺序：建立独立费用抽取与材料投影；接入显式进度输入与分项结果；完成共享节点/边界/特殊角色定向验证；最后再以客户端基准决定是否加入自动材料方案、净返还和通用替代库存抵扣。现有角色/光锥页面无需恢复普通Items域。

本轮唯一保留的新增文件：`docs/investigations/item-material-progression-cost-investigation.md`。临时脚本、分析JSON和远端HTML不保留；两份上游不修改，commit/push均未执行。

## 附录 A：每文件分类与可见性分布

以下为直接统计（DERIVED）。键`<absent>`表示原字段不存在，不等于false。零对象文件分布为空。

| 文件 | ItemMainType | ItemSubType | isVisible | InventoryDisplayTag |
| --- | --- | --- | --- | --- |
| ItemConfig.json | {"Virtual": 55, "Material": 748, "Usable": 1181, "Display": 252, "Mission": 683, "Pet": 22} | {"Virtual": 55, "Material": 116, "AvatarExp": 3, "EquipmentExp": 3, "RelicExp": 4, "WeeklyMonsterDrop": 11, "Gift": 53, "RelicSetShowOnly": 248, "RelicRarityShowOnly": 4, "TracePath": 61, "AvatarRank": 30, "CommonMonsterDrop": 34, "Mission": 683, "ComposeMaterial": 48, "Book": 355, "ChatBubble": 12, "PhoneTheme": 14, "TravelBrochurePaster": 262, "HeadIconFrame": 5, "PlayerOutfit": 16, "MuseumExhibit": 21, "MuseumStuff": 33, "AetherSkill": 32, "AetherSpirit": 19, "ChessRogueDiceSurface": 100, "RogueMedal": 10, "FightFestSkill": 12, "NormalPet": 5, "BlindBoxPet": 17, "PersonalCard": 6, "PhoneCase": 2, "MatchThreeV2": 1, "ForceOpitonalGift": 25, "PlatformBoundGift": 1, "Food": 213, "Formula": 95, "FindChest": 7, "PamSkin": 5, "PlanetFesItem": 180, "ElfRestaurantItem": 31, "HipplenOutfit": 17, "DiceCombatAvatar": 36, "DiceCombatDice": 50, "IdleLiveItem": 5, "PixAirMaterial": 1} | {"&lt;absent&gt;": 671, "True": 2270} | {"1": 2585, "3": 125, "2": 231} |
| ItemConfigAvatar.json | {"AvatarCard": 99} | {"AvatarCard": 99} | {"&lt;absent&gt;": 99} | {"1": 99} |
| ItemConfigAvatarLD.json | {"AvatarCard": 4} | {"AvatarCard": 4} | {"&lt;absent&gt;": 4} | {"1": 4} |
| ItemConfigAvatarPlayerIcLD.json | {"Usable": 4} | {"HeadIcon": 4} | {"True": 4} | {"1": 4} |
| ItemConfigAvatarPlayerIcon.json | {"Usable": 94} | {"HeadIcon": 94} | {"True": 94} | {"1": 94} |
| ItemConfigAvatarRank.json | {"Material": 94} | {"Eidolon": 94} | {"&lt;absent&gt;": 94} | {"1": 94} |
| ItemConfigAvatarRankLD.json | {"Material": 4} | {"Eidolon": 4} | {"&lt;absent&gt;": 4} | {"1": 4} |
| ItemConfigAvatarSkin.json | {"Usable": 8} | {"AvatarSkin": 8} | {"True": 8} | {"1": 8} |
| ItemConfigAvatarTest.json | {} | {} | {} | {} |
| ItemConfigAvatarTestRank.json | {} | {} | {} | {} |
| ItemConfigBadge.json | {"Usable": 21} | {"Badge": 21} | {"&lt;absent&gt;": 21} | {"1": 21} |
| ItemConfigBook.json | {"Usable": 762} | {"Book": 762} | {"True": 762} | {"1": 762} |
| ItemConfigDisk.json | {"Usable": 272} | {"MusicAlbum": 272} | {"True": 272} | {"3": 272} |
| ItemConfigEquipment.json | {"Equipment": 170} | {"Equipment": 170} | {"True": 170} | {"1": 170} |
| ItemConfigLD.json | {"Material": 69} | {"FateRinHougu": 69} | {"&lt;absent&gt;": 69} | {"2": 69} |
| ItemConfigPlayerRoomDynamic.json | {"Material": 79} | {"TrainPartyDiyMaterial": 79} | {"&lt;absent&gt;": 79} | {"1": 79} |
| ItemConfigRelic.json | {"Relic": 774} | {"Relic": 774} | {"True": 774} | {"1": 774} |
| ItemConfigTrainDynamic.json | {"Material": 52} | {"TrainPartyDiyMaterial": 52} | {"&lt;absent&gt;": 52} | {"1": 52} |

## 附录 B：范围 A 的全部资源

核心成本134项与六种经验道具共140项，全部来自ItemConfig，全部对应`icon/item/<ID>.png`，双语名来自本次pinned TextMap。

| ItemID | 中文名 | 英文名 | ItemSubType |
| --- | --- | --- | --- |
| 2 | 信用点 | Credit | Virtual |
| 211 | 旅情见闻 | Travel Encounters | AvatarExp |
| 212 | 冒险记录 | Adventure Log | AvatarExp |
| 213 | 漫游指南 | Traveler's Guide | AvatarExp |
| 221 | 稀薄以太 | Sparse Aether | EquipmentExp |
| 222 | 凝缩以太 | Condensed Aether | EquipmentExp |
| 223 | 提纯以太 | Refined Aether | EquipmentExp |
| 241 | 命运的足迹 | Tracks of Destiny | WeeklyMonsterDrop |
| 110111 | 破碎残刃 | Shattered Blade | TracePath |
| 110112 | 无生残刃 | Lifeless Blade | TracePath |
| 110113 | 净世残刃 | Worldbreaker Blade | TracePath |
| 110121 | 猎兽之矢 | Arrow of the Beast Hunter | TracePath |
| 110122 | 屠魔之矢 | Arrow of the Demon Slayer | TracePath |
| 110123 | 逐星之矢 | Arrow of the Starchaser | TracePath |
| 110131 | 灵感之钥 | Key of Inspiration | TracePath |
| 110132 | 启迪之钥 | Key of Knowledge | TracePath |
| 110133 | 智识之钥 | Key of Wisdom | TracePath |
| 110141 | 青铜的执着 | Endurance of Bronze | TracePath |
| 110142 | 寒铁的誓言 | Oath of Steel | TracePath |
| 110143 | 琥珀的坚守 | Safeguard of Amber | TracePath |
| 110151 | 黯淡黑曜 | Obsidian of Dread | TracePath |
| 110152 | 虚空黑曜 | Obsidian of Desolation | TracePath |
| 110153 | 沉沦黑曜 | Obsidian of Obsession | TracePath |
| 110161 | 谐乐小调 | Harmonic Tune | TracePath |
| 110162 | 家族颂歌 | Ancestral Hymn | TracePath |
| 110163 | 群星乐章 | Stellaris Symphony | TracePath |
| 110171 | 丰饶之种 | Seed of Abundance | TracePath |
| 110172 | 生命之芽 | Sprout of Life | TracePath |
| 110173 | 永恒之花 | Flower of Eternity | TracePath |
| 110181 | 步离犬牙 | Borisin Teeth | TracePath |
| 110182 | 狼毒锯牙 | Lupitoxin Sawteeth | TracePath |
| 110183 | 月狂獠牙 | Moon Rage Fang | TracePath |
| 110191 | 陨铁弹丸 | Meteoric Bullet | TracePath |
| 110192 | 命定死因 | Destined Expiration | TracePath |
| 110193 | 逆时一击 | Countertemporal Shot | TracePath |
| 110201 | 凌乱草图 | Rough Sketch | TracePath |
| 110202 | 动态线稿 | Dynamic Outlining | TracePath |
| 110203 | 精致色稿 | Exquisite Colored Draft | TracePath |
| 110211 | 散逸星砂 | Scattered Stardust | TracePath |
| 110212 | 流星棱晶 | Crystal Meteorites | TracePath |
| 110213 | 神体琥珀 | Divine Amber | TracePath |
| 110221 | 炽情之灵 | Fiery Spirit | TracePath |
| 110222 | 星火之精 | Starfire Essence | TracePath |
| 110223 | 焚天之魔 | Heaven Incinerator | TracePath |
| 110231 | 云际音符 | Firmament Note | TracePath |
| 110232 | 空际小节 | Celestial Section | TracePath |
| 110233 | 天外乐章 | Heavenly Melody | TracePath |
| 110241 | 异木种籽 | Alien Tree Seed | TracePath |
| 110242 | 滋长花蜜 | Nourishing Honey | TracePath |
| 110243 | 万相果实 | Myriad Fruit | TracePath |
| 110251 | 思量的种 | Bīja of Consciousness | TracePath |
| 110252 | 末那芽苗 | Seedling of Manas | TracePath |
| 110253 | 阿赖耶华 | Flower of Ālaya | TracePath |
| 110261 | 《绒绒号》手绘分镜稿 | <i>The Fluffy</i> Hand-drawn Storyboards | TracePath |
| 110262 | 《绒绒号》连载纪念刊 | <i>The Fluffy</i> Serialization Memorial Issue | TracePath |
| 110263 | 《绒绒号》典藏版合集 | <i>The Fluffy</i> Collector's Edition | TracePath |
| 110271 | 纷争血尘 | Grit of Strife | TracePath |
| 110272 | 战魂血珀 | Resin of Valor | TracePath |
| 110273 | 天谴血矛 | Lance of Retribution | TracePath |
| 110281 | 四相，过河照君 | Four Phases, Crossing the River to Check the King | TracePath |
| 110282 | 六合，王手飞车 | Sixen, King-Rook Fork | TracePath |
| 110283 | 万色，愚者自将 | Omnicolor, Fool's Own | TracePath |
| 110291 | 天体模型 | Celestial Globe | TracePath |
| 110292 | 星系框架 | Galaxy Framework | TracePath |
| 110293 | 银河沙盘 | Cosmic Sandpit | TracePath |
| 110311 | 法吉娜之泪 | Tear of Phagousa | TracePath |
| 110312 | 法吉娜之酒 | Wine of Phagousa | TracePath |
| 110313 | 法吉娜之心 | Heart of Phagousa | TracePath |
| 110400 | 深邃的星外质 | Enigmatic Ectostella | AvatarRank |
| 110401 | 铁狼碎齿 | Broken Teeth of Iron Wolf | AvatarRank |
| 110402 | 恒温晶壳 | Endotherm Chitin | AvatarRank |
| 110403 | 风雪之角 | Horn of Snow | AvatarRank |
| 110404 | 往日之影的雷冠 | Lightning Crown of the Past Shadow | AvatarRank |
| 110405 | 暴风之眼 | Storm Eye | AvatarRank |
| 110406 | 虚幻铸铁 | Void Cast Iron | AvatarRank |
| 110407 | 往日之影的金饰 | Golden Crown of the Past Shadow | AvatarRank |
| 110411 | 幽府通令 | Netherworld Token | AvatarRank |
| 110412 | 过热钢刃 | Searing Steel Blade | AvatarRank |
| 110413 | 苦寒晶壳 | Gelid Chitin | AvatarRank |
| 110414 | 炼形者雷枝 | Shape Shifter's Lightning Staff | AvatarRank |
| 110415 | 天人遗垢 | Ascendant Debris | AvatarRank |
| 110416 | 苍猿之钉 | Nail of the Ape | AvatarRank |
| 110417 | 镇灵敕符 | Suppressing Edict | AvatarRank |
| 110421 | 星际和平工作证 | IPC Work Permit | AvatarRank |
| 110422 | 忿火之心 | Raging Heart | AvatarRank |
| 110423 | 冷藏梦箱 | Dream Fridge | AvatarRank |
| 110424 | 兽棺之钉 | Nail of the Beast Coffin | AvatarRank |
| 110425 | 一杯酩酊的时代 | A Glass of the Besotted Era | AvatarRank |
| 110426 | 炙梦喷枪 | Dream Flamer | AvatarRank |
| 110427 | 一曲合弦的幻景 | Chordal Mirage | AvatarRank |
| 110431 | 侵略凝块 | Invasive Clot | AvatarRank |
| 110432 | 明辉日珥 | Radiant Prominence | AvatarRank |
| 110433 | 海妖残鳍 | Sea Siren's Torn Fin | AvatarRank |
| 110434 | 狂雷扫弦 | Thunder Strum | AvatarRank |
| 110435 | 暮晖烬蕾 | Charred Bud of Twilight | AvatarRank |
| 110436 | 暗帷月华 | Darkveil Moonlight | AvatarRank |
| 110437 | 纷争先兆 | Harbinger of Strife | AvatarRank |
| 110443 | 嗤笑丑面 | Sneering Harlequin | AvatarRank |
| 110501 | 毁灭者的末路 | Destroyer's Final Road | WeeklyMonsterDrop |
| 110502 | 守护者的悲愿 | Guardian's Lament | WeeklyMonsterDrop |
| 110503 | 无穷假身的遗恨 | Regret of Infinite Ochema | WeeklyMonsterDrop |
| 110504 | 蛀星孕灾的旧恶 | Past Evils of the Borehole Planet Disaster | WeeklyMonsterDrop |
| 110505 | 同愿的遗音 | Lost Echo of the Shared Wish | WeeklyMonsterDrop |
| 110506 | 吉光片羽 | Auspice Sliver | WeeklyMonsterDrop |
| 110507 | 阳雷的遥想 | Daythunder Anamnesis | WeeklyMonsterDrop |
| 110508 | 灭流绝溢的缄默 | Vanquished Flow's Reticence | WeeklyMonsterDrop |
| 110509 | 伪觉者的期许 | High Hopes of the Falsely Enlightened | WeeklyMonsterDrop |
| 111001 | 熄灭原核 | Extinguished Core | CommonMonsterDrop |
| 111002 | 微光原核 | Glimmering Core | CommonMonsterDrop |
| 111003 | 蠢动原核 | Squirming Core | CommonMonsterDrop |
| 111011 | 掠夺的本能 | Thief's Instinct | CommonMonsterDrop |
| 111012 | 篡改的野心 | Usurper's Scheme | CommonMonsterDrop |
| 111013 | 践踏的意志 | Conqueror's Will | CommonMonsterDrop |
| 112001 | 铁卫扣饰 | Silvermane Badge | CommonMonsterDrop |
| 112002 | 铁卫军徽 | Silvermane Insignia | CommonMonsterDrop |
| 112003 | 铁卫勋章 | Silvermane Medal | CommonMonsterDrop |
| 112011 | 古代零件 | Ancient Part | CommonMonsterDrop |
| 112012 | 古代转轴 | Ancient Spindle | CommonMonsterDrop |
| 112013 | 古代引擎 | Ancient Engine | CommonMonsterDrop |
| 113001 | 永寿幼芽 | Immortal Scionette | CommonMonsterDrop |
| 113002 | 永寿天华 | Immortal Aeroblossom | CommonMonsterDrop |
| 113003 | 永寿荣枝 | Immortal Lumintwig | CommonMonsterDrop |
| 113011 | 工造机杼 | Artifex's Module | CommonMonsterDrop |
| 113012 | 工造迴轮 | Artifex's Cogwheel | CommonMonsterDrop |
| 113013 | 工造浑心 | Artifex's Gyreheart | CommonMonsterDrop |
| 114001 | 蓄梦元件 | Dream Collection Component | CommonMonsterDrop |
| 114002 | 流梦阀门 | Dream Flow Valve | CommonMonsterDrop |
| 114003 | 造梦马达 | Dream Making Engine | CommonMonsterDrop |
| 114011 | 思绪末屑 | Tatters of Thought | CommonMonsterDrop |
| 114012 | 印象残晶 | Fragments of Impression | CommonMonsterDrop |
| 114013 | 欲念碎镜 | Shards of Desires | CommonMonsterDrop |
| 115001 | 恐惧踏碎血肉 | Fear-Stomped Flesh | CommonMonsterDrop |
| 115002 | 勇气撕裂胸膛 | Courage-Torn Chest | CommonMonsterDrop |
| 115003 | 荣耀洗礼身躯 | Glory-Aspersed Torso | CommonMonsterDrop |
| 115011 | 预兆似有若无 | Ethereal Omen | CommonMonsterDrop |
| 115012 | 悲鸣由远及近 | Echoing Wail | CommonMonsterDrop |
| 115013 | 哀叹漫无止息 | Eternal Lament | CommonMonsterDrop |
| 116001 | 童真蜡笔 | Whimsy Wax | CommonMonsterDrop |
| 116002 | 造梦蘸钢 | Dreamweave Steel | CommonMonsterDrop |
| 116003 | 梦现管锥 | Lucid Awl | CommonMonsterDrop |

## 附录 C：复现命令与实际扫描源码

从HSR-Database根目录执行，只读上游；将下面代码临时保存为 `.tmp-progression-audit.py` 后运行 `python .tmp-progression-audit.py`，会在网站仓库内写临时分析JSON，核查后删除两个临时文件。只有标准库，不安装依赖。脚本会产生本报告的规模、冲突、材料集合、双语覆盖、代表角色步骤与性能投影；成本案例输出中的节点steps字段保留每一级原费用。字节统计使用UTF-8紧凑JSON/gzip level9；毫秒时间随设备/缓存波动。

```powershell
git branch --show-current
git status --short
git -C ../TurnBasedGameData rev-parse HEAD
git -C ../StarRailRes rev-parse HEAD
git -C ../TurnBasedGameData log -1 --format=%s
git log --all --oneline --reverse
git ls-tree -r --name-only c828665
git ls-tree -r --name-only 5a06e8d
python .tmp-progression-audit.py
git -C ../TurnBasedGameData status --porcelain
git -C ../StarRailRes status --porcelain
```

```python

import collections as C
import gzip, json, pathlib, re, time

ROOT = pathlib.Path(__file__).resolve().parent
DATA = ROOT.parent / 'TurnBasedGameData'
ASSETS = ROOT.parent / 'StarRailRes/icon/item'
started = time.perf_counter()
def raw(name):
    return json.loads((DATA / 'ExcelOutput' / (name + '.json')).read_text(encoding='utf-8'))
def rows(name):
    v = raw(name)
    return [x for x in (v.values() if isinstance(v, dict) else v) if isinstance(x, dict)]
def dist(rs, key):
    return dict(C.Counter(str(x.get(key, '<absent>')) for x in rs))
def add(rs, field):
    result = C.Counter()
    for row in rs:
        for m in row.get(field, []): result[m['ItemID']] += m['ItemNum']
    return dict(sorted(result.items()))

# XXH64 seed=0, matching the existing shared resolver; integers never use float.
MASK=(1<<64)-1
P1,P2,P3,P4,P5=11400714785074694791,14029467366897019727,1609587929392839161,9650029242287828579,2870177450012600261
def rot(v,n): return ((v<<n)|(v>>(64-n)))&MASK
def rnd(a,b): return (rot((a+b*P2)&MASK,31)*P1)&MASK
def xxh(s):
    b=s.encode();n=len(b);i=0
    if n>=32:
        vs=[(P1+P2)&MASK,P2,0,(-P1)&MASK]
        while i<=n-32:
            for k in range(4):vs[k]=rnd(vs[k],int.from_bytes(b[i+8*k:i+8*k+8],'little'))
            i+=32
        h=sum(rot(v,k) for v,k in zip(vs,[1,7,12,18]))&MASK
        for v in vs:h=((h^rnd(0,v))*P1+P4)&MASK
    else:h=P5
    h=(h+n)&MASK
    while i<=n-8:
        h=(rot(h^rnd(0,int.from_bytes(b[i:i+8],'little')),27)*P1+P4)&MASK;i+=8
    if i<=n-4:
        h=(rot(h^(int.from_bytes(b[i:i+4],'little')*P1&MASK),23)*P2+P3)&MASK;i+=4
    while i<n:h=(rot(h^(b[i]*P5&MASK),11)*P1)&MASK;i+=1
    h^=h>>33;h=h*P2&MASK;h^=h>>29;h=h*P3&MASK;h^=h>>32
    return str(h)
def hashof(v):
    if isinstance(v,dict):return str(v.get('Hash',''))
    if isinstance(v,str) and v:return xxh(v)
    return ''

family={p.stem:rows(p.stem) for p in sorted((DATA/'ExcelOutput').glob('ItemConfig*.json'))}
byid=C.defaultdict(list)
for name,rs in family.items():
    for row in rs:byid[row['ID']].append((name,row))
hashes={hashof(row.get(f)) for rs in family.values() for row in rs for f in ['ItemName','ItemDesc','ItemBGDesc']}
tables={n:rows(n) for n in ['AvatarConfig','AvatarConfigLD','AvatarConfigEnhanced','AvatarPromotionConfig','AvatarPromotionConfigLD','AvatarSkillTreeConfig','AvatarSkillTreeConfigLD','EquipmentConfig','EquipmentPromotionConfig','ExpType','EquipmentExpType','AvatarExpItemConfig','EquipmentExpItemConfig','AvatarRankConfig','AvatarRankConfigLD','AvatarServantConfig','MultiplePathAvatarConfig','ItemComefrom','ItemComposeConfig','AvatarSpecialSkillTree']}
for n in ['AvatarConfig','AvatarConfigLD','EquipmentConfig']:
    for row in tables[n]:
        for f in ['AvatarName','EquipmentName']:hashes.add(hashof(row.get(f)))
hashes.discard('')
texts={}
for locale,code in [('zh-CN','CHS'),('en','EN')]:
    kept={}
    with (DATA/'TextMap'/('TextMap'+code+'.json')).open(encoding='utf-8') as fh:
        for line in fh:
            m=re.match(r'\s*"(\d+)":\s*(".*")\s*,?\s*$',line)
            if m and m[1] in hashes:kept[m[1]]=json.loads(m[2])
    texts[locale]=kept
def text(row,f,locale='zh-CN'):return texts[locale].get(hashof(row.get(f)),'')
icons={p.name:p for p in ASSETS.iterdir() if p.is_file()}
def icon(row):
    # Strong ID match first; source basename as independently reported fallback.
    ident=str(row['ID'])+'.png';base=pathlib.PurePosixPath(row.get('ItemIconPath','')).name
    return ident if ident in icons else base if base in icons else None
inv=[]
for name,rs in family.items():
    r=raw(name)
    inv.append({'file':name+'.json','bytes':(DATA/'ExcelOutput'/(name+'.json')).stat().st_size,'slots':len(r),'records':len(rs),'unique':len({x['ID'] for x in rs}),'main':dist(rs,'ItemMainType'),'sub':dist(rs,'ItemSubType'),'visibility':{k:dist(rs,k) for k in ['Release','isVisible','InventoryDisplayTag']},'rawCoverage':{f:sum(bool(x.get(f)) for x in rs) for f in ['ItemName','ItemDesc','ItemBGDesc','ItemIconPath','ItemFigureIconPath']},'textCoverage':{loc:{f:sum(bool(text(x,f,loc).strip()) for x in rs) for f in ['ItemName','ItemDesc','ItemBGDesc']} for loc in texts},'iconCoverage':sum(icon(x)!=None for x in rs)})
overlaps=[]
for ident,entries in byid.items():
    if len(entries)>1:
        a=entries[0][1]
        overlaps.append({'id':ident,'sources':[n for n,r in entries],'identical':all(a==r for n,r in entries),'diffFields':sorted({k for n,r in entries[1:] for k in set(a)|set(r) if a.get(k)!=r.get(k)})})
cost_sources={'AvatarPromotionConfig':'PromotionCostList','AvatarPromotionConfigLD':'PromotionCostList','AvatarSkillTreeConfig':'MaterialList','AvatarSkillTreeConfigLD':'MaterialList','EquipmentPromotionConfig':'PromotionCostList'}
cost_ids={x['ItemID'] for n,f in cost_sources.items() for row in tables[n] for x in row.get(f,[])}
exp_ids={x['ItemID'] for n in ['AvatarExpItemConfig','EquipmentExpItemConfig'] for x in tables[n]}
material_ids=cost_ids|exp_ids
canon={i:entries[0][1] for i,entries in byid.items()}
def coverage(ids):
    return {'ids':sorted(ids),'count':len(ids),'resolved':sum(i in canon for i in ids),'zh':sum(i in canon and bool(text(canon[i],'ItemName').strip()) for i in ids),'en':sum(i in canon and bool(text(canon[i],'ItemName','en').strip()) for i in ids),'paths':sum(i in canon and bool(canon[i].get('ItemIconPath')) for i in ids),'icons':sum(i in canon and icon(canon[i])!=None for i in ids),'idIcons':sum(str(i)+'.png' in icons for i in ids),'missing':{'record':[i for i in sorted(ids) if i not in canon],'zh':[i for i in sorted(ids) if i not in canon or not text(canon[i],'ItemName').strip()],'en':[i for i in sorted(ids) if i not in canon or not text(canon[i],'ItemName','en').strip()],'icon':[i for i in sorted(ids) if i not in canon or icon(canon[i])==None]}}
catalog=json.loads((ROOT/'src/lib/generated/views/zh-CN/catalogs/characters.json').read_text(encoding='utf-8'))
catalog_ids={int(x['id']) for x in catalog}
cone_catalog=json.loads((ROOT/'src/lib/generated/views/zh-CN/catalogs/light-cones.json').read_text(encoding='utf-8'))
cone_ids={int(x['id']) for x in cone_catalog}
public_cost={x['ItemID'] for n,f in cost_sources.items() for row in tables[n] if row.get('AvatarID') in catalog_ids or row.get('EquipmentID') in cone_ids for x in row.get(f,[])}
chars=tables['AvatarConfig']+tables['AvatarConfigLD']
promos=tables['AvatarPromotionConfig']+tables['AvatarPromotionConfigLD']
trees=tables['AvatarSkillTreeConfig']+tables['AvatarSkillTreeConfigLD']
case=[]
for ident in [1001,1102,1213,1212,1407,8007,1014,1406,8009,1501]:
    a=next(x for x in chars if x['AvatarID']==ident)
    ps=sorted([x for x in promos if x['AvatarID']==ident],key=lambda x:x.get('Promotion',0))
    exp=sum(x.get('Exp',0) for x in tables['ExpType'] if x['TypeID']==a['ExpGroup'] and 1<=x['Level']<80)
    profiles=[]
    for enhanced in sorted({x.get('EnhancedID',0) for x in trees if x['AvatarID']==ident}):
        ts=[x for x in trees if x['AvatarID']==ident and x.get('EnhancedID',0)==enhanced]
        groups=C.defaultdict(list)
        for row in ts:groups[row['PointID']].append(row)
        nodes=[]
        for point,rs in groups.items():
            first=min(rs,key=lambda x:x.get('Level',1));levels=sorted(x.get('Level',1) for x in rs)
            nodes.append({'point':point,'type':first['PointType'],'max':first.get('MaxLevel',1),'levels':levels,'default':first.get('DefaultUnlock',False),'skills':first['LevelUpSkillID'],'pre':first['PrePoint'],'cost':add(rs,'MaterialList'),'steps':[{'level':x.get('Level',1),'limit':x.get('AvatarPromotionLimit',0),'cost':x['MaterialList']} for x in sorted(rs,key=lambda x:x.get('Level',1))]})
        profiles.append({'enhanced':enhanced,'nodes':nodes,'total':add(ts,'MaterialList'),'types':dist(ts,'PointType'),'rowCount':len(ts)})
    case.append({'id':ident,'name':text(a,'AvatarName'),'rarity':a['Rarity'],'expGroup':a['ExpGroup'],'exp':exp,'promotion':add(ps,'PromotionCostList'),'promotionSteps':[{'stage':x.get('Promotion',0),'max':x['MaxLevel'],'cost':x['PromotionCostList'],'player':x.get('PlayerLevelRequire'),'world':x.get('WorldLevelRequire')} for x in ps],'profiles':profiles})
lc=[]
for ident in [20000,21000,23000]:
    a=next(x for x in tables['EquipmentConfig'] if x['EquipmentID']==ident)
    ps=[x for x in tables['EquipmentPromotionConfig'] if x['EquipmentID']==ident]
    exp=sum(x.get('Exp',0) for x in tables['EquipmentExpType'] if x['ExpType']==a['ExpType'] and x['Level']<80)
    lc.append({'id':ident,'name':text(a,'EquipmentName'),'expType':a['ExpType'],'exp':exp,'promotion':add(ps,'PromotionCostList'),'rankCost':a.get('RankUpCostList'), 'feedExp':a.get('ExpProvide'),'feedCoin':a.get('CoinCost')})
exp_groups={str(g):{'rows':len([x for x in tables['ExpType'] if x['TypeID']==g]),'to80':sum(x.get('Exp',0) for x in tables['ExpType'] if x['TypeID']==g and x['Level']<80),'blocks':{str(lo)+'-'+str(hi):sum(x.get('Exp',0) for x in tables['ExpType'] if x['TypeID']==g and lo<=x['Level']<hi) for lo,hi in [(1,20),(20,30),(30,40),(40,50),(50,60),(60,70),(70,80)]}} for g in [1,2]}
# Candidate B is explicitly a structural superset, not proof of player visibility.
subtypes={canon[i]['ItemSubType'] for i in material_ids if i in canon}
candidateB=material_ids|{i for i,r in canon.items() if r.get('ItemSubType') in subtypes-{'Virtual'} and r.get('isVisible') is True}
candidateC={i for i,r in canon.items() if r.get('InventoryDisplayTag',0)>0 and text(r,'ItemName').strip() and text(r,'ItemName','en').strip()}
sizes=[]
for label,ids in [('A',material_ids),('B',candidateB),('C',candidateC)]:
    locs={}
    for loc in texts:
        t0=time.perf_counter(); projected=[{'id':str(i),'name':text(canon[i],'ItemName',loc),'description':text(canon[i],'ItemDesc',loc),'mainType':canon[i].get('ItemMainType'),'subType':canon[i].get('ItemSubType'),'rarity':canon[i].get('Rarity'),'icon':icon(canon[i])} for i in sorted(ids) if i in canon]
        b=json.dumps(projected,ensure_ascii=False,separators=(',',':')).encode();gz=gzip.compress(b,compresslevel=9,mtime=0)
        locs[loc]={'json':len(b),'gzip':len(gz),'projectionMs':round((time.perf_counter()-t0)*1000,2)}
    filenames={icon(canon[i]) for i in ids if i in canon and icon(canon[i])}
    sizes.append({'scope':label,'count':len(ids),'locales':locs,'images':len(filenames),'imageBytes':sum(icons[n].stat().st_size for n in filenames),'missingIcons':coverage(ids)['missing']['icon']})
paid=[x for x in trees if x.get('MaterialList')]
dupes=C.Counter((x['PointID'],x.get('EnhancedID',0),x.get('Level',1)) for x in trees)
iconOwners=C.defaultdict(list)
for i,r in canon.items():
    if icon(r):iconOwners[icon(r)].append(i)
result={'inventory':inv,'overlaps':overlaps,'slots':sum(x['slots'] for x in inv),'records':sum(x['records'] for x in inv),'unique':len(byid),'costCoverage':coverage(cost_ids),'materialCoverage':coverage(material_ids),'publicCostCoverage':coverage(public_cost),'publicMaterialCoverage':coverage(public_cost|exp_ids),'allCoverage':coverage(set(canon)),'sourceCostIds':{n:len({m['ItemID'] for r in tables[n] for m in r.get(f,[])}) for n,f in cost_sources.items()},'materials':[{'id':i,'name':text(canon[i],'ItemName') if i in canon else '', 'en':text(canon[i],'ItemName','en') if i in canon else '', 'type':canon[i].get('ItemSubType') if i in canon else '', 'icon':icon(canon[i]) if i in canon else None} for i in sorted(material_ids)],'case':case,'lightCones':lc,'expGroups':exp_groups,'avatarExpGroups':dist(chars,'ExpGroup'),'equipmentExpGroups':dist(tables['EquipmentConfig'],'ExpType'),'treeTypes':dist(trees,'PointType'),'treeRows':len(trees),'duplicateTreeKeys':[list(k)+[v] for k,v in dupes.items() if v>1],'treeConstraints':{f:dist(trees,f) for f in ['MaxLevel','DefaultUnlock','EnhancedID','AvatarPromotionLimit']},'familySubtypes':{k:sum(r.get('ItemSubType')==k for r in canon.values()) for k in sorted({r.get('ItemSubType') for r in canon.values()})},'candidateBSubtypes':sorted(subtypes),'sizes':sizes,'icons':{'files':len(icons),'uniqueStems':len({pathlib.Path(n).stem for n in icons}),'numeric':sum(pathlib.Path(n).stem.isdigit() for n in icons),'idMatches':sum(str(i)+'.png' in icons for i in canon),'pathMatches':sum(pathlib.PurePosixPath(r.get('ItemIconPath','')).name in icons for r in canon.values()),'multiOwners':{n:v for n,v in iconOwners.items() if len(v)>1}},'tableCounts':{n:len(rs) for n,rs in tables.items()},'catalogCounts':{'characters':len(catalog),'lightCones':len(cone_catalog)},'scanSeconds':round(time.perf_counter()-started,3)}
(ROOT/'.tmp-progression-audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:result[k] for k in ['slots','records','unique','sourceCostIds','avatarExpGroups','equipmentExpGroups','expGroups','tableCounts','catalogCounts','scanSeconds']},ensure_ascii=False,indent=2))
for k in ['costCoverage','materialCoverage','publicMaterialCoverage','allCoverage']:print(k,json.dumps({a:b for a,b in result[k].items() if a not in ['ids','missing']},ensure_ascii=False))
print('overlaps',len(overlaps),C.Counter((tuple(x['sources']),x['identical']) for x in overlaps))
print('sizes',json.dumps([{k:v for k,v in x.items() if k!='missingIcons'} for x in sizes],ensure_ascii=False))


```

以下为独立结构和区间检查（在同一目录，扫描脚本存在时执行）：

```python
import runpy, contextlib, io, collections as C
with contextlib.redirect_stdout(io.StringIO()):
    a = runpy.run_path(".tmp-progression-audit.py")
assert a["xxh"]("RelicDesc_1012") == "12720770977431568614"
assert a["xxh"]("ItemName_291001") == "14736433815376377576"
for name, key in [("AvatarPromotionConfig", "AvatarID"),
                  ("AvatarPromotionConfigLD", "AvatarID"),
                  ("EquipmentPromotionConfig", "EquipmentID")]:
    groups = C.defaultdict(list)
    for row in a["tables"][name]:
        groups[row[key]].append(row)
    for rs in groups.values():
        rs.sort(key=lambda x: x.get("Promotion", 0))
        assert [x.get("Promotion", 0) for x in rs] == list(range(7))
        assert [x["MaxLevel"] for x in rs] == [20,30,40,50,60,70,80]
        assert rs[-1]["PromotionCostList"] == []
        for mid in range(7):
            assert (C.Counter(a["add"](rs[:mid], "PromotionCostList")) +
                    C.Counter(a["add"](rs[mid:6], "PromotionCostList")) ==
                    C.Counter(a["add"](rs[:6], "PromotionCostList")))
groups = C.defaultdict(list)
keys = [(r["PointID"],r.get("EnhancedID",0),r["Level"]) for r in a["trees"]]
assert len(keys) == len(set(keys))
for row in a["trees"]:
    groups[(row["AvatarID"],row.get("EnhancedID",0),row["PointID"])].append(row)
for key, rs in groups.items():
    rs.sort(key=lambda x: x["Level"])
    assert [r["Level"] for r in rs] == list(range(1,rs[0]["MaxLevel"]+1))
    assert all(m["ItemNum"] > 0 for r in rs for m in r["MaterialList"])
    assert not (rs[0].get("DefaultUnlock") and rs[0]["MaterialList"])
    assert all((key[0],key[1],p) in groups for p in rs[0]["PrePoint"])
    for mid in range(len(rs)+1):
        assert (C.Counter(a["add"](rs[:mid], "MaterialList")) +
                C.Counter(a["add"](rs[mid:], "MaterialList")) ==
                C.Counter(a["add"](rs, "MaterialList")))
print("PASS: promotion chains, node ranges, keys, prerequisites, additivity")
```
