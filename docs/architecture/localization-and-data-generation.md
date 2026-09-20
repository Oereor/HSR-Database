# Localization and Data Generation Architecture

This is the normative R6 architecture for the HSR Database product.

## Locale boundary

zh-CN is the base locale and uses unprefixed URLs. en is publicly routed under /en. Public page URLs use a trailing-slash convention (`/characters/1304/`, `/en/characters/1304/`); route identities in the generated manifest remain locale-neutral and do not require the presentation slash. Paraglide uses URL plus base-locale strategies; SvelteKit de-localizes URLs for the shared route tree, and request middleware stores the resolved locale in App.Locals.locale.

## Data flow

Pinned upstream data and TextMaps are parsed into domain models, projected independently for each locale, and emitted below src/lib/generated/views/{locale}. Static Search indexes are emitted below static/generated/{locale}. Serialized Endgame occurrence views remain private below src/lib/generated/views/{locale}/endgame-occurrences; the shared /generated/{locale}/endgame-occurrences/{targetId} endpoint resolves portrait assets and prerenders the public shards. Static source shards must not shadow that endpoint. Runtime loaders accept locale explicitly and never fall back across locales.

## Artifact contract

Manifest schema 43 retains publicLocale: zh-CN, adds publicLocales, and records canonical routePaths. The route inventory is the source for static prerendering and sitemap generation. Utility asset manifest schema 15 includes the generated Settings icon.

Validation has two explicit layers. `data:validate:build-inputs` reopens the manifest, prepared pinned source, TextMaps and every generated artifact from disk; it validates identity, bytes, digests, schemas, inventories and route/search consumer closure without rebuilding domain semantics. `data:validate:full` composes that gate with the complete raw-to-generated semantic audits, cross-locale structural parity and English CJK audit. The compatibility command `data:validate` remains an alias for the full validator.

The protected `Correctness` check owns full semantic validation. Production runs the build-input validator before Vite, while Preview and Development retain the lighter Phase 0 path. Producer-side prepublication checks remain in generation, and validators remain separate child processes so they independently reopen published bytes.

## Ownership rules

Site-owned prose, navigation, controls, metadata, errors, accessible labels, and footer text belong in paired Paraglide message keys. Game-owned names, descriptions, effects, and mechanics remain in localized generated views. Locale-neutral IDs, dates, ordering, and route identities must not depend on translated strings.

## URL helpers

Use src/lib/i18n/routing.ts for page trailing-slash normalization, canonicalization, localized internal hrefs, and same-page locale counterparts. Helpers preserve query strings and hashes while leaving external, query-only, hash-only, and extension-bearing URLs unchanged. The settings switcher uses ordinary document links so the URL remains the single locale state.

## Changelog workflow

Changelog metadata uses stable IDs and ISO machine dates in src/lib/content/changelog/entries.ts. Maintainers add or edit matching .svx files under both src/lib/content/changelog/zh-CN and src/lib/content/changelog/en. Validation rejects missing, duplicate, or orphan entries.

## Required checks

Before delivery run pnpm data:sync, pnpm assets:ensure, pnpm messages:check, pnpm data:validate, pnpm check, pnpm lint, pnpm test, pnpm build, and relevant E2E/deployment audits. Production-specific input investigations may additionally run `pnpm data:validate:build-inputs`, but passing it is not proof of semantic correctness. Product contracts use focused invariant tests rather than full generated-output baselines. Build-time limitations or known upstream missing-text diagnostics must be recorded in the R6 audit.
