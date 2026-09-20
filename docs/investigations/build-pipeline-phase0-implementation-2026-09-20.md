# Build Pipeline Refactor Phase 0 Implementation — 2026-09-20

## Executive Summary

Phase 0 将 repository correctness、Production artifact integrity 和手动 Preview build 分成明确职责，同时保留 `develop` 可直接 push、用于快速开发和设备同步的既定模型。

- **Correctness CI**：仅用于 `main` PR 的完整 gate；执行 repository checks、Production input integrity、Production-equivalent build、output closure，并在 GitHub Actions 安装 Chromium 后运行 Playwright smoke。
- **Production**：准备 pinned inputs，执行 generation、当前阶段仍必需的完整 `data:validate`、asset integrity、Vite build、最终引用和 route closure。
- **Preview**：Production 的真子集；只准备真实输入、生成数据/资源、构建站点并检查根入口。
- **Development CI**：`develop` push/PR 的非阻塞轻量反馈；在 Preview 路径上增加 type、lint、unit 和 search metadata checks，不声称等价于完整 Correctness。
- **Updater**：只修改 upstream metadata，刷新并校验 search-name/alias metadata，然后创建到 `develop` 的人工审核 PR；不再复制完整 deployment build。

正式职责关系为：

```text
Full Correctness CI
    = Production + repository checks + browser smoke
                     |
Production           = Preview + input/output integrity
                     |
Preview              = prepare + generate + build + light smoke

Development CI       = Preview + fast repository checks (non-blocking)
```

## Before / After Pipeline

```text
BEFORE

PR -> main: messages -> ci:prepare -> check/lint/test -> data validate -> build -> E2E
Updater -> develop: update metadata -> complete deploy:build -> PR
Production: production-ci-backed
Preview: preview-full + script/search checks

AFTER

push/PR -> develop: Development (Preview path + check/lint/unit/search; non-required)
PR -> main: Correctness (Production path + all repository checks + E2E)
Updater -> develop: mutate + metadata validation -> human-reviewed PR
main commit: Production profile -> Vercel automatic deployment
workflow_dispatch: Preview profile -> manual Vercel Preview
```

## Workflow Changes

### CI

`.github/workflows/ci.yml` now listens to pushes to `develop` and PRs targeting `develop` or `main`. A single job exposes exactly one event-appropriate identity:

- `Development` for `develop` events; informational and non-required.
- `Correctness` for `main` PRs; the stable required gate.

Both use the shared build orchestrator. Only `Correctness` installs Chromium and runs E2E smoke against the already-built output. There is no CI workflow on `main` push because Vercel owns Production deployment for new `main` commits.

### Upstream updater

The updater still rebuilds `automation/update-upstreams` from `develop`, updates the lock, refreshes official character names, synchronizes the player-alias skeleton, and creates/updates a human-reviewed PR to `develop`. Its preflight is now mutation-specific: `data:search-names:check`. Full repository and deployment work is no longer copied into the updater.

### Manual Preview

`.github/workflows/vercel-preview.yml` remains manual-only and still calls `vercel deploy --target=preview`. Vercel supplies `VERCEL_ENV=preview`, selecting the lightweight Preview profile. It is not a required PR check and was not changed into automatic PR deployment.

## Build Orchestration Changes

The old `production-ci-backed` / `preview-full` modes were removed. `scripts/deployment/build.ts` now has four explicit profiles built from two readable gates:

| Stage | `ci` | `production` | `development` | `preview` |
|---|:---:|:---:|:---:|:---:|
| lock, messages, pinned checkout, data ensure | yes | yes | yes | yes |
| full data validation | yes | yes | no | no |
| enemy/general asset ensure | yes | yes | yes | yes |
| general asset integrity verification | yes | yes | no | no |
| search/type/lint/unit checks | yes | no | yes | no |
| Vite build and output smoke | yes | yes | yes | yes |
| final asset/reference and route closure | yes | yes | no | no |

Commands:

```text
pnpm ci:develop
pnpm ci:validate
pnpm deploy:build:preview
pnpm deploy:build:production
pnpm deploy:build
```

`deploy:build` accepts an explicit `--profile`. Without one, `VERCEL_ENV=production` selects Production, `preview`/`development` selects Preview, an absent value selects Production for local compatibility, and an unknown value fails instead of silently choosing a profile. Clean deployment explicitly uses Production.

The lightweight output smoke reads `404.html`, `index.html`, and every public locale root entry. Production additionally retains the full generated-asset reference scan and all 2,154 localized route checks.

## Test Cleanup

| Test file | Decision | Reason |
|---|---|---|
| `ci-workflow.test.ts` | removed | YAML text and command-order meta-test |
| `vercel-preview-workflow.test.ts` | removed | Workflow/CLI/secrets text contract |
| `deployment-build.test.ts` | removed | Mock runner and `events[]` orchestration ordering |
| `update-upstreams-workflow.test.ts` | removed | Workflow text test; alias/search correctness remains in `search-metadata.test.ts` |
| `vercel-config.test.ts` | removed | Whole-file configuration snapshot |
| `scripts-typecheck.test.ts` | removed | Re-ran the actual compiler gate inside Vitest |
| `deployment-verify-build.test.ts` | kept | Independent final-output reference/path correctness |
| `deployment-verify-routes.test.ts` | kept | Independent canonical route/output correctness |
| `deployment-lock.test.ts`, `deployment-git.test.ts` | kept | Lock parsing, pinning, sparse path and path-safety contracts |
| `deployment-clean.test.ts` | kept | Independent destructive-operation safety contract |
| data/cache/asset/enemy/updater tests | kept | Reusable producer, cache, validation and mutation logic |

No replacement pipeline string, profile-order, or YAML unit test was added. The resulting full suite contains 48 files and 548 tests; the lower count is intentional.

## Telemetry and Baseline

Logs now use three compact forms:

```text
[deploy:stage] label wall=... status=...
[deploy:cache] owner result=... reason=...
[deploy:io] owner files=... bytes=...
[deploy:resource] owner user=... system=... max-rss=...
```

The build reuses data manifests, asset indexes and final-output traversal where available. It does not emit profiler artifacts or upload monitoring data. Vite remains one measured stage because splitting supported client/SSR/prerender/adapter timings would require framework-level work deferred to Phase 4.

Reference environment: Windows 11, Node 22.19.0, pnpm 11.9.0, warm generated caches. The StarRailRes ignored checkout was seeded from the read-only sibling repository after its remote partial-clone blob request stalled; the pinned commit and resulting checkout remained identical.

### Development / Preview-equivalent

`pnpm ci:develop` passed:

| Stage | Wall |
|---|---:|
| data ensure | 9.489s |
| search-name check | 1.879s |
| check | 28.312s |
| lint | 17.234s |
| enemy assets ensure | 3.295s |
| general assets ensure | 0.189s |
| unit tests | 21.482s |
| Vite build | 81.684s |
| output smoke | 0.005s |
| **total** | **169.916s** |

### Correctness / Production-equivalent

`pnpm ci:validate` passed:

| Stage | Wall |
|---|---:|
| data ensure | 9.043s |
| data validate | 60.206s |
| search-name check | 1.765s |
| check | 28.026s |
| lint | 17.890s |
| enemy assets ensure | 3.838s |
| general assets ensure | 0.192s |
| asset verification | 6.832s |
| unit tests | 22.946s |
| Vite build | 85.900s |
| final reference closure | 7.938s |
| route closure | 2.731s |
| **total** | **248.581s** |

Resource samples:

| Stage | User CPU | System CPU | Max RSS |
|---|---:|---:|---:|
| data ensure | 5.063s | 1.156s | 876.2 MiB |
| data validate | 66.937s | 5.875s | 3,057.5 MiB |
| general assets, cache hit | 0.109s | 0.047s | 129.3 MiB |

Observed sizes:

| Input/output | Files | Bytes |
|---|---:|---:|
| TurnBasedGameData sparse input | 4,676 | 472,882,878 |
| StarRailRes sparse input | 2,850 | 801,341,159 |
| generated data artifacts | 2,124 | 383,020,901 |
| general generated assets | 2,248 | 121,841,064 |
| enemy assets | 212 | 16,186,948 |
| final build | 7,235 | 401,373,819 |

Data, general assets and enemy assets were cache hits with explicit reasons. The full validator reported the existing 544 unresolved CHS TextHash warnings; no new validation failure was introduced.

Local Playwright smoke could not start because the matching Chromium binary was not installed. All five cases failed before browser launch with the same environment error; per repository verification policy the browser was not downloaded and the path was not retried. The GitHub workflow explicitly runs `playwright install --with-deps chromium` before the same smoke command.

## Correctness Guarantee Mapping

| Check | Old owner | New owner | Required gate |
|---|---|---|---|
| script/type/message correctness | Preview and main CI | Development feedback + full Correctness | `Correctness` on `main` PR |
| search-name snapshot | Preview, updater and main CI | Development/full CI; mutation-specific updater preflight | `Correctness` on `main` PR |
| full semantic/cross-locale data audit | Production, Preview and main CI | Production + full Correctness | `Correctness` on `main` PR |
| general asset integrity | Production and Preview | Production + full Correctness | `Correctness` on `main` PR |
| final asset/reference closure | Production and Preview | Production + full Correctness | `Correctness` on `main` PR |
| full route closure | Production and Preview | Production + full Correctness | `Correctness` on `main` PR |
| lightweight build existence | implicit Vite success | every profile | Development feedback or `Correctness` |
| browser smoke | main CI | full Correctness only | `Correctness` on `main` PR |

Preview no longer owns a repository audit that Production omits. Production still retains `data:validate` until Phase 2 provides a real build-input validator; no incomplete substitute was introduced.

## Manual Repository Settings

Repository settings are not available from the local checkout and must be confirmed manually:

### `develop`

- Do **not** require pull requests.
- Do **not** require `Development` as a status check.
- Keep ordinary direct pushes available.
- Keep Vercel Git deployment disabled.

### `main`

- Require pull requests.
- Require the status check named `Correctness`.
- Keep Vercel Git deployment enabled only for `main`.
- Do not configure `Development` as a required check.

The manual Preview workflow remains outside branch protection.

## Deferred to Phase 1+

- repository-tracked enemy snapshot and removal of Nanoka from Production;
- `validate:full` / `validate:build-inputs` internals and structural-parity optimization;
- general asset bounded concurrency and ensure/verify scan sharing;
- TurnBasedGameData narrowing and StarRailRes sparse-checkout redesign;
- Vite/SvelteKit adapter copy and prerender I/O optimization;
- hardlink/reflink experiments or Vite substage instrumentation.
