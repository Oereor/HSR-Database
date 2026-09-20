# Build Pipeline Refactor Phase 1 — Enemy Asset Snapshot — 2026-09-20

## Executive Summary

Phase 1 将 `static/generated-enemy-assets/` 从 ignored deployment cache 迁移为 repository-tracked immutable build input。初始 snapshot 直接复用了工作区中已经完整的 210 张 WebP，没有重新下载 binary。

- Production、Preview、Development CI 和 Correctness CI 现在只执行离线 snapshot validation；deployment import graph 不再引用 Nanoka transport 或 updater。
- Nanoka discovery、mapping refresh、图片下载与修复只存在于显式 `pnpm update:enemy-assets` 维护入口。
- 现有 `/generated-enemy-assets/icons/Monster_<imageId>.webp` URL 未改变。
- Upstream 与 enemy-only refresh 共用 `update-upstreams` workflow、`automation/update-upstreams` 分支和到 `develop` 的人工审核 PR。

```text
Before: deployment -> Nanoka latest -> cache/sync -> build
After:  maintenance -> Nanoka -> reviewed Git snapshot
        deployment  -> offline snapshot validation -> build
```

## Snapshot Contract

目录：`static/generated-enemy-assets/{README.md,index.json,icons/*.webp}`。

Manifest schema 3 包含：

- source、version、resource type 和仅在语义 snapshot 改变时更新的 generatedAt；
- 当前排序 `MonsterTemplateID` 集合的 SHA-256 `catalogFingerprint`；
- `monsters + unavailable` 对 catalog 的精确覆盖；
- canonical TemplateID → imageId → public URL mapping；
- 每个 unique imageId 的 byte size 和 SHA-256。

Validator 还验证区分大小写的 exact icon set、普通非空文件、RIFF/WebP signature、Sharp WebP dimensions、manifest digest 和四个 sanity IDs。缺失或损坏时 fail closed，不存在网络修复 fallback。

Tracked snapshot statistics：

| Metric | Value |
|---|---:|
| Snapshot files | 212 |
| WebPs | 210 |
| WebP bytes | 16,088,650 |
| Total snapshot bytes | 16,214,202 |
| Largest WebP | 156,198 bytes |
| Catalog IDs | 628 |
| Mapped / unavailable | 605 / 23 |

`.gitignore` 只排除 sibling staging/rollback directories；clean deployment 不再删除 tracked snapshot。

## Commands and Network Boundary

```text
pnpm validate:enemy-assets       read-only, deterministic, offline
pnpm update:enemy-assets         explicit Nanoka maintenance
pnpm deploy:build:preview        offline enemy validation
pnpm deploy:build:production     offline enemy validation
```

`assets:ensure:enemies` 保留为 `validate:enemy-assets` 的离线兼容 alias，`assets:sync:enemies` 保留为显式 updater alias。正常 `pnpm dev` 不联系 Nanoka。

Nanoka network is allowed only in the update command/workflow. It is forbidden in all deployment and correctness profiles.

## Incremental and Atomic Update

Updater 先准备 pinned TurnBasedGameData 并生成 current catalog，再读取 tracked snapshot：

- 同一 source version 只解析新增 ID 和现有 unavailable ID；
- source version 变化时刷新所有 required mappings；
- 有效 digest-matched WebP 始终复用，仅下载新增、changed 或损坏 imageId；
- detail/image 404 和缺失 image path 可成为 unavailable；403、429 exhausted、5xx、timeout、invalid JSON/image 均为 operational failure；
- 候选 snapshot 在 sibling staging directory 完整生成并离线验证，然后通过 directory rename 发布；prune 只存在于验证后的候选；失败时当前 snapshot 不变；
- mapping、unavailable、catalog fingerprint 和 bytes 全部不变时不发布，保留原 version、generatedAt 和 index bytes。

维护 workflow 每次运行都可刷新 enemy snapshot。Lock 变化时 updater 使用新 pinned data 生成 catalog，保证新增 enemy 与 lock/search metadata 位于同一个 PR。Diff detection 和 staging 仅覆盖 lock、既有 search metadata 与 enemy snapshot。PR summary 提供 source version、counts、requests/downloads/reuse、mapping/image delta、file status 和 byte delta；workflow 不自动 merge。

## Tests

Enemy correctness tests覆盖：

- catalog fingerprint、schema、coverage、canonical URL、digest 和 exact file set；
- missing/corrupt/wrong-digest snapshot；
- same-version new ID、shared imageId reuse、source-version mapping refresh；
- image repair、prune、404 unavailable、403/5xx atomic failure；
- version-only no-change byte-identical manifest；
- server resolver schema 3 URL compatibility和 clean snapshot preservation。

没有新增 pipeline ordering 或 workflow YAML meta-test。

## Real Verification

| Check | Result |
|---|---|
| `pnpm check` | passed, 0 Svelte errors/warnings |
| `pnpm lint` | passed |
| `pnpm test` | 48 files / 538 tests passed |
| `pnpm ci:develop` | passed, total 128.048s |
| `pnpm ci:validate` | passed, total 185.184s |
| offline Preview | passed with unusable proxy, total 86.256s |
| offline Production | passed with unusable proxy, total 147.870s |
| missing index negative test | failed at `enemy-assets-validate` in 12.578s, before Vite; index restored |
| real no-change updater | Nanoka 4.5.54; 23 detail retries, 0 downloads, 210 reused, 7.351s; snapshot diff empty |

Production/Preview offline checks used process-local `HTTPS_PROXY`, `HTTP_PROXY` and `ALL_PROXY` pointing to an unused localhost port. Pinned upstream checkouts were prepared locally, so the result demonstrates that the enemy stage and actual application build do not need Nanoka rather than merely preventing prerequisite materialization.

Phase 0 warm enemy ensure was 3.295–3.838s and still performed remote version discovery. Phase 1 full offline integrity validation measured 0.761–0.892s internally and 1.592–1.782s including the pnpm child process. The main benefit is deterministic availability on fresh/cache-miss deployments, not merely warm-build speed.

No remote Vercel Preview or Production deployment was created.

## Correctness Ownership

| Guarantee | Owner |
|---|---|
| Nanoka mapping discovery and remote freshness | update workflow |
| downloaded WebP validity | updater + offline validator |
| catalog exact coverage | updater + all build profiles |
| size/SHA-256 binding | tracked manifest + validator |
| canonical public URL | validator |
| snapshot completeness | CI / Production / Preview |
| deployment availability | repository snapshot, independent of Nanoka |

## Provenance and Deferred Work

Root README and snapshot README now identify Nanoka as the enemy visual source, explain update-time maintenance/offline consumption, and state that the repository MIT License does not cover third-party game assets or establish an unconfirmed redistribution license.

Deferred unchanged: Phase 2 data-validator layering, Phase 3 general-asset concurrency/upstream checkout redesign, and Phase 4 Vite/adapter I/O work. `monster.json` optimization was not adopted because no reliable reviewed schema evidence established it as a complete mapping source.
