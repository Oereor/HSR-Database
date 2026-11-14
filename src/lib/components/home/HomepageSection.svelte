<script lang="ts">
  import OverviewGrid from '$lib/components/shared/OverviewGrid.svelte';
  import SectionHeading from '$lib/components/shared/SectionHeading.svelte';
  import { m } from '$lib/paraglide/messages.js';
  export let id: string;
  export let title: string;
  export let href: string;
  export let total: number;
  export let shown: number;
  export let compact = false;
</script>

{#if total > 0}
  <section class="home-section min-w-0" class:home-section--compact={compact} aria-labelledby={id}>
    <SectionHeading {id}>
      <a class="home-section__heading" {href}>
        <span>{title}</span>
        <span class="home-section__meta">
          {#if shown < total}<span>{m.home_section_count({ shown, total })}</span>{/if}
          <span aria-hidden="true">→</span>
        </span>
      </a>
    </SectionHeading>
    {#if compact}
      <div
        class="grid grid-cols-[repeat(auto-fill,min(100%,12rem))] justify-start gap-3"
        data-homepage-category={id}
      >
        <slot />
      </div>
    {:else}
      <OverviewGrid>
        <slot />
      </OverviewGrid>
    {/if}
  </section>
{/if}

<style>
  .home-section:not(.home-section--compact) {
    padding-top: var(--space-12);
  }
  .home-section :global(h2) {
    width: 100%;
  }
  .home-section__heading {
    display: flex;
    width: 100%;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .home-section__heading:hover {
    color: var(--gold);
  }
  .home-section__meta {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    color: var(--gold);
    font-size: 0.8rem;
    font-weight: 400;
  }
</style>
