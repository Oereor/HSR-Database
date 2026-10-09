# Progression Calculator Slice B — 经验费用与详情页集成

日期：2026-10-09。实施仓库：HSR-Database/develop。

## 1. Executive Summary

Slice B 的计算与 UI 代码已实现，可供本地人工验收。B1 在开始 UI 接线前通过31项定向测试；最终11个测试文件、92项定向测试通过，另通过既有真实属性测试1项。TypeScript/Svelte、目标文件格式与lint、数据同步、完整语义验证、资产验证及本地生产构建通过。

**浏览器验收未完成。** Playwright 在启动本地 preview 时遇到 `listen EPERM 127.0.0.1:4173`，尚未进入浏览器测试。遵循AGENTS外部工具失败停止规则，没有申请绕过、尝试其他服务器或远程部署。不能把静态渲染测试称为浏览器交互或视觉验收；第16、17节给出实际执行记录与剩余检查。

实现沿用Slice A领域、loader、成本分片、材料投影和图标资产。UI只负责编辑静态目标与展示结果，未实现Item详情系统。未commit、push、部署；两份上游保持干净且HEAD不变。

## 2. 实际修改范围与数据基线

- 新增总EXP贪心策略、角色/光锥经验信用点与总Cost；原费用分项及totalKnownCost语义保留。
- 详情页统一目标状态；现有等级/技能控件联动、共享滑块、行迹Toggle和结果Section。
- 静态属性晋阶边界从较高阶段改为覆盖目标等级的较低阶段。
- 双语Site Messages、规范文档、定向测试及本报告。

原始基线保持：98个角色形态、108套Profile、170个光锥、1,970个升级节点、140个核心材料、67个多技能关联节点、169个共享前置节点。数量为当前锁定数据审计事实，不作为未来固定数量约束。

上游HEAD：TurnBasedGameData `724b139d8c9c32d12552eb95745a4fee72bfe48b`；StarRailRes `dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487`。

## 3. 贪心EXP换算与公开接口

由 `src/lib/domain/training/index.ts` 统一导出新增接口：

```ts
convertTrainingExp(requiredExp, items): ExpConversion
calculateTrainingExpCosts(kind, shared, requiredExp): TrainingExpCosts
TRAINING_CREDIT_ITEM_ID // '2'
```

`kind`为`character | light-cone`。道具ItemID与EXP来自Shared Data，按EXP降序、相同EXP按数值ItemID排序；非最低档floor，最低档ceil。仅对从Lv.1到目标的总Required EXP换算一次，不按晋阶边界分别投料。零需求输出空道具Cost、空信用点Cost和零溢出。

`ExpConversion`含 `strategy='descending-exp-greedy'`、requiredExp、suppliedExp、overflowExp、expItemCost、expItems；逐道具记录包含itemId、exp、count和suppliedExp。TrainingExpCosts增加expCreditCost。

验证参数、道具唯一身份、正整数EXP、安全整数数量/乘积/累加与Supplied ≥ Required。空道具配置被拒绝。独立纯函数不修改原配置。

## 4. 信用点与真实结果

角色：实际Supplied EXP除以配置characterExpCreditDivisor。当前除数10；不能整除返回`TrainingError.code='non-integer-exp-credit'`，不猜测舍入。UI为该错误提供独立双语说明。

光锥：Σ(所选道具数量 × 原配置creditCost)，不是Required EXP / 2。所有经验信用点聚合到ItemID 2。

| 目标 | Required EXP | Supplied EXP | Overflow EXP | EXP信用点 | 晋阶信用点 | 满目标总信用点 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 三月七Lv.80，全付费技能/行迹 | 5,797,920 | 5,798,000 | 80 | 579,800 | 246,400 | 3,226,200 |
| 希儿Lv.80，单Profile全付费技能/行迹 | 5,797,920 | 5,798,000 | 80 | 579,800 | 308,000 | 3,887,800 |
| 三星光锥20000 Lv.80 | 597,440 | 597,500 | 60 | 298,750 | 231,000 | 529,750 |
| 四星光锥21000 Lv.80 | 796,590 | 797,000 | 410 | 398,500 | 308,000 | 706,500 |
| 五星光锥23000 Lv.80 | 995,700 | 996,000 | 300 | 498,000 | 385,000 | 883,000 |

角色组合：213×289（20,000 EXP）、212×3（5,000 EXP）、211×3（1,000 EXP）。光锥组合依次为223/222/221：99/1/3、132/2/2、165/2/4。这些ID为真实运行结果，算法不硬编码它们。

## 5. 结果契约与调用示例

既有 `calculateCharacterTrainingTarget(data, shared, target)` 与光锥入口签名不变。

- requiredExp、promotionCost、skillCost、traceCost、steps、target、skills与技能diagnostics仍保留。
- totalKnownCost继续仅聚合原始晋阶/技能/行迹费用。
- 新增expItemCost、expCreditCost、suppliedExp、overflowExp、expItems、strategy。
- totalCost = totalKnownCost + expItemCost + expCreditCost；信用点、经验道具各合并一次。
- precision.requiredExp/knownCosts仍为exact-from-configuration；经验道具和信用点为exact-under-greedy-strategy。

```ts
import { createTrainingLoader } from '$lib/data/training';
import {
  createDefaultCharacterTrainingTarget,
  calculateCharacterTrainingTarget,
  reconcileCharacterLevel
} from '$lib/domain/training/index';

const loader = createTrainingLoader(fetch);
const [data, shared, materials] = await Promise.all([
  loader.loadCharacter('1510'),
  loader.loadShared(),
  loader.loadMaterials(locale)
]);
let target = createDefaultCharacterTrainingTarget(data, 0);
target = {
  ...target,
  displayLevels: { ...target.displayLevels, '1510:0:1510004': 12 }
};
target = reconcileCharacterLevel(data, target, 60);
const result = calculateCharacterTrainingTarget(data, shared, target);
// Display=12，Training=6；材料总览消费result.totalCost。
// 使用materials按ItemID取名称、rarity、iconKey。
```

精度为确定产品策略内的精确结果，不代表游戏所有道具组合、库存、返还或逐次升级操作。相应假设在UI正常显示。

## 6. Character Training Target状态管理

DetailPage拥有characterTarget与统一trainingLevel；下层通过显式props及回调读取/更新，不各自持有另一份付费progression目标。

角色初次载入使用createDefaultCharacterTrainingTarget，最高等级、正常付费技能上限、全部合法付费行迹均由真实配置生成。等级更新调用reconcileCharacterLevel；技能Display更新按canonical key替换一项；行迹更新使用DAG接口。

加载前用按PointID索引的pendingDisplayLevels保存当前Profile的用户覆盖，等级始终在上层；成本数据到达后将覆盖转换为本Profile canonical key，再按当前等级修正行迹。这些暂存覆盖不是第二套计费状态。

切换base/enhanced保留角色等级，清空原Profile技能/行迹及加载前覆盖，基于新Profile工厂重置，再修正合法性。切回同样重置。未跨Profile求和，未持久化。

## 7. 晋阶边界属性修正

normalizeStatProgression保留原MaxLevel作为包含端点；后续区间从前一MaxLevel+1开始。运行时getPromotionAtLevel查找包含目标等级的区间，getBaseStatsAtLevel复用同一选择，成长公式仍为base + perLevel × (level−1)。

当前区间为1–20/21–30/31–40/41–50/51–60/61–70/71–80。静态晋阶Tag复用LevelSlider.leadingTag；training费用仍由原始链derivePromotion推导。

三月七Lv.20 HP由旧晋阶1的338.4调整为晋阶0的280.8（展示281）；Lv.21为345.6。光锥20000 Lv.20 HP从193.92调整为147.84（展示148），Lv.21为199.68。Lv.80等非边界值不变。

独立Python审计逐实体/语言/等级/属性与原始PromotionConfig比较，共128,640次比较通过；系数不变。数据manifest升为50，失效旧区间缓存；training schema1、视觉schema17保留。

## 8. 技能预览、计费与晋阶Tag

createSkillTrainingControls消费公开SkillID映射，生成控件视图；不按卡片数量生成成本。全部108套真实Profile的公开progression映射与付费默认上限通过定向审计。

技能仍使用既有availableLevels完整预览范围。当前角色晋阶限制只影响Training Level；Display Level不随降级改变，升级后可恢复Training Level。Tag直接读取resolveSkillTraining.requiredPromotion，在要求未满足时显示。预览超过Paid Max时按Paid Max的晋阶要求提示。

技能结果摘要按canonical节点去重，出现差异时展示预览与实际材料等级。星魂增级不参与计算。

## 9. 跨Category共享滑块

各SkillCard的控件读取同一canonical目标项，回调写回一次。联合标签由公开bindings的talent/assist类别组合确定，无AvatarID特例；普通共享节点沿用原类别标签。

仍保留现有卡片、变体与描述组件。共享PointID的两张卡片使用含category的独立slider DOM ID，避免重复ID及错误label关联。

## 10. 姬子·启行专项验收

- 151004（天赋）和151022（助战技）仍是两张Card，对应1510:0:1510004。
- 静态渲染验证两张卡片同一联合标签、完整1–15预览范围、Display12及晋阶要求Tag。
- 纯计算验证晋阶6按10级计费，晋阶4按6级计费；共享完整付费链信用点652,500，只收费一次。
- 151025/151026继续只是隐藏关联，公开绑定与列表规则未改，SpecialEffectDialog实现未改。

**双向拖动、两份描述实时更新、特殊效果弹窗与视觉结果尚未经过浏览器验收。** 已写相应E2E及保留原定向回归spec，待本地运行。

## 11. 行迹Toggle、DAG与视觉状态

TraceCardPanel仅为TrainingNode.kind=trace的节点创建TraceToggle。免费fixed/default节点不收费、不创建Toggle。原视觉分组、晋阶条件、文案与说明保持。

activateTrace补齐付费祖先，晋阶不足保持目标不变并显示双语提示；deactivateTrace取消全部后继；降低等级通过reconcile移除不合法节点及后继，提高等级不恢复取消状态。逻辑使用成本DAG，不使用视觉分组替代依赖。

原生button位于article内部，与内容和效果说明details是兄弟关系；aria-pressed、稳定名称及focus-visible支持键盘。效果说明具有独立交互层，不被整卡Toggle覆盖。未激活状态复用Player样式，通过独立data-training-state消费。

三月七1001201共享父节点、多前置/共享分支DAG由Slice A定向测试继续覆盖。静态渲染验证13个付费Toggle、active/inactive元数据；记忆开拓者8007501无Toggle。鼠标、触摸、Enter/Space及焦点可见性仍需浏览器确认。

## 12. 角色养成Section

正常可见，位于行迹与星魂之间，进入SectionNav。不在Hero内添加面板，不重复等级/技能/行迹输入，不新增折叠状态。

当前目标摘要包含等级、晋阶、唯一付费技能节点的Training Level与必要预览差异、付费行迹数量。EXP区展示Required、Supplied、非零Overflow、经验信用点及道具组合。总览消费totalCost，辅以晋阶/技能/行迹信用点分项。

加载与错误使用明确status，错误提供retry和机器可读data-training-error；不会显示假零材料。

## 13. 光锥养成Section

正常可见，位于故事之前，新增stats/training/story导航锚点。等级复用原基础属性滑块；level/rank query初始化语义保持，叠影滑块独立，不影响费用。

展示目标等级/晋阶、经验需求/投入/溢出、道具信用点、晋阶信用点及合并材料。无独立等级输入、叠影成本或多光锥汇总。

## 14. Material Catalog与图标

名称读取当前URL语言的Material Catalog；图标使用resolveMaterialIconAsset与现有AssetImage fallback。rarityFromCode/getRarityColor复用既有稀有度映射和颜色。

紧凑静态列表按信用点优先、稀有度降序、数值ItemID排序；名称/数量仍可在缺图时显示。材料没有button、anchor、Item详情入口或占位Modal。

本轮不变更材料源提取、目录范围或资产生成实现。140图标完整，现有资产验证通过，缺图展示由静态组件及既有resolver检查覆盖。

## 15. Player Info与加载性能

带uid查询的角色页面在客户端隐藏养成Section/导航，不请求训练数据，不启用模拟Toggle。真实属性、晋阶、技能和行迹仍来自Player API；原解析、请求、缓存与runtime未改。

共享组件保留playerSkillTree/playerLevel等明确只读契约。14项既有Player组件测试继续通过；真实浏览器模式尚待验收。

每个静态详情的首次加载代码路径仅请求当前entity shard、shared、当前locale materials三个JSON。loader复用其实例内缓存，Profile切换复用实体分片，失败请求可重试；版本/key检查丢弃过时响应。该请求数是代码路径及缓存单测结论，未取得浏览器网络测量。

| 产物/页面 | JSON字节 | gzip level9字节 |
| --- | ---: | ---: |
| 全部271份training/material JSON | 1,027,891 | 134,601 |
| 三月七首次三份JSON（中文） | 41,611 | 5,562 |
| 姬子·启行首次三份JSON（中文） | 42,030 | 5,592 |
| 光锥20000首次三份JSON（中文） | 34,174 | 4,883 |
| 详情路由客户端node4（含既有其他详情功能） | 153,769 | 43,478 |

训练与材料JSON内容/体积相对Slice A不变。gzip为逐文件level9测量，不代表服务器压缩配置；客户端node不是纯养成功能增量。本地最终build报告25.2秒；浏览器布局、实际传输与交互耗时未测。

## 16. 实际执行的定向验证

使用已安装Node24.19.0、pnpm11.9.0，无新依赖。沙箱tsx CLI的IPC限制沿用Slice A已确认情况，脚本使用`node --import tsx`入口。

- B1：training-exp/core/data共31项通过，之后才接入UI。
- 最终：11个文件92项通过：training-core、training-exp、training-stats、training-presentation、training-data、training-loaders、build-input-validation、robustness-invariants、shared-ui、trace-groups、player-character-components。
- 既有data.test.ts的真实晋阶属性测试通过1项；其余该大文件测试未运行。
- messages编译437条双语消息；scripts TypeScript、Svelte检查0 errors/0 warnings；目标TS/Svelte ESLint、目标文件Prettier通过。
- data sync与full semantic通过，仍有既有533条上游缺失TextHash警告。加强后的bundle验证另经定向unit检查。
- 独立原始属性审计128,640项比较通过；跨locale/实体关系完整。
- 资产验证：2,416文件、126,511,478字节；benchmark前置检查2,744/2,744。
- 最终本地Vite生产编译、prerender与adapter-static导出通过。271份JSON和140图标与build输出411份文件逐字节一致。
- manifest对比：schema49→50；仅536份双语角色/光锥详情的digest改变。训练分片、材料、目录、搜索、Player runtime及routePaths不变。routePaths共1,090项。
- 两份上游git status仍为空，HEAD与任务前相同。git diff --check通过。

浏览器尝试命令：

```sh
PLAYWRIGHT_REUSE_BUILD=1 pnpm exec playwright test tests/e2e/training-detail.spec.ts \
  --project=desktop-chromium --project=mobile-chromium --workers=2 --retries=0
```

结果：本地preview监听127.0.0.1:4173报EPERM；0项浏览器测试执行。没有继续尝试替代路径或部署。新spec含每项目7个场景，计划共14项，**不是通过数量**。相关既有character-detail/player-character/shared-detail回归断言已更新但浏览器spec未运行。

已解决的检查问题：旧synthetic fixture经验道具数组为空，补齐真实契约；prerender不能读取query，改为browser门控；两个共享slider DOM ID重复，按category区分。未弱化验证或用示例数据替代生产数据。

## 17. 未完成验收与已知限制

实现没有发现阻塞既定产品规则的原始配置缺口。非整数角色EXP扣费会明确拒绝，而不是四舍五入。

剩余工作为本地浏览器/视觉验收：

1. 姬子·启行两张卡片均显示联合标签；任意滑块双向同步，描述数值同步，隐藏技能与特殊效果弹窗正常。
2. 选择预览12，降低角色至60，滑块保留12、材料按6；升回80按10，取消行迹不恢复。
3. 三月七1001201取消两个大行迹分支；再次激活子节点补齐父节点；低晋阶失败不修改状态；Enter/Space及触摸操作正常。
4. 记忆开拓者免费特殊节点无Toggle，说明details仍可独立展开。
5. base/enhanced切换保留等级、重置技能/行迹；延迟响应不串Profile；加载失败重试保留编辑。
6. Lv.20/21至70/71的Tag、属性与材料一致；光锥level/rank query及叠影独立。
7. 桌面/移动端、zh-CN/en的Section Nav、锚点、材料图标/名称/数量、无水平溢出与焦点可见性。
8. Player Info实际模式无养成Section，真实滑块/行迹只读、属性正常。

在允许监听localhost的环境，复用本地build运行上述新spec，并运行相关既有spec。报告中的SSR和纯逻辑结果不能替代这些验收。

## 18. Slice C保留接口与注意事项

MaterialCatalog身份、名称、rarity、iconKey和图标resolver可供下一阶段使用；cost以ItemID和canonical progression key连接。当前MaterialCostList是纯静态呈现，不提前加入详情加载器或点击契约。

Item详情设计需单独确定，不从当前紧凑卡片推断Modal布局。未来扩充描述/来源时继续走独立领域与双语projection，不直接读取raw配置或完整TextMap。不要把静态贪心结果解释为玩家净库存消耗或EXP返还模拟。

## 19. 修改文件清单

- `AGENTS.md`
- `docs/architecture/localization-and-data-generation.md`
- `docs/investigations/material-training-slice-b-integration.md`
- `messages/en.json`
- `messages/zh-CN.json`
- `scripts/data/generated-artifacts.ts`
- `scripts/data/stats.ts`
- `scripts/data/sync.ts`
- `src/lib/components/character/SkillCardPanel.svelte`
- `src/lib/components/character/SkillProgressionPanel.svelte`
- `src/lib/components/character/TraceCardPanel.svelte`
- `src/lib/components/character/TraceToggle.svelte`
- `src/lib/components/shared/BaseStatsPanel.svelte`
- `src/lib/components/shared/DetailPage.svelte`
- `src/lib/components/shared/LevelSlider.svelte`
- `src/lib/components/training/MaterialCostList.svelte`
- `src/lib/components/training/TrainingSection.svelte`
- `src/lib/domain/stats.ts`
- `src/lib/domain/training/detail-view.ts`
- `src/lib/domain/training/exp.ts`
- `src/lib/domain/training/index.ts`
- `src/lib/domain/training/types.ts`
- `src/lib/domain/training/validation.ts`
- `src/lib/domain/types.ts`
- `src/styles/app.css`
- `tests/e2e/character-detail.spec.ts`
- `tests/e2e/player-character.spec.ts`
- `tests/e2e/shared-detail.spec.ts`
- `tests/e2e/training-detail.spec.ts`
- `tests/unit/build-input-validation.test.ts`
- `tests/unit/data.test.ts`
- `tests/unit/robustness-invariants.test.ts`
- `tests/unit/training-core.test.ts`
- `tests/unit/training-exp.test.ts`
- `tests/unit/training-presentation.test.ts`
- `tests/unit/training-stats.test.ts`

生成JSON、图标、messages编译输出、audit日志与build沿用gitignore，不提交。上述清单为交付时实际源代码、规范文档与测试变更。
