<script lang="ts">
  import GameText from '$lib/components/GameText.svelte';
  import type { ExtraEffect } from '$lib/domain/types';

  export let effects: ExtraEffect[] = [];
  export let context: 'skill' | 'stage-effect' | 'rogue' = 'skill';
</script>

{#if effects.length}
  <details
    class="enemy-extra-effects effect-explanations"
    data-effect-explanations
    data-skill-extra-effects={context === 'skill' ? true : undefined}
    data-stage-effect-explanations={context === 'stage-effect' ? true : undefined}
    data-rogue-extra-effects={context === 'rogue' ? true : undefined}
  >
    <summary>效果说明</summary>
    <div class="enemy-extra-effects__body">
      {#each effects as effect, index (`${effect.id}:${index}`)}
        <section data-extra-effect={effect.id}>
          <h4><GameText text={effect.name} /></h4>
          <p><GameText text={effect.description} /></p>
        </section>
      {/each}
    </div>
  </details>
{/if}
