<script lang="ts">
  import { formatBaseStat, getBaseStatsAtLevel } from '$lib/domain/stats';
  import type { BaseStatProgression, CharacterEnergy } from '$lib/domain/types';
  import { getCharacterDetailIconUrl } from '$lib/data/visual-assets';
  import { m } from '$lib/paraglide/messages.js';

  export let progression: BaseStatProgression;
  export let controlId: string;
  export let controlLabel = m.base_stats_character_level();
  export let energy: CharacterEnergy | undefined = undefined;

  let level = progression.defaultLevel;
  $: stats = getBaseStatsAtLevel(progression, level);
  $: hpIconUrl = getCharacterDetailIconUrl(progression.iconKeys?.hp);
  $: attackIconUrl = getCharacterDetailIconUrl(progression.iconKeys?.attack);
  $: defenceIconUrl = getCharacterDetailIconUrl(progression.iconKeys?.defence);
  $: speedIconUrl = getCharacterDetailIconUrl(progression.iconKeys?.speed);
  $: energyIconUrl = getCharacterDetailIconUrl(energy?.iconKey);
</script>

{#if progression.stages.length}
  <div class="base-stats-panel">
    <div class="skill-level-control stat-level-control">
      <div>
        <label for={controlId}>{controlLabel}</label><output for={controlId}>Lv.{level}</output>
      </div>
      <input
        id={controlId}
        type="range"
        min={progression.minLevel}
        max={progression.maxLevel}
        step="1"
        bind:value={level}
        aria-valuetext={m.common_level({ level })}
      />
      <div class="skill-level-range" aria-hidden="true">
        <span>Lv.{progression.minLevel}</span><span>Lv.{progression.maxLevel}</span>
      </div>
    </div>
    <dl class="inspection-stat-list">
      <div class="inspection-stat-row" data-base-stat="hp">
        <dt>
          <span class="inspection-stat-label"
            >{#if hpIconUrl}<img src={hpIconUrl} alt="" aria-hidden="true" />{/if}<span
              >{m.common_hp()}</span
            ></span
          >
        </dt>
        <dd><strong class="scaling-value">{formatBaseStat(stats.hp)}</strong></dd>
      </div>
      <div class="inspection-stat-row" data-base-stat="attack">
        <dt>
          <span class="inspection-stat-label"
            >{#if attackIconUrl}<img src={attackIconUrl} alt="" aria-hidden="true" />{/if}<span
              >{m.common_attack()}</span
            ></span
          >
        </dt>
        <dd><strong class="scaling-value">{formatBaseStat(stats.attack)}</strong></dd>
      </div>
      <div class="inspection-stat-row" data-base-stat="defence">
        <dt>
          <span class="inspection-stat-label"
            >{#if defenceIconUrl}<img src={defenceIconUrl} alt="" aria-hidden="true" />{/if}<span
              >{m.common_defence()}</span
            ></span
          >
        </dt>
        <dd><strong class="scaling-value">{formatBaseStat(stats.defence)}</strong></dd>
      </div>
      {#if progression.fixed?.speed !== undefined}<div
          class="inspection-stat-row"
          data-base-stat="speed"
        >
          <dt>
            <span class="inspection-stat-label"
              >{#if speedIconUrl}<img src={speedIconUrl} alt="" aria-hidden="true" />{/if}<span
                >{m.common_base_speed()}</span
              ></span
            >
          </dt>
          <dd><strong>{formatBaseStat(progression.fixed.speed)}</strong></dd>
        </div>{/if}
      {#if energy}<div class="inspection-stat-row" data-base-stat="energy">
          <dt>
            <span class="inspection-stat-label"
              >{#if energyIconUrl}<img src={energyIconUrl} alt="" aria-hidden="true" />{/if}<span
                >{m.common_energy_max()}</span
              ></span
            >
          </dt>
          <dd>
            <strong
              >{energy.kind === 'special'
                ? m.common_special_energy()
                : formatBaseStat(energy.max)}</strong
            >
          </dd>
        </div>{/if}
    </dl>
  </div>
{:else}
  <p class="data-placeholder">{m.base_stats_empty()}</p>
{/if}
