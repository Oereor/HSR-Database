# HISTORICAL / NON-NORMATIVE — see [Localization and Data Generation Architecture](architecture/localization-and-data-generation.md) for the current system.

# i18n/l10n 第一阶段实施报告

实施日期：2026-09-05。网站仓库 `develop`，基线 commit `3e713d1a096134374c80271f9c36b3258a1c9fa0`。

## 实施范围

正式 Site Messages 使用精确版本 `@inlang/paraglide-js@2.25.0`。实施期间再次查询 npm registry 的 latest，2026-09-05T06:47:15Z 仍为 2.25.0；查询证据保存在 ignored 审计目录 `data/audit/i18n-phase1/paraglide-registry.json`。官方 message-format plugin 精确 pin 4.4.0，使用本地模块，编译无需从 CDN 拉取插件。pnpm lock 仅增加这两个包及其依赖闭包，原有直接依赖版本保持不变。

人工消息源是 `messages/zh-CN.json`，共 **98 条**；`messages/contracts.json` 保护必需 key 与参数接口。`project.inlang/settings.json` 只声明 zh-CN。`paraglide.config.ts` 配置 `strategy: ['baseLocale']`、类型声明和输出目录；所有调用显式指定 `{ locale: 'zh-CN' }`。

已迁移品牌、首页标题／metadata／近期跃迁、PrimaryNavigation／Navigator、ChangelogModal 容器、OverviewHero／Toolbar／Search／Pagination、FilterGroup、SearchBar，以及四类目录、搜索和 Endgame 首页传给共享组件的文案。整句参数化，原标点、空格、aria 保持。没有中文 fallback 或第二份翻译对象。

游戏名称、技能、描述、游戏定义术语继续使用 TextMap。领域详情、多数全局搜索／Endgame 页面文案、页脚归属说明和日志正文留给后续。没有英文数据、语言切换、locale store、路由本地化、Endgame identity migration 或 core/overlay 拆分。

维护流程见 [Site UI Messages](site-ui-messages.md)。原 UI inventory 增加迁移状态／说明列；其历史字面量计数和行号保持审计原貌，不表示当前重新扫描计数。AGENTS.md 同步了本阶段仅允许中文消息编译的边界。

## 中文契约

原始状态在任何实现改动前于 `2026-09-05T01:29:46.477351Z` 记录。固定推荐比较时间为 `2026-09-05T00:00:00Z`。三个仓库 branch／HEAD／status、5722 个 generated/build 文件的 SHA-256、protected metadata 和原始数据副本保存在 `data/audit/i18n-phase1/baseline.json` 与 `before/`。

可提交的紧凑 fixture 为 `tests/fixtures/i18n-chs-contract.json`；由原始归档提取，正常构建不会覆盖。每个领域有显式中性字段白名单，包含 profile、技能类别／顺序、行迹／星魂关系、敌人技能／phase、抗性、成长、精确数值和 Endgame 实例关系。另一套 CHS 展示摘要保留名称、别名、描述、token 顺序、样式和关系，只剔除明确列出的本阶段新增表示字段与版本／时间戳。没有使用“只删除 name/description”来构造中性契约。

`pnpm data:i18n:check` 比较 968 个产物、路由和六个代表查询。详细逐产物比较及真实展开搜索结果写入 ignored 的 `data/audit/i18n-phase1/contract/`。代表查询以当前人工 aliases 为准，不使用历史数量。

## 语言中性语义

### Character naming

统一命名服务提供基础名、展示名和 canonical snapshot。多命途身份来自 AvatarID／BaseAvatarID 和 MultiplePathAvatarConfig。三月七基础名来自各 AvatarName；1001／1224 的 official-base-name 资格检查 BaseAvatarID=1001 与原 AvatarName source hash（分别为 `6186714091647966180`／`16417870574330506928`）。不比较“三月七”字面量。

Trailblazer 基础称谓检查 `FateRinOwner` 中 `PHFMCACHFIJ=Trailblazer` 唯一记录及 `OENAMINOLLF` 字段的 hash `4036035618718239522`。缺失、重复或 hash 改变时明确失败。命名来源验证保存在内部服务 policy，不补写受保护 official snapshot。中文 `基础名·命途名` 保持，特殊效果关联角色复用基础名／展示名，原 source/display AvatarID 规则保持。

### Enemy skill

canonical 和 variant 共用 `resolveEnemySkillSource`。kind/tag 从十进制 source hash 映射得到，label 独立通过 TextResolver 解析。未知来源失败诊断包含 entity、skill、field、hash、CHS 文本。现有 MonsterSkillConfig 没有 HideInUI。

| source hash          | kind   |
| -------------------- | ------ |
| 4236760374151560033  | skill  |
| 11653660973383561666 | talent |

| source hash          | tag code     |
| -------------------- | ------------ |
| 13718219806540082081 | AoEAttack    |
| 3085594440740593641  | Support      |
| 4014610187872883999  | SingleAttack |
| 17899413561707685112 | Blast        |
| 10170918581498782760 | Talent       |
| 15002512898524986554 | Other        |
| 3873562591188485106  | Summon       |
| 11980319872483820444 | Enhance      |
| 2002671141766797902  | Charge       |
| 15410695618716790376 | Impair       |
| 13370021643324878838 | Defence      |
| 1514416618212734134  | LockOn       |
| 17118023451154285269 | Restore      |
| 3319273756603801898  | Bounce       |
| 9948694534139632886  | Shared       |
| 17776936731021324007 | Barrage      |
| 16409958361388240841 | Sweep        |

历史收录范围在 `data/policies/enemy-skill-inclusion.json` 逐 SkillID 保存，覆盖全部 3548 行配置。每项记录原始配置签名、描述 hash、included；根记录 source commit 和共同审阅理由。当前上游无法以 HideInUI 等结构字段证明该历史范围，因此保留显式政策；新增／改变来源要求审阅，不从新的译文重新推算范围。缺描述只改变 localization state；生产已收录技能缺必需描述时 validation 失败，技能／phase 不被静默删除。

### Special Effect 与 Endgame

Generator 根据 profile 的 avatar/servant skill-link、源描述 token 和审阅 icon provenance（AvatarCyrene 0、AvatarHimekoNova 0/1）标注 typed semantic reference。展示层只分段消费标注，不再比较“特殊效果”或从相似样式推断关系。原 icon、颜色、下划线、弹窗目标、触发范围和等级继承保持。

Endgame 推荐候选资格从源 config 名称引用的存在性产生独立 boolean，不依赖名称解析结果。先按 presented-wave 规则枚举完整中性 occurrences/locators，再校验名称并生成原中文桶；缺必需名称明确失败。name-hash entryId、排序、端点和现有搜索协议保留。

## Schema、构建与测试

业务 manifest **36 → 37**；Endgame dataset **22 → 23**。producer／ensure／validator／类型／服务同步更新；离线旧缓存拒绝和缺必需 eligibility 测试已加入。Search schema **2**、occurrence shard schema **1**、official snapshot schema **1** 保持。

Vite compiler plugin 负责更新消息与页面；独立 compile/check 命令、check、check:scripts 和 deployment compiler gate 在导入生成类型前完成编译。消息输出和 inlang cache 已忽略，并进入 clean 固定目录白名单。消息源没有加入游戏数据、敌人数值或资产摘要。

消息单独改动实验实际改变生成函数输出；data／enemy-assets／assets ensure 后 **3334 个文件的 bytes 与 mtime 全部不变**，随后恢复消息源。旧 manifest 36、Endgame 22 的实际离线 ensure 均失败并恢复原文件。证据见 `cache-check.log/json`。

最终验证已完成：clean deployment build 通过，产物摘要保存在
`data/audit/i18n-phase1/clean-build-files.json`（4,755 个文件）；完整 desktop + mobile
Playwright E2E 共执行 232 项，其中 229 项通过、3 项按既有测试标记跳过，0 项失败。
E2E 使用已启动的 clean `build/` preview（`127.0.0.1:4173`），结果记录在
`data/audit/i18n-phase1/e2e-final.log`，HTML 报告目录为 `playwright-report/`。

`git diff --check` 通过。三项受保护 metadata 的 SHA-256 与基线完全一致；CHS
contract 仍为 968 artifacts、173 buckets、8,167 locators。未发现 hydration mismatch
或用户可见回归。

## 留给下一阶段的事项

- Endgame name-hash bucket identity、跨语言排序和稳定 entryId 仍需独立迁移；本阶段刻意保持全部旧 URL／搜索 schema。
- `as-boss-guides.ts` 对无名／无描述 trait 的历史展示省略，以及 `extra-effects.ts` 对不具备展示文本的定义处理，仍需各自的结构／审阅 inclusion policy，才能开放非 CHS resolver。当前生产有效来源和中文行为保持，不能声称整个数据管线已经可直接输出英文。
- `endgame-view.ts` 的可选 buff／trait 展示就绪过滤，以及带名称／描述的展示合并 identity，留到领域 presentation/overlay 设计；它们不参与本阶段完整 occurrence 枚举。
- 后续补齐领域详情、Search／Endgame 网站文案与日志容器之外内容；游戏术语仍须与网站文案保持来源边界。

这些后续问题没有通过改变中文行为强行修复。进入 Endgame identity migration 前，必须确定语言无关桶 identity、展示合并规则、缺名状态的外部接口与兼容方案，继续以本阶段 fixtures 和全部 locators 为回归基线。

## 受保护来源

- `upstream.lock.json`：`b504e90d8b2b7f604f6ba742a29feb1e6207140384cd206d617584e1b77ad5a8`
- `data/search/character-official-names.generated.json`：`0c87ab39ee417f57b97fb9b288ad105356a5fc6fd6945f8fa8dfd49027bdc4c2`
- `data/search/character-player-aliases.json`：`09f600fa13d6108b4c95628d5c13fb0a3f62a8bf9492d7b82d630bec533b51e7`

TurnBasedGameData pin：`8cdb905dc2f8e6fffa9be4eb07af3e34435d6091`；StarRailRes pin：`d226befe3db13f2ec15f4161d5f34b1b607643fe`。最终状态复核后记录在此。

> HISTORICAL / NON-NORMATIVE — for the current architecture, see [Localization and Data Generation Architecture](../architecture/localization-and-data-generation.md).
