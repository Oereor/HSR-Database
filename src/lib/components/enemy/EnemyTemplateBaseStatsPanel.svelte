<script lang="ts">
  import { internalStanceToToughness } from '$lib/domain/decimal';
  import { formatRatioPercentage, formatRoundedDecimal } from '$lib/domain/endgame-view';
  import type { DecimalString } from '$lib/domain/endgame';
  import type { EnemyTemplateBaseStats } from '$lib/domain/types';
  import * as m from '$lib/paraglide/messages.js';
  import StatList from '$lib/components/shared/StatList.svelte';
  import StatRow from '$lib/components/shared/StatRow.svelte';

  export let baseStats: EnemyTemplateBaseStats;

  type StatValue = { value: string; tone: 'default' | 'unavailable' };
  const unavailable = (): StatValue => ({
    value: m.common_data_unavailable(),
    tone: 'unavailable'
  });
  const numeric = (value: DecimalString | undefined): StatValue =>
    value === undefined ? unavailable() : { value: formatRoundedDecimal(value), tone: 'default' };
  const toughness = (value: DecimalString | undefined): StatValue => {
    if (value === undefined) return unavailable();
    const converted = internalStanceToToughness(value);
    return numeric(converted);
  };
  const percentage = (value: DecimalString | undefined): StatValue =>
    value === undefined ? unavailable() : { value: formatRatioPercentage(value), tone: 'default' };

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
  <StatList ariaLabel={m.enemy_template_stats_aria()}>
    {#each rows as row (row[0])}
      <StatRow data-enemy-template-stat={row[0]} label={row[1]} {...row[2]} />
    {/each}
  </StatList>
</div>

<style>
  .enemy-template-stats-panel h2 {
    margin: 0;
    font-size: var(--font-section-title);
    line-height: 1.2;
  }
</style>
