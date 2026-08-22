<script lang="ts">
  import { getCharacterPreviewUrl } from '$lib/data/visual-assets';
  import { resolveSpecialEffectLinkedAvatarPresentation } from '$lib/domain/special-effects-presentation';
  import type { CatalogEntry, CharacterSpecialEffectEntry } from '$lib/domain/types';

  export let entry: CharacterSpecialEffectEntry;
  export let targets: CatalogEntry[] = [];
  export let ownerCharacterId: string;

  $: targetById = new Map(targets.map((target) => [target.id, target]));
  const hideBrokenImage = (event: Event) => {
    (event.currentTarget as HTMLImageElement).hidden = true;
  };
</script>

<div
  class="special-effect-relation"
  data-special-effect-kind={entry.kind}
  data-special-effect-order={entry.kind === 'servant-skill-link' ? entry.order : undefined}
>
  {#if entry.kind === 'servant-skill-link'}
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
      {#if getCharacterPreviewUrl(presentation.displayAvatarId)}<img
          src={getCharacterPreviewUrl(presentation.displayAvatarId)}
          alt=""
          width="48"
          height="48"
          decoding="async"
          on:error={hideBrokenImage}
        />{/if}
      <span><small>献予</small><strong>{presentation.displayName}</strong></span>
    </div>
  {:else}
    <span class="special-effect-relation__label">关联角色</span>
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
          {#if getCharacterPreviewUrl(presentation.displayAvatarId)}<img
              src={getCharacterPreviewUrl(presentation.displayAvatarId)}
              alt=""
              width="40"
              height="40"
              decoding="async"
              on:error={hideBrokenImage}
            />{/if}
          <strong>{presentation.displayName}</strong>
        </span>
      {/each}
    </div>
  {/if}
</div>
