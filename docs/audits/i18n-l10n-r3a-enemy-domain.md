# R3A Enemy Semantic Domain + Locale Projection

## 1. Executive Summary

Enemy generation now follows a locale-neutral in-memory domain and a zh-CN projector. The reviewed Enemy skill policy remains authoritative, product output remains unchanged, and the duplicate root Enemy catalog/detail tree is no longer emitted.

## 2. Starting State

- HSR-Database: `develop`, HEAD `d8a0a94ae12c0899adb435ebaa214d59d9aefa8f`.
- TurnBasedGameData: `8cdb905dc2f8e6fffa9be4eb07af3e34435d6091`.
- StarRailRes: `d226befe3db13f2ec15f4161d5f34b1b607643fe`.
- Initial and final product baseline: 0 semantic differences.

## 3. Enemy Architecture Before R3A

`scripts/data/sync.ts` joined MonsterTemplateConfig, MonsterConfig, MonsterSkillConfig, HardLevelGroup, EliteGroup, and TextMap in one localized producer. The same block decided structure, resolved presentation text, formatted GameText, built fallbacks, and emitted both root compatibility files and `views/zh-CN` files.

## 4. Enemy Architecture After R3A

```text
raw Enemy tables
  → buildEnemyDomain()
  → in-memory EnemyDomain
  → projectEnemies()
  → views/zh-CN/catalogs + details
  → loaders / Search / Endgame joins
```

## 5. EnemyDomain

### Template identity

Template IDs, rank, base stats, and template name TextRefs are owned by `EnemyTemplateDomain`.

### Concrete monster identity

Each `MonsterConfig` remains a concrete `EnemyMonsterDomain` related to its template by stable IDs. Default monster selection remains the canonical `MonsterID == MonsterTemplateID` record.

### Stats / weaknesses / resistances

Numeric modifiers, level progression, element codes, resistance values, special-resistance codes, and audit state are neutral. Localized element names are projected.

### Skills

Skill IDs, phase lists, kind/tag semantic codes, damage element codes, TextRefs, extra-effect IDs, and reviewed inclusion state are neutral. Config existence remains separate from display inclusion.

### Summons

Summons retain stable monster/template IDs and neutral rank/weakness codes. Names and links are projected from the target Enemy domain.

### TextRefs / assets

Enemy names, introductions, skill text, kind/tag labels, and element labels are retained as TextRefs or semantic codes. Asset identity remains ID-based.

## 6. Enemy Skill Policy

### Kind/tag semantics

`enemySkillKinds` and `enemySkillTagCodes` continue to map stable TextHash values; translated labels are not semantic authority.

### Inclusion

`data/policies/enemy-skill-inclusion.json` is unchanged. The domain records all configured skills and the projector applies the reviewed display decision.

### Unknown-source behavior

Unknown kind/tag hashes still throw explicit reviewable errors.

## 7. Localization Projection

### Names/descriptions

`projectEnemies` owns localized names, introductions, skill names, and descriptions, including the existing `技能 {id}` and `敌人 {id}` fallback behavior.

### GameText

Enemy descriptions and extra effects use the result-based resolver and preserve markup output through the existing GameText formatter.

### Labels

Element, kind/tag, and special-resistance labels are created only in the projector.

### Fallbacks

Fallbacks remain projection-owned and preserve the approved zh-CN output, including empty optional descriptions.

### Diagnostics

Resolver and description diagnostics retain Enemy entity IDs, fields, visibility, requirement, fallback, and route reachability provenance.

## 8. Endgame Compatibility

Endgame structure, occurrence identity, joins, routes, HP, and search identity were not redesigned. Root Endgame datasets remain as the explicit R3B compatibility boundary; Endgame Enemy detail reads use the localized Enemy view.

## 9. Search / Homepage / Consumers

Search inputs continue to use the projected Enemy catalog. Enemy asset tooling, validators, investigations, and tests now read the zh-CN view. Homepage behavior is unchanged.

## 10. Root Compatibility Enemy Output

Root `catalogs/enemies.json` and `details/enemies/*` are no longer emitted. The authoritative Enemy product tree is `src/lib/generated/views/zh-CN`.

## 11. Legacy / Migration Residue Removed

The Enemy producer no longer owns localized construction inline in `sync.ts`. The shared resolver adapters remain only where other migration islands still require them.

## 12. Tests Added/Changed/Removed

`tests/unit/enemy-domain.test.ts` verifies neutral TextRefs, policy-separated skill visibility, stable summon IDs, and fail-closed semantic hashes. Existing Enemy, Endgame, Search, asset, and product-baseline checks continue to exercise the migrated output and root-output contract.

## 13. Product Baseline Results

`pnpm product:baseline:check` passes with 0 semantic differences.

## 14. Full Validation Results

- `pnpm check:scripts` passes.
- `pnpm data:sync` passes.
- `pnpm data:validate` passes.
- `pnpm product:baseline:check` passes.
- `pnpm lint` passes.
- `pnpm check` passes; `svelte-check` reports 0 errors and 0 warnings.
- `pnpm test` passes: 37 files, 406 tests.
- `pnpm test:e2e` passes: 229 passed, 3 skipped.
- `pnpm build` passes with the production adapter-static build.

The first sandbox attempts for Vitest/build/E2E hit the known Vite/esbuild directory-access restriction; rerunning with normal repository execution access completed successfully.

## 15. Artifact / Code / Performance Impact

EnemyDomain is in-memory only. Root Enemy duplicate artifacts are removed; Endgame compatibility artifacts remain. Generated Enemy product count and content are unchanged.

## 16. Remaining Compatibility Debt

Endgame still owns root compatibility datasets and will be addressed in R3B. Shared raw source staging remains until the overall migration completes.

## 17. R3B Readiness

Enemy is now a stable locale-projection consumer for Endgame. R3B can migrate Endgame independently without changing Enemy semantic identity.

## 18. Recommendation for R3B

Migrate Endgame structure and Search identity while keeping the current Enemy view and stable template/monster IDs as the join boundary.
