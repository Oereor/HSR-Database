# 搜索机制与维护

全局搜索由 FlexSearch 0.8.212 召回候选，网站代码负责名称来源、归一化、排名、实体关联与展示。
本文件是现行搜索维护入口；数据与 locale 边界以[权威架构](architecture/localization-and-data-generation.md)为准。
初次名称桶设计、性能测量和阶段验收见[搜索实施历史](investigations/search-v2-implementation-history.md)，不作为当前数量或性能保证。

## 名称来源与身份

[scripts/data/character-names.ts](../scripts/data/character-names.ts)是角色 catalog/detail 与官方搜索名称的共享 builder。
身份使用 `String(AvatarID)`，普通与 LD 表保持冲突检查；显示名称经 GameText 转 plain text 后成为搜索 canonical，卡片仍使用 catalog model。
多命途与官方别名由审阅过的结构化来源确定，不扫描任意 TextMap hash 猜别名。

| 维护输入                                                                                          | 所有权                                                                                   |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [character-official-names.generated.json](../data/search/character-official-names.generated.json) | pinned 中文官方名称、来源字段、十进制 text hash 与政策，由显式命令生成，不手改           |
| [character-player-aliases.json](../data/search/character-player-aliases.json)                     | 维护者按真实 AvatarID 填写 `playerAliases` 数组；官方快照决定合法 ID，不替维护者填写内容 |

中文与英文分别构建各自名称及 search bundle，使用匹配语言的 TextMap；人工 player aliases 仅用于 `zh-CN`。
同名不同 ID 不合并；别名只参与检索，卡片展示正式名称。实体数量随 pin 变化，不写入维护规则。

Endgame 搜索目标以稳定 `MonsterTemplateID` 标识，同一目标关联具体 mode、赛期、关卡、波次与 Monster occurrence locators。
目标显示名称由本语言 Enemy 投影提供，身份不依赖文本 hash 或名称桶；缺少必要名称会报错，不悄悄删除出场记录。

## 人工别名维护

人工文件的 `characters` 以官方快照中的 AvatarID 为 key，每项形状为 `{ "playerAliases": string[] }`。
别名必须非空，归一后非空，且无 placeholder 或显示 markup。
同角色内原文/归一重复、与 canonical/official 重复、非法 ID、类型或额外字段均失败；跨角色共享别名合法，各自召回。
生产 metadata 必须覆盖全部 searchable ID，空数组合法。

修改后刷新产物，并按变更范围验证：

```bash
pnpm data:ensure
pnpm exec vitest run tests/unit/search-metadata.test.ts tests/unit/search.test.ts
pnpm data:validate
```

`data:validate` 需要已准备的数据输入，完整语义审计不能由仅检查文件完整性的 gate 替代。
如果改动涉及浏览器搜索行为，再执行相关 Search E2E；日常 metadata 修改不默认运行所有测试层。

## 官方名称与上游更新

```bash
pnpm data:search-names:update
pnpm data:player-aliases:sync
pnpm data:search-names:check
```

名称 update/check 读取 [upstream.lock.json](../upstream.lock.json)，在网站内部准备并核对 pinned checkout，不修改相邻上游。
只有显式 update 写入 tracked 官方快照；失配时 check 报错，不自动修复。
普通 `data:sync` 使用配置的本地源生成 ignored 数据，不更新 tracked 名称快照。

skeleton sync 只读取 tracked 官方快照，为缺失 AvatarID 插入空数组，保留已有 alias 字符串、数组顺序、转义、空白与换行。
没有新 ID 时不写入；stale/非法 ID、非法 schema 或 alias 在写入前失败，由维护者处理，不自动删除旧 entry。
审阅两份 metadata 的实际 diff，再按[上游维护流程](vercel-deployment-foundation.md#上游与-enemy-snapshot-维护)验证。
`data:ensure`、validator 与 deployment profile 只校验人工文件，不同步或填写它。

Development 与完整 CI profile 在输入准备后执行名称 check；Production 使用 build-input integrity gate，不执行独立名称 check 或完整语义审计。
完整正确性边界使用 `pnpm ci:validate`。

## 产物与查询流程

`src/lib/generated/views/{locale}/search-inputs.json` 保存本语言名称、catalog 的 `id/name` 投影及稳定 Endgame 目标。
公开 bundle 位于 `static/generated/{locale}/search.json`；出场 shard 通过 `/generated/{locale}/endgame-occurrences/{targetId}` 预渲染 endpoint 发布，不由静态源文件遮盖。
生成数据 manifest 版本由源码与架构契约决定，历史报告中的版本不能用于当前排障。
有效缓存下的 alias-only 变更复用输入并增量刷新中文搜索产物；非法 metadata 不进入离线 fallback。

[createGlobalSearchService](../src/lib/search/search.ts)是生产查询入口：

1. label 经 GameText → plain text → NFKC → lowercase → 删除空白与 `·•・—_-/`；query 不解析 GameText，其余标点保留。
2. FlexSearch `Document` 使用 `tokenize: 'full'`、`Charset.Exact` 加显式空白分词，索引 canonical、official aliases、player aliases；三个字段按完整 document 数量召回并去重。
3. 排名依次为 canonical/official/player 的 exact、prefix、contains，共九级；同级按归一 canonical、固定领域顺序与 stable key 的 Unicode 码点顺序比较。
4. 普通与 Endgame exact/partial 同时保留，每个 document 只产生最佳 evidence；普通目标返回原 catalog model。
5. 命中 Endgame 目标后按 locale 与 targetId 加载 shard，Promise 缓存合并并发，失败移除缓存供重试；按 locator 去重并保持赛期及出场顺序。
6. 页面丢弃迟到请求结果，单个目标加载失败保留其他可用结果并显示不可用状态；每个普通类别及 Endgame 模式首批 100 张，每次增加 100 张，service 保留完整结果。

当前实现没有 Worker、数据库、模糊检索或 suggestions。
对应模块见 [search/](../src/lib/search/)与 [search-index.ts](../src/lib/domain/search-index.ts)；不把历史 173 名称桶或 8,167 locators 当作当前上限。

## 验证与调查入口

机制修改优先使用现有 `search.test.ts`、`search-metadata.test.ts`、`flexsearch-contract.test.ts` 与 `endgame-search-assets.test.ts`，按实际风险选择。
性能调查脚本位于 `scripts/investigations/search-performance.ts`；测量前准备当前数据与 build，记录 pin、工具链、缓存、浏览器和主机，避免与其他浏览器验收并行。
历史性能与旧命令保持在[实施历史](investigations/search-v2-implementation-history.md)，较早的来源设计见[名称调查](investigations/search-v2-character-alias-audit.md)。
