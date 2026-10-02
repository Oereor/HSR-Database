<script lang="ts">
  import StatList from './StatList.svelte';
  import StatRow from './StatRow.svelte';
  import { formatBaseStat, getBaseStatsAtLevel } from '$lib/domain/stats';
  import type { BaseStatProgression, CharacterEnergy } from '$lib/domain/types';
  import { getCharacterDetailIconUrl } from '$lib/data/visual-assets';
  import { m } from '$lib/paraglide/messages.js';
  import LevelSlider from '$lib/components/shared/LevelSlider.svelte';

  export let progression: BaseStatProgression;
  export let controlId: string;
  export let controlLabel = m.base_stats_character_level();
  export let energy: CharacterEnergy | undefined = undefined;
  export let initialLevel: number | undefined = undefined;

  let level = initialLevel ?? progression.defaultLevel;
  $: stats = getBaseStatsAtLevel(progression, level);
  $: hpIconUrl = getCharacterDetailIconUrl(progression.iconKeys?.hp);
  $: attackIconUrl = getCharacterDetailIconUrl(progression.iconKeys?.attack);
  $: defenceIconUrl = getCharacterDetailIconUrl(progression.iconKeys?.defence);
  $: speedIconUrl = getCharacterDetailIconUrl(progression.iconKeys?.speed);
  $: energyIconUrl = getCharacterDetailIconUrl(energy?.iconKey);
  $: hasIcons = Boolean(
    hpIconUrl || attackIconUrl || defenceIconUrl || speedIconUrl || energyIconUrl
  );
</script>

{#if progression.stages.length}
  <div class="base-stats-panel">
    <div class="stat-level-control">
      <LevelSlider
        id={controlId}
        label={controlLabel}
        bind:value={level}
        min={progression.minLevel}
        max={progression.maxLevel}
      />
    </div>
    <StatList {hasIcons}>
      <StatRow
        data-base-stat="hp"
        label={m.common_hp()}
        value={formatBaseStat(stats.hp)}
        iconUrl={hpIconUrl}
        tone="scaling"
      />
      <StatRow
        data-base-stat="attack"
        label={m.common_attack()}
        value={formatBaseStat(stats.attack)}
        iconUrl={attackIconUrl}
        tone="scaling"
      />
      <StatRow
        data-base-stat="defence"
        label={m.common_defence()}
        value={formatBaseStat(stats.defence)}
        iconUrl={defenceIconUrl}
        tone="scaling"
      />
      {#if progression.fixed?.speed !== undefined}<StatRow
          data-base-stat="speed"
          label={m.common_base_speed()}
          value={formatBaseStat(progression.fixed.speed)}
          iconUrl={speedIconUrl}
        />{/if}
      {#if energy}<StatRow
          data-base-stat="energy"
          label={m.common_energy_max()}
          value={energy.kind === 'special' ? m.common_special_energy() : formatBaseStat(energy.max)}
          iconUrl={energyIconUrl}
        />{/if}
    </StatList>
  </div>
{:else}
  <p class="data-placeholder">{m.base_stats_empty()}</p>
{/if}
