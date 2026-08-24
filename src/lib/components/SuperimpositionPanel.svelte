<script lang="ts">
  import GameText from '$lib/components/GameText.svelte';
  import LevelledEffectPanel from '$lib/components/LevelledEffectPanel.svelte';
  import type { LightConePassiveSkill } from '$lib/domain/types';

  export let passive: LightConePassiveSkill;
  export let lightConeId: string;

  $: effect = passive.superimposition;
</script>

<article class="info-card superimposition-panel">
  <div class="info-card__heading">
    <h3><GameText text={passive.name} /></h3>
    <span>{effect.levels.length ? `${effect.levels.length} 个等级` : '暂无等级'}</span>
  </div>
  <LevelledEffectPanel
    levels={effect.levels}
    controlId={`superimposition-level-${lightConeId}`}
    controlLabel="叠影等级"
    emptyDescription="上游原始数据未提供该叠影描述。"
    defaultLevel={effect.levels[0]?.level}
  />
</article>
