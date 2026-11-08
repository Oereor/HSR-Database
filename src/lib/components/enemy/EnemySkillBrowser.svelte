<script lang="ts">
  import * as Tabs from '$lib/components/ui/tabs';
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
</script>

{#snippet skillPanel()}
  {#if visibleSkills.length}
    <div class="enemy-skill-browser__grid">
      <EnemySkillSelector
        skills={visibleSkills}
        {selectedSkillId}
        onSelect={(skillId) => (selectedSkillId = skillId)}
      />
      {#if selectedSkill}
        <div class="enemy-skill-browser__detail">
          <EnemySkillDetail skill={selectedSkill} />
        </div>
      {/if}
    </div>
  {:else}
    <p class="data-placeholder">
      {allSkills.length ? m.enemy_phase_empty() : m.enemy_skills_empty()}
    </p>
  {/if}
{/snippet}

<div class="enemy-skill-browser" data-enemy-skill-browser data-monster-id={monsterId}>
  {#if selectedMonster && selectedMonster.skillPhases.length > 1}
    <Tabs.Root
      value={String(activePhaseIndex)}
      onValueChange={(value) => selectPhase(Number(value))}
      activationMode="automatic"
      loop
    >
      <Tabs.List
        class="enemy-phase-tabs mb-4 flex flex-wrap gap-2"
        aria-label={m.enemy_skill_phases_aria()}
      >
        {#each selectedMonster.skillPhases as phase (phase.index)}
          <Tabs.Trigger
            value={String(phase.index)}
            id={`enemy-phase-tab-${monsterId}-${phase.index}`}
            class="px-4 py-2">{m.enemy_phase({ phase: phase.index })}</Tabs.Trigger
          >
        {/each}
      </Tabs.List>
      {#each selectedMonster.skillPhases as phase (phase.index)}
        <Tabs.Content
          value={String(phase.index)}
          id={`enemy-phase-panel-${monsterId}-${phase.index}`}
        >
          {#if phase.index === activePhaseIndex}{@render skillPanel()}{/if}
        </Tabs.Content>
      {/each}
    </Tabs.Root>
  {:else if selectedMonster}
    {@render skillPanel()}
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
      top: var(--anchor-offset);
    }
  }
  @media (max-width: 820px) {
    .enemy-skill-browser__grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
