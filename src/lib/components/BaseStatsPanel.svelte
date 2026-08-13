<script lang="ts">
  import { formatBaseStat, getBaseStatsAtLevel } from '$lib/domain/stats';
  import type { BaseStatProgression, CharacterEnergy } from '$lib/domain/types';

  export let progression: BaseStatProgression;
  export let controlId: string;
  export let controlLabel = '角色等级';
  export let energy: CharacterEnergy | undefined = undefined;

  let level = progression.defaultLevel;
  $: stats = getBaseStatsAtLevel(progression, level);
</script>

{#if progression.stages.length}
  <article class="info-card base-stats-panel">
    <div class="base-stat-grid">
      <div class="base-stat-card base-stat-card--hp" data-base-stat="hp">
        <span>生命值</span><strong class="scaling-value">{formatBaseStat(stats.hp)}</strong>
      </div>
      <div class="base-stat-card base-stat-card--attack" data-base-stat="attack">
        <span>攻击力</span><strong class="scaling-value">{formatBaseStat(stats.attack)}</strong>
      </div>
      <div class="base-stat-card base-stat-card--defence" data-base-stat="defence">
        <span>防御力</span><strong class="scaling-value">{formatBaseStat(stats.defence)}</strong>
      </div>
      {#if progression.fixed?.speed !== undefined}<div
          class="base-stat-card base-stat-card--fixed"
          data-base-stat="speed"
        >
          <span>速度</span><strong>{formatBaseStat(progression.fixed.speed)}</strong>
        </div>{/if}
      {#if energy}<div class="base-stat-card base-stat-card--fixed" data-base-stat="energy">
          <span>能量上限</span><strong
            >{energy.kind === 'special' ? '特殊能量' : formatBaseStat(energy.max)}</strong
          >
        </div>{/if}
    </div>
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
        aria-valuetext={`等级 ${level}`}
      />
      <div class="skill-level-range" aria-hidden="true">
        <span>Lv.{progression.minLevel}</span><span>Lv.{progression.maxLevel}</span>
      </div>
    </div>
  </article>
{:else}
  <p class="data-placeholder">暂无可解析的等级属性。</p>
{/if}
