<script lang="ts">
  export let variant: 'default' | 'compact' | 'character' = 'default';
</script>

<div
  class:overview-grid--compact={variant === 'compact'}
  class:overview-grid--character={variant === 'character'}
  class="overview-grid"
>
  <slot />
</div>

<style>
  .overview-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 218px), 1fr));
    justify-content: stretch;
    gap: 0.85rem;
  }

  .overview-grid--compact {
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 180px), 220px));
    justify-content: center;
    gap: 1rem;
  }

  @media (min-width: 1350px) {
    .overview-grid {
      grid-template-columns: repeat(auto-fill, minmax(225px, 1fr));
    }
  }

  @media (max-width: 520px) {
    .overview-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.65rem;
    }

    .overview-grid--compact {
      grid-template-columns: 1fr;
      gap: 1rem;
    }

    .overview-grid--character {
      width: calc(100% + 1rem);
      margin-inline: -0.5rem;
    }
  }

  @media (max-width: 340px) {
    .overview-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
