# Enka Migration Infrastructure Phase 1

日期：2026-09-22  
上游数据：TurnBasedGameData `4ce30f69b32dc259ab9a8da3ba57035485103221`（4.5）

## 1. Executive Summary

Phase 1 已完成一条不依赖 MiHoMo 运行时数据的正式 Enka 基础链路：

```text
Enka HTTP / sanitized fixture
→ narrow decoder
→ CanonicalPlayerProfile
→ generated runtime lookup
→ PropertyContribution resolvers
→ stat aggregator
→ 现有 PlayerProfile UI DTO
```

生产 `/api/player` 未修改，仍由 MiHoMo 提供数据。新链路没有 provider flag，也没有进入 Player UI、CSS、Relic Score 或部署策略。它可以离线处理 fixture、执行完整数值合成并进行 fixture-only shadow comparison，为下一阶段的 shadow/cutover preparation 提供基础。

## 2. Scope

本轮实现了 canonical contract、Enka decoder/adapter/client、TTL cache、single-flight、generated runtime data、29 项属性语义注册表、纯函数 stat synthesis、UI DTO mapper、生成期强校验、sanitized golden fixtures、shadow comparison 和回归测试。

本轮没有切换生产 provider，没有删除或重构 MiHoMo parser，没有改公开成功/错误响应，没有改 UI/CSS/Relic Score，也没有执行任何 live Enka 或 MiHoMo 请求。

## 3. Previous Architecture

此前 Player Info 的实际流向是：

```text
MiHoMo HTTP response
→ api/_player/parse.ts
→ presentation-oriented PlayerProfile
→ Player UI
```

旧 `PlayerProfile` 是稳定且适合继续作为 UI 兼容边界的 DTO，但其中的 `PlayerStat.total`、遗器名称/套装/格式化词条等已经是 MiHoMo 解析后的 presentation data，不适合作为 provider-neutral 的玩家事实模型。MiHoMo parser 还按 `characterId` 保留第一次出现的角色，这一历史兼容行为仍只留在 MiHoMo production path。

## 4. Implemented Architecture

新增链路保持轻量函数边界，没有 service container 或 provider registry：

```text
api/_player/enka/client.ts
        ↓ PlayerFetchResult<CanonicalPlayerProfile>
api/_player/enka/decode.ts + adapter.ts
        ↓
src/lib/player/canonical.ts
        ↓
src/lib/generated/runtime/player.json
        ↓
src/lib/player/stat-synthesis.ts
        ↓
src/lib/player/contract.ts (existing UI DTO)
```

`pipeline.ts` 是 fixture/未来 server handler 可直接调用的组合入口。stat layer 没有网络、TextMap、UI state 或全局可变状态依赖。

## 5. Canonical Player Contract

`CanonicalPlayerProfile` 只描述玩家当前事实。每个 `CanonicalPlayerCharacterBuild` 是一次 build occurrence，identity 为 `area + position + sourceOrder`，因此同一个 `avatarId` 可以安全出现多次。

- `_assist=true` → `assist`；
- 非 assist 且有 `pos` → `showcase`；
- 其余 → `unknown`；
- 角色 `rank` 缺失时 eidolon 为 0；
- 光锥 superimposition 严格为 1–5；
- 遗器 canonical state 只保留 `tid/type/level/mainAffixId/affixId/cnt/step`；
- `step` 保持 optional；
- `_flat`、名称、图标、套装名和格式化数值都不进入 canonical model。

Transport metadata `region/ttl/fetchedAt/cacheHit` 位于独立的 `PlayerFetchResult.metadata`，不污染 profile。

## 6. Enka Decoder / Adapter

Decoder 从 `unknown` 开始逐字段验证，只解析当前确认的窄字段，并忽略新增未知字段。UID 不一致、核心结构缺失、字段类型错误和非法光锥 rank 都产生稳定的 `UPSTREAM_INVALID_RESPONSE`，内部 diagnostic 只保存字段路径，不保存完整 payload。

`avatarDetailList`、`relicList`、`skillTreeList` 缺失时规范化为空数组；equipment 缺失时保持无光锥。privacy、recordInfo 和 playerDisplayArea 只解析确认字段，playerDisplayArea 的附属展示数据不会进入 canonical model。

正式 fixture 删除了 nickname、signature、friendCount、头像、名片和所有 `_flat`，UID 替换为匿名测试 UID；nickname 缺失会在 presentation boundary 规范化为空字符串。

## 7. Generated Runtime Lookups

新增 locale-neutral、schema-versioned `runtime/player.json`，包含：

- 97 个 avatar promotion lookup；
- 169 个 light-cone promotion 与 rank AbilityProperty lookup；
- 742 个 relic TID identity；
- 117 个 main-affix 与 48 个 sub-affix lookup；
- 60 个 relic set lookup；
- 1,951 个 trace lookup；
- 97 个 avatar 的 eidolon SkillAddLevelList。

Artifact 只包含计算所需字段，不复制完整 upstream tables。Promotion 投影复用 `normalizeStatProgression` 的排序和基础属性语义；eidolon SkillAddLevelList 同时兼容当前上游的 object-map 形态，并在 UI DTO 映射时推导 effective skill level，但不进入 final stat accumulator。

`RelicConfig` 已加入中央 source/deployment requirement，因此现有 sparse checkout 会自动包含它，不需要单独修改 CI。

## 8. Property Semantic Registry

`PropertySemanticRegistry` 显式注册当前 pinned data 的 29 个 PropertyType。每项声明 target、`base|ratio|flat|direct` bucket、percent 语义及（适用时）visible UI field。实现没有使用 `startsWith`、`endsWith` 或其他名称 heuristic。

生成时会比较四类结构化 property source 的全集与 registry：未注册项强失败，registry 死条目同样强失败。`BaseSpeed` 明确进入 `speed.base`，而 `CriticalChanceBase` 进入 direct bucket。

## 9. Stat Aggregator

各 resolver 只产生 `PropertyContribution`。Aggregator 统一解释语义并执行：

```text
HP/ATK/DEF/SPD = base × (1 + ratio) + flat + direct
direct stats   = additive sum
```

Resolver 覆盖 avatar、light-cone base、light-cone AbilityProperty、relic main/sub affix、relic set 和 minor trace。套装按六槽 TID 计数；PointType 1 小行迹仅在 owned level > 0 时应用。实现不解析描述，不执行 Ability/Battle Script、大行迹、ExtraEffect 或 RankAbility。

All Damage、Incoming Healing 和 Elation 都保留在内部 values；当前 mapper 隐藏前两者，Elation 按既有 UI contract 输出。可见 stat 使用固定顺序，HP/ATK/DEF/SPD 继续整数截断，百分比保留一位小数。ERR synthesis 保存 bonus，既有 `formatPlayerStatTotal` 只在 presentation 层加 100% baseline。

未知 entity/affix/trace 只令对应 build 失败并携带 diagnostics，不令整个 profile 失败；未知 PropertyType 明确 fail closed。

## 10. TTL / Cache / Client Behavior

Enka client 固定请求 `https://enka.network/api/hsr/uid/{uid}/`，User-Agent 为：

```text
HSR-Database-PlayerInfo (+https://hsrarchive.cc)
```

单次 timeout 为 10 秒。网络错误、timeout、500、502、503、504 最多重试一次；400、404、424、429 不重试。进程内 cache 按 UID 和上游 ttl 缓存，命中时返回 `cacheHit=true`。ttl 缺失或为 0 时仅合并并发请求，不缓存已完成结果。同 UID 的 in-flight 请求只触发一次 fetch。

## 11. Error Mapping

| Enka/transport 状态 | 内部公开错误 |
| --- | --- |
| 400 | `INVALID_UID` |
| 404 | `PLAYER_NOT_FOUND` |
| 424、5xx | `UPSTREAM_UNAVAILABLE` |
| 429 | `RATE_LIMITED`，保留 `Retry-After` |
| timeout | `UPSTREAM_TIMEOUT` |
| JSON/decode failure | `UPSTREAM_INVALID_RESPONSE` |

没有扩张现有公开错误枚举，也没有记录 raw player payload。由于 Enka 尚未接入生产 handler，本轮只保留结构化错误/diagnostic；Phase 2 接入 shadow handler 时应按 code 记录无敏感信息的运维事件。

## 12. Golden Tests

Golden test 走正式 decoder → adapter → generated lookup → aggregator → mapper，不复制公式。sanitized fixture 保留 6 个 build 的计算事实，expected stats 位于独立 JSON：

- 6 builds；
- 51 个同状态 stat assertions；
- tolerance `1e-8`；
- 51/51 通过。

Fixture-only shadow comparison 对历史 MiHoMo fixture 的 56 项输出为：49 exact、2 tolerance-only、5 个已解释的 1409 snapshot drift、0 unexplained mismatch。1409 的 5 个 drift 值没有写成永久 golden mismatch expectation。

## 13. Generation-Time Validation

Generation 与 full validation 都会执行 runtime builder 的语义检查：

- property source 全集与 29 项 registry 完全相等；
- PointType 1 必须且只能有一个 StatusAddList，其他 PointType 不得携带它；
- RelicSet PropertyList 必须能规范化为 property/value；
- light-cone rank 必须完整覆盖 1–5 且不得重复；
- promotion MaxLevel 不得重复，并复用既有 progression ordering；
- relic slot、set、main/sub affix group 和 avatar rank reference 必须有效；
- 非有限数值、未知 PropertyType 和不合法 schema 都强失败。

合成坏数据测试覆盖 unknown PropertyType、PointType drift 和 RelicSet schema drift。

Manifest schema 从 43 升至 44；runtime artifact 纳入 required inventory、digest/dataRevision、locale-neutral 检查和独立 build-input validation。

## 14. Bundle / Generated Data Impact

`runtime/player.json` 为 566,165 bytes（未压缩 JSON），低于 600 KB 的 generation test 上限。它使用 keyed records，单 build 只遍历自身 traces、relic affixes 和命中的 set tiers，不扫描完整配置。

1000 次 warmed fixture pipeline 的本机测量为 237.4 ms，总计约 0.237 ms/profile、0.040 ms/build；这是量级检查，不是稳定 benchmark contract。

Enka pipeline 尚未被生产 `/api/player` import，因此当前 Player 客户端 bundle 和 production function path 没有 Enka runtime bundle 增量。生产等价 build 输出为 401,399,087 bytes（大量静态站点数据/资源），全部验证通过。真正 cutover 前应单独记录 server function bundle 的压缩体积和 cold-start 变化。

## 15. Compatibility With Existing UI

现有 `PlayerProfile`/`PlayerCharacter`/`PlayerStat` 继续作为 presentation DTO；mapper 派生遗器套装、词条最终值、display string 和固定 stats 顺序。UI 不接触 Enka 字段、PropertyContribution 或 bucket。Player Info UI、CSS 和 Relic Score 均未修改。

## 16. MiHoMo Production Path Status

`api/player.ts` 与 `api/_player/mihomo.ts` 没有 diff。Production `/api/player` 仍只调用 MiHoMo；没有 provider flag、默认值或隐式切换。现有 MiHoMo parser/handler 定向回归通过。

## 17. Remaining Validation Gaps

- `BaseSpeed → speed.base` 有显式结构/公式测试，但真实 golden fixture 未装备 LC 23036/23044，结论继续标记为 **Strongly inferred**。
- All Damage 与 Incoming Healing 已进入 internal synthesis 并验证不泄露到 UI，但尚无 visible UI golden validation；本轮也不应新增该 UI。
- Enka client 只使用 mocked fetch，未做 live network smoke；这是刻意保持普通测试离线。
- 当前没有生产 shadow handler/telemetry，因此 provider HTTP/decode/cache diagnostics 尚未进入实际运维日志。
- cutover 前仍需新增覆盖新版本 entity lag、privacy/showcase edge cases 和 server function bundle/cold-start 的验证。

## 18. Test / Build Results

| 验证项 | 结果 |
| --- | --- |
| Frozen dependency restore | `pnpm install --frozen-lockfile --offline` 通过，lockfile 未修改 |
| Data sync | 通过；97 characters、169 light cones、60 relic sets、628 enemies |
| Full data validation | 通过；2,125 artifacts、1,077 routes、190 English occurrence shards |
| New Phase 1 tests | 4 files、23 tests 通过 |
| Full unit suite | 54 files、573 tests 通过 |
| MiHoMo parser/handler regression | 通过 |
| API/scripts TypeScript | 通过 |
| Svelte check | 0 errors、0 warnings |
| ESLint | 0 errors |
| Changed-file Prettier | 通过 |
| Repository-wide `pnpm lint` | 被两个本轮前已存在且未修改的格式基线文件拦截：`.github/workflows/update-upstreams.yml`、`scripts/investigations/player-stat-synthesis-audit.mjs` |
| Production-equivalent build | 通过；2,154 public page indexes、4,393 text files resource closure |
| Upstream worktrees | TurnBasedGameData、StarRailRes 均保持 clean |

## 19. Recommended Phase 2

Phase 2 应新增一个不改变默认 provider 的 server-side shadow/diagnostic 入口：使用已实现的 Enka client 和 pipeline，对显式开发请求或受控样本输出结构化 diff；收集 decode、unknown-ID、cache 和 stat diagnostics，但不记录 nickname/signature/raw profile。随后补足 BaseSpeed、AllDamage/HealTaken、privacy/showcase、新 entity lag fixtures，测量 server function bundle/cold start，并制定逐步切换、回滚和 rate-limit 预算。完成这些验证后，再单独评审 production cutover。

## 20. Direct Answers

1. **Enka raw decoder 是否已达到 production-quality？** 是；窄解析、unknown ignore、required/type/UID 校验与稳定错误均已实现，并有 contract tests。
2. **Canonical PlayerProfile 是否已经脱离 MiHoMo schema？** 是；canonical 只保存玩家事实，现有 MiHoMo 风格 DTO 仅作为 presentation compatibility boundary。
3. **同 avatarId 多 build 是否已能安全表示？** 是；buildId 包含 area、position、sourceOrder，测试覆盖重复 avatarId。
4. **Enka `_assist` 是否完整保留？** 是；映射为 `display.area='assist'`，并与 showcase occurrence 分离。
5. **`_flat` 是否已经不再是 runtime dependency？** 是；canonical、runtime lookup 和 synthesis 都不读取或保存 `_flat`。
6. **所有当前 PropertyType 是否显式注册？** 是；当前全集 29 项，generation 会检查 completeness 与 dead entries。
7. **unknown PropertyType 是否 fail closed？** 是；generation 强失败，runtime mutation 也会令对应 build synthesis 失败并给出 diagnostic。
8. **stat aggregator 是否使用正式 production code 重现上一轮 golden 结果？** 是；正式 pipeline 完成 6 builds / 51 same-state assertions。
9. **HP / ATK / DEF / SPD 是否全部通过？** 是；same-state golden 全部在 `1e-8` 内通过，负 SpeedAddedRatio 与运算顺序另有 unit test。
10. **CRIT / Break / EHR / RES / ERR / Healing / elemental damage 是否通过？** 是；fixture 中存在的同状态项全部通过，ERR baseline 另有 presentation test；Incoming Healing 只验证 internal model，不宣称 visible UI golden。
11. **是否仍需要任何描述解析？** 不需要。
12. **是否仍需要 Ability/Battle Script？** 不需要；本轮明确不执行它们。
13. **runtime lookup 是否足够窄？** 是；566,165-byte deterministic lookup，只含 resolver 所需字段。
14. **generated data 对 bundle/build 的影响多大？** 新 artifact 未压缩 566,165 bytes；当前生产路径不 import Enka pipeline，客户端/生产 provider bundle 无接线增量，production-equivalent build 通过。
15. **Enka client 是否设置 custom User-Agent？** 是，`HSR-Database-PlayerInfo (+https://hsrarchive.cc)`。
16. **是否尊重 `ttl`？** 是；按 UID 缓存至 ttl，ttl 0/缺失只 single-flight。
17. **429 是否不会被立即 retry？** 是；直接映射 `RATE_LIMITED` 并保留 Retry-After。
18. **Production 当前是否仍然走 MiHoMo？** 是，生产入口没有改动。
19. **是否存在阻止进入下一阶段 shadow/cutover preparation 的 blocker？** 没有基础设施 blocker；上述 validation gaps 应作为 Phase 2 gate，而不是 Phase 1 阻塞项。
20. **Phase 2 应该具体做什么？** 建立受控 server-side shadow 路径和无敏感 telemetry，补 edge/gap fixtures，测量 function bundle/cold start，定义 rate-limit、灰度、回滚及最终 cutover 验收。
