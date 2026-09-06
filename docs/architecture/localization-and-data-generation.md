# Localization and Data Generation Architecture

This is the normative R6 architecture for the HSR Database product.

## Locale boundary

zh-CN is the base locale and uses unprefixed URLs. en is publicly routed under /en. Paraglide uses URL plus base-locale strategies; SvelteKit de-localizes URLs for the shared route tree, and request middleware stores the resolved locale in App.Locals.locale.

## Data flow

Pinned upstream data and TextMaps are parsed into domain models, projected independently for each locale, and emitted below src/lib/generated/views/{locale}. Static Search and Endgame artifacts are emitted below static/generated/{locale}. Runtime loaders accept locale explicitly and never fall back across locales.

## Artifact contract

Manifest schema 43 retains publicLocale: zh-CN, adds publicLocales, and records canonical routePaths. The route inventory is the source for static prerendering and sitemap generation. Utility asset manifest schema 15 includes the generated Settings icon.

## Ownership rules

Site-owned prose, navigation, controls, metadata, errors, accessible labels, and footer text belong in paired Paraglide message keys. Game-owned names, descriptions, effects, and mechanics remain in localized generated views. Locale-neutral IDs, dates, ordering, and route identities must not depend on translated strings.

## URL helpers

Use src/lib/i18n/routing.ts for canonicalization, localized internal hrefs, and same-page locale counterparts. Helpers preserve query strings and hashes. The settings switcher uses ordinary document links so the URL remains the single locale state.

## Changelog workflow

Changelog metadata uses stable IDs and ISO machine dates in src/lib/content/changelog/entries.ts. Maintainers add or edit matching .svx files under both src/lib/content/changelog/zh-CN and src/lib/content/changelog/en. Validation rejects missing, duplicate, or orphan entries.

## Required checks

Before delivery run pnpm data:sync, pnpm assets:ensure, pnpm messages:check, pnpm data:validate, pnpm product:baseline:check, pnpm check, pnpm lint, pnpm test, pnpm build, and relevant E2E/deployment audits. Build-time limitations or known upstream missing-text diagnostics must be recorded in the R6 audit.
