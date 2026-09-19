<script lang="ts">
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
  ];

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
    <div class="player-stats-grid">
      {#each statColumns as column (column.id)}
        <dl class="player-stat-column" data-player-stat-column={column.id}>
          {#each column.items as item (item.stat.field)}
            {@const iconUrl = getRelicPropertyIconUrl(item.iconKey)}
            <div class="inspection-stat-row" data-player-stat={item.stat.field}>
              <dt>
                <span class="inspection-stat-label">
                  {#if iconUrl}<img src={iconUrl} alt="" aria-hidden="true" />{/if}
                  <span>{item.label}</span>
                </span>
              </dt>
              <dd><strong>{valueOf(item)}</strong></dd>
            </div>
          {/each}
        </dl>
      {/each}
    </div>
  {:else}
    <p class="data-placeholder">{m.player_character_stats_unavailable()}</p>
  {/if}
</div>
