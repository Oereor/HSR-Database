# Locale-neutral i18n/l10n architecture implementation

## Status

The production pipeline remains `zh-CN` only. Browser loaders read the localized
view tree; raw/neutral artifacts are build and validation inputs and are never
loaded by the browser.

```text
upstream raw config + TextMapCHS
  -> neutral source artifact (schema 1)
  -> zh-CN projection (schema 1)
  -> existing loaders/components and Search schema 2
```

The existing generated paths are still emitted as a CHS compatibility projection
while all server loaders use `src/lib/generated/views/zh-CN`.

Phase B3.1 removes the frozen CHS Character presentation dependency. Character
production now follows `CharacterSource -> CharacterDomain ->
projectCharacterView(domain, context) -> CharacterView`; Enemy and Endgame
remain explicitly on the compatibility projector until their later phases.

Source staging is now also written as domain shards under
`neutral/source/{characters,light-cones,relics,enemies,endgame}.json`; the
original `neutral/source.json` remains as a compatibility aggregate while
downstream migration is completed.

## Contracts

- Root `DataManifest` is schema **40**.
- Neutral manifest is schema **1**, parser `neutral-domain-1`.
- Character domain artifacts are schema **4**, builder `domain-builder-4`;
  Light Cone/Relic remain schema **3**, builder `domain-builder-3`, with per-domain source/content digests, byte counts and
  SHA-256 metadata.
- Localized view manifest is schema **2**, projection `chs-view-4`, locale
  `zh-CN`, upstream TextMap code `CHS`.
- Search wire schema and occurrence-shard schema remain unchanged.
- `TextHash` remains a decimal branded string. `TextResolver` distinguishes
  `available`, `absent`, `missing`, `empty`, `invalid`, and `unsupported`.
- `enemy-skill-inclusion.json` remains a CHS presentation compatibility oracle;
  it is not stored in the neutral artifact and does not define config existence,
  semantic identity, phase, or kind/tag.
- Root migration metadata records `neutral-domain-1` for Character, Light Cone,
  and Relic, and `compatibility-projector` for Enemy and Endgame.

## Artifact and cache boundary

`src/lib/generated/neutral/source.json` contains lossless selected upstream
tables grouped by character, light-cone, relic, enemy, and endgame domains.
`neutral/manifest.json` records source commit, parser version, content digest,
and artifact byte/SHA-256 metadata. Each source shard additionally records its
own content digest, byte count, SHA-256, and source-commit linkage; validation
rejects a missing, modified, or mixed-commit shard. `views/zh-CN/manifest.json` records the
neutral digest and projection metadata. `data:ensure` rejects missing or mixed
neutral/view trees instead of silently serving mismatched output.

Character, Light Cone, and Relic views are written through their domain
projectors. Character no longer accepts `compatibilityView`, `legacyView`,
`frozenChs`, `baselineView`, or `preResolvedView`; the old Character profile
builder is non-executable and is not copied into tests. Enemy and Endgame
continue using the compatibility path.

## Verification

The current pinned source is TurnBasedGameData `8cdb905dc2f8e6fffa9be4eb07af3e34435d6091`.
The generated CHS counts remain 97 characters, 169 light cones, 60 relic sets,
and 628 enemy templates. Existing CHS contract, Search golden queries, Endgame
grouping and locator behavior are preserved; all 398 unit tests, script checks,
type checks, data validation, lint, and the normal deployment build pass.

The clean deployment build was rerun through the configured `7890` proxy and
completed successfully in about 366 seconds, including reacquiring both pinned
upstream repositories, regenerating data/assets, and final build verification.
The clean preview E2E suite then completed with **229 passed, 3 skipped, 0
failed** across desktop and mobile Chromium. The skips are the suite's existing
intentional skips; no new failures were introduced.

Protected metadata remained unchanged during the attempt:

- `upstream.lock.json`
- official character-name snapshot
- player aliases
- `data/policies/enemy-skill-inclusion.json`

## Phase B3 — Frozen CHS presentation removal

Light Cone and Relic now project independently from schema 3 neutral domains.
Their previous localized loops have been removed from `sync.ts`; catalog,
detail, Search input, and Homepage input all share the same projected views.
The Light Cone domain now retains item name/description/story, path source,
promotion stats, passive levels and asset identities. The Relic domain retains
symbolic set/piece/effect sources, source-label relations, parameters, stable
piece IDs and category identity. Both passed the complete CHS artifact contract.

The root manifest is schema 40, the localized view manifest remains schema 2, and
the current projection version is `chs-view-4`. View freshness records the CHS
TextMap content digest. Character now projects every catalog/detail field from
the schema 4 neutral domain: skill-card, enhanced/servant, trace/eidolon,
ExtraEffect and SpecialEffect recipes are rebuilt from stable relations,
TextSources and parameters. No frozen CharacterView is accepted by the
projector, and the legacy profile builder is disabled from the production graph.

Character migration metadata is `neutral-domain-4` / `neutral-projector-4`;
Light Cone and Relic remain on `neutral-projector-3`, while Enemy and Endgame
remain compatibility projectors. The Character frozen dependency inventory is
**0**. CHS generation and validation cover all 97 characters, including
Trailblazer, March 7th paths, enhanced and multi-form skills, servant/memosprite
skills, traces, eidolons and typed SpecialEffect relations. The same neutral
domain can be projected with an EN resolver for isolated smoke tests; no EN
production routes or artifacts are generated.

The neutral Character domain retains stable IDs/relations, direct and
parameterized TextSources, level parameters, combat codes, energy/icon
identity, profile splits, enhanced and servant/memosprite relations,
trace/eidolon metadata, ExtraEffect definitions, and semantic SpecialEffect
links. Canonical names, path/element labels, descriptions, tokens, and
localized labels are projected with the resolver and GameText policy; missing
parameterized sources are modeled as absent rather than an empty symbolic key.
Gender and `{NICKNAME}` are resolved from explicit projection context.

`pnpm check:scripts` and `pnpm data:validate` pass after generating all 97
Character views. The full Vitest suite still contains pre-B3 assertions for
root schema 39 and frozen CHS artifact digests; those expected failures are
not used as a legacy oracle for the new Character projector.
