<script lang="ts">
  import { onMount } from 'svelte';
  import { createEndgameClock } from '$lib/client/endgame-clock';
  import { afterNavigate } from '$app/navigation';
  import GameText from '$lib/components/shared/GameText.svelte';
  import SectionHeading from '$lib/components/shared/SectionHeading.svelte';
  import EndgameLocalNav from '$lib/components/endgame/EndgameLocalNav.svelte';
  import EndgameModeNav from '$lib/components/endgame/EndgameModeNav.svelte';
  import EndgameSeasonHero from '$lib/components/endgame/EndgameSeasonHero.svelte';
  import AnomalyArbitrationDetailContent from '$lib/components/endgame/modes/AnomalyArbitrationDetailContent.svelte';
  import ApocalypticShadowDetailContent from '$lib/components/endgame/modes/ApocalypticShadowDetailContent.svelte';
  import EndgameNodeSection from '$lib/components/endgame/EndgameNodeSection.svelte';
  import MocMechanicsSection from '$lib/components/endgame/modes/MocMechanicsSection.svelte';
  import PureFictionDetailContent from '$lib/components/endgame/modes/PureFictionDetailContent.svelte';
  import {
    buildAnomalyArbitrationLocalNavigation,
    buildApocalypticShadowLocalNavigation,
    buildMocLocalNavigation,
    buildPureFictionLocalNavigation
  } from '$lib/domain/endgame-navigation';
  import { refreshEndgamePeriod, type EndgameGroupView } from '$lib/domain/endgame-view';
  import { formatDocumentTitle } from '$lib/site';
  import { m } from '$lib/paraglide/messages.js';
  export let data;

  const clock = createEndgameClock(() => data.group.periods);
  onMount(clock.mount);
  afterNavigate(clock.refresh);
  $: period =
    $clock === undefined ? data.group.period : refreshEndgamePeriod(data.group.period, $clock);

  function buildLocalNavigation(group: EndgameGroupView, selectedId: string) {
    if (group.mode === 'moc') return buildMocLocalNavigation(group.encounters, selectedId);
    if (group.mode === 'pf') return buildPureFictionLocalNavigation(group.encounters, selectedId);
    if (group.mode === 'as')
      return buildApocalypticShadowLocalNavigation(group.encounters, selectedId);
    return buildAnomalyArbitrationLocalNavigation(group.encounters, selectedId);
  }

  let requestedEncounter: string | null = null;
  afterNavigate(() => {
    requestedEncounter = new URL(window.location.href).searchParams.get('encounter');
  });
  $: selectedEncounter =
    data.group.encounters.find((encounter) => encounter.id === requestedEncounter) ??
    data.group.encounters.find((encounter) => encounter.id === data.group.defaultEncounterId) ??
    data.group.encounters[0];
  $: localNavigation = selectedEncounter
    ? buildLocalNavigation(data.group, selectedEncounter.id)
    : undefined;
  $: judgmentQuadrant =
    data.group.mode === 'aa' &&
    selectedEncounter?.mode === 'aa' &&
    selectedEncounter.judgmentQuadrantKey === data.group.judgmentQuadrant?.key
      ? data.group.judgmentQuadrant
      : undefined;
</script>

<svelte:head>
  <title>{formatDocumentTitle(`${data.group.period.name} · ${data.group.modeLabel}`)}</title>
  <meta
    name="description"
    content={m.endgame_group_description({
      mode: data.group.modeLabel,
      period: data.group.period.name
    })}
  />
</svelte:head>

<EndgameModeNav activeMode={data.group.mode} />
<EndgameSeasonHero {period} />

{#if selectedEncounter && localNavigation}
  <div
    class="endgame-content-layout grid grid-cols-[136px_minmax(0,1fr)] items-start gap-6 [@media(max-width:1080px)]:grid-cols-1 [@media(max-width:1080px)]:gap-4"
  >
    <EndgameLocalNav navigation={localNavigation} />
    <div class="endgame-main-content @container/endgame-main min-w-0">
      {#if data.group.mode === 'aa' && selectedEncounter.mode === 'aa'}
        <AnomalyArbitrationDetailContent encounter={selectedEncounter} {judgmentQuadrant} />
      {:else if data.group.mode === 'pf' && selectedEncounter.mode === 'pf'}
        <PureFictionDetailContent group={data.group} encounter={selectedEncounter} />
      {:else if data.group.mode === 'as' && selectedEncounter.mode === 'as'}
        <ApocalypticShadowDetailContent encounter={selectedEncounter} />
      {:else if data.group.mode === 'moc' && selectedEncounter.mode === 'moc'}
        {#if data.group.mode === 'moc' && data.group.memoryTurbulence}
          <div class="endgame-group-mechanics mb-8 [&>.endgame-mechanics-section:last-child]:mb-0">
            <MocMechanicsSection mechanic={data.group.memoryTurbulence} />
          </div>
        {/if}

        <section class="moc-encounter-heading min-w-0" aria-labelledby="moc-encounter-title">
          <SectionHeading level={1} id="moc-encounter-title">
            <GameText text={selectedEncounter.label} />
          </SectionHeading>
        </section>

        {#if selectedEncounter.memoryTurbulence}
          <MocMechanicsSection mechanic={selectedEncounter.memoryTurbulence} />
        {/if}

        <div class="moc-node-list grid min-w-0 gap-8 min-[521px]:gap-12">
          {#each selectedEncounter.battles as battle (battle.slot)}
            <EndgameNodeSection {battle} waveLayout="paired" enemyVariant="standard" />
          {/each}
        </div>
      {/if}
    </div>
  </div>
{:else}
  <p class="data-placeholder">{m.endgame_group_empty()}</p>
{/if}
