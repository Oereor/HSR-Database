<script lang="ts">
  import { cn } from '$lib/utils.js';
  export let level: 1 | 2 | 3 = 1;
  export let headingLevel: 2 | 3 | 4 | undefined = undefined;
  export let tone: 'primary' | 'muted' = 'primary';
  export let id: string | undefined = undefined;

  $: resolvedHeadingLevel = headingLevel ?? ((level + 1) as 2 | 3 | 4);
  $: headingTag = `h${resolvedHeadingLevel}` as const;
</script>

<div
  class:section-heading--level-1={level === 1}
  class:section-heading--level-2={level === 2}
  class:section-heading--level-3={level === 3}
  class:section-heading--muted={tone === 'muted'}
  class:section-heading--with-meta={$$slots.meta}
  class="section-heading-shared mb-4 flex w-full min-w-0 flex-wrap items-baseline justify-between gap-2"
>
  <svelte:element
    this={headingTag}
    {id}
    class={cn(
      'm-0 min-w-0 leading-snug font-semibold wrap-anywhere',
      level === 1 ? 'text-xl tracking-tight' : level === 2 ? 'text-lg' : 'text-sm',
      tone === 'muted' || level === 3 ? 'text-muted-foreground' : 'text-foreground'
    )}><slot /></svelte:element
  >
  {#if $$slots.meta}
    <span
      class="section-heading-shared__meta text-muted-foreground min-w-0 text-sm max-[520px]:basis-full"
      ><slot name="meta" /></span
    >
  {/if}
</div>
