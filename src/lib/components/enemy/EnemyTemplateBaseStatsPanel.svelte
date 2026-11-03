<script lang="ts">
  import { internalStanceToToughness } from '$lib/domain/decimal';
  import { formatRatioPercentage, formatRoundedDecimal } from '$lib/domain/endgame-view';
  import type { DecimalString } from '$lib/domain/endgame';
  import type { EnemyTemplateBaseStats } from '$lib/domain/types';
  import * as m from '$lib/paraglide/messages.js';
  import SectionHeading from '$lib/components/shared/SectionHeading.svelte';
  import StatList from '$lib/components/shared/StatList.svelte';
  import StatRow from '$lib/components/shared/StatRow.svelte';

  export let baseStats: EnemyTemplateBaseStats;

  const numeric = (value: DecimalString | undefined): string =>
    value === undefined ? '-' : formatRoundedDecimal(value);
  const toughness = (value: DecimalString | undefined): string =>
    numeric(value === undefined ? undefined : internalStanceToToughness(value));
  const percentage = (value: DecimalString | undefined): string =>
    value === undefined ? '-' : formatRatioPercentage(value);

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
  <SectionHeading level={2} headingLevel={2}>{m.enemy_stats_section()}</SectionHeading>
  <StatList ariaLabel={m.enemy_template_stats_aria()}>
    {#each rows as row (row[0])}
      <StatRow data-enemy-template-stat={row[0]} label={row[1]} value={row[2]} />
    {/each}
  </StatList>
</div>
