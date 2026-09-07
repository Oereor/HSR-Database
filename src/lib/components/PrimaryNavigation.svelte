<script lang="ts">
  import { m } from '$lib/paraglide/messages.js';
  import { getNavigationIconUrl } from '$lib/data/visual-assets';
  import { isNavigationItemActive, localizedNavigationItems } from '$lib/navigation';

  export let pathname: string;
  export let compact = false;
  export let onSelect: (() => void) | undefined = undefined;
  const navigationItems = localizedNavigationItems();
</script>

<nav
  class:primary-navigation--compact={compact}
  class="primary-navigation"
  aria-label={m.navigation_primary_aria()}
>
  {#each navigationItems as item}
    {@const active = isNavigationItemActive(pathname, item)}
    {@const iconUrl = getNavigationIconUrl(item.iconKey)}
    <a
      href={item.href}
      class:active
      aria-label={compact ? item.label : undefined}
      aria-current={active ? 'page' : undefined}
      on:click={() => onSelect?.()}
    >
      <span class="primary-navigation__icon" aria-hidden="true">
        {#if iconUrl}
          <img src={iconUrl} alt="" />
        {:else}
          <span class="primary-navigation__fallback">{item.fallback}</span>
        {/if}
      </span>
      {#if !compact}<span class="primary-navigation__label">{item.label}</span>{/if}
      {#if compact}<span class="primary-navigation__tooltip" role="tooltip">{item.label}</span>{/if}
    </a>
  {/each}
</nav>
