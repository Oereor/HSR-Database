<script lang="ts">
  import type { Trace } from '$lib/domain/types';
  import DescriptionText from '$lib/components/shared/DescriptionText.svelte';
  import GameText from '$lib/components/shared/GameText.svelte';
  import SkillExtraEffects from '$lib/components/shared/SkillExtraEffects.svelte';
  import TraceAbilityHeading from './TraceAbilityHeading.svelte';
  import { m } from '$lib/paraglide/messages.js';
  export let characterAccent: string | undefined = undefined;
  export let trace: Trace;
</script>

<div class="space-y-3">
  <TraceAbilityHeading {trace} />
  <p class="trace-card__description">
    {#if trace.descriptionTokens?.length}
      <DescriptionText tokens={trace.descriptionTokens} {characterAccent} />
    {:else}<GameText
        text={trace.description || m.common_localized_description_unavailable()}
      />{/if}
  </p>
  <SkillExtraEffects effects={trace.extraEffects ?? []} {characterAccent} />
</div>
