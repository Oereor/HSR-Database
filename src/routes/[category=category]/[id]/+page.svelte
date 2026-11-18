<script lang="ts">
  import DetailPage from '$lib/components/shared/DetailPage.svelte';
  import { categorySingular } from '$lib/i18n/product';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { localizedHref } from '$lib/i18n/routing';
  import { useTrailblazerPreference } from '$lib/client/trailblazer-preference';
  import {
    staticTrailblazerText,
    trailblazerGender,
    withTrailblazerGender
  } from '$lib/domain/trailblazer';
  import type { PageData } from './$types';

  export let data: PageData;
  const trailblazer = useTrailblazerPreference().state;
  $: playerRoute =
    data.category === 'characters' &&
    $trailblazer.ready &&
    ($page.url.searchParams.has('uid') || $page.url.searchParams.has('build'));
  $: staticGender = playerRoute ? undefined : $trailblazer.gender;
  $: detail = staticGender
    ? staticTrailblazerText(data.detail, trailblazerGender(String(data.detail.id)) ?? staticGender)
    : data.detail;
  $: if ($trailblazer.ready && staticGender && data.category === 'characters') {
    const id = String(data.detail.id);
    const preferred = withTrailblazerGender(id, staticGender);
    if (preferred !== id)
      void goto(
        localizedHref(`/characters/${preferred}/${$page.url.search}${$page.url.hash}`, data.locale),
        { replaceState: true, keepFocus: true }
      );
  }
</script>

<DetailPage
  {detail}
  category={data.category}
  singular={categorySingular(data.category)}
  specialEffectTargets={data.specialEffectTargets}
  equipmentRecommendation={data.equipmentRecommendation}
  teamRecommendations={data.teamRecommendations}
  relicProperties={data.relicProperties}
  trailblazerPreference={staticGender}
/>
