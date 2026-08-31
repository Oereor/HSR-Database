<script lang="ts">
  import type { EndgameMechanicView, PureFictionCacophonyView } from '$lib/domain/endgame-view';
  import SeasonMechanicCard from '../mechanics/SeasonMechanicCard.svelte';
  import PureFictionCacophonySection from './PureFictionCacophonySection.svelte';

  export let fixedMechanics: EndgameMechanicView[] = [];
  export let cacophony: PureFictionCacophonyView | undefined = undefined;

  $: battleWillContent = {
    kind: 'segments' as const,
    items: fixedMechanics.map((mechanic) => ({
      key: mechanic.id,
      title: mechanic.name,
      description: mechanic.description
    }))
  };
</script>

{#if fixedMechanics.length}
  <section
    class="endgame-mechanics-section endgame-mechanics-section--fixed"
    data-endgame-mechanics="battle-will"
  >
    <SeasonMechanicCard title="战意机制" content={battleWillContent} headingLevel={2} />
  </section>
{/if}

{#if cacophony?.options.length}
  <PureFictionCacophonySection {cacophony} />
{/if}
