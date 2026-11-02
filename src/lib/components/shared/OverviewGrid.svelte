<script lang="ts">
  import { onMount } from 'svelte';
  export let onColumnsChange: ((columns: number) => void) | undefined = undefined;
  let grid: HTMLDivElement;

  onMount(() => {
    if (!onColumnsChange) return;
    let frame = 0;
    let previous = 0;
    const measure = () => {
      frame = 0;
      if (!grid.getClientRects().length || grid.clientWidth === 0) return;
      const tracks = getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/);
      if (!tracks.length || !tracks.every((track) => /^\d+(?:\.\d+)?px$/.test(track))) return;
      if (tracks.length === previous) return;
      previous = tracks.length;
      onColumnsChange?.(previous);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(grid);
    window.addEventListener('resize', schedule);
    schedule();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      cancelAnimationFrame(frame);
    };
  });
  export let variant: 'default' | 'compact' | 'character' = 'default';
</script>

<div
  bind:this={grid}
  class="overview-grid grid min-w-0 grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(min(100%,12rem),1fr))] sm:gap-4"
  class:overview-grid--compact={variant === 'compact'}
  class:overview-grid--character={variant === 'character'}
>
  <slot />
</div>
