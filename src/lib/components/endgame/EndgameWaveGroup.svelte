<script lang="ts">
  import SectionHeading from '$lib/components/SectionHeading.svelte';
  import type { EndgameWaveView } from '$lib/domain/endgame-view';
  import EndgameEnemyGrid from './EndgameEnemyGrid.svelte';
  import { formatChineseOrdinal, type EndgameEnemyCardVariant } from './presentation';

  export let wave: EndgameWaveView;
  export let ordinal: number;
  export let level: number;
  export let enemyVariant: EndgameEnemyCardVariant = 'standard';
  export let fullRow = false;
  export let separated = false;

  $: enemyCount = Math.max(1, wave.enemies.length);
</script>

<section
  class:endgame-wave-group--full-row={fullRow}
  class:endgame-wave-group--separated={separated}
  class="endgame-wave-group"
  style={`--endgame-wave-enemy-count: ${enemyCount}`}
  data-wave={wave.key}
  data-endgame-wave-group
  data-wave-level={level}
>
  <SectionHeading level={3} headingLevel={4} tone="muted">
    波次{formatChineseOrdinal(ordinal)}
  </SectionHeading>
  <EndgameEnemyGrid enemies={wave.enemies} variant={enemyVariant} {level} />
</section>

<style>
  .endgame-wave-group {
    position: relative;
    width: min(
      100%,
      calc(
        var(--endgame-wave-enemy-count) * 260px + (var(--endgame-wave-enemy-count) - 1) *
          var(--space-3)
      )
    );
    min-width: 0;
    flex: 0 0 auto;
  }

  .endgame-wave-group--full-row {
    width: 100%;
  }

  @container endgame-main (min-width: 1100px) {
    .endgame-wave-group--separated::before {
      position: absolute;
      top: 0;
      bottom: 0;
      left: calc(var(--space-8) / -2);
      width: 1px;
      background: color-mix(in srgb, var(--border) 54%, transparent);
      content: '';
    }
  }

  @container endgame-main (max-width: 960px) {
    .endgame-wave-group {
      width: 100%;
    }
  }
</style>
