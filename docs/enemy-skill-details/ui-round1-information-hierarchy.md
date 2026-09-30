# Enemy Skill Browser UI Round 1 — Information Hierarchy

实施日期：2026-09-30。网站分支 `develop`；Node 24.21.0、pnpm 11.9.0。依据当前代码、V2 Phase 4 倍率候选报告及 `enemy-skill-browser-ui-round1-prompt.md` 实施。

## 展示实现

- `EnemySkillSelector.svelte`：native button 使用 `1.3rem minmax(0, 1fr)` 两列 grid，所有技能始终保留真实、`aria-hidden` 的图标槽；图标沿用 `1.15rem`。无属性时槽内为空，长名称换行。selected 背景、左侧 accent、文字强调、焦点和 `aria-pressed` 保持原样。
- `EnemySkillDetail.svelte`：标题右侧一个可换行的 metadata group，属性 icon＋文字在原有技能类型 pill 左侧。属性仍无边框／背景，缺失属性不显示 placeholder；属性-only 和缺少全部 metadata 的运行时降级也有 SSR 覆盖。当前生产 view contract 仍要求 tag，不因测试降级场景修改公共类型。
- 数值总标题为 `h4`，类别标题为 `h5`，技能名称仍为 `h3`。顺序为伤害倍率、基础概率、行动变化；行动类型按首次出现顺序分组，同类型标题只出现一次。
- 每个类别一个 `width: min(100%, 34rem)` grid，列为 `fit-content(10rem) minmax(0, 1fr)`，列间距 `--space-4`。datum row 使用 column subgrid，共享 qualifier 列宽，value 左对齐。不同类别保留各自的本地列宽，不将 metadata 撑到 detail panel 两端。
- 可选 target 缺失时不渲染 qualifier 节点；value 使用 `grid-column: 1 / -1`，从组左侧开始。已知／无标签混合组、匿名 base chance、行动变化遵循同一布局。
- 沿用 `520px` breakpoint，将类别 grid 改成单列；row 自然堆叠 qualifier/value。长 qualifier、名称及倍率可换行，不压缩字号。selector 的整体宽度、820px master-detail 切换、官方描述宽度和 sticky 行为未修改。
- 仍使用 `visibleEnemySkillApplications`，保留共同概率折叠、不同概率的可见关联及 application 名称；不依赖 Status ID。数值仍使用原有精确十进制 formatter，不修改倍率候选、提取或排序语义。
- 只有可展示事实存在时才渲染总标题和顶部 divider。内部类别依靠 `--space-4` 间距，datum 使用 `--space-2`，不新增 card、pill 或 row divider。

## i18n 与局部清理

双语新增 `enemy_skill_numeric_information`：`数值信息`／`Numeric Information`。沿用其他类别消息、属性颜色、图标及类型 pill；Paraglide 消息校验和编译通过。

删除旧属性下置 wrapper／margin、数值行 `space-between`／value 右对齐／自动左 margin、类别与 application 内部分隔线、旧行动标题行样式及 selector icon 的 flex basis。共享 scoped CSS 统一 numeric layout，没有新增通用 metadata 框架。parser、data schema、生成器、格式 helper、phase／Monster selection 和全站 CSS 均未改动。

## 测试与验证

| 检查                                       | 结果                                                                                               |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| SSR、selection/formatting、双语 projection | 3 个 Vitest 文件，41 项通过；SSR 文件由 2 项扩展为 22 项                                           |
| 真实 parser fixtures 回归                  | `enemy-skill-details.test.ts`，53 项通过；涵盖 prompt 全部 representative cases                    |
| `pnpm check`                               | 通过；414 个双语消息校验编译，Svelte 0 错误／0 警告，scripts/API TypeScript 通过                   |
| 定向 Prettier／ESLint、`git diff --check`  | 通过；独立工具通过 Node 执行已有依赖入口                                                           |
| `pnpm build`                               | 通过；data/assets ensure 缓存命中，2744 项 benchmark 验证通过，adapter-static 写入 `build`         |
| 双语生成数据及静态 HTML                    | 每个 locale 检查 7 个 representative bindings、5 个数值页面和 1 个无数值页面，全部通过             |
| Playwright desktop/mobile                  | 14 个相关项目用例最终均通过；单 worker、零重试、复用生产构建                                       |
| 浏览器视觉检查                             | 4 张截图已核查；中文 Kafka 双目标、中文概率＋行动提前、英文无目标 desktop／390px；未发现 pageerror |

SSR 覆盖新增层级、目标／无目标／混合组、多倍率、概率 target／无 target、命名 application 关联、相同概率折叠、行动分组、空／不可展示事实、selector 图标槽和 header 缺失项。locale 消息断言使用当前消息解析结果，不固定可修改文案。

Playwright 在两种 locale、1440／900／390／320px 下验证实际名称起点、共享 value 起点、compact width、窄屏堆叠和长文本不溢出，保留键盘激活／焦点、phase 筛选及 Monster override 回归。无目标候选用例新增实际 value 左边界检查。长文本压力测试只延长浏览器中已有文本，不更改生产数据。

首轮 Playwright 12 项通过，2 项新增布局测试因分开读取坐标时页面 scroll anchoring 改变位置而失败；浏览器同帧坐标检查确认布局正常。改为一次 `evaluate` 读取相关矩形后，定向复跑 4 项全部通过（含两项候选回归）。没有为此修改或弱化产品布局。Windows 的 preview 子进程在退出清理阶段未自动结束；停止本轮明确启动的 preview 进程后得到上述测试摘要，最终复跑退出码为 0。未发生历史的 `127.0.0.1:4173 -> EPERM`，本轮浏览器验证已实际执行。preview 下现有 `/_vercel/insights/script.js` 404 保留，不属于 Enemy Skill UI 回归。

截图保存在被忽略的 `test-results/ui-round1/`，未提交二进制或临时验证脚本。数据处理未修改，未额外运行 data sync／完整数据重生成。

## 边界与后续

网站变更仅限两个展示组件、双语消息、相关 SSR／E2E 测试和本报告。只读 `TurnBasedGameData`、`StarRailRes` 开始／结束均干净；未提交或部署。

本轮未发现需要扩大范围的 UI correctness 问题。mobile selector 整体体验、文案调整和 deep cleanup 继续留给后续独立轮次；没有自行进入这些工作。
