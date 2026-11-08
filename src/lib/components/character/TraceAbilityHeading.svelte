<script lang="ts">
  import { Badge } from '$lib/components/ui/badge';
  import AssetImage from '$lib/components/shared/AssetImage.svelte';
  import GameText from '$lib/components/shared/GameText.svelte';
  import { getCharacterDetailIconUrl } from '$lib/data/visual-assets';
  import type { Trace } from '$lib/domain/types';
  import * as m from '$lib/paraglide/messages.js';
  import { traceRequirementText } from './trace-requirements';

  export let trace: Trace;

  $: iconUrl = getCharacterDetailIconUrl(trace.iconKey);
  $: requirements = traceRequirementText(trace.promotionLimit, trace.characterLevelLimit);
</script>

<div class="trace-card__heading trace-card__heading--icon">
  <div class="trace-card__identity">
    <AssetImage src={iconUrl} alt="" fallbackClass="trace-card__icon-fallback" />
    <div>
      <h3><GameText text={trace.name} /></h3>
      <div class="trace-card__condition flex-wrap items-center">
        <Badge variant="outline" class="skill-effect-tag text-primary">
          {trace.type === 'stat' ? m.trace_stat_bonus() : m.trace_extra_ability()}
        </Badge>
        {#if requirements}<span>{m.trace_unlock_condition()}</span>{requirements}{/if}
      </div>
    </div>
  </div>
</div>
