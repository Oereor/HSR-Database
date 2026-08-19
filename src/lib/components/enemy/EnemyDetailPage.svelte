<script lang="ts">
  import EnemySkillCard from './EnemySkillCard.svelte';
  import EnemyStatsPanel from './EnemyStatsPanel.svelte';
  import GameText from '$lib/components/GameText.svelte';
  import SemanticIconLabel from '$lib/components/SemanticIconLabel.svelte';
  import { getElementColor } from '$lib/domain/elements';
  import type { EnemyDetailView } from '$lib/domain/enemy-view';

  export let detail: EnemyDetailView;
  let failedPortrait = false;
  let activePhaseIndex = detail.skillPhases[0]?.index;

  $: if (!detail.skillPhases.some((phase) => phase.index === activePhaseIndex))
    activePhaseIndex = detail.skillPhases[0]?.index;

  function selectPhase(index: number, target?: HTMLElement): void {
    activePhaseIndex = index;
    target?.focus();
  }

  function handlePhaseKeydown(event: KeyboardEvent, currentIndex: number): void {
    const phaseIndexes = detail.skillPhases.map((phase) => phase.index);
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
      document.getElementById(`enemy-phase-tab-${detail.id}-${nextIndex}`) ?? undefined
    );
  }

  const specialResistanceDisplayLabels: Record<string, string> = {
    STAT_CTRL: '控制抵抗',
    STAT_CTRL_Frozen: '冻结抵抗',
    STAT_Confine: '禁锢抵抗',
    STAT_Entangle: '纠缠抵抗',
    STAT_DOT_Burn: '灼烧抵抗',
    STAT_DOT_Electric: '触电抵抗',
    STAT_DOT_Poison: '风化抵抗'
  };

  const specialResistanceLabel = (code: string, fallback: string): string =>
    specialResistanceDisplayLabels[code] ?? fallback;
</script>

<header class:enemy-hero--with-art={detail.portraitUrl && !failedPortrait} class="enemy-hero">
  <div class="enemy-hero__copy">
    <p class="kicker">ENEMY / ID {detail.id}</p>
    <h1><GameText text={detail.name} /></h1>
    {#if detail.description}<p><GameText text={detail.description} /></p>{:else}<p class="muted">
        上游数据未提供可用简介。
      </p>{/if}
  </div>
  {#if detail.portraitUrl && !failedPortrait}<div class="enemy-hero__art" aria-hidden="true">
      <img
        src={detail.portraitUrl}
        alt=""
        loading="eager"
        decoding="async"
        on:error={() => (failedPortrait = true)}
      />
    </div>{/if}
</header>

<section id="stats" class="detail-section enemy-detail-section">
  <div class="section-heading">
    <h2>基础属性</h2>
    <span>Lv.1–100</span>
  </div>
  <EnemyStatsPanel progression={detail.stats} controlId={`enemy-level-${detail.id}`} />
</section>

<section id="resistances" class="detail-section enemy-detail-section">
  <div class="section-heading"><h2>弱点与抗性</h2></div>
  <div
    class:enemy-resistance-surface--single={!detail.specialResistances.length}
    class="enemy-resistance-surface"
  >
    <section class="enemy-resistance-column enemy-resistance-column--attributes">
      <h3>属性</h3>
      <div class="enemy-resistance-subsection">
        <h4>弱点</h4>
        {#if detail.weaknesses.length}<div class="enemy-weakness-list">
            {#each detail.weaknesses as weakness (weakness.element)}<SemanticIconLabel
                kind="element"
                code={weakness.element}
                label={weakness.name}
                color={getElementColor(weakness.element)}
              />{/each}
          </div>{:else}<p class="data-placeholder">暂无弱点数据。</p>{/if}
      </div>
      {#if detail.resistances.length}<div class="enemy-resistance-subsection">
          <h4>抗性</h4>
          <div class="enemy-resistance-table">
            {#each detail.resistances as resistance (resistance.element)}<div
                class="enemy-resistance-row"
                data-enemy-resistance={resistance.element}
              >
                <SemanticIconLabel
                  kind="element"
                  code={resistance.element}
                  label={resistance.name}
                  color={getElementColor(resistance.element)}
                />
                <strong
                  >{new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(
                    resistance.value * 100
                  )}%</strong
                >
              </div>{/each}
          </div>
        </div>{/if}
    </section>
    {#if detail.specialResistances.length}<section
        class="enemy-resistance-column enemy-resistance-column--negative"
      >
        <h3>负面效果抵抗</h3>
        <div class="enemy-special-resistance-table">
          {#each detail.specialResistances as resistance (resistance.code)}<div
              class="enemy-special-resistance-item"
              data-special-resistance={resistance.code}
            >
              <span>{specialResistanceLabel(resistance.code, resistance.label)}</span><strong
                >{new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(
                  Number(resistance.value) * 100
                )}%</strong
              >
            </div>{/each}
        </div>
      </section>{/if}
  </div>
</section>

{#if detail.summons.length}<section id="summons" class="detail-section enemy-detail-section">
    <div class="section-heading">
      <h2>召唤单位</h2>
      <span>{detail.summons.length} 个</span>
    </div>
    <div class="enemy-summon-list">
      {#each detail.summons as summon (summon.monsterTemplateId)}<a
          class="enemy-summon-card"
          href={summon.href}
          data-summon-template={summon.monsterTemplateId}
        >
          <div class="enemy-summon-card__art">
            {#if summon.portraitUrl}<img
                src={summon.portraitUrl}
                alt=""
                loading="lazy"
                decoding="async"
              />{:else}<span aria-hidden="true">✦</span>{/if}
          </div>
          <div>
            <strong><GameText text={summon.name} /></strong><small
              >Enemy · {summon.monsterTemplateId}</small
            >
          </div>
          <span aria-hidden="true">→</span>
        </a>{/each}
    </div>
  </section>{/if}

<section id="skills" class="detail-section enemy-detail-section">
  <div class="section-heading">
    <h2>技能</h2>
    <span>{detail.skills.length} 项</span>
  </div>
  {#if detail.skillPhases.length > 1}
    <div class="enemy-phase-tabs" role="tablist" aria-label="敌人技能阶段">
      {#each detail.skillPhases as phase (phase.index)}
        <button
          id={`enemy-phase-tab-${detail.id}-${phase.index}`}
          class="enemy-phase-tab"
          class:enemy-phase-tab--active={phase.index === activePhaseIndex}
          type="button"
          role="tab"
          aria-selected={phase.index === activePhaseIndex}
          aria-controls={`enemy-phase-panel-${detail.id}-${phase.index}`}
          tabindex={phase.index === activePhaseIndex ? 0 : -1}
          on:click={(event) => selectPhase(phase.index, event.currentTarget)}
          on:keydown={(event) => handlePhaseKeydown(event, phase.index)}>阶段 {phase.index}</button
        >
      {/each}
    </div>
    {#each detail.skillPhases as phase (phase.index)}
      {#if phase.index === activePhaseIndex}
        <div
          id={`enemy-phase-panel-${detail.id}-${phase.index}`}
          class="enemy-skill-list"
          role="tabpanel"
          aria-labelledby={`enemy-phase-tab-${detail.id}-${phase.index}`}
          tabindex="0"
        >
          {#if phase.skills.length}
            {#each phase.skills as skill (skill.id)}<EnemySkillCard {skill} />{/each}
          {:else}<p class="data-placeholder">该阶段没有可展示的技能。</p>{/if}
        </div>
      {/if}
    {/each}
  {:else if detail.skills.length}
    <div class="enemy-skill-list">
      {#each detail.skills as skill (skill.id)}<EnemySkillCard {skill} />{/each}
    </div>
  {:else}<p class="data-placeholder">上游未提供可展示的敌人技能。</p>{/if}
</section>
