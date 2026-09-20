# Build Pipeline Refactor Phase 2 — Data Validation — 2026-09-20

## Executive Summary

Phase 2 完成了 structural parity 去重和 data validation 分层，并保持 manifest schema 43、Phase 0 profile模型与Phase 1离线enemy snapshot边界不变。

- 每个cross-locale comparison现在只生成左右各一个projection；17项比较由68次projection降为34次，所有真实digest逐项不变，nested mismatch仍报告具体路径。
- `pnpm data:validate`继续表示完整语义审计，并显式alias到`data:validate:full`。
- Production改为运行独立的`data:validate:build-inputs`，从磁盘重新验证prepared source、TextMaps、manifest、2,124个artifacts和build-consumer closure，不再重新构建整个业务语义模型。
- `Correctness`仍是完整semantic validation owner；Preview和Development没有增加昂贵validator。
- updater没有重新加入deployment build或full validator；producer checks与mutation-specific enemy/search checks负责维护PR的即时反馈，`develop → main`的required `Correctness`负责独立完整证明。

```text
BEFORE

Producer -> generated artifacts
Production -> full semantic validator -> build -> output closure
Correctness -> same full semantic validator -> repository checks -> build -> smoke

AFTER

Producer -> generated artifacts + prepublication checks
Production -> build-input validator -> build -> output closure
Correctness -> build-input validator + full semantic audits -> repository checks -> build -> smoke
Preview/Development -> unchanged lightweight Phase 0 paths
```

## Structural Parity

`digestStructuralProjection()`只接受已投影值，因此digest路径不能再次隐式调用projection。comparison、digest和`firstDifference`共享同一对projection。`StructuralParityReport.projectionCount`是确定性诊断字段，当前真实数据为34；wall/CPU/RSS只写入日志，不进入生成摘要。

真实`data:sync`结果：

| Metric | Before | After |
|---|---:|---:|
| comparisons | 17 | 17 |
| projections | 68（代码路径） | 34（runtime report） |
| digest changes | — | 0 / 17 |
| sampled/runtime wall | 10.187s（既有Windows profile） | 9.007s |
| user CPU | 未单独记录 | 10.313s |
| system CPU | 未单独记录 | 0.281s |
| process max RSS at stage | 未单独记录 | 1,724.8 MiB |

本轮没有修改structural canonicalization、localized-field policy或数组顺序语义。真实17项digest，包括`catalog.characters`、`details.enemies`和`endgame-occurrence-shards`，与Phase 1开始时完全一致。

## Validation Layers

### Shared build-input contract

Generation、search artifact metadata refresh和validators现在共享：

- prepared repository HEAD commit/subject与game-version parsing；
- TextMap parse后`JSON.stringify`的canonical SHA-256；
- 由source commit、locale TextMap digests和完整artifact metadata计算的`dataRevision`。

Artifact traversal在一次扫描中验证JSON、bytes、SHA-256、recorded schema和exact file tree，并把少量consumer identity交给closure检查；不会保留全部parsed artifact graph。

### `data:validate:build-inputs`

Production gate验证：

- schema-43 manifest、locale/TextMap registry、source commit、HEAD subject、game version与`HSR_EXPECTED_DATA_COMMIT`；
- CHS/EN TextMap digest；
- exact artifact inventory、JSON validity、size/SHA-256/schema、locale file/byte totals及`dataRevision`；
- 四类manifest routes、catalog IDs、detail exact sets和counts；
- 两种locale的四个Endgame schema/mode/group inventories及重建后的canonical routePaths；
- homepage、search-inputs、search和player-equipment consumer roots；
- search schema/locale/source/counts、player equipment route closure；
- English search target与schema-2 occurrence shard exact identity/inventory。

它有意不重新计算homepage selection、search documents、Endgame HP/stat、enemy/character canonical models、relations、cross-locale parity或English CJK。一个合法schema且重新计算artifact metadata/dataRevision后的业务语义mutation可以通过这个gate；完整CI必须捕获它。

### `data:validate:full`

Full validator先运行共享build-input gate并复用其manifest、source root和TextMaps，随后保留旧validator的全部semantic audits、warnings和fatal contracts，包括homepage/raw recomputation、search rebuild/deep compare、Endgame/enemy canonical recomputation、character/light-cone/relation invariants、cross-locale parity、occurrence shard内容检查和English CJK audit。

Commands：

```text
pnpm data:validate                 -> data:validate:full
pnpm data:validate:full            -> input integrity + complete semantic audit
pnpm data:validate:build-inputs    -> Production input integrity only
```

## Correctness Ownership

| Guarantee | Producer | Full CI | Production input gate | Post-build |
|---|:---:|:---:|:---:|:---:|
| pinned source commit/version | ✓ | ✓ | ✓ | — |
| CHS/EN TextMap digests | ✓ | ✓ | ✓ | — |
| artifact schema/inventory/digests | ✓ | ✓ | ✓ | — |
| locale/catalog/detail closure | ✓ | ✓ | ✓ | — |
| canonical route input inventory | ✓ | ✓ | ✓ | ✓ |
| cross-locale structural parity | ✓ | ✓ | — | — |
| search semantic equality | ✓ | ✓ | — | — |
| homepage/Endgame/enemy semantic invariants | ✓ | ✓ | — | — |
| relation/localization/English CJK audits | ✓ | ✓ | — | — |
| general/enemy asset integrity | relevant producer | ✓ | ✓ | ✓ |
| final reference and page-route closure | — | ✓ | ✓ | ✓ |

## Pipeline and Updater

| Profile | Data validation |
|---|---|
| `ci` / required `Correctness` | `data:validate:full` |
| `production` | `data:validate:build-inputs` |
| `development` | none beyond producer postconditions |
| `preview` | none beyond producer postconditions |

The GitHub job name remains `Correctness`; workflow triggers and branch protection identity did not change. Asset verification, offline enemy validation, Vite build, output smoke and Production/CI post-build closure retain their Phase 0/1 ownership.

The updater remains intentionally mutation-specific. It does not run either deployment profile or duplicate full validation before its human-reviewed PR to`develop`; complete independent semantics are required at the protected main PR boundary.

## Tests

Structural tests cover localized wording, stable numeric/identity drift, array order, nested paths, digest reuse, identical success and projection count. Build-input filesystem fixtures cover valid dual locale inputs, expected/prepared source drift, TextMap drift, missing/extra/corrupt/schema-mismatched files, stale revision/locale summaries, catalog/detail/route closure and English shard identity.

The layering test refreshes bytes/SHA/dataRevision after a schema-valid numeric semantic mutation: build-input validation accepts it, while the cross-locale semantic validator rejects the same class of drift. No workflow YAML, command-order or mocked pipeline meta-test was added.

## Benchmarks

Reference environment: Windows 11, Node 22.19.0, pnpm 11.9.0, warm pinned/generated caches. Phase 1 totals are the immediately preceding same-machine implementation baseline. Full-run totals vary with Vite, compiler and filesystem state; stage-level validator comparisons are the relevant Phase 2 signal.

| Metric | Before | After |
|---|---:|---:|
| full validator stage | 48.749s (Phase 1 CI) | 46.593s |
| full validator max RSS | ~3,057–3,262 MiB | 3,099.3 MiB |
| build-input validator stage | — | 5.936s |
| build-input validator user/system | — | 4.234s / 0.688s |
| build-input validator max RSS | — | 742.7 MiB |
| Production total | 147.870s | 101.208s |
| Correctness-equivalent total | 185.184s | 202.116s |
| Preview total | 86.256s | 78.504s |
| Development total | 128.048s | 137.781s |

Production removed roughly46.7s from this run by replacing full semantics with the 5.9s integrity gate. The Correctness total was slower because compiler/Vite/filesystem stages varied upward; its full validator itself did not materially regress and no semantic coverage was removed. Production max RSS for data validation fell from roughly3GiB to743MiB.

## Real Verification

| Check | Result |
|---|---|
| `pnpm data:sync` | passed; 34 projections; all 17 digests unchanged |
| `pnpm data:validate:build-inputs` | passed; 2,124 files / 383,020,901 bytes |
| `pnpm data:validate:full` | passed with existing 544 unresolved CHS TextHash warnings |
| `pnpm check` | passed; 0 Svelte errors/warnings |
| `pnpm lint` | passed |
| `pnpm test` | 49 files / 544 tests passed |
| `pnpm ci:develop` | passed; 137.781s |
| `pnpm ci:validate` | passed; 202.116s |
| offline Preview | passed with unusable HTTP/HTTPS/ALL proxy; 78.504s |
| offline Production | passed with unusable HTTP/HTTPS/ALL proxy; 101.208s |
| corruption/semantic ownership | passed in temporary filesystem fixtures |
| Playwright smoke | browser launch blocked: matching Chromium binary absent; no download/retry per repository policy |

The first sandboxed baseline Production attempt reached Vite after a successful 46.270s old full validator, then hit the known Codex sandbox parent-directory restriction. All final Vite/profile runs were repeated successfully outside that filesystem sandbox. No remote Preview or Production deployment was created.

## Deferred

- Phase 3: general asset bounded concurrency, ensure/verify scan sharing and upstream checkout narrowing.
- Phase 4: Vite/SvelteKit prerender and adapter I/O optimization.
- No cross-process object cache, sparse-checkout redesign or adapter change was introduced in Phase 2.
