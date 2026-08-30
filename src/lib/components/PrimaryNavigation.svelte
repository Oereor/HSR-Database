<script lang="ts">
  import { getNavigationIconUrl } from '$lib/data/visual-assets';
  import { isNavigationItemActive, NAVIGATION_ITEMS } from '$lib/navigation';

  export let pathname: string;
  export let compact = false;
  export let onSelect: (() => void) | undefined = undefined;
</script>

<nav class:primary-navigation--compact={compact} class="primary-navigation" aria-label="主导航">
  {#each NAVIGATION_ITEMS as item}
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
