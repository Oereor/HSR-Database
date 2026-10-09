# Slice C：养成材料 Item 详情 Modal 实施报告

日期：2026-10-09（Asia/Shanghai）。仓库：HSR-Database；分支：develop。

## 1. Executive Summary

已实现有限养成材料的独立双语详情投影、按需加载与缓存、材料 Cell 点击入口及每页一个原生 ItemDetailModal。桌面使用图标/星级与文字双栏，移动端纵向排列，说明与背景直接排版。名称、图标及稀有度继续使用现有 Material Catalog 和共享组件。

工程接线、数据生成、独立生成产物校验、养成语义校验、定向源码类型检查和组件编译已通过。**Vitest 未执行断言，本地生产构建失败，浏览器及视觉验收尚未完成；不能声明所有完成标准均已通过。** 相关阻断及人工验收清单见第 10、11 节。

没有新增物品集合页、独立路由、API、数据库、依赖或资产映射；没有修改 Cost 算法、技能目标状态、行迹 DAG、EXP 换算或 Player Info。未 commit、push 或部署。

## 2. ItemConfig 字段调查及覆盖率

基线为锁定 TurnBasedGameData commit `724b139d8c9c32d12552eb95745a4fee72bfe48b`，版本 `OSPRODWin4.6.0_D16707949_A16704710_L16700845`。StarRailRes commit 为 `dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487`。开始时网站和两份上游均干净；上游 HEAD 与工作区状态保持不变。

仅检查现有费用引用和 EXP 配置构成的 140 个材料身份，全部且唯一来自 ItemConfig。数量为本次锁定数据的调查事实，不作为未来测试中的固定库存契约。

| 字段或组合 | CHS | EN |
| --- | ---: | ---: |
| 可解析 ItemName | 140/140（100%） | 140/140（100%） |
| 可解析 ItemDesc | 140/140（100%） | 140/140（100%） |
| 可解析 ItemBGDesc | 140/140（100%） | 140/140（100%） |
| 两种描述均有 | 140 | 140 |
| 仅 ItemDesc / 仅 ItemBGDesc / 均无 | 0 / 0 / 0 | 0 / 0 / 0 |
| 描述含实际或转义换行的材料 | 138 | 138 |

ItemDesc 表达用途、经验量或简短功能说明；ItemBGDesc 表达背景叙述，并可能包含引言。字段名承担语义边界，未通过标点、引号或换行再拆故事与引言。

两种语言均发现 `<i>`、`<unbreak>` 和 `<color=#f29e38ff>`，以及一处 `{NICKNAME}`。现有 GameText 支持这些富文本样式及 `\n` 归一化；未发现需要数值参数替换的 `#n[...]` 模板。`110263` 的背景描述包含昵称占位符，按用户确认保留 `{NICKNAME}`，不接入真实玩家昵称或自行替换为新称谓。

ItemMainType、ItemSubType、PurposeType 和 SellType 为内部分类/配置字段，本轮没有可靠的独立玩家类型本地化规则，因此不显示类型行，也不把内部枚举直接呈现给用户。

## 3. Material Domain 扩充

MaterialDomain 新增 `descriptionSource` 和 `backgroundDescriptionSource`，来自原 ItemDesc / ItemBGDesc 的共享 `textSource()`。Hash 经原无损 parser 保持十进制字符串，不经过 JavaScript number。

Catalog 投影改为显式选择原有身份字段与 name，避免对象展开把新 TextSource 或说明文字带入 `materials.json`。`training/shared.json` 继续显式选择原有身份字段，成本分片 schema 与计算接口没有变化。

新增 MaterialDetail / MaterialDetailCatalog，schema 1，每条仅含 `id` 与可选 `description/backgroundDescription`。最终 UI 结合现有 Catalog 得到名称、稀有度及 iconKey，没有第二套 ItemID 或图标映射。

## 4. 独立投影、生成及缓存

通过现有 `optionalText()`、TextResolver 和 normalizeGameText，分别从 CHS 与 EN TextMap 生成；缺失、空值和纯空白可选文本省略，没有跨语言回退、虚构占位说明或失败时伪装为空描述。

| 静态产物 | 未压缩字节 | 材料数 |
| --- | ---: | ---: |
| static/generated/zh-CN/material-details.json | 59,388 | 140 |
| static/generated/en/material-details.json | 73,451 | 140 |

两份文件进入原暂存目录、原子发布、摘要、locale 元数据和库存校验。Manifest 从 50 升至 51，旧缓存缺少详情文件时必须重新生成。未扩展上游 source registry，因为 ItemConfig 和两份 TextMap 已是生成输入。原生成目录仍按仓库规则忽略，不提交。

`createTrainingLoader.loadMaterialDetails(locale, catalog?)` 首次选择材料后才读取整份 locale 文件。已有 URL→Promise Map 合并同时请求并缓存成功结果；可选 Catalog 参数验证有限材料集合闭合。HTTP、JSON/schema、locale 或集合验证失败均清理详情缓存，下一次重试实际重新请求。已有费用/名称加载函数及其调用顺序保持不变。

Producer 和 build-input validator 验证版本、locale、唯一合法 ItemID、描述字段类型和详情集合闭合；独立 training semantic validator 重读 raw source 与 TextMap 并逐份比较投影。未为材料创建独立请求或 endpoint。

## 5. RarityStars 与二星颜色

实际材料：NotNormal 33、Rare 34、VeryRare 72、SuperRare 1。共享 rarityFromCode 分别解析为 2/3/4/5；共享 getRarityColor 返回 `#8ae1e3/#6090ff/#c77dff/#ffd700`。

Modal 直接复用 RarityStars，未传 color override，未新增星星绘制或颜色常量。图标背景与 Cell 同样从 getRarityColor 获取颜色。未知或不受支持的星级省略星星、使用中性背景；没有 NaN、错误 repeat 或虚构星级。共享稀有度实现本轮无需修改。

新增定向测试覆盖二星至五星的映射、共享组件星数/颜色和未知稀有度。独立 Node 断言已验证映射与颜色；组件星星的浏览器外观仍需人工验收。

## 6. Modal 视觉布局

使用现有 --surface、--text、--border、--radius-card 和 spacing 变量。桌面最大宽度 760px，左栏 176px，图标显示 160px 正方形，星级置于图标下。右栏依次为名称、稍高字重的简短说明、较低视觉权重的背景描述；没有故事内层 Card。

640px 以下改为纵向布局，图标显示不超过 128px。弹窗位于原生 top layer，外部遮罩暗化；关闭按钮在独立且不随内容滚动的顶部控制区，正文使用受视口约束的内部滚动区域。长名称允许换行，内容最小宽度为零，内部滚动采用 overscroll-behavior 防止滚动链。

图标复用现有 resolveMaterialIconAsset 和 AssetImage，以及已生成的有限 128×128 图标资源。未复制新素材、提高全站资产尺寸或改动资产处理；缺图沿用 ImageFallback。图标周围仅 8% 稀有度背景强调。未复刻官方浅色背景、花纹、圆环、大背景图或特殊按钮，也不展示持有量、来源、合成、反向索引或调试 ID。

## 7. Material Cell 点击接线

原 li 保留一像素边框、8px 圆角、底色、数据标识与稀有度变量；其内部增加填满 Cell 的 button，原图标、名称和数量结构放在按钮内。按钮继承字体、数量与颜色，保留原 48px 图标和 spacing，无嵌套 button。

整个 Cell、图片和名称均调用同一 `onSelectMaterial(itemId, trigger)`，经 TrainingExpenseGroup 和 TrainingSection 转发到 DetailPage。hover 使用现有克制边框/底色，focus-visible 使用全站金色 outline；reduced-motion 禁用局部过渡。

DetailPage 使用原 training loader，保存 selectedItemId、Catalog 身份、触发元素和独立详情状态。角色与光锥分支之外只挂载一个 ItemDetailModal；Player 模式不挂载。各费用分类中的相同 ItemID 使用同一份身份和缓存详情，费用列表没有成为复杂新容器。

## 8. Dialog 焦点、键盘与关闭生命周期

调用原生 showModal，使用物品名称作为 aria-labelledby。打开时焦点进入关闭按钮；原生 modal 提供 Tab 焦点范围和背景不可交互。Esc 的 cancel 事件、右上角关闭按钮、落在 surface 边界外的遮罩点击统一请求关闭。

打开时保存 body/root 原 inline overflow 并锁定；close 与 destroy 恢复原值，不使用固定 body、滚动坐标重设或页面跳转。关闭后若原触发按钮仍连接且上下文/请求版本未变化，使用 `focus({ preventScroll: true })` 恢复焦点。

迟到的原生 close 事件不会清除已重新打开的弹窗或解除其滚动锁；组件销毁后不再发出关闭回调。异步 show 的 tick 后也检查销毁和当前 open 状态。

## 9. 双语、响应式与异步状态

Modal loading/error/retry/close 和 Cell 可访问标签来自成对 Site Messages，并显式指定 Catalog/Modal locale。游戏文字来自匹配语言生成文件，沿用 GameText 的颜色、斜体、不换行片段及段落语义。

点击后立即显示基本身份及 loading，成功后显示可选描述；失败显示独立错误与 retry，不影响 TrainingSection 的状态或费用。每次选择、重试和关闭更新请求版本；结果更新前检查版本、ItemID 和上下文。

URL pathname、实体、Profile、locale 或 static/player 模式变化清空选中状态并使旧结果失效；组件销毁也失效。缓存仍可复用，但旧请求不会自动重新打开 Modal 或覆盖当前材料。详情状态不写入培养等级、技能目标、行迹状态或玩家数据。

## 10. 已执行检查与结果

运行时：已安装 Node 24.21.0；pnpm 11.9.0。pnpm 启动时工作区 realpath EPERM，后续必要生成与检查使用已安装的本地 Node CLI，没有安装依赖。

| 检查 | 结果 |
| --- | --- |
| 成对消息验证/编译 | 通过：451 条 Site Messages，2 个 locale |
| scripts/data/sync.ts | 通过：schema 51、两份详情文件；跨语言既有结构校验通过 |
| validate-build-inputs.ts | 通过：2,416 个 artifacts、1,090 个 route identities |
| 独立 validateTrainingSemantics | 通过：98 个角色、170 个光锥、140 个材料及双语 Catalog/Detail 投影 |
| 独立 Node 断言 | 通过：无损 Hash、富文本/换行、可选字段、省略策略、Catalog 无泄漏、集合闭合、懒加载/缓存、四种失败重试、无效数据、二至五星色彩 |
| 改动源码定向 TypeScript program | 通过：0 diagnostics |
| 五个改动组件 client/server 编译 | 通过：10 次编译，0 warnings |
| 新测试文件 TypeScript 转译 | 通过：语法 0 diagnostics；不替代测试执行 |
| 改动源码及测试 ESLint / Prettier | 通过 |
| 定向 Vitest 五个文件 | 阻断：缓存 rename EPERM；0 个测试断言执行 |
| 全项目 svelte-check | 未通过：818 errors、0 warnings，63 个文件；本轮改动组件没有诊断 |
| scripts 全项目 tsc | 未通过：既有 Playwright 类型导出/推导错误；本轮数据源码定向语义检查通过 |
| 本地 Vite 生产构建 | 失败：SSR 转换 916 modules 后，SvelteKit/Vite 依赖 realpath EPERM |
| Playwright 桌面/移动端及截图验收 | 未运行：没有包含本轮修改的成功构建；未使用旧构建冒充验证 |

全项目类型检查中的新测试也受既有 Playwright/Vitest 类型解析问题影响；不能称全项目类型检查通过。上述 818 是当次完整检查结果，不是本轮源码新增错误数量。最后的请求焦点版本保护及销毁保护调整另作定向组件编译/格式检查，不重复环境失败路径。

Vitest 尝试文件为 material-details、training-loaders、rarity、build-input-validation、training-presentation。新增单元测试包括 metadata 投影、缺失字段、非法版本/locale/ID、集合闭合、SSR 富文本/星级/fallback，以及 loader 缓存和失败重试。新增 E2E 包括双语角色/光锥懒加载、分类一致性、目标不变、键盘关闭和焦点、缓存、快速关闭/重新选择、长文本滚动、缺图、导航与 locale。

仅更新直接受本轮影响的“材料不能有 button”断言及 manifest fixture。没有清理其他 stale CI 断言、修复依赖权限或反复运行失败路径。数据同步中的既有 optional missing TextMap 和敌方弱点/抗性诊断与本轮无关。

## 11. 未解决问题与本地人工验收

工程功能已接线，但真实浏览器键盘、滚动、响应式与视觉验收仍未完成。请在可正常构建/运行的本地环境按以下清单验收；环境失败没有计为通过。

1. 中文、英文分别打开角色和光锥；首次点击前不请求 material-details，首次点击只请求对应 locale 一份文件。
2. 点击 Cell 的图标、名称和空白，检查名称/图片/文本身份正确；同材料在升级、晋阶及总览中的详情一致。
3. 选择二星经验/普通材料和三至五星材料，检查星数及共享色彩；背景的斜体、换行、色彩和原昵称占位符完整。
4. 用 Enter/Space 打开，Tab/Shift+Tab 留在弹窗内；Esc、关闭按钮及遮罩均可关闭，焦点返回原 Cell。
5. 确认背景不可点击、不滚动；关闭后页面位置和原滚动方式恢复。快速关闭后完成的请求不能重新打开弹窗。
6. 手机宽度下无横向溢出，图标/星级/名称纵向排列；长背景在内部滚动，关闭按钮始终可访问。
7. 模拟详情请求失败并重试；模拟缺图、缺可选描述。错误不能表现为空故事，也不能影响费用面板。
8. 切换材料、页面、Profile、语言或 Player 模式后不串数据；培养等级、技能、行迹及各分类数量保持不变。

有针对性的可复跑命令：`pnpm exec vitest run tests/unit/material-details.test.ts tests/unit/training-loaders.test.ts tests/unit/rarity.test.ts tests/unit/build-input-validation.test.ts tests/unit/training-presentation.test.ts`；成功本地构建后运行 `pnpm exec playwright test tests/e2e/material-details.spec.ts --project=desktop-chromium --project=mobile-chromium`。这两项在本次环境尚未完成。

## 12. 修改文件清单

数据、契约及校验：

- scripts/data/domain/training.ts
- scripts/data/projection/material.ts
- scripts/data/sync.ts
- scripts/data/generated-artifacts.ts
- scripts/data/validation/build-inputs.ts
- scripts/data/validation/training.ts
- src/lib/domain/types.ts
- src/lib/domain/training/types.ts
- src/lib/domain/training/validation.ts
- src/lib/data/training.ts

交互与消息：

- src/lib/components/shared/DetailPage.svelte
- src/lib/components/training/MaterialCostList.svelte
- src/lib/components/training/TrainingExpenseGroup.svelte
- src/lib/components/training/TrainingSection.svelte
- src/lib/components/training/ItemDetailModal.svelte（新增）
- messages/zh-CN.json
- messages/en.json

定向测试与文档：

- tests/unit/material-details.test.ts（新增）
- tests/unit/build-input-validation.test.ts
- tests/unit/robustness-invariants.test.ts
- tests/unit/training-presentation.test.ts
- tests/e2e/material-details.spec.ts（新增）
- tests/e2e/training-detail.spec.ts
- docs/architecture/localization-and-data-generation.md
- docs/investigations/material-item-detail-modal-implementation.md（本报告）

已阅读两份上游 README 与 StarRailRes AGPL-3.0 LICENSE；TurnBasedGameData 没有 LICENSE 文件。沿用现有来源说明，本轮没有新资产复制。最终网站仅保留本轮未提交修改；两份上游仍干净，HEAD 不变。
