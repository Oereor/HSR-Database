<script lang="ts">
  import {
    getEnemyStatsAtLevel,
    type EnemyStatCompactValue,
    type EnemyStatProgressionCompact
  } from '$lib/domain/enemy-view';
  import { formatRatioPercentage, formatRoundedDecimal } from '$lib/domain/endgame-view';
  import * as m from '$lib/paraglide/messages.js';

  export let progression: EnemyStatProgressionCompact;
  export let level: number;

  $: row = getEnemyStatsAtLevel(progression, level);

  const integer = (value: EnemyStatCompactValue): string =>
    value === null ? m.common_data_unavailable() : formatRoundedDecimal(value);
  const percent = (value: EnemyStatCompactValue): string =>
    value === null ? m.common_data_unavailable() : formatRatioPercentage(value);

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
