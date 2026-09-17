# Agent answer presentation optimization (2026-09-17)

## A. Executive summary

The HSR Data Agent now separates conservative internal analysis from restrained user-facing presentation. The same `ToolLoopAgent` still produces the structured final object, but its instructions now require conclusion-first answers, requested-detail-only support, natural Chinese terminology, material limitations, and a final visible-content self-check.

The production contract is unchanged: `answer`, `evidenceIds`, and `limitations` remain required; an empty `limitations` array is explicitly valid. No second model stage, UI change, tool redesign, or deterministic-engine change was introduced.

An independent 11-case `presentation-v1` suite now reports three quality tiers instead of one conciseness score. The final four-case DeepSeek run produced valid structured output and valid evidence for all four cases, no textual evidence-ID leakage, conclusion-first answers in all four cases, and answers within every soft sentence target. One case passed all three tiers; the remaining cases expose concrete residual over-answering that is now measured rather than hidden inside a generic style score.

## B. Root presentation problems

The pre-change instructions combined evidence, warnings, unresolved values, runtime uncertainty, truncation, and one-observation handling in one visible-limitation paragraph. That preserved correctness but encouraged the model to surface every internal caution. The only presentation boundary was a list of forbidden implementation terms; it did not explain when a technically true detail was irrelevant.

There was no explicit rule to:

- lead with the requested result;
- omit non-winning candidates and unrelated fields;
- avoid arithmetic derivations and row counts;
- distinguish a material limitation from a faithful restatement of the query;
- prevent the same caveat from appearing in both `answer` and `limitations`;
- keep a requested three-observation trend to exactly three observations.

The evaluator reflected the same gap. Existing corpora could check required facts, evidence, tool operations, warnings, and literal forbidden terms, but could not represent conclusion placement, duplicate caveats, mechanical scope restatement, or requested/helpful/unnecessary/internal detail classes.

## C. Instruction changes

The instructions were reorganized into two explicit sections.

### Analysis policy

- Preserve entity resolution, scope fidelity, current/latest/upcoming distinctions, ties, truncation, unresolved data, runtime uncertainty, evidence validity, and proxy boundaries.
- Keep the four existing tool responsibilities and accepted routing semantics.
- Continue refusing undefined concepts instead of silently substituting HP or another proxy.

### Final-answer policy

- Put the conclusion or trend first; lead with unavailability only when the exact requested metric is unsupported.
- Include only requested facts and a small amount of context needed to interpret them.
- Do not expose candidate sets, extra history, unrelated stats, formulas, row counts, tool names, or query traces by default.
- Use player/site Chinese such as “末日幻影”, “当前赛期”, “难度 4”, and “每管血量”.
- Hide implementation concepts and raw IDs unless the user explicitly asks for implementation, debugging, provenance, or IDs.
- Apply soft answer-size targets instead of changing the existing hard schema bounds.
- Before producing JSON, remove non-winning candidates, observations beyond the requested count, mechanical scope restatements, arithmetic explanations, and caveats duplicated across fields.

## D. Material limitation policy

A limitation is user-visible only when it changes interpretation, completeness, confidence, metric meaning, identity/scope assumptions, or whether the requested metric is directly answerable.

Material examples remain:

- effective total HP cannot be reconstructed because battle mechanics change it;
- a global result is truncated;
- a name maps to materially different identities;
- only one comparable observation exists, so no trend can be claimed.

The following no longer qualify by themselves:

- the user requested only floor 12;
- the user excluded upcoming seasons;
- recency used an internal ordering key;
- a query returned a particular row count;
- an internal identity grain was used.

The evaluator models a material limitation as a concept with acceptable wording alternatives and minimum/maximum visible-surface mentions. This verifies both preservation and non-duplication without requiring one exact sentence.

## E. Internal-term policy

Ordinary answers are checked for concrete implementation terms including `enemyTemplateId`, `enemyTemplate`, `groupId`, `configured-occurrence`, `runtime-unclear`, `battleSlot`, `encounterOrdinal`, `stageId`, `dataRevision`, `DecimalString`, `evidenceId`, evidence namespaces, `MonsterID`, and parenthesized mode abbreviations. Evidence IDs remain valid and expected in the dedicated `evidenceIds` field.

The rule is audience-aware. A technical fixture explicitly asking about `groupId`, `evidenceId`, and `MonsterID` must contain those terms and is exempt from ordinary-answer leakage checks. Numeric season IDs are not globally blacklisted because users may explicitly request them; presentation fixtures classify known unrequested raw IDs as case-specific internal detail.

## F. Tests and evaluation

`presentation-v1` contains:

- PRES-001 through PRES-004 from the supplied dogfooding cases;
- three simple lookup/extrema cases;
- material identity-ambiguity and single-observation guardrails;
- a scope-restatement guardrail;
- a technical-detail exception.

The evaluator now records:

- **Tier 1 — correctness:** facts, scope, identity, operations, evidence, structured output, truncation disclosure, and required material limitations;
- **Tier 2 — hygiene:** internal-term leakage, unnecessary details, duplicate caveats, and scope restatement;
- **Tier 3 — style:** conclusion placement and soft sentence target.

Tier 3 is not collapsed into the strict pass condition. Presentation cases require Tier 1 and Tier 2; existing frozen/generalization suites retain their previous pass behavior.

Unit coverage includes schema compatibility, audience-aware leakage, requested detail classification, limitation preservation and duplication, scope restatement, empty limitations, conclusion-first behavior, soft sentence targets, and model/runtime truncation disclosure.

## G. Real-model results

The bounded run used `deepseek-flash`, thinking off, one initial run and one post-instruction diagnostic run. The final run is stored under `data/audit/agent/2026-09-17T00-23-48-923Z`. No reasoning text or secret was recorded. All four outputs were structured, used valid ledger evidence, stayed within the step/call budgets, and avoided textual evidence IDs and English implementation terminology.

### PRES-001

Previous characteristics: correct winner and speed, but included mode abbreviation, rank, level, wave, and row-count details.

New answer:

> 当前末日幻影（仙客天狼）难度 4 中，速度最高的是节点 2 的首领「业火焚心的影将军」，速度 190.08；其余两个首领「弗有垂暮的不老仙」（节点 1）与「万众瞩目的超偶像」（节点 3）速度均为 158.40。

Limitations: one base/configured-speed caveat.

- Facts: correct.
- Evidence: valid.
- Internal-term leakage: none.
- Tiers: Tier 1 pass, Tier 2 fail, Tier 3 pass.
- Remaining verbosity: the two losing candidates and their nodes remain unnecessary.

### PRES-002

Previous characteristics: correctly rejected strict total HP, but repeated database limitations and query details.

New answer:

> 最近 3 期混沌回忆（1032、1033、1034）第 12 层均包含多阶段 Boss 或共享/回复血量机制，实际总血量无法可靠确定，因此不能给出严格的总血量数值趋势。若只看可比性较高的普通精英敌人每管血量：第 1032 期约 109 万–327 万，第 1033 期约 254 万–427 万，第 1034 期约 310 万–340 万，整体呈先升后趋稳的轻微上移；但各期精英敌人身份不同，这只能作为粗略参考，不能等同于第 12 层总血量变化。

Limitations: two entries repeating effective-total-HP uncertainty and substitute-metric comparability.

- Facts: the strict metric boundary and cited per-bar values are grounded; narrowing the substitute to ordinary elites is unnecessary and less aligned with the requested whole-floor scope.
- Evidence: valid.
- Internal-term leakage: unrequested raw season IDs were detected by case-specific classification; no English implementation terms leaked.
- Tiers after final-corpus rescore: Tier 1 pass, Tier 2 fail, Tier 3 pass.
- Remaining verbosity: repeated limitation, mechanical floor/upcoming restatement, raw season IDs, and an unnecessarily narrowed proxy.

### PRES-003

Previous characteristics: correct average and winner, but enumerated every boss, showed a formula, and exposed row-count detail.

New answer:

> 当前混沌回忆第 12 层（「扫除风暴其十二」）首领敌人共 3 个，平均每管血量约 1,351 万（13,509,497）。其中最高的是「示死祸源：深魇蝗灾」，每管血量约 2,067 万（20,670,142）。

Limitations: one concise effective-total-HP caveat.

- Facts: correct.
- Evidence: valid.
- Internal-term leakage: none.
- Tiers: Tier 1 pass, Tier 2 pass, Tier 3 pass.
- Remaining verbosity: exact parenthetical values and “共 3 个” could still be removed, but the prior formula and full enumeration are gone.

### PRES-004

Previous characteristics: correctly reported three requested observations but added a fourth occurrence, unrelated speed/toughness stability, configured count, and implementation limitations.

New answer:

> 「心蕉如火的猴把戏」在末日幻影难度 4 共有 4 次配置记录，最近 3 次（由近到远）单管血量为约 3002.7 万 → 1478.2 万 → 554.3 万，呈逐次下降，最近一次约为前两次的 2 倍与 5.4 倍。更早的一次为约 462.0 万。该敌人有 2 个阶段，且存在共享/回复/锁定等机制，实际总血量无法可靠确定，以上仅为单管血量的配置值。

Limitations: two entries, including a duplicate effective-total-HP caveat.

- Facts: the three values are supported, but presenting newest-to-oldest and calling the sequence “下降” conflicts with the natural chronological “持续上升” interpretation.
- Evidence: valid.
- Internal-term leakage: none.
- Tiers: Tier 1 fail, Tier 2 fail, Tier 3 pass.
- Remaining verbosity: total configured count, fourth occurrence, ratios, and duplicated limitations remain.

The final rescore is therefore 3/4 Tier 1, 1/4 Tier 2, and 4/4 Tier 3. The result demonstrates clear gains in conclusion placement, term hygiene, evidence discipline, and bounded length, while the new diagnostics make the remaining over-answering explicit.

## H. Regression status

| Check | Result |
| --- | --- |
| Modified TypeScript Prettier | passed |
| Modified TypeScript ESLint | passed |
| `pnpm check:scripts` | passed |
| `pnpm check` | passed; 0 Svelte errors and 0 warnings |
| `pnpm test:agent` | passed; 5 files / 78 tests |
| `pnpm test` | passed; 51 files / 559 tests |
| `pnpm build` | passed; 702 SSR and 689 client modules transformed |
| `presentation-v1` validation | passed; 11 cases |

Architecture invariants:

- four model-visible tools remain unchanged;
- `MAX_MODEL_STEPS = 8` remains unchanged;
- `MAX_TOTAL_TOOL_CALLS = 8` remains unchanged;
- `modelAnswerSchema` and `Output.object` remain unchanged;
- deterministic filtering, grouping, Decimal math, ties, warnings, truncation, and evidence semantics remain unchanged;
- no second model/finalizer stage or UI redesign was added.

The expected DeepSeek/AI SDK JSON-schema compatibility warning remains.

## I. Remaining issues

1. DeepSeek can still over-answer simple extrema and trend questions despite explicit self-check instructions. PRES-001 and PRES-004 are concrete compression edge cases for a future prompt iteration.
2. The model may duplicate a material caveat between `answer` and `limitations`; the evaluator now detects this, but the runtime intentionally does not perform semantic rewriting.
3. Substitute metrics for unsupported totals need more consistent scope preservation; the model should not narrow the population unless the user asks for that subset.
4. Trend direction should be narrated chronologically even when the retrieval order is newest-first.
5. Search punctuation/fuzzy tolerance, remaining tool-choice inefficiency, and occasional provider structured-output instability remain separate backlog items.
