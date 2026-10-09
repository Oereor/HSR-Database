# 养成面板最终 UI 优化：Toast 与分隔线

日期：2026-10-09；网站仓库 `HSR-Database`，分支 `develop`。

## 本轮增量

开始时已有上一轮 16 个 tracked 文件的未提交修改及技能目标分离报告。本轮保留这些内容，只增加行迹失败 Toast 和局部分隔线清理。Preview/Training 分离、永久向下修正、技能图标、行迹分类及 EXP 展示删除属于上一轮；本轮没有再修改 Cost Domain、DAG、材料 Cell、原技能组、Section 顺序或 Item 功能。

本轮涉及：

- 新增 `src/lib/components/shared/InfoToast.svelte`。
- `DetailPage.svelte`：失败通知接线及旧 Banner 删除。
- `TrainingExpenseGroup.svelte`、`TrainingTargetSummary.svelte`：局部 CSS 清理。
- `messages/en.json`、`messages/zh-CN.json`：新增通知标题。
- `tests/e2e/training-detail.spec.ts`、`tests/unit/training-presentation.test.ts`：定向验证更新。
- 本报告。

## Toast 挂载与生命周期

`InfoToast` 接收 `InfoToastNotice | undefined`，字段为 `id: number`、`title: string`、`message: string`。DetailPage 每次失败增加 ID，复用原晋阶要求计算及通用失败提示。成功激活、取消均清空通知，不生成成功提示。

组件仅在静态角色模式挂载，光锥和 Player 模式不挂载。内部 action 将预先存在的空 live region 移到 `document.body`，固定于视口顶部居中；Safe Area 加 `--space-6`，最大宽度 26rem，窄屏两侧各留 `--space-4`。暗色卡片、细边框、圆角、轻阴影及装饰性 Info SVG，没有新资产、依赖或关闭按钮。

容器使用 `role="status"`、`aria-live="polite"`、`aria-atomic="true"`，按 [W3C ARIA22](https://www.w3.org/WAI/WCAG21/Techniques/aria/ARIA22) 预先提供状态通知容器。`pointer-events: none`；没有焦点、滚动或 body 锁定操作。

每次通知替换均取消停留和移除计时器，按 ID 更新单张卡片及内容。显示 4000ms 后开始 120ms 淡出，两个回调均验证当前 ID；新通知不会被旧回调关闭。入场轻微下滑淡入，reduced-motion 下关闭动画及过渡，超时直接移除。等级更新、Profile/实体/语言上下文更新清空通知；进入 Player 模式移除组件。销毁时取消计时器，action 移除 body 节点。上下文清除立即移除内容，不等待淡出。

已删除行迹底部 `traceFeedback` 状态和 Banner DOM，没有留下占位；其他仍使用的 `data-placeholder` 样式保留。

## 分隔线与留白

费用分类删除 `border-top` 和 `padding-top`；总览删除金色顶边及额外上边距。分类标识、标题级别和材料费用来源保留。

培养目标通过局部 `.training-target :global(.skill-level-control)` 覆盖滑块顶边、上 padding 和 margin 为零。没有修改共享 LevelSlider 或全局规则。技能 Grid 的上边距和行间距统一为 `--space-4`；小节间距仍为 `--space-6`。标题横线、既有容器边框、材料 Cell 边框及行迹摘要淡色竖线没有修改。

## 实际检查

| 检查 | 结果 |
| --- | --- |
| 双语消息验证与编译 | 通过，446 条消息、2 个 locale |
| 本轮源码、测试及消息 Prettier | 通过；报告按仓库规则手工维护，Markdown 不进入 Prettier |
| 本轮改动源码及测试 ESLint | 通过 |
| 四个 Svelte 组件 client/server 编译 | 8 次通过，0 警告 |
| 两个测试文件 TypeScript 转译 | 语法通过；不是完整语义检查 |
| Svelte/TypeScript 全项目检查 | 未通过：794 errors、0 warnings、61 个文件；四个改动组件没有诊断 |
| 新增空 live region 的定向 Vitest | 启动时缓存 rename EPERM，0 项测试执行 |
| 包含本轮修改的本地 Vite 构建 | SSR 转换 909 modules 后失败，SvelteKit/Vite 依赖 realpath EPERM |
| Playwright 浏览器验证 | 未运行；新构建失败后停止该路径，没有使用旧构建 |
| 最终 diff、网站及上游状态 | 已检查；两份上游干净、HEAD 不变 |

全项目检查包含 Vite 配置加载/插件类型及 Playwright/Vitest 类型导出错误，相关测试的推导类型也受影响。不能据组件编译和转译结果声称全项目类型检查或交互验收通过。本轮没有重复费用算法审计，也没有修改无关 CI 配置。工具失败后依照 AGENTS.md 停止相应路径，没有重试绕过。

实际命令为 `node node_modules/tsx/dist/cli.mjs scripts/messages.ts`、定向 Prettier/ESLint、直接 Svelte compiler client/server 编译，以及：

```powershell
node node_modules/vitest/vitest.mjs run tests/unit/training-presentation.test.ts -t 'prerenders an empty polite status region'
node node_modules/svelte-check/bin/svelte-check --tsconfig ./tsconfig.json
node node_modules/vite/bin/vite.js build
```

失败日志位于忽略目录 `data/audit/training-polish-03-{vitest,svelte-check,build}.log`。

## 待浏览器验收

新增中英文用例会在 Desktop/Mobile 项目检查 body 挂载、正确晋阶要求、未激活状态、固定居中、页面高度和滚动、鼠标/键盘焦点、单实例及 Playwright 时钟计时。还覆盖成功/取消/等级清除、语言与角色路由、真实站内链接的 SPA 销毁、Player 查询门控、Profile 切换、reduced-motion、局部边框、保留的标题/材料/摘要边框及水平溢出。以上均尚未执行。

在可正常构建的本地环境先停止旧 Preview，执行新 `pnpm build` 后再运行定向浏览器用例：

```powershell
$env:PLAYWRIGHT_REUSE_BUILD='1'
pnpm exec playwright test tests/e2e/training-detail.spec.ts --grep 'trace info toast|training divider cleanup|Profile switches|delayed trace toggles' --project=desktop-chromium --project=mobile-chromium --workers=2 --retries=0 --reporter=line
```

人工清单：

1. 三月七中英文、桌面和手机：低等级点击受限节点，确认提示晋阶正确、节点未激活；Toast 位于视口顶部，不增高页面、不抢焦点、不阻挡操作。使用 Enter/Space 重复失败，确认计时重置，4 秒后淡出且最多一张。
2. 通知显示期间成功操作或修改等级，确认立即清除；切换语言、角色、1102 Base/Enhanced、进入真实 Player Info 或离开详情页，确认无残留。Player 不出现模拟按钮或 Toast。
3. 角色及光锥 20000：费用组和培养滑块无重复顶边，总览无金色横线；原技能组顶边、标题横线、材料边框、摘要桌面竖线保留。
4. 窄屏检查换行及水平溢出；启用 reduced-motion 检查无入场/淡出动画。屏幕阅读器确认 polite 状态播报，不转移焦点。

浏览器及辅助技术验收仍待完成，不将静态检查计作浏览器通过。

## 仓库边界

两份上游任务前后 Git status 均为空。TurnBasedGameData HEAD：`724b139d8c9c32d12552eb95745a4fee72bfe48b`；StarRailRes HEAD：`dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487`。仅修改网站仓库，保留上一轮未提交内容；未 commit、push 或部署，交付后等待人工验收。
