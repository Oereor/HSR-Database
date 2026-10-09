# 技能预览与培养目标分离及第二轮 UI 优化

日期：2026-10-09。网站仓库：HSR-Database；分支：develop。

## 1. Executive Summary

已实现第二轮规格中的技能状态分离、永久向下修正、培养滑块图标与动态上限、只读行迹分栏，以及升级费用说明精简。原技能组负责 Preview，养成目标负责 Training，两者通过不同状态和回调更新。

工程修改及定向静态检查完成，**真实浏览器交互与视觉验收尚未完成**。独立纯函数检查、与 HEAD 的费用数值对比、相关组件编译、领域语义类型检查、消息编译、目标 lint/格式检查通过。Vitest 在断言启动前被缓存 rename EPERM 阻断，新构建被依赖 realpath EPERM 阻断；全项目 Svelte 检查未通过。未将这些路径计为验收通过。

## 2. 原 Preview/Training 耦合

原 DetailPage 将原技能组与培养滑块接到同一个 Display Level 回调，并把值写入 CharacterTrainingTarget.displayLevels。费用解析函数再按正常付费上限和晋阶截断。因此培养控件能够选择仅用于预览的等级，且晋阶下降没有修改原目标，升晋阶后会恢复较高计费等级。

本轮明确取消这条耦合链路。原技能组的完整预览、倍率联动、联合名称、隐藏技能规则与特殊效果入口保留。

## 3. 新状态模型与数据流

DetailPage 独立拥有：

- `previewLevels: Record<canonical key, number>`：供原技能组读取。
- `pendingPreviewLevels: Record<progression ID, number>`：当前 Profile 分片到达前的预览修改。
- `characterTarget.trainingLevels`：唯一的实际培养等级映射。
- `characterTarget.activeTraceIds`：现有 DAG 目标。
- `trainingLevel`：Hero 与养成区域共享的角色/光锥等级。

预览入口只修改 Preview 或等待中的 Preview，不触及培养目标；培养入口使用 canonical key 校验当前合法付费等级后，仅修改 Training。展示投影通过显式 legacy `$:` 输入依赖重新计算，没有第二份局部培养状态、历史培养意图或全局 Store。

原技能组件的类型改为 SkillPreviewControl，属性改为 previewControls/previewControl，回调改为 onPreviewLevelChange；数据标识改为 data-preview-key。养成回调改为 onSkillTrainingLevelChange，参数为 canonical key 和真实等级。滑块索引仅用于映射 DOM 值。

## 4. 永久向下修正

`reconcileCharacterLevel()` 验证原目标，推导新晋阶后，对每个实际培养值调用纯函数 `reconcileSkillTrainingLevel()`。后者从当前晋阶合法集合中选取不高于原值的最高配置等级，返回值真实写回 trainingLevels。

例如 1510 共享节点的培养等级 10，在 Lv.60/晋阶4变为6；提高至 Lv.80/晋阶6后仍为6，只有主动调整培养滑块才会提高。Preview=12 始终保留。合法的较低培养值不被抬高，输入目标不被修改。原 DAG 的后继取消逻辑没有改动，升级不恢复已取消节点。

## 5. SkillTree 合法等级与契约

新增 `allowedSkillTrainingLevels(node, promotion)`，从真实 node.steps 按 requiredPromotion 筛选并返回 level 集合。控件不会通过 `1..max` 自行合成可选值。当前领域仍保留原 SkillTree 配置完整性校验；本轮没有扩展或改变分片 schema。

CharacterTrainingTarget 的 displayLevels 字段替换为 trainingLevels，不保留兼容别名。遗漏技能项继续按 Lv.1 处理；初始化工厂显式填齐全部付费节点。`resolveSkillTraining(node, trainingLevel, promotion)` 拒绝非法整数、未配置等级和超晋阶等级；计算入口拒绝非当前 Profile 的技能 key。

ResolvedSkillTraining 保留 key、paidMaxLevel、requiredPromotion 和 trainingLevel，移除旧 displayLevel/reasons；CharacterTrainingResult 移除旧 display-training-difference diagnostics。生产调用方及直接受影响的测试均已同步。绑定的 `displayLevels` 仍表示真实公开预览范围，未改名或重生成。

## 6. 共享 progression

Preview 通过真实公开 skill/source binding 解析 canonical key。分片加载前，同一公开 progression ID 的控件读取同一等待映射；加载后转为 canonical Preview。姬子·启行天赋/助战技继续同步预览，养成区域只生成一个 Training 控件。

培养投影独立遍历当前 Profile 的付费节点和公开卡片绑定，以 canonical key 去重。费用仍按节点累加一次，不按可展示技能重复支付。丹恒·饮月、忆灵技能及 Base/Enhanced 身份使用相同机制，没有按名称猜测或新增角色特例。

## 7. 培养滑块图标与上限

培养控件读取实际 trainingLevel 和当前晋阶合法等级集合，range 索引映射到真实等级，ARIA 显示真实当前值和上下限。移除培养控件中的晋阶要求 Tag、预览截断提示和 data-display-level；原技能组仍保留说明预览要求的 Tag。

每条培养滑块左侧显示 32px 图标，通过现有卡片 iconKey、getCharacterDetailIconUrl、AssetImage 和 ImageFallback 渲染。共享节点选择卡片遍历顺序中首个明确图标，不添加重复图标。联合名称和同分类多 progression 的真实变体名称保留。

技能 Grid 保持两栏，640px 以下单栏；LevelSlider 的全站样式和基础组件没有修改。DOM ID 继续使用独立 training-skill canonical 前缀。

## 8. 行迹摘要分组与布局

先复用原摘要展示顺序，再按当前 Profile 的已激活付费 PointID 过滤。TrainingTraceSummary 根据真实 Trace.type 划分 ability/stat；该类型在数据处理层由真实 PointType 映射，摘要没有根据名称、图标或视觉位置推断。

768px 起采用约1:2两栏：额外能力纵向排列，32px 图标、稍大加粗名称；属性加成为紧凑自适应 Grid，24px 图标。右栏仅有淡垂直分隔线，没有大片差异底色。767px及以下按能力、属性纵向堆叠并移除垂直线。名称可换行，各容器 min-width 为0。

保留摘要总数、PointID，并增加组/type标识。两组均空时显示整体空状态，单组为空时显示组内空状态。条目为普通 li，仅图标与名称，无按钮、菜单、点击事件或 pointer。三月七共享前置1001201按 stat展示，免费固定节点仍排除；原行迹 Section 是唯一 Toggle 入口。

## 9. 升级费用简化与费用来源

删除 Required/Supplied/Overflow EXP 指标、贪心说明、其 DOM 元数据和局部样式，不留说明占位。底层 requiredExp/suppliedExp/overflowExp/expItems/strategy 与费用计算保持。

分类来源仍为：升级 mergeCosts(expItemCost, expCreditCost)，晋阶 promotionCost，技能/行迹 mergeCosts(skillCost, traceCost)，总览直接引用 totalCost。经验材料与信用点继续使用 MaterialCostList Cell。

## 10. 角色/光锥复用与材料接口

光锥共享升级费用精简，仍仅含等级目标、升级、晋阶和总览，不引入角色技能或行迹状态。角色与光锥 Section 顺序、Hero 等级双向同步和晋阶低边界语义保留。

MaterialCostList、TrainingExpenseGroup、Cost、MaterialCatalog/MaterialView 及材料资产/排序/只读语义没有修改。**Slice C 所需 Material 展示接口没有受到影响。** 未新增 Item 路由、Modal、描述、获取来源、库存、合成或兑换。

## 11. 双语、Player 与生命周期

新增额外能力、属性加成及组内空状态三条 Paraglide 中英文消息。现有旧消息保留为历史可用 key，但 EXP/截断说明不再由培养区域调用。

首次 ready 的培养目标由默认工厂和当前角色等级初始化，等待时的 Preview 独立通过公开 binding 转为 canonical 值，绝不写入 Training。初始化先构造两个完整结果再提交，避免半初始化状态。

同角色、同 Profile 的语言重载及失败重试保留已有 Preview/Training；实体、Profile或静态/玩家模式切换重建对应状态，Profile切换保留角色等级。沿用请求版本检查拒绝过期结果，不持久化历史 Profile 意图。

上述重载保留针对同一DetailPage实例。站点现有语言切换链接使用data-sveltekit-reload，会创建新页面实例并沿用首次打开默认值；本轮未改动该入口，也未引入跨整页刷新持久化。

Player uid门控、真实 skillTree 解析、真实晋阶、装备与 API/cache未改。Player模式不接入模拟 Preview/Training 控件；原技能组件的 player分支保持真实等级和只读行为。

## 12. 已执行检查

| 检查 | 实际结果 |
| --- | --- |
| Site Messages验证/编译 | 445条、2个locale，通过 |
| 独立真实数据纯函数检查 | 108套Profile、456个付费技能节点，覆盖全部晋阶阶段；合法集合、canonical投影、永久修正、Preview独立、trace类型与分项合并通过 |
| 与HEAD费用数值对比 | 756个合法角色目标；EXP、信用点、晋阶/技能/行迹成本、步骤与总览逐项一致 |
| 光锥纯函数检查 | 20000的Lv.1/20/21/80分类合并一致，无角色分类 |
| 目标领域语义类型检查 | 按仓库ESNext/Bundler严格配置，0诊断 |
| 6个相关Svelte组件client/server编译 | 12次成功、0警告 |
| 最终小改动复查 | DetailPage/SkillCardPanel另4次编译、0警告；5个测试文件TS语法转译通过，不等同测试语义或断言执行 |
| 改动源码/测试ESLint与格式 | 通过；最终小改动另行定向复查 |
| git diff --check与范围检查 | 通过 |

独立检查通过 Node/tsx 直接读取真实生成数据、调用纯函数并使用 Node assert。HEAD对比通过只读 git show取得原计算实现，在内存中转译并对相同合法付费目标比较费用字段。它们没有启动Vitest、DOM或浏览器，不能替代真实交互或视觉验收。

## 13. 失败与未执行验证

定向Vitest实际命令：

```powershell
node node_modules/vitest/vitest.mjs run tests/unit/training-core.test.ts tests/unit/training-data.test.ts tests/unit/training-detail-view.test.ts tests/unit/training-presentation.test.ts tests/unit/player-character-components.test.ts
```

5个suite在Vite SSR缓存临时文件rename时遇到EPERM，0项断言执行。按AGENTS停止规则未重试或修改缓存配置绕过。

全项目Svelte检查实际命令为 `node node_modules/svelte-check/bin/svelte-check --tsconfig ./tsconfig.json --output machine`。结果787 errors、0 warnings、61个问题文件。未报告本轮6个组件及3个领域源码诊断；错误包含Vite插件类型、Playwright/Vitest导出解析和相关测试隐式any。新增浏览器回调也受缺失依赖类型的影响；未做整仓基线归因，不将所有错误一概宣称为已证明的历史失败。日志位于忽略的 `data/audit/training-polish-02-svelte-check.log`，没有为本轮清理配置或无关测试。

新构建实际命令为 `node node_modules/vite/bin/vite.js build`。SSR转换906个模块，随后在依赖realpath EPERM处失败，并出现Tailwind原生依赖加载诊断。日志位于忽略的 `data/audit/training-polish-02-build.log`。没有成功的新构建，因此未启动Playwright、本地Preview或截图，0项浏览器测试执行；没有使用旧构建代替。

尚未执行的测试代码覆盖：原技能描述与培养费用独立、1510共享预览、培养上限/永久降低、鼠标与键盘、图标加载失败fallback、两类摘要位置/数量、延迟加载与重试、Profile/角色路由切换、双语和Desktop/Mobile。Player组件回归也未执行。上述缺项仍需要在正常环境验收。

## 14. 人工验收与复验命令

正常环境先运行定向单元检查，再构建新Preview。若已有旧Preview，先正常停止旧进程，避免Playwright复用旧服务器。

```powershell
pnpm exec vitest run tests/unit/training-core.test.ts tests/unit/training-data.test.ts tests/unit/training-detail-view.test.ts tests/unit/training-presentation.test.ts tests/unit/player-character-components.test.ts
pnpm check
pnpm build
$env:PLAYWRIGHT_REUSE_BUILD='1'
pnpm exec playwright test tests/e2e/training-detail.spec.ts --project=desktop-chromium --project=mobile-chromium --workers=2 --retries=0 --reporter=line
pnpm exec playwright test tests/e2e/player-character.spec.ts --grep 'reuses the Player cache' --project=desktop-chromium --project=mobile-chromium --workers=2 --retries=0 --reporter=line
```

人工重点：

1. 三月七预览到12：培养等级和费用不变；修改培养目标：原描述、倍率和Preview不变。
2. Lv.80培养10降至Lv.60后变6，最大值6；再升80，最大值10但当前仍6。确认DOM/ARIA、拖动、方向键/Home/End及焦点。
3. 1510天赋/助战技预览仍双向同步，唯一培养滑块独立；丹恒·饮月共享变体、记忆开拓者忆灵及固定节点正确。
4. 三月七1001201位于属性组，取消后摘要和费用即时更新，后继补齐、降级取消不回归；摘要无交互。
5. Desktop能力左/属性右，Mobile纵向堆叠；中英文长名称和fallback不导致水平溢出。
6. 升级分类仅显示经验材料和信用点，EXP和说明全部消失；材料Cell外观、分项/总览去重正确。
7. 延迟加载期间编辑Preview，失败重试、1102切换及角色路由切换不会污染状态；真实Player保持只读且无养成Section。

## 15. 修改文件与交付边界

修改文件：

- `messages/zh-CN.json`
- `messages/en.json`
- `src/lib/domain/training/types.ts`
- `src/lib/domain/training/index.ts`
- `src/lib/domain/training/detail-view.ts`
- `src/lib/components/shared/DetailPage.svelte`
- `src/lib/components/character/SkillCardPanel.svelte`
- `src/lib/components/character/SkillProgressionPanel.svelte`
- `src/lib/components/training/TrainingSection.svelte`
- `src/lib/components/training/TrainingTargetSummary.svelte`
- `src/lib/components/training/TrainingTraceSummary.svelte`
- `tests/unit/training-core.test.ts`
- `tests/unit/training-data.test.ts`
- `tests/unit/training-detail-view.test.ts`
- `tests/unit/training-presentation.test.ts`
- `tests/e2e/training-detail.spec.ts`
- 本报告。

开始时网站与两份上游工作区均干净。只读上游HEAD保持：TurnBasedGameData `724b139d8c9c32d12552eb95745a4fee72bfe48b`，StarRailRes `dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487`；最终status仍为空。

未修改MaterialCostList、LevelSlider、TraceCardPanel、EXP换算、费用累加、DAG操作、原技能布局、上游数据或资产处理。未commit、push或部署，等待本地人工验收。
