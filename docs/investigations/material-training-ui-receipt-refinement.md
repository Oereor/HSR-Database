# 养成计算面板消费清单式 UI 优化

日期：2026-10-09。仓库：HSR-Database；分支：develop。

## 1. Executive Summary

已按 `Character-Progression-Calculator/Progression-Panel-UI-Polish.md` 实现面板重排、共享目标滑块、canonical 技能去重、只读行迹摘要及完整费用分类。角色使用「培养目标 → 升级 → 晋阶 → 技能/行迹 → 材料消耗总览」；光锥隐藏角色专属内容。已验收的材料 Cell、原技能/行迹面板和费用/DAG 算法没有修改。

**工程实现已完成，真实浏览器和视觉验收仍待完成，不能宣布全部完成标准通过。** 消息编译、独立投影检查、组件编译及目标 lint/格式检查通过。Vitest 在执行断言前被缓存 rename EPERM 阻断；新本地构建被依赖 realpath EPERM 阻断，无法启动包含本轮修改的 Preview。全项目 Svelte 检查也未通过，详见第 10 节。

## 2. 原问题与新信息结构

原面板将静态等级、技能文本、行迹数量、EXP 指标和零散信用点说明平铺展示。经验材料区域未将经验信用点作为材料 Cell，晋阶与技能/行迹开销没有独立材料分类；目标区无法直接调整培养目标。

新结构：

1. 培养目标：等级滑块、角色 canonical 技能滑块、只读已激活付费行迹。
2. 升级消耗：紧凑 EXP 指标、经验材料及其信用点、一条简短换算说明。
3. 晋阶消耗：晋阶材料与信用点；无消耗时复用材料列表的空状态。
4. 技能/行迹消耗：角色专属的合并材料与信用点。
5. 材料消耗总览：原有 totalCost；通过加强分隔线、标题与留白区分合计。

没有收据纸张、锯齿、纹理、夸张虚线或新主题。移除原静态技能等级列表及独立信用点文字清单，避免与新控件和 Cell 重复。

## 3. 组件拆分与输入契约

- `TrainingSection`：保留 loading/error/retry 编排，负责组织目标和费用分类。
- `TrainingTargetSummary`：复用 LevelSlider 展示等级和技能目标，不拥有第二份养成状态。
- `TrainingTraceSummary`：只读图标/名称列表及空状态。
- `TrainingExpenseGroup`：复用 SectionHeading、MaterialCostList，组织分类、辅助信息和总览层次。

新增展示类型位于 `domain/training/detail-view.ts`：`TrainingLevelControl`、`TrainingSkillTarget`、`TrainingExpenseCosts`。新增三个纯展示投影函数，分别负责唯一技能控件、已激活行迹、费用分类。

TrainingSection 的内部 `profile/cards` props 替换为已经投影的 `skillTargets/activeTraces`；增加 `levelControl`、`onLevelChange`、`onSkillDisplayLevelChange`。唯一生产调用方 DetailPage 已同步接线。`result/catalog/state/errorCode/onRetry` 保持原含义。未修改 Cost Domain、loader、训练数据 schema、公共路由或 Player API。

## 4. 等级滑块与技能同步

DetailPage 继续拥有 `trainingLevel`、`characterTarget` 和加载前的技能预览覆盖。新等级滑块直接读取 trainingLevel，调用已有 `handleTrainingLevel()`；Hero 同样读取该值、调用该入口。因此角色晋阶、属性、费用、技能计费和行迹约束继续由原链路更新。

晋阶 Tag 使用已有 `staticPromotion`，即当前基础属性晋阶推导结果。Lv.20/21、Lv.60、Lv.80 的边界语义不变。

新技能投影复用 `createSkillTrainingControls()` 的 Display Level、晋阶要求和 canonical key，读取计算结果中的 Training Level；从真实公开 progression 取得全部 availableLevels。Map 以 canonical key 去重，按现有卡片遍历顺序生成控件。天赋/助战技使用原联合消息，同分类多 progression 使用真实变体名称消除歧义。

每个滑块通过 availableLevels 的派生索引展示预览等级，回调将索引换为真实等级，再调用原 `handleSkillDisplayLevel(pointId, level)`。该索引只属于滑块展示，不是另一份 Display/Training 目标。预览与计费不同时保留原简短差异提示和晋阶 Tag。

DOM ID 使用 `training-character-level-*`、`training-light-cone-level-*` 和 `training-skill-{canonicalKey}` 的独立前缀，与原 Hero/技能组 ID 分离。原 LevelSlider、SkillProgressionPanel、SkillCardPanel 均未修改。

## 5. 异步与 Profile 生命周期

按用户确认，加载中只显示状态，失败显示重试；ready 后再显示新目标控件及费用。原 Hero/技能组在等待期间仍可编辑，原 pendingDisplayLevels 与加载初始化逻辑继续保留这些修改。

DetailPage 的投影使用显式 `$:` 输入依赖；目标组件直接读取传入字段，技能按 canonical key、摘要按 PointID keyed 渲染。不存在互相复制两个目标的 effect，也没有首次挂载时冻结 props 的目标状态。

Profile 切换沿用原同步逻辑：保留等级，清除旧 Profile 技能/行迹目标并重新初始化。新投影只接受当前 Profile 的付费 key；异步请求版本检查未改动。之前修复的 TraceCardPanel 响应式集合保持原样。

## 6. 只读行迹摘要

`createTrainingTraceSummary()` 复用原 `groupTracesForDisplay()` 的展示顺序：各常规能力及其属性节点、特殊能力、独立属性节点。随后按当前 Profile 的 `kind === 'trace'` PointID 与规范化 activeTraceIds 过滤；不把视觉分组用于 DAG 操作。

摘要消费当前语言的真实 Trace 名称和 iconKey。条状列表只显示小图标和名称，不包含描述、晋阶、材料、效果或额外操作。沿用资产解析和 ImageFallback，缺图时有占位图标，不产生破图。

列表项为普通 `li`，没有 button、Toggle、取消入口或 pointer。原行迹 Section 仍是唯一操作位置。取消共享前置、补齐祖先和降级移除节点后，新的计算结果驱动摘要筛选，顺序不因激活数组顺序变化而重排；空列表显示双语空状态。

## 7. 费用事实来源与 MaterialCostList 保留

| 区域 | 来源 |
| --- | --- |
| 升级 | `mergeCosts(result.expItemCost, result.expCreditCost)` |
| 晋阶 | `result.promotionCost` |
| 技能/行迹 | `mergeCosts(result.skillCost, result.traceCost)`，仅角色 |
| 总览 | 直接引用 `result.totalCost` |

展示投影只调用已有 mergeCosts 合并分类，不重新实现 EXP、信用点或晋阶/技能/行迹计算。总览没有用 UI 分项重算替代领域结果。

EXP 的 required/supplied/非零 overflow 以紧凑、可换行的指标展示。经验信用点在升级材料列表中作为 ItemID 2 的 Cell；晋阶及技能/行迹信用点也分别在对应列表中。总览按已有结果去重，每种资源仅出现一次。

`MaterialCostList.svelte` 没有 diff：图标、名称、数量、稀有度、边框、背景、排列、信用点优先排序、缺图策略及纯展示语义全部保留。没有新增材料点击暗示或 Item UI。

## 8. 光锥、响应式与双语

光锥使用同一个 TrainingSection 和费用组件，仅保留等级目标、升级、晋阶与总览。等级回调仍写入 DetailPage.trainingLevel；level/rank query 初始化与叠影逻辑不变，叠影不参与费用。

新目标技能 Grid 宽屏两栏、640px 以下单栏；标签及 Tag 行允许换行。行迹摘要采用基于可用宽度的紧凑多栏 Grid，名称允许换行。费用材料容器使用原 MaterialCostList 的响应式能力。没有修改全局样式。

新增分类标题、行迹标题和空状态，以及调整后的目标/总览/策略文案进入中英文 Paraglide catalog；两语言参数和 key parity 检查及编译通过。

## 9. Section 顺序及 Player Info

角色 TrainingSection 仍位于装备推荐之后，无推荐时仍是资料末尾；SectionNav 顺序未改。光锥的外层 `stats → training → story` 顺序保留。

Player Info 的 uid 门控保持不变，真实模式不挂载 TrainingSection；Player API、缓存、真实属性、技能树和实际装备组件没有修改。原真实玩家组件没有接入任何新模拟回调。其浏览器回归仍需在正常环境运行。

## 10. 实际检查结果

| 检查 | 结果 |
| --- | --- |
| 双语 Site Messages 验证/编译 | 通过，442 条消息、2 个 locale |
| 独立纯展示投影检查 | 通过：108 套 Profile、456 个付费技能节点，无缺失/重复控件，保留真实默认及预览范围 |
| 费用一致性检查 | 通过：所有上述 Profile 的满养成分项与 totalCost 一致；角色/光锥 Lv.1/20/21/80 一致 |
| 三月七摘要筛选检查 | 通过：取消共享前置后剩余六个节点，原显示顺序保持 |
| 五个相关组件 client/server 编译 | 10 次成功，0 警告 |
| 展示投影及三个测试文件 TS 语法转译 | 通过；不等同于完整语义类型检查 |
| 目标源码/测试 ESLint、格式检查 | 通过 |
| 定向 Vitest | 2 个 suite 在缓存 rename EPERM 处失败，0 项断言执行 |
| Svelte 全项目检查 | 784 errors、0 warnings、61 个问题文件；失败 |
| 新本地 Vite build | SSR 阶段转换了 903 个模块，后续依赖 realpath EPERM；未完成构建 |
| Playwright 与视觉截图 | 新构建受阻，未启动浏览器，0 项执行 |

Vitest 命令：

```powershell
node node_modules/vitest/vitest.mjs run tests/unit/training-detail-view.test.ts tests/unit/training-presentation.test.ts
```

Vite SSR 缓存位于沙箱 Temp，`.tmp-*` 重命名为缓存文件时出现 EPERM。没有重试此验证路径。后续新断言同样尚未通过测试框架执行。

独立投影检查使用已安装的 tsx runtime，以只读真实生成数据直接调用展示及原领域函数、用 Node assert 检查不变量。该检查未启动 Vitest、DOM 或浏览器，不能替代交互验收。

全项目检查命令为 `node node_modules/svelte-check/bin/svelte-check --tsconfig ./tsconfig.json --output machine`。未报告本轮改动的组件或 `detail-view.ts` 诊断，但全项目存在 Vite 插件类型及测试中的类型导出/隐式 any 等错误。没有运行基线归因，也没有扩展修复范围或将整项检查写成通过。完整本地日志保存在忽略的 `data/audit/training-ui-svelte-check.log`。

新构建命令为 `node node_modules/vite/bin/vite.js build`。失败包含 SvelteKit internal/node exports、Vite module-runner 的 realpath EPERM，以及 Tailwind native dependency 加载错误。本地日志为 `data/audit/training-ui-build.log`。遵循 AGENTS.md，在明确环境阻断后停止这条验证路径，没有尝试绕过、部署、改配置或用旧 Preview 作为新 UI 验收。

## 11. 回归用例与未执行验收

新增 `training-detail-view.test.ts` 覆盖所有真实付费控件的 canonical 去重、默认/预览范围、联合标签与晋阶 clamp、Profile 身份、稳定行迹排序、免费固定节点排除、费用一致性和取消行迹后的费用变化。

展示 SSR 用例补充了分类顺序、唯一 label/DOM ID、各费用信用点 Cell、只读/空摘要、缺图 fallback 和光锥专属内容隐藏。原有效断言保留，没有删除无关 stale 测试或更新大型 baseline。

Playwright 用例更新了旧“整个养成 Section 无输入”假设，改为检查材料 Cell 仍无操作；原技能与新目标区域分开定位。新增/扩展：

- 角色目标与 Hero 双向等级同步、ArrowRight/Home/End、Lv.20/21 晋阶与零消耗、升级不恢复行迹。
- 姬子·启行两处原技能和唯一目标滑块三方同步，倍率更新、完整预览、计费 clamp 与费用。
- 三月七摘要随 DAG 取消/恢复刷新，摘要本身无操作及 pointer。
- 记忆开拓者六个付费技能控件、固定节点排除；Base/Enhanced 重建。
- 光锥目标/属性滑块同步、query、叠影独立、分类内容。
- 延迟加载、失败重试保留编辑、重复 DOM ID、导航、中英文和 Desktop/Mobile。

这些测试代码已完成，**Vitest/Playwright 断言没有实际运行**。本轮没有实际浏览器 hydration、鼠标拖动、三方滑块同步、焦点、材料/行迹 Grid 或窄屏视觉截图验收。

正常环境中的复验步骤：

```powershell
pnpm exec vitest run tests/unit/training-detail-view.test.ts tests/unit/training-presentation.test.ts
pnpm check
pnpm build
$env:PLAYWRIGHT_REUSE_BUILD='1'
pnpm exec playwright test tests/e2e/training-detail.spec.ts --project=desktop-chromium --project=mobile-chromium --workers=2 --retries=0 --reporter=line
pnpm exec playwright test tests/e2e/player-character.spec.ts --grep 'reuses the Player cache' --project=desktop-chromium --project=mobile-chromium --workers=2 --retries=0 --reporter=line
```

必须先成功完成新构建，并正常停止旧 Preview 进程，避免 reuseExistingServer 使用旧页面。人工重点检查目标滑块互相同步、技能描述/计费区别、只读摘要、分项信用点与总览、英文长标签、手机无横向溢出及真实 Player 模式。所有核心条件实际验收后，才能宣布 UI 专项全部完成。

## 12. 修改边界及文件清单

未修改上游、生成数据规则、EXP/费用/DAG 算法、MaterialCostList、LevelSlider、SkillCardPanel/SkillProgressionPanel、TraceCardPanel、全局 CSS 或 Player 组件。未实现 Item 详情、库存、合成、多角色规划，不清理无关 CI 技术债。

修改/新增：

- `messages/zh-CN.json`
- `messages/en.json`
- `src/lib/components/shared/DetailPage.svelte`
- `src/lib/components/training/TrainingSection.svelte`
- `src/lib/components/training/TrainingTargetSummary.svelte`
- `src/lib/components/training/TrainingTraceSummary.svelte`
- `src/lib/components/training/TrainingExpenseGroup.svelte`
- `src/lib/domain/training/detail-view.ts`
- `tests/unit/training-detail-view.test.ts`
- `tests/unit/training-presentation.test.ts`
- `tests/e2e/training-detail.spec.ts`
- `docs/investigations/material-training-ui-receipt-refinement.md`

已检查最终 diff/status，仅本轮范围。两份上游任务前后 status 为空，HEAD 不变：TurnBasedGameData `724b139d8c9c32d12552eb95745a4fee72bfe48b`；StarRailRes `dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487`。

未 commit、push 或部署。
