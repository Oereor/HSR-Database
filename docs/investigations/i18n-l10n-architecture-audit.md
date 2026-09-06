# i18n / l10n Architecture Audit

调查日期：2026-09-04。任务依据：`Refactor-15/I18n-L10n-Investigation-01.md`。这是清理后基线上的只读调查与未来实施建议，不是 i18n 实施记录。所有 MB 均为十进制 MB，所有文件体积均为未压缩 UTF-8 / 文件系统字节；没有把字符数、网络传输量和发布体积混为一谈。

## 1. Executive Summary

推荐网站 locale 使用 `zh-CN`、`en`；中文保留现有根路径，英文采用 `/en/*`；URL 是唯一运行时语言来源。推荐 **Paraglide JS 处理网站消息，按领域采用 hybrid generated artifacts**：小型角色／光锥／遗器保留每语言成品，大型 Enemy／Endgame 拆为中性 core 与文本 overlay，在服务端加载／prerender 边界组合为当前页面所需数据。游戏文本继续来自同一 pinned commit 的 TextMap，绝不导入 UI 消息库。

推荐先解决身份和业务逻辑对中文的依赖，再增加语言。当前真正的阻塞包括 Endgame 名称哈希 identity、角色多命途命名与 official alias 中文断言、敌人技能类型／标签的中文反向映射，以及“特殊效果”中文触发判断。已有角色技能类别主要由 `AttackType` / `SkillTriggerKey` 驱动，应保留这条正确边界。

本轮实测 generated 为 **182,797,133 bytes / 968 JSON**；其中 Enemy details 与 Endgame 合计 **171,199,082 bytes，93.65%**。简单双份复制预计 generated 达 **364.7–371.2 MB**；隔离切分原型的 hybrid 估算为 **210.0–216.6 MB**，正式设计预留为 **210–225 MB**。但这不是发布体积收益：当前 **436,910,460 bytes** 的 build 中，HTML 已占 **163,498,978 bytes**，`__data.json` 等 JSON 占 **127,168,222 bytes**。双语言完整静态输出仍预计 **735–790 MB**，不能声称 overlay 消除了 HTML 与页面序列化数据重复。

现有 1,076 个内容页面建议两种语言均 prerender，新增 1,076 个英文页面。搜索建议当前语言优先、另一语言次级召回，保留中文既有九级排序的相对顺序；按语言发布标签索引，中性 target / locator 索引共享。人工 player aliases 的现有 **97 IDs / 313 条**归属中文目录，字节保持原样；官方 snapshot 则按语言生成。

本轮只新增本报告。未安装依赖、未生成正式 EN 数据、未执行生产构建，也未修改 schema、路由、metadata、CSS、workflow 或两个上游仓库。测量与原型只写入被忽略的 `data/audit/i18n/`。

## 2. Current Localization Architecture

### 基线与证据来源

| 仓库              | 分支    | HEAD                                       | 调查开始状态 |
| ----------------- | ------- | ------------------------------------------ | ------------ |
| HSR-Database      | develop | `3e713d1a096134374c80271f9c36b3258a1c9fa0` | clean        |
| TurnBasedGameData | main    | `8cdb905dc2f8e6fffa9be4eb07af3e34435d6091` | clean        |
| StarRailRes       | master  | `d226befe3db13f2ec15f4161d5f34b1b607643fe` | clean        |

实际安装版本：SvelteKit **2.70.3**，Svelte **5.57.0**，Vite **7.2.4**，adapter-static **3.0.10**，vite-plugin-svelte **7.3.0**，TypeScript **5.9.3**。以安装包和 lockfile 为准，不能把 `package.json` 的 `latest` 当成版本。

前置资料包括 `AGENTS.md`、`docs/investigations/technical-debt-generated-data-audit.md`、同目录 generated-fields / UI inventory CSV、`docs/search-v2.md`、`docs/vercel-deployment-foundation.md`。前轮统计只作交叉核验；本报告重新读取当前 generated / build 并计算大小和哈希。前轮测试记录与本轮执行状态分开列于第 19 节。

当前完整链：

```text
upstream.lock.json → deployment/prepare.ts → pinned sparse checkout
ExcelOutput / Config → raw.ts（lossless Hash/Value）
TextMapCHS.json → localization.ts → TextResolver
  → character-names / skills / text / extra-effects / maze-buffs / endgame
  → sync.ts → catalogs、details、Endgame、homepage、manifest、search-inputs
official snapshot + player aliases + search-inputs → search-documents.ts → search.json
server/generated.ts / server/endgame.ts → +page.server.ts / +server.ts
  → prerender HTML、__data.json、Endgame occurrence shards
GameText / DescriptionText / 页面组件 → 浏览器
```

`raw.ts` 将 `Hash` 与 fixed-point `Value` 保留为十进制字符串；`localization.ts` 的 symbolic key 使用 xxhash64、seed 0，输出十进制 hash。hash 与语言无关，查找出的字符串与语言有关。不要通过 JS `number` 传递文本 hash。当前 `loadTextMap`、`paths.ts` 必需文件、deployment sparse list 都写死 CHS；manifest schema **36** / language **CHS**，Endgame dataset schema **22**，搜索 schema **2**，occurrence shard schema **1**。

`getSearchIndex` 是单 Promise；Endgame dataset cache 按 mode、group cache 按 mode/group、enemy reference cache 按 monster/template。它们目前成立是因为只有一种语言；以后文本或视图缓存必须加 locale 与 artifact digest。不能仅改 loader 路径而保留这些缓存键。

## 3. Locale Inventory

| 用途                   | 中文          | 英文          | 规则                                     |
| ---------------------- | ------------- | ------------- | ---------------------------------------- |
| 网站 locale / 消息目录 | `zh-CN`       | `en`          | 显式联合类型，仅支持这两种               |
| URL prefix             | 空            | `/en`         | 不创建 `/chs`、`/zh-CN` 重复页面         |
| 上游 TextMap code      | `CHS`         | `EN`          | 映射表转换，不能直接拼网站 locale 文件名 |
| HTML lang / hreflang   | `zh-CN`       | `en`          | HTML 与页面文本一致                      |
| 数字／日期 formatter   | `zh-CN`       | `en-US`       | 英文无区域 URL；格式约定显式记录         |
| 游戏时间基准           | Asia/Shanghai | Asia/Shanghai | 语言切换不转换赛期实际时间               |

本地完整 TextMapCHS 为 **51,518,878 bytes / 465,910 keys**；EN 为 **58,055,681 bytes / 465,914 keys**。交集 465,909 keys，CHS-only 1，EN-only 5，EN 空字符串 0。交集字符串的 JSON scalar 字节比为 **44,823,999 / 38,215,322 = 1.173**，整个文件比为 1.127。这是全 TextMap 的分布，不是本网站页面的确定增长率。

仓库还存在 CHT、DE、ES、FR、ID、JP、PT、VI 和拆分的 KR / RU / TH 等；本轮不选择后续语言，也不假定所有 locale 都是单文件。现有网站只消费 CHS。两种目标语言必须取同一 upstream commit；不能用 latest EN 配 pinned CHS。`TextMapMainEN` 不是替代当前主 TextMap 的入口。

实际配置名称覆盖：角色 97、光锥 169、遗器 60、敌人 628 的对应 name hash 均在 EN 中存在。四类总数 **954**。技能名称去重为 `(SkillID, nameHash)` 后，AvatarSkillConfig 702 项中 CHS/EN 都缺 4，MonsterSkillConfig 3,548 项中两者都缺 397；这些是原始配置范围，包含隐藏／内部条目，不等于网站缺失率，且不覆盖所有 LD／servant 技能来源。

扩展只读扫描使用现有 lossless raw reader：可解析表中共 730,325 个 Hash reference、443,963 个 distinct hashes；CHS 缺 7,747，EN 缺 7,746。970 张表包含 Hash reference。14 个非本网站核心常量表含重复 JSON key，reader 拒绝解析，已单列，不将扫描称为完整上游验证。CHS 有值而 EN 缺失的实际引用仅发现 `12685624858240681224`（“一支试管”），不在本次四类 canonical name 样本中。全表缺失量不能直接作为阻止网站生成的指标，应按实际 producer 调用集验证。

## 4. Locale-Neutral vs Localized Data

下表说明未来边界，不删除任何现有字段。代码字段和参数是稳定键；面向用户的标签不是稳定键。对象展开、通用 GameText、SSR 序列化也是消费者，不能只搜索 `.name`。

| 领域／artifact                   | locale-neutral                                                                                                                                     | locale-dependent / mixed                                                                                                                                     | producer → consumer 与切分边界                                                                                                                |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Character catalog/detail         | AvatarID、rarity、path/element code、baseStats、装备推荐 IDs、profile/skill/trace/rank 关系、level/progression/scaling indexes、combatMeta 数字    | name/fullName/description、pathName/elementName、skill/trace/eidolon/specialEffect 文本；`combatMeta.specialResource` 为文本，不能把 combatMeta 整对象当中性 | `sync.ts`、`character-names.ts`、`skills.ts` → `getCatalog/getDetail` → CharacterCatalogPage / DetailPage / SkillVariantView / TraceCardPanel |
| Character base/enhanced profiles | base/enhanced 归属、技能类别、层级和关系                                                                                                           | displayLabel、variant.type、levels.description、descriptionTokens 的 value、增强说明                                                                         | category 用结构化配置，label 延迟到 locale；不合并 base/enhanced                                                                              |
| Light Cone                       | EquipmentID、rarity、path code、promotion stats、叠影等级与参数关系                                                                                | name/description/story、passive.name、每等级文本／tokens                                                                                                     | EquipmentConfig / EquipmentSkillConfig / 文本 resolver → detail / SuperimpositionPanel                                                        |
| Relic                            | SetID、category、required 件数、piece ID/slot、属性 code、推荐关系                                                                                 | set/piece 名称、effects.description、sources 文本、typeName                                                                                                  | RelicSetConfig / ItemConfig / resolver → RelicDetailPage / RelicOverviewCard；来源文本不是资源路径                                            |
| relic-properties                 | PropertyType、iconKey、可主／副词条标记、数值规则                                                                                                  | name                                                                                                                                                         | generator → getRelicProperties → 筛选与推荐；按 code join                                                                                     |
| Enemy                            | MonsterTemplateID、所有 MonsterID、defaultMonsterId、phase、weakness element、resistance code/value、levels 1–100 stats、召唤关系、HP 与韧性精确值 | name、typeName、weakness.name、技能名称／描述／标签、specialResistance.label                                                                                 | MonsterTemplateConfig / MonsterConfig / MonsterSkillConfig → enemy-detail + sync → EnemyDetailPage / catalog / Endgame reference              |
| Enemy skills                     | phase membership、skill IDs、damage type、结构化 kind/tag code                                                                                     | kindLabel/tag.label、descriptionTokens；当前 kind/tag 生成仍依赖 CHS，拆分前须修复                                                                           | `normalizeEnemySkillKind/Tag` 是阻塞，见第 15 节                                                                                              |
| Endgame 四模式                   | mode/group/config/event/stage/monster IDs、slot/wave、spawn pool、schedule 原值、level/elite、HP 乘数、mechanics 布尔／provenance、参数            | group/encounter/enemy 名称、maze buff / cacophony / axiom / boss guide / trait 文本；`dateLabel`、status label 属视图                                        | `endgame.ts` + maze-buffs/as-boss-guides → datasets → buildGroupView/buildPeriodView → season / enemy cards                                   |
| Homepage                         | gachaId、avatarId/equipmentId、顺序                                                                                                                | generated homepage 本身不含名称；首页展示由 locale catalog join                                                                                              | `homepage.ts` → homepage.json → root `+page.server.ts` resolveEntries → 最近角色／光锥                                                        |
| Manifest / public meta           | source commit、counts、route IDs、schema、游戏版本                                                                                                 | language/locale 是输出描述；不是可翻译文案                                                                                                                   | sync → getManifest/root layout、sitemap、validator、部署验证；root manifest 改为中性索引，locale manifest 单列                                |
| search-inputs                    | entity IDs、official provenance、Endgame locators                                                                                                  | canonical/official names；当前 entryId 为中文名字 hash，属于 mixed identity                                                                                  | sync → search-documents；它是构建缓存而非浏览器接口                                                                                           |
| search.json                      | target IDs、document keys、locator 索引、算法版本                                                                                                  | canonical/official/player labels、显示语言与命中证据                                                                                                         | search-documents → search page server load → createGlobalSearchService；不是 UI message catalog                                               |
| occurrence shards                | 具体 locator、monster/template、period IDs、战斗数值                                                                                               | name、period.name/dateLabel、enemyHref 等视图字段                                                                                                            | server/endgame.getEndgameOccurrenceShard → `/generated/endgame-occurrences/[entryId]` → expander；最终发布需 locale 或投影视图分层            |
| 图像／字体／链接                 | ID-based 图像与大部分代码路径、纹理、icon code                                                                                                     | image alt、href 的 locale prefix、品牌与版权说明                                                                                                             | assets pipeline 继续共享；不能复制整个 StarRailRes 或给图片目录强加语言                                                                       |

DescriptionToken 是 **mixed**：token.type、icon identity、color/underline/italic/scaling 标记可以中性，value 和 token 的分段／顺序随语言变化。不要尝试把 CHS token 的第 N 段直接替换为 EN 第 N 段。正确 overlay 是以 skill variant / level / source field 为键的完整本地化 token 序列，参数从 raw/core 生成输入取得；上一轮删除的 `LevelledDescription.params` 不应重新加回浏览器输出。

### 实际字节与统计口径

隔离原型读取全部 968 JSON，按已知 name/description/label/story 等 scalar 和 descriptionTokens.value 分类；未知中文字段单列。`N` 为其余 scalar，`L` 为已识别文本 scalar，`U` 为待人工归类，`S = total − N − L − U` 为 JSON 键／标点／结构开销。字符串 scalar 计入引号和转义，文件体积含末尾换行。这是可复算的序列化计量，不以“包含中文”直接认定整个对象本地化。

| Artifact family                                    |    总 bytes |         L |          N |     U |
| -------------------------------------------------- | ----------: | --------: | ---------: | ----: |
| `src/lib/generated/catalogs/characters.json`       |      31,477 |    20,774 |      2,262 |     0 |
| `src/lib/generated/catalogs/enemies.json`          |     270,606 |   166,650 |     26,471 |     0 |
| `src/lib/generated/catalogs/light-cones.json`      |      33,098 |    20,089 |      2,698 |     0 |
| `src/lib/generated/catalogs/relic-properties.json` |       2,940 |       348 |      1,006 |     0 |
| `src/lib/generated/catalogs/relics.json`           |      19,901 |    12,335 |      1,652 |     0 |
| `src/lib/generated/details/characters/*`           |   8,057,140 | 4,388,520 |  1,018,049 | 6,623 |
| `src/lib/generated/details/enemies/*`              | 128,678,999 | 3,190,437 | 44,977,867 |     0 |
| `src/lib/generated/details/light-cones/*`          |     972,407 |   445,992 |    137,028 |     0 |
| `src/lib/generated/details/relics/*`               |      76,687 |    48,331 |      4,612 | 5,274 |
| `src/lib/generated/endgame/aa.json`                |     485,818 |    30,637 |    255,485 |     0 |
| `src/lib/generated/endgame/as.json`                |   1,075,515 |   196,161 |    523,203 |     0 |
| `src/lib/generated/endgame/moc.json`               |  13,484,263 |   374,781 |  6,973,728 |     0 |
| `src/lib/generated/endgame/pf.json`                |  27,474,487 |   389,892 | 12,953,014 |     0 |
| `src/lib/generated/homepage.json`                  |         492 |         0 |        127 |     0 |
| `src/lib/generated/manifest.json`                  |       9,436 |         0 |      7,918 |     0 |
| `src/lib/generated/search-inputs.json`             |   1,003,011 |    24,585 |    127,910 |     0 |
| `static/generated/meta.json`                       |       9,436 |         0 |      7,918 |     0 |
| `static/generated/search.json`                     |   1,111,420 |    30,969 |    154,065 |    22 |

合计：L **9,340,501**，N **67,175,013**，U **11,919**，S **106,269,700 bytes**。N 是依据上述领域边界核对后的中性 scalar 候选；S 不能全算“中性业务数据”，它还承载文本字段的结构。复制整份 generated 至少重复约 **67.18 MB 的中性 scalar**，另会大量重复键与中性树结构。

U 实际定位到 `profiles.*.skillCards.*.variants.*.type`、`combatMeta.specialResource`、`specialEffects.*.skill.type`、relic `sources[]`、search `officialAliases[]`：人工审阅均为需按语言处理的文本，但为了可追溯，原型表保留这 11,919 bytes 的独立栏目。英文字段与仅含数字的模板还需 producer contract 校验；本次统计不宣称通过启发式证明所有语义。

## 5. Generated Artifact Strategy Comparison

原型只在内存中把已识别文本替换为 `null`，把原文本放到 JSON Pointer → string overlay，并统计序列化字节，未写正式 core / EN artifacts。它是故意简单、带重复 path 的成本上界样例，不是建议实施 JSON Pointer 格式。单语言 core **174,330,384 bytes**，overlay **21,824,723 bytes**，两者合计反而比原单语言大；切分有额外开销。

对 3,303,465 bytes 能通过唯一 CHS 原文精确反查 TextMap 的 scalar，EN 对应为 3,854,133 bytes，比例 **1.167**。其余包括插值后的 description 与网站合成文本，不能凭字符串反查获得可靠 EN。预测令文本字节系数 `r ∈ [0.9,1.6]`，保持结构不变，并单列正式 joins / schema / parser 变化的不确定性。

| 方案                  | 两语言 generated 估算                                                  | 工程与运行代价                                                                              | 判断                                          |
| --------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------- |
| A full per-locale     | `2T + (r−1)(L+U)` = **364.7–371.2 MB**                                 | 改 loader 最直接；类型／validator 好复用；中性 stats/Endgame 重复；每 locale 重跑大部分生成 | 不推荐作为最终形态；可在小领域采用            |
| B 全域 core + overlay | `core + 2overlay + (r−1)L` = **217.0–223.6 MB**                        | 所有领域引入 join 和两层契约；小文档 path 开销显著；Character token/progression 边界复杂    | 收益集中在大领域，不值得首轮全域改造          |
| C hybrid              | Enemy/Endgame 按 B，其余按 A = **210.0–216.6 MB**；规划 **210–225 MB** | 只给占 93.65% 的大领域加 join；小领域保留现有 view shape；需要清晰 typed loader facade      | **推荐**；相对 A 约少 140–160 MB 生成中间产物 |

Enemy/Endgame 原型：core **167,504,630**、CHS overlay **10,124,815 bytes**；Character 单份 8.06 MB 却产生 10.29 MB 的 naïve path overlay，是 hybrid 比全面切分更合理的直接证据。未来以稳定实体 ID 与 source field 组织 overlay 会比全 JSON Pointer 紧凑，但不将未实现压缩算入收益。

合并边界选 `server/generated.ts` / `server/endgame.ts`，输出每页面当前 locale 的投影。浏览器不下载 CHS+EN 两套 detail，也不下载完整 58 MB EN TextMap。不要把 core 与两种 overlay 都放入 root layout `data`。构建进程复用同一 core，浏览器仍会收到当前页面必要的 stats 和文本。若希望连发布 JSON 里的 neutral 部分也只存一次，需要另一个按页面粒度的客户端数据加载协议；那不是本轮默认方案，也不应偷偷变成 CSR 架构重构。

## 6. Endgame Identity Audit

实际链为：

```text
MonsterConfig.MonsterTemplateID
 → MonsterTemplateConfig.MonsterName.Hash → CHS resolver
 → buildOccurrence().name
 → collectEndgameSearchNames(): trim(name) / Map by name
 → sync.ts: sha256(name).hex.slice(0,16)
 → endgameEnemies.entryId / search document target
 → getEndgameOccurrenceEntryIds / getEndgameOccurrenceShard
 → /generated/endgame-occurrences/{entryId}
 → expander cache / schema=1 / entryId equality / locator expansion
```

这里名称来自 **MonsterTemplateConfig**，不是未经验证的 MonsterConfig override。`validate.ts` 也重算名称哈希；修改 generator 一处并不足够。locator 由 mode、groupId、encounterIndex、battleIndex、stageIndex、waveIndex、occurrenceIndex 组成；`presentedStageWaves` 决定 fixed / spawn pool 的展示集合。它们是特定 dataset revision 内的地址，不能假定 upstream 插入数组后仍跨版本稳定。

| 模式 | groups | 实际被搜索的 presented occurrences |
| ---- | -----: | ---------------------------------: |
| moc  |     56 |                              5,765 |
| pf   |     26 |                              2,079 |
| as   |     20 |                                183 |
| aa   |      9 |                                140 |
| 合计 |    111 |                              8,167 |

8,167 个 locators 归到 173 个中文名称桶，覆盖 **413 MonsterIDs、190 template IDs、190 name hashes**；87 桶含多个 MonsterID，17 桶含多个 template/hash。本次实际 EN 映射没有名称桶拆分或不同中文桶合并。**当前无拆并不证明未来翻译不改变分组，也不使名称成为可靠身份。**

例如“自动机兵•蜘蛛”对应 template `1012020` / `1012021`，hash 分别为 `7861616747158596984` / `9198763859070993120`，EN 都是 `Automaton Spider`，共有 60 locators。相同 MonsterID `1012020` 在 moc group 100、encounter config 2 与 5 的精确 HP 分别为 `544.87263150` / `1016.31295125`，不能因同名／同模板合并为一个战斗实例。“杰帕德”桶包含 11 个 MonsterID、2 个模板、93 locators，EN 都是 `Gepard`。

| identity 候选                    | 稳定性／兼容代价                                                                               | 结论                                     |
| -------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------- |
| MonsterID                        | locale-neutral；413 targets；把当前名称桶拆成很多 config variants；仍不能唯一表示不同关卡实例  | 用于实例配置关系，非名称桶唯一键         |
| MonsterTemplateID                | locale-neutral；190 原子 targets；文字修订不会换 ID；同名不同模板自然分离                      | **推荐原子 search/shard identity**       |
| 排序后的 config-ID 集合 hash     | 与 locale 无关的前提是集合本身不通过语言名称构建；新增 config 即换 hash                        | 不用作永久 ID；可作集合 revision/digest  |
| deterministic synthetic identity | 若输入 `kind + templateId` 则稳；若输入 locale/name/排序位置则不稳；发生 hash 截断还需碰撞检测 | 使用可读 `mt:{templateId}`，没必要再哈希 |
| name TextHash                    | 本次恰好 190 unique；它是文本来源，不等于实体身份，upstream 更换引用可能换 key                 | 保存 provenance，不作为唯一实体 ID       |

推荐两层：中性 atom `mt:1012020` 持有全部配置与 locators；每语言的名称分组只是展示／召回索引，引用一个或多个 atoms。中文相同 label 的 atoms 仍合并成原来的名称组，扩展后按现有 locator 去重与排序，因此保留现有结果集合；并不把 173 桶简单替换成 190 张 UI 卡。每个实例保留完整 context 与原数值，绝不按名字或 template 聚合 HP。新的中性 occurrence identity 应保留 mode/group/encounter configId/slot/eventId/stageId/wave or pool group/position/monsterId；同一配置重复位置需有 disambiguator。现有 index locator 在迁移期保留并由 coreDigest 约束，不承诺永久跨版本地址。

迁移建议：先在 CHS-only 回归中建立 old entryId → atomIds → locators 的完整映射，逐桶比较全部 8,167 locators、顺序和精确值；再升级 search schema / shard schema / naming or identity policy。新端点使用版本化路径，如 `/generated/search/{coreDigest}/{locale}/occurrences/mt-1012020.json`，校验 locale、coreDigest、schema、atomId，失败必须报 unavailable 并可重载，不能取任意 CHS shard 兜底。旧名称 hash 不是 season/detail 公共 HTML URL，现有 `/endgame/{mode}/{groupId}` 和 `/enemies/{id}` 不需要 SEO redirect。

为已打开的旧客户端，建议一个过渡发布继续生成旧 CHS shard schema 1 路径，由明确 old→new 映射投影当前数据；这是有边界的兼容产物，不是运行时静默 fallback。无法映射的旧目标返回明确不可用并提示刷新。过渡产物退场要单独记录，不能在身份切换时同时删除所有缓存客户端仍引用的文件。新增英文页面只引用新协议。

## 7. Search V2 Localization

当前 `normalization.ts` 执行 NFKC、lowercase、去空白及 `·•・—_-/`；`ranking.ts` 的顺序是：canonical exact、official exact、player exact、canonical prefix、official prefix、player prefix、canonical contains、official contains、player contains。公式为 `quality * 3 + authority`，tie 使用规范名 Unicode codepoint、kind 顺序、stable key。**当前不是中文 collator 排序**；不要为了 i18n 把 Search V2 tie-break 换成 `localeCompare`。overview filtering 的本地名称／描述 substring 是另一套语义，也不要顺便变成 alias search。

| 召回方案               | 收益／代价                                                | 建议     |
| ---------------------- | --------------------------------------------------------- | -------- |
| 仅当前语言             | 最容易保持分数；切换后原查询可能无结果，跨语言查角色差    | 不选     |
| 当前语言主、另一语言次 | 适合中文玩家看 EN，保留当前语言权威；多一个来源维度和去重 | **选用** |
| 两语言等权             | 跨语言 exact 可能压过本语言 contains；改变中文旧排名      | 不选     |

推荐排序键先 `localeTier`，再原九级 rank，再原 deterministic ties。当前语言 canonical/official/player 都属于 tier 0；另一个语言的对应证据属于 tier 1。同一 target 同时匹配多条证据只保留最佳，显示名始终来自页面 locale；可显示“匹配其他语言名称”的本地化证据。中文既有查询的 tier 0 相对顺序必须完全相同，新增跨语言结果在后，不宣称总结果条数永远不变。

人工别名三选一：单个 bilingual 无来源数组会丢失权威归属；原文件内追加 locale 会改现有契约和大量人工字节；**保留现有文件作为 zh-CN 数据源，未来独立增加 EN 文件**最稳妥。现有 313 条即使包含拉丁缩写，也仍属于原人工目录，不按字符脚本重新分类。EN 初始空数组，只由人工维护；updater 仅补新 ID 空壳，禁止机器翻译、复制 official name 作为 player alias 或覆盖既有顺序。跨语言查询可以召回中文人工别名，但它在 EN 页属于 secondary player evidence。

Official aliases 必须 per-locale，来自该语言的受审阅配置规则，保留 `table/recordId/field/textHash/sourceKind/sourceCommit/locale/namingPolicyVersion`。不能把另一语言 canonical 偷塞成当前语言 official alias；跨语言是检索维度，不是官方别名来源。现有 March 基础名规则保留实体关系，改用 provenance 而非 CHS 字符串断言。

发布选择 **neutral targets/locators + per-locale labels**，不是两份包含全 locators 的巨型 search.json，也不是 root layout 装载全 bilingual domain。当前 search.json **1,111,420 bytes**；search-inputs **1,003,011 bytes**，大量体积来自重复 locators。搜索页面加载共享 target 索引和两份小型 label 索引，current label 先用于显示、另一份仅用于 secondary evidence；只有搜索页需要这两份，首页／详情不加载。完整排名应在两份索引就绪后计算，secondary 失败必须显式标记部分搜索不可用，不默默当作“零结果”。

可先以 per-locale 完整 search artifacts 做短期桥接来复用现有 server load，但那会重复约 1 MB 的中性 locator 结构，必须标注为过渡。最终 shape 仍复用 `SearchTarget`、normalization 和 rank，增添 locale provenance 和 atom references；不扩展到拼音、分词或模糊匹配。Search schema 2 不应承载语义已改变的数据而不升版。

当前搜索页由 `src/routes/search/+page.server.ts` 同时序列化 index、四类 catalogs 和 portrait map；并不是普通页面都会 fetch search.json。当前 search HTML **1,380,894 bytes**、对应 `__data.json` **1,550,824 bytes**，因此发布 1.11 MB search.json 的体积不是单次用户搜索的完整成本。Endgame shards 仅命中后取，当前 173 文件共 **10,524,626 bytes**，P50/P90/P95/max 为 **28,190 / 172,712 / 217,070 / 388,635 bytes**；保持按需 expansion 与请求序列竞态保护。

## 8. Character Naming Policy

`character-names.ts` 当前多命途通过 `MultiplePathAvatarConfig.BaseAvatarID` 判断 8001 或 1001，却把基础文本写死为“开拓者／三月七”，再拼 `·pathName`。canonicalName 是其 plain text；1001/1224 的 official base name 还要求 rawName 恰为“三月七”。隔离调用 `deriveCharacterNames`、传入 EN resolver，实际抛出 **“角色 1001 official-base-name 规则需要重新审阅”**；不是仅理论风险。

| 实际来源                                                        | TextHash               | CHS → EN                    | 含义                                                     |
| --------------------------------------------------------------- | ---------------------- | --------------------------- | -------------------------------------------------------- |
| AvatarConfig 1001 / AvatarName                                  | `6186714091647966180`  | 三月七 → March 7th          | 可用的官方基础名                                         |
| AvatarConfig 1224 / AvatarName                                  | `16417870574330506928` | 三月七 → March 7th          | 第二配置来源，不能合并 ID                                |
| AvatarConfig 8001 / AvatarName                                  | `15351791685587679468` | `{NICKNAME}` → `{NICKNAME}` | 不能作为网站 canonical                                   |
| FateRinOwner 中 `PHFMCACHFIJ=Trailblazer` 的 `OENAMINOLLF.Hash` | `4036035618718239522`  | 开拓者 → Trailblazer        | 实际可追溯的非占位基础称谓；字段混淆名需 pin + validator |
| AvatarBaseType Knight / BaseTypeText                            | `4258030345548324088`  | 存护 → Preservation         | 本地化命途名                                             |

TextMap 中另有 `6354779731002018877` / `6633248308757777580` 也映射“开拓者 → Trailblazer”，本轮未把它们伪装成 AvatarName 的直接配置来源；优先用有实际 config provenance 的前者，并将该特殊基础称谓来源作为显式 naming policy。若 upstream 混淆字段或关系改变，停止 snapshot 更新要求重新审阅，而不是模糊搜索英文字符串。

建议每 locale 的 display/canonical policy：普通角色沿用官方 AvatarName；CHS 多命途字节不变；EN 使用 `Trailblazer (Preservation)`、`March 7th (The Hunt)` 这类“基础名 + 命途”格式。括号是网站消歧规则，不宣称整句是官方 Alias。命途英文必须取对应 TextMap，不能依据 code 自行翻译；保留男性／女性 AvatarID 和 base/enhanced 关系，不合并搜索 target。`{NICKNAME}` 及 gender placeholders 不得进入 canonical。

`special-effects-presentation.ts` 的 1415→8008、1510→8002 / March 关系含额外中文 displayName。保留现有 source/display ID 的明确产品关系，文字改由同一 naming service 生成；不要各组件各写一次 Trailblazer。

## 9. UI Message Inventory

前轮 AST / Svelte literal inventory 的 **71 文件、423 个中文片段**仍适用，排除了注释、测试描述、CLI 日志与开发诊断；排除的诊断片段为 65。这里的“片段”不是最终 key 数：`已展示 {shown} / {total} 个结果` 是一条参数消息，而 literal 抽取可能只记录头尾片段；重复文案也可能需不同语境的 key。不能承诺机械替换 423 次就完成。

| 原 inventory 类别                    | 片段数 | 提取策略                                                    |
| ------------------------------------ | -----: | ----------------------------------------------------------- |
| headings / display labels + headings |    125 | 静态 UI 消息；不同领域不盲目复用相同中文                    |
| aria labels                          |     69 | 完整语句与参数；保持可访问名称和可见文本一致                |
| Endgame labels                       |     61 | site label / domain code label 分离；正式模式名核对 TextMap |
| filters                              |     42 | 文案本地化，URL value 继续用 code                           |
| navigation                           |     33 | 标题翻译，route key 不翻译                                  |
| empty states                         |     30 | 完整语句；查询参数作为变量                                  |
| metadata/title/description           |     17 | 独立 SEO 消息，不从截断卡片标题取值                         |
| tooltips                             |     17 | 可见辅助说明；原分类仅线索，需确认实际交互                  |
| Search UI                            |     12 | 参数、复数、加载／失败状态                                  |
| errors shown to users                |     10 | error code → message，原始诊断不直接展示                    |
| changelog UI                         |      4 | 仅容器；正文另作内容本地化                                  |
| buttons                              |      3 | 原分类不是所有按钮总数；有些记在导航／Endgame 类            |

第二维 message shape 不能与上述类别求和：静态词条如“加载更多”；参数消息如 `search_result_count({shown,total})`、`enemy_count({count})`、`period_detail_aria({name})`；复数候选如结果数／赛期数／敌人数量／血条数，English 明确 one/other，0 状态可单独文案；日期、百分比、数字由 formatter 输出后参与消息；aria/SEO 也可能是参数消息。不要拼“个结果”、英文 `s` 或让翻译文件承载可执行 HTML。

领域派生标签如 rarity/path/element/skill category/special resistance：code 和数值留在领域模型，显示 label 按 locale 由 game-source label 或 site terminology 显式提供。raw game descriptions、技能模板、story 仍走 TextMap，不搬进 `messages/*.json`。UI string 只用 Paraglide，game markup 只用 GameText，二者不互相解析。

| 文件（相对仓库）                                                          | 片段数 | 原分类／迁移入口                                                            |
| ------------------------------------------------------------------------- | -----: | --------------------------------------------------------------------------- |
| `src/lib/components/BaseStatsPanel.svelte`                                |      9 | aria labels / headings / display labels / empty states                      |
| `src/lib/components/ChangelogModal.svelte`                                |      5 | changelog UI / aria labels                                                  |
| `src/lib/components/CharacterCatalogPage.svelte`                          |     12 | filters / aria labels / metadata/title/description                          |
| `src/lib/components/DescriptionText.svelte`                               |      1 | aria labels                                                                 |
| `src/lib/components/DetailPage.svelte`                                    |     26 | headings / display labels / buttons / aria labels / empty states / headings |
| `src/lib/components/EffectExplanationSection.svelte`                      |      1 | headings / display labels                                                   |
| `src/lib/components/EidolonCard.svelte`                                   |      2 | headings / empty states                                                     |
| `src/lib/components/endgame/as/ApocalypticShadowNodeSection.svelte`       |      1 | tooltips                                                                    |
| `src/lib/components/endgame/as/AsBossDossier.svelte`                      |      2 | Endgame labels                                                              |
| `src/lib/components/endgame/as/AsBossTraits.svelte`                       |      1 | Endgame labels                                                              |
| `src/lib/components/endgame/EndgameEnemyCard.svelte`                      |      8 | Endgame labels / aria labels                                                |
| `src/lib/components/endgame/EndgameLocalNav.svelte`                       |      3 | aria labels                                                                 |
| `src/lib/components/endgame/EndgameModeNav.svelte`                        |      1 | aria labels                                                                 |
| `src/lib/components/endgame/EndgameNodeHeading.svelte`                    |      1 | Endgame labels                                                              |
| `src/lib/components/endgame/EndgameOverviewCard.svelte`                   |      3 | Endgame labels / aria labels                                                |
| `src/lib/components/endgame/EndgameSeasonCard.svelte`                     |      2 | aria labels                                                                 |
| `src/lib/components/endgame/EndgameSeasonHero.svelte`                     |      3 | aria labels / Endgame labels                                                |
| `src/lib/components/endgame/EndgameWaveGroup.svelte`                      |      1 | Endgame labels                                                              |
| `src/lib/components/endgame/modes/AnomalyArbitrationDetailContent.svelte` |      2 | tooltips                                                                    |
| `src/lib/components/endgame/modes/PureFictionCacophonySection.svelte`     |      1 | tooltips                                                                    |
| `src/lib/components/endgame/modes/PureFictionMechanicsSection.svelte`     |      1 | tooltips                                                                    |
| `src/lib/components/endgame/presentation.ts`                              |     10 | Endgame labels                                                              |
| `src/lib/components/enemy/EnemyDetailPage.svelte`                         |     26 | headings / empty states / aria labels / headings / display labels / buttons |
| `src/lib/components/enemy/EnemyStatsPanel.svelte`                         |     10 | aria labels / empty states / headings / display labels                      |
| `src/lib/components/enemy/EnemyTemplateBaseStatsPanel.svelte`             |     10 | aria labels / empty states / headings / display labels                      |
| `src/lib/components/EnemyCatalogPage.svelte`                              |     11 | filters / aria labels / metadata/title/description                          |
| `src/lib/components/EnemyWeaknessGroup.svelte`                            |      3 | tooltips / headings / display labels                                        |
| `src/lib/components/EquipmentRecommendationSection.svelte`                |     10 | headings / aria labels / headings / display labels                          |
| `src/lib/components/FilterGroup.svelte`                                   |      1 | filters                                                                     |
| `src/lib/components/LightConeCatalogPage.svelte`                          |     11 | filters / aria labels / metadata/title/description                          |
| `src/lib/components/Navigator.svelte`                                     |     16 | aria labels / tooltips / navigation                                         |
| `src/lib/components/OverviewHero.svelte`                                  |      2 | metadata/title/description                                                  |
| `src/lib/components/OverviewPagination.svelte`                            |      5 | aria labels / headings / display labels                                     |
| `src/lib/components/OverviewSearch.svelte`                                |      2 | Search UI                                                                   |
| `src/lib/components/OverviewToolbar.svelte`                               |      7 | headings / display labels / buttons / aria labels                           |
| `src/lib/components/PrimaryNavigation.svelte`                             |      1 | aria labels                                                                 |
| `src/lib/components/RarityStars.svelte`                                   |      1 | aria labels                                                                 |
| `src/lib/components/relic/RelicDetailPage.svelte`                         |     11 | headings / display labels / aria labels / headings / empty states           |
| `src/lib/components/relic/RelicIcon.svelte`                               |      1 | headings / display labels                                                   |
| `src/lib/components/RelicCatalogPage.svelte`                              |     12 | filters / aria labels / metadata/title/description                          |
| `src/lib/components/RelicOverviewCard.svelte`                             |      2 | headings / display labels                                                   |
| `src/lib/components/SearchBar.svelte`                                     |      3 | aria labels                                                                 |
| `src/lib/components/SearchResultWindow.svelte`                            |      3 | Search UI                                                                   |
| `src/lib/components/SectionNav.svelte`                                    |      1 | navigation                                                                  |
| `src/lib/components/SkillCombatMeta.svelte`                               |      9 | aria labels / headings / display labels                                     |
| `src/lib/components/SkillProgressionPanel.svelte`                         |      2 | headings / display labels / aria labels                                     |
| `src/lib/components/SkillVariantView.svelte`                              |      1 | empty states                                                                |
| `src/lib/components/SpecialEffectDialog.svelte`                           |      2 | headings / aria labels                                                      |
| `src/lib/components/SpecialEffectRelation.svelte`                         |      2 | headings / display labels                                                   |
| `src/lib/components/SuperimpositionPanel.svelte`                          |      5 | headings / display labels / aria labels / empty states                      |
| `src/lib/components/TraceAbilityHeading.svelte`                           |      6 | headings                                                                    |
| `src/lib/components/TraceCardPanel.svelte`                                |      8 | empty states / headings / display labels / headings                         |
| `src/lib/domain/constants.ts`                                             |     14 | headings / display labels                                                   |
| `src/lib/domain/endgame-navigation.ts`                                    |     16 | navigation                                                                  |
| `src/lib/domain/endgame-view.ts`                                          |     26 | Endgame labels                                                              |
| `src/lib/domain/enemy-overview.ts`                                        |      7 | filters                                                                     |
| `src/lib/domain/special-effects-presentation.ts`                          |      4 | headings / display labels                                                   |
| `src/lib/navigation.ts`                                                   |     12 | navigation                                                                  |
| `src/lib/site.ts`                                                         |      1 | headings / display labels                                                   |
| `src/routes/+error.svelte`                                                |      4 | errors shown to users                                                       |
| `src/routes/+layout.svelte`                                               |      5 | headings / display labels                                                   |
| `src/routes/+page.svelte`                                                 |      8 | headings / display labels / aria labels / empty states                      |
| `src/routes/endgame/+page.svelte`                                         |      5 | metadata/title/description / tooltips / Endgame labels                      |
| `src/routes/endgame/[mode=endgameMode]/+page.server.ts`                   |      1 | errors shown to users                                                       |
| `src/routes/endgame/[mode=endgameMode]/+page.svelte`                      |      9 | metadata/title/description / Endgame labels                                 |
| `src/routes/endgame/[mode=endgameMode]/[groupId]/+page.server.ts`         |      2 | errors shown to users                                                       |
| `src/routes/endgame/[mode=endgameMode]/[groupId]/+page.svelte`            |      3 | Endgame labels                                                              |
| `src/routes/search/+page.svelte`                                          |     18 | metadata/title/description / tooltips / Search UI / aria labels             |
| `src/routes/[category=category]/+page.server.ts`                          |      1 | errors shown to users                                                       |
| `src/routes/[category=category]/+page.svelte`                             |      5 | tooltips                                                                    |
| `src/routes/[category=category]/[id]/+page.server.ts`                     |      2 | errors shown to users                                                       |

内容补充：`src/lib/content/changelog` 现有 3 篇 `.svx`，共 **772 bytes**，不在 423 统计内。当前 eager glob 加载全部正文。未来按 `locale + stable entryId` 组织人工内容，中文原文保留；新公告双语维护，历史未译正文可由用户主动打开带 `lang="zh-CN"` 的“中文原文”并明确标注，不将整篇中文静默显示为英文。只导入当前 locale 的正文，避免两个语言都进入 modal bundle；日期与 id 保持中性。品牌见第 12 节。

## 10. i18n Library Comparison

2026-09-04 经已核验的本地代理读取官方 npm registry，最新 dist-tag 记录为 [@inlang/paraglide-js 2.25.0](https://registry.npmjs.org/@inlang%2fparaglide-js/latest)、[i18next 26.4.2](https://registry.npmjs.org/i18next/latest)。这是查询时快照，不是要求未来安装浮动 latest。本轮没有安装或运行这两个包，也没有测量本项目的实际新增 bundle。

| 维度                   | Paraglide JS                                                                                | i18next 生态                                                                                                  | 最小 typed dictionary                                    |
| ---------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| SvelteKit/static       | 官方有 Vite/SvelteKit 与 SSG 指南；编译消息可在 prerender 调用                              | 核心框架无关，可按请求建 instance；Svelte store adapter 需另行选择和验证，不能拿 react-i18next 当 Svelte 集成 | 直接函数最容易接入，但所有集成责任自负                   |
| Type safety            | 生成函数／参数声明；固定消息引用适合 TS                                                     | CustomTypeOptions/resource augmentation、selector 与 strictKeyChecks；配置正确才严格                          | key union / satisfies 可做；插值参数和复数语义须自写     |
| 参数、plural、ordinal  | 生成变体函数，基于 Intl.PluralRules                                                         | 成熟 count/plural/namespace/fallback 机制；Intl formatter                                                     | Intl 本身可用；模板 parser、选择器、缺 key 验证自行维护  |
| Tree shaking / payload | message 模块适合静态引用；动态 key 和收集整个 dictionary 会削弱收益；不保证自动仅传当前语言 | 一般按 namespace/语言加载资源；动态 key 的灵活性使静态裁剪较弱                                                | 静态函数可裁剪；大对象查 key 则通常整包                  |
| SSR 隔离               | 显式 locale 参数或 request-scoped middleware；不能进程全局 setLocale                        | 每 request/locale 独立 instance/getFixedT，不能共享 mutable language                                          | 显式 locale 参数较容易验证                               |
| 与本项目匹配           | 423 片段、静态 UI、严格 TS、无远端翻译平台，适合编译期方案                                  | 适合动态 namespace、远端资源／翻译工作流需求；当前收益不足以抵消 adapter/runtime 接线                         | 无依赖但会逐步自建小型框架，复数/诊断/翻译工具维护成本高 |
| 维护与限制             | 要管理生成目录与 compiler plugin，升级须做 SSG/类型回归                                     | 生态成熟，包与 adapter 版本需独立固定                                                                         | 类型健全不等于语言学正确，缺少现成协作工具               |

推荐 **Paraglide**。只对网站消息使用它，以稳定语义 key 和静态调用保留类型／裁剪能力；不要让一个通用 `t(string)` 吞掉生成类型。参数与显式 locale 调用来自 [Basics](https://paraglidejs.com/basics)，复数及 ordinal 能力见 [Variants](https://paraglidejs.com/variants)。i18next 的可行性与参数类型依据 [TypeScript 文档](https://www.i18next.com/overview/typescript)，复数规则依据 [Plurals](https://www.i18next.com/translation-function/plurals)；它不是“不能静态部署”，只是本项目优先级较低。

具体集成推荐见第 11 节：SvelteKit optional locale route + 显式 locale messages，而非全局 store 修改。Paraglide [SvelteKit 指南](https://paraglidejs.com/sveltekit) 的 middleware/reroute 是另一个可行集成，不应与 optional-prefix 匹配重复剥前缀。正式 spike 需验证两页并发 prerender、hydration、类型错误和实际 bundle；目前只有文档/API 调查，不将“支持”写成已经本地集成成功。

使用稳定编译选项，不依赖 experimental per-locale build / middleware splitting 达成首期验收。官方 [compiler options](https://paraglidejs.com/compiler-options) 提供 message-modules / locale-modules；不同 backend 的支持可能不同，实施时对锁定版本确认。保守预算：UI 新增 JS 为数十 KB 级的待测项目，而非宣称零 runtime 或引用其他网站的节省百分比。可允许已使用 UI 消息的两语言函数同包；绝不因此把游戏 EN 数据打入 JS。

缺译行为由项目 validator 强制：生产构建校验全 locale key/参数/plural branches 完整，不能依赖库默认 fallback。运行时异常仅显示当前语言通用错误并记录 message key，不能把内部 key 当用户文案。

## 11. Locale Routing Strategy

| URL 方案                 | SEO / 分享 / 缓存 / 迁移                                    | 决策     |
| ------------------------ | ----------------------------------------------------------- | -------- |
| 中文 root，EN `/en/*`    | 保持全部中文链接；两套静态文件；URL 自描述                  | **推荐** |
| `/zh-CN/*` 与 `/en/*`    | 对称但需迁移所有中文 URLs 与 redirect                       | 不选     |
| `?lang=en`               | 静态同 pathname 输出难区分；query 与 canonical/cache 易冲突 | 不选     |
| cookie/localStorage only | 首次 HTML 与用户语言可能不同，分享不携带语言                | 不选     |

path slug 继续 `characters/light-cones/relics/enemies/endgame/search`，mode 继续 moc/pf/as/aa，ID 不翻译。`/en/characters/1001` 是英文 URL；不改成角色译名 slug。`/characters/1001` 永远中文，即使浏览器 Accept-Language 为 en、storage 为 en 也不自动跳转。偏好只能用于提示或未来中性选择页，不能覆盖明确 URL；中文 root 本身就是明确语言页面。

当前 Kit 支持 `[[locale=locale]]` optional parameter 和 matcher。推荐将内容路由树移入该分支，matcher **只接受 `en`**，缺省映射 `zh-CN`；root 的 sitemap、robots、共享 assets、版本化 generated endpoints 不移入 locale 内容树。详情 `entries()` 显式生成 `{locale: undefined, ...entity}` 和 `{locale:'en', ...entity}`，overview / Endgame 同理，不只依赖 crawler 偶然发现链接。对应能力见 [SvelteKit advanced routing](https://svelte.dev/docs/kit/advanced-routing)。

`localeFromPath(url)` 是唯一解析规则，layout server load 返回 typed locale，组件通过 data/context 使用它；hook 在 prerender 文档阶段据同一解析规则填 `<html lang>`，消息显式调用 `m.key(inputs, {locale})`。禁止 module-scope 当前语言变量。采用这条集成时不同时配置 Paraglide 的 `deLocalizeUrl` reroute；两套机制叠加会让 `/en` 参数消失。`reroute` 在现版本确实可用、也不会改变地址栏，但要求纯函数，见 [Kit hooks](https://svelte.dev/docs/kit/hooks)；本项目不需要翻译 slug，optional route 的显式 params/entries 更好审计。

语言切换是指向另一 locale 完整 URL 的普通 `<a data-sveltekit-reload>`。保留同一 entity ID、mode/groupId、query、hash：筛选的 path/element/rarity/sort 等用稳定 code，参数值不翻译；`q` 保留原输入，跨语言搜索处理它。详情等级、增强 profile、选中 tab 如已在 URL 表示则保留；纯本地临时状态允许重置。分页只在目标结果数不足时按现有规则 clamp，不无条件清空。

锚点必须使用稳定 section key / entity ID，不用翻译后的 heading 生成；已有 id 保留。目标页面无对应实体时禁用切换并给出原因；若是某类内容缺翻译，跳到目标 locale 的对应目录需明确告知，不能把用户悄悄送首页或替换成中文详情。正式发布要求 core route parity，因此此异常不应是常规流程。未知 `/fr/*` 返回 404，不自动解释为中文路径。

## 12. SEO / Metadata / Sitemap

现状：`src/app.html` 写死 `lang="zh-CN"`；root layout canonical 是 siteUrl + pathname；`site.ts` 写死站名、标题分隔符 `｜`；sitemap 只有 `<loc>`、无 alternate；robots 引用 sitemap。`PUBLIC_SITE_URL` 在 layout 与 sitemap 有本地默认值，发布门禁必须拒绝 localhost canonical。

推荐每个真实 locale 页面 self-canonical，不能把 EN canonical 指向 CHS。两个变体互相声明且包含自己：zh-CN → root path，en → /en path；`x-default` 选择对应中文 root path，表示未支持语言的默认入口，不额外建立 redirect。sitemap 同时列两种 URL 并按同一 route manifest 生成 reciprocal alternates；404、缺失翻译页面、资源 endpoint 不进 sitemap。查询、fragment 不进入 canonical；保留现有 trailing-slash 策略并规范 origin。alternate 的双向与完整 URL 要求依据 [Google localized versions](https://developers.google.com/search/docs/specialty/international/localized-versions)。

HTML lang 与 `dir=ltr` 在生成 HTML 时正确，不能等 hydration 才改。标题／meta description、OG title/description/site_name 按 locale 生成；OG locale 如采用则从独立映射提供，不能直接把 `en` 当所有协议相同值。游戏名、站点品牌和游戏数据分开管理：现有站名《崩坏：星穹铁道》档案库保持；EN 站点显示名建议人工确认的 `HSR Database`，这是网站品牌选择，**不是引用上游“官方英文站名”**。版权／非官方说明翻译为网站文案，原 LICENSE 文件与链接保持。

错误分三层：已匹配 route 的数据错误按 locale error code 映射安全消息，当前 `$page.error.message` 直接显示需收敛；未匹配路径按 URL prefix 选择当前 locale 的客户端错误 UI；静态托管首次 404 目前只有一个 `404.html` fallback，不假设它能按 cookie 改语言。首期保留静态架构，允许共享 fallback 在无 JS 时显示明确双语 404 说明、两种首页链接，各段标 lang；不要给此 fallback 建 canonical/hreflang。若要求任意 `/en/不存在` 的无 JS 整份文档均为英语，则需另行验证平台按路径选择两份 404 的配置，列为部署验收项，不能假称现有 adapter 自动做到。

## 13. Static Prerender / Build Impact

adapter-static 能产生所有 locale 页面；目前 root `+layout.server.ts` 已 `prerender=true`，配置 `fallback:'404.html'`。静态部署没有生产服务器去运行 load；因此如果某个英文详情不 prerender，就要改为浏览器取数据加 fallback（或改变部署架构），不能期待现有 server loader 在 CDN 请求时执行。Kit 的 [prerender / entries](https://svelte.dev/docs/kit/page-options) 与 [adapter-static 文档](https://svelte.dev/docs/kit/adapter-static) 支持这一判断。

选择完整双语 prerender。部分语言 CSR 可以减少 HTML，但损害英文详情初始内容、SEO、无 JS 访问，而且要新增数据 endpoint / 客户端加载与错误状态；本项目当前规模尚不足以支持该额外复杂度。未来若增长逼近资源预算，先针对重复页面投影和资产缓存计量，再另立决策。

| 当前输出                   | 文件数 |       bytes | 双语影响                                                        |
| -------------------------- | -----: | ----------: | --------------------------------------------------------------- |
| 内容 HTML + fallback       |  1,077 | 163,498,978 | 内容 1,076 → 2,152；fallback 独立，不把总数机械乘二             |
| JSON                       |  1,080 | 127,168,222 | 页面 `__data.json` 大部分新增一份；共享 meta/索引可略减         |
| 无扩展名 occurrence shards |    173 |  10,524,626 | locale 视图约新增一份；atom 化到 190 可能增加小文件/period 重复 |
| PNG + WebP                 |  2,362 | 135,008,599 | 共享，不按语言复制                                              |
| JS                         |     40 |     490,339 | 使用组件共享；UI message 编译增量待测                           |
| CSS                        |     18 |     120,510 | 共享；少量例外规则而非另复制一套                                |
| md/txt/xml                 |      4 |      99,186 | sitemap 约增一份 URL 数据；licenses 不复制                      |
| 总计                       |  4,754 | 436,910,460 | 规划约 7,100–7,200 文件，不含过渡旧 shard 保留额外项            |

1,076 页面 = 首页 1 + search 1 + 四 overview 4 + 四类 details 954 + Endgame landing 1 + modes 4 + groups 111。新增 EN 1,076，总内容页面 2,152；加一个 fallback 共 2,153 HTML。新 atom shard 协议有 190×2 个 locale shard，替换旧 173 后净增加 207；若另保留过渡 legacy 173，需另加，预计过渡部署约 7,300–7,400 文件。新 neutral/locale manifests 和索引只加少量文件。

当前 Enemy detail HTML 为 **120,984,141 bytes**，约占全部 HTML 的 74%；Character detail HTML 15,359,463，Endgame 子树 17,328,543。这说明单纯翻译 UI labels 对主要体积几乎无影响。当前最大 HTML `/enemies/8002050` 为 **2,654,644 bytes**，对应 `__data.json` **2,533,675 bytes**。浏览器 document 首访通常由 HTML 内序列化数据 hydration，客户端导航会取 `__data.json`；不能把两者总和当成每次请求必然下载，也不能假定一个访客会下载全站 437 MB。

发布估算保守公式（A/B/C 在同一页面投影和 SSG 架构下近似相同）：

```text
新增 EN HTML = 163.497 MB × [1.00, 1.20]
新增 EN page JSON = 127.168 MB × [0.98, 1.10]
新增 EN shards ≈ 10.525 MB × [1.00, 1.20]
新消息／索引／manifest／atom 分片开销 ≈ 0.2–3 MB
总发布 ≈ 735–790 MB（相比当前增加约 298–353 MB，约 68–81%）
```

这是 byte-sensitive 情景估计，不是实际 EN build；字符串分段、HTML 转义、Svelte 序列化、连接字段、gzip/brotli 都未实际运行。若永久发布一个共享 browser core 并改加载协议，输出可能更小，但那不属于上述估算。generated hybrid 节省的是构建中间数据，不自动抵消已序列化 HTML / JSON。

构建时间只引用前轮已记录基线：clean 602.604s，其中 data generation 35.234s、SvelteKit 72.566s、verify 28.499s；大量剩余时间在上游准备与资产处理。按额外语言生成/合并约 10–40s、额外 Kit 约 60–150s、额外验证约 15–45s，估计同机 clean **11.5–14.5 分钟**（考虑噪声可预算到 16 分钟），不是把整个 10 分钟乘二；缓存构建预计约 **5.5–8 分钟**，参照前轮 normal 246.461s 但承认并发负载影响。本轮没有重新测耗时或峰值内存，CI 机器上的时间和内存仍为未验证项。

Vercel 官方当前列出 Build Step 45 分钟、CLI source upload 文件数 15,000、构建输出文件无相同的数量硬上限；CLI 的 100 MB/1 GB source upload 与 build cache 1 GB 限制不能误用为本项目静态 build 总输出上限。[Vercel limits](https://vercel.com/docs/limits) 本仓库没有 `vercel.json`，账户计划和 Dashboard build 配置不可见；因此本轮不能给“735 MB 一定可部署”的保证。需在实际目标项目验证上传方式、缓存命中、磁盘、峰值内存与部署耗时。

## 14. Formatting Audit

| 实际位置／行为                                              | locale 风险                                             | 推荐边界                                                                                           |
| ----------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `domain/stats.ts:formatBaseStat`，`SkillCombatMeta.svelte`  | Intl.NumberFormat 写死 zh-CN                            | 传 formatter locale，数值逻辑不变                                                                  |
| `endgame-view.ts:formatRoundedDecimal/formatExactDecimal`   | BigInt 精确整数，固定小数点；不是可随意 Number 化的数据 | 保留十进制字符串与 half-up 规则；用 Intl.formatToParts 获取分隔符，只格式化整数，保留精确 fraction |
| `formatRatioPercentage`                                     | Number 比例乘 100，再手工 `%`                           | 对已限定普通 ratio 使用 Intl percent、maxFractionDigits=2，避免二次乘百；高精度 HP 不走它          |
| `text.ts` 的 `#n[i]/[fN]/%`                                 | 游戏模板插值、舍入与 scaling 标记                       | 不换成 UI message plural，不按 locale 改游戏参数意义；新增 locale-aware 呈现需独立审阅             |
| `endgame-view.ts:parseSchedule/datePart`                    | 原字符串 `+08:00`，显示 YYYY/MM/DD                      | 解析与状态边界维持 +08:00；显示用明示 Asia/Shanghai 的 DateTimeFormat，说明时区                    |
| `buildPeriodView/recommendedGroupId`                        | now、schedule、name availability 影响推荐与状态         | clock/eligibility 中性；不要因 EN 缺名字改变默认赛期；SSG 时间状态现有限制另留问题                 |
| `endgame/presentation.ts:formatChineseOrdinal`              | 汉字序号                                                | 完整消息如 stage/floor number；EN 数字或 ordinal，经翻译规则选择                                   |
| `ChangelogModal` / content index                            | YYYY-MM-DD raw 显示；ISO 字符串排序                     | 日期是 date-only，按日历格式化，不能 UTC 转换后偏一天；sort/id 保持稳定                            |
| `Character/LightCone/RelicCatalogPage`、`enemy-overview.ts` | `localeCompare(...,'zh-CN')`                            | overview 按当前 display name 用显式 collator；CHS 保持原参数，稳定 id tie；不复用到搜索            |
| overview `.toLocaleLowerCase()`                             | 未给 locale，依赖环境                                   | 明确目标 locale 或沿用稳定 normalization，只改大小写依赖，不引入 alias/分词                        |
| `trace-groups`、changelog IDs                               | `localeCompare` 用于 ID / ISO 日期                      | 保持中性确定顺序，不能随 UI language 改关系顺序                                                    |

版本号、AvatarID、MonsterID、TextHash、URL query enum 不做本地化数字格式化。HP / internal stance / ratios 的计算证据继续保留原 decimal string。译文不得改动 `3` 内部韧性→`1` 玩家韧性等领域换算。

## 15. GameText / Language-Sensitive Logic

| 位置                                                                          | 现状证据                                             | 后续修复                                                                                                                     |
| ----------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `character-names.ts:buildCharacterNames`                                      | 硬编码基础名字和 CHS equality；EN prototype 实际失败 | locale naming policy + config/hash provenance，见第 8 节                                                                     |
| `enemy-detail.ts:normalizeEnemySkillKind/Tag`，sync 两套 enemy skill producer | 以翻译出的“技能／天赋／群攻”等反查 stable kind/code  | 优先 structured type；缺字段时用已审阅 source hash→code 映射和未知诊断，再独立 resolve label                                 |
| `special-effects-presentation.ts:segmentSpecialEffectTriggers`                | icon + underline/color 后文本必须等于“特殊效果”      | generator 按 ExtraEffect/skill relation 与已验证 icon/provenance 发出语义 reference；组件读 relationKind，保留任意语言可见词 |
| `resolveSpecialEffectLinkedAvatarPresentation`                                | ID 关系之外有“开拓者·记忆／开拓者／三月七”fallback   | 关系不动，名称调用 locale naming service，不显示 raw ID 代替缺失名                                                           |
| `sync.ts` enemy skill `visible=Boolean(description.trim())`                   | 本地化描述存在性决定技能是否进入展示 phase           | 用结构化 visibility + 一次中性 inclusion manifest；缺译只决定文本状态，不让 EN 少技能/phase                                  |
| `recommendedGroupId` / `collectEndgameSearchNames`                            | 名称存在性决定候选组／是否收录                       | 中性实体可见性与 index membership 先确定，缺名按严格 translation policy 处理                                                 |
| generated skill categoryLabels / relicTypeNames / special resistance labels   | 稳定 code 旁内嵌中文                                 | 按 code 本地化 label；不为了翻译改变 code                                                                                    |

直接反例：MonsterSkillConfig `100201101` 的 SkillTypeDesc hash `4236760374151560033` 为“技能 → Ability”；SkillTag hash `13718219806540082081` 为“群攻 → AoE ATK”。把 EN 直接送入现有 normalizer 会得到 `kind='unknown'`、tag.known=false，且未知 code 可能变成英文文案，破坏两语言 neutral parity。不要添加另一张“英文字符串反查 code”表继续累积脆弱逻辑；用 source identity，新增 hash 要显式审阅。

当前 `normalizeGameText` 只还原 escaped newline / NBSP；parser 支持 color/i/u/unbreak/scaling 与 icon，未知 angle tag 被去掉，**未发现 `{F#...}{M#...}` 性别模板解析**。本地角色 8001–8010 的 catalog description 仍含成对 gender markup；`{NICKNAME}` 在 sync fullName 特判，不是通用占位符方案。报告不把现存中文模板残留误报为新增 EN bug。

建议将性别分支作为 game text parser 的明确节点：固定性别的实体用配置上下文选择；通用 Trailblazer 介绍在网站明确 context 后选择，无法选择时保留两个可区分的版本或标记不可用，不盲选 M，也不直接删掉 brace 语法。EN 还需核对代词／所有格／分支顺序。未知 token、缺参数、错误嵌套均进入 locale + entity + field 诊断；危险 markup 不进入 `{@html}`。GameText 样式 token 可以复用渲染器，但 token 序列按语言重新生成。

## 16. English Responsive Risk Audit

### 实际长度

按 Unicode codepoint 计数、包含空格标点，去 angle markup；P 分位采用 nearest rank。名称来自本地 EN 与相同 hash 的 CHS，不是翻译 API。字符长度不等于像素宽度：中英字体字宽不同，下表是风险筛查，**没有运行英文页面视觉验收**。

| 类别                    | 样本总数 / EN缺失 | CHS P50/P90/P95/max | EN P50/P90/P95/max | EN/CHS 比值 P50/P90/P95/max |
| ----------------------- | ----------------: | ------------------- | ------------------ | --------------------------- |
| 角色 AvatarName 原值    |            97 / 0 | 3 / 10 / 10 / 10    | 7 / 11 / 18 / 27   | 2.60 / 4.40 / 5 / 5.50      |
| 光锥                    |           169 / 0 | 6 / 7 / 8 / 9       | 19 / 28 / 29 / 42  | 3.50 / 5.25 / 6 / 7         |
| 遗器套装                |            60 / 0 | 7 / 8 / 8 / 9       | 25 / 32 / 33 / 40  | 3.57 / 4.57 / 5 / 6.40      |
| 敌人模板                |           628 / 0 | 7 / 12 / 13 / 18    | 21 / 41 / 44 / 56  | 3.50 / 5 / 5.50 / 8         |
| AvatarSkillConfig 去重  |           702 / 4 | 5 / 9 / 9 / 12      | 17 / 27 / 30 / 42  | 3.17 / 4.75 / 5.40 / 10     |
| MonsterSkillConfig 去重 |        3548 / 397 | 4 / 7 / 8 / 11      | 17 / 27 / 30 / 40  | 3.75 / 5.50 / 6.50 / 10.50  |
| 命途                    |            10 / 0 | 2 / 2 / 2 / 2       | 8 / 11 / 12 / 12   | 4 / 5.50 / 6 / 6            |
| 元素                    |             7 / 0 | 1 / 2 / 2 / 2       | 7 / 9 / 9 / 9      | 4 / 9 / 9 / 9               |
| MOC 组名                |            55 / 0 | 4 / 4 / 6 / 7       | 17 / 25 / 29 / 37  | 4.25 / 6 / 6.25 / 7.75      |
| PF 组名                 |            26 / 0 | 4 / 4 / 4 / 4       | 17 / 24 / 24 / 26  | 4.25 / 6 / 6 / 6.50         |
| AS 组名                 |            20 / 0 | 4 / 4 / 4 / 4       | 16 / 22 / 23 / 26  | 4 / 5.50 / 5.75 / 6.50      |
| AA Title                |             9 / 0 | 4 / 4 / 4 / 4       | 20 / 33 / 33 / 33  | 5 / 8.25 / 8.25 / 8.25      |

角色“展示候选”单独使用当前 catalog 的 CHS plain name，加第 8 节建议的 EN 消歧规则，P50/P90/P95/max：CHS **3/6/6/8**，EN **7/22/25/27**，EN/CHS 比 **3/4.4/5/5.5**。原 AvatarName 表包含 `{NICKNAME}` 长度 10，因此原始 hash 分布与最终展示分布不同；不能拿占位符长度作为 Trailblazer 卡片宽度。技能表按 `(SkillID,nameHash)` 去重等级记录，只对两语言均有值的名称算分位；它们仍是 raw source 范围，非所有生产可见技能全集。moc 名称统计 55 条，dataset 56 groups 中另有无名组，不能凭缺名删 route。

| 来源 / ID / 字段                              | TextHash               | CHS                      | 实际 EN                                                  | EN 字符数 |
| --------------------------------------------- | ---------------------- | ------------------------ | -------------------------------------------------------- | --------: |
| AvatarConfig / 1414 / AvatarName              | `12485086905499638965` | 丹恒•腾荒                | Dan Heng • Permansor Terrae                              |        27 |
| EquipmentConfig / 23033 / EquipmentName       | `166399991008704530`   | 忍法帖•缭乱破魔          | Ninjutsu Inscription: Dazzling Evilbreaker               |        42 |
| RelicSetConfig / 118 / SetName                | `6302684422138455917`  | 机心戏梦的钟表匠         | Watchmaker, Master of Dream Machinations                 |        40 |
| MonsterTemplateConfig / 3002043 / MonsterName | `8465786549832294121`  | 蕉研组的筑梦蕉师（完整） | Banacademic Office's Dreamweaver BananAdvisor (Complete) |        56 |
| AvatarSkillConfig / 130203 / SkillName        | `7006354059344205062`  | 驻于花庭，赐与尽美       | For In This Garden, Supreme Beauty Bestows               |        42 |
| MonsterSkillConfig / 302403009 / SkillName    | `7292696530830891719`  | 诸界噩兆，蚀生虫鸣       | Universal Blight, Howl of the Life Eater                 |        40 |
| AvatarBaseType / Knight / BaseTypeText        | `4258030345548324088`  | 存护                     | Preservation                                             |        12 |
| DamageType / Thunder / DamageTypeName         | `2257691052810076110`  | 雷                       | Lightning                                                |         9 |
| ChallengeGroupConfig / 100 / GroupName        | `13535919676396601281` | 永屹之城遗秘             | The Last Vestiges of Towering Citadel                    |        37 |
| ChallengeStoryGroupConfig / 2003 / GroupName  | `5948562046801291634`  | 舌灿莲花                 | An Expression of Eloquence                               |        26 |
| ChallengeBossGroupConfig / 3013 / GroupName   | `15365469229813184920` | 螟蝗煽动                 | Instigation of the Locusts                               |        26 |
| ChallengePeakGroupConfig / 2 / Title          | `10349426151264090008` | 烈阳幻域                 | Illusory Realm of the Blazing Sun                        |        33 |

### 组件矩阵与处理规则

| UI / 实际位置                                      | 当前约束                                                           | 英文风险与建议                                                                                             |
| -------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| EntityOverviewCard 标题，四类 overview 共用        | 2 行 line-clamp、min-height 2.6em；某些卡片固定 128/122px 内容轨道 | 光锥 42、遗器 40、敌人 56 字符高风险；先保留布局与现有两行，实际溢出才截断并可查看完整名，不能全站改成一行 |
| CompactEntityCard / 首页 recent 卡                 | 密度较高，名字与图像并列                                           | 同一命名策略；短名不加无意义 tooltip，长名复用溢出能力                                                     |
| PrimaryNavigation / Navigator                      | 侧栏变量宽 304px，多个 label/counter                               | 英文模式名与导航项可能撑宽；保持 code/href，允许合理 wrap，图标不缩为不可识别                              |
| SectionNav / EndgameModeNav / LocalNav             | 多处 white-space:nowrap                                            | tab 保留完整可访问名，优先横向滚动/可用空间，必要时紧凑 label + tooltip；不能切掉选中含义                  |
| OverviewHero / DetailPage / detail-hero.css        | 双栏 3fr/2fr，hero identity copy 最大宽约 60–68%                   | 英文大标题自然 wrap、允许高度增长；不要用 ellipsis 隐藏 canonical title，检查图片遮挡                      |
| EndgameSeasonHero / NodeHeading / SeasonCard       | 模式/赛期/楼层标题与时间、统计相邻                                 | AA 33、MOC 37 字符；hero/section wrap，列表紧凑名称可 clamp+完整提示                                       |
| EndgameOverviewCard                                | 名称已有 nowrap + ellipsis                                         | 保留截断行为，补 hover/focus/touch 查看；不把 title 属性作为唯一途径                                       |
| EndgameEnemyCard + app.css                         | 名称现在自然 wrap；stats label 固定 3.85rem + value 列             | 长敌名自然 wrap，保持关联数值不分离；Resistance/Toughness 等 label 独立测宽，局部改列比例，不改数值精度    |
| EnemyStatsPanel / BaseStatsPanel / SkillCombatMeta | 表格、DL、数值和单位                                               | 数字与 × 阶段不应省略；label 可换行，列 min-width:0；大整数不被强制 float                                  |
| FilterGroup / OverviewToolbar / SearchBar          | 标签、计数、select/button                                          | 翻译后的完整消息与筛选值分离；允许 controls wrap，控件最小触摸目标不缩水                                   |
| SearchResultWindow                                 | 已 flex-wrap，按钮 min-height 44px                                 | 完整 plural 句子；保留换行，不拼词，不以英文缩写解决所有宽度                                               |
| SkillCardPanel / EnemySkillCard / Trace cards      | 标题、标签与大段 GameText                                          | 标题 wrap；描述、机制正文自然多行，保留 unbreak 参数原子，不给整段 single-line ellipsis                    |
| ChangelogModal / SpecialEffectDialog               | modal 有 viewport/max-height 边界                                  | 标题、正文与按钮可换行，内容内部滚动，关闭按钮始终可达                                                     |

默认策略：保持当前版式；仅对**确实受限的名字／紧凑导航标签**使用 ellipsis 或已有 line-clamp。完整名称仍保留 DOM 文本与 accessible name。复用实际 overflow 检测能力（scrollWidth/clientWidth，clamp 用 scrollHeight/clientHeight，ResizeObserver 监听容器与字体完成），不凭“是英语”永久加 tooltip。

Tooltip 需支持鼠标 hover、键盘 focus，Escape 关闭，指针可移到提示内容且焦点仍在触发元素时保持；使用 `aria-describedby`、唯一 id，不能把 tooltip 内放必须点击的交互内容。触屏不能依赖 hover 或浏览器 title：提供独立的“查看完整名称”按钮／popover；若整卡是链接，该按钮不能嵌在 `<a>` 内，须调整为合法 sibling 结构，卡片导航行为要有明确单击规则。相关要求依据 [WCAG 1.4.13](https://www.w3.org/WAI/WCAG21/Understanding/content-on-hover-or-focus)。

大标题、剧情、机制描述、tooltip 本体、空状态和错误说明应自然 wrap；不采用全局 `overflow-wrap:anywhere` 强拆所有英文单词来掩盖问题。现有规则中 `anywhere` 是最后兜底，优先正常空格断行；long URL/内部代码另处理。locale-specific CSS 只给实测例外加小范围 `:lang(en)` 或组件变体，避免复制整套 CSS、全局缩小英文字号、调整每张卡高度的庞大分支。

字体当前为 Inter、ui-sans-serif、系统字体、Segoe UI、PingFang SC、Microsoft YaHei、sans-serif；仅声明 Inter 不等于实际加载该字体。本轮未下载字体。首期共享栈，分别在 Windows/macOS/移动系统实测字宽与换行；只有缺 glyph／明显 metric 问题才评估子集字体、授权和额外网络成本。需要验证 320/375/390/768/1280px、200% zoom、键盘与触屏；本轮长度扫描不替代这些未来门禁。

## 17. Cache / Generation Dependency Graph

推荐 **一个中性 root manifest + 各 locale manifest**，不是当前 manifest 加一个 `languages` 数组就完成。root 保存 schema/coreDigest/configDigest/sourceCommit/route IDs/counts/locale artifact references；locale manifest 保存 locale、textMapCode/textMapDigest、namingPolicyVersion、textParserVersion、overlay digest、search labels digest、缺译摘要与 coreDigest。public meta 是安全的精简投影，不向浏览器泄露本地路径或整份审计。

```text
pinned upstream commit（可复现来源）
 ├─ consumed Config bytes + neutral normalizer/identity version → configDigest → core
 ├─ CHS TextMap bytes + text parser/naming version + source refs → zh-CN overlay/snapshot
 └─ EN TextMap bytes  + text parser/naming version + source refs → en overlay/snapshot
core + locale overlay → localized page view / catalog / detail / shard
neutral targets + locale official snapshot + that locale player aliases
  + normalization/ranking version → locale search labels
core + both label digests + ranking policy → search page projection
locale UI messages + UI compiler version → UI module chunks
route manifest + view + locale UI + PUBLIC_SITE_URL → HTML/__data/SEO/sitemap
asset pin + asset pipeline version + required IDs → shared images
```

| 变化                       | 必须失效                                                               | 不应无理由重算                          |
| -------------------------- | ---------------------------------------------------------------------- | --------------------------------------- |
| EN TextMap-only            | EN overlay/snapshot、EN page view、涉及 EN secondary labels 的搜索投影 | core 数值、CHS domain overlay、共享图片 |
| CHS TextMap-only           | 对称；若当前可见性仍靠 CHS，先解除该阻塞                               | EN core 数值                            |
| config 关系／数值          | 对应 core、关联 locale 投影；结构变化触发双方 parity                   | 无关 UI messages                        |
| EN UI message              | EN UI／页面／SEO；共享编译 chunk 可能两边 hash 变化                    | 游戏文本解析、core、图片                |
| player aliases             | 对应 labels 与跨语言搜索页依赖                                         | official snapshots、完整 domain         |
| naming policy              | 受影响 locale names/catalogs/search；显式升版                          | 不相关敌人 HP                           |
| identity / parser / schema | 按契约升级相应 core/locale/search/shard 并拒绝旧缓存                   | 不可借旧 schema 静默复用                |

`sourceCommit` 是可复现 provenance，不应作为唯一内容缓存键；同一 config 字节在 TextMap-only upstream commit 变化时可复用 core，而 root manifest 记录本次 pin 和它复用了哪个 content digest。初期允许保守多重算，但不能在设计中声称“独立缓存”却仍把整个 commit 直接作为所有 core key。EN 文本改变可能需要重建 CHS **搜索页**的 secondary labels，这和无需重建 CHS domain/core 不矛盾。

缓存读取必须校验 schema、locale、coreDigest、关联 snapshot 与 parser/naming/rank 版本；写入先到暂存目录，验证所有产物后整体发布 manifest。offline 开发只允许复用 manifest 声明的完整同 revision 产物；部署缺 EN/不匹配必须失败。不得用 CHS 文件当 EN 命中缓存。保留当前“生成失败不能吞掉，只有上游不可访问时受控复用”的原则。

## 18. Upstream Update Impact

当前 updater 从 develop 重建 `automation/update-upstreams`，刷新 lock，执行 `data:search-names:update`、`data:player-aliases:sync`、`deploy:build`，只提交 lock + 中文 official snapshot + player alias skeleton；manual aliases 原值保留。i18n 应扩展该流程，不改变 main/develop/automation 分支策略、不改 sibling 状态。

后续在 `prepare.ts` 的既有网站内部 pinned checkout 加入 `TextMap/TextMapEN.json` sparse 规则；两张 TextMap 都以 lock 中同一 SHA 检出。`paths.ts/assertDataRoot` 改为按所需 locales 校验；asset index 即使目录名为 cn，也仍只作为 ID-based 视觉来源，不能拿其英文名称做 TextMap 替代。

Official snapshots 按语言同时生成并记录同 commit；更新 PR 分别列 names added/changed/removed、缺译、hash/provenance 变化、name-policy 变化、core parity 与两语言 deployment 检查。所有受影响 metadata 一次原子提交，不允许 lock 已推进而 EN snapshot 仍旧。现有 player alias 文件原样保留，EN 新目录仅补缺 ID 空壳；删除上游 ID 时列 orphan 给人工处理，不自动抹去人工别名。

CHS 或 EN canonical 缺译，停止该次 metadata promotion，保留上一完整部署；不自动翻译、拷贝别的语言或吞掉官方 snapshot 校验。任务只授权调查，本轮没有实际修改 workflow / sparse checkout / snapshot。

## 19. Testing Strategy

### 本轮执行与限制

| 检查                                                         | 本轮结果／范围                                                                                  |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| repo baseline、安装版本、三份 metadata hashes                | 已记录；结束再核对，见第 22 节                                                                  |
| 968 generated JSON / 4,754 build 文件大小、SHA-256           | 已只读测量，不覆盖现有构建                                                                      |
| 四类名称 TextMap coverage、长度、Endgame 8,167 locators      | 已完成，见第 3/6/16 节                                                                          |
| 原生 EN character naming prototype                           | 预期暴露阻塞：1001 official-base-name 中文断言失败；未运行完整 generator                        |
| 全 Excel Hash reference 扫描                                 | 首次因 duplicate key 中止；调整为逐文件记录错误后完成可解析范围，14 文件排除；未修改 raw parser |
| core/overlay 序列化成本 prototype                            | 已在内存测量；只输出 ignored 统计文件，无正式 artifacts                                         |
| 官方 library / Kit / SEO / Vercel / accessibility 调研       | 已完成；未安装库，无本项目 bundle benchmark                                                     |
| 报告 Markdown 格式、git diff 与写入边界                      | 交付前执行；最终状态见下方完整性记录                                                            |
| lint/check/check:scripts/test/data:validate/deploy build/e2e | **本轮未运行**；只写文档不重新生成生产数据，不标为本轮通过                                      |

前轮清理日志记录 385 unit tests、229 E2E passed / 3 conditional skipped、normal/clean deployment build 通过；这些是历史参考，不是新增 i18n 的验证证据。没有 EN build、并发 locale SSR 实测、英文浏览器截图或 Vercel 实际部署，所以对应门禁仍待实施阶段完成。

### 未来分层门禁

1. **中性 parity**：两 locale 的实体 IDs、counts、relations、stats、level/progression、trace nodes、relic properties、Endgame stage/slot/wave/locators、精确 HP/韧性和 mechanics 逐项一致；按定义剔除本地化字段后 canonical serialize + digest 比较，不能只检查 count。
2. **文本来源**：decimal-string hash；locale source commit 一致；必需名称解析；未解决 `{NICKNAME}`/gender/参数的白名单；token shape 可不同，参数使用／数值含义必须一致；未知 markup 分别报 locale diagnostics。
3. **命名与别名**：1001/1224、8001–8010、LD/base/enhanced；official provenance；manual 文件字节不变；EN 不能混入 CHS canonical；same name different ID 不误合并。
4. **Search V2**：原九级 CHS golden queries 相对排名与 dedupe 保持；cross-locale tier、NFKC/空格/符号、empty-query、alias authority、缺另一标签索引的显式错误、race protection；8,167 occurrence expansion 与旧分组逐项相等。
5. **缓存负测**：只改 EN 文本，coreDigest 不变；只改 EN UI 不重跑 data；错误 locale/digest/schema shard 被拒绝；旧 schema 与半生成目录不能通过 ensure；atomic manifest 与 legacy transition 回归。
6. **路由／SEO**：2,152 内容页面均生成并可 deep link；中文旧路径仍 200；切换 query/hash/filters；self canonical、双向 hreflang、正确 lang、sitemap parity；未知 locale 和共享 fallback 404 行为。
7. **UI**：四 overview/detail、首页、搜索、四 Endgame mode/season/enemy cards；desktop/mobile 长名字、200% zoom；按钮／tab／统计不重叠；截断时 hover/focus/Escape/touch；控制台 hydration mismatch 为零；日期跨界不偏日。
8. **完整工程回归**：`git diff --check`、lint、check、check:scripts、unit、data:validate、deploy:build 与 clean build；明确启动 clean output preview，现有 Playwright 复用它，运行完整 desktop/mobile，避免默认 build 覆盖产物。只在未来实施产生代码改动时执行并记录，不在本报告中虚构通过。

### Missing translation policy

| 内容                                      | 发布行为                                                   | 用户呈现                                             |
| ----------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------- |
| Site UI、aria、关键 SEO                   | key/params/plural 缺失直接 fail build                      | 不允许 key/raw CHS fallback                          |
| 实体 canonical name、路径／元素关键 label | 对发布实体 fail locale release                             | 不显示 raw hash/ID 代替名字，不少生成对应 route      |
| 关键技能／机制说明                        | 发布范围内缺译阻止该 locale release；结构 visibility 独立  | 不能悄悄丢技能、phase、buff                          |
| 非关键 flavor/story/source prose          | warning + 结构化 missing 状态，明确英文“翻译暂不可用”类 UI | 保留实体与数值，可主动查看标 lang 的原文，不自动混入 |
| 本来没有上游文本／内部隐藏配置            | 中性 inclusion policy 先决定是否在网站范围                 | 不对整个 TextMap 空引用一刀切 fail                   |
| 人工历史 changelog                        | 容器翻译必须完整；正文可显式标未译                         | 用户选择原文，不能伪装为 EN 正文                     |

## 20. Recommended Architecture

最终推荐组合为 **URL-driven locale + Paraglide site messages + hybrid game artifacts + stable Endgame atoms + locale-aware search labels + 全量双语 SSG**。不是增加一个全局语言 store 后在现有所有字符串上查表。

建议未来文件布局（本轮未创建）：

```text
messages/zh-CN.json                         # 网站 UI，人工维护
messages/en.json
project.inlang/settings.json
src/lib/i18n/{locales,routing,format}.ts    # URL/formatter，静态类型
src/lib/paraglide/                          # 编译输出，不手工改
src/params/locale.ts                        # 仅接受 en
src/routes/[[locale=locale]]/...            # 同一内容路由树
src/lib/generated/manifest.json             # core + locale indexes
src/lib/generated/core/enemies/...          # 大领域中性结构/数值
src/lib/generated/core/endgame/...
src/lib/generated/locales/zh-CN/...         # 小领域 full；大领域 overlay
src/lib/generated/locales/en/...
data/search/character-official-names.generated.json  # 中文旧路径保留过渡
data/search/en/character-official-names.generated.json
data/search/character-player-aliases.json    # 原字节及人工归属保留
data/search/en/character-player-aliases.json # 后续人工维护
static/generated/search/{revision}/targets.json
static/generated/search/{revision}/labels.zh-CN.json
static/generated/search/{revision}/labels.en.json
src/lib/content/changelog/{locale}/{entryId}.svx
```

`Locale` 与 `TextMapCode` 是不同类型；域计算函数不接收译后字符串来决定身份／类别。文本层输入为 source reference + locale + 参数，返回 token/text + provenance/missing status；页面 loader 只取当前 locale 的成品视图。小领域保留成熟类型，只有明确 mixed 字段挪到 locale 投影，不引入全站 `Record<string,unknown>` overlay 随意深合并。

locale core join 必须靠稳定 IDs，而不是 CHS 字符串或数组“碰巧同位置”。locale artifact 记录其依赖 coreDigest，加载时拒绝不匹配。Search 的另一语言是次级检索证据，不污染当前语言显示或 official provenance。版本迁移期间旧产物兼容必须明确版本／期限；部署仍保持现有静态方案与 upstream pin。

## 21. Staged Migration Plan

| 阶段                         | 小步交付                                                                                         | 进入下一阶段的证据                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| 0 基线／契约冻结             | 保存当前 CHS search queries、route list、metadata hashes、neutral parity fixture；确认本报告决策 | 现有完整回归通过；没有 schema/语义漂移                                        |
| 1 清除语言驱动逻辑           | 先 CHS-only 修改 enemy kind/tag 来源、special-effect 语义 reference、visibility、命名 service    | 中文页面行为、313 aliases 字节、九级排序、skill/phase/HP 全部保持             |
| 2 Endgame identity           | mt atoms、old bucket 映射、coreDigest locator、版本化 shards 与过渡协议                          | 173 旧桶→190 atoms→8,167 locators 集合/顺序不变；旧缓存负测                   |
| 3 Locale plumbing + UI spike | 加 locale 类型、Paraglide 固定版本、optional routes、html lang；先少量独立页面验证               | 两页并发 prerender/hydration、missing-key/type/plural tests、真实 bundle 计量 |
| 4 数据生成边界               | pinned EN extraction；小领域 full + Enemy/Endgame core/overlay；双 locale manifests/snapshots    | 所有 neutral parity 与缺译政策通过；EN-only 修改失效边界正确                  |
| 5 全 UI / 内容 / Search      | 逐组件消息提取、locale catalogs、cross-language labels、homepage、Changelog/errors               | 中文回归、实际 EN 页面、搜索 tiers、URL query/filter/hash 保持                |
| 6 SEO / 响应式 / 发布验收    | reciprocal alternates、sitemap、完整双语 SSG、长名 tooltip/wrap、部署 pipeline 扩展              | clean build + preview 全 E2E；实际发布大小/内存/时间；平台 404 行为明确       |
| 7 收尾                       | 对比本报告估算，删除到期兼容 artifacts，更新操作文档                                             | 明确兼容窗口结束、无旧客户端必要依赖，不静默清理                              |

每阶段独立 PR，不一次性切目录、领域模型、排序、资产管线。UI 库接入与大型 data join 可分开验证；正式对外 EN 导航只在该 locale 的 required parity 与内容门禁完成后开启，避免产生可索引但半中文的页面。不要把本调查作为已经授权修改生产代码的实施记录。

## 22. Risks / Open Questions

主要剩余问题：EN generation 尚未端到端执行；raw 技能/servant/LD/extra-effect 的实际消费 hash 覆盖需在参数化 generator 中按调用记录验证；FateRinOwner 的混淆字段是可用但脆弱的 Trailblazer 基础名 provenance；任意未匹配路径的无 JS 英文 404 受现有单 fallback 约束；i18n 库的真实 bundle、并发 prerender、Vercel 账户配额与峰值内存尚未实测。上述不确定性均有明确推荐和验收阶段，不留给实现者重新决定根本架构。

静态赛期状态由 build 时的 `now` 计算，语言切换不应制造两个 locale 状态不一致；应固定同一 generation clock。是否改成客户端实时刷新是独立功能问题。本轮也不调整历史“描述为空则隐藏”等中性 inclusion policy 的产品范围，只要求它不随 locale 缺译而漂移。

### 完整性与可复算证据

三份受保护 metadata 的开始／结束 SHA-256 必须相同：

| 文件                                                | SHA-256                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| upstream.lock.json                                  | `b504e90d8b2b7f604f6ba742a29feb1e6207140384cd206d617584e1b77ad5a8` |
| data/search/character-official-names.generated.json | `0c87ab39ee417f57b97fb9b288ad105356a5fc6fd6945f8fa8dfd49027bdc4c2` |
| data/search/character-player-aliases.json           | `09f600fa13d6108b4c95628d5c13fb0a3f62a8bf9492d7b82d630bec533b51e7` |

本地 ignored 证据：`data/audit/i18n/baseline.json`（全部既有 tracked hashes、repo状态、版本），`measure.ts` / `measurements.json`（大小、名字对照与 Endgame），`details.ts` / `details.json`（切分／coverage／UI），`extra.ts` / `extra.json`（展示候选／build分类／实例），`summary.json`（估算公式结果），`artifact-hashes.json`（generated/build 每文件 SHA），以及 registry release JSON。正式报告已收录核心结果；这些临时文件不作为必须提交的依赖。测量代码没有安装依赖，复用项目已有 tsx/lossless reader；全上游扫描中的重复 key 失败没有触发任何生产修复。

最终核对：既有 **290 个 tracked 文件**、**968 个 generated JSON**、**4,754 个 build 文件**的逐文件 SHA-256 全部不变；两个上游 HEAD/分支/工作区状态与开始完全一致，均 clean；三份 metadata 哈希相同。Git 仅显示本报告为新增未跟踪文件。报告包含连续 1–22 节和 20 项明确决策。`git diff --check` 通过；新文件额外执行 no-index whitespace 检查，仅有仓库 LF→CRLF 提示，无空白错误（no-index 的 exit 1 表示新增文件存在差异）。首次 `pnpm exec prettier` 未能解析命令，改为直接调用已安装的 Prettier 3.9.6 CLI，未安装依赖；单文件格式化及 `--check` 通过。正式工程回归未运行的状态保持不变。

### 20 项明确决策

1. 网站 locale：`zh-CN` / `en`，映射上游 `CHS` / `EN`。
2. 中文 URL：保持 root，旧路径不迁移。
3. English URL：采用 `/en/*`，slug 和 entity ID 不翻译。
4. 语言唯一来源：URL；storage / Accept-Language 不覆盖它。
5. UI library：Paraglide JS，锁定正式采用版本；本轮仅调查。
6. 游戏数据：hybrid；Enemy/Endgame core+overlay，其余小领域 per-locale，server/prerender join。
7. Endgame entry identity：`mt:{MonsterTemplateID}` 原子目标；locale 名称组引用 atoms，具体 occurrence 保留完整 context + revision。
8. 搜索：跨语言召回，当前语言 tier 优先，tier 内保留九级排序。
9. Player aliases：现有文件归属 zh-CN 且字节不动；EN 单独人工目录，不自动翻译。
10. Official aliases：per-locale snapshot，同 pin、同规则、独立 provenance。
11. Search bundle：共享 neutral targets/locators + per-locale labels；仅搜索页加载所需两种标签，不双份全量 domain。
12. Manifest：一个中性 root index + per-locale manifests，并校验相同 coreDigest。
13. Static routes：内容页增加 1,076，合计 2,152；fallback、shards、JSON 另计。
14. Build size：预计 735–790 MB，增加约 298–353 MB；尚非实测 EN build。
15. 真实长名高风险：Enemy 56、Light Cone 42、Relic 40、MOC 37、AA 33 字符；角色展示最大 27。
16. Ellipsis：受限 overview/compact 名字、已有 season card 截断、必要的紧凑导航；按实际 overflow。
17. Wrap：hero/详情标题、技能／机制／剧情正文、错误／空状态、tooltip 本体。
18. Tooltip/focus：所有实际截断的识别名；hover/focus/Escape，并有合法的独立触屏入口。
19. Blockers：中文 name hash identity、命名断言、enemy 中文 kind/tag 反查、“特殊效果”短语触发、文本存在性控制 membership、未解析 gender/NICKNAME。
20. 顺序：冻结 CHS 契约 → 去语言业务依赖 → Endgame identity → locale/UI spike → hybrid generator/manifests → 全站消息与搜索 → SEO/响应式/完整静态部署回归。
