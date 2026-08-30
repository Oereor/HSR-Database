<script lang="ts">
  import EnemySkillCard from './EnemySkillCard.svelte';
  import EnemyStatsPanel from './EnemyStatsPanel.svelte';
  import EnemyTemplateBaseStatsPanel from './EnemyTemplateBaseStatsPanel.svelte';
  import EnemyRankTag from './EnemyRankTag.svelte';
  import DetailArtwork from '$lib/components/DetailArtwork.svelte';
  import GameText from '$lib/components/GameText.svelte';
  import CompactEntityCard from '$lib/components/CompactEntityCard.svelte';
  import EnemyWeaknessGroup from '$lib/components/EnemyWeaknessGroup.svelte';
  import SemanticIconLabel from '$lib/components/SemanticIconLabel.svelte';
  import { getElementColor } from '$lib/domain/elements';
  import { formatRatioPercentage } from '$lib/domain/endgame-view';
  import { getEnemyRankLabel } from '$lib/domain/enemy-overview';
  import type { EnemyDetailView, EnemyMonsterDetailView } from '$lib/domain/enemy-view';

  export let detail: EnemyDetailView;

  function defaultMonsterOf(value: EnemyDetailView): EnemyMonsterDetailView {
    const monster = value.monsters.find(
      (candidate) => candidate.monsterId === value.defaultMonsterId
    );
    if (!monster)
      throw new Error(`Enemy ${value.id} 缺少 default Monster ${value.defaultMonsterId}`);
    return monster;
  }

  const initialMonster = defaultMonsterOf(detail);
  let selectedMonsterId = detail.defaultMonsterId;
  let level = initialMonster.stats.defaultLevel;
  let activePhaseIndex = initialMonster.skillPhases[0]?.index;

  $: selectedMonster =
    detail.monsters.find((monster) => monster.monsterId === selectedMonsterId) ?? initialMonster;
  $: if (!selectedMonster.skillPhases.some((phase) => phase.index === activePhaseIndex))
    activePhaseIndex = selectedMonster.skillPhases[0]?.index;

  function selectMonster(monsterId: string, target?: HTMLElement): void {
    selectedMonsterId = monsterId;
    target?.focus();
  }

  function handleMonsterKeydown(event: KeyboardEvent, currentId: string): void {
    const currentPosition = detail.monsters.findIndex((monster) => monster.monsterId === currentId);
    let nextPosition: number;
    if (event.key === 'ArrowRight') nextPosition = (currentPosition + 1) % detail.monsters.length;
    else if (event.key === 'ArrowLeft')
      nextPosition = (currentPosition - 1 + detail.monsters.length) % detail.monsters.length;
    else if (event.key === 'Home') nextPosition = 0;
    else if (event.key === 'End') nextPosition = detail.monsters.length - 1;
    else return;
    event.preventDefault();
    const nextMonster = detail.monsters[nextPosition];
    selectMonster(
      nextMonster.monsterId,
      document.getElementById(`enemy-monster-option-${nextMonster.monsterId}`) ?? undefined
    );
  }

  function selectPhase(index: number, target?: HTMLElement): void {
    activePhaseIndex = index;
    target?.focus();
  }

  function handlePhaseKeydown(event: KeyboardEvent, currentIndex: number): void {
    const phaseIndexes = selectedMonster.skillPhases.map((phase) => phase.index);
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
    selectPhase(
      nextIndex,
      document.getElementById(`enemy-phase-tab-${selectedMonster.monsterId}-${nextIndex}`) ??
        undefined
    );
  }

  const monsterWeaknessLabel = (monster: EnemyMonsterDetailView): string =>
    monster.weaknesses.length
      ? `弱点：${monster.weaknesses.map((weakness) => weakness.name).join('、')}`
      : '无弱点数据';
</script>

<header class="detail-profile-hero detail-profile-hero--enemy" data-enemy-hero>
  <div class="detail-profile-hero__identity">
    <DetailArtwork
      source={detail.portraitUrl}
      width={376}
      height={512}
      fit="contain"
      data-enemy-portrait={detail.template.monsterTemplateId}
    />
    <div class="detail-profile-hero__gradient" aria-hidden="true"></div>
    <div class="hero-identity-copy">
      <p class="kicker">ENEMY / TEMPLATE ID {detail.template.monsterTemplateId}</p>
      <h1><GameText text={detail.template.name} /></h1>
      <div class="hero-identity-metadata">
        <EnemyRankTag label={getEnemyRankLabel(detail.template.rank)} />
      </div>
      <div class="hero-description">
        {#if detail.description}<p><GameText text={detail.description} /></p>{:else}<p
            class="muted"
          >
            上游数据未提供可用简介。
          </p>{/if}
      </div>
    </div>
  </div>
  <aside class="detail-profile-hero__inspection" aria-label="Enemy Template 基础数据">
    <EnemyTemplateBaseStatsPanel baseStats={detail.template.baseStats} />
  </aside>
</header>

<section id="monsters" class="detail-section enemy-detail-section">
  <div class="section-heading">
    <h2>派生个体</h2>
    <span>{detail.monsters.length} 个变种</span>
  </div>

  <div class="skill-level-control enemy-level-control enemy-level-control--standalone">
    <div>
      <label for={`enemy-level-${detail.id}`}>敌人等级</label><output
        for={`enemy-level-${detail.id}`}>Lv.{level}</output
      >
    </div>
    <input
      id={`enemy-level-${detail.id}`}
      type="range"
      min={initialMonster.stats.minLevel}
      max={initialMonster.stats.maxLevel}
      step="1"
      bind:value={level}
      aria-valuetext={`等级 ${level}`}
    />
    <div class="skill-level-range" aria-hidden="true">
      <span>Lv.{initialMonster.stats.minLevel}</span><span>Lv.{initialMonster.stats.maxLevel}</span>
    </div>
  </div>

  {#if detail.monsters.length > 1}
    <div class="enemy-monster-selector" role="radiogroup" aria-label="具体敌方单位">
      {#each detail.monsters as monster (monster.monsterId)}
        <button
          id={`enemy-monster-option-${monster.monsterId}`}
          class:enemy-monster-option--selected={monster.monsterId === selectedMonsterId}
          class="enemy-monster-option"
          type="button"
          role="radio"
          aria-checked={monster.monsterId === selectedMonsterId}
          tabindex={monster.monsterId === selectedMonsterId ? 0 : -1}
          data-monster-option={monster.monsterId}
          on:click={(event) => selectMonster(monster.monsterId, event.currentTarget)}
          on:keydown={(event) => handleMonsterKeydown(event, monster.monsterId)}
        >
          <span class="enemy-monster-option__identity">
            <strong>#{monster.monsterId}</strong>
            {#if monster.monsterId === detail.defaultMonsterId}<small>默认</small>{/if}
          </span>
          <span class="enemy-monster-option__weaknesses" aria-label={monsterWeaknessLabel(monster)}>
            {#each monster.weaknesses as weakness (weakness.element)}<span aria-hidden="true"
                ><SemanticIconLabel
                  kind="element"
                  code={weakness.element}
                  label={weakness.name}
                  color={getElementColor(weakness.element)}
                  showLabel={false}
                /></span
              >{/each}
          </span>
        </button>
      {/each}
    </div>
  {/if}

  <div class="enemy-selected-monster-heading">
    <span>MONSTER ID</span>
    <h3>#{selectedMonster.monsterId}</h3>
  </div>
  <div
    class:enemy-battle-panel--two-column={!selectedMonster.specialResistances.length}
    class="enemy-battle-panel"
    data-battle-columns={selectedMonster.specialResistances.length ? '3' : '2'}
  >
    <section class="enemy-battle-column enemy-battle-column--stats">
      <h3>基础属性</h3>
      <EnemyStatsPanel progression={selectedMonster.stats} {level} />
    </section>
    <section class="enemy-battle-column enemy-battle-column--attributes">
      <h3>弱点与抗性</h3>
      <div class="enemy-resistance-subsection">
        <h4>弱点</h4>
        {#if selectedMonster.weaknesses.length}<div class="enemy-weakness-list">
            {#each selectedMonster.weaknesses as weakness (weakness.element)}<SemanticIconLabel
                kind="element"
                code={weakness.element}
                label={weakness.name}
                color={getElementColor(weakness.element)}
              />{/each}
          </div>{:else}<p class="data-placeholder">暂无弱点数据。</p>{/if}
      </div>
      {#if selectedMonster.resistances.length}<div class="enemy-resistance-subsection">
          <h4>抗性</h4>
          <div class="enemy-resistance-table">
            {#each selectedMonster.resistances as resistance (resistance.element)}<div
                class="enemy-resistance-row"
                data-enemy-resistance={resistance.element}
              >
                <SemanticIconLabel
                  kind="element"
                  code={resistance.element}
                  label={resistance.name}
                  color={getElementColor(resistance.element)}
                />
                <strong>{formatRatioPercentage(resistance.value)}</strong>
              </div>{/each}
          </div>
        </div>{/if}
    </section>
    {#if selectedMonster.specialResistances.length}<section
        class="enemy-battle-column enemy-battle-column--negative"
      >
        <h3>负面效果抵抗</h3>
        <div class="enemy-special-resistance-table">
          {#each selectedMonster.specialResistances as resistance (resistance.code)}<div
              class="enemy-special-resistance-item"
              data-special-resistance={resistance.code}
            >
              <span>{resistance.label}</span><strong
                >{formatRatioPercentage(resistance.value)}</strong
              >
            </div>{/each}
        </div>
      </section>{/if}
  </div>

  {#if selectedMonster.summons.length}<section id="summons" class="enemy-owned-section">
      <div class="section-heading">
        <h3>召唤单位</h3>
        <span>{selectedMonster.summons.length} 个</span>
      </div>
      <div class="enemy-summon-list">
        {#each selectedMonster.summons as summon (summon.monsterId)}<CompactEntityCard
            href={summon.href}
            imageUrl={summon.portraitUrl}
            fallbackLabel={summon.name}
            data-summon-monster={summon.monsterId}
            data-summon-template={summon.monsterTemplateId}
          >
            <svelte:fragment slot="title"><GameText text={summon.name} /></svelte:fragment>
            <svelte:fragment slot="secondary">{getEnemyRankLabel(summon.rank)}</svelte:fragment>
            <svelte:fragment slot="tertiary">
              <EnemyWeaknessGroup weaknesses={summon.weaknesses} />
            </svelte:fragment>
          </CompactEntityCard>{/each}
      </div>
    </section>{/if}

  <section id="skill-groups" class="enemy-owned-section">
    <div class="section-heading"><h3>技能组</h3></div>
    {#if selectedMonster.skillPhases.length > 1}
      <div class="enemy-phase-tabs" role="tablist" aria-label="敌人技能阶段">
        {#each selectedMonster.skillPhases as phase (phase.index)}
          <button
            id={`enemy-phase-tab-${selectedMonster.monsterId}-${phase.index}`}
            class="enemy-phase-tab"
            class:enemy-phase-tab--active={phase.index === activePhaseIndex}
            type="button"
            role="tab"
            aria-selected={phase.index === activePhaseIndex}
            aria-controls={`enemy-phase-panel-${selectedMonster.monsterId}-${phase.index}`}
            tabindex={phase.index === activePhaseIndex ? 0 : -1}
            on:click={(event) => selectPhase(phase.index, event.currentTarget)}
            on:keydown={(event) => handlePhaseKeydown(event, phase.index)}
            >阶段 {phase.index}</button
          >
        {/each}
      </div>
    {/if}
    {#each selectedMonster.skillPhases as phase (phase.index)}
      {#if phase.index === activePhaseIndex}
        <div
          id={`enemy-phase-panel-${selectedMonster.monsterId}-${phase.index}`}
          class="enemy-skill-reference-list"
          role={selectedMonster.skillPhases.length > 1 ? 'tabpanel' : undefined}
          aria-labelledby={selectedMonster.skillPhases.length > 1
            ? `enemy-phase-tab-${selectedMonster.monsterId}-${phase.index}`
            : undefined}
        >
          {#if phase.skills.length}
            {#each phase.skills as skill (skill.id)}<a
                class="enemy-skill-reference"
                href={skill.href}
                data-enemy-skill-reference={skill.id}
              >
                <span class="enemy-skill-reference__icon" aria-hidden="true">
                  {#if skill.damageType}<SemanticIconLabel
                      kind="element"
                      code={skill.damageType.element}
                      label={skill.damageType.name}
                      color={getElementColor(skill.damageType.element)}
                      showLabel={false}
                    />{/if}
                </span>
                <strong><GameText text={skill.name} /></strong><span aria-hidden="true">↘</span>
              </a>{/each}
          {:else}<p class="data-placeholder">该阶段没有可展示的技能。</p>{/if}
        </div>
      {/if}
    {/each}
  </section>
</section>

<section id="skills" class="detail-section enemy-detail-section">
  <div class="section-heading">
    <h2>技能</h2>
    <span>{detail.skillDefinitions.length} 项</span>
  </div>
  {#if detail.skillDefinitions.length}<div class="enemy-skill-list">
      {#each detail.skillDefinitions as skill (skill.id)}<EnemySkillCard {skill} />{/each}
    </div>{:else}<p class="data-placeholder">上游未提供可展示的敌人技能。</p>{/if}
</section>
