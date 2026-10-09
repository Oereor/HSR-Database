# Localization and Data Generation Architecture

This is the normative R6 architecture for the HSR Database product.

## Locale boundary

zh-CN is the base locale and uses unprefixed URLs. en is publicly routed under /en. Public page URLs use a trailing-slash convention (`/characters/1304/`, `/en/characters/1304/`); route identities in the generated manifest remain locale-neutral and do not require the presentation slash. Paraglide uses URL plus base-locale strategies; SvelteKit de-localizes URLs for the shared route tree, and request middleware stores the resolved locale in App.Locals.locale.

## Data flow

Pinned upstream data and TextMaps are parsed into domain models, projected independently for each locale, and emitted below src/lib/generated/views/{locale}. Static Search indexes are emitted below static/generated/{locale}. Serialized Endgame occurrence views remain private below src/lib/generated/views/{locale}/endgame-occurrences; the shared /generated/{locale}/endgame-occurrences/{targetId} endpoint resolves portrait assets and prerenders the public shards. Static source shards must not shadow that endpoint. Runtime loaders accept locale explicitly and never fall back across locales.

Deployment preparation derives its TurnBased sparse checkout from the same source registry used by generation: 91 exact Excel tables, TextMapCHS/TextMapEN, and the three dynamic Monster/BattleEvent Config directories. StarRailRes indexes and source asset directories are materialized in one sparse operation. General assets are generated with fixed bounded copy and Sharp pools into an isolated staging tree, validated, and atomically published. A final published-tree observation supplies file counts, sizes and lazily cached Sharp metadata to ensure, telemetry and the independent verifier for that build invocation only.

## Artifact contract

Manifest schema 49 adds independently validated training shards and localized material catalogs, and retains the schema 48 invalidation of Endgame occurrence shards that stored generated-time period status and retains publicLocale: zh-CN, publicLocales, canonical routePaths, locale-scoped artifact metadata and the locale-neutral `runtime/player.json` lookup used by the isolated Enka player pipeline. Endgame dataset schema 24 keeps raw schedule boundaries. Occurrence shard schema 3 carries static period metadata and schedule without status. Endgame pages retain the prerendered initial presentation, then refresh status and recommendation after mount and at schedule boundaries using the browser clock and shared domain functions. The route inventory is the source for static prerendering and sitemap generation. General visual asset manifest schema 17 adds the finite training material icon inventory to player avatars and existing icons. Material icons use stable ItemID keys and `/generated-assets/materials/icons/{itemId}.png`; unavailable icons resolve to no URL. Existing asset URLs and bounded generation/publishing remain unchanged. Enemy snapshot schema 3 is tracked and validated offline during builds; network refresh belongs to the explicit updater.

Validation has two explicit layers. `data:validate:build-inputs` reopens the manifest, prepared pinned source, TextMaps and every generated artifact from disk; it validates identity, bytes, digests, schemas, inventories and route/search consumer closure without rebuilding domain semantics. `data:validate:full` composes that gate with the complete raw-to-generated semantic audits, cross-locale structural parity and English CJK audit. The compatibility command `data:validate` remains an alias for the full validator.

The protected `Correctness` check owns full semantic validation. Production runs the build-input validator before Vite, while Preview and Development retain the lighter Phase 0 path. Producer-side prepublication checks remain in generation, and validators remain separate child processes so they independently reopen published bytes.

## Training data boundary (Slice A)

Character and light-cone cost shards are locale-neutral static artifacts under `static/generated/training/{characters|light-cones}/{id}.json`, schema 1. Each character shard contains isolated EnhancedID profiles, original promotion MaxLevel boundaries, and canonical `(AvatarID, EnhancedID, PointID)` nodes with every PrePoint edge and per-level cost. `training/shared.json` stores shared EXP curves, finite Material identities, EXP item parameters and the configured character EXP credit divisor. Localized names are projected through TextResolver into `static/generated/{locale}/materials.json`; material counts are derived from cost references and EXP item configurations, never fixed at 140.

All artifacts enter the manifest digest and inventory contract and the atomic generated-tree publication. Build-input validation checks shard schemas, entity/profile/material/EXP closure and dual-locale metadata parity. Full validation independently reopens raw inputs and verifies every emitted training artifact. Source preparation includes the six training tables and existing regular/LD promotion and SkillTree sources. ConstValueCommon is selectively read for Exp_SoftCoin_Cost with the shared lossless parser: unrelated pinned records contain duplicate JSON map keys and are not consumed or silently normalized.

`src/lib/domain/training/index.ts` exposes pure target calculation and DAG transitions; `src/lib/data/training.ts` provides a lazy static loader with explicit locale selection. No cost tables are embedded in current page data. Training selects the lowest promotion reaching the target level; existing stat/UI boundary behavior remains unchanged until Slice B. Required EXP and exact known costs are distinct from unspecified EXP item consumption and credit charging. Item pages, item detail loaders, inventory and training UI remain out of scope.

## Ownership rules

Site-owned prose, navigation, controls, metadata, errors, accessible labels, and footer text belong in paired Paraglide message keys. Game-owned names, descriptions, effects, and mechanics remain in localized generated views. Locale-neutral IDs, dates, ordering, and route identities must not depend on translated strings.

Enemy skill existence and semantic kind/tag come from `MonsterConfig.SkillList` and `MonsterSkillConfig` in the locale-neutral domain. Each locale projection resolves and formats its own `SkillDesc` with the shared TextResolver/GameText pipeline and displays the skill only when the resulting plain text is nonempty after trimming. Skill phases are built from those displayed skills. Full validation independently checks each locale's public skill list and phases against its TextMap. Cross-locale structural parity still checks Enemy identity and numeric structure, while allowing skill lists and phases to differ when localized descriptions differ. Unknown kind/tag source hashes still require explicit semantic review. There is no per-SkillID inclusion snapshot.

Enemy Skill damage details represent parseable ATK multiplier candidates from linked configuration, with optional target roles. `multipliers` replaces `totals` without a compatibility alias. Only proven local linear sequences are summed; branches, callbacks, loops and separate Abilities contribute independent candidates. Unresolved numeric values are omitted individually; uncertain entity ownership removes the target label rather than the number. Chance and action-shift behavior is unchanged, and raw configuration and build diagnostics remain outside browser data.

## URL helpers

Use src/lib/i18n/routing.ts for page trailing-slash normalization, canonicalization, localized internal hrefs, and same-page locale counterparts. Helpers preserve query strings and hashes while leaving external, query-only, hash-only, and extension-bearing URLs unchanged. The settings switcher uses ordinary document links so the URL remains the single locale state.

## Changelog workflow

Changelog metadata uses stable IDs and ISO machine dates in src/lib/content/changelog/entries.ts. Maintainers add or edit matching .svx files under both src/lib/content/changelog/zh-CN and src/lib/content/changelog/en. Validation rejects missing, duplicate, or orphan entries.

## Required checks

Choose focused checks according to the changed surface, following AGENTS.md. At a full correctness boundary use the self-preparing `pnpm ci:validate`: it includes pinned input preparation, messages, data/assets validation, repository checks, unit tests, Vite build and output verification; do not repeat its covered subcommands. Browser smoke can reuse that build with `PLAYWRIGHT_REUSE_BUILD=1 pnpm test:e2e:smoke`. Production-specific investigations may additionally run the local `pnpm deploy:build` profile, but its build-input integrity gate is not proof of semantic correctness. Enemy snapshot validation is offline in all build profiles; only the explicit updater refreshes it from the network. Product contracts use focused invariant tests rather than full generated-output baselines. Record build-time limitations and known upstream missing-text diagnostics in the relevant investigation report.
