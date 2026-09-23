# Relic Score Phase 1C — Scoring Core and Calibration Report

> Historical snapshot. The later [Phase 1C Soft Target simplification](phase-1c-soft-target-simplification-report.md) supersedes this report's target context, Candidate A/B, breakpoint component and final-score sections. The old target-study output was removed. N/K/257 findings remain historical observations, not production defaults.

## 1. Executive summary and Phase 1B decisions

Phase 1C implements the deterministic Lens B benchmark contract, a versioned prototype artifact and stale validator, Piece/Build scoring primitives, target comparison, and offline calibration. It does **not** freeze Production N/K or produce the 97×6 benchmark. The 257-point gate **failed** under independent verification: all ten representative Lens B distributions exceeded the required maximum absolute CDF error of 0.005, and 513 points did not rescue any of them. Thus the 257-point representation remains provisional and Phase 1C is not ready for Production benchmark generation.

The approved Phase 1B assumptions are retained with `v1-simulation-assumption` provenance: three initial substats 80%, four 20%; uniform integer grade `0..StepNum`; +3 reveal for three-initial relics, then uniform enhancement of existing substats at +3/+6/+9/+12/+15. Lens B selects the maximum base-weight RawSubUtility among all N naturally generated target-slot 5★ +15 pieces, regardless of main stat. Targets and post-target weights never enter Piece RawSubUtility or its CDF. N remains explicit with no Production default.

## 2. Files and public contracts

- `src/lib/relic-score/benchmark/` defines artifact types, lookup and cheap stale validation; `score.ts` defines typed Piece/Build results, target context, explanations and availability; `scoring-config.ts` centralizes frozen weights.
- `scripts/relic-score/benchmark-core.ts` creates deterministic Lens B prototype distributions; `calibrate.ts`, `target-study.ts`, and `score-command.ts` expose offline analysis and inspection. `package.json` adds `relic-score:calibrate`, `relic-score:target:study`, `relic-score:score`, and `relic-score:inspect`.
- `tests/fixtures/relic-score/benchmark/prototype.json` is a small six-slot, character-1310 fixture with `prototype=true`, N=10, K=512 and seed 123456789. Runtime has no automatic fixture fallback. `tests/unit/relic-score-phase1c.test.ts` covers contract and scoring cases; Vitest execution was blocked by the local Vite/esbuild permission error noted below.
- JSON result files beside this report contain all individual gate, N, K and target rows. They are summary evidence; no raw sorted Monte Carlo samples are committed.

## 3. Benchmark distribution, artifact, lookup and identity

One experiment generates N target-slot natural 5★ +15 pieces, scores each with `Σ(actualSubstatValue / fiveStarHighRollReference) × baseWeight`, and selects the maximum. Repeating K times yields the sample distribution. Main stat occurrence and main/sub exclusion remain natural; main recommendation affects Main Completion only.

The schema records schema/benchmark versions; farming model, generator and PRNG versions; seed, N, K, Lens B selection mode; quantile representation/count; SHA-256 profile, probability and reference digests; and character/slot distributions with mean, p25/p50/p75/p90/p95/p99 and 257 quantiles. Stable serialization gives deterministic digests and ordering. The per-distribution identity reuses the Phase 1B digest with Lens B. Validator checks versions, dimensions, finite/monotone quantiles, summary ordering, coverage and expected digests/N/K/seed. Prototype artifacts require an explicit `allowPrototype` option. No production artifact or Production loader was added.

Lookup uses binary search over 257 knots, linear interpolation between distinct knots, right-continuous ties, 0 below the minimum, 1 at or above the maximum, and clamps to `[0,1]`. A missing or stale distribution returns `unavailable`; no fallback is synthesized.

## 4. Lens B 257 validation and gate

Seed 123456789, N=50, **training K=32,768**. A separate seed (`seed XOR 0x9e3779b9`) generated **16,384 verification experiments** per case. Errors compare the training quantile table to the independent empirical CDF, including observed distinct values and midpoints. This avoids treating the in-sample ~1/256 quantile grid error as evidence of out-of-sample accuracy. Cases cover direct DPS, break, DoT, support/sustain, all six slot types, fixed/variable mains and Crit/no-Crit profiles. Each failure automatically measures a 513-point training table on the same verification samples.

| Character | Slot | N | Train K / verify K | Max CDF error | Mean CDF error | Max rank error | 257 pass? | 513 max error |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 1002 | BODY | 50 | 32768 / 16384 | 0.012381 | 0.003492 | 202.9 | No | 0.010986 |
| 1222 | FOOT | 50 | 32768 / 16384 | 0.012573 | 0.003040 | 206.0 | No | 0.010620 |
| 1005 | NECK | 50 | 32768 / 16384 | 0.008667 | 0.002079 | 142.0 | No | 0.007568 |
| 1101 | HEAD | 50 | 32768 / 16384 | 0.010071 | 0.002587 | 165.0 | No | 0.009705 |
| 1001 | OBJECT | 50 | 32768 / 16384 | 0.011658 | 0.002303 | 191.0 | No | 0.009705 |
| 1310 | HAND | 50 | 32768 / 16384 | 0.009460 | 0.003202 | 155.0 | No | 0.008606 |
| 1002 | NECK | 50 | 32768 / 16384 | 0.010071 | 0.002293 | 165.0 | No | 0.008728 |
| 1222 | OBJECT | 50 | 32768 / 16384 | 0.013428 | 0.003543 | 220.0 | No | 0.012756 |
| 1005 | BODY | 50 | 32768 / 16384 | 0.010681 | 0.002499 | 175.0 | No | 0.008850 |
| 1101 | HAND | 50 | 32768 / 16384 | 0.010071 | 0.002587 | 165.0 | No | 0.009705 |

The 0.005 gate fails for both grids. The gap includes finite-sample Monte Carlo variation between fit and verification distributions; increasing knot count alone cannot remove it. Maintainers must decide whether the acceptance gate should measure representation error on the fit distribution, independent-distribution estimation error with a statistical tolerance, or both as separate metrics. No point-count override or Production artifact was committed.

## 5. Piece scoring, hits and availability

MainSuitability is 1 for an upstream-recommended main, 0 otherwise; HEAD/HAND use their fixed 5★ main identity. MainCompletion is suitability times actual/reference, clamped to `[0,1]`; low rarity and underleveling require no separate penalty. Each substat explains actual, 5★ high-roll reference, RollEq, base weight and weighted contribution. Weight 0 contributes 0; targets, breakpoint, set and panel are excluded. Piece percentile is the matching character/slot/N/identity CDF value; PieceScore is `100 × (0.30 × MainCompletion + 0.70 × percentile)`.

Effective Hits count exact provider occurrences of upstream-recommended substats only. Ambiguous or unavailable evidence yields partial/unavailable hit information without changing Piece Score. The six-slot Build result distinguishes `available`, `unavailable` and `invalid`; an incomplete Build retains individually available Piece results. Missing or stale benchmark, unreviewed Profile, missing recommendation and missing panel/context do not turn into zero scores.

## 6. Build scoring, targets, breakpoint and sets

`S_base` aggregates PieceNormalized with HEAD/HAND 0.10 each and BODY/FOOT/NECK/OBJECT 0.20 each. Configured hard breakpoints read numeric final OOC panel values, output pass/target/weight details, and currently use equal-weight pass ratio where multiple items exist; no breakpoint gives B=1. Equal weighting remains a maintainer decision because the Profile schema has no weight field.

Set Integrity reads only upstream set recommendations: one recommended Cavern 4-piece scores 1, the same recommended set at two pieces scores 0.5, otherwise 0; recommended Planar 2-piece scores 1. Each category takes its best recommended candidate, without interpreting recommendation order as rank. Two different recommended Cavern 2-piece sets remain 0.5, not a supported 2+2. `T = 2/3 × Cavern + 1/3 × Planar`; partial 0.5 is provisional. `FinalBase = 100 × (0.85 × S_base + 0.10 × B + 0.05 × T)`.

`PlayerBuildInput` contains final numeric panel but no reliable source decomposition for ratio stats. The new explicit `BuildTargetContext` supplies each targeted stat's non-target-substat panel baseline and per-slot panel deltas. Main, set and non-relic contributions are in the baseline; future Player integration must derive it from numeric `collectPropertyContributions` buckets, not UI text. The target primitive uses the reviewed piecewise marginal utility: base weight until the final-panel target and post-target weight afterward. It reports base/target-aware utility and efficiency, leaving every Piece score unchanged.

Candidate A uses `E = targetAwareBuildSubUtility / baseBuildSubUtility` and `S_A = aggregatedMain + aggregatedSub × E`. Candidate B replaces only the Build-level substat share with an absolute target-aware credit. Let `M=aggregatedMain`, `R=Σ six benchmark p50 RawSubUtility` and `U*=targetAwareBuildSubUtility`; then `S_B=M+0.70×clamp(U*/R,0,1)`. With no targets, B equals `S_base`. B is continuous, retains the main component, and is nondecreasing as a positive-marginal target stat grows because `U*` is nondecreasing. A zero post-target weight caps B's contribution from that stat. Neither candidate modifies a Piece CDF input.

The synthetic target study used reviewed target values, explicit baseline and six slots, with panel values at target ± ε, exactly target and 2× target. Candidate A fell after crossing in 12 of 13 cases; Candidate B remained nondecreasing in all 13. Representative historical rows follow; the obsolete machine-readable output was removed during simplification.

| Profile / stat | Target | Panel value | Base utility | Target-aware utility | Candidate A exact → far | Candidate B exact → far | Continuous / monotone B? |
| --- | ---: | --- | ---: | ---: | --- | --- | --- |
| 1002 / Crit Rate | 100% | target → 2× | 23.148 | 23.148 | 0.1974 → 0.1490 | 0.8200 → 0.8200 | Yes |
| 1415 / Crit Rate | 50% | target → 2× | 6.944 | 6.944 | 0.1981 → 0.1493 | 0.4309 → 0.4309 | Yes |
| 1413 / Crit Rate | 65% | target → 2× | 15.046 | 15.046 | 0.1982 → 0.1493 | 0.6369 → 0.6369 | Yes |
| 1505 / Crit Rate | 70% | target → 2× | 16.204 | 16.204 | 0.2574 → 0.2090 | 0.7027 → 0.7027 | Yes |
| 8009 / Crit Rate | 85% | target → 2× | 15.741 | 15.741 | 0.2574 → 0.2090 | 0.8158 → 0.8158 | Yes |
| 1301 / Break | 150% | target → 2× | 17.361 | 17.361 | 0.2634 → 0.2217 | 0.8800 → 0.8800 | Yes |
| 1303 / Break | 180% | target → 2× | 20.833 | 20.833 | 0.2634 → 0.2217 | 0.8800 → 0.8800 | Yes |
| 1222 / Break | 200% | target → 2× | 13.889 | 13.889 | 0.3311 → 0.2931 | 0.9400 → 0.9400 | Yes |
| 8009 / ATK | 2200 | target → 2× | 22.917 | 22.917 | 0.2574 → 0.2251 | 0.8800 → 0.8800 | Yes |
| 1501 / ATK | 3600 | target → 2× | 50.000 | 50.000 | 0.2097 → 0.1536 | 0.8200 → 0.8200 | Yes |
| 1412 / ATK | 4000 | target → 2× | 55.556 | 55.556 | 0.3412 → 0.2937 | 0.9400 → 0.9400 | Yes |
| 1304 / DEF | 4000 | target → 2× | 44.444 | 44.444 | 0.1927 → 0.1586 | 0.8200 → 0.8200 | Yes |
| 1409 / Effect RES | 50% | target → 2× | 1.736 | 1.736 | 0.1401 → 0.1453 | 0.2080 → 0.2080 | Yes |

Candidate B is recommended for further product review because it satisfies the crossing and cap constraints. Its raw-utility reference scale can differ sharply from the percentile scale: the deliberately extreme synthetic rows above reach 0.82–0.94 while `S_base` is much lower. This requires real-build calibration and maintainer approval before becoming the final target-adjustment contract. The synthetic study does not establish player-distribution calibration.

## 7. N sensitivity and Build spread

Seed 123456789, K=8192 for each N. Ten representative character/slot cases were compared with fixed actual normalized pieces where available and a separate 2048-piece held-out quality corpus for every case. The low-N extension was added because all requested N=10/25/50/100/200 values made ordinary held-out single pieces score very low. The full [N table](phase-1c-n-results.json) and [low-N extension](phase-1c-n-low-results.json) include quality percentiles and runtime.

| N | Character | Slot | Fixture | RawSubUtility | Percentile | MainCompletion | PieceScore |
| ---: | --- | --- | --- | ---: | ---: | ---: | ---: |
| 1 | 1310 | HAND | existing normalized | 4.8846 | 0.9595 | 1 | 97.17 |
| 3 | 1310 | HAND | existing normalized | 4.8846 | 0.8880 | 1 | 92.16 |
| 5 | 1310 | HAND | existing normalized | 4.8846 | 0.8218 | 1 | 87.53 |
| 10 | 1310 | HAND | existing normalized | 4.8846 | 0.6738 | 1 | 77.17 |
| 25 | 1310 | HAND | existing normalized | 4.8846 | 0.3711 | 1 | 55.98 |
| 50 | 1310 | HAND | existing normalized | 4.8846 | 0.1367 | 1 | 39.57 |
| 100 | 1310 | HAND | existing normalized | 4.8846 | 0.0191 | 1 | 31.34 |
| 200 | 1310 | HAND | existing normalized | 4.8846 | 0 | 1 | 30.00 |

| N | Build fixture | S_base | Target A | Target B | B | T | FinalBase |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 1310 normalized | 0.9208 | 0.9208 | 0.9208 | 1 | 1 | 93.27 |
| 3 | 1310 normalized | 0.7899 | 0.7899 | 0.7899 | 1 | 1 | 82.14 |
| 5 | 1310 normalized | 0.6971 | 0.6971 | 0.6971 | 1 | 1 | 74.25 |
| 10 | 1310 normalized | 0.5608 | 0.5608 | 0.5608 | 1 | 1 | 62.66 |
| 25 | 1310 normalized | 0.4223 | 0.4223 | 0.4223 | 1 | 1 | 50.89 |
| 50 | 1310 normalized | 0.3679 | 0.3679 | 0.3679 | 1 | 1 | 46.27 |
| 100 | 1310 normalized | 0.3417 | 0.3417 | 0.3417 | 1 | 1 | 44.05 |
| 200 | 1310 normalized | 0.3227 | 0.3227 | 0.3227 | 1 | 1 | 42.43 |

This fixed Build has no target, so A/B equal base. For 1002 BODY's independent held-out corpus, the 50th-percentile single piece maps to ~0.51 at N=1, ~0.13 at N=3, ~0.04 at N=5 and ~0 at N≥10. That is an expected best-of-N shift, but it makes the requested N=10–200 range unsuitable as a general Piece quality scale without further product calibration. Recommend **N=3–5 as a review range**, not a Production default. No rank inversion was observed for the fixed raw-quality labels because each CDF is monotone; cross-character/build rank stability remains insufficiently sampled for a final freeze.

## 8. K convergence and runtime

The following compare each K against K=65536 using the same seed, N=50. Runtime is simulation time for that distribution; the artifact remains 257 points at every K.

| K | Distribution | P50 drift | P90 drift | P99 drift | Max lookup drift | Runtime ms |
| ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 8192 | 1002 BODY | 0.0000 | 0.0000 | 0.0250 | 0.0078 | 633 |
| 8192 | 1222 FOOT | 0.0212 | 0.0154 | 0.0596 | 0.0117 | 607 |
| 8192 | 1005 NECK | 0.0192 | 0.0058 | 0.0149 | 0.0117 | 643 |
| 16384 | 1002 BODY | 0.0096 | 0.0000 | 0.0019 | 0.0117 | 1189 |
| 16384 | 1222 FOOT | 0.0058 | 0.0012 | 0.0138 | 0.0078 | 1149 |
| 16384 | 1005 NECK | 0.0192 | 0.0058 | 0.0250 | 0.0078 | 1207 |
| 32768 | 1002 BODY | 0.0000 | 0.0000 | 0.0250 | 0.0039 | 2327 |
| 32768 | 1222 FOOT | 0.0000 | 0.0058 | 0.0032 | 0.0039 | 2273 |
| 32768 | 1005 NECK | 0.0096 | 0.0000 | 0.0096 | 0.0039 | 2410 |
| 65536 | 1002 BODY | 0 | 0 | 0 | 0 | 4663 |
| 65536 | 1222 FOOT | 0 | 0 | 0 | 0 | 4526 |
| 65536 | 1005 NECK | 0 | 0 | 0 | 0 | 4807 |

Recommend **K=65536 for maintainer review** when a Production artifact is eventually approved: the 32768→65536 p99 and lookup differences are still visible, while 8192/16384 fluctuate more. This is a recommendation, not a frozen value; actual regeneration cost scales linearly in N×K and should be remeasured at the chosen N. Changing K alone does not solve the independent 0.005 gate.

## 9. Open decisions, next-stage readiness and validation

Maintainers must settle the 257 acceptance metric after the independent gate failure, Production N/K, Candidate B's normalization scale, equal weighting if multiple breakpoints are ever configured, and provisional set partial credit. Future Player integration must supply numeric baseline/delta context. Phase 1C does not change UI, Player Info presentation, score grades, live Enka, production data generation or deployment workflow; farming Monte Carlo remains an explicit offline command.

- Passed: `pnpm relic-score:validate` (97 reviewed Profiles), `pnpm relic-score:farming:validate`, `pnpm data:validate:build-inputs` (2125 artifacts), `pnpm check:scripts`, target/score/calibration CLIs, and targeted Prettier/ESLint after corrections.
- `pnpm check` exited 0, with TypeScript/API checks and 0 Svelte diagnostics, but Svelte config loading reported the existing Vite/esbuild access denial; it is not a clean configuration check.
- Vitest failed before test collection at `vite.config.ts` due `Cannot read directory "../../../..": Access is denied`; unit tests remain unexecuted in this environment.
- `pnpm build` passed `data:ensure` and `assets:ensure`, then failed at the same Vite/esbuild config access restriction before source compilation.
- Full `pnpm lint` failed on 19 existing unrelated Prettier differences plus four Phase 1C JSON files; the latter were subsequently formatted. Targeted ESLint and Prettier passed. The two read-only upstream repositories were clean under read-only per-command `safe.directory` checks.

## 10. `git status --short`

```text
 M package.json
?? docs/relic-score-feature/phase-1c-gate-results.json
?? docs/relic-score-feature/phase-1c-k-results.json
?? docs/relic-score-feature/phase-1c-n-low-results.json
?? docs/relic-score-feature/phase-1c-n-results.json
?? docs/relic-score-feature/phase-1c-scoring-core-and-calibration-report.md
?? docs/relic-score-feature/phase-1c-target-results.json
?? scripts/relic-score/benchmark-core.ts
?? scripts/relic-score/calibrate.ts
?? scripts/relic-score/score-command.ts
?? scripts/relic-score/scoring-inputs.ts
?? scripts/relic-score/target-study.ts
?? src/lib/relic-score/benchmark/
?? src/lib/relic-score/score.ts
?? src/lib/relic-score/scoring-config.ts
?? tests/fixtures/relic-score/benchmark/
?? tests/unit/relic-score-phase1c.test.ts
```
