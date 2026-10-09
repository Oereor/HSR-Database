<script lang="ts">
  import AssetImage from '$lib/components/shared/AssetImage.svelte';
  import GameText from '$lib/components/shared/GameText.svelte';
  import SectionHeading from '$lib/components/shared/SectionHeading.svelte';
  import { getCharacterDetailIconUrl } from '$lib/data/visual-assets';
  import type { Trace } from '$lib/domain/types';
  import { m } from '$lib/paraglide/messages.js';
  export let traces: Trace[] = [];
</script>

<div class="training-traces" data-training-trace-count={traces.length}>
  <SectionHeading level={3} headingLevel={4}>{m.training_trace_summary()}</SectionHeading>
  {#if traces.length}
    <ul class="training-traces__grid">
      {#each traces as trace (trace.id)}
        <li data-training-trace-id={trace.id}>
          <AssetImage
            src={getCharacterDetailIconUrl(trace.iconKey)}
            alt=""
            width={24}
            height={24}
            fallbackClass="training-traces__fallback"
          />
          <span><GameText text={trace.name} /></span>
        </li>
      {/each}
    </ul>
  {:else}<p class="muted">{m.training_no_traces()}</p>{/if}
</div>

<style>
  .training-traces {
    margin-top: var(--space-6);
  }
  .training-traces__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
    gap: var(--space-3);
    list-style: none;
    padding: 0;
    margin: 0;
  }
  li {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
    min-height: 44px;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--border);
    border-radius: 8px;
    background: rgb(14 20 34 / 45%);
    font-size: 0.875rem;
    text-align: left;
  }
  li > span {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  li :global(img),
  li :global(.training-traces__fallback) {
    width: 24px;
    height: 24px;
    flex: 0 0 24px;
  }
  p {
    margin: 0;
  }
</style>
