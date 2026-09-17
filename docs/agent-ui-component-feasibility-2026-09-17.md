# HSR-Database Agent（beta）UI 组件契合度调查

日期：2026-09-17  
调查对象：当前 `develop` checkout  
任务边界：仅调查与实施规划；未实现 `/agent`、未修改组件、导航、Site Messages、Agent runtime、API、adapter 或 deployment。

## 1. 结论摘要

总体判断：**部分契合，且视觉层高度契合**。

已确定的单轮 Query Workspace 可以自然落入当前 HSR-Database：`OverviewHero`、全站 container、颜色/间距/圆角/字体 tokens、主按钮语言、轻量 divider、原生 `<dialog>` 的既有交互经验，都与目标设计相容。计划中的层级——Composer 与 Answer 两个主要 surface，Examples、Question Context 和 Limitations 依靠排版、间距和分隔线组织——也符合现有页面“有明确 surface，但避免无意义嵌套”的设计语言。

契合度没有达到“高度契合”的主要原因是交互 primitive 缺口，而不是视觉冲突：仓库没有 textarea 组件、通用 card/surface 组件、通用 modal shell、async button、disabled form、spinner 或统一的 request error state。搜索组件均为单行、搜索语义，不适合强行改造成自然语言 Composer。因此第一版应新增少量 Agent 领域组件，同时复用全站 tokens 和已有行为模式，不应为了表面复用而污染搜索、FilterChip 或现有 dialog API。

还存在三个不属于 UI 组件本身、但会影响可上线 MVP 的边界：

1. 规范文档 `docs/architecture/localization-and-data-generation.md` 仍明确规定 Agent 仅用于本地 CLI/Inspector，当前没有 SvelteKit endpoint，站点仍使用 `@sveltejs/adapter-static`。所以“页面能完成”和“页面能真实发起生产 Agent 请求”是两件事；后者仍需独立的服务接入决策。
2. Agent 合约在 `src/lib/agent/contracts.ts` 中固定 `AGENT_LOCALE = 'zh-CN'`，runtime instructions 和安全错误也是中文。英文 `/en/agent` 的页面 chrome 可以本地化，但当前不能承诺英文提问/英文回答能力。
3. 当前没有面向浏览器的 success/error/quota response contract。UI 可以先按语义设计状态，但真正接线前必须获得稳定、可本地化的错误 code，而不能直接显示 server/runtime 的中文 `safeMessage`。

以上三项不阻止 UI 结构实现或组件复用，但会阻止一个“中英文都可真实查询、具备完整失败语义”的生产 MVP。

## 2. 调查依据与实际调用关系

本报告以当前代码为准，重点阅读了：

- Overview：`CharacterCatalogPage.svelte`、`LightConeCatalogPage.svelte`、`EnemyCatalogPage.svelte`、`RelicCatalogPage.svelte`、`routes/endgame/+page.svelte`；
- 共享 UI：`OverviewHero.svelte`、`OverviewSearch.svelte`、`FilterChip.svelte`、`FilterGroup.svelte`、`SearchBar.svelte`、`EntityOverviewCard.svelte`、`CompactEntityCard.svelte`；
- 导航与 layout：`Navigator.svelte`、`PrimaryNavigation.svelte`、`src/lib/navigation.ts`、`routes/+layout.svelte`、`styles/app.css`；
- 弹层：`ChangelogModal.svelte`、`SpecialEffectDialog.svelte`、`EndgameLocalNav.svelte`、`SettingsPopover.svelte`；
- Endgame structured UI：`EndgameEnemyCard.svelte`、`EndgameEnemyGrid.svelte`、`domain/endgame-view.ts`；
- i18n / route inventory / assets：`messages/*.json`、`scripts/messages.ts`、`scripts/data/routes.ts`、`scripts/assets/shared.ts`、`lib/data/visual-assets.ts`；
- Agent output：`lib/agent/contracts.ts`、`lib/server/agent/runtime.ts`。

当前 import graph 的关键事实是：

```text
Character / Light Cone / Enemy / Relic catalog
  └─ shared/OverviewHero.svelte

Endgame overview
  └─ shared/OverviewHero.svelte
       └─ artwork slot → EndgameOverviewHeroArtwork.svelte

Navigator desktop rail + overlay pane
  └─ PrimaryNavigation.svelte
       └─ localizedNavigationItems()
            └─ getNavigationItems() + localizedHref()

Homepage directory
  └─ localizedNavigationItems()
```

因此导航数据的变更不仅影响侧栏，也会自动影响首页 directory；这不是仅修改 `PrimaryNavigation` 的局部变化。

## 3. Hero 体系

### 3.1 实际使用情况

Character、Light Cone、Enemy 和 Relic overview 都直接 import 并调用同一个 `src/lib/components/shared/OverviewHero.svelte`。它们的结构与样式没有分叉，差异仅在传入的 eyebrow、title、description、countLabel 与 artwork 数据：

- Character / Light Cone：取 catalog 前三个实体预览图；
- Enemy：固定三个 enemy template 的 portrait；
- Relic：取前三个不重复套装 icon；
- Endgame：仍使用同一个 `OverviewHero`，但通过 named artwork slot 注入 `EndgameOverviewHeroArtwork.svelte`。

所以当前 canonical overview Hero 明确就是 `OverviewHero.svelte`，不是某个 catalog 自己的 header，也不是 Endgame 的 `EndgameSeasonHero.svelte`。后者是赛期详情 Hero，不适合 Agent 一级 overview。

### 3.2 Agent 复用建议

Agent 应直接复用 `OverviewHero`，无需给 Hero 增加 variant，也无需修改其公共 API。建议：

- 传入 Agent 专属 `eyebrow`、`title`、`description`；
- 不传 `countLabel`；
- 用 artwork slot 注入非常薄的 `AgentOverviewHeroArtwork`，在其中展示消息 icon。

不建议把单个消息 icon 直接塞进 `artwork` array。该 array 的 CSS 明确以最多三张角色/物件 artwork 为假设，使用 `overview-hero__character--1/2/3` 的位置、透明度和 14rem 高度；单个方形 icon 会落在第一张角色图的位置（`right: 40%`），语义和构图都不合适。Endgame 已经验证 slot 是处理不同 artwork 语义的正确扩展点。

这种做法不会影响现有 overview 页：`OverviewHero` 保持原样，Agent 的图像布局完全封装在 slot child 中。

### 3.3 `NoviceMessagesIcon.png` 的实际资源路径

已确认源文件存在：

```text
../StarRailRes/icon/sign/NoviceMessagesIcon.png
```

源图为 128×128、带 alpha 的 PNG。浏览器代码不能直接依赖 sibling repository；当前正确链路是：

```text
src/lib/navigation.ts
  NAVIGATION_ICON_KEYS 增加 agent

scripts/assets/shared.ts
  NAVIGATION_ICON_SOURCE_NAMES.agent = 'NoviceMessagesIcon'
  → 从 StarRailRes/icon/sign 读取
  → writeNavigationIconAsset()
  → 生成 64×64 PNG

src/lib/generated-assets/manifest.json
  navigation.icons.available 包含 agent

src/lib/data/visual-assets.ts
  getNavigationIconUrl('agent')
  → /generated-assets/navigation/agent.png
```

导航和 Hero 可以复用同一个生成 URL。由于导航 pipeline 会输出 64×64，Hero 中应把它作为克制的小型装饰，而不是放大成大型主视觉；这样既符合“弱 Agent identity”，也避免明显上采样。如果未来确实需要大尺寸 artwork，再单独评估资产类别，第一版没有必要为同一源图复制一条 manifest 体系。

## 4. 可直接复用的现有能力

| 组件/能力 | 路径 | 当前使用位置 | Agent 预期用途 | 扩展需求 |
| --- | --- | --- | --- | --- |
| `OverviewHero` | `src/lib/components/shared/OverviewHero.svelte` | 四类 catalog、Endgame overview、Search | Agent 页面 Hero | 组件本身无需扩展；通过 artwork slot 组合 |
| 全站 outer container | `src/styles/app.css` 的 `.content` | 所有 route slot | Hero 与页面外层宽度、desktop/mobile gutter | 无 |
| 全站 design tokens | `src/styles/app.css :root` | 全站 | Composer/Answer/dialog 的 surface、border、radius、spacing、type | 无；禁止另起颜色/圆角体系 |
| 主按钮视觉 | `.button` | overview search、empty/error actions | Submit 基础视觉 | 需要 Agent 本地补齐 disabled/loading 样式 |
| 静态文字排版 | 全局 `p`、`--font-body`、`--text-body` | detail、mechanic、relic prose | Answer 正文和 limitations | 组合使用；不要把 Agent 输出送入 `GameText` |
| divider 语言 | `border-top: 1px solid var(--border)` | relic effects、changelog entries、Endgame cards/mechanics | Answer 内 limitations 分隔 | 无 |
| `role="status"` / `aria-live` 的基本模式 | `routes/search/+page.svelte`、`Navigator.svelte` | Search 局部不可用、结果更新、数据版本 | pending/success/failure announcement | 只有模式可复用，没有组件 |
| 原生 modal 行为参考 | `layout/ChangelogModal.svelte` | 更新日志 | “关于 Agent”的 long-form dialog | 不能直接传内容复用；见 Dialog 章节 |
| localized routing | `src/lib/i18n/routing.ts` | 全站 route/nav | `/agent` 与 `/en/agent` 链接 | 无 |
| Navigation renderer | `PrimaryNavigation.svelte` + `Navigator.svelte` | desktop compact rail、overlay、mobile drawer | 自动渲染 Agent 导航项、active state、tooltip | renderer 无需扩展，只扩数据 |

这里的“直接复用”不表示所有视觉都已有 Svelte primitive。例如 surface 是通过全站 tokens 和局部 CSS形成的，不存在一个可直接 import 的 `Card` 组件。

## 5. 适合派生或组合，而不应扩充现有 API

### 5.1 Composer

`OverviewSearch` 和 `SearchBar` 都不适合直接复用：

- 两者都围绕单行 `<input>`；
- `OverviewSearch` 主动拦截 Enter 并提交，与 textarea 中 Enter 换行冲突；
- `SearchBar` 带搜索 action、`role="search"`、query 参数和全局搜索语义；
- 两者均没有 disabled、pending、async error 或 quota 语义。

因此应新增 `AgentComposer` 领域组件。它最小只负责：textarea、label/description、submit button、独立查询提示、“了解 Agent”入口、pending/locked 状态和提交事件。请求执行和最近一次结果应由页面/workspace state owner 管理，不要把 fetch、API error mapping 或历史记录塞进 Composer。

可以复用的底层能力是 tokens、`.button` 的基础外观、全局 focus 色和 520px 的窄屏操作布局思路。需要注意，全局 form CSS 目前只覆盖 `button, input, select`，**完全没有覆盖 textarea**；所以 Agent 必须显式实现 textarea 的 font、color、background、border、radius、padding、focus、placeholder、resize、disabled 与 overflow 行为。

### 5.2 Example Questions

`FilterChip` 的视觉尺寸和 pill 语言最接近目标，但不应直接复用。它始终表达筛选 toggle，并输出 `aria-pressed` 和 selected 状态；示例问题是一次普通 action，只填入 textarea，不是 toggle/filter。

建议新增很薄的普通 button 组合（可作为 `AgentExampleQuestions` 内部 markup，未必需要一题一个组件），派生 FilterChip 的：

- `min-height: 2.1rem`；
- pill radius；
- border/surface/text tokens；
- hover/focus 和 reduced-motion 规则。

不要向 `FilterChip` 增加与过滤无关的 mode，也不要使用 Relic tag，因为 tag 不是交互控件。

### 5.3 Surface

项目没有通用 `Card`/`Surface` Svelte 组件。现有候选都绑定了领域语义：

- `EntityOverviewCard`：必须有 href、media、title/metadata；
- `CompactEntityCard`：实体缩略图与导航语义；
- `MechanicSectionCard`：buff/debuff accent 与 game text；
- `.info-card`：全局 CSS class，但命名和内部 heading 结构属于 detail 信息卡。

Composer 与 Answer 应各自由 Agent 组件使用现有 surface tokens 建立一级边界，而不是为“复用”套入上述卡片。相同 border、radius、background、padding 是复用 design system，不要求复用错误的 DOM/component abstraction。

### 5.4 Dialog

“关于 Agent”应新增 `AgentAboutDialog`，以 `ChangelogModal` 的行为和样式结构为模板。当前只有两个 long-form modal consumer，不建议在第一版顺手重构现有 Changelog；等第三个真实 consumer 出现并确认公共 API 后，再考虑抽取 `ModalShell`。

## 6. 必须新增的最小 Agent 领域组件

建议的最小职责如下：

| 新组件 | 最小职责 | 明确不负责 |
| --- | --- | --- |
| `AgentComposer` | textarea、submit、提示、about trigger、disabled/pending/locked 表现 | fetch、错误翻译、历史 transcript |
| `AgentExampleQuestions` | 展示轻量 action，点击仅回填并把焦点交回 textarea | 自动提交、selected 状态 |
| `AgentAnswer` | success/failure/empty answer surface；渲染 answer 与 limitations | Markdown、evidenceIds、entity card 推断 |
| `AgentStatus`（也可先内聚在 Composer/Answer） | pending、普通失败、quota/预算耗尽的可访问状态语义 | API error code 判定 |
| `AgentAboutDialog` | Beta/独立查询/范围/错误与 quota 说明；modal lifecycle | Changelog loading/dismiss-today 逻辑 |
| `AgentOverviewHeroArtwork` | 在现有 Hero slot 中克制地布置消息 icon | Hero 文案或通用 Hero layout |

`Question Context` 不一定需要独立组件。一个带语义 label 的 compact text group 即可，过早抽成 card/component 反而增加层级。

页面级 state 建议只保留一份 latest run：

```text
idle
  → pending(question snapshot)
  → success(question snapshot, answer)
  → failure(question snapshot, failure kind)

quota locked
  = 非 pending；保留可解释原因；submit 不可用
```

即使按钮和 textarea 已 disabled，submit handler 仍应先检查 `pending/locked`，避免键盘提交或同一 tick 的重复触发。这个 guard 属于 UI state 机，不等同于 backend concurrency 实现。

## 7. 明确不应复用的组件

| 组件/模式 | 不应复用原因 |
| --- | --- |
| `OverviewSearch` | 单行搜索、Enter 即提交；会破坏 textarea 换行和 Agent 语义 |
| `SearchBar` | URL search action、`role="search"`、单行 control；不是 Agent query composer |
| `FilterChip` 原组件 | `aria-pressed`/selected 表达 toggle，不符合 example action |
| `EntityOverviewCard` / `CompactEntityCard` | 强绑定 entity media/link/content structure |
| `MechanicSectionCard` | 强绑定 buff/debuff tone、`GameText` 和 mechanics segment |
| `.empty-state` | 4rem padding、居中、大型 dashed surface，适合整页无结果，不适合 Answer 内请求失败 |
| `.data-placeholder` | 表达“数据缺失”的小型 fallback；quota、provider failure、timeout 不是数据缺失 |
| `SettingsPopover` | 非 modal、无 focus trap、内容很短，不适合长说明 |
| `EndgameLocalNav` mobile dialog | bottom sheet 和导航列表语义，不适合说明正文 |
| `SpecialEffectDialog` | 全屏、宽 68rem、绑定角色 effect/level/content；第一版 About 过重 |
| `GameText` / `DescriptionText` | 解析游戏拥有的特殊文本 token；Agent answer 是不可信模型文本，不应进入游戏 markup parser |
| mdsvex runtime | 项目只在构建期编译 changelog `.svx`；不存在浏览器 Markdown renderer，且 Agent contract 不要求 Markdown |

Answer 必须以普通 escaped text 渲染，允许 `white-space: pre-wrap` 保留换行。不要使用 `{@html}`。当前 `answer` 只是最长 800 Unicode 字符的 string；`limitations` 是最多 5 条、每条最多 160 字符的 string array。这个 contract 足以支持段落和真实 `<ul>` limitations，但不足以证明需要 Markdown parser。

## 8. Composer、loading、error 与 quota 的现状

当前项目的相关能力盘点：

| 能力 | 当前状态 | 建议 |
| --- | --- | --- |
| textarea | 不存在 | AgentComposer 新增，完整定义交互样式 |
| focus state | input/select/button/link 有全局规则；Search sidebar 另有 `focus-within` | textarea 使用同一 gold outline/border 语言 |
| disabled form | 没有现成样式或模式 | AgentComposer 局部定义 opacity/cursor/background，并保持可读对比度 |
| async button | 不存在 | submit 在 pending 时 disabled，并让 label 变为查询中状态 |
| spinner/progress | 不存在 | 第一版可只用状态文字 + 轻量 indicator；若动画，必须支持 reduced motion |
| `aria-live` | Search result group/empty state 已使用 | pending 使用 `role="status"` + polite；结果 surface 可用 polite 更新 |
| error alert | 没有通用组件；Search failure 用 muted `role="status"` | AgentStatus 新增 failure variant；即时失败可用 `role="alert"`，不要让每次 rerender 重复播报 |
| full-page error | `+error.svelte` 使用 `.empty-state.error-state` | 只用于 route 失败，不放进 query workspace |

普通失败后 Composer 应恢复，原问题留在 textarea；success 后可清空 textarea，但 Question Context 必须使用提交时的 snapshot，不能依赖已清空的 draft。

quota/global budget exhausted 是已结束的 failure，而不是 pending。建议同时满足：

- Answer surface 显示该次请求失败的具体、人类可读说明；
- Composer 附近保留低权重但持续可见的 lock reason；
- submit 使用真实 `disabled`，并通过 `aria-describedby` 关联原因；
- 不把 quota 错误 code 或 runtime 中文字符串硬编码到组件。

## 9. Answer、Question Context 与 Limitations

### 9.1 Question Context

“你问 / 问题正文”应使用 `--font-internal` 或 `--font-helper` 的 muted label，加一段 `--text-secondary` 正文。不要使用 `.kicker`：当前 kicker 是 gold、uppercase、0.18em letter spacing，视觉权重更像 Hero eyebrow，不是弱 metadata。

Question Context 不需要 border、background 或 card。它与 Answer surface 之间用 `var(--space-3/4)` 即可，和现有 card metadata、Endgame label 的弱层级一致。

### 9.2 Answer 正文

可复用全站 body type（`--font-body`、`--text-body`、约 1.7 line-height）以及 Relic/Endgame 中的 `overflow-wrap: anywhere`。站内没有通用 prose/Markdown component；`.prose` 只是 detail section 的 class usage，没有一套富文本 renderer。

建议第一版：

- `answer` 渲染为 escaped plain text；
- `white-space: pre-wrap`；
- 不把模型中的 `**`、`-`、HTML 当作语法；
- 仅 UI 自己拥有的 label（如小 icon + “Agent”）使用 `<strong>`；
- 若未来要稳定的段落/列表，应先扩展 structured output，而不是猜测 Markdown。

### 9.3 Limitations

当前 contract 天然适合真实列表。空数组时不渲染任何容器；非空时在 Answer surface 内：

```text
answer
──────── divider
注意
• limitation 1
• limitation 2
```

复用 border、muted typography 和普通 list semantics 即可。不应再套 `MechanicSectionCard`、notice card 或 inner panel。需要 icon 时只能是轻量 decorative/semantic icon + text，不应新增发光 AI 标识。

## 10. Card hierarchy 评价

建议层级是合理的，并且比机械复用现有 card 更符合当前 design language：

```text
OverviewHero                       无 card

Readable workspace column
├─ Composer surface               主 surface 1
│  ├─ textarea + submit
│  ├─ independent-query notice    内部 helper text
│  └─ about action                quiet action
├─ Example questions              lightweight buttons，无外层 card
├─ Question context               typography only
└─ Answer surface                 主 surface 2
   ├─ answer
   └─ limitations                 internal divider section
```

潜在 card nesting 风险：

- 给整个 workspace 再包大 card；
- Examples 每题一个完整 card；
- Question Context 单独一张 card；
- Limitations 再套 notice/card；
- Answer 中先做 Agent card，再做 answer card。

同时不能“去 card”过头。Composer 和 Answer 确实承担不同的交互/信息语义，需要明确 border、surface background、radius 和 padding；如果只留下裸 textarea、裸段落和大段空白，会偏离站内 overview/detail 已建立的完成度。两个一级 surface 正好是合理下限。

## 11. 页面宽度与响应式

### 11.1 现有规则

- 全站 desktop `.content`：`width: min(100% - 3.5rem, 1440px)`；
- `<= 820px`：切换 mobile header，`.content` 变为 `min(100% - 2rem, 720px)`；
- overview Hero 自己在 `<= 700px` 缩短并降低 artwork opacity；
- 常用窄屏 control breakpoint 是 `<= 520px`；
- Endgame detail 在 `<= 1080px` 移除 local-nav 双栏；
- 已有 readable measure 的真实先例是 `AsBossTraits` 的 `max-width: 72ch`，Relic effect prose 使用 `max-width: 40rem`，但两者都不是共享 layout primitive。

### 11.2 Agent 建议

Hero 继续占用全站 `.content` 宽度。Hero 以下增加一个 page-local readable workspace wrapper，使用现有的 `72ch` 可读 measure（或与其严格一致的 token/值）并居中；不要再发明一个 700/720/740px 的近似尺寸。因为仓库没有共享 readable-column 组件，第一版可以是 Agent page 的局部 layout class，不必为单一 consumer 抽象。

响应式无需新增 breakpoint：

- Desktop：workspace 限制到 readable measure，Composer 和 Answer 全宽；
- Tablet：仍使用同一单列，外层 gutter 由 `.content` 提供；`<=820px` 自动进入 mobile shell；
- Mobile：沿用 700px Hero 和 520px control 断点，submit 变为整行，example buttons 自然 wrap，surface padding 从 `--space-6` 降至 `--space-4`。

需要专门验证 320px 宽度下 textarea、长英文文案、quota reason 和 example 按钮不会产生横向滚动。无需为第一版引入双栏或新增 tablet logic。

另一个导航响应式风险是：desktop rail 目前为 6 个 48px item，新增第 7 项后，在低高度桌面/横屏设备上更接近 `min-height: 620px` 的容量上限。普通宽屏不是 blocker，但实现轮应覆盖短 viewport；若发生溢出，应调整 rail 的滚动/密度，而不是缩小单项 44px 可点击目标。

## 12. “关于 Agent” Dialog 调查

### 12.1 候选组件

| 候选 | 当前用途 | Keyboard/focus/backdrop | Mobile | 适配判断 |
| --- | --- | --- | --- | --- |
| `ChangelogModal` | 长更新日志 | native `showModal()`；focus close；拦截 cancel/Escape 后 close；backdrop click；锁 body/html scroll；内部滚动 | `<=560px` 接近全屏，保留 0.5rem 外边距 | **最佳行为与视觉参考** |
| `SpecialEffectDialog` | 大型角色效果详情 | native modal；focus close；cancel/backdrop；锁 scroll | `<=820px` 真正 100vw/100dvh | 内容和尺寸过重，不直接复用 |
| `EndgameLocalNav` dialog | mobile bottom sheet 导航 | native modal；打开后 focus current item；close 后显式 focus trigger；backdrop close | `<=820px` bottom sheet | 导航专用，不适合说明文本 |
| `SettingsPopover` | 语言切换 | window click/Escape；无 modal/focus trap | 220px popover | 不适合长说明 |

### 12.2 建议与 accessibility 状态

`ChangelogModal` 最适合当作 Agent About 的基准：它已经验证 scroll locking、长内容滚动、sticky-like header/footer 区隔、close focus、Escape 与 backdrop。原生 `<dialog>` 提供 modal focus containment。

但它不是可配置 shell：组件内部耦合 changelog 异步加载、自动打开、localStorage “今日关闭”、entry/date/footer 行为，不能直接复用。第一版应新增 Agent 专用 dialog，复制/组合已验证的行为，而不是把 changelog 改成多用途 API。

实现时应比现有 Changelog 再补一项：保存实际 trigger，并在 close 后显式恢复 focus。`ChangelogModal` 没有在组件代码中显式恢复触发器（可能依赖浏览器默认），而 `EndgameLocalNav` 已展示了显式恢复方式。还应提供 `aria-labelledby`，必要时用 `aria-describedby` 关联摘要。

Agent About 不必默认全屏。Changelog 的 44rem desktop + mobile 近全屏规则足以容纳说明；只有真实内容/可用性测试证明需要，才采用 SpecialEffect 的 100dvh 模式。

## 13. Navigation、route 与 i18n

### 13.1 Navigation 接入点

唯一数据源是 `src/lib/navigation.ts`：

- `NAVIGATION_ICON_KEYS` 定义 typed icon key；
- `getNavigationItems(locale)` 组装 id/href/label/icon/fallback；
- `localizedNavigationItems(locale)` 注入 locale href；
- `isNavigationItemActive()` 先 canonicalize，再对非首页使用 prefix match。

`PrimaryNavigation` 同时服务 desktop compact rail 和 overlay/mobile drawer。Agent 最自然的位置是追加在 Endgame 后，保持当前数据模块顺序：Characters → Light Cones → Relics → Enemies → Endgame → Agent (beta)。active state 对 `/agent` 与未来 `/agent/...` 自动成立；英文 `/en/agent` 会先 canonicalize。

需记录两个影响面：

1. 首页 `routes/+page.svelte` 也读取 `localizedNavigationItems()` 并过滤掉 overview，因此 Agent 会自动出现在 homepage directory；应把它视为产品可见改动并更新 baseline，而不是意外副作用。
2. `isNavigationItemActive()` 是纯 `startsWith`，未来若出现 `/agentic` 也会误判；当前路由集合没有冲突，非 MVP blocker。未来可改为 segment boundary，但不应在 Agent UI 实现中顺手清理。

Agent 应是独立静态 route `src/routes/agent/+page.svelte`，不要塞入 `[category=category]`：category matcher 只接受四类数据库 catalog，Agent 也不属于 catalog data loader。

### 13.2 Route inventory

`scripts/data/routes.ts` 的 `routePaths` 是规范文档指定的 prerender 与 sitemap source，目前手工包含 `/`、`/search`、四类 catalog/detail 和 `/endgame`。未来实现 `/agent` 时应加入这里，使 `/agent`、`/en/agent` 明确进入 public entries 和 sitemap。不要只依赖 link crawling。

### 13.3 Site Messages

真实目录是：

```text
messages/zh-CN.json
messages/en.json
messages/contracts.json
```

Paraglide 配置在 `project.inlang/settings.json`，`scripts/messages.ts` 强制两套 locale key parity、placeholder parity、snake_case key 规则。项目使用平铺前缀而不是嵌套 namespace，例如 `characters_*`、`search_*`、`endgame_*`。

Agent 建议使用平铺的 `agent_*` 分区：

- `navigation_agent` / `navigation_agent_fallback`；
- `agent_eyebrow`、`agent_title`、`agent_description`；
- `agent_composer_*`、`agent_examples_*`；
- `agent_status_pending`、`agent_error_*`、`agent_quota_*`；
- `agent_about_*`；
- `agent_answer_*`、`agent_limitations_*`。

`navigation_agent` 在 zh-CN 与 en 中都写为完全相同的 `Agent (beta)`；其他文案正常本地化。运行时 error 应先映射为稳定语义 code，再由 UI 调用对应 Site Message。不要在 Svelte component 中 switch server 中文文本，也不要把 provider/internal code 显示给用户。

### 13.4 当前 locale blocker

站点本身公开 zh-CN 与 en，但 Agent runtime 的 `AGENT_LOCALE`、tool schema 和 final-answer instructions 均固定中文。可行的 MVP 选择只有两类：

- 明确把能力描述为“目前仅支持中文查询/中文回答”，两套页面 chrome 仍各自本地化；或
- 在上线前另开 capability 工作解决 Agent locale contract。

在没有产品决定前，英文 description 不应暗示完整英文 Agent。这个问题是 locale/capability blocker，不应通过前端偷偷翻译 question 或 answer 规避。

## 14. Future structured visual answer

`EndgameEnemyCard` 的直接输入是：

```ts
occurrence: EnemyOccurrenceView
variant?: 'standard' | 'compact'
level?: number
```

`EnemyOccurrenceView` 包含 identity、monster/template ID、name、可选 enemyHref/rank/portrait、weaknesses、可选 count，以及已经格式化过的 hp/speed/toughness。组件本身并不依赖 Endgame page context：它能渲染为 link 或 article，已有 missing portrait fallback，并且 Search 已通过 `EndgameEnemyGrid` 在 Endgame 页面之外复用它。因此组件的可复用性较好。

但当前 Agent 的证据行是 `NormalizedEndgameRow`，最终 public output 只有：

```text
answer
evidenceIds
limitations
```

二者并不直接兼容。Agent row 虽包含 template/monster/location/stats 等未来扩展所需 identity，但没有完整的 `EnemyOccurrenceView` presentation（portrait URL、本地化 display formatting、href、view identity），最终 answer 也不会把 row payload 暴露给 UI。`evidenceIds` 只是引用，不应由浏览器解析成 domain model。

未来成本评估：**中等**。推荐路径是 endpoint/server presentation layer 根据明确的 structured visual block 构建现有 `EnemyOccurrenceView` 或 `EndgameEnemyGridItem`，然后直接复用 `EndgameEnemyCard`；不需要现在解耦 card。可能只需一个 presenter + wrapper。不要从自然语言 answer 猜 entity，也不要为了 backlog 现在修改 Agent output contract。

## 15. 风险与 blocker 分级

### 15.1 UI MVP blocker / 上线前必须解决

| 风险 | 性质 | 说明 |
| --- | --- | --- |
| 无浏览器可调用的 Agent endpoint，规范仍是 static-only | architecture/integration | UI 可实现但无法真实完成 run；需要独立服务/部署决策，本轮不处理 |
| 英文公开 locale 与 `AGENT_LOCALE='zh-CN'` 冲突 | product/capability | 必须明确中文限定或另行扩展 runtime locale |
| 无 public error/quota contract | integration | UI 无法可靠区分 timeout/provider/quota/global budget；需稳定 code，不能匹配 message 文本 |
| textarea/disabled/loading/error a11y 必须新建 | UI | 不是现有组件可补齐；缺少时不能上线 |
| 并发必须有 UI state guard | UI behavior | disabled 属性之外，handler 也必须拒绝 pending/locked 状态 |

### 15.2 非 blocker backlog / 实现时关注

| 风险 | 性质 | 建议 |
| --- | --- | --- |
| Dialog 行为在多个组件内重复 | technical debt | 第一版沿成熟模式实现；有第三个通用 consumer 后再抽 ModalShell |
| Changelog 未显式恢复 trigger focus | accessibility debt | AgentAboutDialog 显式恢复；不在本轮重构 Changelog |
| Navigation active 用裸 prefix | technical debt | 当前 `/agent` 安全；未来按 path segment 收紧 |
| 第 7 个 rail item 的短 viewport 容量 | responsive | 增加 desktop short-height E2E/视觉验证 |
| 64px nav asset 在 Hero 放大可能变软 | visual | Hero 保持小型、弱 identity；不要作为大型头像 |
| Answer 无 Markdown contract | rendering | 只渲染 escaped plain text；未来由 structured contract 驱动 rich content |
| 当前没有通用 readable-column primitive | component gap | Agent page 局部复用 72ch 既有 measure，不急于抽象 |
| `EndgameEnemyCard` CSS 位于 global app.css | component coupling | 当前可复用；未来 structured cards 若扩大再评估样式封装 |
| 添加 nav 会改变 homepage directory/baseline | regression scope | 实现 prompt 必须明确接受并更新对应测试/fixture |

没有发现会迫使重构 `OverviewHero`、现有 catalog、Endgame card、Agent runtime 或 structured output 的 UI 组件 blocker。

## 16. 推荐的未来 implementation map

### Existing components reused unchanged

- `src/lib/components/shared/OverviewHero.svelte`
- `src/lib/components/layout/PrimaryNavigation.svelte`
- `src/lib/components/layout/Navigator.svelte`
- `src/lib/i18n/routing.ts`
- 全站 `.content` container 与 `src/styles/app.css` tokens
- `.button` 的基础视觉（由 Agent 局部补 disabled/loading）
- 当前 plain typography、divider、focus color 与 reduced-motion 语言
- 未来 structured answer 中的 `EndgameEnemyCard` / `EndgameEnemyGrid`（仅在获得正确 view model 后）

### Existing patterns reused with composition

- `OverviewHero` artwork slot + 新的 Agent artwork child；
- FilterChip 的 pill 视觉语言 + 普通 action button 语义；
- ChangelogModal 的 modal lifecycle/geometry + EndgameLocalNav 的显式 focus return；
- Search 页的 `aria-live` / `role="status"` 模式；
- AsBossTraits 的 72ch readable measure；
- Relic/Endgame 的 body typography 与 divider pattern。

### New Agent-specific components

- `src/lib/components/agent/AgentComposer.svelte`
- `src/lib/components/agent/AgentExampleQuestions.svelte`
- `src/lib/components/agent/AgentAnswer.svelte`
- `src/lib/components/agent/AgentStatus.svelte`（若状态 markup 足够小，也可先内聚）
- `src/lib/components/agent/AgentAboutDialog.svelte`
- `src/lib/components/agent/AgentOverviewHeroArtwork.svelte`
- `src/routes/agent/+page.svelte`

### Existing files likely touched in implementation

- `src/lib/navigation.ts`：新增 item 与 typed icon key；
- `scripts/assets/shared.ts`：`agent → NoviceMessagesIcon` source mapping；
- `src/lib/domain/visual-assets.ts` / `src/lib/data/visual-assets.ts`：只有 manifest schema/type 需要时才改；按现有 navigation 集合扩展通常无需新 resolver；
- `messages/zh-CN.json`、`messages/en.json`，必要时 `messages/contracts.json`；
- `scripts/data/routes.ts`：加入 `/agent` public route；
- 生成的 visual asset manifest/output；
- `tests/unit/navigation.test.ts`、`tests/unit/visual-assets.test.ts`；
- `tests/e2e/navigator.spec.ts` 与新的 Agent page E2E；
- homepage product baseline（因为共享 navigation source 会增加 directory item）。

### New files likely needed but不属于本次 UI component implementation

- 浏览器 Agent endpoint / service adapter；
- public request/response/error/quota contract；
- 该接入对应的 deployment/adapter 配置与验证。

这些应由单独任务处理，不应夹带进纯 UI component 实现，也不应通过把 server-only runtime import 到浏览器 bundle 来绕过。

## 17. 对下一轮实现 prompt 的具体约束

下一轮 UI 实现可以明确要求：

1. `OverviewHero` 原样复用，Agent artwork 走 slot；不新增 Hero variant。
2. 页面是 single-run workspace，只保留最近一次 question/result；不得渲染持续增长 transcript。
3. 只有 Composer 和 Answer 两个一级 surface；不得加 Workspace card 或 limitation card。
4. Composer 新建领域组件；不得改造 SearchBar/OverviewSearch。
5. Examples 使用普通 button 语义，只填入、不提交；不得直接复用带 `aria-pressed` 的 FilterChip。
6. Answer 只渲染 escaped plain text 和真实 limitations list；不加 Markdown dependency，不使用 `{@html}` 或 `GameText`。
7. pending 同时禁用 textarea/submit、保留可见输入、发布 polite status，并在 handler 内阻止重复提交。
8. quota 是结束态 failure；submit 可持续 disabled，但必须显示本地化原因。
9. About dialog 以 Changelog modal 为行为基准，显式恢复 trigger focus；不得使用 SettingsPopover。
10. Hero 外层沿用全站 container，workspace 使用既有 72ch readable measure与现有 820/700/520 breakpoints。
11. 导航 item 放在 Endgame 后，并显式接受 homepage directory、route inventory、asset manifest 和测试数量的连带变化。
12. UI task 不触碰 Agent runtime、Endgame card、structured output、adapter 或 deployment；真实 API 接线另行实施。

最终结论：当前组件体系足以让 Agent 页面看起来天然属于 HSR-Database；最佳方案不是追求“所有东西都必须 import 现有组件”，而是保留成熟的 Hero、导航、layout、tokens 与 modal 行为，同时用少量、职责窄的 Agent 领域组件补齐 textarea、异步状态和 answer surface。这样能同时避免另一套 design system、错误的搜索抽象和过度 card nesting。
