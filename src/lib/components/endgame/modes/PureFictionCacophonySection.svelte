<script lang="ts">
  import GameText from '$lib/components/GameText.svelte';
  import InlineDividerHeading from '$lib/components/InlineDividerHeading.svelte';
  import type { PureFictionCacophonyView } from '$lib/domain/endgame-view';

  export let cacophony: PureFictionCacophonyView;
</script>

<section class="endgame-mechanics-section pf-cacophony" data-endgame-mechanics="cacophony">
  <div class="pf-cacophony__heading">
    <InlineDividerHeading level={2} scale="large">荒腔走板</InlineDividerHeading>
  </div>
  <div class="pf-cacophony__grid">
    {#each cacophony.options as option (option.order)}
      <article class="pf-cacophony__tile">
        <h3><GameText text={option.name} /></h3>
        <p><GameText text={option.description} /></p>
      </article>
    {/each}
  </div>
</section>

<style>
  .pf-cacophony {
    min-width: 0;
  }

  .pf-cacophony__heading {
    margin-bottom: var(--space-4);
  }

  .pf-cacophony__grid {
    display: grid;
    min-width: 0;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-3);
    align-items: stretch;
  }

  .pf-cacophony__tile {
    min-width: 0;
    border: 1px solid var(--surface-border);
    border-radius: var(--radius-card);
    background: rgb(14 20 34 / 64%);
    padding: var(--space-4);
  }

  .pf-cacophony__tile h3 {
    margin: 0 0 var(--space-2);
    color: var(--text-primary);
    font-size: var(--font-major-title);
    font-weight: 650;
    line-height: 1.35;
  }

  .pf-cacophony__tile p {
    margin: 0;
    color: var(--text-body);
    font-size: var(--font-body);
    line-height: 1.7;
  }

  @container endgame-main (min-width: 620px) {
    .pf-cacophony__grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @container endgame-main (min-width: 860px) {
    .pf-cacophony__grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
</style>
