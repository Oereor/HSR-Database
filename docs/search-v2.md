# Search V2 开发与验收

全局搜索由 FlexSearch 0.8.212 负责候选召回，HSR 代码负责名称来源、归一化、排名、实体关联与展示。只有 `createGlobalSearchService()` 一条生产查询路径；旧 scorer、flattened labels、80 条截断、exact 排他分支和任意 text hash 推导 alias 的逻辑均已移除。

## 名称权威边界

`scripts/data/character-names.ts` 是 catalog/detail 和官方搜索名称的共享 builder。身份始终是 `String(AvatarID)`，普通表和 LD 合并时保持冲突检查。命名保留多命途、男女开拓者和 GameText 展示规则；搜索 canonical 是同一显示名称的 plain text，card 仍接收原 catalog model。

两个可审阅的名称文件：

- `data/search/character-official-names.generated.json`：97 个 AvatarID 的 canonical、来源表/记录/字段、十进制 text hash、命名政策、命途来源和官方别名。两空格 JSON、稳定字段与 ID 顺序，无生成时间或绝对路径。
- `data/search/character-player-aliases.json`：人工别名文件，包含官方快照中的全部 searchable AvatarID；维护者已录入实际别名。官方快照只决定合法 ID，维护者独立决定每个 `playerAliases` 数组的内容，不复制名称或来源字段。

当前只对 1001、1224 生成官方基础名“三月七”。普通与 LD 名称、同名不同 ID 均保留；`{NICKNAME}`、缺失的 FullName、trial、skin、VO/resource/internal names 不作为别名。未来扩大官方别名来源须修改 builder 的明确政策并审阅来源证据，不能恢复遍历 hash 的推测逻辑。

人工文件的 `characters` 以已存在的 AvatarID 为 key，每项为 `{"playerAliases": string[]}`。别名必须非空、归一后非空且不含 placeholder 或显示 markup。同角色内原文或归一重复、与 canonical/official 重复、非法 ID/类型/额外字段均报错；不同角色共享一个别名合法，并各自召回一次。别名只参与检索，UI 不显示。

维护时打开该文件，根据 AvatarID 找到角色，填写 `playerAliases` 数组并保存，再运行下节的 `pnpm data:ensure`、`pnpm test`、`pnpm data:validate`。以下是 `characters` 内的格式示例，不是建议加入生产 metadata 的真实玩家别名：

```json
{
  "1001": {
    "playerAliases": ["示例别名A", "示例别名B"]
  }
}
```

上游新增角色时，先显式运行 `pnpm data:search-names:update` 刷新官方快照，再运行 `pnpm data:player-aliases:sync` 补齐空 entry，并审阅两个文件的 diff。同步仅读取 tracked 官方快照，不根据显示名或 BaseAvatarID 推导身份；保留已有 alias 字符串及顺序，重复运行字节一致。若发现已不存在或非法 ID、非法 schema 或 alias，命令在写入前失败，列出诊断，由维护者人工处理，绝不自动删除旧 entry。

生产构建要求人工文件覆盖全部官方 searchable ID；缺少 ID 会列出 ID 并提示同步命令。单项 alias validator 仍允许局部 synthetic metadata，现有别名规则不变。`data:ensure`、`data:validate`、`deploy:build` 只校验，不能改写人工文件。允许同步的 mutation context 只有维护者显式运行命令和 upstream updater。

同步仅插入缺失 ID，按码点顺序定位，值固定为 `playerAliases: []`。它通过现有 TypeScript JSON AST 定位插入点，保留已有 entry 的字符串、数组顺序、转义写法、空白和换行；没有新 ID 时不写文件，不制造格式 diff。所有校验和新 JSON 的完整性验证均在写入前完成；stale/非法 ID 不会被自动删除或迁移。

## 更新与构建

刷新与校验命令都读取 `upstream.lock.json`，准备网站内部 `.upstream` pinned checkout 并核对 SHA，不修改相邻上游仓库：

```bash
pnpm data:search-names:update
pnpm data:search-names:check
```

只有 pinned update 命令写 tracked 官方快照。不要手改该文件；更新后审阅 diff。`deploy:build` 在数据生成前执行 check，复用部署已准备的数据根并再次核对 SHA。失配会给出 update 命令并终止，绝不自动改写快照。

updater 工作流顺序为更新 lock → 检测真实 lock diff → `data:search-names:update`（准备并核对 pinned upstream）→ `data:player-aliases:sync` → `deploy:build` → 提交 lock、官方快照和人工 alias 文件的实际 diff → 更新 `automation/update-upstreams` → PR 至 `develop`，由维护者审核。updater 只自动补空 ID entry，不填写任何 player alias。无新 ID 时人工文件没有 diff；stale/非法 metadata 会使 workflow 在提交、push、创建 PR 前明确失败。

权限仍只有 `contents: write`、`pull-requests: write`；不直接 push main/develop，不自动 approve 或 merge。手工更新上游仍使用上文的刷新 → 同步 → 审阅 diff → `pnpm deploy:build` 流程。

本地开发仍支持 `HSR_DATA_ROOT`，普通 `pnpm data:sync` 根据所配置的数据源生成 ignored 数据，不碰 tracked 快照。人工别名修改后执行：

```bash
pnpm data:ensure
pnpm test
pnpm data:validate
```

`src/lib/generated/search-inputs.json` 缓存已生成的官方名称、仅含 `id/name` 的 catalog 投影和 Endgame 名称桶；alias-only 更新只重建 `static/generated/search.json`，复用缓存，不重新解析整个上游。搜索 bundle 含 schema 2、normalization 1、naming policy 1、sourceCommit 和 metadata SHA-256 digest。数据 manifest 为 schema 36。缓存版本或来源不匹配必须重新生成；非法人工 metadata 不能进入离线 fallback。fallback 只处理上游访问失败，生成错误直接向外抛出。

## 查询架构

| 模块                    | 职责                                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| `normalization.ts`      | label 经 GameText → plain → NFKC → `toLowerCase()` → 去除空白与 `·•・—_-/`；query 不解析 GameText，其他标点保留 |
| `documents.ts`          | SearchTarget / SearchDocument / 版本 bundle / MatchEvidence；namespace key，普通 ID 与 Endgame entryId 分离     |
| `flexsearch-adapter.ts` | 同步内存 Document，三字段 full substring 召回                                                                   |
| `ranking.ts`            | 仅检查候选的各类 normalized labels，提取最佳 evidence 并稳定排序                                                |
| `search.ts`             | 唯一 facade，返回原 catalog models；异常保留可用结果、显示不可用状态并记录诊断                                  |
| `endgame.ts`            | entryId → locators → shard，按模式/赛期/locator 顺序展开                                                        |
| `presentation.ts`       | 每类/每模式 100 张的展示窗口，保留全部 service 结果                                                             |

实际索引配置：

```ts
new Document({
  tokenize: 'full',
  encoder: { ...Charset.Exact, split: /\s+/u },
  document: {
    id: 'key',
    index: ['canonical', 'officialAliases[]:value', 'playerAliases[]:value']
  }
});
```

alias 字符串数组只在 adapter 内投影为 `{ value }[]`，以适配此版本的数组路径 typings。每个字段显式使用当前 document 总数 N、offset 0、suggest false；union 后按 key 去重。空 query/空索引直接返回，不使用 `limit: 0`。无 Worker、store、数据库、export/import、CJK/fuzzy、suggestions 或 Resolver。

**相对计划的配置修正：** 未修改的 `Charset.Exact` 默认仍切分标点，真实 oracle 检查发现“可可利亚(幻象)”会错误召回“可可利亚,虚妄之母(幻象)”。显式设置空白分词后，HSR 已去掉空白的每个 label 成为一个完整 token，原始 engine candidate keys 与独立 substring oracle 一致；未使用 custom encode。此回归已纳入安装版本 contract。

九级排名从高到低：canonical exact、official exact、player exact、canonical prefix、official prefix、player prefix、canonical contains、official contains、player contains。同级按 normalized canonical、固定领域顺序（角色、光锥、遗器、普通敌人、Endgame 名称桶）、stable key 比较，使用明确 Unicode 码点顺序而非 localeCompare。exact 与 partial 同时保留，同一 document 只产生最佳 evidence。

Endgame 搜索只索引 173 个名称桶，关联 8,167 个 locators。命中才加载对应预渲染 shard；Promise 缓存合并并发请求，失败移除缓存以便下次重试。展开按 locator 去重，保留不同阶段的同 MonsterID，以及既有波次合并、精确属性和赛期顺序。页面继续使用 request sequence 丢弃迟到结果；单个 shard/target 错误不会把其他结果变成“无结果”。

## 规模与性能

基线 pinned data 为 `8cdb905dc2f8e6fffa9be4eb07af3e34435d6091`：97 角色、169 光锥、60 遗器、628 普通敌人，加 173 个 Endgame 名称桶，共 1,127 documents。

测量脚本：`pnpm exec tsx scripts/investigations/search-performance.ts`。先运行生产构建和 `pnpm preview --host 127.0.0.1 --port 4173`，测量期间不要并行运行其他浏览器测试。脚本使用 Desktop Chrome 与 Pixel 5 Chromium 仿真各三轮，关闭每日更新弹窗；100 组查询采样取中位数，每组重复 10 次以改善计时精度。索引构建包含 normalization、Document 构建及 service 映射，不包含下载。提交至结果完成的页面阶段通过 Long Tasks API 记录最长任务与 `sum(max(duration-50,0))` 阻塞时间。移动测量是相同主机上的视口/输入仿真，不代表低端真机 CPU。

未加窗口时，“者”召回 71 个普通目标与 1,804 个 Endgame 实例；三轮最长任务中位数为桌面 2,340 ms、移动 2,351 ms，超过 200 ms 门槛。因此启用计划允许的最小展示改动：普通类别及每个 Endgame 模式首批 100 张，每次增加 100 张，显示已展示数和完整总数。Endgame 沿已有赛期顺序截取，后续赛期可通过加载更多访问。service、候选集合和 shard 目标都保持完整。

完整原始测量输出保存在 ignored `data/audit/search-v2-performance.json`；未加窗口的本次记录另存 `data/audit/search-v2-performance-unwindowed.json`。提交的验收记录见下节，方便无需保留本地缓存时审阅。

2026-09-04，Windows / Node 22.19.0 / Chromium 151.0.7922.34，最终三轮中位数如下（桌面 / 移动）：

| 查询     | 完整结果 / 首批卡片 | service 查询 ms | 页面最长任务 ms | 页面总阻塞 ms |
| -------- | ------------------- | --------------- | --------------- | ------------- |
| 三月七   | 2 / 2               | <0.01 / <0.01   | 0 / 0           | 0 / 0         |
| 丹恒     | 3 / 3               | <0.01 / <0.01   | 0 / 0           | 0 / 0         |
| 丹恒饮月 | 1 / 1               | <0.01 / <0.01   | 0 / 0           | 0 / 0         |
| 银鬃尉官 | 124 / 122           | <0.01 / 0.01    | 212 / 200       | 168 / 248     |
| 的       | 1,064 / 492         | 0.74 / 0.77     | 407 / 423       | 767 / 765     |
| 者       | 1,875 / 344         | 1.22 / 1.25     | 369 / 342       | 628 / 500     |

小查询计时低于采样分辨率，不表示零成本；Longest Task 为 0 表示没有观察到 ≥50 ms 的任务。索引构建中位数为 10.8 / 12.0 ms。“者”提交至首批结果就绪约 1,192 / 1,179 ms，包含本地分片请求与渲染，不能等同于 service 查询延迟。窗口显著减少首批卡片，但没有将所有页面任务降至 200 ms 以下；本次按已确认方案保留成熟 cards 和完整 shard 目标，不追加虚拟列表或后台索引。

搜索 JSON 为 1,107,385 bytes（gzip 62,543 bytes），包含 documents 与 locators。生产搜索路由入口 JS 为 65,940 bytes；初次搜索页实际加载的 `_app` JavaScript 合计 352,281 bytes（未压缩响应体，包含共享组件/框架，排除临时 benchmark module），其中展示窗口相对未加窗口版本增加 2,062 bytes。

## 测试证据

- 安装版本 contract：中文中间子串、标点、Latin、重复数字、alias 数组边界；81/101/1,205 个 documents 的三个字段完整集合；同时证明默认 limit 100 会截断。
- normalization/GameText/幂等/空值、97 角色与 LD/多命途、同名不同 ID、两条官方基础名和 placeholder 排除。
- synthetic player exact/prefix/contains、非法 metadata、合法跨角色冲突；生产人工 metadata 完整校验及 runtime document / 角色召回对应关系。空 skeleton 单独使用 synthetic fixture。
- 九级排名 pairwise、最佳 evidence、10 次固定种子插入顺序随机化、真实 raw candidate key 集合对独立 brute-force oracle。
- 普通与 Endgame exact/partial 共存、命中加载、locator 去重、失败重试、并发缓存、stale-request guard、领域顺序。
- snapshot 重生成字节相同、失配只报错不改写、部署失配停止后续生成、alias-only rebuild、updater 快照进 PR。
- 桌面/移动浏览器覆盖原导航与 cards、初始化错误、部分 shard 失败后重试、窗口重置、全部长列表结果可达与赛期顺序。

移除旧 FullName alias 探测后，缺失文本审计 A 类从 1,711 减为 1,614，恰好减少 97 次无效搜索别名查找；保留其他领域缺失分类断言，D 类仍为零。

## Search V2 初次实施门禁与变更范围

| 检查                           | 结果                                             |
| ------------------------------ | ------------------------------------------------ |
| `git diff --check`             | 通过                                             |
| `pnpm lint`                    | 通过                                             |
| `pnpm check`                   | 0 errors / 0 warnings                            |
| `pnpm test`                    | 30 files / 370 tests 通过                        |
| `pnpm data:search-names:check` | pinned 97 角色快照逐字节通过                     |
| `pnpm deploy:build`            | 通过，最终资源引用闭包扫描 2,215 个文本文件      |
| `pnpm data:validate`           | 通过，1,127 documents；保留已有缺失 TextMap 诊断 |
| `pnpm test:e2e --workers=2`    | 229 通过，3 个原有条件跳过；含桌面/移动项目      |

完整 oracle 在并行门禁负载下超过 Vitest 默认 5 秒，因此仅为该全数据测试设置 30 秒时限，保留全部查询与断言。整套浏览器回归还暴露了原有更新日志文案、导航短 SHA 两处过期断言：测试分别对齐当前已存在的日志内容、生成 manifest 的实际 SHA；未修改日志或导航产品行为。

初次实现期间保持网站 `develop` 分支，无 commit/push。相邻 `TurnBasedGameData`、`StarRailRes` 均保持干净，HEAD 分别仍为 `8cdb905dc2f8e6fffa9be4eb07af3e34435d6091`、`d226befe3db13f2ec15f4161d5f34b1b607643fe`。变更限于 Search V2 源码、名称文件、构建工作流、相关文档与验收测试；人工生产别名在该次验收时为空，之后已由维护者填写。

## Player alias skeleton 初次修补验收（历史）

人工文件已根据官方快照补齐 97 个 AvatarID，全部为 `{ "playerAliases": [] }`。未修改 `validatePlayerAliases()`，仅在生产文档构建中增加 ID 覆盖检查，并新增显式 `pnpm data:player-aliases:sync`。新增测试覆盖完整集合、空标签、未来 synthetic aliases、新增角色同步、保留人工数组顺序、字节幂等和错误时不写入。

本轮 `git diff --check`、`pnpm lint`、`pnpm check`、`pnpm test`（374 项）、`pnpm data:search-names:check`、`pnpm data:validate`、`pnpm deploy:build` 均通过。搜索产物与修补前逐字段比较，只有 `metadataDigest` 改变，1,127 个 documents 和 Endgame 关联完全一致；没有新增任何真实、猜测或示例玩家别名。初次实施的浏览器性能与 UI 验收记录保持为上文历史记录，本轮未改变其实现。

## Upstream updater 收尾验收

当前人工文件包含 97 个角色、300 条别名。先运行 `pnpm data:ensure` 刷新 ignored 搜索产物，再验证完整 metadata、每个 runtime document 的人工 aliases 及逐条角色召回。无新增 ID 的同步直接返回，部署只校验；人工文件前后均为 8,687 bytes，SHA-256 均为 `ee1ffadbaeb27604079dcbfb88d304d8994ce6e235e0ac8f13fa8577d13787cc`。该文件在 `.prettierignore` 中单独排除，避免格式化工具改写人工排版，内容仍受 metadata 校验约束。

真实 workflow 的 metadata 命令顺序由集成测试提取并在隔离 fixture 中重放：官方快照新增 1555 后，实际同步函数补出空 entry，生产 metadata 校验通过，既有 aliases 保留。删除或调换同步步骤会使测试失败。另覆盖 LF/CRLF、转义拼写、数组顺序、重复执行、非法数据和 stale ID 失败不写入，以及 alias-only 重建。

本轮 `git diff --check`、`pnpm lint`、`pnpm check`（0 errors / 0 warnings）、`pnpm test`（30 files / 378 tests）、`pnpm data:search-names:check`、`pnpm data:validate`、`pnpm deploy:build` 均通过。最终构建扫描 2,215 个文本文件，`static/generated/search.json` 与 `build/generated/search.json` 的字节摘要一致；仍为 1,127 个 documents。数据验证保留现有缺失 TextMap 诊断。本轮未调整搜索算法或 UI，未重新测量历史浏览器性能。

自动化提交明确包含 `upstream.lock.json`、官方名称快照和人工 alias 文件；权限、automation 分支、force-with-lease、PR 至 develop 和人工审核政策保持原样。本地没有 commit、push、创建 PR 或部署线上环境，两个相邻 upstream 仓库保持原 HEAD 和干净状态。
