<div class="overview-grid"><slot /></div>

<style>
  .overview-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 218px), 1fr));
    justify-content: stretch;
    gap: 0.85rem;
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
  }

  @media (max-width: 340px) {
    .overview-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
