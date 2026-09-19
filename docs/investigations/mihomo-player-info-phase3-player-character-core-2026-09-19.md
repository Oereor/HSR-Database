# MiHoMo Player Info Phase 3 — Player-aware Character Detail Core 实施报告

日期：2026-09-19  
分支：`develop`  
结论：**PASS（本地 Playwright 缺少 Chromium，保留浏览器人工验收）**

## 1. Executive Summary

Character Detail 已在不复制详情页和不新增 Player 请求层的前提下接入 Player context。`/characters/{id}/?uid={uid}` 与英文路由会在浏览器端复用 Phase 2 的 `fetchPlayerProfile`、五分钟模块缓存和 in-flight dedupe；只有 profile 成功且 `characterId` 精确匹配时才进入 Player mode。

Player mode 展示真实角色等级、晋阶、MiHoMo 面板属性、技能等级、行迹状态和星魂状态。无 UID、无效 UID、API 失败或角色未公开时仍显示完整静态 Character Detail。光锥、遗器、装备信息和评分未进入本阶段。

## 2. Files Changed

- Player resolver 与组件：`src/lib/player/character.ts`、`src/lib/components/player/*`、共享 `LevelSlider`
- Character Detail 接线：共享 Detail page、Skill/Trace/Eidolon 现有组件与 Character route data
- Presentation：详情 Hero、inspection、slider、Trace/Eidolon 样式
- i18n：Site Message contract 与 zh-CN/en 文案
- 验证：Player Character resolver/component unit tests 与 focused Playwright spec

没有修改 Phase 1 Function、Phase 2 client/cache、routing infrastructure 或 Player Overview 产品行为。

## 3. Player Character Mode State Flow

Character Detail 在 SSR/prerender 阶段不读取 query，继续输出静态页面。组件 mount 后读取 URL 中唯一的 `uid`：

```text
no uid -> idle/static
invalid or repeated uid -> invalid/static, no request
valid uid -> loading -> fetchPlayerProfile(uid)
profile + exact characterId -> active Player mode
profile without character -> missing/static
PlayerApiError or other request failure -> error/static
```

同步 key 只由 category、Character ID 和全部 UID 参数组成，`enhanced` 切换不会重复获取 profile。请求版本号会忽略旧 Character/UID 的迟到结果。

## 4. Static-mode Preservation

无 UID 继续使用既有可交互角色等级和技能 range、静态基础属性、普通 Trace/Eidolon、特殊效果、加强前后切换和装备推荐。Player fallback 状态同样恢复这套静态行为，不把默认值标记为玩家数据。

生产构建首次发现 prerender 期间不能访问 `url.searchParams`，实现随后将所有 UID 读取严格延后到 mount；最终静态 build 成功。

## 5. Character Level / Promotion

玩家等级直接使用 `PlayerCharacter.progression.level`，晋阶使用 `promotion`。共享 range primitive 在 static mode 可交互，在 Player mode 使用原生 `disabled`，没有使用对 range 无效的 `readonly`。

disabled variant 保留金色 thumb 与进度轨道，并暴露正常的 native slider/value 语义。`enhanced` 保留在 Player context 中，但本阶段不改变现有 profile switch 或新增 UI。

## 6. Player Stats Panel

Player Stats 只消费 BFF `PlayerStat[]`：

- primary 栏严格包含实际返回的 `hp/atk/def/spd/crit_rate/crit_dmg`；
- other 栏保留所有其余字段及 BFF 原始顺序；
- desktop 两栏，窄屏按 primary → other 单栏；
- Total 直接显示 `total`；Breakdown 只组合存在的 `base`/`addition`，不计算或补零；
- MiHoMo field 映射到当前 locale 的 relic property catalog，以复用本地名称和图标；
- `elation_dmg` 等未知字段显示原 field key，且不伪造图标或翻译。

## 7. Skill Progression Mapping

Player `skillTree` 建立稳定的 ID index，重复 ID 保留第一项。每个 `SkillProgression.id` 精确查找 Player level；level 还必须存在于本地 `availableLevels` 才视为 resolved。

Resolved progression 使用真实 level 并禁用 slider。missing 或越界 progression 显示 `-` 和“玩家技能等级未知”，技能内容仍作为静态参考显示，但不会把 default level 冒充为玩家等级。多形态、fixed variants、ExtraEffect 和 Special Effect 流程未改变。

## 8. Trace States

`Trace.id` 精确连接同一 skillTree index：

- `level > 0`：active；
- `level === 0`：inactive；
- missing/invalid：unresolved。

三态均有文字标签。inactive 只降低图标、标题和 border 权重，正文保持可读；unresolved 使用虚线与“状态未知”，不会表现为未激活，也不会触发整页 fallback。

## 9. Eidolon States / Style Change

Eidolon 使用本地 rank 顺序与 Player rank 比较：`eidolon.rank <= player rank` 为 active，其余为 inactive。inactive 不隐藏正文，并有明确文字状态。

现有 Eidolon card 增加了与 Trace ability 相近的金色边框和轻量径向背景。Static mode 应用统一基础视觉，但不会输出 active/inactive 标签或 `data-player-state`。

## 10. Error / Missing Character Fallback

无效 UID 不调用 BFF。API error 使用统一的紧凑本地化 notice；成功 profile 未包含当前角色时显示“该玩家当前没有公开展示此角色”。两者都继续显示静态详情，不伪造 Player progression，也不请求其他 endpoint。

Active notice 显示 Player data、UID 和返回 `/player/?uid=...` 的轻量链接。

## 11. i18n / Responsive / Accessibility

新增 15 个配对 Site Messages，覆盖 context、loading/fallback、Promotion、Total/Breakdown、状态标签和技能 level unknown。消息合同当前为 372 keys × 2 locales。

Stats toggle 使用 `button` + `aria-pressed`；disabled native range 真正阻止 pointer/keyboard mutation；Trace/Eidolon 状态同时使用文字和视觉。移动端 CSS 保持 Player Stats 的 primary → other DOM 顺序，并将面板改为单栏。

## 12. Targeted Tests

- 最终相关 Vitest：5 files / 55 tests PASS
- 最后 readonly range CSS 调整后的 focused component recheck：1 file / 5 tests PASS
- targeted Prettier：PASS
- targeted ESLint：PASS

覆盖 UID query、client cache、精确角色匹配、所有已知 stat mapping、unknown field、Breakdown 空值组合、skill resolved/unresolved、Trace 三态、Eidolon rank 0/3/6、static slider 和 static card 回归。

## 13. Build Validation

- `pnpm check`：PASS，Svelte 0 errors / 0 warnings，scripts/API TypeScript PASS
- `pnpm build`：PASS，adapter-static 完整写入 `build`
- 未运行 full `pnpm test`、`vercel build` 或 remote Preview deployment
- 未修改 routing helper，因此未重复 `deploy:verify:routes`

构建仍有既有的 generated enemy asset 缺失降级提示；它不会阻塞构建，与本阶段无关。

## 14. Manual Verification Items

新增的 desktop/mobile Playwright spec 已启动一次，但本机没有 Playwright `chromium_headless_shell-1234`，四个 project case 均在 browser launch 前停止。按照 Phase 3 验证纪律，没有下载浏览器、改端口或远程部署。

在具备对应 Chromium 的环境中运行：

```text
$env:PLAYWRIGHT_REUSE_BUILD='1'; pnpm exec playwright test tests/e2e/player-character.spec.ts
```

需人工确认：Overview → Character cache reuse、真实面板与 Breakdown、disabled ranges、三态卡片、invalid/missing/API fallback，以及 mobile 单栏和无横向 overflow。英文 UID 保留已有 routing unit coverage，也应在浏览器 smoke 中目视确认。

## 15. Known Limitations

- 页面完整刷新会清空 Phase 2 module cache，并重新请求一次 BFF，这是既定行为。
- `enhanced` 本阶段只保留在 context，不驱动新的展示模式。
- 未知 Player stat field 只有 raw key/no icon fallback。
- Player Light Cone、Relic、Equipment、recommended affix 和 build score 留待 Phase 4。

## 16. Repository Integrity and Phase 4 Recommendation

- 网站仓库保持在 `develop`
- `TurnBasedGameData` clean，HEAD `4ce30f69b32dc259ab9a8da3ba57035485103221`
- `StarRailRes` clean，HEAD `d226befe3db13f2ec15f4161d5f34b1b607643fe`
- 未创建 remote Preview deployment

Phase 3 源码、定向测试、类型检查和生产构建满足完成条件，结论为 **PASS**。建议在完成上述单项浏览器人工验收后进入 Phase 4；本轮没有自动实施 Phase 4。
