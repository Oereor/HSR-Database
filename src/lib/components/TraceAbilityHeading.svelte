<script lang="ts">
  import GameText from '$lib/components/GameText.svelte';
  import { getCharacterDetailIconUrl } from '$lib/data/visual-assets';
  import type { Trace } from '$lib/domain/types';
  import * as m from '$lib/paraglide/messages.js';

  export let trace: Trace;

  $: iconUrl = getCharacterDetailIconUrl(trace.iconKey);
</script>

{#if iconUrl}
  <div class="trace-card__heading trace-card__heading--icon">
    <div class="trace-card__identity">
      <img src={iconUrl} alt="" aria-hidden="true" />
      <div>
        <h3><GameText text={trace.name} /></h3>
        {#if trace.promotionLimit}<p class="trace-card__condition">
            <span>{m.trace_unlock_condition()}</span>{m.trace_promotion({
              promotion: trace.promotionLimit
            })}
          </p>{/if}
      </div>
    </div>
    <span class="skill-effect-tag">{m.trace_extra_ability()}</span>
  </div>
{:else}
  <div class="trace-card__heading">
    <h3><GameText text={trace.name} /></h3>
    <span class="skill-effect-tag">{m.trace_extra_ability()}</span>
  </div>
  {#if trace.promotionLimit}<p class="trace-card__condition">
      <span>{m.trace_unlock_condition()}</span>{m.trace_promotion({
        promotion: trace.promotionLimit
      })}
    </p>{/if}
{/if}
