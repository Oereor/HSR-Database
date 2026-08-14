<script lang="ts">
  import type { EnemyOccurrenceView } from '$lib/domain/endgame-view';

  export let hp: EnemyOccurrenceView['hp'];

  $: labels = [
    hp.phaseCount && hp.phaseCount > 1 ? `${hp.phaseCount} 个阶段` : undefined,
    hp.mechanics.sharedHp ? '共享生命' : undefined,
    hp.mechanics.restoresHp ? '生命回复' : undefined,
    hp.mechanics.locksHp ? '锁血' : undefined,
    hp.mechanics.manipulatesHp ? '脚本生命操作' : undefined,
    hp.mechanics.hasSummons ? '召唤单位' : undefined
  ].filter(Boolean);
</script>

{#if hp.complex}
  <details class="hp-mechanics">
    <summary aria-label="查看生命值机制说明">ⓘ</summary>
    <div>
      <strong>生命值说明</strong>
      <p>
        每条生命值是配置中的单条血量；后方乘数是已声明的阶段数。阶段切换、共享生命、回复、锁血、召唤或其他脚本机制可能使实际击破所需伤害与简单相乘结果不同。
      </p>
      {#if labels.length}<p class="muted">已识别：{labels.join('、')}</p>{/if}
      <p class="muted">配置单条精确值：{hp.exactPerBar}</p>
      {#if hp.effectiveTotalHpStatus === 'runtime-unclear'}
        <p class="muted">静态配置无法可靠确定该单位的实际总生命值。</p>
      {/if}
    </div>
  </details>
{/if}
