# Deployment Storage / Prerender Payload Audit

> 调查日期：2026-09-08  
> 代码分支：`develop`  
> 数据锁定：TurnBasedGameData `8cdb905dc2f8e6fffa9be4eb07af3e34435d6091`；StarRailRes `d226befe3db13f2ec15f4161d5f34b1b607643fe`  
> 口径：除特别注明外均为未压缩文件字节；MB 为 10^6 bytes，MiB 为 2^20 bytes。`Measured` 表示本地构建/源码对象实测，`Estimated` 表示按实测差值外推。

## 1. Executive Summary

本次正式运行 `pnpm deploy:build` 成功，最终 `build/` 为 **7,122 files / 697,613,677 bytes（697.614 MB / 665.296 MiB）**。这与给定 Vercel baseline 697,611,144 bytes 相差 2,533 bytes（0.00036%），可视为完全复现。

结论如下：

1. **主因是 Enemy detail 的完整 1–100 级属性表按 MonsterConfig 变体展开，不是图片，也不是技能/ExtraEffect。** 628 个 Enemy detail 共展开 2,649 个 Monster、264,900 行等级属性。Enemy page-data 大小与 Monster 数/等级行数的 Pearson 相关系数均为 **0.9997**，与唯一技能数的相关系数为 **-0.13**。
2. Enemy family（含两个目录页）占 **417,626,269 bytes / 59.86%**；其中 628 个 detail route 的双语言 HTML + `__data.json` 占 **416,255,529 bytes**。
3. `8002050` 的异常来自 **1 个 MonsterTemplate → 76 个 MonsterConfig 变体 → 7,600 行等级属性**。它每个 locale 只有 3 个唯一技能、1 phase/Monster、无 summon、无 ExtraEffect；中文 `detail` 的 devalue 序列化为 2,519,921 bytes，其中原始 view 的 `stats` 子树为 2,795,379 bytes。该 route 四个文件合计 **10,332,425 bytes**。
4. SvelteKit 为首屏 hydration 把 load data 以内联 JavaScript 对象写入 HTML，又为客户端导航生成 `__data.json`；因此同一大对象在每个 locale 的部署产物中出现两次。再乘以 zh-CN/en，形成约 `628 × 2 locales × (HTML + page data)` 的架构乘数。
5. **没有发现大型 shared layout/global payload 泄漏。** layout 节点每页只有 123–126 bytes，只含 `locale`、`siteVersion`、`siteUrl`。TextMap 是 build-time lookup；Search index 只在 Search route 和独立 `/generated/{locale}/search.json` 中出现，未进入 Enemy detail。
6. 当前 `EnemyDetailView` 已经做了两项正确的去重：删除生成态 `defaultMonster` 的值复制，并把每个 Monster 的完整 skill 改为轻量 phase reference + route 级 `skillDefinitions`。剩余真正的大头是 `Monster.stats.levels`；简单删除 UI 未使用字段只能节省约 **3.5 MB/deployment**。
7. 建议的第一个实施点是 **Enemy presentation DTO 中的 compact stat progression**：用定长 tuple/columnar 结构代替每级七个 `{status,value}` 对象，并保持现有静态站、双语与页面交互。候选 DTO 的 devalue 实测从双语言 **185.80 MB 降为 38.27 MB**；因为同一 payload 同时影响 HTML 与 `__data.json`，预计部署总量可降到约 **400–420 MB**。进一步按值共享相同 progression，预计约 **390–410 MB**。

## 2. Current Deployment Architecture

正式入口 `package.json#deploy:build` 调用 `scripts/deployment/build.ts#runDeploymentBuild`，执行顺序为：

```text
upstream.lock.json
  ├─ TurnBasedGameData sparse checkout（build-time only）
  │    ├─ ExcelOutput/*.json
  │    └─ TextMap/TextMapCHS.json + TextMapEN.json
  └─ StarRailRes sparse checkout（build-time only）
          │
          ▼
scripts/data/sync.ts + scripts/data/domain/* + scripts/data/projection/*
          │
          ├─ src/lib/generated/views/{locale}   （server/build-time input）
          ├─ static/generated/{locale}          （deployment artifact）
          └─ static/generated-*-assets          （deployment artifact）
          │
          ▼
SvelteKit +page.server.ts / +layout.server.ts
          │
          ▼
SSR / prerender（adapter-static）
          │
          ├─ build/**/*.html                    （deployment artifact）
          ├─ build/**/__data.json               （deployment artifact）
          └─ build/_app                         （deployment artifact）
```

`scripts/deployment/build.ts` 的实际阶段是：锁文件校验与 sparse checkout → `check:scripts` → `data:search-names:check` → `data:ensure` → enemy assets ensure → general assets ensure/verify → `svelte-kit sync` → `vite build` → `deploy:verify`。`svelte.config.js` 使用 `@sveltejs/adapter-static`，从 generated manifest 构造 zh-CN 无前缀与 `/en` 两套 prerender entries，最终 Vercel 提交目录就是 **`build/`**；本仓库没有 `vercel.json`，也没有 `.vercel/output/static` 二次展开。

`.upstream/`、`src/lib/generated/` 和 `.svelte-kit/output/server/` 都只是构建输入/中间产物，不进入 `build/`。`static/generated*`、`static/generated-assets` 和 `static/generated-enemy-assets` 会原样复制到 `build/`。route load 返回值会进入该 route 的 HTML hydration 数据与 `__data.json`；detail route 又分别对两个 locale 生成。

## 3. Local Build Output Baseline

### 3.1 总量与扩展名（Measured）

| Extension    |     Files |           Bytes |    Share |
| ------------ | --------: | --------------: | -------: |
| `.html`      |     2,153 |     308,188,907 |   44.18% |
| `.json`      |     2,156 |     230,454,043 |   33.04% |
| `.png`       |     1,887 |      74,568,728 |   10.69% |
| `.webp`      |       476 |      60,442,578 |    8.66% |
| no extension |       380 |      22,499,897 |    3.23% |
| `.xml`       |         1 |         732,657 |    0.11% |
| `.js`        |        48 |         567,927 |    0.08% |
| `.css`       |        18 |         123,316 |    0.02% |
| other        |         3 |          35,624 |   <0.01% |
| **Total**    | **7,122** | **697,613,677** | **100%** |

单独识别出的 route `__data.json` 为 **226,372,831 bytes**；`.json` 扩展名总量还包含 manifests/index 等。HTML + route data 为 **534,561,738 bytes / 76.63%**。

### 3.2 主要目录（Measured）

| Directory / family        | Files |       Bytes |
| ------------------------- | ----: | ----------: |
| `en/`（全部英文 route）   | 2,151 | 268,320,698 |
| `enemies/`（中文）        | 1,257 | 208,099,704 |
| `generated-assets/`       | 2,153 | 118,922,656 |
| `generated/`              |   382 |  26,483,160 |
| `endgame/`（中文）        |   231 |  25,279,753 |
| `characters/`（中文）     |   195 |  21,021,131 |
| `generated-enemy-assets/` |   212 |  16,186,948 |
| `light-cones/`（中文）    |   339 |   4,982,469 |
| root files                |    12 |   3,694,689 |
| `search.html`（中文）     |     1 |   2,509,919 |
| `relics/`（中文）         |   121 |   1,386,098 |
| `_app/`                   |    67 |     691,270 |

主要二级目录：`generated-assets/light-cones` 55,661,292 bytes，`generated-assets/characters` 49,033,299 bytes，`generated-assets/character-details` 7,770,037 bytes，`generated-assets/relics` 6,288,990 bytes，`generated-enemy-assets/icons` 16,088,650 bytes；`generated/en` 13,289,053 bytes，`generated/zh-CN` 13,194,107 bytes。

JS + CSS 合计只有 **691,243 bytes**；它不是存储问题。

## 4. Route Size Breakdown

下表的 route 数为 localized route 数；detail 数量是 97 characters、169 light cones、60 relics、628 enemies，另含各自的 zh/en 目录页。Median/P90/Max 的 combined 是按同一路由 HTML + data 配对计算。

| Family        | Localized routes |  HTML files / bytes |  Data files / bytes |  Combined bytes | Avg / route |    Median |       P90 |       Max |
| ------------- | ---------------: | ------------------: | ------------------: | --------------: | ----------: | --------: | --------: | --------: |
| enemies       |            1,258 | 1,258 / 230,620,920 | 1,258 / 187,005,349 | **417,626,269** |     331,976 |   177,307 |   776,400 | 5,167,443 |
| endgame       |              232 |    232 / 32,499,478 |    232 / 18,321,211 |  **50,820,689** |     219,055 |   255,233 |   310,932 |   325,749 |
| characters    |              196 |    196 / 29,724,114 |    196 / 13,656,614 |  **43,380,728** |     221,330 |   200,877 |   318,704 |   650,704 |
| light-cones   |              340 |     340 / 8,355,807 |     340 / 1,994,844 |  **10,350,651** |      30,443 |    28,980 |    35,428 |   136,305 |
| search        |                2 |       2 / 4,277,870 |       2 / 5,054,616 |   **9,332,486** |   4,666,243 | 4,615,241 | 4,717,245 | 4,717,245 |
| relics        |              122 |     122 / 2,623,380 |       122 / 331,988 |   **2,955,368** |      24,224 |    23,300 |    25,643 |    92,945 |
| homepage      |                2 |         2 / 85,228* |           2 / 8,209 |     **93,437*** |      46,719 |    45,816 |    47,621 |    47,621 |
| miscellaneous |                1 |           1 / 2,110 |                   0 |           2,110 |       2,110 |     2,110 |     2,110 |     2,110 |

\* `index.html` 与 `en.html`；原始分类脚本把 `en.html` 归入 miscellaneous，表中为人工纠正后的 homepage 口径。

Enemy detail（不含目录页）的精确值：中文 HTML 114,649,373 bytes、中文 data 93,235,780 bytes、英文 HTML 115,060,529 bytes、英文 data 93,309,847 bytes，合计 **416,255,529 bytes**。每个 detail 的四文件 combined median 为 **354,409 bytes**，P90 为 **1,552,598 bytes**，最大为 **10,332,425 bytes**。

## 5. Enemy Detail Findings

### 5.1 Enemy Data Flow

| Layer             | Path / symbol                                                                                                                                | Input → output / responsibility                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| raw tables        | `.upstream/TurnBasedGameData/ExcelOutput/{MonsterTemplateConfig,MonsterConfig,MonsterSkillConfig,HardLevelGroup,EliteGroup,DamageType}.json` | 原始模板、具体 Monster、技能、等级倍率、elite 倍率、元素数据                                                 |
| raw localization  | `.upstream/TurnBasedGameData/TextMap/TextMap{CHS,EN}.json`; `scripts/data/localization.ts#loadTextMap`                                       | build-time hash lookup；不进入 domain/browser                                                                |
| parser/domain     | `scripts/data/domain/enemy.ts#buildEnemyDomain`, `buildMonster`, `buildSkill`; `EnemyDomain`, `EnemyMonsterDomain`, `EnemySkillDomain`       | 按 `MonsterTemplateID` 收集所有 `MonsterConfig`；解析 modifiers、weakness/resistance、skill refs、summons    |
| stat expansion    | `scripts/data/enemy-detail.ts#resolveCanonicalEnemyStats`; `EnemyStatProgression`                                                            | 将 template/config/hard-level/elite 数据物化成 level 1–100 的七项属性行                                      |
| locale projection | `scripts/data/projection/enemy.ts#projectEnemies`, `projectEnemy`, `projectSkill`                                                            | 对每 locale 解析最终 name/description/labels/ExtraEffect，并写完整 `Enemy` JSON                              |
| generated view    | `src/lib/generated/views/{locale}/details/enemies/{id}.json`                                                                                 | server/build-time `Enemy`；仍包含 `defaultMonster` 与 `weaknesses` 兼容复制                                  |
| server view       | `src/lib/server/enemies.ts#getEnemyDetail`; `src/lib/domain/enemy-view.ts#buildEnemyDetailView`                                              | 删除 `defaultMonster`/per-Monster full skills duplication，构造 `EnemyDetailView`；补 portrait URL           |
| route loader      | `src/routes/[category=category]/[id]/+page.server.ts#load`                                                                                   | 返回 `{category, config, detail, specialEffectTargets, equipmentRecommendation}`；Enemy 后两项为空/undefined |
| UI                | `DetailPage.svelte` → `enemy/EnemyDetailPage.svelte` → `EnemyStatsPanel.svelte`, `EnemySkillCard.svelte`                                     | hero、Monster selector、level slider、stats、resistance、summons、phase refs、skill definitions              |
| prerender         | SvelteKit adapter-static                                                                                                                     | `build/{locale?}/enemies/{id}.html` + `build/{locale?}/enemies/{id}/__data.json`                             |

Raw 字段与最终字段的关键映射：`MonsterTemplateConfig` 提供 identity/rank/baseStats；`MonsterConfig` 提供 `HardLevelGroup`、`EliteGroup`、五类 modifiers、weakness/resistance、summon/skill IDs；`HardLevelGroup` 与 `EliteGroup` 经 `resolveCanonicalEnemyStats` 派生完整 `stats.levels`；`MonsterSkillConfig` 和 `ExtraEffectConfig` 经 TextMap 投影为最终本地化 skill 文本。raw rows、TextMap、审计 diagnostics、引用索引都只存在于 build-time，没有直接序列化给页面。

### 5.2 Load Payload

所有会影响 Enemy 的 load 已检查：

| Load                           | Returned top-level data                                                           |                            Measured serialized size |
| ------------------------------ | --------------------------------------------------------------------------------- | --------------------------------------------------: |
| `src/routes/+layout.server.ts` | `locale`, `siteVersion`, `siteUrl`                                                |                                  123–126 bytes/page |
| detail `+page.server.ts`       | `category`, `config`, `detail`, `specialEffectTargets`, `equipmentRecommendation` | `8002050`: 2,520,352 bytes；其中 `detail` 2,519,921 |

没有相关 `+layout.ts` 或 `+page.ts`。`specialEffectTargets=[]` 和 `equipmentRecommendation=undefined` 对 Enemy 分别只占 4/2 bytes。不存在大 shared payload。

全量中文 Enemy `EnemyDetailView` 的 JSON 子树实测：`stats` 共 **97,210,205 bytes**；整个 view 共 102,445,806 bytes。换言之，JSON view 中约 **94.9%** 是等级属性表。devalue 后 628 个 detail 为 92,863,460 bytes，与实际中文 detail `__data.json` 93,235,780 bytes 的差值仅是 route/config/layout envelope。

`EnemyDetailView` 已将每个 Monster 的 `skills` 改为 `skillPhases[].skills` 的轻量 `{id,name,href,damageType}` 引用，并把完整技能放到一次性的 `skillDefinitions`。这一步有效避免了技能随 Monster 变体重复；当前技能不是主要大头。

### 5.3 UI Usage

| Data subtree                             | Representative size (`8002050`, zh JSON) | Used by UI?                                                             | Where                            | Reducible?                                         |
| ---------------------------------------- | ---------------------------------------: | ----------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------- |
| identity/description/portrait            |                                280 bytes | Yes（`kind`、top-level `rank/type/typeName` 不直接用）                  | `DetailPage`, `EnemyDetailPage`  | 少量                                               |
| `template`                               |                                      179 | Yes                                                                     | hero + template stats            | No                                                 |
| Monster IDs/group metadata               |                                    1,974 | `monsterId` Yes；`monsterTemplateId`, `hardLevelGroup`, `eliteGroup` No | selector/heading                 | Yes，收益小                                        |
| `monsters[].modifiers`                   |                                    9,926 | No                                                                      | —                                | Yes，收益小                                        |
| `monsters[].stats`                       |                            **2,795,379** | Yes                                                                     | level slider + `EnemyStatsPanel` | **表示法高度可压缩；可延迟非默认变体**             |
| weaknesses/resistances/special           |                                   23,752 | Yes                                                                     | attribute panels                 | 小幅                                               |
| summons                                  |                                      152 | Yes（本样本为空）                                                       | `CompactEntityCard`              | 已是轻量 reference                                 |
| `skillPhases`                            |                                   18,696 | Yes                                                                     | phase tabs/anchors               | 可将重复 name/damageType 改为 ID reference，收益小 |
| `skillDefinitions`                       |                                      789 | 大部分 Yes                                                              | `EnemySkillCard`                 | internal kind/label/status/phases 未使用，收益小   |
| full raw config / TextMap / search index |                                        0 | No，且未序列化                                                          | —                                | 无泄漏                                             |

UI 未使用但仍序列化的字段确实存在，包括 top-level `kind/rank/type/typeName`、Monster `monsterTemplateId/hardLevelGroup/eliteGroup/modifiers`、skill `kind/kindLabel/localizedTextStatus/phases`。不过全量候选剥离实测只令双语言 devalue 从 185,802,840 降至 184,064,566 bytes；即每份序列化减少 1.738 MB，计入 HTML + data 后约 **3.48 MB/deployment**。因此“删 unused fields”应做，但不能独自解决问题。

### 5.4 Representative Samples

| Sample         |      ID | Monsters / level rows | Unique skills / phases / effects |   zh data |   zh HTML | 4-file locale combined | Major zh subtree  |
| -------------- | ------: | --------------------: | -------------------------------: | --------: | --------: | ---------------------: | ----------------- |
| Small (约 P10) | 5012052 |               1 / 100 |                        1 / 1 / 0 |    38,404 |    56,865 |                190,704 | stats 37,197 B    |
| Median         | 8032040 |               2 / 200 |                        3 / 2 / 0 |    73,601 |    97,565 |                342,557 | stats 72,629 B    |
| Large (P90)    | 1002016 |            11 / 1,100 |                       2 / 11 / 0 |   369,106 |   407,072 |              1,552,598 | stats 404,519 B   |
| Extreme        | 8002050 |            76 / 7,600 |                       3 / 76 / 0 | 2,520,598 | 2,644,384 |             10,332,425 | stats 2,795,379 B |

全量相关系数：Monster count → devalue bytes **0.99968**；level rows → bytes **0.99968**；raw stats subtree → bytes **0.99968**；phase count → bytes 0.96150（因为本模型通常每 Monster 至少一个 phase）；unique skill count → bytes -0.13142。增长几乎是随 Monster/100-level progression **线性**，不是 skill/phase 内容超线性增长。

### 5.5 Enemy 8002050 Deep Dive

Raw 实测：1 个 `MonsterTemplateConfig`，76 个 `MonsterConfig`，全部使用 `HardLevelGroup=1`、`EliteGroup=1`；总 skill references 228，但仅 3 个唯一 skill ID；无 summon。生成态中文文件 `src/lib/generated/views/zh-CN/details/enemies/8002050.json` 为 **2,947,626 bytes**：

| Generated subtree                                            |     Bytes |
| ------------------------------------------------------------ | --------: |
| `monsters`                                                   | 2,909,312 |
| duplicated `defaultMonster` compatibility field              |    37,638 |
| template + identity + description + compatibility weaknesses |      <600 |

`buildEnemyDetailView` 去掉 `defaultMonster` 和 per-Monster skill definitions 后，中文 view 为 2,863,906 JSON bytes；其 76 个 Monster 共含：

- stats：2,795,379 bytes（97.61% of view）；
- skill phase references：18,696 bytes；
- resistances：17,947 bytes；
- modifiers：9,926 bytes；
- weaknesses：5,653 bytes；
- IDs/group metadata：1,974 bytes；
- one route-level skill definition list：789 bytes。

76 份 stats progression 按值只有 **14 份唯一数据**。因此这里同时存在两种问题：对象表示过于冗长（每级七个 `{status,value}`）和相同 progression 按值重复。多 phase 并不是该样本的原因：每 Monster 恰好 1 个 phase；ExtraEffect、summon 均为 0。

实际文件：

| File                             |          Bytes |
| -------------------------------- | -------------: |
| `enemies/8002050.html`           |      2,644,384 |
| `enemies/8002050/__data.json`    |      2,520,598 |
| `en/enemies/8002050.html`        |      2,646,859 |
| `en/enemies/8002050/__data.json` |      2,520,584 |
| **Total**                        | **10,332,425** |

## 6. HTML vs __data.json Analysis

`+page.server.ts#load` 的返回值成为 SvelteKit page data。Prerender HTML 末尾的 hydration bootstrap 以内联 JavaScript 对象再次包含完整 `detail`（在 `8002050.html` 中可直接找到最后一个 Monster ID `800205075`）；`__data.json` 则以 devalue flattened graph 保存同一 load data，供客户端导航/失效更新使用。

因此两者高度相关但不逐字相同：HTML 还含 SSR markup、head、CSS/JS links，并使用 JavaScript object literal；`__data.json` 有 data envelope 和引用表。`8002050` 中文 HTML 比 data 大 123,786 bytes，但两者都包含完整 76×100 stats payload。页面初始 SSR 实际只渲染默认 Monster 的 7 个当前等级数值，巨大的 HTML 增量主要不是可见 markup，而是 hydration data。

不能手工删除 `__data.json`。正确控制点是缩小/重塑 load return；这样 HTML inline payload 与 `__data.json` 会同时下降，约获得 **2× 单份 payload delta** 的部署存储收益。

## 7. Localization / Locale Duplication

中文 route output 约 267 MB，英文为 268,320,698 bytes；双语静态生成的约 2× 是预期架构成本，不是 bug，也不应删除英文站点。

需要优化的是 locale-neutral 数值结构也随 locale 复制：中文所有 Enemy `stats` JSON 子树为 **97,210,205 bytes**；英文具有相同数值结构和规模。`8002050` 的 raw stats 在两个 locale 均为 2,795,379 bytes；中文/英文最终 data 仅差 14 bytes。这说明约 2.52 MB/locale 的 page data 几乎全是语言无关结构。

TextMap 路径是 `loadTextMap` → `TextResolver` → `scripts/data/projection/enemy.ts` 的 build-time lookup → final localized strings。完整 TextMap/dictionary 没有进入 generated detail、route load 或 browser。跨 locale 共享静态数值 shard 在理论上可再去重，但会引入 locale route 与公共数据资源的组合加载；优先级低于先压缩单 locale DTO。

## 8. Shared Layout / Global Data Audit

`src/routes/+layout.server.ts` 只返回：

```ts
{
  (locale, siteVersion, siteUrl);
}
```

在最大四类 route 的实际 `__data.json` 中，layout devalue 均只有 123–126 bytes。`+layout.svelte` 使用 site version、locale、URL，并没有接收 catalogs、all-enemy map、aliases、TextMap 或 FlexSearch index。

Enemy detail page node 的顶层字段实测：`category` 11 B、`config` 78 B、`detail` 2,519,921 B、`specialEffectTargets` 4 B、`equipmentRecommendation` 2 B。结论：**不存在 shared/global multiplication；异常完全属于 detail node。**

## 9. Characters / Endgame / Search Findings

### Characters

Characters family 为 43,380,728 bytes；97 个中文 generated detail 共 8,075,911 bytes（median 74,591，P90 134,860，max 294,047）。最大 page data 是英文 character `1415`：248,805 bytes；page node 248,562 bytes，其中 `detail` 237,357、`specialEffectTargets` 7,497、resolved `equipmentRecommendation` 3,671。

没有 raw config/TextMap/global index 泄漏。两个 profile 是当前 UI 的 enhanced toggle 所需；skills/traces/eidolons 也在 UI 使用。一个明确的小重复是 loader 返回 resolved `equipmentRecommendation` 时，完整 `detail` 仍保留 build-oriented recommendation IDs；双 locale 194 个 detail 的该字段 JSON 总计只有 **94,264 bytes**，不是优先目标。Characters 可能受益于 presentation DTO，但没有发现 Enemy 式的百级表乘以大量 variant 的严重模式。

### Endgame

Endgame family 为 50,820,689 bytes。最大 data `en/endgame/moc/1018/__data.json` 为 127,485 bytes，几乎全部是 `group`（127,226 bytes）。

`src/lib/server/endgame.ts#getEnemyReference` 虽读取完整 generated enemy detail，但 `src/lib/domain/endgame-view.ts#resolveEndgameEnemyReference` 立即裁成 `{name, rank, weaknesses, portraitUrl, exists}`；`buildOccurrenceView` 再附加 occurrence-local HP/speed/toughness。**Endgame 没有把完整 Enemy detail/stats/skills 带进 page data。** 同波相同 occurrence 会由 `presentedStageWaves` 合并为 `count`；跨 wave/node 的同敌人仍按展示位置重复轻量卡片。可考虑 route-local reference table，但需另行量化，不能作为本轮 P0。

### Search

Search family 为 9,332,486 bytes。最大英文 Search page node 2,544,480 bytes：

| Field               | devalue bytes |
| ------------------- | ------------: |
| `searchIndex`       |     2,221,173 |
| `enemies` catalog   |       223,471 |
| characters catalog  |        38,310 |
| relics catalog      |        21,585 |
| light cones catalog |        20,203 |
| enemy portraits     |        19,284 |

Search index 同时作为 `build/generated/{locale}/search.json` 存在（约 1.992 MB/locale），又由 `search/+page.server.ts` 读取并嵌入 Search HTML/data。它没有泄漏到其他 route，但 Search route 内确有约 **4.44 MB**（两 locale、HTML + data）的可避免嵌入；未来可让 Search 客户端直接读取已有静态资源。其优先级低于 Enemy。

## 10. Static Asset Sanity Check

`generated-assets` 118,922,656 bytes，`generated-enemy-assets` 16,186,948 bytes，合计 135,109,604 bytes / 19.37%。pipeline 使用 sparse checkout、按 manifest ensure，并在 build 后由 `deploy:verify` 扫描 4,375 个文本文件验证引用闭包；没有整体复制 StarRailRes。

对 2,365 个 generated asset 做 SHA-256 内容去重：73 个 duplicate groups，理论重复浪费仅 **417,770 bytes（0.31% of assets；0.06% of deployment）**，主要是不同角色/技能 ID 指向相同小 PNG。未发现两个 asset namespace 间的大文件级重复。资源复制策略总体合理；反向“每个文件必被当前 HTML literal 引用”不能由闭包校验证明（部分 URL 由 manifests/runtime 解析），但没有证据表明存在大批未引用源图。

结论：**Static assets are not the primary target.** 不建议本轮优先迁移 Blob/CDN。

## 11. Root Causes

| Class                            | Finding                                                                 | Evidence / impact                                                 |
| -------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **P0 Direct payload bloat**      | 完整 1–100 `EnemyStatProgression` 为每个 Monster 按 verbose object 展开 | 264,900 rows；stats ≈94.9% of Enemy view；size correlation 0.9997 |
| **P0 Direct payload bloat**      | 一个 template 的全部 Monster variants 同页返回                          | `8002050`: 76 variants / 7,600 rows                               |
| **P0 Direct payload bloat**      | 相同 stat progression 按值重复                                          | `8002050`: 76 copies, only 14 unique                              |
| P0 minor                         | UI 未使用 internal/group/modifier/skill metadata                        | 仅约 3.48 MB/deployment saving                                    |
| **P1 Shared/global duplication** | 未发现 layout/global leakage                                            | layout 123–126 B；TextMap/Search absent from Enemy                |
| P1 route-local                   | Search 已有 static index，又嵌入 Search route                           | 约 4.44 MB 可减少，不跨所有 route                                 |
| **P2 Static multiplication**     | 628 details × 2 locales × HTML/data                                     | Enemy detail 416.26 MB；同一 load data 两种产物                   |
| P2 localization                  | locale-neutral stats 在 zh/en 重复                                      | 每 locale raw stats 97.21 MB                                      |
| P3 assets                        | static images                                                           | 135.11 MB；duplicates only 0.418 MB；非主因                       |

问题不是 full raw config、完整 related Enemy、TextMap dictionary、Search index 或 ExtraEffect graph 被泄漏；也不是 phase duplication导致 `8002050`。真正的“完整 nested object”是同模板下所有 concrete Monster detail，尤其每个 Monster 的完整等级 progression。

## 12. Optimization Candidates

| Priority | Change                                                            |                    Expected saving / deployment | Risk        | Complexity  | Notes                                                           |
| -------- | ----------------------------------------------------------------- | ----------------------------------------------: | ----------- | ----------- | --------------------------------------------------------------- |
| P0       | Enemy presentation DTO：只保留 UI 字段                            |                       ~3.5 MB measured-estimate | Low         | Low         | 正确边界，但单独收益很小                                        |
| **P0**   | stat rows 改定长 tuple/columnar DTO                               |                           **~295 MB estimated** | Medium      | Medium      | devalue candidate 185.80 → 38.27 MB；HTML/data 同降             |
| P0       | progression reference table，按值共享                             | ~96 MB if used alone；在 compact 后额外约 10 MB | Medium      | Medium      | `8002050` 76→14 unique；需 `statsRef` mapper                    |
| P0       | `skillPhases` 只存 skill IDs，UI lookup definition                |                            <数 MB，待实现时量化 | Low         | Low         | 当前已较轻，不是主线                                            |
| P1       | Search 页面直接 fetch 已有 static search JSON                     |                                         ~4.4 MB | Low–Medium  | Low         | 不影响其他 route                                                |
| P1       | Character loader 不再把 raw recommendation IDs 留在 `detail`      |                                         ~0.2 MB | Low         | Low         | 可随 DTO 整理，不单独排期                                       |
| P1       | Endgame route-local enemy reference table                         |                       未量化，预计低至中个位 MB | Medium      | Medium      | 当前已是轻量 card DTO，先测后做                                 |
| P2       | 非默认 Monster stats 拆到 prerender static endpoint 并 lazy fetch |                       compact 后额外约 20–35 MB | Medium–High | Medium–High | 可减少 HTML/data 双份，仅交互时请求；需无 JS/失败 fallback 决策 |
| P3       | asset hash dedup                                                  |                                        ≤0.42 MB | Medium      | Medium      | 不值得优先改变稳定路径                                          |

### Option A — Presentation DTO / View Model

值得作为主方案，但应把重点放在 stat representation，而不是只删字段。当前 `EnemyDetailView` 已是 view model 的雏形；下一步可定义版本化的 `EnemyDetailPageData`，明确 UI contract，并为 stats 使用 tuple/columns。会新增 mapper/type boilerplate，但可通过 unit fixtures、schema helper 和字段使用审计控制维护成本；无需改变 prerender 架构。

### Option B — ID/reference instead of full nested objects

Summons 与 Endgame 已采用轻量 reference，做法正确。Enemy `skillPhases` 可进一步仅返回 skill ID；最有价值的是 `statsRef` 指向 route-local `statProgressions[]`。不要把 related Enemy 的完整 detail 引入 DTO。

### Option C — Deduplicate repeated phase/stat data

`8002050` 并无跨 phase 内容爆炸；应共享的是 progression。候选不压缩 row、只去重 progression 的双语言 devalue 为 137.61 MB（当前 185.80 MB），约节省 48.20 MB/serialization、96.4 MB/deployment。compact row 后 devalue 为 38.27 MB，再去重为 33.10 MB；额外收益缩小为约 10.3 MB/deployment。UI 复杂度只是 `monster.statsRef` 解引用，合理。

### Option D — Separate heavy optional data

非默认 Monster 的 stats 只有用户切换 variant 后才需要，是合适的 optional shard。可以 prerender JSON endpoint，不需要数据库/serverless。它把同一 compact data 从 HTML + `__data.json` 两份改为独立资源一份；仍占 Deployment Storage，但减少重复并改善初始传输。需验证 direct/client navigation、无 JS fallback、切换 loading/error、缓存路径和 locale-neutral shard 设计。

### Option E — Reduce prerender scope

不建议把全部 Enemy 改动态 SSR：会把 Deployment Storage 问题转为 Function Storage、请求成本、cold start 与运行时可靠性问题，并牺牲静态档案特性。若 DTO 优化后仍有极少数异常 route，可再评估仅对极端模板使用 shard；本次没有证据支持禁用 Enemy prerender。

### Option F — External storage / Blob

不优先。图片只占 19.37%，内容重复只有 0.42 MB。compact optional data 若未来仍很大，可将公共 locale-neutral shard 外置，但这只是把约几十 MB 从 Deployment Storage 移到 object storage，并增加请求、缓存、发布一致性和运维复杂度；先用同 deployment static endpoint 验证收益。

## 13. Estimated Storage Savings

以下均从 **697.614 MB measured baseline** 出发：

| Scenario        | Scope                                                                                                          | Calculation                                                                         | Estimated deployment |
| --------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------: |
| Conservative    | 删除 Enemy UI 未使用字段 + character recommendation 小重复                                                     | Enemy devalue delta 1.738 MB × HTML/data 2 + ~0.2 MB                                |        **约 694 MB** |
| **Recommended** | compact stat tuple；可同时按值共享 progression                                                                 | (185.80 − 38.27) × 2 = 295.1 MB；共享后上限约 305.4 MB                              |    **约 390–410 MB** |
| Aggressive      | Recommended + optional non-default stats static shard + Search 直接读取已有 index + 经测量的 Endgame ref dedup | compact shard 从 page 的两份变一份，另减 Search ~4.4 MB；预留实现 envelope/fallback |    **约 350–380 MB** |

Recommended 的核心候选是实物对象经过当前 devalue 5.9.0 序列化的测量，不是按压缩率拍脑袋；最终 HTML SSR 固定 markup、字段映射和 SvelteKit envelope 会产生少量偏差，所以报告给区间而非单点。即使只做到 400 MB，9 previews/day 的理论新增 retained output 也会从约 **6.28 GB/day** 降到约 **3.6 GB/day**；仍需配合 Vercel deployment retention/清理策略，但 retention 不是代码 payload 根因。

## 14. Recommended Implementation Order

1. 建立可重复的 build-output audit 脚本/CI artifact（本轮临时脚本不保留），固化本报告指标。
2. 定义 `EnemyDetailPageData`，先删除 UI 未使用字段，锁定组件 contract 与 golden fixtures。
3. 将 `EnemyStatProgression.levels` 改为 typed tuple/columnar presentation format；在 `EnemyStatsPanel` 边界解码，保持 domain/generated source模型可不变。
4. 加入 route-local `statProgressions[]` + `statsRef`，优先验证 `8002050`、`1002016` 和多变体交互。
5. 重跑完整指标；若已达到约 400 MB，先停止，避免过度架构化。
6. 再做 Search static index 直读；随后单独量化 Endgame reference normalization。
7. 只有在 retained storage 仍不达标时，才把非默认 variant stats 拆为 prerender static shard；最后才评估 external storage 或极端 route 的 prerender scope。

## 15. Verification Plan

下一轮每次候选变更至少运行仓库实际存在的命令：

```bash
pnpm messages:check
pnpm data:validate          # 若改变 data processing / generated schema
pnpm check
pnpm lint
pnpm test
pnpm deploy:build
pnpm deploy:verify
pnpm test:e2e              # UI/navigation 变更后
```

量化验收必须用同一脚本、同一 locked upstream 对比：

| Metric                              |                      Before |
| ----------------------------------- | --------------------------: |
| Total deployment output             | 697,613,677 B / 7,122 files |
| Enemy HTML total（含目录）          |               230,620,920 B |
| Enemy `__data.json` total（含目录） |               187,005,349 B |
| Enemy detail 4-file median / P90    |       354,409 / 1,552,598 B |
| Enemy `8002050` zh HTML/data        |     2,644,384 / 2,520,598 B |
| Enemy `8002050` 4-file total        |                10,332,425 B |
| Characters total                    |                43,380,728 B |
| Endgame total                       |                50,820,689 B |
| Search total                        |                 9,332,486 B |

功能验收：Enemy identity/template stats、1–100 slider、Monster selector、多 phase tabs、skills、ExtraEffect、summons/related links、weakness/resistance；zh-CN、English、locale switching；direct navigation、client-side navigation、404 与 prerender；Endgame enemy cards/HP；Search V2 query/filter/result navigation。特别 fixture：`5012052`、`8032040`、`1002016`、`8002050`，再加至少一个多 phase + ExtraEffect + summon 的样本（由数据查询选取，不硬编码臆造 ID）。

性能/正确性 gate：`8002050` 页面应能在无缺字段下将单 locale data 从 2.52 MB 降到候选上限约 0.13–0.36 MB；Enemy P90 data 应从约 369 KB 降到约 55–65 KB；外置 shard 时验证缓存、失败 fallback 与静态 host MIME/CORS。

## 16. Open Questions

1. 产品是否真的需要在一个 template 页面公开 76 个内部 MonsterConfig 变体？本轮按现有 UI 保留全部，不把“删变体”计入 saving；需要产品/数据语义确认哪些是玩家可区分的具体单位。
2. 1–100 每一级精确值是否必须离线即时切换，还是可由少量 coefficients 在客户端确定性计算？若公式能与 `resolveCanonicalEnemyStats` 完全等价，体积还可远低于 tuple；在建立跨 628 敌人的 parity test 前不要实施。
3. compact stats 应保持 locale route-local，还是发布一份 locale-neutral shared shard？前者简单可靠；后者多省约 16–33 MB，但提高发布一致性复杂度。
4. 非默认 variant lazy shard 的无 JavaScript与可访问性要求是什么？这决定它是渐进增强还是必须保留首屏全量 fallback。
5. Vercel retained deployment 的实际保留时长/自动清理政策需在平台侧单独确认。单次产物优化不能替代 deployment lifecycle 管理。

## Appendix A — Largest Files (Top 50, Measured)

|   # | Path                             |     Bytes |
| --: | -------------------------------- | --------: |
|   1 | `en/enemies/8002050.html`        | 2,646,859 |
|   2 | `enemies/8002050.html`           | 2,644,384 |
|   3 | `en/search/__data.json`          | 2,544,697 |
|   4 | `enemies/8002050/__data.json`    | 2,520,598 |
|   5 | `en/enemies/8002050/__data.json` | 2,520,584 |
|   6 | `search/__data.json`             | 2,509,919 |
|   7 | `en/search.html`                 | 2,172,548 |
|   8 | `search.html`                    | 2,105,322 |
|   9 | `generated/en/search.json`       | 1,991,753 |
|  10 | `generated/zh-CN/search.json`    | 1,991,510 |
|  11 | `en/enemies/1003010.html`        | 1,406,000 |
|  12 | `enemies/1003010.html`           | 1,403,727 |
|  13 | `en/enemies/1003010/__data.json` | 1,345,936 |
|  14 | `enemies/1003010/__data.json`    | 1,345,924 |
|  15 | `en/enemies/1013020.html`        | 1,300,818 |
|  16 | `enemies/1013020.html`           | 1,299,119 |
|  17 | `enemies/1013020/__data.json`    | 1,239,079 |
|  18 | `en/enemies/1013020/__data.json` | 1,239,021 |
|  19 | `en/enemies/8012010.html`        | 1,168,835 |
|  20 | `enemies/8012010.html`           | 1,167,688 |
|  21 | `enemies/8012010/__data.json`    | 1,119,382 |
|  22 | `en/enemies/8012010/__data.json` | 1,119,355 |
|  23 | `en/enemies/1022020.html`        | 1,072,272 |
|  24 | `enemies/1022020.html`           | 1,071,335 |
|  25 | `en/enemies/1002040.html`        | 1,059,871 |
|  26 | `enemies/1002040.html`           | 1,058,967 |
|  27 | `en/enemies/1013010.html`        | 1,032,019 |
|  28 | `enemies/1013010.html`           | 1,030,661 |
|  29 | `enemies/1002040/__data.json`    | 1,022,521 |
|  30 | `en/enemies/1002040/__data.json` | 1,022,477 |
|  31 | `en/enemies/1022020/__data.json` | 1,020,382 |
|  32 | `enemies/1022020/__data.json`    | 1,020,375 |
|  33 | `en/enemies/8013010.html`        |   990,698 |
|  34 | `enemies/8013010.html`           |   990,058 |
|  35 | `enemies/1013010/__data.json`    |   963,467 |
|  36 | `en/enemies/1013010/__data.json` |   963,365 |
|  37 | `en/enemies/1002050.html`        |   960,202 |
|  38 | `enemies/1002050.html`           |   959,520 |
|  39 | `enemies/8013010/__data.json`    |   934,250 |
|  40 | `en/enemies/8013010/__data.json` |   934,211 |
|  41 | `enemies/1002050/__data.json`    |   921,142 |
|  42 | `en/enemies/1002050/__data.json` |   921,066 |
|  43 | `en/enemies/1002030.html`        |   904,421 |
|  44 | `en/enemies/8003020.html`        |   904,396 |
|  45 | `enemies/1002030.html`           |   903,414 |
|  46 | `enemies/8003020.html`           |   903,000 |
|  47 | `en/enemies/1012010.html`        |   891,847 |
|  48 | `enemies/1012010.html`           |   890,835 |
|  49 | `enemies/1012010/__data.json`    |   859,379 |
|  50 | `en/enemies/1012010/__data.json` |   859,313 |

## Appendix B — Largest Enemy Routes (Top 20, Measured)

### By HTML (zh + en)

| Rank |      ID | HTML bytes |
| ---: | ------: | ---------: |
|    1 | 8002050 |  5,291,243 |
|    2 | 1003010 |  2,809,727 |
|    3 | 1013020 |  2,599,937 |
|    4 | 8012010 |  2,336,523 |
|    5 | 1022020 |  2,143,607 |
|    6 | 1002040 |  2,118,838 |
|    7 | 1013010 |  2,062,680 |
|    8 | 8013010 |  1,980,756 |
|    9 | 1002050 |  1,919,722 |
|   10 | 1002030 |  1,807,835 |
|   11 | 8003020 |  1,807,396 |
|   12 | 1012010 |  1,782,682 |
|   13 | 1023010 |  1,619,067 |
|   14 | 8003030 |  1,562,376 |
|   15 | 8001020 |  1,551,265 |
|   16 | 1012030 |  1,524,456 |
|   17 | 2022010 |  1,517,157 |
|   18 | 1002020 |  1,509,886 |
|   19 | 2023030 |  1,479,344 |
|   20 | 8001010 |  1,477,392 |

### By `__data.json` (zh + en)

| Rank |      ID | Data bytes |
| ---: | ------: | ---------: |
|    1 | 8002050 |  5,041,182 |
|    2 | 1003010 |  2,691,860 |
|    3 | 1013020 |  2,478,100 |
|    4 | 8012010 |  2,238,737 |
|    5 | 1002040 |  2,044,998 |
|    6 | 1022020 |  2,040,757 |
|    7 | 1013010 |  1,926,832 |
|    8 | 8013010 |  1,868,461 |
|    9 | 1002050 |  1,842,208 |
|   10 | 1012010 |  1,718,692 |
|   11 | 1002030 |  1,705,320 |
|   12 | 8003020 |  1,702,074 |
|   13 | 1023010 |  1,516,086 |
|   14 | 8001020 |  1,485,518 |
|   15 | 8003030 |  1,463,653 |
|   16 | 1012030 |  1,431,332 |
|   17 | 1002020 |  1,417,451 |
|   18 | 2022010 |  1,413,277 |
|   19 | 8001010 |  1,402,700 |
|   20 | 8003010 |  1,386,314 |

### By combined locale output (HTML + data)

| Rank |      ID | Combined bytes |
| ---: | ------: | -------------: |
|    1 | 8002050 |     10,332,425 |
|    2 | 1003010 |      5,501,587 |
|    3 | 1013020 |      5,078,037 |
|    4 | 8012010 |      4,575,260 |
|    5 | 1022020 |      4,184,364 |
|    6 | 1002040 |      4,163,836 |
|    7 | 1013010 |      3,989,512 |
|    8 | 8013010 |      3,849,217 |
|    9 | 1002050 |      3,761,930 |
|   10 | 1002030 |      3,513,155 |
|   11 | 8003020 |      3,509,470 |
|   12 | 1012010 |      3,501,374 |
|   13 | 1023010 |      3,135,153 |
|   14 | 8001020 |      3,036,783 |
|   15 | 8003030 |      3,026,029 |
|   16 | 1012030 |      2,955,788 |
|   17 | 2022010 |      2,930,434 |
|   18 | 1002020 |      2,927,337 |
|   19 | 8001010 |      2,880,092 |
|   20 | 2023030 |      2,860,664 |
