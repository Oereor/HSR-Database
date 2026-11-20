<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount, tick } from 'svelte';
  import EnemyVariantSelector from './EnemyVariantSelector.svelte';
  import EnemyVariantIdentity from './EnemyVariantIdentity.svelte';
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
    selectedEnemyMonster,
    type EnemyDetailPageData
  } from '$lib/domain/enemy-view';
  import * as m from '$lib/paraglide/messages.js';
  import { getLocale } from '$lib/paraglide/runtime.js';

  export let detail: EnemyDetailPageData;

  const emptyParams = new URLSearchParams();
  let clientReady = false;
  onMount(() => {
    clientReady = true;
    void tick().then(() => document.documentElement.removeAttribute('data-enemy-variant-pending'));
  });

  let level = getEnemyMonsterStatProgression(
    detail,
    selectedEnemyMonster(detail, emptyParams)
  ).defaultLevel;
  $: selectedMonster = selectedEnemyMonster(
    detail,
    clientReady ? $page.url.searchParams : emptyParams
  );
  $: selectedProgression = getEnemyMonsterStatProgression(detail, selectedMonster);
  $: availableLevels = selectedProgression.availableLevels;
  $: if (
    level < selectedProgression.minLevel ||
    level > selectedProgression.maxLevel ||
    (availableLevels && !availableLevels.includes(level))
  )
    level = selectedProgression.defaultLevel;

  function selectMonster(monsterId: string) {
    const next = new URL($page.url);
    if (monsterId === detail.defaultMonsterId) {
      if (!next.searchParams.has('monster')) return;
      next.searchParams.delete('monster');
    } else {
      if (monsterId === selectedMonster.monsterId) return;
      next.searchParams.set('monster', monsterId);
    }
    void goto(next, { noScroll: true, keepFocus: true });
  }

  const sectionNavItems = [
    { id: 'stats', label: m.enemy_stats_section() },
    { id: 'monsters', label: m.enemy_variants_section() },
    { id: 'skills', label: m.detail_skills() }
  ] as const;
</script>

<svelte:head>
  {#if detail.monsters.length > 1}
    <script>
      {
        // The static HTML contains the default variant until the router can read the query.
        const requested = new URLSearchParams(window.location.search).getAll('monster');
        if (
          document.readyState === 'loading' &&
          requested.length === 1 &&
          /^[0-9]+$/.test(requested[0])
        ) {
          const root = document.documentElement;
          const attribute = 'data-enemy-variant-pending';
          root.setAttribute(attribute, '');
          window.setTimeout(() => root.removeAttribute(attribute), 3000);
        }
      }
    </script>
  {/if}
</svelte:head>

<Card.Root class="gap-0 overflow-hidden p-0 shadow-none">
  <header class="detail-profile-hero detail-profile-hero--enemy" data-enemy-hero>
    <div class="detail-profile-hero__identity">
      <DetailArtwork
        source={detail.portraitUrl}
        width={1024}
        height={1024}
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
</Card.Root>

<SectionNav items={sectionNavItems} />

<section
  id="monsters"
  class="detail-section enemy-detail-section section-nav-target"
  data-enemy-variant-content
>
  <SectionHeading level={1}>{m.enemy_specific_units({}, { locale: getLocale() })}</SectionHeading>

  <div class="mt-4 grid gap-3" data-selected-monster={selectedMonster.monsterId}>
    {#if detail.monsters.length > 1}
      <EnemyVariantSelector
        variants={detail.monsters}
        selected={selectedMonster}
        onSelect={selectMonster}
      />
    {:else}
      <div class="w-full sm:max-w-xl">
        <EnemyVariantIdentity variant={selectedMonster} />
      </div>
    {/if}
    {#if selectedMonster.introduction}
      <p class="text-muted-foreground max-w-prose whitespace-pre-line" data-monster-introduction>
        <GameText text={selectedMonster.introduction} />
      </p>
    {/if}
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
          id={`enemy-level-${detail.template.monsterTemplateId}`}
          label={m.enemy_level()}
          min={availableLevels ? 0 : selectedProgression.minLevel}
          max={availableLevels ? availableLevels.length - 1 : selectedProgression.maxLevel}
          value={availableLevels ? availableLevels.indexOf(level) : level}
          displayValue={level}
          ariaValueMin={selectedProgression.minLevel}
          ariaValueMax={selectedProgression.maxLevel}
          interactive={selectedProgression.minLevel !== selectedProgression.maxLevel}
          onValueChange={(next) => (level = availableLevels?.[next] ?? next)}
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
            <svelte:fragment slot="secondary">
              {getEnemyRankLabel(summon.rank)} · #{summon.monsterId}
            </svelte:fragment>
            <svelte:fragment slot="tertiary">
              <EnemyWeaknessGroup weaknesses={summon.weaknesses} />
            </svelte:fragment>
          </CompactEntityCard>{/each}
      </div>
    </section>{/if}
</section>

<section
  id="skills"
  class="detail-section enemy-detail-section section-nav-target"
  data-enemy-variant-content
>
  <SectionHeading level={1}>{m.detail_skills()}</SectionHeading>
  <EnemySkillBrowser {detail} monsterId={selectedMonster.monsterId} />
</section>

<style>
  :global(html[data-enemy-variant-pending]) [data-enemy-variant-content] {
    visibility: hidden;
  }
</style>
