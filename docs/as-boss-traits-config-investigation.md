# Apocalyptic Shadow Boss Traits Configuration Investigation

## Summary

Apocalyptic Shadow's localized boss guidance is an encounter-slot relation. The
authoritative configuration chain is:

```text
ChallengeBossMazeConfig.ID = ChallengeBossMazeExtra.ID
  -> MonsterID{slot}
  -> MonsterGuideConfig.MonsterID
  -> TagList[i] / DifficultyList[i]
  -> MonsterGuideTag.TagID
  -> TagName / TagBriefDescription / ParameterList
```

The localized game rules call these entries **“首领特性”**. They are not
MazeBuffs, BattleEvents, Stage fields, or intrinsic properties of the concrete
Monster occurrence. The relation belongs to a boss slot within an encounter,
and the UI should preserve that ownership.

The current data contains 80 Apocalyptic Shadow encounters and 163 boss slots.
Every slot has a matching `ChallengeBossMazeExtra` binding and a unique
`MonsterGuideConfig` row. After applying the configured difficulty threshold,
452 trait relations are applicable. Of those, 446 are display-ready; six
relations referencing malformed Tag `100603` must be omitted safely.

## Configuration Tables

Only the following three additional tables are required for this phase:

- `ChallengeBossMazeExtra.json`
- `MonsterGuideConfig.json`
- `MonsterGuideTag.json`

`ChallengeBossMazeExtra.ID` joins directly to `ChallengeBossMazeConfig.ID`.
Each populated `MonsterID1`, `MonsterID2`, or `MonsterID3` identifies the guide
bound to the corresponding battle slot. That ID joins to the unique
`MonsterGuideConfig.MonsterID` row.

Within a guide, `TagList` and `DifficultyList` are positional arrays. For index
`i`, `TagList[i]` is eligible when `DifficultyList[i] <=
MonsterGuideConfig.Difficulty`. The surviving tag ID joins to
`MonsterGuideTag.TagID`; its name, brief description, and parameters provide the
display text.

The source array order is the display order. Duplicate tag IDs, should they
appear, must retain only their first occurrence and produce a warning.

## Terminology and Ownership

Apocalyptic Shadow's localized rules contain the heading “首领特性”, so that is
the player-facing section title. The third-party classification “关卡效果” is
not used.

The guide is explicitly owned by an encounter slot:

- it is not an environmental MazeBuff;
- it is not a BattleEvent or Stage rule;
- it is not copied onto a Monster record;
- it remains attached to the slot even when the guide identity differs from the
  concrete Stage Monster identity.

This distinction matters for eight real slots. In those cases the UI may still
show the slot-bound traits, but it must not imply that they are intrinsic to the
displayed Monster or expose the guide Monster identity as the displayed boss.

## Difficulty Filtering

All current guides contain four tag entries. After filtering by
`requiredDifficulty <= MonsterGuideConfig.Difficulty`, the expected number of
applicable entries is:

| Guide difficulty | Applicable traits |
| ---------------- | ----------------: |
| 1                |                 2 |
| 2                |                 2 |
| 3                |                 3 |
| 4                |                 4 |

The 163 slot relations are distributed as 40 difficulty-1, 40 difficulty-2, 40
difficulty-3, and 43 difficulty-4 guides. After malformed entries are omitted,
83 slots have two display-ready traits, 40 have three, and 40 have four. No
current slot becomes empty.

## Concrete Sample: Group 3020 / Encounter 30204 / Slot 1

`ChallengeBossMazeExtra` binds slot 1 to guide Monster `302401304`. The guide
contains the following ordered tags:

1. `100201` — 坚防守备
2. `100202` — 攻守易型
3. `100203` — 绝境逆转
4. `100204` — 众星拱卫

The first formatted description includes 60% damage reduction and 125%
increased damage taken after weakness break. These values come from
`MonsterGuideTag.ParameterList` and are interpolated with the existing game-text
formatter; the UI must not perform a second interpolation pass.

Encounter `30204` has three slot bindings:

- slot 1: `302401304`, Tags `100201`–`100204`;
- slot 2: `401401304`, Tags `101401`–`101404`;
- slot 3: `300402104`, Tags `100801`–`100804`.

The three guides must stay attached to their respective slots and must not be
flattened into one encounter-wide list.

## Coverage and Audit Baseline

The real-data audit baseline is:

| Metric                                        | Expected |
| --------------------------------------------- | -------: |
| AS encounters                                 |       80 |
| Boss slot relations                           |      163 |
| Applicable trait relations                    |      452 |
| Display-ready traits                          |      446 |
| Omitted trait relations                       |        6 |
| Distinct malformed tags                       |        1 |
| Distinct tags with unused trailing parameters |       21 |
| Guide/Stage Monster identity mismatches       |        8 |

All 163 current slots have a MazeExtra row, a populated slot binding, a unique
guide, matching guide difficulty, and at least one display-ready trait.

Twenty-one distinct tag rows contain parameters beyond the highest placeholder
used by their descriptions. These entries remain valid and should produce
warnings without being omitted.

## Malformed Tag 100603

Tag `100603` (“枯木逢春”) references placeholder `#2` while its
`ParameterList` contains only one parameter. It is applicable in six
difficulty-3/4 slot relations across three encounter families. Because the
description cannot be formatted faithfully, those six trait relations must be
omitted. The remaining traits for each affected slot continue to render; no
empty title, ID-only card, or partially formatted description should be
serialized.

## Guide/Stage Identity Mismatches

Eight slot relations differ between the MazeExtra guide Monster and the actual
Stage occurrence. They occur in Groups `3011` and `3016`, always in slot 2 and
across all four difficulties. For example, Encounter `30114` binds guide Monster
`203302204` (“蛊言妄念的蚀心兽”), while the concrete occurrence is Monster
`203501204` (“业火焚心的影将军”).

The explicit MazeExtra slot binding remains authoritative for selecting traits.
The boss profile, however, must be built from the concrete Stage occurrences.
When no occurrence matches the guide Monster ID, the first occurrence in Stage
and Wave source order becomes the primary profile. The mismatch is recorded as
an audit warning, and neither the guide Monster ID nor guide Monster name is
shown as the concrete boss identity.

## Multi-occurrence Boss Slots

Twenty slots contain two concrete occurrences. The recurring pattern is a main
boss plus Gepard. For example, Group `3001`, Encounter `30014`, slot 1 contains
`100401404` (“无望冽风的幻灭者”) and `100402604` (“杰帕德”).

These slots should use one primary boss profile plus a compact companion profile.
The companion remains part of the original Stage/Wave projection and retains its
name, level, HP, speed, toughness, weaknesses, portrait, multiplicity, and
multi-phase semantics. It does not receive a second copy of slot mechanics.

## Validation Policy

The resolver should apply the following rules:

- duplicate or conflicting core primary keys are generation errors; never pick
  one arbitrarily;
- missing MazeExtra, slot Monster ID, guide, tag, localization, array-length
  agreement, or matching guide difficulty produces a warning and omits the
  affected supplementary guide or trait;
- duplicate Tag IDs produce a warning and retain the first source occurrence;
- parameters must pass the decimal parser;
- missing placeholders or malformed markup produce a warning and omit the trait;
- unused trailing parameters produce a warning but retain the trait;
- Guide/Stage Monster mismatches produce a warning while preserving the explicit
  slot-owned guide relation.

## Deferred Configuration

The following related fields and tables are intentionally deferred and must not
be loaded, serialized, or rendered in this phase:

- `PhaseList`
- `DifficultyGuideList`
- `TextGuideList`
- MonsterGuidePhase
- MonsterGuideSkill
- MonsterGuideSkillText
- SkillID
- EffectID

They may support a later boss-mechanics expansion, but they are not needed to
represent the verified “首领特性” relation.
