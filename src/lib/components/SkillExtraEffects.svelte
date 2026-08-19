<script lang="ts">
  import GameText from '$lib/components/GameText.svelte';
  import type { SkillExtraEffect } from '$lib/domain/types';

  export let effects: SkillExtraEffect[] = [];
</script>

{#if effects.length}
  <details class="enemy-extra-effects" data-skill-extra-effects>
    <summary>效果说明</summary>
    <div class="enemy-extra-effects__body">
      {#each effects as effect (effect.id)}
        <section data-extra-effect={effect.id}>
          <h4><GameText text={effect.name} /></h4>
          <p><GameText text={effect.description} /></p>
        </section>
      {/each}
    </div>
  </details>
{/if}
