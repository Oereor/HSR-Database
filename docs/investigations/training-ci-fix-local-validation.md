# Training CI 修复与本地验收

日期：2026-10-09。本文记录本轮实际执行结果；此前清理报告保留为历史记录。

结论：**GO（本地发布前验收通过，等待用户验收与后续合并）**。已知 CI 错误已修复，必要类型、lint、单元测试、数据、资源和构建门禁均通过；最终浏览器运行 461 项首轮通过、0 失败、0 flaky，6 项既有视口条件跳过单独记录。

## 基线与边界

- 网站仓库：`HSR-Database/`，分支 `develop`，起始 HEAD `58cb7be7b8c89dc578b86d41c3c795baa6b81878`，起始工作区干净。
- Node.js `24.21.0`、pnpm `11.9.0`，符合 `package.json` 要求。
- 沿用 upstream lock：TurnBasedGameData `724b139d8c9c32d12552eb95745a4fee72bfe48b`；StarRailRes `dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487`。
- 两个上游兄弟仓库起始工作区干净；仅允许网站仓库内写入，不更新依赖或 upstream lock，不提交、推送、合并或部署。

## 根因与修复

1. `training-detail-view.test.ts` 对 `skillTrace` 的 `toEqual` 传入了两个参数。正确契约是技能费用与行迹费用的合并结果。删除误插入的 `allowedSkillTrainingLevels` 参数，保留在合法等级测试中仍被使用的导入；生产计算逻辑无需修改。
2. 提权后定向测试揭示 `training-presentation.test.ts` 两处错误属性匹配：`\bid=` 也会匹配 `data-skill-id`、`data-material-id` 等属性。改为要求属性前有空白的 `\sid=`，继续检查页面章节顺序、真实 HTML ID 唯一性、标签绑定及费用分组。
3. 首次完整开发 CI 的 909 项测试中，908 通过，一个测试在单用例内遍历 98 个角色及其 Profile / 等级，在全仓并行负载下用时 5.376 秒而超过默认 5 秒。改为按角色 ID 的 `it.each` 用例，保留所有 Profile、等级和原有断言，同时保持默认超时及并发配置。原先一个用例成为 98 个，测试数量增加 97，未新增等价覆盖。
4. 对所有测试的 `toEqual`、`toStrictEqual`、`toBe` 调用进行 AST 检查，原始多参数错误仅此一处。定向检查训练投影函数调用、Item Modal 请求保护、Profile 隔离、关闭与焦点恢复，以及旧过渡字段、费用选择器；未发现需要修改训练计算逻辑的明确遗留问题。未删除测试或放宽类型检查。
5. 完整 E2E 揭示 Item Modal 在只有关闭按钮时，Tab 会把焦点交给 document body。补充对可见可聚焦控件的边界循环：末项 Tab 返回首项、首项 Shift+Tab 返回末项；关闭、焦点恢复、滚动锁及请求保护逻辑保持原契约。在现有双语、桌面／移动端 Modal 用例中增加反向 Tab 验证。
6. 完整 E2E 的失败集中在 19 个位置（61 个项目／参数组合）。逐项确认后修复旧契约：装备导航遗漏养成；Overview href 未包含尾斜杠；`/en` 前缀错误匹配 `/enemies`；已废弃 enemy skill-group 选择器；缺省 Player 行迹应为 inactive；英文 rank label 可以合法等于 Elite；首页最近跃迁、遗器类别数量、搜索结果数量和 Endgame occurrence 随锁定输入变化。数据断言改为从既有生成输入读取身份、数量、顺序和等级，不改变产品代码。搜索提交改为对实际查询输入按 Enter，避开两个 submit 按钮造成的严格模式错误。
7. 训练指针测试先把 slider 滚入视口再取得坐标；通知测试先滚入视口并使用 preventScroll 聚焦再记录布局，避免浏览器平滑滚动被误归因于 toast。首个 Preview slider 的顶部边线本就被共享样式移除，更新该过时断言；继续保护材料格边线、章节分隔线、后续布局和 ID 唯一性。
8. 后续复验抵达之前被早期失败遮挡的断言：楼层标题来自本地化游戏数据，可显示「十二」而非阿拉伯数字 `12`，标题层级测试改验可见与非空；全局 reduced-motion 样式将过渡时长设为 `0.01ms !important`，因此改验计算时长不超过 `0.00001s`，仍要求 animation 为 none，并保留通知关闭与生命周期测试。新标签页先激活并等待目标 URL 的 DOM 就绪，避开 about:blank 已就绪造成的错误导航前提；遗器响应式交互先等待应用就绪再操作原生 details。
9. 第三轮 E2E 唯一 flaky 为 Player 光锥图片边距。补充滚入视口和图片 `decode()` 前提后，定向桌面／移动端各 3 次稳定失败，确认原先部分通过是在 lazy 图片未解码时测量：上／右／左均 4px，底部仅 0.703125px。`CompactEntityCard` 图片槽隐式 Grid 轨道受图片固有尺寸影响；显式设置两个轴的 `minmax(0, 1fr)` 轨道，使槽内百分比图片尺寸相对于固定轨道计算。保留 object-fit contain、无变换及四边至少 3px 的原断言，并添加实际边距的断言失败信息。
10. 三项目回归中的遗器网格测量出现两个 flaky：先前点击遗器链接留下的指针会悬停首卡，触发 `translateY(-2px)`，导致按纵坐标统计首行误判为一列。测量前把指针移出网格，并对原有列数条件使用 `expect.poll`；保留 768px 至少两列、390px 恰好一列及不横向溢出的检查。桌面／移动端各 3 次定向复验全部首轮通过。

## 权限与环境

- 首次 sandbox 内执行定向 Vitest 在 pnpm 启动阶段触发 `realpath EPERM`，未运行测试。
- 按本轮明确授权，申请提升必要的测试、格式化、检查和构建命令执行权限。提权后 Vitest 正常执行，完整 `pnpm check` 通过。
- 提权后确认代理 `127.0.0.1:7890` 可用，联网命令仅设置进程级代理变量；本地存在 Chromium 缓存。
- 没有修改系统权限、持久代理设置、CI 工作流或质量门槛。

## 实际验证记录

完整日志位于本地忽略目录 `data/audit/`，文件前缀 `training-ci-fix-`。

| 命令／阶段 | 状态 | 结果 |
| --- | --- | --- |
| 首次 sandbox 内定向 Vitest | Blocked by Environment | pnpm `realpath EPERM`，0 测试执行 |
| 首次提权定向 Vitest（4 套件） | Failed | 35 通过、2 失败；失败为上述 HTML 属性匹配问题 |
| 修改文件 Prettier | Passed | 两份测试均符合格式 |
| 第一次修复后定向 Vitest（6 套件） | Passed | 57/57 测试通过；详情、核心、呈现、材料详情、加载器、EXP |
| 参数化后最终定向 Vitest（6 套件） | Passed | 154/154 测试通过；同样覆盖，角色案例独立报告 |
| `pnpm check` | Passed | Svelte 0 errors / 0 warnings，scripts 和 API TypeScript 检查通过 |
| 首次 `pnpm ci:develop` | Failed | 类型及 lint 通过；908/909 单元测试通过，单个大范围遍历超时，构建尚未执行；已修复并重跑 |
| 最终 `pnpm ci:develop` | Passed | 84/84 套件、1006/1006 测试，check、lint、锁定输入准备、Vite 构建及 output smoke 全部通过；106.523 秒 |
| `pnpm ci:validate` | Passed | 完整数据语义、资源校验、check、lint、84/84 套件、1006/1006 测试、构建、产物资源闭合及 2180 公共页面与内部链接验证全部通过；154.617 秒 |
| `pnpm deploy:build:production` | Passed | 构建输入、资源、Vite、产物 smoke、资源闭合及 2180 双语页面与内部链接验证通过；77.250 秒；只生成本地产物 |
| `pnpm test:e2e:smoke '--reporter=list,html'` | Passed | 5/5 测试通过；使用本轮 Production 构建和新启动 Preview，6.6 秒 |
| `pnpm test:components '--reporter=list,html'` | Passed | 4/4 测试通过，3.7 秒；新启动的 Vite fixture |
| 首次 `pnpm test:e2e '--reporter=list,html'` | Failed | 395 通过、61 失败、6 个既有条件跳过；462 项，2.7 分钟；错误摘要保存在 `training-ci-fix-e2e-initial-errors.json` |
| 浏览器修复后首次 `pnpm ci:validate` | Failed | 新增测试错误读取 `.occurrence.level`；类型检查准确拦截，已改为现有类型规定的 `.level`，未掩盖错误 |
| 浏览器修复后最终 `pnpm ci:validate` | Passed | 全部阶段通过，84 套件 / 1006 测试，完整数据语义、资源、lint、构建与 2180 路由再次通过；154.035 秒 |
| 浏览器修复后 `pnpm deploy:build:production` | Passed | 全部阶段通过；包含最终 Modal 修复，7746 个产物文件 / 429637488 字节，2180 双语路由；75.239 秒 |
| 第二轮完整 E2E | Failed | 448 通过、7 失败、1 flaky、6 个既有条件跳过；1.8 分钟；已修复剩余断言／等待问题，错误摘要保存在 `training-ci-fix-e2e-second-errors.json` |
| 最终 `pnpm check` / `pnpm lint` | Passed | 最后修改的 E2E 类型、Svelte、scripts、API、全仓 Prettier 和 ESLint 全部通过 |
| 第三轮完整 E2E | Passed | 退出码 0；455 首轮通过、1 flaky、6 个既有条件跳过；1.5 分钟；不能视为 456 项稳定首轮通过 |
| 图片 decode 后 Player 稳定性复验 | Failed | 桌面／移动端各 3 次均失败（共 6），揭示真实图片布局缺陷；单 Worker 诊断确认底部边距 0.703125px；已修复共享图片槽 |
| 共享图片槽修复后首次完整 CI | Failed | 数据、资源和类型通过；lint 的 Prettier 检查进程异常退出 3221225477，无代码／格式诊断，后续单元测试及构建未执行 |
| `pnpm lint` 单独恢复验证 | Passed | 同一文件状态下全仓 Prettier 和 ESLint 通过；Windows 应用错误查询没有提供可用崩溃信息，不能确定底层故障原因 |
| 共享图片槽修复后最终 `pnpm ci:validate` | Passed | 完整恢复运行全部阶段通过，84 套件 / 1006 测试，check、lint、数据、资源、构建、闭合及 2180 路由；154.058 秒 |
| 修复后 Player 稳定性复验 | Passed | 桌面和移动端各 3 次，6/6 首轮通过、0 flaky；5.7 秒，真实解码图片边距断言保持原阈值 |
| 包含全部修复的 `pnpm deploy:build:production` | Passed | 所有阶段通过；7746 个产物文件 / 429637557 字节，2180 双语路由；73.752 秒 |
| 第四轮完整 E2E + smoke（3 个项目合并） | Passed | 退出码 0；459 首轮通过、2 flaky、6 个既有条件跳过，1.6 分钟；两个 flaky 已修复测量前提 |
| 网格测量稳定性复验 | Passed | 桌面和移动端各 3 次，6/6 首轮通过、0 flaky；6.7 秒，列数和溢出阈值未改变 |
| 最终交付 `pnpm check` | Passed | Svelte 0 errors / 0 warnings，消息、scripts、API TypeScript 全部通过 |
| 最终交付 `pnpm lint` | Passed | 全仓 Prettier 检查及 ESLint 全部通过 |
| 最终交付三项目浏览器 | Passed | `pnpm exec playwright test --project=desktop-chromium --project=mobile-chromium --project=ci-smoke '--reporter=list,html'`；461 首轮通过（456 完整 E2E + 5 smoke）、0 失败、0 flaky，6 个既有条件跳过；1.5 分钟 |

浏览器测试使用进程级 `CI=1`、`PLAYWRIGHT_HTML_OPEN=never` 和独立 HTML 报告目录。E2E 使用 `PLAYWRIGHT_REUSE_BUILD=1`，每次启动前检查端口 4173 空闲，日志确认启动新的 `vite preview`。首次 smoke 命令的 reporter 参数未加引号，被 PowerShell 将逗号分隔为两个值，Playwright 在执行测试前退出；修正为引号包裹的原参数后通过，未修改测试或配置。

`ci:develop` 已在断言及参数化修复后完整通过。此后的 UI 修改由包含同一组 Development 检查阶段的完整 `ci:validate` 覆盖，并再执行 Production 构建；没有为了再次打印同一结果额外重跑 Development。最后的网格测量修改仅影响测试，已补跑最终 check、lint 和全部浏览器项目，Production 产物仍来自全部生产修改完成后的成功构建。

6 项跳过均为已有条件：desktop 项目不运行专属移动端 navigator 用例；mobile 项目不运行专属桌面 navigator、Enemy Overview 消息语义、Footer 消息及双语 enemy labels 用例。这些语义在另一视口已有对应运行，未新增任何 skip／only，未把跳过算作通过。

本地 HTML 浏览器报告：`data/audit/training-ci-fix-browser-delivery-report/index.html`。最终命令日志：`training-ci-fix-check-delivery.log`、`training-ci-fix-lint-delivery.log`、`training-ci-fix-develop-final.log`、`training-ci-fix-validate-complete.log`、`training-ci-fix-production-complete.log`、`training-ci-fix-components.log`、`training-ci-fix-browser-delivery.log`，均位于 `data/audit/`。初始失败和中途恢复日志保留，不能据最终 Passed 抹去曾发生的错误。格式化也曾因 PowerShell/pnpm 将文件数组合并为一个参数而未执行，改为逐文件参数后成功。

## 最终审查与发布判断

- 最终 `git diff --check` 通过；16 份既有文件修改（2 份生产组件、14 份测试），新增 1 份本报告。所有格式化都限定在语义修改文件，纯格式文件修改数为 0。准确增删统计保存在 `data/audit/training-ci-fix-final-state.json`，不将忽略的缓存／构建／测试产物纳入源码统计。
- AST 最终审计扫描 117 份测试源文件，`toEqual`／`toStrictEqual`／`toBe` 的多参数调用为 0；结果保存于 `training-ci-fix-matcher-audit.json`。
- 无临时生产调试代码、公开接口／schema／路由／消息／依赖／锁文件／CI 工作流变更；受跟踪的生成资源快照未修改。断言失败信息用于报告真实图片边距，没有添加生产 console 或测试跳过。
- 网站仍在 `develop`，HEAD 未改变；两份上游兄弟仓库最终工作区均与初始相同、干净。未提交、推送、创建 PR、合并或部署。
- 所有本轮必要验收的最终状态为 Passed，未剩余 Failed、Blocked by Environment 或必要 Not Run。早期 EPERM 和工具进程异常已恢复验证；没有降低质量门槛。原始数据校验中的分类 fallback／可选缺失诊断沿用现有规则，没有将其改为错误或掩盖错误。
- 本地验收满足进入 Production 前的合并验收条件。远程 GitHub Actions 重跑、合并 main、部署及在线外部服务验收均未执行，本报告只声明本地证据；浏览器 Player 场景沿用现有合成 API fixtures。
