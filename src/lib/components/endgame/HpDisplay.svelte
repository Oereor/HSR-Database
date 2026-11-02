<script lang="ts">
  import type { EnemyOccurrenceView } from '$lib/domain/endgame-view';

  export let hp: EnemyOccurrenceView['hp'];
</script>

<div class="endgame-hp flex min-w-0 items-center justify-end">
  <strong
    class="text-foreground text-sm leading-relaxed wrap-anywhere tabular-nums"
    data-endgame-hp
  >
    {hp.roundedPerBar}{#if hp.phaseCount && hp.phaseCount > 1}<span
        class="endgame-stat__multiplier text-primary"
      >
        &nbsp;× {hp.phaseCount}</span
      >{/if}
  </strong>
</div>
