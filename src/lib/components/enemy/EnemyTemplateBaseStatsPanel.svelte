<script lang="ts">
  import { internalStanceToToughness } from '$lib/domain/decimal';
  import { formatRatioPercentage, formatRoundedDecimal } from '$lib/domain/endgame-view';
  import type { DecimalString } from '$lib/domain/endgame';
  import type { EnemyTemplateBaseStats } from '$lib/domain/types';

  export let baseStats: EnemyTemplateBaseStats;

  const unavailable = '资料未提供';
  const numeric = (value: DecimalString | undefined): string =>
    value === undefined ? unavailable : formatRoundedDecimal(value);
  const toughness = (value: DecimalString | undefined): string => {
    if (value === undefined) return unavailable;
    const converted = internalStanceToToughness(value);
    return converted === undefined ? unavailable : formatRoundedDecimal(converted);
  };
  const percentage = (value: DecimalString | undefined): string =>
    value === undefined ? unavailable : formatRatioPercentage(value);

  $: rows = [
    ['hp', '基础生命值', numeric(baseStats.hp)],
    ['attack', '基础攻击力', numeric(baseStats.attack)],
    ['defence', '基础防御力', numeric(baseStats.defence)],
    ['speed', '基础速度', numeric(baseStats.speed)],
    ['toughness', '基础韧性值', toughness(baseStats.stance)],
    ['critical-damage', '基础暴击伤害', percentage(baseStats.criticalDamage)],
    ['effect-resistance', '基础效果抵抗', percentage(baseStats.effectResistance)]
  ] as const;
</script>

<div class="enemy-template-stats-panel">
  <h2>基础数据</h2>
  <dl class="inspection-stat-list" aria-label="Enemy Template 基础数据">
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
