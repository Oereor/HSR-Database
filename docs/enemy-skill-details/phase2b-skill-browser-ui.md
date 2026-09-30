# Enemy Skill Details — Phase 2B Skill Browser UI

> 历史阶段记录：本文描述实施当时的模型与结论，不是当前实现规范。当前契约以 [规范架构文档](../architecture/localization-and-data-generation.md)、[V2 Phase 4 倍率候选报告](v2-phase4-multiplier-candidates-cleanup.md) 和 [UI Round 1 报告](ui-round1-information-hierarchy.md) 为准；历史测试、覆盖和文案记录不代表当前状态。

## Information architecture and components

The old enemy page put phase skill references in the Monster section. Those references jumped to a second, complete list of shared skill cards below. The Skills section now contains one browser: phase tabs, a compact skill selector, and exactly one selected detail. There are no enemy skill anchors or duplicate full-card list. The Monster selector, stats and Monster summon section retain their existing roles.

`EnemyDetailPage` owns the concrete `selectedMonsterId`. `EnemySkillBrowser` calls `getEnemySkillsForMonster(detail, monsterId)` when that ID changes, filters the result through phase skill IDs while preserving the returned Monster order, and owns `activePhaseIndex` and `selectedSkillId`. `EnemySkillSelector` renders native buttons; `EnemySkillDetail` renders shared identity/prose plus the selected Monster binding's optional facts. No component joins parser or neutral-domain records.

The first nonempty phase selects its first skill. Selecting another phase keeps the Skill ID if that phase contains it, otherwise chooses its first skill. On a Monster change, the browser keeps a shared Skill ID and chooses a phase containing it, preferring the current phase. If absent, it chooses the first available skill. An empty phase or Monster shows the existing empty state without a detail panel.

## Detail presentation

The header reuses the existing skill type tag, element icon, localized name, official description and `SkillExtraEffects` disclosure. Structured facts follow a divider only when a fact exists. Damage is shown by its semantic target role and exact attack ratio; bounce shows only verified count. Status groups show localized names, `Buff`/`Debuff`/`Other`, target, optional base chance and only verified turn duration. Action shifts show normalized advance/delay percentages. DoT trigger/clear are short semantic facts. Candidate summons reuse `CompactEntityCard`, localized links and portraits, with wording that does not imply a fixed count.

One decimal-string formatter handles damage, base chance and action shifts without floating-point conversion. The disclosure remains for its distinct official explanation when a status name also appears in structured facts; numeric facts are not repeated inside the disclosure. The UI does not infer absent duration, per-bounce damage, multi-hit total, toughness, summon count or final status application chance.

## Accessibility and responsive layout

Skill options are native buttons with `aria-pressed`, visible focus and selected styling. Selecting a skill changes the local panel without navigation, focus transfer or automatic scrolling. Phase tabs retain the existing `tablist`/`tab`/`tabpanel` model, roving tab stop and Arrow/Home/End keyboard controls. Desktop uses a selector/detail grid with a sticky detail pane within the browser region and no nested scroll area. At 820px and below the layout stacks vertically; detailed mobile selection refinement remains for Phase 3.

The enemy-only anchor ID helper, phase reference links, jump arrows and shared full-card component were removed. Phase reference records remain for phase membership but no longer carry `href`. Generic anchors elsewhere are untouched. Skill URL synchronization is intentionally deferred.

## Site messages

Both `zh-CN` and `en` add the same keys: `enemy_skill_damage_multiplier`, `enemy_skill_attack_ratio`, `enemy_skill_target`, `enemy_skill_target_primary`, `enemy_skill_target_adjacent`, `enemy_skill_target_all`, `enemy_skill_target_each_swept`, `enemy_skill_target_enemy_ally`, `enemy_skill_target_marked`, `enemy_skill_target_other_marked`, `enemy_skill_target_self`, `enemy_skill_bounce_count`, `enemy_skill_status`, `enemy_skill_status_buff`, `enemy_skill_status_debuff`, `enemy_skill_status_other`, `enemy_skill_base_chance`, `enemy_skill_duration`, `enemy_skill_turn_one`, `enemy_skill_turn_other`, `enemy_skill_action_advance`, `enemy_skill_action_delay`, `enemy_skill_effect`, `enemy_skill_trigger_dot`, `enemy_skill_clear_dot`, and `enemy_skill_possible_summons`.

## Verification

Node 24.19.0 was used for 27 focused Vitest tests across `enemy-detail` and `enemy-skill-browser`; all passed. Targeted Prettier and ESLint passed. `pnpm check` passed with zero Svelte errors or warnings. `pnpm build` completed, including data/asset ensures and static prerendering. The generated `1002030`, `3003051`, `4064012` and English `4013010` pages contain the new browser and initial detail, with no `#enemy-skill-` anchors. The source data for `401401207` supplies bounce count only, and its detail component has no path to synthesize damage.

The focused Playwright spec was updated for selection, phase filtering, Monster-specific ratio changes, facts, omission cases, summons, ExtraEffects, locale links, keyboard focus and responsive columns. Browser execution did not complete on this host: a 30-test parallel attempt surfaced an unrelated old summon-card text assertion, then stalled; a five-test two-worker attempt and a single-test one-worker attempt also stalled after browser startup despite a reachable preview server. The obsolete text assertion was replaced by existing semantic card structure checks. Browser outcomes remain unverified and should be rerun on a responsive browser host with `PLAYWRIGHT_REUSE_BUILD=1` and one or two workers. Manually verify one phase change, one Monster variant ratio change, selection focus, and the 390px layout there.

## Phase 3 handoff

Refine mobile selection, screen-reader announcements, deep links, site-message wording and any visual adjustments found in live browser review. No battle simulation or parser expansion was started here.
