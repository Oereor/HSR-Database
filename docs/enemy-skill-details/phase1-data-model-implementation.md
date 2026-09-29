# Enemy Skill Details — Phase 1 implementation

## Architecture and ownership

Previously, each `EnemyMonsterDomain.skills` entry contained a complete copy of the neutral `EnemySkillDomain` definition. The locale projection read those entries directly. That shape could not safely hold detailed values: the same Skill ID can have different effective `ParamList` values under different Monster IDs.

`EnemyDomain.skillDefinitions` now contains the shared identity, text sources, kind, tag, element, phases and extra-effect IDs, keyed by Skill ID. Each concrete `EnemyMonsterDomain.skills` entry is an `EnemySkillBindingDomain` with `skillId` and optional `detail`. The projection joins the binding to its definition and continues to emit the existing `EnemySkill` page shape. Phase 1 details stay in the build-time neutral domain; no unfinished fields are serialized into the current page JSON.

## Domain model

`EnemySkillDetailDomain` has optional, locale-neutral facts:

- `damage`: attack-scaling decimal ratios by target role (`primary`, `adjacent`, `all`, `each-swept`, `enemy-ally`, `marked`, `other-marked`). A ratio of `"3"` means 300% ATK in a later projection.
- `bounce.count`: a verified hit count; it does not imply a fixed target sequence or an unconditional damage ratio.
- `statuses`: stable `MonsterStatusConfig.StatusID`, its `Buff`/`Debuff`/`Other` kind, target, and optional base chance and verified `{ kind: 'turns', value }` duration.
- `actionShifts`: `{ kind: 'advance' | 'delay', ratio }` with a positive magnitude.
- `effects`: `trigger-dot` and `clear-dot` where both tasks establish the operation.
- `summons`: candidate Monster IDs only, without a count or localized metadata.

The model has no unknown sentinel, toughness number, formula, AI, callback, hash, camera, animation or raw Ability task field.

## Parser pipeline

For each template, the build loads its `JsonConfig` character file and matching/shared Ability files from the already required Monster config directories. `MonsterConfig.SkillList` identifies the Skill IDs; `MonsterSkillConfig.SkillTriggerKey` joins each skill to the character's `SkillAbilityList`/entry Ability. The pipeline then runs:

```text
concrete Monster ID
→ base MonsterSkillConfig.ParamList with that Monster's OverrideSkillParams overlaid by index
→ direct DynamicValues.Floats ReadInfo(SkillParam) or fixed value
→ narrowly recognized Ability tasks
→ semantic detail on that Monster's skill binding
```

Absent override positions retain base values. Duplicate conflicting override entries, unresolved parameters and unsupported postfix expressions do not yield a guessed value. The parser reads only named abilities reachable from the selected trigger. When two phase abilities have the same single damage row it records that row once; repeated tasks within an ability do not become a fabricated total.

## Supported and deliberately omitted semantics

Phase 1 recognizes fixed direct attack ratios with distinct target roles, a three-position sweep as per-target damage, stable status identities, configured base chance, verified `3003051` two-turn statuses, signed action delay/advance inputs, `300305105` DoT trigger/clear, candidate summons and the verified `401401207/208` bounce counts. Damage and summon emission is limited to the report's reviewed Skill IDs; the structural parser does not publish unreviewed Ability branches. Summon IDs use the concrete Monster's `CustomValues` overrides and must also occur in its `SummonIDList` and the Monster table.

Sequential multi-hit totals (`406401204/205`, Kafka's repeated tasks), conditional or unresolved damage, generic runtime expressions, final status application chance, conflicting lifetimes (`100204001`, `200401004`), conditional summon counts, bounce target probabilities and toughness values remain absent. The normal `0.9` per-bounce input for `401401207` is not emitted as an unconditional ratio because a special-action branch can replace it. Common modifiers without a stable status mapping, including Kafka's `MCommon_MindControl`, do not become synthetic status records; the official description remains available.

## Variant and action-shift checks

The real-data fixtures verify `100203001` primary ratio `1.3` on Monster `1002030` versus `1` on `100203026`; `406401201` ratio `4` on `4064012` versus `3.6` on `406401201`; and `100402001` ratio `2` on `100402017`. These checks ensure override application precedes DynamicValue interpretation.

`ModifyActionDelay.AddNormalizedValue` is interpreted in one build-time helper: positive `0.5` becomes `{ kind: 'delay', ratio: '0.5' }` for `102201001`; negative `-1` becomes `{ kind: 'advance', ratio: '1' }` for `200401004`. The domain never exposes the signed source field.

## Build inputs, verification and next phase

`MonsterStatusConfig` is now in `DATA_GENERATION_TABLE_NAMES`, which also feeds sparse deployment source requirements. The existing Monster character and Ability directories were already required. No dependency, lockfile, UI or site-message change is needed.

Focused tests cover the parameter overlay, direct DynamicValue and unsupported-expression behavior, source statuses, target roles, duration omission, base chance `1.2`, action shifts, summon variants, DoT and bounce counts. The normal enemy projection test checks that locale-dependent skill inclusion and phases still work. Data synchronization reproduced the existing `zh-CN` enemy page for `1002030` byte for byte (SHA-256 `A8088E3EFB217C64C304A5A57BFA5E1364190E92A41139DCCE0024F88DBB3234`).

Validation on the pinned local source: 27 relevant unit tests passed; `pnpm check`, targeted Prettier/ESLint, `pnpm data:validate:full`, and `pnpm build` passed. The source's existing missing-text and weakness/resistance audit warnings remained non-blocking. The local shell used Node 22 although the repository specifies Node 24; the checks above still completed.

Phase 2 can read `selectedMonster.skills`, join each binding through `enemy.skillDefinitions`, and project available detail with localized status and summon references. Phase 2 should preserve the official description for branch wording and absent facts.
