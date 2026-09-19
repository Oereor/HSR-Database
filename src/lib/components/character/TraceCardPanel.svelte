<script lang="ts">
  import GameText from '$lib/components/shared/GameText.svelte';
  import SectionHeading from '$lib/components/shared/SectionHeading.svelte';
  import SkillExtraEffects from '$lib/components/shared/SkillExtraEffects.svelte';
  import TraceAbilityHeading from '$lib/components/character/TraceAbilityHeading.svelte';
  import { getCharacterDetailIconUrl } from '$lib/data/visual-assets';
  import { groupTracesForDisplay } from '$lib/domain/trace-groups';
  import type { Trace } from '$lib/domain/types';
  import * as m from '$lib/paraglide/messages.js';
  import type { PlayerCharacter } from '$lib/player/contract';
  import {
    createPlayerSkillTreeIndex,
    resolvePlayerTraceState,
    type PlayerProgressionState
  } from '$lib/player/character';

  export let traces: Trace[];
  export let playerSkillTree: PlayerCharacter['skillTree'] | undefined = undefined;

  $: groups = groupTracesForDisplay(traces);
  $: playerSkillTreeIndex = playerSkillTree
    ? createPlayerSkillTreeIndex(playerSkillTree)
    : undefined;

  const playerStateOf = (trace: Trace): PlayerProgressionState | undefined =>
    playerSkillTreeIndex ? resolvePlayerTraceState(trace.id, playerSkillTreeIndex) : undefined;

  const playerStateLabel = (state: PlayerProgressionState): string =>
    state === 'active'
      ? m.player_character_active()
      : state === 'inactive'
        ? m.player_character_inactive()
        : m.player_character_status_unknown();
</script>

<div class="trace-card-panel">
  <div class="trace-ability-groups" data-trace-ability-groups>
    {#each groups.abilityGroups as group (group.ability.id)}
      {@const abilityState = playerStateOf(group.ability)}
      <section class="trace-ability-group" data-trace-group={group.ability.id}>
        <article
          class="trace-card trace-card--ability"
          data-trace-id={group.ability.id}
          data-trace-type="ability"
          data-player-state={abilityState}
        >
          <TraceAbilityHeading trace={group.ability} playerState={abilityState} />
          <p class="trace-card__description">
            <GameText
              text={group.ability.description || m.common_localized_description_unavailable()}
            />
          </p>
          <SkillExtraEffects effects={group.ability.extraEffects ?? []} />
        </article>

        {#each group.stats as stat (stat.id)}
          {@const statIconUrl = getCharacterDetailIconUrl(stat.iconKey)}
          {@const statState = playerStateOf(stat)}
          <article
            class="trace-card trace-card--stat"
            data-trace-id={stat.id}
            data-trace-type="stat"
            data-trace-owner={group.ability.id}
            data-player-state={statState}
          >
            <div class="trace-card__heading">
              <h3 class:trace-card__title--icon={!!statIconUrl}>
                {#if statIconUrl}<img src={statIconUrl} alt="" aria-hidden="true" />{/if}<span
                  ><GameText text={stat.name} /></span
                >
              </h3>
              <div class="trace-card__tags">
                <span class="skill-effect-tag">{m.trace_stat_bonus()}</span>
                {#if statState}<span
                    class="player-progression-state"
                    data-player-state-label={statState}>{playerStateLabel(statState)}</span
                  >{/if}
              </div>
            </div>
            <p class="trace-card__description">
              <GameText text={stat.description || m.common_localized_description_unavailable()} />
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
        >{groups.specialAbilities.length
          ? m.trace_independent()
          : m.trace_independent_stats()}</SectionHeading
      >
      {#each groups.specialAbilities as ability (ability.id)}
        {@const abilityState = playerStateOf(ability)}
        <article
          class="trace-card trace-card--ability trace-card--special"
          data-trace-id={ability.id}
          data-trace-type="ability"
          data-trace-special
          data-player-state={abilityState}
        >
          <TraceAbilityHeading trace={ability} playerState={abilityState} />
          <p class="trace-card__description">
            <GameText text={ability.description || m.common_localized_description_unavailable()} />
          </p>
          <SkillExtraEffects effects={ability.extraEffects ?? []} />
        </article>
      {/each}
      <div class="trace-independent-grid">
        {#each groups.standaloneStats as stat (stat.id)}
          {@const statIconUrl = getCharacterDetailIconUrl(stat.iconKey)}
          {@const statState = playerStateOf(stat)}
          <article
            class="trace-card trace-card--stat"
            data-trace-id={stat.id}
            data-trace-type="stat"
            data-trace-standalone
            data-player-state={statState}
          >
            <div class="trace-card__heading">
              <h3 class:trace-card__title--icon={!!statIconUrl}>
                {#if statIconUrl}<img src={statIconUrl} alt="" aria-hidden="true" />{/if}<span
                  ><GameText text={stat.name} /></span
                >
              </h3>
              <div class="trace-card__tags">
                <span class="skill-effect-tag">{m.trace_stat_bonus()}</span>
                {#if statState}<span
                    class="player-progression-state"
                    data-player-state-label={statState}>{playerStateLabel(statState)}</span
                  >{/if}
              </div>
            </div>
            <p class="trace-card__description">
              <GameText text={stat.description || m.common_localized_description_unavailable()} />
            </p>
            <SkillExtraEffects effects={stat.extraEffects ?? []} />
          </article>
        {/each}
      </div>
    </section>
  {/if}
</div>
