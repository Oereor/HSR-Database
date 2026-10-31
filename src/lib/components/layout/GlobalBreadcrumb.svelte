<script lang="ts">
  import * as Breadcrumb from '$lib/components/ui/breadcrumb';
  import type { BreadcrumbItem } from '$lib/breadcrumbs';
  import { m } from '$lib/paraglide/messages.js';
  export let items: BreadcrumbItem[];
</script>

<div class="global-breadcrumb">
  <Breadcrumb.Root aria-label={m.breadcrumb_aria()} class="w-full min-w-0">
    <Breadcrumb.List class="flex-nowrap overflow-hidden text-xs sm:text-sm">
      {#each items as item, index}
        {#if index}<Breadcrumb.Separator />{/if}
        <Breadcrumb.Item class={index === items.length - 1 ? 'min-w-16 flex-1' : 'min-w-0 shrink'}>
          {#if item.href}
            <Breadcrumb.Link
              href={item.href}
              title={item.label}
              class="block max-w-24 truncate sm:max-w-52">{item.label}</Breadcrumb.Link
            >
          {:else}
            <Breadcrumb.Page title={item.label} class="block truncate">{item.label}</Breadcrumb.Page
            >
          {/if}
        </Breadcrumb.Item>
      {/each}
    </Breadcrumb.List>
  </Breadcrumb.Root>
</div>

<style>
  .global-breadcrumb {
    position: sticky;
    top: var(--site-header-height);
    z-index: 18;
    display: flex;
    align-items: center;
    height: var(--breadcrumb-height);
    min-width: 0;
    border-bottom: 1px solid var(--border);
    background: color-mix(in srgb, var(--background) 94%, transparent);
    padding-inline: max(var(--space-4), calc((100% - 1440px) / 2));
    backdrop-filter: blur(16px);
  }
</style>
