# Localization and Data Generation Architecture

This is the normative R6 architecture for the HSR Database product.

## Locale boundary

zh-CN is the base locale and uses unprefixed URLs. en is publicly routed under /en. Paraglide uses URL plus base-locale strategies; SvelteKit de-localizes URLs for the shared route tree, and request middleware stores the resolved locale in App.Locals.locale.

## Data flow

Pinned upstream data and TextMaps are parsed into domain models, projected independently for each locale, and emitted below src/lib/generated/views/{locale}. Static Search indexes are emitted below static/generated/{locale}. Serialized Endgame occurrence views remain private below src/lib/generated/views/{locale}/endgame-occurrences; the shared /generated/{locale}/endgame-occurrences/{targetId} endpoint resolves portrait assets and prerenders the public shards. Static source shards must not shadow that endpoint. Runtime loaders accept locale explicitly and never fall back across locales.

## Artifact contract

Manifest schema 43 retains publicLocale: zh-CN, adds publicLocales, and records canonical routePaths. The route inventory is the source for static prerendering and sitemap generation. Utility asset manifest schema 15 includes the generated Settings icon.

## Ownership rules

Site-owned prose, navigation, controls, metadata, errors, accessible labels, and footer text belong in paired Paraglide message keys. Game-owned names, descriptions, effects, and mechanics remain in localized generated views. Locale-neutral IDs, dates, ordering, and route identities must not depend on translated strings.

## URL helpers

Use src/lib/i18n/routing.ts for canonicalization, localized internal hrefs, and same-page locale counterparts. Helpers preserve query strings and hashes. The settings switcher uses ordinary document links so the URL remains the single locale state.

## Changelog workflow

Changelog metadata uses stable IDs and ISO machine dates in src/lib/content/changelog/entries.ts. Maintainers add or edit matching .svx files under both src/lib/content/changelog/zh-CN and src/lib/content/changelog/en. Validation rejects missing, duplicate, or orphan entries.

## Local data Agent boundary

The developer-only HSR Data Agent uses Vercel AI SDK 7 `ToolLoopAgent` with the official DeepSeek provider. AI SDK owns model steps, validated tool calling, provider protocol handling, reasoning transport, retries, timeouts, stopping, and structured output. HSR-owned code provides instructions plus the deterministic `search_entities`, `query_endgame`, and `aggregate_endgame` executors, including Decimal, warnings, truncation, and evidence semantics.

The Agent is limited to local CLI, Inspector, profiling, and evaluation. It does not add a SvelteKit endpoint, browser bundle, production service, or deployment dependency; the public site remains fully static. Provider creation and `DEEPSEEK_API_KEY` access stay under `src/lib/server`. Historical Phase 1.x reports describe the replaced handwritten loop and remain non-normative records.

## Required checks

Before delivery run pnpm data:sync, pnpm assets:ensure, pnpm messages:check, pnpm data:validate, pnpm product:baseline:check, pnpm check, pnpm lint, pnpm test, pnpm build, and relevant E2E/deployment audits. Build-time limitations or known upstream missing-text diagnostics must be recorded in the R6 audit.
