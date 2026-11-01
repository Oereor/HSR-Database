# UI 迁移计划

## Phase 0：审计与基线

基线为 `develop` 的 `0fd5921`，重构分支为 `refactor/shadcn-foundation`。环境：Node.js 24.21.0、pnpm 11.9.0、Svelte 5.57.0、Tailwind CSS 4.3.3。`pnpm check`、`pnpm build` 已通过；首次类型检查遇到旧素材清单缺少 `characters.icons`，由现有构建流程刷新生成缓存后消失，无源码修复。网站与两个只读上游仓库均无工作区变更。

全局入口是 `src/styles/app.css`，由根 layout 导入，另有 detail-hero / detail-inspection 展示样式及组件内 CSS。Tailwind 已通过 Vite 插件接入；站点默认深蓝黑背景、金色强调，沿用中英文字体栈、语义字号及 `--space-*` 间距。业务组件、Paraglide 消息和素材加载各有独立边界。

| 分类            | 后续处理                                                                                     |
| --------------- | -------------------------------------------------------------------------------------------- |
| Dialog          | 替换 ChangelogModal、SpecialEffectDialog、ItemDetailModal 的交互外壳，保留数据与业务编排     |
| Popover / Toast | 迁移 SettingsPopover、InfoToast，保留状态来源及消息调用                                      |
| 筛选 / 基础交互 | 逐步迁移 FilterGroup / FilterChip、Button、LevelSlider、Tabs、Disclosure，保留筛选和计算语义 |
| 业务展示        | 保留角色、光锥、遗器、敌人、养成、玩家及 Endgame 组件，通过组合基础组件逐步迁移              |

### CSS 兼容风险

- 旧 `--muted` 是正文色 `--text-body`，shadcn 的同名变量是背景色；必须迁移所有旧引用，包括作为背景使用的位置。
- 旧 `--radius-lg` 为 22px，与 Tailwind / shadcn 的圆角尺度冲突；应改为业务面板变量并保持值不变。`--border` 语义一致，可复用现值。
- 未分层的 `a`、`button`、`p` 等元素规则可能覆盖工具类；接入时处理基础规则层级，保留业务 class 的既有覆盖顺序。
- `.button`、局部 `.button-primary`、筛选 chip、标签及卡片的边框、圆角、焦点样式分散；`.enemy-summon-list` 等存在后置覆盖。先标记，迁移对应使用方后再删除，不把有意覆盖当作废弃代码。

## Phase 1：基础接入

采用官方手动安装流程[^manual]，使用 Svelte 5 / Tailwind 4 的 new-york 基础组件[^tailwind-v4]。手动合并主题，禁止在原 CSS 上运行初始化覆盖。默认保持深色，建立可覆盖的语义 token，预留浅色扩展而不增加主题切换。仅在错误页返回链接验证标准 Button，不创建演示页。

验收：变更文件格式与 lint、完整类型检查和生产构建；复用共享 UI 单元测试及 ci-smoke，补充少量双语错误页链接和键盘回归；检查桌面与移动端代表页面的颜色、圆角、布局及溢出。联网使用已核实的项目代理，不升级无关依赖。

### 基础接入约定

- `components.json` 保留 new-york 标识；官方 Tailwind 4 schema 已将 style 标记为兼容字段，新组件采用当前标准样式。Button 从官方文档源码引入，仅按仓库格式整理，入口为 `$lib/components/ui/button`。工具函数使用官方推荐的 `cn`，仅新增精确版本 `cn@0.5.1`、`tailwind-variants@4.0.0`、`tw-animate-css@1.4.0`，其他依赖保持原锁定版本。
- `src/styles/theme.css` 集中管理语义颜色及 Tailwind 映射；深蓝黑背景、金色 Primary / Ring、分层 Surface 及前景色复用现有色板。字体族独立为 `--font-family-sans`，映射 `font-sans`；字号复用现有语义尺度，间距沿用 Tailwind 默认 0.25rem 基准及现有 `--space-*`，不另建重复尺度。
- 根 HTML 固定 `dark`，首屏无需主题脚本。未来浅色主题应覆盖语义颜色与兼容的旧颜色令牌，再实现切换；该阶段不提供浅色配色或切换入口。
- 原 `app.css` 页面规则保留，仅将元素基础规则放入 `base` 层。旧 `--muted` 引用统一改为 `--text-body`；旧 `--radius-lg` 改为 `--radius-panel: 22px`，`--radius-card` / `--radius-control` 保持原值。仍在使用的 `.button`、弹窗、筛选等组件和样式继续保留。
- 后续添加组件时沿用 `$lib` 别名，审查依赖及 CSS diff。不要对现有 `app.css` 执行 CLI `init`；依赖安装后检查锁文件，防止项目已有 `latest` 声明刷新无关版本。

### Phase 1 验证结果

2026-10-31 完成基础接入。变更源码的 Prettier / ESLint、`pnpm check`（0 errors / 0 warnings）、`pnpm build` 均通过；共享 UI 单元测试 14 项、ci-smoke 与双语错误页桌面 / 移动端浏览器测试共 9 项通过。错误页确认返回链接语义、当前语言目标、Tab 焦点、Enter 激活、金色主题及 reduced-motion 生效。

首页、中英文首页、角色目录、角色详情、敌人详情、玩家入口及 Endgame 入口共 7 个路由，在 1280px / 390px 下的 14 张首屏截图与迁移前逐像素一致，采样元素的颜色、字号、圆角及位置一致，均无横向溢出。错误页桌面和移动布局已检查。此对比为阶段性人工验收，不加入阻塞 CI 的全页面基线。验证不包含玩家远程 API 和生产部署；本地 Vercel Analytics 脚本返回 404，不影响 UI 验证。

## Phase 2：全局导航

根布局统一渲染路由 Breadcrumb，复用既有双语标签和页面数据；实体及赛期名称不新增请求。查询参数不增加层级，当前项无跳转链接，移动端单行截断保留完整可访问名称。删除重复的列表及 Endgame 父级返回导航，保留玩家上下文返回。站点栏、Breadcrumb、局部导航及锚点偏移统一使用 CSS 变量。

官方 CLI 1.7.2 已不再识别 new-york，并提示使用当前默认 nova；保留原配置、主题和 Button，不运行初始化。新增标准 Breadcrumb 和精确版本 @lucide/svelte，未更新已有依赖。

验证：路由及现有导航单元测试 31 项通过，变更源码格式 / ESLint、完整类型检查（0 errors / 0 warnings）、生产预渲染构建通过。双语桌面 / 移动端 Breadcrumb 与既有 ci-smoke 共 9 项浏览器测试通过。

## Phase 3：共享交互

### Dialog / Sheet

特殊效果、物品详情、更新日志使用标准 Dialog；主导航和 Endgame 手机菜单分别使用左侧、底部 Sheet。保留原内容与业务请求失效处理，焦点恢复通过组件生命周期衔接真实触发元素。删除全部原生 dialog 开关、手写 Tab trap、背景坐标判断、滚动锁及旧外壳样式，未保留平行实现。新增 bits-ui 及其日期 peer dependency，原依赖版本保持不变。

格式 / ESLint、完整类型检查（0 errors / 0 warnings）通过；相关既有单元测试 141 项，桌面 / 移动端交互测试 28 项通过（另有两项按视口跳过）。测试改用语义 heading，并等待水合、导航和库管理的滚动锁释放，不固定旧 DOM 容器。

### 设置 Popover

设置面板改用标准 Popover，复用已有 Bits UI；保留设置素材、原语言链接、query / hash 和整页重载行为。同语言点击不导航。删除全局 click / Esc 监听、手写定位及旧面板 CSS，改用既有 Button 和主题令牌。格式 / ESLint、完整类型检查通过；增加键盘打开、Esc 焦点恢复和外部点击关闭回归，最终生产预览中，双语历史往返、query / hash 保留、Popover 键盘及现有导航冒烟共 23 项检查通过。

### Sonner 与选项控件

根布局只挂载一个深色 Sonner，放在站点 Grid 外，避免空 live region 占据网格行。通知保留原标题、正文、触发点、4 秒时长和替换语义；等级、Profile、实体切换及卸载时 dismiss。删除 InfoToast 及手写 portal、动画、计时器；不引入 mode-watcher 或主题切换。

目录筛选复用 Toggle / Toggle Group，仍交由原筛选函数更新 URL；遗器显式单选，其他目录保持多选，“全部”操作保留清空及分页语义。敌人技能使用原生单选组，强化使用 Switch；radio / aria-checked 和方向键由标准组件提供。保留素材图标、元素色及原有文本。删除 FilterChip 和旧强化 / 技能选项样式，保留原有 Tabs、敌方单位 radio 和整卡 TraceToggle。

为现行组件样式补充 Bits UI 状态到 Tailwind 的映射（open / closed、checked / unchecked、horizontal / vertical），使弹层动效、Switch 位移和纵向技能列表正确生效。四级 Breadcrumb 为当前项保留最小宽度，320px 下仍能看到当前页面；回归只约束可见性，不固定视觉像素基线。

### 最终验收

完整类型检查为 0 errors / 0 warnings，生产预渲染构建、变更文件格式 / ESLint 及相关单元测试通过。生产浏览器验收分批通过：导航 / 语言 23 项、控制与通知 16 项、单选及窄屏 Breadcrumb 10 项、弹窗 28 项（另有 2 项按视口跳过）、本地 mock 玩家上下文返回 10 项。Sonner 移出 Grid 后，首页首屏及通知生命周期额外复查 9 项通过。已更新旧容器、Toast 与单选属性断言，未加入全页面像素基线。

1280px / 390px 截图及 320px 四级路径检查无横向溢出、无运行时异常；长弹层、技能纵向列表、Switch 状态位移及 reduced-motion 生效。截图和报告保留为忽略的本地验收产物，不入库。原有依赖版本未升级，仅新增标准组件所需依赖；初始化、数据处理、业务计算及素材管线均未改动。真实玩家远程 API 和远程部署未验证；本地 Analytics 脚本 404 为既有环境限制，不影响验收。

## Phase 4：全局布局、导航与搜索

### 可折叠导航

使用官方 Sidebar 源码[^sidebar]，桌面采用 icon 折叠模式，Sidebar 修整后的展开 / 折叠宽度为 19rem / 4rem。默认折叠，状态仅在根布局生命周期内保持，不写 cookie 或 localStorage，不注册默认全局快捷键。新增标准 Tooltip，复用已有 Sheet、Button、Bits UI 和游戏图标，无新增依赖或锁文件变更。

导航入口继续由同一份本地化数据提供；移动端由 Sidebar 内部单一 Sheet 管理遮罩、滚动锁和焦点。保留站点标识、全部入口、更新日志及版本信息；Sidebar 修整按授权删除短标语，折叠搜索入口展开后聚焦原搜索框。设置 Popover 保持原位置和语言路由行为。删除旧窄侧栏、独立抽屉及手写 Tooltip CSS；导航断点统一为 48rem，业务断点保留。短视口导航与页脚区域可滚动。

导航 / Breadcrumb 单元测试 28 项及完整类型检查通过（0 errors / 0 warnings），变更源码格式和 ESLint 通过。导航浏览器回归 6 项通过（4 项按视口跳过），覆盖双语状态保持 / 刷新重置、搜索聚焦及提交、移动端 Esc / 外部点击 / 焦点恢复 / 路由关闭和短视口。旧桌面遮罩及固定宽度断言已更新为 Sidebar 状态与行为断言。展开态与移动端禁用 Tooltip，避免隐藏提示拦截 Escape。

### 搜索控件

新增官方 Input 源码，SearchBar 使用同一组 Input / Button 与 Lucide 搜索图标，保留原 props、绑定、原生 GET 表单及页面 onSubmit 行为。导航采用紧凑图标按钮，首页与搜索页保留已有搜索文字；删除两套控件的自定义边框、渐变、焦点和响应式 CSS。搜索页面仅用工具类统一结果分组间距，不改业务卡片、分类、排序、分页、异步状态或搜索服务。

变更源码格式 / ESLint 和 Svelte 检查通过（0 errors / 0 warnings）；搜索及 FlexSearch 合约单元测试 18 项通过。搜索结果 / 素材 / URL 相关桌面和移动端浏览器测试 44 项通过，覆盖双语素材与回退、长结果 / 加载更多、异常 / 重试、请求竞态、query / hash 以及前进后退。

### 全局布局与偏移

根布局改为随 Sidebar 重排的 Flex 布局，内容、Breadcrumb 和 Footer 共用 90rem 最大宽度与 1.5rem / 1rem 桌面 / 移动边距。导航以 48rem 为断点；Sidebar 修整后移除独立移动站点栏，统一 Trigger / Breadcrumb 顶栏基础高 2.75rem，并计入顶部安全区；继续沿用累计 Sticky Offset 与锚点间距，保留详情 SectionNav、Endgame 导航以及 Footer 全部信息和链接。抽屉适配动态视口高度与安全区，根布局外仍只挂载一个 Toaster。

删除旧 Grid 定位、独立移动容器宽度、旧侧栏宽度变量以及废弃导航 / 搜索规则；仍被业务卡片和页面使用的样式保持。更新旧测试选择器，为容器对齐与 Endgame 锚点补充小型视口矩阵；导航稳定后再访问明确的 Breadcrumb 父链接，避免历史返回后的旧路由 DOM 竞态。折叠态操作标签隐藏，移动抽屉中的更新日志保留底层 Sheet，使关闭日志后可恢复原触发焦点。

### Phase 4 验收结果

2026-11-01 完成。变更文件 Prettier / ESLint、完整 `pnpm check`（0 errors / 0 warnings）和生产预渲染构建通过；日志焦点与折叠标签修正后再次完成 Svelte 检查与生产构建。相关单元测试共 46 项通过。生产导航 / 布局 / 语言回归分批通过 50 项；首页双语视口、共享 Hero、Endgame 移动菜单和训练 / 通知的额外 22 项回归通过，按视口跳过重复矩阵及不适用场景。前述搜索 / 素材 / URL 的 44 项浏览器测试在开发服务器通过。

320px、390px、767px、768px、1280px 和 1920px 的容器与锚点矩阵通过；生产截图检查涵盖折叠 / 展开导航、移动抽屉、双语搜索与 Endgame，未出现横向溢出或页面运行时错误。修正了折叠标签裁切和移动更新日志关闭后的焦点丢失，Footer 四个既有链接均保留。未引入视觉快照基线，截图 / 报告 / 下载源码仅作为忽略的本地验收产物。

依赖和锁文件保持不变，两个只读上游仓库状态保持不变。真实玩家远程 API、远程部署及非 Chromium 浏览器未验证；本地 Analytics 脚本 404 为既有环境限制。完成 Phase 4 后停止。

### Sidebar 修整

采用 Sidebar-07[^sidebar-07] 的内容区 Trigger 布局，桌面和移动端共用唯一的 Trigger / Breadcrumb 顶栏；保留原移动 Sheet，关闭后恢复外部 Trigger 焦点。顶部品牌区域固定 56px，仅保留 Logo 与单行本地化标题；搜索槽位固定 44px，菜单按钮高 44px、游戏图标 24px。展开 / 折叠宽度为 304px / 64px，移动 Sheet 宽度为 min(304px, 90vw)。删除旧移动站点栏、副标题、内部展开按钮和相应 CSS，不改变导航数据、路由或业务内容。

品牌标题收起时立即隐藏，展开时等待容器自身 width transitionend；宽度与占位使用同一过渡参数。布局后的动画状态检查处理无过渡和取消，reduced-motion 直接完成，不使用固定计时器。标题与搜索容器明确禁用显隐过渡，避免全局 reduced-motion 的极短过渡影响显隐。搜索聚焦仅在展开完成且输入框实际可见时执行，按渲染帧检查可见性，关闭 / 卸载时取消。

侧边与 Footer 分隔线显式使用 sidebar-border；导航选中项采用深蓝背景与柔和金色 1px 描边，非选中项无金色描边。清理 MenuButton 强制尺寸覆盖，保留键盘焦点反馈。版本区域改为 role=status 的普通节点，不产生无操作按钮或额外 Tab 停留点。展开态与移动端继续禁用导航 Tooltip，避免隐藏提示干扰 Esc。

搜索统一采用官方 InputGroup[^input-group] 的 Root / Input / Addon / Button，单一边框内嵌右侧搜索操作，复用原 Input / Button，无新增依赖或锁文件变更。保留隐藏 label、GET 表单、Enter 提交、页面 onSubmit、语言路径和 query / hash；首页与搜索页继续显示原有搜索按钮文字。

中英文打开 / 关闭的人工中间帧采样中，半程宽度为 184px，品牌高度为 56px，首个导航项纵向位移为 0px；320px 短视口 Sheet 宽度为 288px、无横向溢出。仅新增一项动画行为回归，覆盖逐帧位置、标题时机、快速反向切换及 reduced-motion 聚焦；更新既有 Trigger / 品牌选择器，未新增视觉快照基线。生产浏览器回归 29 项通过（7 项按视口跳过），覆盖导航、动画、Sticky 锚点、搜索按钮 / Enter 提交、query / hash / 前进后退、语言切换及 Sheet 焦点恢复。半程 Sidebar 与内容占位宽度同为 184px；生产截图未见异常亮边，页面无运行时错误。

变更文件 Prettier / ESLint 和生产预渲染构建通过。完整 pnpm check 中消息校验与 Svelte 检查通过（0 errors / 0 warnings）；随后脚本类型检查进程以 Windows 原生退出码 3221225477 结束，没有类型诊断。直接用 Node 执行 tsconfig.scripts.json 与 tsconfig.api.json 两项 TypeScript 检查均通过，未重复运行无关测试。两个只读上游仓库保持原状态。非 Chromium 浏览器、真实玩家远程 API 和远程部署未验证；本地 Analytics 脚本 404 为既有环境限制。

## Phase 5A：四类实体目录

### 共享控件与布局

采用均衡紧凑布局，OverviewHero 保留标题、说明、总数、装饰素材和 Endgame artwork slot；搜索使用现有 InputGroup，删除重复 Enter 处理。工具栏采用 Button 与 Bits UI Select，结果数量与操作分列，排序继续交由页面回调写入 URL。分页采用标准导航、列表和 Button variants 的链接组合，保留全部页码与现有 URL 构造函数，不引入第二份分页状态。Select 的接口和样式参考官方组件[^select]，分页按原生 URL 导航适配官方展示结构[^pagination]。

Grid 使用容器内自适应列，360px 起双列、640px 起最小 12rem，删除负边距及旧列宽规则。删除五个共享组件的旧 CSS；共享 props 和 variant 保持兼容。变更源码 ESLint 与 Svelte 检查通过（0 errors / 0 warnings）；已更新分页结构选择器，并增加双语排序键盘及历史回归，浏览器验证留待最终批次。

## 后续阶段边界

- Phase 2 已完成：全局路由 Breadcrumb 与 Sticky Offset；复用现有数据和 locale 工具。
- Phase 3 完成本阶段共享交互迁移；业务卡片、现有 Tabs、敌方单位 radio 与整卡行迹切换保留。
- Phase 4 完成全局导航、搜索和布局；停在 Phase 4，不进入 Phase 5。数据处理、游戏计算、素材解析、路由和国际化架构保持不变，无无关 Runes 迁移。

### 参考文献

[^manual]: shadcn-svelte. Manual Installation. [官方文档](https://shadcn-svelte.com/docs/installation/manual).

[^tailwind-v4]: shadcn-svelte. Tailwind v4. [官方文档](https://shadcn-svelte.com/docs/migration/tailwind-v4).

[^sidebar]: shadcn-svelte. Sidebar. [官方文档](https://www.shadcn-svelte.com/docs/components/sidebar).

[^input-group]: shadcn-svelte. Input Group. [官方文档](https://www.shadcn-svelte.com/docs/components/input-group).

[^sidebar-07]: shadcn-svelte. Sidebar-07. [官方示例](https://www.shadcn-svelte.com/blocks/sidebar).

[^select]: shadcn-svelte. Select. [官方文档](https://www.shadcn-svelte.com/docs/components/select).

[^pagination]: shadcn-svelte. Pagination. [官方文档](https://www.shadcn-svelte.com/docs/components/pagination).
