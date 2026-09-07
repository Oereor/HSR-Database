# Site UI Messages

Phase 1 keeps Simplified Chinese as the sole website language. Game entity names,
descriptions and stories still use the shared TurnBasedGameData TextMap resolver.
Website-owned UI messages use `messages/zh-CN.json` and Paraglide JS **2.25.0**.
The official message-format plugin is pinned to **4.4.0**, matching that compiler's
default project template, and loaded from the installed package rather than a CDN.

## Editing and adding messages

1. Edit the complete message in `messages/zh-CN.json`. For example,
   `home_recent_character_warp` owns “最近限定角色跃迁”.
2. Use a stable semantic key. Share only messages with the same product context.
   Put interpolation into the complete sentence, for example
   `overview_page_count`: `第 {currentPage} / {pages} 页`.
3. For a new migrated message, add its required parameter names to
   `messages/contracts.json`. This file contains no translations; it protects the
   migrated key/parameter interface. Review intentional interface changes together
   with their call sites.
4. Call the generated function directly:
   `m.overview_page_count({ currentPage, pages }, { locale: 'zh-CN' })`.
   Do not introduce `t(string)`, optional calls, or a second Chinese fallback.
5. Run `pnpm messages:check`, `pnpm check` and `pnpm build`. Vite watches message
   edits during development. Tests additionally protect the original CHS contract.

`project.inlang/settings.json` and `paraglide.config.ts` are tracked configuration.
`src/lib/paraglide/` and the inlang cache are compiler output, ignored and rebuilt;
never edit them by hand. Checks compile before consuming declarations, including
the independent scripts/deployment gate. Clean deployment removes compiler output
and the inlang cache as well as existing game/build artifacts.

All calls specify `zh-CN`; the only compiler strategy is `baseLocale`. No locale
store, cookie, browser detection, middleware, URL localization or language switch
is enabled. UI message changes do not participate in game-data or asset manifests.
Generated function types preserve parameter checking without requiring shared
components to reject ordinary strings or game-localized labels.

## Phase 1 coverage

The initial dictionary covers branding, homepage headings and metadata, primary
and mobile navigation, ChangelogModal container UI, shared overview headings,
search, filters, sorting, pagination and empty states. Shared component call-site
messages on catalog/search/Endgame landing pages are included. The original UI
inventory records remaining work by file/category.

Game terms remain in the game text pipeline. Domain detail labels, most of the
full Search/Endgame UI, footer attribution prose and changelog article bodies are
not a claim of complete UI localization. This phase creates no English dictionary.

## Neutral game policies and regression gates

- Character naming uses multi-path/config relationships. Trailblazer's base name
  is resolved from reviewed `FateRinOwner.Trailblazer.OENAMINOLLF` provenance;
  March's official aliases use source field/hash validation, never label equality.
- `scripts/data/enemy-skill-policy.ts` maps reviewed decimal source hashes to
  semantic kind/tag codes. Unknown sources fail with entity/skill/field/hash/text
  diagnostics. Localized labels are separate.
- `data/policies/enemy-skill-inclusion.json` freezes the historical scope for all
  3,548 MonsterSkillConfig rows. This table has no HideInUI. Entries contain stable
  SkillID, raw-source signature, description hash and inclusion, with provenance
  and the historical reason documented at the root. Normal generation never
  recalculates inclusion from translations. New/changed sources require review;
  do not blindly regenerate the manifest after an upstream update. Explicitly run
  `pnpm data:sync` after a reviewed policy edit against the same source commit.
- Generator annotations connect reviewed character icon provenance to explicit
  profile skill-link relations. Presentation segments these references without
  inspecting visible words or deriving identity from style.
- Endgame recommendation eligibility comes from the group config's name reference,
  independently of resolution. Occurrence membership is enumerated before names;
  missing required search names fail instead of deleting occurrences. Existing
  name-hash bucket identity remains a separate Phase 2 migration.

`pnpm product:baseline:check` performs fresh data generation and asset resolution,
then compares stable-ID product semantics for Character, Light Cone, Relic, Enemy,
Endgame, Homepage and Search. It writes a full ignored field-level diff and never
updates fixtures. The only fixture-writing command is
`pnpm product:baseline:update -- --reason "<maintainer-approved reason>"`.
`pnpm test` runs the same semantic comparison against the existing generated cache,
plus the remaining locale-neutral identity and missing-description contracts.
