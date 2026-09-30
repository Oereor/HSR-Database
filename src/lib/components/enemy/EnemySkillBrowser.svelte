<script lang="ts">
  import EnemySkillDetail from './EnemySkillDetail.svelte';
  import EnemySkillSelector from './EnemySkillSelector.svelte';
  import { enemySkillsInPhase, resolveEnemySkillSelection } from '$lib/domain/enemy-skill-browser';
  import { getEnemySkillsForMonster, type EnemyDetailPageData } from '$lib/domain/enemy-view';
  import * as m from '$lib/paraglide/messages.js';

  export let detail: EnemyDetailPageData;
  export let monsterId: string;

  const initialMonster = detail.monsters.find((monster) => monster.monsterId === monsterId);
  if (!initialMonster) throw new Error(`Enemy ${detail.id} 缺少 Monster ${monsterId}`);
  const initialSelection = resolveEnemySkillSelection(
    getEnemySkillsForMonster(detail, monsterId),
    initialMonster.skillPhases,
    initialMonster.skillPhases[0]?.index,
    undefined
  );
  let activePhaseIndex = initialSelection.phaseIndex;
  let selectedSkillId = initialSelection.skillId;
  let previousMonsterId = monsterId;

  $: selectedMonster = detail.monsters.find((monster) => monster.monsterId === monsterId);
  $: allSkills = getEnemySkillsForMonster(detail, monsterId);
  $: if (monsterId !== previousMonsterId && selectedMonster) {
    const nextSelection = resolveEnemySkillSelection(
      allSkills,
      selectedMonster.skillPhases,
      activePhaseIndex,
      selectedSkillId
    );
    activePhaseIndex = nextSelection.phaseIndex;
    selectedSkillId = nextSelection.skillId;
    // The next prop update reads this value to distinguish a Monster change.
    // eslint-disable-next-line no-useless-assignment
    previousMonsterId = monsterId;
  }
  $: activePhase = selectedMonster?.skillPhases.find((phase) => phase.index === activePhaseIndex);
  $: visibleSkills = enemySkillsInPhase(allSkills, activePhase);
  $: selectedSkill =
    visibleSkills.find((skill) => skill.id === selectedSkillId) ?? visibleSkills[0];

  function selectPhase(index: number): void {
    activePhaseIndex = index;
    const phase = selectedMonster?.skillPhases.find((candidate) => candidate.index === index);
    const nextSkills = enemySkillsInPhase(allSkills, phase);
    if (!nextSkills.some((skill) => skill.id === selectedSkillId))
      selectedSkillId = nextSkills[0]?.id;
  }

  function handlePhaseKeydown(event: KeyboardEvent, currentIndex: number): void {
    const phaseIndexes = selectedMonster?.skillPhases.map((phase) => phase.index) ?? [];
    const currentPosition = phaseIndexes.indexOf(currentIndex);
    let nextPosition: number;
    if (event.key === 'ArrowRight') nextPosition = (currentPosition + 1) % phaseIndexes.length;
    else if (event.key === 'ArrowLeft')
      nextPosition = (currentPosition - 1 + phaseIndexes.length) % phaseIndexes.length;
    else if (event.key === 'Home') nextPosition = 0;
    else if (event.key === 'End') nextPosition = phaseIndexes.length - 1;
    else return;
    event.preventDefault();
    const nextIndex = phaseIndexes[nextPosition];
    selectPhase(nextIndex);
    document.getElementById(`enemy-phase-tab-${monsterId}-${nextIndex}`)?.focus();
  }
</script>

<div class="enemy-skill-browser" data-enemy-skill-browser data-monster-id={monsterId}>
  {#if selectedMonster && selectedMonster.skillPhases.length > 1}
    <div class="enemy-phase-tabs" role="tablist" aria-label={m.enemy_skill_phases_aria()}>
      {#each selectedMonster.skillPhases as phase (phase.index)}
        <button
          id={`enemy-phase-tab-${monsterId}-${phase.index}`}
          class="enemy-phase-tab"
          class:enemy-phase-tab--active={phase.index === activePhaseIndex}
          type="button"
          role="tab"
          aria-selected={phase.index === activePhaseIndex}
          aria-controls={`enemy-phase-panel-${monsterId}-${phase.index}`}
          tabindex={phase.index === activePhaseIndex ? 0 : -1}
          on:click={() => selectPhase(phase.index)}
          on:keydown={(event) => handlePhaseKeydown(event, phase.index)}
          >{m.enemy_phase({ phase: phase.index })}</button
        >
      {/each}
    </div>
  {/if}

  {#if selectedMonster}
    <div
      id={activePhaseIndex === undefined
        ? undefined
        : `enemy-phase-panel-${monsterId}-${activePhaseIndex}`}
      role={selectedMonster.skillPhases.length > 1 ? 'tabpanel' : undefined}
      aria-labelledby={selectedMonster.skillPhases.length > 1
        ? `enemy-phase-tab-${monsterId}-${activePhaseIndex}`
        : undefined}
    >
      {#if visibleSkills.length}
        <div class="enemy-skill-browser__grid">
          <EnemySkillSelector
            skills={visibleSkills}
            {selectedSkillId}
            onSelect={(skillId) => (selectedSkillId = skillId)}
          />
          {#if selectedSkill}<div class="enemy-skill-browser__detail">
              <EnemySkillDetail skill={selectedSkill} />
            </div>{/if}
        </div>
      {:else}<p class="data-placeholder">
          {allSkills.length ? m.enemy_phase_empty() : m.enemy_skills_empty()}
        </p>{/if}
    </div>
  {/if}
</div>

<style>
  .enemy-skill-browser {
    min-width: 0;
  }
  .enemy-skill-browser__grid {
    display: grid;
    grid-template-columns: minmax(18rem, 32%) minmax(0, 1fr);
    align-items: start;
    gap: var(--space-4);
  }
  .enemy-skill-browser__detail {
    min-width: 0;
  }
  @media (min-width: 821px) {
    .enemy-skill-browser__detail {
      position: sticky;
      top: calc(var(--site-header-height) + var(--section-nav-height) + var(--space-4));
    }
  }
  @media (max-width: 820px) {
    .enemy-skill-browser__grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
