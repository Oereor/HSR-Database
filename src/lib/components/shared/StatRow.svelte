<script lang="ts">
  import { Separator } from '$lib/components/ui/separator';
  import { cn } from '$lib/utils.js';
  import AssetImage from './AssetImage.svelte';

  export let label: string;
  export let value: string | number;
  export let iconUrl: string | undefined = undefined;
  export let tone: 'default' | 'scaling' = 'default';
</script>

<div
  {...$$restProps}
  class="inspection-stat-row hero-stat-row group/stat-row relative grid min-h-10 grid-cols-[minmax(0,1fr)_fit-content(50%)] items-center gap-4 py-2"
>
  <dt class="text-muted-foreground min-w-0 text-sm wrap-anywhere">
    <Separator
      class="bg-border/60 absolute top-0 right-0 left-(--stat-divider-inset) group-first/stat-row:hidden data-horizontal:w-auto"
    />
    <span
      class="inspection-stat-label grid grid-cols-(--stat-label-columns) items-center gap-(--stat-label-gap)"
    >
      {#if iconUrl}
        <span class="hero-stat-icon flex w-6 items-center justify-center" aria-hidden="true">
          <AssetImage class="size-5 shrink-0 object-contain" decorative src={iconUrl} alt="" />
        </span>
      {/if}
      <span class="hero-stat-label-text col-start-[-2] min-w-0"
        ><slot name="label">{label}</slot></span
      >
    </span>
  </dt>
  <dd class="m-0 min-w-0 text-right wrap-anywhere">
    <strong
      class={cn(
        'text-base tabular-nums',
        tone === 'scaling' ? 'text-(--skill-scaling-value-color)' : 'text-foreground'
      )}
      class:scaling-value={tone === 'scaling'}>{value}</strong
    >
  </dd>
</div>
