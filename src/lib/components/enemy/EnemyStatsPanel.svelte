<script lang="ts">
  import type { EnemyStatProgression, EnemyStatValue } from '$lib/domain/types';
  import { formatRatioPercentage, formatRoundedDecimal } from '$lib/domain/endgame-view';
  import * as m from '$lib/paraglide/messages.js';

  export let progression: EnemyStatProgression;
  export let level: number;

  $: row = progression.levels.find((candidate) => candidate.level === Number(level));

  const integer = (value: EnemyStatValue): string =>
    value.status === 'resolved' ? formatRoundedDecimal(value.value) : m.common_data_unavailable();
  const percent = (value: EnemyStatValue): string =>
    value.status === 'resolved' ? formatRatioPercentage(value.value) : m.common_data_unavailable();

  $: stats = row
    ? [
        ['hp', m.common_hp(), integer(row.hp)],
        ['attack', m.common_attack(), integer(row.attack)],
        ['defence', m.common_defence(), integer(row.defence)],
        ['speed', m.common_speed(), integer(row.speed)],
        ['toughness', m.enemy_toughness(), integer(row.toughness)],
        ['effect-hit', m.enemy_effect_hit(), percent(row.effectHit)],
        ['effect-resistance', m.enemy_effect_resistance(), percent(row.effectResistance)]
      ]
    : [];
</script>

<div class="enemy-stats-panel">
  <dl class="enemy-stats-list" aria-label={m.enemy_actual_stats_aria({ level })}>
    {#each stats as stat (stat[0])}
      <div class="enemy-stat-row" data-enemy-stat={stat[0]}>
        <dt>{stat[1]}</dt>
        <dd><strong>{stat[2]}</strong></dd>
      </div>
    {/each}
  </dl>
</div>
