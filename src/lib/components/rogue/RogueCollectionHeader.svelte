<script lang="ts">
  export let kicker: string;
  export let title: string;
  export let visible: number;
  export let total: number;
  export let description: string | undefined = undefined;
</script>

<header class="rogue-collection-heading">
  <div>
    <p class="kicker">{kicker}</p>
    <h2>{title}</h2>
    {#if description}<p class="rogue-collection-heading__description">{description}</p>{/if}
  </div>
  <span data-rogue-collection-count>{visible} / {total}</span>
</header>

<style>
  .rogue-collection-heading {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: var(--space-4);
    border-bottom: 1px solid var(--surface-border);
    margin-bottom: var(--space-4);
    padding-bottom: var(--space-3);
  }
  h2 {
    margin: 0;
    color: var(--text-primary);
    font-family: var(--font-display);
    font-size: var(--font-section-title);
  }
  .rogue-collection-heading__description {
    margin: var(--space-1) 0 0;
    color: var(--text-muted);
    font-size: var(--font-helper);
  }
  .rogue-collection-heading > span {
    flex: 0 0 auto;
    color: var(--text-muted);
    font-size: var(--font-helper);
  }
  @media (max-width: 520px) {
    .rogue-collection-heading {
      align-items: flex-start;
    }
  }
</style>
