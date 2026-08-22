<script lang="ts">
  import type { DescriptionToken } from '$lib/domain/types';
  import InlineGameTextToken from '$lib/components/InlineGameTextToken.svelte';
  import { segmentSpecialEffectTriggers } from '$lib/domain/special-effects-presentation';

  export let tokens: DescriptionToken[] = [];
  export let specialEffectsAvailable = false;
  export let specialEffectIconUrl: string | undefined = undefined;
  export let onOpenSpecialEffects: ((trigger: HTMLButtonElement) => void) | undefined = undefined;

  $: segments = segmentSpecialEffectTriggers(
    tokens,
    specialEffectsAvailable && !!onOpenSpecialEffects
  );
</script>

{#each segments as segment}
  {#if segment.kind === 'special-effect-trigger'}<button
      type="button"
      class="special-effect-trigger"
      aria-label="查看特殊效果"
      on:click={(event) => onOpenSpecialEffects?.(event.currentTarget)}
      >{#each segment.tokens as token}<InlineGameTextToken
          {token}
          iconUrl={specialEffectIconUrl}
        />{/each}</button
    >{:else}{#each segment.tokens as token}<InlineGameTextToken {token} />{/each}{/if}
{/each}
