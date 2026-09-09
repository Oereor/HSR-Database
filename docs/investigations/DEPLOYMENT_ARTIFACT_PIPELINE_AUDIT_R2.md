# Deployment Artifact / Pipeline Audit R2

## 1. Executive Summary

本轮仅进行了调查、计时、产物分析和验证，没有修改生产实现、测试、baseline、CI 或部署配置。下文的 **Measured** 均来自当前 `develop`、当前 lock 和本地生成产物；**Estimated** 是基于 byte-level 原型或阶段计时的推算，不能视为实施后的验收数字。用户观察到的 Vercel Preview 约 6 分钟单独标为 **Observed**，不与本地计时混用。

核心结论：

- **Measured — 当前基线：** `build/` 为 394,300,449 B、7,122 files；与 R1 及 Vercel 约 394.3 MB 基本一致。
- Enemy family 仍为 114,313,519 B。其 page-data 中，`statProgressions` 占约 73.92%；它已经是 R1 compact representation，剩余主要机会不是再做 route-local 去重，而是跨语言共享数值数据。
- Character family 为 43,380,532 B。最大可直接压缩点是 skill level 同时携带 `description` 与 `descriptionTokens` 等未被页面使用的 DTO 字段；临时 compact DTO 原型预计净省约 8.97 MB。base/enhanced 完整树并没有大规模可利用重复，简单 delta normalization 反而增加约 18 KB。
- Enemy non-default Monster shard 的部署净收益只有约 44 KB，不值得增加请求、文件和维护复杂度。Enemy coefficient reconstruction 也未达到候选门槛：当前精确 parity 依赖完整 1–100 piecewise tables、ratio/value、EliteGroup 和精确小数/null 语义，不是少量系数即可复现。
- **Measured — pipeline：** 本地 cold 381.571 s，紧接的 warm 131.187 s。cold 中 upstream preparation 130.025 s，data/asset ensure 与两次 verify 合计 195.488 s；warm 中最终 artifact verify 单项仍为 53.111 s，波动明显。
- 最突出的重复工作是：data manifest 的 2,122 个 artifact 在同一 `data:ensure` 中被完整 hash/parse 两次；asset ensure 与 verify 重建相同 requirements 并重复 existence checks；最终 verify 为 2,272 个唯一引用执行约 10,163 次逐段 `readdir`，而不是一次构建路径集合。
- 当前仓库没有常规 PR correctness workflow，只有 upstream 更新 workflow。因此“把 type/unit/data/E2E 从 Preview 移到 CI”必须以新增 required CI 与 branch protection 为前置条件，不能先删 Preview gate。
- 全量 E2E 的 Playwright test phase 为 4.3 min：274 passed、16 failed、1 flaky、3 skipped。失败既包括 stale copy/selector，也包括值得保留并修复的中文弱点分隔符、locale roundtrip 和 request interception race；没有证据支持删除整个 suite。
- **Recommended artifact scenario（Estimated）：** Character compact DTO + Search 直接读取现有 static index，可由 394.300 MB 降至约 381.3 MB，不引入 lazy shard。更激进的 Enemy shared-stat shard 与 Character interaction shard理论上可到约 344–350 MB，但会引入运行时 fetch、更多静态文件和更高 correctness 复杂度，应延后。
- **Recommended pipeline scenario（Estimated）：** 在 required PR CI 到位后，结合并行 upstream/asset stages、single-pass manifests 和高效 final reference closure，本地 cold 合理目标为 235–275 s，warm 为 65–85 s；Vercel 约 4.0–4.8 min。该 Vercel 数字是从本地阶段和用户观察外推，必须在平台日志中重新验收。

## 2. Scope and Baselines

调查范围包括 `package.json`、`upstream.lock.json`、两份历史部署存储报告、`scripts/deployment/*`、data/asset scripts、Enemy/Character server/view/route、Vitest/Playwright 配置、product baseline 脚本及 `.github/workflows`。

### 2.1 Artifact baseline

| Metric                   |     Measured current |
| ------------------------ | -------------------: |
| Total deployment         |        394,300,449 B |
| Total files              |                7,122 |
| HTML                     |        161,602,595 B |
| All JSON                 |         73,726,710 B |
| Route `__data.json`      |         69,645,498 B |
| `build/generated`        |         26,483,160 B |
| Generated general assets |        118,922,656 B |
| Generated enemy assets   |         16,186,948 B |
| All generated assets     |        135,109,604 B |
| `_app`                   | 691,687 B / 67 files |

单位均为十进制 bytes；报告中的 MB 也按 1,000,000 B 近似展示。`_app` 与历史 R1 相差约 0.4 KB，属于 bundle/hash envelope 的轻微变化，不影响结论。

| Family      |         HTML | `__data.json` |         Total |
| ----------- | -----------: | ------------: | ------------: |
| Enemy       | 84,035,503 B |  30,278,016 B | 114,313,519 B |
| Character   | 29,723,918 B |  13,656,614 B |  43,380,532 B |
| Endgame     | 32,499,246 B |  18,321,211 B |  50,820,457 B |
| Search      |  4,277,870 B |   5,054,616 B |   9,332,486 B |
| Light Cones |  8,355,467 B |   1,994,844 B |  10,350,311 B |
| Relics      |  2,623,258 B |     331,988 B |   2,955,246 B |

Search 的本次测量比 R1 的 9,332,484 B 多 2 B；视为生成 envelope 微差，不改变约 4 MB 重复判断。

### 2.2 Pipeline baseline

- **Observed — Vercel：** 用户报告 Preview 总耗时约 6 min。
- **Measured — local cold：** `pnpm deploy:build:clean` 381.571 s（6.36 min）；清除了本项目的可生成缓存与 upstream working trees 后重新执行。
- **Measured — local warm：** 紧接着 `pnpm deploy:build` 131.187 s（2.19 min）。
- cold 的 ensure/verify aggregate 为 195.488 s；warm 为 71.186 s。
- cold SvelteKit/Vite build 为 48.348 s；warm 为 51.955 s。

Vercel 时长还包含平台 checkout、依赖安装、cache restore/save、上传和机器差异，不能用本地 381.571 s 直接宣称平台回归或改善。

## 3. Post-R1 Artifact Breakdown

### 3.1 Enemy

Enemy family 的 114,313,519 B 包含 2,516 route files；其中 detail route（628 enemies × 2 locales）合计约 112.94 MB，其余为 catalog/envelope。detail route 的 HTML 约 83.13 MB、`__data.json` 约 29.82 MB。

每个 localized detail route（HTML + `__data.json`）分布：

| Statistic |   Bytes |
| --------- | ------: |
| Average   |  89,924 |
| Median    |  69,460 |
| p90       | 156,323 |
| Max       | 524,536 |

代表性 zh-CN route 与双语言四文件总量：

| Sample      |      ID |   zh HTML |   zh data | zh+en HTML/data |
| ----------- | ------: | --------: | --------: | --------------: |
| Small / p10 | 5012011 |  34,529 B |  10,463 B |        90,045 B |
| Median      | 4014022 |  51,570 B |  17,343 B |       138,911 B |
| p90         | 4012020 | 106,164 B |  49,624 B |       312,110 B |
| Extreme     | 1003010 | 335,875 B | 186,387 B |     1,046,797 B |

对 1,256 个 localized Enemy view 做临时 devalue 差分：

- 完整 view devalue：28,971,200 B。
- 去掉 `statProgressions` 后减少：21,414,914 B，即 **73.92%**。
- zh-CN stat delta 10,709,102 B；en stat delta 10,705,812 B。
- 628 对 route 的 locale-neutral projection 全部严格相同；每种语言投影约 15,629,625 B。它是 IDs、stats、combat metadata 等广义中性数据的上界，不等于可直接净省空间。

当前 SSR 只渲染默认 monster/默认 level 的可见 stats、skill 和页面结构；其他 monster、1–100 progression 与交互状态主要存在 hydration/bootstrap 和 `__data.json`。因此 HTML 大体积仍主要由 hydration data 驱动，而不是把所有 level/variant 展开成隐藏 DOM。由于 HTML 内嵌 devalue 与 `__data.json` 格式不同，本报告使用字段移除后的序列化差分作为 hydration proxy，没有把它误称为精确 visible-markup 字节数。

#### Non-default Monster

临时原型把非默认 Monster data 从 page DTO 移到同 deployment shard：

- page devalue 合计减少 15,224,763 B；这代表 HTML hydration 与 `__data.json` 各自可能减少的 source payload proxy。
- 新 shard JSON 合计 30,405,768 B。
- **Estimated net:** `2 × 15,224,763 - 30,405,768 = 43,758 B`。

即使不计索引、fetch/error-state 和约 1,256 个 locale shard files，收益也只有约 0.044 MB，应拒绝。

#### Coefficient reconstruction

`resolveCanonicalEnemyStats` 的输入包括 template base、MonsterConfig instance ratio/value、HardLevelGroup 对每个 stat 的 1–100 明确逐级 ratio（含 status probability/resistance）、EliteGroup ratios、stance conversion 和精确 decimal helpers。还存在缺失/无效引用转为 `null` 的 unavailable semantics。

`pnpm data:validate` 已对 628 enemies、2,649 monsters、264,900 level rows 从 canonical raw inputs 全量重算并通过。这证明“携带完整 piecewise inputs 可以精确重建”，不证明“少量 coefficients 可以重建”。本轮没有找到可以在 rounding、exceptional rows、group ratios 与 null semantics 下严格等价的低参数模型，因此 Candidate 3 **未通过 parity 候选门槛**。

### 3.2 Characters

Character family 为 43,380,532 B；194 个 localized detail routes 合计 43,054,678 B：HTML 29,468,838 B、`__data.json` 13,585,840 B。

| Statistic | HTML + data per localized detail route |
| --------- | -------------------------------------: |
| Average   |                              221,931 B |
| Median    |                              201,244 B |
| p90       |                              318,704 B |
| Max       |                              650,704 B |

Character generated JSON/devalue subtree audit（194 localized objects）：

| Subtree                              | Measured serialized bytes |
| ------------------------------------ | ------------------------: |
| Entire generated JSON                |              16,745,527 B |
| Entire route-view devalue            |              12,804,625 B |
| Profiles JSON                        |              16,305,436 B |
| Skill cards                          |              14,620,841 B |
| Traces                               |                 808,096 B |
| Eidolons                             |                 406,990 B |
| Special effects                      |                 441,369 B |
| Base stats                           |                 252,706 B |
| Equipment recommendation raw subtree |                  94,264 B |
| Identity                             |                  83,033 B |
| Energy                               |                  12,244 B |

不同序列化格式会共享字符串/引用，因此各 subtree 不能直接相加到 route total。

skills/traces/eidolons 的主要膨胀不是一个可共享的大 level table：1,270 个 level tables 中有 1,170 个 unique；12,939/14,316 个 description/token streams unique。真正明显的冗余是同一 level 同时保存可读 `description` 和 UI 实际使用的 `descriptionTokens`：前者 JSON 4,050,172 B，后者 9,091,507 B。另有 source/order/type/scaling 等页面未读 metadata，以及已另行解析却仍携带的 raw recommendation。

compact page DTO 临时原型删除这些未消费字段：

- duplicated `levels[].description`：devalue delta 4,241,699 B；
- raw equipment recommendation：108,274 B；
- 其他未读 metadata：134,384 B；
- 合并后 devalue delta：4,482,941 B（因引用共享，不能简单相加）；
- **Estimated deployment net:** HTML hydration 与 `__data.json` 各减一份，约 8,965,882 B。

#### Base / enhanced profiles

仅 10 个 unique characters（20 localized objects）有 enhanced profile。当前 base+enhanced profiles JSON 为 2,983,734 B；临时 `{shared/base, enhancedDelta}` keyed-array normalization 为 3,001,982 B，即增加 18,248 B。差异分散在技能/trace 关系中，通用 delta envelope 抵消了共享收益，因此不存在“大量完整 unchanged subtree 被复制”的证据。

SSR 的 `enhancedEnabled` 在 server render 对存在 enhanced 的角色为真；`{#key profileMode}` 只渲染 active profile，并不会同时生成 base 与 enhanced 隐藏 DOM。special-effect dialog 关闭时也不渲染 body。主要 hidden state 是 hydration data：inactive base profile、非默认 skill levels 和 popup entries，而不是隐藏 markup。

#### Interaction-only shard

较完整的临时 prototype：对 10 个 enhanced character 移出 inactive base profile，对 active profile 仅保留默认 skill level，并移出 hidden levels 与 special effects。

- page devalue delta：9,423,197 B；
- new shard JSON：13,471,974 B，其中 base profile 1,457,363 B、hidden levels 11,564,366 B；
- **Estimated net:** `2 × 9,423,197 - 13,471,974 = 5,374,420 B`。

它需要 runtime fetch/client state、`?enhanced=0` direct navigation、loading/error/fallback semantics，并增加约 194 个 localized shards（或采用更粗粒度但增加 fetch bytes）。收益真实但复杂度明显高于 compact DTO，应延后。

### 3.3 Locale Duplication

- Enemy：628/628 zh/en route pairs 的广义 locale-neutral projection 严格一致，每 locale 约 15.63 MB。仅 stats 的 deployment contribution 上界约 42.83 MB（两 locale × HTML/data 两份）；一个共享 stats shard 约 10.71 MB，理论净上界约 32.12 MB。实际必须保留默认 SSR stats/fallback/envelope，因此实施后预计收益会低于上界。
- Character：locale-neutral projection 约 816 KB/locale；83/97 character route pairs 完全一致，14 个 complex/enhanced routes 不一致。即便共享，deployment upper-bound 也只有低个位 MB，优先级低。
- Search：两份既有 static indexes 合计 3,983,263 B，而 Search route 又把相同搜索主体带入 HTML/data。改成浏览器直接读取现有 static index 的历史/本轮估算净省约 4.0 MB，不增加 shard 文件。

### 3.4 HTML vs Hydration / Page Data

Enemy 和 Character 都没有发现“大量 alternate state 同时渲染为 display:none DOM”。两者的重复形态是同一 route load result 同时进入 prerendered HTML hydration 与 `__data.json`，所以安全减少 page DTO 通常产生近似两份收益；拆 shard 时则必须减去新 static data 本体，不能只报告 page delta。

Character SSR 会渲染 active profile 的所有 skill cards/traces/eidolons，但每个 skill 仅显示默认/selected level 的 description；其他 levels 和 popup content 仅在 hydration data 中。Enemy SSR 也仅显示默认 variant/level。由此下一轮应先压缩 DTO，而不是做 DOM 条件渲染重构。

## 4. Artifact Optimization Candidates

### 4.1 Enemy

Candidate 1（locale-neutral shared stats）有最大的理论空间，但改变了 route 的同步数据保证，需要定义首屏 SSR、无 JS、fetch 失败、cache/version 与 direct navigation 合同。Candidate 2 几乎 storage-neutral。Candidate 3 没有小系数 parity 证据。

### 4.2 Characters

Candidate 6（compact DTO）由实际字段读取与 byte-diff 支撑，且不改变 runtime fetch，是 R2 最优先候选。Candidate 4 是负收益。Candidate 5 有约 5.37 MB 净空间，但维护复杂度较高。

### 4.3 Estimated Savings

| Candidate                                 |                                               Measured current bytes / proxy |                                        Estimated after |        Net saving | Risk     | Complexity |
| ----------------------------------------- | ---------------------------------------------------------------------------: | -----------------------------------------------------: | ----------------: | -------- | ---------- |
| 1. Enemy locale-neutral shared stat shard | stats devalue 21,414,914 B；deployment contribution upper-bound 42,829,828 B | one shared copy约 10,709,102 B + retained SSR/fallback | **≤32,120,726 B** | High     | Med–High   |
| 2. Enemy non-default Monster shard        |                                                      page delta 15,224,763 B |                                     shard 30,405,768 B |      **43,758 B** | Medium   | High       |
| 3. Enemy coefficient reconstruction       |                          264,900 rows parity only with full piecewise inputs |                     no compact equivalent demonstrated |      Not eligible | High     | High       |
| 4. Character profile normalization        |                                                                  2,983,734 B |                                            3,001,982 B |     **−18,248 B** | Medium   | Medium     |
| 5. Character interaction-only shard       |                                                       page delta 9,423,197 B |                                     shard 13,471,974 B |   **5,374,420 B** | Med–High | High       |
| 6. Character compact DTO                  |                                               page devalue delta 4,482,941 B |                                           no new shard |   **8,965,882 B** | Low–Med  | Medium     |
| 7. Search direct static-index read        |                              route 9,332,486 B + existing static 3,983,263 B |                          reuse existing static indexes |     **约 4.0 MB** | Low–Med  | Medium     |

这里 Candidate 1 是上界，不应加入承诺值；Candidate 6/7 的 estimate 也需在真实 build diff 中验收。

## 5. Deployment Pipeline Map

```text
upstream.lock.json
  ├─ validate lock
  ├─ prepare TurnBasedGameData sparse checkout
  ├─ check:scripts
  │    ├─ messages:check (generation/validation side effect)
  │    └─ tsc scripts
  ├─ data:search-names:check
  ├─ data:ensure
  ├─ assets:ensure:enemies (Nanoka manifest/network + generation)
  ├─ prepare StarRailRes sparse checkout
  ├─ assets:ensure
  ├─ assets:verify
  ├─ svelte-kit sync + vite build/prerender
  │    └─ messages plugin validation again
  └─ deploy:verify (final artifact/reference closure)
       ↓
     build/ → Vercel
```

`deploy:build` 内部直接调用 `pnpm exec vite build`，所以不会经过 package script 的 `prebuild`; prerequisites 已由 orchestration 显式执行。普通 `pnpm build` 则会先跑 `prebuild = data:ensure && assets:ensure`。

当前 correctness/test path：

```text
manual/package scripts
  ├─ check → messages:check → svelte-kit sync → svelte-check → check:scripts
  ├─ lint → prettier check → eslint
  ├─ test → vitest
  ├─ data:validate
  ├─ product:baseline:check → full data:sync + asset ensures + baseline compare
  └─ test:e2e → webServer `pnpm build` → Playwright desktop/mobile

.github/workflows/update-upstreams.yml
  └─ refresh aliases/names → deploy:build on detected upstream changes → PR

Vercel
  └─ deploy:build
```

仓库中没有常规 PR CI workflow 的证据，也无法从仓库确认 branch protection。该缺口是 CI/deploy 分工调整的前置 blocker。

## 6. Stage Timing Profile

| Phase                           |    Cold (s) |    Warm (s) | Cold share | Network           | CPU    | FS-heavy  | Cacheable?                      |
| ------------------------------- | ----------: | ----------: | ---------: | ----------------- | ------ | --------- | ------------------------------- |
| Lock validation                 |       0.001 |       0.002 |      <0.1% | No                | Low    | Low       | No need                         |
| TurnBasedGameData preparation   |      49.769 |       0.142 |      13.0% | Cold yes          | Low    | Medium    | Yes, pinned commit              |
| Script type checking            |       6.471 |       6.531 |       1.7% | No                | High   | Medium    | CI/task-cache candidate         |
| Official search names check     |       1.238 |       1.176 |       0.3% | No                | Medium | Medium    | Yes                             |
| Data ensure/generation          |      50.183 |       9.946 |      13.2% | No                | High   | High      | Yes, manifest exists            |
| Enemy asset ensure/generation   |      59.887 |       1.236 |      15.7% | Yes               | Medium | High      | Partly; freshness policy needed |
| StarRailRes preparation         |      80.256 |       0.194 |      21.0% | Cold yes          | Low    | Medium    | Yes, pinned commit              |
| General asset ensure/generation |      58.222 |       1.111 |      15.3% | No after checkout | High   | High      | Yes                             |
| General asset verification      |       5.744 |       5.782 |       1.5% | No                | Medium | High      | Reuse same-process scan         |
| SvelteKit/Vite build            |      48.348 |      51.955 |      12.7% | No                | High   | High      | Limited/large output            |
| Final build verification        |      21.452 |      53.111 |       5.6% | No                | Medium | Very high | Algorithmic improvement         |
| **Total**                       | **381.571** | **131.187** |   **100%** |                   |        |           |                                 |

final verify 单独再跑一次为 35.857 s，说明 21.452–53.111 s 存在显著 filesystem/cache/host 波动，不能用单次 warm 值断言回归。一次非特权 warm 尝试因环境网络/ACL 失败，已排除，不纳入成功样本。

## 7. Ensure / Verify Semantics

| Stage                     | Role                                             | Inputs / outputs                                                        | Side effects / failure                                                     | Walk / parse / hash / network                    |
| ------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------ |
| lock validation           | Validator                                        | lock schema/commits                                                     | invalid lock fails                                                         | small parse                                      |
| prepare upstreams         | Fetcher + validator                              | locked commit → `.upstream/*`                                           | clone/fetch/checkout                                                       | tree operations + network on cold                |
| `check:scripts`           | Compiler + validator                             | message sources, scripts TS                                             | Paraglide generation/check; type errors fail                               | parse/compile; no network                        |
| `data:search-names:check` | Validator                                        | official names and generated inputs                                     | drift fails                                                                | JSON/text parse                                  |
| `data:ensure`             | Validator + generator + cache manager            | locked data, TextMaps, schema/script versions → generated manifest/data | may regenerate; invalid artifact fails                                     | repeated walks, JSON parse, hashing              |
| enemy asset ensure        | Validator + network version resolver + generator | enemy catalog, Nanoka manifest/version → images/manifest                | fetches latest manifest even on valid local cache; missing/stale generates | stat/parse/hash + network                        |
| general asset ensure      | Validator + generator                            | route requirements + StarRailRes → optimized images/manifest            | generate missing/stale                                                     | many JSON parses/stats/image CPU                 |
| general asset verify      | Deep validator                                   | same requirements + manifest + output images                            | missing, fingerprint or invalid image fails                                | repeated requirements/existence + Sharp metadata |
| SvelteKit/Vite            | Generator + prerender validator                  | app + generated inputs                                                  | emits `build/`; route/build errors fail                                    | CPU/FS intensive                                 |
| final deploy verify       | Artifact validator                               | `build/` HTML/JSON/assets                                               | missing/exact-case reference fails                                         | full text walk/read + repeated directory scans   |

`ensure` 不是纯检查：它同时决定 cache validity、生成/下载缺失内容并在结束后验证。`verify` 保护的是更深的内容/引用合同；语义不能全部删除，但可以共享刚计算的 manifest、requirements 和 path index。

## 8. Duplicate Work and I/O

### 8.1 Data

`data:ensure` 的 `cacheValid()` 先调用 `validateGeneratedArtifacts(manifest)`，之后读取双 locale homepage/catalog/search inputs；TextMap digest 还需对两份完整 TextMap read → parse → stringify → hash。ensure 结束时再次调用 `validateGeneratedArtifacts(manifest)`。

结果是在 unchanged warm build 中，2,122 manifest artifacts 被完整 hash/parse 两次，并两次递归检查 generated trees。当前 warm `data:ensure` 仍为 9.946 s。正确的优化边界是“同一进程中把第一次 validated manifest/result 传给后续阶段”，而不是取消最终合同。

### 8.2 Assets

general asset ensure 与 verify 都重新解析 zh/en character、light-cone、relic catalogs 及大量 detail JSON，重建相同 requirement set、读取 manifest/fingerprint、验证 coverage，并执行 manifest-file existence checks。verify 的额外独立价值是对全部 generated images 做 `sharp(...).metadata()` 深检。

可合并的是 requirement construction、manifest load、coverage 和 existence scan；image decode/metadata verification应保留，但可消费 ensure 返回的已知 path set。

enemy ensure 在 manifest/cache 已有效时仍请求 Nanoka latest manifest。它保护“跟随外部最新版本”的 freshness，而非 pinned reproducibility；网络故障会产生等待后 fallback。必须先由产品定义 freshness owner（locked version、TTL 或 main-only refresh），才能安全 cache/skip。

### 8.3 Final artifact closure

静态 instrumentation 统计 final verify：

- 递归扫描 4,375 个 text files；
- 读取 236,020,965 B；
- 发现 128,848 次 resource reference occurrences；
- 去重后只有 2,272 个 URL；
- `existsWithExactCase` 按 URL 每段执行，估算触发约 10,163 次 `readdir`。

建议一次 walk 建立 `build/` relative-path + exact-case set，对 unique URLs 做 O(1) closure；HTML/JSON 内容读取仍保留。build 前的 asset verify 和 build 后 closure 保护不同边界，不应简单删掉后者。

## 9. Incrementality and Cacheability

| Stage           | Complete fingerprint                                                 | Deterministic output   | Unchanged skip?                | Existing marker         | Safe direction                                                      |
| --------------- | -------------------------------------------------------------------- | ---------------------- | ------------------------------ | ----------------------- | ------------------------------------------------------------------- |
| Data generation | lock commit + TextMap digest + schema/script/search versions         | Yes                    | Yes                            | generated manifest      | single validation/result reuse；content-addressed artifact cache    |
| General assets  | StarRailRes commit + requirement fingerprint + image/schema versions | Yes                    | Yes                            | asset manifest          | ensure/verify share requirement/path/metadata results               |
| Enemy assets    | catalog fingerprint + upstream asset version + schema                | Yes for pinned version | Conditional                    | enemy manifest          | first choose pinned/TTL freshness contract                          |
| Vite/prerender  | source + generated manifests + toolchain                             | Mostly                 | Technically yes                | framework intermediates | cache smaller intermediates; avoid assuming whole build portability |
| Final verify    | exact `build/` tree                                                  | Yes                    | only if build identity trusted | none                    | single-pass path index; still verify produced artifact              |

当前 generated cache 总量也不小：`src/lib/generated` 379,302,051 B，general assets 118,922,656 B，enemy assets 16,186,948 B。缓存可以省 CPU/I/O，却会增加 restore/save bytes；需按 cache hit rate 与传输耗时验收，而不是只看本地 warm。

## 10. Vercel Build Cache / Task Cache Assessment

Vercel 当前官方文档说明默认 build cache 上限为 1 GB、保留约一个月，key 受 team/project、framework preset、root directory、Node version、package manager 和 Git branch 等影响；failed build 不更新 cache。自动列出的典型缓存主要是 dependency/framework caches，文档没有承诺自动缓存本项目的 `.upstream`、`src/lib/generated` 或自定义 generated-assets。参见 [Vercel — Troubleshoot a build / build cache](https://vercel.com/docs/deployments/troubleshoot-a-build)。

Build Output API 可通过 `.vercel/output/config.json` 的 `cache` 显式列出 source-build cache paths，但本项目当前使用 adapter-static `build/`，没有该 config，也就没有证据表明正在使用此机制。参见 [Vercel Build Output API configuration](https://vercel.com/docs/build-output-api/configuration)。

本地 `.upstream/TurnBasedGameData` 为 472,882,878 B，`.upstream/StarRailRes` 为 793,212,687 B，合计 1,266,095,565 B，单是完整 upstream trees 就超过默认 1 GB。即使允许自定义 cache，也不适合原样整体缓存。当前最可能实际受益的是 dependency/framework cache；upstream warm checkout 和 generated manifests 的命中情况必须从 Vercel build logs 另行验证。correctness 绝不能依赖 cache 命中。

**Turborepo decision: Do not recommend now; revisit later.** 当前是单 package、线性 11-stage orchestration。并行两个 upstream、single-pass scans、manifest result sharing、职责分离和 required CI/deploy split 已能取得大部分收益。只有在出现多 package/task graph，或经过测量确认需要跨构建复用多个“小而稳定”的 content-addressed outputs 时，才值得重新评估远端 task cache。

## 11. Validation and Test Inventory

| Command / nested path                                                 | Protects                                      |                         Measured/observed cost | Current signal                                             | Deploy critical?                                          | CI critical?                            |
| --------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------: | ---------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------- |
| `messages:check`                                                      | i18n compile/completeness                     |                  nested in checks/build plugin | pass                                                       | build needs compiled messages; duplicate invocation可消除 | Yes                                     |
| `check` → messages → kit sync → svelte-check → `check:scripts`        | app/script type correctness                   |                       about 24 s wall observed | pass; 1 existing unused-CSS warning                        | No, with required PR CI                                   | Yes                                     |
| `lint` → Prettier → ESLint                                            | formatting/static quality                     |                            stopped at Prettier | fails on pre-existing docs/README formatting; ESLint未执行 | No                                                        | Yes after debt is baselined/fixed       |
| `test` → Vitest                                                       | unit/domain/product contracts                 |                             22.16 s; 423 tests | 421 pass, 2 stale expectations fail                        | No                                                        | Yes                                     |
| `data:validate`                                                       | raw-to-generated semantic parity              |                                         47.3 s | pass; known missing TextHash warnings                      | No                                                        | Yes on relevant PR/main                 |
| `product:baseline:check` → full `data:sync` + asset ensures + compare | approved product surface/data baseline        |                                   about 62.7 s | one stale homepage tagline                                 | No                                                        | Main/release; targeted PR when relevant |
| `test:e2e` → `pnpm build` → Playwright desktop/mobile                 | navigation, SSR/hydration, a11y/product flows | test phase 4.3 min; full command also rebuilds | 274 pass, 16 fail, 1 flaky, 3 skip                         | smoke only                                                | selected PR; full main/release          |
| `assets:verify`                                                       | source generated asset completeness/content   |                     cold 5.744 s, warm 5.782 s | pass                                                       | Yes, but reuse ensure scan                                | Yes as producer contract                |
| `deploy:verify`                                                       | emitted artifact/reference closure            |                                21.452–53.111 s | pass                                                       | Yes                                                       | clean build CI too                      |
| `deploy:build`                                                        | pinned inputs → deployable artifact           |                                 cold 381.571 s | pass                                                       | Yes, trimmed to artifact prerequisites                    | Main/release clean build                |

`data:validate` 通过时记录到 544 个 CHS TextHash missing warnings、每 locale 1,144 search records 与 190 English Endgame shards；这些是可见诊断，不是本轮失败。

## 12. Baseline Drift

| Baseline/assertion        | Current expected product behavior                                 | Old expectation                             | Classification                     | Proposed update                                         |
| ------------------------- | ----------------------------------------------------------------- | ------------------------------------------- | ---------------------------------- | ------------------------------------------------------- |
| Homepage tagline          | zh 当前为“——愿此行，终抵群星”                                     | `HONKAI: STAR RAIL DATA ARCHIVE`            | Intentional product change / stale | 审核新文案后同步 unit/product/E2E baseline              |
| Enemy rank (en)           | `Normal`, `Elite`, `Boss`                                         | `Normal Enemy`, `Elite Enemy`, `Boss Enemy` | Intentional copy change / stale    | 集中更新 message contract，避免多处手写 exact copy      |
| Footer zh                 | “本站为玩家制作的非官方数据网站”                                  | “本站为非官方玩家制作的数据网站”            | Intentional copy change / stale    | 产品确认后更新单一 baseline source                      |
| Changelog date            | semantic `<time datetime="2026-09-03">2026年9月3日</time>`        | raw visible `2026-09-03`                    | Obsolete implementation detail     | 改断言为 `time[datetime]` + localized display contract  |
| Navigator secondary brand | 当前品牌布局没有 `HSR Data Archive` exact text                    | 必须出现该字符串                            | Obsolete selector/copy detail      | 保留导航/可访问名称测试，删除旧品牌字符串依赖           |
| Hero baseline selector    | 当前 DOM 不再有 `.entity-overview-card [data-label-size="large"]` | 依赖旧 selector                             | Obsolete implementation detail     | 以稳定 semantic/test id 选择核心 hero metric            |
| Weakness separator zh     | 中文 aria 应使用 `、` 的 locale-aware 读法                        | 当前组件无条件 `.join(', ')`                | Likely real regression             | 保留测试，修产品或由产品明确批准逗号行为后再改 baseline |

“likely real regression” 是基于当前 `EnemyWeaknessGroup.svelte` 对所有 locale 无条件使用 ASCII comma 的证据；最终产品标点合同仍需 owner 确认。

## 13. Test Hygiene Classification

- **KEEP:** unit/domain parity、data validation、asset manifest/content validation、final artifact closure、navigation/a11y、locale roundtrip、asset fallback、核心 hero 行为。
- **UPDATE BASELINE:** homepage tagline、English rank wording、footer word order；先由产品 owner 确认，再一次性同步 unit/product/E2E expectations。
- **MERGE:** 同一 exact marketing copy 不应在 unit、product baseline 和 desktop/mobile E2E 各自维护字符串。保留一个 message/product contract，E2E 只验证关键页面消费它。data/content invariants 通常只跑一个 viewport。
- **REMOVE（仅断言级，不删 suite）：** raw localized date 字符串、旧 secondary-brand exact text、旧 CSS selector 这些已无独立 regression value；替代 coverage 分别是 semantic `datetime`、导航可访问合同、稳定 hero metric selector。
- **MOVE TO CI:** app/script types、Vitest、format/lint、full data parity、product baseline、绝大多数 E2E；前提是 required checks + branch protection。
- **KEEP IN DEPLOY BUILD:** lock/input validity、generated requirements/fingerprint、required assets、Svelte build、final emitted-reference closure。
- **RUN ON MAIN ONLY:** full desktop/mobile E2E、full product baseline/full clean data parity 可放 main/release；PR 对相关路径运行 targeted validation 和 selected E2E。
- **FIX FLAKY:** Search locale switch roundtrip 的 hydration/navigation wait；overview missing-icon interception 的 cache/route race。两者仍有独立价值，不应删除。

E2E 结果中的 16 failures 是 8 类逻辑问题在 desktop/mobile 展开：stale changelog date、rank、tagline、footer、navigator/hero 旧 contract，weakness separator regression，以及 Search roundtrip/asset interception 执行问题。mobile missing-icon 首次失败、retry 通过，正式标为 1 flaky。重复的 `_vercel/insights/script.js` 404 是本地 preview analytics noise，不是失败根因。

Playwright `fullyParallel`、16 workers、2 projects、retry=1；`test:e2e` 还先通过 webServer 运行 `pnpm build`，其 `prebuild` 再跑 data/assets ensure。建议将大而混合的 `site.spec.ts` 按 domain/viewport 拆分调度；内容 invariant 单 viewport，responsive interactions 两 viewport；复用一次已验证 build fixture。此建议改变执行方式，不降低 coverage。

## 14. Deploy Build vs CI Responsibility

### Proposed three-layer contract

```text
PR CI (required, blocks merge)
  ├─ messages / app + scripts type checks
  ├─ lint / formatting
  ├─ Vitest
  ├─ relevant data validation
  └─ selected semantic E2E smoke

Vercel Preview
  ├─ validate pinned inputs
  ├─ ensure deterministic required generated data/assets
  ├─ SvelteKit build/prerender
  └─ efficient final artifact/reference closure

main / release CI
  ├─ full data parity + product baseline
  ├─ full desktop/mobile E2E
  └─ clean deployment build/verify
```

Preview 不必重复所有 repository correctness tests，但坏 commit 必须由 required PR CI 阻止。当前仓库只有 `update-upstreams.yml`，没有可见的常规 PR workflow，branch protection 也无法由 repository files 证明。因此调整顺序必须是：先落地并验证 required CI/branch protection，再从 Preview critical path 移出 tests；manual workflow 或“开发者记得运行”不足以承担 correctness ownership。

## 15. Optimization Scenarios

### 15.1 Artifact Size

| Scenario     | Contents                                                                   | Estimated result from 394.300 MB |
| ------------ | -------------------------------------------------------------------------- | -------------------------------: |
| Conservative | Character compact DTO only                                                 |                  **约 385.3 MB** |
| Recommended  | compact DTO + Search direct existing static index                          |                  **约 381.3 MB** |
| Aggressive   | recommended + Character interaction shard + Enemy shared stats upper-bound |                **约 344–350 MB** |

Aggressive range保留了 Enemy 默认 SSR/fallback/envelope 未在原型中精确扣除的不确定性；不应承诺 343.8 MB 的数学上界。

### 15.2 Build Duration

| Scenario     | Changes                                                                                                                                                     |                            Local cold |             Local warm |                        Vercel total |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------: | ---------------------: | ----------------------------------: |
| Current      | Measured/Observed baseline                                                                                                                                  |                  **381.6 s measured** |   **131.2 s measured** |               **约 6 min observed** |
| Conservative | single-pass final path index；share asset requirements/existence；消除 data ensure 内二次 full validation                                                   |               **330–355 s estimated** | **85–105 s estimated** |           **5.3–5.9 min estimated** |
| Recommended  | conservative + parallel upstream preparation；data ready 后并行 enemy/general assets；required CI 到位后移出 type/search check；same-process manifest reuse |               **235–275 s estimated** |  **65–85 s estimated** |           **4.0–4.8 min estimated** |
| Aggressive   | smaller content-addressed outputs/task cache with verified hit rate                                                                                         | **55–75 s cache-hit local estimated** |             same range | **2.5–3.5 min cache-hit estimated** |

Aggressive 并不建议立即实施：Vercel cache restore/upload、1 GB limit 与 branch-specific keys 可能吞掉收益。所有估算需用至少 3 次 cold/warm 本地样本和 Vercel phase telemetry 验收。

### 15.3 Trade-offs

- Enemy shared stats：最多约减 32.1 MB，但可能增加约 628 shared files、runtime fetch、cache/version 与 failure state；空间收益最大，正确性风险也最大。
- Character interaction shard：约减 5.37 MB、增加约 194 files 和交互 fetch；在 compact DTO 后实际收益还需重测，当前不优先。
- Enemy non-default shard：约减 0.044 MB 却增加上千文件/请求，明确不值得。
- generated/upstream cache：省 build CPU/I/O，但 materialized caches 可能达数百 MB，完整 upstream 已 1.266 GB；会增加 cache transfer/storage，不能把 cache 当 correctness source。
- Search direct read：复用已存在文件，不增加 deployment file count，是最干净的 size trade-off。

## 16. Recommended Implementation Order

### R2-A — Restore test signal and CI ownership

产品确认 stale copy 后更新 baseline；重写 obsolete selectors；修 Search/asset interception flaky；建立 required PR CI 与 branch protection。此批不改变产物架构，是后续缩短 Preview critical path 的安全前提。

### R2-B — Pipeline single-pass and role separation

先优化 final closure path index、data manifest validation reuse、asset requirement/existence sharing；加入稳定阶段 telemetry。随后在保持 lock/manifest/final closure owner 不变的前提下并行两个 upstream 与独立 asset stages。

### R2-C — Low-risk artifact reduction

实施 Character compact DTO，并逐字段做 UI usage、route byte diff、unit/E2E 与 clean-build verification；之后实施 Search 读取既有 static index。目标约 381 MB。

### R2-D — Advanced shards/cache only if still needed

先对 Enemy shared-stat shard做完整 SSR/no-JS/direct-navigation/failure prototype，再决定是否接受约 628 files 与 runtime contract。Character interaction shard次之。暂不做 Enemy coefficients、non-default Monster shard或 Turborepo。

## 17. Verification Plan

每个实施批次应独立验收：

1. 在 clean working tree/locked upstream 上记录至少 3 次 cold 与 3 次 warm stage timings，报告 median/p90，不以单次值决定。
2. 产物变更执行 full `data:validate`、unit、selected/full E2E、clean `deploy:build` 与 `deploy:verify`；对所有 route 重算 total/HTML/`__data.json`/generated/assets bytes。
3. DTO 改动对 zh/en representative small/median/p90/max route做 byte diff，并验证 SSR、hydration、client navigation、无 JS 和 direct URL。
4. shard 方案必须报告 `page HTML delta + __data delta - new shard bytes`，并纳入新增 files、请求、404/version mismatch 与 offline fallback。
5. pipeline 合并不得只“跳过 check”：每个被移除步骤要在表中指定新的 correctness owner，并通过故意破坏 fixture证明 gate 会失败。
6. CI/deploy split 上线前验证 PR required checks、branch protection 和 main/release workflow；失败/取消 workflow 必须阻止 merge。
7. Vercel 使用同 branch 连续 Preview 测 cache-hit，并在 cache miss、Node/package-manager/framework key change 情况下验证仍能从零正确构建。

本轮已执行并记录：cold/warm deploy builds、独立 final verify、`data:validate`、`check`、`lint`、Vitest、product baseline check 与 full Playwright E2E。临时分析/instrumentation 脚本已删除；没有更新 baseline 或保留生产变更。

## 18. Open Questions

1. 产品 owner 是否确认 tagline、rank、footer 与 localized changelog date 为当前正式文案？中文 weakness separator 应继续要求 `、` 吗？
2. GitHub 组织层是否另有仓库外 required workflow/branch protection？在确认前不能假设 PR CI 已承担 gate。
3. Vercel 实际 logs 中 dependency/framework cache 的 restore/save bytes 与命中率是多少？`.upstream`/generated 是否曾被自定义缓存？
4. Enemy asset freshness 应是每个 Preview 查询 Nanoka latest，还是由 pinned version / scheduled main refresh 管理？这个选择决定能否安全 skip network。
5. Enemy shared-stat shard是否接受无 JS/网络失败时只保留 default SSR stats，以及 client navigation 多一次请求？若不能，32.12 MB upper-bound 会显著缩小。
6. 381 MB 是否已满足 deployment cost/limit 目标？若满足，不应为 5 MB 级收益引入 Character runtime shards。

结论：先恢复可靠 CI/test signal，再做 single-pass pipeline 与 Character compact DTO/Search 复用；其余高复杂度 shard/cache 只有在这些低风险收益仍不足时再进入实现评审。
