<script lang="ts">
  import GameText from '$lib/components/GameText.svelte';
  import type { SkillCombatMeta } from '$lib/domain/types';

  export let meta: SkillCombatMeta;

  const formatNumber = (value: number) =>
    new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 10 }).format(value);
  const formatDelta = (value: number) => `${value > 0 ? '+' : ''}${formatNumber(value)}`;
  const stanceLabels = { single: '单攻', aoe: '群攻', blast: '扩散' } as const;
  $: stanceDisplay = (meta.stanceDisplay ?? []).filter(
    (stance) => Number.isFinite(stance.value) && stance.value > 0
  );
  $: hasStanceDisplay = stanceDisplay.length > 0;
  $: hasRows =
    !!meta.specialResource ||
    meta.battlePointDelta !== undefined ||
    meta.energyGain !== undefined ||
    hasStanceDisplay ||
    (!hasStanceDisplay && meta.toughnessDamage !== undefined);
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
    {#if hasStanceDisplay}<div data-combat-meta="toughness-damage">
        <dt>削韧值</dt>
        <dd class="stance-display">
          {#each stanceDisplay as stance (stance.type)}
            <span data-stance-display={stance.type}
              >{stanceLabels[stance.type]}：{formatNumber(stance.value)}</span
            >
          {/each}
        </dd>
      </div>{:else if meta.toughnessDamage !== undefined}<div data-combat-meta="toughness-damage">
        <dt>削韧值</dt>
        <dd>{formatNumber(meta.toughnessDamage)}</dd>
      </div>{/if}
  </dl>{/if}
