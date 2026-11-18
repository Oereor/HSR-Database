<script lang="ts">
  import AssetImage from '$lib/components/shared/AssetImage.svelte';
  import GameText from '$lib/components/shared/GameText.svelte';
  import { getCharacterIconUrl } from '$lib/data/visual-assets';
  import { resolveSpecialEffectLinkedAvatarPresentation } from '$lib/domain/special-effects-presentation';
  import type { TrailblazerGender } from '$lib/domain/trailblazer';
  import type { CatalogEntry, CharacterSpecialEffectEntry } from '$lib/domain/types';
  import * as m from '$lib/paraglide/messages.js';
  import { localizedHref } from '$lib/i18n/routing';

  export let entry: CharacterSpecialEffectEntry;
  export let targets: CatalogEntry[] = [];
  export let trailblazerPreference: TrailblazerGender | undefined = undefined;

  $: targetById = new Map(targets.map((target) => [target.id, target]));
</script>

{#snippet target(avatarId: string, kind: CharacterSpecialEffectEntry['kind'])}
  {@const servant = kind === 'servant-skill-link'}
  {@const series = kind === 'series-skill-link'}
  {@const presentation = resolveSpecialEffectLinkedAvatarPresentation({
    sourceAvatarId: avatarId,
    targets: targetById,
    trailblazerPreference
  })}
  {@const link = trailblazerPreference !== undefined || series}
  <svelte:element
    this={link ? 'a' : servant ? 'div' : 'span'}
    class="special-effect-target focus-visible:ring-ring rounded-sm no-underline hover:no-underline focus-visible:ring-2"
    href={link ? localizedHref(`/characters/${presentation.displayAvatarId}/`) : undefined}
    data-linked-avatar-id={presentation.sourceAvatarId}
    data-display-avatar-id={presentation.displayAvatarId}
  >
    <AssetImage
      src={getCharacterIconUrl(presentation.displayAvatarId)}
      alt=""
      width={servant ? '48' : '40'}
      height={servant ? '48' : '40'}
      decoding="async"
      fallbackClass="special-effect-target__fallback"
    />
    {#if servant}
      <span
        ><small>{m.special_effect_given_to()}</small><strong
          ><GameText text={presentation.displayName} /></strong
        ></span
      >
    {:else}
      <strong><GameText text={presentation.displayName} /></strong>
    {/if}
  </svelte:element>
{/snippet}

<div
  class="special-effect-relation"
  data-special-effect-kind={entry.kind}
  data-special-effect-order={entry.kind === 'servant-skill-link' ? entry.order : undefined}
>
  {#if entry.kind === 'avatar-skill-link'}
    <span class="special-effect-relation__label">{m.special_effect_related_character()}</span>
    <div class="special-effect-target-list">
      {#each entry.linkedAvatarIds as avatarId (avatarId)}
        {@render target(avatarId, entry.kind)}
      {/each}
    </div>
  {:else}
    {@render target(entry.linkedAvatarId, entry.kind)}
  {/if}
</div>
