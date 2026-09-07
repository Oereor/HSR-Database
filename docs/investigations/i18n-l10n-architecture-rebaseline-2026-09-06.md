# i18n/l10n Architecture Rebaseline Audit

**Audit date:** 2026-09-06

**Target:** the current `HSR-Database` working tree, including its pre-existing uncommitted changes

**Decision:** **C — partially rewritten**

## 1. Executive Summary

The current system has the right outer boundary but the wrong amount of machinery inside it.

**FACT — HIGH CONFIDENCE.** Game localization is performed during data generation. Production loaders read prelocalized `zh-CN` JSON from `src/lib/generated/views/zh-CN`; Svelte components do not load a TextMap or resolve `TextHash` values. A mechanical search of the production client build found no `TextMapCHS`, `TextMapEN`, neutral domain, or upstream config table payloads. This is the most important architectural property to retain.

**FACT — HIGH CONFIDENCE.** The repository currently supports only one end-to-end locale: `zh-CN` backed by `TextMapCHS`. `scripts/data/localization.ts` defines an `en`/`EN` type-level possibility, but `scripts/data/paths.ts`, generation, manifests, server loaders, Paraglide settings, and tests are all fixed to `zh-CN`/`CHS`. `TextMapEN` is not a production input.

**FACT — HIGH CONFIDENCE.** Character, Light Cone, and Relic now have locale-neutral builders and localized projectors. Enemy and Endgame do not: their structural generation and text resolution remain combined in the compatibility path. The repository is therefore not one coherent architecture; it is a migration midpoint exposed as permanent-looking schemas, manifests, compatibility trees, and tests.

**FACT — HIGH CONFIDENCE.** Generated data is heavily duplicated. `src/lib/generated` contains 1,941 files and about 417.4 MB. The legacy root catalogs/details/endgame tree is byte-identical to the corresponding `views/zh-CN` tree for all 964 non-manifest view files checked by path and length, with representative SHA-256 checks also equal. Production reads the locale tree; validation and migration contracts keep the root copy alive. Neutral/source artifacts add about 53.4 MB more and are not production runtime inputs.

**FACT — HIGH CONFIDENCE.** The current assurance system is internally inconsistent. Build, type checking, lint, message validation, data validation, and E2E pass, but the unit suite has six ordinary failures and `data:i18n:check` reports all 97 Character detail contracts changed. Some failures are clearly stale implementation assertions (schema `39` versus live `40`, an expected TypeScript compiler defect that no longer exists, and a historical exact missing-text count). Others may indicate visible Character icon/asset regressions. There is no expected-failure mechanism classifying any of them.

**INFERENCE — HIGH CONFIDENCE.** Adding a second locale by extending the current pattern would probably work functionally for Character/Light Cone/Relic, but it would duplicate large view trees and expose latent Chinese literals. Enemy, Endgame, search identity, cache keys, manifest types, and server paths would require real redesign. The current type signatures overstate multilingual readiness.

**RECOMMENDATION.** Partially rewrite the generation architecture around a small set of durable ideas: lossless upstream parsing, stable numeric/string identity, one explicit locale-to-TextMap registry, in-memory domain models, domain-owned projection, route-shaped per-locale outputs, and build-time resolution. Remove persisted migration staging, duplicate compatibility output, localized-string-derived search identity, and public migration manifests. Preserve current `zh-CN` observable behavior through semantic and rendered baselines before any rewrite.

The highest-priority findings are:

| Severity | Confidence | Finding                                                                                                                                                                                                                                                     |
| -------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CRITICAL | HIGH       | The required `zh-CN` parity gate is red for every Character detail, while current tests disagree about whether the new output is valid. A rewrite cannot safely start until a semantic baseline is established and the existing differences are classified. |
| HIGH     | HIGH       | Endgame search entry IDs are hashes of localized names, and result grouping/sharding uses localized names. Locale changes can alter identity and cache behavior.                                                                                            |
| HIGH     | HIGH       | The live architecture is a partially migrated, pre-existing dirty working tree: Character/Light Cone/Relic use domain/projector paths, Enemy/Endgame use compatibility paths, and migration scaffolding is enforced as build validity.                      |
| HIGH     | HIGH       | The 417.4 MB generated tree duplicates the production `zh-CN` view and persists non-runtime source/domain snapshots. This multiplies build, validation, and deletion risk without equivalent product value.                                                 |
| MEDIUM   | HIGH       | Site-owned messages are conceptually separated with Paraglide but not comprehensively migrated; many reachable UI and fallback literals remain Chinese.                                                                                                     |
| MEDIUM   | HIGH       | Manifest validation strongly checks migration staging but does not hash each actual localized view file; server loaders then use unchecked casts. Integrity effort is aimed at the wrong boundary.                                                          |

## 2. Audit Scope and Method

This was a read-only architecture audit under `I18n-L10n/I18n-L10n-Architecture-Investigation-02.md`. No production source, test, schema, fixture, policy, dependency, generated artifact, upstream checkout, or lock file was intentionally changed.

The investigation followed the live path from pinned upstream JSON and TextMaps through parsing, domain construction, projection, generated files, server loaders, search/homepage inputs, static output, and Svelte components. It included:

- import and consumer searches across `scripts`, `src`, and `tests`;
- inspection of generated manifests and representative artifacts;
- byte counts, path matching, and representative digest comparisons across generated trees;
- searches of built client JavaScript and prerendered output;
- selective inspection of current concise and historical documents only after code inspection;
- current package commands: `pnpm messages:check`, `pnpm data:validate`, `pnpm data:i18n:check`, `pnpm check`, `pnpm lint`, `pnpm test`, `pnpm build`, and `pnpm test:e2e`.

Labels in this report are deliberate:

- **FACT** is directly observed in current code, artifacts, or command output.
- **INFERENCE** is a conclusion supported by those facts but not mechanically proven for every future input.
- **RECOMMENDATION** describes the proposed target, not current behavior.

Generated-size figures are uncompressed filesystem sizes and should not be confused with transferred compressed bytes.

## 3. Source-of-Truth / Documentation Assessment

**FACT — HIGH CONFIDENCE.** Live code and live artifacts disagree with historical/current-looking documentation:

- `src/lib/generated/manifest.json` is schema `40`; `docs/site-ui-messages.md` still refers to schema `37`.
- `docs/investigations/i18n-l10n-architecture-audit.md` describes schema `36`, Endgame schema `22`, and says build was not executed; the current manifest is `40`, Endgame is `23`, and this audit executed the build.
- `docs/investigations/locale-neutral-domain-model-audit.md` describes intended migration direction. Parts have since been implemented for three domains, but it is not an accurate description of the whole current pipeline.
- `README.md` correctly states the high-level split between TextMap game content and Paraglide site messages, but it does not explain compatibility output, persisted neutral staging, the Enemy/Endgame exception, or remaining hardcoded site text.

**INFERENCE — HIGH CONFIDENCE.** A new engineer cannot reconstruct the system from current code plus one reliable current document. The clearest facts are distributed across a 2,045-line `scripts/data/sync.ts`, builder/projector modules, manifests, validation scripts, server loaders, tests, and multiple documents with different schema eras.

**RECOMMENDATION.** After the rewrite, maintain one short normative document describing inputs, locale registry, domain ownership, output contract, and validation commands. Mark all phase/implementation reports as historical, with their last-known schema and date. Do not update those reports to simulate timeless accuracy.

## 4. Current Repository State

The audit baseline was recorded before investigation:

| Repository          | Branch    | Commit                                     | State                                                                          |
| ------------------- | --------- | ------------------------------------------ | ------------------------------------------------------------------------------ |
| `HSR-Database`      | `develop` | `3e713d1a096134374c80271f9c36b3258a1c9fa0` | Dirty before audit: many modified and untracked i18n/l10n implementation files |
| `TurnBasedGameData` | `main`    | `8cdb905dc2f8e6fffa9be4eb07af3e34435d6091` | Clean; read only                                                               |
| `StarRailRes`       | `master`  | `d226befe3db13f2ec15f4161d5f34b1b607643fe` | Clean; read only                                                               |

`upstream.lock.json` has schema `1` and pins those two upstream commits. The generated manifest also records the TurnBasedGameData commit and source version `OSPRODWin4.5.0_D16354198_A16307208_L16320302` (`4.5`).

**FACT — HIGH CONFIDENCE.** Much of the architecture audited here is present as pre-existing uncommitted work rather than in `HEAD`. That includes domain/projector modules, locale-neutral types, Paraglide configuration/messages, migration fixtures, and existing audit reports. This report evaluates the current working tree because that is the requested current system; commit history cannot establish stable provenance for all of it.

## 5. Current Architecture

### Actual data flow

```text
Pinned TurnBasedGameData checkout
  ExcelOutput/*.json + TextMap/TextMapCHS.json
                 |
                 v
scripts/data/raw.ts + scripts/data/paths.ts
  lossless JSON; TextHash/fixed-point values preserved as strings
                 |
                 v
scripts/data/sync.ts::syncData()  [single orchestration process]
  |                 |                         |
  |                 |                         +--> scripts/data/endgame.ts
  |                 |                              structure + CHS resolution together
  |                 +--> Enemy compatibility builder inside sync.ts
  |                      stable hash-based skill kind/tag/inclusion,
  |                      but CHS names/descriptions/labels embedded immediately
  +--> buildCharacterDomain / buildLightConeDomain / buildRelicDomain
       locale-neutral IDs, numeric data and RuntimeTextRef values
                         |
                         v
       projectCharacter / projectLightCone / projectRelic
       createTextResolver(TextMapCHS) + GameText formatting
                         |
            +------------+-----------------------------+
            |                                          |
            v                                          v
src/lib/generated/views/zh-CN/**                 migration/cache trees
localized route-shaped JSON                     root catalogs/details/endgame
                                                 neutral/source + shards/domains
            |                                          |
            v                                          v
src/lib/server/generated.ts                     ensure/validate/tests only
src/lib/server/endgame.ts
            |
            +--> SvelteKit server loads/prerender --> route HTML + __data.json
            |                                           |
            +--> locale catalog joins for Homepage      v
            +--> static/generated/search.json       browser/components
                 localized search documents         already-localized strings
```

Site-owned text follows a separate path:

```text
messages/zh-CN.json
  -> scripts/messages.ts validation
  -> Paraglide compile (paraglide.config.ts)
  -> src/lib/paraglide/messages.js imports
  -> Svelte/build-time callers with explicit locale: 'zh-CN'
```

### Build/generation boundary

**FACT — HIGH CONFIDENCE.** `scripts/data/sync.ts::syncData` loads upstream tables and `TextMapCHS`, creates the resolver, builds/project views, and writes JSON. `scripts/data/ensure.ts` makes `predev`, `prebuild`, and E2E reuse a valid cache or regenerate it. `scripts/data/validate.ts` separately enforces many data and migration assertions.

**FACT — HIGH CONFIDENCE.** Production loaders in `src/lib/server/generated.ts` read only `src/lib/generated/views/zh-CN` for catalog/detail/homepage content. `src/lib/server/endgame.ts` reads the same locale tree's Endgame datasets and constructs route views and occurrence search shards during prerender. The root manifest is also loaded.

**FACT — HIGH CONFIDENCE.** Localization resolution does not happen in UI components. Components receive localized strings or `DescriptionToken[]`. `src/lib/components/GameText.svelte` renders the safe token model from `src/lib/domain/game-text.ts`; there is no raw-HTML localization path.

**FACT — HIGH CONFIDENCE.** A production build completed successfully. Its client JavaScript comprised 41 files/about 508 KB, and text searches found no full TextMap names, neutral/source artifact names, or representative upstream table names. Neutral artifacts were not copied into the built site.

**FACT — HIGH CONFIDENCE.** Localized route data does reach the browser, as expected. Large examples expose efficiency problems: the search page HTML was about 1.39 MB and its `__data.json` about 1.56 MB; `static/generated/search.json` was about 1.11 MB. The largest inspected Enemy page was about 2.66 MB HTML with about 2.54 MB page data. The browser receives the current route's localized detail/search payload, not the full upstream database.

**FACT — HIGH CONFIDENCE.** `src/routes/+layout.server.ts` returns the full root data manifest to page data, so neutral artifact paths, digests, migration labels, and complete route ID arrays are serialized even though neutral content is not. This is metadata leakage and payload overhead, not a TextMap leak.

### Locale leakage into “neutral” layers

The serialized neutral source and three migrated domain files contain no CJK text in a repository search. Character/Light Cone/Relic builders carry references rather than resolved values. However:

- Enemy and Endgame have no equivalent neutral product model; localized values live in their main generated records.
- `scripts/data/projection/character.ts` contains Chinese `SKILL_CATEGORY_LABELS` defaults. Its `locale` context is not sufficient to prevent Chinese output for a future `en` projector invocation.
- `scripts/data/projection/relic.ts` creates the catalog summary with a Chinese `"件："` composition even though category labels come from site messages.
- several fallbacks in `scripts/data/sync.ts` synthesize Chinese labels such as enemy/skill plus ID.

**INFERENCE — HIGH CONFIDENCE.** The “neutral” claim is locally true for persisted Character/Light Cone/Relic domain artifacts, but not an end-to-end repository invariant.

## 6. Domain-by-Domain Architecture

### Character

**FACT — HIGH CONFIDENCE.** `scripts/data/domain/character.ts::buildCharacterDomain` consumes a large table subset assembled in `syncData`. It constructs stable Character IDs, naming evidence, base/enhanced profiles, skills (including multi-form, enhanced, global-buff, servant/memosprite cases), traces, eidolons, stats, equipment recommendations, ExtraEffects, and SpecialEffect relations. Structural classification is mostly delegated to `scripts/data/skills.ts` and relation helpers, not inferred from localized labels.

`scripts/data/projection/character.ts::projectCharacter` resolves `RuntimeTextRef` values, formats descriptions/parameters, groups variants into presentation cards, assigns icon keys, and produces the existing `Character` view. Character naming is special-cased from stable IDs and path rules; `scripts/data/character-names.ts::deriveCharacterNames` independently creates the official/search naming snapshot.

Search consumes localized Character catalog/name data. Homepage stores only gacha/Character IDs and joins them to the localized catalog in the page load, which is a good stable-identity boundary.

Essential complexity includes multi-path protagonists, reviewed naming rules, enhanced forms, servants, skill ownership, progression levels, SpecialEffect edges, and exact numeric parameter formatting. That complexity belongs in domain-owned code.

Accidental complexity includes:

- `CharacterDomain` repeats base-profile `energy`, `skills`, `skillProgressions`, `traces`, `eidolons`, and `specialEffects` at top level. Current records make the top-level members aliases-by-value rather than distinct concepts.
- every one of 97 Character domain records embeds the entire 310-record ExtraEffect collection; the 15.2 MB Character domain is therefore dominated by repeated global data.
- `skillProgressions` is currently always empty.
- `profileIntroSource` and parts of `naming` are carried without a demonstrated production consumer.
- `projectDescription` resolves/formats text through `resolver.projectGameText` and then performs another resolve/format sequence, while level descriptions use a different wrapper path.
- `scripts/data/sync.ts` retains roughly 350 lines of the old Character presentation builder inside a block comment, plus unused helper code protected by a file-wide eslint disable.

**VERDICT:** retain the domain-specific semantic rules, but **REFACTOR** the model and **REPLACE** the migration-era orchestration/persisted shape.

### Light Cone

**FACT — HIGH CONFIDENCE.** `scripts/data/domain/light-cone.ts::buildLightConeDomain` maps Equipment, item, skill, promotion, base-type, and property tables into stable IDs, text references, stats, story, and ranked passive parameters. `scripts/data/projection/light-cone.ts::projectLightCone` resolves name/description/story/passive text and produces catalog/detail views. Search and Homepage use the localized catalog with stable Equipment IDs.

This is the cleanest migrated domain. The domain/view split is proportionate because passive ranks and numeric data can be shared across locales, but persisting an intermediate domain file is not required by runtime behavior. The projector's `locale` argument is currently unused; the resolver carries the real locale.

**VERDICT:** **KEEP BUT SIMPLIFY**. Keep a domain-owned builder and projection function; prefer in-memory transfer and actual-output validation over a versioned persisted neutral DTO.

### Relic

**FACT — HIGH CONFIDENCE.** `scripts/data/domain/relic.ts::buildRelicDomain` builds sets, effects, piece slots, sources, and property recommendations. `scripts/data/projection/relic.ts::projectRelic` resolves set/piece/effect/source text and receives site-message category labels from `syncData`. Search uses localized catalog records.

Strong parts are set ID ownership and structural category derivation from the piece-slot set. Weak parts are:

- piece ID is extracted with a suffix regex from the symbolic `RelicName` key. It is independent of the localized value but coupled to a naming convention rather than an explicit upstream ID contract;
- the projector hardcodes Chinese punctuation/composition for the catalog summary;
- effect views keep plain strings, so the UI reparses game markup rather than consuming one consistently typed token representation;
- `locale` is unused and does not protect future projections from Chinese defaults.

**VERDICT:** **KEEP BUT SIMPLIFY**, with an explicit, tested piece-ID rule and locale-owned summary composition.

### Enemy

**FACT — HIGH CONFIDENCE.** Enemy is built inline in `scripts/data/sync.ts`, not through `src/lib/domain/neutral.ts`. The generated `Enemy` view combines localized catalog/template/monster/skill/summon fields with structured numeric combat data.

An important current improvement must be stated accurately: `scripts/data/enemy-skill-policy.ts` maps `SkillTypeDesc` and `SkillTag` **TextHash values** to semantic codes, and `data/policies/enemy-skill-inclusion.json` decides visibility by stable `SkillID` plus an exact raw-source signature. Localization is not used for classification or inclusion. Unknown hashes or source changes fail generation for review.

Remaining multilingual problems are:

- `resolveEnemySkillSource` still resolves `kindLabel`, tag label, and description while classifying, returning a localized view-shaped object rather than a neutral Enemy skill;
- Enemy name, descriptions, damage/resistance labels, summon names, hrefs, and fallback strings are embedded during the inline build;
- canonical and concrete variants duplicate localization logic and view records;
- missing skill names fall back to Chinese `技能 {id}` and enemy names can fall back to `敌人 {id}` or other already-resolved fields;
- `Enemy.weaknesses` is explicitly deprecated compatibility data duplicating `defaultMonster.weaknesses`;
- the inclusion policy is very large because every source row is snapshotted by digest; this provides deliberate review, but makes upstream refresh an all-or-nothing manual policy event.

**INFERENCE — HIGH CONFIDENCE.** Enemy is no longer language-derived at its most dangerous semantic decisions, but it is still a localized compatibility producer and cannot simply be looped over multiple TextMaps.

**VERDICT:** **REPLACE** its inline producer with an Enemy-owned semantic builder and localized projector during the future rewrite; retain the stable hash/code and reviewed-inclusion concepts.

### Endgame

**FACT — HIGH CONFIDENCE.** `scripts/data/endgame.ts::buildEndgameData` builds schema `23` datasets while calling the legacy `resolveRef` API. Structural schedule/group/encounter/stage/occurrence data and localized group/mechanic/enemy strings are serialized together. `src/lib/server/endgame.ts` reads locale-specific datasets, joins Enemy details, caches datasets by mode and groups by `mode:id`, and constructs occurrence search shards.

Internal route identity (`mode` plus numeric group ID) and `occurrenceIdentity` are based on structural/numeric fields rather than localized name. Recommendation selection also uses the presence of source references/schedule state rather than comparing translated names. Those are good boundaries.

Search breaks that boundary. `src/lib/domain/search-index.ts::collectEndgameSearchNames` groups occurrences by localized `occurrence.name`; entry IDs are `SHA-256(name).slice(0, 16)`, and occurrence locators use nested array indexes. Thus a translation change can change search identity/shard membership even when the underlying enemy occurrence is the same. Cache keys currently omit locale; safe today only because one locale exists.

**VERDICT:** **REPLACE** the combined localized builder and name-derived search identity. Keep numeric route/group/occurrence identities and the product view behavior.

## 7. Site Messages and Game Text

There are two legitimate text sources:

1. Upstream game-owned content: TextHash/symbolic references resolved from a game TextMap and formatted with game parameters/markup.
2. Site-owned interface text: labels, navigation, controls, accessibility text, empty states, and errors compiled by Paraglide from repository-owned messages.

**FACT — HIGH CONFIDENCE.** `project.inlang/settings.json` declares only `zh-CN`. `scripts/messages.ts` losslessly parses and validates the message file, including duplicate keys, snake_case keys, nonempty values, and placeholder contracts. Current callers import generated Paraglide messages and generally pass `{ locale: 'zh-CN' }` explicitly. One hundred messages compile successfully.

**FACT — HIGH CONFIDENCE.** The separation is conceptually correct but technically incomplete. `docs/investigations/technical-debt-ui-text-inventory.csv` and direct searches identify reachable Chinese literals in shared/layout/detail/Endgame presentation, domain label maps, error/fallback paths, and page components. Examples include the footer in `src/routes/+layout.svelte`, detail labels/fallbacks in `src/lib/components/DetailPage.svelte`, Endgame mode metadata in `src/lib/domain/endgame-view.ts`, and projection defaults.

**FACT — HIGH CONFIDENCE.** Components do not resolve upstream TextHashes. They render already-localized game fields plus Paraglide/site labels. That interface is good. `GameText.svelte` renders a structured safe representation and does not use `{@html}`.

**INFERENCE — HIGH CONFIDENCE.** Paraglide is not a duplicate of the game resolver: it owns different content and should remain. Duplication exists around validation/configuration and around game formatting wrappers, not in the basic decision to use two systems.

**RECOMMENDATION.** Keep Paraglide for site text, complete its inventory, and add a source-level check for newly introduced user-visible literals with narrow allowlists. Centralize locale selection so call sites do not each hardcode `zh-CN`. Keep upstream game text out of Paraglide.

## 8. Core Abstraction Review

| Abstraction                                                              | Purpose and consumers                                                                                                     | Lifetime/cost/alternative                                                                                                                               | Verdict                  |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `TextHash` / `parseTextHash` in `src/lib/domain/types.ts`                | Preserves 64-bit decimal identity that JavaScript numbers cannot represent; used by raw parsing/resolution and provenance | Durable, low cost. A branded decimal string is the correct representation.                                                                              | **KEEP**                 |
| `RuntimeTextRef` / `RuntimeTextSource` in `scripts/data/localization.ts` | Represents hash or symbolic references plus source/parameter context for migrated domain builders                         | Durable idea, but naming and source variants can be smaller and domain-local.                                                                           | **KEEP BUT SIMPLIFY**    |
| `TextResolver` / `createTextResolver`                                    | Resolves hashes and symbolic keys, applies gender/nickname/parameters, returns diagnostics                                | Solves a real boundary. Cost comes from overloads and legacy string-returning methods. Prefer one result-returning resolver plus one projection helper. | **KEEP BUT SIMPLIFY**    |
| `LocalizationResult`                                                     | Distinguishes available, absent, missing, empty, invalid, unsupported                                                     | Valuable for required/optional policy and diagnostics. Current legacy adapters collapse states to `''`, erasing the benefit.                            | **KEEP BUT SIMPLIFY**    |
| Neutral source aggregate/shards                                          | Persist copied table subsets and their digests                                                                            | No production consumer; ensure/validate/tests consume them as migration evidence. Inputs are already pinned. An opt-in debug dump is simpler.           | **MIGRATION-ONLY**       |
| Character/Light Cone/Relic domain models                                 | Separate stable structure and text references from locale projection                                                      | Useful concept. Character shape is bloated/duplicated; persisted versions create schema churn.                                                          | **REFACTOR**             |
| `src/lib/domain/views.ts` aliases                                        | Names `CharacterView = Character`, etc.                                                                                   | No semantic distinction or runtime behavior. Use actual output schema/type names.                                                                       | **DELETE**               |
| Domain projectors                                                        | Convert semantic records plus resolver into route-ready views                                                             | Useful per-domain ownership; no need for a generic framework. Several locale args/defaults are misleading.                                              | **KEEP BUT SIMPLIFY**    |
| Localized view artifacts                                                 | Give static loaders route-shaped, already-localized data                                                                  | Directly serve product/runtime needs. Per-route files avoid shipping full DB to ordinary routes.                                                        | **KEEP**                 |
| Root compatibility view tree                                             | Preserves former paths and frozen-contract/validator consumers                                                            | Byte duplicates locale tree; production loaders do not use it.                                                                                          | **MIGRATION-ONLY**       |
| Neutral/localized manifests                                              | Record source, locale, TextMap digest, schemas, staging digests, migration labels                                         | Source/locale provenance is useful. Current shape hashes staging more rigorously than actual views and is serialized to clients.                        | **REPLACE**              |
| Enemy/Endgame “compatibility-projector” label                            | Describes unmigrated producers in manifest metadata                                                                       | It is bookkeeping, not an abstraction or integrity guarantee.                                                                                           | **DELETE after rewrite** |

## 9. Migration / Compatibility Residue

Important reachable or test-enforced residue includes:

- `scripts/data/sync.ts` begins with a global unused-variable eslint disable explicitly justified by the “B3 cutover.” A block-commented `removedCharacterPresentationBuilder` retains the old Character builder in executable source, and related old helpers remain.
- `scripts/data/localization.ts` exposes deprecated `resolveHash`, `resolveRef`, and `resolveSymbolic` string adapters and a legacy overloaded resolver constructor. Endgame and compatibility code keep them reachable.
- `src/lib/generated/catalogs`, `details`, `endgame`, and root `homepage.json` duplicate `views/zh-CN`; `scripts/data/ensure.ts`, `scripts/data/validate.ts`, tests, and `scripts/data/i18n-contract.ts` still consume the old paths.
- `src/lib/generated/neutral/source.json`, five source shards, and three domain artifacts are required by ensure/validate even though production does not read them.
- `DataManifest.migration`, per-domain `builderVersion`, `projectionVersion`, and the strings `compatibility-projector` encode migration phase rather than product compatibility.
- `tests/fixtures/i18n-chs-contract.json` and `scripts/data/i18n-contract.ts` freeze file-level digests across old root artifact paths. This can detect change but cannot explain whether it is visible, semantic, property-order-only, or intended.
- `Enemy.weaknesses` is marked deprecated and duplicates canonical monster data.
- detail/server code uses `unknown as Character` and similar assertions instead of validating generated output at the consumption boundary.
- silent/fallback behavior remains common: optional text is often reduced to `''`; detail loaders catch broad failures and map them to 404; missing localized labels can fall back to IDs or Chinese synthetic strings.

**INFERENCE — HIGH CONFIDENCE.** Most residue is still reachable because migration validators and tests make it reachable, not because the product needs it. That distinction matters: “has consumers” does not mean “is permanent.”

## 10. Duplication and Accidental Complexity

### Measured artifact duplication

| Tree               | Files |       Bytes | Runtime production consumer?        |
| ------------------ | ----: | ----------: | ----------------------------------- |
| root `catalogs`    |     5 |     360,182 | No (compatibility validation/tests) |
| root `details`     |   954 | 138,598,253 | No (compatibility validation/tests) |
| root `endgame`     |     4 |  42,523,414 | No (compatibility validation/tests) |
| `neutral`          |    10 |  53,424,904 | No (ensure/validate/tests)          |
| `views/zh-CN`      |   965 | 181,483,195 | Yes                                 |
| `static/generated` |     2 |   1,125,081 | Yes                                 |

The root and locale view trees have 964 matching non-manifest files; all matched lengths, and representative Character, Enemy, catalog, Endgame, and Homepage hashes were identical.

### Repeated or misplaced work

- `syncData` remains a monolithic table loader, cross-domain indexer, compatibility builder, projector caller, serializer, manifest builder, and search builder.
- schema/version/digest expectations are repeated across sync, ensure, validate, server code, and tests. The stale schema-39 test demonstrates the coordination cost.
- Character official/search names and Character view names traverse separate rule paths that are later required to agree.
- Game text formatting is split between `scripts/data/text.ts` and `src/lib/domain/game-text.ts`. Build-time interpolation versus client-safe rendering is a valid separation, but Character wrappers perform redundant resolution/formatting.
- locale mapping exists as types (`zh-CN`/`en`, `CHS`/`EN`) rather than one authoritative runtime registry; most consumers hardcode only one branch.
- `viewDigest` is computed from an in-memory combined `viewPayload` that is not an emitted artifact. Validation does not hash every localized file against a manifest entry, whereas neutral staging files receive per-file hashes.

**INFERENCE — HIGH CONFIDENCE.** The domain-specific logic is not overengineered; the persisted staging, compatibility duplication, manifest/version web, and cross-cutting orchestration are.

## 11. Test Architecture and Test Integrity

| Classification                         | Representative tests/contracts                                                                                                            | Assessment                                                                                                                                                                                        |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRODUCT BEHAVIOR CONTRACT              | Playwright catalog/detail/Endgame/search/navigation tests; `GameText` rendering; selected semantic Character skill/icon assertions        | Valuable. E2E is broad and currently green, but still samples rather than exhaustively baselines all entities.                                                                                    |
| DATA-INTEGRITY CONTRACT                | lossless raw/TextHash tests, source pin checks, relation audits, stat progression, Enemy inclusion signatures, generated validation       | Valuable when based on upstream invariants. Exact counts tied to one upstream revision should be labelled fixtures, not timeless rules.                                                           |
| ARCHITECTURE / IMPLEMENTATION CONTRACT | no TextMap in client, explicit message use, manifest shapes, generated directory scans, neutral-domain digest linkage                     | Some useful boundary tests; many over-specify current layout.                                                                                                                                     |
| MIGRATION-ERA CONTRACT                 | `i18n-chs-contract` root-tree digests, neutral source/domain hashes, `migration` manifest labels, compatibility path equality             | Temporary scaffolding. Keep only until semantic parity baselines replace it.                                                                                                                      |
| OBSOLETE OR SUSPECT                    | expected schema `39`, exact missing-A count `1614`, test that expects scripts TypeScript compilation to fail, exact total icon-key counts | Currently contradict live code or conflate changing implementation inventory with product behavior. Specific icon ownership assertions remain potentially valid even if total counts are brittle. |

There are no Vitest `todo`, `fails`, or expected-failure mechanisms for the six failures below. Playwright's three skips are declared by project/platform applicability (mobile-only behavior), not hidden failures. An `@ts-expect-error` in unit source is an intentional TypeScript negative test, not a test-run expected failure.

**RECOMMENDATION.** Organize tests by contract type in naming and documentation. Make product baselines semantic and human-diffable; keep architecture invariants few and explicit; scope upstream-count fixtures to the pinned source version; delete migration contracts when their replacement is green.

## 12. Current Test / Validation Results

Commands were run against the current dirty working tree without updating fixtures.

| Command                | Result                 | Detail                                                                                                                                                                                                              |
| ---------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm messages:check`  | **PASS**               | 100 `zh-CN` site messages validated/compiled.                                                                                                                                                                       |
| `pnpm data:validate`   | **PASS with warnings** | 535 unresolved TextHash references in audit bucket A, zero invalid-reference bucket D, and 1,127 `zh-CN` search records. Passing status means these warnings are currently allowed, not necessarily user-invisible. |
| `pnpm data:i18n:check` | **FAIL**               | Frozen CHS contract differs for all 97 Character detail artifacts.                                                                                                                                                  |
| `pnpm check`           | **PASS**               | Svelte check: 0 errors/0 warnings; scripts TypeScript check passed.                                                                                                                                                 |
| `pnpm lint`            | **PASS**               | Prettier and ESLint passed.                                                                                                                                                                                         |
| `pnpm test`            | **FAIL**               | 34 files: 30 passed, 4 failed. 398 tests: 392 passed, 6 failed.                                                                                                                                                     |
| `pnpm build`           | **PASS**               | Data/assets ensured, SvelteKit client/server build and static adapter completed.                                                                                                                                    |
| `pnpm test:e2e`        | **PASS with SKIP**     | 229 passed, 3 platform-scoped skipped, 232 total. Repeated expected 404 requests for the optional Vercel Insights script did not fail tests.                                                                        |

The six unit failures are:

1. `tests/unit/data.test.ts` expects manifest schema `39`; live code/type/artifact use `40`. **Assessment: stale implementation assertion; HIGH confidence.**
2. The same file expects Evernight's memosprite card icon key `skill-tree--1413301`; current projection emits `skill--1141301`. **Assessment: likely production/icon ownership defect or unapproved observable change; MEDIUM confidence pending maintainer/source review.**
3. The same file expects missing-text bucket A count `1614`; current validation reports `535`. **Assessment: stale upstream/migration count, not a timeless product assertion; HIGH confidence.**
4. `tests/unit/i18n-phase1.test.ts` reports all 97 Character detail CHS digests changed. **Assessment: the contract is migration-era and too opaque, but the failure is critical evidence that parity is unproven; HIGH confidence.**
5. `tests/unit/scripts-typecheck.test.ts` expects `tsc` to report a real missing `defined` symbol; `tsc` now passes. **Assessment: test deliberately preserves a fixed compiler defect and is obsolete/suspect; HIGH confidence.**
6. `tests/unit/visual-assets.test.ts` expects 1,547 Character detail icon keys; current requirements have 1,544. **Assessment: exact totals are brittle, but combined with the Evernight key mismatch this requires product-level icon coverage review; MEDIUM confidence.**

The tests therefore contradict one another at the suite level: the typecheck command is required to pass by `pnpm check`, while one unit test expects it to fail. E2E accepts the current rendered sample while the frozen file contract rejects every Character detail. These must not be relabelled “expected failures.”

## 13. Product Behavior Baseline Proposal

Before rewriting, capture a versioned, reviewable `zh-CN` baseline from the maintainer-approved output. Baseline semantics, not migration file layout.

For every entity and relevant route, capture:

- **Character:** catalog identity/order/filter fields; display/base/full name rules; path/element labels; story; base/enhanced profile selection; every visible skill card/variant/category/default level; memosprite/servant ownership; trace/eidolon order and text; ExtraEffect/SpecialEffect relations; stats; icon keys; formatted `DescriptionToken` sequences; links and query-state behavior.
- **Light Cone:** catalog fields; name/story/path; base stats; passive name; all superimposition levels and formatted parameters; icon and route targets.
- **Relic:** set/piece identity and order; category; sources; piece descriptions; two/four-piece effects and parameter/token output; catalog summary.
- **Enemy:** template and concrete-monster selection; names/ranks; weaknesses/resistances/stats; included skills, kind/tag/damage/phase and formatted text; summons; fallback/empty behavior; route links.
- **Endgame:** mode/group/schedule ordering; recommendation; titles/mechanics; stage/slot/wave/occurrence structure; joined Enemy cards; route/query anchors; stable occurrence identity; search expansions.
- **Homepage:** gacha order, joined localized cards, links, and empty/fallback states.
- **Search:** normalized localized documents, aliases, result category/order, route targets, Endgame expansion/grouping, shard loading/failure/retry behavior.
- **Rendered behavior:** representative desktop/mobile snapshots or DOM assertions for GameText markup, whitespace/newlines, icons, accessibility labels, filters, sliders, modals, and navigation.

Store stable IDs beside localized values and use deterministic canonical JSON with field-level diffs. Exclude generated timestamps, internal schema numbers, builder/projector names, migration paths, staging hashes, and object property order unless they affect serialization consumed by a product API.

For the current 535 unresolved references, produce a consumed-output report: required/optional, entity/field, fallback chosen, and whether the value reaches a route. A raw aggregate count is data-health telemetry, not a sufficient parity contract.

## 14. Architecture Worth Keeping

- **Lossless upstream parsing.** `scripts/data/raw.ts` prevents 64-bit TextHash and fixed-point corruption. This is correctness infrastructure, not migration baggage.
- **Pinned, verified upstreams.** `upstream.lock.json`, clean sibling repos, and source-commit manifests make data builds reproducible.
- **Build-time localization.** It keeps full TextMaps and raw configs out of the browser and fits static deployment.
- **Stable game identity where already used.** Character/Equipment/Relic/Enemy template/monster/group IDs and Endgame structural occurrence identity are the right join keys.
- **Explicit localization states and provenance.** Missing, absent, empty, invalid, and unsupported are meaningfully different; diagnostics should retain entity/field provenance.
- **Domain-owned structural rules.** Character form/skill/SpecialEffect logic and Enemy hash-to-semantic-code mappings are clearer and safer than translation-derived inference.
- **Route-shaped localized outputs.** Catalog/detail separation is appropriate for prerender and keeps ordinary pages from receiving the entire database.
- **Safe GameText rendering.** Build-time formatting plus structured tokens and `GameText.svelte` avoid raw HTML while preserving game markup.
- **Separate site and game text ownership.** Paraglide and TextMaps solve different problems. The separation should be completed, not collapsed.
- **ID-only Homepage source.** Joining localized catalog entries late is simple and locale-scalable.
- **Search failure behavior.** The browser search service exposes unavailable/retry behavior and discards late shards instead of silently mixing state.

## 15. Architecture Problems

### Explicit quality questions

**A. Can a new engineer understand it from code and one current document?** No. There is no single accurate document; orchestration, compatibility paths, and contracts span many files and schema eras.

**B. Is there one source of truth for structured game identity?** Mostly for migrated domains and routes, but not fully. Endgame search identity and grouping use localized names; Relic piece identity relies on a symbolic-key naming convention; Character name derivation is duplicated.

**C. Is localization at the correct boundary?** Build-time projection is correct. Within the generator, Enemy/Endgame resolve too early and migrated domains persist too many intermediate boundaries. The best boundary is after semantic construction and before route/search serialization, in one build process.

**D. Is neutral/domain/view separation useful?** The conceptual distinction is useful. Persisting and versioning every intermediate is not. Character/Light Cone/Relic benefit from semantic builders and localized projection; the `source.json -> shard -> domain JSON -> view JSON` disk pipeline adds little to a single-process build.

**E. Are domains forced through ill-fitting abstractions?** Not yet uniformly: that is both a benefit and a symptom. Light Cone fits the current split; Character needs a richer but leaner graph; Enemy and Endgame still bypass it. A future design should share contracts, not force one generic DTO/projector shape.

**F. Are artifacts product-driven or migration-driven?** The locale route views and search index are product-driven. Root duplicates, neutral snapshots, migration labels, and many digests are migration-driven.

**G. Do manifests provide real integrity?** Partially. Upstream commit, locale, TextMap digest, and per-neutral-file hashes are real checks. But the live localized files lack equivalent per-file manifest hashes, the combined view digest targets a non-emitted aggregate, and consumers cast JSON without runtime validation. Migration bookkeeping is stronger than the product boundary.

**H. Can current architecture support `zh-CN` and `en` without duplicating entire databases?** Not as implemented. It could reuse in-memory/neutral structure, but would emit a full locale-specific view tree per locale. That duplicates structural/numeric fields. This may be acceptable initially for simplicity, but current Enemy/Endgame/search/server types and hardcoded Chinese text prevent even that straightforward extension. A later measured optimization could split unusually large shared structural payloads from locale overlays, keyed only by stable IDs; it should not be the starting abstraction.

**I. What would be different without migration history?** There would be no root compatibility tree, serialized raw source aggregate, migration manifest, `compatibility-projector` labels, frozen file-digest contract, deprecated resolver API, trivial view aliases, or commented old builder. Generation would be per-domain modules coordinated by a small entry point; neutral models would normally remain in memory; manifests would describe emitted product artifacts; test baselines would diff product semantics.

### Severity-ranked problems

1. **CRITICAL / HIGH CONFIDENCE:** Character parity is presently untrusted: all detail digests changed, a specific ownership/icon assertion fails, and E2E does not exhaustively arbitrate the difference.
2. **HIGH / HIGH CONFIDENCE:** localized names participate in Endgame search identity and shard grouping.
3. **HIGH / HIGH CONFIDENCE:** the working architecture is an enforced migration midpoint with two production-generation patterns and compatibility artifacts treated as validity requirements.
4. **HIGH / HIGH CONFIDENCE:** generated duplication and Character model replication impose large build/storage/validation cost.
5. **MEDIUM / HIGH CONFIDENCE:** one-locale hardcoding and Chinese defaults make declared `en` support misleading.
6. **MEDIUM / HIGH CONFIDENCE:** site-message coverage is incomplete.
7. **MEDIUM / HIGH CONFIDENCE:** manifest integrity is concentrated on non-runtime staging while actual view loading uses unchecked casts.
8. **MEDIUM / HIGH CONFIDENCE:** search and large Enemy pages serialize oversized localized payloads to browsers.
9. **MEDIUM / HIGH CONFIDENCE:** monolithic orchestration, repeated schema knowledge, legacy adapters, and dead commented code increase change coupling.
10. **LOW / MEDIUM CONFIDENCE:** some wrapper/type layers (`views.ts`, unused locale parameters) communicate an architecture that does not yet exist.

## 16. Deletion Candidates

Do not delete these during the audit. “Immediate” below means no product consumer was found, but deletion should still be a reviewed future change with the baseline green.

| Exact path / symbol or artifact                                                                                   | Current consumers                                                                | Why it exists / evidence                                                          | Timing                                                                                      |
| ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `scripts/data/sync.ts` block-commented `removedCharacterPresentationBuilder`                                      | None; comments only                                                              | Preserves the replaced B3.1 builder in live source; Git already preserves history | Immediately after current work is committed/reviewed                                        |
| obsolete Character helper set protected by the file-wide eslint disable in `scripts/data/sync.ts`                 | No live producer for the commented builder; individual symbols must be rechecked | Header explicitly says “legacy producer helpers retained during B3 cutover”       | After symbol-by-symbol dead-code check                                                      |
| `src/lib/domain/views.ts` aliases                                                                                 | Type imports only                                                                | `CharacterView`, `LightConeView`, `RelicSetView` add no semantic contract         | Immediately, with imports updated                                                           |
| deprecated resolver methods/legacy constructor in `scripts/data/localization.ts`                                  | Endgame and compatibility helpers                                                | State-collapsing adapters bridge old string APIs                                  | After Enemy/Endgame projection rewrite                                                      |
| `src/lib/generated/catalogs/**`, `details/**`, `endgame/**`, root `homepage.json`                                 | ensure/validate/tests/i18n contract; not production loaders                      | Exact duplicate of `views/zh-CN` product artifacts                                | After validators/tests read locale outputs                                                  |
| `src/lib/generated/neutral/source.json` and `neutral/source/*.json`                                               | ensure/validate/tests only                                                       | Persist copied pinned inputs as migration staging; aggregate duplicates shards    | After generators validate inputs directly; retain optional debug dump if needed             |
| `src/lib/generated/neutral/domains/*.json`                                                                        | ensure/validate/tests only                                                       | Persisted proof of migrated builders; production uses projected views             | After generation keeps models in memory and semantic tests cover builders                   |
| `DataManifest.migration` and strings such as `neutral-domain-4`, `neutral-projector-4`, `compatibility-projector` | ensure/validate/tests/layout page data                                           | Phase tracking, not product compatibility                                         | After architecture replacement                                                              |
| `tests/fixtures/i18n-chs-contract.json` plus `scripts/data/i18n-contract.ts` file-digest contract                 | `data:i18n:check`, unit tests                                                    | Migration parity guard; currently opaque and red for all Characters               | Only after approved semantic/rendered baseline replaces it                                  |
| duplicated top-level fields in `CharacterDomain` and `profileIntroSource`                                         | builders/projector/serializers; little or no independent meaning                 | Repeat `profiles.base` or have no demonstrated product consumer                   | During Character model refactor                                                             |
| per-Character embedded full `extraEffects` table                                                                  | Character projector/domain artifact                                              | All 97 records carry all 310 effects                                              | During Character refactor; replace with one registry/referenced owned subset                |
| `Enemy.weaknesses` compatibility field in `src/lib/domain/types.ts`                                               | Endgame/default-monster compatibility consumers                                  | Marked `@deprecated`; duplicates `defaultMonster.weaknesses`                      | After consumers join through `defaultMonster` explicitly                                    |
| localized-name hash IDs in Endgame search                                                                         | search index/server/browser cache                                                | Implementation convenience, but unstable across locales/text edits                | During Endgame/Search rewrite                                                               |
| full root manifest returned by `src/routes/+layout.server.ts`                                                     | all pages                                                                        | Makes build/migration metadata globally available                                 | Replace immediately after defining minimal public version data; keep private build manifest |

## 17. Fresh Target Architecture

### Recommended data flow

```text
upstream.lock.json + pinned checkouts
             |
             v
lossless typed table readers
  validate required tables and TextMap files
             |
             v
domain builders (one module per product domain)
  stable IDs, numeric structure, TextRef + params, relationships
  Character | Light Cone | Relic | Enemy | Endgame
             |
             | stays in memory by default
             v
for each enabled locale in one LocaleRegistry
  { siteLocale, textMapCode, textMapPath, site-message locale }
             |
             v
domain projection
  resolver result policy + GameText tokens + locale-owned labels
             |
       +-----+-------------------------+
       |                               |
       v                               v
route-shaped locale artifacts      locale search artifacts
views/{locale}/catalogs/details     stable entity/occurrence IDs + labels
views/{locale}/endgame/homepage     no localized-name-derived identity
       |                               |
       +---------------+---------------+
                       v
artifact validation
  per-emitted-file schema + digest, referential checks, product baseline
                       |
                       v
SvelteKit prerender loaders -> browser receives page/search data only

messages/{locale}.json -> Paraglide -> site-owned UI labels
                         (separate from upstream game content)
```

### Responsibilities

- **LocaleRegistry:** one runtime value maps `zh-CN -> CHS` and, when enabled, `en -> EN`; every generator, manifest, loader, search path, and site-message locale derives from it. Types should be inferred from the registry.
- **Raw reader:** preserves exact values and validates only upstream serialization contracts. It does not create product views.
- **Domain builder:** owns stable identity, structural classification, relationships, numeric/stat mechanics, ordering, and text references. Each domain may have a different model; no universal projector framework is required.
- **Resolver:** accepts one TextMap plus context and returns explicit status/value/provenance. Required/optional/fallback policy is chosen by the domain projection, never hidden in a legacy `''` adapter.
- **Projector:** emits the actual product DTO for one locale. Site-owned labels are injected from the site-message catalog or composed in UI; game text comes only from the resolver.
- **Serializer:** writes only files consumed by build/runtime (plus an explicitly invoked debug/audit dump). Atomic generation prevents mixed versions.
- **Manifest:** private build metadata records generator version, upstream pins, locale/TextMap digest, and a digest/schema for each emitted artifact. A minimal public version object contains only fields the UI displays or uses for cache invalidation.
- **Loader:** validates or imports typed generated artifacts, uses locale in cache keys/paths, and does not expose private manifest content.
- **Search:** indexes localized labels but keys documents, entries, shards, and occurrences with stable domain IDs. Translating a name changes indexed text, not entity identity.

### Efficiency position

Initially emitting one route-shaped tree per locale is the simplest correct design and may duplicate structural fields. Do that first and measure. Only split core/locale overlays for exceptionally large Endgame/Enemy data if build size or deployment limits justify the join complexity. Never persist the full raw/source pipeline merely to avoid locale-view duplication; those are different concerns.

## 18. Current → Target Mapping

| Area            | Current                                                               | Problem                                         | Recommended                                                         | Action                 | Regression risk | Effort | Benefit   |
| --------------- | --------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------- | ---------------------- | --------------- | ------ | --------- |
| Raw parsing     | lossless-json helpers                                                 | Some `Raw = Record<string, any>` escape hatches | Keep exact primitives; add narrow table adapters at domain boundary | KEEP/REFACTOR          | LOW             | MEDIUM | HIGH      |
| Locale mapping  | scattered literal `zh-CN` plus latent `en` types                      | False readiness; easy mismatch                  | Single value-level LocaleRegistry                                   | REWRITE                | MEDIUM          | LOW    | HIGH      |
| Text resolution | capable resolver plus legacy adapters                                 | Status collapse and wrapper duplication         | One result API and explicit projection policies                     | SIMPLIFY               | HIGH            | MEDIUM | HIGH      |
| Character       | neutral builder/projector plus duplicated model and dead old builder  | Bloat, parallel naming, red parity              | Lean Character graph, one naming service, domain-owned projection   | PARTIAL REWRITE        | VERY HIGH       | HIGH   | VERY HIGH |
| Light Cone      | clean builder/projector plus persisted DTO                            | Extra staging/version cost                      | Keep modules, use in-memory model                                   | SIMPLIFY               | MEDIUM          | LOW    | MEDIUM    |
| Relic           | builder/projector with symbolic ID convention and Chinese composition | Locale leak/brittle identity rule               | Explicit ID rule and locale-owned formatting                        | REFACTOR               | MEDIUM          | MEDIUM | HIGH      |
| Enemy           | inline localized compatibility builder; semantic policy separate      | Mixed ownership and duplication                 | Enemy semantic builder + locale projection                          | REWRITE                | HIGH            | HIGH   | VERY HIGH |
| Endgame         | combined structural/localized build                                   | Cannot project independently                    | Structural model + locale projection                                | REWRITE                | VERY HIGH       | HIGH   | VERY HIGH |
| Search          | localized documents; Endgame ID from name                             | Identity changes with translation               | Stable domain IDs; localized text only in searchable fields         | REWRITE                | HIGH            | MEDIUM | VERY HIGH |
| Homepage        | ID list joined to locale catalog                                      | Minimal issue                                   | Retain                                                              | KEEP                   | LOW             | LOW    | MEDIUM    |
| Artifacts       | product views + duplicate root + neutral snapshots                    | 417 MB and multiple truths                      | Product locale views only; optional debug export                    | REWRITE                | HIGH            | MEDIUM | VERY HIGH |
| Manifest        | staging-heavy schema 40, public globally                              | Integrity misses actual boundary                | private per-output manifest + minimal public version                | REPLACE                | MEDIUM          | MEDIUM | HIGH      |
| Site messages   | Paraglide, one locale, partial coverage                               | Chinese literals remain                         | Keep and complete coverage; central locale                          | KEEP/COMPLETE          | MEDIUM          | MEDIUM | HIGH      |
| GameText        | build formatting + safe client tokens                                 | Some duplicate wrappers/representations         | One token contract and one interpolation implementation             | SIMPLIFY               | HIGH            | MEDIUM | HIGH      |
| Tests           | broad E2E plus conflicting migration/implementation assertions        | Red suite and unclear authority                 | contract-classified semantic baseline + focused invariants          | REWRITE TEST CONTRACTS | VERY HIGH       | HIGH   | VERY HIGH |

## 19. Rewrite Strategy

### R0 — establish authority and parity

1. Commit or otherwise freeze the current candidate implementation so the baseline is reproducible.
2. Triage all 97 Character contract differences field-by-field. Resolve the Evernight/memosprite icon ownership and missing asset-key differences with upstream evidence and maintainer approval.
3. Capture the semantic/rendered baseline from Section 13. Keep the old digest fixture temporarily, but do not update it blindly.
4. Classify the 535 unresolved references by whether they reach visible required fields.

Exit criterion: one maintainer-approved `zh-CN` product baseline is green, and ordinary test failures are zero.

### R1 — introduce the small target spine

Add the LocaleRegistry, one resolver result API, per-domain build/project contracts, atomic serializer, and private/public manifest split. Start with Light Cone and Relic because their current flow is smallest. Generate old and new product DTOs side-by-side only inside tests/build comparison, not as two permanent filesystem trees.

Exit criterion: semantic output equals the baseline and production loaders can read the new locale path.

### R2 — refactor Character

Remove duplicated base-profile fields and global ExtraEffect replication, unify name derivation, and make one GameText projection path. Preserve all stable IDs, ownership relations, order, tokens, and icons. Differentially compare every Character field, not only digests.

Exit criterion: all 97 Character semantic diffs are empty and representative rendered pages match.

### R3 — rewrite Enemy and Endgame boundaries

Build Enemy structure without resolving labels, retaining hash-based kind/tag mapping and reviewed inclusion. Then separate Endgame structure from localized projection. Replace name-derived search/shard identity with stable IDs and add locale to caches/paths.

Exit criterion: all Enemy/Endgame/search semantic and E2E baselines match `zh-CN`.

### R4 — remove migration outputs/contracts

Move validators and tests to actual locale outputs, delete root duplicates, neutral snapshots, old APIs, migration metadata, commented/dead builder code, and obsolete assertions. Keep optional diagnostics as explicit commands rather than required artifacts.

Exit criterion: a clean generation/build produces only runtime-required artifacts and a private integrity manifest.

### R5 — prove locale scalability

Without publishing `/en`, run an offline English projection smoke test against pinned `TextMapEN`: no Chinese site defaults, stable entity/route/search IDs, explicit missing-state report, and no TextMap in client output. Only then plan locale routing/product decisions.

## 20. Risk Assessment

| Risk                                                                       | Severity / confidence | Containment                                                                                        |
| -------------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------- |
| Existing unapproved Character differences become the rewrite baseline      | CRITICAL / HIGH       | Complete R0 before architectural changes; require semantic diff review                             |
| Reordering/flattening complex Character relations changes visible grouping | VERY HIGH / HIGH      | ID-keyed field diffs plus all-entity render/token tests                                            |
| Endgame identity replacement changes result expansion or deep links        | HIGH / HIGH           | Preserve route/group IDs; map old name buckets in tests; verify Back/Forward and shard caching E2E |
| Missing TextMap entries silently become empty or synthetic text            | HIGH / HIGH           | Required/optional policy per field; fail required output; report fallback provenance               |
| Removing staging hides upstream drift                                      | MEDIUM / HIGH         | Validate table contracts directly and record upstream/TextMap digests in private manifest          |
| Multi-locale output causes unacceptable storage/build time                 | MEDIUM / MEDIUM       | Measure first; split only measured large shared payloads by stable ID                              |
| Site/game message ownership drifts                                         | MEDIUM / HIGH         | UI literal inventory/check and domain projection API that accepts separate label provider          |
| Manifest/loader schema mismatch becomes a runtime 404                      | MEDIUM / HIGH         | Validate emitted files at build and use generated/static type guards at loader boundary            |
| Large route payloads remain                                                | MEDIUM / HIGH         | Budget static page data and split heavy Enemy/Endgame/search payloads after parity                 |

The riskiest work is Character and Endgame, not the deletion of obvious duplicate files. Deletion should nevertheless occur last because today's tests and ensure path still depend on migration artifacts.

## 21. Documentation Cleanup Recommendation

After implementation—not during this audit:

1. Create one normative `docs/architecture/localization-and-data-generation.md` describing the target data flow, ownership rules, locale registry, artifact contract, and standard commands.
2. Add a banner to phase reports and older audits: historical, non-normative, date, source commit, last schema observed.
3. Update `README.md` to link only the normative document for current architecture and to a separate history index for archaeology.
4. Replace schema-number prose with links to the owning type/validator unless a schema is an external compatibility contract.
5. Keep `technical-debt-ui-text-inventory.csv` only while the finite Paraglide migration is active; close/delete it when an automated literal policy supersedes it.
6. Document how product baselines are approved and updated, including why a localized semantic change is accepted.

## 22. Final Recommendation

**Choose C: partially rewritten.**

The architecture should not be largely retained because its generated staging, manifests, compatibility outputs, test contracts, and two-track domain migration are products of history rather than current runtime needs. It should not be completely redesigned because several foundations are demonstrably sound: lossless parsing, pinned inputs, build-time localization, stable IDs, domain-specific semantic logic, localized route artifacts, safe GameText tokens, and the site/game text split.

The rewrite boundary should be the generator's interior:

- retain the upstream and browser boundaries;
- retain domain knowledge, but reshape it into lean in-memory models;
- replace orchestration, staging, compatibility serialization, and identity derived from localized strings;
- validate actual emitted product artifacts;
- establish observable `zh-CN` parity before doing any of it.

Given the current product requirements, this is not the architecture that should be chosen today as a finished system. It is, however, a useful prototype of the correct boundary. The safest path is to turn that boundary into a smaller coherent implementation rather than either preserving the migration whole or discarding the good parts.
