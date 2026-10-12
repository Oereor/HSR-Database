# 排轴模拟器动态参与者架构调查与基础重构

日期：2026-10-12。修改位于 HSR-Database 的 `develop`；没有提交、推送、合并或远端部署。两个相邻上游只读。本报告描述本轮实现，后续维护以实际代码及仓库现行规范为准。

## A. 现有架构审计

### 重构前职责与约束

旧 `types.ts` 定义固定初始 `UnitConfig[]`、`UnitState[]`、`unitId + turn` 锚点和四种效果。`engine.ts` 同时承担数学、参数校验、目标解析、克隆、队列排序、操作提交、自然行动结算与预算控制。`createInitialState` 给全部初始单位满 AG；`stepSimulation` 默认每个参与者都有 modifiers/turns，并无条件以满 AG 重新入队。引擎实际上没有“四人数量上限”，但所有实例只能来自初始计划，生命周期固定。四人限制属于左侧角色槽位 UI。

`effect-config.ts` 为引擎和 Inspector 共用阶段筛选、保存及排序。`character-selection.ts` 把角色槽位投影为单位；`presets.ts` 仅生成普通提前草稿。`presentation.ts` 投影记录/快照，但未来卡片名称仍需主组件从初始队伍反查。`ActionPlanner` 保存内存方案、完整重算、跟踪锚点和队列游标；`EffectEditor` 集中管理列表、草稿、目标和预设，默认每条操作都具有 target。`EffectCard` 和 `TargetGrid` 也绑定初始单位形状。

### 可保留与需要替换的抽象

保留满 AG=10000、AV=剩余 AG/有效 SPD、百分比速度基于自定义基础 SPD、独立速度实例、零 AG 插队批次、每个窗口有序操作、全量确定性重放、稳定节点锚点和不可达事件保留。保留展示与领域计算分离、角色轻量投影以及预设仅填表。

替换“所有单位都有自然回合且必定重入队”的假设，分离队列状态和生命周期。把初始队伍查询从历史记录展示中移除；把阵营目标解析与倒计时资格分离；把操作与目标校验从大调度函数提取。删除缺省阶段和旧解除操作专用兼容：当前没有 localStorage、保存、导入或导出接口，不需要迁移持久化方案。未知操作仍按非法输入拒绝。

旧历史报告的机制说明存在阶段差异，例如最早报告把到期放在重入队之前；本轮以当前代码和双窗口回归语义为准，不把旧报告作为未变更契约。

## B. 旧测试清理

先清理旧测试，再替换引擎。规划阶段原有 7 个文件、50 项通过；清理后同样 7 个文件、43 项通过，因此清理不是为了隐藏新实现失败。

| 分类 | 处理 | 保留的保护 |
| --- | --- | --- |
| A：机制不变量 | 保留并按新接口迁移；合并相同机制的重复夹具 | 数学与剩余 AG、自然平局、零 AV 再提前、群体及重叠顺序、立即行动、窗口次序、速度状态快照/到期、确定性、孤立引用、预算和失败节点不发布 |
| B：实现耦合 | 将固定数组位置、内部 zeroBatch 与对象引用同一性的断言改为实例查找、下一节点结果和投影值 | 验证行为，不要求内部数组或克隆布局 |
| B：旧兼容契约 | 删除缺省 phase 与 removeSpeedModifier 专用拒绝测试，改为明确阶段及普通未知操作/畸形输入保护 | 当前公共接口正确拒绝不合法配置 |
| C：重复机制 | 删除两条重复窗口零 AV 参数化案例，后续把 22 条引擎案例整合为 14 条组合回归 | 零 AV 核心案例、两窗口有序操作和到期保留行动条仍有确定性数值验证 |
| C：旧预设参数 | 删除四条旧 16/18/20/22% JSON 兼容案例 | 三个当前标准预设及任意非负提前百分比能力仍保留 |
| C：易变 UI 细节 | 删除浏览器精确头像尺寸、系统卡相对高度、CSS 装饰与固定表单控件数等断言 | 四初始槽位、键盘/焦点、取消/提交、稳定选择、队列游标、缺图、locale 和窄屏无溢出 |

`action-planner-effect-config` 保留阶段内移动、阶段迁移追加、原位编辑和删除源效果重放；`presentation` 保留 AV/锚点投影；`selection` 保留替换实例身份与共享搜索行为。服务器数据投影和共享卡片默认行为不因引擎改动而删去。浏览器用例中的既有控件数量不是全部删除：初始四槽和单条群体配置等有效结构要求继续保留。

最终集合为 9 个文件、45 项：迁移/整合后的既有 35 项，加上 8 项动态队列组合案例、2 项 Inspector 静态渲染检查。测试保护本轮已实现能力，不声称覆盖全部未来 UI、游戏技能或所有类型分支。

## C. 推荐的新模型与已落地语义

### 公共类型与模块边界

```ts
type ParticipantDefinition = ActorDefinition | ScheduledEventDefinition;
type EventAnchor =
  | { kind: 'start' }
  | { kind: 'action'; participantId: string; turn: number }
  | { kind: 'trigger'; participantId: string };
type SpeedDuration =
  | { kind: 'turns'; turns: number | null }
  | { kind: 'countdown'; name: string; speed: number };

interface SimulationPlan {
  actors: ActorConfig[]; // 初始队伍；初始倒计时用 start 创建操作表达
  events: PlanEvent[];  // 每个锚点只有一个有序 operations 列表
  maxNodes: number;
  maxAV: number;
}
```

完整接口在 `src/lib/action-planner/types.ts`。Actor 定义包含名称、可选 iconUrl、阵营、基础/面板速度、可选类别、自定义初始 AG 和行动次数上限；类别只是元数据，不参与游戏技能自动判断。ScheduledEvent 包含名称、可选 iconUrl、SPD 和初始 AG，不具有 modifiers、自然回合或阵营资格。

运行时使用 `ParticipantState[]` 统一队列，公共队列字段为实例 ID、剩余 AG、自然平局序号及零 AG 批次；Actor 独有 turns/modifiers。继续使用小数组和排序，因为当前预算上限 500 个节点且规模较小，没有引入堆、ECS、事件总线或第二套队列。

| 模块 | 职责 |
| --- | --- |
| `queue.ts` | 数学、时间推进、克隆、排序、ID/锚点、快照及有限数值保护 |
| `validation.ts` | 结构/参数/阶段校验、潜在实例注册与冲突检测、已知非法倒计时引用；定义目录仅用于身份检查和标签 |
| `targeting.ts` | 当前 Actor 阵营解析、倒计时显式单目标规则、UI 可选择目标 |
| `operations.ts` | 有序操作与逐操作原子提交，唯一创建路径 |
| `engine.ts` | 初始状态、两种生命周期、节点预算/AV、完整节点发布与预览重放；作为调用方入口导出相关函数 |
| `effect-config.ts` / `presentation.ts` | 统一列表编辑顺序与显示投影，不承载游戏机制 |

### 身份、动态创建与引用

`spawnParticipant` 的配置不再要求调用方填写运行实例 ID：`spawnedParticipantId(operationId)` 派生实例身份；速度倒计时使用独立命名空间的 `countdownParticipantId(operationId)`。两种帮助函数对操作 ID 编码，初始 Actor ID 与全部潜在创建身份统一查重，操作 ID 在整个计划内必须唯一。字符串格式属于实现细节，调用方应使用帮助函数。运行状态以 issuedParticipantIds 记录所有已发放身份，离队不释放身份；克隆时独立复制注册集合，独立调用步进 API 也不能重用已离队实例 ID。

同名召唤物的两个创建操作产生两个独立实例。名称、速度、阶段、操作排列变化保留源操作 ID，因此后续锚点不因 AV 或可见行号变化而改绑。删除源配置会从初始状态重放；后续事件保留为不可达，缺失目标整条跳过并提示。删除后重新创建必须由配置器分配新的操作 ID，同一名字不表示同一实例。

初始 AG 默认 10000，接受非负有限值，包括 0 和超过满条。创建不会推进时间、重置既有单位 AG 或伪造零 AV 插队批次。先创建后作用可以命中新实例；先作用尚未创建的实例得到 missing-target。自然离队后的实例不再属于运行目标；历史记录仍自带名称、图标和锚点。

### 统一排序

先比较精确剩余 AV。零 AG 同时为零时沿用新批次优先与批内顺序：连续单目标后拉先动、单次群体按操作前队列次序、有效提前再次作用于零 AG 时刷新，0% 不刷新。自然平局最终比较注册序号。

初始 Actor 注册顺序由原有友方优先、阵营内 position、稳定 ID 排序产生；所有动态参与者随后按创建操作实际执行顺序追加，与 Actor/ScheduledEvent 类型无关。因此自然平局中新敌人、新召唤物和新倒计时均排在既有参与者之后。调整创建顺序可以调整自然平局结果，但不改变实例身份。机器精度容差仅用于时间推进减法残差，不用于比较 AV。

### 生命周期、窗口与失败提交

```text
Actor:
  推进到队首 → 快照既有速度实例 → 行动前有序操作
  → turns + 1 / 满 AG / 回到待行动队列 → 动作后有序操作
  → 仅递减快照内有限回合状态 → 校验 → 达次数上限则离队

ScheduledEvent:
  推进到队首 → 从待行动队列排除触发者
  → 移除与该实例关联的全部速度状态并校验
  → 触发节点单一有序列表 → 触发者离队
```

Actor 的最后一次行动也完整执行动作后窗口，之后才离队；不因提前或立即行动产生额外回合模型。两个窗口内新添加的有限状态不在同一回合递减；到期不再次重置 AG 或插队序号。

ScheduledEvent 不产生自然回合、不递减任何 Actor 的回合状态。速度到期在用户操作之前校验，后续“救援”加速不能掩盖已经非法的到期速度。触发者自身的提前/延后得到 active-target 提示，不建立第二次触发。

每个操作在克隆状态上提交；一条群体速度添加与其自动倒计时作为一个操作原子提交。节点整体也只有完整成功后才追加记录/快照；失败时输入与前序结果不受修改，不发布半个回合。非法结构/重复身份/已知非法倒计时目标会拒绝计划；尚未创建或已经离队的目标在运行时整条跳过并诊断。

### 速度持续与倒计时

有限/无限持续使用 `{kind:'turns', turns:number|null}`，不再用旧 turns 字段或大数哨兵。倒计时持续使用 `{kind:'countdown', name, speed}`；操作为每个当时有效 Actor 创建独立速度实例，但只创建一个 ScheduledEvent。运行实例 lifetime 明确区分 remainingTurns 与倒计时 participantId。

自动倒计时调用与普通 `spawnParticipant` 相同的内部创建函数，而非另一套调度器。源操作删除/修改后完整重算，旧速度实例和旧倒计时均不会留在运行状态；后续触发锚点保持身份或成为不可达。若某个受影响 Actor 提前离队，其速度实例随 Actor 消失，但已创建倒计时仍可触发用户配置的节点操作，不自动取消战斗事件。

普通 Actor 都可接受通用效果；阵营目标只取当前运行的 Actor。倒计时只能通过显式 singleton 接受 advance/delay，不能与其他目标混选，不能接受 immediatelyAct 或 addSpeedModifier。资格规则由验证器、操作执行器和目标选择器共用。

`maxActions` 改为 `maxNodes`，Actor 行动与事件触发均消耗预算。默认 60 节点/600 AV，硬上限 500 节点/100000 AV；completedActions 只数 Actor，completedNodes 数全部节点。队列自然耗尽优先报告 empty，避免有限实例全部离队后仍报告预算耗尽。仅事件的零 AV 创建链也受到节点预算保护。

## D. 重构策略比较

| 方案 | 收益与问题 | 结论 |
| --- | --- | --- |
| 1. 旧引擎渐进扩展 | 改动较小，但固定 UnitState 与无条件重入队需不断增加类型条件；目标/期限/快照耦合继续扩大 | 不采用 |
| 2. 重组调度核心，保留数学及排序语义 | 可以消除固定队伍/生命周期假设，同时用既有确定性案例保护已确认机制；迁移范围明确 | 本轮推荐并已实施 |
| 3. 完整重写数学和引擎内部 | 抽象自由，但重新发明零 AV 批次和精度策略扩大回归风险，对当前需求收益不足 | 不采用 |

风险集中在接口迁移、最后一次行动的结算时机、动态身份、自然平局与 UI 目标时点。采用显式阶段、潜在身份查重、共享规则和真实状态预览控制风险。不保留旧引擎、长期兼容 Adapter 或临时研究原型；数学实现迁入 queue.ts，旧 engine.ts 调度被替换。

公共内部 API 有意不向后兼容：units → actors、unitId/unitIds → participantId/participantIds、maxActions → maxNodes、ActionRecord → NodeRecord、速度 turns/remainingTurns → duration/lifetime。所有仓库内排轴调用方和相关夹具已迁移。服务器角色选项与数据生成接口未改变。

## E. 本轮实际改动与 Inspector 适配

### 主要改动

- 引擎目录：types、engine、effect-config、presentation、presets、character-selection；新增 queue、validation、targeting、operations。
- 组件目录：ActionPlanner、ActionCard、EffectEditor、EffectCard、TargetGrid；角色槽位/搜索器和共享卡片实现未重构。
- 测试：迁移/整合既有相关单测，新增 participants 与 inspector 两个组合测试文件；清理相关 e2e 易变布局断言。
- 双语消息：节点预算、一次性事件、倒计时持续、创建操作与新诊断；删除旧解除兼容消息。
- 文档：本报告及 docs/README.md 导航。

已通过确定性案例验证：动态创建、有限行动离队、纯事件初始队列、继续在新 Actor/事件锚点配置操作、群体关联倒计时、到期先于节点效果、非法目标、零 AV 预算及稳定身份。不是仅有接口草案。

### 现有界面行为

NodeRecord 和 QueueEntry 直接携带名称、kind、图标及锚点，ActionCard 不再反查初始队伍，ScheduledEvent 显示一次性事件信息而不显示普通回合数。两种视图与完成节点游标使用同一个锚点函数。速度明细区分回合期限和倒计时期限。

EffectEditor 对 Actor 分两个窗口，对开始/触发节点只显示一个列表。创建配置和倒计时速度配置可以展示、排序、删除；本轮不开放其参数编辑，明确禁用，避免旧表单改写成普通效果。已有四种效果继续编辑，有限/无限持续表单转换到新 duration 接口。

`previewOperationState` 读取真实 beforeEffects/startState，复用操作执行器，只重放草稿之前的操作；动作后预览先执行行动前操作，再准备下一次自然行动条。因此同节点先创建的 Actor 可出现在之后的目标选择中；每张群体操作卡的目标也按其操作位置解析，不能从“未来定义目录”反推当前目标。没有实际记录的超预算/不可达锚点不伪造 beforeEffects，仅提供当前可知目标身份。

TargetGrid 接收通用 ParticipantInfo，并按共享资格规则禁用非法候选；已选非法候选仍可取消。全选和预设只选择 Actor。目录用于历史/孤立标签，与当前可选择目标分开。

### 后续拆分判断

EffectEditor 适合继续拆成操作列表协调器、效果草稿表单、参与者创建表单和预设区域，但本轮没有为未完成 UI 提前建立空壳组件。两种入口最终都提交同一 EffectOperation[]，开始/触发节点按列表顺序，Actor 节点按各窗口内顺序。阶段变更追加到目标窗口，组内排序不跨窗口。

通用 Target Picker 已有类型和资格基础；下一轮需要加入动态类别分组、清晰的实例区分以及倒计时配置表单。现有页面仍仅允许四个真实初始角色，不提供手动敌人/召唤物/忆灵创建入口、倒计时创建入口、方案加载或导入。这些新能力当前通过纯 TypeScript 计划接口配置和测试验证；没有临时研究代码。

## F. 后续开发阶段

1. **Inspector 创建能力**：提取统一操作列表协调器，新增“添加效果 / 添加行动单位”入口和 Actor/ScheduledEvent 创建表单。采用现有派生身份、默认满 AG、有限次数、类型与阶段规则；创建源操作的新建分配新 ID，编辑保留 ID。
2. **倒计时持续与目标体验**：速度表单增加回合/倒计时选项，直接使用已实现的 duration.countdown；群体效果只创建一个倒计时。完善实例类别、同名区分、参数编辑与触发节点信息；复用同一队列及操作列表。
3. **完整交互验收**：以新参与者创建 → 时间线/队列选择 → 节点继续配置 → 修改/删除源配置为端到端路径，覆盖两种语言、键盘、缺图和窄屏。通过稳定交互后再补充必要测试，不扩展完整技能/伤害系统。

统一调度、动态 Actor、有限次数、ScheduledEvent 和速度关联倒计时的基础已在本轮完成，下一轮无需再维护原型或迁移旧引擎。

## G. 验证结果

以下仅列实际结果；静态渲染不代表浏览器交互或视觉验收。

| 检查 | 结果 |
| --- | --- |
| 旧测试清理后的定向 Vitest | 7 个文件、43 项通过 |
| 新引擎与适配后的定向 Vitest | 9 个文件、45 项通过 |
| pnpm check | 通过：最终源码 Svelte 0 错误、0 警告，542 条双语消息、scripts/API 检查通过 |
| 定向 ESLint | 已通过 |
| 修改文件 Prettier / git diff --check | 通过；Markdown 按仓库约定手工维护，不纳入 Prettier |
| pnpm build | 最终源码通过，adapter-static 写入 build；中英文排轴页面均生成 |
| Playwright | 预检 executablePath 对应 chromium-1234，exists=false；未启动浏览器，不声称交互/视觉已通过 |
| 两个上游 Git 状态 | 开始和结束工作区均为空；TurnBasedGameData main、StarRailRes master 均未改变 |

本轮最初类型检查发现 UI 对未收窄 ScheduledEvent 访问 camp 及测试夹具联合类型问题，已修正并通过后续检查。合并速度到期测试时曾误把其他单位已经完成的行动也排除；修正为独立 Actor 夹具，继续保护失败节点不发布，未删除有效机制断言。最终审查补充了严格字符串枚举校验和离队身份不可复用保护；相关断言包含在已有组合用例中，复查仍为 45 项通过。

构建前置 data:ensure 和 assets:ensure 命中既有缓存，relic-score:v2:benchmarks:validate 通过，没有修改生成管线或上游。

没有运行全站单测、全站浏览器回归、远端 Preview 或 Production 部署。没有更改数据解析或资源管线，不需要新增上游数据验证结论。后续有新配置交互时再扩大浏览器验收。

### 浏览器人工验收步骤

准备本项目当前 Playwright 所需 Chromium 后，复用本地构建：

```powershell
$env:PLAYWRIGHT_REUSE_BUILD = '1'
pnpm exec playwright test tests/e2e/action-planner.spec.ts --project=desktop-chromium --project=mobile-chromium --reporter=line --workers=2
```

确认已有角色选择、两个窗口的 125/110 AV 差异、草稿取消与提交、组内排序、速度状态展开、顺序变化后的稳定选中/游标、双语和窄屏无溢出。动态创建/倒计时输入表单尚未提供，不能将其交互写成已验收；其基础 API 的数值与静态投影由上述定向单测保护。
