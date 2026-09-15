<script lang="ts">
  import EffectExplanationSection from '$lib/components/shared/EffectExplanationSection.svelte';
  import type { SkillExtraEffect } from '$lib/domain/types';

  export let effects: SkillExtraEffect[] = [];
</script>

<EffectExplanationSection {effects} context="skill" />
