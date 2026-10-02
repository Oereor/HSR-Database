<script lang="ts">
  import StatList from '$lib/components/shared/StatList.svelte';
  import StatRow from '$lib/components/shared/StatRow.svelte';
  import LevelSlider from '$lib/components/shared/LevelSlider.svelte';
  import { getRelicPropertyIconUrl } from '$lib/data/visual-assets';
  import type { BaseStatProgression, RelicProperty } from '$lib/domain/types';
  import { m } from '$lib/paraglide/messages.js';
  import type { PlayerStat } from '$lib/player/contract';
  import {
    formatPlayerStatTotal,
    groupPlayerStats,
    type ResolvedPlayerStat
  } from '$lib/player/character';

  export let stats: PlayerStat[];
  export let properties: RelicProperty[];
  export let progression: BaseStatProgression;
  export let level: number;
  export let promotion: number;
  export let controlId: string;

  $: groupedStats = groupPlayerStats(stats, properties, {
    elation_dmg: m.player_character_stat_elation()
  });
  $: statColumns = [
    { id: 'primary', items: groupedStats.primary },
    { id: 'other', items: groupedStats.other }
  ].filter((column) => column.items.length);
  $: hasIcons = statColumns.some((column) =>
    column.items.some((item) => Boolean(getRelicPropertyIconUrl(item.iconKey)))
  );

  const valueOf = (item: ResolvedPlayerStat): string => formatPlayerStatTotal(item.stat);
</script>

<div class="player-stats-panel" data-player-stats-panel>
  <div class="stat-level-control">
    <LevelSlider
      id={controlId}
      label={m.base_stats_character_level()}
      value={level}
      min={progression.minLevel}
      max={progression.maxLevel}
      interactive={false}
      leadingTag={m.player_character_promotion({ promotion })}
    />
  </div>

  {#if stats.length}
    <div class="player-stats-grid" class:player-stats-grid--two-groups={statColumns.length === 2}>
      {#each statColumns as column (column.id)}
        <StatList
          class="player-stat-column"
          data-player-stat-column={column.id}
          spacing="flush"
          {hasIcons}
        >
          {#each column.items as item (item.stat.field)}
            {@const iconUrl = getRelicPropertyIconUrl(item.iconKey)}
            <StatRow
              data-player-stat={item.stat.field}
              label={item.label}
              value={valueOf(item)}
              {iconUrl}
            />
          {/each}
        </StatList>
      {/each}
    </div>
  {:else}
    <p class="data-placeholder">{m.player_character_stats_unavailable()}</p>
  {/if}
</div>

<style>
  .player-stats-panel {
    container-name: player-hero-stats;
    container-type: inline-size;
    min-width: 0;
  }

  .player-stats-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    gap: var(--space-6);
    margin-top: var(--space-6);
  }

  @container player-hero-stats (min-width: 28rem) {
    .player-stats-grid--two-groups {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
