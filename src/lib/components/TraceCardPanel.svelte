<script lang="ts">
  import GameText from '$lib/components/GameText.svelte';
  import { groupTracesForDisplay } from '$lib/domain/trace-groups';
  import type { Trace } from '$lib/domain/types';

  export let traces: Trace[];

  $: groups = groupTracesForDisplay(traces);
</script>

<div class="trace-card-panel">
  <div class="trace-ability-groups" data-trace-ability-groups>
    {#each groups.abilityGroups as group (group.ability.id)}
      <section class="trace-ability-group" data-trace-group={group.ability.id}>
        <article
          class="trace-card trace-card--ability"
          data-trace-id={group.ability.id}
          data-trace-type="ability"
        >
          <div class="trace-card__heading">
            <h3><GameText text={group.ability.name} /></h3>
            <span class="skill-effect-tag">额外能力</span>
          </div>
          {#if group.ability.promotionLimit}
            <p class="trace-card__condition">
              <span>解锁条件</span>角色晋阶 {group.ability.promotionLimit}
            </p>
          {/if}
          <p class="trace-card__description">
            <GameText text={group.ability.description || '上游未提供本地化描述。'} />
          </p>
        </article>

        {#each group.stats as stat (stat.id)}
          <article
            class="trace-card trace-card--stat"
            data-trace-id={stat.id}
            data-trace-type="stat"
            data-trace-owner={group.ability.id}
          >
            <div class="trace-card__heading">
              <h3><GameText text={stat.name} /></h3>
              <span class="skill-effect-tag">属性加成</span>
            </div>
            <p class="trace-card__description">
              <GameText text={stat.description || '上游未提供本地化描述。'} />
            </p>
          </article>
        {/each}
      </section>
    {/each}
  </div>

  {#if groups.specialAbilities.length || groups.standaloneStats.length}
    <section class="trace-independent-section" data-trace-independent-section>
      <h3>{groups.specialAbilities.length ? '独立行迹' : '独立属性加成'}</h3>
      {#each groups.specialAbilities as ability (ability.id)}
        <article
          class="trace-card trace-card--ability trace-card--special"
          data-trace-id={ability.id}
          data-trace-type="ability"
          data-trace-special
        >
          <div class="trace-card__heading">
            <h3><GameText text={ability.name} /></h3>
            <span class="skill-effect-tag">额外能力</span>
          </div>
          {#if ability.promotionLimit}
            <p class="trace-card__condition">
              <span>解锁条件</span>角色晋阶 {ability.promotionLimit}
            </p>
          {/if}
          <p class="trace-card__description">
            <GameText text={ability.description || '上游未提供本地化描述。'} />
          </p>
        </article>
      {/each}
      <div class="trace-independent-grid">
        {#each groups.standaloneStats as stat (stat.id)}
          <article
            class="trace-card trace-card--stat"
            data-trace-id={stat.id}
            data-trace-type="stat"
            data-trace-standalone
          >
            <div class="trace-card__heading">
              <h3><GameText text={stat.name} /></h3>
              <span class="skill-effect-tag">属性加成</span>
            </div>
            <p class="trace-card__description">
              <GameText text={stat.description || '上游未提供本地化描述。'} />
            </p>
          </article>
        {/each}
      </div>
    </section>
  {/if}
</div>
