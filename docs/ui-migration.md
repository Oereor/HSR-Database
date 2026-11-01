# UI 基础与迁移验收

shadcn-svelte 是网站统一 UI 基础。迁移分支为 `refactor/shadcn-foundation`，初始基线为 `0fd5921`；Phase 7 清理基线为 `79949a0`。游戏数据、计算、国际化、路由和素材解析沿用原架构，当前架构约定见 [本地化与数据生成](architecture/localization-and-data-generation.md)。

## 阶段状态

| 阶段 | 状态 | 交付内容 |
| --- | --- | --- |
| Phase 0 | 完成 | UI 审计、主题与验证基线 |
| Phase 1 | 完成 | 手动接入标准组件、Design Tokens 与 Tailwind 4 |
| Phase 2 | 完成 | 全局 Breadcrumb 与累计 Sticky Offset |
| Phase 3 | 完成 | Dialog、Sheet、Popover、Sonner、共享选项控件 |
| Phase 4 | 完成 | Sidebar、统一 InputGroup 搜索、响应式页面外壳 |
| Phase 5A | 完成 | 四类实体目录、筛选、排序与卡片 |
| Phase 5B–5C | 完成 | 详情 Hero、属性、遗器、技能、行迹、星魂及等级控件 |
| Phase 6A–6B | 完成 | Endgame 总览、赛期目录、机制、敌人与局部导航 |
| Phase 6C | 完成 | 玩家查询、请求状态、名片与角色列表 |
| 细节修复 | 完成 | 技能名称对齐、metadata、稀有度筛选及自适应分页 |
| Phase 7A–7C | 完成 | 技术债审计、CSS / 组件清理、测试与文档整理 |

## 当前维护约定

### 基础组件与主题

- 手动维护 `$lib/components/ui/` 中的标准组件[^manual]，不执行 CLI overwrite 或重新初始化。`components.json` 保留 new-york 标识；后续 CLI 已使用新的默认风格，不能据此覆盖现有实现。
- `app.css` 保留业务色板、排版、布局与专用状态；`theme.css` 将既有深蓝黑 / 金色映射到 shadcn 语义变量与 Tailwind。原 `--muted` 正文引用已迁到 `--text-body`，`--radius-panel` 与标准圆角尺度分开；不为统一命名批量改写业务引用。
- 根 HTML 默认 dark，无主题探测脚本或浅色切换。保留 Bits UI 的 open / closed、checked / unchecked、horizontal / vertical 等状态变体及 Tailwind token 映射。
- 全局基础层保留字体、文字色、光标、键盘焦点与 reduced-motion；表单边框、背景、padding 和过渡由标准控件负责。无实际使用方的 table / select option 视觉规则已删除。
- 动态布局使用完整工具类字面量或显式分支；OverviewHero 的动态编号仅为语义标记，位置工具类均是完整字面量。不要通过拼接片段构造 Tailwind 工具类。

### 导航、弹层与搜索

- Sidebar 采用内容区唯一 Trigger / Breadcrumb 顶栏[^sidebar]，展开 / 折叠宽度为 19rem / 4rem，移动端为单一 Sheet。默认折叠，状态仅在根布局生命周期内保持；不持久化、不注册默认全局快捷键。导航断点为 48rem，业务断点独立保留。
- Sidebar 标题显隐跟随宽度过渡完成事件，搜索聚焦等待实际可见，不用固定计时器。展开态和移动端禁用 Tooltip，避免拦截 Escape。版本信息使用 status，不产生无操作按钮。
- Breadcrumb、内容与 Footer 共用最大宽度和边距；锚点使用累计 Sticky Offset，保留安全区、详情 SectionNav 与 Endgame 局部导航。
- Dialog / Sheet / Popover 复用 Bits UI 的定位、滚动锁和焦点管理。特殊效果、材料与更新日志保留真实触发元素及焦点恢复；删除的独立 Close 包装组件不影响 Content 内部的 primitive Close。
- 根布局外仅挂载一个深色 Sonner，保留原通知替换、4 秒时长与切换 / 卸载时 dismiss 行为，避免 live region 占据页面布局。
- 搜索统一使用 InputGroup[^input-group]，保留 GET、Enter、显式 label、语言路径及 query / hash。语言切换仍由 URL 决定，不增加可变 locale 状态。

### 业务展示与分页

- 目录与玩家列表复用 OverviewGrid；Card、Badge、Separator、Toggle / ToggleGroup、Switch、Select[^select]、Slider 和 Pagination[^pagination] 负责通用展示及交互。角色每个语义技能类别仍只有一张卡，变体和独立进度留在卡内。
- 详情保留一体化 Hero、角色立绘构图、图片遮罩、属性 / 稀有度颜色及缺图降级。等级、叠影、Profile、培养与玩家实际状态保持独立语义；预览不能修改培养目标或远程玩家状态。
- 培养结果使用 Card；搜索与错误空状态使用 Empty。Empty 新增可选 `tag: 'div' | 'section'`，默认仍为 div，避免迁移时丢失原 section、标题和 live region。
- Endgame 保留四模式差异、机制容器查询、波次宽度 / 分隔、AS 对照网格和水印遮罩；不以通用网格替代这些游戏布局。玩家保留全部元信息、null 与零的区别、请求竞态、缓存及未知角色降级。
- OverviewGrid 挂载后测量实际列数，通过 ResizeObserver 与动画帧合并报告；无回调的搜索 / 玩家 Grid 不安装观察。角色 / 光锥 / 遗器以 36、敌人以 48 为目标容量，取最接近目标的正整数列数倍数，平局取较大值。
- SSR 与首轮水合使用固定容量；首次测量按响应式容量解释 URL 页码，后续缩放保留原页首实体。布局更新使用 replaceState / noScroll / keepFocus，保留重复查询参数与 hash，不增加历史项；用户导航优先，筛选 / 搜索 / 排序沿用原重置规则。

## Phase 7 审计与清理

审计结合模板、动态 class、Slots / Snippets、组件状态、内部依赖、Portal 和构建输出，静态搜索仅用于生成候选。所有 shadcn 目录都有使用方，按子组件粒度清理。

- 删除：旧 `.button` / `.button--quiet`、`.entity-grid`、`.table-wrap`、`.split-section`、`.stage-list`、`.dialog-heading`、无使用方的 `.stack-list.compact` 及关联响应式规则；删除 `--glow`、`--font-page-title`、`--font-hero-overview-title`、`--font-card-title`，合并重复的详情标题规则。
- 删除 14 个 shadcn 子组件及对应导出：Breadcrumb Ellipsis；Dialog Close / Description / Footer / Header / Trigger；Popover Close / Description / Header / Title；Sheet Close / Description / Footer / Trigger。Overlay / Portal、Sidebar 使用的 Sheet Header 与现有双命名导出保留。删除无引用的 `WithoutChildren` 辅助类型。
- 迁移：培养结果从 `.info-card` 接入 Card；搜索与错误页从 `.empty-state` 接入 Empty，删除这两组共享样式。培养结果的必要后代排版收归培养组件，旧色值、尺寸与间距保持一致，没有新增业务组件。
- 保留：材料整卡触发器、搜索加载更多、培养重试、正文内联触发器、敌人 radio / Tabs 及原生 disclosure。强行套用通用 Button 需要重置尺寸、换行、hover / active / focus 等更多默认值，维护成本高于现有短实现；后续仅在能减少重复且证明兼容时处理。
- 依赖：37 个直接依赖均保留；源码、脚本、配置和 peer dependency 未证明存在可删除项。`@internationalized/date` 是 Bits UI peer dependency；cn、tailwind-variants、tw-animate-css 与 svelte-sonner 均在使用。package.json 与 lockfile 未变。
- 测试：删除重复的遗器视口矩阵和纯属性行样式一致性测试，移除旧空 DOM 与固定 padding 断言。Endgame 改用项目桌面 / 移动视口各跑一次，移除重复截图与 Sidebar 宽度测量，保留独立容器查询边界、四模式导航及长文本溢出检查。自适应分页列数、URL、业务状态及键盘 / 焦点验证保留。

### 规模对比

以下只统计 Git 跟踪的生产组件 `src/lib/components/**/*.svelte`、组件目录 / hooks / utils 的相关 TypeScript，以及 `src/styles/**/*.css`。排除路由模板、测试、文档、生成数据与构建产物。组件源码行数包含 style；组件内 CSS 是单独拆出的明细，不能再次加到组件源码总量。

| 指标 | 清理前 `79949a0` | 清理后 |
| --- | ---: | ---: |
| 生产 Svelte 组件 | 189 | 175 |
| 其中 shadcn UI 组件 | 80 | 66 |
| 生产组件源码行数 | 11,170 | 10,954 |
| 相关 TypeScript 文件 / 行数 | 29 / 463 | 29 / 419 |
| 共享 CSS 行数 | 1,601 | 1,443 |
| 组件内 CSS 行数 | 1,624 | 1,636 |
| 直接依赖 | 37 | 37 |
| Vitest / E2E / component 测试文件 | 87 / 32 / 2 | 87 / 32 / 2 |
| Playwright E2E 展开用例（含项目） | 577 | 573 |

14 个组件为删除；Card / Empty 是既有组件的兼容迁移；Empty 的可选语义标签是新增接口。组件内 CSS 增加 12 行，来自培养专用排版迁入与旧布局规则移除；共享与组件内 CSS 合计减少 146 行，不将迁移计作全部删除。未新增生产组件或依赖。

构建产物另计：清理前已有生产输出的全部 CSS 合计 170,568 字节，清理后 168,076 字节；各文件分别 gzip 后合计 32,769 → 32,299 字节。两侧使用相同文件集合规则；产物字节数不与源码行数混用。验证日志、统计脚本、临时配置及截图仅保留在忽略目录 `data/audit/`。

## 最终验证与剩余债务

2026-11-01：变更文件 Prettier / ESLint、`git diff --check`、完整 `pnpm check`（Svelte 0 errors / 0 warnings）和一次 `pnpm build` 生产预渲染构建通过。

- 相关 Vitest 9 个文件、209 项通过，覆盖共享 UI、搜索、培养展示、玩家组件、Endgame 卡片和分页；未修改或删除业务单元测试。
- 新生产预览上的 50 项 Chromium 回归全部通过，无跳过、失败或 flaky。覆盖中英文、桌面 / 移动 Sidebar 与焦点恢复、Breadcrumb、目录筛选 / 排序 / 分页及历史、四类详情、四模式 Endgame、确定性玩家错误 / 重试、培养等级键盘与失败恢复、材料弹窗焦点 / 缓存，以及搜索空结果 / 加载更多。
- 迁移前后 12 个双语桌面 / 手机状态的尺寸、边框、颜色、字体与间距一致；Empty 的 gap 在 block 布局下不参与排版。11 张截图逐像素一致，另 1 张仅 Sidebar 图标区域有 47 像素差异；迁移内容区域一致，并人工查看代表截图。不建立视觉快照基线。
- 沙箱缺少 Chromium，Vitest 临时目录 rename 曾遇到 EPERM；本机执行相同检查后通过，未启动的测试不计通过数。文档无伪代码；仓库缺少 `.crossnote/scripts/check-pseudocode.cjs`，Markdown 依 `.prettierignore` 手工维护并通过空白检查。

剩余维护项是上述有意保留的专用原生交互，以及现有的语义 / 业务 token 兼容层；没有证据支持在此阶段强制迁移。未来调整需继续验证焦点、状态和级联兼容。真实第三方玩家 API、非 Chromium 浏览器和远程部署未验证；本地 Analytics 404 是既有预览限制。两个只读上游状态保持不变。Phase 7 完成后停止，不增加功能、不推送或部署。

### 参考文献

[^manual]: shadcn-svelte. Manual Installation. [官方文档](https://shadcn-svelte.com/docs/installation/manual).
[^sidebar]: shadcn-svelte. Sidebar. [官方文档](https://www.shadcn-svelte.com/docs/components/sidebar).
[^input-group]: shadcn-svelte. Input Group. [官方文档](https://www.shadcn-svelte.com/docs/components/input-group).
[^select]: shadcn-svelte. Select. [官方文档](https://www.shadcn-svelte.com/docs/components/select).
[^pagination]: shadcn-svelte. Pagination. [官方文档](https://www.shadcn-svelte.com/docs/components/pagination).
