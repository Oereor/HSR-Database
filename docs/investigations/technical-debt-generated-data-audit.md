# Technical Debt / Generated Data Audit

## 1. Executive Summary

2026-09-04，按 `Maintenance/Maintenance-08-Cleanup.md` 执行。范围为网站仓库，未实现 i18n、未改搜索语义、未修改两个 sibling upstream、未提交或部署线上版本。

发现按“可独立处理的事项”计数，不按字段实例数计数：**A 8、B 7、C 2、D 3、E 4，共 24 项**。A 类包含 5 项源码清理、2 项生成数据清理和 1 项当前文档澄清；其余保留。无依赖、package command、测试文件删除。

业务 manifest **35 → 36**。删除等级描述原始参数副本、收窄搜索构建缓存，generated JSON 减少 **507,242 bytes**。搜索 runtime JSON 字节内容未变。所有 968 个领域/public generated JSON，在只排除预定删除字段、业务 schema 编号和生成时间后，与基线内容摘要一致。

### Findings

| ID  | Item / Location                                    | Class                          | Evidence / Risk / Benefit                                                       | Action                                 |
| --- | -------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------- | -------------------------------------- |
| A01 | `LevelledEffectPanel.svelte`                       | A confirmed unused             | 无 import、动态加载、测试或配置消费者；旧通用等级面板已无职责                   | 删除                                   |
| A02 | `domain/types.ts` 的 `Skill`                       | A confirmed unused             | 唯一类型声明，无类型引用；现有角色使用 SkillVariant/SkillCard                   | 删除                                   |
| A03 | `assets/shared.ts::readCharacterIds`               | A confirmed unused             | 无调用；当前 ensure/sync/verify 读取完整 AssetRequirements                      | 删除                                   |
| A04 | `assets/shared.ts::manifestCoversCharacters`       | A confirmed unused             | 无调用；当前缓存契约使用 manifestCoversRequirements                             | 删除                                   |
| A05 | `domain/search-index.ts` normalization re-exports  | A confirmed unused             | 消费者直接引用 search/normalization；保留仍被 validator 引用的 schema re-export | 删除两个无用转出口                     |
| A06 | `LevelledDescription.params`                       | A confirmed unused             | 只由 normalizer 写出；显示、验证和分析不读取该输出副本                          | 删除输出，保留输入参数和诊断           |
| A07 | `search-inputs.catalogs.*` 的非 id/name 字段       | A confirmed unused             | SearchCatalogs 已只声明 id/name；全部消费者只使用这两项                         | 显式投影                               |
| A08 | `docs/refactor-status.md` 的当前状态歧义           | A obsolete documentation       | 内容按历史阶段记录旧 schema 和“后续”，容易误作当前待办                          | 添加历史性质说明；同步当前 Search 文档 |
| B01 | catalog 与 detail 的身份/显示文本                  | B intentional duplication      | overview 小载荷、detail 自包含；prerender 和展示均消费                          | 保留                                   |
| B02 | description 与 descriptionTokens                   | B intentional duplication      | UI 渲染 token；validator 校验拼接、空描述与回归文本                             | 保留                                   |
| B03 | scalingParamIndexes                                | B intentional duplication      | normalizer 用于识别动态参数，真实生成结果由测试锁定                             | 保留                                   |
| B04 | Enemy.defaultMonster / weaknesses                  | B intentional compatibility    | validator、真实数据测试仍检查 canonical 投影；详见 §6                           | 保留                                   |
| B05 | Endgame factors / provenance / raw buff evidence   | B intentional audit data       | HP 回算、模式关系验证、诊断和 fixture 契约                                      | 保留                                   |
| B06 | search-inputs / runtime bundle / occurrence shards | B intentional cache            | alias-only 重建、浏览器召回和按需赛期展开各有职责                               | 保留                                   |
| B07 | 四个 CatalogPage 和领域卡片                        | B acceptable duplication       | filter 语义、排序、pageSize、展示职责不同                                       | 保留，不强行抽象                       |
| C01 | SkillVariant 的 type/order 输出                    | C probably unused in rendering | 排序和分类发生在生成期；尚未完成独立于生成输入的契约拆分证明                    | 不删除                                 |
| C02 | 部分 Endgame stageAbilities / abilityReferences    | C probably unused in rendering | 不是当前卡片展示字段，但属于配置调查上下文；无足够删除证据                      | 不删除                                 |
| D01 | CatalogEntry 宽 optional 字段与 Enemy view 透传    | D dynamically referenced       | options(key,labelKey)、对象投影、跨领域继承不能凭 grep 删字段                   | 保留                                   |
| D02 | 按本地化名称生成的 Endgame entryId                 | D locale-sensitive identity    | SHA-256(name) 同时进入 locator/shard 链；改动会跨越搜索契约                     | 留待 locale-aware generation 调查      |
| D03 | Vite / Svelte plugin peer 版本组合                 | D compatibility uncertainty    | 本地直接 plugin 的 peer 范围与 Vite 7 不同；当前构建通过不等于未来升级安全      | 记录，不迁移依赖                       |
| E01 | 28 个 dependencies/devDependencies                 | E must preserve                | runtime、CLI、配置、peer 与 typing 均有职责                                     | 全保留                                 |
| E02 | deployment / updater / diagnostic commands         | E must preserve                | package scripts、workflow、显式维护工具及验证器入口                             | 全保留                                 |
| E03 | visual asset manifests、fallback、闭包验证         | E must preserve                | 当前 UI 引用和部署验证依赖；无确认废弃类别                                      | 不改资产管线                           |
| E04 | lock、官方名称 provenance、玩家 aliases            | E must preserve                | 构建一致性与人工维护契约                                                        | 核对哈希，不改语义或格式               |

A/B/C/D/E 分别为 confirmed unused、redundant but intentional、probably unused、uncertain/dynamically referenced、must preserve。低引用次数、只参与测试或不直接展示都不是 A 类证据。

## 2. Repository / Build Baseline

网站分支 `develop`，开始时工作区干净，HEAD `f74b68a9703ebbb196b069255c38e9f80775c968`。两个 sibling 仓库起始均干净：

- TurnBasedGameData/main：`8cdb905dc2f8e6fffa9be4eb07af3e34435d6091`。
- StarRailRes/master：`d226befe3db13f2ec15f4161d5f34b1b607643fe`。

Node 22.19.0 / pnpm 11.9.0，Windows。代理 127.0.0.1:7890 已验证可连接，联网构建通过进程级 HTTP_PROXY/HTTPS_PROXY/ALL_PROXY；没有写全局 Git 或代理配置。上游 Git 状态读取使用命令级精确 safe.directory。TurnBasedGameData 无 LICENSE，已阅读其 README；StarRailRes README/AGPL 文件已检查，维持已有数据/资源处理方式。

修改前 lint、check（含 scripts）、384 个 unit tests、data:validate 和 deploy:build 全部通过。基线完整部署构建耗时 216.197s；未造成 tracked 变化。初始现有 build 437,368,377 bytes，重新基线构建后为 437,369,458 bytes；后者用于 before/after，避免把既有产物与新构建的细微差异记为清理收益。

统计口径：源码为 src/scripts/tests 下 .ts/.svelte/.svx/.css；LOC 是物理换行数；不含报告与 generated JSON。generated 为 src/lib/generated 和 static/generated 的所有 JSON，未重复计算其 build 副本。所有体积为未压缩 UTF-8/文件字节，不是网络传输量或性能 benchmark。

## 3. Dead Source Code Audit

检查 src、scripts、tests 的模块/导出、字符串引用和入口；核对 filesystem routes、params matchers、app 声明、package scripts、Vite/Svelte/ESLint/Prettier/Playwright 配置及 workflow。动态路径只有已识别的 changelog `.svx` glob、changelog component 渲染、调查工具与 Node built-in import；未发现组件目录扫描加载旧面板。

路径引用候选还包括 assets/data validate、debug-pf-hp、两个 investigations、app.d.ts 和 changelog/index；前五类由 CLI/文档调用，app.d.ts 为框架声明，changelog 通过目录 index 导入。

辅助 `tsc -p tsconfig.scripts.json --noEmit --noUnusedLocals --noUnusedParameters` 通过；不永久启用新 flags。导出扫描产生的“大量无外部调用类型”多数被同模块签名使用，不能删。A01–A05 的定义之外没有消费；其余未建立 A 类证据。

## 4. Component Audit

[组件调用清单](technical-debt-components.csv) 覆盖基线 84 个 lib components，含删除的旧面板；剩余 83 个都有源码调用。清单区分生产与测试调用，文件名匹配仅用于索引，删除前另核实动态入口。

| 候选                                     | Production callers                       | Test callers                  | 职责 / 处理                                     |
| ---------------------------------------- | ---------------------------------------- | ----------------------------- | ----------------------------------------------- |
| LevelledEffectPanel                      | 0                                        | 0                             | 无职责；删除                                    |
| SkillProgressionPanel / SkillVariantView | SkillCardPanel、SpecialEffectRelation 等 | detail E2E 间接覆盖           | 共享 progression 与独立 variant 展示；保留      |
| SuperimpositionPanel                     | DetailPage                               | 光锥 detail E2E 间接覆盖      | 叠影等级、被动名称与默认选项；保留              |
| 四个 Entity Overview wrappers            | 各 CatalogPage、首页/推荐等              | shared-ui/site E2E            | 使用现有 EntityOverviewCard，领域语义不同；保留 |
| Endgame modes / mechanics wrappers       | mode detail 组件                         | endgame presentation/unit/E2E | 模式差异与槽位布局；保留                        |

没有把 single-use、视觉相似或已有 primitive 当作删除理由。旧面板使用的 description、range 样式仍被现役面板消费，未删共享 CSS。

## 5. Duplicate Logic Audit

四类 overview 均使用查询草稿同步、URL 参数、分页和 GameText 转普通文本，但角色/光锥为多选过滤，遗器是单 category，敌方还有弱点和 rank 优先级；pageSize 与排序也不同。未发现需要以小纯函数修复的行为不一致。本轮不合并页面状态逻辑。

GameText、元素映射、rarity、stat decimal、资产 resolver 和 Endgame presentation 已有共享模块。保留 runtime/domain decimal 与 build 精确运算的边界。Global Search 使用独立 normalization/ranking；overview 继续搜索 name + description，不引入 FlexSearch。

## 6. Domain Model Field Audit

| Model / fields                                                        | Producer → reader / contract                                                                             | 结论                                                          |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| CatalogEntry id/name/description/rarity/path/element 及 display names | sync → catalog/detail → overview filters/cards、DetailPage、首页、推荐、Search 展示；动态 options 读取键 | 保留                                                          |
| Character fullName/profiles/baseStats/equipmentRecommendation         | sync + skills/stats → detail → DetailPage、各 panel、推荐 resolver、validator                            | 保留                                                          |
| LevelledDescription level/description/descriptionTokens               | levelled normalizer → character 与 light-cone detail → selectedLevel UI、validator 文本一致性            | 保留                                                          |
| LevelledDescription params                                            | rawInputs.params → interpolation/diagnostics；输出副本之后无 reader                                      | 仅删除输出副本；8,173 条记录                                  |
| SkillVariant / Superimposition scalingParamIndexes                    | normalizer → buildSkillVariant/passive → data tests 对真实动态数值回归                                   | 保留契约，不顺带删除                                          |
| Trace/Eidolon/SpecialEffects                                          | sync + relation helpers → detail → trace-groups/dialog/token renderer；validator 验证 relation           | 保留                                                          |
| LightCone story/passive/baseStats                                     | sync → DetailPage、SuperimpositionPanel、BaseStatsPanel                                                  | 保留                                                          |
| Relic category/effectRequirements/version/effects/pieces/sources      | sync → filter、RelicDetailPage、推荐部件；版本由 detail 展示                                             | 保留                                                          |
| Enemy template/monsters/defaultMonsterId                              | sync/enemy-detail → server/enemies → enemy-view → stats、skill definitions/references、summons           | 保留                                                          |
| Enemy.defaultMonster、顶层 weaknesses                                 | sync → validate canonical equality / catalog projection、data tests                                      | 保留兼容契约；不是当前 enemy-view/Endgame renderer 的必需副本 |
| Endgame identity/waves/factors/mechanics/provenance                   | endgame generator → endgame-view、server shards、validate、debug-pf-hp、tests                            | 展示与诊断分工；不重写                                        |

Enemy.defaultMonster 序列化 value 合计 24,688,424 bytes；monsters 为 103,523,153 bytes。虽然体积显著且当前 view 会剔除 defaultMonster，validator 和测试仍要求一致性，不能把“仅 UI 不读取”作为删除证据。顶层 weaknesses 的旧注释也不能被当作仍有 renderer 使用的证明。

## 7. Generated Data Field Audit

[字段清单](technical-debt-generated-fields.csv) 记录清理后 **1,004 个实际出现的标量路径**、类型、实例数、标量 UTF-8 bytes、locale 分类和源码候选文件。数组用 `[]`、数字 dictionary key 用 `*` 归并；同名字段命中的文件不等于消费者证明，最多列 8 个候选并记录总数。空数组/空对象不产生标量行，结构契约另按 types 与下面的 artifact 链核查。此清单不能作为自动删除白名单。

| Artifact / 字段组                                                                                               | Producer                                                | Consumers / dynamic handling                                                                  | 分类                   |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------- |
| catalogs/characters：全部 8 类字段                                                                              | sync character catalog                                  | getCatalog、CharacterCatalogPage、cards、首页/推荐、动态 options(key,labelKey)                | B/E                    |
| catalogs/light-cones：id/name/description/rarity/path/pathName                                                  | sync lightCone catalog                                  | getCatalog、LightConeCatalogPage、cards、推荐、首页                                           | B/E                    |
| catalogs/relics：id/name/description/version/category/effectRequirements/type/typeName                          | sync relic catalog                                      | getRelicCatalog、RelicCatalogPage、RelicDetailPage、推荐；跨领域继承                          | B/D/E                  |
| catalogs/enemies：id/name/description/type/typeName/weaknesses                                                  | sync enemy catalog                                      | getEnemyCatalog、EnemyCatalogPage、rank/weakness helpers、资产 requirements                   | B/E                    |
| catalogs/relic-properties：propertyType/name/iconKey/allowedMainSlots/canBeSubStat                              | sync                                                    | 推荐 resolver、RelicPropertyToken、资产 pipeline、validate                                    | E                      |
| details/characters：catalog 投影、fullName、profiles.*、baseStats、equipmentRecommendation                      | sync + levelled/skills/stats/relations                  | detail route、Object.values(profiles)、SkillVariantView/SpecialEffectDialog、validator、tests | A06；其余 B/C/D/E      |
| details/light-cones：catalog 投影、story、passive、baseStats                                                    | sync + levelled/stats                                   | detail route、SuperimpositionPanel、BaseStatsPanel、validator                                 | A06；其余 B/E          |
| details/relics：catalog 投影、effects、pieces、sources                                                          | sync                                                    | RelicDetailPage、推荐、validate                                                               | B/E                    |
| details/enemies：template、monsters、defaultMonster*、weaknesses、技能与 stats                                  | sync + enemy-detail/stats                               | server/enemies → 显式 enemy-view 投影；validate 深层 canonical 比较；测试                     | B/D/E                  |
| endgame/moc,pf,as,aa：schema/mode/groups、encounters/battles/stages、waveModel、occurrences、buff 与 provenance | endgame + maze-buffs + as-boss-guides + pure-fiction-hp | server/endgame、domain/endgame-view、debug-pf-hp、validate、unit tests；判别联合与遍历        | B/C/E                  |
| homepage：schemaVersion/avatarUps/weaponUps、gachaId/实体 ID                                                    | homepage builder                                        | getHomepageRecentWarps、首页 catalog join、assertHomepageRecentWarpData                       | E，基本 locale-neutral |
| manifest：schema/source*/gameVersion*/generatedAt/language/counts/routes/endgame                                | sync                                                    | ensure/validate、layout、sitemap、route entries、data:audit                                   | E                      |
| static/generated/meta.json                                                                                      | manifest 的公开副本                                     | 静态 metadata/诊断契约；不是死字段集合                                                        | B/E                    |
| search-inputs：official/catalogs/endgameEnemies                                                                 | sync                                                    | buildSearchDocuments、ensureSearchDocuments、data:validate、metadata tests                    | A07；其余 B/E          |
| static/generated/search.json：版本/sourceCommit/digest/documents/endgameEnemies                                 | search-documents                                        | search service、ranking、target validation、server shard entries                              | B/E                    |
| generated/endgame-occurrences/[entryId].json：schema/entryId/periods/occurrences                                | server route prerender                                  | search/endgame fetch + cache、locator keys、runtime 展开                                      | B/E                    |

完整 producer/consumer 链显示 A07 只需要 id/name：SearchCatalogs 原有类型已如此定义；buildSearchDocuments 取 catalog.id/name，validateSearchTargets 枚举 id；搜索 UI 的 rarity/path/description 来源是正常 catalog，并非该构建缓存。实际移除的额外字段是四类 catalog 中除 id/name 外的属性，实体 catalog/detail 本身不受此投影影响。

## 8. Intentional Duplication

B01–B07 均保留。尤其不得把 full detail 与 light catalog 的身份字段、运行时 normalized search cache、Endgame locators/shards、视觉 manifest、official provenance 或审计报告看作无意义重复。搜索缓存收窄减少的是错误进入 build cache 的额外字段，不减少 runtime 的内容过滤范围。

## 9. Search V2 Audit

未改 SearchDocument schema 2、normalization 1、naming policy 1、官方快照 schema 1、shard schema 1 或排名规则。runtime documents 仅有 key/target/canonicalName/officialAliases/playerAliases；官方来源 table、hash 与 canonicalSource 保留在 build metadata，未进入 documents。运行时 normalization 在 adapter/service 内建立，用于召回和证据分类。

旧 search-index normalization 转出口删除，真正实现和直接调用保持不变；GLOBAL_SEARCH_SCHEMA_VERSION 转出口仍被 validator 使用，保留。

端到端生成对比确认 runtime search.json 与清理前字节一致。新增真实 generated cache 的窄字段测试，并验证它仍生成完全相同的 bundle；已有 alias-only rebuild、非法 metadata 和 FlexSearch oracle tests 保留。

## 10. Deployment / Scripts Audit

所有 package scripts 均指向存在的命令。data:ensure/sync/validate、assets:ensure/verify、deploy:build/clean 是生产关键链；data:audit、debug:pf-hp、investigate:enemy-variants 是显式维护入口，search-performance 由 Search 文档引用，不能按“没有静态 import”删除。

业务 schema 36 同时更新 sync、ensure 的可用上游/离线上游分支和 validate。实际对旧 schema 35 运行新 validator，按预期失败；随后 data:ensure 从锁定的 .upstream 数据重新生成 36。未加入可选字段 fallback；Search 只收窄既有 build input 契约，不改变其 wire schema。

main=Production、develop=Preview、upstream.lock pin、updater PR → develop → manual review 均保持。workflow 的官方名称/alias 更新属于原有显式维护步骤，本次未调用。clean 使用固定目录白名单、拒绝 tracked artifact 与链接父目录，并自带 metadata hash 校验。

## 11. Dependencies Audit

28 个声明依赖全部保留，lockfile 未变；未执行依赖升级/迁移或无意义 reinstall。

| 类型                                     |      Before |       After |
| ---------------------------------------- | ----------: | ----------: |
| HTML                                     | 163,665,703 | 163,498,978 |
| 图片/字体等 assets                       | 135,008,599 | 135,008,599 |
| JSON                                     | 127,460,495 | 127,168,222 |
| JS                                       |     490,339 |     490,339 |
| CSS                                      |     120,510 |     120,510 |
| other（含 SvelteKit serialized data 等） |  10,623,812 |  10,623,812 |
| Total                                    | 437,369,458 | 436,910,460 |

HTML 最大，其次 assets、JSON。source/generated 目录并非全部原样公开：enemy-view 会裁剪 detail，Endgame route 又预渲染按需 shard，因此源 JSON 总量不能直接当作下载量。最终 before/after 见 §19；源码删除字节不计作浏览器 bundle saving。

## 16. i18n Readiness

### 字段与重复成本

locale-dependent 主要在 character profiles 的 skill/trace/eidolon text、光锥 story/passive、遗器描述、敌方技能、Endgame buff/展示文案；locale-neutral 主要是 ID、数值、关系、等级进阶、关卡编队、日期和配置 identity。descriptionTokens、带 display label 的结构、名称派生搜索 identity 属 mixed。

下表是清理后源/public generated artifact 的 UTF-8 估算。方法：遍历全部 JSON 标量，name/description 等显示字段归文本；token.value 与其余含汉字标量归 mixed；其他标量暂归 neutral。固定键、括号、标点及换行单列 structure，避免假装对每个嵌套对象精确归因。ASCII 显示文本、按名称派生 identity 和未来语言长度变化会影响估算，不能把 neutral 列视为最终可拆分 schema。

| Artifact                  |           Total | Text-heavy + mixed | Neutral scalars |  JSON structure |
| ------------------------- | --------------: | -----------------: | --------------: | --------------: |
| catalogs/characters       |          31,477 |             20,774 |           2,262 |           8,441 |
| catalogs/enemies          |         270,606 |            166,650 |          26,471 |          77,485 |
| catalogs/light-cones      |          33,098 |             20,089 |           2,698 |          10,311 |
| catalogs/relic-properties |           2,940 |                348 |           1,006 |           1,586 |
| catalogs/relics           |          19,901 |             12,335 |           1,652 |           5,914 |
| details/characters        |       8,057,140 |          4,395,143 |       1,018,049 |       2,643,948 |
| details/enemies           |     128,678,999 |          3,190,437 |      44,977,867 |      80,510,695 |
| details/light-cones       |         972,407 |            445,992 |         137,028 |         389,387 |
| details/relics            |          76,687 |             53,605 |           4,612 |          18,470 |
| endgame/aa                |         485,818 |             30,637 |         255,485 |         199,696 |
| endgame/as                |       1,075,515 |            196,161 |         523,203 |         356,151 |
| endgame/moc               |      13,484,263 |            374,781 |       6,973,728 |       6,135,754 |
| endgame/pf                |      27,474,487 |            389,892 |      12,953,014 |      14,131,581 |
| homepage                  |             492 |                  0 |             127 |             365 |
| manifest                  |           9,436 |                  0 |           7,918 |           1,518 |
| search-inputs             |       1,003,011 |             24,585 |         127,910 |         850,516 |
| public/meta               |           9,436 |                  0 |           7,918 |           1,518 |
| public/search             |       1,111,420 |             30,986 |         154,070 |         926,364 |
| Total                     | **182,797,133** |      **9,352,415** |  **67,175,018** | **106,269,700** |

若简单复制一整套 English artifact，在结构/记录数量相同假设下，约 **67.18 MB neutral 标量**重复；连同同形 JSON 键与结构，重复规模可达约 **173.44 MB**。9.35 MB 是当前 text-heavy/mixed 标量规模，非 English 最终字节预测。保守把结构归属作为不确定部分，报告 neutral duplication 的估算区间 67.18–173.44 MB。敌方等级 stats 与 PF/MoC encounter 数据是最大来源。未重复纳入 build 内的 HTML、shards 或数据副本，也未声称这些字节均可无成本消除。

### 用户可见硬编码中文

[UI inventory](technical-debt-ui-text-inventory.csv) 按文件/类别/粗略数量/行号记录 **71 个文件、423 个中文 literal/text 片段**。Svelte AST 与 TypeScript AST 提取，排除注释、throw/console、server lib 诊断、changelog fail、仅错误上下文使用的 label，共排除 65 个诊断片段。片段可能属于同一完整 message，不是最终翻译 key 数；分类按邻近语法粗分，少量 heading/tooltip/metadata 边界需下一阶段复核。route error(404) 是用户可见错误，保留在 inventory。

集中于 DetailPage/EnemyDetailPage、四个 CatalogPage、Navigator、search route、Endgame components/domain view、navigation/constants 和站点标题。覆盖 navigation、buttons、empty states、filters、headings、tooltips、aria、metadata、用户错误、Endgame/Search/changelog UI；日期格式位于 changelog/domain 与 Endgame presentation，数字/locale 格式还需单列调查。按需求只扫描 .svelte/.ts；.svx changelog 正文属于内容翻译，未混入 UI 片段数。

### 下一阶段重点（不做架构选择）

1. 敌方多等级数值与 Endgame 编队数据的复制成本高于多数界面文案。
2. 当前 loader 的固定生成路径、manifest.language='CHS'、format/sort 中 zh-CN，以及共享 TextMap resolver 的 locale 边界需调查。
3. Endgame 名称桶由本地化 name 的 hash 建 entryId；跨语言 identity、alias 与 shard 关系不能直接复用中文名称假设。
4. Skill markup 的性别/富文本 token 和“特殊效果”触发短语含语言语义；需独立核实，不做机械字符串替换。
5. homepage 已是 ID relation，适合保持语言中性；诊断 provenance 与 player-maintained metadata 应继续和 UI messages 分开。

本轮不选择 full artifacts 或 neutral core + overlay，不生成 EN JSON，不改 URL/SEO/语言开关。

## 17. Cleanup Implemented

| Item | Producer / Where                         | Consumers searched / Why safe                                                                                                | Replacement / Coverage / Measured effect                                                        |
| ---- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| A01  | 旧 LevelledEffectPanel                   | src/scripts/tests/config/workflow 无 caller；没有 components glob                                                            | SkillProgressionPanel、SuperimpositionPanel 已独立工作；全套 browser gates；删 58 行            |
| A02  | 旧 Skill interface                       | TS 类型和组件脚本无引用；其余 Skill 字符仅诊断文字                                                                           | SkillVariant/SkillCard；check/check:scripts；删 8 行及空行                                      |
| A03  | readCharacterIds wrapper                 | 定义之外无引用，无 namespace/dynamic dispatch                                                                                | readAssetRequirements；visual-assets/unit/build verify；删 4 行                                 |
| A04  | manifestCoversCharacters                 | ensure/sync/validate 均调用完整 requirements checker                                                                         | manifestCoversRequirements；资产与部署 gates；删 11 行                                          |
| A05  | normalization re-exports                 | 所有 normalization caller 已直接 import search/normalization                                                                 | 不动实现与 schema re-export；search/FlexSearch tests；删 1 行                                   |
| A06  | levelled.ts → LevelledDescription.params | UI selected levels 仅读文本/token/level；validator 读取 description；diagnostics 在生成时已有独立出口；唯一 fixture 同步更新 | 保留 rawInputs.params、interpolation 与 diagnostics；normalizer/real-data/E2E；减 194,949 bytes |
| A07  | sync → search-inputs.catalogs            | buildSearchDocuments、ensureSearchDocuments、validateSearchTargets、data:validate、tests 均遵循 id/name                      | 显式 map 投影；新增真实 cache 契约测试、bundle equality；减 312,293 bytes                       |
| A08  | 当前文档入口                             | 阶段性记录被误读成当前状态的风险                                                                                             | 历史内容不删；补入口说明并更新 schema 文档                                                      |

A06 中 character details 减 174,615 bytes，light-cone details 减 20,334 bytes。没有删除 Endgame params、TextMap hashes、description、scalingParamIndexes、官方 provenance 或任何 alias。

## 18. Findings Not Cleaned

B/C/D/E 全部保留，详见 findings 表。尤其 B04 的 24.69 MB defaultMonster 副本确有现存契约；C01/C02 暂无足够安全删除证据；D01 的动态 optional 模型不因未生成某个字段而缩窄，D02/D03 留到各自架构/版本调查。没有为不确定项添加新 shim、fallback 或 deprecated wrapper。

## 19. Before / After Measurements

| Metric                |      Before |       After |    Delta |
| --------------------- | ----------: | ----------: | -------: |
| source files          |         246 |         245 |       -1 |
| relevant source LOC   |      41,897 |      41,823 |      -74 |
| relevant source bytes |   1,492,734 |   1,490,941 |   -1,793 |
| generated JSON count  |         968 |         968 |        0 |
| generated JSON bytes  | 183,304,375 | 182,797,133 | -507,242 |
| search JSON bytes     |   1,111,420 |   1,111,420 |        0 |
| build total bytes     | 437,369,458 | 436,910,460 | -458,998 |
| dependency count      |          28 |          28 |        0 |
| unit test count       |         384 |         385 |       +1 |

同一固定 upstream 和统计口径，After 为成功 clean build 产物。generated 减 507,242 bytes（约 0.277%），build 减 458,998 bytes（约 0.105%）。HTML 减 166,725、JSON 减 292,273；assets、JS、CSS、other 的总字节数相同。构建内容还包含生成时间与 chunk identity，不把所有差异声称为纯字段净收益，更不把源码 LOC 减少当作 JS 节省。报告与 CSV 审计附件不计入源码 LOC。

## 20. Verification Results

- Baseline：lint/check/test/data:validate/deploy:build 全通过；32 files / 384 tests。
- 清理后：lint、check（0 errors/0 warnings）、check:scripts、385 tests、data:validate、正常 deploy:build 全通过。正常构建 246.461s。
- 旧 schema 35：新 validator 拒绝（预期负向结果）；data:ensure 从固定 upstream 重建 36 成功。
- 内容对比：968 artifacts 的非预定变化为 0，残留 LevelledDescription.params 为 0。
- `pnpm deploy:build:clean` 通过，602.604s；两个 upstream 从空缓存重新准备，enemy 图片下载 210、复用 0，原有 23 条缺图继续 fallback；资产引用闭包 2,215 个文本文件通过。
- 已显式启动 clean 产物 preview（4173），`pnpm test:e2e --workers=2 --reporter=line` 在 desktop-chromium 与 mobile-chromium 两个完整项目通过：**229 passed / 3 条原有条件 skipped / 0 failed**，耗时 2.2m；无 retry。未改 Playwright 配置，日志无二次构建；测试前后全部 **4,754 个 build 文件 SHA-256 一致**。
- clean generation 后再次 `pnpm data:validate` 通过；`git diff --check` 通过。全量 E2E 覆盖首页、四类 overview/detail、全局搜索、Endgame mode/season/enemy cards、角色等级/加强/特殊效果、光锥等级/叠影、移动导航与缺图 fallback。

基线初次沙箱执行出现 esbuild 父目录 access denied；首次临时审计脚本使用 .cjs 被 ESLint 纳入扫描。前者用正常用户权限重跑，后者将临时脚本移入不作为源码扫描的 .txt 后重跑。未为此修改任何质量配置或 suppress，重跑 baseline 全通过。data:validate 保留基线已有的 544 个缺失 TextHash 警告及缺失文本审计 A/B 记录（1,614/25）；这里的 A/B 是文本诊断分类，和本报告清理置信度无关，不将它们伪装为本轮修复。完整日志与中间测量位于 ignored `data/audit/cleanup/`，关键结果写入本报告。

### Metadata integrity

三份文件从 baseline 到 clean build 的 SHA-256 全部一致：

| File                                                  | SHA-256                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------ |
| `upstream.lock.json`                                  | `b504e90d8b2b7f604f6ba742a29feb1e6207140384cd206d617584e1b77ad5a8` |
| `data/search/character-official-names.generated.json` | `0c87ab39ee417f57b97fb9b288ad105356a5fc6fd6945f8fa8dfd49027bdc4c2` |
| `data/search/character-player-aliases.json`           | `09f600fa13d6108b4c95628d5c13fb0a3f62a8bf9492d7b82d630bec533b51e7` |

两个 sibling upstream 的 HEAD、branch 和干净 Git status 与 baseline 完全相同；网站 upstream.lock、官方名称快照、玩家 aliases 均无 tracked diff。

## 21. Recommended Next Steps

优先调查敌方数值/Endgame 数据的 locale-neutral 边界、名称派生搜索 identity、UI inventory 与格式化入口。C/D 项需另建契约证据才能清理；依赖 peer 升级单独验证。不得以本报告的自动候选列表直接删字段，也不据此提前实施 i18n 架构。
