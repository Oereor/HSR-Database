<script lang="ts">
  import GameText from '$lib/components/GameText.svelte';
  import DescriptionText from '$lib/components/DescriptionText.svelte';
  import type { LightConePassiveSkill } from '$lib/domain/types';

  export let passive: LightConePassiveSkill;
  export let lightConeId: string;

  $: effect = passive.superimposition;
  let selectedIndex = 0;
  $: maxIndex = Math.max(0, effect.levels.length - 1);
  $: if (selectedIndex > maxIndex) selectedIndex = maxIndex;
  $: selected = effect.levels[selectedIndex];
</script>

<div class="superimposition-panel">
  {#if selected}
    {#if effect.levels.length > 1}<div class="skill-level-control superimposition-control">
        <div>
          <label for={`superimposition-level-${lightConeId}`}>叠影等级</label>
          <output for={`superimposition-level-${lightConeId}`}>Lv.{selected.level}</output>
        </div>
        <input
          id={`superimposition-level-${lightConeId}`}
          type="range"
          min="0"
          max={maxIndex}
          step="1"
          bind:value={selectedIndex}
          aria-valuemin={effect.levels[0].level}
          aria-valuemax={effect.levels[maxIndex].level}
          aria-valuenow={selected.level}
          aria-valuetext={`等级 ${selected.level}`}
        />
        <div class="skill-level-range" aria-hidden="true">
          <span>Lv.{effect.levels[0].level}</span>
          <span>Lv.{effect.levels[maxIndex].level}</span>
        </div>
      </div>{:else}<small>固定等级 Lv.{selected.level}</small>{/if}
    <div class="superimposition-effect">
      <h3><GameText text={passive.name} /></h3>
      {#if selected.descriptionTokens.length}<p class="levelled-description">
          <DescriptionText tokens={selected.descriptionTokens} />
        </p>{:else}<p class="data-placeholder">上游原始数据未提供该叠影描述。</p>{/if}
    </div>
  {:else}
    <p class="data-placeholder">上游未提供等级记录。</p>
  {/if}
</div>
