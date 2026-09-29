# Enemy Skill Details — Phase 2A projection and page view model

## Architecture

```text
EnemySkillDomain (one shared Skill ID definition)
             +
EnemyMonsterDomain.skills[] (concrete Monster ID binding + optional detail)
             ↓ locale projection
Enemy.monsters[].skills[] (official localized text + effective detail)
             ↓ buildEnemyDetailPageData / getEnemyDetail
EnemyDetailPageData.skillDefinitions[] (shared text and identity)
EnemyDetailPageData.monsters[].skills[] (ordered ID + optional detail)
             ↓ getEnemySkillsForMonster(page, monsterId)
EnemySkillView[] for the future Skill Browser
```

The build-time neutral model still owns Skill ID definitions separately from concrete Monster bindings. The locale projection attaches only the binding's own detail to the projected skill. The page model then stores shared name, official description, kind, tag, element, phases and extra effects once per Skill ID. Each Monster stores its visible skill IDs in its existing source order, with its own optional detail. The current skill cards and phase anchors continue to use the existing shared definitions and phase references.

## Final view types and ownership

`EnemySkillDetailDomain` is the locale-neutral, build-time type. `EnemySkillDetail` is the localized generated-data type; it adds status names and full summon references to the supported semantic facts. The target-role enum is shared semantic typing, not an Ability type. `EnemySkillDetailView` is the page-facing form whose summon references may also carry portrait URLs and localized links. `EnemySkillBindingView` stores `{ id, detail? }` under one Monster. `EnemySkillView` is the resolved shared definition plus that Monster's detail.

`getEnemySkillsForMonster(page, monsterId)` operates only on page data. It preserves the Monster skill order, omits absent detail, and throws for an unknown Monster or a binding with no shared definition. Phase 2B can call it when the selected Monster changes, then select one returned skill by ID. It needs no Ability, override, raw table or parser knowledge.

## Variant handling

The same Skill ID `100203001` resolves to primary attack ratio `1.3` for Monster `1002030` and `1` for Monster `100203026`. Skill `406401201` resolves to `4` for `4064012` and `3.6` for `406401201`. The shared names and official descriptions remain reusable; the ratios come from their concrete bindings. No template detail fallback is applied.

## Status and summon projection

The already-required `MonsterStatusConfig` table supplies a Status ID to `StatusName` text-source index. Each locale's existing TextResolver produces the name; unresolved names use the project's ID-based fallback and localization diagnostics. The view retains the stable status ID, kind, target, decimal base chance and verified turn duration. It does not include status descriptions or modifier names.

Skill summon candidates are resolved by exact Monster ID against the full enemy domain index. They use the existing `EnemySummonReference` fields: candidate Monster ID, template ID, localized name, rank, weaknesses and enemy route. This avoids losing a candidate through the current main summon list's template deduplication. The server adds portrait URLs and localizes the route (`/enemies/.../` or `/en/enemies/.../`) for both existing and skill-detail summon cards. Candidate IDs do not imply a fixed count.

## Payload shape and size

The table records UTF-8 bytes before and after this phase. “Generated” is the locale's generated rich enemy JSON; “page” is `JSON.stringify(buildEnemyDetailPageData(rich))` before server image/link enrichment.

| Locale | Enemy | Generated before → after | Page before → after |
| --- | --- | ---: | ---: |
| zh-CN | `1002030` | 1,006,748 → 1,020,106 | 137,258 → 151,886 |
| en | `1002030` | 1,007,679 → 1,021,193 | 137,943 → 152,721 |
| zh-CN | `8002050` (76 variants) | 2,947,652 → 2,947,652 | 150,701 → 155,953 |
| en | `8002050` | 2,949,333 → 2,949,333 | 152,207 → 157,459 |
| zh-CN | `4064012` | 270,958 → 276,902 | 36,193 → 42,575 |
| en | `4064012` | 274,747 → 280,847 | 37,560 → 44,072 |

The page has no new repeated shared skill text: the increase is the ordered binding IDs and available Monster-specific detail. `8002050` has no new detail, so its generated rich JSON is unchanged; the page grows only from its 228 lightweight bindings. Status and summon references affect only skills with those facts. No payload-level compression or schema indirection was needed.

## Supported and omitted data

Page data now carries target-role damage ratios, attack scaling, verified bounce count, localized status identity, base chance, verified turn duration, normalized action shifts, DoT trigger/clear semantics, and localized summon references. Decimal ratios remain strings and all targets/effect kinds remain semantic values; the UI will format them later.

Ability paths and tasks, DynamicHash/ReadInfo, modifier callbacks, internal expressions, predicates, camera/VFX data and AI remain build-time only. Unsupported damage, per-bounce multiplier, ambiguous durations, final status chance and fixed summon counts remain absent. Official SkillDesc prose is unchanged.

## Tests and validation

All commands ran with Node 24.19.0. Four focused Vitest files passed (31 tests): `enemy-skill-projection`, `enemy-detail`, `enemy-domain`, and `enemy-skill-details`. The new tests cover both locales' variant damage, status names and semantics, missing duration, action shifts, DoT, bounce, summon links, order, missing details and broken references. Existing tests also cover description inclusion, phases and anchors.

Targeted ESLint and Prettier checks passed. `pnpm check` passed with zero Svelte warnings and both script/API TypeScript checks green. `scripts/data/sync.ts`, `scripts/data/validate-full.ts`, and the Vite production build passed. The validator reported the repository's existing missing-TextMap and weakness/resistance audit warnings without failing. Sampled generated detail JSON for five enemies in both locales contained none of the parser-only fields listed above.

The pre-rendered `4013010` pages in both locales retained six unique skill anchors, six initial-phase references that resolve to those anchors, locale-correct summon links, and no new detail panel.

## Phase 2B handoff

For a selected Monster ID, call `getEnemySkillsForMonster(detail, selectedMonsterId)`. Render the selected returned skill's shared `name`, `description`, `kind`, `tag`, `damageType`, `phases` and `extraEffects`, then conditionally render its `detail` fields. Pass `detail.summons[]` directly to the existing card/link component, using each reference's ready `href` and optional `portraitUrl`. Phase 2B owns formatting and interaction state; this phase adds neither.
