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
        aria-valuetext={`等级 ${level}`}
      />
      <div class="skill-level-range" aria-hidden="true">
        <span>Lv.{progression.minLevel}</span><span>Lv.{progression.maxLevel}</span>
      </div>
    </div>
    <dl class="inspection-stat-list">
      <div class="inspection-stat-row" data-base-stat="hp">
        <dt>生命值</dt>
        <dd><strong class="scaling-value">{formatBaseStat(stats.hp)}</strong></dd>
      </div>
      <div class="inspection-stat-row" data-base-stat="attack">
        <dt>攻击力</dt>
        <dd><strong class="scaling-value">{formatBaseStat(stats.attack)}</strong></dd>
      </div>
      <div class="inspection-stat-row" data-base-stat="defence">
        <dt>防御力</dt>
        <dd><strong class="scaling-value">{formatBaseStat(stats.defence)}</strong></dd>
      </div>
      {#if progression.fixed?.speed !== undefined}<div
          class="inspection-stat-row"
          data-base-stat="speed"
        >
          <dt>基础速度</dt>
          <dd><strong>{formatBaseStat(progression.fixed.speed)}</strong></dd>
        </div>{/if}
      {#if energy}<div class="inspection-stat-row" data-base-stat="energy">
          <dt>能量上限</dt>
          <dd>
            <strong>{energy.kind === 'special' ? '特殊能量' : formatBaseStat(energy.max)}</strong>
          </dd>
        </div>{/if}
    </dl>
  </div>
{:else}
  <p class="data-placeholder">暂无可解析的等级属性。</p>
{/if}
