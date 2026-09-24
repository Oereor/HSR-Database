# Relic Score Phase 2A — Server / API Integration Report

## 1. Executive Summary

正式 V1 评分已在 Player Info 服务端主链路按实际 Build 实例计算，并以精简、typed 的 `character.relicScore` 返回。现有 Player Info 字段及 provider 错误路径保持兼容。五件装备、单件解析失败、评分输入缺失都有显式可用性；未开始 Phase 2B UI。代码与本地验证已就绪。Vercel 项目设置在本地缺失，无法取得该平台生成的 `/api/player` 函数包实测值；见第 18、23 节。

## 2. Existing Player Info Server Flow

`/api/player` 获取 Enka 数据，经 strict decoder、provider adapter 转为 canonical build，合成最终 OOC numeric panel，再生成显示用 `PlayerProfile`。浏览器仍只请求原有 Player Info API。

## 3. Integration Point

`api/_player/enka/pipeline.ts` 在 `synthesizePlayerProfile` 后调用已有 `normalizePlayerBuildInput`、服务端评分 facade 和 presentation mapper，然后调用原有 `presentCanonicalPlayerProfile`。Soft Target 与 Hard Breakpoint 只消费 `SynthesizedPlayerCharacterBuild.values`，不解析格式化字符串。

## 4. Files Added / Changed

新增共享 DTO、纯 presentation mapper、服务端推荐读取与评分 facade，以及 benchmark 纯查表和版本常量模块。修改原 Player pipeline、归一化、评分源、数据生成/校验和相关测试。遗器卡片、Build Summary、CSS 与本地化文案均未改动。

## 5. Server Scoring Facade

`scorePlayerCharacterBuild` 接收一个实际实例的归一化结果，解析该角色的推荐，调用现有 `scoreProductionBuild`，映射为 API DTO。算法仍只在已有 `scoreBuild` 中；完整正式 benchmark 经 module-level loader 验证一次，生产评分以已验证上下文避免每件重新扫描完整 JSON。

## 6. Recommendation Resolution

数据同步从现有 `AvatarRelicRecommend* → CharacterDomain.equipmentRecommendation` 投影出 `runtime/relic-score-recommendations.json`，仅含 ID、套装、主词条和副词条列表，无本地化或光锥字段。生成 manifest 与 build-input validator 检查 artifact、角色覆盖和基本 schema。服务端静态导入并按角色 ID 查询；缺失不使用通用推荐。

## 7. Normalized Build Mapping

沿用 `normalizePlayerBuildInput`，内部按 canonical 遗器逐件解析。失败结果新增 `partialInput` 和按规范槽位索引的 `pieceFailures`；可解析单件仍保留原始数值、rarity、level、set 和 provider `cnt` 证据。缺槽仍返回 `MISSING_SLOT`，由 scorer 对部分输入计算单件结果。没有第二套归一化。

## 8. API / Presentation DTO

`PlayerCharacter.relicScore?` 是加法字段，运行时每个 character 均提供 `version: 1`、`build` 和按 `RelicSlot` 索引的 `pieces`。Build/Piece 各自是 available/unavailable 联合类型，原因是有限、稳定代码。DTO 仅保留 Phase 2B 显示和解释所需字段；不传输完整 Profile、概率模型、量化点或 debug 对象。

## 9. Piece Score Fields

可用单件返回未取整的 `score`、`mainCompletion`、`benchmarkPercentile`、`rawSubUtility` 和 `effectiveHits`。缺失槽位不设键；已装备但不可解析或不可评分的槽位返回 `unavailable`。关联采用规范槽位，不依赖展示数组顺序。

## 10. Build Score Fields

可用 Build 返回未取整的 `score`、`coreScore`、`statCompletion`（S）、`setIntegrity`（T）、`effectiveHits`、Soft Target 和 Hard Breakpoint 解释。所有比例沿用内部单位，`1.0 = 100%`。

## 11. Availability / Error Semantics

公开原因包括 `profile-unavailable`、`recommendation-unavailable`、`benchmark-unavailable`、`incomplete-build`、`piece-unavailable`、`panel-unavailable` 和 `score-unavailable`。内部 `invalid` 映射为公开 unavailable，不以 `0` 代表不可用。每个角色评分异常在 pipeline 内隔离并产生结构化服务端日志；异常原文不进入响应。

## 12. Effective Hits

DTO 原样保留 `exact/partial/unavailable`、`known`、`unknownRecommendedSubstats` 与 `total`。仅上游推荐副词条的 provider exact occurrence count 进入有效命中数；证据不全时 `total: null`。它不进入 Final Score。

## 13. Soft Target / Breakpoint Panel Mapping

Soft Target 每项公开 stat、最终 panel `currentValue`、min/max 和 progress；Hard Breakpoint 每项公开 stat、最终 panel `currentValue`、threshold 和 passed。没有本地化 label、遗器贡献推算或战斗 buff 模拟。

## 14. Duplicate Character Instance Handling

Enka adapter 的 `buildId` 含展示区域、位置和源顺序。pipeline 对每个 synthesized character 单独归一化和评分，再按 `buildId` 关联 presentation。测试证实两个相同 `characterId`、不同装备的实例得到不同 Build 状态。

## 15. Provider Failure Isolation

UID、超时、限流、decode 和 upstream 错误仍由原 `/api/player` 错误路径处理。评分失败不改变已成功获取的 Player Info 的 HTTP 200、原字段或缓存头；没有 fixture、旧数据或 synthetic player fallback。

## 16. Production Benchmark Loader Usage

生产 facade 仅调用 Phase 1E 的正式 loader；module state 缓存概率配置编译、预期身份、Profile、参考值及 benchmark 验证结果。stale/missing 以 unavailable 返回，不自动生成。`scorePiece` 的普通直接调用仍执行原验证；生产调用仅在 loader 已验证时跳过重复全量验证。

## 17. No-Runtime-Monte-Carlo Proof

生产请求依赖链的版本常量移到无生成逻辑的模块，CDF lookup 移到纯查表模块。`benchmark/identity` 对 prototype 的引用仅为 TypeScript type import；实际请求不 import/call natural generator、PRNG、calibration CLI、benchmark generator 或 Monte Carlo loop。测试对关键模块的运行时 import 作静态 guard；本地 API bundle 扫描无 `generateNaturalRelic`、`createSeededRng`。

## 18. Server / Client Bundle Boundary

正式 JSON 为 **4,471,496 bytes**，推荐索引为 **44,117 bytes**。对 `api/player.ts` 作本地 esbuild Node bundle 得 **5,248,446 bytes**（gzip **441,986 bytes**）；其中可检出正式 benchmark digest，证明产物进入需要评分的服务端入口。该值是打包代理测量，**不是 Vercel 最终函数大小**。`vercel build --target=preview` 因本地没有 project settings 而停止，同时 CLI 更新缓存遭 sandbox EPERM；按仓库验证规则未继续尝试远程工具。

当前 SvelteKit server output **1,872,253 bytes**；client JS 总 **626,891 bytes**。当前 client output、`build` 静态站点及旧 `.vercel/output/static` 均未检出正式 benchmark 的 identity digest、连续 quantile marker 或文件名；当前 SvelteKit server output 也未包含该独立 API 的 benchmark。没有可信的 Player API function 引入前同条件基线，不声称精确函数包增量。Phase 1E 报告记录的 client JS 总数也为 626,891 bytes，但仅作历史参照。

## 19. API Payload Size

六角色匿名 Enka fixture 的完整序列化 Player Info response 为 **31,320 bytes**，六个 `relicScore` 字段合计 **10,569 bytes**；一个完整角色评分字段为 **1,725 bytes**。无完整 benchmark、Profile 或概率配置出现在响应中。没有可信的同输入引入前 response 大小基线，因此不声称精确增量。

## 20. Performance

同进程本地 fixture：首次单角色评分 **38.73 ms**（含 loader 的首次校验，不含模块导入）；随后 100 次均值 **0.023 ms/角色**。首次完整六角色 pipeline（此时 loader 已热）**2.36 ms**；随后 20 次均值 **0.485 ms/response**；一次完整 response 序列化 **0.053 ms**。这些是本机粗略值，不含 provider 网络或平台冷启动。

## 21. Fixture / Contract Tests

现有匿名 Enka、合成 Build 和小型 benchmark fixture 覆盖六件/五件、低星、低等级、错误主词条、完整/破套装、Soft Target 与 Hard Breakpoint 边界、同 ID 不同 Build、Profile/推荐/benchmark 不可用及部分有效命中证据。API 测试验证新增字段、原字段不变、评分异常仍返回 200、provider 错误路径不变。mapper 测试将直接 scorer 结果逐项与 DTO 对照，检查精度与内部字段不泄露。

## 22. Existing API Compatibility

`PlayerProfile` 与既有 character 字段均未重命名或改 optional/null 语义；新增 `relicScore?`。API HTTP 状态、error envelope、成功缓存头和浏览器请求链不变。公开 union 位于共享 contract，Svelte 不 import 服务端 scorer。

## 23. Remaining Limitations

本地没有 Vercel project settings，未取得平台最终 `/api/player` 函数包大小或真实平台冷启动；server bundle 的 5.25 MB 是本地打包代理值。首次校验耗时和 payload 大小来自匿名 fixture，不代表所有玩家。正式数学与 benchmark 的 Phase 1D/1E 既有限制保持不变。

## 24. Phase 2B Readiness

前端可直接读取 `character.relicScore.build` 与 `character.relicScore.pieces[slot]`，不需要 Profile、推荐、benchmark、Enka raw schema 或评分公式。数据契约与本地构建已准备好；Vercel 最终函数包大小仍是部署前需在有 project settings 的环境补测的运行约束。

## 25. Tests / Build

- 相关 Vitest：**17 files / 110 tests passed**。
- Profile validator：97/97；farming validator：通过；正式 benchmark validator：582/582；生成 build inputs：2,126 artifacts 通过。
- Svelte check：0 errors / 0 warnings；scripts/API TypeScript、全仓 lint、`git diff --check`：通过。
- `pnpm check` 和 `pnpm build` 的 `tsx` CLI 因本机 IPC `EPERM` 在预备步骤停止；用 `node --import tsx` 完成同等脚本，直接 `pnpm exec vite build` 成功（约 24–26 s），静态站点写入 `build`。

## 26. `git status --short`

以下为报告写入后的工作区状态；未 stage 或 commit。两个只读上游仓库状态未改变：`TurnBasedGameData` clean，`StarRailRes` 保留原有 `?? icon/.DS_Store`。

```text
 M api/_player/enka/pipeline.ts
 M api/player.ts
 M scripts/data/generated-artifacts.ts
 M scripts/data/sync.ts
 M scripts/data/validation/build-inputs.ts
 M src/lib/player/canonical.ts
 M src/lib/player/contract.ts
 M src/lib/relic-score/benchmark/identity.ts
 M src/lib/relic-score/benchmark/lookup.ts
 M src/lib/relic-score/benchmark/validate.ts
 M src/lib/relic-score/farming/dense-quantile.ts
 M src/lib/relic-score/farming/generate-natural-relic.ts
 M src/lib/relic-score/farming/prng.ts
 M src/lib/relic-score/normalize.ts
 M src/lib/relic-score/score.ts
 M src/lib/relic-score/types.ts
 M src/lib/server/relic-score/score.ts
 M tests/unit/build-input-validation.test.ts
 M tests/unit/data-cache.test.ts
 M tests/unit/player-handler.test.ts
?? docs/relic-score-feature/phase-2a-server-api-integration-report.md
?? src/lib/player/relic-score-contract.ts
?? src/lib/relic-score/benchmark/cdf.ts
?? src/lib/relic-score/benchmark/versions.ts
?? src/lib/relic-score/presentation.ts
?? src/lib/relic-score/recommendations.ts
?? src/lib/server/relic-score/player.ts
?? tests/unit/relic-score-phase2a.test.ts

```
