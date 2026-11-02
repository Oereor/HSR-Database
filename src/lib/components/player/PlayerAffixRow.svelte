<script lang="ts">
  import { cn } from '$lib/utils.js';
  import AssetImage from '$lib/components/shared/AssetImage.svelte';
  import { getRelicPropertyIconUrl } from '$lib/data/visual-assets';
  import { m } from '$lib/paraglide/messages.js';
  import type { PlayerRelicAffixView } from '$lib/player/equipment';

  export let affix: PlayerRelicAffixView;
  export let presentation: 'main' | 'sub' = 'sub';

  $: imageUrl = getRelicPropertyIconUrl(affix.property?.iconKey);
</script>

<div
  class={cn(
    'text-muted-foreground grid min-h-8 min-w-0 grid-cols-[minmax(0,1fr)_auto_1.5rem] items-center gap-x-2 gap-y-1 border-l-2 border-transparent px-2 py-1.5 text-sm',
    affix.recommended && 'border-primary bg-primary/5',
    presentation === 'main' && 'py-2 text-lg font-semibold'
  )}
  data-affix-presentation={presentation}
  data-affix-type={affix.type}
  data-recommended={affix.recommended}
>
  <span class="flex min-w-0 items-center gap-2 wrap-anywhere">
    <AssetImage
      class={cn('size-5 shrink-0 object-contain', presentation === 'main' && 'size-6')}
      decorative
      src={imageUrl}
      alt=""
      loading="lazy"
      decoding="async"
    />
    <span>{affix.property?.name ?? affix.type}</span>
  </span>
  <strong
    class={cn(
      'text-foreground col-start-2 text-right tabular-nums',
      presentation === 'main' && 'font-semibold'
    )}>{affix.display}</strong
  >
  {#if affix.count !== undefined && affix.count > 0}<span
      class="text-muted-foreground text-right text-xs tabular-nums"
      data-player-affix-count
    >
      <span aria-hidden="true">×{affix.count}</span>
      <span class="sr-only">{m.player_equipment_enhancement_count({ count: affix.count })}</span>
    </span>{/if}
</div>
