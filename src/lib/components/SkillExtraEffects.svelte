<script lang="ts">
  import EffectExplanationSection from '$lib/components/EffectExplanationSection.svelte';
  import type { SkillExtraEffect } from '$lib/domain/types';

  export let effects: SkillExtraEffect[] = [];
</script>

<EffectExplanationSection {effects} context="skill" />
