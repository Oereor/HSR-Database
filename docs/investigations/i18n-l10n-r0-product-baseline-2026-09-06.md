# R0 zh-CN Product Baseline Ratification

## 1. Executive Summary

R0 is implemented as a product-semantic ratification, not an architecture rewrite. Freshly generated zh-CN output is now protected by field-level fixtures covering Characters, Light Cones, Relics, Enemies, Endgame, Homepage/Search, unresolved localization, and Character icon ownership. The one demonstrated user-visible regression—姬子•启行 assist skill `151022` borrowing the talent progression icon—was corrected. The approved fixture reason is `R0 initial zh-CN product ratification after restoring source-correct Character icon ownership`.

The historical Character digest failures are fully explained: 97/97 Character files were compared, one icon-owner regression was fixed, every remaining difference was classified, and zero unexplained or unapproved Character product differences remain. Resolver diagnostics contain 544 unresolved hashes, all classified, with zero invalid references, zero invalid description parameters, and zero category-D errors.

R0 deliberately does not add English, introduce locale switching or localized routes, migrate Enemy/Endgame to a new architecture, or remove compatibility/generated trees.

## 2. Starting Repository State

| Item                       | Recorded state                                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Website repository         | `HSR-Database`                                                                                                              |
| Branch                     | `develop`                                                                                                                   |
| Website HEAD               | `3e713d1a096134374c80271f9c36b3258a1c9fa0`                                                                                  |
| Worktree                   | Already dirty with the in-progress i18n/locale-neutral implementation; preserved rather than reset or reformatted wholesale |
| Structured-data repository | `TurnBasedGameData` at `8cdb905dc2f8e6fffa9be4eb07af3e34435d6091`, clean                                                    |
| Asset repository           | `StarRailRes` at `d226befe3db13f2ec15f4161d5f34b1b607643fe`, clean                                                          |
| Generated source version   | `OSPRODWin4.5.0_D16354198_A16307208_L16320302`                                                                              |
| Locale/TextMap             | `zh-CN` / `CHS`                                                                                                             |
| `upstream.lock.json`       | Unchanged; SHA-256 `B504E90D8B2B7F604F6BA742A29FEB1E6207140384CD206D617584E1B77AD5A8`                                       |

Player-alias data and reviewed policy data were treated as pre-existing work and were not changed for R0. No operation modified, staged, formatted, moved, deleted, or switched either sibling repository.

## 3. Reproduced Test State

The failure state was reproduced only after explicit `pnpm data:sync` followed by `pnpm assets:ensure`. The earlier `data:ensure` path could accept a stale generated cache and therefore was not used as baseline authority.

The reproduced failures were a mix of stale implementation contracts and one real presentation defect:

- the manifest schema assertion expected `39` while fresh output was `40`;
- the Character icon assertions exposed stale Evernight cache output and the real Himeko assist ownership defect;
- the missing-text assertion expected the obsolete aggregate `1614`;
- all 97 frozen Character CHS digests changed although the historical neutral projections remained equal;
- a synthetic test required TypeScript compilation to fail;
- a global Character icon count of `1547` was being used as a proxy for ownership correctness.

Before the final all-command gate, `pnpm check:scripts`, a focused five-file Vitest run (73 tests), and `pnpm product:baseline:check` passed.

## 4. Six Failure Triage

|   # | Failure                                  | Disposition                      | Replacement evidence                                                                                                                                               |
| --: | ---------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
|   1 | Manifest schema `39` vs `40`             | Stale implementation assertion   | Exact schema-number assertion removed; source pin, locale/TextMap, routes, counts, and manifest linkage remain validated                                           |
|   2 | Character icon discrepancy               | Real regression plus stale cache | Fresh regeneration restores Evernight; owner-aware projection fixes Himeko `151022`; source key, resolved path, digest, unit, validation, and E2E assertions added |
|   3 | Missing-text `1614` vs current inventory | Brittle inventory assertion      | Replaced with complete classified unresolved-reference fixtures and zero invalid/program-error assertions                                                          |
|   4 | 97 changed Character CHS digests         | Migration-era digest contract    | Replaced by per-field product semantics, the appendix below, and the 97-entity semantic baseline                                                                   |
|   5 | TypeScript-must-fail test                | Obsolete negative contract       | Removed; the production script graph must compile through `pnpm check:scripts`                                                                                     |
|   6 | Exact icon total `1547`                  | Brittle count and symptom        | Exact requirement/resolution set equality, complete owner/source/resolution mapping, zero missing keys, duplicate registry, and focused owner assertions           |

## 5. Character Icon Investigation

The projector now chooses a progression-node icon only when all visible skills attached to that progression belong to the card category, or when the progression icon path equals a visible variant's configured skill icon path. Otherwise the first configured variant skill icon owns the card.

This preserves the intended progression owners:

- Evernight memosprite: `skill-tree--1413301`;
- Cyrene memosprite: `skill-tree--1415301`;
- Himeko talent: `skill-tree--1510004`;
- Memory Trailblazers: `skill-tree--8007301` and `skill-tree--8008301`.

It restores the distinct Himeko assist owner:

| Card                   | Owner key             | Configured/source identity                                                                             | Resolved product asset                                              | Source digest                                                      | Resolved digest                                                    |
| ---------------------- | --------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Himeko talent `151004` | `skill-tree--1510004` | `SpriteOutput/SkillIcons/Avatar/1510/SkillIcon_1510_Passive.png` / `icon/skill/1510_talent.png`        | `/generated-assets/character-details/icons/skill/1510_talent.png`   | `1a2cd8a10fb8051f5db561a82f29e4f06f63e7c3cb93822547081ab2eeeb7f39` | `5e16d968dc2e1a3ba8e02648152a8308ff4840834dff10162da95a3a860c8e26` |
| Himeko assist `151022` | `skill--151022`       | `SpriteOutput/SkillIcons/Avatar/1510/SkillIcon_1510_AssisSkill01.png` / `icon/skill/1510_assist01.png` | `/generated-assets/character-details/icons/skill/1510_assist01.png` | `8336414bc5a6d6f286b665e2238e523c6d40a287aa1240c6248e13d1fb2346b8` | `8689ac3c4a3f4766bd149b0b3f62d178067a3aec6d812a23695b422721ed7c43` |

Complete icon-set disposition:

| Measure                                      |                                                                                                    Result |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------: |
| Required keys                                |                                                                                                     1,547 |
| Captured owner/source/resolution entries     |                                                                                                     1,547 |
| Added requirement keys from the Himeko fix   |                                                                                                         0 |
| Removed requirement keys from the Himeko fix |                                                                                                         0 |
| Ownership changes from the Himeko fix        | `skill-tree--1510004` loses the assist card but retains the talent; `skill--151022` gains the assist card |
| Missing keys                                 |                                                                                                         0 |
| Duplicate resolved-path groups               |                                        217, explicitly stored rather than treated as missing or collapsed |

The complete 1,547-entry mapping and all 217 duplicate groups are stored in `tests/fixtures/product-baseline/zh-CN/character-icons.json`. The historical architecture comparison also finds 107 technique-card owners moving from a skill key to a progression key (214 key-side additions/removals). These are approved, visible source-identity changes and are frozen per owner; the Himeko assist is the separate regression fixed in R0.

## 6. 97-Character Semantic Parity

The preserved pre-cutover files in `data/audit/i18n-phase1/before/src/lib/generated/details/characters/` were compared with current files in `src/lib/generated/views/zh-CN/details/characters/`. All 97 IDs were present on both sides. Raw exact file matches were 0 because every current file has the new `baseName` representation and an optional `fullName` fallback; semantic acceptance is therefore field-based rather than digest-based.

The planning comparator's 580 logical differences have this complete disposition:

| Disposition                | Count | Meaning                                                                                                             |
| -------------------------- | ----: | ------------------------------------------------------------------------------------------------------------------- |
| Fixed                      |     1 | Himeko assist icon owner                                                                                            |
| Stale/non-rendered         |    97 | Missing upstream `fullName` now falls back to `name`, but the subtitle remains hidden because the strings are equal |
| Internal-only              |    54 | 38 variant order weights and 16 nested SpecialEffect skill order weights; array presentation order is unchanged     |
| Approved product semantics |   428 | Technique progression/icon identities and associated `baseName`/SpecialEffect semantic-reference representation     |
| Unexplained/unapproved     |     0 | R0 exit condition satisfied                                                                                         |

A direct post-fix JSON walker reports 689 raw leaf slots. This is consistent with the logical investigation: it separately counts 107 `progressionId` links, sees three additional semantic-reference annotations in the final producer, and no longer sees the one fixed Himeko icon mismatch (`580 + 107 + 3 - 1 = 689`). The table uses that direct raw walk. Codes are `F` fullName fallback, `B` baseName representation, `T` grouped technique progression, `I` icon identity, `O` internal order, and `S` semantic-reference annotation.

| ID   | Character                       | Raw leaves | Machine-derived classes  | Disposition                                                                   |
| ---- | ------------------------------- | ---------: | ------------------------ | ----------------------------------------------------------------------------- |
| 1001 | 三月七·存护                     |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1002 | 丹恒                            |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1003 | 姬子                            |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1004 | 瓦尔特                          |          8 | F1, B1, T2, I2           | approved; zero unexplained                                                    |
| 1005 | 卡芙卡                          |          8 | F1, B1, T2, I2           | approved; zero unexplained                                                    |
| 1006 | 银狼                            |          8 | F1, B1, T2, I2           | approved; zero unexplained                                                    |
| 1008 | 阿兰                            |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1009 | 艾丝妲                          |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1013 | 黑塔                            |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1014 | Saber                           |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1015 | Archer                          |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1101 | 布洛妮娅                        |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1102 | 希儿                            |          8 | F1, B1, T2, I2           | approved; zero unexplained                                                    |
| 1103 | 希露瓦                          |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1104 | 杰帕德                          |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1105 | 娜塔莎                          |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1106 | 佩拉                            |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1107 | 克拉拉                          |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1108 | 桑博                            |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1109 | 虎克                            |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1110 | 玲可                            |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1111 | 卢卡                            |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1112 | 托帕&账账                       |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1201 | 青雀                            |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1202 | 停云                            |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1203 | 罗刹                            |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1204 | 景元                            |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1205 | 刃                              |          8 | F1, B1, T2, I2           | approved; zero unexplained                                                    |
| 1206 | 素裳                            |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1207 | 驭空                            |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1208 | 符玄                            |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1209 | 彦卿                            |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1210 | 桂乃芬                          |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1211 | 白露                            |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1212 | 镜流                            |          8 | F1, B1, T2, I2           | approved; zero unexplained                                                    |
| 1213 | 丹恒•饮月                       |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1214 | 雪衣                            |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1215 | 寒鸦                            |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1217 | 藿藿                            |          8 | F1, B1, T2, I2           | approved; zero unexplained                                                    |
| 1218 | 椒丘                            |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1220 | 飞霄                            |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1221 | 云璃                            |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1222 | 灵砂                            |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1223 | 貊泽                            |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1224 | 三月七·巡猎                     |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1225 | 忘归人                          |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1301 | 加拉赫                          |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1302 | 银枝                            |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1303 | 阮•梅                           |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1304 | 砂金                            |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1305 | 真理医生                        |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1306 | 花火                            |          8 | F1, B1, T2, I2           | approved; zero unexplained                                                    |
| 1307 | 黑天鹅                          |          8 | F1, B1, T2, I2           | approved; zero unexplained                                                    |
| 1308 | 黄泉                            |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1309 | 知更鸟                          |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1310 | 流萤                            |          8 | F1, B1, T2, I2           | approved; zero unexplained                                                    |
| 1312 | 米沙                            |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1313 | 星期日                          |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1314 | 翡翠                            |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1315 | 波提欧                          |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1317 | 乱破                            |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1321 | 大丽花                          |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1401 | 大黑塔                          |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1402 | 阿格莱雅                        |          9 | F1, B1, T1, I1, O4       | approved; zero unexplained                                                    |
| 1403 | 缇宝                            |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1404 | 万敌                            |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1405 | 那刻夏                          |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1406 | 赛飞儿                          |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1407 | 遐蝶                            |         11 | F1, B1, T1, I1, O6       | approved; zero unexplained                                                    |
| 1408 | 白厄                            |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1409 | 风堇                            |          9 | F1, B1, T1, I1, O4       | approved; zero unexplained                                                    |
| 1410 | 海瑟音                          |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1412 | 刻律德菈                        |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1413 | 长夜月                          |         10 | F1, B1, T1, I1, O5       | approved; zero unexplained                                                    |
| 1414 | 丹恒•腾荒                       |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1415 | 昔涟                            |         53 | F1, B1, T1, I1, O18, S30 | approved; zero unexplained                                                    |
| 1501 | 火花                            |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1502 | 爻光                            |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1504 | 不死途                          |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1505 | 绯英                            |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1506 | `银狼LV.<unbreak>999</unbreak>` |          6 | F1, B1, T1, I1, O1       | approved; zero unexplained                                                    |
| 1507 | 千冶•刃                         |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1508 | 远坂凛                          |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1509 | 吉尔伽美什                      |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 1510 | 姬子•启行                       |         97 | F1, B1, T1, I1, O2, S90  | approved representation; assist regression fixed separately; zero unexplained |
| 1512 | 知更鸟•晴歌                     |          9 | F1, B1, T1, I1, O4       | approved; zero unexplained                                                    |
| 1513 | 砂金•戏浪                       |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 8001 | 开拓者·毁灭                     |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 8002 | 开拓者·毁灭                     |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 8003 | 开拓者·存护                     |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 8004 | 开拓者·存护                     |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 8005 | 开拓者·同谐                     |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 8006 | 开拓者·同谐                     |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 8007 | 开拓者·记忆                     |         10 | F1, B1, T1, I1, O5       | approved; zero unexplained                                                    |
| 8008 | 开拓者·记忆                     |         10 | F1, B1, T1, I1, O5       | approved; zero unexplained                                                    |
| 8009 | 开拓者·欢愉                     |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |
| 8010 | 开拓者·欢愉                     |          5 | F1, B1, T1, I1           | approved; zero unexplained                                                    |

## 7. Unresolved Localization Reference Assessment

Resolver calls now carry domain, stable entity ID, and field provenance. Every deduplicated diagnostic entry is retained in ignored audit output; summaries remain bounded for console readability. Each unresolved reference records required/optional status, emitted/hidden status, fallback use, and product-route reachability.

| Count | Source/field                | Requirement | Visibility | Fallback | Product route |
| ----: | --------------------------- | ----------- | ---------- | -------- | ------------- |
|   419 | excluded Enemy `SkillDesc`  | optional    | hidden     | no       | unreachable   |
|    97 | Character `fullName`        | optional    | hidden     | name     | reachable     |
|    12 | MoC encounter `Name`        | optional    | emitted    | yes      | reachable     |
|     7 | MazeBuff `BuffName`         | optional    | hidden     | no       | reachable     |
|     7 | MazeBuff `BuffDesc`         | optional    | hidden     | no       | reachable     |
|     1 | Enemy `MonsterIntroduction` | optional    | emitted    | yes      | reachable     |
|     1 | visible Enemy `SkillName`   | required    | emitted    | yes      | reachable     |

Total unresolved hashes are 544. Unclassified entries are 0. Invalid references, invalid description parameters, and category-D errors are all 0. Visible fallback behavior is included in the product fixture rather than silently ignored.

## 8. Product Baseline Design

The isolated tooling under `scripts/product-baseline/` provides `captureProductBaseline()` and `compareProductBaseline()` plus two commands:

- `pnpm product:baseline:check` explicitly runs fresh data synchronization, ensures assets, compares the checked-in fixtures, prints a bounded summary, writes the complete ignored field diff to `data/audit/product-baseline/diff.json`, and never updates fixtures;
- `pnpm product:baseline:update -- --reason "..."` is the only fixture-writing path and rejects an empty reason.

Comparator failures have the shape `{ domain, entityId, path, expected, actual }`. Object keys are canonicalized while presentation arrays retain order. Large Enemy and Endgame records use stable content registries, but the fixture stores the expanded expected records instead of opaque digests. Internal numeric `order` fields are removed from Character product semantics while actual array order is preserved.

Metadata contains locale, source commit/version, asset commit, fixture-format version, and approval reason. Timestamps, application/schema versions, migration labels, generated paths, and projector/builder version labels are excluded.

## 9. Baseline Coverage

Fixtures are stored under `tests/fixtures/product-baseline/zh-CN/` and cover:

| Area                    | Coverage                                                                                                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Characters              | 97 stable-ID entity files plus catalog order; localized strings/tokens, profiles, cards, variants, progression controls, traces, eidolons, ExtraEffects, SpecialEffects, recommendations, routes, and presentation flags |
| Light Cones             | 169 entities plus catalog order and every passive rank                                                                                                                                                                   |
| Relics                  | 60 sets plus catalog order, 21 property definitions, pieces, and effects                                                                                                                                                 |
| Enemies                 | 628 selectable templates with normalized template, monster, skill, summon, and exact stat-series registries                                                                                                              |
| Endgame                 | MoC 56 groups, PF 26, AS 20, AA 9; ordered stages/slots/waves/occurrences, mechanics, joined Enemy presentation, routes, and deterministic schedule-boundary recommendations                                             |
| Homepage                | Resolved recent-warp cards, links, image availability, localized messages, navigation, and empty-state semantics                                                                                                         |
| Search                  | 1,127 documents, complete aliases/targets, 2,122 systematic exact/prefix/contains/no-result queries, deterministic result order, 173 Endgame search entries, locators, and shard membership                              |
| Unresolved localization | All 544 classified cases and zero-program-error assertions                                                                                                                                                               |
| Character icons         | All 1,547 required keys with ownership, configured paths, source paths/digests, resolved paths/digests, missing keys, and duplicate mappings                                                                             |

Text semantics include the complete `DescriptionToken[]` representation: formatting, line breaks, icons, unbreak, scaling parameters, substitutions, and SpecialEffect semantic references. Fixed-time and schedule-boundary cases prevent wall-clock-dependent baselines.

## 10. Tests Removed/Replaced/Added

Removed or retired:

- `scripts/data/i18n-contract.ts` and `tests/fixtures/i18n-chs-contract.json`;
- the exact manifest schema `39` assertion;
- the exact missing-text total `1614` assertion;
- exact global icon-total assertions as the primary contract;
- the synthetic “compiler must fail” test;
- the synthetic Paraglide negative compilation test.

Replaced or retained:

- locale-neutral artifact projection moved to `tests/support/neutral-artifact-projection.ts` for test-only architecture assertions;
- production scripts must compile positively through `pnpm check:scripts`;
- icon tests require exact requirement/resolution set equality, zero missing assets, and owner-specific mappings;
- existing identity, Enemy-policy independence, SpecialEffect token, and Endgame structural tests remain.

Added:

- `tests/unit/product-baseline.test.ts` for fast comparison against the existing generated cache;
- Himeko talent/assist source and resolution assertions;
- Himeko talent/assist browser image-source assertions;
- `docs/site-ui-messages.md` updates and fixture exclusion in `.prettierignore`.

R0-specific implementation files are concentrated in `scripts/product-baseline/`, the Character projection/icon rule, resolver provenance and diagnostics, related Character/Relic/Enemy/Endgame projection call sites, package scripts, focused tests, fixtures, and this report. The much larger dirty worktree predates R0 and remains intentionally uncollapsed.

## 11. Historical Digest Contract Disposition

The frozen CHS digest contract was useful forensic evidence but protected serialized migration output rather than product semantics. Its comparison showed all 97 Character CHS digests changing while neutral projections remained equal. It has no remaining production or test consumer.

Its replacement is stronger in the areas that matter:

- field-level expected/actual diagnostics identify the affected entity and path;
- rendered ordering and visibility are protected directly;
- icon ownership is protected together with source and resolved asset identity;
- normalized registries retain inspectable Enemy/Endgame content;
- fixture updates require an explicit maintainer-approved reason;
- the authoritative check always generates fresh data and assets.

The ignored historical captures under `data/audit/i18n-phase1/` remain forensic evidence only and are not baseline authority.

## 12. Final Validation Results

The required final sequence is recorded here after the all-command run:

| Order | Command                       | Result                                                                                                                                                                                         |
| ----: | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|     1 | `pnpm data:sync`              | Pass; 97 Characters, 169 Light Cones, 60 Relics, 21 Relic properties, and 628 Enemies generated                                                                                                |
|     2 | `pnpm assets:ensure`          | Pass; asset commit `d226befe3db1` already current                                                                                                                                              |
|     3 | `pnpm messages:check`         | Pass; 100 zh-CN site messages validated and compiled                                                                                                                                           |
|     4 | `pnpm data:validate`          | Pass; 1,127 zh-CN search records, with 544 classified missing hashes reported as warnings                                                                                                      |
|     5 | `pnpm product:baseline:check` | Pass after its own fresh sync/assets run; 97 Characters, seven product areas, and 0 semantic differences                                                                                       |
|     6 | `pnpm check`                  | Pass; Svelte check reports 0 errors/0 warnings and production scripts compile                                                                                                                  |
|     7 | `pnpm lint`                   | Pass after formatting two new baseline files and removing one unused type import                                                                                                               |
|     8 | `pnpm test`                   | Pass with local Vite-config permission; 35 files and 397 tests passed                                                                                                                          |
|     9 | `pnpm build`                  | Pass with local Vite-config permission; static adapter wrote `build/`                                                                                                                          |
|    10 | `pnpm test:e2e`               | Initial 16-worker run saturated browser/server sessions (225 passed, 3 skipped, 2 failed, 2 flaky); unchanged full rerun with `--workers=4` passed 229 with the same 3 platform-specific skips |

No new skips, todos, expected-failure markers, or weakened assertions were introduced. Existing platform-specific Playwright skips are to remain unchanged.

## 13. Remaining Risks

- The baseline is intentionally zh-CN-only. It ratifies current product behavior but does not prove that the architecture is ready for a second locale.
- Enemy and Endgame still use compatibility projection paths; R0 freezes their semantics without migrating them.
- The fixture set is large (about 79 MB and 1,091 files), so maintainers must use the explicit reason-gated update command and inspect `diff.json` rather than approving bulk churn by file count.
- Upstream unresolved references may change in future source versions. Any newly emitted, required, reachable, or unclassified entry must fail review rather than be absorbed into a total-count update.
- Duplicate icon mappings are expected in some upstream assets but are now explicit. New duplicate groups still require owner/source review.

## 14. R0 Exit Criteria

| Criterion                                                             | Status                                                    |
| --------------------------------------------------------------------- | --------------------------------------------------------- |
| 97/97 Characters compared with field-level evidence                   | Met                                                       |
| Zero unexplained or unapproved Character differences                  | Met                                                       |
| Himeko and protected servant/memosprite owners resolve correctly      | Met                                                       |
| Zero missing Character detail icons                                   | Met                                                       |
| All required product areas have versioned baselines                   | Met                                                       |
| Every unresolved localization reference is classified                 | Met                                                       |
| Invalid references/description parameters/category-D errors are zero  | Met                                                       |
| Historical digest contract retired with no consumer                   | Met                                                       |
| No English, routing, compatibility-tree removal, or R1 migration work | Met                                                       |
| Pins, aliases, policies, and sibling repositories unchanged by R0     | Met                                                       |
| Full validation sequence                                              | Met; the final resource-bounded E2E run has zero failures |

## 15. Recommendation for R1

Proceed to R1 only from this ratified baseline. Treat `product:baseline:check` as the semantic gate for each architecture slice, migrate one domain at a time, and require explicit review for any field-level fixture change. Start with a bounded locale-neutral/view boundary whose route and presentation semantics are already captured; do not combine the first English locale, localized routing, Enemy/Endgame migration, or compatibility-tree deletion into the same change.

R1 should preserve the reason-gated fixture workflow, resolver provenance, source/resolved icon ownership checks, and fixed-time Endgame/Search cases. Any proposed normalization must demonstrate that it does not erase text, token, ordering, grouping, route, fallback, or interaction semantics already protected here.
