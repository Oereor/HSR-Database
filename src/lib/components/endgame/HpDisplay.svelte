<script lang="ts">
  import type { EnemyOccurrenceView } from '$lib/domain/endgame-view';
  import HpMechanicsInfo from './HpMechanicsInfo.svelte';

  export let hp: EnemyOccurrenceView['hp'];

  $: display =
    hp.phaseCount && hp.phaseCount > 1
      ? `${hp.roundedPerBar} × ${hp.phaseCount}`
      : hp.roundedPerBar;
</script>

<div class="endgame-hp">
  <span class="endgame-hp__label">生命值</span>
  <strong data-endgame-hp>{display}</strong>
  <HpMechanicsInfo {hp} />
</div>
