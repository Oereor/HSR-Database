# 全站图片 fallback 统一化审计

日期：2026-09-26。范围：网站仓库 `develop` 分支；上游数据和素材仓库只读。

## Audit Findings

审计覆盖 Svelte 图片节点、条件渲染、URL 空值、错误事件、名称首字、CSS 背景与 mask，以及对应消息和测试。此前没有通用图片组件，多个业务展示组件重复维护失败状态。

- 概览卡片、紧凑卡片、遗器图标使用实体名称首字；Endgame 使用本地化的“敌”或“E”。
- 玩家头像、未知角色、语义图标和设置按钮分别手写问号；正文图片 token 使用 `✦`；星魂缺图时用阶数替代图片。
- 详情立绘、关联角色和部分属性图标失败后消失；其他图片仅检查路径存在，未处理请求或解码失败。
- Endgame 的永久失败布尔状态无法随图片来源改变恢复；其他组件的失败 URL 记忆也会妨碍切回旧地址后的重试。

分类与迁移：

| 图片语义 | 最终行为 | 主要覆盖范围 |
| --- | --- | --- |
| 实体识别和内容图片 | 缺失时显示共享 `?` | 角色、光锥、遗器套装和部件、敌人、Endgame、搜索结果、首页推荐、玩家头像和角色、装备推荐、关联角色 |
| 能力和功能识别图标 | 缺失时显示共享 `?` | 技能、额外能力、星魂、正文图片 token、纯图标命途／属性、导航、品牌入口、设置、更新日志 |
| 带完整可见文字的辅助图标 | 缺失时省略图片、保留文字 | 属性面板、遗器词条、筛选项、带标签的命途／属性 |
| 装饰图片 | 静默缺失 | 首页拼贴、概览 Hero、Endgame 模式水印和 CSS mask／背景 |

`alt=""` 不作为判定装饰图的依据：有相邻名称的实体图片仍保留内容图片槽位；可访问名称由已有名称或外层控件提供。

## Implementation

- `src/lib/components/shared/ImageFallback.svelte` 是可见 `?`、基础居中、字体和低强调颜色的唯一来源。仅接收布局 class 和可访问名称。
- `src/lib/components/shared/AssetImage.svelte` 直接输出图片、共享占位或空内容，不增加默认 wrapper。接收可空 `src`、`alt`、`decorative`、`fallbackClass`、原生图片属性，并通过 `missing` 绑定向既有容器反馈状态。
- 缺失、空字符串和纯空白路径不创建 `<img>`。有效 URL 原样使用，不新增备用 URL 或修改资源解析规则。
- 每次来源变化创建新的加载尝试；按来源建立 keyed 节点，处理请求／解码错误，并在挂载时检查已经失败的图片。旧节点监听器会销毁，迟到的错误不会污染新尝试；失败地址经过其他来源后可再次加载。
- 有意义的 `alt` 同时作为占位的可访问名称；空 alt／已有外层名称的占位不重复朗读问号。装饰图保持空 alt。
- 原有卡片、stage、响应式尺寸、圆角、裁切和图片定位保留。Svelte 局部样式通过既有父容器限定的 `:global(...)` 选择器作用于子组件输出。图片专用缩放和变换不应用到占位。

## Stale 清理

- 删除重复的失败状态、错误处理器、首字提取、图片专用 `fallbackLabel`／`fallbackMark` 参数及旧占位 DOM。
- 删除旧星魂数字占位和 CSS；阶数在图片成功和失败时均作为独立标签显示。
- 删除 11 个无引用的中英文图片占位消息键及相应消息契约条目；导航数据不再携带 `fallback` 字段。
- 保留未知装备文本、数值缺失、隐私数据、加载状态和错误提示；遗器卡片文本状态变量改名为 `unresolvedLabel`，避免和图片接口混淆。
- 测试改为验证共享 `data-image-fallback`、结构与业务信息；删除旧数字占位及不存在的 placeholder 选择器断言。
- 页面回归发现并修复既有 stale 测试：目录搜索从旧侧栏输入框迁移至现有 `OverviewSearch`，遗器概览恢复分页断言，页脚匹配当前 Enka 数据提供方。搜索图片测试等待 hydration 完成后操作 DOM，消除旧节点脱离的竞态。
- 移动端隐藏的懒加载装饰图可能根本不会发起请求；测试验证可见装饰图失败后消失，不要求未请求的隐藏节点被移除。

## Tests / Validation

| 检查 | 结果 |
| --- | --- |
| 修改文件 `pnpm exec prettier --write …` | 通过；无需全仓格式化 |
| `pnpm data:sync` | 通过；97 角色、169 光锥、60 遗器套装、21 属性、628 敌人 |
| `pnpm assets:ensure` | 通过；现有素材缓存有效 |
| `pnpm data:validate` | 完整语义验证通过 |
| `pnpm messages:check`（由 `pnpm check` 调用） | 400 个消息键、两个 locale 验证通过 |
| `pnpm check` | 通过；Svelte 0 错误、0 警告，脚本和 API 类型检查通过 |
| `pnpm lint` | Prettier 和 ESLint 通过 |
| `pnpm test` | 64 个文件、673 项测试通过 |
| `pnpm test:components --reporter=list` | 4 项浏览器组件测试通过 |
| `pnpm build` | 生产构建通过，静态站点输出至 `build/` |
| 图片相关 E2E | 分批完成；95 个不同项目／用例组合最终通过，2 个沿用原配置跳过 |
| 最终差异与上游状态检查 | `git diff --check` 通过；两个上游仓库仍干净 |

单元测试新增正常资源、所有空值、无 wrapper、可访问名称、装饰省略、locale 一致和关键业务槽位验证。浏览器组件测试覆盖真实解码失败、换源恢复、失败 URL 再次尝试、迟到事件隔离、hydration 前失败；测试使用独立 Vite fixture，不增加生产路由或运行时依赖。

页面验证复用生产构建，设置 `PLAYWRIGHT_REUSE_BUILD=1`，通过 `pnpm exec playwright test` 执行：

- 桌面／移动端：`catalogs`、`enemy-overview`、`relic-detail`、`search-artwork`、`equipment-recommendation`、`player`、`homepage` 和新增 `image-fallback` specs。
- 定向复跑修正的 stale 用例，不重新运行已通过且未改变的检查。
- 额外定向执行 `endgame` 的立绘成功／失败场景、`character-detail` 图标布局、缺失能力图标及 `ci-smoke` 中可访问图标 fallback。

首次页面测试暴露的旧选择器、分页／页脚断言和 hydration 竞态已修复并定向复跑通过。截图保存在忽略的 `test-results/` 下；复核桌面和移动端的正常布局断言、缺图容器尺寸、占位居中、无图片 transform、内容保留和装饰省略。

## 主要修改文件

| 文件／组件组 | 用途 |
| --- | --- |
| `shared/AssetImage.svelte`、`shared/ImageFallback.svelte` | 共享状态、图片渲染与视觉占位 |
| `EntityOverviewCard`、`CompactEntityCard`、`DetailArtwork`、`RelicIcon` | 保留既有布局并委托图片行为 |
| `SemanticIconLabel`、技能／行迹／星魂、正文 token、关联角色 | 区分内容与辅助图标，保留业务信息 |
| 玩家、Endgame、导航、首页和概览 Hero 组件 | 迁移原有图片和占位处理 |
| `src/styles/app.css` 和相关组件样式 | 子组件样式适配及旧占位 CSS 清理 |
| `src/lib/navigation.ts`、`messages/` | 删除无用占位字段与消息 |
| `tests/unit/image-fallback.test.ts`、`tests/components/`、`tests/fixtures/image-fallback/` | 新共享行为及真实浏览器状态测试 |
| `tests/e2e/image-fallback.spec.ts` 及相关既有 specs | 页面、响应式、可访问性回归与 stale 测试修正 |
| `playwright.components.config.ts`、`package.json` | 提供独立 `test:components` 命令 |

## Remaining Issues

本次审计范围内未发现剩余旧式内容图片 placeholder。Svelte 业务代码中原生 `<img>` 仅保留于 `AssetImage`，可见问号只由 `ImageFallback` 输出。

数据验证仍报告上游既有的 544 个缺失中文 TextHash，以及已分类的文本 fallback 和 13 个弱点／抗性冲突；这些数据问题未在本次视觉改造中修改。本地预览的 Vercel Analytics 脚本返回 404，未影响图片与交互验证。

沙箱权限限制下的首次工具运行无法读取 Vite 配置，改用正常本地权限后验证通过。当前 Playwright 对应的 Chromium 原先未安装，已通过确认可用的本地代理补齐。`agent-browser` CLI 不可用，使用项目现有 Playwright 完成浏览器测试和截图检查。未进行远程部署。
