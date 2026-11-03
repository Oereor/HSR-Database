<script lang="ts">
  import './slider.css';
  import { onMount } from 'svelte';
  import DescriptionText from '$lib/components/shared/DescriptionText.svelte';
  import GameText from '$lib/components/shared/GameText.svelte';
  import { descriptionCases, specialEffectTokens } from '../description-text';

  let hydrated = $state(false);
  let openCount = $state(0);
  let triggerTag = $state('');
  onMount(() => {
    hydrated = true;
  });
</script>

<div data-description-fixture data-hydrated={hydrated}>
  {#each descriptionCases as item (item.id)}
    <p data-description-case={item.id} class="levelled-description">
      <DescriptionText tokens={item.tokens} />
    </p>
    <p data-game-text-case={item.id}><GameText text={item.text} /></p>
  {/each}
  <p data-special-effect class="levelled-description">
    <DescriptionText
      tokens={specialEffectTokens}
      specialEffectsAvailable
      onOpenSpecialEffects={(trigger) => {
        openCount++;
        triggerTag = trigger.tagName;
      }}
    />
  </p>
  <output data-open-count>{openCount}</output>
  <output data-trigger-tag>{triggerTag}</output>
</div>

<style>
  p {
    width: 1200px;
    margin: 0;
    font-size: 16px;
    line-height: 24px;
  }
</style>
