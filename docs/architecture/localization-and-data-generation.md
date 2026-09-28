# Localization and Data Generation Architecture

This is the normative R6 architecture for the HSR Database product.

## Locale boundary

zh-CN is the base locale and uses unprefixed URLs. en is publicly routed under /en. Public page URLs use a trailing-slash convention (`/characters/1304/`, `/en/characters/1304/`); route identities in the generated manifest remain locale-neutral and do not require the presentation slash. Paraglide uses URL plus base-locale strategies; SvelteKit de-localizes URLs for the shared route tree, and request middleware stores the resolved locale in App.Locals.locale.

## Data flow

Pinned upstream data and TextMaps are parsed into domain models, projected independently for each locale, and emitted below src/lib/generated/views/{locale}. Static Search indexes are emitted below static/generated/{locale}. Serialized Endgame occurrence views remain private below src/lib/generated/views/{locale}/endgame-occurrences; the shared /generated/{locale}/endgame-occurrences/{targetId} endpoint resolves portrait assets and prerenders the public shards. Static source shards must not shadow that endpoint. Runtime loaders accept locale explicitly and never fall back across locales.

Deployment preparation derives its TurnBased sparse checkout from the same source registry used by generation: 81 exact Excel tables, TextMapCHS/TextMapEN, and the three dynamic Monster/BattleEvent Config directories. StarRailRes indexes and source asset directories are materialized in one sparse operation. General assets are generated with fixed bounded copy and Sharp pools into an isolated staging tree, validated, and atomically published. A final published-tree observation supplies file counts, sizes and lazily cached Sharp metadata to ensure, telemetry and the independent verifier for that build invocation only.

## Artifact contract

Manifest schema 46 retains publicLocale: zh-CN, publicLocales, canonical routePaths, locale-scoped artifact metadata and the locale-neutral `runtime/player.json` lookup used by the isolated Enka player pipeline. The route inventory is the source for static prerendering and sitemap generation. General visual asset manifest schema 16 includes player avatars and the existing utility icon inventory; Phase 3 changes scheduling and validation observation only, not manifest semantics or public URLs. Enemy snapshot schema 3 is tracked and validated offline during builds; network refresh belongs to the explicit updater.

Validation has two explicit layers. `data:validate:build-inputs` reopens the manifest, prepared pinned source, TextMaps and every generated artifact from disk; it validates identity, bytes, digests, schemas, inventories and route/search consumer closure without rebuilding domain semantics. `data:validate:full` composes that gate with the complete raw-to-generated semantic audits, cross-locale structural parity and English CJK audit. The compatibility command `data:validate` remains an alias for the full validator.

The protected `Correctness` check owns full semantic validation. Production runs the build-input validator before Vite, while Preview and Development retain the lighter Phase 0 path. Producer-side prepublication checks remain in generation, and validators remain separate child processes so they independently reopen published bytes.

## Ownership rules

Site-owned prose, navigation, controls, metadata, errors, accessible labels, and footer text belong in paired Paraglide message keys. Game-owned names, descriptions, effects, and mechanics remain in localized generated views. Locale-neutral IDs, dates, ordering, and route identities must not depend on translated strings.

Enemy skill existence and semantic kind/tag come from `MonsterConfig.SkillList` and `MonsterSkillConfig` in the locale-neutral domain. Each locale projection resolves and formats its own `SkillDesc` with the shared TextResolver/GameText pipeline and displays the skill only when the resulting plain text is nonempty after trimming. Skill phases are built from those displayed skills. Full validation independently checks each locale's public skill list and phases against its TextMap. Cross-locale structural parity still checks Enemy identity and numeric structure, while allowing skill lists and phases to differ when localized descriptions differ. Unknown kind/tag source hashes still require explicit semantic review. There is no per-SkillID inclusion snapshot.

## URL helpers

Use src/lib/i18n/routing.ts for page trailing-slash normalization, canonicalization, localized internal hrefs, and same-page locale counterparts. Helpers preserve query strings and hashes while leaving external, query-only, hash-only, and extension-bearing URLs unchanged. The settings switcher uses ordinary document links so the URL remains the single locale state.

## Changelog workflow

Changelog metadata uses stable IDs and ISO machine dates in src/lib/content/changelog/entries.ts. Maintainers add or edit matching .svx files under both src/lib/content/changelog/zh-CN and src/lib/content/changelog/en. Validation rejects missing, duplicate, or orphan entries.

## Required checks

Choose focused checks according to the changed surface, following AGENTS.md. At a full correctness boundary use the self-preparing `pnpm ci:validate`: it includes pinned input preparation, messages, data/assets validation, repository checks, unit tests, Vite build and output verification; do not repeat its covered subcommands. Browser smoke can reuse that build with `PLAYWRIGHT_REUSE_BUILD=1 pnpm test:e2e:smoke`. Production-specific investigations may additionally run the local `pnpm deploy:build` profile, but its build-input integrity gate is not proof of semantic correctness. Enemy snapshot validation is offline in all build profiles; only the explicit updater refreshes it from the network. Product contracts use focused invariant tests rather than full generated-output baselines. Record build-time limitations and known upstream missing-text diagnostics in the relevant investigation report.
