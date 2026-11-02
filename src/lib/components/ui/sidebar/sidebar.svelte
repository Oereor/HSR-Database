<script lang="ts">
  import { MediaQuery } from 'svelte/reactivity';
  import * as Sheet from '$lib/components/ui/sheet/index.js';
  import { cn, type WithElementRef } from '$lib/utils.js';
  import { SIDEBAR_WIDTH_MOBILE } from './constants.js';
  import { useSidebar } from './context.svelte.js';
  import { m } from '$lib/paraglide/messages.js';
  import type { HTMLAttributes } from 'svelte/elements';

  let {
    ref = $bindable(null),
    side = 'left',
    variant = 'sidebar',
    collapsible = 'offcanvas',
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
    side?: 'left' | 'right';
    variant?: 'sidebar' | 'floating' | 'inset';
    collapsible?: 'offcanvas' | 'icon' | 'none';
  } = $props();

  const sidebar = useSidebar();
  const reducedMotion = new MediaQuery('(prefers-reduced-motion: reduce)');
  let panel = $state<HTMLDivElement | null>(null);

  function settleIfIdle() {
    if (!sidebar.open || sidebar.isMobile || !panel) return;
    const transitioning = panel
      .getAnimations()
      .some(
        (animation) =>
          animation instanceof CSSTransition &&
          animation.transitionProperty === 'width' &&
          animation.playState !== 'finished'
      );
    if (!transitioning) sidebar.expandedReady = true;
  }
  $effect(() => {
    sidebar.expandedReady = false;
    if (sidebar.isMobile || collapsible === 'none' || (sidebar.open && reducedMotion.current)) {
      sidebar.expandedReady = true;
      return;
    }
    if (!sidebar.open || !panel) return;
    // Inspect the actual transition after layout; no timer assumes how long it takes.
    const frame = requestAnimationFrame(settleIfIdle);
    return () => cancelAnimationFrame(frame);
  });
  function handleTransitionEnd(event: TransitionEvent) {
    if (event.target === event.currentTarget && event.propertyName === 'width') settleIfIdle();
  }
</script>

{#if collapsible === 'none'}
  <div
    class={cn(
      'bg-sidebar text-sidebar-foreground flex h-full w-(--sidebar-width) flex-col',
      className
    )}
    bind:this={ref}
    {...restProps}
  >
    {@render children?.()}
  </div>
{:else if sidebar.isMobile}
  <Sheet.Root bind:open={() => sidebar.openMobile, (v) => sidebar.setOpenMobile(v)} {...restProps}>
    <Sheet.Content
      bind:ref
      id="primary-navigator-pane"
      showCloseButton={false}
      aria-describedby={undefined}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        const trigger = sidebar.trigger;
        if (trigger?.isConnected && trigger.getClientRects().length)
          trigger.focus({ preventScroll: true });
      }}
      data-sidebar="sidebar"
      data-slot="sidebar"
      data-mobile="true"
      class={cn('bg-sidebar text-sidebar-foreground border-sidebar-border p-0', className)}
      style="--sidebar-width: {SIDEBAR_WIDTH_MOBILE}; width: var(--sidebar-width); height: 100dvh;"
      {side}
    >
      <Sheet.Header class="sr-only">
        <Sheet.Title>{m.navigation_full_aria()}</Sheet.Title>
      </Sheet.Header>
      <div
        class="flex h-full w-full flex-col overflow-y-auto pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      >
        {@render children?.()}
      </div>
    </Sheet.Content>
  </Sheet.Root>
{:else}
  <div
    bind:this={ref}
    class="group peer text-sidebar-foreground hidden md:block"
    data-state={sidebar.state}
    data-collapsible={sidebar.state === 'collapsed' ? collapsible : ''}
    data-variant={variant}
    data-side={side}
    data-slot="sidebar"
  >
    <!-- This is what handles the sidebar gap on desktop -->
    <div
      data-slot="sidebar-gap"
      class={cn(
        'relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear',
        'group-data-[collapsible=offcanvas]:w-0',
        'group-data-[side=right]:rotate-180',
        variant === 'floating' || variant === 'inset'
          ? 'group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)_+_(--spacing(4)))]'
          : 'group-data-[collapsible=icon]:w-(--sidebar-width-icon)'
      )}
    ></div>
    <div
      bind:this={panel}
      id="primary-navigator-pane"
      ontransitionend={handleTransitionEnd}
      ontransitioncancel={handleTransitionEnd}
      data-slot="sidebar-container"
      data-side={side}
      class={cn(
        'border-sidebar-border fixed inset-y-0 z-10 hidden h-dvh w-(--sidebar-width) transition-[left,right,width] duration-200 ease-linear data-[side=left]:start-0 data-[side=left]:group-data-[collapsible=offcanvas]:start-[calc(var(--sidebar-width)_*_-1)] data-[side=right]:end-0 data-[side=right]:group-data-[collapsible=offcanvas]:end-[calc(var(--sidebar-width)_*_-1)] md:flex',
        // Adjust the padding for floating and inset variants.
        variant === 'floating' || variant === 'inset'
          ? 'p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)_+_(--spacing(4))_+_2px)]'
          : 'group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[side=left]:border-e group-data-[side=right]:border-s',
        className
      )}
      {...restProps}
    >
      <div
        data-sidebar="sidebar"
        data-slot="sidebar-inner"
        class="bg-sidebar group-data-[variant=floating]:ring-sidebar-border flex size-full flex-col overflow-y-auto group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:shadow-sm group-data-[variant=floating]:ring-1"
      >
        {@render children?.()}
      </div>
    </div>
  </div>
{/if}
