# Endgame SSG temporal state fix

调查及实施日期：2026-10-06。工作分支：`develop`。

## 1. Root cause

根因与任务中的判断一致。Endgame 的 schedule 数据已经存在，但服务器视图把随时间变化的 `status`、period ordering 和 `recommendedGroupId` 计算成了构建快照。三个 Endgame 页面继承或声明 `prerender = true`，adapter-static 将这些结果写入 HTML 和 SvelteKit page data。时间经过 schedule 边界不会再次执行服务器 loader。

调查前，`EndgamePeriodView` 只包含 group ID、名称、date label、status 和 encounter count，没有供浏览器重新分类的 schedule。详情 `buildGroupViewBase` 还独立调用 `Date.now()`，没有使用构建 periods 时的同一个时间。

Production 在旧构建后仍展示 AS 3020 的现象来自任务提供的观察；本轮没有访问或部署 Production。现有本地函数在显式注入时间时已经能够正确选择 3021，错误位于快照的消费生命周期，而不是 AS group ingestion 或推荐规则。

## 2. Existing data flow

```text
upstream.lock.json → pinned TurnBasedGameData
  → scripts/data/endgame.ts: mode group traversal + exact ScheduleDataID resolution
  → locale-neutral Endgame domain (schedule.begin/end)
  → scripts/data/projection/endgame.ts: matching CHS/EN TextMap projection
  → generated/views/{zh-CN,en}/endgame/{mode}.json
  → src/lib/server/endgame.ts: localized dataset + resolved enemy references
  → buildModeView / buildPeriodView / buildGroupView
  → Endgame page.server load
  → prerender HTML + serialized page data
  → overview cards / archive classification / detail season hero
```

AS 遍历全部 `tables.groups.as`，通过 `ScheduleDataChallengeBoss` 解析 binding，没有硬编码最新 GroupID。锁定的 TurnBasedGameData commit 是 `724b139d8c9c32d12552eb95745a4fee72bfe48b`；本地完整只读源 HEAD 与该 commit 一致。

## 3. Why the updater does not trigger the transition

`update-upstreams.yml` 只检查 lock、维护的 search names/aliases 和 enemy snapshot 是否发生实际 diff。schedule 跨界不会改变这些文件，也不会改变已经保存的 begin/end，因此没有 commit/PR 是预期行为。

updater 应负责更新输入内容。状态分类属于 runtime presentation，本次没有增加 touch、timestamp、空 commit 或强制部署，也没有改变 workflow 的职责。

## 4. Frozen fields and consumers

| Consumer | 原来被冻结的内容 | 本次处理 |
| --- | --- | --- |
| `/endgame` | 四种 mode 的推荐 ID、period statuses、ordering | 挂载后刷新 mode views；overview card 的名称、日期和 href 响应式更新 |
| `/endgame/[mode]` | current/upcoming/historical/unknown 分类及其排序 | 从 runtime mode periods 重新分组 |
| `/endgame/[mode]/[groupId]` | hero 的 current/upcoming badge；序列化 periods 的初始 status | 刷新 hero period；periods 的 schedule 供 clock 使用，无额外 selector 消费其 status |
| occurrence shards | 生成或 prerender 时的 `period.status` | 删除 status，保存静态 period metadata |

名称、date label、encounter count 和 schedule 是不随当前时间改变的 metadata，继续来自静态数据。缺名回退不影响分类或推荐。

## 5. Runtime/time-state architecture

`EndgamePeriodMetadata` 保存既有静态字段和可选 schedule；`EndgamePeriodView` 增加动态 status。`buildPeriodMetadata` 不读取时钟。`endgamePeriodStatus`、`refreshEndgamePeriod` 和 `refreshEndgameMode` 显式接收 `now`。

`buildPeriodView`、`buildModeView` 和 `recommendedGroupId` 保留方便现有调用的默认时钟，以及显式注入时间的能力。分类和推荐算法只维护一份；推荐的输入缩小到 group ID 和 schedule，不需要把 raw dataset 或 encounter 数据发给浏览器。

schedule 解析继续使用固定 `+08:00`，current 区间继续为 `begin <= now < end`。推荐顺序保持 latest current、latest started、nearest upcoming、无 schedule 时最大 GroupID。名称和 locale 不参与选择。

每个 Endgame 页面持有自己的 clock，初值为 `undefined`。SSR 和 hydration 首次渲染完全使用序列化快照，`onMount` 后才采样浏览器时间。clock 在最近 begin/end 边界刷新，等待最多 60 秒以捕获系统时间修正；导航、window focus/pageshow 和恢复 visible 时立即刷新。卸载时取消定时器、移除监听器并清空值。

保留原有卡片尺寸、布局及键控列表，不增加占位 UI、页面 reload 或 HTTP polling。赛期在分类区域之间移动是状态切换的正常结果。

服务器详情构建共享一个显式 `now`，避免 period 和 periods 在边界两侧采样。服务器 cache 仍是静态构建快照，浏览器通过 schedule 恢复当前 presentation，不将 cache 作为时间 authority。

## 6. Changed files

Domain、runtime 和页面：

- `src/lib/domain/endgame-view.ts`
- `src/lib/client/endgame-clock.ts`
- `src/lib/server/endgame.ts`
- `src/routes/endgame/+page.svelte`
- `src/routes/endgame/[mode=endgameMode]/+page.svelte`
- `src/routes/endgame/[mode=endgameMode]/[groupId]/+page.svelte`

静态分片契约、生成和验证：

- `src/lib/domain/search-index.ts`
- `src/lib/domain/types.ts`
- `src/lib/search/endgame.ts`
- `scripts/data/endgame-occurrence-shards.ts`
- `scripts/data/generated-artifacts.ts`
- `scripts/data/sync.ts`
- `scripts/data/validate.ts`
- `scripts/data/validation/build-inputs.ts`
- `scripts/data/robustness-invariants.ts`

测试和文档：

- `tests/unit/endgame-temporal-state.test.ts`
- `tests/unit/endgame-clock.test.ts`
- `tests/unit/endgame-occurrence-shards.test.ts`
- `tests/unit/search.test.ts`
- `tests/unit/build-input-validation.test.ts`
- `tests/unit/robustness-invariants.test.ts`
- `tests/unit/data-cache.test.ts`
- `tests/unit/data.test.ts`
- `tests/e2e/endgame.spec.ts`
- `tests/e2e/endgame-temporal-state.spec.ts`
- `docs/architecture/localization-and-data-generation.md`
- 本报告

最终文件清单以工作区 diff 为准；未修改的既有测试仅运行验证。

## 7. Generated-data/schema impact

- Endgame dataset schema 保持 24，schedule ingestion、localization 和战斗模型不变。
- occurrence shard schema 从 2 升到 3，period 增加 schedule 并删除 status。producer 不再接收 `now`，中文 server fallback 也从源 group 构建静态 metadata。
- generated manifest 从 47 升到 48，使旧缓存失效。`data:ensure` 已从原 lock 对应的完整源重建 2143 个 artifacts；生成目录是 ignored outputs，没有提交它们。
- server/client identity checks、build-input validation、full semantic validation、结构一致性测试和 fixtures 同步更新；validators 拒绝 status 泄漏和分片 schedule 与源 group 不一致。
- Search UI 继续显示名称和敌人；匹配、locator、顺序、缓存和图片 enrichment 保持原逻辑。没有引入 status 展示或 Search 重构。
- `upstream.lock.json`、TurnBasedGameData 和 StarRailRes 均保持原样。

## 8. Test strategy

unit tests 用显式时间验证实际 AS dataset 的切换和中英文一致性，同时覆盖 overlapping current、gap 中 latest started、所有 upcoming、无 schedule、空输入、缺名和浏览器时区独立性。刷新后的静态 metadata 与原数据一致，原 view 不被修改；详情构建支持同一个 injected time。

clock tests 验证挂载前不读取时间、不启动计时器，挂载及边界刷新、导航重新调度、60 秒上限、后台恢复、focus/pageshow，以及销毁后的资源清理。

shard test 对真实 AS 3021 的敌人 target，在边界前后不同系统时间构建分片，验证相同输出、schema 3、不含 status、schedule 与源数据一致。契约测试拒绝旧 manifest/shard schema、生成时 status 和 schedule drift。

既有 E2E 固定到 `2026-09-09 00:00:00 +08:00`，不再依赖执行当天。推荐 ID、upcoming 和 archive 数量从该固定时间下的当前 dataset 获取，保留历史详情数据和布局验收。

新增 Playwright clock 回归在 hydration 前停于 AS 边界前一秒，再让同一页面经过一秒。覆盖中英文 overview、mode、3021 detail、推荐链接点击及导航、3020 hero 过期、pageshow 恢复、不同浏览器时区和无 JavaScript 浏览。断言跨界没有主框架导航、静态 HTTP 响应保持相同、无 hydration/page error、无横向溢出。

## 9. AS 3020 → 3021 boundary validation

| 时间（+08:00） | AS 3020 | AS 3021 | recommendedGroupId |
| --- | --- | --- | --- |
| 2026-10-05 03:59:59 | current | upcoming | 3020 |
| 2026-10-05 04:00:00 | historical | current | 3021 |

3020 schedule 为 `2026-08-31 04:00:00` 至 `2026-10-05 04:00:00`。3021 schedule 为 `2026-10-05 04:00:00` 至 `2026-11-16 04:00:00`；对应 UTC 边界是 `2026-10-04T20:00:00Z`。

两个 locale 的结构和 schedule 相同；3021 名称分别解析为「支配遗忘」和 “Dominance of Oblivion”。调查阶段直接用 Node 24 加载现有 TypeScript 函数已验证该边界；新增 unit regression 也通过。

## 10. Other stale-time consumers audited

- 网站根首页只加载 recent warps 和静态导航，没有 Endgame current/recommended 缓存。
- `EndgameOverviewCard` 原来直接消费 stale recommended ID；页面现在传入响应式刷新后的 mode。
- occurrence shard 确认存在同类生成时 status，已经移除。Search UI 只显示赛期名称和敌人，不按 status 过滤或显示 badge。
- 详情页当前没有 season selector；`group.periods` 没有其他时间分类 UI 消费者。已修复 hero badge。
- `scripts/data/routes.ts`、`getEndgameGroupEntries`、manifest route inventory 和 sitemap 枚举全部 group，不依赖 current，保留全部历史、未来和 unknown 路由。
- updater workflow、upstream lock 架构、AS mechanics、HP、Enemy occurrence 模型和 battle parsing 未改动。

## 11. Commands and validation results

| Command / check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | 已是最新，锁文件未变；本地 proxy 7890 可用，没有升级依赖 |
| Node 24 explicit-clock inspection | 两种 locale 的 AS 边界与名称正确 |
| targeted Endgame/search/validator unit tests | 13 files / 222 tests passed；新增 schema 检查及后续 targeted run 3 files / 29 tests passed |
| `pnpm check` | passed；Svelte 0 errors / 0 warnings，scripts/API TypeScript passed |
| `pnpm test` | 76 files / 837 tests passed |
| `pnpm data:validate` | passed；2143 artifacts、1090 routes、两种 locale 各 1153 search records、191 English shards |
| `pnpm lint` | passed；Prettier / ESLint passed |
| `pnpm build` | passed；通过既有 `HSR_BUILD_VERSION=endgame-temporal-state-local` 固定本地 build version，详见下文 |
| temporal + archive Playwright desktop/mobile | 22 tests passed；复用上述静态 build，中英文同页跨界、导航、恢复、时区、无 JS 及 archive 验收通过 |
| 上一轮 existing Endgame / Voracity / Search artwork Playwright | 84 tests：76 passed / 8 failed；2 项 archive 日期断言随后修正，6 项 stale selector 失败在本轮维护中全部解决，详见 §11.1 |
| final diff / external repositories | `git diff --check` passed；仅 HSR-Database 的 develop 有 27 个修改/新增文件；两个 sibling 仓库仍 clean，lock、依赖、updater workflow 未变 |

初始 `pnpm exec vitest/tsx` 无法通过 Windows command shim 启动；随后用 `node node_modules/...` 的等价入口完成 targeted checks，正常 `pnpm` package scripts 可运行。首次 lint 发现新测试的 formatting 和 unused binding，已修正，最终 lint 结果记录于上表。

首次 full validation 显式指定 `.upstream/TurnBasedGameData` 时发现旧 prepared cache 缺少 `MonsterStatusConfig.json` 和 `StageInvasionBuff.json`。随后使用默认的完整只读 sibling source，确认其 HEAD 与 lock 相同，并成功验证，没有修补或切换该外部仓库。

现有上游 diagnostics 包括 533 个 CHS 未解析 TextHash、已分类的 fallback/optional-missing 文本及 13 个 weakness/resistance conflicts。full validator 将这些报告为现有数据警告，没有引入静默翻译 fallback。

首次直接 `pnpm build` 返回成功，但本地静态页面启动时出现 SvelteKit `.data` TypeError：默认 `kit.version.name` 在不同配置求值时取不同 `Date.now()`，导致 HTML 的 `__sveltekit_9joxcs` 与客户端的 `__sveltekit_hju17e` 标识不一致。仓库已有 deployment build wrapper 注入稳定 `HSR_BUILD_VERSION`，`svelte.config.js` 也已支持它。按现有机制固定本地 build version 后重新执行 `pnpm build`，HTML 和客户端标识一致，浏览器正常启动。没有修改配置、依赖或部署脚本。最初针对不一致输出启动的浏览器测试已中止，不算验收通过。

最终时间验收复用修正后的同一份 build，覆盖桌面和移动端。新增 20 项时间状态测试及 2 项 archive 测试全部通过；Search artwork 的 10 项中英文分片、敌人图片、降级和非法 locale 测试也全部通过。自动截图并人工查看 overview 跨界前后布局，AS 卡片 bounding box 均为 `x=985.328125, y=295.6875, width=426.65625, height=284.390625`，推荐 href 从 3020 切换到 3021，位置和尺寸不变。

上一轮全量既有浏览器回归未全绿：3 个既有测试各在 desktop/mobile 失败，共 6 项。以下保留历史定位证据；这些失败现已通过 §11.1 的测试维护解决：

| Existing test | Failure and current structure |
| --- | --- |
| AS 节点使用 BossDossier、共享敌方卡、首领特性与中性终焉公理 | 断言 `[data-as-boss-traits] > h4` / dossier 的直接子级 h4；现有 SectionHeading 位于 traits list 之外，list 内条目标题为 h5 |
| AS 多敌人 slot 在固定一卡宽 roster 中纵向排列并保留完整战斗数据 | 断言 `[data-as-boss-dossier] > h4`；现有 h4 嵌套于 `.as-boss-roster` section |
| 兵锋骑士难度 4 显示玩家侧韧性且不显示机制弹窗 | 断言整个页面没有 `[aria-haspopup="dialog"]`；现有 EndgameLocalNav 始终渲染移动导航的 dialog trigger，桌面隐藏的节点仍会被计数 |

这些历史失败来自过时的实现假设。下一节记录本轮小范围维护及完整相关回归通过的结果。

### 11.1 Stale Endgame E2E maintenance and final close out

2026-10-06 完成维护。以本轮开始时的工作区为基线，新增改动仅为 `tests/e2e/endgame.spec.ts` 和本报告。上一轮尚未提交的 production 改动保持原样；本轮没有修改任何 production component、domain、server、route、runtime clock、AS 边界逻辑、occurrence shard / manifest schema、script、updater 或 upstream lock。两个外部仓库仍 clean，HEAD 与上一轮一致。

| Test case | Assertion maintenance | Useful coverage preserved |
| --- | --- | --- |
| AS 节点使用 BossDossier、共享敌方卡、首领特性与中性终焉公理 | 删除 traits / dossier 的 `> h4` 数量断言；在各 battle slot 内验证 dossier、既有 roster、traits 区域可见 | 敌人卡数量、standard variant、Lv.90、trait 名称与数值、终焉公理选项及非交互性、解释内容与展开行为、布局顺序 |
| AS 多敌人 slot 在固定一卡宽 roster 中纵向排列并保留完整战斗数据 | 将 dossier 的直接子级 h4 可见断言改为 dossier / roster 可见，并验证 roster 内包含两张敌人卡 | 两个敌人身份、同列纵向排列、一卡宽，以及等级、HP、速度、韧性、弱点和相关机制 |
| 兵锋骑士难度 4 显示玩家侧韧性且不显示机制弹窗 | 将 page-global `[aria-haspopup="dialog"]` negative assertion 缩小到三个已明确 MonsterID 的敌人卡内 | 玩家侧韧性 300 / 480 / 190，以及 HP / toughness mechanism presentation 检查；移动导航 dialog 不再被误计为战斗机制 |

heading level 和 direct-child hierarchy 属于旧 DOM 实现假设，不是这些 case 的产品或 accessibility contract。导航自身的 dialog trigger 是合法交互，不能用于推断敌人卡是否存在机制弹窗。区域可见性、实际数据、交互与布局检查仍保留，没有删除整个 case、增加测试 hook 或改动组件来迎合 selector。未发现真正的 production regression。

验证复用上一轮有效的静态 build，设置 `PLAYWRIGHT_REUSE_BUILD=1`；没有重新 build、生成数据或执行 `data:sync`，temporal-state spec 未修改。

| Final command / check | Result |
| --- | --- |
| `pnpm test:e2e tests/e2e/endgame.spec.ts --grep 'AS 节点使用 BossDossier\|AS 多敌人 slot\|兵锋骑士难度 4' --workers=4 --retries=0 --reporter=line` | 3 cases × desktop/mobile：6 passed，2.8s |
| `pnpm test:e2e tests/e2e/endgame.spec.ts tests/e2e/endgame-voracity.spec.ts tests/e2e/search-artwork.spec.ts tests/e2e/endgame-temporal-state.spec.ts --workers=4 --retries=0 --reporter=line` | 104 passed，17.8s；无失败、无重试 |
| `pnpm lint` | passed；Prettier / ESLint passed |
| `pnpm check` | passed；Svelte 0 errors / 0 warnings，scripts/API TypeScript passed |
| Incremental diff / external repositories | 本轮只修改上述测试和报告；`git diff --check` passed；外部仓库状态和 HEAD 未变 |

完整集合包括 Endgame 58 项（含 archive）、Voracity 16 项、Search artwork 10 项及 temporal-state 20 项，总计 104 项。原 84 项集合全部通过，新增 temporal-state 20 项也全部通过；数量变化来自纳入既有 temporal-state spec，没有删减 case。上一轮的 6 项 stale failures 已全部解决，Endgame SSG temporal-state fix 可以在实现及本地验收层面正式 close out。

## 12. Remaining limitations

首次上线需要部署本次代码和兼容的静态输出；没有执行任何远程 Preview 或 Production deployment。之后，已包含 schedule 的赛期可以在同一份静态构建上切换，不需要 upstream commit 或重新部署。

关闭 JavaScript 的用户及仅抓取静态 HTML 的消费者仍看到构建时的初始 presentation，历史详情和 archive 链接仍可浏览。浏览器系统时间是 runtime clock authority，错误的设备时间会影响 classification。

浏览器暂停或后台节流时不能保证墙钟边界那一瞬间执行 JavaScript；恢复 visible、focus 或 pageshow 时立即重新分类，定时器也会恢复采样。尚未进入 pinned dataset 的未来赛期仍需要正常的数据更新。

本次时间切换已经完成自动浏览器验收及截图布局检查，相关 104 项浏览器回归全部通过，6 项 stale assertion 失败已解决，不再构成 Remaining Limitation。实现与本地验收已完成，可以正式 close out；没有执行生产部署或生产站点验收。
