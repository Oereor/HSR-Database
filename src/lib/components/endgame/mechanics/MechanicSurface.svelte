<script lang="ts">
  import GameText from '$lib/components/GameText.svelte';

  export let title: string | undefined = undefined;
  export let description: string | undefined = undefined;
  export let headingLevel: 2 | 3 | 4 = 3;
  export let accent = false;

  $: headingTag = `h${headingLevel}` as const;
</script>

<article class:endgame-mechanic-surface--accent={accent} class="endgame-mechanic-surface">
  {#if title}
    <svelte:element this={headingTag} class="endgame-mechanic-surface__title">
      <GameText text={title} />
    </svelte:element>
  {/if}
  {#if description}<p><GameText text={description} /></p>{/if}
  <slot />
</article>
