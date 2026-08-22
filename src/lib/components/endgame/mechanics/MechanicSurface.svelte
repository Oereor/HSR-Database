<script lang="ts">
  import GameText from '$lib/components/GameText.svelte';

  export let title: string | undefined = undefined;
  export let description: string | undefined = undefined;
</script>

<article class="endgame-mechanic-surface">
  {#if title}<h3><GameText text={title} /></h3>{/if}
  {#if description}<p><GameText text={description} /></p>{/if}
  <slot />
</article>
