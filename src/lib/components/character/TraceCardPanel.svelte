<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import { Badge } from '$lib/components/ui/badge';
  import AssetImage from '$lib/components/shared/AssetImage.svelte';
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

  import TraceToggle from './TraceToggle.svelte';
  import type { CharacterTrainingProfile } from '$lib/domain/training/types';
  export let trainingProfile: CharacterTrainingProfile | undefined = undefined;
  export let activeTraceIds: string[] | undefined = undefined;
  export let onToggleTrace: ((id: string) => void) | undefined = undefined;

  export let traces: Trace[];
  export let playerSkillTree: PlayerCharacter['skillTree'] | undefined = undefined;

  // Legacy templates must read these dependencies directly after async profile/state updates.
  $: toggleableTraceIds = new Set(
    !playerSkillTree && onToggleTrace
      ? trainingProfile?.nodes.filter((node) => node.kind === 'trace').map((node) => node.pointId)
      : []
  );
  $: activeTraceIdSet = new Set(activeTraceIds ?? []);
  $: groups = groupTracesForDisplay(traces);
  $: playerSkillTreeIndex = playerSkillTree
    ? createPlayerSkillTreeIndex(playerSkillTree)
    : undefined;

  const playerStateOf = (trace: Trace): PlayerProgressionState | undefined =>
    playerSkillTreeIndex ? resolvePlayerTraceState(trace.id, playerSkillTreeIndex) : undefined;
</script>

<div class="trace-card-panel">
  <div class="trace-ability-groups" data-trace-ability-groups>
    {#each groups.abilityGroups as group (group.ability.id)}
      {@const abilityState = playerStateOf(group.ability)}
      <section class="trace-ability-group" data-trace-group={group.ability.id}>
        <Card.Root
          size="sm"
          role="article"
          class="trace-card trace-card--ability relative min-h-44 gap-3 p-6"
          data-trace-id={group.ability.id}
          data-trace-type="ability"
          data-player-state={abilityState}
          data-training-state={toggleableTraceIds.has(group.ability.id)
            ? activeTraceIdSet.has(group.ability.id)
              ? 'active'
              : 'inactive'
            : undefined}
        >
          {#if toggleableTraceIds.has(group.ability.id)}<TraceToggle
              name={group.ability.name}
              active={activeTraceIdSet.has(group.ability.id)}
              onToggle={() => onToggleTrace?.(group.ability.id)}
            />{/if}
          <TraceAbilityHeading trace={group.ability} playerState={abilityState} />
          <p class="trace-card__description">
            <GameText
              text={group.ability.description || m.common_localized_description_unavailable()}
            />
          </p>
          <SkillExtraEffects effects={group.ability.extraEffects ?? []} />
        </Card.Root>

        {#each group.stats as stat (stat.id)}
          {@const statIconUrl = getCharacterDetailIconUrl(stat.iconKey)}
          {@const statState = playerStateOf(stat)}
          <Card.Root
            size="sm"
            role="article"
            class="trace-card trace-card--stat relative min-h-17 gap-1 p-4"
            data-trace-id={stat.id}
            data-trace-type="stat"
            data-trace-owner={group.ability.id}
            data-player-state={statState}
            data-training-state={toggleableTraceIds.has(stat.id)
              ? activeTraceIdSet.has(stat.id)
                ? 'active'
                : 'inactive'
              : undefined}
          >
            {#if toggleableTraceIds.has(stat.id)}<TraceToggle
                name={stat.name}
                active={activeTraceIdSet.has(stat.id)}
                onToggle={() => onToggleTrace?.(stat.id)}
              />{/if}
            <div class="trace-card__heading">
              <h3 class:trace-card__title--icon={!!statIconUrl}>
                {#if statIconUrl}<AssetImage
                    decorative
                    src={statIconUrl}
                    alt=""
                    aria-hidden="true"
                  />{/if}<span><GameText text={stat.name} /></span>
              </h3>
              <div class="trace-card__tags">
                <Badge variant="outline" class="skill-effect-tag text-primary"
                  >{m.trace_stat_bonus()}</Badge
                >
                {#if statState === 'unresolved'}<Badge
                    variant="outline"
                    class="player-progression-state text-primary"
                    data-player-state-label={statState}>{m.player_character_status_unknown()}</Badge
                  >{/if}
              </div>
            </div>
            <p class="trace-card__description">
              <GameText text={stat.description || m.common_localized_description_unavailable()} />
            </p>
            <SkillExtraEffects effects={stat.extraEffects ?? []} />
          </Card.Root>
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
        <Card.Root
          size="sm"
          role="article"
          class="trace-card trace-card--ability trace-card--special relative min-h-44 gap-3 p-6"
          data-trace-id={ability.id}
          data-trace-type="ability"
          data-trace-special
          data-training-state={toggleableTraceIds.has(ability.id)
            ? activeTraceIdSet.has(ability.id)
              ? 'active'
              : 'inactive'
            : undefined}
          data-player-state={abilityState}
        >
          {#if toggleableTraceIds.has(ability.id)}<TraceToggle
              name={ability.name}
              active={activeTraceIdSet.has(ability.id)}
              onToggle={() => onToggleTrace?.(ability.id)}
            />{/if}
          <TraceAbilityHeading trace={ability} playerState={abilityState} />
          <p class="trace-card__description">
            <GameText text={ability.description || m.common_localized_description_unavailable()} />
          </p>
          <SkillExtraEffects effects={ability.extraEffects ?? []} />
        </Card.Root>
      {/each}
      <div class="trace-independent-grid">
        {#each groups.standaloneStats as stat (stat.id)}
          {@const statIconUrl = getCharacterDetailIconUrl(stat.iconKey)}
          {@const statState = playerStateOf(stat)}
          <Card.Root
            size="sm"
            role="article"
            class="trace-card trace-card--stat relative min-h-17 gap-1 p-4"
            data-trace-id={stat.id}
            data-trace-type="stat"
            data-trace-standalone
            data-player-state={statState}
            data-training-state={toggleableTraceIds.has(stat.id)
              ? activeTraceIdSet.has(stat.id)
                ? 'active'
                : 'inactive'
              : undefined}
          >
            {#if toggleableTraceIds.has(stat.id)}<TraceToggle
                name={stat.name}
                active={activeTraceIdSet.has(stat.id)}
                onToggle={() => onToggleTrace?.(stat.id)}
              />{/if}
            <div class="trace-card__heading">
              <h3 class:trace-card__title--icon={!!statIconUrl}>
                {#if statIconUrl}<AssetImage
                    decorative
                    src={statIconUrl}
                    alt=""
                    aria-hidden="true"
                  />{/if}<span><GameText text={stat.name} /></span>
              </h3>
              <div class="trace-card__tags">
                <Badge variant="outline" class="skill-effect-tag text-primary"
                  >{m.trace_stat_bonus()}</Badge
                >
                {#if statState === 'unresolved'}<Badge
                    variant="outline"
                    class="player-progression-state text-primary"
                    data-player-state-label={statState}>{m.player_character_status_unknown()}</Badge
                  >{/if}
              </div>
            </div>
            <p class="trace-card__description">
              <GameText text={stat.description || m.common_localized_description_unavailable()} />
            </p>
            <SkillExtraEffects effects={stat.extraEffects ?? []} />
          </Card.Root>
        {/each}
      </div>
    </section>
  {/if}
</div>
