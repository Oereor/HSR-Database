<script lang="ts">
  import * as Sidebar from '$lib/components/ui/sidebar';
  import * as Breadcrumb from '$lib/components/ui/breadcrumb';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import type { BreadcrumbItem } from '$lib/breadcrumbs';
  import { m } from '$lib/paraglide/messages.js';
  export let items: BreadcrumbItem[];
</script>

<div class="global-breadcrumb">
  <div class="site-container flex min-w-0 items-center gap-3">
    <Sidebar.Trigger />
    <span class="border-sidebar-border h-4 shrink-0 border-l" aria-hidden="true"></span>
    <Breadcrumb.Root aria-label={m.breadcrumb_aria()} class="min-w-0 flex-1">
      <Breadcrumb.List class="flex-nowrap overflow-hidden text-xs sm:text-sm">
        {#each items as item, index}
          {#if index}<Breadcrumb.Separator />{/if}
          <Breadcrumb.Item
            class={index === items.length - 1 ? 'min-w-16 flex-1' : 'min-w-0 shrink'}
          >
            <Tooltip.Root>
              <Tooltip.Trigger>
                {#snippet child({ props })}
                  {@const attrs = { ...props, type: undefined, disabled: undefined }}
                  {#if item.href}
                    <Breadcrumb.Link
                      {...attrs}
                      href={item.href}
                      class="block max-w-24 truncate sm:max-w-52">{item.label}</Breadcrumb.Link
                    >
                  {:else}
                    <Breadcrumb.Page {...attrs} tabindex={undefined} class="block truncate"
                      >{item.label}</Breadcrumb.Page
                    >
                  {/if}
                {/snippet}
              </Tooltip.Trigger>
              <Tooltip.Content side="bottom">{item.label}</Tooltip.Content>
            </Tooltip.Root>
          </Breadcrumb.Item>
        {/each}
      </Breadcrumb.List>
    </Breadcrumb.Root>
  </div>
</div>

<style>
  .global-breadcrumb {
    position: sticky;
    top: 0;
    z-index: 18;
    display: flex;
    align-items: center;
    height: var(--breadcrumb-height);
    min-width: 0;
    padding-top: env(safe-area-inset-top);
    flex-shrink: 0;
    border-bottom: 1px solid var(--border);
    background: var(--background);
  }
</style>
