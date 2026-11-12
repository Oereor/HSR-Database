<script lang="ts">
  import AssetImage from '$lib/components/shared/AssetImage.svelte';
  import GameText from '$lib/components/shared/GameText.svelte';
  import { getCharacterIconUrl } from '$lib/data/visual-assets';
  import { resolveSpecialEffectLinkedAvatarPresentation } from '$lib/domain/special-effects-presentation';
  import type { CatalogEntry, CharacterSpecialEffectEntry } from '$lib/domain/types';
  import * as m from '$lib/paraglide/messages.js';
  import { localizedHref } from '$lib/i18n/routing';

  export let entry: CharacterSpecialEffectEntry;
  export let targets: CatalogEntry[] = [];
  export let ownerCharacterId: string;

  $: targetById = new Map(targets.map((target) => [target.id, target]));
</script>

<div
  class="special-effect-relation"
  data-special-effect-kind={entry.kind}
  data-special-effect-order={entry.kind === 'servant-skill-link' ? entry.order : undefined}
>
  {#if entry.kind === 'series-skill-link'}
    {@const target = targetById.get(entry.linkedAvatarId)}
    <a
      class="special-effect-target group focus-visible:ring-ring rounded-sm no-underline outline-none hover:no-underline focus-visible:ring-2 focus-visible:ring-offset-2"
      href={localizedHref(`/characters/${entry.linkedAvatarId}/`)}
      data-linked-avatar-id={entry.linkedAvatarId}
    >
      <AssetImage
        src={getCharacterIconUrl(entry.linkedAvatarId)}
        alt=""
        width="40"
        height="40"
        fallbackClass="special-effect-target__fallback"
      />
      <strong
        class="text-foreground group-hover:text-primary group-focus-visible:text-primary transition-colors"
        ><GameText text={target?.name ?? ''} /></strong
      >
    </a>
  {:else if entry.kind === 'servant-skill-link'}
    {@const target = targetById.get(entry.linkedAvatarId)}
    {@const presentation = resolveSpecialEffectLinkedAvatarPresentation({
      ownerCharacterId,
      entryKind: entry.kind,
      sourceAvatarId: entry.linkedAvatarId,
      sourceTarget: target
    })}
    <div
      class="special-effect-target"
      data-linked-avatar-id={presentation.sourceAvatarId}
      data-display-avatar-id={presentation.displayAvatarId}
    >
      <AssetImage
        src={getCharacterIconUrl(presentation.displayAvatarId)}
        alt=""
        width="48"
        height="48"
        decoding="async"
        fallbackClass="special-effect-target__fallback"
      />
      <span
        ><small>{m.special_effect_given_to()}</small><strong
          ><GameText text={presentation.displayName} /></strong
        ></span
      >
    </div>
  {:else}
    <span class="special-effect-relation__label">{m.special_effect_related_character()}</span>
    <div class="special-effect-target-list">
      {#each entry.linkedAvatarIds as avatarId (avatarId)}
        {@const target = targetById.get(avatarId)}
        {@const presentation = resolveSpecialEffectLinkedAvatarPresentation({
          ownerCharacterId,
          entryKind: entry.kind,
          sourceAvatarId: avatarId,
          sourceTarget: target
        })}
        <span
          class="special-effect-target"
          data-linked-avatar-id={presentation.sourceAvatarId}
          data-display-avatar-id={presentation.displayAvatarId}
        >
          <AssetImage
            src={getCharacterIconUrl(presentation.displayAvatarId)}
            alt=""
            width="40"
            height="40"
            decoding="async"
            fallbackClass="special-effect-target__fallback"
          />
          <strong><GameText text={presentation.displayName} /></strong>
        </span>
      {/each}
    </div>
  {/if}
</div>
