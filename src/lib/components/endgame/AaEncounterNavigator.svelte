<script lang="ts">
  import GameText from '$lib/components/GameText.svelte';
  import type { EndgameEncounterView } from '$lib/domain/endgame-view';

  export let encounters: EndgameEncounterView[];
  export let selectedId: string;

  $: preliminary = encounters.filter((encounter) => encounter.variant === 'preliminary');
  $: bosses = encounters.filter((encounter) => encounter.variant !== 'preliminary');
</script>

<div class="aa-encounter-nav">
  <div>
    <h2>骑士关卡</h2>
    <nav aria-label="选择骑士关卡">
      {#each preliminary as encounter}
        <a
          href={`?encounter=${encodeURIComponent(encounter.id)}`}
          aria-current={selectedId === encounter.id ? 'page' : undefined}
          ><GameText text={encounter.label} /></a
        >
      {/each}
    </nav>
  </div>
  <div>
    <h2>王棋</h2>
    <nav aria-label="选择王棋难度">
      {#each bosses as encounter}
        <a
          href={`?encounter=${encodeURIComponent(encounter.id)}`}
          aria-current={selectedId === encounter.id ? 'page' : undefined}
          ><GameText text={encounter.label} /></a
        >
      {/each}
    </nav>
  </div>
</div>
