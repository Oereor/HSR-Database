<script lang="ts">
  import AssetImage from '$lib/components/shared/AssetImage.svelte';
  import GameText from '$lib/components/shared/GameText.svelte';
  import SectionHeading from '$lib/components/shared/SectionHeading.svelte';
  import { getCharacterDetailIconUrl } from '$lib/data/visual-assets';
  import type { Trace } from '$lib/domain/types';
  import { m } from '$lib/paraglide/messages.js';
  export let traces: Trace[] = [];
  $: abilities = traces.filter((trace) => trace.type === 'ability');
  $: stats = traces.filter((trace) => trace.type === 'stat');
  $: groups = [
    { type: 'ability', title: m.training_trace_abilities(), traces: abilities, size: 32 },
    { type: 'stat', title: m.training_trace_stats(), traces: stats, size: 24 }
  ];
</script>

<div class="training-traces" data-training-trace-count={traces.length}>
  <SectionHeading level={3} headingLevel={4}>{m.training_trace_summary()}</SectionHeading>
  {#if traces.length}
    <div class="training-traces__columns">
      {#each groups as group (group.type)}
        <section class="training-traces__group" data-training-trace-group={group.type}>
          <h5>{group.title}</h5>
          {#if group.traces.length}
            <ul class="training-traces__grid">
              {#each group.traces as trace (trace.id)}
                <li data-training-trace-id={trace.id} data-training-trace-type={trace.type}>
                  <AssetImage
                    src={getCharacterDetailIconUrl(trace.iconKey)}
                    alt=""
                    width={group.size}
                    height={group.size}
                    fallbackClass="training-traces__fallback"
                  />
                  <span><GameText text={trace.name} /></span>
                </li>
              {/each}
            </ul>
          {:else}<p class="muted">{m.training_no_trace_group()}</p>{/if}
        </section>
      {/each}
    </div>
  {:else}<p class="muted">{m.training_no_traces()}</p>{/if}
</div>

<style>
  .training-traces {
    margin-top: var(--space-6);
  }
  .training-traces__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 11rem), 1fr));
    gap: var(--space-2);
    list-style: none;
    padding: 0;
    margin: 0;
  }
  li {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
    min-height: 40px;
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
  h5 {
    margin: 0 0 var(--space-3);
    font-size: 0.875rem;
    color: var(--text-muted);
  }
  .training-traces__columns {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
    gap: var(--space-6);
  }
  .training-traces__group {
    min-width: 0;
  }
  [data-training-trace-group='stat'] {
    border-left: 1px solid color-mix(in srgb, var(--border) 45%, transparent);
    padding-left: var(--space-6);
  }
  [data-training-trace-group='ability'] ul {
    grid-template-columns: minmax(0, 1fr);
  }
  [data-training-trace-group='ability'] li {
    min-height: 56px;
    font-size: 1rem;
    font-weight: 600;
  }
  [data-training-trace-group='ability'] li :global(img),
  [data-training-trace-group='ability'] li :global(.training-traces__fallback) {
    width: 32px;
    height: 32px;
    flex-basis: 32px;
  }
  @media (max-width: 767px) {
    .training-traces__columns {
      grid-template-columns: minmax(0, 1fr);
    }
    [data-training-trace-group='stat'] {
      border-left: 0;
      padding-left: 0;
    }
  }
</style>
