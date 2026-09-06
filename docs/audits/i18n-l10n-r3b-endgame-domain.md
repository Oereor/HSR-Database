# HISTORICAL / NON-NORMATIVE — see [Localization and Data Generation Architecture](../architecture/localization-and-data-generation.md) for the current system.

# R3B Endgame Structural Domain + Locale Projection

## 1. Executive Summary

Endgame now follows the durable localization architecture used by the other migrated domains: raw pinned data is parsed into an in-memory, locale-neutral `EndgameDomain`, then projected into the authoritative zh-CN route-shaped view. Localized names and GameText no longer participate in Endgame structural identity.

Search now targets stable Enemy `MonsterTemplateID` values. The previous 173 localized-name buckets became 190 template targets while retaining all 8,167 presented Endgame occurrence references. Search and shard schemas, locators, routes, and caches were updated for stable identity and locale ownership.

All Endgame page semantics remain baseline-compatible. Only the explicitly authorized Search fixture and its approval reason changed.

## 2. Starting State

- HSR-Database: `develop`, HEAD `06d4e15ac3eaa46ea419030981205f4d4085d84d`, clean.
- TurnBasedGameData: `8cdb905dc2f8e6fffa9be4eb07af3e34435d6091`.
- StarRailRes: `d226befe3db13f2ec15f4161d5f34b1b607643fe`.
- Both sibling revisions matched `upstream.lock.json` and remained unchanged.
- Fresh generation, assets, product baseline, type checks, and 406 starting unit tests were green.

## 3. Endgame Architecture Before R3B

The Endgame producer accepted a `TextResolver` and combined structural table joins, combat calculations, localized names, MazeBuff formatting, AS boss-guide text, linked ExtraEffects, diagnostics, and final DTO construction. It emitted a root compatibility tree under `src/lib/generated/endgame` and duplicated it into `views/zh-CN/endgame`.

Search grouped occurrences into 173 zh-CN-name buckets. Entry and shard identities were derived from localized labels, occurrence locators depended on nested presentation indexes, and the shard endpoint did not include locale.

## 4. Endgame Architecture After R3B

```text
pinned Endgame tables
  → buildEndgameDomain(root)
  → in-memory, locale-neutral EndgameDomain
  → projectEndgame(domain, zh-CN context)
       ↳ result-based text resolution + projectGameText
       ↳ projected Enemy view join by MonsterTemplateID
  → src/lib/generated/views/zh-CN/endgame/{mode}.json
  → locale-aware loaders / routes / Search documents / shards
```

The domain is never persisted. `views/zh-CN/endgame` is the only generated Endgame product tree, and the manifest marks Endgame ownership as `productionView: localized-view`.

## 5. EndgameDomain

### Mode/group identity

MoC, PF, AS, and AA retain separate mode-specific group and encounter structures. Mode, upstream group/config IDs, recommendation eligibility, schedules, provenance, and mechanic relations are neutral. Group and encounter titles are retained as `NeutralTextSource` values until projection.

### Stage/slot/wave identity

Stages retain upstream `StageID`; battle slots retain explicit slot values. Fixed waves retain their fixed-wave number. Spawn sequences retain infinite-wave and monster-group IDs. Structural order remains available for presentation without becoming entity identity.

### Occurrence identity

Every one of the 25,469 raw occurrences has a globally unique structural `occurrenceId`.

- Fixed occurrence: mode, group ID, encounter/config ID, variant, battle slot, stage ID, fixed-wave number, source position, and `MonsterID`.
- Spawn occurrence: the same enclosing scope plus infinite-wave ID, monster-group ID, source position, and `MonsterID`.

No localized label participates in this identity.

### Enemy joins

Occurrences retain stable `MonsterID` and `MonsterTemplateID` references plus Endgame-specific combat calculations. The projector obtains occurrence names from the already-projected Enemy catalog keyed by `MonsterTemplateID`; it does not duplicate Enemy localization rules.

### Mechanics

MazeBuffs, MoC turbulence, PF mechanics/cacophony, AS aftertastes/axioms/boss traits, AA traits/quadrants, and linked effects retain stable IDs, parameters, hashes, provenance, and neutral text sources. Mode-specific relations remain explicit rather than being flattened into one universal DTO.

### Schedule

Schedule IDs and begin/end values remain structural data. Current, upcoming, unknown, historical, and recommendation classification remains time-dependent in the loader/presentation layer, preserving boundary behavior.

## 6. Locale Projection

### Text

The Endgame projector resolves group and encounter names, MazeBuff text, AS boss traits, and linked effects through result-based localization APIs. Localized structural fields are absent from the neutral builder result.

### GameText

Parameterized descriptions use `projectGameText`, preserving tokens, markup, placeholder diagnostics, used-parameter auditing, and existing rendered semantics.

### Fallbacks

Existing required/optional behavior, empty-text rejection, omission rules, and display fallbacks remain projection-owned. The projected route DTO preserves the existing Endgame schema version 23 and property shape.

### Diagnostics

Projection retains entity, stable ID, field, requirement, visibility, fallback, and route-reachability context. Historical MazeBuff and AS boss-guide audit counts are reconstructed after projection rather than being decided in the domain builder.

## 7. Search Identity Before R3B

Endgame Search used `endgame-name` targets grouped by normalized zh-CN enemy label. A name hash effectively owned entry and shard identity, so translation or punctuation changes could rewrite identity. Occurrences were located by nested array indexes and shards were loaded from a locale-less endpoint.

## 8. Stable Search Identity After R3B

### Target IDs

`SearchTarget` now uses `{ kind: 'endgame', id: monsterTemplateId }`. Each unique Endgame `MonsterTemplateID` is one target, and the Search document key is deterministic from that template target.

### Grouping

The pinned data produces 190 template targets. Seventeen zh-CN labels are shared by multiple templates; those remain distinct target identities and merge naturally only when results are expanded for the same query.

### Shards

There is one deterministic schema-2 shard per template target. Production URLs are `/generated/zh-CN/endgame-occurrences/{targetId}`; the old locale-less route was removed. Each shard declares its locale and stable target identity.

### Locators

Presented-card locators contain mode, group ID, encounter ID, battle slot, stage ID, fixed-wave number or infinite-wave ID, and `MonsterID`. Encounter/stage/wave/card display order is stored separately. Generation fails on any stable-locator collision, and expansion de-duplicates by locator key.

### Cache identity

Server dataset, group-view, Enemy-reference, and Search-index caches include locale. Browser shard caches use `locale:targetId`, validate shard schema/locale/kind/ID, and evict rejected promises so transient failures can be retried.

## 9. Search Behavior Changes

Intentional changes:

- 173 localized-name buckets became 190 stable template targets.
- Search schema changed from 2 to 3; shard schema changed from 1 to 2.
- Entry keys, target IDs, shard membership, locator serialization, and related tie/result ordering changed where identity grouping changed.
- Duplicate localized labels can now represent separate templates without identity collision.

Unchanged guarantees:

- All 8,167 presented occurrence references remain discoverable and resolve to valid Endgame routes/cards.
- Canonical zh-CN names remain searchable.
- Character aliases, global normalization, non-Endgame document construction, and non-Endgame ranking behavior are unchanged.
- Missing shards preserve ordinary results, transient failures retry, and stale/duplicate expansion results are suppressed.

## 10. Baseline Fixture Changes

The reason-gated command was run with:

`R3B Endgame Search stable-identity cutover; localized-name-derived entry/shard identity replaced while route targets and entity discoverability remain valid`

Before updating, the complete product comparison reported exactly 6,598 differences and every difference belonged to `search`:

- Search documents: 3,501.
- Query results and related ordering: 2,731.
- Shard membership: 363.
- Removal of old `endgameNames`: 1.
- Addition of new `endgameTargets`: 1.
- Addition of locale: 1.

Only `tests/fixtures/product-baseline/zh-CN/search.json` and the approval reason in `metadata.json` changed. No Character, Light Cone, Relic, Enemy, Endgame game-data, Homepage, unresolved-localization, or icon fixture changed. A fresh final baseline check reports zero differences.

## 11. Root Endgame Compatibility Output

Generation no longer emits `src/lib/generated/endgame/**`; a fresh run leaves zero files there. Validators, cache checks, tests, Search generation, asset helpers, and investigation tools now consume `views/zh-CN/endgame/**`.

Root `homepage.json` remains intentionally unchanged. Neutral/source staging also remains for the R4 cleanup boundary.

## 12. Legacy Resolver / Migration Residue Removed

MazeBuff and AS boss-guide helpers now build neutral relations and no longer accept `TextResolver`. The localized `scripts/data/extra-effects.ts` resolver was deleted after its final Endgame consumer moved to projector-owned resolution.

Shared deprecated `resolveHash`, `resolveRef`, and `resolveSymbolic` adapters remain because current non-Endgame Character naming, transitional data generation, Enemy skill-policy, and localization tests still consume them. Their removal belongs to R4 after those consumers migrate.

## 13. Tests Added/Changed/Removed

Focused coverage now verifies:

- neutral TextRefs/parameters/hashes and rejection of invalid display-required relations;
- mode-specific MazeBuff and AS boss-guide relation construction;
- absence of localized group, encounter, occurrence, mechanic, and trait fields in `EndgameDomain`;
- uniqueness of all raw occurrence identities;
- stable occurrence-name joins through projected Enemy templates;
- GameText, fallback, omission, mechanics, HP/phase, fixed/spawn, and schedule-boundary parity;
- label-independent domain, target, shard, and locator identity;
- 190 unique template targets and complete 8,167-reference coverage;
- duplicate-label templates, stable route links, no expansion duplicates, display-order-independent locator keys, locale-separated caches, missing shards, and shard retry behavior;
- absence of root Endgame output and authority of the zh-CN view.

## 14. Product Baseline Results

### Hard product parity

Before the Search cutover, the new Endgame domain/projector passed the full product baseline with zero differences. After the authorized Search update, final `pnpm product:baseline:check` again passes with zero differences.

### Authorized Search differences

The 6,598 pre-update differences are fully accounted for by stable target identity, structural locators, locale ownership, shard membership, and resulting Search ordering. No hard product domain changed.

## 15. Full Validation Results

- `pnpm data:sync`: passed; 97 Characters, 169 Light Cones, 60 Relics, 21 Relic properties, and 628 Enemies generated.
- `pnpm assets:ensure`: passed at StarRailRes `d226befe3db1`.
- `pnpm messages:check`: passed; 101 zh-CN messages.
- `pnpm data:validate`: passed; 1,144 zh-CN Search records. The existing 544 missing-TextHash audit remains an expected warning.
- `pnpm product:baseline:check`: passed; zero semantic differences.
- `pnpm check`: passed; Svelte reports 0 errors and 0 warnings, and script TypeScript passes.
- `pnpm lint`: passed.
- `pnpm test`: passed; 37 files and 409 tests.
- `pnpm build`: passed with adapter-static and all locale-qualified shard entries prerendered.
- `pnpm test:e2e`: passed; 229 passed and 3 repository-defined skips.
- `git diff --check`: passed.

The initial sandboxed Vitest attempt hit the known Vite/esbuild directory-access restriction; normal repository execution access completed all checks successfully. A concurrent first `pnpm check` attempt exited during script TypeScript validation because of process contention; the serial rerun passed.

## 16. Artifact / Performance Impact

- Authoritative zh-CN Endgame view: 4 files, 42,523,414 bytes.
  - MoC: 13,485,944 bytes.
  - PF: 27,475,267 bytes.
  - AS: 1,076,115 bytes.
  - AA: 486,088 bytes.
- Removed duplicate root Endgame tree: 4 files and approximately 42,520,083 bytes from the previous generated layout.
- Fresh `src/lib/generated`: 975 files, 221,074,228 bytes, with zero root Endgame product files.
- Fresh `static/generated`: 2 files, 2,003,420 bytes; zh-CN Search is 1,991,510 bytes.
- Production build: 190 locale-qualified Endgame shard files totaling 11,205,103 bytes.
- Search baseline fixture: 2,165,586 → 3,036,077 bytes (+870,491), reflecting explicit structural locators and 190 stable targets rather than 173 name buckets.

The browser now requests only the stable template shards matched by a query; retry behavior and promise caching are preserved and locale-scoped.

## 17. Remaining Migration Debt

- Root `homepage.json` remains a compatibility artifact.
- Neutral/source staging remains, including the small Endgame source shard used by the current global migration scaffold.
- Shared deprecated text resolver adapters still have verified non-Endgame consumers.
- Manifest private/public shape and migration-version cleanup remain global R4 work.
- The locale registry is structurally ready for projection, but production still intentionally generates only zh-CN.

## 18. R4 Readiness

Character, Light Cone, Relic, Enemy, and Endgame now all have truthful neutral-domain-to-locale-projection boundaries. Endgame no longer requires a localized compatibility producer or duplicate root product tree, and Search no longer treats translated labels as identity.

Protected upstream pins, player aliases, Enemy policy, and sibling repositories are unchanged. No English artifacts, `/en` routes, language UI, commit, or push were introduced.

## 19. Recommendation for R4

Remove the remaining global migration scaffolding as one coherent cleanup: migrate the remaining shared resolver consumers to result-based APIs, retire neutral/source compatibility staging and root Homepage output when their final consumers move, and simplify manifest ownership metadata without changing the now-stable domain/projector boundaries.

> HISTORICAL / NON-NORMATIVE — for the current architecture, see [Localization and Data Generation Architecture](../architecture/localization-and-data-generation.md).
