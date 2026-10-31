# UI 迁移计划

## Phase 0：审计与基线

基线为 `develop` 的 `0fd5921`，重构分支为 `refactor/shadcn-foundation`。环境：Node.js 24.21.0、pnpm 11.9.0、Svelte 5.57.0、Tailwind CSS 4.3.3。`pnpm check`、`pnpm build` 已通过；首次类型检查遇到旧素材清单缺少 `characters.icons`，由现有构建流程刷新生成缓存后消失，无源码修复。网站与两个只读上游仓库均无工作区变更。

全局入口是 `src/styles/app.css`，由根 layout 导入，另有 detail-hero / detail-inspection 展示样式及组件内 CSS。Tailwind 已通过 Vite 插件接入；站点默认深蓝黑背景、金色强调，沿用中英文字体栈、语义字号及 `--space-*` 间距。业务组件、Paraglide 消息和素材加载各有独立边界。

| 分类 | 后续处理 |
| --- | --- |
| Dialog | 替换 ChangelogModal、SpecialEffectDialog、ItemDetailModal 的交互外壳，保留数据与业务编排 |
| Popover / Toast | 迁移 SettingsPopover、InfoToast，保留状态来源及消息调用 |
| 筛选 / 基础交互 | 逐步迁移 FilterGroup / FilterChip、Button、LevelSlider、Tabs、Disclosure，保留筛选和计算语义 |
| 业务展示 | 保留角色、光锥、遗器、敌人、养成、玩家及 Endgame 组件，通过组合基础组件逐步迁移 |

### CSS 兼容风险

- 旧 `--muted` 是正文色 `--text-body`，shadcn 的同名变量是背景色；必须迁移所有旧引用，包括作为背景使用的位置。
- 旧 `--radius-lg` 为 22px，与 Tailwind / shadcn 的圆角尺度冲突；应改为业务面板变量并保持值不变。`--border` 语义一致，可复用现值。
- 未分层的 `a`、`button`、`p` 等元素规则可能覆盖工具类；接入时处理基础规则层级，保留业务 class 的既有覆盖顺序。
- `.button`、局部 `.button-primary`、筛选 chip、标签及卡片的边框、圆角、焦点样式分散；`.enemy-summon-list` 等存在后置覆盖。先标记，迁移对应使用方后再删除，不把有意覆盖当作废弃代码。

## Phase 1：基础接入

采用官方手动安装流程[^manual]，使用 Svelte 5 / Tailwind 4 的 new-york 基础组件[^tailwind-v4]。手动合并主题，禁止在原 CSS 上运行初始化覆盖。默认保持深色，建立可覆盖的语义 token，预留浅色扩展而不增加主题切换。仅在错误页返回链接验证标准 Button，不创建演示页。

验收：变更文件格式与 lint、完整类型检查和生产构建；复用共享 UI 单元测试及 ci-smoke，补充少量双语错误页链接和键盘回归；检查桌面与移动端代表页面的颜色、圆角、布局及溢出。联网使用已核实的项目代理，不升级无关依赖。

## 后续阶段边界

- Phase 2：使用 shadcn Breadcrumb 实现全局 Sticky 导航，按路由层级生成而非浏览历史，支持中英文、动态实体名及 Endgame 多级路由；统一 Sticky Offset，协调 SectionNav / EndgameLocalNav。
- Phase 3：优先迁移 Dialog、Popover、Toast 和筛选控件，再处理其他基础 UI 与业务页面视觉。
- Phase 1 完成即停止；保留数据处理、游戏计算、素材解析、路由和国际化架构，不进行无关 Runes 迁移。

### 参考文献

[^manual]: shadcn-svelte. Manual Installation. [官方文档](https://shadcn-svelte.com/docs/installation/manual).
[^tailwind-v4]: shadcn-svelte. Tailwind v4. [官方文档](https://shadcn-svelte.com/docs/migration/tailwind-v4).
