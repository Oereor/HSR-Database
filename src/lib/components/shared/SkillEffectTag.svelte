<script lang="ts">
  import { Badge } from '$lib/components/ui/badge';
  import type { SkillCombatMeta } from '$lib/domain/types';

  export let effect: SkillCombatMeta['effect'];
</script>

{#if effect}<Badge
    variant="outline"
    class="skill-effect-tag text-primary"
    data-skill-effect={effect.code}>{effect.label}</Badge
  >{/if}
