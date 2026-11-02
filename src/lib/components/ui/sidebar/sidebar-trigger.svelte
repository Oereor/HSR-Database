<script lang="ts">
  import { m } from '$lib/paraglide/messages.js';
  import PanelLeftIcon from '@lucide/svelte/icons/panel-left';
  import { Button } from '$lib/components/ui/button/index.js';
  import { cn } from '$lib/utils.js';
  import { useSidebar } from './context.svelte.js';
  import type { ComponentProps } from 'svelte';

  let {
    ref = $bindable(null),
    class: className,
    onclick,
    ...restProps
  }: ComponentProps<typeof Button> & {
    onclick?: (e: MouseEvent) => void;
  } = $props();

  const sidebar = useSidebar();
</script>

<Button
  bind:ref
  data-sidebar="trigger"
  data-slot="sidebar-trigger"
  variant="ghost"
  size="icon-sm"
  class={cn(className)}
  type="button"
  aria-label={sidebar.isMobile
    ? sidebar.openMobile
      ? m.navigation_close()
      : m.navigation_open()
    : sidebar.open
      ? m.navigation_close()
      : m.navigation_open()}
  aria-expanded={sidebar.isMobile ? sidebar.openMobile : sidebar.open}
  aria-controls="primary-navigator-pane"
  onclick={(e) => {
    onclick?.(e);
    sidebar.trigger = e.currentTarget as HTMLButtonElement;
    sidebar.toggle();
  }}
  {...restProps}
>
  <PanelLeftIcon class="cn-rtl-flip" />
</Button>
