<script lang="ts">
  import TrainingSkillTree from '$lib/components/training/TrainingSkillTree.svelte';
  import type { createTrainingLoader } from '$lib/data/training';
  import type { CharacterProfile } from '$lib/domain/types';
  import { m } from '$lib/paraglide/messages.js';
  import { createPlayerSkillTreeIndex } from '$lib/player/character';
  import type { PlayerCharacter } from '$lib/player/contract';
  import TraceCardPanel from './TraceCardPanel.svelte';

  export let character: PlayerCharacter;
  export let path: string;
  export let presentation: CharacterProfile | undefined;
  export let accent: string;
  export let loadCharacter: ReturnType<typeof createTrainingLoader>['loadCharacter'];

  $: playerIndex = createPlayerSkillTreeIndex(character.skillTree);
  $: pendingProfile = loadProfile(character, presentation, loadCharacter);

  async function loadProfile(
    character: PlayerCharacter,
    presentation: CharacterProfile | undefined,
    load: typeof loadCharacter
  ) {
    if (!presentation) return undefined;
    const data = await load(character.characterId);
    return data.profiles.find(
      ({ enhancedId }) => (enhancedId !== 0) === character.progression.enhanced
    );
  }
</script>

<div class="player-traces" data-player-traces>
  <div class="player-traces__layout">
    {#if presentation?.traces.length}
      <TraceCardPanel traces={presentation.traces} characterAccent={accent} />
    {:else}
      <p class="data-placeholder">{m.detail_traces_unavailable()}</p>
    {/if}
    <div class="player-traces__tree">
      {#await pendingProfile}
        <p class="data-placeholder" role="status">{m.player_character_loading()}</p>
      {:then profile}
        {#if profile && presentation}
          <TrainingSkillTree
            {path}
            {profile}
            {presentation}
            {accent}
            state={{ mode: 'readonly', playerIndex }}
          />
        {:else}
          {@render unavailable()}
        {/if}
      {:catch}
        {@render unavailable()}
      {/await}
    </div>
  </div>
</div>

{#snippet unavailable()}
  <p class="data-placeholder" role="status" data-training-tree-error>
    {m.player_trace_tree_unavailable()}
  </p>
{/snippet}

<style>
  .player-traces {
    container: player-traces / inline-size;
  }
  .player-traces__layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    gap: var(--space-6);
  }
  .player-traces__tree {
    width: min(100%, 32rem);
    min-width: 0;
    justify-self: center;
  }
  @container player-traces (min-width: 64rem) {
    .player-traces__layout {
      grid-template-columns: minmax(0, 1fr) min(40%, 32rem);
    }
  }
</style>
