<script lang="ts">
  import type { LevelledDescription } from '$lib/domain/types';

  export let levels: LevelledDescription[];
  export let controlId: string;
  export let controlLabel: string;
  export let emptyDescription: string;
  export let defaultLevel: number | undefined = undefined;

  let selectedIndex = Math.max(
    0,
    defaultLevel === undefined
      ? levels.length - 1
      : levels.findIndex((level) => level.level === defaultLevel)
  );
  $: maxIndex = Math.max(0, levels.length - 1);
  $: if (selectedIndex > maxIndex) selectedIndex = maxIndex;
  $: selected = levels[selectedIndex];
</script>

{#if selected}
  {#if selected.descriptionTokens.length}
    <p class="levelled-description">
      {#each selected.descriptionTokens as token}<span
          class:scaling-value={token.type === 'scaling-value'}>{token.value}</span
        >{/each}
    </p>
  {:else}
    <p class="data-placeholder">{emptyDescription}</p>
  {/if}
  {#if levels.length > 1}
    <div class="skill-level-control">
      <div>
        <label for={controlId}>{controlLabel}</label>
        <output for={controlId}>Lv.{selected.level}</output>
      </div>
      <input
        id={controlId}
        type="range"
        min="0"
        max={maxIndex}
        step="1"
        bind:value={selectedIndex}
        aria-valuemin={levels[0].level}
        aria-valuemax={levels[maxIndex].level}
        aria-valuenow={selected.level}
        aria-valuetext={`等级 ${selected.level}`}
      />
      <div class="skill-level-range" aria-hidden="true">
        <span>Lv.{levels[0].level}</span>
        <span>Lv.{levels[maxIndex].level}</span>
      </div>
    </div>
  {:else}
    <small>固定等级 Lv.{selected.level}</small>
  {/if}
{:else}
  <p class="data-placeholder">上游未提供等级记录。</p>
{/if}
