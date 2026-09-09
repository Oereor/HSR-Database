<script lang="ts">
  import { internalStanceToToughness } from '$lib/domain/decimal';
  import { formatRatioPercentage, formatRoundedDecimal } from '$lib/domain/endgame-view';
  import type { DecimalString } from '$lib/domain/endgame';
  import type { EnemyTemplateBaseStats } from '$lib/domain/types';
  import * as m from '$lib/paraglide/messages.js';

  export let baseStats: EnemyTemplateBaseStats;

  const unavailable = () => m.common_data_unavailable();
  const numeric = (value: DecimalString | undefined): string =>
    value === undefined ? unavailable() : formatRoundedDecimal(value);
  const toughness = (value: DecimalString | undefined): string => {
    if (value === undefined) return unavailable();
    const converted = internalStanceToToughness(value);
    return converted === undefined ? unavailable() : formatRoundedDecimal(converted);
  };
  const percentage = (value: DecimalString | undefined): string =>
    value === undefined ? unavailable() : formatRatioPercentage(value);

  $: rows = [
    ['hp', m.enemy_base_hp(), numeric(baseStats.hp)],
    ['attack', m.enemy_base_attack(), numeric(baseStats.attack)],
    ['defence', m.enemy_base_defence(), numeric(baseStats.defence)],
    ['speed', m.common_base_speed(), numeric(baseStats.speed)],
    ['toughness', m.enemy_base_toughness(), toughness(baseStats.stance)],
    ['critical-damage', m.enemy_base_critical_damage(), percentage(baseStats.criticalDamage)],
    ['effect-resistance', m.enemy_base_effect_resistance(), percentage(baseStats.effectResistance)],
    [
      'initial-action-value',
      m.enemy_initial_action_value(),
      percentage(baseStats.initialDelayRatio)
    ]
  ] as const;
</script>

<div class="enemy-template-stats-panel">
  <h2>{m.enemy_stats_section()}</h2>
  <dl class="inspection-stat-list" aria-label={m.enemy_template_stats_aria()}>
    {#each rows as row (row[0])}
      <div class="inspection-stat-row" data-enemy-template-stat={row[0]}>
        <dt>{row[1]}</dt>
        <dd><strong>{row[2]}</strong></dd>
      </div>
    {/each}
  </dl>
</div>

<style>
  .enemy-template-stats-panel h2 {
    margin: 0;
    font-size: var(--font-section-title);
    line-height: 1.2;
  }

  .enemy-template-stats-panel .inspection-stat-list {
    margin-top: 1.25rem;
  }
</style>
