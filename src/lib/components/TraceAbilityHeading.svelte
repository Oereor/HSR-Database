<script lang="ts">
  import GameText from '$lib/components/GameText.svelte';
  import { getCharacterDetailIconUrl } from '$lib/data/visual-assets';
  import type { Trace } from '$lib/domain/types';

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
            <span>解锁条件</span>角色晋阶 {trace.promotionLimit}
          </p>{/if}
      </div>
    </div>
    <span class="skill-effect-tag">额外能力</span>
  </div>
{:else}
  <div class="trace-card__heading">
    <h3><GameText text={trace.name} /></h3>
    <span class="skill-effect-tag">额外能力</span>
  </div>
  {#if trace.promotionLimit}<p class="trace-card__condition">
      <span>解锁条件</span>角色晋阶 {trace.promotionLimit}
    </p>{/if}
{/if}
