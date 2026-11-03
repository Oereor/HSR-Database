<script lang="ts">
  import SectionHeading from '$lib/components/shared/SectionHeading.svelte';
  import { m } from '$lib/paraglide/messages.js';
  export let id: string;
  export let title: string;
  export let href: string;
  export let total: number;
  export let shown: number;
</script>

{#if total > 0}
  <section class="home-section" aria-labelledby={id}>
    <SectionHeading {id}>
      <a class="home-section__heading" {href}>
        <span>{title}</span>
        <span class="home-section__meta">
          {#if shown < total}<span>{m.home_section_count({ shown, total })}</span>{/if}
          <span aria-hidden="true">→</span>
        </span>
      </a>
    </SectionHeading>
    <div class="home-section__grid" data-homepage-category={id}><slot /></div>
  </section>
{/if}

<style>
  .home-section {
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
  .home-section__grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: var(--space-3);
  }
  @media (max-width: 1180px) {
    .home-section__grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
  @media (max-width: 640px) {
    .home-section__grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 359px) {
    .home-section__grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
