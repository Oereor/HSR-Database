<script lang="ts">
  import GameText from '$lib/components/GameText.svelte';
  import SkillExtraEffects from '$lib/components/SkillExtraEffects.svelte';
  import { getCharacterDetailIconUrl } from '$lib/data/visual-assets';
  import type { Eidolon } from '$lib/domain/types';
  import { m } from '$lib/paraglide/messages.js';

  export let eidolon: Eidolon;

  $: iconUrl = getCharacterDetailIconUrl(eidolon.iconKey);
</script>

<article class="info-card rank-card" data-eidolon-id={eidolon.id}>
  {#if iconUrl}<img class="rank-icon" src={iconUrl} alt="" aria-hidden="true" />{:else}<span
      class="rank-number">{eidolon.rank}</span
    >{/if}
  <div>
    {#if iconUrl}<small class="rank-label">{m.eidolon_rank({ rank: eidolon.rank })}</small>{/if}
    <h3><GameText text={eidolon.name} /></h3>
    <p><GameText text={eidolon.description || m.common_localized_description_unavailable()} /></p>
    <SkillExtraEffects effects={eidolon.extraEffects ?? []} />
  </div>
</article>
