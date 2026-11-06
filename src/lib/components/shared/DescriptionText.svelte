<script lang="ts">
  import type { DescriptionToken } from '$lib/domain/types';
  import InlineGameTextToken from '$lib/components/shared/InlineGameTextToken.svelte';
  import { segmentSpecialEffectTriggers } from '$lib/domain/special-effects-presentation';
  import { m } from '$lib/paraglide/messages.js';

  export let characterAccent: string | undefined = undefined;
  export let tokens: DescriptionToken[] = [];
  export let specialEffectsAvailable = false;
  export let specialEffectIconUrl: string | undefined = undefined;
  export let onOpenSpecialEffects: ((trigger: HTMLButtonElement) => void) | undefined = undefined;

  $: segments = segmentSpecialEffectTriggers(
    tokens,
    specialEffectsAvailable && !!onOpenSpecialEffects
  );
</script>

<span class="game-text" style:--character-accent={characterAccent}>
  {#each segments as segment}
    {#if segment.kind === 'special-effect-trigger'}<button
        type="button"
        class="special-effect-trigger"
        aria-label={m.special_effect_view()}
        on:click={(event) => onOpenSpecialEffects?.(event.currentTarget)}
        >{#each segment.tokens as token}<InlineGameTextToken
            {token}
            {characterAccent}
            iconUrl={specialEffectIconUrl}
          />{/each}</button
      >{:else}{#each segment.tokens as token}<InlineGameTextToken
          {token}
          {characterAccent}
        />{/each}{/if}
  {/each}
</span>
