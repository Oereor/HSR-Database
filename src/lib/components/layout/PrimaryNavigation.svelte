<script lang="ts">
  import AssetImage from '$lib/components/shared/AssetImage.svelte';
  import * as Sidebar from '$lib/components/ui/sidebar';
  import { m } from '$lib/paraglide/messages.js';
  import { getNavigationIconUrl } from '$lib/data/visual-assets';
  import { isNavigationItemActive, localizedNavigationItems } from '$lib/navigation';
  export let pathname: string;
  export let onSelect: (() => void) | undefined = undefined;
  const navigationItems = localizedNavigationItems();
</script>

<nav class="primary-navigation" aria-label={m.navigation_primary_aria()}>
  <Sidebar.Menu>
    {#each navigationItems as item}
      {@const active = isNavigationItemActive(pathname, item)}
      <Sidebar.MenuItem>
        <Sidebar.MenuButton size="lg" isActive={active} tooltipContent={item.label}>
          {#snippet child({ props })}
            <a
              {...props}
              href={item.href}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              onclick={() => onSelect?.()}
            >
              <span
                class="primary-navigation__icon size-7 shrink-0 [&_.navigation-image-fallback]:size-full [&_img]:size-full [&_img]:object-contain"
                aria-hidden="true"
                ><AssetImage
                  src={getNavigationIconUrl(item.iconKey)}
                  alt=""
                  fallbackClass="navigation-image-fallback"
                /></span
              >
              <span class="group-data-[collapsible=icon]:hidden">{item.label}</span>
            </a>
          {/snippet}
        </Sidebar.MenuButton>
      </Sidebar.MenuItem>
    {/each}
  </Sidebar.Menu>
</nav>
