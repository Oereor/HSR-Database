<script lang="ts">
  import GameText from '$lib/components/GameText.svelte';
  import type { SkillCombatMeta } from '$lib/domain/types';
  import { getLocale } from '$lib/paraglide/runtime.js';
  import * as m from '$lib/paraglide/messages.js';

  export let meta: SkillCombatMeta;

  const formatNumber = (value: number) =>
    new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 10 }).format(value);
  const formatDelta = (value: number) => `${value > 0 ? '+' : ''}${formatNumber(value)}`;
  const stanceLabels = {
    single: m.skill_stance_single(),
    aoe: m.skill_stance_aoe(),
    blast: m.skill_stance_blast()
  } as const;
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

{#if hasRows}<dl class="skill-combat-meta" aria-label={m.skill_combat_meta()}>
    {#if meta.specialResource}<div data-combat-meta="special-resource">
        <dt>{m.skill_cost()}</dt>
        <dd><GameText text={meta.specialResource} /></dd>
      </div>{/if}
    {#if meta.battlePointDelta !== undefined}<div data-combat-meta="battle-point">
        <dt>{m.skill_point()}</dt>
        <dd>{formatDelta(meta.battlePointDelta)}</dd>
      </div>{/if}
    {#if meta.energyGain !== undefined}<div data-combat-meta="energy-gain">
        <dt>{m.skill_energy_regen()}</dt>
        <dd>{formatNumber(meta.energyGain)}</dd>
      </div>{/if}
    {#if hasStanceDisplay}<div data-combat-meta="toughness-damage">
        <dt>{m.skill_toughness_damage()}</dt>
        <dd class="stance-display">
          {#each stanceDisplay as stance (stance.type)}
            <span data-stance-display={stance.type}
              >{stanceLabels[stance.type]}：{formatNumber(stance.value)}</span
            >
          {/each}
        </dd>
      </div>{:else if meta.toughnessDamage !== undefined}<div data-combat-meta="toughness-damage">
        <dt>{m.skill_toughness_damage()}</dt>
        <dd>{formatNumber(meta.toughnessDamage)}</dd>
      </div>{/if}
  </dl>{/if}
