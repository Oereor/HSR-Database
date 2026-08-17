<script lang="ts">
  import EnemySkillCard from './EnemySkillCard.svelte';
  import EnemyStatsPanel from './EnemyStatsPanel.svelte';
  import GameText from '$lib/components/GameText.svelte';
  import SemanticIconLabel from '$lib/components/SemanticIconLabel.svelte';
  import { getElementColor } from '$lib/domain/elements';
  import type { EnemyDetailView } from '$lib/domain/enemy-view';

  export let detail: EnemyDetailView;
  let failedPortrait = false;
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
  <div class="enemy-resistance-layout">
    <div>
      <h3>弱点</h3>
      {#if detail.weaknesses.length}<div class="enemy-weakness-list">
          {#each detail.weaknesses as weakness (weakness.element)}<SemanticIconLabel
              kind="element"
              code={weakness.element}
              label={weakness.name}
              color={getElementColor(weakness.element)}
            />{/each}
        </div>{:else}<p class="data-placeholder">暂无弱点数据。</p>{/if}
    </div>
    {#if detail.resistances.length}<div>
        <h3>元素抗性</h3>
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
  </div>
</section>

{#if detail.specialResistances.length}<section
    id="special-resistances"
    class="detail-section enemy-detail-section"
  >
    <div class="section-heading"><h2>特殊状态抗性</h2></div>
    <div class="enemy-special-resistance-list">
      {#each detail.specialResistances as resistance (resistance.code)}<div
          data-special-resistance={resistance.code}
        >
          <span>{resistance.label}</span><strong
            >{new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(
              Number(resistance.value) * 100
            )}%</strong
          >
        </div>{/each}
    </div>
  </section>{/if}

{#if detail.summons.length}<section id="summons" class="detail-section enemy-detail-section">
    <div class="section-heading">
      <h2>召唤单位</h2>
      <span>{detail.summons.length} 个</span>
    </div>
    <div class="enemy-summon-grid">
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
              >ID {summon.monsterTemplateId}</small
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
  {#if detail.skills.length}<div class="enemy-skill-grid">
      {#each detail.skills as skill (skill.id)}<EnemySkillCard {skill} />{/each}
    </div>{:else}<p class="data-placeholder">上游未提供可展示的敌人技能。</p>{/if}
</section>
