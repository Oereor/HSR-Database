<script lang="ts">
  import { getCharacterPortraitUrl } from '$lib/data/visual-assets';

  export let characterId: string;
  export let onAvailabilityChange: (available: boolean) => void = () => undefined;

  let failedSource: string | undefined;
  $: source = getCharacterPortraitUrl(characterId);
  $: visibleSource = source && source !== failedSource ? source : undefined;
  $: onAvailabilityChange(!!visibleSource);
</script>

{#if visibleSource}<div class="character-portrait" data-character-portrait={characterId}>
    <img
      src={visibleSource}
      alt=""
      aria-hidden="true"
      width="960"
      height="960"
      decoding="async"
      on:error={() => (failedSource = visibleSource)}
    />
  </div>{/if}
