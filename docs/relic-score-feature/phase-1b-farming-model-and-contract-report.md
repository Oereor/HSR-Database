# Relic Score Phase 1B — Farming Model and Contract Report

## 1. Executive summary

Phase 1B implemented a self-contained, seeded 5★ Natural Relic model and a target-slot, enhance-all-to-+15 experiment. The probability table, generator, validator, prototype CLI, benchmark identity digest, candidate lenses, and dense quantile prototype are present. No formal 97 × 6 benchmark, scorer, UI, or production N was created. The 97 reviewed Profiles and the Phase 1A normalization path remain unchanged.

The measurements favor **Lens B** for a future substat-only farming CDF, with main suitability handled separately; **base-weight utility on both sides of that CDF**, with panel targets handled in a later build-aware layer; and **257 quantile points** for V1. These are recommendations for the next contract decision, not frozen production behavior.

## 2. Files and interfaces

- `data/relic-score/probability-model.json`: versioned independent probability facts, assumptions, and provenance. It contains no affix `BaseValue`, `LevelAdd`, `StepValue`, or `StepNum` copies.
- `src/lib/relic-score/farming/`: probability validation/compilation, Mulberry32 PRNG, id-free `GeneratedNaturalRelic`, `FarmingBudget`, Natural +15 generator, candidate-selection prototype, and dense-quantile prototype.
- `scripts/relic-score/`: explicit farming validation, frequency diagnostic, prototype CLI, and SHA-256 benchmark/model identity helpers. `package.json` exposes `relic-score:farming:validate`, `relic-score:farming:frequency`, and `relic-score:farming:prototype`.
- `tests/unit/relic-score-farming-{model,prototype}.test.ts`: model, generator, PRNG, frequency, architecture, lens, digest, and quantile checks.

The generator accepts a caller-supplied slot, compiled probability model, and seeded RNG. Its output contains slot, rarity 5, level 15, numeric main/substats, substat occurrence counts and cumulative steps, and initial count. It does not contain set/player/provider/display identifiers. The budget is `{ unit: 'target-slot-natural-piece', pieceCount: N, rarity: 5, enhancementLevel: 15, enhanceAll: true }`. N has no hidden default and remains unfrozen until calibration. Each experiment generates exactly N target-slot pieces and enhances all of them; it does not model source runs, sets, slot drops, stamina, synthesis, reforge, blocked stats, rerolls, or early stopping.

## 3. Probability schema and provenance

The JSON schema has `schemaVersion=1`, `modelVersion=natural-5star-v1`, per-slot main probability arrays for BODY/FOOT/NECK/OBJECT, a 12-key substat selection weight array, initial/grade/enhancement policies, and per-rule provenance. HEAD/HAND derive their sole main and probability 1 from the 5★ runtime reference. The validator checks legal/complete main and substat closure, uniqueness, finite positive values, probability totals within `1e-9`, StepNum compatibility, fixed slots, +15 cadence, and provenance class/source. Sampling compiles these tables once; every substat selection is weighted without replacement from the remaining legal keys.

| Rule | Value / policy | Provenance class | Source |
| --- | --- | --- | --- |
| Main probability, BODY/FOOT/NECK/OBJECT | Independent per-key probabilities; e.g. BODY CRIT 10% each, FOOT SPD 12%, NECK single-element damage 9%, OBJECT ERR 5% | Maintainer-approved probability fact | Maintainer-approved wiki transcription represented by the read-only simulator's `MainAffixProbabilityConfig.json` |
| Substat selection | HP/ATK/DEF flat and ratio 10; BE/EHR/RES 8; CRIT 6; SPD 4 | Maintainer-approved probability fact | Maintainer-approved wiki transcription represented by the read-only simulator's `SubAffixConfig.json` |
| Allowed slot/main/sub keys, 5★ values and +15 ceiling | Current 5★ runtime groups; main `BaseValue + 15 × LevelAdd`; sub `count × BaseValue + step × StepValue` | Upstream-derived | TurnBasedGameData `RelicConfig`, `RelicMainAffixConfig`, `RelicSubAffixConfig` through the existing player runtime |
| Initial substats | 3: 80%; 4: 20% | V1 simulation assumption | Natural behavior reference; not established by current affix tables |
| Roll grade | Uniform integer `0..StepNum`, independently per occurrence | V1 simulation assumption | Central policy; StepNum itself is upstream-derived |
| Enhancement | Nodes +3/+6/+9/+12/+15; 3-init reveals fourth at +3; otherwise uniformly strengthen an existing substat | V1 simulation assumption | Natural behavior reference; +15 maximum cross-checked against upstream |

The adjacent simulator was read solely to transfer the two approved numerical probability facts and understand natural behavior. No code, imports, runtime calls, vendored data, or dependency on that repository entered HSR-Database. The inspected upstream affix and relic tables did not establish the initial-count/grade/target-selection distributions; those remain explicitly replaceable assumptions. `UpgradeAvatarSubRelic.json` contains special upgrade records but does not provide an unambiguous general natural-drop rule for these distributions.

## 4. PRNG, generation and validation

The PRNG is pure TypeScript `mulberry32-v1`, with an explicit unsigned 32-bit seed and no cryptographic claim. A fixed short sequence for seed `123456789` is tested. The generator samples natural main first, excludes the same substat key, selects three or four initial keys without replacement, then reveals or enhances at each node. Grade limits use each runtime affix's `StepNum`; the implementation has no fixed `0/1/2` grade list. Three-initial pieces finish with 8 total substat occurrences, four-initial pieces with 9.

The statistical diagnostic command was `pnpm relic-score:farming:frequency` (seed 501, 40,000 BODY pieces). `Delta = observed − expected`; the ratio rows test weighted selection, including a conditional second pick after the first key has been removed.

| Distribution | Expected | Observed | Delta | Sample count |
| --- | ---: | ---: | ---: | ---: |
| BODY HP% main | 0.20000 | 0.20135 | +0.00135 | 40,000 |
| BODY ATK% main | 0.20000 | 0.19875 | −0.00125 | 40,000 |
| BODY DEF% main | 0.20000 | 0.19888 | −0.00112 | 40,000 |
| BODY EHR main | 0.10000 | 0.09835 | −0.00165 | 40,000 |
| BODY Healing main | 0.10000 | 0.10130 | +0.00130 | 40,000 |
| BODY Crit Rate main | 0.10000 | 0.10115 | +0.00115 | 40,000 |
| BODY Crit DMG main | 0.10000 | 0.10023 | +0.00023 | 40,000 |
| Four initial | 0.20000 | 0.19840 | −0.00160 | 40,000 |
| Mean grade per roll, current StepNum=2 | 1.00000 | 0.99957 | −0.00043 | 327,936 rolls |
| First HP flat / first SPD ratio | 2.50000 | 2.52914 | +0.02914 | 40,000 pieces |
| Second ATK flat / SPD ratio, given first HP flat | 2.50000 | 2.12195 | −0.37805 | 4,383 conditioned pieces |

The last ratio is noisier because it has only 4,383 conditioned pieces. The property test uses a broad, seeded tolerance; this is a simulation-consistency check, not a game-mechanic proof or an Enka validation rule. HEAD/HAND fixed-main, no-duplicate and main/sub-exclusion invariants are also covered.

## 5. Benchmark identity and maintenance boundary

The canonical SHA-256 payload covers benchmark schema version; character ID/slot; Profile weights, breakpoints, targets and curves; that slot's recommended mains; probability model; 5★ main and sub affix reference/numeric data; full farming budget including N; experiment count; PRNG algorithm/version and seed; generator version; selection lens; quantile representation version and point count. It omits Profile review metadata, localized content, player identifiers/fixtures, unrelated enemy data, and unrelated recommendation sets. A separate model digest is also deterministic. Candidate lens and point count are identity fields while they remain analytical alternatives.

Profile generation remains explicit maintenance. Farming validation is cheap and separate; farming simulation and quantile measurement are explicit commands only. None of the new commands is wired into `data:ensure`, `prebuild`, or `deploy:build`. Formal benchmark regeneration and staleness validation remain Phase 1C work.

## 6. Candidate-selection analysis

Lens A chooses the first natural piece; B chooses maximum RawSubUtility among all N mains; C chooses maximum among naturally generated pieces whose main is recommended. C retains `noEligibleCandidate` separately, and its utility statistics are **conditional on eligibility**. The prototype utility is `Σ(sub actual / 5★ high-roll × base Profile weight)`. Main probability affects B only through main/sub exclusion. It affects C through both exclusion and the number of eligible candidates. N=1 A and B coincide; for HEAD, B and C coincide at every N.

Command pattern: `node --import tsx scripts/relic-score/farming-prototype.ts --characterId=1002 --slot=BODY --N=10 --experimentCount=4096 --seed=123456789 --lens=all`. The same command was run for N=1/10/100 and cases below; N=100 added `--quantiles=both`. All rows are prototype results, not formal budgets or scores. `1002` has a Crit Rate target and is explicitly **target-free base-weight prototype**; `1310` and `1005` have no Profile targets.

| Character | Slot | N | Lens | No eligible % | Mean | P50 | P90 | P99 |
| --- | --- | ---: | :---: | ---: | ---: | ---: | ---: | ---: |
| 1002 direct DPS | BODY | 1 | A/B | 0.0 | 2.020 | 1.900 | 4.500 | 6.750 |
| 1002 direct DPS | BODY | 1 | C | 80.0 | 1.598 | 1.327 | 3.750 | 5.704 |
| 1002 direct DPS | BODY | 10 | A | 0.0 | 2.039 | 1.900 | 4.500 | 6.625 |
| 1002 direct DPS | BODY | 10 | B | 0.0 | 5.010 | 4.950 | 6.552 | 7.776 |
| 1002 direct DPS | BODY | 10 | C | 10.5 | 2.453 | 2.375 | 4.625 | 6.209 |
| 1002 direct DPS | BODY | 100 | A | 0.0 | 2.066 | 1.900 | 4.500 | 6.750 |
| 1002 direct DPS | BODY | 100 | B | 0.0 | 6.901 | 6.875 | 7.875 | 8.775 |
| 1002 direct DPS | BODY | 100 | C | 0.0 | 4.917 | 4.925 | 6.214 | 7.075 |
| 1002 direct DPS | NECK | 1 | A/B | 0.0 | 2.091 | 1.990 | 4.500 | 6.750 |
| 1002 direct DPS | NECK | 1 | C | 91.2 | 2.065 | 1.800 | 4.750 | 6.500 |
| 1002 direct DPS | NECK | 10 | A | 0.0 | 2.108 | 1.904 | 4.625 | 6.677 |
| 1002 direct DPS | NECK | 10 | B | 0.0 | 5.103 | 5.067 | 6.625 | 7.775 |
| 1002 direct DPS | NECK | 10 | C | 38.9 | 2.496 | 2.250 | 4.950 | 7.000 |
| 1002 direct DPS | NECK | 100 | A | 0.0 | 2.104 | 1.990 | 4.500 | 6.718 |
| 1002 direct DPS | NECK | 100 | B | 0.0 | 6.982 | 6.952 | 7.875 | 8.875 |
| 1002 direct DPS | NECK | 100 | C | 0.0 | 4.932 | 4.950 | 6.564 | 7.875 |
| 1310 break | HEAD | 1 | A/B/C | 0.0 | 1.778 | 1.500 | 3.904 | 5.800 |
| 1310 break | HEAD | 10 | A | 0.0 | 1.823 | 1.539 | 4.022 | 5.801 |
| 1310 break | HEAD | 10 | B/C | 0.0 | 4.421 | 4.394 | 5.850 | 6.985 |
| 1310 break | HEAD | 100 | A | 0.0 | 1.804 | 1.425 | 4.075 | 5.820 |
| 1310 break | HEAD | 100 | B/C | 0.0 | 6.131 | 6.125 | 7.000 | 7.760 |
| 1310 break | OBJECT | 1 | A/B | 0.0 | 1.454 | 1.250 | 3.527 | 5.526 |
| 1310 break | OBJECT | 1 | C | 83.9 | 0.924 | 0.600 | 2.566 | 4.208 |
| 1310 break | OBJECT | 10 | A | 0.0 | 1.501 | 1.250 | 3.600 | 5.625 |
| 1310 break | OBJECT | 10 | B | 0.0 | 4.130 | 4.075 | 5.550 | 6.751 |
| 1310 break | OBJECT | 10 | C | 17.2 | 1.362 | 1.350 | 2.908 | 4.564 |
| 1310 break | OBJECT | 100 | A | 0.0 | 1.538 | 1.275 | 3.654 | 5.625 |
| 1310 break | OBJECT | 100 | B | 0.0 | 5.882 | 5.875 | 6.762 | 7.579 |
| 1310 break | OBJECT | 100 | C | 0.0 | 3.204 | 3.150 | 4.350 | 5.194 |
| 1005 DoT | NECK | 1 | A/B | 0.0 | 1.704 | 1.700 | 4.000 | 5.877 |
| 1005 DoT | NECK | 1 | C | 77.2 | 1.277 | 0.885 | 3.395 | 5.102 |
| 1005 DoT | NECK | 10 | A | 0.0 | 1.754 | 1.700 | 4.050 | 6.146 |
| 1005 DoT | NECK | 10 | B | 0.0 | 4.581 | 4.554 | 6.050 | 7.325 |
| 1005 DoT | NECK | 10 | C | 7.5 | 2.231 | 2.125 | 4.443 | 6.228 |
| 1005 DoT | NECK | 100 | A | 0.0 | 1.757 | 1.700 | 4.075 | 6.200 |
| 1005 DoT | NECK | 100 | B | 0.0 | 6.328 | 6.294 | 7.200 | 8.000 |
| 1005 DoT | NECK | 100 | C | 0.0 | 4.667 | 4.625 | 6.050 | 7.144 |

The recommended main probability is 20% for 1002 BODY, 9% for 1002 NECK, 100% for 1310 HEAD, 16% for 1310 OBJECT, and 22% for 1005 NECK. The observed C no-eligible rates track `(1 − p)^N` without conditioned main rerolls. At N=10, the rare 9% NECK case still fails in 38.9% of experiments. B often selects a nonrecommended main: at N=100, only 5.7% of its BODY winners for 1002 and 0.8% of its OBJECT winners for 1310 have a recommended main. This confirms that B represents substat potential rather than an equip-ready result.

**Recommendation for Phase 1C decision:** use B for the substat CDF and score main suitability in a distinct Main Completion component. It retains an N-dependent farming percentile without implicitly rewarding rare recommended mains through a weaker eligible candidate pool. C is valuable for acquisition analysis, but using its conditional CDF as a substat comparator and then adding a main component risks encoding rarity twice; its no-candidate mass would also need a separate mathematical definition. A does not express the fixed-N farming budget. The recommendation must be reviewed alongside the future full Piece Score formula; the production selection mode remains unset in code.

## 7. Soft targets and slot-level benchmarks

For a target (T), the marginal value of a substat depends on the panel value contributed by the other five slots and non-relic sources. A slot-only relic cannot infer this from its own substat value. The reviewed artifact has target-free break and DoT examples, but every current direct-DPS Profile has the default Crit Rate target; the 1002 rows above deliberately use only base weights.

| Direction | Consequence |
| --- | --- |
| Base-weight slot CDF; targets in actual build scoring | Compact, independent slot distributions. The value entered into the CDF must also be base-weight utility; comparing target-adjusted player utility to a base-weight CDF would mix definitions. Target effects require a separate later build-aware adjustment. |
| Build-aware six-slot simulation | Can apply actual marginal weights, but needs a distribution over the other five pieces, base stats and mains; target crossings couple slots. Artifact size and calibration multiply, and a single context-free `F_i` is no longer well-defined. |
| Versioned reference-panel marginal CDF | Mathematically defines a slot CDF conditional on a fixed reference panel, but the reference build becomes a major product assumption and can misrepresent different player builds. It also expands digest and maintenance work. |

**Recommendation:** keep the Phase 1B/next-step farming CDF on base-weight utility for both simulated and player pieces, then handle soft targets and hard breakpoints in a separate build-aware scoring layer. Phase 1C must specify how that layer combines with the percentile and test target crossings on complete builds. No target-aware RawSubUtility or final scorer was implemented here.

## 8. Dense quantile experiment and performance

For each N=100 Lens C distribution, the 4096 selected utility values were sorted as temporary ground truth; no sorted sample file or benchmark JSON was committed. Quantile knots are at the implicit grid `j/(Q−1)` using linear interpolation of sample ranks. Lookup binary-searches knots, is right-continuous at ties, linearly interpolates between distinct knots, returns 0 below the minimum and 1 at/above the maximum. Complexity is `O(log Q)` lookup and `O(Q)` stored numbers. Errors compare the interpolated CDF to exact sorted-sample CDF at each distinct observed value and each gap midpoint; the reported rank error is `CDF error × eligible sample count`.

| Character / slot | Points | Raw JSON bytes | Gzip bytes | Projected 582 raw bytes | Max CDF error | Mean CDF error | Max rank error |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1002 BODY | 257 | 4,611 | 1,385 | 2,683,602 | 0.003906 | 0.000874 | 16 |
| 1002 BODY | 513 | 9,197 | 2,480 | 5,352,654 | 0.001953 | 0.000519 | 8 |
| 1002 NECK | 257 | 4,612 | 1,383 | 2,684,184 | 0.003906 | 0.000908 | 16 |
| 1002 NECK | 513 | 9,217 | 2,416 | 5,364,294 | 0.001953 | 0.000491 | 8 |
| 1310 HEAD | 257 | 4,632 | 1,610 | 2,695,824 | 0.003906 | 0.000777 | 16 |
| 1310 HEAD | 513 | 9,240 | 2,886 | 5,377,680 | 0.001953 | 0.000504 | 8 |
| 1310 OBJECT | 257 | 4,634 | 895 | 2,696,988 | 0.003906 | 0.000854 | 16 |
| 1310 OBJECT | 513 | 9,297 | 1,412 | 5,410,854 | 0.001953 | 0.000510 | 8 |
| 1005 NECK | 257 | 4,643 | 1,341 | 2,702,226 | 0.003906 | 0.000880 | 16 |
| 1005 NECK | 513 | 9,277 | 2,263 | 5,399,214 | 0.001953 | 0.000525 | 8 |

Across these five cases, mean table-only size is about **4.63 KB / 2.69 MB projected raw** for 257 and **9.25 KB / 5.38 MB projected raw** for 513. Mean projected gzip is approximately 0.77 MB vs 1.33 MB if tables were compressed independently. These projections exclude schema/digest wrappers and reflect only the five measured distributions; they are not a formal artifact-size guarantee. Ties create atoms, so empirical CDF discontinuities remain the principal approximation limitation. The 513 grid roughly halves the maximum CDF/rank error but almost doubles raw bytes and lengthens Git diffs. **Recommend 257 points** and the tested lookup contract for V1, with a future acceptance threshold and full-distribution validation before artifact generation.

At N=100, the five 409,600-piece runs took 665–830 ms of simulation time, approximately 0.49–0.62 million pieces/sec on this machine. Node RSS was about 69 MB at start and 132–139 MB at end; this is process-level telemetry, not per-piece allocation or peak heap. Each run uses one compiled model and one RNG, and does not reparse JSON per piece. CLI startup, profile validation, quantile work, and JSON output are excluded from the simulation timer. The A/B/C summaries were derived from the same pieces for each case/N, avoiding three separate Monte Carlo draws.

## 9. Open decisions and Phase 1C prerequisites

1. Confirm a production N through calibration; the values 1/10/100 above are analysis budgets only.
2. Confirm Lens B vs another candidate semantic after reviewing the complete Piece Score and Main Completion composition. If C is chosen, define how no-eligible mass participates in the CDF before generating artifacts.
3. Confirm that base-weight utility is the percentile input on both benchmark and player sides, then specify build-aware target/breakpoint combination. Do not apply panel targets to an isolated simulated relic.
4. Confirm 257-point interpolation and an error acceptance threshold on larger representative samples. The five small runs demonstrate feasibility but do not establish a worst-case bound for all 582 distributions.
5. Reassess V1 assumptions if authoritative upstream mechanics for initial counts, grade distribution, or enhancement targeting become available. Model version and digest changes will make regeneration explicit.

## 10. Verification and repository status

- Passed: `pnpm relic-score:validate` (97 Profiles), `pnpm relic-score:farming:validate` (model digest `9ebe3219d183bd824cae85d9350f3b2b874909835a892a42dfd0a1a5907be657`), `pnpm relic-score:farming:frequency`, `pnpm data:validate:build-inputs` (2,125 artifacts), `pnpm check` (0 Svelte diagnostics; scripts and API TypeScript pass), targeted Prettier/ESLint, `git diff --check`, and a direct Node generator reproducibility smoke. Profile status remains `reviewed=97`.
- Vitest startup for the two new unit files failed before collecting tests: esbuild was denied access while loading `vite.config.ts` (`Cannot read directory "../../../..": Access is denied`). This matches the existing sandbox issue recorded in Phase 1A. The existing relic-score tests were not retried through the same blocked path.
- `pnpm build` completed `data:ensure` and `assets:ensure`, then failed at the same Vite configuration access restriction before compiling source. No build result can be claimed.
- Full `pnpm lint` stopped at 19 pre-existing, unmodified formatting warnings; the changed files pass targeted formatting and ESLint.
- No formal benchmark artifact or generated Profile change. The two read-only external repositories retained clean status. Final `git status --short`:

```text
 M package.json
?? data/relic-score/probability-model.json
?? docs/relic-score-feature/phase-1b-farming-model-and-contract-report.md
?? scripts/relic-score/farming-frequency.ts
?? scripts/relic-score/farming-inputs.ts
?? scripts/relic-score/farming-prototype.ts
?? scripts/relic-score/farming-validate.ts
?? src/lib/relic-score/farming/
?? tests/unit/relic-score-farming-model.test.ts
?? tests/unit/relic-score-farming-prototype.test.ts
```
