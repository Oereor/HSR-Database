<script lang="ts">
  import GameText from '$lib/components/GameText.svelte';
  import type { SkillCombatMeta } from '$lib/domain/types';

  export let meta: SkillCombatMeta;

  const formatNumber = (value: number) =>
    new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 10 }).format(value);
  const formatDelta = (value: number) => `${value > 0 ? '+' : ''}${formatNumber(value)}`;
  $: hasRows =
    !!meta.specialResource ||
    meta.battlePointDelta !== undefined ||
    meta.energyGain !== undefined ||
    meta.toughnessDamage !== undefined;
</script>

{#if hasRows}<dl class="skill-combat-meta" aria-label="战斗元数据">
    {#if meta.specialResource}<div data-combat-meta="special-resource">
        <dt>技能消耗</dt>
        <dd><GameText text={meta.specialResource} /></dd>
      </div>{/if}
    {#if meta.battlePointDelta !== undefined}<div data-combat-meta="battle-point">
        <dt>战技点</dt>
        <dd>{formatDelta(meta.battlePointDelta)}</dd>
      </div>{/if}
    {#if meta.energyGain !== undefined}<div data-combat-meta="energy-gain">
        <dt>能量恢复</dt>
        <dd>{formatNumber(meta.energyGain)}</dd>
      </div>{/if}
    {#if meta.toughnessDamage !== undefined}<div data-combat-meta="toughness-damage">
        <dt>削韧值</dt>
        <dd>{formatNumber(meta.toughnessDamage)}</dd>
      </div>{/if}
  </dl>{/if}
