<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import AssetImage from '$lib/components/shared/AssetImage.svelte';
  import DescriptionText from '$lib/components/shared/DescriptionText.svelte';
  import { getCharacterDetailIconUrl } from '$lib/data/visual-assets';
  import {
    visibleComparisonText,
    type ComparisonItem,
    type ComparisonSide
  } from '$lib/domain/enhancement-comparison';
  import { diffEnhancementText, type DiffSegment } from '$lib/domain/enhancement-text-diff';
  import { m } from '$lib/paraglide/messages.js';
  import type { Locale } from '$lib/paraglide/runtime.js';
  import EnhancementDiffText from './EnhancementDiffText.svelte';

  let { item, locale }: { item: ComparisonItem; locale: Locale } = $props();
  let displaySide = $derived(item.after ?? item.before);
  let changedName = $derived(
    item.before &&
      item.after &&
      visibleComparisonText(item.before.name) !== visibleComparisonText(item.after.name)
  );
  let kindLabel = $derived.by(() => {
    if (item.category === 'skills') return item.label;
    if (item.category === 'eidolons') return m.eidolon_rank({ rank: item.rank }, { locale });
    return item.traceType === 'ability'
      ? m.enhancement_comparison_ability_trace({}, { locale })
      : m.enhancement_comparison_stat_trace({}, { locale });
  });
  let diff = $derived.by(() => {
    const before = item.before?.description;
    const after = item.after?.description;
    if (before?.kind === 'available' && after?.kind === 'available')
      return diffEnhancementText(before.tokens, after.tokens);
    return {
      before:
        before?.kind === 'available'
          ? [{ operation: item.status === 'removed' ? 'delete' : 'equal', tokens: before.tokens }]
          : [],
      after:
        after?.kind === 'available'
          ? [{ operation: item.status === 'added' ? 'insert' : 'equal', tokens: after.tokens }]
          : []
    } satisfies { before: DiffSegment[]; after: DiffSegment[] };
  });
</script>

{#snippet side(form: 'before' | 'after', value: ComparisonSide | null, segments: DiffSegment[])}
  <div class="comparison-side min-w-0 px-4 py-4 sm:px-5" data-comparison-side={form}>
    <h3 class="text-muted-foreground mb-2 text-sm font-semibold">
      {form === 'before'
        ? m.detail_enhanced_before({}, { locale })
        : m.detail_enhanced_after({}, { locale })}
    </h3>
    {#if changedName && value?.name.length}
      <p class="mb-2 font-medium"><DescriptionText tokens={value.name} /></p>
    {/if}
    {#if !value}
      <p class="text-muted-foreground">{m.enhancement_comparison_absent({}, { locale })}</p>
    {:else if value.description.kind === 'unavailable'}
      <p class="text-muted-foreground">
        {m.common_localized_description_unavailable({}, { locale })}
      </p>
    {:else}
      <p class="comparison-prose text-secondary-foreground leading-relaxed">
        <EnhancementDiffText {segments} {locale} />
      </p>
    {/if}
  </div>
{/snippet}

<Card.Root
  role="article"
  aria-labelledby={`comparison-${item.key}`}
  class="gap-0 overflow-hidden py-0"
  data-comparison-item={item.key}
  data-category={item.category}
  data-status={item.status}
  data-source={item.source.kind}
>
  <header class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
    <div class="flex min-w-0 items-center gap-3">
      {#if item.iconKey}
        <AssetImage
          class="size-8 shrink-0 object-contain sm:size-9"
          src={getCharacterDetailIconUrl(item.iconKey)}
          decorative
          width={36}
          height={36}
        />
      {/if}
      <div class="min-w-0">
        <p class="text-muted-foreground text-xs">
          {kindLabel}{#if item.category === 'skills' && item.level !== null}
            · {m.enhancement_comparison_level({ level: item.level }, { locale })}
          {/if}
        </p>
        <h2
          id={`comparison-${item.key}`}
          class="mt-0.5 text-base font-semibold [overflow-wrap:anywhere]"
        >
          {#if displaySide.name.length}<DescriptionText
              tokens={displaySide.name}
            />{:else}{kindLabel}{/if}
        </h2>
      </div>
    </div>
  </header>
  <div class="comparison-sides border-border grid min-w-0 border-t md:grid-cols-2">
    {@render side('before', item.before, diff.before)}
    {@render side('after', item.after, diff.after)}
  </div>
  {#if 'comments' in item && item.comments.length}
    <div class="border-border border-t px-4 py-3 sm:px-5" data-comparison-notes>
      <h3 class="text-muted-foreground text-sm font-semibold">
        {m.enhancement_comparison_note({}, { locale })}
      </h3>
      <ul class="comparison-prose mt-1 list-disc space-y-1 pl-5 text-sm">
        {#each item.comments as comment}<li><DescriptionText tokens={comment} /></li>{/each}
      </ul>
    </div>
  {/if}
</Card.Root>

<style>
  .comparison-side + .comparison-side {
    border-block-start: 1px solid var(--border);
  }
  .comparison-prose {
    overflow-wrap: anywhere;
  }
  .comparison-prose :global(.game-text) {
    white-space: pre-wrap;
  }
  .comparison-prose :global(.description-token--unbreak) {
    display: inline-block;
    max-inline-size: 100%;
    white-space: normal;
  }
  @media (width >= 48rem) {
    .comparison-side + .comparison-side {
      border-block-start: 0;
      border-inline-start: 1px solid var(--border);
    }
  }
</style>
