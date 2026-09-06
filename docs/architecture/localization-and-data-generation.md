# Localization and Data Generation Architecture

> CURRENT / NORMATIVE — this document describes the post-R5 architecture.

## Scope

The build generates complete `zh-CN` and `en` product data. Public routes, server loaders, navigation, SEO, and browser requests remain explicitly `zh-CN`-only until a separate R6 product decision.

## Inputs and ownership

- `upstream.lock.json` pins the read-only `TurnBasedGameData` and `StarRailRes` checkouts.
- Locale-neutral semantics come from losslessly parsed upstream tables.
- Game-owned text comes only from the matching pinned TextMap: `TextMapCHS.json` for `zh-CN`, `TextMapEN.json` for `en`.
- Site-owned UI text comes from manually maintained `messages/zh-CN.json` and `messages/en.json` through Paraglide.
- The maintained player-alias catalog is zh-CN-only. English canonical names and official aliases are derived from TextMapEN and stable naming provenance; English has no player aliases.

TextMaps are never copied into Paraglide and one locale's TextMap is never used as another locale's fallback.

## LocaleRegistry

`scripts/data/locale-registry.ts` is the single value-level mapping from site locale to TextMap code and site-message locale. It distinguishes `projectionEnabled` from `publicRoutingEnabled`.

Both `zh-CN` and `en` are projected. Only `zh-CN` is public. Unsupported locales fail explicitly.

## Build pipeline

```text
pinned upstream
  → one raw-table load
  → one construction pass for shared semantic domains
  → one isolated projection context per generated locale
  → localized views, Search, and occurrence shards in staging
  → localization-health, CJK, structural, digest, and inventory validation
  → atomic publication of both generated roots
  → zh-CN-only SvelteKit prerender
```

Character, Light Cone, Relic, Enemy, and Endgame domains retain stable IDs, relationships, numeric structure, and text references. Projection policy owns locale-specific labels, composition rules, and synthetic fallbacks.

## Localization results and health

The resolver records every attempted resolution as `available`, `absent`, `missing`, `empty`, `invalid`, or `unsupported`, together with domain/entity/field provenance and the field policy: required/optional, emitted/hidden, fallback use, and route reachability.

Required visible localization fails projection. Optional localization follows its explicit omission or locale-owned fallback policy. Every generated locale must report zero unclassified entries and zero invalid program-state errors.

English output is scanned for CJK after staging. A hit must be attributable to TextMapEN; Site Message, projection-policy, CHS-fallback, and unexplained hits fail publication.

## Structural parity

Before publication, the two projections are reduced to locale-neutral structure and compared. The comparison covers Character profiles/skills/traces/eidolons, Light Cones, Relic sets/pieces, Enemy templates/monsters/included skills/summons, Endgame groups/stages/waves/occurrences, Search targets, occurrence shards, Homepage identities, and route-neutral links. Localized strings and locale discriminators are excluded.

## Generated artifact layout

```text
src/lib/generated/
├── views/
│   ├── zh-CN/
│   │   ├── catalogs/
│   │   ├── details/
│   │   ├── endgame/
│   │   ├── homepage.json
│   │   └── search-inputs.json
│   └── en/
│       └── same complete view layout
└── manifest.json

static/generated/
├── zh-CN/search.json
└── en/
    ├── search.json
    └── endgame-occurrences/{targetId}
```

The existing `generated/zh-CN/endgame-occurrences/[targetId]` prerender endpoint remains unchanged. R5 adds no English route; EN shards are static build artifacts for validation and future use.

## Manifest and cache validity

Schema 42 retains stable top-level source/game version, `dataRevision`, public counts/routes, and Endgame summary. It adds generated/public locale metadata, per-locale TextMap digests, counts, Endgame/Search summaries, localization health, artifact totals, and byte/SHA-256 metadata for every artifact.

`dataRevision` includes both TextMap digests and the complete artifact map. Freshness checks reject missing, extra, partial, stale, or digest-mismatched locale trees. Alias-only Search refresh remains zh-CN-only and updates only zh-CN metadata; it does not modify English Search.

## Browser and public-product boundary

Browser-facing product loaders remain rooted at `views/zh-CN`. No locale selection API, `/en` route, switcher, detection, redirects, English SEO, or bilingual public Search is present. Raw TextMaps, upstream tables, semantic domains, audits, and the private manifest remain server/build inputs.

## Product baseline and validation

`pnpm product:baseline:check` remains the authoritative zh-CN semantic regression gate. English correctness is protected by message parity, required-field completeness, structural identity, localization health, focused GameText/Search tests, CJK provenance, artifact integrity, and browser-boundary tests rather than a giant English wording snapshot.

Standard gates:

```text
pnpm data:sync
pnpm assets:ensure
pnpm messages:check
pnpm data:validate
pnpm product:baseline:check
pnpm check
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
git diff --check
```

## Adding or publishing another locale

To generate another locale, add its registry entry, TextMap requirement, and complete manually maintained Site Message catalog, then pass the same domains through an isolated projection context and all parity/health/integrity checks. Making any generated locale publicly routable is a separate product change.
