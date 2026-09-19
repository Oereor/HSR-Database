# MiHoMo Player Info Phase 4 — Player Equipment

日期：2026-09-19  
分支：`develop`  
结论：**PASS（Playwright 浏览器二进制缺失，保留 focused 人工验收）**

## 1. Summary

Character Detail 已完成实际装备整合。静态与 Player fallback 状态继续显示现有“装备推荐”；只有 Phase 3 成功解析出 matching `PlayerCharacter` 后才替换为“装备信息”，展示实际 Light Cone 和固定六槽 Relic。

实现直接消费既有窄 DTO，没有修改 BFF、Player contract、endpoint、cache 或 MiHoMo fetch。静态名称、命途、套装、部件、属性标签和图片全部来自本站本地数据与资产 resolver。

## 2. Files Changed

- 数据分片：`scripts/data/sync.ts`、`scripts/data/generated-artifacts.ts`
- Player resolver/client：`src/lib/player/equipment.ts`、`equipment-client.ts`
- Player equipment UI：`PlayerEquipmentSection`、`PlayerLightConeCard`、`PlayerRelicCard`、`PlayerAffixRow`
- Character Detail 接线：`src/lib/components/shared/DetailPage.svelte`
- 双语 Site Messages：`messages/contracts.json`、`zh-CN.json`、`en.json`
- 定向验证：`player-equipment.test.ts`、`player-character-components.test.ts`、`data-cache.test.ts`、`player-character.spec.ts`

生成目录与 `build/` 由既有脚本更新，不作为手写源码提交。

## 3. Static vs Player Equipment Switch

状态保持为：

```text
idle/static                 -> EquipmentRecommendationSection
invalid UID                 -> EquipmentRecommendationSection
Player API error            -> EquipmentRecommendationSection
matching character missing  -> EquipmentRecommendationSection
matching PlayerCharacter    -> PlayerEquipmentSection
```

active mode 同时切换 SectionNav target 为 `#equipment`；不会同时展示推荐与实际装备。Player profile 仍只由 Phase 3 context 请求一次。

## 4. Light Cone Resolver / UI

新增 locale-aware compact static shard：

```text
/generated/zh-CN/player-equipment.json  29,616 bytes
/generated/en/player-equipment.json     31,866 bytes
```

分片 schema v1 包含 169 个 Light Cone 的本地 identity/path metadata，以及 60 个 Relic Set 与部件 identity。它只在 active Player equipment component mount 后请求，按 locale 缓存 Promise；失败会清除失败缓存并用空 catalog 降级。

Known Light Cone 展示本地图像、名称、稀有度、命途、等级、晋阶和叠影并链接本地详情。null 显示“未装备光锥”；unknown ID 保留卡位与全部 Player progression，只显示结构化 ID fallback。

## 5. Relic Resolver / Six-slot Model

真实配置与现有 static slot domain 确认映射为：

```text
1 -> HEAD
2 -> HAND
3 -> BODY
4 -> FOOT
5 -> NECK
6 -> OBJECT
```

resolver 总是输出上述固定顺序的六个 slot。缺失 slot 保留空卡；duplicate slot 稳定保留 MiHoMo 数组中的第一条。`setId + slot` 精确连接本地 set/part，不使用名称匹配。

## 6. PlayerRelicCard

每张卡展示 slot、本地部件图、套装/部件名、`+level`、主属性和副属性。布局为 wide 3×2、medium 2×3、mobile 1×6；网格与文字均允许收缩/换行，避免长 fallback ID 造成横向溢出。

本阶段没有显示 Relic rarity、套装件数汇总或套装效果。

## 7. Affix Resolver

MiHoMo affix `type` 与当前 `RelicProperty.propertyType` 属于同一 canonical domain，因此直接精确查找，无需 Player 专属 bridge。known affix 复用本地双语名称和 property icon；unknown affix 显示 raw type，保留 BFF `display`。

nullable main affix 显示“主属性未知”。副词条保留原始顺序；`count > 0` 显示 `×count` 和 screen-reader enhancement label，`count=0` 不显示 `×0`。未使用 `value` 或 `step`。

## 8. Recommendation Matching

主词条按当前 slot，将实际 canonical property type 与 recommendation 的多个候选精确比较；副词条与 recommendation substat type 集合精确比较。display、percent、count 和 roll 数值均不参与判断。

匹配项使用轻量金色左侧 accent，并显示双语“推荐匹配”标记，因此不只依赖颜色。没有实现 Relic score、等级评分、roll quality、build score 或 DPS estimate。

## 9. Empty / Unknown Fallback

已覆盖：

- 无 Light Cone；
- 单个或全部 Relic slot 缺失；
- unknown Light Cone；
- unknown Relic set/part；
- unknown affix；
- nullable main affix；
- 整个本地 metadata shard 加载失败。

metadata shard 失败不会切回静态推荐，也不会让 Character Detail 失败；实际装备以 raw ID/type fallback 继续显示。

## 10. i18n / Responsive / Accessibility

新增 16 个配对 Site Messages，消息合同现为 388 keys × 2 locales。装备状态、unknown/empty、progression、affix section、推荐匹配和强化次数均有 zh-CN/en 文案。

推荐匹配同时使用文字与视觉；强化次数包含专用 screen-reader 文本；图片失败继续使用现有本地 fallback；loading 使用 polite live status。

## 11. Targeted Tests

- Vitest：3 files / 17 tests PASS
- 覆盖 known/null/unknown Light Cone、progression、type-slot table、六槽顺序、missing/duplicate/unknown set、nullable/unknown affix、display/count、主副词条匹配、多候选、静态分片身份/cache/retry、SSR empty/unknown/recommended/a11y presentation。
- targeted Prettier：PASS
- targeted ESLint：PASS
- `pnpm data:sync`：PASS
- `pnpm data:validate`：PASS

数据同步/验证仅输出既有 localization classified fallback、optional missing、weakness/resistance conflict 和 544 条 TextHash 缺失审计警告；没有 Phase 4 新错误。

## 12. Build Validation

- `pnpm check`：PASS，Svelte 0 errors / 0 warnings；scripts/API TypeScript PASS。
- `pnpm build`：PASS，adapter-static 完整写入 `build`，两个 Player equipment shard 均存在于最终产物。
- 构建保留既有 generated enemy portrait 缺失降级提示，与本阶段无关。
- 未运行 full `pnpm test`、全量 Playwright、route verification、`vercel build` 或 remote Preview。
- 资产 requirement 未变化，因此未运行 `pnpm assets:verify`。

## 13. Manual Verification Items

Focused desktop/mobile Playwright 启动一次，四个 project cases 均在 browser launch 前停止：本机缺少 `chromium_headless_shell-1234`。没有下载浏览器或重复尝试。

在具备匹配 Chromium 的环境中需确认：

1. actual Light Cone + six Relic slots 的视觉层级与本地图片；
2. null、missing slot、unknown ID/type 的可读 fallback；
3. wide 3×2、medium 2×3、mobile 1×6 与无横向 overflow；
4. static、active Player、invalid/missing/API failure 三态只显示正确的一套 equipment section。

## 14. Deferred Issues

- Phase 2/3 的 Stats、Skill、Trace/Eidolon spacing、Player Hero 与其他 checklist 细节均未修改。
- Playwright Chromium 安装属于本机验证环境问题，留给人工验收环境处理。
- 不增加 set-count/effect summary；若未来需要，应独立定义产品语义，不重新引入 MiHoMo `relic_sets`。

## 15. Player Info V1 Completion Assessment

Phase 4 的源码、静态数据、resolver、UI、双语、定向测试、类型检查和生产构建均通过，结论为 **PASS**。Player Info V1 的 profile、公开角色、角色养成、属性、技能/行迹/星魂和实际装备主流程已经闭环。

项目已具备进入集中 bug-fix roundup 的条件；本阶段没有自动开始该工作。
