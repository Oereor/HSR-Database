<script lang="ts">
  import GameText from '$lib/components/GameText.svelte';
  import SectionHeading from '$lib/components/SectionHeading.svelte';
  import SkillExtraEffects from '$lib/components/SkillExtraEffects.svelte';
  import TraceAbilityHeading from '$lib/components/TraceAbilityHeading.svelte';
  import { getCharacterDetailIconUrl } from '$lib/data/visual-assets';
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
          <TraceAbilityHeading trace={group.ability} />
          <p class="trace-card__description">
            <GameText text={group.ability.description || '上游未提供本地化描述。'} />
          </p>
          <SkillExtraEffects effects={group.ability.extraEffects ?? []} />
        </article>

        {#each group.stats as stat (stat.id)}
          {@const statIconUrl = getCharacterDetailIconUrl(stat.iconKey)}
          <article
            class="trace-card trace-card--stat"
            data-trace-id={stat.id}
            data-trace-type="stat"
            data-trace-owner={group.ability.id}
          >
            <div class="trace-card__heading">
              <h3 class:trace-card__title--icon={!!statIconUrl}>
                {#if statIconUrl}<img src={statIconUrl} alt="" aria-hidden="true" />{/if}<span
                  ><GameText text={stat.name} /></span
                >
              </h3>
              <span class="skill-effect-tag">属性加成</span>
            </div>
            <p class="trace-card__description">
              <GameText text={stat.description || '上游未提供本地化描述。'} />
            </p>
            <SkillExtraEffects effects={stat.extraEffects ?? []} />
          </article>
        {/each}
      </section>
    {/each}
  </div>

  {#if groups.specialAbilities.length || groups.standaloneStats.length}
    <section class="trace-independent-section" data-trace-independent-section>
      <SectionHeading level={3} headingLevel={3}
        >{groups.specialAbilities.length ? '独立行迹' : '独立属性加成'}</SectionHeading
      >
      {#each groups.specialAbilities as ability (ability.id)}
        <article
          class="trace-card trace-card--ability trace-card--special"
          data-trace-id={ability.id}
          data-trace-type="ability"
          data-trace-special
        >
          <TraceAbilityHeading trace={ability} />
          <p class="trace-card__description">
            <GameText text={ability.description || '上游未提供本地化描述。'} />
          </p>
          <SkillExtraEffects effects={ability.extraEffects ?? []} />
        </article>
      {/each}
      <div class="trace-independent-grid">
        {#each groups.standaloneStats as stat (stat.id)}
          {@const statIconUrl = getCharacterDetailIconUrl(stat.iconKey)}
          <article
            class="trace-card trace-card--stat"
            data-trace-id={stat.id}
            data-trace-type="stat"
            data-trace-standalone
          >
            <div class="trace-card__heading">
              <h3 class:trace-card__title--icon={!!statIconUrl}>
                {#if statIconUrl}<img src={statIconUrl} alt="" aria-hidden="true" />{/if}<span
                  ><GameText text={stat.name} /></span
                >
              </h3>
              <span class="skill-effect-tag">属性加成</span>
            </div>
            <p class="trace-card__description">
              <GameText text={stat.description || '上游未提供本地化描述。'} />
            </p>
            <SkillExtraEffects effects={stat.extraEffects ?? []} />
          </article>
        {/each}
      </div>
    </section>
  {/if}
</div>
