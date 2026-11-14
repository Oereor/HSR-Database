<script lang="ts">
  import ArrowUpRightIcon from '@lucide/svelte/icons/arrow-up-right';
  import type { DescriptionToken } from '$lib/domain/types';
  import { groupGameTextRuby } from '$lib/domain/game-text';
  import InlineGameTextToken from '$lib/components/shared/InlineGameTextToken.svelte';
  import GameTextRuby from '$lib/components/shared/GameTextRuby.svelte';
  import { segmentSpecialEffectTriggers } from '$lib/domain/special-effects-presentation';
  import { m } from '$lib/paraglide/messages.js';

  export let characterAccent: string | undefined = undefined;
  export let tokens: DescriptionToken[] = [];
  export let specialEffectsAvailable = false;
  export let specialEffectIconUrl: string | undefined = undefined;
  export let onOpenSpecialEffects: ((trigger: HTMLButtonElement) => void) | undefined = undefined;
  export let onOpenSeriesEffects:
    | ((
        trigger: HTMLButtonElement,
        reference: NonNullable<DescriptionToken['interaction']>
      ) => void)
    | undefined = undefined;

  $: segments = segmentSpecialEffectTriggers(
    tokens,
    specialEffectsAvailable && !!onOpenSpecialEffects
  ).map((segment) => ({ ...segment, groups: groupGameTextRuby(segment.tokens) }));
</script>

{#snippet renderToken(token: DescriptionToken, isSpecialEffect: boolean)}
  {#if !isSpecialEffect && token.type === 'interaction' && token.interaction && onOpenSeriesEffects}<button
      type="button"
      class="text-primary inline-flex cursor-pointer items-center gap-1 whitespace-nowrap"
      aria-haspopup="dialog"
      data-series-skill-reference={token.interaction.skillId}
      on:click={(event) => onOpenSeriesEffects?.(event.currentTarget, token.interaction!)}
      ><span class="underline underline-offset-4"
        ><InlineGameTextToken {token} {characterAccent} /></span
      ><ArrowUpRightIcon class="size-4 shrink-0" aria-hidden="true" /></button
    >{:else}<InlineGameTextToken
      {token}
      {characterAccent}
      iconUrl={isSpecialEffect ? specialEffectIconUrl : undefined}
    />{/if}
{/snippet}

{#snippet renderGroups(segment: (typeof segments)[number])}
  {#each segment.groups as group}{#if 'ruby' in group}<GameTextRuby
        annotation={group.ruby.annotation}
        >{#each group.tokens as token}{@render renderToken(
            token,
            segment.kind === 'special-effect-trigger'
          )}{/each}</GameTextRuby
      >{:else}{@render renderToken(
        group.token,
        segment.kind === 'special-effect-trigger'
      )}{/if}{/each}
{/snippet}

<span class="game-text" style:--character-accent={characterAccent}>
  {#each segments as segment}
    {#if segment.kind === 'special-effect-trigger'}<button
        type="button"
        class="special-effect-trigger"
        aria-label={m.special_effect_view()}
        on:click={(event) => onOpenSpecialEffects?.(event.currentTarget)}
        >{@render renderGroups(segment)}</button
      >{:else}{@render renderGroups(segment)}{/if}
  {/each}
</span>
