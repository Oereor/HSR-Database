# Relic Score Phase 2B — Player Info UI Implementation

## 1. Executive Summary

Player Info 已接入 `character.relicScore` 的 Build 与单件遗器展示。实现只做展示格式化；评分算法、Profile、Benchmark、推荐数据和 API 数学没有修改。组件、双语消息、相关测试及生产构建均已完成。浏览器预览服务器在当前环境被 `listen EPERM` 阻止，因此 desktop/mobile 实际截图与交互运行仍待补验，V1 完成 gate 尚未全部关闭。

## 2. Existing Player Relic UI

`PlayerEquipmentSection` 已使用 `SectionHeading`、独立 `PlayerRelicCard` 和固定六槽、3/2/1 列响应式网格。遗器卡 header 原有图标、名称与 `+15`；正文是主、副属性。普通遗器目录组件与 Player 卡分离。

## 3. UI Design Decisions

沿用现有深色 surface、边框、字体 token 与间距。Build 分数是单块 summary 的主视觉，命中数次之，属性、套装与目标状态为紧凑次级指标；原生 `<details>` 承载逐项数据。没有 grade、分数颜色档位、仪表盘、图表或动画。

## 4. Files Added / Changed

- 新增 `PlayerRelicScoreSummary.svelte`、纯 UI 格式化 helper、共享 Player 数值格式化 helper、Phase 2B 单测和本报告。
- 调整 Player equipment section、Player relic card、Player stat label resolver 与原数值展示调用处。
- 扩展 zh/en 消息及 contract，扩展现有 Player browser spec。

## 5. Build Summary Placement

Summary 位于遗器的二级 `SectionHeading` 之后、六槽 grid 之前；未移动 Character Hero、光锥或原卡片正文。

## 6. Build Score Presentation

只对 UI 使用 `Math.round(score)` 并显示 `/ 100`；DTO 内 full precision 保留。没有在客户端重新计算 Core 或 Final Score。

## 7. Effective Hits Presentation

`exact` 显示 `total`，包括合法的 0；`partial` 显示“至少 known”及计数不确定说明；`unavailable` 或没有可靠 total 显示 `—`，不以 0 代替。

## 8. Stat / Set Breakdown

`statCompletion` 和 `setIntegrity` 均在次级指标区按 `Math.round(value * 100)` 显示整数百分比。没有暴露评分公式。

## 9. Soft Target Presentation

只有 `details` 非空才显示构筑目标进度；展开后逐项显示本地化面板属性名、当前值、目标区间与进度。空目标不会显示 `0%`。

## 10. Hard Breakpoint Presentation

只有 `details` 非空才显示关键阈值。单项显示达成/未达成，多项显示达成数；展开后显示本地化属性名、当前值、阈值和状态。没有把 `failureRatio` 直接展示给用户或据此重算评分。

## 11. Piece Score Placement

单件分数位于原卡 header 右侧 `+15` 下方，以中性文本显示整数分；主、副属性区域保持原结构。

## 12. Piece Availability

按 `view.slot` 读取 `pieces`，不依赖遗器数组顺序。已装备但该槽评分不可用或缺失时显示 `—`；空槽不显示 badge。单件 0 与 100 都是有效分数。

## 13. Build Availability

Build unavailable 显示 `—` 和对应的简短本地化说明；`incomplete-build` 提醒装备未完整。Build 不可用不隐藏可用 Piece 分数。旧响应没有 `relicScore` 时不渲染评分 UI，原卡片仍正常显示。

## 14. i18n

新增文案均进入 `messages/zh-CN.json`、`messages/en.json` 和 `messages/contracts.json`。所有七种公开 unavailable reason 都映射到用户文案；Paraglide 双语编译通过。

## 15. Stat / Number Formatting

详情通过已有 Player property semantics 找到最终面板字段，复用 Player 属性名解析；没有直接显示 canonical stat key。原 Player 数值格式化被抽为纯 helper，原展示和新详情共用；比例按百分比、ATK/DEF/SPD 等按面板数值展示。UI 的分数/进度取整与面板数值格式化职责分开。

## 16. Responsive Desktop

Summary 使用可换行 flex/次级指标布局，宽度受 Section 约束；遗器网格原 3 列及 1080px 的 2 列断点保持不变。浏览器布局检查尚未运行，见第 23 节。

## 17. Responsive Mobile

沿用 680px 单列断点；Summary 主区域可换行，展开行在小屏改为两行，长标签可断行。浏览器无横向滚动检查尚未运行，见第 23 节。

## 18. Accessibility

评分与状态均有文字，不依赖颜色或透明度；单件分数有本地化 aria label；详情使用键盘可操作的原生 `<details>/<summary>`，并沿用已有焦点与对比度 token。

## 19. Component Reuse / Derived Components

沿用独立 Player relic card、`SectionHeading`、属性标签和数字格式规则。新 summary 只消费 presentation DTO；普通 Relic Catalog 组件未改动。

## 20. Client Bundle Boundary

新展示模块没有 fetch、server scorer、Profile 或 Benchmark import。生产 client output 与静态站点的 `_app` 文件中未检出正式 Benchmark 文件名、版本标识或正式 artifact SHA。评分仍随原 Player Info response 到达；原有 equipment catalog 请求保持不变。

## 21. Tests

Phase 2B 单测覆盖分数取整、0/100、命中数三态、目标与阈值、槽位关联、独立可用性、旧 DTO、双语 reason、属性本地化和 client import 边界。相关 **17 个 Vitest 文件、139 项测试通过**；现有 Player 浏览器测试已扩展为 desktop/mobile 可用 Build 与五件 Build 场景，包含长英文名称、键盘展开、卡片边界、请求数、无横向滚动及截图保存，但因第 23 节环境限制未执行。

## 22. Build

Profile validator 97/97、farming validator、正式 Benchmark validator 582/582、生成 build-input validator 2,126 artifacts 均通过。Svelte check 为 0 errors / 0 warnings；scripts/API TypeScript、lint、`git diff --check` 通过。`pnpm check` 与 `pnpm build` 的 `tsx` 包装器遇到已知 IPC `EPERM`；以 `node --import tsx` 完成同等前置命令，直接 `pnpm exec vite build` 成功并写入 `build`。

## 23. Visual Verification

已准备 Playwright desktop/mobile 测试及截图输出；测试清单可发现全部 8 个 Player Character 用例。实际运行时 `vite preview` 无法监听 `127.0.0.1:4173`（`listen EPERM`），因此没有真实浏览器截图，也不能声称 desktop/mobile 实测通过。按仓库验证规则未继续绕过环境限制。

有可监听本地端口的环境中，运行 `PLAYWRIGHT_REUSE_BUILD=1 pnpm exec playwright test tests/e2e/player-character.spec.ts --project=desktop-chromium --project=mobile-chromium`；检查输出截图中的 Summary、长英文卡名、`+15` 与评分、展开详情，并确认两种 viewport 均无横向滚动。需先确保当前生产构建存在。

## 24. Remaining Limitations

当前仅剩实际浏览器交互与视觉 gate 未验证。Phase 2A 已记录的 Vercel 最终 API 函数包大小限制仍是独立部署前检查项；本阶段没有远程部署。

## 25. V1 Completion Status

Phase 2B 实现已落地，自动化单测、双语、类型、lint 和构建 gate 通过。由于 desktop/mobile 浏览器 gate 未能在本机执行，**Relic Score V1 尚不能正式宣告全部完成**；补验第 23 节后可关闭最后 gate。

## 26. `git status --short`

本阶段文件保持未暂存、未提交。`git status --short --untracked-files=all`：

```text
 M messages/contracts.json
 M messages/en.json
 M messages/zh-CN.json
 M src/lib/components/player/PlayerEquipmentSection.svelte
 M src/lib/components/player/PlayerRelicCard.svelte
 M src/lib/player/character.ts
 M src/lib/player/stat-synthesis.ts
 M tests/e2e/player-character.spec.ts
?? docs/relic-score-feature/phase-2b-ui-implementation-report.md
?? src/lib/components/player/PlayerRelicScoreSummary.svelte
?? src/lib/player/display-number.ts
?? src/lib/player/relic-score-presentation.ts
?? tests/unit/relic-score-phase2b.test.ts
```

只读上游仓库与开工时相同：`TurnBasedGameData` clean，`StarRailRes` 保留原有 `?? icon/.DS_Store`。
