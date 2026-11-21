<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import * as Tabs from '$lib/components/ui/tabs';
  import { Button } from '$lib/components/ui/button';
  import AssetImage from '$lib/components/shared/AssetImage.svelte';
  import DescriptionText from '$lib/components/shared/DescriptionText.svelte';
  import EnhancementComparisonCard from '$lib/components/character/EnhancementComparisonCard.svelte';
  import {
    COMPARISON_CATEGORIES,
    enhancementCharacterPath,
    type ComparisonFilter
  } from '$lib/domain/enhancement-comparison';
  import { getCharacterIconUrl } from '$lib/data/visual-assets';
  import { localizedHref } from '$lib/i18n/routing';
  import { m } from '$lib/paraglide/messages.js';
  import { siteName } from '$lib/site';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let ready = $state(false);
  onMount(() => {
    ready = true;
  });

  const filters = ['all', ...COMPARISON_CATEGORIES] as const;
  const filterLabels = {
    all: m.enhancement_comparison_all,
    skills: m.detail_skills,
    traces: m.detail_traces,
    eidolons: m.detail_eidolons
  };
  let locale = $derived(data.locale);
  let comparison = $derived(data.comparison);
  let filter = $derived(
    filters.find((entry) => ready && entry === page.url.searchParams.get('category')) ?? 'all'
  );
  let baseForm = $derived(ready && page.url.searchParams.get('enhanced') === '0');
  let items = $derived(
    comparison.items.filter(
      (item) => (filter === 'all' || item.category === filter) && item.status !== 'unchanged'
    )
  );
  let returnHref = $derived(
    localizedHref(enhancementCharacterPath(comparison.avatarId, baseForm), locale)
  );

  async function select(nextFilter: ComparisonFilter) {
    const url = new URL(page.url);
    url.search = '';
    if (nextFilter !== 'all') url.searchParams.set('category', nextFilter);
    if (baseForm) url.searchParams.set('enhanced', '0');
    if (url.href !== page.url.href) await goto(url, { noScroll: true, keepFocus: true });
  }
</script>

<svelte:head>
  <title
    >{data.detail.name} · {m.enhancement_comparison_title({}, { locale })} | {siteName(
      locale
    )}</title
  >
</svelte:head>

<div
  class="mx-auto w-full max-w-6xl py-4 sm:py-6"
  data-enhancement-comparison={comparison.avatarId}
>
  <header class="border-border bg-card mb-4 rounded-lg border p-3 sm:p-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex min-w-0 items-center gap-3">
        <AssetImage
          class="border-border bg-secondary size-10 shrink-0 rounded-lg border sm:size-12"
          src={getCharacterIconUrl(comparison.avatarId)}
          decorative
          width={48}
          height={48}
        />
        <h1
          class="min-w-0 text-xl font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-2xl"
        >
          <DescriptionText tokens={comparison.name} /> · {m.enhancement_comparison_title(
            {},
            { locale }
          )}
        </h1>
      </div>
      <Button href={returnHref} variant="outline" data-comparison-return>
        <ArrowLeft aria-hidden="true" />{m.enhancement_comparison_return({}, { locale })}
      </Button>
    </div>
    {#if comparison.summary.length}
      <section class="border-border mt-3 border-t pt-3" aria-labelledby="enhancement-summary">
        <h2 id="enhancement-summary" class="text-muted-foreground text-sm font-semibold">
          {m.enhancement_comparison_summary({}, { locale })}
        </h2>
        <ul
          class="mt-1.5 list-disc space-y-1 pl-5 text-sm leading-relaxed [overflow-wrap:anywhere]"
        >
          {#each comparison.summary as summary}<li><DescriptionText tokens={summary} /></li>{/each}
        </ul>
      </section>
    {/if}
  </header>
  <Tabs.Root
    value={filter}
    onValueChange={(value) => {
      const selected = filters.find((entry) => entry === value);
      if (selected) void select(selected);
    }}
  >
    <Tabs.List
      aria-label={m.enhancement_comparison_categories({}, { locale })}
      class="border-border mb-4 grid grid-cols-4 border-b sm:flex"
    >
      {#each filters as category}
        <Tabs.Trigger value={category} data-comparison-filter={category} variant="underline">
          {filterLabels[category]({}, { locale })}
        </Tabs.Trigger>
      {/each}
    </Tabs.List>
    <Tabs.Content value={filter}>
      {#if items.length}
        <div class="grid min-w-0 gap-4">
          {#each items as item (item.key)}<EnhancementComparisonCard {item} {locale} />{/each}
        </div>
      {:else}
        <p
          class="border-border bg-card text-muted-foreground rounded-lg border p-6 text-center"
          data-comparison-empty
        >
          {m.enhancement_comparison_empty_changes({}, { locale })}
        </p>
      {/if}
    </Tabs.Content>
  </Tabs.Root>
</div>
