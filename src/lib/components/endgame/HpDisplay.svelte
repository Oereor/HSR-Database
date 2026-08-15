<script lang="ts">
  import type { EnemyOccurrenceView } from '$lib/domain/endgame-view';

  export let hp: EnemyOccurrenceView['hp'];
</script>

<div class="endgame-hp">
  <strong data-endgame-hp>
    {hp.roundedPerBar}{#if hp.phaseCount && hp.phaseCount > 1}<span
        class="endgame-stat__multiplier"
      >
        &nbsp;× {hp.phaseCount}</span
      >{/if}
  </strong>
</div>
