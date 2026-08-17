<script lang="ts">
  import type { EnemyStatProgression, EnemyStatValue } from '$lib/domain/types';
  import { formatRoundedDecimal } from '$lib/domain/endgame-view';

  export let progression: EnemyStatProgression;
  export let controlId: string;

  let level = progression.defaultLevel;
  $: row = progression.levels.find((candidate) => candidate.level === Number(level));

  const integer = (value: EnemyStatValue): string =>
    value.status === 'resolved' ? formatRoundedDecimal(value.value) : '资料未提供';
  const percent = (value: EnemyStatValue): string =>
    value.status === 'resolved'
      ? `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(Number(value.value) * 100)}%`
      : '资料未提供';

  $: stats = row
    ? [
        ['hp', '生命值', integer(row.hp)],
        ['attack', '攻击力', integer(row.attack)],
        ['defence', '防御力', integer(row.defence)],
        ['speed', '速度', integer(row.speed)],
        ['toughness', '韧性', integer(row.toughness)],
        ['effect-hit', '效果命中', percent(row.effectHit)],
        ['effect-resistance', '效果抵抗', percent(row.effectResistance)]
      ]
    : [];
</script>

<div class="enemy-stats-panel">
  <div class="skill-level-control enemy-level-control">
    <div>
      <label for={controlId}>敌人等级</label><output for={controlId}>Lv.{level}</output>
    </div>
    <input
      id={controlId}
      type="range"
      min={progression.minLevel}
      max={progression.maxLevel}
      step="1"
      bind:value={level}
      aria-valuetext={`等级 ${level}`}
    />
    <div class="skill-level-range" aria-hidden="true">
      <span>Lv.{progression.minLevel}</span><span>Lv.{progression.maxLevel}</span>
    </div>
  </div>
  <dl class="enemy-stats-list" aria-label={`Lv.${level} 敌人基础属性`}>
    {#each stats as stat (stat[0])}
      <div class="enemy-stat-row" data-enemy-stat={stat[0]}>
        <dt>{stat[1]}</dt>
        <dd><strong>{stat[2]}</strong></dd>
      </div>
    {/each}
  </dl>
</div>
