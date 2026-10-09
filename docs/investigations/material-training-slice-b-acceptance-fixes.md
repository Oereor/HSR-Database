# Slice B 人工验收问题定向修复

日期：2026-10-09。实施仓库：HSR-Database，分支：develop。

## 1. 结果与验收状态

已修复行迹 Toggle 的间接响应式依赖，并将角色养成计算及其导航项移到全部资料 Section 之后。未修改 DAG、经验或材料计算、行迹分组、TrainingSection/MaterialCostList 布局、光锥 Section 顺序。

**本轮不能宣布浏览器验收成功。** Playwright 尝试在 pnpm 启动阶段遇到仓库路径 `realpath EPERM`，0 项浏览器测试执行。定向 Vitest 在缓存重命名阶段遇到 `EPERM`，0 项测试执行。Svelte 全项目检查未通过。已完成两个改动组件的客户端/SSR 编译、三个改动测试文件的 TypeScript 语法转译、目标文件格式/lint 与 diff 检查；这些检查不等价于 DOM、点击、键盘或视觉验收。

修复代码与回归用例可供再次本地人工验收，但仍需在正常环境构建新 Preview 后完成下述浏览器检查。

## 2. 原始问题与复现证据

人工报告：静态角色行迹卡片只有原有 hover 高亮，鼠标为普通箭头，点击不改变状态。三月七（1001）应作为首个验收案例。

本轮对修改前 `HEAD` 中的 TraceCardPanel 使用仓库已安装的 Svelte 编译器进行客户端编译，确认异步 Profile 依赖丢失。未能重新完成浏览器复现：以下命令尚未启动 Preview 或浏览器就失败。

```powershell
$env:PLAYWRIGHT_REUSE_BUILD='1'
pnpm exec playwright test tests/e2e/training-detail.spec.ts --project=desktop-chromium --grep 'trace toggles follow' --workers=1 --retries=0 --reporter=line
```

错误：`EPERM: operation not permitted, realpath 'C:\Users\unkn0\Documents\Projects\HSR-Database-Project\HSR-Database'`。pnpm 报告其依赖检查子命令失败。此命令原意为检查已有构建中的原始交互，不作为修复后验证；**没有使用旧构建宣称修复通过**。

遵循 AGENTS.md：明确外部工具或权限失败后停止对应验证路径。不申请绕过、不切换浏览器启动路径、不创建远程部署。

## 3. 最终根因与代码级证据

TraceCardPanel 采用 Svelte legacy 组件。模板调用的普通函数 `canToggle(trace)` 内部读取 `trainingProfile`、`onToggleTrace` 和 `playerSkillTree`；`trainingStateOf(trace)` 又间接读取激活列表。

修改前实际客户端编译输出（以能力组为例）：

```javascript
var d = $.derived(() => (
  $.get(group),
  $.untrack(() => canToggle($.get(group).ability))
));
```

该条件只显式跟踪 `group`，函数内部的异步 props 位于 `untrack` 中。首次挂载时 Profile 与回调尚不可用，训练请求完成后组对象没有改变，按钮条件不会重新求值。卡片 `data-training-state` 的编译结果同样只跟踪行迹对象，将 `trainingStateOf()` 放入 `untrack`，因此仅修复按钮挂载仍不足以修复后续视觉更新。

DetailPage 的加载链已经正确设置 `characterTarget`、`characterTrainingData` 和 ready 状态，并以 `$:` 派生 `trainingProfile`，向面板传递激活列表与点击回调；问题位于面板消费这些 props 的模板依赖。

## 4. 修复方式与编译结果

用两个显式 `$:` 派生集合替代间接辅助函数：

- `toggleableTraceIds`：根据 Profile、回调和 Player skillTree 筛选 `kind === 'trace'` 的 PointID。
- `activeTraceIdSet`：根据 `activeTraceIds` 重建激活集合。

四类卡片直接读取集合来控制 TraceToggle 挂载、`aria-pressed` 和 `data-training-state`。集合重新赋值使异步加载、点击、降级和 Profile 切换均有显式模板依赖。

修改后实际编译输出：

```javascript
var d = $.derived(() => (
  $.get(toggleableTraceIds),
  $.get(group),
  $.untrack(() => $.get(toggleableTraceIds).has($.get(group).ability.id))
));
```

`legacy_pre_effect` 的依赖函数显式读取 `playerSkillTree()`、`onToggleTrace()`、`trainingProfile()`；激活集合的依赖函数显式读取 `activeTraceIds()`。卡片状态表达式同时显式读取两个集合。`untrack` 仍可出现在生成代码中，关键区别是相关集合在其外被跟踪。

TraceCardPanel、DetailPage 的客户端与 SSR 编译全部成功，分别为 0 警告。未新增 props、公共类型、loader 或领域 API。

## 5. DOM、事件及 DAG/费用联动

现有 TraceToggle 保留原生 `button`、`type="button"`、`on:click`、`aria-pressed`、pointer 与 focus-visible。卡片保持相对定位；按钮覆盖卡片，特殊效果 disclosure 保持独立层级。没有通过外层 cursor 伪装修复，没有修改 CSS。

领域及事件链未改动：点击调用 `handleTraceToggle()`，通过 `activateTrace`/`deactivateTrace` 重新赋值目标激活列表；计算与面板分别接收目标和激活集合。激活补齐所有前置、取消全部后继、晋阶限制、降级取消及升级不恢复规则保持原样。

扩展 `tests/e2e/training-detail.spec.ts`，在中英文真实页面拦截并延迟三月七分片，先断言 loading 且无按钮，释放请求后断言 13 个按钮出现，然后验证真实鼠标/键盘操作、卡片状态与费用变化。用例覆盖：

- 取消 `1001201` 后七个节点关闭：`1001201`、`1001101`、`1001202`、`1001203`、`1001102`、`1001205`、`1001206`；剩余激活数为 6，第三大行迹保持激活。
- 对照真实生成分片，七个节点的信用点费用之和为 86,000，周本材料 `110501` 数量减少 2；浏览器用例断言总费用对应变化。
- Enter 激活 `1001102` 恢复其前置 `1001201`，数量变为 8，总信用点相对原值减少 68,000；Space 再次取消，数量变为 7。
- 检查 `aria-pressed`、`data-training-state`、灰度样式与可见键盘焦点同步；鼠标和键盘展开特殊效果不改变行迹状态。
- 降至 Lv.1 后仅保留一个合法已激活节点；非法激活提供反馈；回到 Lv.80 不自动恢复取消节点。
- 记忆开拓者 `8007501` 无按钮、无模拟状态，也不显示 pointer。
- 1102 的 Base/Enhanced 来回切换移除旧节点、重建当前 Profile 按钮，并重置此前取消的目标。

86,000 的成本和节点关系已从现有真实分片静态核对。**上述 DOM、事件和费用联动断言未执行，不能称为浏览器通过。**

## 6. 角色 Section 顺序

角色实际组件顺序改为：技能组 → 行迹 → 星魂 → 装备推荐（存在时）→ 养成计算。基础属性留在 Hero。TrainingSection 移到装备条件块之后，保留 `training` ID 及原来的状态 props。导航顺序同步调整，基础属性仍为首项。

更新 shared-detail 的角色导航顺序断言，并在 training-detail 的双语场景检查 DOM Section 顺序、导航顺序、training 锚点、导航激活状态、标题进入 viewport 与水平溢出。光锥场景明确保持 `stats → training → story`。

在 training-presentation 中补充无装备推荐 props 的 DetailPage SSR 场景：真实三月七资料的 Section 与导航均以 training 结束。该场景不改动生成数据，也不伪造角色；但本轮因 Vitest 环境错误尚未运行。

## 7. Player Info 兼容性

保留 `staticTrainingEnabled` 的 uid 门控及面板的 `!playerSkillTree` 门控。真实 Player skillTree 存在时可切换集合为空。未修改 Player API、缓存、属性、晋阶、技能树或实际装备逻辑。

现有 `player-character.spec.ts` 的 `reuses the Player cache and renders real progression without changing static mode` 场景已断言养成 Section、养成导航及 Toggle 均不存在，可用于后续定向回归；本轮没有运行该浏览器场景。相关 Player 组件单元测试也仅尝试启动，未执行。

## 8. 执行检查与结果

| 检查 | 实际结果 |
| --- | --- |
| 修改前/后客户端编译对比 | 确认隐藏依赖问题及修复后显式依赖 |
| 两个改动 Svelte 组件 client/server 编译 | 4 次编译成功，0 警告 |
| 三个改动测试文件 TypeScript 转译 | 语法检查通过；不是完整语义类型检查 |
| 五个改动源码/测试文件 Prettier | 通过 |
| 五个改动源码/测试文件 ESLint | 通过，退出码 0 |
| Playwright 原始交互检查尝试 | pnpm realpath EPERM，0 项执行 |
| 三个定向 Vitest 文件 | 缓存 rename EPERM，3 个 suite 启动失败，0 项执行 |
| Svelte 全项目检查 | 未通过，777 errors、0 warnings，涉及 61 个文件 |
| 最终 git diff/status 与上游状态 | 已检查；仅本轮定向修改，上游 HEAD/status 不变 |

实际定向单元命令：

```powershell
node node_modules/vitest/vitest.mjs run tests/unit/training-presentation.test.ts tests/unit/training-core.test.ts tests/unit/player-character-components.test.ts
```

三个 suite 均在沙箱 Temp 内 Vite SSR 缓存 `.tmp-*` 重命名为缓存文件时出现 `EPERM`，尚未执行断言。没有继续重试此路径。

实际 Svelte 检查命令：

```powershell
node node_modules/svelte-check/bin/svelte-check --tsconfig ./tsconfig.json
```

输出包含 Vite 配置加载失败、`vite.config.ts` 插件类型诊断，以及多个浏览器/单元测试中的 Playwright/Vitest 类型导出与隐式 any 诊断。例如 `tests/components/image-fallback.spec.ts`、`tests/e2e/catalogs.spec.ts`、`tests/unit/training-exp.test.ts`。这些未改动文件的失败不在本轮修复范围；未运行基线对比，因此不将整批错误一概认定为已证明的历史失败，也不修改配置或弱化测试掩盖它们。

因为浏览器路径已受阻，没有运行修复后的生产构建或旧 Preview 验收，也没有执行全仓单元/E2E、生成数据清理或远程部署。

## 9. 未执行的验收与再次人工检查

需要在正常环境构建新本地 Preview，不能直接检查此前的旧构建。可先执行定向检查，再构建并运行浏览器用例：

```powershell
pnpm exec vitest run tests/unit/training-presentation.test.ts tests/unit/training-core.test.ts tests/unit/player-character-components.test.ts
pnpm build
$env:PLAYWRIGHT_REUSE_BUILD='1'
pnpm exec playwright test tests/e2e/training-detail.spec.ts --project=desktop-chromium --project=mobile-chromium --workers=2 --retries=0 --reporter=line
pnpm exec playwright test tests/e2e/shared-detail.spec.ts --grep '共享 SectionNav' --project=desktop-chromium --project=mobile-chromium --workers=2 --retries=0 --reporter=line
pnpm exec playwright test tests/e2e/player-character.spec.ts --grep 'reuses the Player cache' --project=desktop-chromium --project=mobile-chromium --workers=2 --retries=0 --reporter=line
```

若已有 Preview 进程，先正常停止旧进程，再启动新构建的 Preview，避免 Playwright 的 reuseExistingServer 使用旧服务器。

人工清单：

1. 三月七中英文页 ready 后，确认付费卡片真实按钮出现、pointer 正常；取消共享前置、激活后继时两条分支状态和费用正确联动。
2. 使用 Enter/Space 操作并确认焦点和灰度同步；鼠标及键盘操作特殊效果 details 不改变 Toggle。
3. 降低等级验证晋阶限制，再升高等级确认取消状态不会恢复。
4. 记忆开拓者固定节点不产生 Toggle；1102 切换 Base/Enhanced 后按钮和状态正确重建。
5. Player Info 保持只读，无模拟 Toggle 或养成 Section。
6. Desktop/Mobile 中英文页养成 Section 与导航均在最后，training 导航定位正确，无明显布局回归；无推荐组件的 SSR 测试通过；光锥顺序不变。

以上仍未执行，包括真实 hydration 后挂载、实际事件响应、费用联动、视觉、键盘、响应式布局与 Player 浏览器兼容性。满足两项核心标准前，保留“浏览器验收待完成”状态。

## 10. 明确暂缓与修改文件

暂缓材料面板专项布局、无关 GitHub CI stale 测试/大型 snapshot、全部 Item Modal/详情/路由/来源 UI 以及 Slice C。未改变计算领域规则、原始行迹拓扑或生成分片。

修改文件：

- `src/lib/components/character/TraceCardPanel.svelte`
- `src/lib/components/shared/DetailPage.svelte`
- `tests/e2e/training-detail.spec.ts`
- `tests/e2e/shared-detail.spec.ts`
- `tests/unit/training-presentation.test.ts`
- `docs/investigations/material-training-slice-b-acceptance-fixes.md`

只读上游基线：TurnBasedGameData HEAD `724b139d8c9c32d12552eb95745a4fee72bfe48b`；StarRailRes HEAD `dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487`。任务前后 git status 均为空，HEAD 不变。

未 commit、push 或部署。
