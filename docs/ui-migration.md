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

### 实体卡片

EntityOverviewCard 改用主题 Card 表面和工具类，删除原 199 行组件 CSS、固定行高、标题裁切及渐变／位移动效。角色与光锥为 4:5、敌人为 4:3 图片区，遗器为方形居中图标区；原素材、fit、position、scale、fallback 和整卡链接保留。新增 artworkAspect 可选 prop，默认 portrait，敌人显式使用 landscape；现有 props 与插槽兼容。Badge 仅用于非交互元信息，名称完整换行，信息区自然增长。首页、搜索和玩家继续复用同一实现，未改其业务数据或专用样式。

### 目录页面与验收

四类目录统一为 Hero、搜索、展开筛选、结果工具栏、网格和分页；空状态使用主题容器和 Button。FilterGroup 的标签与布局改用工具类，保留原 Toggle Group。页面业务脚本仅新增 Button import，搜索匹配、领域筛选、排序比较、分页大小、URL 读写及导航函数均未修改。重复参数、历史类别参数、query / hash、分页重置和清除筛选保留搜索的语义均保留。六个共享组件、四个目录和 FilterGroup 共删除 502 行旧 CSS 内容；未修改全局 CSS 或详情、Endgame、玩家专用样式。

2026-11-01 完成静态验证：变更文件 Prettier / ESLint、完整 pnpm check（0 errors / 0 warnings）、相关筛选单元测试 22 项、生产预渲染构建通过。仓库没有 .crossnote/scripts/check-pseudocode.cjs，文档未添加伪代码，使用 git diff --check 检查空白。依赖与锁文件保持不变。

生产浏览器回归共 85 项不同用例通过、1 项按视口跳过；另有 6 项强化键盘断言复查通过，全部复用同一生产构建。覆盖双语排序键盘 / 历史、目录筛选 / 分页 / 草稿提交、缺图、图标语义，以及首页、搜索加载更多、Endgame Hero 和本地 mock 玩家上下文链接。更新旧工具栏单按钮、空状态类名和分页直接子链接选择器；保留原业务断言，移除旧固定高度 / 遗器单列 / 标题裁切断言，不建立视觉快照基线。

中英文四类目录在 320px / 390px / 768px / 1280px 下及桌面 Sidebar 展开时共 40 组布局采样通过：横向溢出为 0，标题未裁切，卡片无嵌套链接或按钮，页面无运行时异常。人工检查移动角色 / 遗器、桌面光锥 / 敌人和 Endgame 插槽截图；验收图片及日志留在忽略目录 data/audit，不入库。

本地测试曾受沙箱端口、浏览器路径和临时目录权限限制，取得正常本机执行权限后验证通过。开发服务与构建并发导致的加载失败不计入验收；最终全部复用同一生产构建。临时预览端口同步更新测试的日志弹窗关闭状态后运行回归。两个只读上游工作区保持原状态；非 Chromium 浏览器、真实玩家远程 API 和远程部署未验证。本地 Analytics 脚本 404 为既有环境限制。

## Phase 5B：详情 Hero 与基础信息

### 最终设计与边界

按用户后续指正保留原先一体化 Hero：同一 Card 外壳内保留原 header、左侧立绘、渐变、偏左下方的文字与 metadata，右侧仍为原 aside，没有独立 Card、圆角或边框。恢复原角色 1180px、其他类型 820px 的堆叠断点，以及各类图片尺寸、比例、定位和展示空间；左侧将通用内边距从 clamp(1.5rem, 3vw, 2.5rem) 小幅收至 clamp(1.25rem, 2.5vw, 2rem)，并为长名称补充宽度约束和自动换行。DetailArtwork 和 RelicIcon 最终与 Phase 5A 基线一致。玩家上下文、强化开关、名称、副标题、说明和元信息全部保留。

属性区沿用主题表面、手机 1rem / 其他宽度 1.25rem 内边距，保持与左侧连续的表面和分界。光锥等级、晋阶与叠影仍处于同一区域；遗器效果保留全部件数条件和完整说明。页面业务脚本与 Phase 5A 基线逐字比较，仅新增展示组件 import，没有改动计算、数据处理、状态、回调或 keyed 生命周期。

### 共享展示与 CSS

新增实际使用的 Card Root 和 Bits UI Separator，不修改依赖及锁文件。StatList / StatRow 保留 dl / dt / dd、标签插槽、图标列、数值颜色和字段标记；属性行基础高度收至 2.5rem，长标签和数值自然增高，数值右对齐。装饰性 Separator 放在 dt 内，首行隐藏并限制在行边界内，替代原伪元素。列表间距缩至 1rem；PlayerStatsPanel 继续按容器宽度分栏，内部不套 Card。LevelSlider 和叠影内部交互未改动。

SectionHeading 保留 level、headingLevel、tone、id 和 meta slot，采用主题字号、工具类及窄屏换行，删除长装饰线。详情 Section 缩为桌面 2rem、手机 1.5rem，删除底边和敌人额外间距覆盖。SectionNav 的 DOM 顺序、ID、观察器、选中状态与 Sticky Offset 保持原样；共享标题使用方包括首页、搜索、玩家和 Endgame。

删除 detail-inspection.css 及入口导入，将等级控件无顶部分隔线规则合并至现有 stat-level-control 规则。保留用户要求的原 Hero 构图样式，清理其被标准组件替代的外壳与面板规则。变更涉及的 CSS 净减少 289 行；Phase 5A 卡片及目录布局、技能卡内容、Disclosure 状态逻辑均未修改。

### 验证结果

最终一体化版本的变更文件 Prettier / ESLint、完整 pnpm check 通过（Svelte 0 errors / 0 warnings），生产预渲染构建通过。相关属性与玩家合约单元测试共 58 项在共享组件迁移后通过；后续一体化调整未改动这些计算及合约。8 个中英文生成页面的 HTML 检查确认同一 Card 外壳包围原 header、属性区为 aside、内部无独立 Card，并保留各类 Hero 字段数量及唯一 h1。

生产浏览器回归分批 104 项通过：详情展示 / 属性 / 缺图 / SectionNav 58 项，角色等级与强化、光锥叠影、敌人切换、mock 玩家 loading / 成功 / 失败及上下文返回、养成状态、首页 / 搜索 / Endgame 共享标题 46 项。保留原业务断言，更新伪元素分隔线、旧 padding、光锥分隔节点、旧技能 aria-pressed 及属性区独立 Card 断言，不增加全页面视觉快照。

中间版本曾将左右拆开，已按用户指正撤回，其截图不作为最终交付证据。极端无空格长名称暴露原 Hero 的横向裁切，增加标题宽度约束与自动换行；修正后生产构建通过，8 项标题 / Hero 布局复查通过。最终中英文四类详情在 320px / 390px / 768px / 1280px、Sidebar 展开及极长名称 / 描述下共 48 组采样通过，无实际文字裁切、横向溢出或页面运行时异常。人工查看角色、光锥、遗器及敌人的代表截图，确认原叠图与一体化边界。

验证曾因自动审批服务额度暂时无法执行，提示的恢复时间过后服务恢复，随后完成上述浏览器回归。构建与预览串行执行，每次重新构建后重启预览，避免缓存旧产物清单。验收图片、临时配置及日志保留在忽略目录 data/audit，不入库。仓库没有 .crossnote/scripts/check-pseudocode.cjs，文档未添加伪代码，使用 git diff --check 检查空白。

另有遗器 Disclosure 的“窄屏关闭后切回宽屏故事仍隐藏”用例在桌面 / 手机项目各失败 1 项。Disclosure 和 RelicPieceCard 均与 Phase 5A 基线一致；未修改其状态逻辑或放宽断言，后续批次排除此已记录失败，未将其计入通过数，需单独确认该行为。真实玩家远程 API、非 Chromium 浏览器和远程部署未验证。

未推送或部署，停止在 Phase 5B，不进入 Phase 5C。

## Phase 5B 补充与 Phase 5C

### 遗器部件

部件卡改用 size=sm 的 Card / Header / Title / Content，图标为 64px，保留名称、部位、完整简介及缺图降级。Card 默认外观兼容现有 Hero。部件网格采用容器查询：36rem 起两列，四件套在 64rem 起四列，两件套最多两列，窄屏一列。

按明确授权移除部件故事及其 Disclosure；全仓引用检查后删除唯一使用方已消失的 Disclosure.svelte。删除故事可见性、展开与宽屏恢复 UI 测试，保留上游故事数据解析和本地化合约，并断言包含故事的数据也不渲染故事。此前记录的遗器故事宽屏恢复问题因该 UI 被移除而结束，不修改上游数据。

共享组件与遗器变更的格式 / ESLint、Svelte 检查通过（0 errors / 0 warnings），浏览器布局在最终构建后验证。

### 技能卡

技能卡使用单层 Card / Header / Content 和 Separator，保留语义类别、progression / variant 结构及全部信息、预览和特殊效果回调。保留普通网格及卡片 h-full：1080px 以上两列同行等高，1080px 及以下单列。效果标签复用 Badge，新增 variants 保留原默认 secondary 外观，不改变目录卡片。只删除已替换的技能外壳、标题及图标 CSS；info-card 仍由培养结果使用，保留其规则。

变更格式 / ESLint、Svelte 检查（0 errors / 0 warnings）及相关玩家组件、培养展示与行迹分组单元测试 28 项通过。

### 行迹与星魂

行迹和星魂替换为单层 Card，标签采用 Badge；保留原能力组、独立节点、三列 / 两列及窄屏单列布局，保留所有文本、图标和玩家状态。TraceToggle 改用已安装的标准 Toggle，继续覆盖整卡并使用原名称、pressed 和回调；额外效果说明保持原 z-index，独立于整卡操作。删除旧卡片背景、边框和标题外壳规则，保留游戏状态颜色和分组布局，不新增 Tabs 或 Accordion。

### 等级控件

引入复用 Bits UI 的单滑块 Slider 和 Label，LevelSlider 保留标量 value、原 props / ID / 标签关联、范围、步长、等级输出及即时回调。内部索引与实际等级继续分离，ARIA 宣告实际等级；外部同步和初始化不触发业务回调，同值通知去重。光锥叠影保留 selectedIndex、等级映射、固定等级分支及原 keyed 生命周期；预览和培养状态来源未合并，玩家实际等级继续禁用。

标准 Toggle 使用受控 getter / setter，避免培养规则拒绝激活后内部 pressed 状态残留。原业务校验、提示、DAG 联动、整卡点击和额外效果操作保留；焦点采用标准 ring。未改动一体化 Hero、目录卡片、数据处理、计算、国际化及路由。

删除原生 range、进度计算、浏览器轨道 / 滑块 CSS，以及无使用方的技能标题、卡片、标签与叠影控件规则；分组分隔改用 Separator。生产组件和样式共净减少 287 行 CSS，保留培养结果仍使用的 info-card，以及游戏素材、状态颜色和必要分组布局。新增测试夹具 7 行 CSS 单独计入后，整体净减少 280 行；未更改依赖或锁文件。

### 本阶段验收

变更文件 Prettier / ESLint、完整 pnpm check 通过（Svelte 0 errors / 0 warnings）；相关 SSR / 业务单元测试 53 项分批通过。Slider 三项浏览器组件回归通过，覆盖非默认步长、实际等级与索引 ARIA、外部同步、禁用状态、键盘、鼠标和触摸拖动及单次回调。旧原生 range / fill、元素包装、outline 和长分隔线断言改为角色、ARIA、焦点 ring 与实际业务结果；保留数值和状态断言。

最终生产预渲染构建通过，新的生产预览上两批回归分别通过 71 项与 62 项，合计 129 项不同用例及 4 项重复复查，另 1 项按视口跳过。覆盖技能等级预览、倍率及特殊资源、特殊效果弹层与焦点恢复、行迹整卡和额外效果、培养 DAG / 等级 / 晋阶边界、叠影独立状态、敌人共享等级与单位切换，以及本地 mock 玩家 loading / 成功 / 失败、实际技能 / 行迹 / 星魂状态、缓存与上下文返回。遗器容器额外检查 575 / 576px 和 1023 / 1024px；此前发现的 Toggle 拒绝激活状态问题已修复并由双语桌面 / 手机回归通过确认。

中英文在 320 / 390 / 768 / 1080 / 1081 / 1280 / 1600px 及桌面 Sidebar 展开时采样，技能保持指定列数且逐行等高；遗器四件套为 1 / 2 / 4 列，两件套最多两列。36rem / 64rem 两侧的容器查询由现有遗器浏览器测试覆盖。人工检查双语技能、行迹、星魂和遗器代表截图，简介与说明完整换行，无横向溢出；采样页面无运行时异常，不建立视觉快照基线。

构建与预览串行执行，最终构建后启动新的预览进程。验收日志、临时配置和截图保留在忽略目录 data/audit，不入库。仓库没有 .crossnote/scripts/check-pseudocode.cjs，文档未新增伪代码，使用 Prettier 与 git diff --check 校验 Markdown。真实玩家远程 API、非 Chromium 浏览器及远程部署未验证；玩家回归使用本地 mock，本地 Analytics 脚本 404 为既有环境限制。

## Phase 6A：Endgame 总览、赛期目录与模式导航

### 总览

总览卡使用外层单一链接与单层紧凑 Card，Header / Content 和 Separator 组织原有信息。保留四模式强调色、图标与水印；AA 继续独立整行并保留较大的水印。常规模式以内容容器为准，48rem 起三列，否则单列，间距为 1rem，适应 Sidebar 展开。删除旧卡片外壳、渐变 Hover、固定最小高度、大段留白与名称截断，名称完整换行。推荐赛期、日期、数量、空赛期降级与链接计算保持原样。

总览变更的 Prettier / ESLint 及相关 SSR 单元测试 34 项通过，包含四模式链接、长名称、无图标和空赛期。

### 赛期目录

赛期卡采用单一链接包裹紧凑 Card / Header / Title / Content，分隔使用 Separator。当前赛期保留模式色边框、大标题与水印，即将继续独立宽卡；未知与历史使用最小 14rem 的自适应网格。删除旧固定高度、重复渐变外壳和视口列数 CSS，组间距收至 2rem，名称完整换行。分类、顺序、条件渲染、日期、关卡数量、ARIA 名称、链接及客户端时钟逻辑保持原样。旧测试的精确 Padding、最小高度和严格三级高度断言改为内容、单层 Card、分隔线、焦点与溢出检查。

赛期卡、时间状态、Clock 与导航单元回归共 23 项通过；赛期源码及测试 Prettier / ESLint 通过。

### 模式导航与 CSS

模式导航的原生链接使用现有 Button ghost variant，保留 aria-current、四模式图标与强调色。继续使用原有两层容器，主题 Card 表面替代硬编码背景，删除重复阴影与全部组件 CSS。Sticky top、56px 高度契约、横向滚动和挂载时当前模式定位保持原样；详情页共享该导航，局部导航与锚点实现未修改。无新增 Tabs、业务功能、依赖或锁文件变更。

五个展示文件的组件 CSS 从 508 行收至 6 行，净删除 502 行，剩余仅为两种水印的 mask-image。普通布局、颜色、间距、Hover 与焦点使用主题 Token 和 Tailwind。两个页面的 script 与迁移前逐字一致，数据、赛期推荐、分类、时钟、路由和国际化实现均未修改。

### 验收结果

2026-11-01 完成变更文件 Prettier / ESLint、完整 pnpm check（Svelte 0 errors / 0 warnings）和生产预渲染构建。相关单元测试两批共 52 项不同用例通过，覆盖展示、空赛期、无图标、长名称、赛期时间状态、Clock 与导航；其中 5 项重复执行。

新生产预览的浏览器回归 32 项不同用例通过，2 项按视口跳过；另 4 项强化 Sidebar 展开检查通过。中英文覆盖 320 / 390 / 768 / 1280 / 1600px、四模式、四类赛期、正确链接、长名称、整卡焦点、当前导航可见性、历史前进后退、同页时间边界更新及 Sticky 锚点避让。模式目录每次整页加载后显式展开 Sidebar，并等待实际宽度稳定后在同一帧测量导航边界，避免动画中分次采样造成竞态。人工查看双语桌面 / 手机及 Sidebar 展开代表截图，名称完整换行，无横向溢出或页面运行时异常；不建立视觉快照基线。

首次沙箱单元测试受临时目录重命名权限限制，获批本机执行后通过。浏览器首轮复用了旧预览，入口 JS 返回 404；停止该轮，改用独立端口新预览后完成上述验收，旧轮结果不计入通过数。Sidebar 补充脚本中的动画采样及 rem 单位换算问题均已修正。日志、临时配置和截图留在忽略目录 data/audit，不入库。本地 Analytics 脚本 404 为既有环境限制；非 Chromium 浏览器和远程部署未验证。

依赖和锁文件未改动，两个只读上游保持初始干净状态。仓库缺少 .crossnote/scripts/check-pseudocode.cjs，文档未新增伪代码，按手工维护约定使用 git diff --check 校验空白。停止在 Phase 6A，不推送或部署。

## Phase 6B：Endgame 赛期详情

### 共享机制

MechanicSectionCard 与 BuffOptionTile 使用单层紧凑 Card / Header / Content，保留标题层级、完整 GameText、buff 金色与 debuff 红色、分段及补充说明。机制保留 600 / 840px 容器断点及第三项跨行；选项保留 endgame-main 的 620 / 860px 断点。MechanicEntry 继续作为文本条目保留插槽，避免特性列表重复套 Card。删除重复外壳和普通布局 CSS，复杂分段边界仍使用主题分隔规则，不新增折叠或选择交互。

### 敌人、波次与关卡

敌人使用原生链接或非交互 article 包裹单层 Card，等级、数量与贪饕层数使用 Badge。保留 260px 最大宽度、standard / compact 的 190 / 170px 立绘区、素材定位与缺图降级、数量 ARIA、全部属性与多阶段倍率。弱点继续使用既有可访问图标；名称与数值完整换行，非链接卡片不增加操作。

EnemyGrid、WaveLayout、NodeSection 与 HP 的普通布局迁移到工具类，保留波次数量决定的组宽、容器断点及并排波次分隔；presentation.ts 未修改，不为关卡、波次增加额外 Card。删除 app.css 中被替代的敌人卡外壳、标签、属性与窄屏重复规则。展示与导航单元回归 34 项通过，新增空机制 / 选项覆盖；长名称、长数值与空波次用例已纳入全阶段验收。

### 局部导航与四模式整合

局部导航继续使用桌面 136px 侧栏和 1080px 及以下的既有 Sheet，链接复用 Button variants，移动触发器使用标准 Button。保留当前项、query href、afterNavigate 关闭、打开时聚焦当前项及关闭后焦点恢复，分隔线使用 Separator。共享赛期 Hero 仅迁移 Badge、Separator 和工具类，日期与客户端状态逻辑保持原样。

四模式普通容器与间距迁移到工具类，保留 MoC / AA 并排波次、PF compact 堆叠波次、AS 单卡宽首领列及 700px 对照布局、额外效果与终焉公理。AS 特性列表使用 Separator，保留文本分组与额外效果的原生 details 行为。清除 app.css 的 Endgame 专属旧卡片、导航及相关响应式覆盖，保留共享 Sticky Tokens。Phase 6A 总览、目录与模式导航视觉未修改。类型检查暴露前阶段 Playwright test.use 的 reducedMotion 类型不兼容，改为 page.emulateMedia；不改变页面实现。

### 本阶段验收

2026-11-01 完成变更文件 Prettier / ESLint、完整 pnpm check（Svelte 0 errors / 0 warnings）与相关单元回归 46 项。覆盖机制与选项 0 / 1 / 2 / 3 项、debuff 语义、完整文本、无链接与缺图降级、长名称 / 数值、空波次、阶段来源、贪饕、导航与时钟。Button 引用绑定修正后再次通过 Svelte 检查及生产预渲染构建。

新生产预览上，两批浏览器回归分别通过 90 项与 6 项，合计 94 项不同用例及 2 项强化复查，另 4 项按视口跳过。覆盖中英文、四模式及 AA 骑士 / 普通 / 绝境、机制条件与补充说明、额外效果、战斗字段和倍率、波次顺序与数量、原生链接 / 键盘 / 新标签页、缺图、贪饕、Sheet 开关 / Esc / 遮罩 / 焦点恢复、query 切换、前进后退与同页时间状态更新。Sticky 锚点与容器对齐沿用既有双语矩阵，未放宽业务断言。

双语详情矩阵覆盖 320 / 390 / 768 / 1280 / 1600px，桌面每次整页加载后展开 Sidebar 并等待宽度稳定。机制、选项与 AS 对照布局另覆盖 599 / 600、619 / 620、839 / 840、859 / 860、699 / 700px 容器边界。人工查看 MoC、PF、AS、AA 的双语桌面 / 手机截图，保留构图与阅读分组，名称与数值完整换行，无横向溢出或页面运行时异常；不建立视觉快照基线。

迁移初轮浏览器检查发现移动触发器 ref 未初始化引发 props_invalid_value，已显式初始化为 null，并由最终水合及 Sheet 回归验证。断点测试等待容器重排，贪饕红色检查先转换为像素通道，兼容主题 Token 的 OKLCH 表达；原颜色与布局语义要求保留。失败和中断轮次不计入最终通过数。构建与预览串行执行，最终构建后启动独立端口的新预览；日志、临时配置和截图保留在忽略目录 data/audit。本地 Analytics 脚本 404 为既有环境限制；非 Chromium 浏览器及远程部署未验证。

组件 style 块与 app.css 共净减少 728 行 CSS，其中 app.css 删除 416 行旧 Endgame 规则；仅保留机制响应式分段、波次复杂宽度 / 分隔、AS 对照网格及游戏颜色等必要规则，立绘背景继续使用原渐变。七个模式组件与详情页业务 script 与迁移前逐字一致，presentation.ts、数据模型 / 计算 / 时钟 / 路由 / 国际化及 Phase 6A 视觉实现均未改动。依赖与锁文件未变，两个只读上游保持初始干净状态。

仓库缺少 .crossnote/scripts/check-pseudocode.cjs；文档未增加伪代码，按仓库手工维护约定使用 git diff --check 校验空白。完成 Phase 6B 后停止，不进入 Phase 6C，不推送或部署。

## Phase 6C：玩家信息页面

### UID 查询与状态

UID 表单使用 Label 与一体式 InputGroup / Button，手机继续使用同一结构；保留原 ID、text / numeric 输入提示、绑定、onSubmit / onInput、Enter、错误关联与 aria-busy。加载期间只禁用查询按钮，输入仍可编辑；不新增长度限制、自动查询或业务 guard。idle / loading 使用最小标准 Empty，loading 使用装饰性 Spinner，请求错误使用 Alert；显式覆盖组件默认 role，保留表单 alert、polite / status 与 assertive 的原有通知职责。删除旧输入、焦点、按钮和状态容器 CSS，来源说明保留原文及 Enka.Network 链接。

首批格式 / ESLint、完整 pnpm check（Svelte 0 errors / 0 warnings）通过；组件与客户端相关单元测试共 12 项不同用例通过，包含默认 role 可覆盖及装饰性 Spinner 不重复宣告。

### 玩家名片

PlayerHero 使用单层紧凑 Card，继续用 AssetImage 保留游戏头像、错误及空图降级和昵称对应的可访问名称。手机头像 64px，宽屏 80px；以名片容器 48rem 为断点，在身份 / 统计并排与统计下置间切换。保留 dl / dt / dd、全部元信息、签名换行、等宽 UID 和 tabular-nums 统计。displayCount 未修改，null 继续为 -、零继续为 0。删除旧渐变外壳、固定尺寸及名片 CSS，测试改为单层 Card、空值和数值对齐语义，不再固定字号及旧对齐方式。名片格式 / ESLint 和 5 项组件单元测试通过，包含长昵称与多行签名。

### 角色列表与 CSS

助战和展示角色分别使用原有 SectionHeading 与同一 OverviewGrid，保留原循环、key、分组、顺序和 playerCharacterHref 的 UID / build / 来源参数。未知角色使用单层 Card 与 ImageFallback，图片区与角色目录保持 4:5；原始 ID 与缺失提示完整换行，不创建链接或补造角色信息。两组空状态复用 Empty，仅显示原提示。删除旧助战列数规则和玩家页剩余 CSS，不修改共享目录默认样式及玩家装备 / 技能 / 行迹 / 星魂实现。

### 本阶段验收

2026-11-01 完成变更文件 Prettier / ESLint、完整 pnpm check（Svelte 0 errors / 0 warnings）、相关玩家组件 / 客户端 / resolver / 角色组件单元测试 76 项，以及生产预渲染构建。旧测试中固定字号、对齐方式与外壳选择器改为信息、null 与零、单层 Card、可访问错误关联和 tabular-nums 断言；保留原业务数值与跳转断言。

新生产预览的针对性浏览器回归 28 项通过，2 项按视口跳过。全部使用现有合成 mock，不调用真实第三方 API。覆盖中英文、无 UID、无效输入 / URL、Enter 与空白处理、loading / success、404、限流含 retry-after 分支、超时、上游不可用和无效响应。验证加载时仅按钮禁用、输入仍可编辑且不自动查询、错误关联与通知区域、原始错误正文不泄漏、失败后同 UID 再提交、成功后同 UID 缓存复用、SPA 历史前进后退，以及延迟旧响应不能覆盖恢复后的当前玩家。

双语布局覆盖 320 / 390 / 768 / 1280 / 1600px 与桌面 Sidebar 展开，另检查名片容器 767 / 768px 两侧。覆盖无头像、头像 / 角色图片失败、长昵称、多行及无空格长签名、统计 null 与零、长未知 ID、两组分类 / 数量 / 网格与空状态。人工查看中英文桌面 / 手机代表截图，无横向溢出或页面运行时异常；不建立视觉快照基线。现有 mock 玩家上下文回归验证装备、实际技能等级、行迹 / 星魂状态、UID / build / from 参数、语言切换与返回玩家页，未修改这些实现。

四个迁移文件删除全部 320 行旧 CSS，改用标准组件、主题 Tokens、容器查询与工具类；未修改共享 Card / CharacterOverviewCard / OverviewGrid 默认样式或其他已完成页面。玩家页 script 除新增三个展示 import 外与迁移前逐字一致，四个文件的原消息调用全部保留；请求管理、解析、匹配、缓存、装备映射、URL 和国际化均未改动。依赖和锁文件未变化，两个只读上游保持初始干净状态。

构建后在独立端口启动新的生产预览，截图、日志及临时配置保留在忽略目录 data/audit。仓库缺少 .crossnote/scripts/check-pseudocode.cjs，文档未新增伪代码，按手工维护约定使用 git diff --check 校验空白。非 Chromium 浏览器和真实第三方 API 未验证；本地 Analytics 脚本 404 为既有环境限制。无未解决的本阶段回归；停止在 Phase 6C，不进入 Phase 7，不推送或部署。

## 后续阶段边界

- Phase 2 已完成：全局路由 Breadcrumb 与 Sticky Offset；复用现有数据和 locale 工具。
- Phase 3 完成共享交互迁移；Phase 5C 将整卡行迹切换接入标准 Toggle，现有 Tabs 与敌方单位 radio 保留。
- Phase 4 完成全局导航、搜索和布局；Phase 5A 完成四类实体目录与共享卡片，Phase 5B 保留一体化 Hero，统一属性与 Section 展示；Phase 5C 完成遗器部件、技能、行迹、星魂及等级控件标准化。不进入 Endgame 或玩家信息的全面改造，不推送或部署。数据处理、游戏计算、素材解析、路由和国际化架构保持不变，无无关 Runes 迁移。

- Phase 6A 完成 Endgame 总览、赛期目录和模式导航迁移；停止在此阶段，机制卡、波次、敌人、局部导航与玩家信息留待后续授权。

- Phase 6B 完成四模式赛期详情的机制、敌人、波次、局部导航与 Hero 标准化；保留模式差异与数据行为，后续阶段另行授权。

- Phase 6C 完成玩家 UID 查询、状态、名片、角色列表及未知角色降级标准化；保留请求与玩家上下文行为，停止在本阶段。

### 参考文献

[^manual]: shadcn-svelte. Manual Installation. [官方文档](https://shadcn-svelte.com/docs/installation/manual).

[^tailwind-v4]: shadcn-svelte. Tailwind v4. [官方文档](https://shadcn-svelte.com/docs/migration/tailwind-v4).

[^sidebar]: shadcn-svelte. Sidebar. [官方文档](https://www.shadcn-svelte.com/docs/components/sidebar).

[^input-group]: shadcn-svelte. Input Group. [官方文档](https://www.shadcn-svelte.com/docs/components/input-group).

[^sidebar-07]: shadcn-svelte. Sidebar-07. [官方示例](https://www.shadcn-svelte.com/blocks/sidebar).

[^select]: shadcn-svelte. Select. [官方文档](https://www.shadcn-svelte.com/docs/components/select).

[^pagination]: shadcn-svelte. Pagination. [官方文档](https://www.shadcn-svelte.com/docs/components/pagination).
