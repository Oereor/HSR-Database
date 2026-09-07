# R6 English Product Enablement and Language Switching

## Scope

R6 enables one bilingual SvelteKit product. Chinese remains the unprefixed base locale (zh-CN); English is exposed under /en. Locale is selected by the URL and is carried through server locals, generated data reads, messages, metadata, Search, Endgame, changelog content, navigation, and the settings switcher.

## Route inventory

The generated manifest is schema 43 and records the canonical public route inventory. The verified inventory is 1,076 ordinary Chinese routes and 1,076 equivalent English routes, with no /zh-CN output tree. The static adapter receives both localized trees from svelte.config.js.

## Routing boundary

Paraglide uses ['url', 'baseLocale']. src/hooks.ts de-localizes the route before SvelteKit matching, while src/hooks.server.ts resolves middleware locale into event.locals.locale and renders %lang% in the document shell.

## Data isolation

Catalog, detail, homepage, enemy, Search, and Endgame APIs require an explicit locale. Reads are restricted to views/{locale} and static/generated/{locale}. Caches include the locale in their keys and there is no cross-locale fallback.

## Navigation and switching

Canonical paths are localized through src/lib/i18n/routing.ts. Internal links, Search targets, Endgame links, breadcrumbs, pagination, and settings counterparts preserve pathname, query, and hash. The fixed bottom-right settings popover renders exactly 中文 and EN; selecting the active locale is a no-op.

## Site messages

The two message catalogs contain 312 paired keys. Site-owned UI copy is message-backed; game-owned names and descriptions continue to come from localized generated views.

## Changelog

Three stable changelog IDs and machine dates are joined with independently maintained zh-CN and en .svx content. The loader validates missing, duplicate, and orphan locale sources and formats dates with the active locale. The existing modal remains the presentation surface.

## Utility assets

Utility asset manifest schema 15 includes SettingsIcon.png, generated from the pinned StarRailRes source and covered by existence/generation validation.

## Metadata and sitemap

The root layout emits self-referencing canonical URLs plus zh-CN, en, and Chinese x-default alternates. The sitemap emits both locale trees with XHTML alternates for every canonical route; robots behavior is unchanged.

## Validation

Completed during R6:

- pnpm data:sync
- pnpm assets:ensure
- pnpm messages:check (312 paired keys)
- pnpm check:scripts
- svelte-check (0 errors; one pre-existing unused CSS selector warning)

The Vite config access warning observed in this managed desktop sandbox is environmental; Svelte diagnostics still complete successfully.

## Regression inventory

The R5 data baseline remains unchanged: 97 Characters, 169 Light Cones, 60 Relic sets, 628 Enemy templates, 1,144 Search documents, 190 Endgame targets, and 8,167 occurrence references per locale. Chinese source wording is retained.

## Limitations

The static adapter's single fallback document can only provide a locale-neutral fallback for unknown non-prerendered English URLs before hydration. Known prerendered English routes have the correct html lang, localized payload, metadata, and UI.
