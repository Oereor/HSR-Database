<script lang="ts">
  import LevelledEffectPanel from '$lib/components/LevelledEffectPanel.svelte';
  import type { SuperimpositionEffect } from '$lib/domain/types';

  export let effect: SuperimpositionEffect;
  export let lightConeId: string;
</script>

<article class="info-card superimposition-panel">
  <div class="info-card__heading">
    <h3>叠影</h3>
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
