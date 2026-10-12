# 效果预设卡片化与简化报告

日期：2026-10-12。本地 develop 分支实施，未提交、推送或部署。

## 组件与消息

复用 CompactEntityCard、GameText、现有 compact-entity-grid，以及 getRelicSetIconUrl / getLightConePreviewUrl。共享卡片新增默认关闭的 asButton、selected、disabled、wrapTitle 参数；按钮模式为原生 type="button"，通过 aria-pressed 表达选中，转发点击事件。Hover、Focus、边框、圆角和图文布局沿用共享样式，选中保持金色边框；预设标题自然换行。

预设只使用 title 和 secondary 两个 slot，不提供星级、命途、分类或链接箭头。原有装备推荐组件未修改，其默认链接、星级和命途展示由实际组件渲染测试保护。头像目标 Grid 和普通事件表单流程保持原样。

新增的 Site Message 均成对维护，调用显式传递页面 locale：

| 消息 | 中文 | English |
| --- | --- | --- |
| planner_preset_dance_effect | 我方全体行动提前 24% | Advances all allies' actions by 24% |
| planner_preset_vonwacq_effect | 目标行动提前 40% | Advances the target's action by 40% |
| planner_preset_eagle_effect | 目标行动提前 25% | Advances the target's action by 25% |

构建产物中已逐项核对真实名称：生命的翁瓦克 / Sprightly Vonwacq、晨昏交界的翔鹰 / Eagle of Twilight Line、舞！舞！舞！ / Dance! Dance! Dance!。图标沿用遗器 308、110 和光锥 21018 的现有资源，不增加数据或图片管线。

## 预设逻辑与兼容

删除叠影控件、superimposition 状态及 14 + 2 × 叠影的幅度映射；presetOperation 不再接收叠影参数。canUseVonwacq 只检查战斗开始节点，不再接收或读取速度。缺少有效目标时仍禁用对应卡片。

删除 planner_superimposition、planner_vonwacq_note、planner_preset_note 三个预设专用消息及底部两段说明。资料页真实触发条件和叠影功能未改动。

| 预设 | 标准输出 | 适用节点 |
| --- | --- | --- |
| 翁瓦克 | advance，percent: 40，所选单位 ID | 战斗开始 |
| 翔鹰 | advance，percent: 25，所选单位 ID | 保持现有节点能力 |
| 舞舞舞 | advance，percent: 24，全体友方 | 保持现有节点能力 |

百分比字段仍采用 24、40、25，不改变标准事件模型。舞舞舞填入草稿时沿用现有目标展开流程，提交为单条包含当前友方实例 ID 的群体操作。

选择卡片仅填充新增草稿并高亮；提交、取消、新建普通草稿或进入已有效果编辑时清除预设高亮。不会自动提交或覆盖当前已有效果。原普通事件不迁移、不重写，旧 16/18/20/22% 事件的参数与实际推演结果均由回归测试验证保留。引擎、AG/AV、结算窗口与 Buff 生命周期未修改。

## 验证结果

环境使用 Node 24.19.0、pnpm 11.9.0。

| 检查 | 结果 |
| --- | --- |
| 预设 Adapter 与卡片/面板渲染定向测试，2 个文件 | 14 项通过 |
| 共享卡片领域边界定向 invariant | 1 项通过，同文件另外 9 项按过滤条件未执行 |
| pnpm check | 通过；Svelte 0 错误、0 警告，脚本/API 类型检查通过 |
| 修改文件的 Prettier / ESLint | 通过 |
| pnpm build | 通过，静态站点成功写入 build |
| 中英文最终构建产物中的名称、效果说明 | 已逐项核对正确 |
| git diff --check | 通过 |
| 两个上游仓库 Git 状态 | 与开始时一致，均干净 |
| 定向浏览器验收 | 未执行：项目需要的 Chromium 1234 可执行文件仍缺失 |

测试采用合成站点消息验证 locale 选择，未固定生产文案快照；共享组件测试覆盖原生按钮、默认链接/article、缺失图片回退以及原装备推荐星级/命途 slot。浏览器用例已更新并补充中英文预设场景，没有新增纯样式快照测试。

浏览器预检通过 Playwright 自身的 executablePath 获取路径，exists=false；已有其他版本的缓存不能作为当前项目的验证证据。按已确认环境约束，没有绕过版本要求或重复启动失败路径。本次未取得浏览器截图，鼠标/键盘实际交互、动态高亮及响应式视觉不能标记通过。没有运行全仓单测或全仓浏览器回归。

## 人工验收

准备当前项目版本所需的 Playwright Chromium 后，可复用最终构建：

```sh
PLAYWRIGHT_REUSE_BUILD=1 pnpm exec playwright test \
  tests/e2e/action-planner.spec.ts tests/e2e/equipment-recommendation.spec.ts \
  --grep 'presets|preset cards|角色装备推荐解析' \
  --project=desktop-chromium --project=mobile-chromium --reporter=line --workers=2
```

重点确认三张卡片的图标和双层文字、英文长名称完整换行、鼠标与 Enter/Space 选择、取消及提交后的高亮复位、低于 120 SPD 使用翁瓦克、目标选择和填表不提交流程，以及角色详情原有推荐链接、星级、命途保持原样。
