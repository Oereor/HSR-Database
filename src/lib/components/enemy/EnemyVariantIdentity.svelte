<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { MonsterVariant } from '$lib/domain/types';
  import GameText from '$lib/components/shared/GameText.svelte';
  import EnemyWeaknessGroup from './EnemyWeaknessGroup.svelte';

  let {
    variant,
    weaknessId,
    children
  }: {
    variant: Pick<MonsterVariant, 'name' | 'monsterId' | 'weaknesses'>;
    weaknessId?: string;
    children?: Snippet;
  } = $props();
</script>

<span class="grid w-full min-w-0 gap-1 text-left">
  <span class="flex min-w-0 items-start justify-between gap-2">
    <span class="min-w-0 font-medium wrap-anywhere" data-monster-name>
      <GameText text={variant.name} />
    </span>
    {@render children?.()}
  </span>
  <span class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
    <span class="text-muted-foreground text-sm tabular-nums">#{variant.monsterId}</span>
    <EnemyWeaknessGroup weaknesses={variant.weaknesses} id={weaknessId} />
  </span>
</span>
