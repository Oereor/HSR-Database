# Agent step budget and aggregation tools (2026-09-16)

## A. Executive summary

The Agent now has an eight-model-step budget while retaining the independent eight-tool-execution cap, the 180/60/30 second timeout boundaries, and `maxRetries = 1`. The production model-facing surface is now:

- `search_entities`: resolve a user-named entity;
- `query_endgame`: retrieve concrete configured rows and concrete global top/bottom rows;
- `aggregate_endgame`: compute scalar or grouped `rowCount`, `countDistinct`, `min`, `max`, and `avg` summaries;
- `select_endgame_extrema`: identify the enemy identity or location associated with a minimum or maximum, including deterministic ties.

Associated extrema were split out of `aggregate_endgame`. Both analytical wrappers still use one deterministic engine, so filtering, Decimal arithmetic, warnings, truncation, ties, and `ag1` evidence have not forked. The primary regressions no longer fail at the former four-step ceiling: DOG-002 completed in four steps and DOG-006 completed in three.

## B. Step budget

The accepted SDK runtime previously stopped after four model steps. That budget was too small for an otherwise ordinary resolution/correction/query/final-answer path: a single entity-name correction could consume the step that was needed for the structured answer.

`MAX_MODEL_STEPS` is now 8. The eighth step can be the structured final answer. If the eighth step still contains only tool calls, the runtime returns the safe step-limit answer and never treats those unfinished calls as an answer. Evidence produced by completed calls remains in the trace/ledger, while the safe limit answer cites none.

The following bounds are unchanged and independent:

| Boundary | Value |
| --- | ---: |
| Model steps | 8 |
| Executed tools | 8 |
| Total timeout | 180 s |
| Per-step timeout | 60 s |
| Per-tool timeout | 30 s |
| SDK retries | 1 |

Runtime, CLI, Inspector, profile, and evaluation telemetry now use `step`, `modelSteps`, and `hitStepLimit`. Inspector labels are `Model step n`.

## C. Aggregation diagnosis

The historical DOG-006 failure artifact contains only the bounded failure result, not a complete pre-change tool trace, so no exact causal trace can be reconstructed from it. The current-code dogfood run did expose the planning pressure directly: before the PF difficulty wording was made explicit, the model spent seven steps and seven calls moving between `query_endgame`, `select_endgame_extrema`, and `aggregate_endgame`, interpreted difficulty as an enemy level in part of the path, and still reported a truncated partial result.

Two ambiguities contributed:

1. the former all-purpose aggregate metric union asked the model to distinguish scalar extrema from associated extrema inside one large schema;
2. the difference between PF difficulty/ordinal and enemy configuration level was not explicit enough for the model.

The split gives the user question a direct operation: “maximum value” maps to scalar aggregate, while “which enemy produced the maximum” maps to associated extrema. Contracts and instructions now also state that MoC floor N and PF difficulty N use `encounterOrdinals:[N]`, while `levels` is the enemy configuration level.

A decomposition diagnostic found one further routing error: the model initially grouped by `enemyTemplate` while also selecting `enemyTemplate`, producing one extremum per identity rather than the global winner. The final tool description explicitly requires global identity extrema to omit `groupBy`; grouping is only for a winner within each independent group.

## D. Architecture decision

### `query_endgame`

Use for concrete configured rows, a particular occurrence, drill-down, and a concrete globally sorted top/bottom row. It intentionally does not replace identity-level extrema with `sort + limit: 1`, because that would discard associated ties and answer at row grain.

### `aggregate_endgame`

Use for “how many?”, “what is the average?”, “what is the maximum value?”, and scalar summaries by a bounded group dimension. Its model-facing metric schema has only five branches: `rowCount`, `countDistinct`, `min`, `max`, and `avg`.

### `select_endgame_extrema`

Use for “which enemy?”, “which Monster variant?”, or “which location produced the minimum/maximum?”. Its schema has two metric branches, `argMin` and `argMax`, with a numeric field and one of `enemyTemplate`, `monster`, or `location`. Aliases must be unique, selections must be unique, and sorting can reference only a declared dimension or extremum alias. Results expose `groups[].extrema`.

For a global winner the tool omits `groupBy`. For a winner per season/location/other dimension it groups only by the independent comparison dimension. `statuses:["current"]` can be resolved directly by either analytical tool, so a preliminary season-discovery query is unnecessary.

No `prepareStep`, dynamic tool activation, manual workflow state machine, fuzzy-search redesign, or answer-compression change was introduced.

## E. Deterministic engine reuse

`EndgameAnalysisInput` is the internal superset contract. `executeEndgameAnalysis` owns row loading, filters, grouping, weakness expansion, Decimal comparisons, scalar calculations, associated-row selection, sorting, warnings, group/tie/payload limits, and evidence hashing.

`aggregateEndgame` passes scalar metrics through directly. `selectEndgameExtrema` normalizes its narrower `extrema` and `sort` representation into internal metrics/sort, calls the same executor, and presents the result as `groups[].extrema`. It does not reimplement analysis.

Associated extrema continue to use the `ag1` namespace. Equivalent filter/group/extrema/dimension inputs retain the same evidence identity as the former aggregate path. Deterministic tests cover wrapper equivalence, duplicate-tie removal, tie and payload truncation, unresolved values, PF warnings, and group truncation.

## F. Schema and context measurements

Measurements are serialized UTF-8 bytes from `pnpm agent:profile`. The baseline is the accepted three-tool build supplied for this task.

| Measure | Before | After |
| --- | ---: | ---: |
| Tool count | 3 | 4 |
| Total tool definitions | 13,561 B | 19,415 B |
| System instructions | 2,380 B | 3,086 B |
| Largest tool | `aggregate_endgame`, 7,624 B | `aggregate_endgame`, 6,853 B |
| Aggregate metric branches | 7 | 5 |
| Extrema metric branches | included in aggregate | 2 |

| Tool | Before definition / schema | After definition / schema |
| --- | ---: | ---: |
| `search_entities` | 1,199 / 675 B | 1,185 / 675 B |
| `query_endgame` | 4,680 / 4,149 B | 4,809 / 4,364 B |
| `aggregate_endgame` | 7,624 / 7,033 B | 6,853 / 6,428 B |
| `select_endgame_extrema` | n/a | 6,484 / 5,924 B |

The split increases total request context because filter/group structures are duplicated, but it reduces the largest schema and makes the two analytical responsibilities explicit. The profile also records each description size, fingerprints, example tool-result bytes, and simulated message-history growth.

## G. Evaluation migration

Evaluation gold no longer names production tools. Cases declare these operations instead:

- `entity-resolution`;
- `concrete-query`;
- `scalar-summary`;
- `associated-extrema`;
- `ambiguity-resolution`.

The scorer maps the actual current tool sequence back to operations and checks `operationArguments` while continuing to record the concrete tool sequence, schema-invalid calls, retries/recovery, forbidden operations, and extra calls. The four existing `argMin`/`argMax` generalization cases now expect `associated-extrema`. Forbidden gold was reviewed by responsibility rather than mechanically translating every former `aggregate_endgame` prohibition.

The new `step-budget-aggregation-v1` corpus has 11 cases: DOG-001 through DOG-006 and five PF difficulty-4 decomposition cases for average HP, maximum HP value, highest-HP enemy, highest concrete row, and combined average plus associated winner. DOG-002 is fixed to template `3024020`, MoC floor 12, non-upcoming seasons sorted by descending season/group ID. DOG-006 fixes PF/current/ordinal 4 and `argMax hpPerBar` selecting `enemyTemplate`.

## H. Tests

The deterministic suite covers:

- normal final answers after multiple tool steps;
- a structured answer on model step 8;
- safe stopping when step 8 still emits tools;
- evidence retention in trace/ledger and rejection of unexecuted evidence;
- the independent eight-tool cap;
- scalar/extrema schema rejection in both directions;
- shared-engine wrapper equivalence and `ag1` stability;
- tie, unresolved, PF, group, and payload warning behavior;
- concrete-row versus associated-identity routing;
- a combined scalar plus extrema request using both analytical tools.

Final command results:

| Command | Result |
| --- | --- |
| `pnpm check:scripts` | passed; messages validated and script TypeScript emitted no diagnostics |
| `pnpm check` | passed; Svelte check reported 0 errors and 0 warnings |
| `pnpm test:agent` | 5 files / 72 tests passed |
| `pnpm test` | 51 files / 553 tests passed |
| `pnpm build` | passed; 702 SSR and 689 client modules transformed |
| Modified-file Prettier / ESLint | passed for all modified TypeScript files; Markdown is repository-ignored by Prettier |

The expected AI SDK warning remains: DeepSeek JSON response schema is provided in compatibility mode through the system message.

## I. Dogfooding results

Real calls used `.env.local`, `deepseek-flash`, thinking off, and the current data revision `6f4dc9165611be7b6caa5c0d961bdbaedc6ca45193a491f10ce212548bc806c4`. No reasoning text or secret was recorded. The table uses the latest valid run for each case; “pass” here means the requested product fact/scope/evidence behavior succeeded. Strict evaluator failures caused only by additional calls are called out separately.

| Case | Product result | Steps / calls | Tool sequence | Evidence and limitations | Notes |
| --- | --- | ---: | --- | --- | --- |
| DOG-001 | Pass | 3 / 2 | search → query | Valid; same-name templates, historical status, and database-earliest scope disclosed | Answered season 1027, “范畴错误” |
| DOG-002 | Pass | 4 / 3 | search → search → query | Valid; effective-total-HP uncertainty, exact template scope, and upcoming exclusion disclosed | Full-name miss recovered once with core name |
| DOG-003 | Pass | 4 / 6 | search → query → search → query → query → query | Valid; identity variants, `hpPerBar`, runtime uncertainty, and upcoming status disclosed | Correct but four calls were unnecessary |
| DOG-004 | Pass | 4 / 4 | search → search → query → query | Valid; runtime uncertainty and current/upcoming boundary disclosed | Correct control, with extra search/query |
| DOG-005 | Pass | 4 / 3 | search → query → query | Valid; `hpPerBar` and runtime uncertainty disclosed | Correct alias control, with one extra query |
| DOG-006 | Pass | 3 / 3 | query → extrema → query | Valid; `hpPerBar`, PF configured-occurrence, and runtime uncertainty disclosed | Correct “步离战首•呼雷”; two query calls were unnecessary, so strict efficiency gold failed |

DOG-002 improved from the recorded four-step-limit failure to a four-step structured answer. It stayed on template `3024020`, excluded upcoming 1035, and compared 1034 “扫除风暴”, 1028 “猴子把戏”, and 1012 “一晌荒宴”. The final run used 34,086 input tokens, 801 output tokens, 7,016 tool-result bytes, and 6,067 ms.

DOG-006 improved from the recorded four-step-limit failure to a three-step answer using the new extrema tool. Its key call used `pf + current + encounterOrdinals:[4] + argMax hpPerBar + select enemyTemplate`, and returned “步离战首•呼雷” at about 78.0 million HP per bar. The final run used 38,715 input tokens, 653 output tokens, 28,600 tool-result bytes, and 4,040 ms. The trajectory is materially shorter and reaches the correct identity/tie-aware operation, but the surrounding queries remain an efficiency issue.

The five decomposition cases were run once after the PF ordinal clarification. Four completed; the average-only case had one provider structured-output failure. Its permitted diagnostic repeat then passed strictly in two steps with one aggregate call. The first highest-enemy run exposed the identity/grouping mistake; after the tool-description correction, its permitted diagnostic repeat returned the correct “步离战首•呼雷” fact with valid evidence, but still made three unnecessary surrounding calls. Maximum value and concrete-row cases returned 78,000,431; the combined case used both analytical responsibilities and returned the 1,761,359.34 average plus the same winning enemy.

Audit artifacts are under:

- `data/audit/agent/2026-09-16T13-04-24-328Z` (initial 11-case pass);
- `data/audit/agent/2026-09-16T13-09-45-344Z` (DOG-002/DOG-006 diagnostics after PF mapping clarification);
- `data/audit/agent/2026-09-16T13-14-10-374Z` (five decomposition cases);
- `data/audit/agent/2026-09-16T13-19-24-532Z` (two permitted decomposition diagnostics after final routing text).

## J. Remaining issues

1. Search punctuation and fuzzy tolerance remain backlog. The bounded core-name retry helps the demonstrated Sam form without changing search matching or broadening identity scope.
2. Answer compression remains backlog; several correct answers include more comparison detail than requested.
3. The DeepSeek/AI SDK JSON-schema compatibility warning remains expected and is not suppressed.
4. Tool-choice efficiency is not yet perfect. DOG-003 through DOG-006 and one decomposition diagnostic still made avoidable discovery/drill-down calls. The deterministic facts and evidence are correct, but future prompt/eval work can target direct `select_endgame_extrema → final` behavior without adding manual orchestration.
5. A single real-model structured-output failure occurred in the first average-only decomposition attempt; its one permitted repeat completed normally. Local structured-output, bounded-stop, and provider-mapping tests all pass.
