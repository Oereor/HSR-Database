# Localization and Data Generation Architecture

> CURRENT / NORMATIVE — this document describes the post-R4 architecture.

## Scope

Production currently publishes `zh-CN` only. English remains disabled in the locale registry for future offline projection work.

## Inputs

- pinned `TurnBasedGameData` checkout and `upstream.lock.json`;
- pinned `StarRailRes` assets through the existing asset pipeline;
- losslessly parsed Excel tables and `TextMapCHS.json`;
- site-owned UI messages from `messages/zh-CN.json` through Paraglide.

## LocaleRegistry

`scripts/data/locale-registry.ts` is the single value-level mapping from site locale to TextMap code and site-message locale. Unsupported locales fail explicitly.

## Game Text vs Site Messages

Game text is resolved from upstream TextMaps through the result-based `TextResolver`. Site UI text is owned by Paraglide messages. The two sources are not combined.

## Build Pipeline

```text
pinned upstream
  → lossless readers
  → in-memory semantic domains
  → locale projection
  → locale-qualified product/Search JSON
  → private manifest validation
  → SvelteKit prerender
```

Character, Light Cone, Relic, Enemy, and Endgame builders retain stable IDs, relationships, numeric structure, and text references without persisted semantic-domain authority.

## Generated Artifact Layout

```text
src/lib/generated/
├── views/zh-CN/
│   ├── catalogs/
│   ├── details/
│   ├── endgame/
│   ├── homepage.json
│   └── search-inputs.json
└── manifest.json              # private build metadata

static/generated/zh-CN/search.json
```

There is no root compatibility product tree and no mandatory neutral/source staging tree.

## Search Identity / Locale Ownership

Search documents and Endgame occurrences use stable domain IDs. Localization changes searchable labels only; it does not change entity, route, shard, or cache identity. Search output is locale-qualified.

## Build Manifest / Cache Validity

The schema-41 private manifest records upstream provenance, locale/TextMap digest, route/count summaries, a data revision, and byte/SHA-256 metadata for every emitted JSON artifact. `ensure` and `validate` reject stale, mixed, missing, or structurally invalid product trees.

## Browser Boundary

TextMaps, raw upstream tables, semantic domain objects, and private build metadata remain server/build inputs. Browser payloads contain only the localized route/search data required by the page plus the small public site-version object.

## Product Baseline

`pnpm product:baseline:check` is the authoritative zh-CN semantic regression gate. Baseline fixtures are not updated as part of cleanup.

The test authority is deliberately split into independent contracts:

- **Product behavior** protects observable zh-CN text, formatting, ordering, grouping, routes, fallbacks, and displayed assets.
- **Data/domain integrity** protects locale-neutral IDs, relationships, ownership, Enemy policy, Endgame identity, and referential integrity through focused tests.
- **Architecture invariants** protect build/runtime boundaries such as locale-qualified caches, unsupported-locale failures, and the browser boundary.
- **Upstream health** records version-scoped counts, missing hashes, and asset inventories as diagnostics rather than timeless product behavior.

Migration-era captures, before/after trees, compatibility layouts, and raw registry snapshots are forensic history, not normative test authority.

## Standard Validation Commands

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
```

## Adding a New Locale — architectural requirements only

Add a LocaleRegistry entry and site-message catalog, project the same semantic domains through the result-based resolver, emit locale-qualified artifacts and Search, keep stable IDs locale-independent, validate missing/unsupported states explicitly, and verify that the browser still receives no raw TextMaps or upstream tables. Enabling a new production locale requires a separate product decision.
