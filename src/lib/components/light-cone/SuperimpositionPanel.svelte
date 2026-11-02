<script lang="ts">
  import LevelSlider from '$lib/components/shared/LevelSlider.svelte';
  import GameText from '$lib/components/shared/GameText.svelte';
  import DescriptionText from '$lib/components/shared/DescriptionText.svelte';
  import type { LightConePassiveSkill } from '$lib/domain/types';
  import * as m from '$lib/paraglide/messages.js';

  export let passive: LightConePassiveSkill;
  export let lightConeId: string;
  export let initialRank: number | undefined = undefined;

  $: effect = passive.superimposition;
  let selectedIndex = Math.max(
    0,
    passive.superimposition.levels.findIndex(({ level }) => level === initialRank)
  );
  $: maxIndex = Math.max(0, effect.levels.length - 1);
  $: if (selectedIndex > maxIndex) selectedIndex = maxIndex;
  $: selected = effect.levels[selectedIndex];
</script>

<div class="superimposition-panel">
  {#if selected}
    {#if effect.levels.length > 1}<LevelSlider
        id={`superimposition-level-${lightConeId}`}
        label={m.superimposition_level()}
        bind:value={selectedIndex}
        min={0}
        max={maxIndex}
        step={1}
        displayValue={selected.level}
        ariaValueMin={effect.levels[0].level}
        ariaValueMax={effect.levels[maxIndex].level}
      />{:else}<small>{m.superimposition_fixed_level({ level: selected.level })}</small>{/if}
    <div class="superimposition-effect">
      <h3 class="superimposition-effect__name"><GameText text={passive.name} /></h3>
      {#if selected.descriptionTokens.length}<p class="levelled-description">
          <DescriptionText tokens={selected.descriptionTokens} />
        </p>{:else}<p class="data-placeholder">
          {m.superimposition_description_unavailable()}
        </p>{/if}
    </div>
  {:else}
    <p class="data-placeholder">{m.levels_unavailable()}</p>
  {/if}
</div>
