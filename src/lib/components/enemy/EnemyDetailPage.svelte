<script lang="ts">
  import EnemySkillBrowser from './EnemySkillBrowser.svelte';
  import EnemyStatsPanel from './EnemyStatsPanel.svelte';
  import EnemyTemplateBaseStatsPanel from './EnemyTemplateBaseStatsPanel.svelte';
  import EnemyRankTag from './EnemyRankTag.svelte';
  import DetailArtwork from '$lib/components/shared/DetailArtwork.svelte';
  import GameText from '$lib/components/shared/GameText.svelte';
  import CompactEntityCard from '$lib/components/shared/CompactEntityCard.svelte';
  import EnemyWeaknessGroup from '$lib/components/enemy/EnemyWeaknessGroup.svelte';
  import SemanticIconLabel from '$lib/components/shared/SemanticIconLabel.svelte';
  import SectionHeading from '$lib/components/shared/SectionHeading.svelte';
  import SectionNav from '$lib/components/shared/SectionNav.svelte';
  import LevelSlider from '$lib/components/shared/LevelSlider.svelte';
  import StatList from '$lib/components/shared/StatList.svelte';
  import StatRow from '$lib/components/shared/StatRow.svelte';
  import { getElementColor } from '$lib/domain/elements';
  import { formatRatioPercentage } from '$lib/domain/endgame-view';
  import { getEnemyRankLabel } from '$lib/domain/enemy-overview';
  import {
    getEnemyMonsterStatProgression,
    type EnemyDetailPageData,
    type EnemyMonsterPageData
  } from '$lib/domain/enemy-view';
  import * as m from '$lib/paraglide/messages.js';
  import { formatLocalizedList } from '$lib/i18n/format';
  import { getLocale } from '$lib/paraglide/runtime.js';

  export let detail: EnemyDetailPageData;

  function defaultMonsterOf(value: EnemyDetailPageData): EnemyMonsterPageData {
    const monster = value.monsters.find(
      (candidate) => candidate.monsterId === value.defaultMonsterId
    );
    if (!monster)
      throw new Error(`Enemy ${value.id} missing default Monster ${value.defaultMonsterId}`);
    return monster;
  }

  const initialMonster = defaultMonsterOf(detail);
  const initialProgression = getEnemyMonsterStatProgression(detail, initialMonster);
  let selectedMonsterId = detail.defaultMonsterId;
  let level = initialProgression.defaultLevel;

  $: selectedMonster =
    detail.monsters.find((monster) => monster.monsterId === selectedMonsterId) ?? initialMonster;
  $: selectedProgression = getEnemyMonsterStatProgression(detail, selectedMonster);

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

  const monsterWeaknessLabel = (monster: EnemyMonsterPageData): string =>
    monster.weaknesses.length
      ? m.weaknesses_aria({
          weaknesses: formatLocalizedList(
            monster.weaknesses.map((weakness) => weakness.name),
            getLocale()
          )
        })
      : m.enemy_no_weaknesses_short();

  const sectionNavItems = [
    { id: 'stats', label: m.enemy_stats_section() },
    { id: 'monsters', label: m.enemy_variants_section() },
    { id: 'skills', label: m.detail_skills() }
  ] as const;
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
      <p class="kicker">{m.enemy_kicker({ id: detail.template.monsterTemplateId })}</p>
      <h1><GameText text={detail.template.name} /></h1>
      <div class="hero-identity-metadata">
        <EnemyRankTag label={getEnemyRankLabel(detail.template.rank)} />
      </div>
      <div class="hero-description">
        {#if detail.description}<p><GameText text={detail.description} /></p>{:else}<p
            class="muted"
          >
            {m.detail_intro_unavailable()}
          </p>{/if}
      </div>
    </div>
  </div>
  <aside
    id="stats"
    class="detail-profile-hero__inspection section-nav-target hero-basic-data-pane"
    aria-label={m.enemy_template_stats_aria()}
  >
    <EnemyTemplateBaseStatsPanel baseStats={detail.template.baseStats} />
  </aside>
</header>

<SectionNav items={sectionNavItems} />

<section id="monsters" class="detail-section enemy-detail-section section-nav-target">
  <SectionHeading level={1}>{m.enemy_variants_section()}</SectionHeading>

  <div class="enemy-monster-selector" role="radiogroup" aria-label={m.enemy_specific_units()}>
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
          {#if monster.monsterId === detail.defaultMonsterId}<small>{m.enemy_default()}</small>{/if}
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
  <div
    class:enemy-battle-panel--two-column={!selectedMonster.specialResistances.length}
    class="enemy-battle-panel"
    data-battle-columns={selectedMonster.specialResistances.length ? '3' : '2'}
  >
    <section class="enemy-battle-column enemy-battle-column--stats">
      <h3>{m.enemy_base_stats()}</h3>
      <div class="stat-level-control">
        <LevelSlider
          id={`enemy-level-${detail.id}`}
          label={m.enemy_level()}
          min={initialProgression.minLevel}
          max={initialProgression.maxLevel}
          bind:value={level}
        />
      </div>
      <EnemyStatsPanel progression={selectedProgression} {level} />
    </section>
    <section class="enemy-battle-column enemy-battle-column--attributes">
      <h3>{m.enemy_weaknesses_and_resistances()}</h3>
      <div class="enemy-resistance-subsection">
        <h4>{m.enemy_weaknesses()}</h4>
        {#if selectedMonster.weaknesses.length}<div class="enemy-weakness-list">
            {#each selectedMonster.weaknesses as weakness (weakness.element)}<SemanticIconLabel
                kind="element"
                code={weakness.element}
                label={weakness.name}
                color={getElementColor(weakness.element)}
              />{/each}
          </div>{:else}<p class="data-placeholder">{m.enemy_no_weaknesses()}</p>{/if}
      </div>
      {#if selectedMonster.resistances.length}<div class="enemy-resistance-subsection">
          <h4>{m.enemy_resistances()}</h4>
          <StatList spacing="flush">
            {#each selectedMonster.resistances as resistance (resistance.element)}<StatRow
                data-enemy-resistance={resistance.element}
                label={resistance.name}
                value={formatRatioPercentage(resistance.value)}
              >
                <svelte:fragment slot="label">
                  <SemanticIconLabel
                    kind="element"
                    code={resistance.element}
                    label={resistance.name}
                    color={getElementColor(resistance.element)}
                  />
                </svelte:fragment>
              </StatRow>{/each}
          </StatList>
        </div>{/if}
    </section>
    {#if selectedMonster.specialResistances.length}<section
        class="enemy-battle-column enemy-battle-column--negative"
      >
        <h3>{m.enemy_negative_effect_resistance()}</h3>
        <StatList spacing="flush">
          {#each selectedMonster.specialResistances as resistance (resistance.code)}<StatRow
              data-special-resistance={resistance.code}
              label={resistance.label}
              value={formatRatioPercentage(resistance.value)}
            />{/each}
        </StatList>
      </section>{/if}
  </div>

  {#if selectedMonster.summons.length}<section id="summons" class="enemy-owned-section">
      <SectionHeading level={2}>{m.enemy_summons()}</SectionHeading>
      <div class="enemy-summon-list">
        {#each selectedMonster.summons as summon (summon.monsterId)}<CompactEntityCard
            href={summon.href}
            imageUrl={summon.portraitUrl}
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
</section>

<section id="skills" class="detail-section enemy-detail-section section-nav-target">
  <SectionHeading level={1}>{m.detail_skills()}</SectionHeading>
  <EnemySkillBrowser {detail} monsterId={selectedMonsterId} />
</section>
