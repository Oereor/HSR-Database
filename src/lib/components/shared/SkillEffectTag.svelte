<script lang="ts">
  import type { SkillCombatMeta } from '$lib/domain/types';

  export let effect: SkillCombatMeta['effect'];
</script>

{#if effect}<span class="skill-effect-tag" data-skill-effect={effect.code}>{effect.label}</span
  >{/if}
