<script lang="ts">
  import { getCharacterAvatarUrl } from '$lib/data/visual-assets';

  export let characterId: string;
  export let characterName: string;

  let failedSource: string | undefined;
  $: source = getCharacterAvatarUrl(characterId);
  $: visibleSource = source && source !== failedSource ? source : undefined;
</script>

<span class="character-avatar" data-character-avatar={characterId} data-missing={!visibleSource}>
  {#if visibleSource}
    <img
      src={visibleSource}
      alt=""
      width="128"
      height="128"
      loading="lazy"
      decoding="async"
      on:error={() => (failedSource = visibleSource)}
    />
  {:else}
    <span aria-hidden="true">{characterName.trim().slice(0, 1) || '轨'}</span>
  {/if}
</span>
